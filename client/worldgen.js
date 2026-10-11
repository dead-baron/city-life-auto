// The city, got off the page's thread (client/boot.js starts this worker while the page itself loads and connects).
// The city this browser kept (worldcache.js) if it has it; else the region files the game server cut from the city it
// built (server/worldcdn.js, shared/regionpack.js: about 2 MB, downloaded and assembled in well under the build's
// time); else built here from the seed, as before (the generator is loaded only then: seconds on a phone). A city
// served or built here is kept for the next visit, until a build changes the world.
//
// in   { seed, key, keep, base }   key: version.json's world hash and the seed (null: don't use the cache); keep: this
//                                  page runs the build that hash belongs to, so a city got here may be kept under it;
//                                  base: the game server's /world/ address (null: offline, or not asked for)
// out  { ok: true, seed, key, from: 'cache' | 'served' | 'built', ms, data }   data: the plain city (shared/map.js
//      cityData); then { stored: true | false } once a city got here is kept (or couldn't be)
//      { ok: false, error }
import { readWorld, writeWorld } from './worldcache.js';
import { assembleCity, readIndex, regionKeys, PACK_VERSION } from '../shared/regionpack.js';   // (World v3's window: client/worldwindow.js, loaded only then)
import { MAP_W, MAP_H } from '../shared/constants.js';   // (today's frame: its regions are asked for before the index says the world's)

const FETCH_MS = 15000;   // the index and every region, all of it, or the city is built here

// the city from the server's region files, or null (no server, a miss, a bad file, too slow, no DecompressionStream)
// (wait: a server still writing its files - a 404 'packing' - is asked again every 2 s until the time is up: World v3's)
export async function fetchCity(base, key, seed, { fetchFn = globalThis.fetch, ms = FETCH_MS, wait = false } = {}) {
  const world = String(key || '').split(':')[0];
  if (!base || !/^[0-9a-f]{6,40}(-v3)?$/.test(world) || typeof fetchFn !== 'function' || typeof DecompressionStream === 'undefined') return null;
  const url = `${base}${world}/${seed >>> 0}/`, ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const get = async (name) => {
    for (;;) {
      const r = await fetchFn(`${url}${name}?v=${PACK_VERSION}`, ctl ? { signal: ctl.signal } : undefined);   // (the format in the URL: a new one isn't read from the HTTP cache)
      if (wait && r.status === 404 && r.headers && r.headers.get('x-world-miss') === 'packing' && !(ctl && ctl.signal.aborted)) { await new Promise((res) => setTimeout(res, 2000)); continue; }
      if (!r.ok || !r.body) throw new Error(`${name}: ${r.status}`);
      return new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    }
  };
  let timer = null;
  try {
    // (the regions of today's frame asked for with the index, not waiting for it; the world's frame is the index's: the
    // regions it lists that weren't asked for yet are asked for once it's read, and only its regions are assembled)
    const early = new Map(regionKeys(MAP_W, MAP_H).map((k) => [k, get(`${k}.bin`)]));
    for (const p of early.values()) p.catch(() => {});
    const all = get('index.bin').then(async (index) => [index, ...(await Promise.all(readIndex(index).regions.map((k) => early.get(k) || get(`${k}.bin`))))]);
    all.catch(() => {});
    const files = await Promise.race([all, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('too slow')), ms); })]);
    const data = assembleCity(files[0], files.slice(1));
    if ((data.seed >>> 0) !== (seed >>> 0)) throw new Error('another seed');
    return data;
  } catch (e) {
    if (ctl) ctl.abort();
    console.warn('[city] not from the server - building it:', (e && e.message) || e);
    return null;
  } finally { clearTimeout(timer); }
}

const buildCity = async (seed) => { const { generateCity, cityData } = await import('../shared/map.js'); return cityData(generateCity(seed)); };

// World v3's world (a server run with CLA_WORLD=v3: server/world3.js; its key is the world's hash with '-v3'): only
// ever downloaded - 80 region files, so a longer wait - never built here (the generator would build today's)
const isV3 = (key) => /^[0-9a-f]{6,40}-v3:/.test(String(key || ''));

// which city: { data, from }
export async function cityFor({ seed, key, base }, { read = readWorld, fetchFn, build = buildCity } = {}) {
  let data = key ? await read(key) : null, from = 'cache';
  if (!data && key && base) { data = await fetchCity(base, key, seed, { ...(fetchFn ? { fetchFn } : null), ...(isV3(key) ? { ms: 8 * FETCH_MS, wait: true } : null) }); from = 'served'; }
  if (!data && isV3(key)) throw new Error('World v3\'s world could not be downloaded from the game server');
  if (!data) { from = 'built'; data = await build(seed); }
  return { data, from };
}
// a v3 city's per-tile layers handed to the page, not copied (hundreds of MB; it isn't kept here: boot.js)
const layersOf = (data, key) => (isV3(key) ? [...new Set(Object.values(data).filter((v) => ArrayBuffer.isView(v)).map((v) => v.buffer))] : []);

