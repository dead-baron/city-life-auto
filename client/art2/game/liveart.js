// Art v2 live renderer: the moving parts of the static world, drawn by the host over the baked chunks every frame
// from a handful of frames made on demand (the chunk bakes say where they are: chunkbake.js live):
//   flags      the cloth of a flag in the shared wind (task #426): the police stations' flags, the golf course's pins.
//              flagPose: how far it stands out and how fast it flaps for the wind's strength; flagCloth: where its
//              cloth is; flagSprite: one frame of it. The pole is baked with the chunk; the cloth is drawn on it.
//   fountains  the water of a fountain (task #417): fountainSprite, one frame of its loop. The stone and the still
//              water are baked with the chunk; the jet, the falling drops, the ripples and the glints are drawn on it.
// And the umbrellas people carry (task #433: umbrellaStyle, umbrellaSprite; the host puts them on the shaft).
// Pure code (no DOM, no clock): the host keys, uploads and times what these make; the tests run them in node.
// Drawn at the art's own pixel (ART_PX world px; G.ap), not made at full size and shrunk: a flag's stripes or a ripple
// a pixel of art wide stay whole and crisp, whichever way the cloth turns.
import { GBuf, F_THIN, F_NOCAST, ART_PX } from '../gbuf.js';
import { AIR_P } from '../../render/flora/wind.js';

const TAU = Math.PI * 2;
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- flags ------------------------------------------------------------------------------------------------------
// The flags (statics.js says where: a pole baked bare, its live record [kind, x, y, z0]): the cloth's length along
// the fly (L) and its hoist (H), px; zt: the top of the hoist above the pole's foot; the cloth: col(u, v) its colour at
// u px out from the hoist, v down from its top edge (null: no cloth there - a pennant's taper).
const RED = [196, 46, 54], WHITE = [236, 230, 218], BLUE = [38, 52, 118];
export const FLAGS = {
  // the police stations' (statics.js: a 110 px flagpole): stars and stripes - a blue canton dotted with white stars,
  // red and white stripes a pixel of art each
  stars: { L: 40, H: 24, zt: 108, col: (u, v) => (u < 16 && v < 12 ? ((u >> 1) % 2 && (v >> 1) % 2 ? WHITE : BLUE) : (v >> 1) % 2 ? WHITE : RED) },
  // the golf course's pins (props-park.js golfPin): a small red flag, tapering a little to the fly
  golf: { L: 11, H: 7, zt: 33, col: (u, v) => (v < 7 - u * 0.25 ? [216, 52, 46] : null) },
};
export const FLAG_LIFTS = 6, FLAG_DIRS = 16, FLAG_FRAMES = 8;   // the frames made: how far out (0 limp .. 5 straight out), which way (16), the flap (8)

// How a flag flies in a wind of strength w (render/flora/wind.js: 0 still .. 1 a gale; calm spells are 0.1, a breeze
// 0.3, a windy spell 0.58, a gale 0.88, rain 0.45): lift 0 hanging limp down the pole .. 1 straight out; hz how many
// times a second it sways (in calm air: a slow sway every few seconds) or flaps; amp how far its cloth ripples
// (px at the fly end of a 40 px flag): a little in a breeze, more in a gale - never wild (the owner: "subtle and not
// over the top").
export function flagPose(w, out = {}) {
  w = clamp01(w);
  out.lift = sm((w - 0.03) / 0.67);
  out.hz = 0.22 + 2.2 * w * w;
  out.amp = rippleOf(out.lift);
  return out;
}
const rippleOf = (lift) => 0.7 + 2.3 * lift;
// A flag's wind where it stands: the wind's strength, a little more in a gust patch passing over it (the gust layers
// the plants sway in: wind.js gd, the classic sway's waves) - so the city's flags don't all stand out the same.
const GK1 = TAU * 8 / AIR_P, GK2 = TAU * 21 / AIR_P;
export function flagWind(wd, x, y) {
  const G = wd.gd || [0, 0, 0, 0];
  const g = 0.5 + 0.5 * (0.7 * Math.sin((x - G[0]) * GK1) * Math.sin((y - G[1]) * GK1 + 1.1) + 0.3 * Math.sin((x - G[2]) * GK2 + 0.7) * Math.sin((y - G[3]) * GK2 + 2.3));
  return clamp01(wd.strength * (0.85 + 0.3 * g * (wd.gust ?? 0.5) * 2));
}

