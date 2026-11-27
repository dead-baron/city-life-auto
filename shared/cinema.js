// The Grand Theatre as a cinema (IN14): the building found by its name becomes a walk-in - the lobby by the door with the
// ticket and popcorn counter (a clerk) and the poster wall, a corridor up the middle, a screen room either side of it with
// stepped rows of red seats facing a big screen on the back wall. Buy a ticket (and popcorn) at the counter, walk into a
// screen, sit in a seat and watch a short invented film (server/systems/cinema.js; drawn by client/cinema.js). Shared and
// deterministic: the layout, the films and their running time. Numbers in px; one tile is a metre.
import { TILE } from './constants.js';

export const CINE = {
  NAME: 'The Grand Theater',
  ROOM_T: 5,              // tiles from the back wall to the room's own front wall (the screen's floor, three rows of seats, the walkway)
  // (the art pass, 2026-11-25 - the owner, 11-24: the cinema rebuilt before the beta. In World v3 The Grand Theater is
  // 40 x 59 tiles: two screens across its back and fifty rows of empty lobby. The inside is now a compact one at the
  // door, IN14's: the lobby, the hall up its middle, and - where the building has the room - four screens, two a side,
  // the far pair behind the near pair. What is left of the building stays shut: store rooms, the projection floor.)
  LOBBY_T: 7,             // rows of lobby between the poster wall and the front wall, when the building is deeper than it needs
  MAX_W: 23,              // the inside's width at most (the hall in the middle, a screen of ten tiles either side)
  FOUR_W: 17, FOUR_LOBBY: 5,   // four screens: the inside this wide at least, and this much lobby left
  SEAT_ROWS: 3, SEAT_PITCH: 16,
  TICKET: 12, POPCORN: 5, // at the counter
  FILM_S: 75,             // a film's running time
  NPC_PER_ROOM: 4,        // watching while a player is near
  NEAR_PX: 900, FAR_PX: 1300,
};
// what's on: invented films, drawn as plain shapes of coloured light (client/cinema.js). pal: the sky, the light, the
// figure, the accent.
export const FILMS = [
  { title: 'Neon Harbor', tag: 'a night chase by the water', kind: 'chase', pal: ['#0e1430', '#ff4ab0', '#5ad8ff', '#ffe08a'] },
  { title: 'The Last Lighthouse', tag: 'a keeper and a storm', kind: 'sea', pal: ['#14243a', '#ffd27a', '#e8f0ff', '#3a7ab0'] },
  { title: 'Gravity Rodeo', tag: 'cowboys in orbit', kind: 'space', pal: ['#08060f', '#ff8a3a', '#a0ffd0', '#c070ff'] },
  { title: 'Moonlight Diner', tag: 'two strangers, one booth', kind: 'romance', pal: ['#2a1420', '#ff7a8a', '#ffe4c0', '#7ac0ff'] },
];
// (four screens, four films: the far pair starts on films 0 and 2 as the two screens always did, the near pair on 1 and 3)
export const filmFor = (room, k) => ((room < 2 ? room * 2 : room * 2 - 3) + k) % FILMS.length;
export const POSTERS = [
  { title: 'NEON HARBOR', c: ['#1a1440', '#ff4ab0', '#5ad8ff'] },
  { title: 'LIGHTHOUSE', c: ['#14243a', '#ffd27a', '#e8f0ff'] },
  { title: 'GRAVITY RODEO', c: ['#120a20', '#ff8a3a', '#a0ffd0'] },
  { title: 'MOONLIGHT DINER', c: ['#3a1428', '#ff7a8a', '#ffe4c0'] },
  { title: 'COMING SOON', c: ['#202428', '#e8e2d0', '#c03030'] },
];

