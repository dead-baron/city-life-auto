// Junctions keep moving (the owner, 11-03: "make sure we're solving for traffic jams"; server/systems/traffic.js
// junctionClear, breakRing): a car doesn't drive into a junction it can't get out of ("don't block the box": the road
// it's taking is backed up just past it) - it waits at its line, and goes once there's room; and two cars nose to nose,
// each stopped for the other, don't wait for ever - one backs off and both get by.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { lanePath, exitsFrom } from '../shared/roads.js';
import { pointAt } from '../shared/geom.js';
import { spawnNpc } from '../server/systems/npc.js';
import * as traffic from '../server/systems/traffic.js';

function car(w, model, x, y, a) {
  const v = w.spawnVehicle(model, x, y, a, {});
  const d = spawnNpc(w, 'casual', v.x, v.y, 'driver'); d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  return v;
}
// an unsignalled ground junction of 4 roads with a long straight road into it and the road straight on out of it
function crossing(m) {
  const net = m.net;
  for (const n of net.nodes) {
    if (n.lvl !== 0 || n.light || n.edges.length !== 4 || n.merge) continue;
    for (const id of n.edges) {
      const e = net.edges[id];
      if (e.len < 700 || e.oneway || e.lvl !== 0 || e.kind !== 'st') continue;
      const from = e.a === n.id ? e.b : e.a;
      const on = exitsFrom(net, n, id).find((o) => Math.abs(o.turn) < 0.2 && net.edges[o.edge].len > 400 && net.edges[o.edge].lvl === 0);
      if (on) return { n, e, from, on };
    }
  }
  return null;
}

test('don\'t block the box: a car waits at its line while the road it\'s taking is backed up past the junction, then goes', () => {
  const w = makeWorld(), m = w.map, net = m.net;
  const X = crossing(m);
  assert.ok(X, 'an unsignalled crossroads');
  const { n, e, from, on } = X;
  const a = joinPlayer(w);
  teleport(w, a.p.ped, n.x + 260, n.y + 260);
  // the car, 400 px back up its lane
  const lp = lanePath(net, e, from, 0), L = lp[lp.length - 1].s, p = pointAt(lp, L - 420);
  const v = car(w, 'sedan', p.x, p.y, Math.atan2(p.ty, p.tx));
  traffic.joinTraffic(w, v);
  v.ai.next = on; v.ai.turning = false;
  // the road on out of it, backed up: a car stopped just past the junction in that lane
  const ne = net.edges[on.edge], lq = lanePath(net, ne, n.id, 0), q = pointAt(lq, (n.trim[on.edge] || 0) + 30);
  const jam = car(w, 'van', q.x, q.y, Math.atan2(q.ty, q.tx));
  jam.ai = { kind: 'traffic', parkIt: true };   // (stopped there)
  let inBox = false, minD = Infinity;
  for (let t = 0; t < 12 * 20; t++) {
    w.step();
    if (v.ai && v.ai.next) { v.ai.next = on; v.ai.turning = false; }
    const d = Math.hypot(v.x - n.x, v.y - n.y);
    minD = Math.min(minD, d);
    if (d < (n.half || 40)) inBox = true;
  }
  assert.ok(!inBox, `it stayed out of the junction (${Math.round(minD)} px from its middle at the nearest)`);
  assert.ok(Math.hypot(v.vx, v.vy) < 10 && minD < 320, 'waiting at its line');
  // the queue moves off: it goes
  w.remove(jam);
  let through = false;
  for (let t = 0; t < 12 * 20 && !through; t++) { w.step(); through = v.ai && v.ai.edge === on.edge; }
  assert.ok(through, 'and goes through once there\'s room');
});

test('two cars nose to nose, each stopped for the other: one backs off and both get by', () => {
  const w = makeWorld(), m = w.map, net = m.net;
  const X = crossing(m);
  const { n, e, from } = X;
  const a = joinPlayer(w);
  teleport(w, a.p.ped, n.x + 260, n.y + 260);
  // a lane each way: one car up the wrong lane, nose to nose with one in its own
  const lp = lanePath(net, e, from, 0), L = lp[lp.length - 1].s, p = pointAt(lp, L * 0.4), p2 = pointAt(lp, L * 0.4 + 120);
  const v1 = car(w, 'sedan', p.x, p.y, Math.atan2(p.ty, p.tx));
  const v2 = car(w, 'sedan', p2.x, p2.y, Math.atan2(p.ty, p.tx) + Math.PI);
  traffic.joinTraffic(w, v1); traffic.joinTraffic(w, v2);
  const d0 = Math.hypot(v1.x - v2.x, v1.y - v2.y);
  let apart = false, broken = 0;
  for (let t = 0; t < 40 * 20 && !apart; t++) {
    w.step();
    broken = (w.ringsBroken || 0) + (w.sidesteps || 0);
    // passed each other: each further along its own way than where the other started
    apart = Math.hypot(v1.x - p.x, v1.y - p.y) > 200 && Math.hypot(v2.x - p2.x, v2.y - p2.y) > 200 && Math.hypot(v1.x - v2.x, v1.y - v2.y) > d0;
  }
  assert.ok(apart, `they got by each other (rings broken / sidesteps: ${broken})`);
});

