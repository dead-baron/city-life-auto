// World v3, stage 3, step 3: the main line (docs/WORLD-V3.md 8.10). One world build, as the server builds it
// (server/world3.js): the skeleton's main line laid as each service's loop both ways (shared/world3-rail.js through the
// generator's railway passes, shared/map.js), and its trains run on it for two minutes of game time
// (server/systems/trains.js: the signals).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { T, TILE, TICK_HZ } from '../shared/constants.js';
import { railAt } from '../shared/mapcore.js';
import { SERVICES, MAIN_JUNCTIONS } from '../shared/world3-skeleton.js';
import { TRACK_OFF } from '../shared/world3-rail.js';
import * as trains from '../server/systems/trains.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const mod = (a, n) => ((a % n) + n) % n;

test('the main line is laid: each service both ways, double track, its stations and crossings', () => {
  const R = M.rails;
  assert.equal(R.length, SERVICES.length * 2, 'a loop per service each way');
  assert.equal(M.rail, R[0], 'm.rail is the first loop');
  for (const sv of SERVICES) {
    for (const way of [1, -1]) {
      const r = R.find((q) => q.service === sv.name && q.way === way);
      assert.ok(r, `${sv.name} ${way}`);
      // every stop is a station on it (in its order round the loop), with a platform on its outer side
      const names = r.stations.map((st) => st.name.replace(/ Station$/, ''));
      assert.deepEqual([...names].sort(), [...sv.stops].sort(), `${r.name}: its stops`);
      for (const st of r.stations) {
        assert.equal(st.side, 1, `${r.name} ${st.name}: the platform on the outer side`);
        if (st.under) continue;
        // the platform: paved (or a deck over water) beside the track, on the right of the way it runs
        const q = railAt(r, st.s), px = q.x - Math.sin(q.a) * 72, py = q.y + Math.cos(q.a) * 72, t = M.tileAtPx(px, py);
        assert.ok([T.PLAZA, T.DOCK, T.ROAD, T.BRIDGE, T.SIDEWALK, T.BUILDING].includes(t), `${r.name} ${st.name}: a platform (tile ${t})`);
      }
    }
  }
  // double track: on Coast West's straight (Westport Junction - Northshore Junction) the two ways run 96 px apart
  const one = R.find((q) => q.service === 'Grand Loop' && q.way === 1), other = R.find((q) => q.service === 'Grand Loop' && q.way === -1);
  const mid = one.pts.find((p) => Math.abs(p.x / TILE - 2000) < 1 && Math.abs(p.y / TILE - 1700) < 4);
  assert.ok(mid, 'Coast West');
  let bd = Infinity;
  for (const p of other.pts) bd = Math.min(bd, Math.hypot(p.x - mid.x, p.y - mid.y));
  assert.ok(Math.abs(bd - 2 * TRACK_OFF) < 2, `the two tracks ${bd.toFixed(1)} px apart`);
  // the track bed: off the bores and the underpasses, every point is ballast, a bridge deck or a road it crosses
  let bad = 0, wet = 0;
  for (const r of R) for (const p of r.pts) {
    if (p.under) continue;
    const t = M.tileAtPx(p.x, p.y);
    if (t === T.WATER || t === T.DEEP) wet++;
    else if (![T.DIRT, T.BRIDGE, T.ROAD, T.DOCK].includes(t)) bad++;
  }
  assert.equal(wet, 0, 'no track over open water off a bridge');
  assert.ok(bad < 40, `${bad} track points off the bed`);
  // over the gulf: the Bay Bridge Line, the Harbor Line and the Cedar Line cross on bridge decks
  const bay = R.find((q) => q.service === 'Bay Loop' && q.way === 1);
  assert.ok(bay.pts.filter((p) => p.deck).length > 1000, 'the Bay Loop crosses the gulf on decks');
  // the skeleton's tunnels: the Grand Loop under the North Ridge, the Long Reach and the peaks
  assert.ok(one.pts.filter((p) => p.under && !p.underpass).length * 8 / TILE > 1000, 'the Grand Loop has its tunnels');
  // the roads it meets: gated level crossings (the arterials) and underpasses (the highways at grade)
  assert.ok(R.every((r) => r.crossings.length > 5), 'level crossings on every loop');
  assert.ok(one.pts.some((p) => p.underpass), 'the Grand Loop dips under the highways');
  // the junctions: every loop through a junction passes within a few tiles of it
  for (const j of MAIN_JUNCTIONS) {
    const near = R.filter((r) => r.pts.some((p) => Math.hypot(p.x / TILE - j.at[0], p.y / TILE - j.at[1]) < 60));
    assert.ok(near.length >= 2, `${j.name}: ${near.length} loops`);
  }
  // one map point per station place
  const pois = M.pois.filter((p) => p.kind === 'station');
  const names = new Set(R.flatMap((r) => r.stations.map((st) => st.name)));
  assert.ok(pois.length >= names.size && pois.length <= names.size * 2 + 4, `${pois.length} station map points for ${names.size} stations`);
});

