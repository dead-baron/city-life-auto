// The city, built off the page's thread (client/boot.js starts this worker while the page itself loads and connects).
// Building it from the seed is the biggest single thing a phone does to get into the game - seconds - and on the
// page's own thread it froze the title screen meanwhile. Here it runs alongside everything else, and the city is
// kept in the browser (worldcache.js) so the next visit only reads it back, until a build changes the world.
//
// in   { seed, key, keep }   key: version.json's world hash and the seed (null: don't use the cache); keep: this
//                            page runs the build that hash belongs to, so a city built here may be kept under it
// out  { ok: true, seed, key, from: 'cache' | 'built', ms, data }   data: the plain city (shared/map.js cityData);
//      then { stored: true | false } once a city built here is kept (or couldn't be)
//      { ok: false, error }
import { generateCity, cityData } from '../shared/map.js';
import { readWorld, writeWorld } from './worldcache.js';

self.onmessage = async (e) => {
  const { seed, key, keep } = e.data || {};
  const t0 = performance.now();
  try {
    let data = key ? await readWorld(key) : null, from = 'cache';
    if (!data) { from = 'built'; data = cityData(generateCity(seed)); }
    self.postMessage({ ok: true, seed, key, from, ms: performance.now() - t0, data });
    if (from === 'built' && key && keep) self.postMessage({ stored: await writeWorld(key, data) });
    else self.postMessage({ stored: false });
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.stack) || err) });
  }
};
