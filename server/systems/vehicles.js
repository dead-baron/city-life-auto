// Vehicle physics, seats (multi-passenger binding), collisions, ped strikes, wrecks.
import { K, VF, WEATHER } from '../../shared/constants.js';
import { vehStep, vehLateralSpeed, vehForwardSpeed, deadInput } from '../../shared/physics.js';
import { obbVsObb, circleVsObb, localToWorld } from '../../shared/math.js';
import { PED_BLOCK, WATER_T } from '../../shared/map.js';
import { sameLevel, levelStep } from '../../shared/levels.js';

export const SINK_S = 3.2; // a car that drove into the water sinks, then blows up underwater
import * as combat from './combat.js';
import * as cargo from './cargo.js';
import * as law from './law.js';
import * as npc from './npc.js';
import * as cruiser from './cruiser.js';
import * as traffic from './traffic.js';
import * as explosions from './explosions.js';   // (task #363: the blast by the vehicle, the wreck blown into the air)
import * as carhits from './carhits.js';         // (task #361: run over, onto the hood)


export function driverOf(world, v) { return v.seats[0] ? world.get(v.seats[0]) : null; }
export function speedOf(v) { return Math.hypot(v.vx, v.vy); }

// One physics step + crash consequences. Player-driven cars get exactly one of these per input
// the server receives - the same steps the driver's client predicted - so prediction and server
// never drift apart (that drift was the "car vibrating back and forth" bug).
export function stepVehicle(world, v, dt, env = { rain: world.weather === WEATHER.RAIN }) {
  const moving = Math.abs(v.vx) + Math.abs(v.vy) > 0.5 || Math.abs(v.input.throttle) > 0.05;
  if (!moving) return;
  // pinned broadside to the nose of a train: carried along with it (tyres can't grip that) -
  // unless whoever's at the wheel powers it off the line
  if (world.time - (v.trainDragAt || -9) < 0.12 && Math.abs(v.input.throttle) < 0.3 && !v.wreckAt) {
    v.x += v.vx * dt; v.y += v.vy * dt; v.a += (v.av || 0) * dt;
    return;
  }
  if (v.dead) { const di = deadInput(v, v.input.steer || 0, v.input.hb); v.input.throttle = di.throttle; v.input.slide = false; } // (engine dead: it rolls to a stop)
  const impact = vehStep(v, v.input, dt, world.map, v.def, env);
  if (impact > 160) {
    const dmg = (impact - 140) * 0.22 / Math.sqrt(v.def.mass);
    crashDamage(world, v, dmg, null, impact);
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
    if (v.fly && explosions.flyStep(world, v)) continue;   // (blown up into the air: carried to where it lands)
    const driver = driverOf(world, v);
    if (v.wreckAt) {
      v.input.throttle = 0; v.input.steer = 0; v.input.hb = true;
      if (now - v.wreckAt > 45 && !v.seats.some((s) => s)) { cargo.spillCargo(world, v); world.remove(v); continue; }
    } else if (!driver || driver.dead) {
      if (driver && driver.dead) ejectPed(world, driver, true);
      v.input.throttle = 0; v.input.steer = 0; v.input.hb = false;
    }
    // player-driven cars were already stepped once per received input (players.processInputs);
    // AI drivers get two physics sub-steps a tick with their wheel and pedals re-trimmed in
    // between, so they correct twice as often - smoother lines, steadier speeds
    if (v.ownStepTick !== world.tick) {
      // (only when driveToward steered it this tick: a car braked by hand - police pulling up, the custody car halting -
      // was being steered back at its last target between the sub-steps, so it went round and round instead of stopping)
      if (v.ai && v.ai.ctl && v.ai.ctl.t === world.tick && driver && driver.npc) { stepVehicle(world, v, dt / 2, env); traffic.trim(v); stepVehicle(world, v, dt / 2, env); }
      else stepVehicle(world, v, dt, env);
    }
    // land vehicles that end up in the water sink (not a car on a ferry's deck)
    if (v.def.kind !== 'boat' && !v.onDeck) {
      if (!v.sinkAt && (v.lz || 0) < 0.3 && WATER_T[world.map.tileAtPx(v.x, v.y)]) startSink(world, v);
      if (v.sinkAt) {
        v.vx *= Math.exp(-2.5 * dt); v.vy *= Math.exp(-2.5 * dt);
        v.input.throttle = 0;
        if (now - v.sinkAt > SINK_S) { sinkBoom(world, v); continue; }
      }
    }
    const fwd = vehForwardSpeed(v);
    v.brake = v.input.throttle < -0.1 && fwd > 20;
    v.reverse = fwd < -10;
    // tyre smoke + skid marks: sliding, e-braking, donuts, or a full-throttle launch (burnout)
    v.drift = Math.abs(vehLateralSpeed(v)) > 110 || (v.slip || 0) > 0.3 || (v.spin || 0) > 0 || (v.input.hb && (Math.abs(fwd) > 120 || v.input.throttle > 0.5)) || (v.input.throttle > 0.9 && fwd > 5 && fwd < 140 && !!driver && !!driver.player);
    v.lights = (night && !!driver) || (v.def.police && v.sirenOn);
    v.siren = !!(v.def.police && v.sirenOn && driver);
    // out of health: rolling to a stop, smoking, then on fire, then up it goes (killEngine)
    if (v.dead && !v.wreckAt) {
      if (now >= v.deadFireAt) v.burnUntil = now + 1;
      if (now >= v.deadBoomAt) explode(world, v, v.lastAttacker ? world.get(v.lastAttacker) : null);
    }
    // keep occupants and attached cargo glued to the vehicle
    for (const sid of v.seats) if (sid) { const p = world.get(sid); if (p) { p.x = v.x; p.y = v.y; p.vx = v.vx; p.vy = v.vy; p.lz = v.lz || 0; } }
  }

  // vehicle vs vehicle
  for (const a of vehs) {
    if (a.removed || a.onDeck || a.fly) continue;   // (the cars on a ferry's deck are held in their places: ferries.js)
    const sa = Math.abs(a.vx) + Math.abs(a.vy);
    if (sa < 2) continue;
    const near = world.query(a.x, a.y, a.def.L / 2 + 110, K.VEH);
    for (const b of near) {
      if (b === a || b.removed || b.onDeck || b.fly) continue;
      if ((a.def.kind === 'boat') !== (b.def.kind === 'boat') || !sameLevel(a.lz, b.lz)) continue;
      const sb = Math.abs(b.vx) + Math.abs(b.vy);
      if (sb >= 2 && b.id < a.id) continue; // pair handled once when both move
      const hit = obbVsObb(a.x, a.y, a.a, a.def.L / 2, a.def.W / 2, b.x, b.y, b.a, b.def.L / 2, b.def.W / 2);
      if (!hit) continue;
      resolveVehicleHit(world, a, b, hit);
    }
  }

  // vehicle vs pedestrians
  for (const v of vehs) {
    if (v.removed || v.fly) continue;
    const spd = speedOf(v);
    const near = world.query(v.x, v.y, v.def.L / 2 + 16, K.PED);
    for (const ped of near) {
      if (ped.vehId || ped.dead || ped.onTrain || ped.hoodOf || !sameLevel(ped.lz, v.lz)) continue;
      const h = circleVsObb(ped.x, ped.y, ped.r, v.x, v.y, v.a, v.def.L / 2, v.def.W / 2);
      if (!h) continue;
      const vn = (v.vx - ped.vx) * h.nx + (v.vy - ped.vy) * h.ny;
      if (spd > 120 && vn > 120 && ped.rollT <= 0 && world.time > (ped.hitImmuneUntil || 0)) {
        strikePed(world, v, ped, vn, h);
      } else {
        ped.x += h.nx * h.depth; ped.y += h.ny * h.depth;
        if (spd > 40) carhits.pinned(world, v, ped, dt);   // (pinned rolling against its front: move another way to get off)
        if ((ped.lz || 0) > 0.3) levelStep(world.map, ped, 11);
        else if (PED_BLOCK[world.map.tileAtPx(ped.x, ped.y)]) { ped.x -= h.nx * h.depth; ped.y -= h.ny * h.depth; }
      }
    }
  }
  carhits.update(world, dt);   // (riding a hood: carried along, then thrown off)
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
    crashDamage(world, a, dmg / Math.sqrt(ma), db, impact);
    crashDamage(world, b, dmg / Math.sqrt(mb), da, impact);
    world.emit((a.x + b.x) / 2, (a.y + b.y) / 2, { e: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: Math.min(1, impact / 500) });
    const attacker = aFaster ? da : db, victimV = aFaster ? b : a;
    if (attacker && impact > 180) law.vehicleRam(world, attacker, victimV, impact);
    if (impact > 330) { cargo.knockOff(world, a, impact); cargo.knockOff(world, b, impact); }
    if (impact > 300 && !a.lz && !b.lz) npc.spectacle(world, (a.x + b.x) / 2, (a.y + b.y) / 2, { r: 440, near: 80, chance: impact > 450 ? 1 : 0.55, secs: 9 });   // (a smash: phones out)
    if (a.def.kind === 'bike' && impact > 250) bikeCrash(world, a, impact);
    if (b.def.kind === 'bike' && impact > 250) bikeCrash(world, b, impact);
    if (a.ai) npc.onVehicleHit(world, a, aFaster ? null : db);
    if (b.ai) npc.onVehicleHit(world, b, aFaster ? da : null);
  }
}

