// A bridge's two layers: up on its deck and down on the water under it (shared/physics.js ped.under). You can't reach
// down from the deck to take a boat under the bridge, nor up from the water to a car on the deck (the owner, 10-16:
// "You can steal a boat from a bridge (and probably a car on a bridge from the water)") - server/systems/vehicles.js
// acrossBridge, nearestVehicle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
const vehicles = await import('../server/systems/vehicles.js');

test('across a bridge\'s layers: no boat from up on the deck, no car on the deck from the water', () => {
  const w = makeWorld(), m = w.map;
  // a bridge tile with water beside it (along the bridge's side)
  let at = null;
  for (let ty = m.y0 + 4; ty < m.y0 + m.h - 4 && !at; ty++) for (let tx = m.x0 + 4; tx < m.x0 + m.w - 4; tx++) {
    if (m.tiles[m.idx(tx, ty)] !== T.BRIDGE) continue;
    if (m.tiles[m.idx(tx, ty + 2)] === T.WATER && m.tiles[m.idx(tx, ty + 1)] === T.WATER) { at = [tx, ty]; break; }
  }
  assert.ok(at, 'a bridge over water');
  const X = (at[0] + 0.5) * TILE, Y = (at[1] + 0.5) * TILE;
  const { p } = joinPlayer(w);
  // a boat on the water under the bridge
  const boat = w.spawnVehicle('dinghy', X, Y + 12, 0, { npcOwned: false });
  teleport(w, p.ped, X, Y); p.ped.under = false;   // (up on the deck)
  assert.notEqual(vehicles.nearestVehicle(w, p.ped, 56), boat, 'from up on the deck: the boat below is out of reach');
  p.ped.under = true;   // (down in the water under the bridge)
  assert.equal(vehicles.nearestVehicle(w, p.ped, 56), boat, 'from the water: the boat');
  w.remove(boat);
  // a car up on the deck
  const car = w.spawnVehicle('sedan', X, Y, 0, { npcOwned: false });
  teleport(w, p.ped, X, Y + 2 * TILE); p.ped.under = true;   // (swimming beside the bridge)
  assert.notEqual(vehicles.nearestVehicle(w, p.ped, 56), car, 'from the water: the car on the deck is out of reach');
  teleport(w, p.ped, X + 20, Y); p.ped.under = false;
  assert.equal(vehicles.nearestVehicle(w, p.ped, 56), car, 'from the deck: the car');
});
