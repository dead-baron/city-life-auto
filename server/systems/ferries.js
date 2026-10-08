// Ferries to the islands no road reaches (the user's notes, 2026-10-08: "a ferry system that goes to the islands - some
// walk on, some you can drive on for the bigger islands"). Gull Harbor, the big island with streets of its own, gets a
// car ferry; Coral Cay (dirt tracks), Lighthouse Rock and Paradise Cay a water bus for foot passengers. Each route runs one
// boat back and forth between a pier on the mainland and one on the island.
//
// The routes come from the map (worked out once): for each island, the piers (dock tiles) on its shore and on the
// mainland where a boat can lie stern-in with open water ahead of it - for a car ferry, with a street near the pier on
// both sides; of those, the pair with the shortest way between them by water (A* over the water, kept clear of the
// shore, then straightened). A boat at a pier lies with its stern to the dock and its bow to open water; it leaves bow
// first, runs the way over, slows, turns round in open water and backs in to the pier on the far side.
//
// Boarding while it's in (free): on foot, interact by the boat; in a car at a car ferry's stern, interact to drive
// aboard: the car rides on the deck (deck slots, held there: no physics, not sinking) with you in it.
// At the far side the cars are driven off onto the landing behind the pier; foot passengers get off with the vehicle key
// (on the way over that's over the side, into the water). Getting out of a car on the deck puts you in a seat aboard.
// The boats can't be taken, hurt or pushed about.
import { K, T, TILE, MAP_W, MAP_H } from '../../shared/constants.js';
import { DISTRICTS } from '../../shared/map.js';
import { nearestEdge } from '../../shared/roads.js';
import { FERRY_DWELL_S } from '../../shared/rules.js';
import { spawnNpc } from './npc.js';

const ROUTES = [
  { island: 'Gull Harbor', model: 'ferry', name: 'Gull Harbor Ferry' },
  { island: 'Coral Cay', model: 'waterbus', name: 'Coral Cay Water Bus' },   // (dirt tracks there: on foot)
  { island: 'Lighthouse Rock', model: 'waterbus', name: 'Lighthouse Rock Water Bus' },
  { island: 'Paradise Cay', model: 'waterbus', name: 'Paradise Cay Water Bus' },
];
// a boat's size, and the open water it keeps to across (tiles from any shore, at least: the hull's half-width plus a
// tile, so its sides never touch land) and to turn round (half its length plus a tile)
const DIMS = { ferry: { L: 470, W: 150, clear: 4, turn: 9 }, waterbus: { L: 240, W: 76, clear: 3, turn: 5 } };
const SPEED = 300;          // px/s across
const RAMP_S = 3;           // getting up to speed, and slowing down again
const TURN_S = 5;           // turning round off the far pier
const SWING_RATE = Math.PI / 5;   // rad/s: out of the pier, swinging round onto the way across (at least a second)
const TURN_OUT = 1400;      // px: how much farther out than its length and a bit a boat may back out of an inlet to turn
const LEAVE_V = 120, BACK_V = 100;   // px/s pulling out bow first, backing in
const BOARD_REACH = 60;     // on foot: this near the hull
const RAMP_REACH = 230;     // in a car: this near the stern
export const DECK_LZ = 30 / 88;       // a car on the deck: the deck's height (30 px) as a level (shared/levels.js DECK_LIFT 88)
// a car ferry's deck (client/art2/vehicles.js 'ferry': open from the stern to the cabin, 197 px): two lanes, a car at
// the stern end of each and one at the cabin end - [row, right] (row 0 the stern end, 1 the cabin end)
const DECK = [[0, -38], [0, 38], [1, -38], [1, 38]];
const DECK_STERN = 4, DECK_CABIN = 38 + 3;   // the stern row's back this far ahead of the stern; the cabin row's front this far behind the middle
const DECK_MAX_L = 112;     // longer than this doesn't fit a slot
// where a car in deck slot k sits on a ferry of length L (forward of the middle, to the right)
const deckAt = (k, L, carL) => [DECK[k][0] ? -DECK_CABIN - carL / 2 : -L / 2 + DECK_STERN + carL / 2, DECK[k][1]];

const isWaterT = (t) => t === T.WATER || t === T.DEEP;
const LAND_DRIVE = new Set([T.ROAD, T.LOT, T.DOCK, T.PLAZA, T.SIDEWALK, T.DIRT, T.SAND, T.GRASS]);
const SLIP = new Set([T.ROAD, T.LOT, T.PLAZA]);   // a car ferry can lie at a street or a lot at the water's edge, too

