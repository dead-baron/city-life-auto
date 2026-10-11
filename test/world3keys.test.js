// World v3's switch, step 0 a and b (docs/WORLD-V3.md 8.23): the v3 world's own keys - version.json's world3 (a hash of
// the v3 build's code, computed at every stamp) and art3 - its region files, kept regions and art served and kept under
// '<world3>-v3' and '<art3>-v3', today's world's keys and URLs as they were; and its region files kept between the
// server's restarts (server/worldcdn.js keptWorld). Nothing here builds a world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync, readdirSync, truncateSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { world3Hash, artHash, codeHash, WORLD3_ROOTS } from '../tools/stamp-version.mjs';
import { createWorldCdn, keptWorld, worldKey } from '../server/worldcdn.js';
import { createArtCdn, artKey } from '../server/artcdn.js';
import { PACK_VERSION } from '../shared/regionpack.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = () => JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8'));
function fakeRes() {
  const r = { status: 0, headers: null, chunks: [], done: null };
  r.finished = new Promise((res) => { r.done = res; });
  r.writeHead = (st, h) => { r.status = st; r.headers = h; };
  r.write = (c) => { r.chunks.push(Buffer.from(c)); return true; };
  r.end = (c) => { if (c) r.chunks.push(Buffer.from(c)); r.done(); };
  r.on = () => r; r.once = () => r; r.emit = () => true; r.removeListener = () => r;
  return r;
}

test('version.json knows World v3\'s world and art (run node tools/stamp-version.mjs): world3 the v3 build\'s code, art3 the art\'s of it', async () => {
  const v = V();
  assert.match(v.world3, /^[0-9a-f]{12}$/);
  assert.equal(v.world3, world3Hash(undefined, v.world).hash, 'the v3 build\'s code changed since version.json was stamped: browsers would keep the v3 regions and chunks of the world before');
  assert.equal(v.art3, (await artHash(undefined, v.world3)).hash, 'art3 is the art\'s hash of the v3 world');
  assert.notEqual(v.world3, v.world); assert.notEqual(v.art3, v.art);
  const { files } = world3Hash(undefined, v.world);
  for (const f of ['server/world3.js', 'shared/map.js', 'shared/world3-islands.js', 'shared/world3-world.js', 'shared/world3-land.js', 'shared/world3-passes.js', 'shared/regionpack.js']) assert.ok(files.includes(f), `the hash reads ${f}`);
  assert.ok(!files.some((f) => f.startsWith('client/')), 'no page code in it');
  assert.ok(WORLD3_ROOTS.every((f) => existsSync(join(ROOT, f))));
});

