// What's under the ground (the owner's notes, 2026-10-08: tasks #357 and #279). The underground is the subway's
// level (e.sub: the street can't see it, it can't see the street - net.js, law.js, combat.js), now with places you
// walk about in. They lie under the same x, y as the world above them, so a tunnel under a street runs where the
// street does and the ladder up comes out on the cover you went down:
//   * the sewers (ug 1): under a few of the city's streets, each running from junction to junction and the next street
//     on; you go down and come up through the manhole covers already on those streets (shared/covers.js - the ground
//     bake draws them), and each route has a passage to a subway station (a service door up into it);
//   * the cave (ug 2): through the Old Granite Mine's adit (shared/naturesites.js oldMine) into chambers under the
//     Granite Peaks - a glow grotto, a long river hall with a boat, glow-worm and crystal caves, a bear's den;
//   * the ore veins (mining): on the cave's walls and, above ground, round the Granite Quarry's pit and the outcrops by
//     the mine. Better ore deeper in and further out in the wilds; the best needs the best pickaxe (ORES, PICKS).
// The layout is worked out once per map from the map itself (lazily: nothing here runs while the city is built) and
// comes out the same on the server and in every browser (integer hashes and plain arithmetic, no trigonometry).
// ugMapOf(map) is a stand-in map for the physics: shared/physics.js steps anyone with e.ug through it - rock is
// WALL, walkways and cave floors walkable, the cave river DEEP (you swim it, or take the boat).
import { TILE, T, MAP_W, MAP_H } from './constants.js';
import { mulberry32 } from './rng.js';
import { edgeCovers, coverSeed } from './covers.js';

export const UG = { SEWER: 1, CAVE: 2 };
// cell codes in an underground region (drawn by client/underground/, walked by the physics through CELL_T)
export const C = { ROCK: 0, WALK: 1, STREAM: 2, FLOOR: 3, RIVER: 4, POOL: 5, SHAFT: 6 };
const CELL_T = [T.WALL, T.SIDEWALK, T.DIRT, T.DIRT, T.DEEP, T.WATER, T.SIDEWALK];

// ---- ores and pickaxes ---------------------------------------------------------------------------------------------
// tier: the pickaxe it needs (PICKS[id].tier >= it); val: what a vein of it is worth to the assay office (items.js
// sells it for a little less at the pawn shop). Better ores further out and deeper in (oreFor).
export const ORES = [
  { id: 'coal', tier: 1 }, { id: 'copperOre', tier: 1 }, { id: 'ironOre', tier: 2 }, { id: 'silverOre', tier: 2 },
  { id: 'goldOre', tier: 3 }, { id: 'gem', tier: 3 }, { id: 'diamond', tier: 4 },
];
export const ORE_BY_ID = Object.fromEntries(ORES.map((o, i) => [o.id, { ...o, rank: i }]));
// the pickaxes (inventory tools, items.js): tier gates the ores, s: seconds a vein takes with it
export const PICKS = { pickStone: { tier: 1, s: 5 }, pickIron: { tier: 2, s: 4 }, pickSteel: { tier: 3, s: 3.2 }, pickDiamond: { tier: 4, s: 2.5 } };
// the best pickaxe in a bag of things: its id, or null
export function bestPick(inv) {
  let best = null;
  for (const id in PICKS) if ((inv[id] || 0) > 0 && (!best || PICKS[id].tier > PICKS[best].tier)) best = id;
  return best;
}
// The city's middle (the hero corner, metro.js HERO): how far out in the wilds a vein lies is measured from here.
const CITY = { x: 724 * TILE, y: 519.5 * TILE };
// a vein's ore: from how far out it is (px from the city) and how deep (0 on the surface, the cave chambers 1..4),
// plus a seeded roll (r 0..1)
export function oreFor(dist, depth, r) {
  const score = Math.min(6.2, dist / 12000 + depth * 1.05 + (r - 0.5) * 1.6);
  const k = Math.max(0, Math.min(ORES.length - 1, Math.floor(score + 0.25)));
  return ORES[k].id;
}

