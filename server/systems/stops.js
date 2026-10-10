// The 1-star police stop (task #405; the owner's note 2026-10-09: "At 1 star police pull up casually, investigate where it
// happened, walk up and talk; stand still for a warning or talk to them; run and they may or may not chase; outrun them
// too long and it becomes 2 stars (then aggressive). Tackling and hard arrests start at 2 stars; some officers try to
// arrest right away - variety by officer personality.")
// A star from small crimes (law.js smallCrime: p.soft) doesn't bring the chase. One officer deals with it: the one who
// saw it, or one walking a beat close by, on foot; else a police car is sent (police.js sendStopCar) - no siren, an easy
// pace - to the kerb nearest where it happened. There the officer gets out, walks over and looks round; once they see you
// (they know who they're looking for) they walk up and call out. Then:
//   - stand still by them, or talk (the action button), and they have a word: by their temper a warning (the star
//     cleared), a fine (STOP_FINE, cash then the bank) or now and then the cuffs - cuffed where you stand, no tackle
//     (custody.js from there). Having run from them first, the warning is less likely (STOP_RAN).
//   - walk off on them, run or drive off, and they call out: they come after you or let you go, by their temper
//     (STOP_CHASE). After you: out of their reach (or sight) for STOP_ESCALATE_S - half as fast while you keep moving on
//     their heels - and it's 2 stars, the usual chase, the officer with it. Stop and stand, and it's the word after all.
//   - a hothead goes for the arrest at once: a run, a dive or a grab (police.js tackleStep), you fight back (struggle.js).
// An officer's temper is theirs (temper: from their id, COP_TEMPER): laid back, by the book or a hothead. While the stop
// is on the star doesn't fade (law.js update); nobody found round the scene in STOP_LOOK_S and the officer leaves. Once
// they're done with you (let you go, gave up looking, no way through to you), the star fades, seen or not. There's no
// path finding on foot: an officer who can't get any nearer the scene looks round from where they are. The server
// decides all of it; clients show the officer's lines (speech bubbles: the 'say' event), the prompt to talk and the
// toasts.
//   world.stops: pid -> s { pid, seq (the star: p.softSeq), cop (ped id), car (veh id, 0: on foot), stage, at (when the
//     stage began), since (when the stop began), x, y (the scene, then where they were last seen), kerb / pulling (where
//     the car pulls up; braking for it), seenAt / lx, ly (where the officer last saw them), called (they called out),
//     awayT (walking off on them), ran, chase (came after you), outT (toward 2 stars), wp / wpAt (looking round) }
//   p.stop: the stop on them;  officer.npc.stop: the pid they're dealing with
// Stages: 'come' (on the way) -> 'look' (round the scene) -> 'walk' (up to you) -> 'talk' -> the verdict; 'run' (you went
// off: let go, or after you); 'hot' (a hothead: the arrest).
import { STAR_HEAT, K } from '../../shared/constants.js';
import { pedStep } from '../../shared/physics.js';
import { PED_BLOCK } from '../../shared/map.js';
import { hash2 } from '../../shared/rng.js';
import { COP_TEMPER, STOP_OUTCOME, STOP_RAN, STOP_FINE, STOP_CHASE, STOP_ESCALATE_S, STOP_LOOK_S } from '../../shared/rules.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as police from './police.js';
import * as players from './players.js';
import * as vehicles from './vehicles.js';
import * as struggle from './struggle.js';
import { nearestKerb } from './custody.js';
import { seek, footWay, sidestep, holding } from './npc.js';
import { driveToward, planRoute } from './traffic.js';

const TALK_PX = 58;       // close enough for a word (to someone in a car: half its width more)
const CALL_PX = 280;      // "Excuse me!" from this far
const SPOT_PX = 380;      // they know you when they see you this close (less out in the wilds: law.sightFactor)
const KERB_PX = 90;       // a car this close to its kerb pulls up (and the officer walks the rest)
const FOOT_PX = 650;      // an officer on foot this close (walking a beat) deals with it rather than a car being sent
const REACH_PX = 110;     // after you: further off than this (300 with a car either side), or out of sight, is out of reach
const STILL = 28;         // standing still: slower than this (px/s; you, or the car you're in)
const TALK_S = 2.8;       // the word before the verdict
const AWAY_S = 2.2;       // walking off on them this long, once they've called out: you're off
const MAX_S = 180;        // a stop that's gone on this long is over

