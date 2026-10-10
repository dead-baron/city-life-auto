// Road ends (task #384). The owner, three times on 2026-10-09: "There are a lot of road ends and cul-de-sacs where cars
// will all get jammed together and go in a big loop and get stuck", "we should figure out how to get some vehicles to
// back up and make room for other vehicles to get through". tools/trafficjams.mjs measures it; what it found and what
// this module does about it:
//  * Through traffic drove into cul-de-sacs, county roads and tracks that just stop as readily as onto any road - and at a
//    junction where three arms are dead ends, out of one straight into the next. deadWay() says which roads lead only to
//    road ends (the dead ends of the road graph peeled off one by one, so a court that forks counts as one); traffic.js
//    keeps out of them unless there's no other way on, and new traffic placed on one drives out of it.
//  * Turning round at the end was a hairpin of waypoints 4 px past the end of the lane. A hatchback got round it in a
//    turning circle; a truck swung over the pavement into a fence, and two at once locked together. Now a car turns
//    round by a manoeuvre (startTurn / stepTurn): forward on full lock while there's room ahead, back on the opposite lock
//    while there's room behind (until going forward will bring it round), and so on - one sweep round a turning circle,
//    a three-point turn in a narrow road; a short straight shuffle when a corner is up against something either way. It
//    looks along the arc it's about to drive for the kerb (in town; out in the country the verge will do), anything
//    solid, other vehicles and people, and waits for one on the move. Where the road's too narrow to turn in at all (a
//    service alley), it backs out to the street and turns into it there; one that can't get round backs up a little and
//    tries again. One car turns at a time at a road's end: the next waits short of the turning circle (holdShort). The
//    same manoeuvre turns a car round in the street when it gives up on a blocked road (reroute.js).
//  * A turn that gets nowhere for a while is put off for a few seconds and tried again; meanwhile the car is the
//    clean-up's (traffic.js manage: gone as soon as nobody can see it).
import { K, T } from '../../shared/constants.js';
import { lanePath } from '../../shared/roads.js';
import { project, pointAt } from '../../shared/geom.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { sameLevel } from '../../shared/levels.js';
import { CAR_BLOCK } from '../../shared/map.js';
import { leaveBy } from './traffic.js';

const TAU = Math.PI * 2;

// ---- which roads lead only to road ends -----------------------------------------------------------------------------
// Peel the graph's dead ends off one at a time (a node left with one road is a road's end; its road goes, which can leave
// the next node with one): every road peeled off this way leads only to road ends, the way from where it was cut. Once
// per network. A key per way: edge id * 2 + (entered from its b end).
export function deadWays(net) {
  if (net._deadWays) return net._deadWays;
  const N = net.nodes.length, deg = new Int32Array(N), gone = new Uint8Array(net.edges.length);
  for (const e of net.edges) { if (e.a === e.b) { deg[e.a] += 2; continue; } deg[e.a]++; deg[e.b]++; }
  const out = new Set(), q = [];
  for (let i = 0; i < N; i++) if (deg[i] === 1) q.push(i);
  while (q.length) {
    const n = q.pop();
    if (deg[n] !== 1) continue;
    const id = net.nodes[n].edges.find((k) => !gone[k]);
    if (id === undefined) continue;
    const e = net.edges[id], o = e.a === n ? e.b : e.a;
    gone[id] = 1; deg[n]--; deg[o]--;
    out.add(id * 2 + (o === e.a ? 0 : 1));   // (onto it from o: toward the road's end)
    if (deg[o] === 1) q.push(o);
  }
  return (net._deadWays = out);
}
// Does driving onto edge edgeId from node `from` lead only to a road's end (and back the same way)?
export const deadWay = (net, edgeId, from) => deadWays(net).has(edgeId * 2 + (net.edges[edgeId].a === from ? 0 : 1));
export const isRoadEnd = (net, id) => !!net.nodes[id] && net.nodes[id].edges.length === 1;

