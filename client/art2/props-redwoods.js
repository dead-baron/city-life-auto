// Art v2: the redwoods' kit (the nature showcase, 2026-10-31: concepts NR1-E, N2-A, N1-A - shared/world3-redwoods.js
// says where each piece stands). Voxel models in the art v2 style, drawn by client/art2/game/statics.js (props 'rk'):
//   basaltCols(len, depth, h, seed, o)  a run of columnar basalt: hexagonal columns, each its own height, stepping
//                                       down to the front in tiers, moss on their tops and dripping down the faces,
//                                       ferns in it, dark and wet by the falls (o.wet -1 the west end, 1 the east),
//                                       mossy boulders at the foot; o.fall -1/1: the heights falling away to that end
//   columnFall(o)                       a curtain fall off a lip of the same columns: the creek's water on top, a
//                                       mossy log fallen across it, the sheet pouring off the lip, the churn below
//                                       (o.w the water's width, o.drop, o.side the rock either side, o.log)
//   fungi(kind, seed)                   'agaric' red caps with white flecks, 'shelf' bracket fungi, 'glow' small
//                                       blue caps that glow after dark
//   puddle(w, d, seed)                  a puddle on the forest floor: still water in a muddy rim
//   mist(w, d, seed) / ray(w, h, seed)  a low bank of mist; a shaft of sunlight down through the canopy (soft sprites)
// Model y runs north -> south (the camera looks from the south); 1 voxel = 1 world px.
import { GBuf, F_WATER, F_NOCAST, hash, vnoise } from './gbuf.js';
import { ramp } from './palette.js';
import { Vox } from './voxel.js';
import { WATER, waterfall } from './water.js';

const R = (h, n = 6, k, o) => ramp(h, n, k ?? Math.floor((n - 1) / 2), o);
const BAS = R('#a4a4aa', 7, 3, { dark: 0.62, light: 0.45, shift: 0.14 }), BASTOP = R('#9c9a96', 6, 3, { dark: 0.45, light: 0.5, shift: 0.1 });
const BASWET = R('#62626a', 6, 2, { dark: 0.6, light: 0.7 }), MOSSY = R('#6e8e2c', 6, 3, { dark: 0.6, light: 0.5, shift: 0.32 });
const FERNY = R('#4a842a', 5, 2, { dark: 0.55, light: 0.5, shift: 0.3 }), BARK = R('#6e4628', 6, 3, { dark: 0.58, light: 0.45 });
const CUT = R('#b07a4a', 5, 2), LICHEN = R('#a8b060', 5, 2);
const CELL = 10;   // (px across a column)

