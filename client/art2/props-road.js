// Art v2 road, rail, harbour and airport props as voxel models (voxel.js): highway sign gantries, deck
// pillars, railway crossing signals, station platform canopies and a station entrance, toll gantries and
// booths, sailboats and kayaks, and the airport set (an airliner, a jet bridge, baggage carts, a belt
// loader, an aircraft tug, the control tower and runway lights). Each maker returns a Vox, built along +x.
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, F_THIN, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);

// an overhead sign gantry spanning y (span) with green signs facing south (+y in world once turned)
export function signGantry(span = 180, h = 70, signs = 2) {
  const m = new Vox(14, span, h + 30);
  const st = m.mat({ ramp: R('#5a6068'), k: 3 }), g = m.mat({ ramp: R('#2e7a4e'), k: 3, shade: (x, y, z) => { const ly = y % (span / signs), c = span / signs / 2; return (Math.abs(z - (h + 14)) < 1.5 && Math.abs(ly - c) < 10) || (Math.abs(ly - c - 8 + (z - h - 14)) < 1.5 && z > h + 8 && z < h + 20) ? 3 : 0; } });
  const rim = m.mat({ ramp: R('#e8e8e4'), k: 4 });
  for (const y of [2, span - 8]) m.box(4, y, 0, 10, y + 6, h + 26, st);
  for (const z of [h + 22, h + 4]) m.box(4, 0, z, 10, span, z + 3, st);
  for (let y = 4; y < span - 4; y += 10) m.box(6, y, h + 6, 8, y + 2, h + 22, st);
  for (let i = 0; i < signs; i++) { const y0 = i * span / signs + 12, y1 = (i + 1) * span / signs - 12; m.box(10, y0, h + 2, 12, y1, h + 26, rim); m.box(10, y0 + 2, h + 4, 13, y1 - 2, h + 24, g); }
  return m;
}
// a deck pillar: a square column with a hammerhead cap (cap runs along y)
export function pillar(h = 90, w = 30, cap = 90) {
  const m = new Vox(w + 4, cap, h);
  const c = m.mat({ ramp: R('#a8a296'), k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(z / 5), 3) > 0.9 ? -0.8 : 0) + (Math.round(z) % 30 === 0 ? -0.5 : 0) });
  const cy = cap / 2;
  m.box(2, cy - w / 2, 0, w + 2, cy + w / 2, h - 14, c);
  m.fill((x, y, z) => (z >= h - 14 && Math.abs(y - cy) < w / 2 + (z - (h - 14)) * (cap / 2 - w / 2) / 10 ? c : -1), 0, 0, h - 14, w + 4, cap, h);
  return m;
}
// a railway crossing signal: a post, an X crossbuck, twin red lamps (one lit) and a bell
export function crossingSignal(on = 1, phase = 0) {
  const m = new Vox(24, 8, 70);
  const p = m.mat({ ramp: R('#d8d8d4'), k: 3, shade: (x, y, z) => (Math.floor(z / 6) % 2 && z < 30 ? -2.5 : 0) }), w = m.mat({ ramp: R('#f0eee8'), k: 4 }), k = m.mat({ ramp: R('#2a2a30'), k: 2 });
  const l1 = m.mat({ ramp: R('#e83a30', 5, 3), k: 4, emi: on && !phase ? [255, 50, 40, 255] : [120, 20, 20, 40], flag: F_NOCAST }), l2 = m.mat({ ramp: R('#e83a30', 5, 3), k: 4, emi: on && phase ? [255, 50, 40, 255] : [120, 20, 20, 40], flag: F_NOCAST });
  m.box(11, 3, 0, 13, 5, 64, p);
  for (let t = 0; t < 22; t++) { m.box(1 + t, 3, 50 + t * 0.6, 3 + t, 5, 52 + t * 0.6, w); m.box(1 + t, 3, 63 - t * 0.6, 3 + t, 5, 65 - t * 0.6, w); }
  m.box(2, 4, 36, 22, 6, 38, k);
  for (const [x, mt] of [[4, l1], [16, l2]]) { m.box(x - 1, 5, 32, x + 5, 7, 42, k); m.box(x, 7, 34, x + 4, 8, 40, mt); }
  m.ell(12, 5, 46, 3, 2, 2, k);
  return m;
}
// a station platform canopy: posts down the back, a flat roof with lights underneath (len along x)
export function platformCanopy(len = 200, d = 40, on = 1) {
  const m = new Vox(len, d, 62);
  const p = m.mat({ ramp: R('#2e4a3e'), k: 3 }), rf = m.mat({ ramp: R('#7a8a8a'), k: 3, shade: (x) => (Math.round(x) % 8 === 0 ? -0.8 : 0) }), l = m.mat({ ramp: R('#f8f0d0', 5, 3), k: 4, emi: [255, 240, 200, 60 + on * 180], flag: F_NOCAST });
  for (let x = 6; x < len; x += 50) { m.box(x, 4, 0, x + 3, 7, 52, p); m.box(x, 4, 48, x + 3, d - 2, 52, p); }
  m.box(0, 0, 52, len, d, 56, rf); m.box(0, d - 2, 50, len, d, 57, p);
  for (let x = 20; x < len - 10; x += 50) m.box(x, d / 2 - 2, 50, x + 18, d / 2 + 2, 52, l);
  return m;
}
export function clockPost() { const m = new Vox(16, 10, 64); const p = m.mat({ ramp: R('#2e4a3e'), k: 3, flag: F_THIN }), f = m.mat({ ramp: R('#f0eee6'), k: 4, flag: F_THIN, shade: (x, y, z) => ((Math.abs(x - 8) < 0.8 && z > 52 && z < 58) || (Math.abs(z - 55) < 0.8 && x > 8 && x < 12) ? -3 : 0) }); m.cyl('z', 8, 5, 0, 2, 0, 46, p); m.cyl('y', 8, 0, 55, 7, 2, 8, p); m.cyl('y', 8, 0, 55, 5.5, 8, 9, f); return m; }
// a metro station entrance at street level: a stair opening in an iron railing, a sign box and lamps
export function stationEntrance(on = 1, color = '#d8582a') {
  const m = new Vox(70, 44, 54);
  const ir = m.mat({ ramp: R('#2e5a4a'), k: 3 }), st = m.mat({ ramp: R('#9a9890'), k: 3, shade: (x, y) => (Math.round(y) % 5 === 0 ? 1.2 : Math.round(y) % 5 === 4 ? -1.2 : 0) });
  const glow = m.mat({ ramp: R('#f0d8a0', 5, 3), k: 4, emi: [255, 220, 150, 40 + on * 160], flag: F_NOCAST }), sign = m.mat({ ramp: R(color), k: 3, emi: [255, 140, 80, 30 + on * 120], shade: (x, y, z) => (Math.hypot(y - 22, z - 44) < 3 ? 3 : 0) });
  m.fill((x, y, z) => (x > 4 && x < 66 && y > 4 && y < 40 && z < 1 ? st : -1));
  for (const y of [3, 40]) { m.box(4, y, 0, 66, y + 1, 22, ir); for (let x = 4; x < 66; x += 4) m.box(x, y, 0, x + 1, y + 1, 20, ir); }
  m.box(0, 3, 0, 4, 41, 34, ir); for (let y = 3; y < 41; y += 4) m.box(1, y, 18, 4, y + 1, 22, ir);
  m.box(0, 14, 34, 6, 30, 50, ir); m.box(4, 15, 36, 6, 29, 49, sign);
  for (const y of [2, 41]) { m.box(64, y, 0, 66, y + 2, 40, ir); m.box(62, y - 1, 40, 68, y + 3, 46, glow); }
  return m;
}
// a toll plaza canopy: pillars between lanes, a beam with a red X or green arrow over each lane
export function tollGantry(lanes = 4, laneW = 80, open = [1, 1, 0, 1], on = 1) {
  const span = lanes * laneW + 20, m = new Vox(30, span, 78);
  const c = m.mat({ ramp: R('#b8b2a6'), k: 3 }), dk = m.mat({ ramp: R('#2a2c34'), k: 2 }), cam = m.mat({ ramp: R('#d8d8d4'), k: 3 });
  const gr = m.mat({ ramp: R('#40d070', 5, 3), k: 4, emi: [80, 255, 120, 120 + on * 135], flag: F_NOCAST }), rd = m.mat({ ramp: R('#e83a30', 5, 3), k: 4, emi: [255, 60, 50, 120 + on * 135], flag: F_NOCAST });
  for (let i = 0; i <= lanes; i++) m.box(8, i * laneW + 6, 0, 22, i * laneW + 14, 60, c);
  m.box(4, 0, 60, 26, span, 74, c); m.box(4, 0, 74, 26, span, 78, c);
  for (let i = 0; i < lanes; i++) { const y = i * laneW + 10 + laneW / 2; m.box(26, y - 9, 62, 28, y + 9, 72, dk); m.box(28, y - 7, 63, 29, y + 7, 71, open[i] ? gr : rd); m.box(12, y - 4, 78, 20, y + 4, 82 > 78 ? 78 : 82, cam); }
  return m;
}
export function tollBooth(on = 1) {
  const m = new Vox(30, 22, 44);
  const w = m.mat({ ramp: R('#d8d4c8'), k: 3 }), g = m.mat({ ramp: R('#e8c890', 5, 2), k: 3, emi: [255, 214, 150, 40 + on * 120], flag: F_GLASS }), rf = m.mat({ ramp: R('#5a6068'), k: 3 }), y = m.mat({ ramp: R('#e8c030'), k: 3, shade: (x, yy, z) => (Math.floor(z / 4) % 2 ? -2.5 : 0) });
  m.box(2, 2, 0, 28, 20, 36, w); m.box(4, 20, 14, 26, 21, 32, g); m.box(2, 1, 14, 3, 19, 32, g); m.box(0, 0, 36, 30, 22, 40, rf);
  m.cyl('z', 2, 21, 0, 2.5, 0, 16, y); m.cyl('z', 28, 21, 0, 2.5, 0, 16, y);
  return m;
}
// a sailboat: white hull, a cockpit, a tall mast with the mainsail up or furled
export function sailboat(len = 120, sail = true, color = '#f0eee8') {
  const W = 40, m = new Vox(len, W, 150);
  const hull = m.mat({ ramp: R(color), k: 3 }), st = m.mat({ ramp: R('#2a3a6a'), k: 3 }), deckM = m.mat({ ramp: MAT.woodDock, k: 3 }), mast = m.mat({ ramp: MAT.chrome, k: 3 }), cl = m.mat({ ramp: R('#f4f2ea'), k: 4, flag: F_NOCAST }), cover = m.mat({ ramp: R('#2a4a8a'), k: 3 });
  const cy = W / 2;
  m.fill((x, y, z) => { const t = x / len, bow = t > 0.7 ? (t - 0.7) / 0.3 : 0, half = (W / 2 - 2) * (1 - bow * bow * 0.95) * (0.7 + 0.3 * (z / 12)); if (Math.abs(y - cy) > half) return -1; if (z > 10) return Math.abs(y - cy) > half - 2.5 ? hull : deckM; return z > 5 && z < 7 ? st : hull; }, 0, 0, 0, len, W, 12);
  m.box(len * 0.18, cy - 8, 12, len * 0.4, cy + 8, 16, hull); m.box(len * 0.42, cy - 7, 12, len * 0.58, cy + 7, 20, hull);
  m.box(len * 0.55, cy - 1, 12, len * 0.55 + 2, cy + 1, 148, mast); m.box(len * 0.15, cy - 1, 26, len * 0.55, cy + 1, 28, mast);
  if (sail) m.fill((x, y, z) => { const t = (x - len * 0.17) / (len * 0.38), top = 28 + (1 - t) * 118 * 0 + t * 118; return t > 0 && t < 1 && z > 28 && z < 28 + (1 - Math.abs(t - 0.95) * 0.1) * 118 * t && Math.abs(y - cy - Math.sin(t * 2) * 2) < 1 ? cl : -1; }, 0, 0, 28, len, W, 148);
  else m.box(len * 0.16, cy - 2, 28, len * 0.55, cy + 2, 32, cover);
  return m;
}
export function kayakRack(n = 3) { const m = new Vox(46, 26, 26); const f = m.mat({ ramp: MAT.woodDark, k: 3 }); const cols = ['#e04a3a', '#e8b030', '#3a8ad8', '#3aa860'].map((c) => m.mat({ ramp: R(c), k: 3 })); for (const x of [4, 40]) m.box(x, 2, 0, x + 2, 24, 24, f); for (let i = 0; i < n; i++) { const z = 6 + i * 7; m.box(2, 2, z - 1, 44, 4, z, f); m.box(2, 22, z - 1, 44, 24, z, f); m.fill((x, y, zz) => (Math.abs(y - 13) < 5 * Math.sin(Math.PI * x / 46) && zz < z + 3 ? cols[i % 4] : -1), 0, 0, z, 46, 26, z + 3); } return m; }

