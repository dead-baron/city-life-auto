// The streets coming alive (the owner, 2026-10-10) - now and then (rules.js STREET_EVERY_S), near someone out in town,
// one of these happens, never the same kind twice running and never two at once:
//   - a street race (at night): a pack of sports cars and sport bikes flat out through the streets, through the lights,
//     along real roads (the lane graph: traffic.js with a goal and reckless on) to a finish line a few blocks off - where
//     they scatter into ordinary traffic and drive off, and are cleared away out of sight. "You just want to get out of
//     the way." Police who see it (a patrol happening on it: STREET_RACE_COPS, or any police car or officer in sight of
//     a racer) go after the racers - the racer they're after runs for it.
//   - a police chase: a getaway car flat out with a squad car on its tail, sirens on. It ends in a crash, an arrest
//     (stopped or boxed in: the crew drag the driver out and cuff them - police.js runCarUnit) or an escape.
//   - an armored truck's run: an IronVault van carrying valuables from one bank (or the like) to another far across the
//     map, two guards aboard (a third in the back, sometimes), sometimes a squad car escorting it. Attacked, it stops and
//     the guards get out and fight; blown up, its cargo spills out of the back as crates; or a player who gets to its back
//     while it's stopped and holds ACT a few seconds (ARMORED_UNLOCK_S) has it open: the crates fall out, the alarm goes
//     off, the guards come for them and it's armed robbery (police heat).
// And the police go after NPC crooks they see - on foot (police.js patrols, task #395) and now in cars: any police car or
// officer in sight of a racer or a getaway car with nobody after it gives chase (task #242), at most a few at a time.
// Each shows on the radar and in the phone's city feed (events.js); the players near get a line about it.
import { K } from '../../shared/constants.js';
import { lanePath } from '../../shared/roads.js';
import { pointAt } from '../../shared/geom.js';
import { localToWorld } from '../../shared/math.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { IN } from '../../shared/input.js';
import { mulberry32 } from '../../shared/rng.js';
import { STREET_EVERY_S, STREET_RACE_COPS, ARMORED_ESCORT, ARMORED_UNLOCK_S } from '../../shared/rules.js';
import { inAnyView } from '../view.js';
import { spawnNpc, startFight } from './npc.js';
import { enterEdge, joinTraffic } from './traffic.js';
import { deadWay } from './roadends.js';
import { wildStyle } from './wildlife.js';
import * as events from './events.js';
import * as police from './police.js';
import * as vehicles from './vehicles.js';
import * as law from './law.js';

let rng = mulberry32(2420);
export function setRng(r) { rng = r; }

const KINDS = ['race', 'chase', 'armored'];
const EV_KIND = { race: 'streetrace', chase: 'copchase', armored: 'armored' };
const RACERS = [['sports', 5], ['bike', 3], ['caferacer', 2]];
const GETAWAY = [['sedan', 4], ['sports', 3], ['compact', 2], ['pickup', 2]];
const RACE_SPEED = 640, GETAWAY_SPEED = 580;   // px/s: how fast they'd go (each no faster than its vehicle can)
const RACE_LEN = 3600;        // px: the finish line about this far on past the player they come by
const RACE_S = 100;           // a race is over after this long, finished or not
const FINISH_PX = 240;        // over the line: this close to it
const VIA_PX = 320;           // past the player they come by: this close to the junction nearest them
const CHASE_S = 160;          // a police chase gives out after this long (the police have their own limit too)
const ARMORED_S = 480;        // an armored truck's run: at most this long
const ARMORED_RUN = [2600, 7500]; // px: its two places this far apart (on the same land: no bridges out to the islands)
const ARRIVED_PX = 300;       // there: this close to the place it's taking the valuables to
const BACK_REACH = 46;        // px: stand this close to the doors at the back to get them open
const SEE_PX = 650;           // a police car or an officer this close (and in sight) sees a racer or a getaway car
const NPC_CAR_CHASES = 3;     // at most this many squad cars after NPC drivers at once (the streets don't fill with chases)
const VALUABLE = ['bank', 'pawn', 'airport'];   // where an armored truck runs between (banks first)

const S = (world) => (world.street ??= { live: [], nextAt: 0, last: '' });
const weighted = (mix) => { let tot = 0; for (const [, w] of mix) tot += w; let r = rng() * tot; for (const [id, w] of mix) { r -= w; if (r <= 0) return id; } return mix[0][0]; };
const bbox = (e) => e.bb || (e.bb = e.pts.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }));
const nobodyNear = (world, x, y, r) => { for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - x, p.ped.y - y) < r) return false; return true; };