// ---- turning round --------------------------------------------------------------------------------------------------
export const TURN_SPEED = 75, BACK_SPEED = 55;   // px/s: forward and back while manoeuvring
const DONE_A = 0.5;            // within this of the way out (rad): round - the lane takes it from there
const STALL_S = 9;             // no nearer to coming round (or backing out) for this long: stuck,
const RETRY_S = 4;             // ...put off this long, then tried again
const WAIT_MAX = 6;            // waiting for a vehicle on the move or a person to get out of the way, at most (s)
const MAX_BACK_A = 1.5;        // one leg back turns it this far at most (rad)
const SHUFFLE = 28;            // px: a straight shuffle to get a corner clear of something
const BACK_UP = 150;           // px: backing up the road for more room, after a turn that got stuck
const EDGE_M = 3, VEH_M = 7, PED_R = 16;   // px kept clear of the kerb (and anything solid), of other vehicles, of people
const LOOK = 64;               // px along the arc looked at, each tick
// where a car may put its wheels while turning round: the road (a parking lot, a driveway); out in the country, where
// the roads have no kerbs, the verge and the open ground too
const OPEN_TOWN = new Set([T.ROAD, T.BRIDGE, T.LOT]);
const OPEN_KERB = new Set([T.ROAD, T.BRIDGE, T.LOT, T.SIDEWALK]);   // (wedged: over the kerb - nextLeg)
const OPEN_ANY = new Set([T.ROAD, T.BRIDGE, T.LOT, T.SIDEWALK, T.PLAZA, T.GRASS, T.DIRT, T.SAND, T.FIELD, T.DOCK]);   // (still wedged: wherever a car can go)
const WET = (t) => t === T.WATER || t === T.DEEP;
const OPEN_COUNTRY = new Set([T.ROAD, T.BRIDGE, T.LOT, T.DIRT, T.GRASS, T.SAND, T.FIELD]);
const COUNTRY = new Set(['rural', 'dirt']);

// The turning radius on full lock at walking pace (shared/physics.js vehStep: below 120 px/s the yaw rate is
// def.turn * speed / 120, eased by hiSpeed, so the radius doesn't depend on the speed).
export const turnRadius = (v) => 120 / (v.def.turn * (1 - 0.35 * TURN_SPEED / v.def.max));
// The room it takes to turn on the spot: the bodies here turn about their middles, so the corners sweep a circle this wide
const swing = (v) => 2 * Math.hypot(v.def.L / 2 + EDGE_M, v.def.W / 2 + EDGE_M) + 8;

// Start turning v round, to drive off along edge `edge` leaving node `from` (lane 0: the car's ai.pts are already that
// lane's waypoints). node: the road's end it's turning at (-1: in the street).
export function startTurn(world, v, edge, from, node = -1) {
  const ai = v.ai, net = world.map.net, e = net.edges[edge];
  const open = COUNTRY.has(e.kind) ? OPEN_COUNTRY : OPEN_TOWN;
  ai.turn = { edge, from, node, open, mode: 'turn', sense: -1, tries: 0 };
  legsFrom(world, v, ai.turn, 1);
  // a road too narrow to turn in (a service alley): back out to the street, and turn into it there
  if (node >= 0 && Math.max(e.w + (open === OPEN_COUNTRY ? 64 : 0), 2 * (net.nodes[node].bulb || 0)) < swing(v)) backOut(world, v, ai.turn, Infinity);
  ai.ctl = null; ai.reverseUntil = 0; ai.stuck = 0;
  if (node >= 0) (world.turning ??= new Map()).set(node, v.id);
  world.turns = (world.turns || 0) + 1;
}
// (a fresh set of legs: forward first, or back)
function legsFrom(world, v, t, dir) {
  Object.assign(t, { dir, steer: dir > 0 ? t.sense : -t.sense, legs: 0, legA: v.a, legS: 0, best: Infinity, bestAt: world.time, waited: 0 });
}
// back along the road it came in by, for `howFar` px (Infinity: out to the junction it came from)
function backOut(world, v, t, howFar) {
  const net = world.map.net, e = net.edges[t.edge];
  t.mode = 'back'; t.inFrom = t.node >= 0 ? (e.a === t.node ? e.b : e.a) : t.from; t.backFor = howFar; t.backS = 0;
  t.best = Infinity; t.bestAt = world.time; t.waited = 0;
}

