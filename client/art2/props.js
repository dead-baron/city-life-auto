// Art v2 props and vehicles as voxel models (voxel.js), so they shade, cast shadows and turn like
// everything else. Each maker returns a Vox; render it with .render(heading) and cache the sprite.
import { Vox } from './voxel.js';
import { MAT, ramp, hex } from './palette.js';
import { F_GLASS, F_NOCAST, F_LEAF, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);

// ---- street furniture -----------------------------------------------------------------------------
export function lampPost(kind = 'cast', on = 0) {
  const tall = kind === 'cast' ? 74 : 96;
  const m = new Vox(kind === 'cast' ? 12 : 30, 12, tall + 10);
  const pole = m.mat({ ramp: kind === 'cast' ? R('#2f5a4a') : MAT.metal, k: 2 });
  const glass = m.mat({ ramp: R('#f4d9a0', 5, 3), k: 3, emi: on ? [255, 200, 120, 255] : null, flag: F_NOCAST });
  if (kind === 'cast') {
    m.cyl('z', 6, 6, 0, 3.2, 0, 6, pole);                  // base
    m.cyl('z', 6, 6, 0, 1.6, 6, tall, pole);
    m.box(1, 1, tall + 2, 11, 11, tall + 4, pole);        // lantern: cap, glass, base ring
    m.box(2, 2, tall - 10, 10, 10, tall + 2, glass);
    m.box(1, 1, tall - 12, 11, 11, tall - 10, pole);
    m.box(4, 4, tall + 4, 8, 8, tall + 7, pole);
  } else {
    m.cyl('z', 4, 6, 0, 2, 0, tall, pole);
    m.box(4, 5, tall - 2, 28, 7, tall, pole);              // arm
    m.box(20, 3, tall - 4, 29, 9, tall - 2, glass);
  }
  return m;
}
export function hydrant() {
  const m = new Vox(10, 10, 16);
  const red = m.mat({ ramp: R('#c23a30'), k: 3 }), cap = m.mat({ ramp: R('#d8b040'), k: 3 });
  m.cyl('z', 5, 5, 0, 4, 0, 2, red); m.cyl('z', 5, 5, 0, 3, 2, 12, red); m.ell(5, 5, 12, 3, 3, 3, cap);
  m.box(1, 4, 7, 9, 6, 9, red);
  return m;
}
export function bin(overflow = true) {
  const m = new Vox(12, 12, 20);
  const body = m.mat({ ramp: R('#3c5a4a'), k: 3 }), rim = m.mat({ ramp: MAT.metalDark, k: 2 });
  const junk = [m.mat({ ramp: R('#e0d6c0'), k: 3 }), m.mat({ ramp: R('#c8443a'), k: 3 }), m.mat({ ramp: R('#4a76b0'), k: 3 }), m.mat({ ramp: R('#2c2c30'), k: 2 })];
  m.cyl('z', 6, 6, 0, 5.5, 0, 16, body, 4.2, 0);
  m.cyl('z', 6, 6, 0, 6, 15, 16, rim);
  if (overflow) m.fill((x, y, z) => { const d = Math.hypot(x - 6, y - 6); return d < 5.5 && z < 16 + 3.5 - d * 0.6 ? junk[Math.floor(hash(x | 0, y | 0, z | 0) * 4)] : -1; }, 0, 0, 12, 12, 12, 20);
  return m;
}
export function newsBox(color = '#2f5aa8') {
  const m = new Vox(10, 9, 18);
  const b = m.mat({ ramp: R(color), k: 3 }), g = m.mat({ ramp: MAT.glass, k: 3, flag: F_GLASS }), leg = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.box(1, 1, 0, 3, 3, 5, leg); m.box(7, 1, 0, 9, 3, 5, leg); m.box(1, 6, 0, 3, 8, 5, leg); m.box(7, 6, 0, 9, 8, 5, leg);
  m.box(0, 0, 5, 10, 9, 18, b); m.box(2, 8, 10, 8, 9, 15, g);
  return m;
}
export function bench() {
  const m = new Vox(32, 10, 14);
  const wood = m.mat({ ramp: MAT.woodDock, k: 3 }), iron = m.mat({ ramp: MAT.metalDark, k: 2 });
  for (const x of [2, 28]) { m.box(x, 1, 0, x + 2, 9, 7, iron); m.box(x, 1, 7, x + 2, 3, 14, iron); }
  for (let y = 2; y < 9; y += 3) m.box(1, y, 7, 31, y + 2, 8, wood);
  m.box(1, 1, 9, 31, 2, 10, wood); m.box(1, 1, 12, 31, 2, 13, wood);
  return m;
}
export function bollard(h = 12) { const m = new Vox(6, 6, h); const b = m.mat({ ramp: MAT.metalDark, k: 3 }); m.cyl('z', 3, 3, 0, 2.6, 0, h - 1, b); m.ell(3, 3, h - 1.5, 2.6, 2.6, 1.5, b); return m; }
export function acUnit() {
  const m = new Vox(18, 14, 12);
  const b = m.mat({ ramp: R('#b8bcc0'), k: 3 }), f = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.box(0, 0, 0, 18, 14, 11, b);
  m.fill((x, y, z) => (Math.hypot(x - 9, y - 7) < 5 && ((Math.round(x) + Math.round(y)) % 2 === 0) ? f : -1), 0, 0, 10, 18, 14, 11);
  return m;
}
export function waterTank() {
  const m = new Vox(26, 26, 44);
  const wood = m.mat({ ramp: R('#7a5038'), k: 3, shade: (x, y, z) => (Math.floor(Math.atan2(y - 13, x - 13) * 6) % 2 ? -0.4 : 0) }), leg = m.mat({ ramp: MAT.metalDark, k: 2 }), roof = m.mat({ ramp: R('#4e3a30'), k: 3 });
  for (const [x, y] of [[5, 5], [19, 5], [5, 19], [19, 19]]) m.box(x, y, 0, x + 2, y + 2, 14, leg);
  m.cyl('z', 13, 13, 0, 11, 14, 36, wood);
  for (const z of [18, 26, 34]) m.cyl('z', 13, 13, 0, 11.6, z, z + 1, leg);
  m.fill((x, y, z) => (Math.hypot(x - 13, y - 13) < 12 - (z - 36) * 1.4 ? roof : -1), 0, 0, 36, 26, 26, 44);
  return m;
}
export function planter(plants = true) {
  const m = new Vox(24, 14, 22);
  const c = m.mat({ ramp: MAT.concrete, k: 3 }), soil = m.mat({ ramp: MAT.soil, k: 2 }), lf = m.mat({ ramp: MAT.leaf, k: 3, flag: F_LEAF }), fl = m.mat({ ramp: R('#d84a78'), k: 3 }), fl2 = m.mat({ ramp: R('#e8c040'), k: 3 });
  m.box(0, 0, 0, 24, 14, 9, c); m.box(2, 2, 8, 22, 12, 9, soil);
  if (plants) m.fill((x, y, z) => { const h = hash(x | 0, y | 0, 5); const top = 9 + 8 * (0.5 + 0.5 * Math.sin(x * 0.7) * Math.cos(y * 0.9)) + h * 3; return z < top && x > 2 && x < 22 && y > 2 && y < 12 && h > 0.25 ? (z > top - 1.5 && h > 0.85 ? (h > 0.93 ? fl : fl2) : lf) : -1; }, 0, 0, 9, 24, 14, 22);
  return m;
}
export function pottedPalm() {
  const m = new Vox(22, 22, 40);
  const pot = m.mat({ ramp: MAT.terracotta, k: 3 }), lf = m.mat({ ramp: MAT.palmLeaf, k: 3, flag: F_LEAF });
  m.cyl('z', 11, 11, 0, 6, 0, 10, pot); m.cyl('z', 11, 11, 0, 7, 9, 11, pot);
  for (let a = 0; a < 7; a++) { const ang = a / 7 * 6.28 + 0.3; for (let s = 0; s < 14; s++) { const x = 11 + Math.cos(ang) * s * 0.75, y = 11 + Math.sin(ang) * s * 0.75, z = 12 + s * 1.6 - s * s * 0.07; m.box(x, y, z, x + 1.6, y + 1.6, z + 1.4, lf); } }
  return m;
}
export function umbrella(stripe = '#e8dcc0', base = '#2f7a5c') {
  const m = new Vox(30, 30, 30);
  const pole = m.mat({ ramp: MAT.metal, k: 3 }), a = m.mat({ ramp: R(base), k: 3 }), b = m.mat({ ramp: R(stripe), k: 3 });
  m.cyl('z', 15, 15, 0, 1, 0, 26, pole);
  m.fill((x, y, z) => { const d = Math.hypot(x - 15, y - 15); return d < 14 && z <= 28 - d * 0.42 && z > 25 - d * 0.42 ? (Math.floor((Math.atan2(y - 15, x - 15) + 3.15) / 0.785) % 2 ? a : b) : -1; }, 0, 0, 18, 30, 30, 30);
  return m;
}
export function dumpster() {
  const m = new Vox(32, 18, 20);
  const g = m.mat({ ramp: R('#2f6a54'), k: 3 }), lid = m.mat({ ramp: R('#264a40'), k: 3 }), w = m.mat({ ramp: MAT.tyre, k: 2 });
  m.box(1, 1, 2, 31, 17, 16, g); m.box(0, 0, 16, 32, 18, 18, lid);
  for (const x of [4, 26]) m.cyl('y', x, 0, 2, 2, 1, 17, w);
  return m;
}
export function crate(tier = 1) {
  const m = new Vox(14, 14, 13);
  const pal = tier === 1 ? R('#a0703c') : tier === 2 ? R('#7a8890') : tier === 3 ? R('#5a6a3a') : R('#2c2c34');
  const b = m.mat({ ramp: pal, k: 3, shade: (x, y, z) => ((Math.round(z) % 4 === 0 || Math.round(x) % 7 === 0) ? -0.5 : 0) });
  m.box(0, 0, 0, 14, 14, 13, b);
  if (tier === 4) { const gold = m.mat({ ramp: R('#e8b840'), k: 3, emi: [255, 210, 110, 60] }); m.box(0, 0, 12, 14, 14, 13, gold); m.box(0, 6, 0, 14, 8, 13, gold); }
  return m;
}

