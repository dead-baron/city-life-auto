// Gull Harbor, handcrafted (shared/world3-gullharbor.js, 2026-10-19): the whole ferry island is the plan's - the grid
// of mainland streets gives way to the village round the cove (Quay Street, Steeple Street, Kirk, Net and Kittiwake Lanes),
// Windrush Road up the island through the farm to the north shore, East Road closing the loop road, Gull Point Track
// out to the light, the Campground Track into Gull Woods - each on the island's land and joined to the others or to the loop road. (The island built in the whole
// world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GULLHARBOR, GX, GY } from '../shared/world3-gullharbor.js';
import { FERRIES } from '../shared/world3-skeleton.js';
import { FERRY3 } from '../shared/world3-ferries.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';
import { ISLANDS3 } from '../shared/world3-layout.js';
import { inPoly, ARTERIALS } from '../shared/world3-skeleton.js';

test('Gull Harbor: the whole ferry island the plan\'s; its streets on the island, every one meeting another or the loop road', () => {
  assert.ok(HAND_PLANS.includes(GULLHARBOR));
  const isle = ISLANDS3.find((I) => I.key === 'ferry');
  for (const [x, y] of [[1640, 3700], [1700, 3460], [1300, 3510], [2050, 3500], [1760, 3330]]) assert.equal(handPlanAt(x, y), GULLHARBOR, `${x}, ${y}`);
  const S = GULLHARBOR.streets(), loop = ARTERIALS.find((a) => a.name === 'Gull Harbor Loop');
  assert.ok(loop, 'the island\'s loop road');
  for (const s of S) for (const [x, y] of s.pts) assert.ok(inPoly(isle.poly, x + 0.5, y + 0.5), `${s.name}: ${x}, ${y} on the island`);
  // (each street's ends or its line touch another street or the loop: one network)
  const pts = [...S.map((s) => s.pts), loop.pts];
  const segs = (P) => P.slice(1).map((q, k) => [P[k], q]);
  const near = (p, a, b) => {   // (a point within a tile of a segment)
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    const ex = a[0] + dx * t - p[0], ey = a[1] + dy * t - p[1];
    return ex * ex + ey * ey <= 1.5;
  };
  const meets = (P, Q) => [P[0], P[P.length - 1]].some((p) => segs(Q).some(([a, b]) => near(p, a, b))) || [Q[0], Q[Q.length - 1]].some((p) => segs(P).some(([a, b]) => near(p, a, b)));
  S.forEach((s, i) => assert.ok(pts.some((P, j) => j !== i && meets(s.pts, P)), `${s.name} meets another street`));
  // the village round the cove: Quay Street south of Kirk Lane, the quay's edge south of Quay Street
  assert.ok(GY.chapel < GY.quay && GY.quay < GY.edge);
  assert.deepEqual(GULLHARBOR.specials.slice().sort(), ['Gull Harbor Fish Shack', 'Harbor General Store', 'The Anchor', 'The Salty Gull Cafe']);
  // the car ferry comes round the island's east end into the harbour: its last point off the slip on the quay
  const F = FERRIES.find((f) => f.name === 'Gull Harbor Car Ferry'), R = FERRY3.find((f) => f.name === F.name), at = F.pts[R.stops.find((s) => s.name === 'Gull Harbor').pt];
  assert.ok(at === F.pts[F.pts.length - 1] && Math.abs(at[0] - GX.slip) <= 1 && at[1] > GY.edge && at[1] - GY.edge < 6, `the ferry's call off the slip (${at})`);
});
