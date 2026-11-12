// Destructible street furniture: cars (and explosions) smash trees, palms, lamp posts, hydrants,
// benches, bins, newsstands, planters, cones, pallets... The break is authoritative here and
// broadcast to every client (cheap: one small event), which hides the prop, drops debris and
// re-bakes that bit of ground. Smashed hydrants gush a water geyser that drags passing cars.
// The city tidies itself up: props come back a few minutes later when nobody is looking.
import { K } from '../../shared/constants.js';
import { BREAKABLE } from '../../shared/map.js';
import { breakGrid, propRadius, smashProps, geyserDrag, GEYSER_S } from '../../shared/smash.js';
import * as vehicles from './vehicles.js';
import * as explosions from './explosions.js';
import { FUEL_PUMP } from '../../shared/rules.js';

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
  if (p.t === 'fuelpump') pumpGoes(world, i, by);
  if (by && by.player) by.player.profile.stats.smashed = (by.player.profile.stats.smashed || 0) + 1;
  return true;
}

// ---- a filling station's pumps (FUEL_PUMP; map.js pumpProps) ---------------------------------------------------------
// A pump broken (rammed, shot to pieces, caught in a blast) goes up a beat later: a fuel blast (explosions.blastAt) that
// breaks the pumps round it in turn (combat.blast -> blastBreak), a station's chain capped. The wreck stays (the prop's
// broken look) till the tidy-up crew, out of everyone's view (update).
function pumpGoes(world, i, by) {
  const P = FUEL_PUMP, now = world.time;
  const ch = (world.pumpChain ||= { at: -1e9, n: 0 });
  if (now - ch.at > P.chainS) { ch.at = now; ch.n = 0; }
  if (ch.n >= P.chain) return;   // (wrecked with the rest, no blast of its own: the chain's cap)
  ch.n++;
  (world.pumpBooms ||= []).push({ i, at: now + P.delay, by: by ? by.id : 0 });
}
// a shot that hits a pump (combat.js hitscan): enough of them and it goes
export function pumpShot(world, i, by) {
  world.pumpHits ??= new Map();
  const n = (world.pumpHits.get(i) || 0) + 1;
  if (n >= FUEL_PUMP.shots) { world.pumpHits.delete(i); breakProp(world, i, 0, 0, by); } else world.pumpHits.set(i, n);
}
// the nearest standing pump along a shot from (x1, y1) to (x2, y2) before t (0..1): { i, t } or null
const pumpList = (map) => map._pumpProps || Object.defineProperty(map, '_pumpProps', { value: map.props.map((p, i) => (p && p.t === 'fuelpump' ? i : -1)).filter((i) => i >= 0), enumerable: false, configurable: true })._pumpProps;
export function pumpOnLine(world, x1, y1, x2, y2, tMax = 1) {
  const L = pumpList(world.map);
  if (!L.length) return null;
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  let best = null;
  for (const i of L) {
    if (world.brokenProps && world.brokenProps.has(i)) continue;
    const p = world.map.props[i], t = ((p.x - x1) * dx + (p.y - y1) * dy) / l2;
    if (t < 0 || t >= tMax) continue;
    const ex = x1 + dx * t - p.x, ey = y1 + dy * t - p.y;
    if (ex * ex + ey * ey < 11 * 11 && (!best || t < best.t)) best = { i, t };
  }
  return best;
}
function pumpStep(world) {
  const now = world.time, Q = world.pumpBooms;
  if (!Q || !Q.length) return;
  world.pumpBooms = Q.filter((q) => q.at > now);
  for (const q of Q) {
    if (q.at > now) continue;
    const p = world.map.props[q.i];
    explosions.blastAt(world, p.x, p.y, { r: FUEL_PUMP.r, dmg: FUEL_PUMP.dmg, big: FUEL_PUMP.big }, q.by ? world.get(q.by) || null : null);
  }
}

