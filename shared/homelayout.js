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
//   (H71, an apartment block's lobby) M the mailboxes (use) Z the stairs up - U a flat's door and E the lift's doors (in
//   the back wall, solid like it)
export const TILE_IN = 32;
// (H77) the concept's new pieces, lower case in a plan: x a pool table  j an arcade cabinet  i a row of cinema seats  n a
// kitchen island and its stools  s a sectional sofa (its long side)  b a bedside table and its lamp  l a floor lamp  w a
// washing machine  k a workbench  e an exercise bike  h a bathtub - furniture like the rest (solid, a run one piece)
const PLAN_LOWER = 'xjinsblwkh';
export const BODY_IN = 10;   // half the size of you, for the walls (px)
// (H77, the owner's HO6 concept: thin walls) a wall is a thin line, not its whole tile: WALL_IN px thick, along the middle
// of a wall tile inside the home and along the inner edge of the outside walls - the rest of the tile is the room's
// floor (or the yard, outside). The tiles stay as they are (the decor, the rooms and the lobby read them); only the
// walking (blocked) sees the line.
export const WALL_IN = 10;

const PLANS = {
  // a single-wide trailer / shack: the kitchen and the living room in one, the bedroom with the shower in its corner
  trailer: [
    '###==###=###',
    '#KKF..V#BBW#',
    '#......#BB.#',
    '#TT..1.+...#',
    '#1.....#..S#',
    '#A..OCC#HL.#',
    '###D########',
  ],
  // an apartment: the living room and the kitchen, a bedroom, a bathroom off it
  apartment: [
    '#####==###==##',
    '#KKKF1#WW..lS#',
    '#.....#......#',
    '#TT...+.bBBb.#',
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
    '#KKKF1#HHt#WWS#gggg#',
    '#.....#ttt+...#gggg#',
    '#TT...#LNt#.BB#gggg#',
    '#TT...#####.BB#gggg#',
    '#.....+.......+gggg#',
    '#C...V#..2....#gggg#',
    '#C...A#.......#gggY#',
    '###D###########RRRR#',
  ],
  // a mansion (H77, the owner's HO6 concept): along the back the master bedroom (bedside lamps), the walk-in wardrobe
  // with the safe, the bathroom (the bath, the shower) and the home cinema (the big screen, two rows of red seats); the
  // great room - the kitchen, the island and its stools, the dining table, the sectional facing the TV - and the games
  // room (the pool table, two arcade cabinets); the three-car garage through the games room
  mansion: [
    '#' + '##==##' + '#' + '###' + '#' + '#==#' + '#' + '#####' + '#' + '######' + '#',
    '#' + 'lbBBb.' + '#' + 'WWW' + '#' + 'HH.L' + '#' + '.VVV.' + '#' + 'gggggg' + '#',
    '#' + '..BB..' + '#' + '...' + '#' + '...N' + '#' + '.....' + '#' + 'gggggg' + '#',
    '#' + '......' + '+' + '..S' + '#' + 'hh..' + '#' + 'iiii.' + '#' + 'gggggg' + '#',
    '#' + '3.....' + '#' + 'WW.' + '#' + '...P' + '#' + 'iiii.' + '#' + 'gggggg' + '#',
    '#' + '#####+' + '#' + '###' + '#' + '##+#' + '#' + '####+' + '#' + 'gggggg' + '#',
    '#' + 'KKKKF..2...VV.l' + '#' + 'Qj.j.' + '#' + 'gggggg' + '#',
    '=' + '...............' + '+' + '.....' + '#' + 'gggggg' + '#',
    '=' + '.nnn...TTT.....' + '#' + '.xxx.' + '+' + 'gggggg' + '#',
    '#' + '.nnn...TTT.ssss' + '#' + '.xxx.' + '#' + 'gggggg' + '#',
    '#' + '3....A.....ssss' + '#' + 'P...O' + '#' + 'gggggY' + '#',
    '#' + '##==###D##==###' + '#' + '#####' + '#' + 'RRRRRR' + '#',
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
    '#KKKF1#WW...S#bBBbP#',
    '#.....#......#.BB..#',
    '#TT...+.bBBb.+.....#',
    '#TT...#..BB..#Q.2.W#',
    '#.....##+#####..3..#',
    '#C...V#ttttLN#O....#',
    '#C..A.#HHtttt#P...3#',
    '###D################',
  ],
};
export const PLAN_KEYS = Object.keys(PLANS);   // (the homes' plans: the lobbies' and the arcade's come after)
// (2026-10-24, the owner: "The Arcade should be a building that has an interior you walk into") an arcade's floor, every
// arcade's door opening into one of its own (server/systems/arcade.js): the cabinets along the back wall - one a game,
// in arcade.js GAMES's order - and the prize counter down the east wall (G: use it), a plant by the door
PLANS.arcade = [
  '################',
  '#cjccjccjccjccc#',
  '#cccccccccccccG#',
  '#PccccccccccccG#',
  '#cccccccccccccG#',
  '#cccccccccccccc#',
  '#######D########',
];
// (2026-10-25, the owner: "a really awesome arcade in the neon district") the flagship's floor - the Neon Strip's Pixel
// Arcade (server/systems/arcade.js hallOf: poi.flagship): twice the floor, a row of cabinets along the back wall and
// an island of them down the middle (each a game in arcade.js GAMES's order, round again), the long prize counter by
// the east wall, plants by the door
PLANS.arcadeflag = [
  '########################',
  '#jcjcjcjcjcjcjcjcjcjcjc#',
  '#cccccccccccccccccccccc#',
  '#cccccccccccccccccccccc#',
  '#ccjcjcjcjcccccjcjcjcGG#',
  '#ccccccccccccccccccccGG#',
  '#PcccccccccccccccccccGG#',
  '#ccccccccccccccccccccGG#',
  '#cccccccccccccccccccccc#',
  '#PccccccccccccccccccccP#',
  '###########D############',
];
// (H71) an apartment block's lobby (HO5), lobby4 .. lobby8 by its number of flats: in by the front door, the tiled hall -
// the mailboxes on the back wall, the lift beside them, the stairs up in the corner, a plant by the door - and the
// landing's carpet runner along the back wall with the flats' doors, unit 1 first (U, numbered in order), each one's
// spot to stand in front of it
export const lobbyKey = (n) => `lobby${Math.max(4, Math.min(8, n | 0))}`;
for (let n = 4; n <= 8; n++) {
  PLANS[lobbyKey(n)] = [
    '###EE#=##' + '#U'.repeat(n) + '##',
    '#MM' + 't'.repeat(6) + 'c'.repeat(2 * n) + 'c#',
    '#' + 't'.repeat(8) + 'c'.repeat(2 * n) + 'c#',
    '#ZZ' + 't'.repeat(6) + 'c'.repeat(2 * n) + 'P#',
    '#ZZ' + 't'.repeat(5) + '1' + 'c'.repeat(2 * n) + 'c#',
    '####D####' + '##'.repeat(n) + '##',
  ];
}

