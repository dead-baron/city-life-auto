// World v3, stage 3, step 3: the main line (docs/WORLD-V3.md 8.10). One world build, as the server builds it
// (server/world3.js): the skeleton's main line laid as each service's loop both ways (shared/world3-rail.js through the
// generator's railway passes, shared/map.js), and its trains run on it for two minutes of game time
// (server/systems/trains.js: the signals).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { T, TILE, TICK_HZ } from '../shared/constants.js';
import { railAt, crossingGate, CROSSING_ARM } from '../shared/mapcore.js';
import { SERVICES, MAIN_JUNCTIONS, MAIN_LINE, RADIUS, STATIONS, linePath, wetRanges } from '../shared/world3-skeleton.js';
import { segDist } from '../shared/geom.js';
import { deadWays } from '../server/systems/roadends.js';
import { TRACK_OFF } from '../shared/world3-rail.js';
import * as trains from '../server/systems/trains.js';
import * as players from '../server/systems/players.js';
import { joinPlayer, teleport } from './helpers.js';
import { IN } from '../shared/input.js';
import { TRAIN_DWELL_S, TRAIN_LOOP_HEADWAY_S, TRAIN_LOOP_MAX } from '../shared/rules.js';
import { command as devCommand } from '../server/dev.js';
import { offAxis, stationForecourt } from '../shared/world3-passes.js';
import { routeBoardAt } from '../shared/mapcore.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const mod = (a, n) => ((a % n) + n) % n;

test('the main line is laid: each service both ways, double track, its stations and crossings', () => {
  const R = M.rails.filter((r) => !r.subway);   // (the subway lines are loops of m.rails too: test/world3subway.test.js)
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
        // (at an angle to the grid the platform is drawn over the ground under it, paved or not: the test below)
        assert.ok([T.PLAZA, T.DOCK, T.ROAD, T.BRIDGE, T.SIDEWALK, T.BUILDING].includes(t) || (offAxis(q.a) && t !== T.WATER && t !== T.DEEP), `${r.name} ${st.name}: a platform (tile ${t})`);
      }
    }
  }
  // double track: half way along the main line's longest straight the two ways run 96 px apart
  const one = R.find((q) => q.service === SERVICES[0].name && q.way === 1), other = R.find((q) => q.service === SERVICES[0].name && q.way === -1);
  const legs = MAIN_LINE.flatMap((L) => L.pts.slice(1).map((b, k) => [L.pts[k], b])), long = legs.reduce((a, l) => (Math.hypot(l[1][0] - l[0][0], l[1][1] - l[0][1]) > Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]) ? l : a));
  const [cx, cy] = [(long[0][0] + long[1][0]) / 2, (long[0][1] + long[1][1]) / 2];
  const mid = one.pts.reduce((a, p) => (Math.hypot(p.x / TILE - cx, p.y / TILE - cy) < Math.hypot(a.x / TILE - cx, a.y / TILE - cy) ? p : a));
  assert.ok(Math.hypot(mid.x / TILE - cx, mid.y / TILE - cy) < 4, `the track half way along the straight ${long.join(' - ')}`);
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
  // over the water (the skeleton's line leaves the land: the gulf's channels, the rivers) on bridge decks where it is
  // at ground level - every loop
  const wetLen = MAIN_LINE.reduce((n, L) => n + wetRanges(linePath(L, L.r || RADIUS.main)).reduce((s, [a, b]) => s + b - a, 0), 0);
  assert.ok(wetLen > 100, `the main line crosses ${Math.round(wetLen)} tiles of water`);
  for (const r of R) assert.ok(r.pts.filter((p) => p.deck).length * 8 / TILE > 0.25 * wetLen, `${r.name} crosses the water on decks (${Math.round(r.pts.filter((p) => p.deck).length * 8 / TILE)} tiles)`);
  // the skeleton's tunnels (World v3b: under the city) and below ground through the city's districts and the towns
  assert.ok(one.pts.filter((p) => (p.under || p.bore) && !p.underpass).length * 8 / TILE > 1000, `${one.name} has its tunnels (the mountain ones bores under the hill: H33)`);
  // the roads it meets: gated level crossings (the arterials) and underpasses (the highways at grade)
  assert.ok(R.every((r) => r.crossings.length > 5), 'level crossings on every loop');
  assert.ok(one.pts.some((p) => p.underpass), 'the Grand Loop dips under the highways');
  // the junctions: every loop through a junction passes within a few tiles of it
  for (const j of MAIN_JUNCTIONS) {
    const near = R.filter((r) => r.pts.some((p) => Math.hypot(p.x / TILE - j.at[0], p.y / TILE - j.at[1]) < 60));
    assert.ok(near.length >= 2, `${j.name}: ${near.length} loops`);
  }
  // one map point per station place (the subway stops' are their own: test/world3subway.test.js)
  const pois = M.pois.filter((p) => p.kind === 'station' && !p.sub);
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

