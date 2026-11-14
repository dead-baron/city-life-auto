// The casinos' gaming floors and the card tables in the bars (the owner, 2026-11-14: casinos you walk into - roulette,
// blackjack, poker and the slots, NPCs at them, the wheel spinning, the cards dealt, the reels turning; "If possible for
// casinos let's make sure the really fancy ones look that way"). Pure layout in world px, the same on the server
// (server/systems/casinofloor.js: who sits where, what's dealt), in the bake (client/art2/casinoart.js: the tables, the
// machines, the carpet) and on the page (client/casinoview.js: the wheel, the cards, the reels drawn live over them).
//   casinoRoom(b, u, TILE) -> null | { tier (3 grand, 2 resort, 1 old town), south, X0, X1, Y0, Y1, cage, dx, dw, lane,
//     tables: [gameTable], slots: [slotMachine], pieces: [{ t, x0, y0, x1, y1 }] (columns, rugs, chandeliers), lamps, seed }
//   gameTable(g, x, y, i) -> { i, g ('rou' | 'bj' | 'pk'), x0, y0, x1, y1, cx, cy, h, seats [{ x, y, a }], dealer,
//     cards [{ x, y }] (on the felt in front of each seat), dc (the dealer's cards / the board), wheel? { x, y, r } }
//   slotMachine(x, y, i) -> { i, x0, y0, x1, y1, h, sx, sy, sz (the screen's middle: x, y, height), seat }
// A tier: 3 the Strip's grandest (chandeliers, patterned carpet, marble, gold trim), 2 the other resorts (carpet, brass),
// 1 Old Downtown's old casinos (boards, a worn runner, plain felt) - set on the casino's place by its district's plan
// (shared/world3-strip.js, world3-mesa.js) and carried on its walk-in unit (shared/map.js walkInRoom: u.casino).
const BODY = { rou: [88, 30], bj: [64, 28], pk: [76, 34] };
export const FELT_H = 18;
const N = -1.57, S = 1.57, E = 0, W = 3.14;   // (the way a seat faces the table: fixed, never computed - shared/dmath.js)

export function gameTable(g, x, y, i = 0) {
  const [w, d] = BODY[g], x1 = x + w, y1 = y + d, cx = x + w / 2, cy = y + d / 2, seats = [], cards = [];
  const seat = (sx, sy, a) => { seats.push({ x: Math.round(sx), y: Math.round(sy), a }); cards.push({ x: Math.round(Math.max(x + 7, Math.min(x1 - 7, sx))), y: Math.round(Math.max(y + 6, Math.min(y1 - 6, sy))) }); };
  const T = { i, g, x0: x, y0: y, x1, y1, cx, cy, h: FELT_H, seats, cards, dealer: null, dc: null };
  if (g === 'rou') {   // the wheel at the east end, the layout's grid along the rest; the players along the south side
    T.wheel = { x: x1 - 15, y: cy, r: 11 };
    for (let k = 0; k < 4; k++) seat(x + 10 + k * 15, y1 + 9, N);
    T.dealer = { x: x1 - 34, y: y - 9, a: S }; T.dc = { x: x + 34, y: cy };
  } else if (g === 'bj') {   // the half-moon: five round the curved side, the dealer at the flat one
    for (let k = 0; k < 5; k++) seat(x + 8 + k * 12, y1 + 9 - (k === 0 || k === 4 ? 5 : 0), N);
    T.dealer = { x: cx, y: y - 9, a: S }; T.dc = { x: cx, y: y + 7 };
  } else {   // poker: the oval, six round it, the dealer in the middle of the north side
    for (const f of [0.22, 0.78]) seat(x + w * f, y1 + 9, N);
    seat(x - 9, cy, E); seat(x1 + 9, cy, W);
    for (const f of [0.15, 0.85]) seat(x + w * f, y - 9, S);
    T.dealer = { x: cx, y: y - 10, a: S }; T.dc = { x: cx, y: cy };
  }
  return T;
}
// a bar's card table (shared/shoprooms.js 'cards'): the piece is the table with room for its seats round it, the table
// CARD_IN in from its edge
export const CARD_IN = 14;
export const CARD_RECT = { pk: [BODY.pk[0] + 2 * CARD_IN, BODY.pk[1] + 2 * CARD_IN], bj: [BODY.bj[0] + 2 * CARD_IN, BODY.bj[1] + 2 * CARD_IN] };
export const cardTableOf = (p, i = 0) => gameTable(p.k, p.x0 + CARD_IN, p.y0 + CARD_IN, i);
export function slotMachine(x, y, i = 0) {
  return { i, x0: x, y0: y, x1: x + 12, y1: y + 12, h: 30, sx: x + 6, sy: y + 12, sz: 21, seat: { x: x + 6, y: y + 22, a: N } };
}

