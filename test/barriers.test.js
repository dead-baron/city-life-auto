// Highway barriers smashed through (shared/levels.js, server barriers.js): the stretch opens up in the art (the deck
// rebaked without it: client/art2/game/statics.js makeDeck), and the street below gets its phones out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bakeChunk, loadProviders, CHUNK } from '../client/art2/game/chunkbake.js';
import { generateCity, cityData, cityFromData } from '../shared/map.js';
import { pointAt } from '../shared/geom.js';
import { BARRIER_PIECE } from '../shared/levels.js';

test('a smashed barrier piece is drawn open: the parapet gone from the deck there, and only there', async () => {
  await loadProviders();
  const map = generateCity(1337);
  const M = structuredClone(cityData(map)); cityFromData(M);
  // a long straight-ish stretch of the elevated ring, a piece in its middle
  const e = M.edges.find((q) => q.lvl === 1 && q.len > 2000);
  assert.ok(e, 'the elevated highway');
  const k = Math.floor(e.len / 2 / BARRIER_PIECE), q = pointAt(e.pts, (k + 0.5) * BARRIER_PIECE);
  const cx = Math.floor(q.x / CHUNK), cy = Math.floor((q.y - 60) / CHUNK);
  const opt = { quality: 0, seed: 1337 };
  const a = bakeChunk(M, cx, cy, opt);
  M.levels.broken.set(`${e.id}:1:${k}`, true); M.levels.broken.set(`${e.id}:-1:${k}`, true);
  const b = bakeChunk(M, cx, cy, opt);
  assert.ok(!a.errors && !b.errors, 'baked');
  // the heights differ round the piece (the parapet's 8 px gone) and nowhere far from it
  let near = 0, far = 0;
  const X0 = cx * CHUNK, Y0 = cy * CHUNK;
  for (let y = 0; y < a.g.h; y++) for (let x = 0; x < a.g.w; x++) {
    const i = y * a.g.w + x;
    if (a.g.z[i] === b.g.z[i]) continue;
    const wx = X0 + x - (a.g.ax || 0), wy = Y0 + y - (a.g.ay || 0) + 88;   // (the deck is drawn 88 px up)
    if (Math.hypot(wx - q.x, wy - q.y) < BARRIER_PIECE * 2.5) near++; else far++;
  }
  assert.ok(near > 40, `the parapet opened up (${near} px)`);
  assert.ok(far < near * 0.25, `only there (${far} px elsewhere)`);
});
