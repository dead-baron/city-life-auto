// World v3, stage 2, step 2 (docs/WORLD-V3.md 8.4): an island built at its gulf place - generateCity(seed, { island,
// frame, place: { at, scale, from } }) - against the same island built in today's frame (4.7's island build), moved.
// Step A (scale 1, the proof): every position the build takes from today's world goes through the placement, so the
// placed build is the island build moved by the offset at - from; the tool counts what is: the tiles and the per-tile
// layers on the island's land, the road edges (kind, ends, level), the buildings (kind and lot), the POIs (kind and
// place), the props - each moved back by the offset - and lists what isn't, by kind and where.
//   node --expose-gc tools/world3-place.mjs [--island metro] [--frame 5040,4032] [--scale 1] [--at 1850,2050] [--json]
// (heavy: two builds, one in the v3 frame - run it under `flock /tmp/cla-heavy.lock`)
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { generateCity } = await import(pathToFileURL(join(ROOT, 'shared/map.js')).href);
await import(pathToFileURL(join(ROOT, 'shared/world3-islands.js')).href);   // (lets generateCity take { island })
const { TILE } = await import(pathToFileURL(join(ROOT, 'shared/constants.js')).href);
const SK = await import(pathToFileURL(join(ROOT, 'shared/world3-skeleton.js')).href);
const W3 = await import(pathToFileURL(join(ROOT, 'shared/world3.js')).href);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const JSON_OUT = process.argv.includes('--json');
const KEY = arg('--island', 'metro');
const pic = (SK.ISLANDS.find((I) => I.key === KEY) || SK.PIECES.find((I) => I.key === KEY) || {}).picture;
if (!pic) throw new Error(`no picture for '${KEY}' in the skeleton`);
const [FW, FH] = arg('--frame', `${W3.FRAME_W},${W3.FRAME_H}`).split(',').map(Number);
const scale = +arg('--scale', '1');
const at = arg('--at', pic.at.join(',')).split(',').map(Number);
const place = { at, scale, from: pic.from };

const gc = globalThis.gc || (() => {});
function build(opts) {
  gc(); gc(); const t0 = performance.now();
  const m = generateCity(1337, opts);
  return { m, ms: Math.round(performance.now() - t0) };
}