const live = (world, id) => { const e = id ? world.get(id) : null; return e && !e.removed && !e.dead ? e : null; };
const say = (world, c, text) => world.emit(c.x, c.y, { e: 'say', id: c.id, x: Math.round(c.x), y: Math.round(c.y), text });
const wrecked = (v) => !v || v.removed || v.wreckAt || v.dead || v.sinkAt;

// An officer's temper (the same for the same officer, hashed from their id): 'easy' (a word, mostly a warning), 'book' (by
// the book: mostly a fine) or 'hot' (goes for the arrest at once). npc.temper overrides it (the tests).
export function temper(c) {
  if (c.npc && c.npc.temper) return c.npc.temper;
  const r = hash2(c.id, 53, 405);
  return r < COP_TEMPER.easy ? 'easy' : r < COP_TEMPER.easy + COP_TEMPER.book ? 'book' : 'hot';
}

// police.js dispatch, every second, for a player on a star from small crimes: the stop, and an officer for it
export function ensure(world, p) {
  let s = world.stops && world.stops.get(p.pid);
  if (s && s.seq !== p.softSeq) { end(world, s); s = null; }
  if (!s) {
    if (p.stopDone === p.softSeq || !p.stopAt || !p.ped) return;   // (this star's stop is over: it fades)
    s = open(world, p, p.stopAt.x, p.stopAt.y);
    const c = onFoot(world, p, p.stopAt.by);
    if (c) { assign(s, c); if (world.map.los(c.x, c.y, p.ped.x, p.ped.y) && Math.hypot(c.x - p.ped.x, c.y - p.ped.y) < SPOT_PX) stage(world, s, c, 'walk'); }
  }
  if (!s.cop) {   // (a car: tried again every second till one can come)
    const v = police.sendStopCar(world, p, s.x, s.y), c = v && live(world, v.seats[0]);
    if (c) { s.car = v.id; assign(s, c); }
  }
}
// A unit that found the suspect of a small crime a player called in (police.js runCallUnit): it's theirs to have a word
export function take(world, p, v) {
  if (world.stops && world.stops.get(p.pid)) end(world, world.stops.get(p.pid));
  const c = live(world, v.seats[0]);
  if (!c || !p.ped) return;
  const s = open(world, p, p.ped.x, p.ped.y);
  s.car = v.id; v.ai.stop = p.pid; v.sirenOn = false;
  assign(s, c);
}
function open(world, p, x, y) {
  const now = world.time, s = { pid: p.pid, seq: p.softSeq, cop: 0, car: 0, stage: 'come', at: now, since: now, x, y, kerb: null, seenAt: -99, lx: x, ly: y, outT: 0, awayT: 0 };
  (world.stops ??= new Map()).set(p.pid, s);
  p.stop = s;
  return s;
}
function assign(s, c) { s.cop = c.id; c.npc.stop = s.pid; c.npc.keep = true; }
// The officer who saw it, if they're on foot and free (walking a beat) - else the nearest such officer close by
function onFoot(world, p, by) {
  const free = (c) => !!c && !c.dead && !c.removed && !c.vehId && !c.sub && !c.ug && !c.onTrain && !c.pinning && c.npc && c.npc.role === 'cop' && c.npc.beat
    && !c.npc.unit && !c.npc.stop && !c.npc.pursue && !c.npc.war && !c.npc.desk && !c.npc.trainCop && !holding(world, c);
  const w = by ? world.get(by) : null;
  if (free(w)) return w;
  let best = null, bd = FOOT_PX;
  for (const c of world.query(p.ped.x, p.ped.y, FOOT_PX, K.PED)) {
    const d = Math.hypot(c.x - p.ped.x, c.y - p.ped.y);
    if (d < bd && free(c)) { bd = d; best = c; }
  }
  return best;
}