// A street lane off every screen round (x, y), r0-r1 px away: a ground-level road (no alley, dirt track or ramp) long
// enough for a pack to line up on, with nothing on it there. { e, from, s, p } or null.
function laneSpot(world, x, y, r0, r1, room = 300) {
  const net = world.map.net;
  if (!net) return null;
  const cands = net.edges.filter((e) => { const b = bbox(e); return e.lvl === 0 && e.kind !== 'alley' && e.kind !== 'dirt' && e.kind !== 'drive' && e.len > room + 160 && b.x1 > x - r1 && b.x0 < x + r1 && b.y1 > y - r1 && b.y0 < y + r1; });
  for (let k = 0; k < 60 && cands.length; k++) {
    const e = cands[Math.floor(rng() * cands.length)];
    let from = e.oneway || rng() < 0.5 ? e.a : e.b;
    if (!e.oneway && deadWay(net, e.id, from)) from = from === e.a ? e.b : e.a;
    if (deadWay(net, e.id, from)) continue;
    const lp = lanePath(net, e, from, 0), L = lp[lp.length - 1].s;
    const s = room + 20 + rng() * Math.max(1, L - room - 80);
    const p = pointAt(lp, Math.min(s, L - 40));
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < r0 || d > r1 || wildStyle(world.map, p.x, p.y)) continue;
    if (!nobodyNear(world, p.x, p.y, 320) || inAnyView(world, p.x, p.y, 180)) continue;
    if (world.query(p.x, p.y, 140, K.VEH).length) continue;
    return { e, from, s: Math.min(s, L - 40), p };
  }
  return null;
}

// A vehicle with an NPC at the wheel, on lane `lane` of spot's road `back` px behind its point, rolling, driving on the
// lanes toward goal. who: the driver's archetype.
function driven(world, model, spot, lane, back, who, ai) {
  const net = world.map.net, e = spot.e;
  lane = Math.min(lane, e.nl - 1);
  const lp = lanePath(net, e, spot.from, lane), L = lp[lp.length - 1].s;
  const s = Math.max(10, Math.min(L - 30, spot.s - back));
  const p = pointAt(lp, s);
  const v = world.spawnVehicle(model, p.x, p.y, Math.atan2(p.ty, p.tx), {});
  v.lz = 0; v.despawnable = false; v.onEvent = true;
  const sp0 = Math.min(v.def.max * 0.5, 260);
  v.vx = p.tx * sp0; v.vy = p.ty * sp0;
  const d = spawnNpc(world, who, p.x, p.y, 'driver');
  d.vehId = v.id; d.seat = 0; v.seats[0] = d.id; d.lz = 0; d.npc.keep = true;
  v.ai = { kind: 'traffic', ...ai };
  enterEdge(world, v, e.id, spot.from, lane, s + 30);
  world.trafficCount = (world.trafficCount || 0) + 1;
  return v;
}
// back to being ordinary traffic: no goal, no hurry, cleared away once out of everyone's sight (traffic.js manage)
function letGo(world, v) {
  if (!v || v.removed) return;
  v.despawnable = true; v.onEvent = false;
  if (v.ai && v.ai.kind === 'traffic') { v.ai.goal = null; v.ai.reckless = 0; }
  const d = v.seats[0] ? world.get(v.seats[0]) : null;
  if (d && d.npc) d.npc.keep = false;
}
// A goal for a driver (traffic.js chooseExit): the junction nearest (x, y), and how far every junction is from it by road
// (Dijkstra on the lanes, one-way streets honoured) - so they take the real way there, round the river and the blocks.
function nodeNear(world, x, y) {
  const n = world.map.nearestNode(Math.max(0, x), Math.max(0, y));
  return n ? { x: n.x, y: n.y, node: n.id, dist: distField(world.map.net, n.id) } : { x, y };
}
export function distField(net, goal) {
  const cache = (net._fields ||= new Map());
  if (cache.has(goal)) return cache.get(goal);
  if (!net._rev) {   // who links to each junction (the reverse of each one's links)
    net._rev = net.nodes.map(() => []);
    for (const n of net.nodes) for (const [eid, to] of Object.entries(n.links)) net._rev[to].push([n.id, net.edges[+eid].len]);
  }
  const N = net.nodes.length, dist = new Float64Array(N).fill(Infinity), done = new Uint8Array(N);
  dist[goal] = 0;
  for (;;) {
    let u = -1, bu = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bu) { bu = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const [from, len] of net._rev[u]) if (dist[u] + len < dist[from]) dist[from] = dist[u] + len;
  }
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  cache.set(goal, dist);
  return dist;
}
// a point px away from (x, y), straight away from (fx, fy), on the road network
const awayFrom = (world, x, y, fx, fy, px) => { const a = Math.atan2(y - fy, x - fx); return nodeNear(world, x + Math.cos(a) * px, y + Math.sin(a) * px); };

