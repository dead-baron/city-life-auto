// Art v2 in the game: the lighting half of the WebGL2 world renderer (engine.js). This is the Lighter of
// client/art2/light.js in game mode: the same lit / bloom / final look, run every frame on the packed
// G-buffer the engine composes from chunk textures and sprite atlases (three RGBA8 planes, gbuf.js
// packGBuf: A [albedo, coverage], B [z lo, z hi, flags, oct normal x], C [emissive, oct normal y]).
//   - targets are allocated once per capacity size and reused; the engine renders a sub-rectangle;
//   - every pattern (dither, rain speckles, fog, streak wobble) is anchored to the world, not the
//     screen (org = scene origin mod 8192), so nothing crawls when the camera moves;
//   - point AND cone lights (headlights, flashlights) from a uniform buffer, 16/32/64/96 per tier, binned
//     on the CPU into 64 px tiles (an R8UI index texture) so each pixel loops over its tile's lights only;
//   - tiered sun shadows: Ultra 3 rays x 110 steps, High 1 x 64, Medium 1 x 32 without light bands,
//     Low a 4-tap soft contact shade; the march start is dithered so coarse steps read as pixel dither;
//   - Low lights at half resolution (lighth: one texel per 2 x 2 block) and composes per texel (albedo,
//     normal, glow stay exact; each texel takes the neighbouring block whose height matches its own);
//   - wet ground: darkening, a wobbling streak under every light, and a mirror: the reflected view ray
//     marched through the height map (a lamp's image hangs below its foot), sky sheen, rain speckles;
//     open water (F_WATER) mirrors what stands in and beside it in any weather;
//   - low-lying fog in drifting banks (thick at the foot of tall things, thin on the roofs) that the
//     wide bloom lights up around lamps, a lightning flash, haze toward the top of the view, colour grade
//     (the vignette is applied by the engine's present);
//   - god rays at a low sun (High/Ultra): sunlit ground smeared toward the sun over the shade.
//
// PRESETS_GAME: dawn morning noon afternoon golden dusk (alias blue) night rain storm fog indoor - plain
// uniform objects; light.js PRESETS entries work too (missing keys take PRESET_DEFAULTS).
// blendPresets(a, b, t, out) mixes two presets (numbers and colours) into out (start it as {}: its arrays
// are created once and reused, so blending every frame allocates nothing; out may be a or b).
import { F_GROUND, F_WATER, F_NOCAST, F_WET, F_LEAF, F_GLASS, F_AIR, F_THIN } from '../gbuf.js';

const BEAM_K = 0.9;   // how bright the canopy's beams are (lightgame render: x the sun's strength, more when it is low)
// ---- quality tiers (lighting side; the engine adds cache sizes) -----------------------------------------
// stepC/stepG: the march step grows as t += stepC + t * stepG, so `steps` steps reach `reach` px.
export const LIGHT_TIERS = [
  { name: 'low', rays: 0, steps: 0, stepC: 1, stepG: 0, contact: 1, bands: 0, maxL: 16, bloom: 0, refl: 0, reflStep: 4, shafts: 0, reach: 40, half: 1 },
  { name: 'medium', rays: 1, steps: 32, stepC: 1.5, stepG: 0.075, contact: 0, bands: 0, maxL: 32, bloom: 1, refl: 12, reflStep: 6, shafts: 0, reach: 200 },
  { name: 'high', rays: 1, steps: 64, stepC: 1.0, stepG: 0.04, contact: 0, bands: 1, maxL: 64, bloom: 2, refl: 20, reflStep: 4, shafts: 1, reach: 300 },
  { name: 'ultra', rays: 3, steps: 110, stepC: 0.8, stepG: 0.0187, contact: 0, bands: 1, maxL: 96, bloom: 2, refl: 32, reflStep: 3, shafts: 1, reach: 300 },
];
export const MAX_LIGHTS = 96;
// tiled light culling: the scene is cut into TILE px tiles; each tile lists (in a TILE_K byte row of an
// R8UI texture) how many lights reach it and their indices, so a pixel only loops over those
const TILE = 64, TILE_K = 32;
export const LIGHT_FLOATS = 12;     // one light in the uniform buffer: pos (x, y, z, r), col (r, g, b, k), cone