// ---- small helpers --------------------------------------------------------------------------------------------------
// (lengths by Math.sqrt of the squares: sqrt is exact to the last bit in every engine, Math.hypot isn't - the layout
// must come out the same in the browser as on the server)
const len = (x, y) => Math.sqrt(x * x + y * y);
const hash = (x, y, s) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  const qx = ax + dx * t, qy = ay + dy * t;
  return { d: len(px - qx, py - qy), x: qx, y: qy, t };
}
function nearestOn(P, x, y) {
  let best = null;
  for (let i = 1; i < P.length; i++) { const r = segDist(x, y, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y); if (!best || r.d < best.d) best = { ...r, i }; }
  return best || { d: Infinity, x, y, i: 0 };
}
// value noise on a coarse grid (smooth ragged cave walls without trigonometry)
function vnoise(x, y, cell, s) {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell), fx = x / cell - gx, fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(gx, gy, s), b = hash(gx + 1, gy, s), c = hash(gx, gy + 1, s), d = hash(gx + 1, gy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// A region: a box of cells in tiles (x0, y0, w, h), everything ROCK until carved.
function region(x0, y0, x1, y1) {
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(MAP_W - 1, Math.ceil(x1)); y1 = Math.min(MAP_H - 1, Math.ceil(y1));
  const w = Math.max(1, x1 - x0 + 1), h = Math.max(1, y1 - y0 + 1);
  return { x0, y0, w, h, c: new Uint8Array(w * h) };
}
const cellAt = (R, tx, ty) => (tx < R.x0 || ty < R.y0 || tx >= R.x0 + R.w || ty >= R.y0 + R.h ? -1 : R.c[(ty - R.y0) * R.w + tx - R.x0]);
function setCell(R, tx, ty, v, over) {
  if (tx < R.x0 || ty < R.y0 || tx >= R.x0 + R.w || ty >= R.y0 + R.h) return;
  const i = (ty - R.y0) * R.w + tx - R.x0;
  if (over || R.c[i] === C.ROCK) R.c[i] = v;
}
// every cell whose centre is within hw px of the segment a-b (px) becomes v (over: whatever was there)
function capsule(R, ax, ay, bx, by, hw, v, over = false, rough = 0, seed = 0) {
  const tx0 = Math.floor((Math.min(ax, bx) - hw - 40) / TILE), tx1 = Math.floor((Math.max(ax, bx) + hw + 40) / TILE);
  const ty0 = Math.floor((Math.min(ay, by) - hw - 40) / TILE), ty1 = Math.floor((Math.max(ay, by) + hw + 40) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    const w = rough ? hw * (1 + (vnoise(cx, cy, 96, seed) - 0.5) * rough) : hw;
    if (segDist(cx, cy, ax, ay, bx, by).d <= w) setCell(R, tx, ty, v, over);
  }
}
const disc = (R, x, y, r, v, over, rough, seed) => capsule(R, x, y, x, y, r, v, over, rough, seed);

// ---- the sewers -------------------------------------------------------------------------------------------------------
const SEWER_HW = 52;      // px: half the tunnel (a walkway each side of the stream)
const STREAM_HW = 15;     // px: half the stream down the middle
function townEdge(map, e, seed) { return e.lvl === 0 && edgeCovers(map, e, seed).length > 0; }
function edgesAt(map, n) { const out = []; for (const e of map.edges || []) if (e.a === n || e.b === n) out.push(e); return out; }
// an edge's points running away from node n
const fromNode = (e, n) => (e.a === n ? e.pts.map((p) => ({ x: p.x, y: p.y })) : e.pts.map((p) => ({ x: p.x, y: p.y })).reverse());
// the edge at node n that carries straight on from direction (dx, dy), not used yet
function straightOn(map, n, dx, dy, used, seed) {
  let best = null;
  for (const e of edgesAt(map, n)) {
    if (used.has(e.id) || !townEdge(map, e, seed)) continue;
    const P = fromNode(e, n), q = P[Math.min(P.length - 1, 3)], l = len(q.x - P[0].x, q.y - P[0].y) || 1;
    const dot = ((q.x - P[0].x) * dx + (q.y - P[0].y) * dy) / l;
    if (dot > 0.8 && (!best || dot > best.dot)) best = { e, dot };
  }
  return best && best.e;
}
function sewerRoutes(map) {
  const seed = coverSeed(map), used = new Set(), routes = [];
  const sts = ((map.rail && map.rail.stations) || []).map((s, si) => ({ s, si })).filter((q) => q.s.under);
  const build = (e, st) => {
    used.add(e.id);
    let P = e.pts.map((p) => ({ x: p.x, y: p.y }));
    const edges = [e];
    // on through the junction at each end, where the street carries straight on (a route under a few blocks)
    for (const end of ['b', 'a']) {
      const n = e[end], Q = end === 'b' ? P : [...P].reverse();
      const k = Q.length - 1, dx = Q[k].x - Q[Math.max(0, k - 3)].x, dy = Q[k].y - Q[Math.max(0, k - 3)].y, l = len(dx, dy) || 1;
      const nx = straightOn(map, n, dx / l, dy / l, used, seed);
      if (!nx) continue;
      used.add(nx.id); edges.push(nx);
      const more = fromNode(nx, n).slice(1);
      P = end === 'b' ? P.concat(more) : more.reverse().concat(P);
    }
    const manholes = [];
    for (const ed of edges) for (const c of edgeCovers(map, ed, seed)) manholes.push({ x: Math.round(c.x), y: Math.round(c.y) });
    const route = { pts: P, manholes, edges: edges.map((q) => q.id) };
    if (st) {
      // the passage to the station: from the nearest point under the street to beside the platform (the door)
      const pr = nearestOn(P, st.s.x, st.s.y), a = st.s.a || 0;
      let ox = -Math.sin(a), oy = Math.cos(a);
      if ((pr.x - st.s.x) * ox + (pr.y - st.s.y) * oy < 0) { ox = -ox; oy = -oy; }
      const door = { x: Math.round(st.s.x + ox * 84), y: Math.round(st.s.y + oy * 84), st: st.si, name: st.s.name, tx: Math.round(st.s.x), ty: Math.round(st.s.y), a };
      route.link = { x0: Math.round(pr.x), y0: Math.round(pr.y), x1: door.x, y1: door.y };
      route.door = door;
    }
    return route;
  };
  for (const st of sts) {
    if (routes.length >= 3) break;
    let best = null;
    for (const e of map.edges || []) {
      if (e.lvl !== 0 || used.has(e.id) || !e.pts || e.pts.length < 2) continue;
      const n = edgeCovers(map, e, seed).length;
      if (n < 2) continue;
      const pr = nearestOn(e.pts, st.s.x, st.s.y);
      if (pr.d > 1200) continue;
      const score = pr.d - n * 60;
      if (!best || score < best.score) best = { e, score };
    }
    if (best) routes.push(build(best.e, st));
  }
  // (a city without its subway: the longest streets with the most covers)
  if (routes.length < 2) {
    const cand = (map.edges || []).filter((e) => e.lvl === 0 && !used.has(e.id) && e.pts && edgeCovers(map, e, seed).length >= 3)
      .sort((a, b) => edgeCovers(map, b, seed).length - edgeCovers(map, a, seed).length || a.id - b.id);
    for (const e of cand) { if (routes.length >= 2) break; if (!used.has(e.id)) routes.push(build(e, null)); }
  }
  return routes;
}

// ---- the cave ---------------------------------------------------------------------------------------------------------
// Chambers under the Granite Peaks, in from the Old Granite Mine's adit. Offsets from the adit in px (dy < 0: into the
// mountain, north - flipped where the map's edge is too close); depth: how deep in (the ore gets better).
const CHAMBERS = [
  { id: 'hall', name: 'the entrance hall', dx: 0, dy: -170, r: 125, depth: 1 },
  { id: 'grotto', name: 'the glow grotto', dx: -420, dy: -430, r: 150, depth: 1, glow: 'mush' },
  { id: 'river', name: 'the river hall', dx: 520, dy: -720, r: 0, depth: 2, long: { x0: 80, x1: 1060, hw: 175 } },
  { id: 'worms', name: 'the glow-worm cave', dx: -760, dy: -880, r: 145, depth: 2, glow: 'worms' },
  { id: 'pool', name: 'the still pool', dx: 640, dy: -1060, r: 120, depth: 3, glow: 'mush' },
  { id: 'crystal', name: 'the crystal deep', dx: -430, dy: -1260, r: 165, depth: 4, glow: 'crystal' },
  { id: 'den', name: 'the bear\'s den', dx: 1080, dy: -1230, r: 150, depth: 3 },
];
const PASSAGES = [['hall', 'grotto'], ['hall', 'river', [60, -470]], ['grotto', 'worms'], ['worms', 'crystal'], ['river', 'pool'], ['river', 'den', [1040, -900]], ['crystal', 'den', [300, -1380]]];
function buildCave(map) {
  const mine = (map.natureSites || []).find((q) => q.kind === 'mine');
  if (!mine) return null;
  const X = mine.x, face = mine.y, rnd = mulberry32(((map.seed ?? 1337) ^ 0xca7e) >>> 0);
  const flip = face - 1500 < 3 * TILE ? -1 : 1;     // (no room north: the cave runs south under the road instead)
  const at = (dx, dy) => ({ x: Math.round(X + dx), y: Math.round(face + dy * flip) });
  const ch = {}, chambers = [];
  for (const c of CHAMBERS) {
    const j = (k) => Math.round((rnd() - 0.5) * k);
    const p = at(c.dx + j(70), c.dy + j(60));
    const q = { id: c.id, name: c.name, x: p.x, y: p.y, r: c.r, depth: c.depth, glow: c.glow || null };
    if (c.long) { const a = at(c.dx - 520 + c.long.x0, c.dy), b = at(c.dx - 520 + c.long.x1, c.dy + 40); q.long = { ax: a.x, ay: a.y, bx: b.x, by: b.y, hw: c.long.hw }; q.x = Math.round((a.x + b.x) / 2); q.y = Math.round((a.y + b.y) / 2); q.r = c.long.hw; }
    ch[c.id] = q; chambers.push(q);
  }
  const passages = PASSAGES.map(([a, b, via]) => ({ a, b, via: via ? at(via[0], via[1]) : null }));
  const mouth = { x: X, y: face + 10 };                 // on the surface, in the adit
  const inside = { x: X, y: face - 46 * flip };          // just inside, where you come in
  const river = ch.river.long;
  // the river: along the long hall, from the rock at its west end to the rock at its east end; it forks north into
  // the still pool's chamber (a channel you can row up)
  const rv = { ax: river.ax + 40, ay: river.ay + 6, bx: river.bx - 40, by: river.by + 6, hw: 68 };
  const fork = { ax: Math.round(rv.ax + (rv.bx - rv.ax) * 0.62), ay: Math.round(rv.ay + (rv.by - rv.ay) * 0.62), bx: ch.pool.x, by: ch.pool.y, hw: 50 };
  return { X, face, flip, mouth, inside, chambers, ch, passages, river: rv, fork };
}

// ---- the layout ---------------------------------------------------------------------------------------------------------
const CACHE = new WeakMap();
export function undergroundOf(map) {
  if (!map) return null;
  let L = CACHE.get(map);
  if (L) return L;
  L = build(map);
  CACHE.set(map, L);
  return L;
}
function build(map) {
  const seed = ((map.seed ?? 1337) | 0) >>> 0;
  const routes = map.edges ? sewerRoutes(map) : [];
  const regions = [];
  // the sewers' region: round every route
  let sewer = null;
  if (routes.length) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const r of routes) { for (const p of r.pts) grow(p.x, p.y); for (const m of r.manholes) grow(m.x, m.y); if (r.door) { grow(r.door.x, r.door.y); grow(r.door.tx, r.door.ty); } }
    sewer = region(x0 / TILE - 6, y0 / TILE - 6, x1 / TILE + 6, y1 / TILE + 6);
    sewer.ug = UG.SEWER;
    for (const r of routes) {
      for (let i = 1; i < r.pts.length; i++) capsule(sewer, r.pts[i - 1].x, r.pts[i - 1].y, r.pts[i].x, r.pts[i].y, SEWER_HW, C.WALK);
      for (let i = 1; i < r.pts.length; i++) capsule(sewer, r.pts[i - 1].x, r.pts[i - 1].y, r.pts[i].x, r.pts[i].y, STREAM_HW, C.STREAM, true);
      // a shaft under each manhole (the ladder's foot), with a walkway out to the tunnel
      for (const m of r.manholes) {
        const pr = nearestOn(r.pts, m.x, m.y);
        capsule(sewer, m.x, m.y, pr.x, pr.y, 30, C.WALK);
        disc(sewer, m.x, m.y, 26, C.SHAFT, true);
      }
      if (r.link) { capsule(sewer, r.link.x0, r.link.y0, r.link.x1, r.link.y1, 40, C.WALK); disc(sewer, r.door.x, r.door.y, 40, C.WALK); }
    }
    regions.push(sewer);
  }
  // the cave's region
  const cave = buildCave(map);
  let cr = null;
  if (cave) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of cave.chambers) { const r = c.long ? 0 : c.r; const xs = c.long ? [c.long.ax, c.long.bx] : [c.x]; const ys = c.long ? [c.long.ay, c.long.by] : [c.y]; for (const x of xs) for (const y of ys) { x0 = Math.min(x0, x - r - c.r); x1 = Math.max(x1, x + r + c.r); y0 = Math.min(y0, y - r - c.r); y1 = Math.max(y1, y + r + c.r); } }
    x0 = Math.min(x0, cave.mouth.x - 200); x1 = Math.max(x1, cave.mouth.x + 200); y0 = Math.min(y0, cave.mouth.y - 200); y1 = Math.max(y1, cave.mouth.y + 200);
    cr = region(x0 / TILE - 4, y0 / TILE - 4, x1 / TILE + 4, y1 / TILE + 4);
    cr.ug = UG.CAVE;
    const s2 = seed ^ 0x3c3c;
    for (const c of cave.chambers) {
      if (c.long) capsule(cr, c.long.ax, c.long.ay, c.long.bx, c.long.by, c.long.hw, C.FLOOR, false, 0.5, s2);
      else disc(cr, c.x, c.y, c.r, C.FLOOR, false, 0.55, s2 + c.depth);
    }
    for (const ps of cave.passages) {
      const a = cave.ch[ps.a], b = cave.ch[ps.b], pts = ps.via ? [a, ps.via, b] : [a, b];
      for (let i = 1; i < pts.length; i++) capsule(cr, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, 46, C.FLOOR, false, 0.6, s2 + 7);
    }
    // the way in: from the adit up into the entrance hall
    capsule(cr, cave.mouth.x, cave.mouth.y - 4 * cave.flip, cave.ch.hall.x, cave.ch.hall.y, 44, C.FLOOR, false, 0.3, s2 + 9);
    // the river, its fork, and the still pool
    const rv = cave.river, fk = cave.fork;
    capsule(cr, rv.ax, rv.ay, rv.bx, rv.by, rv.hw, C.RIVER, true, 0.25, s2 + 11);
    capsule(cr, fk.ax, fk.ay, fk.bx, fk.by, fk.hw, C.RIVER, true, 0.2, s2 + 12);
    disc(cr, cave.ch.pool.x, cave.ch.pool.y, 70, C.RIVER, true, 0.3, s2 + 13);
    // little pools of still water about the floors
    const rp = mulberry32(s2 + 21);
    for (const c of cave.chambers) if (!c.long && c.id !== 'pool' && c.id !== 'hall') { const px = c.x + Math.round((rp() - 0.5) * c.r), py = c.y + Math.round((rp() - 0.5) * c.r); disc(cr, px, py, 22 + Math.round(rp() * 14), C.POOL, true); }
    regions.push(cr);
  }
  const L = { routes, regions, sewer, cave: cave ? { ...cave, region: cr } : null, seed };
  if (cave) dressCave(L);
  if (sewer) dressSewers(L);
  L.veins = veins(map, L);
  L.phys = physMap(L);
  return L;
}

