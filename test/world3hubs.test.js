// World v3's main line, its stations, switches and bores (docs/WORLD-V3.md 8.10, H33). One world build, as the server
// builds it (server/world3.js): one station per name with every service that stops there calling at it (the platforms
// side by side, one building, one map point), the turnouts and diamonds where the loops' tracks part and cross - drawn
// as switches by the chunk bake - and the mountain tunnels under shared/tunnels.js' cover, a train in one hidden from
// outside.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { T, TILE, CHUNK_TILES } from '../shared/constants.js';
import { SERVICES, MAIN_JUNCTIONS, MAIN_LINE } from '../shared/world3-skeleton.js';
import { TRACK_OFF } from '../shared/world3-rail.js';
import { cityRailUnder } from '../shared/world3-city.js';
import { coverHides, underCover } from '../shared/tunnels.js';
import { railAt } from '../shared/mapcore.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const plain = (n) => n.replace(/ Station$/, '');
// (a station at one of the main line's junctions has its platforms on the straights either side of it, not side by side)
const atJunction = (h) => MAIN_JUNCTIONS.some((j) => Math.hypot(h.x / TILE - j.at[0], h.y / TILE - j.at[1]) < 120);

test('one station per name: every service that stops there calls at it, its platforms side by side, one map point', () => {
  const R = M.rails.filter((r) => !r.subway), names = new Set(R.flatMap((r) => r.stations.map((st) => st.name)));   // (the subway lines' stops are their own: test/world3subway.test.js)
  assert.equal(M.railHubs.length, names.size, 'a station for each name');
  for (const name of names) {
    const pois = M.pois.filter((p) => p.kind === 'station' && p.label === name);
    assert.equal(pois.length, 1, `${name}: one map point`);
    const h = M.railHubs.find((q) => q.name === name), want = SERVICES.filter((sv) => sv.stops.includes(plain(name))).map((sv) => sv.name);
    assert.deepEqual([...h.services].sort(), [...want].sort(), `${name}: the services calling`);
    assert.deepEqual(pois[0].services.slice().sort(), [...want].sort(), `${name}: its map point lists them`);
    assert.equal(pois[0].x, h.x, `${name}: the map point at the building`);
    // every loop of those services (each both ways) stops here, at the one map point, close to the building
    const loops = R.filter((r) => want.includes(r.service));
    assert.equal(h.calls.length, loops.length, `${name}: every loop calls`);
    for (const r of loops) {
      const st = r.stations.find((q) => q.name === name);
      assert.ok(st, `${r.name} calls at ${name}`);
      assert.equal(st.poi, pois[0].id, `${r.name} ${name}: the station's map point`);
      const d = Math.hypot(st.platform.x - h.x, st.platform.y - h.y);
      // (at a junction: the platforms either side of it, a footbridge each, the building by one pair)
      assert.ok(d < (atJunction(h) ? 2400 : 600), `${r.name} ${name}: its platform ${Math.round(d)} px from the building`);
      // the platform on straight track (a train stands along it)
      const a = railAt(r, st.s - st.half).a, b = railAt(r, st.s + st.half).a;
      assert.ok(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.12, `${r.name} ${name}: the platform on the straight`);
    }
    // a station on one stretch of line: the two ways' platforms face each other across the double track
    for (const sv of SERVICES.filter((q) => want.includes(q.name))) {
      const [p, q] = [1, -1].map((way) => R.find((r) => r.service === sv.name && r.way === way).stations.find((st) => st.name === name));
      if (atJunction(M.railHubs.find((o) => o.name === name)) || p.under || q.under) continue;   // (at a junction: on the straights either side of it; below ground: a subway platform)
      // side by side: across the double track from each other, overlapping along it
      const along = Math.abs((q.x - p.x) * Math.cos(p.a) + (q.y - p.y) * Math.sin(p.a)), across = Math.abs(-(q.x - p.x) * Math.sin(p.a) + (q.y - p.y) * Math.cos(p.a));
      assert.ok(along < p.half && Math.abs(across - 96) < 12, `${sv.name} at ${name}: its two platforms ${Math.round(along)} px apart along the line, ${Math.round(across)} across (side by side)`);
    }
  }
  // the busiest station: every service calling there, both ways, and a footbridge between its platforms
  const busiest = Math.max(...[...names].map((n) => SERVICES.filter((sv) => sv.stops.includes(plain(n))).length));
  const ns = M.railHubs.find((h) => SERVICES.filter((sv) => sv.stops.includes(plain(h.name))).length === busiest);
  assert.equal(ns.calls.length, busiest * 2, `${ns.name}: all ${busiest * 2} loops call`);
  assert.ok(ns.bridges.length >= 1, `${ns.name}: a footbridge between the platforms`);
});

