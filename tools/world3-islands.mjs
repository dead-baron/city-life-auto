// World v3, stage 1, step 1 (docs/WORLD-V3.md 4.7): the island builds - generateCity(seed, { island }) for each piece of
// part 2's table (shared/world3.js ISLAND_BUILDS) - each compared with today's world on its own land away from its
// seams: the tiles, the road edges, the buildings, the POIs (by kind and place) and the props, with its build time and
// the memory it keeps. A seam is where the piece was cut from a landmass it shares today (Metro City's east shore at
// x = 1045, Westport's border with its airport and Highland Woods, Northshore's with Granite Peaks) and the roads left
// out for the skeleton (the bridges to other islands, a road over a cut): "away" is more than --margin tiles (24) from
// both. Builds today's world first (its hash must still be the stamped one), then the islands one after another in
// the same process (each build starts clean); --twice builds the first island again last and checks it is the same.
//   node --expose-gc tools/world3-islands.mjs [--json] [--twice] [--island metro,cedar] [--margin 24]
// (heavy: a world build and one per island - run it under `flock /tmp/cla-heavy.lock`)
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { generateCity, cityData } = await import(pathToFileURL(join(ROOT, 'shared/map.js')).href);
await import(pathToFileURL(join(ROOT, 'shared/world3-islands.js')).href);   // (lets generateCity take { island })
const { MAP_W, MAP_H, TILE } = await import(pathToFileURL(join(ROOT, 'shared/constants.js')).href);
const W3 = await import(pathToFileURL(join(ROOT, 'shared/world3.js')).href);
const { canonicalHash } = await import(pathToFileURL(join(ROOT, 'tools/stamp-version.mjs')).href);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const JSON_OUT = process.argv.includes('--json'), TWICE = process.argv.includes('--twice');
// --keep-links: the roads to other islands (the bridges, a road over a cut) kept as laid today, to tell what leaving
// them out changes from what the island's absent neighbours do
const KEEP_LINKS = process.argv.includes('--keep-links');
const MARGIN = +arg('--margin', 24), FAR = Math.max(MARGIN, 64);
const ISLES = (arg('--island', '') || Object.keys(W3.ISLAND_BUILDS).join(',')).split(',').filter(Boolean);
for (const k of ISLES) if (!W3.ISLAND_BUILDS[k]) throw new Error(`no island build '${k}' (${Object.keys(W3.ISLAND_BUILDS).join(', ')})`);

const gc = globalThis.gc || (() => {});
function build(opts) {
  gc(); gc(); const u0 = process.memoryUsage(), h0 = u0.heapUsed + u0.arrayBuffers, t0 = performance.now();
  let m = null, error = null;
  try { m = generateCity(1337, opts); } catch (e) { error = (e && e.stack ? e.stack : String(e)).split('\n').slice(0, 6).join('\n'); }
  const ms = performance.now() - t0;
  gc(); const u1 = process.memoryUsage();
  return { m, error, ms: Math.round(ms), keptMB: +((u1.heapUsed + u1.arrayBuffers - h0) / 1048576).toFixed(1) };
}

const today = build(null);
const T0 = today.m;
if (!T0) throw new Error(today.error);
const out = { margin: MARGIN, today: { ms: today.ms, keptMB: today.keptMB, hash: canonicalHash(cityData(T0)).slice(0, 12), stamped: JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).world }, islands: {} };
const N = MAP_W * MAP_H;
const tileIdx = (px, py) => { const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE); return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H ? ty * MAP_W + tx : -1; };
const cmp = (A, B) => { let both = 0; for (const k of A) if (B.has(k)) both++; return { today: B.size, island: A.size, same: both }; };
const eKey = (e) => { const p = e.pts[0], q = e.pts[e.pts.length - 1]; const a = `${Math.round(p.x)},${Math.round(p.y)}`, b = `${Math.round(q.x)},${Math.round(q.y)}`; return `${e.kind}|${a < b ? a + '|' + b : b + '|' + a}|${e.lvl}`; };

