// North Point, handcrafted (shared/world3-northpoint.js, 2026-10-19): the peninsula's harbour village is the plan's -
// the grid's streets inside it give way to Waterside Road along the quay, Lighthouse Avenue up the spine (where the
// avenue ran), Crest Road, the four lanes and Netmaker Row; its edges stay the grid's (1st Street, Willow and Rowan
// Streets) and the Shore Road's. Every street inside the district and joined to another. (The village built in the
// whole world - the fish shack on the quay, the charter office with its boat: test/world3beach.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NORTHPOINT, PX, PY } from '../shared/world3-northpoint.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';
import { AVE_X } from '../shared/world3-city.js';
import { NORTH } from '../shared/world3-north.js';

test('North Point: the harbour village the plan\'s; its streets inside it, every one meeting another or an edge', () => {
  assert.ok(HAND_PLANS.includes(NORTHPOINT));
  for (const [x, y] of [[3430, 460], [3500, 500], [3600, 650], [3400, 680]]) assert.equal(handPlanAt(x, y), NORTHPOINT, `${x}, ${y}`);
  for (const [x, y] of [[3500, 360], [3700, 500], [3500, 720]]) assert.notEqual(handPlanAt(x, y), NORTHPOINT, `${x}, ${y} outside`);
  const [x0, y0, x1, y1] = NORTHPOINT.rect, S = NORTHPOINT.streets();
  for (const s of S) for (const [x, y] of s.pts) assert.ok(x >= x0 && x <= x1 && y >= y0 && y <= y1, `${s.name}: ${x}, ${y} inside`);
  // (the edges: 1st Street along the top, the Bluffs' edge street, the Shore Road, Willow Street up from it)
  const edges = [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x0 - 100, y1], [x1 + 100, y1]], [[x0, PY.netmaker], [x0, y1]]];
  const segs = (P) => P.slice(1).map((q, k) => [P[k], q]);
  const near = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    const ex = a[0] + dx * t - p[0], ey = a[1] + dy * t - p[1];
    return ex * ex + ey * ey <= 1.5;
  };
  for (const s of S) for (const p of [s.pts[0], s.pts[s.pts.length - 1]]) {
    const on = [...S.filter((o) => o !== s).map((o) => o.pts), ...edges].some((P) => segs(P).some(([a, b]) => near(p, a, b)));
    assert.ok(on, `${s.name}: its end ${p} meets another street`);
  }
  // Lighthouse Avenue where the avenue lattice has it, and on to the light's track
  const ave = S.find((s) => s.name === 'Lighthouse Avenue');
  assert.ok(ave && ave.kind === 'ave' && AVE_X.some((A) => A[0] === ave.pts[0][0]) && ave.pts[0][0] === NORTH.avenue);
  // the quay between Waterside Road and the inlet, the piers out from it: Waterside Road west of the piers' search start
  assert.ok(PX.water < NORTH.shoreFrom && PX.water < PX.ave && PX.ave < PX.crest && PX.crest < PX.edge);
  assert.ok(PY.first < PY.beacon && PY.beacon < PY.herring && PY.herring < PY.anchor && PY.anchor < PY.mackerel && PY.mackerel < PY.netmaker && PY.netmaker < PY.shore);
});
