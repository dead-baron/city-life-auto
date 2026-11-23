// A pier's or a boardwalk's root on dry land (shared/world3-deckroots.js; the audit's beachWater): a one-tile neck of
// planks along the shore - water one side, grass the other - is taken by the art for water and blurs a sliver of sea onto
// the grass; the build planks over the grass beside it, so the root stands on land, a boardwalk's leg's neighbour joins
// its legs and the plants on it go. The whole world's count: test/placementlint.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TILE } from '../shared/constants.js';
import { deckOnDry } from '../shared/mapcore.js';
import { deckRoots3, sliverAt } from '../shared/world3-deckroots.js';

// 16 x 12: water left of column 6, grass from there; a neck of planks down column 6, rows 2..9
function shore() {
  const w = 16, h = 12, tiles = new Uint8Array(w * h), reserve = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = x < 6 ? T.WATER : T.GRASS;
  for (let y = 2; y <= 9; y++) tiles[y * w + 6] = T.DOCK;
  return { w, h, x0: 0, y0: 0, tiles, reserve, props: [], inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h, idx: (x, y) => y * w + x };
}

test('a neck of planks along the shore: the grass beside it planked, the sliver gone', () => {
  const m = shore();
  assert.deepEqual(sliverAt(m, 6, 5), [7, 5], 'the lint: the grass beside the neck takes the sea');
  assert.equal(sliverAt(m, 6, 5, true) !== null, true);
  const shrub = { t: 'shrub_a', x: 7 * TILE + 10, y: 5 * TILE + 12 }, bench = { t: 'bench_m', x: 9 * TILE, y: 5 * TILE };
  m.props.push(shrub, bench);
  const out = deckRoots3(m);
  assert.ok(out.planked >= 6, JSON.stringify(out));
  for (let y = 3; y <= 8; y++) { assert.equal(m.tiles[m.idx(7, y)], T.DOCK, `row ${y}`); assert.ok(deckOnDry(m, 7, y), `row ${y} on dry land`); }
  for (let y = 2; y <= 9; y++) assert.equal(sliverAt(m, 6, y), null, `row ${y}: no sliver left`);
  assert.deepEqual(m.props, [bench], 'the shrub on the planks gone, the bench kept');
});

test('a boardwalk leg: its neighbour joins the legs (the bake draws the marsh under it)', () => {
  const m = shore();
  m.walkways = [];
  for (let y = 2; y <= 9; y++) m.walkways.push(m.idx(6, y));
  deckRoots3(m);
  assert.ok(m.walkways.includes(m.idx(7, 5)));
});

test('a pier out over the water, its root on the beach with water by it: left alone', () => {
  const m = shore();
  for (let y = 0; y < m.h; y++) for (let x = 6; x < 9; x++) if (m.tiles[m.idx(x, y)] === T.GRASS) m.tiles[m.idx(x, y)] = T.SAND;
  for (let y = 2; y <= 9; y++) m.tiles[m.idx(6, y)] = T.SAND;
  for (let x = 1; x <= 6; x++) m.tiles[m.idx(x, 5)] = T.DOCK;   // (a pier from the sand out west)
  const before = Uint8Array.from(m.tiles);
  assert.equal(deckRoots3(m).planked, 0);
  assert.deepEqual(m.tiles, before);
});
