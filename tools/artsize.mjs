// How big is the world's art? (2026-11-06, the owner: "Can we not do a large download of the game ahead of time?") World v3
// built as the server builds it, every art chunk of its frame sorted into a kind of place (open sea, coast, city, suburbs,
// country, desert, wild), a sample of each kind baked at a quality with the game's own chunk bake and packed as the server's
// art CDN keeps it (server/artbake.js chunkFile: gzipped) - the bytes and the bake time per kind, scaled up to the whole
// world, per kind and per region (13 x 8 regions of 21 x 21 chunks), and the low-detail picture's (server/artlow.js) too.
// Heavy (World v3's build, ~1.5 GB): run it under `flock /tmp/cla-heavy.lock`.
//   node --expose-gc tools/artsize.mjs [--n 16] [--q 1] [--out sizes.json]
//     [--corridor <dataDir>]   also bake a straight line across the Red Rock Desert into <dataDir>/art/<art3>-v3/q<q>a2/ (the
//                              art CDN's own layout: a server run with that data dir serves them) and the low-detail
//                              thumbnails of a wider band round it into <dataDir>/artlow/v3/ - for tools/drivebench.mjs --fly
//     [--width 1] [--lowwidth 4] [--len 36]   the corridor's half-width in full chunks, the thumbnails' half-width, its length
import { gzipSync, deflateSync } from 'node:zlib';
import { writeFileSync, readFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const N = +arg('n', 16), Q = +arg('q', 1), OUT = arg('out', null), CORR = arg('corridor', null), WID = +arg('width', 1), LOWW = +arg('lowwidth', 4), LEN = +arg('len', 36);
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const t0 = Date.now(), log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);

const { cityData, cityFromData } = await imp('shared/map.js');
const { T } = await imp('shared/constants.js');
const { DISTRICTS } = await imp('shared/mapcore.js');
const { bakeChunk, loadProviders, SpriteCache, providers } = await imp('client/art2/game/chunkbake.js');
const GB = await imp('client/art2/gbuf.js');
const { packChunk } = await imp('client/art2/game/chunkstore.js');
const { packPlanes } = await imp('client/art2/game/chunkpack.js');
const { thumbFromGBuf, createLowStore, LOW_PX, encodePng } = await imp('server/artlow.js');
const { artKey } = await imp('server/artcdn.js');
await loadProviders();
log('building World v3');
let map = (await (await imp('server/world3.js')).buildWorld3(1337, { log: () => {} })).map;
const M = structuredClone(cityData(map));
if (cityFromData) cityFromData(M); else Object.setPrototypeOf(M, Object.getPrototypeOf(map));
map = null; if (globalThis.gc) globalThis.gc();
const CH = 768, CX = Math.ceil(M.frame.w * 32 / CH), CY = Math.ceil(M.frame.h * 32 / CH);
log(`World v3: ${CX} x ${CY} = ${CX * CY} chunks`);

// ---- every chunk sorted: by its tiles (36 looked at) ------------------------------------------------------------------
const CITY = new Set(['towers', 'commercial', 'apartments', 'civic', 'nightlife', 'redlight', 'oldtown', 'arts', 'southside', 'harbor', 'industrial', 'factory', 'airport']);
const SUB = new Set(['houses', 'luxury']);
const kindOf = (cx, cy) => {
  let deep = 0, water = 0, land = 0;
  const byD = new Map();
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
    const tx = cx * 24 + 2 + i * 4, ty = cy * 24 + 2 + j * 4;
    if (!M.inside(tx, ty)) { deep++; continue; }
    const t = M.tiles[M.idx(tx, ty)];
    if (t === T.DEEP) { deep++; continue; }
    if (t === T.WATER) { water++; continue; }
    land++;
    const d = M.dist ? M.dist[M.idx(tx, ty)] : 0;
    byD.set(d, (byD.get(d) || 0) + 1);
  }
  if (!land) return { k: deep === 36 ? 'sea' : 'water', d: -1 };
  if (land < 30 && (deep + water) >= 6) return { k: 'coast', d: [...byD].sort((a, b) => b[1] - a[1])[0][0] };
  let bd = 0, bn = -1;
  for (const [d, n] of byD) if (n > bn) { bn = n; bd = d; }
  const st = (DISTRICTS[bd] && DISTRICTS[bd].style) || 'wild';
  return { k: CITY.has(st) ? 'city' : SUB.has(st) ? 'suburbs' : st === 'desert' ? 'desert' : st === 'rural' || st === 'beach' ? 'country' : 'wild', d: bd };
};
const KIND = new Array(CX * CY), DIST = new Int16Array(CX * CY);
const count = {};
for (let cy = 0; cy < CY; cy++) for (let cx = 0; cx < CX; cx++) { const o = kindOf(cx, cy); KIND[cy * CX + cx] = o.k; DIST[cy * CX + cx] = o.d; count[o.k] = (count[o.k] || 0) + 1; }
log(`kinds: ${JSON.stringify(count)}`);

