// World v3's handcrafted districts (the World v3 Handcraft Plan, 2026-10-17): districts laid out by hand instead of by
// the city's street grid and block filler. Each plan (shared/world3-midtown.js ...) says:
//   key, d (its district id), rect [x0, y0, x1, y1] (frame tiles: its area - the grid planner lays no street strictly
//   inside it, the block filler gets only what it leaves), streets() -> [{ name, kind, pts: [[x, y], ...] (tiles) }],
//   build(m, api, kit): every lot, prop and business laid before the generator looks for blocks (shared/map.js handApi:
//   handBuilding, addProp, roofOne...; kit: this module's composers, below).
// The generator side only (shared/world3-world.js wires it in): the page never imports this.
// Deterministic: integer data, hash2 / mulberry32 draws, no Math.random, no trigonometry.
import { TILE, T } from './constants.js';
import { DISTRICTS } from './mapcore.js';
import { hash2 } from './rng.js';
import { MIDTOWN } from './world3-midtown.js';
import { NEON } from './world3-neon.js';
import { HARBOR } from './world3-harbor.js';
import { DOWNTOWN } from './world3-downtown.js';
import { CIVIC } from './world3-civic.js';
import { NORTHGATE } from './world3-northgate.js';
import { NORTHGATE2 } from './world3-northgate2.js';
import { WESTHILLS } from './world3-westhills.js';
import { WESTHILLS2 } from './world3-westhills2.js';
import { WESTPORT } from './world3-westport.js';
import { OLDQUARTER } from './world3-oldquarter.js';
import { SOUTHSIDE } from './world3-southside.js';
import { PORT } from './world3-port.js';
import { CEDARFALLS } from './world3-cedarfalls.js';
import { FALLSCENTER } from './world3-fallscenter.js';
import { OLDTOWN } from './world3-oldtown.js';
import { YARDS } from './world3-yards.js';
import { STADIUM } from './world3-stadium.js';
import { PINKMILE } from './world3-pinkmile.js';
import { ARTS } from './world3-arts.js';
import { BAYSIDE } from './world3-bayside.js';

export const HAND_PLANS = [MIDTOWN, NEON, HARBOR, DOWNTOWN, CIVIC, NORTHGATE, NORTHGATE2, OLDTOWN, YARDS, STADIUM, PINKMILE, ARTS, BAYSIDE, WESTHILLS, WESTHILLS2, WESTPORT, OLDQUARTER, SOUTHSIDE, PORT, CEDARFALLS, FALLSCENTER];
const M_IN = 2;   // (a street within this many tiles of a plan's edge is the edge's - the grid planner's)
// (a plan of several rects - Downtown's bands round its park - is in its area strictly inside any of them; p.rect is
// their bounding box: the kit's frame)
export const handPlanAt = (x, y) => HAND_PLANS.find((p) => (p.rects || [p.rect]).some((r) => x > r[0] + M_IN && y > r[1] + M_IN && x < r[2] - M_IN && y < r[3] - M_IN)) || null;
export const handDistricts = () => new Set(HAND_PLANS.map((p) => p.d));

// The plans' streets as the generator's lines (px), into the `lines` hook after the skeleton's roads.
const C = (v) => (v + 0.5) * TILE;
export function handStreets(lines) {
  const out = { streets: 0, len: 0 };
  for (const P of HAND_PLANS) for (const s of P.streets()) {
    lines.push({ pts: s.pts.map(([x, y]) => ({ x: C(x), y: C(y) })), kind: s.kind, lvl: 0, name: s.name, city: true, hand: P.key, ...(s.park ? { park: s.park } : {}), ...(s.w ? { w: s.w } : {}), ...(s.median ? { median: s.median } : {}), ...(s.oneway ? { oneway: true } : {}), ...(s.culdesac ? { culdesac: true } : {}) });
    out.streets++;
    for (let i = 1; i < s.pts.length; i++) out.len += Math.round(Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]));
  }
  return out;
}

