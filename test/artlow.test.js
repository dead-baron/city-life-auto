// The server's low-detail picture (server/artlow.js) and its art CDN serving what's on disk (server/artcdn.js): a chunk the
// server has is downloaded, not baked on the page (the owner's phone, 11-06, baked 13 at ~1 s each while flying); every
// bake leaves a thumbnail in a store kept across builds of the art, served a block at a time as a PNG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync, gzipSync } from 'node:zlib';
import { thumbFromGBuf, thumbOfFile, encodePng, createLowStore, LOW_PX, LOW_BLOCK } from '../server/artlow.js';
import { createArtCdn, aheadFocusPx } from '../server/artcdn.js';

function fakeRes() {
  const r = { status: 0, headers: null, chunks: [], done: null };
  r.finished = new Promise((res) => { r.done = res; });
  r.writeHead = (st, h) => { r.status = st; r.headers = h; };
  r.write = (c) => { r.chunks.push(Buffer.from(c)); return true; };
  r.end = (c) => { if (c) r.chunks.push(Buffer.from(c)); r.done(); };
  r.on = () => r; r.once = () => r; r.emit = () => true; r.removeListener = () => r;
  return r;
}
// a 768 px chunk: the left half red, the right half blue; a tower in the middle (z 200) that shades what's south-east of it
function gbuf() {
  const w = 768, h = 768, col = new Uint8Array(w * h * 4), z = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = (y * w + x) * 4; if (x < 384) { col[j] = 200; } else { col[j + 2] = 200; } col[j + 3] = 255; if (x >= 360 && x < 400 && y >= 360 && y < 400) z[y * w + x] = 200; }
  return { w, h, col, nrm: null, z };
}

test('a chunk\'s thumbnail: 1/16, its colours kept, the shade south-east of what stands tall', () => {
  const t = thumbFromGBuf(gbuf());
  assert.equal(t.length, LOW_PX * LOW_PX * 3);
  const px = (x, y) => [...t.subarray((y * LOW_PX + x) * 3, (y * LOW_PX + x) * 3 + 3)];
  assert.deepEqual(px(2, 2), [200, 0, 0]); assert.deepEqual(px(45, 45), [0, 0, 200]);
  assert.ok(px(26, 26)[2] < 200, 'shaded beside the tower');
});

test('a PNG any browser reads: the right size, rows filtered, inflating to the pixels', () => {
  const w = 3, h = 2, rgba = new Uint8Array(w * h * 4).map((_, i) => (i * 37) & 255);
  const png = encodePng(w, h, rgba);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), w); assert.equal(png.readUInt32BE(20), h);
  const idat = png.indexOf('IDAT'), len = png.readUInt32BE(idat - 4), raw = inflateSync(png.subarray(idat + 4, idat + 4 + len));
  assert.equal(raw.length, (w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w * 4; x++) { const v = (raw[y * (w * 4 + 1) + 1 + x] + (x >= 4 ? rgba[y * w * 4 + x - 4] : 0)) & 255; assert.equal(v, rgba[y * w * 4 + x]); }
});

test('the low store: thumbnails by block, a PNG of a block (transparent where there is none), which chunks have one; kept on disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cla-low-'));
  try {
    const s = createLowStore({ dir }), t = thumbFromGBuf(gbuf());
    assert.equal(s.png(0, 0), null, 'nothing yet');
    s.put(1, 0, t); s.put(LOW_BLOCK + 2, 3, t);
    assert.ok(s.has(1, 0) && !s.has(0, 0) && s.has(LOW_BLOCK + 2, 3));
    const b = s.png(0, 0);
    assert.equal(b.n, 1); assert.equal(Buffer.from(b.have, 'base64')[0], 0b10, 'chunk 1 of the block');
    s.flush();
    const s2 = createLowStore({ dir });
    assert.ok(s2.has(1, 0) && s2.has(LOW_BLOCK + 2, 3) && !s2.has(2, 0), 'read back from disk');
    assert.equal(s2.png(1, 0).n, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the art CDN serves the chunks on disk with no bake threads (the page downloads them), and the low-detail blocks', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cla-artserve-'));
  const map = { frame: { w: 24 * 30, h: 24 * 30 }, rails: [], edges: [], pois: [], isWater: () => false };
  try {
    const art = 'abcdef012345';
    const root = mkdtempSync(join(tmpdir(), 'cla-artroot-'));
    writeFileSync(join(root, 'version.json'), JSON.stringify({ art, art3: 'fedcba543210' }));
    // a chunk file as the bake threads write it (artbake.js chunkFile): 'CLA1', the meta, the gzipped arrays
    const meta = { g: { w: 384, h: 384, ax: 0, ay: 0, ap: 2 }, types: ['Uint8Array', 'Uint8Array', 'Uint8Array'], lens: [384 * 384 * 4, 384 * 384 * 4, 384 * 384 * 4] };
    const bin = Buffer.alloc(384 * 384 * 12); for (let i = 0; i < 384 * 384; i++) { bin[i * 4] = 10; bin[i * 4 + 1] = 200; bin[i * 4 + 2] = 30; bin[i * 4 + 3] = 255; }
    const mj = Buffer.from(JSON.stringify(meta)), head = Buffer.alloc(8); head.write('CLA1', 0, 'latin1'); head.writeUInt32LE(mj.length, 4);
    const file = Buffer.concat([head, mj, gzipSync(bin)]);
    mkdirSync(join(dataDir, 'art', art, 'q1a2'), { recursive: true });
    writeFileSync(join(dataDir, 'art', art, 'q1a2', '3_4.bin'), file);
    const th = thumbOfFile(file);
    assert.deepEqual([...th.subarray(0, 3)], [10, 200, 30], 'a thumbnail from a kept chunk file');
    const cdn = createArtCdn({ map, root, dataDir, seed: 1, threads: 0, prewarm: [], log: () => {} });
    let res = fakeRes();
    cdn.handle(`/art/${art}/1/2/3/4`, {}, res); await res.finished;
    assert.equal(res.status, 200, 'on disk: served, no thread needed');
    assert.ok(Buffer.concat(res.chunks).equals(file));
    res = fakeRes(); cdn.handle(`/art/${art}/1/2/5/5`, {}, res);
    assert.equal(res.status, 404, 'not on disk: the page bakes it');
    res = fakeRes(); cdn.handle('/art/low/today/0_0.png', {}, res);
    assert.equal(res.status, 404, 'no thumbnails yet');
    cdn._state.low.put(3, 4, th);
    res = fakeRes(); cdn.handle('/art/low/today/0_0.png', {}, res);
    assert.equal(res.status, 200); assert.equal(res.headers['content-type'], 'image/png'); assert.equal(res.headers['x-low-n'], '1');
    assert.match(res.headers['access-control-expose-headers'], /x-low-have/);
    res = fakeRes(); cdn.handle('/art/low/v3/0_0.png', {}, res);
    assert.equal(res.status, 404, 'another world\'s picture: none');
    cdn.stop();
    rmSync(root, { recursive: true, force: true });
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});

test('the bakes round players reach further ahead of an aircraft', () => {
  assert.equal(aheadFocusPx(600), 600 * 15);
  assert.equal(aheadFocusPx(2000), 9000);
  assert.equal(aheadFocusPx(1000, true), 1000 * 20); assert.equal(aheadFocusPx(1350, true), 24000, 'capped');
  assert.ok(aheadFocusPx(1350, true) > aheadFocusPx(1350));
});
