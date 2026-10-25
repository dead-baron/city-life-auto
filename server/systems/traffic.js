// NPC traffic (GDD §10): drivers follow lanes along the road network - straight, diagonal and
// curved streets, the one-way frontage roads, the elevated ring highway and its ramps - turn
// through junctions on smooth paths, obey 2- and 3-phase signals, keep their distance, slow for
// bends, pull over for sirens and panic when attacked; parked cars and docked boats near players.
// Also exports the shared driving controller + route planner used by police and EMS.
import { K, T, TILE } from '../../shared/constants.js';
import { lanePath, turnPath, exitsFrom, edgeZ, nearestEdge } from '../../shared/roads.js';
import { signalFor } from '../../shared/signals.js';
import { pointAt, measure, project } from '../../shared/geom.js';
import { angleDiff, clamp } from '../../shared/math.js';
import { TRAFFIC_MIX, PARKED_MIX, RACK_MIX, TRUCK_MODELS, VEHICLES, motoMix } from '../../shared/vehicles.js';
import { PED_BLOCK, CAR_BLOCK, BOAT_BLOCK, WATER_T } from '../../shared/map.js';
import { waterSize as boatsWaterSize } from './boats.js';   // (the marinas' bigger boats: big water only)
import { vehForwardSpeed } from '../../shared/physics.js';
import { sameLevel } from '../../shared/levels.js';
import { mulberry32, hash2 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc, shoo } from './npc.js';
import { wildStyle } from './wildlife.js';
import { crossingLimit } from './trains.js';
import { inAnyView, cineEyes } from '../view.js';
import { pointGrid } from '../pointgrid.js';
import { HIGHWAY_SPEED } from '../../shared/rules.js';
import { routeSteps, haltsOn, haltCap, haltAt, rejoin } from './transit.js';
import { isBlocked, unjam, goRound } from './reroute.js';   // (drivers who find another way round a backup: task #315)
import { deadWay, isRoadEnd, startTurn, stepTurn, holdShort, roadGivesOut, roomBehind, giveUpEnd, clearance, OPEN_ANY as OPEN_ANY_GROUND } from './roadends.js';   // (keeping out of road ends, turning round at them: task #384; giving one up: giveUpEnd)
import { loadExplosives } from './cargo.js';
import { homeLotSpots } from './homes.js';
import { FLY } from '../../shared/flight.js';   // (an aircraft up in the air: over all this, untouched)
import { dressWild, riderLook } from './wildfolk.js';   // (the country riders' looks: the people of the wilds)

const rng = mulberry32(4242);
// a flatbed out of the yards, the docks, off the highway or on the country roads (to the quarry, the mine) carries a
// load of explosives this often: 2-4 marked crates, a huge blast if it goes up (task #398)
const EXPLOSIVE_LOADS = 0.25;

function weighted(mix) {
  let total = 0;
  for (const [, w] of mix) total += w;
  let r = rng() * total;
  for (const [id, w] of mix) { r -= w; if (r <= 0) return id; }
  return mix[0][0];
}

// cruising speed by road class (px/s)
const CRUISE = { hwy: HIGHWAY_SPEED, ramp: 330, ave: 290, blvd: 290, front: 290, st: 245, drive: 255, minor: 170, rural: 330, art: 275, dirt: 150, alley: 120 };

function nearestAnchor(world, x, y) {
  let best = null, bd = Infinity;
  for (const p of world.players.values()) {
    if (!p.ped || p.ped.dead) continue;
    const d = (p.ped.x - x) ** 2 + (p.ped.y - y) ** 2;
    if (d < bd) { bd = d; best = p.ped; }
  }
  return best ? { a: best, d: Math.sqrt(bd) } : null;
}

// Pick the next road at a junction: mostly straight on, sometimes a turn; drivers that have
// wandered far from every player drift back toward the action. A cyclist never takes the highway or a ramp up, and a road
// bike keeps off the dirt tracks when there's another way.
const NO_BIKES = new Set(['hwy', 'ramp']);
function chooseExit(world, n, inEdge, def = null, goal = null) {
  const net = world.map.net;
  let opts = exitsFrom(net, n, inEdge);
  if (def && (def.pedal || def.moto === 'scooter')) {   // (nor a 50cc scooter - unless there's no other way on)
    const ok = opts.filter((o) => !NO_BIKES.has(net.edges[o.edge].kind) && net.edges[o.edge].lvl === 0);
    if (ok.length) opts = ok;
    if (def.rough > 1) { const paved = opts.filter((o) => net.edges[o.edge].kind !== 'dirt'); if (paved.length) opts = paved; }
  }
  if (!opts.length) return null;
  // through traffic keeps out of the cul-de-sacs and the roads that just stop: they'd only have to turn round at the end
  // and come back (where three arms of a junction were dead ends, out of one and straight into the next) - unless
  // there's no other way on (roadends.js)
  const through = opts.filter((o) => !deadWay(net, o.edge, n.id));
  if (through.length) opts = through;
  // through traffic keeps to the streets: an alley (one car wide: two meeting in it are stuck there) only when it's the
  // only way on
  const streets = opts.filter((o) => net.edges[o.edge].kind !== 'alley');
  if (streets.length) opts = streets;
  // nor down World v3's wild tracks (dirt cul-de-sacs to the moved places: notraffic, shared/world3-wild.js) unless
  // there's no other way on
  const ways = opts.filter((o) => !net.edges[o.edge].notraffic);
  if (ways.length) opts = ways;
  const open = opts.filter((o) => !isBlocked(world, o.edge));   // (not down a road remembered as blocked: reroute.js)
  if (open.length) opts = open;
  // a driver with somewhere to be (streetlife.js: a street race's finish line, a getaway, an armored truck's run): the
  // shortest way there by road (goal.dist: how far each junction is from it), else the way that ends nearest it - back
  // the way it came only when there's no other
  if (goal) {
    let best = null, bd = Infinity;
    for (const o of opts) {
      const m = net.nodes[o.to], left = goal.dist ? goal.dist[o.to] : Infinity;
      const dd = (Number.isFinite(left) ? (left + net.edges[o.edge].len) ** 2 : 1e14 + (m.x - goal.x) ** 2 + (m.y - goal.y) ** 2) + (o.edge === inEdge ? 1e16 : 0);
      if (dd < bd) { bd = dd; best = o; }
    }
    if (best) return best;
  }
  const near = nearestAnchor(world, n.x, n.y);
  if (near && near.d > 900 && rng() < 0.7) {
    let best = null, bd = Infinity;
    for (const o of opts) {
      const m = net.nodes[o.to];
      const dd = (m.x - near.a.x) ** 2 + (m.y - near.a.y) ** 2;
      if (dd < bd) { bd = dd; best = o; }
    }
    if (best) return best;
  }
  const straight = opts.filter((o) => Math.abs(o.turn) < 0.4);
  if (straight.length && rng() < 0.55) return straight[Math.floor(rng() * straight.length)];
  // highway drivers mostly stay on the highway
  if (n.lvl === 1 && straight.length && rng() < 0.6) return straight[0];
  return opts[Math.floor(rng() * opts.length)];
}

// Backed out of a road's end to junction n (roadends.js): on by one of the other roads from there - its waypoints set,
// the way chosen as if it had driven out of the road's end (inEdge). Null if there's no other way.
export function leaveBy(world, v, n, inEdge) {
  const ai = v.ai, nx = chooseExit(world, world.map.net.nodes[n], inEdge, v.def, v.ai.goal);
  if (!nx || nx.edge === inEdge) return null;
  delete ai.route;
  enterEdge(world, v, nx.edge, n, 0, 0);
  ai.cameBy = inEdge;
  return nx;
}

// Any way out of junction n having come in by inEdge, the sharpest turns too (the gentlest first), else back the way it
// came (where that's a two-way road): crossJunction's last resort. Null only for a one-way road into a corner.
function anyExit(net, n, inEdge) {
  const inDir = n.dirs[inEdge] + Math.PI;
  let best = null;
  for (const [id, to] of Object.entries(n.links)) {
    if (+id === inEdge) continue;
    const turn = wrapA(n.dirs[+id] - inDir);
    if (!best || Math.abs(turn) < Math.abs(best.turn)) best = { edge: +id, to, turn };
  }
  return best || (n.links[inEdge] !== undefined ? { edge: inEdge, to: n.links[inEdge], turn: Math.PI } : null);
}
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// Lane for a road we are about to enter, given the turn into it (right turns from the kerb lane,
// left turns from the inside lane, straight on keeps its lane).
function laneFor(e, turn, cur) {
  if (e.nl <= 1) return 0;
  if (turn > 0.5) return 0;                 // right turn (screen coords: +angle = clockwise = right)
  if (turn < -0.5) return e.nl - 1;
  return Math.min(e.nl - 1, cur ?? Math.floor(rng() * e.nl));
}

