// Drivers who find another way round (server/systems/reroute.js): a driver stopped behind a blocked lane changes lane
// on an avenue, or turns round and goes another way on a street (the road remembered as blocked); an ambulance with
// its siren on gets round a jam; re-plans are rate-limited and the blocked-road memory stays small.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, straightRoad } from './helpers.js';
import { T } from '../shared/constants.js';
import { laneOffset } from '../shared/roads.js';
import { spawnNpc } from '../server/systems/npc.js';
import * as traffic from '../server/systems/traffic.js';
import * as reroute from '../server/systems/reroute.js';

// an edge of the road at (x, y) - for its lanes
function edgeAt(m, x, y) {
  for (const e of m.edges) {
    if (e.lvl !== 0 || e.pts.some((p) => Math.abs(p.y - y) > 8)) continue;   // (the street itself: east-west at this y)
    const xs = e.pts.map((p) => p.x);
    if (Math.min(...xs) <= x && Math.max(...xs) >= x) return e;
  }
  return null;
}
function car(w, model, x, y, a = 0) {
  const v = w.spawnVehicle(model, x, y, a, {});
  const d = spawnNpc(w, 'casual', v.x, v.y, 'driver'); d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  return v;
}
function wreck(w, x, y) { const v = w.spawnVehicle('sedan', x, y, 0, {}); v.hp = 0; v.dead = true; v.wreckAt = w.time; return v; }
// the eastbound lane k's y on an east-west road (lanes are to the right of the way you drive: south, going east)
function laneY(r, e, k) { return r.y + laneOffset(e, k); }

test('a driver stopped behind a wreck on an avenue moves over into the free lane and gets past it', () => {
  const w = makeWorld();
  const r = straightRoad(w.map, 1400, { kind: 'ave' });
  assert.ok(r, 'a long straight avenue');
  const e = edgeAt(w.map, r.x + 600, r.y);
  assert.ok(e.nl >= 2, 'two lanes each way');
  const a = joinPlayer(w);
  teleport(w, a.p.ped, r.x + 500, r.y - r.hw - 200);
  const y0 = laneY(r, e, 0);
  const x0 = r.x + 300;
  const block = wreck(w, x0 + 420, y0);
  const v = car(w, 'sedan', x0, y0, 0);
  traffic.joinTraffic(w, v);
  v.vx = 150;
  let stopAt = -1, outAt = -1, past = false;
  for (let t = 0; t < 30 * 20 && !past; t++) {
    w.step();
    if (!v.ai) break;
    if (stopAt < 0 && Math.hypot(v.vx, v.vy) < 10 && v.x > x0 + 100) stopAt = w.time;
    if (outAt < 0 && v.ai.howOut) outAt = w.time;
    past = v.x > block.x + 120;
  }
  assert.ok(stopAt > 0, 'it stopped behind the wreck');
  assert.equal(v.ai && v.ai.howOut, 'lane', 'it changed lane');
  assert.ok(outAt - stopAt < 8, `within a few seconds (${(outAt - stopAt).toFixed(1)} s)`);
  assert.ok(past, 'and got past the wreck');
});

test('on a street with one lane each way it turns round and goes another way; the street is remembered as blocked', () => {
  const w = makeWorld();
  const r = straightRoad(w.map, 1400, { kind: 'st' });
  assert.ok(r, 'a long straight street');
  const e = edgeAt(w.map, r.x + 600, r.y);
  assert.equal(e.nl, 1);
  const a = joinPlayer(w);
  teleport(w, a.p.ped, r.x + 500, r.y - r.hw - 200);
  const y0 = laneY(r, e, 0), x0 = r.x + 300;
  wreck(w, x0 + 400, y0);
  const v = car(w, 'sedan', x0, y0, 0);
  traffic.joinTraffic(w, v);
  v.vx = 150;
  let turned = false, edge = -1;
  for (let t = 0; t < 30 * 20 && !turned; t++) {
    w.step();
    if (!v.ai) break;
    if (v.ai.howOut === 'turn' && edge < 0) edge = v.ai.edge;
    turned = v.ai.howOut === 'turn' && Math.cos(v.a) < -0.5;
  }
  assert.ok(edge >= 0 && reroute.isBlocked(w, edge), 'the street is remembered as blocked');
  assert.ok(turned, 'it turned round');
});

test('an ambulance with its siren on gets round a jam (on the other side of the road)', () => {
  const w = makeWorld();
  const r = straightRoad(w.map, 1600, { kind: 'st' });
  const e = edgeAt(w.map, r.x + 600, r.y);
  const a = joinPlayer(w);
  teleport(w, a.p.ped, r.x + 500, r.y - r.hw - 220);
  const y0 = laneY(r, e, 0), x0 = r.x + 200;
  wreck(w, x0 + 560, y0);
  for (const dx of [440, 330]) { const q = w.spawnVehicle('compact', x0 + dx, y0, 0, {}); q.input.hb = true; }   // (left there behind it)
  const amb = car(w, 'ambulance', x0, y0, 0);
  amb.ai = { kind: 'test' }; amb.sirenOn = true;
  const goal = { x: x0 + 1100, y: y0 };
  let there = false, wet = false;
  for (let t = 0; t < 40 * 20 && !there; t++) {
    traffic.driveToward(w, amb, goal.x, goal.y, 300, {});
    w.step();
    if (w.map.tileAtPx(amb.x, amb.y) === T.WATER) wet = true;
    there = amb.x > x0 + 900;
  }
  assert.ok(there, `the ambulance got past the jam (at x ${Math.round(amb.x - x0)})`);
  assert.ok(!wet);
});

test('re-plans are rate-limited: a few drivers a tick, once in a while each; the blocked-road memory stays small', () => {
  const w = makeWorld();
  const r = straightRoad(w.map, 2600, { kind: 'st' });
  const e = edgeAt(w.map, r.x + 600, r.y);
  const a = joinPlayer(w);
  teleport(w, a.p.ped, r.x + 1300, r.y - r.hw - 200);
  const y0 = laneY(r, e, 0), cars = [];
  for (let i = 0; i < 6; i++) {
    const x = r.x + 150 + i * 380;
    wreck(w, x + 170, y0);
    const v = car(w, 'sedan', x, y0, 0);
    traffic.joinTraffic(w, v);
    cars.push(v);
  }
  let last = w.reroutes || 0, most = 0;
  const times = new Map();
  for (let t = 0; t < 16 * 20; t++) {
    w.step();
    const n = w.reroutes || 0;
    most = Math.max(most, n - last); last = n;
    for (const v of cars) if (v.ai && v.ai.rerouteAt !== undefined) { const l = times.get(v) || []; if (l[l.length - 1] !== v.ai.rerouteAt) l.push(v.ai.rerouteAt); times.set(v, l); }
  }
  assert.ok(last >= 4, `drivers did re-plan (${last})`);
  assert.ok(most <= reroute.PER_TICK, `never more than ${reroute.PER_TICK} in one tick (${most})`);
  for (const l of times.values()) for (let i = 1; i < l.length; i++) assert.ok(l[i] - l[i - 1] >= reroute.GAP - 0.01, 'each driver at most once in a while');
  for (let i = 0; i < 60; i++) reroute.markBlocked(w, i);
  assert.ok(w.blockedEdges.size <= reroute.MEMORY, 'the memory keeps only the latest few');
  assert.ok(reroute.isBlocked(w, 59) && !reroute.isBlocked(w, 0), 'the oldest forgotten first');
});
