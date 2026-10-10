// Ways over open ground (task #409): where no road goes - the wilds, a park, a beach - an ambulance drives on over the
// open ground toward its patient, and its crew walk the rest round the trees, rocks and water (ems.js). An A* over the
// tile grid in a box round the two ends.
//   groundPath(world, from, to, { van })   the way from `from` to `to`: { pts: [{x, y}] (from, the tile centres it
//       passes, straightened), len (px), reached, d (how far its end is from `to`) } - a way that can't get all the way
//       ends at the open tile nearest `to` (as near as it can get). Null when nothing is open from the start, or the
//       two ends are too far apart for the box.
//       van: room for an ambulance - no water and nothing it can't drive on (CAR_BLOCK, an embankment, a drop) on its
//       tile or the eight round it, no tree or rock within VAN_R of the tile's middle; dearer over grass, sand and
//       fields than tracks and lots. On foot: wherever a person can walk, clear of trees and rocks.
//   clearWalk(map, x0, y0, x1, y1)   a person can walk straight from one point to the other
import { T, TILE } from '../../shared/constants.js';
import { CAR_BLOCK, PED_BLOCK, WATER_T } from '../../shared/map.js';
import { dropsOf } from '../../shared/ledges.js';

const MARGIN = 18;              // tiles round the two ends the search may use
const MAX_CELLS = 200 * 200;    // the biggest box (the margin shrinks to fit two ends far apart)
const MAX_POPS = 50000;
const VAN_R = 30, FOOT_R = 9;   // px a path's tile middles keep clear of a tree's or a rock's trunk: an ambulance, a person
const COST = new Float32Array(16).fill(1);
COST[T.GRASS] = 1.35; COST[T.SAND] = 1.7; COST[T.FIELD] = 1.7; COST[T.DIRT] = 1.08;

// Tiles near the map's trees and rocks (solid props), once per map: bit 1 within VAN_R of one, bit 2 within FOOT_R.
// (A tree felled since stays marked: the way round it is only a little longer.)
const NEAR = new WeakMap();
function propMask(m) {
  let k = NEAR.get(m);
  if (k) return k;
  k = new Uint8Array(m.w * m.h);
  for (const ps of m.solidProps.values()) for (const p of ps) {
    const R = p.r + VAN_R, x0 = Math.max(m.x0, Math.floor((p.x - R) / TILE)), x1 = Math.min(m.x0 + m.w - 1, Math.floor((p.x + R) / TILE));
    const y0 = Math.max(m.y0, Math.floor((p.y - R) / TILE)), y1 = Math.min(m.y0 + m.h - 1, Math.floor((p.y + R) / TILE));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const d2 = ((tx + 0.5) * TILE - p.x) ** 2 + ((ty + 0.5) * TILE - p.y) ** 2;
      if (d2 < R * R) k[m.idx(tx, ty)] |= 1;
      if (d2 < (p.r + FOOT_R) ** 2) k[m.idx(tx, ty)] |= 2;
    }
  }
  NEAR.set(m, k);
  return k;
}

// can a person stand on tile (tx, ty)? can an ambulance's middle pass over it?
function footOk(m, tx, ty, near, drops) {
  if (!m.inside(tx, ty)) return false;
  const i = m.idx(tx, ty);
  return !PED_BLOCK[m.tiles[i]] && !(m.lvl0Block && m.lvl0Block[i] === 1) && !(near[i] & 2) && !(drops && drops.has(i));
}
function vanOk(m, tx, ty, near, drops) {
  if (!m.inside(tx - 1, ty - 1) || !m.inside(tx + 1, ty + 1) || near[m.idx(tx, ty)] & 1) return false;
  for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
    const i = m.idx(x, y), t = m.tiles[i];
    if (CAR_BLOCK[t] || WATER_T[t] || (m.lvl0Block && m.lvl0Block[i] === 1) || (drops && drops.has(i))) return false;
  }
  return true;
}

export function clearWalk(m, x0, y0, x1, y1) {
  const near = propMask(m), drops = dropsOf(m), L = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(L / 12);
  for (let k = 1; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
    if (!footOk(m, Math.floor(x / TILE), Math.floor(y / TILE), near, drops)) return false;
  }
  return true;
}

// the search's arrays: made once at the biggest box and kept
let B = null;
const bufs = () => B || (B = { g: new Float32Array(MAX_CELLS), from: new Int32Array(MAX_CELLS), st: new Uint8Array(MAX_CELLS), okc: new Uint8Array(MAX_CELLS), hf: new Float32Array(MAX_CELLS * 3), hi: new Int32Array(MAX_CELLS * 3) });

