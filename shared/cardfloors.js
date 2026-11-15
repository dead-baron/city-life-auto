// The places where a game is dealt that a page can watch (the owner, 2026-11-14): every casino's gaming floor
// (shared/casinorooms.js), every bar fitted out with a card table (shared/shoprooms.js 'cards'), and the Rusty Spur's card
// table in its card room (where client/art2/game/statics.js roadhouseRoom draws it). The same list on the server
// (server/systems/casinofloor.js: who sits where, what's dealt) and on the page (client/casinoview.js: drawn live).
//   floorsOf(map, TILE) -> [floor]; floorByKey(map, key, TILE) -> floor | null (the page: only the one it's told about)
//   floor: { key, b (building), poi, casino, tier, tables [gameTable], slots [slotMachine], x0, y0, x1, y1, cx, cy }
import { casinoRoom, cardTableOf, FELT_H } from './casinorooms.js';
import { shopRoom } from './shoprooms.js';

const E = 0, W = 3.14, N = -1.57, S = 1.57;
// the Spur's card table: the round baize table and its four chairs (roadhouseRoom's card room, 80% along the floor)
function spurTable(map, TILE) {
  const R = map.roadhouse, b = R && map.buildings[R.b], wi = b && b.walkIn, u = wi && wi.units.find((q) => q.kind === 'roadhouse');
  if (!u) return null;
  const ox = b.tx * TILE, oy = b.ty * TILE, ux0 = (Math.max(u.x0, b.tx) - b.tx) * TILE, ux1 = (Math.min(u.x1, b.tx + b.tw - 1) - b.tx + 1) * TILE;
  const Ya = (u.counterRow - b.ty) * TILE + 44, Yb = (wi.y1 - b.ty + 1) * TILE - 6, mid = (Ya + Yb) / 2, W0 = ux1 - ux0 - 72;
  if (Yb - Ya < 60 || W0 < 300) return null;
  const c0 = ox + ux0 + 36 + W0 * 0.8, x0 = Math.round(c0 + 10), y0 = Math.round(oy + mid - 18), x1 = x0 + 52, y1 = y0 + 36, cx = x0 + 26, cy = y0 + 18;
  const seats = [[x0 - 3, cy + 1, E], [x1 + 9, cy + 1, W], [cx - 1, y0 - 9, S], [cx - 1, y1 + 9, N]].map(([x, y, a]) => ({ x: Math.round(x), y: Math.round(y), a }));
  const cards = [[x0 + 8, cy], [x1 - 8, cy], [cx, y0 + 6], [cx, y1 - 6]].map(([x, y]) => ({ x: Math.round(x), y: Math.round(y) }));
  return { key: 'spur', b: R.b, poi: u.poi, casino: false, tier: 1, tables: [{ i: 0, g: 'pk', x0, y0, x1, y1, cx, cy, h: FELT_H, seats, cards, dealer: null, dc: { x: cx, y: cy } }], slots: [], x0, y0, x1, y1, cx, cy };
}
const room = (key, bi, u, casino, tier, tables, slots, X0, Y0, X1, Y1) => ({ key, b: bi, poi: u.poi, casino, tier, tables, slots, x0: X0, y0: Y0, x1: X1, y1: Y1, cx: (X0 + X1) / 2, cy: (Y0 + Y1) / 2 });
function floorOf(map, b, bi, u, TILE) {
  if (u.casino) { const R = casinoRoom(b, u, TILE); return R && room(`c${bi}`, bi, u, true, R.tier, R.tables, R.slots, R.X0, R.Y0, R.X1, R.Y1); }
  if (u.kind === 'coffee' || u.kind === 'club' || u.kind === 'roadhouse') return null;
  const R = shopRoom(b, u, TILE, map), P = R ? R.pieces.filter((p) => p.t === 'cards') : [];
  return P.length ? room(`k${bi}:${u.x0}`, bi, u, false, 1, P.map((p, i) => cardTableOf(p, i)), [], R.X0, R.Ya, R.X1, R.Yb) : null;
}
const ALL = new WeakMap();
export function floorsOf(map, TILE) {
  let L = ALL.get(map);
  if (L) return L;
  L = [];
  (map.buildings || []).forEach((b, bi) => { if (b && b.walkIn) for (const u of b.walkIn.units) { const F = floorOf(map, b, bi, u, TILE); if (F) L.push(F); } });
  const sp = map.roadhouse ? spurTable(map, TILE) : null;
  if (sp) L.push(sp);
  ALL.set(map, L);
  return L;
}
const ONE = new WeakMap();
export function floorByKey(map, key, TILE) {
  let C = ONE.get(map);
  if (!C) ONE.set(map, (C = new Map()));
  if (C.has(key)) return C.get(key);
  let F = null;
  if (key === 'spur') F = map.roadhouse ? spurTable(map, TILE) : null;
  else {
    const m = /^([ck])(\d+)(?::(-?\d+))?$/.exec(key), bi = m ? +m[2] : -1, b = bi >= 0 ? map.buildings[bi] : null;
    const u = b && b.walkIn && b.walkIn.units.find((q) => (m[1] === 'c' ? !!q.casino : q.x0 === +m[3]));
    F = u ? floorOf(map, b, bi, u, TILE) : null;
  }
  if (F) C.set(key, F);   // (not kept when missing: the page's window may not have the building yet)
  return F;
}