function compare(key, S) {
  // the island's own land (its build's land, on today's land); the seams: its land next to other land today, and
  // where the roads left out for the skeleton ran on it
  const own = new Uint8Array(N), dist = new Int16Array(N).fill(-1), q = new Int32Array(N);
  let qn = 0, ownN = 0;
  for (let i = 0; i < N; i++) if (S.land[i] && T0.land[i]) { own[i] = 1; ownN++; }
  const seed = (i) => { if (i >= 0 && dist[i] < 0) { dist[i] = 0; q[qn++] = i; } };
  for (let i = 0; i < N; i++) {
    if (!own[i]) continue;
    const x = i % MAP_W;
    for (const k of [x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1, i - MAP_W, i + MAP_W]) if (k >= 0 && k < N && T0.land[k] && !S.land[k]) { seed(i); break; }
  }
  const leftOut = S.islandBuild ? S.islandBuild.leftOut : [];
  for (const l of leftOut) for (let j = 0; j < l.on.length; j += 2) seed(l.on[j + 1] * MAP_W + l.on[j]);
  for (let h = 0; h < qn; h++) {
    const i = q[h], d = dist[i];
    if (d >= FAR) continue;
    const x = i % MAP_W;
    for (const k of [x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1, i - MAP_W, i + MAP_W]) if (k >= 0 && k < N && dist[k] < 0) { dist[k] = d + 1; q[qn++] = k; }
  }
  const away = (i) => i >= 0 && own[i] === 1 && (dist[i] < 0 || dist[i] > MARGIN);
  // the island's land tiles that differ from today's, by how far they are from a seam: up to the margin, up to FAR
  // tiles (64: the sea distance field's reach - map.js chamfer caps at 255 quarter tiles) and beyond
  const bands = { seam: [0, 0], near: [0, 0], far: [0, 0] };
  for (let i = 0; i < N; i++) {
    if (!own[i]) continue;
    const b = dist[i] >= 0 && dist[i] <= MARGIN ? bands.seam : dist[i] >= 0 ? bands.near : bands.far;
    b[0]++; if (S.tiles[i] !== T0.tiles[i]) b[1]++;
  }
  const awayPx = (px, py) => away(tileIdx(px, py));
  let awayN = 0;
  const layers = {};
  const LAYERS = ['tiles', 'dist', 'zone', 'reserve', 'roadRank', 'distSea', 'river', 'deck'];
  for (const k of LAYERS) layers[k] = 0;
  const byDist = {};
  for (let i = 0; i < N; i++) {
    if (!away(i)) continue;
    awayN++;
    for (const k of LAYERS) if (S[k] && T0[k] && S[k][i] !== T0[k][i]) layers[k]++;
    if (S.tiles[i] !== T0.tiles[i]) byDist[T0.dist[i]] = (byDist[T0.dist[i]] || 0) + 1;
  }
  const r = { landTiles: ownN, awayTiles: awayN, tilesSame: awayN - layers.tiles, layers, tileDiffByDistrict: byDist, bands };
  const eSet = (m) => new Set(m.edges.filter((e) => awayPx(e.pts[0].x, e.pts[0].y) && awayPx(e.pts[e.pts.length - 1].x, e.pts[e.pts.length - 1].y)).map(eKey));
  r.roads = cmp(eSet(S), eSet(T0));
  const ownEdge = (e) => { const a = tileIdx(e.pts[0].x, e.pts[0].y), b = tileIdx(e.pts[e.pts.length - 1].x, e.pts[e.pts.length - 1].y); return a >= 0 && b >= 0 && own[a] && own[b]; };
  r.roadsAll = cmp(new Set(S.edges.filter(ownEdge).map(eKey)), new Set(T0.edges.filter(ownEdge).map(eKey)));
  r.roads.offIsland = S.edges.filter((e) => !ownEdge(e)).length;
  const bSet = (m) => new Set(m.buildings.filter((b) => away(b.ty * MAP_W + b.tx)).map((b) => `${b.kind}|${b.tx},${b.ty},${b.tw},${b.th}`));
  r.buildings = cmp(bSet(S), bSet(T0));
  const pSet = (m, named) => new Set(m.pois.filter((p) => awayPx(p.x, p.y)).map((p) => `${p.kind}|${Math.round(p.x)},${Math.round(p.y)}${named ? '|' + (p.label || '') : ''}`));
  r.pois = cmp(pSet(S), pSet(T0));
  r.poisNamed = cmp(pSet(S, true), pSet(T0, true));
  const miss = {};
  { const sP = pSet(S); for (const k of pSet(T0)) if (!sP.has(k)) { const kind = k.split('|')[0]; miss[kind] = (miss[kind] || 0) + 1; } }
  r.pois.missingByKind = miss;
  const prSet = (m) => { const s = new Set(); for (const p of m.props) if (awayPx(p.x, p.y)) s.add(`${p.t}|${Math.round(p.x)},${Math.round(p.y)}`); return s; };
  r.props = cmp(prSet(S), prSet(T0));
  r.leftOut = leftOut.map((l) => `${l.name || '(unnamed)'} (${l.kind})`);
  r.overSeam = S.islandBuild ? S.islandBuild.overSeam : [];
  r.noRoom = S.islandBuild ? S.islandBuild.noRoom : [];
  r.otherLines = S.islandBuild ? S.islandBuild.otherLines : 0;
  r.rail = { points: S.rail ? S.rail.pts.length : 0, stations: (S.rail?.stations || []).length, stationsOnIsland: (S.rail?.stations || []).filter((s) => { const i = tileIdx(s.x, s.y); return i >= 0 && own[i]; }).length };
  r.regions = W3.placedRegions(W3.PLACEMENTS[key]).map(W3.regionKey);
  return r;
}

