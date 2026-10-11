// Aircraft on the server (shared/flight.js has the flying itself): the pilot's input, a step with its consequences
// (bumps, hard landings, crashes, ditching), mid-air collisions, getting out up in the air, the attack helicopter's
// missiles, and the aircraft parked at the helipads, the airport's apron and the airstrips (stolen like cars: tryEnter).
import { K } from '../../shared/constants.js';
import { WATER_T } from '../../shared/mapcore.js';
import { obbVsObb } from '../../shared/math.js';
import { isAir, isPlane, flightStep, flightInput, FLY, airfields, rollOf, findPadSpot, floorAt } from '../../shared/flight.js';
import * as vehicles from './vehicles.js';
import * as combat from './combat.js';
import { inAnyView } from '../view.js';   // (the parked ones never pop up on anyone's screen)

const IDLE = { tank: false, fwd: 0, turn: 0, climb: 0, hb: false, m: 0, dx: 0, dy: 0 };
export const airborne = (v) => (v.alt || 0) > FLY.HIGH;
export const inAir = (v) => (v.alt || 0) > FLY.AIRBORNE;
export { isAir };

// the pilot's input (players.js applyInput, one per input the server receives - the same the page predicts with)
export function input(world, v, inp, ped) {
  v.fin = flightInput(v, inp, v.def);
  // the attack helicopter's missiles: fire (the mouse, RT... as a drive-by) sends one the way you aim, two pods turn about
  if (v.def.missiles && (inp.bits & 1) && world.time >= (v.missileAt || 0) && !v.dead && inAir(v)) fireMissile(world, v, ped, inp.bits & 256 ? inp.aim : v.a);
}

// One step (vehicles.stepVehicle sends aircraft here). The engine runs with someone alive at the controls.
export function step(world, v, dt) {
  const drv = vehicles.driverOf(world, v);
  const engine = !!drv && !drv.dead && !v.dead && !v.wreckAt && !v.sinkAt;
  const fi = engine && drv.player ? v.fin || IDLE : IDLE;
  const was = Math.hypot(v.vx, v.vy);
  const o = flightStep(v, fi, dt, world.map, v.def, engine);
  if (v.wreckAt) { if (o.sink > 0) world.emit(v.x, v.y, { e: 'crash', x: v.x, y: v.y, p: 1 }); return; }   // (a wreck falling out of the sky: down it comes)
  if (o.hit > 40) {
    if (o.hit > FLY.CRASH_HIT || (inAir(v) && o.hit > FLY.CRASH_HIT * 0.6 && v.hp < v.def.hp * 0.4)) { crash(world, v, 'hit'); return; }
    vehicles.damageVehicle(world, v, (o.hit - 40) * 0.5, null, true);
    world.emit(v.x, v.y, { e: 'crash', x: v.x, y: v.y, p: Math.min(1, o.hit / 400) });
  }
  if (o.sink > 0) {
    const fwd = was;
    if (o.sink > FLY.CRASH_SINK) { crash(world, v, 'land'); return; }
    if (o.sink > FLY.HARD_SINK) { vehicles.damageVehicle(world, v, (o.sink - FLY.HARD_SINK) * 0.9, null, true); world.emit(v.x, v.y, { e: 'crash', x: v.x, y: v.y, p: 0.4 }); }
    // a plane put down off the hard ground at speed: the wheels dig in
    if (isPlane(v.def) && rollOf(world.map.tileAtPx(v.x, v.y)) < 0.8 && fwd > 260) vehicles.damageVehicle(world, v, (fwd - 260) * 0.35, null, true);
    if (o.water && (isPlane(v.def) ? fwd > 300 : o.sink > FLY.HARD_SINK)) { crash(world, v, 'water'); return; }   // (ditched: it breaks up; gently, it floats a moment and sinks - vehicles.js)
    if (drv && drv.player && !v.wreckAt) world.emit(v.x, v.y, { e: 'touchdown', x: Math.round(v.x), y: Math.round(v.y), id: v.id });
  }
}

// It's down hard (into a building, onto the ground, into the water): it blows up where it is and those inside are
// thrown clear, badly hurt or dead (vehicles.explode)
export function crash(world, v, why) {
  if (v.wreckAt) return;
  v.vx *= 0.25; v.vy *= 0.25; v.vz = 0; v.av = 0;
  v.alt = Math.max(0, Math.min(v.alt || 0, FLY.AIRBORNE));
  const drv = vehicles.driverOf(world, v);
  if (drv && drv.player) world.notify(drv.player, why === 'water' ? 'You ditched it in the water!' : why === 'land' ? 'You came down far too hard!' : 'You flew into it!', 'bad');
  vehicles.explode(world, v, v.lastAttacker ? world.get(v.lastAttacker) : null);
}