const SOLID = new Set(['#', '=', 'D', 'R', 'U', 'E', ...'BWSFHAYKTCVLNOQPMZG', ...PLAN_LOWER]);
const WALLISH = new Set(['#', '=', 'D', 'R', 'U', 'E']);
const FLOORS = new Set(['.', 'c', 't', 'g', '+']);
export const USES = { B: 'bed', W: 'wardrobe', S: 'safe', F: 'fridge', H: 'shower', A: 'hall', Y: 'garage', M: 'mail', G: 'prizes' };   // (G: an arcade's prize counter)

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
    if (!(/[A-Z]/.test(ch) || PLAN_LOWER.includes(ch)) || ch === 'D' || ch === 'R' || ch === 'U' || ch === 'E' || seen.has(tx + ',' + ty)) continue;
    let w = 1, h = 1;
    while (at(tx + w, ty) === ch && !seen.has(tx + w + ',' + ty)) w++;
    while ([...Array(w).keys()].every((i) => at(tx + i, ty + h) === ch)) h++;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seen.add(tx + i + ',' + (ty + j));
    pieces.push({ ch, use: USES[ch] || null, tx, ty, tw: w, th: h, x: tx * TILE_IN, y: ty * TILE_IN, w: w * TILE_IN, h: h * TILE_IN });
  }
  let door = null, bays = [];
  const doors = [];   // (H71: a lobby's flats' doors, unit 1 first)
  for (let ty = 0; ty < R; ty++) for (let tx = 0; tx < C; tx++) {
    if (at(tx, ty) === 'D' && !door) door = { tx, ty, x: (tx + 0.5) * TILE_IN, y: (ty + 0.5) * TILE_IN };
    if (at(tx, ty) === 'U') doors.push({ n: doors.length + 1, tx, ty, x: (tx + 0.5) * TILE_IN, y: (ty + 0.5) * TILE_IN });
    if (at(tx, ty) === 'R' && at(tx, ty - 1) === 'g' && tx % 2 === 1) bays.push({ x: (tx + 0.5) * TILE_IN, y: (ty - 2) * TILE_IN });
  }
  bays = bays.slice(0, 4);
  // (H64: the cars park nose-in at the garage's back wall, spread evenly across it - clear of the door from the hall,
  // which comes in lower down, and of the key board by the roller door; parked, a car is solid: carRects)
  if (bays.length) {
    let gx0 = C, gx1 = 0, gy0 = R;
    for (let ty = 0; ty < R; ty++) for (let tx = 0; tx < C; tx++) if (at(tx, ty) === 'g') { gx0 = Math.min(gx0, tx); gx1 = Math.max(gx1, tx); gy0 = Math.min(gy0, ty); }
    const gw = (gx1 - gx0 + 1) * TILE_IN;
    bays = bays.map((_, i) => ({ x: gx0 * TILE_IN + gw * (i + 0.5) / bays.length, y: gy0 * TILE_IN + 4 + CAR_IN.l / 2 }));
  }
  // (H77) the walls' thin lines: per wall tile, its rects [x0, y0, x1, y1] (px, in the tile) - a line along the middle (the
  // inner edge on the outside walls) toward each wall beside it, out to the tile's edge where a doorway or a wall goes on
  const T = TILE_IN, mid0 = (T - WALL_IN) / 2;
  const isW = (tx, ty) => tx >= 0 && ty >= 0 && tx < C && ty < R && WALLISH.has(at(tx, ty));
  const goes = (tx, ty) => isW(tx, ty) || (tx >= 0 && ty >= 0 && tx < C && ty < R && at(tx, ty) === '+');
  const walls = new Array(C * R).fill(null), wallRects = [];
  for (let ty = 0; ty < R; ty++) for (let tx = 0; tx < C; tx++) {
    if (!isW(tx, ty)) continue;
    const bx = tx === 0 ? T - WALL_IN : tx === C - 1 ? 0 : mid0, by = ty === 0 ? T - WALL_IN : ty === R - 1 ? 0 : mid0;
    const l = goes(tx - 1, ty), r = goes(tx + 1, ty), u = goes(tx, ty - 1), d = goes(tx, ty + 1);
    const rs = [];
    if (l || r || !(u || d)) rs.push([l ? 0 : bx, by, r ? T : bx + WALL_IN, by + WALL_IN]);
    if (u || d) rs.push([bx, u ? 0 : by, bx + WALL_IN, d ? T : by + WALL_IN]);
    walls[ty * C + tx] = rs;
    for (const q of rs) wallRects.push({ tx, ty, ch: at(tx, ty), x: tx * T + q[0], y: ty * T + q[1], w: q[2] - q[0], h: q[3] - q[1] });
  }
  const L = {
    key, tier, cols: C, rows: R, w: C * TILE_IN, h: R * TILE_IN, grid: rows, pieces, door, bays, doors, walls, wallRects,
    spawn: { x: door.x, y: door.y - TILE_IN },
    cell: at,
    solid: (tx, ty) => SOLID.has(at(tx, ty)),
  };
  cache.set(ck, L);
  return L;
}