// ---- presets -----------------------------------------------------------------------------------------
// (bands: always 5, so blending a banded preset into one without bands only fades bandMix - a fractional band count
// would slide the bands about as the light changes; motes: how much of the view is growing ground, set by the host
// each frame - the dust in the low sun)
export const PRESET_DEFAULTS = {
  sunDir: [-0.5, -0.3, 0.8], sunCol: [0, 0, 0], ambSky: [0.3, 0.3, 0.32], ambGround: [0.25, 0.24, 0.24], shadowTint: [1, 1, 1],
  shadowLen: 0, bands: 5, bandMix: 0, wet: 0, emiK: 1, bloomThr: 0.7, leafGlow: 0, bloomK: 0.8,
  haze: 0, hazeCol: [0.5, 0.5, 0.55], vign: 0.5, sat: 1, contrast: 1, lift: [0, 0, 0], gain: [1, 1, 1], reflK: 0, lampsOn: 0,
  rain: 0, skyRefl: 0.35, fog: 0, fogCol: [0.7, 0.7, 0.75], fogH: 80, shafts: 0, flash: 0, flashCol: [0.75, 0.82, 1.0], motes: 0,
};
const mk = (o) => ({ ...PRESET_DEFAULTS, ...o });
export const PRESETS_GAME = {
  // before sunrise: the sky paling, no sun yet (a faint cold glow), the lamps still on, a breath of mist
  predawn: mk({ sunDir: [0.8, -0.3, 0.3], sunCol: [0.08, 0.07, 0.12], ambSky: [0.1, 0.105, 0.2], ambGround: [0.075, 0.07, 0.11], shadowTint: [0.9, 0.9, 1.1],
    emiK: 1.12, bloomThr: 0.56, bloomK: 1.15, haze: 0.06, hazeCol: [0.32, 0.26, 0.44], vign: 0.66, sat: 1.06, contrast: 1.08,
    lift: [0.01, 0.004, 0.03], gain: [1.05, 0.99, 0.99], reflK: 0.5, lampsOn: 1, skyRefl: 0.25, fog: 0.06, fogCol: [0.62, 0.56, 0.72], fogH: 70 }),
  // first light: a low rose-gold sun from the east-north-east, violet shade, a little mist
  dawn: mk({ sunDir: [0.74, -0.34, 0.3], sunCol: [1.5, 1.08, 0.86], ambSky: [0.32, 0.33, 0.47], ambGround: [0.28, 0.24, 0.25], shadowTint: [0.84, 0.86, 1.12],
    shadowLen: 300, bands: 5, bandMix: 0.8, emiK: 0.8, bloomThr: 0.75, leafGlow: 0.45, bloomK: 0.8, haze: 0.06, hazeCol: [1.0, 0.76, 0.64], vign: 0.55,
    sat: 1.1, contrast: 1.08, lift: [0.02, 0.008, 0.03], gain: [1.04, 0.98, 0.95], lampsOn: 0.4, fog: 0.12, fogCol: [0.9, 0.8, 0.78], fogH: 70, shafts: 0.3 }),
  morning: mk({ sunDir: [0.55, -0.36, 0.68], sunCol: [1.4, 1.3, 1.1], ambSky: [0.4, 0.47, 0.62], ambGround: [0.36, 0.34, 0.31], shadowTint: [0.84, 0.9, 1.12],
    shadowLen: 200, bands: 5, bandMix: 0.85, emiK: 0.3, bloomThr: 0.85, leafGlow: 0.2, bloomK: 0.45, haze: 0.04, hazeCol: [0.85, 0.9, 1.0], vign: 0.35,
    sat: 1.16, contrast: 1.08, lift: [0.005, 0.005, 0.01], gain: [1.02, 1.0, 0.95], shafts: 0.1 }),
  // R1-B: a neutral white key from high in the north-west, short shadows, sky-blue fill
  noon: mk({ sunDir: [-0.42, -0.3, 0.86], sunCol: [1.3, 1.25, 1.12], ambSky: [0.46, 0.53, 0.68], ambGround: [0.44, 0.42, 0.38], shadowTint: [0.85, 0.9, 1.15],
    shadowLen: 120, bands: 5, bandMix: 0.85, emiK: 0.25, bloomThr: 0.9, leafGlow: 0.1, bloomK: 0.3, haze: 0.02, hazeCol: [0.8, 0.88, 1.0], vign: 0.25,
    sat: 1.2, contrast: 1.1, gain: [1.02, 1.01, 0.97] }),
  afternoon: mk({ sunDir: [-0.62, -0.3, 0.7], sunCol: [1.42, 1.27, 0.98], ambSky: [0.38, 0.44, 0.6], ambGround: [0.4, 0.36, 0.3], shadowTint: [0.82, 0.88, 1.14],
    shadowLen: 200, bands: 5, bandMix: 0.85, emiK: 0.35, bloomThr: 0.85, leafGlow: 0.3, bloomK: 0.45, haze: 0.04, hazeCol: [0.95, 0.85, 0.7], vign: 0.35,
    sat: 1.18, contrast: 1.1, lift: [0.01, 0, 0.01], gain: [1.03, 0.99, 0.93], shafts: 0.1 }),
  // R1-A: a warm orange key low in the west-north-west, long deep warm shadows with a violet cast
  golden: mk({ sunDir: [-0.72, -0.24, 0.46], sunCol: [1.85, 1.3, 0.66], ambSky: [0.22, 0.22, 0.34], ambGround: [0.28, 0.22, 0.2], shadowTint: [0.92, 0.88, 1.05],
    shadowLen: 300, bands: 5, bandMix: 0.8, emiK: 1.0, bloomThr: 0.75, leafGlow: 0.6, bloomK: 0.85, haze: 0.06, hazeCol: [1.0, 0.62, 0.32], vign: 0.55,
    sat: 1.15, contrast: 1.12, lift: [0.02, 0.005, 0.025], gain: [1.04, 0.95, 0.84], lampsOn: 0.6, shafts: 0.35 }),
  // the sun on the horizon: a deep orange-red key from the far west, the longest shadows, a violet-rose sky
  sunset: mk({ sunDir: [-0.9, -0.2, 0.24], sunCol: [1.5, 0.74, 0.42], ambSky: [0.19, 0.16, 0.29], ambGround: [0.21, 0.15, 0.16], shadowTint: [0.95, 0.86, 1.08],
    shadowLen: 300, bandMix: 0.75, emiK: 1.02, bloomThr: 0.7, leafGlow: 0.55, bloomK: 0.95, haze: 0.07, hazeCol: [0.95, 0.42, 0.38], vign: 0.58,
    sat: 1.15, contrast: 1.1, lift: [0.02, 0, 0.03], gain: [1.05, 0.93, 0.88], wet: 0.1, reflK: 0.3, lampsOn: 0.85, skyRefl: 0.3, shafts: 0.3 }),
  // AT1-A blue hour: the sun just gone, a pink rim from the west, indigo shade, lamps and windows on
  dusk: mk({ sunDir: [-0.88, -0.22, 0.14], sunCol: [0.38, 0.2, 0.27], ambSky: [0.12, 0.125, 0.25], ambGround: [0.1, 0.08, 0.13], shadowTint: [0.9, 0.9, 1.1],
    shadowLen: 150, emiK: 1.08, bloomThr: 0.58, leafGlow: 0.25, bloomK: 1.05, haze: 0.04, hazeCol: [0.26, 0.2, 0.38], vign: 0.62,
    sat: 1.12, contrast: 1.08, lift: [0.008, 0, 0.026], gain: [1.06, 0.96, 0.98], wet: 0.2, reflK: 0.5, lampsOn: 1, skyRefl: 0.28 }),
  // AT2: a dark night - only a faint blue moonlight; the lamps' sodium pools, lit windows, neon and headlights
  // do the lighting (the host gives the player a faint pool of light to see by)
  night: mk({ sunDir: [-0.45, -0.25, 0.86], sunCol: [0.022, 0.027, 0.056], ambSky: [0.023, 0.026, 0.055], ambGround: [0.017, 0.017, 0.029], emiK: 1.2, bloomThr: 0.52,
    bloomK: 1.3, haze: 0.04, hazeCol: [0.05, 0.05, 0.11], vign: 0.72, sat: 1.1, contrast: 1.1, lift: [0.004, 0.002, 0.014], gain: [1.06, 1.0, 0.96], reflK: 0.65, lampsOn: 1, skyRefl: 0.2 }),
  // overcast daytime rain: flat grey-blue light, faint shadows, everything wet
  rain: mk({ sunDir: [-0.45, -0.3, 0.84], sunCol: [0.42, 0.44, 0.5], ambSky: [0.44, 0.48, 0.58], ambGround: [0.3, 0.31, 0.35], shadowTint: [0.95, 0.97, 1.05],
    shadowLen: 60, emiK: 0.8, bloomThr: 0.7, bloomK: 0.7, haze: 0.1, hazeCol: [0.5, 0.55, 0.64], vign: 0.5, sat: 0.92, contrast: 1.04,
    lift: [0, 0.005, 0.02], gain: [0.98, 1.0, 1.04], wet: 1, reflK: 1.0, rain: 1, lampsOn: 0.6, skyRefl: 0.45, fog: 0.06, fogCol: [0.55, 0.58, 0.65], fogH: 90 }),
  // AT1-B: night storm, soaked streets mirroring every light; set .flash for lightning
  storm: mk({ sunDir: [-0.45, -0.25, 0.86], sunCol: [0.03, 0.034, 0.064], ambSky: [0.042, 0.05, 0.1], ambGround: [0.034, 0.038, 0.068], emiK: 1.1, bloomThr: 0.55,
    bloomK: 1.2, haze: 0.08, hazeCol: [0.12, 0.15, 0.3], vign: 0.7, sat: 1.12, contrast: 1.12, lift: [0, 0.005, 0.03], gain: [1.06, 1.0, 0.98],
    wet: 1, reflK: 1.3, rain: 1, lampsOn: 1, skyRefl: 0.3, flashCol: [0.7, 0.8, 1.15] }),
  // AT1-C: a soft rose fog lying in the streets in drifting banks, lamps glowing through it
  fog: mk({ sunDir: [-0.62, -0.3, 0.5], sunCol: [0.5, 0.4, 0.38], ambSky: [0.36, 0.32, 0.42], ambGround: [0.3, 0.26, 0.3], shadowTint: [0.95, 0.92, 1.06],
    shadowLen: 80, emiK: 1.0, bloomThr: 0.6, bloomK: 1.1, haze: 0.06, hazeCol: [0.72, 0.6, 0.66], vign: 0.45, sat: 0.9, contrast: 0.95,
    lift: [0.03, 0.02, 0.035], gain: [1.02, 0.97, 0.98], wet: 0.3, reflK: 0.5, lampsOn: 1, fog: 0.6, fogCol: [0.78, 0.6, 0.62], fogH: 70, skyRefl: 0.3 }),
  // ... after dark: the mist lies grey-blue and dim, the lamps glow in it (the host blends fog toward this by night)
  fogNight: mk({ sunDir: [-0.45, -0.25, 0.86], sunCol: [0.04, 0.045, 0.07], ambSky: [0.07, 0.07, 0.11], ambGround: [0.055, 0.055, 0.075], shadowTint: [1, 1, 1.05],
    emiK: 1.1, bloomThr: 0.52, bloomK: 1.3, haze: 0.06, hazeCol: [0.1, 0.1, 0.15], vign: 0.6, sat: 0.9, contrast: 1.0,
    lift: [0.012, 0.012, 0.02], gain: [1.02, 1.0, 1.0], wet: 0.3, reflK: 0.5, lampsOn: 1, fog: 0.6, fogCol: [0.42, 0.42, 0.5], fogH: 70, skyRefl: 0.25 }),
  // indoors and underground: no sun, a warm fill, the room's own lamps do the rest
  indoor: mk({ sunDir: [-0.4, -0.3, 0.86], ambSky: [0.3, 0.28, 0.27], ambGround: [0.22, 0.2, 0.2], emiK: 1.0, bloomThr: 0.62,
    bloomK: 0.9, haze: 0.03, hazeCol: [0.3, 0.24, 0.18], vign: 0.55, sat: 1.15, contrast: 1.1, lift: [0.01, 0, 0.02], gain: [1.06, 1.0, 0.94], lampsOn: 1 }),
};
PRESETS_GAME.blue = PRESETS_GAME.dusk;

// a + (b - a) * t for every preset key, written into out (arrays inside out are reused)
export function blendPresets(a, b, t, out = {}) {
  for (const k in PRESET_DEFAULTS) {
    const x = a[k] ?? PRESET_DEFAULTS[k], y = b[k] ?? PRESET_DEFAULTS[k];
    if (typeof x === 'number') out[k] = x + (y - x) * t;
    else {
      let o = out[k];
      if (!o || o.length !== x.length) o = out[k] = new Array(x.length);
      for (let i = 0; i < x.length; i++) o[i] = x[i] + (y[i] - x[i]) * t;
    }
  }
  return out;
}
const pv = (P, k) => P[k] ?? PRESET_DEFAULTS[k];
const luma3 = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// A sun lower in the sky than its preset's lights the flat ground less (lambert): the preset's brightness on the
// ground is kept, up to half as much again, so golden hour stays golden with its long shadows instead of sinking
// into dusk an hour early. p: a blended preset (its own arrays), pz: the sine of the preset's own sun elevation,
// s: the sky's (the host moves the sun to where the clock puts it).
// w (0..1): how far the sun's own place leads the light (the host eases it in from the night preset's moon), the
// keeping eased in with it.
export function sunKeep(p, pz, s, w = 1) {
  if (!(s < pz) || !p.sunCol || !(w > 0)) return;
  const k = 1 + (Math.min(1.5, pz / Math.max(0.05, s)) - 1) * Math.min(1, w), c = p.sunCol;
  for (let i = 0; i < c.length; i++) c[i] *= k;
}

// How strong the god rays are for a preset P and the sun's height el (the sine of its elevation): shaftK the low
// sun's rays over sunlit ground (tiers with shafts), beamK the beams down through the redwood canopy (can: the canopy
// in view), moteK the dust drifting in the low sun over growing ground (P.motes: how much of the view is). Only for
// a low sun that is really shining - from just after sunrise until it is well up, and from late afternoon through
// golden hour - each eased in and out with the sun's height and strength, so nothing pops on or off as the light
// changes; rain and fog thin them. out: reused.
export function godRays(P, el, shafts, can, wet = 0, fog = 0, out = {}) {
  const sh = pv(P, 'shafts'), sunL = luma3(pv(P, 'sunCol')), risen = sstep(0.09, 0.2, el), nat = pv(P, 'motes');
  out.shaftK = shafts && sh > 0 ? sh * risen * (1 - sstep(0.4, 0.6, el)) * sstep(0.3, 1.1, sunL) : 0;
  out.beamK = can ? Math.min(1.6, sunL) * (0.45 + 0.55 * (1 - el)) * risen * (1 - sstep(0.44, 0.64, el)) * sstep(0.25, 0.9, sunL) * (pv(P, 'beams') ?? 1) * BEAM_K : 0;
  out.moteK = nat > 0 ? Math.min(1, nat) * risen * (1 - sstep(0.48, 0.7, el)) * sstep(0.35, 1.0, sunL) * (1 - Math.min(1, wet * 1.5)) * (1 - Math.min(1, fog * 1.2)) : 0;
  return out;
}