// The heading to come round to: along the lane it drives off by, at the point of it nearest the car.
function goalOf(world, t, v) {
  const net = world.map.net, lp = lanePath(net, net.edges[t.edge], t.from, 0);
  const pr = project(lp, v);
  const p = pointAt(lp, pr ? pr.s + 20 : 0);
  return Math.atan2(p.ty, p.tx);
}

// Every tick while turning (traffic.js steerTraffic): true while still at it; false once round (the car drives off by
// its lane).
export function stepTurn(world, v) {
  const ai = v.ai, t = ai.turn, now = world.time;
  ai.ctl = null;   // (its own pedals: vehicles.js doesn't re-trim them)
  v._blk = 0;      // (not stopped behind anything while it manoeuvres: reroute.js and traffic.js breakRing look at _blk)
  if (t.pausedUntil > now) { pedals(v, 0, 0); return true; }
  if (t.mode === 'back') return stepBack(world, v, t);
  const fwd = vehForwardSpeed(v);
  let rem = ((goalOf(world, t, v) - v.a) * t.sense) % TAU;   // still to turn, the way it's turning
  if (rem < 0) rem += TAU;
  // round (near enough, with the way ahead clear: the lane takes it from there)
  if ((rem < DONE_A || rem > TAU - DONE_A) && (Math.min(rem, TAU - rem) < 0.15 || clearance(world, v, 1, 0, t.open, 56).free >= 54)) { endTurn(world, v, true); return false; }
  if (rem < t.best - 0.08) { t.best = rem; t.bestAt = now; }
  if (now - t.bestAt > STALL_S) { stuck(world, v, t); return true; }
  const { dir, steer } = t;
  let room = clearance(world, v, dir, steer, t.open);
  if (steer === 0 && t.legS >= SHUFFLE) room = { free: 0, mover: false };   // (a shuffle's done)
  // a leg back ends once going forward will bring it round (or it's turned as far as one leg back should)
  if (dir < 0 && steer && (world.tick + v.id) % 3 === 0 && Math.abs(wrap(v.a - t.legA)) > 0.25) {
    const need = Math.min(220, turnRadius(v) * (rem - DONE_A) + 10);
    if (Math.abs(wrap(v.a - t.legA)) > MAX_BACK_A || clearance(world, v, 1, t.sense, t.open, need).free >= need - 1) room = { free: 0, mover: false };
  }
  const stop = (fwd * fwd) / (2 * 350) + 3;
  if (room.free > stop + 2) {
    pedals(v, dir * Math.min(dir > 0 ? TURN_SPEED : BACK_SPEED, 18 + room.free * 1.3), steer);
    t.legS += Math.abs(fwd) * 0.05;
    t.waited = 0;
    return true;
  }
  if (room.mover && t.waited < WAIT_MAX) { pedals(v, 0, 0); t.waited += 0.05; return true; }   // (someone going by: wait)
  // as far as it goes this way: stop, then the next leg
  pedals(v, 0, 0);
  if (Math.abs(fwd) < 6) nextLeg(world, v, t);
  return true;
}
// After a leg on full lock, the other way on full lock; after a shuffle, full lock the same way. Failing that - a corner
// up against the kerb whichever way it swings (the bodies here turn about their middles: the back swings out as much as
// the front) - over the kerb it goes, onto the pavement if it must; and failing that, a short straight shuffle whichever
// way has more room.
function nextLeg(world, v, t) {
  const lock = (d) => (d > 0 ? t.sense : -t.sense);
  const opts = t.steer ? [-t.dir, t.dir] : [t.dir, -t.dir];
  Object.assign(t, { legs: t.legs + 1, legA: v.a, legS: 0, waited: 0 });
  for (const open of t.open === OPEN_TOWN ? [OPEN_TOWN, OPEN_KERB, OPEN_ANY] : t.open === OPEN_KERB ? [OPEN_KERB, OPEN_ANY] : [t.open, OPEN_ANY]) {
    for (const d of opts) if (clearance(world, v, d, lock(d), open, 24).free >= 16) { t.dir = d; t.steer = lock(d); t.open = open; return; }
  }
  const f = clearance(world, v, 1, 0, t.open, 40).free, b = clearance(world, v, -1, 0, t.open, 40).free;
  if (Math.max(f, b) >= 10) { t.dir = f >= b ? 1 : -1; t.steer = 0; return; }
  t.dir = opts[0]; t.steer = lock(t.dir);   // (nothing will go: it waits it out - the stall check)
}
// Stuck turning: at a road's end it backs up the road for more room and tries again (the second time, all the way out to
// the junction); in the street it stays put a while and tries again. Either way the clean-up may take it meanwhile.
function stuck(world, v, t) {
  v.ai.hopeless = true;
  pedals(v, 0, 0);
  if (t.mode === 'turn' && t.node >= 0 && t.tries < 3) { t.tries++; backOut(world, v, t, t.tries >= 2 ? Infinity : BACK_UP); return; }
  t.pausedUntil = world.time + RETRY_S;
  if (t.mode === 'back') { t.mode = 'turn'; t.tries = 0; }
  legsFrom(world, v, t, 1);
  t.bestAt = world.time + RETRY_S;
}