// Every plan built (the generator's `hand` hook: after the roads, the rail and the plazas are laid, before the blocks).
export function buildHand(m, api0) {
  const api = { ...api0, hash2, handBuilding };
  const out = {}, p0 = m.props.length;
  for (const P of HAND_PLANS) {
    const kit = makeKit(m, api, P), b0 = m.buildings.length;
    out[P.key] = P.build(m, api, kit);
    kit.seal();   // (what the plan left open in its area: paved or planted, so the block filler doesn't build over it)
    out[P.key].buildings = kit.count();
    out[P.key].d = P.d; out[P.key].rect = P.rect;   // (which district, where: client/devtp.js lists its places to teleport to)
    // its sights: the set pieces and the key businesses, each at its door (px) - the debug teleport's buttons (the page
    // holds only a window of the world's buildings: this list is the whole plan's)
    const sights = [], seen = new Set();
    for (let i = b0; i < m.buildings.length; i++) {
      const b = m.buildings[i];
      if (!b || !b.hand || !b.door || !b.name || seen.has(b.name) || !(SIGHT_KINDS.has(b.kind) || SIGHT_BIZ.has(b.business))) continue;
      seen.add(b.name);
      sights.push({ name: b.name, x: Math.round((b.door.tx + 0.5) * TILE), y: Math.round((b.door.ty + 0.5) * TILE) });
    }
    out[P.key].sights = sights;
  }
  // the hoops on the plans' basketball courts (shared/hoops.js courtHoops: shooting hoops, NPC pickup games): every hoop
  // a plan put up with the court painted under it - its post, the rim 17 px out over the court and 43 px up (as North
  // Point Courts'), its half court
  m.hoopCourts = handHoops(m, p0);
  // the coin telescopes the plans put up (server/systems/places.js: a dollar, and the view swings out): each looks out
  // the way the most water lies within 40 tiles of it, or out over the rooftops
  m.scopeSpots = handScopes(m, p0);
  return out;
}
const SCOPE_DIRS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
const SCOPE_SAY = ['Clunk. The view swings out over the water to the far shore.', 'Clunk. Gulls wheel low over the water.', 'Clunk. The water glitters all the way out.'];
function handScopes(m, p0) {
  const out = [], wet = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && (m.tiles[y * m.w + x] === T.WATER || m.tiles[y * m.w + x] === T.DEEP);
  for (let i = p0; i < m.props.length; i++) {
    const p = m.props[i];
    if (!p || p.t !== 'scope') continue;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    let best = null;
    for (const [dx, dy] of SCOPE_DIRS) {
      let n = 0, first = -1;
      for (let k = 2; k <= 40; k++) if (wet(tx + dx * k, ty + dy * k)) { n++; if (first < 0) first = k; }
      if (n > 4 && (!best || n > best.n)) best = { n, dx, dy, k: Math.min(40, first + Math.floor(n / 2)) };
    }
    const r = hash2(tx, ty, 977);
    const look = best ? { x: Math.round((tx + best.dx * best.k + 0.5) * TILE), y: Math.round((ty + best.dy * best.k + 0.5) * TILE) } : { x: Math.round(p.x), y: Math.round(p.y + 18 * TILE) };
    out.push({ x: Math.round(p.x), y: Math.round(p.y), look, say: best ? SCOPE_SAY[Math.floor(r * SCOPE_SAY.length) % SCOPE_SAY.length] : 'Clunk. The view swings out over the rooftops.' });
  }
  return out;
}
function handHoops(m, p0) {
  const courts = [], hoops = [];
  for (let i = p0; i < m.props.length; i++) { const p = m.props[i]; if (p && p.t === 'court' && p.k !== 'tennis' && p.w && p.d) courts.push(p); }
  for (let i = p0; i < m.props.length; i++) {
    const p = m.props[i];
    if (!p || p.t !== 'hoop') continue;
    const c = courts.find((q) => Math.abs(q.x - p.x) < 2 && p.y >= q.y - 4 && p.y - q.y < 3 * TILE);
    if (!c) continue;
    const x = Math.round(p.x), y = Math.round(p.y);
    hoops.push({ x, y, rim: { x, y: y + 17, z: 43 }, court: { x0: Math.round(c.x - c.w / 2), y0: Math.round(c.y), x1: Math.round(c.x + c.w / 2), y1: Math.round(c.y + c.d) } });
  }
  return hoops;
}
// (a building worth a teleport button: its lot's kind - the set pieces - or its business)
const SIGHT_KINDS = new Set(['theatre', 'construction', 'strip', 'dealer', 'repair', 'church', 'police', 'motorpool', 'club', 'clubeclipse', 'clubnova', 'arcade', 'hotel', 'bank', 'hospital', 'cinema', 'bowling', 'stadium', 'museum', 'market', 'lighthouse', 'warehouse']);
const SIGHT_BIZ = new Set(['police', 'bank', 'hospital', 'grocery', 'pharmacy', 'dealer', 'garage', 'gunshop', 'clothing', 'fishmarket', 'marina', 'warehouse']);

