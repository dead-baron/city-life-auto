// Trains: the railway. A fleet of trains runs one huge loop round the whole map - Westport,
// Granite Peaks, Northshore, Old Town, the fields of Dry Creek, Southside, Pine Hills, the core
// of Metro City, The Yards and Cedar Isle, over the bridges between the islands - all of it out
// in the open at grade, easing in and out of every open-air platform. Each platform has a clock
// counting down to the next train. Nothing stops them and nothing hurts them: a car on the line
// gets shoved along in front of the engine and blows up if it can't get off; people get thrown.
// Anyone can ride: players, NPC commuters (seated or standing), and cops who come aboard at the
// next station for a wanted passenger. Level crossings drop their gates when a train is coming;
// most drivers wait, a few gamble, and you can smash straight through the arms.
// The mail train carries a strongbox: the long run through Dry Creek is robbery country.
import { inAnyView } from '../view.js';
import { K, T } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { railAt, CONSIST, CAR_GAP, TRAIN_CARS, COACH_SEATS, COACH_STAND, LOCO_SEATS, LOCO_STAND, CAB_OX, MAIL_BOX, MAIL_POSTS, CROSSING_ARM, PED_BLOCK, isSwimming } from '../../shared/map.js';
import { obbVsObb, circleVsObb, localToWorld, clamp } from '../../shared/math.js';
import { TRAIN_SPEED, TRAIN_ACCEL, TRAIN_BRAKE, TRAIN_HEADWAY_S, TRAIN_DWELL_S, TRAIN_DRAG_EXPLODE_S, CROSSING_WARN_PX, TRAIN_JOB_PAY, STRONGBOX_CRACK_S, TRAIN_ALARM_STARS, MAIL_WARN_S, GUARD_DRAW_S, BAIL_SPEED } from '../../shared/rules.js';
import { STAR_HEAT } from '../../shared/constants.js';
import { KB, TOUCH } from '../../shared/controls.js';
import { mulberry32 } from '../../shared/rng.js';
import * as vehicles from './vehicles.js';
import * as combat from './combat.js';
import * as law from './law.js';
import * as safety from './safety.js';
import * as cargo from './cargo.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { FLY } from '../../shared/flight.js';   // (an aircraft up in the air: over all this, untouched)

const rng = mulberry32(8080);
const GAP = CAR_GAP;
const JERK = 150;          // how quickly the acceleration itself changes (px/s^3): smooth pull-away and stop
const HEADWAY_PX = 520;    // never closer than this to the back of the train ahead (block signalling)
const TIMING_STEP = 64;    // px between samples in the precomputed run-time tables (station clocks)
// every third train hauls the mail car
const consistFor = (i) => (i % 3 === 0 ? [...CONSIST.slice(0, -1), 'mail'] : CONSIST); // every third train hauls the mail car at the back
const CAR_IDX = { loco: 0, coach: 1, mail: 2 };
const WALK = 95, RUN = 150;
const POP_NEAR = 1500, POP_FAR = 2600;
const BOX_RESET_S = 300;
const ACTION_HINT = `${KB.action} (${TOUCH.action} on touch)`;
const COMMUTERS = ['casual', 'casual', 'executive', 'socialite', 'senior', 'athlete', 'construction', 'hustler'];

const mod = (a, n) => ((a % n) + n) % n;
// World v3's main line (map.rails: each service both ways, its own loop - shared/world3-rail.js): a train runs its
// loop (t.r); the signals (below: `signals`) keep the loops' trains apart where they share track or cross. Today's
// world has one loop (world.rails null): everything as it was.
const railOf = (world, t) => (world.rails ? world.rails[t.r] : world.map.rail);
const timingOf = (world, t) => (world.rails ? world.railTimings[t.r] : world.railTiming);
const off0 = (t) => !!t.r;   // (a train off the first loop: what reads the first loop's stations and crossings skips it)
const half = (c) => c.def.L / 2 - 12;
// how far forward you can walk in a car: the front car's cab is closed off behind its bulkhead
const fwdMax = (c) => (c.kind === 'loco' ? CAB_OX - 12 : half(c));
const seatsOf = (c) => (c.kind === 'loco' ? LOCO_SEATS : COACH_SEATS);
const standOf = (c) => (c.kind === 'loco' ? LOCO_STAND : COACH_STAND);
// a car people ride in (any but the mail car), at random
function anyCoach(t) {
  const k = Math.floor(rng() * (t.cars.length - (t.mail >= 0 ? 1 : 0)));
  return t.mail >= 0 && k >= t.mail ? k + 1 : k;
}

// ---- setup ------------------------------------------------------------------------------------
export function init(world) {
  world.trains = [];
  world.xing = [];
  world.rails = null;
  if (world.map.rails && world.map.rails.length > 1) { initLoops(world); return; }
  const rail = world.map.rail;
  if (!rail || !rail.stations || !rail.stations.length) return;   // (no railway: World v3's isn't laid yet)
  const sts = rail.stations;
  world.railTiming = buildTiming(rail);
  // As many trains as it takes for one to reach each station about every TRAIN_HEADWAY_S, spread
  // evenly round the timetable: train k starts at the station it would depart from k/n of the way
  // round, held there until its slot comes up.
  const T = world.railTiming, dep = [0];
  for (let i = 0; i < sts.length; i++) dep.push(dep[i] + T[i].total + TRAIN_DWELL_S); // dep[i]: leaves station i this long after leaving station 0
  const lap = dep[sts.length];
  const n = Math.max(3, Math.round(lap / TRAIN_HEADWAY_S));
  world.railLap = lap;
  for (let ti = 0; ti < n; ti++) {
    const cons = consistFor(ti);
    const phase = ti * lap / n;
    let si = dep.findIndex((d) => d >= phase);
    if (si < 0 || si >= sts.length) si = 0;
    const hold = Math.max(0.5, (si === 0 && phase > 0 ? lap : dep[si]) - phase);
    const cars = [];
    let off = 0;
    cons.forEach((kind, ci) => {
      const def = TRAIN_CARS[CAR_IDX[kind]];
      const e = world.add({ id: world.newId(), kind: K.TRAIN, x: 0, y: 0, a: 0, vx: 0, vy: 0, train: ti, car: ci, carType: CAR_IDX[kind], sub: false, cx: -1, cy: -1 });
      cars.push({ kind, def, off: off + def.L / 2, id: e.id });
      off += def.L + GAP;
    });
    const len = off - GAP;
    const t = {
      i: ti, cars, len, s: mod(sts[si].s + len / 2, rail.len), v: 0, acc: 0, stop: si, dwellUntil: world.time + hold,
      riders: new Set(), boarding: new Set(), mail: cons.indexOf('mail'), boxReadyAt: 0, hornUntil: 0, hornedFor: -1, hadPlayer: false,
    };
    world.trains.push(t);
    placeCars(world, t);
  }
  world.xing = rail.crossings.map(() => ({ down: false, eta: 99, closure: 0, broken: [0, 0] }));
}

// ---- World v3's main line: many loops, the signals -----------------------------------------------
// Each loop (a service one way) gets LOOP_TRAINS trains, spread round it at its stations. The loops share track (two
// services the same way along a segment) and cross at the junctions, so a train runs on the signals' word: the
// track is cut into 32 px cells (a train's footprint: its track and 24 px either side, so the two tracks of a double
// track, 96 px apart, never share a cell), and a train holds the cells under it and ahead of it as far as it could
// need to stop. It moves only onto cells it holds, so no two trains are ever on the same cell: none runs into
// another, none meets one head on. Where loops cross or part (a diamond, a turnout: cells another loop's track
// passes on another heading - a junction's `box`), a train takes the whole box and a train's length of clear track
// beyond it, or none of it: it never stops in a junction, so trains at a junction can't hold each other up for good.
const LOOP_TRAINS = 2;
function initLoops(world) {
  const rails = world.map.rails.filter((r) => r.stations && r.stations.length);
  if (!rails.length) return;
  world.rails = rails;
  world.railTimings = rails.map((r) => buildTiming(r));
  world.railTiming = world.railTimings[0];
  world.sig = { own: new Map(), cells: rails.map(cellsOfRail), box: null };
  world.sig.box = boxesOf(rails, world.sig.cells);
  let ti = 0;
  rails.forEach((rail, r) => {
    const sts = rail.stations, T = world.railTimings[r];
    for (let k = 0; k < LOOP_TRAINS; k++) {
      const cons = consistFor(ti);
      const cars = [];
      let off = 0;
      for (const kind of cons) { const def = TRAIN_CARS[CAR_IDX[kind]]; cars.push({ kind, def, off: off + def.L / 2 }); off += def.L + GAP; }
      const len = off - GAP;
      // at a station of its own k/LOOP_TRAINS of the way round, or the next one free (another loop's train may stand there)
      let placed = null;
      for (let tries = 0; tries < sts.length && !placed; tries++) {
        const si = (Math.floor(k * sts.length / LOOP_TRAINS) + tries) % sts.length;
        const t = { i: ti, r, cars, len, s: mod(sts[si].s + len / 2, rail.len), v: 0, acc: 0, stop: si, dwellUntil: world.time + 1 + k * TRAIN_HEADWAY_S / 2 + r * 3,
          riders: new Set(), boarding: new Set(), mail: cons.indexOf('mail'), boxReadyAt: 0, hornUntil: 0, hornedFor: -1, hadPlayer: false, held: null };
        if (signals(world, t, true) !== null) placed = t;
      }
      if (!placed) continue;
      cars.forEach((c, ci) => { const e = world.add({ id: world.newId(), kind: K.TRAIN, x: 0, y: 0, a: 0, vx: 0, vy: 0, train: ti, car: ci, carType: CAR_IDX[c.kind], sub: false, cx: -1, cy: -1 }); c.id = e.id; });
      world.trains.push(placed);
      placeCars(world, placed);
      ti++;
      void T;
    }
  });
  world.railLap = world.railTimings[0].reduce((a, q) => a + q.total + TRAIN_DWELL_S, 0);
  world.xing = (world.map.railXings || rails[0].crossings).map(() => ({ down: false, eta: 99, closure: 0, broken: [0, 0] }));
  // the tiles near the line, made now: every point of every loop - made by the first person near a track, in their
  // tick, it froze the server's first ticks with players spread over World v3 for a second or two (8.23.1)
  loopTiles(world);
}
const CELL = 32, FOOT = [-24, 0, 24];
// (World v3's subway lines below ground - their points `subway` - run a level deeper than the main line and its tunnels:
// cells of their own, so a subway train passes under a main line train, never into it - shared/world3-subway.js)
const DEEP = 1000000000;
function cellsOfRail(rail) {
  const P = rail.pts, n = P.length, out = new Int32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const p = P[k], q = P[(k + 1) % n], dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, lv = rail.subway && p.subway ? DEEP : 0;
    for (let j = 0; j < 3; j++) out[k * 3 + j] = lv + Math.floor((p.y + ny * FOOT[j]) / CELL) * 100000 + Math.floor((p.x + nx * FOOT[j]) / CELL);
  }
  return out;
}
// A loop's junction points: where another loop's track shares its cells on another heading or a few px aside (a
// diamond, a turnout) - not where two loops run the same track the same way. A loop that crosses itself (a World v3
// subway line round its loop in the middle: shared/world3-subway.js) has its own diamonds: its track far along it.
function boxesOf(rails, cells) {
  const byCell = new Map();
  rails.forEach((rail, r) => { const C = cells[r]; for (let k = 0; k < rail.pts.length; k++) for (let j = 0; j < 3; j++) { const c = C[k * 3 + j]; let a = byCell.get(c); if (!a) byCell.set(c, a = []); a.push(r, k); } });
  const dir = (P, k) => { const p = P[k], q = P[(k + 1) % P.length], l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return [(q.x - p.x) / l, (q.y - p.y) / l]; };
  return rails.map((rail, r) => {
    const P = rail.pts, n = P.length, C = cells[r], box = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      const [ux, uy] = dir(P, k);
      for (let j = 0; j < 3 && !box[k]; j++) {
        const a = byCell.get(C[k * 3 + j]);
        for (let m = 0; m < a.length && !box[k]; m += 2) {
          if (a[m] === r) { const d = Math.abs(a[m + 1] - k); if (Math.min(d, n - d) < 64) continue; }
          const Q = rails[a[m]].pts, q = Q[a[m + 1]], [vx, vy] = dir(Q, a[m + 1]);
          const side = Math.abs((q.x - P[k].x) * -uy + (q.y - P[k].y) * ux);
          if (ux * vx + uy * vy < 0.995 || side > 10) box[k] = 1;
        }
      }
    }
    return box;
  });
}
// The signals for train t: take the cells it may run onto; returns the gap for drive() (Infinity: clear ahead).
// At its placing (`place`): null if the cells under it are another train's.
function signals(world, t, place = false) {
  const rail = railOf(world, t), P = rail.pts, n = P.length, S = world.sig, own = S.own, C = S.cells[t.r], box = S.box[t.r];
  const free = (k) => { for (let j = 0; j < 3; j++) { const o = own.get(C[k * 3 + j]); if (o !== undefined && o !== t.i) return false; } return true; };
  const dist = (k) => mod(P[k].s - t.s, rail.len);
  const want = t.want || (t.want = []);   // (each train's own list and two sets, used again every tick: no garbage)
  want.length = 0;
  const iNose = railAt(rail, t.s).i;
  for (let k = railAt(rail, t.s - t.len - 24).i, g = 0; g < n; k = (k + 1) % n, g++) { want.push(k); if (k === iNose) break; }
  if (place && !want.every(free)) return null;
  const horizon = t.v * t.v / (2 * TRAIN_BRAKE) + HEADWAY_PX + 160;
  let gap = Infinity, k = (iNose + 1) % n;
  for (let g = 0; g < n && dist(k) < horizon; g++) {
    if (!box[k]) { if (!free(k)) { gap = dist(k); break; } want.push(k); k = (k + 1) % n; continue; }
    // a junction: all of it and a train's length of clear track beyond, or none of it
    const run = [];
    let j = k, last = k;
    for (let h = 0; h < n; h++, j = (j + 1) % n) {
      run.push(j);
      if (box[j]) last = j;
      else if (mod(P[j].s - P[last].s, rail.len) >= t.len + 64) break;
    }
    if (!run.every(free)) { gap = dist(k); break; }
    for (const q of run) want.push(q);
    k = (j + 1) % n;
  }
  const hold = t.spare || new Set();
  hold.clear();
  for (const q of want) for (let j = 0; j < 3; j++) hold.add(C[q * 3 + j]);
  if (t.held) for (const c of t.held) if (!hold.has(c) && own.get(c) === t.i) own.delete(c);
  for (const c of hold) own.set(c, t.i);
  t.spare = t.held; t.held = hold;
  return gap === Infinity ? Infinity : Math.max(0, gap - 64) + HEADWAY_PX;
}

