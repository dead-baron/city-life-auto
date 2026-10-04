// The railway: one loop round the whole map at grade, stations, level crossings, riding, run-over
// cars and people, cops boarding for wanted passengers and the mail-train strongbox job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { railAt, CROSSING_ARM, MAIL_BOX, RAIL_MAX_BRIDGE_TILES, PLATFORM_HALF, ISLANDS, CONSIST } from '../shared/map.js';
import { TRAIN_SPEED, TRAIN_DWELL_S, TRAIN_DRAG_EXPLODE_S, TRAIN_JOB_PAY, STRONGBOX_CRACK_S, TRAIN_HEADWAY_S, TRAIN_ACCEL, TRAIN_BRAKE, MAIL_WARN_S, BAIL_HURT_SPEED } from '../shared/rules.js';
import { CTRL } from '../shared/protocol.js';
import * as trains from '../server/systems/trains.js';
import * as players from '../server/systems/players.js';
import * as economy from '../server/systems/economy.js';
import * as cargo from '../server/systems/cargo.js';
import { IN } from '../shared/input.js';

const mod = (a, n) => ((a % n) + n) % n;
// the start of the longest dead-straight stretch of the rural run (+ a margin)
function straightRural(rail) {
  const pts = rail.pts.filter((p) => p.s > rail.rural.s0 && p.s < rail.rural.s1);
  let best = { s: pts[0].s, len: 0 }, run0 = 0;
  for (let i = 1; i < pts.length; i++) {
    const a0 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x), a1 = Math.atan2(pts[run0 + 1].y - pts[run0].y, pts[run0 + 1].x - pts[run0].x);
    if (Math.abs(a0 - a1) > 0.01) run0 = i - 1;
    else if (pts[i].s - pts[run0].s > best.len) best = { s: pts[run0].s, len: pts[i].s - pts[run0].s };
  }
  return best;
}
// put train t so that its nose is `ahead` px before arc position s, running at full speed
function runUpTo(w, t, s, ahead) { t.s = mod(s - ahead, w.map.rail.len); t.v = TRAIN_SPEED; t.acc = 0; t.braking = false; t.dwellUntil = 0; const sts = w.map.rail.stations; t.stop = sts.findIndex((q) => mod(q.s + t.len / 2 - t.s, w.map.rail.len) === Math.min(...sts.map((r) => mod(r.s + t.len / 2 - t.s, w.map.rail.len)))); }
let seq = 1;
function press(w, p, bits, n = 1, extra = {}) { for (let i = 0; i < n; i++) { players.queueInput(p, { seq: seq++, bits: i === 0 ? bits : 0, mx: 0, my: 0, aim: 0, ...extra }); w.step(); } }

