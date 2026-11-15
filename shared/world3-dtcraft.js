// Downtown's craft pass (2026-11-15; the owner, 11-14 20:28: "Big open spaces ... are way too big and open and the lights
// don't act like lanterns, they just look like random lights strung around ... every place beautifully crafted ... alive
// with interesting things and details and NPCs and decorations ... the designs and placements of things should be
// intentional"). The city's arrival round Greenfield Park, after the concepts: D1 (the food trucks and their queues, the
// fountain with its benches, the bus stop with someone waiting), SK6 (the plaza's planters and seats), SC2-A / SC4-A (the
// bank's steps, its guard, the bollards along its kerb, the armored van loading), SC2-B (the jeweller's corner: bollards,
// the hydrant, the bin and news box, its back alley with the dumpsters and the skylight on its roof), SC2-C (the police
// headquarters' flags and bollards), CR2 (the hotel's doormen, planters and banner lamps), WC083 (the pond's lamp-lit
// paths, the benches facing the water, the boathouse's rowing boats, people at the water's edge), S1-A / I1-A (the
// corners' hydrants, bins and news boxes). Called from shared/world3-downtown.js; nothing here adds a building, a place
// or a home (no number in those lists moves) - only ground, props, parked vehicles and the places' people
// (m.tableaus: server/systems/activities.js 'tableau').
// Deterministic: positions from the plan's constants and the kit's hash draws; nothing at load.
import { TILE, T } from './constants.js';

const px = (v) => Math.round(v * TILE);
export const tableau = (m, o) => (m.tableaus ||= []).push({ ...o, x: px(o.x), y: px(o.y), ...(o.x2 !== undefined ? { x2: px(o.x2), y2: px(o.y2) } : {}), ...(o.x3 !== undefined ? { x3: px(o.x3), y3: px(o.y3) } : {}) });
// a string of lights: a real catenary between two anchors - a post ('pole') or a bracket on a wall ('wall') at each end
export const string = (K, ax, ay, bx, by, h = 66, ends = ['pole', 'pole'], k = null) => K.prop('festoon', ax, ay, 0, { tx: px(bx - ax), ty: px(by - ay), h, ends, ...(k ? { k } : {}) });
// the seats either side of each cafe table (west of it facing east, east of it facing west), in px
export const seatsAt = (tables) => tables.flatMap(([x, y]) => [[px(x - 0.47), px(y + 0.05), 0], [px(x + 0.47), px(y + 0.05), Math.PI]]);
// a bench's heading for the way its sitters look (shared prop convention: they face p.a + PI/2)
export const benchA = (face) => face - Math.PI / 2;
const S = Math.PI / 2, N = -Math.PI / 2, E = 0, Wd = Math.PI;

// open paving (or a lot) the plan laid, clear of a subway stop's plaza (its kiosk and stairs)
function opener(m) {
  const sub = (x, y, r) => (m.subwayPlazas || []).some((q) => x >= q.x - r && x < q.x + q.w + r && y >= q.y - r && y < q.y + q.h + r);
  return (x, y, r = 1) => { const tx = Math.floor(x), ty = Math.floor(y); if (!m.inside(tx, ty)) return false; const t = m.tiles[m.idx(tx, ty)]; return (t === T.PLAZA || t === T.LOT || t === T.SIDEWALK) && !sub(x, y, r); };
}