// ---- World v3's window (docs/WORLD-V3.md 8.12): the index and the 3 x 3 regions round the player, never the whole
// world (0.5 GB: a phone can't). client/worldwindow.js keeps the regions' files and says when the window moves; this
// worker assembles each window (shared/regionpack.js assembleCity with opts.window) and hands it to the page.
// in  { at: [tx, ty] }   the player's tile, every few hundred ms (client/main.js)
// out { window: true, data, win: { keys, rect }, ms }   the window to swap in; { windowError } (asked again next time)
const unzip = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
export async function fetchWindow(base, key, seed, at, { fetchFn = globalThis.fetch, ms = 8 * FETCH_MS } = {}) {
  const world = String(key || '').split(':')[0];
  if (!base || !/^[0-9a-f]{6,40}(-v3)?$/.test(world) || typeof fetchFn !== 'function' || typeof DecompressionStream === 'undefined') return null;
  const url = `${base}${world}/${seed >>> 0}/`, until = Date.now() + ms;
  const getGz = async (name) => {   // (the file as it came: gzipped - what the window keeps)
    for (;;) {
      const r = await fetchFn(`${url}${name}?v=${PACK_VERSION}`);
      if (r.status === 404 && r.headers && r.headers.get('x-world-miss') === 'packing' && Date.now() < until) { await new Promise((res) => setTimeout(res, 2000)); continue; }
      if (!r.ok) throw new Error(`${name}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    }
  };
  const { WindowKeeper } = await import('./worldwindow.js');
  const index = await unzip(await getGz('index.bin'));
  const { frame } = readIndex(index);
  const keeper = new WindowKeeper({ frame, fetchRegion: (k) => getGz(`${k}.bin`), open: unzip });
  const p = Array.isArray(at) && Number.isFinite(at[0]) && Number.isFinite(at[1]) ? at : [frame[0] / 2, frame[1] / 2];
  const win = await keeper.start(p[0], p[1]);
  const data = await keeper.assemble(index, win);
  if ((data.seed >>> 0) !== (seed >>> 0)) throw new Error('another seed');
  return { data, keeper, index, win: { keys: win.keys, rect: win.rect } };
}
let WIN = null, moving = false;
async function windowAt(tx, ty) {
  if (!WIN || moving) return;
  const nw = WIN.keeper.want(tx, ty);
  if (!nw) return;
  moving = true;
  const t0 = performance.now();
  try {
    const data = await WIN.keeper.assemble(WIN.index, nw);
    WIN.keeper.moved(nw);
    self.postMessage({ window: true, data, win: { keys: nw.keys, rect: nw.rect }, ms: performance.now() - t0 }, layersOf(data, WIN.key));
  } catch (err) {
    self.postMessage({ windowError: String((err && err.message) || err) });
  } finally { moving = false; }
}

if (typeof self !== 'undefined' && typeof window === 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = async (e) => {
    const { seed, key, keep, base, at } = e.data || {};
    if (Array.isArray(e.data && e.data.where)) { windowAt(e.data.where[0], e.data.where[1]); return; }
    const t0 = performance.now();
    // (World v3 from the server: its window, not the whole world - ?wholeworld asks for all of it, as before)
    if (isV3(key) && base && e.data.window !== false) {
      try {
        const w = await fetchWindow(base, key, seed, at);
        if (!w) throw new Error('World v3\'s world could not be downloaded from the game server');
        WIN = { keeper: w.keeper, index: w.index, key };
        self.postMessage({ ok: true, seed, key, from: 'served', ms: performance.now() - t0, data: w.data, win: w.win, alive: true }, layersOf(w.data, key));
      } catch (err) {
        self.postMessage({ ok: false, error: String((err && err.stack) || err) });
      }
      return;
    }
    try {
      const { data, from } = await cityFor(e.data || {});
      self.postMessage({ ok: true, seed, key, from, ms: performance.now() - t0, data }, layersOf(data, key));
      if (from !== 'cache' && key && keep) self.postMessage({ stored: await writeWorld(key, data) });
      else self.postMessage({ stored: false });
    } catch (err) {
      self.postMessage({ ok: false, error: String((err && err.stack) || err) });
    }
  };
}
