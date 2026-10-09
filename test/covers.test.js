// Manhole covers (client/render/covers.js): only on the town's streets, and the steam comes up out of the very
// covers the ground bake draws (groundbake.js covers, render/weather.js steam).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bakeChunk, loadProviders, CHUNK } from '../client/art2/game/chunkbake.js';
import { generateCity, cityData, cityFromData } from '../shared/map.js';
import { coversIn, edgeCovers, urbanAt, coverSeed } from '../shared/covers.js';

test('covers only in town, on its streets - none on highways, country roads or tracks', () => {
  const M = generateCity(1337);
  const all = coversIn(M, 0, 0, 1e9, 1e9, coverSeed(M));
  assert.ok(all.length > 300, `plenty in town (${all.length})`);
  for (const c of all) assert.ok(urbanAt(M, c.x, c.y), 'in town');
  for (const e of M.edges) if (['hwy', 'rural', 'dirt'].includes(e.kind)) assert.equal(edgeCovers(M, e, coverSeed(M)).length, 0, e.kind);
});

test('the ground draws a cover at each spot on the list (where the steam comes from), and nowhere else', async () => {
  await loadProviders();
  const map = generateCity(1337);
  const M = structuredClone(cityData(map)); cityFromData(M);
  const seed = coverSeed(M);
  // a chunk with a few covers well inside it
  let pick = null;
  for (let cy = 0; cy < 60 && !pick; cy++) for (let cx = 0; cx < 60 && !pick; cx++) {
    const cs = coversIn(M, cx * CHUNK + 16, cy * CHUNK + 16, (cx + 1) * CHUNK - 16, (cy + 1) * CHUNK - 16, seed);
    if (cs.length >= 3) pick = { cx, cy, cs };
  }
  assert.ok(pick, 'a chunk in town with covers');
  const opt = { quality: 1, seed: M.seed };
  const a = bakeChunk(M, pick.cx, pick.cy, opt);
  for (const e of M.edges) Object.defineProperty(e, '_covers', { value: { key: 'c' + seed, list: [] }, enumerable: false, writable: true, configurable: true });
  const b = bakeChunk(M, pick.cx, pick.cy, opt);
  assert.ok(!a.errors && !b.errors, 'baked');
  const X0 = pick.cx * CHUNK, Y0 = pick.cy * CHUNK, W = a.g.w;
  let near = 0, far = 0;
  const hit = new Set();
  for (let y = 0; y < a.g.h; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (a.g.col[i] === b.g.col[i] && a.g.col[i + 1] === b.g.col[i + 1] && a.g.col[i + 2] === b.g.col[i + 2]) continue;
    const wx = X0 + x - (a.g.ax || 0), wy = Y0 + y - (a.g.ay || 0);
    const k = pick.cs.findIndex((c) => Math.hypot(c.x - wx, c.y - wy) < 9);
    if (k >= 0) { near++; hit.add(k); } else far++;
  }
  assert.equal(hit.size, pick.cs.length, `a cover drawn at every spot (${hit.size} of ${pick.cs.length})`);
  assert.equal(far, 0, 'and nowhere else');
  assert.ok(near > pick.cs.length * 40, 'whole covers');
});
