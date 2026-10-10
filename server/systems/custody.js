// Arrests (design notes 2026-10-08). Cuffed (law.js arrest), a wanted player isn't busted on the spot any more: they're
// held face down on the ground for HOLD_S, then a police car takes them in. The officer who cuffed them came in a car
// close by: they get them up and walk them to it, the prisoner cuffed at their side (task #376, ESCORT_WALK_PX).
// Otherwise a car comes for them - the arresting unit's own if it has a seat to spare (driven over: task #378), any other
// police car close by, or one sent for them from out of sight (police.js sendTransport) - and an officer walks them over
// to it. In the back, they're driven to the nearest station. Only there, booked into a cell,
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
//                blast and crash already looked at), cell: { b, c } (cells.js: the cell block and the cell) }
//     'held' face down -> ('fetch': a car on its way) -> 'escort' (walked to it) -> 'ride' -> 'walkin' (two officers
//     walk them from the car through the station's door to a cell) -> 'cell' (bail / JAIL_S)
//   ped.cuffed: short of the cell - can't move or do anything; the server moves them (net.js: no prediction)
// In the cell they're a real person in the world (cells.js: walk round it, sit, the toilet, hold the bars), not hidden;
// out by time or bail, the cell door opens and they're put outside the station's front door.
import { K, TILE } from '../../shared/constants.js';
import { pedStep, PED } from '../../shared/physics.js';
import { PED_BLOCK } from '../../shared/map.js';
import { localToWorld } from '../../shared/math.js';
import { WEAPONS, ITEMS } from '../../shared/items.js';
import { IN } from '../../shared/input.js';
import {
  HOLD_S, ESCORT_WALK_PX, ESCORT_PX, TRANSPORT_WAIT_S, RIDE_MAX_S, JAIL_S, BAIL_PER_STAR, GUARD_PX, BREAKOUT_IMPACT, DELIVER_BONUS,
  BUST_FINE_PER_STAR, ARREST_REWARD_PER_STAR, SPAWN_PROTECT_S, CUSTODY_STUCK_S, CUSTODY_WAIT_BREAK_S, CUSTODY_SKIP_S,
  CELL_WALK_S, BREAK_CHANCE, BREAK_FAIL_K, BREAK_RETRY_S, BREAK_KNOCK_S, BREAK_TRIP_SHARE, STRUGGLE_KIND, STRUGGLE_GRACE_S,
} from '../../shared/rules.js';
import { inCellRect } from '../../shared/cells.js';
import * as cells from './cells.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as vehicles from './vehicles.js';
import * as cargo from './cargo.js';
import * as events from './events.js';
import * as police from './police.js';
import * as players from './players.js';
import * as homes from './homes.js';
import * as hotmoney from './hotmoney.js';
import * as struggle from './struggle.js';
import { seek, footWay, walkInAt, sidestep, spawnNpc } from './npc.js';
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
  if (!cache.has(id)) { const door = st.outside || st; cache.set(id, nearestKerb(world.map, door.x, door.y)); }
  return cache.get(id);
}
// the nearest point of a street (ground level) to (x, y)
export function nearestKerb(m, x, y) {
  let best = null, bd = Infinity;
  for (const e of m.edges || []) {
    if (e.lvl !== 0) continue;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
      if (Math.min(a.x, b.x) - x > bd || x - Math.max(a.x, b.x) > bd || Math.min(a.y, b.y) - y > bd || y - Math.max(a.y, b.y) > bd) continue;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
      const px = a.x + dx * t, py = a.y + dy * t, d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
  }
  return best || { x, y };
}
// Where a car pulls up for someone inside a walk-in: the street nearest its door (not on the door itself, where it
// would block the way in and out). Cached per door.
const DOOR_KERBS = new WeakMap();
export function doorKerb(world, wi) {
  let k = DOOR_KERBS.get(wi.u);
  if (!k) { k = nearestKerb(world.map, wi.x, wi.outY); DOOR_KERBS.set(wi.u, k); }
  return k;
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
  struggle.update(world, dt);   // (before the cuffs: fighting back - the cuffs going on starts the custody below)
  for (const p of world.players.values()) if (p.custody) step(world, p, dt);
}

