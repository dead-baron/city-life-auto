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
import { TILE, T } from '../shared/constants.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { ISLANDS3, MAINLAND3 } from '../shared/world3-layout.js';
import { CITY3 } from '../shared/world3-city.js';
import { HAND_PLANS } from '../shared/world3-hand.js';
import { courtHoops, hoopAt } from '../shared/hoops.js';
import { ferrisSite } from '../shared/rides.js';
import { lieAt } from '../shared/golf.js';
import { airfields } from '../shared/flight.js';
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
  // the plans' coin telescopes: each looks somewhere, most of them out over the water
  const sc = m.scopeSpots || [];
  assert.ok(sc.length >= 6 && sc.every((q) => q.look && q.say), `${sc.length} telescopes`);
  assert.ok(sc.filter((q) => /water/.test(q.say)).length >= sc.length / 2, 'most over the water');
  // the Ferris wheel on Sunset Beach Pier (shared/world3-sunsetbeach.js; the ride: shared/rides.js): its boarding deck
  // on the pier's head, out over the water; the boat rentals at the pier's root (m.publicPier)
  const fw = ferrisSite(m), fs = (m.natureSites || []).find((q) => q.kind === 'pier' && q.ferris);
  assert.ok(fw && fs && fs.name === 'Sunset Beach Pier', 'the Ferris wheel on Sunset Beach Pier');
  assert.equal(m.tiles[tileOf(fw.board.x, fw.board.y)], T.DOCK, 'boarding from the pier\'s deck');
  assert.ok(m.publicPier && m.marina.length > 0, 'the boat rentals by the pier');
  // Lakeside Greens (shared/world3-lakeside.js; played: server/systems/golf.js): four holes - each tee box under its
  // tee, each pin on its green - the course's ground painted, the clubhouse's bar
  assert.ok(m.golf && m.golf.holes.length === 4, 'the course');
  for (const h of m.golf.holes) {
    assert.equal(lieAt(m, h.tee.x, h.tee.y), 'tee', `hole ${h.n}: its tee`);
    assert.equal(lieAt(m, h.pin.x, h.pin.y), 'green', `hole ${h.n}: its pin on the green`);
  }
  assert.ok((m.paintings || []).some((p) => p.key === 'golf' && p.hand), 'its ground');
  assert.ok(m.pois.some((p) => p.kind === 'clubhouse' && p.label === 'Lakeside Greens' && p.counter), 'the clubhouse bar');
  // the Glasshouse Maze against the clock (shared/world3-arts.js; server/systems/places.js): its bounds, the statue in
  // its middle inside them
  const mz = (m.natureSites || []).find((q) => q.kind === 'maze' && q.rect);
  assert.ok(mz && mz.heart.x > mz.rect.x0 && mz.heart.x < mz.rect.x1 && mz.heart.y > mz.rect.y0 && mz.heart.y < mz.rect.y1, 'the maze, its middle inside it');
  // Wreck Beach on Coral Cay (shared/world3-coralcay.js): the wreck's three places to search, each on the key's land
  const wr = (m.natureSites || []).find((q) => q.kind === 'wreck' && q.search);
  assert.ok(wr && wr.search.length === 3 && wr.search.every((q) => m.land[tileOf(q.x, q.y)]), 'the wreck to search');
  // Gull Harbor (shared/world3-gullharbor.js): the whole ferry island Gull Harbor's district (not the farm valley's
  // meadow), the fish shed on its wharf, the breakwaters' two lights, the car ferry calling at the slip on the
  // village's quay; none of today's map's Gull Isles left in the frame (shared/map.js buildGullIsles)
  const ferryIsle = ISLANDS3.find((I) => I.key === 'ferry');
  let gh = 0, notGh = 0;
  for (let y = ferryIsle.box[1]; y < ferryIsle.box[3]; y += 4) for (let x = ferryIsle.box[0]; x < ferryIsle.box[2]; x += 4) { const i = m.idx(x, y); if (m.land[i] && inPoly(ferryIsle.poly, x + 0.5, y + 0.5)) { if (m.dist[i] === 43) gh++; else notGh++; } }
  assert.ok(gh > 10000 && notGh <= gh / 100, `the island Gull Harbor's (${notGh} of ${gh + notGh} not)`);
  assert.ok(m.pois.some((p) => p.kind === 'fishmarket' && p.label === 'Salty Nets Fish & Shellfish'), 'the fish shed on the wharf');
  assert.equal(m.props.filter((p) => p.t === 'beacon').length, 2, 'the harbour mouth\'s lights');
  const gf = (m.world3.ferries || []).find((r) => r.name === 'Gull Harbor Car Ferry');
  assert.ok(gf && gf.stops.length === 2, 'the car ferry calls at the island');
  const slip = gf.stops.find((s) => s.name === 'Gull Harbor');
  assert.ok(slip && Math.abs(slip.shore[0] - 1601) <= 2 && Math.abs(slip.shore[1] - 3737) <= 2, `its slip on the village's quay (${slip && slip.shore})`);
  assert.ok(!(m.landmarks || []).some((l) => (l.name === 'Gull Harbor' && l.x < 1000 * TILE) || l.name === 'Coral Cay Cove'), 'none of today\'s Gull Isles');
  // Midtown's Market Square (2026-10-19, Midtown-A1 and Shared-3: shared/world3-midtown.js marketSquare): across Pier
  // Street from the market hall, its eight stalls, the cafe on its south side
  const ms = (m.landmarks || []).find((l) => l.name === 'Market Square'), hall = m.buildings.find((b) => b && b.hand && b.name === 'Pier Street Market');
  assert.ok(ms && hall && Math.abs((ms.x + ms.w / 2) / TILE - (hall.tx + hall.tw / 2)) <= 2 && ms.y / TILE > hall.ty + hall.th, 'the Market Square across Pier Street from the market hall');
  assert.equal(m.props.filter((p) => p.t === 'mstall' && p.x > ms.x && p.x < ms.x + ms.w && p.y > ms.y && p.y < ms.y + ms.h).length, 8, 'its eight stalls');
  assert.ok(m.pois.some((p) => p.kind === 'coffee' && p.label === 'Fontaine Cafe'), 'Fontaine Cafe');
  assert.ok(m.pois.some((p) => p.kind === 'market' && p.label === 'Midtown Market' && p.counter), 'the stalls a market to buy and sell at');
  // Westport International, handcrafted (2026-10-20: shared/world3-airport.js): its field registered by the plan (the
  // runway, the tower, the stands, the aprons); the airport's place at the main hall's door; the airliners at their gates
  // with their jet bridges; the flyable planes' stands and the helipad clear; the rescue base at its spot; the Yellow
  // Line's kiosk on the forecourt; the businesses round it
  const ap = (m.airports || []).find((a) => a.name === 'Westport International');
  assert.ok(ap && ap.hand && ap.tower && ap.stands.length >= 6 && ap.aprons.length >= 4, 'the airport registered by its plan');
  assert.equal(m.airports.filter((a) => a.name === 'Westport International').length, 1, 'once');
  const apPoi = m.pois.find((p) => p.kind === 'airport' && p.label === 'Westport International');
  const hallB = apPoi && m.buildings[apPoi.b];
  assert.ok(hallB && hallB.name === 'Westport International' && Math.abs(apPoi.y / TILE - (hallB.ty + hallB.th)) < 2, 'the airport\'s place at the main hall\'s door');
  const inAp = (p) => p.x > 1440 * TILE && p.x < 2090 * TILE && p.y > 2600 * TILE && p.y < 2860 * TILE;
  assert.ok(m.props.filter((p) => p.t === 'plane' && inAp(p)).length >= 6, 'the airliners at the gates and the freighters');
  assert.equal(m.props.filter((p) => p.t === 'jetbridge' && inAp(p)).length, 7, 'seven gates, a jet bridge at each');
  assert.equal(m.props.filter((p) => p.t === 'ctower' && inAp(p)).length, 1, 'the control tower');
  assert.ok(m.props.filter((p) => p.t === 'lplane' && inAp(p)).length >= 10, 'light planes on the general-aviation apron');
  const af = airfields(m);
  assert.equal(af.aprons.filter((a) => a.name === 'Westport International').length, 3, 'three flyable planes\' stands');
  assert.ok(af.pads.some((q) => q.kind === 'airport'), 'the airport\'s helipad');
  assert.ok(af.strips.some((q) => q.name === 'Westport International' && q.h > q.w), 'the runway (north-south)');
  const sar = m.pois.find((p) => p.kind === 'sar');
  assert.ok(sar && Math.abs(sar.x / TILE - 1709) <= 2 && Math.abs(sar.y / TILE - 2660) <= 2, `the rescue base at its spot (${sar && [Math.round(sar.x / TILE), Math.round(sar.y / TILE)]})`);
  const kp = (m.subwayPlazas || []).filter((q) => q.name === 'Westport International');
  assert.equal(kp.length, 1, 'one plaza for the airport\'s subway kiosk');
  assert.ok(kp[0].y + kp[0].h <= hallB.ty + hallB.th + 6 && kp[0].y >= hallB.ty + hallB.th, 'the kiosk on the terminal\'s forecourt');
  for (const [k, l] of [['coffee', 'Runway Diner'], ['gasstation', 'Approach Fuel'], ['delivery', 'Skyview Hotel'], ['delivery', 'Westport Air Cargo'], ['delivery', 'Zipline Car Rental'], ['delivery', 'Coastline Car Hire'], ['delivery', 'Westport Aviation']]) assert.ok(m.pois.some((p) => p.kind === k && p.label === l), l);
  assert.ok(m.pois.some((p) => p.kind === 'home' && /Jetway Motor Inn/.test(p.label)), 'a room to rent at the motel');
});