// ---- driving ----------------------------------------------------------------------------------
// One tick of the drive, d px short of the next stop and gap px behind the train ahead: ease
// towards the speed the remaining distance allows, with the acceleration itself changing
// gradually - a smooth pull-away and a gentle stop at the platform. Returns how far it moved.
function drive(t, d, gap, dt) {
  // braking that stops the train exactly at the platform mark; it starts a touch early and eases on
  const aReq = (t.v * t.v) / (2 * Math.max(1, d - 2));
  if (aReq > TRAIN_BRAKE * 0.8) t.braking = true;
  let want = TRAIN_SPEED;
  if (gap < Infinity) want = Math.min(want, Math.sqrt(2 * TRAIN_BRAKE * Math.max(0, gap - HEADWAY_PX)));
  let accWant = clamp((want - t.v) * 1.6, -TRAIN_BRAKE * 1.5, TRAIN_ACCEL);
  if (t.braking) accWant = Math.min(accWant, -aReq);
  // jerk limit on easing in (pulling away, starting to brake); tracking the stop curve is exact
  if (t.braking && accWant < t.acc) t.acc = Math.max(accWant, t.acc - JERK * 4 * dt);
  else t.acc += clamp(accWant - t.acc, -JERK * dt, JERK * dt);
  t.v = clamp(t.v + t.acc * dt, 0, TRAIN_SPEED);
  if (d > 2 && t.v < 8 && gap > HEADWAY_PX) { t.v = 8; if (t.acc < 0) t.acc = 0; } // creep the last few metres in
  return Math.min(d, t.v * dt);
}

// Run time between each pair of stations, sampled along the way, from the same drive model the
// trains use - what the platform clocks count down with.
function buildTiming(rail) {
  const sts = rail.stations, out = [];
  for (let k = 0; k < sts.length; k++) {
    const D = mod(sts[(k + 1) % sts.length].s - sts[k].s, rail.len);
    const t = { v: 0, acc: 0, braking: false }, times = [0];
    let x = 0, time = 0;
    for (let guard = 0; guard < 20000 && D - x >= 1.5; guard++) {
      x += drive(t, D - x, Infinity, 0.05); time += 0.05;
      while (times.length * TIMING_STEP <= x) times.push(time);
    }
    out.push({ total: time, times });
  }
  return out;
}
function runTimeAt(seg, x) {
  const i = Math.floor(x / TIMING_STEP), f = x / TIMING_STEP - i;
  if (i >= seg.times.length - 1) return seg.total;
  return seg.times[i] + (seg.times[i + 1] - seg.times[i]) * f;
}

// ---- per tick ---------------------------------------------------------------------------------
// World v3's main line and subways run dozens of trains, most of them far from everyone (docs/WORLD-V3.md 8.23: 1.6 ms
// a tick with nobody on). A train no player is near (NEAR_PX from its nose and its tail - past what anyone sees, and
// past the people, traffic and animals round them - and no player aboard) runs as before - its drive, the signals, its
// stops: the timetable, the crossings and the trains round it go on as they did - but its cars aren't placed and what
// they'd do to what's round them (collisions, the horn, people stepping off the line, riders and boarders walking)
// waits until someone is near: the tick it is, its cars are placed first. Today's world's one loop runs as it did.
export const NEAR_PX = 6000;
export function nearSomeone(world, t) {
  if (!world.players.size) return false;
  if (playerAboard(world, t)) return true;
  const rail = railOf(world, t), a = railAt(rail, t.s), b = railAt(rail, t.s - t.len), r2 = NEAR_PX * NEAR_PX;
  for (const p of world.players.values()) {
    const q = p.ped;
    if (q && ((q.x - a.x) ** 2 + (q.y - a.y) ** 2 < r2 || (q.x - b.x) ** 2 + (q.y - b.y) ** 2 < r2)) return true;
  }
  return false;
}
export function update(world, dt) {
  if (!world.trains || !world.trains.length) return;
  const lazy = !!world.rails;   // (World v3's loops)
  for (const t of world.trains) {
    stepTrain(world, t, dt);
    if (lazy && !(t.near = nearSomeone(world, t))) continue;
    placeCars(world, t);
    stepRiders(world, t, dt);
    stepBoarding(world, t, dt);
    collide(world, t, dt);
    hornForCrossings(world, t);
  }
  stepStairs(world, dt);
  updateCrossings(world);
  if (world.tick % 4 === 1) keepPedsSafe(world);
  if (world.tick % 20 === 7) for (const t of world.trains) populate(world, t);
  if (world.tick % 20 === 13) gatherCommuters(world);
  if (world.tick % 20 === 11) world.broadcast({ e: 'tt', l: timetable(world) }); // the platform clocks
  stepCracking(world);
  updateJobs(world);
}

function stepTrain(world, t, dt) {
  const rail = railOf(world, t), sts = rail.stations, now = world.time;
  if (t.dwellUntil) {
    t.v = 0;
    if (now >= t.dwellUntil) { t.dwellUntil = 0; t.stop = (t.stop + 1) % sts.length; t.hornUntil = now + 0.9; departed(world, t); }
    return;
  }
  const target = sts[t.stop].s + t.len / 2;
  const d = mod(target - t.s, rail.len);
  let gap = Infinity; // to the back of the nearest train ahead
  if (world.rails) gap = signals(world, t);   // (World v3: the signals - the track ahead that's clear)
  else for (const u of world.trains) if (u !== t) gap = Math.min(gap, mod(u.s - u.len - t.s, rail.len));
  const step = drive(t, d, gap, dt);
  t.s = mod(t.s + step, rail.len);
  if (d - step < 1.5) { t.s = mod(target, rail.len); t.v = 0; t.acc = 0; t.braking = false; t.dwellUntil = now + TRAIN_DWELL_S; arrived(world, t); }
}

// Where the train someone rides will be in the next stretch (the art from the server bakes those chunks first - server/
// artcdn.js focus): points every `step` px along its line ahead of it, up to L px. [] when not on a train.
export function aheadOf(world, ped, L = 9000, step = 768) {
  if (!ped || !ped.onTrain) return [];
  const t = world.trains[ped.onTrain.t];
  if (!t) return [];
  const rail = railOf(world, t), out = [];
  if (!rail || !rail.len) return out;
  for (let d = step; d <= L; d += step) { const q = railAt(rail, t.s + d); out.push({ x: q.x, y: q.y }); }
  return out;
}

function carPose(rail, t, c) {
  const sc = t.s - c.off, h = c.def.L * 0.4;
  const f = railAt(rail, sc + h), b = railAt(rail, sc - h), m = railAt(rail, sc);
  return { x: (f.x + b.x) / 2, y: (f.y + b.y) / 2, a: Math.atan2(f.y - b.y, f.x - b.x), sub: m.under, ez: m.ez || 0 };
}

function placeCars(world, t) {
  const rail = railOf(world, t), now = world.time;
  const lit = world.clock.dark > 0.3;
  for (const c of t.cars) {
    const e = world.get(c.id);
    if (!e) continue;
    const q = carPose(rail, t, c);
    e.x = q.x; e.y = q.y; e.a = q.a;
    e.vx = Math.cos(q.a) * t.v; e.vy = Math.sin(q.a) * t.v;
    e.sub = q.sub;
    e.lz = q.ez; e.el = q.ez > 0.35;   // (up on the El - shared/world3-rail.js EL: over the street, out of its reach)
    e.doors = !!t.dwellUntil;
    e.horn = now < t.hornUntil;
    e.lit = lit || q.sub;
    e.boxGone = e.carType === 2 && now < t.boxReadyAt;
  }
}

export function carEntity(world, t, ci) { return world.get(t.cars[ci].id); }
export function trainOf(world, ped) { return ped && ped.onTrain ? world.trains[ped.onTrain.t] : null; }

// ---- riders -----------------------------------------------------------------------------------
const passable = (t, ci) => ci >= 0 && ci < t.cars.length;

// Move a rider along the train: dU backwards (towards the tail) and dO sideways. Walking past
// the end of a car takes you through the gangway into the next one - all the way up to the seats
// behind the front car's cab (never into the cab itself).
function walk(t, r, dU, dO) {
  let ox = r.ox - dU;
  const h = half(t.cars[r.c]);
  if (ox < -h && passable(t, r.c + 1)) { r.c++; ox = half(t.cars[r.c]); }
  else if (ox > h && passable(t, r.c - 1)) { r.c--; ox = -half(t.cars[r.c]); }
  const c = t.cars[r.c];
  r.ox = clamp(ox, -half(c), fwdMax(c));
  const w2 = c.def.W / 2 - 12;
  r.oy = clamp(r.oy + dO, -w2, w2);
}
const uOf = (t, r) => t.cars[r.c].off - r.ox; // distance back from the engine's nose

function stepRiders(world, t, dt) {
  const now = world.time;
  for (const id of t.riders) {
    const p = world.get(id);
    if (!p || p.removed || !p.onTrain || p.onTrain.t !== t.i) { t.riders.delete(id); continue; }
    const r = p.onTrain;
    if (p.npc && p.dead) world.bodies.delete(p); // no ambulance chases a moving train: carried off at the next stop
    if (p.npc && !p.dead && now >= p.downUntil && now >= p.stunUntil) npcRide(world, t, p, dt);
    const e = world.get(t.cars[r.c].id);
    const [x, y] = localToWorld(e.x, e.y, e.a, r.ox, r.oy);
    p.x = x; p.y = y; p.vx = e.vx; p.vy = e.vy; p.sub = e.sub; p.under = false; p.rollT = 0; p.tumbleUntil = 0; p.airUntil = 0;
    if (p.npc && !p.dead && r.la !== undefined) p.a = e.a + r.la;
    if (p.player && t.mail >= 0) mailWatch(world, t, p, r, now);
  }
}

