// A bake thread for the art from the server (server/artcdn.js): the browser's own chunk bake (client/art2/game/
// chunkbake.js, the same code the bake workers in the page run), here in a worker_thread at the lowest CPU priority so
// the game's tick always comes first. It builds the city from the seed itself (the same map, bit for bit: generateCity
// runs under deterministic maths), then bakes the chunks it's sent and writes each as a file:
//   'CLA1' [u32 meta length, little-endian] [meta JSON, utf-8] [gzip of the arrays end to end]
// meta and the arrays are chunkstore.js packChunk's, so a page keeps a download in its store as it is.
//   in   { cx, cy, q, ap, file }   out  { ok, cx, cy, q, ap, bytes, ms } | { ok: false, error }
import { parentPort, workerData } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setPriority } from 'node:os';
import { pathToFileURL } from 'node:url';

const { root, seed } = workerData;
try { setPriority(19); } catch { /* not allowed: carry on at the normal priority */ }   // (Linux: this thread only)
const imp = (f) => import(pathToFileURL(join(root, f)).href);
const { generateCity, cityData, cityFromData } = await imp('shared/map.js');
const { bakeChunk, loadProviders, SpriteCache, providers } = await imp('client/art2/game/chunkbake.js');
const GB = await imp('client/art2/gbuf.js');
const { packChunk } = await imp('client/art2/game/chunkstore.js');
const { packPlanes } = await imp('client/art2/game/chunkpack.js');
await loadProviders();
// the world as a bake worker has it: the city's data (a structured clone) with its methods back
const map = generateCity(seed);
const M = structuredClone(cityData(map));
if (cityFromData) cityFromData(M); else Object.setPrototypeOf(M, Object.getPrototypeOf(map));
const cache = new SpriteCache(160e6);

// a G-buffer to the engine's planes at art resolution: the page's own packing (client/art2/game/chunkpack.js)
const pack = (g, ap, under) => packPlanes(g, ap, under, GB.CHUNK_RUN);

export function chunkFile(r, ap, cx, cy) {
  const { o: g, u: under } = pack(r.g, ap, r.under && r.blds && r.blds.length ? r.under : null);
  const { meta, bin } = packChunk({ cx, cy, g, under, blds: r.blds || [], lights: r.lights, gh: r.gh, live: r.live, n: r.n, items: r.items });
  const mj = Buffer.from(JSON.stringify(meta), 'utf8'), z = gzipSync(Buffer.from(bin.buffer, bin.byteOffset, bin.byteLength), { level: 6 });
  const head = Buffer.alloc(8);
  head.write('CLA1', 0, 'latin1'); head.writeUInt32LE(mj.length, 4);
  return Buffer.concat([head, mj, z]);
}

parentPort.on('message', ({ cx, cy, q, ap, file }) => {
  const t0 = performance.now();
  try {
    const r = bakeChunk(M, cx, cy, { quality: q, seed, lowMem: false, artPx: ap, scratch: ap > 1 }, cache, providers);
    if (r.errors) throw new Error(`bake errors: ${JSON.stringify(r.errors).slice(0, 200)}`);
    const buf = chunkFile(r, ap, cx, cy);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file + '.part', buf);
    renameSync(file + '.part', file);
    parentPort.postMessage({ ok: true, cx, cy, q, ap, bytes: buf.length, ms: performance.now() - t0 });
  } catch (e) {
    parentPort.postMessage({ ok: false, cx, cy, q, ap, error: String((e && e.stack) || e).slice(0, 400) });
  }
});
parentPort.postMessage({ ready: true });