// the columns' plan over a len x depth footprint: each (x, y) -> its column (an id; its middle) and how near its edge
function columnPlan(len, depth, seed) {
  const n = len * depth, id = new Int32Array(n), edge = new Float32Array(n), cx = [], cy = [];
  const rows = Math.ceil(depth / (CELL * 0.86)) + 2, cols = Math.ceil(len / CELL) + 2;
  for (let r = -1; r < rows; r++) for (let c = -1; c < cols; c++) {
    cx.push((c + (r & 1 ? 0.5 : 0)) * CELL + (hash(c, r, seed) - 0.5) * CELL * 0.36);
    cy.push(r * CELL * 0.86 + (hash(r, c, seed + 1) - 0.5) * CELL * 0.3);
  }
  const at = (r, c) => (r + 1) * (cols + 1) + (c + 1);
  for (let y = 0; y < depth; y++) for (let x = 0; x < len; x++) {
    const r0 = Math.floor(y / (CELL * 0.86)), c0 = Math.floor(x / CELL);
    let b1 = 1e9, b2 = 1e9, bi = 0;
    for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (r < -1 || c < -1 || r >= rows || c >= cols) continue;
      const k = at(r, c); if (k >= cx.length) continue;
      const d = (cx[k] - x - 0.5) * (cx[k] - x - 0.5) + (cy[k] - y - 0.5) * (cy[k] - y - 0.5);
      if (d < b1) { b2 = b1; b1 = d; bi = k; } else if (d < b2) b2 = d;
    }
    id[y * len + x] = bi; edge[y * len + x] = Math.sqrt(b2) - Math.sqrt(b1);
  }
  return { id, edge, cx, cy };
}
// lay columns into model m over x in [x0, x1): top(k, u, v) the height of column k (u 0..1 along, v 0..1 back to front;
// <= 0: none there), wetAt(x) dark and wet, mats from kit()
function lay(m, K, P, len, depth, x0, x1, top, wetAt, seed) {
  const T = new Int16Array(len * depth);
  for (let y = 0; y < depth; y++) for (let x = x0; x < x1; x++) {
    const k = P.id[y * len + x];
    T[y * len + x] = Math.max(0, Math.round(top(k, P.cx[k] / len, P.cy[k] / depth, x, y)));
  }
  for (let y = 0; y < depth; y++) for (let x = x0; x < x1; x++) {
    const i = y * len + x, H = T[i];
    if (H < 2) continue;
    const k = P.id[i], seam = P.edge[i] < 1.1, wet = wetAt(x, y), mossy = hash(k, 7, seed) < 0.42, side = x + 0.5 - P.cx[k], rk = side < -2.2 ? K.rockL : side > 2.2 ? K.rockD : K.rock, front = y + 1 >= depth ? 0 : T[i + len];
    const drip = mossy && hash(x, k, seed + 3) < 0.34 ? 3 + Math.floor(hash(x, y, seed + 4) * 16) : mossy ? 2 : 0;
    for (let z = 0; z < H; z++) {
      let mt = seam ? K.seam : wet ? K.wet : rk;
      if (z >= H - 2) mt = mossy && !(wet && hash(k, 9, seed) < 0.6) ? K.moss : seam ? K.seam : K.top;
      else if (z >= H - 2 - drip && front < z && !seam) mt = K.moss;   // (moss hanging down the face)
      else if (!wet && z < 4 && hash(x, y, seed + 5) < 0.3) mt = K.moss;
      m.v[m.idx(x, y, z)] = mt;
    }
    if (mossy && !wet && hash(k, 11, seed) < 0.16 && P.edge[i] > 2.6 && H + 6 < m.h) {   // (a fern up out of a column's top)
      const fh = 3 + Math.floor(hash(x, y, seed + 6) * 5);
      if (hash(x, y, seed + 7) < 0.5) for (let z = H; z < H + fh; z++) m.v[m.idx(x, y, z)] = K.fern;
    }
  }
  m.prepared = false;
  return T;
}
function kit(m, seed) {
  const col = (x, y, z) => (hash(Math.floor(x / CELL), Math.floor(y / CELL), seed) - 0.5) * 0.9;
  const face = (x, y, z) => col(x, y, z) * 0.7 + (vnoise(x, z * 0.25, 5, seed + 2) - 0.5) * 0.7 + (Math.round(z) % 13 === 0 && hash(Math.round(x), Math.round(z), seed) < 0.4 ? -0.8 : 0) + (hash(Math.round(x), Math.round(z / 3), seed + 13) > 0.94 ? 0.9 : 0);
  return {
    rock: m.mat({ ramp: BAS, k: 3, shade: (x, y, z) => face(x, y, z) }),
    rockL: m.mat({ ramp: BAS, k: 4, shade: (x, y, z) => face(x, y, z) }),
    rockD: m.mat({ ramp: BAS, k: 2, shade: (x, y, z) => face(x, y, z) }),
    top: m.mat({ ramp: BASTOP, k: 3, shade: (x, y) => (hash(Math.round(x), Math.round(y), seed + 8) - 0.5) * 1.1 }),
    seam: m.mat({ ramp: BAS, k: 1, shade: () => -0.4 }),
    wet: m.mat({ ramp: BASWET, k: 2, shade: (x, y, z) => col(x, y, z) * 0.6 + (hash(Math.round(x), Math.round(z), seed + 4) > 0.92 ? 2.2 : 0) }),
    moss: m.mat({ ramp: MOSSY, k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.6 + (vnoise(x, y, 6, seed + 9) > 0.62 ? 0.8 : 0) }),
    fern: m.mat({ ramp: FERNY, k: 2, shade: (x, y, z) => (Math.round(z) % 2 ? 0.8 : -0.2) }),
    boulder: m.mat({ ramp: BAS, k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(z / 2), seed + 12) - 0.5) * 0.8 + (z > 6 ? 0.4 : 0) }),
  };
}
// mossy boulders and ferns at a run's foot (y near the front)
function footDress(m, K, len, depth, n, seed) {
  for (let i = 0; i < n; i++) {
    const r = 4 + hash(i, 3, seed) * 6, bx = 6 + hash(i, 1, seed) * (len - 12), by = depth - 3 - hash(i, 2, seed) * 5;
    m.ell(bx, by, r * 0.5, r, r * 0.8, r * 0.9, K.boulder); m.ell(bx - 1, by - 1, r * 1.05, r * 0.7, r * 0.55, r * 0.35, K.moss);
  }
  for (let i = 0; i < Math.ceil(len / 30); i++) {   // (ferns along the foot: fronds fanned out of a crown)
    const fx = 4 + hash(i, 21, seed) * (len - 8), fy = depth - 2 - hash(i, 22, seed) * 3, n2 = 5 + Math.floor(hash(i, 23, seed) * 4);
    for (let j = 0; j < n2; j++) {
      const a = (j / n2) * Math.PI + Math.PI * 0.08, L = 6 + hash(i, j, seed + 24) * 5;
      for (let t = 0; t < L; t++) { const x = fx + Math.cos(a) * t, y = fy - Math.sin(a) * t * 0.35, z = 1 + t * 0.9 - t * t * 0.07; m.set(x, y, z, K.fern); }
    }
  }
}
// ---- a run of basalt columns ------------------------------------------------------------------------------------
export function basaltCols(len = 160, depth = 60, h = 90, seed = 1, o = {}) {
  len = Math.max(24, len | 0); depth = Math.max(16, depth | 0);
  const m = new Vox(len, depth, h + 12), K = kit(m, seed), P = columnPlan(len, depth, seed + 17);
  const wetSide = o.wet || 0, fall = o.fall || 0;
  const frontAt = (x) => depth - 2 - vnoise(x, 3, 19, seed + 21) * Math.min(12, depth * 0.25);
  lay(m, K, P, len, depth, 0, len, (k, u, v, x, y) => {
    if (y > frontAt(x)) return 0;
    const end = Math.min(u, 1 - u) * len, taper = Math.min(1, 0.45 + end / 40);   // (its ends stepping down into the ground)
    const slope = fall < 0 ? 0.45 + 0.55 * u : fall > 0 ? 1 - 0.55 * u : 1;
    const tier = v < 0.45 ? 1 : v < 0.7 ? 0.72 + hash(k, 2, seed) * 0.12 : v < 0.86 ? 0.46 + hash(k, 3, seed) * 0.14 : 0.2 + hash(k, 4, seed) * 0.14;   // (the front columns broken off lower: tiers)
    const H = h * tier * taper * slope * (0.86 + hash(k, 5, seed) * 0.2);
    return Math.round(H / 3) * 3;
  }, (x) => wetSide && (wetSide < 0 ? x : len - 1 - x) < 26 + vnoise(x, 4, 9, seed) * 14, seed);
  footDress(m, K, len, depth, 2 + Math.floor(len / 45), seed);
  m.smooth = 1;
  return m;
}
// ---- a curtain fall off a lip of basalt columns -----------------------------------------------------------------
export function columnFallModel(o = {}) {
  const w = o.w || 110, drop = o.drop || 104, side = o.side || 70, seed = o.seed || 7, frames = o.frames || 4;
  const W = Math.round(w + side * 2), cx = W / 2, lipY = 40, apron = 26, D = lipY + 10 + apron, Hh = drop + 26;
  const m = new Vox(W, D, Hh), K = kit(m, seed), P = columnPlan(W, D, seed + 17), frame = { v: o.frame || 0 };
  const wtop = m.mat({ ramp: WATER.river, k: 3, flag: F_WATER | F_NOCAST, shade: (x, y) => Math.sin(y * 0.7 - frame.v / frames * Math.PI * 4 + hash(Math.round(x), 1, seed) * 3) * 0.5 + (hash(Math.round(x), Math.round(y), seed) > 0.88 ? 1.2 : 0) - Math.max(0, lipY - 8 - y) / lipY * 1.4 });
  const sheet = m.mat({ ramp: WATER.fall, k: 3, flag: F_WATER | F_NOCAST, shade: (x, y, z) => {
    const c = Math.round(x), hc = hash(c, 3, seed), u = (Hh - z) / (6 + hc * 8) - frame.v / frames * (2 + Math.floor(hc * 2));
    const band = Math.sin(Math.PI * 2 * (u + hc * 5));
    return (band > 0.25 ? 1.6 : band < -0.55 ? -0.6 : 0.5) + (hc > 0.72 ? 0.9 : hc < 0.18 ? -0.6 : 0) + (z > drop - 4 ? -1 : 0) + (vnoise(x, z * 0.3, 5, seed + 74) < 0.2 ? -1.2 : 0);
  } });
  const foam = m.mat({ ramp: WATER.foam, k: 2, flag: F_WATER | F_NOCAST, shade: (x, y, z) => (hash(Math.round(x), Math.round(y) + Math.round(frame.v * 3), Math.round(z)) - 0.4) * 2 });
  const halfW = (z) => w / 2 + (vnoise(z, 1, 9, seed + 30) - 0.5) * 6;   // (the notch's walls a little ragged)
  const inNotch = (x, z = drop) => Math.abs(x - cx) < halfW(z);
  // the lip uneven: each stretch of it a little forward or back, a little higher or lower; columns standing up through
  // it splitting the curtain's top into tongues; thin spills over the columns either side
  const lipAt = (x) => lipY + Math.round((vnoise(x, 0, 13, seed + 50) - 0.5) * 8), zLip = (x) => drop - Math.round(vnoise(x, 1, 17, seed + 51) * 5);
  const posts = [[-0.3, 7], [0.12, 6], [0.36, 8]].map(([u, pw]) => [cx + u * w, pw]), postAt = (x) => posts.some(([px, pw]) => Math.abs(x - px) < pw / 2);
  const spills = [cx - w / 2 - 12, cx + w / 2 + 16, cx - w / 2 - 34];
  // the columns: either side of the notch standing a little above the lip, stepping down in tiers to the front;
  // under the creek's water above the lip the bed's columns, cut level just under it
  lay(m, K, P, W, D, 0, W, (k, u, v, x, y) => {
    const dn = Math.abs(P.cx[k] - cx) - w / 2;
    if (y > lipY + 8 + (dn > 4 ? vnoise(x, 2, 11, seed + 33) * 8 : -8)) return 0;
    if (dn < 2) return y < lipY ? drop - 2 : 0;
    const tier = y < lipY - 14 ? 1 : y < lipY - 4 ? 0.82 + hash(k, 2, seed) * 0.1 : 0.6 + hash(k, 3, seed) * 0.16;
    return Math.round((drop + 6 + hash(k, 5, seed) * 14 - Math.max(0, dn - side * 0.6) * 0.6) * tier / 3) * 3;
  }, (x, y) => Math.abs(x - cx) - w / 2 < 22 + vnoise(x, y, 7, seed) * 10 && y > lipY - 20, seed);
  // the creek's water on top, running to the lip
  m.fill((x, y, z) => (inNotch(x) && y < lipAt(x) && z >= zLip(x) - 2 && z < zLip(x) ? wtop : -1), 0, 0, drop - 8, W, lipY + 6, drop);
  for (const [px, pw] of posts) m.fill((x, y, z) => (Math.abs(x - px) < pw / 2 && y > lipAt(px) - 6 && y < lipAt(px) + 2 && z < drop + 5 - Math.abs(x - px) * 0.6 ? (z > drop + 2 ? K.moss : K.wet) : -1), 0, 0, drop - 30, W, D, drop + 10);
  // the curtain: off the lip, curving out a little as it falls, its edges ragged and spreading toward the foot
  m.fill((x, y, z) => {
    const fan = (drop - z) * 0.08;
    if (!inNotch(x, z) && Math.abs(x - cx) >= halfW(z) + fan - (vnoise(z, x > cx ? 4 : 3, 7, seed + 70) - 0.5) * 5) return -1;
    if (z > zLip(x) - 1) return -1;
    if (z > drop - 26 - (vnoise(x, 9, 4, seed + 52) * 10) && posts.some(([px, pw]) => Math.abs(x - px) < pw / 2 + 1 - (drop - z) * 0.12)) return -1;   // (the tongues join below the columns)
    const ly = lipAt(x), out = (zLip(x) - z) * 0.1 + Math.min(4, (zLip(x) - z) * 0.05);
    return y >= ly + out - 1 && y < ly + out + 2 ? sheet : -1;
  }, 0, lipY - 8, 0, W, lipY + Math.ceil(drop * 0.16) + 12, drop);
  // thin spills over the columns either side, down their faces
  for (const sx of spills) m.fill((x, y, z) => {
    const wob = Math.sin(z * 0.15 + sx) * 1.2;
    if (Math.abs(x - sx - wob) > 2 + (drop - z) * 0.02) return -1;
    return y >= lipY + 8 + (drop - z) * 0.05 && y < lipY + 11 + (drop - z) * 0.05 ? sheet : -1;
  }, 0, lipY, 0, W, D, drop + 4);
  // the churn at the foot, spreading into the pool
  const footW = w + drop * 0.4 + 30;
  m.fill((x, y, z) => {
    const dx = (x - cx) / (footW / 2), dy = (y - lipY - drop * 0.12) / apron, q = dx * dx + dy * dy * 1.3;
    if (q > 1 + (vnoise(x, y, 5, seed + 60) - 0.5) * 0.8 || y < lipY + 1) return -1;
    return z < (1 - q) * 14 * (0.6 + vnoise(x, y + frame.v * 3, 4, seed) * 0.8) ? foam : -1;
  }, 0, lipY, 0, W, D, 16);
  // the mossy log fallen across the top, a little askew, a broken branch up off it
  if (o.log !== 0) {
    const bark = m.mat({ ramp: BARK, k: 3, shade: (x, y, z) => (Math.round(x) % 7 === 0 ? -0.8 : 0) + (hash(Math.round(x / 3), Math.round(z), seed + 40) - 0.5) * 0.7 });
    const moss = m.mat({ ramp: MOSSY, k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.6 });
    const end = m.mat({ ramp: CUT, k: 2, shade: (x, y, z) => (Math.round(Math.hypot(y, z)) % 3 === 0 ? -0.6 : 0.3) });
    const x0 = cx - w / 2 - 34, x1 = cx + w / 2 + 22, r = 6.5;
    for (let x = Math.floor(x0); x < x1; x++) {
      const t = (x - x0) / (x1 - x0), yc = lipY - 16 + t * 9, zc = drop + 6 - t * 2 + (Math.abs(x - cx) < w / 2 ? -1 : 0);
      for (let y = Math.floor(yc - r); y <= yc + r; y++) for (let z = Math.floor(zc - r); z <= zc + r; z++) {
        const q = (y - yc) * (y - yc) + (z - zc) * (z - zc);
        if (q > r * r) continue;
        m.set(x, y, z, x < x0 + 1.5 ? end : z > zc + r * 0.45 && hash(x, y, seed + 41) < 0.8 ? moss : bark);
      }
    }
    for (let k = 0; k < 9; k++) m.set(cx + w * 0.18 + k * 0.4, lipY - 12, drop + 11 + k, bark);   // (the branch stub)
  }
  m.face = lipY + Math.round(drop * 0.06); m.lip = drop; m.depth = D; m.width = w; m.kind = 'ledge'; m.frameRef = frame; m.mid = 0; m.smooth = 1;
  return m;
}
export function columnFall(o = {}) { return waterfall({ mist: o.mist ?? 0.85, seed: o.seed || 7 }, columnFallModel(o)); }
// ---- the forest floor -----------------------------------------------------------------------------------------
export function fungi(kind = 'agaric', seed = 1) {
  const m = new Vox(24, 16, 16);
  const stem = m.mat({ ramp: R('#ece2cc'), k: 3 });
  if (kind === 'shelf') {
    const sh = m.mat({ ramp: R('#c89a5a', 6, 3), k: 3, shade: (x, y, z) => (Math.round(Math.hypot(x - 12, y)) % 3 === 0 ? -0.7 : 0.2) });
    const rim = m.mat({ ramp: R('#ecd8a8'), k: 3 });
    for (let i = 0; i < 4; i++) { const x = 4 + hash(i, 1, seed) * 16, z = 2 + i * 3 + hash(i, 2, seed) * 2, r = 4 + hash(i, 3, seed) * 3; m.ell(x, 4, z, r, r * 0.9, 1.3, sh); m.ell(x, 4 + r * 0.6, z + 0.5, r * 0.8, 1, 0.8, rim); }
    return m;
  }
  if (kind === 'glow') {
    const cap = m.mat({ ramp: R('#5ac8f0', 5, 3), k: 3, emi: [90, 200, 255, 230] }), st = m.mat({ ramp: R('#b8e8f4'), k: 3, emi: [120, 200, 240, 120] });
    for (let i = 0; i < 6; i++) { const x = 4 + hash(i, 1, seed) * 16, y = 4 + hash(i, 2, seed) * 8, h = 2 + hash(i, 3, seed) * 4, r = 1.2 + hash(i, 4, seed) * 1.4; m.cyl('z', x, y, 0, 0.7, 0, h, st); m.ell(x, y, h, r, r, r * 0.55, cap); }
    return m;
  }
  const cap = m.mat({ ramp: R('#d0281e', 6, 3), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), seed + 3) > 0.84 ? 3 : 0) });   // (fly agarics: red, white flecks)
  const spot = m.mat({ ramp: R('#f4ecdc'), k: 4 });
  for (let i = 0; i < 4; i++) {
    const x = 5 + hash(i, 1, seed) * 14, y = 4 + hash(i, 2, seed) * 8, h = 4 + hash(i, 3, seed) * 7, r = 2.4 + hash(i, 4, seed) * 2.4;
    m.cyl('z', x, y, 0, 0.9 + r * 0.22, 0, h, stem); m.ell(x, y, h, r, r, r * 0.6, cap);
    for (let k = 0; k < 4; k++) { const a = hash(i, k, seed + 9) * 6.3, rr = r * 0.55; m.set(x + Math.cos(a) * rr, y + Math.sin(a) * rr, h + r * 0.45, spot); }
  }
  return m;
}
export function puddle(w = 40, d = 22, seed = 1) {
  const m = new Vox(w, d, 3);
  const mud = m.mat({ ramp: R('#4e3a28', 6, 3), k: 2, shade: (x, y) => (hash(Math.round(x), Math.round(y), seed) - 0.5) * 1.2 });
  const wat = m.mat({ ramp: R('#3e4c58', 6, 2, { dark: 0.6, light: 0.8 }), k: 2, flag: F_NOCAST, shade: (x, y) => (hash(Math.round(x / 3), Math.round(y), seed + 1) > 0.93 ? 3 : 0) + (y < d * 0.35 ? 0.8 : 0) - (y / d) * 0.6 });   // (dark, the sky's light caught along its far edge)
  const cx = w / 2, cy = d / 2;
  m.fill((x, y, z) => {
    const a = Math.atan2(y - cy, x - cx), wob = 1 + Math.sin(a * 3 + seed) * 0.16 + Math.sin(a * 5 + seed * 3) * 0.1, q = ((x - cx) / (w / 2 * wob)) ** 2 + ((y - cy) / (d / 2 * wob)) ** 2;
    if (q > 1) return -1;
    return q > 0.62 ? (z < 1 ? mud : -1) : z < 1 ? wat : -1;
  });
  m.smooth = 2;
  return m;
}
// a soft sprite: n(x, y) 0..1 its strength, col its colour, z its height (drawn over what's lower)
function soft(w, h, ax, ay, col, z, n) {
  const G = new GBuf(w, h); G.ax = ax; G.ay = ay;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = n(x, y); if (a <= 0.03) continue;
    const i = y * w + x, j = i * 4;
    G.col[j] = col[0]; G.col[j + 1] = col[1]; G.col[j + 2] = col[2]; G.col[j + 3] = Math.min(250, Math.round(a * 255));
    G.z[i] = z; G.flag[i] = F_NOCAST;
  }
  return G;
}
export function mist(w = 200, d = 80, seed = 1) {
  return soft(w, d, w / 2, d / 2, [226, 236, 238], 60, (x, y) => {
    const q = ((x - w / 2) / (w / 2)) ** 2 + ((y - d / 2) / (d / 2)) ** 2;
    return q > 1 ? 0 : (1 - q) * (vnoise(x, y, 24, seed) * 0.7 + vnoise(x, y, 9, seed + 1) * 0.3 - 0.36) * 0.6;
  });
}
export function foam(w = 64, d = 40, seed = 1) {   // (white water: broken streaks of foam over the water, low)
  return soft(w, d, w / 2, d / 2, [240, 248, 248], 6, (x, y) => {
    const q = ((x - w / 2) / (w / 2)) ** 2 + ((y - d / 2) / (d / 2)) ** 2;
    if (q > 1) return 0;
    const n = vnoise(x * 0.6, y * 1.6, 5, seed) * 0.6 + vnoise(x, y, 3, seed + 4) * 0.4;
    return n > 0.55 ? Math.min(0.95, (n - 0.5) * 3.2 * (1 - q * 0.6)) : 0;
  });
}
export function ray(w = 70, h = 260, seed = 1) {
  // (a shaft leaning from the canopy at the top left down to the ground at the anchor, brightest low down)
  const lean = h * 0.55;
  return soft(w + Math.ceil(lean), h, Math.ceil(lean) + w / 2, h - 4, [255, 232, 160], 900, (x, y) => {
    const t = y / h, c = Math.ceil(lean) * (1 - t) + w / 2, half = w / 2 * (0.6 + t * 0.4), u = Math.abs(x - c) / half;
    if (u > 1) return 0;
    return (1 - u * u) * (0.14 + t * 0.4) * (0.7 + vnoise(x, y * 0.2, 6, seed) * 0.6);
  });
}