// The mail car is off limits and its guards make that plain. Come up to its door (the back of the
// car in front of it) and they shout at you to stay out and draw on you; step inside anyway and
// they give you MAIL_WARN_S seconds to get out before they open fire. The HUD counts it down.
const MAIL_DOOR_PX = 70; // this close to the gangway into the mail car and the guards see you coming
const atMailDoor = (t, r) => t.mail > 0 && r.c === t.mail - 1 && r.ox < -half(t.cars[r.c]) + MAIL_DOOR_PX;
function guardsOf(world, t) {
  const out = [];
  if (t.mail < 0) return out;
  for (const id of t.riders) { const q = world.get(id); if (q && q.npc && q.npc.role === 'railguard' && !q.dead) out.push(q); }
  return out;
}
// a line shouted out loud: it hangs over the speaker's head for a moment
function shout(world, ped, text) { world.emit(ped.x, ped.y, { e: 'say', id: ped.id, x: ped.x, y: ped.y, text }); }
function mailWatch(world, t, p, r, now) {
  const inMail = r.c === t.mail, door = atMailDoor(t, r);
  const guards = guardsOf(world, t);
  const caller = guards.find((q) => q.onTrain.c === t.mail) || guards[0] || null;
  if (!inMail) { r.mailSince = 0; r.fireCalled = false; }
  // walked well away from the door: come back and they shout again
  if (!inMail && !door && r.doorWarned && (r.c !== t.mail - 1 || r.ox > -half(t.cars[r.c]) + MAIL_DOOR_PX + 50)) r.doorWarned = false;
  if (inMail && !r.mailSince) {
    r.mailSince = now; r.doorWarned = true;
    if (caller) {
      shout(world, caller, 'OUT! NOW, OR WE SHOOT!');
      world.notify(p.player, `MAIL CAR - the guards: "Authorised staff only! Get out or we shoot!" You have ${MAIL_WARN_S} seconds.`, 'bad');
    }
  } else if (door && !r.doorWarned && caller) {
    r.doorWarned = true;
    shout(world, caller, 'STAFF ONLY - STAY OUT!');
    world.notify(p.player, `The mail car is through that door. Its armed guards: "Authorised staff only - stay out!" Walk in and you have ${MAIL_WARN_S} seconds to get out before they shoot.`, 'warn');
  }
  if (inMail && caller && !r.fireCalled && now - r.mailSince > MAIL_WARN_S) { r.fireCalled = true; shout(world, caller, 'OPEN FIRE!'); }
  // the HUD: 'door' at the door, then the seconds left inside (0: they're shooting)
  const hot = guards.some((q) => q.npc.hostile === p.id);
  const w = !guards.length ? null : hot ? 0 : inMail ? Math.max(0, Math.ceil(MAIL_WARN_S - (now - r.mailSince))) : door ? 'door' : null;
  if (w !== (r.warnHud ?? null)) { r.warnHud = w; p.player.meDirty = true; }
}

function seatTaken(world, t, ci, ox, oy) {
  for (const id of t.riders) { const q = world.get(id); if (q && q.onTrain && q.onTrain.c === ci && Math.abs(q.onTrain.ox - ox) < 10 && Math.abs(q.onTrain.oy - oy) < 10) return true; }
  return false;
}
function freeSpot(world, t, ci, preferSeat) {
  const seats = seatsOf(t.cars[ci]), stand = standOf(t.cars[ci]);
  const lists = preferSeat ? [seats, stand] : [stand, seats];
  for (const list of lists) {
    const start = Math.floor(rng() * list.length);
    for (let k = 0; k < list.length; k++) { const [ox, oy] = list[(start + k) % list.length]; if (!seatTaken(world, t, ci, ox, oy)) return { ox, oy, seat: list === seats }; }
  }
  return null;
}

export function board(world, ped, t, ci, ox, oy, la) {
  if (ped.vehId) vehicles.ejectPed(world, ped, true);
  // a player getting on an empty train finds the usual crowd already aboard
  if (ped.player) { let n = 0; for (const id of t.riders) { const q = world.get(id); if (q && q.npc && q.npc.role === 'civ') n++; } if (n < 3) fillRiders(world, t); }
  if (ped.carrying) cargo.dropCrate(world, ped);
  if (ped.fishing && ped.player) ped.fishing = null;
  t.riders.add(ped.id);
  t.boarding.delete(ped.id);
  ped.onTrain = { t: t.i, c: ci, ox, oy, la };
  ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  if (ped.npc) ped.npc.boardTrain = null;
  if (ped.player) { ped.player.meDirty = true; world.emit(ped.x, ped.y, { e: 'door', x: ped.x, y: ped.y }); }
}

export function alight(world, ped, x, y) {
  const t = trainOf(world, ped);
  if (t) t.riders.delete(ped.id);
  ped.onTrain = null; ped.sub = false;
  ped.x = x; ped.y = y;
  world.place(ped);
  if (ped.player) { ped.player.meDirty = true; ped.player.crack = null; }
}

// Door on the side facing the platform (or a side you can step out onto).
function doorSide(world, t, ci, st) {
  const e = world.get(t.cars[ci].id);
  const nx = -Math.sin(e.a), ny = Math.cos(e.a);
  if (st && !st.under) return Math.sign((st.platform.x - e.x) * nx + (st.platform.y - e.y) * ny) || 1;
  for (const sd of [1, -1]) { const x = e.x + nx * sd * 56, y = e.y + ny * sd * 56; if (!PED_BLOCK[world.map.tileAtPx(x, y)]) return sd; }
  return 1;
}
function doorPoint(world, t, ci, side, out) {
  const e = world.get(t.cars[ci].id);
  const [x, y] = localToWorld(e.x, e.y, e.a, 0, side * (t.cars[ci].def.W / 2 + out)); // doors are mid-car
  return { x, y };
}
const stationAt = (world, t) => (t.dwellUntil ? railOf(world, t).stations[t.stop] : null);
// Standing anywhere along station st's platform (it follows the track, as long as a train).
export function onPlatformOf(world, st, x, y, rail = world.map.rail) {
  if (Math.abs(x - st.x) > st.half + 200 || Math.abs(y - st.y) > st.half + 200) return false;
  const mid = (st.inner + st.outer) / 2, reach = (st.outer - st.inner) / 2 + 40;
  for (let d = -st.half; d <= st.half; d += 24) {
    const q = railAt(rail, st.s + d);
    if (Math.hypot(q.x - Math.sin(q.a) * st.side * mid - x, q.y + Math.cos(q.a) * st.side * mid - y) < reach) return true;
  }
  return false;
}

// Step off at a station: onto the platform, or up the stairs to the street from the subway.
export function alightAtStation(world, t, ped) {
  const st = stationAt(world, t);
  if (!st) return false;
  if (st.under && st.kiosk && ped.npc) { // up the stairs and out onto the street
    const k = st.kiosk;
    alight(world, ped, k.deep.x, k.deep.y + (rng() - 0.5) * 10);
    walkStairs(world, ped, [k.top, k.out, exitPoint(world, k)], null);
    return true;
  }
  if (st.under && st.kiosk) { alight(world, ped, st.kiosk.out.x + (rng() - 0.5) * 10, st.kiosk.out.y + (rng() - 0.5) * 12); }
  else if (st.under) { const a = rng() * 6.28; alight(world, ped, st.platform.x + Math.cos(a) * 14, st.platform.y + Math.sin(a) * 14); }
  else {
    const ci = ped.onTrain.c, side = doorSide(world, t, ci, st), pt = doorPoint(world, t, ci, side, 22 + rng() * 12);
    alight(world, ped, pt.x, pt.y);
    if (ped.npc) { // out of the door, then away from the train onto the platform before going about their day
      const e = world.get(t.cars[ci].id), out = doorPoint(world, t, ci, side, 46 + rng() * 14), along = (rng() - 0.5) * 80;
      const n = ped.npc;
      n.state = 'wander'; n.until = world.time + 5; n.wx = out.x + Math.cos(e.a) * along; n.wy = out.y + Math.sin(e.a) * along;
    }
    return true;
  }
  if (ped.npc) { ped.npc.state = 'wander'; ped.npc.until = 0; ped.npc.wx = ped.x; ped.npc.wy = ped.y; }
  return true;
}

// Jump off a moving train: out of the door and tumbling along the ground.
function jumpOff(world, ped) {
  const t = trainOf(world, ped);
  const r = ped.onTrain;
  const e = world.get(t.cars[r.c].id);
  const side = doorSide(world, t, r.c, null);
  const nx = -Math.sin(e.a) * side, ny = Math.cos(e.a) * side;
  const [x, y] = localToWorld(e.x, e.y, e.a, r.ox, side * (t.cars[r.c].def.W / 2 + 14));
  alight(world, ped, x, y);
  // like bailing out of a car: barely moving you just step down, at a jog you tuck and roll
  // unhurt, at full speed the landing can break you
  if (t.v > BAIL_SPEED) vehicles.fling(world, ped, e.vx * 0.75 + nx * 120, e.vy * 0.75 + ny * 120, null, 'bail');
  else { ped.vx = nx * 60 + e.vx * 0.5; ped.vy = ny * 60 + e.vy * 0.5; }
}

// NPC behaviour on board: commuters sit or stand and glance around; spooked ones run down the
// train; cops hunt their suspect through the cars; the mail guards hold their posts, draw on
// anyone who comes up to the mail car's door, and shoot anyone still inside once their warning
// runs out (see mailWatch).
function npcRide(world, t, p, dt) {
  const n = p.npc, r = p.onTrain, now = world.time;
  if (n.role === 'cop' || n.role === 'railguard') {
    let target = n.target ? world.get(n.target) : null, warning = false;
    if (n.role === 'railguard') {
      // hostility is aimed at one person (who shot at the guards, or cracked the box), for as long
      // as they're aboard
      if (n.hostile) { const f = world.get(n.hostile); if (!f || f.dead || !f.onTrain || f.onTrain.t !== t.i) n.hostile = 0; }
      // a trespasser who walks back out of the mail car is let go - unless they're the one the
      // guards are after
      if (target && target.id !== n.hostile && (!target.onTrain || target.onTrain.c !== t.mail)) target = null;
      if (!target || target.dead || !target.onTrain || target.onTrain.t !== t.i) {
        target = n.hostile ? world.get(n.hostile) : null;
        if (!target) for (const id of t.riders) {
          const q = world.get(id);
          if (!q || !q.player || q.dead) continue;
          const inside = q.onTrain.c === t.mail;
          if (!inside && !atMailDoor(t, q.onTrain)) continue;
          if (inside && now - (q.onTrain.mailSince || now) > MAIL_WARN_S) { target = q; break; }
          // the warning: guns drawn and pointed at you, but no shots yet
          const aim = Math.atan2(q.y - p.y, q.x - p.x);
          p.aimUntil = now + 0.3; p.aimAngle = aim; r.la = aim - world.get(t.cars[r.c].id).a;
          n.aimId = q.id; n.aimT = now;
          warning = true;
        }
      }
    } else if (target && (target.dead || !target.player || target.player.wanted <= 0)) target = null;
    if (target && target.onTrain && target.onTrain.t === t.i) {
      // a guard who wasn't already covering you takes a moment to draw before the first shot
      if (n.drawId !== target.id) {
        n.drawId = target.id;
        n.fireAt = n.role === 'railguard' && !(n.aimId === target.id && now - (n.aimT || -9) < 0.5) ? now + GUARD_DRAW_S : now;
      }
      n.target = target.id;
      const du = uOf(t, target.onTrain) - uOf(t, r);
      const dist = Math.hypot(target.x - p.x, target.y - p.y);
      if (Math.abs(du) > 70 && (n.role === 'cop' || Math.abs(du) < 260)) { walk(t, r, Math.sign(du) * Math.min(Math.abs(du) - 60, RUN * dt), clamp((target.onTrain.oy - r.oy) * 0.2, -2, 2)); r.la = du > 0 ? Math.PI : 0; }
      if (dist < 300) {
        const aim = Math.atan2(target.y - p.y, target.x - p.x);
        p.aimUntil = now + 0.3; p.aimAngle = aim; r.la = aim - world.get(t.cars[r.c].id).a;
        if (now >= (n.fireAt || 0)) combat.tryAttack(world, p, aim);
      }
      return;
    }
    n.target = 0; n.drawId = 0;
    if (n.role === 'railguard' && n.post) { const du = (t.cars[n.post.c].off - n.post.ox) - uOf(t, r); if (Math.abs(du) > 4) walk(t, r, Math.sign(du) * Math.min(Math.abs(du), WALK * dt), clamp((n.post.oy - r.oy) * 0.2, -2, 2)); }
    if (!warning && now >= (n.lookAt || 0)) { r.la = (r.la || 0) + (rng() - 0.5) * 1.6; n.lookAt = now + 1.5 + rng() * 2.5; }
    return;
  }
  // commuters
  if (n.state === 'flee' || n.state === 'fight') {
    if (now > n.until) { n.state = 'wander'; return; }
    const away = (n.fx ?? p.x) - p.x, awayY = (n.fy ?? p.y) - p.y;
    const e = world.get(t.cars[r.c].id);
    const along = away * Math.cos(e.a) + awayY * Math.sin(e.a); // threat ahead (+) or behind (-)
    walk(t, r, along >= 0 ? RUN * dt : -RUN * dt, 0);
    r.la = along >= 0 ? Math.PI : 0;
    r.seat = false;
    return;
  }
  if (now >= (n.lookAt || 0)) {
    r.la = r.seat ? (r.ox < 0 ? 0 : Math.PI) + (rng() - 0.5) * 0.9 : rng() * 6.28;
    n.lookAt = now + 2 + rng() * 4;
  }
}

