// Walkways clear of plants (shared/world3-walks.js; the owner, 11-17 "still spawning over sidewalks", the audit's
// plantOnWalk / planterOnWalk): on a small made-up street - a road, a sidewalk, a lawn, a shop's wall - each kind of
// plant on the walkway is kept as decided, moved onto ground, or taken up. The whole world's count is
// test/placementlint.test.js (plantOnWalk, planterOnWalk, plantOnPath at 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TILE } from '../shared/constants.js';
import { clearWalks3, plantWalkHit } from '../shared/world3-walks.js';

// rows (y): 0-1 a building, 2-3 sidewalk, 4-5 road, 6-7 sidewalk, 8-9 lawn; 30 tiles wide
function street() {
  const w = 30, h = 10, tiles = new Uint8Array(w * h);
  const row = (y) => (y <= 1 ? T.BUILDING : y <= 3 ? T.SIDEWALK : y <= 5 ? T.ROAD : y <= 7 ? T.SIDEWALK : T.GRASS);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = row(y);
  return { w, h, x0: 0, y0: 0, tiles, inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h, idx: (x, y) => y * w + x, districtAt: () => null, tileAtPx: (x, y) => tiles[Math.floor(y / TILE) * w + Math.floor(x / TILE)], props: [], net: { edges: [] }, homes: [], parking: [], buildings: [], pois: [], rails: [], dist: new Uint8Array(w * h) };
}
const at = (tx, ty) => [tx * TILE + TILE / 2, ty * TILE + TILE / 2];

test('kept as decided: a street tree by the kerb in its grate, a pot against a shop wall', () => {
  const m = street();
  const tree = { t: 'tree_a', sp: 'oak', x: at(5, 3)[0], y: at(5, 3)[1] + 12 }, pot = { t: 'planter_sq', x: at(8, 2)[0], y: 2 * TILE + 6 };
  m.props.push(tree, pot);
  const out = clearWalks3(m);
  assert.equal(out.grate, 1); assert.ok(tree.grate && tree.sp === 'street', 'an oak by the kerb is the street\'s tree now, in its grate');
  assert.equal(out.wall, 1); assert.ok(pot.wall);
  for (const p of m.props) assert.equal(plantWalkHit(m, p), -1);
});

test('moved onto ground, or taken up: a shrub by the lawn steps onto it; a hedge on the pavement goes', () => {
  const m = street();
  const shrub = { t: 'shrub_a', x: at(12, 7)[0], y: at(12, 7)[1] + 8 }, hedge = { t: 'hedgebox', x: 15 * TILE, y: 6 * TILE + 4, w: 40, d: 20 };
  m.props.push(shrub, hedge);
  const out = clearWalks3(m);
  assert.equal(out.moved, 1, 'the shrub moved');
  assert.ok(m.props.includes(shrub) && Math.floor(shrub.y / TILE) >= 8, `onto the lawn (${shrub.x}, ${shrub.y})`);
  assert.equal(out.dropped, 1); assert.ok(!m.props.includes(hedge), 'the hedge box taken up');
  for (const p of m.props) assert.equal(plantWalkHit(m, p), -1);
});

test('a planter out in the middle of a wide pavement with no wall near is taken up', () => {
  const m = street();
  for (let i = 0; i < m.w; i++) { m.tiles[m.idx(i, 0)] = T.SIDEWALK; m.tiles[m.idx(i, 1)] = T.SIDEWALK; }
  const pot = { t: 'potted', x: at(20, 1)[0], y: at(20, 1)[1] };
  m.props.push(pot);
  clearWalks3(m);
  assert.ok(!m.props.includes(pot));
});
