// Art v2 furniture for inside your own home (H64; the owner's HO2 sheet: beds, sofas, tables, kitchens, the bathroom,
// the TV, wardrobes, safes, shelves, plants): voxel models (voxel.js), one per piece of a home's plan
// (shared/homelayout.js), furnished by the home's price tier - 0 a trailer's worn odds and ends, 1 an apartment's, 2 a
// house's, 3 a mansion's. Only client/render/homeart2.js loads this (lazily, the first time you go inside with art v2
// on): it is in neither the page's code nor the chunk bake's.
//
// Each maker takes the piece's footprint (w along x, d along y, world px) and the tier and returns a Vox whose front
// faces +y (south, toward the camera); homeart2.js turns it to face the room (a couch toward the TV).
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);
// the woods, fabrics and fittings by tier
export const LOOK = [
  { wood: '#7a5c40', dark: '#4e3a2a', fab: '#7a7464', cover: '#56607a', cover2: '#8a8a7a', sheet: '#d6d0bc', cab: '#d8d0b4', top: '#b4aa96', handle: '#9a9a96', metal: '#9a9e9e', fridge: '#e4e0d0', accent: '#a8743e' },
  { wood: '#8a6440', dark: '#5a3d2a', fab: '#3f6a4e', cover: '#3e5a8a', cover2: '#2e4a78', sheet: '#ecebe4', cab: '#3f6a52', top: '#dcd8cc', handle: '#c8b070', metal: '#a8aeb4', fridge: '#eceae4', accent: '#c87a3a' },
  { wood: '#a06c42', dark: '#5a3824', fab: '#b0562e', cover: '#3e6a3e', cover2: '#2e5a30', sheet: '#f2f0e8', cab: '#7a5434', top: '#e6e2d4', handle: '#d8b050', metal: '#b4bac2', fridge: '#d8dce0', accent: '#d8a040' },
  { wood: '#5e3426', dark: '#3a1e16', fab: '#2e4a3c', cover: '#8a1e2a', cover2: '#6a1420', sheet: '#f6f2e6', cab: '#efece4', top: '#f4f2ee', handle: '#e8c050', metal: '#c8ccd2', fridge: '#c4c8ce', accent: '#e8c050' },
];
const L4 = (t) => LOOK[Math.max(0, Math.min(3, t | 0))];
const grain = (k = 0.6) => (x, y, z) => (hash(Math.round(x / 3), Math.round(z), 11) > 0.8 ? -k : 0);

// ---- the bedroom ----------------------------------------------------------------------------------------------------
// a bed against the wall behind it (its head to the north): the frame, the mattress, two pillows, the covers turned
// down; a trailer's a bare mattress on a low frame, a mansion's a four-poster with gold trim
export function bed(w = 64, d = 64, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, tier >= 3 ? 56 : 30);
  const fr = m.mat({ ramp: R(P.wood), k: 3, shade: grain() }), mat = m.mat({ ramp: R(P.sheet), k: 3 }), pil = m.mat({ ramp: R('#f4f2ea'), k: 4 });
  const cov = m.mat({ ramp: R(P.cover), k: 3, shade: tier === 1 ? (x, y) => ((Math.round(x) % 8 < 2 || Math.round(y) % 8 < 2) ? -0.9 : 0) : tier >= 3 ? (x, y) => (hash(Math.round(x / 4), Math.round(y / 4), 3) > 0.7 ? 0.6 : 0) : (x, y) => (hash(Math.round(x / 6), Math.round(y / 6), 5) > 0.75 ? -0.5 : 0) });
  const trim = m.mat({ ramp: R(P.accent), k: 3 });
  const low = tier === 0 ? 4 : 8;
  if (tier > 0) m.box(1, 2, 0, w - 1, d - 1, low, fr);                      // the frame
  m.box(3, 4, low, w - 3, d - 3, low + 7, mat);                             // the mattress
  m.box(3, 18, low + 5, w - 3, d - 2, low + 9, cov);                        // the covers, down over the sides
  m.box(3, 18, low + 9, w - 3, 22, low + 10, mat);                          // turned down
  if (tier >= 2) m.box(3, d - 12, low + 9, w - 3, d - 4, low + 10, trim);   // a throw across the foot
  const pw = (w - 12) / 2;
  m.box(5, 6, low + 7, 5 + pw, 16, low + 11, pil); m.box(w - 5 - pw, 6, low + 7, w - 5, 16, low + 11, pil);
  if (tier > 0) { m.box(0, 0, 0, w, 3, tier >= 2 ? 28 : 22, fr); m.box(0, d - 3, 0, w, d, low + 6, fr); }   // the headboard and the foot
  if (tier >= 2) m.box(2, 0, tier >= 3 ? 24 : 26, w - 2, 3, tier >= 3 ? 26 : 28, trim);
  if (tier >= 3) for (const [x, y] of [[0, 0], [w - 3, 0], [0, d - 3], [w - 3, d - 3]]) { m.box(x, y, 0, x + 3, y + 3, 54, fr); m.box(x, y, 54, x + 3, y + 3, 56, trim); }
  if (tier >= 3) { m.box(0, 0, 52, w, 3, 54, fr); m.box(0, d - 3, 52, w, d, 54, fr); }
  return m;
}
// the wardrobe: tall, two (or three) doors, handles; a trailer's a steel locker
export function wardrobe(w = 64, d = 32, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, 62), n = w > 70 ? 3 : 2;
  const b = m.mat({ ramp: R(tier === 0 ? '#6a7a6a' : P.wood), k: 3, shade: (x, y, z) => (Math.abs((x % (w / n))) < 1 ? -1.3 : tier === 0 && y > d - 3 && Math.round(z) % 4 === 0 && z > 44 && z < 54 ? -1 : tier > 0 ? grain(0.4)(x, y, z) : 0) });
  const h = m.mat({ ramp: R(P.handle), k: 4 }), top = m.mat({ ramp: R(P.dark), k: 3 });
  m.box(1, 8, 0, w - 1, d - 1, 58, b);
  m.box(0, 7, 56, w, d, 60, top);
  for (let i = 0; i < n; i++) { const cx = (i + 0.5) * w / n; m.box(cx + (i % 2 ? -5 : 3), d - 1, 26, cx + (i % 2 ? -3 : 5), d, 36, h); }
  if (tier === 0) m.box(1, 8, 0, w - 1, d - 1, 3, top);
  return m;
}
// the safe: heavy steel, a dial and a handle on its door
export function safe(w = 32, d = 32, tier = 1) {
  const m = new Vox(w, d, 34);
  const b = m.mat({ ramp: R(tier >= 3 ? '#3a3e48' : '#5a606a'), k: 3, shade: (x, y, z) => (y > d - 4 && (Math.abs(x - 5) < 0.6 || Math.abs(x - (w - 5)) < 0.6 || Math.abs(z - 4) < 0.6 || Math.abs(z - 28) < 0.6) ? -1.2 : 0) });
  const dial = m.mat({ ramp: MAT.chrome || R('#c8ccd2'), k: 4 }), hd = m.mat({ ramp: R('#d8b050'), k: 4 });
  m.box(4, 8, 0, w - 4, d - 2, 32, b);
  m.cyl('y', w / 2 - 3, 0, 18, 4.2, d - 2, d, dial);
  m.box(w - 10, d - 2, 10, w - 8, d, 16, hd);
  return m;
}

