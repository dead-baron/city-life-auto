// Hanging lights not crowded into a curtain (shared/world3-festoons.js festoonThin3; the audit's festoonDensity): twelve
// runs strung side by side in one alley come down to the cap; runs spread out along a street all stay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE } from '../shared/constants.js';
import { festoonThin3, FESTOON_R, FESTOON_CAP } from '../shared/world3-festoons.js';

test('a curtain of runs thinned to the cap; a street\'s spread-out runs kept', () => {
  const m = { props: [] };
  for (let k = 0; k < 12; k++) m.props.push({ t: 'festoon', x: 100, y: 100 + k * 20, tx: 96, ty: 0 });
  for (let k = 0; k < 6; k++) m.props.push({ t: 'festoon', x: 5000 + k * 12 * TILE, y: 3000, tx: 96, ty: 0 });
  const n = festoonThin3(m);
  const left = m.props.filter((p) => p.t === 'festoon');
  assert.equal(n, 12 - FESTOON_CAP);
  for (const f of left) {
    const fx = f.x + f.tx / 2, fy = f.y + f.ty / 2;
    const near = left.filter((g) => Math.hypot(g.x + g.tx / 2 - fx, g.y + g.ty / 2 - fy) < FESTOON_R);
    assert.ok(near.length <= FESTOON_CAP);
  }
  assert.equal(left.filter((p) => p.x >= 5000).length, 6, 'the street\'s runs all kept');
});
