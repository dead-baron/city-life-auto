// Pine Hills' south side, handcrafted (shared/world3-pinehills.js, 2026-10-19): Sunset and Westside Avenues, Pine Avenue
// and 5th Street stay the grid's; inside them Magnolia, Alder and Laurel Streets and 20th and 2nd Streets give way to
// Larch and Sequoia Courts and Pinewood Drive round Pinewood Park. (The district built in the whole world:
// test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PINEHILLS, HX, HY } from '../shared/world3-pinehills.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('Pine Hills: the avenues and streets round the courts and the crescent stay the grid\'s; the grid inside gives way', () => {
  assert.ok(HAND_PLANS.includes(PINEHILLS));
  for (let x = HX.sunset + 7; x < HX.westside - 4; x += 9) for (const y of [HY.pine, HY.fifth]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  for (let y = HY.pine + 7; y < HY.fifth - 4; y += 6) for (const x of [HX.sunset, HX.westside]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  for (const [x, y] of [[2636, 3050], [2710, 3020], [2786, 3090], [2600, 3040], [2700, 3074]]) assert.equal(handPlanAt(x, y), PINEHILLS, `${x}, ${y}: the grid's old street gives way`);
  const names = PINEHILLS.streets().map((s) => s.name);
  assert.deepEqual(names, ['Larch Court', 'Sequoia Court', 'Pinewood Drive']);
  // (the crescent leaves Westside Avenue and comes back to it; the courts leave Sunset Avenue)
  const pw = PINEHILLS.streets()[2].pts;
  assert.ok(pw[0][0] === HX.westside && pw[pw.length - 1][0] === HX.westside);
  for (const s of PINEHILLS.streets().slice(0, 2)) assert.equal(s.pts[0][0], HX.sunset);
});