// A lane's points every `step` px or so, from point `from` on - and any point the straight line on from the last one
// kept would miss by more than STRIDE_DEV px: a corner left out is a chord across the block. (The owner, 2026-10-17:
// "Vehicles are still turning and getting stuck on buildings". Streets that turn a corner in one point - Gull Lane in
// Sandpiper Bay, Assay Street and Company Row in Copper Gulch, Timber Bend's and Willow Crossing's in World v3, Mill
// Lane in today's world - lost the corner: it was the first point of the stretch, never kept, and a car came off the
// junction and steered straight for the far end of the street, across the pavement, the plaza and into the building.)
// (The gentle curves keep their points as before: only a point the line would miss by that much is added.)
const STRIDE_DEV = 20;
const offLine = (p, a, b) => {   // (how far p is from the segment a-b)
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1) : 0;
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
};
export const stride = (pts, from, step = 72) => {
  const out = [];
  let acc = 0, last = from > 0 ? from - 1 : 0;   // (the last point kept, or where it joins: the point before)
  for (let i = from; i < pts.length; i++) {
    if (i > from) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    let keep = i === pts.length - 1 || acc >= step;
    for (let j = last + 1; !keep && j <= i; j++) keep = offLine(pts[j], pts[last], pts[i + 1]) > STRIDE_DEV;
    if (keep) { out.push({ x: pts[i].x, y: pts[i].y }); acc = 0; last = i; }
  }
  return out;
};
const endDir = (pts) => { const a = pts[Math.max(0, pts.length - 2)], b = pts[pts.length - 1]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
const startDir = (pts) => { const a = pts[0], b = pts[Math.min(pts.length - 1, 1)]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };

// Queue the waypoints for the current edge from arc length s on, ending at its stop line, and
// decide which way to go at its far end.
export function enterEdge(world, v, edgeId, from, lane, s0 = 0) {
  const net = world.map.net;
  const ai = v.ai;
  const e = net.edges[edgeId];
  const to = e.a === from ? e.b : e.a;
  ai.edge = edgeId; ai.from = from;
  ai.next = chooseExit(world, net.nodes[to], edgeId, v.def, ai.goal);
  // heading up the deck for an off-ramp from the inside lane: over to the outer lane on the way (the ramp's
  // deceleration lane peels off it)
  let lp;
  if (lane > 0 && ai.next && net.nodes[to].lvl === 1 && net.edges[ai.next.edge].lvl === 'ramp') { lp = laneChangePath(net, e, from, lane, 0, s0); lane = 0; }
  else lp = lanePath(net, e, from, lane);
  ai.lane = lane;
  let i0 = 0;
  while (i0 < lp.length - 1 && lp[i0 + 1].s <= s0) i0++;
  const pts = stride(lp, i0 + 1);
  const stop = pts[pts.length - 1] || { x: lp[lp.length - 1].x, y: lp[lp.length - 1].y };
  Object.assign(stop, { stop: true, node: to, edge: edgeId });
  if (!pts.length) pts.push(stop);
  ai.pts = pts;
  ai.kindSpeed = CRUISE[e.kind] || 250;
  ai.turning = !!ai.next && Math.abs(ai.next.turn) > 0.5;
}
// Lane k0 drifting over to lane k1 along the last stretch of edge e (up to 700 px, eased), from arc length s0 on.
function laneChangePath(net, e, from, k0, k1, s0 = 0) {
  const a = lanePath(net, e, from, k0), b = lanePath(net, e, from, k1);
  const L = a[a.length - 1].s, Lb = b[b.length - 1].s;
  const sEnd = Math.max(s0 + 1, L - 40), sStart = Math.max(s0, sEnd - Math.min(700, L * 0.7));
  const out = [];
  for (let s = 0; ; s = Math.min(L, s + 40)) {
    const p = pointAt(a, s), q = pointAt(b, (s / Math.max(1, L)) * Lb);
    const t = clamp((s - sStart) / Math.max(1, sEnd - sStart), 0, 1), u = t * t * (3 - 2 * t);
    out.push({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u });
    if (s >= L) break;
  }
  measure(out);
  return out;
}

// Through the junction at the end of the current edge onto the chosen next one.
function crossJunction(world, v) {
  const net = world.map.net;
  const ai = v.ai;
  const e = net.edges[ai.edge];
  const to = e.a === ai.from ? e.b : e.a;
  // (no way on that a driver would take from here - a one-way street into a corner, a bike at a junction of highways:
  // any way out, the sharpest turn too, else back the way it came; failing all that it pulls up where it is - a breakdown,
  // for the clean-up and the tow trucks - rather than being left in the road with nobody steering it: the owner's
  // Copper Gulch jam, 2026-10-15)
  const nx = ai.next || chooseExit(world, net.nodes[to], ai.edge, v.def, ai.goal) || anyExit(net, net.nodes[to], ai.edge);
  if (!nx) { parkIt(v); return; }
  const ne = net.edges[nx.edge];
  // a vehicle on a route (a bus's line, a taxi's way) takes its next step; past the end of a route it's traffic again
  if (ai.route && !ai.route.loop && ai.route.i + 1 >= routeSteps(world, ai.route).length) delete ai.route;
  const lane = v.def.pedal || ai.route ? 0 : laneFor(ne, nx.turn, ai.lane);   // (a cyclist, a bus and a taxi keep to the kerb)
  const a = lanePath(net, e, ai.from, ai.lane), b = lanePath(net, ne, to, lane);
  const uturn = nx.edge === ai.edge;   // (back the way it came: only ever at a road's end - exitsFrom)
  if (ai.route) { ai.route.i = (ai.route.i + 1) % routeSteps(world, ai.route).length; enterRoute(world, v, ai.route.i, 0); }
  else enterEdge(world, v, nx.edge, to, lane, 0);
  ai.cameBy = e.id;   // (the road it came into the junction by: junctionClear)
  // at a road's end it turns round by a manoeuvre, into the lane back (roadends.js); anywhere else, a smooth path
  // through the junction onto its next road
  if (uturn) { startTurn(world, v, nx.edge, to, isRoadEnd(net, to) ? to : -1); return; }
  const turn = turnPath(a[a.length - 1], endDir(a), b[0], startDir(b), Math.abs(nx.turn) > 0.5 ? 6 : 3);
  ai.pts.unshift(...turn.map((p) => ({ x: p.x, y: p.y })));
}

// A vehicle on a route (transit.js: a bus on its line, a taxi on its way): onto step i from arc length s0, in the kerb
// lane, the places it pulls up at on this stretch (a bus's stops, a taxi's pick-up or drop-off) as waypoints, and the
// route's next step as the way on at the far end (the last step of a route that isn't a loop: wherever traffic goes).
export function enterRoute(world, v, i, s0 = 0) {
  const net = world.map.net, ai = v.ai, steps = routeSteps(world, ai.route), n = steps.length;
  const st = steps[i], e = net.edges[st.edge], to = e.a === st.from ? e.b : e.a;
  const nst = ai.route.loop || i + 1 < n ? steps[(i + 1) % n] : null;
  ai.route.i = i;
  enterEdge(world, v, st.edge, st.from, 0, s0);
  // the way on is the route's next step (found among the junction's exits; the route was planned through them)
  if (nst) {
    const ne = net.edges[nst.edge];
    ai.next = exitsFrom(net, net.nodes[to], st.edge).find((o) => o.edge === nst.edge) || { edge: nst.edge, to: ne.a === to ? ne.b : ne.a, turn: 0 };
    ai.turning = Math.abs(ai.next.turn) > 0.5;
  }
  // the halts along this stretch, in among the waypoints by how far along they are
  const lp = lanePath(net, e, st.from, 0);
  for (const q of haltsOn(world, v, i)) {
    if (q.s <= s0 + 10) continue;
    const p = pointAt(lp, q.s);
    let at = ai.pts.length - 1;   // (before the stop line at the far end)
    for (let j = 0; j < ai.pts.length - 1; j++) { const w = ai.pts[j]; if ((w.x - p.x) * p.tx + (w.y - p.y) * p.ty > 0) { at = j; break; } }
    ai.pts.splice(at, 0, { x: p.x, y: p.y, halt: q.k });
  }
}

// ---- shared driving controller ----------------------------------------------------
// Decides the speed (bends, obstacles, crossings) once a tick; the steering and pedals are then
// trimmed again between the physics sub-steps (trim) so AI drivers react twice as often.
export function driveToward(world, v, wx, wy, desired, opts = {}) {
  const fwd = vehForwardSpeed(v);
  const want = Math.atan2(wy - v.y, wx - v.x);
  const diff = angleDiff(v.a, want);
  let speed = desired;
  if (Math.abs(diff) > 0.9) speed = Math.min(speed, 140);
  if (!opts.ignoreObstacles) speed = Math.min(speed, obstacleSpeed(world, v, fwd, opts.ignore));   // (opts.ignore: ids not to brake for - a club riding in formation)
  // a siren (or a bus that chose to) stopped behind something that won't move: round it where it's clear (reroute.js)
  if (v.ai && (v.siren || opts.round) && opts.round !== false && !opts.ignoreObstacles) {   // (round: false - not now, nearly there)
    const r = goRound(world, v, v.ai, speed, desired);
    if (r) { wx = r.x; wy = r.y; speed = Math.min(r.speed, obstacleSpeed(world, v, fwd, new Set([r.ignore, ...(opts.ignore || [])]))); }
  }
  if (!opts.ignoreCrossings && (v.lz || 0) < 0.3) speed = Math.min(speed, crossingLimit(world, v, fwd)); // level-crossing gates down: stop (or gamble)
  // reverse out when wedged
  const ai = v.ai;
  let reversing = false;
  if (ai) {
    // never on into a building or a wall - panicking, going round something, pulling over or pushed off the road; up
    // against one with its way on past it, it backs out (wallGuard)
    if ((v.lz || 0) < 0.3) ({ speed, wx, wy } = wallGuard(world, v, wx, wy, speed, fwd));
    if (Math.abs(fwd) < 12 && desired > 60 && speed > 40) ai.stuck = (ai.stuck || 0) + 0.05; else ai.stuck = Math.max(0, (ai.stuck || 0) - 0.1);
    if (ai.stuck > 2.5) { ai.reverseUntil = world.time + 1.3; ai.stuck = 0; }
    reversing = !!(ai.reverseUntil && world.time < ai.reverseUntil);
    ai.ctl = { wx, wy, speed, reversing, t: world.tick };   // (vehicles.js re-trims to it between sub-steps - this tick only)
  }
  pedals(v, wx, wy, speed, reversing);
}

// Steering and pedals toward (wx, wy) at `speed`: the wheel eases toward the target heading with
// a damping term on the yaw rate (no weaving), and the throttle anticipates - it lifts early
// when the car is coming up to the speed it wants, and brakes progressively harder the further
// over it is.
function pedals(v, wx, wy, speed, reversing) {
  const fwd = vehForwardSpeed(v);
  const diff = angleDiff(v.a, Math.atan2(wy - v.y, wx - v.x));
  let steer = clamp(diff * 2.4 - (v.av || 0) * 0.12, -1, 1);
  const err = speed - fwd;
  let throttle = err > 0 ? clamp(err / 90, 0, 1) : clamp(err / (fwd > 300 ? 70 : 90), -1, 0);
  let hb = false;
  if (speed < 6 && fwd < 40) { throttle = 0; hb = Math.abs(fwd) > 0.5; } // stopped: hold it on the brake, no creeping over the line
  if (reversing) { throttle = -0.8; steer = -clamp(diff * 2.4, -1, 1); hb = false; }
  v.input.throttle = throttle; v.input.steer = steer; v.input.hb = hb;
}

// Between physics sub-steps: re-aim at the same target with the car's new heading and speed.
export function trim(v) {
  const c = v.ai && v.ai.ctl;
  if (!c || v.wreckAt) return;
  pedals(v, c.wx, c.wy, c.speed, c.reversing);
}

// ---- never into a building --------------------------------------------------------------------------------------------
// (The owner, 2026-10-17: "Vehicles are still turning and getting stuck on buildings" - cars that had come off the road
// for whatever reason, a driver panicking, a police car going round a jam on the pavement, an ambulance swinging round to
// leave, drove on at whatever was beyond the building and pushed against its wall until something else gave.)
// How far v can go (px, forward: dir 1; back: -1) with the wheel at `steer` before its bumper meets a building or a wall
// (CAR_BLOCK, the ground the levels block): along the arc it would drive, its bumper's corners (a little in from its
// sides, so a wall it drives alongside doesn't count) and its middle. Infinity: nothing within `look`.
const WALL_STEP = 8;
export function wallGap(m, v, dir, steer, look) {
  const sp = Math.max(120, Math.abs(vehForwardSpeed(v)));
  const k = (dir * steer * v.def.turn * (1 - 0.35 * Math.min(1, sp / v.def.max))) / sp;   // (rad a px: shared/physics.js vehStep's yaw rate over the speed)
  const hl = v.def.L / 2 + 2, hw = v.def.W / 2 * 0.8, lb = m.lvl0Block;
  let x = v.x, y = v.y, a = v.a;
  for (let s = WALL_STEP; s <= look + WALL_STEP - 1; s += WALL_STEP) {
    const am = a + (k * WALL_STEP) / 2;
    x += dir * Math.cos(am) * WALL_STEP; y += dir * Math.sin(am) * WALL_STEP; a += k * WALL_STEP;
    const c = Math.cos(a), sn = Math.sin(a);
    for (let l = -1; l <= 1; l++) {
      const tx = Math.floor((x + c * dir * hl - sn * l * hw) / TILE), ty = Math.floor((y + sn * dir * hl + c * l * hw) / TILE);
      if (CAR_BLOCK[m.tileAt(tx, ty)] || (lb && m.inside(tx, ty) && lb[m.idx(tx, ty)] === 1)) return s - WALL_STEP;
    }
  }
  return Infinity;
}
// Is there a building or a wall on the straight line between two points (its first `max` px)?
export function lineBlocked(m, x0, y0, x1, y1, max = 640) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  for (let s = 16; s < Math.min(L, max); s += 16) if (CAR_BLOCK[m.tileAtPx(x0 + dx * s / L, y0 + dy * s / L)]) return true;
  return false;
}
// In driveToward, every tick: the speed it may go at and where it steers for ({ speed, wx, wy }). A building or a wall on
// the arc ahead (the wheel as it's about to be turned toward the target):
//  - only a corner of it clipping one, and a little more lock the other way clears it: it steers that way;
//  - otherwise it brakes to stop short of it, and stopped against it, backs out on the opposite lock - the nose swings
//    round toward the target - into the room behind it (a vehicle, a person, a post, another wall there: it waits);
//  - and when its way on was through the building (an ambulance's way out, a police car's way to someone, across the
//    block), it heads back to the road first (wallEsc: along its nearest street, the way the target is) and goes on
//    from there.
// Backing up, it stops short of a wall behind.
export const WALL_BACK_S = 0.9;
const WALL_ESC_S = 6;   // s at most heading back to the road
const WALL_LOOK = 220;  // px at most looked ahead (its stopping distance and a little, up to this)
const ROADISH = (t) => t === T.ROAD || t === T.BRIDGE || t === T.LOT;
function wallGuard(world, v, wx, wy, speed, fwd) {
  const ai = v.ai, now = world.time, m = world.map, out = { speed, wx, wy };
  if (v.def.kind === 'boat' || v.def.kind === 'air' || v.onDeck) return out;
  const esc = ai.wallEsc;
  if (esc) {
    // (back on the road with its way on clear, or given long enough: on as before; at the point and its way on still
    // through the building: on along the street, the next stretch)
    const there = Math.hypot(esc.x - v.x, esc.y - v.y) < 60, onRoad = ROADISH(m.tileAtPx(v.x, v.y));
    if (now > esc.until || (onRoad && !lineBlocked(m, v.x, v.y, wx, wy))) ai.wallEsc = null;
    else if (there && onRoad) { const p = roadPointToward(world, v, wx, wy); if (p) { esc.x = p.x; esc.y = p.y; } else ai.wallEsc = null; }
    if (ai.wallEsc) { out.wx = esc.x; out.wy = esc.y; out.speed = Math.min(speed, 110); }
  }
  const diff = angleDiff(v.a, Math.atan2(out.wy - v.y, out.wx - v.x));
  if (ai.reverseUntil > now) {
    if (wallGap(m, v, -1, -clamp(diff * 2.4, -1, 1), 10 + Math.max(0, -fwd) * 0.25) < 4) ai.reverseUntil = 0;   // (a wall behind: no further)
    return out;
  }
  const f = Math.max(0, fwd), look = Math.min(WALL_LOOK, 16 + (f * f) / 700 + f * 0.1), steer = clamp(diff * 2.4 - (v.av || 0) * 0.12, -1, 1);
  const gap = wallGap(m, v, 1, steer, look);
  if (gap === Infinity) { ai.wallT = 0; return out; }
  // a corner clipping it: a little more lock the other way
  for (const d of [0.35, -0.35, 0.7, -0.7]) {
    const s = clamp(steer + d, -1, 1);
    if (s === steer || wallGap(m, v, 1, s, look + 24) !== Infinity) continue;
    const a = v.a + s / 2.4;
    out.wx = v.x + Math.cos(a) * 80; out.wy = v.y + Math.sin(a) * 80; out.speed = Math.min(out.speed, 160);
    ai.wallT = 0;
    return out;
  }
  out.speed = Math.min(out.speed, Math.max(0, (gap - 4) * 2));
  if (gap < 10 && f < 30) {
    ai.wallT = (ai.wallT || 0) + 0.05;
    if (ai.wallT >= 0.3) {
      ai.wallT = 0;
      // its way on is through the building: back to the road first
      if (!ai.wallEsc && (Math.abs(diff) <= 0.12 || lineBlocked(m, v.x, v.y, wx, wy, 240))) {
        const p = roadPointToward(world, v, wx, wy);
        if (p) { ai.wallEsc = { x: p.x, y: p.y, until: now + WALL_ESC_S }; world.wallEscapes = (world.wallEscapes || 0) + 1; }
      }
      const tx = ai.wallEsc ? ai.wallEsc.x : out.wx, ty = ai.wallEsc ? ai.wallEsc.y : out.wy, d2 = angleDiff(v.a, Math.atan2(ty - v.y, tx - v.x));
      if (clearance(world, v, -1, -clamp(d2 * 2.4, -1, 1), OPEN_ANY_GROUND, 40).free >= 16) {
        ai.reverseUntil = now + WALL_BACK_S; ai.stuck = 0;
        world.wallBackouts = (world.wallBackouts || 0) + 1;      }
    }
  } else ai.wallT = 0;
  return out;
}
// The point to head for back on the road: on the lane of the nearest street (of the ground), 90 px on from the point of
// it nearest the vehicle, the way (gx, gy) is
function roadPointToward(world, v, gx, gy) {
  const net = world.map.net;
  if (!net) return null;
  const ne = nearestEdge(net, v.x, v.y, (e) => e.lvl === 0);
  if (!ne) return null;
  const e = ne.e, t = pointAt(e.pts, ne.s);
  const fwd = e.oneway || (gx - t.x) * t.tx + (gy - t.y) * t.ty >= 0;
  const lp = lanePath(net, e, fwd ? e.a : e.b, 0), pr = project(lp, v);
  return pr ? pointAt(lp, Math.min(lp[lp.length - 1].s, pr.s + 90)) : null;
}