// ---- stations: who gets off, who gets on ------------------------------------------------------
function playerNear(world, x, y, r) { for (const p of world.players.values()) if (p.ped && !p.ped.dead && Math.hypot(p.ped.x - x, p.ped.y - y) < r) return true; return false; }
function playerAboard(world, t) { for (const id of t.riders) { const q = world.get(id); if (q && q.player) return true; } return false; }

function arrived(world, t) {
  const st = railOf(world, t).stations[t.stop];
  callWaiting(world, t, t.stop);
  const loco = world.get(t.cars[0].id);
  world.emit(loco.x, loco.y, { e: 'trainhorn', x: loco.x, y: loco.y, s: 1 });
  // the dead are carried off at the next stop
  for (const id of [...t.riders]) { const q = world.get(id); if (q && q.npc && q.dead) { t.riders.delete(id); world.bodies.delete(q); despawnNpc(world, q); } }
  if (!playerNear(world, st.platform.x, st.platform.y, POP_NEAR) && !playerAboard(world, t)) return;
  for (const id of [...t.riders]) {
    const q = world.get(id);
    if (!q || !q.npc || q.dead) continue;
    const n = q.npc;
    if (n.role === 'civ' && (q.onTrain.dest === t.stop || rng() < 0.15)) alightAtStation(world, t, q);
    else if (n.role === 'cop' && !n.target && rng() < 0.7) { alightAtStation(world, t, q); n.beat = true; }
  }
  // up from the platform: a few people off this train climb the stairs and come out on the street
  if (st.under && st.kiosk && playerNear(world, st.kiosk.out.x, st.kiosk.out.y, POP_NEAR) && world.npcCount + world.trafficCount <= world.npcBudget) {
    const k = st.kiosk, n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const q = spawnNpc(world, COMMUTERS[Math.floor(rng() * COMMUTERS.length)], k.deep.x, k.deep.y + (rng() - 0.5) * 8, 'civ');
      walkStairs(world, q, [k.top, k.out, exitPoint(world, k)], null, 0.6 + i * 1.4);
    }
  }
  // police come aboard for a wanted passenger
  for (const id of t.riders) {
    const q = world.get(id);
    if (!q || !q.player || q.dead || q.player.wanted <= 0 || law.soft(q.player)) continue;   // (a star from small crimes: nobody boards for that - stops.js)
    let cops = 0;
    for (const cid of t.riders) { const c = world.get(cid); if (c && c.npc && c.npc.role === 'cop' && !c.dead) cops++; }
    const want = Math.min(4, 1 + q.player.wanted) - cops;
    for (let k = 0; k < want; k++) {
      const ci = Math.floor(rng() * t.cars.length);
      const pt = st.under ? st.platform : doorPoint(world, t, ci, doorSide(world, t, ci, st), 20);
      const cop = spawnNpc(world, q.player.wanted >= 4 ? 'swat' : 'cop', pt.x, pt.y, 'cop');
      cop.weapon = q.player.wanted >= 4 ? 'pshotgun' : 'pistol';
      cop.npc.target = q.id; cop.npc.trainCop = true;
      board(world, cop, t, ci, 0, k % 2 ? 12 : -12, 0);
    }
    if (want > 0) world.notify(q.player, `Police boarding the train at ${st.name}!`, 'bad');
    break;
  }
  // new commuters walk up to the doors
  const n = Math.floor(rng() * 4);
  for (let k = 0; k < n; k++) {
    const ci = anyCoach(t);
    const arche = COMMUTERS[Math.floor(rng() * COMMUTERS.length)];
    if (st.under) { const spot = freeSpot(world, t, ci, true); if (!spot) continue; const q = spawnNpc(world, arche, st.platform.x, st.platform.y, 'civ'); board(world, q, t, ci, spot.ox, spot.oy, 0); q.onTrain.seat = spot.seat; q.onTrain.dest = pickDest(world, t); continue; } // came down the stairs
    const side = doorSide(world, t, ci, st);
    const pt = doorPoint(world, t, ci, side, 50 + rng() * 50);
    const e = world.get(t.cars[ci].id);
    const along = (rng() - 0.5) * 120;
    const x = pt.x + Math.cos(e.a) * along, y = pt.y + Math.sin(e.a) * along;
    if (PED_BLOCK[world.map.tileAtPx(x, y)] || inAnyView(world, x, y)) continue; // nobody pops up in front of a player
    const q = spawnNpc(world, arche, x, y, 'civ');
    q.npc.boardTrain = { t: t.i, c: ci, side };
    t.boarding.add(q.id);
  }
}

function departed(world, t) {
  const loco = world.get(t.cars[0].id);
  world.emit(loco.x, loco.y, { e: 'trainhorn', x: loco.x, y: loco.y, s: 1 });
  for (const id of t.boarding) { const q = world.get(id); if (q && q.npc) { q.npc.boardTrain = null; q.npc.state = 'wander'; q.npc.until = 0; } }
  t.boarding.clear();
}

function pickDest(world, t) { const n = railOf(world, t).stations.length; return (t.stop + 1 + Math.floor(rng() * (n - 1))) % n; }

// Commuters on the platform walk to the nearest door and step aboard.
function stepBoarding(world, t, dt) {
  if (!t.boarding.size) return;
  for (const id of t.boarding) {
    const q = world.get(id);
    if (!q || q.dead || q.removed || !q.npc || !q.npc.boardTrain) { t.boarding.delete(id); continue; }
    if (world.time < q.downUntil) continue;
    const bt = q.npc.boardTrain;
    const door = doorPoint(world, t, bt.c, bt.side, 6);
    const dx = door.x - q.x, dy = door.y - q.y, d = Math.hypot(dx, dy);
    if (d < 14) {
      const spot = freeSpot(world, t, bt.c, rng() < 0.7);
      if (!spot) { q.npc.boardTrain = null; q.npc.state = 'wander'; t.boarding.delete(id); continue; }
      board(world, q, t, bt.c, spot.ox, spot.oy, spot.seat ? (spot.ox < 0 ? 0 : Math.PI) : rng() * 6.28);
      q.onTrain.seat = spot.seat; q.onTrain.dest = pickDest(world, t);
      continue;
    }
    const sp = WALK * q.npc.speed * 1.1;
    q.vx = dx / d * sp; q.vy = dy / d * sp; q.a = Math.atan2(dy, dx);
    q.x += q.vx * dt; q.y += q.vy * dt;
  }
}

// Keep the trains peopled while someone is around to see them; empty them out when nobody is.
function populate(world, t) {
  let near = playerAboard(world, t), close = near;
  if (!near) for (const c of t.cars) { const e = world.get(c.id); if (playerNear(world, e.x, e.y, POP_FAR)) { near = true; if (playerNear(world, e.x, e.y, POP_NEAR)) close = true; break; } }
  if (!near) {
    for (const id of [...t.riders]) { const q = world.get(id); if (q && q.npc) { t.riders.delete(id); world.bodies.delete(q); despawnNpc(world, q); } }
    return;
  }
  if (playerAboard(world, t)) return; // nobody pops into existence in front of a passenger (with the roof off they'd see it) - new riders walk on at stations
  if (!close && t.riders.size) return;
  fillRiders(world, t);
}

// Seat commuters (and the mail guards) aboard a train until each coach has a few.
function fillRiders(world, t) {
  if (world.npcCount + world.trafficCount > world.npcBudget) return;
  for (let ci = 0; ci < t.cars.length; ci++) {
    if (ci === t.mail) {
      let guards = 0;
      for (const id of t.riders) { const q = world.get(id); if (q && q.npc && q.npc.role === 'railguard' && !q.dead && q.onTrain.c === ci) guards++; }
      for (let k = guards; k < MAIL_POSTS.length && world.time >= t.boxReadyAt - BOX_RESET_S + 60; k++) {
        const [ox, oy] = MAIL_POSTS[k];
        const e = world.get(t.cars[ci].id);
        const g = spawnNpc(world, 'cop', e.x, e.y, 'railguard');
        g.weapon = 'pistol'; g.app.tc = '#3a3a3e'; g.app.tc2 = '#d9a21b'; g.app.htc = '#3a3a3e';
        g.npc.post = { c: ci, ox, oy };
        board(world, g, t, ci, ox, oy, Math.PI);
      }
      continue;
    }
    let count = 0;
    for (const id of t.riders) { const q = world.get(id); if (q && q.npc && q.onTrain.c === ci) count++; }
    const want = 2 + Math.floor(rng() * 4);
    for (let k = count; k < want; k++) {
      const spot = freeSpot(world, t, ci, rng() < 0.75);
      if (!spot) break;
      const e = world.get(t.cars[ci].id);
      const q = spawnNpc(world, COMMUTERS[Math.floor(rng() * COMMUTERS.length)], e.x, e.y, 'civ');
      board(world, q, t, ci, spot.ox, spot.oy, spot.seat ? (spot.ox < 0 ? 0 : Math.PI) : rng() * 6.28);
      q.onTrain.seat = spot.seat; q.onTrain.dest = pickDest(world, t);
    }
  }
}

// ---- people waiting on the platforms -----------------------------------------------------------
// With a player close by, a few commuters turn up on the platform ahead of each train and stand
// waiting by the edge (or by the subway stairs); when it pulls in they walk to the doors and get
// on. They arrive from out of sight.
const WAIT_LEAD_S = 35;
function gatherCommuters(world) {
  if (world.rails) { world.rails.forEach((rail, r) => gatherAt(world, rail, r)); return; }   // (World v3: every loop's platforms)
  gatherAt(world, world.map.rail, -1);
}
// (a loop's waiting crowds are kept by r * 1000 + its station; today's one loop's by the station)
const waitKey = (r, si) => (r < 0 ? si : r * 1000 + si);
function gatherAt(world, rail, r) {
  const now = world.time;
  rail.stations.forEach((st, si) => {
    if (!playerNear(world, st.platform.x, st.platform.y, POP_NEAR)) return;
    world.waiting ??= new Map();
    const key = waitKey(r, si);
    const list = (world.waiting.get(key) || []).filter((id) => { const q = world.get(id); return q && !q.removed && !q.dead && q.npc && q.npc.waitTrain === key; });
    world.waiting.set(key, list);
    let eta = Infinity;
    if (r < 0) eta = nextTrainIn(world, si);
    else for (const t of world.trains) if (t.r === r) eta = Math.min(eta, etaTo(world, t, si));
    if (eta > WAIT_LEAD_S || list.length >= (st.kiosk ? 5 : 4) || world.npcCount + world.trafficCount > world.npcBudget) return;
    if (rng() > 0.35) return;
    // a spot to wait at, and somewhere out of sight to walk in from
    const spot = waitSpot(world, st, list.length, rail);
    let from = null;
    for (let k = 0; k < 10 && !from; k++) {
      const a = rng() * 6.28, r = 500 + rng() * 300, x = spot.x + Math.cos(a) * r, y = spot.y + Math.sin(a) * r;
      const tl = world.map.tileAtPx(x, y);
      if ((tl === T.SIDEWALK || tl === T.PLAZA) && !inAnyView(world, x, y)) from = { x, y };
    }
    if (!from) return;
    const q = spawnNpc(world, COMMUTERS[Math.floor(rng() * COMMUTERS.length)], from.x, from.y, 'civ');
    q.npc.waitTrain = key; q.npc.waitX = spot.x; q.npc.waitY = spot.y; q.npc.waitGiveUp = now + 150; q.npc.state = 'wander'; q.npc.keep = true;
    list.push(q.id);
  });
}
function waitSpot(world, st, n = 0, rail = world.map.rail) {
  if (st.under && st.kiosk) { const q = st.kiosk.queue[Math.min(n, st.kiosk.queue.length - 1)]; return { x: q.x, y: q.y + (rng() - 0.5) * 4 }; } // in line in the queue lane
  if (st.under) { const a = rng() * 6.28; return { x: st.platform.x + Math.cos(a) * 26, y: st.platform.y + Math.sin(a) * 26 }; }
  const q = railAt(rail, st.s + (rng() - 0.5) * st.half * 1.6);
  const off = 74 + rng() * 22; // (back from the edge: clear of the band a train sweeps)
  return { x: q.x - Math.sin(q.a) * st.side * off, y: q.y + Math.cos(q.a) * st.side * off };
}
// A train has pulled in at station si: whoever is waiting there gets on.
function callWaiting(world, t, si) {
  const st = railOf(world, t).stations[si];
  for (const id of (world.waiting && world.waiting.get(world.rails ? waitKey(t.r, si) : si)) || []) {
    const q = world.get(id);
    if (!q || q.dead || !q.npc || q.onTrain || Math.hypot(q.x - st.platform.x, q.y - st.platform.y) > st.half + 400) continue;
    q.npc.waitTrain = undefined; q.npc.keep = false;
    const ci = anyCoach(t);
    if (st.under && st.kiosk) { const k = st.kiosk; walkStairs(world, q, [k.out, k.top, k.deep], { t: t.i, c: ci }); continue; } // in at the mouth and down the steps
    if (st.under) { const spot = freeSpot(world, t, ci, true); if (!spot) continue; board(world, q, t, ci, spot.ox, spot.oy, 0); q.onTrain.seat = spot.seat; q.onTrain.dest = pickDest(world, t); continue; }
    q.npc.boardTrain = { t: t.i, c: ci, side: doorSide(world, t, ci, st) };
    t.boarding.add(q.id);
  }
}

