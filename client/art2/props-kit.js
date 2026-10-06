// Art v2 prop kit additions from the P1 (town) and P2 (country and leisure) concept sheets: the street
// furniture the districts didn't have yet (vending machine, phone booth, barriers, cable spool, ATM,
// parking meter, twin lamp, bollard variants, a drum on its side, a knocked-over cone) and the country
// set (cell tower, transformer pole, outdoor screen, rural mailbox, barbed and split-rail fences, logs,
// a lifeguard chair, a rowboat, a tackle box with a rod, a dome tent). Each maker returns a Vox built
// with its front facing south (+y), toward the camera, at heading 0.
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, F_LEAF, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);
const glowMat = (m, col, e, k = 4) => m.mat({ ramp: R(col, 5, 3), k, emi: e, flag: F_NOCAST });

// ---- town (P1) --------------------------------------------------------------------------------------
// a drinks vending machine: a lit window of cans in rows, a keypad, the pickup slot
export function vendingMachine(color = '#c8242a', on = 1) {
  const m = new Vox(24, 16, 46);
  const body = m.mat({ ramp: R(color), k: 3 }), dark = m.mat({ ramp: MAT.metalDark, k: 2 });
  const win = m.mat({ ramp: R('#e8eef4', 5, 2), k: 3, emi: [235, 245, 255, 40 + on * 90], flag: F_GLASS });
  const cans = ['#e8402c', '#2f7ad8', '#3aa84a', '#f0c030', '#f08a30', '#8a4ac8'].map((c) => m.mat({ ramp: R(c, 5, 3), k: 4, emi: on ? [255, 240, 220, 40] : null }));
  const pad = glowMat(m, '#8adcff', on ? [140, 220, 255, 200] : null);
  m.box(0, 0, 0, 24, 16, 46, body); m.box(0, 0, 0, 24, 16, 2, dark);
  m.box(2, 15, 12, 17, 16, 43, win);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) m.box(3 + c * 3.5, 15, 15 + r * 5.6, 5 + c * 3.5, 16, 19 + r * 5.6, cans[(r + c * 2) % cans.length]);
  for (let r = 0; r < 5; r++) m.box(2, 15, 14 + r * 5.6, 17, 16, 14.6 + r * 5.6, dark);
  m.box(18, 15, 30, 22, 16, 38, dark); m.box(19, 15, 34, 21, 16, 37, pad); m.box(19, 15, 24, 21, 16, 28, dark);
  m.box(3, 15, 4, 16, 16, 9, dark);
  return m;
}
// a glazed phone booth: corner posts, glass walls, a lit band under the roof, the phone on the back wall
export function phoneBooth(on = 1) {
  const m = new Vox(20, 20, 58);
  const fr = m.mat({ ramp: R('#9aa0a8'), k: 3 }), glass = m.mat({ ramp: MAT.glass, k: 3, flag: F_GLASS });
  const band = glowMat(m, '#e8f4e8', on ? [230, 250, 220, 220] : [0, 0, 0, 0]), ph = m.mat({ ramp: R('#3a3e46'), k: 2 }), floor = m.mat({ ramp: MAT.concrete, k: 3 });
  const lamp = glowMat(m, '#fff0c0', on ? [255, 220, 150, 160] : null);
  m.box(0, 0, 0, 20, 20, 2, floor);
  for (const [x, y] of [[0, 0], [18, 0], [0, 18], [18, 18]]) m.box(x, y, 2, x + 2, y + 2, 54, fr);
  m.box(2, 0, 4, 18, 1, 50, glass); m.box(0, 2, 4, 1, 18, 50, glass); m.box(19, 2, 4, 20, 18, 50, glass); m.box(2, 19, 4, 18, 20, 50, glass);
  m.box(0, 0, 50, 20, 20, 54, fr); m.box(1, 19, 50, 19, 20, 53, band); m.box(0, 0, 54, 20, 20, 58, fr);
  m.box(6, 1, 26, 14, 4, 40, ph); m.box(8, 3, 34, 12, 5, 38, ph); m.box(5, 2, 48, 15, 18, 49, lamp);
  return m;
}
// a concrete jersey barrier, optionally painted with red and white diagonal stripes
export function jerseyBarrier(len = 48, striped = true) {
  const m = new Vox(len, 14, 18);
  const c = m.mat({ ramp: R('#c8c2b6'), k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(z / 2), 5) > 0.85 ? -0.7 : 0) });
  const red = m.mat({ ramp: R('#c8342a'), k: 3 }), wh = m.mat({ ramp: R('#ece8e0'), k: 3 });
  m.fill((x, y, z) => { const half = z < 4 ? 7 : z < 8 ? 7 - (z - 4) * 0.9 : 3.4 - (z - 8) * 0.06; if (Math.abs(y - 7) > half) return -1; if (striped && z > 4 && z < 17 && (x < 2 || x > len - 2 ? false : true)) return ((x + z) % 18 < 9) ? red : wh; return c; });
  m.box(6, 0, 0, 10, 14, 2, 0); m.box(len - 10, 0, 0, len - 6, 14, 2, 0);
  return m;
}
// a sawhorse road barricade: A-frame legs, a striped board, amber blinkers on top
export function sawhorse(on = 1) {
  const m = new Vox(42, 12, 30);
  const leg = m.mat({ ramp: R('#ece8e0'), k: 3 }), red = m.mat({ ramp: R('#e0602a'), k: 3 }), wh = m.mat({ ramp: R('#f0ece4'), k: 3 });
  const amber = glowMat(m, '#f8b030', on ? [255, 170, 50, 255] : [255, 170, 50, 60]), blk = m.mat({ ramp: MAT.metalDark, k: 2 });
  for (const x of [4, 36]) for (let z = 0; z < 22; z++) { const off = (22 - z) * 0.2; m.box(x, 6 - 1 - off, z, x + 2, 6 + 1 - off, z + 1, leg); m.box(x, 6 - 1 + off, z, x + 2, 6 + 1 + off, z + 1, leg); }
  m.fill((x, y, z) => ((x + z) % 12 < 6 ? red : wh), 1, 7, 14, 41, 9, 22);
  m.fill((x, y, z) => ((x + z) % 12 < 6 ? red : wh), 1, 7, 4, 41, 8, 8);
  for (const x of [2, 36]) { m.box(x, 6, 22, x + 4, 8, 24, blk); m.ell(x + 2, 7, 26, 2.4, 2.4, 2.6, amber); }
  return m;
}
// a wooden cable reel standing on its edge, black cable wound round the core
export function cableSpool() {
  const m = new Vox(24, 18, 26);
  const wood = m.mat({ ramp: R('#a8845a'), k: 3, shade: (x, y, z) => (Math.round(x - z * 0.3) % 5 === 0 ? -0.8 : 0) }), cab = m.mat({ ramp: R('#2a2a30'), k: 2, shade: (x, y, z) => (Math.round(z + x * 0.2) % 3 === 0 ? 0.7 : 0) });
  const bolt = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.cyl('y', 12, 0, 12, 12, 0, 3, wood); m.cyl('y', 12, 0, 12, 12, 15, 18, wood); m.cyl('y', 12, 0, 12, 8.5, 3, 15, cab);
  m.cyl('y', 12, 0, 12, 2.4, 17, 18, 0); m.cyl('y', 12, 0, 12, 1.4, 14, 18, bolt);
  for (const a of [0.5, 2.1, 3.7, 5.3]) m.box(12 + Math.cos(a) * 8, 17, 12 + Math.sin(a) * 8, 13 + Math.cos(a) * 8, 18, 13 + Math.sin(a) * 8, bolt);
  return m;
}
// a cash machine set into a short brick wall with a stone surround and a lit screen
export function atmWall(on = 1) {
  const m = new Vox(36, 12, 52);
  const brick = m.mat({ ramp: MAT.brick, k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 || (Math.round(x + (Math.floor(z / 4) % 2) * 3) % 7 === 0) ? -1 : 0) });
  const stone = m.mat({ ramp: R('#b8b0a2'), k: 3 }), steel = m.mat({ ramp: R('#9aa0a8'), k: 3 }), dark = m.mat({ ramp: MAT.metalDark, k: 2 });
  const scr = glowMat(m, '#6ac8f0', on ? [120, 210, 255, 230] : [60, 120, 160, 60]), keys = m.mat({ ramp: R('#d8d8d0'), k: 3 }), cap = m.mat({ ramp: R('#2f6a4e'), k: 3 });
  m.box(0, 0, 0, 36, 10, 50, brick); m.box(0, 0, 48, 36, 12, 52, stone); m.box(0, 0, 0, 36, 12, 4, stone);
  m.box(7, 9, 6, 29, 12, 44, stone); m.box(9, 10, 8, 27, 12, 40, steel); m.box(9, 10, 40, 27, 12, 44, cap);
  m.box(12, 11, 28, 24, 12, 37, scr); m.box(12, 11, 18, 24, 12, 25, dark);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) m.box(13 + c * 3, 11, 19 + r * 2, 15 + c * 3, 12, 20 + r * 2, keys);
  m.box(13, 11, 12, 23, 12, 14, dark);
  return m;
}
// a single parking meter on a post
export function parkingMeter(on = 1) {
  const m = new Vox(8, 8, 34);
  const p = m.mat({ ramp: MAT.metalDark, k: 2 }), head = m.mat({ ramp: R('#5a6068'), k: 3 }), red = glowMat(m, '#e8402c', on ? [255, 70, 50, 220] : null);
  const win = m.mat({ ramp: MAT.glass, k: 3, flag: F_GLASS });
  m.cyl('z', 4, 4, 0, 2.6, 0, 2, p); m.cyl('z', 4, 4, 0, 1.2, 2, 24, p);
  m.ell(4, 4, 28, 3.6, 3.2, 5.5, head); m.box(2, 6, 28, 6, 8, 31, win); m.box(3, 6, 25, 5, 8, 26, red);
  return m;
}
// a lamp post with two arms (boulevard style)
export function twinLamp(on = 0) {
  const m = new Vox(46, 12, 98);
  const pole = m.mat({ ramp: R('#3a3e44'), k: 2 }), glass = glowMat(m, '#f4d9a0', on ? [255, 205, 130, 255] : null, 3);
  m.cyl('z', 23, 6, 0, 4, 0, 8, pole); m.cyl('z', 23, 6, 0, 2, 8, 88, pole);
  m.box(4, 5, 86, 42, 7, 89, pole);
  for (const x of [2, 34]) { m.box(x, 3, 82, x + 10, 9, 86, pole); m.box(x + 1, 4, 81, x + 9, 8, 82, glass); }
  return m;
}
// bollards: 'concrete' (pale post with a domed top), 'banded' (black with yellow bands), 'cast' (old iron)
export function bollardKind(kind = 'banded') {
  const m = new Vox(8, 8, 20);
  if (kind === 'concrete') { const c = m.mat({ ramp: R('#c8c2b6'), k: 3 }); m.cyl('z', 4, 4, 0, 3.6, 0, 15, c); m.ell(4, 4, 15, 3.6, 3.6, 2.6, c); m.cyl('z', 4, 4, 0, 3.8, 13, 14, m.mat({ ramp: R('#9a948a'), k: 3 })); }
  else if (kind === 'cast') { const c = m.mat({ ramp: R('#2a2e34'), k: 3 }); m.cyl('z', 4, 4, 0, 3.6, 0, 3, c); m.fill((x, y, z) => (Math.hypot(x - 4, y - 4) < 2.6 - (z - 3) * 0.06 + (z > 14 ? 0.8 : 0) ? c : -1), 0, 0, 3, 8, 8, 17); m.ell(4, 4, 17, 2.6, 2.6, 2.4, c); }
  else { const b = m.mat({ ramp: R('#26282e'), k: 3 }), y = m.mat({ ramp: R('#e8b830'), k: 3 }); m.cyl('z', 4, 4, 0, 3.4, 0, 17, b); m.ell(4, 4, 17, 3.4, 3.4, 2.4, b); for (const z of [9, 13]) m.cyl('z', 4, 4, 0, 3.5, z, z + 2, y); }
  return m;
}
// an oil drum lying on its side
export function drumSide(color = '#3a6a4a') {
  const m = new Vox(18, 13, 13);
  const b = m.mat({ ramp: R(color), k: 3, shade: (x, y, z) => (Math.round(x) % 6 === 0 ? -0.8 : 0) + (hash(Math.round(x), Math.round(z), 3) > 0.8 ? -0.6 : 0) }), rim = m.mat({ ramp: R('#5a3a2a'), k: 3 });
  m.cyl('x', 0, 6.5, 6.5, 6.2, 0, 18, b); m.cyl('x', 0, 6.5, 6.5, 6.4, 0, 1, rim); m.cyl('x', 0, 6.5, 6.5, 6.4, 17, 18, rim);
  return m;
}
// a traffic cone knocked over
export function coneDown() {
  const m = new Vox(18, 12, 10);
  const o = m.mat({ ramp: R('#e8642a'), k: 3, shade: (x) => (x > 8 && x < 11 ? 2.5 : 0) }), b = m.mat({ ramp: R('#2a2a2e'), k: 2 });
  m.box(0, 1, 0, 2, 11, 10, b);
  m.fill((x, y, z) => (Math.hypot(y - 6, z - 5) < 4.6 - x * 0.24 ? o : -1), 2, 0, 0, 18, 12, 10);
  return m;
}

