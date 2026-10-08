// The art from the server (server/artcdn.js, server/artbake.js): a chunk asked for and not baked yet is a 404 that puts
// it at the front of the bake queue; once baked it's served as a file the page reads back (chunkstore.js
// parseChunkFile / unpackChunk) into exactly what the page's own bake worker would have made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