// ---- the kitchen ---------------------------------------------------------------------------------------------------
// a run of counters along the wall: the hob and the oven first, then the sink, then worktop with this and that on it;
// the wall cupboards over it (a mansion's in white, a house's in wood, an apartment's green, a trailer's worn cream)
export function counter(w = 96, d = 32, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, 66), n = Math.max(1, Math.round(w / 32));
  const cab = m.mat({ ramp: R(P.cab), k: 3, shade: (x, y, z) => (y > d - 2 && (Math.round(x) % 16 === 0 || Math.abs(z - 20) < 0.5) ? -1.1 : 0) });
  const top = m.mat({ ramp: R(P.top), k: 4, shade: tier >= 3 ? (x, y) => (hash(Math.round(x / 2), Math.round(y / 2), 8) > 0.88 ? -0.8 : 0) : null });
  const ring = m.mat({ ramp: R('#2a2a30'), k: 2 }), hot = m.mat({ ramp: R('#e85a30', 5, 3), k: 3, emi: [255, 110, 50, 70] });
  const oven = m.mat({ ramp: R('#2a2c34'), k: 2, flag: F_GLASS }), chrome = m.mat({ ramp: R('#c8ccd2'), k: 4 }), sinkM = m.mat({ ramp: R('#9aa4ac'), k: 2 });
  const up = m.mat({ ramp: R(P.cab), k: 3, shade: (x, y) => (y > 9 && Math.round(x) % 16 === 0 ? -1.1 : 0) }), hd = m.mat({ ramp: R(P.handle), k: 4 });
  m.box(0, 6, 0, w, d, 26, cab); m.box(0, 4, 26, w, d, 29, top);
  m.box(0, 0, 40, w, 10, 64, up);
  for (let x = 6; x < w; x += 16) m.box(x, 10, 42, x + 2, 11, 46, hd);
  for (let i = 0; i < n; i++) {
    const x0 = i * 32;
    if (i === 0) {   // the hob over the oven
      for (const [dx, dy] of [[8, 11], [22, 11], [8, 22], [22, 22]]) m.cyl('z', x0 + dx, dy, 0, 4, 29, 30, ring, 2, tier >= 2 && dx === 8 && dy === 22 ? hot : ring);
      m.box(x0 + 4, d - 1, 6, x0 + 28, d, 20, oven); m.box(x0 + 6, d - 1, 21, x0 + 26, d, 22, chrome);
    } else if (i === 1) {   // the sink and its tap
      m.box(x0 + 6, 9, 24, x0 + 26, 25, 29, sinkM); m.box(x0 + 8, 11, 25, x0 + 24, 23, 29, 0);
      m.box(x0 + 15, 5, 29, x0 + 17, 8, 36, chrome); m.box(x0 + 15, 7, 34, x0 + 17, 13, 36, chrome);
    } else if (tier >= 1) {   // a kettle, a board, a bowl of fruit
      const k = hash(i, tier, 4);
      if (k < 0.4) { const kt = m.mat({ ramp: R(tier >= 3 ? '#c8ccd2' : '#c8402e'), k: 3 }); m.cyl('z', x0 + 12, 16, 0, 4.5, 29, 37, kt); }
      else if (k < 0.75) { const bd = m.mat({ ramp: R('#b88a54'), k: 3 }); m.box(x0 + 6, 10, 29, x0 + 24, 22, 31, bd); }
      else { const fr = m.mat({ ramp: R('#e8a030'), k: 3 }), ap = m.mat({ ramp: R('#c83a30'), k: 3 }); m.cyl('z', x0 + 16, 16, 0, 6, 29, 32, top); m.ell(x0 + 14, 15, 33, 2.5, 2.5, 2.5, fr); m.ell(x0 + 18, 17, 33, 2.5, 2.5, 2.5, ap); }
    }
  }
  return m;
}
// the fridge: tall, two doors, handles; magnets on a cheap one, brushed steel on a mansion's
export function fridge(w = 32, d = 32, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, 64);
  const b = m.mat({ ramp: R(P.fridge), k: 3, shade: (x, y, z) => (Math.abs(z - 42) < 0.6 ? -1.4 : tier >= 3 && Math.round(z) % 3 === 0 ? 0.2 : 0) });
  const h = m.mat({ ramp: R('#b8bcc2'), k: 4 });
  m.box(4, 6, 0, w - 4, d - 2, 62, b);
  m.box(w - 9, d - 2, 46, w - 7, d - 1, 58, h); m.box(w - 9, d - 2, 24, w - 7, d - 1, 38, h);
  if (tier <= 1) for (let k = 0; k < 4; k++) { const mg = m.mat({ ramp: R(['#e04040', '#40a0e0', '#e8c040', '#50c060'][k]), k: 3 }); m.box(7 + k * 4, d - 2, 50 - (k % 2) * 6, 9 + k * 4, d - 1, 52 - (k % 2) * 6, mg); }
  return m;
}
// the dining table: chairs along both long sides, something on the table by the tier
export function table(w = 64, d = 64, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, 34);
  const tp = m.mat({ ramp: R(tier >= 3 ? '#3a2a24' : P.wood), k: 3, shade: grain(0.4) }), leg = m.mat({ ramp: R(P.dark), k: 3 });
  const seat = m.mat({ ramp: R(tier >= 3 ? P.fab : P.wood), k: 3 }), ch = m.mat({ ramp: R(P.dark), k: 3 });
  const inset = 9;
  m.box(inset, inset, 21, w - inset, d - inset, 24, tp);
  for (const [x, y] of [[inset + 1, inset + 1], [w - inset - 3, inset + 1], [inset + 1, d - inset - 3], [w - inset - 3, d - inset - 3]]) m.box(x, y, 0, x + 2, y + 2, 21, leg);
  const nc = Math.max(1, Math.round((w - 2 * inset) / 22));
  for (let i = 0; i < nc; i++) {
    const cx = inset + (i + 0.5) * (w - 2 * inset) / nc;
    m.box(cx - 5, 1, 12, cx + 5, 9, 14, seat); m.box(cx - 5, 1, 14, cx + 5, 3, 30, ch);           // north side, its back to the wall
    m.box(cx - 5, d - 9, 12, cx + 5, d - 1, 14, seat); m.box(cx - 5, d - 3, 14, cx + 5, d - 1, 28, ch);   // south side
    for (const yy of [2, d - 3]) { m.box(cx - 5, yy, 0, cx - 4, yy + 1, 12, ch); m.box(cx + 4, yy, 0, cx + 5, yy + 1, 12, ch); }
  }
  if (tier >= 1) {
    const cx = w / 2, cy = d / 2;
    if (tier >= 2) { const run = m.mat({ ramp: R(tier >= 3 ? '#e8e0cc' : P.accent), k: 3 }); m.box(inset + 4, cy - 5, 24, w - inset - 4, cy + 5, 25, run); }
    const pot = m.mat({ ramp: R('#b8643a'), k: 3 }), lf = m.mat({ ramp: MAT.leaf, k: 4 });
    m.cyl('z', cx, cy, 0, 3, 24, 28, pot); m.ell(cx, cy, 31, 4, 4, 3.5, lf);
    if (tier >= 3) { const cd = m.mat({ ramp: R('#f4ecd0', 5, 3), k: 4, emi: [255, 200, 120, 160], flag: F_NOCAST }); m.box(cx - 14, cy - 1, 24, cx - 12, cy + 1, 31, cd); m.box(cx + 12, cy - 1, 24, cx + 14, cy + 1, 31, cd); }
  }
  return m;
}

// ---- the living room -----------------------------------------------------------------------------------------------
// a couch (w its length): the back along y = 0, the seat facing +y, arms at the ends, cushions, a throw pillow or two
export function couch(w = 64, d = 32, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, 26);
  const f = m.mat({ ramp: R(P.fab), k: 3, shade: tier >= 3 ? (x, y, z) => ((Math.round(x) % 6 === 0 && Math.round(z) % 6 === 3) ? -1 : 0) : (x) => (Math.abs((x - 6) % ((w - 12) / Math.max(1, Math.round(w / 32)))) < 0.7 && x > 7 && x < w - 7 ? -0.9 : 0) });
  const pil = m.mat({ ramp: R(P.accent), k: 3 }), ft = m.mat({ ramp: R(P.dark), k: 2 });
  m.box(1, 4, 0, w - 1, d - 2, 2, ft);
  m.box(1, 3, 2, w - 1, d - 3, 12, f);           // the seat
  m.box(1, 3, 12, w - 1, 11, 24, f);             // the back
  m.box(0, 3, 2, 6, d - 3, 18, f); m.box(w - 6, 3, 2, w, d - 3, 18, f);   // the arms
  if (tier >= 1) { m.box(8, 10, 12, 16, 14, 20, pil); if (w > 40) m.box(w - 16, 10, 12, w - 8, 14, 20, pil); }
  if (tier === 0) { const th = m.mat({ ramp: R('#8a7a5a'), k: 3 }); m.box(w * 0.55, 6, 11, w - 6, d - 3, 13, th); }
  return m;
}
export function armchair(w = 32, d = 32, tier = 1) { return couch(w, d, tier); }
// the TV: on a low unit, its screen toward the room (a box set in a trailer or an apartment, a flat screen in a house)
export function tv(w = 32, d = 32, tier = 1, on = 0) {
  const P = L4(tier), m = new Vox(w, d, 40);
  const unit = m.mat({ ramp: R(P.dark), k: 3 }), blk = m.mat({ ramp: R('#1e1e24'), k: 2 }), scr = m.mat({ ramp: R('#2a4a6a'), k: 2, emi: [120, 170, 255, 40 + on * 120], flag: F_NOCAST });
  m.box(1, 8, 0, w - 1, d - 2, 12, unit); m.box(3, d - 2, 3, w - 3, d - 1, 9, blk);
  if (tier <= 1) { const cr = m.mat({ ramp: R(tier ? '#4a4a50' : '#6a5a48'), k: 3 }); m.box(6, 10, 12, w - 6, d - 6, 30, cr); m.box(8, d - 6, 14, w - 8, d - 5, 28, scr); }
  else { m.box(2, 14, 12, w - 2, 18, 34, blk); m.box(3, 18, 14, w - 3, 19, 33, scr); m.box(w / 2 - 3, 12, 12, w / 2 + 3, 16, 14, blk); }
  return m;
}
// a bookshelf: shelves of coloured spines
export function bookshelf(w = 32, d = 32, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, 58);
  const fr = m.mat({ ramp: R(P.wood), k: 3 }), cols = ['#8a2a2a', '#2a5a8a', '#c8a050', '#3a6a3a', '#6a3a7a', '#d0d0c0', '#a85a2a'].map((c) => m.mat({ ramp: R(c), k: 3 }));
  m.box(2, 8, 0, w - 2, d - 6, 56, fr);
  for (let z = 4; z < 52; z += 13) {
    m.box(4, 10, z, w - 4, d - 6, z + 10, 0);
    for (let x = 4; x < w - 4; x += 3) { const hh = 6 + Math.floor(hash(x, z, 2) * 4); if (hash(x, z, 9) > 0.15) m.box(x, 11, z, x + 2, d - 7, z + hh, cols[Math.floor(hash(x, z, 5) * cols.length)]); }
  }
  return m;
}
// a plant in a pot: a cheap one small, a mansion's a tall palm
export function plant(w = 32, d = 32, tier = 1) {
  const m = new Vox(w, d, tier >= 3 ? 50 : 36);
  const pot = m.mat({ ramp: R(tier >= 3 ? '#e8e4dc' : '#b8643a'), k: 3 }), lf = m.mat({ ramp: MAT.leaf, k: 4 }), lf2 = m.mat({ ramp: MAT.leafDark, k: 4 });
  const cx = w / 2, cy = d / 2 + 2;
  m.cyl('z', cx, cy, 0, 6, 0, 10, pot); m.cyl('z', cx, cy, 0, 7, 9, 11, pot);
  const top = tier >= 3 ? 44 : 30;
  for (let k = 0; k < 9; k++) { const a = k * 2.4, r = 3 + (k % 3) * 2.5, z = 12 + (k / 9) * (top - 16); m.ell(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, z, 4.5, 4, 3.5, k % 2 ? lf : lf2); }
  m.ell(cx, cy, top - 2, 5, 5, 4, lf);
  m.smooth = 1;
  return m;
}
// the hall table: a narrow console, a lamp on it (lit at night), the keys in a dish
export function hallTable(w = 32, d = 32, tier = 1, on = 0) {
  const P = L4(tier), m = new Vox(w, d, 48);
  const t = m.mat({ ramp: R(P.wood), k: 3 }), lg = m.mat({ ramp: R(P.dark), k: 3 }), base = m.mat({ ramp: R(P.accent), k: 3 });
  const shade = m.mat({ ramp: R('#e8c890', 5, 3), k: 2, emi: [255, 196, 120, 20 + on * 90], flag: F_NOCAST }), dish = m.mat({ ramp: R('#c8ccd2'), k: 3 });
  m.box(2, 10, 24, w - 2, d - 6, 27, t);
  for (const x of [3, w - 5]) for (const y of [11, d - 8]) m.box(x, y, 0, x + 2, y + 2, 24, lg);
  m.box(4, 12, 10, w - 4, d - 8, 12, lg);
  m.cyl('z', 9, 18, 0, 2.5, 27, 38, base); m.cyl('z', 9, 18, 0, 6, 37, 46, shade);
  m.cyl('z', w - 9, 19, 0, 4, 27, 29, dish);
  return m;
}
// the garage's key board: a red tool chest with the keys on hooks on the board over it
export function keyBoard(w = 32, d = 32, tier = 1) {
  const m = new Vox(w, d, 62);
  const red = m.mat({ ramp: R('#b8342e'), k: 3, shade: (x, y, z) => (y > d - 3 && Math.round(z) % 7 === 0 ? -1.2 : 0) }), pb = m.mat({ ramp: R('#a88a5a'), k: 3, shade: (x, y, z) => (Math.round(x) % 4 === 0 && Math.round(z) % 4 === 0 ? -1 : 0) });
  const key = m.mat({ ramp: R('#d8dce0'), k: 4 }), tags = ['#e8c040', '#40a0e0', '#e05050', '#50c060'].map((c) => m.mat({ ramp: R(c), k: 3 }));
  m.box(4, 12, 0, w - 4, d - 2, 30, red);
  m.box(2, 0, 34, w - 2, 3, 60, pb);
  for (let k = 0; k < 4; k++) { const x = 6 + k * 6; m.box(x, 3, 50, x + 1, 5, 53, key); m.box(x, 3, 44, x + 2, 5, 50, key); m.box(x, 3, 41, x + 2, 4, 44, tags[k]); }
  void tier;
  return m;
}