// The point a smooth driver looks at: `look` px ahead along the path (the car's position, then
// the waypoints in order). Steering at it rather than at the next waypoint takes bends in one
// clean arc instead of a series of little corrections.
// lw: the waypoint it last passed (steerTraffic), while ai.pts is still the list it was passed on: a car off the line
// between it and the next waypoint by more than LANE_BACK[0] px (swung wide coming out of a corner, eased over for a
// siren, nudged in a jam) looks ahead along that line from the nearest point on it, so it steers back into its lane
// within a car's length or two - it used to aim straight at the next waypoint, which after a corner may be the far end
// of the street, and drove most of the street half in the oncoming lane: by Midtown station a car out of the bend nose
// to nose with a tanker coming up the other lane, neither with room to back off, the corner locked for minutes.
const LANE_BACK = [8, 96];
function lookAhead(v, pts, look, lw = null) {
  let px = v.x, py = v.y, left = look;
  if (lw && lw.of === pts && lw.n === pts.length && pts.length) {
    const q = pts[0], dx = q.x - lw.x, dy = q.y - lw.y, L2 = dx * dx + dy * dy;
    const t = L2 > 1 ? ((v.x - lw.x) * dx + (v.y - lw.y) * dy) / L2 : -1;
    if (t > 0 && t < 1) {
      const ox = lw.x + dx * t, oy = lw.y + dy * t, off = Math.hypot(v.x - ox, v.y - oy);
      if (off > LANE_BACK[0] && off < LANE_BACK[1]) { px = ox; py = oy; }
    }
  }
  for (let i = 0; i < Math.min(pts.length, 6); i++) {
    const q = pts[i];
    const d = Math.hypot(q.x - px, q.y - py);
    if (d >= left) return { x: px + (q.x - px) * left / d, y: py + (q.y - py) * left / d };
    left -= d; px = q.x; py = q.y;
    if (q.stop || q.final) break;
  }
  return { x: px, y: py };
}

// A vehicle nobody's in, standing still wholly off the roadway (a bike at a rack, a car left up on the pavement): the
// look-ahead box is straight ahead of the car, so on a bend it sweeps over the kerb - a pickup turning the corner by
// Midtown station had a bike parked at the rack there in its box and stopped in the bend for good, the queues behind
// it both ways locking the corner for minutes. The lanes never leave the road: it's never in the way. (Remembered while
// it stands where it is.)
const ROADWAY = new Set([T.ROAD, T.BRIDGE, T.LOT]);
function parkedOff(m, e) {
  if (Math.abs(e.vx) + Math.abs(e.vy) > 4 || e.lz || e.seats.some((s) => s)) return false;
  const k = e._offAt;
  if (k && k[0] === e.x && k[1] === e.y && k[2] === e.a) return k[3];
  const c = Math.cos(e.a), s = Math.sin(e.a), hl = e.def.L / 2, hw = e.def.W / 2;
  let off = true;
  for (const [u, w] of [[0, 0], [hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]]) if (ROADWAY.has(m.tileAtPx(e.x + c * u - s * w, e.y + s * u + c * w))) { off = false; break; }
  e._offAt = [e.x, e.y, e.a, off];
  return off;
}

// How much room a driver leaves to the car in front when stopped (px, 0.6-2.4 m): some creep right up, others hang
// back - fixed per vehicle, so a queue at the lights looks like people driving, not a train of bumpers.
const standoff = (v) => v.standoff ?? (v.standoff = 14 + (Math.imul(v.id | 0, 2654435761) >>> 0) % 44);
function obstacleSpeed(world, v, fwd, ignore = null) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  const look = v.def.L / 2 + 50 + standoff(v) + Math.max(0, fwd) * 0.7;
  let limit = Infinity, blk = 0, bl = Infinity, pblk = 0, pbl = Infinity;
  for (const e of world.query(v.x + c * look / 2, v.y + s * look / 2, look / 2 + 40)) {
    if (e === v || (ignore && ignore.has(e.id))) continue;
    if (e.kind === K.PED) { if (e.vehId || e.dead) continue; }
    else if (e.kind !== K.VEH) continue;
    else if ((e.alt || 0) > FLY.HIGH) continue;   // (an aircraft overhead: drive on under it)
    else if (parkedOff(world.map, e)) continue;   // (a bike at a rack on the pavement: not on the road, never in the way)
    if (!sameLevel(e.lz, v.lz)) continue; // traffic up on the deck doesn't brake for the street below
    const dx = e.x - v.x, dy = e.y - v.y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const halfOther = e.kind === K.VEH ? e.def.W / 2 : 10;
    if (lx < 0 || lx > look + 40 || Math.abs(ly) > v.def.W / 2 + halfOther - 4) continue;
    // a car coming the other way in the other lane (a narrow road: their sides all but touch) squeezes past
    if (e.kind === K.VEH && ly < -(v.def.W / 2 + halfOther) * 0.45 && Math.abs(angleDiff(e.a, v.a)) > 2.6) continue;
    const gap = lx - v.def.L / 2 - (e.kind === K.VEH ? e.def.L / 2 : 10) - 10 - (e.kind === K.VEH ? standoff(v) : 0);
    limit = Math.min(limit, Math.max(0, gap * 1.8));
    if (e.kind === K.VEH && gap < bl) { bl = gap; blk = e.id; }
    if (e.kind === K.PED && gap < pbl) { pbl = gap; pblk = e.id; }
  }
  v._blk = blk;   // (the vehicle in the way, if any: reroute.js)
  v._pblk = pblk; // (someone on foot in the way, if any: steerTraffic's honk and creep)
  return limit;
}

// Route over the road network (BFS on junctions, any level - police and ambulances take the
// highway too): world waypoints along the lanes, ending at the target.
export function planRoute(world, fromX, fromY, toX, toY) {
  const m = world.map, net = m.net;
  const start = clearNode(m, fromX, fromY), goal = clearNode(m, toX, toY);
  if (!start || !goal || !net) return [{ x: toX, y: toY, final: true }];
  let prev;
  for (const avoid of world.blockedEdges && world.blockedEdges.size ? [true, false] : [false]) {   // (roads remembered as blocked: reroute.js)
    prev = new Map([[start.id, null]]);
    const q = [start.id];
    for (let qi = 0; qi < q.length; qi++) {
      const id = q[qi];
      if (id === goal.id) break;
      for (const [eid, nid] of Object.entries(net.nodes[id].links)) if (!prev.has(nid) && !(avoid && isBlocked(world, +eid))) { prev.set(nid, { id, e: +eid }); q.push(nid); }
    }
    if (prev.has(goal.id)) break;
  }
  const chain = [];
  let cur = goal.id;
  while (cur !== undefined && cur !== start.id) { const p = prev.get(cur); if (!p) break; chain.unshift({ from: p.id, e: p.e }); cur = p.id; }
  const pts = [];
  let last = null;
  for (const step of chain) {
    const e = net.edges[step.e];
    const lp = lanePath(net, e, step.from, 0);
    if (last) for (const p of turnPath(last.p, last.d, lp[0], startDir(lp), 4)) pts.push({ x: p.x, y: p.y });
    for (const p of stride(lp, 0, 96)) pts.push(p);
    last = { p: lp[lp.length - 1], d: endDir(lp) };
  }
  pts.push({ x: toX, y: toY, final: true });
  return pts;
}

