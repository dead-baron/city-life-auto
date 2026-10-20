// World v3 (docs/WORLD-V3.md 8.14, H35): Northshore's beach towns (district 54) built - their streets on the network,
// their buildings (low-rise, less dense than Northshore), the beach in front with its promenade, car parks and lifeguard
// towers; and the stations: no tree on a platform or over the track beside one, and every station its house.
// One world build (about 35 s here, with today's world and the land before it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, DISTRICTS } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { treeSize } from '../shared/felling.js';
import { shoreY, BEACH_D } from '../shared/world3-beach.js';
import { stationHouse, lifeguardTower } from '../client/art2/props-road.js';
import { STATIONS } from '../shared/world3-skeleton.js';
import { prepare } from '../tools/world3-build.mjs';
import { PX as NPX } from '../shared/world3-northpoint.js';

test('World v3: Northshore\'s beach towns built; the stations clear of trees, each with its house', { timeout: 300000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, N = W * m.h, B = m.world3.beach, box = m.beachTowns.box;
  console.log('beach towns', JSON.stringify(B), JSON.stringify(m.beachTowns.front), 'rail cleared', JSON.stringify(m.world3.railCleared));
  const bad = [], check = (ok, msg) => { if (!ok) bad.push(msg); };
  // the streets: a loose grid, a few over the main line, on the network (one piece with the Shore Road and the rest)
  // (v3b: the north coast's strip between the Shore Road and the main line is ~200 tiles deep - rows every 46 tiles: 4-5;
  // 9.6: the land round the inlet and the peninsula is the towns' - Northshore, North Point, The Bluffs - and the beach
  // towns are the west beach's, behind the Shore Road along the back of the sand, and their lanes south of the line: 9)
  check(B.rows >= 4 && B.cols >= 8 && B.crossing >= 2, `streets: ${B.rows} along the shore, ${B.cols} cross streets (${B.crossing} over the line)`);
  const names = new Set(B.names);
  const ours = m.edges.filter((e) => names.has(e.name));
  check(ours.length >= 20, `${ours.length} edges of the beach towns' streets`);   // (v3b: 24 - the north coast's shallower strip)
  const comp = new Int32Array(m.nodes.length).fill(-1);
  let big = -1, bigN = 0;
  for (let s = 0, c = 0; s < m.nodes.length; s++) {
    if (comp[s] >= 0) continue;
    let n = 0; const st = [s]; comp[s] = c;
    while (st.length) { const v = st.pop(); n++; for (const id of m.nodes[v].edges) { const e = m.edges[id], o = e.a === v ? e.b : e.a; if (comp[o] < 0) { comp[o] = c; st.push(o); } } }
    if (n > bigN) { bigN = n; big = c; }
    c++;
  }
  const joined = ours.filter((e) => comp[e.a] === big).length;
  check(joined / ours.length > 0.9, `the beach towns' streets on the network: ${joined} of ${ours.length}`);
  const shore = m.edges.find((e) => e.name === 'Shore Road' && comp[e.a] === big);
  check(shore, 'the Shore Road on the network');
  // their buildings: beach houses, cafes, bars and restaurants, a hotel - fewer to the acre than Northshore's
  const area = new Float64Array(64), built = new Float64Array(64);
  for (let i = 0; i < N; i++) if (m.land[i]) { area[m.dist[i]]++; if (m.tiles[i] === T.BUILDING) built[m.dist[i]]++; }
  const kinds = {};
  let n54 = 0;
  // (9.6: and the north coast's as a whole - the beach towns, North Point's harbour village, Northshore, The Bluffs: the
  // houses and the cafes, bars and restaurants by the beach are the beach towns' and North Point's)
  let coast = 0;
  for (const b of m.buildings) if (!b.gone && m.dist[b.ty * W + b.tx] === BEACH_D) n54++;
  for (const b of m.buildings) if (!b.gone && [BEACH_D, 31, 32, 34].includes(m.dist[b.ty * W + b.tx])) coast++;
  // (2026-10-19: and Northshore's - its cafes on Front Street and the inlet)
  for (const p of m.prefabs) if (!p.gone && p.tw && [BEACH_D, 31, 32].includes(m.dist[p.ty * W + p.tx])) kinds[p.key] = (kinds[p.key] || 0) + 1;
  console.log('buildings', n54, 'the coast', coast, JSON.stringify(kinds), 'cover', (built[54] / area[54]).toFixed(3), 'Northshore', (built[31] / area[31]).toFixed(3));
  // (2026-10-19: Northshore, North Point and The Bluffs handcrafted - fewer, bigger buildings than the generator's grids: 235+)
  check(n54 >= 20 && coast >= 200, `${n54} buildings in the beach towns, ${coast} on the north coast`);   // (v3b: 107; 9.6: 28, the coast's 410)
  check((kinds.house1 || 0) + (kinds.house2 || 0) + (kinds.house5 || 0) + (kinds.house9 || 0) >= 8, 'beach houses');   // (v3b: 10)
  check((kinds.rest1 || 0) + (kinds.rest2 || 0) + (kinds.beachbar || 0) + (kinds.diner || 0) >= 12, 'cafes, bars and restaurants');
  // ("less dense than a city": Metro City's built districts, as a whole)
  let ma = 0, mb = 0;
  DISTRICTS.forEach((d, k) => { if (d.isl === 'Metro City' && !['wild', 'park', 'water'].includes(d.style)) { ma += area[k]; mb += built[k]; } });
  console.log('cover: beach towns', (built[54] / area[54]).toFixed(3), 'Metro City', (mb / ma).toFixed(3));
  check(built[54] / area[54] < 0.9 * mb / ma, 'less dense than the city');
  // the beach in front: sand between the Shore Road and the sea all along, the promenade, car parks, lifeguard towers
  let cols = 0, sandy = 0;
  for (let x = box[0] + 10; x < box[2] - 10; x += 5) {
    const y0 = Math.round(shoreY(x));
    if (!m.land[y0 * W + x] || m.dist[y0 * W + x] !== BEACH_D) continue;
    cols++;
    let s = 0, n = 0;   // (the sand on the sea's side: v3b's sea is north of the Shore Road, WR3's south - world3-beach.js IN)
    for (let y = y0; y < y0 + 40; y++) if (m.tiles[y * W + x] === T.SAND) s++;
    for (let y = y0; y > y0 - 40; y--) if (m.tiles[y * W + x] === T.SAND) n++;
    s = Math.max(s, n);
    if (s >= 8) sandy++;
  }
  console.log('the beach in front', sandy, 'of', cols, 'columns');
  // (v3b: the traced Shore Road ran 20-60 tiles inland of the sand for much of its length; 9.6: it runs along the back
  // of the beach now, 2 tiles in from the sand's edge, so the promenade runs the west beach's length; round the inlet
  // and the peninsula the towns are in front of it)
  check(cols > 100 && sandy / cols > 0.5, `the beach in front of the towns: ${sandy} of ${cols} columns`);
  const F = m.beachTowns.front;
  check(F.promenade > 1500 && F.parks >= 2 && F.towers >= 4, `promenade ${F.promenade} tiles, ${F.parks} car parks, ${F.towers} lifeguard towers`);   // (9.6: 1724, 2, 4; v3b: 803, 7, 2)
  for (const t of m.lifeguards) check(m.tileAtPx(t.x, t.y) === T.SAND, `a lifeguard tower off the sand at ${Math.round(t.x / TILE)}, ${Math.round(t.y / TILE)}`);
  // (v3b, docs/WORLD-V3.md 9.6) the north coast's harbour (shared/world3-north.js): North Point's finger piers out over
  // the inlet with the fleet moored along them, the fish shack (a fish market), North Point Light on the peninsula's tip
  const NB = m.world3.north;
  console.log('north coast', JSON.stringify(NB));
  check(NB && NB.piers >= 4 && NB.boats >= 20 && NB.decking > 300, `North Point's piers: ${JSON.stringify(NB)}`);
  check(NB && NB.shack && m.pois.some((p) => p.kind === 'fishmarket' && p.label === 'North Point Fish Shack'), 'the fish shack');
  // (2026-10-19: North Point handcrafted - shared/world3-northpoint.js: the fish shack and the charter office on its quay
  // between Waterside Road and the water, the charter boat the office's; Mariners' Square)
  const shack = m.buildings.find((b) => b && b.hand && b.name === 'North Point Fish Shack'), office = m.pois.find((p) => p.kind === 'charter' && p.label === 'North Point Charters');
  check(shack && shack.tx + shack.tw <= NPX.water && shack.tx > NPX.west, `the fish shack on North Point's quay (${shack && [shack.tx, shack.ty]})`);
  check(office && office.boat && Math.abs(office.boat.y / TILE - office.y / TILE) < 30, 'the charter office and its boat');
  check((m.landmarks || []).some((l) => l.name === "Mariners' Square"), "Mariners' Square");
  console.log('North Point', JSON.stringify({ ...m.world3hand.northpoint, sights: undefined, places: undefined }));
  // (2026-10-19: The Bluffs handcrafted - shared/world3-bluffs.js: the houses on their big lots with their pools, the Cliff
  // Walk along the top of the east beach, Bluffs Overlook on the point, the tennis club)
  const BL = m.world3hand.bluffs;
  console.log('The Bluffs', JSON.stringify({ ...BL, sights: undefined, places: undefined }));
  check(BL && BL.villas >= 25 && BL.pools >= 15 && BL.walk > 600, `The Bluffs' houses, pools and walk: ${JSON.stringify(BL && { villas: BL.villas, pools: BL.pools, walk: BL.walk })}`);
  for (const n of ['Cliff Walk', 'Bluffs Overlook']) check((m.landmarks || []).some((l) => l.name === n), n);
  check(m.buildings.some((b) => b && b.hand && b.name === 'The Bluffs Tennis Club'), 'the tennis club');
  // (2026-10-19: Northshore handcrafted - shared/world3-northshore.js: Depot Square by the station, Front Street's shops,
  // Bank Street's Town Hall, Medical Center and Sheriff, Northshore Plaza; on the lobe Bayview Green and the marina)
  const NS = m.world3hand.northshore;
  console.log('Northshore', JSON.stringify({ ...NS, sights: undefined, places: undefined }));
  check(NS && NS.shops >= 15 && NS.homes >= 16, `Northshore's shops and homes: ${JSON.stringify(NS && { shops: NS.shops, homes: NS.homes })}`);
  for (const n of ['Depot Square', 'Bayview Green', 'Northshore Cove']) check((m.landmarks || []).some((l) => l.name === n), n);
  for (const n of ['Northshore Town Hall', 'Northshore Plaza']) check(m.buildings.some((b) => b && b.hand && b.name === n), n);
  for (const [k, n] of [['hospital', 'Northshore Medical Center'], ['police', 'Northshore Sheriff'], ['marina', 'Northshore Marina'], ['bank', 'Northshore Savings']]) check(m.pois.some((p) => p.kind === k && p.label === n), n);
  const light = m.buildings.find((b) => b && b.kind === 'lighthouse' && b.name === 'North Point Light');
  check(light && (m.landmarks || []).some((l) => l.name === 'North Point Light'), 'North Point Light');
  for (const P of [NB?.light]) if (P) { let sea = false; for (let dy = -24; dy <= 24; dy += 2) for (let dx = -24; dx <= 24; dx += 2) if (!m.land[m.idx(P[0] + dx, P[1] + dy)]) sea = true; check(sea, 'the light by the sea'); }
  // the stations: no tree on a platform, none whose crown reaches the track beside one
  let onPlat = 0, over = 0;
  const sts = m.rails.flatMap((r) => r.stations.filter((st) => !st.under).map((st) => ({ st, r })));
  for (const p of m.props) {
    const size = treeSize(p);
    if (!size) continue;
    for (const { st, r } of sts) {
      const dx = p.x - st.x, dy = p.y - st.y;
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) continue;
      const along = dx * Math.cos(st.a) + dy * Math.sin(st.a), across = (-dx * Math.sin(st.a) + dy * Math.cos(st.a)) * st.side;
      if (Math.abs(along) < st.half && across > st.inner && across < st.outer) onPlat++;
      if (Math.abs(along) < st.half && size >= 3) { let d = Infinity; for (const q of r.pts) { const e = Math.hypot(q.x - p.x, q.y - p.y); if (e < d) d = e; } if (d < 110) over++; }
    }
  }
  check(onPlat === 0, `${onPlat} trees on a platform`);
  check(over === 0, `${over} big trees with their crowns over the track at a station`);
  // every station its house, on open ground (its forecourt), facing away from the tracks
  check(m.railHubs.length >= STATIONS.filter((st) => st.line === 'main').length, `${m.railHubs.length} stations with their houses`);   // (v3b: the main line's 13)
  for (const h of m.railHubs) {
    // (a station with platforms on piers - Old Town's, at the end of the Bay Bridge Line's trestle, 8.10.1 -
    // has no open ground within reach of them yet: its house stands by them)
    const wet = (t) => t === T.WATER || t === T.DEEP || t === T.BRIDGE;
    if (h.name === 'Old Town Station' || h.calls.some(([ri, si]) => { const p = m.rails[ri].stations[si].platform; return !p || wet(m.tileAtPx(p.x, p.y)); })) { console.log(`${h.name}: on piers (8.14's wrongs)`); continue; }
    const t = m.tileAtPx(h.x + Math.cos(h.a) * 18, h.y + Math.sin(h.a) * 18);
    check(Number.isFinite(h.a) && t !== T.WATER && t !== T.DEEP && t !== T.ROAD && t !== T.BUILDING, `${h.name}: its house on open ground (tile ${t})`);
  }
  assert.deepEqual(bad, []);
  const house = stationHouse(1, 140), tower = lifeguardTower();
  assert.ok(house && tower, 'the art v2 models build');
});
