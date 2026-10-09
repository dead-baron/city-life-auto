// Explosions that make you go whoa (task #363) and being hit by a car - run over, onto the hood (task #361).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, straightRoad } from './helpers.js';
import { K } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { boomPlan, blastSize, PIECES, pieceCodes } from '../shared/explosions.js';
import { RUNOVER_LEFT } from '../shared/rules.js';

const vehicles = await import('../server/systems/vehicles.js');
const carhits = await import('../server/systems/carhits.js');

// a clear stretch of road with nothing else on it, a player close by (keeps it simulated)
function scene() {
  const w = makeWorld();
  const p = joinPlayer(w).p;
  const road = straightRoad(w.map, 1600);
  teleport(w, p.ped, road.x + 60, road.y - road.hw - 60);
  for (const e of [...w.entities.values()]) if ((e.kind === K.VEH || (e.kind === K.PED && e !== p.ped)) && Math.abs(e.y - road.y) < 400) w.remove(e);
  // every event, kept (a step clears the world's own list)
  const emit = w.emit.bind(w);
  w.seen = [];
  w.emit = (x, y, ev) => { w.seen.push(ev); emit(x, y, ev); };
  return { w, p, road };
}
const lastEvent = (w, kind) => { const l = w.seen.filter((ev) => ev.e === kind); return l.length ? l[l.length - 1] : null; };

test('an explosion\'s plan comes from its seed: the same seed, the same pieces and the same arc; bigger vehicles, bigger blasts', () => {
  const sedan = VEHICLES.sedan;
  for (const seed of [1, 7, 12345, 99999]) assert.deepEqual(boomPlan(seed, sedan), boomPlan(seed, sedan));
  let launch = 0, pieces = 0, plain = 0;
  for (let s = 1; s <= 300; s++) {
    const pl = boomPlan(s, sedan);
    if (pl.k === 'launch') { launch++; assert.ok(pl.launch && pl.launch.t >= 0.8 && pl.launch.h > 20 && pl.launch.d >= 30); }
    else if (pl.k === 'pieces') { pieces++; assert.ok(pl.pieces.length >= 5, 'blown apart: five or more pieces'); }
    else plain++;
    for (const pc of pl.pieces) assert.ok(PIECES[pc.c] && pc.sp > 0 && pc.vz > 0);
  }
  assert.ok(launch > 40 && pieces > 40 && plain > 20, `launch ${launch} pieces ${pieces} plain ${plain}`);
  assert.equal(boomPlan(5, VEHICLES.tanker).k, 'pieces', 'a tanker always blows apart');
  assert.ok(blastSize(VEHICLES.tanker).r > blastSize(VEHICLES.boxtruck).r && blastSize(VEHICLES.boxtruck).r > blastSize(VEHICLES.sedan).r && blastSize(VEHICLES.sedan).r > blastSize(VEHICLES.bike).r);
});

test('a vehicle explosion\'s event carries the seed and the pieces; launched, the wreck lands where the server says', () => {
  const { w, road } = scene();
  let launched = 0, apart = 0;
  for (let i = 0; i < 40 && (launched < 2 || apart < 1); i++) {
    const car = w.spawnVehicle('sedan', road.x + 300 + (i % 8) * 150, road.y, 0, { npcOwned: false });
    vehicles.explode(w, car, null);
    const ev = lastEvent(w, 'explode');
    assert.ok(ev && ev.s > 0 && ev.id === car.id && ev.m === car.def.i, 'the seed and the vehicle');
    const plan = boomPlan(ev.s, car.def);
    assert.equal(ev.pc, pieceCodes(plan), 'the pieces, as the seed makes them');
    assert.equal(ev.r, blastSize(car.def).r);
    if (ev.k === 'pieces') apart++;
    if (ev.k === 'launch') {
      launched++;
      assert.ok(car.fly && Number.isFinite(ev.lx) && Number.isFinite(ev.ly));
      for (let t = 0; t < 40 && car.fly; t++) w.step();
      assert.ok(!car.fly, 'down again');
      assert.equal(car.x, ev.lx); assert.equal(car.y, ev.ly);
      assert.ok(lastEvent(w, 'wreckland') && lastEvent(w, 'wreckland').id === car.id, 'it slams down');
      w.step();
      assert.ok(Math.hypot(car.x - ev.lx, car.y - ev.ly) < 1, 'and stays where it landed');
    }
    w.remove(car);
    w.seen.length = 0;
  }
  assert.ok(launched >= 2 && apart >= 1, `launched ${launched}, blown apart ${apart}`);
});

test('a launched wreck landing on a car sets it off (a chain reaction)', () => {
  const { w, road } = scene();
  let done = false;
  for (let i = 0; i < 80 && !done; i++) {
    const car = w.spawnVehicle('sedan', road.x + 500, road.y, 0, { npcOwned: false });
    vehicles.explode(w, car, null);
    if (!car.fly) { w.remove(car); continue; }
    // a car parked right where it comes down
    const other = w.spawnVehicle('sedan', car.fly.x1, car.fly.y1, 0, { npcOwned: false });
    for (let t = 0; t < 40 && car.fly; t++) w.step();
    assert.ok(other.wreckAt, 'the car it landed on went up too');
    done = true;
  }
  assert.ok(done, 'a wreck was launched');
});

// a car driving at a person standing in its path: x px ahead of its nose, at speed px/s
function drive(w, model, road, speed, opts = {}) {
  const v = w.spawnVehicle(model, road.x + 400, road.y, 0, { npcOwned: false });
  const ped = w.spawnPed(v.x + v.def.L / 2 + 12, road.y + (opts.dy || 0), { hp: 100, archetype: 'casual', name: 'Pat' });
  v.vx = speed;
  return { v, ped };
}