// ---- the food-truck plaza (Station Plaza: D1, SK6) ------------------------------------------------------------------
// [x0, x1) x [y0, y1]: the Greenfield Park subway stop's plaza between Pinnacle House and Larkspur Tower, Crosstown
// Avenue to 6th Street. Three parts, north to south: the trucks' bay off the avenue (the ice cream van on its asphalt,
// the hot dog carts beside it, a queue at each window), the fountain with its benches and planters in the middle, the
// tables under umbrellas either side of a walk down to 6th Street and the stop's kiosk - strings of lights across them
// from post to post. Trees in grates at the corners, bins, bollards along the avenue.
export function foodTruckPlaza(K, m, x0, y0, x1, y1, out) {
  const { prop, rnd, pick } = K, open = opener(m), cx = (x0 + x1) / 2;
  const put = (t, x, y, solid = 0, extra = null) => (open(x, y) ? (prop(t, x, y, solid, extra), true) : false);
  // the trucks' bay: asphalt off the avenue's pavement, the van parked on it; the carts beside it, their umbrellas up
  const bx0 = x0 + 2, bx1 = bx0 + 8, by = y0 + 1;
  K.paint(bx0, by, bx1 - bx0, 4, T.LOT);
  m.parking.push({ x: px(bx0 + 4), y: px(by + 1.9), a: E, model: 'icecream' });
  tableau(m, { v: 'queue', x: bx0 + 4.3, y: by + 3.9, a: N });
  // (each cart's vendor behind it, facing the line - p.staffed: no other vendor comes to it, server/systems/personas.js)
  const carts = [cx - 0.5, cx + 4.5, cx + 9];
  for (const [k, x] of carts.entries()) {
    prop('foodcart', x, by + 2.4, 14, { staffed: 1 });
    tableau(m, { v: 'staff', look: 'vendor', x, y: by + 1.55, a: S });
    tableau(m, { v: 'queue', x: x + 0.1, y: by + 3.7 + (k % 2) * 0.3, a: N });
  }
  put('trashcan', bx1 + 0.8, by + 3.6); put('trashcan', x1 - 1.4, by + 4.6);
  for (let x = bx1 + 1.2; x < x1 - 1; x += 1.7) put('bollard', x, y0 + 0.35, 4);   // (along the avenue: the bay's mouth left open)
  // the fountain in the middle: four benches facing it, flower planters on the diagonals, trees in grates at the
  // corners and a bench with its back to each tower
  const fy = y0 + 13;
  prop('fountain', cx, fy, 36);
  for (const [dx, dy, face] of [[0, -3.6, S], [0, 3.6, N], [-4.4, 0, E], [4.4, 0, Wd]]) prop('bench_m', cx + dx, fy + dy, 0, { a: benchA(face) });
  for (const [dx, dy] of [[-3.4, -2.8], [3.4, -2.8], [-3.4, 2.8], [3.4, 2.8]]) prop('planter_fl', cx + dx, fy + dy, 8);
  for (const [x, y] of [[x0 + 2.2, fy - 4.5], [x1 - 2.2, fy - 4.5], [x0 + 2.2, fy + 4.5], [x1 - 2.2, fy + 4.5]]) prop('tree_a', x, y, 10, { sp: pick(['streetPl', 'magnolia'], rnd(Math.floor(x), Math.floor(y), 41)), k: 1.1, grate: true });
  prop('bench_m', x0 + 1.3, fy, 0, { a: benchA(E) }); prop('bench_m', x1 - 1.3, fy, 0, { a: benchA(Wd) });
  for (const x of [x0 + 0.8, x1 - 0.8]) for (const dy of [-2.3, 2.3]) put('lamp', x, fy + dy);   // (the square's lamps, either side of each bench)
  tableau(m, { v: 'chat', x: cx + 6.5, y: fy + 2.2 });
  // the tables: two blocks either side of the walk down the middle, strings of lights across each block between the rows
  const ty = [y0 + 23, y0 + 28], cols = [[x0 + 4, x0 + 8.3], [x1 - 8.3, x1 - 4]];
  for (const [b, xs] of cols.entries()) {
    const tables = [];
    for (const y of ty) for (const x of xs) if (open(x, y, 2) && open(x - 1, y) && open(x + 1, y)) { prop('cafetable', x, y, 0); prop(b ? (tables.length % 2 ? 'umbrella_y' : 'umbrella_r') : (tables.length % 2 ? 'umbrella_g' : 'umbrella_b'), x, y - 0.1, 0); tables.push([x, y]); }
    if (tables.length) tableau(m, { v: 'sit', x: (xs[0] + xs[1]) / 2, y: ty[0] + 2.5, seats: seatsAt(tables) });
    const wx = b ? x1 - 0.7 : x0 + 0.7, ax = b ? cx + 2 : cx - 2;
    for (const y of [ty[0] - 2, ty[0] + 2.5, ty[1] + 2.2]) if (open(wx, y, 2) && open(ax, y, 2)) string(K, wx, y, ax, y, 70);
  }
  put('trashcan', cx - 2.4, ty[0] - 2.6); put('trashcan', cx + 2.4, ty[0] - 2.6);
  for (const x of [x0 + 0.8, x1 - 0.8]) put('planter_g', x, ty[1] + 4.6, 8);
  (out.places ||= []).push({ name: 'Station Plaza', x0, y0, x1, y1 });
}

