// Pelican Point, handcrafted (shared/world3-pelican.js, 2026-10-19): Pelican Key's lobe south of 19th Street - 19th
// Street and Breaker Avenue stay the grid's; the beach bar and the charter dock north of the street the generator's.
// (The key's beach built in the whole world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PELICAN, PX, PY } from '../shared/world3-pelican.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('Pelican Point: 19th Street and Breaker Avenue stay the grid\'s; the plan takes the lobe south of the street', () => {
  assert.ok(HAND_PLANS.includes(PELICAN));
  for (let x = PX.west + 4; x < PX.east - 4; x += 7) assert.equal(handPlanAt(x, PY.nineteenth), null, `19th Street at ${x}`);
  for (const y of [3330, 3345, 3355]) assert.equal(handPlanAt(PX.breaker, y), null, `Breaker Avenue at ${y}`);
  for (const [x, y] of [[3500, 3380], [3560, 3372]]) assert.equal(handPlanAt(x, y), PELICAN, `${x}, ${y}`);
  for (const [x, y] of [[3650, 3335], [3500, 3340]]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}: north of 19th Street`);
});
