// Art v2 in the game: the WebGL2 world renderer (GPU engine). It composes the frame's G-buffer from
// static chunk textures and sprite atlases with a per-pixel depth test on height, lights it with the
// game-mode Lighter (lightgame.js) and presents it to the canvas at zoom * DPR with sharp sampling.
// Contract: docs/art-v2/GAME-RENDERER.md ("Frame", "Quality tiers").
//
// ---- Engine implementation notes ---------------------------------------------------------------------
// API (as specified, plus a few extras marked +):
//   Art2Engine.create(canvas, {quality 0..3, lowMem, profile+}) -> engine | null (no WebGL2 / MRT / limits)
//   setQuality(q)  resize(cssW, cssH, dpr)  onContextLost(cb)  stats()  dispose()
//   hasChunk(cx, cy) (true only for baked chunks)  uploadChunk(cx, cy, g)  setChunkFallback(cx, cy, src)
//   dropChunk(cx, cy)  chunkKeys() ('cx,cy' of every resident chunk, baked or fallback)
//   +hasFallback(cx, cy)  +reserveChunks(n) (at least n slots: the cap grows to fit the view, up to 32)
//   +chunkCap() (the slots it will keep now)
//   hasSprite(key)  uploadSprite(key, g) -> bool  uploadSpriteFromCanvas(key, canvas, ax, ay, opts) -> bool
//   +dropSprite(key)  +spriteInfo(key) -> {w, h, ax, ay} (read only)
//   - uploadChunk g.under (optional RGBA8, 768^2): the chunk before its buildings (rgb) + the local number of
//     the building on top (alpha), g.blds [[building index, ...]] per local number; beginFrame f.fades: a Map
//     building index -> 0..1 fades those whole buildings (smoothly; past half way they stop hiding what is
//     behind them).
//   beginFrame(f) -> bool  drawSprite(key, x, y, z0, o) -> bool  drawDecal(key, x, y, angle, alpha, +z0)
//   addLight(L)  endFrame()
//   - uploadChunk / uploadSprite also take pre-packed planes {w, h, ax, ay, p0, p1, p2} (gbuf.js packGBuf,
//     e.g. packed in a worker); a plain GBuf is packed on the main thread (~10-15 ms per chunk).
//   - setChunkFallback is a no-op when the chunk is baked or already shows that same source object
//     (call it every frame until the bake lands; dropChunk first to force a refresh of a redrawn canvas).
//   - drawSprite returns false when the sprite is not resident (upload it, draw next frame) and snaps the
//     sprite to whole world px. o.alpha < 1 is an ordered-dither fade (a G-buffer cannot blend).
//   - o.shadow === false stops the sprite casting a shadow; o.flash whitens it and adds glow.
//   - f.wet / f.flash / f.fog (optional) raise the preset's wet, lightning flash and fog.
//   - onContextLost(cb): cb('lost') on loss, cb('restored') once rebuilt (every chunk and sprite must be
//     uploaded again: has* return false), cb('failed') if the rebuild fails.
//   - The WebGL2 context also asks for depth: false, stencil: false (the engine owns its depth buffer).
// Packing (gbuf.js packGBuf): three RGBA8 planes per texel, 12 bytes instead of 15:
//   A [albedo rgb, coverage]  B [z lo, z hi, flags, octahedral normal x]  C [emissive rgb premultiplied by
//   strength^(1/2.2), octahedral normal y]. Height and flags share one texel, so the shadow march does one
//   fetch per step. The frame's scene buffer uses the same three planes (+ a 16-bit depth buffer).
// Depth: gl_FragDepth = 1 - h / 4096 (16-bit depth) with LEQUAL, so taller is nearer and later draws win
//   ties. Ground texels (F_GROUND) sink 4 px for the test only, so feet at z0 = 0 stand on 3 px kerbs and
//   sidewalks (grass tufts taller than 4 px still cover feet). Decals test at 3.5 px over z0 (so only the
//   ground takes them) and blend into albedo only.
// Memory (GPU; RGBA8 everywhere, no float targets, no extensions required):
//   chunk slot 768^2 x 12 B = 6.75 MiB (slots are created on demand up to the tier cap and reused, never
//   re-allocated); atlas page 1024^2 x 12 B = 12 MiB (three TEXTURE_2D_ARRAYs allocated per tier);
//   frame ~21 B per scene texel (scene 12 + depth 2 + lit 4 + half/quarter bloom, shafts, light tiles ~3),
//   allocated on the first frame and grown in 128 px steps only when the view needs more.
//   A baked chunk also keeps its "under" layer (the chunk before its buildings, RGBA8 2.25 MiB) for the
//   building fades: 9 MiB a slot. Caches at the cap: Low 12 chunks + 4 pages = 108 + 48 MiB; Medium 14 + 6 =
//   126 + 72; High 18 + 8 = 162 + 96; Ultra 26 + 10 = 234 + 120. lowMem: 10 chunks + 4 pages = 90 + 48.
//   The host reserves as many slots as the view needs (zoomed out driving on a 1080p screen: up to 15), so
//   the cap only grows past these when the view itself is bigger. Frame: ~27 MiB for 1280x720 or a phone
//   (1.1-1.3 M texels), ~52 MiB at 1080p, ~94 MiB at 1440p zoomed out to 1.5x.
// Sprite atlas: shelf packing (heights rounded to 4 px) on 1024 px pages; when full it evicts the least
//   recently drawn shelf that fits (then the least recently drawn page), never one drawn this frame;
//   evicted keys report hasSprite() false. Sprites larger than 1024 px are refused.
// Frame: beginFrame snaps the camera to whole texels and sizes the scene: the view + 2 px, plus margins
//   on the side the sun is (the shadow reach of the tier: 300 High/Ultra, 200 Medium, 36 Low), 64 px on
//   top when wet (reflections), 8 px elsewhere. endFrame: clear -> static chunks (one draw each) ->
//   decals (instanced, albedo only) -> sprites (one instanced draw, depth tested and written) -> lights
//   (culled to the scene, best k*r kept up to the tier's 16/32/64/96, uniform buffer, binned into 64 px
//   tiles so a pixel only visits the lights that reach it) -> lit (Low: lights at half size, composed per
//   texel with a height-aware pick) -> bloom -> god rays -> final (into the scene's albedo plane) ->
//   present -> x-ray silhouettes on top. See lightgame.js for the lighting itself.
// Present: t = pixel / (zoom * DPR) + offset (the camera's fractional part). Scale 0.92-1.1 or a whole
//   number: nearest, offset snapped to device px (crisp); other scales >= 1: sharp bilinear (1 device px
//   edge blend, even texel sizes, so no shimmer at 1.26, 1.44 or 2.52); scale < 0.92 (phones at 0.72 and
//   DPR 1, zoomed out): 4-tap area filter. Vignette here. presentMode (0 / 1 / 2) overrides, for tests.
// Cost (SwiftShader in headless Chromium, 1280x720, ~1.2 M scene texels; CPU time of the GPU process per
//   frame, tools/art2/engine-test.html): Low 0.7-0.9 s, Medium 1.3-2.4 s, High 1.2-3.0 s, Ultra 1.4-6.7 s
//   (the 3 x 110 step sun march at golden hour). The lit pass is 50-75 % of a frame (the march by day, the
//   lights at night), final 15-35 % when wet (mirror march) or foggy, static + present + bloom ~10 %,
//   sprites and decals < 1 %. A real GPU is ~1000x faster.
// Integration notes: sprites snap to whole world px while the camera scrolls with sub-texel precision, so
//   pass camX/camY as the player's rounded position (+ the smooth look-ahead) to keep the player steady.
//   Decals on decks need z0. Lights are world px; static lights from chunks must be added each frame.
import { F_GROUND, packGBuf, octEncode, OCT_MID } from '../gbuf.js';
import { LightGame, LIGHT_TIERS, MAX_LIGHTS, LIGHT_FLOATS, PRESETS_GAME, PRESET_DEFAULTS, blendPresets, glProgram, glTex, glFbo, TRI_VS, GLSL_COMMON } from './lightgame.js';
export { PRESETS_GAME, PRESET_DEFAULTS, blendPresets, LIGHT_TIERS };