// Over: the officer back to their car (police.js: the unit stands down and drives off) or back to their beat. hunt: it's
// 2 stars now - the car's unit after them (runUnit), or the officer on foot with no car after them himself (police.js
// pursue). No other stop for the same star.
export function end(world, s, hunt = false) {
  if (world.stops && world.stops.get(s.pid) === s) world.stops.delete(s.pid);
  const p = world.players.get(s.pid);
  if (p) { if (p.stop === s) p.stop = null; p.stopDone = s.seq; }
  const c = live(world, s.cop), v = s.car ? world.get(s.car) : null;
  if (c && c.npc && c.npc.stop === s.pid) { c.npc.stop = 0; c.npc.keep = false; }
  if (v && v.ai && v.ai.stop === s.pid) {
    v.ai.stop = 0;
    if (hunt) { v.ai.mode = c && c.vehId === v.id ? 'drive' : 'foot'; v.ai.footAt = world.time; v.sirenOn = true; }
  } else if (hunt && c && !c.vehId && c.npc && c.npc.role === 'cop' && p && p.ped) police.pursue(world, c, p.ped);
}

// ---- every tick (police.js update) ----------------------------------------------------------------------------------------
export function run(world, s, dt) {
  const p = world.players.get(s.pid), now = world.time;
  if (!p || p.stop !== s) { end(world, s); return; }
  const t = p.ped;
  if (!t || t.dead || t.removed || p.custody) { end(world, s); return; }
  if (!law.soft(p) || p.softSeq !== s.seq) { end(world, s, p.wanted >= 2); return; }   // (cleared - or 2 stars: the chase, the officer with it)
  if (now - s.since > MAX_S) { end(world, s); return; }
  if (!s.cop) return;   // (no officer yet: one's being sent - ensure)
  const c = live(world, s.cop);
  if (!c || c.npc.role !== 'cop') { end(world, s); return; }   // (killed, gone, their car taken off them)
  const tv = t.vehId ? world.get(t.vehId) : null;
  const d = Math.hypot(t.x - c.x, t.y - c.y);
  // (down a manhole, in the subway, indoors at home: out of their sight)
  const sees = !t.hidden && !!t.sub === !!c.sub && (t.ug || 0) === (c.ug || 0) && d < SPOT_PX * law.sightFactor(world.map, t.x, t.y, !tv) && world.map.los(c.x, c.y, t.x, t.y);
  if (sees) { s.seenAt = now; s.lx = t.x; s.ly = t.y; }
  const speed = Math.hypot(t.vx, t.vy), still = speed < STILL && !(t.rollT > 0);
  const near = TALK_PX + (tv ? tv.def.W / 2 + 6 : 0);
  switch (s.stage) {
    case 'come': {
      if (c.vehId) {   // driving over: no siren, an easy pace; pulled up at the kerb by the scene - or by them, seen on the way
        const car = world.get(c.vehId);
        if (wrecked(car)) { vehicles.ejectPed(world, c, true); return; }   // (on foot from here)
        car.sirenOn = false;
        s.kerb ??= nearestKerb(world.map, s.x, s.y);
        const close = sees && d < 330;
        if (close || s.pulling || Math.hypot(s.kerb.x - car.x, s.kerb.y - car.y) < KERB_PX) {   // (once it's pulling up, to a stop)
          s.pulling = true;
          if (pullUp(world, c, car) && close) stage(world, s, c, 'walk');
        } else driveTo(world, car, s.kerb.x, s.kerb.y, 300);
        return;
      }
      if (sees) { stage(world, s, c, 'walk'); return; }
      const ds = Math.hypot(s.x - c.x, s.y - c.y);
      if (ds < 40 || stuck(world, s, ds, 5)) { stage(world, s, c, 'look'); return; }   // (there - or as near as they can get)
      step(world, c, s.x, s.y, false, dt);   // (over to the scene at a walk)
      return;
    }
    case 'look': {   // round the scene for them
      if (sees) { stage(world, s, c, 'walk'); return; }
      if (now - s.at > STOP_LOOK_S) { say(world, c, 'Nobody about. Never mind.'); end(world, s); return; }
      lookRound(world, s, c, dt);
      return;
    }
    case 'walk': {   // up to them, at a walk
      if (!sees && now - s.seenAt > 6) { s.x = s.lx; s.y = s.ly; stage(world, s, c, 'look'); return; }   // (lost them: a look round where they were)
      if (!s.called && sees && d < CALL_PX) {
        s.called = true;
        say(world, c, 'Excuse me! A word, please.');
        world.notify(p, 'An officer wants a word - stand still, or talk to them (the action button).', 'warn');
      }
      if (d < near && still) { stage(world, s, c, 'talk'); return; }
      // walking off on them once they've called out, or off at a run (or driving off)
      const away = speed > 40 && (t.x - c.x) * t.vx + (t.y - c.y) * t.vy > 0;
      s.awayT = away ? s.awayT + dt : 0;
      if (s.called && (s.awayT > AWAY_S || (away && speed > 150 && d > 70))) { stage(world, s, c, 'run'); return; }
      if (d <= near + 40) s.best = undefined;   // (as good as there)
      else if (stuck(world, s, d, 8)) { say(world, c, 'Ah, forget it.'); end(world, s); return; }   // (no way through to them)
      if (d > near - 10) toward(world, c, t, tv, false, dt); else face(c, t);
      return;
    }
    case 'talk': {
      face(c, t);
      if (d > near + 40 || speed > 90) { stage(world, s, c, 'run'); return; }   // (walked off mid-word)
      if (now - s.at >= TALK_S) verdict(world, s, p, c);
      return;
    }
    case 'run': {   // after them (let go: over already - stage)
      if (still && d < near) { stage(world, s, c, 'talk'); return; }   // (stopped for them after all)
      chase(world, s, c, t, tv, d, dt);
      outOfReach(world, s, p, c, d, sees, tv, dt);
      return;
    }
    case 'hot': {   // a hothead: the arrest
      if (struggle.pinning(world, c)) return;   // (on them, going for the cuffs: struggle.js)
      hot(world, s, c, t, tv, d, dt);
      outOfReach(world, s, p, c, d, sees, tv, dt);
    }
  }
}