// The ground junction nearest (x, y) that it can be driven to in a straight line - the first leg of a route, and its last
// - with no building or wall in between (the nearest as the crow flies was often the one on the next street, behind the
// block: an ambulance leaving a scene steered straight for it, up the pavement and into the building); the nearest if
// none is.
function clearNode(m, x, y) {
  const n0 = m.nearestNode(x, y);
  if (!n0 || !lineBlocked(m, x, y, n0.x, n0.y, 4000)) return n0;
  const d0 = Math.hypot(n0.x - x, n0.y - y);
  const near = pointGrid(m.nodes).within(x, y, 0, d0 * 2 + 400).filter((n) => n.lvl === 0 && n !== n0);
  near.sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y));
  for (const n of near.slice(0, 8)) if (!lineBlocked(m, x, y, n.x, n.y, 4000)) return n;
  return n0;
}

// ---- traffic update ----------------------------------------------------------
const DRIVEWAY_CARS = ['sedan', 'compact', 'pickup', 'sports', 'sedan', 'compact'];
// Out in the open country the roads are quiet, and what's on them belongs there: farmers' pickups and
// flatbeds, campers' vans, off-roaders on motorbikes, the odd tanker for the oil field or a dump truck
// for the quarry - no taxis, buses or bin lorries.
const COUNTRY_MIX = [['pickup', 40], ['van', 12], ['sedan', 12], ['compact', 8], ['bike', 10], ['flatbed', 8], ['tanker', 2], ['dumptruck', 2], ['boxtruck', 2], ['roadbike', 3], ['mtb', 3],
  ['jeep', 14], ['muscle', 1.5], ['movingvan', 1.5]];   // (batch 4: the open-top 4x4s at home out here)
// The batch-4 fleet in town, by the district's style, on top of the mix (TRAFFIC_MIX, PARKED_MIX): convertibles, 4x4s and
// the ice-cream vans by the beach; lowriders and muscle cars on the south side and the strips; hot hatches and moving
// vans among the homes and the flats (not in the busy centre: a long van in its kerb bays and junctions jams it); convertibles
// in the smart districts and the old town; the ice-cream van by the park
export const DISTRICT_MIX = {
  beach: [['convertible', 8], ['icecream', 4], ['jeep', 5], ['hothatch', 3]],
  luxury: [['convertible', 9], ['muscle', 3], ['jeep', 2]],
  southside: [['lowrider', 14], ['muscle', 6], ['hothatch', 2], ['icecream', 1.5]],
  houses: [['hothatch', 6], ['movingvan', 4], ['icecream', 2.5], ['jeep', 2], ['lowrider', 1.5], ['convertible', 1]],
  apartments: [['hothatch', 7], ['movingvan', 4], ['lowrider', 3], ['icecream', 1.5]],
  oldtown: [['convertible', 5], ['hothatch', 4], ['icecream', 1]],
  nightlife: [['muscle', 6], ['lowrider', 4], ['convertible', 3]],
  redlight: [['muscle', 4], ['lowrider', 5]],
  commercial: [['hothatch', 4], ['muscle', 1], ['convertible', 1]],
  towers: [['hothatch', 3], ['convertible', 2]],
  civic: [['hothatch', 3]],
  park: [['icecream', 6], ['convertible', 2]],
  industrial: [['movingvan', 5]], factory: [['movingvan', 4]], harbor: [['movingvan', 3], ['jeep', 2]],
};
export const trafficMix = (style, country) => (country ? COUNTRY_MIX : TRAFFIC_MIX.concat(DISTRICT_MIX[style] || []));
export const parkedMix = (style) => PARKED_MIX.concat(DISTRICT_MIX[style] || []);
// The marinas' berths: now and then one of the batch-4 boats in a speedboat's or a dinghy's place, on big water only
// (boats.js waterSize) and only where the bigger hull clears the pier (every point of it on open water); the trawlers
// at the harbours. Its answer kept per berth.
const MARINA_NEW = [['cabincruiser', 3], ['sailboat', 3], ['pontoon', 2], ['rib', 2]];
export function marinaModel(world, sp, i) {
  const m = world.map, memo = m._marinaNew || Object.defineProperty(m, '_marinaNew', { value: new Map(), enumerable: false })._marinaNew;
  if (memo.has(i)) return memo.get(i);
  let model = sp.kind || (i % 3 === 0 ? 'speedboat' : i % 3 === 1 ? 'jetski' : 'dinghy');
  if ((model === 'speedboat' || model === 'dinghy') && !sp.charter && !sp.gang && hash2(i, 41, m.seed) < 0.4) {
    const harbor = m.districtAt(sp.x, sp.y).style === 'harbor', h = hash2(i, 43, m.seed);
    const want = harbor && h < 0.3 ? 'trawler' : (() => { let t = 0; for (const [, w] of MARINA_NEW) t += w; let r = h * t; for (const [id, w] of MARINA_NEW) { r -= w; if (r <= 0) return id; } return 'rib'; })();
    const d = VEHICLES[want], c = Math.cos(sp.a), sn = Math.sin(sp.a);
    let ok = boatsWaterSize(m, sp.x, sp.y, 2500) >= 2500;
    for (let f = -d.L / 2 - 6; ok && f <= d.L / 2 + 6; f += 12) for (const r of [-d.W / 2 - 4, 0, d.W / 2 + 4]) { const t = m.tileAtPx(sp.x + c * f - sn * r, sp.y + sn * f + c * r); if (!WATER_T[t] || BOAT_BLOCK[t]) { ok = false; break; } }
    if (ok) model = want;
  }
  memo.set(i, model);
  return model;
}
const COUNTRY_TARGET_DAY = 2, COUNTRY_TARGET_NIGHT = 1;
const countryDriver = (model, style) => (model === 'van' ? (rng() < 0.6 ? 'camper' : 'casual') : model === 'pickup' || model === 'flatbed' ? (style === 'rural' || rng() < 0.4 ? 'farmer' : style === 'desert' ? 'nomad' : 'camper') : model === 'bike' || model === 'mtb' ? (rng() < 0.5 ? 'hiker' : 'casual') : model === 'roadbike' ? 'athlete' : 'casual');
// who rides what in town: a road bike's rider is out training, the rest are anyone
const townDriver = (model) => (model === 'roadbike' ? 'athlete' : VEHICLES[model].pedal ? (rng() < 0.2 ? 'athlete' : 'casual') : rng() < 0.15 ? 'executive' : 'casual');

export function update(world, dt) {
  if (world.tick % 15 === 3) manage(world);
  const loopT = world.loopTime;
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH || !v.ai || v.ai.kind !== 'traffic') continue;
    const driver = v.seats[0] ? world.get(v.seats[0]) : null;
    if (!driver || driver.dead || !driver.npc) { v.ai = null; v.despawnable = true; continue; }
    if (v.wreckAt) continue;
    steerTraffic(world, v, loopT);
  }
  void dt;
}