test('the railway: one huge loop through the core of every main island, all of it above ground', () => {
  const w = makeWorld();
  const r = w.map.rail;
  assert.ok(r.len > 90000, `a long loop (${Math.round(r.len / 32)} tiles)`);
  assert.ok(r.stations.length >= 12, `${r.stations.length} stations`);
  assert.ok(r.pts.every((p) => !p.under) && r.stations.every((s) => !s.under), 'no tunnels, no underground stations');
  // a few stops on every main (road-connected) island; none on the boat-only ones
  const perIsle = {};
  for (const s of r.stations) { const k = w.map.islandAt(s.x, s.y); perIsle[k] = (perIsle[k] || 0) + 1; }
  for (const k of ['W', 'N', 'D', 'R', 'S']) assert.ok(perIsle[k] >= 2, `${ISLANDS[k].name}: ${perIsle[k] || 0} stops`);
  assert.ok(perIsle.F >= 1, 'a stop out in Dry Creek');
  for (const [k, I] of Object.entries(ISLANDS)) if (I.boatOnly) assert.ok(!perIsle[k], `no line out to ${I.name}`);
  // close to every major district
  const dists = new Set(r.stations.map((s) => w.map.districtAt(s.platform.x, s.platform.y).name));
  for (const d of ['Westport Center', 'Northshore', 'Old Town', 'Civic Center', 'Downtown', 'Midtown', 'The Yards', 'Pine Hills', 'Southside', 'Dry Creek', 'Lake District', 'Cedar Falls'])
    assert.ok(dists.has(d) || r.stations.some((s) => s.name.startsWith(d)), `a stop in ${d} (${[...dists]})`);
  // one loop that links the islands: it leaves and comes back to each over a bridge
  const seq = [];
  for (const p of r.pts) { const k = w.map.islandAt(p.x, p.y); if (k && k !== seq[seq.length - 1]) seq.push(k); }
  for (const k of ['W', 'N', 'D', 'R', 'F', 'S']) assert.ok(seq.includes(k), `the line reaches ${ISLANDS[k].name}`);
  // it runs through the middle of things, not round the outskirts: hardly any of it hugs a coast
  const land = r.pts.filter((p) => !p.bridge && !p.deck);
  const shore = land.filter((p) => w.map.distSea[Math.floor(p.y / 32) * w.map.w + Math.floor(p.x / 32)] <= 6 * 4).length;
  assert.ok(shore < land.length * 0.04, `${Math.round(shore / land.length * 100)}% along the shore`);
  // every street it meets is a level crossing (none closed off): there are lots of them, on roads
  assert.ok(r.crossings.length >= 40, `${r.crossings.length} crossings`);
  for (const c of r.crossings) assert.ok([T.ROAD, T.BRIDGE].includes(w.map.tileAtPx(c.x, c.y)), 'crossings are on roads');
  assert.ok(r.rural && r.rural.s1 - r.rural.s0 > 2500, 'long rural stretch');
  for (const p of r.pts) assert.notEqual(w.map.tileAtPx(p.x, p.y), T.BUILDING, 'no track through buildings');
  // the line runs on land; open water is crossed on bridges between the islands
  let run = 0, longest = 0, total = 0;
  for (const p of r.pts) {
    const tx = Math.floor(p.x / 32), ty = Math.floor(p.y / 32), t = w.map.tileAt(tx, ty);
    const deck = t === T.BRIDGE && !w.map.roadAxis[ty * w.map.w + tx];
    if (deck) { run += 8; total += 8; longest = Math.max(longest, run); } else run = 0;
    assert.ok(![T.WATER, T.DEEP].includes(t), 'never laid in the water');
  }
  assert.ok(longest <= RAIL_MAX_BRIDGE_TILES * 32, `longest bridge ${Math.round(longest / 32)} tiles`);
  assert.ok(total < r.len * 0.12, `${Math.round(total / r.len * 100)}% of the line is bridge`);
  // open-air platforms as long as a train, beside the track, that you can stand on
  for (const s of r.stations) {
    assert.ok(w.map.pois[s.poi].kind === 'station');
    assert.equal(s.half, PLATFORM_HALF);
    let ok = 0, n = 0;
    for (let d = -PLATFORM_HALF; d <= PLATFORM_HALF; d += 40) {
      const q = railAt(r, s.s + d), x = q.x - Math.sin(q.a) * s.side * 70, y = q.y + Math.cos(q.a) * s.side * 70;
      n++; if ([T.PLAZA, T.DOCK, T.ROAD, T.SIDEWALK].includes(w.map.tileAtPx(x, y))) ok++;
    }
    assert.ok(ok >= n * 0.8, `${s.name}: platform ${ok}/${n}`);
  }
  assert.ok(Math.max(...w.trains.map((t) => t.len)) <= PLATFORM_HALF * 2 + 40, 'a whole train fits along the platform');
  // about one train a minute at every station: the fleet fits the loop's run time
  assert.ok(Math.abs(w.railLap / w.trains.length - TRAIN_HEADWAY_S) < TRAIN_HEADWAY_S * 0.25, `${w.trains.length} trains on a ${Math.round(w.railLap)}s loop`);
  assert.ok(w.trains.every((t) => t.cars.length === CONSIST.length), 'five-car trains');
  assert.ok(w.trains.some((t) => t.mail >= 0), 'a mail train');
});