// ---- starting one ----------------------------------------------------------------------------------------------------
function start(world, kind, p) {
  const at = p.ped;
  if (!at || !world.map.net) return null;
  if (kind === 'race') {
    const spot = laneSpot(world, at.x, at.y, 650, 1250, 380);
    if (!spot) return null;
    // the course: by the player first (they come past, flat out), then to the finish a good few blocks on past them
    const via = nodeNear(world, at.x, at.y), goal = awayFrom(world, at.x, at.y, spot.p.x, spot.p.y, RACE_LEN);
    const n = 3 + Math.floor(rng() * 3), lanes = Math.max(1, Math.min(2, spot.e.nl)), racers = [];
    for (let i = 0; i < n; i++) racers.push(driven(world, weighted(RACERS), spot, i % lanes, Math.floor(i / lanes) * 130, rng() < 0.5 ? 'hustler' : 'casual', { goal: via, reckless: RACE_SPEED * (0.94 + rng() * 0.08) }).id);
    const racerIds = [];
    for (const id of racers) { const d = world.get(world.get(id).seats[0]); d.npc.racer = true; racerIds.push(d.id); }
    const ev = events.add(world, { kind: 'streetrace', x: spot.p.x, y: spot.p.y, until: world.time + RACE_S + 30, text: 'Street race tearing through the streets' });
    Object.assign(ev, { sl: 'race', racers, racerIds, via, goal, done: [], copsAt: rng() < STREET_RACE_COPS ? world.time + 8 + rng() * 14 : 0, ends: world.time + RACE_S });
    events.tellNear(world, ev.x, ev.y, 'Engines screaming - a street race is coming through. Get out of the way!', 'warn');
    return ev;
  }
  if (kind === 'chase') {
    const spot = laneSpot(world, at.x, at.y, 600, 1150, 320);
    if (!spot) return null;
    // it comes by the player, then on away beyond them
    const via = nodeNear(world, at.x, at.y), goal = awayFrom(world, at.x, at.y, spot.p.x, spot.p.y, 2200);
    const car = driven(world, weighted(GETAWAY), spot, 0, 0, rng() < 0.6 ? 'hustler' : 'mugger', { goal: via, reckless: GETAWAY_SPEED });
    const crook = world.get(car.seats[0]);
    crook.npc.flagged = true; crook.npc.getaway = true;
    // the squad car on its tail, on the same lane behind it
    const lp = lanePath(world.map.net, spot.e, spot.from, 0), q = pointAt(lp, Math.max(5, spot.s - 190));
    const unit = police.carUnitAt(world, q.x, q.y, Math.atan2(q.ty, q.tx), car);
    unit.vx = q.tx * 240; unit.vy = q.ty * 240;
    const ev = events.add(world, { kind: 'copchase', x: car.x, y: car.y, until: world.time + CHASE_S + 30, text: 'Police chasing a getaway car' });
    Object.assign(ev, { sl: 'chase', car: car.id, crook: crook.id, unit: unit.id, via, goal, ends: world.time + CHASE_S });
    law.logDispatch(world, 'Pursuit: a getaway car', car.x, car.y, null, 2, 'patrol');
    events.tellNear(world, ev.x, ev.y, 'Sirens - the police are chasing a getaway car this way!', 'warn');
    return ev;
  }
  if (kind === 'armored') {
    // where it sets off from (a street round the player, out of sight) and where it's taking the valuables
    let spot = null, places = [], far = [];
    for (let k = 0; k < 5 && !far.length; k++) {
      spot = laneSpot(world, at.x, at.y, 550, 1200, 260);
      if (!spot) continue;
      const isl = !!world.map.net.nodes[spot.from].island;
      places = [];
      for (const kind of VALUABLE) for (const q of world.map.poisOf(kind)) { const n = world.map.nearestNode(q.x, q.y); if (n && !!n.island === isl && !wildStyle(world.map, q.x, q.y)) places.push(q); }
      far = places.filter((q) => { const d = Math.hypot(q.x - spot.p.x, q.y - spot.p.y); return d > ARMORED_RUN[0] && d < ARMORED_RUN[1]; });
    }
    if (!spot || !far.length) return null;
    const banks = far.filter((q) => q.kind === 'bank');
    const to = (banks.length ? banks : far)[Math.floor(rng() * (banks.length || far.length))];
    let from = null, bd = Infinity;
    for (const q of places) { const d = Math.hypot(q.x - spot.p.x, q.y - spot.p.y); if (d < bd) { bd = d; from = q; } }
    const goal = nodeNear(world, to.x, to.y);
    const van = driven(world, 'armored', spot, 0, 0, 'cop', { goal });
    const guard2 = spawnNpc(world, 'cop', van.x, van.y, 'driver');
    guard2.vehId = van.id; guard2.seat = 1; van.seats[1] = guard2.id; guard2.npc.keep = true;
    for (const g of [world.get(van.seats[0]), guard2]) { g.weapon = rng() < 0.5 ? 'smg' : 'pistol'; g.npc.armored = van.id; }
    // the valuables: 3-5 crates, steel and iron mostly, now and then carbon-gold
    const load = [];
    for (let i = 3 + Math.floor(rng() * 3); i > 0; i--) { const r = rng(); load.push(r < 0.15 ? 3 : r < 0.6 ? 2 : 1); }
    let escort = 0;
    if (rng() < ARMORED_ESCORT) {
      const lp = lanePath(world.map.net, spot.e, spot.from, 0), q = pointAt(lp, Math.max(5, spot.s - 200));
      escort = police.escortUnit(world, q.x, q.y, Math.atan2(q.ty, q.tx), van).id;
    }
    const where = world.map.districtAt(to.x, to.y);
    const ev = events.add(world, { kind: 'armored', x: van.x, y: van.y, until: world.time + ARMORED_S + 30, text: `IronVault armored truck moving valuables${where ? ` to ${where.name}` : ''}` });
    Object.assign(ev, { sl: 'armored', van: van.id, guards: [van.seats[0], guard2.id], back: rng() < 0.5 ? 1 : 0, load, goal, from: from ? from.kind : '', to: to.kind, escort, hp: van.hp, alarm: false, ends: world.time + ARMORED_S });
    events.tellNear(world, ev.x, ev.y, 'An IronVault armored truck is on the move nearby - guarded.', 'info');
    return ev;
  }
  return null;
}

