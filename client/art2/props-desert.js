// Art v2 props for the red rock desert's handcrafted places (the nature showcase, 2026-10-31; concepts N4 the canyon
// oasis, NT1-B the desert trailhead, SC3-F the dry wash - shared/redrock.js places them): the trailhead's log-framed
// ranch gate with its fence wings and the gate swung open, the shade ramada's plank roof on its log posts, cairns of
// red stone, a hawk's shadow passing over the ground. Voxel models (voxel.js) unless noted; a sprite is a GBuf anchored
// at its foot (.ax, .ay).
import { Vox } from './voxel.js';
import { GBuf, F_GROUND, F_NOCAST, F_THIN, hash } from './gbuf.js';
import { MAT, ramp, natRamp } from './palette.js';

const R = (c, n = 6, k) => natRamp(c, n, k);   // (nature's ramps: palette.js NAT)
const LOG = R('#7a5a3c'), LOGD = R('#5a3e28'), PIPE = R('#5e6268'), WIRE = R('#8a8a86');

// a ranch gate across a dirt road (along x, w between the posts): two tall log posts, a log crossbeam over them with a
// brace each end and a little sign board hung under it, a tube-steel gate swung open against the east wing, a split
// rail and barbed wire fence running off both sides (wing px each)
export function ranchGate(w = 120, wing = 90) {
  const W = w + wing * 2 + 12, m = new Vox(W, 30, 84), x0 = wing + 6, x1 = x0 + w;
  const log = m.mat({ ramp: LOG, k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(z / 7), 3) - 0.5) * 0.9 + (Math.round(z) % 13 === 0 ? -0.6 : 0) });
  const logD = m.mat({ ramp: LOGD, k: 3, shade: (x, y, z) => (hash(Math.round(x / 6), Math.round(z), 5) - 0.5) * 0.7 });
  const pipe = m.mat({ ramp: PIPE, k: 3 }), wire = m.mat({ ramp: WIRE, k: 2, flag: F_THIN }), board = m.mat({ ramp: R('#b89a6a'), k: 3, shade: (x, y, z) => (Math.round(z) % 3 === 0 ? -0.8 : 0) });
  for (const x of [x0 - 3, x1 - 4]) m.cyl('z', x + 3.5, 14, 0, 3.6, 0, 78, log);
  m.cyl('x', 0, 14, 72, 3.2, x0 - 14, x1 + 10, logD);                          // the crossbeam
  m.box(x0 - 14, 12, 69, x1 + 10, 16, 75, logD);
  for (const [a, s] of [[x0 + 1, 1], [x1 - 1, -1]]) for (let k = 0; k < 14; k++) m.box(a + s * k, 12, 54 + k, a + s * k + 2.4, 16, 56.4 + k, log);   // the braces
  m.box((x0 + x1) / 2 - 16, 13, 50, (x0 + x1) / 2 + 16, 15, 62, board);              // the board
  for (const x of [(x0 + x1) / 2 - 12, (x0 + x1) / 2 + 11]) m.box(x, 13.5, 62, x + 1, 14.5, 69, wire);
  // the gate, swung open: a frame of tube with three rails, hinged on the east post, lying along the east wing (y 22)
  const gx0 = x1 + 2, gL = Math.min(w - 10, wing + 6);
  for (const z of [6, 18, 30, 42]) m.box(gx0, 21, z, gx0 + gL, 23, z + 2, pipe);
  for (const x of [gx0, gx0 + gL - 2, gx0 + gL / 2]) m.box(x, 21, 6, x + 2, 23, 44, pipe);
  for (let k = 0; k < gL; k += 1) { const z = 8 + (k / gL) * 34; if (k % 2 === 0) m.box(gx0 + k, 21.5, z, gx0 + k + 1, 22.5, z + 1, pipe); }   // the diagonal
  // the wings: posts every 30 px, a top rail, two strands of wire
  for (const [a, b] of [[0, x0 - 4], [x1 + 4, W]]) {
    for (let x = a + 2; x < b; x += 30) m.cyl('z', x + 2, 14, 0, 2.3, 0, 34, logD);
    m.box(a, 13, 32, b, 15, 34.5, log);
    for (const z of [12, 22]) m.box(a, 13.5, z, b, 14.5, z + 0.8, wire);
  }
  return m;
}
// a shade ramada (w x d, h to the eaves): four log posts, beams along it, a roof of weathered planks laid across with
// their ends ragged, a little slope to the south
export function ramada(w = 120, d = 80, h = 56) {
  const m = new Vox(w + 8, d + 8, h + 14);
  const log = m.mat({ ramp: LOG, k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(z / 7), 9) - 0.5) * 0.9 });
  const plank = m.mat({ ramp: R('#5e4630'), k: 3, shade: (x, y) => (Math.round(x) % 7 === 0 ? -1.1 : 0) + (hash(Math.floor(x / 7), 1, 11) - 0.5) * 0.9 + (hash(Math.round(x), Math.round(y), 12) > 0.94 ? -0.6 : 0) });
  for (const x of [8, w - 2]) for (const y of [8, d - 2]) m.cyl('z', x, y, 0, 3, 0, h + 2, log);
  for (const y of [8, d - 2]) m.box(2, y - 2.5, h - 2, w + 6, y + 2.5, h + 2, log);
  for (let x = 1; x < w + 7; x++) {
    const rag = Math.floor(hash(Math.floor(x / 7), 3, 13) * 4);
    m.fill((X, y, z) => { const top = h + 2 + (d + 6 - y) * -0.06 + 6; return z >= top - 2.5 && z < top ? plank : -1; }, x, 1 + rag, h, x + 1, d + 7 - (3 - rag), h + 12);
  }
  return m;
}
// a cairn of red stones (the desert's trail markers): k stones, smallest on top
export function redCairn(k = 4, seed = 1) {
  const m = new Vox(16, 16, 6 + k * 5);
  const st = m.mat({ ramp: R('#a85a40'), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.1 });
  let z = 0;
  for (let i = 0; i < k; i++) { const r = 6.5 - i * 1.1, hz = 2.6 + (k - i) * 0.25, ox = (hash(i, 1, seed) - 0.5) * 2, oy = (hash(i, 2, seed) - 0.5) * 2; m.ell(8 + ox, 8 + oy, z + hz, r, r * 0.85, hz, st); z += hz * 1.7; }
  return m;
}
// a hoodoo (NR1-B, NS1-C): a weathered column of sandstone, no two alike - the owner, 11-25 18:14, of the first ones
// (lathe-turned columns under round flat caps, all one size): "very unnatural ... vary the stacks more naturally like
// natural formations and vary the sizes ... not all so uniform and perfectly flat and round". So: built of stacked
// beds of rock, each its own lumpy outline, thickness, tone and a little off the last; the whole leaning; thick or
// thin by its seed; and its top one of four - a tilted slab, a boulder left balanced, a stepped pair of slabs, or no
// cap at all (a spire worn to a point). h: art px to the top (a voxel is a world px, half of one - K).
export const HOODOO = { w: 172, d: 120, kinds: 4 };
export function hoodoo(h = 80, seed = 1) {
  const K = 2, H = Math.round(h * K), W = HOODOO.w, D = HOODOO.d, m = new Vox(W, D, H + 12), cx = W / 2, cy = D / 2 + 6, hw = (k, a = 77) => hash(Math.round(k), seed, a);
  const sh = (x, y, z) => (hash(Math.round(x / 5), Math.round(y / 5), Math.round(z / 3) + seed) - 0.5) * 0.45;
  const tone = ['#c06038', '#cc7444', '#a84c30', '#b65836', '#dc9a68'].map((c) => m.mat({ ramp: R(c), k: 3, shade: sh }));
  const kind = Math.floor(hw(2) * HOODOO.kinds), g = 0.72 + hw(1) * 0.62, capH = kind === 2 ? 0 : (6 + hw(3) * 5) * K, top = H - capH;
  const lx = (hw(4) - 0.5) * 12 * K, ly = (hw(5) - 0.5) * 4 * K, base = (13 + hw(6) * 6) * g, neck = (6 + hw(7) * 4) * g, bAt = 0.25 + hw(8) * 0.35, bulge = hw(9) * 3.5 * g;
  const prof = (t) => (neck + (base - neck) * (1 - t) ** 1.6 + bulge * Math.exp(-(((t - bAt) / 0.18) ** 2))) * (kind === 2 ? 1 - 0.55 * t ** 2.2 : 1);
  const lump = (a, p, n) => 1 + 0.17 * Math.sin(2 * a + p[0]) + 0.11 * Math.sin(3 * a + p[1]) + n * Math.sin(5 * a + p[2]);
  for (let z = 0; z < top;) {   // (bed on bed)
    const z0 = z, z1 = Math.min(top, z + (3.5 + hw(z + 11) * 9) * K), p = [hw(z + 12) * 6.283, hw(z + 13) * 6.283, hw(z + 14) * 6.283], ox = (hw(z + 15) - 0.5) * 3.4 * K, oy = (hw(z + 16) - 0.5) * 2 * K, sc = 0.88 + hw(z + 17) * 0.28, mat = tone[hw(z + 18) < 0.16 ? 4 : Math.floor(hw(z + 19) * 4)];
    m.fill((x, y, zz) => { const t = zz / top, X = x - cx - lx * t - ox, Y = (y - cy - ly * t - oy) / 0.74, r = prof(t) * K * sc * lump(Math.atan2(Y, X), p, 0.07) - (zz - z0 < 1.6 || z1 - zz < 1.6 ? K * 0.7 : 0); return X * X + Y * Y < r * r ? mat : -1; }, 0, 0, Math.floor(z0), W, D, Math.ceil(z1));
    z = z1;
  }
  for (let k = 0; k < 3 + Math.floor(hw(30) * 3); k++) { const a = hw(31 + k) * 6.283, d = base * K * (0.9 + hw(35 + k) * 0.5), r = (2 + hw(40 + k) * 3.5) * K; m.ell(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 0, r, r * 0.8, r * 0.8, tone[2 + (k & 1)]); }   // (fallen rock at its foot)
  if (kind !== 2) {
    const slabs = kind === 3 ? 2 : 1;
    for (let q = 0; q < slabs; q++) {
      const cw = (kind === 1 ? 11 + hw(20) * 4 : 15 + hw(20) * 8) * g * K * (q ? 0.62 : 1), cd = cw * (kind === 1 ? 0.82 : 0.6), tilt = (hw(21 + q) - 0.5) * (kind === 1 ? 0.1 : 0.42), cox = lx + (hw(22 + q) - 0.5) * 7 * K, coy = ly + (hw(23 + q) - 0.5) * 2 * K, p = [hw(24 + q) * 6.283, hw(25 + q) * 6.283, hw(26 + q) * 6.283];
      const zb0 = top - 1 + (q ? capH * 0.55 : 0), th = capH * (q ? 0.5 : kind === 3 ? 0.6 : 1), cm = tone[q ? 1 : hw(27) < 0.5 ? 3 : 0];
      m.fill((x, y, zz) => { const X = x - cx - cox, Y = y - cy - coy, k = lump(Math.atan2(Y / cd, X / cw), p, 0.09), e = Math.hypot(X / (cw * k), Y / (cd * k)); if (e > 1) return -1; const lo = zb0 + X * tilt * 0.6 + (1 - e) * -1.5 * K, hi = zb0 + X * tilt + th * (kind === 1 ? 0.35 + Math.sqrt(1 - e * e) : 1 - 0.3 * e * e * e); return zz >= lo && zz < hi ? (zz < lo + 1.6 * K && e > 0.45 ? tone[2] : cm) : -1; }, 0, 0, Math.floor(top - 8 * K), W, D, H + 12);
    }
  }
  return m;
}
// a tin shack (NS1-C): weathered plank walls under a gable of rust-streaked corrugated iron, a lean-to porch on posts
// at its east end, a door and a window on the front (+y), a stove pipe. A voxel is a world px.
export function tinShack(seed = 1) {
  const K = 1.3, q = (v) => Math.round(v * K), W = q(112), D = q(78), m = new Vox(W, D, q(78)), X0 = q(8), X1 = q(82), Y0 = q(12), Y1 = q(60), WH = q(40), RY = (Y0 + Y1) / 2;
  const plank = m.mat({ ramp: R('#6a5644'), k: 3, shade: (x, y, z) => (Math.round(x + y) % 6 === 0 ? -1 : 0) + (hash(Math.floor((x + y) / 6), Math.round(z / 9), seed) - 0.5) * 0.9 });
  const rusty = (x, y) => { const c = Math.floor(x / 4), t = Math.abs(y - RY) / (RY - Y0 + 5); return t < hash(c, 1, seed + 3) * 0.75 || 1 - t < hash(c, 2, seed + 4) * 0.5 || hash(Math.floor(x / 12), Math.floor(y / 10), seed + 5) > 0.8; };   // (streaks down from the ridge and up from the eaves, a patch here and there)
  const tin = m.mat({ ramp: R('#7e8486'), k: 3, shade: (x) => (Math.round(x) % 4 < 2 ? 0.5 : -0.5) }), rust = m.mat({ ramp: ramp('#7a3c26', 6, 3), k: 3, shade: (x, y) => (Math.round(x) % 4 < 2 ? 0.4 : -0.6) + (hash(Math.round(x), Math.round(y), seed) - 0.5) * 0.5 });
  const dark = m.mat({ ramp: R('#2a221e'), k: 2 }), pane = m.mat({ ramp: R('#39444c'), k: 2 }), post = m.mat({ ramp: LOGD, k: 3 }), pipe = m.mat({ ramp: PIPE, k: 3 });
  const roofZ = (y) => WH + (RY - Y0 + 5 - Math.abs(y - RY)) * 0.72;
  m.fill((x, y, z) => (z < roofZ(y) - 1 ? plank : -1), X0, Y0, 0, X1, Y1, q(70));                                  // (the walls, up into the gable ends)
  m.fill((x, y, z) => { const t = roofZ(y); return z >= t - 1 && z < t + 2 ? (rusty(x, y) ? rust : tin) : -1; }, X0 - 5, Y0 - 6, WH - 8, X1 + 5, Y1 + 6, q(74));   // (the gable roof)
  m.fill((x, y, z) => { const t = WH - 2 - (x - X1) * 0.42; return z >= t - 1 && z < t + 2 ? (rusty(x + 40, y) ? rust : tin) : -1; }, X1, Y0 + 4, q(20), W - 3, Y1 - 4, WH + 2);   // (the lean-to)
  for (const y of [Y0 + 6, Y1 - 7]) m.cyl('z', W - 8, y, 0, 2.5, 0, WH - 15, post);
  m.box(q(34), Y1, 0, q(46), Y1 + 1, q(27), dark); m.box(q(33), Y1, q(27), q(47), Y1 + 1, q(29), post);              // (the door, its lintel)
  m.box(q(56), Y1, q(15), q(70), Y1 + 1, q(28), pane); m.box(q(62), Y1, q(15), q(64), Y1 + 1, q(28), post); m.box(q(55), Y1, q(13), q(71), Y1 + 1, q(15), post);   // (the window, its bar and sill)
  m.cyl('z', q(22), RY - 10, 0, 3, 0, q(72), pipe);
  return m;
}
// a rusted pickup left where it stopped (NS1-C): cab, bed and hood all rust, no glass, the tyres flat. Along x, nose +x.
export function rustPickup(seed = 1) {
  const L = 94, Wd = 42, m = new Vox(L, Wd, 44), y0 = 4, y1 = Wd - 4, cy = Wd / 2;
  const sh = (x, y, z) => (hash(Math.round(x / 6), Math.round(y / 6) + Math.round(z / 5), seed) - 0.5) * 1.1 + (hash(Math.round(x), Math.round(y) + Math.round(z), seed + 2) > 0.92 ? -0.9 : 0);
  const body = m.mat({ ramp: ramp('#74391f', 6, 3), k: 3, shade: sh }), top = m.mat({ ramp: ramp('#84452a', 6, 3), k: 3, shade: sh }), bed = m.mat({ ramp: ramp('#4a2c20', 6, 3), k: 2, shade: sh }),   // (rust on iron is made, not grown: the plain ramp - nature's lifts it to the desert's own orange)
  dark = m.mat({ ramp: R('#1c1716'), k: 1 }), tyre = m.mat({ ramp: R('#34302e'), k: 2 }), rim = m.mat({ ramp: R('#6a4630'), k: 2 });
  m.box(4, y0, 7, 46, y1, 21, body); m.box(7, y0 + 3, 12, 44, y1 - 3, 21, 0); m.box(7, y0 + 3, 11, 44, y1 - 3, 12, bed);   // (the bed, open, its floor in shade)
  m.box(46, y0, 7, 68, y1, 24, body);                                                                                   // (the cab's lower half: the doors)
  m.fill((x, y, z) => (Math.abs(y - cy) < (y1 - y0) / 2 - (z - 24) * 0.25 && x > 47 + (z - 24) * 0.2 && x < 67 - (z - 24) * 0.45 ? (z > 34 ? top : (x < 50 || x > 61 - (z - 24) * 0.45 || (Math.abs(y - cy) > 5 && Math.abs(y - cy) < 8 && x > 58)) ? body : dark) : -1), 46, y0, 24, 68, y1, 37);   // (the greenhouse: pillars, the dark where glass was, the roof)
  m.fill((x, y, z) => { const hw = (y1 - y0) / 2 - 3 - Math.max(0, x - 82) * 0.5; return Math.abs(y - cy) < hw && z < 23 - Math.max(0, x - 80) * 0.35 ? top : -1; }, 68, y0, 7, L - 4, y1, 24);   // (the hood, narrowing and falling to the nose)
  for (const sy of [-1, 1]) m.fill((x, y, z) => (Math.abs(y - (cy + sy * ((y1 - y0) / 2 - 2))) < 2.5 && z < 19 - ((x - 76) / 9) ** 2 * 5 ? body : -1), 66, y0 - 1, 7, L - 5, y1 + 1, 20);   // (the front wings)
  m.box(L - 6, cy - 9, 10, L - 4, cy + 9, 18, dark); for (const sy of [-1, 1]) m.box(L - 7, cy + sy * 13 - 2, 13, L - 5, cy + sy * 13 + 2, 17, dark);   // (the grille, the empty lamp sockets)
  for (const x of [20, L - 19]) for (const y of [y0 - 1, y1 - 4]) { m.cyl('y', x, 0, 6, 7, y, y + 5, tyre, 3, rim); m.box(x - 8, y, 0, x + 8, y + 5, 2, tyre); }   // (flat on their rims)
  return m;
}
// a hawk's shadow on the ground (sprite: soft, dark, flat - its wings spread, a little blurred), w px across
export function hawkShadow(w = 54) {
  const H = Math.round(w * 0.55), G = new GBuf(w + 4, H + 4);
  G.ax = (w + 4) / 2; G.ay = (H + 4) / 2;
  const cx = (w + 4) / 2, cy = (H + 4) / 2;
  for (let y = 0; y < H + 4; y++) for (let x = 0; x < w + 4; x++) {
    const u = (x - cx) / (w / 2), v = (y - cy) / (H / 2), au = Math.abs(u);
    const lead = -0.2 + au * au * 0.55, wing = au < 1 && v > lead - 0.28 * (1 - au * 0.6) && v < lead + 0.26 * (1 - au * 0.7) - (au > 0.8 && hash(Math.floor(x / 2), 1, 7) > 0.5 ? 0.15 : 0);
    const body = ((u / 0.11) * (u / 0.11) + ((v - 0.05) / 0.62) * ((v - 0.05) / 0.62)) < 1, tail = v > 0.45 && v < 0.95 && au < 0.1 + (v - 0.45) * 0.3;
    if (!(wing || body || tail)) continue;
    G.put(x, y, [40, 28, 22], [0, 0, 1], 0, null, F_GROUND | F_NOCAST);
    G.col[(y * G.w + x) * 4 + 3] = 92;
  }
  return G;
}
// a soft shadow on the ground (sprite: an arch's or an overhang's), w x h px
export function groundShadow(w = 200, h = 70) {
  const G = new GBuf(w + 2, h + 2);
  G.ax = (w + 2) / 2; G.ay = (h + 2) / 2;
  for (let y = 0; y < h + 2; y++) for (let x = 0; x < w + 2; x++) {
    const u = (x - G.ax) / (w / 2), v = (y - G.ay) / (h / 2), d = u * u + v * v;
    if (d >= 1) continue;
    G.put(x, y, [34, 20, 18], [0, 0, 1], 0, null, F_GROUND | F_NOCAST);
    G.col[(y * G.w + x) * 4 + 3] = Math.round(165 * Math.min(1, (1 - d) * 2.2));
  }
  return G;
}
export const DESERT_PROPS = { ranchGate, ramada, redCairn, hoodoo, tinShack, rustPickup, hawkShadow, groundShadow, MAT };
