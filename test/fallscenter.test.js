// Falls Center's main street, handcrafted (shared/world3-fallscenter.js, 2026-10-19): the streets round it stay the
// grid's - Falls Avenue between the shops and the green, 15th and 16th Streets, Lake Avenue, Linden Street - and the
// clinic and the police station stay the generator's. (The district built in the whole world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLSCENTER, CX, CY } from '../shared/world3-fallscenter.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('Falls Center: the streets round the main street and the green stay the grid\'s; the clinic and the police the generator\'s', () => {
  assert.ok(HAND_PLANS.includes(FALLSCENTER));
  for (let x = CX.lake + 6; x < CX.linden - 4; x += 9) for (const y of [CY.fifteenth, CY.falls, CY.sixteenth]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  for (let y = CY.fifteenth + 6; y < CY.sixteenth - 4; y += 7) for (const x of [CX.lake, CX.linden]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  assert.equal(handPlanAt(4150, 2385), FALLSCENTER); assert.equal(handPlanAt(4150, 2416), FALLSCENTER);
  for (const [x, y] of [[4135, 2352], [4054, 2391]]) assert.equal(handPlanAt(x, y), null);
});
