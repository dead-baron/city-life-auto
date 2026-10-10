// First-responder medics (GDD §12): an ambulance dispatched from outside the viewport when the area is clear of
// gunfire. It drives to the street nearest the patient (kerbdrive.js: the street outside the shop they're in, or the
// nearest road in a park, on the coast, out in the wilds) and pulls up there, lights on. Two paramedics get out, one
// wheeling the stretcher: the other kneels and treats them. A player who called them is revived on the spot (revive.js
// charges the fee); anyone else is lifted onto the stretcher, wheeled to the back of the ambulance and loaded, and off
// it drives. Bodies that can't be reached within the 45-second hard memory window are silently dissolved.
//
// The stretcher is drawn as the pushing medic's prop (the descriptor's pp: 'stretcher', or 'stretcherPt' with the
// patient lying on it - client/art2/people.js), pushed with the 'push' walk (gt).
//
// Anyone lying on the ground - a body, a downed player - is kept clear of (task #435): the ambulance pulls up short of
// its patient and over to one side, CLEAR px off them and everyone else lying there (parkSpot), it has stopped before
// the doors open, and it never drives over anyone on its way in or out (lyingInWay: it slows to stop short of them,
// goes round them where there's room - skirt - or, at the patient's scene, pulls up there and the paramedics walk).
//
// Out in the wilds (task #409): when the street it can get to is far from the patient, the ambulance leaves the road
// there and drives on over the open ground toward them (offroad.js groundPath: fields, grass, tracks and sand, round
// trees, rocks and water - at most OFF_MAX of it), pulling up PARK_NEAR short of them, or as near as it can get, or
// where it gets stuck. The crew go the rest on foot along a way round what's in between (running when it's far), and
// their time on foot grows with the walk, within a limit (walkS). Someone down in the water gets the rescue boat
// instead (rescue.js).
import { K } from '../../shared/constants.js';
import { pedStep, vehForwardSpeed } from '../../shared/physics.js';
import { circleVsObb, obbVsObb } from '../../shared/math.js';
import { CAR_BLOCK, WATER_T, nearestLand } from '../../shared/map.js';
import { sameLevel } from '../../shared/levels.js';
import { pointAt, project } from '../../shared/geom.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc, seek, footWay, sidestep } from './npc.js';
import { inAnyView } from '../view.js';
import { kerbFor, planTo, follow, halt, exitNode, sinceProgress, waterGuard } from './kerbdrive.js';
import { groundPath, clearWalk } from './offroad.js';
import { trimBehind } from './custody.js';
import { planRoute } from './traffic.js';
import * as players from './players.js';
import * as vehicles from './vehicles.js';
import * as revive from './revive.js';
import * as rescue from './rescue.js';

const HARD_DESPAWN = 45;
const REVIVE_TIME = 3;
const LIFT_S = 1.4;       // lifting the patient onto the stretcher
const SCENE_MAX = 70;     // the whole scene, out of the ambulance and back in (s): whatever happens, they go after this
const CLEAR = 34;         // px from the middle of anyone lying on the ground to an ambulance, always (half a body and a bit)
const SCENE_R = 220;      // someone lying this near the patient is part of the scene: in the way, it pulls up short of them
const PARK_PLAN = 560;    // the spot to pull up on is chosen this near the kerb (px), and looked at again every second
const PARK_BACK = 300;    // ...at most this far back from alongside the patient
const OFF_MIN = 260;      // pulled up this far from the patient or more: on over the open ground toward them...
const OFF_MAX = 3200;     // ...at most this much of it (px of the way)...
const PARK_NEAR = 100;    // ...to stop this far short of them
const OFF_SPEED = 240;    // px/s over the rough
const WALK_PACE = 110;    // px/s on foot, for the crew's time limits; the extra time a long walk gets is capped at
const WALK_CAP = 45;      // this many seconds of walking
const rng = mulberry32(112);
const walkS = (ai) => Math.min(WALK_CAP, (ai.walk || 0) / WALK_PACE);   // (seconds of the crew's walk, for their time limits)

export function update(world, dt) {
  const now = world.time;
  world.ambulances ??= new Set();
  // hard memory despawn (not while a crew is on its way or at work on them)
  for (const b of [...world.bodies]) {
    if (b.removed || !b.dead) { world.bodies.delete(b); continue; }
    if (now - b.deadAt > HARD_DESPAWN && !b.reviving && !(b.emsAssigned && world.get(b.emsAssigned))) {
      world.emit(b.x, b.y, { e: 'fade', id: b.id });
      world.bodies.delete(b);
      if (b.npc) despawnNpc(world, b); else world.remove(b);
    }
  }
  if (world.tick % 20 === 11) dispatch(world, now);
  for (const vid of [...world.ambulances]) {
    const v = world.get(vid);
    if (!v) { world.ambulances.delete(vid); continue; }
    if (v.rescue) rescue.run(world, v, dt, now); else runAmbulance(world, v, dt, now);
  }
}

function quiet(world, x, y, now) {
  for (const s of world.shotLog) if (now - s.t < 8 && Math.hypot(s.x - x, s.y - y) < 450) return false;
  return true;
}

