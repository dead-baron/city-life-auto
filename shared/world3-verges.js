// Willow Valley's countryside by hand, part 1 (the nature program, 2026-10-20; the handcraft research's 4.4 and the
// concepts NT1-D, SC3-E, D13 and W1: "the county roads ... poles one side"; "a broad gravel point bar ... a cut bank
// with reeds"; "riverside willows"):
// - the river banks: the farm fields were laid as boxes and the rivers through them after, so the wheat and the
//   furrows ran right to the water's edge, cut off square by it. Now a green bank runs between every field and the
//   water it meets - lush grass and reeds three tiles deep, a willow leaning over the water now and then - and the crop
//   stops at it.
// - the power lines: wooden poles along the valley's county roads, one side, wired pole to pole, the line swinging
//   over the road now and then (the old countryside's lines ran only along the few roads drawn as country lanes:
//   shared/countryside.js buildPowerLines). Never in a town, on a bridge, in the water or in a yard.
// - (part 2, 2026-10-21) the fields kept square where the valley meets the desert or the woods: they stopped at its
//   edge tile by tile, a staircase of crop into the sand; now each is cut back to a straight edge. And the same where
//   a green bank cut into a field along a slanting river: a straight edge and a grass headland.
// - (part 2) the farm lanes: the farmsteads stood in their meadows with no way in from the road. Now a lane runs from
//   each farmyard to the nearest road over open ground, round the field edges - two dirt wheel ruts with a strip of
//   grass between (concepts NT1-D, D13: "farm lanes are dirt with a grass centre strip ... meet the county road through
//   a field gate with a dirt apron") - its gateposts and a short rail fence either side where it meets the road, a
//   mailbox by them.
// For the whole-world build only (shared/world3-world.js's done hook, after the farm ponds). Deterministic: integer
// hashes and arithmetic.
import { TILE, T } from './constants.js';
import { pointAt } from './geom.js';

const D_VALLEY = 49, LUSH = 128;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const VERGES3 = {
  bank: { depth: 3, willow: 16 },              // the green bank: tiles deep from the water; a willow about every this many tiles of it
  poles: { every: 9, off: 1.3, cross: [5, 10], kinds: new Set(['art', 'rural']), apart: 6 },   // tiles between poles; out from the road's edge; poles before the line swings over; road kinds; tiles from another pole
  lanes: { reach: 120, fence: 3 },   // (part 2) how far from a farmyard a road is looked for (tiles); the rail fence either side of the gate
};

