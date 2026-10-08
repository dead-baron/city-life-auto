// The art from the server (server/artcdn.js, server/artbake.js): a chunk asked for and not baked yet is a 404 that puts
// it at the front of the bake queue; once baked it's served as a file the page reads back (chunkstore.js
// parseChunkFile / unpackChunk) into exactly what the page's own bake worker would have made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCity, cityData, cityFromData } from '../shared/map.js';
import { createArtCdn } from '../server/artcdn.js';
import { parseChunkFile, unpackChunk } from '../client/art2/game/chunkstore.js';
import { bakeChunk, loadProviders, SpriteCache, providers } from '../client/art2/game/chunkbake.js';
import * as GB from '../client/art2/gbuf.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function fakeRes() {
  const r = { status: 0, headers: null, chunks: [], done: null };
  r.finished = new Promise((res) => { r.done = res; });
  r.writeHead = (st, h) => { r.status = st; r.headers = h; };
  r.write = (c) => { r.chunks.push(Buffer.from(c)); return true; };
  r.end = (c) => { if (c) r.chunks.push(Buffer.from(c)); r.done(); };
  r.on = () => r; r.once = () => r; r.emit = () => true; r.removeListener = () => r;
  return r;
}

test('art from the server: asked for, baked, served - the same chunk the page bakes', { timeout: 240000 }, async () => {
  const map = generateCity(1337);
  const dataDir = mkdtempSync(join(tmpdir(), 'cla-art-'));
  const art = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).art;
  const cdn = createArtCdn({ map, root: ROOT, dataDir, seed: 1337, threads: 1, prewarm: [], log: () => {} });
  try {
    const [cx, cy] = [28, 23];
    const path = `/art/${art}/1/2/${cx}/${cy}`;
    let res = fakeRes();
    assert.equal(cdn.handle(path, {}, res), true);
    assert.equal(res.status, 404, 'not baked yet');
    // another build's art: never served
    res = fakeRes(); cdn.handle(`/art/0123456789ab/1/2/${cx}/${cy}`, {}, res); assert.equal(res.status, 404);
    // baked meanwhile (the bake thread builds the city first)
    let file = null;
    for (let i = 0; i < 400 && !file; i++) {
      await new Promise((r) => setTimeout(r, 250));
      res = fakeRes();
      cdn.handle(path, {}, res);
      if (res.status === 200) { await res.finished; file = Buffer.concat(res.chunks); }
    }
    assert.ok(file, 'served once baked');
    assert.equal(res.headers['access-control-allow-origin'], '*');
    const ab = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const f = parseChunkFile(ab);
    assert.ok(f && f.meta && f.z, 'a chunk file');
    const got = await unpackChunk(f.meta, f.z);
    // what the page's bake worker makes of the same chunk (worker.js pack: art pixels, the under layer)
    const M = structuredClone(cityData(map)); cityFromData(M);
    await loadProviders();
    const r = bakeChunk(M, cx, cy, { quality: 1, seed: 1337, lowMem: false, artPx: 2, scratch: true }, new SpriteCache(80e6), providers);
    const d = GB.downsample2(GB.packGBuf(r.g), { run: GB.CHUNK_RUN });
    assert.equal(got.g.w, d.w); assert.equal(got.g.h, d.h);
    for (const k of ['p0', 'p1', 'p2']) assert.ok(Buffer.from(got.g[k].buffer).equals(Buffer.from(d[k].buffer, d[k].byteOffset, d[k].byteLength)), `${k} the same`);
    assert.deepEqual(got.blds, r.blds || []);
    assert.equal(cdn.summary().baked >= 1, true);
  } finally {
    cdn.stop();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('art from the server switched off (no bake threads): a 404 for everything, never a crash', () => {
  const map = generateCity(1337);
  const dataDir = mkdtempSync(join(tmpdir(), 'cla-art-'));
  const art = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).art;
  const cdn = createArtCdn({ map, root: ROOT, dataDir, seed: 1337, threads: 0, prewarm: [1], log: () => {} });
  try {
    const res = fakeRes();
    assert.equal(cdn.handle(`/art/${art}/1/2/28/23`, {}, res), true);
    assert.equal(res.status, 404);
    assert.equal(cdn.summary().threads, 0);
  } finally { cdn.stop(); rmSync(dataDir, { recursive: true, force: true }); }
});

test('a chunk not baked yet: the 404 says when it should be ready; a look ahead (pre=1) is never queued', () => {
  const map = generateCity(1337);
  const dataDir = mkdtempSync(join(tmpdir(), 'cla-art-'));
  const art = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).art;
  const cdn = createArtCdn({ map, root: ROOT, dataDir, seed: 1337, threads: 1, prewarm: [], log: () => {} });
  try {
    const S = cdn._state;
    // a look ahead: not queued, no time given
    let res = fakeRes();
    cdn.handle(`/art/${art}/1/2/30/23?pre=1`, {}, res);
    assert.equal(res.status, 404);
    assert.ok(!S.askedSet.has('1/2/30/23') && !S.inflight.has('1/2/30/23'), 'not queued');
    assert.ok(!res.headers['x-art-eta'], 'no time: it is not coming');
    assert.match(res.headers['access-control-expose-headers'] || '', /x-art-eta/, 'the page may read the time');
    // asked for: queued (the thread isn't up yet, so it waits), with a time; a second ask behind it, later
    res = fakeRes(); cdn.handle(`/art/${art}/1/2/28/23`, {}, res);
    const a = Number(res.headers['x-art-eta']);
    assert.ok(a > 0, `a time (${a} ms)`);
    res = fakeRes(); cdn.handle(`/art/${art}/1/2/29/23`, {}, res);
    const b = Number(res.headers['x-art-eta']);
    // (newest first: the second ask goes before the first)
    res = fakeRes(); cdn.handle(`/art/${art}/1/2/28/23`, {}, res);
    const a2 = Number(res.headers['x-art-eta']);
    assert.ok(b > 0 && a2 > b, `the earlier ask is now behind (${b} then ${a2} ms)`);
  } finally { cdn.stop(); rmSync(dataDir, { recursive: true, force: true }); }
});