function finish(world, ev, how) {
  ev.until = 0; ev.how = how;   // (events.js drops it on its next pass)
  const esc = ev.escort && world.get(ev.escort);
  if (esc && esc.ai && esc.ai.escort) esc.ai.escort = 0;   // (the escort's job is done: it drives off)
  const st = S(world);
  st.live = st.live.filter((e) => e !== ev);
}

// ---- running them ----------------------------------------------------------------------------------------------------
export function update(world, dt) {
  const st = S(world), now = world.time;
  if (world.tick % 5 === 1) {
    for (const ev of [...st.live]) {
      if (ev.sl === 'race') stepRace(world, ev);
      else if (ev.sl === 'chase') stepChase(world, ev);
      else if (ev.sl === 'armored') stepArmored(world, ev, dt * 5);
    }
  }
  if (world.vaultHold && world.vaultHold.size) holdStep(world);
  if (world.tick % 20 !== 9) return;
  copsSee(world);
  // something new, now and then, near someone out in town
  st.nextAt ||= now + STREET_EVERY_S * 0.6;
  if (now < st.nextAt || !world.players.size) return;
  st.nextAt = now + STREET_EVERY_S * (0.6 + rng() * 0.8);
  if (st.live.length || world.npcBudget <= 0 || world.npcCount + (world.trafficCount || 0) > world.npcBudget) return;
  const ps = [...world.players.values()].filter((q) => q.ped && !q.ped.dead && !q.ped.hidden && !q.ped.sub && !q.ped.ug && !q.ped.interior && !q.custody && !wildStyle(world.map, q.ped.x, q.ped.y));
  if (!ps.length) return;
  const p = ps[Math.floor(rng() * ps.length)];
  const kinds = KINDS.filter((k) => k !== st.last && (k !== 'race' || world.clock.isNight));
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  for (const k of kinds) { const ev = start(world, k, p); if (ev) { st.live.push(ev); st.last = k; break; } }
}

// (dev and tests: start one now, near this player - a race at any hour)
export function startNow(world, kind, p) {
  const k = kind === 'streetrace' ? 'race' : kind === 'copchase' ? 'chase' : kind;
  const ev = start(world, k, p);
  if (ev) { S(world).live.push(ev); S(world).last = k; }
  return ev;
}
export const live = (world) => S(world).live;

