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
import { deadWay, isRoadEnd } from '../server/systems/roadends.js';

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
