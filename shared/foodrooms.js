// The food places you walk into, laid out (IN8, the owner's concept docs/art-v2/targets/IN8_diner-fast-food-restaurant.png):
// the coffee walk-ins (shared/map.js WALK_IN 'coffee') are fitted out by the lot they're in -
//   diner       (the diner lots, the hero corner's): red booths along the side wall, stools along the counter, a jukebox
//   restaurant  (the restaurant lots, the Garden Bistro, Cafe Rouge): tables with cloths and two chairs, the host stand
//               inside the door, a runner from the door to it
//   fastfood    (the cafes and the strip-mall units): the queue lane up to the till, the drinks machine, small tables
// Pure layout in world px over the server's room (the counter row, the doorway, the walkable floor stay as shared/map.js
// buildInteriors makes them): the art draws it (client/art2/game/statics.js foodRoom, client/render/roomart.js) and the
// people sat at the tables sit where it says (server/systems/activities.js 'diners'). Only rooms with the door on the
// south side (the counter at the back) are fitted; others keep the plain counter and shelves.
export const FOOD_STYLE = { diner: 'diner', rest1: 'restaurant', greenbistro: 'restaurant', redawning: 'restaurant' };
export const foodStyle = (bkind) => FOOD_STYLE[bkind] || 'fastfood';

// seats: { x, y, a } - where someone sits and the way they face (a: radians, 0 east, PI/2 south)
export function foodLayout(b, u, TILE) {
  const wi = b && b.walkIn;
  if (!wi || !wi.south || !u || u.kind !== 'coffee') return null;
  const style = foodStyle(b.kind);
  const X0 = u.x0 * TILE, X1 = (u.x1 + 1) * TILE, W = X1 - X0, back = wi.y0 * TILE, cy = u.counterRow * TILE;
  const Ya = cy + TILE, Yb = (wi.y1 + 1) * TILE, dx = u.door.tx * TILE, dw = (u.door.w || 2) * TILE, dc = dx + dw / 2;
  const tillX = Math.round((X0 + X1) / 2), side = dc > (X0 + X1) / 2 ? -1 : 1;   // (side: -1 the booths / the machine on the west wall, away from the door)
  // (v: the place's own colours, by its building - the diner's booths and checkers, the fast food's chairs: statics.js FOOD_V)
  const L = { style, v: ((b.tx | 0) * 7 + (b.ty | 0) * 13 + u.x0 * 3) % 3, X0, X1, back, cy, Ya, Yb, dc, dx, dw, tillX, side, booths: [], stools: [], tables: [], queue: null, drinks: null, host: null, jukebox: null, cook: null };
  const inDoorway = (x0, x1, y1) => y1 > Yb - 44 && x1 > dx - 8 && x0 < dx + dw + 8;   // (the way in from the door kept clear)
  const free = (x0, y0, x1, y1) => !inDoorway(x0, x1, y1) && x0 >= X0 + 2 && x1 <= X1 - 2 && y0 >= Ya + 2 && y1 <= Yb - 2;
  // the cook at the kitchen line along the back wall, west of the till (the clerk's at the till: shared/map.js)
  if (cy - back >= TILE && W >= 4 * TILE) L.cook = { x: X0 + Math.min(40, W * 0.22), y: cy - TILE / 2, a: -Math.PI / 2 };
  if (style === 'diner') {
    const bx0 = side < 0 ? X0 + 4 : X1 - 40, bx1 = bx0 + 36;
    for (let y = Ya + 8; y + 34 <= Yb - 4; y += 40) {
      if (!free(bx0, y, bx1, y + 34)) continue;
      L.booths.push({ x0: bx0, x1: bx1, y0: y, y1: y + 34, seats: [{ x: bx0 + 18, y: y + 5, a: Math.PI / 2 }, { x: bx0 + 18, y: y + 29, a: -Math.PI / 2 }] });
    }
    const sx0 = side < 0 ? bx1 + 14 : X0 + 14, sx1 = side < 0 ? X1 - TILE - 4 : bx0 - 14;
    for (let x = sx0; x + 10 <= sx1; x += 18) L.stools.push({ x: x + 5, y: Ya + 7, a: -Math.PI / 2 });
    const jx = side < 0 ? X1 - 24 : X0 + 4;
    if (free(jx, Yb - 20, jx + 20, Yb - 6) && Yb - Ya > 90) L.jukebox = { x0: jx, y0: Yb - 20, x1: jx + 20, y1: Yb - 6 };
  } else if (style === 'fastfood') {
    const qy1 = Math.min(Ya + 64, Yb - 40);
    if (qy1 - Ya >= 24) L.queue = { x0: tillX - 15, x1: tillX + 15, y0: Ya + 3, y1: qy1 };
    const mx = side < 0 ? X0 + 4 : X1 - 24;
    if (free(mx, Ya + 2, mx + 20, Ya + 14) && (!L.queue || mx + 20 < L.queue.x0 - 4 || mx > L.queue.x1 + 4)) L.drinks = { x0: mx, y0: Ya + 2, x1: mx + 20, y1: Ya + 14 };
    for (let y = Ya + 44; y + 16 <= Yb - 8; y += 46) for (let x = X0 + 22; x + 44 <= X1 - 4; x += 58) {
      const t = { x0: x + 13, x1: x + 31, y0: y, y1: y + 16 };
      if (!free(x, y - 2, x + 44, y + 18) || (L.queue && x + 44 > L.queue.x0 - 4 && x < L.queue.x1 + 4 && y < L.queue.y1 + 6) || (L.drinks && y < L.drinks.y1 + 8 && x + 44 > L.drinks.x0 && x < L.drinks.x1)) continue;
      t.seats = [{ x: x + 6, y: y + 8, a: 0 }, { x: x + 38, y: y + 8, a: Math.PI }];
      L.tables.push(t);
    }
  } else {
    const hx = dx - 18 >= X0 + 6 ? dx - 18 : dx + dw + 6;
    if (Yb - Ya >= 70) L.host = { x0: hx, y0: Yb - 34, x1: hx + 12, y1: Yb - 24 };
    for (let y = Ya + 20; y + 22 <= Yb - 10; y += 52) for (let x = X0 + 10; x + 50 <= X1 - 4; x += 60) {
      const t = { x0: x + 14, x1: x + 36, y0: y, y1: y + 22, cloth: true };
      if (!free(x, y - 2, x + 50, y + 24) || (L.host && x + 50 > L.host.x0 - 6 && x < L.host.x1 + 6 && y + 24 > L.host.y0 - 6)) continue;
      t.seats = [{ x: x + 6, y: y + 11, a: 0 }, { x: x + 44, y: y + 11, a: Math.PI }];
      L.tables.push(t);
    }
  }
  return L;
}
// every seat in the room (the booths', the tables', the stools'), for the people eating there
export function foodSeats(L) {
  const out = [];
  if (!L) return out;
  for (const q of L.booths) out.push(q.seats);
  for (const q of L.tables) out.push(q.seats);
  return out;
}