function stepRace(world, ev) {
  const now = world.time;
  let lead = null, ld = Infinity;
  for (const id of ev.racers) {
    if (ev.done.includes(id)) continue;
    const v = world.get(id);
    const drv = v && v.seats[0] ? world.get(v.seats[0]) : null;
    if (!v || v.removed || v.wreckAt || !drv || drv.dead || !drv.npc || !v.ai) { ev.done.push(id); letGo(world, v); continue; }   // (out of it)
    // after them: they run for it, away from the squad car
    const cop = police.carChasers(world, v)[0];
    if (cop) {
      if (!ev.busted) { ev.busted = true; events.feed(world, { kind: 'news', text: 'Police broke up a street race', x: v.x, y: v.y }); }
      if (now > (v.ai.reGoalAt || 0)) { v.ai.reGoalAt = now + 6; v.ai.goal = awayFrom(world, v.x, v.y, cop.x, cop.y, 2000); }
      continue;
    }
    if (v.ai.goal === ev.via && Math.hypot(v.x - ev.via.x, v.y - ev.via.y) < VIA_PX) v.ai.goal = ev.goal;   // (past the player: on to the finish)
    if (v.ai.goal !== ev.goal) { const dv = Math.hypot(v.x - ev.via.x, v.y - ev.via.y) + Math.hypot(ev.via.x - ev.goal.x, ev.via.y - ev.goal.y); if (dv < ld) { ld = dv; lead = v; } continue; }
    const d = Math.hypot(v.x - ev.goal.x, v.y - ev.goal.y);
    v.ai.best = Math.min(v.ai.best ?? Infinity, d);
    if (d < FINISH_PX || (v.ai.best < FINISH_PX * 3 && d > v.ai.best + 120)) {   // over the line (or just past it): they scatter and drive off
      ev.done.push(id); ev.placed = (ev.placed || 0) + 1;
      if (ev.placed === 1) { ev.winner = v.model; events.feed(world, { kind: 'news', text: `A street race ended - a ${VEHICLES[v.model].name} took it`, x: v.x, y: v.y }); }
      letGo(world, v);
      continue;
    }
    if (d < ld) { ld = d; lead = v; }
  }
  if (lead) { ev.x = lead.x; ev.y = lead.y; }
  // a patrol car happens on it: one after the hindmost racer
  if (ev.copsAt && now > ev.copsAt && !ev.busted) {
    ev.copsAt = 0;
    let last = null, bd = -1;
    for (const id of ev.racers) { if (ev.done.includes(id)) continue; const v = world.get(id); const d = Math.hypot(v.x - ev.goal.x, v.y - ev.goal.y); if (d > bd) { bd = d; last = v; } }
    if (last && chasesOut(world) < NPC_CAR_CHASES) police.chaseCar(world, last);
  }
  const racing = ev.racers.filter((id) => !ev.done.includes(id) && !police.carChasers(world, world.get(id)).length);
  const chased = ev.racers.some((id) => { const v = world.get(id); return v && police.carChasers(world, v).length; });
  if ((!racing.length && !chased) || now > ev.ends) {
    for (const id of ev.racers) { const v = world.get(id); if (v && !police.carChasers(world, v).length) letGo(world, v); }
    finish(world, ev, ev.busted ? 'busted' : ev.placed ? 'finished' : 'off');
  }
}

function stepChase(world, ev) {
  const now = world.time, car = world.get(ev.car), crook = world.get(ev.crook);
  if (car && !car.removed) { ev.x = car.x; ev.y = car.y; } else if (crook && !crook.removed) { ev.x = crook.x; ev.y = crook.y; }
  if (car && !car.removed && car.wreckAt && !ev.crashed) { ev.crashed = true; events.feed(world, { kind: 'news', text: 'A getaway car crashed with the police right behind it', x: car.x, y: car.y }); }
  if (ev.arrested) {
    events.feed(world, { kind: 'news', text: 'The police caught the getaway driver', x: ev.x, y: ev.y });
    events.tellNear(world, ev.x, ev.y, 'The police got the getaway driver - cuffed and taken in.', 'info');
    if (car) letGo(world, car);
    finish(world, ev, 'arrest');
    return;
  }
  const chasers = car && !car.removed ? police.carChasers(world, car) : [];
  if (!crook || crook.dead || crook.removed) { if (car) letGo(world, car); finish(world, ev, ev.crashed ? 'crash' : 'gone'); return; }
  // the squad car gave up (lost it): away clean - on its way, quietly now, gone once nobody sees it
  if (!chasers.length && now - (ev.t || 0) > 3) {
    events.feed(world, { kind: 'news', text: 'A getaway car lost the police', x: ev.x, y: ev.y });
    if (car) letGo(world, car);
    finish(world, ev, 'escaped');
    return;
  }
  if (now > ev.ends) { if (car) letGo(world, car); finish(world, ev, 'off'); return; }
  if (car && car.ai && car.ai.goal === ev.via && Math.hypot(car.x - ev.via.x, car.y - ev.via.y) < VIA_PX) car.ai.goal = ev.goal;   // (past the player: on away)
  // keep running: away from the nearest squad car once it's close
  if (car && car.ai && car.ai.kind === 'traffic' && chasers[0] && Math.hypot(chasers[0].x - car.x, chasers[0].y - car.y) < 500 && now > (ev.reGoal || 0)) {
    ev.reGoal = now + 6;
    car.ai.goal = awayFrom(world, car.x, car.y, chasers[0].x, chasers[0].y, 2000);
  }
}