// floor cells next to rock in a box round (x, y) r px: [{ x, y, nx, ny }] (px; n: toward the rock)
function wallSpots(R, x, y, r) {
  const out = [];
  const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE), ty0 = Math.floor((y - r) / TILE), ty1 = Math.floor((y + r) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (cellAt(R, tx, ty) !== C.FLOOR) continue;
    let nx = 0, ny = 0;
    if (cellAt(R, tx - 1, ty) === C.ROCK) nx -= 1;
    if (cellAt(R, tx + 1, ty) === C.ROCK) nx += 1;
    if (cellAt(R, tx, ty - 1) === C.ROCK) ny -= 1;
    if (cellAt(R, tx, ty + 1) === C.ROCK) ny += 1;
    if (!nx && !ny) continue;
    out.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, nx, ny });
  }
  return out;
}
function floorSpots(R, x, y, r, code = C.FLOOR) {
  const out = [];
  const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE), ty0 = Math.floor((y - r) / TILE), ty1 = Math.floor((y + r) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (cellAt(R, tx, ty) === code) out.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
  return out;
}
const pickN = (rnd, list, n) => { const a = list.slice(), out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rnd() * a.length) % a.length, 1)[0]); return out; };

// The cave's dressing: glowing patches, bat roosts, where rocks fall, the bear's den, the boat on the river.
function dressCave(L) {
  const K = L.cave, R = K.region, rnd = mulberry32((L.seed ^ 0x6a7) >>> 0);
  const glow = [];
  for (const c of K.chambers) {
    if (!c.glow) continue;
    const n = c.glow === 'worms' ? 7 : c.glow === 'crystal' ? 5 : 8;
    const spots = c.glow === 'mush' ? wallSpots(R, c.x, c.y, c.r + 40) : floorSpots(R, c.x, c.y, c.r);
    for (const s of pickN(rnd, spots, n)) glow.push({ x: Math.round(s.x + (s.nx || 0) * 8), y: Math.round(s.y + (s.ny || 0) * 8), r: c.glow === 'worms' ? 120 : c.glow === 'crystal' ? 90 : 76, kind: c.glow, k: 0.55 + rnd() * 0.35 });
  }
  // mushrooms along the river's banks too
  for (const s of pickN(rnd, wallSpots(R, K.ch.river.x, K.ch.river.y, K.ch.river.r + 520), 5)) glow.push({ x: Math.round(s.x), y: Math.round(s.y), r: 70, kind: 'mush', k: 0.5 + rnd() * 0.3 });
  K.glow = glow;
  K.roosts = [K.ch.river, K.ch.worms, K.ch.crystal].map((c, i) => { const s = pickN(rnd, floorSpots(R, c.x, c.y, Math.min(c.r, 140)), 1)[0] || c; return { i, x: Math.round(s.x), y: Math.round(s.y), r: 240 }; });
  // rocks fall where the roof is cracked: in the passage up from the hall, the worm cave, the den's mouth
  const rocks = [];
  const mid = (a, b) => ({ x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) });
  for (const p of [mid(K.ch.hall, K.ch.grotto), K.ch.worms, mid(K.ch.river, K.ch.den)]) {
    const s = pickN(rnd, floorSpots(R, p.x, p.y, 70), 1)[0];
    if (s) rocks.push({ i: rocks.length, x: Math.round(s.x), y: Math.round(s.y) });
  }
  K.rocks = rocks;
  // the den: against the back wall of the last chamber, the furthest floor from the way in
  const d = K.ch.den;
  let den = null;
  for (const s of wallSpots(R, d.x, d.y, d.r + 30)) { const far = len(s.x - K.ch.river.x, s.y - K.ch.river.y); if (!den || far > den.far) den = { x: Math.round(s.x - s.nx * 20), y: Math.round(s.y - s.ny * 20), far }; }
  K.den = den ? { x: den.x, y: den.y } : { x: d.x, y: d.y };
  // the boat: moored at the river's west end, facing downstream
  const rv = K.river;
  K.boat = { x: Math.round(rv.ax + 90), y: Math.round(rv.ay), a: 0 };
  // stalactites and stalagmites (drawn; small ones you walk round in the dark)
  K.spikes = [];
  for (const c of K.chambers) for (const s of pickN(rnd, floorSpots(R, c.x, c.y, c.long ? 600 : c.r), c.long ? 10 : 5)) K.spikes.push({ x: Math.round(s.x), y: Math.round(s.y), s: 0.6 + rnd() * 0.8 });
}
// The sewers' dressing: grates (daylight down from the street), rats' runs, the pipes.
function dressSewers(L) {
  const rnd = mulberry32((L.seed ^ 0x5e3) >>> 0);
  L.grates = []; L.rats = []; L.pipes = [];
  for (const r of L.routes) {
    let s = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], l = len(b.x - a.x, b.y - a.y);
      for (; s < l; s += 230) {
        const t = s / l, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, nx = -(b.y - a.y) / (l || 1), ny = (b.x - a.x) / (l || 1);
        const side = rnd() < 0.5 ? -1 : 1;
        L.grates.push({ x: Math.round(x + nx * 34 * side), y: Math.round(y + ny * 34 * side) });
        if (rnd() < 0.5) L.rats.push({ x: Math.round(x + nx * 44 * -side), y: Math.round(y + ny * 44 * -side), dx: Math.round((b.x - a.x) / (l || 1) * 100) / 100, dy: Math.round((b.y - a.y) / (l || 1) * 100) / 100 });
        if (rnd() < 0.35) L.pipes.push({ x: Math.round(x + nx * 50 * side), y: Math.round(y + ny * 50 * side), nx: Math.round(nx * side * 100) / 100, ny: Math.round(ny * side * 100) / 100 });
      }
      s -= l;
    }
  }
}

