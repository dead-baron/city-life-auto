// Vehicle physics, seats (multi-passenger binding), collisions, ped strikes, wrecks.
import { K, VF, WEATHER } from '../../shared/constants.js';
import { vehStep, vehLateralSpeed, vehForwardSpeed } from '../../shared/physics.js';
import { obbVsObb, circleVsObb, localToWorld } from '../../shared/math.js';
import { PED_BLOCK, WATER_T } from '../../shared/map.js';

export const SINK_S = 3.2; // a car that drove into the water sinks, then blows up underwater
import * as combat from './combat.js';
import * as cargo from './cargo.js';
import * as law from './law.js';
import * as npc from './npc.js';


export function driverOf(world, v) { return v.seats[0] ? world.get(v.seats[0]) : null; }
export function speedOf(v) { return Math.hypot(v.vx, v.vy); }

// One physics step + crash consequences. Player-driven cars get exactly one of these per input
// the server receives - the same steps the driver's client predicted - so prediction and server
// never drift apart (that drift was the "car vibrating back and forth" bug).
export function stepVehicle(world, v, dt, env = { rain: world.weather === WEATHER.RAIN }) {
  const moving = Math.abs(v.vx) + Math.abs(v.vy) > 0.5 || Math.abs(v.input.throttle) > 0.05;
  if (!moving) return;
  const impact = vehStep(v, v.input, dt, world.map, v.def, env);
  if (impact > 160) {
    const dmg = (impact - 140) * 0.22 / Math.sqrt(v.def.mass);
    damageVehicle(world, v, dmg, null);
    world.emit(v.x, v.y, { e: 'crash', x: v.x, y: v.y, p: Math.min(1, impact / 500) });
    if (v.def.kind === 'bike' && impact > 280) bikeCrash(world, v, impact);
    if (impact > 330) cargo.knockOff(world, v, impact);
  }
}