// (2026-10-15, the owner's playtest: "Train stations should have streets and parking lots connected to them ... so that
// cars can make a turn out of the parking lot and back out"; "train tracks should cross streets almost perpendicular so
// the crossing guard cross the street" - shared/world3-stations.js, shared/mapcore.js crossingGate)
test('every main-line station has a street to its front and a car park on a loop; every level crossing meets its road square on, its gates across the road', () => {
  const net = M.net, dead = deadWays(net);
  const plans = M.world3.stations;
  assert.equal(plans.length, STATIONS.filter((q) => q.line === 'main').length, 'a plan per station');
  for (const h of M.railHubs) {
    const plan = plans.find((q) => `${q.name} Station` === h.name);
    assert.ok(plan && plan.how !== 'none', `${h.name}: planned`);
    // a street (not a highway) within 12 tiles of its front door
    const fx = h.x + Math.cos(h.a) * 80, fy = h.y + Math.sin(h.a) * 80;
    let d = Infinity;
    for (const e of net.edges) if (e.lvl === 0 && e.kind !== 'hwy' && e.kind !== 'ramp') for (let k = 0; k + 1 < e.pts.length; k++) d = Math.min(d, segDist({ x: fx, y: fy }, e.pts[k], e.pts[k + 1]));
    assert.ok(d < 12 * TILE, `${h.name}: a street ${Math.round(d / TILE)} tiles from its front`);
    // its own roads: none leads only to a road's end (a loop through the car park, or past it)
    const mine = net.edges.filter((e) => e.name === `${h.name} Road`);
    assert.ok(mine.length, `${h.name}: its station road`);
    for (const e of mine) assert.ok(!dead.has(e.id * 2) && !dead.has(e.id * 2 + 1), `${h.name}: its road ${e.id} is no dead end`);
    // the car park: paved, with spaces
    let lot = 0;
    for (let ty = Math.floor(h.y / TILE) - 40; ty <= Math.floor(h.y / TILE) + 40; ty++) for (let tx = Math.floor(h.x / TILE) - 40; tx <= Math.floor(h.x / TILE) + 40; tx++) if (M.inside(tx, ty) && M.tiles[M.idx(tx, ty)] === T.LOT) lot++;
    assert.ok(lot >= 60 && plan.spaces >= 6, `${h.name}: a car park (${lot} tiles, ${plan.spaces} spaces)`);
  }
  // the level crossings: the road and the tracks at 75 degrees or more; the arms across the road, either side
  assert.ok(M.railXings.length > 10, `${M.railXings.length} level crossings`);
  for (const c of M.railXings) {
    assert.ok(c.ra !== undefined && c.rw > 0, `crossing at ${Math.round(c.x / TILE)},${Math.round(c.y / TILE)}: its road`);
    const ang = Math.acos(Math.min(1, Math.abs(Math.cos(c.ra - c.a)))) * 180 / Math.PI;
    assert.ok(ang >= 75, `crossing at ${Math.round(c.x / TILE)},${Math.round(c.y / TILE)}: ${ang.toFixed(1)} degrees`);
    for (const sg of [1, -1]) {
      const g = crossingGate(c, sg);
      assert.ok(Math.abs(g.dx * Math.cos(c.ra) + g.dy * Math.sin(c.ra)) < 1e-9, 'the arm across the road');
      const off = (g.x - c.x) * -Math.sin(c.a) + (g.y - c.y) * Math.cos(c.a);
      assert.ok(Math.abs(off - sg * (c.arm || CROSSING_ARM)) < 1, 'its gate the arm\'s distance off the tracks, on its side');
      assert.ok(Math.abs(Math.hypot(g.px - g.x, g.py - g.y) - (c.rw + 6)) < 1e-6, 'pivoting at the road\'s edge');
    }
  }
});

