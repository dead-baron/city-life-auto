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
import { pointAt } from '../../shared/geom.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { sameLevel } from '../../shared/levels.js';
import { enterEdge } from './traffic.js';
import { rejoin } from './transit.js';

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
  if (bai.kind === 'traffic') return !!bai.jam;           // a queue: jammed if the car ahead of it is
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

function arcOn(e, from, v) {
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
    for (const q of world.query(p.x, p.y, 36, K.VEH)) if (q !== v && q !== blk && sameLevel(q.lz, v.lz)) return false;
  }
  return true;
}

function findWay(world, v) {
  const ai = v.ai, net = world.map.net, e = net.edges[ai.edge], now = world.time;
  if (!e) return false;
  const blk = v._blk ? world.get(v._blk) : null;
  const s = arcOn(e, ai.from, v);
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
  if (e.oneway || (v.lz || 0) > 0.3) { ai.howOut = 'wait'; return false; }   // (no turning round on a one-way street or the highway)
  // 3. turn round and take another way (a taxi plans a new way to where it's going)
  const other = e.a === ai.from ? e.b : e.a, s2 = Math.max(0, e.len - s);
  if (ai.route && v.taxi && rejoin(world, v, e, other, s2)) { /* (on its new way) */ }
  else { delete ai.route; enterEdge(world, v, e.id, other, 0, s2); }
  ai.reverseUntil = now + 1.1;
  ai.passBlk = 0; ai.passUntil = 0;
  ai.howOut = 'turn';
  return true;
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
    const ahead = Math.max(along + 80, b.def.L / 2 + v.def.L / 2 + 40);
    return { x: b.x + c * ahead - s * r.off, y: b.y + s * ahead + c * r.off, speed: Math.min(desired, v.siren ? 170 : 110), ignore: b.id };
  }
  const b = v._blk && world.get(v._blk);
  if (!b || b.kind !== K.VEH || speed > 40 || desired < 60 || Math.hypot(b.vx, b.vy) > 15 || after(world, ai, b)) { ai.roundT = 0; return null; }
  ai.roundT = (ai.roundT || 0) + 0.05;
  if (ai.roundT < (v.siren ? ROUND_S : ROUND_BUS_S)) return null;
  ai.roundT = 0;
  const a = v.a, off0 = v.def.W / 2 + b.def.W / 2 + 14;
  for (const side of v.siren ? [-1, 1] : [-1]) {           // (-1: the other side of the road; 1: the kerb side, the pavement)
    if (!stripClear(world, v, b, a, side * off0, !!v.siren)) continue;
    ai.round = { blk: b.id, off: side * off0, a, until: now + 8 };
    world.reroutes = (world.reroutes || 0) + 1;
    return goRound(world, v, ai, speed, desired);
  }
  return null;
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
          const arr = m.solidProps.get((k0y + dy) * m.w + k0x + dx);
          if (arr) for (const sp of arr) if (!sp.off && Math.hypot(sp.x - x, sp.y - y) < sp.r + 8) return false;
        }
      }
      if (lat) continue;
      for (const q of world.query(x, y, 40, K.VEH)) if (q !== v && q !== b && sameLevel(q.lz, v.lz)) return false;
      if (t <= to) for (const q of world.query(x, y, 26, K.PED)) if (!q.dead && !q.vehId && sameLevel(q.lz, v.lz)) return false;
    }
  }
  return true;
}
