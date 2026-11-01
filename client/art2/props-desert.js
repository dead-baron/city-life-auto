// Art v2 props for the red rock desert's handcrafted places (the nature showcase, 2026-10-31; concepts N4 the canyon
// oasis, NT1-B the desert trailhead, SC3-F the dry wash - shared/redrock.js places them): the trailhead's log-framed
// ranch gate with its fence wings and the gate swung open, the shade ramada's plank roof on its log posts, cairns of
// red stone, a hawk's shadow passing over the ground. Voxel models (voxel.js) unless noted; a sprite is a GBuf anchored
// at its foot (.ax, .ay).
import { Vox } from './voxel.js';
import { GBuf, F_GROUND, F_NOCAST, F_THIN, hash } from './gbuf.js';
import { MAT, ramp } from './palette.js';

const R = (c, n = 6, k) => ramp(c, n, k);
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
export const DESERT_PROPS = { ranchGate, ramada, redCairn, hawkShadow, groundShadow, MAT };