// Getting out in the air: the first press warns, the second within a few seconds jumps - a fall that hurts by the
// height (into the water much less). Up on a roof: not here (you can only get out on the ground). -> true if handled.
export function leaveInAir(world, ped, v) {
  if (!inAir(v)) return false;
  const p = ped.player;
  const fl = floorAt(world.map, v.x, v.y), roof = fl > 0 && (v.alt || 0) - fl < 2;
  if (roof) { if (p) world.notify(p, 'You can only get out on the ground - fly down off the roof first.', 'warn'); return true; }
  if (!(ped.jumpArmAt && world.time - ped.jumpArmAt < 3)) { ped.jumpArmAt = world.time; if (p) world.notify(p, `You're ${Math.round(v.alt / 22)} m up - press again to jump out!`, 'warn'); return true; }
  ped.jumpArmAt = 0;
  const alt = v.alt || 0, vx = v.vx, vy = v.vy;
  vehicles.ejectPed(world, ped, true);
  const wet = !!WATER_T[world.map.tileAtPx(ped.x, ped.y)];
  vehicles.fling(world, ped, vx * 0.7, vy * 0.7, null, 'crash', 0, { air: Math.min(2.2, 0.4 + alt / 260) });
  const dmg = Math.max(0, alt - 40) * 0.45 * (wet ? 0.25 : 1);
  if (dmg > 0) combat.damage(world, ped, dmg, null, 'crash', ped.a);
  return true;
}

// ---- the attack helicopter's missiles (task stretch: "an attack helicopter you can fly and shoot missiles from") -----
const MISSILE = { speed: 900, range: 1100, every: 0.55 };
function fireMissile(world, v, ped, aim) {
  v.missileAt = world.time + MISSILE.every;
  v.pod = (v.pod || 0) ^ 1;
  const side = v.pod ? 1 : -1, c = Math.cos(v.a), s = Math.sin(v.a);
  const sx = v.x + c * 30 - s * 22 * side, sy = v.y + s * 30 + c * 22 * side;
  const pr = world.spawnProjectile(ped ? ped.id : 0, sx, sy, aim, MISSILE.speed, MISSILE.range, 'rocket');
  pr.lz = v.lz || 0;
  pr.air = true;   // (from up in the air: over the walls, and clear of what's under it - combat.js stepProjectile)
  world.emit(sx, sy, { e: 'shot', id: ped ? ped.id : 0, w: 'rocket', x: Math.round(sx), y: Math.round(sy), a: +aim.toFixed(2) });
}

// ---- the parked ones: the helipads (a police helicopter at headquarters, a helicopter at the airport's pad and at the
// first hospital's yard), light planes on the airport's apron and at the airstrips. Taken (or wrecked), one comes back
// to its spot a while later once nobody's about.
const RESPAWN_S = 240;
function spots(world) {
  const af = airfields(world.map), out = [];
  let hosp = 0;
  for (const p of af.pads) {
    if (p.roof) continue;
    if (p.kind === 'hospital' && hosp++ > 0) continue;
    out.push({ m: p.kind === 'police' ? 'policeheli' : 'heli', x: p.x, y: p.y, a: -Math.PI / 2, police: p.kind === 'police' });
  }
  for (const a of af.aprons) out.push({ m: 'plane', x: a.x, y: a.y, a: a.a });
  return out;
}
function park(world, sp) {
  const v = world.spawnVehicle(sp.m, sp.x, sp.y, sp.a, { npcOwned: !sp.police });
  v.parked = true; v.despawnable = false; v.alt = 0;
  // (the police one: an officer takes it freely; anyone else, it's stealing a police aircraft - vehicles.js tryEnter)
  sp.id = v.id; sp.goneAt = 0;
  return v;
}
function manage(world) {
  // (the first time: parked where nobody's looking - one in someone's view comes once they've gone, like a taken one)
  if (!world.airSpots) { world.airSpots = spots(world); for (const sp of world.airSpots) { if (inAnyView(world, sp.x, sp.y, 200)) sp.goneAt = world.time - RESPAWN_S; else park(world, sp); } return; }
  for (const sp of world.airSpots) {
    const v = world.get(sp.id);
    const there = v && !v.wreckAt && Math.hypot(v.x - sp.x, v.y - sp.y) < 300;
    if (there) { sp.goneAt = 0; continue; }
    if (!sp.goneAt) { sp.goneAt = world.time; continue; }
    if (world.time - sp.goneAt < RESPAWN_S) continue;
    let near = false;
    for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - sp.x, p.ped.y - sp.y) < 900) { near = true; break; }
    if (near || inAnyView(world, sp.x, sp.y, 200) || world.query(sp.x, sp.y, 120, K.VEH).length) continue;   // (never popping up on anyone's screen)
    park(world, sp);
  }
}

// Mid-air: two aircraft close in height that touch both come down.
export function update(world, dt) {
  if (world.tick % 40 === 7 || !world.airSpots) manage(world);
  const up = [];
  for (const e of world.entities.values()) if (e.kind === K.VEH && isAir(e.def) && airborne(e) && !e.wreckAt) up.push(e);
  for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) {
    const a = up[i], b = up[j];
    if (Math.abs(a.alt - b.alt) > 50 || Math.abs(a.x - b.x) > 260 || Math.abs(a.y - b.y) > 260) continue;
    if (!obbVsObb(a.x, a.y, a.a, a.def.L / 2, a.def.W / 2, b.x, b.y, b.a, b.def.L / 2, b.def.W / 2)) continue;
    crash(world, a, 'hit'); crash(world, b, 'hit');
  }
  void dt;
}

// a spot near (x, y) clear for an aircraft of model m (the dev menu's spawns)
export function clearSpotFor(world, x, y, m) { return findPadSpot(world.map, x, y, Math.max(48, VEHR(m)), 600); }
const VEHR = (m) => (m === 'plane' ? 70 : 60);
