// NPC drivers are fallible, rarely and believably (the owner's notes, 11-03: "its good they stop for pedestrians (npc
// and players) but they still should run some people over sometimes, and if they stop suddenly the vehicle behind them
// might rear end them which sometimes might start a fight between the npc drivers but not always"). The numbers are
// shared/rules.js DRIVER_SLIPS.
//  - A miss (missPed, from traffic.js obstacleSpeed): a driver coming up on someone on foot in the road ahead - an NPC or
//    a player - is rolled once for that person: now and then it reacts late, and for a moment drives on as if they
//    weren't there (what happens then is the cars' own: vehicles.js strikePed, carhits.js). More likely when they step
//    out close in front, at night, in the rain, with a reckless driver; far less on a zebra crossing with the walk light.
//  - A rear-end (lateFor, from obstacleSpeed; noteBraking marks the hard stops): the car ahead brakes hard, and the
//    driver behind - by how attentive they are, and the road's wetness - is slow to react; if the gap it kept wasn't
//    enough, it runs into it (vehicles.js: the crash, its damage).
//  - After a rear-end between two of the city's drivers (bumped, from vehicles.js): mostly both drive on; sometimes
//    they pull up and get out to have words; now and then (their tempers: npc fight) it comes to blows - a fist fight,
//    a brawl the police come to as to any. Then they walk back, get in and go (update). The cars stand in the lane a
//    little while: the traffic behind treats them as a blockage (reroute.js jammed) and goes round.
//  - Never near a hospital, nor near a player who is down, nor to a player more than once in a while, nor to someone
//    lying in the road.
import { T, WEATHER } from '../../shared/constants.js';
import { DRIVER_SLIPS as S, BRAWL_AFTER_S } from '../../shared/rules.js';
import { signalFor } from '../../shared/signals.js';
import { zebraCrossings } from '../../shared/roads.js';
import { pedStep } from '../../shared/physics.js';
import { hash2 } from '../../shared/rng.js';
import { pointGrid } from '../pointgrid.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import * as npcM from './npc.js';
import * as vehM from './vehicles.js';
import * as policeM from './police.js';
import * as playersM from './players.js';
import * as trafficM from './traffic.js';


const count = (world, k) => { const s = (world.slips ??= {}); s[k] = (s[k] || 0) + 1; };
const lerp = (r, u) => r[0] + (r[1] - r[0]) * u;
// how attentive a driver is (0 .. 1): fixed per driver
export const attention = (d) => (d ? hash2(d.id | 0, 911, 3) : 0.5);
const driverOf = (world, v) => { const d = v.seats[0] && world.get(v.seats[0]); return d && d.npc ? d : null; };

// ---- where it may happen ------------------------------------------------------------------------------------------
// not near a hospital (where people wake up), nor near a player who is down or has just woken up (wherever: a home, a
// business, a hospital)
function calmAt(world, x, y) {
  const hs = world.map.hospitals || [];
  if (hs.length && pointGrid(hs).any(x, y, S.safeR)) return false;
  const now = world.time;
  for (const p of world.players.values()) {
    const q = p.ped;
    if (!q) continue;
    if ((q.dead || now < (q.downUntil || 0) || p.ghost || now - (q.spawnedAt ?? -1e9) < S.spawnS) && Math.hypot(q.x - x, q.y - y) < S.downR) return false;   // (down, or just woken up / come in)
  }
  return true;
}
// someone on a zebra crossing while it's theirs (the cars on that street have the red)
function onGreenCrossing(world, e) {
  const m = world.map, list = m._xingList || Object.defineProperty(m, '_xingList', { value: [...zebraCrossings(m).values()], enumerable: false })._xingList;
  if (!list.length) return false;
  for (const c of pointGrid(list).within(e.x, e.y, 0, 60)) {
    const ca = Math.cos(c.a), sa = Math.sin(c.a), dx = e.x - c.x, dy = e.y - c.y;
    if (Math.abs(dx * ca + dy * sa) > c.hl + 8 || Math.abs(-dx * sa + dy * ca) > c.hw + 6) continue;
    const n = m.nodes[c.node];
    if (n && signalFor(n, c.edge, world.loopTime) === 'R') return true;
  }
  return false;
}