function step(world, p, dt) {
  const c = p.custody, ped = p.ped, now = world.time;
  if (!ped || ped.removed) { p.custody = null; return; }
  if (c.stage === 'cell') { if (now >= c.until) release(world, p, 'Your time\'s up - you\'re free to go.'); else if (world.tick % 10 === 0) p.meDirty = true; return; }
  if (ped.dead) { onDeath(world, p); return; }   // (killed in custody: the usual death - the stars went with it)
  if (c.stage === 'walkin') { walkStep(world, p, dt); return; }
  p.seenAt = now; p.lastSeenX = ped.x; p.lastSeenY = ped.y;   // (the police have them)
  if (c.stage === 'held' || c.stage === 'fetch') {
    const h = live(world, c.holder);
    if (!holding(world, h, ped)) { escape(world, p, h && !h.dead ? 'You wriggled free - run!' : 'The officer holding you is down - you\'re free! Run!'); return; }
    pin(world, ped, h, dt);
    if (c.stage === 'held') { if (now >= c.until && !walkToCar(world, p)) fetch(world, p); return; }
    if (c.car && wrecked(live(world, c.car))) { c.car = 0; fetch(world, p, true); return; }   // (the car coming was wrecked: another)
    if (now >= c.until) { book(world, p); return; }   // (nothing got there in time: taken in anyway)
    // the car isn't coming (stuck, or going round in circles), or is taking too long: they can make a break for it
    const v = live(world, c.car);
    const stuck = v ? progress(c, Math.hypot(v.x - ped.x, v.y - ped.y), now) : 0;
    if (stuck > CUSTODY_STUCK_S || now - c.since > CUSTODY_WAIT_BREAK_S) offerBreak(world, p);
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

// The hold is over, and the officer who cuffed them came in a car close by, with room in the back and a clear way to it on
// foot: they get them up and walk them to it themselves (task #376) - no waiting for a car to come.
function walkToCar(world, p) {
  const c = p.custody, ped = p.ped, now = world.time, h = live(world, c.holder);
  if (!h || !h.npc || !h.npc.unit || h.vehId || ped.sub || floored(world, h)) return false;
  const v = live(world, h.npc.unit);
  if (wrecked(v) || !v.ai || v.ai.prisoner || v.def.kind !== 'car' || (v.lz || 0) > 0.3 || v.ferry) return false;
  if (police.crewOf(world, v).length >= v.seats.length || backSeat(v) < 0) return false;   // (no room in the back)
  const door = doorSpot(world, v, ped);
  if (Math.hypot(door.x - ped.x, door.y - ped.y) > ESCORT_WALK_PX || !clearWalk(world, ped.x, ped.y, door.x, door.y)) return false;
  c.car = v.id; v.ai.prisoner = p.pid; v.ai.fetcher = 0;
  Object.assign(c, { stage: 'escort', since: now, picked: false, best: undefined, brk: false });
  world.notify(p, 'The officer gets you up and walks you to their car.', 'bad');
  p.meDirty = true;
  return true;
}
// A clear way on foot from (x0, y0) to (x1, y1): no wall, building, counter or water on the straight line between - from
// a walk-in's door if it starts inside one (they're led out through it).
function clearWalk(world, x0, y0, x1, y1) {
  const m = world.map, wi = walkInAt(m, x0, y0);
  if (wi) { x0 = wi.x; y0 = wi.outY; }
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 12);
  for (let i = 1; i < n; i++) if (PED_BLOCK[m.tileAtPx(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)]) return false;
  return true;
}

// The hold is over: a car to take them in - one close by, or one sent.
function fetch(world, p, again = false) {
  const c = p.custody, ped = p.ped, now = world.time;
  c.stage = 'fetch'; c.since = now; c.best = undefined; c.brk = false;
  const h = live(world, c.holder);
  let v = pickCar(world, p, h);
  if (!v && !ped.sub) v = police.sendTransport(world, p);
  if (v) { c.car = v.id; v.ai.prisoner = p.pid; c.until = now + TRANSPORT_WAIT_S; }
  else { c.car = 0; c.until = now + 5; }   // (nothing can get to them: taken in anyway, in a moment)
  if (!again) world.notify(p, 'A police car\'s coming to take you in.', 'bad');
  p.meDirty = true;
}

// A police car to take them in: the holder's own unit's if it has a seat to spare, else the nearest other one within
// ESCORT_PX that isn't busy (NPC units only: a player officer's car is theirs to use - interaction()). One left empty
// further off than a walk to it (its crew all got out after the suspect on foot) only if one of them can go back for it
// (task #378: nobody did, and it never came).
function pickCar(world, p, h) {
  const ped = p.ped;
  let best = null, bd = ESCORT_PX;
  for (const vid of world.police || []) {
    const v = world.get(vid);
    if (wrecked(v) || !v.ai || v.ai.prisoner || v.ai.npcTarget || v.ai.call || v.def.kind !== 'car' || (v.lz || 0) > 0.3) continue;
    const crew = police.crewOf(world, v);
    if (!crew.length || crew.length >= v.seats.length) continue;   // (no room in the back)
    let d = Math.hypot(v.x - ped.x, v.y - ped.y);
    if (d > PICKUP_PX + 60 && !atWheel(world, v) && !fetcherOf(world, v, crew, h ? h.id : 0)) continue;   // (nobody to bring it)
    if (h && h.npc && h.npc.unit === v.id) d *= 0.3;   // (their own car first)
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
// an officer at the wheel of a police car
const atWheel = (world, v) => { const d = live(world, v.seats[0]); return !!(d && d.npc && !d.dead); };
// Who goes back for a police car left empty: the one of its crew on foot and on their feet nearest to it, not the one
// holding the prisoner - the one already on their way first.
function fetcherOf(world, v, crew, holder) {
  const was = v.ai && v.ai.fetcher ? live(world, v.ai.fetcher) : null;
  if (was && !was.dead && !was.vehId && was.id !== holder && was.npc && was.npc.unit === v.id && !floored(world, was)) return was;
  let best = null, bd = Infinity;
  for (const q of crew) {
    if (q.vehId || q.id === holder || floored(world, q)) continue;
    const d = Math.hypot(q.x - v.x, q.y - v.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

// The officer gets them up and walks them to the back door, the prisoner cuffed at their side (the officer waits for them
// if they fall behind); in they go.
function escortStep(world, p, dt) {
  const c = p.custody, ped = p.ped, now = world.time;
  const esc = live(world, c.holder), v = live(world, c.car);
  if (!esc || esc.dead || floored(world, esc)) { escape(world, p, 'The officer walking you is down - you\'re free! Run!'); return; }
  if (wrecked(v)) {   // the car's gone: back on the ground, and another one's found
    if (v && v.ai) v.ai.prisoner = null;
    lead(esc, 0);
    Object.assign(c, { car: 0, stage: 'held', until: now + 1, picked: false });
    pin(world, ped, esc, dt);
    return;
  }
  if (!c.picked) {
    // over to them, and up on their feet
    pin(world, ped, null, dt);
    if (Math.hypot(ped.x - esc.x, ped.y - esc.y) < 30) { c.picked = true; ped.downUntil = 0; c.side = ped.id & 1 ? 1 : -1; lead(esc, c.side); }
    else walk(world, esc, ped.x, ped.y, dt, 1);
    if (now - c.since > ESCORT_S) seat(world, p, v, esc);
    return;
  }
  const door = doorSpot(world, v, esc), at = besideOf(world, esc, c), lag = Math.hypot(at.x - ped.x, at.y - ped.y);
  walk(world, esc, door.x, door.y, dt, lag > 34 ? 0.25 : 0.85);
  // the prisoner keeps to it: the officer's pace, and closing on the spot
  const k = PED.walk * WALK.speedMul;
  let mx = (esc.vx + (at.x - ped.x) * 5) / k, my = (esc.vy + (at.y - ped.y) * 5) / k;
  if (Math.hypot(mx, my) < 0.08) { mx = 0; my = 0; }
  pedStep(ped, { bits: 0, mx, my, aim: ped.a }, dt, world.map, WALK);
  if (Math.hypot(door.x - ped.x, door.y - ped.y) < 40 || Math.hypot(v.x - ped.x, v.y - ped.y) < v.def.L / 2 + 20 || now - c.since > ESCORT_S) seat(world, p, v, esc);
}
// Where the prisoner walks: at the officer's side, a little behind their shoulder - or in their wake, a step behind, where
// that's in a wall or up against a post, a bin or the like
function besideOf(world, esc, c) {
  const cs = Math.cos(esc.a), sn = Math.sin(esc.a), s = c.side || 1;
  const x = esc.x - sn * 15 * s - cs * 3, y = esc.y + cs * 15 * s - sn * 3;
  if (!PED_BLOCK[world.map.tileAtPx(x, y)] && !propNear(world.map, x, y, 12)) return { x, y };
  return { x: esc.x - cs * 18, y: esc.y - sn * 18 };
}
// The officer walking them: a hand on their arm, on the side they walk (net.js es; the client draws it). 0: let go.
function lead(e, side) {
  if (!e || (e.escort || 0) === side) return;
  e.escort = side;
  e.appVer = (e.appVer || 0) + 1;
}
function propNear(m, x, y, r) {
  if (!m.solidProps) return false;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const a = m.solidProps.get(m.idx(tx + i, ty + j));
    if (a) for (const e of a) if (!e.off && Math.hypot(e.x - x, e.y - y) < e.r + r) return true;
  }
  return false;
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
  lead(esc, 0);
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
  Object.assign(c, { stage: 'ride', since: now, until: now + RIDE_MAX_S, holder: 0, station: st ? st.id : -1, blastSeen: v.blastAt || 0, hitSeen: v.hardHitAt || 0, best: undefined, brk: false });
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
        if (k && Math.hypot(v.x - k.x, v.y - k.y) < DROP_PX + 120) { c.station = st.id; delivered(world, p, o); book(world, p, v); return; }
      }
    }
    if (now >= c.until) book(world, p);
    return;
  }
  if (drv && !(drv.npc && drv.npc.role === 'cop')) { escape(world, p, 'Someone\'s taken the police car - the cuffs come off!'); return; }
  if (!drv && !police.crewOf(world, v).length) { vehicles.ejectPed(world, ped, true); escape(world, p, 'Nobody\'s left to take you in - you slip out of the car. Run!'); return; }
  const k = kerbOf(world, c.station);
  const d = k ? Math.hypot(v.x - k.x, v.y - k.y) : 0;
  if (k && d < DROP_PX) { book(world, p, v); return; }   // (pulled up outside: walked in)
  if (now >= c.until) { book(world, p); return; }
  // stuck, or going round in circles: after a while they can make a break for it, and in the end the police get them
  // there anyway (the user's 2026-10-08 notes: never stuck for ever in the back of a police car)
  const stuck = progress(c, d, now);
  if (stuck > CUSTODY_SKIP_S) { book(world, p); return; }
  if (stuck > CUSTODY_STUCK_S) offerBreak(world, p);
}
// how long the car has got no nearer (by 40 px) to where it's going
function progress(c, d, now) {
  if (c.best === undefined || d < c.best - 40) { c.best = d; c.bestAt = now; }
  return now - c.bestAt;
}
function offerBreak(world, p) {
  const c = p.custody;
  if (c.brk) return;
  c.brk = true;
  world.notify(p, c.stage === 'ride' ? 'The car\'s going nowhere - make a break for it?' : 'The car isn\'t coming - make a break for it?', 'info');
  p.meDirty = true;
}
// Make a break for it (the action button): up and out and away - an escape, wanted again. The car stuck or not coming
// (offered: c.brk), it always works. Cuffed and held on the ground, or being walked to the car by an NPC officer (task #377),
// it's a try - no fighting needed: it works by the stars (rules.js BREAK_*), your strength (health, as in the struggle) and
// who has you, less each time it fails, a try every BREAK_RETRY_S.
const loose = (c) => c.stage === 'held' || c.stage === 'fetch' || c.stage === 'escort';
function canTry(world, p) {
  const c = p.custody, h = live(world, c.holder);
  return loose(c) && !!(h && h.npc) && !p.ped.vehId && world.time >= (c.tryAt || 0);
}
export const canBreak = (p, world = null) => !!(p.custody && p.custody.stage !== 'cell' && p.custody.stage !== 'walkin'
  && (p.custody.brk || (world ? canTry(world, p) : loose(p.custody))));
export function breakOut(world, p) {
  if (!canBreak(p, world)) return;
  const c = p.custody, ped = p.ped, now = world.time;
  if (!c.brk) {
    const h = live(world, c.holder), st = Math.max(1, Math.min(5, c.stars | 0));
    const chance = BREAK_CHANCE[st] * struggle.power(ped, now) / (STRUGGLE_KIND[h.archetype] ?? 1) * Math.pow(BREAK_FAIL_K, c.tries || 0);
    c.tries = (c.tries || 0) + 1; c.tryAt = now + BREAK_RETRY_S;
    world.emit(ped.x, ped.y, { e: 'struggle', x: ped.x, y: ped.y, id: ped.id });   // (a heave: the grunts and the scuffle)
    p.meDirty = true;
    if (world.rand() >= chance) { world.notify(p, 'The officer holds on to you - not this time.', 'bad'); return; }
    breakAway(world, p, h, st);
    return;
  }
  if (ped.vehId) { const v = world.get(ped.vehId); if (v) throwOut(world, ped, v, 60); else vehicles.ejectPed(world, ped, true); }
  const h = live(world, c.holder);
  if (h && h.npc && !h.vehId) knockBack(world, h, ped, Math.max(1, Math.min(5, c.stars | 0)));
  escape(world, p, 'You made a break for it - run!');
}
// Away from the officer who had them: they stumble back, or go over backwards or roll; the prisoner's up and off (a grace
// from the next tackle, as after the struggle), and the officers who come after them may trip (police.js stumble)
function breakAway(world, p, h, st) {
  const ped = p.ped, now = world.time;
  if (h && !h.dead) knockBack(world, h, ped, st);
  for (const vid of world.police || []) {
    const v = world.get(vid);
    if (!v || !v.ai || (v.ai.target !== p.pid && v.ai.prisoner !== p.pid)) continue;
    for (const q of police.crewOf(world, v)) {
      if (q === h || q.vehId || Math.hypot(q.x - ped.x, q.y - ped.y) > 360 || world.rand() >= BREAK_TRIP_SHARE[st]) continue;
      q.npc.tripAt = now + 0.4 + world.rand() * 1.8; q.npc.tripBy = now + 5;
    }
  }
  const a = h ? Math.atan2(ped.y - h.y, ped.x - h.x) : ped.a;
  escape(world, p, 'You broke away - run!');
  ped.downUntil = now; ped.graceUntil = now + STRUGGLE_GRACE_S;
  ped.vx = Math.cos(a) * 110; ped.vy = Math.sin(a) * 110; ped.a = a;
  world.emit(ped.x, ped.y, { e: 'breakfree', x: ped.x, y: ped.y, id: ped.id });
}
// The officer they broke away from: a stumble back on their feet, or now and then over backwards, or a roll (the knockdown
// event's k: the client lies them that way), down BREAK_KNOCK_S by the stars
function knockBack(world, h, ped, st) {
  const now = world.time, a = Math.atan2(h.y - ped.y, h.x - ped.x) || 0, d = BREAK_KNOCK_S[st], r = world.rand();
  h.kneelUntil = 0; h.rollT = 0; h.pinning = 0;
  if (r < 0.5) {
    h.vx = Math.cos(a) * 150; h.vy = Math.sin(a) * 150;
    h.staggerUntil = now + d * 0.6;
    world.emit(h.x, h.y, { e: 'react', id: h.id, d: Math.round(d * 6) / 10, a: Math.round(a * 100) / 100 });
  } else {
    const k = r < 0.78 ? 'B' : 'R';
    h.vx = Math.cos(a) * (k === 'R' ? 200 : 120); h.vy = Math.sin(a) * (k === 'R' ? 200 : 120);
    h.downUntil = Math.max(h.downUntil || 0, now + d);
    world.emit(h.x, h.y, { e: 'knockdown', x: h.x, y: h.y, id: h.id, k, d: Math.round(d * 10) / 10 });
  }
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
  if (c) lead(live(world, c.holder), 0);
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
  if (p.custody.stage === 'walkin') endWalk(world, p.custody);
  releaseCar(world, p.custody);
  lead(live(world, p.custody.holder), 0);
  p.custody = null;
  cuff(p.ped, false);
}

// ---- the cell -------------------------------------------------------------------------------------------------------------
// Booked: fined, the contraband and illegal guns taken, the stars wiped - and JAIL_S in a cell, or the bail. Brought to
// the kerb outside (car): two officers walk them in from the back of it; otherwise (turned themself in, logged out, the
// car never got there) they're put straight in a cell.
function book(world, p, car = null) {
  const c = p.custody, ped = p.ped;
  releaseCar(world, c);
  lead(live(world, c.holder), 0);
  const st = (world.map.pois[c.station] && world.map.pois[c.station].kind === 'police' ? world.map.pois[c.station] : null) || nearestStation(world, ped.x, ped.y);
  const taken = confiscate(world, p, c.stars);
  law.clearWanted(world, p);
  p.profile.peakWanted = 0; p.disguised = false;
  const bail = BAIL_PER_STAR * c.stars, b = cells.blockOf(world, st.id);
  if (car && b >= 0 && ped.vehId === car.id && !ped.dead) {
    walkIn(world, p, st, b, car, JAIL_S, bail, c.stars, c.by);
    world.notify(p, `Booked at ${st.label}: ${taken}. Walked in to the cells - ${JAIL_S}s, or pay the $${bail} bail.`, 'bad');
    return;
  }
  if (ped.vehId) vehicles.ejectPed(world, ped, true);
  cuff(ped, false);
  jail(world, p, st, JAIL_S, bail, c.stars, c.by);
  world.notify(p, `Booked into a cell at ${st.label}: ${taken}. Out in ${JAIL_S}s - or pay the $${bail} bail.`, 'bad');
}
// into a cell at station st for `secs` (cell: the one they were walked to, else the one with the fewest in it)
function jail(world, p, st, secs, bail, stars, by, cell = null) {
  const ped = p.ped, now = world.time;
  if (ped.vehId) vehicles.ejectPed(world, ped, true);
  cuff(ped, false);
  cells.clearPose(ped);
  ped.vx = 0; ped.vy = 0; ped.rollT = 0; ped.downUntil = 0; ped.stunUntil = 0; ped.lz = 0; ped.sub = false; ped.ug = 0; ped.fishing = null;
  const b = cell ? cell.b : cells.blockOf(world, st.id);
  if (b < 0) {   // (a station with no cells - none now: the old holding cell, out of sight)
    ped.hidden = true; ped.inside = null; ped.interior = { kind: 'jail', poi: st.id };
    ped.x = st.x; ped.y = st.y;
  } else {
    if (!cell) cells.regulars(world, b);   // (a couple of others doing time there: task #380)
    const c = cell ? cell.c : cells.cellFor(world, b), cl = cells.blocks(world)[b].cells[c];
    // (a spot of their own: not on top of a cellmate)
    if (!inCellRect(cl, ped.x, ped.y) || cells.crowded(world, ped)) { const s = cells.spotIn(world, b, c, ped); ped.x = s.x; ped.y = s.y; }
    ped.hidden = false; ped.inside = null; ped.interior = null; ped.a = cl.a;
    cell = { b, c };
  }
  world.place(ped);
  p.teleportAt = now;
  p.custody = { stage: 'cell', since: now, until: now + secs, station: st.id, bail, stars, by, cell: b >= 0 ? cell : null };
  p.meDirty = true;
  store.touch();
}

// ---- walked in: out of the back of the car, through the station's door, down the corridor and into a cell ---------------
function walkIn(world, p, st, b, car, secs, bail, stars, by) {
  cells.regulars(world, b);   // (a couple of others doing time there: task #380)
  const ped = p.ped, now = world.time, k = cells.blocks(world)[b], ci = cells.cellFor(world, b), cell = k.cells[ci];
  vehicles.ejectPed(world, ped, true, { x: k.door.x, y: k.door.outY });
  ped.vx = 0; ped.vy = 0; ped.downUntil = 0; ped.rollT = 0;
  // in through the door to a spot of their own in the cell (kept for them on the way: cells.isFree)
  const spot = cells.spotIn(world, b, ci, ped), inside = { x: cell.door.x, y: (cell.y0 + cell.y1) / 2 };
  const route = [{ x: k.door.x, y: k.door.outY }, { x: k.door.x, y: k.door.inY }, { x: k.gap.x, y: k.gap.lobbyY }, { x: k.gap.x, y: k.corridorY },
    { x: cell.door.x, y: k.corridorY }, inside];
  if (Math.hypot(spot.x - inside.x, spot.y - inside.y) > NEAR_WP) route.push({ x: spot.x, y: spot.y });
  // two officers from the station take them out of the back
  const esc = [0, 1].map((i) => {
    const e = spawnNpc(world, 'cop', ped.x + (i ? -1 : 1) * 22, ped.y + (i ? 10 : -6), 'cop');
    e.npc.desk = { x: e.x, y: e.y, a: e.a };   // (npc.js leaves them be: walkStep walks them)
    e.npc.jailer = true; e.despawnable = false;
    return e;
  });
  p.custody = { stage: 'walkin', since: now, until: now + CELL_WALK_S, station: st.id, bail, stars, by, secs, cell: { b, c: ci }, route, i: 0, at: 4,
    spot: { x: spot.x, y: spot.y }, lead: esc[0].id, rear: esc[1].id, best: undefined, bestAt: now, bestI: 0, car: 0, brk: false };
  p.meDirty = true;
  store.touch();
}
const NEAR_WP = 7;
function walkStep(world, p, dt) {
  const c = p.custody, ped = p.ped, now = world.time, R = c.route, last = R.length - 1, at = c.at ?? last - 1;   // (at: in front of the cell's door)
  const lead = live(world, c.lead), rear = live(world, c.rear);
  // anything wrong on the way (an officer down, stuck, too long): they're put in the cell anyway
  if (!lead || lead.dead || !rear || rear.dead || now >= c.until) { lockIn(world, p); return; }
  if (c.i >= at && Math.hypot(R[at].x - ped.x, R[at].y - ped.y) < 60) cells.setDoor(world, c.cell.b, c.cell.c, true);
  // the prisoner, cuffed, at a walk along the way in (slower while the officer in front gets back in front)
  const wp = R[c.i], inp = seek(ped, wp.x, wp.y, false);
  const ahead = (lead.x - ped.x) * inp.mx + (lead.y - ped.y) * inp.my;
  pedStep(ped, inp, dt, world.map, ahead < 16 && c.i < at ? { ...WALK, speedMul: 0.5 } : WALK);
  if (Math.hypot(wp.x - ped.x, wp.y - ped.y) < NEAR_WP) {
    if (c.i === last) { lockIn(world, p); return; }
    c.i++;
  }
  const d = Math.hypot(R[c.i].x - ped.x, R[c.i].y - ped.y);
  if (c.best === undefined || c.bestI !== c.i || d < c.best - 10) { c.best = d; c.bestAt = now; c.bestI = c.i; }
  if (now - c.bestAt > 6) { lockIn(world, p); return; }   // (stuck)
  // an officer a step ahead of them and one a step behind, on the line they're walking; at the cell the one in front
  // stands aside by the door
  const cell = cells.blocks(world)[c.cell.b].cells[c.cell.c];
  const to = R[c.i], dd = Math.hypot(to.x - ped.x, to.y - ped.y);
  const ux = dd > 1 ? (to.x - ped.x) / dd : Math.cos(ped.a), uy = dd > 1 ? (to.y - ped.y) / dd : Math.sin(ped.a);
  const lt = c.i >= at ? { x: cell.door.x + 30, y: R[at].y } : { x: ped.x + ux * Math.min(36, dd + 14), y: ped.y + uy * Math.min(36, dd + 14) };
  escortMove(world, lead, lt.x, lt.y, dt, ped);
  if (c.i <= at) escortMove(world, rear, ped.x - ux * 30, ped.y - uy * 30, dt, ped); else escortMove(world, rear, cell.door.x - 30, R[at].y, dt, ped);   // (the other side of the door)
}
function escortMove(world, e, x, y, dt, face) {
  if (floored(world, e)) return;
  const d = Math.hypot(x - e.x, y - e.y);
  if (d < NEAR_WP) hold(e, face);
  else pedStep(e, sidestep(world, e, seek(e, x, y, d > 50), dt), dt, world.map, { ...players.pedMods(world, e), speedMul: d > 20 ? 1.3 : 0.95 });
  e.npc.desk = { x: e.x, y: e.y, a: e.a };
}
function hold(e, face) { e.vx = 0; e.vy = 0; if (face) e.a = Math.atan2(face.y - e.y, face.x - e.x); e.npc.desk = { x: e.x, y: e.y, a: e.a }; }
// In the cell: the cuffs off, the door locked behind them; the officers go back to the front.
function lockIn(world, p) {
  const c = p.custody, st = world.map.pois[c.station];
  endWalk(world, c);
  jail(world, p, st, c.secs, c.bail, c.stars, c.by, c.cell);
  cells.setDoor(world, c.cell.b, c.cell.c, false);
  world.notify(p, 'The cuffs come off and the door locks behind you. Walk round, sit, use the toilet or hold the bars.', 'info');
}
function endWalk(world, c) {
  const k = c.cell ? cells.blocks(world)[c.cell.b] : null;
  for (const id of [c.lead, c.rear]) {
    const e = live(world, id);
    if (e && e.npc) cells.dismiss(world, e, k ? { x: k.gap.x, y: k.corridorY } : null);
  }
  c.lead = 0; c.rear = 0;
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
  const hot = hotmoney.confiscate(world, p);   // (the robbery bag)
  if (hot) bits.push(`the robbery bag ($${hot.toLocaleString('en-US')} hot money) confiscated`);
  return bits.join(', ');
}
// Free: the cell door opens and they're out of the station's front door (the lobby, if it had no cells)
function release(world, p, msg) {
  const c = p.custody, ped = p.ped;
  p.custody = null;
  if (!ped || ped.dead) return;
  const st = world.map.pois[c.station] || nearestStation(world, ped.x, ped.y);
  const k = c.cell ? cells.blocks(world)[c.cell.b] : null;
  cells.clearPose(ped);
  ped.hidden = false; ped.interior = null; ped.inside = null;
  if (k) { cells.setDoor(world, c.cell.b, c.cell.c, true); ped.x = k.door.x + (world.rand() - 0.5) * 20; ped.y = k.door.outY; ped.a = k.south ? Math.PI / 2 : -Math.PI / 2; }
  else { ped.x = st.x + (world.rand() - 0.5) * 16; ped.y = st.y; }
  ped.vx = 0; ped.vy = 0;
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

// Logging out in custody: booked on the spot (no escaping by quitting) and kept in the cell. Back within the ghost
// window, they're still there; later, the time they had left is saved with the character (saveJail) and they wake up
// in the cell when they next play (onJoin). Time offline doesn't count: no serving it by logging off.
export function onLeave(world, p) {
  if (!p.custody) return;
  if (p.custody.stage === 'walkin') lockIn(world, p);
  else if (inCustody(p)) book(world, p);
}
export function saveJail(world, p) {
  const c = p.custody;
  if (c && c.stage === 'cell') {
    p.profile.jail = { left: Math.max(1, Math.ceil(c.until - world.time)), station: c.station, bail: c.bail, stars: c.stars };
    p.custody = null;
    store.touch();
  }
}
export function onJoin(world, p) {
  const j = p.profile.jail, ped = p.ped;
  if (!j) return;
  delete p.profile.jail;
  store.touch();
  if (!ped || ped.dead || !(j.left > 0)) return;
  const st = (world.map.pois[j.station] && world.map.pois[j.station].kind === 'police' ? world.map.pois[j.station] : null) || nearestStation(world, ped.x, ped.y);
  if (!st) return;
  jail(world, p, st, j.left, j.bail || BAIL_PER_STAR * (j.stars || 1), j.stars || 1, null);
  world.notify(p, `Still in your cell at ${st.label}: ${j.left}s left - or pay the $${p.custody.bail} bail.`, 'warn');
}

// ---- the car taking them in (police.js runUnit, while v.ai.prisoner) ----------------------------------------------------
export function runCar(world, v, crew, dt) {
  const p = world.players.get(v.ai.prisoner), c = p && p.custody;
  if (!c || c.car !== v.id || c.stage === 'cell' || !p.ped) { v.ai.prisoner = null; return; }   // (done: a unit again next tick)
  const ped = p.ped, now = world.time;
  let drv = live(world, v.seats[0]);
  if (c.stage === 'held' || c.stage === 'fetch') {
    // come and get them (to the door, when they're in a shop), and stand round them meanwhile
    const wi = walkInAt(world.map, ped.x, ped.y), kb = wi ? doorKerb(world, wi) : null, gx = kb ? kb.x : ped.x, gy = kb ? kb.y : ped.y;
    const d = Math.hypot(v.x - gx, v.y - gy);
    v.sirenOn = d > 600;
    let fx = null;
    if (d > PICKUP_PX && drv && drv.npc) route(world, v, gx, gy, d < 450 ? 170 : 460);
    else {
      halt(v);
      if (d > PICKUP_PX) {
        // nobody at the wheel - they all got out after the suspect on foot: one of them runs back for it and drives it over
        // (task #378: the car sat there empty and never came); nobody left who can, and another car is sent
        fx = fetcherOf(world, v, crew, c.holder);
        if (!fx) { v.ai.prisoner = null; v.ai.fetcher = 0; c.car = 0; fetch(world, p, true); return; }
        v.ai.fetcher = fx.id;
        toWheel(world, fx, v, dt);
      }
    }
    for (const q of crew) if (!q.vehId && q.id !== c.holder && q !== fx) guard(world, q, ped, dt);
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
  // keep to one plan: planning again every few seconds from whichever road node is nearest can send the car back the
  // way it came, then forward again (round and round) - only a new destination, or the car well off its route, replans
  // (well off it: further than 300 px from the stretch of route between the last waypoint and the next)
  const lost = ai.route && ai.route.length && segDist(v.x, v.y, ai.routePrev || ai.route[0], ai.route[0]) > 300;
  if (!ai.route || !ai.route.length || ai.routeKey !== key || lost || now - ai.routeAt > 25) {
    ai.route = trimBehind(planRoute(world, v.x, v.y, x, y), v); ai.routeAt = now; ai.routeKey = key; ai.routePrev = { x: v.x, y: v.y };
  }
  // on to the next waypoint once this one's reached (the faster, the sooner), or driven past while still on the line
  // of the route (never cutting a corner across: onto a bridge it'd be straight into the water beside it)
  const reach = Math.max(60, Math.min(110, Math.hypot(v.vx, v.vy) * 0.25));
  while (ai.route.length > 1) {
    const a = ai.route[0], b = ai.route[1], d = Math.hypot(a.x - v.x, a.y - v.y);
    const past = (v.x - a.x) * (b.x - a.x) + (v.y - a.y) * (b.y - a.y) > 0 && segDist(v.x, v.y, a, b) < 48;
    if (d < reach || past) ai.routePrev = ai.route.shift(); else break;
  }
  const wp = ai.route[0] || { x, y };
  driveToward(world, v, wp.x, wp.y, cornerSpeed(v, ai.route, speed), {});
}
// slow down for a sharp corner coming up (taken flat out, the car swings wide - off a bridge's end, into the water)
export function cornerSpeed(v, r, speed) {
  let sp = speed, px = v.x, py = v.y, h1 = null;
  for (let i = 0; i < Math.min(4, r.length - 1); i++) {
    const a = r[i], b = r[i + 1], dA = Math.hypot(a.x - v.x, a.y - v.y);
    if (dA > 300) break;
    h1 = Math.atan2(a.y - py, a.x - px);
    let turn = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - h1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn > 0.45) sp = Math.min(sp, 140 + dA * 0.5);
    px = a.x; py = a.y;
  }
  return sp;
}
// distance from (x, y) to the segment a-b
export function segDist(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2)) : 0;
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}
// A route starts at the road node nearest the car, which can be just behind it: turning back for it, then planning again
// from the next nearest, is how a car ends up going round in circles. Start from the first point ahead of the car instead
// (only the near ones are skipped: a car facing the wrong way still turns round for a route that goes back past it).
export function trimBehind(route, v) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  let i = 0;
  while (i < route.length - 1 && Math.hypot(route[i].x - v.x, route[i].y - v.y) < 200 && (route[i].x - v.x) * c + (route[i].y - v.y) * s < 20) i++;
  if (i) route.splice(0, i);
  return route;
}
// brake to a stop (the handbrake on once it's slow)
export function halt(v) {
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
  const wp = footWay(world, q, v.x, v.y);   // (out of a shop by its door, round whatever's in the way)
  pedStep(q, sidestep(world, q, seek(q, wp.x, wp.y, true), dt), dt, world.map, players.pedMods(world, q));
  if (Math.hypot(v.x - q.x, v.y - q.y) < v.def.L / 2 + 26) {
    const s = !v.seats[0] ? 0 : v.seats.findIndex((e) => !e);
    if (s >= 0) { v.seats[s] = q.id; q.vehId = v.id; q.seat = s; q.vx = 0; q.vy = 0; }
  }
}
// An officer going back for the police car to bring it over: at a run (out of a shop by its door, round whatever's in the
// way), and in behind the wheel.
function toWheel(world, q, v, dt) {
  if (floored(world, q)) return;
  if (Math.hypot(v.x - q.x, v.y - q.y) < v.def.L / 2 + 26) {
    const s = !v.seats[0] ? 0 : v.seats.findIndex((e) => !e);
    if (s >= 0) { v.seats[s] = q.id; q.vehId = v.id; q.seat = s; q.vx = 0; q.vy = 0; world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y }); }
    return;
  }
  const wp = footWay(world, q, v.x, v.y);
  pedStep(q, sidestep(world, q, seek(q, wp.x, wp.y, true), dt), dt, world.map, players.pedMods(world, q));
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
  if (c.stage === 'walkin') return { s: 'walkin', at: st ? st.label : '', brk: 0 };
  const o = c.driver ? world.players.get(c.driver) : null;
  // brk: the action button makes a break for it now; stuck: the car isn't coming, or is going nowhere (offerBreak)
  return { s: c.stage, at: st ? st.label : '', by: o ? o.name : null, brk: canBreak(p, world) ? 1 : 0, stuck: c.brk ? 1 : 0 };
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
