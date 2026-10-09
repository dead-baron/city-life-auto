// Art v2: the back alleys' dressing (concept sheets AL1-A..H; where it goes: shared/alleys.js).
//   model(k, v) -> Vox    what stands against an alley wall (heading 0: its back, model y = 0, against a wall to
//                         the north): two wheelie bins, cardboard boxes, a mattress leaning on the wall, a shopping
//                         cart, flower pots, a bike against the wall, a sitting cat, a rat
//   dim(k) -> [w, d, h]   their sizes (the chunk extents, without building the model)
//   decal(k, v) -> GBuf   flat on the asphalt (anchor: the middle): a puddle (open water: it mirrors the lights and
//                         the walls in any weather), an oil stain, leaves, litter, a crack, weeds along the wall foot,
//                         a drain grate, a manhole cover
//   dressWall(G, spec)    on a building's south face that fronts an alley (spec.alley, set by statics.js): a
//                         drainpipe from the gutter to the ground, a vent box, AC boxes with a drip stain under
//                         them, a meter box with its conduit
// Drawn for the art pixel (2 world px): lines and features at least 2 px wide. Pure and worker-safe.
import { Vox } from './voxel.js';
import { GBuf, hash, F_GROUND, F_WATER, F_WET, F_NOCAST } from './gbuf.js';
import { MAT, ramp } from './palette.js';
import { buildingH } from './buildings.js';

const R = (c, n = 6, k = 3) => ramp(c, n, k);