function strikePed(world, v, ped, vn, h) {
  const driver = driverOf(world, v);
  // run over or up onto the hood (carhits.js), or knocked flying
  const how = carhits.outcome(world, v, ped, vn);
  let killed;
  if (how !== 'fling') killed = carhits.apply(world, v, ped, vn, how, driver);
  else {
    const dmg = (vn - 100) * 0.17 * Math.sqrt(v.def.mass);
    ped.hitImmuneUntil = world.time + 0.4;
    ped.vx = v.vx * 0.55 + h.nx * 160;
    ped.vy = v.vy * 0.55 + h.ny * 160;
    ped.x += h.nx * h.depth; ped.y += h.ny * h.depth;
    ped.downUntil = world.time + 1.6;
    v.vx *= 0.92; v.vy *= 0.92;
    world.emit(ped.x, ped.y, { e: 'blood', x: ped.x, y: ped.y, a: Math.atan2(v.vy, v.vx), n: 10 });
    killed = combat.damage(world, ped, dmg, driver, 'vehicle', Math.atan2(v.vy, v.vx));
  }
  if (killed) v.bloody = true;
  else if (!ped.wild && vn > 200) npc.spectacle(world, ped.x, ped.y, { r: 380, near: 70, chance: 0.7, secs: 8 });   // (knocked flying: phones out - a death does it in kill())
  if (driver && !ped.wild) law.hitAndRun(world, driver, ped, killed, v); // (an animal on the road: no crime)
  if (driver && !killed && !ped.wild) law.subdue(world, driver, ped);
  if (ped.npc) npc.onAttacked(world, ped, driver);
}