test('the trains on the v3 main line, five minutes: every service runs, stops at its stations, and no train runs into another', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const ts = w.trains;
  assert.ok(ts.length >= SERVICES.length * 2, `${ts.length} trains`);
  const loops = new Set(ts.filter((t) => !w.rails[t.r].subway).map((t) => t.r));   // (the subway lines' own: test/world3subway.test.js)
  assert.equal(loops.size, SERVICES.length * 2, 'trains on every loop');
  // as many trains to a loop as put one into each of its stations about every TRAIN_LOOP_HEADWAY_S (the owner, 10-16:
  // "More trains on the main loop: one every 1-2 minutes")
  for (const r of loops) {
    const lap = w.railTimings[r].reduce((a, q) => a + q.total + TRAIN_DWELL_S, 0), n = ts.filter((t) => t.r === r).length;
    assert.ok(lap / n <= TRAIN_LOOP_HEADWAY_S * 1.4 || n >= TRAIN_LOOP_MAX - 1, `${w.rails[r].name}: ${n} trains on a ${Math.round(lap)} s lap - one every ${Math.round(lap / n)} s`);
  }
  const run = ts.map(() => ({ dist: 0, stops: new Set(), last: null }));
  let hits = 0, steps = 0, firstHit = null;
  const downs = new Set(), closedFor = new Set();   // (the level crossings whose gates came down; the loops they came down for)
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
    w.xing.forEach((x, i) => {
      if (!x.down) return;
      downs.add(i);
      // (whose train is coming up to it - within 2000 px before it along a loop crossing there - while its gates are down)
      for (const [ri, s] of M.railXings[i].uses) if (ts.some((q) => q.r === ri && mod(s - q.s, w.rails[ri].len) < 2000)) closedFor.add(ri);
    });
    if (k % 2) continue;
    // every pair of cars of different trains: their outlines never overlap
    const cars = [];
    // (a subway car below ground runs a level deeper than the main line: shared/world3-subway.js)
    // (where each car is: a train nobody is near doesn't place its cars - trains.js update - so from the train itself)
    ts.forEach((t, i) => trains.__test.carPoses(w, t).forEach((e, ci) => { const c = t.cars[ci]; cars.push({ i, x: e.x, y: e.y, a: e.a, L: c.def.L, W: c.def.W, deep: w.rails[t.r].subway && e.sub ? 1 : 0 }); }));
    for (let p = 0; p < cars.length; p++) for (let q = p + 1; q < cars.length; q++) {
      const A = cars[p], B = cars[q];
      if (A.i === B.i || A.deep !== B.deep || Math.abs(A.x - B.x) > 260 || Math.abs(A.y - B.y) > 260) continue;
      if (overlap(A, B, A.L, A.W, B.L, B.W)) { hits++; firstHit ??= { k, a: A.i, b: B.i, x: Math.round(A.x / TILE), y: Math.round(A.y / TILE) }; }
    }
  }
  assert.equal(hits, 0, `trains ran into each other: ${JSON.stringify(firstHit)}`);
  // the gates: every loop's crossings, once each (a double track's two crossings of a road one, its gates outside both) -
  // they came down for the trains of every main-line loop, not only the first's
  assert.equal(w.xing.length, M.railXings.length);
  assert.ok(downs.size > 20, `${downs.size} crossings closed`);
  for (const ri of loops) assert.ok(closedFor.has(ri), `the gates came down for ${w.rails[ri].name}'s trains`);
  // the NPCs see a train coming on any loop: right in front of a moving train on a loop other than the first
  const t = ts.find((q) => q.r > 0 && q.v > 100 && !w.rails[q.r].pts[Math.floor(q.s / 8) % w.rails[q.r].pts.length].under);
  if (t) { const q = railAt(w.rails[t.r], t.s + 200); assert.ok(trains.railThreat(w, q.x, q.y), 'a train coming on its loop is a threat'); }
  // the station boards: every main-line station's lists the services that stop there, each with its next stop (one
  // the service calls at next, one way or the other) and its time; a next train at every platform
  const re = new RegExp(`(${SERVICES.map((sv) => sv.name).join('|')}) to ([^:·]+):`, 'g');
  for (const name of new Set(w.rails.filter((r) => !r.subway).flatMap((r) => r.stations.map((st) => st.name)))) {
    const at = M.pois.filter((p) => p.kind === 'station' && p.label === name);
    const next = new Set(w.rails.filter((r) => !r.subway).flatMap((r) => r.stations.map((st, j) => (st.name === name ? `${r.service} to ${r.stations[(j + 1) % r.stations.length].name.replace(/ Station$/, '')}` : null)).filter(Boolean)));
    const listed = at.flatMap((poi) => [...trains.stationBoard(w, poi).sub.matchAll(re)].map((q) => `${q[1]} to ${q[2].trim()}`));
    assert.ok(listed.length && listed.every((q) => next.has(q)), `${name}'s board: ${listed.join(', ')} (its next stops: ${[...next].join(', ')})`);
    assert.ok(at.every((poi) => trains.nextTrainIn(w, poi.station, poi) < 900), `a next train at every ${name} platform`);
  }
  ts.forEach((t, i) => {
    const r = w.rails[t.r];
    assert.ok(run[i].dist > 8000, `${r.name} train ${t.i}: ran ${Math.round(run[i].dist)} px`);
    assert.ok(run[i].stops.size >= 2, `${r.name} train ${t.i}: stopped at ${run[i].stops.size} stations`);
  });
});

