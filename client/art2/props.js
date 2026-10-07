// Art v2 props and vehicles as voxel models (voxel.js), so they shade, cast shadows and turn like
// everything else. Each maker returns a Vox; render it with .render(heading) and cache the sprite.
import { Vox } from './voxel.js';
import { MAT, ramp, hex } from './palette.js';
import { F_GLASS, F_NOCAST, F_LEAF, F_THIN, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);

// ---- street furniture -----------------------------------------------------------------------------
// kind: 'cast' (old-town green cast iron), 'iron' (the same lantern in black iron), or the plain arm lamp
export function lampPost(kind = 'cast', on = 0) {
  const lantern = kind === 'cast' || kind === 'iron', tall = lantern ? 74 : 96;
  const m = new Vox(lantern ? 12 : 30, 12, tall + 10);
  const pole = m.mat({ ramp: kind === 'cast' ? R('#2f5a4a') : kind === 'iron' ? R('#34363c') : MAT.metal, k: 2, flag: F_THIN });
  const glass = m.mat({ ramp: R(kind === 'iron' ? '#f8d088' : '#f4d9a0', 5, 3), k: 3, emi: on ? (kind === 'iron' ? [255, 184, 96, 255] : [255, 200, 120, 255]) : null, flag: F_NOCAST });
  if (lantern) {
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
  // type: sedan | taxi | pickup | convertible
  const pickup = type === 'pickup';
  const L = pickup ? 112 : 100, W = pickup ? 50 : 46, Hh = pickup ? 38 : 34;
  const m = new Vox(L, W, Hh);
  const body = m.mat({ ramp: paint, k: 3 });
  const lower = m.mat({ ramp: ramp(paint[2], 5, 2), k: 2 });
  const glass = m.mat({ ramp: MAT.glassDark, k: 2, flag: F_GLASS, shade: (x, y, z) => ((Math.round(x * 0.7 + z) % 13) < 2 ? 2 : 0) });
  const tyre = m.mat({ ramp: MAT.tyre, k: 1 }), hub = m.mat({ ramp: MAT.chrome, k: 2 }), arch = m.mat({ ramp: MAT.tyre, k: 0 });
  const chrome = m.mat({ ramp: MAT.chrome, k: 3 }), trim = m.mat({ ramp: MAT.metalDark, k: 1 });
  const lit = opt.lights || 0;
  const head = m.mat({ ramp: R('#f6f0d8', 5, 3), k: 3, emi: lit ? [255, 244, 210, 255] : null });
  const tail = m.mat({ ramp: R('#d8302a', 5, 3), k: 3, emi: lit ? [255, 50, 36, 230] : [255, 40, 30, 50] });
  const interior = m.mat({ ramp: R('#3c3232'), k: 2 });
  const wheelX = [L * 0.2, L * 0.8], wr = 8.5;
  // plan shape: a rounded rectangle with softer, rounder ends
  const plan = (x, y, inset) => {
    const hx = L / 2 - 1 - inset, hy = W / 2 - 1 - inset, ux = x - L / 2, uy = y - W / 2;
    const ex = Math.abs(ux) / hx, ey = Math.abs(uy) / hy;
    return ex ** 6 + ey ** 4 <= 1;
  };
  // lower body: sills, doors, bumpers; a slight tumblehome toward the top
  const beltZ = pickup ? 21 : 19;
  m.fill((x, y, z) => {
    if (z < 4) return -1;
    const inset = z > beltZ - 3 ? (z - (beltZ - 3)) * 0.7 : z < 7 ? (7 - z) * 0.8 : 0;
    if (!plan(x, y, inset)) return -1;
    for (const wx of wheelX) if ((x - wx) ** 2 + (z - 8) ** 2 < (wr + 1.5) ** 2 && (y < 11 || y > W - 11)) return -1;
    return z < 8 ? lower : body;
  }, 0, 0, 4, L, W, beltZ);
  // wheels in their arches
  for (const wx of wheelX) for (const [y0, y1] of [[3, 10], [W - 10, W - 3]]) { m.cyl('y', wx, 0, 8.5, wr, y0, y1, tyre, 4.5, hub); }
  for (const wx of wheelX) for (const yy of [10, W - 11]) m.fill((x, y, z) => ((x - wx) ** 2 + (z - 8) ** 2 < (wr + 1.4) ** 2 && (x - wx) ** 2 + (z - 8) ** 2 > (wr) ** 2 ? arch : -1), Math.floor(wx - 11), yy, 0, Math.ceil(wx + 11), yy + 1, 20);
  // lights, bumpers, grille
  m.fill((x, y, z) => (z >= 11 && z < 15 && (y < 13 || y > W - 13) && plan(x, y, 0) && !plan(x - 2, y, 0) ? head : -1), L - 6, 0, 10, L, W, 16);
  m.fill((x, y, z) => (z >= 12 && z < 16 && (y < 15 || y > W - 15) && plan(x, y, 0) && !plan(x + 2, y, 0) ? tail : -1), 0, 0, 11, 6, W, 17);
  m.fill((x, y, z) => (z >= 6 && z < 9 && plan(x, y, 0) && (!plan(x - 2, y, 0) || !plan(x + 2, y, 0)) ? chrome : -1), 0, 0, 6, L, W, 9);
  m.fill((x, y, z) => (z >= 9 && z < 12 && y > 14 && y < W - 14 && plan(x, y, 0) && !plan(x - 2, y, 0) ? trim : -1), L - 6, 0, 9, L, W, 12);
  if (pickup) {
    // cab
    m.fill((x, y, z) => {
      const t = z - beltZ, front = 84 - t * 1.1, back = 55 + t * 0.15, inset = 5 + t * 0.3;
      if (x > front || x < back || y < inset || y > W - inset) return -1;
      if (z >= Hh - 2) return body;
      const side = y < inset + 1.5 || y > W - inset - 1.5;
      const pillar = (x < back + 3 || x > front - 2.5) && side;
      return t > 2 && !pillar ? glass : body;
    }, 0, 0, beltZ, L, W, Hh);
    // open bed: hollow, floor, walls
    m.fill((x, y) => (x > 6 && x < 52 && y > 5 && y < W - 5 ? 0 : -1), 0, 0, 11, L, W, beltZ);
    const bed = m.mat({ ramp: MAT.metalDark, k: 2 });
    m.box(7, 6, 10, 52, W - 6, 11, bed);
    if (opt.crate) {
      const c = m.mat({ ramp: R('#b08048'), k: 3, shade: (x, y, z) => { const lx = x - 18, lz = z - 11; return (Math.round(z) % 5 === 0 || Math.round(x) % 7 === 0) ? -0.6 : Math.abs(lx * 0.75 - lz) < 1.2 || Math.abs(lx * 0.75 - (14 - lz)) < 1.2 ? -0.9 : 0; } });
      m.box(16, 12, 11, 40, 38, 29, c);
    }
  } else if (type === 'convertible') {
    m.fill((x, y) => (x > 28 && x < 72 && y > 6 && y < W - 6 ? 0 : -1), 0, 0, 12, L, W, beltZ);
    m.box(28, 6, 10, 72, W - 6, 12, interior);
    for (const sx of [36, 56]) { m.box(sx, 8, 12, sx + 8, W / 2 - 2, 22, interior); m.box(sx, W / 2 + 2, 12, sx + 8, W - 8, 22, interior); }
    m.fill((x, y, z) => (x > 72 - (z - beltZ) * 0.8 && x < 75 - (z - beltZ) * 0.8 && y > 6 && y < W - 6 ? glass : -1), 60, 0, beltZ, 80, W, beltZ + 8);
  } else {
    // greenhouse: one sweep from windscreen to back window, a rounded roof
    m.fill((x, y, z) => {
      const t = (z - beltZ) / (Hh - beltZ);                    // 0 at the belt, 1 at the roof
      const front = 74 - t * 15 - t * t * 4, back = 25 + t * 12 + t * t * 2;
      const inset = 4 + t * 6 + t * t * 3;
      if (x > front || x < back || y < inset || y > W - inset) return -1;
      if (z >= Hh - 2) return body;                            // roof skin
      const pillarA = x > front - 3, pillarC = x < back + 4, pillarB = Math.abs(x - 52) < 1.5;
      const side = y < inset + 1.5 || y > W - inset - 1.5;
      if (t > 0.12 && !((pillarA || pillarC || pillarB) && side)) return glass;
      return body;
    }, 0, 0, beltZ, L, W, Hh);
    m.fill((x, y, z) => { const t = (z - beltZ) / (Hh - beltZ), front = 74 - t * 15 - t * t * 4, back = 25 + t * 12 + t * t * 2, inset = 4 + t * 6 + t * t * 3; return x <= front - 1 && x >= back + 1 && y >= inset + 1 && y <= W - inset - 1 ? body : -1; }, 0, 0, Hh - 2, L, W, Hh);
    // mirrors
    m.box(68, 1, beltZ, 71, 4, beltZ + 3, body); m.box(68, W - 4, beltZ, 71, W - 1, beltZ + 3, body);
    if (type === 'taxi') {
      const sign = m.mat({ ramp: R('#f4f0d8'), k: 3, emi: lit ? [255, 240, 180, 200] : null });
      m.box(44, W / 2 - 6, Hh, 56, W / 2 + 6, Hh, sign); m.box(45, W / 2 - 5, Hh - 1, 55, W / 2 + 5, Hh, sign);
      const chk = m.mat({ ramp: R('#2a2a2e'), k: 2 }), wht = m.mat({ ramp: MAT.paintWhiteCar, k: 3 });
      m.fill((x, y, z) => ((y < 4 || y > W - 4) && z >= 13 && z < 16 && x > 22 && x < 80 && plan(x, y, 0) && !plan(x, y, 2) ? (((Math.floor(x / 3) + Math.floor(z / 1.5)) % 2) ? chk : wht) : -1), 0, 0, 12, L, W, 17);
    }
  }
  m.smooth = 2;
  return m;
}

// ---- the corner's street kit ---------------------------------------------------------------------
// traffic signal on a mast arm reaching over the road; arm points toward +x in the model (turn it)
export function trafficSignal(arm = 70, state = 'red', on = 1) {
  const m = new Vox(arm + 10, 14, 92);
  const pole = m.mat({ ramp: MAT.metalDark, k: 2, flag: F_THIN }), yel = m.mat({ ramp: R('#2c2c30'), k: 2, flag: F_THIN });
  const lamp = (c, active) => m.mat({ ramp: R(c, 5, 2), k: active ? 4 : 1, emi: active ? [...hex(c), 255 * on] : null, flag: F_NOCAST });
  m.cyl('z', 6, 7, 0, 3, 0, 4, pole); m.cyl('z', 6, 7, 0, 2, 4, 86, pole);
  m.box(6, 6, 82, arm + 6, 8, 85, pole);
  // a signal head on the pole (facing the viewer) and one hanging from the arm
  for (const hx of [10, arm - 2]) {
    const z0 = hx === 10 ? 44 : 60;
    m.box(hx, 4, z0, hx + 7, 11, z0 + 22, yel);
    const L = [['#e8382e', state === 'red'], ['#f0b030', state === 'amber'], ['#3ad070', state === 'green']];
    L.forEach(([c, act], i) => m.box(hx + 2, 10, z0 + 16 - i * 7, hx + 5, 12, z0 + 20 - i * 7, lamp(c, act)));
  }
  return m;
}
// a black cast-iron street lamp with a glowing lantern
export function streetLamp(on = 0) {
  const m = new Vox(14, 14, 94);
  const iron = m.mat({ ramp: R('#2a2c34'), k: 3, flag: F_THIN });
  const glass = m.mat({ ramp: R('#f6dca0', 5, 3), k: on ? 4 : 2, emi: on ? [255, 206, 130, 255] : null, flag: F_NOCAST });
  m.cyl('z', 7, 7, 0, 4, 0, 4, iron); m.cyl('z', 7, 7, 0, 3, 4, 10, iron); m.cyl('z', 7, 7, 0, 1.6, 10, 78, iron);
  m.cyl('z', 7, 7, 0, 3.5, 78, 80, iron);
  m.fill((x, y, z) => (Math.hypot(x - 7, y - 7) < 3.6 + (z - 80) * 0.25 ? glass : -1), 0, 0, 80, 14, 14, 89);
  m.fill((x, y, z) => (Math.hypot(x - 7, y - 7) < 6 - (z - 89) * 1.2 ? iron : -1), 0, 0, 89, 14, 14, 94);
  return m;
}
export function hotdogCart(on = 0) {
  const m = new Vox(40, 24, 56);
  const steel = m.mat({ ramp: MAT.chrome, k: 3 }), red = m.mat({ ramp: R('#c83a30'), k: 3 }), yel = m.mat({ ramp: R('#e8b830'), k: 3 }), tyre = m.mat({ ramp: MAT.tyre, k: 1 });
  const goods = [R('#c8443a'), R('#e8c040'), R('#5a9a40'), R('#e8e0d0')].map((r) => m.mat({ ramp: r, k: 3 }));
  m.box(2, 4, 8, 34, 20, 24, steel); m.box(2, 4, 16, 34, 20, 18, red);
  for (let i = 0; i < 6; i++) m.box(6 + i * 4, 6, 24, 8 + i * 4, 9, 28 + (i % 2) * 2, goods[i % 4]);
  m.cyl('y', 8, 0, 6, 5, 3, 21, tyre); m.box(34, 10, 18, 40, 14, 20, steel);
  m.cyl('z', 18, 12, 0, 0.8, 24, 50, steel);
  m.fill((x, y, z) => { const d = Math.hypot(x - 18, y - 12); return d < 20 && z <= 54 - d * 0.42 && z > 51 - d * 0.42 ? (Math.floor((Math.atan2(y - 12, x - 18) + 3.15) / 0.785) % 2 ? red : yel) : -1; }, 0, 0, 40, 40, 24, 56);
  return m;
}
export function wireBin() {
  const m = new Vox(12, 12, 20);
  const mesh = m.mat({ ramp: R('#4a4e58'), k: 3, shade: (x, y, z) => ((Math.round(z) % 3 === 0) ? -0.8 : 0) });
  const junk = [R('#e0d6c0'), R('#c8443a'), R('#4a76b0'), R('#2c2c30'), R('#d8b040')].map((r) => m.mat({ ramp: r, k: 3 }));
  m.cyl('z', 6, 6, 0, 5.5, 0, 17, mesh, 4.5, 0);
  m.fill((x, y, z) => { const d = Math.hypot(x - 6, y - 6); return d < 5.5 && z < 17 + 3.5 - d * 0.6 ? junk[Math.floor(hash(x | 0, y | 0, z | 0) * 5)] : -1; }, 0, 0, 10, 12, 12, 20);
  return m;
}
export function signPost(color = '#e8e4dc') { const m = new Vox(10, 4, 48); const p = m.mat({ ramp: MAT.metal, k: 2, flag: F_THIN }), s = m.mat({ ramp: R(color), k: 3, flag: F_THIN }), r = m.mat({ ramp: R('#c8343a'), k: 3, flag: F_THIN }); m.box(4, 1, 0, 6, 3, 44, p); m.box(1, 0, 32, 9, 2, 46, s); m.box(3, 0, 40, 7, 1, 44, r); return m; }
export function pedSignal(on = 1) { const m = new Vox(10, 10, 60); const p = m.mat({ ramp: MAT.metalDark, k: 2, flag: F_THIN }), h = m.mat({ ramp: R('#2c2c30'), k: 2, flag: F_THIN }), l = m.mat({ ramp: R('#f08030', 5, 3), k: 3, emi: [255, 140, 60, 220 * on], flag: F_NOCAST }); m.cyl('z', 5, 5, 0, 1.6, 0, 56, p); m.box(1, 2, 40, 9, 9, 52, h); m.box(3, 8, 43, 7, 10, 49, l); return m; }
// rooftop kit
export function roofAC(big = true) {
  const w = big ? 30 : 18, d = big ? 22 : 14, h = big ? 16 : 11;
  const m = new Vox(w, d, h);
  const b = m.mat({ ramp: R('#a6acb0'), k: 3 }), f = m.mat({ ramp: MAT.metalDark, k: 1 }), g = m.mat({ ramp: MAT.metal, k: 2 }), hub = m.mat({ ramp: MAT.metalDark, k: 3 });
  m.box(0, 0, 0, w, d, h - 1, b);
  // the fan guard: dark rings with the blades' hub in the middle
  m.fill((x, y) => { const r = Math.hypot(x - w * 0.32, y - d / 2); return r < d * 0.34 ? (r < 1.6 ? hub : Math.floor(r * 0.9) % 2 ? f : g) : -1; }, 0, 0, h - 2, w, d, h);
  m.fill((x, y, z) => ((Math.round(z) % 2 === 0) && x > w * 0.6 ? g : -1), Math.floor(w * 0.6), d - 1, 2, w - 1, d, h - 3);
  return m;
}
export function roofVent() { const m = new Vox(10, 10, 12); const b = m.mat({ ramp: MAT.metal, k: 3 }); m.cyl('z', 5, 5, 0, 3, 0, 8, b); m.fill((x, y, z) => (Math.hypot(x - 5, y - 5) < 5 - (z - 8) * 1.1 ? b : -1), 0, 0, 8, 10, 10, 12); return m; }
export function skylight(lit = 0) { const m = new Vox(24, 18, 7); const f = m.mat({ ramp: MAT.metal, k: 2 }), g = m.mat({ ramp: lit ? R('#6a6450') : MAT.glass, k: 3, flag: F_GLASS, emi: lit ? [255, 214, 150, 70 * lit] : null }); m.box(0, 0, 0, 24, 18, 4, f); m.fill((x, y, z) => (z < 4 + (9 - Math.abs(y - 9)) * 0.35 && x > 1 && x < 23 && y > 1 && y < 17 ? g : -1), 0, 0, 3, 24, 18, 7); return m; }
export function dish() { const m = new Vox(18, 14, 18); const b = m.mat({ ramp: R('#d8d8d4'), k: 3 }), p = m.mat({ ramp: MAT.metalDark, k: 2 }); m.box(8, 6, 0, 10, 8, 8, p); m.fill((x, y, z) => { const d = Math.hypot(x - 9, z - 11); return d < 7 && Math.abs(y - 7 - d * 0.3 + 2) < 1.2 ? b : -1; }); return m; }
export function roofPlanter(len = 26) { return flowerBed(len); }
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
// a dog (golden by default) as a little voxel model, facing +x
export function dog(coat = '#d8a050') {
  const m = new Vox(30, 12, 22);
  const f = m.mat({ ramp: R(coat), k: 3 }), dark = m.mat({ ramp: R('#3a2a22'), k: 2 });
  m.ell(14, 6, 11, 9, 4, 4.5, f);                              // body
  for (const [x, y] of [[8, 3], [8, 9], [20, 3], [20, 9]]) m.box(x - 1, y - 1, 0, x + 1, y + 1, 9, f);
  m.ell(24, 6, 15, 4, 3.5, 3.5, f); m.ell(28, 6, 14, 2.5, 2, 2, f);   // head and muzzle
  m.box(29, 5, 14, 31, 7, 16, dark);                           // nose
  m.box(22, 2, 15, 24, 4, 19, f); m.box(22, 8, 15, 24, 10, 19, f);   // ears
  for (let k = 0; k < 8; k++) m.box(4 - k * 0.5, 5, 12 + k * 0.8, 6 - k * 0.5, 7, 13.5 + k * 0.8, f);   // tail
  m.smooth = 1;
  return m;
}

// ---- for the live world (game/statics.js) ------------------------------------------------------------
// a street light on a curved mast arm over the road: pole at model (3.5, 5), arm along +x to the head at
// x = 3 + arm (render at the arm's heading; the head's glass glows when on). style: 'cobra' (grey steel,
// flat head) | 'green' (painted mast, round head) | 'sodium' (galvanised, old box head)
export function armLamp(arm = 30, on = 1, style = 'cobra') {
  const H = 96, m = new Vox(arm + 12, 10, H + 6);
  const pole = m.mat({ ramp: style === 'green' ? R('#2f5a4a') : style === 'sodium' ? R('#8a8e94') : R('#6a707a'), k: 3, flag: F_THIN });
  const head = m.mat({ ramp: style === 'green' ? R('#264a3e') : R('#4a4e58'), k: 3, flag: F_THIN });
  const glass = m.mat({ ramp: R(style === 'sodium' ? '#f6c070' : '#f4ead0', 5, 3), k: on ? 4 : 2, emi: on ? (style === 'sodium' ? [255, 176, 96, 255] : [255, 236, 200, 255]) : null, flag: F_NOCAST });
  m.cyl('z', 3.5, 5, 0, 3, 0, 3, pole); m.cyl('z', 3.5, 5, 0, 1.8, 3, H - 6, pole);
  for (let x = 2; x <= arm + 2; x++) { const t = (x - 2) / arm, z = H - 6 + Math.sin(Math.min(1, t * 2.2) * Math.PI / 2) * 5 - t * 1.2; m.box(x, 4, z, x + 1, 6, z + 2, pole); }
  const hx = arm - 2;
  // the glass is wider than the housing above it, so a lit rim shows from above at every heading
  if (style === 'green') { m.box(hx - 1, 1, H - 8, hx + 10, 9, H - 5, glass); m.ell(hx + 4, 5, H - 4, 5, 3.5, 2.6, head); }
  else { m.box(hx - 1, 1, H - 7, hx + 12, 9, H - 4, glass); m.box(hx, 2, H - 5, hx + 11, 8, H - 2, head); }
  return m;
}
// a rooftop stair / lift housing: a small block with a steel door facing south and a vent on top
export function roofHut(w = 34, d = 26, h = 30, color = '#a8a49a') {
  const m = new Vox(w, d, h + 6);
  const c = m.mat({ ramp: R(color), k: 3, shade: (x, y, z) => (Math.round(z) % 12 === 0 ? -0.4 : 0) }), rim = m.mat({ ramp: R('#c8c4ba'), k: 4 });
  const door = m.mat({ ramp: R('#4a5662'), k: 2 }), vent = m.mat({ ramp: MAT.metal, k: 3 });
  m.box(0, 0, 0, w, d, h, c); m.box(0, 0, h - 2, w, d, h, rim);
  m.box(Math.floor(w / 2) - 6, d - 1, 0, Math.floor(w / 2) + 6, d, 24, door);
  m.box(4, 4, h, 12, 12, h + 5, vent);
  return m;
}
// a thin radio / TV antenna mast with cross bars and a red beacon
export function antennaMast(h = 60) {
  const m = new Vox(14, 14, h + 3);
  const s = m.mat({ ramp: MAT.metal, k: 3 }), red = m.mat({ ramp: R('#e83a30', 5, 3), k: 4, emi: [255, 50, 40, 255], flag: F_NOCAST });
  m.box(6, 6, 0, 8, 8, h, s); m.box(2, 2, 0, 12, 12, 2, s);
  for (let z = 14; z < h - 6; z += 12) m.box(2, 6, z, 12, 8, z + 1, s);
  m.box(6, 6, h, 8, 8, h + 3, red);
  return m;
}
// a factory smoke stack: a tapering brick (or concrete) column with bands and a sooty lip
export function smokeStack(h = 70, r = 7, brick = true) {
  const m = new Vox(r * 2 + 4, r * 2 + 4, h + 2);
  const c = m.mat({ ramp: brick ? MAT.brick : R('#a8a49a'), k: 3, shade: (x, y, z) => (Math.round(z) % 14 === 0 ? -0.6 : 0) + (z > h - 8 ? -1.6 : 0) });
  const band = m.mat({ ramp: R('#d8d4cc'), k: 3 });
  for (let z = 0; z < h; z++) { const rr = r - z / h * r * 0.25; m.cyl('z', r + 2, r + 2, 0, rr, z, z + 1, Math.abs(z - h * 0.7) < 2 || Math.abs(z - h * 0.35) < 1.5 ? band : c, z > h - 3 ? rr - 2 : 0, 0); }
  return m;
}
// a packaged rooftop air handler: a long louvred cabinet on a steel curb with two fans in its lid
export function hvacUnit(w = 44, d = 30, h = 22) {
  const m = new Vox(w, d, h);
  const b = m.mat({ ramp: R('#aeb4b8'), k: 3, shade: (x, y, z) => (y > d - 2 && Math.round(z) % 3 === 0 && z > 4 && z < h - 3 ? -1.1 : 0) });
  const lid = m.mat({ ramp: R('#a4aaae'), k: 3 }), fan = m.mat({ ramp: MAT.metalDark, k: 1 }), hub = m.mat({ ramp: MAT.metal, k: 3 }), curb = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.box(1, 1, 0, w - 1, d - 1, 3, curb); m.box(1, 1, 3, w - 1, d - 1, h - 1, b); m.box(0, 0, h - 2, w, d, h, lid);
  for (const fx of [w * 0.28, w * 0.72]) m.fill((x, y) => { const r = Math.hypot(x - fx, y - d / 2); return r < d * 0.32 ? (r < 2.2 ? hub : (Math.floor(Math.atan2(y - d / 2, x - fx) * 2.6) & 1) ? fan : hub) : -1; }, 0, 0, h - 1, w, d, h);
  return m;
}
// a roof hatch: a concrete curb with a steel lid
export function roofHatch() {
  const m = new Vox(16, 16, 9), c = m.mat({ ramp: R('#a8a49a'), k: 3 }), l = m.mat({ ramp: R('#5e6874'), k: 3 });
  m.box(0, 0, 0, 16, 16, 6, c); m.box(1, 1, 6, 15, 15, 9, l);
  return m;
}
// a brick chimney stack with a stone cap and two clay pots
export function chimney(h = 34) {
  const m = new Vox(12, 12, h + 5);
  const b = m.mat({ ramp: MAT.brick, k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.5 : 0) + (z > h - 9 ? -0.6 : 0) }), cap = m.mat({ ramp: R('#b8b2a6'), k: 3 }), pot = m.mat({ ramp: MAT.terracotta, k: 3 }), soot = m.mat({ ramp: R('#2a2626', 4, 1), k: 0 });
  m.box(1, 1, 0, 11, 11, h - 2, b); m.box(0, 0, h - 2, 12, 12, h, cap);
  for (const px of [3.5, 8.5]) m.cyl('z', px, 6, 0, 2, h, h + 5, pot, 1, soot);
  return m;
}
// a plumbing vent stack with a rain cap
export function ventStack(h = 22) {
  const m = new Vox(8, 8, h), p = m.mat({ ramp: MAT.metal, k: 3 }), c = m.mat({ ramp: MAT.metalDark, k: 2 });
  m.cyl('z', 4, 4, 0, 1.8, 0, h - 4, p); m.cyl('z', 4, 4, 0, 3.5, h - 4, h - 2, c); m.cyl('z', 4, 4, 0, 2, h - 2, h, c);
  return m;
}
// a rooftop cooling tower: a louvred box with a fan shroud on top
export function coolingTower(s = 36, h = 30) {
  const m = new Vox(s, s, h + 6);
  const b = m.mat({ ramp: R('#98a2aa'), k: 3, shade: (x, y, z) => (Math.round(z) % 3 === 0 && z > 4 && z < h - 5 ? -0.9 : 0) }), top = m.mat({ ramp: R('#b4bcc2'), k: 3 }), fan = m.mat({ ramp: MAT.metalDark, k: 1 });
  m.box(0, 0, 0, s, s, h, b); m.box(0, 0, h - 2, s, s, h, top);
  m.cyl('z', s / 2, s / 2, 0, s * 0.4, h, h + 6, top, s * 0.33, fan);
  m.fill((x, y) => (Math.hypot(x - s / 2, y - s / 2) < s * 0.33 ? fan : -1), 0, 0, h - 1, s, s, h);
  return m;
}
// a sheet-metal duct run along x on little stands
export function duct(len = 64) {
  const m = new Vox(len, 10, 11), d = m.mat({ ramp: R('#a8aeb2'), k: 3, shade: (x) => (Math.round(x) % 16 === 0 ? -0.8 : 0) }), s = m.mat({ ramp: MAT.metalDark, k: 2 });
  for (let x = 4; x < len - 2; x += 20) m.box(x, 3, 0, x + 2, 7, 3, s);
  m.box(0, 1, 3, len, 9, 11, d);
  return m;
}
// festoon lights over a roof terrace: two poles and a sagging line of warm bulbs (they glow; no shadow)
export function stringLights(len = 60, on = 1) {
  const m = new Vox(len, 4, 30), p = m.mat({ ramp: MAT.metalDark, k: 2 }), w = m.mat({ ramp: R('#2a2a30'), k: 1, flag: F_NOCAST });
  const b = m.mat({ ramp: R('#ffd890', 5, 3), k: 4, emi: on ? [255, 196, 110, 255] : null, flag: F_NOCAST });
  m.box(0, 1, 0, 2, 3, 30, p); m.box(len - 2, 1, 0, len, 3, 30, p);
  for (let x = 2; x < len - 2; x++) { const t = (x - 2) / (len - 5), z = 28 - Math.sin(t * Math.PI) * 7; m.box(x, 2, z, x + 1, 3, z + 1, w); if ((x - 2) % 6 === 3) m.box(x, 1.5, z - 2, x + 1, 3.5, z, b); }
  return m;
}
// a CCTV camera on a pole: the pole at model (3, 4), an arm along +x, the camera under its end looking +x
// with a red tally light (render at the heading it watches)
export function cctvPole(h = 64) {
  const m = new Vox(22, 8, h + 2), p = m.mat({ ramp: MAT.metalDark, k: 2 }), b = m.mat({ ramp: R('#d6d6d0'), k: 3 }), lens = m.mat({ ramp: R('#20242c'), k: 1 });
  const led = m.mat({ ramp: R('#ff3a30', 5, 3), k: 4, emi: [255, 50, 40, 200], flag: F_NOCAST });
  m.cyl('z', 3, 4, 0, 2.2, 0, 3, p); m.cyl('z', 3, 4, 0, 1.4, 3, h, p);
  m.box(3, 3, h - 3, 13, 5, h - 1, p);
  m.box(10, 1, h - 10, 21, 7, h - 4, b); m.box(20, 2, h - 9, 22, 6, h - 5, lens); m.box(11, 3, h - 4, 13, 5, h - 2, led);
  return m;
}