export function bikeCrash(world, v, impact) {
  // GDD: crashing a sport bike at high speed triggers an immediate ragdoll ejection (not off a trike: three wheels)
  if (v.def.stable) return;
  if (v.ai && v.ai.kind === 'club' && impact < 420) return;   // (a club rider in formation rides out a knock: bikers.js)
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


// How much a vehicle shrugs off (damage is divided by this): by kind, heavy trucks and buses the most.
export function toughOf(def) { return def.kind === 'bike' ? VEHICLE_TOUGH.bike : def.kind === 'boat' ? VEHICLE_TOUGH.boat : def.mass >= 2.4 ? VEHICLE_TOUGH.heavy : VEHICLE_TOUGH.car; }

// Damage. raw: already scaled (trains, rockets). boom: if this takes the last of its health it explodes on the
// spot (a rocket, a blast, a crash hard enough); otherwise running out of health kills the engine (killEngine).
// A vehicle already dying: a blast or a rocket sets it off at once, gunfire brings the end sooner.
export function damageVehicle(world, v, amount, attackerPed, raw = false, boom = false) {
  if (v.wreckAt || amount <= 0 || v.ferry) return;   // (the ferries can't be hurt: ferries.js)
  const dmg = raw ? amount : amount / toughOf(v.def);
  if (attackerPed) v.lastAttacker = attackerPed.id;
  if (v.dead) {
    if (boom) explode(world, v, attackerPed);
    else v.deadBoomAt = Math.max(world.time + 0.5, v.deadBoomAt - dmg / 25);
    return;
  }
  v.hp -= dmg;
  if (v.hp > 0) return;
  v.hp = 0;
  if (boom || v.def.pedal) explode(world, v, attackerPed); // (a bicycle just buckles)
  else killEngine(world, v, attackerPed);
}
// A crash: a hard one (closing speed over CRASH_BOOM_IMPACT) blows a motorcycle up on the spot, and anything else
// that was already badly damaged (or that it finishes off); the rest is ordinary damage.
function crashDamage(world, v, dmg, attackerPed, impact) {
  if (v.wreckAt) return;
  if (v.hardHitAt !== world.time || impact > v.hardHit) { v.hardHit = impact; v.hardHitAt = world.time; }   // (custody.js: a bad crash can throw a prisoner out)
  const hard = impact > CRASH_BOOM_IMPACT && !v.def.pedal && v.def.kind !== 'boat';
  if (hard && (v.def.kind === 'bike' || v.dead || v.hp < v.def.hp * CRASH_BOOM_HP)) { explode(world, v, attackerPed); return; }
  damageVehicle(world, v, dmg, attackerPed, false, hard);
}
// Out of health: the engine dies and it rolls to a stop, smoking; it catches fire after DEAD_FIRE_S and blows up
// after DEAD_BOOM_S. Whoever's inside is told to get out; NPCs at the wheel bail and run.
export function killEngine(world, v, attackerPed) {
  if (v.dead || v.wreckAt) return;
  v.dead = true; v.hp = 0; v.sirenOn = false;
  v.deadAt = world.time; v.deadFireAt = world.time + DEAD_FIRE_S; v.deadBoomAt = world.time + DEAD_BOOM_S;
  if (attackerPed) v.lastAttacker = attackerPed.id;
  world.emit(v.x, v.y, { e: 'crash', x: v.x, y: v.y, p: 0.3 });
  for (const sid of [...v.seats]) {
    const ped = sid && world.get(sid);
    if (!ped) continue;
    if (ped.player) world.notify(ped.player, "The engine's dead and it's smoking - get out before it goes up!", 'bad');
    else if (ped.npc && !v.scripted) exitVehicle(world, ped);
  }
}

export function explode(world, v, attackerPed) {
  v.hp = 0;
  v.wreckAt = world.time;
  v.sirenOn = false;
  if (v.def.pedal) {
    // a bicycle has nothing to blow up: it buckles and the rider comes off
    for (const sid of [...v.seats]) { const ped = sid && world.get(sid); if (ped) ejectPed(world, ped, true); }
    cargo.spillCargo(world, v);
    world.emit(v.x, v.y, { e: 'crash', x: v.x, y: v.y, p: 0.4 });
    return;
  }
  // the event (the seed, the pieces, the wreck's flight: explosions.js) before anyone is thrown out of it
  const { size } = explosions.vehicleBoom(world, v, attackerPed);
  for (const sid of [...v.seats]) {
    if (!sid) continue;
    const ped = world.get(sid);
    if (!ped) continue;
    blownOut(world, ped, v, attackerPed);
  }
  cargo.spillCargo(world, v);
  // the blast: bigger vehicles, bigger blasts (a fuel tanker huge); people near are thrown (reactions.blasted)
  combat.blast(world, v.x, v.y, size.r, size.dmg, attackerPed, v.id, false, v.lz || 0);
}

// Bailing out of a moving car: you roll out and keep sliding. The faster you were going the
// longer you tumble and the more it hurts; hitting something on the way (players.tumbleImpact)
// can finish you off.
import { BAIL_SPEED, BAIL_HURT_SPEED, BAIL_HURT_PER_PX, VEHICLE_TOUGH, CRASH_BOOM_IMPACT, CRASH_BOOM_HP, DEAD_FIRE_S, DEAD_BOOM_S } from '../../shared/rules.js';
import * as ferries from './ferries.js';
export { BAIL_SPEED };
function bail(world, ped, v, spd, seat = ped.seat) {
  const a = Math.atan2(v.vy, v.vx);
  // out of the door, carried along by the vehicle's momentum (clear of it: you don't tumble into
  // your own bike)
  const side = a + Math.PI / 2 * (seat % 2 === 1 ? 1 : -1);
  ped.bailFrom = v.id; ped.bailFromUntil = world.time + 1.5;
  fling(world, ped, v.vx * 0.8 + Math.cos(side) * 70, v.vy * 0.8 + Math.sin(side) * 70, null, 'bail');
}

// Thrown through the air: a short arc (airborne, barely slowing), then one of a few landings -
// tuck and roll, a faceplant, or sliding along on your back - and the hurt that goes with it.
// Clients animate the arc from the 'fling' event; the server owns the path and the damage.
export const LANDINGS = ['roll', 'face', 'slide'];
// o (hit reactions, reactions.js): { kind, air, slide, getUp } override the bail's own choices.
export function fling(world, ped, vx, vy, attacker = null, cause = 'bail', dmgMul = 1, o = null) {
  const now = world.time;
  const spd = Math.hypot(vx, vy);
  // Bailing out: slow, you just tuck and roll and come up unhurt (even if you roll into
  // something); fast, the landing is a gamble - the faster you were going the likelier it's a
  // faceplant, and the harder it hits.
  const soft = cause === 'bail' && spd < BAIL_HURT_SPEED;
  ped.tumbleSoft = soft;
  const over = cause === 'bail' ? Math.max(0, (spd - BAIL_HURT_SPEED) / 400) : 0;
  const kind = (o && o.kind) || (soft ? 'roll' : cause === 'bail' ? (world.rand() < 0.25 + over * 0.45 ? 'face' : world.rand() < 0.5 ? 'roll' : 'slide') : LANDINGS[Math.floor(world.rand() * LANDINGS.length)]);
  const air = o && o.air !== undefined ? o.air : Math.max(0.28, Math.min(0.75, 0.2 + spd / 1100)) * (0.85 + world.rand() * 0.3);
  const slide = o && o.slide !== undefined ? o.slide : kind === 'face' ? 0.25 : kind === 'roll' ? Math.min(1.4, 0.5 + spd / 700) : Math.min(1.8, 0.6 + spd / 600);
  const getUp = o && o.getUp !== undefined ? o.getUp : kind === 'face' ? 1.1 : 0.7;
  ped.vx = vx; ped.vy = vy; ped.rollT = 0;
  ped.airUntil = now + air;
  ped.tumbleUntil = now + air + slide;
  ped.downUntil = Math.max(ped.downUntil || 0, now + air + slide + getUp);
  ped.flungKind = kind;
  if (spd > 1) ped.a = Math.atan2(vy, vx);
  world.emit(ped.x, ped.y, { e: 'fling', id: ped.id, d: +air.toFixed(2), k: kind, x: ped.x, y: ped.y });
  // landing hurts more the faster you were going; a faceplant a little extra
  const dmg = cause === 'bail'
    ? Math.max(0, spd - BAIL_HURT_SPEED) * BAIL_HURT_PER_PX * (kind === 'face' ? 1.4 : kind === 'roll' ? 0.8 : 1) * dmgMul
    : Math.max(0, spd - 200) * 0.1 * (kind === 'face' ? 1.25 : 1) * dmgMul;
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
  combat.damage(world, ped, Math.max(1, ped.hp - left) * combat.gritOf(ped, 'explosion'), attackerPed, 'explosion', a);   // (left on that much: a player's grit undone)
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
    if (!sameLevel(v.lz, ped.lz)) continue;
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
  if (v.ferry) { if (p) world.notify(p, 'Board the ferry with interact while it\'s in at the pier.', 'info'); return false; }   // (ferries.js: never taken)
  if (v.wreckAt) { if (p) world.notify(p, 'That vehicle is wrecked.', 'bad'); return false; }
  if (v.sinkAt) return false;
  if (v.forSale) { if (p) world.notify(p, `It's for sale: $${v.forSale.price.toLocaleString()}. Walk up to it and press interact to buy it.`, 'info'); return false; }
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
    const mine = v.owner === p.pid || v.rentedBy === p.pid || v.issuedTo === p.pid || (v.motorPool !== undefined && p.badge);
    const already = v.stolenBy && v.stolenBy.has(p.pid);
    if (!mine && !already && !v.carjacked) {
      if (v.def.police && !p.badge) law.crime(world, ped, 'policeTheft', null, v.x, v.y);
      else if (v.npcOwned || v.owner) law.crime(world, ped, v.def.pedal ? 'bikeTheft' : 'theft', v.owner ? world.players.get(v.owner)?.ped || null : null, v.x, v.y);
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
  if (seat === 0 && p && p.badge && v.def.police && v.cruiserOf !== p.pid && (v.motorPool !== undefined || v.issuedTo === p.pid)) cruiser.adopt(world, p, v);
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
  law.crime(world, ped, v.def.pedal ? 'bikejack' : 'carjack', driver, v.x, v.y);
  if (driver.npc) npc.onCarjacked(world, driver, ped);
  if (driver.player) world.notify(driver.player, `You were carjacked by ${ped.name || 'someone'}!`, 'bad');
}

export function exitVehicle(world, ped) {
  const v = world.get(ped.vehId);
  if (!v) { ped.vehId = 0; ped.seat = -1; return; }
  if (v.onDeck && ferries.leaveDeckCar(world, ped, v)) return;   // (out of a car on a ferry's deck: up to a seat aboard)
  if (v.ferry) { const to = ferries.exitToward(world, v); if (to) { ejectPed(world, ped, false, to); return; } }   // (off at the pier)
  const spd = speedOf(v);
  if (v.def.kind === 'boat' && !findExitSpot(world, v, ped, 150) && ped.player) world.notify(ped.player, 'Over the side - swim for it!', 'info');
  // off a bus: out of the doors on the kerb side (the right of the way it faces), onto the pavement by the stop
  ejectPed(world, ped, false, v.bus && ped.seat > 0 ? { x: v.x - Math.sin(v.a) * 140, y: v.y + Math.cos(v.a) * 140 } : null);
  if (spd > BAIL_SPEED && v.def.kind !== 'boat') bail(world, ped, v, spd);
}

function sideSpot(v, ped) {
  const side = v.a + (ped.seat % 2 ? Math.PI / 2 : -Math.PI / 2);
  return { x: v.x + Math.cos(side) * (v.def.W / 2 + 14), y: v.y + Math.sin(side) * (v.def.W / 2 + 14) };
}

// toward: a place they're heading for (a crew going to someone hurt): out on the side nearest it, so the vehicle
// isn't standing between them and it
function findExitSpot(world, v, ped, maxR, toward = null) {
  const hw = v.def.W / 2 + 16, hl = v.def.L / 2 + 16;
  if ((v.lz || 0) > 0.3) return null; // up on the deck: step out beside it (the barriers keep you on)
  const cands = [[0, -hw], [0, hw], [-hl, 0], [hl, 0], [-hl / 2, -hw], [-hl / 2, hw]].map(([lx, ly]) => localToWorld(v.x, v.y, v.a, lx, ly));
  if (toward) cands.sort((a, b) => Math.hypot(a[0] - toward.x, a[1] - toward.y) - Math.hypot(b[0] - toward.x, b[1] - toward.y));
  for (const [x, y] of cands) if (!PED_BLOCK[world.map.tileAtPx(x, y)]) return { x, y };
  for (let r = 48; r <= maxR; r += 16) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const x = v.x + Math.cos(ang) * r, y = v.y + Math.sin(ang) * r;
      if (!PED_BLOCK[world.map.tileAtPx(x, y)]) return { x, y };
    }
  }
  return null;
}

