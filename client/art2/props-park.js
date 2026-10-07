// Art v2 park and beach props as voxel models (voxel.js): a gazebo, an arched footbridge, a statue on
// a plinth, football goals, ducks and reeds, picnic and beach kit (cooler, sandcastle, rubber ring,
// beach chair), a boardwalk rail and steps, a beach bar's string lights, and park signs.
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, F_LEAF, F_WATER, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);

// an octagonal gazebo: a raised floor, posts and rails, a pointed shingled roof with a finial
export function gazebo(r = 34, color = '#ecebe4', roof = '#4e6a5e') {
  const D = r * 2 + 6, c = D / 2, m = new Vox(D, D, 86);
  const w = m.mat({ ramp: R(color), k: 3 }), fl = m.mat({ ramp: MAT.woodDock, k: 3, shade: (x) => (Math.round(x) % 6 === 0 ? -0.6 : 0) });
  const rf = m.mat({ ramp: R(roof), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.6 : 0) });
  const oct = (x, y, rr) => { const dx = Math.abs(x - c), dy = Math.abs(y - c); return Math.max(dx, dy, (dx + dy) * 0.7071) <= rr; };
  m.fill((x, y, z) => (oct(x, y, r) ? (z < 5 ? w : fl) : -1), 0, 0, 0, D, D, 7);
  for (let a = 0; a < 8; a++) { const px = c + Math.cos(a * Math.PI / 4 + Math.PI / 8) * (r - 3), py = c + Math.sin(a * Math.PI / 4 + Math.PI / 8) * (r - 3); m.box(px - 1.5, py - 1.5, 7, px + 1.5, py + 1.5, 52, w); }
  m.fill((x, y, z) => (oct(x, y, r - 1) && !oct(x, y, r - 4) && (z === 22 || z === 23 || ((Math.round(x) + Math.round(y)) % 4 === 0 && z < 22)) && !(y > c + r - 8 && Math.abs(x - c) < 9) ? w : -1), 0, 0, 7, D, D, 24);
  m.fill((x, y, z) => { const t = (z - 50) / 30; return oct(x, y, (r + 4) * (1 - t)) ? rf : -1; }, 0, 0, 50, D, D, 80);
  m.box(c - 1, c - 1, 80, c + 1, c + 1, 86, w);
  m.smooth = 1;
  return m;
}
// an arched wooden footbridge (len along x) with railings
export function archBridge(len = 120, w = 26, rise = 16) {
  const m = new Vox(len, w, rise + 22);
  const deck = m.mat({ ramp: MAT.woodDock, k: 3, shade: (x) => (Math.round(x) % 5 === 0 ? -0.7 : 0) }), rail = m.mat({ ramp: MAT.woodDark, k: 3 });
  const top = (x) => rise * Math.sin(Math.PI * x / len);
  m.fill((x, y, z) => (z <= top(x) + 2 && z >= top(x) - 2 ? deck : -1), 0, 2, 0, len, w - 2, rise + 3);
  for (const y of [1, w - 2]) m.fill((x, yy, z) => { const t = top(x); return (Math.abs(z - (t + 16)) < 1.2 || (Math.round(x) % 12 === 0 && z > t && z < t + 16) || (Math.abs(z - (t + 8)) < 0.6 && (Math.round(x + z) % 6 === 0))) ? rail : -1; }, 0, y, 0, len, y + 1, rise + 20);
  return m;
}
// a bronze statue of a figure in a long coat on a stone plinth
export function statue() {
  const m = new Vox(24, 24, 84);
  const st = m.mat({ ramp: R('#c8c0b0'), k: 3 }), br = m.mat({ ramp: R('#5a6058'), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(z), 3) > 0.85 ? 1.2 : 0) });
  m.box(0, 0, 0, 24, 24, 6, st); m.box(3, 3, 6, 21, 21, 30, st); m.box(1, 1, 30, 23, 23, 34, st);
  m.fill((x, y, z) => { const zz = z - 34; if (zz < 0) return -1; const torso = zz < 34 ? 6 - zz * 0.04 : 0; if (zz < 34 && Math.hypot((x - 12) / 1.2, y - 12) < torso + (zz < 14 ? 2 - zz * 0.1 : 0)) return br; if (zz >= 34 && zz < 44 && Math.hypot(x - 12, y - 12, (zz - 39) * 0.9) < 4.6) return br; if (zz > 20 && zz < 32 && Math.abs(y - 12) < 2 && x > 16 && x < 22 - (zz - 20) * 0.1) return br; return -1; }, 0, 0, 34, 24, 24, 84);
  m.smooth = 1;
  return m;
}
export function soccerGoal(w = 60, h = 30, d = 18) {
  const m = new Vox(d, w, h + 2);
  const f = m.mat({ ramp: R('#f4f2ec'), k: 4 }), n = m.mat({ ramp: R('#e8e8e4'), k: 2, flag: F_NOCAST });
  m.box(d - 2, 0, 0, d, 2, h, f); m.box(d - 2, w - 2, 0, d, w, h, f); m.box(d - 2, 0, h - 2, d, w, h, f);
  m.fill((x, y, z) => { const back = z < h - (d - x) * (h / d) * 0.6; if (!back && x < d - 2) return -1; return (Math.round(y) % 3 === 0 || Math.round(z) % 3 === 0) && x < d - 2 && (x < 1 || y < 1 || y > w - 2 || Math.abs(z - (h - (d - x) * (h / d) * 0.6)) < 1) ? n : -1; }, 0, 0, 0, d, w, h);
  return m;
}
export function duck(drake = true) {
  const m = new Vox(14, 8, 10);
  const b = m.mat({ ramp: R(drake ? '#8a7a64' : '#9a7a5a'), k: 3 }), h = m.mat({ ramp: R(drake ? '#2e6a3a' : '#7a6248'), k: 3 }), bill = m.mat({ ramp: R('#e0a030'), k: 3 });
  m.ell(6, 4, 3, 5.5, 3.2, 2.6, b); m.ell(11, 4, 7, 2.4, 2.2, 2.4, h); m.box(13, 3.5, 6, 15, 4.5, 7, bill); m.box(1, 3, 4, 3, 5, 6, b);
  return m;
}
export function reeds(seed = 1, n = 18) {
  const m = new Vox(20, 14, 34);
  const l = m.mat({ ramp: MAT.leaf, k: 3, flag: F_LEAF }), cat = m.mat({ ramp: R('#6a4a2e'), k: 3 });
  for (let i = 0; i < n; i++) { const x = 2 + hash(i, 1, seed) * 16, y = 2 + hash(i, 2, seed) * 10, h = 18 + hash(i, 3, seed) * 14, lean = (hash(i, 4, seed) - 0.5) * 6; for (let z = 0; z < h; z++) m.box(x + lean * z / h, y, z, x + lean * z / h + 1, y + 1, z + 1, l); if (hash(i, 5, seed) > 0.6) m.box(x + lean - 0.5, y - 0.5, h - 6, x + lean + 1.5, y + 1.5, h - 1, cat); }
  return m;
}
export function cooler(color = '#2f6ab0') { const m = new Vox(16, 10, 12); const b = m.mat({ ramp: R(color), k: 3 }), w = m.mat({ ramp: R('#f0eee8'), k: 3 }); m.box(0, 0, 0, 16, 10, 8, b); m.box(0, 0, 8, 16, 10, 11, w); m.box(5, 4, 11, 11, 6, 12, w); return m; }
export function sandcastle() {
  const m = new Vox(26, 22, 22);
  const s = m.mat({ ramp: MAT.sand, k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.5 : 0) });
  m.box(2, 2, 0, 24, 20, 6, s);
  for (const [x, y, h] of [[6, 6, 18], [20, 6, 16], [6, 16, 15], [20, 16, 17], [13, 11, 21]]) { m.cyl('z', x, y, 0, 3.5, 6, h, s); for (let a = 0; a < 4; a++) m.box(x - 3.5 + (a % 2) * 5, y - 3.5 + Math.floor(a / 2) * 5, h, x - 1.5 + (a % 2) * 5, y - 1.5 + Math.floor(a / 2) * 5, h + 2, s); }
  return m;
}
export function ringFloat(color = '#f06a9a') { const m = new Vox(22, 22, 6); const r = m.mat({ ramp: R(color), k: 3, flag: F_WATER }), w = m.mat({ ramp: R('#f4f0ea'), k: 3 }); m.fill((x, y, z) => { const d = Math.hypot(x - 11, y - 11), t = Math.hypot(d - 7, z - 3); return t < 3.4 ? ((Math.floor(Math.atan2(y - 11, x - 11) * 1.9) & 1) ? w : r) : -1; }); m.smooth = 1; return m; }
export function beachChair(color = '#e8504a') {
  const m = new Vox(26, 14, 16);
  const f = m.mat({ ramp: MAT.woodDock, k: 3 }), c = m.mat({ ramp: R(color), k: 3, shade: (x) => (Math.floor(x / 3) % 2 ? -1.5 : 0) });
  m.box(2, 1, 3, 16, 13, 4, c); for (let k = 0; k < 11; k++) m.box(16 + k * 0.8, 1, 4 + k, 17.5 + k * 0.8, 13, 5 + k, c);
  for (const [x, y] of [[2, 1], [2, 12], [15, 1], [15, 12]]) m.box(x, y, 0, x + 1, y + 1, 4, f);
  return m;
}
// a wooden boardwalk railing (along x): posts, a top rail and a sagging rope where open
export function woodRail(len = 80, rope = false) {
  const m = new Vox(len, 6, 22);
  const w = m.mat({ ramp: MAT.woodDark, k: 3 }), r = m.mat({ ramp: R('#c8a870'), k: 3 });
  for (let x = 0; x < len; x += 20) m.box(x, 1, 0, x + 4, 5, rope ? 16 : 20, w);
  if (rope) m.fill((x, y, z) => (Math.abs(z - (14 - 4 * Math.sin(Math.PI * ((x % 20) / 20)))) < 0.8 && Math.abs(y - 3) < 1 ? r : -1));
  else { m.box(0, 1, 18, len, 5, 21, w); m.box(0, 2, 10, len, 4, 12, w); }
  return m;
}
// steps down from a raised boardwalk (descending toward +y)
export function steps(w = 40, n = 6, rise = 4, run = 6, color = '#8a6440') {
  const m = new Vox(w, n * run, n * rise);
  const s = m.mat({ ramp: R(color), k: 3, shade: (x, y) => (Math.round(y) % run === 0 ? 1.2 : Math.round(y) % run === run - 1 ? -1.4 : 0) });
  m.fill((x, y, z) => (z < (n - Math.floor(y / run)) * rise ? s : -1));
  return m;
}
// a park or beach sign on two posts with a board (lettering is painted by the caller's building kit)
export function parkSign(color = '#2e5a3e') {
  const m = new Vox(26, 6, 30);
  const p = m.mat({ ramp: MAT.woodDark, k: 3 }), b = m.mat({ ramp: R(color), k: 3, shade: (x, y, z) => (Math.hypot(x - 13, z - 21) < 4 ? 2.5 : 0) });
  m.box(3, 2, 0, 5, 4, 26, p); m.box(21, 2, 0, 23, 4, 26, p); m.box(1, 1, 12, 25, 3, 30, b);
  return m;
}
// a festoon of lamps strung between two points: returns bulbs as point lights for the scene
export function stringLights(sc, x0, y0, x1, y1, z = 50, n = 10, on = 1) {
  sc.wire(x0, y0, z, x1, y1, z, 6, [40, 32, 30]);
  for (let i = 1; i < n; i++) {
    const t = i / n, X = x0 + (x1 - x0) * t, Y = y0 + (y1 - y0) * t, Z = z - 6 * 4 * t * (1 - t) - 1;
    sc.wireBulbs = sc.wireBulbs || [];
    sc.wireBulbs.push([X, Y, Z]);
    if (on && i % 3 === 0) sc.light(X, Y + 2, Z, 40, [1, 0.8, 0.5], sc.isNight ? 1.2 : 0.3);
  }
}

