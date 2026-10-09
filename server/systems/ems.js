// First-responder medics (GDD §12): an ambulance dispatched from outside the viewport when the area is clear of
// gunfire. It drives to the street nearest the patient (kerbdrive.js: the street outside the shop they're in, or the
// nearest road in a park, on the coast, out in the wilds) and pulls up there, lights on. Two paramedics get out, one
// wheeling the stretcher: the other kneels and treats them. A player who called them is revived on the spot (revive.js
// charges the fee); anyone else is lifted onto the stretcher, wheeled to the back of the ambulance and loaded, and off
// it drives. Bodies that can't be reached within the 45-second hard memory window are silently dissolved.
//
// The stretcher is drawn as the pushing medic's prop (the descriptor's pp: 'stretcher', or 'stretcherPt' with the
// patient lying on it - client/art2/people.js), pushed with the 'push' walk (gt).
import { pedStep } from '../../shared/physics.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc, seek, footWay, sidestep } from './npc.js';
import { inAnyView } from '../view.js';
import { kerbFor, planTo, follow, halt, exitNode, sinceProgress, waterGuard } from './kerbdrive.js';
import { planRoute } from './traffic.js';
import * as players from './players.js';
import * as vehicles from './vehicles.js';
import * as revive from './revive.js';

const HARD_DESPAWN = 45;
const REVIVE_TIME = 3;
const LIFT_S = 1.4;       // lifting the patient onto the stretcher
const SCENE_MAX = 70;     // the whole scene, out of the ambulance and back in (s): whatever happens, they go after this
const rng = mulberry32(112);

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
    runAmbulance(world, v, dt, now);
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
    const k = kerbFor(world, b.x, b.y);
    const cands = starts(world, k, 650, 1300, 620);
    if (!cands.length) continue;
    launch(world, b, cands[Math.floor(rng() * Math.min(6, cands.length))], k, now);
    return;
  }
}

function launch(world, b, n, k, now, paid = null) {
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
  world.ambulances.add(v.id);
  return v;
}

// A downed player paid for an ambulance: it starts out of everyone's sight (as far off as it must) and drives to the
// street nearest them; the paramedics revive them on half health (revive.js charges the fee).
export function dispatchPaid(world, ped, pid) {
  world.ambulances ??= new Set();
  const now = world.time;
  const k = kerbFor(world, ped.x, ped.y);
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
// a medic on foot heading for (x, y): through a shop's door when it's in the way, round what they bump into
function walkTo(world, c, x, y, dt, run) {
  const wp = footWay(world, c, x, y);
  const inp = seek(c, wp.x, wp.y, run);
  if (Math.hypot(x - c.x, y - c.y) < 6) { inp.mx = 0; inp.my = 0; }
  pedStep(c, sidestep(world, c, inp, dt), dt, world.map, players.pedMods(world, c));
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
      walkTo(world, c, v.x, v.y, dt, true);
      if (Math.hypot(v.x - c.x, v.y - c.y) < v.def.L / 2 + 26) {
        stretcher(c, null);
        const seat = v.seats.findIndex((s) => !s);
        if (seat >= 0) { v.seats[seat] = c.id; c.vehId = v.id; c.seat = seat; c.vx = 0; c.vy = 0; } else despawnNpc(world, c);
      }
    }
    if (allIn || now - ai.boardAt > 20) {
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
    const n = exitNode(world, v);
    ai.exit = n ? { x: n.x, y: n.y } : { x: v.x + Math.cos(v.a) * 1500, y: v.y + Math.sin(v.a) * 1500 };
    ai.route = planRoute(world, v.x, v.y, ai.exit.x, ai.exit.y); ai.bestD = undefined;
  }
  if (!v.seats[0]) { halt(v); return; }
  if (follow(world, v, 300) || sinceProgress(world, v, ai.exit.x, ai.exit.y) > 12) ai.exit = null;   // (there, or stuck: somewhere else)
}