test('hit by a car: run over (lying low, or under a heavy vehicle), up onto the hood (a low front, moderate speed), knocked flying otherwise', () => {
  const { w, road } = scene();
  // lying in the road already: the car goes right over
  {
    const { v, ped } = drive(w, 'sedan', road, 260);
    ped.downUntil = w.time + 5;
    assert.equal(carhits.outcome(w, v, ped, 260), 'under');
    w.remove(v); w.remove(ped);
  }
  // a bus or a truck: often under it, never up on its hood
  {
    const { v, ped } = drive(w, 'bus', road, 260);
    let under = 0, hood = 0;
    for (let i = 0; i < 60; i++) { const o = carhits.outcome(w, v, ped, 260); if (o === 'under') under++; if (o === 'hood') hood++; }
    assert.ok(under > 15 && hood === 0, `bus: under ${under}, hood ${hood}`);
    w.remove(v); w.remove(ped);
  }
  // a low car at a moderate speed, hitting with its nose: up onto the hood, often
  {
    const { v, ped } = drive(w, 'sports', road, 260);
    let hood = 0, fling = 0;
    for (let i = 0; i < 60; i++) { const o = carhits.outcome(w, v, ped, 260); if (o === 'hood') hood++; if (o === 'fling') fling++; }
    assert.ok(hood > 15 && fling > 5, `sports: hood ${hood}, fling ${fling}`);
    // too fast for the hood: flying (or under)
    for (let i = 0; i < 30; i++) assert.notEqual(carhits.outcome(w, v, ped, 520), 'hood');
    w.remove(v); w.remove(ped);
  }
  // a motorbike: knocked flying
  {
    const { v, ped } = drive(w, 'bike', road, 260);
    for (let i = 0; i < 20; i++) assert.equal(carhits.outcome(w, v, ped, 260), 'fling');
    w.remove(v); w.remove(ped);
  }
});

test('run over slowly: critically hurt but alive, lying face down or on the back a few seconds', () => {
  const { w, road } = scene();
  let alive = 0;
  for (let i = 0; i < 12; i++) {
    const { v, ped } = drive(w, 'sedan', road, 200);
    w.seen.length = 0;
    const killed = carhits.apply(w, v, ped, 170, 'under', null);
    const ev = lastEvent(w, 'runover');
    assert.ok(ev && ev.id === ped.id && (ev.k === 'F' || ev.k === 'B') && ev.d >= 2.5);
    if (!killed && !ped.dead) {
      alive++;
      assert.ok(ped.hp > 0 && ped.hp <= ped.maxHp * RUNOVER_LEFT * 1.4 + 1, `critically hurt: ${ped.hp}`);
      assert.ok(ped.downUntil - w.time > 2.5, 'lying there a few seconds');
    }
    w.remove(v); w.remove(ped);
  }
  assert.ok(alive >= 10, `a slow run-over rarely kills: ${alive} / 12 alive`);
});

test('onto the hood: carried along, thrown off when the time is up or it brakes; moving rolls you off sooner', () => {
  const { w, road } = scene();
  // riding until the time runs out (driving straight on), then thrown
  {
    const { v, ped } = drive(w, 'sedan', road, 260);
    carhits.apply(w, v, ped, 260, 'hood', null);
    assert.equal(ped.hoodOf, v.id);
    const until = ped.hoodUntil;
    let t = 0;
    while (ped.hoodOf && t++ < 60) {
      v.vx = 260; v.vy = 0; v.av = 0; v.input.throttle = 1;
      w.step();
      if (ped.hoodOf) {
        const lx = (ped.x - v.x) * Math.cos(v.a) + (ped.y - v.y) * Math.sin(v.a);
        assert.ok(lx > 0 && lx < v.def.L / 2, 'on the hood');
      }
    }
    assert.ok(!ped.hoodOf && t <= Math.ceil((until - w.time + t / 20) * 20) + 2, 'thrown off when the ride is over');
    assert.ok(lastEvent(w, 'hoodoff'), 'thrown off');
    assert.ok(w.time < ped.downUntil, 'down on the ground after');
    w.remove(v); w.remove(ped);
  }
  // braking hard throws you off forwards at once
  {
    const { v, ped } = drive(w, 'sedan', road, 260);
    carhits.apply(w, v, ped, 260, 'hood', null);
    ped.hoodUntil = w.time + 5;
    v.vx = 0; v.vy = 0;
    w.step();
    assert.ok(!ped.hoodOf, 'off at once');
    assert.equal(lastEvent(w, 'hoodoff').k, 'brake');
    assert.ok(ped.x > v.x + v.def.L / 2 - 4, 'thrown off over the nose');
    w.remove(v); w.remove(ped);
  }
  // a player rolls off sooner by moving
  {
    const { w: w2, p, road: r2 } = scene();
    const v = w2.spawnVehicle('sedan', r2.x + 400, r2.y, 0, { npcOwned: false });
    teleport(w2, p.ped, v.x + v.def.L / 2 + 12, r2.y);
    v.vx = 260;
    carhits.apply(w2, v, p.ped, 260, 'hood', null);
    p.ped.hoodUntil = w2.time + 5;
    for (let t = 0; t < 6; t++) { v.vx = 260; v.av = 0; w2.step(); }
    assert.equal(p.ped.hoodOf, v.id, 'still riding');
    carhits.hoodInput(w2, p.ped, { mx: 0, my: 1 });
    v.vx = 260; w2.step();
    assert.ok(!p.ped.hoodOf, 'rolled off');
    assert.equal(lastEvent(w2, 'hoodoff').k, 'steer');
    assert.ok(p.ped.vy > 60, 'off toward the side they moved');
  }
});
