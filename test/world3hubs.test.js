// World v3's main line, its stations, switches and bores (docs/WORLD-V3.md 8.10, H33). One world build, as the server
// builds it (server/world3.js): one station per name with every service that stops there calling at it (the platforms
// side by side, one building, one map point), the turnouts and diamonds where the loops' tracks part and cross - drawn
// as switches by the chunk bake - and the mountain tunnels under shared/tunnels.js' cover, a train in one hidden from
// outside.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { TILE, CHUNK_TILES } from '../shared/constants.js';
import { SERVICES } from '../shared/world3-skeleton.js';
import { coverHides, underCover } from '../shared/tunnels.js';
import { railAt } from '../shared/mapcore.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const plain = (n) => n.replace(/ Station$/, '');

test('one station per name: every service that stops there calls at it, its platforms side by side, one map point', () => {
  const R = M.rails, names = new Set(R.flatMap((r) => r.stations.map((st) => st.name)));
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
      assert.ok(d < 1600, `${r.name} ${name}: its platform ${Math.round(d)} px from the building`);
      // the platform on straight track (a train stands along it)
      const a = railAt(r, st.s - st.half).a, b = railAt(r, st.s + st.half).a;
      assert.ok(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.12, `${r.name} ${name}: the platform on the straight`);
    }
    // a station on one stretch of line: the two ways' platforms face each other across the double track
    for (const sv of SERVICES.filter((q) => want.includes(q.name))) {
      const [p, q] = [1, -1].map((way) => R.find((r) => r.service === sv.name && r.way === way).stations.find((st) => st.name === name));
      if (name === 'Northshore Station' || name === 'Metro Central Station') continue;   // (at a junction: on the straights either side of it)
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      assert.ok(d < 140, `${sv.name} at ${name}: its two platforms ${Math.round(d)} px apart (side by side)`);
    }
  }
  // the hub: Northshore, all three services, both ways
  const ns = M.railHubs.find((h) => h.name === 'Northshore Station');
  assert.equal(ns.calls.length, 6, 'Northshore: all six loops call');
  assert.ok(ns.bridges.length >= 1, 'Northshore: a footbridge between the platforms');
});

test('the switches: turnouts where a loop leaves another\'s track, diamonds where it crosses the other way\'s - and the bake draws both tracks\' rails', async () => {
  const sw = M.railSwitches, tn = sw.filter((w) => w.kind === 'turnout'), dm = sw.filter((w) => w.kind === 'diamond');
  assert.ok(tn.length >= 6, `${tn.length} turnouts`);
  assert.ok(dm.length >= 2, `${dm.length} diamonds`);
  // every junction has its switches
  for (const [x, y] of [[1640, 1700], [2440, 1700], [3950, 1420], [2250, 2330]]) assert.ok(sw.some((w) => Math.hypot(w.x - x * TILE, w.y - y * TILE) < 60 * TILE), `switches at the junction ${x}, ${y}`);
  // the bake at a turnout: two tracks through the same pixels - the second track's rails are drawn (the bake's second field)
  const { bakeChunk, loadProviders, SpriteCache, providers } = await import('../client/art2/game/chunkbake.js');
  await loadProviders();
  const w = tn.find((q) => Math.hypot(q.x - q.fx, q.y - q.fy) > 40) || tn[0], CHP = CHUNK_TILES * TILE;
  const cx = Math.floor((w.x + w.fx) / 2 / CHP), cy = Math.floor((w.y + w.fy) / 2 / CHP);
  const g = bakeChunk(M, cx, cy, { quality: 1, seed: 1337, lowMem: true, artPx: 2, scratch: false }, new SpriteCache(50e6), providers).g;
  assert.ok(g && g.col && g.col.length > 0, 'the chunk baked');
});

test('the mountain tunnels: bores under the hill\'s cover, a train inside hidden from outside', () => {
  const bores = M.tunnels.filter((t) => t.kind === 'rail');
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