// Junctions an ambulance can start from for a patient at (x, y): ground level, lo-hi px away, out of everyone's view,
// on the same island as the street it'll pull up on (it has to drive there), nearest first.
function starts(world, k, lo, hi, avoidPlayers = 0) {
  const m = world.map, zone = m.zoneAt(k.x, k.y);
  const out = m.nodes.filter((n) => {
    if (n.lvl !== 0 || m.zoneAt(n.x, n.y) !== zone) return false;
    const d = Math.hypot(n.x - k.x, n.y - k.y);
    if (d < lo || d > hi) return false;
    if (avoidPlayers) for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - n.x, p.ped.y - n.y) < avoidPlayers) return false;
    return !inAnyView(world, n.x, n.y, 140);
  });
  out.sort((a, b) => Math.hypot(a.x - k.x, a.y - k.y) - Math.hypot(b.x - k.x, b.y - k.y));
  return out;
}

function dispatch(world, now) {
  if (world.ambulances.size >= 3) return;
  for (const b of world.bodies) {
    if (b.emsAssigned || now - b.deadAt < 3 || now - b.deadAt > HARD_DESPAWN - 10) continue;
    if (!quiet(world, b.x, b.y, now)) continue;
    let watched = false;
    for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - b.x, p.ped.y - b.y) < 1400) { watched = true; break; }
    if (!watched) continue;
    // in the water: the rescue boat if a dock is near enough (rescue.js) - a crew on foot only reaches someone by the edge
    if (rescue.inWater(world.map, b)) {
      if (now - (b.rescueTry || -99) < 8) continue;
      b.rescueTry = now;
      if (rescue.dispatch(world, b, null)) return;
      if (!nearestLand(world.map, b.x, b.y, 2)) continue;
    }
    const k = b.emsKerb && Math.abs(b.emsKerb.bx - b.x) < 8 && Math.abs(b.emsKerb.by - b.y) < 8 ? b.emsKerb : (b.emsKerb = { ...kerbFor(world, b.x, b.y), bx: b.x, by: b.y });   // (once per body)
    const cands = starts(world, k, 650, 1300, 620);
    if (!cands.length) continue;
    launch(world, b, cands[Math.floor(rng() * Math.min(6, cands.length))], k, now);
    return;
  }
}

export function launch(world, b, n, k, now, paid = null) {   // (exported for the tests: an ambulance from a chosen junction)
  const v = world.spawnVehicle('ambulance', n.x, n.y, Math.atan2(k.y - n.y, k.x - n.x), {});   // (in the middle of the junction: on the road)
  v.despawnable = false; v.sirenOn = false; v.npcOwned = true;
  const driver = spawnNpc(world, 'medic', v.x, v.y, 'medic');
  driver.vehId = v.id; driver.seat = 0; v.seats[0] = driver.id;
  const medic2 = spawnNpc(world, 'medic', v.x, v.y, 'medic');
  medic2.vehId = v.id; medic2.seat = 1; v.seats[1] = medic2.id;
  v.ai = { kind: 'ems', body: b.id, mode: 'drive', kerb: k, route: null, crew: [driver.id, medic2.id], since: now, paid, replans: 0 };
  v.ai.route = planTo(world, v, k);
  if (v.ai.route.length > 1) v.a = Math.atan2(v.ai.route[1].y - v.y, v.ai.route[1].x - v.x);
  b.emsAssigned = v.id;
  (world.ambulances ??= new Set()).add(v.id);
  return v;
}

// A downed player paid for an ambulance: it starts out of everyone's sight (as far off as it must) and drives to the
// street nearest them; the paramedics revive them on half health (revive.js charges the fee).
export function dispatchPaid(world, ped, pid) {
  world.ambulances ??= new Set();
  const now = world.time;
  // down in the water: the rescue boat (rescue.js); failing that an ambulance only for someone by the edge (a pool)
  if (rescue.inWater(world.map, ped)) { const boat = rescue.dispatch(world, ped, pid); if (boat || !nearestLand(world.map, ped.x, ped.y, 2)) return boat; }
  const k = kerbFor(world, ped.x, ped.y);
  if (world.map.zoneAt(k.x, k.y) !== world.map.zoneAt(ped.x, ped.y)) return null;   // (no road on their island: no ambulance can get there)
  for (const [lo, hi] of [[650, 1400], [500, 2200], [400, 3200]]) {
    const cands = starts(world, k, lo, hi);
    if (cands.length) return launch(world, ped, cands[Math.floor(rng() * Math.min(4, cands.length))], k, now, pid);
  }
  return null;
}

// The downed player cancelled: the crew turns round (no charge).
export function recall(world, vehId) {
  const v = world.get(vehId);
  if (!v || !v.ai) return;
  if (v.ai.kind === 'rescue') { rescue.recall(world, v); return; }
  v.ai.paid = null;
  v.ai.body = 0;
  if (v.ai.mode === 'drive') { v.ai.mode = 'leave'; return; }
  if (v.ai.mode === 'scene') v.ai.step = 'back';
}