export function update(world, dt) {
  const now = world.time;
  const env = { rain: world.weather === WEATHER.RAIN };
  const night = world.clock.dark > 0.4;
  const vehs = [];
  for (const e of world.entities.values()) if (e.kind === K.VEH) vehs.push(e);

  for (const v of vehs) {
    const driver = driverOf(world, v);
    if (v.wreckAt) {
      v.input.throttle = 0; v.input.steer = 0; v.input.hb = true;
      if (now - v.wreckAt > 45 && !v.seats.some((s) => s)) { cargo.spillCargo(world, v); world.remove(v); continue; }
    } else if (!driver || driver.dead) {
      if (driver && driver.dead) ejectPed(world, driver, true);
      v.input.throttle = 0; v.input.steer = 0; v.input.hb = false;
    }
    // player-driven cars were already stepped once per received input (players.processInputs)
    if (v.ownStepTick !== world.tick) stepVehicle(world, v, dt, env);
    // land vehicles that end up in the water sink
    if (v.def.kind !== 'boat') {
      if (!v.sinkAt && WATER_T[world.map.tileAtPx(v.x, v.y)]) startSink(world, v);
      if (v.sinkAt) {
        v.vx *= Math.exp(-2.5 * dt); v.vy *= Math.exp(-2.5 * dt);
        v.input.throttle = 0;
        if (now - v.sinkAt > SINK_S) { sinkBoom(world, v); continue; }
      }
    }
    const fwd = vehForwardSpeed(v);
    v.brake = v.input.throttle < -0.1 && fwd > 20;
    v.reverse = fwd < -10;
    v.drift = Math.abs(vehLateralSpeed(v)) > 110 || (v.input.hb && Math.abs(fwd) > 120);
    v.lights = (night && !!driver) || (v.def.police && v.sirenOn);
    v.siren = !!(v.def.police && v.sirenOn && driver);
    // burning / smoke
    if (!v.wreckAt && v.hp < v.def.hp * 0.15) {
      v.burnUntil = now + 1;
      damageVehicle(world, v, 4 * dt, v.lastAttacker ? world.get(v.lastAttacker) : null);
    }
    // keep occupants and attached cargo glued to the vehicle
    for (const sid of v.seats) if (sid) { const p = world.get(sid); if (p) { p.x = v.x; p.y = v.y; p.vx = v.vx; p.vy = v.vy; } }
  }

  // vehicle vs vehicle
  for (const a of vehs) {
    if (a.removed) continue;
    const sa = Math.abs(a.vx) + Math.abs(a.vy);
    if (sa < 2) continue;
    const near = world.query(a.x, a.y, a.def.L / 2 + 110, K.VEH);
    for (const b of near) {
      if (b === a || b.removed) continue;
      if ((a.def.kind === 'boat') !== (b.def.kind === 'boat')) continue;
      const sb = Math.abs(b.vx) + Math.abs(b.vy);
      if (sb >= 2 && b.id < a.id) continue; // pair handled once when both move
      const hit = obbVsObb(a.x, a.y, a.a, a.def.L / 2, a.def.W / 2, b.x, b.y, b.a, b.def.L / 2, b.def.W / 2);
      if (!hit) continue;
      resolveVehicleHit(world, a, b, hit);
    }
  }

  // vehicle vs pedestrians
  for (const v of vehs) {
    if (v.removed) continue;
    const spd = speedOf(v);
    const near = world.query(v.x, v.y, v.def.L / 2 + 16, K.PED);
    for (const ped of near) {
      if (ped.vehId || ped.dead) continue;
      const h = circleVsObb(ped.x, ped.y, ped.r, v.x, v.y, v.a, v.def.L / 2, v.def.W / 2);
      if (!h) continue;
      const vn = (v.vx - ped.vx) * h.nx + (v.vy - ped.vy) * h.ny;
      if (spd > 120 && vn > 120 && ped.rollT <= 0 && world.time > (ped.hitImmuneUntil || 0)) {
        strikePed(world, v, ped, vn, h);
      } else {
        ped.x += h.nx * h.depth; ped.y += h.ny * h.depth;
        if (!PED_BLOCK[world.map.tileAtPx(ped.x, ped.y)]) { /* ok */ } else { ped.x -= h.nx * h.depth; ped.y -= h.ny * h.depth; }
      }
    }
  }
}

function resolveVehicleHit(world, a, b, hit) {
  const ma = a.def.mass, mb = b.def.mass;
  const bStatic = b.wreckAt ? 0.5 : 1;
  const total = ma + mb * bStatic;
  a.x += hit.nx * hit.depth * (mb * bStatic / total);
  a.y += hit.ny * hit.depth * (mb * bStatic / total);
  b.x -= hit.nx * hit.depth * (ma / total);
  b.y -= hit.ny * hit.depth * (ma / total);
  const rvx = a.vx - b.vx, rvy = a.vy - b.vy;
  const vn = rvx * hit.nx + rvy * hit.ny;
  if (vn >= 0) return;
  const e = 0.25;
  const j = -(1 + e) * vn / (1 / ma + 1 / mb);
  a.vx += (j / ma) * hit.nx; a.vy += (j / ma) * hit.ny;
  b.vx -= (j / mb) * hit.nx; b.vy -= (j / mb) * hit.ny;
  // spin from off-center hits
  const dx = b.x - a.x, dy = b.y - a.y;
  const crossA = (dx * hit.ny - dy * hit.nx) / (a.def.L * a.def.L);
  a.av += crossA * j * 0.06 / ma;
  b.av -= crossA * j * 0.06 / mb;
  const impact = -vn;
  if (impact > 110) {
    const dmg = (impact - 90) * 0.18;
    const da = driverOf(world, a), db = driverOf(world, b);
    const aFaster = speedOf(a) >= speedOf(b);
    damageVehicle(world, a, dmg / Math.sqrt(ma), db);
    damageVehicle(world, b, dmg / Math.sqrt(mb), da);
    world.emit((a.x + b.x) / 2, (a.y + b.y) / 2, { e: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: Math.min(1, impact / 500) });
    const attacker = aFaster ? da : db, victimV = aFaster ? b : a;
    if (attacker && impact > 180) law.vehicleRam(world, attacker, victimV, impact);
    if (impact > 330) { cargo.knockOff(world, a, impact); cargo.knockOff(world, b, impact); }
    if (a.def.kind === 'bike' && impact > 250) bikeCrash(world, a, impact);
    if (b.def.kind === 'bike' && impact > 250) bikeCrash(world, b, impact);
    if (a.ai) npc.onVehicleHit(world, a, aFaster ? null : db);
    if (b.ai) npc.onVehicleHit(world, b, aFaster ? da : null);
  }
}