// ---- the ore veins ------------------------------------------------------------------------------------------------------
// Each: { i, x, y, ug (0: above ground), ore, need (pickaxe tier), alts: [{ x, y }] (where it grows back - [0] is where
// it starts), where }.
function veins(map, L) {
  const out = [], rnd = mulberry32((L.seed ^ 0x0e5) >>> 0);
  const add = (spots, ug, depth, n, where) => {
    const chosen = pickN(rnd, spots, n * 3);
    for (let k = 0; k + 2 < chosen.length && out.length < 200; k += 3) {
      const q = chosen[k], dist = len(q.x - CITY.x, q.y - CITY.y);
      const ore = oreFor(dist, depth, rnd());
      out.push({ i: out.length, x: Math.round(q.x), y: Math.round(q.y), ug, ore, need: ORE_BY_ID[ore].tier, where, alts: [q, chosen[k + 1], chosen[k + 2]].map((s) => ({ x: Math.round(s.x), y: Math.round(s.y) })) });
    }
  };
  // above ground: round the inside of the Granite Quarry's pit (its stepped faces), the outcrops by the mine
  const site = (map.countrySites || []).find((q) => q.type === 'quarry');
  const pit = (map.quarries || [])[0];
  if (pit) {
    const spots = [];
    for (let k = 0; k < 24; k++) {
      const t = (k + 0.5) / 24;
      spots.push({ x: pit.x + 30 + t * (pit.w - 60), y: pit.y + 34 }, { x: pit.x + 30 + t * (pit.w - 60), y: pit.y + pit.h - 30 });
      if (k < 12) { const u = (k + 0.5) / 12; spots.push({ x: pit.x + 30, y: pit.y + 40 + u * (pit.h - 80) }, { x: pit.x + pit.w - 30, y: pit.y + 40 + u * (pit.h - 80) }); }
    }
    add(spots, 0, 0, 7, (site && site.name) || 'the quarry');
  }
  if (L.cave) {
    const K = L.cave, X = K.X, f = K.face;
    add([{ x: X - 250, y: f + 30 }, { x: X - 214, y: f + 12 }, { x: X - 290, y: f + 18 }, { x: X + 256, y: f + 40 }, { x: X + 222, y: f + 24 }, { x: X + 296, y: f + 30 }], 0, 0.6, 2, 'the mine\'s outcrops');
    for (const c of K.chambers) {
      const spots = wallSpots(K.region, c.x, c.y, c.long ? 600 : c.r + 40);
      add(spots, UG.CAVE, c.depth, c.long ? 4 : c.id === 'hall' ? 1 : 3, c.name);
    }
  }
  return out;
}