// ---- airport -------------------------------------------------------------------------------------------
// a narrow-body airliner, nose toward +x, white with a coloured tail and cheatline
export function airliner(len = 460, span = 420, color = '#c83a30') {
  const H = 140, m = new Vox(len, span, H), cy = span / 2;
  const body = m.mat({ ramp: R('#ecebe6'), k: 3, shade: (x, y, z) => (Math.round(x) % 46 === 0 ? -0.4 : 0) });
  const livery = m.mat({ ramp: R(color), k: 3 }), win = m.mat({ ramp: R('#2a3444'), k: 2, flag: F_GLASS }), grey = m.mat({ ramp: R('#a8acb4'), k: 3 }), dk = m.mat({ ramp: R('#2a2c34'), k: 2 }), tyre = m.mat({ ramp: MAT.tyre, k: 1 });
  const nav = (c) => m.mat({ ramp: R(c, 5, 3), k: 4, emi: c === '#e83a30' ? [255, 60, 50, 255] : c === '#40d070' ? [80, 255, 120, 255] : [255, 255, 240, 255], flag: F_NOCAST });
  const fz = 40, fr = 22;
  m.fill((x, y, z) => {
    const t = x / len;
    let r = fr;
    if (t > 0.86) r = fr * Math.sqrt(Math.max(0, 1 - ((t - 0.86) / 0.14) ** 2) * 1) * 0.98 + 1;
    if (t < 0.14) { const k = (0.14 - t) / 0.14; r = fr * (1 - k * 0.7); }
    const zc = fz + (t < 0.14 ? (0.14 - t) * 60 : 0);
    const d = Math.hypot(y - cy, (z - zc) * 1.05);
    if (d > r) return -1;
    if (t > 0.86 && z > zc + r * 0.25 && Math.abs(y - cy) < r * 0.7 && t < 0.95) return win;     // cockpit windows
    if (Math.abs(z - (zc + r * 0.38)) < 1.4 && t > 0.18 && t < 0.84 && Math.round(x) % 6 < 3) return win;   // cabin windows
    if (z < zc - r * 0.2 && z > zc - r * 0.45 && t > 0.2 && t < 0.85) return livery;
    if (z < zc - r * 0.6) return grey;
    return body;
  }, 0, Math.floor(cy - fr - 2), 0, len, Math.ceil(cy + fr + 2), H);
  // wings (swept), engines under them
  const wx = len * 0.48;
  m.fill((x, y, z) => { const dy = Math.abs(y - cy), sweep = dy * 0.42, chord = 70 - dy * 0.22; if (dy < fr - 2 || dy > span / 2 - 2) return -1; const lx = wx - sweep; if (x > lx || x < lx - chord) return -1; return z >= fz - 6 + dy * 0.05 && z < fz - 2 + dy * 0.05 ? (dy > span / 2 - 8 ? livery : body) : -1; }, 0, 0, fz - 8, len, span, fz + 14);
  for (const s of [-1, 1]) { const ey = cy + s * span * 0.2; m.cyl('x', 0, ey, fz - 16, 9, wx - span * 0.2 * 0.42 - 20, wx - span * 0.2 * 0.42 + 26, grey); m.cyl('x', 0, ey, fz - 16, 6.5, wx - span * 0.2 * 0.42 + 24, wx - span * 0.2 * 0.42 + 27, dk); }
  // tail: fin and stabilisers
  m.fill((x, y, z) => { const t = (x - 6) / 70; if (t < 0 || t > 1 || Math.abs(y - cy) > 1.5) return -1; return z > fz + 14 && z < fz + 14 + (1 - t * 0.2) * 70 * (1 - Math.max(0, t - 0.6) * 1.8) && x > 6 + (z - fz - 14) * 0.6 ? livery : -1; }, 0, 0, fz, 90, span, H);
  m.fill((x, y, z) => { const dy = Math.abs(y - cy); if (dy > 80 || dy < 4) return -1; const lx = 50 - dy * 0.35; return x < lx && x > lx - 34 + dy * 0.12 && z >= fz + 6 && z < fz + 9 ? body : -1; }, 0, 0, fz, 90, span, fz + 12);
  // landing gear
  for (const [x, y] of [[len * 0.88, cy], [wx - 30, cy - 24], [wx - 30, cy + 24]]) { m.box(x - 1, y - 1, 8, x + 1, y + 1, fz - 14, grey); m.cyl('y', x, 0, 6, 6, y - 4, y + 4, tyre); }
  for (const [x, y, c] of [[wx - span / 2 * 0.42 - 2, 2, '#e83a30'], [wx - span / 2 * 0.42 - 2, span - 4, '#40d070'], [2, cy, '#ffffff']]) m.box(x, y, fz - 4, x + 3, y + 2, fz - 1, nav(c));
  m.smooth = 1;
  return m;
}
// a jet bridge: a rotunda by the terminal, a long glazed corridor on a wheeled leg, and a cab
export function jetBridge(len = 180, on = 1) {
  const m = new Vox(len, 34, 62);
  const b = m.mat({ ramp: R('#a8acb4'), k: 3, shade: (x) => (Math.round(x) % 30 === 0 ? -1 : 0) }), g = m.mat({ ramp: R('#d8c090', 5, 2), k: 3, emi: [255, 210, 140, 30 + on * 100], flag: F_GLASS }), dk = m.mat({ ramp: R('#2a2c34'), k: 2 }), tyre = m.mat({ ramp: MAT.tyre, k: 1 });
  m.cyl('z', 16, 17, 0, 15, 0, 56, b);
  m.fill((x, y, z) => (z > 30 && z < 54 && y > 6 && y < 28 ? ((y < 7.5 || y > 26.5) && z > 38 && z < 48 && Math.round(x) % 14 > 2 ? g : b) : -1), 26, 0, 30, len - 18, 34, 56);
  m.box(len - 20, 2, 26, len, 32, 56, b); m.box(len - 2, 6, 30, len, 28, 52, dk);
  m.box(len * 0.65, 13, 0, len * 0.65 + 6, 21, 30, dk); for (const y of [9, 22]) m.cyl('y', len * 0.65 + 3, 0, 5, 5, y, y + 4, tyre);
  return m;
}
export function baggageCart(load = '#5a6a7a') { const m = new Vox(36, 24, 26); const f = m.mat({ ramp: MAT.metal, k: 3 }), c = m.mat({ ramp: R(load), k: 3, shade: (x, y, z) => (Math.round(z) % 6 === 0 ? -0.8 : 0) }), t = m.mat({ ramp: MAT.tyre, k: 1 }); m.box(0, 0, 5, 36, 24, 7, f); m.box(2, 2, 7, 34, 22, 24, c); m.box(-0, 11, 4, 4, 13, 6, f); for (const [x, y] of [[6, 0], [30, 0], [6, 22], [30, 22]]) m.cyl('y', x, 0, 3, 3, y, y + 2, t); return m; }
export function beltLoader() { const m = new Vox(80, 26, 46); const b = m.mat({ ramp: R('#ecebe4'), k: 3 }), belt = m.mat({ ramp: R('#2a2a30'), k: 2, shade: (x) => (Math.round(x) % 4 === 0 ? 0.8 : 0) }), y = m.mat({ ramp: R('#e8c030'), k: 3 }), t = m.mat({ ramp: MAT.tyre, k: 1 }); m.box(0, 3, 4, 60, 23, 14, b); m.box(4, 5, 14, 22, 21, 26, b); m.box(6, 6, 18, 20, 20, 25, m.mat({ ramp: MAT.glassDark, k: 2 })); for (let k = 0; k < 60; k++) m.box(20 + k, 9, 14 + k * 0.48, 22 + k, 17, 17 + k * 0.48, belt); m.box(0, 3, 4, 60, 4, 8, y); for (const x of [10, 50]) for (const yy of [1, 21]) m.cyl('y', x, 0, 5, 5, yy, yy + 4, t); return m; }
export function aircraftTug() { const m = new Vox(56, 34, 22); const b = m.mat({ ramp: R('#ecebe4'), k: 3 }), y = m.mat({ ramp: R('#e8c030'), k: 3, shade: (x, yy, z) => ((Math.floor((x + z) / 4)) % 2 ? -2.5 : 0) }), g = m.mat({ ramp: MAT.glassDark, k: 2 }), t = m.mat({ ramp: MAT.tyre, k: 1 }); m.box(0, 2, 4, 56, 32, 14, b); m.box(0, 2, 4, 56, 3, 10, y); m.box(0, 31, 4, 56, 32, 10, y); m.box(36, 6, 14, 52, 28, 22, b); m.box(52, 8, 15, 53, 26, 21, g); for (const x of [10, 46]) for (const yy of [0, 28]) m.cyl('y', x, 0, 6, 6, yy, yy + 6, t); return m; }
export function controlTower(h = 220, on = 1) {
  const m = new Vox(70, 70, h + 50);
  const c = m.mat({ ramp: R('#b8b4aa'), k: 3, shade: (x, y, z) => (Math.round(z) % 20 === 0 ? -0.6 : 0) + ((Math.round(z) % 40 > 30 && (Math.abs(x - 35) < 4 || Math.abs(y - 35) < 4)) ? -1.4 : 0) }), g = m.mat({ ramp: R('#d8c088', 5, 2), k: 3, emi: [255, 214, 150, 40 + on * 140], flag: F_GLASS }), rf = m.mat({ ramp: R('#4a4e58'), k: 3 }), ant = m.mat({ ramp: MAT.metal, k: 2 }), red = m.mat({ ramp: R('#e83a30', 5, 3), k: 4, emi: [255, 50, 40, 255], flag: F_NOCAST });
  m.cyl('z', 35, 35, 0, 16, 0, h, c);
  m.fill((x, y, z) => { const d = Math.hypot(x - 35, y - 35); if (z < h) return -1; if (z < h + 6) return d < 30 ? c : -1; if (z < h + 30) return d < 30 ? (d > 27 && (Math.round(Math.atan2(y - 35, x - 35) * 6) % 4) ? g : d > 27 ? c : -1) : -1; return d < 32 - (z - h - 30) * 1.2 ? rf : -1; }, 0, 0, h, 70, 70, h + 40);
  for (const [x, y, hh] of [[30, 30, 14], [42, 36, 10]]) { m.box(x, y, h + 38, x + 2, y + 2, h + 38 + hh, ant); }
  m.box(30, 30, h + 49, 32, 32, h + 50, red);
  return m;
}
export function runwayLight(col = '#3a6ae8') { const m = new Vox(4, 4, 6); const p = m.mat({ ramp: MAT.metalDark, k: 2 }), l = m.mat({ ramp: R(col, 5, 3), k: 4, emi: [...[parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)], 255], flag: F_NOCAST }); m.box(1, 1, 0, 3, 3, 3, p); m.box(0, 0, 3, 4, 4, 6, l); return m; }
export function approachLightBar(n = 5) { const m = new Vox(8, n * 10, 16); const p = m.mat({ ramp: MAT.metalDark, k: 2 }), l = m.mat({ ramp: R('#f8e0a0', 5, 3), k: 4, emi: [255, 230, 170, 255], flag: F_NOCAST }); m.box(3, 0, 10, 5, n * 10, 12, p); for (let i = 0; i < n; i++) { m.box(3, i * 10 + 4, 0, 5, i * 10 + 6, 10, p); m.box(2, i * 10 + 3, 12, 6, i * 10 + 7, 15, l); } m.box(3, n * 5 - 1, 0, 5, n * 5 + 1, 12, p); return m; }
// a soundproofing wall panel run (along x)
export function soundWall(len = 120, h = 40) { const m = new Vox(len, 6, h); const c = m.mat({ ramp: R('#9a958c'), k: 3, shade: (x, y, z) => (Math.round(x) % 30 === 0 ? -1.2 : 0) + (Math.round(z) % 10 === 0 ? -0.4 : 0) }); m.box(0, 1, 0, len, 5, h, c); return m; }