// No headway toward where they're going for `secs` (a wall, a fence: there's no path finding on foot) - d: how far off it is
function stuck(world, s, d, secs) {
  if (s.best === undefined || d < s.best - 20) { s.best = d; s.bestAt = world.time; }
  return world.time - s.bestAt > secs;
}

function stage(world, s, c, next) {
  const p = world.players.get(s.pid), now = world.time;
  if ((next === 'walk' || next === 'talk') && temper(c) === 'hot') next = 'hot';   // (a hothead has no words for you)
  if (next === s.stage) return;
  s.stage = next; s.at = now; s.awayT = 0; s.best = undefined;
  if (next === 'talk') {
    say(world, c, s.ran ? 'Running off on me? Not smart.' : 'We\'ve had complaints about you.');
    if (c.vehId) vehicles.ejectPed(world, c, true);
  } else if (next === 'hot') {
    say(world, c, 'Police! Get down on the ground!');
    if (p) world.notify(p, 'This officer is going for the arrest - run, or fight them off!', 'bad');
  } else if (next === 'run') {
    s.ran = true;
    if (s.chase === undefined) s.chase = world.rand() < (STOP_CHASE[temper(c)] ?? 1);
    say(world, c, s.chase ? 'Hey! Stop right there!' : 'Hey! ...ah, forget it.');
    if (p) world.notify(p, s.chase ? 'The officer is coming after you - stop for them, or lose them.' : 'The officer let you go.', s.chase ? 'bad' : 'info');
    if (!s.chase) end(world, s);
  }
}

