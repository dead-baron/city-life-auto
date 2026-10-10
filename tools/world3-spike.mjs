// World v3, stage 1's first spike (docs/WORLD-V3.md 4.6): generate Metro City (with Southbank and Pelican Key) alone -
// the rest of the world's land left as sea - place it in its v3 rectangle (shared/world3.js PLACEMENTS.metro) and
// compare it tile for tile, road for road, lot for lot and POI for POI with today's world. Measures the time and the
// memory one island's build takes. Runs the spike first (a fresh process: generateCity keeps a little module state),
// then today's world, whose hash must still be the stamped one (version.json `world`).
//   node --expose-gc tools/world3-spike.mjs [--json] [--twice] [--with-drycreek] [--spike-only]
// (heavy: two or three world builds - run it under `flock /tmp/cla-heavy.lock`)
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { generateCity, cityData, mapSignature } = await import(pathToFileURL(join(ROOT, 'shared/map.js')).href);
const { MAP_W, MAP_H, TILE } = await import(pathToFileURL(join(ROOT, 'shared/constants.js')).href);
const { Z, SEEDS } = await import(pathToFileURL(join(ROOT, 'shared/citylayout.js')).href);
const { ISLAND_SEEDS } = await import(pathToFileURL(join(ROOT, 'shared/islands.js')).href);
const W3 = await import(pathToFileURL(join(ROOT, 'shared/world3.js')).href);
const { canonicalHash } = await import(pathToFileURL(join(ROOT, 'tools/stamp-version.mjs')).href);

const JSON_OUT = process.argv.includes('--json'), TWICE = process.argv.includes('--twice');
const P = W3.PLACEMENTS.metro;
const KEEP_ZONES = new Set([Z.CITY, Z.SOUTH, Z.KEY]);
// where Metro City's land runs on into Dry Creek's fields today (map.js terrain: x >= 1045 is Z.EAST); --with-drycreek
// keeps the whole landmass (Dry Creek too), to tell what the cut changes from what the other islands' absence does
const CUT_X = process.argv.includes('--with-drycreek') ? MAP_W : 1045;

// The land mask: Metro City's landmass west of the cut (with Southbank across its river) and Pelican Key; every other
// island becomes sea. 4-connected, as map.js components() labels land.
function metroLand(land) {
  const keep = new Uint8Array(MAP_W * MAP_H), st = new Int32Array(MAP_W * MAP_H);
  for (const [sx, sy] of [[800, 500], [600, 360]]) {
    let sp = 0; const s0 = sy * MAP_W + sx;
    if (!land[s0] || keep[s0]) continue;
    keep[s0] = 1; st[sp++] = s0;
    while (sp) {
      const j = st[--sp], x = j % MAP_W, y = (j / MAP_W) | 0;
      const go = (k, kx) => { if (kx < CUT_X && land[k] && !keep[k]) { keep[k] = 1; st[sp++] = k; } };
      if (x > 0) go(j - 1, x - 1);
      if (x < MAP_W - 1) go(j + 1, x + 1);
      if (y > 0) go(j - MAP_W, x);
      if (y < MAP_H - 1) go(j + MAP_W, x);
    }
  }
  for (let i = 0; i < land.length; i++) if (!keep[i]) land[i] = 0;
}

const gc = globalThis.gc || (() => {});
function build(opts) {
  gc(); const u0 = process.memoryUsage(), h0 = u0.heapUsed + u0.arrayBuffers, t0 = performance.now();
  let m = null, error = null;
  try { m = generateCity(1337, opts); } catch (e) { error = (e && e.stack ? e.stack : String(e)).split('\n').slice(0, 6).join('\n'); }
  const ms = performance.now() - t0;
  gc(); const u1 = process.memoryUsage(), heapMB = (u1.heapUsed + u1.arrayBuffers - h0) / 1048576;   // (JS heap and typed arrays kept)
  let typedMB = 0;
  if (m) for (const v of Object.values(m)) if (ArrayBuffer.isView(v)) typedMB += v.byteLength / 1048576;
  return { m, error, ms: Math.round(ms), heapMB: +heapMB.toFixed(1), typedMB: +typedMB.toFixed(1) };
}

