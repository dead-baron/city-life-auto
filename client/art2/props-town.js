// Art v2 town props as voxel models (voxel.js): market stalls, a glass mall entrance vault, a guard
// tower, compound walls, a billboard frame, a velvet-rope queue line, bollards with chain, a cabin's
// solar panel, a hammock, a scooter rack and pigeons. Each maker returns a Vox, built along +x.
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, F_LEAF, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);
const PRODUCE = ['#c8342e', '#e8a030', '#e8d040', '#5a9a3a', '#7a3a8a', '#e86a3a', '#f0eee8'];

// a market stall: trestle with crates of produce, a striped or plain canopy on four poles
export function marketStall(stripe = '#2f7a5c', base = '#f0ece4', seed = 1, w = 56, d = 40) {
  const m = new Vox(w, d, 50);
  const pole = m.mat({ ramp: MAT.metalDark, k: 2 }), wood = m.mat({ ramp: MAT.woodDock, k: 3 });
  const a = m.mat({ ramp: R(stripe), k: 3 }), b = m.mat({ ramp: R(base), k: 3 });
  const prod = PRODUCE.map((c) => m.mat({ ramp: R(c), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) > 0.6 ? 0.9 : -0.3) }));
  for (const [x, y] of [[2, 2], [w - 4, 2], [2, d - 4], [w - 4, d - 4]]) m.box(x, y, 0, x + 2, y + 2, 40, pole);
  m.box(4, d / 2 - 2, 0, w - 4, d - 4, 16, wood);
  for (let i = 0; i < Math.floor((w - 8) / 12); i++) for (const row of [0, 1]) {
    const x0 = 5 + i * 12, y0 = row ? d - 13 : d / 2 - 1, mat = prod[Math.floor(hash(i, row, seed) * prod.length)];
    m.box(x0, y0, 16, x0 + 11, y0 + 9, 19, wood);
    m.fill((x, y, z) => (Math.hypot((x - x0) % 3 - 1.5, (y - y0) % 3 - 1.5) < 1.6 + (z - 19) * -0.4 ? mat : -1), x0 + 1, y0 + 1, 19, x0 + 10, y0 + 8, 22);
  }
  m.fill((x, y, z) => { const ridge = 46 - Math.abs(y - d / 2) * 0.35; return z >= ridge - 2 && z < ridge ? ((Math.floor(x / 7) & 1) ? a : b) : -1; }, 0, 0, 36, w, d, 50);
  m.fill((x, y, z) => ((y < 1 || y > d - 2) && z > 36 && z < 40 + (Math.round(x) % 7 < 4 ? 0 : 1) ? ((Math.floor(x / 7) & 1) ? a : b) : -1), 0, 0, 34, w, d, 42);
  return m;
}
// a glazed barrel vault over a mall entrance (spans x, runs north from the facade along y)
export function glassVault(w = 110, d = 60, h = 70) {
  const m = new Vox(w, d, h + 4);
  const g = m.mat({ ramp: MAT.glass, k: 3, flag: F_GLASS, shade: (x, y) => (Math.round(x) % 12 === 0 || Math.round(y) % 10 === 0 ? -2 : 0) }), f = m.mat({ ramp: R('#3a4a8a'), k: 3 });
  const r = w / 2;
  m.fill((x, y, z) => { const dz = z - (h - r * 0.6), dd = Math.hypot(x - r, dz / 0.6); return dz > 0 && dd < r && dd > r - 3 ? (y > d - 4 || dd > r - 1.2 && Math.round(x) % 12 < 2 ? f : g) : -1; });
  m.fill((x, y, z) => (y > d - 5 && Math.abs(Math.hypot(x - r, (z - (h - r * 0.6)) / 0.6) - r) < 3 && z > h - r * 0.6 ? f : -1));
  return m;
}
// a timber or steel guard tower: legs, a platform with a rail, a hut with a sloped roof
export function guardTower(h = 70, lit = 0) {
  const m = new Vox(40, 40, h + 40);
  const w = m.mat({ ramp: R('#6a5040'), k: 3 }), rf = m.mat({ ramp: R('#4a6a6a'), k: 3 }), g = m.mat({ ramp: MAT.glassDark, k: 2, flag: F_GLASS, emi: lit ? [255, 200, 120, 120] : null });
  for (const [x, y] of [[3, 3], [34, 3], [3, 34], [34, 34]]) m.box(x, y, 0, x + 3, y + 3, h, w);
  for (let z = 6; z < h; z += 22) for (let k = 0; k < 28; k++) { m.box(6 + k, 4, z + k * 0.6, 7 + k, 5, z + k * 0.6 + 1, w); m.box(6 + k, 35, z + k * 0.6, 7 + k, 36, z + k * 0.6 + 1, w); }
  m.box(0, 0, h, 40, 40, h + 3, w);
  m.fill((x, y, z) => ((x < 2 || x > 37 || y < 2 || y > 37) && (z > h + 3 && z < h + 16) ? (z > h + 8 && z < h + 15 && (Math.round(x + y) % 8 > 1) ? g : w) : -1), 0, 0, h + 3, 40, 40, h + 16);
  m.box(2, 2, h + 16, 38, 38, h + 26, w);
  m.fill((x, y, z) => (z >= h + 26 + (y / 40) * 8 - 2 && z < h + 26 + (1 - y / 40) * 10 && x > -1 ? rf : -1), 0, 0, h + 24, 40, 40, h + 38);
  return m;
}
// a tall concrete compound wall (along x) with posts and a coping, optionally topped with wire
export function compoundWall(len = 80, h = 40, wire = true) {
  const m = new Vox(len, 10, h + 8);
  const c = m.mat({ ramp: R('#8a8a86'), k: 3, shade: (x, y, z) => (Math.round(x) % 20 === 0 ? -1 : 0) + (hash(Math.round(x / 4), Math.round(z / 4), 3) > 0.85 ? -0.8 : 0) }), cap = m.mat({ ramp: R('#a8a8a4'), k: 3 }), wr = m.mat({ ramp: MAT.metal, k: 2 });
  m.box(0, 2, 0, len, 8, h, c); m.box(0, 1, h, len, 9, h + 2, cap);
  if (wire) m.fill((x, y, z) => (Math.hypot((x % 6) - 3, z - (h + 5)) < 2.6 && Math.hypot((x % 6) - 3, z - (h + 5)) > 1.4 && Math.abs(y - 5) < 1 ? wr : -1), 0, 0, h + 2, len, 10, h + 8);
  return m;
}
// a billboard frame on two posts (the face is a sprite the scene puts on it)
export function billboardFrame(w = 160, h = 60, lift = 50) {
  const m = new Vox(w, 10, lift + h + 6);
  const s = m.mat({ ramp: MAT.metalDark, k: 3 }), l = m.mat({ ramp: R('#f8f0d0'), k: 4, emi: [255, 240, 200, 120], flag: F_NOCAST });
  for (const x of [w * 0.25, w * 0.75]) m.box(x - 2, 4, 0, x + 2, 8, lift + h, s);
  m.box(0, 6, lift - 4, w, 10, lift, s);
  for (let x = 20; x < w; x += 40) { m.box(x, 6, lift + h, x + 2, 10, lift + h + 4, s); m.box(x - 3, 2, lift + h + 3, x + 5, 6, lift + h + 6, l); }
  return m;
}
// a velvet rope queue line: brass posts with a red rope (along x)
export function ropeLine(len = 60) {
  const m = new Vox(len, 6, 20);
  const b = m.mat({ ramp: R('#d8b040'), k: 3 }), r = m.mat({ ramp: R('#b82a3a'), k: 3 });
  for (let x = 1; x < len; x += 20) { m.box(x, 2, 0, x + 2, 4, 16, b); m.ell(x + 1, 3, 17, 2, 2, 2, b); m.box(x - 2, 1, 0, x + 4, 5, 2, b); }
  m.fill((x, y, z) => (Math.abs(z - (14 - 4 * Math.sin(Math.PI * ((x - 2) % 20) / 20))) < 0.9 && Math.abs(y - 3) < 1 ? r : -1), 2, 0, 6, len, 6, 16);
  return m;
}
export function chainBollards(len = 60) {
  const m = new Vox(len, 8, 16);
  const b = m.mat({ ramp: MAT.metalDark, k: 3 }), c = m.mat({ ramp: MAT.metal, k: 2 });
  for (let x = 2; x < len; x += 28) { m.cyl('z', x + 2, 4, 0, 2.6, 0, 14, b); m.ell(x + 2, 4, 14, 2.6, 2.6, 2, b); }
  m.fill((x, y, z) => (Math.abs(z - (11 - 5 * Math.sin(Math.PI * ((x - 4) % 28) / 28))) < 0.8 && Math.abs(y - 4) < 1 && Math.round(x) % 2 === 0 ? c : -1), 4, 0, 4, len - 2, 8, 13);
  return m;
}
export function solarPanel(w = 30, d = 20) { const m = new Vox(w, d, 8); const p = m.mat({ ramp: R('#2a3a6a'), k: 3, shade: (x, y) => (Math.round(x) % 6 === 0 || Math.round(y) % 5 === 0 ? 1.5 : 0) }), f = m.mat({ ramp: MAT.metal, k: 3 }); m.fill((x, y, z) => (Math.abs(z - (2 + (d - y) * 0.25)) < 1 ? p : -1)); m.box(0, 0, 0, 2, 2, 7, f); m.box(w - 2, 0, 0, w, 2, 7, f); return m; }
export function hammock(len = 40) { const m = new Vox(len, 10, 22); const p = m.mat({ ramp: MAT.woodDark, k: 3 }), c = m.mat({ ramp: R('#e8a040'), k: 3, shade: (x) => (Math.floor(x / 4) & 1 ? -1.5 : 0) }); m.box(0, 4, 0, 3, 7, 22, p); m.box(len - 3, 4, 0, len, 7, 22, p); m.fill((x, y, z) => (Math.abs(z - (16 - 8 * Math.sin(Math.PI * x / len))) < 1.2 && y > 2 && y < 8 && x > 3 && x < len - 3 ? c : -1)); return m; }
export function pigeon() { const m = new Vox(8, 5, 6); const b = m.mat({ ramp: R('#8a8c98'), k: 3 }), n = m.mat({ ramp: R('#4a7a7a'), k: 3 }); m.ell(3.5, 2.5, 2.5, 3, 2, 2, b); m.ell(6, 2.5, 4, 1.5, 1.4, 1.5, n); m.box(7, 2, 3.5, 8, 3, 4.5, m.mat({ ramp: R('#d8a060'), k: 3 })); return m; }
export function canvasTent(color = '#2a3a8a') { const m = new Vox(46, 40, 36); const c = m.mat({ ramp: R(color), k: 3 }), p = m.mat({ ramp: MAT.metal, k: 3 }); for (const [x, y] of [[1, 1], [44, 1], [1, 38], [44, 38]]) m.box(x, y, 0, x + 1, y + 1, 28, p); m.fill((x, y, z) => (z >= 28 + Math.min(x, 46 - x, y, 40 - y) * 0.4 - 2 && z < 28 + Math.min(x, 46 - x, y, 40 - y) * 0.4 ? c : -1)); m.box(0, 38, 22, 46, 40, 28, c); return m; }
