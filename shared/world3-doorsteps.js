// Doors kept clear (the owner, 11-23: "the market hall's door behind a planter"): nothing solid on a door's step or on
// the tile out past it, across the doorway's width. One answer for the build (clearDoorSteps3, World v3's done hook:
// shared/world3-world.js) and the placement lint (tools/placementlint.mjs doorBlocked).
//   doorSteps(m, want) (want: doorPoi(WALK_IN)) -> [{ p (the place), b (its building), steps [[tx, ty]...], dy (+1: the door opens south) }]
//   doorBox(d) -> { x0, y0, x1, y1 } the step and the tile past it, in world px, a few px in from the edges
//   blockersOf(m, box) -> the solids ({ x, y, r, pi }) on it
//   clearDoorSteps3(m) -> { moved, dropped, left }: what stood there slid along the wall out of the doorway (a planter, a
//     table, a lamp, a pole); a planter, a table, a bench, a vending machine with nowhere to go is taken up; a hand-placed
//     solid is left (counted)
import { TILE, T } from './constants.js';

// the places with a door of their own (the lint's doors too: tools/placementlint.mjs) - a walk-in's (WALK_IN: map.js), a
// home's, a diner's...; a cash machine or a phone in a wall is no door
export const DOOR_EXTRA = ['charter', 'home', 'diner', 'snack', 'market', 'cinema', 'bowling', 'arcade', 'casino', 'bathhouse', 'smuggler', 'gang', 'usedlot', 'dealer', 'garage', 'marina', 'winery', 'lodge', 'butcher', 'trapper', 'assay', 'huntcamp', 'clubhouse', 'farmstand', 'fruitstand', 'salvage', 'warehouse'];
export const doorPoi = (WALK_IN) => { const K = new Set([...WALK_IN, ...DOOR_EXTRA]); return (p) => !!p.walk || K.has(p.kind); };
// the door's step: a walk-in unit's doorway's row outside; a building's own door; else the place's spot (stepped out of
// the wall when it's on it)
export function doorSteps(m, want) {
  const unitOf = new Map(), out = [], done = new Set();
  for (const id of m.walkIns || []) { const b = m.buildings[id]; for (const u of (b && b.walkIn && b.walkIn.units) || []) unitOf.set(u.poi, { b, u }); }
  const tileOf = (tx, ty) => (m.inside(tx, ty) ? m.tiles[m.idx(tx, ty)] : -1);
  for (const p of m.pois || []) {
    if (!p || p.b === undefined || p.b === null || !want(p)) continue;
    const b = m.buildings[p.b];
    if (!b || b.gone || b.tw === undefined) continue;
    const U = unitOf.get(p.id);
    let steps, dy;
    if (U) { dy = U.b.walkIn.south ? 1 : -1; const fy = U.u.door.ty + dy; steps = []; for (let k = 0; k < (U.u.door.w || 2); k++) steps.push([U.u.door.tx + k, fy]); }
    else {
      const at = p.outside || p;
      const tx = Math.floor(at.x / TILE);
      let ty = Math.floor(at.y / TILE);
      if (tileOf(tx, ty) === T.BUILDING || tileOf(tx, ty) === T.WALL) ty += at.y >= (b.ty + b.th / 2) * TILE ? 1 : -1;
      steps = [[tx, ty]];
      dy = ty >= b.ty + b.th / 2 ? 1 : -1;
    }
    const key = `${steps[0][0]},${steps[0][1]}`;
    if (done.has(key)) continue;
    done.add(key);
    out.push({ p, b, U, steps, dy });
  }
  return out;
}
export function doorBox(d) {
  const xs = d.steps.map((q) => q[0]), y0 = Math.min(d.steps[0][1], d.steps[0][1] + d.dy), y1 = Math.max(d.steps[0][1], d.steps[0][1] + d.dy);
  return { x0: Math.min(...xs) * TILE + 4, x1: (Math.max(...xs) + 1) * TILE - 4, y0: y0 * TILE + 4, y1: (y1 + 1) * TILE - 4 };
}
const onBox = (e, B, x = e.x, y = e.y) => x + e.r - 2 > B.x0 && x - e.r + 2 < B.x1 && y + e.r - 2 > B.y0 && y - e.r + 2 < B.y1;
export function blockersOf(m, B) {
  const out = [];
  for (let ty = Math.floor(B.y0 / TILE) - 1; ty <= Math.floor(B.y1 / TILE) + 1; ty++) for (let tx = Math.floor(B.x0 / TILE) - 1; tx <= Math.floor(B.x1 / TILE) + 1; tx++) {
    const arr = m.inside(tx, ty) ? m.solidProps.get(m.idx(tx, ty)) : null;
    if (arr) for (const e of arr) if (!e.off && onBox(e, B) && !out.includes(e)) out.push(e);
  }
  return out;
}

