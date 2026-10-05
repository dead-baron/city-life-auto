// Art v2 renderer: lights a G-buffer scene (gbuf.js) on the GPU, the HD-2D way.
//
//   lit pass   albedo x (sky/ground ambient + sun with cast shadows + point lights) + glow
//              - cast shadows: march from each pixel toward the sun through the height map
//              - light bands: direct light is quantised to a few steps with an ordered dither, so the
//                lighting looks hand-shaded rather than smooth
//              - wet ground darkens in the rain
//   bloom      bright parts and every glow, blurred at quarter size and added back
//   final      reflections of lights in wet ground (streaky, like the rainy-night target), haze,
//              colour grade, vignette; the pixel art is sampled nearest so pixels stay crisp
//
//   const L = new Lighter(canvas);  L.setScene(gbuf);  L.render(preset, lights, time)
// A preset is a plain object (see PRESETS below). Lights: [{x, y, z, r, col:[r,g,b], k}] where x, y
// are world ground coordinates (screen x, screen y of the light's base) and z its height.
import { F_GROUND, F_WATER, F_NOCAST, F_WET, F_LEAF, F_GLASS } from './gbuf.js';

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const MAXL = 64;
const LIT_FS = `#version 300 es
precision highp float; precision highp int;
in vec2 uv;
layout(location=0) out vec4 o0;   // lit colour
layout(location=1) out vec4 o1;   // bright (bloom source)
uniform sampler2D tCol, tNrm, tZ, tEmi;
uniform vec2 size;
uniform vec3 sunDir, sunCol, ambSky, ambGround, shadowTint;
uniform float shadowLen, bands, bandMix, wet, emiK, bloomThr, time, leafGlow;
uniform int nL;
uniform vec4 lPos[${MAXL}];  // x, y (ground), z (height), radius
uniform vec4 lCol[${MAXL}];  // rgb, intensity
float zAt(ivec2 q){ vec4 t = texelFetch(tZ, q, 0); return (t.r * 255.0 + t.g * 255.0 * 256.0); }
int flagAt(ivec2 q){ return int(texelFetch(tZ, q, 0).b * 255.0 + 0.5); }
float bayer4(ivec2 q){ int i = (q.y & 3) * 4 + (q.x & 3);
  int b[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return float(b[i]) / 16.0 - 0.5 + 1.0/32.0; }
void main(){
  ivec2 q = ivec2(uv * size);
  vec4 c = texelFetch(tCol, q, 0);
  if (c.a < 0.01) { o0 = vec4(0.0); o1 = vec4(0.0); return; }
  vec3 alb = pow(c.rgb, vec3(2.2));
  vec4 nn = texelFetch(tNrm, q, 0);
  vec3 n = nn.a > 0.5 ? normalize(nn.rgb * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
  float Z = zAt(q);
  int fl = flagAt(q);
  bool ground = (fl & ${F_GROUND}) != 0;
  vec3 P = vec3(float(q.x) + 0.5, float(q.y) + 0.5 + Z, Z);    // world position of this pixel
  // --- sun and its shadow
  float lam = max(dot(n, sunDir), 0.0);
  float sh = 1.0;
  if (lam > 0.0 && sunDir.z > 0.02) {
   float occSum = 0.0;
   vec3 side = normalize(vec3(-sunDir.y, sunDir.x, 0.0));
   for (int ray = 0; ray < 3; ray++) {
    vec3 dir = normalize(sunDir + side * (float(ray) - 1.0) * 0.035 + vec3(0.0, 0.0, (float(ray) - 1.0) * 0.02));
    float t = 1.5 + float(ray) * 0.33, occ = 0.0;
    for (int i = 0; i < 110; i++) {
      vec3 R = P + dir * t;
      ivec2 s = ivec2(int(floor(R.x)), int(floor(R.y - R.z)));
      if (s.x < 0 || s.y < 0 || s.x >= int(size.x) || s.y >= int(size.y)) break;
      if (R.z > 600.0) break;
      vec4 cz = texelFetch(tZ, s, 0);
      if (cz.a > 0.5) {
        float hz = cz.r * 255.0 + cz.g * 65280.0;
        int f2 = int(cz.b * 255.0 + 0.5);
        if ((f2 & ${F_NOCAST}) == 0 && hz > R.z + 1.5 && hz - R.z < 140.0) {
          // leaves let some light through
          occ = max(occ, (f2 & ${F_LEAF}) != 0 ? 0.75 : 1.0);
          if (occ >= 1.0) break;
        }
      }
      t += 0.8 + t * 0.018;
      if (t > shadowLen) break;
    }
    occSum += occ;
   }
    sh = 1.0 - occSum / 3.0;
  }
  float direct = lam * sh;
  // hand-shaded look: quantise the direct light into bands with an ordered dither
  if (bands > 0.5) { float qd = floor(direct * bands + 0.5 + bayer4(q) * 0.6) / bands; direct = mix(direct, clamp(qd, 0.0, 1.0), bandMix); }
  vec3 amb = mix(ambGround, ambSky, n.z * 0.5 + 0.5);
  // shadowed surfaces take the shadow tint (blue-violet at golden hour)
  amb = mix(amb, amb * shadowTint, (1.0 - sh) * step(0.01, lam));
  vec3 light = amb + sunCol * direct;
  // golden hour: light through the edges of leaves
  if ((fl & ${F_LEAF}) != 0) light += sunCol * leafGlow * pow(max(dot(-n.xy, -sunDir.xy), 0.0), 2.0) * sh;
  // --- point lights
  for (int i = 0; i < ${MAXL}; i++) {
    if (i >= nL) break;
    vec3 Lp = vec3(lPos[i].x, lPos[i].y, lPos[i].z);
    vec3 v = Lp - P;
    float d = length(v);
    float r = lPos[i].w;
    if (d > r) continue;
    float a = 1.0 - d / r; a *= a;
    float w = max(dot(n, v / max(d, 0.001)), 0.0) * 0.8 + 0.2;
    light += lCol[i].rgb * lCol[i].a * a * w;
  }
  // wet ground mirrors each light as a long wobbling streak running down the screen from its base
  vec3 refl = vec3(0.0);
  if (ground && wet > 0.0) {
    for (int i = 0; i < ${MAXL}; i++) {
      if (i >= nL) break;
      float dx = P.x - lPos[i].x, dy = P.y - lPos[i].y;
      float len = 30.0 + lPos[i].z * 1.4;
      if (dy < -4.0 || dy > len) continue;
      float wob = sin(P.y * 0.55 + lPos[i].x) * 1.2 + sin(P.y * 1.7) * 0.6;
      float wdt = 2.0 + max(dy, 0.0) * 0.05 + lPos[i].w * 0.012;
      float across = exp(-pow((dx - wob) / wdt, 2.0));
      if (across < 0.02) continue;
      float along = (1.0 - clamp(dy / len, 0.0, 1.0)); along *= along;
      float dash = 0.55 + 0.45 * step(0.35, fract(P.y * 0.23 + lPos[i].x * 0.13));
      refl += lCol[i].rgb * lCol[i].a * across * along * dash * 0.22;
    }
    refl *= wet;
  }
  vec3 col = alb;
  if (ground && wet > 0.0 && (fl & ${F_WATER}) == 0) col *= mix(1.0, 0.7, wet);
  vec3 lit = col * light;
  vec4 e = texelFetch(tEmi, q, 0);
  vec3 glow = pow(e.rgb, vec3(2.2)) * e.a * emiK;
  // glass reflects a little sky
  if ((fl & ${F_GLASS}) != 0) lit += ambSky * 0.12;
  lit += glow + refl;
  // filmic-ish curve back to display
  vec3 m = lit / (1.0 + lit * 0.18);
  o0 = vec4(pow(m, vec3(1.0 / 2.2)), 1.0);
  float lum = dot(m, vec3(0.3, 0.55, 0.15));
  o1 = vec4(pow(glow, vec3(1.0 / 2.2)) + max(pow(m, vec3(1.0/2.2)) - bloomThr, 0.0) * 0.6, 1.0);
  o1.a = (fl & ${F_GROUND}) != 0 ? 1.0 : 0.5;
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec2 dir;
void main(){
  vec4 s = texture(src, uv) * 0.227;
  s += texture(src, uv + dir * 1.385) * 0.316; s += texture(src, uv - dir * 1.385) * 0.316;
  s += texture(src, uv + dir * 3.231) * 0.070; s += texture(src, uv - dir * 3.231) * 0.070;
  o = s;
}`;

