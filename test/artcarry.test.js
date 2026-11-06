// Kept chunks carried over a new build of the art (server/artcdn.js same, server/artbake.js, client/art2/game/chunkcarry.js,
// worker.js fromCdn): the server compares each chunk it bakes for this build with the build before's, byte for byte; a
// page that kept the build before's chunk asks with had= and is told x-art-same (no body) only when they're the same -
// a changed chunk is sent whole, never carried over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCity } from '../shared/map.js';
import { createArtCdn } from '../server/artcdn.js';
import { prevOf, toDrop, prevKey } from '../client/art2/game/chunkcarry.js';

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
const ask = async (cdn, path) => { const res = fakeRes(); cdn.handle(path, {}, res); if (res.status === 200) await res.finished; return { status: res.status, h: res.headers || {}, body: Buffer.concat(res.chunks) }; };
async function baked(cdn, path) {
  for (let i = 0; i < 480; i++) { const r = await ask(cdn, path); if (r.status === 200 && !r.h['x-art-stale']) return r; await new Promise((res) => setTimeout(res, 250)); }
  throw new Error(`never baked: ${path}`);
}

test('a chunk baked the same as the build before\'s is carried over (x-art-same, no body); a changed one is sent whole', { timeout: 400000 }, async () => {
  const map = generateCity(1337);
  const dataDir = mkdtempSync(join(tmpdir(), 'cla-carry-'));
  const art = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).art, old = 'aaaaaaaaaaaa';
  const A = `/art/${art}/1/2/28/23`, B = `/art/${art}/1/2/29/23`;
  // the build before: these two chunks baked - then one of them made different (as if the new code drew it differently)
  let cdn = createArtCdn({ map, root: ROOT, dataDir, seed: 1337, threads: 1, prewarm: [], log: () => {} });
  try { await ask(cdn, A); await ask(cdn, B); await baked(cdn, A); await baked(cdn, B); } finally { cdn.stop(); }
  renameSync(join(dataDir, 'art', art), join(dataDir, 'art', old));
  const bf = join(dataDir, 'art', old, 'q1a2', '29_23.bin'), b = readFileSync(bf);
  b[b.length - 9] ^= 0xff; writeFileSync(bf, b);
  cdn = createArtCdn({ map, root: ROOT, dataDir, seed: 1337, threads: 1, prewarm: [], log: () => {} });
  try {
    assert.equal(cdn._state.prev, old);
    // not baked yet for this build: a page that kept the build before's is told to show its own as the stand-in (no body)
    let r = await ask(cdn, `${A}?had=${old}`);
    assert.equal(r.status, 200);
    assert.equal(r.h['x-art-stale'], '1');
    assert.equal(r.h['x-art-yours'], '1');
    assert.equal(r.body.length, 0);
    await ask(cdn, B);
    await baked(cdn, A); await baked(cdn, B);
    // the same bytes: carried over
    r = await ask(cdn, `${A}?had=${old}`);
    assert.equal(r.h['x-art-same'], '1', 'the same as the build before\'s');
    assert.equal(r.body.length, 0, 'no download');
    // a chunk that came out different: sent whole, never "same"
    r = await ask(cdn, `${B}?had=${old}`);
    assert.ok(!r.h['x-art-same']);
    assert.ok(r.body.length > 1000);
    // a page without the build before's chunk, or with another build's: the file, as before
    for (const p of [A, `${A}?had=bbbbbbbbbbbb`]) { r = await ask(cdn, p); assert.ok(!r.h['x-art-same'], p); assert.ok(r.body.length > 1000, p); }
  } finally { cdn.stop(); }
  // a restart remembers which were the same
  assert.ok(existsSync(join(dataDir, 'art', art, `same-${old}.txt`)));
  cdn = createArtCdn({ map, root: ROOT, dataDir, seed: 1337, threads: 1, prewarm: [], log: () => {} });
  try { assert.ok(cdn._state.same.has('1/2/28/23') && !cdn._state.same.has('1/2/29/23')); } finally { cdn.stop(); rmSync(dataDir, { recursive: true, force: true }); }
});

test('the page keeps the build before\'s chunks beside this build\'s (the cap counts both, the build before\'s go first)', () => {
  const keys = ['N|q1|0,0', 'N|q1|0,1', 'P|q1|0,0', 'P|q1|0,1', 'P|q1|0,2', 'O|q1|0,0'];
  assert.equal(prevOf(keys, 'N'), 'P', 'the other build most chunks are kept under');
  assert.equal(prevOf(['N|a'], 'N'), null);
  assert.deepEqual(toDrop(keys, 'N', 'P', 10), ['O|q1|0,0'], 'older builds go; the one before stays');
  assert.deepEqual(toDrop(keys, 'N', 'P', 3, ['P|q1|0,0', 'N|q1|0,0', 'P|q1|0,1', 'N|q1|0,1', 'P|q1|0,2']), ['O|q1|0,0', 'P|q1|0,0', 'P|q1|0,1'], 'over the cap: the build before\'s, oldest first');
  assert.deepEqual(toDrop(keys, 'N', null, 10).sort(), ['O|q1|0,0', 'P|q1|0,0', 'P|q1|0,1', 'P|q1|0,2'], 'no build before known: as before');
  assert.equal(prevKey('N-v3|q1|a2|u0|3,4', 'N-v3', 'P-v3'), 'P-v3|q1|a2|u0|3,4');
  assert.equal(prevKey('N|q1|3,4', 'N', null), null);
});

test('the bake worker carries a chunk over only on the server\'s word (worker.js fromCdn)', () => {
  const src = readFileSync(join(ROOT, 'client/art2/game/worker.js'), 'utf8');
  assert.match(src, /had = pk && \(await hasChunk\(pk\)\) \? KEEP\.prev : null/, 'had= only when the build before\'s chunk is kept');
  assert.match(src, /mine = had && \(hdr\('x-art-same'\) === '1' \|\| \(stale && hdr\('x-art-yours'\) === '1'\)\)/);
  assert.match(src, /import \{ prevArt, tidyKeep, getRaw, prevKey \} from '\.\/chunkcarry\.js'/);
  // chunkcarry.js stays out of the art hash (a change to it mustn't throw everyone's kept chunks away)
  return import('../tools/stamp-version.mjs').then((S) => { const files = S.ART_ROOTS.flatMap((f) => S.codeHash(f, ROOT, S.ART_SKIP).files); assert.ok(!files.includes('client/art2/game/chunkcarry.js')); });
});
