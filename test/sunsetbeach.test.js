// Sunset Beach's beachfront, handcrafted (shared/world3-sunsetbeach.js, 2026-10-19): the streets round it stay the
// grid's - 5th Street, Sunset Boulevard, Juniper Street, Sunset Avenue, Linden, Poplar and Hazel Streets - and the plan
// takes the blocks between them north of the boulevard and the beach south of it, out over the water for the pier.
// (The district built in the whole world, and the pier's Ferris wheel there: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUNSETBEACH, BX, BY } from '../shared/world3-sunsetbeach.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('Sunset Beach: the streets round the beachfront stay the grid\'s; the plan takes the shops\' blocks, the beach and the water for the pier', () => {
  assert.ok(HAND_PLANS.includes(SUNSETBEACH));
  for (let x = BX.juniper + 6; x < BX.hazel - 4; x += 7) for (const y of [BY.fifth, BY.blvd]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  for (let y = BY.fifth + 6; y < BY.blvd - 4; y += 5) for (const x of Object.values(BX)) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  for (const [x, y] of [[2530, 3130], [2590, 3130], [2650, 3130], [2710, 3130], [2600, 3175], [2560, 3220]]) assert.equal(handPlanAt(x, y), SUNSETBEACH, `${x}, ${y}`);
  for (const [x, y] of [[2480, 3130], [2780, 3170], [2600, 3090]]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
});