test('after a new build: the build before keeps its chunks - for pages still on it, and as stand-ins meanwhile', async () => {
  const map = generateCity(1337);
  const dataDir = mkdtempSync(join(tmpdir(), 'cla-art-'));
  const art = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).art;
  // two older builds on disk: the newer one is kept, the oldest goes
  const old = 'aaaaaaaaaaaa', older = 'bbbbbbbbbbbb';
  mkdirSync(join(dataDir, 'art', older, 'q1a2'), { recursive: true });
  writeFileSync(join(dataDir, 'art', older, 'q1a2', '28_23.bin'), Buffer.from('older'));
  mkdirSync(join(dataDir, 'art', old, 'q1a2'), { recursive: true });
  writeFileSync(join(dataDir, 'art', old, 'q1a2', '28_23.bin'), Buffer.from('previous build'));
  utimesSync(join(dataDir, 'art', older), new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  const cdn = createArtCdn({ map, root: ROOT, dataDir, seed: 1337, threads: 1, prewarm: [], log: () => {} });
  try {
    assert.equal(cdn._state.prev, old, 'the newest older build is kept');
    assert.ok(!existsSync(join(dataDir, 'art', older)), 'the oldest is gone');
    // this build's chunk isn't baked yet: the previous build's stands in, marked stale, never cached
    let res = fakeRes();
    cdn.handle(`/art/${art}/1/2/28/23`, {}, res);
    assert.equal(res.status, 200);
    await res.finished;
    assert.equal(Buffer.concat(res.chunks).toString(), 'previous build');
    assert.equal(res.headers['x-art-stale'], '1');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.ok(Number(res.headers['x-art-eta']) > 0, 'and says when its own will be ready');
    assert.ok(cdn._state.askedSet.has('1/2/28/23'), 'its own is asked for');
    // a look ahead gets no stand-in
    res = fakeRes(); cdn.handle(`/art/${art}/1/2/28/23?pre=1`, {}, res);
    assert.equal(res.status, 404);
    // a page still on the previous build: its own chunk, exact
    res = fakeRes(); cdn.handle(`/art/${old}/1/2/28/23`, {}, res);
    assert.equal(res.status, 200);
    await res.finished;
    assert.ok(!res.headers['x-art-stale'], 'exact for that page');
    assert.match(res.headers['cache-control'], /immutable/);
    res = fakeRes(); cdn.handle(`/art/${old}/1/2/29/23`, {}, res);
    assert.equal(res.status, 404, 'what it never baked: not baked for it now');
    assert.ok(!cdn._state.askedSet.has('1/2/29/23'));
    res = fakeRes(); cdn.handle(`/art/${older}/1/2/28/23`, {}, res);
    assert.equal(res.status, 404, 'two builds back: gone');
  } finally { cdn.stop(); rmSync(dataDir, { recursive: true, force: true }); }
});

test('the server bakes round the players online first, nearest first, after what pages ask for', () => {
  const map = generateCity(1337);
  const dataDir = mkdtempSync(join(tmpdir(), 'cla-art-'));
  const art = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).art;
  const cdn = createArtCdn({ map, root: ROOT, dataDir, seed: 1337, threads: 1, prewarm: [1], log: () => {} });
  try {
    const S = cdn._state;
    cdn.focus([{ x: 28.5 * 768, y: 23.5 * 768 }]);
    let j = cdn._next();
    assert.equal(j.key, '1/2/28/23', 'the chunk the player stands in');
    assert.ok(j.focus);
    S.inflight.set(j.key, j);
    j = cdn._next();
    assert.ok(Math.max(Math.abs(j.cx - 28), Math.abs(j.cy - 23)) === 1, `then the ring round it (${j.cx},${j.cy})`);
    // an ask goes first
    const res = fakeRes(); cdn.handle(`/art/${art}/1/2/40/30`, {}, res);
    S.asked.length = 0; S.askedSet.clear();   // (pump took it already, or the thread isn't up: put it back by hand)
    S.asked.push({ key: '1/2/40/30', q: 1, ap: 2, cx: 40, cy: 30, file: join(S.dir, 'q1a2', '40_30.bin') }); S.askedSet.add('1/2/40/30');
    assert.equal(cdn._next().key, '1/2/40/30', 'asks before the players\' rings');
    // a quality pages asked for lately is baked round players too
    S.qSeen.set(2, Date.now());
    const qs = new Set();
    for (let i = 0; i < 20; i++) { const n = cdn._next(); if (!n || !n.focus) break; qs.add(n.q); S.inflight.set(n.key, n); }
    assert.ok(qs.has(1) && qs.has(2), `both qualities (${[...qs]})`);
    // nobody online: the background order
    cdn.focus([]);
    assert.ok(!cdn._next().focus);
  } finally { cdn.stop(); rmSync(dataDir, { recursive: true, force: true }); }
});