// The cloth in one pose: lift 0..1, th the way the wind blows (radians; the fly streams that way), ph the flap's
// phase 0..1. Columns of the cloth from the hoist out (every du px of u), each hanging straight down from its top
// point: { n, du, x, y (ground offsets from the pole, px), z (the column's top, px below the hoist's top), h (its
// length), nx, ny (its face's normal, horizontal) }. Limp, the top edge leaves the hoist steeply down and bends down
// further, so the cloth hangs down beside the pole, swaying round it a little; in a wind it stands out and bends
// less; a wave runs out along it, bigger the further out.
export function flagCloth(kind, lift, th, ph, du = 0.4) {
  const F = FLAGS[kind], L = F.L, droop = 1 - lift, n = Math.ceil(L / du) + 1;
  const C = { n, du, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), h: new Float32Array(n), nx: new Float32Array(n), ny: new Float32Array(n) };
  // (it sways round the pole the more it hangs: a couple of px at the fly end, limp or half out)
  const a = th + 0.26 * droop * droop * Math.sin(ph * TAU), dx = Math.cos(a), dy = Math.sin(a), amp = rippleOf(lift) * L / 40;
  const a0 = droop * 1.22, da = droop * 0.32, k = 1.4 + 0.5 * lift;   // (the top edge's angle below level at the hoist, how much more at the fly; waves along the cloth)
  let r = 1.5, z = 0;   // (from the pole's side)
  for (let i = 0; i < n; i++) {
    const u = Math.min(L, i * du), s = u / L, an = a0 + da * s, q = TAU * (k * s - ph), wv = Math.sin(q);
    const w = amp * s * wv, dw = amp * (wv + s * TAU * k * Math.cos(q)) / L;   // (sideways, and how fast it changes along the cloth)
    C.x[i] = dx * r - dy * w; C.y[i] = dy * r + dx * w; C.z[i] = z + 0.6 * lift * s * Math.cos(q) * L / 40; C.h[i] = F.H * (1 - 0.3 * droop * s);
    // the face: square to the cloth's way along (its level part), toward the camera's side (+y)
    const tx = dx * Math.cos(an) - dy * dw, ty = dy * Math.cos(an) + dx * dw, tl = Math.hypot(tx, ty);
    let nx = tl > 1e-4 ? -ty / tl : -dy, ny = tl > 1e-4 ? tx / tl : dx;
    if (ny < 0) { nx = -nx; ny = -ny; }
    C.nx[i] = nx; C.ny[i] = ny;
    r += Math.cos(an) * du; z += Math.sin(an) * du;
  }
  return C;
}

// One frame of a flag: lift level li (0..FLAG_LIFTS-1), wind direction di (0..FLAG_DIRS-1, di/16 of a turn from east),
// flap frame fr (0..FLAG_FRAMES-1). In art pixels, anchored at the pole's foot, heights above it (world px); the
// cloth's colours shaded a little by how its folds face (the light does the rest).
export function flagSprite(kind, li, di, fr) {
  const F = FLAGS[kind], C = flagCloth(kind, li / (FLAG_LIFTS - 1), di / FLAG_DIRS * TAU, fr / FLAG_FRAMES), L = F.L, R = L + 6;
  const A = artBuf(2 * R, 2 * R + L + F.H + 8, R, R + F.zt + 2), nv = [0, 0, 0];
  for (let i = 0; i < C.n; i++) {
    const u = Math.min(L, i * C.du), k = 0.8 + 0.2 * C.ny[i];
    nv[0] = C.nx[i]; nv[1] = C.ny[i];
    for (let v = 0; v <= C.h[i]; v += 0.4) {
      const c = F.col(u, v * F.H / C.h[i]);
      if (c) A.dot(C.x[i], C.y[i], F.zt - C.z[i] - v, c, k, nv, F_THIN);
    }
  }
  return A.G;
}