// Backing up the road it came in by (steering its tail along the lane, looking behind it); out at the junction, it picks
// its way on from there (traffic.js leaveBy) and turns into it.
function stepBack(world, v, t) {
  const net = world.map.net, now = world.time, e = net.edges[t.edge];
  const lp = lanePath(net, e, t.inFrom, 0), pr = project(lp, v);
  const fwd = vehForwardSpeed(v);
  const n = net.nodes[t.inFrom], atJunction = pr.s < 4 && Math.hypot(n.x - v.x, n.y - v.y) < (n.half || 0) + v.def.L / 2;
  if (t.backS >= t.backFor || atJunction) {
    pedals(v, 0, 0);
    if (Math.abs(fwd) > 6) return true;
    if (t.backFor < Infinity) { t.mode = 'turn'; legsFrom(world, v, t, 1); return true; }   // (more room now: round from here)
    // out at the junction: on by another road, turning into it from here
    if (t.node >= 0 && world.turning && world.turning.get(t.node) === v.id) world.turning.delete(t.node);
    const out = leaveBy(world, v, t.inFrom, t.edge);
    if (!out) { stuck(world, v, t); return true; }
    const goal = goalOf(world, { edge: out.edge, from: t.inFrom }, v);
    Object.assign(t, { edge: out.edge, from: t.inFrom, node: -1, mode: 'turn', sense: wrap(goal - v.a) >= 0 ? 1 : -1, tries: 0 });
    legsFrom(world, v, t, -1);
    return true;
  }
  const s0 = pr ? pr.s : 0;
  if (s0 < t.best - 6) { t.best = s0; t.bestAt = now; }
  if (now - t.bestAt > STALL_S) { stuck(world, v, t); return true; }
  // the tail along the lane: aim it at a point on the lane behind the car
  const q = pointAt(lp, Math.max(0, s0 - 46));
  const err = wrap(Math.atan2(q.y - v.y, q.x - v.x) - (v.a + Math.PI));
  const steer = Math.max(-1, Math.min(1, -err * 2.2));
  const room = clearance(world, v, -1, steer, t.open, 48);
  const stop = (fwd * fwd) / (2 * 350) + 3;
  if (room.free > stop + 2) { pedals(v, -Math.min(BACK_SPEED, 18 + room.free * 1.3), steer); t.backS += Math.abs(fwd) * 0.05; t.waited = 0; return true; }
  pedals(v, 0, 0);
  if (room.mover && t.waited < WAIT_MAX) t.waited += 0.05;
  return true;
}

