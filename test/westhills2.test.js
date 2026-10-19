// West Hills' middle, handcrafted (shared/world3-westhills2.js, 2026-10-19): Meadowbrook Drive bends from Westport
// Boulevard to Hillcrest Avenue, Sorrel Crescent leaves it and comes back to it, Quail Run winds from Hills Avenue to it,
// the courts leave a street and end in their bulbs, Skyview Loop leaves Fountain Avenue and comes back to it; the avenues
// round its areas stay the grid's. (The district built in the whole world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WESTHILLS2, MX, MY } from '../shared/world3-westhills2.js';
import { WESTHILLS } from '../shared/world3-westhills.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

const on = (P, q) => P.some((p) => p[0] === q[0] && p[1] === q[1]);

test('West Hills\' middle: the drive, the crescent, the lane, the courts and the loop meet the streets', () => {
  assert.ok(HAND_PLANS.includes(WESTHILLS2));
  const S = WESTHILLS2.streets(), all = (n) => S.filter((s) => s.name === n);
  for (const s of S) assert.ok(['st', 'minor', 'ave'].includes(s.kind) && s.pts.length >= 2, `${s.name}: a kind the generator knows`);
  const drive = all('Meadowbrook Drive').map((s) => s.pts);
  assert.equal(drive.length, 2);
  assert.deepEqual([drive[0][0][1], drive[0].at(-1)[1], drive[1][0][1], drive[1].at(-1)[1]], [MY.blvd, MY.pier, MY.pier, MY.hillcrest], 'the drive: Westport Boulevard to Pier Avenue to Hillcrest Avenue');
  assert.deepEqual(drive[0].at(-1), drive[1][0], 'across Pier Avenue at one spot');
  assert.ok(drive.every((P) => P.some((p, i) => i > 0 && p[0] !== P[i - 1][0])), 'it bends');
  const D = drive.flat();
  const sorrel = all('Sorrel Crescent')[0].pts;
  assert.ok(on(D, sorrel[0]) && on(D, sorrel.at(-1)), 'Sorrel Crescent: both ends on the drive\'s bends');
  const quail = all('Quail Run')[0].pts;
  assert.ok(quail[0][0] === MX.hills && on(D, quail.at(-1)), 'Quail Run: from Hills Avenue to the drive');
  assert.ok(quail.some((p, i) => i > 0 && p[1] !== quail[i - 1][1]), 'Quail Run winds');
  for (const s of S.filter((t) => t.culdesac)) assert.ok(on(D, s.pts[0]) || s.pts[0][0] === MX.hills, `${s.name}: leaves a street`);
  const sky = all('Skyview Loop')[0].pts;
  assert.ok(sky[0][1] === MY.fountain && sky.at(-1)[1] === MY.fountain, 'Skyview Loop: both ends on Fountain Avenue');
  const hc = all('Hillcrest Avenue')[0].pts;
  assert.deepEqual([hc[0], hc.at(-1)], [[MX.hills, MY.hillcrest], [1376, MY.hillcrest]], 'Hillcrest Avenue carried on to Hills Avenue');
});

test('West Hills\' middle: the avenues round its areas stay the grid\'s; it doesn\'t touch the north end', () => {
  for (let x = MX.hills + 6; x < MX.syc - 4; x += 13) for (const y of [MY.blvd, MY.pier, MY.hillcrest, MY.fountain]) assert.equal(handPlanAt(x, y), null, `the avenue at ${x}, ${y}`);
  for (let y = MY.blvd + 6; y < MY.fountain - 4; y += 11) { assert.equal(handPlanAt(MX.hills, y), null, `Hills Avenue at ${y}`); assert.equal(handPlanAt(MX.syc, y), null, `Sycamore and Alder Streets at ${y}`); }
  for (const [x, y] of [[1400, 2250], [1520, 2260], [1380, 2360], [1520, 2330], [1350, 2540], [1500, 2520]]) assert.equal(handPlanAt(x, y), WESTHILLS2, `${x}, ${y}`);
  const [, , , ny1] = WESTHILLS.rect;
  assert.ok(ny1 <= MY.blvd, 'the north end stays north of Westport Boulevard');
});