// ---- subway stairs ----------------------------------------------------------------------------
// People going down into a subway kiosk or coming up out of it follow a short path (mouth, top
// step, bottom of the stairs) straight through the railings' opening. Going down, at the bottom
// they step onto the train if it's still in - else they're gone below to wait for the next one.
// Coming up, they walk out onto the street and go about their day.
function walkStairs(world, q, wp, ride, delay = 0) {
  q.npc.stairs = { wp, k: 0, ride, wait: world.time + delay };
  q.npc.waitTrain = undefined; q.npc.keep = !!ride;
  world.stairWalkers ??= new Set();
  world.stairWalkers.add(q.id);
}
function exitPoint(world, k) {
  const dir = k.flip ? 1 : -1;
  for (const r of [70, 110, 150]) {
    const x = k.out.x + dir * r, y = k.out.y + 50 + rng() * 30;
    if (!PED_BLOCK[world.map.tileAtPx(x, y)]) return { x, y };
  }
  return { x: k.out.x + dir * 40, y: k.out.y + 50 };
}
function stepStairs(world, dt) {
  if (!world.stairWalkers || !world.stairWalkers.size) return;
  for (const id of world.stairWalkers) {
    const q = world.get(id);
    const s = q && !q.removed && !q.dead && q.npc && q.npc.stairs;
    if (!s || q.onTrain || now(world) < (q.downUntil || 0)) { if (!s) world.stairWalkers.delete(id); continue; }
    if (world.time < s.wait) { q.vx = 0; q.vy = 0; continue; }
    const p = s.wp[s.k], dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
    if (d < 6) {
      if (++s.k < s.wp.length) continue;
      world.stairWalkers.delete(id);
      q.npc.stairs = null;
      if (!s.ride) {
        // out on the street: walk on away from the entrance (not straight back down into the stairwell)
        const a = s.wp[s.wp.length - 2] || s.wp[0], b = s.wp[s.wp.length - 1];
        q.npc.state = 'wander'; q.npc.until = 0; q.npc.wx = q.x; q.npc.wy = q.y; q.npc.keep = false; q.npc.awayFrom = Math.atan2(b.y - a.y, b.x - a.x);
        continue;
      }
      const t = world.trains[s.ride.t];
      const st = t && t.dwellUntil ? railOf(world, t).stations[t.stop] : null;
      const spot = st && st.kiosk ? freeSpot(world, t, s.ride.c, true) : null;
      if (spot) { board(world, q, t, s.ride.c, spot.ox, spot.oy, 0); q.onTrain.seat = spot.seat; q.onTrain.dest = pickDest(world, t); }
      else despawnNpc(world, q); // missed it: down on the platform, waiting for the next
      continue;
    }
    const sp = WALK * q.npc.speed * (s.k >= 2 ? 0.75 : 1); // steps slow you a little
    q.vx = dx / d * sp; q.vy = dy / d * sp; q.a = Math.atan2(dy, dx);
    const step = Math.min(sp * dt, d) / d; // (never past the waypoint: a quick walker would step back and forth over it)
    q.x += dx * step; q.y += dy * step;
    world.place(q);
  }
}
const now = (world) => world.time;

// ---- keeping people off the line ---------------------------------------------------------------
// Tiles within reach of the track map to their nearest track point, so "am I on the rails, and is
// a train coming?" is a lookup.
function railTiles(world) {
  if (world.railTileIdx) return world.railTileIdx;
  if (world.rails) return loopTiles(world);
  const idx = new Map(), pts = world.map.rail.pts;
  pts.forEach((p, i) => {
    if (p.under) return;
    const tx = Math.floor(p.x / 32), ty = Math.floor(p.y / 32);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const k = (ty + dy) * 100000 + tx + dx, cx = (tx + dx + 0.5) * 32, cy = (ty + dy + 0.5) * 32;
      const prev = idx.get(k);
      if (prev === undefined || Math.hypot(pts[prev].x - cx, pts[prev].y - cy) > Math.hypot(p.x - cx, p.y - cy)) idx.set(k, i);
    }
  });
  world.railTileIdx = idx;
  return idx;
}
// (World v3: each tile near the line -> the nearest point of every loop near it, as [loop, point] pairs: two loops on one
// track both, so a train of either is seen coming)
function loopTiles(world) {
  const idx = new Map();
  world.rails.forEach((rail, ri) => {
    const pts = rail.pts;
    pts.forEach((p, i) => {
      if (p.under) return;
      const tx = Math.floor(p.x / 32), ty = Math.floor(p.y / 32);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const k = (ty + dy) * 100000 + tx + dx, cx = (tx + dx + 0.5) * 32, cy = (ty + dy + 0.5) * 32;
        let a = idx.get(k);
        if (!a) idx.set(k, a = []);
        let j = 0;
        while (j < a.length && a[j] !== ri) j += 2;
        if (j === a.length) { a.push(ri, i); continue; }
        const q = pts[a[j + 1]];
        if (Math.hypot(q.x - cx, q.y - cy) > Math.hypot(p.x - cx, p.y - cy)) a[j + 1] = i;
      }
    });
  });
  world.railTileIdx = idx;
  return idx;
}
// (World v3's railThreat and railBlocked: each loop near (x, y), its trains)
function loopThreat(world, x, y, lookS, standing) {
  const a = railTiles(world).get(Math.floor(y / 32) * 100000 + Math.floor(x / 32));
  if (!a) return null;
  const now = world.time;
  for (let j = 0; j < a.length; j += 2) {
    const rail = world.rails[a[j]], p = rail.pts[a[j + 1]], q = rail.pts[(a[j + 1] + 1) % rail.pts.length];
    const ang = Math.atan2(q.y - p.y, q.x - p.x), nx = -Math.sin(ang), ny = Math.cos(ang);
    const off = (x - p.x) * nx + (y - p.y) * ny;
    if (Math.abs(off) > DANGER_PX + 16) continue;
    for (const t of world.trains) {
      if (t.r !== a[j]) continue;
      const wait = t.dwellUntil ? t.dwellUntil - now : 0;
      const over = mod(t.s - p.s, rail.len) < t.len + 30;
      const ahead = mod(p.s - t.s, rail.len);
      const coming = ahead < Math.max(320, t.v * lookS) && wait < 3;
      if ((over && (standing || t.v > 5 || wait < 3)) || coming) return { x: p.x, y: p.y, nx: nx * Math.sign(off || 1), ny: ny * Math.sign(off || 1), off, over };
    }
  }
  return null;
}
const DANGER_PX = 54; // within this of the track centre a passing train hits you
// Is (x, y) on the line with a train due? Returns the nearest track point and which side is
// closer to get off on, or null.
export function railThreat(world, x, y, lookS = 4.5, standing = false) {
  const rail = world.map.rail;
  if (!rail || !world.trains) return null;
  if (world.rails) return loopThreat(world, x, y, lookS, standing);
  const i = railTiles(world).get(Math.floor(y / 32) * 100000 + Math.floor(x / 32));
  if (i === undefined) return null;
  const p = rail.pts[i], q = rail.pts[(i + 1) % rail.pts.length];
  const a = Math.atan2(q.y - p.y, q.x - p.x), nx = -Math.sin(a), ny = Math.cos(a);
  const off = (x - p.x) * nx + (y - p.y) * ny;
  if (Math.abs(off) > DANGER_PX + 16) return null;
  const now = world.time;
  for (const t of world.trains) {
    if (off0(t)) continue;
    const wait = t.dwellUntil ? t.dwellUntil - now : 0;
    const over = mod(t.s - p.s, rail.len) < t.len + 30;           // the train is (or is about to be) right here
    const ahead = mod(p.s - t.s, rail.len);
    const coming = ahead < Math.max(320, t.v * lookS) && wait < 3; // ...or it's on its way
    if ((over && (standing || t.v > 5 || wait < 3)) || coming) return { x: p.x, y: p.y, nx: nx * Math.sign(off || 1), ny: ny * Math.sign(off || 1), off, over };
  }
  return null;
}
// Would walking straight from (x1, y1) to (x2, y2) take you into a train - one standing over that
// stretch of line, or one on its way? (NPCs picking where to walk: they go round, or along the
// platform, instead of into the train.) Coming closer to the track than the band a train sweeps, or
// crossing it, counts.
export function railBlocked(world, x1, y1, x2, y2) {
  const rail = world.map.rail;
  if (!rail || !world.trains || !world.trains.length) return false;
  if (world.rails) { for (let k = 1; k <= 8; k++) if (loopThreat(world, x1 + (x2 - x1) * k / 8, y1 + (y2 - y1) * k / 8, 4.5, true)) return true; return false; }
  const idx = railTiles(world), now = world.time;
  let prev = 0;
  for (let k = 1; k <= 8; k++) {
    const x = x1 + (x2 - x1) * k / 8, y = y1 + (y2 - y1) * k / 8;
    const i = idx.get(Math.floor(y / 32) * 100000 + Math.floor(x / 32));
    if (i === undefined) { prev = 0; continue; }
    const p = rail.pts[i], q = rail.pts[(i + 1) % rail.pts.length];
    const a = Math.atan2(q.y - p.y, q.x - p.x), off = (x - p.x) * -Math.sin(a) + (y - p.y) * Math.cos(a), sg = off < 0 ? -1 : 1;
    const into = Math.abs(off) < DANGER_PX || (prev && sg !== prev);
    prev = sg;
    if (!into) continue;
    for (const t of world.trains) {
      if (off0(t)) continue;
      const wait = t.dwellUntil ? t.dwellUntil - now : 0;
      if (mod(t.s - p.s, rail.len) < t.len + 30 || (mod(p.s - t.s, rail.len) < Math.max(320, t.v * 4.5) && wait < 3)) return true;
    }
  }
  return false;
}
// NPC pedestrians: step off the line when a train is coming - most of them. Now and then
// someone isn't paying attention (headphones in, looking at their phone) and doesn't notice.
const MISJUDGE = 0.06;
export function keepPedsSafe(world) {
  if (!world.trains || !world.trains.length) return;
  const now = world.time;
  for (const t of world.trains) {
    if (t.v < 5 && !(t.dwellUntil && t.dwellUntil - now < 3)) continue;
    if (world.rails && !t.near) continue;   // (nobody near it: nobody on the line ahead of it - update)
    const loco = world.get(t.cars[0].id);
    if (!loco || loco.sub || loco.el) continue;
    const reach = Math.max(400, t.v * 5) + t.len;
    for (const p of world.query(loco.x, loco.y, reach, K.PED)) {
      if (!p.npc || p.dead || p.vehId || p.onTrain || p.npc.boardTrain || p.npc.stairs || (p.lz || 0) > 0.3 || p.npc.role === 'cop') continue;
      if (now < (p.npc.railBlindUntil || 0) || now < p.downUntil) continue;
      const th = railThreat(world, p.x, p.y);
      if (!th) continue;
      if (p.npc.railRolled !== t.i * 1000 + Math.floor(now / 20)) { // one roll per train pass
        p.npc.railRolled = t.i * 1000 + Math.floor(now / 20);
        if (rng() < MISJUDGE) { p.npc.railBlindUntil = now + 6; continue; }
      }
      if (p.npc.state === 'flee' && p.npc.railFlee) continue;
      // the nearest spot clear of the train you can actually stand on: straight off on the near
      // side, else across to the far side
      let safe = null;
      for (const sd of [1, -1]) {
        for (let d = DANGER_PX + 14; d <= DANGER_PX + 70 && !safe; d += 14) {
          const x = th.x + th.nx * sd * d, y = th.y + th.ny * sd * d;
          if (!PED_BLOCK[world.map.tileAtPx(x, y)] && !isSwimming(world.map, { x, y, under: false })) safe = { x, y };
        }
        if (safe) break;
      }
      if (!safe) safe = { x: th.x + th.nx * (DANGER_PX + 30), y: th.y + th.ny * (DANGER_PX + 30) };
      p.npc.state = 'flee'; p.npc.railFlee = true; p.npc.railSafe = safe; p.npc.until = now + 2.5; p.npc.fleeBias = 0;
      p.npc.fx = th.x; p.npc.fy = th.y;
    }
  }
}

