// The handcrafted streets' bends rounded (shared/world3-hand.js roundCorners, 2026-10-19: the owner - "some streets have a
// sharp angle to the turn instead of a smooth curve"): a corner becomes a curve, the ends stay where they were, a
// straight street or a gentle arc is left alone, and a street that ends on another's corner still meets it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundCorners, roundedStreets } from '../shared/world3-hand.js';

const turn = (P) => {   // the sharpest change of direction along a polyline (1 - cos)
  let worst = 0;
  for (let i = 1; i + 1 < P.length; i++) {
    const ux = P[i][0] - P[i - 1][0], uy = P[i][1] - P[i - 1][1], vx = P[i + 1][0] - P[i][0], vy = P[i + 1][1] - P[i][1];
    const lu = Math.sqrt(ux * ux + uy * uy), lv = Math.sqrt(vx * vx + vy * vy);
    if (lu < 1e-6 || lv < 1e-6) continue;
    worst = Math.max(worst, 1 - (ux * vx + uy * vy) / (lu * lv));
  }
  return worst;
};
const near = (p, P, d) => P.some((q, i) => {
  if (i + 1 >= P.length) return false;
  const [ax, ay] = q, [bx, by] = P[i + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L)) : 0;
  return Math.hypot(ax + dx * t - p[0], ay + dy * t - p[1]) <= d;
});

test('streets: their sharp bends rounded into curves, the ends kept, a street ending on a corner still meeting it', () => {
  // a right angle: a curve of short steps, none turning more than ~25 degrees; the ends where they were
  const L = roundCorners([[0, 0], [40, 0], [40, 40]], 'st');
  assert.deepEqual(L[0], [0, 0]); assert.deepEqual(L[L.length - 1], [40, 40]);
  assert.ok(L.length > 5 && turn(L) < 0.1, `a right angle rounded (${L.length} points, sharpest ${turn(L).toFixed(3)})`);
  assert.ok(!L.some(([x, y]) => x === 40 && y === 0), 'the corner itself gone');
  // straight, or bending gently: left alone; an alley stays as drawn
  assert.deepEqual(roundCorners([[0, 0], [50, 0], [100, 2]], 'st'), [[0, 0], [50, 0], [100, 2]]);
  assert.deepEqual(roundCorners([[0, 0], [10, 0], [10, 10]], 'alley'), [[0, 0], [10, 0], [10, 10]]);
  // (shorter pieces: the curve takes no more than 45% of either; a chamfer under 10 tiles keeps its corners)
  const S = roundCorners([[0, 0], [12, 0], [12, 40]], 'blvd');
  assert.ok(S.length > 3 && S.every(([x]) => x >= 0 && x <= 12) && S[1][0] >= 12 - 0.45 * 12 - 1e-9);
  assert.deepEqual(roundCorners([[0, 0], [30, 0], [36, 6], [36, 40]], 'st'), [[0, 0], [30, 0], [36, 6], [36, 40]]);
  // (a short jog - one way then back - becomes an S)
  const J = roundCorners([[0, 0], [30, 0], [36, 5], [70, 5]], 'st');
  assert.ok(J.length > 6 && turn(J) < 0.15, `a jog rounded (${turn(J).toFixed(3)})`);
  // every handcrafted street: no corner sharper than 45 degrees left (a chamfer's two half-turns; bar the ones drawn
  // sharp on purpose), the ends that met another street's corner moved onto its curve
  const all = roundedStreets();
  for (const { P, s, pts } of all) if (!s.sharp && s.kind !== 'alley') assert.ok(turn(pts) < 0.3, `${P.key} ${s.name}: sharpest bend ${turn(pts).toFixed(3)}`);
  for (const a of all) for (const e of [0, a.s.pts.length - 1]) {
    const p = a.s.pts[e];
    for (const b of all) if (b !== a && b.s.pts.some((v, i) => i > 0 && i < b.s.pts.length - 1 && Math.hypot(v[0] - p[0], v[1] - p[1]) <= 1.5)) {
      const q = a.pts[e === 0 ? 0 : a.pts.length - 1];
      assert.ok(near(q, b.pts, 0.05), `${a.s.name} meets ${b.s.name}'s curve`);
    }
  }
});
