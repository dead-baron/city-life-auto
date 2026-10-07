// Art v2 wild props for the rocky biome scenes (N3 cave, N4 canyon, N5 mountains, N8 tidepools): mine
// gear (cart, timber portal, lanterns, barrels, a chest, a pickaxe, a walkway on piles, curved rails),
// cave life (mushrooms, bats), the coast (lighthouse, keeper's cottage, seals, gulls, crabs, driftwood and
// the tidepool critters), the mountains (log cabin, fire lookout, jeep), the desert (roadrunner, lizard,
// dead tree) and simple water: a waterfall curtain with its splash and a small cascade.
// Voxel models (voxel.js) unless noted; sprites are GBufs anchored at their foot (.ax, .ay).
import { Vox } from './voxel.js';
import { GBuf, F_WATER, F_NOCAST, F_LEAF, F_GLASS, F_GROUND, F_THIN, hash, bayer, vnoise } from './gbuf.js';
import { MAT, ramp } from './palette.js';

const R = (c, n = 6, k) => ramp(c, n, k);
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const pick = (Rm, t, x, y, d = 0.6) => Rm[Math.max(0, Math.min(Rm.length - 1, Math.round(t * (Rm.length - 1) + bayer(x, y) * d)))];
const nz = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const LAMP = [255, 196, 110];

// ---- mine gear -----------------------------------------------------------------------------------------
// an ore cart on its wheels (full: a heap of grey ore with glints)
export function mineCart(full = true) {
  const m = new Vox(32, 22, 26);
  const wood = m.mat({ ramp: R('#7a5434'), k: 3, shade: (x, y, z) => (Math.round(z) % 5 === 0 ? -0.9 : 0) + (hash(Math.round(x / 3), Math.round(z / 5), 3) - 0.5) * 0.6 });
  const iron = m.mat({ ramp: MAT.metalDark, k: 3 }), ore = m.mat({ ramp: R('#8c8a92'), k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(y / 3), Math.round(z / 2)) - 0.5) * 2.2 });
  const glint = m.mat({ ramp: R('#d8b848'), k: 4, emi: [255, 220, 120, 60] });
  for (const x of [7, 25]) for (const y of [2, 18]) m.cyl('y', x, 0, 5, 4.6, y, y + 2, iron);
  m.box(4, 4, 4, 28, 18, 6, iron);
  m.fill((x, y, z) => {
    if (z < 6 || z > 20) return -1;
    const ins = (20 - z) * 0.22;
    if (x < 1 + ins || x > 31 - ins || y < 2 || y > 20) return -1;
    const wall = x < 3 + ins || x > 29 - ins || y < 4 || y > 18 || z < 8;
    if (!wall) return 0;
    return (x < 4 + ins || x > 28 - ins) && (y < 5 || y > 17) ? iron : z > 18 ? iron : wood;
  });
  if (full) { m.ell(16, 11, 19, 12, 7, 5.5, ore); for (let i = 0; i < 6; i++) m.box(8 + hash(i, 1, 5) * 16, 6 + hash(i, 2, 5) * 10, 20 + hash(i, 3, 5) * 3, 9 + hash(i, 1, 5) * 16, 7 + hash(i, 2, 5) * 10, 21 + hash(i, 3, 5) * 3, glint); }
  return m;
}
// a timber mine portal: two posts, a lintel and braces round a black adit (set it against a rock face)
export function minePortal(w = 80, h = 70) {
  const m = new Vox(w, 22, h + 8);
  const post = m.mat({ ramp: R('#6e4a2e'), k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(z / 6), 7) - 0.5) * 0.9 + (Math.round(z) % 17 === 0 ? -0.8 : 0) });
  const beam = m.mat({ ramp: R('#7e5636'), k: 3, shade: (x) => (Math.round(x) % 13 === 0 ? -0.9 : 0) });
  const dark = m.mat({ ramp: R('#1a1418', 5, 1), k: 0 }), rock = m.mat({ ramp: R('#5a5058'), k: 2, shade: (x, y, z) => (hash(Math.round(x / 4), Math.round(z / 4), 9) - 0.5) * 1.4 });
  m.box(10, 0, 0, w - 10, 12, h - 10, dark);                         // the adit, receding into black
  m.box(0, 0, 0, 10, 4, h + 4, rock); m.box(w - 10, 0, 0, w, 4, h + 4, rock);
  for (const x of [6, w - 15]) m.box(x, 10, 0, x + 9, 19, h, post);
  m.box(2, 9, h - 10, w - 2, 20, h, beam); m.box(0, 8, h, w, 20, h + 6, beam);
  for (const x of [16, w - 22]) for (let z = 0; z < 16; z++) m.box(x + (x < w / 2 ? z : -z) * 0.6, 12, h - 26 + z, x + 3 + (x < w / 2 ? z : -z) * 0.6, 17, h - 25 + z, beam);
  m.box(w / 2 - 1, 14, h - 18, w / 2 + 1, 16, h - 10, m.mat({ ramp: MAT.metalDark, k: 2 }));
  return m;
}
// a lantern: 'post' (on a timber post with an arm), 'hang' (alone, to hang from a beam) or 'ground'
export function lantern(kind = 'post', on = 1) {
  const H = kind === 'post' ? 40 : 12, m = new Vox(kind === 'post' ? 18 : 8, 8, H);
  const fr = m.mat({ ramp: MAT.metalDark, k: 2, flag: F_THIN }), gl = m.mat({ ramp: R('#f8d080', 5, 3), k: 4, emi: [...LAMP, 255 * on], flag: F_NOCAST | F_GLASS });
  const wood = m.mat({ ramp: R('#6a4a30'), k: 3, flag: F_THIN });
  const lx = kind === 'post' ? 13 : 4, lz = kind === 'post' ? H - 18 : 1;
  if (kind === 'post') { m.box(2, 2, 0, 6, 6, H, wood); m.box(2, 3, H - 4, 15, 5, H - 2, wood); m.box(lx - 0.5, 3.5, lz + 9, lx + 0.5, 4.5, H - 4, fr); }
  m.box(lx - 2, 2, lz, lx + 2, 6, lz + 2, fr); m.box(lx - 2, 2, lz + 2, lx + 2, 6, lz + 7, gl); m.box(lx - 2.5, 1.5, lz + 7, lx + 2.5, 6.5, lz + 9, fr);
  for (const [a, b] of [[-2, 2], [-2, 6], [2, 2], [2, 6]]) m.box(lx + a - (a > 0 ? 1 : 0), b - (b > 4 ? 1 : 0), lz + 2, lx + a + (a > 0 ? 0 : 1), b + (b > 4 ? 0 : 1), lz + 7, fr);
  return m;
}
export function barrel(color = '#8a5a34') {
  const m = new Vox(14, 14, 18);
  const st = m.mat({ ramp: R(color), k: 3, shade: (x, y) => (Math.round(Math.atan2(y - 7, x - 7) * 5) % 2 ? -0.4 : 0.1) }), hoop = m.mat({ ramp: MAT.metalDark, k: 2 }), top = m.mat({ ramp: R('#a8784a'), k: 3, shade: (x) => (Math.round(x) % 3 === 0 ? -0.6 : 0) });
  m.fill((x, y, z) => { const r = 5.6 + Math.sin(z / 18 * Math.PI) * 1.2, d = Math.hypot(x - 7, y - 7); return d <= r ? (z > 16.5 ? top : (Math.abs(z - 4) < 1 || Math.abs(z - 13) < 1) && d > r - 1 ? hoop : st) : -1; });
  return m;
}
export function chest() {
  const m = new Vox(26, 16, 18);
  const w = m.mat({ ramp: R('#6e4a2e'), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.8 : 0) }), b = m.mat({ ramp: MAT.metalDark, k: 3 }), lid = m.mat({ ramp: R('#7a5434'), k: 3 }), g = m.mat({ ramp: R('#d8b040'), k: 4 });
  m.box(0, 0, 0, 26, 16, 11, w); m.fill((x, y, z) => (Math.hypot(y - 8, (z - 11) * 1.6) < 8.5 ? lid : -1), 0, 0, 11, 26, 16, 18);
  for (const x of [2, 22]) m.box(x, -0.5, 0, x + 2, 16.5, 18, b); m.box(12, 15, 7, 14, 17, 12, g);
  return m;
}
export function pickaxe() {
  const m = new Vox(10, 6, 34);
  const h = m.mat({ ramp: R('#8a6440'), k: 3 }), s = m.mat({ ramp: MAT.metal, k: 3 });
  for (let z = 0; z < 30; z++) m.box(4 + z * 0.08, 2, z, 6 + z * 0.08, 4, z + 1, h);
  m.fill((x, y, z) => (Math.abs(z - 29 - Math.abs(x - 5.5) * -0.35) < 1.4 && y > 1.5 && y < 4.5 ? s : -1), 0, 0, 24, 10, 6, 34);
  return m;
}
// a timber walkway on piles over water: len along x, deck `h` above the water, rails along both sides
export function walkway(len = 200, wid = 30, h = 22, opt = {}) {
  const m = new Vox(len, wid, h + 22);
  const deck = m.mat({ ramp: R('#6a4c34'), k: 3, shade: (x, y) => (Math.round(y) % 6 === 0 ? -0.9 : Math.round(y) % 6 === 1 ? 0.3 : 0) + (hash(Math.floor((x + Math.floor(y / 6) * 17) / 40), Math.floor(y / 6), 3) - 0.5) * 0.8 + ((Math.round(x + Math.floor(y / 6) * 17) % 40) === 0 ? -0.8 : 0) });
  const post = m.mat({ ramp: R('#5e4028'), k: 3, shade: (x, y, z) => (z < 4 ? -1 : 0) }), rail = m.mat({ ramp: R('#7a5434'), k: 3 }), steel = m.mat({ ramp: MAT.metal, k: 4 }), sl = m.mat({ ramp: R('#4e3624'), k: 2 });
  m.box(0, 0, h - 3, len, wid, h, deck);
  for (let x = 2; x < len; x += 30) for (const y of [0, wid - 5]) { m.box(x, y, 0, x + 5, y + 5, h + (opt.rails === false ? 0 : y ? 3 : 16), post); }
  for (let x = 2; x < len; x += 30) m.box(x, 0, h - 8, x + 4, wid, h - 3, post);
  if (opt.rails !== false) { m.box(0, 0, h + 13, len, 3, h + 16, rail); m.box(0, 1, h + 6, len, 3, h + 8, rail); }
  if (opt.track) { for (let x = 1; x < len; x += 6) m.box(x, wid / 2 - 9, h, x + 3, wid / 2 + 9, h + 1, sl); for (const y of [wid / 2 - 7, wid / 2 + 6]) m.box(0, y, h + 1, len, y + 1.5, h + 2.5, steel); }
  return m;
}
// curved mine rails painted onto the ground along a path (sleepers across, two steel rails)
export function railPath(G, path, gauge = 14, seed = 3) {
  let acc = 0;
  const S = R('#5a3e2a'), rl = [MAT.metal[4], MAT.metal[2], MAT.metalDark[2]];
  const P = (x, y, c, z, n) => { x = Math.round(x); y = Math.round(y); if (G.inside(x, y)) G.put(x, y, c, n || [0, 0, 1], z, null, F_GROUND); };
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1], [bx, by] = path[i], L = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / L, dy = (by - ay) / L, nx = -dy, ny = dx;
    for (let s = 0; s < L; s += 0.5, acc += 0.5) {
      const x = ax + dx * s, y = ay + dy * s;
      if (acc % 7 < 3) for (let q = -gauge / 2 - 4; q <= gauge / 2 + 4; q += 0.5) P(x + nx * q, y + ny * q, pick(S, 0.45 + (acc % 7 < 0.6 ? 0.25 : 0) - (q > gauge / 2 + 2 ? 0.2 : 0) + (hash(Math.floor(acc / 7), 1, seed) - 0.5) * 0.3, x | 0, y | 0), 0);
      for (const sg of [-1, 1]) for (let k = 0; k < 2; k++) P(x + nx * (sg * gauge / 2 + k * 0.9), y + ny * (sg * gauge / 2 + k * 0.9), rl[k], 1, [0, 0.4, 0.92]);
    }
  }
}