// ---- vehicles -------------------------------------------------------------------------------------
// type: sedan | taxi | pickup | convertible ; paint ramp ; lights 0..1 (headlights glow)
export function car(type = 'sedan', paint = MAT.paintBlue, opt = {}) {
  const L = type === 'pickup' ? 110 : 100, W = type === 'pickup' ? 50 : 46, Hh = type === 'pickup' ? 36 : 32;
  const m = new Vox(L, W, Hh);
  const body = m.mat({ ramp: paint, k: 3, gloss: 1 });
  const dark = m.mat({ ramp: ramp(paint[1], 5, 2), k: 2 });
  const glass = m.mat({ ramp: MAT.glassDark, k: 3, flag: F_GLASS, shade: (x, y, z) => ((Math.round(x + z) % 11) < 2 ? 1.2 : 0) });
  const tyre = m.mat({ ramp: MAT.tyre, k: 2 }), hub = m.mat({ ramp: MAT.chrome, k: 2 });
  const chrome = m.mat({ ramp: MAT.chrome, k: 3 });
  const lit = opt.lights || 0;
  const head = m.mat({ ramp: R('#f4ecd0', 5, 3), k: 3, emi: lit ? [255, 240, 200, 255] : null });
  const tail = m.mat({ ramp: R('#d8302a', 5, 3), k: 3, emi: lit ? [255, 60, 40, 220] : [255, 40, 30, 40] });
  const interior = m.mat({ ramp: R('#3a3030'), k: 2 });
  const rr = 7; // corner rounding in plan
  const inPlan = (x, y, x0, x1, y0, y1, r) => { const cx = Math.max(x0 + r, Math.min(x1 - r, x)), cy = Math.max(y0 + r, Math.min(y1 - r, y)); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
  // wheels
  for (const wx of [L * 0.2, L * 0.79]) for (const [y0, y1] of [[3, 9], [W - 9, W - 3]]) m.cyl('y', wx, 0, 8, 8, y0, y1, tyre, 4, hub);
  // lower body
  const bodyTop = type === 'pickup' ? 20 : 18;
  m.fill((x, y, z) => {
    if (!inPlan(x, y, 2, L - 2, 2, W - 2, rr)) return -1;
    // wheel arches
    for (const wx of [L * 0.2, L * 0.79]) if ((x - wx) ** 2 + (z - 8) ** 2 < 100 && (y < 9 || y > W - 9)) return -1;
    // rounded top edge
    const ex = Math.min(x - 2, L - 2 - x), ey = Math.min(y - 2, W - 2 - y);
    if (z > bodyTop - 2 && (ex < 2 || ey < 2)) return -1;
    return z < 9 && (y < 4 || y > W - 4) ? dark : body;
  }, 0, 0, 5, L, W, bodyTop);
  // bumpers and lights
  m.box(0, 4, 7, 3, W - 4, 11, chrome); m.box(L - 3, 4, 7, L, W - 4, 11, chrome);
  m.box(L - 3, 5, 12, L - 1, 12, 16, head); m.box(L - 3, W - 12, 12, L - 1, W - 5, 16, head);
  m.box(1, 5, 12, 3, 11, 16, tail); m.box(1, W - 11, 12, 3, W - 5, 16, tail);
  if (type === 'pickup') {
    // cab and an open bed
    m.fill((x, y, z) => {
      if (x < 52 || x > 84 || y < 6 || y > W - 6) return -1;
      const front = 84 - (z - bodyTop) * 0.7, back = 52 + (z - bodyTop) * 0.15;
      if (x > front || x < back) return -1;
      const side = y < 8 || y > W - 8, pillar = x < back + 3 || x > front - 3;
      return z > bodyTop + 2 && !(pillar && !side) && (side ? !pillar : true) ? glass : body;
    }, 0, 0, bodyTop, L, W, Hh);
    // hollow the bed (keep the walls)
    m.fill((x, y) => (x > 6 && x < 48 && y > 5 && y < W - 5 ? 0 : -1), 0, 0, 11, L, W, bodyTop);
    const bedFloor = m.mat({ ramp: MAT.metalDark, k: 3 });
    m.box(7, 6, 10, 48, W - 6, 11, bedFloor);
    if (opt.crate) { const c = m.mat({ ramp: R('#a0703c'), k: 3, shade: (x, y, z) => ((Math.round(z) % 4 === 0 || Math.round(x) % 7 === 0) ? -0.5 : 0) }); m.box(16, 14, 11, 32, 30, 24, c); m.box(34, 18, 11, 44, 30, 20, c); }
  } else if (type === 'convertible') {
    m.fill((x, y) => (x > 26 && x < 72 && y > 6 && y < W - 6 ? 0 : -1), 0, 0, 12, L, W, bodyTop);
    m.box(26, 6, 10, 72, W - 6, 12, interior);
    for (const sx of [34, 54]) { m.box(sx, 8, 12, sx + 7, W / 2 - 2, 20, interior); m.box(sx, W / 2 + 2, 12, sx + 7, W - 8, 20, interior); }
    // windscreen frame
    m.fill((x, y, z) => (x > 70 - (z - bodyTop) * 0.8 && x < 73 - (z - bodyTop) * 0.8 && y > 6 && y < W - 6 ? glass : -1), 60, 0, bodyTop, 76, W, bodyTop + 8);
  } else {
    // cabin with a sloped windscreen and back window
    m.fill((x, y, z) => {
      const t = z - bodyTop;
      const front = 76 - t * 1.25, back = 26 + t * 0.9;
      const inset = 5 + t * 0.45;
      if (x > front || x < back || y < inset || y > W - inset) return -1;
      if (z >= Hh - 1) return body;                                   // roof
      const pillar = (x > front - 3) || (x < back + 3) || Math.abs(x - 50) < 1.5;
      const sideZone = y < inset + 2 || y > W - inset - 2;
      if (t > 1 && !(pillar && sideZone)) return glass;
      return body;
    }, 0, 0, bodyTop, L, W, Hh);
    // flat roof cap
    m.fill((x, y, z) => { const t = z - bodyTop, front = 76 - t * 1.25, back = 26 + t * 0.9, inset = 5 + t * 0.45; return x <= front && x >= back && y >= inset && y <= W - inset ? body : -1; }, 0, 0, Hh - 1, L, W, Hh);
    if (type === 'taxi') {
      const sign = m.mat({ ramp: R('#f4f0d8'), k: 3, emi: lit ? [255, 240, 180, 200] : null });
      m.box(44, W / 2 - 6, Hh - 1, 56, W / 2 + 6, Hh, sign);
      const chk = m.mat({ ramp: R('#2a2a2e'), k: 2 }), wht = m.mat({ ramp: MAT.paintWhiteCar, k: 3 });
      m.fill((x, y, z) => ((y < 3 || y > W - 3) && z >= 11 && z < 14 && x > 26 && x < 76 ? (((Math.floor(x / 3) + Math.floor(z / 1.5)) % 2) ? chk : wht) : -1), 0, 0, 10, L, W, 15);
    }
  }
  return m;
}

// ---- beach, marina and back-yard kit ---------------------------------------------------------------
export function lifeguardTower() {
  const m = new Vox(34, 30, 46);
  const wood = m.mat({ ramp: R('#d8d0c0'), k: 3 }), teal = m.mat({ ramp: R('#3f8a8e'), k: 3 }), roof = m.mat({ ramp: R('#2f6a70'), k: 3 }), glass = m.mat({ ramp: MAT.glassDark, k: 3, flag: F_GLASS });
  for (const [x, y] of [[4, 6], [26, 6], [4, 24], [26, 24]]) m.box(x, y, 0, x + 3, y + 3, 22, wood);
  m.box(2, 4, 20, 32, 28, 22, wood);                        // deck
  m.box(6, 8, 22, 28, 24, 38, teal); m.box(10, 23, 27, 24, 24, 34, glass);
  m.fill((x, y, z) => (z < 46 - Math.abs(y - 16) * 0.5 && z >= 38 ? roof : -1), 4, 6, 38, 30, 26, 46);
  for (let s = 0; s < 18; s++) m.box(12 + 0, 28 + Math.floor(s * 0.1), 20 - s, 22, 30, 21 - s, wood);   // ramp down to the sand
  return m;
}
export function surfboard(color = '#e8a040') {
  const m = new Vox(8, 4, 34);
  const b = m.mat({ ramp: R(color), k: 3 }), s = m.mat({ ramp: R('#f0ece0'), k: 3 });
  m.ell(4, 2, 17, 3.5, 1.4, 16.5, b); m.box(3.5, 0, 2, 4.5, 4, 32, s);
  return m;
}
export function volleyNet(len = 70) {
  const m = new Vox(len, 4, 26);
  const pole = m.mat({ ramp: MAT.metal, k: 3 }), net = m.mat({ ramp: R('#f0ece8'), k: 3, flag: F_NOCAST }), band = m.mat({ ramp: R('#3060b0'), k: 3 });
  m.box(0, 1, 0, 3, 3, 26, pole); m.box(len - 3, 1, 0, len, 3, 26, pole);
  m.fill((x, y, z) => ((Math.floor(x) % 3 === 0 || Math.floor(z) % 3 === 0) ? net : -1), 3, 2, 12, len - 3, 3, 22);
  m.box(3, 1, 22, len - 3, 3, 23, band);
  return m;
}
export function yacht() {
  const m = new Vox(110, 40, 30);
  const hull = m.mat({ ramp: MAT.paintWhiteCar, k: 3 }), stripe = m.mat({ ramp: R('#2f4a8a'), k: 3 }), deck = m.mat({ ramp: MAT.woodDock, k: 3 }), glass = m.mat({ ramp: MAT.glassDark, k: 3, flag: F_GLASS });
  m.fill((x, y, z) => { const taper = x > 80 ? (x - 80) / 30 : 0; const half = 19 * (1 - taper * taper * 0.9); return Math.abs(y - 20) < half && z < 12 ? (z > 7 && z < 9 ? stripe : z === 11.5 ? deck : hull) : -1; }, 0, 0, 0, 110, 40, 12);
  m.fill((x, y) => { const taper = x > 80 ? (x - 80) / 30 : 0; return Math.abs(y - 20) < 17 * (1 - taper * taper * 0.9) ? deck : -1; }, 2, 0, 11, 108, 40, 12);
  m.box(26, 9, 12, 74, 31, 22, hull); m.box(30, 10, 15, 72, 30, 20, glass); m.box(34, 12, 22, 66, 28, 28, hull); m.box(38, 12, 23, 62, 28, 26, glass);
  return m;
}
export function piling(h = 20) { const m = new Vox(8, 8, h); const w = m.mat({ ramp: MAT.woodDark, k: 3 }); m.cyl('z', 4, 4, 0, 3.6, 0, h, w); return m; }
export function couch(color = '#8a5a3a') {
  const m = new Vox(36, 16, 18);
  const c = m.mat({ ramp: R(color), k: 3 });
  m.box(0, 0, 0, 36, 16, 8, c); m.box(0, 0, 8, 36, 4, 18, c); m.box(0, 0, 8, 4, 16, 13, c); m.box(32, 0, 8, 36, 16, 13, c);
  return m;
}
export function burnBarrel(lit = 1) {
  const m = new Vox(12, 12, 22);
  const b = m.mat({ ramp: R('#6a4a3a'), k: 3, shade: (x, y, z) => (Math.round(z) % 6 === 0 ? -0.6 : 0) }), fire = m.mat({ ramp: R('#ffb040', 5, 3), k: 3, emi: [255, 150, 60, 230 * lit], flag: F_NOCAST });
  m.cyl('z', 6, 6, 0, 5.5, 0, 16, b, 4.5, 0);
  m.fill((x, y, z) => (Math.hypot(x - 6, y - 6) < 4.5 - (z - 15) * 0.6 && hash(x | 0, y | 0, z | 0) > 0.35 ? fire : -1), 0, 0, 14, 12, 12, 22);
  return m;
}
export function laundryLine(len = 60) {
  const m = new Vox(len, 4, 30);
  const pole = m.mat({ ramp: MAT.metalDark, k: 3 }), line = m.mat({ ramp: R('#d8d8d0'), k: 3, flag: F_NOCAST });
  const cloths = ['#e8e4dc', '#d86a90', '#3e5f8f', '#e0b83a', '#8a8a92'].map((c) => m.mat({ ramp: R(c), k: 3 }));
  m.box(0, 1, 0, 2, 3, 30, pole); m.box(len - 2, 1, 0, len, 3, 30, pole);
  m.box(2, 2, 28, len - 2, 3, 29, line);
  for (let i = 0; i < 5; i++) { const x0 = 6 + i * ((len - 12) / 5), w = 7 + (i % 2) * 2, h = 9 + (i % 3) * 3; m.box(x0, 2, 28 - h, x0 + w, 3, 28, cloths[i]); }
  return m;
}
export function cafeTable() {
  const m = new Vox(14, 14, 12);
  const top = m.mat({ ramp: R('#e8e0d0'), k: 3 }), leg = m.mat({ ramp: MAT.metalDark, k: 2 }), chair = m.mat({ ramp: R('#4a6a5a'), k: 3 });
  m.cyl('z', 7, 7, 0, 1, 0, 10, leg); m.cyl('z', 7, 7, 0, 5.5, 10, 11, top);
  m.box(0, 5, 0, 3, 9, 7, chair); m.box(11, 5, 0, 14, 9, 7, chair);
  return m;
}
export function scooter(color = '#3a6ab0') {
  const m = new Vox(30, 10, 20);
  const b = m.mat({ ramp: R(color), k: 3 }), t = m.mat({ ramp: MAT.tyre, k: 2 }), seat = m.mat({ ramp: R('#2c2c30'), k: 2 });
  m.cyl('y', 5, 0, 4, 4, 3, 7, t); m.cyl('y', 25, 0, 4, 4, 3, 7, t);
  m.box(3, 2, 6, 22, 8, 12, b); m.box(20, 3, 6, 25, 7, 18, b); m.box(22, 1, 17, 25, 9, 19, seat); m.box(5, 2, 12, 16, 8, 14, seat);
  return m;
}
export function chalkboard() {
  const m = new Vox(12, 8, 18);
  const w = m.mat({ ramp: MAT.woodDark, k: 3 }), b = m.mat({ ramp: R('#2a302e'), k: 2, shade: (x, y, z) => (hash(x | 0, z | 0, 3) > 0.8 ? 2.5 : 0) });
  m.fill((x, y, z) => { const lean = (z / 18) * 3; return y > 1 + lean && y < 3 + lean ? (x < 1 || x > 11 || z > 16 || z < 2 ? w : b) : -1; });
  return m;
}
export function hedge(len = 40, h = 12) {
  const m = new Vox(len, 10, h + 3);
  const lf = m.mat({ ramp: MAT.leafDark, k: 3, flag: F_LEAF, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) > 0.75 ? 1 : hash(x | 0, y | 0, (z | 0) + 9) > 0.85 ? -1 : 0) });
  m.fill((x, y, z) => (z < h + Math.sin(x * 0.7) * 1.2 + hash(x | 0, y | 0, 4) * 1.5 ? lf : -1));
  return m;
}
export function flowerBed(len = 30) {
  const m = new Vox(len, 12, 10);
  const c = m.mat({ ramp: MAT.concrete, k: 4 }), soil = m.mat({ ramp: MAT.soil, k: 2 }), lf = m.mat({ ramp: MAT.leaf, k: 3, flag: F_LEAF });
  const fls = ['#d84a78', '#e8c040', '#f0ece8', '#9a6ad8', '#f08a3a'].map((h) => m.mat({ ramp: R(h), k: 3, flag: F_LEAF }));
  m.box(0, 0, 0, len, 12, 4, c); m.box(1, 1, 3, len - 1, 11, 4, soil);
  m.fill((x, y, z) => { const hh = hash(x | 0, y | 0, 77); const top = 4 + 3 + hh * 3; if (x < 1.5 || x > len - 1.5 || y < 1.5 || y > 10.5 || z >= top) return -1; return z > top - 1.2 && hh > 0.55 ? fls[Math.floor(hh * 50) % 5] : lf; }, 0, 0, 4, len, 12, 10);
  return m;
}