// (The Yards by Northgate station: a gang shootout's police car dropped across the mouth of Central Avenue stood there
// while anyone was near, and the avenue queued behind it for the rest of the run)
test('a shootout\'s police car pulls up at the kerb along a street - never in a junction', async () => {
  const gangwar = await import('../server/systems/gangwar.js');
  const { K } = await import('../shared/constants.js');
  const w = makeWorld(), net = w.map.net;
  const hq = w.map.pois.find((q) => q.kind === 'gang');
  for (let k = 0; k < 4; k++) {
    const q = joinPlayer(w).p;
    teleport(w, q.ped, hq.x + (k - 2) * 300, hq.y + 200 + k * 150);
    const before = new Set(w.entities.keys());
    assert.ok(gangwar.startShootout(w, q), 'a shootout');
    const car = [...w.entities.values()].find((e) => e.kind === K.VEH && e.model === 'police' && !before.has(e.id));
    assert.ok(car, 'its police car');
    const n = w.map.nearestNode(car.x, car.y);
    assert.ok(Math.hypot(n.x - car.x, n.y - car.y) > (n.half || 40) + car.def.L / 2, `clear of the junction (${Math.round(Math.hypot(n.x - car.x, n.y - car.y))} px from its middle)`);
    void net;
  }
});

// (by Southside station: cars eased over for a siren ended up nosed at a slant into the corner of a car in a kerb bay -
// standing still they could never steer back into their lane, and Magnolia Street queued behind them for minutes)
test('nosed at a slant into the corner of a car parked at the kerb: it backs off, straightens up and drives on past', () => {
  const w = makeWorld(), m = w.map, net = m.net;
  const e = m.edges.filter((q) => q.lvl === 0 && q.kind === 'st' && q.nl === 1 && !q.oneway && m.nodes[q.a].edges.length >= 3 && m.nodes[q.b].edges.length >= 3 && q.pts.every((p) => Math.abs(p.y - q.pts[0].y) < 2)).sort((a, b) => b.len - a.len)[0];
  const x0 = Math.min(...e.pts.map((p) => p.x)) + 300, y = e.pts[0].y, from = e.pts[0].x < e.pts[e.pts.length - 1].x ? e.a : e.b;
  const lp = lanePath(net, e, from, 0), ly = pointAt(lp, 300).y, kerb = Math.sign(ly - y);   // (the eastbound lane's side of the street: its kerb)
  const a = joinPlayer(w);
  teleport(w, a.p.ped, x0 + 200, y - kerb * (e.hw + 200));
  const parked = w.spawnVehicle('sedan', x0 + 300, ly + kerb * 58, 0, { parked: true });   // (in a kerb bay: clear of the lane, for a car on its line)
  const v = car(w, 'compact', x0 + 300 - parked.def.L / 2 - 44, ly + kerb * 14, kerb * 0.45);
  traffic.joinTraffic(w, v);
  const px = parked.x;
  let past = false, t = 0;
  for (; t < 30 * 20 && !past; t++) { w.step(); past = v.ai && v.x > parked.x + parked.def.L / 2 + 20; }
  assert.ok(past, `it got past the parked car (in ${(t / 20).toFixed(1)} s; straightened ${w.straightened || 0}, went round ${w.goneRound || 0})`);
  assert.ok(Math.abs(parked.x - px) < 4, `without touching it (${Math.round(parked.x - px)} px)`);
  assert.ok((w.straightened || 0) >= 1 && t < 12 * 20, 'by straightening up, within a few seconds');
});

