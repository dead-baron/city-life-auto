// Art v2 country props as voxel models (voxel.js): farm (corn rows, hay, troughs, a windmill, a gate
// arch, a porch, a scarecrow), desert (saguaro, mesas, pump jacks, fuel pumps and canopy, a water
// tower, a windsock, road signs, propane, a flare stack), forest (tents, a campfire, camp chairs, a
// picnic table, a trail map board, finger posts, quarry terraces, a wind turbine) and civic pieces
// (lion statues, flagpoles, barrier arms, a helipad). Each maker returns a Vox, built along +x.
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, F_LEAF, F_THIN, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);

// ---- farm ---------------------------------------------------------------------------------------------
// a block of corn: rows along x, stalks with leaves and gold tassels
export function cornField(w = 200, d = 100, seed = 1) {
  const m = new Vox(w, d, 36);
  const st = m.mat({ ramp: MAT.leaf, k: 3, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z / 3)) > 0.7 ? 1 : 0) - (z < 8 ? 1 : 0) });
  const tas = m.mat({ ramp: R('#d8b040'), k: 3, flag: F_LEAF });
  for (let y = 4; y < d - 2; y += 10) for (let x = 2; x < w - 2; x += 5) {
    const h = 24 + hash(x, y, seed) * 8, jx = (hash(x, y, seed + 1) - 0.5) * 2;
    for (let z = 0; z < h; z++) m.box(x + jx, y, z, x + jx + 1.5, y + 1.5, z + 1, st);
    for (let k = 0; k < 4; k++) { const lz = 8 + k * 5, dir = (k & 1) ? 1 : -1; for (let s = 0; s < 5; s++) m.box(x + jx + dir * s * 0.6, y + dir * s, lz + s * 0.3 - (s > 3 ? 1 : 0), x + jx + dir * s * 0.6 + 1, y + dir * s + 1, lz + s * 0.3 + 1, st); }
    m.box(x + jx - 0.5, y - 0.5, h, x + jx + 2, y + 2, h + 3, tas);
  }
  return m;
}
export function hayBale(round = false) {
  const m = new Vox(24, 16, 16);
  const h = m.mat({ ramp: R('#d8b45a'), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) > 0.8 ? 0.8 : 0) + (!round && Math.round(x) % 8 === 0 ? -0.8 : 0) });
  if (round) m.cyl('y', 12, 0, 8, 8, 0, 16, h); else m.box(0, 0, 0, 24, 16, 14, h);
  return m;
}
export function trough() { const m = new Vox(36, 16, 12); const mt = m.mat({ ramp: MAT.metal, k: 3 }), w = m.mat({ ramp: R('#3a7a8a'), k: 3, flag: 2 }); m.box(0, 0, 0, 36, 16, 10, mt); m.box(2, 2, 6, 34, 14, 10, w); return m; }
export function wheelbarrow() { const m = new Vox(30, 14, 14); const b = m.mat({ ramp: R('#3a6a3a'), k: 3 }), h = m.mat({ ramp: MAT.woodDark, k: 3 }), t = m.mat({ ramp: MAT.tyre, k: 1 }); m.fill((x, y, z) => (z > 5 && z < 12 && x > 8 && x < 24 - (12 - z) * 0.3 && y > 2 && y < 12 ? b : -1)); m.box(0, 2, 8, 10, 4, 10, h); m.box(0, 10, 8, 10, 12, 10, h); m.cyl('y', 26, 0, 5, 4.5, 5, 9, t); return m; }
export function scarecrow() {
  const m = new Vox(30, 8, 56);
  const p = m.mat({ ramp: MAT.woodDark, k: 3 }), shirt = m.mat({ ramp: R('#a8442e'), k: 3 }), straw = m.mat({ ramp: R('#d8b45a'), k: 3 }), hat = m.mat({ ramp: R('#7a5a3a'), k: 3 });
  m.box(14, 3, 0, 16, 5, 50, p); m.box(2, 3, 36, 28, 5, 38, p);
  m.box(10, 2, 24, 20, 6, 40, shirt); m.box(2, 2, 34, 10, 6, 39, shirt); m.box(20, 2, 34, 28, 6, 39, shirt);
  m.ell(15, 4, 44, 4, 3.5, 4, straw); m.box(9, 0, 48, 21, 8, 49, hat); m.box(12, 2, 49, 18, 6, 54, hat);
  return m;
}
// a farm windmill: lattice tower, a bladed wheel facing south and a tail vane
export function windmill(h = 120) {
  const m = new Vox(40, 40, h + 26);
  const s = m.mat({ ramp: MAT.metal, k: 3 }), b = m.mat({ ramp: R('#d8d8d0'), k: 3 }), r = m.mat({ ramp: R('#c83a30'), k: 3 });
  for (const [x, y] of [[6, 6], [32, 6], [6, 32], [32, 32]]) for (let z = 0; z < h; z++) { const t = z / h, X = x + (20 - x) * t * 0.8, Y = y + (20 - y) * t * 0.8; m.box(X, Y, z, X + 2, Y + 2, z + 1, s); }
  for (let z = 10; z < h; z += 24) { const t = z / h, a = 6 + 14 * t * 0.8, c = 34 - 14 * t * 0.8; m.box(a, a, z, c, a + 1, z + 1, s); m.box(a, c, z, c, c + 1, z + 1, s); m.box(a, a, z, a + 1, c, z + 1, s); m.box(c, a, z, c + 1, c, z + 1, s); }
  m.fill((x, y, z) => { const dx = x - 20, dz = z - (h + 10), d = Math.hypot(dx, dz), a = Math.atan2(dz, dx); return d < 16 && d > 3 && Math.abs(y - 30) < 1.5 && Math.abs(((a * 18 / Math.PI) % 2 + 2) % 2 - 1) < 0.55 ? (d > 13 ? r : b) : -1; }, 0, 26, h - 8, 40, 34, h + 26);
  m.box(18, 10, h + 8, 22, 30, h + 12, s); m.box(19, 2, h + 4, 21, 12, h + 18, b);
  return m;
}
// a ranch gate arch: two posts, a crossbeam, a hanging board with a cow silhouette
export function gateArch(w = 90) {
  const m = new Vox(w, 8, 66);
  const p = m.mat({ ramp: MAT.woodDark, k: 3 }), board = m.mat({ ramp: R('#c8b48a'), k: 3, shade: (x, y, z) => { const cx = x - w / 2, cz = z - 44; return (Math.abs(cx) < 9 && cz > -3 && cz < 4 && !(cz < -1 && Math.abs(Math.abs(cx) - 6) > 1.2)) || (cx > 7 && cx < 11 && cz > 0 && cz < 5) ? -3 : 0; } });
  for (const x of [0, w - 6]) m.box(x, 1, 0, x + 6, 7, 64, p);
  m.box(0, 2, 58, w, 6, 63, p);
  m.box(w / 2 - 15, 3, 36, w / 2 + 15, 5, 52, board); for (const x of [w / 2 - 12, w / 2 + 11]) m.box(x, 3.5, 52, x + 1, 4.5, 58, p);
  return m;
}
// a farmhouse porch: deck, posts, rail and a shed roof (stands in front of a facade)
export function porch(w = 120, d = 26, h = 48, color = '#ecebe4', roof = '#5c606c') {
  const m = new Vox(w, d, h + 8);
  const c = m.mat({ ramp: R(color), k: 3 }), deck = m.mat({ ramp: MAT.woodDock, k: 3 }), rf = m.mat({ ramp: R(roof), k: 3, shade: (x, y) => (Math.round(y) % 4 === 0 ? -0.6 : 0) });
  m.box(0, 0, 0, w, d, 5, deck);
  for (let x = 2; x < w; x += 28) m.box(x, d - 4, 5, x + 3, d - 1, h, c);
  m.box(w - 4, d - 4, 5, w - 1, d - 1, h, c);
  m.fill((x, y, z) => (z === 18 || z === 19 || (Math.round(x) % 4 === 0 && z > 5 && z < 18)) && y > d - 4 && y < d - 1 && !(x > w / 2 - 12 && x < w / 2 + 12) ? c : -1, 0, 0, 5, w, d, 20);
  m.fill((x, y, z) => (z >= h - 2 + (d - y) * 0.2 && z < h + 2 + (d - y) * 0.2 ? rf : -1), 0, 0, h - 4, w, d, h + 8);
  return m;
}
export function sunflowers(n = 6, seed = 1) {
  const m = new Vox(24, 10, 40);
  const st = m.mat({ ramp: MAT.leaf, k: 3, flag: F_LEAF }), pet = m.mat({ ramp: R('#f0c030'), k: 3, flag: F_LEAF }), mid = m.mat({ ramp: R('#5a3a22'), k: 2 });
  for (let i = 0; i < n; i++) { const x = 3 + hash(i, 1, seed) * 18, y = 2 + hash(i, 2, seed) * 6, h = 24 + hash(i, 3, seed) * 12; m.box(x, y, 0, x + 1, y + 1, h, st); m.fill((px, py, pz) => { const d = Math.hypot(px - x - 0.5, pz - h - 2); return Math.abs(py - y - 1.5) < 1 && d < 4.2 ? (d < 1.8 ? mid : pet) : -1; }, Math.floor(x - 5), Math.floor(y - 1), Math.floor(h - 3), Math.ceil(x + 6), Math.ceil(y + 4), Math.ceil(h + 7)); }
  return m;
}
export function woodpile() { const m = new Vox(30, 12, 16); const w = m.mat({ ramp: R('#8a5a3a'), k: 3 }), e = m.mat({ ramp: R('#d8b080'), k: 3 }); for (let r = 0; r < 3; r++) for (let i = 0; i < 6 - r; i++) { const x = 3 + i * 4.5 + r * 2.2, z = 2.5 + r * 4.2; m.cyl('y', x, 0, z, 2.3, 0, 12, w); m.cyl('y', x, 0, z, 1.6, 11, 12, e); } return m; }
export function plough() { const m = new Vox(44, 40, 14); const r = m.mat({ ramp: R('#b83a2e'), k: 3 }), s = m.mat({ ramp: MAT.metal, k: 3 }); m.box(0, 2, 8, 44, 6, 11, r); m.box(0, 34, 8, 44, 38, 11, r); m.box(40, 2, 8, 44, 38, 11, r); for (let x = 4; x < 40; x += 9) for (const y of [8, 18, 28]) m.cyl('z', x, y, 0, 3, 0, 9, s); return m; }