// The word's done: a warning, a fine or the cuffs, by their temper (rules.js STOP_OUTCOME) - less of a warning for having
// run from them. r: a roll, 0-1.
export function outcome(tm, ran, r) {
  let [w, f, a] = STOP_OUTCOME[tm] || STOP_OUTCOME.book;
  if (ran) { const lose = w * (1 - STOP_RAN), fa = f + a || 1; w -= lose; f += lose * f / fa; a += lose * a / fa; }
  return r < w ? 'warn' : r < w + f ? 'fine' : 'arrest';
}
const WARN = { easy: ['Just a warning. Keep it civil.', 'I\'ll let you off with a warning. Go on, behave.'], book: ['A warning - this time. It\'s on record.'] };
function verdict(world, s, p, c) {
  const tm = temper(c), o = outcome(tm, s.ran, world.rand()), t = p.ped;
  end(world, s);
  if (o === 'warn') {
    const lines = WARN[tm] || WARN.easy;
    say(world, c, lines[s.seq % lines.length]);
    law.clearWanted(world, p);
    world.notify(p, 'The officer let you off with a warning.', 'good');
  } else if (o === 'fine') {
    const prof = p.profile, cash = Math.min(prof.cash, STOP_FINE), bank = Math.min(prof.bank, STOP_FINE - cash);
    prof.cash -= cash; prof.bank -= bank;
    say(world, c, `That's a $${STOP_FINE} fine. Pay it and move along.`);
    law.clearWanted(world, p);
    world.notify(p, `The officer fined you $${cash + bank}${cash + bank < STOP_FINE ? ' (all you had)' : ''} - you're free to go.`, 'warn');
    store.touch();
  } else {
    say(world, c, 'Turn around, hands behind your back. You\'re coming with me.');
    world.emit(t.x, t.y, { e: 'cuffs', x: t.x, y: t.y, id: t.id });
    law.arrest(world, c, t);   // (cuffed where they stand - no tackle: custody.js from here)
  }
  p.meDirty = true;
}

// After them out of their reach (or sight) too long: 2 stars - the usual chase from here, the officer with it
function outOfReach(world, s, p, c, d, sees, tv, dt) {
  const reach = tv || c.vehId ? 300 : REACH_PX;
  s.outT += !sees || d > reach ? dt : Math.hypot(p.ped.vx, p.ped.vy) > STILL ? dt * 0.5 : 0;
  if (s.outT < STOP_ESCALATE_S) return;
  const t = p.ped;
  say(world, c, 'Suspect running! I need backup!');
  law.addHeat(world, p, Math.max(0, STAR_HEAT[2] + 6 - p.heat), t.x, t.y);   // (addHeat: the usual kind)
  law.logDispatch(world, 'flee', t.x, t.y, p, p.wanted, 'officer');
  world.notify(p, 'You ran from the police - now they\'re after you for real!', 'bad');
  end(world, s, true);
}

