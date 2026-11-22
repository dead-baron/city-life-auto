// Walkways clear of plants (the owner, 11-17: hedges and bushes "still spawning over sidewalks"; the audit of 11-19,
// tools/audit/worldrows.mjs plantOnWalk 2,914 and planterOnWalk 422). One rule for the whole world, the last pass of the
// build (shared/world3-world.js's done hook), and the same test the lint counts with - plantWalkHit - so the fix and the
// check can't drift apart:
//   - a tree, shrub, bush, hedge or flower bed with any part of it on a sidewalk, a road, a lot or a bridge (a plaza too,
//     where the district's own ground isn't paving: a tree or a planter on a plaza is its furniture);
//   - kept, as decided: a palm or tree down a boulevard's planted median (it stands in the median, not the lanes: p.median);
//     a tree by the kerb on a sidewalk - a street tree - in its grate (p.grate; the owner, 11-19: palms along the
//     promenades stay, "each in a tree grate ... at the edge with a clear walking lane beside it"); a planter or a pot set
//     tight to a building's wall (p.wall; the owner, 11-19: "allowed when they sit tight to the wall and leave the
//     sidewalk clear");
//   - anything else is moved to the nearest ground it can grow on within WALKS.move (grass, dirt; sand for a palm or a
//     cactus) clear of the plants already there, or taken up (a hedge run or a hedge box always: it can't be moved whole).
// Deterministic: arithmetic only, the props in their order.
import { TILE, T } from './constants.js';
import { nearestEdge } from './roadcore.js';
import { TIDY3, dropProps, homePaths3, onHomePath } from './world3-tidy.js';

export const WALKS = {
  TREES: /^(tree_[ab]|palm_[abcds]|redwood|mangrove|bamboo|topiary)$/,
  BUSHES: /^(shrub_[ab]|bush_[abc]|cactus)$/,
  PLANTERS: /^(planter_(sq|fl|g)|potted)$/,
  kerb: 1.3 * TILE,   // a trunk this near a road on a sidewalk is a street tree (given its grate)
  edge: 0.8 * TILE,   // ...or this near the walkway's other edge - a lawn, the sand, the water (a promenade's palms)
  wall: 0.75 * TILE,  // a planter this near a building's wall sits against it
  move: 1.6 * TILE,   // how far a plant may be moved off the walkway
  gap: 14,            // ...and how clear of the plants already there
};
const GRATED = new Set(['street', 'streetPl', 'flowerTree', 'young', 'ginkgo', 'cherry', 'magnolia', 'redMaple']);   // (client/art2/game/statics.js BASED: drawn with their grate or planter)
const WALK_T = new Set([T.SIDEWALK, T.ROAD, T.PLAZA, T.LOT, T.BRIDGE]);

// what a prop is, for this rule: 'tree' (judged by its trunk's foot), 'bush' (its spread), 'hedge', 'planter' or null
export function plantKind(p) {
  if (!p) return null;
  if (p.t === 'hedgerun' || p.t === 'hedgebox') return 'hedge';
  if (WALKS.PLANTERS.test(p.t)) return 'planter';
  if (WALKS.BUSHES.test(p.t)) return 'bush';
  if (WALKS.TREES.test(p.t) || TIDY3.PLANT.test(p.t)) return 'tree';
  return null;
}
// the points of it that stand on the ground
function feet(p, kind) {
  const pts = [];
  if (p.t === 'hedgerun') { const n = Math.max(1, Math.ceil(Math.hypot(p.tx, p.ty) / 12)); for (let i = 0; i <= n; i++) pts.push([p.x + p.tx * i / n, p.y + p.ty * i / n]); }
  else if (p.t === 'hedgebox') { for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) pts.push([p.x + p.w * i / 4, p.y + p.d * j / 4]); }
  else if (kind === 'tree') pts.push([p.x, p.y]);   // (a trunk's foot: a crown over a pavement is a street tree's)
  else { const r = kind === 'planter' ? 8 : 9; for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r * 0.5], [0, -r * 0.5]]) pts.push([p.x + dx, p.y + dy]); }
  return pts;
}
const tileOf = (m, x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inside(tx, ty) ? m.tiles[m.idx(tx, ty)] : -1; };