let firstHash = null;
for (const key of ISLES) {
  const b = build({ island: key, keepLinks: KEEP_LINKS });
  const r = { ms: b.ms, keptMB: b.keptMB, error: b.error };
  if (b.m) {
    Object.assign(r, compare(key, b.m));
    if (TWICE && key === ISLES[0]) firstHash = canonicalHash(cityData(b.m));
  }
  out.islands[key] = r;
}
if (TWICE && firstHash) { const b = build({ island: ISLES[0], keepLinks: KEEP_LINKS }); out.twice = { island: ISLES[0], same: !!b.m && canonicalHash(cityData(b.m)) === firstHash }; }

if (JSON_OUT) console.log(JSON.stringify(out));
else {
  const pc = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '-');
  console.log(`today: ${out.today.ms} ms, ${out.today.keptMB} MB kept, hash ${out.today.hash} (stamped ${out.today.stamped})${out.twice ? `; ${out.twice.island} built twice the same: ${out.twice.same}` : ''}`);
  console.log(`(on each island's own land more than ${MARGIN} tiles from its seams)`);
  console.log('| island | build | kept | land tiles | away | tiles same | road edges | buildings | POIs (kind, place) | props | left out |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [k, r] of Object.entries(out.islands)) {
    if (r.error) { console.log(`| ${k} | ${r.ms} ms | - | error: ${r.error.split('\n')[0]} |`); continue; }
    console.log(`| ${k} | ${(r.ms / 1000).toFixed(1)} s | ${r.keptMB} MB | ${r.landTiles} | ${r.awayTiles} | ${pc(r.tilesSame, r.awayTiles)} | ${r.roads.same}/${r.roads.today} (+${r.roads.island - r.roads.same}) | ${r.buildings.same}/${r.buildings.today} | ${r.pois.same}/${r.pois.today} | ${r.props.same}/${r.props.today} | ${r.leftOut.length} |`);
  }
  for (const [k, r] of Object.entries(out.islands)) if (!r.error) console.log(`${k}: left out ${r.leftOut.join(', ') || 'nothing'}; kept over a seam: ${r.overSeam.join(', ') || 'nothing'}; no lot on the island for: ${r.noRoom.join(', ') || 'none'}; tiles differing by distance from a seam ${JSON.stringify(r.bands)}; layers differing (away): ${JSON.stringify(r.layers)}; all own land: roads ${r.roadsAll.same}/${r.roadsAll.today}; POIs missing ${JSON.stringify(r.pois.missingByKind)}; rail ${JSON.stringify(r.rail)}; regions ${r.regions.join(' ')}`);
}