function steerTraffic(world, v, t) {
  const ai = v.ai;
  const now = world.time;
  const net = world.map.net;
  const panic = ai.panicUntil && now < ai.panicUntil;
  if (ai.parkIt) { v.input = { throttle: 0, steer: 0, hb: true }; ai.ctl = null; return; }   // (given up: parkIt)
  if (ai.turn && stepTurn(world, v)) return;   // turning round (roadends.js)
  if (!ai.pts || !ai.pts.length) { crossJunction(world, v); if (!v.ai) return; if (ai.turn) { stepTurn(world, v); return; } }
  let wp = ai.pts[0];
  const d = Math.hypot(wp.x - v.x, wp.y - v.y);
  // orbit guard: a waypoint inside the turning circle makes a car loop around it forever.
  if (ai.lastA === undefined) ai.lastA = v.a;
  let da = v.a - ai.lastA;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  ai.lastA = v.a;
  // (only while it drives: a car shoved about in a jam, or rocking to get free, isn't going round a waypoint - counted, it
  // used to skip a street's corner and steer straight at the far end of the street, through the block: Copper Gulch)
  if (Math.abs(vehForwardSpeed(v)) > 30) ai.turned = (ai.turned || 0) + Math.abs(da);
  const beside = d < 50 && Math.abs(angleDiff(v.a, Math.atan2(wp.y - v.y, wp.x - v.x))) > 1.25;
  if (ai.turned > Math.PI * 3.6) { replanFromHere(world, v); ai.turned = 0; return; }
  if (d < 30 || passed(v, wp) || beside || ai.turned > Math.PI * 1.9) {
    ai.turned = 0;
    ai.pts.shift();
    ai.lastWp = { x: wp.x, y: wp.y, of: ai.pts, n: ai.pts.length };   // (the line back to its lane: lookAhead)
    if (wp.halt !== undefined) haltAt(world, v, wp.halt);   // (a bus at its stop, a taxi where it's picking up or dropping off)
    if (wp.stop) { crossJunction(world, v); if (!v.ai) return; ai.replans = 0; }
    if (!ai.pts.length && !ai.turn) { crossJunction(world, v); if (!v.ai) return; }
    if (ai.turn) { stepTurn(world, v); return; }   // (at a road's end: turning round)
    wp = ai.pts[0];
  }
  // knocked off its lane (bumped up onto the pavement, shoved about in a jam) with a building or a wall between it and
  // its next waypoint: back onto its lane where it is, on along the road - not straight at the waypoint through the
  // corner of a block (the owner, 2026-10-15, Copper Gulch: "they are all trying to drive through the corner of this
  // building instead of on the street")
  if ((world.tick + v.id) % 10 === 0 && !panic && blockedTo(world.map, v, wp)) {
    rejoinLane(world, v);
    if (!v.ai || !ai.pts || !ai.pts.length) return;
    wp = ai.pts[0];
  }
  // (reckless: a street racer, a getaway driver - flat out, through the lights, never pulling over: streetlife.js)
  const reckless = ai.reckless && !panic ? ai.reckless : 0;
  let desired = panic ? 520 : reckless ? Math.min(v.def.max * 0.92, reckless) : Math.min(ai.kindSpeed || 250, v.model === 'bus' ? 220 : 999);
  if (v.bus || v.taxi) desired = Math.min(desired, haltCap(world, v));   // (pulling up at a stop, or waiting there - shaken or not)
  if (v.def.pedal) desired = Math.min(desired, v.def.max * (panic ? 0.95 : 0.78));   // a cyclist pedals along at their own pace
  // slow for bends: how sharply the path ahead turns
  const ahead = ai.pts[Math.min(ai.pts.length - 1, 2)];
  if (ahead) {
    const bend = Math.abs(angleDiff(v.a, Math.atan2(ahead.y - v.y, ahead.x - v.x)));
    if (bend > 0.35) desired = Math.min(desired, reckless ? Math.max(170, 560 - bend * 280) : Math.max(120, 420 - bend * 300));
  }
  const stopIdx = ai.pts.findIndex((p) => p.stop);
  const stop = stopIdx >= 0 ? ai.pts[stopIdx] : null;
  let holding = false;
  if (stop && !panic && !reckless) {
    const n = net.nodes[stop.node];
    const ds = Math.hypot(stop.x - v.x, stop.y - v.y);
    // where it stops, nose first: behind the painted stop line at a signal (it's STOP_LINE px back from where the
    // lane meets the junction: client/art2/game/groundbake.js stopLines), just short of the junction anywhere else
    const gap = ds - v.def.L / 2 - (n.light ? (n.lvl === 0 ? STOP_LINE : 14) : 10);
    const st = signalFor(n, stop.edge, t), fwd = Math.max(0, vehForwardSpeed(v));
    // red: stop at the line (a car already well over it clears the junction); yellow: stop if it comfortably can,
    // otherwise go on through; green or no lights: on into the junction only when it can get across (junctionClear)
    let hold = st === 'R' ? gap > -30 : st === 'Y' ? gap > (fwd * fwd) / (2 * BRAKE_EASY) - 6 : false;
    if (!hold && gap < 140) hold = !junctionClear(world, v, n, stop);
    else if (gap >= 140) ai.waitNode = -1;
    if (hold) desired = Math.min(desired, Math.max(0, gap * 1.6));
    else if (ai.turning && ds < 260) desired = Math.min(desired, 150 + ds * 0.4);
    holding = hold && gap < 220;
    if (ai.next && ai.next.edge === ai.edge) {
      // the road's end: up to it slowly, to turn round there - one car at a time (the next waits short of the turning
      // circle: roadends.js)
      desired = Math.min(desired, 45 + ds * 0.45);
      const room = holdShort(world, v, stop.node, ds);
      if (room < Infinity) { desired = Math.min(desired, Math.max(0, room * 1.5)); holding ||= room < 80; }
      // (the road gives out short of the end of its lane - a turning circle cut off by the water: it turns round there)
      else if (ds < v.def.L / 2 + 50 && roadGivesOut(world, v)) { ai.pts.splice(0, stopIdx + 1); crossJunction(world, v); if (ai.turn) stepTurn(world, v); return; }
    }
  }
  if (!panic && !reckless) { const bh = bendHold(world, v); if (bh < desired) { desired = bh; holding ||= bh < 20; } }
  if (!panic && !reckless && (world.tick + v.id) % 4 === 0) ai.yieldUntil = sirenBehind(world, v) ? now + 1.5 : ai.yieldUntil;
  if (!panic && ai.yieldUntil && now < ai.yieldUntil) {
    // an emergency vehicle with its siren on is coming: ease over toward the curb and slow
    // right down. Only ever onto empty road - a wheel's width up the kerb at most, never onto the pavement or into
    // people. Over from its lane's line, along the lane: it used to aim a little to the side of where its own nose
    // pointed, every tick - so the longer it gave way the further round it turned, up the pavement and into the shop
    // fronts (the owner, 2026-10-17: "Vehicles are still turning and getting stuck on buildings").
    const up = (v.lz || 0) > 0.3;
    const e = net.edges[ai.edge], lp = e ? lanePath(net, e, ai.from, Math.min(ai.lane || 0, e.nl - 1)) : null, pr = lp ? project(lp, v) : null;
    if (!pr || pr.d > 60) { driveToward(world, v, wp.x, wp.y, Math.min(desired, 40), {}); return; }   // (off its lane - turning through a junction: just slow)
    const q0 = pointAt(lp, pr.s), c = q0.tx, sn = q0.ty, ox0 = q0.x, oy0 = q0.y;
    const rx = -sn, ry = c;
    const solidNear = (x, y) => {
      if (up) return false;
      const k0x = Math.floor(x / 32), k0y = Math.floor(y / 32);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const arr = world.map.solidProps.get(world.map.idx(k0x + dx, k0y + dy));
        if (arr) for (const sp of arr) if (!sp.off && Math.hypot(sp.x - x, sp.y - y) < sp.r + 10) return true;
      }
      return false;
    };
    const roadAt = (x, y) => { const tt = world.map.tileAtPx(x, y); return tt === T.ROAD || tt === T.BRIDGE || tt === T.LOT; };
    const kerbAt = (x, y) => { const tt = world.map.tileAtPx(x, y); return tt === T.ROAD || tt === T.BRIDGE || tt === T.LOT || tt === T.SIDEWALK; };
    let shift = 0;
    const strip = (k) => { // the car's outer edge (k px over from the lane's line) from its tail to 70 px past its nose
      for (let along = -v.def.L / 2; along <= v.def.L / 2 + 70; along += 14) {
        const bx = ox0 + c * along, by = oy0 + sn * along, ox = bx + rx * (k + v.def.W / 2), oy = by + ry * (k + v.def.W / 2);
        if (up) continue;
        if (!kerbAt(ox, oy) || !roadAt(ox - rx * 10, oy - ry * 10) || solidNear(ox, oy)) return false;
      }
      return true;
    };
    for (let k = 4; k <= (up ? 14 : 26); k += 2) { if (!strip(k)) break; shift = k; }
    const room = shift >= 6;
    const tx = ox0 + c * 50 + rx * shift, ty = oy0 + sn * 50 + ry * shift;
    const busy = room && world.query(ox0 + c * 40 + rx * (shift + v.def.W / 2), oy0 + sn * 40 + ry * (shift + v.def.W / 2), 70, K.PED).some((e) => !e.dead && !e.vehId && sameLevel(e.lz, v.lz));
    driveToward(world, v, room && !busy ? tx : wp.x, room && !busy ? ty : wp.y, Math.min(desired, 40), {});
    return;
  }
  // on the way up a road's end, stopped there a while - held short of the turning circle, or in the queue behind: it
  // gives the end up, turns round where it is and drives back out (roadends.js giveUpEnd)
  if (!panic && !reckless && giveUpEnd(world, v, holding)) { stepTurn(world, v); return; }
  // a ring of cars each stopped for the next: one of them backs up to make room (breakRing)
  if (!panic && (world.tick + v.id) % 10 === 0) breakRing(world, v);
  // stopped behind a backup: another lane, or another way (reroute.js)
  if (!panic && unjam(world, v, holding)) { if (!v.ai || !ai.pts || !ai.pts.length) return; }
  if (ai.sideUntil > now && !panic) {   // (edging back over into its lane past a car nose to nose with it: sidestep)
    const e = net.edges[ai.edge], lp = e ? lanePath(net, e, ai.from, Math.min(ai.lane || 0, e.nl - 1)) : null, pr = lp ? project(lp, v) : null;
    if (pr && pr.d > 6) { const q = pointAt(lp, pr.s + v.def.L / 2 + 40); driveToward(world, v, q.x, q.y, SIDE_PX, { ignore: new Set([ai.sideBlk]) }); return; }
    ai.sideUntil = 0;
  }
  const la = lookAhead(v, ai.pts, clamp(46 + Math.max(0, vehForwardSpeed(v)) * 0.3, 50, 190), ai.lastWp);
  let ignore = ai.passUntil > now && ai.passBlk ? new Set([ai.passBlk]) : null;
  // held up by someone on foot in the road (nothing else in its way, not at a light or a junction): after PED_HONK_S a
  // honk, and someone at a loose end steps out of the road (npc.js shoo); after PED_CREEP_S it edges on at a crawl,
  // nudging past them - a crawl only shoves, never hurts (vehicles.js). The owner's notes, 10-22: "a lot of cars start
  // getting jammed in a spot" - a passer-by pinned against a lorry in the road, the cars behind waiting for ever.
  if (ai.creepUntil > now) {
    (ignore ||= new Set()).add(ai.creepPast); desired = Math.min(desired, PED_CREEP_PX);
    // (nudged aside: off the car's line, a step at a time, onto open ground only)
    const q = world.get(ai.creepPast), c = Math.cos(v.a), sn = Math.sin(v.a);
    if (q && !q.dead && !q.vehId && !q.player) {
      const lx = (q.x - v.x) * c + (q.y - v.y) * sn, ly = -(q.x - v.x) * sn + (q.y - v.y) * c;
      if (lx > 0 && lx < v.def.L / 2 + 40 && Math.abs(ly) < v.def.W / 2 + 12) {
        const sd = ly >= 0 ? 1 : -1, nx = q.x - sn * sd * 2.5, ny = q.y + c * sd * 2.5;
        if (!PED_BLOCK[world.map.tileAtPx(nx, ny)]) { q.x = nx; q.y = ny; }
      }
    }
  }
  else {
    const pb = !panic && !holding && !v._blk && v._pblk ? world.get(v._pblk) : null;
    if (pb && !pb.dead && Math.abs(vehForwardSpeed(v)) < 15) {
      ai.pedWaitAt ??= now;
      const waited = now - ai.pedWaitAt;
      if (waited > PED_HONK_S && !ai.honked) { ai.honked = true; v.hornUntil = now + 0.6; shoo(world, pb, v); }
      if (waited > PED_CREEP_S) { ai.creepPast = pb.id; ai.creepUntil = now + PED_CREEP_FOR_S; ai.pedWaitAt = undefined; ai.honked = false; (ignore ||= new Set()).add(pb.id); desired = Math.min(desired, PED_CREEP_PX); }
    } else { ai.pedWaitAt = undefined; ai.honked = false; }
  }
  driveToward(world, v, la.x, la.y, desired, { ignoreObstacles: panic, ignore, round: !!v.bus && ai.roundUntil > now });
}
const PED_HONK_S = 2.5, PED_CREEP_S = 6, PED_CREEP_PX = 28, PED_CREEP_FOR_S = 3;

// A ring of cars each stopped for the next - two nose to nose in a junction, three or four boxed in round one - waits for
// ever: nobody in it is held up by a breakdown, so nobody looks for another way (reroute.js). The owner (2026-10-09):
// "get some vehicles to back up and make room for other vehicles to get through". After RING_S, the car in the ring
// with the most room behind it (an NPC's: a player's car or one at work waits) backs off, a car's length or so, and the
// others get by.
const RING_S = 5;
function breakRing(world, v) {
  const ai = v.ai, now = world.time;
  if (Math.abs(vehForwardSpeed(v)) > 10 || !v._blk || ai.turn) { ai.ringAt = undefined; return; }
  const ring = [v];
  let b = world.get(v._blk);
  for (let k = 0; k < 8 && b && b !== v; k++) {
    if (b.kind !== K.VEH || Math.hypot(b.vx, b.vy) > 10) { ai.ringAt = undefined; return; }
    ring.push(b);
    b = b._blk ? world.get(b._blk) : null;
  }
  if (b !== v) { ai.ringAt = undefined; return; }
  ai.ringAt ??= now;
  if (now - ai.ringAt < RING_S) return;
  if (ring.length === 2 && sidestep(world, v, ring)) return;
  let best = null, room = 30;
  for (const q of ring) {
    if (!q.ai || q.ai.kind !== 'traffic' || q.ai.turn || q.ai.reverseUntil > now) continue;
    const r = roomBehind(world, q, 96);
    if (r > room || (r === room && best && q.id < best.id)) { room = r; best = q; }
  }
  if (!best) makeRoom(world, v, ring);
  if (best !== v) return;
  for (const q of ring) if (q.ai) q.ai.ringBackAt = now;   // (backed off once: if they meet again, sidestep)
  ai.ringAt = undefined; ai.stuck = 0;
  ai.reverseUntil = now + Math.min(1.8, 0.5 + room / 70);
  world.ringsBroken = (world.ringsBroken || 0) + 1;
}
// Two cars nose to nose, one of them out of its lane and the other in its own (swung wide out of a bend, come round in a turn, shoved in a jam -
// in the other's lane, where backing off and coming on again only meets it again: a car and a taxi by Midtown station
// did that for minutes): the one further off its own lane's line edges back over into it at a crawl, past the other
// (sideways and on: it doesn't brake for that one for SIDE_S). Decided by both alike; the one that goes starts it.
const SIDE_OFF = 20, SIDE_S = 4, SIDE_PX = 40;
function laneOff(world, q) {
  const ai = q.ai, net = world.map.net, e = ai && net.edges[ai.edge];
  if (!e || ai.kind !== 'traffic') return -1;
  const pr = project(lanePath(net, e, ai.from, Math.min(ai.lane || 0, e.nl - 1)), q);
  return pr ? pr.d : -1;
}
function sidestep(world, v, ring) {
  const [p, q] = ring, now = world.time;
  if (Math.abs(angleDiff(p.a, q.a)) < 2.2) return false;
  const op = laneOff(world, p), oq = laneOff(world, q);
  const out = op > oq || (op === oq && p.id < q.id) ? p : q, other = out === p ? q : p;
  // (one clearly out of its lane, the other in it: at once; two as far off as each other: backing off first, as before -
  // and if they meet again after that, the one further off edges over)
  const again = ring.some((r) => r.ai && now - (r.ai.ringBackAt ?? -1e9) < 30);
  if (Math.max(op, oq) < SIDE_OFF || (Math.abs(op - oq) < SIDE_OFF && !again) || out.ai.turn) return false;
  if (now - (out.ai.sideAt || -1e9) > 60) out.ai.sideN = 0;
  if ((out.ai.sideN || 0) >= 2) return false;   // (tried twice and still there: backing off, making room - as before)
  if (out !== v) return true;   // (the other one goes: it starts it on its turn)
  v.ai.sideN = (v.ai.sideN || 0) + 1; v.ai.sideAt = now;
  v.ai.ringAt = undefined; v.ai.stuck = 0;
  v.ai.sideUntil = now + SIDE_S; v.ai.sideBlk = other.id;
  world.sidesteps = (world.sidesteps || 0) + 1;
  return true;
}

