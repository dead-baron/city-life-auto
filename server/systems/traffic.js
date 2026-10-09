// NPC traffic (GDD §10): drivers follow lanes along the road network - straight, diagonal and
// curved streets, the one-way frontage roads, the elevated ring highway and its ramps - turn
// through junctions on smooth paths, obey 2- and 3-phase signals, keep their distance, slow for
// bends, pull over for sirens and panic when attacked; parked cars and docked boats near players.
// Also exports the shared driving controller + route planner used by police and EMS.
import { K, T } from '../../shared/constants.js';
import { lanePath, turnPath, exitsFrom, edgeZ, nearestEdge } from '../../shared/roads.js';
import { signalFor } from '../../shared/signals.js';
import { pointAt, measure } from '../../shared/geom.js';
import { angleDiff, clamp } from '../../shared/math.js';
import { TRAFFIC_MIX, PARKED_MIX, RACK_MIX, TRUCK_MODELS, VEHICLES, motoMix } from '../../shared/vehicles.js';
import { PED_BLOCK } from '../../shared/map.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { sameLevel } from '../../shared/levels.js';
import { mulberry32, hash2 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { wildStyle } from './wildlife.js';
import { crossingLimit } from './trains.js';
import { inAnyView } from '../view.js';
import { HIGHWAY_SPEED } from '../../shared/rules.js';
import { routeSteps, haltsOn, haltCap, haltAt, rejoin } from './transit.js';

const rng = mulberry32(4242);

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
function chooseExit(world, n, inEdge, def = null) {
  const net = world.map.net;
  let opts = exitsFrom(net, n, inEdge);
  if (def && (def.pedal || def.moto === 'scooter')) {   // (nor a 50cc scooter)
    opts = opts.filter((o) => !NO_BIKES.has(net.edges[o.edge].kind) && net.edges[o.edge].lvl === 0);
    if (def.rough > 1) { const paved = opts.filter((o) => net.edges[o.edge].kind !== 'dirt'); if (paved.length) opts = paved; }
  }
  if (!opts.length) return null;
  // through traffic keeps to the streets: an alley (one car wide: two meeting in it are stuck there) only when it's the
  // only way on
  const streets = opts.filter((o) => net.edges[o.edge].kind !== 'alley');
  if (streets.length) opts = streets;
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

// Lane for a road we are about to enter, given the turn into it (right turns from the kerb lane,
// left turns from the inside lane, straight on keeps its lane).
function laneFor(e, turn, cur) {
  if (e.nl <= 1) return 0;
  if (turn > 0.5) return 0;                 // right turn (screen coords: +angle = clockwise = right)
  if (turn < -0.5) return e.nl - 1;
  return Math.min(e.nl - 1, cur ?? Math.floor(rng() * e.nl));
}

const stride = (pts, from, step = 72) => {
  const out = [];
  let acc = 0;
  for (let i = from; i < pts.length; i++) {
    if (i > from) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (i === pts.length - 1 || acc >= step) { out.push({ x: pts[i].x, y: pts[i].y }); acc = 0; }
  }
  return out;
};
const endDir = (pts) => { const a = pts[Math.max(0, pts.length - 2)], b = pts[pts.length - 1]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
const startDir = (pts) => { const a = pts[0], b = pts[Math.min(pts.length - 1, 1)]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };

// Queue the waypoints for the current edge from arc length s on, ending at its stop line, and
// decide which way to go at its far end.
function enterEdge(world, v, edgeId, from, lane, s0 = 0) {
  const net = world.map.net;
  const ai = v.ai;
  const e = net.edges[edgeId];
  const to = e.a === from ? e.b : e.a;
  ai.edge = edgeId; ai.from = from;
  ai.next = chooseExit(world, net.nodes[to], edgeId, v.def);
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
  const nx = ai.next || chooseExit(world, net.nodes[to], ai.edge, v.def);
  if (!nx) { v.ai = null; v.despawnable = true; return; }
  const ne = net.edges[nx.edge];
  // a vehicle on a route (a bus's line, a taxi's way) takes its next step; past the end of a route it's traffic again
  if (ai.route && !ai.route.loop && ai.route.i + 1 >= routeSteps(world, ai.route).length) delete ai.route;
  const lane = v.def.pedal || ai.route ? 0 : laneFor(ne, nx.turn, ai.lane);   // (a cyclist, a bus and a taxi keep to the kerb)
  const a = lanePath(net, e, ai.from, ai.lane), b = lanePath(net, ne, to, lane);
  const turn = turnPath(a[a.length - 1], endDir(a), b[0], startDir(b), Math.abs(nx.turn) > 0.5 ? 6 : 3);
  if (ai.route) { ai.route.i = (ai.route.i + 1) % routeSteps(world, ai.route).length; enterRoute(world, v, ai.route.i, 0); }
  else enterEdge(world, v, nx.edge, to, lane, 0);
  ai.cameBy = e.id;   // (the road it came into the junction by: junctionClear)
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
  if (!opts.ignoreCrossings && (v.lz || 0) < 0.3) speed = Math.min(speed, crossingLimit(world, v, fwd)); // level-crossing gates down: stop (or gamble)
  // reverse out when wedged
  const ai = v.ai;
  let reversing = false;
  if (ai) {
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

// The point a smooth driver looks at: `look` px ahead along the path (the car's position, then
// the waypoints in order). Steering at it rather than at the next waypoint takes bends in one
// clean arc instead of a series of little corrections.
function lookAhead(v, pts, look) {
  let px = v.x, py = v.y, left = look;
  for (let i = 0; i < Math.min(pts.length, 6); i++) {
    const q = pts[i];
    const d = Math.hypot(q.x - px, q.y - py);
    if (d >= left) return { x: px + (q.x - px) * left / d, y: py + (q.y - py) * left / d };
    left -= d; px = q.x; py = q.y;
    if (q.stop || q.final) break;
  }
  return { x: px, y: py };
}

// How much room a driver leaves to the car in front when stopped (px, 0.6-2.4 m): some creep right up, others hang
// back - fixed per vehicle, so a queue at the lights looks like people driving, not a train of bumpers.
const standoff = (v) => v.standoff ?? (v.standoff = 14 + (Math.imul(v.id | 0, 2654435761) >>> 0) % 44);
function obstacleSpeed(world, v, fwd, ignore = null) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  const look = v.def.L / 2 + 50 + standoff(v) + Math.max(0, fwd) * 0.7;
  let limit = Infinity;
  for (const e of world.query(v.x + c * look / 2, v.y + s * look / 2, look / 2 + 40)) {
    if (e === v || (ignore && ignore.has(e.id))) continue;
    if (e.kind === K.PED) { if (e.vehId || e.dead) continue; }
    else if (e.kind !== K.VEH) continue;
    if (!sameLevel(e.lz, v.lz)) continue; // traffic up on the deck doesn't brake for the street below
    const dx = e.x - v.x, dy = e.y - v.y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const halfOther = e.kind === K.VEH ? e.def.W / 2 : 10;
    if (lx < 0 || lx > look + 40 || Math.abs(ly) > v.def.W / 2 + halfOther - 4) continue;
    // a car coming the other way in the other lane (a narrow road: their sides all but touch) squeezes past
    if (e.kind === K.VEH && ly < -(v.def.W / 2 + halfOther) * 0.45 && Math.abs(angleDiff(e.a, v.a)) > 2.6) continue;
    const gap = lx - v.def.L / 2 - (e.kind === K.VEH ? e.def.L / 2 : 10) - 10 - (e.kind === K.VEH ? standoff(v) : 0);
    limit = Math.min(limit, Math.max(0, gap * 1.8));
  }
  return limit;
}

// Route over the road network (BFS on junctions, any level - police and ambulances take the
// highway too): world waypoints along the lanes, ending at the target.
export function planRoute(world, fromX, fromY, toX, toY) {
  const m = world.map, net = m.net;
  const start = m.nearestNode(fromX, fromY), goal = m.nearestNode(toX, toY);
  if (!start || !goal || !net) return [{ x: toX, y: toY, final: true }];
  const prev = new Map([[start.id, null]]);
  const q = [start.id];
  for (let qi = 0; qi < q.length; qi++) {
    const id = q[qi];
    if (id === goal.id) break;
    for (const [eid, nid] of Object.entries(net.nodes[id].links)) if (!prev.has(nid)) { prev.set(nid, { id, e: +eid }); q.push(nid); }
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

// ---- traffic update ----------------------------------------------------------
const DRIVEWAY_CARS = ['sedan', 'compact', 'pickup', 'sports', 'sedan', 'compact'];
// Out in the open country the roads are quiet, and what's on them belongs there: farmers' pickups and
// flatbeds, campers' vans, off-roaders on motorbikes, the odd tanker for the oil field or a dump truck
// for the quarry - no taxis, buses or bin lorries.
const COUNTRY_MIX = [['pickup', 40], ['van', 12], ['sedan', 12], ['compact', 8], ['bike', 10], ['flatbed', 8], ['tanker', 2], ['dumptruck', 2], ['boxtruck', 2], ['roadbike', 3], ['mtb', 3]];
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
  if (!ai.pts || !ai.pts.length) { crossJunction(world, v); if (!v.ai) return; }
  let wp = ai.pts[0];
  const d = Math.hypot(wp.x - v.x, wp.y - v.y);
  // orbit guard: a waypoint inside the turning circle makes a car loop around it forever.
  if (ai.lastA === undefined) ai.lastA = v.a;
  let da = v.a - ai.lastA;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  ai.lastA = v.a;
  ai.turned = (ai.turned || 0) + Math.abs(da);
  const beside = d < 50 && Math.abs(angleDiff(v.a, Math.atan2(wp.y - v.y, wp.x - v.x))) > 1.25;
  if (ai.turned > Math.PI * 3.6) { replanFromHere(world, v); ai.turned = 0; return; }
  if (d < 30 || passed(v, wp) || beside || ai.turned > Math.PI * 1.9) {
    ai.turned = 0;
    ai.pts.shift();
    if (wp.halt !== undefined) haltAt(world, v, wp.halt);   // (a bus at its stop, a taxi where it's picking up or dropping off)
    if (wp.stop) { crossJunction(world, v); if (!v.ai) return; ai.replans = 0; }
    if (!ai.pts.length) { crossJunction(world, v); if (!v.ai) return; }
    wp = ai.pts[0];
  }
  let desired = panic ? 520 : Math.min(ai.kindSpeed || 250, v.model === 'bus' ? 220 : 999);
  if (v.bus || v.taxi) desired = Math.min(desired, haltCap(world, v));   // (pulling up at a stop, or waiting there - shaken or not)
  if (v.def.pedal) desired = Math.min(desired, v.def.max * (panic ? 0.95 : 0.78));   // a cyclist pedals along at their own pace
  // slow for bends: how sharply the path ahead turns
  const ahead = ai.pts[Math.min(ai.pts.length - 1, 2)];
  if (ahead) {
    const bend = Math.abs(angleDiff(v.a, Math.atan2(ahead.y - v.y, ahead.x - v.x)));
    if (bend > 0.35) desired = Math.min(desired, Math.max(120, 420 - bend * 300));
  }
  const stopIdx = ai.pts.findIndex((p) => p.stop);
  const stop = stopIdx >= 0 ? ai.pts[stopIdx] : null;
  if (stop && !panic) {
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
  }
  if (!panic && (world.tick + v.id) % 4 === 0) ai.yieldUntil = sirenBehind(world, v) ? now + 1.5 : ai.yieldUntil;
  if (!panic && ai.yieldUntil && now < ai.yieldUntil) {
    // an emergency vehicle with its siren on is coming: ease over toward the curb and slow
    // right down. Only ever onto empty road - never up onto the pavement or into people.
    const c = Math.cos(v.a), sn = Math.sin(v.a);
    const rx = -sn, ry = c;
    const up = (v.lz || 0) > 0.3;
    const solidNear = (x, y) => {
      if (up) return false;
      const k0x = Math.floor(x / 32), k0y = Math.floor(y / 32);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const arr = world.map.solidProps.get((k0y + dy) * world.map.w + k0x + dx);
        if (arr) for (const sp of arr) if (!sp.off && Math.hypot(sp.x - x, sp.y - y) < sp.r + 10) return true;
      }
      return false;
    };
    const curbOk = (x, y) => { if (up) return true; const tt = world.map.tileAtPx(x, y); return tt === T.ROAD || tt === T.BRIDGE || tt === T.SIDEWALK || tt === T.LOT || tt === T.PLAZA; };
    let shift = 0;
    const strip = (k) => { // the car's outer edge from its tail to 70 px past its nose
      for (let along = -v.def.L / 2; along <= v.def.L / 2 + 70; along += 14) {
        const ox = v.x + c * along + rx * (k + v.def.W / 2), oy = v.y + sn * along + ry * (k + v.def.W / 2);
        if (!curbOk(ox, oy) || solidNear(ox, oy)) return false;
      }
      return true;
    };
    for (let k = 4; k <= (up ? 14 : 26); k += 2) { if (!strip(k)) break; shift = k; }
    const room = shift >= 6;
    const tx = v.x + c * 50 + rx * shift, ty = v.y + sn * 50 + ry * shift;
    const busy = room && world.query(v.x + c * 40 + rx * (shift + v.def.W / 2), v.y + sn * 40 + ry * (shift + v.def.W / 2), 70, K.PED).some((e) => !e.dead && !e.vehId && sameLevel(e.lz, v.lz));
    driveToward(world, v, room && !busy ? tx : wp.x, room && !busy ? ty : wp.y, Math.min(desired, 40), {});
    return;
  }
  const la = lookAhead(v, ai.pts, clamp(46 + Math.max(0, vehForwardSpeed(v)) * 0.3, 50, 190));
  driveToward(world, v, la.x, la.y, desired, { ignoreObstacles: panic });
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
      if (e === v || !sameLevel(e.lz, v.lz) || Math.hypot(e.vx, e.vy) > 15) continue;   // (just pulling away is no queue)
      if (Math.abs(angleDiff(e.a, out)) > 0.8) continue;   // (the other way on that road, or across it)
      if (-(e.x - n.x) * oy + (e.y - n.y) * ox < -10) continue;   // (on the far side of the road)
      return false;
    }
  }
  if (waited > 6) return true;
  // 2. something crossing the junction on another heading (not one ahead of it from the same road, turning)
  const R = (n.half || 40) + 24;
  for (const e of world.query(n.x, n.y, R, K.VEH)) {
    if (e === v || !sameLevel(e.lz, v.lz)) continue;
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
      if (e === v || !sameLevel(e.lz, v.lz) || Math.abs(angleDiff(e.a, v.a)) < 2.5) continue;
      const sp = Math.hypot(e.vx, e.vy);
      if (sp < 40) continue;                                            // (waiting at its own line, or about to)
      if ((e.x - n.x) * e.vx + (e.y - n.y) * e.vy > 0 && Math.hypot(e.x - n.x, e.y - n.y) > (n.half || 40)) continue;   // (gone past)
      return false;
    }
  }
  return true;
}

// Is a vehicle running its siren coming up behind us (or straight at us down the same road)?
function sirenBehind(world, v) {
  for (const e of world.query(v.x, v.y, 460, K.VEH)) {
    if (e === v || !e.siren || !sameLevel(e.lz, v.lz)) continue;
    const sp = Math.hypot(e.vx, e.vy);
    if (sp < 60) continue;
    const ux = e.vx / sp, uy = e.vy / sp;
    const dx = v.x - e.x, dy = v.y - e.y;
    const ahead = dx * ux + dy * uy;
    const lateral = Math.abs(-dx * uy + dy * ux);
    if (ahead > 0 && ahead < 380 + sp * 0.4 && lateral < 90) return true;
  }
  return false;
}

// Rejoin the network on the nearest lane of our level, going the way the car faces (how a lost
// driver "gets themselves out" of a loop).
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
    if (rejoin(world, v, e, from, s + 40)) { ai.replans = (ai.replans || 0) + 1; if (ai.replans > 4) { v.ai = null; v.despawnable = true; } return; }
    delete ai.route;
  }
  enterEdge(world, v, e.id, from, Math.min(ai.lane || 0, e.nl - 1), s + 40);
  ai.replans = (ai.replans || 0) + 1;
  if (ai.replans > 4) { v.ai = null; v.despawnable = true; } // hopeless: park it and let the cleanup take it
}