export function blastBreak(world, x, y, r) {
  const g = grid(world.map);
  const t0x = Math.floor((x - r) / TILE), t1x = Math.floor((x + r) / TILE), t0y = Math.floor((y - r) / TILE), t1y = Math.floor((y + r) / TILE);
  for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
    for (const i of g.get(world.map.idx(tx, ty)) || []) {
      const p = world.map.props[i];
      if (Math.hypot(p.x - x, p.y - y) < r) breakProp(world, i, p.x - x, p.y - y);
    }
  }
}

// The coasts' blowholes (shared/world3-coast.js: m.natureSites kind 'blowhole'): with the bigger waves the sea surges
// up through the cleft in a burst of spray - every few seconds, now and then a set of two close together - when
// someone is near enough to see it (the page draws it as a spout: the geyser's spray, BLOWHOLE.burst seconds).
export const BLOWHOLE = { every: [6, 13], set: 0.3, gap: 2.4, burst: 1.4, near: 1600 };
export function blowholes(world) {
  if (world.tick % 10 !== 3) return;
  const map = world.map, holes = map._blowholes || Object.defineProperty(map, '_blowholes', { value: (map.natureSites || []).filter((s) => s.kind === 'blowhole'), enumerable: false })._blowholes;
  if (!holes.length) return;
  const B = BLOWHOLE, next = (world.blowNext ||= new Map());
  for (const h of holes) {
    const at = next.get(h);
    if (at !== undefined && world.time < at) continue;
    const r = world.rand ? world.rand() : Math.random();
    next.set(h, world.time + (r < B.set ? B.gap : B.every[0] + r * (B.every[1] - B.every[0])));
    if (at === undefined) continue;   // (the first: its rhythm started)
    let seen = false;
    for (const pl of world.players.values()) if (pl.ped && Math.abs(pl.ped.x - h.x) < B.near && Math.abs(pl.ped.y - h.y) < B.near) { seen = true; break; }
    if (seen) world.emit(h.x, h.y, { e: 'geyser', x: h.x, y: h.y, d: B.burst });
  }
}

export function update(world, dt) {
  const map = world.map;
  const g = grid(map);
  world.brokenProps ??= new Map();
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH || v.def.kind === 'boat' || v.def.kind === 'air' || v.removed) continue;   // (an aircraft, flown by anyone: over the street furniture)
    if (v.ownStepTick === world.tick) continue; // player-driven: checked after each input step
    smashFor(world, v);
  }
  // geysers from smashed hydrants drag cars driving through the spray
  if (world.geysers && world.geysers.length) {
    world.geysers = world.geysers.filter((q) => q.until > world.time);
    for (const v of world.entities.values()) if (v.kind === K.VEH && v.def.kind !== 'air' && v.ownStepTick !== world.tick) geyserDrag(v, world.geysers, dt);   // (not an aircraft: the page predicts no spray for one)
  }
  blowholes(world);
  pumpStep(world);
  // tidy-up crew: smashed props reappear after a while, but never in front of a player (a pump: later, and with nobody
  // anywhere near it)
  if (world.tick % 40 === 7 && world.brokenProps.size) {
    for (const [i, t] of world.brokenProps) {
      const p = map.props[i], pump = p.t === 'fuelpump';
      if (world.time - t < (pump ? FUEL_PUMP.respawnS : RESPAWN_S)) continue;
      let seen = false;
      for (const pl of world.players.values()) if (pl.ped && Math.hypot(pl.ped.x - p.x, pl.ped.y - p.y) < (pump ? FUEL_PUMP.seePx : 1000)) { seen = true; break; }
      if (seen) continue;
      world.brokenProps.delete(i);
      const e = map.propSolid.get(i);
      if (e) e.off = false;
      world.broadcast({ e: 'propfix', i });
    }
  }
}

export function brokenList(world) { return world.brokenProps ? [...world.brokenProps.keys()] : []; }
