// Decorating your home (H67; the owner: "more of the owning a house features"; the HO4 concept, "Decorate home - make it
// yours"): the pieces of furniture you buy at the hardware store's counter and place in your own home, turned the way
// you like, and each room's walls and floor from a few choices. A home's plan (shared/homelayout.js layout) stays as it
// is; `decorate` lays a home's own things over it - a layout of the same shape whose pieces include yours and whose
// solid() counts them - so the server walks you round it (server/systems/homeinside.js) and the page predicts and draws
// it (client/render/homeview.js, homeart2.js) from the same function.
//
// A home's decor (kept in its owner's profile: profile.decor[home id]; the pieces bought and not placed: profile.furn):
//   { it: [{ k, tx, ty, r }]  the placed pieces: kind (DECOR.price's keys), the top-left tile, facing (0 S, 1 W, 2 N, 3 E)
//     wall: { room: colour }  a room's walls painted (WALLS' index), floor: { room: floor } (FLOORS' index) }
// The rooms are the plan's open tiles flooded between the walls (a doorway joins none) - numbered in reading order, as
// client/render/homeart2.js numbers them.
// The server keeps every thing you can use within reach and the doors clear: canPlace refuses a piece that would cut
// off any spot you could walk to before, or every spot within reach of the bed, the safe, the front door...
import { TILE_IN, BODY_IN, carRects } from './homelayout.js';
import { HOME_IN, DECOR } from './rules.js';

// the pieces: name, footprint in tiles (w x h before turning), the shop's aisle; flat: on the floor (walked over, the
// furniture stands on it); wall: hung on the wall behind it (walked under); ch: the letter it's drawn as (the plan's own
// letters where a plan has the same thing - the drawing's the same)
export const PIECES = {
  couch: { name: 'Sofa', w: 2, h: 1, cat: 'Seating', ch: 'C' },
  armchair: { name: 'Armchair', w: 1, h: 1, cat: 'Seating', ch: 'O' },
  table: { name: 'Dining table', w: 2, h: 2, cat: 'Tables', ch: 'T' },
  bedside: { name: 'Bedside table', w: 1, h: 1, cat: 'Bedroom', ch: 'b' },
  lamp: { name: 'Floor lamp', w: 1, h: 1, cat: 'Lighting', ch: 'l' },
  bookshelf: { name: 'Bookshelf', w: 1, h: 1, cat: 'Storage', ch: 'Q' },
  plant: { name: 'Potted plant', w: 1, h: 1, cat: 'Decor', ch: 'P' },
  tv: { name: 'TV on a stand', w: 1, h: 1, cat: 'Living', ch: 'V' },
  walltv: { name: 'Wall TV', w: 1, h: 1, cat: 'Living', ch: 'v', wall: 1 },
  art: { name: 'Painting', w: 1, h: 1, cat: 'Decor', ch: 'a', wall: 1 },
  rug: { name: 'Rug', w: 2, h: 2, cat: 'Decor', ch: 'r', flat: 1 },
  washer: { name: 'Washing machine', w: 1, h: 1, cat: 'Utility', ch: 'w' },
  workbench: { name: 'Workbench', w: 2, h: 1, cat: 'Garage', ch: 'k' },
};
export const KINDS = Object.keys(PIECES);
export const priceOf = (k) => (DECOR.price[k] || 0);
export const backOf = (k) => Math.round(priceOf(k) * DECOR.sellBack);
// the walls' colours and the floors (a floor: the plan's letter for it and the look's tier - homeart2.js floorPx)
export const WALLS = [['Cream', '#d8c8a0'], ['Sage', '#9ab08e'], ['Sky blue', '#8aa8c4'], ['Rose', '#c8949a'], ['Slate', '#5a6474'], ['Ochre', '#c89a4a']];
export const FLOORS = [['Oak planks', '.', 2], ['Pale planks', '.', 3], ['Dark planks', '.', 1], ['Tiles', 't', 1], ['Marble', 't', 3], ['Carpet', 'c', 1], ['Plum carpet', 'c', 3]];
export const FACE = ['s', 'w', 'n', 'e'];
const FACE_NAME = ['south', 'west', 'north', 'east'];
export const faceName = (r) => FACE_NAME[r & 3];