// ---- GL helpers (shared with engine.js) ----------------------------------------------------------------
export function glProgram(gl, vs, fs, attribs = ['p'], samplers = null, blocks = null) {
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').slice(0, 4).join(' '));
    return s;
  };
  const p = gl.createProgram(), v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v); gl.attachShader(p, f);
  attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(p));
  gl.deleteShader(v); gl.deleteShader(f);
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i), loc = gl.getUniformLocation(p, info.name); if (loc) u[info.name.replace(/\[0\]$/, '')] = loc; }
  gl.useProgram(p);
  if (samplers) for (const k in samplers) if (u[k]) gl.uniform1i(u[k], samplers[k]);
  if (blocks) for (const k in blocks) { const bi = gl.getUniformBlockIndex(p, k); if (bi !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, bi, blocks[k]); }
  return { p, u };
}
export function glTex(gl, w, h, linear = false) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
  const f = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
export function glFbo(gl, texs, depth = null) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  if (depth) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) throw new Error('framebuffer incomplete ' + st);
  return f;
}

// ---- shaders -------------------------------------------------------------------------------------------
export const TRI_VS = `#version 300 es
in vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

// decoders for the packed planes, world-anchored dither and hash
export const GLSL_COMMON = `
float zOf(vec4 b){ return floor(b.r * 255.0 + 0.5) + floor(b.g * 255.0 + 0.5) * 256.0; }
int flOf(vec4 b){ return int(b.b * 255.0 + 0.5); }
vec3 octDec(float ex, float ey){
  vec2 f = vec2(floor(ex * 255.0 + 0.5), floor(ey * 255.0 + 0.5)) / 127.0 - 1.0;
  vec3 n = vec3(f, 1.0 - abs(f.x) - abs(f.y));
  float t = max(-n.z, 0.0);
  n.x += n.x >= 0.0 ? -t : t; n.y += n.y >= 0.0 ? -t : t;
  return normalize(n);
}
float bayer4(ivec2 q){ int i = (q.y & 3) * 4 + (q.x & 3);
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return float(b[i]) / 16.0 - 0.5 + 1.0 / 32.0; }
float hash2(ivec2 p){ uint h = uint(p.x) * 374761393u + uint(p.y) * 668265263u; h = (h ^ (h >> 13u)) * 1274126177u; return float((h ^ (h >> 16u)) & 16777215u) / 16777216.0; }
`;

// The redwood canopy (canopy.js), shared by the light (LIT_DECL canopyVis: the sunflecks) and the god rays
// (SHAFT_FS: the beams), so the beams come down through the very gaps the flecks shine through. tCan: how thick
// the crowns are per cell of its box; canO: the box's world origin (px) and 1 / its size (px); canH: the layer's
// height (px), 0 when none is in view. canopyCover(c, d): at world point c of the layer, how much of the sun the
// leaf clumps there take (0..1: noise anchored to the world, stirring with the wind; 0 outside the crowns), d the
// crowns' thickness. Needs time and wind4.
const CANOPY_GLSL = `
uniform sampler2D tCan; uniform vec4 canO; uniform float canH;
float cnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  return mix(mix(hash2(c), hash2(c + ivec2(1, 0)), f.x), mix(hash2(c + ivec2(0, 1)), hash2(c + ivec2(1, 1)), f.x), f.y);
}
float canopyCover(vec2 c, out float d){
  vec2 uv = (c - canO.xy) * canO.zw;
  d = 0.0;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 0.0;
  d = texture(tCan, uv).r;
  if (d < 0.01) return 0.0;
  vec2 dr = wind4.zw * (time * (3.0 + wind4.x * 12.0));
  float n = cnoise((c + dr) * 0.022) * 0.62 + cnoise((c - dr * 0.5) * 0.06) * 0.38;
  return smoothstep(n - 0.05, n + 0.05, d * 0.7 + 0.1);
}
`;

// AP: world px per art pixel (engine.js): the dithers, the water's waves and foam and the rain marks are worked
// out once per art pixel of the world (they are part of the pixel art); the light itself stays per world px
const HEAD = (T, AP = 1) => `#version 300 es
#define AP ${AP}
#define MAXL ${T.maxL}
#define RAYS ${T.rays}
#define STEPS ${Math.max(1, T.steps)}
#define STEPC ${T.stepC.toFixed(4)}
#define STEPG ${T.stepG.toFixed(4)}
#define THIN_D 10.0
#define CONTACT ${T.contact}
#define BANDS ${T.bands}
#define REFL ${T.refl}
#define REFLSTEP ${T.reflStep.toFixed(2)}
#define SHAFTS ${T.shafts}
precision highp float; precision highp int; precision highp sampler2D;
`;

// Shared by lit (full resolution) and lighth + compose (Low: the lights at half resolution).
const LIT_DECL = `
uniform sampler2D tA, tB, tC;
uniform ivec2 isize, org;
uniform vec3 sunDir, sunCol, ambSky, ambGround, shadowTint, flashCol;
uniform float shadowLen, bands, bandMix, wet, emiK, leafGlow, time, flash, rain, skyRefl;
uniform int nL;
uniform highp usampler2D tTiles;   // per ${TILE} px tile: count, then up to ${TILE_K - 1} light indices
uniform vec2 worg;                 // the world px of scene texel (0, 0): water and rain are anchored to the world
uniform vec4 wind4;                // the wind: strength, gustiness, direction x, y (render/flora/wind.js)
struct Light { vec4 pos; vec4 col; vec4 cone; };
layout(std140) uniform Lights { Light L[MAXL]; };
${GLSL_COMMON}
float wnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  return mix(mix(hash2(c), hash2(c + ivec2(1, 0)), f.x), mix(hash2(c + ivec2(0, 1)), hash2(c + ivec2(1, 1)), f.x), f.y);
}
${CANOPY_GLSL}
// The canopy far overhead: where the ray from P toward the sun meets it, the crowns' thickness there and their
// leaf clumps take the sun but for the gaps between - the sunflecks on the forest floor, the light on the trunks.
float canopyVis(vec3 P){
  float up = canH - P.z;
  if (up <= 0.0 || sunDir.z < 0.04) return 1.0;
  float d;
  return 1.0 - canopyCover(worg + P.xy + sunDir.xy * (up / sunDir.z), d) * 0.94;
}
// Water. Open water rolls with little waves along the wind (the normal tilts with them; the sun glints off the
// crests in crisp pixels). Near a shore - code: the shore distance the ground bake keeps in the albedo's alpha
// (groundbake surf: 191 + px out into the water, 191 - px up a beach) - a wave runs in every few seconds (each
// stretch of shore in its own time), breaks into foam, and its swash runs up the sand and back, leaving it wet.
// Anchored to the world (w: world px): nothing travels with the camera. alb is linear; returns the glint.
float waterSurf(inout vec3 alb, inout vec3 n, int fl, float code, vec2 w, ivec2 wq){
  float glint = 0.0, t = time;
  int cf = int(code + 0.5);
  if (cf >= 239 && cf <= 254 && (fl & ${F_WATER}) != 0) {
    // a river or a creek running downstream (the ground bake's code: which way, sixteenths of a turn): ripples
    // whose crests cross the current and travel with it, a fine chop, the light sliding over them, and flecks of
    // foam riding the current
    float fa = float(cf - 239) * 0.3927;
    vec2 fd = vec2(cos(fa), sin(fa)), fn = vec2(-fd.y, fd.x);
    float al = dot(w, fd), ac = dot(w, fn);
    float p1 = al * 0.15 - t * 3.6 + sin(ac * 0.06) * 1.6, p2 = al * 0.33 - t * 5.4 + ac * 0.09 + 1.3;
    float hgt = sin(p1) * 0.65 + sin(p2) * 0.35;
    alb *= 1.0 + hgt * 0.06;
    vec3 nw = normalize(vec3(n.xy + fd * (cos(p1) * 0.22 + cos(p2) * 0.1), n.z)), H = normalize(sunDir + vec3(0.0, 0.5, 0.866));
    n = nw;
    glint = step(0.7 + bayer4(wq) * 0.25, pow(max(dot(nw, H), 0.0), 120.0)) * 0.5;
    float fo = wnoise(vec2(al * 0.03 - t * 1.4, ac * 0.22)) * 0.7 + wnoise(vec2(al * 0.08 - t * 2.6, ac * 0.4 + 7.0)) * 0.3;
    if (fo > 0.79 + bayer4(wq) * 0.08) alb = mix(alb, vec3(0.74, 0.84, 0.86), 0.28 + (fo - 0.79) * 1.6);
    return glint;
  }
  if ((fl & ${F_WATER}) != 0 && (fl & ${F_WET}) == 0) {
    // two wave trains along the wind and a fine chop: the water brightens a little on the crests, and where a
    // crest faces the sun just so, it glints (the baked ripples keep shading the surface)
    vec2 d1 = normalize(wind4.zw + vec2(1e-3, 0.0)), d2 = normalize(vec2(-d1.y, d1.x) * 0.7 + d1);
    float A = 0.16 + wind4.x * 0.5;
    float p1 = dot(w, d1) * 0.13 - t * 1.7, p2 = dot(w, d2) * 0.21 - t * 2.3 + 1.7, p3 = dot(w, vec2(0.37, -0.29)) - t * 3.1;
    float hgt = sin(p1) + sin(p2) * 0.6 + sin(p3) * 0.25;
    alb *= 1.0 + hgt * (0.025 + wind4.x * 0.03);
    vec2 g = d1 * cos(p1) + d2 * (cos(p2) * 0.6) + vec2(0.37, -0.29) * (cos(p3) * 0.25);
    vec3 nw = normalize(vec3(n.xy + g * A, n.z)), H = normalize(sunDir + vec3(0.0, 0.5, 0.866));
    glint = step(0.72 + bayer4(wq) * 0.25, pow(max(dot(nw, H), 0.0), 160.0)) * 0.5;
  }
  int ci = int(code + 0.5);
  if (ci >= 143 && ci <= 238) {
    float sd = float(ci - 191);                                    // + out into the water, - up the beach
    float al = wnoise(w * vec2(0.012, 0.009));                      // along the shore: waves arrive at different times
    float c = fract(t / 7.0 + al * 0.6);                            // this stretch of shore's place in its wave cycle
    float reach = 10.0 + al * 10.0;
    float run = reach * pow(sin(3.14159 * clamp((c - 0.3) / 0.7, 0.0, 1.0)), 0.6); // the swash up the sand
    float front = 47.0 * (1.0 - c / 0.32);                          // the wave coming in, until it breaks
    float foam = 0.0;
    if (sd >= 0.0) {
      float df = sd - front;
      if (c < 0.32 && df > -1.5 && df < 12.0) foam = (df < 2.5 ? 1.0 : (1.0 - (df - 2.5) / 9.5) * 0.85) * smoothstep(0.0, 0.08, c); // (it builds as it comes in)
      if (sd < 2.0 + sin(t * 1.9 + al * 9.0)) foam = max(foam, 0.7);   // lapping at the water's edge
    } else {
      float ds = -sd;
      if (ds < run - 1.6) { alb = mix(alb, vec3(0.2, 0.5, 0.56), 0.45); n = vec3(0.0, 0.0, 1.0); }   // a thin sheet of clear water
      else if (ds < run + 0.8) foam = 1.0;
      else if (ds < reach) alb *= 0.88;                            // still wet from the last wave
    }
    if (foam > bayer4(wq) + 0.5) alb = mix(alb, vec3(0.86, 0.9, 0.93), 0.85);
  }
  return glint;
}
// Falling water (a waterfall's sheets: water that isn't ground): streaks running down it, brighter and darker,
// and white water breaking through them - on the screen's own rows, so it pours down the face.
void fallingWater(inout vec3 alb, vec2 w){
  float st = wnoise(vec2(w.x * 0.42, w.y * 0.055 - time * 3.4)) * 0.62 + wnoise(vec2(w.x * 0.95 + 3.0, w.y * 0.11 - time * 5.2)) * 0.38;
  alb *= 0.8 + st * 0.45;
  if (st > 0.7) alb = mix(alb, vec3(0.86, 0.93, 0.96), clamp((st - 0.7) * 2.4, 0.0, 0.8));
}
// Rain on the world (not on the screen): rings spreading on water and puddles, small splashes on wet ground and
// on anything facing up (car roofs too). up: the normal's z. Returns light to add (display units).
float rainMarks(vec2 w, bool water, float up){
  if (rain <= 0.0 || up < 0.75) return 0.0;
  float cs = water ? 20.0 : 12.0, life = water ? 1.1 : 0.35, add = 0.0;
  vec2 cell = floor(w / cs), f = fract(w / cs), sgn = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0);
  for (int k = 0; k < 4; k++) {
    vec2 c = cell + vec2(float(k & 1), float(k >> 1)) * sgn;
    ivec2 ic = ivec2(c);
    float u = time / life + hash2(ic + ivec2(911, 37)), slot = floor(u), age = u - slot;
    int si = int(slot);
    if (hash2(ic + ivec2(si * 13, si * 7)) > rain * (water ? 0.35 : 0.1)) continue;   // no drop here this time
    vec2 dv = w - (c + vec2(hash2(ic + ivec2(si, 3)), hash2(ic + ivec2(5, si)))) * cs;
    dv.y *= 1.8;                                                    // seen at an angle: rings are flattened
    float d = length(dv);
    if (water) add += step(abs(d - 1.0 - age * 7.0), 0.6) * (1.0 - age) * 0.35;
    else if (age < 0.5) add += step(d, 1.0) * 0.22 + step(abs(d - 2.0 - age * 3.0), 0.5) * (0.5 - age) * 0.3;
  }
  return add * rain;
}
// how much sun reaches P (1 .. 0): a march toward the sun through the height map, or (Low) a few taps
float sunVis(vec3 P, ivec2 wq){
  float sh = 1.0;
#if RAYS > 0
  float occSum = 0.0;
  vec3 side = normalize(vec3(-sunDir.y, sunDir.x, 0.0) + vec3(1e-4, 0.0, 0.0));
  float jit = (bayer4(wq) + 0.5) * STEPC;
  for (int ray = 0; ray < RAYS; ray++) {
    float rk = float(ray) - float(RAYS - 1) * 0.5;
    vec3 dir = normalize(sunDir + side * (rk * 0.035) + vec3(0.0, 0.0, rk * 0.02));
    float t = 1.5 + jit + float(ray) * 0.33, occ = 0.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 R = P + dir * t;
      ivec2 s = ivec2(floor(R.x), floor(R.y - R.z));
      if (s.x < 0 || s.y < 0 || s.x >= isize.x || s.y >= isize.y || R.z > 700.0) break;
      vec4 b = texelFetch(tB, s, 0);
      float hz = zOf(b);
      if (hz > R.z + 1.5 && hz - R.z < 140.0) {
        int f2 = flOf(b);
        // (a thin thing - a post, a person - only blocks rays that pass just behind its face)
        if ((f2 & ${F_NOCAST}) == 0 && ((f2 & ${F_THIN}) == 0 || hz - R.z < THIN_D)) { occ = max(occ, (f2 & ${F_LEAF}) != 0 ? 0.75 : 1.0); if (occ >= 1.0) break; }
      }
      t += STEPC + t * STEPG;
      if (t > shadowLen) break;
    }
    occSum += occ;
  }
  sh = 1.0 - occSum / float(RAYS);