// ---- the armored truck -----------------------------------------------------------------------------------------------
function stepArmored(world, ev, dt) {
  const now = world.time, van = world.get(ev.van);
  void dt;
  if (!van || van.removed) { finish(world, ev, 'gone'); return; }
  ev.x = van.x; ev.y = van.y;
  // blown up: the valuables spill out of the back
  if (van.wreckAt) {
    if (!ev.spilled) {
      spill(world, ev, van, 'blown');
      events.feed(world, { kind: 'news', text: 'An armored truck was blown open - its cargo is all over the road', x: van.x, y: van.y });
      events.tellNear(world, van.x, van.y, 'The armored truck went up - its crates are spilling out of the back!', 'warn');
      const by = van.lastAttacker ? world.get(van.lastAttacker) : null;
      guardsOut(world, ev, van, by);
    }
    finish(world, ev, 'destroyed');
    return;
  }
  // given up somewhere (boxed in turning round, lost): back on the road to where it's going
  if (!ev.attackedAt && van.seats[0] && (!van.ai || van.ai.hopeless)) { joinTraffic(world, van); if (van.ai) { van.ai.goal = ev.goal; van.ai.replans = 0; } }
  // attacked (hit hard enough to dent it), or robbed: it stops; the guards get out and fight
  const by = van.lastAttacker ? world.get(van.lastAttacker) : null;
  // (a player's doing - shooting at it, ramming it - or a real beating from anyone; not a bump in traffic)
  if (!ev.attackedAt && ((by && by.player && van.hp < ev.hp - 25) || van.hp < ev.hp - 150)) attacked(world, ev, van, by);
  ev.hp = Math.min(ev.hp, van.hp);
  if (ev.attackedAt) {
    // the guards back aboard once it's quiet a while (nobody they're fighting near), and on its way again
    const gs = guards(world, ev);
    const busy = gs.some((g) => g.npc.state === 'fight' && !g.vehId);
    if (busy) ev.quietAt = now;
    if (!ev.spilled && now - (ev.quietAt || ev.attackedAt) > 25 && gs.length) {
      let aboard = 0;
      for (const g of gs) {
        if (g.vehId === van.id) { aboard++; continue; }
        if (Math.hypot(g.x - van.x, g.y - van.y) < van.def.L / 2 + 40) {
          const seat = van.seats.findIndex((q) => !q);
          if (seat >= 0) { van.seats[seat] = g.id; g.vehId = van.id; g.seat = seat; g.vx = 0; g.vy = 0; g.npc.state = 'idle'; g.npc.role = 'driver'; g.npc.guard = null; aboard++; }
          else { g.npc.keep = false; g.npc.armored = 0; g.npc.guard = null; }   // (no room: the third guard walks off)
        } else g.npc.guard = { x: van.x, y: van.y, run: true, a: van.a };   // (back to the truck)
      }
      if (aboard && van.seats[0] && aboard >= Math.min(gs.length, 2)) {
        ev.attackedAt = 0;
        for (const g of gs) if (g.vehId !== van.id) { g.npc.keep = false; g.npc.armored = 0; g.npc.guard = null; }
        joinTraffic(world, van);
        if (van.ai) van.ai.goal = ev.goal;
        van.despawnable = false;
        events.feed(world, { kind: 'news', text: 'An armored truck fought off an attack and drove on', x: van.x, y: van.y });
      }
    }
    if (ev.spilled && now - (ev.quietAt || ev.attackedAt) > 40) { letGo(world, van); for (const g of gs) { g.npc.keep = false; g.npc.armored = 0; g.npc.guard = null; } finish(world, ev, 'robbed'); return; }
  } else if (Math.hypot(van.x - ev.goal.x, van.y - ev.goal.y) < ARRIVED_PX) {   // there: delivered
    events.feed(world, { kind: 'news', text: 'An IronVault armored truck made its delivery', x: van.x, y: van.y });
    letGo(world, van);
    finish(world, ev, 'delivered');
    return;
  }
  if (now > ev.ends) { if (!ev.attackedAt) letGo(world, van); finish(world, ev, 'off'); }
}
const guards = (world, ev) => ev.guards.map((id) => world.get(id)).filter((g) => g && !g.dead && !g.removed && g.npc);
function attacked(world, ev, van, by) {
  ev.attackedAt = world.time; ev.quietAt = world.time;
  if (van.ai) { van.ai.parkIt = true; van.ai.ctl = null; }
  van.input = { throttle: 0, steer: 0, hb: true };
  guardsOut(world, ev, van, by);
  const esc = ev.escort && world.get(ev.escort);
  if (esc) police.escortTurns(world, esc, by);
  if (by && by.player) law.crime(world, by, 'robbery', null, van.x, van.y, { silentCheck: false });   // (the guards radio it in: no witness needed)
  events.tellNear(world, van.x, van.y, 'The armored truck\'s under attack - the guards are getting out!', 'warn');
}
// the guards out of the truck (and the one riding in the back), after whoever did it
function guardsOut(world, ev, van, by) {
  if (ev.back && !van.wreckAt) {
    ev.back = 0;
    const [x, y] = localToWorld(van.x, van.y, van.a, -van.def.L / 2 - 18, 0);
    const g = spawnNpc(world, 'cop', x, y, 'civ');
    g.weapon = 'smg'; g.npc.keep = true; g.npc.armored = van.id;
    ev.guards.push(g.id);
  }
  for (const [i, g] of guards(world, ev).entries()) {
    if (g.vehId === van.id) vehicles.ejectPed(world, g, true);
    g.npc.role = 'civ'; g.npc.keep = true;
    // their post when nobody's left to fight: beside the truck (npc.js guard: they go back to it)
    const [px, py] = localToWorld(van.x, van.y, van.a, -12 + i * 20, (i % 2 ? 1 : -1) * (van.def.W / 2 + 22));
    g.npc.guard = { x: px, y: py, run: true, a: van.a };
    if (!g.weapon || g.weapon === 'fists') g.weapon = 'pistol';
    if (by && !by.dead && !by.removed) { startFight(world, g, by, 60); g.aggressors && g.aggressors.set(by.id, world.time); }
  }
}
// the crates out of the back of it, onto the road
function spill(world, ev, van, how) {
  ev.spilled = how;
  const n = ev.load.length, c = Math.cos(van.a), s = Math.sin(van.a);
  ev.load.forEach((tier, i) => {
    const off = (i - (n - 1) / 2) * 22;
    const [x, y] = localToWorld(van.x, van.y, van.a, -van.def.L / 2 - 14, off);
    const crate = world.spawnCrate(tier, x, y, { contraband: true, label: 'IronVault Valuables' });
    const out = 120 + rng() * 110;
    crate.vx = -c * out - s * off * 2 + van.vx * 0.3; crate.vy = -s * out + c * off * 2 + van.vy * 0.3;
    crate.z = 10; crate.vz = how === 'blown' ? 260 : 120;
    crate.armored = ev.id;
  });
  ev.load = [];
  world.emit(van.x, van.y, { e: 'thud', x: van.x, y: van.y });
}