// ---- cave life -----------------------------------------------------------------------------------------
export function mushrooms(seed = 1, n = 5, cap = '#d8603a') {
  const m = new Vox(22, 16, 14);
  const stem = m.mat({ ramp: R('#e8dcc4'), k: 3 }), c = m.mat({ ramp: R(cap), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), seed + 3) > 0.86 ? 2 : 0), emi: [255, 150, 90, 30] });
  for (let i = 0; i < n; i++) {
    const x = 4 + hash(i, 1, seed) * 14, y = 3 + hash(i, 2, seed) * 10, h = 4 + hash(i, 3, seed) * 7, r = 2 + hash(i, 4, seed) * 2.6;
    m.cyl('z', x, y, 0, 0.9 + r * 0.25, 0, h, stem); m.ell(x, y, h, r, r, r * 0.6, c);
  }
  return m;
}
// a bat: hanging upside-down from a ledge (sprite anchored at its feet, the top) or flying
export function bat(fly = false, seed = 1) {
  const B = R('#4a3a4e', 5, 2), W = R('#5e4458', 5, 2), G = new GBuf(fly ? 22 : 10, 14);
  if (fly) {
    G.ax = 11; G.ay = 13;
    for (let x = -10; x <= 10; x++) { const ax = Math.abs(x), top = 4 + Math.round(ax * 0.25 - (ax > 6 ? (ax - 6) * 0.9 : 0)), bot = top + (ax < 3 ? 5 : 3 - Math.floor(ax / 5) + ((ax % 3) === 0 ? -1 : 0)); for (let y = top; y <= bot; y++) G.put(11 + x, y, pick(ax < 3 ? B : W, 0.55 - (y - top) * 0.12 - x * 0.015, x, y), [x * 0.04, 0.3, 0.9], 30 + 13 - y); }
    G.put(10, 3, B[3], [0, 0, 1], 41); G.put(12, 3, B[3], [0, 0, 1], 41);
  } else {
    G.ax = 5; G.ay = 1;
    for (let y = 1; y < 12; y++) { const hw = y < 3 ? 1 : y < 9 ? 2.5 + (y > 5 ? 0.5 : 0) : 2 - (y - 9) * 0.5; for (let x = -hw; x <= hw; x += 1) G.put(5 + x, y, pick(Math.abs(x) > 1.5 ? W : B, 0.6 - x * 0.12 - y * 0.02, x | 0, y), nz(x * 0.3, 0.6, 0.4), 40 - y); }
    G.put(4, 10, [255, 120, 90], [0, 1, 0], 30, [255, 90, 60, 90]); G.put(6, 10, [255, 120, 90], [0, 1, 0], 30, [255, 90, 60, 90]);
  }
  G.outline(0.4);
  return G;
}

