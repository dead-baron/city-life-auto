// The Bluffs, handcrafted (shared/world3-bluffs.js, 2026-10-19): the villa headland east of North Point is the plan's -
// the grid's numbered streets inside it give way to Bluffs Avenue (where the avenue ran, turning west on the point to
// Rowan Street), Seacliff, Cormorant and Windward Lanes, Club Lane, Headland Road and Chapel Road; its edges stay the
// grid's (Rowan and Elm Streets, the east edge street) and the Shore Road's. Every street inside the district and
// joined to another. (The houses, the Cliff Walk and the overlook built in the whole world: test/world3beach.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLUFFS, BX, BY } from '../shared/world3-bluffs.js';
import { NORTHPOINT } from '../shared/world3-northpoint.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';
import { AVE_X } from '../shared/world3-city.js';

test('The Bluffs: the headland the plan\'s; its streets inside it, every one meeting another or an edge', () => {
  assert.ok(HAND_PLANS.includes(BLUFFS));
  for (const [x, y] of [[3650, 460], [3700, 520], [3800, 690], [3640, 650]]) assert.equal(handPlanAt(x, y), BLUFFS, `${x}, ${y}`);
  for (const [x, y] of [[3620, 500], [3860, 690], [3700, 720]]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}: an edge street's`);
  assert.equal(handPlanAt(3600, 500), NORTHPOINT);
  const [x0, y0, x1, y1] = BLUFFS.rect, S = BLUFFS.streets();
  for (const s of S) for (const [x, y] of s.pts) assert.ok(x >= x0 && x <= x1 && y >= y0 && y <= y1, `${s.name}: ${x}, ${y} inside`);
  const edges = [[[x0, y0], [x0, y1]], [[x1, BY.chapel], [x1, y1]], [[x0 - 100, y1], [x1 + 100, y1]]];
  const segs = (P) => P.slice(1).map((q, k) => [P[k], q]);
  const near = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    const ex = a[0] + dx * t - p[0], ey = a[1] + dy * t - p[1];
    return ex * ex + ey * ey <= 1.5;
  };
  // (each street's west or north end on another street or an edge; the lanes' east ends stop at the Cliff Walk)
  for (const s of S) {
    const on = (p) => [...S.filter((o) => o !== s).map((o) => o.pts), ...edges].some((P) => segs(P).some(([a, b]) => near(p, a, b)));
    assert.ok(on(s.pts[0]) || on(s.pts[s.pts.length - 1]), `${s.name} meets another street`);
  }
  const ave = S.find((s) => s.name === 'Bluffs Avenue');
  assert.ok(ave && ave.kind === 'ave' && AVE_X.some((A) => A[0] === BX.ave) && ave.pts[ave.pts.length - 1][1] === BY.shore);
  assert.ok(BY.top < BY.seacliff && BY.seacliff < BY.cormorant && BY.cormorant < BY.windward && BY.windward < BY.club && BY.club < BY.headland && BY.headland < BY.chapel && BY.chapel < BY.shore);
});