// ---- the routes ----------------------------------------------------------------------------------------------------
// the land masses (4-connected land tiles) and, for every water tile, how far it is from land (tiles, at most 60: the
// most tiles across or down to the nearest land tile - never more than the real distance)
function geography(m) {
  const N = MAP_W * MAP_H, comp = new Int32Array(N).fill(-1), sizes = [];
  for (let i = 0; i < N; i++) {
    if (comp[i] >= 0 || isWaterT(m.tiles[i])) continue;
    const id = sizes.length, st = [i]; comp[i] = id; let n = 0;
    while (st.length) {
      const j = st.pop(); n++;
      const x = j % MAP_W;
      if (x > 0 && comp[j - 1] < 0 && !isWaterT(m.tiles[j - 1])) { comp[j - 1] = id; st.push(j - 1); }
      if (x < MAP_W - 1 && comp[j + 1] < 0 && !isWaterT(m.tiles[j + 1])) { comp[j + 1] = id; st.push(j + 1); }
      if (j >= MAP_W && comp[j - MAP_W] < 0 && !isWaterT(m.tiles[j - MAP_W])) { comp[j - MAP_W] = id; st.push(j - MAP_W); }
      if (j < N - MAP_W && comp[j + MAP_W] < 0 && !isWaterT(m.tiles[j + MAP_W])) { comp[j + MAP_W] = id; st.push(j + MAP_W); }
    }
    sizes.push(n);
  }
  const dist = new Uint8Array(N).fill(255), q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) if (!isWaterT(m.tiles[i])) { dist[i] = 0; q[qt++] = i; }
  while (qh < qt) {
    const j = q[qh++], d = dist[j];
    if (d >= 60) continue;
    const x = j % MAP_W, y = (j / MAP_W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const k = ny * MAP_W + nx;
      if (dist[k] > d + 1) { dist[k] = d + 1; q[qt++] = k; }
    }
  }
  let main = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[main]) main = i;
  return { comp, dist, main };
}
const tileOf = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? -1 : ty * MAP_W + tx; };

// A pier a boat can lie at: the dock tile i, the boat's stern against it, bow to open water - or null
function berthAt(m, G, i, dims, car) {
  const tx = i % MAP_W, ty = Math.floor(i / MAP_W);
  let ox = 0, oy = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const j = tileOf((tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE);
    if (j >= 0 && isWaterT(m.tiles[j])) { const l = Math.hypot(dx, dy) || 1; ox += dx / l; oy += dy / l; }
  }
  const ol = Math.hypot(ox, oy);
  if (ol < 2) return null;
  ox /= ol; oy /= ol;
  const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
  const sx = cx + ox * 18, sy = cy + oy * 18;                       // the stern, at the dock's edge
  const bx = sx + ox * (dims.L / 2 + 4), by = sy + oy * (dims.L / 2 + 4); // the boat's middle
  // the hull on open water all the way from the pier out to a turning point (the track it sweeps leaving and backing
  // in), with room either side; the turning point the first place out that way with room to turn round (out of a
  // narrow inlet, the boat backs in the whole way)
  const rx = -oy, ry = ox, hw = dims.W / 2 + 8, rs = hw / Math.ceil(hw / 20);
  const clearAt = (f) => { for (let r = -hw; r <= hw + 0.01; r += rs) { const j = tileOf(bx + ox * f + rx * r, by + oy * f + ry * r); if (j < 0 || !isWaterT(m.tiles[j]) || G.dist[j] < 1) return false; } return true; };
  let f = -dims.L / 2 + 30, out = -1;
  for (const o0 = dims.L + 220; f <= o0 + TURN_OUT + dims.L / 2; f += 22) {
    if (!clearAt(f)) break;
    // far enough out to turn: the hull ahead clear too, and room all round
    const ft = f - dims.L / 2;
    if (ft >= o0) { const j = tileOf(bx + ox * ft, by + oy * ft); if (j >= 0 && G.dist[j] >= dims.turn) { out = ft; break; } }
  }
  if (out < 0) return null;
  const turn = { x: bx + ox * out, y: by + oy * out };
  // a car ferry: a landing for the cars behind the pier, by a street
  let land = null;
  if (car) {
    for (let d = 40; d <= 420 && !land; d += 16) {
      const lx = sx - ox * d, ly = sy - oy * d, j = tileOf(lx, ly);
      if (j < 0 || !LAND_DRIVE.has(m.tiles[j])) continue;
      const ne = nearestEdge(m.net, lx, ly, (e) => e.lvl === 0 && e.kind !== 'alley');
      if (ne && ne.d < 300) land = { x: lx, y: ly };
      break;
    }
    if (!land) return null;
  }
  return { x: bx, y: by, a: Math.atan2(oy, ox), ox, oy, sx, sy, turn, land, comp: G.comp[i] };
}

