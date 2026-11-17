// A path to every door (the owner, 2026-11-16, Egret Point: "They also don't have sidewalks or walkways leading up to
// the buildings, they just sit on grass"): World v3's businesses and homes whose door step is lawn, sand or bare ground
// get a paved path (PLAZA) straight out from the door to the nearest pavement, plaza, lot, dock, track or road - a home's
// one tile wide, a shop's as wide as its doorway. Only where the way is clear: open ground all along it (no building,
// water, field or rail, nothing solid but a plant - the plants on it are taken up), at most PATH_MAX tiles. What's left
// (a step with no path in reach, a courtyard's plaza with no way out) is the placement lint's doorOnGrass row
// (tools/placementlint.mjs). For the whole-world build's done hook (shared/world3-world.js), after the walk-ins
// (shared/map.js buildInteriors) and before the clutter's and the homes' paths' passes (world3-clutter.js, world3-tidy.js),
// which keep it clear.
//   doorPaths3(m, H) -> { doors, paved, tiles, far, blocked }    H: { removeProps }
import { TILE, T } from './constants.js';
import { TIDY3 } from './world3-tidy.js';

export const PATH_MAX = 14;
// what a path is made of (a step on one of these needs nothing); what a path may be laid over
export const PATH3 = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.DOCK, T.ROAD, T.BRIDGE, T.DIRT]);
const OVER = new Set([T.GRASS, T.SAND]);
// the places whose doors people walk up to (shared/map.js WALK_IN's and the rest with a door of their own)
export const DOOR_KINDS3 = new Set(['club', 'convenience', 'gasstation', 'hospital', 'gunshop', 'sports', 'hardware', 'clothing', 'grocery', 'pawn', 'bank', 'courthouse', 'pharmacy', 'police',
  'fence', 'fishmarket', 'coffee', 'tackle', 'barber', 'roadhouse', 'charter', 'home', 'diner', 'snack', 'market', 'cinema', 'bowling', 'arcade', 'casino', 'bathhouse', 'smuggler', 'gang',
  'usedlot', 'dealer', 'garage', 'marina', 'winery', 'lodge', 'butcher', 'trapper', 'assay', 'huntcamp', 'clubhouse', 'farmstand', 'fruitstand', 'salvage', 'warehouse']);

// A door's step: the tiles just outside it ([[tx, ty], ...]) and which way is out (1 south, -1 north), or null
export function doorStep3(m, p, units) {
  const b = m.buildings[p.b];
  if (!b || b.gone || b.tw === undefined) return null;
  const U = units.get(p.id);
  if (U) { const dir = U.b.walkIn.south ? 1 : -1, ty = U.u.door.ty + dir, out = []; for (let k = 0; k < (U.u.door.w || 2); k++) out.push([U.u.door.tx + k, ty]); return { b, steps: out, dir }; }
  if (b.door && p.kind === 'home' && b.home === p.home) { const dir = b.door.ty >= b.ty + b.th ? 1 : b.door.ty < b.ty ? -1 : 0; return dir ? { b, steps: [[b.door.tx, b.door.ty]], dir } : null; }
  const at = p.outside || p, tx = Math.floor(at.x / TILE);
  let ty = Math.floor(at.y / TILE);
  const dir = ty >= b.ty + b.th - 1 ? 1 : ty <= b.ty ? -1 : 0;
  if (!dir || tx < b.tx || tx >= b.tx + b.tw) return null;   // (a door on a side wall: left be)
  ty = dir > 0 ? Math.max(ty, b.ty + b.th) : Math.min(ty, b.ty - 1);
  const steps = [[tx, ty]];
  if (p.kind !== 'home' && tx + 1 < b.tx + b.tw) steps.push([tx + 1, ty]);   // (a shop's: two wide)
  return { b, steps, dir };
}

export function doorPaths3(m, H = {}) {
  const out = { doors: 0, paved: 0, tiles: 0, far: 0, blocked: 0 };
  const tile = (x, y) => (m.inside(x, y) ? m.tiles[m.idx(x, y)] : -1);
  const units = new Map();
  for (const id of m.walkIns || []) { const b = m.buildings[id]; for (const u of (b && b.walkIn && b.walkIn.units) || []) units.set(u.poi, { b, u }); }
  const solidAt = (x, y) => { const l = m.solidProps.get(m.idx(x, y)); return l ? l.filter((e) => !e.off) : []; };
  const plantAt = (e) => { const pr = e.pi !== undefined ? m.props[e.pi] : null; return !!(pr && TIDY3.PLANT.test(pr.t)); };
  const pull = new Set(), seen = new Set();
  for (const p of m.pois) {
    if (!p || p.b === undefined || p.b === null || !(DOOR_KINDS3.has(p.kind) || p.walk)) continue;
    const S = doorStep3(m, p, units);
    if (!S) continue;
    const key = S.steps[0].join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.doors++;
    if (S.steps.some(([x, y]) => PATH3.has(tile(x, y)))) continue;
    // straight out from the step to the first path tile in its columns
    let end = -1;
    for (let k = 1; k <= PATH_MAX && end < 0; k++) if (S.steps.some(([x, y]) => PATH3.has(tile(x, y + S.dir * k)))) end = k;
    if (end < 0) { out.far++; continue; }
    const strip = [];
    let ok = true;
    for (let k = 0; k < end && ok; k++) for (const [x, y0] of S.steps) {
      const y = y0 + S.dir * k, t = tile(x, y);
      if (PATH3.has(t)) continue;
      const i = m.inside(x, y) ? m.idx(x, y) : -1;
      if (i < 0 || !OVER.has(t) || m.bld[i] >= 0 || (m.reserve && m.reserve[i] & 3) || (m.rail && m.rail[i]) || solidAt(x, y).some((e) => !plantAt(e))) { ok = false; break; }
      strip.push([x, y, i]);
    }
    if (!ok) { out.blocked++; continue; }
    for (const [x, y, i] of strip) {
      m.tiles[i] = T.PLAZA; out.tiles++;
      for (const e of solidAt(x, y)) if (plantAt(e)) { const pr = m.props[e.pi]; pull.add(pr.x + ',' + pr.y); }
    }
    out.paved++;
  }
  // the plants standing on the new paths (their trunks): taken up
  if (pull.size && H.removeProps) H.removeProps(m, (x, y) => pull.has(x + ',' + y));
  return out;
}
