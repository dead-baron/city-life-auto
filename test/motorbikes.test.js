// Motorcycles and biker culture (task #366, concept sheets MC1-MC5 and NP4): the MC1 line-up as vehicles of their own
// (a cruiser, a tourer, a chopper, a bobber, a café racer, the sport bike, a dirt bike, a scooter, a trike, the police
// tourer, a rat bike, a bagger), each with its own feel; where they turn up; the Rusty Spur roadhouse; the three clubs
// riding two by two; a club that fights back together; the bike thief.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { VEHICLES, MOTOS, MOTO_MIX, motoMix } from '../shared/vehicles.js';
import { vehStep, newVehState } from '../shared/physics.js';
import { ENGINE_CLASS } from '../client/sound/vehicles.js';
import * as economy from '../server/systems/economy.js';
import * as vehicles from '../server/systems/vehicles.js';

const NEW = ['vtwin', 'tourer', 'chopper', 'bobber', 'caferacer', 'dirtbike', 'scooter', 'trike', 'ratbike', 'bagger'];
// flat ground of one kind as far as the eye can see
const flat = (t) => ({ w: 4096, h: 4096, tileAt: () => t, tileAtPx: () => t, solidProps: new Map(), levels: null });
// drive a bike flat out on that ground for a few seconds: its top speed, and the state
function run(id, t, secs = 6, steer = 0) {
  const def = VEHICLES[id], s = newVehState(15000, 15000, 0), m = flat(t);
  let top = 0, t60 = 0, turned = 0;
  for (let i = 0; i < 20 * secs; i++) {
    const a0 = s.a;
    vehStep(s, { throttle: 1, steer, hb: false, slide: false, drv: true }, 0.05, m, def, { rain: false });
    turned += Math.abs(Math.atan2(Math.sin(s.a - a0), Math.cos(s.a - a0)));
    const sp = Math.hypot(s.vx, s.vy);
    top = Math.max(top, sp);
    if (!t60 && sp > 300) t60 = (i + 1) * 0.05;
  }
  return { top, t60: t60 || 99, s, turned };
}

test('motorcycles: twelve MC1 bikes, each a valid vehicle with its own name, engine and feel', () => {
  for (const id of [...NEW, 'bike', 'policebike']) assert.ok(MOTOS.includes(id), `${id} is a motorcycle`);
  const names = new Set();
  for (const id of NEW) {
    const d = VEHICLES[id];
    assert.equal(d.kind, 'bike', id);
    assert.ok(!d.pedal, `${id}: an engine`);
    assert.ok(d.L >= 36 && d.L <= 70 && d.W >= 16 && d.W <= 40, `${id}: ${d.L} x ${d.W}`);
    assert.ok(d.seats >= 1 && d.seats <= 2, `${id}: seats`);
    assert.ok(d.max >= 300 && d.max <= 800 && d.accel >= 250 && d.accel <= 650 && d.turn >= 2 && d.turn <= 4.6 && d.grip >= 8 && d.hp >= 50, `${id}: handling in range`);
    assert.equal(d.slots.length, 1, `${id}: one crate on the rack`);
    assert.ok(d.slots[0][0] < 0, `${id}: ...at the back`);
    assert.ok(d.price > 1000, `${id}: for sale`);
    assert.ok(ENGINE_CLASS[id], `${id}: an engine sound`);
    assert.ok(!names.has(d.name), `${id}: its own name`);
    names.add(d.name);
  }
  // the classes sound like what they are
  assert.equal(ENGINE_CLASS.vtwin, 'vtwin'); assert.equal(ENGINE_CLASS.bike, 'sportbike'); assert.equal(ENGINE_CLASS.scooter, 'scooter'); assert.equal(ENGINE_CLASS.dirtbike, 'twostroke');
  // the tourer and the bagger carry two; the chopper and the bobber are one-seaters
  assert.equal(VEHICLES.tourer.seats, 2); assert.equal(VEHICLES.chopper.seats, 1);
  // indexes are unique (the wire sends the index)
  const idx = Object.values(VEHICLES).map((d) => d.i);
  assert.equal(new Set(idx).size, idx.length);
});

