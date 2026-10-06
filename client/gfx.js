// Graphics settings: what this device is, the preset that suits it, and every switch a player can
// fine-tune. One place decides; the renderer asks gfx.<option>.
//
// Presets
//   low     - flat ground art, basic lighting, no live vegetation (old phones, consoles in trouble)
//   medium  - lighting + bloom, baked procedural vegetation that doesn't move, light shadows
//   high    - live vegetation (sways in the wind, flattens under feet and wheels), golden-hour
//             glow through leaves and grass, every shadow, puddle reflections
//   ultra   - high, denser vegetation and sharper rendering (fast desktops)
// Changing any single option makes the preset "custom".
import { settings, saveSettings } from './input.js';
import { IS_CONSOLE, IS_XBOX, DEVICE_FORCED, CONSOLE_WHY } from './platform.js';

export const PRESETS = {
  low: { lighting: 0, flora: 'static', floraDensity: 0.5, wind: false, trample: false, sss: false, shadows: 1, reflections: false, weather: 0, particles: 0, resolution: 1, tiltShift: false },
  medium: { lighting: 1, flora: 'static', floraDensity: 0.75, wind: true, trample: false, sss: false, shadows: 2, reflections: true, weather: 1, particles: 1, resolution: 1, tiltShift: false },
  high: { lighting: 2, flora: 'live', floraDensity: 1, wind: true, trample: true, sss: true, shadows: 2, reflections: true, weather: 1, particles: 1, resolution: 1.5, tiltShift: false },
  ultra: { lighting: 2, flora: 'live', floraDensity: 1.5, wind: true, trample: true, sss: true, shadows: 2, reflections: true, weather: 1, particles: 1, resolution: 2, tiltShift: false },
};
export const PRESET_NAMES = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra', custom: 'Custom' };

// The options as the settings menu shows them: [key, label, choices [value, label] or 'bool']
export const OPTIONS = [
  ['lighting', 'Lighting', [[0, 'Basic'], [1, 'Lights + bloom'], [2, 'Full (god rays, sun wash)']]],
  ['flora', 'Vegetation', [['off', 'Flat (fastest)'], ['static', 'Detailed, still'], ['live', 'Live (sways, reacts to you)']]],
  ['floraDensity', 'Vegetation density', [[0.5, 'Sparse'], [0.75, 'Medium'], [1, 'Full'], [1.5, 'Lush']]],
  ['wind', 'Wind sway', 'bool'],
  ['trample', 'Trampled grass and crops', 'bool'],
  ['sss', 'Golden-hour glow through leaves', 'bool'],
  ['shadows', 'Shadows', [[0, 'Off'], [1, 'Buildings only'], [2, 'Everything']]],
  ['reflections', 'Puddle reflections', 'bool'],
  ['weather', 'Rain and fog detail', [[0, 'Low'], [1, 'Full']]],
  ['particles', 'Particles (smoke, debris)', [[0, 'Fewer'], [1, 'Full']]],
  ['resolution', 'Render sharpness', [[0.75, 'Soft (fastest)'], [1, 'Standard'], [1.5, 'Sharp'], [2, 'Native (slowest)']]],
  ['tiltShift', 'Tilt-shift blur', 'bool'],
];

// ---- device detection ------------------------------------------------------------------------------
function gpuName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); // give the context straight back
    c.width = c.height = 0;
    return String(name || '');
  } catch { return ''; }
}

