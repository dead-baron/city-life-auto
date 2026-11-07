// No huge plain buildings (the owner, 2026-11-03: "Huge, plain buildings block the street from view and add nothing" -
// his screenshot: a blank block over half the screen). World v3's plain buildings - no sign, no place, no hand look -
// are capped (shared/map.js roofOne: a deep one is a column of lots with a paved passage between them, a wide one split
// into neighbours), and the big works and warehouses carry their firm's name (placePrefab). The measure is
// tools/plainmeasure.mjs; tools/plainblocks.mjs prints the survey. Builds World v3: run under the heavy lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { T } from '../shared/constants.js';
import { surveyBuildings, oversized, plainRuns, PLAIN_CAP } from '../tools/plainmeasure.mjs';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const S = surveyBuildings(M);

test('plain blocks: no plain building footprint over the cap', () => {
  const over = oversized(S);
  assert.equal(over.length, 0, `plain footprints over ${PLAIN_CAP} tiles: ${over.slice(0, 8).map((q) => `#${q.id} ${q.tw}x${q.th} at ${q.tx},${q.ty} (${q.src})`).join('; ')}`);
  // (and none deeper than a lot: the slivers built over were 50-109 tiles deep, one roof)
  const deep = S.list.filter((q) => q.plain && q.src.startsWith('roof') && q.th > 20);
  assert.equal(deep.length, 0, `plain roofs deeper than 20 tiles: ${deep.slice(0, 8).map((q) => `#${q.id} ${q.tw}x${q.th} at ${q.tx},${q.ty}`).join('; ')}`);
});

test('plain blocks: plain buildings never stack into one deep blank mass', () => {
  // (before: unbroken plain runs down a column of up to 146 tiles - five screens high; 678 columns over 50)
  const R = plainRuns(M, S, 20);
  assert.ok(R.longest <= 44, `the longest unbroken plain run north-south is ${R.longest} tiles`);
  assert.ok(R.runs.filter(([n]) => n > 30).length < 150, `${R.runs.filter(([n]) => n > 30).length} columns run plain over 30 tiles`);
});

test('plain blocks: a column of lots fronts onto its passages', () => {
  // each lot of a cut column but the southmost faces the passage south of it: open paving there, and drawn as a front
  let lots = 0, open = 0;
  for (const q of S.list) {
    if (!q.src.startsWith('roof') || q.back) continue;
    const b = M.buildings[q.id];
    const below = M.buildings[M.bld[M.idx(b.tx, b.ty + b.th + 3)]] || M.buildings[M.bld[M.idx(b.tx, b.ty + b.th + 4)]];
    if (!below || below.tx !== b.tx || below.tw !== b.tw || below.kind !== 'roof') continue;
    const gap = below.ty - (b.ty + b.th);
    if (gap < 3 || gap > 4) continue;
    lots++;
    let paved = 0;
    for (let x = b.tx; x < b.tx + b.tw; x++) for (let y = b.ty + b.th; y < below.ty; y++) if (M.tiles[M.idx(x, y)] === T.PLAZA) paved++;
    if (paved === b.tw * gap && q.front) open++;
  }
  assert.ok(lots > 200, `lots fronting a passage: ${lots}`);
  assert.ok(open >= lots * 0.95, `${open} of ${lots} passages paved through with the lot's front on them`);
});

test('plain blocks: the big works and warehouses carry their names', () => {
  for (const b of M.buildings) {
    if (!b || b.gone || b.prefab < 0 || b.hand || b.business || b.home !== undefined) continue;
    const key = M.prefabs[b.prefab].key;
    if ((key === 'warehouse' || key === 'industrial') && b.tw * b.th > PLAIN_CAP && M.prefabs[b.prefab].rot === 0) {
      assert.ok(b.signs.length && b.signs[0].text === b.name, `${key} #${b.id} (${b.tw}x${b.th}) has a sign with its name`);
      const p = M.pois.find((q) => q.b === b.id && q.kind === 'delivery');
      assert.ok(p && p.label === b.name, `its delivery stop is under its name (${b.name})`);
    }
  }
});

test('plain blocks: every place still stands in a building', () => {
  for (const p of M.pois) {
    if (p.b === undefined) continue;
    const b = M.buildings[p.b];
    assert.ok(b && !b.gone, `${p.kind} ${p.label}: its building #${p.b} stands`);
  }
});
