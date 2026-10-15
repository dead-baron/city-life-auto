// World v3 (docs/WORLD-V3.md 8.15): Lucky Mesa, the casino city, in the whole-world build - its three districts (after
// the towns': no id moves), the Strip (Mesa Road straight through the city as a boulevard) and its side streets on the
// one road network, Station Road down to the main line's station, the resorts on their lots (each its own look, a
// casino door, pools and palms, the fountain lake), Old Downtown's covered street and its old casinos, the planned
// places (pawn shops, the gun shop, clubs, the bank, motels, wedding chapels, the counting room, the hospital, the
// police, the gas station), a bus stop; nothing in the highway's room or on the main line. One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, DISTRICTS } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { skeletonLines, nearestOnPath, STATIONS } from '../shared/world3-skeleton.js';
import { MESA, MESA_SPECIALS, MESA_IDS } from '../shared/world3-mesa.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: Lucky Mesa - districts, the Strip and its streets on the network, the resorts, the places, clear of the highway and the main line', { timeout: 300000 }, () => {
  // the districts follow the towns' (57-59)
  assert.deepEqual([MESA_IDS.strip, MESA_IDS.old, MESA_IDS.flats], [60, 61, 62]);
  assert.deepEqual([60, 61, 62].map((d) => [DISTRICTS[d].id, DISTRICTS[d].name, DISTRICTS[d].style, DISTRICTS[d].tier]),
    [[60, 'The Strip', 'nightlife', 'lux'], [61, 'Old Downtown', 'nightlife', 'low'], [62, 'Mesa Flats', 'houses', 'suburb']]);
  assert.equal(DISTRICTS[59].name, 'Sandpiper Bay');
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, N = W * m.h;
  const distAt = (x, y) => m.dist[Math.floor(y / TILE) * W + Math.floor(x / TILE)];
  const inMesa = (x, y) => { const d = distAt(x, y); return d >= 60 && d <= 62; };
  const bad = [];
  const check = (ok, msg) => { if (!ok) bad.push(msg); };
  console.log('mesa', JSON.stringify(m.world3.mesa));

  // 1. its ground
  const tiles = { 60: 0, 61: 0, 62: 0 };
  for (let i = 0; i < N; i++) if (m.dist[i] >= 60 && m.dist[i] <= 62) tiles[m.dist[i]]++;
  check(tiles[60] > 15000 && tiles[61] > 6000 && tiles[62] > 30000, `the districts' ground ${JSON.stringify(tiles)}`);

  // 2. the streets: the network's pieces (as test/world3roads.test.js) - every edge of the city's streets on the biggest
  const comp = new Int32Array(m.nodes.length).fill(-1), sizes = [];
  for (let s = 0; s < m.nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const c = sizes.length, st = [s]; comp[s] = c; let n = 0;
    while (st.length) { const u = st.pop(); n++; for (const id of m.nodes[u].edges) { const e = m.edges[id], v = e.a === u ? e.b : e.a; if (comp[v] < 0) { comp[v] = c; st.push(v); } } }
    sizes.push(n);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  for (const [name] of MESA.streets) {
    const edges = m.edges.filter((e) => e.name === name && e.lvl === 0);
    check(edges.length > 0, `${name} laid`);
    for (const e of edges) check(comp[e.a] === main && comp[e.b] === main, `${name} at ${Math.round(e.pts[0].x / TILE)}, ${Math.round(e.pts[0].y / TILE)} on the one network`);
  }
  // the Strip: Mesa Road a boulevard straight on its row from Old Downtown to the hub
  const row = (MESA.main.y + 0.5) * TILE;
  const strip = m.edges.filter((e) => e.name === MESA.main.line && e.kind === 'blvd' && e.lvl === 0);
  let len = 0, off = 0;
  for (const e of strip) { len += e.len; for (const p of e.pts) if (Math.abs(p.y - row) > 2) off++; check(comp[e.a] === main && comp[e.b] === main, 'the Strip on the one network'); }
  check(len >= 280 * TILE && off === 0, `the Strip: ${(len / TILE).toFixed(0)} tiles of boulevard, ${off} points off its row`);
  // Station Road from Route 9 to the station
  const stn = STATIONS.find((s) => s.name === 'Lucky Mesa' && s.line === 'main');
  const sr = m.edges.filter((e) => e.name === 'Station Road');
  const near = Math.min(...sr.flatMap((e) => e.pts.map((p) => Math.hypot(p.x / TILE - stn.at[0], p.y / TILE - stn.at[1]))));
  check(near <= 32, `Station Road ends ${near.toFixed(0)} tiles from the station`);

  // 3. the resorts: each on its lot, its own look in its buildings' art, a casino door (a named place), a pool or the
  // lake; palms on the drives
  const blds = m.buildings.filter((b) => b && inMesa((b.tx + b.tw / 2) * TILE, (b.ty + b.th / 2) * TILE));
  const looks = new Set();
  for (const R of MESA.resorts) {
    const [x0, y0, x1, y1] = R.lot;
    const own = blds.filter((b) => b.art && b.art.resort === R.look && b.tx >= x0 && b.tx + b.tw <= x1 && b.ty >= y0 && b.ty + b.th <= y1);
    const area = own.reduce((a, b) => a + b.tw * b.th, 0);
    check(own.length >= 1 && area >= 400, `${R.name}: ${own.length} buildings, ${area} tiles`);
    if (own.length) looks.add(R.look);
    check(m.pois.some((p) => p && p.casino && p.label === R.name && own.some((b) => b.id === p.b)), `${R.name}: its casino door`);
    let wet = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const t = m.tiles[y * W + x]; if (t === T.WATER || t === T.DEEP) wet++; }
    check(wet >= (R.look === 'lake' ? 300 : 40), `${R.name}: ${wet} tiles of pool${R.look === 'lake' ? ' and lake' : ''}`);
    const palms = m.props.filter((p) => p && /^palm/.test(p.t) && p.x >= x0 * TILE && p.x < x1 * TILE && p.y >= y0 * TILE && p.y < y1 * TILE).length;
    check(palms >= 6, `${R.name}: ${palms} palms`);
  }
  check(looks.size === MESA.resorts.length, `${looks.size} looks`);
  // Old Downtown's covered street: paving under the canopy, the old casinos fronting it
  const [cx0, cy0, cx1, cy1] = MESA.canopy;
  let paved = 0;
  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) if (m.tiles[y * W + x] === T.PLAZA) paved++;
  check(paved >= (cx1 - cx0) * (cy1 - cy0) * 0.85, `the covered street: ${paved} tiles of paving`);
  for (const [name] of MESA.oldCasinos) check(m.pois.some((p) => p && p.casino && p.label === name && p.y > (cy0 - 2) * TILE && p.y < (cy1 + 2) * TILE), `${name} fronting the covered street`);

  // 4. the places
  const pois = m.pois.filter((p) => p && inMesa(p.x, p.y));
  const count = (kind) => pois.filter((p) => p.kind === kind).length;
  for (const sp of MESA_SPECIALS) sp.names.forEach((nm, k) => {
    const kind = sp.gas ? 'gasstation' : sp.biz[k];
    check(pois.some((p) => p.kind === kind && p.label === nm), `${nm} (${kind}) in Lucky Mesa (${(m.pois.find((p) => p && p.label === nm) || {}).kind || 'not built'})`);
  });
  check(count('pawn') >= 2 && count('gunshop') >= 1 && count('club') >= 2 && count('bank') >= 1 && count('gang') >= 1, `the places ${JSON.stringify({ pawn: count('pawn'), gunshop: count('gunshop'), club: count('club'), bank: count('bank'), gang: count('gang') })}`);
  check(count('hospital') >= 1 && count('police') >= 1 && count('gasstation') >= 1, 'the hospital, the police, a gas station');
  check(pois.filter((p) => /Wedding Chapel|Chapel of/.test(p.label)).length >= 2, 'two wedding chapels');
  check(pois.filter((p) => /Motel|Motor Inn/.test(p.label)).length >= 3, 'the motels');
  check(m.pumps.some((q) => inMesa(q.x, q.y)), 'the gas station\'s pumps');
  check(m.props.some((p) => p && p.t === 'busstop' && inMesa(p.x, p.y)), 'a bus stop');
  check(m.props.some((p) => p && (p.t === 'atm' || p.t === 'atmw') && inMesa(p.x, p.y)) || count('atm') >= 1, 'an ATM');
  check(blds.length >= 100, `${blds.length} buildings`);   // (v3b: 116 - the skeleton's Mesa Flats Road and Route 9 take some of its ground)
  console.log('Lucky Mesa', JSON.stringify({ tiles, strip: Math.round(len / TILE), buildings: blds.length, pois: pois.length, casinos: pois.filter((p) => p.casino).length, station: Math.round(near) }));

  // 5. clear of the highway and the main line
  const SK = skeletonLines(), hwys = SK.filter((l) => l.kind === 'hwy'), rails = SK.filter((l) => l.kind === 'main');
  for (const b of blds) for (const [x, y] of [[b.tx, b.ty], [b.tx + b.tw, b.ty], [b.tx, b.ty + b.th], [b.tx + b.tw, b.ty + b.th]]) {
    for (const h of hwys) { const q = nearestOnPath(h.path, x, y); check(q.d >= 22, `${b.name} at ${b.tx}, ${b.ty} ${q.d.toFixed(0)} tiles from the ${h.name}`); }
    for (const r of rails) { const q = nearestOnPath(r.path, x, y); check(q.d >= 14, `${b.name} at ${b.tx}, ${b.ty} ${q.d.toFixed(0)} tiles from the main line (${r.name})`); }
  }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} problems`);
});