// ---- the bathroom --------------------------------------------------------------------------------------------------
// the shower: its tray, the tiled back, the head; a curtain half drawn in a cheap one, glass posts in a good one
export function shower(w = 64, d = 32, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, 64);
  const tray = m.mat({ ramp: R('#eef0f2'), k: 4 }), tile = m.mat({ ramp: R(tier >= 2 ? '#d8e4ea' : '#c8ccc4'), k: 3, shade: (x, y, z) => (Math.round(x) % 6 === 0 || Math.round(z) % 6 === 0 ? -0.7 : 0) });
  const chrome = m.mat({ ramp: R('#c8ccd2'), k: 4 }), drain = m.mat({ ramp: R('#6a727a'), k: 2 });
  m.box(1, 1, 0, w - 1, d - 1, 3, tray); m.box(1, 1, 3, w - 1, 4, 60, tile);
  m.box(w / 2 - 1, 4, 50, w / 2 + 1, 10, 52, chrome); m.box(w / 2 - 3, 8, 47, w / 2 + 3, 12, 50, chrome);
  m.box(w / 2 - 1, d / 2 - 1, 2, w / 2 + 1, d / 2 + 1, 3, drain);
  if (tier <= 1) {
    const cur = m.mat({ ramp: R(tier ? '#6aa0c8' : '#c8c8b0'), k: 3, shade: (x) => (Math.round(x) % 4 === 0 ? -0.8 : 0) });
    m.box(1, d - 3, 58, w - 1, d - 2, 59, chrome); m.box(1, d - 3, 8, Math.round(w * 0.4), d - 2, 58, cur);
  } else {
    const gl = m.mat({ ramp: R('#cfe6ee', 5, 3), k: 3, flag: F_GLASS | F_NOCAST });
    for (const x of [1, w - 2]) m.box(x, d - 3, 3, x + 1, d - 1, 58, chrome);
    m.box(1, d - 3, 57, w - 1, d - 1, 58, chrome); m.box(Math.round(w * 0.55), d - 2, 4, w - 2, d - 1, 56, gl);
  }
  void P;
  return m;
}
export function toilet(w = 32, d = 32) {
  const m = new Vox(w, d, 30);
  const c = m.mat({ ramp: R('#eef0f2'), k: 4 }), in_ = m.mat({ ramp: R('#b8c8d2'), k: 2 }), ch = m.mat({ ramp: R('#c8ccd2'), k: 4 });
  m.box(w / 2 - 8, 4, 10, w / 2 + 8, 11, 28, c); m.box(w / 2 - 9, 4, 27, w / 2 + 9, 12, 29, c);   // the cistern
  m.box(w / 2 - 4, 11, 0, w / 2 + 4, 22, 10, c);
  m.ell(w / 2, 20, 12, 7.5, 9, 4, c); m.ell(w / 2, 20, 14, 5, 6.5, 2.5, in_);
  m.box(w / 2 + 5, 11, 24, w / 2 + 8, 12, 25, ch);
  return m;
}
export function basin(w = 32, d = 32, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, 34);
  const v = m.mat({ ramp: R(tier >= 2 ? P.wood : '#e4e2da'), k: 3, shade: (x, y) => (y > d - 3 && Math.abs(x - w / 2) < 0.6 ? -1 : 0) }), top = m.mat({ ramp: R('#eef0f2'), k: 4 }), ch = m.mat({ ramp: R('#c8ccd2'), k: 4 }), bowl = m.mat({ ramp: R('#b8c8d2'), k: 2 });
  m.box(3, 8, 0, w - 3, d - 3, 24, v); m.box(2, 6, 24, w - 2, d - 2, 27, top);
  m.ell(w / 2, 17, 26, 8, 6, 2, bowl);
  m.box(w / 2 - 1, 6, 27, w / 2 + 1, 9, 33, ch); m.box(w / 2 - 1, 8, 31, w / 2 + 1, 12, 33, ch);
  return m;
}

// ---- the furniture shop's pieces (H67: shared/homedecor.js; HO2 / HO4) ------------------------------------------------
// a bedside table: two drawers, a little lamp and a book on top (the lamp lit at night)
export function bedside(w = 32, d = 32, tier = 1, on = 0) {
  const P = L4(tier), m = new Vox(w, d, 40);
  const b = m.mat({ ramp: R(P.wood), k: 3, shade: (x, y, z) => (y > d - 9 && (Math.round(z) === 9 || Math.round(z) === 16) ? -1.2 : grain(0.3)(x, y, z)) });
  const knob = m.mat({ ramp: R(P.handle), k: 4 }), base = m.mat({ ramp: R(P.accent), k: 3 }), book = m.mat({ ramp: R('#3a5a8a'), k: 3 });
  const shade = m.mat({ ramp: R('#f0d8a0', 5, 3), k: 2, emi: [255, 200, 120, 20 + on * 110], flag: F_NOCAST });
  m.box(6, 9, 0, w - 6, d - 8, 22, b); m.box(5, 8, 22, w - 5, d - 7, 24, b);
  m.box(w / 2 - 1, d - 8, 12, w / 2 + 1, d - 7, 14, knob); m.box(w / 2 - 1, d - 8, 18, w / 2 + 1, d - 7, 20, knob);
  m.cyl('z', w / 2 - 4, 15, 0, 2, 24, 30, base); m.cyl('z', w / 2 - 4, 15, 0, 5, 30, 38, shade);
  m.box(w / 2 + 3, 13, 24, w / 2 + 10, 20, 26, book);
  return m;
}
// a floor lamp: a weighted base, the pole, a drum shade (lit at night)
export function lamp(w = 32, d = 32, tier = 1, on = 0) {
  const P = L4(tier), m = new Vox(w, d, 62);
  const pole = m.mat({ ramp: R(tier >= 2 ? '#c8a050' : '#3a3a40'), k: 4 }), base = m.mat({ ramp: R(P.dark), k: 3 });
  const shade = m.mat({ ramp: R(tier >= 3 ? '#f4ecd8' : '#e8d4a0', 5, 3), k: 2, emi: [255, 204, 130, 30 + on * 150], flag: F_NOCAST });
  m.cyl('z', w / 2, d / 2, 0, 6, 0, 3, base); m.cyl('z', w / 2, d / 2, 0, 1.2, 3, 50, pole);
  m.cyl('z', w / 2, d / 2, 0, 8, 46, 60, shade);
  return m;
}
// a TV on the wall: the flat screen hung on its bracket over nothing (you walk under it); a little shelf with a box under it
export function walltv(w = 32, d = 32, tier = 1, on = 0) {
  const m = new Vox(w, d, 46);
  const blk = m.mat({ ramp: R('#18181e'), k: 2 }), scr = m.mat({ ramp: R('#2a4a6a'), k: 2, emi: [120, 170, 255, 40 + on * 130], flag: F_NOCAST }), sh = m.mat({ ramp: R(L4(tier).dark), k: 3 });
  m.box(1, 0, 22, w - 1, 3, 42, blk); m.box(2, 3, 23, w - 2, 4, 41, scr);
  m.box(4, 0, 12, w - 4, 6, 14, sh); m.box(9, 1, 14, w - 9, 5, 17, blk);
  return m;
}
// a painting on the wall: a gilt or plain frame, a landscape (hills, the sky, a sun) - its colours by where it hangs
export function art(w = 32, d = 32, tier = 1, seed = 0) {
  const m = new Vox(w, d, 46);
  const fr = m.mat({ ramp: R(tier >= 2 ? '#d8b050' : '#6a4a2a'), k: 3 });
  const sky = m.mat({ ramp: R(['#7ab0d8', '#e8a060', '#5a7ab0'][seed % 3]), k: 3 }), hill = m.mat({ ramp: R(['#5a8a4a', '#8a5a3a', '#3a5a4a'][seed % 3]), k: 3 }), sun = m.mat({ ramp: R('#f8e8a0'), k: 3 });
  m.box(4, 0, 20, w - 4, 2, 42, fr);
  m.box(6, 2, 22, w - 6, 3, 40, sky);
  m.fill((x, y, z) => (z < 28 + 4 * Math.sin(x * 0.35 + seed) ? hill : -1), 6, 2, 22, w - 6, 3, 34);
  m.ell(w - 11, 2.5, 35, 2.5, 0.6, 2.5, sun);
  return m;
}
// a washing machine: white, the round door's glass, the dial
export function washer(w = 32, d = 32, tier = 1) {
  const m = new Vox(w, d, 36);
  const b = m.mat({ ramp: R('#eceae4'), k: 4, shade: (x, y, z) => (y > d - 3 && Math.round(z) === 26 ? -0.9 : 0) }), gl = m.mat({ ramp: R('#5a7a8a'), k: 3, flag: F_GLASS }), rim = m.mat({ ramp: R('#b8bcc2'), k: 4 }), dial = m.mat({ ramp: R('#3a3e46'), k: 3 });
  m.box(4, 6, 0, w - 4, d - 2, 32, b);
  m.cyl('y', w / 2, d - 2, 13, 8, d - 2, d - 1, rim); m.cyl('y', w / 2, d - 2, 13, 6, d - 2, d, gl);
  m.box(w - 11, d - 2, 27, w - 7, d - 1, 30, dial); m.box(7, d - 2, 28, 15, d - 1, 30, dial);
  void tier;
  return m;
}
// a workbench: a thick wooden top on a steel frame, a vice, a pegboard of tools on the wall behind it
export function workbench(w = 64, d = 32, tier = 1) {
  const m = new Vox(w, d, 58);
  const top = m.mat({ ramp: R('#b08a5a'), k: 3, shade: grain(0.4) }), fr = m.mat({ ramp: R('#4a5a6a'), k: 3 }), pb = m.mat({ ramp: R('#a88a5a'), k: 3, shade: (x, y, z) => (Math.round(x) % 4 === 0 && Math.round(z) % 4 === 0 ? -1 : 0) });
  const tool = m.mat({ ramp: R('#c8ccd2'), k: 4 }), red = m.mat({ ramp: R('#b8342e'), k: 3 });
  m.box(2, 8, 20, w - 2, d - 2, 24, top);
  for (const x of [3, w - 6]) for (const y of [9, d - 5]) m.box(x, y, 0, x + 3, y + 3, 20, fr);
  m.box(4, 10, 6, w - 4, d - 4, 8, fr);
  m.box(w - 16, d - 6, 24, w - 6, d - 2, 29, fr); m.box(w - 13, d - 3, 26, w - 9, d, 27, tool);   // the vice
  m.box(2, 0, 28, w - 2, 3, 56, pb);
  for (let k = 0; k < 6; k++) { const x = 6 + k * ((w - 12) / 6); m.box(x, 3, 40, x + 2, 5, 52, k % 3 === 1 ? red : tool); }
  m.box(10, 12, 24, 22, 18, 27, red);   // a toolbox on the top
  void tier;
  return m;
}

