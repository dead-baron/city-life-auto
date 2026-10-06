// Art v2 interior props as voxel models (voxel.js), for the cut-away rooms (interior.js): the metro
// (turnstiles, a ticket machine, tiled pillars, a busker's amp and guitar case, a tunnel portal with a
// signal), the gym (dumbbell rack, benches, a squat rack, punching bags, a boxing ring, treadmills,
// kettlebells, lockers, a reception desk, a drinks fridge, a medicine ball) and the prison (cells,
// bunks, steel toilets, canteen tables and a serving counter, a control desk, cabinets and a gun
// locker, a catwalk rail, a searchlight tower). Each maker returns a Vox, built along +x.
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);

// ---- metro ---------------------------------------------------------------------------------------------
export function turnstile(on = 1, ok = true) {
  const m = new Vox(10, 26, 30);
  const b = m.mat({ ramp: MAT.metal, k: 3 }), top = m.mat({ ramp: MAT.chrome, k: 3 }), l = m.mat({ ramp: R(ok ? '#40d070' : '#e04040', 5, 3), k: 4, emi: on ? (ok ? [80, 255, 120, 255] : [255, 70, 60, 255]) : null, flag: F_NOCAST });
  m.box(0, 0, 0, 10, 8, 28, b); m.box(0, 0, 28, 10, 8, 30, top); m.box(3, 8, 0, 4, 9, 28, top);
  m.box(2, 2, 22, 8, 7, 25, l);
  for (let k = 0; k < 16; k++) m.box(4, 8 + k, 18, 6, 9 + k, 19, top);
  return m;
}
export function tiledPillar(h = 90, band = '#2a5aa0') {
  const m = new Vox(26, 26, h);
  const t = m.mat({ ramp: R('#e2e0d6'), k: 3, shade: (x, y, z) => (Math.round(z) % 8 === 0 || Math.round(x + y) % 10 === 0 ? -1 : 0) }), b = m.mat({ ramp: R(band), k: 3 });
  const lamp = m.mat({ ramp: R('#f4f4ec', 5, 3), k: 4, emi: [230, 245, 255, 255], flag: F_NOCAST });
  m.box(0, 0, 0, 26, 26, h, t);
  for (const [z0, z1] of [[0, 10], [h * 0.45, h * 0.55], [h - 8, h]]) m.box(0, 0, z0, 26, 26, z1, b);
  m.box(4, 26 - 2, h * 0.62, 22, 26, h * 0.62 + 5, lamp);
  return m;
}
export function amp() { const m = new Vox(14, 10, 16); const b = m.mat({ ramp: R('#2a2a30'), k: 3, shade: (x, y, z) => (y > 8 && Math.hypot(x - 7, z - 8) < 4 ? -1.5 : 0) }); m.box(0, 0, 0, 14, 10, 16, b); return m; }
export function guitarCase(open = true) { const m = new Vox(36, 14, 6); const c = m.mat({ ramp: R('#2a2228'), k: 3 }), lin = m.mat({ ramp: R('#a83040'), k: 3 }); m.fill((x, y, z) => { const r = x < 14 ? 6.5 : x < 24 ? 4.5 : 3; if (Math.abs(y - 7) > r) return -1; return open && z > 2 && Math.abs(y - 7) < r - 1.2 ? lin : c; }); return m; }
// a tunnel mouth in an end wall (a block of wall with an arched opening facing +x), with a signal
export function tunnelPortal(h = 90, w = 70, sig = 'red') {
  const m = new Vox(24, w + 20, h);
  const c = m.mat({ ramp: R('#5a5856'), k: 3, shade: (x, y, z) => (Math.round(z) % 12 === 0 || Math.round(y) % 24 === 0 ? -0.8 : 0) }), dark = m.mat({ ramp: R('#141418', 5, 2), k: 0 });
  const lamp = m.mat({ ramp: R(sig === 'green' ? '#40e070' : '#e83a30', 5, 3), k: 4, emi: sig === 'green' ? [70, 255, 120, 255] : [255, 60, 50, 255], flag: F_NOCAST }), pole = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.fill((x, y, z) => { const cy = (w + 20) / 2, inArch = Math.abs(y - cy) < w / 2 && (z < h * 0.55 || Math.hypot(y - cy, (z - h * 0.55) * 1.2) < w / 2); return inArch ? (x < 6 ? dark : -1) : c; });
  m.box(20, 2, 0, 23, 6, 46, pole); m.box(19, 1, 34, 24, 7, 48, pole); m.box(23, 2, 38, 24, 6, 44, lamp);
  return m;
}
// a metro car (boxy stainless steel, blue stripe, doors that can stand open, lit windows with riders)
export function metroCar(len = 260, open = true, on = 1) {
  const W = 56, m = new Vox(len, W, 62);
  const body = m.mat({ ramp: R('#a8acb4'), k: 3, shade: (x, y, z) => (Math.round(z) % 9 === 0 ? -0.4 : 0) }), stripe = m.mat({ ramp: R('#2a5aa8'), k: 3 }), roof = m.mat({ ramp: R('#8a8e96'), k: 3, shade: (x, y) => (Math.round(y) % 6 === 0 ? -0.6 : 0) });
  const glass = m.mat({ ramp: R('#c8a070', 5, 2), k: 2, emi: [255, 214, 150, 14 + on * 36], flag: F_GLASS, shade: (x, y, z) => (Math.hypot((x % 20) - 10, z - 34) < 4 && hash(Math.floor(x / 20), 0, 7) > 0.35 ? -2.5 : 0) });
  const inside = m.mat({ ramp: R('#d8b880', 5, 2), k: 3, emi: [255, 220, 160, 8 + on * 20] }), vent = m.mat({ ramp: MAT.metalDark, k: 2 });
  const doors = []; for (let x = 30; x < len - 30; x += 70) doors.push(x);
  m.fill((x, y, z) => {
    if (z < 6) return -1;
    if (x < 2 || x > len - 3) return z > 10 ? body : -1;
    const side = y < 1.5 || y > W - 2.5;
    if (!side) return z > 56 ? roof : -1;
    const door = doors.some((dx) => x > dx && x < dx + 22) && z < 48;
    if (door) return open ? (y > W - 2.5 ? inside : body) : (Math.abs(x - (doors.find((dx) => x > dx && x < dx + 22) + 11)) < 0.8 ? vent : z > 26 && z < 44 ? glass : body);
    if (z > 26 && z < 44 && Math.round(x) % 20 > 2) return glass;
    if (z > 18 && z < 23) return stripe;
    return body;
  });
  for (let x = 20; x < len - 20; x += 60) m.box(x, W / 2 - 10, 56, x + 18, W / 2 + 10, 60, vent);
  if (open) for (const dx of doors) m.box(dx, 2, 6, dx + 22, W - 2, 7, inside);
  return m;
}