// ---- country and leisure (P2) ------------------------------------------------------------------------
// a dome tent: a rounded shell with a lighter flysheet panel and a dark open door
export function domeTent(color = '#3a7a3a', seed = 1) {
  const m = new Vox(36, 30, 22);
  const shell = m.mat({ ramp: R(color), k: 3, shade: (x, y, z) => (Math.abs(x - 18 - (y - 15) * 0.6) < 1 || Math.abs(x - 18 + (y - 15) * 0.6) < 1 ? -1.2 : 0) });
  const fly = m.mat({ ramp: R(seed % 2 ? '#e8e4d8' : '#2a3a5a'), k: 3 }), door = m.mat({ ramp: R('#2a2a2e'), k: 2 }), peg = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.fill((x, y, z) => { const q = ((x - 18) / 17) ** 2 + ((y - 15) / 14) ** 2 + (z / 21) ** 2; if (q > 1) return -1; if (q < 0.86) return 0; if (y > 22 && Math.abs(x - 18) < 6 - (z / 21) * 4 && z < 15) return door; return Math.abs(x - 18) < 7 && y > 15 ? fly : shell; });
  for (const [x, y] of [[1, 15], [35, 15], [18, 1], [18, 29], [4, 4], [32, 26]]) m.box(x, y, 0, x + 1, y + 1, 2, peg);
  return m;
}
// a lattice cell tower: red and white steel legs tapering up, antenna panels and dishes near the top
export function cellTower(h = 150) {
  const m = new Vox(30, 30, h + 6);
  const red = m.mat({ ramp: R('#c8342a'), k: 2 }), wh = m.mat({ ramp: R('#ece8e0'), k: 2 }), pan = m.mat({ ramp: R('#d8d8d0'), k: 3 }), base = m.mat({ ramp: MAT.concrete, k: 3 }), box = m.mat({ ramp: R('#9aa0a6'), k: 3 });
  const lamp = glowMat(m, '#ff4030', [255, 60, 40, 255]);
  m.box(2, 2, 0, 28, 28, 4, base); m.box(20, 20, 4, 28, 27, 16, box);
  const col = (z) => (Math.floor(z / 14) % 2 ? wh : red);
  for (let z = 4; z < h; z++) {
    const t = (z - 4) / (h - 4), half = 11 - t * 7, c = 15;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.box(c + sx * half - 1, c + sy * half - 1, z, c + sx * half + 1, c + sy * half + 1, z + 1, col(z));
    if (z % 14 < 1) { m.box(c - half, c - half, z, c + half, c - half + 1, z + 1, col(z)); m.box(c - half, c + half - 1, z, c + half, c + half, z + 1, col(z)); m.box(c - half, c - half, z, c - half + 1, c + half, z + 1, col(z)); m.box(c + half - 1, c - half, z, c + half, c + half, z + 1, col(z)); }
    const ph = (z % 14) / 14;
    m.box(c - half + ph * 2 * half - 0.5, c + half - 1, z, c - half + ph * 2 * half + 0.5, c + half, z + 1, col(z));
  }
  for (const [x, y] of [[8, 13], [20, 13], [13, 7], [13, 20]]) m.box(x, y, h - 22, x + 3, y + 3, h - 6, pan);
  m.cyl('y', 9, 22, h - 34, 3.6, 22, 24, pan); m.cyl('x', 22, 15, h - 40, 3.2, 22, 24, pan);
  m.cyl('z', 15, 15, 0, 1, h - 4, h + 4, wh); m.box(14, 14, h + 4, 16, 16, h + 6, lamp);
  return m;
}
// a wooden power pole with a crossarm, insulators and a can transformer
export function transformerPole(h = 110) {
  const m = new Vox(40, 12, h + 6);
  const wood = m.mat({ ramp: R('#7a5a3a'), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(z / 3), 3) > 0.8 ? -0.6 : 0) }), ins = m.mat({ ramp: R('#d8dcd8'), k: 3 }), can = m.mat({ ramp: R('#9aa0a6'), k: 3 }), dk = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.cyl('z', 20, 6, 0, 2.8, 0, h, wood);
  m.box(2, 5, h - 10, 38, 8, h - 6, wood);
  for (const x of [4, 12, 28, 36]) m.cyl('z', x, 6.5, 0, 1.4, h - 6, h - 2, ins);
  m.cyl('z', 20, 6.5, 0, 1.4, h, h + 4, ins);
  m.cyl('z', 25, 6, 0, 4.2, h - 40, h - 24, can); m.box(23, 4, h - 24, 27, 8, h - 22, dk); m.box(21, 5, h - 34, 23, 7, h - 32, dk);
  return m;
}
// a drive-in / outdoor movie screen: a white sheet on a timber frame over a plank skirt, speakers at the feet
export function outdoorScreen(w = 120, h = 56) {
  const m = new Vox(w + 16, 12, h + 26);
  const sheet = m.mat({ ramp: R('#ece8e0'), k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(z / 3), 4) > 0.9 ? -0.4 : 0) });
  const post = m.mat({ ramp: R('#6a4a30'), k: 3 }), plank = m.mat({ ramp: R('#8a6440'), k: 3, shade: (x) => (Math.round(x) % 6 === 0 ? -0.8 : 0) }), sp = m.mat({ ramp: R('#2a2a30'), k: 2 }), cone = m.mat({ ramp: R('#4a4a52'), k: 2 });
  for (const x of [6, w + 8]) m.box(x, 4, 0, x + 3, 8, h + 24, post);
  m.box(8, 6, 0, w + 8, 8, 18, plank);
  m.box(9, 6, 20, w + 8, 7, h + 22, sheet); m.box(8, 5, h + 22, w + 9, 8, h + 24, post); m.box(8, 5, 18, w + 9, 8, 20, post);
  for (const x of [0, w + 6]) { m.box(x, 4, 0, x + 10, 12, 16, sp); m.cyl('y', x + 5, 11, 10, 3, 11, 12, cone); m.cyl('y', x + 5, 11, 4, 2, 11, 12, cone); }
  return m;
}
// a rural mailbox on a post, flag up
export function ruralMailbox(flag = true) {
  const m = new Vox(10, 18, 34);
  const post = m.mat({ ramp: R('#7a5a3a'), k: 3 }), box = m.mat({ ramp: R('#d8d8d4'), k: 3 }), red = m.mat({ ramp: R('#c8342a'), k: 3 });
  m.box(3, 7, 0, 7, 11, 24, post);
  m.fill((x, y, z) => (y > 1 && y < 17 && (Math.abs(x - 5) < 4.5 && (z < 30 ? z > 24 : Math.hypot(x - 5, z - 30) < 4.5)) ? box : -1), 0, 0, 24, 10, 18, 34);
  if (flag) { m.box(9, 6, 26, 10, 8, 34, red); m.box(9, 6, 31, 10, 11, 34, red); }
  return m;
}
// fences along x: 'barbed' (posts and three strands of barbed wire), 'rail' (split rail)
export function fenceKind(kind = 'barbed', len = 60) {
  const m = new Vox(len, 6, 26);
  const post = m.mat({ ramp: R('#6a4a30'), k: 3 }), wire = m.mat({ ramp: R('#6a6a70'), k: 2, flag: F_NOCAST }), rail = m.mat({ ramp: R('#8a6440'), k: 3, shade: (x) => (hash(Math.round(x / 4), 1, 3) > 0.8 ? -0.6 : 0) });
  if (kind === 'rail') { for (const x of [1, len - 5]) m.box(x, 1, 0, x + 4, 5, 22, post); for (const z of [8, 16]) m.box(0, 2, z, len, 4, z + 3, rail); return m; }
  for (const x of [1, len - 4]) m.box(x, 2, 0, x + 3, 5, 24, post);
  for (const z of [8, 14, 20]) for (let x = 0; x < len; x++) { m.set(x, 3, z, wire); if (x % 5 === 0) { m.set(x, 2, z + 1, wire); m.set(x, 4, z - 1, wire); m.set(x + 1, 3, z + 1, wire); } }
  return m;
}
// a pile of cut logs (or a single mossy fallen log)
export function logs(kind = 'pile') {
  const m = new Vox(52, 22, 16);
  const bark = m.mat({ ramp: R('#5a4030'), k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(z), 7) > 0.75 ? -0.8 : 0) }), end = m.mat({ ramp: R('#c8a070'), k: 3, shade: (x, y, z) => (Math.round(Math.hypot(y, z) * 0.9) % 2 ? -0.5 : 0) });
  const moss = m.mat({ ramp: MAT.leaf, k: 3, flag: F_LEAF });
  if (kind === 'fallen') { m.cyl('x', 0, 11, 7, 6.5, 0, 50, bark); m.cyl('x', 0, 11, 7, 6.5, 0, 1, end); m.fill((x, y, z) => { const d = Math.hypot(y - 11, z - 7); return d < 7.4 && d > 5.6 && z > 8 && hash(Math.round(x / 2), Math.round(y / 2), 9) > 0.45 ? moss : -1; }, 0, 3, 8, 50, 19, 15); m.box(30, 2, 6, 40, 6, 9, bark); return m; }
  for (const [y, z, x0, x1] of [[5, 4, 2, 48], [16, 4, 0, 46], [11, 11, 4, 50]]) { m.cyl('x', 0, y, z, 4.6, x0, x1, bark); m.cyl('x', 0, y, z, 4.4, x0, x0 + 1, end); m.cyl('x', 0, y, z, 4.4, x1 - 1, x1, end); }
  return m;
}
// a tall white lifeguard chair with a red seat and a ring buoy hung on the side
export function lifeguardChair() {
  const m = new Vox(22, 22, 52);
  const wh = m.mat({ ramp: R('#ece8e0'), k: 3 }), red = m.mat({ ramp: R('#d83a30'), k: 3 }), ring = m.mat({ ramp: R('#e8e4dc'), k: 3, shade: (x, y, z) => (Math.round(Math.atan2(z - 26, y - 11) * 2) % 2 ? 0 : -3) });
  for (const [x, y] of [[2, 2], [18, 2], [2, 18], [18, 18]]) m.box(x, y, 0, x + 2, y + 2, 34, wh);
  for (const z of [8, 16, 24]) m.box(2, 18, z, 20, 20, z + 2, wh);
  m.box(1, 1, 32, 21, 21, 35, wh); m.box(4, 3, 35, 18, 15, 38, red); m.box(4, 2, 38, 18, 4, 52, red); for (const x of [3, 18]) m.box(x, 3, 35, x + 1, 15, 46, wh);
  m.fill((x, y, z) => { const d = Math.hypot(y - 11, z - 24); return x > 20 && d < 6 && d > 3.4 ? ring : -1; }, 20, 4, 17, 22, 18, 31);
  return m;
}
// a small wooden rowboat with seats and oars, built along x
export function rowboat(color = '#2f5a8a') {
  const m = new Vox(54, 22, 14);
  const hull = m.mat({ ramp: R('#ece8e0'), k: 3 }), stripe = m.mat({ ramp: R(color), k: 3 }), wood = m.mat({ ramp: MAT.woodDock, k: 3, shade: (x, y) => (Math.round(y) % 4 === 0 ? -0.7 : 0) }), oar = m.mat({ ramp: R('#a8865a'), k: 3 });
  m.fill((x, y, z) => { const t = x / 54, half = 10 * Math.sqrt(Math.max(0, 1 - ((t - 0.45) / 0.55) ** 2)) * (t > 0.9 ? 1 - (t - 0.9) * 6 : 1); const dz = Math.abs(y - 11) / (half || 1); if (Math.abs(y - 11) > half || z > 11 + (t > 0.85 ? 2 : 0)) return -1; if (z < dz * 4) return -1; const shell = Math.abs(y - 11) > half - 1.5 || z < dz * 4 + 1.5; return shell ? (z > 7 && z < 10 ? stripe : hull) : z < 3 ? wood : 0; });
  for (const x of [14, 28, 40]) m.box(x, 3, 7, x + 4, 19, 8, wood);
  m.box(18, 4, 9, 46, 6, 10, oar); m.box(42, 3, 9, 48, 7, 10, oar); m.box(16, 15, 9, 44, 17, 10, oar); m.box(40, 14, 9, 46, 18, 10, oar);
  return m;
}
// a green tackle box (lid open on lures) and a fishing rod laid against it
export function tackleBox() {
  const m = new Vox(30, 16, 22);
  const g = m.mat({ ramp: R('#3a6a3a'), k: 3 }), tray = m.mat({ ramp: R('#2a4a2a'), k: 2 }), lures = ['#e8402c', '#f0c030', '#e8e4dc', '#2f7ad8'].map((c) => m.mat({ ramp: R(c, 5, 3), k: 4 }));
  const rod = m.mat({ ramp: R('#2a2a30'), k: 2 }), reel = m.mat({ ramp: MAT.metal, k: 3 }), cork = m.mat({ ramp: R('#c8a070'), k: 3 }), bob = m.mat({ ramp: R('#e8402c'), k: 3 });
  m.box(0, 4, 0, 16, 16, 8, g); m.box(1, 5, 8, 15, 15, 9, tray);
  for (let i = 0; i < 6; i++) m.box(2 + (i % 3) * 4, 6 + Math.floor(i / 3) * 4, 9, 4 + (i % 3) * 4, 8 + Math.floor(i / 3) * 4, 10, lures[i % 4]);
  m.box(0, 2, 8, 16, 4, 18, g);
  for (let k = 0; k < 22; k++) m.box(20 + k * 0.35, 10, k, 22 + k * 0.35, 12, k + 1, k < 6 ? cork : rod);
  m.cyl('y', 22.5, 9, 4, 2.4, 8, 10, reel); m.ell(28, 13, 3, 1.8, 1.8, 1.8, bob);
  return m;
}

