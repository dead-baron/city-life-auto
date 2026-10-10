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
import { assembleCity, regionKeys } from '../shared/regionpack.js';
import { MAP_W, MAP_H } from '../shared/constants.js';

const FETCH_MS = 15000;   // the index and every region, all of it, or the city is built here

// the city from the server's region files, or null (no server, a miss, a bad file, too slow, no DecompressionStream)
export async function fetchCity(base, key, seed, { fetchFn = globalThis.fetch, ms = FETCH_MS } = {}) {
  const world = String(key || '').split(':')[0];
  if (!base || !/^[0-9a-f]{6,40}$/.test(world) || typeof fetchFn !== 'function' || typeof DecompressionStream === 'undefined') return null;
  const url = `${base}${world}/${seed >>> 0}/`, ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const get = async (name) => {
    const r = await fetchFn(url + name, ctl ? { signal: ctl.signal } : undefined);
    if (!r.ok || !r.body) throw new Error(`${name}: ${r.status}`);
    return new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  };
  let timer = null;
  try {
    const all = Promise.all([get('index.bin'), ...regionKeys(MAP_W, MAP_H).map((k) => get(`${k}.bin`))]);
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

// which city: { data, from }
export async function cityFor({ seed, key, base }, { read = readWorld, fetchFn, build = buildCity } = {}) {
  let data = key ? await read(key) : null, from = 'cache';
  if (!data && key && base) { data = await fetchCity(base, key, seed, fetchFn ? { fetchFn } : undefined); from = 'served'; }
  if (!data) { from = 'built'; data = await build(seed); }
  return { data, from };
}

if (typeof self !== 'undefined' && typeof window === 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = async (e) => {
    const { seed, key, keep } = e.data || {};
    const t0 = performance.now();
    try {
      const { data, from } = await cityFor(e.data || {});
      self.postMessage({ ok: true, seed, key, from, ms: performance.now() - t0, data });
      if (from !== 'cache' && key && keep) self.postMessage({ stored: await writeWorld(key, data) });
      else self.postMessage({ stored: false });
    } catch (err) {
      self.postMessage({ ok: false, error: String((err && err.stack) || err) });
    }
  };
}
