// Westport Center's heart, handcrafted (shared/world3-westport.js, 2026-10-19): the avenues round it stay the grid's -
// Westport Boulevard between the hotel and the plaza, Pier Avenue, Westport and Quarter Avenues - and it keeps clear of
// Westport General and Westport PD, which the generator places. (The district built in the whole world:
// test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WESTPORT, PX, PY } from '../shared/world3-westport.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('Westport Center: the avenues round its heart stay the grid\'s', () => {
  assert.ok(HAND_PLANS.includes(WESTPORT));
  assert.deepEqual(WESTPORT.streets(), [], 'no streets of its own: the blocks between the avenues are its');
  for (let x = PX.west + 6; x < PX.quarter - 4; x += 11) for (const y of [PY.eighth, PY.blvd, PY.pier]) assert.equal(handPlanAt(x, y), null, `the street at ${x}, ${y}`);
  for (let y = PY.eighth + 6; y < PY.shore - 4; y += 11) for (const x of [PX.west, PX.quarter]) assert.equal(handPlanAt(x, y), null, `the avenue at ${x}, ${y}`);
  for (const [x, y] of [[PX.axis, 2180], [PX.axis, 2230], [1830, 2280], [1900, 2340]]) assert.equal(handPlanAt(x, y), WESTPORT, `${x}, ${y}`);
});

test('Westport Center: the hospital and the police station stay the generator\'s', () => {
  // (map.js SPECIALS: Westport General and Westport PD north of 8th Street)
  for (const [x, y] of [[1978, 2021], [1944, 2032]]) assert.equal(handPlanAt(x, y), null);
  assert.deepEqual(WESTPORT.specials, []);
});
