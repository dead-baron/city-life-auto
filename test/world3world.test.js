// World v3 (docs/WORLD-V3.md 8.6; World v3b's layout: part 9): the whole v3 world in one build - generateCity(seed,
// { world3: true, frame, land, today }). One build (about 55-90 s here: today's world, the land, then the world). At v3b
// no piece of today's world is placed (shared/world3-world.js: everything of today's goes off the frame): the city is
// shared/world3-city.js's districts (CITY3) on the gulf's islands and the mainland, the regional places on the mainland,
// the small islands their land. Checked here: every district built on its island (land, streets, buildings, places),
// every island of shared/world3-layout.js ISLANDS3 land as traced, the land as planned (shared/world3-land.js) and the
// mainland's biomes dressed, everything in the frame, and the skeleton's roads from one land to another listed as
// crossings and laid. The live world is test/world3.test.js's (its hash doesn't change).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE } from '../shared/constants.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { ISLANDS3, MAINLAND3 } from '../shared/world3-layout.js';
import { CITY3 } from '../shared/world3-city.js';
import { HAND_PLANS } from '../shared/world3-hand.js';
import { courtHoops, hoopAt } from '../shared/hoops.js';
import { ARTERIALS, BIOMES, inPoly } from '../shared/world3-skeleton.js';
import { prepare, sizes, placeOf } from '../tools/world3-build.mjs';