// ---- what stands ---------------------------------------------------------------------------------------------
export function dim(k) {
  switch (k) {
    case 'bins': return [28, 12, 20]; case 'boxes': return [26, 16, 22]; case 'mattress': return [32, 10, 30]; case 'cart': return [22, 14, 18];
    case 'pots': return [30, 10, 20]; case 'bike': return [34, 6, 20]; case 'cat': return [12, 8, 13]; case 'rat': return [10, 4, 4];
    default: return [16, 16, 16];
  }
}
export function model(k, v = 0) {
  switch (k) {
    case 'bins': return bins(v);
    case 'boxes': return boxes(v);
    case 'mattress': return mattress(v);
    case 'cart': return cart(v);
    case 'pots': return pots(v);
    case 'bike': return bike(v);
    case 'cat': return cat(v);
    case 'rat': return rat();
    default: return new Vox(1, 1, 1);
  }
}
const BIN_C = ['#3a6a3a', '#2f4a7a', '#4a4e56', '#2a2c30', '#6a4a2a', '#3a6a3a'];
function bins(v) {
  const m = new Vox(28, 12, 20);
  for (let i = 0; i < 2; i++) {
    const c = BIN_C[(v + i * 2) % BIN_C.length], b = m.mat({ ramp: R(c), k: 3 }), lid = m.mat({ ramp: R(c), k: 4 }), wh = m.mat({ ramp: MAT.tyre, k: 1 }), ox = i * 15;
    m.fill((x, y, z) => (x > ox + 1 + z * 0.04 && x < ox + 12 - z * 0.04 && y > 1 && y < 11 && z < 17 ? b : -1), ox, 0, 0, ox + 13, 12, 17);
    const open = (v + i) % 3 === 0;
    if (open) m.box(ox, 0, 17, ox + 13, 3, 20, lid); else m.box(ox, 0, 17, ox + 13, 12, 19, lid);
    m.cyl('y', ox + 3, 0, 2.5, 2.5, 9, 12, wh); m.cyl('y', ox + 10, 0, 2.5, 2.5, 9, 12, wh);
    if (open) { const bag = m.mat({ ramp: R('#2a2a30'), k: 3 }); m.ell(ox + 6.5, 6, 18, 4, 3.5, 2.5, bag); }
  }
  return m;
}
function boxes(v) {
  const m = new Vox(26, 16, 22), r = (i) => hash(v, i, 31);
  const card = [m.mat({ ramp: R('#b08a5a'), k: 3 }), m.mat({ ramp: R('#9a7448'), k: 3 }), m.mat({ ramp: R('#c49a62'), k: 3 })];
  const tape = m.mat({ ramp: R('#d8c8a0'), k: 4 });
  const put = (x0, y0, z0, w, d, h, i) => { m.box(x0, y0, z0, x0 + w, y0 + d, z0 + h, card[i % 3]); m.box(x0 + Math.floor(w / 2) - 1, y0, z0 + h - 1, x0 + Math.floor(w / 2) + 1, y0 + d, z0 + h, tape); };
  put(1, 2, 0, 12, 12, 10, v); put(13, 1, 0, 12, 13, 8, v + 1);
  if (r(1) < 0.7) put(3 + Math.floor(r(2) * 4), 3, 10, 9, 9, 8, v + 2);
  if (r(3) < 0.5) put(15, 3, 8, 8, 8, 6, v + 1);
  // a flattened one leaning on the pile
  if (r(4) < 0.5) m.box(0, 13, 0, 14, 15, 4, card[(v + 1) % 3]);
  return m;
}
function mattress(v) {
  const m = new Vox(32, 10, 30), col = ['#e4dccc', '#d8d0c0', '#c8c8d0', '#d8c8b0'][v % 4];
  const f = m.mat({ ramp: R(col), k: 4, shade: (x, y, z) => ((Math.round(x) % 6 === 0 || Math.round(z) % 6 === 0) ? -0.5 : 0) + (hash(Math.round(x / 3), Math.round(z / 3), 7 + v) > 0.86 ? -1.2 : 0) });
  const edge = m.mat({ ramp: R('#8a8478'), k: 3 });
  // leaning back against the wall: its foot out from the wall, its top touching it
  for (let z = 0; z < 29; z++) { const y0 = Math.round(6 - z * 0.2); m.box(1, y0, z, 31, y0 + 4, z + 1, z === 0 || z === 28 ? edge : f); }
  return m;
}
function cart(v) {
  const m = new Vox(22, 14, 18), wire = m.mat({ ramp: MAT.chrome, k: 2, flag: F_NOCAST }), red = m.mat({ ramp: R('#b8302a'), k: 3 }), wh = m.mat({ ramp: MAT.tyre, k: 1 });
  // the basket: a wire mesh box (every other voxel on its sides), the handle in red plastic
  m.fill((x, y, z) => { const side = x === 2 || x === 19 || y === 1 || y === 12 || z === 7; return side && x >= 2 && x <= 19 && y >= 1 && y <= 12 && z >= 7 && z <= 16 && ((x + y + z) % 2 === 0 || z === 16 || z === 7) ? wire : -1; });
  m.box(1, 1, 16, 21, 13, 17, wire);
  m.box(20, 2, 16, 22, 12, 18, red);
  for (const [x, y] of [[4, 2], [17, 2], [4, 11], [17, 11]]) { m.box(x, y, 2, x + 1, y + 1, 7, wire); m.box(x - 1, y - 1, 0, x + 2, y + 2, 2, wh); }
  if (v % 2) { const bag = m.mat({ ramp: R('#2a2a30'), k: 3 }); m.ell(10, 7, 14, 6, 4, 4, bag); }
  return m;
}
function pots(v) {
  const m = new Vox(30, 10, 20), pot = m.mat({ ramp: MAT.terracotta, k: 3 }), leaf = m.mat({ ramp: R('#4a8a34'), k: 3 }), leafD = m.mat({ ramp: R('#2f6a2a'), k: 3 });
  const FL = ['#e85a7a', '#f0c040', '#e8e4dc', '#c84aa8', '#f08a30', '#e85a7a'];
  const fl = m.mat({ ramp: R(FL[v % FL.length], 5, 3), k: 4 });
  for (let i = 0; i < 3; i++) {
    const cx = 5 + i * 10, r = 3.5 + (i === 1 ? 1 : 0), h = 6 + (i === 1 ? 2 : 0);
    m.cyl('z', cx, 5, 0, r, 0, h, pot);
    m.ell(cx, 5, h + 3, r + 1.5, 3.5, 4 + (i === 1 ? 2 : 0), (i + v) % 2 ? leaf : leafD);
    for (let k = 0; k < 4; k++) { const fx = cx + (hash(i, k, v + 3) - 0.5) * 6, fz = h + 3 + hash(k, i, v + 5) * 4; m.box(fx, 5, fz, fx + 2, 7, fz + 2, fl); }
  }
  return m;
}
function bike(v) {
  const m = new Vox(34, 6, 20), col = ['#2f6ab0', '#c8343a', '#2f8a5c', '#e8c040', '#3a3a40', '#d8d4cc'][v % 6];
  const fr = m.mat({ ramp: R(col), k: 3, flag: F_NOCAST }), tyre = m.mat({ ramp: MAT.tyre, k: 1, flag: F_NOCAST }), mt = m.mat({ ramp: MAT.metal, k: 3, flag: F_NOCAST });
  for (const cx of [7, 27]) m.fill((x, y, z) => { const d = Math.hypot(x - cx, z - 7); return y === 3 && d <= 6.5 && d >= 5 ? tyre : y === 3 && d < 1.2 ? mt : -1; }, cx - 7, 2, 0, cx + 7, 4, 14);
  const line = (x0, z0, x1, z1, mm) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0)); for (let i = 0; i <= n; i++) { const t = i / n; m.box(x0 + (x1 - x0) * t, 3, z0 + (z1 - z0) * t, x0 + (x1 - x0) * t + 1.5, 4, z0 + (z1 - z0) * t + 1.5, mm); } };
  line(7, 7, 15, 7, fr); line(15, 7, 12, 15, fr); line(12, 15, 24, 15, fr); line(24, 15, 15, 7, fr); line(24, 15, 27, 7, fr); line(7, 7, 12, 15, fr);
  m.box(10, 2, 16, 15, 5, 17, mt); line(24, 15, 25, 19, mt); m.box(22, 1, 18, 28, 5, 19, mt);
  return m;
}
const CAT_C = [['#2a2a30', '#e8e0c8'], ['#d88a3a', '#f0dcb8'], ['#8a8a92', '#e0dcd4'], ['#e8e0d0', '#f4ecd8'], ['#5a4030', '#c8b090'], ['#2a2a30', '#2a2a30']];
function cat(v) {
  const [a, b] = CAT_C[v % CAT_C.length], m = new Vox(12, 8, 13), fur = m.mat({ ramp: R(a), k: 3 }), pale = m.mat({ ramp: R(b), k: 3 }), eye = m.mat({ ramp: R('#d8e040', 5, 3), k: 4, emi: [220, 230, 90, 140] });
  // sitting, facing the camera: haunches, chest, head with two ears, the tail curled round the feet
  m.ell(6, 3.5, 3.5, 4, 3.2, 3.6, fur);
  m.ell(6, 5, 6, 2.6, 2, 3.2, pale);
  m.ell(6, 4.5, 9.5, 3, 2.6, 2.6, fur);
  m.box(3, 4, 11, 5, 6, 13, fur); m.box(7, 4, 11, 9, 6, 13, fur);
  m.box(4, 6, 9, 5, 7, 10, eye); m.box(7, 6, 9, 8, 7, 10, eye);
  for (let x = 2; x < 11; x++) m.box(x, 6 + (x > 8 ? 0 : 1), 0, x + 1, 8, 1, fur);
  return m;
}
function rat() {
  const m = new Vox(10, 4, 4), fur = m.mat({ ramp: R('#5a5450'), k: 3 }), tail = m.mat({ ramp: R('#b08a80'), k: 3 });
  m.ell(4, 2, 1.8, 3, 1.6, 1.6, fur); m.ell(1.5, 2, 1.6, 1.4, 1.2, 1.2, fur);
  m.box(7, 2, 0, 10, 3, 1, tail);
  return m;
}