test('trains run the loop and stop at every station for the dwell time', () => {
  const w = makeWorld();
  const t = w.trains[1];
  t.dwellUntil = w.time + TRAIN_DWELL_S; // (at the start trains are held at their stations to space them out)
  const first = t.stop;
  run(w, TRAIN_DWELL_S + 1);
  assert.ok(!t.dwellUntil && t.v > 0, 'departed');
  assert.equal(t.stop, (first + 1) % w.map.rail.stations.length);
  let stopped = false, prevV = 0, maxAcc = 0, maxDec = 0, top = 0, arriveV = 0;
  for (let i = 0; i < 20 * 120 && !stopped; i++) {
    const v0 = t.v;
    w.step();
    if (t.dwellUntil) { stopped = true; arriveV = v0; break; }
    const a = (t.v - prevV) * 20; prevV = t.v;
    if (i > 0) { maxAcc = Math.max(maxAcc, a); maxDec = Math.min(maxDec, a); }
    top = Math.max(top, t.v);
  }
  assert.ok(stopped, 'pulled into the next station');
  const st = w.map.rail.stations[t.stop];
  const mid = mod(t.s - t.len / 2, w.map.rail.len);
  assert.ok(Math.abs(mid - st.s) < 3, 'stopped with its middle at the platform');
  // eased in and out: no lurch pulling away, no slam into the platform
  assert.ok(maxAcc <= TRAIN_ACCEL + 1, `pull-away ${maxAcc.toFixed(0)}`);
  assert.ok(maxDec >= -TRAIN_BRAKE * 1.5, `braking ${maxDec.toFixed(0)}`);
  assert.ok(arriveV < 12, `rolled in gently (${arriveV.toFixed(1)} px/s)`);
});

test('trains run at car speed, keep their distance, and every platform clock counts down to the next one', () => {
  const w = makeWorld();
  const rail = w.map.rail, L = rail.len;
  assert.ok(TRAIN_SPEED >= 520, 'as quick as a fast car');
  // the clocks: predict when the next train reaches each station, then watch it arrive
  run(w, TRAIN_DWELL_S + 1); // (they start out at stations)
  const tt0 = trains.timetable(w);
  assert.equal(tt0.length, rail.stations.length);
  const target = tt0.map((v, i) => (v > 5 ? { i, at: w.time + v } : null)).filter(Boolean);
  assert.ok(target.length > 2);
  const seen = new Map();
  let minGap = Infinity, maxWait = 0;
  for (let k = 0; k < 20 * 320; k++) {
    w.step();
    for (const t of w.trains) {
      if (t.dwellUntil && !seen.has(`${t.stop}@${Math.round(t.dwellUntil)}`)) seen.set(`${t.stop}@${Math.round(t.dwellUntil)}`, { si: t.stop, at: w.time });
      for (const u of w.trains) if (u !== t) minGap = Math.min(minGap, mod(u.s - u.len - t.s, L));
    }
    if (k % 20 === 0) maxWait = Math.max(maxWait, ...trains.timetable(w));
  }
  for (const q of target) {
    const arr = [...seen.values()].filter((a) => a.si === q.i).sort((a, b) => a.at - b.at)[0];
    assert.ok(arr, `a train reached station ${q.i}`);
    assert.ok(Math.abs(arr.at - q.at) < 3, `clock at ${rail.stations[q.i].name}: predicted ${q.at.toFixed(1)}, arrived ${arr.at.toFixed(1)}`);
  }
  assert.ok(minGap > 400, `trains keep their distance (${minGap.toFixed(0)} px)`);
  assert.ok(maxWait < 90, `trains come often (longest wait ${maxWait}s)`);
});

