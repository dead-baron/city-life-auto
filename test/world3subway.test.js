// World v3: the subways (docs/WORLD-V3.md 8.16). One world build, as the server builds it (server/world3.js): the
// skeleton's two subway lines laid as double track below ground (shared/world3-subway.js through the generator's
// railway passes, shared/map.js), their viaducts at grade over the water, every station a stop on each track with its
// kiosk on a plaza; and their trains run with the main line's for five minutes of game time (server/systems/trains.js:
// the signals) - every subway train runs and stops at its stations, and no train ever runs into another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { T, TILE, TICK_HZ } from '../shared/constants.js';
import { SUBWAYS, STATIONS } from '../shared/world3-skeleton.js';
import { subwayName } from '../shared/world3-subway.js';
import { TRACK_OFF } from '../shared/world3-rail.js';
import * as trains from '../server/systems/trains.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const mod = (a, n) => ((a % n) + n) % n;
const LINES = SUBWAYS.filter((l) => !l.loopOf);

test('the subways are laid: each line one loop of double track, below ground but on its viaducts, every station a stop', () => {
  const subs = M.rails.filter((r) => r.subway);
  assert.equal(subs.length, LINES.length, 'a loop per subway line');
  for (const sw of LINES) {
    const r = subs.find((q) => q.subway === sw.name);
    assert.ok(r, sw.name);
    // every station of the line (and of its loop) is a stop; a terminal once, the rest on both tracks
    const want = STATIONS.filter((s) => s.line === sw.name).map((s) => `${subwayName(s.name)} Station`);
    const got = r.stations.map((st) => st.name);
    for (const name of want) assert.ok(got.includes(name), `${sw.name}: ${name} a stop`);
    assert.ok(got.length >= want.length + 3, `${sw.name}: ${got.length} stops (both tracks)`);
    // below ground: the track is `under` but on the viaducts, where it crosses the water on a deck
    const under = r.pts.filter((p) => p.under).length / r.pts.length;
    assert.ok(under > 0.7 && under < 0.995, `${sw.name}: ${(under * 100).toFixed(0)}% below ground`);
    const decks = r.pts.filter((p) => !p.under && p.deck).length;
    assert.ok(decks * 8 / TILE > 150, `${sw.name}: ${Math.round(decks * 8 / TILE)} tiles of viaduct over the water`);
    let wet = 0;
    for (const p of r.pts) { if (p.under) continue; const t = M.tileAtPx(p.x, p.y); if (t === T.WATER || t === T.DEEP) wet++; }
    assert.equal(wet, 0, `${sw.name}: no track over open water off its deck`);
    // double track: the other way's track 96 px off, beside each stop's (the stops on a line's stretch come in pairs)
    const pair = r.stations.filter((st) => r.stations.filter((q) => q.name === st.name).length === 2);
    assert.ok(pair.length >= 8, `${sw.name}: ${pair.length} stops on both tracks`);
    for (const st of pair) {
      const o = r.stations.find((q) => q.name === st.name && q !== st);
      const d = Math.hypot(o.x - st.x, o.y - st.y);
      assert.ok(d > 2 * TRACK_OFF - 30 && d < 2 * TRACK_OFF + 260, `${sw.name} ${st.name}: the two tracks' stops ${Math.round(d)} px apart`);
    }
  }
  // Line 1 beside the Bay Bridge, Line 2 over the airport's strait: at grade there
  const l1 = subs.find((q) => q.subway === 'Subway Line 1'), l2 = subs.find((q) => q.subway === 'Subway Line 2');
  assert.ok(l1.pts.some((p) => !p.under && Math.abs(p.x / TILE - 2380) < 8 && p.y / TILE > 1880 && p.y / TILE < 2040), 'Line 1 on its viaduct beside the Bay Bridge');
  assert.ok(l2.pts.some((p) => !p.under && Math.hypot(p.x / TILE - 1362, p.y / TILE - 2480) < 60), 'Line 2 on its viaduct over the airport\'s strait');
});

