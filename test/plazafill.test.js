// No oversized empty plazas (shared/world3-plazafill.js; the audit's bigEmptyPlaza): an empty square gets islands - a
// fountain or a grove of trees in planters - until no paving is EMPTY_R tiles from anything; a court painted on the
// paving counts as something there; a map point keeps its ground clear. The whole world's count: test/placementlint.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TILE } from '../shared/constants.js';
import { plazaFill3, emptySpots, EMPTY_R } from '../shared/world3-plazafill.js';
import { DISTRICTS } from '../shared/mapcore.js';

const TOWERS = DISTRICTS.findIndex((d) => d.style === 'towers');

// a w x h square of paving, a row of buildings round it
function square(w = 60, h = 44) {
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = x < 2 || y < 2 || x >= w - 2 || y >= h - 2 ? T.BUILDING : T.PLAZA;
  const m = { w, h, x0: 0, y0: 0, tiles, dist: new Uint8Array(w * h).fill(TOWERS), props: [], inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h, idx: (x, y) => y * w + x };
  const H3 = { addProp: (mm, t, x, y, r, ex) => mm.props.push({ t, x, y, ...(ex || {}) }) };
  return { m, H3 };
}

test('an empty square: islands until nothing is empty, a fountain among them', () => {
  const { m, H3 } = square();
  assert.ok(emptySpots(m).length >= 1, 'the lint sees it');
  const out = plazaFill3(m, H3);
  assert.ok(out.islands >= 2 && out.fountains >= 1, JSON.stringify(out));
  assert.deepEqual(emptySpots(m), [], 'nothing left empty');
  for (const p of m.props) assert.equal(m.tiles[m.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))], T.PLAZA, `${p.t} on the paving`);
});

test('a court painted on the paving counts: a square that is mostly court is left alone', () => {
  const { m, H3 } = square(30, 30);
  m.props.push({ t: 'court', x: 15 * TILE, y: 6 * TILE, w: 20 * TILE, d: 18 * TILE });
  assert.deepEqual(emptySpots(m), []);
  assert.equal(plazaFill3(m, H3).islands, 0);
});

test('a map point keeps its ground clear', () => {
  const { m, H3 } = square(26, 26);
  m.pois = [{ x: 13 * TILE, y: 13 * TILE }];
  const out = plazaFill3(m, H3);
  assert.equal(out.islands, 0);
  assert.ok(out.kept > 0);
  assert.ok(EMPTY_R >= 8);
});
