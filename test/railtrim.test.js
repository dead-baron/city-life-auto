// Railings on the land, not out over the water (shared/world3-railtrim.js; the audit's railOverWater): a run a tile out
// at sea comes back to the shore's edge; one that leaves the land part way is cut back to its dry stretch; a railing along
// a seawall, a few px into the water tile, is on the shore and stays. The whole world's count: test/placementlint.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TILE } from '../shared/constants.js';
import { railTrim3, railWetRun } from '../shared/world3-railtrim.js';

// 30 x 12: water above row 6, a plaza from row 6 down; a building at 0..4 x 8..11
function front() {
  const w = 30, h = 12, tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = y < 6 ? T.WATER : T.PLAZA;
  const m = { w, h, x0: 0, y0: 0, tiles, props: [], inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h, idx: (x, y) => y * w + x };
  m.tileAtPx = (px, py) => { const x = Math.floor(px / TILE), y = Math.floor(py / TILE); return m.inside(x, y) ? tiles[m.idx(x, y)] : -1; };
  return m;
}

test('a railing a tile out at sea comes back to the edge; one along the seawall stays where it is', () => {
  const m = front();
  const far = { t: 'rail', x: 4 * TILE, y: 5 * TILE - 2, tx: 6 * TILE, ty: 0 }, edge = { t: 'rail', x: 14 * TILE, y: 6 * TILE - 6, tx: 6 * TILE, ty: 0 };
  m.props.push(far, edge);
  assert.ok(railWetRun(m, far) >= 2 && railWetRun(m, edge) < 2, 'the lint: the far one is out over the water, the seawall one isn\'t');
  const out = railTrim3(m);
  assert.equal(out.moved, 1);
  const moved = m.props[0];
  assert.ok(moved.y > far.y && moved.y <= 6 * TILE + 16, `back to the shore (${moved.y})`);
  assert.equal(railWetRun(m, moved), 0);
  assert.equal(m.props[1], edge, 'the seawall railing untouched');
});

test('a run that leaves the land part way, with nowhere to move: cut back to its dry stretch', () => {
  const m = front();
  // a railing running north from the plaza out to sea, along a row of buildings (so it can't move sideways)
  for (let y = 6; y < 12; y++) for (const x of [7, 8, 12, 13]) { m.tiles[m.idx(x, y)] = T.BUILDING; }
  for (let y = 0; y < 6; y++) for (const x of [7, 8, 12, 13]) { m.tiles[m.idx(x, y)] = T.BUILDING; }
  const p = { t: 'rail', x: 10 * TILE + 16, y: 11 * TILE, tx: 0, ty: -9 * TILE };
  m.props.push(p);
  const out = railTrim3(m);
  assert.equal(out.cut, 1, JSON.stringify(out));
  const q = m.props[0];
  assert.equal(railWetRun(m, q), 0);
  assert.ok(Math.abs(q.ty) < 9 * TILE && Math.abs(q.ty) >= 4 * TILE, `its dry stretch kept (${q.ty})`);
});
