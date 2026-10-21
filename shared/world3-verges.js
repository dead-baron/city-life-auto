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
// For the whole-world build only (shared/world3-world.js's done hook, after the farm ponds). Deterministic: integer
// hashes and arithmetic.
import { TILE, T } from './constants.js';
import { pointAt } from './geom.js';

const D_VALLEY = 49, LUSH = 128;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const VERGES3 = {
  bank: { depth: 3, willow: 16 },              // the green bank: tiles deep from the water; a willow about every this many tiles of it
  poles: { every: 9, off: 1.3, cross: [5, 10], kinds: new Set(['art', 'rural']), apart: 6 },   // tiles between poles; out from the road's edge; poles before the line swings over; road kinds; tiles from another pole
};

export function vergesByHand3(m, H3) {
  const out = { bank: 0, willows: 0, poles: 0, lines: 0 };
  if (!H3 || !H3.addProp) return out;
  const W = m.w, HH = m.h, idx = (x, y) => y * W + x, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH;
  const wet = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP;
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
