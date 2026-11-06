// A chunk baked from World v3's window (client/art2/game/statics.js): the window's lists keep the world's indexes, so
// the places outside it are holes. A bake that read one threw (statics' poisOf), fell back without the statics and
// was never kept - baked again each time it came into view. Baked from a map with holes in its places, no errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { bakeChunk, loadProviders, CHUNK } from '../client/art2/game/chunkbake.js';
import { TILE } from '../shared/constants.js';

test('a bake from a window (holes in its places) draws the statics without errors', async () => {
  await loadProviders();
  const M = makeWorld().map;
  const holes = M.pois.map((p, i) => (i % 3 === 0 ? undefined : p));
  const W = Object.assign(Object.create(Object.getPrototypeOf(M)), M, { pois: holes });
  const shops = M.pois.filter((p) => p && p.b !== undefined && M.buildings[p.b] && p.kind !== 'home').slice(0, 4);
  assert.ok(shops.length >= 2);
  for (const p of shops) {
    const b = M.buildings[p.b], cx = Math.floor((b.tx + b.tw / 2) * TILE / CHUNK), cy = Math.floor((b.ty + b.th) * TILE / CHUNK);
    const r = bakeChunk(W, cx, cy, { quality: 0, seed: 1337 });
    assert.equal(r.errors, null, `chunk ${cx},${cy}: ${JSON.stringify(r.errors)}`);
  }
});
