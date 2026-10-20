// Northshore, handcrafted (shared/world3-northshore.js, 2026-10-19): the station town is the plan's in its two pieces -
// south of the main line (Station Avenue, Elm Street, Front Street and Bank Street inside the grid's edge streets) and
// the lobe north of the Shore Road (Bayview Drive round Bayview Green), and the inlet shore east of Oak Street; every
// street inside a piece and joined to another or an edge (bar a cul-de-sac's far end). (The town built in the whole world: test/world3beach.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NORTHSHORE, SX, SY, LX, LY } from '../shared/world3-northshore.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';
import { AVE_X } from '../shared/world3-city.js';

test('Northshore: the station town and the lobe the plan\'s; its streets inside them, every one meeting another or an edge', () => {
  assert.ok(HAND_PLANS.includes(NORTHSHORE));
  for (const [x, y] of [[3100, 800], [3200, 860], [3210, 650], [3190, 620], [3255, 800]]) assert.equal(handPlanAt(x, y), NORTHSHORE, `${x}, ${y}`);
  for (const [x, y] of [[3100, 730], [3030, 800], [3230, 800], [3100, 880], [3210, 705]]) assert.notEqual(handPlanAt(x, y), NORTHSHORE, `${x}, ${y}: outside or an edge street`);
  const S = NORTHSHORE.streets();
  const inR = ([x, y]) => NORTHSHORE.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  for (const s of S) for (const p of s.pts) assert.ok(inR(p), `${s.name}: ${p} inside`);
  const edges = [[[SX.poplar, SY.coast], [SX.poplar, SY.cedar]], [[SX.oak, SY.coast], [SX.oak, SY.cedar]], [[2900, SY.coast], [3300, SY.coast]], [[2900, SY.cedar], [3600, SY.cedar]], [[2900, LY.shore], [3400, LY.shore]]];
  const segs = (P) => P.slice(1).map((q, k) => [P[k], q]);
  const near = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    const ex = a[0] + dx * t - p[0], ey = a[1] + dy * t - p[1];
    return ex * ex + ey * ey <= 1.5;
  };
  // (Front and Bank Streets run on past Oak Street to the inlet villas and end in their turning circles there)
  for (const s of S) for (const p of s.culdesac ? [s.pts[0]] : [s.pts[0], s.pts[s.pts.length - 1]]) {
    const on = [...S.filter((o) => o !== s).map((o) => o.pts), ...edges].some((P) => segs(P).some(([a, b]) => near(p, a, b)));
    assert.ok(on, `${s.name}: its end ${p} meets another street`);
  }
  assert.ok(AVE_X.some((A) => A[0] === SX.station), 'Station Avenue on the avenue lattice');
  assert.ok(SY.coast < SY.front && SY.front < SY.bank && SY.bank < SY.cedar && SX.poplar < SX.elm && SX.elm < SX.station && SX.station < SX.oak);
  assert.ok(LX.west < LX.east && LY.top < LY.shore);
});