const SEQ = { 3: ['rou', 'bj', 'pk', 'bj', 'slots', 'rou', 'pk', 'bj', 'slots'], 2: ['bj', 'rou', 'slots', 'pk', 'bj', 'slots', 'rou'], 1: ['bj', 'slots', 'pk', 'rou', 'slots', 'bj'] };
const CW = 112, CH = 86;
const ROOMS = new WeakMap();
export function casinoRoom(b, u, TILE) {
  const wi = b && b.walkIn;
  if (!wi || !u || !u.casino) return null;
  let K = ROOMS.get(u);
  if (K) return K;
  const tier = Math.max(1, Math.min(3, u.casino | 0)), south = !!wi.south, cr = u.counterRow;
  const X0 = u.x0 * TILE, X1 = (u.x1 + 1) * TILE, Y0 = wi.y0 * TILE, Y1 = (wi.y1 + 1) * TILE, dx = u.door.tx * TILE, dw = (u.door.w || 2) * TILE;
  const cage = { x0: Math.max(u.x0, u.x1 - 4) * TILE, x1: u.x1 * TILE, y0: cr * TILE, y1: (cr + 1) * TILE };
  const seed = (Math.imul(b.tx + 11, 73856093) ^ Math.imul(b.ty + 5, 19349663)) >>> 0;
  const R = K = { tier, south, X0, X1, Y0, Y1, cage, dx, dw, lane: [dx - 14, dx + dw + 14], tables: [], slots: [], pieces: [], lamps: [], seed };
  const lamp = (x, y, r, k) => R.lamps.push({ x: Math.round(x), y: Math.round(y), r, k });
  // along the back wall, beside the cage: a row of slots, a stool at each (the back wall on the north: against it; on
  // the south, the wall nearest the camera: just in front of the counter's row, so their screens face into the room)
  const by = south ? Y0 + 4 : cr * TILE + 6;
  for (let x = X0 + 10, k = 0; x + 12 <= cage.x0 - 24; x += ++k % 6 ? 16 : 40) R.slots.push(slotMachine(x, by, R.slots.length));   // (in banks of six)
  // the floor between the counter's row and the front wall: tables in a grid of cells either side of the door's lane
  const z0 = south ? (cr + 1) * TILE + 10 : Y0 + 12, z1 = south ? Y1 - 12 : cr * TILE - 10, seq = SEQ[tier];
  let n = seed % seq.length;
  const fits = (w) => (w >= CW ? Math.floor(w / CW) : w >= 96 ? 1 : 0);
  // (a narrow room - The Neon Saguaro - has no room either side of the lane: one column down the middle, the cells
  // nearest the door left open)
  const regs = fits(R.lane[0] - X0 - 10) || fits(X1 - 10 - R.lane[1]) ? [[X0 + 10, R.lane[0], z0, z1], [R.lane[1], X1 - 10, z0, z1]] : [[X0 + 10, X1 - 10, south ? z0 : z0 + 70, south ? z1 - 70 : z1]];
  for (const [a, c, za, zb] of regs) {
    const w = c - a, cols = fits(w), cw = cols ? Math.min(CW + 24, w / cols) : 0, rows = Math.floor((zb - za) / CH);
    if (!cols || rows < 1) continue;
    const gx = a + (w - cols * cw) / 2, gy = za + (zb - za - rows * CH) / 2;
    for (let j = 0; j < rows; j++) for (let k = 0; k < cols; k++) {
      const x = Math.round(gx + k * cw), y = Math.round(gy + j * CH), mx = x + cw / 2;
      let g = seq[n++ % seq.length];
      if (g === 'pk' && cw < 104) g = 'bj';
      if (g === 'slots') {
        const m = Math.min(6, Math.floor((cw - 8) / 16)), sx = Math.round(mx - m * 8 + 2);
        for (const ry of [y + 6, y + 46]) for (let q = 0; q < m; q++) R.slots.push(slotMachine(sx + q * 16, ry, R.slots.length));
        lamp(mx, y + 40, 46, 0.7);
        continue;
      }
      const [tw] = BODY[g], T = gameTable(g, Math.round(mx - tw / 2), y + 22, R.tables.length);
      R.tables.push(T);
      lamp(T.cx, T.cy, tier === 1 ? 44 : 52, tier === 1 ? 0.8 : 1);
      if (tier === 3) R.pieces.push({ t: 'chand', x0: Math.round(mx) - 7, y0: y + 30, x1: Math.round(mx) + 7, y1: y + 44 });
    }
  }
  // the grand floors: gilt columns down the side walls, the red carpet up the lane from the door
  if (tier === 3) for (let y = z0 + 20; y + 10 < z1; y += 150) for (const x of [X0 + 2, X1 - 12]) R.pieces.push({ t: 'column', x0: x, y0: y, x1: x + 10, y1: y + 10 });
  if (tier >= 2) R.pieces.push({ t: 'runner', x0: dx - 4, y0: south ? (cr + 1) * TILE : Y0, x1: dx + dw + 4, y1: south ? Y1 : cr * TILE, flat: true });
  ROOMS.set(u, R);
  return R;
}
// every casino floor of a built map: [{ b (index), u, R }]
const FLOORS = new WeakMap();
export function casinoFloors(map, TILE) {
  let L = FLOORS.get(map);
  if (L) return L;
  L = [];
  (map.buildings || []).forEach((b, bi) => { if (b && b.walkIn) for (const u of b.walkIn.units) if (u.casino) { const R = casinoRoom(b, u, TILE); if (R) L.push({ b: bi, u, R }); } });
  FLOORS.set(map, L);
  return L;
}
