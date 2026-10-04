// The rail loop: stations, the subway, level crossings, riding, run-over cars and people, cops
// boarding for wanted passengers and the mail-train strongbox job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { railAt, CROSSING_ARM, MAIL_BOX } from '../shared/map.js';
import { TRAIN_SPEED, TRAIN_DWELL_S, TRAIN_DRAG_EXPLODE_S, TRAIN_JOB_PAY, STRONGBOX_CRACK_S } from '../shared/rules.js';
import { CTRL } from '../shared/protocol.js';
import * as trains from '../server/systems/trains.js';
import * as players from '../server/systems/players.js';
import * as economy from '../server/systems/economy.js';
import * as cargo from '../server/systems/cargo.js';
import * as combat from '../server/systems/combat.js';
import { IN } from '../shared/input.js';

const mod = (a, n) => ((a % n) + n) % n;
// put train t so that its nose is `ahead` px before arc position s, running at full speed
function runUpTo(w, t, s, ahead) { t.s = mod(s - ahead, w.map.rail.len); t.v = TRAIN_SPEED; t.dwellUntil = 0; const sts = w.map.rail.stations; t.stop = sts.findIndex((q) => mod(q.s + t.len / 2 - t.s, w.map.rail.len) === Math.min(...sts.map((r) => mod(r.s + t.len / 2 - t.s, w.map.rail.len)))); }
let seq = 1;
function press(w, p, bits, n = 1, extra = {}) { for (let i = 0; i < n; i++) { players.queueInput(p, { seq: seq++, bits: i === 0 ? bits : 0, mx: 0, my: 0, aim: 0, ...extra }); w.step(); } }

test('railway: one loop, seven stations (one underground), level crossings and a long rural run', () => {
  const w = makeWorld();
  const r = w.map.rail;
  assert.ok(r.len > 30000, 'a big loop');
  assert.equal(r.stations.length, 7);
  assert.equal(r.stations.filter((s) => s.under).length, 1, 'Midtown Underground');
  assert.ok(r.pts.some((p) => p.under) && r.pts.some((p) => !p.under), 'part of it is a tunnel');
  assert.ok(r.crossings.length >= 4);
  for (const c of r.crossings) assert.ok([T.ROAD, T.BRIDGE].includes(w.map.tileAtPx(c.x, c.y)), 'crossings are on roads');
  assert.ok(r.rural && r.rural.s1 - r.rural.s0 > 2500, 'long rural stretch');
  for (const p of r.pts) if (!p.under) assert.notEqual(w.map.tileAtPx(p.x, p.y), T.BUILDING, 'no track through buildings');
  for (const s of r.stations) assert.ok(w.map.pois[s.poi].kind === 'station');
  assert.equal(w.trains.length, 2);
  assert.ok(w.trains.some((t) => t.mail >= 0), 'a mail train');
});

test('trains run the loop and stop at every station for the dwell time', () => {
  const w = makeWorld();
  const t = w.trains[1];
  const first = t.stop;
  run(w, TRAIN_DWELL_S + 1);
  assert.ok(!t.dwellUntil && t.v > 0, 'departed');
  assert.equal(t.stop, (first + 1) % 7);
  let stopped = false;
  for (let i = 0; i < 20 * 120 && !stopped; i++) { w.step(); if (t.dwellUntil) stopped = true; }
  assert.ok(stopped, 'pulled into the next station');
  const st = w.map.rail.stations[t.stop];
  const mid = mod(t.s - t.len / 2, w.map.rail.len);
  assert.ok(Math.abs(mid - st.s) < 3, 'stopped with its middle at the platform');
});

