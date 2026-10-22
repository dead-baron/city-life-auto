// Grenades (task #303, the owner's 10-08 list; shared/items.js grenade, the numbers: shared/rules.js GRENADE). Pulled
// and thrown the way you aim: out in an arc, bouncing off the ground and the walls (and the cars), rolling to a stop,
// and going off when the fuse burns down - a blast like a car's, round wherever it ended up. On the wire it's a ball
// (K.BALL, t 5: net.js), its height in the extra byte as a ball's; your page draws it (art2/game/actors.js ballSprite).
// From the black market and the Smuggler's Den; a throw is a crime where it's heard (law.js gunfire), the blast a
// violent one where it hurts someone (combat.js blast, as a rocket's).
import { K } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import { WATER_T } from '../../shared/mapcore.js';
import { circleVsObb } from '../../shared/math.js';
import { GRENADE } from '../../shared/rules.js';
import * as explosions from './explosions.js';
import * as law from './law.js';
import * as npc from './npc.js';

const live = (world) => (world.grenades ||= new Set());

// out of ped's hand the way it aims
export function toss(world, ped, aim) {
  const G = GRENADE, c = Math.cos(aim), s = Math.sin(aim);
  const g = world.add({
    id: world.newId(), kind: K.BALL, x: ped.x + c * 14, y: ped.y + s * 14, a: aim, z: 18, lz: ped.lz || 0,
    vx: c * G.speed + (ped.vx || 0) * G.carry, vy: s * G.speed + (ped.vy || 0) * G.carry, vz: G.lift,
    ballKind: 'grenade', by: ped.id, fuseAt: world.time + G.fuse, cx: -1, cy: -1,
  });
  live(world).add(g);
  world.emit(ped.x, ped.y, { e: 'toss', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y) });
  law.gunfire(world, ped);
  npc.onGunfire(world, ped.x, ped.y, ped, 120);   // (the pin and the throw: only people close by look round)
  return g;
}

const blocked = (m, x, y) => !!PED_BLOCK[m.tileAtPx(x, y)];

export function update(world, dt) {
  const set = world.grenades;
  if (!set || !set.size) return;
  const G = GRENADE, m = world.map;
  for (const g of set) {
    if (g.removed) { set.delete(g); continue; }
    if (world.time >= g.fuseAt) { set.delete(g); boom(world, g); continue; }
    // up and down: falling, bouncing off the ground, then rolling
    g.vz -= G.grav * dt;
    g.z += g.vz * dt;
    if (g.z <= 0) {
      g.z = 0;
      if (WATER_T[m.tileAtPx(g.x, g.y)]) {   // (into the water: it sinks - and goes off down there, muffled)
        if (!g.sunk) { g.sunk = true; world.emit(g.x, g.y, { e: 'splash', x: g.x, y: g.y, n: 10 }); }
        g.vx = 0; g.vy = 0; g.vz = 0; g.z = -1;
      } else if (g.vz < -70) { g.vz = -g.vz * G.bounce; g.vx *= G.keep; g.vy *= G.keep; world.emit(g.x, g.y, { e: 'clink', x: Math.round(g.x), y: Math.round(g.y) }); }
      else g.vz = 0;
    }
    if (g.z <= 0.5) { const f = Math.exp(-G.roll * dt); g.vx *= f; g.vy *= f; }
    // across: off the walls (each way on its own), off a car's body low down
    const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
    if (blocked(m, nx, g.y)) g.vx = -g.vx * 0.5; else g.x = nx;
    if (blocked(m, g.x, ny)) g.vy = -g.vy * 0.5; else g.y = ny;
    if (g.z < 26) for (const v of world.query(g.x, g.y, 90, K.VEH)) {
      if ((v.alt || 0) > 6 || !v.def) continue;
      const h = circleVsObb(g.x, g.y, 4, v.x, v.y, v.a, v.def.L / 2, v.def.W / 2);
      if (!h) continue;
      const vn = g.vx * h.nx + g.vy * h.ny;
      if (vn < 0) { g.vx -= 1.5 * vn * h.nx; g.vy -= 1.5 * vn * h.ny; }
      g.x += h.nx * h.depth; g.y += h.ny * h.depth;
    }
    const sp = Math.hypot(g.vx, g.vy);
    if (sp > 1) g.a += sp * dt / 4;   // (rolling: the spin the page draws)
    g.extra = Math.max(0, Math.round(g.z / 2));
    world.place(g);
  }
}

function boom(world, g) {
  const G = GRENADE, by = world.get(g.by) || null, size = g.sunk ? { r: G.r * 0.6, dmg: G.dmg * 0.4, big: 0 } : { r: G.r, dmg: G.dmg, big: 1 };
  if (g.sunk) world.emit(g.x, g.y, { e: 'splash', x: g.x, y: g.y, n: 30 });
  explosions.blastAt(world, g.x, g.y, size, by && by.kind === K.PED ? by : null, undefined, g.lz || 0);
  world.remove(g);
}