// the way across by water from a to b (px), at least `clear` tiles from any shore: a straightened polyline, or null.
// A* over cells of 2 x 2 tiles (a cell is open water when all four of its tiles are), a little greedy (the heuristic
// weighed 1.4: the way is straightened after anyway), with its arrays made once and kept.
const CELL = 2, CW = Math.ceil(MAP_W / CELL), CH = Math.ceil(MAP_H / CELL);
let AS = null;
// the cells that are open water `clear` tiles from any shore (all four of their tiles), worked out once per clearance
function openCells(G, clear) {
  G.open ??= new Map();
  let o = G.open.get(clear);
  if (o) return o;
  o = new Uint8Array(CW * CH);
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    let ok = 1;
    for (let dy = 0; dy < CELL && ok; dy++) for (let dx = 0; dx < CELL; dx++) { const tx = cx * CELL + dx, ty = cy * CELL + dy; if (tx >= MAP_W || ty >= MAP_H || G.dist[ty * MAP_W + tx] < clear) { ok = 0; break; } }
    o[cy * CW + cx] = ok;
  }
  G.open.set(clear, o);
  return o;
}
function waterWay(G, a, b, clear) {
  const NC = CW * CH;
  if (!AS) AS = { cost: new Float32Array(NC), from: new Int32Array(NC), seen: new Uint32Array(NC), stamp: 0, hf: new Float32Array(1 << 20), hi: new Int32Array(1 << 20) };
  const A = AS, openC = openCells(G, clear);
  A.stamp++;
  const open = (c) => openC[c] === 1;
  const cellOf = (p) => Math.floor(p.y / TILE / CELL) * CW + Math.floor(p.x / TILE / CELL);
  const s = cellOf(a), g = cellOf(b);
  if (s < 0 || g < 0 || s >= NC || g >= NC) return null;
  const gx = g % CW, gy = Math.floor(g / CW);
  // (octile distance, weighed 1.4)
  const h = (c) => { const dx = Math.abs(c % CW - gx), dy = Math.abs(((c / CW) | 0) - gy); return (dx + dy - 0.586 * (dx < dy ? dx : dy)) * 1.4; };
  let n = 0;
  const push = (f, c) => { if (n >= A.hf.length) return; let k = n++; while (k > 0) { const p = (k - 1) >> 1; if (A.hf[p] <= f) break; A.hf[k] = A.hf[p]; A.hi[k] = A.hi[p]; k = p; } A.hf[k] = f; A.hi[k] = c; };
  const pop = () => { const top = A.hi[0], lf = A.hf[--n], li = A.hi[n]; let k = 0; for (;;) { const l = 2 * k + 1; if (l >= n) break; const r = l + 1, m = r < n && A.hf[r] < A.hf[l] ? r : l; if (A.hf[m] >= lf) break; A.hf[k] = A.hf[m]; A.hi[k] = A.hi[m]; k = m; } A.hf[k] = lf; A.hi[k] = li; return top; };
  const costOf = (c) => (A.seen[c] === A.stamp ? A.cost[c] : Infinity);
  A.seen[s] = A.stamp; A.cost[s] = 0; A.from[s] = -1; push(h(s), s);
  let found = false, iters = 0;
  while (n && iters++ < 400000) {
    const c = pop();
    if (c === g) { found = true; break; }
    const x = c % CW, y = Math.floor(c / CW), c0 = A.cost[c];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
      const j = ny * CW + nx, cj = c0 + (dx && dy ? 1.414 : 1);
      if (cj >= costOf(j)) continue;
      if (j !== g && !open(j)) continue;
      A.seen[j] = A.stamp; A.cost[j] = cj; A.from[j] = c; push(cj + h(j), j);
    }
  }
  if (!found) return null;
  const cells = [];
  for (let c = g; c >= 0; c = A.from[c]) { cells.unshift(c); if (c === s) break; }
  const pts = cells.map((c) => ({ x: ((c % CW) + 0.5) * CELL * TILE, y: (Math.floor(c / CW) + 0.5) * CELL * TILE }));
  pts[0] = { x: a.x, y: a.y }; pts[pts.length - 1] = { x: b.x, y: b.y };
  // straightened: from each kept point, on to the farthest one in a clear line
  const clearLine = (p, q) => { const L = Math.hypot(q.x - p.x, q.y - p.y), n2 = Math.ceil(L / 24); for (let k = 1; k < n2; k++) { const j = tileOf(p.x + (q.x - p.x) * k / n2, p.y + (q.y - p.y) * k / n2); if (j < 0 || G.dist[j] < clear) return false; } return true; };
  const out = [pts[0]];
  let at = 0;
  while (at < pts.length - 1) {
    let next = at + 1;
    for (let k = pts.length - 1; k > at + 1; k--) if (clearLine(pts[at], pts[k])) { next = k; break; }
    out.push(pts[next]); at = next;
  }
  return measure(out);
}
function measure(pts) { let s = 0; pts.forEach((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); p.s = s; }); return pts; }
function along(pts, s) {
  if (s <= 0) return { x: pts[0].x, y: pts[0].y };
  for (let i = 1; i < pts.length; i++) if (pts[i].s >= s) { const a = pts[i - 1], b = pts[i], k = (s - a.s) / Math.max(1e-6, b.s - a.s); return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
  const e = pts[pts.length - 1];
  return { x: e.x, y: e.y };
}

// Every ferry route, worked out once per map: [{ id, name, model, car, island, ends: [berth, berth], way, len }]
export function ferryRoutes(world) {
  const m = world.map;
  if (m._ferryRoutes) return m._ferryRoutes;
  const routes = [];
  Object.defineProperty(m, '_ferryRoutes', { value: routes, enumerable: false, configurable: true });
  if (!m.tiles || !m.net) return routes;
  const G = geography(m);
  // one pass over the map: each land mass's dock tiles, and how much of each route's island district is on which
  const N = MAP_W * MAP_H, slot = new Int8Array(256).fill(-1), counts = ROUTES.map(() => new Map()), docks = new Map(), slips = new Map();
  ROUTES.forEach((R, k) => { const d = DISTRICTS.findIndex((q) => q.name === R.island); if (d >= 0 && d < 256) slot[d] = k; });
  for (let i = 0; i < N; i++) {
    const c = G.comp[i];
    if (c < 0) continue;
    if (m.tiles[i] === T.DOCK) { let l = docks.get(c); if (!l) docks.set(c, (l = [])); l.push(i); }
    else if (SLIP.has(m.tiles[i]) && G.dist[i] === 0) {
      // a street or a lot at the water's edge: a slipway a car ferry can put its stern to
      const x = i % MAP_W;
      if ((x > 0 && isWaterT(m.tiles[i - 1])) || (x < MAP_W - 1 && isWaterT(m.tiles[i + 1])) || (i >= MAP_W && isWaterT(m.tiles[i - MAP_W])) || (i < N - MAP_W && isWaterT(m.tiles[i + MAP_W]))) { let l = slips.get(c); if (!l) slips.set(c, (l = [])); l.push(i); }
    }
    const k = slot[m.dist[i] & 255];
    if (k >= 0) counts[k].set(c, (counts[k].get(c) || 0) + 1);
  }
  // the piers a boat of a model can lie at on a land mass (every step-th dock tile; for a car ferry, the slipways too),
  // worked out once each
  const berths = new Map();
  const piers = (c, step, model) => {
    const key = `${c}/${step}/${model}`, car = model === 'ferry';
    if (!berths.has(key)) {
      const out = [], tiles = car ? [...(docks.get(c) || []), ...(slips.get(c) || [])] : docks.get(c) || [];
      tiles.forEach((i, k) => { if (k % step) return; const b = berthAt(m, G, i, DIMS[model], car); if (b) out.push(b); });
      berths.set(key, out);
    }
    return berths.get(key);
  };
  for (const [k, R] of ROUTES.entries()) {
    // the island: the land mass most of the district is on
    let isl = -1, best = 0;
    for (const [c, n] of counts[k]) if (n > best) { best = n; isl = c; }
    if (isl < 0 || isl === G.main) continue;
    const dims = DIMS[R.model];
    const isle = piers(isl, 1, R.model), main = piers(G.main, 2, R.model);
    if (!isle.length || !main.length) continue;
    // the closest pairs as the crow flies, then the shortest way by water among them
    // (not at a pier another route already has: its boat lies there)
    const pairs = [], free = (a) => !routes.some((r) => r.ends.some((e) => Math.hypot(e.x - a.x, e.y - a.y) < 600));
    for (const a of main) if (free(a)) for (const b of isle) pairs.push([Math.hypot(a.turn.x - b.turn.x, a.turn.y - b.turn.y), a, b]);
    pairs.sort((p, q) => p[0] - q[0]);
    let pick = null;
    for (const [, a, b] of pairs.slice(0, 4)) {
      const way = waterWay(G, a.turn, b.turn, dims.clear);
      if (way && (!pick || way[way.length - 1].s < pick.way[pick.way.length - 1].s)) pick = { a, b, way };
    }
    if (!pick) continue;
    // the mainland pier's name: the district of the land behind it (the docks belong to the bay)
    let mainName = '';
    for (let d = 40; d <= 900 && !mainName; d += 32) { const x = pick.a.sx - pick.a.ox * d, y = pick.a.sy - pick.a.oy * d, j = tileOf(x, y); if (j >= 0 && !isWaterT(m.tiles[j]) && m.tiles[j] !== T.DOCK) mainName = m.districtAt(x, y).name; }
    // the way over each way (from the mainland, from the island), which way it sets off, how long the swing onto it takes
    const ways = [pick.way, measure(pick.way.slice().reverse().map((p) => ({ x: p.x, y: p.y })))], ends = [pick.a, pick.b];
    const heads = ways.map((w) => headAt(w, 0)), swings = heads.map((h, k) => Math.max(1, Math.abs(wrapA(h - ends[k].a)) / SWING_RATE));
    routes.push({ id: routes.length, name: R.name, model: R.model, car: R.model === 'ferry', island: R.island, mainland: mainName, ends, way: pick.way, ways, heads, swings, len: Math.round(pick.way[pick.way.length - 1].s) });
  }
  return routes;
}

// ---- running them --------------------------------------------------------------------------------------------------
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
// the run across as distance travelled by time t (s), ramping up and down over RAMP_S: and how long it takes
function crossing(len) { return len / SPEED + RAMP_S; }
function crossedAt(len, t) {
  const D = crossing(len), R = RAMP_S;
  if (t <= 0) return 0;
  if (t >= D) return len;
  if (t < R) return SPEED * t * t / (2 * R);
  if (t > D - R) { const u = D - t; return len - SPEED * u * u / (2 * R); }
  return SPEED * R / 2 + SPEED * (t - R);
}

// where a ferry is and which way it points, now: { x, y, a }
function placeOf(F, R, now) {
  const e = R.ends[F.end], o = R.ends[1 - F.end], t = now - F.t0;
  if (F.phase === 'dock') return { x: e.x, y: e.y, a: e.a };
  if (F.phase === 'leave') { const u = ease(t / F.dur); return { x: e.x + (e.turn.x - e.x) * u, y: e.y + (e.turn.y - e.y) * u, a: e.a }; }
  if (F.phase === 'swing') { const u = ease(t / F.dur); return { x: e.turn.x, y: e.turn.y, a: e.a + wrapA(R.heads[F.end] - e.a) * u }; }
  if (F.phase === 'cross') { const s = crossedAt(R.len, t), p = along(R.ways[F.end], s); return { x: p.x, y: p.y, a: headAt(R.ways[F.end], s) }; }
  if (F.phase === 'turn') { const u = ease(t / F.dur); return { x: o.turn.x, y: o.turn.y, a: F.a0 + wrapA(o.a - F.a0) * u }; }
  /* back */ const u = ease(t / F.dur);
  return { x: o.turn.x + (o.x - o.turn.x) * u, y: o.turn.y + (o.y - o.turn.y) * u, a: o.a };
}
// which way the way goes at s: the way through the next and the last stretch of it (corners rounded off)
function headAt(way, s) {
  const len = way[way.length - 1].s, q = along(way, Math.min(len, s + 180)), p0 = along(way, Math.max(0, s - 180));
  return Math.atan2(q.y - p0.y, q.x - p0.x);
}
// on to the next part of the trip when this one is done
function advance(world, F, R, now) {
  const t = now - F.t0;
  if (t < F.dur) return;
  const e = R.ends[F.end], o = R.ends[1 - F.end];
  if (F.phase === 'dock') { F.phase = 'leave'; F.dur = Math.hypot(e.turn.x - e.x, e.turn.y - e.y) / LEAVE_V; unloadDone(world, F); }
  else if (F.phase === 'leave') { F.phase = 'swing'; F.dur = R.swings[F.end]; }
  else if (F.phase === 'swing') { F.phase = 'cross'; F.dur = crossing(R.len); }
  else if (F.phase === 'cross') { F.phase = 'turn'; F.dur = TURN_S; F.a0 = headAt(R.ways[F.end], R.len); }
  else if (F.phase === 'turn') { F.phase = 'back'; F.dur = Math.hypot(o.turn.x - o.x, o.turn.y - o.y) / BACK_V; }
  else { F.phase = 'dock'; F.dur = FERRY_DWELL_S; F.end = 1 - F.end; arrived(world, F, R); }
  F.t0 = now;
}

function spawnFerry(world, R) {
  const e = R.ends[0];
  const v = world.spawnVehicle(R.model, e.x, e.y, e.a, { despawnable: false, npcOwned: true, paint: R.car ? 2 : 9 });
  v.ferry = { route: R.id };
  const cap = spawnNpc(world, 'casual', e.x, e.y, 'driver');
  cap.vehId = v.id; cap.seat = 0; v.seats[0] = cap.id;
  v.deck = R.car ? new Array(DECK.length).fill(0) : null;
  return v;
}

// The ferries run wherever there are people about (a server with an NPC budget: the live game, practice; a test asks
// for them with opts.ferries)
export function update(world, dt) {
  if (world.opts.ferries === false || (!world.npcBudget && !world.opts.ferries)) return;
  const routes = ferryRoutes(world);
  if (!routes.length) return;
  const now = world.time;
  world.ferries ??= routes.map((R) => ({ route: R.id, v: 0, end: 0, phase: 'dock', t0: now, dur: FERRY_DWELL_S }));
  for (const F of world.ferries) {
    const R = routes[F.route];
    let v = F.v ? world.get(F.v) : null;
    if (!v) { if (world.tick % 20 !== 5) continue; v = spawnFerry(world, R); F.v = v.id; F.end = 0; F.phase = 'dock'; F.t0 = now; F.dur = FERRY_DWELL_S; }
    advance(world, F, R, now);
    const p = placeOf(F, R, now);
    v.vx = (p.x - v.x) / Math.max(dt, 1e-3); v.vy = (p.y - v.y) / Math.max(dt, 1e-3); v.av = wrapA(p.a - v.a) / Math.max(dt, 1e-3);
    if (F.phase === 'dock') { v.vx = 0; v.vy = 0; v.av = 0; }
    v.x = p.x; v.y = p.y; v.a = p.a; v.lz = 0;
    world.place(v);
    v.ownStepTick = world.tick;   // (no physics: it goes where the timetable puts it)
    v.hp = v.def.hp; v.wreckAt = 0; v.dead = false; v.burnUntil = 0;
    // its deck: the cars on it, where their slots are now
    if (v.deck) {
      const c = Math.cos(v.a), s = Math.sin(v.a);
      v.deck.forEach((id, k) => {
        const car = id ? world.get(id) : null;
        if (!car || !car.onDeck || car.onDeck.f !== v.id) { v.deck[k] = 0; return; }
        const [f, r] = deckAt(k, v.def.L, car.def.L);
        car.x = v.x + c * f - s * r; car.y = v.y + s * f + c * r; car.a = v.a; car.vx = v.vx; car.vy = v.vy; car.av = 0; car.lz = DECK_LZ;
        car.ownStepTick = world.tick;
        world.place(car);
        for (const sid of car.seats) { const q = sid ? world.get(sid) : null; if (q) { q.x = car.x; q.y = car.y; q.lz = car.lz; } }
      });
    }
  }
}

// at the pier: the cars driven off onto the landing behind it, facing inland
function arrived(world, F, R) {
  const v = world.get(F.v);
  if (!v) return;
  if (v.deck && R.ends[F.end].land) v.deck.forEach((id, k) => { const car = id ? world.get(id) : null; v.deck[k] = 0; if (car) driveOff(world, car, R, F.end, true); });
  for (let i = 1; i < v.seats.length; i++) { const q = v.seats[i] ? world.get(v.seats[i]) : null; if (q && q.player) { q.player.meDirty = true; world.notify(q.player, `${termName(R, F.end)} - get off with the vehicle key.`, 'info'); } }
}
// a car off the deck onto the landing behind the pier at end `end`: the first clear spot (a drivable tile, no vehicle
// on it) in a few rows across the landing, nearest first
function driveOff(world, car, R, end, there) {
  const e = R.ends[end], a = Math.atan2(-e.oy, -e.ox), fx = Math.cos(a), fy = Math.sin(a), rx = -fy, ry = fx;
  let spot = null;
  for (const f of [0, 130, 260]) {
    for (const r of [0, 70, -70, 140, -140]) {
      const x = e.land.x + fx * f + rx * r, y = e.land.y + fy * f + ry * r;
      let ok = true;
      for (const [cf, cr] of [[0, 0], [car.def.L / 2, 0], [-car.def.L / 2, 0], [0, car.def.W / 2], [0, -car.def.W / 2]]) { const j = tileOf(x + fx * cf + rx * cr, y + fy * cf + ry * cr); if (j < 0 || !LAND_DRIVE.has(world.map.tiles[j])) { ok = false; break; } }
      if (ok && world.query(x, y, 60, K.VEH).some((o) => o !== car && !o.onDeck && o.def.kind !== 'boat')) ok = false;
      if (ok) { spot = { x, y }; break; }
    }
    if (spot) break;
  }
  spot ||= { x: e.land.x, y: e.land.y };
  car.onDeck = null; car.x = spot.x; car.y = spot.y; car.a = a; car.vx = 0; car.vy = 0; car.av = 0; car.lz = 0; car.ownStepTick = world.tick;
  world.place(car);
  for (const sid of car.seats) {
    const q = sid ? world.get(sid) : null;
    if (!q) continue;
    q.x = car.x; q.y = car.y; q.lz = 0;
    if (q.player) { q.player.meDirty = true; world.notify(q.player, there ? `${end === 0 ? R.mainland : R.island}: drive off.` : 'Off the ferry.', 'good'); }
  }
}
function unloadDone(world, F) { const v = world.get(F.v); if (v) for (const sid of v.seats) { const q = sid ? world.get(sid) : null; if (q && q.player) q.player.meDirty = true; } }
const termName = (R, end) => (end === 0 ? `${R.mainland} pier` : `${R.island} pier`);

// ---- riding ---------------------------------------------------------------------------------------------------------
const ferryOf = (world, v) => (v && v.ferry && world.ferries ? world.ferries[v.ferry.route] : null);
// how near a ped is to a hull's side (along it, clamped to its length; then out to the side)
function hullDist(v, x, y) {
  const c = Math.cos(v.a), sn = Math.sin(v.a), dx = x - v.x, dy = y - v.y;
  const along = Math.max(-v.def.L / 2, Math.min(v.def.L / 2, dx * c + dy * sn));
  return Math.hypot(dx - c * along, dy - sn * along) - v.def.W / 2;
}

// interact by a ferry that's in: walk aboard, or drive aboard a car ferry
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || !world.ferries) return null;
  const routes = ferryRoutes(world);
  for (const F of world.ferries) {
    const v = F.v ? world.get(F.v) : null, R = routes[F.route];
    if (!v || F.phase !== 'dock' || world.time - F.t0 > F.dur - 1) continue;
    const to = F.end === 0 ? R.island : R.mainland;
    if (!ped.vehId) {
      if (hullDist(v, ped.x, ped.y) > BOARD_REACH) continue;
      return { label: `Board the ${R.name} to ${to}`, run: () => boardFoot(world, p, v, R, to) };
    }
    const car = world.get(ped.vehId);
    const e = R.ends[F.end];
    // changed your mind: back off the deck onto the landing (no refund)
    if (car && car.onDeck && car.onDeck.f === v.id && ped.seat === 0 && e.land) {
      return { label: 'Drive off the ferry', run: () => { if (!car.onDeck) return false; v.deck[car.onDeck.k] = 0; driveOff(world, car, R, F.end, false); return true; } };
    }
    if (!R.car || !car || ped.seat !== 0 || car.ferry || car.onDeck || car.def.kind === 'boat') continue;
    if (Math.hypot(car.x - e.sx, car.y - e.sy) > RAMP_REACH) continue;
    return { label: car.def.L > DECK_MAX_L ? `The ${car.def.name} won't fit on the ferry` : `Drive aboard the ${R.name} to ${to}`, run: () => driveAboard(world, p, v, car, R, to) };
  }
  return null;
}
function boardFoot(world, p, v, R, to) {
  const ped = p.ped;
  if (!ped || ped.vehId || ped.dead) return false;
  if (ped.carrying) { world.notify(p, 'Put the crate down first.', 'warn'); return false; }
  const seat = v.seats.findIndex((s, i) => i > 0 && !s);
  if (seat < 0) { world.notify(p, 'The ferry is full.', 'warn'); return false; }
  v.seats[seat] = ped.id; ped.vehId = v.id; ped.seat = seat; ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
  world.notify(p, `Aboard the ${R.name} to ${to}.`, 'good');
  p.meDirty = true;
  return true;
}
function driveAboard(world, p, v, car, R, to) {
  if (car.def.L > DECK_MAX_L) { world.notify(p, `The ${car.def.name} is too big for the ferry.`, 'warn'); return false; }
  const k = v.deck ? v.deck.findIndex((id) => !id) : -1;
  if (k < 0) { world.notify(p, 'The car deck is full - wait for the next one.', 'warn'); return false; }
  v.deck[k] = car.id; car.onDeck = { f: v.id, k };
  car.vx = 0; car.vy = 0; car.av = 0; car.input = { throttle: 0, steer: 0, hb: false };
  world.notify(p, `On the car deck of the ${R.name} to ${to}. You'll drive off at the far side.`, 'good');
  p.meDirty = true;
  return true;
}
// out of a car on the deck (vehicles.js exitVehicle): into a seat aboard instead of into the sea - true when handled
export function leaveDeckCar(world, ped, car) {
  if (!car.onDeck) return false;
  const v = world.get(car.onDeck.f);
  const seat = v ? v.seats.findIndex((s, i) => i > 0 && !s) : -1;
  if (!v || seat < 0) return false;
  const i = car.seats.indexOf(ped.id);
  if (i >= 0) car.seats[i] = 0;
  if (i === 0) car.input = { throttle: 0, steer: 0, hb: false };
  v.seats[seat] = ped.id; ped.vehId = v.id; ped.seat = seat;
  if (ped.player) { ped.player.meDirty = true; world.notify(ped.player, 'Out of the car, up on the passenger deck. Your car comes off at the far side.', 'info'); }
  return true;
}
// off a ferry (vehicles.js exitVehicle): onto the pier when it's in - where the boat's stern is
export function exitToward(world, v) {
  const F = ferryOf(world, v);
  if (!F || F.phase !== 'dock') return null;
  const e = ferryRoutes(world)[F.route].ends[F.end];
  return { x: e.sx - e.ox * 60, y: e.sy - e.oy * 60 };
}

