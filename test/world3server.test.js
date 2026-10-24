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
import { DISTRICTS } from '../shared/mapcore.js';
import { FRAME_W, FRAME_H, REGION_TILES, REGIONS_X, REGIONS_Y, REGION_COUNT } from '../shared/world3.js';
import { CITY_SEEDS } from '../shared/world3-city.js';
import { BIOMES, inPoly } from '../shared/world3-skeleton.js';
import { cityData } from '../shared/map.js';
import { cityFromData, mapSignature } from '../shared/mapcore.js';
import { cutWorld } from '../server/worldcdn.js';
import { assembleCity, readIndex } from '../shared/regionpack.js';
import { shopCoverage, homesList } from '../tools/world3b/shops.mjs';
import { placeKind3, SHOP_REACH, NEED_KEYS, WILD_SHOPS3 } from '../shared/world3-shops.js';
import { POSTS3 } from '../shared/world3-medics.js';
import { clutterOn } from '../shared/world3-clutter.js';
import * as economy from '../server/systems/economy.js';

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

// (World v3b, 2026-10-15 and 10-23: shared/world3-shops.js) every built-up district - the city's, the towns, the beach
// towns - has each need (weapons, equipment, food and everyday items, cash) within reach of every bit of its streets, and
// the everyday ones (food, cash) of its own; the villages food, cash and their tackle shop of their own (no gun shop:
// they are a long way out, like the wild land); the park and the airfield food and cash within reach; the wild land its
// few themed places. (Most of the city is handcrafted now, its stores laid by its plans: a quiet district - the villas,
// the houses by the station - may have its gun shop a short drive away. The measure is tools/world3b/shops.mjs': the
// exact distance from every street tile.)
test('shops where you need them: every built-up district has each need within reach, the everyday ones of its own; the wild land a few themed places', () => {
  const cov = shopCoverage(M), bad = [];
  const OPEN = new Set([12, 27]), SLACK = 8;   // (the pass samples every third tile: a few tiles over at the worst)
  for (const r of cov.districts) {
    const pk = placeKind3(r.d);
    if (pk === 'wild') continue;
    for (const k of NEED_KEYS) {
      if (OPEN.has(r.d) && (k === 'weapons' || k === 'equipment')) continue;
      if (pk === 'village' && k === 'weapons') continue;
      if (pk !== 'village' || k === 'food' || k === 'cash') if (r.worst[k] > SHOP_REACH[k] + SLACK) bad.push(`${r.name} ${k}: ${r.worst[k]} tiles at the worst`);
      if (!OPEN.has(r.d) && (k === 'food' || k === 'cash' || pk === 'village') && !r.count[k]) bad.push(`${r.name}: no ${k} of its own`);
    }
  }
  assert.deepEqual(bad, []);
  const mine = M.pois.filter((p) => p.own);
  assert.ok(mine.length >= 100, `${mine.length} new places`);
  for (const S of WILD_SHOPS3) for (const [, name] of S.units) assert.ok(mine.some((p) => p.label === name), `${name} in the wild`);
  // every new place: its door on open ground in front of its building (or a cart on the pavement), nothing solid on it
  for (const p of mine) {
    const t = M.tileAtPx(p.x, p.y);
    assert.ok(t === T.SIDEWALK || t === T.PLAZA || t === T.LOT || t === T.GRASS || t === T.DIRT || t === T.SAND, `${p.label}: its door on open ground (${t})`);
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const e of M.solidProps.get(M.idx(tx + dx, ty + dy)) || []) assert.ok(Math.hypot(e.x - p.x, e.y - p.y) > e.r + 6, `${p.label}: nothing solid on its door`);
  }
  // the homes: as many as before the shops (no home became a shop)
  assert.ok(homesList(M).every(([, b]) => b < 0 || !M.buildings[b].shop3), 'no home is a shop');
});

// (the owner, 10-23: "a clinic or hospital to spawn at spread around the world ... one for each district/region" -
// shared/world3-medics.js) every part of the world with land enough to walk has a place to come round near its middle,
// each new clinic a walk-in with its reception, each post and ranger station built; no fence shuts a door off
// (shared/world3-fencegaps.js)
test('somewhere to wake up in every part of the world; no fence shuts a door', () => {
  const C = M.world3.clinics, S = M.world3.shops;
  assert.deepEqual(C.none, [], 'every clinic found a storefront');
  for (const [name] of POSTS3) assert.ok(!S.stuck[name] && M.hospitals.some((h) => h.name === name), `${name} built`);
  for (const [name] of C.made) {
    const p = M.pois.find((q) => q.kind === 'hospital' && q.label === name), b = p && M.buildings[p.b];
    assert.ok(b && b.walkIn, `${name}: a walk-in`);
    assert.ok(M.pois.some((q) => q.kind === 'reception' && q.b === p.b), `${name}: its reception`);
  }
  assert.ok(!M.hospitals.some((h) => h.name === 'Northshore Medical'), 'no second Northshore hospital out in Copper Gulch');
  // each district's land (sampled every 8 tiles): its middle within REACH tiles of a place to wake up (Prison Island
  // and the scattered islets are no one's to walk round; Liberty Bay is water)
  const REACH = 600, skip = new Set([13, 55, 56, 20, 21, 19]), acc = new Map();
  for (let ty = M.y0; ty < M.y0 + M.h; ty += 8) for (let tx = M.x0; tx < M.x0 + M.w; tx += 8) {
    const i = M.idx(tx, ty), t = M.tiles[i];
    if (t === T.WATER || t === T.DEEP) continue;
    const a = acc.get(M.dist[i]) || [0, 0, 0]; a[0]++; a[1] += tx; a[2] += ty; acc.set(M.dist[i], a);
  }
  const far = [];
  for (const [d, [n, sx, sy]] of acc) {
    if (n < 20 || skip.has(d)) continue;
    const cx = sx / n, cy = sy / n, best = Math.min(...M.hospitals.map((h) => Math.hypot(h.x / TILE - cx, h.y / TILE - cy)));
    if (best > REACH) far.push(`${DISTRICTS[d].name}: ${Math.round(best)} tiles`);
  }
  assert.deepEqual(far, []);
  assert.ok(M.world3.fenceGaps && M.world3.fenceGaps.stuck === 0, 'every door a fence shut opened');
});