// ---- alley dressing ------------------------------------------------------------------------------------
// a paper lantern (hung on a wire: place with dz), red or another colour, glowing when lit
export function lantern(color = '#d8302c', on = 1) {
  const m = new Vox(10, 10, 14);
  const p = m.mat({ ramp: R(color, 5, 3), k: 4, emi: on ? [255, 120, 70, 200] : null, flag: F_NOCAST, shade: (x, y, z) => (Math.round(z) % 3 === 0 ? -0.8 : 0) });
  const cap = m.mat({ ramp: R('#2a2224'), k: 2 }), tas = m.mat({ ramp: R('#e8b040'), k: 3 });
  m.ell(5, 5, 7, 4.4, 4.4, 4.6, p); m.box(3, 3, 11, 7, 7, 13, cap); m.box(3, 3, 2, 7, 7, 3, cap); m.box(4, 4, 0, 6, 6, 2, tas);
  return m;
}
// a hanging blade sign on a wall bracket: a tall narrow board (lit), facing south
export function bladeSign(color = '#c8242a', on = 1, glyph = '#f4d070') {
  const m = new Vox(14, 6, 46);
  const br = m.mat({ ramp: MAT.metalDark, k: 2 });
  const b = m.mat({ ramp: R(color, 5, 3), k: 3, emi: on ? [255, 90, 80, 120] : null, flag: F_NOCAST });
  const g = m.mat({ ramp: R(glyph, 5, 3), k: 4, emi: on ? [255, 220, 120, 255] : null, flag: F_NOCAST });
  m.box(6, 0, 40, 8, 6, 42, br);
  m.box(1, 2, 8, 13, 4, 40, b);
  for (let k = 0; k < 4; k++) { const z = 12 + k * 7; m.box(4, 4, z, 10, 5, z + 1, g); m.box(6, 4, z + 1, 8, 5, z + 5, g); if (k % 2) m.box(4, 4, z + 4, 10, 5, z + 5, g); }
  m.box(1, 2, 8, 13, 3, 9, br); m.box(1, 2, 39, 13, 3, 40, br);
  return m;
}
// a wall vent with a plume of steam rising from it
export function steamVent() {
  const m = new Vox(18, 14, 60);
  const box = m.mat({ ramp: R('#8a8c90'), k: 3, shade: (x, y, z) => (Math.round(z) % 2 === 0 && z < 10 ? -0.8 : 0) });
  const st = m.mat({ ramp: R('#eef0f2', 5, 3), k: 4, emi: [220, 225, 230, 40], flag: F_NOCAST });
  m.box(2, 0, 0, 16, 10, 12, box);
  m.fill((x, y, z) => { const cx = 9 + Math.sin(z * 0.15) * 3, r = 2 + z * 0.07; return Math.hypot(x - cx, y - 6) < r && hash(Math.round(x), Math.round(y), Math.round(z)) > 0.35 + z * 0.01 ? st : -1; }, 0, 0, 12, 18, 14, 60);
  return m;
}
// a two-wheeled hand truck stacked with boxes
export function handTruck(boxes = 2) {
  const m = new Vox(14, 12, 34);
  const f = m.mat({ ramp: R('#c8342a'), k: 3 }), wh = m.mat({ ramp: MAT.tyre, k: 2 }), bx = m.mat({ ramp: R('#b08a58'), k: 3, shade: (x, y, z) => (Math.round(z) % 9 === 0 ? -1 : 0) });
  for (const x of [1, 12]) m.box(x, 9, 2, x + 1, 11, 34, f);
  m.box(1, 2, 2, 13, 11, 3, f); for (const x of [0, 12]) m.cyl('x', x + 1, 9, 3, 3, 0, 2, wh);
  for (let k = 0; k < boxes; k++) m.box(2, 2 + k, 3 + k * 10, 12, 9, 12 + k * 10, bx);
  return m;
}
// a shopping trolley (abandoned), wire basket
export function trolley() {
  const m = new Vox(26, 16, 22);
  const w = m.mat({ ramp: MAT.metal, k: 2 }), wh = m.mat({ ramp: MAT.tyre, k: 2 });
  m.fill((x, y, z) => { const inX = x > 2 && x < 22, inY = y > 1 && y < 15, inZ = z > 8 && z < 20; if (!(inX && inY && inZ)) return -1; const edge = x < 4 || x > 20 || y < 3 || y > 13 || z < 10; return edge && (Math.round(x + z) % 3 === 0 || Math.round(y + z) % 3 === 0 || z < 10 || z > 18) ? w : -1; });
  m.box(22, 2, 18, 26, 14, 20, w); m.box(3, 2, 4, 21, 3, 5, w); m.box(3, 13, 4, 21, 14, 5, w);
  for (const [x, y] of [[4, 2], [4, 13], [19, 2], [19, 13]]) { m.box(x, y, 2, x + 1, y + 1, 9, w); m.box(x, y, 0, x + 2, y + 1, 2, wh); }
  return m;
}
// a yellow steel bollard (alley corner guard)
export function guardPost(h = 16) {
  const m = new Vox(6, 6, h);
  const y = m.mat({ ramp: R('#e0b030', 5, 3), k: 3, shade: (x, yy, z) => (Math.abs(z - h + 5) < 1 ? -1.5 : 0) });
  m.cyl('z', 3, 3, 0, 2.6, 0, h - 1, y); m.ell(3, 3, h - 1.5, 2.6, 2.6, 1.5, y);
  return m;
}
// a fruit and veg crate stand: three tiers of crates
export function produceStand(w = 40) {
  const m = new Vox(w, 18, 22);
  const wd = m.mat({ ramp: MAT.woodDock, k: 3 });
  const fr = ['#d8402c', '#e8a030', '#6aa83a', '#e8d040', '#8a3a7a'].map((c) => m.mat({ ramp: R(c, 5, 3), k: 4 }));
  for (let t = 0; t < 3; t++) { const y0 = t * 6, z0 = t * 7; m.box(0, y0, 0, w, y0 + 6, z0 + 5, wd); for (let x = 1; x < w - 1; x += 2) for (let y = y0 + 1; y < y0 + 5; y += 2) m.box(x, y, z0 + 5, x + 2, y + 2, z0 + 7, fr[Math.floor(x / 8 + t) % fr.length]); }
  return m;
}
// a wall lamp on a bracket (for alleys; the bracket stands against the wall it's placed by)
export function wallLamp(on = 0, h = 46) {
  const m = new Vox(8, 12, h + 4);
  const br = m.mat({ ramp: MAT.metalDark, k: 2, flag: F_THIN }), sh = m.mat({ ramp: R('#2e3a34'), k: 3, flag: F_THIN });
  const bulb = m.mat({ ramp: R('#fff0c0', 5, 3), k: 4, emi: [255, 214, 150, 90 + on * 165], flag: F_NOCAST });
  m.box(3, 0, 0, 5, 2, h, br); m.box(3, 0, h - 2, 5, 9, h, br);
  m.ell(4, 9, h - 3, 3.6, 3.2, 2.4, sh); m.box(2, 8, h - 6, 6, 11, h - 4, bulb);
  return m;
}
