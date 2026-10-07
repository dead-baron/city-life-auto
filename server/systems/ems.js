// First-responder medics (GDD §12): ambulance dispatched from outside the viewport when the
// area is clear of gunfire, two medics run a 3-second revival, then drive off. Bodies that
// can't be reached within the 45-second hard memory window are silently dissolved.
import { pedStep } from '../../shared/physics.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc, seek } from './npc.js';
import { inAnyView } from '../view.js';
import { driveToward, planRoute } from './traffic.js';
import * as players from './players.js';
import * as vehicles from './vehicles.js';
import * as revive from './revive.js';

const HARD_DESPAWN = 45;
const REVIVE_TIME = 3;
const rng = mulberry32(112);

export function update(world, dt) {
  const now = world.time;
  world.ambulances ??= new Set();
  // hard memory despawn
  for (const b of [...world.bodies]) {
    if (b.removed || !b.dead) { world.bodies.delete(b); continue; }
    if (now - b.deadAt > HARD_DESPAWN && !b.reviving) {
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

function dispatch(world, now) {
  if (world.ambulances.size >= 3) return;
  for (const b of world.bodies) {
    if (b.emsAssigned || now - b.deadAt < 3 || now - b.deadAt > HARD_DESPAWN - 10) continue;
    if (!quiet(world, b.x, b.y, now)) continue;
    let watched = false;
    for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - b.x, p.ped.y - b.y) < 1400) { watched = true; break; }
    if (!watched) continue;
    const cands = world.map.nodes.filter((n) => {
      if (n.lvl !== 0) return false;
      const d = Math.hypot(n.x - b.x, n.y - b.y);
      if (d < 650 || d > 1300) return false;
      for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - n.x, p.ped.y - n.y) < 620) return false;
      return !inAnyView(world, n.x + 32, n.y + 32, 100);
    });
    if (!cands.length) continue;
    const n = cands[Math.floor(rng() * cands.length)];
    launch(world, b, n, now);
    return;
  }
}

function launch(world, b, n, now, paid = null) {
  const v = world.spawnVehicle('ambulance', n.x + 32, n.y + 32, Math.atan2(b.y - n.y, b.x - n.x), {});
  v.despawnable = false; v.sirenOn = false; v.npcOwned = true;
  const driver = spawnNpc(world, 'medic', v.x, v.y, 'medic');
  driver.vehId = v.id; driver.seat = 0; v.seats[0] = driver.id;
  const medic2 = spawnNpc(world, 'medic', v.x, v.y, 'medic');
  medic2.vehId = v.id; medic2.seat = 1; v.seats[1] = medic2.id;
  v.ai = { kind: 'ems', body: b.id, mode: 'drive', route: planRoute(world, v.x, v.y, b.x, b.y), crew: [driver.id, medic2.id], since: now, paid };
  b.emsAssigned = v.id;
  world.ambulances.add(v.id);
  return v;
}

// A downed player paid for an ambulance: it starts out of everyone's sight (as far off as it
// must) and drives to them; the paramedics revive them on half health (revive.js charges the fee).
export function dispatchPaid(world, ped, pid) {
  world.ambulances ??= new Set();
  const now = world.time;
  for (const [lo, hi] of [[650, 1400], [500, 2200], [400, 3200]]) {
    const cands = world.map.nodes.filter((n) => {
      if (n.lvl !== 0) return false;
      const d = Math.hypot(n.x - ped.x, n.y - ped.y);
      if (d < lo || d > hi) return false;
      if (world.map.zoneAt(n.x, n.y) !== world.map.zoneAt(ped.x, ped.y)) return false; // the same island: it has to drive there
      return !inAnyView(world, n.x + 32, n.y + 32, 100);
    });
    if (cands.length) { cands.sort((a, b) => Math.hypot(a.x - ped.x, a.y - ped.y) - Math.hypot(b.x - ped.x, b.y - ped.y)); return launch(world, ped, cands[Math.floor(rng() * Math.min(4, cands.length))], now, pid); }
  }
  return null;
}

// The downed player cancelled: the crew turns round (no charge).
export function recall(world, vehId) {
  const v = world.get(vehId);
  if (!v || !v.ai) return;
  v.ai.paid = null;
  for (const c of v.ai.crew.map((id) => world.get(id)).filter((c) => c && !c.vehId)) { const seat = v.seats.findIndex((x) => !x); if (seat >= 0) { v.seats[seat] = c.id; c.vehId = v.id; c.seat = seat; } else despawnNpc(world, c); }
  v.ai.mode = 'leave';
}