// ---- a bake, packed as the server keeps it (server/artbake.js chunkFile) --------------------------------------------------
const cache = new SpriteCache(160e6);
function bake(cx, cy) {
  const t = performance.now();
  const r = bakeChunk(M, cx, cy, { quality: Q, seed: 1337, lowMem: false, artPx: 2, scratch: true }, cache, providers);
  const ms = performance.now() - t;
  const thumb = thumbFromGBuf(r.g);
  const { o: g, u: under } = packPlanes(r.g, 2, r.under && r.blds && r.blds.length ? r.under : null, GB.CHUNK_RUN);
  const { meta, bin } = packChunk({ cx, cy, g, under, blds: r.blds || [], lights: r.lights, gh: r.gh, live: r.live, n: r.n, items: r.items });
  const mj = Buffer.from(JSON.stringify(meta), 'utf8'), z = gzipSync(Buffer.from(bin.buffer, bin.byteOffset, bin.byteLength), { level: 6 });
  const head = Buffer.alloc(8); head.write('CLA1', 0, 'latin1'); head.writeUInt32LE(mj.length, 4);
  return { file: Buffer.concat([head, mj, z]), raw: bin.byteLength, ms, thumb };
}
// a thumbnail's own share of a block's PNG: alone, as a 48 x 48 PNG (an upper bound - a block's compresses better)
const thumbPng = (rgb) => { const a = Buffer.alloc(LOW_PX * LOW_PX * 4); for (let i = 0; i < LOW_PX * LOW_PX; i++) { a[i * 4] = rgb[i * 3]; a[i * 4 + 1] = rgb[i * 3 + 1]; a[i * 4 + 2] = rgb[i * 3 + 2]; a[i * 4 + 3] = 255; } return encodePng(LOW_PX, LOW_PX, a).length; };
void deflateSync;

// ---- the sample: N of each kind (a fixed shuffle), one of the open sea (they're all alike) --------------------------------
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const res = {};
for (const k of Object.keys(count)) {
  const all = []; for (let i = 0; i < CX * CY; i++) if (KIND[i] === k) all.push(i);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  const take = all.slice(0, k === 'sea' ? 3 : N);
  const S = res[k] = { n: count[k], sampled: 0, bytes: [], ms: [], raw: [], low: [] };
  for (const i of take) {
    const b = bake(i % CX, Math.floor(i / CX));
    S.sampled++; S.bytes.push(b.file.length); S.ms.push(Math.round(b.ms)); S.raw.push(b.raw); S.low.push(thumbPng(b.thumb));
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  S.avgKB = +(avg(S.bytes) / 1024).toFixed(1); S.avgMs = Math.round(avg(S.ms)); S.avgRawKB = +(avg(S.raw) / 1024).toFixed(0); S.avgLowKB = +(avg(S.low) / 1024).toFixed(2);
  S.totalMB = Math.round(S.avgKB * S.n / 1024); S.cpuMin = Math.round(S.avgMs * S.n / 60000);
  log(`${k}: ${S.n} chunks, ${S.avgKB} KB avg (${S.avgRawKB} KB unpacked), bake ${S.avgMs} ms here -> ${S.totalMB} MB, ${S.cpuMin} CPU-min; thumbnail ${S.avgLowKB} KB`);
}
const total = { chunks: CX * CY, MB: 0, cpuMin: 0, lowMB: 0 };
for (const k in res) { total.MB += res[k].totalMB; total.cpuMin += res[k].cpuMin; total.lowMB += res[k].avgLowKB * res[k].n / 1024; }
total.lowMB = +total.lowMB.toFixed(1);
// the sea past the shore is one chunk baked once on the page (its bytes don't count twice): the land's own total
total.landMB = total.MB - (res.sea ? res.sea.totalMB : 0);
log(`whole world at quality ${Q}: ${total.MB} MB (${total.landMB} MB without the open sea), ${total.cpuMin} CPU-min here; the low-detail picture ~${total.lowMB} MB`);
// per region (13 x 8 of 21 x 21): its kinds' averages summed, and what it mostly is
const regions = [];
for (let ry = 0; ry * 21 < CY; ry++) for (let rx = 0; rx * 21 < CX; rx++) {
  let MB = 0, n = 0; const ks = {}, ds = {};
  for (let cy = ry * 21; cy < Math.min(CY, ry * 21 + 21); cy++) for (let cx = rx * 21; cx < Math.min(CX, rx * 21 + 21); cx++) {
    const i = cy * CX + cx, k = KIND[i]; MB += (res[k] ? res[k].avgKB : 0) / 1024; n++; ks[k] = (ks[k] || 0) + 1;
    if (DIST[i] >= 0 && k !== 'sea') { const nm = DISTRICTS[DIST[i]] ? DISTRICTS[DIST[i]].name : '?'; ds[nm] = (ds[nm] || 0) + 1; }
  }
  const top = Object.entries(ds).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([d]) => d).join(' / ') || 'open sea';
  regions.push({ rx, ry, MB: Math.round(MB), kinds: ks, top });
}
regions.sort((a, b) => b.MB - a.MB);
log(`regions, largest first: ${regions.slice(0, 12).map((r) => `${r.rx},${r.ry} ${r.top} ${r.MB} MB`).join('; ')}`);
log(`regions: median ${regions[Math.floor(regions.length / 2)].MB} MB, ${regions.filter((r) => r.MB > 50).length} over 50 MB`);