function strikePed(world, v, ped, vn, h) {
  const driver = driverOf(world, v);
  const dmg = (vn - 100) * 0.17 * Math.sqrt(v.def.mass);
  ped.hitImmuneUntil = world.time + 0.4;
  ped.vx = v.vx * 0.55 + h.nx * 160;
  ped.vy = v.vy * 0.55 + h.ny * 160;
  ped.x += h.nx * h.depth; ped.y += h.ny * h.depth;
  ped.downUntil = world.time + 1.6;
  v.vx *= 0.92; v.vy *= 0.92;
  world.emit(ped.x, ped.y, { e: 'blood', x: ped.x, y: ped.y, a: Math.atan2(v.vy, v.vx), n: 10 });
  const killed = combat.damage(world, ped, dmg, driver, 'vehicle', Math.atan2(v.vy, v.vx));
  if (killed) v.bloody = true;
  if (driver) law.hitAndRun(world, driver, ped, killed, v);
  if (driver && !killed) law.subdue(world, driver, ped);
  if (ped.npc) npc.onAttacked(world, ped, driver);
}

function bikeCrash(world, v, impact) {
  // GDD: crashing a sport bike at high speed triggers an immediate ragdoll ejection
  for (const sid of [...v.seats]) {
    if (!sid) continue;
    const ped = world.get(sid);
    if (!ped) continue;
    ejectPed(world, ped, true);
    // over the handlebars
    fling(world, ped, v.vx * 0.9, v.vy * 0.9, null, 'crash');
    combat.damage(world, ped, (impact - 200) * 0.3, null, 'crash', Math.atan2(v.vy, v.vx));
  }
}


export function damageVehicle(world, v, amount, attackerPed) {
  if (v.wreckAt || amount <= 0) return;
  v.hp -= amount;
  if (attackerPed) v.lastAttacker = attackerPed.id;
  if (v.hp <= 0) explode(world, v, attackerPed);
}

export function explode(world, v, attackerPed) {
  v.hp = 0;
  v.wreckAt = world.time;
  v.sirenOn = false;
  world.emit(v.x, v.y, { e: 'explode', x: v.x, y: v.y, r: v.def.kind === 'bike' ? 60 : 110 });
  for (const sid of [...v.seats]) {
    if (!sid) continue;
    const ped = world.get(sid);
    if (!ped) continue;
    blownOut(world, ped, v, attackerPed);
  }
  cargo.spillCargo(world, v);
  combat.blast(world, v.x, v.y, v.def.kind === 'bike' ? 60 : 110, 70, attackerPed, v.id);
}

// Bailing out of a moving car: you roll out and keep sliding. The faster you were going the
// longer you tumble and the more it hurts; hitting something on the way (players.tumbleImpact)
// can finish you off.
import { BAIL_SPEED } from '../../shared/rules.js';
export { BAIL_SPEED };
function bail(world, ped, v, spd, seat = ped.seat) {
  const a = Math.atan2(v.vy, v.vx);
  // out of the door, carried along by the car's momentum
  const side = a + Math.PI / 2 * (seat % 2 === 1 ? 1 : -1);
  fling(world, ped, v.vx * 0.8 + Math.cos(side) * 70, v.vy * 0.8 + Math.sin(side) * 70, null, 'bail');
}

