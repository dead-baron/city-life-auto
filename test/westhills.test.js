// West Hills' north end, handcrafted (shared/world3-westhills.js, 2026-10-19): Larkspur Way bends from Quarter Avenue
// to Old Quarter Road with its courts off it, Primrose Loop leaves Westport Avenue and comes back to it, the other courts
// leave the streets the grid keeps; the avenues between its areas stay the grid's. (The district built in the whole
// world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WESTHILLS, WX, WY } from '../shared/world3-westhills.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('West Hills: the collector, its courts and the loop meet the streets the grid keeps', () => {
  assert.ok(HAND_PLANS.includes(WESTHILLS));
  const S = WESTHILLS.streets(), by = (n) => S.find((s) => s.name === n);
  for (const s of S) assert.ok(['st', 'minor'].includes(s.kind) && s.pts.length >= 2, `${s.name}: a kind the generator knows`);
  const lark = by('Larkspur Way').pts;
  assert.deepEqual([lark[0][1], lark.at(-1)[1]], [WY.quarter, WY.oqr], 'Larkspur Way from Quarter Avenue to Old Quarter Road');
  assert.ok(lark.some((p, i) => i > 0 && p[0] !== lark[i - 1][0]), 'it bends');
  // every court leaves a street at one end (on Larkspur Way's bends, an avenue, Linden Street) and ends in its bulb
  for (const s of S.filter((t) => t.culdesac)) {
    const a = s.pts[0];
    assert.ok(lark.some((p) => p[0] === a[0] && p[1] === a[1]) || a[0] === WX.westport || a[0] === WX.linden, `${s.name}: leaves a street`);
  }
  const loop = by('Primrose Loop').pts;
  assert.equal(loop[0][0], WX.westport); assert.equal(loop.at(-1)[0], WX.westport, 'Primrose Loop: both ends on Westport Avenue');
});

test('West Hills: the avenues between its areas stay the grid\'s', () => {
  for (let y = WY.quarter + 6; y < WY.harbor - 4; y += 11) assert.equal(handPlanAt(WX.westport, y), null, `Westport Avenue at ${y}`);
  for (let x = WX.linden + 6; x < WX.hawthorn - 4; x += 13) assert.equal(handPlanAt(x, WY.oqr), null, `Old Quarter Road at ${x}`);
  assert.equal(handPlanAt(1700, 1750), WESTHILLS);
  assert.equal(handPlanAt(1830, 1850), WESTHILLS);
});
