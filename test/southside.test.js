// Southside's Riverway Houses, handcrafted (shared/world3-southside.js, 2026-10-19): the streets round it stay the
// grid's - 11th Street, Pelican Avenue between the corner shops and the Houses, 17th Street, Marina Avenue, Poplar
// Street - and it keeps clear of the Syndicate's Southside headquarters north of 9th Street. (The district built in the
// whole world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUTHSIDE, SX, SY } from '../shared/world3-southside.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('Southside: the streets round Riverway Houses stay the grid\'s; the gang\'s headquarters stays the generator\'s', () => {
  assert.ok(HAND_PLANS.includes(SOUTHSIDE));
  for (let x = SX.marina + 6; x < SX.poplar - 4; x += 11) for (const y of [SY.eleventh, SY.pelican, SY.seventeenth]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  for (let y = SY.eleventh + 6; y < SY.seventeenth - 4; y += 9) for (const x of [SX.marina, SX.poplar]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  assert.equal(handPlanAt(3757, 3190), SOUTHSIDE);
  assert.equal(handPlanAt(3757, 3084), null, 'Syndicate HQ - Southside');
});