// ---- coast ---------------------------------------------------------------------------------------------
export function lighthouse(h = 140, on = 1) {
  const m = new Vox(48, 48, h + 36);
  const wall = m.mat({ ramp: R('#ecebe2'), k: 4, shade: (x, y, z) => (Math.round(z) % 9 === 0 ? -0.35 : 0) + (hash(Math.round(x / 2), Math.round(z / 3), 3) > 0.9 ? -0.4 : 0) });
  const stone = m.mat({ ramp: R('#a89c8a'), k: 3, shade: (x, y, z) => (Math.round(z) % 5 === 0 ? -0.8 : 0) });
  const red = m.mat({ ramp: R('#b8382e'), k: 3 }), iron = m.mat({ ramp: R('#2c2c34'), k: 2 }), door = m.mat({ ramp: R('#2e5a6a'), k: 3 });
  const glass = m.mat({ ramp: R('#ffe6a0', 5, 3), k: 4, emi: [255, 226, 150, 255 * on], flag: F_GLASS | F_NOCAST });
  const c = 24;
  m.fill((x, y, z) => { const r = 18 - z / h * 5, d = Math.hypot(x - c, y - c); return d <= r ? (z < 12 ? stone : wall) : -1; }, 0, 0, 0, 48, 48, h);
  m.fill((x, y, z) => (Math.hypot(x - c, y - c) <= 17 ? (z < 3 ? red : -1) : -1), 0, 0, h, 48, 48, h + 3);
  m.fill((x, y, z) => { const d = Math.hypot(x - c, y - c); return d <= 17 && d > 16 && (Math.round(Math.atan2(y - c, x - c) * 8) % 2 === 0 || z > h + 9) ? iron : -1; }, 0, 0, h + 3, 48, 48, h + 11);
  m.cyl('z', c, c, 0, 9, h + 3, h + 18, glass);
  for (let a = 0; a < 6; a++) { const x = c + Math.cos(a) * 9, y = c + Math.sin(a) * 9; m.box(x - 0.6, y - 0.6, h + 3, x + 0.6, y + 0.6, h + 18, iron); }
  m.fill((x, y, z) => (Math.hypot(x - c, y - c) <= 11 * (1 - (z - h - 18) / 12) ? red : -1), 0, 0, h + 18, 48, 48, h + 30);
  m.box(c - 1, c - 1, h + 30, c + 1, c + 1, h + 35, iron);
  m.box(c - 4, c + 10, 0, c + 4, c + 15, 16, door);
  for (const z of [50, 90]) m.box(c - 2, c + 9, z, c + 2, c + 14, z + 8, iron);
  return m;
}
// a whitewashed cottage with a red tile roof (ridge along x), a chimney, windows and a door on the south
export function cottage(w = 84, d = 54, on = 0.4) {
  const H = 30, m = new Vox(w + 4, d + 6, H + 34);
  const wall = m.mat({ ramp: R('#ece6da'), k: 4, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(z / 3), 5) > 0.92 ? -0.4 : 0) });
  const tile = m.mat({ ramp: R('#b04634'), k: 3, shade: (x, y, z) => (Math.round(x) % 5 === 0 ? -0.6 : 0) + (Math.round(y + z) % 4 === 0 ? -0.8 : 0) + (z > H + 27 ? 1.2 : 0) + (z < H + 2 ? -1 : 0) });
  const trim = m.mat({ ramp: R('#4e7a7e'), k: 3 }), glass = m.mat({ ramp: R('#ffd890', 5, 3), k: 3, emi: [255, 210, 140, 200 * on], flag: F_GLASS }), stone = m.mat({ ramp: R('#9a9086'), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.8 : 0) });
  m.box(2, 3, 0, w + 2, d + 3, H, wall);
  m.fill((x, y, z) => { const r = d / 2 + 4 - (z - H) * 1.05; return Math.abs(y - (d / 2 + 3)) <= r ? tile : -1; }, 0, 0, H, w + 4, d + 6, H + 30);
  m.box(w - 14, d / 2 - 4, H, w - 4, d / 2 + 4, H + 36, stone);
  for (const x of [14, w - 22]) { m.box(x, d + 2, 9, x + 12, d + 4, 22, trim); m.box(x + 2, d + 3, 11, x + 10, d + 4.5, 20, glass); }
  m.box(w / 2 - 6, d + 2, 0, w / 2 + 6, d + 4, 22, trim);
  return m;
}
export function seal(pose = 0, coat = '#7a6048') {
  const m = new Vox(46, 22, 18);
  const b = m.mat({ ramp: R(coat), k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(y / 3), 9) > 0.85 ? -0.5 : 0) }), dk = m.mat({ ramp: R('#2a2228', 5, 2), k: 1 }), bel = m.mat({ ramp: R('#a8906e'), k: 3 });
  const up = pose === 1;                                                // head raised
  for (let x = 4; x < 38; x++) { const t = x / 38, r = 2 + Math.sin(t * Math.PI) * 6.5 + t * 1.5; m.ell(x, 11, r * 0.5, 0.8, r, r * 0.5, b); }
  m.ell(16, 11, 1.5, 9, 5, 1.5, bel);
  if (up) { m.ell(37, 11, 6, 4, 4.4, 4, b); m.ell(40, 11, 10, 4, 3.8, 3.4, b); } else m.ell(40, 11, 4, 4.6, 4.2, 3.4, b);
  const hz = up ? 10 : 4.5;
  m.box(43, 9, hz, 45, 10, hz + 1.5, dk); m.box(43, 12, hz, 45, 13, hz + 1.5, dk); m.box(45, 10.5, hz - 2, 46, 11.5, hz - 1, dk);
  m.ell(2, 7, 1, 3, 2.5, 1, b); m.ell(2, 15, 1, 3, 2.5, 1, b); m.ell(28, 3, 1, 4, 2, 1, b); m.ell(28, 19, 1, 4, 2, 1, b);
  m.smooth = 2;
  return m;
}
export function gull(fly = false) {
  if (fly) {
    const G = new GBuf(34, 14); G.ax = 17; G.ay = 13;
    const Wg = R('#d8dce4', 5, 3), Bd = R('#fbfaf6', 5, 3);
    for (let x = -16; x <= 16; x++) { const ax = Math.abs(x), y0 = 6 - Math.round(ax < 7 ? ax * 0.55 : 3.8 - (ax - 7) * 0.5), th = ax < 3 ? 5 : ax < 12 ? 3 : 2; for (let y = y0; y < y0 + th; y++) G.put(17 + x, y, ax > 12 ? [52, 52, 60] : pick(ax < 3 ? Bd : Wg, 0.85 - (y - y0) * 0.18, x, y, 0.3), [0, 0.1, 1], 50, null, F_NOCAST); }
    G.put(17, 4, [240, 186, 60], [0, 0, 1], 50, null, F_NOCAST); G.put(17, 3, [240, 186, 60], [0, 0, 1], 50, null, F_NOCAST); G.outline(0.75); return G;
  }
  const m = new Vox(16, 8, 14);
  const w = m.mat({ ramp: R('#f2f0ec'), k: 3 }), g = m.mat({ ramp: R('#a8b0bc'), k: 3 }), y = m.mat({ ramp: R('#e8b030'), k: 3 }), dk = m.mat({ ramp: R('#2a2a30', 5, 2), k: 1 });
  m.ell(7, 4, 7, 5.5, 3, 3, w); m.ell(6, 4, 8, 5, 3.2, 2.2, g); m.box(0, 3, 7, 3, 5, 9, dk); m.ell(12, 4, 11, 2.4, 2.2, 2.4, w); m.box(14, 3.5, 11, 16, 4.5, 12, y);
  m.box(6, 3, 0, 7, 4, 5, y); m.box(8, 4, 0, 9, 5, 5, y);
  return m;
}
export function crab(col = '#d0582e') {
  const m = new Vox(16, 14, 6);
  const c = m.mat({ ramp: R(col), k: 3 }), dk = m.mat({ ramp: R('#2a1a1a', 5, 2), k: 1 });
  m.ell(8, 7, 2.5, 4.5, 3.5, 2, c);
  for (const s of [-1, 1]) { for (let k = 0; k < 3; k++) m.box(6 + k * 2, 7 + s * 4, 0, 7 + k * 2, 7 + s * 6, 2, c); m.ell(13, 7 + s * 4, 2.5, 2, 1.6, 1.3, c); }
  m.box(11, 5.5, 4, 12, 6.5, 5, dk); m.box(11, 7.5, 4, 12, 8.5, 5, dk);
  return m;
}
export function driftwood(len = 60, seed = 1) {
  const m = new Vox(len, 16, 10);
  const wd = m.mat({ ramp: R('#b8aa94'), k: 3, shade: (x, y, z) => (Math.round(x + z * 3) % 6 === 0 ? -0.7 : 0) + (hash(Math.round(x / 5), 1, seed) - 0.5) * 0.5 });
  m.cyl('x', 0, 8, 4, 3.6, 2, len - 2, wd); m.ell(len - 4, 8, 4, 4, 4.5, 4.2, wd);
  for (let k = 0; k < 3; k++) { const x = 10 + hash(k, 1, seed) * (len - 24), s = hash(k, 2, seed) > 0.5 ? 1 : -1; for (let q = 0; q < 7; q++) m.box(x + q, 8 + s * (3 + q), 4, x + q + 2, 9 + s * (3 + q), 6, wd); }
  return m;
}
// tidepool critters: flat sprites (lie them on rock or under shallow water)
export function starfish(col = '#d8583a', r = 6, seed = 1) {
  const S = R(col, 5, 2), G = new GBuf(r * 2 + 3, r * 2 + 3), c = r + 1; G.ax = c; G.ay = c;
  const a0 = hash(seed, 1, 3) * 6.28;
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const d = Math.hypot(x, y * 1.25), a = Math.atan2(y, x) - a0, arm = 0.35 + 0.65 * Math.pow(Math.abs(Math.cos(a * 2.5)), 3);
    if (d > r * arm + 0.6) continue;
    G.put(c + x, c + y, pick(S, 0.65 - y / r * 0.2 - x / r * 0.1 + (hash(x, y, seed) > 0.8 ? 0.2 : 0) - d / r * 0.15, x, y), [0, 0, 1], 1);
  }
  G.outline(0.5); return G;
}
export function urchin(r = 5, seed = 1, col = '#3a2448') {
  const S = R(col, 5, 2), G = new GBuf(r * 2 + 5, r * 2 + 5), c = r + 2; G.ax = c; G.ay = c;
  for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 2; x <= r + 2; x++) {
    const d = Math.hypot(x, y * 1.2), a = Math.atan2(y, x), sp = Math.abs(Math.sin(a * 7 + seed)) > 0.82 ? 2 : 0;
    if (d > r - 1 + sp) continue;
    G.put(c + x, c + y, pick(S, sp && d > r - 1 ? 0.35 : 0.55 - (x + y) / r * 0.2 + (hash(x, y, seed) > 0.7 ? 0.2 : 0), x, y), nz(x / r, y / r, 1), 2);
  }
  G.outline(0.5); return G;
}
export function anemone(r = 5, seed = 1, col = '#5ab088', mid = '#e87a9a') {
  const S = R(col, 5, 2), M = R(mid, 5, 2), G = new GBuf(r * 2 + 3, r * 2 + 3), c = r + 1; G.ax = c; G.ay = c;
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const d = Math.hypot(x, y * 1.2), a = Math.atan2(y, x); if (d > r) continue;
    const ten = Math.sin(a * 9 + seed) > 0;
    G.put(c + x, c + y, d < r * 0.38 ? pick(M, 0.5 - y / r * 0.3, x, y) : pick(S, (ten ? 0.65 : 0.35) - d / r * 0.15, x, y), nz(x / r * 0.5, y / r * 0.5, 1), 1);
  }
  G.outline(0.5); return G;
}