// ---- the physics' stand-in map ------------------------------------------------------------------------------------------
function physMap(L) {
  const regs = L.regions;
  const tileAt = (tx, ty) => {
    for (const R of regs) { const v = cellAt(R, tx, ty); if (v >= 0) return CELL_T[v]; }
    return T.WALL;
  };
  return {
    w: MAP_W, h: MAP_H, ug: true, solidProps: new Map(), levels: null, lvl0Block: null,
    tileAt, tileAtPx: (x, y) => tileAt(Math.floor(x / TILE), Math.floor(y / TILE)),
  };
}
export function ugMapOf(map) { const L = undergroundOf(map); return L ? L.phys : null; }
// the cell code at (x, y) px underground (C.*), ROCK outside every region
export function cellAtPx(L, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (const R of L.regions) { const v = cellAt(R, tx, ty); if (v >= 0) return v; }
  return C.ROCK;
}
export const openAt = (L, x, y) => cellAtPx(L, x, y) !== C.ROCK;
// a clear line underground (nothing but open cells between): police sight down there (law.js), the bear's
export function ugLos(L, x0, y0, x1, y1) {
  const d = len(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 12));
  for (let k = 1; k < n; k++) { const t = k / n; if (!openAt(L, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false; }
  return true;
}
// which underground (UG.*) a spot is in: by region
export function ugAt(L, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (const R of L.regions) if (cellAt(R, tx, ty) > 0) return R.ug;
  return 0;
}

// ---- light down there ------------------------------------------------------------------------------------------------------
// How lit a spot is (0 pitch dark .. 1): only lights and glowing things. lights: [{ x, y, r, k }] (the carried lights:
// flashlights, lamps - the client gathers them the way it does above ground); day: 0..1 daylight up on the street (it
// comes down the sewer grates; the cave gets none). The client draws the darkness from the same sources.
export const UG_AMBIENT = { [UG.SEWER]: 0.06, [UG.CAVE]: 0 };
export function lightAt(L, x, y, lights = [], day = 0) {
  const ug = ugAt(L, x, y);
  let v = UG_AMBIENT[ug] || 0;
  const add = (sx, sy, r, k) => { const d = len(x - sx, y - sy); if (d < r) v += k * (1 - d / r); };
  for (const l of lights) add(l.x, l.y, l.r, l.k ?? 1);
  if (ug === UG.CAVE && L.cave) for (const g of L.cave.glow) add(g.x, g.y, g.r, g.k * 0.6);
  if (ug === UG.SEWER) for (const g of L.grates || []) add(g.x, g.y, 90, 0.5 * day + 0.12);
  return Math.min(1, v);
}