// Thrown through the air: a short arc (airborne, barely slowing), then one of a few landings -
// tuck and roll, a faceplant, or sliding along on your back - and the hurt that goes with it.
// Clients animate the arc from the 'fling' event; the server owns the path and the damage.
export const LANDINGS = ['roll', 'face', 'slide'];
export function fling(world, ped, vx, vy, attacker = null, cause = 'bail', dmgMul = 1) {
  const now = world.time;
  const spd = Math.hypot(vx, vy);
  const kind = LANDINGS[Math.floor(world.rand() * LANDINGS.length)];
  const air = Math.max(0.28, Math.min(0.75, 0.2 + spd / 1100)) * (0.85 + world.rand() * 0.3);
  const slide = kind === 'face' ? 0.25 : kind === 'roll' ? Math.min(1.4, 0.5 + spd / 700) : Math.min(1.8, 0.6 + spd / 600);
  const getUp = kind === 'face' ? 1.1 : 0.7;
  ped.vx = vx; ped.vy = vy; ped.rollT = 0;
  ped.airUntil = now + air;
  ped.tumbleUntil = now + air + slide;
  ped.downUntil = Math.max(ped.downUntil || 0, now + air + slide + getUp);
  ped.a = Math.atan2(vy, vx);
  world.emit(ped.x, ped.y, { e: 'fling', id: ped.id, d: +air.toFixed(2), k: kind, x: ped.x, y: ped.y });
  // landing hurts more the faster you were going; a faceplant a little extra
  const dmg = Math.max(0, spd - 200) * 0.1 * (kind === 'face' ? 1.25 : 1) * dmgMul;
  if (dmg > 0) combat.damage(world, ped, dmg, attacker, cause, ped.a);
  return kind;
}

// Caught in your own car blowing up: thrown clear, then either dead or barely hanging on.
function blownOut(world, ped, v, attackerPed) {
  ejectPed(world, ped, true);
  ped.blastSafeUntil = world.time + 0.2; // the car's own blast already did its worst
  const a = world.rand() * Math.PI * 2;
  ped.x = v.x + Math.cos(a) * (v.def.W / 2 + 18); ped.y = v.y + Math.sin(a) * (v.def.W / 2 + 18);
  world.place(ped);
  world.emit(ped.x, ped.y, { e: 'blood', x: ped.x, y: ped.y, a, n: 12 });
  fling(world, ped, Math.cos(a) * 340 + v.vx * 0.5, Math.sin(a) * 340 + v.vy * 0.5, attackerPed, 'explosion', 0);
  if (world.rand() < 0.5) { combat.damage(world, ped, 999, attackerPed, 'explosion', a); return; }
  ped.downUntil = Math.max(ped.downUntil, world.time + 3.5);
  const left = ped.maxHp * (0.06 + world.rand() * 0.1);
  combat.damage(world, ped, Math.max(1, ped.hp - left), attackerPed, 'explosion', a);
  if (!ped.dead) { ped.bleeding = true; ped.burnUntil = world.time + 2; if (ped.player) world.notify(ped.player, 'Blown clear of the wreck - badly hurt. Heal up fast!', 'bad'); }
}