export const CHUNK_PX = 768;
export const ATLAS_PX = 1024;
// cache budgets per quality (GAME-RENDERER.md "Quality tiers"); lighting settings live in LIGHT_TIERS
export const QUALITY = [
  { name: 'Low', chunks: 12, pages: 4 },
  { name: 'Medium', chunks: 14, pages: 6 },
  { name: 'High', chunks: 18, pages: 8 },
  { name: 'Ultra', chunks: 26, pages: 10 },
];
const HMAX = 4096, GSINK = 4, DECAL_H = 3.5, FL = 16;
const EMPTY = Object.freeze({});
const Z4 = new Float32Array(4), ONE = new Float32Array([1]), CLR = new Float32Array(4);
const CAM_OCT = octEncode(0, 0.55, 0.835);           // an upright card facing the camera
const ckey = (cx, cy) => (cy + 32768) * 65536 + (cx + 32768);
const clampQ = (q) => Math.max(0, Math.min(3, Math.round(+q || 0)));
const ema = (a, v) => (a ? a * 0.9 + v * 0.1 : v);
const r16 = (v) => Math.ceil(Math.max(0, v) / 16) * 16;

// ---- shaders -------------------------------------------------------------------------------------------
const HDR = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler2DArray;
`;
const STATIC_VS = `#version 300 es
in vec2 c;
uniform vec4 uRect; uniform vec2 uScene;
void main(){ vec2 p = uRect.xy + c * uRect.zw; gl_Position = vec4(p / uScene * 2.0 - 1.0, 0.0, 1.0); }`;
// a chunk texel copied into the scene, depth from its height
// Fading whole buildings: a chunk's under layer holds the chunk before its buildings (rgb) and, in alpha, the
// local number of the building on top at each texel. uFade[k] (0..1) fades building k toward the under layer:
// the colour blends smoothly; past half way the texel also takes the ground's height and normal, so people
// and cars behind it draw over it (the host eases each building in and out round the player).
const STATIC_FS = HDR + `
uniform sampler2D t0, t1, t2, t3; uniform vec2 uOff; uniform float uFadeOn; uniform float uFade[64];
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1; layout(location=2) out vec4 o2;
${GLSL_COMMON}
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy - uOff);
  vec4 a = texelFetch(t0, q, 0);
  if (a.a < 0.5) discard;
  vec4 b = texelFetch(t1, q, 0), c = texelFetch(t2, q, 0);
  float h = zOf(b);
  bool ground = (flOf(b) & ${F_GROUND}) != 0;
  if (uFadeOn > 0.5) {
    vec4 u = texelFetch(t3, q, 0);
    int k = int(u.a * 255.0 + 0.5);
    if (k > 0 && k < 64) {
      float f = uFade[k];
      if (f > 0.002) {
        a.rgb = mix(a.rgb, u.rgb, f);
        c.rgb *= 1.0 - f;
        if (f > 0.55 + bayer4(ivec2(gl_FragCoord.xy)) * 0.2) {
          gl_FragDepth = 1.0;
          o0 = vec4(a.rgb, 1.0); o1 = vec4(0.0, 0.0, ${(F_GROUND | 8) / 255}, ${OCT_MID / 255}); o2 = vec4(c.rgb, ${OCT_MID / 255});
          return;
        }
      }
    }
  }
  if (ground) h = max(h - ${GSINK.toFixed(1)}, 0.0);
  gl_FragDepth = 1.0 - h * ${(1 / HMAX).toFixed(8)};
  o0 = vec4(a.rgb, 1.0); o1 = b; o2 = c;
}`;
// instanced sprite quads: iDst (x, y, w, h in scene texels), iSrc (atlas x, y, layer, bits 1 flipX 2 no
// shadow), iPar (z0, alpha, flash, 0), iTint (r, g, b, 0)
const SPRITE_VS = `#version 300 es
in vec2 c; in vec4 iDst; in vec4 iSrc; in vec4 iPar; in vec4 iTint;
uniform vec2 uScene;
flat out vec4 vDst; flat out vec4 vSrc; flat out vec4 vPar; flat out vec4 vTint;
void main(){
  vDst = iDst; vSrc = iSrc; vPar = iPar; vTint = iTint;
  vec2 p = iDst.xy + c * iDst.zw;
  gl_Position = vec4(p / uScene * 2.0 - 1.0, 0.0, 1.0);
}`;
const SPRITE_FS = HDR + `
flat in vec4 vDst; flat in vec4 vSrc; flat in vec4 vPar; flat in vec4 vTint;
uniform sampler2DArray tA, tB, tC; uniform ivec2 org;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1; layout(location=2) out vec4 o2;
${GLSL_COMMON}
void main(){
  ivec2 fq = ivec2(gl_FragCoord.xy), l = fq - ivec2(vDst.xy);
  int bits = int(vSrc.w + 0.5);
  if ((bits & 1) != 0) l.x = int(vDst.z + 0.5) - 1 - l.x;
  ivec3 s = ivec3(int(vSrc.x + 0.5) + l.x, int(vSrc.y + 0.5) + l.y, int(vSrc.z + 0.5));
  vec4 a = texelFetch(tA, s, 0);
  if (a.a < 0.5) discard;
  if (vPar.y < 0.999 && vPar.y < bayer4(fq + org) + 0.5) discard;
  vec4 b = texelFetch(tB, s, 0), c = texelFetch(tC, s, 0);
  float h = zOf(b) + vPar.x;
  int fl = flOf(b);
  if ((bits & 2) != 0) fl |= 4;
  float hd = (fl & ${F_GROUND}) != 0 ? max(h - ${GSINK.toFixed(1)}, 0.0) : h;
  gl_FragDepth = clamp(1.0 - hd * ${(1 / HMAX).toFixed(8)}, 0.0, 1.0);
  float H = clamp(floor(h + 0.5), 0.0, 65535.0), hi = floor(H / 256.0);
  float ox = (bits & 1) != 0 ? (254.0 - floor(b.a * 255.0 + 0.5)) / 255.0 : b.a;
  o0 = vec4(mix(a.rgb * vTint.rgb, vec3(1.0), vPar.z), 1.0);
  o1 = vec4((H - hi * 256.0) / 255.0, hi / 255.0, float(fl) / 255.0, ox);
  o2 = vec4(min(c.rgb + vec3(vPar.z * 0.85), vec3(1.0)), c.a);
}`;
// flat ground decals, rotated about their anchor: iA (anchor x, y, cos, sin), iSrc (atlas x, y, layer),
// iSz (w, h, ax, ay), iPar (alpha, z0)
const DECAL_VS = `#version 300 es
in vec2 c; in vec4 iA; in vec4 iSrc; in vec4 iSz; in vec4 iPar;
uniform vec2 uScene;
flat out vec4 vA; flat out vec4 vSrc; flat out vec4 vSz; flat out vec4 vPar;
void main(){
  vA = iA; vSrc = iSrc; vSz = iSz; vPar = iPar;
  vec2 lc = c * iSz.xy - iSz.zw, p = iA.xy + vec2(lc.x * iA.z - lc.y * iA.w, lc.x * iA.w + lc.y * iA.z);
  gl_Position = vec4(p / uScene * 2.0 - 1.0, 0.0, 1.0);
}`;
const DECAL_FS = HDR + `
flat in vec4 vA; flat in vec4 vSrc; flat in vec4 vSz; flat in vec4 vPar;
uniform sampler2DArray tA;
layout(location=0) out vec4 o0;
void main(){
  vec2 d = gl_FragCoord.xy - vA.xy, lc = vec2(d.x * vA.z + d.y * vA.w, -d.x * vA.w + d.y * vA.z) + vSz.zw;
  ivec2 l = ivec2(floor(lc));
  if (l.x < 0 || l.y < 0 || l.x >= int(vSz.x + 0.5) || l.y >= int(vSz.y + 0.5)) discard;
  vec4 a = texelFetch(tA, ivec3(int(vSrc.x + 0.5) + l.x, int(vSrc.y + 0.5) + l.y, int(vSrc.z + 0.5)), 0);
  if (a.a < 0.02) discard;
  gl_FragDepth = 1.0 - (${DECAL_H.toFixed(2)} + vPar.y) * ${(1 / HMAX).toFixed(8)};
  o0 = vec4(a.rgb, a.a * vPar.x);
}`;
// the lit scene to the canvas: nearest (integer scale), sharp bilinear (>= 1) or area (< 1), vignette
const PRESENT_FS = HDR + `
layout(location=0) out vec4 o;
uniform sampler2D tF; uniform vec2 uCanvas, uTex, uMax, uOff; uniform float uInvS, uS, uVign; uniform int uMode;
vec3 bil(vec2 t){ return texture(tF, clamp(t, vec2(0.5), uMax - 0.5) / uTex).rgb; }
void main(){
  vec2 pix = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y), t = pix * uInvS + uOff;
  vec3 c;
  if (uMode == 0) c = texelFetch(tF, ivec2(clamp(floor(t), vec2(0.0), uMax - 1.0)), 0).rgb;
  else if (uMode == 1) { vec2 base = floor(t - 0.5) + 0.5; c = bil(base + clamp((t - base - 0.5) * uS + 0.5, 0.0, 1.0)); }
  else { float d = 0.25 * uInvS; c = (bil(t + vec2(-d, -d)) + bil(t + vec2(d, -d)) + bil(t + vec2(-d, d)) + bil(t + vec2(d, d))) * 0.25; }
  vec2 sv = pix / uCanvas - 0.5;
  o = vec4(c * (1.0 - uVign * dot(sv, sv) * 1.6), 1.0);
}`;
// x-ray: the parts of a sprite hidden by something taller, drawn unlit over the presented frame
const XRAY_VS = `#version 300 es
in vec2 c; in vec4 iDst; in vec4 iSrc; in vec4 iPar; in vec4 iTint;
uniform vec2 uCanvas, uOff; uniform float uS;
flat out vec4 vDst; flat out vec4 vSrc; flat out vec4 vPar;
void main(){
  vDst = iDst; vSrc = iSrc; vPar = iPar;
  vec2 e = (iDst.xy + c * iDst.zw - uOff) * uS;
  gl_Position = vec4(e.x / uCanvas.x * 2.0 - 1.0, 1.0 - e.y / uCanvas.y * 2.0, 0.0, 1.0);
}`;
const XRAY_FS = HDR + `
flat in vec4 vDst; flat in vec4 vSrc; flat in vec4 vPar;
uniform sampler2DArray tA, tB; uniform sampler2D tS;
uniform vec2 uCanvas, uOff, uMax; uniform float uInvS; uniform vec4 uCol;
layout(location=0) out vec4 o;
${GLSL_COMMON}
ivec3 at(ivec2 l, int w, int bits){ if ((bits & 1) != 0) l.x = w - 1 - l.x; return ivec3(int(vSrc.x + 0.5) + l.x, int(vSrc.y + 0.5) + l.y, int(vSrc.z + 0.5)); }
float cov(ivec2 l, int w, int h, int bits){ return (l.x < 0 || l.y < 0 || l.x >= w || l.y >= h) ? 0.0 : texelFetch(tA, at(l, w, bits), 0).a; }
void main(){
  vec2 t = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y) * uInvS + uOff;
  ivec2 tq = ivec2(floor(t));
  if (t.x < 0.0 || t.y < 0.0 || t.x >= uMax.x || t.y >= uMax.y) discard;
  ivec2 l = tq - ivec2(vDst.xy);
  int w = int(vDst.z + 0.5), h = int(vDst.w + 0.5), bits = int(vSrc.w + 0.5);
  if (cov(l, w, h, bits) < 0.5) discard;
  float hs = zOf(texelFetch(tS, tq, 0)), h0 = zOf(texelFetch(tB, at(l, w, bits), 0)) + vPar.x;
  if (hs <= h0 + 0.5) discard;
  float rim = (cov(l + ivec2(1, 0), w, h, bits) < 0.5 || cov(l - ivec2(1, 0), w, h, bits) < 0.5 || cov(l + ivec2(0, 1), w, h, bits) < 0.5 || cov(l - ivec2(0, 1), w, h, bits) < 0.5) ? 1.0 : 0.0;
  o = vec4(mix(uCol.rgb, vec3(1.0), rim * 0.45), min(1.0, uCol.a + rim * 0.35));
}`;

// ---- the engine ---------------------------------------------------------------------------------------
export class Art2Engine {
  static create(canvas, opts = {}) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance', depth: false, stencil: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    try {
      if (gl.getParameter(gl.MAX_DRAW_BUFFERS) < 3 || gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) < 3 || gl.getParameter(gl.MAX_TEXTURE_SIZE) < 2048 ||
        gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) < 8 || gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) < 8 || gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE) < MAX_LIGHTS * LIGHT_FLOATS * 4) return null;
      return new Art2Engine(canvas, gl, opts);
    } catch (e) { console.warn('Art2Engine: ' + (e && e.message)); return null; }
  }
  constructor(canvas, gl, opts) {
    this.cv = canvas; this.gl = gl;
    this.q = clampQ(opts.quality ?? 2); this.lowMem = !!opts.lowMem; this.profile = !!opts.profile;
    this.dpr = 1; this.frameNo = 1; this.inFrame = false; this.lost = false; this.lostCb = null; this.disposed = false;
    // per-frame records, allocated once (grown only if a frame needs more)
    this.inst = new Float32Array(1024 * FL); this.nInst = 0;
    this.dec = new Float32Array(256 * FL); this.nDec = 0;
    this.xr = new Float32Array(8 * FL); this.nXr = 0;
    this.lrec = new Float32Array(256 * LIGHT_FLOATS); this.nLights = 0;
    this.lidx = new Int32Array(MAX_LIGHTS); this.lsc = new Float32Array(MAX_LIGHTS); this.ubo = new Float32Array(MAX_LIGHTS * LIGHT_FLOATS);
    this.org = [0, 0]; this.view = [0, 0, 1, 1]; this.scr = [null, null, null]; this.px1 = new Uint8Array(4);
    this.times = {}; this.timesLast = {}; this.msGpu = 0; this.lightsUsed = 0; this.last = { sprites: 0, decals: 0, lights: 0, chunks: 0 };
    this.P = PRESETS_GAME.noon; this.camX = 0; this.camY = 0; this.zoom = 1; this.time = 0; this.wet = 0; this.flash = 0; this.fog = 0;
    this.ox = 0; this.oy = 0; this.SW = 1; this.SH = 1; this.pres = { s: 1, offX: 0, offY: 0 }; this.presentMode = null;
    this.LS = { A: null, B: null, C: null, w: 1, h: 1, preset: null, wet: 0, time: 0, flash: 0, fog: 0, nL: 0, ubo: null, org: this.org, view: this.view, out: null, mark: null };
    this._mark = (name) => this.markPass(name);
    this._onLost = (e) => { e.preventDefault(); this.lost = true; this.inFrame = false; if (this.lostCb) this.lostCb('lost'); };
    this._onRestored = () => {
      if (this.disposed) return;
      try { this._init(); this.lost = false; if (this.lostCb) this.lostCb('restored'); } catch (err) { this.lost = true; if (this.lostCb) this.lostCb('failed'); }
    };
    canvas.addEventListener('webglcontextlost', this._onLost, false);
    canvas.addEventListener('webglcontextrestored', this._onRestored, false);
    this._init();
  }
  // every GL resource (again after a context restore; everything uploaded before is gone)
  _init() {
    const gl = this.gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.DB3 = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]; this.DB1 = [gl.COLOR_ATTACHMENT0, gl.NONE, gl.NONE];
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    const buf = (data, usage = gl.STATIC_DRAW) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage); return b; };
    this.vbTri = buf(new Float32Array([-1, -1, 3, -1, -1, 3]));
    this.vbQuad = buf(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));
    const vao = (vb) => { const v = gl.createVertexArray(); gl.bindVertexArray(v); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null); return v; };
    this.vaoTri = vao(this.vbTri); this.vaoQuad = vao(this.vbQuad);
    this.ibSpr = buf(this.inst.byteLength, gl.DYNAMIC_DRAW); this.ibDec = buf(this.dec.byteLength, gl.DYNAMIC_DRAW); this.ibXr = buf(this.xr.byteLength, gl.DYNAMIC_DRAW);
    this.vaoSpr = this._instVao(this.ibSpr); this.vaoDec = this._instVao(this.ibDec); this.vaoXr = this._instVao(this.ibXr);
    this.uboBuf = gl.createBuffer(); gl.bindBuffer(gl.UNIFORM_BUFFER, this.uboBuf); gl.bufferData(gl.UNIFORM_BUFFER, this.ubo.byteLength, gl.DYNAMIC_DRAW); gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    const IA = ['c', 'iDst', 'iSrc', 'iPar', 'iTint'];
    this.pStatic = glProgram(gl, STATIC_VS, STATIC_FS, ['c'], { t0: 0, t1: 1, t2: 2, t3: 7 });
    this.pSprite = glProgram(gl, SPRITE_VS, SPRITE_FS, IA, { tA: 3, tB: 4, tC: 5 });
    this.pDecal = glProgram(gl, DECAL_VS, DECAL_FS, ['c', 'iA', 'iSrc', 'iSz', 'iPar'], { tA: 3 });
    this.pPresent = glProgram(gl, TRI_VS, PRESENT_FS, ['p'], { tF: 0 });
    this.pXray = glProgram(gl, XRAY_VS, XRAY_FS, IA, { tA: 3, tB: 4, tS: 6 });
    this.light = new LightGame(gl, this.vaoTri); this.light.setTier(this.q); this.light.warm();
    this.slots = []; this.chunks = new Map();
    this.sprites = new Map(); this.atlas = null; this.pages = []; this._allocAtlas();
    this.cw = 0; this.ch = 0; this.tA = this.tB = this.tC = this.rbDepth = this.fbScene = this.fbOut = null;
    this.fbClear = gl.createFramebuffer();
    this.timer = this.profile ? null : gl.getExtension('EXT_disjoint_timer_query_webgl2'); this.qFree = []; this.qPend = []; this.qCur = null;
  }
  _instVao(ib) {
    const gl = this.gl, v = gl.createVertexArray();
    gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbQuad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, FL * 4, i * 16); gl.vertexAttribDivisor(1 + i, 1); }
    gl.bindVertexArray(null);
    return v;
  }
  _chunksCap() { const c = this.lowMem ? Math.min(10, QUALITY[this.q].chunks) : QUALITY[this.q].chunks; return Math.max(c, this.chunkMin || 0); }
  reserveChunks(n) { this.chunkMin = Math.max(0, Math.min(32, n | 0)); }
  chunkCap() { return this._chunksCap(); }
  _pagesCap() { return this.lowMem ? Math.min(4, QUALITY[this.q].pages) : QUALITY[this.q].pages; }
  _allocAtlas() {
    const gl = this.gl, n = this._pagesCap();
    if (this.atlas) for (const t of this.atlas) gl.deleteTexture(t);
    this.atlas = [0, 1, 2].map(() => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, ATLAS_PX, ATLAS_PX, n);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    });
    this.pages = []; for (let i = 0; i < n; i++) this.pages.push({ i, y: 0, shelves: [], used: 0 });
    this.sprites.clear();
  }
  _scratch(n) {
    if (!this.scr[0] || this.scr[0].length < n) { const m = Math.max(n, 1 << 20); this.scr = [new Uint8Array(m), new Uint8Array(m), new Uint8Array(m)]; }
    return this.scr;
  }
  _pack(g) { const s = this._scratch(g.w * g.h * 4); return packGBuf(g, s[0], s[1], s[2]); }
  // scratch for cropped sprite uploads (separate from _scratch: the planes being cropped may live there)
  _cropScratch(n) {
    if (!this.cropScr || this.cropScr[0].length < n) { const m = Math.max(n, 1 << 18); this.cropScr = [new Uint8Array(m), new Uint8Array(m), new Uint8Array(m)]; }
    return this.cropScr;
  }

  // ---- quality, size, lifecycle -----------------------------------------------------------------------------
  setQuality(q) {
    q = clampQ(q);
    if (q === this.q || this.lost) { this.q = q; return; }
    const pages = this._pagesCap();
    this.q = q;
    this.light.setTier(q);
    this.light.warm();
    const cap = this._chunksCap(), gl = this.gl;
    while (this.slots.length > cap) {
      // free slots go first, then the least recently drawn
      let k = this.slots.findIndex((x) => x.key < 0);
      if (k < 0) { k = 0; for (let i = 1; i < this.slots.length; i++) if (this.slots[i].used < this.slots[k].used) k = i; }
      const s = this.slots[k];
      if (s.key >= 0) this.chunks.delete(s.key);
      for (const t of s.t) gl.deleteTexture(t);
      this.slots.splice(k, 1);
    }
    if (this._pagesCap() !== pages) this._allocAtlas();
  }
  resize(cssW, cssH, dpr = 1) {
    this.dpr = dpr > 0 ? dpr : 1;
    const w = Math.max(1, Math.round(cssW * this.dpr)), h = Math.max(1, Math.round(cssH * this.dpr));
    if (this.cv.width !== w) this.cv.width = w;
    if (this.cv.height !== h) this.cv.height = h;
  }
  onContextLost(cb) { this.lostCb = cb; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cv.removeEventListener('webglcontextlost', this._onLost); this.cv.removeEventListener('webglcontextrestored', this._onRestored);
    const gl = this.gl;
    if (!gl.isContextLost()) {
      this._freeScene(); this.light.dispose();
      for (const s of this.slots) for (const t of s.t) gl.deleteTexture(t);
      for (const t of this.atlas) gl.deleteTexture(t);
      for (const p of [this.pStatic, this.pSprite, this.pDecal, this.pPresent, this.pXray]) gl.deleteProgram(p.p);
      for (const b of [this.vbTri, this.vbQuad, this.ibSpr, this.ibDec, this.ibXr, this.uboBuf]) gl.deleteBuffer(b);
      for (const v of [this.vaoTri, this.vaoQuad, this.vaoSpr, this.vaoDec, this.vaoXr]) gl.deleteVertexArray(v);
      gl.deleteFramebuffer(this.fbClear);
      for (const q of this.qFree.concat(this.qPend)) gl.deleteQuery(q);
    }
    this.slots = []; this.chunks.clear(); this.sprites.clear(); this.lost = true;
  }

  // ---- static chunks ----------------------------------------------------------------------------------------
  hasChunk(cx, cy) { const s = this.chunks.get(ckey(cx, cy)); return !!(s && s.real); }
  hasFallback(cx, cy) { const s = this.chunks.get(ckey(cx, cy)); return !!(s && !s.real); }
  chunkKeys() { const out = []; for (const s of this.chunks.values()) out.push(s.cx + ',' + s.cy); return out; }
  _slot(cx, cy) {
    const k = ckey(cx, cy);
    let s = this.chunks.get(k);
    if (s) return s;
    for (const x of this.slots) if (x.key < 0) { s = x; break; }
    if (!s && this.slots.length < this._chunksCap()) {
      const gl = this.gl;
      s = { t: [glTex(gl, CHUNK_PX, CHUNK_PX), glTex(gl, CHUNK_PX, CHUNK_PX), glTex(gl, CHUNK_PX, CHUNK_PX)], key: -1, cx: 0, cy: 0, real: false, src: null, used: 0 };
      this.slots.push(s);
    }
    if (!s) { for (const x of this.slots) if (!s || x.used < s.used) s = x; this.chunks.delete(s.key); }
    s.key = k; s.cx = cx; s.cy = cy; s.real = false; s.src = null; s.used = this.frameNo - 1;
    this.chunks.set(k, s);
    return s;
  }
  _clearTex(t, r, g, b, a) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbClear);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]); gl.disable(gl.SCISSOR_TEST);
    CLR[0] = r; CLR[1] = g; CLR[2] = b; CLR[3] = a;
    gl.clearBufferfv(gl.COLOR, 0, CLR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  uploadChunk(cx, cy, g) {
    if (this.lost || !g) return false;
    const gl = this.gl, s = this._slot(cx, cy), pk = g.p0 ? g : this._pack(g);
    const w = Math.min(g.w, CHUNK_PX), h = Math.min(g.h, CHUNK_PX);
    if (w < CHUNK_PX || h < CHUNK_PX) { this._clearTex(s.t[0], 0, 0, 0, 0); this._clearTex(s.t[1], 0, 0, 0, OCT_MID / 255); this._clearTex(s.t[2], 0, 0, 0, OCT_MID / 255); }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, g.w);
    for (let i = 0; i < 3; i++) { gl.bindTexture(gl.TEXTURE_2D, s.t[i]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, i === 0 ? pk.p0 : i === 1 ? pk.p1 : pk.p2); }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    s.bids = g.blds && g.blds.length ? g.blds.map((r) => r[0]) : null;
    if (g.under && g.under.length >= CHUNK_PX * CHUNK_PX * 4) {
      if (!s.t[3]) s.t[3] = glTex(gl, CHUNK_PX, CHUNK_PX);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, g.w);
      gl.bindTexture(gl.TEXTURE_2D, s.t[3]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, g.under);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      s.under = true;
    } else s.under = false;
    s.real = true; s.src = null;
    return true;
  }
  setChunkFallback(cx, cy, source) {
    if (this.lost || !source) return false;
    const ex = this.chunks.get(ckey(cx, cy));
    if (ex && (ex.real || ex.src === source)) return true;
    const gl = this.gl, s = this._slot(cx, cy);
    let src = source;
    const sw = source.width || source.videoWidth || 0, sh = source.height || source.videoHeight || 0;
    if (sw !== CHUNK_PX || sh !== CHUNK_PX) {
      if (!this.scaleCv) { this.scaleCv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(CHUNK_PX, CHUNK_PX) : document.createElement('canvas'); this.scaleCv.width = this.scaleCv.height = CHUNK_PX; this.scaleG = this.scaleCv.getContext('2d'); }
      this.scaleG.clearRect(0, 0, CHUNK_PX, CHUNK_PX); this.scaleG.imageSmoothingEnabled = false;
      this.scaleG.drawImage(source, 0, 0, CHUNK_PX, CHUNK_PX);
      src = this.scaleCv;
    }
    gl.bindTexture(gl.TEXTURE_2D, s.t[0]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    // flat ground: z 0, F_GROUND, the up normal, no glow
    this._clearTex(s.t[1], 0, 0, F_GROUND / 255, OCT_MID / 255); this._clearTex(s.t[2], 0, 0, 0, OCT_MID / 255);
    s.real = false; s.src = source; s.under = false; s.bids = null;
    return true;
  }
  dropChunk(cx, cy) {
    const k = ckey(cx, cy), s = this.chunks.get(k);
    if (!s) return;
    this.chunks.delete(k); s.key = -1; s.real = false; s.src = null; s.used = 0;
  }

  // ---- sprite atlas -----------------------------------------------------------------------------------------
  hasSprite(key) { return this.sprites.has(key); }
  spriteInfo(key) { return this.sprites.get(key) || null; }
  dropSprite(key) { const r = this.sprites.get(key); if (r) this._unlink(r); }
  _unlink(r) { const l = r.shelf.list, i = l.indexOf(r); if (i >= 0) l.splice(i, 1); this.sprites.delete(r.key); }
  _clearShelf(s) { for (const r of s.list) this.sprites.delete(r.key); s.list.length = 0; s.x = 0; }
  // a w x h rectangle in the atlas: a shelf of similar height with room, a new shelf, or the least recently
  // drawn shelf (then page) that was not drawn this frame
  _place(w, h) {
    const f = this.frameNo, slack = Math.max(8, h >> 2);
    for (const pg of this.pages) for (const s of pg.shelves) if (s.h >= h && s.h <= h + slack && s.x + w <= ATLAS_PX) return this._take(s, w);
    const sh = (h + 3) & ~3;
    for (const pg of this.pages) if (pg.y + sh <= ATLAS_PX) { const s = { page: pg, y: pg.y, h: sh, x: 0, used: 0, list: [] }; pg.y += sh; pg.shelves.push(s); return this._take(s, w); }
    let best = null;
    for (const pg of this.pages) for (const s of pg.shelves) if (s.h >= h && s.used < f && (!best || s.used < best.used || (s.used === best.used && s.h < best.h))) best = s;
    if (best) { this._clearShelf(best); return this._take(best, w); }
    let bp = null;
    for (const pg of this.pages) if (pg.used < f && (!bp || pg.used < bp.used)) bp = pg;
    if (!bp) return null;
    for (const s of bp.shelves) this._clearShelf(s);
    bp.shelves.length = 0; bp.y = sh;
    const s = { page: bp, y: 0, h: sh, x: 0, used: 0, list: [] }; bp.shelves.push(s);
    return this._take(s, w);
  }
  _take(s, w) { const x = s.x; s.x += w; return { s, x }; }
  _rec(key, w, h) {
    let r = this.sprites.get(key);
    if (r && (r.w !== w || r.h !== h)) { this._unlink(r); r = null; }
    if (r) return r;
    const pl = this._place(w, h);
    if (!pl) return null;
    r = { key, layer: pl.s.page.i, x: pl.x, y: pl.s.y, w, h, ax: 0, ay: 0, shelf: pl.s, used: 0 };
    pl.s.list.push(r); this.sprites.set(key, r);
    // (a fresh upload counts as a use: what was just asked for ahead isn't the first thing pushed out)
    if (pl.s.used < this.frameNo) pl.s.used = this.frameNo;
    if (pl.s.page.used < this.frameNo) pl.s.page.used = this.frameNo;
    return r;
  }
  _subImage(r, plane, data) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas[plane]);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, r.x, r.y, r.layer, r.w, r.h, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }
  uploadSprite(key, g) {
    if (this.lost || !g) return false;
    const W0 = g.w | 0, H0 = g.h | 0;
    if (W0 <= 0 || H0 <= 0) return false;
    const pk = g.p0 ? g : this._pack(g);
    // crop to what is drawn (a voxel render is a square round its model): the atlas holds twice as much
    const A = pk.p0;
    let x0 = W0, y0 = H0, x1 = -1, y1 = -1;
    for (let y = 0, j = 3; y < H0; y++) {
      let rowAny = false;
      for (let x = 0; x < W0; x++, j += 4) if (A[j] > 127) { rowAny = true; if (x < x0) x0 = x; if (x > x1) x1 = x; }
      if (rowAny) { if (y < y0) y0 = y; y1 = y; }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w > ATLAS_PX || h > ATLAS_PX) return false;
    const r = this._rec(key, w, h);
    if (!r) return false;
    r.ax = (g.ax ?? 0) - x0; r.ay = (g.ay ?? 0) - y0;
    if (w === W0 && h === H0) { this._subImage(r, 0, pk.p0); this._subImage(r, 1, pk.p1); this._subImage(r, 2, pk.p2); return true; }
    // the cropped rectangle copied out on the CPU: a 3D upload with UNPACK_SKIP_ROWS is refused by browsers
    // (INVALID_OPERATION unless UNPACK_IMAGE_HEIGHT is set too), which left every sprite with empty top rows
    // (vehicles, animals, crates, trains, effects) resident but blank
    const n = w * h * 4, C = this._cropScratch(n);
    for (let i = 0; i < 3; i++) {
      const src = i === 0 ? pk.p0 : i === 1 ? pk.p1 : pk.p2, dst = C[i];
      for (let y = 0; y < h; y++) { const a = ((y0 + y) * W0 + x0) * 4; dst.set(src.subarray(a, a + w * 4), y * w * 4); }
      this._subImage(r, i, dst.subarray(0, n));
    }
    return true;
  }
  // v1 art as a sprite: albedo from the canvas, a normal facing the camera, z rising 1 px per row from the
  // bottom row (opts.flat: lying on the ground, z 0, normal up), opts.flags, opts.emissive 0..1 (glows with
  // its own colour; reads the canvas back once)
  uploadSpriteFromCanvas(key, canvas, ax, ay, opts = EMPTY) {
    if (this.lost || !canvas) return false;
    const w = canvas.width | 0, h = canvas.height | 0;
    if (w <= 0 || h <= 0 || w > ATLAS_PX || h > ATLAS_PX) return false;
    const r = this._rec(key, w, h);
    if (!r) return false;
    r.ax = ax ?? w / 2; r.ay = ay ?? h;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas[0]);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, r.x, r.y, r.layer, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    const n4 = w * h * 4, S = this._scratch(n4), p1 = S[1].subarray(0, n4), p2 = S[2].subarray(0, n4);
    const flat = !!opts.flat, fl = (opts.flags | 0) & 255, ex = flat ? OCT_MID : CAM_OCT[0], ey = flat ? OCT_MID : CAM_OCT[1];
    let px = null, ek = 0;
    if (opts.emissive > 0 && canvas.getContext) { const c2 = canvas.getContext('2d'); if (c2) { px = c2.getImageData(0, 0, w, h).data; ek = Math.pow(Math.min(1, opts.emissive), 1 / 2.2); } }
    for (let y = 0, j = 0; y < h; y++) {
      const z = flat ? 0 : h - 1 - y;
      for (let x = 0; x < w; x++, j += 4) {
        p1[j] = z & 255; p1[j + 1] = z >> 8; p1[j + 2] = fl; p1[j + 3] = ex;
        if (px) { p2[j] = px[j] * ek; p2[j + 1] = px[j + 1] * ek; p2[j + 2] = px[j + 2] * ek; } else { p2[j] = 0; p2[j + 1] = 0; p2[j + 2] = 0; }
        p2[j + 3] = ey;
      }
    }
    this._subImage(r, 1, p1); this._subImage(r, 2, p2);
    return true;
  }

  // ---- the frame ----------------------------------------------------------------------------------------------
  // f: {camX, camY, zoom, viewW, viewH, time, preset, wet, quality, +flash, +fog}
  beginFrame(f) {
    if (this.lost || this.disposed) return false;
    if (f.quality !== undefined && clampQ(f.quality) !== this.q) this.setQuality(f.quality);
    this.frameNo++; this.inFrame = true;
    this.nInst = 0; this.nDec = 0; this.nXr = 0; this.nLights = 0;
    const P = f.preset || PRESETS_GAME.noon, T = LIGHT_TIERS[this.q];
    this.P = P; this.time = f.time || 0; this.wet = f.wet || 0; this.flash = f.flash || 0; this.fog = f.fog || 0;
    if (f.fades !== undefined) this.fades = f.fades;
    this.zoom = f.zoom > 0 ? f.zoom : 1; this.camX = +f.camX || 0; this.camY = +f.camY || 0;
    // margins: the shadow reach on the side the sun is, room above for wet reflections, a little slack
    const sd = P.sunDir || PRESET_DEFAULTS.sunDir, sl = Math.hypot(sd[0], sd[1], sd[2]) || 1, sz = sd[2] / sl;
    const reach = sz > 0.02 ? Math.min(P.shadowLen ?? 0, T.contact ? 36 : T.reach) : 0;
    const dx = sd[0] / sl * reach, dy = (sd[1] / sl - sz) * reach;
    const mL = 8 + r16(-dx), mR = 8 + r16(dx), mB = 8 + r16(dy);
    let mT = 8 + r16(-dy);
    if (Math.max(P.wet ?? 0, this.wet) > 0 && T.refl) mT = Math.max(mT, 64);
    const hw = Math.ceil((f.viewW > 0 ? f.viewW : this.cv.width / (this.zoom * this.dpr)) / 2) + 2;
    const hh = Math.ceil((f.viewH > 0 ? f.viewH : this.cv.height / (this.zoom * this.dpr)) / 2) + 2;
    this.SW = Math.min(this.maxTex, 2 * hw + mL + mR); this.SH = Math.min(this.maxTex, 2 * hh + mT + mB);
    this.ox = Math.floor(this.camX) - hw - mL; this.oy = Math.floor(this.camY) - hh - mT;
    this.view[0] = mL; this.view[1] = mT; this.view[2] = 2 * hw; this.view[3] = 2 * hh;
    this.org[0] = ((this.ox % 8192) + 8192) % 8192; this.org[1] = ((this.oy % 8192) + 8192) % 8192;
    return true;
  }
  // x, y: the world ground point of the sprite's anchor; z0: the ground height under it
  drawSprite(key, x, y, z0 = 0, o = EMPTY) {
    if (!this.inFrame) return false;
    const r = this.sprites.get(key);
    if (!r) return false;
    const alpha = o.alpha ?? 1;
    if (alpha <= 0) return true;
    const dx = Math.round(x - r.ax) - this.ox, dy = Math.round(y - r.ay - z0) - this.oy;
    if (dx >= this.SW || dy >= this.SH || dx + r.w <= 0 || dy + r.h <= 0) return true;
    const f = this.frameNo;
    r.used = f; r.shelf.used = f; this.pages[r.layer].used = f;
    if (this.nInst * FL >= this.inst.length) this.inst = this._grow(this.inst, this.ibSpr);
    const A = this.inst, b = this.nInst++ * FL, t = o.tint;
    A[b] = dx; A[b + 1] = dy; A[b + 2] = r.w; A[b + 3] = r.h;
    A[b + 4] = r.x; A[b + 5] = r.y; A[b + 6] = r.layer; A[b + 7] = (o.flipX ? 1 : 0) | (o.shadow === false ? 2 : 0);
    A[b + 8] = z0; A[b + 9] = alpha; A[b + 10] = o.flash || 0; A[b + 11] = 0;
    A[b + 12] = t ? t[0] : 1; A[b + 13] = t ? t[1] : 1; A[b + 14] = t ? t[2] : 1; A[b + 15] = 0;
    if (o.xray) {
      if (this.nXr * FL >= this.xr.length) this.xr = this._grow(this.xr, this.ibXr);
      const X = this.xr, xb = this.nXr++ * FL;
      for (let i = 0; i < FL; i++) X[xb + i] = A[b + i];
    }
    return true;
  }
  drawDecal(key, x, y, angle = 0, alpha = 1, z0 = 0) {
    if (!this.inFrame) return false;
    const r = this.sprites.get(key);
    if (!r) return false;
    if (alpha <= 0) return true;
    const ax = Math.round(x) - this.ox, ay = Math.round(y - z0) - this.oy, ext = r.w + r.h;
    if (ax - ext >= this.SW || ay - ext >= this.SH || ax + ext <= 0 || ay + ext <= 0) return true;
    const f = this.frameNo;
    r.used = f; r.shelf.used = f; this.pages[r.layer].used = f;
    if (this.nDec * FL >= this.dec.length) this.dec = this._grow(this.dec, this.ibDec);
    const D = this.dec, b = this.nDec++ * FL;
    D[b] = ax; D[b + 1] = ay; D[b + 2] = Math.cos(angle); D[b + 3] = Math.sin(angle);
    D[b + 4] = r.x; D[b + 5] = r.y; D[b + 6] = r.layer; D[b + 7] = 0;
    D[b + 8] = r.w; D[b + 9] = r.h; D[b + 10] = r.ax; D[b + 11] = r.ay;
    D[b + 12] = alpha; D[b + 13] = z0; D[b + 14] = 0; D[b + 15] = 0;
    return true;
  }
  // L: {x, y (world ground point), z (height), r (radius px), col [r,g,b] 0..1, k, cone?: {a, spread, len}}
  addLight(L) {
    if (!this.inFrame) return;
    if ((this.nLights + 1) * LIGHT_FLOATS > this.lrec.length) { const a = new Float32Array(this.lrec.length * 2); a.set(this.lrec); this.lrec = a; }
    const R = this.lrec, b = this.nLights++ * LIGHT_FLOATS, c = L.cone, col = L.col;
    R[b] = L.x; R[b + 1] = L.y; R[b + 2] = L.z || 0; R[b + 3] = c ? (c.len || L.r || 200) : (L.r || 100);
    R[b + 4] = col[0]; R[b + 5] = col[1]; R[b + 6] = col[2]; R[b + 7] = L.k ?? 1;
    if (c) { const sp = Math.max(0.05, c.spread || 0.4); R[b + 8] = Math.cos(c.a || 0); R[b + 9] = Math.sin(c.a || 0); R[b + 10] = Math.cos(sp); R[b + 11] = Math.cos(sp * 0.45); }
    else { R[b + 8] = 0; R[b + 9] = 0; R[b + 10] = -2; R[b + 11] = -2; }
  }
  _grow(arr, glBuf) {
    const a = new Float32Array(arr.length * 2); a.set(arr);
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, glBuf); gl.bufferData(gl.ARRAY_BUFFER, a.byteLength, gl.DYNAMIC_DRAW);
    return a;
  }
  endFrame() {
    if (!this.inFrame) return;
    this.inFrame = false;
    if (this.lost) return;
    const gl = this.gl, t0 = performance.now();
    this.tPrev = t0;
    if (this.profile) for (const k in this.timesLast) this.timesLast[k] = 0;
    this._tqBegin();
    this._ensureScene(this.SW, this.SH);
    this._passStatic(); this.markPass('static');
    this._passDecals(); this.markPass('decals');
    this._passSprites(); this.markPass('sprites');
    const LS = this.LS;
    LS.A = this.tA; LS.B = this.tB; LS.C = this.tC; LS.w = this.SW; LS.h = this.SH; LS.preset = this.P;
    LS.wet = this.wet; LS.time = this.time; LS.flash = this.flash; LS.fog = this.fog;
    LS.nL = this._packLights(); LS.ubo = this.uboBuf; LS.out = this.fbOut; LS.mark = this.profile ? this._mark : null;
    this.light.bin(this.ubo, LS.nL, this.SW, this.SH, Math.max(this.P.wet ?? 0, this.wet) > 0);
    this.light.render(LS);
    this._passPresent(); this.markPass('present');
    this._passXray(); this.markPass('xray');
    this._tqEnd();
    this.last.sprites = this.nInst; this.last.decals = this.nDec; this.last.lights = this.nLights; this.cpuMs = ema(this.cpuMs, performance.now() - t0);
    if (this.profile) { let s = 0; for (const k in this.times) s += this.times[k]; this.msGpu = s; }
    else if (!this.timer) this.msGpu = this.cpuMs;
    gl.bindVertexArray(null);
  }
  // profiling (opts.profile): wait for the GPU after each pass and keep a running average per pass. A
  // 1-pixel readPixels is the sync point (gl.finish does not wait for Chrome's GPU process).
  markPass(name) {
    if (!this.profile) return;
    const gl = this.gl;
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px1);
    const t = performance.now();
    this.times[name] = ema(this.times[name], t - this.tPrev); this.timesLast[name] = t - this.tPrev;
    this.tPrev = t;
  }
  _tqBegin() {
    const ext = this.timer;
    if (!ext || this.qCur) return;
    const gl = this.gl, q = this.qFree.pop() || gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q); this.qCur = q;
  }
  _tqEnd() {
    const ext = this.timer;
    if (!ext || !this.qCur) return;
    const gl = this.gl;
    gl.endQuery(ext.TIME_ELAPSED_EXT); this.qPend.push(this.qCur); this.qCur = null;
    while (this.qPend.length) {
      const q = this.qPend[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT), disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      this.qPend.shift(); this.qFree.push(q);
      if (!disjoint) this.msGpu = ema(this.msGpu, ns / 1e6);
    }
  }
  _freeScene() {
    const gl = this.gl;
    for (const t of [this.tA, this.tB, this.tC]) if (t) gl.deleteTexture(t);
    if (this.rbDepth) gl.deleteRenderbuffer(this.rbDepth);
    if (this.fbScene) gl.deleteFramebuffer(this.fbScene);
    if (this.fbOut) gl.deleteFramebuffer(this.fbOut);
    this.tA = this.tB = this.tC = this.rbDepth = this.fbScene = this.fbOut = null; this.cw = this.ch = 0;
  }
  // the scene targets: grown in 128 px steps when a view needs more, never per frame
  _ensureScene(w, h) {
    if (this.fbScene && w <= this.cw && h <= this.ch) return;
    const gl = this.gl;
    const cw = Math.min(this.maxTex, Math.max(this.cw, Math.ceil(w / 128) * 128)), ch = Math.min(this.maxTex, Math.max(this.ch, Math.ceil(h / 128) * 128));
    this._freeScene();
    this.tA = glTex(gl, cw, ch, true); this.tB = glTex(gl, cw, ch, false); this.tC = glTex(gl, cw, ch, true);
    this.rbDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.rbDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, cw, ch);
    this.fbScene = glFbo(gl, [this.tA, this.tB, this.tC], this.rbDepth);
    this.fbOut = glFbo(gl, [this.tA]);
    this.cw = cw; this.ch = ch;
    this.light.ensure(cw, ch);
  }
  _passStatic() {
    const gl = this.gl, p = this.pStatic, u = p.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbScene); gl.viewport(0, 0, this.SW, this.SH);
    gl.drawBuffers(this.DB3);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.CULL_FACE);
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.clearBufferfv(gl.COLOR, 0, Z4); gl.clearBufferfv(gl.COLOR, 1, Z4); gl.clearBufferfv(gl.COLOR, 2, Z4); gl.clearBufferfv(gl.DEPTH, 0, ONE);
    gl.useProgram(p.p); gl.bindVertexArray(this.vaoQuad);
    gl.uniform2f(u.uScene, this.SW, this.SH);
    const fades = this.fades && this.fades.size ? this.fades : null, FA = this._fadeArr || (this._fadeArr = new Float32Array(64));
    const c0 = Math.floor(this.ox / CHUNK_PX), c1 = Math.floor((this.ox + this.SW - 1) / CHUNK_PX), r0 = Math.floor(this.oy / CHUNK_PX), r1 = Math.floor((this.oy + this.SH - 1) / CHUNK_PX);
    let n = 0;
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const s = this.chunks.get(ckey(cx, cy));
      if (!s) continue;
      s.used = this.frameNo;
      for (let i = 0; i < 3; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, s.t[i]); }
      gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, s.under && s.t[3] ? s.t[3] : s.t[0]);
      let on = 0;
      if (fades && s.under && s.t[3] && s.bids) {
        FA.fill(0);
        for (let i = 0; i < s.bids.length && i < 63; i++) { const f = fades.get(s.bids[i]); if (f) { FA[i + 1] = f; on = 1; } }
        if (on) gl.uniform1fv(u.uFade, FA);
      }
      gl.uniform1f(u.uFadeOn, on);
      const x = cx * CHUNK_PX - this.ox, y = cy * CHUNK_PX - this.oy;
      gl.uniform4f(u.uRect, x, y, CHUNK_PX, CHUNK_PX); gl.uniform2f(u.uOff, x, y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      n++;
    }
    this.last.chunks = n;
  }
  _bindAtlas() { const gl = this.gl; for (let i = 0; i < 3; i++) { gl.activeTexture(gl.TEXTURE3 + i); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas[i]); } }
  _passDecals() {
    if (!this.nDec) return;
    const gl = this.gl, p = this.pDecal;
    gl.drawBuffers(this.DB1);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(p.p); gl.bindVertexArray(this.vaoDec); this._bindAtlas();
    gl.uniform2f(p.u.uScene, this.SW, this.SH);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibDec); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.dec, 0, this.nDec * FL);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nDec);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.drawBuffers(this.DB3);
  }
  _passSprites() {
    if (!this.nInst) return;
    const gl = this.gl, p = this.pSprite;
    gl.useProgram(p.p); gl.bindVertexArray(this.vaoSpr); this._bindAtlas();
    gl.uniform2f(p.u.uScene, this.SW, this.SH); gl.uniform2i(p.u.org, this.org[0], this.org[1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibSpr); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, this.nInst * FL);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nInst);
  }
  // cull the frame's lights to the scene, keep the best k * r up to the tier's count, scene coordinates
  _packLights() {
    const gl = this.gl, maxL = LIGHT_TIERS[this.q].maxL, R = this.lrec, idx = this.lidx, sc = this.lsc, U = this.ubo;
    const x0 = this.ox, y0 = this.oy, x1 = x0 + this.SW, y1 = y0 + this.SH;
    let m = 0;
    for (let i = 0; i < this.nLights; i++) {
      const b = i * LIGHT_FLOATS, x = R[b], y = R[b + 1], z = R[b + 2], r = R[b + 3];
      if (x + r < x0 || x - r > x1 || y + r + 30 + z * 1.4 < y0 || y - z - 2 * r > y1) continue;
      const s = R[b + 7] * r * (R[b + 10] > -1.5 ? 1.3 : 1);
      if (m === maxL && s <= sc[m - 1]) continue;
      let j = m < maxL ? m++ : m - 1;
      while (j > 0 && sc[j - 1] < s) { sc[j] = sc[j - 1]; idx[j] = idx[j - 1]; j--; }
      sc[j] = s; idx[j] = i;
    }
    for (let k = 0; k < m; k++) {
      const b = idx[k] * LIGHT_FLOATS, o = k * LIGHT_FLOATS;
      U[o] = R[b] - x0; U[o + 1] = R[b + 1] - y0;
      for (let i = 2; i < LIGHT_FLOATS; i++) U[o + i] = R[b + i];
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.uboBuf);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, U, 0, Math.max(1, m) * LIGHT_FLOATS);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    this.lightsUsed = m;
    return m;
  }
  _passPresent() {
    const gl = this.gl, p = this.pPresent, u = p.u, W = this.cv.width, H = this.cv.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.useProgram(p.p); gl.bindVertexArray(this.vaoTri);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tA);
    // nearest at about 1:1 and at whole scales (crisp, offset snapped to device px), sharp bilinear between
    // (even texel sizes, so no shimmer while scrolling), a 4-tap area filter when shrinking
    const s = this.zoom * this.dpr, near = (s >= 0.92 && s < 1.1) || (s >= 1.9 && Math.abs(s - Math.round(s)) < 0.02);
    const mode = this.presentMode ?? (near ? 0 : s >= 1 ? 1 : 2);
    let offX = this.camX - this.ox - W / (2 * s), offY = this.camY - this.oy - H / (2 * s);
    if (mode === 0) { offX = Math.round(offX * s) / s; offY = Math.round(offY * s) / s; }
    const pr = this.pres; pr.s = s; pr.offX = offX; pr.offY = offY;
    gl.uniform2f(u.uCanvas, W, H); gl.uniform2f(u.uTex, this.cw, this.ch); gl.uniform2f(u.uMax, this.SW, this.SH); gl.uniform2f(u.uOff, offX, offY);
    gl.uniform1f(u.uInvS, 1 / s); gl.uniform1f(u.uS, s); gl.uniform1f(u.uVign, this.P.vign ?? PRESET_DEFAULTS.vign); gl.uniform1i(u.uMode, mode);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  _passXray() {
    if (!this.nXr) return;
    const gl = this.gl, p = this.pXray, u = p.u, pr = this.pres;
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(p.p); gl.bindVertexArray(this.vaoXr); this._bindAtlas();
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.tB);
    gl.uniform2f(u.uCanvas, this.cv.width, this.cv.height); gl.uniform2f(u.uOff, pr.offX, pr.offY); gl.uniform1f(u.uS, pr.s); gl.uniform1f(u.uInvS, 1 / pr.s);
    gl.uniform2f(u.uMax, this.SW, this.SH); gl.uniform4f(u.uCol, 0.62, 0.8, 1.0, 0.5);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibXr); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.xr, 0, this.nXr * FL);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nXr);
    gl.disable(gl.BLEND);
  }

  // ---- numbers ------------------------------------------------------------------------------------------------
  stats() {
    let baked = 0, shelves = 0;
    for (const s of this.chunks.values()) if (s.real) baked++;
    for (const pg of this.pages) shelves += pg.shelves.length;
    const bytes = this.slots.length * CHUNK_PX * CHUNK_PX * 12 + this.slots.filter((x) => x.t[3]).length * CHUNK_PX * CHUNK_PX * 4 + this.pages.length * ATLAS_PX * ATLAS_PX * 12 + this.cw * this.ch * 14 + (this.light ? this.light.bytes() : 0);
    return {
      chunks: this.chunks.size, baked, slots: this.slots.length, sprites: this.sprites.size, pages: this.pages.length, shelves,
      gpuMB: Math.round(bytes / 1048576 * 10) / 10, msGpuApprox: Math.round(this.msGpu * 100) / 100, lights: this.lightsUsed,
      lightsIn: this.last.lights, drawn: this.last.sprites, decals: this.last.decals, chunksDrawn: this.last.chunks, quality: this.q,
      scene: [this.SW, this.SH], capacity: [this.cw, this.ch], timer: this.profile ? 'sync' : this.timer ? 'ext' : 'cpu', passes: this.times,
    };
  }
}
