// World v3, stage 3, step 2 (docs/WORLD-V3.md 8.8): the mainland's biomes in the whole-world build - each new district
// (47-56) in the generator with its ground, each biome's dressing as dense as designed (trees in the woods, fields in
// the valley, rocks in the desert), the desert's ground without a repeating pattern. (v3b: no North Ridge, Northshore not painted yet.)
// One world build (about 25 s here, with today's world and the land before it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, DISTRICTS } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { DISTRICTS3 } from '../shared/world3-land.js';
import { peakHeight, SNOW_LINE, skeletonRoom } from '../shared/world3-biomes.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: the mainland\'s biomes - their districts, ground and dressing', { timeout: 300000 }, () => {
  // the new districts are the generator's (after today's: today's ids don't move), shaped like today's
  assert.equal(DISTRICTS.length, 66);   // (57-59: the first mainland towns, 8.13 - test/world3towns.test.js; 60-62: Lucky Mesa, 8.15 - test/world3mesa.test.js; 63-64: Copper Gulch, Dusty Hollow, 8.18 - test/world3desert.test.js; 65: Egret Point, 8.20 - test/world3west.test.js)
  DISTRICTS3.forEach((d, k) => assert.equal(DISTRICTS[47 + k], d));
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const L = prep.land.layers, W = m.w, N = W * m.h;
  // each mainland district: its tiles (land) and their ground
  const land = new Float64Array(80), tiles = Array.from({ length: 80 }, () => new Float64Array(16));   // (room for the districts to come: 8.18 took 64)
  for (let i = 0; i < N; i++) if (m.land[i]) { const d = m.dist[i]; land[d]++; tiles[d][m.tiles[i]]++; }
  const share = (d, ...ts) => ts.reduce((s, t) => s + tiles[d][t], 0) / land[d];
  // (v3b, docs/WORLD-V3.md part 9: the North Ridge, 51, has no area in the owner's layout - world3-skeleton.js)
  for (let d = 47; d <= 56; d++) if (d !== 51) assert.ok(land[d] > 10000, `${DISTRICTS[d].name}: ${land[d]} land tiles in the build`);
  for (let d = 0; d < N; d += 997) if (m.land[d]) assert.ok(DISTRICTS[m.dist[d]], `a district at tile ${d}`);
  assert.equal(new Set(Array.from({ length: 41 }, (_, k) => m.dist[(k * 100 + 50) * W + 200])).has(29), false, 'no stand-ins (Highland Woods is 47)');
  const problems = [], check = (ok, msg) => { if (!ok) problems.push(msg); };
  const g = Object.fromEntries([47, 48, 49, 50, 51, 52, 53, 54].map((d) => [d, { grass: share(d, T.GRASS), dirt: share(d, T.DIRT), sand: share(d, T.SAND), field: share(d, T.FIELD) }]));
  console.log('ground', JSON.stringify(g, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  check(g[47].grass > 0.85, 'Highland Woods: the forest floor');
  check(g[48].dirt > 0.5 && g[48].grass > 0.05 && g[48].grass < 0.45, 'Granite Peaks: rock and scree, alpine meadows');
  check(g[49].field > 0.2 && g[49].field < 0.75, 'Willow Valley: a patchwork of fields');
  check(g[50].dirt > 0.55 && g[50].sand > 0.05 && g[50].sand < 0.35, 'the Red Rock Desert: hardpan, sand sheets');
  for (const d of [52, 53, 54]) check(g[d].sand > 0.03, `${DISTRICTS[d].name}: its beach`);
  // the terrain classes at the v3 frame (the renderer's ground and the wildlife read them)
  const { cls, cw } = m.terrainCls;
  check(cw === Math.floor(W / 4), 'the terrain classes at the frame');
  const clsOf = (d) => { const c = new Float64Array(10); let n = 0; for (let y = 2; y < m.h; y += 16) for (let x = 2; x < W; x += 16) { const i = y * W + x; if (m.land[i] && m.dist[i] === d && L.terrain[i] !== 5) { c[cls[(y >> 2) * cw + (x >> 2)]]++; n++; } } return Array.from(c, (v) => v / n); };
  const wd = clsOf(47);
  console.log('classes', JSON.stringify({ woods: wd.map((v) => +v.toFixed(3)), peaks: clsOf(48).map((v) => +v.toFixed(3)), desert: clsOf(50).map((v) => +v.toFixed(3)) }));
  check(wd[2] > 0.8, `Highland Woods reads as forest (${wd[2].toFixed(3)})`);   // (v3b: 0.84 - the rest its meadows and clearings) const pk = clsOf(48); check(pk[4] + pk[9] > 0.9 && pk[9] > 0.05 && pk[9] < 0.5, `Granite Peaks as mountain, snow on the summits (${pk[9].toFixed(2)})`); check(clsOf(50)[3] > 0.9, 'the desert as desert');

  // the dressing, per km² of the district's land (a tile is a square metre)
  const per = new Map(), bump = (d, k) => { const o = per.get(d) || {}; o[k] = (o[k] || 0) + 1; per.set(d, o); };
  for (const p of m.props) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (tx < 0 || ty < 0 || tx >= W || ty >= m.h) continue;
    const d = m.dist[ty * W + tx];
    if (d < 47) continue;
    const k = p.t === 'redwood' || p.t === 'tree_a' || p.t === 'tree_b' ? 'trees' : p.t === 'outcrop' || p.t === 'boulder' ? 'rocks' : p.t === 'cactus' ? 'cacti' : 'plants';
    bump(d, k);
    if (p.t === 'outcrop' && p.w >= 192) bump(d, 'big');
    if (d === 48 && k === 'trees' && peakHeight(tx, ty) >= SNOW_LINE) bump(d, 'snowTrees');
    if (d === 47 && p.t === 'tree_a' && /Pine|fir|cedar|spruce/.test(p.sp || '')) bump(d, 'pines');
  }
  const km = (d, k) => ((per.get(d) || {})[k] || 0) / (land[d] / 1e6);
  const dens = Object.fromEntries([47, 48, 49, 50, 51, 53].map((d) => [d, Object.fromEntries(['trees', 'rocks', 'cacti', 'plants', 'big', 'pines'].map((k) => [k, Math.round(km(d, k))]))]));
  console.log('per km²', JSON.stringify(dens));
  check(km(47, 'trees') > 8000, 'Highland Woods: a dense forest');
  check(km(47, 'pines') > 1500, 'Highland Woods: stands of pine among the redwoods');
  check(km(48, 'rocks') > 600 && km(48, 'trees') > 1000, 'Granite Peaks: granite, and pines below the tree line');
  check(((per.get(48) || {}).snowTrees || 0) === 0, 'no tree above the snow line');
  check(km(50, 'rocks') > 150 && km(50, 'cacti') > 300 && km(50, 'plants') > 500, 'the desert: rocks, cacti, scrub');
  // (v3b: the relief's buttes - its tables under 30 tiles across their long radius - count with dress3's big blocks: the
  // tables fill the mesa country, dress3's blocks stand on the flats between)
  const buttes = (m.tables || []).filter((t) => Math.max(t.rx, t.ry) < 30).length / (land[50] / 1e6);
  check(km(50, 'big') + buttes > 10 && km(50, 'big') > 2 && (m.tables || []).length >= 90, `the desert: mesas (the relief's tables: ${(m.tables || []).length}) and buttes (${Math.round(buttes)} of the relief's, ${Math.round(km(50, 'big'))} big blocks per km²)`);   // (H50: the tables are the mesas - world3-relief.js; dress3's blocks thinned to buttes)
  check(km(53, 'plants') > 5000, 'the Egret Coast: reeds');
  // Willow Valley: fields, orchards, farmsteads
  const inD = (r, d) => m.dist[Math.floor((r.y + r.h / 2) / TILE) * W + Math.floor((r.x + r.w / 2) / TILE)] === d;
  const fields = m.fields.filter((r) => inD(r, 49)).length, farms = m.prefabs.filter((p) => p.key === 'farmstead' && m.dist[(p.ty + 2) * W + p.tx + 2] === 49).length;
  console.log('valley', fields, 'fields', farms, 'farmsteads', m.world3biomes.dress);
  check(fields / (land[49] / 1e6) > 15, `Willow Valley: ${fields} fields`);
  check(farms >= 10, `Willow Valley: ${farms} farmsteads`);
  check(m.world3biomes.dress.orchards >= 5 && m.world3biomes.dress.hedges > 1000, 'orchards and hedgerows');
  // the room along the skeleton's lines: no field, rock or farmstead on a highway's or an arterial's line
  const keep = skeletonRoom(W, m.h);
  let onLine = 0;
  for (let i = 0; i < N; i++) if (keep[i] && m.dist[i] >= 48 && m.tiles[i] === T.FIELD) onLine++;
  const bad = [];
  for (const p of m.props) if (p.t === 'outcrop' && keep[Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE)] && m.dist[Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE)] >= 48) bad.push(['outcrop', Math.floor(p.x / TILE), Math.floor(p.y / TILE), p.w, p.style]);
  for (const p of m.prefabs) if (p.key === 'farmstead' && m.dist[(p.ty + 2) * W + p.tx + 2] === 49 && keep[(p.ty + 2) * W + p.tx + 2]) bad.push(['farmstead', p.tx, p.ty]);
  check(onLine + bad.length === 0, `room left along the skeleton's lines: ${onLine} field tiles, ${JSON.stringify(bad.slice(0, 10))}`);
  // the desert's ground has no repeating pattern: sand at a tile says little about the tile 150-600 tiles on
  let worst = 0, dx0 = W, dy0 = m.h, dx1 = 0, dy1 = 0;   // (the desert's box: v3b's is the east, docs/WORLD-V3.md 9.3)
  for (let y = 0; y < m.h; y += 8) for (let x = 0; x < W; x += 8) if (m.dist[y * W + x] === 50) { dx0 = Math.min(dx0, x); dy0 = Math.min(dy0, y); dx1 = Math.max(dx1, x); dy1 = Math.max(dy1, y); }
  for (const [sx, sy] of [[150, 0], [0, 150], [280, 0], [0, 280], [140, 140], [420, 0], [0, 420], [600, 0]]) {
    let both = 0, one = 0;
    for (let y = dy0; y < dy1 - sy; y += 3) for (let x = dx0; x < dx1 - sx; x += 3) {
      const i = y * W + x, j = (y + sy) * W + x + sx;
      if (m.dist[i] !== 50 || m.dist[j] !== 50 || m.tiles[i] !== T.SAND) continue;
      one++; if (m.tiles[j] === T.SAND) both++;
    }
    worst = Math.max(worst, both / Math.max(1, one));
  }
  // (against the sand's own share: v3b's whole desert, its sand 29% of it - a repeating pattern would put P near 1; the
  // sand sheets' own reach correlates the nearest offsets a little)
  const base = g[50].sand;
  console.log('desert sand repeat (worst P(sand there | sand here))', worst.toFixed(3), 'its share', base.toFixed(3));
  check(worst < Math.max(0.4, base + 0.15), `the desert repeats (${worst.toFixed(2)} against its share ${base.toFixed(2)})`);

  // (Northshore at its beach: dropped for v3b - Northshore 31, North Point 32 and The Bluffs 34 aren't painted yet,
  // docs/WORLD-V3.md 9.4; the north coast is the Northshore Beaches' only: test/world3beach.test.js)
  assert.deepEqual(problems, []);
});
