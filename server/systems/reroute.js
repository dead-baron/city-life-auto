// Drivers who find another way round (task #315). A driver stopped behind a backup - a wreck, a car nobody's driving,
// one broken down, a police car or an ambulance at a scene, a player's car left standing in the road, or a queue behind
// one of those (never a queue at the lights) - looks for another way after a few seconds (sooner in a bus or a taxi):
//   1. a free lane alongside, going the same way: over into it (backing off a little first to pull out);
//   2. otherwise the road is remembered as blocked for a while (a small memory: the planners keep off it - traffic.js
//      chooseExit and planRoute, the taxis' routes) and the driver turns round and goes another way; a bus goes round
//      on the other side of the road when that's clear (goRound), and on a one-way street everyone waits.
// Emergency vehicles with their sirens on (police, ambulances, fire engines) go round sooner, on the other side of the
// road or up on the pavement, whichever is clear (goRound, from traffic.js driveToward).
// Kept cheap: a driver re-plans at most once in GAP seconds, no more than PER_TICK drivers re-plan in one tick, and the
// memory holds MEMORY roads for TTL seconds.
import { K, T } from '../../shared/constants.js';
import { lanePath, nearestEdge } from '../../shared/roads.js';
import { pointAt, project } from '../../shared/geom.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { sameLevel } from '../../shared/levels.js';
import { enterEdge } from './traffic.js';
import { rejoin } from './transit.js';
import { startTurn, roomToTurn, roomBehind } from './roadends.js';   // (turning round in the street by a manoeuvre: task #384)
import { FLY } from '../../shared/flight.js';   // (an aircraft up in the air: over all this, untouched)

export const MEMORY = 24, TTL = 45;   // the blocked-road memory: this many roads at most, each kept this long (s)
export const GAP = 6;                 // a driver re-plans at most once in this long (s)
export const PER_TICK = 3;            // ...and no more than this many drivers re-plan in one tick
const JAM_S = 5, JAM_SERVICE_S = 3;   // stopped behind a backup this long (s) before looking for another way (a bus, a taxi: sooner)
const ROUND_S = 1, ROUND_BUS_S = 3;   // a siren behind something stopped: round it after this long (a bus: this)

export function markBlocked(world, edgeId) {
  const m = (world.blockedEdges ??= new Map());
  m.delete(edgeId); m.set(edgeId, world.time + TTL);
  while (m.size > MEMORY) m.delete(m.keys().next().value);   // (the oldest goes first)
}
export function isBlocked(world, edgeId) {
  const m = world.blockedEdges;
  if (!m || !m.size) return false;
  const u = m.get(edgeId);
  if (u === undefined) return false;
  if (u < world.time) { m.delete(edgeId); return false; }
  return true;
}

// What v is stopped behind (traffic.js obstacleSpeed notes the nearest vehicle in the way: v._blk): something that
// won't move, or a queue behind something that won't (each car in a queue knows whether it's jammed: ai.jam).
export function jammed(world, v) {
  const b = v._blk && world.get(v._blk);
  if (!b || b.kind !== K.VEH) return false;
  if (Math.hypot(b.vx, b.vy) > 12) { b._stillAt = undefined; return false; }
  if (b.wreckAt || b.dead) return true;
  const bai = b.ai, drv = b.seats[0] && world.get(b.seats[0]);
  if (drv && drv.player) { b._stillAt ??= world.time; return world.time - b._stillAt > 8; }   // (a player waiting at the lights isn't in the way)
  if (!bai) return true;                                  // nobody driving it: left in the road
  if (bai.kind === 'traffic') return (!!bai.jam && !(bai.roundUntil > world.time)) || !!bai.parkIt || !!bai.incident;   // (one about to go round what's in its way: the queue follows it round, it doesn't turn back)   // (... or pulled up after a rear-end: slips.js)   // a queue: jammed if the car ahead of it is (or that one gave up and pulled up: traffic.js parkIt)
  return true;                                            // a police car, an ambulance, a tow truck at work
}