// every piece of a plan by its letter (shared/homelayout.js), and whether it faces the room or its own way; the shop's
// pieces by theirs (shared/homedecor.js PIECES: b bedside table, l floor lamp, v wall TV, a painting, w washer, k workbench)
// ---- an apartment block's lobby (H71; HO5) ----------------------------------------------------------------------------
// the mailboxes: a bank of little brass-fronted boxes on the back wall, one for each flat, a slot in each
export function mailboxes(w = 64, d = 32, tier = 1) {
  const m = new Vox(w, d, 44);
  const cab = m.mat({ ramp: R(tier >= 2 ? '#6a4a2e' : '#5a6068'), k: 3 }), door = m.mat({ ramp: R(tier >= 2 ? '#c8a050' : '#a8aeb4'), k: 3, shade: (x, y, z) => ((Math.round(z) % 9 < 1 || Math.round(x) % 10 < 1) ? -1 : 0) });
  const slot = m.mat({ ramp: R('#22262c'), k: 2 });
  m.box(2, 4, 8, w - 2, 14, 42, cab);
  m.box(4, 14, 10, w - 4, 15, 40, door);
  for (let z = 14; z < 40; z += 9) for (let x = 6; x < w - 8; x += 10) m.box(x, 15, z, x + 6, 16, z + 1, slot);
  return m;
}
// the stairs up: a flight of steps climbing away to the back wall, a handrail along its open side
export function stairs(w = 64, d = 64, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, 58);
  const tread = m.mat({ ramp: R(tier >= 2 ? '#8a3a32' : '#8a8680'), k: 3, shade: (x, y) => (Math.round(y) % 8 < 1 ? -0.9 : 0) }), side = m.mat({ ramp: R(P.dark), k: 3 }), rail = m.mat({ ramp: R(P.wood), k: 3 });
  for (let i = 0; i < 8; i++) m.box(0, d - (i + 1) * 8, 0, w - 6, d - i * 8, (i + 1) * 6, tread);
  m.box(w - 6, 0, 0, w - 3, d, 10, side);
  for (let i = 0; i < 8; i++) m.box(w - 5, d - (i + 1) * 8, 10, w - 3, d - (i + 1) * 8 + 2, (i + 1) * 6 + 12, rail);
  m.box(w - 6, 0, 52, w - 2, d, 55, rail);
  return m;
}