// (the owner, 11-06, off the arrival train at Metro Central: "this white car keeps ramming the car around it" - a pickup
// turned across the corner of the station's loop, its end out into the lane and its middle beside it: the car behind
// braked only for what stood across its way by the middle, with a half width either side, so it drove into the
// pickup's end, stuck there, backed off and drove into it again)
test('a car stopped side on with its end out across the lane: the car behind stops short of it - no ramming', () => {
  const w = makeWorld(), m = w.map, net = m.net;
  const e = m.edges.filter((q) => q.lvl === 0 && q.kind === 'st' && !q.oneway && q.len > 700 && q.pts.every((p) => Math.abs(p.y - q.pts[0].y) < 2)).sort((a, b) => b.len - a.len)[0];
  const from = e.pts[0].x < e.pts[e.pts.length - 1].x ? e.a : e.b, lp = lanePath(net, e, from, 0), p0 = pointAt(lp, 200);
  const a = joinPlayer(w);
  teleport(w, a.p.ped, p0.x + 200, p0.y - 300);
  const v = car(w, 'sedan', p0.x, p0.y, 0);
  traffic.joinTraffic(w, v);
  // the pickup 320 px on, side on, its middle just clear of the sedan's way as if it lay along it - its end across it
  const off = v.def.W / 2 + 28 + 2, side = p0.y < e.pts[0].y ? 1 : -1;   // (toward the road's middle)
  const pk = car(w, 'pickup', p0.x + 320, p0.y + side * off, Math.PI / 2);
  pk.ai = { kind: 'traffic', parkIt: true };   // (stopped there)
  const inside = (q, x, y) => { const c = Math.cos(q.a), s = Math.sin(q.a), dx = x - q.x, dy = y - q.y; return Math.abs(dx * c + dy * s) < q.def.L / 2 && Math.abs(-dx * s + dy * c) < q.def.W / 2; };
  let hits = 0, was = false;
  const px = pk.x, py = pk.y;
  for (let t = 0; t < 8 * 20; t++) {
    w.step();
    const c = Math.cos(v.a), s = Math.sin(v.a), fx = v.x + c * (v.def.L / 2 + 2), fy = v.y + s * (v.def.L / 2 + 2);
    const now = [-1, 0, 1].some((k) => inside(pk, fx - s * k * (v.def.W / 2 - 2), fy + c * k * (v.def.W / 2 - 2)));
    if (now && !was) hits++;
    was = now;
  }
  assert.equal(hits, 0, 'never nose into the pickup');
  assert.ok(Math.hypot(pk.x - px, pk.y - py) < 4, `the pickup unmoved (${Math.round(Math.hypot(pk.x - px, pk.y - py))} px)`);
  assert.ok(v.x < pk.x - 28 - v.def.L / 2 + 4 || v.ai.roundUntil > w.time, 'stopped short of it (or on its way round)');
});

// (the owner, 11-06, off the arrival train at Metro Central: "this white car keeps ramming the car around it" - a sedan
// shoved onto the corner of the car park's island, nose to a lamp post it doesn't brake for: wedged, it backed off for
// 1.3 s whatever was behind it - into the box truck queued there - drove on into the post and did it again, every 4.5 s)
test('wedged nose to something it doesn\'t brake for, a car queued right behind: it never backs into it, and gives up', () => {
  const w = makeWorld(), m = w.map, net = m.net;
  const e = m.edges.filter((q) => q.lvl === 0 && q.kind === 'st' && !q.oneway && q.len > 700 && q.pts.every((p) => Math.abs(p.y - q.pts[0].y) < 2)).sort((a, b) => b.len - a.len)[0];
  const from = e.pts[0].x < e.pts[e.pts.length - 1].x ? e.a : e.b, lp = lanePath(net, e, from, 0), p0 = pointAt(lp, 300);
  const a = joinPlayer(w);
  teleport(w, a.p.ped, p0.x + 200, p0.y - 300);
  const v = car(w, 'sedan', p0.x, p0.y, 0);
  traffic.joinTraffic(w, v);
  // what it's wedged against: a post in the lane just ahead of it (a lamp post on an island's corner), a van close behind
  const post = { x: p0.x + v.def.L / 2 + 30, y: p0.y, r: 12 }, pk = m.idx(Math.floor(post.x / 32), Math.floor(post.y / 32)), had = m.solidProps.get(pk);
  m.solidProps.set(pk, (had || []).concat([post]));
  const van = car(w, 'van', p0.x - v.def.L / 2 - 51 - 16, p0.y, 0);
  van.ai = { kind: 'traffic', parkIt: true };   // (queued there)
  const inside = (q, x, y) => { const c = Math.cos(q.a), s = Math.sin(q.a), dx = x - q.x, dy = y - q.y; return Math.abs(dx * c + dy * s) < q.def.L / 2 && Math.abs(-dx * s + dy * c) < q.def.W / 2; };
  let hits = 0, was = false;
  const vx = van.x;
  for (let t = 0; t < 20 * 20; t++) {
    w.step();
    const c = Math.cos(v.a), s = Math.sin(v.a), bx = v.x - c * (v.def.L / 2 + 2), by = v.y - s * (v.def.L / 2 + 2);
    const now = [-1, 0, 1].some((k) => inside(van, bx - s * k * (v.def.W / 2 - 2), by + c * k * (v.def.W / 2 - 2)));
    if (now && !was) hits++;
    was = now;
  }
  if (had) m.solidProps.set(pk, had); else m.solidProps.delete(pk);
  assert.equal(hits, 0, 'never backs into the van');
  assert.ok(Math.abs(van.x - vx) < 4, `the van unmoved (${Math.round(van.x - vx)} px)`);
  assert.ok(v.ai && v.ai.parkIt && (w.wedgedGaveUp || 0) >= 1, 'wedged in one spot again and again, it gives up (the queue goes round it)');
});
