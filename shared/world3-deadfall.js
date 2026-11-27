// The woods' deadfall (the art pass, 2026-11-25; the plan's A3 - "the wild logs: 13 in the whole world"). Counted that
// day: 110 fallen logs in the world, 97 of them a made place's - a fire ring's seats, a camp's, a stump clearing's;
// Highland Woods' 33,000 pines, firs, cedars and oaks and Granite Peaks' 3,400 mountain trees stood over a floor with
// no fallen wood on it. A log lies among the trees by rule: about one to forty trees, by cells of `cell` tiles - where
// the trees stand thicker, more -, on open grass with a tree close by, off every path, road, water and made place,
// no two within `apart` tiles, and none where a tree to its south would be drawn over it; mossy, at any angle, 120 to
// 220 px long and thicker than a fire ring's seat. The redwoods have their own fallen giants
// ('rwlog', world3-redwoods.js) and are not counted here. The ground bake grows ferns, toadstools and the licorice
// fern along a log (statics.js coverItems), so nothing is planted with it.
// For the whole-world build only (shared/world3-world.js, after the found places and the falls' feet). Deterministic:
// integer hashes; the trig is shared/dmath.js's.
import { TILE, T } from './constants.js';
import { dcos, dsin } from './dmath.js';

const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const DEADFALL = {
  by: { 47: 40, 48: 40 },     // district: trees to a log (Highland Woods, Granite Peaks). A cell of a hundred tiles holds 5 to 20 trees.
  cell: 10,                   // tiles: the cell the trees are counted in
  min: 5,                     // trees in a cell before a log can lie there
  apart: 9,                   // tiles between two logs at least
  off: 2,                     // tiles kept clear of a path, a road, water, anything built
  tree: 3,                    // a tree within this many tiles: it lies among them
  tries: 60,
  crown: 190, side: 44,       // px: a tree this near to the south of a log, this near to its side, is drawn over it
};
const SOFT = new Set([T.GRASS]);
export function deadfall3(m, H3) {
  const out = { logs: 0, cells: 0, by: {}, picked: 0, no: { open: 0, apart: 0, tree: 0, taken: 0, hidden: 0 } };
  if (!H3 || !H3.addProp) return out;
  const S = DEADFALL, W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, C = S.cell;
  // the trees by cell, and everything that stands anywhere by 64 px (a log lies on nothing)
  const cells = new Map(), G = 64, grid = new Map();
  for (const p of m.props) {
    if (!p || p.t === 'painted') continue;
    const k = Math.floor(p.x / G) * 65536 + Math.floor(p.y / G); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(p);
    if (!/^tree_/.test(p.t)) continue;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (!inF(tx, ty) || !S.by[m.dist[ty * W + tx]]) continue;
    const ck = Math.floor(tx / C) * 65536 + Math.floor(ty / C); let c = cells.get(ck); if (!c) cells.set(ck, (c = [])); c.push(p);
  }
  const taken = (x, y, r) => { for (let gy = Math.floor((y - r) / G); gy <= Math.floor((y + r) / G); gy++) for (let gx = Math.floor((x - r) / G); gx <= Math.floor((x + r) / G); gx++) for (const p of grid.get(gx * 65536 + gy) || []) if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) return true; return false; };
  // (open: its own tile and those beside it grass, nobody's ground; out to `off` tiles no path, road, water or wall)
  const open = (tx, ty) => {
    for (let dy = -S.off; dy <= S.off; dy++) for (let dx = -S.off; dx <= S.off; dx++) {
      if (!inF(tx + dx, ty + dy)) return false;
      const i = (ty + dy) * W + tx + dx, near = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
      if (near ? (!SOFT.has(m.tiles[i]) || !m.land[i] || m.reserve[i] || (m.bld && m.bld[i] >= 0)) : !(SOFT.has(m.tiles[i]) || m.tiles[i] === T.SAND)) return false;
    }
    return true;
  };
  const hidden = (X, Y, half) => { for (let gy = Math.floor(Y / G); gy <= Math.floor((Y + S.crown) / G); gy++) for (let gx = Math.floor((X - half - S.side) / G); gx <= Math.floor((X + half + S.side) / G); gx++) for (const p of grid.get(gx * 65536 + gy) || []) if (/^(tree_|redwood)/.test(p.t) && p.y > Y + 4 && p.y < Y + S.crown && Math.abs(p.x - X) < half + S.side) return true; return false; };
  const laid = [];
  for (const [ck, trees] of [...cells.entries()].sort((a, b) => a[0] - b[0])) {
    if (trees.length < S.min) continue;
    out.cells++;
    const cx = Math.floor(ck / 65536), cy = ck % 65536, d0 = m.dist[Math.min(HH - 1, cy * C) * W + Math.min(W - 1, cx * C)], per = S.by[m.dist[Math.floor(trees[0].y / TILE) * W + Math.floor(trees[0].x / TILE)]] || S.by[d0];
    if (!per || hh(cx, cy, 9101) >= trees.length / per) continue;
    out.picked++;
    for (let k = 0; k < S.tries; k++) {
      const tx = cx * C + Math.floor(hh(cx * 31 + k, cy, 9103) * C), ty = cy * C + Math.floor(hh(cx, cy * 31 + k, 9105) * C);
      if (!inF(tx, ty) || !S.by[m.dist[ty * W + tx]] || !open(tx, ty)) { out.no.open++; continue; }
      if (laid.some(([x, y]) => Math.abs(x - tx) < S.apart && Math.abs(y - ty) < S.apart)) { out.no.apart++; continue; }
      const X = tx * TILE + 16, Y = ty * TILE + 16;
      if (!trees.some((p) => Math.abs(p.x - X) < S.tree * TILE && Math.abs(p.y - Y) < S.tree * TILE)) { out.no.tree++; continue; }
      const a = Math.round(hh(tx, ty, 9107) * 314) / 100, len = 120 + 20 * Math.floor(hh(tx, ty, 9109) * 6), ca = dcos(a), sa = dsin(a);
      if ([-0.45, -0.22, 0, 0.22, 0.45].some((q) => taken(X + ca * len * q, Y + sa * len * q, 16))) { out.no.taken++; continue; }
      // (in sight: no tree standing south of it whose trunk and crown would be drawn over it - seen 11-25, the first
      // logs lay under the firs' boughs, not one to be found in a render)
      if (hidden(X, Y, Math.abs(ca) * len / 2)) { out.no.hidden++; continue; }
      const p = H3.addProp(m, 'log', X, Y, 0, { a, len, moss: 1, wild: 1 });
      { const gk = Math.floor(X / G) * 65536 + Math.floor(Y / G); let ga = grid.get(gk); if (!ga) grid.set(gk, (ga = [])); ga.push(p || { x: X, y: Y }); }
      if (m.addSolidProp) for (const q of [-0.4, -0.2, 0, 0.2, 0.4]) m.addSolidProp(Math.round(X + ca * len * q), Math.round(Y + sa * len * q), 11);
      laid.push([tx, ty]); out.logs++; const d = m.dist[ty * W + tx]; out.by[d] = (out.by[d] || 0) + 1;
      break;
    }
  }
  return out;
}