export function vergesByHand3(m, H3) {
  const out = { bank: 0, willows: 0, poles: 0, lines: 0 };
  if (!H3 || !H3.addProp) return out;
  const W = m.w, HH = m.h, idx = (x, y) => y * W + x, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH;
  const wet = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP;
  // ---- (part 2) the fields kept square where the valley meets the desert or the woods: a field laid across the
  // valley's edge stopped there tile by tile, a staircase of crop into the sand; now it is cut back to a straight edge
  // (the largest whole box of it inside the valley), the rest of its box meadow, its fence and scarecrow with it ----
  out.squared = 0; out.dropped = 0; out.headlands = 0;
  // (a field's box cut back to the largest whole box of it where ok(x, y) holds - from the east, the west, the south or
  // the north, each as far as the worst row or column; the rest of its box meadow (lush: 128 if lush). Kept if it keeps
  // at least `keep` of its area, else dropped (drop) or left as it was)
  const cutBack = (k, ok, keep, drop, lush) => {
    const f = m.fields[k], x0 = Math.round(f.x / TILE), y0 = Math.round(f.y / TILE), x1 = Math.round((f.x + f.w) / TILE), y1 = Math.round((f.y + f.h) / TILE);
    const cands = [];
    { let e = x1; for (let y = y0; y < y1; y++) { let x = x0; while (x < e && ok(x, y)) x++; e = Math.min(e, x); } cands.push([x0, y0, e, y1]); }
    { let w = x0; for (let y = y0; y < y1; y++) { let x = x1 - 1; while (x >= w && ok(x, y)) x--; w = Math.max(w, x + 1); } cands.push([w, y0, x1, y1]); }
    { let sb = y1; for (let x = x0; x < x1; x++) { let y = y0; while (y < sb && ok(x, y)) y++; sb = Math.min(sb, y); } cands.push([x0, y0, x1, sb]); }
    { let nb = y0; for (let x = x0; x < x1; x++) { let y = y1 - 1; while (y >= nb && ok(x, y)) y--; nb = Math.max(nb, y + 1); } cands.push([x0, nb, x1, y1]); }
    cands.sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
    const [a0, b0, a1, b1] = cands[0], keepIt = (a1 - a0) >= 8 && (b1 - b0) >= 8 && (a1 - a0) * (b1 - b0) >= keep * (x1 - x0) * (y1 - y0);
    if (!keepIt && !drop) return 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (keepIt && x >= a0 && x < a1 && y >= b0 && y < b1) continue;
      const i = idx(x, y);
      if (inF(x, y) && m.tiles[i] === T.FIELD) { m.tiles[i] = T.GRASS; if (lush) m.reserve[i] |= LUSH; }
    }
    if (keepIt) { f.x = a0 * TILE; f.y = b0 * TILE; f.w = (a1 - a0) * TILE; f.h = (b1 - b0) * TILE; return 1; }
    m.fields.splice(k, 1); return -1;
  };
  for (let k = (m.fields || []).length - 1; k >= 0; k--) {
    const f = m.fields[k], x0 = Math.round(f.x / TILE), y0 = Math.round(f.y / TILE), x1 = Math.round((f.x + f.w) / TILE), y1 = Math.round((f.y + f.h) / TILE);
    let outside = false, mid = m.dist[idx(Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2))];
    if (mid !== D_VALLEY) continue;
    for (let y = y0; y < y1 && !outside; y++) for (let x = x0; x < x1; x++) if (inF(x, y) && m.dist[idx(x, y)] !== D_VALLEY && m.land[idx(x, y)]) { outside = true; break; }
    if (!outside) continue;
    const r = cutBack(k, (x, y) => inF(x, y) && (m.dist[idx(x, y)] === D_VALLEY || !m.land[idx(x, y)]), 0.35, true, false);
    if (r > 0) out.squared++; else out.dropped++;
  }
  // ---- the banks: fields' tiles within depth of open water become lush grass ----
  const B = VERGES3.bank, dist = new Map(), q = [];
  for (let i = W; i < W * (HH - 1); i++) {
    if (m.tiles[i] !== T.FIELD || m.dist[i] !== D_VALLEY) continue;
    if (wet(i - 1) || wet(i + 1) || wet(i - W) || wet(i + W)) { dist.set(i, 1); q.push(i); }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], d = dist.get(i);
    if (d >= B.depth) continue;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (m.tiles[j] === T.FIELD && !dist.has(j)) { dist.set(j, d + 1); q.push(j); }
  }
  const willowAt = [];
  for (const [i, d] of dist) {
    m.tiles[i] = T.GRASS; m.reserve[i] |= LUSH; out.bank++;
    const x = i % W, y = (i - x) / W;
    if (d === 2 && hh(x, y, 61) < 1 / B.willow && !willowAt.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 8)) willowAt.push([x, y]);
  }
  for (const [x, y] of willowAt) { H3.addProp(m, 'tree_a', (x + 0.5) * TILE, (y + 0.5) * TILE, 12, { sp: 'willow', k: 1.1 + hh(x, y, 62) * 0.35 }); out.willows++; }
  // (the fields the banks cut into, kept square: the bank left the crop stepped tile by tile along a slanting river; now
  // the field stops in a straight edge clear of it, a headland of grass between - where that keeps most of it)
  for (let k = (m.fields || []).length - 1; k >= 0; k--) {
    const f = m.fields[k], x0 = Math.round(f.x / TILE), y0 = Math.round(f.y / TILE), x1 = Math.round((f.x + f.w) / TILE), y1 = Math.round((f.y + f.h) / TILE);
    let hit = false;
    for (let y = y0; y < y1 && !hit; y++) for (let x = x0; x < x1; x++) if (inF(x, y) && dist.has(idx(x, y))) { hit = true; break; }
    if (hit && cutBack(k, (x, y) => inF(x, y) && !dist.has(idx(x, y)) && !wet(idx(x, y)), 0.55, false, true) > 0) out.headlands++;
  }
  // ---- (part 2) the farm lanes: each farmyard to the nearest road over open ground - along the field edges and the
  // hedgerows' room, round the corners - three tiles wide: a grass strip down the middle, a dirt rut either side ----
  const L = VERGES3.lanes;
  out.lanes = 0; out.laneTiles = 0;
  const open3 = (i) => (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && m.land[i] && !(m.reserve[i] & (32 | 1 | 2 | 8)) && !(m.bld && m.bld[i] >= 0) && m.dist[i] === D_VALLEY;
  const yard = (i) => (m.reserve[i] & 16) && m.tiles[i] !== T.BUILDING;
  const centreOk = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = idx(x + dx, y + dy); if (!inF(x + dx, y + dy) || !(open3(i) || yard(i) || m.tiles[i] === T.ROAD)) return false; } return true; };
  const clear = new Set(), laneProps = [];
  for (const b of m.buildings) {
    if (!b || b.kind !== 'farmstead') continue;
    const cxB = Math.floor(b.tx + b.tw / 2), cyB = Math.floor(b.ty + b.th / 2);
    if (m.dist[idx(cxB, cyB)] !== D_VALLEY) continue;
    // (a search out from the yard's edge, to the first tile beside a road)
    const prev = new Map(), q = [];
    for (let y = b.ty - 3; y <= b.ty + b.th + 2; y++) for (let x = b.tx - 3; x <= b.tx + b.tw + 2; x++) { const i = idx(x, y); if (inF(x, y) && yard(i) && centreOk(x, y)) { prev.set(i, -1); q.push(i); } }
    let goal = -1;
    for (let h = 0; h < q.length && goal < 0; h++) {
      const i = q[h], x = i % W, y = (i - x) / W;
      if (Math.abs(x - cxB) > L.reach || Math.abs(y - cyB) > L.reach) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, j = idx(X, Y);
        if (prev.has(j) || !inF(X, Y)) continue;
        if (m.tiles[j] === T.ROAD) { if (!yard(i)) { goal = i; break; } continue; }
        if (!centreOk(X, Y)) continue;
        prev.set(j, i); q.push(j);
      }
    }
    if (goal < 0) continue;
    const path = [];
    for (let i = goal; i >= 0 && !yard(i); i = prev.get(i)) path.push(i);
    if (path.length < 3) continue;
    const onPath = new Set(path);
    for (const i of path) {
      m.tiles[i] = T.GRASS; m.reserve[i] |= LUSH | 32; clear.add(i); out.laneTiles++;
      const x = i % W, y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = idx(x + dx, y + dy); if (onPath.has(j) || yard(j) || m.tiles[j] === T.ROAD || clear.has(j)) continue; m.tiles[j] = T.DIRT; m.reserve[j] |= 32; clear.add(j); out.laneTiles++; }
    }
    // at the road: the gateposts either side of the lane's mouth, a rail fence on along the road from each, the mailbox
    const e = path[0], ex = e % W, ey = (e - ex) / W;
    let rdx = 0, rdy = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (m.tiles[idx(ex + dx, ey + dy)] === T.ROAD) { rdx = dx; rdy = dy; break; }
    const px = (ex + 0.5) * TILE, py = (ey + 0.5) * TILE;
    for (const sd of [-1, 1]) {
      const gx = px + rdy * sd * 1.9 * TILE - rdx * 0.5 * TILE, gy = py + rdx * sd * 1.9 * TILE - rdy * 0.5 * TILE;   // (half a tile back off the road: the asphalt's edge isn't the tile's)
      laneProps.push(['post', gx, gy, 5, { h: 44 }]);
      laneProps.push(['fenceline', gx, gy, 0, { kind: 'wood', tx: rdy * sd * L.fence * TILE, ty: rdx * sd * L.fence * TILE }]);
    }
    laneProps.push(['mailbox', px + rdy * 2.6 * TILE - rdx * 10, py + rdx * 2.6 * TILE - rdy * 10, 0, null]);
    out.lanes++;
  }
  if (clear.size && H3.removeProps) H3.removeProps(m, (x, y) => clear.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
  for (const [t, x, y, r, ex] of laneProps) H3.addProp(m, t, Math.round(x), Math.round(y), r, ex);
  // ---- the power lines along the county roads ----
  const P = VERGES3.poles, have = new Map();   // (8-tile cells -> poles there)
  const cell = (x, y) => Math.floor(x / (8 * TILE)) * 65536 + Math.floor(y / (8 * TILE));
  for (const p of m.props) if (p && p.t === 'upole') { const k = cell(p.x, p.y); (have.get(k) || have.set(k, []).get(k)).push(p); }
  const crowded = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const p of have.get(cell(x, y) + dx * 65536 + dy) || []) if (Math.hypot(p.x - x, p.y - y) < P.apart * TILE) return true; return false; };
  const ground = (x, y) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!inF(tx - 1, ty - 1) || !inF(tx + 1, ty + 1)) return false;
    const i = idx(tx, ty), t = m.tiles[i];
    if ((t !== T.GRASS && t !== T.DIRT && t !== T.FIELD) || m.dist[i] !== D_VALLEY || (m.reserve[i] & (32 | 16 | 2 | 1 | 8)) || (m.deck && m.deck[i]) || (m.bld && m.bld[i] >= 0)) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const u = m.tiles[i + dy * W + dx]; if (u === T.BUILDING || u === T.WALL || u === T.WATER || u === T.DEEP || u === T.SIDEWALK || u === T.LOT || u === T.PLAZA || u === T.DOCK) return false; }
    return true;
  };
  for (const e of m.edges) {
    if (e.lvl !== 0 || e.bridge || !P.kinds.has(e.kind) || !e.pts || e.pts.length < 2 || e.len < 30 * TILE) continue;
    if (e.kind === 'rural') continue;   // (the country lanes have theirs already)
    let side = hh(e.id | 0, 3, 63) < 0.5 ? -1 : 1, run = 0, cross = P.cross[0] + Math.floor(hh(e.id | 0, 4, 64) * (P.cross[1] - P.cross[0])), prev = null, started = false;
    const off = (e.hw || 0) + P.off * TILE;
    for (let s = 3 * TILE; s < e.len - 3 * TILE; s += P.every * TILE) {
      if (prev && ++run >= cross) { side = -side; run = 0; cross = P.cross[0] + Math.floor(hh(e.id | 0, Math.round(s), 65) * (P.cross[1] - P.cross[0])); }
      const pt = pointAt(e.pts, s), x = Math.round(pt.x - pt.ty * off * side), y = Math.round(pt.y + pt.tx * off * side);
      if (!ground(x, y) || crowded(x, y)) { prev = null; continue; }
      const p = H3.addProp(m, 'upole', x, y, 5);
      if (prev && Math.hypot(prev.x - x, prev.y - y) < 14 * TILE && p) { p.wx = prev.x; p.wy = prev.y; }
      if (p) { prev = p; const k = cell(x, y); (have.get(k) || have.set(k, []).get(k)).push(p); }
      out.poles++;
      if (!started) { out.lines++; started = true; }
    }
  }
  return out;
}
