// World v3's arrival lines (shared/world3-arrivals.js; the owner, 11-06: "multiple stations to choose from ... on their own
// track and it comes out of a tunnel and then goes to the station then leaves station and goes into another tunnel"):
// one line for each region new players pick from, beside a main-line station with a car park; each a straight run between
// two bores (the portal facing the platform, the far end blind), on its own - no main-line track near it, no road on or
// across it - with a platform you can walk off to the street and on to the station's car park. Then the arrival on one:
// the page's train on its line, the newcomer out of everyone else's sight until the doors open. One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { T, TILE, K } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/mapcore.js';
import { ARRIVAL_PICKS, ARRIVAL } from '../shared/world3-arrivals.js';
import { World } from '../server/world.js';
import * as starter from '../server/systems/starter.js';
import * as ftue from '../server/systems/ftue.js';
import * as net from '../server/net.js';
import { FTUE, STARTER } from '../shared/rules.js';
import { joinPlayer, run, teleport } from './helpers.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const segDist = (x, y, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)); return Math.hypot(a.x + dx * t - x, a.y + dy * t - y); };

test('World v3: an arrival line for each region, beside a station with a car park, on its own track between two tunnels', () => {
  const A = M.arrivals;
  assert.ok(Array.isArray(A) && A.length === ARRIVAL_PICKS.length, `a line for each region (${A && A.map((a) => a.key)})`);
  assert.deepEqual(A.map((a) => a.key), ARRIVAL_PICKS.map((p) => p.key));
  const gs = starter.publicGarages(M);
  for (const a of A) {
    const poi = M.pois[a.poi], st = a.stations[0], P = a.pts;
    assert.equal(poi.kind, 'station'); assert.ok(!poi.sub, `${a.name}: a main-line station`);
    assert.ok(gs.some((g) => g.station && g.poi === a.poi), `${a.name}: a station with a car park (the starter car's lot)`);
    assert.ok(Math.hypot(st.platform.x - poi.x, st.platform.y - poi.y) <= ARRIVAL.reach + 120, `${a.name}: its platform near the station`);
    // straight, along a grid axis, every 8 px, the ends inside the hills
    const ca = Math.cos(a.a), sa = Math.sin(a.a);
    assert.ok(Math.abs(ca) < 1e-9 || Math.abs(sa) < 1e-9, `${a.name}: along x or y`);
    P.forEach((p, i) => { assert.ok(Math.abs(p.s - i * 8) < 1e-6); assert.ok(Math.abs(p.x - (P[0].x + ca * p.s)) < 1e-6 && Math.abs(p.y - (P[0].y + sa * p.s)) < 1e-6); });
    assert.ok(P[0].under && P[P.length - 1].under && P.slice(1, -1).every((p) => !p.under));
    // the platform on the right of the way the train runs, a train long, paved, in the open between the portals
    assert.equal(st.side, 1); assert.ok(st.arrival);
    const [pin, pout] = a.portals;
    assert.ok(pin.s < st.s - st.half && pout.s > st.s + st.half, `${a.name}: the platform between the portals`);
    for (let u = -st.half + 16; u < st.half - 16; u += 32) {
      const x = P[0].x + ca * (st.s + u) - sa * 80, y = P[0].y + sa * (st.s + u) + ca * 80;
      assert.equal(M.tileAtPx(x, y), T.PLAZA, `${a.name}: the platform paved at ${u}`);
    }
    // two bores: the hill over each end (cover), the portal facing the platform, the far end blind and walled
    assert.equal(a.tunnels.length, 2);
    a.tunnels.forEach((id, j) => {
      const t = M.tunnels[id];
      assert.ok(t && t.kind === 'rail' && t.arrival, `${a.name}: bore ${j}`);
      const open = t.mouths.filter((mo) => !mo.blind), blind = t.mouths.filter((mo) => mo.blind);
      assert.equal(open.length, 1); assert.equal(blind.length, 1);
      const port = j ? pout : pin;
      assert.ok(Math.hypot(open[0].x - port.x, open[0].y - port.y) < 1, `${a.name}: the portal at the open stretch's end`);
      const s = j ? (pout.s + a.len) / 2 : pin.s / 2, x = P[0].x + ca * s, y = P[0].y + sa * s;
      assert.equal(M.cover[M.idx(Math.floor(x / TILE), Math.floor(y / TILE))], id + 1, `${a.name}: the hill over bore ${j}`);
      const e = j ? a.len - 12 : 12, ex = P[0].x + ca * e, ey = P[0].y + sa * e;
      assert.equal(M.tileAtPx(ex, ey), T.WALL, `${a.name}: rock across the far end of bore ${j}`);
    });
  }
});

