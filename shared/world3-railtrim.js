// Railings and fences on the land, not out over the water (the audit's railOverWater, 110 on 11-19: "the promenade's
// railings jutting out over the sea on a diagonal shore"): every fence or railing run that leaves the land for a stretch
// of open water (two samples or more, 8 px apart - the lint's rule, tools/audit/worldrows.mjs) is cut back to its dry
// lengths - the longest kept where it was, any other of at least MIN_KEEP a run of its own, the rest dropped. A run on a
// dock or a bridge is on dry ground for this (DOCK, BRIDGE aren't water). The fences people collide with are worked out
// from these props (shared/fences.js fenceEnds), so the cut ones hold where they're drawn.
// For the whole-world build's done hook (shared/world3-world.js), after the props are final.
//   railTrim3(m) -> { moved, cut, split, dropped }
import { TILE, T } from './constants.js';
import { dropProps } from './world3-tidy.js';

export const RAILS = new Set(['rail', 'crail', 'fenceline', 'yfence', 'chainfence', 'pierrail', 'creekrail']);
const STEP = 8, MIN_KEEP = TILE;

// a run's start and its vector
function vecOf(p) {
  if (p.t === 'yfence') return [p.x, p.y, (p.x1 ?? p.x) - p.x, (p.y1 ?? p.y) - p.y];
  if (p.t === 'crail') return [p.x, p.y, p.len || 0, 0];
  return [p.x, p.y, p.tx || 0, p.ty || 0];
}
// the same run from a to b (fractions along it)
function cutTo(p, a, b) {
  const [x, y, dx, dy] = vecOf(p), q = { ...p };
  q.x = x + dx * a; q.y = y + dy * a;
  if (p.t === 'yfence') { q.x1 = x + dx * b; q.y1 = y + dy * b; }
  else if (p.t === 'crail') q.len = (b - a) * dx;
  else { q.tx = dx * (b - a); q.ty = dy * (b - a); }
  return q;
}

// out over the water at (x, y), a run heading (ux, uy): water under it AND SIDE px to either side of it - a railing
// along a seawall, a few px into the water tile at the shore's edge, is on the shore (the promenades' railings), not out
// at sea. The lint counts by this too (tools/audit/worldrows.mjs railOverWater).
const SIDE = 14;
export function railWetAt(m, x, y, ux, uy) {
  const w = (px, py) => { const t = m.tileAtPx(px, py); return t === T.WATER || t === T.DEEP; };
  const off = (px, py) => { const t = m.tileAtPx(px, py); return t === T.WATER || t === T.DEEP || t === T.BUILDING || t === T.WALL || t < 0; };   // (no footing: water, or a wall's foot)
  return w(x, y) && off(x - uy * SIDE, y + ux * SIDE) && off(x + uy * SIDE, y - ux * SIDE);
}
// the dry stretches of a run: [[a, b], ...] fractions, and its longest wet run (samples); null: nothing to cut
export function dryParts(m, p) {
  const [x, y, dx, dy] = vecOf(p), L = Math.hypot(dx, dy);
  if (L < STEP * 2) return null;
  const n = Math.max(1, Math.ceil(L / STEP)), wet = [], ux = dx / L, uy = dy / L;
  for (let i = 0; i <= n; i++) wet.push(railWetAt(m, x + dx * i / n, y + dy * i / n, ux, uy));
  let run = 0, worst = 0;
  for (const w of wet) { run = w ? run + 1 : 0; worst = Math.max(worst, run); }
  if (worst < 2) return null;
  const parts = [];
  let s = -1;
  for (let i = 0; i <= n + 1; i++) {
    const dry = i <= n && !wet[i];
    if (dry && s < 0) s = i;
    if (!dry && s >= 0) { if (i - 1 > s) parts.push([s / n, (i - 1) / n]); s = -1; }
  }
  return { parts: parts.filter(([a, b]) => (b - a) * L >= MIN_KEEP).sort((u, v) => (v[1] - v[0]) - (u[1] - u[0])), L };
}

const SHIFT_MAX = 48;
function shifted(m, p) {
  const [, , dx, dy] = vecOf(p), L = Math.hypot(dx, dy);
  if (!L) return null;
  const nx = -dy / L, ny = dx / L;
  for (let d = 4; d <= SHIFT_MAX; d += 4) for (const sgn of [1, -1]) {
    const q = { ...p, x: p.x + nx * d * sgn, y: p.y + ny * d * sgn };
    if (p.t === 'yfence') { q.x1 = (p.x1 ?? p.x) + nx * d * sgn; q.y1 = (p.y1 ?? p.y) + ny * d * sgn; }
    if (railWetRun(m, q) >= 1) continue;
    const n = Math.max(1, Math.ceil(L / STEP));
    let ok = true;
    for (let k = 0; k <= n && ok; k++) { const t = m.tileAtPx(q.x + dx * k / n, q.y + dy * k / n); if (t === T.BUILDING || t === T.WALL || t === T.ROAD) ok = false; }
    if (ok) return q;
  }
  return null;
}
export function railTrim3(m) {
  const out = { moved: 0, cut: 0, split: 0, dropped: 0 };
  if (!Array.isArray(m.props) || !m.tileAtPx) return out;
  const gone = new Set(), add = [];
  for (let i = 0; i < m.props.length; i++) {
    const p = m.props[i];
    if (!p || !RAILS.has(p.t)) continue;
    const D = dryParts(m, p);
    if (!D) continue;
    // first: moved back onto the shore - the smallest shift across the run (up to SHIFT_MAX px, either way) that has none
    // of it out over the water and none of it on a building (a seawall's railing a tile out at sea comes back to the edge)
    const q = shifted(m, p);
    if (q) { m.props[i] = q; out.moved++; continue; }
    if (!D.parts.length) { gone.add(p); out.dropped++; continue; }
    const [a, b] = D.parts[0];
    m.props[i] = cutTo(p, a, b);   // (the longest dry stretch, in its place in the list: nothing renumbered)
    out.cut++;
    for (const [c, d] of D.parts.slice(1)) { add.push(cutTo(p, c, d)); out.split++; }
  }
  if (gone.size) dropProps(m, gone);
  for (const q of add) m.props.push(q);   // (the extra stretches at the end of the list)
  return out;
}
// a run's longest stretch out over the water, in samples (the lint's measure)
export function railWetRun(m, p) {
  const [x, y, dx, dy] = vecOf(p), L = Math.hypot(dx, dy);
  if (!L) return 0;
  const n = Math.max(1, Math.ceil(L / STEP)), ux = dx / L, uy = dy / L;
  let run = 0, worst = 0;
  for (let i = 0; i <= n; i++) { run = railWetAt(m, x + dx * i / n, y + dy * i / n, ux, uy) ? run + 1 : 0; worst = Math.max(worst, run); }
  return worst;
}