const WALLISH = new Set(['#', '=', 'D', 'R', 'U', 'E']);
const PLACEABLE = new Set(['.', 'c', 't', 'g']);

// a piece's footprint, turned (an odd turn swaps it)
export function dims(k, r) { const P = PIECES[k]; return P ? (r & 1 ? [P.h, P.w] : [P.w, P.h]) : [1, 1]; }

// the rooms of a plan (cached on it): id per tile (-1 a wall or a doorway), n rooms
export function roomsOf(L) {
  if (L.base) L = L.base;
  if (L._rooms) return L._rooms;
  const C = L.cols, R = L.rows, id = new Int16Array(C * R).fill(-1);
  let n = 0;
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    const ch = L.cell(x, y);
    if (WALLISH.has(ch) || ch === '+' || id[y * C + x] >= 0) continue;
    const q = [[x, y]]; id[y * C + x] = n;
    while (q.length) {
      const [cx, cy] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, c2 = L.cell(nx, ny);
        if (nx < 0 || ny < 0 || nx >= C || ny >= R || WALLISH.has(c2) || c2 === '+' || id[ny * C + nx] >= 0) continue;
        id[ny * C + nx] = n; q.push([nx, ny]);
      }
    }
    n++;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= C || y >= R ? -1 : id[y * C + x]);
  L._rooms = { id, n, at };
  return L._rooms;
}

// The plan with a home's decor laid over it (null / empty decor: the plan itself). Kept per decor object: the server
// replaces a home's decor object when anything changes, so a new one is a new layout (and the page's drawing is remade).
const made = new WeakMap();
export function decorate(L, d) {
  if (!d || (!(d.it && d.it.length) && !d.wall && !d.floor)) return L;
  const m = made.get(d);
  if (m && m.base === L) return m;
  const C = L.cols, occ = new Uint8Array(C * L.rows), mine = [];
  (d.it || []).forEach((q, i) => {
    const P = PIECES[q.k];
    if (!P) return;
    const [w, h] = dims(q.k, q.r), r = q.r & 3;
    const p = { ch: P.ch, use: null, tx: q.tx, ty: q.ty, tw: w, th: h, x: q.tx * TILE_IN, y: q.ty * TILE_IN, w: w * TILE_IN, h: h * TILE_IN, dec: i, k: q.k, r, face: FACE[r], flat: !!P.flat, wall: !!P.wall };
    mine.push(p);
    if (!P.flat && !P.wall) for (let j = 0; j < h; j++) for (let ii = 0; ii < w; ii++) { const x = q.tx + ii, y = q.ty + j; if (x >= 0 && y >= 0 && x < C && y < L.rows) occ[y * C + x] = 1; }
  });
  const rooms = roomsOf(L), wall = d.wall || {}, floor = d.floor || {};
  const D = {
    ...L, base: L, decor: d,
    pieces: [...mine.filter((p) => p.flat), ...L.pieces, ...mine.filter((p) => !p.flat)],   // (the rugs under everything)
    solid: (tx, ty) => L.solid(tx, ty) || (tx >= 0 && ty >= 0 && tx < C && ty < L.rows && occ[ty * C + tx] === 1),
    // the colour a room's walls are painted (null: as built) - the room in front of (south of) the wall at tx, ty
    paintAt: (tx, ty) => { let ri = rooms.at(tx, ty + 1); if (ri < 0) ri = rooms.at(tx, ty + 2); const c = ri >= 0 ? wall[ri] : undefined; return c != null && WALLS[c] ? WALLS[c][1] : null; },
    // the floor laid in the room at tx, ty (null: as built): [name, letter, tier]
    floorAt: (tx, ty) => { const ri = rooms.at(tx, ty); const f = ri >= 0 ? floor[ri] : undefined; return f != null && FLOORS[f] ? FLOORS[f] : null; },
  };
  made.set(d, D);
  return D;
}