// ---- the flight corridor -----------------------------------------------------------------------------------------------
let corridor = null;
if (CORR) {
  // the longest row of desert chunks (Red Rock Desert first)
  let best = null;
  for (let cy = 0; cy < CY; cy++) {
    let run = 0;
    for (let cx = 0; cx <= CX; cx++) {
      const ok = cx < CX && KIND[cy * CX + cx] === 'desert';
      if (ok) run++;
      else { if (run > (best ? best.len : 0)) best = { cy, cx0: cx - run, len: run }; run = 0; }
    }
  }
  if (!best) throw new Error('no desert');
  const len = Math.min(LEN, best.len), cx0 = best.cx0 + Math.floor((best.len - len) / 2), cy = best.cy;
  const v = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')), key = artKey(v, 'v3');
  const dir = join(CORR, 'art', key), lowS = createLowStore({ dir: join(CORR, 'artlow', 'v3') });
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'world.txt'), 'v3\n');
  log(`corridor: chunks ${cx0}..${cx0 + len - 1} on row ${cy} (${best.len} desert chunks in that row): full art ${WID} each side into ${dir}, thumbnails ${LOWW} each side`);
  let nf = 0, nl = 0;
  for (let dy = -LOWW; dy <= LOWW; dy++) for (let cx = cx0 - LOWW; cx < cx0 + len + LOWW; cx++) {
    const y = cy + dy;
    if (cx < 0 || y < 0 || cx >= CX || y >= CY) continue;
    const full = Math.abs(dy) <= WID && cx >= cx0 - WID && cx < cx0 + len + WID, file = join(dir, `q${Q}a2`, `${cx}_${y}.bin`);
    if (lowS.has(cx, y) && (!full || existsSync(file))) continue;
    const b = bake(cx, y);
    lowS.put(cx, y, b.thumb); nl++;
    if (full) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.part', b.file); renameSync(file + '.part', file); nf++; }
    if ((nl % 25) === 0) log(`  ${nl} baked`);
  }
  lowS.flush();
  corridor = { cy, cx0, len, key, from: { x: (cx0 + 0.5) * CH, y: (cy + 0.5) * CH }, to: { x: (cx0 + len - 0.5) * CH, y: (cy + 0.5) * CH }, full: nf, low: nl };
  log(`corridor: ${nf} chunks, ${nl} thumbnails; fly from ${JSON.stringify(corridor.from)} to ${JSON.stringify(corridor.to)}`);
}
if (OUT) writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), q: Q, n: N, grid: [CX, CY], count, res, total, regions, corridor }, null, 1));
log('done');
