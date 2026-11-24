// Racers (server/systems/racers.js; the owner, 2026-11-14 20:21: "Street racing: the cars just drive in a cluster then
// stop at stop lights, they don't act like they're racing - they should be swerving in and out of traffic and pedestrians
// should be jumping out of the way. The car chase scene just had a car driving in an alley ... and the car ended up
// crashing into something"). The director's street race played on the test city, through a junction whose light is red
// for them, with traffic put along the way: nobody stops at the light, the pack strings out with overtakes, they change
// lines round the traffic, people crossing dive clear, a car shaved past brakes and honks. And the chase's getaway keeps
// to the wide streets and keeps going.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer } from './helpers.js';
import { signalFor } from '../shared/signals.js';
import { DAY_LOOP_S } from '../shared/constants.js';

const { seedRandom } = await import('../server/capture.js');
seedRandom(7);   // (the same city every run of this file: its people, its traffic)
const director = await import('../server/systems/director.js');
const racers = await import('../server/systems/racers.js');

test('the street race: through the red light at speed, overtakes, lines changed round the traffic, people diving clear, honks', () => {
  const world = makeWorld({ npcBudget: 40 });
  const { p } = joinPlayer(world);
  const r = director.start(world, 'autorace', { mode: 'dev', ref: { x: p.ped.x, y: p.ped.y }, viewer: p }).run;
  assert.ok(r, 'the race set up');
  const X = r.anchors.cross, net = world.map.net;
  assert.ok(X, 'a junction on its way');
  const node = net.nodes.find((n) => Math.hypot(n.x - X.x, n.y - X.y) < 30);
  assert.ok(node && node.light, 'with traffic lights');
  // the racers' way in: the junction's edge behind it - its light red from the start till well after they're through
  const inEdge = +Object.entries(node.links).find(([, nid]) => { const q = net.nodes[nid]; return (q.x - X.x) * Math.cos(X.a) + (q.y - X.y) * Math.sin(X.a) < -50; })[0];
  let lt0 = -1;
  for (let lt = 0; lt < DAY_LOOP_S && lt0 < 0; lt += 0.5) { let red = true; for (let t = 2; t <= 9 && red; t += 0.25) red = signalFor(node, inEdge, lt + t) === 'R'; if (red) lt0 = lt; }
  if (lt0 >= 0) world.loopTime = lt0;
  const ids = ['r1', 'r2', 'r3', 'r4'], before = {}, passed = {}, stopped = {}, lines = {};
  let order = null, overtakes = 0;
  for (let i = 0; i < 20 * 12 && !r.over; i++) {
    world.step();
    const t = i / 20;
    for (const c of ids) {
      const A = r.cast.get(c), v = world.get(A.id);
      if (!v) continue;
      const sp = Math.hypot(v.vx, v.vy), along = (v.x - X.x) * Math.cos(X.a) + (v.y - X.y) * Math.sin(X.a);
      if (t > 4 && t < 9 && sp < 60) stopped[c] = (stopped[c] || 0) + 0.05;
      if (before[c] !== undefined && before[c] < 0 && along >= 0) passed[c] = { sp: Math.round(sp), light: signalFor(node, inEdge, world.loopTime) };
      before[c] = along;
      const R = A.ctl && A.ctl.R;
      if (R) { const L = (lines[c] ||= { off: R.off, n: 0 }); if (Math.abs(R.off - L.off) > 40) { L.n++; L.off = R.off; } }
    }
    if (t > 3) {
      const o = ids.map((c) => [c, r.cast.get(c).ctl && r.cast.get(c).ctl.R]).filter(([, q]) => q).sort((a, b) => b[1].s - a[1].s).map((q) => q[0]).join('');
      if (order && o !== order) overtakes++;
      order = o;
    }
  }
  for (const c of ids) {
    assert.ok(passed[c], `${c} through the junction`);
    assert.ok(passed[c].sp >= 350, `${c} through it at speed (${passed[c].sp} px/s)`);
    assert.ok((stopped[c] || 0) < 0.8, `${c} never stopped (${(stopped[c] || 0).toFixed(2)} s)`);
  }
  if (lt0 >= 0) assert.ok(ids.every((c) => passed[c].light === 'R'), `through on red: ${JSON.stringify(passed)}`);
  assert.ok(overtakes >= 3, `a strung-out pack, overtaking (${overtakes})`);
  assert.ok(ids.reduce((n, c) => n + (lines[c] ? lines[c].n : 0), 0) >= 6, `lines changed: ${JSON.stringify(lines)}`);
  assert.ok([...r.cast.keys()].filter((k) => k.startsWith('traffic.')).length >= 3, 'traffic put along the way');
  assert.ok((world.racerDives || 0) >= 1, 'someone dived out of the way');
  assert.ok((world.racerShaves || 0) >= 1, 'a car shaved past braked and honked');
  director.end(world, r);
  assert.equal(world.errorCounts ? world.errorCounts.size : 0, 0);
});

