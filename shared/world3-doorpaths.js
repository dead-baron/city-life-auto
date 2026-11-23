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

export const PATH_MAX = 14, PLANT_R = 30;
// the way round (11-22, the audit's doorOnGrass 372: a door facing a back lawn, a path that has to turn): when the straight
// path can't be laid, the fewest new tiles over open ground to a path that reaches a road - at most PATH_ROUND of them -
// and the same from a door's plaza or yard that reaches no road (a pocket of paving out on a lawn). REACH: how far along
// paths a road is looked for (the lint's DOOR_REACH).
export const PATH_ROUND = 22, REACH = 400;
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
  const out = { doors: 0, paved: 0, tiles: 0, far: 0, blocked: 0, round: 0, joined: 0 };
  const tile = (x, y) => (m.inside(x, y) ? m.tiles[m.idx(x, y)] : -1);
  const units = new Map();
  for (const id of m.walkIns || []) { const b = m.buildings[id]; for (const u of (b && b.walkIn && b.walkIn.units) || []) units.set(u.poi, { b, u }); }
  const solidAt = (x, y) => { const l = m.solidProps.get(m.idx(x, y)); return l ? l.filter((e) => !e.off) : []; };
  const plantAt = (e) => { const pr = e.pi !== undefined ? m.props[e.pi] : null; return !!(pr && TIDY3.PLANT.test(pr.t)); };
  const pull = new Set(), seen = new Set();
  // the map's plants by tile (made when first wanted)
  let PL = null;
  const plantsAt = () => { if (!PL) { PL = new Map(); for (const pr of m.props) if (pr && TIDY3.PLANT.test(pr.t)) { const k = Math.floor(pr.y / TILE) * 65536 + Math.floor(pr.x / TILE); let l = PL.get(k); if (!l) PL.set(k, (l = [])); l.push(pr); } } return PL; };
  const open = (x, y) => {   // (ground a path may be laid over)
    if (!m.inside(x, y)) return false;
    const i = m.idx(x, y);
    return OVER.has(m.tiles[i]) && !(m.bld[i] >= 0) && !(m.reserve && m.reserve[i] & 3) && !(m.rail && m.rail[i]) && !solidAt(x, y).some((e) => !plantAt(e));
  };
  // does a path from these tiles reach a road within REACH steps (cached: a whole plaza is walked once)
  const reach = new Map();
  const toRoad = (starts) => {
    const seenT = new Map(), q = [];
    for (const [x, y] of starts) { const i = m.idx(x, y); if (reach.has(i)) return reach.get(i); seenT.set(i, 0); q.push(x, y); }
    let ok = false;
    for (let h = 0; h < q.length && !ok; h += 2) {
      const x = q[h], y = q[h + 1], i = m.idx(x, y), d = seenT.get(i), t = m.tiles[i];
      if (t === T.ROAD || t === T.BRIDGE) { ok = true; break; }
      if (d >= REACH) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!m.inside(nx, ny)) continue;
        const j = m.idx(nx, ny);
        if (seenT.has(j) || !PATH3.has(m.tiles[j])) continue;
        seenT.set(j, d + 1); q.push(nx, ny);
      }
    }
    for (const i of seenT.keys()) reach.set(i, ok);
    return ok;
  };
  // the fewest new tiles of path from `from` (a door's step on open ground; or, `pocket`, the paving it stands on and all
  // that paving joins) over open ground to a path that reaches a road; laid if found. Out from the door first, then to
  // the sides, so a path runs straight where it can.
  const round = (from, dir, pocket = false) => {
    const prev = new Map(), q = [], D = new Map(), at = new Map();
    const order = [[0, dir], [1, 0], [-1, 0], [0, -dir]];
    if (pocket) {
      // the pocket: its paving (no road in it, or toRoad would have said so)
      const pq = [];
      for (const [x, y] of from) { const i = m.idx(x, y); if (!D.has(i)) { D.set(i, 0); pq.push(x, y); } }
      for (let h = 0; h < pq.length && pq.length < 2 * REACH * 4; h += 2) for (const [dx, dy] of order) {
        const nx = pq[h] + dx, ny = pq[h + 1] + dy;
        if (!m.inside(nx, ny)) continue;
        const j = m.idx(nx, ny);
        if (D.has(j) || !PATH3.has(m.tiles[j])) continue;
        D.set(j, 0); pq.push(nx, ny);
      }
      for (let h = 0; h < pq.length; h += 2) q.push(pq[h], pq[h + 1]);
    } else for (const [x, y] of from) { if (!open(x, y)) return false; const i = m.idx(x, y); D.set(i, 1); at.set(i, [x, y]); q.push(x, y); }
    let goal = -1;
    for (let h = 0; h < q.length && goal < 0; h += 2) {
      const x = q[h], y = q[h + 1], i = m.idx(x, y), d = D.get(i);
      for (const [dx, dy] of order) {
        const nx = x + dx, ny = y + dy;
        if (!m.inside(nx, ny)) continue;
        const j = m.idx(nx, ny);
        if (D.has(j)) continue;
        if (d > 0 && PATH3.has(m.tiles[j]) && toRoad([[nx, ny]])) { prev.set(j, i); goal = i; break; }
        if (d >= PATH_ROUND || !open(nx, ny)) continue;
        D.set(j, d + 1); prev.set(j, i); at.set(j, [nx, ny]); q.push(nx, ny);
      }
    }
    if (goal < 0) return false;
    // back from the last new tile to the door, paving the open ground on the way
    for (let i = goal; i !== undefined && D.get(i) > 0; i = prev.get(i)) {
      if (!OVER.has(m.tiles[i])) continue;
      const [x, y] = at.get(i);
      m.tiles[i] = T.PLAZA; out.tiles++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const pr of plantsAt().get((y + dy) * 65536 + x + dx) || []) if (Math.abs(pr.x - (x + 0.5) * TILE) < PLANT_R && Math.abs(pr.y - (y + 0.5) * TILE) < TILE) pull.add(pr.x + ',' + pr.y);
      reach.set(i, true);
    }
    return true;
  };
  for (const p of m.pois) {
    if (!p || p.b === undefined || p.b === null || !(DOOR_KINDS3.has(p.kind) || p.walk)) continue;
    const S = doorStep3(m, p, units);
    if (!S) continue;
    const key = S.steps[0].join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.doors++;
    if (S.steps.some(([x, y]) => PATH3.has(tile(x, y)))) {
      // on paving already - but paving that reaches no road (a plaza or a yard out on a lawn): joined to one that does
      const on = S.steps.filter(([x, y]) => PATH3.has(tile(x, y)));
      if (!toRoad(on) && round(on, S.dir, true)) out.joined++;
      continue;
    }
    // straight out from the step to the first path tile in its columns
    let end = -1;
    for (let k = 1; k <= PATH_MAX && end < 0; k++) if (S.steps.some(([x, y]) => PATH3.has(tile(x, y + S.dir * k)))) end = k;
    if (end < 0) { if (round(S.steps, S.dir)) out.round++; else out.far++; continue; }
    const strip = [];
    let ok = true;
    for (let k = 0; k < end && ok; k++) for (const [x, y0] of S.steps) {
      const y = y0 + S.dir * k, t = tile(x, y);
      if (PATH3.has(t)) continue;
      const i = m.inside(x, y) ? m.idx(x, y) : -1;
      if (i < 0 || !OVER.has(t) || m.bld[i] >= 0 || (m.reserve && m.reserve[i] & 3) || (m.rail && m.rail[i]) || solidAt(x, y).some((e) => !plantAt(e))) { ok = false; break; }
      strip.push([x, y, i]);
    }
    if (!ok) { if (round(S.steps, S.dir)) out.round++; else out.blocked++; continue; }
    for (const [x, y, i] of strip) {
      m.tiles[i] = T.PLAZA; out.tiles++;
      // (and a tree whose foot reaches over it from the tile beside: its trunk within PLANT_R px of the path's middle)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const pr of plantsAt().get((y + dy) * 65536 + x + dx) || []) if (Math.abs(pr.x - (x + 0.5) * TILE) < PLANT_R && Math.abs(pr.y - (y + 0.5) * TILE) < TILE) pull.add(pr.x + ',' + pr.y);
    }
    out.paved++;
  }
  // the plants standing on the new paths (their trunks): taken up
  if (pull.size && H.removeProps) H.removeProps(m, (x, y) => pull.has(x + ',' + y));
  return out;
}