// ---- a miss ----------------------------------------------------------------------------------------------------------
// In obstacleSpeed for each person on foot in the way of a traffic car (gap: px to them; fwd: its speed): true while the
// driver hasn't seen them.
export function missPed(world, v, e, gap, fwd) {
  const ai = v.ai, now = world.time;
  if (ai.missOf === e.id) { if (now < ai.missUntil) return true; return false; }
  if (ai.missRoll === e.id || !S.on) return false;
  ai.missRoll = e.id;   // (once per person per encounter: the next person, or this one again after someone else)
  if (fwd < S.minPx || (v.lz || 0) > 0.3 || e.dead || now < (e.downUntil || 0) || e.passedOut || e.crawl || e.hidden || (e.npc && (e.npc.state === 'crawl' || e.npc.state === 'passed'))) return false;
  const t = world.map.tileAtPx(e.x, e.y);
  if (t !== T.ROAD && t !== T.BRIDGE) return false;   // (on the pavement of a bend the box sweeps: never in its way)
  const pl = e.player;
  if (pl && (now < (e.protectUntil || 0) || now - (pl.slipAt ?? -1e9) < S.playerS)) return false;
  let p = S.missP;
  const stop = (fwd * fwd) / (2 * 480) + v.def.L;
  if (gap < stop) p *= S.close;
  if (world.clock.isNight) p *= S.night;
  if (world.weather === WEATHER.RAIN) p *= S.rain;
  const d = driverOf(world, v);
  if (ai.reckless || (d && (d.npc.fight || 0) > 0.85)) p *= S.reckless;
  count(world, 'missRolls');
  if (world.rand() >= p) return false;
  if (onGreenCrossing(world, e) && world.rand() >= S.crossing) return false;
  if (!calmAt(world, e.x, e.y)) return false;
  ai.missOf = e.id; ai.missUntil = now + lerp(S.lateS, world.rand());
  if (pl) pl.slipAt = now;
  count(world, 'misses');
  return true;
}

// ---- a rear-end ------------------------------------------------------------------------------------------------------
// Once a tick for a traffic car (steerTraffic): a hard stop is marked (v.hardBrakeAt) for the one behind
export function noteBraking(world, v) {
  const ai = v.ai, fwd = vehForwardSpeed(v), pf = ai.pf ?? fwd;
  ai.pf = fwd;
  if (pf > 60 && (pf - fwd) / 0.05 > S.hardDecel) v.hardBrakeAt = world.time;
}
// In obstacleSpeed for the vehicle b in the way of traffic car v: true while v's driver hasn't reacted to b's hard stop
export function lateFor(world, v, b, fwd) {
  const ai = v.ai, now = world.time;
  if (ai.lateOf === b.id) { if (now < ai.lateUntil) return true; ai.lateOf = 0; return false; }
  const hb = b.hardBrakeAt;
  if (!S.on || hb === undefined || now - hb > 0.2 || ai.rearRoll === hb || fwd < S.minRearPx || !b.ai || b.ai.kind !== 'traffic') return false;
  ai.rearRoll = hb;
  if (now - (ai.bumpAt ?? -1e9) < S.cooldownS) return false;
  const d = driverOf(world, v);
  let p = S.rearP * (1 + (S.inattentive - 1) * (1 - attention(d)));
  if (world.weather === WEATHER.RAIN) p *= S.wet;
  count(world, 'rearRolls');
  if (world.rand() >= p || !calmAt(world, v.x, v.y)) return false;
  ai.lateOf = b.id; ai.lateUntil = now + lerp(S.rearLateS, 1 - attention(d));
  count(world, 'lates');
  return true;
}

// ---- after a rear-end ------------------------------------------------------------------------------------------------
// vehicles.js, two vehicles that met hard enough to dent (impact px/s): if it's one of the city's drivers into the back
// of another, what they do about it
const LINES = {
  argue: ['Hey! Watch where you\'re going!', 'Are you blind?!', 'You stopped dead!', 'Look at my bumper!', 'Learn to drive!', 'You\'re paying for that!', 'It\'s a scratch, relax!', 'Who taught you to drive?'],
  fight: ['That\'s it!', 'You want some?!', 'Come on then!'],
};
export function bumped(world, a, b, impact) {
  if (!S.on || !a.ai || !b.ai || a.ai.kind !== 'traffic' || b.ai.kind !== 'traffic' || a.ai.incident || b.ai.incident) return;
  if (Math.abs(Math.atan2(Math.sin(a.a - b.a), Math.cos(a.a - b.a))) > 0.8) return;   // (not one into the back of the other)
  const ahead = (q, o) => (o.x - q.x) * Math.cos(q.a) + (o.y - q.y) * Math.sin(q.a) > 0;
  const f = ahead(a, b) ? a : ahead(b, a) ? b : null;
  if (!f) return;
  const l = f === a ? b : a, df = driverOf(world, f), dl = driverOf(world, l), now = world.time;
  if (!df || !dl || (f.lz || 0) > 0.3 || f.bus || l.bus || f.def.pedal || l.def.pedal) return;
  if (now - (f.ai.bumpAt ?? -1e9) < S.cooldownS || now - (l.ai.bumpAt ?? -1e9) < S.cooldownS) return;
  f.ai.bumpAt = now; l.ai.bumpAt = now;
  count(world, 'rearEnds');
  const temper = Math.max(df.npc.fight || 0, dl.npc.fight || 0);
  const r = world.rand(), pf = S.fight * (0.4 + 1.2 * temper);
  const kind = !calmAt(world, f.x, f.y) ? 'on' : r < pf ? 'fight' : r < pf + S.argue ? 'argue' : 'on';
  if (kind === 'on') { count(world, 'driveOn'); return; }
  count(world, kind === 'fight' ? 'fights' : 'argues');
  const inc = { kind, cars: [f.id, l.id], drivers: [df.id, dl.id], t0: now, phase: 'stop', until: now + 2.5, said: 0 };
  (world.slipIncidents ??= []).push(inc);
  for (const v of [f, l]) { v.ai.incident = inc; v.ai.lateOf = 0; v.ai.panicUntil = 0; }
  void impact;
}

