// The inside of a home (H62; the owner, 2026-10-11: "going inside your own house would be great to get going"): a little
// level of its own, keyed by the home's kind and furnished by its price - not part of the map, so World v3 can move and
// reshape the homes (and the world's hash doesn't change). The server walks you round it (server/systems/homeinside.js),
// the page draws it (client/render/homeview.js); both read these plans.
//
// A plan is rows of tiles (TILE_IN px each, the world's own tile size, so you're your usual size in there):
//   # wall   = window   D the front door   R the garage's roller door (all solid)
//   . wood floor   c carpet   t tiles (kitchen, bathroom)   g the garage's concrete   + a doorway between rooms
//   furniture (solid; a run of the same letter is one piece): B bed  W wardrobe  S safe  F fridge  H shower  A hall
//   table  Y the garage's key board (those you can use) - K kitchen counter  T table  C couch  V TV  L toilet  N basin
//   O armchair  Q bookshelf  P plant
//   1 2 3: a plant in a home of that price tier or better (shared/homelayout.js tierOf), bare floor below it
export const TILE_IN = 32;
export const BODY_IN = 10;   // half the size of you, for the walls (px)

const PLANS = {
  // a single-wide trailer / shack: the kitchen and the living room in one, the bedroom with the shower in its corner
  trailer: [
    '#####==#####',
    '#KKF...#BBW#',
    '#......#BB.#',
    '#TT..1.+...#',
    '#......#..S#',
    '#A...CC#HL.#',
    '###D########',
  ],
  // an apartment: the living room and the kitchen, a bedroom, a bathroom off it
  apartment: [
    '#####==#######',
    '#KKKF1#WW...S#',
    '#.....#......#',
    '#TT...+..BB..#',
    '#TT...#..BB..#',
    '#.....##+#####',
    '#C...V#ttttLN#',
    '#C..A.#HHtttt#',
    '###D##########',
  ],
  // a house (farmhouses, cottages and beach houses too): the kitchen and the dining table, the living room, a hall to the
  // bedroom, the bathroom and the garage
  house: [
    '#####==####==#######',
    '#KKKF1#HHt#WWS#gggY#',
    '#.....#ttt+...#gggg#',
    '#TT...#LNt#.BB#gggg#',
    '#TT...#####.BB#gggg#',
    '#.....+.......+gggg#',
    '#C...V#..2....#gggg#',
    '#C...A#.......#gggg#',
    '###D###########RRRR#',
  ],
  // a mansion: the big kitchen and dining room, the great room, the master bedroom and its bathroom, a den, the garage
  mansion: [
    '##########==##########==######',
    '#KKKKF.1#HHtt#WWW...S#ggggggY#',
    '#.......#tttt+.......#ggggggg#',
    '#TTTT...#LNtt#..BBB..#ggggggg#',
    '#TTTT...######..BBB..#ggggggg#',
    '#.......+.....2......+ggggggg#',
    '#Q..........#.......Q#ggggggg#',
    '#OCCC..V....#.3...3..#ggggggg#',
    '#..A....2...+.......P#ggggggg#',
    '#####D################RRRRRR##',
  ],
  // (H65) an apartment block's units (server/systems/homes.js unitOf): the studio - one room and the bed in its corner,
  // the shower, the basin and the toilet along its far wall
  studio: [
    '#####==###',
    '#KKF.#BBW#',
    '#....#BB.#',
    '#TT..+...#',
    '#.1..#..S#',
    '#CA..#HLN#',
    '###D######',
  ],
  // the penthouse at the top of the building: the apartment's rooms and, through the bedroom, a second bedroom and a
  // den with the city out of its windows
  penthouse: [
    '#####==#######==####',
    '#KKKF1#WW...S#.BB.P#',
    '#.....#......#.BB..#',
    '#TT...+..BB..+.....#',
    '#TT...#..BB..#Q.2.W#',
    '#.....##+#####..3..#',
    '#C...V#ttttLN#O....#',
    '#C..A.#HHtttt#P...3#',
    '###D################',
  ],
};
export const PLAN_KEYS = Object.keys(PLANS);

const SOLID = new Set(['#', '=', 'D', 'R', ...'BWSFHAYKTCVLNOQP']);
const FLOORS = new Set(['.', 'c', 't', 'g', '+']);
export const USES = { B: 'bed', W: 'wardrobe', S: 'safe', F: 'fridge', H: 'shower', A: 'hall', Y: 'garage' };

// The plan for a home: its kind (a trailer, an apartment, a house, a mansion) and how well it's furnished (0 a shack's
// odds and ends .. 3 a mansion's)
export function planOf(home) {
  if (home && home.plan && PLANS[home.plan]) return home.plan;   // (an apartment block's unit: its own - H65)
  const k = home && home.kind;
  return k === 'shack' ? 'trailer' : k === 'apartment' ? 'apartment' : k === 'mansion' ? 'mansion' : 'house';
}
export function tierOf(home) {
  const p = (home && home.price) || 0;
  return p < 10000 ? 0 : p < 20000 ? 1 : p < 50000 ? 2 : 3;
}