// ---- desert --------------------------------------------------------------------------------------------
export function saguaro(seed = 1, h = 56) {
  const m = new Vox(30, 14, h + 2);
  const g = m.mat({ ramp: R('#4a8a4a'), k: 3, shade: (x, y) => (Math.round(Math.atan2(y - 7, x - 15) * 4) % 2 ? -0.5 : 0) });
  m.ell(15, 7, h - 4, 4.2, 4.2, 4, g); m.cyl('z', 15, 7, 0, 4.2, 0, h - 4, g);
  const arms = [[-1, 0.35 + hash(seed, 1, 2) * 0.2], [1, 0.45 + hash(seed, 2, 2) * 0.2]];
  for (const [s, t] of arms) { const z0 = h * t, len = 8; for (let k = 0; k < len; k++) m.box(15 + s * (4 + k) - 2, 5, z0, 15 + s * (4 + k) + 2, 9, z0 + 4, g); const ax = 15 + s * (4 + len); m.cyl('z', ax, 7, 0, 3.2, z0, z0 + h * 0.35, g); m.ell(ax, 7, z0 + h * 0.35, 3.2, 3.2, 3, g); }
  m.smooth = 1;
  return m;
}
export function barrelCactus() { const m = new Vox(12, 12, 12); const g = m.mat({ ramp: R('#5a8a3e'), k: 3, shade: (x, y) => (Math.round(Math.atan2(y - 6, x - 6) * 4) % 2 ? -0.6 : 0) }), f = m.mat({ ramp: R('#e85a6a'), k: 3 }); m.ell(6, 6, 5, 5, 5, 5.5, g); m.box(5, 5, 10, 7, 7, 12, f); return m; }
// a mesa / butte: stacked ledges of banded red rock with a crumbling skirt of boulders
export function mesa(w = 180, d = 120, h = 90, seed = 1) {
  const m = new Vox(w, d, h);
  const rk = m.mat({ ramp: R('#b05a3a', 7, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 9 < 2 ? -1 : 0) + (hash(Math.round(x / 4), Math.round(y / 4), Math.round(z / 3) + seed) - 0.5) * 1.2 + (Math.round(z) % 9 === 8 ? 0.8 : 0) });
  const cx = w / 2, cy = d / 2;
  m.fill((x, y, z) => {
    const tier = Math.floor(z / 22), shrink = 1 - tier * 0.12, a = Math.atan2(y - cy, x - cx);
    const wob = 1 + Math.sin(a * 5 + seed + tier) * 0.06 + Math.sin(a * 11 + seed * 3) * 0.04 + (hash(Math.round(a * 20), tier, seed) - 0.5) * 0.05;
    return ((x - cx) / (w / 2 * shrink * wob)) ** 2 + ((y - cy) / (d / 2 * shrink * wob)) ** 2 < 1 ? rk : -1;
  });
  m.smooth = 1;
  return m;
}
export function pumpJack(phase = 0) {
  const m = new Vox(70, 20, 60);
  const b = m.mat({ ramp: R('#3a3c44'), k: 3 }), head = m.mat({ ramp: R('#c8442e'), k: 3 }), base = m.mat({ ramp: MAT.concrete, k: 2 });
  m.box(0, 2, 0, 70, 18, 4, base);
  for (const y of [5, 13]) for (let k = 0; k < 40; k++) m.box(30 - k * 0.15, y, 4 + k, 32 - k * 0.15, y + 2, 5 + k, b);
  const tilt = Math.sin(phase * 6.28) * 0.25;
  for (let x = 4; x < 66; x++) { const z = 44 + (x - 30) * tilt; m.box(x, 8, z, x + 1, 12, z + 4, b); }
  const hz = 44 + 36 * tilt; m.fill((x, y, z) => (Math.abs(x - 64) < 6 - Math.abs(z - hz) * 0.4 && y > 6 && y < 14 && Math.abs(z - hz) < 12 ? head : -1));
  m.box(62, 9, 4, 64, 11, hz - 10, b);
  m.box(2, 4, 4, 18, 16, 16, b);
  return m;
}
export function fuelPump(color = '#c8342e', on = 0) {
  const m = new Vox(12, 10, 34);
  const b = m.mat({ ramp: R(color), k: 3 }), w = m.mat({ ramp: R('#ecebe4'), k: 3 }), s = m.mat({ ramp: R('#2a3a4a'), k: 2, emi: [140, 220, 255, 40 + on * 100] });
  m.box(0, 0, 0, 12, 10, 4, w); m.box(1, 1, 4, 11, 9, 30, b); m.box(1, 1, 30, 11, 9, 34, w); m.box(3, 9, 18, 9, 10, 26, s); m.box(10, 3, 12, 12, 5, 20, w);
  return m;
}
// a forecourt canopy on four posts with a lit red band round the fascia
export function fuelCanopy(w = 150, d = 80, h = 52, on = 0) {
  const m = new Vox(w, d, h + 10);
  const roof = m.mat({ ramp: R('#bcbcb8'), k: 3, shade: (x, y) => (Math.round(x) % 20 === 0 || Math.round(y) % 20 === 0 ? -0.8 : 0) }), band = m.mat({ ramp: R('#d8343a'), k: 3, emi: [255, 70, 60, 40 + on * 160] }), post = m.mat({ ramp: R('#ecebe4'), k: 3 }), light = m.mat({ ramp: R('#f8f0d0'), k: 4, emi: [255, 246, 220, 30 + on * 200], flag: F_NOCAST });
  m.box(0, 0, h, w, d, h + 8, roof); m.box(0, d - 1, h + 2, w, d, h + 6, band); m.box(0, 0, h + 2, 1, d, h + 6, band); m.box(w - 1, 0, h + 2, w, d, h + 6, band);
  for (const [x, y] of [[w * 0.2, d * 0.3], [w * 0.8, d * 0.3], [w * 0.2, d * 0.75], [w * 0.8, d * 0.75]]) m.box(x - 2, y - 2, 0, x + 2, y + 2, h, post);
  for (const x of [w * 0.35, w * 0.65]) m.box(x - 6, d * 0.4, h - 1, x + 6, d * 0.6, h, light);
  return m;
}
export function waterTower(h = 90) {
  const m = new Vox(40, 40, h + 40);
  const leg = m.mat({ ramp: MAT.woodDark, k: 3 }), tank = m.mat({ ramp: R('#8a6a4a'), k: 3, shade: (x, y, z) => (Math.round(z) % 6 === 0 ? -0.8 : 0) }), cap = m.mat({ ramp: R('#5a5a60'), k: 3 });
  for (const [x, y] of [[6, 6], [32, 6], [6, 32], [32, 32]]) m.box(x, y, 0, x + 3, y + 3, h, leg);
  for (const z of [h * 0.35, h * 0.7]) { m.box(6, 6, z, 35, 8, z + 2, leg); m.box(6, 32, z, 35, 34, z + 2, leg); m.box(6, 6, z, 8, 35, z + 2, leg); m.box(32, 6, z, 34, 35, z + 2, leg); }
  m.cyl('z', 20, 20, 0, 18, h, h + 28, tank);
  m.fill((x, y, z) => (Math.hypot(x - 20, y - 20) < 19 - (z - h - 28) * 1.6 ? cap : -1), 0, 0, h + 28, 40, 40, h + 40);
  return m;
}
export function windsock() { const m = new Vox(30, 6, 48); const p = m.mat({ ramp: MAT.metal, k: 3 }), a = m.mat({ ramp: R('#e8642a'), k: 3 }), w = m.mat({ ramp: R('#ecebe4'), k: 3 }); m.box(2, 2, 0, 4, 4, 46, p); for (let k = 0; k < 24; k++) { const r = 4 - k * 0.12; m.fill((x, y, z) => (Math.hypot(y - 3, z - (42 - k * 0.3)) < r && Math.abs(x - 4 - k) < 0.6 ? (Math.floor(k / 5) % 2 ? w : a) : -1), 4 + k, 0, 30, 5 + k, 6, 48); } return m; }
// a road sign on two posts: 'arrow' (green with a white arrow) or 'curve' (yellow diamond)
export function roadSign(kind = 'arrow') {
  if (kind === 'curve') { const m = new Vox(18, 4, 44); const p = m.mat({ ramp: MAT.metal, k: 2, flag: F_THIN }), y = m.mat({ ramp: R('#e8c030'), k: 3, flag: F_THIN, shade: (x, yy, z) => (Math.abs(Math.sin((z - 34) * 0.5) * 3 - (x - 9)) < 1.2 ? -3 : 0) }); m.box(8, 1, 0, 10, 3, 30, p); m.fill((x, yy, z) => (Math.abs(x - 9) + Math.abs(z - 34) < 9 && yy > 1 && yy < 3 ? y : -1)); return m; }
  const m = new Vox(50, 4, 52);
  const p = m.mat({ ramp: MAT.metal, k: 2, flag: F_THIN }), g = m.mat({ ramp: R('#2e7a4e'), k: 3, flag: F_THIN, shade: (x, y, z) => { const ax = x - 25, az = z - 40; return (Math.abs(az) < 1.5 && ax > -10 && ax < 8) || (ax >= 4 && Math.abs(az) < 10 - ax * 0.8 && ax < 12) ? 3 : 0; } });
  m.box(6, 1, 0, 8, 3, 30, p); m.box(42, 1, 0, 44, 3, 30, p); m.box(0, 1, 30, 50, 3, 52, g);
  return m;
}
export function propaneTank() { const m = new Vox(60, 24, 30); const t = m.mat({ ramp: R('#ecebe4'), k: 3 }), l = m.mat({ ramp: MAT.metalDark, k: 2 }); m.cyl('x', 0, 12, 16, 11, 8, 52, t); m.ell(8, 12, 16, 8, 11, 11, t); m.ell(52, 12, 16, 8, 11, 11, t); for (const x of [14, 46]) m.box(x, 6, 0, x + 3, 18, 6, l); return m; }
export function flareStack(on = 1) { const m = new Vox(14, 14, 90); const p = m.mat({ ramp: MAT.metalDark, k: 3, flag: F_THIN }), f = m.mat({ ramp: R('#f8b040', 5, 3), k: 4, emi: [255, 160, 60, 255 * on], flag: F_NOCAST }); m.cyl('z', 7, 7, 0, 2.6, 0, 76, p); m.box(1, 1, 0, 13, 13, 4, p); if (on) m.fill((x, y, z) => (Math.hypot(x - 7, y - 7) < 3.2 - (z - 76) * 0.2 + Math.sin(z) * 0.5 ? f : -1), 0, 0, 76, 14, 14, 90); return m; }

