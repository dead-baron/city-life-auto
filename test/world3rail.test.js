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
import { SERVICES, MAIN_JUNCTIONS, MAIN_LINE, RADIUS, linePath, wetRanges } from '../shared/world3-skeleton.js';
import { TRACK_OFF } from '../shared/world3-rail.js';
import * as trains from '../server/systems/trains.js';
import * as players from '../server/systems/players.js';
import { joinPlayer, teleport } from './helpers.js';
import { IN } from '../shared/input.js';
import { TRAIN_DWELL_S, TRAIN_LOOP_HEADWAY_S, TRAIN_LOOP_MAX } from '../shared/rules.js';

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
        assert.ok([T.PLAZA, T.DOCK, T.ROAD, T.BRIDGE, T.SIDEWALK, T.BUILDING].includes(t), `${r.name} ${st.name}: a platform (tile ${t})`);
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
  for (const b of boards) if (!b.el) assert.ok([T.PLAZA, T.DOCK, T.SIDEWALK].includes(M.tileAtPx(b.x, b.y)), `${b.name}: on the platform`);
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