test('motorcycles: they drive - accelerate, turn and brake - and each has its own feel', () => {
  const road = {};
  for (const id of [...NEW, 'bike']) {
    const r = run(id, T.ROAD);
    road[id] = r;
    assert.ok(r.top > VEHICLES[id].max * 0.85, `${id}: reaches ${Math.round(r.top)} of ${VEHICLES[id].max} px/s`);
    // turns: steering at speed swings the heading round
    const tr = run(id, T.ROAD, 4, 1);
    assert.ok(tr.turned > 2, `${id}: turns (${tr.turned.toFixed(2)} rad)`);
    // brakes: from full speed to a stop in a couple of seconds
    const s = run(id, T.ROAD, 5).s, m = flat(T.ROAD);
    let t = 0;
    while (s.vx * Math.cos(s.a) + s.vy * Math.sin(s.a) > 5 && t < 4) { vehStep(s, { throttle: -1, steer: 0, hb: false, slide: false, drv: true }, 0.05, m, VEHICLES[id], { rain: false }); t += 0.05; }
    assert.ok(t < 2.5, `${id}: stops in ${t.toFixed(2)} s`);
  }
  // the sport bike: very fast, fierce off the line; the scooter: slow; the cruisers and baggers: heavy, lower top speed
  assert.equal(Math.max(...Object.values(road).map((r) => r.top)), road.bike.top, 'the sport bike is the fastest');
  assert.ok(road.bike.t60 <= Math.min(...NEW.map((id) => road[id].t60)), 'and the quickest off the line');
  assert.equal(Math.min(...Object.values(road).map((r) => r.top)), road.scooter.top, 'the scooter the slowest');
  assert.ok(VEHICLES.scooter.turn > VEHICLES.vtwin.turn && VEHICLES.scooter.L < VEHICLES.vtwin.L, '...and nimble');
  for (const id of ['vtwin', 'bagger', 'tourer']) assert.ok(VEHICLES[id].mass > VEHICLES.bike.mass && VEHICLES[id].max < VEHICLES.bike.max, `${id}: heavy, lower top speed`);
  // the chopper's long fork: wide turns
  assert.ok(VEHICLES.chopper.turn < VEHICLES.vtwin.turn && VEHICLES.chopper.L > VEHICLES.vtwin.L);
  // the dirt bike: good off road, tops out lower on the tarmac; the sport bike hates the dirt
  const dg = run('dirtbike', T.GRASS).top, dd = run('dirtbike', T.DIRT).top, sg = run('bike', T.GRASS).top;
  assert.ok(road.dirtbike.top < road.bike.top * 0.8, 'the dirt bike tops out lower on asphalt');
  assert.ok(dg > road.dirtbike.top * 0.85 && dd > road.dirtbike.top * 0.85, `the dirt bike hardly slows on grass (${Math.round(dg)}) and dirt (${Math.round(dd)})`);
  assert.ok(dg > sg, `off road the dirt bike outruns the sport bike (${Math.round(dg)} vs ${Math.round(sg)})`);
});

test('motorcycles: a crash throws a rider off a bike, never off the trike', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  for (const [id, thrown] of [['vtwin', true], ['trike', false]]) {
    const v = w.spawnVehicle(id, p.ped.x + 200, p.ped.y, 0, {});
    teleport(w, p.ped, v.x - 60, v.y);
    p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id; p.ped.hidden = false;
    vehicles.bikeCrash(w, v, 400);   // (what stepVehicle does on a hard knock)
    assert.equal(!p.ped.vehId, thrown, `${id}: ${thrown ? 'thrown off' : 'still aboard'}`);
    if (p.ped.vehId) vehicles.ejectPed(w, p.ped, false);
    w.remove(v);
    p.ped.dead = false; p.ped.hp = p.ped.maxHp;
  }
});

test('motorcycles: the dealer sells them; the mix picks the right bikes for the place', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const dealer = w.map.pois.find((q) => q.kind === 'dealer');
  const opts = economy.buildMenu(w, p, dealer).opts.map((o) => o.id);
  for (const id of NEW) assert.ok(opts.includes(`vb:${id}`), `the dealer sells the ${VEHICLES[id].name}`);
  const ids = (mix) => mix.map(([id]) => id);
  const top = (mix) => mix.slice().sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(top(motoMix('ave', 'towers')), 'bike', 'sport bikes downtown');
  assert.equal(top(motoMix('hwy', 'rural')), 'bike', '...and on the highways');
  assert.ok(!ids(MOTO_MIX.hwy).includes('scooter'), 'no scooters on the highway');
  assert.equal(top(motoMix('st', 'beach')), 'scooter', 'scooters by the beach');
  assert.equal(top(motoMix('st', 'commercial')), 'scooter', '...and in the busy centre');
  for (const st of ['rural', 'desert']) assert.ok(['vtwin', 'bagger'].includes(top(motoMix('rural', st))), `cruisers and baggers on ${st} roads`);
  assert.equal(top(motoMix('dirt', 'wild')), 'dirtbike', 'dirt bikes on the country tracks');
  for (const mix of Object.values(MOTO_MIX)) for (const [id] of mix) assert.ok(MOTOS.includes(id), `${id} is a motorcycle`);
  void K;
});