// Nobody in the ring has the room to back off - each has the queue behind it right up to its bumper (by Midtown station:
// a car out of the bend nose to nose with a tanker coming up the other lane, a car close behind each - the corner locked
// for minutes). Then the car queued behind one of them with the most room behind it (an NPC's) backs off first, and the
// one in the ring in front of it can the next time round. The ring's first car (by id) decides, once every RING_S.
function makeRoom(world, v, ring) {
  const now = world.time;
  if (ring.some((q) => q.ai && q.ai.reverseUntil > now) || v.id !== Math.min(...ring.map((q) => q.id))) return;
  v.ai.ringAt = now;
  let fb = null, room = 30;
  for (const q of ring) for (const f of world.query(q.x, q.y, q.def.L + 120, K.VEH)) {
    if (f._blk !== q.id || ring.includes(f) || !f.ai || f.ai.kind !== 'traffic' || f.ai.turn || f.ai.reverseUntil > now || Math.hypot(f.vx, f.vy) > 10 || !sameLevel(f.lz, q.lz)) continue;
    const r = roomBehind(world, f, 96);
    if (r > room || (r === room && fb && f.id < fb.id)) { room = r; fb = f; }
  }
  if (!fb) return;
  for (const q of ring) if (q.ai) q.ai.ringBackAt = now;
  fb.ai.ringAt = undefined; fb.ai.stuck = 0;
  fb.ai.reverseUntil = now + Math.min(1.8, 0.5 + room / 70);
  world.ringsBroken = (world.ringsBroken || 0) + 1;
  world.ringRoomMade = (world.ringRoomMade || 0) + 1;
}

// A tight bend on a street with a lane each way (a street that turns its corner in one point: World v3's grid streets
// - the one past Midtown station turns south in a road's width): a long vehicle turning it sweeps the other lane, and
// two coming round it at once the two ways lock it (a mixer, a garbage truck and a sedan round that corner; a tanker
// and a taxi nose to nose there). So a long vehicle (L >= BEND_BIG) coming up to one claims it: the other way waits
// short of it till it's round, and it waits short while someone the other way is in it. The first to claim has it; a
// claim lapses when its vehicle is round, gone, or held up BEND_STALL_S without anyone in the way in the bend (stuck
// in its own queue: the other way isn't kept waiting for that), and it doesn't claim that bend again for a while.
const BEND_BIG = 100, BEND_TURN = 0.9, BEND_LOOK = 320, BEND_STALL_S = 8, BEND_MAX_S = 25;
function bendsOf(e) {
  if (e._bends) return e._bends;
  const out = [], P = e.pts;
  if (!e.oneway && (e.nl || 1) <= 1 && e.lvl === 0) for (let i = 1; i + 1 < P.length; i++) {
    const a1 = Math.atan2(P[i].y - P[i - 1].y, P[i].x - P[i - 1].x), a2 = Math.atan2(P[i + 1].y - P[i].y, P[i + 1].x - P[i].x);
    if (Math.abs(angleDiff(a1, a2)) > BEND_TURN) out.push({ x: P[i].x, y: P[i].y, k: i, r: (e.hw || 64) + 16 });
  }
  return (e._bends = out);
}
const bendAhead = (v, c) => v.ai.pts && v.ai.pts.slice(0, 4).some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 90);
const inBend = (q, c) => Math.hypot(q.x - c.x, q.y - c.y) < c.r + q.def.L / 2;
function bendHold(world, v) {
  const ai = v.ai, e = world.map.net.edges[ai.edge];
  if (!e || (v.lz || 0) > 0.3) return Infinity;
  const B = bendsOf(e);
  if (!B.length) return Infinity;
  const now = world.time, claims = (world.bends ??= new Map());
  let lim = Infinity;
  for (const c of B) {
    const d = Math.hypot(c.x - v.x, c.y - v.y);
    if (d > BEND_LOOK) continue;
    const inside = inBend(v, c), key = e.id * 4096 + c.k;
    if (!inside && !bendAhead(v, c)) continue;
    let cl = claims.get(key);
    if (cl) {   // (still good?)
      const o = world.get(cl.id);
      const live = o && o.ai && o.ai.edge === e.id && o.ai.from === cl.from && (inBend(o, c) || bendAhead(o, c)) && now - cl.at < BEND_MAX_S;
      if (live && Math.hypot(o.vx, o.vy) < 5) { cl.still ??= now; } else if (live) cl.still = undefined;
      if (!live || (cl.still !== undefined && now - cl.still > BEND_STALL_S && !cl.waiting)) { if (o && o.ai) o.ai.bendNot = now + 20; claims.delete(key); cl = null; }
    }
    if (!cl && v.def.L >= BEND_BIG && !(ai.bendNot > now)) { cl = { id: v.id, from: ai.from, at: now }; claims.set(key, cl); }
    const hold = Math.max(0, (d - v.def.L / 2 - c.r - 12) * 1.6);
    if (inside) continue;
    if (cl && cl.id !== v.id && cl.from !== ai.from) { lim = Math.min(lim, hold); continue; }
    if (cl && cl.id === v.id) {
      cl.waiting = false;
      for (const o of world.query(c.x, c.y, c.r + 100, K.VEH)) {
        if (o === v || !o.ai || o.ai.edge !== e.id || o.ai.from === ai.from || !inBend(o, c)) continue;
        cl.waiting = true; lim = Math.min(lim, hold); break;
      }
    }
  }
  return lim;
}

// The painted stop line is this far back from where a lane meets a signalled junction (px)
const STOP_LINE = 52;
// how hard a driver brakes for a yellow without making a meal of it (px/s per s)
const BRAKE_EASY = 480;
// May a car waiting to go into junction n (on green, or where there are no lights) go now? Not while:
// - the road it's taking is backed up just past the junction (it would stop in the box and lock the cross traffic);
// - something is crossing the box on another heading (across its way: not the same way, nor straight the other way);
// - it's turning left and traffic is coming the other way.
// A car kept waiting goes anyway after a while (heavy traffic never shuts a turn out for good), and nothing keeps it
// out of a road that's backed up for ever: after 20 s it creeps in regardless.
function junctionClear(world, v, n, stop) {
  const ai = v.ai, now = world.time;
  if (n.lvl !== 0 || n.merge || n.edges.length < 3) return true;   // (the highway's own junctions, a bend, a dead end)
  if (ai.waitNode !== n.id) { ai.waitNode = n.id; ai.waitAt = now; }
  const waited = now - ai.waitAt, nx = ai.next;
  // 1. room on the way out, on its side of the road
  if (nx && waited < 20 && n.dirs[nx.edge] !== undefined) {
    const out = n.dirs[nx.edge], ox = Math.cos(out), oy = Math.sin(out), d0 = (n.trim[nx.edge] || 0) + v.def.L / 2 + 18;
    const px = n.x + ox * d0, py = n.y + oy * d0;
    for (const e of world.query(px, py, v.def.L / 2 + 34, K.VEH)) {
      if (e === v || !sameLevel(e.lz, v.lz) || Math.hypot(e.vx, e.vy) > 15 || (e.alt || 0) > FLY.HIGH) continue;   // (just pulling away is no queue; an aircraft overhead none either)
      if (Math.abs(angleDiff(e.a, out)) > 0.8) continue;   // (the other way on that road, or across it)
      if (-(e.x - n.x) * oy + (e.y - n.y) * ox < -10) continue;   // (on the far side of the road)
      return false;
    }
  }
  if (waited > 6) return true;
  // 2. something crossing the junction on another heading (not one ahead of it from the same road, turning)
  const R = (n.half || 40) + 24;
  for (const e of world.query(n.x, n.y, R, K.VEH)) {
    if (e === v || !sameLevel(e.lz, v.lz) || (e.alt || 0) > FLY.HIGH) continue;   // (an aircraft over the junction: not crossing it)
    if (e.ai && e.ai.from === n.id && e.ai.cameBy === stop.edge) continue;
    // (moving through it; standing still only right in the middle of it - one waiting at its own line on a narrower
    // road can be well inside the circle)
    if (Math.hypot(e.vx, e.vy) < 20 && Math.hypot(e.x - n.x, e.y - n.y) > R * 0.55) continue;
    const da = Math.abs(angleDiff(e.a, v.a));
    if (da < 0.6 || da > 2.55) continue;
    if (!e.ai && Math.hypot(e.vx, e.vy) < 5 && !e.seats.some((s) => s)) continue;   // (an empty car left there: drive round it)
    return false;
  }
  // 3. turning left across the other way: what's coming through goes first
  if (nx && nx.turn < -0.5) {
    for (const e of world.query(n.x, n.y, (n.half || 40) + 220, K.VEH)) {
      if (e === v || !sameLevel(e.lz, v.lz) || Math.abs(angleDiff(e.a, v.a)) < 2.5 || (e.alt || 0) > FLY.HIGH) continue;
      const sp = Math.hypot(e.vx, e.vy);
      if (sp < 40) continue;                                            // (waiting at its own line, or about to)
      if ((e.x - n.x) * e.vx + (e.y - n.y) * e.vy > 0 && Math.hypot(e.x - n.x, e.y - n.y) > (n.half || 40)) continue;   // (gone past)
      return false;
    }
  }
  return true;
}

// Is a vehicle running its siren coming up behind us (or straight at us down the same road)? Heard a long way off and
// given way to even when it's crawling up behind in a queue (the owner, 10-23: the ambulance should have a siren "that
// makes people get out of the way faster so it's easier to drive"): SIREN_YIELD.
export const SIREN_YIELD = { minSpeed: 20, ahead: 520, perSpeed: 0.6, side: 110 };
export function sirenBehind(world, v) {
  const Y = SIREN_YIELD;
  for (const e of world.query(v.x, v.y, Y.ahead + 200, K.VEH)) {
    if (e === v || !e.siren || !sameLevel(e.lz, v.lz)) continue;
    const sp = Math.hypot(e.vx, e.vy);
    if (sp < Y.minSpeed) continue;
    const ux = e.vx / sp, uy = e.vy / sp;
    const dx = v.x - e.x, dy = v.y - e.y;
    const ahead = dx * ux + dy * uy;
    const lateral = Math.abs(-dx * uy + dy * ux);
    if (ahead > 0 && ahead < Y.ahead + sp * Y.perSpeed && lateral < Y.side) return true;
  }
  return false;
}

