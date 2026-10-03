// Vehicle physics, seats (multi-passenger binding), collisions, ped strikes, wrecks.
import { K, VF, WEATHER } from '../../shared/constants.js';
import { vehStep, vehLateralSpeed, vehForwardSpeed } from '../../shared/physics.js';
import { obbVsObb, circleVsObb, localToWorld } from '../../shared/math.js';
import { PED_BLOCK } from '../../shared/map.js';
import * as combat from './combat.js';
import * as cargo from './cargo.js';
import * as law from './law.js';
import * as npc from './npc.js';


export function driverOf(world, v) { return v.seats[0] ? world.get(v.seats[0]) : null; }
export function speedOf(v) { return Math.hypot(v.vx, v.vy); }

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
    const moving = Math.abs(v.vx) + Math.abs(v.vy) > 0.5 || Math.abs(v.input.throttle) > 0.05;
    if (moving) {
      const impact = vehStep(v, v.input, dt, world.map, v.def, env);
      if (impact > 160) {
        const dmg = (impact - 140) * 0.22 / Math.sqrt(v.def.mass);
        damageVehicle(world, v, dmg, null);
        world.emit(v.x, v.y, { e: 'crash', x: v.x, y: v.y, p: Math.min(1, impact / 500) });
        if (v.def.kind === 'bike' && impact > 280) bikeCrash(world, v, impact);
        if (impact > 330) cargo.knockOff(world, v, impact);
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
  if (ped.npc) npc.onAttacked(world, ped, driver);
}

function bikeCrash(world, v, impact) {
  // GDD: crashing a sport bike at high speed triggers an immediate ragdoll ejection
  for (const sid of [...v.seats]) {
    if (!sid) continue;
    const ped = world.get(sid);
    if (!ped) continue;
    ejectPed(world, ped, true);
    ped.vx = v.vx * 0.8; ped.vy = v.vy * 0.8;
    ped.downUntil = world.time + 2;
    combat.damage(world, ped, (impact - 200) * 0.45, null, 'crash', Math.atan2(v.vy, v.vx));
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
    ejectPed(world, ped, true);
    combat.damage(world, ped, 999, attackerPed, 'explosion', 0);
  }
  cargo.spillCargo(world, v);
  combat.blast(world, v.x, v.y, v.def.kind === 'bike' ? 60 : 110, 70, attackerPed, v.id);
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
  ejectPed(world, driver, true);
  v.carjacked = true;
  law.crime(world, ped, 'carjack', driver, v.x, v.y);
  if (driver.npc) npc.onCarjacked(world, driver, ped);
  if (driver.player) world.notify(driver.player, `You were carjacked by ${ped.name || 'someone'}!`, 'bad');
}

export function exitVehicle(world, ped) {
  const v = world.get(ped.vehId);
  if (!v) { ped.vehId = 0; ped.seat = -1; return; }
  const spd = speedOf(v);
  if (v.def.kind === 'boat') {
    const spot = findExitSpot(world, v, ped, 150);
    if (!spot) { if (ped.player) world.notify(ped.player, 'Too far from shore to get out.', 'warn'); return; }
  }
  ejectPed(world, ped, false);
  if (spd > 220) {
    ped.downUntil = world.time + 1.2;
    ped.vx = v.vx * 0.6; ped.vy = v.vy * 0.6;
    combat.damage(world, ped, (spd - 200) * 0.08, null, 'bail', 0);
  }
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
    const spot = findExitSpot(world, v, ped, force ? 400 : 150) || world.map.spawns.default;
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