// A car parked in a bay (H64): its footprint, the biggest a bay takes (homeview.js draws them no bigger)
export const CAR_IN = { l: 104, w: 52 };
// The first n bays' cars, as rects (px) - the cars parked in the garage are solid
export function carRects(L, n) {
  return L.bays.slice(0, Math.max(0, n | 0)).map((b) => ({ x: b.x - CAR_IN.w / 2 - 2, y: b.y - CAR_IN.l / 2 - 2, w: CAR_IN.w + 4, h: CAR_IN.l + 4 }));
}

// Does a body at (x, y) touch a wall or a piece of furniture - or one of the nc cars parked in the garage?
export function blocked(L, x, y, r = BODY_IN, nc = 0) {
  const x0 = Math.floor((x - r) / TILE_IN), x1 = Math.floor((x + r - 0.001) / TILE_IN);
  const y0 = Math.floor((y - r) / TILE_IN), y1 = Math.floor((y + r - 0.001) / TILE_IN);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const wr = tx >= 0 && ty >= 0 && tx < L.cols && ty < L.rows ? L.walls[ty * L.cols + tx] : null;
    if (wr) {   // (H77: a wall tile - only its thin line is solid)
      const lx = x - tx * TILE_IN, ly = y - ty * TILE_IN;
      for (const q of wr) if (lx + r > q[0] && lx - r < q[2] && ly + r > q[1] && ly - r < q[3]) return true;
    } else if (L.solid(tx, ty)) return true;
  }
  if (nc > 0) for (const c of carRects(L, nc)) if (x + r > c.x && x - r < c.x + c.w && y + r > c.y && y - r < c.y + c.h) return true;
  return false;
}

// One step of walking round the inside (the server's and the page's, the same): along the walls, never through them
// (s.nc: how many cars are parked in the garage - they're solid too)
export function stepInside(L, s, mx, my, dt, speed) {
  let len = Math.hypot(mx, my);
  if (len < 0.15) return false;
  if (len > 1) { mx /= len; my /= len; len = 1; }
  const dx = mx * speed * dt, dy = my * speed * dt;
  const slide = (axis, d) => {
    const from = s[axis];
    s[axis] = from + d;
    if (!blocked(L, s.x, s.y, BODY_IN, s.nc)) return;
    let lo = 0, hi = 1;   // as far as it goes
    for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; s[axis] = from + d * m; if (blocked(L, s.x, s.y, BODY_IN, s.nc)) hi = m; else lo = m; }
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
  for (const d of L.doors || []) {   // (H71: a flat's door along a lobby's landing)
    const e = near(d.x - TILE_IN / 2, d.y - TILE_IN / 2, TILE_IN, TILE_IN);
    if (e <= reach + 2 && e < bd) { bd = e; best = { use: 'unit', n: d.n, x: d.x - TILE_IN / 2, y: d.y - TILE_IN / 2, w: TILE_IN, h: TILE_IN }; }
  }
  const dd = near(L.door.x - TILE_IN / 2, L.door.y - TILE_IN / 2, TILE_IN, TILE_IN);
  if (dd <= reach + 2 && dd < bd) best = { use: 'door', x: L.door.x - TILE_IN / 2, y: L.door.y - TILE_IN / 2, w: TILE_IN, h: TILE_IN };
  return best;
}