const live = (world, id) => { const e = id && world.get(id); return e && !e.dead && !e.removed ? e : null; };
// the stretcher in a medic's hands (or the patient on it), or put away
function stretcher(c, kind) {
  const pp = kind || undefined;
  if (c.pp === pp) return;
  c.pp = pp; c.gt = kind ? 'push' : undefined;
  c.appVer = (c.appVer || 0) + 1;   // (net.js sends the descriptor again)
}
// a medic on foot heading for (x, y): through a shop's door when it's in the way, along the way round what's between
// out in the wilds (tr: arrive's ai.foot), round what they bump into
function walkTo(world, c, x, y, dt, run, tr = null) {
  const wp = (tr && trailWay(world, c, tr, x, y)) || footWay(world, c, x, y);
  const inp = seek(c, wp.x, wp.y, run);
  if (Math.hypot(x - c.x, y - c.y) < 6) { inp.mx = 0; inp.my = 0; }
  pedStep(c, sidestep(world, c, inp, dt), dt, world.map, players.pedMods(world, c));
}
// where to head along a way on foot for (x, y) at its one end or the other: straight there when that's clear, else the
// farthest point on along it toward (x, y) in a clear line from the trail point nearest them (looked at four times a second)
function trailWay(world, c, tr, x, y) {
  const now = world.time, w = c.trW;
  if (w && now < w.until && w.x === x && w.y === y) return w.p;
  let p = null;
  if (!clearWalk(world.map, c.x, c.y, x, y)) {
    const e = tr[tr.length - 1], s = (e.x - x) ** 2 + (e.y - y) ** 2 < (tr[0].x - x) ** 2 + (tr[0].y - y) ** 2 ? 1 : -1;
    let i0 = 0, bd = Infinity;
    for (let i = 0; i < tr.length; i++) { const d = (tr[i].x - c.x) ** 2 + (tr[i].y - c.y) ** 2; if (d < bd) { bd = d; i0 = i; } }
    let j = i0;
    for (let k = i0 + s; k >= 0 && k < tr.length && clearWalk(world.map, c.x, c.y, tr[k].x, tr[k].y); k += s) j = k;
    if (j === i0 && bd < 16 * 16) j = Math.max(0, Math.min(tr.length - 1, i0 + s));
    p = tr[j];
  }
  c.trW = { until: now + 0.25, x, y, p };
  return p;
}
// close enough, or as close as they can get (a counter, a wall, a parked car between): stopped making progress nearby
function reached(c, x, y, r, dt, near = 140) {
  const d = Math.hypot(x - c.x, y - c.y);
  const nearer = c.emsD === undefined || d < c.emsD - 8 * dt;
  c.emsD = d;
  c.emsStuck = d < near && !nearer ? (c.emsStuck || 0) + dt : 0;
  return d < r || c.emsStuck > 1.5;
}

function runAmbulance(world, v, dt, now) {
  const ai = v.ai;
  if (!ai || v.wreckAt) { cleanup(world, v); return; }
  const drv = v.seats[0] ? world.get(v.seats[0]) : null;
  if (drv && drv.player) {
    // a player hijacked the ambulance: medics give up and walk away
    for (const id of ai.crew) { const c = world.get(id); if (c && c.npc) { stretcher(c, null); c.npc.role = 'civ'; c.npc.state = 'flee'; c.npc.fx = v.x; c.npc.fy = v.y; c.npc.until = now + 6; } }
    const b = world.get(ai.body); if (b && b.emsAssigned === v.id) b.emsAssigned = 0;
    if (ai.paid) revive.helpLost(world, ai.paid, v.id);   // (the one who called it can call another)
    world.ambulances.delete(v.id);
    v.ai = null; v.despawnable = true; v.beaconOn = false;
    return;
  }
  const body = world.get(ai.body);
  const crew = ai.crew.map((id) => world.get(id)).filter((c) => c && !c.dead);
  if (!crew.length) { cleanup(world, v); return; }
  if (ai.mode === 'drive') { drive(world, v, ai, body, crew, now); return; }
  if (ai.mode === 'scene') { scene(world, v, ai, body, crew, dt, now); return; }
  if (ai.mode === 'board') {
    halt(v);
    let allIn = true;
    for (const c of crew) {
      if (c.vehId) continue;
      allIn = false;
      walkTo(world, c, v.x, v.y, dt, true, ai.foot);
      if (Math.hypot(v.x - c.x, v.y - c.y) < v.def.L / 2 + 26) {
        stretcher(c, null);
        const seat = v.seats.findIndex((s) => !s);
        if (seat >= 0) { v.seats[seat] = c.id; c.vehId = v.id; c.seat = seat; c.vx = 0; c.vy = 0; } else despawnNpc(world, c);
      }
    }
    if (allIn || now - ai.boardAt > 20 + 1.2 * walkS(ai)) {
      for (const c of crew) if (!c.vehId) despawnNpc(world, c);   // (one who couldn't get back to it: gone once out of sight with it)
      if (!v.seats[0]) { const i = v.seats.findIndex((s) => s); if (i > 0) { v.seats[0] = v.seats[i]; v.seats[i] = 0; world.get(v.seats[0]).seat = 0; } }
      ai.mode = 'leave'; v.beaconOn = false;
    }
    return;
  }
  // leave: off to a junction well away from everyone, gone once nobody can see it
  v.sirenOn = false; v.beaconOn = false;
  let visible = inAnyView(world, v.x, v.y, 120);
  if (!visible) for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - v.x, p.ped.y - v.y) < 900) { visible = true; break; }
  if (!visible || (now - ai.since > 240 && !inAnyView(world, v.x, v.y, 40))) { cleanup(world, v); return; }
  if (!ai.exit) {
    const n = exitNode(world, v, ai.badExit);
    ai.exit = n ? { x: n.x, y: n.y, id: n.id } : { x: v.x + Math.cos(v.a) * 1500, y: v.y + Math.sin(v.a) * 1500, id: -1 };
    ai.route = trimBehind(planRoute(world, v.x, v.y, ai.exit.x, ai.exit.y), v); ai.bestD = undefined; ai.skirted = 0;
  }
  if (!v.seats[0]) { halt(v); return; }
  const way = clearWay(world, v, ai, null);
  if (follow(world, v, Math.min(300, way))) ai.exit = null;   // (there: somewhere else)
  else if (sinceProgress(world, v, ai.exit.x, ai.exit.y) > 8) { ai.badExit = ai.exit.id; ai.exit = null; }   // (stuck: another way out)
}

