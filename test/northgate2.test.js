// The rest of Northgate, handcrafted (shared/world3-northgate2.js, 2026-10-19): its streets end on the lines the grid
// keeps (Linden Street, Westside and Bridge Avenues, Spruce Street, Harborview and Stadium Avenues, 24th Street, Trestle
// Street) or on one another; its areas sit round the plan of Northgate's heart (shared/world3-northgate.js) without
// overlapping it, and keep the avenues on their edges. (The district built in the whole world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NORTHGATE2, NX, NY } from '../shared/world3-northgate2.js';
import { NORTHGATE } from '../shared/world3-northgate.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('the rest of Northgate: its streets end on the grid\'s kept lines or on each other', () => {
  assert.ok(HAND_PLANS.includes(NORTHGATE2) && HAND_PLANS.indexOf(NORTHGATE2) > HAND_PLANS.indexOf(NORTHGATE), 'built after the heart');
  const S = NORTHGATE2.streets();
  const KX = new Set([NX.linden, NX.westside, NX.bridge, NX.spruce, NX.harborview, NX.stadium]), KY = new Set([NY.t24, NY.trestle, NY.eleventh, NY.ninth]);
  const on = (p, s) => { const [a, b] = [s.pts[0], s.pts.at(-1)]; return (a[0] === b[0] && p[0] === a[0] && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])) || (a[1] === b[1] && p[1] === a[1] && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])); };
  for (const s of S) {
    assert.ok(['st', 'ave', 'alley', 'minor'].includes(s.kind) && s.pts.length >= 2, `${s.name}: a kind the generator knows`);
    for (const p of [s.pts[0], s.pts.at(-1)]) {
      const kept = s.pts[0][1] === s.pts.at(-1)[1] ? KX.has(p[0]) : KY.has(p[1]);
      assert.ok(kept || S.some((t) => t !== s && on(p, t)), `${s.name}: its end ${p} meets a street`);
    }
  }
  // the heart's streets carried on: 1st, 9th Street and 4th Street (its 6th) meet Spruce Street where its streets start
  for (const y of [NY.first, NY.third, NY.sixth, NY.ninth]) assert.ok(S.some((s) => s.pts.some((p) => p[0] === NX.spruce && p[1] === y)), `a street meets Spruce Street at ${y}`);
  assert.ok(NORTHGATE.streets().some((s) => s.pts.some((p) => p[0] === NX.spruce && p[1] === NY.sixth)), 'the heart\'s 9th Street starts there too');
});

test('the rest of Northgate keeps the avenues on its edges and leaves the heart to its plan', () => {
  // the avenues between its areas stay the grid's: nothing claims a point on them
  for (const x of [NX.westside, NX.bridge, NX.harborview]) for (let y = NY.t24 + 4; y < NY.ninth; y += 9) assert.equal(handPlanAt(x, y), null, `${x},${y}: the avenue stays the grid's`);
  for (const [x, y] of [[2780, 1500], [2920, 1600], [3050, 1640], [3600, 1520]]) assert.equal(handPlanAt(x, y), NORTHGATE2, `${x},${y}: this plan's`);
  assert.equal(handPlanAt(3250, 1550), NORTHGATE, 'the heart: its own plan');
  const [hx0, hy0, hx1, hy1] = NORTHGATE.rect;
  for (const [x0, y0, x1, y1] of NORTHGATE2.rects) assert.ok(x1 <= hx0 || x0 >= hx1 || y1 <= hy0 || y0 >= hy1, 'no overlap with the heart');
});
