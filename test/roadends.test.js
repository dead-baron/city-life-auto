// Road ends (task #384; server/systems/roadends.js, traffic.js, reroute.js; tools/trafficjams.mjs measures it on the whole
// map): the roads that lead only to road ends are known (a court that forks counts as one); through traffic keeps out of
// them; a car that does go up one turns round at the end by a manoeuvre and drives out; a ring of cars each stopped for
// the next is broken by the one with room behind it backing up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, straightRoad } from './helpers.js';
import { lanePath, exitsFrom } from '../shared/roads.js';
import { pointAt } from '../shared/geom.js';
import { CAR_BLOCK } from '../shared/map.js';
import { spawnNpc } from '../server/systems/npc.js';
import * as traffic from '../server/systems/traffic.js';
import { deadWay, isRoadEnd, startTurn, END_WAIT_S } from '../server/systems/roadends.js';
import { isBlocked } from '../server/systems/reroute.js';

function car(w, model, x, y, a = 0) {
  const v = w.spawnVehicle(model, x, y, a, {});
  const d = spawnNpc(w, 'casual', v.x, v.y, 'driver'); d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  return v;
}

test('the roads that lead only to road ends: each dead end, a court that forks, the road into it - not the way out', () => {
  // a loop 0-1-2, a road 2-3 to a fork at 3 with two dead ends (4, 5), and a spur 1-6
  const edges = [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [3, 5], [1, 6]].map(([a, b], id) => ({ id, a, b }));
  const nodes = Array.from({ length: 7 }, (_, id) => ({ id, edges: edges.filter((e) => e.a === id || e.b === id).map((e) => e.id) }));
  const net = { nodes, edges };
  assert.ok(deadWay(net, 4, 3) && deadWay(net, 5, 3), 'into either dead end of the fork');
  assert.ok(deadWay(net, 3, 2), 'and into the road that leads only to them');
  assert.ok(!deadWay(net, 3, 3) && !deadWay(net, 4, 4), 'but not out of them');
  assert.ok(deadWay(net, 6, 1) && !deadWay(net, 6, 6), 'a spur: in, not out');
  for (const id of [0, 1, 2]) for (const from of [edges[id].a, edges[id].b]) assert.ok(!deadWay(net, id, from), 'round the loop: never');
  assert.ok(isRoadEnd(net, 4) && isRoadEnd(net, 6) && !isRoadEnd(net, 3));
});

test('through traffic keeps out of the roads that only lead to road ends, wherever there is another way on', () => {
  const w = makeWorld(), net = w.map.net;
  let junctions = 0, picks = 0;
  for (const n of net.nodes) {
    if (n.edges.length < 3 || n.lvl !== 0) continue;
    for (const inEdge of n.edges) {
      if (deadWay(net, inEdge, n.id)) continue;   // (arriving from a road's end: any way out)
      const exits = n.edges.filter((id) => id !== inEdge);
      if (!exits.some((id) => deadWay(net, id, n.id)) || !exits.some((id) => !deadWay(net, id, n.id))) continue;
      junctions++;
      // (the ways a driver may take from here: exitsFrom leaves out the sharpest turns)
      const through = exitsFrom(net, n, inEdge).some((q) => !deadWay(net, q.edge, n.id));
      for (let k = 0; k < 6; k++) {
        const o = traffic._chooseExit(w, n, inEdge, null);
        if (!o) continue;
        picks++;
        assert.ok(!through || !deadWay(net, o.edge, n.id), `node ${n.id}: up a dead end with another way on`);
      }
      if (junctions > 400) break;
    }
    if (junctions > 400) break;
  }
  assert.ok(junctions > 20 && picks > 100, `${junctions} junctions where a road leads only to road ends (${picks} picks)`);
});