// ---- umbrellas ----------------------------------------------------------------------------------------------------
// The canopy over someone holding an open umbrella in the rain (task #433, the owner: "Umbrellas are a little small
// right now we should make them a bit bigger and held lower down over the NPC a bit more so it looks like it's
// covering them from the rain. We should add more variety in the umbrellas."). The host draws it on the shaft in
// their hand (game/peds.js umbrellaTop: the shaft's top, people.js's hold), its rim drop px below that: the crown a
// few px over the shaft's top and every head, the rim down at the shoulders. 34 px across (it was 26, its rim at the
// top of the head). Its look is the person's own, always the same one: umbrellaStyle(their entity id).
// A style: c the canopy, c2 its second colour; p the pattern - 'panels' (every other panel in c2), 'rainbow', 'dots'
// (polka dots of c2), 'rim' (a band of c2 round the edge); clear: a bubble of clear plastic, deeper and down round
// the head, you see them through it: its rim tinted c2, light caught on it, a glint of the plastic here and there;
// w how common.
const RAINBOW = [[214, 52, 52], [236, 132, 40], [236, 206, 52], [64, 168, 72], [44, 170, 196], [52, 92, 196], [120, 64, 180], [210, 70, 150]];
export const UMBRELLAS = [
  { c: '#24262c', w: 10 },                              // black: the most common
  { c: '#2a3a6a', w: 6 },                               // navy
  { c: '#c8262b', w: 5 },                               // red
  { c: '#2f6e46', w: 4 },                               // bottle green
  { c: '#e8b923', w: 3 },                               // yellow
  { c: '#6a3aa8', w: 3 },                               // purple
  { c: '#e0709e', w: 3 },                               // pink
  { c: '#8a6a4a', w: 3 },                               // tan
  { c: '#c8262b', c2: '#f0ece4', p: 'panels', w: 3 },   // red and white
  { c: '#2f5fc8', c2: '#f0ece4', p: 'panels', w: 3 },   // blue and white, a golf umbrella
  { c: '#24262c', c2: '#e8b923', p: 'panels', w: 2 },   // black and yellow
  { p: 'rainbow', w: 2 },
  { c: '#24262c', c2: '#f0ece4', p: 'dots', w: 3 },     // black with white polka dots
  { c: '#e0709e', c2: '#fff6fa', p: 'dots', w: 2 },     // pink with white dots
  { c: '#2a3a6a', c2: '#e8b923', p: 'rim', w: 2 },      // navy with a yellow border
  { c: '#2f6e46', c2: '#f0ece4', p: 'rim', w: 2 },      // green with a white border
  { clear: true, c2: '#f2f4f6', w: 3 },                 // clear bubbles: a white rim
  { clear: true, c2: '#f08ab8', w: 2 },                 // ...a pink one
];
const UMB_SUM = UMBRELLAS.reduce((s, u) => s + u.w, 0);
// the person's umbrella: a hash of their id (the server's, the same for everyone watching) - theirs for as long as
// they're about, whatever the frame
export function umbrellaStyle(id) {
  let h = Math.imul((id | 0) ^ 0x2c1b3c6d, 0x297a2d39) >>> 0;
  h = (Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0) % UMB_SUM;
  for (let i = 0; i < UMBRELLAS.length; i++) { h -= UMBRELLAS[i].w; if (h < 0) return i; }
  return 0;
}
// a canopy's shape: R its radius, H its crown over its rim, e how its dome falls away (higher: flatter on top, steeper
// at the edge), drop how far its rim hangs below the shaft's top (the crown is H - drop over it), k how far out toward
// the shaft its middle sits from over the head (peds.js umbrellaTop: held a little in, over them)
export const UMB_SHAPE = { R: 17, H: 10.5, e: 2.6, drop: 6.5, k: 0.55 }, BUBBLE_SHAPE = { R: 16, H: 12, e: 3, drop: 7.5, k: 0.45 };
export const umbrellaShape = (i) => ((UMBRELLAS[i] || UMBRELLAS[0]).clear ? BUBBLE_SHAPE : UMB_SHAPE);
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// The canopy in art pixels, anchored at its middle on its rim's plane (heights over that): eight panels, the rim dipping
// between the ribs' tips, darker ribs and edge, the tip on top; shaded by the dome's slope (the light does the rest).
export function umbrellaSprite(i) {
  const st = UMBRELLAS[i] || UMBRELLAS[0], S = umbrellaShape(i), R = S.R, H = S.H, PAN = Math.PI / 4;
  const A = artBuf(2 * R + 4, 2 * R + H + 6, R + 2, R + H + 3), c = rgb(st.c || '#24262c'), c2 = rgb(st.c2 || '#f0ece4'), n = [0, 0, 1];
  const film = [200, 222, 236], see = (px, py) => !(px & 3) && !((py + (px >> 2)) & 3);   // (a clear bubble's plastic: a glint on one art pixel in sixteen)
  for (let Y = -R; Y <= R; Y += 0.4) for (let X = -R; X <= R; X += 0.4) {
    const r = Math.hypot(X, Y), a = Math.atan2(Y, X) + Math.PI, f = (a / PAN) % 1, edge = R * (0.93 + 0.07 * Math.abs(Math.cos(f * Math.PI)));
    if (r > edge) continue;
    const q = Math.pow(r / R, S.e), Z = H * (1 - q), g = r > 1e-3 ? H * S.e * q / r / r : 0, nx = g * X, ny = g * Y, nl = Math.hypot(nx, ny, 1);
    n[0] = nx / nl; n[1] = ny / nl; n[2] = 1 / nl;
    // (a rib: within 1 px of the line out to a rib's tip - a whole art pixel wide)
    const rib = Math.min(f, 1 - f) * PAN * r < 1 && r > 3, rim = r > edge - 1.6, panel = Math.floor(a / PAN) & 1;
    if (st.clear) {
      if (rim) A.dot(X, Y, Z, c2, 1, n, 0);
      else if ((Math.abs(r - R * 0.6) < 0.8 && X + Y < -R * 0.45) || (Math.abs(r - R * 0.78) < 0.7 && X > R * 0.3 && Y < -R * 0.3)) A.dot(X, Y, Z, [255, 255, 255], 1, n, 0);   // (light caught on the plastic)
      else A.dot(X, Y, Z, film, 1, n, 0, null, see);
      continue;
    }
    let col = c;
    if (st.p === 'panels' && panel) col = c2;
    else if (st.p === 'rainbow') col = RAINBOW[Math.floor(a / PAN) % 8];
    else if (st.p === 'dots' && !rib) { const row = Math.round(Y / 7), dx = X - (Math.round((X - (row & 1) * 3.5) / 7) * 7 + (row & 1) * 3.5); if (Math.hypot(dx, Y - row * 7) < 1.7) col = c2; }
    else if (st.p === 'rim' && r > 0.72 * R) col = c2;
    A.dot(X, Y, Z, col, rib ? 0.62 : rim ? 0.66 : panel && st.p !== 'panels' && st.p !== 'rainbow' ? 0.86 : 1, n, 0);
  }
  A.dot(0, 0, H + 1, [40, 40, 44], 1, [0, 0, 1], 0); A.dot(0, 0.1, H + 2.5, [40, 40, 44], 1, [0, 0, 1], 0);   // the tip
  return A.G;
}

