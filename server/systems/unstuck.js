// Two ways out when a character is wedged somewhere it can't walk out of:
//  * Unstuck: stand still for UNSTUCK_S and you're nudged to the nearest open ground (a few metres,
//    never far). Not while wanted, not in or just after a fight - it's no escape hatch.
//  * Surrender: give up on the spot. A wanted player turns themself in (busted: fined, contraband
//    taken, back out at the police station); anyone else collapses and wakes up like any death.
// Either way nothing is gained over playing it out.
import { K, T } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import { UNSTUCK_S, UNSTUCK_CALM_S } from '../../shared/rules.js';
import * as law from './law.js';
import * as combat from './combat.js';
import * as vehicles from './vehicles.js';

const STILL_PX = 24;
const SEARCH_PX = 480;

function calmFor(world, p) {
  const ped = p.ped, now = world.time;
  const last = Math.max(ped.lastCombatAt || -999, ped.lastHitAt || -999, ped.attackAnimUntil ? ped.attackAnimUntil - 0.3 : -999);
  return now - last;
}

export function canUnstick(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not right now.';
  if (ped.vehId || ped.onTrain || ped.hidden) return 'Only on foot.';
  if (p.wanted > 0) return 'Not while you\'re wanted - lose the cops first, or surrender.';
  if (calmFor(world, p) < UNSTUCK_CALM_S) return `Not in the middle of a fight - wait ${Math.ceil(UNSTUCK_CALM_S - calmFor(world, p))}s.`;
  return null;
}

export function request(world, p) {
  const err = canUnstick(world, p);
  if (err) { world.notify(p, err, 'warn'); return err; }
  p.unstuck = { at: world.time, x: p.ped.x, y: p.ped.y, hp: p.ped.hp };
  world.notify(p, `Hold still for ${UNSTUCK_S} seconds...`, 'info');
  return null;
}

// Somewhere a person can stand and walk away from: open ground all round, no solid furniture.
export function openSpot(map, x, y) {
  const free = (px, py) => !PED_BLOCK[map.tileAtPx(px, py)] && map.tileAtPx(px, py) !== T.WATER && map.tileAtPx(px, py) !== T.DEEP;
  const clear = (px, py) => {
    for (const [dx, dy] of [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16], [24, 24], [-24, 24], [24, -24], [-24, -24]]) if (!free(px + dx, py + dy)) return false;
    const tx = Math.floor(px / 32), ty = Math.floor(py / 32);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      for (const e of map.solidProps.get((ty + oy) * map.w + tx + ox) || []) if (!e.off && Math.hypot(e.x - px, e.y - py) < e.r + 20) return false;
    }
    return true;
  };
  for (let r = 0; r <= SEARCH_PX; r += 16) {
    const n = Math.max(1, Math.round((2 * Math.PI * r) / 16));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (r > 0 && clear(px, py)) return { x: px, y: py };
    }
  }
  return null;
}

export function surrender(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not right now.';
  if (ped.hidden) return 'Step outside first.';
  if (ped.onTrain) return 'Get off the train first.';
  p.unstuck = null;
  if (ped.vehId) vehicles.ejectPed(world, ped, true);
  if (p.wanted > 0) {
    law.arrest(world, null, ped);
    world.notify(p, 'You turned yourself in.', 'info');
    world.place(ped);
    return null;
  }
  combat.damage(world, ped, 99999, null, 'surrender', 0);
  return null;
}

export function update(world) {
  if (world.tick % 5 !== 1) return;
  for (const p of world.players.values()) {
    const u = p.unstuck;
    if (!u) continue;
    const ped = p.ped;
    if (!ped || ped.dead) { p.unstuck = null; continue; }
    if (Math.hypot(ped.x - u.x, ped.y - u.y) > STILL_PX || ped.hp < u.hp || canUnstick(world, p)) {
      p.unstuck = null;
      world.notify(p, 'Unstuck cancelled.', 'warn');
      continue;
    }
    if (world.time - u.at < UNSTUCK_S) continue;
    p.unstuck = null;
    const to = openSpot(world.map, ped.x, ped.y);
    if (!to) { world.notify(p, 'No open ground nearby - use Surrender to start over.', 'warn'); continue; }
    ped.x = to.x; ped.y = to.y; ped.vx = 0; ped.vy = 0; ped.lz = 0; ped.rollT = 0;
    world.place(ped);
    p.teleportAt = world.time;
    p.meDirty = true;
    world.emit(ped.x, ped.y, { e: 'poof', x: ped.x, y: ped.y });
    world.notify(p, 'Unstuck.', 'good');
  }
}
