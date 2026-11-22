// Black bin bags only by a bin or in the rough districts (DECISIONS, World 10-10: "only a few, near cans or in rough
// alleys"; the audit's binBags, 44 on 11-19): shared/world3-tidy.js strayBags3 takes up the others as the city is built,
// with the same rule the lint counts by. The whole world's count is test/placementlint.test.js (binBags at 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE } from '../shared/constants.js';
import { strayBags, strayBags3 } from '../shared/world3-tidy.js';

function map(tier) {
  return { props: [], districtAt: () => ({ tier }) };
}

test('bags by a bin stay; bags on their own go; in a rough district they all stay', () => {
  const m = map('mid');
  const can = { t: 'trashcan', x: 1000, y: 1000 }, near = { t: 'bags', x: 1000 + 2 * TILE, y: 1000 }, far = { t: 'bags', x: 1000 + 6 * TILE, y: 1000 };
  const lamp = { t: 'lamp', x: 0, y: 0 };
  m.props.push(lamp, can, near, far);
  m.lamps = [lamp];
  assert.deepEqual(strayBags(m), [far]);
  assert.equal(strayBags3(m), 1);
  assert.deepEqual(m.props, [lamp, can, near], 'only the lone bags taken up, the rest kept in order');
  assert.deepEqual(m.lamps, [lamp]);
  assert.equal(strayBags3(m), 0, 'nothing left to take');

  const r = map('rough');
  r.props.push({ t: 'bags', x: 0, y: 0 }, { t: 'bags', x: 50 * TILE, y: 0 });
  assert.equal(strayBags3(r), 0, 'rough alleys keep their bags');
});

test('every kind of bin counts, across a grid cell edge', () => {
  for (const t of ['trashcan', 'dump_g', 'dump_b', 'dump_o', 'trashpile', 'burnbarrel']) {
    const m = map('rich');
    m.props.push({ t, x: 255, y: 255 }, { t: 'bags', x: 257 + TILE, y: 257 });
    assert.equal(strayBags(m).length, 0, t);
  }
});
