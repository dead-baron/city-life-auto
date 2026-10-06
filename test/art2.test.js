// The new renderer's chunk scheduling (client/art2/game/host.js planBake) and the stepped bake the workers run
// (chunkbake.bakeSteps): pure code, no browser needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planBake } from '../client/art2/game/host.js';
import { bakeChunk, bakeSteps, loadProviders, CHUNK } from '../client/art2/game/chunkbake.js';
import { generateCity } from '../shared/map.js';

const view = (cx, cy, w = 1760, h = 990) => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, cx, cy, gx: 0, gy: 0 });
const key = (cx, cy) => cy * 1000 + cx;

test('planBake: standing still bakes the view first, then a ring all round', () => {
  const need = new Map(), bake = new Map(), v = view(20.1 * CHUNK, 20.1 * CHUNK, 900, 500); // (near a chunk corner)
  planBake(need, bake, v, 0, 0, 200);
  assert.ok(need.has(key(20, 20)), 'the chunk under the camera is needed');
  for (const [k, p] of need) assert.ok(bake.get(k) === p && p < 2000, 'needed chunks bake first');
  const ring = [...bake].filter(([k]) => !need.has(k));
  assert.ok(ring.length > 0 && ring.every(([, p]) => p >= 6000), 'then the ring');
  assert.ok(bake.has(key(18, 20)) && !need.has(key(18, 20)), 'the ring reaches west too');
});

test('planBake: driving fast bakes the road ahead by arrival time and nothing behind', () => {
  const need = new Map(), bake = new Map(), v = view(20.5 * CHUNK, 20.5 * CHUNK);
  const soon = planBake(need, bake, v, 790, 0, [200, 264, 8, 8]);
  // ahead: the chunks east of the view, sooner ones first
  const a1 = bake.get(key(23, 20)), a2 = bake.get(key(24, 20));
  assert.ok(a1 !== undefined && a2 !== undefined, 'chunks two and three columns ahead are baked');
  assert.ok(a1 >= 2000 && a1 < a2, 'nearer ahead comes first');
  // about 2.8 s ahead at this speed, not much more
  assert.ok(!bake.has(key(27, 20)), 'not too far ahead');
  // behind: nothing west of the view (no ring at speed)
  assert.ok(!bake.has(key(17, 20)) && !bake.has(key(18, 20)), 'nothing behind');
  assert.ok(soon.length > 0 && soon.every((k) => !need.has(k)), 'chunks coming into view soon are listed for a stand-in');
});

test('planBake: moving slowly skips the ring behind you', () => {
  const need = new Map(), bake = new Map(), v = view(20.5 * CHUNK, 20.5 * CHUNK, 900, 500);
  planBake(need, bake, v, 0, -300, 200); // heading north
  const south = [...bake.keys()].filter((k) => Math.floor(k / 1000) >= 22);
  assert.equal(south.length, 0, 'no ring to the south');
  assert.ok([...bake.keys()].some((k) => Math.floor(k / 1000) <= 19), 'the way north is baked');
});

test('bakeSteps yields along the way and gives the same chunk as bakeChunk', async () => {
  await loadProviders();
  const M = generateCity(1337);
  const opt = { quality: 0, seed: 1337 };
  const a = bakeChunk(M, 32, 24, opt);
  const it = bakeSteps(M, 32, 24, opt);
  let r = it.next(), steps = 0;
  while (!r.done) { steps++; r = it.next(); }
  const b = r.value;
  assert.ok(steps >= 9, `it pauses between phases (${steps} steps)`);
  assert.equal(a.g.w, CHUNK); assert.equal(b.g.h, CHUNK);
  assert.deepEqual(Buffer.from(a.g.col.buffer).equals(Buffer.from(b.g.col.buffer)), true, 'same colours');
  assert.deepEqual(Buffer.from(a.g.z.buffer).equals(Buffer.from(b.g.z.buffer)), true, 'same heights');
  assert.equal(a.items, b.items);
});
