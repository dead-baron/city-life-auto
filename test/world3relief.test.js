// World v3 (docs/WORLD-V3.md 8.22): the land's relief in the whole-world build (shared/world3-relief.js) - the height
// field deterministic; the cliff bands off the roads and the roads keeping their grade; each landmark on its high
// ground (Lookout Hill, the headlands, the lookout's mesa, the falls' escarpments, the peaks, the North Ridge, the
// gorge under the Gorge Bridge); the desert's mesas and buttes big raised tables with cliff sides. One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { reliefOf3, reliefCliffs, HIGH_SPOTS, LOOKOUT_MESA, CLIFF_SLOPE, tableEdge, GORGE } from '../shared/world3-relief.js';
import { DESERT, HOLLOW } from '../shared/world3-desert.js';
import { TOWNS } from '../shared/world3-skeleton.js';
import { tableEdge as bakeEdge } from '../client/art2/game/groundbake.js';
import { bakeChunk, loadProviders, providers } from '../client/art2/game/chunkbake.js';
import { prepare } from '../tools/world3-build.mjs';

const fnv = (a) => { let h = 2166136261; for (let i = 0; i < a.length; i++) h = Math.imul(h ^ (Math.round(a[i] * 10) & 0xffff), 16777619); return h >>> 0; };