// ---- planting (P3) ----------------------------------------------------------------------------------
// a patch of tall meadow grass with wildflowers
export function meadow(w = 60, d = 30, seed = 1, flowers = ['#f0f0e8', '#e8c040', '#b88ad8', '#e87a9a'], hk = 1) {
  const m = new Vox(w, d, 18);
  const g = m.mat({ ramp: MAT.leaf, k: 3, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), 3) > 0.7 ? 0.9 : 0) - (z < 4 ? 1 : 0) });
  const fl = flowers.map((c) => m.mat({ ramp: R(c, 5, 3), k: 4, flag: F_LEAF }));
  for (let y = 1; y < d - 1; y += 1.6) for (let x = 1; x < w - 1; x += 1.6) {
    const e = Math.min(x, w - x, y, d - y) / 6;                                                    // ragged, lower edges
    if (e < 1 && hash(Math.round(x * 9), Math.round(y * 9), seed + 6) > e + 0.2) continue;
    const jx = x + (hash(Math.round(x * 3), Math.round(y * 3), seed) - 0.5) * 1.4, h = (7 + hash(Math.round(x * 5), Math.round(y * 5), seed + 1) * 9) * Math.min(1, 0.45 + e * 0.55) * hk, lean = (hash(Math.round(x), Math.round(y), seed + 2) - 0.5) * 3;
    for (let z = 0; z < h; z++) m.set(jx + lean * z / h, y, z, g);
    if (hash(Math.round(x * 7), Math.round(y * 7), seed + 3) > 0.9) m.box(jx + lean - 0.5, y - 0.5, h - 1, jx + lean + 1.5, y + 1.5, h + 1, fl[Math.floor(hash(Math.round(x), Math.round(y), seed + 4) * fl.length)]);
  }
  return m;
}
// a block of ripe wheat: dense golden stalks with drooping heads
export function wheatPatch(w = 60, d = 30, seed = 1) {
  const m = new Vox(w, d, 22);
  const st = m.mat({ ramp: R('#c8a040'), k: 3, flag: F_LEAF, shade: (x, y, z) => (z < 6 ? -1 : 0) }), hd = m.mat({ ramp: R('#e8c060'), k: 3, flag: F_LEAF, shade: (x, y, z) => (Math.round(z) % 2 ? -0.6 : 0.3) });
  for (let y = 1; y < d - 1; y += 1.5) for (let x = 1; x < w - 1; x += 1.5) {
    const h = 14 + hash(Math.round(x * 4), Math.round(y * 4), seed) * 5, lean = (hash(Math.round(x), Math.round(y * 2), seed + 1) - 0.3) * 2;
    for (let z = 0; z < h; z++) m.set(x + lean * z / h, y, z, st);
    m.box(x + lean, y, h, x + lean + 1, y + 1, h + 4, hd);
  }
  return m;
}
// rows of cabbages on dark soil
export function cabbages(cols = 3, rows = 3) {
  const m = new Vox(cols * 16 + 4, rows * 16 + 4, 12);
  const soil = m.mat({ ramp: R('#5a3a24'), k: 3, shade: (x, y) => (hash(Math.round(x), Math.round(y), 4) > 0.75 ? -0.8 : 0) });
  const leaf = m.mat({ ramp: R('#5a8a5a'), k: 3, flag: F_LEAF, shade: (x, y, z) => (Math.round(Math.atan2(y % 16 - 8, x % 16 - 8) * 3 + z) % 3 === 0 ? -0.9 : 0) }), heart = m.mat({ ramp: R('#a8c88a'), k: 3, flag: F_LEAF });
  m.box(0, 0, 0, m.w, m.d, 2, soil);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = 10 + c * 16, y = 10 + r * 16; m.ell(x, y, 5, 7, 7, 5, leaf); m.ell(x, y, 7, 3.6, 3.6, 3.6, heart); }
  return m;
}
// a prickly pear: flat oval pads stacked at angles, red fruit on the rims
export function pricklyPear(seed = 1) {
  const m = new Vox(30, 14, 30);
  const pad = m.mat({ ramp: R('#6a9a5a'), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(z), seed) > 0.88 ? 1.2 : 0) }), fr = m.mat({ ramp: R('#c8344a'), k: 3 });
  const pads = [[15, 9, 6, 0], [9, 19, 6, -0.5], [21, 18, 6, 0.6], [6, 26, 4.5, -0.3], [24, 26, 4.5, 0.4], [15, 25, 5, 0.1]];
  for (const [x, z, r, a] of pads) { m.fill((px, py, pz) => { const u = (px - x) * Math.cos(a) + (pz - z) * Math.sin(a), v = -(px - x) * Math.sin(a) + (pz - z) * Math.cos(a); return Math.abs(py - 7) < 1.6 && (u / (r * 0.75)) ** 2 + (v / r) ** 2 <= 1 ? pad : -1; }); m.ell(x - Math.sin(a) * r, 7, z + Math.cos(a) * r, 1.4, 1.4, 1.6, fr); }
  return m;
}