// ---- getting the back open -------------------------------------------------------------------------------------------
const backOf = (van) => { const [x, y] = localToWorld(van.x, van.y, van.a, -van.def.L / 2 - 10, 0); return { x, y }; };
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.carrying) return null;
  const h = world.vaultHold && world.vaultHold.get(p.pid);
  if (h) { const left = Math.max(0, h.until - world.time); return { label: `Unlocking the back... ${left.toFixed(1)}s (keep holding)`, run: () => {}, prog: 1 - left / ARMORED_UNLOCK_S }; }
  for (const ev of S(world).live) {
    if (ev.sl !== 'armored' || ev.spilled || !ev.load.length) continue;
    const van = world.get(ev.van);
    if (!van || van.wreckAt || Math.hypot(van.vx, van.vy) > 25) continue;
    const b = backOf(van);
    if (Math.hypot(b.x - ped.x, b.y - ped.y) > BACK_REACH) continue;
    return { label: `Hold to unlock the back of the armored truck (${ARMORED_UNLOCK_S}s) - armed robbery`, run: () => startUnlock(world, p, ev) };
  }
  return null;
}
function startUnlock(world, p, ev) {
  (world.vaultHold ||= new Map()).set(p.pid, { ev: ev.id, until: world.time + ARMORED_UNLOCK_S });
  world.notify(p, 'Working the lock on the back doors - keep at it!', 'warn');
  p.meDirty = true;
}
function holdStep(world) {
  for (const [pid, h] of [...world.vaultHold]) {
    const p = world.players.get(pid), ped = p && p.ped;
    const ev = S(world).live.find((e) => e.id === h.ev), van = ev && world.get(ev.van);
    const held = p && ((p.prevBits || 0) & IN.ACTION);
    if (!ped || ped.dead || ped.vehId || !held || !van || van.wreckAt || ev.spilled || Math.hypot(van.vx, van.vy) > 25 || Math.hypot(backOf(van).x - ped.x, backOf(van).y - ped.y) > BACK_REACH + 10) {
      world.vaultHold.delete(pid);
      if (p) p.meDirty = true;
      continue;
    }
    if (world.time < h.until) continue;
    world.vaultHold.delete(pid);
    p.meDirty = true;
    // open: the crates tumble out, the alarm goes, the guards come for them - armed robbery
    spill(world, ev, van, 'unlocked');
    ev.alarm = true;
    world.emit(van.x, van.y, { e: 'alarm', x: van.x, y: van.y });
    world.notify(p, 'The doors swing open - the crates tumble out! The alarm\'s going off...', 'good');
    events.feed(world, { kind: 'news', text: 'An armored truck was robbed - its alarm is ringing', x: van.x, y: van.y });
    p.profile.criminalExp = (p.profile.criminalExp || 0) + 15;
    if (!ev.attackedAt) attacked(world, ev, van, ped);
    else { law.crime(world, ped, 'robbery', null, van.x, van.y, { silentCheck: false }); for (const g of guards(world, ev)) startFight(world, g, ped, 60); }
  }
}