#elif CONTACT
  float occ = 0.0;
  for (int i = 1; i <= 4; i++) {
    float t = float(i * i) * 2.0 + 1.0;
    vec3 R = P + sunDir * t;
    ivec2 s = ivec2(floor(R.x), floor(R.y - R.z));
    if (s.x < 0 || s.y < 0 || s.x >= isize.x || s.y >= isize.y) break;
    vec4 b = texelFetch(tB, s, 0);
    float hz = zOf(b);
    int f2 = flOf(b);
    if (hz > R.z + 1.5 && hz - R.z < ((f2 & ${F_THIN}) != 0 ? THIN_D : 140.0) && (f2 & ${F_NOCAST}) == 0) occ = max(occ, 1.0 - float(i - 1) * 0.2);
  }
  sh = 1.0 - occ * 0.8;
#endif
  return canH > 0.0 && sh > 0.0 ? sh * canopyVis(P) : sh;
}
// the point and cone lights of this pixel's tile reaching P; on wet ground (wg) also the wobbling
// streak each light leaves below its foot
void pointLights(vec3 P, vec3 n, ivec2 q, bool wg, inout vec3 light, inout vec3 refl){
  float wy = floor((P.y + float(org.y)) / float(AP)) * float(AP);
  ivec2 tile = q / ${TILE};
  int tb = tile.x * ${TILE_K}, cnt = min(nL, int(texelFetch(tTiles, ivec2(tb, tile.y), 0).r));
  for (int j = 0; j < ${TILE_K - 1}; j++) {
    if (j >= cnt) break;
    int i = int(texelFetch(tTiles, ivec2(tb + 1 + j, tile.y), 0).r);
    vec4 lp = L[i].pos;
    vec3 v = lp.xyz - P;
    float r = lp.w, d2 = dot(v, v);
    if (d2 < r * r) {
      float d = sqrt(d2) + 1e-3;
      float a = 1.0 - d / r; a *= a;
      vec4 cn = L[i].cone;
      float nd = dot(n, v / d), w;
      if (cn.z > -1.5) {
        // a beam: soft edges across and at the lamp; low beams still light the road they graze, but
        // nothing that faces away from them
        vec2 vh = -v.xy; float dh = length(vh) + 1e-3;
        a *= smoothstep(cn.z, cn.w, dot(vh, cn.xy) / dh) * smoothstep(3.0, 18.0, dh);
        w = clamp((nd + 0.2) * 2.0, 0.0, 1.0) * (0.55 + 0.45 * max(nd, 0.0));
      } else w = max(nd, 0.0) * 0.8 + 0.2;
      light += L[i].col.rgb * (L[i].col.a * a * w);
    }
    if (wg) {
      float dx = P.x - lp.x, dy = P.y - lp.y, len = 30.0 + lp.z * 1.4;
      if (dy > -4.0 && dy < len) {
        float wob = sin(wy * 0.3927 + r * 0.37) * 1.2 + sin(wy * 1.5708) * 0.6;
        float wdt = 2.0 + max(dy, 0.0) * 0.05 + r * 0.012, ac = (dx - wob) / wdt;
        float across = exp(-ac * ac);
        if (across > 0.02) {
          float along = 1.0 - clamp(dy / len, 0.0, 1.0); along *= along;
          float dash = 0.55 + 0.45 * step(0.35, fract(wy * 0.25 + r * 0.13));
          refl += L[i].col.rgb * (L[i].col.a * across * along * dash * 0.22);
        }
      }
    }
  }
}
// ambient + sun (shadow sh) for normal n, then the surface: albedo, wet, glow, glass, rain; returns the
// display colour (filmic curve, gamma) and, in alpha, sunlit ground for the god rays
vec4 shade(vec3 alb, vec3 n, int fl, float sh, vec3 plight, vec3 refl, vec3 emi, ivec2 wq){
  bool ground = (fl & ${F_GROUND}) != 0, wg = ground && wet > 0.0;
  float lam = max(dot(n, sunDir), 0.0), direct = lam * sh;
#if BANDS
  if (bands > 0.5) { float qd = floor(direct * bands + 0.5 + bayer4(wq) * 0.6) / bands; direct = mix(direct, clamp(qd, 0.0, 1.0), bandMix); }
#endif
  vec3 amb = mix(ambGround, ambSky, n.z * 0.5 + 0.5);
  amb = mix(amb, amb * shadowTint, (1.0 - sh) * step(0.01, lam));
  vec3 light = amb + sunCol * direct + plight;
  if ((fl & ${F_LEAF}) != 0) light += sunCol * leafGlow * pow(max(dot(n.xy, sunDir.xy), 0.0), 2.0) * sh;
  if (flash > 0.0) light += flashCol * (flash * (0.35 + 0.65 * max(n.z, 0.0)));
  vec3 col = alb;
  if (wg && (fl & ${F_WATER}) == 0) col *= mix(1.0, 0.7, wet);
  vec3 lit = col * light;
  if ((fl & ${F_GLASS}) != 0) lit += ambSky * 0.12;
  if (wet > 0.0 && (fl & ${F_WET | F_GROUND}) != 0) {
    lit += ambSky * (skyRefl * wet * (0.25 + 0.75 * max(n.z, 0.0)) * 0.5);
    if (rain > 0.0 && hash2(wq + ivec2(0, int(time * 12.0) * 7919)) > 1.0 - 0.0015 * rain) lit += vec3(0.55, 0.6, 0.75) * rain;
  }
  lit += pow(emi, vec3(2.2)) * emiK + refl * wet;
  vec3 m = lit / (1.0 + lit * 0.18);
  return vec4(pow(m, vec3(1.0 / 2.2)), ground ? sh * step(0.01, lam) : 0.0);
}
`;

// lit: albedo x (ambient + sun with cast shadows + point and cone lights) + glow + wet streaks, per texel
const LIT_FS = `
layout(location=0) out vec4 o0;
${LIT_DECL}
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy);
  vec4 A = texelFetch(tA, q, 0);
  if (A.a < 0.01) { o0 = vec4(0.0); return; }
  vec4 B = texelFetch(tB, q, 0), C = texelFetch(tC, q, 0);
  vec3 n = octDec(B.a, C.a);
  float Z = zOf(B);
  int fl = flOf(B);
  ivec2 wq = (q + org) / AP;                                       // the art pixel of the world
  vec3 P = vec3(float(q.x) + 0.5, float(q.y) + 0.5 + Z, Z);
  float sh = dot(n, sunDir) > 0.0 && sunDir.z > 0.02 && shadowLen > 0.0 ? sunVis(P, wq) : 1.0;
  vec3 plight = vec3(0.0), refl = vec3(0.0);
  pointLights(P, n, q, (fl & ${F_GROUND}) != 0 && wet > 0.0, plight, refl);
  vec3 alb = pow(A.rgb, vec3(2.2));
  vec2 w = (floor((worg + vec2(q)) / float(AP)) + 0.5) * float(AP);   // (its centre, world px)
  float gl = (fl & ${F_GROUND}) != 0 ? waterSurf(alb, n, fl, A.a * 255.0, w, wq) : 0.0;
  if ((fl & ${F_WATER}) != 0 && (fl & ${F_GROUND}) == 0) fallingWater(alb, w);
  o0 = shade(alb, n, fl, sh, plight, refl, C.rgb, wq);
  float add = gl * clamp(max(sunCol.r, sunCol.g) * 0.8, 0.0, 1.0) * sh + rainMarks(w, (fl & ${F_WATER}) != 0, n.z);
  if (add > 0.0) o0.rgb = min(o0.rgb + vec3(add), vec3(1.0));
}`;

// Low: the lights at half resolution. lighth lights the top-left texel of each 2 x 2 block: rgb = point
// lights (sqrt of /8), a = sun visibility; second target rgb = wet streaks (sqrt of /4), a = its height.
const LIGHTH_FS = `
layout(location=0) out vec4 oL; layout(location=1) out vec4 oR;
${LIT_DECL}
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy) * 2;
  vec4 B = texelFetch(tB, q, 0), C = texelFetch(tC, q, 0);
  vec3 n = octDec(B.a, C.a);
  float Z = zOf(B);
  int fl = flOf(B);
  vec3 P = vec3(float(q.x) + 0.5, float(q.y) + 0.5 + Z, Z);
  float sh = sunDir.z > 0.02 && shadowLen > 0.0 ? sunVis(P, (q + org) / AP) : 1.0;
  vec3 plight = vec3(0.0), refl = vec3(0.0);
  pointLights(P, n, q, (fl & ${F_GROUND}) != 0 && wet > 0.0, plight, refl);
  oL = vec4(sqrt(clamp(plight * 0.125, 0.0, 1.0)), sh);
  oR = vec4(sqrt(clamp(refl * 0.25, 0.0, 1.0)), clamp(Z / 1020.0, 0.0, 1.0));
}`;
// compose: every texel with its own albedo, normal (sun shading) and glow, and the half-resolution light
// of the neighbouring block whose height matches its own (so lamp light does not bleed over roof edges)
const COMPOSE_FS = `
layout(location=0) out vec4 o0;
uniform sampler2D tLH, tRH;
uniform ivec2 hsize;
${LIT_DECL}
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy);
  vec4 A = texelFetch(tA, q, 0);
  if (A.a < 0.01) { o0 = vec4(0.0); return; }
  vec4 B = texelFetch(tB, q, 0), C = texelFetch(tC, q, 0);
  vec3 n = octDec(B.a, C.a);
  float Z = zOf(B);
  int fl = flOf(B);
  ivec2 h = q / 2, pick = h;
  vec4 R = texelFetch(tRH, h, 0);
  float best = abs(R.a * 1020.0 - Z);
  if (best > 4.0) {
    ivec2 o = ivec2((q.x & 1) * 2 - 1, (q.y & 1) * 2 - 1), hm = hsize - 1;
    ivec2 c1 = clamp(h + ivec2(o.x, 0), ivec2(0), hm), c2 = clamp(h + ivec2(0, o.y), ivec2(0), hm), c3 = clamp(h + o, ivec2(0), hm);
    vec4 R1 = texelFetch(tRH, c1, 0), R2 = texelFetch(tRH, c2, 0), R3 = texelFetch(tRH, c3, 0);
    float d1 = abs(R1.a * 1020.0 - Z), d2 = abs(R2.a * 1020.0 - Z), d3 = abs(R3.a * 1020.0 - Z);
    if (d1 < best) { best = d1; pick = c1; R = R1; }
    if (d2 < best) { best = d2; pick = c2; R = R2; }
    if (d3 < best) { best = d3; pick = c3; R = R3; }
  }
  vec4 LH = texelFetch(tLH, pick, 0);
  vec3 alb = pow(A.rgb, vec3(2.2));
  vec2 w = (floor((worg + vec2(q)) / float(AP)) + 0.5) * float(AP);
  ivec2 wq = (q + org) / AP;
  float gl = (fl & ${F_GROUND}) != 0 ? waterSurf(alb, n, fl, A.a * 255.0, w, wq) : 0.0;
  if ((fl & ${F_WATER}) != 0 && (fl & ${F_GROUND}) == 0) fallingWater(alb, w);
  o0 = shade(alb, n, fl, LH.a, LH.rgb * LH.rgb * 8.0, R.rgb * R.rgb * 4.0, C.rgb, wq);
  float add = gl * clamp(max(sunCol.r, sunCol.g) * 0.8, 0.0, 1.0) * LH.a + rainMarks(w, (fl & ${F_WATER}) != 0, n.z);
  if (add > 0.0) o0.rgb = min(o0.rgb + vec3(add), vec3(1.0));
}`;

// bloom source at half size: glow + whatever is brighter than the threshold
const EXTRACT_FS = `#version 300 es
precision highp float; precision highp sampler2D;
layout(location=0) out vec4 o;
uniform sampler2D tLit, tC; uniform vec2 fullTex, maxUV; uniform float bloomThr, emiK;
void main(){
  vec2 uv = min(gl_FragCoord.xy * 2.0 / fullTex, maxUV);
  vec3 lit = texture(tLit, uv).rgb, e = texture(tC, uv).rgb;
  vec3 glow = pow(e, vec3(2.2)) * emiK;
  o = vec4(pow(glow, vec3(1.0 / 2.2)) + max(lit - bloomThr, 0.0) * 0.6, 1.0);
}`;

// separable 5-tap gaussian (light.js); scale = source px per target px (2 when downsampling)
const BLUR_FS = `#version 300 es
precision highp float; precision highp sampler2D;
layout(location=0) out vec4 o;
uniform sampler2D src; uniform vec2 srcTex, dir, maxUV; uniform float scale;
void main(){
  vec2 uv = gl_FragCoord.xy * scale / srcTex, d = dir / srcTex;
  vec4 s = texture(src, min(uv, maxUV)) * 0.227;
  s += texture(src, min(uv + d * 1.385, maxUV)) * 0.316; s += texture(src, min(uv - d * 1.385, maxUV)) * 0.316;
  s += texture(src, min(uv + d * 3.231, maxUV)) * 0.070; s += texture(src, min(uv - d * 3.231, maxUV)) * 0.070;
  o = s;
}`;

// god rays at quarter size. r: sunlit ground smeared toward the sun, kept over shade (High and Ultra, a low sun).
// g: under the redwood canopy (every tier), the beams themselves - the sunlit air in front of what is drawn at
// this pixel: up the column of air over it (from the surface's height to the canopy: what is behind the
// surface is hidden), the share of points whose way to the sun goes out through a gap in the crowns.
const SHAFT_FS = (T) => `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
#define SMEAR ${T.shafts}
#define BEAMN ${T.rays > 1 ? 14 : T.rays > 0 ? 11 : 8}
layout(location=0) out vec4 o;
uniform sampler2D tLit, tB; uniform vec2 fullTex, maxUV, sdir; uniform float slen, smear; uniform ivec2 org;
uniform vec3 sunDir; uniform vec2 worg; uniform vec4 wind4; uniform float time;
${GLSL_COMMON}
${CANOPY_GLSL}
void main(){
  vec2 p = gl_FragCoord.xy * 4.0;
  float j = hash2(ivec2(gl_FragCoord.xy) + org / 4), acc = 0.0, beam = 0.0;
#if SMEAR
  if (smear > 0.0) {
    float ws = 0.0;
    for (int i = 0; i < 24; i++) {
      float t = (float(i) + j) / 24.0, w = 1.0 - t * 0.7;
      acc += texture(tLit, min((p + sdir * (t * slen)) / fullTex, maxUV)).a * w; ws += w;
    }
    float here = texture(tLit, min(p / fullTex, maxUV)).a;
    acc = acc / ws * (1.0 - 0.8 * here);
  }
#endif
  if (canH > 0.0 && sunDir.z > 0.04) {
    vec2 q = min(p, fullTex * maxUV);
    float z0 = zOf(texelFetch(tB, ivec2(q), 0)), z1 = canH;
    if (z1 > z0 + 4.0) {
      for (int i = 0; i < BEAMN; i++) {
        float z = mix(z0, z1, (float(i) + j) / float(BEAMN)), d;
        vec2 a = worg + vec2(q.x, q.y + z);                              // the air at height z over this pixel
        float cov = canopyCover(a + sunDir.xy * ((canH - z) / sunDir.z), d);
        beam += (1.0 - cov) * smoothstep(0.08, 0.45, d);                 // (through a gap, not round the edge)
      }
      beam *= (z1 - z0) / (float(BEAMN) * canH);
    }
  }
  o = vec4(acc, beam, 0.0, 1.0);
}`;

// final: wet reflections, god rays, fog, bloom, lightning, haze, grade
const FINAL_FS = `
layout(location=0) out vec4 o;
uniform sampler2D tLit, tB, tBH, tBQ, tSh;
uniform vec2 halfTex, quarterTex, maxUVh, maxUVq;
uniform ivec2 org;
uniform vec4 view;
uniform float wet, reflK, bloomK, haze, sat, contrast, time, fog, fogH, flash, shaftK, beamK, moteK, useBH, useBQ;
uniform vec3 hazeCol, lift, gain, fogCol, flashCol, shaftCol;
${GLSL_COMMON}
// value noise on a lattice of cell px that repeats every per cells (so it wraps seamlessly with org)
float vnoiseP(vec2 p, vec2 cell, ivec2 per){
  vec2 g = p / cell, i = floor(g), f = g - i; f = f * f * (3.0 - 2.0 * f);
  ivec2 a = ivec2(i) % per, b = (ivec2(i) + 1) % per;
  return mix(mix(hash2(a), hash2(ivec2(b.x, a.y)), f.x), mix(hash2(ivec2(a.x, b.y)), hash2(b), f.x), f.y);
}
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy);
  vec4 L0 = texelFetch(tLit, q, 0);
  vec3 c = L0.rgb;
  vec4 b = texelFetch(tB, q, 0);
  int fl = flOf(b); float Z = zOf(b);