// (docs/WORLD-V3.md 8.23: the trains' cost with nobody on) a train nobody is near runs - its drive, the signals, its
// stops - without placing its cars; the tick a player is near it, its cars are where the train is
test('a train nobody is near runs on with its cars unplaced; the tick someone is, they are where it is', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const t = w.trains.find((q) => !w.rails[q.r].subway);
  const e0 = w.get(t.cars[0].id), at0 = [e0.x, e0.y], s0 = t.s, stops0 = t.stop;
  for (let i = 0; i < TICK_HZ * 40; i++) w.step();
  assert.equal(t.near, false);
  assert.ok(t.s !== s0 || t.stop !== stops0, 'it ran');
  assert.deepEqual([e0.x, e0.y], at0, 'its cars not placed');
  const { p } = joinPlayer(w);
  const nose = railAt(w.rails[t.r], t.s);
  teleport(w, p.ped, nose.x + trains.NEAR_PX * 0.8, nose.y);
  w.step();
  assert.equal(t.near, true, `a player ${Math.round(trains.NEAR_PX * 0.8)} px off`);
  const poses = trains.__test.carPoses(w, t);
  t.cars.forEach((c, ci) => { const e = w.get(c.id); assert.ok(Math.hypot(e.x - poses[ci].x, e.y - poses[ci].y) < 1e-6, `car ${ci} where the train is`); });
  const far = w.trains.find((q) => !q.near && !trains.nearSomeone(w, q));
  assert.ok(far, 'trains far from the player stay unplaced');
});