test('nothing stops a train: a car on the line is dragged along and blows up; a pedestrian is thrown', () => {
  const w = makeWorld();
  const t = w.trains[0];
  const rail = w.map.rail;
  const s = rail.rural.s0 + 600;
  runUpTo(w, t, s, 400);
  const q = railAt(rail, s);
  const { p } = joinPlayer(w); // someone watching (or the car is tidied away)
  teleport(w, p.ped, q.x - Math.sin(q.a) * 300, q.y + Math.cos(q.a) * 300);
  const car = w.spawnVehicle('sedan', q.x, q.y, q.a + Math.PI / 2, { npcOwned: false });
  const v0 = t.v;
  let exploded = false;
  for (let i = 0; i < 20 * (TRAIN_DRAG_EXPLODE_S + 3) && !exploded; i++) { w.step(); if (car.wreckAt) exploded = true; }
  assert.ok(exploded, 'the car went up');
  assert.ok(t.v >= v0 - 1, 'the train never slowed');
  assert.ok(Math.hypot(car.x - q.x, car.y - q.y) > 300, 'shoved down the line');
  // a pedestrian standing on the tracks
  const s2 = s + 2400;
  const q2 = railAt(rail, s2);
  teleport(w, p.ped, q2.x, q2.y);
  runUpTo(w, t, s2, 300);
  const hp0 = p.ped.hp;
  run(w, 1.2);
  assert.ok(p.ped.dead || p.ped.hp < hp0 - 40, 'hit by the train');
  assert.ok(Math.hypot(p.ped.x - q2.x, p.ped.y - q2.y) > 80, 'thrown');
});

test('ride: board at a station, walk through the cars, get off at the next stop', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w);
  const t = w.trains[1];
  const st = w.map.rail.stations[t.stop];
  teleport(w, p.ped, st.platform.x, st.platform.y);
  w.step();
  const act = players.findInteraction(w, p);
  assert.ok(act && /Board the train|stairs/.test(act.label), act && act.label);
  act.run();
  assert.ok(p.ped.onTrain, 'aboard');
  w.step();
  // walking towards the back moves you into the next car
  const c0 = p.ped.onTrain.c;
  const car = w.get(t.cars[c0].id);
  for (let i = 0; i < 60; i++) { players.queueInput(p, { seq: seq++, bits: IN.SPRINT, mx: -Math.cos(car.a), my: -Math.sin(car.a), aim: 0 }); w.step(); }
  assert.ok(p.ped.onTrain.c > c0, 'through the gangway');
  run(w, TRAIN_DWELL_S);
  assert.ok(!t.dwellUntil, 'moving');
  const e = w.get(t.cars[p.ped.onTrain.c].id);
  assert.ok(Math.hypot(p.ped.x - e.x, p.ped.y - e.y) < 120, 'rides with the car');
  let at = false;
  for (let i = 0; i < 20 * 120 && !at; i++) { w.step(); at = !!t.dwellUntil; }
  assert.ok(at);
  const off = players.findInteraction(w, p);
  assert.ok(off && /Get off/.test(off.label), off && off.label);
  press(w, p, IN.VEHICLE, 2);
  assert.ok(!p.ped.onTrain, 'off the train');
  assert.ok(conn.sent.length > 0);
});

