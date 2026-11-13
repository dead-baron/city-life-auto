// The world tidied last (the owner's 10-16 list: "fence posts and hay bales spawning over water; fences across
// driveways; plants and trees on train tracks"). The world is laid in many passes - fields, then rivers through them,
// then the river banks wandering, then lanes from the farmsteads - and a later pass can put water or a road under what
// an earlier one placed. So, after everything else (shared/world3-world.js's done hook, last):
//   - what only stands on dry ground (a tree, a bush, a flower bed, a fence post, a bale, a bench, a yard fence's
//     panel) and has water under it now is taken away;
//   - a boat moored with dry ground under it now is taken away; a standing sign in the wilds made a wooden one;
//   - a fence run that meets a road, a bridge or the water now stops short of it (a farm gate's fence along the road
//     where a lane or a side road comes in; a garden fence a street cuts across), and one with nothing left goes.
// (The ground cover, drawn by the page, keeps off the rails itself: client/art2/game/statics.js railClear.)
// For the whole-world build only. Deterministic: arithmetic.
import { TILE, T } from './constants.js';
import { DISTRICTS } from './mapcore.js';

// LAND: the prop types that need dry ground under them (plants by species: reeds and cattails grow in the water);
// WET_SP: the plants that stand in water; FENCE: the fence kinds that stop at a road or the water; step: px along a run
export const TIDY3 = {
  LAND: new Set(['tree_a', 'tree_b', 'palm_a', 'palm_b', 'palm_c', 'palm_d', 'palm_s', 'shrub_a', 'shrub_b', 'bush_a', 'bush_b', 'bush_c', 'flowers_a', 'flowers_big', 'cactus', 'redwood', 'rwstump',
    'post', 'hayBale', 'scarecrow', 'pbench', 'bench', 'bench_a', 'bench_b', 'picnic', 'yfence', 'mailbox', 'trough', 'woodpile']),
  WET_SP: new Set(['reeds', 'cattails', 'lily', 'papyrus', 'mangrove', 'cypress']),
  FENCE: new Set(['wood', 'rail', 'picket', 'iron', 'chain', 'stone']),
  step: 8,
  PLANT: /^(tree_[ab]|palm_[abcds]|shrub_[ab]|bush_[abc]|flowers_(a|big)|cactus)$/,   // (what grows: never up on a roof)
  STREET: /^(fountain|bench_[mab]|bench|pbench|trashcan|planter_(sq|fl|g)|umbrella_[rgby]|cafetable|lamp|hydrant|mailbox|picnic)$/,   // (a plaza's, a pavement's: never in a city block)
  dupR: 4.5 * TILE,   // (a board this near a building whose front says the same: one too many)
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
  // a plant standing in a building's walls - a palm or a shrub up on a row of houses' roofs (an earlier pass planted the
  // ground a later one built over); a plaza's furniture - its fountain, benches, bins - inside a city block built over it
  if (m.bld && Array.isArray(m.buildings)) for (const p of m.props) {
    if (!p || gone.has(p)) continue;
    const plant = R.PLANT.test(p.t);
    if (!plant && !R.STREET.test(p.t)) continue;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (tx < 0 || ty < 0 || tx >= W || ty >= HH) continue;
    const b = m.buildings[m.bld[ty * W + tx]];
    if (b && (plant || (b.kind === 'roof' && !b.hand)) && tx > b.tx && tx < b.tx + b.tw - 1 && ty > b.ty && ty < b.ty + b.th - 1) { gone.add(p); out.onRoof = (out.onRoof || 0) + 1; }   // (not its edge row: a bed against its wall)
  }
  // a standing board right in front of a building, its face over the building's ground floor - its door, its name: one
  // that says what the front says already goes (the owner, 2026-11-13: "two Harbor Marina signs"); another steps out
  // until its face is clear of the front (where there's ground for it)
  if (m.bld && Array.isArray(m.buildings)) {
    const up = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9&' ]/g, ' ').replace(/\s+/g, ' ').trim();
    const says = (b) => new Set([...(b.signs || []).map((q) => up(q.text)), ...(b.art && b.art.shop && b.art.shop.sign && b.art.shop.sign.text ? [up(b.art.shop.sign.text)] : [])]);
    const ground = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); if (tx < 0 || ty < 0 || tx >= W || ty >= HH) return false; const i = ty * W + tx, t = m.tiles[i]; return m.bld[i] < 0 && t !== T.ROAD && t !== T.WATER && t !== T.DEEP && t !== T.BRIDGE && t !== T.BUILDING && !(m.deck && m.deck[i]); };
    for (const p of m.props) {
      if (!p || gone.has(p) || p.t !== 'textsign') continue;
      const z = p.z || 40, hw = String(p.text || '').length * 6 + 8, top = p.y - z - 26, tx0 = Math.floor((p.x - hw) / TILE), tx1 = Math.floor((p.x + hw) / TILE), ty0 = Math.floor((p.y - 5 * TILE) / TILE), ty1 = Math.floor(p.y / TILE);
      const fronts = new Set();
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (tx >= 0 && ty >= 0 && tx < W && ty < HH && m.bld[ty * W + tx] >= 0) fronts.add(m.bld[ty * W + tx]);
      for (const bi of fronts) {
        const b = m.buildings[bi]; if (!b) continue;
        const yg = (b.ty + b.th) * TILE, near = Math.max(b.tx * TILE - p.x, 0, p.x - (b.tx + b.tw) * TILE, b.ty * TILE - p.y, 0, p.y - yg) <= R.dupR;
        if (near && says(b).has(up(p.text))) { gone.add(p); out.dupBoard = (out.dupBoard || 0) + 1; break; }
        if (p.y < yg + 2 || !(p.x - hw < (b.tx + b.tw) * TILE - 6 && p.x + hw > b.tx * TILE + 6 && top < yg - 4 && p.y - z > yg - 64)) continue;
        const ny = yg + z + 28;   // (the board's top - z and its own height up - clear of the front's foot)
        if (ny - p.y <= 2.5 * TILE && ground(p.x, ny) && ground(p.x - hw * 0.8, ny) && ground(p.x + hw * 0.8, ny)) { p.y = ny; out.boardOut = (out.boardOut || 0) + 1; }
      }
    }
  }
  if (gone.size) dropProps(m, gone);
  // a standing sign out in the wilds is a trail sign - planks on posts, its words cut in - not a lit panel (the owner,
  // 2026-11-13: "it should just be a more appropriate wooden sign"; client/art2/game/statics.js 'textsign' p.wood). A
  // board chosen lit stays lit (p.lit: the water park's)
  for (const p of m.props) if (p && p.t === 'textsign' && !p.wood && !p.lit && wildAt(m, p.x, p.y)) { p.wood = 1; out.wood = (out.wood || 0) + 1; }
  // and the other way round: a boat moored where there's no water under it now - an earlier pass's (the old Pelican Key's
  // jetty boats, its island under World v3's city) - is taken away (test/placementlint.test.js)
  if (Array.isArray(m.marina)) { const n0 = m.marina.length; m.marina = m.marina.filter((b) => !b || wet(b.x, b.y)); out.dry = n0 - m.marina.length; }
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

// out in the wilds: the district a point is in a 'wild' one - on the water (a river's, the bay's), the land's beside it
export function wildAt(m, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), W = m.w, HH = m.h;
  const dAt = (X, Y) => (X >= 0 && Y >= 0 && X < W && Y < HH ? DISTRICTS[m.dist[Y * W + X]] : null);
  let d = dAt(tx, ty);
  if (d && d.style === 'water') { d = null; for (let r = 1; r <= 6 && !d; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) { const q = dAt(tx + dx, ty + dy), i = (ty + dy) * W + tx + dx; if (q && q.style !== 'water' && m.land[i]) { d = q; break; } } }
  return !!(d && d.tier === 'wild');
}