test('riding the v3 main line as today: board a train at its platform, ride, get off at the next stop', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w);
  // a main-line train of a loop other than the first, standing at an open-air platform (they start at their stations)
  const t = w.trains.find((q) => q.r > 0 && !w.rails[q.r].subway && q.dwellUntil && !w.rails[q.r].stations[q.stop].under);
  assert.ok(t, 'a train in at a platform');
  t.dwellUntil = w.time + 8;
  const rail = w.rails[t.r], st = rail.stations[t.stop];
  teleport(w, p.ped, st.platform.x, st.platform.y);
  w.step();
  const act = players.findInteraction(w, p);
  assert.ok(act && /Board the train/.test(act.label), act && act.label);
  act.run();
  assert.ok(p.ped.onTrain, 'aboard');
  const next = rail.stations[(t.stop + 1) % rail.stations.length];
  let moved = false, at = false;
  for (let i = 0; i < TICK_HZ * 300 && !at; i++) { w.step(); if (!t.dwellUntil) moved = true; at = moved && !!t.dwellUntil; }
  assert.ok(at, `${rail.name}: at the next stop`);
  assert.equal(rail.stations[t.stop], next, 'the next stop');
  const e = w.get(t.cars[p.ped.onTrain.c].id);
  assert.ok(Math.hypot(p.ped.x - e.x, p.ped.y - e.y) < 140, 'rode with the car');
  const off = players.findInteraction(w, p);
  assert.ok(off && /Get off/.test(off.label), off && off.label);
  let seq = 1;
  for (let i = 0; i < 2; i++) { players.queueInput(p, { seq: seq++, bits: i === 0 ? IN.VEHICLE : 0, mx: 0, my: 0, aim: 0 }); w.step(); }
  assert.ok(!p.ped.onTrain, 'off the train');
  assert.ok(Math.hypot(p.ped.x - next.platform.x, p.ped.y - next.platform.y) < next.half + 300, 'on its platform');
});

// the platforms' route boards (the owner, 10-16: "An information board or map sign at stations showing where the train
// goes"): one on each open-air platform, drawn there; read, every line through the station and its next stops
test('a route board on the platforms: drawn on the platform, read out - each line through the station, its next stops', async () => {
  const { staticItems, STATIC_CHUNK } = await import('../client/art2/game/statics.js');
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const boards = trains.routeBoards(w);
  const open = new Set(); for (const R of w.rails) for (const st of R.stations) if (!st.under && !st.el && !st.deck) open.add(st.name);
  const named = new Set(boards.map((b) => b.name));
  assert.ok(named.size >= open.size * 0.8, `most open-air stations have one (${named.size} of ${open.size})`);
  // (on the platform: its paving - or, where the track runs at an angle to the grid, the ground it's drawn over)
  for (const b of boards) if (!b.el) assert.ok(![T.ROAD, T.BUILDING, T.WALL, T.BRIDGE, T.WATER, T.DEEP].includes(M.tileAtPx(b.x, b.y)), `${b.name}: on the platform`);
  // drawn where it is read
  const b = boards.find((q) => !q.el);
  const items = staticItems(M, Math.floor(b.x / STATIC_CHUNK), Math.floor(b.y / STATIC_CHUNK));
  assert.ok(items.some((it) => /^rboard/.test(it.key) && Math.hypot(it.x - b.x, it.y - b.y) < 2), 'the board drawn there');
  // read: its rows, the next stops in the line's order
  const { p, conn } = joinPlayer(w);
  teleport(w, p.ped, b.x, b.y + 12);
  const run = w.trains; w.trains = [];   // (no train in: boarding one comes first)
  const a = players.findInteraction(w, p);
  w.trains = run;
  assert.ok(a && /route board/.test(a.label), `the prompt (${a && a.label})`);
  a.run();
  const menu = [...conn.sent].reverse().find((m) => m && m.t === 'menu');
  assert.ok(menu && menu.opts.length >= 1, 'its rows');
  const rows = trains.routeRows(w, b.name);
  for (const r of rows) {
    const R = w.rails.find((q) => q.name === r.label), i = R.stations.findIndex((q) => q.name === b.name);
    assert.equal(r.next[0], R.stations[(i + 1) % R.stations.length].name.replace(/ Station$/, ''), `${r.label}: the next stop first`);
  }
  assert.ok(menu.opts.every((o) => o.id === 'close' && / → |^OK$/.test(o.note || o.label)), 'each line: where it goes');
});

