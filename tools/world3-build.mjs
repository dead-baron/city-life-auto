// World v3, stage 2, step 4 (docs/WORLD-V3.md 8.6): the whole v3 world in one build - today's world, its land
// (shared/world3-land.js buildLand3), then generateCity(seed, { world3: true, frame, land, today }) - timed, with the
// process's peak memory, and its sizes: the whole and per place (each place's land: its districts in the land layer).
//   node --expose-gc tools/world3-build.mjs [--places metro,cedar,pelican] [--json]
// (heavy: run it under `flock /tmp/cla-heavy.lock`)
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { generateCity } = await imp('shared/map.js');
await imp('shared/world3-islands.js');   // (lets generateCity take { world3 })
const { TILE, T } = await imp('shared/constants.js');
const { FRAME_W, FRAME_H } = await imp('shared/world3.js');
const { buildLand3 } = await imp('shared/world3-land.js');
const { BIOMES } = await imp('shared/world3-skeleton.js');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const JSON_OUT = process.argv.includes('--json');
const PLACES = arg('--places', null)?.split(',') || null;
const gc = globalThis.gc || (() => {});
const mb = (b) => Math.round(b / 1048576);
const rss = () => mb(process.memoryUsage().rss);
const peak = () => Math.round(process.resourceUsage().maxRSS / 1024);

// today's world and the land of the v3 frame
export function prepare() {
  let t0 = performance.now();
  let today = generateCity(1337);
  const todayMs = Math.round(performance.now() - t0);
  t0 = performance.now();
  const land = buildLand3(today);
  const landMs = Math.round(performance.now() - t0);
  const td = { w: today.w, h: today.h, dist: today.dist, land: today.land };
  today = null; gc(); gc();
  return { land, today: td, todayMs, landMs };
}

// the frame's tiles by place (World v3b: no pieces of today's world): each biome of the mainland, the islands, the sea
export function placeOf(land) {
  const L = land.layers, W = land.w, H = land.h, N = W * H;
  const keys = [...BIOMES.map((b) => b.key), 'islands', 'sea'], ISL = BIOMES.length, SEA = ISL + 1;
  const at = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!L.land[i] && (L.water[i] === 1 || L.water[i] === 2 || !L.water[i])) { at[i] = SEA; continue; }
    at[i] = L.biome[i] ? L.biome[i] - 1 : ISL;
  }
  return { at, keys };
}

export function sizes(m, land) {
  const { at, keys } = placeOf(land);
  const W = m.w, rows = keys.map((key) => ({ key, land: 0, roadTiles: 0, edges: 0, buildings: 0, pois: 0, props: 0 }));
  for (let i = 0; i < at.length; i++) { if (!m.land[i]) continue; const r = rows[at[i]]; r.land++; if (m.tiles[i] === T.ROAD) r.roadTiles++; }
  const tileOf = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < W && ty < m.h ? at[ty * W + tx] : keys.length - 1; };
  for (const e of m.edges) { const p = e.pts[e.pts.length >> 1]; rows[tileOf(p.x, p.y)].edges++; }
  for (const b of m.buildings) rows[tileOf((b.tx + 0.5) * TILE, (b.ty + 0.5) * TILE)].buildings++;
  for (const p of m.pois) rows[tileOf(p.x, p.y)].pois++;
  for (const p of m.props) rows[tileOf(p.x, p.y)].props++;
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const prep = prepare();
  const before = rss(), peakBefore = peak();
  const t0 = performance.now();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today, places: PLACES });
  const ms = Math.round(performance.now() - t0);
  const after = rss(), peakAfter = peak();
  let landTiles = 0; for (let i = 0; i < m.land.length; i++) if (m.land[i]) landTiles++;
  const out = {
    frame: [m.w, m.h], todayMs: prep.todayMs, landMs: prep.landMs, worldMs: ms,
    memory: { rssBeforeMB: before, rssAfterMB: after, peakBeforeMB: peakBefore, peakAfterMB: peakAfter },
    totals: { land: landTiles, edges: m.edges.length, nodes: m.nodes.length, blocks: m.blocks.length, buildings: m.buildings.length, pois: m.pois.length, props: m.props.length },
    places: sizes(m, prep.land),
    world3: m.world3,
  };
  if (JSON_OUT) console.log(JSON.stringify(out, null, 1));
  else {
    console.log(`world build: ${ms} ms (today ${prep.todayMs} ms, land ${prep.landMs} ms); rss ${before} -> ${after} MB, peak ${peakBefore} -> ${peakAfter} MB`);
    console.log('totals', JSON.stringify(out.totals));
    for (const r of out.places) console.log(`${r.key.padEnd(11)} land ${String(r.land).padStart(8)}  road tiles ${String(r.roadTiles).padStart(7)}  edges ${String(r.edges).padStart(5)}  buildings ${String(r.buildings).padStart(4)}  POIs ${String(r.pois).padStart(4)}  props ${String(r.props).padStart(6)}`);
    console.log('split', m.world3?.split, 'offFrame', m.world3?.offFrame, 'cut', JSON.stringify(m.world3?.cut), 'dropped', JSON.stringify(m.world3?.dropped));
    console.log('crossings', JSON.stringify((m.world3?.crossings || []).map((c) => `${c.name} (${c.len} m${c.foot ? ', foot' : ''})`)));
    const R = m.world3?.roads || {};
    console.log('roads', JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]))));
    const km = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return (s / TILE / 1000).toFixed(2); };
    for (const r of m.rails || []) console.log(`rail ${r.name}: ${km(r.pts)} km, ${r.stations?.length ?? 0} stations, under ${r.pts.filter((p) => p.under).length}/${r.pts.length} points`);
    let br = 0; for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === T.BRIDGE) br++;
    console.log('bridge tiles', br, 'tunnels', (m.tunnels || []).length, 'rail hubs', (m.railHubs || []).length, 'level crossings', (m.rails || []).reduce((s, r) => s + (r.crossings?.length || 0), 0));
    console.log('ferries', JSON.stringify((m.world3?.ferries || []).map((f) => `${f.name}: ${(f.stops || []).map((s) => s.name + (s.built === false ? ' (not built)' : '')).join(', ')}`)));
  }
}