test('the subway stations: a kiosk on a plaza with stairs down, one map point a station', (t) => {
  const subs = M.rails.filter((r) => r.subway);
  let kiosks = 0, all = 0;
  const none = [];
  for (const r of subs) {
    const names = new Set(r.stations.map((st) => st.name));
    for (const name of names) {
      all++;
      const sts = r.stations.filter((st) => st.name === name);
      for (const st of sts) assert.ok(st.under, `${r.name} ${name}: below ground`);
      // (no plaza near: the stairs down from the nearest pavement, as today's subway's fallback - 8.16 lists them)
      const k = sts[0].kiosk;
      if (!k) { none.push(name); assert.ok(sts[0].platform, `${name}: its way down`); continue; }
      kiosks++;
      for (const st of sts) assert.equal(st.kiosk, k, `${r.name} ${name}: one kiosk for both tracks`);
      // on its plaza: the paved plaza under the kiosk, fronting a street
      const pl = M.subwayPlazas.find((q) => q.name === name.replace(/ Station$/, ''));
      assert.ok(pl, `${name}: its plaza`);
      let paved = 0;
      // (open paving: the airport's apron is laid over its plaza afterwards; Northshore's has 28 of 32 - 8.16)
      const BLOCK = new Set([T.BUILDING, T.WALL, T.WATER, T.DEEP, T.ROAD, T.GRASS]);
      for (let y = pl.y; y < pl.y + pl.h; y++) for (let x = pl.x; x < pl.x + pl.w; x++) if (!BLOCK.has(M.tileAt(x, y))) paved++;
      assert.ok(paved >= pl.w * pl.h * 0.75, `${name}: the plaza paved (${paved})`);
      assert.ok(k.x0 >= pl.x * TILE - 8 && k.x0 + k.w <= (pl.x + pl.w) * TILE + 8, `${name}: the kiosk on its plaza`);
      // its one map point: the subway line calling there
      const pois = M.pois.filter((p) => p.kind === 'station' && p.label === name);
      assert.equal(pois.length, 1, `${name}: one map point`);
      assert.deepEqual(pois[0].services, [r.service], `${name}: ${r.service} calls`);
      for (const st of sts) assert.equal(st.poi, pois[0].id);
      // the stairs come down near the track (the platform below)
      assert.ok(Math.hypot(k.out.x - sts[0].x, k.out.y - sts[0].y) < 56 * TILE, `${name}: the kiosk ${Math.round(Math.hypot(k.out.x - sts[0].x, k.out.y - sts[0].y) / TILE)} tiles from the platform`);
    }
  }
  t.diagnostic(`${kiosks} kiosks for ${all} stations (none at ${none.join(', ') || '-'})`);
  assert.ok(kiosks >= all - 3, `${kiosks} kiosks for ${all} stations (none at ${none.join(', ')})`);
  // the main line's stations are still its own: no hub for a subway stop
  assert.ok(!M.railHubs.some((h) => / Subway Station$/.test(h.name) || h.calls.some(([ri]) => M.rails[ri].subway)), 'the hubs are the main line\'s');
});

// Two cars' outlines (oriented rectangles) overlap?
function overlap(a, b) {
  for (const ang of [a.a, a.a + Math.PI / 2, b.a, b.a + Math.PI / 2]) {
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const proj = (c) => Math.abs(Math.cos(c.a) * ux + Math.sin(c.a) * uy) * c.L / 2 + Math.abs(-Math.sin(c.a) * ux + Math.cos(c.a) * uy) * c.W / 2;
    if (Math.abs((b.x - a.x) * ux + (b.y - a.y) * uy) > proj(a) + proj(b)) return false;
  }
  return true;
}

test('the subway trains, five minutes with the main line\'s: each runs, stops at its stations, and no train runs into another', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const ts = w.trains, subR = new Set(w.rails.map((r, i) => (r.subway ? i : -1)).filter((i) => i >= 0));
  const subT = ts.filter((t) => subR.has(t.r));
  assert.ok(subT.length >= LINES.length * 2, `${subT.length} subway trains`);
  assert.equal(new Set(subT.map((t) => t.r)).size, LINES.length, 'trains on every subway line');
  const run = ts.map(() => ({ dist: 0, stops: new Set() }));
  let hits = 0, firstHit = null;
  for (let k = 0; k < TICK_HZ * 60 * 5; k++) {
    const before = ts.map((t) => t.s);
    w.step();
    ts.forEach((t, i) => { run[i].dist += mod(t.s - before[i], w.rails[t.r].len); if (t.dwellUntil) run[i].stops.add(t.stop); });
    if (k % 2) continue;
    const cars = [];
    // (a subway car below ground is a level deeper than the main line and its tunnels: it passes under, never into one)
    ts.forEach((t, i) => t.cars.forEach((c) => { const e = w.get(c.id); cars.push({ i, x: e.x, y: e.y, a: e.a, L: c.def.L, W: c.def.W, deep: subR.has(t.r) && e.sub ? 1 : 0 }); }));
    for (let p = 0; p < cars.length; p++) for (let q = p + 1; q < cars.length; q++) {
      const A = cars[p], B = cars[q];
      if (A.i === B.i || A.deep !== B.deep || Math.abs(A.x - B.x) > 260 || Math.abs(A.y - B.y) > 260) continue;
      if (overlap(A, B)) { hits++; firstHit ??= { k, a: A.i, b: B.i, x: Math.round(A.x / TILE), y: Math.round(A.y / TILE) }; }
    }
  }
  assert.equal(hits, 0, `trains ran into each other: ${JSON.stringify(firstHit)}`);
  ts.forEach((t, i) => {
    if (!subR.has(t.r)) return;
    const r = w.rails[t.r];
    assert.ok(run[i].dist > 20000, `${r.name} train ${t.i}: ran ${Math.round(run[i].dist)} px`);
    assert.ok(run[i].stops.size >= 4, `${r.name} train ${t.i}: stopped at ${run[i].stops.size} stations`);
  });
  // the platform boards: a subway stop's lists its line
  const poi = M.pois.find((p) => p.kind === 'station' && p.sub === 'Subway Line 1');
  const b = trains.stationBoard(w, poi);
  assert.ok(b && /Subway Line 1/.test(b.sub || ''), `the board at ${poi.label}: ${b && b.sub}`);
});
