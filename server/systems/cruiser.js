// Personal police cruisers for on-duty player officers.
//  * Going on duty drops you straight into a fresh Interceptor.
//  * Lose it (wrecked or stolen) and dispatch can send a replacement after a 15 s cooldown.
//  * A called cruiser is driven to you by an NPC officer, parks nearby, the officer hops out and
//    walks off, and the car stays locked for you alone until you get in (clients draw an arrow).
//  * Walk away from your cruiser and it is towed back to HQ after a while - no cooldown, call
//    another whenever you like.
import { K } from '../../shared/constants.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { collideVehicleTiles } from '../../shared/physics.js';
import { CAR_SPAWN_BLOCK, BOAT_BLOCK } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc } from './npc.js';
import { driveToward, planRoute, removeVehicle } from './traffic.js';
import * as vehicles from './vehicles.js';

import { CALL_COOLDOWN_S } from '../../shared/rules.js';
export { CALL_COOLDOWN_S };
const FAR_PX = 900;          // further than this from your parked cruiser starts the tow timer
const TOW_AFTER_S = 25;      // ...and after this long it is towed away
const TOW_NOW_PX = 2400;     // way across town: towed after a short grace
const ARRIVE_PX = 170;       // the delivery driver parks this close to you
const DELIVERY_MAX_S = 45;   // stuck in traffic for too long: dispatch "finds a spot" next to you

const rng = mulberry32(4242);

// A free spot near a ped where a vehicle of this size fits without overlapping walls or traffic.
export function clearSpot(world, ped, def) {
  for (let ring = 0; ring < 4; ring++) {
    for (let k = 0; k < 12; k++) {
      const a = ped.a + (k * Math.PI) / 6;
      const d = 90 + ring * 50 + def.L / 2;
      const x = ped.x + Math.cos(a) * d, y = ped.y + Math.sin(a) * d;
      const s = { x, y, a: 0, vx: 0, vy: 0 };
      collideVehicleTiles(s, def, world.map, def.kind === 'boat' ? BOAT_BLOCK : CAR_SPAWN_BLOCK);
      if (Math.hypot(s.x - x, s.y - y) < 0.5 && !world.query(x, y, def.L, K.VEH).length) return { x, y, a: 0 };
    }
  }
  return { x: ped.x, y: ped.y + 80, a: 0 };
}

function mine(world, p) {
  const v = p.dutyVehicle ? world.get(p.dutyVehicle) : null;
  return v && !v.removed ? v : null;
}

function makeCruiser(world, p, x, y, a) {
  const v = world.spawnVehicle('police', x, y, a, { npcOwned: false });
  v.issuedTo = p.pid; v.despawnable = false; v.npcOwned = false;
  v.cruiserOf = p.pid;
  (v.stolenBy ||= new Set()).add(p.pid); // your own cruiser is never "theft"
  p.dutyVehicle = v.id;
  p.cruiserFar = 0;
  world.cruisers ??= new Set();
  world.cruisers.add(v.id);
  p.meDirty = true;
  return v;
}

// Release a cruiser back to the city: it becomes an ordinary police car (stealable, despawnable).
function release(world, v, removeIt) {
  world.cruisers?.delete(v.id);
  const drv = v.ai && v.ai.kind === 'delivery' ? world.get(v.seats[0]) : null;
  v.ai = null; v.lockedTo = 0; v.cruiserOf = 0; v.issuedTo = 0; v.despawnable = true;
  if (removeIt && !v.seats.some((s) => s && world.get(s)?.player)) removeVehicle(world, v);
  else if (drv && drv.npc) { vehicles.ejectPed(world, drv, true); drv.npc.role = 'civ'; drv.npc.state = 'wander'; }
}

// Put the player behind the wheel of a brand-new cruiser right where they stand.
export function issueNow(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return null;
  const old = mine(world, p);
  if (old) release(world, old, true);
  if (ped.vehId) vehicles.exitVehicle(world, ped);
  if (ped.vehId) return null; // couldn't get out (boat far from shore)
  if (ped.carrying) return null;
  const sp = clearSpot(world, ped, VEHICLES.police);
  const v = makeCruiser(world, p, sp.x, sp.y, ped.a);
  v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0;
  ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  v.lastDriver = ped.id; p.lastVehicle = v.id;
  ped.x = v.x; ped.y = v.y;
  p.cruiserLostAt = 0;
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
  return v;
}

