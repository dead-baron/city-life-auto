// A spatial index over a list of points {x, y} (px): a grid of buckets, so a query looks only at the cells near it.
// The sea's sample points (map.seaPoints, map.offshore: every 10 tiles over the frame's open water) are 190,000 each
// at World v3's frame (docs/WORLD-V3.md 8.2); the boats (systems/boats.js) and the deep-sea charters (systems/jobs.js)
// ask for the ones near a place many times a minute.
//   pointGrid(list) -> the list's grid (made once per list, kept while the list lives)
//   grid.within(x, y, rMin, rMax) -> the points with rMin <= d <= rMax, in the list's order (so a pick by index from
//     it is the pick the whole list's filter gave)
//   grid.any(x, y, r) -> is any point within r (d < r)
//   grid.nearest(x, y, minD) -> the nearest point further than minD (the first in the list's order of equals), or null
const CELL = 1024;
const GRIDS = new WeakMap();

export function pointGrid(list) {
  let g = GRIDS.get(list);
  if (!g || g.n !== list.length) { g = build(list); GRIDS.set(list, g); }
  return g;
}

function build(list) {
  const cells = new Map();
  let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const p = list[i], cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL), k = key(cx, cy);
    let b = cells.get(k);
    if (!b) cells.set(k, (b = []));
    b.push(i);
    if (cx < cx0) cx0 = cx; if (cx > cx1) cx1 = cx; if (cy < cy0) cy0 = cy; if (cy > cy1) cy1 = cy;
  }
  const g = { n: list.length, list, cells, cx0, cy0, cx1, cy1 };
  g.within = (x, y, rMin, rMax) => within(g, x, y, rMin, rMax);
  g.any = (x, y, r) => any(g, x, y, r);
  g.nearest = (x, y, minD) => nearest(g, x, y, minD);
  return g;
}
const key = (cx, cy) => (cy + 32768) * 65536 + (cx + 32768);

// the indices of the points in the cells the square (x +- r, y +- r) touches
function gather(g, x, y, r, out) {
  const a = Math.max(g.cx0, Math.floor((x - r) / CELL)), b = Math.min(g.cx1, Math.floor((x + r) / CELL));
  const c = Math.max(g.cy0, Math.floor((y - r) / CELL)), d = Math.min(g.cy1, Math.floor((y + r) / CELL));
  for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) { const l = g.cells.get(key(cx, cy)); if (l) for (const i of l) out.push(i); }
  return out;
}

function within(g, x, y, rMin, rMax) {
  const idx = gather(g, x, y, rMax, []).sort((p, q) => p - q), out = [];
  for (const i of idx) { const p = g.list[i], d = Math.hypot(p.x - x, p.y - y); if (d >= rMin && d <= rMax) out.push(p); }
  return out;
}

function any(g, x, y, r) {
  const a = Math.max(g.cx0, Math.floor((x - r) / CELL)), b = Math.min(g.cx1, Math.floor((x + r) / CELL));
  const c = Math.max(g.cy0, Math.floor((y - r) / CELL)), d = Math.min(g.cy1, Math.floor((y + r) / CELL));
  for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) {
    const l = g.cells.get(key(cx, cy));
    if (l) for (const i of l) { const p = g.list[i]; if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r && Math.hypot(p.x - x, p.y - y) < r) return true; }
  }
  return false;
}

// ring by ring of cells out from (x, y), until the rings left are all further than the best found
function nearest(g, x, y, minD) {
  if (!g.n) return null;
  const ccx = Math.floor(x / CELL), ccy = Math.floor(y / CELL);
  const far = Math.max(Math.abs(ccx - g.cx0), Math.abs(ccx - g.cx1), Math.abs(ccy - g.cy0), Math.abs(ccy - g.cy1));
  let best = null, bd = Infinity, bi = -1, stop = Infinity;
  for (let r = 0; r <= far && r <= stop; r++) {
    for (let cy = ccy - r; cy <= ccy + r; cy++) for (let cx = ccx - r; cx <= ccx + r; cx++) {
      if (Math.max(Math.abs(cx - ccx), Math.abs(cy - ccy)) !== r) continue;
      const l = g.cells.get(key(cx, cy));
      if (!l) continue;
      for (const i of l) {
        const p = g.list[i], d = Math.hypot(p.x - x, p.y - y);
        if (d > minD && (d < bd || (d === bd && i < bi))) { best = p; bd = d; bi = i; }
      }
    }
    if (best) stop = Math.min(stop, Math.floor(bd / CELL) + 1);   // (a cell in ring r' is at least (r' - 1) cells away)
  }
  return best;
}
