// World v3 on the server (CLA_WORLD=v3: server/world3.js, docs/WORLD-V3.md 8.9; World v3b's layout: part 9): the whole
// v3 world built as the server builds it, the server's world running on it with players at a few of its places -
// downtown on the Gulf Island, Port Westport's container port, Cedar Falls on the east island, the mainland's woods -
// for a few seconds: no errors, and life round each place that has streets (traffic and people). And its region files:
// the frame's regions (13 x 8 at v3b: shared/world3.js), every one read back into the same city.
// (One build, about 55-60 s and 1.6 GB: the heavy lock.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { joinPlayer, teleport } from './helpers.js';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { T, TILE, K } from '../shared/constants.js';
import { FRAME_W, FRAME_H, REGION_TILES, REGIONS_X, REGIONS_Y, REGION_COUNT } from '../shared/world3.js';
import { CITY_SEEDS } from '../shared/world3-city.js';
import { BIOMES, inPoly } from '../shared/world3-skeleton.js';
import { cityData } from '../shared/map.js';
import { cityFromData, mapSignature } from '../shared/mapcore.js';
import { cutWorld } from '../server/worldcdn.js';
import { assembleCity, readIndex } from '../shared/regionpack.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });

// a road tile of a place: the road edge's middle nearest to (tx, ty), within r tiles
function roadNear(m, tx, ty, r = 400) {
  let best = null, bd = r * r;
  for (const e of m.edges) {
    const p = e.pts[e.pts.length >> 1], x = Math.floor(p.x / TILE), y = Math.floor(p.y / TILE);
    const d = (x - tx) ** 2 + (y - ty) ** 2;
    if (d < bd && m.tiles[m.idx(x, y)] === T.ROAD) { bd = d; best = [x, y]; }
  }
  return best;
}
const poiOf = (m, kind) => m.pois.find((p) => p.kind === kind);

test('the v3 world as the server builds it: the frame, its places', () => {
  assert.equal(M.w, FRAME_W); assert.equal(M.h, FRAME_H);
  assert.deepEqual({ ...M.frame }, { w: FRAME_W, h: FRAME_H });
  assert.ok(M.edges.length > 1000 && M.buildings.length > 1000 && M.pois.length > 500, `${M.edges.length} edges, ${M.buildings.length} buildings, ${M.pois.length} POIs`);
  assert.ok(!('frame' in cityData(M)), 'the frame is not a field of the city as data');
});

test(`its region files, as the server cuts them: the index and ${REGIONS_X} x ${REGIONS_Y} regions, read back into the same city`, () => {
  let cut = cutWorld(M, { seed: 1337, world: 'v3' });   // (before the World runs: it changes the map)
  const X = readIndex(cut.pack.index);
  assert.deepEqual(X.frame, [FRAME_W, FRAME_H, REGION_TILES, REGIONS_X, REGIONS_Y]);
  assert.equal(cut.pack.regions.length, REGION_COUNT);
  assert.deepEqual(X.meta, { seed: 1337, world: 'v3' });
  // (5.2 MB raw, 0.95 MB gzipped at WR3 since the window's follow-ups - the world's places, the region signatures and
  // its coarse picture, 8.12.2 - with the towns' roads in the graph the index keeps whole; 6.7 MB raw, 0.93 MB
  // gzipped at v3b: the wider frame's picture, the city generator's streets in the graph and its 5,200 places - every
  // home and delivery spot among them. The page downloads it gzipped)
  const gz = gzipSync(cut.pack.index).length;
  assert.ok(cut.pack.index.length < 8e6 && gz < 1.2e6, `the index ${(cut.pack.index.length / 1e6).toFixed(2)} MB raw, ${(gz / 1e6).toFixed(2)} MB gzipped`);
  let back = cityFromData(assembleCity(cut.pack.index, cut.pack.regions.map((r) => r.bytes)));
  cut = null;
  delete back._sig;
  assert.equal(mapSignature(back), mapSignature(M), 'the same city');
  assert.deepEqual([back.w, back.h, back.edges.length, back.buildings.length, back.pois.length, back.props.length, back.levels.segs.length], [M.w, M.h, M.edges.length, M.buildings.length, M.pois.length, M.props.length, M.levels.segs.length]);
  back = null;
});

test('the server\'s world on the v3 map: players downtown, at Port Westport, in Cedar Falls and in the woods - no errors, life round the towns', () => {
  const w = new World(M, { npcBudget: 120, throwErrors: true });
  // the places (shared/world3-city.js: each district's heart): Downtown (4) on the Gulf Island, Port Westport's
  // container port (its container yard POI, else the district's heart), Cedar Falls (35) on the east island, and
  // the mainland's Highland Woods (no streets)
  const port = poiOf(M, 'container_yard') || null;
  const spots = {
    downtown: roadNear(M, ...CITY_SEEDS[4]),
    port: port ? roadNear(M, Math.floor(port.x / TILE), Math.floor(port.y / TILE)) : roadNear(M, ...CITY_SEEDS[26]),
    cedar: roadNear(M, ...CITY_SEEDS[35]),
  };
  for (const [k, v] of Object.entries(spots)) assert.ok(v, `a road at ${k}`);
  const ps = Object.entries(spots).map(([k, [x, y]]) => { const p = joinPlayer(w).p; teleport(w, p.ped, x * TILE + 16, y * TILE + 16); return [k, p]; });
  // the mainland: a land tile of Highland Woods (BIOMES' woods) off the roads
  const woods = BIOMES.find((b) => b.key === 'woods').poly;
  let wild = null;
  for (let y = 600; y < 1800 && !wild; y += 37) for (let x = 600; x < 1800 && !wild; x += 41) if (inPoly(woods, x, y) && M.land[M.idx(x, y)] && M.tiles[M.idx(x, y)] !== T.ROAD) wild = [x, y];
  assert.ok(wild, 'a mainland tile');
  { const p = joinPlayer(w).p; teleport(w, p.ped, wild[0] * TILE + 16, wild[1] * TILE + 16); ps.push(['mainland', p]); }
  for (let i = 0; i < 20 * 8; i++) w.step();
  const ents = [...w.entities.values()];
  for (const [k, p] of ps) {
    assert.ok(p.ped && !p.ped.dead, `${k}: the player is there`);
    if (k === 'mainland') continue;
    const near = ents.filter((e) => e !== p.ped && Math.hypot(e.x - p.ped.x, e.y - p.ped.y) < 1600);
    const npcs = near.filter((e) => e.kind === K.PED && e.npc).length, cars = near.filter((e) => e.def && !e.parked).length;
    assert.ok(npcs + cars > 0, `${k}: life round the player (${npcs} people, ${cars} cars)`);
  }
  assert.ok(w.trafficCount > 0, `traffic (${w.trafficCount})`);
});
