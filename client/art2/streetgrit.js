// Art v2: grit on the town's streets (concepts E1 ground materials, S1 street kit): drain grates at the kerb, leaves
// and litter in the gutters, oil drips in the lanes (most where cars wait at the lights), cracks and patched asphalt,
// weeds where the pavement meets the kerb - by the district's grit (shared/alleys.js gritOf: the rough end of town is
// cracked and littered, uptown is swept). Flat decoration (the decals of alleyart.js), drawn into the chunks with the
// statics; the alleys have their own (shared/alleys.js).
//   streetGrit(M) -> [{ k, x, y, v }]   worked out once per map; deterministic (hashed from positions)
import { TILE, T } from '../../shared/constants.js';
import { DISTRICTS } from '../../shared/map.js';
import { pointAt } from '../../shared/geom.js';
import { gritOf } from '../../shared/alleys.js';
import { hash } from './gbuf.js';

const STREETS = new Set(['st', 'minor', 'art', 'ave', 'blvd', 'front', 'drive']);
const TOWN = new Set(['towers', 'commercial', 'civic', 'nightlife', 'redlight', 'industrial', 'factory', 'harbor', 'apartments', 'southside', 'oldtown', 'arts', 'beach', 'houses', 'luxury']);
const STEP = 46, END = 70;   // px between spots; px kept clear at each end (the junctions and their crossings)
const CACHE = new WeakMap();

export function streetGrit(M) {
  let out = CACHE.get(M);
  if (out) return out;
  out = [];
  const W = M.w, H = M.h;
  const distAt = (x, y) => { const tx = Math.min(W - 1, Math.max(0, Math.floor(x / TILE))), ty = Math.min(H - 1, Math.max(0, Math.floor(y / TILE))); return DISTRICTS[M.dist[ty * W + tx]]; };
  const deck = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx < 0 || ty < 0 || tx >= W || ty >= H || (M.deck && M.deck[ty * W + tx]); };
  const tile = (x, y) => M.tiles[Math.min(H - 1, Math.max(0, Math.floor(y / TILE))) * W + Math.min(W - 1, Math.max(0, Math.floor(x / TILE)))];
  const onRoad = (p) => { const t = tile(p[0], p[1]); return t === T.ROAD || t === T.BRIDGE; };
  const push = (k, p, v) => { if (k === 'weeds' ? tile(p[0], p[1]) === T.SIDEWALK : onRoad(p)) out.push({ k, x: p[0], y: p[1], v }); };
  (M.edges || []).forEach((e, ei) => {
    if (!e || e.lvl !== 0 || !STREETS.has(e.kind) || !e.pts || e.pts.length < 2 || !(e.len > END * 2 + STEP)) return;
    const a = e.pts[0], z = e.pts[e.pts.length - 1], d = distAt((a.x + z.x) / 2, (a.y + z.y) / 2);
    if (!d || !TOWN.has(d.style)) return;
    const g = gritOf(d), hw = e.hw || 96, vert = Math.abs(z.x - a.x) < Math.abs(z.y - a.y);
    const leafy = d.style === 'houses' || d.style === 'luxury' || d.style === 'oldtown' || d.style === 'civic' || d.style === 'arts' ? 1 : 0.45;
    for (let s = END, i = 0; s <= e.len - END; s += STEP, i++) {
      const q = pointAt(e.pts, s), H0 = (k) => hash(Math.round(q.x / 4) + ei, Math.round(q.y / 4), 8100 + k);
      if (deck(q.x, q.y)) continue;
      const near = s < END + 100 || s > e.len - END - 100;   // waiting at the lights
      for (const side of [-1, 1]) {
        const nx = -q.ty * side, ny = q.tx * side, r = H0(side < 0 ? 1 : 2), at = (o) => [Math.round(q.x + nx * o), Math.round(q.y + ny * o)];
        // a drain grate at the kerb every so often
        if (i % 8 === (side < 0 ? 2 : 6) && H0(3) < 0.8) { push(vert ? 'drainv' : 'drain', at(hw - 10), 0); continue; }
        // the gutter: leaves, litter
        if (r < 0.05 + 0.12 * leafy * (1 - 0.5 * g)) { push('leaves', at(hw - 12), Math.floor(H0(4) * 6)); continue; }
        if (r > 1 - 0.1 * g) { push('litter', at(hw - 12), Math.floor(H0(5) * 6)); continue; }
        // weeds in the cracks where the pavement meets the kerb (the rough end of town)
        if (e.walk && g > 0.5 && r > 0.5 && r < 0.5 + 0.1 * g) { push('weeds', at(hw + 8), Math.floor(H0(6) * 6)); continue; }
      }
      // the lanes: oil drips (most where cars wait), cracks and patched asphalt
      const u = H0(7), o = (H0(8) - 0.5) * hw * 1.2, p = [Math.round(q.x - q.ty * o), Math.round(q.y + q.tx * o)];
      if (u < (near ? 0.12 : 0.03) * (0.5 + g)) push('oil', p, Math.floor(H0(9) * 6));
      else if (u > 1 - 0.09 * g) push(H0(10) < 0.5 ? 'crack' : 'patch', p, Math.floor(H0(11) * 6));
    }
  });
  CACHE.set(M, out);
  return out;
}