test('World v3: the arrival lines cross and join nothing - no main-line track near, no road on them or across them, apart from each other', () => {
  const main = (M.rails || []).filter((r) => !r.subway);
  for (const a of M.arrivals) {
    const P = a.pts;
    for (const r of main) for (let i = 0; i < r.pts.length; i += 2) {
      const q = r.pts[i];
      if (q.under) continue;
      if (Math.abs(q.x - P[0].x) > a.len + 400 && Math.abs(q.x - P[P.length - 1].x) > a.len + 400) continue;
      assert.ok(segDist(q.x, q.y, P[0], P[P.length - 1]) > 4 * TILE, `${a.name}: the main line (${r.name}) stays clear`);
    }
    // no road tile on the track bed or the platform; no road edge across or along the line
    for (const p of P) for (const o of [-48, -24, 0, 24, 48, 72, 96]) {
      const x = p.x - Math.sin(a.a) * o, y = p.y + Math.cos(a.a) * o, t = M.tileAtPx(x, y);
      assert.ok(t !== T.ROAD && t !== T.BRIDGE, `${a.name}: no road at ${Math.round(x)},${Math.round(y)}`);
    }
    for (const e of M.edges) {
      if (!e || e.lvl) continue;
      for (let k = 1; k < e.pts.length; k++) {
        const u = e.pts[k - 1], v = e.pts[k];
        if (Math.max(u.x, v.x) < Math.min(P[0].x, P[P.length - 1].x) - 200 || Math.min(u.x, v.x) > Math.max(P[0].x, P[P.length - 1].x) + 200) continue;
        for (let f = 0; f <= 8; f++) { const x = u.x + (v.x - u.x) * f / 8, y = u.y + (v.y - u.y) * f / 8; assert.ok(segDist(x, y, P[0], P[P.length - 1]) > (e.hw || 32) + 40, `${a.name}: road edge ${e.id} clear of the line`); }
      }
    }
    for (const b of M.arrivals) if (b !== a) assert.ok(Math.hypot(b.stations[0].x - a.stations[0].x, b.stations[0].y - a.stations[0].y) > 3000, `${a.name} and ${b.name} apart`);
  }
});

test('World v3: off each arrival platform on foot - to the street, and on to the station\'s car park', () => {
  const W = M.w;
  for (const a of M.arrivals) {
    const w = { map: M, players: new Map() }, spot = ftue.arrivalSpot(w, a);
    const g = starter.publicGarages(M).find((q) => q.poi === a.poi);
    const goal = new Set(g.spots.map((sp) => M.idx(Math.floor(sp.x / TILE), Math.floor(sp.y / TILE))));
    const s0 = M.idx(Math.floor(spot.x / TILE), Math.floor(spot.y / TILE));
    assert.ok(!PED_BLOCK[M.tiles[s0]], `${a.name}: you step off onto something you can stand on`);
    // breadth first over what people can walk on, the track's bed left out (the way off is the platform's back)
    const bed = new Set();
    for (const p of a.pts) for (const o of [-32, 0, 32]) bed.add(M.idx(Math.floor((p.x - Math.sin(a.a) * o) / TILE), Math.floor((p.y + Math.cos(a.a) * o) / TILE)));
    const seen = new Map([[s0, 0]]), q = [s0];
    let street = -1, lot = -1;
    while (q.length && (street < 0 || lot < 0) && seen.size < 400000) {
      const i = q.shift(), d = seen.get(i), t = M.tiles[i];
      if (street < 0 && (t === T.SIDEWALK || t === T.ROAD || t === T.LOT)) street = d;
      if (lot < 0 && goal.has(i)) lot = d;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = M.idx(x + dx, y + dy);
        if (seen.has(j) || bed.has(j) || PED_BLOCK[M.tiles[j]]) continue;
        seen.set(j, d + 1); q.push(j);
      }
    }
    assert.ok(street >= 0 && street <= ARRIVAL.exitMax + 6, `${a.name}: the street ${street} tiles off the platform`);
    assert.ok(lot >= 0 && lot < 200, `${a.name}: the car park ${lot} tiles' walk away`);
  }
});

