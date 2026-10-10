// Art v2 live renderer: the moving parts of the static world, drawn by the host over the baked chunks every frame
// from a handful of frames made on demand (the chunk bakes say where they are: chunkbake.js live):
//   flags      the cloth of a flag in the shared wind (task #426): the police stations' flags, the golf course's pins.
//              flagPose: how far it stands out and how fast it flaps for the wind's strength; flagCloth: where its
//              cloth is; flagSprite: one frame of it. The pole is baked with the chunk; the cloth is drawn on it.
// Pure code (no DOM, no clock): the host keys, uploads and times what these make; the tests run them in node.
// Drawn at the art's own pixel (ART_PX world px; G.ap), not made at full size and shrunk: a flag's stripes or a ripple
// a pixel of art wide stay whole and crisp, whichever way the cloth turns.
import { GBuf, F_THIN, ART_PX } from '../gbuf.js';
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

// A sprite drawn in art pixels: w, h, ax, ay in world px (the anchor on the art grid); dot(x, y, z, colour, shade,
// normal, flag, emissive) puts the point at ground offset (x, y), height z where it shows - the nearest the camera
// wins its art pixel (the furthest south and up, as the depth test has it).
function artBuf(w, h, ax, ay) {
  const P = ART_PX, G = new GBuf(Math.ceil(w / P) + 1, Math.ceil(h / P) + 1), depth = new Float32Array(G.w * G.h).fill(-1e9), c3 = [0, 0, 0];
  G.ap = P; G.ax = Math.round(ax / P); G.ay = Math.round(ay / P);
  const X0 = G.ax * P, Y0 = G.ay * P;
  return {
    G,
    dot(x, y, z, c, k, n, flag, e = null) {
      if (z < 0.5) return;
      const px = Math.floor((X0 + x) / P), py = Math.floor((Y0 + y - z) / P), j = py * G.w + px;
      if (!G.inside(px, py) || depth[j] > y + z) return;
      depth[j] = y + z;
      c3[0] = c[0] * k; c3[1] = c[1] * k; c3[2] = c[2] * k;
      G.put(px, py, c3, n, z, e, flag);
    },
  };
}