// ---- moving the officer -----------------------------------------------------------------------------------------------
// on foot to (x, y): at a walk, or a run (out of a shop by its door, round what's in the way)
function step(world, c, x, y, run, dt) {
  if (world.time < c.downUntil || world.time < c.stunUntil || c.vehId) return;
  const wp = footWay(world, c, x, y);
  pedStep(c, sidestep(world, c, seek(c, wp.x, wp.y, run), dt), dt, world.map, run ? police.copMods(world, c) : players.pedMods(world, c));
}
// to them - to the driver's door when they're in a car
function toward(world, c, t, tv, run, dt) {
  if (tv) { const dr = police.doorOf(tv, c); step(world, c, dr.x, dr.y, run, dt); } else step(world, c, t.x, t.y, run, dt);
}
function face(c, t) { c.vx = 0; c.vy = 0; c.a = Math.atan2(t.y - c.y, t.x - c.x); }
// brake; once it's slow, out of the car (true)
function pullUp(world, c, car) {
  const fwd = car.vx * Math.cos(car.a) + car.vy * Math.sin(car.a);
  if (Math.abs(fwd) > 60) { car.input = { throttle: fwd > 0 ? -1 : 1, steer: 0, hb: false }; return false; }
  car.input = { throttle: 0, steer: 0, hb: true };
  vehicles.ejectPed(world, c, true);
  return true;
}
function driveTo(world, car, x, y, speed) {
  const ai = car.ai, now = world.time;
  if (!ai.route || !ai.route.length || now - ai.routeAt > 3) { ai.route = planRoute(world, car.x, car.y, x, y); ai.routeAt = now; }
  while (ai.route.length > 1 && Math.hypot(ai.route[0].x - car.x, ai.route[0].y - car.y) < 60) ai.route.shift();
  const wp = ai.route[0] || { x, y };
  driveToward(world, car, wp.x, wp.y, speed, {});
}
// back to their car and in at the wheel (true once in)
function board(world, c, car, dt) {
  if (Math.hypot(car.x - c.x, car.y - c.y) < car.def.L / 2 + 26) {
    const i = !car.seats[0] ? 0 : car.seats.findIndex((q) => !q);
    if (i < 0) return false;
    car.seats[i] = c.id; c.vehId = car.id; c.seat = i; c.vx = 0; c.vy = 0;
    world.emit(car.x, car.y, { e: 'door', x: car.x, y: car.y });
    return true;
  }
  step(world, c, car.x, car.y, true, dt);
  return false;
}
// a look round the scene: a glance this way and that, now and then a few steps to another spot near it
function lookRound(world, s, c, dt) {
  const now = world.time;
  if (!s.wp || now > s.wpAt) {
    s.wpAt = now + 3 + world.rand() * 3; s.wp = null;
    for (let k = 0; k < 8 && !s.wp; k++) {
      const a = world.rand() * Math.PI * 2, r = 40 + world.rand() * 140, x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
      if (!PED_BLOCK[world.map.tileAtPx(x, y)] && world.map.los(c.x, c.y, x, y)) s.wp = { x, y };
    }
  }
  if (s.wp && Math.hypot(s.wp.x - c.x, s.wp.y - c.y) > 10) step(world, c, s.wp.x, s.wp.y, false, dt);
  else { c.vx = 0; c.vy = 0; c.a += Math.sin(now * 1.7 + c.id) * 0.05; }
}
// after them: on foot at a run; they drove off - back to the car (if there's one) and after them, the siren on
function chase(world, s, c, t, tv, d, dt) {
  const car = live(world, s.car);
  if (c.vehId) {
    const v = world.get(c.vehId);
    if (wrecked(v)) { vehicles.ejectPed(world, c, true); return; }
    v.sirenOn = true;
    if ((!tv && d < 220) || (tv && Math.hypot(t.vx, t.vy) < STILL && d < 260)) { pullUp(world, c, v); return; }   // (close, or they stopped: out)
    if (d < 520 && world.map.los(v.x, v.y, t.x, t.y)) driveToward(world, v, t.x, t.y, tv ? 640 : 320, { ignoreObstacles: !!tv && d < 200 });
    else driveTo(world, v, s.lx, s.ly, 520);
    return;
  }
  if (tv && car && !wrecked(car) && d > 180 && Math.hypot(t.vx, t.vy) > STILL) { if (board(world, c, car, dt)) car.sirenOn = true; return; }
  toward(world, c, t, tv, true, dt);
}
// a hothead: a run and a tackle; someone sitting in a stopped car dragged out of it (police.js, as at 2 stars)
function hot(world, s, c, t, tv, d, dt) {
  if (tv && tv.def.kind !== 'boat' && police.stillFor(world, tv) > 1.2) {
    if (c.vehId) { pullUp(world, c, world.get(c.vehId)); return; }
    const door = police.doorOf(tv, c);
    if (Math.hypot(door.x - c.x, door.y - c.y) < 30) police.pullOut(world, c, t, tv); else step(world, c, door.x, door.y, true, dt);
    return;
  }
  if (tv || c.vehId) { chase(world, s, c, t, tv, d, dt); return; }
  police.tackleStep(world, c, t, dt, true);
}

// ---- the action button: "Talk to the officer" -------------------------------------------------------------------------------
export function interaction(world, p) {
  const s = p.stop, ped = p.ped;
  if (!s || !ped || ped.vehId || s.stage === 'hot') return null;
  const c = live(world, s.cop);
  if (!c || c.vehId || Math.hypot(c.x - ped.x, c.y - ped.y) > 90) return null;
  if (s.stage === 'talk') return { label: 'Talking to the officer...', passive: true, run: () => {} };
  return { label: 'Talk to the officer', run: () => { if (p.stop === s && s.stage !== 'talk' && s.stage !== 'hot') { ped.vx = 0; ped.vy = 0; stage(world, s, c, 'talk'); } } };
}