function runAmbulance(world, v, dt, now) {
  const ai = v.ai;
  if (!ai || v.wreckAt) { cleanup(world, v); return; }
  const drv = v.seats[0] ? world.get(v.seats[0]) : null;
  if (drv && drv.player) {
    // a player hijacked the ambulance: medics give up and walk away
    for (const id of ai.crew) { const c = world.get(id); if (c && c.npc) { c.npc.role = 'civ'; c.npc.state = 'flee'; c.npc.fx = v.x; c.npc.fy = v.y; c.npc.until = now + 6; } }
    const b = world.get(ai.body); if (b) b.emsAssigned = 0;
    world.ambulances.delete(v.id);
    v.ai = null; v.despawnable = true;
    return;
  }
  const body = world.get(ai.body);
  const crew = ai.crew.map((id) => world.get(id)).filter((c) => c && !c.dead);
  if (!crew.length) { cleanup(world, v); return; }
  if (ai.mode === 'drive') {
    v.sirenOn = true;
    if (!body || !body.dead || (ai.paid && !revive.isDowned(body))) { ai.mode = 'leave'; return; } // revived / finished / woke up elsewhere
    const d = Math.hypot(body.x - v.x, body.y - v.y);
    if (d < 150) {
      ai.mode = 'treat';
      v.input = { throttle: 0, steer: 0, hb: true };
      for (const c of crew) vehicles.ejectPed(world, c, true);
      return;
    }
    while (ai.route.length > 1 && Math.hypot(ai.route[0].x - v.x, ai.route[0].y - v.y) < 60) ai.route.shift();
    const wp = ai.route.length > 1 ? ai.route[0] : { x: body.x, y: body.y };
    driveToward(world, v, wp.x, wp.y, d < 400 ? 220 : 480, {});
    if (now - ai.since > (ai.paid ? 150 : 40)) ai.mode = 'leave';
    return;
  }
  if (ai.mode === 'treat') {
    v.input = { throttle: 0, steer: 0, hb: true };
    if (!body || !body.dead || body.removed || (ai.paid && !revive.isDowned(body))) { ai.mode = 'board'; return; }
    let atBody = 0;
    for (const c of crew) {
      if (c.vehId) continue;
      const d = Math.hypot(body.x - c.x, body.y - c.y);
      const inp = d > 20 ? seek(c, body.x + (c === crew[0] ? -14 : 14), body.y, true) : { bits: 0, mx: 0, my: 0, aim: Math.atan2(body.y - c.y, body.x - c.x) };
      pedStep(c, inp, dt, world.map, players.pedMods(world, c));
      // close but blocked (a vending machine, a bollard, the wall beside a doorway in the way - sliding
      // along it gets no nearer): close enough to work from there
      const nearer = c.emsD === undefined || d < c.emsD - 8 * dt;
      c.emsD = d;
      c.emsStuck = d < 140 && !nearer ? (c.emsStuck || 0) + dt : 0; // (a body that slid behind a counter or a wall: they work from as near as they can get)
      if (d < 26 || c.emsStuck > 1.5) { atBody++; c.kneelUntil = now + 0.5; c.a = Math.atan2(body.y - c.y, body.x - c.x); } // down on one knee beside them
    }
    if (atBody > 0) {
      if (!body.reviving) { body.reviving = now; world.emit(body.x, body.y, { e: 'revive', x: body.x, y: body.y, id: body.id }); }
      if (now - body.reviving >= REVIVE_TIME) {
        world.bodies.delete(body);
        body.reviving = 0;
        if (body.player && revive.isDowned(body)) { revive.revive(world, body, { ambulance: true }); body.emsAssigned = 0; } // the patient who called them
        else if (body.npc) {
          // GDD: the target is revived, stands up and walks away
          body.dead = false; body.hp = body.maxHp * 0.6; body.reviving = 0; body.bleeding = false;
          body.npc.state = 'wander'; body.npc.role = body.npc.role === 'driver' ? 'civ' : body.npc.role;
          body.downUntil = 0; body.emsAssigned = 0;
          if (body.npc.role === 'cop') { body.npc.role = 'civ'; body.npc.unit = 0; }
        } else {
          world.emit(body.x, body.y, { e: 'fade', id: body.id });
          world.remove(body);
        }
        ai.mode = 'board';
      }
    } else if (now - ai.since > 60) ai.mode = 'board';
    return;
  }
  if (ai.mode === 'board') {
    let allIn = true;
    for (const c of crew) {
      if (c.vehId) continue;
      allIn = false;
      const inp = seek(c, v.x, v.y, true);
      pedStep(c, inp, dt, world.map, players.pedMods(world, c));
      if (Math.hypot(v.x - c.x, v.y - c.y) < v.def.L / 2 + 26) {
        const seat = v.seats.findIndex((s) => !s);
        if (seat >= 0) { v.seats[seat] = c.id; c.vehId = v.id; c.seat = seat; } else despawnNpc(world, c);
      }
    }
    if (allIn) {
      if (!v.seats[0]) { const i = v.seats.findIndex((s) => s); if (i > 0) { v.seats[0] = v.seats[i]; v.seats[i] = 0; world.get(v.seats[0]).seat = 0; } }
      ai.mode = 'leave';
    }
    return;
  }
  // leave
  v.sirenOn = false;
  let visible = false;
  for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - v.x, p.ped.y - v.y) < 900) { visible = true; break; }
  if (!visible || now - ai.since > 120) { cleanup(world, v); return; }
  if (!ai.exit) { ai.exit = { x: v.x + Math.cos(v.a) * 2400, y: v.y + Math.sin(v.a) * 2400 }; ai.route = planRoute(world, v.x, v.y, ai.exit.x, ai.exit.y); }
  while (ai.route.length > 1 && Math.hypot(ai.route[0].x - v.x, ai.route[0].y - v.y) < 60) ai.route.shift();
  if (v.seats[0]) driveToward(world, v, ai.route[0].x, ai.route[0].y, 300, {});
}

function cleanup(world, v) {
  const ai = v.ai;
  if (ai) for (const id of ai.crew) { const c = world.get(id); if (c && c.npc) despawnNpc(world, c); }
  for (const sid of v.seats) if (sid) { const c = world.get(sid); if (c && c.npc) despawnNpc(world, c); }
  if (ai) { const b = world.get(ai.body); if (b) b.emsAssigned = 0; }
  world.ambulances.delete(v.id);
  if (!v.seats.some((s) => s && world.get(s)?.player)) world.remove(v);
  else { v.ai = null; v.despawnable = true; }
}