// Every tick for a traffic car (traffic.js steerTraffic): true when it changed its plans this tick.
export function unjam(world, v, holding) {
  const ai = v.ai, now = world.time;
  const jam = !holding && vehForwardSpeed(v) < 15 && jammed(world, v);
  ai.jam = jam;
  ai.jamT = jam ? (ai.jamT || 0) + 0.05 : 0;
  if (ai.jamT < (v.bus || v.taxi || v.model === 'taxi' ? JAM_SERVICE_S : JAM_S) || now - (ai.rerouteAt ?? -99) < GAP) return false;
  if (world.rrTick !== world.tick) { world.rrTick = world.tick; world.rrN = 0; }
  if (world.rrN >= PER_TICK) return false;
  world.rrN++;
  world.reroutes = (world.reroutes || 0) + 1;
  ai.rerouteAt = now; ai.jamT = 0;
  return findWay(world, v);
}

// how far along its lane v is: the arc length on lane k's own path from `from` - the path laneClear, laneHeading and
// enterEdge measure along, which starts trimmed clear of the junction box. (It used to be the arc along the road's
// centre line from the node: past a big junction - an avenue's, trimmed 200 px and more - that put the car a junction's
// width further on than it was, so laneClear looked at the lane alongside past what was in the way, ran off the lane's
// end and never found it free.)
function arcOn(net, e, from, k, v) {
  const lp = lanePath(net, e, from, Math.max(0, Math.min(k || 0, e.nl - 1))), pr = project(lp, v);
  if (pr) return pr.s;
  const ne = nearestEdge({ edges: [e] }, v.x, v.y);
  const s = ne ? ne.s : 0;
  return from === e.a ? s : e.len - s;
}
// is lane k of e (from `from`) clear alongside v from just behind it to well past what's in the way?
function laneClear(world, v, e, from, k, s, blk) {
  const lp = lanePath(world.map.net, e, from, k), L = lp[lp.length - 1].s;
  const past = blk ? Math.hypot(blk.x - v.x, blk.y - v.y) + blk.def.L / 2 + 70 : 160;
  for (let t = s - v.def.L * 0.6; t <= s + past; t += 24) {
    if (t < 0) continue;
    if (t > L) return t > s + v.def.L;   // (the road ends there: room enough if it's past the car)
    const p = pointAt(lp, t);
    for (const q of world.query(p.x, p.y, 36, K.VEH)) if (q !== v && q !== blk && sameLevel(q.lz, v.lz) && !((q.alt || 0) > FLY.HIGH)) return false;
  }
  return true;
}

