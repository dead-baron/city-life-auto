// Destructible street furniture: cars (and explosions) smash trees, palms, lamp posts, hydrants,
// benches, bins, newsstands, planters, cones, pallets... The break is authoritative here and
// broadcast to every client (cheap: one small event), which hides the prop, drops debris and
// re-bakes that bit of ground. Smashed hydrants gush a water geyser that drags passing cars.
// The city tidies itself up: props come back a few minutes later when nobody is looking.
import { K } from '../../shared/constants.js';
import { BREAKABLE } from '../../shared/map.js';
import { breakGrid, propRadius, smashProps, geyserDrag, GEYSER_S } from '../../shared/smash.js';
import * as vehicles from './vehicles.js';

const TILE = 32;
const RESPAWN_S = 240;

const grid = breakGrid;
export { propRadius };

// One vehicle vs the street furniture (same shared code the driver's client predicts with).
export function smashFor(world, v) {
  const map = world.map;
  world.brokenProps ??= new Map();
  smashProps(map, v, v.def, (i) => world.brokenProps.has(i), (i, heavy, sp) => {
    const p = map.props[i];
    const driver = v.seats[0] ? world.get(v.seats[0]) : null;
    breakProp(world, i, v.vx, v.vy, driver);
    // heavy things (trees, lamp posts, hydrants) dent the car too
    if (heavy) {
      vehicles.damageVehicle(world, v, Math.min(14, sp * 0.03) / Math.sqrt(v.def.mass), null);
      world.emit(v.x, v.y, { e: 'crash', x: p.x, y: p.y, p: Math.min(0.7, sp / 600) });
    }
  });
  // player-driven cars feel the hydrant spray per input step too (matches their prediction)
  if (v.ownStepTick === world.tick && world.geysers && world.geysers.length) geyserDrag(v, world.geysers.filter((q) => q.until > world.time), 1 / 20);
}

export function breakProp(world, i, ax = 0, ay = 0, by = null) {
  world.brokenProps ??= new Map();
  if (world.brokenProps.has(i)) return false;
  const p = world.map.props[i];
  if (!p || !BREAKABLE.has(p.t)) return false;
  world.brokenProps.set(i, world.time);
  const e = world.map.propSolid.get(i);
  if (e) e.off = true;
  const a = Math.atan2(ay, ax) || 0;
  world.broadcast({ e: 'propbreak', i, a: +a.toFixed(2), x: p.x, y: p.y });
  if (p.t === 'hydrant' || p.t === 'hydrant_y') {
    world.emit(p.x, p.y, { e: 'geyser', x: p.x, y: p.y, d: GEYSER_S });
    world.geysers ??= [];
    world.geysers.push({ x: p.x, y: p.y, until: world.time + GEYSER_S });
  }
  if (by && by.player) by.player.profile.stats.smashed = (by.player.profile.stats.smashed || 0) + 1;
  return true;
}

export function blastBreak(world, x, y, r) {
  const g = grid(world.map);
  const t0x = Math.floor((x - r) / TILE), t1x = Math.floor((x + r) / TILE), t0y = Math.floor((y - r) / TILE), t1y = Math.floor((y + r) / TILE);
  for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
    for (const i of g.get(ty * world.map.w + tx) || []) {
      const p = world.map.props[i];
      if (Math.hypot(p.x - x, p.y - y) < r) breakProp(world, i, p.x - x, p.y - y);
    }
  }
}

export function update(world, dt) {
  const map = world.map;
  const g = grid(map);
  world.brokenProps ??= new Map();
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH || v.def.kind === 'boat' || v.removed) continue;
    if (v.ownStepTick === world.tick) continue; // player-driven: checked after each input step
    smashFor(world, v);
  }
  // geysers from smashed hydrants drag cars driving through the spray
  if (world.geysers && world.geysers.length) {
    world.geysers = world.geysers.filter((q) => q.until > world.time);
    for (const v of world.entities.values()) if (v.kind === K.VEH && v.ownStepTick !== world.tick) geyserDrag(v, world.geysers, dt);
  }
  // tidy-up crew: smashed props reappear after a while, but never in front of a player
  if (world.tick % 40 === 7 && world.brokenProps.size) {
    for (const [i, t] of world.brokenProps) {
      if (world.time - t < RESPAWN_S) continue;
      const p = map.props[i];
      let seen = false;
      for (const pl of world.players.values()) if (pl.ped && Math.hypot(pl.ped.x - p.x, pl.ped.y - p.y) < 1000) { seen = true; break; }
      if (seen) continue;
      world.brokenProps.delete(i);
      const e = map.propSolid.get(i);
      if (e) e.off = false;
      world.broadcast({ e: 'propfix', i });
    }
  }
}

export function brokenList(world) { return world.brokenProps ? [...world.brokenProps.keys()] : []; }