// ---- Greenfield Park's lights (WC083: the lamp-lit curving paths, the benches facing the water) ------------------------
// The lamps stand along the paths at a rhythm - one every GAP tiles of path, on the grass at its edge - with the benches
// between them across the path, a bin by every other one; flower beds between the lamps now and then. Along the pond's
// ring (its outer edge for the lamps, the water's side for the benches, turned to the water), the loop inside the railings
// (the lamps outside it, the benches inside it turned to it), the ways in from the gates (either side by turns), and a
// lamp at each corner of the footbridges. P: { at, inPark, dist (tile index -> tiles from the water), isle, rr (the loop's
// signed distance), ways [{ pts, wd }], bridges [{ lo, hi, y }], keepOut [[x0, y0, x1, y1]] }; returns the tiles taken
// (the trees keep off them).
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
// ordered runs along a one-tile-wide line of tiles (a contour): each run walked out from its first tile both ways
function chains(list) {
  const left = new Map(list.map((q) => [q[1] * 65536 + q[0], q])), out = [];
  const step = (c) => { for (const [dx, dy] of NB) { const k = (c[1] + dy) * 65536 + c[0] + dx; const q = left.get(k); if (q) { left.delete(k); return q; } } return null; };
  for (const [k0, q0] of left) {
    if (!left.has(k0)) continue;
    left.delete(k0);
    const fwd = [q0], back = [];
    for (let c = q0, q; (q = step(c)); c = q) fwd.push(q);
    for (let c = q0, q; (q = step(c)); c = q) back.push(q);
    out.push(back.reverse().concat(fwd));
  }
  return out;
}
// every `gap` tiles along a run (from `off`): fn(tile, k)
function every(run, gap, off, fn) {
  let s = 0, next = off, k = 0;
  for (let i = 0; i < run.length; i++) {
    if (i) s += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
    if (s >= next) { fn(run[i], k++, i); next += gap; }
  }
}
export function parkLights(K, m, P) {
  const { prop } = K, busy = new Set(), key = (x, y) => y * 65536 + x;
  const free = (x, y, r = 1) => { if (P.at(x, y) !== T.GRASS || !P.inPark(x, y) || P.isle.has(m.idx(x, y))) return false; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (busy.has(key(x + dx, y + dy))) return false; return !P.keepOut.some(([a, b, c, d]) => x >= a && y >= b && x < c && y < d); };
  const take = (x, y) => busy.add(key(x, y));
  const lamp = (x, y) => { if (!free(x, y, 2)) return false; prop('lamp', x + 0.5, y + 0.5, 0); take(x, y); return true; };
  const bench = (x, y, face, bin) => {
    if (!free(x, y, 1)) return;
    prop('bench_m', x + 0.5, y + 0.5, 0, { a: benchA(face) }); take(x, y);
    if (bin) { const s = Math.abs(Math.cos(face)) > 0.5 ? [0, 1] : [1, 0]; for (const k of [1, -1]) if (free(x + s[0] * k * 2, y + s[1] * k * 2, 0)) { prop('trashcan', x + s[0] * k * 1.4 + 0.5, y + s[1] * k * 1.4 + 0.5, 0); take(x + s[0] * k * 2, y + s[1] * k * 2); break; } }
  };
  // the pond's ring: its outer edge (7 tiles from the water) and the water's side (3)
  const ring = (d) => { const L = []; for (const [i, v] of P.dist) if (v === d) { const x = i % m.w, y = (i - x) / m.w; if (P.inPark(x, y) && !P.isle.has(i)) L.push([x, y]); } L.sort((a, b) => a[1] - b[1] || a[0] - b[0]); return chains(L); };
  // (the way to the water from a tile on the water's side: its neighbour nearest the water, square to the path)
  const toWater = (x, y) => { let best = null, bd = 99; for (const [dx, dy] of NB.slice(0, 4)) { const v = P.dist.get(m.idx(x + dx, y + dy)); if (v !== undefined && v < bd) { bd = v; best = Math.atan2(dy, dx); } } return best ?? S; };
  for (const run of ring(7)) every(run, 11, 3, ([x, y], k, i) => {
    lamp(x, y) || lamp(x + 1, y) || lamp(x, y + 1);
    const q = k % 2 ? run[i + 5] : null;   // (a flower bed half way to the next lamp, every other gap)
    if (q && free(q[0], q[1], 1)) { prop('flowers_big', q[0] + 0.5, q[1] + 0.5, 0); take(q[0], q[1]); }
  });
  for (const run of ring(3)) every(run, 11, 8.5, ([x, y], k) => bench(x, y, toWater(x, y), k % 2 === 0));
  // the loop inside the railings: lamps on its outer edge, benches on its inner edge turned to it
  const loopEdge = (lo, hi) => { const L = []; for (let y = P.y0; y < P.y1; y++) for (let x = P.x0; x < P.x1; x++) { const d = P.rr(x, y); if (d > lo && d <= hi) L.push([x, y]); } return chains(L); };
  for (const run of loopEdge(1.5, 2.5)) every(run, 12, 4, ([x, y]) => { lamp(x, y); });
  for (const run of loopEdge(-2.5, -1.5)) every(run, 12, 10, ([x, y], k) => { const g = Math.atan2(P.rr(x, y + 1) - P.rr(x, y - 1), P.rr(x + 1, y) - P.rr(x - 1, y)); bench(x, y, g, k % 2 === 0); });
  // the ways in from the gates: a lamp every 10 tiles, either side by turns
  for (const { pts, wd } of P.ways) {
    let s = 0, next = 5, side = 1;
    for (let j = 1; j < pts.length; j++) {
      const [ax, ay] = pts[j - 1], [bx, by] = pts[j], L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L, ny = (bx - ax) / L;
      while (next <= s + L) { const u = (next - s) / L, o = wd / 2 + 1; lamp(Math.floor(ax + (bx - ax) * u + nx * o * side), Math.floor(ay + (by - ay) * u + ny * o * side)); side = -side; next += 10; }
      s += L;
    }
  }
  // the footbridges: a lamp at each corner, on the bank (WC083)
  for (const { lo, hi, y } of P.bridges) for (const [x, yy] of [[lo - 1, y - 1], [lo - 1, y + 2], [hi + 1, y - 1], [hi + 1, y + 2]]) {
    const t = P.at(x, yy);
    if ((t === T.GRASS || t === T.PLAZA) && !busy.has(key(x, yy))) { prop('lamp', x + 0.5, yy + 0.5, 0); take(x, yy); }
  }
  return busy;
}