// what the HUD shows aboard: the route, where to, how long, whether it's in
export function rideInfo(world, p) {
  const ped = p.ped;
  if (!ped || !ped.vehId || !world.ferries) return null;
  let v = world.get(ped.vehId);
  if (v && v.onDeck) v = world.get(v.onDeck.f);
  const F = ferryOf(world, v);
  if (!F) return null;
  const R = ferryRoutes(world)[F.route], docked = F.phase === 'dock';
  const to = docked ? termName(R, 1 - F.end) : termName(R, 1 - F.end);
  return { k: 'ferry', line: R.name, at: docked ? termName(R, F.end) : null, next: to, eta: docked ? Math.max(0, Math.round(F.dur - (world.time - F.t0))) : Math.round(timeTo(F, R, world.time)), car: !!(world.get(ped.vehId) && world.get(ped.vehId).onDeck) };
}
// seconds until the ferry is in at its next pier
// the trip to pier `end` from leaving the other one: out, swinging round, across, turning round, backing in
function legTo(R, end) {
  const e = R.ends[1 - end], o = R.ends[end];
  return Math.hypot(e.turn.x - e.x, e.turn.y - e.y) / LEAVE_V + R.swings[1 - end] + crossing(R.len) + TURN_S + Math.hypot(o.turn.x - o.x, o.turn.y - o.y) / BACK_V;
}
function timeTo(F, R, now) {
  const left = F.dur - (now - F.t0), o = R.ends[1 - F.end];
  const back = Math.hypot(o.turn.x - o.x, o.turn.y - o.y) / BACK_V;
  if (F.phase === 'leave') return left + R.swings[F.end] + crossing(R.len) + TURN_S + back;
  if (F.phase === 'swing') return left + crossing(R.len) + TURN_S + back;
  if (F.phase === 'cross') return left + TURN_S + back;
  if (F.phase === 'turn') return left + back;
  return left;
}