#if REFL > 0
  // wet ground mirrors what stands on it: the mirrored view ray from this ground texel climbs t px while
  // it moves 2t rows up the screen; the first standing texel at least that tall is what it sees (so a
  // lamp's image hangs below its foot, a car's below the car), softened by the bloom, rippled by rain.
  // Open water mirrors what stands in and beside it in any weather.
  float rk = (fl & ${F_WATER}) != 0 ? max(wet * reflK, 0.5) : wet * reflK;
  if (rk > 0.0 && (fl & ${F_GROUND}) != 0) {
    float wy = float((q.y + org.y) / AP * AP);
    float wob = (sin(wy * 0.7854 + time * 3.14159) * 0.6 + sin(wy * 1.5708) * 0.4) * ((fl & ${F_WATER}) != 0 ? 1.6 : 1.0);
    for (int k = 1; k <= REFL; k++) {
      float t = float(k) * REFLSTEP;
      ivec2 sq = ivec2(int(float(q.x) + wob * t * 0.06), q.y - int(2.0 * t));
      if (sq.y < 0) break;
      vec4 sb = texelFetch(tB, sq, 0);
      if (zOf(sb) + 0.5 < t + Z || (flOf(sb) & ${F_GROUND | F_AIR}) != 0) continue;   // (birds in the air leave no image)
      vec2 hu = (vec2(sq) + 0.5) * 0.5 / halfTex;
      vec3 bb = texelFetch(tLit, sq, 0).rgb * 0.42 + (useBH > 0.5 ? texture(tBH, min(hu, maxUVh)).rgb : texture(tBQ, min(hu * halfTex / (2.0 * quarterTex), maxUVq)).rgb) * 1.1;
      c += bb * ((1.0 - t / (float(REFL) * REFLSTEP + 8.0)) * rk);
      break;
    }
  }