// An officer drove off in a motor-pool cruiser or motorcycle: it becomes their duty vehicle.
// The one they had before goes back to the pool if it's parked inside the lot, otherwise it's
// returned to HQ (removed) once nobody is in it.
export function adopt(world, p, v) {
  const old = mine(world, p);
  if (old && old !== v) {
    const pool = poolIndexAt(world, old.x, old.y);
    if (pool >= 0 && !old.seats.some((s) => s) && !old.wreckAt) {
      world.cruisers?.delete(old.id);
      old.cruiserOf = 0; old.issuedTo = 0; old.lockedTo = 0; old.motorPool = pool; old.npcOwned = true; old.stolenBy = null; old.despawnable = false;
    } else release(world, old, true);
  }
  delete v.motorPool;
  v.issuedTo = p.pid; v.cruiserOf = p.pid; v.despawnable = false; v.npcOwned = false; v.lockedTo = 0;
  (v.stolenBy ||= new Set()).add(p.pid);
  p.dutyVehicle = v.id; p.cruiserFar = 0; p.cruiserLostAt = 0;
  world.cruisers ??= new Set();
  world.cruisers.add(v.id);
  p.meDirty = true;
}
function poolIndexAt(world, x, y) {
  const list = world.map.motorPools || [];
  for (let i = 0; i < list.length; i++) { const m = list[i]; if (x > m.tx * 32 && x < (m.tx + m.tw) * 32 && y > m.ty * 32 && y < (m.ty + m.th) * 32) return i; }
  return -1;
}

// HQ lot requisition (no cooldown, you're standing at the motor pool).
export function issueAt(world, p, x, y, a) {
  const old = mine(world, p);
  if (old) release(world, old, true);
  const v = makeCruiser(world, p, x, y, a);
  v.lockedTo = p.pid;
  p.cruiserLostAt = 0;
  return v;
}

export function cooldownLeft(world, p) {
  return p.cruiserLostAt ? Math.max(0, CALL_COOLDOWN_S - (world.time - p.cruiserLostAt)) : 0;
}

// "Call a cruiser": returns an error string or null.
export function call(world, p) {
  const ped = p.ped;
  if (!p.badge) return 'Only on-duty officers can call in a cruiser.';
  if (!ped || ped.dead) return 'You can\'t radio dispatch right now.';
  const cur = mine(world, p);
  if (cur) return cur.ai && cur.ai.kind === 'delivery' ? 'Your cruiser is already on its way - follow the arrow.' : 'You already have a cruiser - follow the arrow to it.';
  const cd = cooldownLeft(world, p);
  if (cd > 0) return `Dispatch can send a new cruiser in ${Math.ceil(cd)}s.`;
  const m = world.map;
  const farFromEveryone = (n) => { for (const q of world.players.values()) if (q.ped && Math.hypot(q.ped.x - n.x, q.ped.y - n.y) < 600) return false; return true; };
  let cands = m.nodes.filter((n) => { const d = Math.hypot(n.x - ped.x, n.y - ped.y); return d > 650 && d < 1150 && farFromEveryone(n); });
  if (!cands.length) cands = m.nodes.filter((n) => { const d = Math.hypot(n.x - ped.x, n.y - ped.y); return d > 400 && d < 1500; });
  if (!cands.length) {
    const sp = clearSpot(world, ped, VEHICLES.police);
    const v = makeCruiser(world, p, sp.x, sp.y, 0);
    v.lockedTo = p.pid;
    world.notify(p, 'Dispatch: a cruiser is parked next to you, unlocked for you only.', 'good');
    return null;
  }
  const n = cands[Math.floor(rng() * cands.length)];
  const a = Math.atan2(ped.y - n.y, ped.x - n.x);
  const v = makeCruiser(world, p, n.x + 32, n.y + 32, a);
  v.lockedTo = p.pid;
  const drv = spawnNpc(world, 'cop', v.x, v.y, 'driver');
  drv.weapon = 'fists';
  drv.vehId = v.id; drv.seat = 0; v.seats[0] = drv.id;
  v.ai = { kind: 'delivery', pid: p.pid, route: null, routeAt: -99, since: world.time };
  world.notify(p, 'Dispatch: cruiser en route to your position. Follow the arrow when it arrives.', 'good');
  return null;
}

function park(world, v) {
  const drv = world.get(v.seats[0]);
  v.input = { throttle: 0, steer: 0, hb: true };
  v.vx *= 0.3; v.vy *= 0.3;
  v.ai = null;
  if (drv && drv.npc) {
    vehicles.ejectPed(world, drv, true);
    drv.npc.role = 'civ'; drv.npc.state = 'wander';
    drv.npc.wx = drv.x + (rng() - 0.5) * 900; drv.npc.wy = drv.y + (rng() - 0.5) * 900;
  }
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
}