// ---------------------------------------------------------------------------------------------------------------
// The kit: the composers a plan builds its blocks with. All in tiles; a row's front is its south edge.
export const FREE_T = new Set([T.GRASS]);
function makeKit(m, api, P) {
  const { handBuilding, addProp, hash2 } = api;
  const [X0, Y0, X1, Y1] = P.rect;
  const W = m.w;
  const used = new Uint8Array((X1 - X0) * (Y1 - Y0));   // tiles a lot or a dressed patch has taken
  const at = (x, y) => (x >= X0 && y >= Y0 && x < X1 && y < Y1 ? (y - Y0) * (X1 - X0) + (x - X0) : -1);
  // (a plan of several rects: its own ground is inside them - what lies between them in its bounding box, the Stadium
  // District's park, is left to the generator by landscape and seal)
  const mine = P.rects ? (x, y) => P.rects.some((r) => x >= r[0] && y >= r[1] && x < r[2] && y < r[3]) : () => true;
  let nb = 0;
  // a tile the plan may still build on: in its area, grass (not road, pavement, plaza, rail), not reserved, not taken
  const free = (x, y) => { const k = at(x, y); if (k < 0 || used[k]) return false; const i = y * W + x; return m.tiles[i] === T.GRASS && !m.reserve[i] && m.land[i] && !(m.river && m.river[i]); };
  const take = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const k = at(xx, yy); if (k >= 0) used[k] = 1; } };
  const allFree = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!free(xx, yy)) return false; return true; };
  const rnd = (x, y, k) => hash2(x, y, 7000 + k);   // a draw fixed by where it is (so reworking one block moves nothing else)
  const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(r * list.length))];
  const fill = (x, y, w, h, t) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const k = at(xx, yy); if (k < 0) continue; const i = yy * W + xx; if (m.tiles[i] === T.GRASS && !m.reserve[i]) { m.tiles[i] = t; used[k] = 1; } } };
  const prop = (t, x, y, solid = 0, extra = null) => addProp(m, t, x * TILE, y * TILE, solid, extra);
  // repaint open ground the plan has already taken (a lawn on a paved court): never a road, a building or a kept plaza
  const paint = (x, y, w, h, t) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const k = at(xx, yy); if (k < 0) continue; const i = yy * W + xx, c = m.tiles[i]; if ((c === T.GRASS || c === T.PLAZA || c === T.LOT) && !(m.reserve[i] & ~16) && m.bld[i] < 0) { m.tiles[i] = t; used[k] = 1; } } };

  const K = {
    m, P, free, take, allFree, rnd, pick, fill, paint, prop,
    count: () => nb,
    // one building (map.js handBuilding) on free tiles; null if they aren't all free
    building(o) {
      if (!allFree(o.x, o.y, o.w, o.h)) return null;
      take(o.x, o.y, o.w, o.h);
      nb++;
      return handBuilding(m, { d: P.d, ...o });
    },
    // the free extent of a column inside a band: [southmost free y, northmost free y] scanning north from yS (or null)
    column(x, y0, y1, mask = null) {
      const ok = mask ? (xx, yy) => free(xx, yy) && mask(xx, yy) : free;
      let s = -1;
      for (let y = y1; y >= y0; y--) if (ok(x, y)) { s = y; break; }
      if (s < 0) return null;
      let n = s;
      while (n - 1 >= y0 && ok(x, n - 1)) n--;
      return [s, n];
    },
    // A row of lots facing south along [x0, x1) inside the band [y0, y1] (tiles, inclusive): each lot from `next(x, room,
    // i)` -> { w, ...building options, depth } | { gap: w, kind: 'passage' | 'yard' | 'garden' | 'plaza' } | null (stop).
    // Each lot's front stands on the row's southmost free tile under all its columns (so it steps back along a
    // diagonal street: what's left in front is paved and planted), as deep as `depth` allows and the band is free.
    row(x0, x1, y0, y1, next, opt = {}) {
      const made = [], mk = opt.mask || null, col = (xx) => K.column(xx, y0, y1, mk);
      let x = x0, i = 0;
      while (x < x1) {
        // skip columns with nothing free in the band
        const c0 = col(x);
        if (!c0 || c0[0] - c0[1] + 1 < 4) { x++; continue; }
        const room = (() => { let r = 0; while (x + r < x1 && col(x + r)) r++; return r; })();
        const L = next(x, room, i++);
        if (!L) break;
        const w = Math.min(L.w || L.gap || 1, room);
        if (w < 1) break;
        // the lot's front: the northmost of its columns' southmost free tiles; its back: as deep as wanted and free
        let front = y1, back = y0;
        for (let xx = x; xx < x + w; xx++) { const c = col(xx); if (!c) { front = -1; break; } front = Math.min(front, c[0]); back = Math.max(back, c[1]); }
        if (front < 0) { x += w; continue; }
        const depth = Math.min(L.depth || 99, front - back + 1);
        // (opt.north: the lots stand against the band's north edge - a row facing a street to the north, its yards
        // behind it to the south, where the camera sees them: the caller dresses them)
        const y = opt.north ? back : front - depth + 1;
        // the strip in front where the lot stepped back from the street (a diagonal's wedges): paved, a planter now and then
        // (opt.noStep: the caller lays the fronts itself - a suburb's lawns down to a street that bends)
        if (!opt.north && !opt.noStep) for (let xx = x; xx < x + w; xx++) { const c = K.column(xx, front + 1, y1, mk); if (c) { fill(xx, front + 1, 1, c[0] - front, T.PLAZA); if (c[0] - front >= 2 && rnd(xx, front, 3) < 0.18) prop(pick(['planter_g', 'planter_sq', 'potted', 'bench_m', 'flowers_a'], rnd(xx, front, 4)), xx + 0.5, front + 1.5, 10); } }
        if (L.gap) { K.gap(L.kind || 'passage', x, y, w, depth, opt); made.push({ gap: L.kind, x, y, w, h: depth }); x += w; continue; }
        // (a lot too shallow, or not all free: paved - or opt.fallback's kind of gap, a suburb's lawn)
        if (depth < (L.minDepth || 6)) { K.gap(opt.fallback || 'plaza', x, y, w, depth, opt); x += w; continue; }
        const b = K.building({ ...L, x, y, w, h: depth });
        if (b) made.push(b); else K.gap(opt.fallback || 'plaza', x, y, w, depth, opt);
        x += w;
      }
      return made;
    },
    // A gap between buildings: a paved passage (to the alley behind: bins, a bike), a walled yard (pallets, a dumpster,
    // a gate), a pocket garden (a tree, benches, flowers, an iron fence), or plain paving
    gap(kind, x, y, w, h, opt = {}) {
      if (kind === 'passage') {
        fill(x, y, w, h, T.PLAZA);
        prop(pick(['dump_g', 'dump_b', 'bikerack', 'trashcan'], rnd(x, y, 11)), x + w / 2, y + 2, 12);
        if (h >= 8 && rnd(x, y, 12) < 0.5) prop('bags', x + w / 2, y + 4, 0);
        return;
      }
      if (kind === 'yard') {
        fill(x, y, w, h, T.LOT);
        // (a van or a car parked in a yard deep enough: server/systems/traffic.js parks one in m.parking now and then)
        if (w >= 4 && h >= 9) m.parking.push({ x: (x + w / 2) * TILE, y: (y + h * 0.4) * TILE, a: Math.PI / 2, drive: true });
        const pool = opt.rough ? ['pallet', 'tires', 'drum', 'dump_o', 'crates', 'bags'] : ['pallet_s', 'crates', 'dump_g', 'bikerack', 'planks'];
        for (let k = 0; k < Math.max(1, Math.floor((w * h) / 30)); k++) prop(pick(pool, rnd(x + k, y, 13)), x + 1 + rnd(x, y + k, 14) * Math.max(1, w - 2), y + 1 + rnd(x + k, y + k, 15) * Math.max(1, h - 4), 10);
        api.streetWall(m, x, y + h - 1, w, () => rnd(x, y, 16), w >= 5);
        return;
      }
      if (kind === 'park') {
        // a pocket park in the row: lawn either side of a paved path in from the street, two trees, benches, a chess
        // table (the old men's game: server/systems/activities.js 'chess'), flower beds, an iron fence along the
        // pavement with its gate, a lamp
        fill(x, y, w, h, T.GRASS);
        const mx = Math.floor(x + w / 2);
        fill(mx - 1, y + 2, 2, h - 2, T.PLAZA);
        fill(x + 1, y + 2, w - 2, 2, T.PLAZA);
        for (const tx of [x + 2.5, x + w - 2.5]) prop(pick(['tree_b', 'tree_a'], rnd(tx, y, 22)), tx, y + Math.min(h - 3, 6), 12, { sp: pick(['streetPl', 'maple', 'magnolia', 'cherry'], rnd(tx, y, 23)), k: 1.2 });
        prop('bench_m', mx - 2.6, y + h - 3.2, 0); prop('bench_m', mx + 2.4, y + h - 3.2, 0);
        prop('cafetable', x + 3, y + 3, 0, { chess: 1, seat: 25 }); prop('chair', x + 2.2, y + 3.1, 0, { v: 1, a: 0 }); prop('chair', x + 3.8, y + 3.1, 0, { v: 1, a: 3.1416 });   // (chess: server activities.js plays there)
        for (const fx of [x + 1.4, x + w - 1.6]) prop('flowers_big', fx, y + h - 1.6, 0);
        if (h >= 10) prop('flowers_a', mx, y + 1.2, 0);
        prop('fenceline', x + 0.2, y + h - 0.3, 0, { kind: 'iron', tx: (mx - 1.6 - x) * TILE, ty: 0 });
        prop('fenceline', mx + 1.6, y + h - 0.3, 0, { kind: 'iron', tx: (x + w - 0.2 - mx - 1.6) * TILE, ty: 0 });
        prop('lamp', mx + 1.8, y + h - 1.4, 0);
        prop('trashcan', mx - 1.9, y + h - 1.2, 0);
        return;
      }
      if (kind === 'court') {
        // a public court in the row (the neighbourhood's): the painted half court with its hoop at the back, chain-link
        // round it with the gate on the pavement, the bleachers down one side, a bench and a bin by the gate, two lamps
        fill(x, y, w, h, T.LOT);
        const cw = Math.min(w - 4, 14), mx = x + 1 + cw / 2;
        prop('court', mx, y + 0.5, 0, { w: cw * TILE, d: Math.max(6, h - 3.4) * TILE, c1: '#3a6a5a', c2: '#c8703a' });
        prop('hoop', mx, y + 1.1, 6);
        prop('chainfence', x + 0.2, y + 0.2, 0, { tx: 0, ty: Math.round((h - 0.5) * TILE) });
        prop('chainfence', x + w - 0.2, y + 0.2, 0, { tx: 0, ty: Math.round((h - 0.5) * TILE) });
        prop('chainfence', x + 0.2, y + 0.2, 0, { tx: Math.round((w - 0.4) * TILE), ty: 0 });
        prop('chainfence', x + 0.2, y + h - 0.3, 0, { tx: Math.round((w - 4.6) * TILE), ty: 0 });
        prop('bleachers', x + 1 + Math.min(4, (w - 6) / 2), y + h - 1.5, 10, { len: Math.min(128, Math.round((w - 6) * TILE / 2)), rows: 2 });
        prop('bench_m', x + w - 2.4, y + h - 1.4, 0); prop('trashcan', x + w - 0.9, y + h - 1.6, 0);
        prop('lamp', x + 0.9, y + 1.2, 0); prop('lamp', x + w - 0.9, y + 1.2, 0);
        // (where a pick-up game is played: a later activity's - map.courtSpots)
        (m.courtSpots ||= []).push({ x: Math.round(mx * TILE), y: Math.round((y + h / 2) * TILE), w: cw, h, name: opt.courtName || 'Court' });
        return;
      }
      if (kind === 'garden') {
        fill(x, y, w, h, T.GRASS);
        prop(pick(['tree_a', 'tree_b'], rnd(x, y, 17)), x + w / 2, y + Math.min(h - 3, 4), 12, { sp: pick(['street', 'maple', 'oak'], rnd(x, y, 18)), k: 1.15 });
        if (w >= 5) { prop('bench_m', x + 1.5, y + h - 2, 0); prop('flowers_a', x + w - 2, y + h - 2.5, 0); }
        else prop('flowers_a', x + w / 2, y + h - 2.5, 0);
        if (h >= 8) prop(pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 19)), x + 1.5, y + 2, 0);
        return;
      }
      fill(x, y, w, h, T.PLAZA);
      if (w >= 3 && h >= 3 && rnd(x, y, 20) < 0.5) prop(pick(['planter_g', 'potted', 'bench_m', 'planter_sq'], rnd(x, y, 21)), x + w / 2, y + h / 2, 8);
    },
    // Plant what the plan left open, before seal() would pave it (the owner, 2026-10-17: "a lot of big open pavilion
    // spaces"): lawn, its trees and shrubs on a jittered grid wherever the lawn is open all round them; the shore band's
    // grass in the plan's district kept as lawn too. opt.rect: only there; opt.tree(x, y, r) -> [prop, sp, k] or null
    // (what grows at a spot: palms by the water, plane trees by a street...); opt.bare: how much of the grid stays open.
    landscape(opt = {}) {
      const [lx0, ly0, lx1, ly1] = opt.rect || P.rect, mine2 = new Uint8Array((X1 - X0) * (Y1 - Y0));
      for (let y = Math.max(Y0, ly0); y < Math.min(Y1, ly1); y++) for (let x = Math.max(X0, lx0); x < Math.min(X1, lx1); x++) {
        const k = at(x, y), i = y * W + x;
        if (m.dist[i] !== P.d || !mine(x, y)) continue;
        if (free(x, y)) { used[k] = 1; mine2[k] = 1; }
        else if (!used[k] && m.tiles[i] === T.GRASS && (m.reserve[i] & 4) && m.land[i]) { m.reserve[i] |= 16; used[k] = 1; mine2[k] = 1; }
      }
      const lawn = (x, y) => { const k = at(x, y); return k >= 0 && m.tiles[y * W + x] === T.GRASS && m.bld[y * W + x] < 0; };
      const G = opt.grid || 6, bare = opt.bare ?? 0.3;
      for (let gy = ly0; gy < ly1; gy += G) for (let gx = lx0; gx < lx1; gx += G) {
        const x = gx + Math.floor(rnd(gx, gy, 801) * G), y = gy + Math.floor(rnd(gx, gy, 802) * G), k = at(x, y);
        if (k < 0 || !mine2[k]) continue;
        let ok = true;
        for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) if (!lawn(x + dx, y + dy)) { ok = false; break; }
        if (!ok) continue;
        const r = rnd(x, y, 803);
        if (r < bare) continue;
        const pl = opt.tree ? opt.tree(x, y, r) : r < 0.85 ? [rnd(x, y, 804) < 0.5 ? 'tree_a' : 'tree_b', pick(['streetPl', 'maple', 'oak', 'magnolia', 'cherry'], rnd(x, y, 805)), 1.05 + rnd(x, y, 806) * 0.25] : [pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 807)), null, 1];
        if (!pl) continue;
        const [t, sp, kk] = pl;
        prop(t, x + 0.5, y + 0.5, t === 'tree_a' || t === 'tree_b' ? 12 : t === 'palm_a' ? 10 : 0, sp ? { sp, k: kk } : null);
      }
    },
    // Close the plan's area: every tile left open is paved (by a street) or planted, and reserved from the block filler.
    seal() {
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        const k = at(x, y), i = y * W + x;
        // (the plan's own lawns and gardens kept from the block filler, which builds on any open grass it finds)
        if (used[k] && m.tiles[i] === T.GRASS) { m.reserve[i] |= 16; continue; }
        if (used[k] || m.tiles[i] !== T.GRASS || m.reserve[i] || !m.land[i]) continue;
        if (m.dist[i] !== P.d || !mine(x, y)) continue;
        // (by a pavement: paved; deeper in: a patch of green - a back garden, the inside of a block)
        let pave = false;
        for (let dy = -1; dy <= 1 && !pave; dy++) for (let dx = -1; dx <= 1; dx++) { const t = m.tiles[(y + dy) * W + x + dx]; if (t === T.SIDEWALK || t === T.PLAZA) { pave = true; break; } }
        m.tiles[i] = pave ? T.PLAZA : T.GRASS;
        m.reserve[i] |= 16;
      }
    },
  };
  return K;
}

