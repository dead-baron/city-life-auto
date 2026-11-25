// The ground's hand-made edges (client/art2/game/groundbake.js; the art pass, 2026-11-24; the owner, 11-23: "the farm
// (the flower row, hand-crafted fields)", "the off-road trail (a blended start, a real trail)"):
//   - a field's edge: a crop ended on its tiles' edges, in ruled lines and square steps. Now a ragged grass verge, then
//     the headland of turned earth, then the crop (fieldEdge); the same field's stubble against its wheat is no edge;
//   - a country car park's gravel thins out into the ground beside it (lotEdge);
//   - an off-road ride (rutPx): it was one dark band, begun and ended in a round blot. Now two ruts, a crown between
//     them, worn shoulders - a single rut for a bike's single track - narrowing and thinning to nothing over its first
//     and last stretch, with no cap past either end.
// The functions themselves, on made-up tiles: no world build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_TEST, MATERIALS as M_, FIELD_EDGE, LOT_EDGE, TRACK_FADE } from '../client/art2/game/groundbake.js';

const { fieldEdge, lotEdge, rutPx, TN } = EDGE_TEST, TILE = 32, SEED = 1337;
// a window of tiles: `at(i, j)` gives each tile's material; the tile (i, j)'s index, and its pixels in world px (the
// window's corner at 0, 0)
const win = (at) => { const tm = new Int16Array(TN * TN), tw = new Uint8Array(TN * TN); for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) tm[j * TN + i] = at(i, j); return { tm, tw }; };

test('a field\'s edge: verge, headland, crop - ragged, and none inside the field or at its own stubble', () => {
  // wheat east of column 10, meadow west of it
  const b = win((i) => (i >= 10 ? M_.WHEAT : M_.MEADOW));
  const band = (d0, d1) => { const o = { grass: 0, earth: 0, crop: 0, n: 0 }; for (let y = 5 * TILE; y < 15 * TILE; y++) for (let d = d0; d < d1; d++) { const X = 10 * TILE + d, q = fieldEdge(b, Math.floor(y / TILE) * TN + Math.floor(X / TILE), X, y, M_.WHEAT, SEED); o.n++; if (q === M_.MEADOW) o.grass++; else if (q === M_.DIRT) o.earth++; else if (q === -1) o.crop++; else assert.fail(`an edge of ${q}`); } return o; };
  const near = band(0, 2), mid = band(8, 14), deep = band(26, 32);
  assert.ok(near.grass > near.n * 0.7, `the verge by the edge is grass (${JSON.stringify(near)})`);
  assert.ok(mid.earth > mid.n * 0.6, `then the headland's earth (${JSON.stringify(mid)})`);
  assert.equal(deep.crop, deep.n, 'the crop itself from a tile in');
  // ragged: where the verge ends differs along the edge
  const ends = new Set(); for (let y = 5 * TILE; y < 15 * TILE; y += 3) { let d = 0; while (d < 32 && fieldEdge(b, Math.floor(y / TILE) * TN + 10, 10 * TILE + d, y, M_.WHEAT, SEED) === M_.MEADOW) d++; ends.add(d); }
  assert.ok(ends.size >= 4, `no ruled line (${[...ends].sort((p, q) => p - q)})`);
  assert.ok(FIELD_EDGE.verge < FIELD_EDGE.head && FIELD_EDGE.head < TILE, 'within a tile');
  // a tile with its own crop all round: untouched; its own stubble beside it: no edge
  const in1 = win(() => M_.WHEAT), st = win((i) => (i >= 10 ? M_.WHEAT : M_.STUB));
  for (let d = 0; d < 32; d += 3) { assert.equal(fieldEdge(in1, 8 * TN + 10, 10 * TILE + d, 8 * TILE + 7, M_.WHEAT, SEED), -1); assert.equal(fieldEdge(st, 8 * TN + 10, 10 * TILE + d, 8 * TILE + 7, M_.WHEAT, SEED), -1, 'wheat against its stubble'); }
  // two crops side by side: a baulk between them, never the other crop
  const two = win((i) => (i >= 10 ? M_.WHEAT : M_.PLOW));
  assert.equal(fieldEdge(two, 8 * TN + 10, 10 * TILE + 0.5, 8 * TILE + 7, M_.WHEAT, SEED) === M_.PLOW, false, 'not the next field\'s crop');
});