test('the El\'s route boards up on its platforms, read from the deck; the subway\'s at its kiosk', async () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const el = trains.routeBoards(w).filter((b) => b.el);
  assert.ok(el.length >= 2, `a board on each of the El's platforms (${el.length})`);
  const { p, conn } = joinPlayer(w);
  const run = w.trains; w.trains = [];   // (no train in)
  const b = el[0];
  teleport(w, p.ped, b.x, b.y + 10);
  p.ped.lz = 0;
  const below = players.findInteraction(w, p);
  assert.ok(!below || !/route board/.test(below.label), 'not from the street under the deck');
  p.ped.lz = 1.45;
  const a = players.findInteraction(w, p);
  assert.ok(a && /route board/.test(a.label), `up on the platform (${a && a.label})`);
  a.run();
  assert.ok([...conn.sent].reverse().find((m) => m && m.t === 'menu' && /where the trains go/.test(m.title)), 'read out');
  // the subway: its kiosk's prompt reads the board out
  const st = w.rails.flatMap((R) => R.stations).find((q) => q.kiosk);
  assert.ok(st, 'a subway kiosk');
  {
    p.ped.lz = 0;
    const k = st.kiosk;
    teleport(w, p.ped, k.out ? k.out.x : k.x0 + 64, k.out ? k.out.y : k.y0 + 48);
    const q = players.findInteraction(w, p);
    assert.ok(q && /route board/.test(q.label), `at the kiosk (${q && q.label})`);
    const n = conn.sent.length;
    q.run();
    assert.ok(conn.sent.slice(n).some((m) => m && m.t === 'menu'), 'the kiosk reads the route board out');
  }
  w.trains = run;
});

// over water the track stays up till it meets land (the owner, 10-16: "Visible tunnel mouths; over water the track
// reaches land before its tunnel"): every tunnel's mouth on land, the water before it crossed on a bridge
test('the main line\'s tunnel mouths are on land: over water it crosses on a bridge', () => {
  const wet = (p) => [T.WATER, T.DEEP, T.BRIDGE].includes(M.tileAtPx(p.x, p.y));
  let mouths = 0;
  for (const R of M.rails.filter((q) => !q.subway)) {   // (the main line's loops: the subway's are its own)
    const P = R.pts, n = P.length;
    for (let i = 0; i < n; i++) {
      const p = P[i], q = P[(i + 1) % n];
      if (!!p.under === !!q.under || p.elevated || q.elevated) continue;
      const inside = p.under ? p : q;
      mouths++;
      assert.ok(!wet(inside), `${R.name}: a tunnel mouth over water at ${Math.round(inside.x / TILE)},${Math.round(inside.y / TILE)}`);
    }
  }
  assert.ok(mouths > 10, `the mouths (${mouths})`);
});

