// A path to every door (shared/world3-doorpaths.js): straight out where it can, else round over open ground (11-22, the
// audit's doorOnGrass 372 -> 89), and a plaza out on a lawn joined to the street. The whole world's count is
// test/placementlint.test.js (doorOnGrass).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T } from '../shared/constants.js';
import { doorPaths3 } from '../shared/world3-doorpaths.js';

// 20 x 12 of lawn; a sidewalk down column 14 and a road beside it (15-16); a house at 4..9 x 2..5
function yard() {
  const w = 20, h = 12, tiles = new Uint8Array(w * h).fill(T.GRASS), bld = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) { tiles[y * w + 14] = T.SIDEWALK; tiles[y * w + 15] = T.ROAD; tiles[y * w + 16] = T.ROAD; }
  for (let y = 2; y < 6; y++) for (let x = 4; x < 10; x++) { tiles[y * w + x] = T.BUILDING; bld[y * w + x] = 0; }
  const b = { id: 0, tx: 4, ty: 2, tw: 6, th: 4, home: 1, door: { tx: 6, ty: 1 } };
  return { w, h, x0: 0, y0: 0, tiles, bld, inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h, idx: (x, y) => y * w + x,
    solidProps: new Map(), props: [], buildings: [b], walkIns: [], pois: [{ id: 0, b: 0, kind: 'home', home: 1, x: 6 * 32 + 16, y: 1 * 32 + 16 }] };
}
const at = (m, x, y) => m.tiles[m.idx(x, y)];

test('a door facing the back lawn: the path goes round to the pavement', () => {
  const m = yard();
  const out = doorPaths3(m);
  assert.equal(out.round, 1, JSON.stringify(out));
  assert.equal(at(m, 6, 1), T.PLAZA, 'its step paved');
  // a run of paving from the step to the sidewalk, every tile of it open ground before
  let x = 6, y = 1, n = 0;
  const seen = new Set();
  while (at(m, x, y) !== T.SIDEWALK && n++ < 40) {
    seen.add(x + ',' + y);
    const next = [[x + 1, y], [x, y - 1], [x, y + 1], [x - 1, y]].find(([a, c]) => m.inside(a, c) && !seen.has(a + ',' + c) && (at(m, a, c) === T.PLAZA || at(m, a, c) === T.SIDEWALK));
    assert.ok(next, `the path runs on from ${x},${y}`);
    [x, y] = next;
  }
  assert.equal(at(m, x, y), T.SIDEWALK);
  assert.ok(out.tiles <= 9, `no more paving than it needs (${out.tiles})`);
});

test('a plaza out on a lawn, reaching no road: joined to the street', () => {
  const m = yard();
  m.buildings[0].door = { tx: 6, ty: 6 };   // (the door south now, onto a little plaza)
  m.pois[0].y = 6 * 32 + 16;
  for (const [x, y] of [[5, 6], [6, 6], [7, 6], [5, 7], [6, 7], [7, 7]]) m.tiles[m.idx(x, y)] = T.PLAZA;
  const out = doorPaths3(m);
  assert.equal(out.joined, 1, JSON.stringify(out));
  for (let x = 8; x < 14; x++) assert.ok([T.PLAZA, T.SIDEWALK].includes(at(m, x, 6)) || [T.PLAZA].includes(at(m, x, 7)), `paved toward the street at ${x}`);
});

test('nothing laid through a building, over water or through something solid: left for the lint', () => {
  const m = yard();
  for (let y = 0; y < 2; y++) for (let x = 0; x < 14; x++) if (!(x === 6 && y === 1)) m.tiles[m.idx(x, y)] = T.WATER;
  const before = m.tiles.slice();
  const out = doorPaths3(m);
  assert.equal(out.round, 0); assert.equal(out.far + out.blocked, 1, JSON.stringify(out));
  assert.deepEqual(m.tiles, before, 'no tile changed');
});
