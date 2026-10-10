// World v3 part 8, stage 1: today's city served as region files (shared/regionpack.js cuts and assembles them,
// server/worldcdn.js serves them, client/worldgen.js downloads them instead of building). The round trip on the real
// city, the split, the server's answers, the worker's choice. The city is built once for the file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { generateCity, cityFromData, CityMap, mapSignature } from '../shared/map.js';
import { packRegions, assembleCity, readPack, regionGrid, regionKeys, regionKey, regionOf, itemTile, REGIONAL, OMIT } from '../shared/regionpack.js';
import { REGION_TILES, REGIONS_X, REGIONS_Y, FRAME_W, FRAME_H } from '../shared/world3.js';
import { MAP_W, MAP_H, TILE } from '../shared/constants.js';
import { cutWorld, createWorldCdn } from '../server/worldcdn.js';
import { cityFor, fetchCity } from '../client/worldgen.js';
import { assertSameCity } from './samecity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let city = null, cut = null;
const CITY = () => (city ||= generateCity(1337));
const PACK = () => (cut ||= cutWorld(CITY(), { seed: 1337 })).pack;
const WIN = [0, 0, MAP_W, MAP_H];

test('the region files are the city: assembled again, every field and value the same (less the generator-only layers), the same signature', () => {
  const m = CITY(), pack = PACK();
  assert.equal(pack.regions.length, 9, "today's world: 3 x 3 regions");
  const back = cityFromData(assembleCity(pack.index, pack.regions.map((r) => r.bytes)));
  assert.ok(back instanceof CityMap);
  assertSameCity(m, back, { omit: OMIT });   // (test/samecity.js: the comparison a structured clone passes too)
  // the solid entries are the same objects in solidProps and propSolid (and the gates': the canonical hash above checks
  // every shared object)
  let n = 0;
  for (const [k, arr] of back.solidProps) for (const e of arr) if (e.pi >= 0 && n++ < 500) assert.equal(back.propSolid.get(e.pi), e, `prop ${e.pi} at tile ${k}`);
  // what's left out is read by no client code (only the generator reads it)
  const files = readdirSync(join(ROOT, 'client'), { recursive: true }).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = readFileSync(join(ROOT, 'client', f), 'utf8');
    for (const k of OMIT) assert.ok(!new RegExp(`\\.${k}\\b`).test(src), `client/${f} reads ${k}: take it out of shared/regionpack.js OMIT`);
  }
  assert.ok(!assembleCity(pack.index, pack.regions.map((r) => r.bytes)).compLab, 'compLab left out');
  // a region missing, or a file that isn't one: an error (the worker builds the city instead)
  assert.throws(() => assembleCity(pack.index, pack.regions.slice(1).map((r) => r.bytes)), /missing/);
  assert.throws(() => assembleCity(pack.index, [new Uint8Array(64), ...pack.regions.slice(1).map((r) => r.bytes)]), /not a region file/);
});

test('the split: a region holds its rectangle of every layer and the items whose position is in it, with their world-wide indices', () => {
  const m = CITY(), pack = PACK();
  const g = regionGrid(MAP_W, MAP_H);
  assert.equal(g.R, REGION_TILES);
  assert.deepEqual([g.nx, g.ny], [3, 3]);
  assert.deepEqual(pack.regions.map((r) => r.key), regionKeys(MAP_W, MAP_H));
  const X = readPack(pack.index).d;
  assert.deepEqual(X.layers.map(([k]) => k).sort(), ['bld', 'cover', 'deck', 'dist', 'distRiver', 'distSea', 'lake', 'land', 'lvl0Block', 'reserve', 'river', 'roadAxis', 'roadRank', 'tiles', 'zone'], 'every per-tile layer but the generator-only ones');
  const seen = {};
  for (const r of pack.regions) {
    const { d, blobs } = readPack(r.bytes), ri = d.ry * g.nx + d.rx;
    const [X0, Y0, rw, rh] = d.rect;
    assert.deepEqual([rw, rh], [Math.min(REGION_TILES, MAP_W - X0), Math.min(REGION_TILES, MAP_H - Y0)], `${r.key}: the frame's edge cuts it`);
    X.layers.forEach(([k], li) => {
      const a = blobs[li];
      assert.equal(a.length, rw * rh);
      let bad = -1;
      for (let ly = 0; ly < rh && bad < 0; ly++) for (let lx = 0; lx < rw; lx++) if (a[ly * rw + lx] !== m[k][(Y0 + ly) * MAP_W + X0 + lx]) { bad = ly * rw + lx; break; }
      assert.equal(bad, -1, `${r.key} ${k}: the map's rectangle`);
    });
    for (const [f, { i, d: items }] of Object.entries(d.lists)) {
      const idx = blobs[i], src = f === 'solidProps' ? [...m.solidProps.keys()] : m[f];
      for (let j = 0; j < idx.length; j++) {
        const it = src[idx[j]], [tx, ty] = itemTile(REGIONAL[f], it, WIN);
        assert.equal(regionOf(g, tx, ty), ri, `${f}[${idx[j]}] is in ${r.key}`);
        (seen[f] ||= new Set()).add(idx[j]);
      }
      if (f === 'props') for (let j = 0; j < idx.length; j += 97) assert.deepEqual([items[j].t, items[j].x, items[j].y], [m.props[idx[j]].t, m.props[idx[j]].x, m.props[idx[j]].y], `props[${idx[j]}] as it is`);
    }
  }
  for (const f of Object.keys(REGIONAL)) if (seen[f]) assert.equal(seen[f].size, f === 'solidProps' ? m.solidProps.size : m[f].length, `${f}: every item once`);
  assert.ok(seen.props && seen.pois && seen.buildings && seen.lamps && seen.parking && seen.solidProps, 'the big lists are cut');
});