// ---- mountains -----------------------------------------------------------------------------------------
// a log cabin: log walls, a green metal gable roof (ridge along x), a stone chimney, a porch and lit windows
export function logCabin(w = 96, d = 60, on = 0.6) {
  const H = 32, m = new Vox(w + 8, d + 18, H + 40);
  const logs = m.mat({ ramp: R('#7a5434'), k: 3, shade: (x, y, z) => { const r = Math.round(z) % 5; return (r === 0 ? -1.1 : r === 1 ? 0.4 : r === 4 ? -0.3 : 0) + (hash(Math.round(x / 9), Math.round(z / 5), 3) - 0.5) * 0.5; } });
  const ends = m.mat({ ramp: R('#c8a070'), k: 3 }), roof = m.mat({ ramp: R('#4e6a4a'), k: 3, shade: (x) => (Math.round(x) % 6 === 0 ? -0.9 : Math.round(x) % 6 === 1 ? 0.4 : 0) });
  const stone = m.mat({ ramp: R('#8e8880'), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 || Math.round(x + Math.floor(z / 4) * 3) % 6 === 0 ? -0.9 : (hash(Math.round(x / 3), Math.round(z / 4), 7) - 0.5) * 0.8) });
  const glass = m.mat({ ramp: R('#ffcf80', 5, 3), k: 3, emi: [255, 196, 110, 255 * on], flag: F_GLASS }), trim = m.mat({ ramp: R('#4a3424'), k: 2 }), deck = m.mat({ ramp: R('#8a6440'), k: 3, shade: (x) => (Math.round(x) % 6 === 0 ? -0.9 : 0) });
  m.box(4, 4, 0, w + 4, d + 4, H, logs);
  for (const x of [3, w + 3]) for (const y of [3, d + 3]) for (let z = 0; z < H; z += 5) m.box(x - 1, y - 1, z, x + 2, y + 2, z + 4, ends);
  m.fill((x, y, z) => { const r = d / 2 + 8 - (z - H) * 0.95; return Math.abs(y - (d / 2 + 4)) <= r && x >= 0 && x < w + 8 ? roof : -1; }, 0, 0, H, w + 8, d + 14, H + 36);
  m.box(w - 6, d / 2 - 2, 0, w + 8, d / 2 + 12, H + 42, stone);
  for (const x of [16, w - 30]) { m.box(x, d + 4, 10, x + 16, d + 5, 24, trim); m.box(x + 2, d + 4.5, 12, x + 14, d + 5.5, 22, glass); }
  m.box(w / 2 - 6, d + 4, 0, w / 2 + 6, d + 5, 24, trim);
  m.box(w / 2 - 22, d + 5, 0, w / 2 + 22, d + 16, 3, deck);
  for (let k = 0; k < 2; k++) m.box(w / 2 - 8, d + 16 + k * 0, 0, w / 2 + 8, d + 18, 2 - k, deck);
  return m;
}
// a fire lookout: four braced legs, a glazed cab with a gallery and a pyramid roof, a zig-zag stair
export function lookoutTower(h = 110, on = 0.6) {
  const S = 44, m = new Vox(S + 24, S + 24, h + 46);
  const wood = m.mat({ ramp: R('#6e4a30'), k: 3 }), brace = m.mat({ ramp: R('#5a3c26'), k: 3 }), cab = m.mat({ ramp: R('#7a5a3c'), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.7 : 0) });
  const glass = m.mat({ ramp: R('#ffd890', 5, 3), k: 3, emi: [255, 210, 130, 230 * on], flag: F_GLASS }), roof = m.mat({ ramp: R('#4a4a54'), k: 3, shade: (x, y) => (Math.round(x + y) % 6 === 0 ? -0.8 : 0) }), deck = m.mat({ ramp: R('#8a6440'), k: 3 });
  const o = 12;
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) for (let z = 0; z < h; z++) { const k = 6 * (1 - z / h), x = o + cx * (S - 4) + (cx ? k : -k), y = o + cy * (S - 4) + (cy ? k : -k); m.box(x, y, z, x + 4, y + 4, z + 1, wood); }
  for (let seg = 0; seg < 3; seg++) { const z0 = seg * h / 3, z1 = z0 + h / 3; for (let z = z0; z < z1; z++) { const t = (z - z0) / (z1 - z0); for (const yy of [o, o + S - 3]) { m.box(o + t * S, yy, z, o + t * S + 2, yy + 2, z + 1, brace); m.box(o + S - t * S, yy, z, o + S - t * S + 2, yy + 2, z + 1, brace); } for (const xx of [o, o + S - 3]) { m.box(xx, o + t * S, z, xx + 2, o + t * S + 2, z + 1, brace); } } m.box(o - 2, o - 2, z1 - 2, o + S + 2, o + 1, z1, brace); m.box(o - 2, o + S - 3, z1 - 2, o + S + 2, o + S, z1, brace); }
  m.box(o - 8, o - 8, h, o + S + 8, o + S + 8, h + 3, deck);
  m.box(o, o, h + 3, o + S, o + S, h + 28, cab);
  m.box(o + 3, o + S - 1, h + 12, o + S - 3, o + S + 0.5, h + 25, glass); m.box(o - 0.5, o + 3, h + 12, o + 1, o + S - 3, h + 25, glass);
  for (let x = o + 10; x < o + S - 3; x += 11) m.box(x, o + S - 1.5, h + 12, x + 1.5, o + S + 1, h + 25, cab);
  for (const [a, b] of [[o - 8, o + S + 6], [o + S + 6, o - 8]]) m.box(Math.min(a, o + S + 6), o + S + 6, h + 3, Math.max(a, o + S + 8), o + S + 8, h + 13, brace);
  m.box(o - 8, o + S + 6, h + 11, o + S + 8, o + S + 8, h + 13, brace); m.box(o + S + 6, o - 8, h + 11, o + S + 8, o + S + 8, h + 13, brace);
  m.fill((x, y, z) => { const r = S / 2 + 6 - (z - h - 28) * 1.3; return Math.abs(x - o - S / 2) <= r && Math.abs(y - o - S / 2) <= r ? roof : -1; }, 0, 0, h + 28, S + 24, S + 24, h + 46);
  for (let z = 0; z < h; z++) { const flight = Math.floor(z / 22), t = (z % 22) / 22, x = flight % 2 ? o + S + 4 - t * S * 0.6 : o + S * 0.4 + t * S * 0.6; m.box(x, o + S + 4, z, x + 6, o + S + 10, z + 1.5, deck); }
  return m;
}
// a boxy off-road jeep: open top with a roll bar, a spare wheel on the back
export function jeep(color = '#c0542e') {
  const m = new Vox(84, 44, 40);
  const b = m.mat({ ramp: R(color), k: 3, gloss: 1 }), dk = m.mat({ ramp: R('#2a2a30', 5, 2), k: 2 }), t = m.mat({ ramp: MAT.tyre, k: 2 }), gl = m.mat({ ramp: MAT.glass, k: 3, flag: F_GLASS }), seat = m.mat({ ramp: R('#3a3230'), k: 2 }), lamp = m.mat({ ramp: R('#f4ecd0', 5, 3), k: 3 });
  for (const x of [18, 64]) for (const y of [3, 37]) m.cyl('y', x, 0, 9, 9, y, y + 5, t);
  m.box(4, 6, 8, 82, 38, 22, b);
  m.box(4, 6, 8, 82, 38, 10, dk);
  for (const x of [18, 64]) m.fill((px, py, pz) => (Math.hypot(px - x, pz - 9) < 11 && (py < 9 || py > 35) ? 0 : -1), x - 12, 0, 0, x + 12, 44, 22);
  m.box(56, 8, 22, 82, 36, 26, b);
  m.box(10, 10, 22, 50, 34, 24, seat); m.box(14, 12, 24, 22, 32, 30, seat); m.box(34, 12, 24, 42, 32, 30, seat);
  m.box(50, 7, 22, 53, 37, 36, dk); m.box(51, 9, 25, 52, 35, 34, gl);
  for (const y of [7, 35]) m.box(24, y, 22, 27, y + 2, 38, dk); m.box(24, 7, 36, 27, 37, 38, dk);
  m.cyl('x', 0, 22, 18, 8, 0, 4, t); m.box(82, 10, 14, 84, 16, 18, lamp); m.box(82, 28, 14, 84, 34, 18, lamp);
  m.box(82, 17, 10, 84, 27, 20, dk);
  return m;
}

