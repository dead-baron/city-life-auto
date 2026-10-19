// Coral Cay, handcrafted (shared/world3-coralcay.js, 2026-10-19): the whole key is the plan's - the grid of mainland
// streets gives way to the village's own (Harbor Street, Coral Street, the lanes, Lagoon Way, Cay Road out to the eco
// lodge), each on the key's land and joined to the others. (The key built in the whole world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORALCAY } from '../shared/world3-coralcay.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';
import { ISLANDS3 } from '../shared/world3-layout.js';
import { inPoly } from '../shared/world3-skeleton.js';

test('Coral Cay: the whole key the plan\'s; its streets on the key, every one meeting another', () => {
  assert.ok(HAND_PLANS.includes(CORALCAY));
  const key = ISLANDS3.find((I) => I.key === 'key');
  for (const [x, y] of [[4200, 3420], [4140, 3384], [4420, 3450], [4060, 3420]]) assert.equal(handPlanAt(x, y), CORALCAY, `${x}, ${y}`);
  const S = CORALCAY.streets(), pts = S.map((s) => s.pts);
  for (const s of S) for (const [x, y] of s.pts) assert.ok(inPoly(key.poly, x + 0.5, y + 0.5), `${s.name}: ${x}, ${y} on the key`);
  // (each street's ends or its line touch another street: one network)
  const segs = (P) => P.slice(1).map((q, k) => [P[k], q]);
  const cross = ([a, b], [c, d]) => {   // (closed segments meet: touching ends count)
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    const on = (p, q, r) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return (o1 !== o2 && o3 !== o4) || (!o1 && on(a, b, c)) || (!o2 && on(a, b, d)) || (!o3 && on(c, d, a)) || (!o4 && on(c, d, b));
  };
  S.forEach((s, i) => assert.ok(pts.some((P, j) => j !== i && segs(s.pts).some((g) => segs(P).some((h) => cross(g, h)))), `${s.name} meets another street`));
});
