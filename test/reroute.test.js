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
// a long straight east-west street with a lane each way, between two junctions: { e, x0 (its west end, past the
// junction), y (its middle line) }
function longStreet(m) {
  const e = m.edges.filter((q) => q.lvl === 0 && q.kind === 'st' && q.nl === 1 && !q.oneway && m.nodes[q.a].edges.length >= 3 && m.nodes[q.b].edges.length >= 3 && q.pts.every((p) => Math.abs(p.y - q.pts[0].y) < 2)).sort((a, b) => b.len - a.len)[0];
  return { e, x0: Math.min(...e.pts.map((p) => p.x)) + 200, y: e.pts[0].y };
}

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

test('on a street with one lane each way blocked across both lanes it turns round and goes another way; the street is remembered as blocked', () => {
  const w = makeWorld();
  const r = straightRoad(w.map, 1400, { kind: 'st' });
  assert.ok(r, 'a long straight street');
  const e = edgeAt(w.map, r.x + 600, r.y);
  assert.equal(e.nl, 1);
  const a = joinPlayer(w);
  teleport(w, a.p.ped, r.x + 500, r.y - r.hw - 200);
  const y0 = laneY(r, e, 0), x0 = r.x + 300;
  wreck(w, x0 + 400, y0);
  wreck(w, x0 + 400, r.y - laneOffset(e, 0));   // (and the other lane: no way round it)
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

// (the owner's notes, 10-22: "a lot of cars start getting jammed in a spot" - a passer-by pinned in the road, the cars
// behind waiting on them for ever: traffic.js PED_HONK_S / PED_CREEP_S, npc.js shoo)
test('someone on foot in the road: the driver honks, a passer-by steps out of the road; one who won\'t is nudged past at a crawl, unhurt', async () => {
  const { K } = await import('../shared/constants.js');
  const run = (state) => {
    const w = makeWorld();
    const r = straightRoad(w.map, 1400);
    const e = edgeAt(w.map, r.x + 600, r.y);
    const a = joinPlayer(w);
    teleport(w, a.p.ped, r.x + 500, r.y - r.hw - 260);
    for (const q of [...w.entities.values()]) if (q !== a.p.ped && (q.kind === K.VEH || q.kind === K.PED) && Math.abs(q.y - r.y) < 400 && Math.abs(q.x - r.x - 500) < 700) w.remove(q);
    const y0 = laneY(r, e, 0), x0 = r.x + 300;
    const ped = spawnNpc(w, 'casual', x0 + 130, y0, 'civ');
    const hp0 = ped.hp;
    ped.npc.state = 'watch'; ped.npc.target = 0; ped.npc.fx = x0 + 400; ped.npc.fy = y0; ped.npc.until = w.time + 99;   // (stood in the road, watching something)
    const v = car(w, 'sedan', x0, y0, 0);
    traffic.joinTraffic(w, v);
    const evs = [];
    let honked = false, steppedOff = false, past = false;
    for (let t = 0; t < 25 * 20 && !past; t++) {
      if (state === 'stubborn') { ped.npc.state = 'film'; ped.npc.fx = x0 + 600; ped.npc.fy = y0; ped.npc.until = w.time + 99; }   // (filming something down the road: won't move)
      w.step();
      if (v.hornUntil > w.time) honked = true;
      if (Math.abs(ped.y - y0) > 40) steppedOff = true;
      past = v.x > ped.x + 60;
    }
    return { honked, steppedOff, past, hurt: hp0 - ped.hp, dead: ped.dead, v };
  };
  const loose = run('watch');
  assert.ok(loose.honked && loose.steppedOff && loose.past, `a passer-by: honked at, steps out of the road, the car goes on (${JSON.stringify({ ...loose, v: 0 })})`);
  const stubborn = run('stubborn');
  assert.ok(stubborn.honked && stubborn.past && !stubborn.dead && stubborn.hurt < 1, `one who stands there: nudged past at a crawl, unhurt (${JSON.stringify({ ...stubborn, v: 0 })})`);
});

// (the owner, 11-03: "Traffic still seems to backup in areas" - The Yards by Northgate station: a sedan four minutes
// behind a car left in its lane, eight cars queued behind it, a player watching so the clean-up never came)
test('a car left standing in the lane of a street with a lane each way: the cars behind go round it on the other side when nothing is coming', () => {
  const w = makeWorld();
  const { e, x0, y } = longStreet(w.map);
  assert.ok(e.len > 1200, 'a long street');
  const a = joinPlayer(w);
  teleport(w, a.p.ped, x0 + 400, y - e.hw - 220);
  const y0 = y + laneOffset(e, 0);
  const left = w.spawnVehicle('sedan', x0 + 600, y0, 0, {}); left.input.hb = true;   // (nobody in it)
  const q = [car(w, 'sedan', x0 + 460, y0, 0), car(w, 'compact', x0 + 340, y0, 0), car(w, 'pickup', x0 + 210, y0, 0)];
  for (const v of q) traffic.joinTraffic(w, v);
  const by = new Set(), turned = new Set();
  for (let t = 0; t < 60 * 20 && by.size + turned.size < q.length; t++) {
    w.step();
    for (const v of q) { if (v.ai && v.x > left.x + 60 && Math.abs(v.y - y0) < 200) by.add(v); if (v.ai && v.ai.howOut === 'turn') turned.add(v); }
  }
  assert.ok(by.size + turned.size === q.length && by.size >= 2, `the queue got by it (${by.size} of ${q.length} past it; ${turned.size} turned round)`);
  assert.ok(Math.abs(left.x - (x0 + 600)) < 30, `without shoving it along (${Math.round(left.x - x0 - 600)} px)`);
  assert.ok((w.goneRound || 0) >= 1, 'by going round it');
});

test('...but not into a car coming the other way: it waits for it to pass', () => {
  const w = makeWorld();
  const { e, x0, y } = longStreet(w.map);
  const a = joinPlayer(w);
  teleport(w, a.p.ped, x0 + 400, y - e.hw - 220);
  const y0 = y + laneOffset(e, 0), yo = y - laneOffset(e, 0);
  const left = w.spawnVehicle('sedan', x0 + 600, y0, 0, {}); left.input.hb = true;
  const v = car(w, 'sedan', x0 + 460, y0, 0);
  traffic.joinTraffic(w, v);
  // a car stopped in the other lane just up ahead of it (the strip round it isn't clear): it doesn't pull out
  const other = w.spawnVehicle('van', x0 + 800, yo, Math.PI, {}); other.input.hb = true;
  let out = false;
  for (let t = 0; t < 20 * 20; t++) { w.step(); if (v.ai && v.ai.round) out = true; }
  assert.equal(out, false, 'it never pulled out with something in the other lane ahead');
});

// (by Southside station: a tow truck pulling away with a car on its hook stood across Magnolia Street for four minutes,
// a car nosed up to it from each side, nobody giving way: reroute.js makeWay, when there's no way round and no room to
// turn)
test('nose to nose with a tow truck pulling away: the car backs off down its lane to let it through - not for one at work facing away', () => {
  const w = makeWorld();
  const { e, x0, y } = longStreet(w.map);
  const a = joinPlayer(w);
  teleport(w, a.p.ped, x0 + 400, y - e.hw - 220);
  const y0 = y + laneOffset(e, 0);
  const tow = w.spawnVehicle('towtruck', x0 + 560, y0, Math.PI, {});
  const td = spawnNpc(w, 'casual', tow.x, tow.y, 'driver'); td.vehId = tow.id; td.seat = 0; tow.seats[0] = td.id;
  tow.ai = { kind: 'tow', mode: 'test' }; tow.input.hb = true;
  const v = car(w, 'sedan', x0 + 560 - tow.def.L / 2 - 50, y0, 0);
  traffic.joinTraffic(w, v);
  reroute.makeWay(w, v, tow);
  assert.ok(v.ai.reverseUntil > w.time + 0.3, 'it backs off');
  const x1 = v.x;
  for (let t = 0; t < 2 * 20; t++) w.step();
  assert.ok(x1 - v.x > 30, `down its lane (${Math.round(x1 - v.x)} px)`);
  // a tow truck at work facing away from it (hooking up a car): no backing off - round it, or wait
  tow.a = 0; v.ai.reverseUntil = 0;
  reroute.makeWay(w, v, tow);
  assert.ok(!(v.ai.reverseUntil > w.time), 'not for one facing away');
});
