// The manhole covers on the city's streets: where the ground bake draws them (groundbake.js covers) and where the
// steam comes up from (weather.js) - one list, so steam only ever rises out of a cover you can see. Only in
// town (the city's districts: not the villages, the farms or the open country), on its streets (not the highways,
// the country roads, arterials out of town or dirt tracks) and never on a deck.
// Tiny on purpose (no art imports): the page's main code reads it for the steam (so it lives here, not with the art v2
// renderer, which main.js only loads once the city is in).
import { DISTRICTS } from '../../shared/map.js';
import { TILE, MAP_W, MAP_H } from '../../shared/constants.js';

export const URBAN = new Set(['towers', 'commercial', 'civic', 'nightlife', 'redlight', 'industrial', 'factory', 'harbor', 'apartments', 'southside', 'oldtown', 'arts']);
const NO_COVERS = new Set(['dirt', 'rural', 'hwy']);
// (ground.js hh: the same hash, so the bake and the steam agree)
const hh = (x, y, s) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function arcs(P) {
  if (P[0].s !== undefined) return;
  let s = 0; P[0].s = 0;
  for (let i = 1; i < P.length; i++) { s += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); P[i].s = s; }
}
function pointOn(P, s) {
  let lo = 0, hi = P.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (P[mid].s <= s) lo = mid; else hi = mid - 1; }
  const a = P[lo], c = P[Math.min(P.length - 1, lo + 1)], seg = (c.s - a.s) || 1, t = Math.max(0, Math.min(1, (s - a.s) / seg));
  const dx = c.x - a.x, dy = c.y - a.y, l = Math.hypot(dx, dy) || 1;
  return { x: a.x + dx * t, y: a.y + dy * t, tx: dx / l, ty: dy / l };
}
export function urbanAt(M, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H || !M.dist) return false;
  const d = DISTRICTS[M.dist[ty * MAP_W + tx]];
  return !!(d && URBAN.has(d.style));
}
// The covers along one road: [{ x, y }] (world px, the cover's centre), worked out once per edge and seed. Every 300-500
// px along the stretch between its junctions, somewhere across the carriageway.
export function edgeCovers(M, e, seed) {
  const key = 'c' + seed;
  if (e._covers && e._covers.key === key) return e._covers.list;
  const list = [];
  if (e.lvl === 0 && !NO_COVERS.has(e.kind)) {
    const P = e.pts;
    arcs(P);
    const L = P[P.length - 1].s, na = M.nodes[e.a], nb = M.nodes[e.b];
    const t0 = ((na && na.trim && na.trim[e.id]) || 0) + 6, t1 = L - ((nb && nb.trim && nb.trim[e.id]) || 0) - 6;
    for (let s = t0 + 60 + hh(e.id, 1, seed) * 120; s < t1 - 30; s += 300 + hh(e.id, Math.floor(s), seed) * 200) {
      const p = pointOn(P, s), o = (hh(e.id, Math.floor(s) + 3, seed) - 0.5) * e.hw, x = p.x - p.ty * o, y = p.y + p.tx * o;
      if (urbanAt(M, x, y)) list.push({ x, y });
    }
  }
  Object.defineProperty(e, '_covers', { value: { key, list }, enumerable: false, writable: true, configurable: true });   // (not in the city's data)
  return list;
}
// every cover in a box (x0, y0)-(x1, y1)
export function coversIn(M, x0, y0, x1, y1, seed) {
  const out = [];
  for (const e of M.edges || []) {
    if (e.lvl !== 0 || NO_COVERS.has(e.kind)) continue;
    for (const c of edgeCovers(M, e, seed)) if (c.x >= x0 && c.x < x1 && c.y >= y0 && c.y < y1) out.push(c);
  }
  return out;
}
export const coverSeed = (M) => ((M.seed ?? 1337) | 0) & 0xffff;
