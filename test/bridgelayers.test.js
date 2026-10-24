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

// (the owner, b1c) a bridge over water whose side has open water two tiles out (tx, ty: the deck tile at the edge)
function deckEdge(m) {
  for (let ty = m.y0 + 4; ty < m.y0 + m.h - 4; ty++) for (let tx = m.x0 + 4; tx < m.x0 + m.w - 4; tx++) {
    if (m.tiles[m.idx(tx, ty)] !== T.BRIDGE || m.tiles[m.idx(tx, ty - 1)] !== T.BRIDGE) continue;
    if (m.tiles[m.idx(tx, ty + 2)] === T.WATER && m.tiles[m.idx(tx, ty + 1)] === T.WATER) return [tx, ty];
  }
  return null;
}
const { pedStep, newPedState, PED } = await import('../shared/physics.js');
const { IN } = await import('../shared/input.js');
const SWIMMER = { canMove: true, canSprint: true, speedMul: 1, regenMul: 1, staminaMax: 100, swimMul: 1, canSwim: true, analog: true };

test('a bridge\'s side holds you: walking off it you stay on the deck; a dive roll jumps in (b1c: "Fell through the bridge")', () => {
  const w = makeWorld(), m = w.map, at = deckEdge(m);
  assert.ok(at, 'a bridge over water');
  const s = newPedState((at[0] + 0.5) * TILE, (at[1] + 0.3) * TILE);
  for (let i = 0; i < 90; i++) pedStep(s, { bits: 0, mx: 0, my: 1, aim: 0 }, 1 / 30, m, SWIMMER);
  assert.equal(m.tileAtPx(s.x, s.y), T.BRIDGE, `still on the deck (${Math.round(s.x)}, ${Math.round(s.y)})`);
  assert.ok(!s.under, 'up on it, not in the water under it');
  // the dive button: over the side and into the water
  pedStep(s, { bits: IN.DIVE, mx: 0, my: 1, aim: 0 }, 1 / 30, m, SWIMMER);
  for (let i = 0; i < 20; i++) pedStep(s, { bits: 0, mx: 0, my: 1, aim: 0 }, 1 / 30, m, SWIMMER);
  assert.ok(s.y > (at[1] + 1) * TILE, `over the side (${Math.round(s.y)}): rolled ${PED.rollSpeed * PED.rollTime} px`);
});

test('a boat under a bridge doesn\'t hit someone up on its deck (b1c: "the boats seem to be able to hit you")', () => {
  const w = makeWorld(), m = w.map;
  let at = null;
  for (let ty = m.y0 + 4; ty < m.y0 + m.h - 4 && !at; ty++) for (let tx = m.x0 + 4; tx < m.x0 + m.w - 4; tx++) {
    if (m.tiles[m.idx(tx, ty)] === T.BRIDGE && m.tiles[m.idx(tx - 3, ty)] === T.BRIDGE && m.tiles[m.idx(tx + 3, ty)] === T.BRIDGE && m.tiles[m.idx(tx, ty - 1)] === T.BRIDGE && m.tiles[m.idx(tx, ty + 1)] === T.BRIDGE) { at = [tx, ty]; break; }
  }
  assert.ok(at, 'a wide bridge');
  const X = (at[0] + 0.5) * TILE, Y = (at[1] + 0.5) * TILE;
  const { p } = joinPlayer(w);
  teleport(w, p.ped, X, Y); p.ped.under = false;
  const hp = p.ped.hp, boat = w.spawnVehicle('speedboat', X - 60, Y, 0, { npcOwned: false });
  boat.vx = 400; boat.vy = 0;
  vehicles.update(w, 1 / 20);
  assert.equal(p.ped.hp, hp, 'not hurt');
  assert.ok(!(p.ped.downUntil > w.time) && !(p.ped.airUntil > w.time), 'not knocked down or flung');
  assert.ok(Math.hypot(p.ped.x - X, p.ped.y - Y) < 2, 'not shoved');
});