// ---- gym -----------------------------------------------------------------------------------------------
export function dumbbellRack(len = 90) {
  const m = new Vox(len, 22, 30);
  const f = m.mat({ ramp: MAT.metalDark, k: 3 }), db = m.mat({ ramp: R('#2a2a30'), k: 3 }), chrome = m.mat({ ramp: MAT.chrome, k: 3 });
  for (const x of [2, len - 6, len / 2]) m.box(x, 2, 0, x + 4, 20, 22, f);
  for (const [y, z] of [[4, 14], [12, 22]]) { m.box(0, y, z - 2, len, y + 8, z, f); for (let x = 4; x < len - 6; x += 9) { m.cyl('y', x + 2, 0, z + 3, 3.2 - (x / len), y, y + 2, db); m.cyl('y', x + 2, 0, z + 3, 3.2 - (x / len), y + 6, y + 8, db); m.box(x + 1, y + 2, z + 2, x + 3, y + 6, z + 4, chrome); } }
  return m;
}
export function weightBench(bar = true) {
  const m = new Vox(46, 20, 30);
  const pad = m.mat({ ramp: R('#2a2a30'), k: 3 }), f = m.mat({ ramp: MAT.metal, k: 3 }), plate = m.mat({ ramp: R('#2a2a30'), k: 2 }), chrome = m.mat({ ramp: MAT.chrome, k: 3 });
  m.box(4, 6, 10, 40, 14, 14, pad); for (const x of [6, 36]) m.box(x, 8, 0, x + 3, 12, 10, f);
  if (bar) { for (const y of [2, 16]) m.box(40, y, 0, 43, y + 2, 26, f); m.box(41, -6 + 6, 26, 42, 20, 27, chrome); m.cyl('y', 41.5, 0, 26.5, 7, 0, 3, plate); m.cyl('y', 41.5, 0, 26.5, 7, 17, 20, plate); }
  return m;
}
export function squatRack(bar = true) {
  const m = new Vox(36, 50, 66);
  const f = m.mat({ ramp: R('#2a2c32'), k: 3 }), plate = m.mat({ ramp: R('#2a2a30'), k: 2, shade: (x, y, z) => (Math.abs(Math.hypot(x - 18, z - 40) - 5) < 1 ? 1 : 0) }), chrome = m.mat({ ramp: MAT.chrome, k: 3 });
  for (const [x, y] of [[2, 4], [30, 4], [2, 42], [30, 42]]) m.box(x, y, 0, x + 4, y + 4, 66, f);
  for (const y of [4, 42]) m.box(2, y, 62, 34, y + 4, 66, f);
  for (const x of [2, 30]) m.box(x, 4, 62, x + 4, 46, 66, f);
  if (bar) { m.box(17, 0, 39, 19, 50, 41, chrome); for (const y of [0, 46]) m.cyl('y', 18, 0, 40, 9, y, y + 4, plate); }
  return m;
}
export function punchBag(color = '#2a2a30') {
  const m = new Vox(18, 18, 80);
  const b = m.mat({ ramp: R(color), k: 3 }), c = m.mat({ ramp: MAT.metal, k: 2 }), band = m.mat({ ramp: R('#e8e4d8'), k: 3 });
  m.cyl('z', 9, 9, 0, 7, 20, 58, b); m.ell(9, 9, 20, 7, 7, 3, b); m.ell(9, 9, 58, 7, 7, 3, b); m.box(8, 8, 60, 10, 10, 80, c);
  if (color !== '#2a2a30') m.cyl('z', 9, 9, 0, 7.2, 38, 42, band);
  m.smooth = 1;
  return m;
}
export function boxingRing(size = 150) {
  const m = new Vox(size, size, 46);
  const base = m.mat({ ramp: R('#2a2c34'), k: 3 }), canvas = m.mat({ ramp: R('#2f5aa8'), k: 3, shade: (x, y) => (hash(Math.round(x / 4), Math.round(y / 4), 2) > 0.85 ? -0.6 : 0) });
  const red = m.mat({ ramp: R('#c8343a'), k: 3 }), blue = m.mat({ ramp: R('#2a4aa8'), k: 3 }), rope = m.mat({ ramp: R('#ecebe4'), k: 4 }), skirt = m.mat({ ramp: R('#1e2a5a'), k: 3 });
  m.box(0, 0, 0, size, size, 12, skirt); m.box(4, 4, 12, size - 4, size - 4, 14, canvas);
  for (const [x, y, mt] of [[4, 4, red], [size - 10, 4, blue], [4, size - 10, blue], [size - 10, size - 10, red]]) m.box(x, y, 14, x + 6, y + 6, 46, mt);
  for (const z of [24, 32, 40]) { m.box(6, 6, z, size - 6, 8, z + 1, rope); m.box(6, size - 8, z, size - 6, size - 6, z + 1, rope); m.box(6, 6, z, 8, size - 6, z + 1, rope); m.box(size - 8, 6, z, size - 6, size - 6, z + 1, rope); }
  return m;
}
export function treadmill(on = 1) {
  const m = new Vox(56, 26, 46);
  const b = m.mat({ ramp: R('#2a2c32'), k: 3 }), belt = m.mat({ ramp: R('#1e1e22'), k: 2, shade: (x) => (Math.round(x) % 6 === 0 ? 0.6 : 0) }), s = m.mat({ ramp: R('#4a8ac0'), k: 3, emi: [100, 180, 255, 60 + on * 120] }), rail = m.mat({ ramp: MAT.metal, k: 3 });
  m.box(0, 2, 0, 50, 24, 6, b); m.box(2, 5, 6, 48, 21, 7, belt);
  for (const y of [2, 22]) { m.box(46, y, 6, 49, y + 2, 38, rail); m.box(30, y, 30, 49, y + 2, 32, rail); }
  m.box(46, 4, 36, 54, 22, 46, b); m.box(52, 8, 38, 54, 18, 44, s);
  return m;
}
export function kettlebells(n = 4) { const m = new Vox(n * 9 + 2, 10, 12); const k = m.mat({ ramp: R('#2a2a30'), k: 3 }); for (let i = 0; i < n; i++) { m.ell(i * 9 + 5, 5, 4, 3.6, 3.6, 3.6, k); m.fill((x, y, z) => (Math.abs(Math.hypot(x - i * 9 - 5, z - 8) - 2.4) < 0.7 && Math.abs(y - 5) < 1 ? k : -1), i * 9, 0, 6, i * 9 + 10, 10, 12); } return m; }
export function lockers(n = 5, color = '#5a6a7a') {
  const m = new Vox(n * 14, 16, 54);
  const b = m.mat({ ramp: R(color), k: 3, shade: (x, y, z) => ((Math.round(x) % 14 === 0) ? -1.2 : (y > 14 && Math.round(z) % 34 === 28 && Math.round(x) % 14 > 2 && Math.round(x) % 14 < 11 && Math.round(x) % 2 === 0) ? -1 : 0) });
  m.box(0, 0, 0, n * 14, 16, 54, b);
  return m;
}
export function receptionDesk(len = 90) {
  const m = new Vox(len, 26, 34);
  const w = m.mat({ ramp: MAT.woodDark, k: 3, shade: (x) => (Math.round(x) % 18 === 0 ? -0.8 : 0) }), top = m.mat({ ramp: R('#d8d4c8'), k: 4 }), s = m.mat({ ramp: R('#5a8ab0'), k: 3, emi: [120, 190, 255, 120] }), dk = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.box(0, 14, 0, len, 26, 30, w); m.box(0, 12, 30, len, 26, 33, top); m.box(0, 0, 18, 6, 26, 33, top);
  m.box(len * 0.6, 4, 30, len * 0.6 + 14, 6, 42, dk); m.box(len * 0.6 + 1, 5, 32, len * 0.6 + 13, 6, 41, s);
  return m;
}
export function drinksFridge(on = 1) {
  const m = new Vox(30, 20, 70);
  const b = m.mat({ ramp: R('#2a2c34'), k: 3 }), cans = ['#c8342e', '#2f8a46', '#e8c040', '#2f5aa8', '#e86a3a'].map((c) => m.mat({ ramp: R(c), k: 3 })), g = m.mat({ ramp: R('#b8d8e0', 5, 3), k: 2, emi: [220, 245, 255, 10 + on * 30] });
  m.box(0, 0, 0, 30, 20, 70, b); m.box(3, 19, 4, 27, 20, 64, g);
  for (let z = 8; z < 62; z += 11) for (let x = 4; x < 26; x += 4) m.box(x, 17, z, x + 3, 19, z + 7, cans[(x + z) % 5]);
  return m;
}
export function medBall(color = '#2a5aa8', r = 7) { const m = new Vox(r * 2 + 2, r * 2 + 2, r * 2 + 2); const b = m.mat({ ramp: R(color), k: 3 }); m.ell(r + 1, r + 1, r, r, r, r, b); m.smooth = 2; return m; }