// the debug menu's "Hop on the nearest train" takes the main line's nearest, even with a subway train nearer (the
// owner, 10-16); "Hop on the nearest subway" takes the subway's
test('the debug hop: the nearest train is the main line\'s, the nearest subway the subway\'s', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w);
  const isSub = (q) => w.rails[q.r].subway;
  const sub = w.trains.find(isSub);
  assert.ok(sub && w.trains.some((q) => !isSub(q)), 'both kinds run');
  const e = w.get(sub.cars[0].id);
  teleport(w, p.ped, e.x, e.y);   // (right by a subway train)
  devCommand(w, p, 'train', {});
  assert.ok(p.ped.onTrain && !isSub(w.trains[p.ped.onTrain.t]), 'aboard a main-line train');
  devCommand(w, p, 'train', { sub: 1 });
  assert.ok(p.ped.onTrain && isSub(w.trains[p.ped.onTrain.t]), 'and now a subway train');
});

// stations where the track runs at an angle to the grid (the owner, 10-16: "Stations at an angle look awkward: axis-align
// them, or match sign and station to the track"): the platform paved only under itself - no ragged apron of paving
// tiles half off it - the station house's forecourt turned with the house, and the route board still on the platform
// (the canopies, benches, footbridges and the house turn with the track to within 3 degrees: client/art2/game/statics.js
// STATION_TURNS)
test('stations at an angle: paved only under the platform, the forecourt turned with the house', () => {
  // the forecourt: the old block where the track runs along the grid; turned with the house where it's at an angle
  const sq = stationForecourt({ x: 1000, y: 1000, a: Math.PI / 2 }, 3, 2);
  assert.equal(sq.length, 35, 'the 7 x 5 block');
  const a = 40 * Math.PI / 180, turned = stationForecourt({ x: 1000, y: 1000, a }, 3, 2);
  assert.ok(turned.length > 28 && turned.length < 42, `about as many tiles (${turned.length})`);
  for (const [tx, ty] of turned) {
    const dx = (tx + 0.5) * TILE - 1000, dy = (ty + 0.5) * TILE - 1000;
    assert.ok(Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= 3.5 * TILE && Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) <= 2.5 * TILE, 'in the turned block');
  }
  // the platforms: the tiles along the outer edge of each angled platform, whose middles are off it, are left as they were
  const fore = new Set();
  for (const h of M.railHubs || []) if (!h.el) for (const [tx, ty] of stationForecourt(h, 3, 3)) fore.add(tx + ',' + ty);
  let angled = 0, ring = 0, boards = 0;
  for (const r of M.rails) for (const st of r.stations) {
    if (st.under || r.subway || !offAxis(st.a)) continue;
    angled++;
    if (routeBoardAt(r, st, (x, y) => M.tileAtPx(x, y))) boards++;
    const seen = new Set();
    for (let d = -st.half + 24; d <= st.half - 24; d += 8) {
      const q = railAt(r, st.s + d), nx = -Math.sin(q.a) * st.side, ny = Math.cos(q.a) * st.side;
      for (const o of [st.outer + 12, st.outer + 18]) {
        const tx = Math.floor((q.x + nx * o) / TILE), ty = Math.floor((q.y + ny * o) / TILE), k = tx + ',' + ty;
        if (seen.has(k) || fore.has(k)) continue;
        seen.add(k);
        if (((tx + 0.5) * TILE - q.x) * nx + ((ty + 0.5) * TILE - q.y) * ny < st.outer + 6) continue;   // (its middle on the platform)
        ring++;
        assert.notEqual(M.tileAtPx((tx + 0.5) * TILE, (ty + 0.5) * TILE), T.PLAZA, `${r.name} ${st.name}: paving off the platform at ${tx},${ty}`);
      }
    }
  }
  assert.ok(angled >= 6 && ring > 60, `the stations at an angle (${angled}), the tiles round them (${ring})`);
  assert.ok(boards >= angled - 2, `their route boards (${boards} of ${angled})`);
});

