// Arrests (design notes 2026-10-08). Cuffed (law.js arrest), a wanted player isn't busted on the spot any more: they're
// held face down on the ground for HOLD_S, then a police car takes them in - the arresting unit's own if it has a seat to
// spare, any other police car close by, or one sent for them from out of sight (police.js sendTransport) - and an officer
// walks them over to it, puts them in the back and they're driven to the nearest station. Only there, booked into a cell,
// are they fined and stripped of contraband and illegal guns, and their stars wiped. Then: pay the bail (BAIL_PER_STAR a
// star) to walk out of the station now, or wait JAIL_S.
//
// On the way it can go wrong for the police: the officer holding them killed or knocked down; the car blown up, wrecked,
// its engine shot dead, in a bad crash (BREAKOUT_IMPACT and up can throw them out), or taken off the police by someone
// else. Then they're free - still wanted, and wanted more for escaping (law.js CRIMES.escape). A player officer can drive
// their prisoner in themselves (DELIVER_BONUS) but must stay with them: leave them further than GUARD_PX and they slip
// away. Logging out in custody books you on the spot.
//
//   p.custody: { stage, since, until, holder (ped id), car (veh id), driver (pid: a player officer taking them in),
//                by (pid of the arresting player), stars, station (poi id), picked, blastSeen / hitSeen (the car's last
//                blast and crash already looked at) }
//     'held' face down -> 'fetch' (a car on its way) -> 'escort' (walked to it) -> 'ride' -> 'cell' (bail / JAIL_S)
//   ped.cuffed: short of the cell - can't move or do anything; the server moves them (net.js: no prediction)
import { K } from '../../shared/constants.js';
import { pedStep } from '../../shared/physics.js';
import { PED_BLOCK } from '../../shared/map.js';
import { localToWorld } from '../../shared/math.js';
import { WEAPONS, ITEMS } from '../../shared/items.js';
import { IN } from '../../shared/input.js';
import {
  HOLD_S, ESCORT_PX, TRANSPORT_WAIT_S, RIDE_MAX_S, JAIL_S, BAIL_PER_STAR, GUARD_PX, BREAKOUT_IMPACT, DELIVER_BONUS,
  BUST_FINE_PER_STAR, ARREST_REWARD_PER_STAR, SPAWN_PROTECT_S,
} from '../../shared/rules.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as vehicles from './vehicles.js';
import * as cargo from './cargo.js';
import * as events from './events.js';
import * as police from './police.js';
import * as players from './players.js';
import * as homes from './homes.js';
import { seek, footWay, walkInAt, sidestep } from './npc.js';
import { driveToward, planRoute } from './traffic.js';

const PICKUP_PX = 200;   // a car this close to the prisoner is walked to (further off, it drives over first)
const DROP_PX = 170;     // at the station: this close to the kerb outside the front door
const ESCORT_S = 25;     // a walk to the car that takes longer than this: they're put in anyway
const WALK = { canMove: true, canSprint: false, speedMul: 0.95, canSwim: true, regenMul: 1, staminaMax: 100 };

export const inCustody = (p) => !!(p && p.custody && p.custody.stage !== 'cell');
export const inCell = (p) => !!(p && p.custody && p.custody.stage === 'cell');
const live = (world, id) => { const e = id ? world.get(id) : null; return e && !e.removed ? e : null; };
const floored = (world, e) => world.time < e.downUntil || world.time < e.stunUntil;
const wrecked = (v) => !v || v.removed || v.wreckAt || v.dead || v.sinkAt;