#endif
  if (shaftK > 0.0 || beamK > 0.0) {
    vec2 sv = texture(tSh, min(gl_FragCoord.xy * 0.25 / quarterTex, maxUVq)).rg;
    float bm = clamp(sv.g * 4.5, 0.0, 1.0);                          // (the beams stand out of the haze between)
    c += (sv.r * shaftK + (bm * bm * 0.6 + bm * 0.15) * beamK) * shaftCol;
    // dust in the beams: specks drifting down through the light, glinting now and then (2 px, on the world)
    if (sv.g > 0.03) {
      vec2 wp = vec2(q + org) + vec2(sin(time * 0.23) * 9.0 + time * 1.5, -time * 6.0);
      vec2 m = mod(wp, 12.0);
      float hh = hash2(ivec2(floor(wp / 12.0)) + ivec2(71, 13));
      if (hh > 0.9 && m.x < 2.0 && m.y < 2.0) c += shaftCol * (sv.g * beamK * 5.0 * max(0.0, 0.4 + 0.6 * sin(time * (1.3 + hh * 4.0) + hh * 60.0)));
    }
  }
  // dust on the air in the low sun over growing ground (woods, meadows, parks): a few one-pixel specks drifting on
  // the breeze and glinting now and then, seen only where the sunlight reaches the ground (the lit alpha)
  if (moteK > 0.0 && L0.a > 0.0) {
    vec2 wp = vec2(q + org) / float(AP) + vec2(time * 2.2 + sin(time * 0.29) * 5.0, sin(time * 0.17) * 3.0 - time * 0.9);
    vec2 cell = floor(wp / 9.0), m = wp - cell * 9.0;
    ivec2 ci = ivec2(cell);
    float hh = hash2(ci + ivec2(37, 11));
    if (hh > 0.955) {
      vec2 at = vec2(hash2(ci + ivec2(3, 59)), hash2(ci + ivec2(83, 7))) * 7.0;
      float sz = hh > 0.99 ? 2.0 : 1.0;
      if (m.x >= at.x && m.x < at.x + sz && m.y >= at.y && m.y < at.y + sz) {
        float tw = 0.5 + 0.5 * sin(time * (0.7 + hh * 9.0) + hh * 80.0);
        c += shaftCol * (moteK * L0.a * (0.18 + 0.5 * tw * tw));
      }
    }
  }
  if (fog > 0.0) {
    vec2 w = vec2(float(q.x + org.x), float(q.y + org.y) + Z);
    // banks stretched east-west (cells 341 x 256), finer wisps (64, 32), all drifting
    float nz = vnoiseP(w + vec2(mod(time * 8.0, 8192.0), mod(time * 2.0, 8192.0)), vec2(341.3333, 256.0), ivec2(24, 32)) * 0.55
             + vnoiseP(w + vec2(8192.0) - vec2(mod(time * 12.0, 8192.0), mod(time * 4.0, 8192.0)), vec2(64.0), ivec2(128)) * 0.3
             + vnoiseP(w + vec2(mod(time * 16.0, 8192.0), 0.0), vec2(32.0), ivec2(256)) * 0.15;
    // a veil everywhere, thicker in the drifting banks than in the clearer gaps between them (never so clear that
    // the gaps read as holes); lights glow in it (wide bloom)
    float f = clamp(fog * exp(-Z / fogH) * (0.5 + 0.55 * smoothstep(0.15, 0.85, nz)), 0.0, 0.86);
    vec3 lit = useBQ > 0.5 ? texture(tBQ, min(gl_FragCoord.xy * 0.25 / quarterTex, maxUVq)).rgb * 1.1 : vec3(0.0);
    c = mix(c, fogCol + lit, f);
  }
  vec3 bl = vec3(0.0);
  if (useBH > 0.5) bl += texture(tBH, min(gl_FragCoord.xy * 0.5 / halfTex, maxUVh)).rgb * 0.6;
  if (useBQ > 0.5) bl += texture(tBQ, min(gl_FragCoord.xy * 0.25 / quarterTex, maxUVq)).rgb * 0.8;
  c += bl * (bloomK * (1.0 + fog * 0.8));
  if (flash > 0.0) c += flashCol * (flash * 0.1);
  float sy = clamp((gl_FragCoord.y - view.y) / max(view.w, 1.0), 0.0, 1.0);
  c = mix(c, hazeCol, haze * (0.65 + 0.35 * (1.0 - sy)));
  c = c * gain + lift;
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(vec3(l), c, sat);
  c = (c - 0.5) * contrast + 0.5;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// ---- the lighting passes ------------------------------------------------------------------------------