// the way v's lane runs where it is (s: its arc length along edge e from where it came in)
function laneHeading(world, v, e, s) {
  const lp = lanePath(world.map.net, e, v.ai.from, Math.min(v.ai.lane || 0, e.nl - 1)), p = pointAt(lp, Math.max(0, Math.min(lp[lp.length - 1].s, s)));
  return Math.atan2(p.ty, p.tx);
}
function findWay(world, v) {
  const ai = v.ai, net = world.map.net, e = net.edges[ai.edge], now = world.time;
  if (!e) return false;
  const blk = v._blk ? world.get(v._blk) : null;
  const s = arcOn(net, e, ai.from, ai.lane, v);
  // 1. a free lane alongside, the same way
  if (e.nl > 1 && !v.def.pedal) {
    const order = [...Array(e.nl).keys()].filter((k) => k !== ai.lane).sort((a, b) => Math.abs(a - ai.lane) - Math.abs(b - ai.lane));
    for (const k of order) {
      if (!laneClear(world, v, e, ai.from, k, s, blk)) continue;
      const nx = ai.next, turning = ai.turning;
      enterEdge(world, v, e.id, ai.from, k, s + 30);
      if (ai.route) { ai.next = nx; ai.turning = turning; }   // (a bus or a taxi keeps its way on)
      ai.reverseUntil = now + 0.5;                          // (backs off a little to pull out)
      ai.passBlk = blk ? blk.id : 0; ai.passUntil = now + 4;
      ai.howOut = 'lane';
      return true;
    }
  }
  // 2. this road's blocked: remembered for a while
  markBlocked(world, e.id);
  if (v.bus) { ai.howOut = 'round'; ai.roundUntil = now + 20; return false; }   // (round it on the other side when that's clear: goRound)
  // right behind something that won't move (a car left in the road, a breakdown, a wreck, a tow truck at work, two
  // drivers out having words): round it on the other side of the road when that's clear and nothing's coming, as anyone
  // would - the queue behind follows it round one by one. (It used to turn round, or with no room to - a narrow street, a
  // queue behind - wait for the clean-up, which never comes while someone's watching: The Yards by Northgate station,
  // a sedan four minutes behind an empty car, eight cars queued behind it.)
  // (along the lane, not the way the car happens to point: one that ended up nosed in at an angle behind a car in a kerb
  // bay - eased over for a siren - goes round it all the same)
  const la = laneHeading(world, v, e, s);
  if (blk && standing(world, blk) && !v.def.pedal && (v.lz || 0) < 0.3 && stripClear(world, v, blk, la, -(v.def.W / 2 + blk.def.W / 2 + 14), false)) { ai.howOut = 'round'; ai.roundUntil = now + 20; ai.roundA = la; world.goneRound = (world.goneRound || 0) + 1; return false; }
  if (e.oneway || (v.lz || 0) > 0.3) { ai.howOut = 'wait'; makeWay(world, v, blk); return false; }   // (no turning round on a one-way street or the highway)
  // 3. turn round and take another way (a taxi plans a new way to where it's going) - where there's room to; otherwise
  //    it waits its turn (roadends.js roomToTurn: not over the kerb into the shop fronts with the far lane blocked)
  if (!roomToTurn(world, v, e.id, ai.from)) { ai.howOut = 'wait'; world.turnsHeld = (world.turnsHeld || 0) + 1; makeWay(world, v, blk); return false; }
  const other = e.a === ai.from ? e.b : e.a, s2 = arcOn(net, e, other, 0, v);   // (where it is along the lane back)
  if (ai.route && v.taxi && rejoin(world, v, e, other, s2)) { /* (on its new way) */ }
  else { delete ai.route; enterEdge(world, v, e.id, other, 0, s2); }
  ai.passBlk = 0; ai.passUntil = 0;
  ai.howOut = 'turn';
  // round by a manoeuvre - forward and back on full lock, looking where it goes (roadends.js) - into the lane back (it
  // used to back off for a second and swing for the far lane: in a narrow street, round and round)
  if (!ai.route) startTurn(world, v, e.id, other, -1);
  else ai.reverseUntil = now + 1.1;
  return true;
}

// Nose to nose with a vehicle at work that wants to come this way - a tow truck pulling away with a car on its hook, an
// ambulance leaving a scene - with no way round it and no room to turn: it backs off down its lane, as far as there's
// room behind it, so the other can swing past (by Southside station a tow truck and the car on its hook stood across
// Magnolia Street for four minutes, a car nosed up to it from each side, nobody giving way).
export function makeWay(world, v, b) {   // (exported for the tests)
  if (!b || !b.ai || b.ai.kind === 'traffic' || Math.hypot(b.vx, b.vy) > 15 || !b.seats[0]) return;
  const toV = Math.atan2(v.y - b.y, v.x - b.x);
  if (Math.cos(b.a - toV) < 0.35) return;   // (it isn't headed this way: it's working, not leaving - round it, or wait)
  const room = roomBehind(world, v, 120);
  if (room < 24) return;
  v.ai.reverseUntil = world.time + Math.min(1.8, 0.4 + room / 70); v.ai.stuck = 0;
  world.madeWay = (world.madeWay || 0) + 1;
}

