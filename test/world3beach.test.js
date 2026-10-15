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

test('World v3: Northshore\'s beach towns built; the stations clear of trees, each with its house', { timeout: 300000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, N = W * m.h, B = m.world3.beach, box = m.beachTowns.box;
  console.log('beach towns', JSON.stringify(B), JSON.stringify(m.beachTowns.front), 'rail cleared', JSON.stringify(m.world3.railCleared));
  const bad = [], check = (ok, msg) => { if (!ok) bad.push(msg); };
  // the streets: a loose grid, a few over the main line, on the network (one piece with the Shore Road and the rest)
  // (v3b: the north coast's strip between the Shore Road and the main line is ~200 tiles deep - rows every 46 tiles: 4-5)
  check(B.rows >= 4 && B.cols >= 10 && B.crossing >= 2, `streets: ${B.rows} along the shore, ${B.cols} cross streets (${B.crossing} over the line)`);
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
  for (const b of m.buildings) if (!b.gone && m.dist[b.ty * W + b.tx] === BEACH_D) n54++;
  for (const p of m.prefabs) if (!p.gone && p.tw && m.dist[p.ty * W + p.tx] === BEACH_D) kinds[p.key] = (kinds[p.key] || 0) + 1;
  console.log('buildings', n54, JSON.stringify(kinds), 'cover', (built[54] / area[54]).toFixed(3), 'Northshore', (built[31] / area[31]).toFixed(3));
  check(n54 >= 100, `${n54} buildings in the beach towns`);   // (v3b: 107)
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
  // (v3b: the traced Shore Road runs 20-60 tiles inland of the sand for much of its length - x 3380-3740 has none within
  // 60 tiles - so the beach is in front of it along about 60% of the columns, the promenade only where it meets the sand)
  check(cols > 150 && sandy / cols > 0.5, `the beach in front of the towns: ${sandy} of ${cols} columns`);
  const F = m.beachTowns.front;
  check(F.promenade > 600 && F.parks >= 4 && F.towers >= 2, `promenade ${F.promenade} tiles, ${F.parks} car parks, ${F.towers} lifeguard towers`);
  for (const t of m.lifeguards) check(m.tileAtPx(t.x, t.y) === T.SAND, `a lifeguard tower off the sand at ${Math.round(t.x / TILE)}, ${Math.round(t.y / TILE)}`);
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