// ---- flat on the asphalt ---------------------------------------------------------------------------------------
const DECAL_SIZE = { puddle: [64, 30], oil: [36, 20], leaves: [40, 24], litter: [36, 22], crack: [52, 26], weeds: [34, 12], drain: [30, 18], manhole: [34, 24] };
export function decalSize(k) { return DECAL_SIZE[k] || [32, 20]; }
export function decal(k, v = 0) {
  const [w, h] = decalSize(k), G = new GBuf(w, h); G.ax = w >> 1; G.ay = h >> 1;
  const up = [0, 0, 1], cx = w / 2, cy = h / 2;
  // a blob: the edge of a squashed circle wobbled by v (2 px steps: whole art pixels)
  const blob = (x, y, rx, ry, s) => { const dx = (x - cx) / rx, dy = (y - cy) / ry, a = Math.atan2(dy, dx); return Math.hypot(dx, dy) < 0.82 + 0.18 * Math.sin(a * 3 + s) * Math.cos(a * 2 - s * 0.7); };
  if (k === 'puddle') {
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      if (!blob(x + 1, y + 1, w / 2 - 2, h / 2 - 2, v * 1.7)) continue;
      const rim = !blob(x - 1, y + 1, w / 2 - 2, h / 2 - 2, v * 1.7) || !blob(x + 3, y + 1, w / 2 - 2, h / 2 - 2, v * 1.7) || !blob(x + 1, y - 1, w / 2 - 2, h / 2 - 2, v * 1.7) || !blob(x + 1, y + 3, w / 2 - 2, h / 2 - 2, v * 1.7);
      const c = rim ? [58, 60, 70] : [40 + (y > h / 2 ? 0 : 6), 48, 66 + (hash(x >> 2, y >> 2, v) > 0.8 ? 10 : 0)];
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) G.put(x + i, y + j, c, up, 0, null, rim ? F_GROUND | F_WET : F_GROUND | F_WATER | F_WET);
    }
  } else if (k === 'oil') {
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      if (!blob(x + 1, y + 1, w / 2 - 2, h / 2 - 2, v * 2.3)) continue;
      const t = hash(x >> 1, y >> 1, v + 9), c = t > 0.9 ? [70, 58, 96] : t > 0.8 ? [52, 74, 70] : [30, 30, 36];
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) G.put(x + i, y + j, c, up, 0, null, F_GROUND | F_WET);
    }
  } else if (k === 'leaves' || k === 'litter') {
    const n = k === 'leaves' ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const x = 2 + Math.floor(hash(i, 1, v + 40) * (w - 6) / 2) * 2, y = 2 + Math.floor(hash(i, 2, v + 40) * (h - 6) / 2) * 2, t = hash(i, 3, v + 40);
      let c, bw = 2, bh = 2;
      if (k === 'leaves') c = t < 0.35 ? [196, 120, 40] : t < 0.6 ? [168, 84, 40] : t < 0.85 ? [208, 168, 60] : [110, 90, 50];
      else { c = t < 0.45 ? [222, 220, 210] : t < 0.7 ? [180, 176, 166] : t < 0.85 ? [200, 60, 50] : [70, 110, 160]; bw = t < 0.45 ? 4 : 2; bh = t < 0.7 ? 2 : 4; }
      for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) G.put(x + xx, y + yy, c, up, 1, null, F_GROUND);
      if (k === 'leaves' && t < 0.6) G.put(x + 2, y, c.map((q) => q * 0.8), up, 1, null, F_GROUND);
    }
  } else if (k === 'crack') {
    let x = 2, y = Math.round(h / 2) & ~1;
    const c = [34, 34, 40];
    while (x < w - 2) {
      for (let j = 0; j < 2; j++) G.put(x, y + j, c, up, 0, null, F_GROUND), G.put(x + 1, y + j, c, up, 0, null, F_GROUND);
      x += 2; const t = hash(x, v, 77);
      if (t < 0.3 && y > 4) y -= 2; else if (t > 0.7 && y < h - 6) y += 2;
      if (t > 0.92) { let by = y, bx = x; for (let q = 0; q < 4; q++) { by += hash(q, x, v) < 0.5 ? 2 : -2; bx += 2; if (by > 1 && by < h - 3) { G.put(bx, by, c, up, 0, null, F_GROUND); G.put(bx + 1, by, c, up, 0, null, F_GROUND); } } }
    }
  } else if (k === 'weeds') {
    const G1 = R('#5a8a34'), G2 = R('#3e6a2a');
    for (let x = 1; x < w - 1; x += 2) {
      if (hash(x >> 1, v, 13) < 0.35) continue;
      const tall = 2 + Math.floor(hash(x, v, 17) * 4) * 2, base = h - 2 - (hash(x, v, 19) < 0.5 ? 2 : 0);
      for (let z = 0; z < tall; z++) for (let i = 0; i < 2; i++) G.put(x + i, base - z, (z + x) % 4 < 2 ? G1[3 + (z > tall / 2 ? 1 : 0)] : G2[3], [0, 0.6, 0.8], z, null, 0);
      if (hash(x, v, 23) > 0.85) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) G.put(x + i, base - tall - j, [236, 214, 80], up, tall + 1, null, 0);   // a dandelion
    }
  } else if (k === 'drain') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const e = x < 2 || y < 2 || x >= w - 2 || y >= h - 2, slot = !e && (x >> 1) % 2 === 1;
      G.put(x, y, e ? MAT.metal[2] : slot ? [18, 18, 22] : MAT.metalDark[3], up, 0, null, F_GROUND | F_WET);
    }
  } else if (k === 'manhole') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / (w / 2), dy = (y + 0.5 - cy) / (h / 2), d = Math.hypot(dx, dy);
      if (d > 1) continue;
      const ring = d > 0.84, pat = ((x >> 1) + (y >> 1)) % 3 === 0;
      G.put(x, y, ring ? MAT.metal[1] : pat ? MAT.metalDark[4] : MAT.metalDark[2], up, 0, null, F_GROUND | F_WET);
    }
  }
  return G;
}

