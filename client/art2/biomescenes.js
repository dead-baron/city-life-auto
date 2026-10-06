// Art v2 green biome scenes, built to the N1 (redwood grove), N2 (temperate rainforest), N6 (botanical
// garden) and N7 (wetlands) targets from the flora kit (flora.js), the water system (water.js), the rock
// sprites (terrain.js), ambient critters (critters.js), forage finds (forage.js) and the garden / wetland
// props (props-garden.js). 768 x 512 world px each, like the district scenes.
//
//   redwood     giant fluted redwood trunks wider than a car, a carpet of ferns and sorrel, mossy fallen logs,
//               a winding dirt trail with a rail fence and a finger post, a plank footbridge over a rocky
//               creek with little cascades, golden god rays with dust motes, hikers
//   rainforest  moss-hung firs and cedars, big-leaf maples in gold, huge ferns, mossy boulders, a fall into a
//               clear pool with stepping stones, a rotting log with mushroom clusters (red caps, chanterelles,
//               oyster shelves, glowing blue), a forager kneeling with a basket, puddles, fog, light beams
//   gardens     a walled botanical garden: glasshouse, rose garden with arches and a statue, hedged paths, a
//               fountain, the orchard with ladders and crates, raised vegetable beds and a scarecrow, a
//               lavender field, beehives and a beekeeper, a Japanese garden (koi pond, red bridge, stone
//               lanterns, raked gravel, maples), the iron gate between lamp pillars, gardeners
//   wetlands    a slow river with sandbars and reed islands, a lily pond, cattails, a fishing pier with a
//               lantern and an angler, a heron, ducks and a swan, dragonflies, a beaver dam with its lodge
//               and spill, a boardwalk with hikers and an info sign, a canoe on the bank, willows, sun glints
//
// The Lighter has no volumetrics, so light shafts are faked in the G-buffer after the scene is composed
// (godRays: a soft additive warm glow in the emissive map, plus a slight lift of the albedo, streaked along
// the beam) and so is fog (fog: the albedo pulled toward a pale blue-grey and a faint cool glow, in noisy
// low patches). Dust motes are the critter kit's glowing 'motes' frames floating in the beams.
//
// SCENES[name](preset) -> { G, lights };  TARGETS[name] -> target image;  PRESET[name] -> preferred preset
import { Scene, distSq } from './scene.js';
import { GBuf, F_GROUND, F_WATER, F_WET, F_LEAF, hash, vnoise, bayer, mulberry32 } from './gbuf.js';
import { ramp } from './palette.js';
import { Vox } from './voxel.js';
import { person } from './people.js';
import * as F from './flora.js';
import * as WA from './water.js';
import { outcrop } from './terrain.js';
import { critterFrames } from './critters.js';
import { groundSprite } from './forage.js';
import * as PG from './props-garden.js';
import * as P from './props.js';
import * as K from './props-park.js';
import * as U from './props-rural.js';
import * as D from './props-district.js';
import * as PW from './props-wild.js';

const PI = Math.PI, UP = [0, 0, 1];
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const pick = (Rm, t, x, y, d = 0.6) => Rm[Math.max(0, Math.min(Rm.length - 1, Math.round(t * (Rm.length - 1) + bayer(x, y) * d)))];
const nrm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// ---- sprite cache: plants and props are made once per variant and shared between scenes and presets -------
const CACHE = new Map();
function spr(key, make) { let s = CACHE.get(key); if (!s) { s = make(); if (s instanceof Vox) s = s.render(0); CACHE.set(key, s); } return s; }
const fl = (kind, i, n = 4) => spr(kind + '#' + (((i % n) + n) % n), () => F.FLORA[kind]((((i % n) + n) % n) * 17 + 5));
const vx = (key, make, hd = 0) => spr(key + '@' + hd.toFixed(2), () => make().render(hd));

// ---- geometry helpers -----------------------------------------------------------------------------------------
function segD2(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2; }
const pathDist = (P) => (x, y) => { let b = 1e9; for (let i = 1; i < P.length; i++) b = Math.min(b, segD2(x, y, P[i - 1][0], P[i - 1][1], P[i][0], P[i][1])); return Math.sqrt(b); };
const blobIn = (cx, cy, rx, ry, seed = 0, wob = 0.25) => (x, y) => { const a = Math.atan2(y - cy, x - cx), w = 1 + wob * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 5 + seed * 2.3) * 0.4); return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < w * w; };
const inRect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;

// ---- ground painters --------------------------------------------------------------------------------------------
const DUFF_RED = ramp('#7a4a30', 7, 3, { dark: 0.62, light: 0.42, shift: 0.2 }), DUFF_DARK = ramp('#5e4430', 7, 3, { dark: 0.62, light: 0.42, shift: 0.2 });
const MOSS_G = F.FOL('#5a8a2a'), DIRT = ramp('#b48656', 7, 3, { dark: 0.5, light: 0.45, shift: 0.18 }), MUD = ramp('#6a5038', 6, 3, { dark: 0.55, light: 0.4 });
const LEAVES = [[214, 150, 50], [200, 96, 40], [230, 190, 80], [170, 70, 40]];
// forest floor: duff with short needle streaks in random directions, moss patches, fallen leaves.
// o: seed, R (duff ramp), moss (0..1 coverage), leaves (density), test(x, y) where to paint
function forestFloor(G, o = {}) {
  const seed = o.seed ?? 3, Rd = o.R || DUFF_RED, moss = o.moss ?? 0.35, lv = o.leaves ?? 0.02, test = o.test || (() => true);
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    if (!test(x, y)) continue;
    const big = vnoise(x, y, 40, seed), mid = vnoise(x, y, 9, seed + 1), h = hash(x, y, seed);
    const th = hash(x >> 3, y >> 3, seed + 4) * PI, u = x * Math.cos(th) + y * Math.sin(th), v = -x * Math.sin(th) + y * Math.cos(th);
    const st = hash(Math.floor(u / 4), Math.floor(v), seed + 3);
    let c;
    if (vnoise(x, y, 21, seed + 2) * 0.75 + big * 0.25 > 1 - moss * 0.75) c = pick(MOSS_G, 0.32 + (mid - 0.5) * 0.3 + (h > 0.8 ? 0.15 : h < 0.15 ? -0.12 : 0), x, y, 0.7);
    else c = pick(Rd, 0.42 + (big - 0.5) * 0.3 + (mid - 0.5) * 0.2 + (st > 0.72 ? 0.2 : st < 0.22 ? -0.16 : 0), x, y, 0.7);
    if (h > 1 - lv) c = LEAVES[Math.floor(hash(y, x, seed) * LEAVES.length)];
    G.put(x, y, c, nrm((hash(x, y, seed + 5) - 0.5) * 0.35, (hash(x, y, seed + 6) - 0.5) * 0.35, 1), 0, null, F_GROUND | F_WET);
  }
}
// a packed dirt trail along a polyline: lighter worn middle, ragged darker edges, pebbles and leaves
function trail(G, path, width, o = {}) {
  const seed = o.seed ?? 5, dist = pathDist(path), Rt = o.R || DIRT, hw = width / 2;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of path) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (let y = Math.max(0, Math.floor(y0 - hw - 6)); y < Math.min(G.h, y1 + hw + 6); y++) for (let x = Math.max(0, Math.floor(x0 - hw - 6)); x < Math.min(G.w, x1 + hw + 6); x++) {
    const d = dist(x, y), edge = hw + (vnoise(x, y, 7, seed) - 0.5) * 7 + (hash(x, y, seed) - 0.5) * 2;
    if (d > edge) continue;
    const e = d / edge, h = hash(x, y, seed + 1);
    let t = 0.58 - e * e * 0.3 + (vnoise(x, y, 13, seed + 2) - 0.5) * 0.25 + (h > 0.93 ? 0.2 : h < 0.06 ? -0.2 : 0);
    let c = pick(Rt, t, x, y, 0.7);
    if (e > 0.82 && hash(x, y, seed + 3) > 0.5) c = pick(DUFF_RED, 0.45, x, y, 0.5);
    if (hash(x, y, seed + 4) > 0.992) c = LEAVES[Math.floor(hash(x, y, 9) * 4)];
    G.put(x, y, c, nrm((h - 0.5) * 0.3, (hash(x, y, seed + 6) - 0.5) * 0.3, 1), 0, null, F_GROUND | F_WET);
  }
}
// sun glitter on open water: short bright warm crests, densest toward (cx, cy)
function glitter(G, cx, cy, r, seed = 3, k = 1) {
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(G.h, cy + r); y++) for (let x = Math.max(0, Math.floor(cx - r * 1.3)); x < Math.min(G.w, cx + r * 1.3); x++) {
    const i = y * G.w + x; if (!(G.flag[i] & F_WATER) || G.z[i] > 0) continue;
    const d = Math.hypot((x - cx) / (r * 1.3), (y - cy) / r); if (d > 1) continue;
    const sw = Math.sin(y * 0.7 + vnoise(x, y, 9, seed) * 6 + x * 0.06);
    if (sw > 0.72 + d * 0.25 && hash(x >> 1, y >> 1, seed) > 0.35 + d * 0.55) G.put(x, y, [255, 230 - d * 40, 160 - d * 50], [0, 0.1, 1], 0, [255, 214, 140, Math.round(220 * (1 - d) * k)], F_GROUND | F_WATER);
  }
}