test('a car up a cul-de-sac turns round at the end by a manoeuvre and drives out, staying off the buildings', () => {
  const w = makeWorld(), net = w.map.net;
  // a cul-de-sac with a turning circle on a two-way street, long enough to drive up
  const n = net.nodes.find((q) => q.lvl === 0 && q.edges.length === 1 && q.bulb > 0 && !net.edges[q.edges[0]].oneway && net.edges[q.edges[0]].len > 320 && net.edges[q.edges[0]].kind !== 'alley');
  assert.ok(n, 'a cul-de-sac');
  const e = net.edges[n.edges[0]], o = e.a === n.id ? e.b : e.a;
  const lp = lanePath(net, e, o, 0), L = lp[lp.length - 1].s, p = pointAt(lp, Math.max(20, L - 200));
  const { p: pl } = joinPlayer(w);
  teleport(w, pl.ped, n.x + 260, n.y + 260);
  const v = car(w, 'sedan', p.x, p.y, Math.atan2(p.ty, p.tx));
  traffic.joinTraffic(w, v);
  assert.ok(v.ai, 'in traffic');
  const turns0 = w.turns || 0;
  let turned = false, out = false, onBlock = 0, closest = Infinity;
  for (let t = 0; t < 60 * 20 && !out; t++) {
    w.step();
    if (!v.ai) break;
    if (v.ai.turn) turned = true;
    closest = Math.min(closest, Math.hypot(v.x - n.x, v.y - n.y));
    if (CAR_BLOCK[w.map.tileAtPx(v.x, v.y)]) onBlock++;
    // out: back down the road, heading away from the end, well away from it
    const away = (v.x - n.x) * Math.cos(v.a) + (v.y - n.y) * Math.sin(v.a) > 0;
    out = turned && !v.ai.turn && away && Math.hypot(v.x - n.x, v.y - n.y) > closest + 220;
  }
  assert.ok(turned && (w.turns || 0) > turns0, 'it turned round by the manoeuvre');
  assert.ok(out, `and drove out (closest ${Math.round(closest)} px to the end, at ${Math.round(Math.hypot(v.x - n.x, v.y - n.y))} px)`);
  assert.equal(onBlock, 0, 'never on a building or a wall');
});

// (2026-10-15, the owner: "traffic jams leading up to the parking lots of train stations") A car that can't get round at
// a road's end held the next one short of the turning circle, and every car behind that one waited on it, for ever.
test('a queue up a road\'s end behind a car that cannot get round there gives up: each turns round and drives out', () => {
  const w = makeWorld(), net = w.map.net;
  const n = net.nodes.find((q) => {
    if (q.lvl !== 0 || q.edges.length !== 1 || !(q.bulb > 0)) return false;
    const e = net.edges[q.edges[0]];
    return !e.oneway && e.len > 700 && e.kind !== 'alley' && e.pts.every((p, i) => !i || Math.abs(Math.atan2(p.y - e.pts[i - 1].y, p.x - e.pts[i - 1].x) - Math.atan2(e.pts[1].y - e.pts[0].y, e.pts[1].x - e.pts[0].x)) < 0.2);
  });
  assert.ok(n, 'a long straight cul-de-sac');
  const e = net.edges[n.edges[0]], o = e.a === n.id ? e.b : e.a;
  const lp = lanePath(net, e, o, 0), L = lp[lp.length - 1].s;
  const { p: pl } = joinPlayer(w);
  teleport(w, pl.ped, n.x + 300, n.y + 300);
  // a van at the end, turning round, that can't get round (its manoeuvre put off for good)
  const q0 = pointAt(lp, L - 30), van = car(w, 'van', q0.x, q0.y, Math.atan2(q0.ty, q0.tx));
  traffic.joinTraffic(w, van);
  startTurn(w, van, e.id, n.id, n.id);
  van.ai.turn.pausedUntil = 1e9;
  // two cars on their way up to it
  const cars = [L - 330, L - 500].map((s) => { const q = pointAt(lp, s), v = car(w, 'sedan', q.x, q.y, Math.atan2(q.ty, q.tx)); traffic.joinTraffic(w, v); return v; });
  for (const v of cars) assert.ok(v.ai && v.ai.edge === e.id, 'in traffic, up the cul-de-sac');
  const closest = cars.map(() => Infinity), turned = cars.map(() => false);
  let t = 0;
  for (; t < 70 * 20; t++) {
    w.step();
    cars.forEach((v, i) => { if (!v.ai) return; closest[i] = Math.min(closest[i], Math.hypot(v.x - n.x, v.y - n.y)); if (v.ai.turn) turned[i] = true; });
    if (cars.every((v, i) => v.ai && turned[i] && !v.ai.turn && Math.hypot(v.x - n.x, v.y - n.y) > closest[i] + 260)) break;
  }
  cars.forEach((v, i) => {
    assert.ok(v.ai, `car ${i} still in traffic`);
    assert.ok(turned[i], `car ${i} turned round`);
    assert.ok(Math.hypot(v.x - n.x, v.y - n.y) > closest[i] + 260, `car ${i} drove back out (closest ${Math.round(closest[i])} px to the end, at ${Math.round(Math.hypot(v.x - n.x, v.y - n.y))} px)`);
  });
  assert.ok(t / 20 > END_WAIT_S, `not before it had waited (${(t / 20).toFixed(1)} s)`);
  assert.ok((w.endsGivenUp || 0) >= 2, 'both gave the end up');
  assert.ok(isBlocked(w, e.id), 'and the road is remembered as blocked a while');
});