test("a World v3 frame splits 10 x 8, and a map that is a window onto it travels with its origin", () => {
  const g = regionGrid(FRAME_W, FRAME_H);
  assert.deepEqual([g.nx, g.ny], [REGIONS_X, REGIONS_Y]);
  const x0 = 600, y0 = 500, w = 700, h = 600;
  const tiles = new Uint8Array(w * h), bld = new Int16Array(w * h);
  for (let i = 0; i < tiles.length; i++) { tiles[i] = (i * 7) & 255; bld[i] = (i % 1000) - 1; }
  const e = { x: (x0 + 5.5) * TILE, y: (y0 + 5.5) * TILE, r: 3, pi: 1, off: false };
  const c = { seed: 7, x0, y0, w, h, tiles, bld, props: [{ t: 'a', x: (x0 + 10) * TILE, y: (y0 + 10) * TILE }, { t: 'b', x: (x0 + 690) * TILE, y: (y0 + 590) * TILE, k: undefined, z: -0 }],
    solidProps: new Map([[5 * w + 5, [e]]]), propSolid: new Map([[1, e]]), spawns: { a: { x: 1, y: NaN } }, noTree: new Set([3, 4]) };
  const p = packRegions(c, { frame: [FRAME_W, FRAME_H] });
  assert.equal(p.regions.length, 80);
  const back = assembleCity(p.index, p.regions.map((r) => r.bytes));
  assert.deepEqual(Object.keys(back), Object.keys(c));
  assert.deepEqual([back.x0, back.y0, back.w, back.h], [x0, y0, w, h], 'the window travels in the index');
  assert.deepEqual(back.tiles, tiles); assert.deepEqual(back.bld, bld);
  assert.deepEqual(back.props, c.props); assert.ok('k' in back.props[1] && Object.is(back.props[1].z, -0));
  assert.equal(back.propSolid.get(1), back.solidProps.get(5 * w + 5)[0], 'propSolid points into solidProps');
  assert.ok(Number.isNaN(back.spawns.a.y)); assert.deepEqual([...back.noTree], [3, 4]);
  // the far prop is in the region its position says
  const far = p.regions.find((r) => r.key === regionKey(Math.floor((x0 + 690) / REGION_TILES), Math.floor((y0 + 590) / REGION_TILES)));
  const fp = readPack(far.bytes);
  assert.deepEqual([...fp.blobs[fp.d.lists.props.i]], [1]); assert.equal(fp.d.lists.props.d[0].t, 'b');
});

function fakeRes() {
  const r = { status: 0, headers: null, chunks: [], done: null };
  r.finished = new Promise((res) => { r.done = res; });
  r.writeHead = (st, h) => { r.status = st; r.headers = h; };
  r.write = (c) => { r.chunks.push(Buffer.from(c)); return true; };
  r.end = (c) => { if (c) r.chunks.push(Buffer.from(c)); r.done(); };
  r.on = () => r; r.once = () => r; r.emit = () => true; r.removeListener = () => r;
  return r;
}