// To the kerb nearest the patient, siren on; it pulls up there - short of them and over to one side, clear of everyone
// lying there (parkSpot) - or as near as it can get. It has stopped before anyone gets out.
function drive(world, v, ai, body, crew, now) {
  v.sirenOn = true;
  if (!body || !body.dead || (ai.paid && !revive.isDowned(body))) { ai.mode = 'leave'; return; } // revived / finished / woke up elsewhere
  if (ai.stopping) {
    // pulling up: on the brakes with the driver still at the wheel (a van nobody's driving rolls on: vehicles.js), and
    // the doors open once it's standing
    halt(v); ai.ctl = null; waterGuard(world, v);
    if (Math.abs(vehForwardSpeed(v)) < 8 || now - ai.stopping > 3) arrive(world, v, ai, body, crew, now);
    return;
  }
  if (ai.off) {
    // over the open ground toward them: pull up PARK_NEAR short, or short of whoever's lying in the way, or where it
    // stops getting nearer, or at the end of the way it found (as near as it could get)
    holdClock(world, ai, body, now);
    const lim = clearWay(world, v, ai, body), db = Math.hypot(body.x - v.x, body.y - v.y);
    const stuck = sinceProgress(world, v, body.x, body.y) > 4 || now - ai.off.at > ai.off.len / 60 + 12;
    if (db < PARK_NEAR || (ai.atScene && ai.atScene.d < 24) || stuck || follow(world, v, Math.min(OFF_SPEED, lim), 30)) { ai.off = null; ai.stopping = now; halt(v); ai.ctl = null; }
    return;
  }
  const k = ai.kerb, dk = Math.hypot(k.x - v.x, k.y - v.y), db = Math.hypot(body.x - v.x, body.y - v.y);
  // the spot to pull up on, once it's near (and again whenever it's no longer clear: someone else went down there)
  if (dk < PARK_PLAN && (ai.park === undefined || (now - (ai.parkAt || 0) > 1 && (!ai.park || !standOk(world, v, ai.park.x, ai.park.y, ai.park.a, lyingNear(world, v, ai.park.x, ai.park.y)))))) {
    ai.parkAt = now;
    ai.park = parkSpot(world, v, k, body, ai.route);
    if (ai.park) aimAt(ai, ai.park, k);
  }
  const P = ai.park, dp = P ? Math.hypot(P.x - v.x, P.y - v.y) : dk;
  const stalled = sinceProgress(world, v, P ? P.x : k.x, P ? P.y : k.y);
  const lim = clearWay(world, v, ai, body);
  let level = false;   // (level with the spot, or past it: pulling over to it went wide)
  if (P && dp < 90) { const pr = project(k.e.pts, v); level = !!pr && P.sg * (pr.s - P.s) > -4; }
  // there (at the spot, or level with it); or someone at the patient's scene is lying just ahead (pull up short of them:
  // they walk the rest); or it can't get any nearer
  let there = dp < 22 || level || (!P && db < 95 + v.def.L / 2) || (ai.atScene && ai.atScene.d < 24) || (stalled > 5 && dk < 300);
  if (!there && stalled > 8) {
    // no nearer for a while further out: a new plan from here (twice), then pull up where it is and walk
    if (ai.replans < 2) { ai.replans++; ai.route = planTo(world, v, k); ai.bestD = undefined; if (ai.park) aimAt(ai, ai.park, k); }
    else there = true;
  }
  let pulled = there || (follow(world, v, Math.min(dk < 500 ? 260 : 480, lim), P ? 20 : 34) && !!P);
  if (pulled && !ai.offAt && db > OFF_MIN && dk < 400 && offRoad(world, v, ai, body, now)) pulled = false;   // (far from the street: on over the open ground)
  if (pulled) { ai.stopping = now; halt(v); ai.ctl = null; return; }
  if (now - ai.since > (ai.paid ? 150 : 40) + (ai.offAt ? 40 : 0)) ai.mode = 'leave';
}