// The building's interior (tiles x0..x1, y0..y1), its door on the south (south: true) or the north: the rooms, the
// corridor, the lobby and the counter. Rows count from the back wall (k = 0) toward the door. wi.tiers: 1 (two screens
// across the back) or 2 (four: a second pair in front of the first, a wall between - each pair's rooms open onto the
// hall at their own walkway row). Rooms 0 and 1 are the far pair.
export function cinemaLayout(wi) {
  const south = wi.south, dir = south ? 1 : -1, back = south ? wi.y0 : wi.y1, tiers = wi.tiers === 2 ? 2 : 1;
  const row = (k) => back + dir * k;
  const W = wi.x1 - wi.x0 + 1, cc = wi.x0 + Math.floor((W - 1) / 2), rooms = [], tierWalls = [];
  for (let t = 0; t < tiers; t++) {
    const k0 = t * (CINE.ROOM_T + 1);   // (the tier's back row; the row before it is the wall its screens hang on)
    if (t > 0) tierWalls.push(row(k0 - 1));
    [[wi.x0, cc - 2], [cc + 2, wi.x1]].forEach(([rx0, rx1], side) => {
      const i = t * 2 + side;
      const ya = Math.min(row(k0), row(k0 + CINE.ROOM_T - 1)), yb = Math.max(row(k0), row(k0 + CINE.ROOM_T - 1));
      const x0 = rx0 * TILE, x1 = (rx1 + 1) * TILE, w = x1 - x0;
      const backEdge = south ? row(k0) * TILE : (row(k0) + 1) * TILE;
      const seats = [];
      const n = Math.floor((w - 8) / CINE.SEAT_PITCH), left = x0 + (w - n * CINE.SEAT_PITCH) / 2 + CINE.SEAT_PITCH / 2;
      for (let r = 0; r < CINE.SEAT_ROWS; r++) for (let q = 0; q < n; q++) seats.push({ x: Math.round(left + q * CINE.SEAT_PITCH), y: (row(k0 + 1 + r) + 0.5) * TILE + dir * 4, a: south ? -Math.PI / 2 : Math.PI / 2, row: r });
      const doorTx = side === 0 ? cc - 1 : cc + 1;
      rooms.push({ i, tier: t, x0, x1, y0: ya * TILE, y1: (yb + 1) * TILE, tx0: rx0, tx1: rx1, backEdge, dir, screen: { x0: x0 + 10, x1: x1 - 10, h: 44, lift: 14 }, seats, door: { tx: doorTx, ty: row(k0 + CINE.ROOM_T - 1) } });
    });
  }
  const deep = tiers * CINE.ROOM_T + (tiers - 1);   // (rows the screens take, the wall between the pairs with them)
  const counterRow = row(deep + 2), ca = cc + 2, cb = wi.x1 - 1;
  return { south, dir, back, cc, tiers, rooms, tierWalls, deep, wallRow: row(deep), counterRow, ca, cb, lobbyRows: [row(deep + 1), south ? wi.y1 : wi.y0] };
}
// The inside's box in a building (tiles): the whole of a small one; in a big one MAX_W wide about the door and only as
// deep as the screens, the poster wall and LOBBY_T rows of lobby need - at the door. -> { x0, x1, y0, y1, tiers }
export function cinemaBox(b, south) {
  const fx0 = b.tx + 1, fx1 = b.tx + b.tw - 2, fy0 = b.ty + 1, fy1 = b.ty + b.th - 2, dc = Math.floor((fx0 + fx1) / 2);
  let x0 = fx0, x1 = fx1;
  if (fx1 - fx0 + 1 > CINE.MAX_W) { const h = (CINE.MAX_W - 1) >> 1; x0 = dc - h; x1 = dc + h; }
  const W = x1 - x0 + 1, D = fy1 - fy0 + 1;
  const tiers = W >= CINE.FOUR_W && D >= 2 * CINE.ROOM_T + 2 + CINE.FOUR_LOBBY ? 2 : 1;
  const need = tiers * CINE.ROOM_T + (tiers - 1) + 1 + CINE.LOBBY_T;
  let y0 = fy0, y1 = fy1;
  if (D > need) { if (south) y0 = fy1 - need + 1; else y1 = fy0 + need - 1; }
  return { x0, x1, y0, y1, tiers };
}
// the screen room (x, y) is in, or -1
export function roomAt(C, x, y) {
  for (const R of C.rooms) if (x >= R.x0 && x < R.x1 && y >= R.y0 && y < R.y1) return R.i;
  return -1;
}