// (2026-10-15, the owner's playtest at Copper Gulch: "they are all trying to drive through the corner of this building
// instead of on the street") A car that had lost its street's corner waypoint - skipped while it was shoved about in a
// jam - steered straight at the far end of the street, through the block, and stuck there against the wall.
test('a car whose next waypoint is across a block goes back onto its lane and round the corner, not through the building', () => {
  const w = makeWorld(), net = w.map.net, m = w.map;
  const blocked = (a, b) => { const L = Math.hypot(b.x - a.x, b.y - a.y); for (let s = 24; s < L; s += 16) if (CAR_BLOCK[m.tileAtPx(a.x + (b.x - a.x) * s / L, a.y + (b.y - a.y) * s / L)]) return true; return false; };
  // a street corner with a building inside the turn: from short of the junction, a point round the corner is across
  // the block
  let pick = null;
  for (const n of net.nodes) {
    if (pick || n.lvl !== 0 || n.edges.length < 3) continue;
    for (const ea of n.edges) for (const eb of n.edges) {
      const A = net.edges[ea], B = net.edges[eb];
      if (pick || ea === eb || A.oneway || B.oneway || A.lvl !== 0 || B.lvl !== 0 || A.len < 400 || B.len < 400 || !['st', 'ave'].includes(A.kind) || !['st', 'ave'].includes(B.kind)) continue;
      const from = A.a === n.id ? A.b : A.a, la = lanePath(net, A, from, 0), lb = lanePath(net, B, n.id, 0);
      const sa = la[la.length - 1].s - 200, p = pointAt(la, sa), q = pointAt(lb, 260);
      if (blocked(p, q) && !blocked(p, la[la.length - 1])) pick = { n, A, from, sa, p, q };
    }
  }
  assert.ok(pick, 'a street corner with a building inside it');
  const { n, A, from, sa, p, q } = pick;
  const { p: pl } = joinPlayer(w);
  teleport(w, pl.ped, n.x + 200, n.y + 200);
  const v = car(w, 'sedan', p.x, p.y, Math.atan2(p.ty, p.tx));
  v.ai = { kind: 'traffic', lane: 0 };
  traffic.enterEdge(w, v, A.id, from, 0, sa);
  v.ai.pts = [{ x: q.x, y: q.y }];   // (its waypoints along the street lost: only a point round the corner left)
  let rounded = false, onBlock = 0;
  for (let t = 0; t < 30 * 20 && !rounded; t++) {
    w.step();
    if (!v.ai) break;
    if (CAR_BLOCK[m.tileAtPx(v.x, v.y)]) onBlock++;
    rounded = Math.hypot(v.x - n.x, v.y - n.y) < 90 || v.ai.edge !== A.id;
  }
  assert.ok(rounded, `on along the street to the corner (at ${Math.round(Math.hypot(v.x - n.x, v.y - n.y))} px from it)`);
  assert.equal(onBlock, 0, 'never on the building');
});

