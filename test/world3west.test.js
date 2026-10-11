// World v3 (docs/WORLD-V3.md 8.20): the west coast in the whole-world build - Egret Point's district (after Dusty
// Hollow's: no id moves), its streets on the one road network (Wharf Street and Raceway Road across the Redwood Coast
// Road, Light Road on to the light), the village's places (the fish market, the bar, the bait shop, the charter office
// and its boat, the fishing shacks for sale), the quay and its piers with the fleet moored; Egret Point Light at the
// tip; the Westport Raceway's dirt oval, its grandstand and today's race starting there; the marsh's boardwalk over its
// creeks, the bird hide, the duck blinds, the dunes' board ramps; Silver Thread Falls over its basalt band at the head
// of Silver Thread Creek with the viewing platform, the creek on to the bay; North Cape Light on the cliff with the tide
// pools and sea stacks below; the coves down the Redwood Coast Road. One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, DISTRICTS } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { skeletonLines, nearestOnPath, STREAMS } from '../shared/world3-skeleton.js';
import { EGRET, WEST, WEST_IDS } from '../shared/world3-west.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: the west coast - Egret Point, its light, the raceway and the marsh; Silver Thread Falls, North Cape Light, the coves', { timeout: 300000 }, () => {
  // the district follows Dusty Hollow's (64)
  assert.equal(WEST_IDS.egret, 65);
  assert.deepEqual([DISTRICTS[65].id, DISTRICTS[65].name, DISTRICTS[65].style], [65, 'Egret Point', 'wild']);
  assert.equal(DISTRICTS[64].name, 'Dusty Hollow');
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, N = W * m.h;
  const distAt = (x, y) => m.dist[Math.floor(y / TILE) * W + Math.floor(x / TILE)];
  const near = (p, x, y, r) => Math.hypot(p.x / TILE - x, p.y / TILE - y) <= r;
  const bad = [];
  const check = (ok, msg) => { if (!ok) bad.push(msg); };
  const B = m.world3.west.built;
  console.log('west', JSON.stringify(m.world3.west));

  // 1. the ground: Egret Point's district (the village, the raceway, the streets' strips), no creek through it
  let tiles = 0, creeks = 0;
  for (let i = 0; i < N; i++) if (m.dist[i] === 65) { tiles++; if (m.river[i] && m.land[i] === 0 && m.tiles[i] === T.WATER && !(m.reserve[i] & 4)) creeks++; }
  check(tiles > 15000, `Egret Point's ground: ${tiles} tiles`);
  check(creeks === 0, `${creeks} tiles of tidal creek in Egret Point`);

  // 2. the streets on the one network (as test/world3desert.test.js)
  const comp = new Int32Array(m.nodes.length).fill(-1), sizes = [];
  for (let s = 0; s < m.nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const c = sizes.length, st = [s]; comp[s] = c; let n = 0;
    while (st.length) { const u = st.pop(); n++; for (const id of m.nodes[u].edges) { const e = m.edges[id], v = e.a === u ? e.b : e.a; if (comp[v] < 0) { comp[v] = c; st.push(v); } } }
    sizes.push(n);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  for (const [name, P] of EGRET.streets) {
    const edges = m.edges.filter((e) => e.name === name && e.lvl === 0);
    check(edges.length > 0, `${name} laid`);
    for (const e of edges) check(comp[e.a] === main && comp[e.b] === main, `${name} at ${Math.round(e.pts[0].x / TILE)}, ${Math.round(e.pts[0].y / TILE)} on the one network`);
    const len = edges.reduce((s, e) => s + Math.hypot(e.pts[e.pts.length - 1].x - e.pts[0].x, e.pts[e.pts.length - 1].y - e.pts[0].y) / TILE, 0);
    const want = P.slice(1).reduce((s, q, j) => s + Math.hypot(q[0] - P[j][0], q[1] - P[j][1]), 0);
    check(len >= want * 0.85, `${name}: ${len.toFixed(0)} of ${want.toFixed(0)} tiles laid`);
  }

  // 3. the village: its places, the shacks for sale, the quay, the piers and the fleet, the charter boat
  const pois = m.pois.filter((p) => p && distAt(p.x, p.y) === 65);
  for (const [kind, label] of [['fishmarket', 'Egret Point Fish Market'], ['club', 'The Gaff Hook'], ['tackle', 'Egret Point Bait & Tackle'], ['charter', 'Egret Point Charters']]) check(pois.some((p) => p.kind === kind && p.label === label), `${label} (${kind}) in Egret Point`);
  const shacks = m.homes.filter((h) => /^Egret Point Shack/.test(h.name));
  check(shacks.length >= 15 && shacks.every((h) => h.kind === 'shack' && h.price > 0 && pois.some((p) => p.kind === 'home' && p.home === h.id)), `${shacks.length} fishing shacks for sale`);
  check(B.quay >= 150, `the quay: ${B.quay} tiles`);
  check(B.piers >= 3, `${B.piers} piers`);
  const [bx0, by0, bx1, by1] = EGRET.box;
  const fleet = m.marina.filter((b) => b.x / TILE >= bx0 && b.x / TILE < bx1 + 40 && b.y / TILE >= by0 - 10 && b.y / TILE < by1 + 10);
  check(fleet.length >= 15, `${fleet.length} boats moored at Egret Point`);
  for (const b of fleet) { const t = m.tiles[Math.floor(b.y / TILE) * W + Math.floor(b.x / TILE)]; check(t === T.WATER || t === T.DEEP, `a boat at ${Math.round(b.x / TILE)}, ${Math.round(b.y / TILE)} on the water`); }
  check(fleet.some((b) => b.charter), 'the charter boat at its berth');

  // 4. Egret Point Light on the tip, at Light Road's end
  const light = m.buildings.find((b) => b && b.kind === 'lighthouse' && b.name === 'Egret Point Light');
  check(light && Math.hypot(light.tx - WEST.light[0], light.ty - WEST.light[1]) < 14, 'Egret Point Light at the tip');
  const lr = EGRET.streets.find((s) => s[0] === 'Light Road')[1], lend = lr[lr.length - 1];
  check(light && Math.hypot(light.tx - lend[0], light.ty - lend[1]) < 40, 'Light Road ends by the light (a track on over the sand)');

  // 5. the raceway: the dirt oval, the grandstand, today's race starting there
  const [rx0, ry0, rx1, ry1] = WEST.raceway;
  const rw = (m.raceways || []).find((r) => r.start && r.x / TILE >= rx0 && r.x / TILE < rx1 && r.y / TILE >= ry0 && r.y / TILE < ry1);
  check(rw && B.raceway && B.raceway.band >= 400, `the raceway's oval ${JSON.stringify(B.raceway)}`);
  check(m.raceways.filter((r) => r.start)[0] === rw, 'the raceway is the race\'s (the first with a start line)');
  const race = m.races.find((r) => r.name === 'Westport Raceway');
  check(race && race.start.x / TILE >= rx0 && race.start.x / TILE < rx1 && race.start.y / TILE >= ry0 && race.start.y / TILE < ry1, 'the Westport Raceway race starts on the oval');
  check(race && race.cps.every((c) => { const t = m.tiles[Math.floor(c.y / TILE) * W + Math.floor(c.x / TILE)]; return t === T.DIRT; }), 'the race\'s checkpoints on the dirt');
  check(m.pois.some((p) => p && p.kind === 'race' && p.label === 'Westport Raceway' && distAt(p.x, p.y) === 65), 'the race\'s start on the map');
  check(m.props.filter((p) => p && p.t === 'bleachers' && p.x / TILE >= rx0 && p.x / TILE < rx1 && p.y / TILE >= ry0 && p.y / TILE < ry1).length >= 2, 'the grandstand\'s bleachers');

  // 6. the marsh: the boardwalk over its creeks, the bird hide, the duck blinds, the dunes' board ramps
  check(B.boardwalk >= 300, `the boardwalk: ${B.boardwalk} tiles`);
  let overCreek = 0;
  for (let i = 0; i < N; i++) if (m.tiles[i] === T.DOCK && m.river[i] && m.dist[i] === 53) overCreek++;
  check(overCreek >= 4, `the boardwalk over the creeks: ${overCreek} tiles`);
  check(m.buildings.some((b) => b && b.name === 'Egret Marsh Bird Hide'), 'the bird hide');
  check(B.blinds >= 2 && m.buildings.filter((b) => b && b.name === 'Duck Blind').length === B.blinds, `${B.blinds} duck blinds`);
  check(B.ramps >= 2, `${B.ramps} board ramps down the dunes`);

  // 7. Silver Thread Falls: the falls at the head of the creek, the basalt band, the platform; the creek on to the bay
  const [fx, fy] = WEST.falls;
  check(m.props.some((p) => p && p.t === 'coastfall' && near(p, fx, fy, 20)), 'the falls');
  check(B.falls && B.falls.cliff >= 40 && m.props.filter((p) => p && p.t === 'cliffwall' && near(p, fx, fy, 30)).length >= 4, `the basalt band ${JSON.stringify(B.falls)}`);
  check(B.platform >= 20, `the viewing platform: ${B.platform} tiles`);
  check((m.landmarks || []).some((l) => l.name === 'Silver Thread Falls'), 'the falls on the map');
  const creek = STREAMS.find((s) => s.name === 'Silver Thread Creek');
  let dry = 0;
  for (let j = 1; j < creek.pts.length; j++) {
    const [ax, ay] = creek.pts[j - 1], [cx, cy] = creek.pts[j], n = Math.ceil(Math.hypot(cx - ax, cy - ay) / 20);
    for (let k = 0; k < n; k++) {
      const x = Math.round(ax + (cx - ax) * k / n), y = Math.round(ay + (cy - ay) * k / n);
      let wet = false;
      for (let dy = -12; dy <= 12 && !wet; dy++) for (let dx = -12; dx <= 12; dx++) { const i = (y + dy) * W + x + dx, t = m.tiles[i]; if (t === T.WATER || t === T.DEEP || t === T.BRIDGE || (m.river[i] && t !== T.ROAD)) { wet = true; break; } }
      if (!wet) dry++;
    }
  }
  check(dry <= 2, `Silver Thread Creek dry at ${dry} samples on its way to the bay`);

  // 8. North Cape Light on the cliff, the tide pools and the sea stacks below
  const cape = m.buildings.find((b) => b && b.kind === 'lighthouse' && b.name === 'North Cape Light');
  check(cape && Math.hypot(cape.tx - WEST.cape[0], cape.ty - WEST.cape[1]) < 140, 'North Cape Light');
  const life = cape ? m.props.filter((p) => p && /^(starfish|urchin|anemone)$/.test(p.t) && near(p, cape.tx, cape.ty, 40)).length : 0;
  check(life >= 5 && B.pools >= 5, `the tide pools: ${B.pools}, ${life} creatures`);
  check(cape && m.props.filter((p) => p && p.t === 'seastack' && near(p, cape.tx, cape.ty, 60)).length >= 2, 'sea stacks off the cape');

  // 9. the coves down the Redwood Coast Road
  const coves = (m.landmarks || []).filter((l) => l.type === 'cove' && /^(Redwood Cove North|Sea Stack Cove|Driftwood Cove)$/.test(l.name) && l.x / TILE < 700 && l.y / TILE > 1100 && l.y / TILE < 1900);
  check(coves.length >= 2 && B.coves === coves.length, `${coves.length} coves down the Redwood Coast Road`);
  check(B.stacks >= 6, `${B.stacks} sea stacks`);

  // 10. ours clear of the roads and the highways
  const SK = skeletonLines(), hwys = SK.filter((l) => l.kind === 'hwy');
  const ours = m.buildings.filter((b) => b && (m.dist[(b.ty + (b.th >> 1)) * W + b.tx + (b.tw >> 1)] === 65 || /Bird Hide|Duck Blind|North Cape Light/.test(b.name || '')));
  check(ours.length >= 25, `${ours.length} buildings of ours`);
  for (const b of ours) {
    for (let y = b.ty; y < b.ty + b.th; y++) for (let x = b.tx; x < b.tx + b.tw; x++) if (m.tiles[y * W + x] !== T.BUILDING && m.tiles[y * W + x] !== T.FLOOR && m.tiles[y * W + x] !== T.COUNTER) { check(false, `${b.name} at ${b.tx}, ${b.ty} not whole`); y = 1e9; break; }
    for (const h of hwys) { const q = nearestOnPath(h.path, b.tx, b.ty); check(q.d >= 22, `${b.name} at ${b.tx}, ${b.ty} ${q.d.toFixed(0)} tiles from the ${h.name}`); }
  }
  console.log('west coast', JSON.stringify({ tiles, shacks: shacks.length, fleet: fleet.length, overCreek, life, coves: coves.length, ours: ours.length }));
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} problems`);
});