test('World v3: the arrival on a line - the page\'s train, the newcomer unseen by others until the doors open; the car at that station', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const coast = M.arrivals.find((a) => a.key === 'coast');
  const j = joinPlayer(w);
  j.prof.lookPicked = true;
  run(w, 0.6);
  assert.equal(j.prof.ftue.st, 'pick');
  const card = j.conn.sent.find((m) => m.t === 'ftue' && m.a === 'pick');
  assert.deepEqual(card.opts.map((o) => o.id), M.arrivals.map((a) => a.poi), 'the card: the arrival lines\' stations');
  assert.equal(card.opts.find((o) => o.def).id, M.arrivals.find((a) => a.key === FTUE.arriveDefault).poi, 'the default: the city');
  assert.ok(card.opts.every((o) => o.region && o.vibe));
  ftue.handle(w, j.p, { a: 'pick', stn: coast.poi });
  const arr = j.conn.sent.find((m) => m.t === 'ftue' && m.a === 'arrive');
  assert.ok(arr.line && arr.line.len === coast.len && arr.line.in === coast.portals[0].s && arr.line.out === coast.portals[1].s, 'the line for the page\'s train');
  assert.ok(arr.stop < arr.door && arr.door < arr.leave && arr.s <= 14, 'in, the doors, out - 14 s at most');
  const spot = ftue.arrivalSpot(w, coast);
  assert.ok(Math.hypot(j.p.ped.x - spot.x, j.p.ped.y - spot.y) < 1, 'on the platform at the doors');
  const car = starter.carOf(w, j.prof.pid), poi = M.pois[coast.poi];
  assert.ok(car && Math.hypot(car.x - poi.x, car.y - poi.y) <= STARTER.lotR, 'the starter car in that station\'s car park');
  // someone on the platform already: the newcomer appears as the doors open
  const o = joinPlayer(w, { ftue: { st: 'done', m: {}, tips: 0 } });
  teleport(w, o.p.ped, spot.x + 120, spot.y);
  net.send(w);
  assert.ok(j.p.ped.ftueHid && !o.p.known.has(j.p.ped.id), 'not seen while the train pulls in');
  assert.ok(j.p.known.has(j.p.ped.id), 'yourself, yes');
  run(w, FTUE.doorS + 0.6);
  net.send(w);
  assert.ok(!j.p.ped.ftueHid && o.p.known.has(j.p.ped.id), 'seen once the doors open');
  // no server train on it: the arrival lines are none of the main line's loops, which the trains run
  assert.ok(M.rails.every((r) => !M.arrivals.some((a) => a.pts === r.pts) && !(r.stations || []).some((st) => st.arrival)), 'not a loop the trains run');
  for (const e of w.entities.values()) if (e.kind === K.TRAIN) assert.ok(segDist(e.x, e.y, coast.pts[0], coast.pts[coast.pts.length - 1]) > 4 * TILE, 'no train on the line');
});

// (the owner, 11-06, off the arrival train at Metro Central: "First thing I see coming off the FTUE train here is a
// traffic jam ... Maybe we just keep the street here but not have it be a street cars go down")
test('World v3: the stations\' own roads - the arrival stations\' too - keep their look but take no traffic: none placed there, none turning in', () => {
  const own = M.edges.filter((e) => e && / Station Road$/.test(e.name));
  assert.ok(own.length >= 12 && own.every((e) => e.notraffic), `every station road kept off by the traffic (${own.filter((e) => !e.notraffic).map((e) => e.name)})`);
  for (const a of M.arrivals) {
    const es = own.filter((e) => e.name === `${a.name} Road`);
    assert.ok(es.length, `${a.name}: its road`);
    for (const e of es) { const p = e.pts[e.pts.length >> 1]; assert.equal(M.tileAtPx(p.x, p.y), T.ROAD, `${a.name}: still a road to drive`); }
  }
  const ids = new Set(own.map((e) => e.id)), w = new World(M, { npcBudget: 120, throwErrors: true });
  for (const a of M.arrivals) { const q = joinPlayer(w, { ftue: { st: 'done', m: {}, tips: 0 } }); const pl = a.stations[0].platform; teleport(w, q.p.ped, pl.x, pl.y); }
  const seen = new Set();
  let traffic = 0;
  for (let t = 0; t < 60 * 20; t++) {
    w.step();
    if (t % 10) continue;
    for (const v of w.entities.values()) if (v.kind === K.VEH && v.ai && v.ai.kind === 'traffic') { traffic++; if (ids.has(v.ai.edge)) seen.add(`${v.id} ${v.model} on ${M.edges[v.ai.edge].name}`); }
  }
  assert.ok(traffic > 0, 'traffic about');
  assert.deepEqual([...seen], [], 'no traffic on a station road');
});