// { kind: 'console'|'phone'|'tablet'|'laptop'|'desktop', label, gpu, recommended: preset, why }
export function detectDevice() {
  const ua = navigator.userAgent || '';
  const touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width || innerWidth, screen.height || innerHeight);
  const mem = navigator.deviceMemory || 0;          // GB, Chrome/Edge only (capped at 8)
  const cores = navigator.hardwareConcurrency || 0;
  const gpu = gpuName();
  const g = gpu.toLowerCase();
  let kind;
  const pc = DEVICE_FORCED === 'pc', mobile = DEVICE_FORCED === 'mobile';
  if (IS_CONSOLE) kind = 'console';
  else if (!pc && (/iPhone|Android.+Mobile|Mobile Safari/i.test(ua) || (coarse && small < 520) || (mobile && small < 520))) kind = 'phone';
  else if (!pc && (/iPad|Android|Tablet/i.test(ua) || (touch && coarse) || mobile)) kind = 'tablet';
  else if (/intel|iris|uhd|hd graphics|mali|adreno|powervr|apple m1|apple gpu/i.test(g) || (cores && cores <= 4)) kind = 'laptop';
  else kind = 'desktop';
  const software = /swiftshader|llvmpipe|software|basic render/i.test(g);
  const bigGpu = /nvidia|geforce|rtx|gtx|radeon|amd|apple m[2-9]|apple m1 (pro|max|ultra)/i.test(g);
  let rec;
  if (software) rec = 'low';
  else if (kind === 'console') rec = 'medium';
  else if (kind === 'phone') rec = mem && mem <= 3 ? 'low' : 'medium';
  else if (kind === 'tablet') rec = mem && mem <= 3 ? 'low' : 'medium';
  else if (kind === 'laptop') rec = bigGpu ? 'high' : mem && mem <= 4 ? 'medium' : 'high';
  else rec = bigGpu && (!mem || mem >= 8) && cores >= 8 ? 'ultra' : 'high';
  const label = { console: IS_XBOX ? 'an Xbox' : 'a games console', phone: 'a phone', tablet: 'a tablet', laptop: 'a laptop / integrated graphics', desktop: 'a desktop computer' }[kind];
  const why = [label, gpu && !software ? gpu.replace(/ANGLE \(|\)$|Direct3D11 vs_5_0 ps_5_0, D3D11|, OpenGL.*$/g, '').trim() : software ? 'no graphics acceleration' : '', mem ? `${mem} GB memory` : '', cores ? `${cores} cores` : ''].filter(Boolean);
  return { kind, label, gpu, recommended: rec, why, consoleWhy: CONSOLE_WHY, forced: DEVICE_FORCED };
}

// ---- the live settings -----------------------------------------------------------------------------
let device = null;
export const gfx = { preset: 'high', ...PRESETS.high };

export function getDevice() { return device || (device = detectDevice()); }

// Has this player chosen (or accepted) graphics settings yet?
export function gfxChosen() { return !!settings.gfxPreset; }

export function applyPreset(name, save = true) {
  Object.assign(gfx, PRESETS[name] || PRESETS.medium, { preset: name });
  if (save) { settings.gfxPreset = name; settings.gfxOpts = null; syncLegacy(); saveSettings(); }
}
export function setOption(key, value) {
  gfx[key] = value; gfx.preset = 'custom';
  settings.gfxPreset = 'custom';
  settings.gfxOpts = Object.fromEntries(OPTIONS.map(([k]) => [k, gfx[k]]));
  syncLegacy(); saveSettings();
}
// keep the older single "gfx" quality number (and the tilt switch) in step for older code paths
function syncLegacy() { settings.gfx = gfx.lighting; settings.tiltShift = gfx.tiltShift; }

// Load from saved settings, or the device's recommendation (not saved until the player confirms).
export function initGfx() {
  const d = getDevice();
  if (settings.gfxPreset === 'custom' && settings.gfxOpts) Object.assign(gfx, PRESETS[d.recommended], settings.gfxOpts, { preset: 'custom' });
  else if (settings.gfxPreset && PRESETS[settings.gfxPreset]) applyPreset(settings.gfxPreset, false);
  else if (settings.gfx !== undefined) {
    // a player from before presets: carry their old choice over
    applyPreset(['low', 'medium', 'high'][settings.gfx] || d.recommended, false);
    if (settings.tiltShift === true) gfx.tiltShift = true;
  } else applyPreset(d.recommended, false);
  return gfx;
}
// ---- world renderer --------------------------------------------------------------------------------
// The world is drawn by the art v2 renderer (WebGL2, client/art2/game). Nothing falls back to the classic
// renderer any more (the user's call: no old art anywhere); only ?art=1 in the address still asks for it, for
// troubleshooting. (The old per-tab "fall back" flag is cleared: tabs that set it this morning stay new.)
export function worldArtWanted() {
  try { sessionStorage.removeItem('cla.art2off'); } catch { /* storage blocked */ }
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('art') : null;
  return q !== '1';
}

// One notch down (after the browser ran out of graphics memory).
export function stepDown() {
  const order = ['ultra', 'high', 'medium', 'low'];
  const i = order.indexOf(gfx.preset);
  const next = i < 0 ? (gfx.lighting >= 2 ? 'medium' : 'low') : order[Math.min(order.length - 1, i + 1)];
  applyPreset(next);
  return next;
}