test('World v3: the land\'s relief - heights, cliff bands off the roads, the landmarks on high ground', { timeout: 300000 }, async () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, H = m.h, R = m.relief, sum = m.world3.relief;
  assert.ok(R && R.length === W * H, 'm.relief: a byte per tile');
  // deterministic: the field built twice from the same map and land is the same
  const a = reliefOf3(m, prep.land.layers), b = reliefOf3(m, prep.land.layers);
  assert.equal(fnv(a.z), fnv(b.z));
  assert.deepEqual(a.tables, b.tables);
  const box = (x, y, r = 2) => { let s = 0, n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const tx = x + dx, ty = y + dy; if (tx >= 0 && ty >= 0 && tx < W && ty < H) { s += R[ty * W + tx]; n++; } } return s / n; };
  // the land's around a point: the mean height of the land tiles on a ring
  const ring = (x, y, r0, r1) => { let s = 0, n = 0; for (let ty = y - r1; ty <= y + r1; ty += 3) for (let tx = x - r1; tx <= x + r1; tx += 3) { const d = Math.hypot(tx - x, ty - y); if (d < r0 || d > r1 || tx < 0 || ty < 0 || tx >= W || ty >= H || !m.land[ty * W + tx]) continue; s += R[ty * W + tx]; n++; } return n ? s / n : 0; };
  const bad = [], check = (ok, msg) => { if (!ok) bad.push(msg); };
  // the cliff bands (solid rock laid by the relief) are off the roads: no road, lot, pavement, bridge
  // or rail within a tile, no edge of the road graph within a tile and a half of one
  let cliffs = 0;
  const roadish = (i) => { const t = m.tiles[i]; return t === T.ROAD || t === T.BRIDGE || t === T.SIDEWALK || t === T.LOT || t === T.PLAZA || (m.reserve[i] & 2); };
  const cliffAt = reliefCliffs(m);
  assert.ok(cliffAt, 'the relief\'s cliff bands');
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!cliffAt[i]) continue;
    cliffs++;
    check(m.tiles[i] === T.WALL, `a cliff tile not solid at ${x}, ${y}`);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (roadish(i + dy * W + dx)) { check(false, `a cliff tile by a road at ${x}, ${y}`); dy = 2; break; }
  }
  check(cliffs > 5000, `cliff bands laid (${cliffs})`);
  for (const e of m.edges || []) {
    const pts = e.pts || [];
    for (let k = 0; k < pts.length; k++) {
      const tx = Math.floor(pts[k].x / TILE), ty = Math.floor(pts[k].y / TILE);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < W && y < H && cliffAt[y * W + x]) { check(false, `a road's edge over a cliff at ${x}, ${y}`); dy = 2; break; } }
    }
  }
  // roads keep their grade: next to each other, two road tiles never differ by a cliff's step
  let steep = 0;
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; if (m.tiles[i] !== T.ROAD || m.tiles[i + 2] !== T.ROAD) continue; if (Math.abs(box(x + 2, y, 1) - box(x, y, 1)) > 2 * CLIFF_SLOPE) steep++; }
  check(steep === 0, `road tiles a cliff's step apart: ${steep}`);
  // each high spot stands above the land round it
  for (const [name, at, r, h] of HIGH_SPOTS) {
    if (!at) continue;
    let top = 0;   // (its high ground: the highest within a fifth of its radius - a light may stand on the beach below)
    for (let dy = -r / 5; dy <= r / 5; dy += 3) for (let dx = -r / 5; dx <= r / 5; dx += 3) top = Math.max(top, box(Math.round(at[0] + dx), Math.round(at[1] + dy), 2));
    const round = ring(at[0], at[1], r, r + 40);
    check(top >= round + h * 0.45, `${name}: ${top.toFixed(1)} m against ${round.toFixed(1)} round it`);
  }
  // the lookout's mesa: the lookout on top, above Dusty Hollow
  const lk = box(DESERT.lookout[0], DESERT.lookout[1], 1), hollow = box(HOLLOW.at[0], HOLLOW.at[1], 3);
  check(lk >= hollow + LOOKOUT_MESA.h * 0.6, `the lookout at ${lk.toFixed(1)} m, Dusty Hollow ${hollow.toFixed(1)}`);
  // the desert's tables: many, twenty of them mesas over 80 tiles across, each top well above its foot, its rim a
  // cliff band
  // (v3b: carved out of the sketch's red areas, world3-layout.js GROUND3.mesa - big tables, buttes, spires and the
  // lobes of the big ones' ragged outlines, clear of the roads, towns and water: about 120 stand, 30 of them mesas)
  check(sum.tables >= 90 && sum.mesas >= 25 && sum.tableList.filter((t) => t.mesa && t.rx * 2 > 80).length >= 20 && sum.tableList.filter((t) => Math.max(t.rx, t.ry) < 18).length >= 15, `tables ${sum.tables}, mesas ${sum.mesas}`);
  // (its foot: the ground just past its talus, the lower third of it - the tables stand close, a wash between, and on
  // the coast the land falls away under them)
  const foot = (t) => { const v = [], [ex, ey] = [t.rx * 1.6 + 40, t.ry * 1.6 + 40]; for (let y = Math.floor(t.y - ey); y <= t.y + ey; y += 2) for (let x = Math.floor(t.x - ex); x <= t.x + ex; x += 2) { if (x < 0 || y < 0 || x >= W || y >= H || !m.land[y * W + x]) continue; const e = tableEdge(t, x, y); if (e >= 15 && e <= 25) v.push(R[y * W + x]); } v.sort((a, b) => a - b); return v.length ? v[Math.floor(v.length * 0.3)] : 0; };
  // (a table on the coast's falling ground may stand a little less above its foot: at most 2% of them, still well up)
  const lowTables = [];
  for (const t of sum.tableList) {
    const top = box(t.x, t.y, 3), ft = foot(t);
    if (top < ft + t.h * 0.6) { lowTables.push(`${t.x}, ${t.y}: ${top.toFixed(1)} m on ${ft.toFixed(1)} m`); check(top >= ft + t.h * 0.4, `the table at ${t.x}, ${t.y}: ${top.toFixed(1)} m on a ${ft.toFixed(1)} m foot`); }
    let rim = 0;
    for (let y = t.y - t.ry - 6; y <= t.y + t.ry + 6; y++) for (let x = t.x - t.rx - 6; x <= t.x + t.rx + 6; x++) if (x >= 0 && y >= 0 && x < W && y < H && cliffAt[y * W + x]) rim++;
    check(rim >= (t.rx + t.ry) * 1.2, `the table at ${t.x}, ${t.y}: ${rim} tiles of cliff round it`);
  }
  // the falls drop over a real band: the land above the lip well above the pool's
  check(sum.falls.includes('Silver Thread Falls'), `the falls: ${sum.falls.join(', ')}`);
  const head = m.world3.west?.built?.falls?.head;
  // (beside the falls: 30 tiles west of the head, or - v3b's falls span a wide river - the first land west of it)
  if (head) {
    let sx = head[0] - 30;
    while (sx > head[0] - 120 && !m.land[(head[1] - 14) * W + sx]) sx--;
    const up = box(sx - 3, head[1] - 14, 2), down = box(sx - 3, head[1] + 24, 2);
    check(up >= down + 10, `Silver Thread Falls: ${up.toFixed(1)} m above the band, ${down.toFixed(1)} below`);
  }
  // the peaks high, the ridge a ridge, the gorge cut under the Gorge Bridge
  let peak = 0;
  for (let y = 0; y < 760; y += 4) for (let x = 0; x < 2300; x += 4) peak = Math.max(peak, R[y * W + x]);
  check(peak >= 180, `the peaks' top ${peak} m`);
  // (the North Ridge: dropped - v3b has none, world3-skeleton.js)
  // (the gorge: v3b's below the woods' big falls - its floor at the middle of GORGE's middle stretch, the land 50 tiles
  // either side of it)
  {
    const [[ax, ay], [bx, by]] = [GORGE[1], GORGE[2]], l = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / l, ny = (bx - ax) / l;
    const fx = Math.round((ax + bx) / 2), fy = Math.round((ay + by) / 2), sa = [Math.round(fx + nx * 50), Math.round(fy + ny * 50)], sb = [Math.round(fx - nx * 50), Math.round(fy - ny * 50)];
    check(box(fx, fy, 3) <= Math.min(box(...sa, 3), box(...sb, 3)) - 15, `the gorge: ${box(fx, fy, 3)} m on its floor, ${box(...sa, 3)} and ${box(...sb, 3)} either side`);
  }
  // the gulf's islands stay flat (today's places)
  const metro = TOWNS.find((t) => t.name === 'Metro City').at;
  check(box(metro[0], metro[1], 4) < 6, `Metro City ${box(metro[0], metro[1], 4)} m`);

  // (H50) the tables' looks: m.tables for the bake, its rim the same as the relief's; red sandstone faces all round each
  // rim (the south, and the north, east and west too: arcs of 6 to 13 tiles since 2026-10-21, so six at least); no small mesa of 8.8's on a table, its talus or by its foot; no
  // band less than two tiles thick; Red Rock Canyon cut into the plateau
  check(m.tables && m.tables.length === sum.tables, `m.tables: ${m.tables && m.tables.length} of ${sum.tables}`);
  for (const t of m.tables || []) for (const [x, y] of [[t.x, t.y], [t.x + t.rx, t.y + 3], [t.x - 7, t.y - t.ry], [t.x + 11, t.y + t.ry + 6]]) check(Math.abs(tableEdge(t, x, y) - bakeEdge(t, x, y)) < 1e-9, `the bake's rim of the table at ${t.x}, ${t.y} is the relief's`);
  const faces = m.props.filter((p) => p.t === 'cliff' && p.st === 'sandstone');
  for (const t of m.tables || []) {
    const own = faces.filter((p) => Math.abs(p.x / TILE - t.x) < t.rx * 1.25 + 8 && Math.abs(p.y / TILE - t.y) < t.ry * 1.25 + 10);   // (2026-10-21: the rim wavers out by a fifth)
    const north = own.filter((p) => p.y / TILE < t.y - t.ry * 0.5).length, south = own.filter((p) => p.y / TILE > t.y + t.ry * 0.5).length;
    const east = own.filter((p) => p.x / TILE > t.x + t.rx * 0.6).length, west = own.filter((p) => p.x / TILE < t.x - t.rx * 0.6).length;
    check([north, south, east, west].filter((n) => n > 0).length >= 3 && north + south + east + west >= 6, `the table at ${t.x}, ${t.y}: sandstone faces north ${north}, south ${south}, east ${east}, west ${west} (a road's cutting may open one side)`);
  }
  const towers = m.props.filter((p) => p.t === 'outcrop' && p.style === 'sandstone' && p.s < 4 && (m.tables || []).some((t) => tableEdge(t, p.x / TILE, p.y / TILE) < 16));   // (dress3's: s 0-3 - 8.18's lookout rock and hoodoos stand on its mesa by design)
  check(towers.length === 0, `small mesas on the tables or their talus: ${towers.length}`);
  let thin = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!cliffAt[i]) continue;
    let ok = false;
    for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { const j = i + oy * W + ox; if (cliffAt[j] && cliffAt[j + 1] && cliffAt[j + W] && cliffAt[j + W + 1]) { ok = true; break; } }
    if (!ok) thin++;
  }
  check(thin === 0, `cliff tiles not in a band two tiles thick: ${thin}`);
  check(lowTables.length <= Math.max(1, Math.floor(sum.tableList.length * 0.02)), `tables standing low on their foot: ${lowTables.join('; ')}`);
  const cy = (m.paintings || []).find((p) => p.key === 'canyon');
  if (cy) {
    const cx0 = Math.floor(cy.x / TILE), cy0 = Math.floor(cy.y / TILE), cw = Math.round(cy.w / TILE), ch = Math.round(cy.h / TILE);
    let low = 1e9;
    for (let y = cy0 + 6; y < cy0 + ch - 6; y += 2) for (let x = cx0 + 6; x < cx0 + cw - 6; x += 2) if (m.tiles[y * W + x] !== T.WALL) low = Math.min(low, box(x, y, 1));
    const round = ring(Math.round(cx0 + cw / 2), Math.round(cy0 + ch / 2), Math.round(Math.max(cw, ch) / 2 + 12), Math.round(Math.max(cw, ch) / 2 + 30));
    check(low <= round - 4, `Red Rock Canyon's floor ${low.toFixed(1)} m in ground ${round.toFixed(1)} m`);
  }
  // (H50) the hillshade over the canopy: a chunk on Lookout Hill's slope baked with and without the relief - the trees'
  // crowns (what stands over 8 px) shaded too
  await loadProviders();
  const [lx, ly] = HIGH_SPOTS[0][1], ccx = Math.floor((lx + 20) * TILE / 768), ccy = Math.floor(ly * TILE / 768), opt = { quality: 1, seed: 1337, artPx: 2 };   // (the orchard on its south-east slope)
  const withR = bakeChunk(m, ccx, ccy, opt, null, providers).g, keep = m.relief;
  m.relief = null;
  const without = bakeChunk(m, ccx, ccy, opt, null, providers).g;
  m.relief = keep;
  let tall = 0, shaded = 0;
  for (let i = 0; i < withR.z.length; i++) { if (withR.z[i] < 8) continue; tall++; if (Math.abs(withR.col[i * 4] - without.col[i * 4]) + Math.abs(withR.col[i * 4 + 1] - without.col[i * 4 + 1]) > 2) shaded++; }
  check(tall > 2000 && shaded > tall * 0.3, `Lookout Hill's canopy shaded: ${shaded} of ${tall} px standing over 8`);
  assert.deepEqual(bad, []);
});