// what may be taken up when there's nowhere along the wall to slide it (the street's lamps and poles, a hydrant, a tree in
// its grate stay where they are rather than go)
const LOOSE = /^(planter|pot|cafetable|table|bench|vend|bin|crate|aboard|menuboard|chair|parasol)/;
// what may slide along the wall: those, the street's lamps and power poles, a hydrant, a bollard, a tree (never a traffic light - a sigpole:
// it belongs to its crossing)
const SLIDES = /^(planter|pot|cafetable|table|bench|vend|bin|crate|aboard|menuboard|chair|parasol|lamp|upole|hydrant|bollard|tree)/;
const GROUND = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.DOCK]);
export function clearDoorSteps3(m, WALK_IN) {
  const out = { doors: 0, moved: 0, dropped: 0, left: 0 };
  if (!m.solidProps || !Array.isArray(m.props)) return out;
  const doors = doorSteps(m, doorPoi(WALK_IN)), boxes = doors.map(doorBox), gone = new Set();
  out.doors = doors.length;
  const anyDoor = (e, x, y) => boxes.some((B) => onBox(e, B, x, y));
  const solidsOf = (pi) => {
    const p = m.props[pi], L = [];
    for (let ty = Math.floor(p.y / TILE) - 2; ty <= Math.floor(p.y / TILE) + 2; ty++) for (let tx = Math.floor(p.x / TILE) - 2; tx <= Math.floor(p.x / TILE) + 2; tx++) {
      const arr = m.inside(tx, ty) ? m.solidProps.get(m.idx(tx, ty)) : null;
      if (arr) for (const e of arr) if (e.pi === pi && !L.includes(e)) L.push(e);
    }
    return L;
  };
  const free = (S, dx, dy) => {
    for (const e of S) {
      const x = e.x + dx, y = e.y + dy, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (!m.inside(tx, ty) || !GROUND.has(m.tiles[m.idx(tx, ty)]) || anyDoor(e, x, y)) return false;
      for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
        const arr = m.inside(xx, yy) ? m.solidProps.get(m.idx(xx, yy)) : null;
        if (arr) for (const q of arr) if (!q.off && !S.includes(q) && Math.hypot(q.x - x, q.y - y) < q.r + e.r + 2) return false;
      }
    }
    return true;
  };
  const shift = (pi, S, dx, dy) => {
    const p = m.props[pi];
    p.x += dx; p.y += dy;
    for (const e of S) {
      const k0 = m.idx(Math.floor(e.x / TILE), Math.floor(e.y / TILE));
      e.x += dx; e.y += dy;
      const k1 = m.idx(Math.floor(e.x / TILE), Math.floor(e.y / TILE));
      if (k1 === k0) continue;
      const a = m.solidProps.get(k0), j = a ? a.indexOf(e) : -1;
      if (j >= 0) { a.splice(j, 1); if (!a.length) m.solidProps.delete(k0); }
      let bArr = m.solidProps.get(k1); if (!bArr) m.solidProps.set(k1, (bArr = [])); bArr.push(e);
    }
  };
  for (let d = 0; d < doors.length; d++) {
    for (const e of blockersOf(m, boxes[d])) {
      if (e.pi === undefined || e.pi < 0 || !m.props[e.pi] || gone.has(m.props[e.pi])) { out.left++; continue; }
      const pi = e.pi, p = m.props[pi], S = solidsOf(pi);
      if (!SLIDES.test(p.t)) { out.left++; continue; }
      // along the wall (the door's row), the nearer way first, up to three tiles
      let done = false;
      const side = p.x < (boxes[d].x0 + boxes[d].x1) / 2 ? -1 : 1;
      for (let k = 4; k <= 3 * TILE && !done; k += 4) for (const s of [side, -side]) if (!done && free(S, s * k, 0)) { shift(pi, S, s * k, 0); done = true; out.moved++; }
      if (done) continue;
      if (LOOSE.test(p.t)) { gone.add(p); out.dropped++; } else out.left++;
    }
  }
  if (gone.size) dropProps3(m, gone);
  return out;
}
// (world3-tidy.js dropProps: the props and their solids, the indices renumbered)
function dropProps3(m, gone) {
  const keep = [], remap = new Map();
  m.props.forEach((pr, i) => { if (gone.has(pr)) return; remap.set(i, keep.length); keep.push(pr); });
  m.props = keep;
  if (Array.isArray(m.lamps)) m.lamps = m.lamps.filter((l) => !gone.has(l));
  m.propSolid = new Map();
  for (const [k, arr] of m.solidProps) {
    const kept = arr.filter((e) => e.pi < 0 || remap.has(e.pi));
    for (const e of kept) if (e.pi >= 0) { e.pi = remap.get(e.pi); m.propSolid.set(e.pi, e); }
    if (kept.length) m.solidProps.set(k, kept); else m.solidProps.delete(k);
  }
}
