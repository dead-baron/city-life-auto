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
const { worldPieces } = await imp('shared/world3-world.js');

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

// the frame's tiles by place: each gulf piece's districts (Port Westport's 26 is Westport's), the small islands by their
// placed rectangle, the rest of the land the mainland
export function placeOf(land) {
  const L = land.layers, W = land.w, H = land.h, N = W * H;
  const pieces = worldPieces(), keys = pieces.map((p) => p.key).concat(['mainland', 'sea']);
  const MAIN = pieces.length, SEA = MAIN + 1;
  const byDist = new Int16Array(256).fill(-1);
  for (const p of pieces) if (p.ids) for (const d of p.ids) byDist[d] = p.k;
  byDist[26] = pieces.find((p) => p.key === 'westport').k;
  const small = pieces.filter((p) => !p.ids);
  const at = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!L.land[i] && !L.water[i]) { at[i] = SEA; continue; }
    if (!L.land[i] && (L.water[i] === 1 || L.water[i] === 2)) { at[i] = SEA; continue; }
    const d = L.dist[i], k = byDist[d];
    if (k >= 0) { at[i] = k; continue; }
    const x = i % W, y = (i / W) | 0;
    const p = d < 47 ? small.find((q) => x >= q.rect[0] + q.dx && y >= q.rect[1] + q.dy && x < q.rect[2] + q.dx && y < q.rect[3] + q.dy) : null;
    at[i] = p ? p.k : MAIN;
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
  }
}