// ---- collisions: nothing stops a train --------------------------------------------------------
function collide(world, t, dt) {
  const now = world.time;
  for (let ci = 0; ci < t.cars.length; ci++) {
    const c = t.cars[ci], e = world.get(c.id);
    if (!e || e.sub || e.el) continue;
    const hl = c.def.L / 2, hw = c.def.W / 2;
    const ca = Math.cos(e.a), sa = Math.sin(e.a);
    for (const v of world.query(e.x, e.y, hl + 80, K.VEH)) {
      if ((v.lz || 0) > 0.3 || (v.alt || 0) > FLY.HIGH) continue; // up on the highway deck, over the line (or flying over it)
      if (v.removed || v.def.kind === 'boat' || v.sinkAt) continue;
      const lx = (v.x - e.x) * ca + (v.y - e.y) * sa, ly = -(v.x - e.x) * sa + (v.y - e.y) * ca;
      const rel = v.a - e.a, ext = Math.abs(Math.cos(rel)) * v.def.L / 2 + Math.abs(Math.sin(rel)) * v.def.W / 2;
      // caught on the nose (touching, or riding just in front of it): shoved straight ahead - a
      // fast train must not knock it aside
      const ahead = ci === 0 && lx > hl - 20 && Math.abs(ly) < hw && lx - ext <= hl + 6 && t.v > 15;
      const hit = ahead ? { nx: -ca, ny: -sa, depth: Math.max(0, hl + ext - lx) } : obbVsObb(e.x, e.y, e.a, hl, hw, v.x, v.y, v.a, v.def.L / 2, v.def.W / 2);
      if (!hit) continue;
      v.x -= hit.nx * hit.depth; v.y -= hit.ny * hit.depth;
      const closing = (v.vx - e.vx) * hit.nx + (v.vy - e.vy) * hit.ny; // >0: the train is running into it
      if (closing > 0) {
        const k = ahead ? 1.02 : 1.3;
        v.vx -= hit.nx * closing * k; v.vy -= hit.ny * closing * k;
        if (closing > 120) v.av += (ly >= 0 ? 1 : -1) * Math.min(2, closing / 260);
      }
      const dragging = ahead && now - (v.trainDragAt || -9) < 0.35;
      if (closing > 120 && !dragging && now > (v.trainHitAt || 0) + 0.5) {
        v.trainHitAt = now;
        world.emit(v.x, v.y, { e: 'crash', x: v.x, y: v.y, p: Math.min(1, closing / 400) });
        vehicles.damageVehicle(world, v, (closing - 90) * 0.2, null, true); // a hard knock - the drag is what finishes it
        if (v.def.kind === 'bike') for (const sid of [...v.seats]) { const q = sid && world.get(sid); if (q) { vehicles.ejectPed(world, q, true); vehicles.fling(world, q, v.vx, v.vy, null, 'train'); combat.damage(world, q, closing * 0.3, null, 'train'); } }
      }
      if (ahead) {
        if (v.wreckAt) { v.vx += -sa * (ly >= 0 ? 1 : -1) * 260 * dt * 10; v.vy += ca * (ly >= 0 ? 1 : -1) * 260 * dt * 10; continue; } // shove the burning wreck off the line
        v.trainDrag = now - (v.trainDragAt || -9) < 0.35 ? (v.trainDrag || 0) + dt : dt;
        v.trainDragAt = now;
        // pinned to the nose: it only comes free if someone at the wheel steers (and powers) it off
        if (Math.abs(v.input.throttle) < 0.3) {
          const lat = -v.vx * sa + v.vy * ca, latE = -e.vx * sa + e.vy * ca;
          v.vx -= -sa * (lat - latE); v.vy -= ca * (lat - latE);
          v.av *= 0.3;
        }
        vehicles.damageVehicle(world, v, v.def.hp * 0.09 * dt, null, true);
        if ((world.tick + v.id) % 4 === 0) world.emit(v.x, v.y, { e: 'spark', x: v.x, y: v.y });
        if (v.trainDrag >= TRAIN_DRAG_EXPLODE_S && !v.wreckAt) vehicles.explode(world, v, null);
        const d = v.seats[0] ? world.get(v.seats[0]) : null;
        if (d && d.player && now - (d.player.trainWarnAt || -9) > 2) { d.player.trainWarnAt = now; world.notify(d.player, 'You\'re being dragged by the train - steer off the tracks!', 'bad'); }
      }
    }
    // people: a train is solid whether it's moving or standing at a platform (nobody walks through it);
    // only a moving one hurts
    for (const p of world.query(e.x, e.y, hl + 30, K.PED)) {
      if ((p.lz || 0) > 0.3) continue;
      if (p.onTrain || p.vehId || p.hidden || isSwimming(world.map, p)) continue;
      const h = circleVsObb(p.x, p.y, p.r, e.x, e.y, e.a, hl, hw);
      if (!h) continue;
      p.x += h.nx * h.depth; p.y += h.ny * h.depth;
      if (p.dead || t.v < 1) continue;
      const closing = (e.vx - p.vx) * h.nx + (e.vy - p.vy) * h.ny;
      if (t.v > 50 && closing > 40 && now > (p.hitImmuneUntil || 0)) {
        p.hitImmuneUntil = now + 0.8;
        world.emit(p.x, p.y, { e: 'blood', x: p.x, y: p.y, a: e.a, n: 14 });
        world.emit(p.x, p.y, { e: 'crash', x: p.x, y: p.y, p: 0.6 });
        vehicles.fling(world, p, e.vx * 0.9 + h.nx * 230, e.vy * 0.9 + h.ny * 230, null, 'train', 0);
        combat.damage(world, p, 35 + t.v * 0.35, null, 'train', e.a);
      }
    }
  }
  // people on the line get out of the way (most of them)
  if (t.v > 60 && (world.tick + t.i) % 4 === 0) {
    const loco = world.get(t.cars[0].id);
    const ca = Math.cos(loco.a), sa = Math.sin(loco.a);
    for (const p of world.query(loco.x + ca * 260, loco.y + sa * 260, 260, K.PED)) {
      if ((p.lz || 0) > 0.3) continue;
      if (!p.npc || p.dead || p.vehId || p.onTrain || p.npc.role !== 'civ' || p.npc.state === 'flee') continue;
      const dx = p.x - loco.x, dy = p.y - loco.y, ly = -dx * sa + dy * ca;
      if (Math.abs(ly) > 50 || dx * ca + dy * sa < 0) continue;
      p.npc.state = 'flee'; p.npc.until = world.time + 2.5;
      p.npc.fx = p.x - (-sa) * (ly >= 0 ? 1 : -1) * 40; p.npc.fy = p.y - ca * (ly >= 0 ? 1 : -1) * 40;
    }
  }
}

// ---- level crossings ----------------------------------------------------------------------------
function updateCrossings(world) {
  const rail = world.map.rail, now = world.time, X = world.rails && world.map.railXings;
  (X || rail.crossings).forEach((c, i) => {
    const st = world.xing[i];
    let down = false, eta = 99;
    for (const t of world.trains) {
      // (World v3: a crossing is each loop's that uses it, at its own place along that loop)
      const u = X ? c.uses.find((q) => q[0] === t.r) : null;
      if (X ? !u : off0(t)) continue;
      const L = X ? world.rails[t.r].len : rail.len, cs = X ? u[1] : c.s;
      const ahead = mod(cs - t.s, L), behind = mod(t.s - cs, L);
      if (behind < t.len + 30) { down = true; eta = 0; continue; }
      if (ahead < CROSSING_WARN_PX) {
        const wait = t.dwellUntil ? t.dwellUntil - now : 0;
        if (wait > 3) continue; // standing at the platform: the gates ahead stay up until it's about to leave
        down = true;
        eta = Math.min(eta, wait + ahead / Math.max(80, t.v || 0));
      }
    }
    let changed = down !== st.down;
    if (down && !st.down) st.closure++;
    st.down = down; st.eta = eta;
    if (down) {
      const rx = -Math.sin(c.a), ry = Math.cos(c.a), tx = Math.cos(c.a), ty = Math.sin(c.a);
      for (const v of world.query(c.x, c.y, c.hw + 140, K.VEH)) {
        if ((v.lz || 0) > 0.3 || (v.alt || 0) > FLY.HIGH) continue;
        if (Math.abs(v.vx) + Math.abs(v.vy) < 40 || v.def.kind === 'boat') continue;
        const along = (v.x - c.x) * rx + (v.y - c.y) * ry, across = (v.x - c.x) * tx + (v.y - c.y) * ty;
        if (Math.abs(across) > c.hw + 6) continue;
        for (const side of [0, 1]) {
          const sg = side ? -1 : 1;
          if (st.broken[side] || Math.abs(along - sg * (c.arm || CROSSING_ARM)) > v.def.L / 2 + 4) continue;
          st.broken[side] = now; changed = true;
          const bx = c.x + rx * sg * (c.arm || CROSSING_ARM), by = c.y + ry * sg * (c.arm || CROSSING_ARM);
          world.emit(bx, by, { e: 'gatebreak', x: bx, y: by, a: Math.atan2(v.vy, v.vx) });
        }
      }
    } else if ((st.broken[0] && now - st.broken[0] > 40) || (st.broken[1] && now - st.broken[1] > 40)) {
      st.broken = st.broken.map((b) => (b && now - b > 40 ? 0 : b)); changed = true;
    }
    if (changed) world.broadcast({ e: 'xing', i, d: down ? 1 : 0, b: st.broken.map((b) => (b ? 1 : 0)) });
  });
}

export function crossingStates(world) { return (world.xing || []).map((s) => ({ d: s.down ? 1 : 0, b: s.broken.map((b) => (b ? 1 : 0)) })); }

function hornForCrossings(world, t) {
  if (t.v < 80) return;
  const rail = railOf(world, t);
  rail.crossings.forEach((c, i) => {
    const ahead = mod(c.s - t.s, rail.len);
    if (ahead < 620 && ahead > 200 && t.hornedFor !== i) {
      t.hornedFor = i; t.hornUntil = world.time + 1.6;
      const loco = world.get(t.cars[0].id);
      world.emit(loco.x, loco.y, { e: 'trainhorn', x: loco.x, y: loco.y, s: 2 });
    }
  });
}

