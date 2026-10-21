// World v3 (docs/WORLD-V3.md 8.19): today's wild land's country sites in the whole-world build - Highland Woods'
// campground, roadside stop and radio mast in the v3 woods; Granite Peaks' quarry, observatory, campground, wind farm and
// mast up on the v3 peaks; Dry Creek's desert places (the oil field, the solar farm, the drive-in, the Route 9 stop, the
// radio mast, the wind farm, The Rusty Spur) in the Red Rock Desert's west. Each one built once, on its region's ground,
// joined by its own road to the one road network (never to a highway), clear of the skeleton's highways, main line and
// stations; the Granite Quarry's pit and Copper Gulch Mine's both have their ore veins (shared/underground.js takes the
// list). The nature sites moved whole round their anchors (Pine Lake, Summit Tarn and its falls, Granite Hot
// Springs, The Sentinel Stones; H47: Redwood Creek, Giants Loop, Fern Gorge, the Old Granite Mine, Red Rock Canyon's
// oasis, Mirage Camp, Splash Canyon), each built once at its spot; the tracks they look for by name (the Ridge Trail,
// the Canyon Track, the Mirage Track) on the one network, the lookout, the hunting camps and the trapper's cabin by
// them. (H51) Dry Creek's farm in Willow Valley's east side - its fields on open valley ground (no field over a road,
// the river, the main line's room or a town), the co-op, the farmhouses for sale, its roads on the network, the
// orchard and the vineyard; Redwood Cove and Granite Cove on their shores with their tracks; a cave per mine (two:
// the Old Granite Mine's and Copper Gulch Mine's, each its own region and mouth); the tracks' edges flagged for the
// traffic to keep off (notraffic) and nothing else; (v3b) the airstrips. One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { skeletonLines, nearestOnPath, STATIONS } from '../shared/world3-skeleton.js';
import { WILD_SITES, WILD_ROOM, MOVED, WILD_TRACKS, FARM, AIRSTRIPS3 } from '../shared/world3-wild.js';
import { T } from '../shared/constants.js';
import { SITES } from '../shared/countryside.js';
import { undergroundOf, caveOf, UG } from '../shared/underground.js';
import { SNOW_CLS } from '../shared/world3-biomes.js';
import { terrainAt } from '../shared/mapcore.js';
import { tableEdge } from '../shared/world3-relief.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: today\'s wild land\'s country sites at their v3 spots, each on its road', { timeout: 300000 }, () => {
  // every site of today's wild districts is in the placement table (Highland Woods, Granite Peaks, Dry Creek)
  const wild = SITES.filter((S) => !/Cedar|Westport Raceway/.test(S.name)).map((S) => S.name);
  assert.deepEqual(WILD_SITES.map((P) => P.name).sort(), wild.sort());
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w;
  const bad = [];
  const check = (ok, msg) => { if (!ok) bad.push(msg); };
  const Wd = m.world3.wild;
  console.log('wild', JSON.stringify(Wd));
  check(Wd.missed.length === 0, `not placed: ${Wd.missed.join(', ')}`);

  // the one road network (as test/world3desert.test.js)
  const comp = new Int32Array(m.nodes.length).fill(-1), sizes = [];
  for (let s = 0; s < m.nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const c = sizes.length, st = [s]; comp[s] = c; let n = 0;
    while (st.length) { const u = st.pop(); n++; for (const id of m.nodes[u].edges) { const e = m.edges[id], v = e.a === u ? e.b : e.a; if (comp[v] < 0) { comp[v] = c; st.push(v); } } }
    sizes.push(n);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const SK = skeletonLines(), hwys = SK.filter((l) => l.kind === 'hwy'), rails = SK.filter((l) => l.kind === 'main');
  for (const P of WILD_SITES) {
    const S = SITES.find((q) => q.name === P.name);
    // built once, where it was placed: its landmark, its lot on its region's ground
    const sites = m.countrySites.filter((s) => s.name === P.name), marks = (m.landmarks || []).filter((l) => l.name === P.name);
    check(sites.length === 1 && marks.length === 1, `${P.name}: built ${sites.length} / ${marks.length} times`);
    const s = sites[0];
    if (!s) continue;
    let own = 0;
    for (let ty = s.y; ty < s.y + S.h; ty++) for (let tx = s.x; tx < s.x + S.w; tx++) if (m.dist[ty * W + tx] === P.d) own++;
    check(own >= S.w * S.h * 0.95, `${P.name} on its region's ground (${own} of ${S.w * S.h} tiles in district ${P.d})`);
    check(Math.hypot(s.x + S.w / 2 - P.near[0], s.y + S.h / 2 - P.near[1]) <= 90, `${P.name} near its spot`);
    // clear of the skeleton's highways, main line and stations (every corner and the middle of the lot)
    for (const [x, y] of [[s.x, s.y], [s.x + S.w, s.y], [s.x, s.y + S.h], [s.x + S.w, s.y + S.h], [s.x + S.w / 2, s.y + S.h / 2]]) {
      for (const h of hwys) check(nearestOnPath(h.path, x, y).d >= WILD_ROOM.hwy - 2, `${P.name} in ${h.name}'s room`);
      for (const r of rails) check(nearestOnPath(r.path, x, y).d >= WILD_ROOM.main - 2, `${P.name} on the main line's room`);
      for (const st of STATIONS) if (st.line === 'main') check(Math.hypot(st.at[0] - x, st.at[1] - y) >= WILD_ROOM.station - 2, `${P.name} at ${st.name} station`);
    }
    // its road in: laid, on the one network, ending at its lot; no highway on it
    const name = `${S.name} Road`.replace(' Road Road', ' Road');
    const edges = m.edges.filter((e) => e.name === name && e.lvl === 0 && e.pts.some((p) => Math.abs(p.x / TILE - (s.x + S.w / 2)) < S.w + 100 && Math.abs(p.y / TILE - (s.y + S.h / 2)) < S.h + 100));
    check(edges.length > 0, `${name} laid`);
    check(edges.some((e) => comp[e.a] === main && comp[e.b] === main), `${name} on the one network`);
    check(edges.some((e) => e.pts.some((p) => Math.abs(p.x / TILE - (s.x + S.w / 2)) < 3 && Math.abs(p.y / TILE - (s.y + S.h)) < 6)), `${name} reaches the lot's gate`);
    for (const e of edges) for (const n of [m.nodes[e.a], m.nodes[e.b]]) for (const id of n.edges) check(m.edges[id].kind !== 'hwy', `${name} meets a highway`);
  }
  // the buildings each kind of site brings (countryside.js BUILD): the stops' forecourts, the roadhouse, the quarry's pit
  check(m.roadhouse && m.roadhouse.name === 'The Rusty Spur', 'The Rusty Spur, the roadhouse');
  const gq = m.countrySites.find((s) => s.name === 'Granite Quarry');
  const pits = m.quarries || [];
  check(pits.length === 2 && gq && pits.some((q) => q.x >= gq.x * TILE - TILE && q.x < (gq.x + 44) * TILE), `the quarries: ${pits.length}`);
  // the ore veins round each pit (shared/underground.js takes the list now)
  const U = undergroundOf(m);
  for (const pit of pits) {
    const n = U ? U.veins.filter((v) => v.ug === 0 && v.x >= pit.x - 60 && v.x <= pit.x + pit.w + 60 && v.y >= pit.y - 60 && v.y <= pit.y + pit.h + 60).length : 0;
    check(n >= 5, `${pit.name || 'the Granite Quarry'}'s veins: ${n}`);
  }
  // the nature sites moved whole (MOVED): each built once, at its spot, on its region's ground, clear of the skeleton's
  // highways and main line; no road through Summit Tarn or Pine Lake
  for (const q of MOVED) {
    const ns = m.natureSites.filter((n) => n.name === q.name), lm = (m.landmarks || []).filter((l) => l.name === q.name || l.name === `${q.name} Falls`);
    check(ns.length === 1 && lm.length === 1, `${q.name}: built ${ns.length} / ${lm.length} times`);
    if (!ns[0] || !lm[0]) continue;
    const x = ns[0].x / TILE, y = ns[0].y / TILE;
    check(Math.hypot(x - q.to[0], y - q.to[1]) < 48, `${q.name} at ${x.toFixed(0)}, ${y.toFixed(0)}, not its spot ${q.to}`);
    check(m.dist[Math.floor(y) * W + Math.floor(x)] === q.d, `${q.name} on its region's ground`);
    const L = lm[0], x0 = L.x / TILE, y0 = L.y / TILE, x1 = (L.x + L.w) / TILE, y1 = (L.y + L.h) / TILE;
    for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2]]) {
      for (const h of hwys) check(nearestOnPath(h.path, cx, cy).d >= WILD_ROOM.hwy - 2, `${q.name} in ${h.name}'s room`);
      for (const r of rails) check(nearestOnPath(r.path, cx, cy).d >= WILD_ROOM.main - 2, `${q.name} on the main line's room`);
    }
    let lake = 0, roadOnLake = 0;
    for (let ty = Math.floor(y0) - 10; ty < y1 + 10; ty++) for (let tx = Math.floor(x0) - 10; tx < x1 + 10; tx++) { const i = ty * W + tx; if (m.lake[i]) { lake++; if (m.tiles[i] === T.ROAD) roadOnLake++; } }
    if (q.name === 'Summit Tarn' || q.name === 'Pine Lake') check(lake > 100 && roadOnLake === 0, `${q.name}'s water: ${lake} tiles, ${roadOnLake} of road`);
  }
  // (H47) the tracks the moved sites look for by name: each laid, on the one network, reaching its end, no highway on it
  for (const K of WILD_TRACKS) {
    const es = m.edges.filter((e) => e.name === K.name && e.lvl === 0);
    check(es.length > 0 && es.some((e) => comp[e.a] === main && comp[e.b] === main), `${K.name} laid, on the one network`);
    check(es.some((e) => e.pts.some((p) => Math.hypot(p.x / TILE - K.end[0], p.y / TILE - K.end[1]) < 4)), `${K.name} reaches its end`);
    for (const e of es) for (const n of [m.nodes[e.a], m.nodes[e.b]]) for (const id of n.edges) check(m.edges[id].kind !== 'hwy', `${K.name} meets a highway`);
  }
  // what stands by them and the moved creek: the fire lookout, the hunting camps, the trapper's cabin on the beaver pond
  const named = (n) => (m.natureSites || []).filter((q) => q.name === n);
  check((m.landmarks || []).filter((l) => l.name === 'Ridge Fire Lookout').length === 1, 'Ridge Fire Lookout on the Ridge Trail');
  for (const [n, d] of [['Ridge Trail Hunting Camp', 48], ['Canyon Track Hunting Camp', 50], ["Redwood Creek Trapper's Cabin", 47]]) {
    const s = named(n);
    check(s.length === 1 && m.dist[Math.floor(s[0].y / TILE) * W + Math.floor(s[0].x / TILE)] === d, `${n}: ${s.length}, in district ${d}`);
  }
  check((m.beaverPonds || []).some((b) => b.name === 'Redwood Creek'), 'the beaver pond on Redwood Creek');
  // the Old Granite Mine's seams are worked; (H51) a cave per mine: the Old Granite Mine's and Copper Gulch Mine's, each
  // its own region (apart), entered by its own mouth, its own veins on its walls
  const ogm = named('Old Granite Mine')[0], cgm = named('Copper Gulch Mine')[0];
  check(ogm && ogm.seams.length >= 3 && ogm.cave !== false, 'the Old Granite Mine and its seams');
  const mineCaves = U ? U.caves.filter((c) => c.kind !== 'cavern') : [];   // (and after them the caverns: test/world3caves.test.js)
  check(mineCaves.length === 2, `two mine caves: ${mineCaves.length}`);
  for (const mine of [ogm, cgm]) {
    const K = U && mine && U.caves.find((c) => c.X === mine.x && c.face === mine.y);
    check(K && K.name === mine.name, `${mine?.name}'s cave`);
    if (!K) continue;
    check(caveOf(U, K.inside.x, K.inside.y) === K && caveOf(U, K.den.x, K.den.y) === K, `${mine.name}'s cave: in its own region`);
    check(U.veins.filter((v) => v.ug === UG.CAVE && caveOf(U, v.x, v.y) === K).length >= 10, `${mine.name}'s cave: its veins`);
  }
  if (U) { const rs = U.caves.map((c) => c.region); for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; check(a.x0 + a.w < b.x0 || b.x0 + b.w < a.x0 || a.y0 + a.h < b.y0 || b.y0 + b.h < a.y0, `the caves apart (${U.caves[i].name}, ${U.caves[j].name})`); } }
  // (H51) the tracks' edges flagged for the traffic to keep off - and only theirs
  const trackNames = new Set(WILD_TRACKS.map((K) => K.name));
  const flagged = m.edges.filter((e) => e.notraffic), unflagged = m.edges.filter((e) => trackNames.has(e.name) && e.kind === 'dirt' && !e.notraffic);
  check(flagged.length >= WILD_TRACKS.length && flagged.every((e) => trackNames.has(e.name)) && unflagged.length === 0, `the tracks flagged notraffic (${flagged.length}; others: ${flagged.filter((e) => !trackNames.has(e.name)).map((e) => e.name)}; missed: ${unflagged.map((e) => e.name)})`);
  // (H51) Granite Cove's bay open to Kestrel Lake (water all the way south from the beach), its water the lake's
  const gc = named('Granite Cove')[0];
  if (gc) {
    const cx = Math.floor(gc.x / TILE), cy = Math.floor(gc.y / TILE), j0 = (cy + 24) * W + cx;   // (j0: the lake's own water further out)
    let wet = 0, same = 0;
    for (let ty = cy + 2; ty <= cy + 16; ty++) { const i = ty * W + cx; if (!m.land[i]) wet++; if (!m.land[i] && m.lake[i] === m.lake[j0] && m.river[i] === m.river[j0]) same++; }
    check(!m.land[j0] && wet === 15 && same === 15, `Granite Cove's bay open to the lake: ${wet} of 15 tiles south of the beach water, ${same} as the lake's`);
  }
  // (v3b: the airstrips are world3-wild.js AIRSTRIPS3's - the valley's two grass strips and Lucky Mesa's - each built once,
  // on its region's ground; WR3's Route 9 strip is gone)
  for (const A of AIRSTRIPS3) {
    const ss = named(A.name), s0 = ss[0];
    check(ss.length === 1 && m.dist[Math.floor(s0.y / TILE) * W + Math.floor(s0.x / TILE)] === A.d, `${A.name}: built ${ss.length} times, in district ${s0 && m.dist[Math.floor(s0.y / TILE) * W + Math.floor(s0.x / TILE)]}`);
  }
  // (H51) Dry Creek's farm in the valley's east side: its fields on the valley's open ground - none over a road, the river,
  // a lake, the main line's room or a town; the co-op that takes harvests; the farmhouses and cottages for sale; the
  // Farm Road, the County Road and the Winery Road on the one network
  const FB = m.world3.wild.farmBuilt, fx0 = 1030 + FARM.d[0], fy0 = 350 + FARM.d[1], fx1 = 1206 + FARM.d[0], fy1 = 700 + FARM.d[1];
  console.log('farm', JSON.stringify({ roads: Wd.farm, built: FB }));
  check(FB && FB.fields >= 5, `the farm's fields: ${FB?.fields}`);
  let fieldBad = 0;
  for (const [rx, ry, rw, rh] of FB?.rects || []) for (let ty = ry; ty < ry + rh; ty++) for (let tx = rx; tx < rx + rw; tx++) {
    const i = ty * W + tx;
    if (m.tiles[i] !== T.FIELD) continue;
    if (!m.land[i] || m.river[i] || m.lake[i] || m.dist[i] !== FARM.region || rails.some((r) => nearestOnPath(r.path, tx, ty).d < WILD_ROOM.main - 1)) fieldBad++;
  }
  check(fieldBad === 0, `the farm's fields over the river, a lake, a town or the main line: ${fieldBad} tiles`);
  const coop = m.pois.find((p) => p.kind === 'farm' && p.label === 'Dry Creek Farm Co-op');
  check(coop && coop.cargoPad && m.dist[Math.floor(coop.y / TILE) * W + Math.floor(coop.x / TILE)] === FARM.region, 'the co-op that takes harvests');
  check(FB && FB.homes.length >= 3, `the farmhouses and cottages: ${FB?.homes?.length}`);
  for (const n of ['Farm Road', 'County Road', 'Winery Road']) {
    const es = m.edges.filter((e) => e.name === n && e.lvl === 0 && e.pts.some((p) => p.x / TILE > fx0 - 250 && p.x / TILE < fx1 + 250 && p.y / TILE > fy0 - 250 && p.y / TILE < fy1 + 250));
    check(es.length > 0 && es.some((e) => comp[e.a] === main && comp[e.b] === main), `${n} laid, on the one network`);
  }
  // Red Rock Canyon (the painting) in the desert, its oasis and wash; the water park's slides
  const pt = (m.paintings || []).find((p) => p.key === 'canyon');
  console.log('moved', JSON.stringify({ canyon: pt && [pt.x / TILE, pt.y / TILE], sites: (m.natureSites || []).filter((q) => /Gorge|Creek|Loop|Granite Mine|Oasis|Mirage|Splash|Camp|Cabin/.test(q.name)).map((q) => [q.name, Math.round(q.x / TILE), Math.round(q.y / TILE)]) }));
  check(pt && m.dist[Math.floor(pt.y / TILE + 18) * W + Math.floor(pt.x / TILE + 27)] === 50, 'Red Rock Canyon in the desert');
  check((m.landmarks || []).filter((l) => l.name === 'Red Rock Wash').length === 1, 'Red Rock Wash');
  check((m.tracks || []).some((t) => pt && Math.hypot(t.pts[0][0] / TILE - pt.x / TILE + 6, t.pts[0][1] / TILE - pt.y / TILE - 16) < 22), 'the oasis\'s track in from the Canyon Track');
  const wp = named('Splash Canyon Water Park')[0];
  check(wp && wp.slides && wp.slides.length > 0, 'the water park and its slides');
  // (H50) the tracks laid along the land, not straight: each found its way (no straight fallback), most wander off the
  // line from their start to their end; the Ridge Trail mostly off the snow, the fire lookout and the hunting camp off
  // it (the hunting camp, which naturesites.js sets by the trail's middle at the snow line, not yet: WORLD-V3.md 8.22);
  // no desert track over a table's top; the dry washes end short of the moved sites' boxes
  const snowAt = (x, y) => m.dist[Math.floor(y) * W + Math.floor(x)] === 48 && terrainAt(m.terrainCls.cls, m.terrainCls.cw, Math.floor(x), Math.floor(y)) === SNOW_CLS;   // (the snow the game draws)
  let wander = 0;
  for (const K of WILD_TRACKS) {
    const t = (Wd.tracks || []).find((q) => q.name === K.name);
    check(t && !t.missed && !t.fallback, `${K.name} laid along the land (${JSON.stringify(t)})`);
    const r = (m.roads || []).filter((q) => q.name === K.name).sort((a, b) => b.pts.length - a.pts.length)[0];
    if (!r) continue;
    const a = r.pts[0], b = r.pts[r.pts.length - 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    let dev = 0; for (const p of r.pts) dev = Math.max(dev, Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / l / TILE);
    if (dev >= 3) wander++;
    if (K.d === 50) for (const p of r.pts) if ((m.tables || []).some((tb) => tableEdge(tb, p.x / TILE, p.y / TILE) < -2)) { check(false, `${K.name} over a table's top at ${Math.round(p.x / TILE)}, ${Math.round(p.y / TILE)}`); break; }
    if (K.name === 'Ridge Trail') { const sn = r.pts.filter((p) => snowAt(p.x / TILE, p.y / TILE)).length; check(sn <= r.pts.length * 0.5, `the Ridge Trail on the snow: ${sn} of ${r.pts.length} points`); }   // (its points a tile or two apart: by its length; Summit Road, where it starts, runs in the snowfield - 53 of 125 in the build of 07:45)
  }
  check(wander >= WILD_TRACKS.length - 2, `tracks wandering off the straight line: ${wander} of ${WILD_TRACKS.length}`);
  const lk = (m.landmarks || []).find((l) => l.name === 'Ridge Fire Lookout');
  check(lk && !snowAt((lk.x + lk.w / 2) / TILE, (lk.y + lk.h / 2) / TILE), 'the Ridge Fire Lookout off the snow');
  for (const q of MOVED) if (q.keep) {
    const a = q.to[0] + q.keep[0], b = q.to[1] + q.keep[1], c = q.to[0] + q.keep[2], d = q.to[1] + q.keep[3];
    let wash = 0;
    for (let y = b - 5; y < d + 5; y++) for (let x = a - 5; x < c + 5; x++) if (m.tiles[y * W + x] === T.SAND && m.reserve[y * W + x] & 128 && m.dist[y * W + x] === 50) wash++;   // (a wash's gravel: sand flagged 128 - not the lush grass of Mirage Lake's green belt, world3-mirage.js)
    check(wash === 0, `${q.name}: ${wash} tiles of a dry wash within 5 tiles of its box`);
  }
  assert.deepEqual(bad, []);
});