test('the server serves the region files: the index and a region, cached for good; 404 (and why) for another hash, seed or file, or while packing', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'cla-world-'));
  mkdirSync(join(dataDir, 'world', '0123456789ab-1337'), { recursive: true });   // an older build's: deleted
  const world = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).world;
  const cdn = createWorldCdn({ cut: cutWorld(CITY(), { seed: 1337 }), root: ROOT, dataDir, seed: 1337, log: () => {} });
  const get = async (path) => { const res = fakeRes(); assert.equal(cdn.handle(path, {}, res), true); if (res.status === 200) await res.finished; return res; };
  try {
    let res = await get(`/world/${world}/1337/index.bin`);
    assert.equal(res.status, 404); assert.equal(res.headers['x-world-miss'], 'packing');
    await cdn.ready;
    assert.equal(cdn.state, 'ready');
    assert.deepEqual(readdirSync(join(dataDir, 'world')), [`${world}-1337`], "older builds' folders deleted");
    const files = [];
    for (const name of ['index.bin', ...regionKeys(MAP_W, MAP_H).map((k) => `${k}.bin`)]) {
      res = await get(`/world/${world}/1337/${name}`);
      assert.equal(res.status, 200, name);
      assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
      assert.equal(res.headers['access-control-allow-origin'], '*');
      const z = Buffer.concat(res.chunks);
      assert.equal(res.headers['content-length'], z.length);
      files.push(new Uint8Array(gunzipSync(z)));
    }
    const back = cityFromData(assembleCity(files[0], files.slice(1)));
    delete back._sig;
    assert.equal(mapSignature(back), CITY()._sig, 'the files are the city');
    for (const [path, why] of [[`/world/0123456789ab/1337/index.bin`, 'hash'], [`/world/${world}/42/index.bin`, 'seed'], [`/world/${world}/01337/index.bin`, 'seed'], [`/world/${world}/1337/r9-9.bin`, 'file'], [`/world/${world}/1337/x.json`, 'file'], ['/world/../version.json', 'file']]) {
      res = await get(path);
      assert.equal(res.status, 404, path); assert.equal(res.headers['x-world-miss'], why, path);
    }
    assert.equal(cdn.handle('/art/x', {}, fakeRes()), false, 'not its path');
    const s = cdn.summary();
    assert.equal(s.files, 10); assert.ok(s.MB > 0.5 && s.MB < 8, `today's world well under 8 MB (${s.MB} MB)`);
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});

test("the city worker: the kept city, else the server's region files, else built - built whenever the server can't serve it", async () => {
  const pack = PACK(), world = 'abcdef123456', key = `${world}:1337`, base = 'http://cdn.test/world/';
  const files = {};
  for (const [name, bytes] of [['index.bin', pack.index], ...pack.regions.map((r) => [`${r.key}.bin`, r.bytes])]) files[name] = gzipSync(bytes, { level: 1 });
  const serve = (over = {}) => async (url) => {
    assert.ok(url.startsWith(`${base}${world}/1337/`), url);
    const name = url.slice(`${base}${world}/1337/`.length), z = name in over ? over[name] : files[name];
    if (z instanceof Error) throw z;
    return z ? new Response(z) : new Response(null, { status: 404 });
  };
  let built = 0;
  const build = async (seed) => { built++; return { seed, built: true }; };
  const none = async () => null;
  let r = await cityFor({ seed: 1337, key, base }, { read: async () => ({ seed: 1337, kept: true }), fetchFn: serve(), build });
  assert.equal(r.from, 'cache'); assert.ok(r.data.kept);
  r = await cityFor({ seed: 1337, key, base }, { read: none, fetchFn: serve(), build });
  assert.equal(r.from, 'served');
  const c = cityFromData(r.data); delete c._sig;
  assert.equal(mapSignature(c), CITY()._sig);
  assert.equal(built, 0);
  const warn = console.warn; console.warn = () => {};
  try {
    for (const [why, msg] of [
      ['no server address', { seed: 1337, key, base: null }],
      ['no key (not this build)', { seed: 1337, key: null, base }],
      ['another seed', { seed: 42, key: `${world}:42`, base }],
    ]) { r = await cityFor(msg, { read: none, fetchFn: serve(), build }); assert.equal(r.from, 'built', why); }
    for (const [why, over] of [
      ['a 404', { 'r1-1.bin': null }],
      ['a bad file', { 'r2-0.bin': gzipSync(Buffer.from('not a region')) }],
      ['not gzip', { 'index.bin': Buffer.from('plain') }],
      ['no network', { 'r0-2.bin': new TypeError('Failed to fetch') }],
      ["another seed's files", { 'index.bin': gzipSync(packRegions({ ...CITY(), seed: 99 }).index, { level: 1 }) }],
    ]) { r = await cityFor({ seed: 1337, key, base }, { read: none, fetchFn: serve(over), build }); assert.equal(r.from, 'built', why); }
    const hang = (url, o) => new Promise((res, rej) => { if (o && o.signal) o.signal.addEventListener('abort', () => rej(new Error('aborted'))); });
    assert.equal(await fetchCity(base, key, 1337, { fetchFn: hang, ms: 50 }), null, 'too slow');
    const DS = globalThis.DecompressionStream;
    globalThis.DecompressionStream = undefined;
    try { assert.equal(await fetchCity(base, key, 1337, { fetchFn: serve() }), null, 'no DecompressionStream'); } finally { globalThis.DecompressionStream = DS; }
  } finally { console.warn = warn; }
  assert.equal(built, 8);
});

test('the load report says the city was downloaded from the server', async () => {
  const { reportLine, cleanReport } = await import('../server/perfreports.js');
  const r = cleanReport({ kind: 'phone', ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) Chrome/128.0.0.0 Mobile', preset: 'low', w: 892, h: 412, dpr: 2, scale: 1, at: { city: 1000, screen: 3000 }, ms: { city: 500 }, city: 'served', fps: 58, p50: 16, p95: 20 });
  assert.match(reportLine(r), /city 1\.0 \(downloaded from the server, 0\.5 s\)/);
});