test('the switches: turnouts where a loop leaves another\'s track, diamonds where it crosses the other way\'s - and the bake draws both tracks\' rails', async () => {
  const sw = M.railSwitches, tn = sw.filter((w) => w.kind === 'turnout'), dm = sw.filter((w) => w.kind === 'diamond');
  const R = M.rails.filter((r) => !r.subway);
  if (SERVICES.length > 1) {
    // (services sharing the main line's segments part and cross at its junctions: the switches there)
    assert.ok(tn.length >= 6, `${tn.length} turnouts`);
    assert.ok(dm.length >= 2, `${dm.length} diamonds`);
    // the junctions have their switches (where the tracks meet at ground level: under ground - a tunnel, an underpass - none are listed)
    for (const { name, at: [x, y] } of MAIN_JUNCTIONS) {
      if (sw.some((w) => Math.hypot(w.x - x * TILE, w.y - y * TILE) < 60 * TILE)) continue;
      // none listed: the tracks meet below ground there (a tunnel's mouth, an underpass) - the line goes under at the junction
      assert.ok(M.rails.some((r) => r.pts.some((p) => p.under && Math.hypot(p.x - x * TILE, p.y - y * TILE) < 30 * TILE)), `${name}: no switches listed, yet its tracks meet at ground level`);
    }
  } else {
    // World v3b: one service, both ways round one closed loop - each way on its own track the whole way round, so the
    // tracks never part or cross (no turnouts, no diamonds) and stay a double track's width apart everywhere
    assert.equal(tn.length + dm.length, 0, `${tn.length} turnouts, ${dm.length} diamonds on a line of one service`);
    const C = 256, key = (x, y) => Math.floor(x / C) * 65536 + Math.floor(y / C), cells = new Map();
    for (const p of R[1].pts) { const k = key(p.x, p.y); let a = cells.get(k); if (!a) cells.set(k, (a = [])); a.push(p); }
    let close = Infinity, where = null;
    for (const p of R[0].pts) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const q of cells.get(key(p.x + dx * C, p.y + dy * C)) || []) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < close) { close = d; where = [Math.round(p.x / TILE), Math.round(p.y / TILE)]; } }
    assert.ok(close > 2 * TRACK_OFF - 8, `the two ways' tracks ${close.toFixed(1)} px apart at ${where}`);
  }
  // the bake at a turnout - two tracks through the same pixels: the second track's rails are drawn (the bake's second
  // field) - or, with none, on the double track at ground level
  const { bakeChunk, loadProviders, SpriteCache, providers } = await import('../client/art2/game/chunkbake.js');
  await loadProviders();
  const w = tn.find((q) => Math.hypot(q.x - q.fx, q.y - q.fy) > 40) || tn[0], CHP = CHUNK_TILES * TILE;
  const at = w ? [(w.x + w.fx) / 2, (w.y + w.fy) / 2] : ((p) => [p.x, p.y])(R[0].pts.find((p) => !p.under && !p.deck));
  const cx = Math.floor(at[0] / CHP), cy = Math.floor(at[1] / CHP);
  const g = bakeChunk(M, cx, cy, { quality: 1, seed: 1337, lowMem: true, artPx: 2, scratch: false }, new SpriteCache(50e6), providers).g;
  assert.ok(g && g.col && g.col.length > 0, 'the chunk baked');
});

test('the mountain tunnels: bores under the hill\'s cover, a train inside hidden from outside', () => {
  const bores = M.tunnels.filter((t) => t.kind === 'rail');
  // every stretch of the main line below ground (off its underpasses) is a bore through a hill or under the city's or a
  // town's streets or the water (shared/world3-rail.js mountainBores) - none runs under open, dry country uncovered
  const W = new Set([T.WATER, T.DEEP, T.BRIDGE, T.ROAD]);
  for (const r of M.rails.filter((q) => !q.subway)) for (let i = 0, n = r.pts.length; i < n;) {
    if (!r.pts[i].under || r.pts[i].underpass) { i++; continue; }
    let j = i; while (j + 1 < n && r.pts[j + 1].under && !r.pts[j + 1].underpass) j++;
    const mid = r.pts[(i + j) >> 1], built = cityRailUnder(mid.x / TILE, mid.y / TILE) || r.pts.slice(i, j + 1).some((p) => [[0, 0], [-40, 0], [40, 0], [0, -40], [0, 40]].some(([dx, dy]) => W.has(M.tileAtPx(p.x + dx, p.y + dy))));
    assert.ok(built, `${r.name}: below ground ${Math.round((j - i) * 8 / TILE)} tiles from ${Math.round(r.pts[i].x / TILE)}, ${Math.round(r.pts[i].y / TILE)} under open country, not in a bore`);
    i = j + 1;
  }
  // (World v3b: the Grand Loop's skeleton tunnels are under the city and it is below ground only there and under the
  // towns - no tunnel through the hills, so no bores; WR3's had them through the peaks and under the ridge)
  const hills = MAIN_LINE.flatMap((L) => (L.tunnels || []).map(([a, b]) => L.pts[(a + b) >> 1]).filter(([x, y]) => !cityRailUnder(x, y)));
  if (!hills.length) { assert.equal(bores.length, 0, `${bores.length} rail bores with no tunnel through the hills`); return; }
  assert.ok(bores.length >= 2, `${bores.length} rail bores`);
  for (const t of bores) {
    assert.equal(t.mouths.length, 2, 'two portals');
    const r = M.rails[t.rail], p = railAt(r, (t.s0 + t.s1) / 2);
    assert.equal(underCover(M, p.x, p.y), t.id + 1, 'its middle under its cover');
    assert.ok(!r.pts.find((q) => Math.abs(q.s - (t.s0 + t.s1) / 2) < 8).under, 'the track at ground level under the hill');
    // a train in the bore, a viewer outside by the mouth: hidden; a viewer inside: seen
    const mo = t.mouths[0], out = { x: mo.x + mo.ox * 300, y: mo.y + mo.oy * 300 };
    assert.ok(coverHides(M, out.x, out.y, p.x, p.y), 'hidden from outside');
    assert.ok(!coverHides(M, p.x + 8, p.y, p.x, p.y), 'seen from inside');
  }
  // the Grand Loop's long bore through the peaks (or under the ridge) is one of them
  assert.ok(bores.some((t) => M.rails[t.rail].service === 'Grand Loop' && t.len > 200 * TILE), 'the Grand Loop through the mountains');
});
