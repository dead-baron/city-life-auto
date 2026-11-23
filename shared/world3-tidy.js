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
import { hash2 } from './rng.js';

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
export function dropProps(m, gone) {
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

// A house's path and its drive (the owner, 2026-11-14: "Some driveways have plants growing on them ... keep plants off
// driveways, paths and doors for all homes"): the paved strip from its door, and from where its car stands (its garage
// spot, the drive's parking), down across its lawn to the street (only in a row with lawn in it - an all-paved row is
// the pavement or a paved forecourt), and its door step. -> Map(tile index -> the home). tools/placementlint.mjs
// plantOnPath reads the same strips.
const PATH_PAVED = new Set([T.LOT, T.PLAZA, T.SIDEWALK]), PATH_LAWN = new Set([T.GRASS, T.DIRT]);
export function homePaths3(m) {
  const path = new Map(), drives = (m.parking || []).filter((sp) => sp && sp.drive);
  for (const h of m.homes || []) {
    const b = h && h.kind === 'house' ? m.buildings[h.b] : null;
    if (!b || !b.door || b.door.ty < b.ty + b.th) continue;
    const y1 = b.ty + b.th, X0 = (b.tx - 2) * TILE, X1 = (b.tx + b.tw + 2) * TILE, cols = new Set();
    for (let k = 0; k < (b.door.w || 1); k++) cols.add(b.door.tx + k);
    const car = (x, y) => { if (x > X0 && x < X1 && y > y1 * TILE - 8 && y < (y1 + 8) * TILE) { const tx = Math.floor(x / TILE); cols.add(tx - 1); cols.add(tx); } };
    if (h.garage) car(h.garage.x, h.garage.y);
    for (const sp of drives) car(sp.x, sp.y);
    for (const tx of cols) for (let ty = y1; ty < y1 + 8; ty++) {
      if (!m.inside(tx, ty)) break;
      if (!PATH_PAVED.has(m.tiles[m.idx(tx, ty)])) { if (ty > y1) break; continue; }
      let lawn = false;
      for (let x = b.tx; x < b.tx + b.tw && !lawn; x++) if (m.inside(x, ty) && PATH_LAWN.has(m.tiles[m.idx(x, ty)])) lawn = true;
      if (!lawn) break;
      path.set(m.idx(tx, ty), h);
    }
    for (let k = 0; k < (b.door.w || 1); k++) if (m.inside(b.door.tx + k, y1)) path.set(m.idx(b.door.tx + k, y1), h);
  }
  return path;
}
// what stands over one of those strips: a plant whose foot (hw px either side of it) is on one
export function onHomePath(m, path, x, y, hw) {
  for (let tx = Math.floor((x - hw) / TILE); tx <= Math.floor((x + hw) / TILE); tx++) for (const ty of [Math.floor((y - 4) / TILE), Math.floor((y + 4) / TILE)]) if (m.inside(tx, ty)) { const h = path.get(m.idx(tx, ty)); if (h) return h; }
  return null;
}
// the map's plants off the houses' paths and drives (the done hook, after tidyProps3): taken away. -> how many
export function clearHomePaths3(m, removeProps) {
  if (!removeProps || !Array.isArray(m.props)) return 0;
  const path = homePaths3(m), gone = new Set();
  for (const p of m.props) if (p && TIDY3.PLANT.test(p.t) && onHomePath(m, path, p.x, p.y, 14)) gone.add(p.x + ',' + p.y);
  if (gone.size) removeProps(m, (x, y) => gone.has(x + ',' + y));
  return gone.size;
}

// Black bin bags only by a bin, or anywhere in the rough districts (DECISIONS, World: "Black bin bags only a few, near cans
// or in rough alleys", 10-10; the audit's binBags, 44 on 11-19): the bags that are neither. The lint counts with this
// (tools/audit/worldrows.mjs) and the build takes them up (strayBags3, the done hook) - one rule, no drift.
export const BAGS = { near: 3 * TILE, BINS: /^(trashcan|dump_[gbo]|trashpile|burnbarrel)$/ };
export function strayBags(m) {
  const bins = m.props.filter((p) => p && BAGS.BINS.test(p.t)), BC = 256, g = new Map(), out = [];
  for (const b of bins) { const k = Math.floor(b.y / BC) * 100000 + Math.floor(b.x / BC); let l = g.get(k); if (!l) g.set(k, (l = [])); l.push(b); }
  for (const p of m.props) {
    if (!p || p.t !== 'bags') continue;
    const D = m.districtAt ? m.districtAt(p.x, p.y) : null;
    if (D && D.tier === 'rough') continue;
    let ok = false;
    for (let j = -1; j <= 1 && !ok; j++) for (let i = -1; i <= 1 && !ok; i++) for (const b of g.get((Math.floor(p.y / BC) + j) * 100000 + Math.floor(p.x / BC) + i) || []) if (Math.hypot(b.x - p.x, b.y - p.y) < BAGS.near) { ok = true; break; }
    if (!ok) out.push(p);
  }
  return out;
}
// A few bags piled beside some bins in the rough districts (the owner, 11-23 07:09: "a few bags but not too many, just some
// bins have some bags piled next to it in rough neighborhoods"): about one bin in three with the ones that had bags
// already (BIN_BAGS.share of the rest, a trash can or a
// dumpster - a trash pile is one already), a bag or two at its side on the same kind of ground - never in the road, on a
// door's step, or on another thing. One with bags beside it already is left as it is.
export const BIN_BAGS = { share: 0.25, BINS: /^(trashcan|dump_[gbo])$/, near: 3 * TILE, clear: 14 };
const BAG_GROUND = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.DIRT]);
export function binBags3(m, H3) {
  if (!Array.isArray(m.props) || !H3 || !H3.addProp) return 0;
  const C = 128, grid = new Map(), cell = (x, y) => Math.floor(y / C) * 100000 + Math.floor(x / C);
  const index = (p) => { const k = cell(p.x, p.y); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(p); };
  for (const p of m.props) if (p) index(p);
  const nearAny = (x, y, r, test) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const q of grid.get(cell(x, y) + j * 100000 + i) || []) if ((!test || test(q)) && Math.hypot(q.x - x, q.y - y) < r) return true; return false; };
  const doors = new Set();
  for (const b of m.buildings || []) {   // (a building's door and its walk-in's doorways: the step kept clear)
    if (!b) continue;
    if (b.door && m.inside(b.door.tx, b.door.ty)) for (let k = 0; k < (b.door.w || 2); k++) if (m.inside(b.door.tx + k, b.door.ty)) doors.add(m.idx(b.door.tx + k, b.door.ty));
    for (const u of (b.walkIn && b.walkIn.units) || []) if (u.door) for (let k = 0; k < (u.door.w || 2); k++) for (const ty of [u.door.ty, u.door.ty + 1, u.door.ty - 1]) if (m.inside(u.door.tx + k, ty)) doors.add(m.idx(u.door.tx + k, ty));
  }
  const bins = m.props.filter((p) => p && BIN_BAGS.BINS.test(p.t));
  let n = 0;
  for (const b of bins) {
    const D = m.districtAt ? m.districtAt(b.x, b.y) : null;
    if (!D || D.tier !== 'rough') continue;
    const bx = Math.round(b.x), by = Math.round(b.y);
    if (hash2(bx, by, 1123) >= BIN_BAGS.share) continue;
    if (nearAny(b.x, b.y, BIN_BAGS.near, (q) => q.t === 'bags')) continue;
    const big = b.t !== 'trashcan', off = big ? 34 : 22, count = big || hash2(bx, by, 1124) < 0.5 ? 2 : 1;
    const ground = m.inside(Math.floor(b.x / TILE), Math.floor(b.y / TILE)) ? m.tiles[m.idx(Math.floor(b.x / TILE), Math.floor(b.y / TILE))] : -1;
    const sides = hash2(bx, by, 1125) < 0.5 ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[-1, 0], [1, 0], [0, 1], [0, -1]];
    const fits = (x, y) => {
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (!m.inside(tx, ty)) return false;
      const i = m.idx(tx, ty), t = m.tiles[i];
      return BAG_GROUND.has(t) && (t === ground || ground === -1) && !doors.has(i) && !nearAny(x, y, BIN_BAGS.clear, (q) => q !== b);
    };
    for (const [dx, dy] of sides) {
      const spots = [];
      for (let k = 0; k < count; k++) spots.push([b.x + dx * (off + k * 12) + dy * (k ? 7 : 0), b.y + dy * (off + k * 12) + dx * (k ? 6 : 0)]);
      if (!spots.every(([x, y]) => fits(x, y))) continue;
      for (const [x, y] of spots) { H3.addProp(m, 'bags', Math.round(x), Math.round(y), 0); index(m.props[m.props.length - 1]); n++; }
      break;
    }
  }
  return n;
}
// A walk-in that opens on its north side (the side the camera doesn't see - its roof covers the step) gets an A-board out
// in front of it, in line with its doorway, as far out as its roof hides (NORTH_BOARD.out tiles, nearer if the paving
// ends): the way in reads from the street it faces. With the lit sign on its roof's north edge (art: statics.js) - the
// owner, 11-23: "Keep, make doors read". On paving only (a pavement, a plaza, a lot), clear of other things.
export const NORTH_BOARD = { out: 6, min: 3, clear: 20 };
const BOARD_GROUND = new Set([T.SIDEWALK, T.PLAZA, T.LOT]);
export function northDoorBoards3(m, H3) {
  if (!H3 || !H3.addProp || !Array.isArray(m.props)) return 0;
  let n = 0;
  for (const id of m.walkIns || []) {
    const b = m.buildings[id];
    if (!b || !b.walkIn || b.walkIn.south || b.gone) continue;
    for (const u of b.walkIn.units || []) {
      if (!u.door) continue;
      const x = (u.door.tx + (u.door.w || 2) / 2) * TILE;
      let at = -1;
      for (let k = 1; k <= NORTH_BOARD.out; k++) {
        const tx = Math.floor(x / TILE), ty = u.door.ty - k;
        if (!m.inside(tx, ty) || !BOARD_GROUND.has(m.tiles[m.idx(tx, ty)])) break;
        if (k >= NORTH_BOARD.min) at = ty;
      }
      if (at < 0) continue;
      const y = (at + 0.5) * TILE;
      if (m.props.some((q) => q && Math.abs(q.x - x) < NORTH_BOARD.clear && Math.abs(q.y - y) < NORTH_BOARD.clear)) continue;
      H3.addProp(m, 'aboard', Math.round(x), Math.round(y), 0);
      n++;
    }
  }
  return n;
}
export function strayBags3(m) {
  if (!Array.isArray(m.props)) return 0;
  const gone = new Set(strayBags(m));
  if (gone.size) dropProps(m, gone);
  return gone.size;
}