// --- the builds ---------------------------------------------------------------------------------------------------
// a business planned for another island (its district's seeds, or its planned spot, not on this build's land) is that
// island's to build
const onLand = (m, x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && !!m.land[ty * MAP_W + tx]; };
const ALL_SEEDS = SEEDS.concat(ISLAND_SEEDS);
const homeOf = (sp) => { if (sp.at) return sp.at; const s = ALL_SEEDS.filter((q) => q[0] === sp.d); return s.length ? [s[0][1], s[0][2]] : null; };
const OPTS = { land: metroLand, special: (sp, at, m) => { const h = homeOf(sp); return !h || onLand(m, h[0], h[1]); } };
const spike = build(OPTS);
if (process.argv.includes('--spike-only')) { console.log(JSON.stringify({ ms: spike.ms, heapMB: spike.heapMB, typedMB: spike.typedMB, error: spike.error })); process.exit(0); }
const spike2 = TWICE && spike.m ? build(OPTS) : null;
const today = build(null);
const S = spike.m, T0 = today.m;
const out = {
  spike: { ms: spike.ms, heapMB: spike.heapMB, typedMB: spike.typedMB, error: spike.error },
  today: { ms: today.ms, heapMB: today.heapMB, typedMB: today.typedMB, error: today.error },
};
const stamped = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).world;
out.today.hash = canonicalHash(cityData(T0)).slice(0, 12);
out.today.stamped = stamped;
out.today.signature = mapSignature(T0);
if (spike2) {
  out.spike2 = { ms: spike2.ms, error: spike2.error };
  out.deterministic = !!spike2.m && canonicalHash(cityData(spike2.m)) === canonicalHash(cityData(S));
}