export class LightGame {
  // gl: the engine's context; tri: a VAO holding the full-screen triangle at attribute 0
  constructor(gl, tri) {
    this.gl = gl; this.tri = tri;
    this.progs = new Map(); this.ti = 2; this.T = LIGHT_TIERS[2]; this.ap = 1;   // (ap: set by the engine before the first program)
    this.cw = 0; this.ch = 0; this.texs = []; this.fbos = [];
    this.sd = new Float32Array(3); this.rays = {};
    // (a texel of nothing for the canopy's unit when there's no canopy in view: never a texture being drawn to)
    this.tNone = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tNone);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  setTier(i) { this.ti = Math.max(0, Math.min(3, i | 0)); this.T = LIGHT_TIERS[this.ti]; }
  prog(name) {
    const key = name + this.ti;
    let p = this.progs.get(key);
    if (p) return p;
    const gl = this.gl, H = HEAD(this.T, this.ap);
    if (name === 'lit') p = glProgram(gl, TRI_VS, H + LIT_FS, ['p'], { tA: 0, tB: 1, tC: 2, tTiles: 3, tCan: 6 }, { Lights: 0 });
    else if (name === 'lighth') p = glProgram(gl, TRI_VS, H + LIGHTH_FS, ['p'], { tA: 0, tB: 1, tC: 2, tTiles: 3, tCan: 6 }, { Lights: 0 });
    else if (name === 'compose') p = glProgram(gl, TRI_VS, H + COMPOSE_FS, ['p'], { tA: 0, tB: 1, tC: 2, tTiles: 3, tLH: 4, tRH: 5, tCan: 6 }, { Lights: 0 });
    else if (name === 'final') p = glProgram(gl, TRI_VS, H + FINAL_FS, ['p'], { tLit: 0, tB: 1, tBH: 2, tBQ: 3, tSh: 4 });
    else if (name === 'extract') p = glProgram(gl, TRI_VS, EXTRACT_FS, ['p'], { tLit: 0, tC: 1 });
    else if (name === 'blur') p = glProgram(gl, TRI_VS, BLUR_FS, ['p'], { src: 0 });
    else p = glProgram(gl, TRI_VS, SHAFT_FS(this.T), ['p'], { tLit: 0, tB: 1, tCan: 6 });
    this.progs.set(key, p);
    return p;
  }
  // compile the current tier's programs now (avoids a hitch on the first frame)
  warm() { for (const n of this.T.half ? ['lighth', 'compose', 'blur', 'shaft', 'final'] : ['lit', 'extract', 'blur', 'shaft', 'final']) this.prog(n); }
  // targets for a scene capacity of cw x ch texels (kept until a bigger one is needed)
  ensure(cw, ch) {
    if (cw === this.cw && ch === this.ch) return;
    this.free();
    const gl = this.gl;
    this.cw = cw; this.ch = ch;
    this.hw = Math.ceil(cw / 2); this.hh = Math.ceil(ch / 2); this.qw = Math.ceil(cw / 4); this.qh = Math.ceil(ch / 4);
    this.tLit = glTex(gl, cw, ch, true);
    this.tHA = glTex(gl, this.hw, this.hh, true); this.tHB = glTex(gl, this.hw, this.hh, true);
    this.tQA = glTex(gl, this.qw, this.qh, true); this.tQB = glTex(gl, this.qw, this.qh, true);
    this.tSA = glTex(gl, this.qw, this.qh, true); this.tSB = glTex(gl, this.qw, this.qh, true);
    this.texs = [this.tLit, this.tHA, this.tHB, this.tQA, this.tQB, this.tSA, this.tSB];
    [this.fLit, this.fHA, this.fHB, this.fQA, this.fQB, this.fSA, this.fSB] = this.fbos = this.texs.map((t) => glFbo(gl, [t]));
    this.fHAB = glFbo(gl, [this.tHA, this.tHB]); this.fbos.push(this.fHAB);
    this.tx = Math.ceil(cw / TILE); this.ty = Math.ceil(ch / TILE);
    this.tTiles = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tTiles);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8UI, this.tx * TILE_K, this.ty);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.tileData = new Uint8Array(this.tx * TILE_K * this.ty);
  }
  bytes() { return (this.cw * this.ch + 2 * this.hw * this.hh + 4 * this.qw * this.qh) * 4 + (this.tileData ? this.tileData.length : 0); }
  free() {
    const gl = this.gl;
    for (const t of this.texs) gl.deleteTexture(t);
    for (const f of this.fbos) gl.deleteFramebuffer(f);
    if (this.tTiles) gl.deleteTexture(this.tTiles);
    this.texs = []; this.fbos = []; this.tTiles = null; this.tileData = null; this.cw = this.ch = 0;
  }
  // bin the frame's lights (U: the packed uniform buffer, scene coordinates, best first) into tiles of a
  // w x h scene; a light covers the screen rows its sphere can reach (and its wet streak below it)
  bin(U, m, w, h, wet) {
    const tx = Math.ceil(w / TILE), ty = Math.ceil(h / TILE), D = this.tileData, stride = this.tx * TILE_K;
    for (let y = 0; y < ty; y++) for (let x = 0, i = y * stride; x < tx; x++, i += TILE_K) D[i] = 0;
    for (let k = 0; k < m; k++) {
      const o = k * LIGHT_FLOATS, lx = U[o], ly = U[o + 1], lz = U[o + 2], r = U[o + 3];
      let x0 = lx - r, x1 = lx + r, y0 = ly - lz - 2 * r, y1 = ly + r;
      if (wet) { const len = 30 + lz * 1.4, hw = 8 + len * 0.15 + r * 0.04; x0 = Math.min(x0, lx - hw); x1 = Math.max(x1, lx + hw); y0 = Math.min(y0, ly - 4); y1 = Math.max(y1, ly + len); }
      const a = Math.max(0, Math.floor(x0 / TILE)), b = Math.min(tx - 1, Math.floor(x1 / TILE)), c = Math.max(0, Math.floor(y0 / TILE)), d = Math.min(ty - 1, Math.floor(y1 / TILE));
      for (let yy = c; yy <= d; yy++) for (let xx = a, i = yy * stride + a * TILE_K; xx <= b; xx++, i += TILE_K) { const n = D[i]; if (n < TILE_K - 1) { D[i + 1 + n] = k; D[i] = n + 1; } }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tTiles);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, stride, ty, gl.RED_INTEGER, gl.UNSIGNED_BYTE, D);
  }
  dispose() { this.free(); for (const p of this.progs.values()) this.gl.deleteProgram(p.p); this.progs.clear(); if (this.tNone) this.gl.deleteTexture(this.tNone); this.tNone = null; }
  bind(unit, t) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
  blur(src, srcW, srcH, usedW, usedH, fbo, w, h, dx, dy, scale) {
    const gl = this.gl, p = this.prog('blur');
    gl.useProgram(p.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h);
    this.bind(0, src);
    gl.uniform2f(p.u.srcTex, srcW, srcH); gl.uniform2f(p.u.maxUV, (usedW - 0.5) / srcW, (usedH - 0.5) / srcH);
    gl.uniform2f(p.u.dir, dx, dy); gl.uniform1f(p.u.scale, scale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  litUniforms(u, S, P, w, h, wet, flash) {
    const gl = this.gl;
    gl.uniform2i(u.isize, w, h); gl.uniform2i(u.org, S.org[0], S.org[1]);
    gl.uniform3fv(u.sunDir, this.sd); gl.uniform3fv(u.sunCol, pv(P, 'sunCol')); gl.uniform3fv(u.ambSky, pv(P, 'ambSky')); gl.uniform3fv(u.ambGround, pv(P, 'ambGround'));
    gl.uniform3fv(u.shadowTint, pv(P, 'shadowTint')); gl.uniform3fv(u.flashCol, pv(P, 'flashCol'));
    gl.uniform1f(u.shadowLen, Math.min(pv(P, 'shadowLen'), this.T.reach)); gl.uniform1f(u.bands, pv(P, 'bands')); gl.uniform1f(u.bandMix, pv(P, 'bandMix'));
    gl.uniform1f(u.wet, wet); gl.uniform1f(u.emiK, pv(P, 'emiK')); gl.uniform1f(u.leafGlow, pv(P, 'leafGlow')); gl.uniform1f(u.time, S.time % 4096);
    gl.uniform1f(u.flash, flash); gl.uniform1f(u.rain, pv(P, 'rain') * Math.min(1, wet * 1.5)); gl.uniform1f(u.skyRefl, pv(P, 'skyRefl'));
    gl.uniform1i(u.nL, S.nL);
    if (u.worg) gl.uniform2f(u.worg, S.worg ? S.worg[0] : 0, S.worg ? S.worg[1] : 0);
    if (u.wind4) { const W = S.wind; gl.uniform4f(u.wind4, W ? W[0] : 0.1, W ? W[1] : 0.3, W ? W[2] : 1, W ? W[3] : 0); }
    this.canUniforms(u, S.can);
  }
  canUniforms(u, c) {
    const gl = this.gl;
    if (u.canH) gl.uniform1f(u.canH, c ? c.hc : 0);
    if (u.canO && c) gl.uniform4f(u.canO, c.x0, c.y0, 1 / (c.w * c.cell), 1 / (c.h * c.cell));
  }
  // S: { A, B, C: scene textures; w, h: used size; preset; wet; time; flash; nL; ubo; org: [x, y] (origin
  //      mod 8192); view: [x, y, w, h] (the visible rectangle in scene texels); out: framebuffer for the
  //      final image (w x h); mark(name): optional timing hook }
  render(S) {
    const gl = this.gl, T = this.T, P = S.preset, w = S.w, h = S.h, cw = this.cw, ch = this.ch;
    gl.bindVertexArray(this.tri);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    // ---- lit: per texel, or (Low) lights at half size then composed per texel
    const sd = pv(P, 'sunDir'), sl = Math.hypot(sd[0], sd[1], sd[2]) || 1, SD = this.sd;
    SD[0] = sd[0] / sl; SD[1] = sd[1] / sl; SD[2] = sd[2] / sl;
    const wet = Math.max(pv(P, 'wet'), S.wet || 0), flash = Math.max(pv(P, 'flash'), S.flash || 0), fog = Math.max(pv(P, 'fog'), S.fog || 0);
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2), qw = Math.ceil(w / 4), qh = Math.ceil(h / 4);
    this.bind(0, S.A); this.bind(1, S.B); this.bind(2, S.C); this.bind(3, this.tTiles); this.bind(6, S.can && S.canTex ? S.canTex : this.tNone);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, S.ubo);
    let p, u;
    if (T.half) {
      p = this.prog('lighth');
      gl.useProgram(p.p); this.litUniforms(p.u, S, P, w, h, wet, flash);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fHAB); gl.viewport(0, 0, hw, hh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      p = this.prog('compose');
      gl.useProgram(p.p); this.litUniforms(p.u, S, P, w, h, wet, flash); gl.uniform2i(p.u.hsize, hw, hh);
      this.bind(4, this.tHA); this.bind(5, this.tHB);
    } else { p = this.prog('lit'); gl.useProgram(p.p); this.litUniforms(p.u, S, P, w, h, wet, flash); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fLit); gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (S.mark) S.mark('lit');
    // ---- bloom: extract at half size, blur at half (full) and quarter size
    const bloomK = T.bloom ? pv(P, 'bloomK') : 0;
    let useBH = 0, useBQ = 0;
    if (bloomK > 0 || T.refl) {
      p = this.prog('extract'); u = p.u;
      gl.useProgram(p.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fHA); gl.viewport(0, 0, hw, hh);
      this.bind(0, this.tLit); this.bind(1, S.C);
      gl.uniform2f(u.fullTex, cw, ch); gl.uniform2f(u.maxUV, (w - 0.5) / cw, (h - 0.5) / ch);
      gl.uniform1f(u.bloomThr, pv(P, 'bloomThr')); gl.uniform1f(u.emiK, pv(P, 'emiK'));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (T.bloom >= 2) {
        this.blur(this.tHA, this.hw, this.hh, hw, hh, this.fHB, hw, hh, 1, 0, 1);
        this.blur(this.tHB, this.hw, this.hh, hw, hh, this.fHA, hw, hh, 0, 1, 1);
        useBH = 1;
      }
      this.blur(this.tHA, this.hw, this.hh, hw, hh, this.fQB, qw, qh, 1, 0, 2);
      this.blur(this.tQB, this.qw, this.qh, qw, qh, this.fQA, qw, qh, 0, 1, 1);
      this.blur(this.tQA, this.qw, this.qh, qw, qh, this.fQB, qw, qh, 1, 0, 1);
      this.blur(this.tQB, this.qw, this.qh, qw, qh, this.fQA, qw, qh, 0, 1, 1);
      useBQ = 1;
      if (S.mark) S.mark('bloom');
    }
    // ---- god rays: the low sun's over sunlit ground (High, Ultra) and, on every tier, the beams coming down
    // through the redwood canopy. Only when the sun is low and really shining - from just after sunrise until it is
    // well up, and again from late afternoon through golden hour - each eased in and out with the sun's height and
    // strength, so they never pop on or off as the light changes. Dust drifts in the low sun over growing ground.
    const R = godRays(P, SD[2], T.shafts, !!(S.can && S.canTex), wet, fog, this.rays);
    let shaftK = R.shaftK, beamK = R.beamK;
    const moteK = R.moteK, sc = pv(P, 'sunCol');
    if (beamK <= 0.01) beamK = 0;
    if (shaftK <= 0.002) shaftK = 0;
    if (shaftK > 0 || beamK > 0) {
      const ux = SD[0], uy = SD[1] - SD[2], ul = Math.hypot(ux, uy) || 1;
      p = this.prog('shaft'); u = p.u;
      gl.useProgram(p.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fSA); gl.viewport(0, 0, qw, qh);
      this.bind(0, this.tLit); this.bind(1, S.B); this.bind(6, S.can && S.canTex ? S.canTex : this.tNone);
      gl.uniform2f(u.fullTex, cw, ch); gl.uniform2f(u.maxUV, (w - 0.5) / cw, (h - 0.5) / ch);
      gl.uniform2f(u.sdir, -ux / ul, -uy / ul); gl.uniform1f(u.slen, Math.min(480, 200 / SD[2] * ul)); gl.uniform2i(u.org, S.org[0], S.org[1]);
      if (u.smear) gl.uniform1f(u.smear, shaftK > 0 ? 1 : 0);
      if (u.sunDir) gl.uniform3fv(u.sunDir, SD);
      if (u.time) gl.uniform1f(u.time, S.time % 4096);
      if (u.worg) gl.uniform2f(u.worg, S.worg ? S.worg[0] : 0, S.worg ? S.worg[1] : 0);
      if (u.wind4) { const W = S.wind; gl.uniform4f(u.wind4, W ? W[0] : 0.1, W ? W[1] : 0.3, W ? W[2] : 1, W ? W[3] : 0); }
      this.canUniforms(u, beamK > 0 ? S.can : null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.blur(this.tSA, this.qw, this.qh, qw, qh, this.fSB, qw, qh, 1, 0, 1);
      this.blur(this.tSB, this.qw, this.qh, qw, qh, this.fSA, qw, qh, 0, 1, 1);
      if (S.mark) S.mark('shafts');
    }
    // ---- final
    p = this.prog('final'); u = p.u;
    gl.useProgram(p.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.out); gl.viewport(0, 0, w, h);
    this.bind(0, this.tLit); this.bind(1, S.B); this.bind(2, this.tHA); this.bind(3, this.tQA); this.bind(4, this.tSA);
    gl.uniform2f(u.halfTex, this.hw, this.hh); gl.uniform2f(u.quarterTex, this.qw, this.qh);
    gl.uniform2f(u.maxUVh, (hw - 0.5) / this.hw, (hh - 0.5) / this.hh); gl.uniform2f(u.maxUVq, (qw - 0.5) / this.qw, (qh - 0.5) / this.qh);
    gl.uniform2i(u.org, S.org[0], S.org[1]); gl.uniform4f(u.view, S.view[0], S.view[1], S.view[2], S.view[3]);
    gl.uniform1f(u.wet, wet); gl.uniform1f(u.reflK, pv(P, 'reflK')); gl.uniform1f(u.bloomK, bloomK); gl.uniform1f(u.haze, pv(P, 'haze'));
    gl.uniform1f(u.sat, pv(P, 'sat')); gl.uniform1f(u.contrast, pv(P, 'contrast')); gl.uniform1f(u.time, S.time % 4096);
    gl.uniform1f(u.fog, fog); gl.uniform1f(u.fogH, pv(P, 'fogH')); gl.uniform1f(u.flash, flash); gl.uniform1f(u.shaftK, shaftK); gl.uniform1f(u.beamK, beamK); gl.uniform1f(u.moteK, moteK);
    gl.uniform1f(u.useBH, useBH); gl.uniform1f(u.useBQ, useBQ);
    gl.uniform3fv(u.hazeCol, pv(P, 'hazeCol')); gl.uniform3fv(u.lift, pv(P, 'lift')); gl.uniform3fv(u.gain, pv(P, 'gain'));
    // the fog is lit by the sky: by day the preset's colour, after dark a dim haze (the lamps' glow in it comes
    // from the bloom), so a misty night stays a night instead of turning grey
    const sm = Math.max(sc[0], sc[1], sc[2], 1e-3), fc = pv(P, 'fogCol'), as = pv(P, 'ambSky');
    const fk = Math.min(1, (luma3(as) + luma3(sc) * Math.max(0, SD[2]) * 0.5) * 2.4);
    gl.uniform3f(u.fogCol, fc[0] * fk, fc[1] * fk, fc[2] * fk); gl.uniform3fv(u.flashCol, pv(P, 'flashCol'));
    gl.uniform3f(u.shaftCol, sc[0] / sm * 0.55, sc[1] / sm * 0.55, sc[2] / sm * 0.55);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (S.mark) S.mark('final');
  }
}