test('a car with no way on at a junction takes any way out (or pulls up) - never left in the road with nobody steering', () => {
  const w = makeWorld(), net = w.map.net;
  // a junction of two-way streets, come at along a long straight one
  let n = null, inE = null;
  for (const q of net.nodes) {
    if (q.lvl !== 0 || q.edges.length !== 3 || q.light) continue;
    const e = q.edges.map((id) => net.edges[id]).find((x) => !x.oneway && x.kind === 'st' && x.len > 500 && x.pts.length === 2);
    if (e && q.edges.every((id) => !net.edges[id].oneway)) { n = q; inE = e; break; }
  }
  assert.ok(n, 'a junction');
  const o = inE.a === n.id ? inE.b : inE.a;
  const { p: pl } = joinPlayer(w);
  teleport(w, pl.ped, n.x + 220, n.y + 220);
  // no way on a driver would take: the road it comes in by one-way into the junction, every other way out a hairpin
  const links = { ...n.links }, dirs = { ...n.dirs };
  try {
    delete n.links[inE.id];
    for (const id of n.edges) if (id !== inE.id) n.dirs[id] = n.dirs[inE.id] + (id % 2 ? 0.3 : -0.3);
    assert.equal(exitsFrom(net, n, inE.id).length, 0, 'no way on');
    const lp = lanePath(net, inE, o, 0), s0 = lp[lp.length - 1].s - 260, q = pointAt(lp, s0);
    const v = car(w, 'sedan', q.x, q.y, Math.atan2(q.ty, q.tx));
    v.ai = { kind: 'traffic', lane: 0 };
    traffic.enterEdge(w, v, inE.id, o, 0, s0);
    assert.ok(v.ai && v.ai.edge === inE.id, 'on its way to the junction');
    let past = false;
    for (let t = 0; t < 25 * 20 && !past; t++) { w.step(); past = !v.ai || v.ai.edge !== inE.id || !!v.ai.parkIt; }
    assert.ok(past, 'at the junction');
    assert.ok(v.ai, 'still steered (not left in the road)');
    assert.ok(v.ai.edge !== inE.id || v.ai.parkIt, 'on by another way, or pulled up');
  } finally { n.links = links; n.dirs = dirs; }
});

test('two cars each stopped for the other: after a few seconds the one with room behind it backs up; the other waits', () => {
  const w = makeWorld();
  const r = straightRoad(w.map, 900, { kind: 'st' });
  assert.ok(r, 'a straight street');
  const { p } = joinPlayer(w);
  teleport(w, p.ped, r.x + 400, r.y - r.hw - 200);
  const x0 = r.x + 300;
  const a = car(w, 'sedan', x0, r.y, 0), b = car(w, 'sedan', x0 + 80, r.y, Math.PI);
  w.spawnVehicle('van', x0 + 80 + 62, r.y, Math.PI, {}).input.hb = true;   // (right behind b: no room for it to back into)
  for (const v of [a, b]) { traffic.joinTraffic(w, v); v.vx = 0; v.vy = 0; }
  a._blk = b.id; b._blk = a.id;
  traffic._breakRing(w, a); traffic._breakRing(w, b);
  assert.ok(!(a.ai.reverseUntil > w.time) && !(b.ai.reverseUntil > w.time), 'not straight away');
  w.time += 6;
  a._blk = b.id; b._blk = a.id;
  traffic._breakRing(w, a); traffic._breakRing(w, b);
  assert.ok(a.ai.reverseUntil > w.time, 'the one with room behind it backs up');
  assert.ok(!(b.ai.reverseUntil > w.time), 'the other waits');
});

// (H51, docs/WORLD-V3.md 8.19) World v3's wild tracks are flagged notraffic on their edges (shared/world3-wild.js): at a
// junction the traffic never takes one while there's another way on. (Today's world has none: the flag is set here.)
test('the traffic keeps off a road flagged notraffic while there is another way on', () => {
  const w = makeWorld(), net = w.map.net;
  let tried = 0;
  for (const n of net.nodes) {
    if (n.lvl !== 0 || n.edges.length < 3) continue;
    const inEdge = n.edges[0], opts = exitsFrom(net, n, inEdge);
    if (opts.length < 2 || opts.some((o) => deadWay(net, o.edge, n.id) || net.edges[o.edge].kind === 'alley')) continue;
    const e = net.edges[opts[0].edge];
    e.notraffic = true;
    try {
      for (let k = 0; k < 8; k++) { const o = traffic._chooseExit(w, n, inEdge, null); assert.ok(o && o.edge !== e.id, `node ${n.id}: down the track`); }
    } finally { delete e.notraffic; }
    if (++tried >= 30) break;
  }
  assert.ok(tried >= 30, `${tried} junctions tried`);
});