export function comparePlaced(R, S, dx, dy) {
  // R: the island built in today's frame; S: built at its place, offset dx, dy (tiles). On R's land.
  const W = R.w, H = R.h, D = dx * TILE, E = dy * TILE;
  const sIdx = (x, y) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < S.w && Y < S.h ? Y * S.w + X : -1; };
  const LAYERS = ['land', 'tiles', 'dist', 'zone', 'reserve', 'roadRank', 'distSea', 'river', 'deck', 'bld'];
  const layers = {}; for (const k of LAYERS) layers[k] = 0;
  let land = 0;
  const where = new Map();   // (the tiles that differ, by district)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!R.land[i]) continue;
    land++;
    const j = sIdx(x, y);
    for (const k of LAYERS) if (!R[k] || !S[k] || j < 0 || R[k][i] !== S[k][j]) layers[k]++;
    if (j < 0 || R.tiles[i] !== S.tiles[j]) where.set(R.dist[i], (where.get(R.dist[i]) || 0) + 1);
  }
  // (S's land off R's: the placement moved land it shouldn't have)
  let extra = 0;
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { if (!S.land[y * S.w + x]) continue; const X = x - dx, Y = y - dy; if (X < 0 || Y < 0 || X >= W || Y >= H || !R.land[Y * W + X]) extra++; }
  // (the lists: the items on the island's own land - the island build lays some off it, over today's sea: the other
  // islands' airports, the railway's loop - which a placed build leaves where they were)
  const onR = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && !!R.land[ty * W + tx];
  const onPx = (x, y) => onR(Math.floor(x / TILE), Math.floor(y / TILE));
  const onS = (x, y) => onPx(x - D, y - E);
  const cmp = (A, B) => { let same = 0; const miss = []; for (const k of B) if (A.has(k)) same++; else if (miss.length < 8) miss.push(k); return { today: B.size, placed: A.size, same, missing: miss }; };
  const pt = (x, y) => `${Math.round(x)},${Math.round(y)}`;
  const eKey = (e, ox, oy) => { const p = e.pts[0], q = e.pts[e.pts.length - 1]; const a = pt(p.x - ox, p.y - oy), b = pt(q.x - ox, q.y - oy); return `${e.kind}|${a < b ? a + '|' + b : b + '|' + a}|${e.level || 0}`; };
  const r = { landTiles: land, extraLand: extra, layers, tileDiffByDistrict: Object.fromEntries([...where].sort((a, b) => b[1] - a[1])) };
  const ends = (e, ox, oy) => onPx(e.pts[0].x - ox, e.pts[0].y - oy) && onPx(e.pts[e.pts.length - 1].x - ox, e.pts[e.pts.length - 1].y - oy);
  const sets = {
    roads: [new Set(S.edges.filter((e) => ends(e, D, E)).map((e) => eKey(e, D, E))), new Set(R.edges.filter((e) => ends(e, 0, 0)).map((e) => eKey(e, 0, 0)))],
    buildings: [new Set(S.buildings.filter((b) => onR(b.tx - dx, b.ty - dy)).map((b) => `${b.kind}|${b.tx - dx},${b.ty - dy},${b.tw},${b.th}`)), new Set(R.buildings.filter((b) => onR(b.tx, b.ty)).map((b) => `${b.kind}|${b.tx},${b.ty},${b.tw},${b.th}`))],
    pois: [new Set(S.pois.filter((p) => onS(p.x, p.y)).map((p) => `${p.kind}|${pt(p.x - D, p.y - E)}`)), new Set(R.pois.filter((p) => onPx(p.x, p.y)).map((p) => `${p.kind}|${pt(p.x, p.y)}`))],
    props: [new Set(S.props.filter((p) => onS(p.x, p.y)).map((p) => `${p.t}|${pt(p.x - D, p.y - E)}`)), new Set(R.props.filter((p) => onPx(p.x, p.y)).map((p) => `${p.t}|${pt(p.x, p.y)}`))],
  };
  const missKinds = (A, B) => { const out = {}; for (const k of B) if (!A.has(k)) { const t = k.split('|')[0]; out[t] = (out[t] || 0) + 1; } return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 12)); };
  for (const [k, [A, B]] of Object.entries(sets)) { r[k] = cmp(A, B); r[k].missingByKind = missKinds(A, B); }
  return r;
}