test('the subway: riders underground are a level of their own; the stairs bring you up to the street', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const { p: other } = joinPlayer(w);
  const rail = w.map.rail;
  const t = w.trains[1];
  const si = rail.stations.findIndex((s) => s.under);
  const st = rail.stations[si];
  // pull the train into the underground station
  t.s = mod(st.s + t.len / 2, rail.len); t.v = 0; t.stop = si; t.dwellUntil = w.time + TRAIN_DWELL_S;
  teleport(w, p.ped, st.platform.x, st.platform.y);
  w.step();
  const act = players.findInteraction(w, p);
  assert.ok(act && /stairs/.test(act.label), act && act.label);
  act.run();
  w.step();
  assert.ok(p.ped.sub, 'underground');
  assert.notEqual(w.map.tileAtPx(p.ped.x, p.ped.y), T.WATER);
  // someone standing on the street right above can't see or shoot you
  teleport(w, other.ped, p.ped.x + 30, p.ped.y);
  other.profile.weapons.pistol = 50; other.ped.mag.pistol = 12; other.ped.weapon = 'pistol';
  const hp = p.ped.hp;
  other.ped.protectUntil = 0;
  for (let i = 0; i < 5; i++) { other.ped.nextAttack = 0; combat.tryAttack(w, other.ped, Math.atan2(p.ped.y - other.ped.y, p.ped.x - other.ped.x)); }
  assert.equal(p.ped.hp, hp, 'bullets from the street don\'t reach the subway');
  w.step();
  const seen = [...other.known.keys()];
  assert.ok(!seen.includes(p.ped.id), 'not sent to the street');
  assert.ok(!seen.includes(t.cars[1].id), 'the train down there is not sent either');
  // the doors stay shut in the tunnel
  run(w, TRAIN_DWELL_S + 1.5);
  if (w.get(t.cars[p.ped.onTrain.c].id).sub) { press(w, p, IN.VEHICLE, 2); assert.ok(p.ped.onTrain, 'no jumping off in the tunnel'); }
  // ride round to the underground station again and take the stairs up
  t.s = mod(st.s + t.len / 2, rail.len); t.v = 0; t.stop = si; t.dwellUntil = w.time + TRAIN_DWELL_S;
  w.step();
  press(w, p, IN.VEHICLE, 2);
  assert.ok(!p.ped.onTrain && !p.ped.sub, 'up on the street');
  assert.ok(Math.hypot(p.ped.x - st.platform.x, p.ped.y - st.platform.y) < 40, 'at the entrance');
});

test('level crossings: gates come down, traffic waits, a car can smash through the arm', () => {
  const w = makeWorld();
  const rail = w.map.rail;
  const t = w.trains[0];
  const c = rail.crossings[0];
  for (const q of w.trains) { q.s = mod(c.s + 15000 + q.i * 8000, rail.len); q.dwellUntil = w.time + 999; }
  const { p } = joinPlayer(w);
  teleport(w, p.ped, c.x - Math.sin(c.a) * 400, c.y + Math.cos(c.a) * 400);
  w.step();
  assert.ok(!w.xing[0].down, 'up with no train near');
  runUpTo(w, t, c.s, 700);
  w.step();
  assert.ok(w.xing[0].down, 'down as the train comes');
  // a car driving up to the crossing along the road: the controller caps its speed
  const rx = -Math.sin(c.a), ry = Math.cos(c.a);
  const v = w.spawnVehicle('sedan', c.x + rx * 200, c.y + ry * 200, Math.atan2(-ry, -rx), { npcOwned: true });
  v.xingKey = 0 * 100000 + w.xing[0].closure; v.xingGo = false; // this driver waits
  assert.ok(trains.crossingLimit(w, v, 200) < 200, 'slows to stop at the gate');
  // drive straight through the arm
  v.x = c.x + rx * (CROSSING_ARM + 10); v.y = c.y + ry * (CROSSING_ARM + 10); v.vx = -rx * 200; v.vy = -ry * 200; w.place(v);
  run(w, 0.1);
  assert.ok(w.xing[0].broken[0], 'gate arm smashed');
});

test('wanted on the train: police come aboard at the next station', () => {
  const w = makeWorld({ npcBudget: 200 });
  const { p } = joinPlayer(w);
  const t = w.trains[1];
  const st = w.map.rail.stations[t.stop];
  teleport(w, p.ped, st.platform.x, st.platform.y);
  w.step();
  players.findInteraction(w, p).run();
  p.heat = 40; p.wanted = 2; p.ped.hp = 5000; p.ped.maxHp = 5000;
  let cops = 0;
  for (let i = 0; i < 20 * 140 && !cops; i++) {
    w.step();
    p.seenAt = w.time; p.heat = 40; p.wanted = 2;
    for (const id of t.riders) { const q = w.get(id); if (q && q.npc && q.npc.role === 'cop') cops++; }
  }
  assert.ok(cops >= 2, `cops boarded (${cops})`);
});