if (S) {
  // the island as today's map has it: Metro City's, Southbank's and Pelican Key's zones (the cut's own land)
  const isle = (i) => KEEP_ZONES.has(T0.zone[i]);
  const [fx0, fy0, fx1, fy1] = P.from;
  // per-tile layers, over the island's land and over the water in its rectangle that no other island's land is near
  const LAYERS = ['tiles', 'dist', 'zone', 'river', 'reserve', 'deck', 'lvl0Block', 'roadAxis', 'roadRank', 'bld', 'distSea', 'distRiver'];
  const layers = {};
  let landN = 0, waterN = 0;
  for (let y = fy0; y < fy1; y++) for (let x = fx0; x < fx1; x++) { const i = y * MAP_W + x; if (isle(i)) landN++; else if (!T0.land[i] && T0.distSea[i] >= 0 && !T0.zone[i]) waterN++; }
  for (const k of LAYERS) {
    const a = S[k], b = T0[k];
    if (!a || !b) { layers[k] = 'missing'; continue; }
    let dl = 0, dw = 0;
    for (let y = fy0; y < fy1; y++) for (let x = fx0; x < fx1; x++) {
      const i = y * MAP_W + x;
      if (a[i] === b[i]) continue;
      if (isle(i)) dl++; else if (!T0.land[i] && !T0.zone[i]) dw++;
    }
    layers[k] = { land: dl, water: dw };
  }
  out.tiles = { islandLand: landN, rectWater: waterN, layers };
  // where the tile differences are, by today's district
  const byDist = {};
  for (let y = fy0; y < fy1; y++) for (let x = fx0; x < fx1; x++) { const i = y * MAP_W + x; if (isle(i) && S.tiles[i] !== T0.tiles[i]) byDist[T0.dist[i]] = (byDist[T0.dist[i]] || 0) + 1; }
  out.tiles.diffByDistrict = byDist;

  // roads: an edge is the island's if both ends are on its land (today's zones); matched by kind and rounded ends
  const inIsle = (px, py) => { const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE); return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && isle(ty * MAP_W + tx); };
  const eKey = (e) => { const p = e.pts[0], q = e.pts[e.pts.length - 1]; const a = `${Math.round(p.x)},${Math.round(p.y)}`, b = `${Math.round(q.x)},${Math.round(q.y)}`; return `${e.kind}|${a < b ? a + '|' + b : b + '|' + a}|${e.lvl}`; };
  const eSet = (m) => new Set(m.edges.filter((e) => inIsle(e.pts[0].x, e.pts[0].y) && inIsle(e.pts[e.pts.length - 1].x, e.pts[e.pts.length - 1].y)).map(eKey));
  const cmp = (A, B) => { let both = 0; for (const k of A) if (B.has(k)) both++; return { today: B.size, spike: A.size, same: both, onlyToday: B.size - both, onlySpike: A.size - both }; };
  out.roads = cmp(eSet(S), eSet(T0));
  const kinds = {};
  const tE = eSet(T0), sE = eSet(S);
  for (const k of tE) if (!sE.has(k)) { const kind = k.split('|')[0]; kinds[kind] = (kinds[kind] || 0) + 1; }
  out.roads.missingByKind = kinds;
  // lots (buildings) and POIs on the island
  const bSet = (m) => new Set(m.buildings.filter((b) => isle(b.ty * MAP_W + b.tx)).map((b) => `${b.kind}|${b.tx},${b.ty},${b.tw},${b.th}`));
  out.buildings = cmp(bSet(S), bSet(T0));
  const pSet = (m) => new Set(m.pois.filter((p) => inIsle(p.x, p.y)).map((p) => `${p.kind}|${Math.round(p.x)},${Math.round(p.y)}|${p.label || ''}`));
  out.pois = cmp(pSet(S), pSet(T0));
  const pk = {};
  const tP = pSet(T0), sP = pSet(S);
  for (const k of tP) if (!sP.has(k)) { const kind = k.split('|')[0]; pk[kind] = (pk[kind] || 0) + 1; }
  out.pois.missingByKind = pk;
  const prSet = (m) => { const s = new Set(); for (const p of m.props) if (inIsle(p.x, p.y)) s.add(`${p.t}|${Math.round(p.x)},${Math.round(p.y)}`); return s; };
  out.props = cmp(prSet(S), prSet(T0));
  out.rail = { today: T0.rail ? T0.rail.pts.length : 0, spike: S.rail ? S.rail.pts.length : 0, stationsToday: (T0.rail?.stations || []).length, stationsSpike: (S.rail?.stations || []).length };

  // placed in the v3 frame: the regions it touches, each cut from the spike's map and from today's, compared
  const regions = W3.placedRegions(P);
  let same = 0, diff = 0, framed = 0, frameOk = true;
  for (const ri of regions) {
    const a = W3.cutRegion(S.tiles, MAP_W, MAP_H, P, ri, 255, isle), b = W3.cutRegion(T0.tiles, MAP_W, MAP_H, P, ri, 255, isle);
    for (let i = 0; i < a.length; i++) { if (b[i] === 255) continue; framed++; if (a[i] === b[i]) same++; else diff++; }
  }
  // (and the framework's arithmetic: every island tile lands where the offset says, in the region regionAt names)
  for (let y = fy0; y < fy1 && frameOk; y += 7) for (let x = fx0; x < fx1; x += 7) {
    const i = y * MAP_W + x;
    if (!isle(i)) continue;
    const [X, Y] = W3.toFrame(P, x, y), ri = W3.regionAt(X, Y);
    if (ri < 0 || !regions.includes(ri)) { frameOk = false; break; }
  }
  out.frame = { rect: W3.placedRect(P), regions: regions.map(W3.regionKey), islandTiles: framed, same, diff, frameOk };
}
if (JSON_OUT) console.log(JSON.stringify(out));
else console.log(JSON.stringify(out, null, 1));