// Two cars' outlines (oriented rectangles) overlap?
function overlap(a, b, la, wa, lb, wb) {
  const axes = [a.a, a.a + Math.PI / 2, b.a, b.a + Math.PI / 2];
  for (const ang of axes) {
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const proj = (c, L, W) => Math.abs(Math.cos(c.a) * ux + Math.sin(c.a) * uy) * L / 2 + Math.abs(-Math.sin(c.a) * ux + Math.cos(c.a) * uy) * W / 2;
    const d = Math.abs((b.x - a.x) * ux + (b.y - a.y) * uy);
    if (d > proj(a, la, wa) + proj(b, lb, wb)) return false;
  }
  return true;
}

test('the trains on the v3 main line, five minutes: every service runs, stops at its stations, and no train runs into another', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const ts = w.trains;
  assert.ok(ts.length >= SERVICES.length * 2, `${ts.length} trains`);
  const loops = new Set(ts.map((t) => t.r));
  assert.equal(loops.size, SERVICES.length * 2, 'trains on every loop');
  const run = ts.map(() => ({ dist: 0, stops: new Set(), last: null }));
  let hits = 0, steps = 0, firstHit = null;
  const downs = new Set();   // (the level crossings whose gates came down)
  const N = TICK_HZ * 60 * 5;   // (five minutes of game time: each train through several stations and junctions)
  for (let k = 0; k < N; k++) {
    const before = ts.map((t) => t.s);
    w.step();
    steps++;
    ts.forEach((t, i) => {
      const len = w.rails[t.r].len;
      run[i].dist += mod(t.s - before[i], len);
      if (t.dwellUntil) run[i].stops.add(t.stop);
    });
    w.xing.forEach((x, i) => { if (x.down) downs.add(i); });
    if (k % 2) continue;
    // every pair of cars of different trains: their outlines never overlap
    const cars = [];
    ts.forEach((t, i) => t.cars.forEach((c) => { const e = w.get(c.id); cars.push({ i, x: e.x, y: e.y, a: e.a, L: c.def.L, W: c.def.W }); }));
    for (let p = 0; p < cars.length; p++) for (let q = p + 1; q < cars.length; q++) {
      const A = cars[p], B = cars[q];
      if (A.i === B.i || Math.abs(A.x - B.x) > 260 || Math.abs(A.y - B.y) > 260) continue;
      if (overlap(A, B, A.L, A.W, B.L, B.W)) { hits++; firstHit ??= { k, a: A.i, b: B.i, x: Math.round(A.x / TILE), y: Math.round(A.y / TILE) }; }
    }
  }
  assert.equal(hits, 0, `trains ran into each other: ${JSON.stringify(firstHit)}`);
  // the gates: every loop's crossings, once each - they came down for the trains of the loops other than the first too
  assert.equal(w.xing.length, M.railXings.length);
  const others = [...downs].filter((i) => !M.railXings[i].uses.some((u) => u[0] === 0));
  assert.ok(downs.size > 20 && others.length > 5, `${downs.size} crossings closed, ${others.length} of them off the first loop`);
  // the NPCs see a train coming on any loop: right in front of a moving train on a loop other than the first
  const t = ts.find((q) => q.r > 0 && q.v > 100 && !w.rails[q.r].pts[Math.floor(q.s / 8) % w.rails[q.r].pts.length].under);
  if (t) { const q = railAt(w.rails[t.r], t.s + 200); assert.ok(trains.railThreat(w, q.x, q.y), 'a train coming on its loop is a threat'); }
  ts.forEach((t, i) => {
    const r = w.rails[t.r];
    assert.ok(run[i].dist > 8000, `${r.name} train ${t.i}: ran ${Math.round(run[i].dist)} px`);
    assert.ok(run[i].stops.size >= 2, `${r.name} train ${t.i}: stopped at ${run[i].stops.size} stations`);
  });
});