const FINAL_FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D tLit, tBloom, tBloom2, tBright, tZ;
uniform vec2 size;
uniform float bloomK, wet, haze, vign, sat, contrast, time, reflK;
uniform vec3 hazeCol, lift, gain;
void main(){
  vec2 suv = vec2(uv.x, 1.0 - uv.y);      // screen space, y down
  vec2 pix = suv * size;
  ivec2 q = ivec2(pix);
  vec3 c = texelFetch(tLit, q, 0).rgb;
  vec4 zt = texelFetch(tZ, q, 0);
  int fl = int(zt.b * 255.0 + 0.5);
  // reflections in wet ground: what's above this pixel on screen, mirrored down, streaky
  if (wet > 0.0 && (fl & ${F_GROUND}) != 0) {
    vec3 r = vec3(0.0); float wsum = 0.0;
    float wob = sin(pix.y * 0.9 + time * 3.0) * 0.6 + sin(pix.y * 2.3) * 0.4;
    for (int k = 1; k <= 28; k++) {
      float dy = float(k) * 2.0;
      vec2 s = vec2(pix.x + wob * float(k) * 0.05, pix.y - dy);
      if (s.y < 0.0) break;
      ivec2 sq = ivec2(s);
      vec4 sz = texelFetch(tZ, sq, 0);
      // only things standing up (not other ground) reflect
      if ((int(sz.b * 255.0 + 0.5) & ${F_GROUND}) != 0) continue;
      vec3 b = texelFetch(tBright, sq / 2, 0).rgb * 1.6 + texelFetch(tLit, sq, 0).rgb * 0.18;
      float w = 1.0 - float(k) / 29.0;
      r += b * w; wsum += w;
    }
    if (wsum > 0.0) c += r / wsum * wet * reflK;
  }
  vec3 bl = texture(tBloom, suv).rgb * 0.6 + texture(tBloom2, suv).rgb * 0.8;
  c += bl * bloomK;
  // haze, a little stronger toward the top of the screen (farther away)
  c = mix(c, hazeCol, haze * (0.65 + 0.35 * (1.0 - suv.y)));
  // grade
  c = c * gain + lift;
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(vec3(l), c, sat);
  c = (c - 0.5) * contrast + 0.5;
  // vignette
  vec2 dv = uv - 0.5; c *= 1.0 - vign * dot(dv, dv) * 1.6;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export const PRESETS = {
  golden: {
    sunDir: [-0.72, -0.24, 0.46], sunCol: [1.72, 1.3, 0.62], ambSky: [0.24, 0.34, 0.5], ambGround: [0.3, 0.26, 0.2],
    shadowTint: [0.74, 0.96, 1.12], shadowLen: 300, bands: 5, bandMix: 0.85, wet: 0, emiK: 1.0, bloomThr: 0.78, leafGlow: 0.55,
    bloomK: 0.9, haze: 0.07, hazeCol: [1.0, 0.66, 0.34], vign: 0.6, sat: 1.22, contrast: 1.1, lift: [0.015, 0.0, 0.025], gain: [1.08, 0.97, 0.86], reflK: 0.0, lampsOn: 0.6,
  },
  noon: {
    sunDir: [-0.42, -0.3, 0.86], sunCol: [1.4, 1.34, 1.2], ambSky: [0.48, 0.56, 0.74], ambGround: [0.44, 0.42, 0.38],
    shadowTint: [0.85, 0.9, 1.15], shadowLen: 120, bands: 5, bandMix: 0.85, wet: 0, emiK: 0.25, bloomThr: 0.9, leafGlow: 0.1,
    bloomK: 0.3, haze: 0.02, hazeCol: [0.8, 0.88, 1.0], vign: 0.25, sat: 1.22, contrast: 1.1, lift: [0, 0, 0.0], gain: [1.04, 1.03, 1.0], reflK: 0, lampsOn: 0,
  },
  night: {
    sunDir: [-0.5, -0.3, 0.8], sunCol: [0.04, 0.05, 0.1], ambSky: [0.06, 0.08, 0.17], ambGround: [0.05, 0.05, 0.1],
    shadowTint: [1, 1, 1], shadowLen: 0, bands: 0, bandMix: 0, wet: 0, emiK: 1.05, bloomThr: 0.55, leafGlow: 0,
    bloomK: 1.1, haze: 0.06, hazeCol: [0.08, 0.1, 0.22], vign: 0.7, sat: 1.15, contrast: 1.08, lift: [0.0, 0.0, 0.03], gain: [1.04, 0.98, 1.02], reflK: 0, lampsOn: 1,
  },
  rain: {
    sunDir: [-0.5, -0.3, 0.8], sunCol: [0.04, 0.05, 0.1], ambSky: [0.06, 0.08, 0.18], ambGround: [0.05, 0.05, 0.11],
    shadowTint: [1, 1, 1], shadowLen: 0, bands: 0, bandMix: 0, wet: 0.9, emiK: 1.05, bloomThr: 0.55, leafGlow: 0,
    bloomK: 1.1, haze: 0.06, hazeCol: [0.08, 0.1, 0.22], vign: 0.7, sat: 1.15, contrast: 1.08, lift: [0.0, 0.0, 0.03], gain: [1.04, 0.98, 1.02], reflK: 1.1, lampsOn: 1, rain: 1,
  },
};

export class Lighter {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl; this.cv = canvas;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = (fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
    this.pLit = prog(LIT_FS); this.pBlur = prog(BLUR_FS); this.pFinal = prog(FINAL_FS);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.loc = new Map();
  }
  u(p, name) { const k = p === this.pLit ? 'L' + name : p === this.pBlur ? 'B' + name : 'F' + name; let l = this.loc.get(k); if (l === undefined) { l = this.gl.getUniformLocation(p, name); this.loc.set(k, l); } return l; }
  tex(w, h, data, filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  fbo(texs) {
    const gl = this.gl, f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    return f;
  }
  // upload the scene's maps (call again whenever the scene changes)
  setScene(G) {
    const gl = this.gl, { w, h } = G;
    this.W = w; this.H = h;
    // texel row = screen row everywhere; only the final pass flips onto the canvas
    const flip = (src) => new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
    const zt = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { zt[i * 4] = G.z[i] & 255; zt[i * 4 + 1] = G.z[i] >> 8; zt[i * 4 + 2] = G.flag[i]; zt[i * 4 + 3] = G.col[i * 4 + 3]; }
    const N = gl.NEAREST, LN = gl.LINEAR;
    this.tCol = this.tex(w, h, flip(G.col), N); this.tNrm = this.tex(w, h, flip(G.nrm), N);
    this.tZ = this.tex(w, h, flip(zt), N); this.tEmi = this.tex(w, h, flip(G.emi), N);
    this.tLit = this.tex(w, h, null, N); this.tBright = this.tex(w, h, null, LN);
    this.fLit = this.fbo([this.tLit, this.tBright]);
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2), qw = Math.ceil(w / 4), qh = Math.ceil(h / 4);
    this.tH1 = this.tex(hw, hh, null, LN); this.tH2 = this.tex(hw, hh, null, LN);
    this.tQ1 = this.tex(qw, qh, null, LN); this.tQ2 = this.tex(qw, qh, null, LN);
    this.fH1 = this.fbo([this.tH1]); this.fH2 = this.fbo([this.tH2]); this.fQ1 = this.fbo([this.tQ1]); this.fQ2 = this.fbo([this.tQ2]);
    this.hw = hw; this.hh = hh; this.qw = qw; this.qh = qh;
  }
  bindTex(p, name, t, unit) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(this.u(p, name), unit); }
  blur(srcTex, f1, t1, f2, t2, w, h) {
    const gl = this.gl, p = this.pBlur;
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f1); gl.viewport(0, 0, w, h);
    this.bindTex(p, 'src', srcTex, 0); gl.uniform2f(this.u(p, 'dir'), 1 / w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f2);
    this.bindTex(p, 'src', t1, 0); gl.uniform2f(this.u(p, 'dir'), 0, 1 / h); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  render(P, lights = [], time = 0) {
    const gl = this.gl, { W, H } = this;
    gl.bindVertexArray(this.vao);
    // lit
    let p = this.pLit; gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fLit); gl.viewport(0, 0, W, H);
    this.bindTex(p, 'tCol', this.tCol, 0); this.bindTex(p, 'tNrm', this.tNrm, 1); this.bindTex(p, 'tZ', this.tZ, 2); this.bindTex(p, 'tEmi', this.tEmi, 3);
    const sd = P.sunDir, l = Math.hypot(...sd);
    gl.uniform2f(this.u(p, 'size'), W, H);
    gl.uniform3f(this.u(p, 'sunDir'), sd[0] / l, sd[1] / l, sd[2] / l);
    gl.uniform3fv(this.u(p, 'sunCol'), P.sunCol); gl.uniform3fv(this.u(p, 'ambSky'), P.ambSky); gl.uniform3fv(this.u(p, 'ambGround'), P.ambGround); gl.uniform3fv(this.u(p, 'shadowTint'), P.shadowTint);
    for (const k of ['shadowLen', 'bands', 'bandMix', 'wet', 'emiK', 'bloomThr', 'leafGlow']) gl.uniform1f(this.u(p, k), P[k]);
    gl.uniform1f(this.u(p, 'time'), time);
    const n = Math.min(MAXL, lights.length), pos = new Float32Array(MAXL * 4), col = new Float32Array(MAXL * 4);
    for (let i = 0; i < n; i++) { const L = lights[i]; pos.set([L.x, L.y, L.z, L.r], i * 4); col.set([L.col[0], L.col[1], L.col[2], L.k], i * 4); }
    gl.uniform1i(this.u(p, 'nL'), n); gl.uniform4fv(this.u(p, 'lPos'), pos); gl.uniform4fv(this.u(p, 'lCol'), col);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // bloom: bright -> half -> blur ; -> quarter -> blur
    this.blur(this.tBright, this.fH1, this.tH1, this.fH2, this.tH2, this.hw, this.hh);
    this.blur(this.tH2, this.fQ1, this.tQ1, this.fQ2, this.tQ2, this.qw, this.qh);
    this.blur(this.tQ2, this.fQ1, this.tQ1, this.fQ2, this.tQ2, this.qw, this.qh);
    // final
    p = this.pFinal; gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.cv.width, this.cv.height);
    this.bindTex(p, 'tLit', this.tLit, 0); this.bindTex(p, 'tBloom', this.tH2, 1); this.bindTex(p, 'tBloom2', this.tQ2, 2); this.bindTex(p, 'tBright', this.tH2, 3); this.bindTex(p, 'tZ', this.tZ, 4);
    gl.uniform2f(this.u(p, 'size'), W, H);
    for (const k of ['bloomK', 'wet', 'haze', 'vign', 'sat', 'contrast', 'reflK']) gl.uniform1f(this.u(p, k), P[k]);
    gl.uniform1f(this.u(p, 'time'), time);
    gl.uniform3fv(this.u(p, 'hazeCol'), P.hazeCol); gl.uniform3fv(this.u(p, 'lift'), P.lift); gl.uniform3fv(this.u(p, 'gain'), P.gain);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