// ---- the back wall -------------------------------------------------------------------------------------------
// spec.alley: { pipe, vent, ac: [...], meter, rust } (px from the section's west edge); painted onto the south face
// of makeBuilding(spec)'s sprite (G.ax, G.ay: the footprint's south-west corner on the ground; a face pixel at height
// v is at row G.ay - v)
export function dressWall(G, spec) {
  const A = spec.alley, w = spec.w, H = buildingH(spec);
  if (!A) return G;
  const S = [0, 1, 0], TOP = [0, 0.6, 0.8];
  const px = (x, v, c, n = S, e = null) => { if (x < 0 || x >= w || v < 0 || v >= H - 4) return; G.put(G.ax + x, G.ay - v, c, n, v, e, 0); };
  const M = A.rust ? R('#7a5a44') : MAT.metal;
  // the drainpipe: from under the cornice to the ground, a bracket every 30 px, a shoe turned out at the foot
  if (A.pipe !== null && A.pipe !== undefined) {
    const x0 = Math.round(A.pipe) & ~1;
    for (let v = 0; v < H - 6; v++) for (let i = 0; i < 4; i++) px(x0 + i, v, M[i === 0 ? 1 : i === 3 ? 2 : 3 + (v % 30 < 2 ? 1 : 0)]);
    for (let v = 6; v < H - 8; v += 30) for (let i = -2; i < 6; i++) px(x0 + i, v, M[i < 0 || i > 3 ? 1 : 4]);
    for (let i = 0; i < 8; i++) for (let v = 0; v < 3; v++) px(x0 + i - 1, v, M[v === 2 ? 4 : 2], TOP);
  }
  // AC boxes hung on the wall, with a dark drip stain down the wall under them
  for (const ax of A.ac || []) {
    const x0 = Math.round(ax - 9) & ~1, v0 = 58 + ((x0 >> 1) % 3) * 6;
    for (let v = v0 - 26; v < v0; v++) for (let i = 6; i < 10; i++) if (hash(i, v, x0) < 0.5) { const j = ((G.ay - v) * G.w + G.ax + x0 + i) * 4; if (G.inside(G.ax + x0 + i, G.ay - v)) { G.col[j] *= 0.82; G.col[j + 1] *= 0.84; G.col[j + 2] *= 0.88; } }
    for (let v = v0; v < v0 + 14; v++) for (let i = 0; i < 18; i++) {
      const edge = i === 0 || i === 17 || v === v0, top = v === v0 + 13, grille = !edge && !top && i > 2 && i < 15 && (v - v0) % 3 === 1;
      px(x0 + i, v, top ? MAT.metal[5] : edge ? MAT.metal[1] : grille ? MAT.metalDark[1] : MAT.metal[3], top ? TOP : S);
    }
  }
  // a vent box low on the wall (the steam is the statics' own item, rising from it)
  if (A.vent !== null && A.vent !== undefined) {
    const x0 = Math.round(A.vent - 8) & ~1;
    for (let v = 8; v < 22; v++) for (let i = 0; i < 16; i++) {
      const edge = i === 0 || i === 15 || v === 8 || v === 21, slat = !edge && (v % 3 === 0);
      px(x0 + i, v, edge ? MAT.metal[2] : slat ? MAT.metalDark[1] : MAT.metal[3]);
    }
  }
  // the bare bulb over the back door: a little hood, the bulb under it in its cage, and a warm halo on the wall round
  // it (emissive: it shows after dark)
  if (A.bulb !== null && A.bulb !== undefined) {
    const bx = Math.round(A.bulb) & ~1, v0 = 52;
    for (let dy = -18; dy <= 18; dy++) for (let dx = -22; dx <= 22; dx++) {
      const d = Math.hypot(dx / 22, dy / 18), X = G.ax + bx + dx, Y = G.ay - v0 + dy;
      if (d >= 1 || !G.inside(X, Y) || !G.alpha(X, Y)) continue;
      const k = (1 - d) * (1 - d);
      G.glow(X, Y, [255, 168, 80, Math.round(30 + 150 * k)]);
    }
    for (let i = -5; i < 7; i++) for (let v = v0 + 4; v < v0 + 7; v++) px(bx + i, v, MAT.metalDark[v === v0 + 6 ? 3 : 1], v === v0 + 6 ? TOP : S);   // the hood
    for (let i = -1; i < 3; i++) for (let v = v0 - 2; v < v0 + 4; v++) px(bx + i, v, (i + v) % 3 === 0 ? [180, 150, 100] : [255, 236, 170], S, [255, 214, 140, 255]);   // the bulb in its cage
    for (let v = v0 + 7; v < v0 + 12; v++) for (let i = 0; i < 2; i++) px(bx + i, v, MAT.metalDark[2]);   // its conduit
  }
  // a meter box with its conduit running up the wall
  if (A.meter !== null && A.meter !== undefined) {
    const x0 = Math.round(A.meter - 6) & ~1;
    for (let v = 28; v < 44; v++) for (let i = 0; i < 12; i++) px(x0 + i, v, i === 0 || i === 11 || v === 28 ? MAT.metalDark[2] : v === 43 ? MAT.metal[4] : MAT.metal[2 + ((v >> 2) % 2)]);
    for (let v = 44; v < Math.min(H - 10, 90); v++) for (let i = 4; i < 6; i++) px(x0 + i, v, MAT.metalDark[3]);
    for (let i = 3; i < 9; i++) for (let v = 33; v < 37; v++) px(x0 + i, v, [200, 204, 196], S, [180, 220, 180, 30]);
  }
  return G;
}
