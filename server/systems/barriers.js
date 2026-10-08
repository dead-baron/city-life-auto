// Highway barriers you can smash through. The break itself happens in the shared level physics
// (shared/levels.js - the driver's client predicts it the same way): a vehicle that hits a
// parapet straight on faster than BARRIER_BREAK_SPEED knocks a stretch of it out and carries on
// over the edge, dropping to the street below. Here the break is recorded and broadcast, and
// the road crew puts the barrier back BARRIER_REPAIR_S later when nobody is close by.
import { BARRIER_REPAIR_S } from '../../shared/rules.js';
import { BARRIER_PIECE } from '../../shared/levels.js';
import { pointAt } from '../../shared/geom.js';
import * as npc from './npc.js';

export function init(world) {
  const L = world.map.levels;
  if (!L) return;
  L.broken = new Map(); // the map is shared between worlds in tests: each world starts intact
  world.brokenBarriers = new Map(); // key -> time broken
  L.onBreak = (keys, x, y, a) => {
    for (const k of keys) world.brokenBarriers.set(k, world.time);
    world.broadcast({ e: 'barrier', k: keys, x: Math.round(x), y: Math.round(y), a: +a.toFixed(2) });
    world.emit(x, y, { e: 'crash', x, y, p: 1 });
    npc.spectacle(world, x, y, { r: 620, near: 90, chance: 1.3, secs: 12 });   // (a car off the highway: the street below gets its phones out)
  };
}

export function update(world) {
  if (!world.brokenBarriers || !world.brokenBarriers.size || world.tick % 40 !== 13) return;
  const L = world.map.levels;
  const fixed = [];
  for (const [k, t] of world.brokenBarriers) {
    if (world.time - t < BARRIER_REPAIR_S) continue;
    const [edge, , piece] = k.split(':').map(Number);
    const e = world.map.edges[edge];
    if (!e) continue;
    const q = pointAt(e.pts, Math.max(0, Math.min(e.len, (piece + 0.5) * BARRIER_PIECE)));
    let seen = false;
    for (const pl of world.players.values()) if (pl.ped && Math.hypot(pl.ped.x - q.x, pl.ped.y - q.y) < 1200) { seen = true; break; }
    if (seen) continue;
    world.brokenBarriers.delete(k);
    L.broken.delete(k);
    fixed.push(k);
  }
  if (fixed.length) world.broadcast({ e: 'barrierfix', k: fixed });
}

export const brokenBarrierList = (world) => (world.brokenBarriers ? [...world.brokenBarriers.keys()] : []);
