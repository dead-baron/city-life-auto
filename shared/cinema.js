// The Grand Theatre as a cinema (IN14): the building found by its name becomes a walk-in - the lobby by the door with the
// ticket and popcorn counter (a clerk) and the poster wall, a corridor up the middle, a screen room either side of it with
// stepped rows of red seats facing a big screen on the back wall. Buy a ticket (and popcorn) at the counter, walk into a
// screen, sit in a seat and watch a short invented film (server/systems/cinema.js; drawn by client/cinema.js). Shared and
// deterministic: the layout, the films and their running time. Numbers in px; one tile is a metre.
import { TILE } from './constants.js';

export const CINE = {
  NAME: 'The Grand Theatre',
  ROOM_T: 5,              // tiles from the back wall to the room's own front wall (the screen's floor, three rows of seats, the walkway)
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
export const filmFor = (room, k) => (room * 2 + k) % FILMS.length;
export const POSTERS = [
  { title: 'NEON HARBOR', c: ['#1a1440', '#ff4ab0', '#5ad8ff'] },
  { title: 'LIGHTHOUSE', c: ['#14243a', '#ffd27a', '#e8f0ff'] },
  { title: 'GRAVITY RODEO', c: ['#120a20', '#ff8a3a', '#a0ffd0'] },
  { title: 'MOONLIGHT DINER', c: ['#3a1428', '#ff7a8a', '#ffe4c0'] },
  { title: 'COMING SOON', c: ['#202428', '#e8e2d0', '#c03030'] },
];

// The building's interior (tiles x0..x1, y0..y1), its door on the south (south: true) or the north: the rooms, the
// corridor, the lobby and the counter. Rows count from the back wall (k = 0) toward the door.
export function cinemaLayout(wi) {
  const south = wi.south, dir = south ? 1 : -1, back = south ? wi.y0 : wi.y1;
  const row = (k) => back + dir * k;
  const W = wi.x1 - wi.x0 + 1, cc = wi.x0 + Math.floor((W - 1) / 2);
  const rooms = [[wi.x0, cc - 2], [cc + 2, wi.x1]].map(([rx0, rx1], i) => {
    const ya = Math.min(row(0), row(CINE.ROOM_T - 1)), yb = Math.max(row(0), row(CINE.ROOM_T - 1));
    const x0 = rx0 * TILE, x1 = (rx1 + 1) * TILE, w = x1 - x0;
    const backEdge = south ? wi.y0 * TILE : (wi.y1 + 1) * TILE;
    const seats = [];
    const n = Math.floor((w - 8) / CINE.SEAT_PITCH), left = x0 + (w - n * CINE.SEAT_PITCH) / 2 + CINE.SEAT_PITCH / 2;
    for (let r = 0; r < CINE.SEAT_ROWS; r++) for (let s = 0; s < n; s++) seats.push({ x: Math.round(left + s * CINE.SEAT_PITCH), y: (row(1 + r) + 0.5) * TILE + dir * 4, a: south ? -Math.PI / 2 : Math.PI / 2, row: r });
    const doorTx = i === 0 ? cc - 1 : cc + 1;
    return { i, x0, x1, y0: ya * TILE, y1: (yb + 1) * TILE, tx0: rx0, tx1: rx1, backEdge, dir, screen: { x0: x0 + 10, x1: x1 - 10, h: 44, lift: 14 }, seats, door: { tx: doorTx, ty: row(CINE.ROOM_T - 1) } };
  });
  const counterRow = row(CINE.ROOM_T + 2), ca = cc + 2, cb = wi.x1 - 1;
  return { south, dir, back, cc, rooms, wallRow: row(CINE.ROOM_T), counterRow, ca, cb, lobbyRows: [row(CINE.ROOM_T + 1), south ? wi.y1 : wi.y0] };
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
  const p = m.pois.find((q) => q.label === CINE.NAME && q.b !== undefined);
  const b = p && m.buildings[p.b];
  if (!b || b.gone || b.prefab < 0 || b.walkIn || b.tw < 9 || b.th < 11) return;
  const south = m.prefabs[b.prefab].rot === 0, dir = south ? 1 : -1;
  const x0 = b.tx + 1, x1 = b.tx + b.tw - 2, y0 = b.ty + 1, y1 = b.ty + b.th - 2;
  const L = cinemaLayout({ south, x0, x1, y0, y1 });
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) m.set(tx, ty, T.FLOOR);
  // the screen rooms' walls either side of the corridor (each room's door at its back, by the walkway), the wall across
  // the front of the rooms (the poster wall on its lobby side) with the corridor's mouth open
  for (let k = 0; k < CINE.ROOM_T; k++) for (const tx of [L.cc - 1, L.cc + 1]) if (k !== CINE.ROOM_T - 1) m.set(tx, L.back + dir * k, T.WALL);
  for (let tx = x0; tx <= x1; tx++) if (tx !== L.cc) m.set(tx, L.wallRow, T.WALL);
  // the door: two tiles of the front wall, in the middle
  const fy = south ? b.ty + b.th - 1 : b.ty, dc = Math.floor((x0 + x1) / 2);
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
  m.cinema = { b: b.id, poi: p.id, name: p.label, district: DISTRICTS[d] ? DISTRICTS[d].name : '', south, counter: { x: p.x, y: p.y }, rooms: L.rooms, cc: L.cc, wallRow: L.wallRow, counterRow: L.counterRow, ca: L.ca, cb: L.cb };
}
