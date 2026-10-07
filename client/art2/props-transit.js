// Art v2 transit, port and industrial props as voxel models (voxel.js): tram catenary, shipping
// containers, freight wagons, a gantry crane, forklifts, mooring bollards, cones, gangways, pipework,
// storage tanks, floodlight masts, transit stop poles and bike racks. Each maker returns a Vox, built
// along +x (render at heading PI/2 to run it north-south).
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, F_THIN, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);

// a catenary mast with an arm reaching over the track (arm along +y). Contact wire hangs at z = 70.
export function catenaryPole(arm = 40) {
  const m = new Vox(10, arm + 8, 84);
  const p = m.mat({ ramp: R('#2c3036'), k: 3 }), ins = m.mat({ ramp: R('#a8b0a8'), k: 3 });
  m.box(3, 2, 0, 7, 6, 84, p); m.box(2, 1, 0, 8, 7, 4, p);
  m.box(4, 2, 78, 6, arm + 6, 81, p); m.box(4, 2, 70, 6, arm + 6, 72, p);
  for (let k = 0; k < 8; k++) m.box(4, 6 + k * 3, 72 + k, 6, 8 + k * 3, 73 + k, p);
  m.box(3, arm + 2, 66, 7, arm + 6, 70, ins);
  return m;
}
export const CONTAINER_COLS = ['#a8402e', '#2f5a8a', '#3e6a4a', '#c88a30', '#7a7e84', '#6a3a5a', '#2f7a7a'];
// a 20 ft (len 130) or 40 ft (len 260) shipping container, corrugated, doors at the rear (x = 0)
export function container(color = '#a8402e', len = 130) {
  const m = new Vox(len, 54, 58);
  const b = m.mat({ ramp: R(color), k: 3, shade: (x, y, z) => ((Math.round(x) % 4 === 0 || Math.round(z) % 4 === 0) ? -0.7 : 0) + (hash(Math.round(x / 6), Math.round(z / 6), 5) > 0.85 ? -0.8 : 0) });
  const f = m.mat({ ramp: R(color), k: 2 }), bar = m.mat({ ramp: MAT.metal, k: 2 });
  m.box(0, 0, 0, len, 54, 58, b);
  for (const x of [0, len - 3]) { m.box(x, 0, 0, x + 3, 54, 58, f); }
  m.box(0, 0, 55, len, 54, 58, f); m.box(0, 0, 0, len, 54, 3, f);
  for (const y of [12, 22, 32, 42]) m.box(0, y, 4, 1, y + 1, 54, bar);
  return m;
}
// a freight boxcar on two bogies
export function boxcar(color = '#7a3a2e', len = 230) {
  const m = new Vox(len, 58, 74);
  const b = m.mat({ ramp: R(color), k: 3, shade: (x, y, z) => (Math.round(x) % 14 === 0 ? -0.8 : 0) + (hash(Math.round(x / 5), Math.round(z / 5), 9) > 0.86 ? -0.7 : 0) });
  const d = m.mat({ ramp: R(color), k: 2 }), w = m.mat({ ramp: MAT.tyre, k: 2 }), rail = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.box(4, 2, 16, len - 4, 56, 72, b); m.box(4, 2, 70, len - 4, 56, 74, d);
  m.box(len / 2 - 26, 0, 20, len / 2 + 26, 2, 66, d); m.box(len / 2 - 26, 56, 20, len / 2 + 26, 58, 66, d);   // sliding doors
  m.box(0, 20, 14, 4, 38, 20, rail); m.box(len - 4, 20, 14, len, 38, 20, rail);                                 // couplers
  for (const x of [30, len - 30]) { m.box(x - 22, 6, 4, x + 22, 52, 16, rail); for (const dx of [-12, 12]) for (const y of [6, 48]) m.cyl('y', x + dx, 0, 7, 7, y, y + 4, w); }
  return m;
}
export function tankCar(color = '#3a3c44', len = 210) {
  const m = new Vox(len, 58, 74);
  const t = m.mat({ ramp: R(color), k: 3, shade: (x) => (Math.round(x) % 50 === 0 ? -0.8 : 0) }), w = m.mat({ ramp: MAT.tyre, k: 2 }), rail = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.cyl('x', 0, 29, 44, 27, 8, len - 8, t); m.ell(8, 29, 44, 8, 27, 27, t); m.ell(len - 8, 29, 44, 8, 27, 27, t);
  m.cyl('z', len / 2, 29, 0, 8, 68, 74, t);
  m.box(4, 10, 12, len - 4, 48, 16, rail);
  for (const x of [30, len - 30]) { m.box(x - 22, 6, 4, x + 22, 52, 14, rail); for (const dx of [-12, 12]) for (const y of [6, 48]) m.cyl('y', x + dx, 0, 7, 7, y, y + 4, w); }
  return m;
}
// a rail-mounted gantry crane: two legs either side (y), a top girder, a trolley and a hanging spreader
export function gantryCrane(span = 170, h = 200, hook = 1) {
  const m = new Vox(70, span, h + 6);
  const red = m.mat({ ramp: R('#b8442e'), k: 3 }), dk = m.mat({ ramp: R('#8a3424'), k: 3 }), cab = m.mat({ ramp: R('#e8e4d8'), k: 3 }), cable = m.mat({ ramp: MAT.metalDark, k: 2, flag: F_NOCAST });
  for (const y of [0, span - 10]) { m.box(4, y, 0, 14, y + 10, h, red); m.box(56, y, 0, 66, y + 10, h, red); m.box(4, y, 0, 66, y + 10, 10, dk); for (let k = 0; k < 6; k++) m.box(14 + k * 7, y + 3, 20 + k * 22, 21 + k * 7, y + 7, 26 + k * 22, dk); }
  m.box(0, 0, h - 14, 70, span, h, red); m.box(8, 0, h - 26, 62, span, h - 14, dk);
  const ty = span * 0.55; m.box(20, ty - 14, h - 34, 50, ty + 14, h - 14, cab);
  if (hook) { for (const dx of [26, 44]) m.box(dx, ty - 1, h - 110, dx + 1, ty + 1, h - 34, cable); m.box(16, ty - 10, h - 116, 54, ty + 10, h - 108, m.mat({ ramp: R('#e8c040'), k: 3 })); }
  return m;
}
export function forklift(color = '#e0b030', load = true) {
  const m = new Vox(46, 26, 50);
  const b = m.mat({ ramp: R(color), k: 3 }), dk = m.mat({ ramp: R('#2a2a30'), k: 2 }), w = m.mat({ ramp: MAT.tyre, k: 1 }), crate = m.mat({ ramp: R('#b08048'), k: 3, shade: (x, y, z) => (Math.round(z) % 5 === 0 ? -0.8 : 0) });
  m.box(2, 3, 6, 30, 23, 20, b); m.box(2, 3, 20, 10, 23, 30, b);
  for (const [x, y] of [[4, 3], [4, 20], [26, 3], [26, 20]]) m.box(x, y, 30, x + 2, y + 2, 46, dk);
  m.box(4, 3, 46, 28, 23, 48, dk);
  m.box(32, 4, 4, 35, 8, 48, dk); m.box(32, 18, 4, 35, 22, 48, dk); m.box(35, 6, 2, 46, 8, 4, dk); m.box(35, 18, 2, 46, 20, 4, dk);
  for (const [x, r] of [[8, 6], [26, 7]]) for (const y of [0, 22]) m.cyl('y', x, 0, r, r, y, y + 4, w);
  if (load) m.box(35, 3, 4, 46, 23, 24, crate);
  return m;
}
export function cone() { const m = new Vox(10, 10, 16); const o = m.mat({ ramp: R('#e8642a'), k: 3, shade: (x, y, z) => (z > 7 && z < 10 ? 2.5 : 0) }), b = m.mat({ ramp: R('#2a2a2e'), k: 2 }); m.box(0, 0, 0, 10, 10, 2, b); m.fill((x, y, z) => (Math.hypot(x - 5, y - 5) < 4.2 - z * 0.24 ? o : -1), 0, 0, 2, 10, 10, 16); return m; }
export function mooringBollard() { const m = new Vox(14, 14, 16); const b = m.mat({ ramp: R('#2a2c32'), k: 3 }), y = m.mat({ ramp: R('#d8b040'), k: 3 }); m.cyl('z', 7, 7, 0, 5, 0, 10, b); m.ell(7, 7, 12, 6.5, 6.5, 3.5, y); return m; }
// a covered gangway ramp (len along x, rising rise px) with railings
export function gangway(len = 90, rise = 18, w = 30) {
  const m = new Vox(len, w, rise + 26);
  const deck = m.mat({ ramp: MAT.metal, k: 3, shade: (x) => (Math.round(x) % 4 === 0 ? -0.6 : 0) }), rail = m.mat({ ramp: R('#c8ccd0'), k: 3 });
  m.fill((x, y, z) => { const top = rise * (x / len); if (z > top + 2 || z < top) return -1; return deck; }, 0, 2, 0, len, w - 2, rise + 3);
  for (const y of [1, w - 2]) m.fill((x, yy, z) => { const top = rise * (x / len); return (Math.abs(z - (top + 20)) < 1 || (Math.round(x) % 10 === 0 && z > top && z < top + 20)) ? rail : -1; }, 0, y, 0, len, y + 1, rise + 24);
  return m;
}
// a run of overground pipe on supports (along x), with a valve wheel
export function pipeRun(len = 120, z = 24, r = 4, color = '#8a5a3a') {
  const m = new Vox(len, 12, z + r + 4);
  const p = m.mat({ ramp: R(color), k: 3 }), s = m.mat({ ramp: MAT.metalDark, k: 2 }), v = m.mat({ ramp: R('#c83a30'), k: 3 });
  m.cyl('x', 0, 6, z, r, 0, len, p);
  for (let x = 10; x < len; x += 40) { m.box(x, 4, 0, x + 3, 8, z - r, s); m.box(x - 3, 3, z - r - 2, x + 6, 9, z - r, s); }
  m.cyl('x', 0, 6, z, r + 1.2, len / 2, len / 2 + 3, s); m.fill((x, y, zz) => (Math.abs(Math.hypot(x - len / 2 - 1, zz - (z + r + 4)) - 3) < 0.8 && Math.abs(y - 6) < 1 ? v : -1), 0, 0, 0, len, 12, z + r + 4);
  return m;
}
// a storage tank / silo with a domed top, a ladder and rust streaks
export function storageTank(r = 44, h = 120, color = '#9aa0a6') {
  const m = new Vox(r * 2 + 4, r * 2 + 4, h + r * 0.5 + 4);
  const c = r + 2, t = m.mat({ ramp: R(color), k: 3, shade: (x, y, z) => (Math.round(z) % 20 === 0 ? -0.7 : 0) + (hash(Math.round(x / 2), Math.round(z / 9), 4) > 0.84 ? -1.4 : 0) }), lad = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.cyl('z', c, c, 0, r, 0, h, t); m.fill((x, y, z) => (((x - c) / r) ** 2 + ((y - c) / r) ** 2 + ((z - h) / (r * 0.45)) ** 2 <= 1 ? t : -1), 0, 0, h, r * 2 + 4, r * 2 + 4, h + r * 0.5 + 4);
  m.fill((x, y, z) => (Math.abs(x - c) < 3 && y > c + r - 1 && y < c + r + 2 && (Math.round(z) % 4 === 0 || Math.abs(x - c) > 2) ? lad : -1), 0, 0, 0, r * 2 + 4, r * 2 + 4, h);
  return m;
}
// a floodlight mast for yards and docks (lamps facing down)
export function floodMast(h = 140, on = 0) {
  const m = new Vox(30, 12, h + 8);
  const p = m.mat({ ramp: MAT.metalDark, k: 3 }), l = m.mat({ ramp: R('#f4f0d8', 5, 3), k: 3, emi: on ? [255, 246, 210, 255] : null, flag: F_NOCAST });
  m.cyl('z', 15, 6, 0, 2.2, 0, h, p); m.box(2, 4, h, 28, 8, h + 3, p);
  for (const x of [3, 11, 19]) m.box(x, 3, h - 6, x + 7, 9, h, l);
  return m;
}
// a transit stop pole with a sign flag (bus or tram), and a timetable panel
export function stopPole(color = '#2a5a9a') {
  const m = new Vox(14, 8, 60);
  const p = m.mat({ ramp: MAT.metal, k: 3, flag: F_THIN }), f = m.mat({ ramp: R(color), k: 3, flag: F_THIN, shade: (x, y, z) => (Math.abs(z - 52) < 3 && x > 6 ? 2 : 0) }), t = m.mat({ ramp: R('#e8e4d8'), k: 3, flag: F_THIN });
  m.box(2, 3, 0, 4, 5, 58, p); m.box(4, 3, 44, 14, 5, 58, f); m.box(4, 3, 26, 11, 5, 40, t);
  return m;
}
export function bikeRack(n = 3) {
  const m = new Vox(n * 12 + 4, 10, 14);
  const r = m.mat({ ramp: MAT.metal, k: 3 });
  for (let i = 0; i < n; i++) m.fill((x, y, z) => (Math.abs(Math.hypot(x - (i * 12 + 8), z - 6) - 6) < 1 && z > 0 && Math.abs(y - 5) < 1 ? r : -1), i * 12, 0, 0, i * 12 + 16, 10, 14);
  return m;
}
// a ticket machine / payment kiosk (lit screen)
export function ticketMachine(on = 0) {
  const m = new Vox(14, 10, 36);
  const b = m.mat({ ramp: R('#2a4a7a'), k: 3 }), s = m.mat({ ramp: R('#6ab0e0'), k: 3, emi: [120, 200, 255, 60 + on * 120] });
  m.box(0, 0, 0, 14, 10, 34, b); m.box(0, 0, 34, 14, 10, 36, m.mat({ ramp: MAT.metalDark, k: 2 })); m.box(2, 9, 20, 12, 10, 30, s);
  return m;
}
// a lifebuoy on a post
export function lifebuoy() {
  const m = new Vox(12, 6, 30);
  const p = m.mat({ ramp: MAT.woodDark, k: 3 }), w = m.mat({ ramp: R('#f0ece4'), k: 3 }), rd = m.mat({ ramp: R('#d8402e'), k: 3 });
  m.box(5, 1, 0, 7, 3, 30, p);
  m.fill((x, y, z) => (Math.abs(Math.hypot(x - 6, z - 22) - 4.5) < 1.6 && y > 2.5 && y < 4.5 ? ((Math.floor((Math.atan2(z - 22, x - 6) + 3.15) * 1.27) & 1) ? w : rd) : -1));
  return m;
}