test('nothing blocking on a street, a pavement, the track or a door (shared/world3-clutter.js)', () => {
  const left = clutterOn(M);
  assert.deepEqual(left.slice(0, 12), [], `${left.length} props where they may not stand`);
  assert.ok(M.world3.clutter && Object.keys(M.world3.clutter.dropped).length, 'the guard ran');
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
  // a buy at the new shops (shared/world3-shops.js): a pistol at a gun shop, a flashlight at a hardware store, an energy
  // drink at a corner store, a deposit at an ATM by one of them - each where its door is
  const [, buyer] = ps[0];
  buyer.profile.cash = 5000; buyer.profile.bank = 0;
  const shop = (kind) => M.pois.find((q) => q.own && q.kind === kind && M.buildings[q.b] && M.buildings[q.b].shop3);
  const at = (q) => { teleport(w, buyer.ped, q.x, q.y); w.step(); };
  const gun = shop('gunshop'), hw = shop('hardware'), mart = shop('convenience');
  assert.ok(gun && hw && mart, 'new shops of each kind');
  at(gun);
  assert.equal(economy.buildMenu(w, buyer, gun).title, gun.label, 'the gun shop\'s own name over the counter');
  economy.handleMenu(w, buyer, gun.id, 'w:pistol:450');
  assert.ok(buyer.profile.weapons.pistol !== undefined && buyer.profile.cash === 4550, `bought a pistol (${buyer.profile.cash})`);
  at(hw);
  const fl = economy.buildMenu(w, buyer, hw).opts.find((o) => o.id.startsWith('i:flashlight:'));
  economy.handleMenu(w, buyer, hw.id, fl.id);
  assert.ok((buyer.profile.inventory.flashlight || 0) > 0, 'bought a flashlight');
  at(mart);
  const en = economy.buildMenu(w, buyer, mart).opts.find((o) => o.id.startsWith('i:energy:'));
  economy.handleMenu(w, buyer, mart.id, en.id);
  assert.ok((buyer.profile.inventory.energy || 0) > 0, 'bought an energy drink');
  const atm = M.pois.filter((q) => q.kind === 'atm').sort((a, b) => Math.hypot(a.x - mart.x, a.y - mart.y) - Math.hypot(b.x - mart.x, b.y - mart.y))[0];
  at(atm);
  const cash = buyer.profile.cash;
  economy.handleMenu(w, buyer, atm.id, 'dep:all');   // (the ATM's pop-up: all your cash in at a press)
  assert.deepEqual([buyer.profile.cash, buyer.profile.bank], [0, cash], 'a deposit at the ATM');
});

// (2026-10-24, the owner's batch 4 notes) the skateboards lying about World v3 - a rack at each skate park, a few by the
// skate and surf shops and the boardwalks, never on a road (server/systems/skate.js boardSpots) - and every arcade's door
// the way onto its floor (server/systems/arcade.js)
test('World v3\'s skateboards: a rack at every skate park, a sparse few elsewhere, none on a road; every arcade\'s door leads onto its floor', async () => {
  const skate = await import('../server/systems/skate.js'), arcade = await import('../server/systems/arcade.js'), players = await import('../server/systems/players.js');
  const { boardGround } = await import('../shared/board.js');
  const S = skate.boardSpots(M), parks = M.skateSpots || [];
  assert.ok(parks.length >= 4, `the skate parks (${parks.length})`);
  for (const q of parks) {
    const rack = S.filter((s) => s.kind === 'park' && s.x >= (q.x - 1) * TILE && s.x < (q.x + q.w + 1) * TILE && s.y >= (q.y - 1) * TILE && s.y < (q.y + q.h + 1) * TILE);
    assert.equal(rack.length, 3, `${q.name}: a rack of three`);
  }
  const rest = S.filter((s) => s.kind !== 'park');
  assert.ok(rest.length >= 1 && rest.length <= 12, `a sparse few by the shops and the boardwalks (${rest.length}: ${rest.map((s) => s.kind).join(', ')})`);
  for (const s of S) for (const [dx, dy] of [[-13, -6], [13, -6], [-13, 6], [13, 6], [0, 0]]) {
    const t = M.tileAtPx(s.x + dx, s.y + dy);
    assert.ok(t !== T.ROAD && t !== T.BRIDGE && boardGround(t) <= 1, `${s.kind} board at ${Math.round(s.x)},${Math.round(s.y)}: never on a road (tile ${t})`);
  }
  const arcades = M.pois.filter((p) => arcade.isArcade({ map: M }, p));
  assert.ok(arcades.length >= 8, `the arcades (${arcades.length})`);
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w, { cash: 50 });
  for (const poi of arcades) {
    teleport(w, p.ped, poi.x, poi.y);
    const it = players.findInteraction(w, p);
    assert.ok(it && /the arcade/.test(it.label), `${poi.label}: ${it && it.label}`);
    it.run();
    assert.ok(p.ped.home && p.ped.home.arcade && p.ped.home.id === arcade.hallOf(w, poi).id, `${poi.label}: onto its floor`);
    (await import('../server/systems/homeinside.js')).leave(w, p);
  }
});