// Round (or given up): back to its lane - the waypoints behind it dropped.
export function endTurn(world, v, round) {
  const ai = v.ai, t = ai.turn;
  ai.turn = null;
  if (t && t.node >= 0 && world.turning && world.turning.get(t.node) === v.id) world.turning.delete(t.node);
  if (!round) return;
  ai.hopeless = false;
  ai.turned = 0; ai.lastA = v.a; ai.stuck = 0; ai.reverseUntil = 0; ai.jam = false; ai.jamT = 0;
  const c = Math.cos(v.a), s = Math.sin(v.a);
  while (ai.pts && ai.pts.length > 1 && !ai.pts[0].stop && ((ai.pts[0].x - v.x) * c + (ai.pts[0].y - v.y) * s < 30)) ai.pts.shift();
}

// Room to back up straight (px, up to `look`): nothing behind it - a wall, the water, a vehicle, a person (traffic.js:
// a driver wedged against something backs off only into room).
export const roomBehind = (world, v, look = 36) => clearance(world, v, -1, 0, OPEN_ANY, look).free;

// On the way up to a road's end: does the road give out just ahead, short of the end of its lane (a turning circle cut
// off by the water, a fence across a track)? Then it turns round there (traffic.js steerTraffic).
export function roadGivesOut(world, v) {
  const e = world.map.net.edges[v.ai.edge];
  const c = clearance(world, v, 1, 0, e && COUNTRY.has(e.kind) ? OPEN_COUNTRY : OPEN_TOWN, 40);
  return c.free < 24 && c.by !== 'vehicle' && c.by !== 'person';
}

// Short of a road's end while another car turns round there: how far it may still go (px; Infinity when it's free).
// The turning circle (or, where there's none, the end of the road and a car's length back from it) is the turning car's.
export function holdShort(world, v, node, ds) {
  const id = world.turning && world.turning.get(node);
  if (!id || id === v.id) return Infinity;
  const o = world.get(id);
  if (!o || !o.ai || !o.ai.turn || o.ai.turn.node !== node) { world.turning.delete(node); return Infinity; }
  const n = world.map.net.nodes[node];
  return ds - Math.max(n.bulb || 0, o.def.L) - v.def.L / 2 - 16;
}

// Pedals and wheel for a manoeuvre: toward signed speed `want` (px/s; negative: backwards), steer -1 (left) .. 1.
// Stopping (or rolling the wrong way): the handbrake, wheel straight - no creeping, no rocking between the gears.
function pedals(v, want, steer) {
  const fwd = vehForwardSpeed(v);
  if (want === 0 || (want > 0 && fwd < -4) || (want < 0 && fwd > 4)) { v.input = { throttle: 0, steer: 0, hb: true }; return; }
  const throttle = want > 0 ? (fwd < want ? Math.min(1, 0.3 + (want - fwd) / 50) : fwd > want + 12 ? -0.3 : 0)
    : (fwd > want ? -Math.min(0.9, 0.35 + (fwd - want) / 50) : fwd < want - 12 ? 0.3 : 0);
  v.input = { throttle, steer, hb: false };
}

const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };

