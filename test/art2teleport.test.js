// The art after a far teleport (docs/WORLD-V3.md 8.12.1): the renderer (client/art2/game/host.js _chunks) asks for the
// chunk under the camera first and the rest nearest first - a look in the store and the server's art before the bakes
// here - and looks again for what the server didn't have yet while the view still needs it; World v3's window swap
// (hostextra.js reworld, loaded when needed) bakes again what was baked or asked for against the old window, and drops
// the stand-ins drawn from it. And the renderer's first load: the bake code and the rarely used paths stay out of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../client/art2/game/host.js';
import { CHUNK } from '../client/art2/game/chunkgeom.js';
import { closure } from '../tools/perf.mjs';

// a renderer with a fake engine and pool: what _chunks asks the pool for, by priority
function fakeRenderer(at) {
  const reqs = [], E = {
    chunks: new Set(), fb: new Set(), dropped: [],
    hasChunk(cx, cy) { return this.chunks.has(cy * 1000 + cx); }, hasFallback(cx, cy) { return this.fb.has(cy * 1000 + cx); },
    setChunkFallback(cx, cy) { this.fb.add(cy * 1000 + cx); }, dropChunk(cx, cy) { this.dropped.push([cx, cy]); this.fb.delete(cy * 1000 + cx); this.chunks.delete(cy * 1000 + cx); },
    reserveChunks() {}, keepChunk() {}, chunkCap: () => 24, chunkKeys: () => [], uploadChunk: () => true, ap: 2,
  };
  const pool = { ready: true, dead: false, has: () => false, cancelWhere() {}, request(jk, op, args, prio, done) { reqs.push({ jk, op, args, prio, done }); }, reworlds: 0, reworld() { this.reworlds++; } };
  const w = Object.create(World2.prototype);
  Object.assign(w, {
    E, pool, S: { cam: { tz: 1 } }, map: { seed: 1337, frame: { w: 1312, h: 1200 }, inside: () => true }, grid: [55, 50], q: 1, tier: { results: 6, chunkUp: 2, chunks: 24 },
    W: 1280, H: 720, prov: { ground: true, statics: true }, artKey: 'abc123', cdn: 'http://127.0.0.1/art/', lowMem: false, noBake: false, failed: false,
    results: new Map(), wantJobs: new Set(), wantChunks: new Map(), chunkState: new Map(), ver: new Map(), chunkFails: new Map(), fallbacks: new Set(), phs: new Map(),
    n: { fbSet: 0, chunkUp: 0 }, t: {},
  });
  w._camVel = () => ({ x: 0, y: 0 });   // (a jump resets the camera's motion: standing still where it lands)
  w._placeholder = () => ({}); w._openSea = () => false; w._offSea = () => 0; w._seaStandIn = () => ({});
  w.at = (x, y) => { w.camX = x; w.camY = y; w.vx0 = x - 640; w.vx1 = x + 640; w.vy0 = y - 360; w.vy1 = y + 360; };
  w.at(at[0], at[1]);
  return { w, E, pool, reqs };
}
const F = { z: 1, now: 0, dt: 0.016 };
const chunkOf = (r) => { const m = /^[pc](-?\d+),(-?\d+),/.exec(r.jk); return m ? [+m[1], +m[2]] : null; };

test('after a teleport: the chunk under the camera first - its look in the store and the server\'s art before any bake - then nearest first', () => {
  const X = 6500, Y = 6500, { w, reqs } = fakeRenderer([X, Y]);
  w._chunks(F);
  const sorted = [...reqs].sort((a, b) => a.prio - b.prio);
  const peeks = sorted.filter((r) => r.op === 'peekChunk'), bakes = sorted.filter((r) => r.op === 'bakeChunk');
  assert.ok(peeks.length >= 4 && bakes.length >= peeks.length, `looks ${peeks.length}, bakes ${bakes.length}`);
  const under = [Math.floor(X / CHUNK), Math.floor(Y / CHUNK)];
  assert.deepEqual(chunkOf(sorted[0]), under, 'the chunk under the camera is asked for first');
  assert.equal(sorted[0].op, 'peekChunk', '(a look in the store and the server first: tens of ms, not a bake\'s seconds)');
  assert.ok(sorted.slice(0, peeks.length).every((r) => r.op === 'peekChunk'), 'every look before any bake');
  const dist = (r) => { const [cx, cy] = chunkOf(r); return Math.hypot((cx + 0.5) * CHUNK - X, (cy + 0.5) * CHUNK - Y); };
  for (const list of [peeks, bakes]) for (let i = 1; i < list.length; i++) assert.ok(dist(list[i]) >= dist(list[i - 1]) - 1e-6, 'nearest first');
  assert.deepEqual(chunkOf(bakes[0]), under, 'and the first bake is the chunk under the camera');
});