// something stopped in the road that won't move off by itself: nobody driving it, a wreck, a car that's given up, one
// pulled up after a rear-end, a police car or an ambulance or a tow truck at work
export function standing(world, b) {
  if (b.kind !== K.VEH || Math.hypot(b.vx, b.vy) > 12) return false;
  const drv = b.seats[0] && world.get(b.seats[0]);
  if (drv && drv.player) return false;
  return !!(b.wreckAt || b.dead || !b.ai || !drv || b.ai.kind !== 'traffic' || b.ai.parkIt || b.ai.incident);
}
// Round something stopped in the way, on whichever side is clear: the other side of the road, or (a siren only) up on
// the pavement. Called from driveToward with the speed the obstacles allow; returns { x, y, speed, ignore } to drive
// at instead, or null.
const PAVED = new Set([T.ROAD, T.BRIDGE, T.SIDEWALK, T.LOT, T.PLAZA]);
export function goRound(world, v, ai, speed, desired) {
  const now = world.time, r = ai.round;
  if (r) {
    const b = world.get(r.blk);
    if (!b || now > r.until) { ai.round = null; return null; }
    const c = Math.cos(r.a), s = Math.sin(r.a);
    const along = (v.x - b.x) * c + (v.y - b.y) * s;
    if (along > b.def.L / 2 + v.def.L / 2 + 8) { ai.round = null; return null; }   // past it: back to the route
    // (out beside its back corner first, then on past it: aimed straight past its front from behind, the line cut its
    // back corner and the car going round shoved it on up the street)
    const ahead = Math.min(Math.max(along + 80, -b.def.L / 2 - v.def.L * 0.8), b.def.L / 2 + v.def.L / 2 + 40);
    // (still behind it: slowly, so the swing out is tight - a corner clipping its bumper shoves it on up the street)
    const behind = along < -b.def.L / 2 - v.def.L / 2 + 20 && Math.abs((v.x - b.x) * -s + (v.y - b.y) * c) < Math.abs(r.off) - 12;
    return { x: b.x + c * ahead - s * r.off, y: b.y + s * ahead + c * r.off, speed: Math.min(desired, behind ? (v.siren ? 90 : 55) : v.siren ? 170 : 110), ignore: b.id };
  }
  const b = v._blk && world.get(v._blk);
  if (!b || b.kind !== K.VEH || speed > 40 || desired < 60 || Math.hypot(b.vx, b.vy) > 15 || after(world, ai, b)) { ai.roundT = 0; return null; }
  ai.roundT = (ai.roundT || 0) + 0.05;
  if (ai.roundT < (v.siren ? ROUND_S : ROUND_BUS_S)) return null;
  ai.roundT = 0;
  const a = !v.siren && ai.roundUntil > now && ai.roundA !== undefined ? ai.roundA : v.a, off0 = v.def.W / 2 + b.def.W / 2 + 14;
  // (nose right up to it with no room to back off for the swing out: not without a siren - the corner of its bumper
  // would catch the other's and shove it on up the street; the queue behind sorts itself out first)
  const gap0 = (b.x - v.x) * Math.cos(a) + (b.y - v.y) * Math.sin(a) - b.def.L / 2 - v.def.L / 2;
  const back0 = gap0 < v.def.L * 1.2 ? roomBehind(world, v, 90) : 0;
  if (!v.siren && gap0 + back0 < v.def.L * 0.8) { roomFromBehind(world, v, ai, v.def.L * 0.8 - gap0 - back0); return null; }
  for (const side of v.siren ? [-1, 1] : [-1]) {           // (-1: the other side of the road; 1: the kerb side, the pavement)
    if (!stripClear(world, v, b, a, side * off0, !!v.siren)) continue;
    if (!v.siren && oncoming(world, v, b, a, side * off0)) continue;   // (without a siren: only with nothing coming the other way)
    ai.round = { blk: b.id, off: side * off0, a, until: now + 8 };
    world.reroutes = (world.reroutes || 0) + 1;
    // nose right up to it: back off a little first, for the room to swing out (pulling out from a car's length or less
    // behind it, the corner of its bumper caught the other's and shoved it on up the street)
    const need = v.def.L * 1.2;
    if (gap0 < need) { const back = Math.min(need - gap0, back0); if (back > 8) { ai.reverseUntil = now + Math.min(1.4, 0.25 + back / 80); ai.stuck = 0; } }
    return goRound(world, v, ai, speed, desired);
  }
  return null;
}
// Nose up to what it's going round with the queue behind it right up to its bumper: no room to back off for the swing
// out, and the car behind it waits on it for good (it isn't jammed: it's about to go round) - the queue never sorted
// itself out (a compact 38 px behind a car left in the lane, a pickup 16 px behind it: stood there for good). So the car
// queued right behind it backs off a little, and it tries again as that one stops.
function roomFromBehind(world, v, ai, short) {
  const now = world.time;
  let f = null;
  for (const q of world.query(v.x, v.y, v.def.L + 120, K.VEH)) {
    if (q._blk !== v.id || !q.ai || q.ai.kind !== 'traffic' || q.ai.turn || q.ai.reverseUntil > now || Math.hypot(q.vx, q.vy) > 10 || !sameLevel(q.lz, v.lz)) continue;
    const drv = q.seats[0] && world.get(q.seats[0]);
    if (drv && drv.player) continue;
    f = q; break;
  }
  if (!f) return;
  const room = roomBehind(world, f, 96);
  if (room < 12) return;   // (it has the queue right behind it too: that one waits its turn)
  const back = Math.min(room, short + 16), dur = Math.min(1.4, 0.3 + back / 70);
  f.ai.reverseUntil = now + dur; f.ai.stuck = 0;
  ai.roundT = Math.max(0, ROUND_BUS_S - dur - 0.15);   // (and tries again as it stops)
  world.roomFromBehind = (world.roomFromBehind || 0) + 1;
}
// something coming the other way down the strip beside b that v would drive round it in (off px over), near enough to
// meet it before it's past: wait for it
function oncoming(world, v, b, a, off) {
  const c = Math.cos(a), s = Math.sin(a), mx = b.x - s * off, my = b.y + c * off;
  for (const q of world.query(mx + c * 300, my + s * 300, 420, K.VEH)) {
    if (q === v || q === b || !sameLevel(q.lz, v.lz) || (q.alt || 0) > FLY.HIGH) continue;
    const dx = q.x - mx, dy = q.y - my, along = dx * c + dy * s, lat = Math.abs(-dx * s + dy * c);
    if (along < -b.def.L || along > 720 || lat > v.def.W + 20) continue;
    if (Math.hypot(q.vx, q.vy) > 25 ? Math.cos(q.a - a) < 0.3 : along < 260) return true;   // (coming, or standing in the way)
  }
  return false;
}
// the police don't go round the car of the one they're after: they pull up behind it
function after(world, ai, b) {
  const tp = ai.target && world.players.get(ai.target), tid = tp && tp.ped ? tp.ped.id : ai.npcTarget;
  return !!tid && b.seats.includes(tid);
}
// the strip beside b at lateral offset `off`, from v to well past b: something to drive on, nothing solid, nobody in it
function stripClear(world, v, b, a, off, pavement) {
  const c = Math.cos(a), s = Math.sin(a), m = world.map;
  const from = (v.x - b.x) * c + (v.y - b.y) * s, to = b.def.L / 2 + v.def.L / 2 + 70;
  for (let t = from; t <= to + 160; t += 20) {
    for (const lat of [-v.def.W / 2 + 6, 0, v.def.W / 2 - 6]) {
      const x = b.x + c * t - s * (off + lat), y = b.y + s * t + c * (off + lat);
      if (t <= to) {
        const tt = m.tileAtPx(x, y);
        if (!(pavement ? PAVED.has(tt) : tt === T.ROAD || tt === T.BRIDGE)) return false;
        const k0x = Math.floor(x / 32), k0y = Math.floor(y / 32);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const arr = m.solidProps.get(m.idx(k0x + dx, k0y + dy));
          if (arr) for (const sp of arr) if (!sp.off && Math.hypot(sp.x - x, sp.y - y) < sp.r + 8) return false;
        }
      }
      if (lat) continue;
      for (const q of world.query(x, y, 40, K.VEH)) if (q !== v && q !== b && sameLevel(q.lz, v.lz) && !((q.alt || 0) > FLY.HIGH)) return false;   // (an aircraft overhead: not in the way)
      // nobody standing in it, and nobody lying anywhere under the car's width (a body, a downed player - task #435:
      // an ambulance went round a stopped car and over the casualty beside it)
      if (t <= to) for (const q of world.query(x, y, v.def.W / 2 + 22, K.PED)) {
        if (q.vehId || !sameLevel(q.lz, v.lz)) continue;
        if (q.dead ? !q.wild : Math.hypot(q.x - x, q.y - y) < 26) return false;
      }
    }
  }
  return true;
}