test('a country car park\'s gravel gives way to the ground beside it, raggedly; not to paving', () => {
  const b = win((i) => (i >= 10 ? M_.GRAVLOT : M_.FOREST));
  let near = 0, n = 0, deep = 0; const ends = new Set();
  for (let y = 5 * TILE; y < 15 * TILE; y += 2) { let d = 0; while (d < 32 && lotEdge(b, Math.floor(y / TILE) * TN + 10, 10 * TILE + d, y, SEED) === M_.FOREST) d++; ends.add(d); n++; if (d > 0) near++; if (lotEdge(b, Math.floor(y / TILE) * TN + 10, 10 * TILE + 28, y, SEED) !== -1) deep++; }
  assert.ok(near > n * 0.6 && ends.size >= 4 && Math.max(...ends) <= LOT_EDGE + 12, `a ragged edge (${[...ends].sort((p, q) => p - q)})`);
  assert.equal(deep, 0, 'gravel a tile in');
  const paved = win((i) => (i >= 10 ? M_.GRAVLOT : M_.ROAD));
  for (let d = 0; d < 32; d += 2) assert.equal(lotEdge(paved, 8 * TN + 10, 10 * TILE + d, 8 * TILE + 5, SEED), -1, 'a road beside it: its edge kept');
});

test('an off-road ride: ruts, a crown, worn shoulders; it fades in at its ends, with no cap', () => {
  const ride = (hw) => [{ pts: [[200, 400], [900, 400], [1500, 400]], hw, bb: [100, 300, 1600, 500], ride: 'a ride' }];
  const cut = (list, X) => { const o = []; for (let y = 400 - 60; y <= 400 + 60; y++) o.push(rutPx(list, X, y, SEED, false)); return o; };   // (across it at X: 0 the ground, 1 worn, 2 a rut)
  const two = ride(40);
  let ruts = 0, crownBare = 0, worn = 0, n = 0;
  for (let X = 500; X < 1200; X += 7) {
    const c = cut(two, X); n++;
    const up = c.slice(60 - 22, 60 - 10).includes(2), down = c.slice(60 + 10, 60 + 22).includes(2);
    if (up && down) ruts++;
    if (c[60] === 0 || c[61] === 0 || c[59] === 0) crownBare++;
    if (c.includes(1)) worn++;
    assert.ok(c[0] === 0 && c[120] === 0, 'the ground itself 60 px off its middle');
  }
  assert.ok(ruts > n * 0.9, `two ruts along it (${ruts} of ${n} cuts)`);
  assert.ok(crownBare > n * 0.5, `the crown between them mostly the ground's own (${crownBare} of ${n})`);
  assert.ok(worn > n * 0.8, 'worn shoulders');
  // the ends: nothing past them; less of it near them than in its middle
  const area = (X0, X1) => { let a = 0; for (let X = X0; X < X1; X += 2) a += cut(two, X).filter((q) => q > 0).length; return a; };
  assert.equal(area(100, 200), 0, 'no cap before its start'); assert.equal(area(1501, 1600), 0, 'none past its end');
  const first = area(200, 200 + TRACK_FADE / 2), mid = area(700, 700 + TRACK_FADE / 2);
  assert.ok(first > 0 && first < mid * 0.6, `it thins in at its start (${first} against ${mid} in its middle)`);
  // a bike's single track: one rut down its middle
  const one = ride(24);
  let centre = 0, m2 = 0;
  for (let X = 500; X < 1200; X += 7) { const c = cut(one, X); m2++; if (c.slice(60 - 4, 60 + 5).includes(2)) centre++; }
  assert.ok(centre > m2 * 0.9, `a single rut (${centre} of ${m2})`);
  // a track that only marks ruts on its own dirt tiles (no px, no ride) is as it was: nothing off its dirt
  assert.equal(rutPx([{ pts: [[200, 400], [900, 400]], hw: 26, bb: [100, 300, 1000, 500], ruts: 1 }], 500, 400 + 10, SEED, false), 0);
});