// Drove off a dock or a bridge-less shore: everyone spills into the water and swims for it.
function startSink(world, v) {
  v.sinkAt = world.time;
  v.sirenOn = false;
  world.emit(v.x, v.y, { e: 'splash', x: v.x, y: v.y, n: 30 });
  for (let i = 0; i < v.seats.length; i++) {
    const q = v.seats[i] ? world.get(v.seats[i]) : null;
    if (!q) continue;
    v.seats[i] = 0;
    q.vehId = 0; q.seat = -1; q.prevBits = 0;
    const side = v.a + (i % 2 ? Math.PI / 2 : -Math.PI / 2);
    q.x = v.x + Math.cos(side) * (v.def.W / 2 + 12); q.y = v.y + Math.sin(side) * (v.def.W / 2 + 12);
    q.vx = v.vx * 0.3; q.vy = v.vy * 0.3;
    world.place(q);
    if (q.npc && q.npc.role === 'driver') { q.npc.role = 'civ'; q.npc.state = 'wander'; }
    if (q.player) { q.player.meDirty = true; world.notify(q.player, 'Your vehicle is sinking - swim for the shore!', 'bad'); }
  }
  v.input = { throttle: 0, steer: 0, hb: false };
}
function sinkBoom(world, v) {
  world.emit(v.x, v.y, { e: 'sinkboom', x: v.x, y: v.y });
  for (const cid of v.cargo) if (cid) { const c = world.get(cid); if (c) world.remove(c); }
  world.remove(v);
}

export function nearestVehicle(world, ped, range) {
  let best = null, bestD = Infinity;
  for (const v of world.query(ped.x, ped.y, range + 100, K.VEH)) {
    const h = circleVsObb(ped.x, ped.y, range, v.x, v.y, v.a, v.def.L / 2, v.def.W / 2);
    if (!h) continue;
    const d = range - h.depth;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

export function tryEnter(world, ped) {
  if (ped.vehId || ped.dead) return false;
  const v = nearestVehicle(world, ped, 56);
  if (!v) return false;
  const p = ped.player;
  if (v.wreckAt) { if (p) world.notify(p, 'That vehicle is wrecked.', 'bad'); return false; }
  if (v.sinkAt) return false;
  if (v.lockedTo && (!p || v.lockedTo !== p.pid)) { if (p) world.notify(p, 'Locked - this cruiser is reserved for another officer.', 'warn'); return false; }
  if (ped.carrying) cargo.dropCrate(world, ped);
  let seat = -1;
  const driver = driverOf(world, v);
  if (!driver) seat = 0;
  else if (driver.player && driver.player !== p) {
    seat = v.seats.findIndex((s, i) => i > 0 && !s);
    if (seat < 0) { carjack(world, ped, v, driver); seat = 0; }
  } else if (driver.npc) {
    carjack(world, ped, v, driver); seat = 0;
  }
  if (seat < 0) return false;
  if (seat === 0 && p) {
    const mine = v.owner === p.pid || v.issuedTo === p.pid;
    const already = v.stolenBy && v.stolenBy.has(p.pid);
    if (!mine && !already && !v.carjacked) {
      if (v.def.police && !p.badge) law.crime(world, ped, 'policeTheft', null, v.x, v.y);
      else if (v.npcOwned || v.owner) law.crime(world, ped, 'theft', v.owner ? world.players.get(v.owner)?.ped || null : null, v.x, v.y);
    }
    (v.stolenBy ||= new Set()).add(p.pid);
  }
  v.carjacked = false;
  v.seats[seat] = ped.id;
  ped.vehId = v.id;
  ped.seat = seat;
  ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  v.parked = false;
  if (seat === 0 && p) p.lastVehicle = v.id;
  if (seat === 0) { v.lastDriver = ped.id; if (v.ai && v.ai.kind === 'traffic') { v.ai = null; v.despawnable = true; } }
  if (p) { p.meDirty = true; world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y }); }
  return true;
}