// Is there a building or a wall on the straight line from v to waypoint wp (its first 640 px)?
function blockedTo(m, v, wp) {
  const dx = wp.x - v.x, dy = wp.y - v.y, L = Math.hypot(dx, dy);
  if (L < 40) return false;
  for (let s = 24; s < Math.min(L, 640); s += 16) if (CAR_BLOCK[m.tileAtPx(v.x + dx * s / L, v.y + dy * s / L)]) return true;
  return false;
}
// Back onto its lane of the road it's on, from the lane's point nearest it on (a bus or a taxi back onto its route)
function rejoinLane(world, v) {
  const ai = v.ai, net = world.map.net, e = net.edges[ai.edge];
  if (!e || (v.lz || 0) > 0.3) return;
  const lane = Math.min(ai.lane || 0, e.nl - 1), lp = lanePath(net, e, ai.from, lane), pr = project(lp, v);
  if (!pr) return;
  const nx = ai.next;
  if (ai.route) { if (rejoin(world, v, e, ai.from, pr.s + 40)) return; delete ai.route; }
  enterEdge(world, v, e.id, ai.from, lane, pr.s + 40);
  if (nx && !ai.route) { ai.next = nx; ai.turning = Math.abs(nx.turn) > 0.5; }   // (the way on it had chosen)
  ai.turned = 0;
  world.rejoins = (world.rejoins || 0) + 1;
}

// Rejoin the network on the nearest lane of our level, going the way the car faces (how a lost
// driver "gets themselves out" of a loop; one that gave up turning round in the street: roadends.js).
export { replanFromHere as onLaneFromHere };
function replanFromHere(world, v) {
  const ai = v.ai;
  const net = world.map.net;
  const up = (v.lz || 0) > 0.5;
  const ne = nearestEdge(net, v.x, v.y, (e) => (up ? e.lvl === 1 || e.lvl === 'ramp' : e.lvl === 0));
  if (!ne) return;
  const e = ne.e;
  const tang = pointAt(e.pts, ne.s);
  const fwdOk = Math.cos(v.a) * tang.tx + Math.sin(v.a) * tang.ty >= 0;
  let from = fwdOk ? e.a : e.b;
  if (e.oneway) from = e.a;
  const s = from === e.a ? ne.s : e.len - ne.s;
  // on a route: back onto it from here (a bus where its line runs this way down this street, a taxi on a new way to
  // where it's going); failing that it leaves the route
  if (ai.route) {
    if (rejoin(world, v, e, from, s + 40)) { ai.replans = (ai.replans || 0) + 1; if (ai.replans > 4) parkIt(v); return; }
    delete ai.route;
  }
  enterEdge(world, v, e.id, from, Math.min(ai.lane || 0, e.nl - 1), s + 40);
  ai.replans = (ai.replans || 0) + 1;
  if (ai.replans > 4) parkIt(v);
}
// Hopeless: it pulls up where it is (a breakdown, for the tow trucks) and the clean-up takes it once nobody can see it.
// (It used to drop out of traffic with the driver still at the wheel and the pedals as they were: driving round and
// round, never cleared while a player was near.)
function parkIt(v) { v.ai.parkIt = true; v.ai.hopeless = true; v.ai.ctl = null; v.input = { throttle: 0, steer: 0, hb: true }; }

// Put a vehicle (already driven by an NPC) into traffic on the nearest lane, going the way it
// faces.
export { chooseExit as _chooseExit, breakRing as _breakRing };   // (tests: test/roadends.test.js)

export function joinTraffic(world, v) {
  v.ai = { kind: 'traffic', lane: 0 };
  replanFromHere(world, v);
  if (v.ai) v.ai.replans = 0;
}

function passed(v, wp) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  return (wp.x - v.x) * c + (wp.y - v.y) * s < -10 && Math.hypot(wp.x - v.x, wp.y - v.y) < 90;
}