// At the street nearest a patient far off the road: a way over the open ground toward them for the ambulance (offroad.js)
// - worth it when it ends a good way nearer them than here. It ends PARK_NEAR short of them (or as near as it gets).
function offRoad(world, v, ai, body, now) {
  ai.offAt = now;
  const P = groundPath(world, v, body, { van: true });
  if (!P || P.pts.length < 2) return false;
  const pts = P.pts;
  // cut where it first comes within PARK_NEAR (and a little) of them, and no more than OFF_MAX along
  let len = 0, out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y);
    let cut = -1;
    for (let t = 8; t <= L && cut < 0; t += 8) { const x = a.x + (b.x - a.x) * t / L, y = a.y + (b.y - a.y) * t / L; if (Math.hypot(body.x - x, body.y - y) < PARK_NEAR + 10 || len + t > OFF_MAX) cut = t; }
    if (cut >= 0) { out.push({ x: a.x + (b.x - a.x) * cut / L, y: a.y + (b.y - a.y) * cut / L }); len += cut; break; }
    out.push(b); len += L;
  }
  const e = out[out.length - 1];
  if (out.length < 2 || Math.hypot(body.x - e.x, body.y - e.y) > Math.hypot(body.x - v.x, body.y - v.y) - 150) return false;   // (no real gain)
  out.shift();
  out[out.length - 1].final = true;
  ai.route = out; ai.bestD = undefined; ai.off = { at: now, len };
  return true;
}

// The one who called them doesn't wake up at a hospital while they're nearly there or at work on them (task #409)
function holdClock(world, ai, body, now) {
  const p = ai.paid && body && body.player;
  if (p && revive.isDowned(body) && p.respawnAt < now + 3) { p.respawnAt = now + 3; p.meDirty = true; }
}

// ---- keeping clear of anyone lying on the ground (task #435) ----------------------------------------------------------
const lyingDown = (e, v) => e.kind === K.PED && e.dead && !e.removed && !e.vehId && !e.wild && !e.onTrain && sameLevel(e.lz, v.lz);
function lyingNear(world, v, x, y, r = 260) {
  const out = [];
  for (const e of world.query(x, y, r, K.PED)) if (lyingDown(e, v)) out.push(e);
  return out;
}
// how far (x, y) is from the outline of a vehicle standing at (vx, vy) facing a (0 inside it)
function gapTo(x, y, vx, vy, a, hl, hw) {
  const c = Math.cos(a), s = Math.sin(a), dx = x - vx, dy = y - vy;
  return Math.hypot(Math.max(0, Math.abs(dx * c + dy * s) - hl), Math.max(0, Math.abs(-dx * s + dy * c) - hw));
}

// The first person lying on the ground it would come within CLEAR px of, driving on from here: first the way it's
// moving now (the start of a turn, backing up), then along its route. { e, d, i, x, y, a }: d how far its middle can go
// before then, i the route point it's making for there (-1 on the first stretch), (x, y, a) where it is then and which
// way it faces - or null. Only someone it would get nearer to counts: not someone beside it as it drives past, nor
// someone it's over already (who went down beside it - it drives off them).
function lyingInWay(world, v, route, look) {
  const hl = v.def.L / 2, hw = v.def.W / 2, fwd = vehForwardSpeed(v);
  const near = lyingNear(world, v, v.x, v.y, look + hl + CLEAR);
  if (!near.length) return null;
  const g0 = near.map((e) => gapTo(e.x, e.y, v.x, v.y, v.a, hl, hw));
  const hit = (x, y, a) => { for (let j = 0; j < near.length; j++) { const g = gapTo(near[j].x, near[j].y, x, y, a, hl, hw); if (g < CLEAR && g < g0[j] - 1) return near[j]; } return null; };
  let best = null;
  // where it's going right now: straight on (or back) as far as it takes to stop, and a little more
  if (Math.abs(fwd) > 5) {
    const sg = Math.sign(fwd), c = Math.cos(v.a) * sg, s = Math.sin(v.a) * sg, far = fwd * fwd / 1100 + 24;
    for (let t = 8; t <= far; t += 8) { const e = hit(v.x + c * t, v.y + s * t, v.a); if (e) { best = { e, d: t - 8, i: -1, x: v.x + c * t, y: v.y + s * t, a: v.a }; break; } }
  }
  // and along the route
  if (route && route.length) {
    let px = v.x, py = v.y, d = 0, found = false;
    for (let i = 0; i < route.length && i < 12 && d < look && !found && (!best || d < best.d); i++) {
      const q = route[i], L = Math.hypot(q.x - px, q.y - py);
      if (L < 1) continue;
      const a = Math.atan2(q.y - py, q.x - px);
      for (let t = Math.min(12, L); ; t = Math.min(t + 12, L)) {
        const x = px + (q.x - px) * t / L, y = py + (q.y - py) * t / L, e = hit(x, y, a);
        if (e) { found = true; if (!best || d + t - 12 < best.d) best = { e, d: Math.max(0, d + t - 12), i, x, y, a }; break; }
        if (t >= L || d + t >= look) break;
      }
      d += L; px = q.x; py = q.y;
    }
  }
  return best;
}