test('mail train job: board, crack the strongbox on the rural run, grab it, fence it', () => {
  const w = makeWorld({ npcBudget: 200 });
  const { p, prof } = joinPlayer(w, { bank: 0 });
  const fence = w.map.pois.find((q) => q.kind === 'fence');
  teleport(w, p.ped, fence.x, fence.y);
  economy.handleMenu(w, p, fence.id, 'trainjob');
  assert.equal(p.job && p.job.type, 'trainjob');
  run(w, 0.3);
  const t = w.trains.find((q) => q.mail >= 0);
  const mail = w.get(t.cars[t.mail].id);
  assert.ok(Math.hypot(p.job.tx - mail.x, p.job.ty - mail.y) < 5, 'arrow on the mail car');
  // out on the Refuge Island run, alongside the mail car in a pickup
  const rail = w.map.rail;
  runUpTo(w, t, rail.rural.s0 + 1200, 0);
  for (const id of [...t.riders]) { const q = w.get(id); if (q && q.npc) { t.riders.delete(id); w.remove(q); } } // no guards for this test
  w.step();
  const e = w.get(t.cars[t.mail].id);
  const truck = w.spawnVehicle('pickup', e.x - Math.sin(e.a) * 70, e.y + Math.cos(e.a) * 70, e.a, { npcOwned: false });
  truck.vx = e.vx; truck.vy = e.vy;
  p.ped.vehId = truck.id; p.ped.seat = 0; truck.seats[0] = p.ped.id; p.ped.x = truck.x; p.ped.y = truck.y; w.place(p.ped);
  const climb = trains.interaction(w, p);
  assert.ok(climb && /mail car/.test(climb.label), climb && climb.label);
  climb.run();
  assert.ok(p.ped.onTrain && p.ped.onTrain.c === t.mail);
  p.ped.onTrain.ox = MAIL_BOX.ox; p.ped.onTrain.oy = MAIL_BOX.oy;
  w.step();
  for (const id of [...t.riders]) { const q = w.get(id); if (q && q.npc) { t.riders.delete(id); w.remove(q); } } // no guards, no witnesses
  const crack = players.findInteraction(w, p);
  assert.ok(crack && /strongbox/.test(crack.label), crack && crack.label);
  crack.run();
  // (keep passing patrol cars out of sight: this checks that the countryside has no alarm bell)
  for (let i = 0; i < (STRONGBOX_CRACK_S + 0.3) * 20; i++) {
    for (const q of w.query(p.ped.x, p.ped.y, 800, K.PED)) if (q.npc && q.npc.role === 'cop') { const v = w.get(q.vehId); if (v) w.remove(v); w.remove(q); }
    w.step();
  }
  const box = [...w.entities.values()].find((q) => q.kind === K.CRATE && q.strongbox);
  assert.ok(box, 'strongbox thrown off');
  assert.equal(box.value, TRAIN_JOB_PAY);
  assert.equal(p.job.stage, 'grab');
  assert.equal(p.wanted, 0, 'out in the fields nobody heard it');
  // jump off, carry it to the fence
  press(w, p, IN.VEHICLE, 2);
  assert.ok(!p.ped.onTrain);
  teleport(w, p.ped, box.x, box.y); p.ped.downUntil = 0; p.ped.tumbleUntil = 0; p.ped.airUntil = 0; p.ped.vx = 0; p.ped.vy = 0;
  cargo.pickUp(w, p.ped, box);
  assert.equal(p.ped.carrying, box.id);
  teleport(w, p.ped, fence.x, fence.y);
  const sell = players.findInteraction(w, p);
  assert.ok(sell && /Black Market/.test(sell.label), sell && sell.label);
  sell.run();
  assert.equal(prof.bank, TRAIN_JOB_PAY);
  assert.equal(p.job, null, 'job done');
});

test('rider control kind: the client is told you are on a train', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const t = w.trains[0];
  const st = w.map.rail.stations[t.stop];
  teleport(w, p.ped, st.platform.x, st.platform.y);
  w.step();
  players.findInteraction(w, p).run();
  w.step();
  const me = players.buildMe(w, p);
  assert.ok(me.train && me.train.next, 'HUD: next station');
  assert.equal(CTRL.RIDER, 4);
});
