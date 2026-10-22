// A pool's water is still (the owner, 10-16: "Mansion pool shimmers in rapid Z shapes"): the pool sprite's water was
// flagged as plain open water and baked with the open sea's word (255) in the albedo's alpha, so the light pass
// (client/art2/game/lightgame.js waterSurf) ran the sea's waves and glints along the wind over a pool a few tiles long.
// Now its water is still inland water (F_NOCAST) and the chunk bake gives it a clear pond's word (POOL_WORD): calm, the
// sun's caustics on its floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStatic } from '../client/art2/game/statics.js';
import { compositeDepth, POOL_WORD } from '../client/art2/game/chunkbake.js';
import { GBuf, F_GROUND, F_WATER, F_NOCAST, F_WET } from '../client/art2/gbuf.js';

test('a pool: still inland water, baked with a pond\'s word - not the open sea\'s', () => {
  const S = makeStatic({ t: 'flat', k: 'pool', w: 96, h: 160, s: 1 });
  let water = 0, other = 0;
  for (let i = 0; i < S.w * S.h; i++) {
    if (!S.col[i * 4 + 3]) continue;
    if (S.flag[i] & F_WATER) { water++; assert.equal(S.flag[i] & (F_GROUND | F_NOCAST | F_WET), F_GROUND | F_NOCAST, 'still inland water'); } else other++;
  }
  assert.ok(water > 96 * 160 * 0.6 && other > 0, `the water (${water} px) in its stone rim`);
  assert.ok(POOL_WORD >= 224 && POOL_WORD < 232, 'a pond\'s word (224 + clear): calm, the floor seen');
  const G = new GBuf(256, 256);
  for (let i = 0; i < 256 * 256; i++) { G.flag[i] = F_GROUND | F_WET; G.col[i * 4 + 3] = 255; }
  compositeDepth(G, S, 40, 40);
  let pw = 0, rim = 0;
  for (let i = 0; i < 256 * 256; i++) {
    if (G.flag[i] & F_WATER) { pw++; assert.equal(G.col[i * 4 + 3], POOL_WORD); } else if (G.col[i * 4 + 3] !== 255) assert.fail('the ground and the rim keep a full alpha');
    else rim++;
  }
  assert.equal(pw, water, 'every water pixel baked with it');
  assert.ok(rim > 0);
});