// ---- desert --------------------------------------------------------------------------------------------
export function roadrunner() {
  const m = new Vox(30, 8, 22);
  const b = m.mat({ ramp: R('#6e5a44'), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(z), 3) > 0.6 ? 0.9 : -0.3) }), w = m.mat({ ramp: R('#d8ccb0'), k: 3 }), dk = m.mat({ ramp: R('#2a2a30', 5, 2), k: 1 }), y = m.mat({ ramp: R('#8a7a5a'), k: 2 });
  m.ell(14, 4, 11, 6, 2.6, 3.4, b); m.ell(15, 4, 9, 4, 2.2, 2, w);
  for (let k = 0; k < 12; k++) m.box(8 - k, 3.5, 12 + k * 0.45, 9 - k, 4.5, 13.5 + k * 0.45, b);
  m.ell(21, 4, 16, 2.6, 2.2, 2.6, b); m.box(19, 3.5, 18, 22, 4.5, 21, dk);
  m.box(23, 3.5, 15.5, 28, 4.5, 16.5, dk);
  m.box(13, 3, 0, 14, 4, 8, y); m.box(16, 4, 0, 17, 5, 8, y);
  return m;
}
export function lizard(col = '#b8a070') {
  const m = new Vox(34, 14, 6);
  const b = m.mat({ ramp: R(col), k: 3, shade: (x, y) => (hash(Math.round(x / 2), Math.round(y / 2), 5) > 0.7 ? -1 : 0) }), dk = m.mat({ ramp: R('#2a2a30', 5, 2), k: 1 });
  m.ell(18, 7, 2, 7, 3, 2, b); m.ell(26, 7, 2.3, 3, 2.4, 1.8, b);
  for (let k = 0; k < 13; k++) m.box(11 - k, 6.5 + Math.sin(k * 0.4) * 1.5, 1, 12 - k, 7.5 + Math.sin(k * 0.4) * 1.5, 2, b);
  for (const [x, s] of [[22, 1], [14, -1], [22, -1], [14, 1]]) m.box(x, 7 + s * 3, 0, x + 1.5, 7 + s * 6, 1, b);
  m.box(27, 5.5, 3, 28, 6.5, 4, dk); m.box(27, 7.5, 3, 28, 8.5, 4, dk);
  return m;
}
// a dead desert tree: a gnarled grey trunk with bare forking branches (sprite)
export function deadTree(seed = 1, h = 70) {
  const W = h + 10, Hh = h + 8, G = new GBuf(W, Hh), foot = Hh - 3, Rm = R('#8a7a6a', 6, 3);
  G.ax = W / 2; G.ay = foot;
  const br = (x, y, a, len, wd, depth) => {
    for (let s = 0; s < len; s += 0.5) {
      const X = x + Math.cos(a) * s, Y = y + Math.sin(a) * s, ww = wd * (1 - s / len * 0.6);
      for (let q = -ww / 2; q <= ww / 2; q += 0.5) G.put(X + q * Math.sin(a), Y - q * Math.cos(a), pick(Rm, 0.6 - q / Math.max(1, ww) * 0.6 + (hash(X | 0, Y | 0, seed) - 0.5) * 0.2, X | 0, Y | 0), nz(q, 0.3, 0.6), 1);
    }
    if (depth <= 0 || len < 5) return;
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    for (let k = 0; k < 2 + (depth > 2 ? 1 : 0); k++) br(ex, ey, a + (hash(depth, k, seed) - 0.5) * 1.6 + (k ? 0.45 : -0.45), len * (0.55 + hash(k, depth, seed + 1) * 0.25), Math.max(1, wd * 0.6), depth - 1);
  };
  br(W / 2, foot, -Math.PI / 2 + (hash(seed, 0, 1) - 0.5) * 0.3, h * 0.38, 5, 4);
  G.outline(0.42, true);
  for (let i = 0; i < G.z.length; i++) if (G.col[i * 4 + 3]) G.z[i] = Math.max(1, foot - Math.floor(i / G.w));
  return G;
}

