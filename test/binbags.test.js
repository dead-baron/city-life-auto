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

// (11-23, the owner: "a few bags but not too many, just some bins have some bags piled next to it in rough neighborhoods")
test('a few bags beside some bins in a rough district - not in the road, not elsewhere', async () => {
  const { binBags3, BIN_BAGS } = await import('../shared/world3-tidy.js');
  const { T, TILE } = await import('../shared/constants.js');
  const { DISTRICTS } = await import('../shared/mapcore.js');
  const rough = DISTRICTS.find((d) => d.tier === 'rough'), calm = DISTRICTS.find((d) => d.tier === 'mid');
  const make = (D) => {
    const w = 120, h = 8, tiles = new Uint8Array(w * h).fill(T.SIDEWALK);
    for (let x = 0; x < w; x++) tiles[7 * w + x] = T.ROAD;
    const m = { w, h, x0: 0, y0: 0, tiles, props: [], buildings: [], inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h, idx: (x, y) => y * w + x, districtAt: () => D };
    for (let k = 0; k < 40; k++) m.props.push({ t: 'trashcan', x: (3 * k + 1.5) * TILE, y: 3.5 * TILE });
    return m;
  };
  const H3 = { addProp: (mm, t, x, y) => mm.props.push({ t, x, y }) };
  const m = make(rough), n = binBags3(m, H3);
  const bags = m.props.filter((p) => p.t === 'bags');
  assert.ok(n > 0 && n === bags.length);
  const withBags = m.props.filter((b) => b.t === 'trashcan' && bags.some((q) => Math.hypot(q.x - b.x, q.y - b.y) < BIN_BAGS.near)).length;
  assert.ok(withBags >= 4 && withBags <= 20, `some bins, not too many: ${withBags} of 40`);
  for (const q of bags) assert.equal(m.tiles[m.idx(Math.floor(q.x / TILE), Math.floor(q.y / TILE))], T.SIDEWALK, 'on the pavement');
  const c = make(calm);
  assert.equal(binBags3(c, H3), 0, 'a calm district keeps its bins tidy');
});