// ---- the cinema in the world (shared/map.js calls this once the walk-ins are built) ------------------------------------
// The building whose storefront is The Grand Theatre (found by its name) becomes the cinema: a walk-in with one unit, the
// counter's; m.cinema holds the rooms and their seats.
export function buildCinema(m, { T, DISTRICTS }) {
  const p = m.pois.find((q) => q && q.label === CINE.NAME && q.b !== undefined);
  const b = p && m.buildings[p.b];
  if (!b || b.gone || b.prefab < 0 || b.walkIn || b.tw < 9 || b.th < 11) return;
  const south = m.prefabs[b.prefab].rot === 0, dir = south ? 1 : -1;
  const { x0, x1, y0, y1, tiers } = cinemaBox(b, south);
  const L = cinemaLayout({ south, x0, x1, y0, y1, tiers });
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) m.set(tx, ty, T.FLOOR);
  // the screen rooms' walls either side of the corridor (each room's door at its back, by the walkway), the wall across
  // the front of the rooms (the poster wall on its lobby side) with the corridor's mouth open
  // (with four screens: the same for each pair, and the wall between the pairs with the hall through it)
  for (let k = 0; k < L.deep; k++) {
    const q = k % (CINE.ROOM_T + 1);
    if (q === CINE.ROOM_T) { for (let tx = x0; tx <= x1; tx++) if (tx !== L.cc) m.set(tx, L.back + dir * k, T.WALL); }
    else if (q !== CINE.ROOM_T - 1) for (const tx of [L.cc - 1, L.cc + 1]) m.set(tx, L.back + dir * k, T.WALL);
  }
  for (let tx = x0; tx <= x1; tx++) if (tx !== L.cc) m.set(tx, L.wallRow, T.WALL);
  // the door: two tiles of the front wall, in the middle
  const fy = south ? b.ty + b.th - 1 : b.ty, dc = Math.floor((b.tx + 1 + b.tx + b.tw - 2) / 2);
  m.set(dc, fy, T.FLOOR); m.set(dc + 1, fy, T.FLOOR);
  // the ticket and popcorn counter on the right as you come in, the clerk behind it
  for (let tx = L.ca; tx <= L.cb; tx++) m.set(tx, L.counterRow, T.COUNTER);
  const cx = (L.ca + L.cb + 1) / 2 * TILE;
  const old = p.label;
  p.kind = 'cinema';
  p.outside = { x: p.x, y: p.y };
  p.x = cx; p.y = (L.counterRow + dir + 0.5) * TILE; p.r = 40;
  for (const s of b.signs || []) if (s.text === old) s.text = p.label;
  const unit = { poi: p.id, kind: 'cinema', x0, x1, counterRow: L.counterRow, clerk: { x: cx, y: (L.counterRow - dir + 0.5) * TILE, a: south ? Math.PI / 2 : -Math.PI / 2 }, door: { tx: dc, ty: fy, w: 2 } };
  b.walkIn = { south, units: [unit], x0, x1, y0, y1 };
  b.business = 'cinema';
  m.walkIns.push(b.id);
  const d = m.dist[m.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))];
  m.cinema = { b: b.id, poi: p.id, name: p.label, district: DISTRICTS[d] ? DISTRICTS[d].name : '', south, counter: { x: p.x, y: p.y }, rooms: L.rooms, cc: L.cc, wallRow: L.wallRow, counterRow: L.counterRow, ca: L.ca, cb: L.cb, tiers: L.tiers, tierWalls: L.tierWalls, box: [x0, y0, x1, y1] };
}