// ---- water ---------------------------------------------------------------------------------------------
// a waterfall curtain w wide dropping h px (sprite, anchored at the foot of the fall): streaky white
// water over blue, a churned plunge with spray at the bottom, a lit brink at the top
export function waterfall(w = 40, h = 120, seed = 1, opt = {}) {
  const W = Math.ceil(w * 1.8) + 8, top = 6, Hh = h + top + Math.ceil(w * 0.5) + 10, G = new GBuf(W, Hh), cx = W / 2, foot = top + h;
  G.ax = cx; G.ay = foot;
  const Wt = ramp('#4a94b8', 7, 3, { dark: 0.5, light: 0.8, shift: 0.1 });
  for (let y = 0; y <= h; y++) {
    const t = y / h, half = w / 2 * (1 + t * 0.15);
    for (let x = Math.floor(cx - half); x <= cx + half; x++) {
      const u = (x - cx) / half, col = Math.floor(x * 0.7 + hash(x >> 1, 0, seed) * 3), str = hash(col, Math.floor((y + hash(col, 1, seed) * 40) / (6 + hash(col, 2, seed) * 14)), seed);
      let k = 0.5 + (str > 0.4 ? 0.32 : 0) + (str > 0.75 ? 0.2 : 0) - Math.abs(u) * 0.15 + t * 0.12;
      if (y < 3) k = 0.95 - y * 0.08;
      if (Math.abs(u) > 0.94 && hash(x, y, seed) > 0.5) continue;
      G.put(x, top + y, pick(Wt, clamp(k), x, y, 0.5), nz(u * 0.4, 0.9, 0.3), h - y, k > 0.85 ? [230, 245, 255, 40] : null, F_WATER | F_NOCAST);
    }
  }
  // plunge: churned foam and spray round the foot
  const pr = w * 0.75;
  for (let y = -Math.ceil(pr * 0.8); y <= Math.ceil(pr * 0.45); y++) for (let x = -Math.ceil(pr); x <= pr; x++) {
    const d = (x / pr) ** 2 + (y / (pr * 0.45)) ** 2 + (vnoise(x + 50, y + 50, 4, seed) - 0.5) * 0.6;
    if (d > 1) continue;
    const up = y < 0 ? -y : 0;
    if (y < 0 && hash(x, y, seed + 3) > 0.55 - d * 0.3) continue;
    G.put(cx + x, foot + y, pick(Wt, clamp(0.98 - d * 0.35 + (hash(x, y, seed) - 0.5) * 0.2), x, y, 0.5), [0, 0.4, 0.9], up * 0.8, [235, 245, 255, 30 + (1 - d) * 50], F_WATER | F_NOCAST);
  }
  return G;
}
// chimney or campfire smoke: soft grey puffs rising and drifting east, half see-through (sprite)
export function chimneySmoke(seed = 1, h = 60) {
  const W = 46, Hh = h + 12, G = new GBuf(W, Hh), Rm = ramp('#c8c4c0', 5, 3, { dark: 0.4 });
  G.ax = 8; G.ay = Hh - 2;
  for (let k = 0; k < 9; k++) {
    const t = k / 8, cx = 8 + t * t * 28 + (hash(k, 1, seed) - 0.5) * 4, cy = Hh - 4 - t * h, r = 2.5 + t * 6;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = (x * x + y * y) / (r * r); if (d > 1 || hash(Math.round(cx + x), Math.round(cy + y), seed) < t * 0.5) continue;
      const X = Math.round(cx + x), Y = Math.round(cy + y); if (!G.inside(X, Y)) continue;
      G.put(X, Y, pick(Rm, clamp(0.75 - (x + y) / r * 0.2 - d * 0.2), X, Y), [x / r * 0.5, 0.2, 0.8], Math.round(Hh - 2 - Y), null, F_NOCAST, Math.round(200 * (1 - t * 0.7)));
    }
  }
  return G;
}
// a little cascade over a ledge (oasis, creeks): a short fall with step lines
export const cascade = (w = 22, h = 30, seed = 2) => waterfall(w, h, seed);