// the front car's sign (the owner, 10-16: "show the next station on a sign on the train"): each car knows its line (the
// descriptor's l) and the station it's at or running to (the snapshot's extra byte); the sign shows where it stops next
test('the front car\'s sign: where the train stops next, on its own line', async () => {
  const { descriptor } = await import('../server/net.js');
  const { trainSignText } = await import('../client/render/trainsign.js');
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w);
  const t = w.trains.find((q) => q.r > 0 && !w.rails[q.r].subway && q.dwellUntil && !w.rails[q.r].stations[q.stop].under);
  assert.ok(t, 'a train in at a platform');
  t.dwellUntil = w.time + 8;
  const rail = w.rails[t.r], st = rail.stations[t.stop];
  teleport(w, p.ped, st.platform.x, st.platform.y);
  w.step();
  const e = w.get(t.cars[0].id), d = descriptor(e);
  assert.equal(M.rails[d.l], rail, 'its line');
  const sign = () => trainSignText(M, { d, extra: e.stop & 0xff, flags: e.doors ? 2 : 0 });
  const next = rail.stations[(t.stop + 1) % rail.stations.length].name.replace(/ Station$/, '').toUpperCase();
  assert.equal(sign(), next, 'in at a platform: the next stop, as the boarding prompt says');
  const act = players.findInteraction(w, p);
  assert.ok(act && act.label.toUpperCase().includes(next), act && act.label);
  // pulled out: still the station it's running to
  let moved = false;
  for (let i = 0; i < TICK_HZ * 60 && !moved; i++) { w.step(); moved = !t.dwellUntil; }
  assert.ok(moved);
  w.step();
  assert.equal(sign(), next, 'on its way: the station it runs to');
});

// the desert train robbery (the owner's #326): the mail train's robbery country on World v3's main line is the Red Rock
// Desert's long run - out there nobody hears the mail car's alarm (trains.js robberyCountry; crackOpen, as today's Dry
// Creek run: test/trains.test.js); the HUD says so, the job sends you there, the debug menu puts you aboard
test('the desert train robbery: the main line\'s robbery country is the Red Rock Desert run', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p } = joinPlayer(w);
  w.rails.forEach((r, i) => {
    const c = w.country[i];
    if (r.subway) { assert.equal(c, null, `${r.name}: none under the city`); return; }
    assert.ok(c && c.kind === 'desert' && c.name === 'Red Rock Desert', `${r.name}: ${JSON.stringify(c)}`);
    assert.ok(c.s1 - c.s0 > 15000, `${r.name}: a long run (${Math.round((c.s1 - c.s0) / 32)} tiles)`);
    for (const st of r.stations) { const d = Math.abs(st.s - (c.s0 + c.s1) / 2); assert.ok(Math.min(d, r.len - d) > (c.s1 - c.s0) / 2, `${st.name} not on it`); }
    for (const q of r.pts) if (q.s > c.s0 && q.s < c.s1) assert.ok(!q.under, 'out in the open');
  });
  devCommand(w, p, 'train', { mail: 1 });
  const t = w.trains[p.ped.onTrain.t];
  assert.ok(t.mail > 0 && !w.rails[t.r].subway && p.ped.onTrain.c === t.mail - 1, 'aboard a mail train, the coach ahead of the mail car');
  const c = w.country[t.r], s = t.s;
  t.s = (c.s0 + c.s1) / 2 + t.len / 2;
  assert.ok(trains.onRuralRun(w, t));
  assert.equal(trains.meInfo(w, p).rural, 'desert', 'the HUD: DESERT RUN');
  t.s = c.s0 - 4000;
  assert.ok(!trains.onRuralRun(w, t) && !trains.meInfo(w, p).rural);
  t.s = s;
  p.job = null;
  assert.equal(trains.startTrainJob(w, p), null);
  assert.ok(w.trains[p.job.train].mail > 0 && !w.rails[w.trains[p.job.train].r].subway, 'the job: a main-line mail train');
  assert.ok(p.toasts.some((q) => /Red Rock Desert/.test(q.text)), 'sent out to the desert');
});