const cache = new Map();
// The plan built: { key, tier, cols, rows, w, h, cell(tx, ty) -> char, solid(tx, ty), pieces [{ ch, use, x, y, w, h }]
// (px), door { x, y } (the front door's tile, px centre), spawn { x, y } (just inside it), garage bays [{ x, y }] }
export function layout(key, tier = 0) {
  const ck = key + ':' + tier;
  if (cache.has(ck)) return cache.get(ck);
  const rows0 = PLANS[key] || PLANS.house;
  const rows = rows0.map((r) => [...r].map((ch, x) => (ch >= '1' && ch <= '3' ? (tier >= +ch ? 'P' : (r[x - 1] && FLOORS.has(r[x - 1]) ? r[x - 1] : '.')) : ch)));
  const R = rows.length, C = Math.max(...rows.map((r) => r.length));
  const at = (tx, ty) => (ty >= 0 && ty < R && tx >= 0 && tx < C ? rows[ty][tx] || '#' : '#');
  const seen = new Set(), pieces = [];
  for (let ty = 0; ty < R; ty++) for (let tx = 0; tx < C; tx++) {
    const ch = at(tx, ty);
    if (!/[A-Z]/.test(ch) || ch === 'D' || ch === 'R' || seen.has(tx + ',' + ty)) continue;
    let w = 1, h = 1;
    while (at(tx + w, ty) === ch && !seen.has(tx + w + ',' + ty)) w++;
    while ([...Array(w).keys()].every((i) => at(tx + i, ty + h) === ch)) h++;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seen.add(tx + i + ',' + (ty + j));
    pieces.push({ ch, use: USES[ch] || null, tx, ty, tw: w, th: h, x: tx * TILE_IN, y: ty * TILE_IN, w: w * TILE_IN, h: h * TILE_IN });
  }
  let door = null, bays = [];
  for (let ty = 0; ty < R; ty++) for (let tx = 0; tx < C; tx++) {
    if (at(tx, ty) === 'D' && !door) door = { tx, ty, x: (tx + 0.5) * TILE_IN, y: (ty + 0.5) * TILE_IN };
    if (at(tx, ty) === 'R' && at(tx, ty - 1) === 'g' && tx % 2 === 1) bays.push({ x: (tx + 0.5) * TILE_IN, y: (ty - 2) * TILE_IN });
  }
  bays = bays.slice(0, 4);
  const L = {
    key, tier, cols: C, rows: R, w: C * TILE_IN, h: R * TILE_IN, grid: rows, pieces, door, bays,
    spawn: { x: door.x, y: door.y - TILE_IN },
    cell: at,
    solid: (tx, ty) => SOLID.has(at(tx, ty)),
  };
  cache.set(ck, L);
  return L;
}

// Does a body at (x, y) touch a wall or a piece of furniture?
export function blocked(L, x, y, r = BODY_IN) {
  const x0 = Math.floor((x - r) / TILE_IN), x1 = Math.floor((x + r - 0.001) / TILE_IN);
  const y0 = Math.floor((y - r) / TILE_IN), y1 = Math.floor((y + r - 0.001) / TILE_IN);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (L.solid(tx, ty)) return true;
  return false;
}

// One step of walking round the inside (the server's and the page's, the same): along the walls, never through them.
export function stepInside(L, s, mx, my, dt, speed) {
  let len = Math.hypot(mx, my);
  if (len < 0.15) return false;
  if (len > 1) { mx /= len; my /= len; len = 1; }
  const dx = mx * speed * dt, dy = my * speed * dt;
  const slide = (axis, d) => {
    const from = s[axis];
    s[axis] = from + d;
    if (!blocked(L, s.x, s.y)) return;
    let lo = 0, hi = 1;   // as far as it goes
    for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; s[axis] = from + d * m; if (blocked(L, s.x, s.y)) hi = m; else lo = m; }
    s[axis] = from + d * lo;
  };
  slide('x', dx); slide('y', dy);
  s.a = Math.atan2(my, mx);
  return true;
}

// The thing within reach of (x, y) - a piece of furniture you can use, or the front door - nearest first; null: none
export function useAt(L, x, y, reach) {
  let best = null, bd = Infinity;
  // (to its edge; a tie - between two things in a corner - goes to the one whose middle is nearer)
  const near = (rx, ry, rw, rh) => Math.hypot(Math.max(rx - x, 0, x - (rx + rw)), Math.max(ry - y, 0, y - (ry + rh))) + Math.hypot(rx + rw / 2 - x, ry + rh / 2 - y) * 0.01;
  for (const p of L.pieces) {
    if (!p.use) continue;
    const d = near(p.x, p.y, p.w, p.h);
    if (d <= reach + 2 && d < bd) { bd = d; best = p; }
  }
  const dd = near(L.door.x - TILE_IN / 2, L.door.y - TILE_IN / 2, TILE_IN, TILE_IN);
  if (dd <= reach + 2 && dd < bd) best = { use: 'door', x: L.door.x - TILE_IN / 2, y: L.door.y - TILE_IN / 2, w: TILE_IN, h: TILE_IN };
  return best;
}
