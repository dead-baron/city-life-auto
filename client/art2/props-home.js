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
// an arcade cabinet: tall, its screen lit (brighter at night), the marquee over it, the joystick and buttons on the deck
export function arcade(w = 32, d = 32, tier = 3, on = 0) {
  const m = new Vox(w, d, 60);
  const cab = m.mat({ ramp: R('#2a2e5a'), k: 3, shade: (x, y, z) => (x < 7 || x > w - 8 ? (Math.round(z) % 10 < 3 ? 0.6 : 0) : 0) }), blk = m.mat({ ramp: R('#141418'), k: 2 });
  const scr = m.mat({ ramp: R('#3ad0e8'), k: 2, emi: [80, 220, 255, 90 + on * 120], flag: F_NOCAST, shade: (x, y, z) => (Math.round(z) % 3 === 0 ? -0.4 : hash(Math.round(x), Math.round(z), 3) > 0.8 ? 0.6 : 0) });
  const mq = m.mat({ ramp: R('#e85a9a'), k: 3, emi: [255, 110, 190, 60 + on * 120], flag: F_NOCAST }), btn = ['#e83a3a', '#e8d03a', '#3ae86a'].map((c) => m.mat({ ramp: R(c), k: 3 }));
  m.box(6, 6, 0, w - 6, d - 6, 58, cab);
  m.box(7, d - 6, 0, w - 7, d - 2, 22, cab);                  // the base, out toward you
  m.box(7, d - 8, 22, w - 7, d - 1, 25, blk);                 // the control deck
  m.box(10, d - 6, 28, w - 10, d - 5, 44, scr);               // the screen
  m.box(7, d - 7, 48, w - 7, d - 5, 56, mq);                  // the marquee
  m.box(11, d - 5, 25, 13, d - 3, 30, blk); btn.forEach((b, i) => m.box(16 + i * 3, d - 5, 25, 18 + i * 3, d - 3, 26, b));
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
export const MAKERS = { M: mailboxes, d: turntable, q: recordCrates, Z: stairs, B: bed, W: wardrobe, S: safe, F: fridge, H: shower, A: hallTable, Y: keyBoard, K: counter, T: table, C: couch, V: tv, L: toilet, N: basin, O: armchair, Q: bookshelf, P: plant, b: bedside, l: lamp, v: walltv, a: art, w: washer, k: workbench, x: poolTable, j: arcade, i: cinemaSeats, n: island, s: sectional, h: bathtub };
