// The explosion tester (H58; the owner, 2026-10-11: "Explosions debug happens when you press it in the debug menu but
// you can't see what's happening on screen because the debug menu is on top. Maybe this debug should be an item you
// shoot or something you can trigger while in game so we can test explosions as rapidly as we had before"). A dev-only
// weapon (shared/items.js boomtest, in the debug menu's give list and its Fire & the tank section): its shot flies like
// a rocket and, where it lands - on whatever it hits, or at the end of its range - sets off the kind of explosion picked;
// the reload key steps through the kinds (shared/rules.js BOOM_TEST_KINDS):
//   small, medium, big, ultra   a blast that size (a car's, a truck's, a fuel tanker's, a flatbed full of explosives)
//   car                          a sedan there, blown up (its own plan from the seed: burns, blows apart or is launched)
//   launch, pieces, wheel        a sedan blown up into the air / blown apart / losing a burning wheel
//   tanker, truck                a fuel tanker / a flatbed loaded with explosives there, gone up (huge; chain reactions)
//   fire                         a burst of flame: everyone close by set alight (burning.js)
// Nobody's crime (dev mode only). The kind is kept on the player (p.boomKind).
import { K } from '../../shared/constants.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { BOOM_TEST_KINDS, BURN } from '../../shared/rules.js';
import { blastSize } from '../../shared/explosions.js';
import * as explosions from './explosions.js';
import * as vehicles from './vehicles.js';
import * as cargo from './cargo.js';
import * as burning from './burning.js';

// the blast sizes (as the debug menu's: dev.js BLAST_SIZES)
const SIZES = { small: () => blastSize(VEHICLES.sedan), medium: () => blastSize(VEHICLES.boxtruck), big: () => blastSize(VEHICLES.tanker), ultra: () => blastSize(null, VEHICLES.flatbed.slots.length) };
export const kindOf = (p) => (p && BOOM_TEST_KINDS.includes(p.boomKind) ? p.boomKind : BOOM_TEST_KINDS[0]);

// The reload key: the next kind
export function nextKind(world, ped) {
  const p = ped.player;
  if (!p) return;
  p.boomKind = BOOM_TEST_KINDS[(BOOM_TEST_KINDS.indexOf(kindOf(p)) + 1) % BOOM_TEST_KINDS.length];
  world.notify(p, `[dev] Boom Tester: ${p.boomKind} (reload to change)`, 'info');
}

// Pulling the trigger: the shot (a projectile drawn as a rocket; it lands in land below)
export function fire(world, ped, w, aim) {
  const sx = ped.x + Math.cos(aim) * 20, sy = ped.y + Math.sin(aim) * 20;
  const proj = world.spawnProjectile(ped.id, sx, sy, aim, w.speed, w.range, w.id);
  if (!proj) return;
  proj.lz = ped.lz || 0;
  proj.land = land;
  proj.boomK = kindOf(ped.player);   // (not .kind: that's the entity's)
  world.emit(sx, sy, { e: 'shot', x1: sx, y1: sy, x2: sx, y2: sy, w: w.i, id: ped.id });
}

// Where it lands (x, y; backed off a little along its flight, out of the wall it hit): the kind it was fired as
export function land(world, p, x, y) {
  const a = Math.atan2(p.vy, p.vx), z = p.lz || 0;
  boom(world, p.boomK || BOOM_TEST_KINDS[0], x - Math.cos(a) * 24, y - Math.sin(a) * 24, a, z);
}
export function boom(world, k, x, y, a = 0, z = 0) {
  if (SIZES[k]) { explosions.blastAt(world, x, y, SIZES[k](), null, undefined, z); return; }
  if (k === 'fire') {
    explosions.blastAt(world, x, y, { r: 50, dmg: 4, big: 0 }, null, undefined, z);
    for (const q of world.query(x, y, 90, K.PED)) if (Math.hypot(q.x - x, q.y - y) < 90) burning.ignite(world, q, null, BURN.secs);
    return;
  }
  const model = k === 'tanker' ? 'tanker' : k === 'truck' ? 'flatbed' : 'sedan';
  const v = world.spawnVehicle(model, x, y, a + Math.PI / 2, { npcOwned: false });
  v.lz = z;
  if (k === 'truck') cargo.loadExplosives(world, v, VEHICLES.flatbed.slots.length);
  if (k === 'launch' || k === 'pieces') v.boomKind = k;
  if (k === 'wheel') v.boomWheel = true;
  vehicles.explode(world, v, null);
}