// ---- fountains ----------------------------------------------------------------------------------------------------
// The water of the city's fountains (task #417, the owner: "Fountains that are in the city should be animated and have
// procedural water effects to them."), drawn live over the stone (props-district.js fountain(30, 2): a round basin, a
// pedestal with a bowl, a column with a dish on top - baked without its spray, statics.js): a jet out of the dish
// that rises and falls, its crown breaking into arcs of drops falling into the bowl, the bowl brimming over in a
// ring of falling drops that splash into the basin, rings of ripples spreading out over the basin from there, ripples
// in the bowl, and the light glinting on the basin here and there. A loop of FOUNTAIN_FRAMES frames over FOUNTAIN_S
// seconds, the same frames for every fountain (each its own moment in the loop): the host picks one a frame. The
// spray glows a little after dark (as the baked spray did).
export const FOUNTAIN_FRAMES = 24, FOUNTAIN_S = 3;
export const FOUNTAIN = { water: 5, basin: 26, bowl: 9, bowlZ: 26, lip: 11.5, lipZ: 28, dishZ: 40 };   // (the stone's water and rims, from fountain(30, 2))
const h3 = (a, b, c) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483587); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// how high the jet stands over the dish at t (0..1 of the loop): it rises and falls once a loop
export const jetTop = (t) => FOUNTAIN.dishZ + 12 + 4 * Math.sin(t * TAU);
export function fountainSprite(fr) {
  const F = FOUNTAIN, t = fr / FOUNTAIN_FRAMES, top = jetTop(t), A = artBuf(72, 140, 36, 100);
  const CAM = [0, 0.55, 0.835], UP = [0, 0, 1], GLOW = [190, 236, 255, 34], W = [240, 249, 255], SPRAY = [200, 232, 247], DROP = [170, 220, 240], RIP = [136, 210, 232], RIP2 = [104, 192, 222];
  // the jet: a column out of the dish, white at its heart, the water climbing it in pulses (gaps rising up it)
  for (let z = F.dishZ; z <= top; z += 0.5) {
    if (h3((((Math.floor(z / 2.5) - fr) % FOUNTAIN_FRAMES) + FOUNTAIN_FRAMES) % FOUNTAIN_FRAMES, 7, 1) > 0.84 && z < top - 2) continue;   // (a gap a frame further up each frame: round the loop without a jump)
    for (const x of [-1.5, -0.5, 0.5, 1.5]) A.dot(x, 0.6, z, Math.abs(x) < 1 ? W : SPRAY, 1, CAM, F_NOCAST, GLOW);
  }
  // its crown: water breaking over the top
  for (let k = 0; k < 10; k++) { const a = (k / 10 + t) * TAU, r = 1 + 2 * h3(k, fr, 3); A.dot(Math.cos(a) * r, Math.sin(a) * r * 0.7 + 0.6, top + 0.5 + h3(k, fr, 4) * 1.5, W, 1, CAM, F_NOCAST, GLOW); }
  // arcs of drops from the crown into the bowl, running down them twice a loop
  for (let j = 0; j < 12; j++) {
    const a = (j + 0.5) / 12 * TAU, c = Math.cos(a), s = Math.sin(a), off = h3(j, 1, 5);
    for (let m = 0; m < 4; m++) {
      const p = (m / 4 + 2 * t + off) % 1, r = 1.5 + (F.bowl - 2) * p, z = top - (top - F.bowlZ - 1) * p * p;
      A.dot(c * r, s * r, z, m === 0 ? W : DROP, 1, CAM, F_NOCAST, GLOW);
    }
  }
  // the bowl brimming over: a ring of drops falling from its lip into the basin, and their splashes
  for (let j = 0; j < 28; j++) {
    const a = (j + 0.25) / 28 * TAU, c = Math.cos(a), s = Math.sin(a), off = h3(j, 2, 6);
    for (let m = 0; m < 3; m++) {
      const p = (m / 3 + 2 * t + off) % 1, r = F.lip + 0.3 + 1.8 * p, z = F.lipZ - (F.lipZ - F.water - 1) * p * p;
      A.dot(c * r, s * r, z, DROP, 1, CAM, F_NOCAST, GLOW);
    }
    if (h3(j, fr, 7) > 0.45) A.dot(c * (F.lip + 2.4), s * (F.lip + 2.4), F.water + 1.5, W, 1, CAM, F_NOCAST, GLOW);
  }
  // ripples spreading over the basin from there, broken up and fading as they go; and in the bowl from the arcs
  for (let k = 0; k < 2; k++) {
    const q = (2 * t + k / 2) % 1, rr = F.lip + 3 + (F.basin - F.lip - 4) * q, n = Math.ceil(rr * TAU / 1.6);
    for (let i = 0; i < n; i++) if (h3(i, k, Math.floor(rr)) > 0.25 + 0.55 * q) { const a = i / n * TAU; A.dot(Math.cos(a) * rr, Math.sin(a) * rr, F.water + 0.5, q < 0.5 ? RIP : RIP2, 1, UP, F_NOCAST); }
  }
  { const q = (2 * t + 0.3) % 1, rr = 2.5 + (F.bowl - 3.5) * q, n = Math.ceil(rr * TAU / 1.6); for (let i = 0; i < n; i++) if (h3(i, 9, Math.floor(rr * 2)) > 0.35 + 0.4 * q) { const a = i / n * TAU; A.dot(Math.cos(a) * rr, Math.sin(a) * rr, F.bowlZ + 0.5, RIP, 1, UP, F_NOCAST); } }
  // the light glinting on the basin: a spot here and there, a few frames each (lit as the day is: bright in the sun,
  // faint at night)
  for (let k = 0; k < 14; k++) {
    if ((t + h3(k, 3, 8)) % 1 > 0.13) continue;
    const a = h3(k, 4, 8) * TAU, r = F.lip + 4 + (F.basin - F.lip - 6) * h3(k, 5, 8);
    A.dot(Math.cos(a) * r, Math.sin(a) * r, F.water + 0.6, [255, 255, 255], 1, UP, F_NOCAST);
  }
  return A.G;
}