// ---------------------------------------------------------------------------------------------------------------
// One building placed whole (the generator's own lots are shared/map.js placePrefab's): its tiles, its lot record (the
// old renderer's), its business or home.
//   handBuilding(m, o): o = { x, y, w, h (tiles: the footprint), d (district; default the one under its middle), key
//   (the lot's kind as the old renderer knows it: 'apt1', 'conv', 'rest2'...; default 'apt1'), arch, art, name, back
//   (its front faces away from the camera: a plain back wall to the south), whole (drawn as one section), roof ('tar'...:
//   a plain roofed building with no lot of its own), door (tile x of its front door, on the south side), poi ({ kind,
//   label, fixed }: its business; label defaults to the name), home ({ kind: 'apartment' | 'house' | 'shack', price,
//   slots }: one home behind its door), signs (extra sign texts along its front: [{ x (tile), text }]) } -> the building
function handBuilding(m, o) {
  const { x, y, w } = o, bid = m.buildings.length, front = o.front || 0, h = o.h - front;   // (front: a forecourt that much deep, the lot's own)
  const d = o.d ?? m.dist[(y + (h >> 1)) * m.w + x + (w >> 1)];
  const b = { id: bid, prefab: -1, tx: x, ty: y, tw: w, th: h, kind: o.roof ? 'roof' : o.key || 'apt1', name: o.name || 'Building', business: null, signs: [], hand: true };
  if (o.arch) b.arch = o.arch;
  if (o.art) b.art = o.art;
  if (o.back) b.back = true;
  if (o.whole) b.whole = true;
  if (o.look) b.handLook = o.look;
  if (o.trade) b.trade = o.trade;   // (what the shop is - books, records, laundry, diner: its walk-in, later)
  if (o.roof) { m.roofs.push({ tx: x, ty: y, tw: w, th: h, kind: o.roof, seed: Math.floor(hash2(x, y, 977) * 1e9), d, b: bid }); b.roof = m.roofs.length - 1; }
  else { b.prefab = m.prefabs.length; m.prefabs.push({ key: b.kind, tx: x, ty: y, tw: w, th: h + front, rot: 0, d, solid: [0, 0, w, h], hand: true }); }
  for (let ty = y + h; ty < y + h + front; ty++) for (let tx = x; tx < x + w; tx++) if (m.tileAt(tx, ty) === T.GRASS) m.set(tx, ty, T.PLAZA);
  m.buildings.push(b);
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { m.set(tx, ty, T.BUILDING); m.bld[ty * m.w + tx] = bid; }
  // (face 'N': its front and door on the north side, onto a street there - drawn from the camera's side as its back)
  const north = o.face === 'N';
  if (north) b.back = true;
  if ((o.back && !north) || o.door === null) return b;
  const dtx = Math.max(x, Math.min(x + w - 1, o.door ?? x + (w >> 1)));
  b.door = { tx: dtx, ty: north ? y - 1 : y + h };
  const px = (dtx + 0.5) * TILE, py = north ? (y - 0.7) * TILE : (y + h + 0.7) * TILE;
  if (o.units) {
    // a strip of shop units side by side (units: [[poi kind, label], ...]): a door, a sign and a business each, evenly
    // along its front (buildInteriors makes a walk-in unit of each walk-in kind)
    const n = o.units.length;
    o.units.forEach(([kind, label], k) => {
      const ux = Math.min(x + w - 1, x + Math.floor((k + 0.5) * w / n)), ux0 = (ux + 0.5) * TILE;
      m.pois.push({ id: m.pois.length, kind, label, x: ux0, y: py, r: 48, b: bid, fixed: true });
      b.signs.push({ x: ux0, y: (y + h - 0.6) * TILE, text: label });
    });
    b.business = o.units[0][0];
  }
  const addHome = (hx, hy) => {
    const H = o.home, dist = DISTRICTS[d], id = m.homes.length;
    const kind = H.kind || 'apartment', apt = kind === 'apartment', shack = kind === 'shack';
    const price = H.price ?? (shack ? 6000 : apt ? (dist.tier === 'lux' ? 30000 : dist.tier === 'low' || dist.tier === 'rough' ? 11000 : 15000) : (dist.turf ? 12000 : dist.tier === 'lux' ? 60000 : 25000));
    const home = { id, kind, name: H.name || `${dist.name} ${apt ? 'Apt' : shack ? 'Shack' : 'House'} #${id + 1}`, price, slots: H.slots ?? (apt ? 2 : shack ? 1 : 3), x: hx, y: hy, garage: H.garage || { x: (x + w * 0.5) * TILE, y: (y + h + 2.5) * TILE, a: 0 }, b: bid };
    m.homes.push(home);
    m.pois.push({ id: m.pois.length, kind: 'home', home: id, label: home.name, x: hx, y: hy, r: 40, b: bid });
    b.home = id;
  };
  if (o.units) { /* (the strip's units, above) */ } else if (o.poi) {
    const label = o.poi.label || b.name;
    b.business = o.poi.kind;
    const poi = { id: m.pois.length, kind: o.poi.kind, label, x: px, y: py, r: o.poi.kind === 'delivery' ? 40 : 48, b: bid, fixed: o.poi.fixed !== false };
    if (o.poi.walk) { poi.walk = true; poi.store = o.poi.store || (o.art && o.art.shop && o.art.shop.kind) || 'mart'; }   // (a shop you walk into: shared/map.js buildInteriors)
    if (o.poi.food) poi.food = true;   // (a food place's counter sells a plate as well as coffee: server/systems/economy.js)
    m.pois.push(poi);
    b.signs.push({ x: px, y: (y + h - 0.6) * TILE, text: label });
    // a precinct (sub: not the headquarters - the police spawn, the helipad stay at the first station the generator placed)
    if (o.poi.kind === 'police') { if (!o.poi.hq) poi.sub = true; m.pois.push({ id: m.pois.length, kind: 'evidence', label: 'Evidence Locker', x: (x + w - 1) * TILE, y: py, r: 56, b: bid }); }
    if (o.poi.kind === 'pharmacy' || o.poi.vend) { const vx = px + 56, vy = py + 12; if (vx < (x + w) * TILE - 8) { m.props.push({ t: 'vend_cola', x: vx, y: vy }); m.pois.push({ id: m.pois.length, kind: 'vending', label: 'Vending Machine', x: vx, y: vy + 18, r: 32 }); } }
    // a flat over the shop: its own door at the other end of the front (o.home with o.poi)
    if (o.home && !north && w >= 5) { const hx = dtx - x < w / 2 ? x + w - 1 : x; addHome((hx + 0.5) * TILE, py); }
  } else if (o.home) addHome(px, py);
  else if (o.poi !== false && o.name) m.pois.push({ id: m.pois.length, kind: 'delivery', label: b.name, x: px, y: py, r: 40, b: bid, fixed: true });
  for (const s of o.signs || []) b.signs.push({ x: (s.x + 0.5) * TILE, y: (y + h - 0.6) * TILE, text: s.text });
  return b;
}