test('nothing stops a train: a car on the line is dragged along and blows up; a pedestrian is thrown', () => {
  const w = makeWorld();
  const t = w.trains[0];
  const rail = w.map.rail;
  const s = straightRural(rail).s + 500; // out on the long straight through the fields
  w.trains.forEach((u, k) => { if (u !== t) { u.s = mod(s - 9000 - k * 1500, rail.len); u.dwellUntil = w.time + 9999; } }); // just this one on this stretch
  runUpTo(w, t, s, 400);
  t.stop = (t.stop + 2) % rail.stations.length; // and not stopping anywhere near here
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
  t.dwellUntil = w.time + TRAIN_DWELL_S;
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

test('boarding is easy: anywhere on the platform while a train is in, with a clear prompt', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const rail = w.map.rail;
  const t = w.trains[1];
  const si = (t.stop + 4) % rail.stations.length, st = rail.stations[si];
  w.trains.forEach((u, k) => { if (u !== t) { u.s = mod(st.s + 9000 + k * 1500, rail.len); u.dwellUntil = w.time + 9999; u.stop = (si + 3) % rail.stations.length; } }); // the others well away
  // no train yet: the platform says when the next one is due
  t.s = mod(st.s - 6000, rail.len); t.v = 0; t.stop = si; t.dwellUntil = 0;
  const end = railAt(rail, st.s + PLATFORM_HALF - 60);
  teleport(w, p.ped, end.x - Math.sin(end.a) * st.side * 70, end.y + Math.cos(end.a) * st.side * 70); // way down the far end
  w.step();
  let act = players.findInteraction(w, p);
  assert.ok(!act || !/Board/.test(act.label), 'nothing to board yet');
  // the train pulls in: the prompt says so, from anywhere on the platform
  t.s = mod(st.s + t.len / 2, rail.len); t.v = 0; t.dwellUntil = w.time + TRAIN_DWELL_S;
  for (let i = 0; i < 5; i++) w.step();
  act = players.findInteraction(w, p);
  assert.ok(act && /Board the train - next stop/.test(act.label), act && act.label);
  assert.ok(/^E: Board the train/.test(p.prompt), `HUD prompt: ${p.prompt}`);
  press(w, p, IN.ACTION, 2);
  assert.ok(p.ped.onTrain, 'aboard');
  // and the station board explains it for desktop and touch
  const board = economy.poiLabel(w, p, w.map.pois[st.poi]);
  assert.ok(/station/i.test(board), board);
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
  // out on the Dry Creek run, alongside the mail car in a pickup
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

test('mail car guards order you out before they shoot - and let you go if you leave', () => {
  const w = makeWorld({ npcBudget: 200 });
  const { p } = joinPlayer(w);
  const t = w.trains.find((q) => q.mail >= 0);
  const mail = w.get(t.cars[t.mail].id);
  teleport(w, p.ped, mail.x + 400, mail.y);
  run(w, 1.2); // the guards man their posts while someone's around
  const guards = [...t.riders].map((id) => w.get(id)).filter((q) => q && q.npc && q.npc.role === 'railguard');
  assert.ok(guards.length >= 1, 'guards aboard');
  trains.board(w, p.ped, t, t.mail, 20, 0, 0);
  const hp0 = p.ped.hp;
  run(w, MAIL_WARN_S - 1);
  assert.equal(p.ped.hp, hp0, 'a warning first, no shots');
  assert.ok(guards.some((g) => w.time < (g.aimUntil || 0)), 'guns drawn on you');
  p.ped.onTrain.c = t.mail - 1; // back out into the coach
  run(w, MAIL_WARN_S + 1);
  assert.equal(p.ped.hp, hp0, 'left in time: they let you go');
  p.ped.onTrain.c = t.mail; p.ped.onTrain.ox = 20;
  run(w, MAIL_WARN_S + 2.5);
  assert.ok(p.ped.hp < hp0 || p.ped.dead, 'stayed: they open fire');
});

test('jumping off a train: slow, you just roll; at full speed the landing hurts', () => {
  const w = makeWorld();
  const rail = w.map.rail;
  const t = w.trains[0];
  w.trains.forEach((u, k) => { if (u !== t) { u.s = mod(t.s - 9000 - k * 1500, rail.len); u.dwellUntil = w.time + 9999; } });
  const tryJump = (v) => {
    const { p } = joinPlayer(w);
    runUpTo(w, t, straightRural(rail).s + 600, 0);
    t.stop = (t.stop + 2) % rail.stations.length;
    t.v = v;
    trains.board(w, p.ped, t, 1, 0, 0, 0);
    w.step();
    const hp0 = p.ped.hp;
    trains.getOff(w, p);
    assert.ok(!p.ped.onTrain, 'off');
    run(w, 2.5);
    return hp0 - p.ped.hp;
  };
  assert.equal(tryJump(100), 0, 'barely moving: step down');
  assert.equal(tryJump(260), 0, 'at a jog: tuck and roll, unhurt');
  assert.ok(tryJump(TRAIN_SPEED) > 0, 'at full speed: hurt');
});