// ---- volumetric fakes (applied to the finished G-buffer) ----------------------------------------------------------
// light shafts from the upper left: rays [{x, y (where the beam enters), w (half width), len, k}], dir (dx, dy)
function godRays(G, rays, dir = [0.52, 0.85], col = [255, 196, 118]) {
  const [dx, dy] = dir, px = -dy, py = dx;
  for (const r of rays) {
    const len = r.len ?? 500, w = r.w ?? 20, k = r.k ?? 0.3, seed = r.seed ?? 7;
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const rx = x - r.x, ry = y - r.y, al = rx * dx + ry * dy; if (al < 0 || al > len) continue;
      const ac = Math.abs(rx * px + ry * py); if (ac > w * 1.4) continue;
      const streak = 0.65 + 0.35 * vnoise(rx * px + ry * py, al * 0.05, 3, seed);
      const s = k * clamp((w * 1.4 - ac) / (w * 0.8)) * Math.pow(1 - al / len, 0.8) * streak * clamp(al / 30);
      if (s < 0.01) continue;
      const i = y * G.w + x, j = i * 4; if (!G.col[j + 3]) continue;
      for (let q = 0; q < 3; q++) G.col[j + q] += (col[q] - G.col[j + q]) * s * 0.07;
      const a = Math.min(255, G.emi[j + 3] + s * 120);
      if (G.emi[j + 3] < 8) { G.emi[j] = col[0]; G.emi[j + 1] = col[1]; G.emi[j + 2] = col[2]; }
      G.emi[j + 3] = a;
    }
  }
}
// low fog in patches: blobs [{x, y, rx, ry, k}]; it hangs low, so tall things (z > top) poke out of it
function fog(G, blobs, o = {}) {
  const col = o.col || [206, 214, 214], top = o.top ?? 70, seed = o.seed ?? 11;
  for (const b of blobs) for (let y = Math.max(0, Math.floor(b.y - b.ry * 1.3)); y < Math.min(G.h, b.y + b.ry * 1.3); y++) for (let x = Math.max(0, Math.floor(b.x - b.rx * 1.3)); x < Math.min(G.w, b.x + b.rx * 1.3); x++) {
    const i = y * G.w + x, j = i * 4; if (!G.col[j + 3]) continue;
    const q = ((x - b.x) / b.rx) ** 2 + ((y - b.y) / b.ry) ** 2, n = vnoise(x, y * 1.6, 16, seed) * 0.6 + vnoise(x, y * 2, 6, seed + 1) * 0.4;
    let s = (b.k ?? 0.5) * clamp(1.2 - q) * clamp((n - 0.28) * 2.2) * clamp(1 - G.z[i] / top);
    if (s < 0.02) continue;
    s = Math.min(0.8, s);
    for (let q2 = 0; q2 < 3; q2++) G.col[j + q2] += (col[q2] - G.col[j + q2]) * s;
    if (G.emi[j + 3] < 8) { G.emi[j] = 170; G.emi[j + 1] = 184; G.emi[j + 2] = 196; G.emi[j + 3] = Math.round(s * 46); }
  }
}
// dust motes in the beams (frames of the critter kit, floating at height)
function motes(sc, pts, kind = 'motes') {
  const fr = critterFrames(kind);
  for (const [x, y, h, f] of pts) sc.add(fr[f % fr.length], x, y, h, y);
}

// ---- trees and plants that the kit doesn't make at this size -----------------------------------------------
const BARK_RW = ramp('#80402a', 8, 3, { dark: 0.7, light: 0.5, shift: 0.22 }), BARK_FIR = ramp('#6a4a36', 7, 3, { dark: 0.64, light: 0.45, shift: 0.18 });
// A sprig of feathery foliage (redwood spray): a drooping stem with needles both sides, lit by `lit` (0..1)
function sprig(G, x, y, len, ang, Rf, lit, seed, zAt) {
  const droop = 0.025 + hash(seed, 1, 3) * 0.02;
  for (let s = 0; s < len; s += 0.8) {
    const X = x + Math.cos(ang) * s, Y = y + Math.sin(ang) * s + droop * s * s, t = s / len, nl = 2.6 * (1 - t * 0.6);
    const base = lit + (hash(Math.round(X), Math.round(Y), seed) - 0.5) * 0.25 - t * 0.08;
    for (let q = -nl; q <= nl; q += 1) {
      const xx = Math.round(X - Math.sin(ang) * q + (q > 0 ? 0.5 : -0.5)), yy = Math.round(Y + Math.cos(ang) * q * 0.6 + Math.abs(q) * 0.5);
      if (!G.inside(xx, yy)) continue;
      G.put(xx, yy, pick(Rf, clamp(base + (q < 0 ? 0.1 : -0.12) + (Math.abs(q) > nl - 1 ? 0.08 : 0)), xx, yy, 0.4), nrm(q < 0 ? -0.3 : 0.2, 0.3, 0.9), zAt(yy), null, F_LEAF);
    }
  }
}
function sprayClump(G, cx, cy, rx, ry, Rf, seed, zAt, n = 0) {
  const rnd = mulberry32(seed * 31 + 1), N = n || Math.round(rx * ry / 9), pts = [];
  for (let i = 0; i < N; i++) { const a = rnd() * PI * 2, q = Math.sqrt(rnd()); pts.push([cx + Math.cos(a) * rx * q, cy + Math.sin(a) * ry * q]); }
  pts.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of pts) { const lit = clamp(0.62 - (x - cx) / rx * 0.18 - (y - cy) / ry * 0.22 + (rnd() - 0.5) * 0.15); sprig(G, x, y, 7 + rnd() * 7, (rnd() < 0.5 ? PI : 0) + (rnd() - 0.5) * 1.1 + (rnd() < 0.5 ? 0.3 : -0.3), Rf, lit, seed + Math.round(x * 3 + y), zAt); }
}
// A giant redwood (or any big conifer trunk) whose crown is far above the frame: a fluted, flared column
// hw (half width) wide rising H px up the screen, root flares on the ground, moss low on the shady side,
// feathery sprays hanging off its sides. o: B (bark), R (foliage), sprays, moss, flare, roots
function bigTrunk(seed, hw, H, o = {}) {
  const flare = o.flare ?? 0.55, B = o.B || BARK_RW, Rf = o.R || F.FOL('#5e9a2a'), rnd = mulberry32(seed * 977 + 3);
  const Wd = Math.ceil(hw * 2 * (1 + flare) + 120), bulge = o.bulge ?? 0.5, Hh = Math.ceil(H + hw * (1 + flare) * bulge + 30);
  const G = new GBuf(Wd, Hh); G.ax = Wd >> 1; G.ay = Hh - Math.ceil(hw * (1 + flare) * bulge) - 14;
  const cx = G.ax, foot = G.ay, nfl = o.flutes ?? Math.max(5, Math.round(hw / 4));
  const rad = (z) => hw * (1 + flare * Math.max(0, 1 - z / (hw * 1.5)) ** 2) * (1 + 0.035 * Math.sin(z * 0.045 + seed)) * (1 - Math.min(1, z / Math.max(1, H)) * (o.taper ?? 0.12));
  const root = (front) => {
    for (let i = 0; i < (o.roots ?? 6); i++) {
      const a = PI * (0.08 + 0.84 * hash(i, 1, seed)) + (i % 2 ? 0 : PI), fr = Math.sin(a) > 0.2;
      if (fr !== front) continue;
      const L = hw * (0.45 + hash(i, 2, seed) * 0.45), r0 = hw * 0.85, w0 = hw * 0.22;
      for (let s = 0; s < L; s += 0.6) {
        const wv = w0 * (1 - s / L) + 1, X = cx + Math.cos(a) * (r0 + s), Y = foot + Math.sin(a) * (r0 + s) * 0.62;
        for (let q = -wv; q <= wv; q++) for (let zz = 0; zz <= wv * 0.8; zz++) {
          const xx = Math.round(X - Math.sin(a) * q), yy = Math.round(Y - zz + Math.cos(a) * q * 0.6); if (!G.inside(xx, yy)) continue;
          const u = q / wv, mo = vnoise(xx, yy, 4, seed + 9) > 0.55; G.put(xx, yy, mo ? pick(MOSS_G, 0.35 + zz / wv * 0.3, xx, yy, 0.5) : pick(B, 0.36 - u * 0.2 + zz / wv * 0.25 + (hash(xx, yy, seed) > 0.85 ? -0.2 : 0), xx, yy, 0.5), nrm(-Math.sin(a) * u * 0.6, Math.cos(a) * u * 0.6 + 0.3, 0.7), zz, null, mo ? F_LEAF : 0);
        }
      }
    }
  };
  root(false);
  for (let y = 0; y < G.h; y++) {
    const zEst = foot - y, r = rad(Math.max(0, zEst));
    if (zEst > H) continue;
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const u = (x + 0.5 - cx) / r; if (Math.abs(u) > 1) continue;
      const dep = r * Math.sqrt(1 - u * u), z = zEst + dep * bulge;
      if (z < 0) continue;
      const phi = Math.asin(u), fl = Math.sin(phi * nfl + vnoise(Math.max(0, zEst) * 0.5, phi * 3, 9, seed) * 2.4 + seed);
      const streak = hash(Math.round(phi * hw * 0.5), Math.floor(Math.max(0, zEst) / (4 + hash(Math.round(phi * hw * 0.5), 0, seed) * 6)), seed);
      const plate = hash(Math.round(phi * hw * 0.35), Math.floor((Math.max(0, zEst) + hash(Math.round(phi * hw * 0.35), 1, seed) * 30) / 26), seed + 3);
      let t = 0.46 - u * 0.24 + (fl > 0.5 ? 0.14 : fl < -0.45 ? -0.26 : 0) + (streak > 0.84 ? -0.2 : streak < 0.12 ? 0.12 : 0) + (plate - 0.5) * 0.16 + (z < 6 ? -0.15 : 0);
      let c = pick(B, clamp(t), x, y, 0.55), f = 0;
      const mz = (o.moss ?? 50) * (0.6 + vnoise(phi * 9, 0, 3, seed) * 0.8);
      if (zEst < mz && (u > -0.2 || zEst < mz * 0.5) && vnoise(x * 1.6, y * 0.22, 5, seed + 2) * 0.7 + vnoise(x, y, 3, seed + 4) * 0.3 > (o.mossK ?? 0.45) + zEst / mz * 0.35) { c = pick(MOSS_G, 0.38 - u * 0.15 + (hash(x, y, seed) - 0.5) * 0.3, x, y, 0.5); f = F_LEAF; }
      G.put(x, y, c, nrm(u + Math.cos(phi * nfl) * 0.2, Math.sqrt(1 - u * u) * 0.95, 0.12), z, null, f);
    }
  }
  root(true);
  // sprays off the sides from `low` up, a few crossing in front
  const zAt = (yy) => Math.max(1, foot - yy + 6), low = o.low ?? 90;
  for (let i = 0; i < (o.sprays ?? 7); i++) {
    const zz = low + rnd() * (H - low - 10), side = rnd() < 0.5 ? -1 : 1, r = rad(zz), y = foot - zz;
    const front = rnd() < (o.front ?? 0.2), x = front ? cx + (rnd() - 0.5) * r : cx + side * (r + 4 + rnd() * 26);
    sprayClump(G, x, y, 14 + rnd() * 16, 8 + rnd() * 7, Rf, seed + i * 7, zAt);
  }
  if (o.cap) { const r = rad(H); sprayClump(G, cx - r * 0.5, foot - H + 8, r * 1.4, r * 0.7, Rf, seed + 91, zAt, Math.round(r * r * 0.5)); sprayClump(G, cx + r * 0.6, foot - H + 14, r * 1.2, r * 0.6, Rf, seed + 92, zAt, Math.round(r * r * 0.4)); sprayClump(G, cx, foot - H + 24, r * 1.5, r * 0.6, Rf, seed + 93, zAt, Math.round(r * r * 0.5)); }
  G.outline(0.42, true);
  return G;
}
// hanging moss strands (old man's beard) under the leafy pixels of a conifer sprite
function mossHung(S, seed = 1, amount = 0.08) {
  const G = new GBuf(S.w, S.h); G.ax = S.ax; G.ay = S.ay; G.blit(S, 0, 0);
  const Rm = F.FOL('#8aa03a', { warm: 60 });
  for (let x = 0; x < S.w; x++) for (let y = S.h - 2; y > 0; y--) {
    const i = y * S.w + x; if (!(S.flag[i] & F_LEAF) || S.col[(i + S.w) * 4 + 3] || hash(x, y, seed) > amount) continue;
    const len = 3 + Math.floor(hash(x, y, seed + 1) * 10), z = S.z[i];
    for (let k = 1; k <= len; k++) { const yy = y + k, xx = x + (Math.sin(k * 0.8 + x) > 0.7 ? 1 : 0); if (!G.inside(xx, yy) || G.col[(yy * G.w + xx) * 4 + 3]) break; G.put(xx, yy, pick(Rm, 0.6 - k / len * 0.35, xx, yy, 0.4), [-0.2, 0.6, 0.7], Math.max(1, z - k), null, F_LEAF); }
  }
  return G;
}