// traffic.js steerTraffic: a car pulled up for an incident stands, on the brake
export function held(v) { return !!(v.ai && v.ai.incident); }

const walkTo = (world, q, x, y, dt, speed = 0.5) => {
  const dx = x - q.x, dy = y - q.y, d = Math.hypot(dx, dy) || 1, s = Math.min(1, d / 24);
  const mods = playersM.pedMods(world, q);
  mods.speedMul *= (q.npc.speed || 1) * speed;
  pedStep(q, { bits: 0, mx: (dx / d) * s, my: (dy / d) * s, aim: Math.atan2(dy, dx) }, dt, world.map, mods);
  return d;
};
const gone = (world, q) => !q || q.removed || q.dead || q.cuffed || q.custody || world.time < (q.downUntil || 0) && q.hp < q.maxHp * 0.2;

export function update(world, dt) {
  const L = world.slipIncidents;
  if (!L || !L.length) return;
  const now = world.time;
  for (let i = L.length - 1; i >= 0; i--) {
    const inc = L[i], cars = inc.cars.map((id) => world.get(id)), ds = inc.drivers.map((id) => world.get(id));
    const over = now - inc.t0 > S.maxS;
    if (inc.phase === 'stop') {
      // both pulled up: out they get (a car gone or wrecked meanwhile: it's off)
      if (cars.some((v) => !v || v.removed || v.wreckAt) || ds.some((q) => !q || q.dead)) { finish(world, inc, cars, ds); L.splice(i, 1); continue; }
      if (now < inc.until && cars.some((v) => Math.hypot(v.vx, v.vy) > 15)) continue;
      ds.forEach((q, k) => { if (q.vehId === cars[k].id) vehM.ejectPed(world, q, false); q.npc.driven = true; q.npc.state = 'idle'; q.npc.slip = true; q.npc.keep = true; });   // (keep: not tidied away by the crowd's clean-up while out of the car - npc.js manageDensity)
      inc.phase = 'meet'; inc.until = now + 6;
      continue;
    }
    if (inc.phase === 'meet' || inc.phase === 'argue') {
      if (ds.some((q) => gone(world, q))) { inc.phase = 'back'; inc.until = now + 20; continue; }
      const [p, q] = ds, d = Math.hypot(p.x - q.x, p.y - q.y);
      if (inc.phase === 'meet') {
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        if (d > 34 && now < inc.until) { for (const o of ds) walkTo(world, o, mx, my, dt); continue; }
        if (inc.kind === 'fight') {
          for (const [o, t] of [[p, q], [q, p]]) {
            o.npc.driven = false; o.weapon = 'fists'; o.npc.keep = true;
            npcM.startFight(world, o, t, lerp(S.fightS, world.rand()));
            npcM.markBrawl(world, o, now + S.fightS[1] + BRAWL_AFTER_S);
          }
          say(world, p, LINES.fight);
          if (world.rand() < S.police) policeM.callFight(world, inc.drivers, 5 + world.rand() * 6);
          inc.phase = 'fight'; inc.until = now + S.fightS[1] + 2;
        } else { inc.phase = 'argue'; inc.until = now + lerp(S.argueS, world.rand()); }
        continue;
      }
      // having words: face to face, a line now and then
      for (const [o, t] of [[p, q], [q, p]]) { o.vx = 0; o.vy = 0; o.a = Math.atan2(t.y - o.y, t.x - o.x) + Math.sin(now * 2 + o.id) * 0.2; }
      if (now - inc.said > 2.6) { inc.said = now; say(world, inc.said % 2 < 1 ? p : q, LINES.argue); }
      if (now > inc.until || over) { inc.phase = 'back'; inc.until = now + 20; }
      continue;
    }
    if (inc.phase === 'fight') {
      const end = now > inc.until || over || ds.some((q) => gone(world, q) || q.hp < q.maxHp * S.fightStopHp || (q.npc && q.npc.state !== 'fight'));
      if (!end) continue;
      for (const q of ds) if (q && !q.dead && q.npc) { q.npc.state = 'idle'; q.npc.target = 0; q.npc.driven = true; }
      inc.phase = 'back'; inc.until = now + 20;
      continue;
    }
    if (inc.phase === 'back') {
      // each to their own car and in; anyone who can't (down, arrested, gone) by maxS leaves theirs where it is
      let left = 0;
      ds.forEach((q, k) => {
        const v = cars[k];
        if (!v || v.removed || v.wreckAt) { if (q && q.npc) release(q); return; }
        if (q && q.vehId === v.id) return;
        left++;
        if (gone(world, q) || !q.npc || (q.npc.state === 'fight' && !q.npc.slip)) return;
        if (q.npc.state === 'fight') { q.npc.state = 'idle'; q.npc.target = 0; }
        q.npc.driven = true;
        if (now < (q.downUntil || 0) || now < (q.stunUntil || 0)) return;
        const side = v.def.W / 2 + 12, c = Math.cos(v.a), s = Math.sin(v.a), dx = v.x + s * side, dy = v.y - c * side;
        // (at the door - or near enough, and the time's up: a car left in the lane because its driver couldn't step
        // round the corner of it is a jam)
        const near = Math.hypot(q.x - v.x, q.y - v.y) < v.def.L / 2 + 30 || (now > inc.until && Math.hypot(q.x - v.x, q.y - v.y) < 400);
        if ((walkTo(world, q, dx, dy, dt, 0.6) < 26 || near) && !v.seats[0]) {
          q.vehId = v.id; q.seat = 0; v.seats[0] = q.id; q.x = v.x; q.y = v.y; q.lz = v.lz || 0; q.vx = 0; q.vy = 0;
          q.npc.driven = false; q.npc.role = 'driver'; q.npc.keep = false; q.npc.slip = false; q.npc.state = 'wander';
          if (v.ai) { v.ai.incident = null; v.ai.panicUntil = 0; trafficM.onLaneFromHere(world, v); if (v.ai) v.ai.replans = 0; }
          left--;
        }
      });
      if (!left || over || now > inc.until + 10) { finish(world, inc, cars, ds); L.splice(i, 1); }
    }
  }
}
function say(world, q, lines) { world.emit(q.x, q.y, { e: 'say', id: q.id, x: Math.round(q.x), y: Math.round(q.y), text: lines[Math.floor(world.rand() * lines.length)] }); }
function release(q) { q.npc.driven = false; q.npc.keep = false; q.npc.slip = false; if (q.npc.state !== 'fight') q.npc.state = 'wander'; }
// over: whoever's back in drives on; a car whose driver isn't is left for the clean-up (traffic.js manage) and the tow trucks
function finish(world, inc, cars, ds) {
  cars.forEach((v, k) => {
    const q = ds[k];
    if (!v || v.removed) { if (q && q.npc && !q.dead) release(q); return; }
    if (v.ai && v.ai.incident === inc) v.ai.incident = null;
    if (q && q.vehId === v.id) return;
    // (still about, on their feet and free: back in it - a car left in the lane over a bumper is a jam)
    if (q && q.npc && !q.dead && !q.cuffed && !q.custody && !q.removed && q.npc.state !== 'fight' && world.time >= (q.downUntil || 0) && !v.seats[0] && v.ai && Math.hypot(q.x - v.x, q.y - v.y) < 600) {
      if (q.vehId) vehM.ejectPed(world, q, false);
      q.vehId = v.id; q.seat = 0; v.seats[0] = q.id; q.x = v.x; q.y = v.y; q.lz = v.lz || 0; q.vx = 0; q.vy = 0;
      q.npc.driven = false; q.npc.role = 'driver'; q.npc.keep = false; q.npc.slip = false; q.npc.state = 'wander';
      v.ai.panicUntil = 0; trafficM.onLaneFromHere(world, v); if (v.ai) v.ai.replans = 0;
      return;
    }
    if (q && q.npc && !q.dead) release(q);
    if (v.ai && !v.seats[0]) { v.ai = null; v.despawnable = true; v.input = { throttle: 0, steer: 0, hb: true }; count(world, 'carsLeft'); }
  });
}
// vehicles.js strikePed: someone hit by a car whose driver hadn't seen them (counted: the misses that met someone)
export function noteStrike(world, v, ped) {
  if (v.ai && v.ai.missOf === ped.id && world.time < (v.ai.missUntil || 0) + 0.6) { v.ai.missUntil = 0; count(world, ped.player ? 'missHitsPlayer' : 'missHits'); }
}
