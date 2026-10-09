// The cell block at the back of every police station (task #362 part 3; the owner's note 2026-10-08 19:52): two to four
// cells along the back wall of the station's walk-in, each with a barred front, a locked barred door, a steel bench
// and a toilet; a corridor in front of them for the officers; then the front desk's counter (moved forward to make
// room, its gap at the east end the way through) and the lobby.
//
// Real map geometry: the bars are rows of small solid props (nobody walks through them; bullets stop on them -
// CityMap.rayTiles - but they don't block sight), a cell's door is the bars across its middle (props switched off
// while it stands open). Built once with the world (map.js buildCity, after buildInteriors): integer arithmetic only,
// nothing here may differ between JS engines (shared/dmath.js).
//
//   m.cellBlocks[i]: { poi, south, x0, x1, y0, y1 (px: the cells and the corridor - nobody there can hurt or be hurt),
//     corridorY, gap: { x, lobbyY }, door: { x, inY, outY } (the station's front door), bars: [[x0, y0, x1, y1], ...],
//     cells: [{ x0, x1, y0, y1 (px: where you can stand in it), door: { x, y, props: [solid prop refs] },
//               bench: { x, y, a }, toilet: { x, y, a }, front: y (where you stand holding the bars), a (facing out) }] }
import { TILE, T } from './constants.js';
export { CELL_CAP } from './rules.js';   // people a cell takes

export const BAR_R = 4;          // a bar's solid radius (px)
const BAR_STEP = 9;              // bar to bar: a person (radius 11) can't squeeze between
const DOOR_HALF = 16;            // a cell door is one tile wide
const PED_R = 11;

export function buildCellBlocks(m) {
  m.cellBlocks = [];
  for (const bid of m.walkIns || []) {
    const b = m.buildings[bid], wi = b.walkIn;
    for (const u of wi.units) if (u.kind === 'police') {
      const blk = cellBlock(m, wi, u);
      if (blk) { u.cells = m.cellBlocks.length; m.cellBlocks.push(blk); }
    }
  }
}