test('world3 moves with the v3 build\'s code and today\'s world, not with the rest', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cla-w3hash-'));
  try {
    for (const d of ['server', 'shared', 'client']) cpSync(join(ROOT, d), join(tmp, d), { recursive: true });
    const base = world3Hash(tmp, 'aaaaaaaaaaaa').hash;
    assert.equal(base, world3Hash(ROOT, 'aaaaaaaaaaaa').hash, 'a copy hashes the same');
    assert.notEqual(world3Hash(tmp, 'bbbbbbbbbbbb').hash, base, 'today\'s world changed: the v3 world reads it');
    writeFileSync(join(tmp, 'client/hud.js'), readFileSync(join(tmp, 'client/hud.js'), 'utf8') + '\n// x\n');
    writeFileSync(join(tmp, 'server/systems/trains.js'), readFileSync(join(tmp, 'server/systems/trains.js'), 'utf8') + '\n// x\n');
    assert.equal(world3Hash(tmp, 'aaaaaaaaaaaa').hash, base, 'the page and the server\'s systems don\'t build the world');
    writeFileSync(join(tmp, 'shared/world3-wild.js'), readFileSync(join(tmp, 'shared/world3-wild.js'), 'utf8') + '\n// x\n');
    const wild = world3Hash(tmp, 'aaaaaaaaaaaa').hash;
    assert.notEqual(wild, base, 'a v3 build module changed');
    writeFileSync(join(tmp, 'shared/regionpack.js'), readFileSync(join(tmp, 'shared/regionpack.js'), 'utf8') + '\n// x\n');
    assert.notEqual(world3Hash(tmp, 'aaaaaaaaaaaa').hash, wild, 'the cut into region files changed');
    assert.equal(codeHash('shared/map.js', tmp).hash, codeHash('shared/map.js', ROOT).hash, 'today\'s generator untouched by it');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('the server\'s keys: today\'s world and art as they were, World v3\'s <world3>-v3 and <art3>-v3', () => {
  const v = V();
  assert.equal(worldKey(ROOT), v.world, 'today\'s region files: the world hash, as before');
  assert.equal(worldKey(ROOT, null, 'v3'), `${v.world3}-v3`);
  assert.equal(worldKey(ROOT, 'abcdef012345', 'v3'), 'abcdef012345-v3', 'a world given');
  assert.equal(artKey(v), v.art, 'today\'s art: the art hash, as before');
  assert.equal(artKey(v, 'today'), v.art);
  assert.equal(artKey(v, 'v3'), `${v.art3}-v3`);
  assert.equal(artKey({ art: 'abcdef012345' }, 'v3'), 'abcdef012345-v3', 'a version.json from before art3');
  assert.equal(artKey(null, 'v3'), null);
  const tmp = mkdtempSync(join(tmpdir(), 'cla-w3key-'));
  try {
    writeFileSync(join(tmp, 'version.json'), JSON.stringify({ world: '111111111111', art: '222222222222' }));
    assert.equal(worldKey(tmp, null, 'v3'), '111111111111-v3', 'a version.json from before world3');
    assert.equal(worldKey(tmp), '111111111111');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('the page keys World v3\'s city and art apart (client/boot.js), today\'s as they were', () => {
  const src = readFileSync(join(ROOT, 'client/boot.js'), 'utf8');
  assert.match(src, /const v3Key = \(a, b\) => `\$\{a \|\| b\}-v3`/);
  assert.match(src, /const key = META && META\.world \? `\$\{v3 \? v3Key\(META\.world3, META\.world\) : META\.world\}:\$\{seed\}` : null/, 'the city: world3-v3, or today\'s world hash');
  assert.match(src, /\? \(V3 \? v3Key\(META\.art3, META\.art\) : META\.art\) : null/, 'the art: art3-v3, or today\'s art hash');
  // (the art key is the chunks' key in the browser's store and the server's URL alike: client/art2/game/worker.js)
  const w = readFileSync(join(ROOT, 'client/art2/game/worker.js'), 'utf8');
  assert.match(w, /fetch\(`\$\{CDN\.base\}\$\{KEEP\.art\}\//);
  assert.match(w, /`\$\{KEEP\.art\}\|\$\{args\.ck\}`/);
});

test('the art CDN at World v3: baked, served and kept under <art3>-v3 in its own directory; today\'s key isn\'t its art', async () => {
  const v = V(), key = `${v.art3}-v3`;
  const map = { frame: { w: 100, h: 100 }, pois: [], edges: [], isWater: () => false };   // (5 x 5 chunks; nothing baked here)
  const dataDir = mkdtempSync(join(tmpdir(), 'cla-art3-'));
  mkdirSync(join(dataDir, 'art', v.art, 'q1a2'), { recursive: true });
  writeFileSync(join(dataDir, 'art', v.art, 'q1a2', '2_3.bin'), Buffer.from('today\'s chunk'));
  writeFileSync(join(dataDir, 'art', v.art, 'world.txt'), 'today\n');
  mkdirSync(join(dataDir, 'art', key, 'q1a2'), { recursive: true });
  writeFileSync(join(dataDir, 'art', key, 'q1a2', '1_1.bin'), Buffer.from('a v3 chunk'));
  const cdn = createArtCdn({ map, root: ROOT, dataDir, seed: 1337, world: 'v3', threads: 1, prewarm: [], log: () => {} });
  cdn.stop();   // (its bake thread would build the v3 world: not here)
  try {
    assert.equal(cdn.art, key);
    assert.equal(cdn._state.dir, join(dataDir, 'art', key));
    assert.equal(readFileSync(join(dataDir, 'art', key, 'world.txt'), 'utf8').trim(), 'v3');
    let res = fakeRes();
    cdn.handle(`/art/${key}/1/2/1/1`, {}, res); await res.finished;
    assert.equal(res.status, 200); assert.equal(Buffer.concat(res.chunks).toString(), 'a v3 chunk');
    res = fakeRes(); cdn.handle(`/art/${key}/1/2/2/3`, {}, res);
    assert.equal(res.status, 404, 'today\'s chunk never stands in for v3\'s (another world)');
    res = fakeRes(); cdn.handle(`/art/${v.art}/1/2/1/1`, {}, res);
    if (res.status === 200) await res.finished;
    assert.ok(res.status === 404 || Buffer.concat(res.chunks).toString() === 'today\'s chunk', 'today\'s key: never a v3 chunk');
    res = fakeRes(); cdn.handle(`/art/${v.art3}/1/2/1/1`, {}, res);
    assert.equal(res.status, 404, 'art3 without -v3: not its key');
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});

// a cut as cutWorld returns it, of made-up bytes (the server doesn't read them: it gzips and writes them)
const fakeCut = (n = 4) => ({ ms: 1, pack: { index: new Uint8Array(1000).fill(7), regions: Array.from({ length: n }, (_, i) => ({ key: `r${i}-0`, bytes: new Uint8Array(500 + i).fill(i) })) } });

test('World v3\'s region files kept between restarts: the same world key, format and signature serve as they are, anything else is cut again', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cla-kept-'));
  const v = V(), key = `${v.world3}-v3`, dir = join(dataDir, 'world', `${key}-1337`);
  const opts = { root: ROOT, dataDir, seed: 1337, variant: 'v3', log: () => {} };
  try {
    assert.equal(keptWorld({ ...opts, sig: 'abc123' }), null, 'nothing kept yet');
    // the first start: cut, written, marked
    let cdn = createWorldCdn({ ...opts, cut: fakeCut(), sig: 'abc123' });
    await cdn.ready;
    assert.equal(cdn.state, 'ready'); assert.equal(cdn.summary().kept, undefined);
    const mark = JSON.parse(readFileSync(join(dir, 'kept.json'), 'utf8'));
    assert.deepEqual([mark.v, mark.world, mark.seed, mark.sig, mark.files.length], [PACK_VERSION, key, 1337, 'abc123', 5]);
    // the next start, the same world: no cut - served from the folder as it is
    const k = keptWorld({ ...opts, sig: 'abc123' });
    assert.ok(k && k.dir === dir && k.files.size === 5 && k.bytes > 0);
    mkdirSync(join(dataDir, 'world', 'old-v3-1337'), { recursive: true });   // (another world's: goes)
    cdn = createWorldCdn({ ...opts, kept: k, sig: 'abc123' });
    assert.equal(cdn.state, 'ready', 'ready at once');
    await cdn.ready;
    assert.equal(cdn.summary().kept, true);
    assert.deepEqual(readdirSync(join(dataDir, 'world')), [`${key}-1337`]);
    const res = fakeRes();
    cdn.handle(`/world/${key}/1337/r2-0.bin?v=${PACK_VERSION}`, {}, res); await res.finished;
    assert.equal(res.status, 200);
    assert.deepEqual([...gunzipSync(Buffer.concat(res.chunks))], [...new Uint8Array(502).fill(2)], 'the region as it was cut');
    // not kept: another signature, another seed, another world key, another format, a file cut short or gone
    assert.equal(keptWorld({ ...opts, sig: 'zzz999' }), null, 'another signature');
    assert.equal(keptWorld({ ...opts, seed: 7, sig: 'abc123' }), null, 'another seed');
    assert.equal(keptWorld({ ...opts, world: '0123456789ab', sig: 'abc123' }), null, 'another world key');
    assert.equal(keptWorld({ ...opts, sig: null }), null, 'no signature to check');
    writeFileSync(join(dir, 'kept.json'), JSON.stringify({ ...mark, v: PACK_VERSION + 1 }));
    assert.equal(keptWorld({ ...opts, sig: 'abc123' }), null, 'another file format');
    writeFileSync(join(dir, 'kept.json'), JSON.stringify(mark));
    assert.ok(keptWorld({ ...opts, sig: 'abc123' }));
    truncateSync(join(dir, 'r1-0.bin'), 10);
    assert.equal(keptWorld({ ...opts, sig: 'abc123' }), null, 'a file cut short');
    rmSync(join(dir, 'r1-0.bin'));
    assert.equal(keptWorld({ ...opts, sig: 'abc123' }), null, 'a file gone');
    // cut again: the marker goes first and comes back with the files
    cdn = createWorldCdn({ ...opts, cut: fakeCut(), sig: 'def456' });
    await cdn.ready;
    assert.ok(keptWorld({ ...opts, sig: 'def456' }) && statSync(join(dir, 'r1-0.bin')).size > 10);
    assert.equal(keptWorld({ ...opts, sig: 'abc123' }), null);
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});

test('tools/bots.js --spread: the junctions of the world the server runs, from its index (waited for while it packs)', async () => {
  const { junctions } = await import('../tools/junctions.mjs');
  const { writePack } = await import('../shared/regionpack.js');
  const { gzipSync } = await import('node:zlib');
  const index = gzipSync(writePack({ root: { nodes: [{ x: 100, y: 200, half: 40 }, { x: 5, y: 6, half: 30, island: 'cedar' }, null, { x: 300, y: 400, half: 40 }] } }));
  let packing = 2;
  const asked = [];
  const fetchFn = async (url) => {
    asked.push(url);
    if (url.endsWith('/stats')) return new Response(JSON.stringify({ world: { world: 'abcdef012345-v3', seed: 1337, state: packing-- > 0 ? 'packing' : 'ready' } }));
    if (url === `http://h.test/world/abcdef012345-v3/1337/index.bin?v=${PACK_VERSION}`) return new Response(index);
    return new Response(null, { status: 404 });
  };
  const t0 = Date.now();
  const nodes = await junctions('http://h.test', { fetchFn, say: () => {} });
  assert.deepEqual(nodes.map((n) => [n.x, n.y]), [[100, 200], [300, 400]], 'the mainland\'s junctions of the index (not the islands\')');
  assert.equal(asked.filter((u) => u.endsWith('/stats')).length, 3, 'asked again while the server wrote its files');
  assert.ok(Date.now() - t0 >= 3500);
});

test('today\'s world: cut at every start as before - its files never marked to be kept', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cla-kept0-'));
  const v = V();
  try {
    const cdn = createWorldCdn({ root: ROOT, dataDir, seed: 1337, cut: fakeCut(), log: () => {} });
    await cdn.ready;
    assert.equal(cdn.world, v.world);
    assert.deepEqual(readdirSync(join(dataDir, 'world')), [`${v.world}-1337`]);
    assert.ok(!existsSync(join(dataDir, 'world', `${v.world}-1337`, 'kept.json')), 'no marker: the next start cuts again');
    assert.equal(keptWorld({ root: ROOT, dataDir, seed: 1337, sig: 'abc123' }), null);
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});