// ---- the public pool (concept L1) ----------------------------------------------------------------------------
// the changing block along the pool's north side, its front (south face) to the deck: cream tiles over a brick
// plinth, a flat gravel roof with a parapet and AC units, the entrance with its kiosk window under a teal awning,
// two blue changing-room doors with figure plaques, a clock, a life ring, a blue sign with a white wave on the
// parapet, potted palms at the door. Built along +x (w), d deep.
export function poolHouse(w = 288, d = 60) {
  const H = 44, m = new Vox(w, d + 16, H + 18), y0 = 1, y1 = y0 + d;
  const wall = m.mat({ ramp: R('#e8dcc4'), k: 3, shade: (x, y, z) => (Math.round(z) % 8 === 0 || Math.round(x) % 8 === 0 ? -0.45 : 0) });
  const brick = m.mat({ ramp: R('#9a4a38'), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.9 : 0) + ((Math.round(x) + (Math.floor(z / 4) % 2) * 4) % 8 === 0 ? -0.6 : 0) });
  const roof = m.mat({ ramp: R('#8e8a84'), k: 2, shade: (x, y) => (hash(Math.round(x / 3), Math.round(y / 3), 3) - 0.5) * 0.8 }), lip = m.mat({ ramp: R('#d4c8b0'), k: 3 });
  const door = m.mat({ ramp: R('#2f5a8a'), k: 3 }), plaque = m.mat({ ramp: R('#f0f0ec'), k: 4 }), frame = m.mat({ ramp: R('#5a5e66'), k: 2 });
  const glass = m.mat({ ramp: R('#3a5a6a'), k: 2, flag: F_GLASS, gloss: 0.5, emi: [255, 220, 160, 50] });
  const awn = m.mat({ ramp: R('#2f7a7a'), k: 3 }), awnW = m.mat({ ramp: R('#ece6d6'), k: 3 });
  const sign = m.mat({ ramp: R('#2a6ac0'), k: 3, emi: [120, 190, 255, 70] }), signW = m.mat({ ramp: R('#f4f4f2'), k: 4, emi: [255, 255, 255, 90] });
  const ac = m.mat({ ramp: R('#c8cac8'), k: 3, shade: (x, y, z) => (Math.round(x) % 3 === 0 && z > 4 ? -0.8 : 0) }), dark = m.mat({ ramp: R('#2a2e32'), k: 1 });
  const ring = m.mat({ ramp: R('#e8442e'), k: 3 }), ringW = m.mat({ ramp: R('#f2eee6'), k: 3 }), pot = m.mat({ ramp: R('#b8643a'), k: 3 });
  const leaf = m.mat({ ramp: MAT.leaf, k: 3, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.2 });
  m.box(0, y0, 0, w, y1, 8, brick);                                     // the plinth
  m.box(0, y0, 8, w, y1, H, wall);                                      // the walls
  m.box(0, y0, H, w, y1, H + 1, roof);                                  // the roof
  m.box(0, y0, H, w, y0 + 2, H + 4, lip); m.box(0, y1 - 2, H, w, y1, H + 4, lip); m.box(0, y0, H, 2, y1, H + 4, lip); m.box(w - 2, y0, H, w, y1, H + 4, lip);
  for (const x of [w * 0.18, w * 0.3, w * 0.74]) { m.box(x, y0 + 12, H + 1, x + 16, y0 + 26, H + 11, ac); m.box(x + 2, y0 + 26, H + 1, x + 14, y0 + 27, H + 9, dark); }
  // the entrance: glass doors and the kiosk window under the awning, west of middle
  const ex = Math.round(w * 0.32);
  m.box(ex, y1 - 1, 8, ex + 22, y1, 34, glass); m.box(ex - 1, y1 - 1, 8, ex, y1, 35, frame); m.box(ex + 22, y1 - 1, 8, ex + 23, y1, 35, frame); m.box(ex - 1, y1 - 1, 34, ex + 23, y1, 35, frame);
  m.box(ex + 30, y1 - 1, 16, ex + 58, y1, 32, glass); m.box(ex + 29, y1 - 1, 14, ex + 59, y1 + 3, 16, plaque);   // the kiosk window and its counter
  m.fill((x, y, z) => { const top = 40 - (y - y1) * 0.5; return z >= top - 1.5 && z < top ? (Math.floor((x - ex) / 8) % 2 ? awn : awnW) : -1; }, ex - 4, y1, 30, ex + 62, y1 + 14, 41);
  // the changing-room doors with their plaques, east of middle; a clock between
  for (const [x, c] of [[Math.round(w * 0.56), 0], [Math.round(w * 0.66), 1]]) {
    m.box(x, y1 - 1, 8, x + 16, y1, 34, door); m.box(x - 1, y1 - 1, 8, x, y1, 35, frame); m.box(x + 16, y1 - 1, 8, x + 17, y1, 35, frame);
    m.box(x + 5, y1, 24, x + 11, y1 + 1, 30, plaque); m.box(x + 7, y1 + 1, 25 + c, x + 9, y1 + 2, 29 - c, door);
  }
  m.fill((x, y, z) => (Math.hypot(x - w * 0.615, z - 36) < 4 ? (Math.hypot(x - w * 0.615, z - 36) < 3 ? plaque : dark) : -1), Math.floor(w * 0.6), y1, 30, Math.ceil(w * 0.63), y1 + 1, 42);
  // a window at the east end, the life ring beside it
  m.box(w - 40, y1 - 1, 18, w - 14, y1, 34, glass);
  m.fill((x, y, z) => { const r = Math.hypot(x - (w - 52), z - 26); return r >= 4 && r < 7 ? (Math.floor(Math.atan2(z - 26, x - (w - 52)) / (Math.PI / 4) + 8) % 2 ? ring : ringW) : -1; }, w - 60, y1, 18, w - 44, y1 + 2, 34);
  // the sign on the parapet: blue with a white wave
  const sx = Math.round(w * 0.5) - 26;
  m.box(sx, y1 - 3, H, sx + 52, y1 - 1, H + 16, sign);
  m.fill((x, y, z) => (Math.abs(z - (H + 8 + Math.sin((x - sx) * 0.45) * 2.6)) < 1.3 && x > sx + 6 && x < sx + 46 ? signW : -1), sx, y1 - 1, H, sx + 52, y1, H + 16);
  // potted palms either side of the entrance
  for (const x of [ex - 12, ex + 66]) { m.box(x, y1 + 4, 0, x + 8, y1 + 12, 7, pot); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; for (let s = 0; s < 9; s++) m.box(x + 4 + Math.cos(a) * s, y1 + 8 + Math.sin(a) * s * 0.6, 14 + s * 0.6 - (s > 5 ? (s - 5) * 1.2 : 0), x + 5 + Math.cos(a) * s, y1 + 9 + Math.sin(a) * s * 0.6, 15 + s * 0.6 - (s > 5 ? (s - 5) * 1.2 : 0), leaf); } m.box(x + 3, y1 + 7, 7, x + 5, y1 + 9, 14, pot); }
  return m;
}
// a round hot tub set in the deck: a pale coping, blue tiles inside, bubbling water, a handrail
export function hotTub(r = 30) {
  const D = r * 2 + 4, c = D / 2, m = new Vox(D, D, 26);
  const rim = m.mat({ ramp: R('#dcd8d0'), k: 3 }), tile = m.mat({ ramp: R('#2a7ab0'), k: 3 }), rail = m.mat({ ramp: MAT.metal, k: 3 });
  const wat = m.mat({ ramp: R('#2aa8c8', 5, 3), k: 3, flag: F_WATER | F_NOCAST, shade: (x, y) => { const h = hash(Math.round(x / 2), Math.round(y / 2), 5); return h > 0.88 ? 1.6 : h < 0.12 ? -0.5 : 0; } });
  m.fill((x, y, z) => { const q = Math.hypot(x - c, y - c); if (q > r) return -1; if (q > r - 4) return z < 6 ? rim : -1; if (z < 5) return q > r - 6 ? tile : -1; return z < 6 ? wat : -1; }, 0, 0, 0, D, D, 6);
  for (let k = 0; k <= 10; k++) { const a = -0.9 + k * 0.08, x = c + Math.cos(a) * (r - 2), y = c + Math.sin(a) * (r - 2); m.box(x, y, 6 + (k === 0 || k === 10 ? 0 : 14), x + 1, y + 1, 21, rail); }
  return m;
}
// a springboard on its pedestal at the deep end (the board out along +x over the water), a ladder behind
export function divingBoard(len = 56) {
  const m = new Vox(len + 18, 16, 30);
  const conc = m.mat({ ramp: R('#d8d4cc'), k: 3 }), board = m.mat({ ramp: R('#e8f0f4'), k: 4, shade: (x) => (Math.round(x) % 7 === 0 ? -0.3 : 0) }), grip = m.mat({ ramp: R('#2a6ab0'), k: 3 }), rail = m.mat({ ramp: MAT.metal, k: 3 });
  m.box(4, 3, 0, 18, 13, 12, conc);                                       // the pedestal
  m.box(14, 4, 12, len + 16, 12, 14, board); m.box(14, 5, 14, len + 14, 11, 15, grip);   // the board and its grip mat
  m.box(16, 5, 6, 22, 11, 12, rail);                                       // the fulcrum
  for (const y of [3, 12]) { m.box(0, y, 0, 1, y + 1, 26, rail); m.box(6, y, 12, 7, y + 1, 26, rail); m.box(0, y, 25, 7, y + 1, 26, rail); }
  for (let z = 3; z < 12; z += 3) m.box(0, 3, z, 1, 13, z + 1, rail);      // the ladder's rungs
  return m;
}
// a lane rope floating on the water: floats along +x, red near the ends, blue and white between
export function laneRope(len = 400) {
  const m = new Vox(len, 4, 3);
  const red = m.mat({ ramp: R('#d8342e'), k: 3, flag: F_NOCAST }), blue = m.mat({ ramp: R('#2a5ab8'), k: 3, flag: F_NOCAST }), white = m.mat({ ramp: R('#f2f2ee'), k: 3, flag: F_NOCAST });
  for (let x = 0; x < len; x += 4) { const end = x < 48 || x > len - 48, k = Math.floor(x / 4); m.box(x, 0, 0, x + 4, 4, 3, end ? red : k % 4 < 2 ? white : blue); }
  return m;
}