export function groundPath(world, a, b, opts = {}) {
  const m = world.map, van = !!opts.van, near = propMask(m), drops = dropsOf(m);
  const ax = Math.floor(a.x / TILE), ay = Math.floor(a.y / TILE), bx = Math.floor(b.x / TILE), by = Math.floor(b.y / TILE);
  let mg = MARGIN, x0, y0, w, h;
  for (;;) {
    x0 = Math.max(m.x0, Math.min(ax, bx) - mg); y0 = Math.max(m.y0, Math.min(ay, by) - mg);
    w = Math.min(m.x0 + m.w - 1, Math.max(ax, bx) + mg) - x0 + 1; h = Math.min(m.y0 + m.h - 1, Math.max(ay, by) + mg) - y0 + 1;
    if (w * h <= MAX_CELLS) break;
    if ((mg -= 4) < 2) return null;
  }
  const { g, from, st, okc, hf, hi } = bufs(), N = w * h, cap = hf.length;
  st.fill(0, 0, N); okc.fill(0, 0, N);
  const cell = (tx, ty) => (ty - y0) * w + (tx - x0);
  // open ground? (worked out once a tile, inside the box)
  const ok = (tx, ty) => {
    if (tx < x0 || ty < y0 || tx >= x0 + w || ty >= y0 + h) return van ? vanOk(m, tx, ty, near, drops) : footOk(m, tx, ty, near, drops);
    const j = cell(tx, ty);
    if (!okc[j]) okc[j] = (van ? vanOk(m, tx, ty, near, drops) : footOk(m, tx, ty, near, drops)) ? 1 : 2;
    return okc[j] === 1;
  };
  // st: 0 not looked at, 1 open (in the heap), 2 done, 3 blocked
  const hcost = (tx, ty) => { const dx = Math.abs(tx - bx), dy = Math.abs(ty - by); return (dx + dy - 0.586 * Math.min(dx, dy)) * 1.15; };
  let n = 0;
  const push = (f, c) => { if (n >= cap) return; let k = n++; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hf[k] = hf[p]; hi[k] = hi[p]; k = p; } hf[k] = f; hi[k] = c; };
  const pop = () => { const top = hi[0], lf = hf[--n], li = hi[n]; let k = 0; for (;;) { const l = 2 * k + 1; if (l >= n) break; const r = l + 1, q = r < n && hf[r] < hf[l] ? r : l; if (hf[q] >= lf) break; hf[k] = hf[q]; hi[k] = hi[q]; k = q; } hf[k] = lf; hi[k] = li; return top; };
  const s0 = cell(ax, ay), goal = cell(bx, by);
  g[s0] = 0; from[s0] = -1; st[s0] = 1; push(hcost(ax, ay), s0);
  let best = s0, bestH = hcost(ax, ay), pops = 0, reached = false;
  while (n && pops++ < MAX_POPS) {
    const c = pop();
    if (st[c] === 2) continue;
    st[c] = 2;
    const tx = x0 + (c % w), ty = y0 + ((c / w) | 0), hc = hcost(tx, ty);
    if (hc < bestH) { bestH = hc; best = c; }
    if (c === goal) { reached = true; best = c; break; }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < x0 || ny < y0 || nx >= x0 + w || ny >= y0 + h) continue;
      const j = cell(nx, ny);
      if (st[j] === 2 || st[j] === 3) continue;
      if (j !== goal && !ok(nx, ny)) { st[j] = 3; continue; }
      if (dx && dy && (!ok(tx + dx, ty) || !ok(tx, ty + dy))) continue;   // (no cutting a corner)
      const cj = g[c] + (dx && dy ? 1.414 : 1) * (van ? COST[m.tileAt(nx, ny)] : 1);
      if (st[j] === 1 && cj >= g[j]) continue;
      g[j] = cj; from[j] = c; st[j] = 1; push(cj + hcost(nx, ny), j);
    }
  }
  // the tile centres back from the end, then straightened: from each point on to the farthest one in a clear line
  const tiles = [];
  for (let c = best; c >= 0; c = from[c]) { tiles.push({ x: (x0 + (c % w) + 0.5) * TILE, y: (y0 + ((c / w) | 0) + 0.5) * TILE }); if (c === s0) break; }
  tiles.reverse();
  tiles[0] = { x: a.x, y: a.y };
  if (reached) tiles[tiles.length - 1] = { x: b.x, y: b.y };
  const line = (p, q) => {
    const L = Math.hypot(q.x - p.x, q.y - p.y), k = Math.ceil(L / 12);
    for (let i = 1; i < k; i++) { const x = p.x + (q.x - p.x) * i / k, y = p.y + (q.y - p.y) * i / k; if (!ok(Math.floor(x / TILE), Math.floor(y / TILE))) return false; }
    return true;
  };
  const pts = [tiles[0]];
  for (let at = 0; at < tiles.length - 1;) {
    let next = at + 1;
    for (let k = Math.min(tiles.length - 1, at + 40); k > at + 1; k--) if (line(tiles[at], tiles[k])) { next = k; break; }
    pts.push(tiles[next]); at = next;
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const e = pts[pts.length - 1];
  return { pts, len, reached, d: Math.hypot(b.x - e.x, b.y - e.y) };
}