// ---- people ----------------------------------------------------------------------------------------------
const HIKERS = [
  { skin: 1, build: 1, hair: { style: 'short', color: 1 }, top: { kind: 'jacket', color: 'teal', color2: 'navy' }, bottom: { kind: 'cargo', color: 'khaki' }, shoes: 'brown', hat: { kind: 'cap', color: 'navy' }, back: 'backpack', backColor: 'red', carry: 'cane' },
  { skin: 2, build: 0, hair: { style: 'short', color: 0 }, top: { kind: 'tee', color: 'navy' }, bottom: { kind: 'shorts', color: 'khaki' }, shoes: 'brown', hat: { kind: 'cap', color: 'red' }, back: 'backpack', backColor: 'yellow' },
  { skin: 3, build: 0, fem: true, hair: { style: 'pony', color: 0 }, top: { kind: 'hoodie', color: 'purple' }, bottom: { kind: 'pants', color: 'grey' }, shoes: 'brown', back: 'backpack', backColor: 'teal', carry: 'cane' },
  { skin: 0, build: 1, beard: 'short', hair: { style: 'short', color: 2 }, top: { kind: 'flannel', color: 'brown', pattern: 'check' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', hat: { kind: 'bucket', color: 'khaki' }, back: 'backpack', backColor: 'green' },
];
const walker = (sc, x, y, app, dir, f = 0, dz = 0) => sc.add(person(app, dir, 'walk', f), x, y, dz, y + (dz ? 0.6 : 0));

// ---- N1 redwood grove ------------------------------------------------------------------------------------------
export function buildRedwood(preset = 'golden') {
  const sc = new Scene(768, 512, preset, 101), G = sc.G;
  const tr = [[196, -20], [214, 40], [238, 100], [270, 160], [318, 214], [372, 262], [410, 318], [436, 380], [468, 446], [500, 530]];
  const spur = [[352, 246], [400, 254], [430, 258]];
  const creek = [[546, -20, 92], [560, 60, 96], [582, 140, 100], [590, 220, 96], [596, 300, 104], [612, 380, 100], [628, 460, 104], [640, 540, 104]];
  forestFloor(G, { seed: 11, moss: 0.45, leaves: 0.03 });
  trail(G, tr, 66, { seed: 12 }); trail(G, spur, 46, { seed: 13 });
  const info = WA.paintRiver(G, creek, { seed: 14, banks: 'rocky', bankW: 12, bars: false, pal: WA.WATER.river, current: 1.2 });
  const onTrail = (x, y) => pathDist(tr)(x, y) < 30 || pathDist(spur)(x, y) < 26;
  const nearCreek = (x, y) => info.region(x, y) > 0 || info.region(x - 8, y) > 0 || info.region(x + 8, y) > 0 || info.region(x, y + 8) > 0;
  // rocks in and along the creek, foam round them, little cascades across it
  const rocks = [];
  for (let s = 10; s < 600; s += 9) { const c = info.at(s); for (const k of [-0.62, -0.25, 0.15, 0.5]) { if (hash(s, k * 10, 3) > 0.26) continue; const off = (k + (hash(s, k * 20, 4) - 0.5) * 0.3) * c.w, x = c.x + c.ty * off, y = c.y - c.tx * off, r = 5 + hash(s, k * 30, 5) * 9; rocks.push([x, y, r]); WA.foamRing(G, x, y, r * 0.8, PI / 2, 0, s, 0.7); } }
  for (const s of [70, 205, 330, 450]) { const c = info.at(s); WA.foamPatch(G, c.x, c.y, c.w * 0.55, 9, 0, s, 1.2); for (let k = 0; k < 3; k++) { const q = (hash(s, k, 6) - 0.5) * 0.9; rocks.push([c.x + c.ty * q * c.w, c.y - c.tx * q * c.w - 4 - hash(s, k, 8) * 10, 7 + hash(s, k * 10, 6) * 8]); } }
  for (const s of [-1, 1]) for (const b of info.bank(s, 0.6, 19)) rocks.push([b.x, b.y, 7 + hash(Math.round(b.x), Math.round(b.y), 7) * 9]);
  for (const [x, y, r] of rocks) if (y > -10 && y < 530) { const k = Math.round(x * 3 + y) % 6, sz = Math.round(r * 1.6 / 3) * 3; sc.add(spr('rk' + k + ':' + sz, () => F.rock(k + 1, sz, { moss: 0.3, color: ['#7a7c7e', '#86827c', '#6e7276'][k % 3], tall: 0.6 }).render(0)), x, y + r * 0.2); }
  // the giant trunks
  const trunks = [[30, 430, 54, 520, 1], [366, 205, 62, 300, 2], [748, 372, 60, 470, 3], [266, 46, 30, 140, 5], [690, 40, 26, 130, 6], [120, 40, 22, 120, 7]];
  for (const [x, y, hw, H, s] of trunks) sc.add(spr('rw' + s, () => bigTrunk(s * 13, hw, H, { sprays: Math.round(H / 50), low: Math.min(110, H * 0.4), mossK: 0.62, moss: 60 })), x, y);
  const nearTrunk = (x, y) => trunks.some(([tx, ty, hw]) => Math.hypot(x - tx, (y - ty) * 1.4) < hw * 1.3);
  // fallen logs: one across the slope on the left, one over the creek at the top
  sc.add(vx('log1', () => PG.fallenLog(250, 19, 3, { moss: 0.32, mossCol: '#4a7028' }), -0.22), 168, 300);
  sc.add(vx('log2', () => PG.fallenLog(230, 16, 4, { moss: 0.32, mossCol: '#4a7028' }), 0.12), 560, 92);
  sc.add(vx('log3', () => PG.fallenLog(120, 12, 5, { moss: 0.55, mossCol: '#4e7a28' }), 0.5), 330, 470);
  // fence along the trail, finger post, footbridge with hikers
  for (const [x, y, a, l] of [[150, 128, 0.35, 70], [205, 166, 0.95, 50], [240, 210, 0.55, 40]]) sc.add(vx('rail' + l + a, () => K.woodRail(l), a), x, y);
  sc.add(vx('finger', () => U.fingerPost()), 168, 86);
  const fb = WA.footbridge(236, 30, 12);
  sc.add(vx('fbridge', () => fb), 540, 262);
  walker(sc, 236, 122, HIKERS[0], 1, 0); walker(sc, 262, 182, HIKERS[1], 1, 2); walker(sc, 444, 400, HIKERS[2], 1, 1); walker(sc, 512, 262, HIKERS[3], 2, 3, 12);
  // the floor: ferns and sorrel everywhere off the trail, salal and huckleberry, a few flowers
  const logs = [[168, 300, -0.22, 125, 22], [560, 92, 0.12, 115, 18], [330, 470, 0.5, 60, 14]];
  const onLog = (x, y) => logs.some(([lx, ly, a, h, r]) => Math.sqrt(segD2(x, y, lx - Math.cos(a) * h, ly - Math.sin(a) * h, lx + Math.cos(a) * h, ly + Math.sin(a) * h)) < r);
  const trD = pathDist(tr), spD = pathDist(spur), rnd = mulberry32(17);
  for (let gy = -10; gy < 540; gy += 16) for (let gx = -10; gx < 790; gx += 19) {
    const x = gx + (rnd() - 0.5) * 14, y = gy + (rnd() - 0.5) * 12, r = rnd(), i = Math.floor(rnd() * 1000);
    if (rnd() < 0.12 || nearCreek(x, y) || nearTrunk(x, y) || onLog(x, y) || (y > 238 && y < 290 && x > 410 && x < 660)) continue;
    const s = r < 0.5 ? spr('fern' + (i % 8), () => F.fern(i % 8 + 3, 22 + (i % 8) * 2.4, F.FOL(['#4a8a2c', '#5a9a2c', '#3e7e2a', '#6a9a2a'][i % 4]))) : r < 0.78 ? fl('swordFern', i) : r < 0.86 ? spr('fernS' + (i % 4), () => F.fern(i % 4 + 40, 16 + (i % 4) * 2, F.FOL('#6a9a2a', { warm: 56 }))) : r < 0.93 ? fl('trillium', i) : fl('deadBracken', i, 2);
    if (Math.min(trD(x, y), spD(x, y), trD(x, y - s.ay * 0.7), spD(x, y - s.ay * 0.7)) < 25 + s.w * 0.3) continue;
    sc.add(s, x, y);
  }
  // trail-edge ferns leaning in, and a few along the creek banks
  for (let i = 0; i < 40; i++) { const k = i / 40, a = tr[Math.floor(k * (tr.length - 1))], b = tr[Math.floor(k * (tr.length - 1)) + 1], t = (k * (tr.length - 1)) % 1, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, side = i % 2 ? 1 : -1; if (!nearTrunk(x + side * 40, y) && !onLog(x + side * 40, y)) sc.add(fl('swordFern', i), x + side * (54 + hash(i, 1, 3) * 6), y + 10); }
  // foreground crowns of trees standing south of the frame
  for (const [x, y, s] of [[60, 610, 1], [700, 620, 2], [430, 640, 3]]) sc.add(spr('fgc' + s, () => F.broadleaf(s * 7, { h: 190, cw: 74, ch: 62, R: F.FOL('#6a9a26', { warm: 58 }), leaf: 'fine', cs: 4, dens: 1, lobes: 14, tw: 7 })), x, y);
  // god rays and motes
  motes(sc, Array.from({ length: 26 }, (_, i) => { const al = 60 + hash(i, 1, 5) * 360, ac = (hash(i, 2, 5) - 0.5) * 50; return [-60 + 0.52 * al - 0.85 * ac + (i % 3) * 60, -40 + 0.85 * al + 0.52 * ac, 12 + hash(i, 3, 5) * 50, i]; }));
  const out = sc.finish();
  godRays(out.G, [{ x: -60, y: -40, w: 26, len: 560, k: 0.13 }, { x: 50, y: -60, w: 20, len: 520, k: 0.16, seed: 8 }, { x: 160, y: -50, w: 14, len: 430, k: 0.12, seed: 9 }]);
  return out;
}

// ---- N2 temperate rainforest -------------------------------------------------------------------------------------
const FIR_DARK = F.FOL('#2e5e34', { warm: 70, shift: 0.55 }), GOLD_MAPLE = F.FOL('#e0a020', { cool: 25, shiftD: 0.45, dark: 0.64 });
// a forest puddle: dark water mirroring the pale sky, a wet rim
function forestPuddle(G, cx, cy, rx, ry, seed = 3) {
  for (let y = Math.floor(-ry - 2); y <= ry + 2; y++) for (let x = Math.floor(-rx - 2); x <= rx + 2; x++) {
    const X = Math.round(cx + x), Y = Math.round(cy + y); if (!G.inside(X, Y)) continue;
    const d = (x / rx) ** 2 + (y / ry) ** 2 + (vnoise(X, Y, 6, seed) - 0.5) * 0.7;
    if (d > 1.35) continue;
    const i = Y * G.w + X, j = i * 4;
    if (d > 1) { G.col[j] *= 0.72; G.col[j + 1] *= 0.7; G.col[j + 2] *= 0.72; continue; }
    const sky = y < -ry * 0.2 && hash(X >> 1, Y, seed) > 0.4 ? 0.55 : 0.25, c = [70 + sky * 140, 84 + sky * 140, 96 + sky * 140];
    G.put(X, Y, c, [0, 0, 1], 0, sky > 0.5 ? [200, 210, 220, 30] : null, F_GROUND | F_WATER | F_WET);
  }
}
export function buildRainforest(preset = 'golden') {
  const sc = new Scene(768, 512, preset, 202), G = sc.G;
  const clearing = blobIn(330, 300, 175, 92, 3, 0.22), path = [[150, -20], [190, 70], [250, 170], [300, 250], [360, 320], [440, 330], [520, 300]];
  const pool = blobIn(605, 222, 112, 70, 5, 0.18);
  forestFloor(G, { seed: 21, R: DUFF_DARK, moss: 0.3, leaves: 0.07 });
  trail(G, path, 50, { seed: 22, R: ramp('#7a5a3c', 7, 3, { dark: 0.55, light: 0.4 }) });
  forestFloor(G, { seed: 23, R: ramp('#6a4a34', 7, 3, { dark: 0.55, light: 0.4 }), moss: 0.12, leaves: 0.09, test: (x, y) => clearing(x, y) && vnoise(x, y, 14, 3) > 0.25 });
  WA.paintPond(G, pool, { seed: 24, bank: 'rocky', bankW: 7, depthR: 46, maxDepth: 0.75, bbox: [470, 130, 740, 310], current: 0.25 });
  for (const [x, y, rx, ry] of [[286, 210, 16, 6], [372, 352, 22, 7], [228, 324, 12, 5], [456, 372, 14, 5], [330, 410, 18, 6], [180, 250, 10, 4]]) forestPuddle(G, x, y, rx, ry, x);
  // the rock wall at the back of the pool, the fall, mossy boulders round the pool
  sc.add(spr('rfBack', () => outcrop(5, 150, 70, 150, 'granite', { moss: 0.7, hang: { kind: 'moss', amount: 0.8 }, veg: { kind: 'shrub', density: 0.4 } })), 610, 110);
  sc.add(spr('rfFall', () => PW.waterfall(34, 118, 5)), 612, 176);
  for (const [x, y, w, d, h, sd] of [[490, 140, 100, 60, 100, 1], [742, 150, 100, 70, 120, 2], [720, 50, 80, 50, 150, 3], [500, 50, 90, 50, 130, 4]]) sc.add(spr('rfOut' + sd, () => outcrop(sd * 7, w, d, h, 'granite', { moss: 0.8, hang: { kind: 'moss', amount: 0.7 }, veg: { kind: 'shrub', density: 0.5 } })), x, y);
  const rocks = [[500, 268, 34], [536, 300, 22], [700, 300, 30], [735, 250, 36], [480, 190, 26], [570, 330, 18], [650, 318, 16]];
  for (const [x, y, sz] of rocks) sc.add(spr('rfR' + sz, () => F.rock(sz, sz, { moss: 0.85, color: '#7a7a76', tall: 0.7 }).render(0)), x, y);
  for (const [x, y, sz] of [[560, 248, 9], [590, 262, 10], [624, 270, 9], [655, 262, 10], [600, 230, 8]]) sc.add(spr('rfSS' + sz, () => WA.steppingStone(sz, sz).render(0)), x, y);
  sc.add(vx('rfPoolLog', () => PG.fallenLog(90, 9, 8, { moss: 0.5, mossCol: '#4e7a28' }), -0.3), 690, 266);
  WA.foamPatch(G, 618, 168, 36, 14, 0, 7, 1.3); WA.ripples(G, 618, 190, 40, 4, 0.3);
  // the big rotting log with its mushrooms, the forager
  const LA = -0.36, LX = 200, LY = 266, LL = 236, LR = 20;
  sc.add(vx('rfLog', () => PG.fallenLog(LL, LR, 9, { moss: 0.4, mossCol: '#4a7a2a', rotten: true, stubs: 4, bark: '#5e4030' }), LA), LX, LY);
  const shrooms = [['redcap', -70, 1], ['redcap', -50, 0], ['shelfOyster', -20, 0.6], ['goldTrumpet', 5, 0.3], ['shelfOyster', 25, 0.8], ['redcap', 45, 0.4], ['goldTrumpet', 60, 0], ['shelfOyster', 70, 0.7], ['bluelamp', -60, -0.3], ['bluelamp', -38, -0.4]];
  shrooms.forEach(([k, s, up], i) => { const x = LX + Math.cos(LA) * s, y = LY + Math.sin(LA) * s + LR * 0.55; for (const [dx, dy] of [[0, 0], [7, 2], [-6, 3]]) sc.add(spr('gs' + k + ((i + dx) & 7), () => groundSprite(k, (i + dx) & 7)), x + dx, y + dy, Math.max(0, LR * (0.6 + up) - dy * 2), LY + 40 + i + dy); if (k === 'bluelamp') sc.light(x, y + 2, 6, 34, [0.35, 0.65, 1], 0.7); });
  const forager = { skin: 1, build: 1, beard: 'short', hair: { style: 'short', color: 1 }, top: { kind: 'jacket', color: 'green', color2: 'brown' }, bottom: { kind: 'cargo', color: 'brown' }, shoes: 'brown', hat: { kind: 'beanie', color: 'red' }, back: 'backpack', backColor: 'khaki' };
  sc.add(PG.crouch(person(forager, 6, 'idle', 0)), 268, 262);
  sc.add(spr('basket', () => groundSprite('forageBasket', 2)), 246, 274);
  // trees: moss-hung giants, firs in front, gold big-leaf maples, far trunks in the haze
  for (const [x, y, hw, H, sd] of [[150, 30, 9, 120, 31], [262, 12, 11, 110, 32], [340, 4, 8, 100, 33], [470, -10, 9, 90, 34]]) sc.add(spr('rfFar' + sd, () => bigTrunk(sd, hw, H, { B: BARK_FIR, R: FIR_DARK, sprays: 2, moss: 30, flare: 0.3, roots: 3 })), x, y);
  for (const [x, y, hw, H, sd] of [[70, 360, 26, 470, 41], [748, 380, 24, 480, 42]]) sc.add(spr('rfBig' + sd, () => mossHung(bigTrunk(sd, hw, H, { B: BARK_FIR, R: FIR_DARK, sprays: 10, low: 60, moss: 420, mossK: 0.2, flare: 0.45, front: 0.1 }), sd, 0.16)), x, y);
  const fir = (sd, h, r) => spr('rfFir' + sd, () => mossHung(F.conifer(sd, { h, r, R: FIR_DARK, B: BARK_FIR, tw: Math.round(h / 40), sp: 6.5, sw: 6.5, bare: 0.18, droop: 0.65, fringe: 3 }), sd, 0.12));
  sc.add(fir(51, 270, 62), 370, 214);
  for (const [x, y, sd] of [[120, 650, 52], [530, 660, 53], [700, 610, 54], [300, 700, 55]]) sc.add(fir(sd, 280, 70), x, y);
  const maple = (sd) => spr('rfMap' + sd, () => F.broadleaf(sd, { h: 170, cw: 70, ch: 58, leaf: 'maple', R: GOLD_MAPLE, cs: 5.2, dens: 0.9, tw: 5, lobes: 13, litter: [[220, 160, 40], [200, 120, 30]] }));
  sc.add(maple(61), 10, 230); sc.add(maple(62), 760, 600); sc.add(maple(63), 30, 640);
  // floor: huge ferns, salal, mossy rocks, a nurse stump, branches
  sc.add(spr('rfStump', () => F.nurseStump(71)), 205, 392);
  for (const [x, y, sz] of [[430, 260, 46], [436, 420, 40], [110, 455, 34], [300, 470, 30], [590, 410, 36]]) sc.add(spr('rfB' + sz, () => F.rock(sz + 1, sz, { moss: 0.9, color: '#76767a', tall: 0.75 }).render(0)), x, y);
  sc.add(spr('rfMM', () => F.mossMounds(72)), 520, 360);
  const trD = pathDist(path), rnd = mulberry32(27);
  const logD = (x, y) => Math.sqrt(segD2(x, y, LX - Math.cos(LA) * LL / 2, LY - Math.sin(LA) * LL / 2, LX + Math.cos(LA) * LL / 2, LY + Math.sin(LA) * LL / 2));
  for (let gy = -10; gy < 540; gy += 17) for (let gx = -10; gx < 790; gx += 20) {
    const x = gx + (rnd() - 0.5) * 14, y = gy + (rnd() - 0.5) * 12, r = rnd(), i = Math.floor(rnd() * 1000);
    if (rnd() < 0.34 || pool(x, y) || pool(x, y - 20) || (x > 440 && y < 180) || logD(x, y) < 24 || Math.hypot(x - 260, y - 268) < 26) continue;
    const s = r < 0.55 ? spr('rfFern' + (i % 8), () => F.fern(i % 8 + 11, 30 + (i % 8) * 3, F.FOL(['#2e6a34', '#3a7230', '#2a5e36', '#46782c'][i % 4], { warm: 70 }), { n: 17 })) : r < 0.8 ? fl('swordFern', i) : r < 0.86 ? fl('deadBracken', i, 2) : r < 0.9 ? fl('trillium', i) : r < 0.98 ? fl('fallenBranches', i, 2) : fl('foxglove', i, 2);
    const inClear = clearing(x, y) && vnoise(x, y, 14, 3) > 0.25;
    if (Math.min(trD(x, y), trD(x, y - s.ay * 0.7)) < 20 + s.w * 0.3 || (inClear && r < 0.9)) continue;
    sc.add(s, x, y);
  }
  for (let i = 0; i < 22; i++) { const x = 140 + hash(i, 1, 9) * 420, y = 200 + hash(i, 2, 9) * 240; if (pool(x, y) || logD(x, y) < 22 || trD(x, y) < 22) continue; sc.add(fl('leafLitter', i, 3), x, y); }
  motes(sc, Array.from({ length: 18 }, (_, i) => { const al = 40 + hash(i, 1, 6) * 300, ac = (hash(i, 2, 6) - 0.5) * 40; return [40 + 0.52 * al - 0.85 * ac + (i % 2) * 70, -30 + 0.85 * al + 0.52 * ac, 12 + hash(i, 3, 6) * 50, i]; }));
  const out = sc.finish();
  fog(out.G, [{ x: 70, y: 250, rx: 100, ry: 60, k: 0.65 }, { x: 260, y: 40, rx: 120, ry: 40, k: 0.5 }, { x: 420, y: 230, rx: 70, ry: 30, k: 0.4 }, { x: 330, y: 120, rx: 120, ry: 40, k: 0.45 }, { x: 700, y: 340, rx: 110, ry: 50, k: 0.5 }, { x: 200, y: 480, rx: 150, ry: 40, k: 0.5 }, { x: 520, y: 130, rx: 80, ry: 40, k: 0.4 }, { x: 600, y: 470, rx: 100, ry: 40, k: 0.45 }], { top: 90 });
  godRays(out.G, [{ x: -40, y: -40, w: 24, len: 420, k: 0.14 }, { x: 60, y: -60, w: 14, len: 360, k: 0.1, seed: 8 }]);
  return out;
}

// ---- N6 botanical garden ----------------------------------------------------------------------------------------
const PATH_G = ramp('#c6a486', 7, 3, { dark: 0.45, light: 0.42, shift: 0.16 });
function gardenGround(G, kindAt, seed = 61) {
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const k = kindAt(x, y); if (!k) continue;
    let c;
    if (k === 'path') { const h = hash(x, y, seed), cl = hash(x >> 1, y >> 1, seed + 1); c = pick(PATH_G, 0.5 + (vnoise(x, y, 11, seed) - 0.5) * 0.2 + (cl > 0.86 ? 0.18 : cl < 0.1 ? -0.16 : 0) + (h > 0.95 ? 0.15 : 0), x, y, 0.7); }
    else if (k === 'edge') c = pick(ramp('#a49c90', 6, 3), 0.55 + (x % 7 === 0 || y % 7 === 0 ? -0.25 : 0), x, y, 0.4);
    else c = groundPixelK(k, x, y, seed);
    G.put(x, y, c, nrm((hash(x, y, seed + 3) - 0.5) * 0.2, (hash(x, y, seed + 4) - 0.5) * 0.2, 1), 0, null, F_GROUND | F_WET);
  }
}
const GRASS_LAWN = F.FOL('#5a7e2c', { shift: 0.45, desat: 0.2 }), SOILG = ramp('#5a4030', 6, 3, { dark: 0.5, light: 0.4 });
function groundPixelK(k, x, y, seed) {
  const h = hash(x, y, seed), mid = vnoise(x, y, 9, seed + 5), big = vnoise(x, y, 40, seed + 6);
  if (k === 'soil') return pick(SOILG, 0.42 + (mid - 0.5) * 0.3 + (h > 0.9 ? 0.2 : h < 0.1 ? -0.2 : 0), x, y, 0.7);
  // lawn: blades in short vertical strokes, clover specks
  const blade = hash(x, Math.floor((y + hash(x, 0, seed) * 4) / 3), seed + 7);
  return pick(GRASS_LAWN, 0.34 + (big - 0.5) * 0.2 + (mid - 0.5) * 0.18 + (blade > 0.72 ? 0.16 : blade < 0.2 ? -0.14 : 0), x, y, 0.8);
}
const RED_MAPLE = F.FOL('#c83a22', { cool: 330, shiftD: 0.35, warm: 40, shift: 0.6 });
export function buildGardens(preset = 'golden') {
  const sc = new Scene(768, 512, preset, 606), G = sc.G, on = sc.lampsOn;
  // ---- ground plan: lawn, gravel paths, soil beds, the gravel and pond of the Japanese garden
  const paths = [
    [[[386, 520], [386, 300], [386, 0]], 64], [[[386, 300], [300, 230], [236, 168], [150, 156], [-20, 156]], 40], [[[386, 290], [-20, 290]], 34],
    [[[386, 268], [560, 262], [790, 262]], 36], [[[626, 262], [626, 440]], 30], [[[386, 160], [560, 160]], 26], [[[250, 300], [250, 440]], 22],
  ];
  const pd = paths.map(([pp, w]) => [pathDist(pp), w / 2]);
  const plaza = blobIn(386, 300, 72, 46, 2, 0.05), pond = blobIn(676, 86, 82, 46, 4, 0.22), zen = inRect(560, 150, 768, 244);
  const beds = [[90, 312, 60, 26], [180, 312, 60, 26], [90, 362, 60, 26], [180, 362, 60, 26], [90, 412, 60, 22], [180, 412, 60, 22]];
  const lav = inRect(462, 296, 606, 428), rose = (x, y) => x > 262 && x < 512 && y > 16 && y < 196 && !(Math.abs(x - 386) < 34) && !(Math.abs(y - 160) < 14);
  const kindAt = (x, y) => {
    if (y > 452) return 'grass';
    if (plaza(x, y) || pd.some(([d, hw]) => d(x, y) < hw)) return 'path';
    if (pond(x, y)) return null;
    if (zen(x, y)) return null;
    if (lav(x, y) || rose(x, y) || beds.some(([bx, by, bw, bd]) => x > bx - bw / 2 - 4 && x < bx + bw / 2 + 4 && y > by - bd - 4 && y < by + 4)) return 'soil';
    if (x < 250 && y > 300 && y < 445) return 'soil';
    return 'grass';
  };
  gardenGround(G, kindAt);
  PG.rakedGravel(G, zen, [[640, 196, 12], [700, 176, 9], [728, 220, 8]], { seed: 5 });
  WA.paintPond(G, pond, { seed: 66, bank: 'rocky', bankW: 6, depthR: 30, bbox: [580, 20, 768, 150], pal: WA.WATER.deep });
  for (const [x, y, a, k] of [[640, 80, 0.4, 0], [700, 100, 2.6, 1], [690, 64, 3.6, 2], [660, 110, -0.6, 3], [720, 80, 1.2, 0], [610, 96, 5.5, 1]]) PG.koi(G, x, y, a, k);
  // ---- outer wall, gate, the trees beyond it
  for (const [x, len] of [[166, 330], [608, 330]]) sc.add(vx('gwall' + len, () => PG.gardenWall(len, 26, 66)), x, 462);
  sc.add(vx('ggate', () => D.ironGate(80, 34)), 386, 460);
  for (const x of [336, 436]) { sc.add(vx('gpil' + on, () => D.gatePillar(on, 38)), x, 462); sc.light(x, 462, 46, 70, [1, 0.78, 0.5], 1.2 * on + 0.3); }
  for (const [x, y, sd] of [[60, 600, 1], [230, 590, 2], [560, 600, 3], [720, 590, 4]]) sc.add(spr('gfg' + sd, () => F.broadleaf(sd * 5, { h: 130, cw: 66, ch: 52, R: F.FOL('#5a8a28'), cs: 5, dens: 1, lobes: 12 })), x, y);
  for (const x of [312, 460]) sc.add(spr('gcyp', () => F.conifer(9, { h: 90, r: 13, form: 'column', R: F.FOL('#2e6a34'), sp: 3.5, sw: 4, bare: 0.04 })), x, 440);
  // ---- greenhouse corner: shed, potted plants, a gardener with a barrow
  sc.add(spr('gh', () => PG.greenhouse(150, 78, 40, 30, 0.7, 3)), 128, 112); sc.light(128, 90, 40, 120, [1, 0.8, 0.5], 0.8);
  sc.add(vx('gshed0', () => PG.gardenShed(40, 30, 28, '#3a6a8a')), 22, 98);
  for (const [x, y, k] of [[72, 140, 0], [98, 146, 1], [160, 146, 2], [186, 140, 3], [210, 146, 1]]) sc.add(fl(['tulipPlanter', 'daffodilPlanter', 'hydrangea', 'roseBush'][k], x), x, y);
  sc.add(spr('gpalm', () => F.datePalm(4)), 54, 146); sc.add(spr('gpalm2', () => F.datePalm(5)), 216, 150);
  sc.add(vx('gbarrow', () => U.wheelbarrow(), 0.3), 34, 180); sc.person(22, 176, 'farmer', 2, 'walk', 611);
  // ---- rose garden: hedged beds, the statue on its round bed, arches, benches
  const hedge = (w, d, h, fx) => spr('gh' + w + 'x' + d + 'x' + h + (fx ? 'f' : ''), () => PG.hedgeBox(w, d, h, { seed: w + d, R: F.FOL('#3a7226'), flowers: fx ? ramp('#d02a40', 6, 3, { light: 0.6 }) : null, fk: 0.16 }));
  for (const [x, y, w, d, f] of [[316, 30, 92, 12, 1], [456, 30, 92, 12, 1], [316, 152, 92, 12, 1], [456, 152, 92, 12, 1], [276, 92, 12, 112, 0], [496, 92, 12, 112, 0], [344, 96, 12, 44, 1], [428, 96, 12, 44, 1]]) sc.add(hedge(w, d, 18, f), x, y);
  for (let i = 0; i < 14; i++) { const x = 296 + (i % 7) * 30 + hash(i, 1, 3) * 8, y = i < 7 ? 58 : 136; if (Math.abs(x - 386) > 40) sc.add(fl('roseBush', i, 3), x, y); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2, x = 386 + Math.cos(a) * 32, y = 100 + Math.sin(a) * 18; sc.add(fl('roseBush', i + 1, 3), x, y); }
  sc.add(vx('gstatue', () => PG.gardenStatue()), 386, 100);
  for (const y of [20, 186]) sc.add(spr('garch' + y, () => F.roseArch(y)), 386, y);
  for (const [x, y] of [[312, 120], [460, 120]]) sc.add(vx('gbench', () => P.bench()), x, y);
  sc.person(460, 116, { skin: 1, build: 1, hair: { style: 'short', color: 0 }, top: { kind: 'shirt', color: 'navy' }, bottom: { kind: 'pants', color: 'khaki' }, shoes: 'brown' }, 0, 'idle', 612);
  sc.person(330, 80, 'farmer', 2, 'idle', 613); sc.person(444, 72, { skin: 3, fem: true, hair: { style: 'bun', color: 0 }, top: { kind: 'apron', color: 'green', color2: 'white' }, bottom: { kind: 'pants', color: 'brown' }, shoes: 'brown', hat: { kind: 'bucket', color: 'khaki' } }, 6, 'idle', 614);
  // ---- Japanese garden: koi pond, red bridge, lanterns, maples, raked gravel, a gardener with a rake
  sc.add(spr('gjcas', () => PW.cascade(18, 26, 7)), 742, 44);
  for (const [x, y, sz] of [[600, 60, 18], [610, 118, 14], [740, 120, 16], [756, 60, 20], [650, 34, 14], [718, 30, 18], [588, 92, 12]]) sc.add(spr('gjr' + sz, () => F.rock(sz, sz, { moss: 0.5, color: '#86847e', tall: 0.6 }).render(0)), x, y);
  sc.add(spr('gjlily', () => F.lilyPads(3, 7, 2)), 700, 96); sc.add(spr('gjlily2', () => F.lilyPads(4, 5, 1)), 628, 70);
  sc.add(vx('gjbridge', () => PG.redBridge(96, 22, 16)), 660, 128);
  for (const [x, y, sz] of [[640, 196, 22], [700, 176, 16], [728, 220, 14]]) sc.add(spr('gjz' + sz, () => F.rock(sz + 9, sz, { moss: 0.25, color: '#8a8880', tall: 1.0 }).render(0)), x, y + 4);
  for (const [x, y] of [[572, 120], [604, 226], [756, 150]]) sc.add(vx('glan' + on, () => PG.stoneLantern(on)), x, y);
  for (const [x, y, sd] of [[566, 42, 1], [756, 44, 2], [600, 250, 3]]) sc.add(spr('gjm' + sd, () => F.broadleaf(sd * 11, { h: 96, cw: 46, ch: 40, leaf: 'maple', R: RED_MAPLE, cs: 4.6, dens: 0.95, tw: 3.4, litter: [[200, 50, 40], [220, 90, 40]] })), x, y);
  for (const [x, y, sd] of [[548, 200, 1], [548, 100, 2]]) sc.add(spr('gjb' + sd, () => F.pineTufts(sd + 30, { h: 50, cw: 28, tw: 2.6, n: 7, tuft: 7, R: F.FOL('#3e6e2c'), flat: 0.6, flatTop: true, leaf: 'round', cs: 3 })), x, y);
  sc.add(spr('gjhedge', () => PG.hedgeBox(12, 220, 16, { seed: 9, R: F.FOL('#3a7226') })), 530, 236);
  sc.add(vx('gbench', () => P.bench()), 726, 156);
  sc.person(716, 214, { skin: 2, build: 1, hair: { style: 'short', color: 0 }, top: { kind: 'shirt', color: 'khaki' }, bottom: { kind: 'pants', color: 'brown' }, shoes: 'brown', hat: { kind: 'bucket', color: 'khaki' } }, 6, 'idle', 615);
  sc.add(vx('grake', () => PG.rake(), -0.6), 702, 216);
  // ---- orchard: apple trees in rows, ladders, crates, a picker
  for (const [x, y, sd] of [[30, 236, 1], [92, 236, 2], [156, 236, 3], [218, 236, 4], [60, 200, 5], [124, 200, 6], [190, 200, 7]]) sc.add(fl('appleTree', sd, 7), x, y);
  sc.add(vx('gladder', () => PG.orchardLadder(46), 0.5), 74, 238); sc.add(vx('gladder', () => PG.orchardLadder(46), 0.5), 140, 204);
  for (const [x, y] of [[112, 262], [180, 260], [126, 268]]) sc.add(vx('gcrate', () => PG.fruitCrate('#c8302a', 2)), x, y);
  sc.person(54, 262, 'farmer', 1, 'idle', 616);
  sc.add(hedge(240, 12, 16, 0), 124, 282);
  // ---- vegetable garden: raised beds with crops, shed, scarecrow, sunflowers, a gardener watering
  sc.add(vx('gshed', () => PG.gardenShed(52, 36, 32, '#3a6a8a')), 34, 330);
  const crops = [['cabbage2', 'cabbage1'], ['tomato2', 'tomato1'], ['cabbage1', 'cabbage2'], ['tomato2', 'tomato2'], ['pumpkin2', 'cabbage2'], ['corn2', 'corn1']];
  beds.forEach(([bx, by, bw, bd], i) => {
    sc.add(vx('gbed' + bw + bd, () => PG.raisedBed(bw, bd, 9, i)), bx, by - bd / 2);
    for (let k = 0; k < 4; k++) for (let r = 0; r < 2; r++) sc.add(fl(crops[i][r], k + r * 2 + i, 3), bx - bw / 2 + 9 + k * 14, by - bd + 9 + r * 9, 9, by + 1 + r);
  });
  sc.add(vx('gscare', () => U.scarecrow()), 252, 350); sc.add(vx('gbarrel', () => PW.barrel('#3a5a7a')), 74, 342);
  for (const x of [20, 46, 68]) sc.add(fl('sunflowers', x, 3), x, 438);
  sc.person(140, 338, 'farmer', 1, 'idle', 617);
  // ---- fountain plaza, lamp posts along the walks, the visitor
  sc.add(vx('gfount', () => D.fountain(26, 2)), 386, 300);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2, x = 386 + Math.cos(a) * 42, y = 304 + Math.sin(a) * 24; if (Math.abs(Math.sin(a)) > 0.5 || true) sc.add(fl('daisies', i, 3), x, y); }
  for (const [x, y] of [[340, 210], [434, 210], [340, 380], [434, 380], [240, 150], [540, 250]]) { sc.add(vx('glamp' + on, () => P.lampPost('cast', on)), x, y); sc.lampLight(x, y, 74, undefined, 0.8); }
  for (const [x, y] of [[352, 240], [420, 240], [352, 360], [420, 360]]) sc.add(fl('tulipPlanter', x, 2), x, y);
  sc.person(380, 254, { skin: 3, fem: true, hair: { style: 'long', color: 0 }, top: { kind: 'jacket', color: 'red', color2: 'black' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'black', carry: 'bag' }, 0, 'walk', 618);
  for (const [x, y, w, d] of [[332, 336, 12, 90], [440, 336, 12, 90], [330, 196, 12, 50], [442, 196, 12, 50]]) sc.add(hedge(w, d, 18, 0), x, y);
  // ---- lavender field and its harvester
  for (let y = 318; y < 430; y += 28) for (let x = 474; x < 600; x += 10) sc.add(fl('lavender', Math.round(x * 3 + y), 5), x + hash(x, y, 3) * 4, y + hash(y, x, 3) * 3);
  sc.add(PG.crouch(person({ skin: 1, fem: true, hair: { style: 'pony', color: 2 }, top: { kind: 'shirt', color: 'green' }, bottom: { kind: 'pants', color: 'brown' }, shoes: 'brown', hat: { kind: 'bucket', color: 'khaki' } }, 1, 'idle', 0)), 562, 372);
  sc.add(spr('basket', () => groundSprite('forageBasket', 2)), 578, 380);
  sc.add(hedge(12, 140, 16, 0), 452, 432); sc.add(hedge(12, 140, 16, 0), 612, 432);
  // ---- apiary: hives on the meadow, the beekeeper, flowers, bees
  for (const [x, y, c] of [[668, 344, '#e0b850'], [700, 340, '#d8a848'], [732, 346, '#e8c060'], [684, 400, '#e0b850'], [742, 404, '#d8a848']]) sc.add(vx('ghive' + c, () => PG.beehive(c, 3)), x, y);
  sc.person(716, 380, { skin: 2, build: 1, top: { kind: 'coat', color: 'white', color2: 'white' }, bottom: { kind: 'pants', color: 'white' }, shoes: 'white', hat: { kind: 'bucket', color: 'white' }, held: 'medkit' }, 7, 'idle', 619);
  for (let i = 0; i < 16; i++) { const x = 648 + hash(i, 1, 7) * 115, y = 300 + hash(i, 2, 7) * 140; if (Math.abs(x - 626) < 22) continue; sc.add(fl(['daisies', 'poppies', 'buttercups', 'clover'][i % 4], i, 3), x, y); }
  const bee = critterFrames('bee'); for (let i = 0; i < 12; i++) sc.add(bee[i % 4], 650 + hash(i, 3, 7) * 110, 320 + hash(i, 4, 7) * 100, 10 + hash(i, 5, 7) * 14);
  const bf = [critterFrames('monarch'), critterFrames('sulphur')]; for (let i = 0; i < 6; i++) sc.add(bf[i % 2][i % 4], 300 + hash(i, 6, 7) * 300, 200 + hash(i, 7, 7) * 220, 18 + hash(i, 8, 7) * 20);
  // ---- lawn edges: little shrubs and flowers along the hedges so no lawn stays bare
  const rnd = mulberry32(67);
  for (let i = 0; i < 160; i++) { const x = rnd() * 768, y = rnd() * 450, k = kindAt(Math.round(x), Math.round(y)); if (k !== 'grass' || pd.some(([d, hw]) => d(x, y) < hw + 10) || pond(x, y + 10) || zen(x, y + 10) || (x < 230 && y < 150) || (x > 540 && y < 250)) continue; sc.add(fl(['clover', 'daisies', 'buttercups', 'hydrangea', 'roseBush'][Math.floor(rnd() * 5)], i, 3), x, y); }
  return sc.finish();
}

// ---- N7 wetlands -------------------------------------------------------------------------------------------------
const MARSH = F.FOL('#869a38', { warm: 52, shift: 0.5, desat: 0.2 }), WSTILL = ramp('#2e4c68', 7, 3, { dark: 0.55, light: 0.55, shift: 0.12 });
// still, dark marsh water mirroring the evening sky: deeper away from the shore, olive shallows, short
// horizontal ripple streaks; a ring of wet mud on the land round it
function stillWater(G, isWater, seed = 9) {
  const { w, h } = G, m = new Uint8Array(w * h), n = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = isWater(x, y) ? 1 : 0; m[y * w + x] = 1 - o; n[y * w + x] = o; }
  const dIn = distSq(m, w, h), dOut = distSq(n, w, h), OL = ramp('#6a6440', 6, 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (m[i]) { const d = Math.sqrt(dOut[i]); if (d < 5 + vnoise(x, y, 6, seed) * 3) G.put(x, y, pick(MUD, 0.3 + d * 0.06 + (hash(x, y, seed) > 0.9 ? 0.15 : 0), x, y, 0.6), UP, 0, null, F_GROUND | F_WET); continue; }
    const d = Math.sqrt(dIn[i]), dd = clamp(d / 34), rip = vnoise(x * 0.25, y * 1.4, 3, seed), sky = vnoise(x, y, 60, seed + 1);
    let t = 0.62 - dd * 0.3 + (sky - 0.5) * 0.2 + (rip > 0.72 ? 0.22 : rip < 0.22 ? -0.1 : 0);
    let c = pick(WSTILL, clamp(t), x, y, 0.6);
    if (d < 6) { const k = (1 - d / 6) * 0.7; const o = pick(OL, 0.5 + (hash(x, y, seed) - 0.5) * 0.3, x, y, 0.5); c = c.map((v, q) => v * (1 - k) + o[q] * k); }
    if (d < 1.2) c = c.map((v) => v * 0.8 + 40);
    G.put(x, y, c, [0, rip > 0.72 ? -0.1 : 0.05, 1], 0, null, F_GROUND | F_WATER);
  }
}
const SANDB = ramp('#c8aa7a', 6, 3, { dark: 0.45, light: 0.4, shift: 0.16 });
function marshGround(G, isLand, seed = 71) {
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    if (!isLand(x, y)) continue;
    const h = hash(x, y, seed), mid = vnoise(x, y, 10, seed), big = vnoise(x, y, 36, seed + 1), blade = hash(x, Math.floor((y + hash(x, 0, seed) * 4) / 3), seed + 2);
    let c = pick(MARSH, 0.36 + (big - 0.5) * 0.3 + (mid - 0.5) * 0.2 + (blade > 0.74 ? 0.16 : blade < 0.18 ? -0.16 : 0), x, y, 0.8);
    if (vnoise(x, y, 18, seed + 3) > 0.72) c = pick(MUD, 0.42 + (mid - 0.5) * 0.3, x, y, 0.7);
    if (h > 0.985) c = [[236, 232, 220], [226, 160, 200], [240, 210, 90]][Math.floor(hash(y, x, seed) * 3)];
    G.put(x, y, c, nrm((hash(x, y, seed + 5) - 0.5) * 0.3, (hash(x, y, seed + 6) - 0.5) * 0.3, 1), 0, null, F_GROUND | F_WET);
  }
}
export function buildWetlands(preset = 'golden') {
  const sc = new Scene(768, 512, preset, 707), G = sc.G, on = sc.lampsOn;
  const lands = [
    { poly: [[436, -10], [780, -10], [780, 150], [700, 128], [620, 122], [540, 104], [480, 70]] },
    { blob: [150, 140, 72, 26, 1] }, { blob: [40, 96, 70, 46, 2] }, { blob: [392, 252, 92, 30, 3, -0.38] }, { blob: [560, 196, 46, 18, 4] },
    { poly: [[-10, 330], [70, 336], [160, 352], [250, 372], [300, 420], [292, 520], [-10, 520]] },
    { blob: [348, 360, 70, 44, 5] }, { poly: [[280, 470], [480, 476], [620, 488], [780, 470], [780, 520], [280, 520]] },
    { poly: [[700, 160], [780, 150], [780, 330], [740, 300], [720, 240]] }, { blob: [600, 300, 40, 16, 6] }, { blob: [250, 30, 60, 22, 7] },
  ].map((L) => { if (L.poly) { const P = L.poly; return (x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; }; } const [cx, cy, rx, ry, sd, rot = 0] = L.blob, ca = Math.cos(rot), sa = Math.sin(rot), f = blobIn(0, 0, rx, ry, sd, 0.3); return (x, y) => f((x - cx) * ca + (y - cy) * sa, -(x - cx) * sa + (y - cy) * ca); });
  const isLand = (x, y) => lands.some((f) => f(x, y)), isWater = (x, y) => !isLand(x, y);
  marshGround(G, isLand);
  stillWater(G, isWater, 72);
  // sandbars: pale wet sand on the land's water edge
  for (let y = 1; y < G.h - 1; y++) for (let x = 1; x < G.w - 1; x++) { if (!isLand(x, y) || G.flag[y * G.w + x] & F_WATER) continue; let n = 0; for (let k = 1; k <= 7; k++) if (isWater(x, y + k) || isWater(x - k, y) || isWater(x + k, y) || isWater(x, y - k)) { n = k; break; } if (n && vnoise(x, y, 20, 5) > 0.45) G.put(x, y, pick(SANDB, 0.6 - n * 0.04 + (hash(x, y, 3) > 0.9 ? 0.15 : 0), x, y, 0.6), UP, 0, null, F_GROUND | F_WET); }
  glitter(G, 90, 50, 150, 4, 1); glitter(G, 290, 240, 100, 5, 0.6); glitter(G, 30, 230, 80, 6, 0.8);
  // lily pond: pads and flowers
  for (const [x, y, n, l, sd] of [[470, 380, 9, 3, 1], [540, 420, 8, 2, 2], [620, 390, 9, 3, 3], [520, 350, 6, 1, 4], [680, 430, 8, 2, 5], [600, 450, 7, 2, 6], [450, 440, 6, 2, 7], [700, 380, 6, 1, 8]]) sc.add(spr('wlily' + sd, () => F.lilyPads(sd, n, l)), x, y);
  // boardwalk across the top right with hikers and the info sign
  const bwA = 0.26;
  sc.add(vx('wbw', () => PG.boardwalk(360, 30, 9, 'ns'), bwA), 620, 52);
  walker(sc, 640, 52, HIKERS[3], 1, 1, 9); walker(sc, 700, 70, HIKERS[2], 1, 3, 9);
  sc.add(vx('wsign', () => PG.infoSign()), 724, 108);
  // pier with its lantern and the angler, the canoe on the bank
  const pier = PG.fishingPier(150, 30, 10, on);
  sc.add(vx('wpier', () => pier), 70, 310); sc.light(70 + pier.lamp.x, 310 + pier.lamp.y, pier.lamp.z, 70, [1, 0.78, 0.45], 0.6 + on * 0.8);
  sc.add(person({ skin: 1, build: 2, beard: 'full', hair: { style: 'short', color: 4 }, top: { kind: 'vest', color: 'green', color2: 'khaki' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', hat: { kind: 'bucket', color: 'khaki' }, held: 'fishingRod' }, 2, 'idle', 0), 120, 300, 10, 312);
  WA.ripples(G, 196, 288, 14, 3, 0.2);
  sc.add(spr('wcanoe', () => WA.canoe(0.18, '#b8442e')), 96, 420);
  // the beaver dam with its lodge, a beaver, the spill
  sc.add(vx('wdam', () => PG.beaverDam(210, 26, 18, 0.62, 3), -0.12), 640, 176);
  sc.add(vx('wlodge', () => PG.beaverLodge(30, 26, 4)), 604, 156);
  sc.add(vx('wbeaver', () => PG.beaver(), 2.6), 600, 140, 22, 170);
  sc.add(spr('wspill', () => PW.cascade(16, 14, 3)), 670, 200); sc.add(spr('wspill2', () => PW.cascade(10, 12, 4)), 700, 196);
  WA.foamPatch(G, 676, 206, 26, 7, 0, 3, 1.2);
  // logs and snags in the water
  sc.add(vx('wlog1', () => PG.fallenLog(100, 7, 11, { moss: 0.3, bark: '#7a6a58' }), 0.5), 660, 330);
  sc.add(vx('wlog2', () => PG.fallenLog(90, 6, 12, { moss: 0.2, bark: '#7a6a58' }), -0.3), 650, 460);
  // birds: heron in the shallows, ducks, the swan
  sc.add(critterFrames('heron')[0], 488, 238); WA.ripples(G, 488, 240, 10, 2, 0.5);
  sc.add(vx('wswan', () => PG.swan(), 0.2), 140, 84); WA.ripples(G, 140, 86, 12, 2, 0.4);
  for (const [x, y, dr, a] of [[214, 108, true, 0.3], [228, 118, false, 0.3], [242, 112, false, 0.2], [580, 410, true, 3.4], [600, 420, false, 3.3]]) { sc.add(vx('wduck' + dr + a, () => K.duck(dr), a), x, y); WA.ripples(G, x, y + 1, 7, 2, 0.5); }
  const df = critterFrames('dragonfly'); for (const [x, y, h, f] of [[540, 330, 20, 0], [560, 380, 16, 2], [660, 420, 22, 1], [500, 410, 18, 3], [610, 350, 14, 2]]) { sc.add(df[f], x, y, h); }
  // willows trailing into the water
  const willow = (sd, h, cw) => spr('wwil' + sd, () => F.broadleaf(sd, { h, cw, ch: cw * 0.7, R: F.FOL('#8aa22a', { warm: 58 }), cs: 3.4, tw: 6, flare: 0.9, leaf: 'fine', weep: 1.5, lobes: 10, k: 23 }));
  sc.add(willow(81, 140, 64), 384, 128); sc.add(willow(82, 130, 56), 36, 300); sc.add(willow(83, 110, 46), 560, 24); sc.add(willow(84, 120, 50), 760, 470);
  // reeds, cattails and rushes along every shore and on the islands; marsh grass and flowers on the land
  const keep = [[488, 236, 30], [140, 84, 34], [228, 112, 30], [96, 420, 40], [724, 108, 24], [590, 415, 26], [604, 156, 40], [670, 200, 30]];
  const free = (x, y) => !keep.some(([kx, ky, r]) => Math.hypot(x - kx, (y - ky) * 1.3) < r) && !(x > 430 && y < 150 && Math.abs((y - 52) - (x - 620) * Math.tan(bwA)) < 30) && !(x < 160 && Math.abs(y - 312) < 22);
  const rnd = mulberry32(77);
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * 780 - 6, y = rnd() * 530 - 10; if (!isLand(x, y) || !free(x, y)) continue;
    let n = 99; for (let k = 2; k <= 26; k += 4) if (isWater(x, y + k) || isWater(x - k, y) || isWater(x + k, y) || isWater(x, y - k)) { n = k; break; }
    const r = rnd(), j = Math.floor(rnd() * 100);
    if (n < 12) { if (r < 0.42) sc.add(fl(['cattails', 'reeds', 'rushes', 'rushes', 'tallGrass'][j % 5], j, 4), x, y + 3); }
    else if (n < 26) { if (r < 0.1) sc.add(fl(r < 0.05 ? 'rushes' : 'tallGrass', j, 4), x, y); }
    else if (r < 0.12) sc.add(fl(['tallGrass', 'daisies', 'clover', 'tallGrass', 'buttercups'][j % 5], j, 3), x, y);
  }
  // tufts of marsh grass painted into the land so no ground stays bare
  for (let i = 0; i < 2600; i++) { const x = Math.floor(rnd() * 768), y = Math.floor(rnd() * 512); if (!isLand(x, y) || (G.flag[y * G.w + x] & F_WATER)) continue; for (let k = 0; k < 4; k++) { const bx = x + k - 1, h = 2 + Math.floor(hash(bx, y, 3) * 4); for (let q = 0; q < h; q++) if (G.inside(bx, y - q)) G.put(bx, y - q, pick(MARSH, 0.35 + q / h * 0.45 + (k & 1) * 0.1, bx, y - q, 0.3), [0, 0.4, 0.9], q, null, F_GROUND | F_LEAF); } }
  // a few cattail stands out in the shallows
  for (const [x, y] of [[180, 136], [372, 232], [460, 282], [300, 352], [520, 212], [748, 260], [12, 164], [270, 36]]) sc.add(fl('cattails', x, 4), x, y);
  return sc.finish();
}

export const SCENES = { redwood: buildRedwood, rainforest: buildRainforest, gardens: buildGardens, wetlands: buildWetlands };
export const TARGETS = { redwood: 'N1-A_redwood.png', rainforest: 'N2-A_rainforest.png', gardens: 'N6_gardens.png', wetlands: 'N7_wetlands.png' };
export const PRESET = {};