// Put a vehicle (already driven by an NPC) into traffic on the nearest lane, going the way it
// faces.
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
  const near = (x, y, r) => { for (const a of anchors) if ((a.x - x) ** 2 + (a.y - y) ** 2 < r * r) return true; return false; };
  // despawn
  const now = world.time, mine = new Set();
  for (const p of world.players.values()) if (p.lastVehicle) mine.add(p.lastVehicle);   // (a car a player left somewhere stays)
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH) continue;
    if (v.seats.some((s) => s && world.get(s)?.player)) continue;
    if (v.owner && !v.wreckAt) continue;
    const isTraffic = v.ai && v.ai.kind === 'traffic';
    const range = isTraffic ? 1800 : 1900;
    // a car that hasn't moved in a long while - in a jam that won't clear, or left in the road with nobody in it - is
    // cleared away once nobody's looking, near a player or not (the road crew; the jam behind it moves again)
    if (Math.hypot(v.vx, v.vy) < 8 && !v.parked && !mine.has(v.id) && (isTraffic || (!v.ai && v.despawnable && !v.seats.some((s) => s)))) v.stillSince ??= now;
    else v.stillSince = undefined;
    if (v.stillSince !== undefined && now - v.stillSince > (isTraffic ? 50 : 90) && !inAnyView(world, v.x, v.y, 96) && !(v.ai && v.ai.route)) { removeVehicle(world, v); continue; }
    if (!v.despawnable || near(v.x, v.y, range) || inAnyView(world, v.x, v.y, 64)) continue;
    if (v.ai && v.ai.kind !== 'traffic') continue; // police/ems manage their own
    removeVehicle(world, v);
  }
  // parked cars + boats
  const spots = world.map.parking;
  world.parked ??= new Map();
  for (const [i, vid] of world.parked) { if (!world.get(vid)) world.parked.delete(i); }
  for (const a of anchors) {
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      if (world.parked.has(i)) continue;
      if (hash2(i, 7, world.map.seed) > (sp.sparse ? 0.3 : sp.drive ? 0.5 : 0.7)) continue; // a home's driveway: often a car, often not
      const d2 = (sp.x - a.x) ** 2 + (sp.y - a.y) ** 2;
      if (d2 > 1150 * 1150) continue;
      const fresh = world.time - (a.player?.joinedAt ?? -99) < 2 || world.time < 3 || world.time - (a.player?.teleportAt ?? -99) < 2;
      if (!fresh && inAnyView(world, sp.x, sp.y, 80)) continue; // never pops in on someone's screen
      if (world.npcCount + world.trafficCount > world.npcBudget) break;
      let pm = sp.drive ? DRIVEWAY_CARS[Math.floor(hash2(i, 5, 2) * DRIVEWAY_CARS.length)] : weighted(PARKED_MIX);
      if (pm === 'bike') pm = weighted(motoMix('', world.map.districtAt(sp.x, sp.y).style));   // (which motorcycle: by district - task #366)
      const v = world.spawnVehicle(pm, sp.x, sp.y, sp.a + (sp.a === -Math.PI / 2 && hash2(i, 3, 1) < 0.5 ? Math.PI : 0), { parked: true });
      world.parked.set(i, v.id);
    }
    world.marinaParked ??= new Map();
    world.map.marina.forEach((sp, i) => {
      if (world.marinaParked.has(i) && world.get(world.marinaParked.get(i))) return;
      if ((sp.x - a.x) ** 2 + (sp.y - a.y) ** 2 > 1100 * 1100) return;
      const fresh = world.time - (a.player?.joinedAt ?? -99) < 2 || world.time < 3 || world.time - (a.player?.teleportAt ?? -99) < 2;
      if (!fresh && inAnyView(world, sp.x, sp.y, 80)) return;
      const v = world.spawnVehicle(sp.kind || (i % 3 === 0 ? 'speedboat' : i % 3 === 1 ? 'jetski' : 'dinghy'), sp.x, sp.y, sp.a, { parked: true });
      world.marinaParked.set(i, v.id);
    });
    // bikes locked up at the street bike racks: one or two at most of them (anyone's to take - it's theft)
    world.rackParked ??= new Map();
    const racks = rackSpots(world.map);
    for (let i = 0; i < racks.length; i++) {
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
    const cands = net.edges.filter((e) => {
      const bb = e.bb || (e.bb = bboxOf(e.pts));
      return e.kind !== 'alley' && bb.x1 > a.x - 1600 && bb.x0 < a.x + 1600 && bb.y1 > a.y - 1600 && bb.y0 < a.y + 1600 && e.len > 200;
    });
    if (!cands.length) continue;
    for (let tries = 0; tries < 10; tries++) {
      const e = cands[Math.floor(rng() * cands.length)];
      const from = e.oneway || rng() < 0.5 ? e.a : e.b;
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
      let model = weighted((country ? COUNTRY_MIX : TRAFFIC_MIX).filter(([id]) => !(e.kind === 'dirt' && (TRUCK_MODELS.has(id) || id === 'roadbike'))
        && !(VEHICLES[id].pedal && (NO_BIKES.has(e.kind) || e.lvl !== 0 || z > 0.05))).map(([id, wt]) => [id, heavy && TRUCK_MODELS.has(id) ? wt * 3 : wt]));
      const moto = model === 'bike';
      if (moto) model = weighted(motoMix(e.kind, country || st));   // which motorcycle: by road and district (task #366)
      if (VEHICLES[model].pedal && lane > 0) { lane = 0; lp = lanePath(net, e, from, 0); p = pointAt(lp, Math.min(s, lp[lp.length - 1].s - 20)); }   // (cyclists keep to the kerb lane)
      const v = world.spawnVehicle(model, p.x, p.y, Math.atan2(p.ty, p.tx), {});
      v.lz = z;
      const sp0 = Math.min(CRUISE[e.kind] || 250, 300, v.def.max * 0.7) * 0.6;
      v.vx = p.tx * sp0; v.vy = p.ty * sp0;
      const driver = spawnNpc(world, country ? countryDriver(moto ? 'bike' : model, country) : townDriver(model), p.x, p.y, 'driver');
      if (country) driver.npc.country = true;
      driver.vehId = v.id; driver.seat = 0; v.seats[0] = driver.id; driver.lz = z;
      v.ai = { kind: 'traffic' };
      enterEdge(world, v, e.id, from, lane, s + 30);
      world.trafficCount++;
      break;
    }
  }
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