// The tile in front of you (x, y px, facing a) and a piece of kind k turned r put down there: { tx, ty, w, h } - it
// reaches away from you along the way you face
export function targetOf(L, x, y, a, k, r) {
  const fx = Math.cos(a), fy = Math.sin(a), ew = Math.abs(fx) >= Math.abs(fy);
  const dx = ew ? Math.sign(fx) : 0, dy = ew ? 0 : Math.sign(fy);
  const ttx = Math.floor((x + dx * (BODY_IN + TILE_IN / 2 + 2)) / TILE_IN), tty = Math.floor((y + dy * (BODY_IN + TILE_IN / 2 + 2)) / TILE_IN);
  const [w, h] = k ? dims(k, r) : [1, 1];
  return { tx: dx < 0 ? ttx - (w - 1) : ttx, ty: dy < 0 ? tty - (h - 1) : tty, w, h, dx, dy };
}
// the way a piece put down in front of you faces at first: toward you
export function facingYou(a) {
  const fx = Math.cos(a), fy = Math.sin(a);
  return Math.abs(fx) >= Math.abs(fy) ? (fx > 0 ? 1 : 3) : (fy > 0 ? 2 : 0);
}
// the placed piece (its index in d.it) covering tile tx, ty - a standing one first, then one on the wall, then a rug
export function pieceAt(d, tx, ty) {
  const it = (d && d.it) || [];
  let best = -1, bs = -1;
  it.forEach((q, i) => {
    const P = PIECES[q.k]; if (!P) return;
    const [w, h] = dims(q.k, q.r);
    if (tx < q.tx || ty < q.ty || tx >= q.tx + w || ty >= q.ty + h) return;
    const s = P.flat ? 0 : P.wall ? 1 : 2;
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}

// the tiles you can walk to from just inside the front door (4-way: a body fits a tile's width), the parked cars' bays
// counted as taken
function reachable(L) {
  const C = L.cols, R = L.rows, seen = new Uint8Array(C * R), cars = carRects(L, L.bays.length);
  const free = (x, y) => {
    if (x < 0 || y < 0 || x >= C || y >= R || L.solid(x, y)) return false;
    const cx = (x + 0.5) * TILE_IN, cy = (y + 0.5) * TILE_IN;
    return !cars.some((c) => cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h);
  };
  const sx = Math.floor(L.spawn.x / TILE_IN), sy = Math.floor(L.spawn.y / TILE_IN);
  if (!free(sx, sy)) return seen;
  const q = [[sx, sy]]; seen[sy * C + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (free(nx, ny) && !seen[ny * C + nx]) { seen[ny * C + nx] = 1; q.push([nx, ny]); } }
  }
  return seen;
}
// is some walkable tile's middle within reach of the rect (the bed, the safe... the front door)?
function inReach(L, seen, rx, ry, rw, rh) {
  const C = L.cols;
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < C; x++) {
    if (!seen[y * C + x]) continue;
    const cx = (x + 0.5) * TILE_IN, cy = (y + 0.5) * TILE_IN;
    if (Math.hypot(Math.max(rx - cx, 0, cx - rx - rw), Math.max(ry - cy, 0, cy - ry - rh)) <= HOME_IN.reach + 2) return true;
  }
  return false;
}

