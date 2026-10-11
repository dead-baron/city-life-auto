// World v3 (docs/WORLD-V3.md 8.14, H35): Northshore's beach towns (district 54) built - their streets on the network,
// their buildings (low-rise, less dense than Northshore), the beach in front with its promenade, car parks and lifeguard
// towers; and the stations: no tree on a platform or over the track beside one, and every station its house.
// One world build (about 35 s here, with today's world and the land before it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { treeSize } from '../shared/felling.js';
import { shoreY, BEACH_D } from '../shared/world3-beach.js';
import { stationHouse, lifeguardTower } from '../client/art2/props-road.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: Northshore\'s beach towns built; the stations clear of trees, each with its house', { timeout: 300000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, N = W * m.h, B = m.world3.beach, box = m.beachTowns.box;
  console.log('beach towns', JSON.stringify(B), JSON.stringify(m.beachTowns.front), 'rail cleared', JSON.stringify(m.world3.railCleared));
  // the streets: a loose grid, a few over the main line, on the network (one piece with the Shore Road and the rest)
  assert.ok(B.rows >= 8 && B.cols >= 10 && B.crossing >= 2, `streets: ${B.rows} along the shore, ${B.cols} cross streets (${B.crossing} over the line)`);
  const names = new Set(B.names);
  const ours = m.edges.filter((e) => names.has(e.name));
  assert.ok(ours.length >= 40, `${ours.length} edges of the beach towns' streets`);
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
  assert.ok(joined / ours.length > 0.9, `the beach towns' streets on the network: ${joined} of ${ours.length}`);
  const shore = m.edges.find((e) => e.name === 'Shore Road' && comp[e.a] === big);
  assert.ok(shore, 'the Shore Road on the network');
  // their buildings: beach houses, cafes, bars and restaurants, a hotel - fewer to the acre than Northshore's
  const area = new Float64Array(64), built = new Float64Array(64);
  for (let i = 0; i < N; i++) if (m.land[i]) { area[m.dist[i]]++; if (m.tiles[i] === T.BUILDING) built[m.dist[i]]++; }
  const kinds = {};
  let n54 = 0;
  for (const b of m.buildings) if (!b.gone && m.dist[b.ty * W + b.tx] === BEACH_D) n54++;
  for (const p of m.prefabs) if (!p.gone && p.tw && m.dist[p.ty * W + p.tx] === BEACH_D) kinds[p.key] = (kinds[p.key] || 0) + 1;
  console.log('buildings', n54, JSON.stringify(kinds), 'cover', (built[54] / area[54]).toFixed(3), 'Northshore', (built[31] / area[31]).toFixed(3));
  assert.ok(n54 >= 150, `${n54} buildings in the beach towns`);
  assert.ok((kinds.house1 || 0) + (kinds.house2 || 0) + (kinds.house5 || 0) + (kinds.house9 || 0) >= 20, 'beach houses');
  assert.ok((kinds.rest1 || 0) + (kinds.rest2 || 0) + (kinds.beachbar || 0) + (kinds.diner || 0) >= 12, 'cafes, bars and restaurants');
  assert.ok(built[54] / area[54] < 0.75 * built[31] / area[31], 'less dense than Northshore');
  // the beach in front: sand between the Shore Road and the sea all along, the promenade, car parks, lifeguard towers
  let cols = 0, sandy = 0;
  for (let x = box[0] + 10; x < box[2] - 10; x += 5) {
    const y0 = Math.round(shoreY(x));
    if (!m.land[y0 * W + x] || m.dist[y0 * W + x] !== BEACH_D) continue;
    cols++;
    let s = 0;
    for (let y = y0; y < y0 + 40; y++) if (m.tiles[y * W + x] === T.SAND) s++;
    if (s >= 8) sandy++;
  }
  assert.ok(cols > 150 && sandy / cols > 0.85, `the beach in front of the towns: ${sandy} of ${cols} columns`);
  const F = m.beachTowns.front;
  assert.ok(F.promenade > 2000 && F.parks >= 4 && F.towers >= 6, `promenade ${F.promenade} tiles, ${F.parks} car parks, ${F.towers} lifeguard towers`);
  for (const t of m.lifeguards) assert.equal(m.tileAtPx(t.x, t.y), T.SAND, 'a lifeguard tower stands on the sand');
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
  assert.equal(onPlat, 0, 'no tree on a platform');
  assert.equal(over, 0, 'no big tree with its crown over the track at a station');
  // every station its house, on open ground (its forecourt), facing away from the tracks
  assert.ok(m.railHubs.length >= 15);
  for (const h of m.railHubs) {
    // (a station whose platforms all stand on piers - Old Town's, at the end of the Bay Bridge Line's trestle, 8.10.1 -
    // has no open ground within reach of them yet: its house stands by them)
    const wet = (t) => t === T.WATER || t === T.DEEP || t === T.BRIDGE;
    if (h.calls.every(([ri, si]) => { const p = m.rails[ri].stations[si].platform; return !p || wet(m.tileAtPx(p.x, p.y)); })) { console.log(`${h.name}: on piers`); continue; }
    const t = m.tileAtPx(h.x + Math.cos(h.a) * 18, h.y + Math.sin(h.a) * 18);
    assert.ok(Number.isFinite(h.a) && t !== T.WATER && t !== T.DEEP && t !== T.ROAD && t !== T.BUILDING, `${h.name}: its house on open ground (tile ${t})`);
  }
  const house = stationHouse(1, 140), tower = lifeguardTower();
  assert.ok(house && tower, 'the art v2 models build');
});
