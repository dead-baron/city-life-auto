// The world tidied last (the owner's 10-16 list: "fence posts and hay bales spawning over water; fences across
// driveways; plants and trees on train tracks"). The world is laid in many passes - fields, then rivers through them,
// then the river banks wandering, then lanes from the farmsteads - and a later pass can put water or a road under what
// an earlier one placed. So, after everything else (shared/world3-world.js's done hook, last):
//   - what only stands on dry ground (a tree, a bush, a flower bed, a fence post, a bale, a bench, a yard fence's
//     panel) and has water under it now is taken away;
//   - a fence run that meets a road, a bridge or the water now stops short of it (a farm gate's fence along the road
//     where a lane or a side road comes in; a garden fence a street cuts across), and one with nothing left goes.
// (The ground cover, drawn by the page, keeps off the rails itself: client/art2/game/statics.js railClear.)
// For the whole-world build only. Deterministic: arithmetic.
import { TILE, T } from './constants.js';

// LAND: the prop types that need dry ground under them (plants by species: reeds and cattails grow in the water);
// WET_SP: the plants that stand in water; FENCE: the fence kinds that stop at a road or the water; step: px along a run
export const TIDY3 = {
  LAND: new Set(['tree_a', 'tree_b', 'palm_a', 'palm_b', 'palm_c', 'palm_d', 'palm_s', 'shrub_a', 'shrub_b', 'bush_a', 'bush_b', 'bush_c', 'flowers_a', 'flowers_big', 'cactus', 'redwood', 'rwstump',
    'post', 'hayBale', 'scarecrow', 'pbench', 'bench', 'bench_a', 'bench_b', 'picnic', 'yfence', 'mailbox', 'trough', 'woodpile']),
  WET_SP: new Set(['reeds', 'cattails', 'lily', 'papyrus', 'mangrove', 'cypress']),
  FENCE: new Set(['wood', 'rail', 'picket', 'iron', 'chain', 'stone']),
  step: 8,
};

export function tidyProps3(m) {
  const out = { wet: 0, clipped: 0, dropped: 0 };
  if (!Array.isArray(m.props)) return out;
  const R = TIDY3, W = m.w, HH = m.h;
  const tileAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < W && ty < HH ? m.tiles[ty * W + tx] : -1; };
  const wet = (x, y) => { const t = tileAt(x, y); return t === T.WATER || t === T.DEEP; };
  const stop = (x, y) => { const t = tileAt(x, y); return t === T.WATER || t === T.DEEP || t === T.ROAD || t === T.BRIDGE; };
  const dockNear = (x, y) => { for (let dy = -48; dy <= 48; dy += 16) for (let dx = -48; dx <= 48; dx += 16) { const t = tileAt(x + dx, y + dy); if (t === T.DOCK || t === T.BRIDGE) return true; } return false; };
  const gone = new Set();
  for (const p of m.props) {
    if (!p) continue;
    if (R.LAND.has(p.t)) {
      if (p.sp && R.WET_SP.has(p.sp)) continue;
      // (a yard fence's panel by its middle; anything else by its foot)
      const x = p.t === 'yfence' && p.x1 !== undefined ? (p.x + p.x1) / 2 : p.x, y = p.t === 'yfence' && p.y1 !== undefined ? (p.y + p.y1) / 2 : p.y;
      // (a post by a jetty is its mooring post: it stands in the water)
      if (p.t === 'post' && dockNear(p.x, p.y)) continue;
      if (wet(x, y)) { gone.add(p); out.wet++; }
      continue;
    }
    if (p.t === 'fenceline' && R.FENCE.has(p.kind || 'iron')) {
      const tx = p.tx || 0, ty = p.ty || 0, L = Math.sqrt(tx * tx + ty * ty);
      if (L < 1) continue;
      if (stop(p.x, p.y)) { gone.add(p); out.dropped++; continue; }
      let s = R.step;
      for (; s <= L; s += R.step) if (stop(p.x + tx * s / L, p.y + ty * s / L)) break;
      if (s > L) continue;
      const keep = s - R.step * 2;   // (stopped a little short of it)
      if (keep < TILE) { gone.add(p); out.dropped++; continue; }
      p.tx = Math.round(tx * keep / L); p.ty = Math.round(ty * keep / L); out.clipped++;
    }
  }
  if (gone.size) dropProps(m, gone);
  return out;
}

// take these props away (the solids that were theirs with them; the hand-placed solids stay)
function dropProps(m, gone) {
  const keep = [], remap = new Map();
  m.props.forEach((pr, i) => { if (gone.has(pr)) return; remap.set(i, keep.length); keep.push(pr); });
  m.props = keep;
  if (Array.isArray(m.lamps)) m.lamps = m.lamps.filter((l) => !gone.has(l));
  if (!m.solidProps) return;
  m.propSolid = new Map();
  for (const [k, arr] of m.solidProps) {
    const kept = arr.filter((e) => e.pi < 0 || remap.has(e.pi));
    for (const e of kept) if (e.pi >= 0) { e.pi = remap.get(e.pi); m.propSolid.set(e.pi, e); }
    if (kept.length) m.solidProps.set(k, kept); else m.solidProps.delete(k);
  }
}