// ---- the concept's new pieces (H77; the owner's HO6 "inside your home": the games room, the cinema, the kitchen island,
// the sectional, the bath) and the yard's (a patio set, a mower, a lawn chair, a raised bed) ----------------------------
// a pool table: green baize in a wooden rail on turned legs, the six pockets, a few balls and a cue across it
export function poolTable(w = 96, d = 64, tier = 3) {
  const P = L4(tier), m = new Vox(w, d, 30);
  const wood = m.mat({ ramp: R(P.wood), k: 3, shade: grain(0.4) }), felt = m.mat({ ramp: R('#2e7a46'), k: 3, shade: (x, y) => (hash(Math.round(x / 2), Math.round(y / 2), 7) > 0.85 ? -0.3 : 0) });
  const hole = m.mat({ ramp: R('#141414'), k: 2 }), cue = m.mat({ ramp: R('#d8b878'), k: 3 });
  const balls = ['#f4f0e4', '#e8c030', '#2a4ac8', '#c83a2a', '#6a2a8a', '#e87a2a', '#1e1e1e'].map((c) => m.mat({ ramp: R(c), k: 4 }));
  for (const [x, y] of [[6, 8], [w - 10, 8], [6, d - 12], [w - 10, d - 12]]) m.box(x, y, 0, x + 4, y + 4, 20, wood);
  m.box(3, 4, 18, w - 3, d - 4, 22, wood);
  m.box(4, 5, 22, w - 4, d - 5, 26, wood);
  m.box(8, 9, 24, w - 8, d - 9, 26, felt);
  for (const [x, y] of [[8, 9], [w / 2 - 2, 7], [w - 12, 9], [8, d - 13], [w / 2 - 2, d - 11], [w - 12, d - 13]]) m.box(x, y, 25, x + 4, y + 4, 27, hole);
  balls.forEach((b, i) => { const x = w * 0.62 + (i % 3) * 3.5 - (i > 2 ? 1.5 : 0), y = d / 2 - 4 + Math.floor(i / 3) * 3.5; m.ell(x, y, 27.5, 1.6, 1.6, 1.6, b); });
  m.ell(w * 0.3, d / 2, 27.5, 1.6, 1.6, 1.6, balls[0]);
  m.box(w * 0.08, d / 2 + 6, 26, w * 0.32, d / 2 + 7, 27, cue);
  return m;
}
// ---- an arcade's machines (the owner, 11-06: "not just the same arcade cabinet over and over... skeeball would have a
// skeeball machine, air hockey is an air hockey table"; the AC1 / AC2 / AC7 concepts) - each lit from within, so the
// dark hall glows (homeart2.js lights an arcade's floor by them). A run of cabinets, lanes or pinball machines is one
// piece: a machine to each 32 px of it.
const glow = (m, hex, a, k = 3) => m.mat({ ramp: R(hex, 5, 2), k, emi: [...hexRGB(hex), a], flag: F_NOCAST });
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const TRIM = ['#c8263a', '#2a5ad8', '#e8b820', '#7a3ac8', '#1e9a6a', '#e8602a'];
// the upright video cabinets side by side (STARFALL: client/arcade.js): the side art in its colour, the marquee lit
// over the screen - the attract mode's waves of invaders in their rows, the ship below - the control deck's stick and
// buttons, the coin door's lit slots
export function arcade(w = 32, d = 32, tier = 3, on = 0) {
  const m = new Vox(w, d, 62), n = Math.max(1, Math.round(w / 32)), u = w / n;
  const blk = m.mat({ ramp: R('#16161c'), k: 2 }), deck = m.mat({ ramp: R('#2a2a34'), k: 3 }), cap = m.mat({ ramp: R('#3a3a46'), k: 3 });
  const bg = glow(m, '#0c1640', 60 + on * 60, 2), ship = glow(m, '#5ae0ff', 200), al = ['#ff5a8a', '#ffd23a', '#8aff6a'].map((c) => glow(m, c, 200));
  const coin = glow(m, '#ff8a2a', 160), stick = m.mat({ ramp: R('#e83a3a'), k: 3 });
  for (let i = 0; i < n; i++) {
    const x0 = i * u, tc = TRIM[(i * 5 + (seedOf(w) | 0)) % TRIM.length];
    const side = m.mat({ ramp: R(tc), k: 3, shade: (x, y, z) => (Math.round(z / 6 + y / 9) % 3 === 0 ? 0.7 : 0) }), body = m.mat({ ramp: R(tc, 6, 4), k: 1 });
    const mq = glow(m, tc, 120 + on * 100, 4);
    m.box(x0 + 3, 4, 0, x0 + 6, d - 3, 60, side); m.box(x0 + u - 6, 4, 0, x0 + u - 3, d - 3, 60, side);   // the side panels, their art
    m.box(x0 + 6, 6, 0, x0 + u - 6, 22, 60, body);                       // the cabinet
    m.box(x0 + 6, 22, 0, x0 + u - 6, d - 4, 24, body);                   // the lower front, out toward you
    m.box(x0 + 11, d - 5, 8, x0 + u - 11, d - 4, 16, blk); m.box(x0 + 13, d - 5, 10, x0 + 15, d - 3, 14, coin); m.box(x0 + u - 15, d - 5, 10, x0 + u - 13, d - 3, 14, coin);   // the coin door
    m.box(x0 + 5, 20, 24, x0 + u - 5, d - 2, 27, deck);                  // the control deck
    m.box(x0 + 10, d - 8, 27, x0 + 12, d - 6, 31, blk); m.ell(x0 + 11, d - 7, 32, 1.6, 1.6, 1.6, stick);   // the stick
    al.forEach((c, j) => m.box(x0 + 15 + j * 3, d - 8, 27, x0 + 17 + j * 3, d - 6, 28, c));   // the buttons
    m.box(x0 + 6, 20, 27, x0 + u - 6, 22, 48, blk);                      // the bezel
    for (let z = 29; z < 46; z++) for (let x = x0 + 8; x < x0 + u - 8; x++) {   // the screen: the attract mode
      const sx = x - x0 - 8, sz = 45 - z;
      let c = bg;
      if (sz >= 2 && sz < 9 && sz % 3 !== 1 && sx % 3 !== 2) c = al[Math.floor((sz - 2) / 3) % 3];
      if (sz === 14 && sx >= 6 && sx < 10) c = ship; if (sz === 13 && sx >= 7 && sx < 9) c = ship;
      if (c === bg && hash(sx, sz, i + 3) > 0.93) c = ship;   // (a star)
      m.set(x, 21, z, c);
    }
    m.box(x0 + 5, 18, 48, x0 + u - 5, 23, 57, mq);                       // the marquee, lit
    for (let x = x0 + 8; x < x0 + u - 8; x += 2) m.set(x, 22, 52, blk);  // (its lettering)
    m.box(x0 + 4, 4, 57, x0 + u - 4, 23, 61, cap);
  }
  void tier;
  return m;
}
const seedOf = (w) => Math.round(w / 32) * 7;
// skee-ball lanes side by side, rolled at from their foot (the south): the maple lane up to the hump, the lit rails,
// the rings at the back - 10, 20, 30, 40, 50, the 100 pockets in the corners - the score box lit over them, the balls
// waiting in the return
export function skeeBall(w = 32, d = 96, tier = 3) {
  const m = new Vox(w, d, 64), n = Math.max(1, Math.round(w / 32)), u = w / n;
  const maple = m.mat({ ramp: R('#d8a060'), k: 3, shade: (x, y) => (Math.round(y) % 12 === 0 ? -0.6 : hash(Math.round(x), Math.round(y / 4), 2) > 0.8 ? 0.4 : 0) });
  const wood = m.mat({ ramp: R('#b07a3a'), k: 3 }), ringM = m.mat({ ramp: R('#e8cc90'), k: 4 }), hole = m.mat({ ramp: R('#141012'), k: 1 }), net = m.mat({ ramp: R('#2a2a30'), k: 2, flag: F_NOCAST });
  const rail = m.mat({ ramp: R('#a8261e'), k: 3 }), amber = glow(m, '#ffb020', 170), red = glow(m, '#ff4a3a', 170, 3), ball = m.mat({ ramp: R('#8a4a1e'), k: 3 }), score = glow(m, '#ffd23a', 220, 4), box = m.mat({ ramp: R('#2a1418'), k: 2 });
  for (let i = 0; i < n; i++) {
    const x0 = i * u, cx = x0 + u / 2;
    m.box(x0 + 1, 30, 0, x0 + u - 1, d, 8, wood);                                   // the cabinet under the lane
    for (let y = 34; y < d - 6; y++) { const z = 8 + Math.round((d - 6 - y) * 0.06) + (y >= 34 && y < 40 ? 3 : 0); m.box(x0 + 5, y, 8, x0 + u - 5, y + 1, z + 1, maple); }   // the lane, rising to the hump
    for (let y = 30; y < d; y++) { const z = 14 + Math.round((d - y) * 0.12); m.box(x0 + 1, y, 0, x0 + 5, y + 1, z, rail); m.box(x0 + u - 5, y, 0, x0 + u - 1, y + 1, z, rail); if (y % 6 < 3) { m.set(x0 + 2, y, z, amber); m.set(x0 + u - 3, y, z, amber); } }   // the rails, their lights chasing
    for (let y = 6; y < 34; y++) {                                                 // the target: the rings on the slope up to the back
      const z = 12 + Math.round((34 - y) * 1.1);
      for (let x = x0 + 2; x < x0 + u - 2; x++) {
        const r = Math.hypot(x + 0.5 - cx, (y - 20) * 1.15);
        const c = r < 2.6 ? hole : r < 4 ? ringM : r < 5.2 ? hole : r < 7.6 ? ringM : r < 8.6 ? hole : r < 11 ? ringM : wood;
        m.box(x, y, 8, x + 1, y + 1, z, wood); m.set(x, y, z, c); m.set(x, y, z - 1, c);
      }
    }
    for (const sx of [x0 + 4, x0 + u - 5]) m.box(sx, 8, 40, sx + 2, 10, 42, hole);   // the 100 pockets
    m.box(x0 + 1, 0, 0, x0 + u - 1, 6, 62, box);                                   // the back, the score box over it
    m.box(x0 + 3, 5, 46, x0 + u - 3, 7, 58, score);
    for (let x = x0 + 5; x < x0 + u - 5; x += 3) m.box(x, 6, 49, x + 2, 8, 55, red);
    m.box(x0 + 1, 2, 34, x0 + 2, 34, 50, net); m.box(x0 + u - 2, 2, 34, x0 + u - 1, 34, 50, net);   // the side nets
    m.box(x0 + 5, d - 6, 6, x0 + u - 5, d, 11, box);                               // the ball return at the foot
    for (let k = 0; k < 3; k++) m.ell(x0 + 9 + k * 7, d - 3, 12, 2.6, 2.6, 2.6, ball);
  }
  void tier;
  return m;
}
// an air hockey table (AC7): the lit blue top with its air holes, the red centre line and circle, the goal slots in the
// ends, the chrome rails with their light strips, the starred apron, the two mallets and the puck, the score tower
export function airHockey(w = 96, d = 64, tier = 3) {
  const m = new Vox(w, d, 44), cx = w / 2, cy = d / 2;
  const apron = m.mat({ ramp: R('#1e2a6a'), k: 3, shade: (x, y, z) => (Math.abs(((Math.round(x) % 16) - 8)) + Math.abs(Math.round(z) - 12) < 3 ? 1.4 : 0) });
  const leg = m.mat({ ramp: R('#2a2a34'), k: 2 }), chrome = m.mat({ ramp: R('#c8d0dc'), k: 4 }), slot = m.mat({ ramp: R('#08080c'), k: 1 });
  const top = m.mat({ ramp: R('#3a86e8', 6, 3), k: 3, emi: [60, 130, 255, 50], shade: (x, y) => ((Math.round(x) % 5 === 2 && Math.round(y) % 5 === 2) ? -0.9 : 0) });
  const line = m.mat({ ramp: R('#e83040'), k: 3 }), blue = glow(m, '#40a0ff', 200), orange = glow(m, '#ff8030', 200);
  const malR = m.mat({ ramp: R('#e83a3a'), k: 3 }), malB = m.mat({ ramp: R('#2a6ae8'), k: 3 }), puck = m.mat({ ramp: R('#1e1e24'), k: 2 }), digit = glow(m, '#ff3a2a', 230);
  for (const [x, y] of [[8, 12], [w - 12, 12], [8, d - 14], [w - 12, d - 14]]) m.box(x, y, 0, x + 4, y + 4, 8, leg);
  m.box(4, 8, 8, w - 4, d - 4, 22, apron);
  m.box(6, 10, 22, w - 6, d - 6, 24, top);
  m.box(cx - 1, 10, 23, cx + 1, d - 6, 24, line);
  m.fill((x, y) => { const r = Math.hypot(x - cx, y - cy); return r > 8 && r < 9.6 ? line : -1; }, cx - 10, cy - 10, 23, cx + 10, cy + 10, 24);
  for (const ex of [6, w - 6]) m.fill((x, y) => { const r = Math.hypot(x - ex, y - cy); return r > 13 && r < 14.6 ? line : -1; }, ex - 15, cy - 15, 23, ex + 15, cy + 15, 24);
  m.box(4, 8, 22, w - 4, 10, 28, chrome); m.box(4, d - 6, 22, w - 4, d - 4, 28, chrome);   // the rails
  m.box(4, 10, 22, 6, d - 6, 28, chrome); m.box(w - 6, 10, 22, w - 4, d - 6, 28, chrome);
  m.box(4, cy - 8, 22, 6, cy + 8, 28, slot); m.box(w - 6, cy - 8, 22, w - 4, cy + 8, 28, slot);   // the goal slots
  for (let x = 8; x < w - 8; x++) { m.set(x, 9, 28, x < cx ? blue : orange); m.set(x, d - 5, 28, x < cx ? blue : orange); }
  m.cyl('z', 20, cy + 4, 0, 4.5, 24, 27, malB); m.cyl('z', 20, cy + 4, 0, 1.8, 27, 31, malB);
  m.cyl('z', w - 22, cy - 6, 0, 4.5, 24, 27, malR); m.cyl('z', w - 22, cy - 6, 0, 1.8, 27, 31, malR);
  m.cyl('z', cx + 9, cy + 3, 0, 2.6, 24, 25, puck);
  m.box(cx - 8, 2, 8, cx + 8, 8, 40, leg); m.box(cx - 6, 7, 32, cx - 1, 9, 38, digit); m.box(cx + 1, 7, 32, cx + 6, 9, 38, digit);   // the score tower
  void tier;
  return m;
}
// pinball machines side by side (NEON NIGHTS: client/pinball.js): on their legs, the playfield under its glass sloping
// up to the backbox - the bumpers, the slingshots, the flippers, the sunset over the skyline lit - the backbox's art
// glowing at the back, the plunger and the buttons at the front
export function pinball(w = 32, d = 64, tier = 3) {
  const m = new Vox(w, d, 64), n = Math.max(1, Math.round(w / 32)), u = w / n;
  const leg = m.mat({ ramp: R('#c8ccd4'), k: 4 }), field = glow(m, '#1a1a5a', 70, 2), sunA = glow(m, '#ff8a3a', 170), sunB = glow(m, '#ff4a8a', 170);
  const city = m.mat({ ramp: R('#14102a'), k: 2 }), bump = glow(m, '#ff3a4a', 190), bumpW = glow(m, '#f4f0e8', 160, 4), flip = glow(m, '#ffd23a', 150), lane = glow(m, '#3ae86a', 160), cyan = glow(m, '#3ad0ff', 170);
  const steel = m.mat({ ramp: R('#9aa0aa'), k: 3 });
  for (let i = 0; i < n; i++) {
    const x0 = i * u, tc = TRIM[(i * 3 + 1) % TRIM.length], body = m.mat({ ramp: R(tc), k: 2, shade: (x, y, z) => (Math.round(y / 5 + z / 3) % 4 === 0 ? 0.8 : 0) });
    for (const [x, y] of [[x0 + 5, 16], [x0 + u - 8, 16], [x0 + 5, d - 6], [x0 + u - 8, d - 6]]) m.box(x, y, 0, x + 3, y + 3, 22, leg);
    for (let y = 14; y < d - 2; y++) {                               // the cabinet, its playfield sloping up to the back
      const z = 24 + Math.round((d - 2 - y) * 0.12);
      m.box(x0 + 3, y, 18, x0 + u - 3, y + 1, z, body);
      for (let x = x0 + 5; x < x0 + u - 5; x++) {
        const fx = x - x0 - u / 2, fy = y - 14, L = d - 16;
        let c = field;
        if (fy < L * 0.36 && Math.hypot(fx, fy - L * 0.32) < 7) c = (fy + Math.round(fx)) % 4 < 2 ? sunA : sunB;   // the sunset
        if (fy > L * 0.22 && fy < L * 0.36 && hash(x, 1, 7) > 0.5 && fy > L * 0.36 - 2 - hash(x >> 1, 2, 9) * 6) c = city;
        for (const [bx, by] of [[-5, 0.46], [5, 0.46], [0, 0.56]]) { const r = Math.hypot(fx - bx, fy - L * by); if (r < 3.2) c = r < 1.8 ? bumpW : bump; }
        if (Math.abs(Math.abs(fx) - 9) < 1 && fy > L * 0.3 && fy < L * 0.8) c = lane;
        if (fy > L * 0.72 && fy < L * 0.86 && Math.abs(Math.abs(fx) - 7) < 1.2) c = cyan;   // the slingshots
        if (fy > L * 0.88 && fy < L * 0.93 && Math.abs(fx) > 1.5 && Math.abs(fx) < 7) c = flip;   // the flippers
        m.set(x, y, z, c);
      }
      m.set(x0 + 4, y, z, steel); m.set(x0 + u - 5, y, z, steel);
    }
    m.box(x0 + u - 7, d - 3, 18, x0 + u - 5, d, 22, steel);          // the plunger
    m.box(x0 + 2, 4, 18, x0 + u - 2, 16, 62, body);                  // the backbox, its art lit
    for (let z = 34; z < 60; z++) for (let x = x0 + 4; x < x0 + u - 4; x++) {
      const bx = x - x0 - u / 2, bz = z - 34;
      const c = Math.hypot(bx, bz - 13) < 7 ? (bz % 3 ? sunA : sunB) : bz < 9 ? (hash(x, 3, 4) > 0.4 && bz < 3 + hash(x >> 1, 4, 5) * 7 ? city : field) : bz > 21 ? cyan : field;
      m.set(x, 16, z, c);
    }
  }
  void tier;
  return m;
}
// claw machines (just for show): the cabinet, the glass case full of plush, the claw hanging over them, the lit top
export function clawMachine(w = 32, d = 32, tier = 3) {
  const m = new Vox(w, d, 62), n = Math.max(1, Math.round(w / 32)), u = w / n;
  const base = m.mat({ ramp: R('#d83a7a'), k: 3 }), frame = m.mat({ ramp: R('#e8e0f0'), k: 4 });
  const top = glow(m, '#ffd23a', 190), claw = m.mat({ ramp: R('#c8ccd4'), k: 4 }), toys = ['#f4a0c0', '#ffe070', '#8ae8ff', '#a8f08a', '#f4f0e8'].map((c) => m.mat({ ramp: R(c), k: 3 }));
  for (let i = 0; i < n; i++) {
    const x0 = i * u;
    m.box(x0 + 3, 4, 0, x0 + u - 3, d - 3, 22, base);
    for (let k = 0; k < 9; k++) m.ell(x0 + 8 + (k % 3) * 8, 10 + Math.floor(k / 3) * 6, 25 + (k % 2) * 2, 3.4, 3, 3.4, toys[(k + i) % 5]);
    for (const [x, y] of [[x0 + 3, 4], [x0 + u - 5, 4], [x0 + 3, d - 5], [x0 + u - 5, d - 5]]) m.box(x, y, 22, x + 2, y + 2, 52, frame);
    m.box(x0 + 3, d - 4, 22, x0 + u - 3, d - 3, 25, frame); m.box(x0 + 3, 4, 22, x0 + u - 3, 6, 52, base);   // (the glass: open to see in)
    m.box(x0 + 3, 4, 52, x0 + u - 3, d - 3, 60, top);
    m.box(x0 + u / 2 - 1, d / 2 - 1, 40, x0 + u / 2 + 1, d / 2 + 1, 52, claw); m.box(x0 + u / 2 - 3, d / 2 - 2, 37, x0 + u / 2 + 3, d / 2 + 2, 40, claw);
  }
  void tier;
  return m;
}
// an arcade's prize counter (shared/homelayout.js G; server arcade.js): the shelves of plush up the back wall lit along
// their edges, the counter in front - its glass case of prizes lit from inside, the ticket counter on it
export function prizeCounter(w = 96, d = 32, tier = 3) {
  const deep = d >= 56, m = new Vox(w, d, deep ? 62 : 40);
  const base = m.mat({ ramp: R('#3a2a4a'), k: 3 }), trim = glow(m, '#e85a9a', 90), shelf = m.mat({ ramp: R('#5a3a2a'), k: 3 });
  const gl = m.mat({ ramp: R('#cfe6ee', 5, 3), k: 3, flag: F_GLASS | F_NOCAST }), toys = ['#e85a9a', '#f2c21b', '#3ad0e8', '#7ae86a', '#f08a3a', '#f4f0e8', '#a87ae8'].map((c) => m.mat({ ramp: R(c), k: 3 }));
  const lit = glow(m, '#fff0c0', 120), reg = m.mat({ ramp: R('#2a2c34'), k: 2 }), regS = glow(m, '#5ae0ff', 180);
  const c0 = deep ? d - 30 : 2;   // (the counter's back)
  if (deep) {
    m.box(0, 0, 0, w, 10, 60, shelf);
    for (const z of [14, 30, 46]) { m.box(0, 0, z - 2, w, 14, z, shelf); for (let x = 2; x < w - 2; x++) m.set(x, 13, z - 1, lit); for (let x = 5, k = 0; x < w - 5; x += 8, k++) m.ell(x, 8, z + 4, 3.6, 3.2, 4 + (k % 2), toys[(k + z) % 7]); }
  }
  m.box(0, c0, 0, w, d, 8, base); m.box(0, c0, 8, 2, d, 24, base); m.box(w - 2, c0, 8, w, d, 24, base); m.box(0, c0, 8, w, c0 + 4, 24, base);
  for (let x = 4, i = 0; x < w - 6; x += 7, i++) { m.box(x, c0 + 8, 8, x + 4, c0 + 12, 12 + (i % 3) * 2, toys[i % 7]); m.box(x + 2, c0 + 18, 8, x + 5, c0 + 21, 11, toys[(i + 2) % 7]); }
  m.box(2, d - 1, 8, w - 2, d, 24, gl); m.box(2, c0 + 4, 24, w - 2, d, 25, gl); m.box(0, d - 1, 24, w, d, 26, trim); for (let x = 2; x < w - 2; x++) m.set(x, d - 2, 9, lit);
  m.box(w - 20, c0 + 6, 25, w - 8, c0 + 16, 34, reg); m.box(w - 18, c0 + 15, 30, w - 10, c0 + 16, 34, regS);   // the ticket counter
  void tier;
  return m;
}
// a row of cinema seats: deep red recliners, one to each 32 px, wide arms between them with cup holders
export function cinemaSeats(w = 128, d = 32, tier = 3) {
  const m = new Vox(w, d, 30);
  const red = m.mat({ ramp: R('#a01e26'), k: 3, shade: (x, y, z) => (Math.round(z) % 6 === 0 && y < 12 ? -0.6 : 0) }), arm = m.mat({ ramp: R('#2a1a1e'), k: 3 }), cup = m.mat({ ramp: R('#c8ccd2'), k: 4 });
  const n = Math.max(1, Math.round(w / 32)), sw = w / n, rows = Math.max(1, Math.round(d / 32));   // (two rows: the back one raised)
  for (let r = 0; r < rows; r++) {
    const y0 = r * 32, z0 = (rows - 1 - r) * 4;
    if (z0) m.box(0, y0, 0, w, y0 + 32, z0, arm);
    for (let i = 0; i < n; i++) {
      const x0 = i * sw;
      m.box(x0 + 4, y0 + 4, z0, x0 + sw - 4, y0 + 30, z0 + 12, red);         // the seat
      m.box(x0 + 4, y0 + 2, z0 + 12, x0 + sw - 4, y0 + 10, z0 + 28, red);     // the back
      m.box(x0 + 6, y0 + 26, z0 + 4, x0 + sw - 6, y0 + 31, z0 + 10, red);     // the footrest
    }
    for (let i = 0; i <= n; i++) { const x = Math.min(w - 4, Math.max(0, i * sw - 2)); m.box(x, y0 + 4, z0, x + 4, y0 + 28, z0 + 18, arm); m.cyl('z', x + 2, y0 + 24, 0, 1.4, z0 + 18, z0 + 19, cup); }
  }
  void tier;
  return m;
}
// a kitchen island: a marble top on a run of cupboards, the sink in it, three stools along its south side
export function island(w = 96, d = 64, tier = 3) {
  const P = L4(tier), m = new Vox(w, d, 40);
  const cab = m.mat({ ramp: R(P.cab), k: 3, shade: (x, y) => (y > d * 0.55 - 2 && Math.round(x) % 16 === 0 ? -0.9 : 0) }), top = m.mat({ ramp: R(tier >= 3 ? '#f2f0ec' : P.top), k: 4, shade: (x, y) => (Math.abs(Math.sin(x * 0.2 + y * 0.13)) < 0.05 ? -0.4 : 0) });
  const steel = m.mat({ ramp: MAT.chrome, k: 4 }), seat = m.mat({ ramp: R(P.fab), k: 3 }), leg = m.mat({ ramp: R(P.dark), k: 3 }), bowl = m.mat({ ramp: R('#d87a3a'), k: 3 });
  const dd = Math.round(d * 0.55);
  m.box(2, 4, 0, w - 2, dd - 2, 22, cab);
  m.box(0, 2, 22, w, dd + 2, 25, top);                         // the top, an overhang to sit at
  m.box(w * 0.2, 8, 24, w * 0.2 + 16, 16, 25, steel); m.box(w * 0.2 + 7, 6, 25, w * 0.2 + 9, 8, 32, steel);   // the sink, its tap
  m.ell(w * 0.7, dd / 2, 27, 6, 4, 2.5, bowl);
  const n = Math.max(2, Math.round(w / 32));
  for (let i = 0; i < n; i++) { const cx = (i + 0.5) * w / n; m.cyl('z', cx, dd + 9, 0, 1.4, 0, 14, leg); m.cyl('z', cx, dd + 9, 0, 5, 14, 17, seat); m.cyl('z', cx, dd + 9, 0, 4, 6, 7, leg); }
  return m;
}
// a sectional sofa: the long side along the back (w), a chaise down the east end toward you, cushions and pillows
export function sectional(w = 96, d = 64, tier = 2) {
  const P = L4(tier), m = new Vox(w, d, 26);
  const f = m.mat({ ramp: R(tier >= 3 ? '#e8e2d4' : P.fab), k: 3, shade: (x) => (Math.round(x) % 30 === 0 ? -0.8 : 0) }), pil = m.mat({ ramp: R(P.accent), k: 3 }), ft = m.mat({ ramp: R(P.dark), k: 2 });
  const sd = 30, cw = 30;
  m.box(1, 2, 0, w - 1, sd, 2, ft); m.box(w - cw, sd, 0, w - 1, d - 1, 2, ft);
  m.box(1, 2, 2, w - 1, sd - 1, 12, f); m.box(w - cw, sd - 1, 2, w - 1, d - 1, 12, f);   // the seats
  m.box(1, 2, 12, w - 1, 10, 24, f);                                                     // the back
  m.box(0, 2, 2, 6, sd - 1, 18, f); m.box(w - 6, 2, 2, w, d - 1, 18, f);                 // the arms
  m.box(8, 10, 12, 16, 14, 20, pil); m.box(w - cw - 8, 10, 12, w - cw, 14, 20, pil); m.box(w - 20, 10, 12, w - 12, 14, 20, pil);
  return m;
}
// a bathtub: enamel, rolled rim, the water in it, chrome taps at the head
export function bathtub(w = 64, d = 32, tier = 2) {
  const m = new Vox(w, d, 22);
  const en = m.mat({ ramp: R('#f2f2ee'), k: 4 }), wat = m.mat({ ramp: R('#9ac8de'), k: 3, flag: F_GLASS }), ch = m.mat({ ramp: MAT.chrome, k: 4 }), ft = m.mat({ ramp: R(tier >= 3 ? '#d8b050' : '#c8ccd2'), k: 4 });
  for (const [x, y] of [[4, 5], [w - 7, 5], [4, d - 8], [w - 7, d - 8]]) m.box(x, y, 0, x + 3, y + 3, 4, ft);
  m.box(2, 3, 4, w - 2, d - 3, 18, en);
  m.box(6, 7, 13, w - 6, d - 7, 18, 0);
  m.box(6, 7, 12, w - 6, d - 7, 13, wat);
  m.box(w - 6, d / 2 - 1, 16, w - 3, d / 2 + 1, 22, ch);
  return m;
}
// the yard's: a patio table under its umbrella, four chairs round it
export function patioSet(w = 64, d = 64, tier = 2) {
  const m = new Vox(w, d, 56);
  const fr = m.mat({ ramp: R(tier >= 3 ? '#e8e4dc' : '#4a4a50'), k: 3 }), top = m.mat({ ramp: R('#c8b89a'), k: 3 }), um = m.mat({ ramp: R(tier >= 3 ? '#f2eee4' : '#c84a3a'), k: 3, shade: (x, y) => (Math.round(Math.atan2(y - d / 2, x - w / 2) * 4) % 2 ? -0.5 : 0), flag: F_NOCAST });
  const cx = w / 2, cy = d / 2;
  m.cyl('z', cx, cy, 0, 11, 18, 20, top); m.cyl('z', cx, cy, 0, 1.5, 0, 50, fr);
  for (const [dx, dy] of [[-17, 0], [17, 0], [0, -17], [0, 17]]) { m.box(cx + dx - 5, cy + dy - 5, 9, cx + dx + 5, cy + dy + 5, 11, fr); for (const [ex, ey] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) m.box(cx + dx + ex, cy + dy + ey, 0, cx + dx + ex + 1, cy + dy + ey + 1, 9, fr); }
  m.ell(cx, cy, 48, 24, 24, 4, um);
  return m;
}
// a push mower, red, its handle back toward you
export function mower(w = 32, d = 32) {
  const m = new Vox(w, d, 22);
  const red = m.mat({ ramp: R('#c8342a'), k: 3 }), blk = m.mat({ ramp: R('#1e1e22'), k: 2 }), bar = m.mat({ ramp: MAT.chrome, k: 4 }), bag = m.mat({ ramp: R('#3a4a3a'), k: 3 });
  m.box(8, 4, 3, w - 8, 18, 9, red); m.cyl('z', w / 2, 11, 0, 3, 9, 12, blk);
  for (const [x, y] of [[7, 5], [w - 9, 5], [7, 16], [w - 9, 16]]) m.cyl('x', x + 1, y, 3, 3, x, x + 2, blk);
  m.box(10, 18, 4, w - 10, 24, 10, bag);
  for (const x of [9, w - 10]) m.box(x, 18, 9, x + 1, 30, 20, bar);
  m.box(9, 29, 19, w - 9, 30, 21, bar);
  return m;
}
// a lawn chair: a folding frame, its webbing in stripes
export function lawnChair(w = 32, d = 32) {
  const m = new Vox(w, d, 22);
  const fr = m.mat({ ramp: R('#c8ccd2'), k: 4 }), web = m.mat({ ramp: R('#3ab07a'), k: 3, shade: (x) => (Math.round(x) % 4 < 2 ? 0.6 : -0.3) });
  m.box(8, 8, 8, w - 8, d - 6, 10, web); m.box(8, 6, 10, w - 8, 9, 22, web);
  for (const x of [7, w - 8]) { m.box(x, 6, 0, x + 1, 7, 22, fr); m.box(x, d - 7, 0, x + 1, d - 6, 10, fr); m.box(x, 8, 10, x + 1, d - 6, 11, fr); }
  return m;
}
// a raised bed: a frame of boards full of soil and rows of greens (H61's plots stand here in the yard)
export function raisedBed(w = 64, d = 32, tier = 2, seed = 0) {
  const m = new Vox(w, d, 18);
  const bd = m.mat({ ramp: R('#8a5a34'), k: 3, shade: grain(0.4) }), soil = m.mat({ ramp: R('#4a3424'), k: 3 }), lf = m.mat({ ramp: MAT.leaf, k: 4 }), fl = m.mat({ ramp: R(['#e85a4a', '#e8c040', '#c870d8'][seed % 3]), k: 3 });
  m.box(1, 1, 0, w - 1, d - 1, 9, bd); m.box(4, 4, 6, w - 4, d - 4, 9, soil);
  for (let x = 9; x < w - 6; x += 9) for (let y = 9; y < d - 6; y += 9) { m.ell(x, y, 11, 3.5, 3.5, 3, lf); if (hash(x, y, seed) > 0.6) m.ell(x, y, 14, 1.5, 1.5, 1.5, fl); }
  void tier;
  return m;
}
export const YARD_MAKERS = { patio: patioSet, mower, chair: lawnChair, bed: raisedBed };