// ---- the police see an NPC crook driving (task #242) ------------------------------------------------------------------
const chasesOut = (world) => { let n = 0; for (const vid of world.police || []) { const v = world.get(vid); if (v && v.ai && v.ai.vehTarget) n++; } return n; };
function copsSee(world) {
  const st = S(world);
  if (!st.live.length || chasesOut(world) >= NPC_CAR_CHASES) return;
  for (const ev of st.live) {
    const ids = ev.sl === 'race' ? ev.racers.filter((id) => !ev.done.includes(id)) : ev.sl === 'chase' ? [ev.car] : [];
    for (const id of ids) {
      const v = world.get(id);
      if (!v || v.removed || v.wreckAt || police.carChasers(world, v).length) continue;
      // a squad car not busy with anyone, or an officer on foot, in sight of it
      let seen = false;
      for (const e of world.query(v.x, v.y, SEE_PX)) {
        if (e.kind === K.VEH && e.ai && e.ai.kind === 'police' && !e.ai.vehTarget && !e.ai.escort && !e.ai.prisoner && (e.ai.downSince !== undefined || (!e.ai.target && !e.ai.npcTarget && !e.ai.npcTargets && !e.ai.call)) && world.map.los(e.x, e.y, v.x, v.y)) { seen = e; break; }
        if (e.kind === K.PED && e.npc && e.npc.role === 'cop' && !e.dead && !e.vehId && (e.npc.beat || e.npc.unit) && world.map.los(e.x, e.y, v.x, v.y)) { seen = true; break; }
      }
      if (!seen) continue;
      if (seen !== true) {   // that car turns on it
        const ai = seen.ai;
        Object.assign(ai, { vehTarget: v.id, crook: 0, since: world.time, seenAt: world.time, lx: v.x, ly: v.y, mode: 'drive', route: null, routeAt: 0, downSince: undefined, leave: null });
        seen.sirenOn = true;
        for (const c of police.crewOf(world, seen)) if (!c.vehId) { c.npc.state = 'idle'; }
      } else police.chaseCar(world, v);   // (the officer calls it in)
      if (chasesOut(world) >= NPC_CAR_CHASES) return;
    }
  }
}

// the police took one of ours in (police.js runCarUnit: law.arrest has them off the street, into the cells)
police.setCarArrest((world, k) => {
  for (const ev of S(world).live) {
    if (ev.crook === k.id) ev.arrested = true;
    if (ev.racerIds && ev.racerIds.includes(k.id)) {
      ev.arrests = (ev.arrests || 0) + 1;
      events.feed(world, { kind: 'news', text: 'The police arrested a street racer', x: k.x, y: k.y });
    }
  }
});

export { laneSpot as _laneSpot };
