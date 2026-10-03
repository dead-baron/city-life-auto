// Destructible street furniture: cars (and explosions) smash trees, palms, lamp posts, hydrants,
// benches, bins, newsstands, planters, cones, pallets... The break is authoritative here and
// broadcast to every client (cheap: one small event), which hides the prop, drops debris and
// re-bakes that bit of ground. Smashed hydrants gush a water geyser that drags passing cars.
// The city tidies itself up: props come back a few minutes later when nobody is looking.
import { K } from '../../shared/constants.js';
import { BREAKABLE, HEAVY_PROPS } from '../../shared/map.js';
import { PROP_SIZES } from '../../shared/prefab-data.js';
import { circleVsObb, obbBounds } from '../../shared/math.js';
import * as vehicles from './vehicles.js';

const TILE = 32;
const RESPAWN_S = 240;
const MIN_SPEED = 55;

function grid(map) {
  if (map.breakGrid) return map.breakGrid;
  const g = new Map();
  map.props.forEach((p, i) => {
    if (!BREAKABLE.has(p.t)) return;
    const k = Math.floor(p.y / TILE) * map.w + Math.floor(p.x / TILE);
    (g.get(k) || g.set(k, []).get(k)).push(i);
  });
  map.breakGrid = g;
  return g;
}

export function propRadius(map, i) {
  const p = map.props[i];
  const e = map.propSolid.get(i);
  if (e) return e.r + 2;
  const s = PROP_SIZES[p.t] || [24, 24];
  return Math.max(6, Math.min(16, Math.max(s[0], s[1]) * 0.3));
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
    world.emit(p.x, p.y, { e: 'geyser', x: p.x, y: p.y, d: 12 });
    world.geysers ??= [];
    world.geysers.push({ x: p.x, y: p.y, until: world.time + 12 });
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
    const sp = Math.abs(v.vx) + Math.abs(v.vy);
    if (sp < MIN_SPEED) continue;
    const bb = obbBounds(v.x, v.y, v.a, v.def.L / 2, v.def.W / 2);
    const t0x = Math.floor((bb.minX - 16) / TILE), t1x = Math.floor((bb.maxX + 16) / TILE);
    const t0y = Math.floor((bb.minY - 16) / TILE), t1y = Math.floor((bb.maxY + 16) / TILE);
    for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
      const list = g.get(ty * map.w + tx);
      if (!list) continue;
      for (const i of list) {
        if (world.brokenProps.has(i)) continue;
        const p = map.props[i];
        if (!circleVsObb(p.x, p.y, propRadius(map, i), v.x, v.y, v.a, v.def.L / 2, v.def.W / 2)) continue;
        const driver = v.seats[0] ? world.get(v.seats[0]) : null;
        if (!breakProp(world, i, v.vx, v.vy, driver)) continue;
        // smashing through costs momentum; heavy things (trees, lamp posts, hydrants) dent the car
        const heavy = HEAVY_PROPS.has(p.t);
        const f = heavy ? Math.max(0.55, 1 - 70 / Math.max(80, sp)) : 0.95;
        v.vx *= f; v.vy *= f;
        if (heavy) {
          vehicles.damageVehicle(world, v, Math.min(14, sp * 0.03) / Math.sqrt(v.def.mass), null);
          world.emit(v.x, v.y, { e: 'crash', x: p.x, y: p.y, p: Math.min(0.7, sp / 600) });
        }
      }
    }
  }
  // geysers from smashed hydrants drag cars driving through the spray
  if (world.geysers && world.geysers.length) {
    world.geysers = world.geysers.filter((q) => q.until > world.time);
    for (const q of world.geysers) for (const v of world.query(q.x, q.y, 70, K.VEH)) { v.vx *= 1 - 2 * dt; v.vy *= 1 - 2 * dt; }
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