// Can piece q ({ k, tx, ty, r }) go where it says, in the plan L (as built) with decor d - leaving out d.it[skip] (the
// piece being moved or turned)? bodies: [{ x, y }] the people in there (it can't land on anyone). null: yes; else why not.
export function canPlace(L, d, q, skip = -1, bodies = []) {
  const P = PIECES[q.k];
  if (!P) return 'No such piece.';
  const [w, h] = dims(q.k, q.r), r = q.r & 3;
  const it = ((d && d.it) || []).filter((_, i) => i !== skip);
  if (it.length >= DECOR.max) return `That's as much as this place takes (${DECOR.max} pieces).`;
  const cars = carRects(L, L.bays.length), sx = Math.floor(L.spawn.x / TILE_IN), sy = Math.floor(L.spawn.y / TILE_IN);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = q.tx + i, y = q.ty + j, ch = L.cell(x, y);
    if (ch === '+') return 'Not in a doorway.';
    if (!PLACEABLE.has(ch)) return WALLISH.has(ch) ? 'There\'s a wall there.' : 'Something\'s already there.';
    if (P.flat || P.wall) continue;
    if (x === sx && y === sy) return 'Keep the way in from the front door clear.';
    const cx = (x + 0.5) * TILE_IN, cy = (y + 0.5) * TILE_IN;
    if (cars.some((c) => cx > c.x - TILE_IN / 2 && cx < c.x + c.w + TILE_IN / 2 && cy > c.y && cy < c.y + c.h)) return 'That\'s where a car parks.';
  }
  const overlaps = (o) => { const [ow, oh] = dims(o.k, o.r); return q.tx < o.tx + ow && o.tx < q.tx + w && q.ty < o.ty + oh && o.ty < q.ty + h; };
  if (P.wall) {   // hung on the wall behind it: a plain wall (not a window or a door), facing into the room - not the cut front walls
    if (r === 2) return 'Hang it on the back wall or a side wall.';
    const bx = q.tx + (r === 1 ? 1 : r === 3 ? -1 : 0), by = q.ty + (r === 0 ? -1 : 0);
    if (L.cell(bx, by) !== '#') return L.cell(bx, by) === '=' ? 'Not over a window.' : 'It needs a wall behind it - turn it to face away from the wall.';
    if (it.some((o) => PIECES[o.k] && PIECES[o.k].wall && overlaps(o))) return 'Something already hangs there.';
    return null;
  }
  if (P.flat) return it.some((o) => PIECES[o.k] && PIECES[o.k].flat && overlaps(o)) ? 'There\'s a rug there already.' : null;
  if (it.some((o) => PIECES[o.k] && !PIECES[o.k].flat && !PIECES[o.k].wall && overlaps(o))) return 'Something\'s already there.';
  const rx = q.tx * TILE_IN, ry = q.ty * TILE_IN, rw = w * TILE_IN, rh = h * TILE_IN;
  for (const b of bodies) if (b.x + BODY_IN > rx && b.x - BODY_IN < rx + rw && b.y + BODY_IN > ry && b.y - BODY_IN < ry + rh) return 'Someone\'s standing there.';
  // nothing cut off: every spot you could walk to before you still can (but under the piece), and everything you use is
  // still within reach, the front door too
  const before = decorate(L, { it }), after = decorate(L, { it: [...it, q] });
  const s0 = reachable(before), s1 = reachable(after), C = L.cols;
  if (L.door && !inReach(after, s1, L.door.x - TILE_IN / 2, L.door.y - TILE_IN / 2, TILE_IN, TILE_IN)) return 'That would block the front door.';
  for (const p of L.pieces) if (p.use && inReach(before, s0, p.x, p.y, p.w, p.h) && !inReach(after, s1, p.x, p.y, p.w, p.h)) return `That would block the ${p.use === 'hall' ? 'hall table' : p.use === 'garage' ? 'garage\'s key board' : p.use}.`;
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < C; x++) {
    if (!s0[y * C + x] || s1[y * C + x]) continue;
    if (x >= q.tx && x < q.tx + w && y >= q.ty && y < q.ty + h) continue;
    return 'That would block the way through.';
  }
  return null;
}
