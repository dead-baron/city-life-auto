// Cedar Falls, handcrafted (shared/world3-cedarfalls.js, 2026-10-19): Willow Crescent leaves Pinecrest Avenue and comes
// back to it, every court leaves the avenue and ends in its bulb; the streets round it stay the grid's - 19th Street,
// Cedar Avenue, Bayside Avenue, Pinecrest Avenue, Laurel Street - and Pelican Bridge's road stays the skeleton's.
// (The district built in the whole world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CEDARFALLS, FX, FY } from '../shared/world3-cedarfalls.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('Cedar Falls: the crescent and the courts leave Pinecrest Avenue; the streets round them stay the grid\'s', () => {
  assert.ok(HAND_PLANS.includes(CEDARFALLS));
  const S = CEDARFALLS.streets(), by = (n) => S.find((s) => s.name === n).pts;
  const w = by('Willow Crescent');
  assert.ok(w[0][0] === FX.pinecrest && w.at(-1)[0] === FX.pinecrest, 'Willow Crescent: both ends on Pinecrest Avenue');
  for (const s of S.filter((t) => t.culdesac)) assert.equal(s.pts[0][0], FX.pinecrest, `${s.name}: leaves Pinecrest Avenue`);
  for (let x = FX.bridge + 6; x < FX.laurel - 4; x += 11) for (const y of [FY.cedar, FY.bayside]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  for (let y = FY.cedar + 6; y < FY.bayside - 4; y += 9) for (const x of [FX.pinecrest, FX.laurel]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  assert.equal(handPlanAt(4230, 2630), CEDARFALLS); assert.equal(handPlanAt(4340, 2680), CEDARFALLS);
  assert.equal(handPlanAt(4110, 2568), null, 'Lake District Station');
});