function cellBlock(m, wi, u) {
  const south = wi.south, D = wi.y1 - wi.y0 + 1, Wt = u.x1 - u.x0 + 1;
  if (D < 5 || Wt < 8) return null;
  const cd = D >= 10 ? 3 : 2, corr = D >= 7 ? 2 : 1, kc = cd + corr;   // rows (from the back wall): cells, corridor, counter
  const dir = south ? 1 : -1;
  const back = south ? wi.y0 * TILE : (wi.y1 + 1) * TILE;               // the back wall's inner face (px)
  const Y = (l) => back + dir * l;                                       // px: l px out from the back wall
  // the counter moves forward to make room (the gap at the east end stays the way round it)
  for (let tx = u.x0; tx <= u.x1; tx++) if (m.tileAt(tx, u.counterRow) === T.COUNTER) m.set(tx, u.counterRow, T.FLOOR);
  const cr = south ? wi.y0 + kc : wi.y1 - kc;
  for (let tx = u.x0; tx <= u.x1; tx++) if (Wt < 4 || tx !== u.x1) m.set(tx, cr, T.COUNTER);
  u.counterRow = cr;
  u.clerk.y = (cr - dir + 0.5) * TILE;
  const poi = m.pois[u.poi];
  if (poi) poi.y = (cr + dir + 0.55) * TILE;
  // the cells, from the west end: two to four, four or five tiles wide; what's left over at the east end is the
  // officers' corner by the counter's gap
  const n = Math.max(2, Math.min(4, Math.floor(Wt / 4))), w = Math.min(5, Math.floor(Wt / n));
  const front = cd * TILE - 3;                                            // the bars: 3 px into the cells' front row
  const bars = [], cells = [];
  const bar = (x, y, list) => { const e = m.addSolidProp(x, y, BAR_R); if (list) list.push(e); return e; };
  const yb = Y(front), y4 = Y(4);
  for (let i = 0; i < n; i++) {
    const cx0 = (u.x0 + i * w) * TILE, cx1 = (u.x0 + (i + 1) * w) * TILE, dcx = (cx0 + cx1) / 2;
    const door = { x: dcx, y: yb, props: [] };
    for (let x = cx0 + (i ? BAR_STEP : 4); x <= cx1 - 2; x += BAR_STEP) bar(x, yb, Math.abs(x - dcx) <= DOOR_HALF ? door.props : null);
    bars.push([cx0, yb, cx1, yb]);
    const inner = { x0: cx0 + (i ? BAR_R + PED_R : PED_R), x1: cx1 - BAR_R - PED_R, l0: PED_R, l1: front - BAR_R - PED_R };
    cells.push({
      x0: inner.x0, x1: inner.x1, y0: Math.min(Y(inner.l0), Y(inner.l1)), y1: Math.max(Y(inner.l0), Y(inner.l1)),
      door, a: south ? Math.PI / 2 : -Math.PI / 2,
      bench: { x: cx0 + Math.round((cx1 - cx0) * 0.36), y: Y(15), a: south ? Math.PI / 2 : -Math.PI / 2 },
      toilet: { x: cx1 - 17, y: Y(15), a: south ? Math.PI / 2 : -Math.PI / 2 },
      front: Y(front - BAR_R - PED_R - 1),
    });
  }
  // the partitions between the cells (bars too: you see the next cell along), and the last cell's east side
  const spare = Wt - n * w;
  for (let i = 1; i <= n; i++) {
    if (i === n && !spare) break;
    const x = (u.x0 + i * w) * TILE;
    for (let l = 4; l <= front; l += BAR_STEP) bar(x, Y(l));
    bars.push([x, Math.min(y4, yb), x, Math.max(y4, yb)]);
  }
  const corrMid = Math.round((front + BAR_R + PED_R + kc * TILE - PED_R) / 2);
  const fy = u.door.ty, doorX = (u.door.tx + 1) * TILE;
  const ya = Y(0), yc = Y(kc * TILE);
  return {
    poi: u.poi, south, x0: u.x0 * TILE, x1: (u.x1 + 1) * TILE, y0: Math.min(ya, yc), y1: Math.max(ya, yc),
    corridorY: Y(corrMid), gap: { x: (u.x1 + 0.5) * TILE, lobbyY: Y((kc + 1) * TILE + 16) },
    door: { x: doorX, inY: (fy - dir + 0.5) * TILE, outY: (fy + dir * 1.6 + 0.5) * TILE },
    bars, cells,
  };
}

// The cell block (and the cell in it) a point is in, or null: { b (index), blk, c (cell index or -1) }
export function cellBlockAt(m, x, y) {
  const list = m.cellBlocks;
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (x < k.x0 || x > k.x1 || y < k.y0 || y > k.y1) continue;
    let c = -1;
    for (let j = 0; j < k.cells.length; j++) if (inCellRect(k.cells[j], x, y, 6)) { c = j; break; }
    return { b: i, blk: k, c };
  }
  return null;
}
export const inCellRect = (c, x, y, slack = 0) => x >= c.x0 - slack && x <= c.x1 + slack && y >= c.y0 - slack && y <= c.y1 + slack;

// Bullets stop on the bars (CityMap.rayTiles): how far along the segment the first bar is (0..1), 1 for none.
export function barsRay(m, x1, y1, x2, y2) {
  const list = m.cellBlocks;
  let best = 1;
  const lx = Math.min(x1, x2), hx = Math.max(x1, x2), ly = Math.min(y1, y2), hy = Math.max(y1, y2);
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (hx < k.x0 || lx > k.x1 || hy < k.y0 - 8 || ly > k.y1) continue;
    for (const s of k.bars) {
      const t = segT(x1, y1, x2, y2, s[0], s[1], s[2], s[3]);
      if (t < best) best = t;
    }
  }
  return best;
}
// where segment p (0..1) crosses segment q, or 1
function segT(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
  if (den === 0) return 1;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? Math.max(0, t - 0.01) : 1;
}
