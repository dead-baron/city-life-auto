// Two ways out when a character is wedged somewhere it can't walk out of:
//  * Unstuck: stand still for UNSTUCK_S and you're nudged to the nearest open ground (a few metres,
//    never far). Not while wanted, not in or just after a fight - it's no escape hatch.
//  * Surrender: give up on the spot. A wanted player turns themself in (straight to the cells at the nearest station:
//    fined, contraband taken, bail or wait - custody.js); anyone else collapses and wakes up like any death.
// Either way nothing is gained over playing it out.
import { K, T } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import { UNSTUCK_S, UNSTUCK_CALM_S } from '../../shared/rules.js';
import * as law from './law.js';
import * as combat from './combat.js';
import * as vehicles from './vehicles.js';
import * as revive from './revive.js';

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
  if (p.custody) return 'Not in custody.';
  if (ped.ride) return 'Not during a ride.';
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
export function openSpot(map, x, y, maxR = SEARCH_PX, here = false) {
  const free = (px, py) => !PED_BLOCK[map.tileAtPx(px, py)] && map.tileAtPx(px, py) !== T.WATER && map.tileAtPx(px, py) !== T.DEEP;
  const clear = (px, py) => {
    for (const [dx, dy] of [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16], [24, 24], [-24, 24], [24, -24], [-24, -24]]) if (!free(px + dx, py + dy)) return false;
    const tx = Math.floor(px / 32), ty = Math.floor(py / 32);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      for (const e of map.solidProps.get(map.idx(tx + ox, ty + oy)) || []) if (!e.off && Math.hypot(e.x - px, e.y - py) < e.r + 20) return false;
    }
    return true;
  };
  if (here && clear(x, y)) return { x, y };
  for (let r = 0; r <= maxR; r += 16) {
    const n = Math.max(1, Math.round((2 * Math.PI * r) / 16));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (r > 0 && clear(px, py)) return { x: px, y: py };
    }
  }
  return null;
}

// ---- pockets ---------------------------------------------------------------------------------------
// After an update the city can change under the spot a character was saved on: a new building,
// fence or gate can close round it so there's open ground right there but no way out. Walk the
// open tiles from (x, y): reaching a street (road or sidewalk), or so much ground that it can't be
// a closed pocket, means you can get away. Closed gates (the police motor pool, club shutters)
// count as walls - they don't open for everyone.
const STREET = new Set([T.ROAD, T.SIDEWALK, T.BRIDGE]);
const POCKET_LIMIT = 2500; // tiles: more open ground than this is never a trap
function gateTiles(map) {
  const out = new Set();
  for (const gt of map.gates || []) for (const e of gt.props) if (!e.off) out.add(map.idx(Math.floor(e.x / 32), Math.floor(e.y / 32)));
  return out;
}
export function canWalkOut(map, x, y) {
  const tx0 = Math.floor(x / 32), ty0 = Math.floor(y / 32);
  if (!map.inside(tx0, ty0)) return false;
  const gates = gateTiles(map);
  const seen = new Set([map.idx(tx0, ty0)]);
  const q = [tx0, ty0];   // (tiles as (tx, ty) pairs: an index is the map's, never decoded)
  for (let h = 0; h < q.length; h += 2) {
    const tx = q[h], ty = q[h + 1], t = map.tiles[map.idx(tx, ty)];
    if (STREET.has(t) || t === T.WATER || t === T.DEEP || seen.size > POCKET_LIMIT) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx, ny = ty + dy;
      if (!map.inside(nx, ny)) continue;
      const j = map.idx(nx, ny);
      if (seen.has(j) || PED_BLOCK[map.tiles[j]] || gates.has(j)) continue;
      seen.add(j);
      q.push(nx, ny);
    }
  }
  return false; // a closed pocket
}
// The nearest open ground you can walk away from: the closest street-connected tile (searching
// outward through walls), then a clear spot on it.
export function escapeSpot(map, x, y) {
  const tx0 = Math.max(map.x0, Math.min(map.x0 + map.w - 1, Math.floor(x / 32))), ty0 = Math.max(map.y0, Math.min(map.y0 + map.h - 1, Math.floor(y / 32)));
  for (let r = 1; r < 80; r++) {
    const ring = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const tx = tx0 + dx, ty = ty0 + dy;
      if (!map.inside(tx - 1, ty - 1) || !map.inside(tx + 1, ty + 1)) continue;   // (a tile in from the edge)
      const t = map.tiles[map.idx(tx, ty)];
      if (t === T.SIDEWALK || t === T.PLAZA) ring.push([tx, ty, dx * dx + dy * dy]);
    }
    ring.sort((a, b) => a[2] - b[2]);
    for (const [tx, ty] of ring) {
      const px = (tx + 0.5) * 32, py = (ty + 0.5) * 32;
      if (!canWalkOut(map, px, py)) continue;
      const spot = openSpot(map, px, py, 96);
      if (spot && canWalkOut(map, spot.x, spot.y)) return spot;
    }
  }
  return null;
}
// Where to put someone who should be at (x, y): there if it's fine, else the nearest good spot.
export function safeSpot(map, x, y) {
  if (canWalkOut(map, x, y)) {
    const near = openSpot(map, x, y, SEARCH_PX, true);
    if (near && canWalkOut(map, near.x, near.y)) return near;
  }
  return escapeSpot(map, x, y);
}

export function surrender(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not right now.';
  if (p.custody) return p.custody.stage === 'cell' ? 'You\'re in a cell - wait it out, or pay the bail.' : 'The police already have you.';
  if (ped.ride) return 'Not during a ride.';
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
  // no lying there waiting for help: you wake up at your spawn in a couple of seconds
  if (ped.dead && revive.isDowned(ped)) revive.finish(world, ped, null, 'surrender');
  world.notify(p, 'You gave up. Waking up somewhere safe...', 'info');
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
    let to = openSpot(world.map, ped.x, ped.y);
    if (!to || !canWalkOut(world.map, to.x, to.y)) to = escapeSpot(world.map, ped.x, ped.y); // closed in: out to the nearest street
    if (!to) { world.notify(p, 'No open ground nearby - use Surrender to start over.', 'warn'); continue; }
    ped.x = to.x; ped.y = to.y; ped.vx = 0; ped.vy = 0; ped.lz = 0; ped.rollT = 0;
    world.place(ped);
    p.teleportAt = world.time;
    p.meDirty = true;
    world.emit(ped.x, ped.y, { e: 'poof', x: ped.x, y: ped.y });
    world.notify(p, 'Unstuck.', 'good');
  }
}
