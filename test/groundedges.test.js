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

// Reeds keep to a running creek's banks (groundbake.js reedAt; the redwood overhaul, 11-24: a creek is shallow from
// side to side, and reed beds across it read as a marsh; its pools were full of them).
test('reeds: beds across still shallows, only the banks of running water, a creek\'s pool clear', () => {
  const { reedAt, WK } = EDGE_TEST;
  // a pond and the marsh, shallow, in a reed bed, mid-water: reeds
  assert.ok(reedAt(WK.POND, 0, 0, 0.2, 40, 0.7) > 0.3 && reedAt(WK.MARSH, 0, 0, 0.6, 60, 0.7) > 0.3 && reedAt(WK.LAKE, 0, 0, 0.3, 30, 0.7) > 0.3);
  assert.ok(reedAt(WK.POND, 0, 0, 0.2, 3, 0.2) > 0 && reedAt(WK.POND, 0, 0, 0.2, 40, 0.2) === 0, 'outside a bed: only at the edge');
  assert.equal(reedAt(WK.POND, 0, 0, 0.8, 40, 0.9), 0, 'none in deep water');
  // a running creek (not a pond, a lake or the marsh): the same bed stops a few px from the bank
  const run = WK.CREEK;
  assert.ok(reedAt(run, 0.5, 0, 0.2, 3, 0.7) > 0.3 && reedAt(run, 0.5, 0, 0.2, 8, 0.7) > 0, 'along its bank');
  assert.equal(reedAt(run, 0.5, 0, 0.2, 20, 0.7), 0, 'none out in the run');
  assert.ok(reedAt(run, 0.1, 0, 0.2, 20, 0.7) > 0.3, 'a backwater (hardly running) is still water');
  // its pool: clear but for the very edge
  assert.equal(reedAt(run, 0.5, 0.6, 0.2, 20, 0.9), 0);
  assert.equal(reedAt(run, 0.5, 0.6, 0.2, 8, 0.9), 0);
  assert.ok(reedAt(run, 0.5, 0.6, 0.2, 3, 0.9) > 0);
});

// A wild bank is not one brown line (groundbake.js bankKind; the owner, 11-24: "it can blend in with the water in some
// places, it can be a rocky/stone beach, it can be dirt and sand beach, it can just blend in with the vegetation").
test('wild banks: four kinds in a natural mix along the shore, in long stretches; designed ground keeps its lip', () => {
  const { bankKind, M_ } = EDGE_TEST, n = [0, 0, 0, 0];
  let runs = 0, last = -1;
  for (let y = 0; y < 6000; y += 7) for (let x = 0; x < 6000; x += 7) n[bankKind(M_.FOREST, 40000 + x, 40000 + y, 1337)]++;
  for (let x = 0; x < 60000; x += 2) { const k = bankKind(M_.MEADOW, 90000 + x, 51234, 1337); if (k !== last) { runs++; last = k; } }
  const t = n.reduce((a, b) => a + b, 0), sh = n.map((v) => v / t);
  console.log('wild banks: earth lip, grown over, shingle, dirt bar', sh.map((v) => (v * 100).toFixed(0) + '%').join(' '), '- a change of kind every', Math.round(60000 / runs), 'px along a shore');
  for (let k = 0; k < 4; k++) assert.ok(sh[k] >= 0.1 && sh[k] <= 0.5, `kind ${k}: ${(sh[k] * 100).toFixed(0)}% of the shore`);
  assert.ok(sh[1] >= sh[0], 'more shore grown over than bare earth');
  assert.ok(60000 / runs >= 60, `the kinds come in stretches (a change every ${Math.round(60000 / runs)} px)`);
  for (const m of [M_.LAWN, M_.PARK, M_.GOLF, M_.GREEN, M_.BEACH, M_.DESERT]) for (let x = 0; x < 4000; x += 37) assert.equal(bankKind(m, x, x * 3, 1337), 0);
});

// Land and water blended at a soft bank (the owner, 11-24 23:18: "blending the surface and underwater art between
// land and water, some more stones on land, some less stones in water, a few harder edges, some softer transition").
// The bake of a small pond in forest floor: along its shore some water pixels carry the land's colour (the bank going
// under), and the earth-lip stretches still have their line.
test('a soft bank goes under the water in tongues; fewer rocks stand in a creek than did', async () => {
  const W = await import('../client/art2/water.js');
  const src = (await import('node:fs')).readFileSync(new URL('../client/art2/game/groundbake.js', import.meta.url), 'utf8');
  assert.match(src, /const BANK_IN = (\d+)/); assert.ok(+src.match(/const BANK_IN = (\d+)/)[1] >= 8, 'the band of water a bank shows through');
  assert.match(src, /tongue\(X, Y, seed\) < [\d.]+ - dw \/ BANK_IN/, 'the water side thins out with distance');
  assert.match(src, /cover\(C, h0 > [\d.]+ \? 'rock' : 'pebble'/, 'stones stamped along a bank');
  const wsrc = (await import('node:fs')).readFileSync(new URL('../client/art2/water.js', import.meta.url), 'utf8'), B = wsrc.match(/BOULDER = \[([^\]]+)\]/)[1].split(',').map(Number);
  assert.ok(B[W.WK.CREEK] <= 0.1 && B[W.WK.RIVER] <= 0.05 && B[W.WK.CREEK] > 0.04, `rocks in running water (${B[W.WK.CREEK]}, ${B[W.WK.RIVER]}): fewer, not none`);
});