// ---- forest --------------------------------------------------------------------------------------------
export function tent(color = '#e0702e') {
  const m = new Vox(40, 34, 28);
  const t = m.mat({ ramp: R(color), k: 3 }), d = m.mat({ ramp: R(color), k: 1 }), pole = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.fill((x, y, z) => { const ny = Math.abs(y - 17) / 17, nx = Math.abs(x - 20) / 20; const top = 26 * (1 - Math.max(nx * 0.7, ny)); return z < top ? ((y > 30 && Math.abs(x - 20) < 6 - z * 0.15) ? d : t) : -1; });
  m.box(19, 16, 26, 21, 18, 28, pole);
  m.smooth = 1;
  return m;
}
// a campfire: a ring of stones, logs and flames (lit), with smoke wisps
export function campfire(on = 1) {
  const m = new Vox(28, 28, 26);
  const st = m.mat({ ramp: R('#8a8478'), k: 3 }), lg = m.mat({ ramp: R('#5a3a22'), k: 3 }), ash = m.mat({ ramp: R('#3a3634'), k: 2 });
  const fl = m.mat({ ramp: R('#f8a030', 5, 3), k: 4, emi: [255, 150, 50, 255 * on], flag: F_NOCAST }), core = m.mat({ ramp: R('#fff0a0', 5, 3), k: 4, emi: [255, 230, 140, 255 * on], flag: F_NOCAST });
  for (let a = 0; a < 6.28; a += 0.5) m.ell(14 + Math.cos(a) * 11, 14 + Math.sin(a) * 11, 2, 2.6, 2.6, 2.4, st);
  m.fill((x, y, z) => (Math.hypot(x - 14, y - 14) < 8 && z < 1.5 ? ash : -1));
  for (const a of [0.3, 1.9, 3.5, 5.0]) for (let k = 0; k < 9; k++) m.box(14 + Math.cos(a) * (8 - k), 14 + Math.sin(a) * (8 - k), 1 + k * 0.5, 15.5 + Math.cos(a) * (8 - k), 15.5 + Math.sin(a) * (8 - k), 2.5 + k * 0.5, lg);
  if (on) m.fill((x, y, z) => { const d = Math.hypot(x - 14, y - 14), top = 18 - d * 2.2 + Math.sin(x * 1.3 + y) * 3; return z > 3 && z < top ? (d < 2.4 && z < top - 4 ? core : fl) : -1; }, 6, 6, 3, 22, 22, 26);
  return m;
}
export function campChair(color = '#2e6a3e') { const m = new Vox(12, 12, 20); const c = m.mat({ ramp: R(color), k: 3 }), f = m.mat({ ramp: MAT.metalDark, k: 2 }); m.box(1, 1, 7, 11, 11, 9, c); m.box(1, 1, 9, 11, 3, 20, c); for (const [x, y] of [[1, 1], [10, 1], [1, 10], [10, 10]]) m.box(x, y, 0, x + 1, y + 1, 8, f); m.box(0, 1, 11, 1, 11, 12, f); m.box(11, 1, 11, 12, 11, 12, f); return m; }
export function picnicTable() { const m = new Vox(44, 36, 18); const w = m.mat({ ramp: MAT.woodDock, k: 3, shade: (x, y) => (Math.round(y) % 5 === 0 ? -0.7 : 0) }); m.box(0, 10, 15, 44, 26, 17, w); for (const y of [2, 28]) m.box(2, y, 8, 42, y + 6, 10, w); for (const x of [6, 36]) { for (let k = 0; k < 15; k++) { m.box(x, 10 - k * 0.6, k, x + 2, 12 - k * 0.6, k + 1, w); m.box(x, 24 + k * 0.6, k, x + 2, 26 + k * 0.6, k + 1, w); } } return m; }
// a trail map board under a little roof, on two log posts
export function mapBoard() {
  const m = new Vox(46, 10, 46);
  const p = m.mat({ ramp: R('#6a4a30'), k: 3 }), map = m.mat({ ramp: R('#c8c09a'), k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(z / 3), 7) > 0.7 ? -1.2 : hash(Math.round(x / 2), Math.round(z / 2), 9) > 0.85 ? 1 : 0) + (Math.abs(Math.sin(x * 0.3) * 4 - (z - 28)) < 1 ? -2.5 : 0) }), rf = m.mat({ ramp: R('#4a3a2a'), k: 3 });
  for (const x of [2, 40]) m.box(x, 3, 0, x + 4, 7, 42, p);
  m.box(4, 4, 16, 42, 6, 38, p); m.box(6, 6, 18, 40, 7, 36, map);
  m.fill((x, y, z) => (z >= 40 + (5 - Math.abs(y - 5)) * 0.6 && z < 43 + (5 - Math.abs(y - 5)) * 0.6 ? rf : -1), 0, 0, 38, 46, 10, 46);
  return m;
}
// a finger post with two pointing boards
export function fingerPost() { const m = new Vox(30, 6, 44); const p = m.mat({ ramp: R('#6a4a30'), k: 3, flag: F_THIN }), b = m.mat({ ramp: R('#a8865a'), k: 3, flag: F_THIN }); m.box(13, 2, 0, 17, 6, 44, p); m.fill((x, y, z) => (y > 2 && y < 5 && ((z > 34 && z < 40 && x > 3 && x < 17 + 10 && !(x > 24 && Math.abs(z - 37) > 27 - x)) || (z > 25 && z < 31 && x > 2 && x < 27 && !(x < 6 && Math.abs(z - 28) > x - 3))) ? b : -1)); return m; }
// a quarry terrace: a bench of grey rock with a broken face and a gravel top (w along x, h tall)
export function terrace(w = 300, d = 60, h = 40, seed = 1) {
  const m = new Vox(w, d, h);
  const rk = m.mat({ ramp: R('#8a8680', 7, 3), k: 3, shade: (x, y, z) => (hash(Math.round(x / 5), Math.round(z / 4), seed) - 0.5) * 1.6 + (Math.round(z) % 10 < 1 ? -0.8 : 0) });
  const top = m.mat({ ramp: R('#a8a296'), k: 3, shade: (x, y) => (hash(Math.round(x), Math.round(y), seed) > 0.85 ? 0.8 : 0) });
  m.fill((x, y, z) => { const lip = d - 3 - (hash(Math.round(x / 6), Math.round(z / 6), seed + 1)) * 5; return y < lip ? (z > h - 2 ? top : rk) : -1; });
  return m;
}
// a wind turbine: tower, nacelle and three blades turning in the plane facing south
export function windTurbine(h = 260, r = 80, angle = 0.3) {
  const m = new Vox(r * 2 + 8, 24, h + r + 6);
  const w = m.mat({ ramp: R('#ecebe8'), k: 3, flag: F_THIN }), cx = r + 4;
  m.fill((x, y, z) => (Math.hypot(x - cx, y - 12) < 4.5 - z / h * 2 && z < h ? w : -1), 0, 0, 0, r * 2 + 8, 24, h);
  m.box(cx - 5, 4, h - 3, cx + 5, 22, h + 6, w);
  for (let b = 0; b < 3; b++) { const a = angle + b * 2.094; for (let k = 4; k < r; k++) { const x = cx + Math.cos(a) * k, z = h + 2 + Math.sin(a) * k, t = 2.6 - k / r * 1.8; m.box(x - t, 21, z - t * 0.6, x + t, 23, z + t * 0.6, w); } }
  m.cyl('y', cx, 0, h + 2, 4, 21, 24, w);
  return m;
}

