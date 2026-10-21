// Highland Woods by hand (the nature program, 2026-10-20): the falls without straight lines (shared/world3-relief.js
// escarpment), Silver Thread Falls' horseshoe and its veil of threads (shared/world3-west.js), the straight river reaches'
// wandering banks (shared/world3-banks.js), and the woods' trails, their furniture, the glades and the fire lookout
// (shared/world3-trails.js; Nature-D2, Nature-C2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { fallsOf3 } from '../shared/world3-relief.js';
import { WOODS3 } from '../shared/world3-trails.js';
import { FALLS3 } from '../shared/world3-falls.js';
import { habitatAt } from '../server/systems/wildlife.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: Highland Woods - the falls, the trails and their furniture, the glades, the lookout', { timeout: 400000 }, async () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); };
  const R = m.relief, at = (x, y) => m.idx(x, y), tileAt = (x, y) => m.tiles[at(Math.floor(x / TILE), Math.floor(y / TILE))];

  // 1. no straight line round a falls: where the land steps down past each falls, the step's row wanders - never 30
  // columns on one row - and the high ground behind fades out before the box ends
  for (const f of fallsOf3(m)) {
    const rows = [];
    for (let x = f.x - 110; x <= f.x + 110; x += 2) {
      let best = 0, by = null;
      for (let y = f.y - 150; y < f.y + 30; y++) { if (!m.inside(x, y + 3)) continue; const d = R[at(x, y)] - R[at(x, y + 3)]; if (d > best) { best = d; by = y; } }
      rows.push(best >= 6 ? by : null);
    }
    // (straight: 30 columns of it on one row, give or take one)
    for (let k = 0; k + 15 <= rows.length; k++) {
      const w = rows.slice(k, k + 15).filter((r) => r !== null);
      if (w.length >= 13 && Math.max(...w) - Math.min(...w) <= 1) { check(false, `${f.name}: the step straight on row ${w[0]} for 30 columns from ${f.x - 110 + k * 2}`); break; }
    }
    const far = (dy) => { let s = 0, n = 0; for (let x = f.x - 20; x <= f.x + 20; x += 4) if (m.inside(x, f.y + dy)) { s += R[at(x, f.y + dy)]; n++; } return n ? s / n : 0; };
    check(Math.abs(far(-150) - far(-162)) < 4, `${f.name}: an edge where the high ground's box ends (${far(-150)} / ${far(-162)} m)`);
  }
  // 2. Silver Thread Falls: a horseshoe across the river's mouth (its middle bowed upstream), a dozen threads and more
  // over it, no band of rock out over the lake beside it
  const F = m.world3.west.built.falls;
  check(F && F.lip && F.threads >= 10, `Silver Thread Falls: ${F && F.threads} threads`);
  if (F && F.lip) {
    const rows = F.lip.row, mid = rows[rows.length >> 1];
    check(Math.min(...rows) === mid || mid - Math.min(...rows) <= 1, 'the horseshoe bowed in its middle');
    check(Math.max(...rows) - mid >= 5, `the horseshoe's arms ${Math.max(...rows) - mid} rows below its middle`);
    let band = 0;
    for (let x = F.lip.x0 - 40; x < F.lip.x0 - 3; x++) for (let y = F.lip.y - 3; y <= F.lip.y + 3; y++) if (m.inside(x, y) && m.tiles[at(x, y)] === T.WALL) band++;
    check(band <= 6, `rock out over the lake west of the falls: ${band} tiles`);
    const threads = m.props.filter((p) => p && p.t === 'coastfall' && p.x >= F.lip.x0 * TILE && p.x <= (F.lip.x1 + 1) * TILE);
    check(threads.length >= 10 && threads.some((p) => p.w >= 44), `the veil: ${threads.length} threads`);
  }
  // 2b. the falls in view (shared/world3-falls.js): no tree standing south of a fall where its sprite would hide it
  check(m.world3.fallsView && m.world3.fallsView.falls >= 3, `the falls looked at (${m.world3.fallsView && m.world3.fallsView.falls})`);
  for (const s of m.natureSites.filter((q) => FALLS3.kinds.has(q.kind) && q.falls)) {
    const f = s.falls, w = Math.max(f.w || 64, 96);
    const hiding = m.props.filter((p) => p && FALLS3.tall.re.test(p.t) && p.y > f.y - TILE && p.y < f.y + (FALLS3.tall.giant.test(p.t) ? FALLS3.tall.reach : FALLS3.tall.near) * TILE && Math.abs(p.x - f.x) < w / 2 + (FALLS3.tall.giant.test(p.t) ? FALLS3.side.giant : FALLS3.side.tree) * TILE);
    check(hiding.length === 0, `${s.name}: ${hiding.length} trees hiding its fall`);
  }
  // 3. the banks wander along the straight reaches
  check(m.world3.banks && m.world3.banks.wob > 500, `the straight reaches' banks: ${m.world3.banks && m.world3.banks.wob} tiles built out`);

  // 4. the trails: every one laid, nothing missed; the Highland Way end to end; on walkable ground all the way
  const TR = m.world3.trails;
  check(TR && TR.missed.length === 0, `missed: ${TR && TR.missed.join('; ')}`);
  for (const t of WOODS3.trails) check(TR.trails.some((q) => q.name === t.name), `the ${t.name}`);
  const way = TR.trails.find((q) => q.name === 'Highland Way');
  check(way && way.len >= 800, `the Highland Way ${way && way.len} tiles`);
  const OK = new Set([T.DIRT, T.DOCK, T.ROAD, T.BRIDGE, T.SAND, T.LOT, T.SIDEWALK, T.GRASS, T.PLAZA]);
  const WALK = new Set([T.DOCK, T.DIRT, T.BRIDGE]);
  const VEG = /^(tree_|redwood|shrub_|bush_)/;
  const vg = m.props.filter((p) => p && VEG.test(p.t));
  for (const s of m.natureSites.filter((q) => q.kind === 'trail' && q.line)) {
    let bad = 0, wet = 0, n = 0, trees = 0;
    for (let k = 1; k < s.line.length; k++) {
      const [x0, y0] = s.line[k - 1], [x1, y1] = s.line[k], L = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 16);
      for (let j = 0; j < L; j++) {
        const x = x0 + (x1 - x0) * j / L, y = y0 + (y1 - y0) * j / L, t = tileAt(x, y); n++;
        // (the line kept is every fourth point of the trail's: a chord may cut a shore's corner - the trail's own
        // planks or dirt within a tile of it is the trail)
        const near = (k) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (m.inside(tx + dx, ty + dy) && k.has(m.tiles[at(tx + dx, ty + dy)])) return true; return false; };
        if (t === T.WATER || t === T.DEEP) { if (!near(WALK)) wet++; } else if (!OK.has(t)) bad++;
      }
    }
    for (const p of vg) for (const [x, y] of s.line) if (Math.abs(p.x - x) < 20 && Math.abs(p.y - y) < 20) { trees++; break; }
    check(wet === 0 && bad <= n * 0.01, `the ${s.name}: ${wet} of ${n} steps in the water, ${bad} on what can't be walked`);
    check(trees === 0, `the ${s.name}: ${trees} trees standing on it`);
  }
  // the furniture: blazes all along, trailheads (board, sign, fountain), fingerposts, steps, the rope bridge over the gorge
  const count = (t) => m.props.filter((p) => p && p.t === t).length;
  check(count('blaze') >= 40, `${count('blaze')} blazes`);
  check(count('drinkfount') >= 2 && count('mapboard') >= 2, `${count('drinkfount')} drinking fountains, ${count('mapboard')} map boards`);
  check(count('fingerpost') >= 4, `${count('fingerpost')} fingerposts`);
  check(count('ropebridge') === 1, `${count('ropebridge')} rope bridges`);
  const gorge = TR.trails.find((q) => q.name === 'Gorge Trail');
  check(gorge && gorge.bridges.includes('ropebridge'), 'the Gorge Trail over its rope bridge');
  const rb = m.props.find((p) => p && p.t === 'ropebridge');
  if (rb) {
    // the gorge under it: deep below both ends, its water planked under the span (walkable, drawn as the water)
    const ty0 = Math.floor((rb.y - rb.len / 2 + 24) / TILE), ty1 = Math.floor((rb.y + rb.len / 2 - 24) / TILE), tx = Math.floor(rb.x / TILE);
    let low = 1e9; for (let y = ty0; y <= ty1; y++) low = Math.min(low, R[at(tx, y)]);
    check(Math.min(R[at(tx, ty0)], R[at(tx, ty1)]) - low >= 10, `the rope bridge's gorge: ${R[at(tx, ty0)]} and ${R[at(tx, ty1)]} m at its ends, ${low} m below`);
    let open = 0; for (let y = ty0; y <= ty1; y++) { const t = m.tiles[at(tx, y)]; if (t === T.WATER || t === T.DEEP || t === T.WALL) open++; }
    check(open === 0, `${open} tiles under the rope bridge's line not walkable`);
    // (its deck over the river: bridge tiles - the water still under them, one river)
    let deck = 0; for (let y = ty0; y <= ty1; y++) if (m.tiles[at(tx, y)] === T.BRIDGE && !m.land[at(tx, y)]) deck++;
    check(deck >= 4, `the rope bridge's deck over the water: ${deck} tiles`);
  }

  // 5. the glades: each with its fire ring (a rest spot), seat logs, the mossy log's mushrooms, berries; open (no tree in
  // the middle); the deer's
  check(TR.glades.length === WOODS3.glades.length, `${TR.glades.length} glades`);
  for (const g of TR.glades) {
    const near = (t, r) => m.props.filter((p) => p && p.t === t && Math.hypot(p.x - g.x, p.y - g.y) < r);
    check(near('campfire', 40).length === 1 && (m.restSpots || []).some((s) => s.kind === 'glade' && Math.hypot(s.x - g.x, s.y - g.y) < 40), `${g.name}: the fire ring`);
    check(near('log', 120).length >= 3 && near('rwlog', g.r + 40).length >= 1, `${g.name}: the seats and the mossy log`);
    const fo = (m.forage || []).filter((q) => Math.hypot(q.x - g.x, q.y - g.y) < g.r + 60);
    for (const k of ['redcap', 'goldTrumpet', 'ghostglass', 'berries']) check(fo.some((q) => q.k === k), `${g.name}: ${k}`);
    check(vg.filter((p) => (p.t.startsWith('tree_') || p.t === 'redwood') && Math.hypot(p.x - g.x, p.y - g.y) < g.r * 0.6).length === 0, `${g.name}: a tree in the clearing`);
    check(habitatAt(m, g.x + 40, g.y + 40).glade === 1, `${g.name}: the deer's glade`);
    check(m.natureSites.some((s) => s.kind === 'glade' && s.name === g.name), `${g.name}: listed`);
  }
  const pool = TR.glades.find((g) => g.pool);
  check(pool && m.props.some((p) => p && p.t === 'fallsmall' && Math.hypot(p.x - pool.pool.x, p.y - pool.pool.y) < 120), 'Hidden Pool: its pool and little fall');
  // 6. the fire lookout up on the ridge, its telescope
  const L = TR.lookout;
  check(L && m.props.some((p) => p && p.t === 'lookout' && Math.hypot(p.x - L.x, p.y - L.y) < 60) && m.props.some((p) => p && p.t === 'scope' && Math.hypot(p.x - L.x, p.y - L.y) < 140), 'the fire lookout and its telescope');
  // (high over the woods the trails walk: above the Highland Way's ground by a good way)
  const wl = m.natureSites.find((q) => q.kind === 'trail' && q.name === 'Highland Way');
  if (L && wl) { let mean = 0; for (const [x, y] of wl.line) mean += R[at(Math.floor(x / TILE), Math.floor(y / TILE))]; mean /= wl.line.length; check(L.h >= mean + 10, `the lookout ${L.h} m, the Highland Way ${Math.round(mean)} m on average`); }
  // 7. Pine Lake's stretched ways gone: the straight line from the campground to the lake is woods, not track
  const camp = (m.countrySites || []).find((q) => q.name === 'Pine Ridge Campground'), lake = m.natureSites.find((q) => q.name === 'Pine Lake');
  if (camp && lake) {
    let dirt = 0, n = 0;
    const ax = camp.x + camp.w, ay = camp.y, bx = lake.x / TILE - 20, by = lake.y / TILE;
    for (let k = 10; k < 90; k++) { const x = Math.round(ax + (bx - ax) * k / 100), y = Math.round(ay + (by - ay) * k / 100); n++; if (m.tiles[at(x, y)] === T.DIRT) dirt++; }
    check(dirt < n * 0.3, `the old straight way from the campground: ${dirt} of ${n} tiles still dirt`);
  }
  // Silver Thread Lake by hand (shared/world3-woodslake.js): its shore wandering, three rocky pine islets, the boathouse's
  // jetty and canoe hire (rowboats)
  const WL = m.world3.woodsLake, W = m.w;
  console.log('woods lake', JSON.stringify({ ...WL, dbg: undefined }));
  check(WL.lake > 15000 && WL.dug > 200 && WL.built > 200, `the lake's shore wanders: ${WL.dug} tiles dug, ${WL.built} built out`);
  check(WL.isles >= 2 && WL.pines >= WL.isles * 2, `islets with pines: ${WL.isles}, ${WL.pines}`);
  const isleTrees = m.props.filter((p) => p && p.t === 'tree_a' && (p.sp === 'pondPine' || p.sp === 'fir' || p.sp === 'spruce') && m.land[Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE)] && (() => { const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE); let wet = 0; for (const [dx, dy] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) { const t = m.tiles[(ty + dy) * W + tx + dx]; if (t === T.WATER || t === T.DEEP) wet++; } return wet === 4; })());
  check(isleTrees.length >= WL.isles, `the islets' pines out in the water: ${isleTrees.length}`);
  check(WL.boathouse && WL.boathouse.poi >= 0 && WL.boathouse.spots >= 2, `the boathouse and its hire: ${JSON.stringify(WL.boathouse)}`);
  if (WL.boathouse) {
    const [sx, sy] = WL.boathouse.shore;
    let dock = 0; for (let k = 0; k < 9; k++) if (m.tiles[(sy - k) * W + sx] === T.DOCK) dock++;
    check(dock >= 8, `the jetty out into the lake: ${dock} planks`);
    const R = m.rentals.find((r) => r.poi === WL.boathouse.poi);
    const { modelsAt } = await import('../server/systems/rentals.js');
    check(R && modelsAt(R).includes('rowboat'), `rowboats for hire: ${R && modelsAt(R)}`);
    const { BOAT_RENTAL_PRICE } = await import('../shared/rules.js');
    check(modelsAt(R).every((id) => BOAT_RENTAL_PRICE[id] > 0), 'each boat for hire has its price');
  }
  check(m.landmarks.some((l) => l.name === 'Silver Thread Lake') && m.landmarks.some((l) => l.name === 'Silver Thread Boathouse'), 'on the map');
  assert.deepEqual(fails, []);
});