// To the kerb nearest the patient, siren on; it pulls up there, or as near as it can get.
function drive(world, v, ai, body, crew, now) {
  v.sirenOn = true;
  if (!body || !body.dead || (ai.paid && !revive.isDowned(body))) { ai.mode = 'leave'; return; } // revived / finished / woke up elsewhere
  const k = ai.kerb, dk = Math.hypot(k.x - v.x, k.y - v.y), db = Math.hypot(body.x - v.x, body.y - v.y);
  const stalled = sinceProgress(world, v, k.x, k.y);
  // there; or the patient's lying in the road just ahead; or it can't get any nearer
  let there = dk < 40 || db < 95 + v.def.L / 2 || (stalled > 5 && dk < 300);
  if (!there && stalled > 8) {
    // no nearer for a while further out: a new plan from here (twice), then pull up where it is and walk
    if (ai.replans < 2) { ai.replans++; ai.route = planTo(world, v, k); ai.bestD = undefined; }
    else there = true;
  }
  if (there) { arrive(world, v, ai, body, crew, now); return; }
  follow(world, v, dk < 500 ? 260 : 480);
  if (now - ai.since > (ai.paid ? 150 : 40)) ai.mode = 'leave';
}

function arrive(world, v, ai, body, crew, now) {
  halt(v);
  v.sirenOn = false; v.beaconOn = true;   // (lights on while they work)
  ai.mode = 'scene'; ai.step = 'out'; ai.stepAt = now; ai.sceneAt = now;
  for (const c of crew) { vehicles.ejectPed(world, c, true, body); c.emsD = undefined; c.emsStuck = 0; }   // (out on the patient's side of the van)
  const [a, b] = crew;
  ai.treater = a.id; ai.porter = (b || a).id;
  // the stretcher out of the back
  const back = backOf(world, v);
  if (b && world.map.isWalkable(back.x, back.y)) { b.x = back.x; b.y = back.y; world.place(b); }
  stretcher(world.get(ai.porter), 'stretcher');
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
  if (now - ai.sceneAt > SCENE_MAX) ai.step = 'back';
  if ((ai.step === 'out' || ai.step === 'treat') && !patientOk) { ai.step = 'back'; ai.stepAt = now; }
  if (ai.step === 'out' || ai.step === 'treat') {
    // the treating medic runs to them and kneels; the other wheels the stretcher up beside them
    let atBody = false;
    if (reached(T, body.x, body.y, 26, dt)) { atBody = true; T.vx = 0; T.vy = 0; T.kneelUntil = now + 0.5; T.a = Math.atan2(body.y - T.y, body.x - T.x); }
    else walkTo(world, T, body.x + (T.x < body.x ? -12 : 12), body.y, dt, true);
    if (P !== T) {
      if (Math.hypot(body.x - P.x, body.y - P.y) > 52 && !(P.emsStuck > 1.5)) walkTo(world, P, body.x, body.y, dt, false);
      else { P.vx = 0; P.vy = 0; P.a = Math.atan2(body.y - P.y, body.x - P.x); }
      reached(P, body.x, body.y, 52, dt);
    }
    if (atBody && ai.step === 'out') { ai.step = 'treat'; ai.stepAt = now; body.reviving = now; world.emit(body.x, body.y, { e: 'revive', x: body.x, y: body.y, id: body.id }); }
    if (ai.step === 'out' && now - ai.stepAt > 40) { ai.step = 'back'; ai.stepAt = now; }   // (can't get to them at all)
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
    const there = reached(P, bk.x, bk.y, 18, dt, 200) || now - ai.stepAt > 30;
    if (!there) walkTo(world, P, bk.x, bk.y, dt, false); else { P.vx = 0; P.vy = 0; P.a = v.a; }
    if (T !== P) {
      const side = { x: bk.x + Math.cos(v.a + Math.PI / 2) * 22, y: bk.y + Math.sin(v.a + Math.PI / 2) * 22 };
      if (Math.hypot(side.x - T.x, side.y - T.y) > 10) walkTo(world, T, side.x, side.y, dt, false); else { T.vx = 0; T.vy = 0; }
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