// Drivers at level crossings. Each crossing is a box: the road's width along the track by the
// gate arms either side of it. A driver looks along the way they're actually going (their route
// through the junction, not just straight ahead) for crossings coming up:
//  * gates down: most stop at the line before the arm and stay stopped until the gates lift; a few
//    gamble (chasing cops far more often - and some of them misjudge it);
//  * gates up: they still won't roll onto the rails unless there's room to get all the way across
//    (a queue on the far side means wait at the line - nobody stops on the tracks).
// Returns a speed cap.
const XING_STEP = 16;
function drivePath(v, reach) {
  const out = [{ x: v.x, y: v.y, d: 0 }];
  let px = v.x, py = v.y, d = 0;
  const pts = v.ai && v.ai.pts && v.ai.pts.length ? v.ai.pts : [{ x: v.x + Math.cos(v.a) * reach, y: v.y + Math.sin(v.a) * reach }];
  for (const q of pts) {
    const len = Math.hypot(q.x - px, q.y - py);
    for (let k = XING_STEP; k <= len && d + k <= reach; k += XING_STEP) out.push({ x: px + (q.x - px) * k / len, y: py + (q.y - py) * k / len, d: d + k });
    d += len; px = q.x; py = q.y;
    if (d >= reach) break;
  }
  if (d < reach && pts.length) { const a = Math.atan2(py - (out[out.length - 2] || out[0]).y, px - (out[out.length - 2] || out[0]).x); for (let k = XING_STEP; d + k <= reach; k += XING_STEP) out.push({ x: px + Math.cos(a) * k, y: py + Math.sin(a) * k, d: d + k }); }
  return out;
}
function throughCrossing(path, c) {
  const tx = Math.cos(c.a), ty = Math.sin(c.a);
  let din = -1, dout = -1;
  for (const p of path) {
    const dx = p.x - c.x, dy = p.y - c.y;
    const inside = Math.abs(dx * tx + dy * ty) < c.hw + 16 && Math.abs(-dx * ty + dy * tx) < (c.arm || CROSSING_ARM);   // (World v3: a double track's crossing is wider)
    if (inside && din < 0) din = p.d;
    if (!inside && din >= 0) { dout = p.d; break; }
  }
  return din < 0 ? null : { din, dout: dout < 0 ? din + 2 * (c.arm || CROSSING_ARM) : dout };
}
function queueBeyond(world, v, path, from, len) {
  for (const p of path) {
    if (p.d < from || p.d > from + len) continue;
    for (const o of world.query(p.x, p.y, 40, K.VEH)) if (o !== v && !o.removed && Math.hypot(o.vx, o.vy) < 60 && (o.lz || 0) < 0.3) return true;
  }
  return false;
}
export function crossingLimit(world, v, fwd) {
  if (!world.xing || !world.xing.length) return Infinity;
  const rail = world.map.rail, xs = (world.rails && world.map.railXings) || rail.crossings;   // (World v3: every loop's)
  const reach = 320 + Math.max(0, fwd) * 0.8 + v.def.L / 2;
  let limit = Infinity, path = null;
  for (let i = 0; i < xs.length; i++) {
    const c = xs[i];
    if (Math.abs(c.x - v.x) > reach + c.hw + 80 || Math.abs(c.y - v.y) > reach + c.hw + 80) continue;
    path ??= drivePath(v, reach);
    const hit = throughCrossing(path, c);
    if (!hit) continue;
    const front = hit.din - v.def.L / 2;       // bumper to the edge of the crossing box
    if (front < 0) continue;                   // already on it: get across, never stop there
    const gap = front - 14;                    // ...and to the stop line
    const st = world.xing[i];
    if (!st.down) {
      if (queueBeyond(world, v, path, hit.dout, v.def.L + 30)) limit = Math.min(limit, Math.max(0, gap * 1.6));
      continue;
    }
    const key = i * 100000 + st.closure;
    if (v.xingKey !== key) {
      v.xingKey = key;
      if (gap < -6) v.xingGo = true;           // already past the line when the gates came down: clear the crossing
      else {
        const chasing = !!(v.ai && (v.ai.kind === 'police' || v.ai.kind === 'ems') && v.siren);
        const needS = (hit.din + 120) / Math.max(150, fwd, 1) + 0.8;
        const clear = st.eta > needS;
        v.xingGo = chasing ? (clear ? rng() < 0.85 : rng() < 0.3) : (clear ? rng() < 0.1 : rng() < 0.03);
      }
    }
    if (v.xingGo) continue;
    limit = Math.min(limit, Math.max(0, gap * 1.6)); // a driver who stopped stays stopped until the gates lift
  }
  return limit;
}

// ---- player interactions ------------------------------------------------------------------------
// What E does on or next to a train (null: nothing train-related here).
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || !world.trains) return null;
  const now = world.time;
  if (ped.onTrain) {
    const t = trainOf(world, ped), r = ped.onTrain;
    if (p.crack) return { label: `Cracking the strongbox... ${Math.ceil(p.crack.until - now)}s`, run: () => {} };
    if (r.c === t.mail && now >= t.boxReadyAt && Math.hypot(r.ox - MAIL_BOX.ox, r.oy - MAIL_BOX.oy) < 40) return { label: 'Crack the strongbox - Train robbery', crime: 'trainRobbery', run: () => startCrack(world, p, t) };
    const st = stationAt(world, t);
    if (st) return { label: st.under ? `Get off - up the stairs at ${st.name}` : `Get off at ${st.name}`, key: 'F', run: () => getOff(world, p) };
    return { label: 'Jump off the train', key: 'F', run: () => getOff(world, p) };
  }
  if (ped.vehId) {
    const v = world.get(ped.vehId);
    const hit = v && climbable(world, ped, v.x, v.y, Math.max(v.def.W / 2 + 40, 56), v.vx, v.vy);
    return hit ? { label: `Climb onto the ${carLabel(world, hit)}`, run: () => climbOn(world, ped, hit) } : null;
  }
  for (const t of world.trains) {
    const st = stationAt(world, t);
    if (!st) continue;
    if (st.under) {
      if (atEntrance(st, ped)) return { label: `Down the stairs - board the train at ${st.name}`, run: () => boardAtStation(world, ped, t, anyCoach(t)) };
      continue;
    }
    // anywhere on the platform counts: you walk to the nearest open door
    const onPlatform = onPlatformOf(world, st, ped.x, ped.y, railOf(world, t));
    let best = -1, bd = onPlatform ? Infinity : 140;
    for (let ci = 0; ci < t.cars.length; ci++) {
      if (ci === t.mail) continue;
      const d = doorPoint(world, t, ci, doorSide(world, t, ci, st), 14);
      const dd = Math.hypot(ped.x - d.x, ped.y - d.y);
      if (dd < bd) { bd = dd; best = ci; }
    }
    if (best >= 0) return { label: `Board the train - next stop ${railOf(world, t).stations[(t.stop + 1) % railOf(world, t).stations.length].name.replace(/ Station$/, '')}`, run: () => boardAtStation(world, ped, t, best) };
  }
  // at a subway entrance with no train in: the countdown, and where to wait
  const sts = world.map.rail.stations;
  for (let si = 0; si < sts.length; si++) {
    const st = sts[si];
    if (!st.kiosk || !atEntrance(st, ped)) continue;
    const eta = Math.max(1, Math.round(nextTrainIn(world, si)));
    const nxt = sts[(si + 1) % sts.length].name.replace(/ Station$/, '');
    return { label: `${st.name}: next train in ${Math.floor(eta / 60)}:${String(eta % 60).padStart(2, '0')} - wait in line, F when it's in (to ${nxt})`, run: () => {} };
  }
  const hit = climbable(world, ped, ped.x, ped.y, 48, ped.vx, ped.vy);
  return hit ? { label: `Hop onto the ${carLabel(world, hit)}`, run: () => climbOn(world, ped, hit) } : null;
}
const carLabel = (world, hit) => hit.t.cars[hit.ci].def.name.toLowerCase() + (hit.ci === hit.t.mail && guardsOf(world, hit.t).length ? ' - armed guards!' : '');

// In the queue lane, at the mouth or on the stairs of a subway stop's entrance.
function atEntrance(st, ped) {
  const k = st.kiosk;
  if (!k) return Math.hypot(ped.x - st.platform.x, ped.y - st.platform.y) < 80;
  const [lx0, ly0, lx1, ly1] = k.lane, [px0, py0, px1, py1] = k.pit;
  return (ped.x > lx0 - 12 && ped.x < lx1 + 12 && ped.y > ly0 - 16 && ped.y < ly1 + 16) || (ped.x > px0 && ped.x < px1 && ped.y > py0 - 8 && ped.y < py1 + 8);
}

// A car you could grab onto from here: close alongside and not much faster than you.
function climbable(world, ped, x, y, reach, vx, vy) {
  for (const t of world.trains) {
    for (let ci = 0; ci < t.cars.length; ci++) {
      const e = world.get(t.cars[ci].id);
      if (!e || e.sub || e.el || Math.hypot(e.x - x, e.y - y) > t.cars[ci].def.L / 2 + reach) continue;
      const ca = Math.cos(e.a), sa = Math.sin(e.a);
      const lx = (x - e.x) * ca + (y - e.y) * sa, ly = -(x - e.x) * sa + (y - e.y) * ca;
      if (Math.abs(lx) > half(t.cars[ci]) + 8 || Math.abs(ly) > t.cars[ci].def.W / 2 + reach) continue;
      if (Math.hypot(e.vx - vx, e.vy - vy) > 170) continue;
      return { t, ci, ox: clamp(lx, -half(t.cars[ci]), fwdMax(t.cars[ci])), oy: ly >= 0 ? 22 : -22 };
    }
  }
  return null;
}

function climbOn(world, ped, hit) {
  if (ped.vehId) vehicles.ejectPed(world, ped, true);
  board(world, ped, hit.t, hit.ci, hit.ox, hit.oy, 0);
  if (ped.player) world.notify(ped.player, hit.ci === hit.t.mail ? 'You\'re on the mail car!' : 'You climbed aboard. F to jump off.', 'info');
}

function boardAtStation(world, ped, t, ci) {
  if (!t.dwellUntil) return;
  const spot = freeSpot(world, t, ci, false) || { ox: 0, oy: 0 };
  board(world, ped, t, ci, spot.ox, spot.oy, 0);
  if (ped.player) world.notify(ped.player, `All aboard! Next stop ${railOf(world, t).stations[(t.stop + 1) % railOf(world, t).stations.length].name}. Walk through the cars; F gets you off.`, 'good');
}

export function getOff(world, p) {
  const ped = p.ped, t = trainOf(world, ped);
  if (!t) return;
  p.crack = null;
  if (t.dwellUntil) { alightAtStation(world, t, ped); return; }
  if (world.get(t.cars[ped.onTrain.c].id).sub) { world.notify(p, 'You\'re in the tunnel - the doors stay shut until the next station.', 'warn'); return; }
  if (world.get(t.cars[ped.onTrain.c].id).el && !stationAt(world, t)) { world.notify(p, 'You\'re up on the El - the doors stay shut until the next station.', 'warn'); return; }
  jumpOff(world, ped);
}

// Input while riding: walk around inside (and through to the next car), aim and shoot.
export function riderInput(world, p, ped, inp, pressed, dt) {
  const t = trainOf(world, ped);
  if (!t) { ped.onTrain = null; return; }
  if (pressed & IN.VEHICLE) { getOff(world, p); return; }
  if (pressed & IN.ACTION) { const act = interaction(world, p); if (act && safety.confirm(world, p, act.crime, act.label)) act.run(); if (!ped.onTrain) return; }   // (a crime: Safety mode asks first - safety.js)
  const now = world.time;
  const canMove = now >= ped.downUntil && now >= ped.stunUntil && !p.crack;
  const m = Math.hypot(inp.mx, inp.my);
  if (canMove && m > 0.1) {
    const e = world.get(t.cars[ped.onTrain.c].id);
    const sp = (inp.bits & IN.SPRINT ? RUN : WALK) * Math.min(1, m);
    const dx = inp.mx / Math.max(1, m) * sp * dt, dy = inp.my / Math.max(1, m) * sp * dt;
    const ca = Math.cos(e.a), sa = Math.sin(e.a);
    walk(t, ped.onTrain, -(dx * ca + dy * sa), -dx * sa + dy * ca);
    ped.a = Math.atan2(inp.my, inp.mx);
  }
  if (inp.bits & IN.FIRE) combat.tryAttack(world, ped, (inp.bits & IN.AIMING) ? inp.aim : ped.a);
  else if (inp.bits & IN.AIMING) ped.a = inp.aim;
}

// ---- the mail-car strongbox --------------------------------------------------------------------
function startCrack(world, p, t) {
  if (world.get(t.cars[t.mail].id).sub) { world.notify(p, 'Not in the tunnel - wait till you\'re out in the open.', 'warn'); return; }
  p.crack = { t: t.i, until: world.time + STRONGBOX_CRACK_S, t0: world.time };
  world.notify(p, 'Cracking the strongbox - stay with it!', 'warn');
  p.meDirty = true;
}

