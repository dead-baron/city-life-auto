// The falls chain, part 1: the falls in view (the nature program, 2026-10-21; the handcraft research's 4.3: "each fall:
// a plunge pool, mist, a trail to a viewpoint"). The camera looks down from the south, and a tree's sprite stands up
// the screen from its foot: the giants south of Redwood Creek Falls hid it whole, and the woods' trees stood in front of
// the others. Now no tree stands where it would hide a fall - the redwoods out to as far as they stand tall (their
// sprites run some 20 tiles up the screen), the other trees a few tiles - so each fall shows from the trail below it.
// (The falls themselves are drawn a little higher and wider: client/art2/game/statics.js FALLS_LOOK.)
// For the whole-world build only (shared/world3-world.js's done hook, after the coasts'). Deterministic: arithmetic.
import { TILE, T } from './constants.js';

export const FALLS3 = {
  kinds: new Set(['creek', 'tarn', 'gorge', 'ledgefall', 'jfalls']),   // the nature sites whose falls these are (Silver Thread Falls: its own, below; the ledge falls: world3-ledgefalls.js)
  tall: { re: /^(redwood|tree_)/, giant: /^redwood/, reach: 22, near: 6 },   // (tiles: how far south a giant's sprite reaches up over a fall; how far south any tree's does; either side, the fall's half-width plus this)
  side: { giant: 5, tree: 2 },   // (tiles either side of the fall's half-width: a giant's crown spreads wide)
};

export function fallsInView3(m, H3) {
  const out = { falls: 0, cleared: 0 };
  if (!H3 || !H3.removeProps) return out;
  const F = FALLS3, falls = [];
  for (const s of m.natureSites || []) if (F.kinds.has(s.kind) && s.falls && Number.isFinite(s.falls.x)) falls.push({ x: s.falls.x, y: s.falls.y, w: Math.max(s.falls.w || 64, 96) });
  const st = m.world3 && m.world3.west && m.world3.west.built && m.world3.west.built.falls;
  if (st && st.lip) falls.push({ x: (st.lip.x0 + st.lip.x1) / 2 * TILE, y: (st.lip.y + 3) * TILE, w: (st.lip.x1 - st.lip.x0) * TILE });
  out.falls = falls.length;
  if (!falls.length) return out;
  // (a tree hides a fall if it stands south of it, within the fall's width and a margin, near enough for its height)
  const hides = (p) => {
    if (!F.tall.re.test(p.t)) return false;
    const giant = F.tall.giant.test(p.t), reach = (giant ? F.tall.reach : F.tall.near) * TILE, side = (giant ? F.side.giant : F.side.tree) * TILE;
    return falls.some((f) => p.y > f.y - TILE && p.y < f.y + reach && Math.abs(p.x - f.x) < f.w / 2 + side);
  };
  const gone = new Set();
  for (const p of m.props) if (p && hides(p)) gone.add(p.x + ',' + p.y);
  if (gone.size) { const before = m.props.length; H3.removeProps(m, (x, y) => gone.has(x + ',' + y)); out.cleared = before - m.props.length; }
  return out;
}

// The falls chain, part 2: a fall lands in water (the art pass, 2026-11-25; found 11-24 - "falls that land short of
// their pool ... a strip of dry bank between falls and pond"). Counted 11-25 over the 49 falls of the world: the
// foot of Fern Gorge's stood 52 px of grass from its pond, Macaw Falls' 28, the Redwood River's two end falls 32, a
// ledge fall at Macaw Cove 128 px of beach from the sea. For every fall prop: looking south from its foot (past up
// to `lip` tiles of its own rock), if there is open grass or sand and then water within `reach` tiles, that ground
// becomes the water it falls toward - as wide as the fall and three tiles at least under a fall of `pool` px, or one
// tile where it is more than `rill` tiles (a rill across a beach) - and what grew on it goes. Paths (dirt), roads, decks and rock are never flooded, nor the
// ground by a swimming pool.
export const FEET3 = { re: /^(fallsmall|coastfall)$/, reach: 6, lip: 2, rill: 2, min: 20, pool: 32 };
export function fallsFeet3(m, H3) {
  const out = { falls: 0, short: 0, flooded: 0, cleared: 0 };
  if (!H3) return out;
  const S = FEET3, W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH;
  const wet = (x, y) => inF(x, y) && (m.tiles[y * W + x] === T.WATER || m.tiles[y * W + x] === T.DEEP);
  const soft = (x, y) => inF(x, y) && (m.tiles[y * W + x] === T.GRASS || m.tiles[y * W + x] === T.SAND) && m.land[y * W + x] && !(m.bld && m.bld[y * W + x] >= 0);
  // (a swimming pool's water - m.pools: a box, or a lazy river's ring - is a built basin: a water park's little fall on
  // its island keeps its ground; seen 11-25, a murky channel cut through Splash Canyon's palm island)
  const pool = (X, Y) => (m.pools || []).some((r) => (r.ring ? Math.abs(Math.hypot((X - r.ring.cx) / r.ring.rx, (Y - r.ring.cy) / r.ring.ry) - 1) * Math.min(r.ring.rx, r.ring.ry) < r.ring.hw + 16 : X >= r.x - 16 && X < r.x + r.w + 16 && Y >= r.y - 16 && Y < r.y + r.h + 16));
  const gone = new Set();
  for (const p of m.props) {
    if (!p || !S.re.test(p.t)) continue;
    out.falls++;
    const tx = Math.floor(p.x / TILE); let ty = Math.floor(p.y / TILE), lip = 0;
    if (wet(tx, ty)) continue;
    while (lip < S.lip && inF(tx, ty) && m.tiles[ty * W + tx] === T.WALL) { ty++; lip++; }
    const y0 = ty; let y1 = ty;
    while (y1 - y0 < S.reach && soft(tx, y1)) y1++;
    if (y1 === y0 || !wet(tx, y1) || (y1 * TILE - p.y) < S.min || pool((tx + 0.5) * TILE, (y1 + 0.5) * TILE)) continue;   // (no dry ground, or no water beyond it, or under a tile's worth)
    out.short++;
    const src = y1 * W + tx, hw = y1 - y0 > S.rill ? 0 : Math.max((p.w || 32) >= S.pool ? 1 : 0, Math.round(((p.w || 32) / TILE - 1) / 2));   // (a fall a tile wide or more gets a plunge pool three tiles wide: one tile of water is drawn as mostly bank - seen at Fern Gorge)
    for (let y = y0; y < y1; y++) for (let x = tx - hw; x <= tx + hw; x++) {
      if (!soft(x, y)) continue;
      const i = y * W + x;
      m.tiles[i] = T.WATER; m.land[i] = 0; m.reserve[i] |= 4;
      if (m.lake) m.lake[i] = m.lake[src]; if (m.river) m.river[i] = m.river[src];
      gone.add(i); out.flooded++;
    }
    for (const b of (m.waters && Array.isArray(m.waters.lk) ? m.waters.lk : [])) if (b.box && tx >= b.box[0] && tx < b.box[2] && y1 >= b.box[1] && y1 < b.box[3]) { b.box[0] = Math.min(b.box[0], tx - hw); b.box[2] = Math.max(b.box[2], tx + hw + 1); b.box[1] = Math.min(b.box[1], y0); }
  }
  if (gone.size && H3.removeProps) { const before = m.props.length; H3.removeProps(m, (x, y) => gone.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)) && !FEET3.re.test((m.props.find((q) => q && q.x === x && q.y === y) || {}).t || '')); out.cleared = before - m.props.length; }
  return out;
}