// The Transit app and the map: the routes (their ways across, the piers) and where each boat is
export function ferryInfo(world) {
  const routes = ferryRoutes(world), now = world.time;
  return routes.map((R) => {
    const F = world.ferries ? world.ferries[R.id] : null, v = F && F.v ? world.get(F.v) : null;
    // seconds until the boat next leaves each pier (in at one now: its time left there; the other, after the trip over)
    let leaves = null;
    if (F) {
      const E = F.end, O = 1 - E;
      if (F.phase === 'dock') { const left = F.dur - (now - F.t0); leaves = [0, 0]; leaves[E] = left; leaves[O] = left + legTo(R, O) + FERRY_DWELL_S; }
      else { const t = timeTo(F, R, now); leaves = [0, 0]; leaves[O] = t + FERRY_DWELL_S; leaves[E] = t + FERRY_DWELL_S + legTo(R, E) + FERRY_DWELL_S; }
      leaves = leaves.map((x) => Math.max(0, Math.round(x)));
    }
    return {
      id: R.id, name: R.name, car: R.car, island: R.island, mainland: R.mainland, len: R.len,
      piers: R.ends.map((e) => ({ x: Math.round(e.sx), y: Math.round(e.sy) })),
      path: [[Math.round(R.ends[0].x), Math.round(R.ends[0].y)], ...R.way.map((p) => [Math.round(p.x), Math.round(p.y)]), [Math.round(R.ends[1].x), Math.round(R.ends[1].y)]],
      boat: v ? { x: Math.round(v.x), y: Math.round(v.y), a: +v.a.toFixed(2), in: F.phase === 'dock' ? F.end : -1 } : null, leaves,
    };
  });
}