// Step B: the place built on the v3 frame's land (shared/world3-land.js buildLand3) at its gulf size - sanity checks
// against the island built in today's frame (R): areas, districts' ground and streets, POIs by kind, the canal's
// bridges, the road network's pieces, the numbers.
export function landReport(R, S, L) {
  const T = { ROAD: null };
  const N = S.w * S.h, W = S.w;
  const out = {};
  let land = 0;
  for (let i = 0; i < N; i++) if (S.land[i]) land++;
  let rland = 0;
  for (let i = 0; i < R.w * R.h; i++) if (R.land[i]) rland++;
  out.area = { placed: land, today: rland, ratio: +(land / rland).toFixed(3) };
  // districts: their tiles, road tiles (roadRank > 0), buildings
  const dd = new Map();
  const D = (d) => { let e = dd.get(d); if (!e) dd.set(d, (e = { tiles: 0, road: 0, buildings: 0, todayTiles: 0, todayBuildings: 0 })); return e; };
  for (let i = 0; i < N; i++) if (S.land[i]) { const e = D(S.dist[i]); e.tiles++; if (S.roadRank && S.roadRank[i]) e.road++; }
  for (let i = 0; i < R.w * R.h; i++) if (R.land[i]) D(R.dist[i]).todayTiles++;
  const onS = (tx, ty) => tx >= 0 && ty >= 0 && tx < S.w && ty < S.h && !!S.land[ty * W + tx];
  const onR = (tx, ty) => tx >= 0 && ty >= 0 && tx < R.w && ty < R.h && !!R.land[ty * R.w + tx];
  for (const b of S.buildings) if (onS(b.tx, b.ty)) D(S.dist[b.ty * W + b.tx]).buildings++;
  for (const b of R.buildings) if (onR(b.tx, b.ty)) D(R.dist[b.ty * R.w + b.tx]).todayBuildings++;
  out.districts = Object.fromEntries([...dd].sort((a, b) => a[0] - b[0]));
  // POIs by kind (on the land)
  const kinds = (m, on) => { const k = {}; for (const p of m.pois) if (on(Math.floor(p.x / TILE), Math.floor(p.y / TILE))) k[p.kind] = (k[p.kind] || 0) + 1; return k; };
  const pk = kinds(S, onS), rk = kinds(R, onR);
  out.pois = Object.fromEntries([...new Set([...Object.keys(rk), ...Object.keys(pk)])].sort().map((k) => [k, [pk[k] || 0, rk[k] || 0]]));
  // the canal's bridges: edges with a point over the canal (water layer 5)
  const canal = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < S.w && ty < S.h && L.water[ty * W + tx] === 5; };
  const over = (e) => { for (let k = 0; k + 1 < e.pts.length; k++) { const a = e.pts[k], b = e.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16)); for (let j = 0; j <= n; j++) if (canal(a.x + (b.x - a.x) * j / n, a.y + (b.y - a.y) * j / n)) return true; } return false; };
  const bridges = S.edges.filter(over);
  out.canalBridges = bridges.map((e) => `${e.name || '(unnamed)'} (${e.kind})`);
  // the road network: pieces of the graph (union-find over the edges whose ends are on the land)
  const par = new Map(); const f = (a) => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); } return a; };
  const key = (q) => `${Math.round(q.x)},${Math.round(q.y)}`;
  const own = (q) => onS(Math.floor(q.x / TILE), Math.floor(q.y / TILE)) || canal(q.x, q.y);
  let edges = 0;
  for (const e of S.edges) {
    const a = e.pts[0], b = e.pts[e.pts.length - 1];
    if (!own(a) || !own(b)) continue;
    edges++;
    const ka = key(a), kb = key(b);
    if (!par.has(ka)) par.set(ka, ka); if (!par.has(kb)) par.set(kb, kb);
    par.set(f(ka), f(kb));
  }
  // (the pieces: the game's own graph - its junctions joined by its edges, the bridges' middles over the inlet's sea
  // too, which the union-find above leaves out - H21)
  const cn = new Int32Array(S.nodes.length).fill(-1), sizes = [];
  for (const n of S.nodes) {
    if (cn[n.id] >= 0) continue;
    const st = [n.id]; cn[n.id] = sizes.length; let k = 0;
    while (st.length) { const a = st.pop(); k++; for (const id of S.nodes[a].edges) for (const b of [S.edges[id].a, S.edges[id].b]) if (cn[b] < 0) { cn[b] = sizes.length; st.push(b); } }
    sizes.push(k);
  }
  out.network = { edges, pieces: sizes.sort((a, b) => b - a).slice(0, 8), count: sizes.length };
  const rEdges = R.edges.filter((e) => onR(Math.floor(e.pts[0].x / TILE), Math.floor(e.pts[0].y / TILE))).length;
  out.numbers = {
    roadEdges: [edges, rEdges], blocks: [S.blocks.filter((b) => onS(b.x, b.y)).length, R.blocks.filter((b) => onR(b.x, b.y)).length],
    buildings: [S.buildings.filter((b) => onS(b.tx, b.ty)).length, R.buildings.filter((b) => onR(b.tx, b.ty)).length],
    pois: [Object.values(pk).reduce((a, b) => a + b, 0), Object.values(rk).reduce((a, b) => a + b, 0)],
    props: [S.props.filter((p) => onS(Math.floor(p.x / TILE), Math.floor(p.y / TILE))).length, R.props.filter((p) => onR(Math.floor(p.x / TILE), Math.floor(p.y / TILE))).length],
  };
  out.noRoom = S.islandBuild ? S.islandBuild.noRoom : [];
  out.leftOut = S.islandBuild ? S.islandBuild.leftOut.map((l) => `${l.name || '(unnamed)'} (${l.kind})`) : [];
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes('--land')) {
  // (Step B: node --expose-gc tools/world3-place.mjs --land [--scale 1.15] - the v3 frame, on buildLand3's land)
  const { buildLand3 } = await import(pathToFileURL(join(ROOT, 'shared/world3-land.js')).href);
  let world = build(null).m;
  const L = buildLand3(world);
  world = null; gc(); gc();
  const ref = build({ island: KEY });
  const sc = +arg('--scale', String(pic.scale));
  const placed = build({ island: KEY, frame: { w: L.w, h: L.h }, place: { at: pic.at, scale: sc, from: pic.from }, land: L });
  const r = landReport(ref.m, placed.m, L.layers);
  if (JSON_OUT) console.log(JSON.stringify({ island: KEY, scale: sc, ms: placed.ms, ...r }));
  else {
    console.log(`${KEY} at [${pic.at}] scale ${sc} on the v3 land (${L.w} x ${L.h}): built in ${placed.ms} ms (today's frame ${ref.ms} ms)`);
    console.log(`area: ${r.area.placed} tiles against today's ${r.area.today} (x${r.area.ratio})`);
    console.log('districts (id: tiles / road tiles / buildings; today tiles / buildings):');
    for (const [d, e] of Object.entries(r.districts)) console.log(`  ${d}: ${e.tiles} / ${e.road} / ${e.buildings}; today ${e.todayTiles} / ${e.todayBuildings}`);
    console.log(`POIs by kind [placed, today]: ${JSON.stringify(r.pois)}`);
    console.log(`canal bridges (${r.canalBridges.length} edges): ${[...new Set(r.canalBridges)].join(', ')}`);
    console.log(`road network: ${r.network.edges} edges in ${r.network.count} pieces (largest: ${r.network.pieces.join(', ')})`);
    console.log(`numbers [placed, today]: ${JSON.stringify(r.numbers)}`);
    console.log(`no lot for: ${r.noRoom.join(', ') || 'none'}; left out: ${r.leftOut.join(', ') || 'none'}`);
  }
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ref = build({ island: KEY });
  const placed = build({ island: KEY, frame: { w: FW, h: FH }, place });
  const dx = at[0] - pic.from[0], dy = at[1] - pic.from[1];
  const out = { island: KEY, place, frame: [FW, FH], ms: { today: ref.ms, placed: placed.ms } };
  if (scale === 1) Object.assign(out, comparePlaced(ref.m, placed.m, dx, dy));
  if (JSON_OUT) console.log(JSON.stringify(out));
  else {
    const pc = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '-');
    console.log(`${KEY} at [${at}] scale ${scale} in ${FW} x ${FH}: built in ${placed.ms} ms (in today's frame ${ref.ms} ms)`);
    if (scale === 1) {
      const r = out;
      console.log(`land ${r.landTiles} tiles (${r.extraLand} placed off it); per-tile layers differing: ${Object.entries(r.layers).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      console.log(`tiles as today's: ${pc(r.landTiles - r.layers.tiles, r.landTiles)}; differing by district: ${JSON.stringify(r.tileDiffByDistrict)}`);
      for (const k of ['roads', 'buildings', 'pois', 'props']) console.log(`${k}: ${r[k].same} of ${r[k].today} (${pc(r[k].same, r[k].today)}), placed ${r[k].placed}; missing by kind ${JSON.stringify(r[k].missingByKind || {})}; e.g. ${r[k].missing.slice(0, 4).join(' ; ')}`);
    }
  }
}