// ---- the cove (concept L9) ------------------------------------------------------------------------------------
// a beach bar shack against the cliff: weathered plank walls, a tin roof sloping to the front, a counter open to
// the south under a green-and-white striped awning on two posts, shelves of bright bottles and jars behind the
// counter, a chalkboard by the door, a life ring on the east wall
export function beachBar(on = 0.5) {
  const w = 96, d = 50, H = 42, m = new Vox(w + 12, d + 34, H + 22);
  const wood = m.mat({ ramp: R('#a0805c'), k: 3, shade: (x, y, z) => (Math.round(x + y) % 7 === 0 ? -1 : 0) + (hash(Math.floor((x + y) / 7), 1, 3) - 0.5) * 0.7 + (z < 4 ? -0.5 : 0) });
  const dark = m.mat({ ramp: R('#5a4232'), k: 3 }), counter = m.mat({ ramp: R('#c49a62'), k: 4, shade: (x) => (Math.round(x) % 12 === 0 ? -0.8 : 0) });
  const tin = m.mat({ ramp: R('#8e8a80'), k: 3, shade: (x, y) => (Math.round(x) % 6 < 2 ? -0.7 : 0.2) + (hash(Math.round(x / 12), Math.round(y / 9), 7) > 0.8 ? -0.6 : 0) });
  const rust = m.mat({ ramp: R('#9a5a34'), k: 3 });
  const aw1 = m.mat({ ramp: R('#2f8a5a'), k: 3 }), aw2 = m.mat({ ramp: R('#ece6d6'), k: 3 });
  const inside = m.mat({ ramp: R('#3a2c24'), k: 1 }), board = m.mat({ ramp: R('#2a302c'), k: 2 }), chalk = m.mat({ ramp: R('#e8e4d8'), k: 3 });
  const ring = m.mat({ ramp: R('#e8442e'), k: 3 }), ringW = m.mat({ ramp: R('#f2eee6'), k: 3 });
  const bot = ['#d8342e', '#e8b830', '#3a8ad8', '#5ab84a', '#e86a9a', '#f08a2a'].map((c) => m.mat({ ramp: R(c, 5, 3), k: 4, emi: on ? [255, 210, 150, Math.round(40 * on)] : null }));
  const x0 = 6, y0 = 4, x1 = x0 + w, y1 = y0 + d;
  m.box(x0, y0, 0, x1, y1, 1, inside);                                                   // the floor inside, dark
  m.box(x0, y0, 0, x1, y0 + 4, H, wood);                                                 // back wall
  m.box(x0, y0, 0, x0 + 4, y1, H, wood); m.box(x1 - 4, y0, 0, x1, y1, H, wood);           // the ends
  m.box(x0, y1 - 4, 0, x1, y1, 18, wood); m.box(x0, y1 - 4, 36, x1, y1, H, wood);         // the front: below the counter, above the opening
  for (const x of [x0 + 30, x1 - 34]) m.box(x, y1 - 4, 18, x + 4, y1, 36, wood);           // (posts in the opening)
  m.box(x0 - 1, y1 - 6, 18, x1 + 1, y1 + 5, 21, counter);                                 // the counter board, out over the front
  for (const z of [16, 25]) {                                                             // shelves of bottles and jars behind it
    m.box(x0 + 6, y0 + 4, z, x1 - 6, y0 + 9, z + 1, dark);
    for (let x = x0 + 8; x < x1 - 8; x += 4) { const k = Math.floor(hash(x, z, 5) * bot.length), h = 3 + Math.floor(hash(x, z, 6) * 4); m.box(x, y0 + 5, z + 1, x + 2, y0 + 8, z + 1 + h, bot[k]); }
  }
  m.box(x0 + 10, y1 - 14, 0, x0 + 26, y1 - 5, 16, dark);                                  // a fridge chest under the counter
  // the tin roof, sloping down to the front and over the sides, a rusty ridge
  m.fill((x, y, z) => { const top = H + 16 - (y - y0 + 4) * 0.28; return z >= top - 2 && z < top ? (y < y0 + 4 ? rust : tin) : -1; }, x0 - 3, y0 - 4, H, x1 + 3, y1 + 4, H + 18);
  // the striped awning over the counter, out on two posts
  m.fill((x, y, z) => { const top = 38 - (y - y1) * 0.42; return z >= top - 1.5 && z < top ? (Math.floor((x - x0) / 8) % 2 ? aw1 : aw2) : -1; }, x0 - 2, y1, 28, x1 + 2, y1 + 24, 40);
  for (let x = x0 - 2; x < x1 + 2; x += 8) m.ell(x + 4, y1 + 23, 27.6, 4, 1.2, 2.2, Math.floor((x - x0) / 8) % 2 ? aw1 : aw2);   // the scalloped edge
  for (const x of [x0 - 1, x1 - 2]) m.box(x, y1 + 21, 0, x + 3, y1 + 24, 30, dark);
  // the chalkboard on its easel by the front, the life ring on the east wall
  m.box(x1 + 2, y1 + 8, 0, x1 + 3, y1 + 10, 22, dark); m.box(x1 + 8, y1 + 8, 0, x1 + 9, y1 + 10, 22, dark);
  m.fill((x, y, z) => (y === y1 + 10 && z >= 8 && z < 22 ? (z > 18 || (Math.round(z) % 3 === 0 && hash(Math.round(x), Math.round(z), 9) > 0.35) ? chalk : board) : -1), x1 + 1, y1 + 9, 8, x1 + 10, y1 + 11, 22);
  m.fill((x, y, z) => { const r = Math.hypot(y - (y0 + d / 2), z - 26); return r >= 4.5 && r < 7.5 ? (Math.floor(Math.atan2(z - 26, y - (y0 + d / 2)) / (Math.PI / 4) + 8) % 2 ? ring : ringW) : -1; }, x1, y0 + d / 2 - 8, 18, x1 + 2, y0 + d / 2 + 8, 34);
  return m;
}
// a red plank boathouse (concept D15): board-and-batten walls, a steep shingle roof, the
// boat door in the south gable end (open: the dark inside and the water), a window and a life ring on the side,
// white trim at the corners and round the door. The ridge runs north-south; the south end stands over the water.
export function boathouse(open = 1) {
  const w = 54, d = 62, H = 34, m = new Vox(w + 8, d + 6, H + 30);
  const red = m.mat({ ramp: R('#a8352c'), k: 3, shade: (x, y, z) => (Math.round(x + y) % 6 === 0 ? -1 : 0) + (hash(Math.floor((x + y) / 6), 2, 4) - 0.5) * 0.5 + (z < 3 ? -0.6 : 0) });
  const trim = m.mat({ ramp: R('#ece6da'), k: 3 }), roof = m.mat({ ramp: R('#3e4a46'), k: 3, shade: (x, y, z) => (Math.round(z) % 3 === 0 ? -0.8 : 0) + (hash(Math.round(x / 5), Math.round(z), 8) > 0.85 ? -0.5 : 0) });
  const dark = m.mat({ ramp: R('#1e2226'), k: 1 }), glass = m.mat({ ramp: R('#3a5a6a'), k: 2, flag: F_GLASS, gloss: 0.5, emi: [255, 214, 150, Math.round(30 * open)] });
  const ring = m.mat({ ramp: R('#e8442e'), k: 3 }), ringW = m.mat({ ramp: R('#f2eee6'), k: 3 }), wat = m.mat({ ramp: R('#2a5a6a', 5, 3), k: 2, flag: F_WATER | F_NOCAST });
  const x0 = 4, y0 = 2, x1 = x0 + w, y1 = y0 + d, cx = (x0 + x1) / 2;
  // walls (the gables rise to the ridge), the open boat door in the south end
  m.fill((x, y, z) => {
    const inWall = x < x0 + 3 || x >= x1 - 3 || y < y0 + 3 || y >= y1 - 3;
    if (!inWall) return -1;
    const top = H + Math.max(0, (w / 2 - Math.abs(x - cx)) * 0.85);   // (the gable ends' triangles)
    if (z >= (y < y0 + 3 || y >= y1 - 3 ? top : H)) return -1;
    if (y >= y1 - 3 && Math.abs(x - cx) < 15 && z < 28) return Math.abs(x - cx) > 13 || z > 26 ? trim : -1;   // the door frame
    if (Math.abs(x - x0) < 2.5 && Math.abs(x - x0) >= 0 && (y < y0 + 4 || y >= y1 - 4) || Math.abs(x - x1 + 1) < 2.5 && (y < y0 + 4 || y >= y1 - 4)) return trim;   // corner boards
    return red;
  }, x0, y0, 0, x1, y1, H + 30);
  m.box(cx - 13, y1 - 10, 0, cx + 13, y1 - 3, 26, dark);                     // the dark inside the door
  m.box(cx - 13, y1 - 9, 0, cx + 13, y1 - 3, 2, wat);                        // the water in the slip
  // a window and the life ring on the east side
  m.box(x1 - 1, y0 + 14, 14, x1, y0 + 26, 24, glass); m.box(x1 - 1, y0 + 13, 13, x1, y0 + 27, 14, trim); m.box(x1 - 1, y0 + 13, 24, x1, y0 + 27, 25, trim);
  m.fill((x, y, z) => { const r = Math.hypot(y - (y0 + 40), z - 18); return r >= 4.5 && r < 7.5 ? (Math.floor(Math.atan2(z - 18, y - (y0 + 40)) / (Math.PI / 4) + 8) % 2 ? ring : ringW) : -1; }, x1, y0 + 32, 10, x1 + 2, y0 + 48, 26);
  // the roof: two steep pitches meeting on the ridge along y, eaves out past the walls
  m.fill((x, y, z) => { const top = H + 2 + (w / 2 + 4 - Math.abs(x - cx)) * 0.85; return z >= top - 2.5 && z < top ? roof : -1; }, x0 - 4, y0 - 2, H - 2, x1 + 4, y1 + 3, H + 30);
  return m;
}
// an outdoor shower on a little plank deck: a metal pipe up to a head on an arm, a tap, a slatted base
export function beachShower(run = 1) {
  const m = new Vox(40, 34, 64);
  const deck = m.mat({ ramp: MAT.woodDock, k: 3, shade: (x) => (Math.round(x) % 6 === 0 ? -1.1 : 0) + (hash(Math.floor(x / 6), 2, 5) - 0.5) * 0.6 });
  const post = m.mat({ ramp: MAT.woodDark, k: 3 }), pipe = m.mat({ ramp: MAT.metal, k: 4, flag: F_THIN }), wat = m.mat({ ramp: R('#cfeaf2', 5, 3), k: 3, flag: F_WATER | F_NOCAST });
  m.box(2, 4, 0, 38, 32, 4, deck);
  for (const [x, y] of [[2, 4], [34, 4], [2, 28], [34, 28]]) m.box(x, y, 0, x + 4, y + 4, 5, post);
  m.box(8, 8, 4, 12, 12, 34, post);                                                       // a timber post the pipe is strapped to
  m.box(12, 9, 4, 14, 11, 56, pipe); m.box(12, 9, 54, 26, 11, 56, pipe);                 // the pipe and its arm
  m.ell(26, 10, 53, 4, 4, 1.6, pipe);                                                     // the rose
  m.box(14, 11, 30, 18, 13, 32, pipe);                                                    // the tap
  if (run) for (let k = 0; k < 18; k++) { const x = 23 + hash(k, 1, 9) * 7, y = 7 + hash(k, 2, 9) * 7, z = 8 + hash(k, 3, 9) * 42; m.box(x, y, z, x + 1, y + 1, z + 2, wat); }
  return m;
}
// a driftwood shade: four silvered posts, crossbeams and a lattice of branches over the top, a few shells hung on
// twine (a shady spot to lie on a towel)
export function driftShade(w = 70, d = 50) {
  const H = 40, m = new Vox(w + 8, d + 8, H + 10);
  const dw = m.mat({ ramp: R('#b8aa94', 6, 3, { dark: 0.55 }), k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(y / 2) + Math.round(z / 3), 4) - 0.5) * 0.9 });
  const dk = m.mat({ ramp: R('#7a6a58'), k: 3 }), shell = m.mat({ ramp: R('#f2e2d0'), k: 3 });
  const lean = (x, y, dx, dy) => { for (let z = 0; z < H; z++) { const t = z / H; m.box(x + dx * t, y + dy * t, z, x + dx * t + 3, y + dy * t + 3, z + 1, dw); } };
  lean(3, 3, 2, 1); lean(w + 1, 3, -2, 1); lean(3, d + 1, 1, -2); lean(w + 1, d + 1, -1, -2);
  for (const y of [5, d + 1]) m.box(2, y, H - 2, w + 6, y + 3, H + 1, dw);                // crossbeams east-west
  for (let k = 0; k < 9; k++) {                                                            // branches across the top, every which way
    const y = 6 + hash(k, 1, 7) * (d - 6), a = (hash(k, 2, 7) - 0.5) * 0.7, L = w + 6;
    for (let s = 0; s < L; s += 1) { const x = 2 + s, yy = y + Math.tan(a) * (s - L / 2); if (yy < 2 || yy > d + 4) continue; m.box(x, yy, H + 1 + (k % 2), x + 1, yy + 1.6, H + 2.4 + (k % 2), k % 3 ? dw : dk); }
  }
  for (const [x, y] of [[w * 0.3, 6], [w * 0.62, 6], [w * 0.45, d]]) { m.box(x, y, H - 12, x + 0.6, y + 0.6, H - 2, dk); m.ell(x, y, H - 13, 1.4, 1, 1.6, shell); }
  return m;
}
// wooden steps up the face of a cliff (len deep, rising h to the top at the north end), on two stringers, with a
// post every few steps and a rope rail either side
export function cliffStairs(len = 120, h = 80, w = 28) {
  const m = new Vox(w + 6, len + 4, h + 26);
  const tread = m.mat({ ramp: MAT.woodDock, k: 3, shade: (x, y) => (Math.round(y) % 9 === 0 ? -1.2 : 0) + (hash(Math.floor(y / 9), Math.round(x / 8), 6) - 0.5) * 0.6 });
  const str = m.mat({ ramp: MAT.woodDark, k: 3 }), post = m.mat({ ramp: MAT.woodDark, k: 3, flag: F_THIN }), rope = m.mat({ ramp: R('#d8c49a'), k: 3, flag: F_THIN });
  const zAt = (y) => Math.max(0, (len - y) / len * h);                                    // y 0 = the top (north), len = the foot
  for (let y = 0; y < len; y++) {
    const z = Math.floor(zAt(y) / 6) * 6;                                                 // 6 px risers
    m.box(3, y + 2, Math.max(0, z - 2), w + 3, y + 3, z + 2, tread);
    m.box(1, y + 2, Math.max(0, zAt(y) - 6), 3, y + 3, zAt(y) + 2, str); m.box(w + 3, y + 2, Math.max(0, zAt(y) - 6), w + 5, y + 3, zAt(y) + 2, str);
  }
  for (let y = 4; y < len; y += 22) for (const x of [1, w + 3]) m.box(x, y, zAt(y), x + 2, y + 2, zAt(y) + 20, post);
  for (const x of [1.5, w + 3.5]) for (let y = 4; y < len - 1; y++) { const k = ((y - 4) % 22) / 22, sag = Math.sin(k * Math.PI) * 3; m.box(x, y, zAt(y) + 17 - sag, x + 1, y + 1, zAt(y) + 18.4 - sag, rope); }
  return m;
}
// an old wooden wreck run aground (the Islets): a clinker hull heeled over to port, its bow up the beach (+x), the
// starboard side stove in amidships to show the ribs, the mast snapped off at a stump, weed and barnacles along the
// waterline, the deck's planks sprung. Built along +x; the hull's foot sits at z 0.
export function shipwreck(L = 220, W = 64, Hh = 40, heel = 0.38) {
  const m = new Vox(L + 8, W + 30, Hh + 40), cy = (W + 30) / 2 + 6, c = Math.cos(heel), sn = Math.sin(heel);
  const plank = m.mat({ ramp: R('#6a4a32'), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -1 : 0) + (hash(Math.floor(x / 18), Math.round(z / 4), 61) - 0.5) * 0.8 + (hash(Math.round(x), Math.round(z), 62) > 0.93 ? -0.7 : 0) });
  const rib = m.mat({ ramp: R('#4a3424'), k: 3 }), deck = m.mat({ ramp: R('#8a7458'), k: 3, shade: (x, y) => (Math.round(y) % 5 === 0 ? -1 : 0) + (hash(Math.floor(x / 22), Math.round(y / 5), 63) - 0.5) * 0.9 });
  const weed = m.mat({ ramp: R('#3a5a2a'), k: 3, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.4 });
  const barn = m.mat({ ramp: R('#c8c0b0'), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.2 });
  const dark = m.mat({ ramp: R('#20180f'), k: 1 }), iron = m.mat({ ramp: R('#6a4a3a'), k: 3 });
  // the hull in its own frame (u along, v across, w up) turned by the heel about the keel: a sharp bow, a fuller
  // stern, a sheer that rises to the bow
  const half = (u) => { const t = u / L; return W / 2 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04))), t > 0.6 ? 0.9 : 0.45); };
  const sheer = (u) => Hh * (0.9 + 0.25 * Math.pow(u / L, 3));
  m.fill((x, y, z) => {
    const u = x - 4; if (u < 0 || u > L) return -1;
    const dy = y - cy, v = dy * c + (z + 2) * sn, w = -dy * sn + (z + 2) * c;   // (into the hull's frame)
    const hw = half(u); if (hw < 1) return -1;
    const bottom = Hh * 0.08 + Math.pow(Math.abs(v) / hw, 2) * Hh * 0.55, top = sheer(u);
    if (w < bottom || w > top || Math.abs(v) > hw) return -1;
    const shell = Math.abs(v) > hw - 2.2 || w < bottom + 2.2;
    const stove = v > 0 && u > L * 0.42 && u < L * 0.7 && w > bottom + 4 && w < top - 3 && hash(Math.floor(u / 7), Math.floor(w / 5), 64) > 0.25;   // the hole in the starboard side
    if (shell) { if (stove) return Math.round(u) % 7 < 2 ? rib : -1; if (w < bottom + 2.5) { const h = hash(Math.round(u), Math.round(w), 65); return h > 0.8 ? barn : h > 0.35 ? weed : plank; } return plank; }
    if (w > top - 2) return hash(Math.floor(u / 22), Math.round(v / 5), 66) > 0.18 ? deck : -1;   // the deck, sprung in places
    return stove ? dark : -1;
  }, 0, 0, 0, L + 8, W + 30, Hh + 40);
  // the mast's stump, raked over with the heel; a rusty windlass at the bow
  const mx = 4 + L * 0.42;
  for (let k = 0; k < 22; k++) { const zz = Hh * 0.9 + k, yy = cy - (zz) * sn * 0.9; m.box(mx - 2.5, yy - 2.5, zz * c, mx + 2.5, yy + 2.5, zz * c + 1.5, rib); }
  m.box(4 + L * 0.84, cy - 6 - Hh * sn * 0.9, sheer(L * 0.84) * c, 4 + L * 0.84 + 6, cy + 6 - Hh * sn * 0.9, sheer(L * 0.84) * c + 5, iron);
  return m;
}