test('a chunk the server didn\'t have yet is looked for again while the view needs it (it bakes what pages ask for first)', () => {
  const { w, reqs } = fakeRenderer([6500, 6500]);
  w._chunks(F);
  const first = reqs.filter((r) => r.op === 'peekChunk');
  for (const r of first) r.done({ none: true }, null);   // (not on the server yet: queued there)
  reqs.length = 0;
  w._chunks(F);
  assert.equal(reqs.filter((r) => r.op === 'peekChunk').length, 0, 'not at once');
  for (const [pk, st] of w.peeks) { assert.ok(st > 2, `a time to look again (${pk})`); w.peeks.set(pk, performance.now() - 1); }
  w._chunks(F);
  assert.equal(reqs.filter((r) => r.op === 'peekChunk').length, first.length, 'looked for again once the time comes');
  // without the server's art there's nothing to look again for: answered for good
  const { w: w2, reqs: r2 } = fakeRenderer([6500, 6500]);
  w2.cdn = null;
  w2._chunks(F);
  for (const r of r2.filter((x) => x.op === 'peekChunk')) r.done({ none: true }, null);
  assert.ok([...w2.peeks.values()].every((st) => st === 2));
});

test('World v3\'s window moved: what was baked or asked for against the old window is baked again, its stand-ins go (hostextra.js, loaded then)', async () => {
  const { w, E, pool } = fakeRenderer([6500, 6500]);
  // the old window: tiles 0..1511 each way; the new one further east
  const win = (x0, y0) => ({ seed: 1337, frame: { w: 5040, h: 4032 }, x0, y0, w: 1512, h: 1512, inside: (tx, ty) => tx >= x0 && ty >= y0 && tx < x0 + 1512 && ty < y0 + 1512 });
  const old = win(0, 0), next = win(1512, 0);
  w.map = old; w.resync = () => {};
  const inK = 5 * 1000 + 5, edgeK = 5 * 1000 + 62, outK = 5 * 1000 + 70;   // (chunk 62: tiles 1488..1511, at the old window's edge; 70: past it)
  for (const k of [inK, edgeK]) w.chunkState.set(k, { mode: -1, ver: 0 });
  w.wantChunks.set(outK, 3);                    // (a bake for the screen asked for once the camera had jumped)
  w.fallbacks.add(outK); E.fb.add(outK);        // (its stand-in, drawn from the old window: the sea's)
  w.phs.set(outK, {});
  assert.equal(World2.extra, undefined, 'hostextra.js isn\'t loaded before it\'s needed');
  w.setMap(next);
  assert.equal(w.map, next, 'the map is swapped at once');
  const X = await World2.extra;
  assert.equal(typeof X.reworld, 'function', 'loaded when the window moved');
  assert.equal(w.ver.get(inK) || 0, 0, 'a chunk well inside the old window stays as baked');
  assert.equal(w.ver.get(edgeK), 1, 'one at its edge is baked again');
  assert.equal(w.ver.get(outK), 1, 'the bake asked for past it too: what comes back with the old version is dropped');
  assert.deepEqual(E.dropped, [[70, 5]], 'its stand-in goes (drawn again from the new window)');
  assert.ok(!w.phs.has(outK) && !w.fallbacks.has(outK));
  assert.equal(pool.reworlds, 1, 'the workers get the new window');
  assert.equal(w.workerMap, next);
  assert.equal(typeof w.diag(), 'string', 'the debug line (from the same module)');
});

test('the renderer\'s first load leaves out the bake code and the rarely used paths', () => {
  const r = closure(['client/art2/game/host.js']);
  for (const f of ['client/art2/game/chunkbake.js', 'client/art2/game/hostextra.js']) assert.ok(!r.includes(f), `${f} isn't loaded before the first frame`);
  assert.ok(r.includes('client/art2/game/chunkgeom.js'), 'the chunk\'s geometry is');
});
