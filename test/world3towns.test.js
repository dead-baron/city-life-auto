// World v3, stage 3, step 5 (docs/WORLD-V3.md 8.13): the first mainland towns in the whole-world build - Timber Bend,
// Willow Crossing and Sandpiper Bay, each its own district (after today's and the biomes': no id moves) with its streets
// on the one road network, its blocks and buildings, its basics (a gas station, a clinic or the sheriff, a diner or a
// bar, a bus stop) and its own places (part 1.5's table); no building on the main line or in a highway's room.
// One world build (about 30 s here, with today's world and the land before it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, DISTRICTS } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { skeletonLines, nearestOnPath } from '../shared/world3-skeleton.js';
import { TOWNS3, TOWN_SPECIALS } from '../shared/world3-towns.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: the first mainland towns - districts, streets on the network, buildings, basics and specials, clear of the main line and the highways', { timeout: 300000 }, () => {
  // the towns' districts follow today's and the biomes' (47-56), shaped like the others
  assert.deepEqual(TOWNS3.map((t) => t.d), [57, 58, 59]);
  for (const t of TOWNS3) { assert.equal(DISTRICTS[t.d].id, t.d); assert.equal(DISTRICTS[t.d].name, t.name); }
  assert.equal(DISTRICTS[59].style, 'beach');
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, N = W * m.h;
  const distAt = (x, y) => m.dist[Math.floor(y / TILE) * W + Math.floor(x / TILE)];
  const bad = [];
  const check = (ok, msg) => { if (!ok) bad.push(msg); };
  console.log('towns', JSON.stringify(m.world3.towns.built.map((q) => [q.name, q.buildings, q.pois, q.bus])));

  // the network's pieces (as test/world3roads.test.js): the biggest is the one network
  const comp = new Int32Array(m.nodes.length).fill(-1), sizes = [];
  for (let s = 0; s < m.nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const c = sizes.length, st = [s]; comp[s] = c; let n = 0;
    while (st.length) { const u = st.pop(); n++; for (const id of m.nodes[u].edges) { const e = m.edges[id], v = e.a === u ? e.b : e.a; if (comp[v] < 0) { comp[v] = c; st.push(v); } } }
    sizes.push(n);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const SK = skeletonLines(), hwys = SK.filter((l) => l.kind === 'hwy'), rails = SK.filter((l) => l.kind === 'main');

  for (const t of TOWNS3) {
    // 1. its ground
    let tiles = 0, road = 0, built = 0;
    for (let i = 0; i < N; i++) if (m.dist[i] === t.d) { tiles++; if (m.tiles[i] === T.ROAD) road++; if (m.bld[i] >= 0) built++; }
    check(tiles > 3000, `${t.name}: ${tiles} tiles of its district`);
    // 2. its streets (8.13.1): the side streets and lanes laid, every edge of them on the one network; few dead ends
    const names = new Set(t.streets.map((q) => q[0]));
    const edges = m.edges.filter((e) => names.has(e.name) && e.lvl === 0 && distAt(e.pts[0].x, e.pts[0].y) === t.d);
    check(edges.length >= 5, `${t.name}: ${edges.length} street edges`);
    for (const nm of names) check(edges.some((e) => e.name === nm), `${t.name}: ${nm} laid`);
    for (const e of edges) check(comp[e.a] === main && comp[e.b] === main, `${t.name}: ${e.name} at ${Math.round(e.pts[0].x / TILE)}, ${Math.round(e.pts[0].y / TILE)} on the one network`);
    const ends = new Set();
    for (const e of edges) for (const n of [e.a, e.b]) if (m.nodes[n].edges.length === 1) ends.add(n);
    check(ends.size <= 2, `${t.name}: ${ends.size} dead ends`);
    // the main street: the arterial through the town, straight east-west on its row across the town's ground
    const row = (t.main.y + 0.5) * TILE;
    const mainEdges = m.edges.filter((e) => e.name === t.main.line && e.lvl === 0 && e.kind === 'art');
    let onRow = 0, offRow = 0;
    for (const e of mainEdges) for (const p of e.pts) {
      if (distAt(p.x, p.y) !== t.d && !(p.x > (t.main.a + 4) * TILE && p.x < (t.main.b - 4) * TILE && Math.abs(p.y - row) < 40 * TILE)) continue;
      if (p.x < (t.main.a + 4) * TILE || p.x > (t.main.b - 4) * TILE) continue;
      if (Math.abs(p.y - row) <= 2) onRow++; else offRow++;
    }
    check(onRow >= 2 && offRow === 0, `${t.name}: ${t.main.line} straight through the town (${onRow} points on its row, ${offRow} off it)`);
    // 3. its buildings: lots fronting the main street (a door within 8 tiles of its row), less asphalt than buildings
    const blds = m.buildings.filter((b) => b && m.dist[(b.ty + (b.th >> 1)) * W + b.tx + (b.tw >> 1)] === t.d);
    check(blds.length >= 16, `${t.name}: ${blds.length} buildings`);
    // (a lot along the main street: the building's side toward it within 10 tiles of its row, inside the town's stretch of it)
    const fronting = blds.filter((b) => b.tx + b.tw > t.main.a && b.tx < t.main.b && ((b.ty + b.th <= t.main.y && b.ty + b.th >= t.main.y - 10) || (b.ty > t.main.y && b.ty <= t.main.y + 10)));
    check(fronting.length >= 5, `${t.name}: ${fronting.length} buildings fronting ${t.main.line}`);
    check(road < built, `${t.name}: ${road} tiles of road, ${built} of buildings`);
    console.log(t.name, JSON.stringify({ tiles, road, built, buildings: blds.length, fronting: fronting.length, ends: ends.size, edges: edges.length, onRow, offRow }));
    // 4. its basics and its own places
    const pois = m.pois.filter((p) => p && distAt(p.x, p.y) === t.d);
    const has = (kind, label) => pois.some((p) => p.kind === kind && (!label || p.label === label));
    check(has('gasstation'), `${t.name}: a gas station`);
    check(has('hospital') || has('police'), `${t.name}: a clinic or the sheriff`);
    check(pois.some((p) => /Diner|Bar|Sandpiper$/.test(p.label) || p.kind === 'club'), `${t.name}: a diner or a bar`);
    check(m.props.some((p) => p && p.t === 'busstop' && distAt(p.x, p.y) === t.d), `${t.name}: a bus stop`);
    check(m.pumps.some((q) => distAt(q.x, q.y) === t.d), `${t.name}: the gas station's pumps`);
    for (const sp of TOWN_SPECIALS.filter((s) => s.d === t.d)) sp.names.forEach((nm, k) => {
      const kind = sp.gas ? 'gasstation' : sp.biz[k];
      check(has(kind, nm), `${t.name}: ${nm} (${kind}) in the town (${(m.pois.find((p) => p && p.label === nm) || {}).kind || 'not built'})`);
    });
    // 5. clear of the main line and the highways: no building within the highways' room or on the track
    for (const b of blds) for (const [x, y] of [[b.tx, b.ty], [b.tx + b.tw, b.ty], [b.tx, b.ty + b.th], [b.tx + b.tw, b.ty + b.th]]) {
      for (const h of hwys) { const q = nearestOnPath(h.path, x, y); check(q.d >= 22, `${t.name}: ${b.name} at ${b.tx}, ${b.ty} ${q.d.toFixed(0)} tiles from the ${h.name}`); }
      for (const r of rails) { const q = nearestOnPath(r.path, x, y); check(q.d >= 14, `${t.name}: ${b.name} at ${b.tx}, ${b.ty} ${q.d.toFixed(0)} tiles from the main line (${r.name})`); }
    }
  }
  // the beach town's front (8.13.1): the boardwalk's planks along the top of its sand, the pier out over the sea
  const front = m.world3.towns.front || [];
  console.log('front', JSON.stringify(front));
  for (const t of TOWNS3.filter((q) => q.front)) {
    const f = front.find((q) => q.key === t.key) || {};
    check(f.boardwalk >= 200, `${t.name}: ${f.boardwalk} tiles of boardwalk`);
    check(f.pier >= 60, `${t.name}: ${f.pier} tiles of pier`);
    let wet = 0;
    for (let y = t.box[1]; y < m.h && y < t.box[3] + 120; y++) { const i = y * W + t.front.pier.x, tl = m.tiles[i]; if (tl === T.DOCK && prep.land.layers.water[i]) wet++; }
    check(wet >= 10, `${t.name}: the pier ${wet} tiles over the water`);
  }
  // the bowling alley stays in the city (a town's big building isn't its plain warehouse)
  const bowl = m.pois.find((p) => p && p.kind === 'bowling');
  check(bowl && !TOWNS3.some((t) => t.d === distAt(bowl.x, bowl.y)), 'Pinwheel Lanes not in a town');
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} problems`);
});
