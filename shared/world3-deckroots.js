// World v3: a pier's or a boardwalk's root on dry land (the placement audit's beachWater). The art takes a plank tile that
// stands in water (a DOCK tile with water beside it: shared/mapcore.js deckOnDry) for water underneath, and blurs that
// wetness into the ground round it - beside dry ground with no water of its own near, a sliver of sea came out on the
// grass: a grass hole inside a pier's foot, a one-tile neck of planks along the shore, a boardwalk's foot.
// sliverAt(M, tx, ty, old) - one rule for the build and the lint (tools/placementlint.mjs): the dry tile beside the
// plank tile tx, ty where the bake's blurred wetness (groundbake.js tf, the two tiles' met halfway) reaches SLIVER, or null.
// deckRoots3(m) (World v3's done hook): planks laid over each such dry tile - the root stands on land, so it's ground to
// the art (deckOnDry) and the sliver's gone; a boardwalk's leg tile's neighbour joins its legs (m.walkways: the bake
// draws the marsh under it, the model's planks over it), the nature props on it go. Until none is left (ROOT_PASSES).
// Deterministic (tile order, integer arithmetic); only the world build imports it.
import { T, TILE } from './constants.js';
import { deckOnDry } from './mapcore.js';
import { dropProps } from './world3-tidy.js';

export const SLIVER = 0.47, ROOT_PASSES = 4;
const DRY = new Set([T.SAND, T.GRASS, T.DIRT]);
const wetT = (t) => t === T.WATER || t === T.DEEP;
const PLANT = /^(tree_\w+|shrub_\w+|bush_\w+|flowers_\w+|grass_\w+|reeds?\w*|fern\w*|rk|rock\w*)$/;

// old: every plank taken for water (the art before deckOnDry - the lint's check that it sees the class)
export function sliverAt(M, tx, ty, old = false) {
  if (!M.inside(tx, ty) || M.tiles[M.idx(tx, ty)] !== T.DOCK) return null;
  if (!old && deckOnDry(M, tx, ty)) return null;
  const twAt = (x, y) => { if (!M.inside(x, y)) return 1; const t = M.tiles[M.idx(x, y)]; return wetT(t) || t === T.BRIDGE || (t === T.DOCK && (old || !deckOnDry(M, x, y))) ? 1 : 0; };
  const tfAt = (x, y) => twAt(x, y) * 0.5 + (twAt(x - 1, y) + twAt(x + 1, y) + twAt(x, y - 1) + twAt(x, y + 1)) * 0.1 + (twAt(x - 1, y - 1) + twAt(x + 1, y - 1) + twAt(x - 1, y + 1) + twAt(x + 1, y + 1)) * 0.025;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {   // (side by side: a corner's touch is too little wet for the sea to show)
    const x = tx + dx, y = ty + dy;
    if (!M.inside(x, y) || !DRY.has(M.tiles[M.idx(x, y)])) continue;
    let water = false;
    for (let j = -1; j <= 1 && !water; j++) for (let i = -1; i <= 1; i++) if (M.inside(x + i, y + j) && wetT(M.tiles[M.idx(x + i, y + j)])) { water = true; break; }
    if (water) continue;
    if ((tfAt(x, y) + tfAt(tx, ty)) / 2 < SLIVER) continue;   // (a jetty's root by the shore: a speck or two at most)
    return [x, y];
  }
  return null;
}

export function deckRoots3(m) {
  const out = { planked: 0 };
  const walk = m.walkways ? new Set(m.walkways) : null, gone = new Set();
  for (let pass = 0; pass < ROOT_PASSES; pass++) {
    const lay = [];
    for (let ty = m.y0 + 1; ty < m.y0 + m.h - 1; ty++) for (let tx = m.x0 + 1; tx < m.x0 + m.w - 1; tx++) {
      if (m.tiles[m.idx(tx, ty)] !== T.DOCK) continue;
      const d = sliverAt(m, tx, ty);
      if (d) lay.push([tx, ty, d[0], d[1]]);
    }
    if (!lay.length) break;
    for (const [tx, ty, x, y] of lay) {
      const i = m.idx(x, y);
      if (m.tiles[i] === T.DOCK) continue;
      m.tiles[i] = T.DOCK;
      if (m.reserve) m.reserve[i] |= m.reserve[m.idx(tx, ty)];
      if (walk && walk.has(m.idx(tx, ty))) { walk.add(i); m.walkways.push(i); }
      out.planked++;
    }
    for (const [, , x, y] of lay) for (const p of m.props) if (p && Math.floor(p.x / TILE) === x && Math.floor(p.y / TILE) === y && PLANT.test(p.t)) gone.add(p);
  }
  if (gone.size) dropProps(m, gone);
  out.cleared = gone.size;
  return out;
}