// The speed it may drive at not to come within CLEAR px of whoever's lying in its way (w: lyingInWay; Infinity for nobody).
const capFor = (w) => { if (!w) return Infinity; const d = Math.max(0, w.d - 4); return Math.min(d * 1.8, Math.sqrt(600 * d)); };
// How fast it may go on: someone lying at the patient's scene (body: the patient; null on the way out) is noted
// (ai.atScene: it pulls up short of them); someone elsewhere it goes round where there's room (skirt), once each.
function clearWay(world, v, ai, body) {
  const look = v.def.L / 2 + CLEAR + 60 + Math.max(0, vehForwardSpeed(v)) * 0.9;
  const w = lyingInWay(world, v, ai.route, look);
  ai.atScene = null;
  if (!w) return Infinity;
  if (w.i < 0 && vehForwardSpeed(v) < -5) ai.reverseUntil = 0;   // (backing out of a corner: not over them)
  if (body && (w.e === body || Math.hypot(w.e.x - body.x, w.e.y - body.y) < SCENE_R)) ai.atScene = w;
  else if (w.d > 70 && w.i >= 0 && ai.skirted !== w.e.id && skirt(world, v, ai, w)) { ai.skirted = w.e.id; return Math.min(170, capFor(lyingInWay(world, v, ai.route, look))); }
  return capFor(w);
}

// Round someone lying in its way who isn't at its patient's scene: the route goes over to the side of them that's
// clear - a half-width and CLEAR px off them - from well short of them to past them, on ground it can drive on with
// nothing and nobody in the way. True if it's going round.
function skirt(world, v, ai, w) {
  const hl = v.def.L / 2, hw = v.def.W / 2, e = w.e, r = ai.route;
  const c = Math.cos(w.a), s = Math.sin(w.a);
  const bl = -(e.x - w.x) * s + (e.y - w.y) * c, ba = (e.x - w.x) * c + (e.y - w.y) * s;   // them, across and along from where it'd stop
  const va = (v.x - w.x) * c + (v.y - w.y) * s;                                           // where it is now, along
  const a0 = Math.max(va + 60, ba - hl - CLEAR - 90), a1 = ba + hl + CLEAR + 30;
  const others = lyingNear(world, v, e.x, e.y, 420);
  for (const side of bl > 0 ? [-1, 1] : [1, -1]) {
    const off = bl + side * (hw + CLEAR + 8);
    const pts = [];
    let ok = true;
    for (let t = a0; t <= a1 + 0.1 && ok; t += 40) {
      const x = w.x + c * t - s * off, y = w.y + s * t + c * off;
      if (!standOk(world, v, x, y, w.a, others)) ok = false;
      pts.push({ x, y });
    }
    if (!ok || !pts.length) continue;
    // the route's own points over that stretch (they'd pull it back over them) go
    for (let i = r.length - 2; i >= 0; i--) {
      const q = r[i], qa = (q.x - w.x) * c + (q.y - w.y) * s, ql = -(q.x - w.x) * s + (q.y - w.y) * c;
      if (qa > va && qa < a1 + 30 && Math.abs(ql - bl) < hw + CLEAR + 40) r.splice(i, 1);
    }
    let at = 0;
    while (at < r.length - 1 && (r[at].x - w.x) * c + (r[at].y - w.y) * s < a0) at++;
    r.splice(at, 0, ...pts);
    return true;
  }
  return false;
}