// ---- the rest of Downtown, once its blocks and streets are laid (shared/world3-downtown.js build, last) ----------------
// D: the plan's street lines and pavements { DX, DY, EXT, ext(name) }
export function craftDowntown(K, m, D, out) {
  const { prop, rnd, pick } = K, open = opener(m), [X0, Y0, X1, Y1] = [2860, 2300, 3480, 2730];
  // what already stands here (the generator's kerb lamps and hydrants, the plan's trees and benches), by tile: the
  // furniture below keeps a step off it
  const near = new Map(), cell = (x, y) => Math.floor(y) * 65536 + Math.floor(x);
  const note = (x, y) => near.set(cell(x, y), 1);
  for (const p of m.props) { const x = p.x / TILE, y = p.y / TILE; if (x >= X0 && y >= Y0 && x < X1 && y < Y1) note(x, y); }
  const clear = (x, y, r = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (near.has(cell(x + dx, y + dy))) return false; return true; };
  const put = (t, x, y, solid = 0, extra = null, r = 1) => { if (!open(x, y, 0) || !clear(x, y, r)) return false; prop(t, x, y, solid, extra); note(x, y); return true; };
  const B = (name) => m.buildings.find((b) => b && b.hand && b.name === name && b.tx >= X0 && b.tx < X1);
  const doorOf = (b) => (b && b.door ? [b.door.tx + 0.5, b.door.ty] : null);
  // a row of bollards along a kerb (y), x0 to x1, a gap at each tree, lamp or hydrant already there
  const bollards = (x0, x1, y, step = 2) => { for (let x = x0; x <= x1; x += step) put('bollard', x, y, 4, null, 0); };

  // ---- the Grand Neon Hotel's drop-off (WC356, CR2, HO5's doorman): two doormen at the door, potted palms either side,
  // the hotel's flags along its front, banner lamps round the drive, guests waiting with their bags for a cab
  const hotel = B('Grand Neon Hotel'), hd = doorOf(hotel);
  if (hd) {
    const [dx, dy] = hd;
    tableau(m, { v: 'staff', look: 'valet', x: dx - 1.4, y: dy + 0.7, x2: dx + 1.6, y2: dy + 0.7, a: S });
    for (const s of [-1, 1]) put('potted', dx + s * 2.6, dy + 0.45, 0, null, 0);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) put('flagpole', hotel.tx + hotel.tw / 2 + s * (hotel.tw / 2 - 6.5 - k * 2.6), dy + 0.8, 0, { h: 120, c: k === 1 ? 'stars' : '#7a1e2a' }, 0);
    tableau(m, { v: 'chat', x: dx - 4.6, y: dy + 1.1 });   // (guests with their bags, by the cab rank)
    // (the drive round the fountain: banner lamps along its outer kerb where there's paving to stand them on)
    const fx = hotel.tx + hotel.tw / 2, fy1 = (out.hotelDrive || [dy, dy + 30])[1], fy = (dy + fy1) / 2, ry = (fy1 - dy) / 2;
    for (let k = 0; k < 12; k++) { const t = (k + 0.5) * Math.PI / 6, x = fx + Math.cos(t) * 22 * 1.14, y = fy + Math.sin(t) * ry * 1.12; if (m.inside(Math.floor(x), Math.floor(y)) && m.tiles[m.idx(Math.floor(x), Math.floor(y))] === T.PLAZA) put('bannerpole', x, y, 0, { v: k % 2 }, 1); }
  }

  // ---- First Pixel Bank (SC2-A, SC4-A): the guard at its door, planters by it, iron lamps and a row of bollards along
  // the kerb, a bus shelter with someone waiting; in the van bay the crew carrying the cash boxes from the armored vans'
  // backs to the bank's side
  const bank = B('First Pixel Bank'), bd = doorOf(bank);
  if (bd) {
    const [dx, dy] = bd, kerb = dy + 2.55, rn1 = bank.ty + bank.th - 1;
    tableau(m, { v: 'guards', x: dx + 1.5, y: dy + 0.65, a: S });
    for (const s of [-1, 1]) put('planter_g', dx + s * 3, dy + 0.5, 8, null, 0);
    for (const x of [bank.tx + 2.5, bank.tx + bank.tw - 2.5]) put('lamp', x, dy + 0.55, 0, { style: 'cast' }, 1);
    const sx = bank.tx + 5.5;
    if (put('busstop', sx, dy + 1.1, 0, null, 1)) { tableau(m, { v: 'wait', x: sx, y: dy + 0.8, a: S }); for (let x = sx - 2; x <= sx + 2; x++) note(x, kerb); }
    bollards(bank.tx + 1, bank.tx + bank.tw - 1, kerb);
    const vx0 = bank.tx + bank.tw + 1;
    tableau(m, { v: 'guards', x: vx0 + 8.6, y: rn1 - 0.9, a: S, x2: vx0 + 5, y2: rn1 - 6.3, x3: vx0 + 1.2, y3: rn1 - 6.3 });
    put('handtruck', vx0 + 1.4, rn1 - 7.6, 0, null, 0); put('crates', vx0 + 1.2, rn1 - 4.6, 0, null, 0);
    bollards(vx0 + 0.6, vx0 + 2, kerb, 1.4); bollards(vx0 + 16, vx0 + 17.4, kerb, 1.4);
  }
  // ---- Brilliant & Co., the jeweller's corner (SC2-B, SC4-H): the lit skylight on its roof is its art's
  // (world3-downtown.js); bollards along its kerb, the bin and the news boxes by the corner, the hydrant on it; its back
  // alley behind it off the avenue (the dumpster, bags, crates, a lamp at the mouth)
  const jw = B('Brilliant & Co.'), jd = doorOf(jw);
  if (jd) {
    const [, dy] = jd, kerb = dy + 2.55, x0 = jw.tx, x1 = jw.tx + jw.tw;
    bollards(x0 + 1, x1 - 1, kerb);
    put('trashcan', x0 + 1.2, dy + 0.6, 0, null, 0); put('news_b', x0 + 2.4, dy + 0.6, 0, null, 0); put('news_a', x0 + 3.2, dy + 0.6, 0, null, 0);
    put('hydrant', x0 - 1.4, kerb - 0.2, 6, null, 0);
    if (out.alley) {
      const [ax0, ay0, ax1, ay1] = out.alley;
      put('dump_g', ax1 - 2.5, ay0 + 1.2, 14, null, 0); put('bags', ax1 - 4.3, ay0 + 1.3, 0, null, 0); put('crates', ax0 + 6, ay0 + 1.2, 0, null, 0);
      put('pallet', ax1 - 7, ay1 - 0.8, 0, null, 0); put('lamp', ax0 + 0.6, ay1 - 0.6, 0, { style: 'cast' }, 0);
    }
  }
  // ---- the police headquarters (SC2-C): the flags at its door, planters, bollards along Bayside Avenue's kerb
  const hq = B('Metro City PD - HQ'), qd = doorOf(hq);
  if (qd) {
    const [dx, dy] = qd;
    put('flagpole', dx - 3, dy + 0.7, 0, { h: 130, c: 'stars' }, 0); put('flagpole', dx + 3.5, dy + 0.7, 0, { h: 130, c: '#1e2a5e' }, 0);
    for (const s of [-1, 1]) put('planter_sq', dx + s * 5.5, dy + 0.5, 8, null, 0);
    bollards(hq.tx + 1, hq.tx + hq.tw - 1, dy + 3.4, 2.2);
  }
  // ---- the corners: where two streets cross, a hydrant at one corner, news boxes at another, a bin, a mailbox now and
  // then (S1-A, I1-A, D1)
  const xs = [[D.DX.westside, D.EXT.ave], [D.DX.maple, D.EXT.st], [D.DX.parkW, D.EXT.ave], [D.DX.parkE, D.EXT.ave], [D.DX.civic, D.EXT.ave], [D.DX.walnut, D.EXT.st], [D.DX.harborview, D.EXT.ave]];
  const ys = [[D.DY.cross, D.EXT.ave], [D.DY.sixth, D.EXT.st], [D.DY.green, D.EXT.ave], [D.DY.s22, D.EXT.st], [D.DY.fountain, D.EXT.ave], [D.DY.s12, D.EXT.st], [D.DY.bayside, D.EXT.ave]];
  for (const [x, ex0] of xs) for (const [y, ey0] of ys) {
    const ex = ex0 - 1.4, ey = ey0 - 1.4, r = (k) => rnd(x, y, 900 + k), c0 = Math.floor(r(0) * 4);
    for (let c = 0; c < 4; c++) {
      const sx = c & 1 ? 1 : -1, sy = c & 2 ? 1 : -1, cx = x + sx * ex, cy = y + sy * ey, k = (c - c0 + 4) % 4;
      if (m.tiles[m.idx(Math.floor(cx), Math.floor(cy))] !== T.SIDEWALK) continue;
      if (k === 0) put('hydrant', cx + sx * 2.4, cy, 6, null, 0);
      else if (k === 1 && r(1) < 0.75) { put('news_a', cx, cy + sy * 2.4, 0, null, 0); put(pick(['news_b', 'news_c'], r(2)), cx, cy + sy * 3.2, 0, null, 0); }
      else if (k === 2) put('trashcan', cx + sx * 0.4, cy + sy * 1.8, 0, null, 0);
      else if (r(3 + c) < 0.45) put(r(8) < 0.6 ? 'mailbox' : 'phonebox', cx + sx * 1.8, cy + sy * 0.4, 6, null, 0);
    }
  }
}