// ---- civic ---------------------------------------------------------------------------------------------
export function lionStatue() {
  const m = new Vox(18, 30, 34);
  const st = m.mat({ ramp: R('#c8c0b0'), k: 3 }), pl = m.mat({ ramp: R('#b8b0a0'), k: 3 });
  m.box(0, 0, 0, 18, 30, 12, pl);
  m.ell(9, 12, 18, 6, 10, 6, st); m.ell(9, 22, 26, 7, 6, 7, st); m.ell(9, 25, 22, 4, 4, 4, st);
  for (const x of [4, 12]) m.box(x, 22, 12, x + 3, 28, 18, st);
  m.smooth = 1;
  return m;
}
// a flagpole with a flag streaming east: 'stars' (a stars-and-stripes style flag) or a hex colour
export function flagpole(h = 110, flag = 'stars') {
  const m = new Vox(46, 8, h + 4);
  const p = m.mat({ ramp: MAT.chrome, k: 3, flag: F_THIN }), red = m.mat({ ramp: R('#c8343a'), k: 3, flag: F_THIN }), white = m.mat({ ramp: R('#f0eee8'), k: 3, flag: F_THIN }), blue = m.mat({ ramp: R(flag === 'stars' ? '#2a3a7a' : flag), k: 3, flag: F_THIN });
  m.box(2, 3, 0, 4, 5, h, p); m.ell(3, 4, h + 1, 2, 2, 2, p);
  m.fill((x, y, z) => { const fx = x - 4, fz = h - 2 - z + Math.sin(fx * 0.25) * 1.2; if (fx < 0 || fx > 40 || fz < 0 || fz > 24 || Math.abs(y - 4) > 0.8) return -1; if (flag !== 'stars') return blue; if (fx < 16 && fz < 13) return (Math.round(fx) % 3 === 1 && Math.round(fz) % 3 === 1) ? white : blue; return Math.floor(fz / 2) % 2 ? white : red; }, 0, 0, h - 30, 46, 8, h);
  return m;
}
export function barrierArm(len = 70, open = false) {
  const m = new Vox(len + 10, 10, open ? len + 20 : 30);
  const b = m.mat({ ramp: R('#e8c030'), k: 3 }), a = m.mat({ ramp: R('#f0eee8'), k: 3, shade: (x, y, z) => (Math.floor((open ? z : x) / 8) % 2 ? -3 : 0) });
  m.box(0, 1, 0, 10, 9, 24, b);
  if (open) m.box(4, 4, 24, 7, 7, len + 18, a); else m.box(10, 4, 18, len + 10, 7, 22, a);
  return m;
}
export function helipad(r = 40) {
  const m = new Vox(r * 2 + 2, r * 2 + 2, 3);
  const c = r + 1, base = m.mat({ ramp: R('#5a5e66'), k: 3 }), y = m.mat({ ramp: R('#e8c030'), k: 3 }), w = m.mat({ ramp: R('#f0eee8'), k: 4 });
  m.fill((x, yy, z) => { const d = Math.hypot(x - c, yy - c); if (d > r) return -1; if (Math.abs(d - (r - 4)) < 1.5) return y; const hx = x - c, hy = yy - c; if ((Math.abs(Math.abs(hx) - 9) < 2.5 && Math.abs(hy) < 14) || (Math.abs(hy) < 2 && Math.abs(hx) < 9)) return w; return base; });
  return m;
}