function stepCracking(world) {
  for (const p of world.players.values()) {
    if (!p.crack) continue;
    const ped = p.ped, t = world.trains[p.crack.t];
    if (!ped || ped.dead || !ped.onTrain || ped.onTrain.t !== t.i || ped.onTrain.c !== t.mail || Math.hypot(ped.onTrain.ox - MAIL_BOX.ox, ped.onTrain.oy - MAIL_BOX.oy) > 50) { p.crack = null; p.meDirty = true; continue; }
    if (world.time < p.crack.until) continue;
    p.crack = null; p.meDirty = true;
    crackOpen(world, p, t);
  }
}

export function onRuralRun(world, t) {
  const r = railOf(world, t).rural;
  if (!r) return false;
  const mid = mod(t.s - t.len / 2, railOf(world, t).len);
  return mid > r.s0 && mid < r.s1;
}

function crackOpen(world, p, t) {
  const ped = p.ped, now = world.time;
  t.boxReadyAt = now + BOX_RESET_S;
  const e = world.get(t.cars[t.mail].id);
  // heave it out of the door onto the ground beside the line
  let spot = null;
  for (const sd of [1, -1]) {
    const [x, y] = localToWorld(e.x, e.y, e.a, MAIL_BOX.ox, sd * (TRAIN_CARS[e.carType].W / 2 + 26));
    if (!PED_BLOCK[world.map.tileAtPx(x, y)] && !isSwimming(world.map, { x, y, under: false })) { spot = { x, y }; break; }
  }
  if (!spot) { const [x, y] = localToWorld(e.x, e.y, e.a, MAIL_BOX.ox - 40, 0); spot = { x, y }; }
  const job = p.job && p.job.type === 'trainjob';
  const crate = world.spawnCrate(3, spot.x, spot.y, { value: job ? TRAIN_JOB_PAY : Math.round(TRAIN_JOB_PAY / 2), contraband: true, label: 'Mail Strongbox' });
  crate.strongbox = p.pid;
  crate.vx = e.vx * 0.25; crate.vy = e.vy * 0.25;
  world.emit(spot.x, spot.y, { e: 'crash', x: spot.x, y: spot.y, p: 0.4 });
  p.profile.criminalExp = (p.profile.criminalExp || 0) + 10;
  if (job) { p.job.stage = 'grab'; p.job.crate = crate.id; }
  world.notify(p, 'The strongbox is out - it went over the side! Jump off, grab it and get it to a fence.', 'good');
  law.crime(world, ped, 'trainRobbery', null, ped.x, ped.y);
  if (!onRuralRun(world, t)) {
    // in town the alarm bell is heard for blocks: the police know
    world.notify(p, 'The mail-car alarm is ringing - in town, everybody heard it!', 'bad');
    const need = STAR_HEAT[TRAIN_ALARM_STARS] + 5 - p.heat;
    if (need > 0) law.addHeat(world, p, need, ped.x, ped.y);
    law.logDispatch(world, 'trainRobbery', ped.x, ped.y, p, p.wanted, 'alarm');
  }
  for (const q of guardsOf(world, t)) { q.npc.target = ped.id; q.npc.hostile = ped.id; }
}

// ---- the train-robbery job (offered by the fence) ----------------------------------------------
export function startTrainJob(world, p) {
  if (p.job) return 'You already have a job.';
  const t = world.trains.find((q) => q.mail >= 0);
  if (!t) return 'No mail train running.';
  p.job = { type: 'trainjob', stage: 'board', train: t.i, tx: 0, ty: 0, text: '', failOnDeath: false };
  world.notify(p, 'The mail train carries a strongbox. Get aboard (any station, or climb on from a car alongside), work back to the mail car and crack it - best out on the long run through the fields of Dry Creek, where nobody hears the alarm.', 'info');
  updateJobs(world);
  return null;
}

export function onFenced(world, p, crate) {
  if (!crate.strongbox || !p.job || p.job.type !== 'trainjob') return;
  p.job = null; p.meDirty = true;
  world.notify(p, 'Train job done - the strongbox is fenced.', 'good');
}

function updateJobs(world) {
  if (world.tick % 5) return;
  for (const p of world.players.values()) {
    const j = p.job;
    if (!j || j.type !== 'trainjob' || !p.ped) continue;
    const t = world.trains[j.train];
    const mail = world.get(t.cars[t.mail].id);
    const ped = p.ped;
    const crate = j.crate ? world.get(j.crate) : null;
    if (j.stage === 'grab' || j.stage === 'fence') {
      if (!crate || crate.removed) { p.job = null; world.notify(p, 'The strongbox is gone. Train job over.', 'bad'); p.meDirty = true; continue; }
      if (ped.carrying === crate.id || crate.state === 'loaded') {
        j.stage = 'fence';
        let best = null, bd = Infinity;
        for (const q of world.map.pois) if (q.kind === 'fence') { const d = Math.hypot(q.x - ped.x, q.y - ped.y); if (d < bd) { bd = d; best = q; } }
        j.text = 'Get the strongbox to a fence'; j.tx = best ? best.x : ped.x; j.ty = best ? best.y : ped.y;
      } else { j.stage = 'grab'; j.text = 'Grab the strongbox beside the tracks'; j.tx = crate.x; j.ty = crate.y; }
      continue;
    }
    if (ped.onTrain && ped.onTrain.t === t.i) {
      j.stage = 'crack';
      j.text = world.time < t.boxReadyAt ? 'Someone already cracked this one - the next box is loaded later' : onRuralRun(world, t) ? 'The Dry Creek run - crack the strongbox NOW' : 'Work back to the mail car - crack it out on the Dry Creek run';
    } else { j.stage = 'board'; j.text = 'Get aboard the mail train'; }
    j.tx = mail.x; j.ty = mail.y;
  }
}

// ---- HUD + station boards -----------------------------------------------------------------------
// Seconds until train t pulls in at station si (from the precomputed run times).
function etaTo(world, t, si) {
  const rail = railOf(world, t), sts = rail.stations, n = sts.length, T = timingOf(world, t), now = world.time;
  if (t.dwellUntil && t.stop === si) return 0;
  let eta, k;
  if (t.dwellUntil) { eta = Math.max(0, t.dwellUntil - now) + T[t.stop].total; k = (t.stop + 1) % n; }
  else {
    const prev = (t.stop - 1 + n) % n;
    eta = Math.max(0, T[prev].total - runTimeAt(T[prev], mod(t.s - (sts[prev].s + t.len / 2), rail.len)));
    k = t.stop;
  }
  for (let guard = 0; guard < n; guard++) {
    if (k === si) return eta;
    eta += TRAIN_DWELL_S + T[k].total; k = (k + 1) % n;
  }
  return eta;
}

// Debug: the train due next at the station nearest (x, y) is put straight in at its platform.
export function callTrain(world, x, y) {
  const rail = world.map.rail, sts = rail.stations;
  let si = 0, bd = Infinity;
  sts.forEach((st, i) => { const d = Math.hypot(st.platform.x - x, st.platform.y - y); if (d < bd) { bd = d; si = i; } });
  const st = sts[si];
  let t = null, best = Infinity;
  for (const u of world.trains) { if (off0(u)) continue; const d = mod(st.s + u.len / 2 - u.s, rail.len); if (d < best) { best = d; t = u; } }
  if (!t) return null;
  t.s = mod(st.s + t.len / 2, rail.len); t.v = 0; t.acc = 0; t.braking = false; t.stop = si; t.dwellUntil = world.time + TRAIN_DWELL_S * 3;
  if (world.rails) signals(world, t);   // (World v3: the signals' cells where it stands now)
  placeCars(world, t);
  return { t, st };
}

// (World v3: a station's map point stands for every loop that stops there - each loop's station of that name near it)
function loopStops(world, poi) {
  const out = [];
  world.rails.forEach((rail, r) => rail.stations.forEach((st, si) => { if (st.name === poi.label && (st.poi === poi.id || Math.hypot(st.platform.x - poi.x, st.platform.y - poi.y) < 700)) out.push([r, si]); }));
  return out;
}
// Seconds until the next train at station si (0: one is in now); on World v3's main line, at the station `poi` is.
export function nextTrainIn(world, si, poi = null) {
  if (!world.trains || !world.trains.length) return Infinity;
  let best = Infinity;
  if (world.rails && poi) { for (const [r, sj] of loopStops(world, poi)) for (const t of world.trains) if (t.r === r) best = Math.min(best, etaTo(world, t, sj)); return best; }
  for (const t of world.trains) if (!off0(t)) best = Math.min(best, etaTo(world, t, si));
  return best;
}

// Every station's clock: seconds until the next train (0 = one is at the platform now).
export function timetable(world) {
  if (!world.trains || !world.trains.length) return [];
  if (world.rails) return loopTimetable(world);   // (World v3: every loop's platforms)
  return world.map.rail.stations.map((_, si) => {
    let best = Infinity;
    for (const t of world.trains) if (!off0(t)) best = Math.min(best, etaTo(world, t, si));
    return Math.round(best);
  });
}

// (H33: World v3 - every loop's platform clocks, a list per loop: the next train of that loop at each of its stations)
function loopTimetable(world) {
  return world.rails.map((rail, r) => rail.stations.map((_, si) => {
    let best = Infinity;
    for (const t of world.trains) if (t.r === r) best = Math.min(best, etaTo(world, t, si));
    return best === Infinity ? -1 : Math.round(best);
  }));
}

export function stationBoard(world, poi) {
  if (world.rails) return loopBoard(world, poi);
  const si = poi.station, sts = world.map.rail.stations;
  const lines = world.trains.filter((t) => !off0(t)).map((t) => {
    const eta = etaTo(world, t, si);
    return { eta, text: `${t.mail >= 0 ? 'Mail train' : 'Commuter'}: ${eta < 1 ? 'AT THE PLATFORM - board now' : `${Math.round(eta)}s`}` };
  }).sort((a, b) => a.eta - b.eta).slice(0, 3).map((q) => q.text);
  if (sts[si].under) return { title: sts[si].name, sub: `Subway - when a train is in, take the stairs down: press ${ACTION_HINT} at the entrance. ${lines.join(' · ')}` };
  return { title: sts[si].name, sub: `Wait on the platform - when a train pulls in, walk up to its doors and press ${ACTION_HINT} to board. ${lines.join(' · ')}` };
}

// (World v3: the board lists every service stopping here, each way - the next three trains, where they're going)
function loopBoard(world, poi) {
  const lines = [];
  for (const [r, sj] of loopStops(world, poi)) {
    const rail = world.rails[r], to = rail.stations[(sj + 1) % rail.stations.length].name.replace(/ Station$/, '');
    for (const t of world.trains) {
      if (t.r !== r) continue;
      const eta = etaTo(world, t, sj);
      lines.push({ eta, text: `${rail.service || 'Train'} to ${to}: ${eta < 1 ? 'AT THE PLATFORM - board now' : `${Math.round(eta)}s`}` });
    }
  }
  const sub = lines.sort((a, b) => a.eta - b.eta).slice(0, 3).map((q) => q.text);
  return { title: poi.label, sub: `Wait on the platform for your service - when it pulls in, walk up to its doors and press ${ACTION_HINT} to board. ${sub.join(' · ')}` };
}

export function meInfo(world, p) {
  const ped = p.ped;
  if (!ped || !ped.onTrain) return null;
  const t = trainOf(world, ped), sts = railOf(world, t).stations;
  const e = world.get(t.cars[ped.onTrain.c].id);
  const next = t.dwellUntil ? sts[t.stop] : sts[t.stop];
  return {
    sub: !!e.sub, car: t.cars[ped.onTrain.c].kind, next: next.name, at: !!t.dwellUntil, eta: Math.round(etaTo(world, t, t.stop)),
    crack: p.crack ? Math.min(1, (world.time - p.crack.t0) / STRONGBOX_CRACK_S) : null, rural: onRuralRun(world, t),
    warn: ped.onTrain.warnHud ?? null, // the mail guards: 'door' (shouted at to stay out), seconds left to get out, 0 = shooting
  };
}

// test hooks (carPoses: where a train's cars are, placed or not - World v3's far trains' aren't: update)
export const __test = { arrived, carPoses: (world, t) => t.cars.map((c) => carPose(railOf(world, t), t, c)) };