// Can it stand at (x, y) facing a: on ground it can drive on, nothing solid there (a wall, a post, the water, another
// vehicle), and CLEAR px off everyone lying near (others)?
function standOk(world, v, x, y, a, others) {
  const m = world.map, hl = v.def.L / 2, hw = v.def.W / 2, c = Math.cos(a), s = Math.sin(a);
  for (const e of others) if (gapTo(e.x, e.y, x, y, a, hl, hw) < CLEAR) return false;
  for (const [lx, ly] of [[0, 0], [hl, 0], [-hl, 0], [hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [0, hw], [0, -hw]]) {
    const px = x + c * lx - s * ly, py = y + s * lx + c * ly, tx = Math.floor(px / 32), ty = Math.floor(py / 32), t = m.tileAt(tx, ty);
    if (CAR_BLOCK[t] || WATER_T[t] || (m.lvl0Block && tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.lvl0Block[ty * m.w + tx] === 1)) return false;
    const props = m.solidProps.get(ty * m.w + tx);
    if (props) for (const p of props) if (!p.off && circleVsObb(p.x, p.y, p.r, x, y, a, hl, hw)) return false;
  }
  // (a car going by is no reason not to stop there: one standing there is)
  for (const q of world.query(x, y, hl + 80, K.VEH)) if (q !== v && !q.removed && sameLevel(q.lz, v.lz) && Math.hypot(q.vx, q.vy) < 40 && obbVsObb(x, y, a, hl + 4, hw + 4, q.x, q.y, q.a, q.def.L / 2, q.def.W / 2)) return false;
  return true;
}

// Where to pull up for the patient, on the kerb's street facing the way it's coming: short of them and over to one side
// where the road's wide enough (alongside them, the nose level with them), else in line and CLEAR px short of them -
// never within CLEAR px of anyone lying there, nor on a parked car, a post, a wall or the water. The nearer the patient
// and the kerb spot the better; no further back than PARK_BACK, not off the end of the street, and never behind where
// it is now (no turning back). Null when nowhere will do: it drives for the kerb and pulls up short of whoever's in its
// way. { x, y, a, s, sg }: s where along the street, sg +1 if it faces the way the street runs.
function parkSpot(world, v, k, body, route) {
  const e = k.e;
  if (!e || !e.pts || e.pts.length < 2 || e.pts[e.pts.length - 1].s === undefined) return null;
  const hl = v.def.L / 2, hw = v.def.W / 2, room = Math.max(0, (e.hw || 24) - 20), band = (e.hw || 24) + 60;
  const bp = project(e.pts, body), vp = project(e.pts, v);
  if (!bp || !vp) return null;
  // the way it's coming along the street: from the end its route comes onto it by (the first point of the route on the
  // street, well away from the kerb spot), or from where it is on it
  let sg = 0;
  if (route) for (const q of route) {
    if (q.final) break;
    const pr = project(e.pts, q);
    if (pr && pr.d < band && Math.abs(pr.s - k.s) > 60) { sg = pr.s < k.s ? 1 : -1; break; }
  }
  if (!sg) sg = vp.s < k.s - 1 ? 1 : vp.s > k.s + 1 ? -1 : (Math.cos(v.a) * pointAt(e.pts, k.s).tx + Math.sin(v.a) * pointAt(e.pts, k.s).ty >= 0 ? 1 : -1);
  const at = (s) => { const p = pointAt(e.pts, s); return { x: p.x, y: p.y, tx: p.tx * sg, ty: p.ty * sg }; };   // facing the way it's coming
  const across = (p, x, y) => (x - p.x) * -p.ty + (y - p.y) * p.tx;
  const b0 = at(bp.s), bl = across(b0, body.x, body.y), kl = across(at(k.s), k.x, k.y);
  const onIt = vp.d < band;   // (already on the street: nowhere behind it)
  const others = lyingNear(world, v, body.x, body.y, PARK_BACK + 260);
  let best = null;
  for (let l = -room; l <= room + 0.1; l += 8) {
    const beside = Math.abs(l - bl) >= hw + CLEAR;
    // its middle `a` along from the patient (minus: short of them)
    for (let a = (beside ? 8 : -CLEAR) - hl; a >= -hl - PARK_BACK; a -= 16) {
      const s = bp.s + sg * a;
      if (s < hl * 0.6 || s > e.len - hl * 0.6) break;     // (off the end of the street)
      if (onIt && sg * (s - vp.s) < 20) break;              // (behind it)
      const p = at(s), x = p.x - p.ty * l, y = p.y + p.tx * l, ang = Math.atan2(p.ty, p.tx);
      if (!standOk(world, v, x, y, ang, others)) continue;
      const score = -(a + hl) + Math.abs(l - kl) * 0.5;
      if (!best || score < best.score) best = { x, y, a: ang, s, sg, score };
      break;   // (further back along this line is only worse)
    }
  }
  return best;
}
// The route ends at the spot: its last points along the street past it (and just short of it, room to pull over) go.
function aimAt(ai, P, k) {
  const r = ai.route || (ai.route = []), e = k.e, hw = (e && e.hw) || 40;
  if (r.length && r[r.length - 1].final) r.pop();
  while (r.length && e) {
    const pr = project(e.pts, r[r.length - 1]);
    if (pr && pr.d < hw + 60 && P.sg * (pr.s - P.s) > -160) r.pop(); else break;
  }
  r.push({ x: P.x, y: P.y, final: true });
}

function arrive(world, v, ai, body, crew, now) {
  halt(v);
  v.sirenOn = false; v.beaconOn = true;   // (lights on while they work)
  ai.mode = 'scene'; ai.step = 'out'; ai.stepAt = now; ai.sceneAt = now;
  for (const c of crew) { vehicles.ejectPed(world, c, true, body); c.emsD = undefined; c.emsStuck = 0; c.trW = null; }   // (out on the patient's side of the van)
  const [a, b] = crew;
  ai.treater = a.id; ai.porter = (b || a).id;
  // the stretcher out of the back
  const back = backOf(world, v);
  if (b && world.map.isWalkable(back.x, back.y)) { b.x = back.x; b.y = back.y; world.place(b); }
  stretcher(world.get(ai.porter), 'stretcher');
  // a walk with things in the way (out in the wilds: trees, rocks, a stream): the way round them on foot (offroad.js)
  ai.walk = Math.hypot(body.x - a.x, body.y - a.y); ai.foot = null;
  if (ai.walk > 90 && !clearWalk(world.map, a.x, a.y, body.x, body.y)) {
    const P = groundPath(world, a, body, { van: false });
    if (P && P.pts.length > 1) { ai.foot = P.pts; ai.walk = P.len + P.d; }
  }
}
function backOf(world, v) {
  const c = Math.cos(v.a), s = Math.sin(v.a), r = v.def.L / 2 + 20;
  return { x: v.x - c * r, y: v.y - s * r };
}

// Out with the stretcher, treat, onto the stretcher, back to the ambulance, in.
function scene(world, v, ai, body, crew, dt, now) {
  halt(v); v.beaconOn = true; waterGuard(world, v);
  const T = live(world, ai.treater) || crew[0], P = live(world, ai.porter) || crew[crew.length - 1];
  const patientOk = body && body.dead && !body.removed && (!ai.paid || revive.isDowned(body)) && !body.npc?.onStretcher;
  if (now - ai.sceneAt > SCENE_MAX + 2.5 * walkS(ai)) ai.step = 'back';
  if ((ai.step === 'out' || ai.step === 'treat') && !patientOk) { ai.step = 'back'; ai.stepAt = now; }
  if (ai.step === 'out' || ai.step === 'treat') {
    // the treating medic runs to them and kneels; the other wheels the stretcher up beside them (running too, a way off)
    holdClock(world, ai, body, now);
    let atBody = false;
    if (reached(T, body.x, body.y, 26, dt)) { atBody = true; T.vx = 0; T.vy = 0; T.kneelUntil = now + 0.5; T.a = Math.atan2(body.y - T.y, body.x - T.x); }
    else walkTo(world, T, body.x + (T.x < body.x ? -12 : 12), body.y, dt, true, ai.foot);
    if (P !== T) {
      const dp = Math.hypot(body.x - P.x, body.y - P.y);
      if (dp > 52 && !(P.emsStuck > 1.5)) walkTo(world, P, body.x, body.y, dt, dp > 240, ai.foot);
      else { P.vx = 0; P.vy = 0; P.a = Math.atan2(body.y - P.y, body.x - P.x); }
      reached(P, body.x, body.y, 52, dt);
    }
    if (atBody && ai.step === 'out') { ai.step = 'treat'; ai.stepAt = now; body.reviving = now; world.emit(body.x, body.y, { e: 'revive', x: body.x, y: body.y, id: body.id }); }
    if (ai.step === 'out' && now - ai.stepAt > Math.max(40, 20 + 1.6 * walkS(ai))) { ai.step = 'back'; ai.stepAt = now; }   // (can't get to them at all)
    if (ai.step === 'treat' && now - body.reviving >= REVIVE_TIME) {
      body.reviving = 0;
      if (body.player) {
        // the patient who called them: back on their feet here (revive.js charges the fee); the stretcher goes back empty
        world.bodies.delete(body);
        if (revive.isDowned(body)) revive.revive(world, body, { ambulance: true });
        body.emsAssigned = 0;
        ai.step = 'back'; ai.stepAt = now;
      } else { ai.step = 'lift'; ai.stepAt = now; }
    }
    return;
  }
  if (ai.step === 'lift') {
    // both of them at the stretcher, and up they go: the patient lies on it now
    for (const c of [T, P]) { c.vx = 0; c.vy = 0; if (body) c.a = Math.atan2(body.y - c.y, body.x - c.x); }
    T.kneelUntil = now + 0.3;
    if (now - ai.stepAt < LIFT_S) return;
    if (body && !body.removed) {
      world.bodies.delete(body);
      if (body.npc) despawnNpc(world, body); else world.remove(body);
    }
    stretcher(P, 'stretcherPt');
    ai.loaded = true; ai.step = 'back'; ai.stepAt = now;
    return;
  }
  if (ai.step === 'back') {
    // wheeled round to the back doors; the other walks with it
    const bk = backOf(world, v);
    const there = reached(P, bk.x, bk.y, 18, dt, 200) || now - ai.stepAt > 30 + 1.5 * walkS(ai);
    if (!there) walkTo(world, P, bk.x, bk.y, dt, false, ai.foot); else { P.vx = 0; P.vy = 0; P.a = v.a; }
    if (T !== P) {
      const side = { x: bk.x + Math.cos(v.a + Math.PI / 2) * 22, y: bk.y + Math.sin(v.a + Math.PI / 2) * 22 };
      if (Math.hypot(side.x - T.x, side.y - T.y) > 10) walkTo(world, T, side.x, side.y, dt, false, ai.foot); else { T.vx = 0; T.vy = 0; }
    }
    if (there) { ai.step = 'load'; ai.stepAt = now; }
    return;
  }
  if (ai.step === 'load') {
    // in it goes
    P.vx = 0; P.vy = 0; P.a = v.a;
    if (now - ai.stepAt < 1) return;
    stretcher(P, null);
    world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
    ai.mode = 'board'; ai.boardAt = now;
  }
}

function cleanup(world, v) {
  const ai = v.ai;
  if (ai) for (const id of ai.crew) { const c = world.get(id); if (c && c.npc) despawnNpc(world, c); }
  for (const sid of v.seats) if (sid) { const c = world.get(sid); if (c && c.npc) despawnNpc(world, c); }
  if (ai) { const b = world.get(ai.body); if (b && b.emsAssigned === v.id) b.emsAssigned = 0; }
  world.ambulances.delete(v.id);
  v.beaconOn = false;
  if (!v.seats.some((s) => s && world.get(s)?.player)) world.remove(v);
  else { v.ai = null; v.despawnable = true; }
}
