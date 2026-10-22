// World v3 (docs/WORLD-V3.md 8.18): the Red Rock Desert's places besides Lucky Mesa, in the whole-world build - Copper
// Gulch's and Dusty Hollow's districts (after Lucky Mesa's: no id moves), Copper Gulch's main street (Mine Road pulled
// straight) and side streets on the one road network, Depot Road up to the freight yard, its planned places (the assay
// office, the saloon, the general store, the sheriff); Copper Gulch Mine (the open pit a quarry as today's, the adit
// with its seams, as the Old Granite Mine's), the freight yard's ore cars by the main line; Dusty Hollow's empty
// buildings, its hideout and smuggler's drop; Red Rock Dam on the reservoir's shore and the dry wash below; the lookout,
// the arch and the hoodoos; the motel, its pool and the billboards; the desert camp; nothing in the highways' room or on
// the main line; the white delineator posts along the desert's roads and its highways' gravel pull-offs; the windmills
// and stock tanks out on the range with their ranch gates; the tinajas at the cliffs' feet and the seep pools in the
// dam's wash; and the whole world tidied (nothing that needs dry ground in the water, no fence across a road). One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, DISTRICTS } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { skeletonLines, nearestOnPath } from '../shared/world3-skeleton.js';
import { GULCH, HOLLOW, DESERT, DESERT_SPECIALS, DESERT_IDS } from '../shared/world3-desert.js';
import { ROADSIDE3, PULLOFF3 } from '../shared/world3-roadside.js';
import { STOCK3 } from '../shared/world3-stocktanks.js';
import { TINAJA3 } from '../shared/world3-tinajas.js';
import { TIDY3 } from '../shared/world3-tidy.js';
import { undergroundOf, UG, caveOf } from '../shared/underground.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: the Red Rock Desert - Copper Gulch and its mine, Dusty Hollow, the dam, the lookout, the motel, the camp', { timeout: 300000 }, () => {
  // the districts follow Lucky Mesa's (60-62)
  assert.deepEqual([DESERT_IDS.gulch, DESERT_IDS.hollow], [63, 64]);
  assert.deepEqual([63, 64].map((d) => [DISTRICTS[d].id, DISTRICTS[d].name, DISTRICTS[d].style]), [[63, 'Copper Gulch', 'oldtown'], [64, 'Dusty Hollow', 'desert']]);
  assert.equal(DISTRICTS[62].name, 'Mesa Flats');
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, N = W * m.h;
  const distAt = (x, y) => m.dist[Math.floor(y / TILE) * W + Math.floor(x / TILE)];
  const bad = [];
  const check = (ok, msg) => { if (!ok) bad.push(msg); };
  const D = m.world3.desert;
  console.log('desert', JSON.stringify(D));

  // 1. the ground
  const tiles = { 63: 0, 64: 0 };
  for (let i = 0; i < N; i++) if (m.dist[i] === 63 || m.dist[i] === 64) tiles[m.dist[i]]++;
  check(tiles[63] > 9000 && tiles[64] > 3000, `the districts' ground ${JSON.stringify(tiles)}`);

  // 2. Copper Gulch's streets on the one network (as test/world3mesa.test.js), its main street straight on its row
  const comp = new Int32Array(m.nodes.length).fill(-1), sizes = [];
  for (let s = 0; s < m.nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const c = sizes.length, st = [s]; comp[s] = c; let n = 0;
    while (st.length) { const u = st.pop(); n++; for (const id of m.nodes[u].edges) { const e = m.edges[id], v = e.a === u ? e.b : e.a; if (comp[v] < 0) { comp[v] = c; st.push(v); } } }
    sizes.push(n);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  for (const [name] of GULCH.streets) {
    const edges = m.edges.filter((e) => e.name === name && e.lvl === 0);
    check(edges.length > 0, `${name} laid`);
    for (const e of edges) check(comp[e.a] === main && comp[e.b] === main, `${name} at ${Math.round(e.pts[0].x / TILE)}, ${Math.round(e.pts[0].y / TILE)} on the one network`);
  }
  const row = (GULCH.main.y + 0.5) * TILE;
  let onRow = 0;
  for (const e of m.edges.filter((q) => q.name === GULCH.main.line && q.lvl === 0)) for (let j = 1; j < e.pts.length; j++) { const a = e.pts[j - 1], b = e.pts[j]; if (Math.abs(a.y - row) < 2 && Math.abs(b.y - row) < 2 && a.x >= GULCH.main.a * TILE && b.x <= GULCH.main.b * TILE + TILE) onRow += Math.abs(b.x - a.x); }
  check(onRow >= 120 * TILE, `the main street: ${(onRow / TILE).toFixed(0)} tiles straight on its row`);
  // (v3b: Depot Road goes up to the freight yard north of the town - the main line's nearest station, Red Rock, is out
  // east on Hollow Road's way: world3-desert.js GULCH)
  const [fx0, fy0, fx1, fy1] = DESERT.freight;
  const near = Math.min(...m.edges.filter((e) => e.name === 'Depot Road').flatMap((e) => e.pts.map((p) => Math.hypot(Math.max(fx0 - p.x / TILE, 0, p.x / TILE - fx1), Math.max(fy0 - p.y / TILE, 0, p.y / TILE - fy1)))));
  check(near <= 12, `Depot Road ends ${near.toFixed(0)} tiles from the freight yard`);

  // 3. the town's places
  const pois = m.pois.filter((p) => p && distAt(p.x, p.y) === 63);
  for (const sp of DESERT_SPECIALS) sp.names.forEach((nm, k) => check(pois.some((p) => p.kind === sp.biz[k] && p.label === nm), `${nm} (${sp.biz[k]}) in Copper Gulch (${(m.pois.find((p) => p && p.label === nm) || {}).kind || 'not built'})`));
  check(pois.some((p) => p.kind === 'assay' && p.counter), 'the assay office buys ore at its counter');
  const gb = m.buildings.filter((b) => b && m.dist[(b.ty + (b.th >> 1)) * W + b.tx + (b.tw >> 1)] === 63);
  check(gb.length >= 25, `${gb.length} buildings in Copper Gulch`);
  check(m.pois.some((p) => p && p.label === 'Copper Gulch Freight Yard' && p.ore), 'the freight yard');
  check((D.built.oreCars || 0) >= 3, `${D.built.oreCars} ore cars by the main line`);
  check(m.props.some((p) => p && p.t === 'watertower' && distAt(p.x, p.y) === 63), 'the water tower');

  // 4. the mine: the open pit a quarry (the bake's terraces, the miners), the adit a mine as the Old Granite Mine's
  const pit = (m.quarries || []).find((q) => q.name === 'Copper Gulch Mine');
  check(pit && pit.w >= 80 * TILE && pit.h >= 60 * TILE, 'the open pit');
  const mine = (m.natureSites || []).find((q) => q.kind === 'mine' && q.name === 'Copper Gulch Mine');
  check(mine && mine.seams.length >= 3, 'the adit and its seams');
  check(m.props.some((p) => p && p.t === 'mineportal' && Math.abs(p.x - (DESERT.adit[0] + 0.5) * TILE) < 2 * TILE), 'the adit\'s portal');
  check(m.buildings.some((b) => b && b.name === 'Copper Gulch Crusher'), 'the crusher');
  // (Nature-B2: the way in as the concept has it - a face of red rock, the mine's sign, cactus round it, a two-rut track)
  if (mine) {
    const nearMine = (t, r) => m.props.filter((p) => p && p.t === t && Math.hypot(p.x - mine.x, p.y - mine.y) < r * TILE);
    check(nearMine('cliff', 2).some((p) => p.st === 'sandstone'), 'the adit in red rock');
    check(nearMine('textsign', 10).some((p) => /COPPER GULCH MINE/.test(p.text)), 'the mine\'s sign');
    check(nearMine('cactus', 12).length >= 6, `cactus round the adit (${nearMine('cactus', 12).length})`);
    const ty = Math.round(mine.y / TILE) + 6, tx = Math.round(mine.x / TILE) - 22, at = (x, y) => m.tiles[y * W + x] === T.SAND && (m.reserve[y * W + x] & 128);
    let ruts = 0; for (let x = tx - 6; x <= tx + 6; x++) { let col = ''; for (let y = ty - 4; y <= ty + 4; y++) col += at(x, y) ? '#' : '.'; if (/#\.+#/.test(col)) ruts++; }
    check(ruts >= 8, `the two-rut track in (${ruts} of 13 columns)`);
  }
  check((m.landmarks || []).some((l) => l.name === 'Copper Gulch Mine'), 'the mine on the map');
  // (the cave world of shared/underground.js under its adit - a cave per mine, the Old Granite Mine has its own, 8.19 -
  // the ore veins round the pit's faces and on the cave's walls - mined as today's)
  const U = undergroundOf(m), cave = U && mine && U.caves.find((K) => K.X === mine.x && K.face === mine.y);
  check(cave, 'the cave world through the adit');
  const pitVeins = U ? U.veins.filter((v) => v.ug === 0 && pit && v.x >= pit.x - 60 && v.x <= pit.x + pit.w + 60 && v.y >= pit.y - 60 && v.y <= pit.y + pit.h + 60).length : 0;
  const caveVeins = U && cave ? U.veins.filter((v) => v.ug === UG.CAVE && caveOf(U, v.x, v.y) === cave).length : 0;
  check(pitVeins >= 5 && caveVeins >= 10, `the ore veins: ${pitVeins} round the pit, ${caveVeins} in the cave`);
  console.log('mining', JSON.stringify({ pitVeins, caveVeins, chambers: cave?.chambers?.length }));

  // 5. Dusty Hollow: its ruins, the hideout, the smuggler's drop
  const hb = m.buildings.filter((b) => b && b.art && b.art.ghost);
  check(hb.length >= 8, `${hb.length} empty buildings in Dusty Hollow`);
  const hp = m.pois.filter((p) => p && distAt(p.x, p.y) === 64);
  check(hp.some((p) => p.kind === 'gang') && hp.some((p) => p.kind === 'smuggler'), `Dusty Hollow's hideout and drop (${hp.map((p) => p.kind)})`);
  check(hp.every((p) => p.kind === 'gang' || p.kind === 'smuggler'), 'nothing else open in Dusty Hollow');

  // 6. the dam, the wash, the lookout, the arch, the motel, the billboards, the camp
  // (v3b: the wall stands across the desert river's channel at DESERT.dam's columns - its width, not WR3's long shore)
  check(D.built.dam >= 0.7 * (DESERT.dam[1] - DESERT.dam[0]), `the dam: ${D.built.dam} tiles of wall`);
  check(D.built.wash >= 200, `the dry wash: ${D.built.wash} tiles`);
  check(m.props.some((p) => p && p.t === 'lookout' && Math.hypot(p.x / TILE - DESERT.lookout[0], p.y / TILE - DESERT.lookout[1]) < 12), 'the lookout on its mesa');
  check(m.props.some((p) => p && p.t === 'seaarch' && Math.hypot(p.x / TILE - DESERT.arch[0], p.y / TILE - DESERT.arch[1]) < 2) && (D.built.hoodoos || 0) >= 3, 'the arch and the hoodoos');
  check(D.built.motel && D.built.motel.rooms && D.built.motel.office, `the motel ${JSON.stringify(D.built.motel)}`);
  const [mx0, my0, mx1, my1] = DESERT.motel;
  let pool = 0;
  for (let y = my0; y < my1; y++) for (let x = mx0; x < mx1; x++) if (m.tiles[y * W + x] === T.WATER) pool++;
  check(pool >= 30, `the motel's pool: ${pool} tiles`);
  check(D.built.billboards >= 2, `${D.built.billboards} billboards on the highway`);
  check(D.built.camp >= 5, `the camp: ${D.built.camp} things`);
  check(D.built.tracks >= 400, `the jeep tracks: ${D.built.tracks} tiles`);

  // 7. clear of the highways and the main line
  const SK = skeletonLines(), hwys = SK.filter((l) => l.kind === 'hwy'), rails = SK.filter((l) => l.kind === 'main');
  const mineBox = [DESERT.pit[0] - 20, DESERT.pit[1] - 10, DESERT.pit[2] + 10, DESERT.pit[3] + 50];
  const ours = m.buildings.filter((b) => {
    if (!b) return false;
    const d = m.dist[(b.ty + (b.th >> 1)) * W + b.tx + (b.tw >> 1)];
    return d === 63 || d === 64 || b.art?.ghost || /Sundowner|Red Rock Dam|Crusher/.test(b.name || '') || (b.tx >= mineBox[0] && b.tx < mineBox[2] && b.ty >= mineBox[1] && b.ty < mineBox[3]);
  });
  for (const b of ours) for (const [x, y] of [[b.tx, b.ty], [b.tx + b.tw, b.ty], [b.tx, b.ty + b.th], [b.tx + b.tw, b.ty + b.th]]) {
    for (const h of hwys) { const q = nearestOnPath(h.path, x, y); check(q.d >= 22, `${b.name} at ${b.tx}, ${b.ty} ${q.d.toFixed(0)} tiles from the ${h.name}`); }
    for (const r of rails) { const q = nearestOnPath(r.path, x, y); check(q.d >= 14, `${b.name} at ${b.tx}, ${b.ty} ${q.d.toFixed(0)} tiles from the main line (${r.name})`); }
  }
  // 8. Mirage Lake by hand (shared/world3-mirage.js): its rim rounded out, the green belt and its palms, the white beach,
  // the jetty and its rowboat
  const ML = m.world3.mirage;
  console.log('Mirage Lake', JSON.stringify(ML));
  check(ML.lake > 100 && ML.added + ML.removed > 20, `Mirage Lake's rim (${ML.added} added, ${ML.removed} taken)`);
  check(ML.belt >= 80 && ML.palms >= 4, `its green belt (${ML.belt} tiles, ${ML.palms} palms)`);
  check(ML.beach >= 80 && ML.jetty >= 6, `its white beach (${ML.beach}) and jetty (${ML.jetty})`);
  const mls = m.natureSites.find((s) => s.kind === 'lake' && s.name === 'Mirage Lake');
  check(mls && m.props.some((p) => p && p.t === 'rowboat' && Math.hypot(p.x - mls.x, p.y - mls.y) < 30 * TILE), 'its rowboat by the jetty');
  check(mls && m.props.filter((p) => p && p.t === 'palm_a' && Math.hypot(p.x - mls.x, p.y - mls.y) < 30 * TILE).length >= 4, 'palms round it');
  // 9. the desert's roads by their furniture (shared/world3-roadside.js): white delineator posts along their shoulders -
  // on the sand or gravel by the asphalt, in the desert's districts only, never on a road, a designed place's ground,
  // a lot or a building; along several roads
  const RS = m.world3.roadside, dl = m.props.filter((p) => p && p.t === 'delineator');
  console.log('roadside', JSON.stringify(RS), dl.length);
  check(dl.length >= 100 && RS.roads >= 4 && dl.length <= ROADSIDE3.max, `${dl.length} delineators along ${RS.roads} desert roads`);
  const styleOf = DISTRICTS.map((d) => (d ? d.style : ''));
  const dlBad = dl.filter((p) => { const i = Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE); return !(m.tiles[i] === T.SAND || m.tiles[i] === T.DIRT) || !ROADSIDE3.styles.has(styleOf[m.dist[i]]) || (m.reserve[i] & (16 | 32 | 2 | 8)) || m.bld[i] >= 0; });
  check(dlBad.length === 0, `${dlBad.length} delineators off a desert road's shoulder (${dlBad.slice(0, 3).map((p) => [p.x / TILE | 0, p.y / TILE | 0])})`);
  // (by the asphalt: a road tile within a few tiles of each)
  const nearRoad = (p) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const t = m.tiles[(Math.floor(p.y / TILE) + dy) * W + Math.floor(p.x / TILE) + dx]; if (t === T.ROAD || t === T.BRIDGE) return true; } return false; };
  check(dl.every(nearRoad), 'each by the asphalt');
  // (the highways' too: Route 9 across the desert)
  const hwyT = new Set();
  for (const e of m.edges) if (e && e.kind === 'hwy' && !e.lvl && e.pts) for (let k = 1; k < e.pts.length; k++) {
    const a = e.pts[k - 1], b = e.pts[k], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 32)), r = Math.ceil(e.hw / TILE) + 2;
    for (let j = 0; j <= n; j++) { const x = Math.floor((a.x + (b.x - a.x) * j / n) / TILE), y = Math.floor((a.y + (b.y - a.y) * j / n) / TILE); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) hwyT.add((y + dy) * W + x + dx); }
  }
  const hwyPosts = dl.filter((p) => hwyT.has(Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE)));
  check(hwyPosts.length >= 20, `${hwyPosts.length} delineators along the desert's highways`);
  const railT = new Set();
  for (const r of m.rails || []) for (const q of r.pts || []) if (!q.under) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) railT.add((Math.floor(q.y / TILE) + dy) * W + Math.floor(q.x / TILE) + dx);
  const onRail = dl.filter((p) => railT.has(Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE)));
  check(onRail.length === 0, `${onRail.length} delineators at a level crossing (${onRail.slice(0, 3).map((p) => [p.x / TILE | 0, p.y / TILE | 0])})`);
  // 10. the windmills and stock tanks out on the range (shared/world3-stocktanks.js): far apart, each a windmill over
  // its tank (both solid), a trough, a two-rut track out to a road; on the map
  const ST = m.natureSites.filter((s) => s.kind === 'stocktank');
  console.log('stock tanks', JSON.stringify(m.world3.stockTanks));
  check(ST.length >= 4, `${ST.length} stock tanks`);
  for (const s of ST) {
    const near = (t, r) => m.props.some((p) => p && p.t === t && Math.hypot(p.x - s.x, p.y - s.y) < r * TILE);
    check(near('stocktank', 1) && near('windmill', 4) && near('trough', 4), `the tank at ${s.x / TILE | 0}, ${s.y / TILE | 0}: its windmill and trough`);
    check(STOCK3.districts.includes(m.dist[Math.floor(s.y / TILE) * W + Math.floor(s.x / TILE)]), 'out on the range');
    const sol = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = m.solidProps.get((Math.floor(y / TILE) + dy) * W + Math.floor(x / TILE) + dx); if (a && a.some((e) => Math.hypot(e.x - x, e.y - y) < 24)) return true; } return false; };
    check(sol(s.x, s.y) && sol(s.windmill[0], s.windmill[1]), `the tank and the windmill solid at ${s.x / TILE | 0}, ${s.y / TILE | 0}`);
    const [bx, by] = s.track[1];
    let road = false;
    for (let dy = -2; dy <= 2 && !road; dy++) for (let dx = -2; dx <= 2; dx++) if (m.tiles[(Math.floor(by / TILE) + dy) * W + Math.floor(bx / TILE) + dx] === T.ROAD) { road = true; break; }
    check(road, `its track out to a road (${s.track.map((q) => q.map((v) => v / TILE | 0))})`);
    check(ST.every((o) => o === s || Math.hypot(o.x - s.x, o.y - s.y) >= STOCK3.apart * TILE), 'far apart');
    const at = (t, r) => m.props.some((p) => p && p.t === t && Math.hypot(p.x - s.gate[0], p.y - s.gate[1]) < r * TILE);
    check(s.gate && at('gatearch', 1) && at('cattlegrid', 1) && at('mailbox', 4), `its ranch gate, cattle grid and mailbox at the road (${s.gate})`);
  }
  // 10b. the gravel pull-offs on the desert's highways (world3-roadside.js): far apart, each a gravel apron with a
  // shade ramada over a picnic table, a water tank and a bin; no delineator on one
  const PO = m.natureSites.filter((q) => q.kind === 'pulloff');
  console.log('pull-offs', JSON.stringify(m.world3.roadside.pullOffs));
  check(PO.length >= 2, `${PO.length} pull-offs on the desert's highways`);
  for (const q of PO) {
    const near = (t, r) => m.props.some((p) => p && p.t === t && Math.hypot(p.x - q.x, p.y - q.y) < r * TILE);
    const i = Math.floor(q.y / TILE) * W + Math.floor(q.x / TILE);
    check(near('pergola', 1) && near('picnic', 2) && near('otank', 8) && near('trashcan', 8), `the pull-off at ${q.x / TILE | 0}, ${q.y / TILE | 0}: its ramada, table, tank and bin`);
    check(m.tiles[i] === T.SAND && (m.reserve[i] & 128), 'on gravel');
    check(!m.props.some((p) => p && p.t === 'delineator' && Math.hypot(p.x - q.x, p.y - q.y) < 3 * TILE), 'no post in it');
    check(PO.every((o) => o === q || Math.hypot(o.x - q.x, o.y - q.y) >= PULLOFF3.apart * TILE), 'far apart');
  }
  // 10c. the desert's waters (shared/world3-tinajas.js): tinajas - pools of still water in a bowl of slickrock just
  // south of a cliff's foot, sandstone boulders on the rim, a palo verde; seep pools in the dam's dry wash, reeds at their
  // edges; each fresh still water (a pond), listed for the water bake's look and the ground bake's ring, on the map
  console.log('desert waters', JSON.stringify(m.world3.desertWaters));
  const TJ = m.natureSites.filter((q) => q.kind === 'tinaja'), SP = m.natureSites.filter((q) => q.kind === 'seep');
  check(TJ.length >= 4 && TJ.length <= TINAJA3.n, `${TJ.length} tinajas`);
  check(SP.length === TINAJA3.seeps.n, `${SP.length} seep pools`);
  const poolOf = (q) => { let n = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const i = (Math.floor(q.y / TILE) + dy) * W + Math.floor(q.x / TILE) + dx; if (m.tiles[i] === T.WATER && m.lake[i] === 2) n++; } return n; };
  const listed = (q, look) => m.waters.lk.some((L) => L.t === look && q.x / TILE >= L.box[0] - 1 && q.x / TILE <= L.box[2] + 1 && q.y / TILE >= L.box[1] - 1 && q.y / TILE <= L.box[3] + 1);
  const ring = (q, k) => (m.tinajas || []).some((e) => e.k === k && Math.hypot(e.x - q.x, e.y - q.y) < 2);
  for (const q of TJ) {
    const at = `the tinaja at ${q.x / TILE | 0}, ${q.y / TILE | 0}`, near = (t, r, f = () => true) => m.props.filter((p) => p && p.t === t && f(p) && Math.hypot(p.x - q.x, p.y - q.y) < r * TILE);
    check(poolOf(q) >= 6, `${at}: its water (${poolOf(q)} tiles, a pond's)`);
    check(TINAJA3.districts.includes(distAt(q.x, q.y + 3 * TILE)), `${at}: in the desert`);
    check(near('cliff', 9, (p) => p.relief && p.y < q.y && q.y - p.y < 6 * TILE && Math.abs(p.x - q.x) < p.w / 2 + TILE).length > 0, `${at}: just south of a cliff's foot (its face kept)`);
    check(near('boulder', 5, (p) => p.style === 'sandstone').length >= 3 && near('tree_a', 6, (p) => p.sp === 'paloVerde').length >= 1, `${at}: sandstone boulders on its rim, a palo verde`);
    check(listed(q, 'forest') && ring(q, 0), `${at}: listed for the bakes (clear green water, slickrock round it)`);
  }
  check(TJ.every((o) => TJ.every((q) => o === q || Math.hypot(o.x - q.x, o.y - q.y) >= TINAJA3.apart * TILE)), 'the tinajas far apart');
  const [bx0, by0, bx1, by1] = TINAJA3.seeps.box;
  for (const q of SP) {
    const at = `the seep at ${q.x / TILE | 0}, ${q.y / TILE | 0}`;
    check(poolOf(q) >= 6, `${at}: its water (${poolOf(q)} tiles)`);
    check(q.x / TILE >= bx0 && q.x / TILE < bx1 && q.y / TILE >= by0 && q.y / TILE < by1, `${at}: in the dam's wash`);
    check(m.props.filter((p) => p && p.t === 'shrub_a' && (p.sp === 'reeds' || p.sp === 'cattails') && Math.hypot(p.x - q.x, p.y - q.y) < 4 * TILE).length >= 3, `${at}: reeds at its edge`);
    check(listed(q, 'marsh') && ring(q, 1), `${at}: listed for the bakes (murky water, damp mud round it)`);
  }
  // 11. the world tidied last (shared/world3-tidy.js; the owner's 10-16 list): nothing that needs dry ground stands in
  // the water anywhere in the world, and no fence run crosses a road, a bridge or the water
  console.log('tidy', JSON.stringify(m.world3.tidy));
  const wetT = (x, y) => { const t = m.tiles[Math.floor(y / TILE) * W + Math.floor(x / TILE)]; return t === T.WATER || t === T.DEEP; };
  const dockBy = (x, y) => { for (let dy = -48; dy <= 48; dy += 16) for (let dx = -48; dx <= 48; dx += 16) { const t = m.tiles[Math.floor((y + dy) / TILE) * W + Math.floor((x + dx) / TILE)]; if (t === T.DOCK || t === T.BRIDGE) return true; } return false; };
  const inWater = m.props.filter((p) => p && TIDY3.LAND.has(p.t) && !(p.sp && TIDY3.WET_SP.has(p.sp)) && !(p.t === 'post' && dockBy(p.x, p.y)) && (p.t === 'yfence' && p.x1 !== undefined ? wetT((p.x + p.x1) / 2, (p.y + p.y1) / 2) : wetT(p.x, p.y)));
  check(inWater.length === 0, `${inWater.length} things in the water that need dry ground (${inWater.slice(0, 4).map((p) => [p.t, p.x / TILE | 0, p.y / TILE | 0])})`);
  const across = m.props.filter((p) => {
    if (!p || p.t !== 'fenceline' || !TIDY3.FENCE.has(p.kind || 'iron')) return false;
    const L = Math.hypot(p.tx || 0, p.ty || 0);
    for (let s = 0; s <= L; s += 8) { const t = m.tiles[Math.floor((p.y + (p.ty || 0) * (L ? s / L : 0)) / TILE) * W + Math.floor((p.x + (p.tx || 0) * (L ? s / L : 0)) / TILE)]; if (t === T.ROAD || t === T.BRIDGE || t === T.WATER || t === T.DEEP) return L >= 1; }
    return false;
  });
  check(across.length === 0, `${across.length} fences across a road or the water (${across.slice(0, 4).map((p) => [p.kind, p.x / TILE | 0, p.y / TILE | 0])})`);
  console.log('Red Rock Desert', JSON.stringify({ tiles, gulch: gb.length, hollow: hb.length, pois: pois.length, station: Math.round(near), ours: ours.length }));
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} problems`);
});