// A sprite drawn in art pixels: w, h, ax, ay in world px (the anchor on the art grid); dot(x, y, z, colour, shade,
// normal, flag, emissive, keep) puts the point at ground offset (x, y), height z (0 up) where it shows - the nearest
// the camera wins its art pixel (the furthest south and up, as the depth test has it); keep(px, py): only on the art
// pixels it likes (a dither).
function artBuf(w, h, ax, ay) {
  const P = ART_PX, G = new GBuf(Math.ceil(w / P) + 1, Math.ceil(h / P) + 1), depth = new Float32Array(G.w * G.h).fill(-1e9), c3 = [0, 0, 0];
  G.ap = P; G.ax = Math.round(ax / P); G.ay = Math.round(ay / P);
  const X0 = G.ax * P, Y0 = G.ay * P;
  return {
    G,
    dot(x, y, z, c, k, n, flag, e = null, keep = null) {
      if (z < 0) return;
      const px = Math.floor((X0 + x) / P), py = Math.floor((Y0 + y - z) / P), j = py * G.w + px;
      if (!G.inside(px, py) || depth[j] > y + z || (keep && !keep(px, py))) return;
      depth[j] = y + z;
      c3[0] = c[0] * k; c3[1] = c[1] * k; c3[2] = c[2] * k;
      G.put(px, py, c3, n, z, e, flag);
    },
  };
}