export function ejectPed(world, ped, force, toward = null) {
  const v = world.get(ped.vehId);
  if (v) {
    const i = v.seats.indexOf(ped.id);
    if (i >= 0) v.seats[i] = 0;
    // nowhere dry nearby (out on the water): over the side, into the water beside the vehicle
    const spot = findExitSpot(world, v, ped, v.def.kind === 'boat' ? 150 : force ? 400 : 150, toward) || sideSpot(v, ped);
    ped.x = spot.x; ped.y = spot.y; ped.lz = v.lz || 0;
    if (ped.lz > 0.3) levelStep(world.map, ped, 11);
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
  if (v.burnUntil > world.time || (v.wreckAt && !v.def.pedal && world.time - v.wreckAt < 20)) f |= VF.BURN;
  if ((v.hp < v.def.hp * 0.35 || v.dead) && !v.def.pedal) f |= VF.SMOKE;
  if (v.dead && !v.wreckAt) f |= VF.DEAD;
  if (v.drift) f |= VF.DRIFT;
  if (v.hornUntil > world.time) f |= VF.HORN;
  if (v.bloody) f |= VF.BLOODY;
  if (v.seats[0]) f |= VF.DRIVER;
  if (v.owner) f |= VF.OWNED;
  if (v.flat) f |= VF.FLAT;
  return f;
}