function manage(world) {
  let tc = 0;
  for (const v of world.entities.values()) if (v.kind === K.VEH && v.ai && v.ai.kind === 'traffic') tc++;
  world.trafficCount = tc;
  const anchors = [];
  for (const p of world.players.values()) if (p.ped && !p.ped.dead) anchors.push(p.ped);
  anchors.push(...cineEyes(world));   // (the cinematic mode following someone: round them too - view.js)
  const near = (x, y, r) => { for (const a of anchors) if ((a.x - x) ** 2 + (a.y - y) ** 2 < r * r) return true; return false; };
  // despawn
  const now = world.time, mine = new Set();
  for (const p of world.players.values()) if (p.lastVehicle) mine.add(p.lastVehicle);   // (a car a player left somewhere stays)
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH) continue;
    if (v.seats.some((s) => s && world.get(s)?.player)) continue;
    if (v.owner && !v.wreckAt) continue;
    if (v.onEvent && !v.wreckAt) continue;   // (a street racer, a getaway car, an armored truck: streetlife.js lets it go when it's done)
    if (v.towedBy) continue;   // (on a tow truck's hook: tow.js takes it away)
    const isTraffic = v.ai && v.ai.kind === 'traffic';
    const range = isTraffic ? 1800 : 1900;
    // a car that hasn't moved in a long while - in a jam that won't clear, or left in the road with nobody in it - is
    // cleared away once nobody's looking, near a player or not (the road crew; the jam behind it moves again)
    if (Math.hypot(v.vx, v.vy) < 8 && !v.parked && !mine.has(v.id) && (isTraffic || (!v.ai && v.despawnable && !v.seats.some((s) => s)))) v.stillSince ??= now;
    else v.stillSince = undefined;
    // (one that's given up - boxed in turning round, lost for good: roadends.js, parkIt - as soon as nobody's looking)
    if (v.stillSince !== undefined && now - v.stillSince > (isTraffic ? (v.ai.hopeless ? 4 : 50) : 90) && !inAnyView(world, v.x, v.y, 96) && !(v.ai && v.ai.route)) { removeVehicle(world, v); continue; }
    if (!v.despawnable || near(v.x, v.y, range) || inAnyView(world, v.x, v.y, 64)) continue;
    if (v.ai && v.ai.kind !== 'traffic') continue; // police/ems manage their own
    removeVehicle(world, v);
  }
  // parked cars + boats
  const spots = world.map.parking;
  world.parked ??= new Map();
  for (const [i, vid] of world.parked) { if (!world.get(vid)) world.parked.delete(i); }
  const spotGrid = pointGrid(spots);   // (the spots near each player through their spatial index, in the list's order: at World v3's frame the list is the world's)
  const homeLots = homeLotSpots(world.map);   // (none on a home's lot, driveway or garage: the owner's own cars only - homes.js)
  for (const a of anchors) {
    for (const i of spotGrid.near(a.x, a.y, 1150)) {
      const sp = spots[i];
      if (world.parked.has(i) || homeLots.has(i)) continue;
      if (hash2(i, 7, world.map.seed) > (sp.sparse ? 0.3 : sp.drive ? 0.5 : sp.kerb ? 0.6 : 0.7)) continue; // a home's driveway: often a car, often not (a kerb's bay: more often than not)
      const d2 = (sp.x - a.x) ** 2 + (sp.y - a.y) ** 2;
      if (d2 > 1150 * 1150) continue;
      const fresh = world.time - (a.player?.joinedAt ?? -99) < 2 || world.time < 3 || world.time - (a.player?.teleportAt ?? -99) < 2;
      if (!fresh && inAnyView(world, sp.x, sp.y, 80)) continue; // never pops in on someone's screen
      if (world.npcCount + world.trafficCount > world.npcBudget) break;
      if (sp.kerb && world.query(sp.x, sp.y, 70, K.VEH).length) continue;   // (a kerb's bay on a live street: not on a car going by)
      let pm = sp.model && VEHICLES[sp.model] ? sp.model : sp.drive ? DRIVEWAY_CARS[Math.floor(hash2(i, 5, 2) * DRIVEWAY_CARS.length)] : weighted(parkedMix(world.map.districtAt(sp.x, sp.y).style));   // (sp.model: a van in a shop's loading bay - World v3's Midtown)
      if (pm === 'bike') pm = weighted(motoMix('', world.map.districtAt(sp.x, sp.y).style));   // (which motorcycle: by district - task #366)
      const fit = bayRoom(world.map, sp, i);   // (a bay at the street's end: nothing so long it sticks out into the junction)
      if (VEHICLES[pm].L > fit) { pm = FITS.find((k) => VEHICLES[k].L <= fit); if (!pm) continue; }
      const v = world.spawnVehicle(pm, sp.x, sp.y, sp.a + (sp.a === -Math.PI / 2 && hash2(i, 3, 1) < 0.5 ? Math.PI : 0), { parked: true });
      world.parked.set(i, v.id);
    }
    world.marinaParked ??= new Map();
    world.map.marina.forEach((sp, i) => {
      if (world.marinaParked.has(i) && world.get(world.marinaParked.get(i))) return;
      if ((sp.x - a.x) ** 2 + (sp.y - a.y) ** 2 > 1100 * 1100) return;
      const fresh = world.time - (a.player?.joinedAt ?? -99) < 2 || world.time < 3 || world.time - (a.player?.teleportAt ?? -99) < 2;
      if (!fresh && inAnyView(world, sp.x, sp.y, 80)) return;
      const v = world.spawnVehicle(marinaModel(world, sp, i), sp.x, sp.y, sp.a, { parked: true });
      world.marinaParked.set(i, v.id);
    });
    // bikes locked up at the street bike racks: one or two at most of them (anyone's to take - it's theft)
    world.rackParked ??= new Map();
    const racks = rackSpots(world.map);
    for (const i of pointGrid(racks).near(a.x, a.y, 1100)) {
      const sp = racks[i];
      if (world.rackParked.has(i) && world.get(world.rackParked.get(i))) continue;
      if (hash2(i, 11, world.map.seed) > 0.55 || (sp.x - a.x) ** 2 + (sp.y - a.y) ** 2 > 1100 * 1100) continue;
      const rk = world.map.propSolid && world.map.propSolid.get(sp.pi);
      if (rk && rk.off) continue;   // (the rack was knocked over)
      const fresh = world.time - (a.player?.joinedAt ?? -99) < 2 || world.time < 3 || world.time - (a.player?.teleportAt ?? -99) < 2;
      if (!fresh && inAnyView(world, sp.x, sp.y, 80)) continue;
      if (world.npcCount + world.trafficCount > world.npcBudget) break;
      if (world.query(sp.x, sp.y, 16, K.VEH).length) continue;
      const v = world.spawnVehicle(weighted(RACK_MIX), sp.x, sp.y, sp.a, { parked: true });
      world.rackParked.set(i, v.id);
    }
    // shopping carts outside the groceries and the markets (cartSpots): free to take - kick off, ride the back rail
    world.cartParked ??= new Map();
    const corral = cartSpots(world.map);
    for (const i of pointGrid(corral).near(a.x, a.y, 1100)) {
      const sp = corral[i];
      if (world.cartParked.has(i) && world.get(world.cartParked.get(i))) continue;
      if (hash2(i, 13, world.map.seed) > 0.8 || (sp.x - a.x) ** 2 + (sp.y - a.y) ** 2 > 1100 * 1100) continue;
      const fresh = world.time - (a.player?.joinedAt ?? -99) < 2 || world.time < 3 || world.time - (a.player?.teleportAt ?? -99) < 2;
      if (!fresh && inAnyView(world, sp.x, sp.y, 80)) continue;
      if (world.npcCount + world.trafficCount > world.npcBudget) break;
      if (world.query(sp.x, sp.y, 14, K.VEH).length) continue;
      const v = world.spawnVehicle('cart', sp.x, sp.y, sp.a, { parked: true, npcOwned: false });
      world.cartParked.set(i, v.id);
    }
  }
  // moving traffic: placed on a lane somewhere off screen, already rolling
  const net = world.map.net;
  if (!net) return;
  const night = world.clock.isNight;
  for (const a of anchors) {
    const wild = !!wildStyle(world.map, a.x, a.y), target = wild ? (night ? COUNTRY_TARGET_NIGHT : COUNTRY_TARGET_DAY) : night ? 10 : 16;
    // (out in the country, every car still on the roads round you counts - one that drove off a way comes back toward
    // you, so a new one each time would fill the quiet roads up)
    let count = 0;
    for (const v of world.query(a.x, a.y, wild ? 1800 : 1400, K.VEH)) if (v.ai && v.ai.kind === 'traffic') count++;
    if (count >= target || world.npcCount + world.trafficCount > world.npcBudget) continue;
    const cands = edgesNear(net, a.x, a.y, 1600).filter((e) => {
      const bb = e.bb || (e.bb = bboxOf(e.pts));
      return e.kind !== 'alley' && !e.notraffic && bb.x1 > a.x - 1600 && bb.x0 < a.x + 1600 && bb.y1 > a.y - 1600 && bb.y0 < a.y + 1600 && e.len > 200;
    });
    if (!cands.length) continue;
    for (let tries = 0; tries < 10; tries++) {
      const e = cands[Math.floor(rng() * cands.length)];
      let from = e.oneway || rng() < 0.5 ? e.a : e.b;
      if (!e.oneway && deadWay(net, e.id, from)) from = from === e.a ? e.b : e.a;   // (on the way to a road's end: on its way out instead)
      let lane = Math.floor(rng() * e.nl);
      let lp = lanePath(net, e, from, lane);
      const L = lp[lp.length - 1].s;
      if (L < 80) continue;
      const s = 20 + rng() * (L - 40);
      let p = pointAt(lp, s);
      if (Math.hypot(p.x - a.x, p.y - a.y) > 1500) continue;
      if (near(p.x, p.y, 300) || inAnyView(world, p.x, p.y, 140)) continue; // spawn off every screen and drive in
      const z = edgeZ(e, from, from === e.a ? s : e.len - s);
      if (z > 0.05 && z < 0.95) continue; // not halfway up a ramp
      if (world.query(p.x, p.y, 90, K.VEH).some((q) => sameLevel(q.lz, z))) continue;
      const st = world.map.districtAt(p.x, p.y).style, country = e.kind !== 'hwy' ? wildStyle(world.map, p.x, p.y) : null;
      const heavy = e.kind === 'hwy' || st === 'harbor' || st === 'industrial' || st === 'factory' || st === 'airport';
      let model = weighted(trafficMix(st, country).filter(([id]) => !(e.kind === 'dirt' && (TRUCK_MODELS.has(id) || id === 'roadbike'))
        && !(VEHICLES[id].pedal && (NO_BIKES.has(e.kind) || e.lvl !== 0 || z > 0.05))).map(([id, wt]) => [id, heavy && TRUCK_MODELS.has(id) ? wt * 3 : wt]));
      const moto = model === 'bike';
      if (moto) model = weighted(motoMix(e.kind, country || st));   // which motorcycle: by road and district (task #366)
      if (VEHICLES[model].pedal && lane > 0) { lane = 0; lp = lanePath(net, e, from, 0); p = pointAt(lp, Math.min(s, lp[lp.length - 1].s - 20)); }   // (cyclists keep to the kerb lane)
      const v = world.spawnVehicle(model, p.x, p.y, Math.atan2(p.ty, p.tx), {});
      v.lz = z;
      if (model === 'flatbed' && (heavy || country) && hash2(v.id, 398, 7) < EXPLOSIVE_LOADS) loadExplosives(world, v, 2 + Math.floor(hash2(v.id, 398, 8) * 3));
      const sp0 = Math.min(CRUISE[e.kind] || 250, 300, v.def.max * 0.7) * 0.6;
      v.vx = p.tx * sp0; v.vy = p.ty * sp0;
      const driver = spawnNpc(world, country ? countryDriver(moto ? 'bike' : model, country) : townDriver(model), p.x, p.y, 'driver');
      if (country) driver.npc.country = true;
      if (country && riderLook(model)) dressWild(world, driver, riderLook(model), rng);   // (the mountain bikers and the dirt bikers: wildfolk.js)
      driver.vehId = v.id; driver.seat = 0; v.seats[0] = driver.id; driver.lz = z;
      v.ai = { kind: 'traffic' };
      enterEdge(world, v, e.id, from, lane, s + 30);
      world.trafficCount++;
      break;
    }
  }
}
// The road edges whose boxes touch the square (x +- r, y +- r), in the list's order (what the whole list's filter by box
// gives): the edges by the cells of a grid their boxes touch, worked out once per map - at World v3's frame the list is
// the world's, looked through for every player short of traffic every 15 ticks
const EDGE_CELL = 2048, EDGE_GRIDS = new WeakMap();
export function edgesNear(net, x, y, r) {   // (exported for the tests)
  let g = EDGE_GRIDS.get(net);
  if (!g || g.n !== net.edges.length) {
    g = { n: net.edges.length, cells: new Map() };
    net.edges.forEach((e, i) => {
      const bb = e.bb || (e.bb = bboxOf(e.pts));
      for (let cy = Math.floor(bb.y0 / EDGE_CELL); cy <= Math.floor(bb.y1 / EDGE_CELL); cy++) for (let cx = Math.floor(bb.x0 / EDGE_CELL); cx <= Math.floor(bb.x1 / EDGE_CELL); cx++) {
        const k = cy * 65536 + cx;
        let l = g.cells.get(k);
        if (!l) g.cells.set(k, (l = []));
        l.push(i);
      }
    });
    EDGE_GRIDS.set(net, g);
  }
  const seen = new Set();
  for (let cy = Math.floor((y - r) / EDGE_CELL); cy <= Math.floor((y + r) / EDGE_CELL); cy++) for (let cx = Math.floor((x - r) / EDGE_CELL); cx <= Math.floor((x + r) / EDGE_CELL); cx++) {
    const l = g.cells.get(cy * 65536 + cx);
    if (l) for (const i of l) seen.add(i);
  }
  return [...seen].sort((p, q) => p - q).map((i) => net.edges[i]);
}
// Where bikes stand at the street racks (map props 'bikerack': three hoops in a row east-west): beside the hoops at
// either end, front wheel to the rack, on whichever side of it is pavement. Worked out once per map.
function rackSpots(m) {
  if (m._rackSpots) return m._rackSpots;
  const out = [];
  const ok = (x, y) => { const t = m.tileAtPx(x, y); return !PED_BLOCK[t] && t !== T.ROAD && t !== T.BRIDGE && !m.isWater(x, y); };
  m.props.forEach((q, pi) => {
    if (q.t !== 'bikerack') return;
    for (const dx of [-12, 12]) {
      const side = ok(q.x + dx, q.y + 16) && ok(q.x + dx, q.y + 30) ? 1 : ok(q.x + dx, q.y - 16) && ok(q.x + dx, q.y - 30) ? -1 : 0;
      if (side) out.push({ x: q.x + dx, y: q.y + side * 21, a: side > 0 ? -Math.PI / 2 : Math.PI / 2, pi });
    }
  });
  return (m._rackSpots = out);
}

// How long a vehicle a parking spot in the road takes (px): along it both ways, as far as the kerb runs beside it -
// where the tiles past the kerb side are road too, that's the junction's mouth (or a side street): a flatbed parked in
// the last bay before the junction by Midtown station stuck a tile and a half out into the street across, the traffic
// coming round the corner turned round in the junction to get past, and the junction locked. A spot off the road (a
// car park, a driveway) or with no kerb beside it: any. Worked out once per spot.
const FITS = ['sedan', 'compact'];
export function bayRoom(m, sp, i) {   // (exported for the tests)
  const memo = (m._bayRoom ??= new Map());
  if (memo.has(i)) return memo.get(i);
  let room = Infinity;
  const road = (x, y) => { const t = m.tileAtPx(x, y); return t === T.ROAD || t === T.BRIDGE; };
  if (road(sp.x, sp.y)) {
    const c = Math.cos(sp.a), s = Math.sin(sp.a), nx = -s, ny = c;
    // the kerb side: the nearer of the two sides off the road
    let side = 0;
    for (let k = 16; k <= 64 && !side; k += 8) side = !road(sp.x + nx * k, sp.y + ny * k) ? 1 : !road(sp.x - nx * k, sp.y - ny * k) ? -1 : 0;
    if (side) {
      let kd = 16;
      while (kd < 64 && road(sp.x + nx * side * kd, sp.y + ny * side * kd)) kd += 4;
      const ox = nx * side * (kd + 6), oy = ny * side * (kd + 6);
      let half = Infinity;
      for (const dir of [1, -1]) for (let t = 0; t <= 160; t += 4) if (road(sp.x + c * dir * t + ox, sp.y + s * dir * t + oy)) { half = Math.min(half, t); break; }
      room = half === Infinity ? Infinity : 2 * Math.max(0, half);
    }
  }
  memo.set(i, room);
  return room;
}

// Where the shopping carts stand (the owner, 2026-10-18): by the door of each grocery and market (a POI of kind grocery,
// or one named a market, a mart, a megastore or a grocery), two or three side by side on the pavement beside it, nosed to
// the wall. Worked out once per map.
const CART_POI = /grocery|market|\bmart\b|megastore|supermarket|freshhub|food co-op/i;
export function cartSpots(m) {   // (exported for the tests)
  if (m._cartSpots) return m._cartSpots;
  const out = [];
  const ok = (x, y) => { const t = m.tileAtPx(x, y); return (t === T.SIDEWALK || t === T.PLAZA || t === T.LOT) && !m.isWater(x, y); };
  for (const p of m.pois || []) {
    if (!(p.kind === 'grocery' || (p.label && CART_POI.test(p.label) && p.kind !== 'fishmarket'))) continue;
    const n = p.kind === 'grocery' ? 3 : 2;
    // a run of pavement beside the door: east or west of it along the front, a tile or so out from the wall
    let done = false;
    for (const dy of [TILE * 1.5, -TILE * 1.5, TILE * 2.5, -TILE * 2.5]) for (const side of [1, -1]) {
      if (done) break;
      const pts = [];
      for (let k = 0; k < n; k++) pts.push([p.x + side * (TILE * 1.6 + k * 17), p.y + dy]);
      if (!pts.every(([x, y]) => ok(x, y) && ok(x + 12, y) && ok(x - 12, y))) continue;
      for (const [x, y] of pts) out.push({ x, y, a: dy > 0 ? -Math.PI / 2 : Math.PI / 2 });
      done = true;
    }
  }
  return (m._cartSpots = out);
}

function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}

export function removeVehicle(world, v) {
  for (const sid of v.seats) {
    if (!sid) continue;
    const p = world.get(sid);
    if (p && p.npc) despawnNpc(world, p);
  }
  for (const cid of v.cargo) if (cid) { const c = world.get(cid); if (c) world.remove(c); }
  world.remove(v);
}

void measure;
