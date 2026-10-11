// World v3's whole world on the server (CLA_WORLD=v3: server/config.js; docs/WORLD-V3.md 8.6 and 8.9): today's world
// first (the v3 build reads its districts and coast), then the land of the v3 frame (shared/world3-land.js), then the
// world build - generateCity(seed, { world3: true, frame, land, today }) - one CityMap of the 5040 x 4032 frame. The
// generator's v3 modules are loaded only here, so a server running today's world never loads them.
import { performance } from 'node:perf_hooks';

const mb = (b) => Math.round(b / 1048576);

// -> { map, ms: { today, land, world, total }, rssMB, peakMB }
export async function buildWorld3(seed, { log = console.log } = {}) {
  const { generateCity } = await import('../shared/map.js');
  await import('../shared/world3-islands.js');   // (registers the world build with generateCity: { world3 })
  const { FRAME_W, FRAME_H } = await import('../shared/world3.js');
  const { buildLand3 } = await import('../shared/world3-land.js');
  const gc = typeof globalThis.gc === 'function' ? globalThis.gc : () => {};
  const t0 = performance.now();
  let today = generateCity(seed);
  const t1 = performance.now();
  let land = buildLand3(today);
  const t2 = performance.now();
  const td = { w: today.w, h: today.h, dist: today.dist, land: today.land };   // (all the world build reads of today's)
  today = null; gc();
  const map = generateCity(seed, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land, today: td });
  land = null; gc();
  const t3 = performance.now();
  const ms = { today: Math.round(t1 - t0), land: Math.round(t2 - t1), world: Math.round(t3 - t2), total: Math.round(t3 - t0) };
  const rssMB = mb(process.memoryUsage().rss), peakMB = Math.round(process.resourceUsage().maxRSS / 1024);
  log(`[world] World v3 (CLA_WORLD=v3): ${map.w} x ${map.h} tiles built in ${(ms.total / 1000).toFixed(1)} s (today's ${ms.today} ms, the land ${ms.land} ms, the world ${ms.world} ms); memory ${rssMB} MB, peak ${peakMB} MB`);
  return { map, ms, rssMB, peakMB };
}