function runDelivery(world, v, p) {
  const ped = p.ped;
  const drv = v.seats[0] ? world.get(v.seats[0]) : null;
  if (!drv || drv.dead || !drv.npc) { v.ai = null; return; }
  if (!ped || ped.dead) { v.input = { throttle: 0, steer: 0, hb: true }; return; }
  const d = Math.hypot(ped.x - v.x, ped.y - v.y);
  if (d < ARRIVE_PX) { park(world, v); world.notify(p, 'Your cruiser has arrived.', 'good'); return; }
  if (world.time - v.ai.since > DELIVERY_MAX_S) {
    const sp = clearSpot(world, ped, v.def);
    v.x = sp.x; v.y = sp.y; v.vx = 0; v.vy = 0;
    park(world, v);
    world.notify(p, 'Your cruiser has arrived.', 'good');
    return;
  }
  const ai = v.ai;
  if (!ai.route || world.time - ai.routeAt > 3) { ai.route = planRoute(world, v.x, v.y, ped.x, ped.y); ai.routeAt = world.time; }
  while (ai.route.length > 1 && Math.hypot(ai.route[0].x - v.x, ai.route[0].y - v.y) < 60) ai.route.shift();
  const wp = ai.route[0];
  const slow = d < 420 ? 160 : 440;
  driveToward(world, v, wp.x, wp.y, slow, {});
}

// Is the cruiser lost to its officer? 'wreck' | 'stolen' | null
function lostReason(world, v, p) {
  if (!v || v.removed) return 'wreck';
  if (v.wreckAt) return 'wreck';
  const dId = v.seats[0];
  if (!dId) return null;
  const d = world.get(dId);
  if (!d) return null;
  if (d === p.ped) return null;
  if (d.player) return 'stolen';
  if (d.npc && !(v.ai && v.ai.kind === 'delivery')) return 'stolen';
  return null;
}

export function update(world, dt) {
  world.cruisers ??= new Set();
  // drive deliveries every tick
  for (const vid of world.cruisers) {
    const v = world.get(vid);
    if (!v || !v.ai || v.ai.kind !== 'delivery' || v.wreckAt) continue;
    const p = world.players.get(v.ai.pid);
    if (p) runDelivery(world, v, p);
  }
  if (world.tick % 10 !== 4) return;
  const step = dt * 10;
  // orphans: officer gone or off duty
  for (const vid of [...world.cruisers]) {
    const v = world.get(vid);
    if (!v) { world.cruisers.delete(vid); continue; }
    const p = world.players.get(v.cruiserOf);
    if (!p || !p.badge || p.dutyVehicle !== v.id) release(world, v, !v.seats.some((s) => s));
  }
  for (const p of world.players.values()) {
    if (!p.badge) { if (p.dutyVehicle) { const v = mine(world, p); if (v && v.cruiserOf === p.pid) release(world, v, !v.seats.some((s) => s)); p.dutyVehicle = 0; } continue; }
    if (!p.dutyVehicle) continue;
    const v = mine(world, p);
    const why = lostReason(world, v, p);
    if (why) {
      if (v) release(world, v, false);
      p.dutyVehicle = 0;
      p.cruiserLostAt = world.time;
      p.meDirty = true;
      world.notify(p, why === 'stolen' ? `Your cruiser was stolen! Dispatch can send another in ${CALL_COOLDOWN_S}s.` : `Your cruiser is wrecked. Dispatch can send another in ${CALL_COOLDOWN_S}s.`, 'bad');
      continue;
    }
    const ped = p.ped;
    if (!ped) continue;
    if (ped.vehId === v.id) { v.lockedTo = 0; p.cruiserFar = 0; continue; }
    if (v.ai && v.ai.kind === 'delivery') continue;
    if (v.seats.some((s) => s)) { p.cruiserFar = 0; continue; }
    const d = Math.hypot(ped.x - v.x, ped.y - v.y);
    if (d < FAR_PX && !ped.dead) { p.cruiserFar = 0; continue; }
    p.cruiserFar = (p.cruiserFar || 0) + step;
    if (p.cruiserFar >= TOW_AFTER_S || (d > TOW_NOW_PX && p.cruiserFar >= 3)) {
      release(world, v, true);
      p.dutyVehicle = 0; p.cruiserFar = 0; p.meDirty = true;
      world.notify(p, 'You left your cruiser behind - it was towed back to HQ. Call a new one any time.', 'info');
    }
  }
}

// Locked for everyone but its officer until they first get in.
export function lockedFor(v, p) { return !!(v.lockedTo && (!p || v.lockedTo !== p.pid)); }

// HUD state for the officer's own client.
export function stateFor(world, p) {
  if (!p.badge) return null;
  const v = mine(world, p);
  if (!v) return { s: 'none', cd: Math.ceil(cooldownLeft(world, p)) };
  const s = p.ped && p.ped.vehId === v.id ? 'in' : v.ai && v.ai.kind === 'delivery' ? 'coming' : 'parked';
  return { s, id: v.id, x: Math.round(v.x), y: Math.round(v.y) };
}

