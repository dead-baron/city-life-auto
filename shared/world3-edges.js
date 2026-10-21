// The wild districts' edges meander (the nature program, 2026-10-21). Where two of the wilds meet - Willow Valley's
// pasture and the Red Rock Desert's sand and gravel, Highland Woods' forest floor and Granite Peaks' bare rock (the tree
// line), the woods and the valley - the ground changed along the districts' tile-stepped border: a staircase of grass
// against sand, 32 px a step, that no land draws. Now, in a band either side of it, the border wanders in slow lobes
// and small tongues (value noise): each plain tile takes the side the wandering line puts it on - its district and,
// where the two sides' ground differs, that side's ground - and what grew there that the new side doesn't grow goes.
// Only plain ground changes: never a road, a farm field's box, a trail, a yard, a designed place, the water or a
// building.
// For the whole-world build only (shared/world3-world.js's done hook, near its end). Deterministic: integer hashes,
// arithmetic.
import { T, TILE } from './constants.js';

const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const fade = (t) => t * t * (3 - 2 * t);
const vn = (x, y, sc, s) => { const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy), u = fade(fx - ix), v = fade(fy - iy), a = hh(ix, iy, s), b = hh(ix + 1, iy, s), c = hh(ix, iy + 1, s), d = hh(ix + 1, iy + 1, s); return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v; };

// the pairs of districts (World v3's: shared/world3-biomes.js D3) whose border wanders: a, b, and each side's own ground
// (a tile type, or 'keep': the ground stays, only the district changes) - bare: the side whose new tiles lose what grew
// there whatever their ground; band: tiles either side looked at; amp: how
// far (tiles) the line wanders; scale: the lobes' size (tiles)
export const EDGES3 = {
  pairs: [
    { a: 49, b: 50, ta: T.GRASS, tb: 'local' },   // Willow Valley's pasture | the Red Rock Desert's ground
    { a: 47, b: 48, ta: T.GRASS, tb: 'local', bare: 48 },   // Highland Woods' floor | Granite Peaks' rock: the tree line (no woods' tree goes up with the rock)
    { a: 47, b: 49, ta: 'keep', tb: 'keep' },     // Highland Woods | Willow Valley: grass both, the woods' floor and the pasture
  ],
  band: 7, amp: 5.5, scale: 18,
};

export function wildEdges3(m, H3) {
  const out = { moved: 0, retyped: 0, pairs: [] };
  const E = EDGES3, W = m.w, HH = m.h, N = W * HH;
  const inField = new Uint8Array(N);   // (a farm field's box stays its district's whole: its fence, its crop)
  for (const f of m.fields || []) { const x0 = Math.round(f.x / TILE), y0 = Math.round(f.y / TILE), x1 = Math.round((f.x + f.w) / TILE), y1 = Math.round((f.y + f.h) / TILE); for (let y = Math.max(0, y0 - 1); y < Math.min(HH, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x < Math.min(W, x1 + 1); x++) inField[y * W + x] = 1; }
  const plain = (i) => m.land[i] && !inField[i] && (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) && !(m.reserve[i] & ~(4 | 128)) && !(m.bld && m.bld[i] >= 0) && !(m.deck && m.deck[i]);
  const VEG = /^(tree_|redwood|shrub_|bush_|flowers_|cactus|palm_|log$|rwstump|rwlog|boulder)/;
  const gone = new Set();
  for (const P of E.pairs) {
    // the border: tiles of a beside tiles of b (land)
    const sd = new Int8Array(N), q = [];
    for (let y = 1; y < HH - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, d = m.dist[i];
      if (!m.land[i] || (d !== P.a && d !== P.b)) continue;
      const other = d === P.a ? P.b : P.a;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (m.land[j] && m.dist[j] === other) { sd[i] = d === P.a ? 1 : -1; q.push(i); break; }
    }
    if (!q.length) { out.pairs.push(0); continue; }
    // (out from it, each side, to the band's depth)
    for (let h = 0; h < q.length; h++) {
      const i = q[h], d = sd[i], k = Math.abs(d);
      if (k >= E.band) continue;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (sd[j] || !m.land[j]) continue;
        if (m.dist[j] === (d > 0 ? P.a : P.b)) { sd[j] = d > 0 ? d + 1 : d - 1; q.push(j); }
      }
    }
    // each side's own ground near the border (the commonest plain ground there), where it's 'local'
    const count = (side) => { const c = new Map(); for (const i of q) if ((sd[i] > 0) === (side > 0) && plain(i)) c.set(m.tiles[i], (c.get(m.tiles[i]) || 0) + 1); let best = -1, n = -1; for (const [t, k] of c) if (k > n) { n = k; best = t; } return best; };
    const ta = P.ta === 'local' ? count(1) : P.ta, tb = P.tb === 'local' ? count(-1) : P.tb;
    let moved = 0;
    for (const i of q) {
      if (!plain(i)) continue;
      const x = i % W, y = (i - x) / W, s = sd[i] > 0 ? sd[i] - 0.5 : sd[i] + 0.5;
      const n = (vn(x, y, E.scale, 4501 + P.a) - 0.5) * 2 * E.amp + (vn(x, y, 5, 4502 + P.b) - 0.5) * 2.2;
      const side = s + n > 0 ? 1 : -1;
      if (side === (sd[i] > 0 ? 1 : -1)) continue;
      // (the tile crosses to the other side: its district, and its ground where that side's differs)
      const d = side > 0 ? P.a : P.b, t = side > 0 ? ta : tb;
      m.dist[i] = d; moved++;
      if (P.bare === d) gone.add(i);
      if (t !== 'keep' && t >= 0 && m.tiles[i] !== t) { m.tiles[i] = t; m.reserve[i] &= ~128; out.retyped++; gone.add(i); }
    }
    out.moved += moved; out.pairs.push(moved);
  }
  if (gone.size && H3 && H3.removeProps) {
    const W2 = m.w;
    const at = new Set();
    for (const p of m.props) if (p && VEG.test(p.t)) { const k = Math.floor(p.y / TILE) * W2 + Math.floor(p.x / TILE); if (gone.has(k)) at.add(p.x + ',' + p.y); }
    if (at.size) H3.removeProps(m, (x, y) => at.has(x + ',' + y));
  }
  return out;
}