const FEW = new Map(HAND_PLANS.filter((q) => q.few).map((q) => [q.d, q.few]));
test('World v3: the whole world in one build - every city district on its island, the small islands, the land as planned, the mainland\'s ground', { timeout: 300000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  assert.equal(m.w, FRAME_W); assert.equal(m.h, FRAME_H);
  // no piece of today's world: nothing placed, so none of today's roads split between pieces or cut at a shore
  assert.deepEqual(m.world3.pieces, []);
  assert.equal(m.world3.split, 0);
  assert.deepEqual([m.world3.cut, m.world3.dropped, m.world3.bridged], [[], [], []]);
  const tileOf = (x, y) => m.idx(Math.floor(x / TILE), Math.floor(y / TILE));
  // every district of the city (CITY3): its land, its streets, its places; its buildings (the park and the airfield few)
  const per = new Map(CITY3.map((c) => [c.d, { land: 0, edges: 0, buildings: 0, pois: 0 }]));
  const count = (i, k) => { const r = per.get(m.dist[i]); if (r) r[k]++; };
  for (let i = 0; i < m.land.length; i++) if (m.land[i]) count(i, 'land');
  for (const e of m.edges) { const p = e.pts[e.pts.length >> 1]; count(tileOf(p.x, p.y), 'edges'); }
  for (const b of m.buildings) if (b) count(m.idx(b.tx, b.ty), 'buildings');
  for (const p of m.pois) count(tileOf(p.x, p.y), 'pois');
  for (const c of CITY3) {
    const r = per.get(c.d), D = DISTRICTS[c.d], open = D.style === 'park' || D.style === 'airport';
    // (a park's streets are the avenues round it - Greenfield Park, Downtown's circus: its four sides - none inside)
    assert.ok(r.land > 20000 && r.edges >= (open ? 4 : 10) && r.pois >= 1, `${D.name}: ${JSON.stringify(r)}`);
    assert.ok(open || r.buildings >= (FEW.get(c.d) ?? 50), `${D.name}: ${r.buildings} buildings`);   // (a plan of big set pieces says how few it has: shared/world3-hand.js)
  }
  // every island (ISLANDS3) land as traced (its outline sampled; the smallest rocks lose a little to the smoothing);
  // the islands a district is on have streets, buildings and places
  const cityOn = new Set(CITY3.map((c) => c.on));
  for (const I of ISLANDS3) {
    const [x0, y0, x1, y1] = I.box;
    let n = 0, l = 0;
    for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) if (inPoly(I.poly, x + 0.5, y + 0.5)) { n++; if (m.land[m.idx(x, y)]) l++; }
    assert.ok(l / n >= (n > 10000 ? 0.98 : 0.9), `${I.key}: ${l} of ${n} samples land`);
    if (!cityOn.has(I.key)) continue;
    let e = 0, b = 0, p = 0;
    for (const q of m.edges) { const r = q.pts[q.pts.length >> 1]; if (inPoly(I.poly, r.x / TILE, r.y / TILE)) e++; }
    for (const q of m.buildings) if (q && inPoly(I.poly, q.tx + 0.5, q.ty + 0.5)) b++;
    for (const q of m.pois) if (inPoly(I.poly, q.x / TILE, q.y / TILE)) p++;
    assert.ok(e >= 20 && b >= 50 && p >= 20, `${I.key}: ${e} road edges, ${b} buildings, ${p} POIs`);
  }
  // the land as planned (the land layer, shared/world3-land.js), by biome and the islands, to within 1% (the lakes'
  // quays and islands, the falls' pools) - the marsh less its creeks (world3-biomes.js: about 3% of the Egret Coast
  // is water); nothing built out on the sea
  const rows = Object.fromEntries(sizes(m, prep.land).map((r) => [r.key, r]));
  const { at, keys } = placeOf(prep.land), planned = new Float64Array(keys.length);
  for (let i = 0; i < at.length; i++) if (prep.land.layers.land[i]) planned[at[i]]++;
  for (let k = 0; k < keys.length - 1; k++) {
    const got = rows[keys[k]].land, want = planned[k], marsh = /marsh/.test(BIOMES.find((B) => B.key === keys[k])?.ground || '');
    assert.ok(got <= want * 1.01 && got >= want * (marsh ? 0.95 : 0.99), `${keys[k]}: ${got} land tiles, ${want} planned`);
  }
  assert.ok(rows.sea.land < 1000, `${rows.sea.land} land tiles on the sea`);
  // the mainland: every biome has its ground and its dressing (trees, rocks, scrub) - at least a prop every 250 tiles
  for (const B of BIOMES) {
    const r = rows[B.key];
    assert.ok(r.land > 100000 && r.props > r.land / 250, `${B.name}: ${r.land} land tiles, ${r.props} props`);
  }
  // everything in the frame: what no piece builds went off it and was dropped
  const inF = (x, y) => x >= 0 && y >= 0 && x < m.w * TILE && y < m.h * TILE;
  for (const e of m.edges) for (const p of e.pts) assert.ok(inF(p.x, p.y), `edge ${e.name || e.kind} at ${p.x}, ${p.y}`);
  for (const b of m.buildings) assert.ok(m.inside(b.tx, b.ty), `building ${b.kind} at ${b.tx}, ${b.ty}`);
  for (const p of m.pois) assert.ok(inF(p.x, p.y), `POI ${p.kind} at ${p.x}, ${p.y}`);
  // the skeleton's crossings: every arterial from one land to another (the island bridges and the footbridges) listed,
  // and every crossing listed laid as a road of its name
  const landOf = ([x, y]) => ISLANDS3.find((I) => inPoly(I.poly, x, y))?.key || (inPoly(MAINLAND3, x, y) ? 'main' : null);
  const names = new Set(m.world3.crossings.map((c) => c.name));
  const joins = ARTERIALS.filter((A) => { const a = landOf(A.pts[0]), b = landOf(A.pts[A.pts.length - 1]); return a && b && a !== b; });
  assert.ok(joins.length >= 10 && joins.filter((A) => A.foot).length >= 3, `${joins.length} arterials between lands`);
  for (const A of joins) assert.ok(names.has(A.name), `crossing ${A.name} listed`);
  const named = new Set(m.edges.map((e) => e.name));
  for (const n of names) assert.ok(named.has(n), `crossing ${n} laid`);
  // the handcrafted districts' basketball courts are hoops to shoot at (shared/hoops.js): each rim over its half court,
  // standing on it finds that hoop
  const hs = courtHoops(m);
  assert.ok(hs.length >= 8, `${hs.length} hoops`);
  hs.forEach((h, k) => {
    assert.ok(h.rim.x > h.court.x0 && h.rim.x < h.court.x1 && h.rim.y > h.court.y0 && h.court.y1 - h.court.y0 >= 6 * TILE, `hoop ${k} over its court`);
    assert.equal(hoopAt(m, h.rim.x, h.rim.y + 80), k, `hoop ${k}: its court found`);
  });
});