test('the chase: the getaway keeps to the wide streets (never an alley) and keeps going - no crash, no stop', () => {
  const world = makeWorld({ npcBudget: 40 });
  const { p } = joinPlayer(world);
  const r = director.start(world, 'autochase', { mode: 'dev', ref: { x: p.ped.x, y: p.ped.y }, viewer: p }).run;
  assert.ok(r);
  const A = r.cast.get('car');
  let slow = 0, n = 0;
  for (let i = 0; i < 20 * 14 && !r.over; i++) {
    world.step();
    const v = world.get(A.id);
    assert.ok(v && !v.wreckAt, 'never wrecked');
    if (i / 20 > 1.5) { n++; if (Math.hypot(v.vx, v.vy) < 150) slow++; }
  }
  assert.ok(slow / n < 0.15, `on the move (${Math.round(slow / n * 100)}% of the time slow)`);
  // its way: wide streets - never an alley, a ramp, a deck
  const R = A.ctl.R, net = world.map.net;
  assert.ok(R.route.edges && R.route.edges.length >= 2, 'its streets');
  for (const id of R.route.edges) { const e = net.edges[id]; assert.ok(e.kind !== 'alley' && !e.lvl && !e.tunnel, `along an ${e.kind} (${e.name || id})`); }
  assert.ok(R.route.edges.filter((id) => racers.wideEdge(net.edges[id])).length >= R.route.edges.length / 2, 'wide streets mostly');
  director.end(world, r);
});

test('the way to race: straight on along the street, never back round the block behind', () => {
  const world = makeWorld({ npcBudget: 0 });
  const e = world.map.net.edges.find((q) => racers.wideEdge(q) && q.len > 1200);
  const a = world.map.net.nodes[e.a], b = world.map.net.nodes[e.b], h = Math.atan2(b.y - a.y, b.x - a.x);
  const v = { x: a.x + Math.cos(h) * 200, y: a.y + Math.sin(h) * 200, a: h };
  const route = racers.raceRoute(world, v, { x: a.x + Math.cos(h) * 2600, y: a.y + Math.sin(h) * 2600 });
  assert.ok(route && route.length > 4);
  for (const q of route.slice(1, 6)) assert.ok((q.x - v.x) * Math.cos(h) + (q.y - v.y) * Math.sin(h) > -40, 'ahead of it, not behind');
});

// Medians (P8, the owner's 11-23 notes: the cinematics' cars "ride the median"): a racer on a divided road finds both
// its lanes shut ahead and gets round - but never over the planted median (its palms): only by its own side's room.
test('a racer boxed in on a divided road never crosses its median', async () => {
  const { nearestEdge, lanePath } = await import('../shared/roads.js');
  const { pointAt } = await import('../shared/geom.js');
  const world = makeWorld({ npcBudget: 0 }), net = world.map.net;
  const e = net.edges.find((q) => q.median > 0 && !q.oneway && !q.lvl && !q.tunnel && q.kind === 'ave' && q.len > 2200);
  assert.ok(e, 'an avenue');
  const lp = lanePath(net, e, e.a, 0), q0 = pointAt(lp, 300), a = Math.atan2(q0.ty, q0.tx);
  const v = world.spawnVehicle('sports', q0.x, q0.y, a, {});
  const { spawnNpc } = await import('../server/systems/npc.js');
  const d = spawnNpc(world, 'casual', v.x, v.y);
  d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  v.ai = { kind: 'actor' };
  // both its side's lanes shut 700 px on (cars nobody drives, side by side)
  const inner = lanePath(net, e, e.a, 1), b0 = pointAt(lp, 1000), b1 = pointAt(inner, 1000);
  const blk = [b0, b1].map((b) => { const c = world.spawnVehicle('sedan', b.x, b.y, a, {}); c.parked = true; c.despawnable = false; return c; });
  const route = racers.straightOn(world, q0.x, q0.y, a, 1800);
  const R = racers.racer(world, v, route, { skill: 1 });
  let over = 0;
  for (let i = 0; i < 20 * 5; i++) {
    racers.raceStep(world, v, R); world.step();
    const ne = nearestEdge(net, v.x, v.y, (x) => x.id === e.id);
    if (ne && ne.s > 200 && ne.s < e.len - 200 && ne.d < e.median / 2 + v.def.W / 2 - 2) over++;
  }
  assert.equal(over, 0, `over the median ${over} ticks of 100`);
});