function carjack(world, ped, v, driver) {
  const spd = speedOf(v);
  ejectPed(world, driver, true);
  // yanked out: at speed they go flying; slow, they just stumble out onto the pavement
  if (spd > BAIL_SPEED) bail(world, driver, v, spd, 0);
  else { driver.downUntil = world.time + 0.6; driver.vx = -Math.sin(v.a) * 90; driver.vy = Math.cos(v.a) * 90; }
  // NPC passengers bail out too (a stolen cruiser shouldn't keep its officers on board)
  for (let i = 1; i < v.seats.length; i++) {
    const q = v.seats[i] ? world.get(v.seats[i]) : null;
    if (q && q.npc) { ejectPed(world, q, true); if (spd > BAIL_SPEED) bail(world, q, v, spd, i); }
  }
  v.carjacked = true;
  law.crime(world, ped, 'carjack', driver, v.x, v.y);
  if (driver.npc) npc.onCarjacked(world, driver, ped);
  if (driver.player) world.notify(driver.player, `You were carjacked by ${ped.name || 'someone'}!`, 'bad');
}

export function exitVehicle(world, ped) {
  const v = world.get(ped.vehId);
  if (!v) { ped.vehId = 0; ped.seat = -1; return; }
  const spd = speedOf(v);
  if (v.def.kind === 'boat' && !findExitSpot(world, v, ped, 150) && ped.player) world.notify(ped.player, 'Over the side - swim for it!', 'info');
  ejectPed(world, ped, false);
  if (spd > BAIL_SPEED && v.def.kind !== 'boat') bail(world, ped, v, spd);
}

function sideSpot(v, ped) {
  const side = v.a + (ped.seat % 2 ? Math.PI / 2 : -Math.PI / 2);
  return { x: v.x + Math.cos(side) * (v.def.W / 2 + 14), y: v.y + Math.sin(side) * (v.def.W / 2 + 14) };
}

function findExitSpot(world, v, ped, maxR) {
  const hw = v.def.W / 2 + 16, hl = v.def.L / 2 + 16;
  const cands = [[0, -hw], [0, hw], [-hl, 0], [hl, 0], [-hl / 2, -hw], [-hl / 2, hw]];
  for (const [lx, ly] of cands) {
    const [x, y] = localToWorld(v.x, v.y, v.a, lx, ly);
    if (!PED_BLOCK[world.map.tileAtPx(x, y)]) return { x, y };
  }
  for (let r = 48; r <= maxR; r += 16) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const x = v.x + Math.cos(ang) * r, y = v.y + Math.sin(ang) * r;
      if (!PED_BLOCK[world.map.tileAtPx(x, y)]) return { x, y };
    }
  }
  return null;
}

export function ejectPed(world, ped, force) {
  const v = world.get(ped.vehId);
  if (v) {
    const i = v.seats.indexOf(ped.id);
    if (i >= 0) v.seats[i] = 0;
    // nowhere dry nearby (out on the water): over the side, into the water beside the vehicle
    const spot = findExitSpot(world, v, ped, v.def.kind === 'boat' ? 150 : force ? 400 : 150) || sideSpot(v, ped);
    ped.x = spot.x; ped.y = spot.y;
    ped.a = v.a;
    if (ped.player) { ped.player.meDirty = true; world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y }); }
    if (i === 0) v.input = { throttle: 0, steer: 0, hb: false };
  }
  ped.vehId = 0; ped.seat = -1;
  ped.prevBits = 0;
}

export function vehFlags(world, v) {
  let f = 0;
  if (v.lights) f |= VF.LIGHTS;
  if (v.siren) f |= VF.SIREN;
  if (v.brake) f |= VF.BRAKE;
  if (v.reverse) f |= VF.REVERSE;
  if (v.wreckAt) f |= VF.WRECK;
  if (v.burnUntil > world.time || (v.wreckAt && world.time - v.wreckAt < 20)) f |= VF.BURN;
  if (v.hp < v.def.hp * 0.35) f |= VF.SMOKE;
  if (v.drift) f |= VF.DRIFT;
  if (v.hornUntil > world.time) f |= VF.HORN;
  if (v.bloody) f |= VF.BLOODY;
  if (v.seats[0]) f |= VF.DRIVER;
  if (v.owner) f |= VF.OWNED;
  return f;
}
