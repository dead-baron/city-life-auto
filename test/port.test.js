// Port Westport's container terminal, handcrafted (shared/world3-port.js, 2026-10-19): the streets round it stay the
// grid's - 8th Street, Westport Boulevard down to the quay between the yards, Pier Avenue, Quarter Avenue - and it keeps
// clear of the Syndicate's Port Westport headquarters south of Pier Avenue. (The district built in the whole world:
// test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PORT, OX, OY } from '../shared/world3-port.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('Port Westport: the streets round the container terminal stay the grid\'s; the gang\'s headquarters stays the generator\'s', () => {
  assert.ok(HAND_PLANS.includes(PORT));
  for (let x = OX.quarter + 6; x < OX.laurel; x += 11) for (const y of [OY.eighth, OY.blvd, OY.pier]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  for (let y = OY.eighth + 6; y < OY.pier - 4; y += 9) assert.equal(handPlanAt(OX.quarter, y), null, `Quarter Avenue at ${y}`);
  assert.equal(handPlanAt(2040, 2180), PORT); assert.equal(handPlanAt(2040, 2250), PORT);
  assert.equal(handPlanAt(2089, 2346), null, 'Syndicate HQ - Port Westport');
});