// ---- prison ----------------------------------------------------------------------------------------------
// a cell seen from the corridor: three walls cut low, a barred front (+y) with a door, a bunk and a toilet
export function cell(w = 70, d = 60, open = false) {
  const m = new Vox(w, d, 70);
  const wall = m.mat({ ramp: R('#8a8a86'), k: 3, shade: (x, y, z) => (Math.round(z) % 8 === 0 ? -0.6 : 0) }), bar = m.mat({ ramp: R('#3a3c44'), k: 3 });
  const bunk = m.mat({ ramp: MAT.metal, k: 3 }), mattress = m.mat({ ramp: R('#4a6a4a'), k: 3 }), sheet = m.mat({ ramp: R('#e8e4d8'), k: 3 }), steel = m.mat({ ramp: MAT.chrome, k: 3 });
  m.box(0, 0, 0, w, 6, 70, wall); m.box(0, 0, 0, 6, d, 70, wall); m.box(w - 6, 0, 0, w, d, 70, wall);
  for (let x = 8; x < w - 8; x += 5) { const door = x > w * 0.55 && x < w - 10; if (door && open) continue; m.box(x, d - 4, 0, x + 2, d - 2, 64, bar); }
  m.box(6, d - 4, 62, w - 6, d - 2, 66, bar); m.box(6, d - 4, 30, w - 6, d - 2, 32, bar);
  m.box(8, 8, 14, 46, 26, 16, bunk); m.box(8, 8, 16, 46, 26, 20, mattress); m.box(36, 9, 20, 46, 25, 22, sheet);
  for (const x of [8, 44]) m.box(x, 8, 0, x + 2, 10, 14, bunk);
  m.box(w - 22, 8, 0, w - 10, 20, 12, steel); m.box(w - 22, 8, 12, w - 10, 12, 20, steel);
  return m;
}
export function canteenTable(len = 110) {
  const m = new Vox(len, 50, 20);
  const t = m.mat({ ramp: MAT.metal, k: 4 }), s = m.mat({ ramp: MAT.metal, k: 3 }), tray = m.mat({ ramp: R('#5a6a6a'), k: 3 }), food = ['#d8a040', '#5a9a3a', '#c8504a', '#e8e0c8'].map((c) => m.mat({ ramp: R(c), k: 3 }));
  m.box(4, 16, 16, len - 4, 34, 18, t); for (const x of [10, len - 14]) m.box(x, 22, 0, x + 4, 28, 16, s);
  for (const y of [2, 40]) { m.box(4, y, 9, len - 4, y + 8, 11, s); for (const x of [10, len - 14]) m.box(x, y + 2, 0, x + 4, y + 6, 9, s); }
  for (let x = 12; x < len - 16; x += 24) for (const y of [17, 27]) { m.box(x, y, 18, x + 14, y + 6, 19, tray); m.box(x + 2, y + 1, 19, x + 6, y + 5, 20, food[(x + y) % 4]); m.box(x + 8, y + 1, 19, x + 12, y + 5, 20, food[(x + y + 1) % 4]); }
  return m;
}
export function servingCounter(len = 180, on = 1) {
  const m = new Vox(len, 30, 36);
  const s = m.mat({ ramp: MAT.metal, k: 3 }), glass = m.mat({ ramp: R('#d8f0f4', 5, 3), k: 3, flag: F_GLASS | F_NOCAST }), food = ['#d8a040', '#5a9a3a', '#c8504a', '#e0c070'].map((c) => m.mat({ ramp: R(c), k: 3, emi: [255, 220, 160, 20 + on * 40] }));
  m.box(0, 4, 0, len, 30, 22, s);
  for (let x = 6; x < len - 20; x += 24) m.box(x, 8, 22, x + 20, 24, 24, food[(x / 24 | 0) % 4]);
  m.box(0, 26, 22, len, 30, 26, s); m.box(0, 26, 32, len, 30, 34, glass);
  return m;
}
export function controlDesk(len = 120, on = 1) {
  const m = new Vox(len, 36, 40);
  const b = m.mat({ ramp: R('#3a4a4a'), k: 3 }), top = m.mat({ ramp: R('#5a6a6a'), k: 3, shade: (x, y) => (hash(Math.round(x / 3), Math.round(y / 3), 4) > 0.8 ? 2 : 0) });
  const btn = ['#e83a30', '#40d070', '#e8c040', '#3a8ae8'].map((c) => m.mat({ ramp: R(c, 5, 3), k: 4, emi: [...[[255, 60, 50], [80, 255, 120], [255, 210, 70], [80, 150, 255]][['#e83a30', '#40d070', '#e8c040', '#3a8ae8'].indexOf(c)], 120 + on * 120], flag: F_NOCAST }));
  const scr = m.mat({ ramp: R('#6a9ab8'), k: 3, emi: [140, 200, 240, 80 + on * 120] });
  m.box(0, 10, 0, len, 36, 28, b); m.box(0, 4, 28, len, 36, 30, top);
  for (let x = 6; x < len - 6; x += 7) for (const y of [8, 14]) m.box(x, y, 30, x + 3, y + 3, 31, btn[(x + y) % 4]);
  for (const x of [len * 0.25, len * 0.65]) { m.box(x, 26, 30, x + 22, 30, 44, b); m.box(x + 1, 25, 32, x + 21, 26, 43, scr); }
  return m;
}
export function filingCabinet(color = '#5a6a5a') { const m = new Vox(18, 20, 44); const b = m.mat({ ramp: R(color), k: 3, shade: (x, y, z) => (Math.round(z) % 11 === 0 ? -1 : (y > 18 && Math.abs(x - 9) < 3 && Math.round(z) % 11 === 6) ? 1.5 : 0) }); m.box(0, 0, 0, 18, 20, 44, b); return m; }
export function gunLocker() { const m = new Vox(30, 16, 56); const b = m.mat({ ramp: R('#2e3a2e'), k: 3 }), g = m.mat({ ramp: R('#1a1a1e'), k: 2 }); m.box(0, 0, 0, 30, 16, 56, b); for (let x = 5; x < 26; x += 6) m.box(x, 15, 10, x + 2, 16, 48, g); return m; }
export function officeChair() { const m = new Vox(14, 14, 26); const c = m.mat({ ramp: R('#2a2a30'), k: 3 }), f = m.mat({ ramp: MAT.metalDark, k: 2 }); m.box(6, 6, 0, 8, 8, 12, f); for (const [x, y] of [[1, 6], [11, 6], [6, 1], [6, 11]]) m.box(x, y, 0, x + 2, y + 2, 2, f); m.box(1, 1, 12, 13, 13, 15, c); m.box(1, 1, 15, 13, 3, 26, c); return m; }
export function desk(len = 60) { const m = new Vox(len, 30, 34); const t = m.mat({ ramp: R('#4a5a4a'), k: 3 }), p = m.mat({ ramp: R('#f0eee6'), k: 3 }), mug = m.mat({ ramp: R('#ecebe4'), k: 3 }); m.box(0, 0, 26, len, 30, 28, t); m.box(0, 0, 0, 4, 30, 26, t); m.box(len - 20, 0, 0, len, 30, 26, t); m.box(10, 8, 28, 22, 22, 29, p); m.box(26, 12, 28, 34, 20, 29, p); m.cyl('z', len - 12, 10, 0, 2.5, 28, 33, mug); return m; }
// a searchlight tower for the prison walls: a concrete shaft, a glazed cab and a lamp
export function watchTower(h = 110, on = 1) {
  const m = new Vox(50, 50, h + 40);
  const c = m.mat({ ramp: R('#8a8884'), k: 3, shade: (x, y, z) => (Math.round(z) % 14 === 0 ? -0.6 : 0) }), g = m.mat({ ramp: R('#d8b070', 5, 2), k: 3, flag: F_GLASS, emi: [255, 210, 140, 80 + on * 120] }), rf = m.mat({ ramp: R('#5a5a60'), k: 3 }), l = m.mat({ ramp: R('#fff8e0', 5, 3), k: 4, emi: [255, 248, 220, 255 * on], flag: F_NOCAST });
  m.cyl('z', 25, 25, 0, 16, 0, h, c); m.cyl('z', 25, 25, 0, 22, h, h + 4, c);
  m.fill((x, y, z) => { const d = Math.hypot(x - 25, y - 25); return d < 19 ? (z > h + 6 && z < h + 22 && d > 16 && (Math.round(Math.atan2(y - 25, x - 25) * 4) % 3) ? g : c) : -1; }, 0, 0, h + 4, 50, 50, h + 24);
  m.fill((x, y, z) => (Math.hypot(x - 25, y - 25) < 23 - (z - h - 24) * 1.6 ? rf : -1), 0, 0, h + 24, 50, 50, h + 38);
  m.box(36, 34, h + 12, 44, 42, h + 18, l);
  return m;
}