// a record player on a low wooden cabinet: the platter and a record on it, the tone arm, the lid up behind (Vinyl & More)
export function turntable(w = 32, d = 32, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, 30);
  const cab = m.mat({ ramp: R(P.wood), k: 3, shade: grain() }), deck = m.mat({ ramp: R('#2a2a30'), k: 3 }), rec = m.mat({ ramp: R('#141418'), k: 2, shade: (x, y) => (Math.round(Math.hypot(x - w / 2 + 2, y - d / 2 - 2)) % 2 ? -0.4 : 0) }), lab = m.mat({ ramp: R('#c83a2a'), k: 3 }), arm = m.mat({ ramp: R('#c8ccd2'), k: 4 }), lid = m.mat({ ramp: R('#8a9aa8'), k: 3, flag: F_GLASS });
  m.box(3, 8, 0, w - 3, d - 3, 16, cab); m.box(4, 9, 16, w - 4, d - 4, 19, deck);
  m.fill((x, y, z) => { const r = Math.hypot(x - w / 2 + 2, y - d / 2 - 2); return r < 2.4 ? lab : r < 9 ? rec : -1; }, 4, 9, 19, w - 4, d - 4, 20);
  m.box(w - 8, 11, 19, w - 6, 13, 22, arm); for (let k = 0; k < 8; k++) m.box(w - 8 - k, 13 + k * 0.6, 21, w - 7 - k, 14 + k * 0.6, 22, arm);
  m.box(4, 8, 19, w - 4, 10, 29, lid);
  void tier;
  return m;
}
// two crates of records side by side (a wooden one, a blue plastic one), the sleeves standing in them
export function recordCrates(w = 32, d = 32, tier = 1) {
  const m = new Vox(w, d, 22), wd = m.mat({ ramp: R('#a8743c'), k: 3, shade: grain() }), bl = m.mat({ ramp: R('#2f6ab0'), k: 3 });
  const sl = ['#c83a2a', '#e8c040', '#2a2a30', '#5aa0d0', '#e8e4dc', '#3a8a5a'].map((c) => m.mat({ ramp: R(c), k: 3 }));
  for (let k = 0; k < 2; k++) {
    const x0 = 2 + k * 14, c = k ? bl : wd;
    m.box(x0, 10, 0, x0 + 13, d - 4, 13, c); m.box(x0 + 1, 11, 2, x0 + 12, d - 5, 13, 0);
    for (let j = 0; j < 9; j++) m.box(x0 + 1, 12 + j * 2, 2, x0 + 12, 13 + j * 2, 17 - (j % 3), sl[(j + k * 2 + (j >> 1)) % sl.length]);
  }
  void tier;
  return m;
}
// ---- the home upgrades' pieces (server/systems/homeups.js; shared/homeups.js ROOMS) -------------------------------------
// the stairs between a home's floors (2 x 2 tiles): kind 1 a flight up to the back wall with its banister, 2 a stairwell
// down - a railed opening, the steps dropping away into the dark, 3 both: the flight up beside the way down
export function homeStairs(w = 64, d = 64, tier = 1, kind = 1) {
  const P = L4(tier), m = new Vox(w, d, 58);
  const tread = m.mat({ ramp: R(tier >= 2 ? '#8a5a3a' : '#8a8680'), k: 3, shade: (x, y) => (Math.round(y) % 8 < 1 ? -0.9 : 0) }), side = m.mat({ ramp: R(P.dark), k: 3 }), rail = m.mat({ ramp: R(P.wood), k: 3 });
  const deep = [0.25, 0.4, 0.55, 0.72].map((k) => m.mat({ ramp: R(tier >= 2 ? '#6a4a32' : '#6a6862'), k: 2, shade: () => -2.2 * (1 - k) })), hole = m.mat({ ramp: R('#141416'), k: 2 });
  const up = kind !== 2, down = kind >= 2, ux0 = kind === 3 ? w / 2 : 0;
  if (up) {
    for (let i = 0; i < 8; i++) m.box(ux0, d - (i + 1) * 8, 0, w - 6, d - i * 8, (i + 1) * 6, tread);
    m.box(w - 6, 0, 0, w - 3, d, 10, side);
    for (let i = 0; i < 8; i++) m.box(w - 5, d - (i + 1) * 8, 10, w - 3, d - (i + 1) * 8 + 2, (i + 1) * 6 + 12, rail);
    m.box(w - 6, 0, 52, w - 2, d, 55, rail);
  }
  if (down) {
    const x1 = kind === 3 ? w / 2 - 2 : w - 4;
    m.box(3, 3, 0, x1, d - 3, 1, hole);
    for (let i = 0; i < 4; i++) m.box(4, 6 + i * 12, 0, x1 - 1, 6 + i * 12 + 6, 1, deep[3 - i]);   // (the steps going down, darker the deeper)
    for (const x of [2, x1]) { m.box(x, 2, 0, x + 2, d - 2, 2, side); for (let y = 4; y < d - 2; y += 14) m.box(x, y, 2, x + 2, y + 2, 22, rail); m.box(x, 2, 22, x + 2, d - 2, 24, rail); }
    for (let x = 4; x < x1; x += 14) m.box(x, d - 4, 2, x + 2, d - 2, 22, rail);
    m.box(2, d - 4, 22, x1 + 2, d - 2, 24, rail);
  }
  return m;
}
// a fireplace against the wall: the surround (brick, then stone, then marble by the tier), the hearth before it, the
// dark firebox with logs laid in it, the mantelshelf with candlesticks and a clock (the flames: the page draws them lit)
export function fireplace(w = 64, d = 32, tier = 1) {
  const m = new Vox(w, d, 62);
  const sur = m.mat({ ramp: tier >= 3 ? R('#e8e4dc') : tier >= 2 ? R('#a8a294') : MAT.brick, k: 3, shade: tier >= 3 ? (x, y, z) => (hash(Math.round(x / 3), Math.round(z / 3), 4) > 0.82 ? -0.4 : 0) : (x, y, z) => ((Math.round(z) % 6 === 0 || (Math.round(x) + (Math.floor(z / 6) % 2) * 4) % 8 === 0) ? -1 : 0) });
  const hearth = m.mat({ ramp: R(tier >= 3 ? '#2a2a30' : '#7a7068'), k: 3 }), box = m.mat({ ramp: R('#1a1614'), k: 2 }), log = m.mat({ ramp: R('#6a4228'), k: 3, shade: grain(0.5) }), end = m.mat({ ramp: R('#d8b07a'), k: 3 });
  const mant = m.mat({ ramp: R(tier >= 2 ? '#5a3424' : '#7a5c40'), k: 3, shade: grain(0.4) }), brass = m.mat({ ramp: R('#d8b050'), k: 4 }), wax = m.mat({ ramp: R('#f2ecd8'), k: 3 });
  m.box(2, 2, 0, w - 2, d - 10, 50, sur);
  m.box(0, d - 10, 0, w, d, 3, hearth);
  m.box(14, d - 13, 3, w - 14, d - 10, 30, box); m.box(16, 4, 3, w - 16, d - 10, 28, box);
  for (const [z, dx] of [[4, 0], [8, 4]]) { m.cyl('x', 0, d - 16, z + 2, 2.5, 18 + dx, w - 18 - dx, log); m.box(18 + dx, d - 18, z, 19 + dx, d - 14, z + 4, end); }
  m.box(0, d - 14, 50, w, d - 8, 54, mant);
  for (const x of [8, w - 10]) { m.box(x, d - 12, 54, x + 2, d - 10, 56, brass); m.box(x + 0.5, d - 12, 56, x + 1.5, d - 11, 62, wax); }
  m.box(w / 2 - 4, d - 12, 54, w / 2 + 4, d - 9, 61, mant); m.box(w / 2 - 2, d - 9, 56, w / 2 + 2, d - 8, 60, wax);
  return m;
}
// a hot tub: a wooden-sided tub (white acrylic in a mansion's), the water in it, the seats round it, a step up
export function hotTub(w = 64, d = 64, tier = 2) {
  const m = new Vox(w, d, 24);
  const side = m.mat({ ramp: R(tier >= 3 ? '#e8e8e4' : '#8a5a34'), k: 3, shade: tier >= 3 ? null : (x, y) => (Math.round(x + y) % 6 === 0 ? -0.8 : 0) }), rim = m.mat({ ramp: R(tier >= 3 ? '#c8ccd2' : '#6a4228'), k: 3 });
  const water = m.mat({ ramp: R('#5ab4d8'), k: 3, flag: F_GLASS, shade: (x, y) => (hash(Math.round(x / 3), Math.round(y / 3), 9) > 0.86 ? 0.8 : 0) }), seat = m.mat({ ramp: R(tier >= 3 ? '#d8dcde' : '#9ac8d8'), k: 3 });
  m.box(2, 2, 0, w - 2, d - 2, 20, side); m.box(2, 2, 20, w - 2, d - 2, 22, rim);
  m.box(6, 6, 6, w - 6, d - 6, 22, 0);
  m.box(6, 6, 14, w - 6, d - 6, 15, water);
  for (const [x0, y0, x1, y1] of [[6, 6, w - 6, 12], [6, 6, 12, d - 6], [w - 12, 6, w - 6, d - 6]]) m.box(x0, y0, 6, x1, y1, 13, seat);
  m.box(w / 2 - 10, d - 2, 0, w / 2 + 10, d, 8, side);
  return m;
}
// a home bar: the counter, its brass foot rail and a row of bottles and glasses on it, two stools in front
export function homeBar(w = 64, d = 32, tier = 1) {
  const P = L4(tier), m = new Vox(w, d, 46);
  const front = m.mat({ ramp: R(tier >= 3 ? '#2a1a16' : P.wood), k: 3, shade: (x) => (Math.round(x) % 8 === 0 ? -0.9 : 0) }), top = m.mat({ ramp: R(tier >= 2 ? '#e8e4dc' : P.top), k: 4 }), brass = m.mat({ ramp: R('#d8b050'), k: 4 });
  const seat = m.mat({ ramp: R(tier >= 2 ? '#7a1d24' : '#3a3a40'), k: 3 }), leg = m.mat({ ramp: MAT.chrome, k: 4 });
  const bott = ['#3a7a3a', '#7a3a2a', '#c8a040', '#2a4a7a', '#e8e4dc'].map((c) => m.mat({ ramp: R(c), k: 4, flag: F_GLASS }));
  m.box(1, 2, 0, w - 1, d - 12, 30, front); m.box(0, 1, 30, w, d - 10, 33, top);
  m.box(2, d - 13, 4, w - 2, d - 12, 6, brass);
  for (let k = 0; k < 6; k++) { const x = 6 + k * ((w - 12) / 6); m.box(x, 6, 33, x + 3, 9, 33 + (k % 2 ? 9 : 12), bott[k % bott.length]); }
  for (const x of [w * 0.28, w * 0.72]) { m.cyl('z', x, d - 5, 0, 1, 0, 18, leg); m.cyl('z', x, d - 5, 0, 5, 18, 21, seat); }
  return m;
}
// an exercise bike: its frame, the flywheel at the front, the saddle and the handlebars, a little screen
export function exBike(w = 32, d = 32, tier = 1) {
  const m = new Vox(w, d, 40);
  const fr = m.mat({ ramp: R(tier >= 2 ? '#2a2a30' : '#5a6a7a'), k: 3 }), fly = m.mat({ ramp: MAT.chrome, k: 4 }), sad = m.mat({ ramp: R('#1a1a1e'), k: 3 }), scr = m.mat({ ramp: R('#3ad0e8'), k: 3, emi: [90, 220, 255, 90] }), red = m.mat({ ramp: R('#c83a2a'), k: 3 });
  m.box(10, 4, 0, w - 10, 28, 3, fr);
  m.cyl('x', 0, 9, 12, 8, w / 2 - 2, w / 2 + 2, fly);
  m.box(w / 2 - 1.5, 9, 3, w / 2 + 1.5, 24, 6, fr);
  m.box(w / 2 - 1.5, 22, 3, w / 2 + 1.5, 25, 26, fr); m.box(w / 2 - 4, 20, 26, w / 2 + 4, 28, 29, sad);
  m.box(w / 2 - 1.5, 7, 6, w / 2 + 1.5, 10, 32, fr); m.box(w / 2 - 7, 6, 32, w / 2 + 7, 9, 34, red); m.box(w / 2 - 3, 9, 30, w / 2 + 3, 10, 35, scr);
  return m;
}
// the storeroom's shelves: a steel rack, three shelves of boxes, blocks of stone and scrap
export function shelves(w = 64, d = 32, tier = 1) {
  const m = new Vox(w, d, 56);
  const st = m.mat({ ramp: R('#6a727a'), k: 3 }), box = m.mat({ ramp: R('#b08a5a'), k: 3, shade: (x, y, z) => (Math.round(z) % 8 === 0 ? -0.6 : 0) }), stone = m.mat({ ramp: R('#a8a294'), k: 3 }), scrap = m.mat({ ramp: R('#7a5a44'), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(z), 5) > 0.7 ? 0.7 : 0) });
  for (const x of [2, w - 4]) for (const y of [6, d - 4]) m.box(x, y, 0, x + 2, y + 2, 54, st);
  for (const z of [2, 20, 38]) m.box(2, 6, z, w - 2, d - 2, z + 2, st);
  for (let k = 0; k < 3; k++) { const z = 4 + k * 18; m.box(6, 9, z, 6 + 14, d - 5, z + 12, box); m.box(24, 10, z, 36, d - 5, z + 7, k === 1 ? scrap : stone); m.box(40, 9, z, w - 6, d - 5, z + (k === 2 ? 14 : 10), k ? box : stone); }
  void tier;
  return m;
}
// a woodpile: split logs stacked crosswise, their pale cut ends towards you
export function woodpile(w = 32, d = 32, tier = 1) {
  const m = new Vox(w, d, 30);
  const bark = m.mat({ ramp: R('#5a3a24'), k: 3, shade: grain(0.6) }), end = m.mat({ ramp: R('#d8b07a'), k: 3, shade: (x, y, z) => (Math.round(Math.hypot(x % 7 - 3.5, z % 7 - 3.5)) % 2 ? -0.4 : 0) });
  for (let row = 0; row < 4; row++) for (let k = 0; k < 4 - (row > 2 ? 1 : 0); k++) {
    const x = 3 + k * 7 + (row % 2) * 3, z = 3 + row * 6.5;
    if (x + 6 > w - 1) continue;
    m.cyl('y', x + 3, 0, z, 3.3, 6, d - 3, bark); m.cyl('y', x + 3, 0, z, 2.6, d - 3, d - 1, end);
  }
  void tier;
  return m;
}
export const MAKERS = { '^': homeStairs, p: fireplace, '%': hotTub, m: homeBar, e: exBike, z: shelves, '&': woodpile, M: mailboxes, d: turntable, q: recordCrates, Z: stairs, B: bed, W: wardrobe, S: safe, F: fridge, H: shower, A: hallTable, Y: keyBoard, K: counter, T: table, C: couch, V: tv, L: toilet, N: basin, O: armchair, Q: bookshelf, P: plant, b: bedside, l: lamp, v: walltv, a: art, w: washer, k: workbench, x: poolTable, j: arcade, G: prizeCounter, 7: skeeBall, 4: airHockey, 5: pinball, 6: clawMachine, i: cinemaSeats, n: island, s: sectional, h: bathtub };
