// The tank (H58; the owner, 2026-10-11: "Add a tank you can drive and shoot and blow things up with, can spawn in
// debug"). shared/vehicles.js tank: on tracks (it turns on the spot: shared/physics.js), heavy (it shoves cars aside),
// armored (small arms barely scratch it: vehicles.js damageVehicle; a rocket or a shell takes a sixth of it). Its turret
// turns to the driver's aim at TANK.turretRate (shared/rules.js), on its own - it holds where it points while the hull
// turns under it; the fire button sends a shell from the muzzle every TANK.reload s, flying at TANK.speed up to
// TANK.range, going up where it lands (on whatever it hits) as a blast that destroys vehicles outright like a rocket's.
// The clients get the turret's angle from the hull in the vehicle record's damage word's top byte (net.js turretByte)
// and draw it turned that way (art v2: its own model, client/art2/vehicles.js 'tankturret'; the classic view:
// main.js drawTurret); 'tankfire' plays the muzzle flash, the recoil puff and the cannon's boom.
import { K } from '../../shared/constants.js';
import { wrapAngle } from '../../shared/math.js';
import { TANK } from '../../shared/rules.js';
import * as combat from './combat.js';
import * as explosions from './explosions.js';
import * as law from './law.js';
import * as npc from './npc.js';

const TAU = Math.PI * 2;
export const BARREL = 86;   // from the turret's pivot to the muzzle, px
export const PIVOT = -8;    // the turret's pivot, px forward of the hull's middle
// the turret's angle (the world's) and from the hull
export const turretA = (v) => (v.turA === undefined ? v.a : v.turA);
export const turretRel = (v) => wrapAngle(turretA(v) - v.a);
// on the wire: the angle from the hull in 256ths of a turn
export const turretByte = (v) => Math.round(((turretRel(v) + TAU) % TAU) / TAU * 256) & 255;
export const byteRel = (b) => wrapAngle((b & 255) / 256 * TAU);
// where the muzzle is
export function muzzle(v) {
  const a = turretA(v), px = v.x + Math.cos(v.a) * PIVOT, py = v.y + Math.sin(v.a) * PIVOT;
  return { x: px + Math.cos(a) * BARREL, y: py + Math.sin(a) * BARREL, a };
}

// Each tick: every tank's turret turns toward its driver's aim (an empty tank's holds where it points)
export function update(world, dt) {
  if (world.tick % 20 === 0 || !world.tanks) {   // (the tanks about: looked for once a second)
    world.tanks = new Set();
    for (const e of world.entities.values()) if (e.kind === K.VEH && e.def.turret) world.tanks.add(e);
  }
  for (const v of world.tanks) {
    if (v.removed || v.wreckAt) continue;
    if (v.turA === undefined) v.turA = v.a;
    const d = v.seats[0] ? world.get(v.seats[0]) : null;
    if (!d || d.dead || d.aimAngle === undefined) continue;
    const want = wrapAngle(d.aimAngle - v.turA), step = TANK.turretRate * dt;
    v.turA = wrapAngle(v.turA + Math.max(-step, Math.min(step, want)));
  }
}

// The driver pulling the trigger: a shell from the muzzle (once it's reloaded). True if it fired.
export function fire(world, v, ped) {
  const now = world.time;
  if (v.wreckAt || v.dead || now < (v.nextShot || 0)) return false;
  v.nextShot = now + TANK.reload;
  const m = muzzle(v);
  const proj = world.spawnProjectile(ped.id, m.x, m.y, m.a, TANK.speed, TANK.range, 'rocket');
  if (proj) { proj.lz = v.lz || 0; proj.land = shellLand; }
  world.emit(m.x, m.y, { e: 'tankfire', id: v.id, x: Math.round(m.x), y: Math.round(m.y), a: +m.a.toFixed(2) });
  v.vx -= Math.cos(m.a) * 30; v.vy -= Math.sin(m.a) * 30;   // (the recoil rocks it back)
  law.gunfire(world, ped);
  npc.onGunfire(world, m.x, m.y, ped, 520);
  return true;
}

// A shell landing: a blast that wrecks vehicles like a rocket's (combat.blast rocket), sets people alight near its heart
export function shellLand(world, p, x, y, owner) {
  world.emit(x, y, { e: 'explode', x: Math.round(x), y: Math.round(y), r: TANK.r, b: 1, s: explosions.newSeed(world) });
  combat.blast(world, x, y, TANK.r, TANK.dmg, owner || null, 0, true, p.lz || 0, explosions.newLink(), 1);
}