// How far (px, up to `look`) v can go forward (dir 1) or back (-1) with the wheel at `steer` (-1 full left .. 1 full
// right: the heading turns by steer * dir / R a px), before its outline meets the edge of where it may drive (`open`
// tiles, EDGE_M out), a wall or something solid, comes within VEH_M of a vehicle or PED_R of a person, or its middle goes
// over the water (a corner may hang over the edge of a quay: it's the middle that sinks - vehicles.js). by: what stops
// it; mover: it's on the move (a vehicle going by, a person), worth waiting for.
const RING = [[1, -1], [1, -0.4], [1, 0.4], [1, 1], [0.5, -1], [0.5, 1], [0, -1], [0, 1], [-0.5, -1], [-0.5, 1], [-1, -1], [-1, -0.4], [-1, 0.4], [-1, 1]];
export function clearance(world, v, dir, steer, open, look = LOOK) {
  const m = world.map, k = (steer * dir) / turnRadius(v), hl = v.def.L / 2 + EDGE_M, hw = v.def.W / 2 + EDGE_M;
  const near = [];
  for (const e of world.query(v.x, v.y, v.def.L / 2 + look + 110)) {
    if (e === v || !sameLevel(e.lz, v.lz)) continue;
    if (e.kind === K.VEH || (e.kind === K.PED && !e.vehId && !e.dead && !e.hidden)) near.push(e);
  }
  // outline points that start out off the open ground are let be (it's only kept from going further off)
  const c0 = Math.cos(v.a), s0 = Math.sin(v.a);
  const ok0 = RING.map(([f, l]) => open.has(m.tileAtPx(v.x + c0 * f * hl - s0 * l * hw, v.y + s0 * f * hl + c0 * l * hw)));
  const dry0 = !WET(m.tileAtPx(v.x, v.y));
  const STEP = 8, hit = (s, mover, by, px, py) => ({ free: Math.max(0, s - STEP), mover, by, x: px, y: py });
  let x = v.x, y = v.y, a = v.a;
  for (let s = 0; s <= look; s += STEP) {
    if (s > 0) { const am = a + (k * STEP) / 2; x += dir * Math.cos(am) * STEP; y += dir * Math.sin(am) * STEP; a += k * STEP; }
    const c = Math.cos(a), sn = Math.sin(a);
    // (the middle of it, a stopping distance on: where it would sink)
    if (s > 0 && dry0) for (const f of [-0.6, 0, 0.6]) { const px = x + c * (f * hl + dir * 14), py = y + sn * (f * hl + dir * 14); if (WET(m.tileAtPx(px, py))) return hit(s, false, 'water', px, py); }
    for (let i = 0; i < RING.length; i++) {
      const [f, l] = RING[i];
      // (the trailing half to start with, the trailing bumper after: they go where the car's been - though the corners
      // swing out on a lock)
      if (f * dir < 0 && (s === 0 || Math.abs(l) < 1 || !k)) continue;
      const px = x + c * f * hl - sn * l * hw, py = y + sn * f * hl + c * l * hw;
      if (s > 0) {
        const tt = m.tileAtPx(px, py);
        if (CAR_BLOCK[tt]) return hit(s, false, 'wall', px, py);
        if (ok0[i] && !open.has(tt) && !WET(tt)) return hit(s, false, 'edge', px, py);
      }
      const tx = Math.floor(px / 32), ty = Math.floor(py / 32);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const arr = m.solidProps.get((ty + oy) * m.w + tx + ox);
        if (arr) for (const p of arr) if (!p.off && Math.hypot(p.x - px, p.y - py) < p.r + 1) return hit(s, false, 'solid', px, py);
      }
      for (const e of near) {
        if (e.kind === K.PED) { if (Math.hypot(e.x - px, e.y - py) < PED_R) return hit(s, true, 'person', px, py); continue; }
        const dx = px - e.x, dy = py - e.y, ec = Math.cos(e.a), es = Math.sin(e.a);
        if (Math.abs(dx * ec + dy * es) < e.def.L / 2 + VEH_M - EDGE_M && Math.abs(-dx * es + dy * ec) < e.def.W / 2 + VEH_M - EDGE_M) return hit(s, Math.hypot(e.vx, e.vy) > 20 || !!(e.ai && e.ai.turn), 'vehicle', px, py);
      }
    }
  }
  return { free: look, mover: false };
}