// A piece off a vehicle, tumbling or lying where it fell (task #402: render/vehdmg.js a part that came off, render/boom.js
// an explosion's): k 'b' a bumper, 'h' the bonnet, 'd' a door, 'w' a wheel, 'p' a panel, 't' the boot lid; paint
// '#rrggbb'; turned r eighths of a turn. Flat, in its paint, the edges darker; a door with its window, a wheel its hub.
const PART_SIZE = { b: [20, 5], h: [18, 14], d: [16, 10], w: [10, 10], p: [14, 8], t: [14, 10] };
export function partSprite(k, paint, r) {
  const [L, W] = PART_SIZE[k] || PART_SIZE.p, R = Math.ceil(Math.hypot(L, W) / 2) + 2, A = artBuf(2 * R, 2 * R + 6, R, R + 3);
  const a = (r | 0) * Math.PI / 4, c = Math.cos(a), s = Math.sin(a), n = [0, 0, 1];
  const body = k === 'b' ? [107, 107, 104] : /^#[0-9a-f]{6}$/i.test(paint || '') ? rgb(paint) : [120, 120, 120], tyre = [26, 26, 28], hub = [138, 138, 134], glass = [28, 42, 51];
  for (let y = -W / 2; y < W / 2; y += 0.5) for (let x = -L / 2; x < L / 2; x += 0.5) {
    const X = x * c - y * s, Y = x * s + y * c;
    if (k === 'w') { const rr = Math.hypot(x, y); if (rr <= 5) A.dot(X, Y, 3, rr < 2 ? hub : tyre, 1, n, 0); continue; }
    const edge = Math.abs(x) > L / 2 - 1 || Math.abs(y) > W / 2 - 1, win = k === 'd' && y < -W / 2 + 4 && Math.abs(x) < L / 2 - 2;
    A.dot(X, Y, 1.5, win ? glass : body, edge ? 0.68 : 1, n, 0);
  }
  return A.G;
}