// ---- the stations ---------------------------------------------------------------------------------------------------------
const stations = (world) => world.map.pois.filter((q) => q.kind === 'police');
export function nearestStation(world, x, y) {
  let best = null, bd = Infinity;
  for (const st of stations(world)) { const d = Math.hypot(st.x - x, st.y - y); if (d < bd) { bd = d; best = st; } }
  return best;
}
// Where a car pulls up for the front door: the nearest point of a street to it (cached per station)
const KERBS = new WeakMap();
export function kerbOf(world, id) {
  const st = world.map.pois[id];
  if (!st) return null;
  let cache = KERBS.get(world.map);
  if (!cache) KERBS.set(world.map, (cache = new Map()));
  if (cache.has(id)) return cache.get(id);
  const door = st.outside || st;
  let best = null, bd = Infinity;
  for (const e of world.map.edges || []) {
    if (e.lvl !== 0) continue;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
      if (Math.min(a.x, b.x) - door.x > bd || door.x - Math.max(a.x, b.x) > bd || Math.min(a.y, b.y) - door.y > bd || door.y - Math.max(a.y, b.y) > bd) continue;
      const t = Math.max(0, Math.min(1, ((door.x - a.x) * dx + (door.y - a.y) * dy) / L2));
      const x = a.x + dx * t, y = a.y + dy * t, d = Math.hypot(x - door.x, y - door.y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  const out = best || { x: door.x, y: door.y };
  cache.set(id, out);
  return out;
}

// ---- cuffed ----------------------------------------------------------------------------------------------------------------
function cuff(ped, on) {
  if (!ped || !!ped.cuffed === on) return;
  ped.cuffed = on;
  ped.appVer = (ped.appVer || 0) + 1;   // (net.js sends the descriptor again: the cuffed walk)
}

// Cuffed by `by` (an NPC officer, a player officer or a bounty hunter): face down, the officer kneeling on them.
export function start(world, p, by) {
  const ped = p.ped, now = world.time;
  if (!ped || ped.dead || p.custody) return;
  if (ped.vehId) vehicles.ejectPed(world, ped, true);
  if (ped.carrying) cargo.dropCrate(world, ped);   // (it stays where they went down, for anyone to pick up)
  ped.fishing = null; ped.rollT = 0; ped.vx = 0; ped.vy = 0;
  ped.downUntil = Math.max(ped.downUntil || 0, now + 0.5);
  cuff(ped, true);
  p.unstuck = null;
  p.custody = { stage: 'held', since: now, until: now + HOLD_S, holder: by ? by.id : 0, car: 0, driver: null, by: by && by.player ? by.player.pid : null,
    stars: Math.max(1, p.wanted), station: -1, picked: false };
  p.seenAt = now; p.lastSeenX = ped.x; p.lastSeenY = ped.y;
  world.notify(p, by && by.player ? `Cuffed by ${by.player.name}!` : 'Cuffed! The police have you.', 'bad');
  if (by && by.player) world.notify(by.player, `${p.name} is cuffed. A car will take them in - stay with them, or put them in your own police car.`, 'good');
  events.feed(world, { kind: 'arrest', text: `${p.name} was arrested${by && by.player ? ' by ' + by.player.name : ''}`, x: ped.x, y: ped.y });
  p.meDirty = true;
  store.touch();
}

// Turned themself in (unstuck.js surrender): straight to the cells.
export function surrender(world, p) {
  if (!p.ped || p.ped.dead || p.custody) return;
  p.custody = { stage: 'held', since: world.time, until: world.time, holder: 0, car: 0, driver: null, by: null, stars: Math.max(1, p.wanted), station: -1 };
  book(world, p);
}

export function update(world, dt) {
  for (const p of world.players.values()) if (p.custody) step(world, p, dt);
}

function step(world, p, dt) {
  const c = p.custody, ped = p.ped, now = world.time;
  if (!ped || ped.removed) { p.custody = null; return; }
  if (c.stage === 'cell') { if (now >= c.until) release(world, p, 'Your time\'s up - you\'re free to go.'); else if (world.tick % 10 === 0) p.meDirty = true; return; }
  if (ped.dead) { onDeath(world, p); return; }   // (killed in custody: the usual death - the stars went with it)
  p.seenAt = now; p.lastSeenX = ped.x; p.lastSeenY = ped.y;   // (the police have them)
  if (c.stage === 'held' || c.stage === 'fetch') {
    const h = live(world, c.holder);
    if (!holding(world, h, ped)) { escape(world, p, h && !h.dead ? 'You wriggled free - run!' : 'The officer holding you is down - you\'re free! Run!'); return; }
    pin(world, ped, h, dt);
    if (c.stage === 'held') { if (now >= c.until) fetch(world, p); return; }
    if (c.car && wrecked(live(world, c.car))) { c.car = 0; fetch(world, p, true); return; }   // (the car coming was wrecked: another)
    if (now >= c.until) book(world, p);   // (nothing got there in time: taken in anyway)
    return;
  }
  if (c.stage === 'escort') escortStep(world, p, dt);
  else if (c.stage === 'ride') rideStep(world, p);
}

// Still held? The officer holding them alive and on their feet (a player officer: within GUARD_PX of them, still an
// officer or hunter).
function holding(world, h, ped) {
  if (!h || h.dead || h.removed) return false;
  if (h.player) return !!(h.player.badge || h.player.hunter) && !h.hidden && Math.hypot(h.x - ped.x, h.y - ped.y) < GUARD_PX;
  return !floored(world, h);
}

// Face down on the ground; an NPC officer holding them kneels on them (walking back over first if they'd been moved)
function pin(world, ped, h, dt) {
  const now = world.time;
  ped.downUntil = Math.max(ped.downUntil, now + 0.3); ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  if (!h || !h.npc || h.vehId) return;
  if (Math.hypot(ped.x - h.x, ped.y - h.y) > 26) walk(world, h, ped.x, ped.y, dt, 1);
  else { h.vx = 0; h.vy = 0; h.a = Math.atan2(ped.y - h.y, ped.x - h.x); h.kneelUntil = now + 0.3; }
}
function walk(world, e, x, y, dt, speed = 1) {
  if (floored(world, e)) return;
  const wp = footWay(world, e, x, y);   // (out through the door, from inside a shop)
  const inp = seek(e, wp.x, wp.y, false);
  if (Math.hypot(x - e.x, y - e.y) < 8) { inp.mx = 0; inp.my = 0; }
  pedStep(e, sidestep(world, e, inp, dt), dt, world.map, { ...players.pedMods(world, e), speedMul: speed });
}

// The hold is over: a car to take them in - one close by, or one sent.
function fetch(world, p, again = false) {
  const c = p.custody, ped = p.ped, now = world.time;
  c.stage = 'fetch'; c.since = now;
  const h = live(world, c.holder);
  let v = pickCar(world, p, h);
  if (!v && !ped.sub) v = police.sendTransport(world, p);
  if (v) { c.car = v.id; v.ai.prisoner = p.pid; c.until = now + TRANSPORT_WAIT_S; }
  else { c.car = 0; c.until = now + 5; }   // (nothing can get to them: taken in anyway, in a moment)
  if (!again) world.notify(p, 'A police car\'s coming to take you in.', 'bad');
  p.meDirty = true;
}

// A police car to take them in: the holder's own unit's if it has a seat to spare, else the nearest other one within
// ESCORT_PX that isn't busy (NPC units only: a player officer's car is theirs to use - interaction()).
function pickCar(world, p, h) {
  const ped = p.ped;
  let best = null, bd = ESCORT_PX;
  for (const vid of world.police || []) {
    const v = world.get(vid);
    if (wrecked(v) || !v.ai || v.ai.prisoner || v.ai.npcTarget || v.ai.call || v.def.kind !== 'car' || (v.lz || 0) > 0.3) continue;
    const crew = police.crewOf(world, v);
    if (!crew.length || crew.length >= v.seats.length) continue;   // (no room in the back)
    let d = Math.hypot(v.x - ped.x, v.y - ped.y);
    if (h && h.npc && h.npc.unit === v.id) d *= 0.3;   // (their own car first)
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

// The officer gets them up and walks them to the back door, a step behind; in they go.
function escortStep(world, p, dt) {
  const c = p.custody, ped = p.ped, now = world.time;
  const esc = live(world, c.holder), v = live(world, c.car);
  if (!esc || esc.dead || floored(world, esc)) { escape(world, p, 'The officer walking you is down - you\'re free! Run!'); return; }
  if (wrecked(v)) {   // the car's gone: back on the ground, and another one's found
    if (v && v.ai) v.ai.prisoner = null;
    Object.assign(c, { car: 0, stage: 'held', until: now + 1, picked: false });
    pin(world, ped, esc, dt);
    return;
  }
  if (!c.picked) {
    // over to them, and up on their feet
    pin(world, ped, null, dt);
    if (Math.hypot(ped.x - esc.x, ped.y - esc.y) < 30) { c.picked = true; ped.downUntil = 0; }
    else walk(world, esc, ped.x, ped.y, dt, 1);
    if (now - c.since > ESCORT_S) seat(world, p, v, esc);
    return;
  }
  const door = doorSpot(world, v, esc);
  walk(world, esc, door.x, door.y, dt, 0.85);
  const bx = esc.x - Math.cos(esc.a) * 18, by = esc.y - Math.sin(esc.a) * 18;
  const inp = seek(ped, bx, by, false);
  if (Math.hypot(bx - ped.x, by - ped.y) < 6) { inp.mx = 0; inp.my = 0; }
  pedStep(ped, inp, dt, world.map, WALK);
  if (Math.hypot(door.x - ped.x, door.y - ped.y) < 40 || Math.hypot(v.x - ped.x, v.y - ped.y) < v.def.L / 2 + 20 || now - c.since > ESCORT_S) seat(world, p, v, esc);
}
// the back door on the side the officer's on (the other side if that one's against a wall)
function doorSpot(world, v, near) {
  const right = ((near.x - v.x) * -Math.sin(v.a) + (near.y - v.y) * Math.cos(v.a)) >= 0;
  for (const s of right ? [1, -1] : [-1, 1]) {
    const [x, y] = localToWorld(v.x, v.y, v.a, -v.def.L * 0.12, s * (v.def.W / 2 + 14));
    if (!PED_BLOCK[world.map.tileAtPx(x, y)]) return { x, y };
  }
  const [x, y] = localToWorld(v.x, v.y, v.a, -v.def.L / 2 - 16, 0);
  return { x, y };
}
// a free seat for the prisoner: the back first
function backSeat(v) { for (let i = v.seats.length - 1; i >= 1; i--) if (!v.seats[i]) return i; return -1; }

// In the back of the car (the officer who walked them takes the wheel if it's free) and off to the nearest station.
function seat(world, p, v, esc) {
  const c = p.custody, ped = p.ped, now = world.time;
  const s = backSeat(v);
  if (s < 0) { book(world, p); return; }   // (no room after all: taken in anyway)
  v.seats[s] = ped.id; ped.vehId = v.id; ped.seat = s;
  ped.vx = 0; ped.vy = 0; ped.rollT = 0; ped.downUntil = 0;
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
  if (esc && esc.npc && !esc.vehId) {
    const fs = !v.seats[0] ? 0 : v.seats.findIndex((q) => !q);
    if (fs >= 0) { v.seats[fs] = esc.id; esc.vehId = v.id; esc.seat = fs; esc.vx = 0; esc.vy = 0; }
  }
  const st = nearestStation(world, v.x, v.y);
  Object.assign(c, { stage: 'ride', since: now, until: now + RIDE_MAX_S, holder: 0, station: st ? st.id : -1, blastSeen: v.blastAt || 0, hitSeen: v.hardHitAt || 0 });
  world.notify(p, `In the back of the police car - on the way to ${st ? st.label : 'the station'}.`, 'bad');
  p.meDirty = true;
}

// The ride: the ways out (a blast, a wreck, a dead engine, a bad crash, the car taken), and the station.
function rideStep(world, p) {
  const c = p.custody, ped = p.ped, now = world.time, v = live(world, c.car);
  if (!v || ped.vehId !== v.id) { escape(world, p, 'You\'re out of the car - run!'); return; }   // (blown clear: vehicles.js blownOut)
  if (v.wreckAt || v.sinkAt) { vehicles.ejectPed(world, ped, true); escape(world, p, 'The car\'s a wreck - you crawl out free. Run!'); return; }
  if (v.dead) { vehicles.ejectPed(world, ped, true); escape(world, p, 'The engine\'s dead - you kick the door open. Run!'); return; }
  // a blast or a hard crash since the last look (vehicles.js / combat.js stamp them on the car)
  if ((v.blastAt || 0) !== c.blastSeen) { c.blastSeen = v.blastAt; throwOut(world, ped, v, 170); escape(world, p, 'The blast burst the doors open - run!'); return; }
  if ((v.hardHitAt || 0) !== c.hitSeen) {
    c.hitSeen = v.hardHitAt;
    if (v.hardHit >= BREAKOUT_IMPACT && world.rand() < Math.min(1, 0.35 + (v.hardHit - BREAKOUT_IMPACT) / 300)) { throwOut(world, ped, v, 120); escape(world, p, 'Thrown clear in the crash - run!'); return; }
  }
  const drv = live(world, v.seats[0]);
  if (c.driver) {
    // a player officer driving them in: to any station, staying with them
    const o = world.players.get(c.driver), op = o && o.ped;
    if (!op || op.dead || !(o.badge || o.hunter)) { vehicles.ejectPed(world, ped, true); escape(world, p, 'Nobody\'s watching you - you slip out of the car. Run!'); return; }
    if (drv && drv !== op) { escape(world, p, 'Someone else has the police car - the cuffs come off!'); return; }
    if (!drv && Math.hypot(op.x - v.x, op.y - v.y) > GUARD_PX) { vehicles.ejectPed(world, ped, true); escape(world, p, 'Left alone in the police car - you slip out. Run!'); return; }
    if (drv === op && Math.hypot(v.vx, v.vy) < 140) {
      for (const st of stations(world)) {
        const k = kerbOf(world, st.id);
        if (k && Math.hypot(v.x - k.x, v.y - k.y) < DROP_PX + 120) { c.station = st.id; delivered(world, p, o); book(world, p); return; }
      }
    }
    if (now >= c.until) book(world, p);
    return;
  }
  if (drv && !(drv.npc && drv.npc.role === 'cop')) { escape(world, p, 'Someone\'s taken the police car - the cuffs come off!'); return; }
  if (!drv && !police.crewOf(world, v).length) { vehicles.ejectPed(world, ped, true); escape(world, p, 'Nobody\'s left to take you in - you slip out of the car. Run!'); return; }
  const k = kerbOf(world, c.station);
  if ((k && Math.hypot(v.x - k.x, v.y - k.y) < DROP_PX) || now >= c.until) book(world, p);
}
function throwOut(world, ped, v, sp) {
  const side = v.a + (ped.seat % 2 ? 1 : -1) * Math.PI / 2;
  vehicles.ejectPed(world, ped, true);
  vehicles.fling(world, ped, v.vx * 0.7 + Math.cos(side) * sp, v.vy * 0.7 + Math.sin(side) * sp, null, 'bail');
}

// A player officer drove their prisoner in themselves: something extra on top of the arrest.
function delivered(world, p, o) {
  const stars = p.custody.stars, bonus = Math.round(ARREST_REWARD_PER_STAR * stars * DELIVER_BONUS);
  o.profile.cash += bonus;
  if (o.badge) law.addPolicePts(world, o, 3 * stars);
  world.notify(o, `${p.name} handed over at the cells. +$${bonus}`, 'good');
  o.meDirty = true;
}

// ---- free -----------------------------------------------------------------------------------------------------------------
// The car taking them in lets them go (it carries on as a unit after them, or stands down).
function releaseCar(world, c) {
  const v = c && c.car ? world.get(c.car) : null;
  if (v && v.ai && v.ai.prisoner) v.ai.prisoner = null;
}
// Got away: still wanted - and more for escaping - and the police hunt them again from here.
function escape(world, p, msg) {
  const c = p.custody, ped = p.ped;
  releaseCar(world, c);
  p.custody = null;
  cuff(ped, false);
  if (ped && !ped.dead) {
    ped.downUntil = Math.min(ped.downUntil, world.time + 0.4);
    law.crime(world, ped, 'escape', null, ped.x, ped.y, { silentCheck: false });
  }
  world.notify(p, msg, 'good');
  const o = c && c.by ? world.players.get(c.by) : null;
  if (o && o !== p) world.notify(o, `${p.name} got away!`, 'bad');
  p.meDirty = true;
}
// Killed in custody (players.onPedDeath): the cuffs come off the body; the usual death.
export function onDeath(world, p) {
  if (!p.custody || p.custody.stage === 'cell') return;
  releaseCar(world, p.custody);
  p.custody = null;
  cuff(p.ped, false);
}

// ---- the cell -------------------------------------------------------------------------------------------------------------
// Booked: fined, the contraband and illegal guns taken, the stars wiped - and JAIL_S in a cell, or the bail.
function book(world, p) {
  const c = p.custody, ped = p.ped, now = world.time;
  releaseCar(world, c);
  if (ped.vehId) vehicles.ejectPed(world, ped, true);
  cuff(ped, false);
  const st = (world.map.pois[c.station] && world.map.pois[c.station].kind === 'police' ? world.map.pois[c.station] : null) || nearestStation(world, ped.x, ped.y);
  const taken = confiscate(world, p, c.stars);
  law.clearWanted(world, p);
  p.profile.peakWanted = 0; p.disguised = false;
  ped.hidden = true; ped.inside = null; ped.interior = { kind: 'jail', poi: st.id };
  ped.x = st.x; ped.y = st.y; ped.vx = 0; ped.vy = 0; ped.rollT = 0; ped.downUntil = 0; ped.stunUntil = 0; ped.lz = 0; ped.sub = false;
  world.place(ped);
  p.teleportAt = now;
  const bail = BAIL_PER_STAR * c.stars;
  p.custody = { stage: 'cell', since: now, until: now + JAIL_S, station: st.id, bail, stars: c.stars, by: c.by };
  world.notify(p, `Booked into a cell at ${st.label}: ${taken}. Out in ${JAIL_S}s - or pay the $${bail} bail.`, 'bad');
  p.meDirty = true;
  store.touch();
}
// what the cells take: the fine out of your pocket, illegal guns (and the rocket launcher), contraband
function confiscate(world, p, stars) {
  const prof = p.profile, ped = p.ped;
  const fine = Math.min(prof.cash, BUST_FINE_PER_STAR * stars);
  prof.cash -= fine;
  const guns = [];
  for (const id of Object.keys(prof.weapons)) {
    const w = WEAPONS[id];
    if (!w || !(w.illegal || id === 'rocket')) continue;
    delete prof.weapons[id]; delete ped.mag[id]; guns.push(w.name);
  }
  if (!prof.weapons[ped.weapon] && ped.weapon !== 'fists' && WEAPONS[ped.weapon] && (WEAPONS[ped.weapon].illegal || ped.weapon === 'rocket')) ped.weapon = 'fists';
  let n = 0;
  for (const id of Object.keys(prof.inventory || {})) if (ITEMS[id] && ITEMS[id].illegal) { n += prof.inventory[id]; delete prof.inventory[id]; }
  const bits = [`fined $${fine}`];
  if (guns.length) bits.push(`${guns.join(', ')} taken`);
  if (n) bits.push('contraband taken');
  return bits.join(', ');
}
// Out into the station's lobby
function release(world, p, msg) {
  const c = p.custody, ped = p.ped;
  p.custody = null;
  if (!ped || ped.dead) return;
  const st = world.map.pois[c.station] || nearestStation(world, ped.x, ped.y);
  ped.hidden = false; ped.interior = null; ped.inside = null;
  ped.x = st.x + (world.rand() - 0.5) * 16; ped.y = st.y; ped.vx = 0; ped.vy = 0;
  world.place(ped);
  homes.protect(world, ped, SPAWN_PROTECT_S);
  world.emit(ped.x, ped.y, { e: 'door', x: ped.x, y: ped.y });
  p.teleportAt = world.time;
  if (msg) world.notify(p, msg, 'good');
  p.meDirty = true;
}
export function payBail(world, p) {
  const c = p.custody;
  if (!inCell(p)) return 'You\'re not in a cell.';
  const prof = p.profile, cost = c.bail;
  if (prof.bank + prof.cash < cost) return `The bail is $${cost} and you don't have it - wait it out.`;
  const fromBank = Math.min(prof.bank, cost);
  prof.bank -= fromBank; prof.cash -= cost - fromBank;
  release(world, p, `Bail paid ($${cost}). You're free to go.`);
  store.touch();
  return null;
}

// Logging out in custody: booked on the spot (no escaping by quitting), and out in the lobby for the ghost's last seconds.
export function onLeave(world, p) {
  if (!p.custody) return;
  if (inCustody(p)) book(world, p);
  release(world, p, '');
}

// ---- the car taking them in (police.js runUnit, while v.ai.prisoner) ----------------------------------------------------
export function runCar(world, v, crew, dt) {
  const p = world.players.get(v.ai.prisoner), c = p && p.custody;
  if (!c || c.car !== v.id || c.stage === 'cell' || !p.ped) { v.ai.prisoner = null; return; }   // (done: a unit again next tick)
  const ped = p.ped, now = world.time;
  let drv = live(world, v.seats[0]);
  if (c.stage === 'held' || c.stage === 'fetch') {
    // come and get them (to the door, when they're in a shop), and stand round them meanwhile
    const wi = walkInAt(world.map, ped.x, ped.y), gx = wi ? wi.x : ped.x, gy = wi ? wi.outY : ped.y;
    const d = Math.hypot(v.x - gx, v.y - gy);
    v.sirenOn = d > 600;
    if (d > PICKUP_PX && drv && drv.npc) route(world, v, gx, gy, d < 450 ? 170 : 460);
    else halt(v);
    for (const q of crew) if (!q.vehId && q.id !== c.holder) guard(world, q, ped, dt);
    if (c.stage === 'fetch' && d <= PICKUP_PX + 60 && Math.hypot(v.vx, v.vy) < 40) {
      // an officer to walk them over: the one holding them if they're this car's, else one of its crew
      const h = live(world, c.holder);
      let esc = h && h.npc && h.npc.unit === v.id && !h.vehId ? h : null;
      if (!esc) { let bd = Infinity; for (const q of crew) if (!q.vehId && !floored(world, q)) { const dq = Math.hypot(q.x - ped.x, q.y - ped.y); if (dq < bd) { bd = dq; esc = q; } } }
      if (!esc) { esc = crew.find((q) => q.vehId === v.id && q.seat > 0) || crew.find((q) => q.vehId === v.id); if (esc) vehicles.ejectPed(world, esc, true, { x: ped.x, y: ped.y }); }
      if (esc) { Object.assign(c, { stage: 'escort', holder: esc.id, since: now, picked: false }); p.meDirty = true; }
    }
    return;
  }
  v.sirenOn = false;
  if (c.stage === 'escort') {
    halt(v);
    for (const q of crew) if (!q.vehId && q.id !== c.holder) board(world, q, v, dt);
    return;
  }
  // the ride: the others back in (a few seconds' grace), then to the station
  const left = crew.filter((q) => !q.vehId);
  for (const q of left) board(world, q, v, dt);
  if (left.length && now - c.since < 8) { halt(v); return; }
  if (!drv) {
    const q = crew.find((e) => e.vehId === v.id);
    if (!q) { halt(v); return; }
    v.seats[q.seat] = 0; v.seats[0] = q.id; q.seat = 0; drv = q;
  }
  const k = kerbOf(world, c.station);
  if (k) route(world, v, k.x, k.y, Math.hypot(v.x - k.x, v.y - k.y) < 420 ? 200 : 430);
  else halt(v);
}
// The holder's own unit when another car is taking them in: parked, the others standing round the prisoner.
export function standBy(world, v, crew, p, dt) {
  v.sirenOn = false;
  if (v.seats[0]) halt(v);
  for (const q of crew) if (!q.vehId && q.id !== p.custody.holder) guard(world, q, p.ped, dt);
}
function route(world, v, x, y, speed) {
  const ai = v.ai, now = world.time, key = `${Math.round(x)},${Math.round(y)}`;
  if (!ai.route || !ai.route.length || now - ai.routeAt > 3 || ai.routeKey !== key) { ai.route = planRoute(world, v.x, v.y, x, y); ai.routeAt = now; ai.routeKey = key; }
  while (ai.route.length > 1 && Math.hypot(ai.route[0].x - v.x, ai.route[0].y - v.y) < 60) ai.route.shift();
  const wp = ai.route[0] || { x, y };
  driveToward(world, v, wp.x, wp.y, speed, {});
}
// brake to a stop (the handbrake on once it's slow)
function halt(v) {
  const fwd = v.vx * Math.cos(v.a) + v.vy * Math.sin(v.a);
  v.input = { throttle: fwd > 8 ? -1 : fwd < -8 ? 1 : 0, steer: 0, hb: Math.abs(fwd) < 40 };
}
function guard(world, q, ped, dt) {
  if (floored(world, q)) return;
  const d = Math.hypot(ped.x - q.x, ped.y - q.y);
  if (d > 70) walk(world, q, ped.x, ped.y, dt, 1);
  else { q.vx *= 0.5; q.vy *= 0.5; q.a = Math.atan2(ped.y - q.y, ped.x - q.x); }
}
function board(world, q, v, dt) {
  if (floored(world, q)) return;
  pedStep(q, seek(q, v.x, v.y, true), dt, world.map, players.pedMods(world, q));
  if (Math.hypot(v.x - q.x, v.y - q.y) < v.def.L / 2 + 26) {
    const s = !v.seats[0] ? 0 : v.seats.findIndex((e) => !e);
    if (s >= 0) { v.seats[s] = q.id; q.vehId = v.id; q.seat = s; q.vx = 0; q.vy = 0; }
  }
}

// ---- a player officer's own car ------------------------------------------------------------------------------------------
// Standing by a prisoner they took, with a police car of their own close by: put them in the back and drive them in.
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId || ped.dead || !(p.badge || p.hunter)) return null;
  for (const q of world.players.values()) {
    const c = q.custody;
    if (q === p || !c || (c.stage !== 'held' && c.stage !== 'fetch') || !q.ped) continue;
    if (c.holder !== ped.id && c.by !== p.pid) continue;
    if (Math.hypot(q.ped.x - ped.x, q.ped.y - ped.y) > 64) continue;
    const v = ownCar(world, p, q.ped);
    if (v) return { label: `Put ${q.name} in the back of the ${v.def.name}`, run: () => intoCar(world, q, p, v) };
  }
  return null;
}
function ownCar(world, p, near) {
  let best = null, bd = 220;
  for (const v of world.query(near.x, near.y, bd, K.VEH)) {
    if (!v.def.police || v.def.kind !== 'car' || wrecked(v) || (world.police && world.police.has(v.id))) continue;
    const drv = live(world, v.seats[0]);
    if ((drv && drv !== p.ped) || backSeat(v) < 0) continue;
    const d = Math.hypot(v.x - near.x, v.y - near.y);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
function intoCar(world, q, o, v) {
  const c = q.custody, ped = q.ped, now = world.time;
  const s = backSeat(v);
  if (s < 0 || !inCustody(q)) return;
  releaseCar(world, c);   // (a car on its way for them can go back)
  v.seats[s] = ped.id; ped.vehId = v.id; ped.seat = s;
  ped.vx = 0; ped.vy = 0; ped.rollT = 0; ped.downUntil = 0;
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
  Object.assign(c, { stage: 'ride', car: v.id, driver: o.pid, holder: 0, since: now, until: now + RIDE_MAX_S, station: -1, blastSeen: v.blastAt || 0, hitSeen: v.hardHitAt || 0 });
  const st = nearestStation(world, v.x, v.y);
  world.notify(o, `${q.name} is in the back. Drive them to a police station${st ? ` - the nearest is ${st.label}` : ''}.`, 'good');
  world.notify(q, `${o.name} put you in the back of the police car.`, 'bad');
  q.meDirty = true; o.meDirty = true;
}

// ---- for the HUD (players.js buildMe) -------------------------------------------------------------------------------------
// s: the stage; at: the station; left: seconds (the cell); bail
export function meInfo(world, p) {
  const c = p.custody;
  if (!c) return null;
  const st = c.station >= 0 ? world.map.pois[c.station] : null;
  if (c.stage === 'cell') return { s: 'cell', at: st ? st.label : '', left: Math.max(0, Math.ceil(c.until - world.time)), bail: c.bail, can: p.profile.bank + p.profile.cash >= c.bail };
  const o = c.driver ? world.players.get(c.driver) : null;
  return { s: c.stage, at: st ? st.label : '', by: o ? o.name : null };
}
// The prisoners a player officer is taking in themselves: where they're going (a waypoint on their HUD)
export function deliveryFor(world, p) {
  for (const q of world.players.values()) {
    const c = q.custody;
    if (!c || c.stage !== 'ride' || c.driver !== p.pid) continue;
    const st = nearestStation(world, p.ped ? p.ped.x : 0, p.ped ? p.ped.y : 0);
    const k = st ? kerbOf(world, st.id) : null;
    return k ? { text: `Take ${q.name} to ${st.label}`, x: Math.round(k.x), y: Math.round(k.y), stage: 'go' } : null;
  }
  return null;
}
void IN;