// The walkway tile a plant stands on (T.*), or -1 when it's clear or one of the kept kinds. The lint counts with this.
export function plantWalkHit(m, p, kind = plantKind(p)) {
  if (!kind) return -1;
  if (p.median || p.wall) return -1;
  const D = m.districtAt ? m.districtAt(p.x, p.y) : null, plazaOk = kind === 'tree' || kind === 'planter' || (D && D.ground === T.PLAZA);
  const bad = feet(p, kind).map(([x, y]) => tileOf(m, x, y)).find((t) => WALK_T.has(t) && !(t === T.PLAZA && plazaOk));
  if (bad === undefined) return -1;
  if (kind === 'tree' && p.grate && bad === T.SIDEWALK) return -1;
  return bad;
}

export function clearWalks3(m) {
  const out = { median: 0, grate: 0, wall: 0, moved: 0, dropped: 0 };
  if (!Array.isArray(m.props) || !m.inside) return out;
  const near = (x, y, r, set) => { for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++) for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) if (m.inside(tx, ty) && set.has(m.tiles[m.idx(tx, ty)]) && Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) <= r + TILE * 0.5) return true; return false; };
  const ROADS = new Set([T.ROAD]), WALLS = new Set([T.BUILDING, T.WALL]), EDGES = new Set([T.GRASS, T.SAND, T.DIRT, T.WATER, T.DEEP, T.FIELD]);
  // the plants already standing, by 32 px cell (for a moved one to keep clear of)
  const cell = (x, y) => `${Math.floor(x / 32)},${Math.floor(y / 32)}`, grid = new Map();
  const put = (p) => { const k = cell(p.x, p.y); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(p); };
  const crowded = (x, y, self) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const q of grid.get(`${Math.floor(x / 32) + i},${Math.floor(y / 32) + j}`) || []) if (q !== self && Math.hypot(q.x - x, q.y - y) < WALKS.gap) return true; return false; };
  for (const p of m.props) if (plantKind(p)) put(p);
  const paths = homePaths3(m), onPath = (x, y, kind = "tree", palm = false) => !!onHomePath(m, paths, x, y, palm ? 58 : kind === "tree" ? 38 : 30);   // (never moved onto a house's path or drive - a tree by half its crown, as the lint measures it)
  const medianEdges = m.net && m.net.edges ? m.net.edges.filter((e) => e.median > 12) : [];
  const gone = new Set();
  for (const p of m.props) {
    const kind = plantKind(p);
    if (!kind) continue;
    const bad = plantWalkHit(m, p, kind);
    if (bad < 0) continue;
    if ((kind === 'tree' || kind === 'bush') && bad === T.ROAD && medianEdges.length) {
      const e = nearestEdge({ edges: medianEdges }, p.x, p.y);
      if (e && e.d < e.e.median / 2 - 2) { p.median = 1; out.median++; continue; }
    }
    if (kind === 'tree' && bad === T.SIDEWALK && near(p.x, p.y, WALKS.kerb, ROADS) && !onPath(p.x, p.y)) {
      // (a broadleaf by the kerb named as a park's kind - an oak, a maple - becomes the street's own tree, drawn in its iron
      // grate - statics.js BASED; one with no kind of its own the page picks for the street as it always has; a palm keeps
      // its kind: the promenades' palms, standing at the edge with the lane clear beside them)
      if (/^tree_/.test(p.t) && p.sp && !GRATED.has(p.sp)) p.sp = 'street';
      p.grate = 1; out.grate++; continue;
    }
    if (kind === 'planter' && bad === T.SIDEWALK && near(p.x, p.y, WALKS.wall, WALLS) && !onPath(p.x, p.y)) { p.wall = 1; out.wall++; continue; }
    // moved to the nearest ground it can grow on, round it in rings, clear of the others - or taken up
    const ok = new Set([T.GRASS, T.DIRT, ...(/^palm_|^cactus$/.test(p.t) ? [T.SAND] : [])]);
    let to = null;
    const cell0 = cell(p.x, p.y);
    if (kind !== 'hedge' && kind !== 'planter') {
      const x0 = p.x, y0 = p.y;
      for (let r = 8; r <= WALKS.move && !to; r += 8) {
        const n = Math.max(8, Math.round(r / 4));
        for (let k = 0; k < n && !to; k++) {
          const a = (k / n) * Math.PI * 2, x = Math.round(x0 + Math.cos(a) * r), y = Math.round(y0 + Math.sin(a) * r);
          if (!ok.has(tileOf(m, x, y)) || crowded(x, y, p) || onPath(x, y, kind, /^palm_/.test(p.t))) continue;
          p.x = x; p.y = y;
          if (plantWalkHit(m, p, kind) < 0) to = [x, y]; else { p.x = x0; p.y = y0; }
        }
      }
      if (!to) { p.x = x0; p.y = y0; }
    }
    const l0 = grid.get(cell0); if (l0) { const i = l0.indexOf(p); if (i >= 0) l0.splice(i, 1); }
    // (a tree on a pavement with no ground to step onto: where it stands if that's the walkway's edge, else the nearest
    // edge - in its grate either way)
    if (!to && kind === 'tree' && bad === T.SIDEWALK && near(p.x, p.y, WALKS.edge, EDGES) && !onPath(p.x, p.y)) { to = [p.x, p.y]; if (/^tree_/.test(p.t) && p.sp && !GRATED.has(p.sp)) p.sp = 'street'; p.grate = 1; out.grate++; out.moved--; }
    if (!to && kind === 'tree' && bad === T.SIDEWALK) {
      const x0 = p.x, y0 = p.y;
      for (let r = 8; r <= WALKS.move * 1.5 && !to; r += 8) {
        const n = Math.max(8, Math.round(r / 4));
        for (let k = 0; k < n && !to; k++) {
          const a = (k / n) * Math.PI * 2, x = Math.round(x0 + Math.cos(a) * r), y = Math.round(y0 + Math.sin(a) * r);
          if (tileOf(m, x, y) !== T.SIDEWALK || !(near(x, y, WALKS.kerb, ROADS) || near(x, y, WALKS.edge, EDGES)) || crowded(x, y, p) || onPath(x, y, kind, /^palm_/.test(p.t))) continue;
          to = [x, y];
        }
      }
      if (to) { if (/^tree_/.test(p.t) && p.sp && !GRATED.has(p.sp)) p.sp = 'street'; p.grate = 1; out.grate++; out.moved--; }
    }
    // (a shrub or a pot on the pavement with no ground to grow in near: set back against the nearest wall instead - drawn
    // as a pot, the lane clear beside it - the owner, 11-19)
    if (!to && (kind === 'bush' || kind === 'planter') && bad === T.SIDEWALK) {
      const x0 = p.x, y0 = p.y;
      for (let r = 8; r <= WALKS.move * 1.5 && !to; r += 8) {
        const n = Math.max(8, Math.round(r / 4));
        for (let k = 0; k < n && !to; k++) {
          const a = (k / n) * Math.PI * 2, x = Math.round(x0 + Math.cos(a) * r), y = Math.round(y0 + Math.sin(a) * r);
          if (tileOf(m, x, y) !== T.SIDEWALK || !near(x, y, WALKS.wall * 0.6, WALLS) || crowded(x, y, p) || onPath(x, y, kind, /^palm_/.test(p.t))) continue;
          to = [x, y];
        }
      }
      if (to) { p.wall = 1; out.wall++; out.moved--; }
    }
    if (to) { p.x = to[0]; p.y = to[1]; put(p); out.moved++; }
    else { gone.add(p); out.dropped++; }
  }
  // (and any plant whose crown stands over a house's path or drive, measured as the lint does: taken up - the two egret
  // left named, West Hills House #2971's palm and Pine Hills House #3332's tree, among them)
  out.paths = 0;
  for (const p of m.props) if (p && !gone.has(p) && TIDY3.PLANT.test(p.t) && [-16, 0, 16, 32].some((dy) => onPath(p.x, p.y + dy, plantKind(p), /^palm_/.test(p.t)))) { gone.add(p); out.paths++; }   // (a band down its foot: the page draws a palm's item a little off its prop's point)
  if (gone.size) dropProps(m, gone);
  return out;
}
