// The first car is earned, by the path you pick (server/systems/firstcar.js; the owner, 11-06 22:49): honest work and the
// great outdoors get cash and buy a beater at the used lot by the station, the hustle steals the car left in the alley
// for them (nobody calls that one in), "just let me roam" gets the cash and the lot on the map. Each step-1 at every
// arrival station; fifty new players at once each get a car on a space of its own; the marker; the cash once. On today's
// map (no arrival lines: its stations with a car park; the used lot a dealership, the alley the station's car park) -
// World v3's park station and its hand-built block: test/world3arrivals.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { FTUE, STAR_HEAT, BAIL_PER_STAR, BUST_FINE_PER_STAR } from '../shared/rules.js';
import { K } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import * as ftue from '../server/systems/ftue.js';
import * as firstcar from '../server/systems/firstcar.js';
import * as economy from '../server/systems/economy.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as safety from '../server/systems/safety.js';
import { defaultProfile } from '../server/store.js';

// a new character, look picked, through the station's card (stn: the one picked; null the default) and the arrival to
// the question
function toQuestion(w, stn = null, o = {}) {
  const j = joinPlayer(w, o);
  j.prof.lookPicked = true;
  run(w, 0.6);
  if (stn == null) ftue.handle(w, j.p, { a: 'skip' }); else ftue.handle(w, j.p, { a: 'pick', stn });
  ftue.handle(w, j.p, { a: 'arrived' });
  assert.equal(j.prof.ftue.st, 'ask');
  return j;
}
const answer = (w, p, a) => { ftue.onMenu(w, p, ftue.ASK_POI, a); run(w, 0.1); };
const me = (w, p) => players.buildMe(w, p);
// walk to the lot's counter and buy a beater: the toasts it raised
function buyAt(w, p, poiId, model) {
  const poi = w.map.pois[poiId];
  teleport(w, p.ped, poi.x, poi.y);
  p.toasts.length = 0;
  economy.handleMenu(w, p, poi.id, `ub:${model}`);
  return p.toasts.map((t) => t.text).join(' | ');
}
// walk up to the car left in the alley and get in
function steal(w, p) {
  const v = firstcar.markOf(w, p);
  assert.ok(v, 'a car left for you in the alley');
  teleport(w, p.ped, v.x, v.y + v.def.W / 2 + 8);
  if (!vehicles.tryEnter(w, p.ped)) vehicles.tryEnter(w, p.ped);   // (Safety mode on: press twice)
  return v;
}
const lotOf = (w, p) => firstcar.placesFor(w, p.profile.ftue.stn).lot;

test('the economy: a new character\'s cash and the answer\'s buy one beater at the used lot - only just', () => {
  const base = defaultProfile('x').cash, have = base + FTUE.cash, prices = Object.values(FTUE.lot);
  for (const [id, price] of Object.entries(FTUE.lot)) {
    assert.ok(VEHICLES[id] && VEHICLES[id].kind === 'car', `${id}: a car`);
    assert.equal(VEHICLES[id].price, undefined, `${id}: no list price (only the used lots and the dealers' back row sell it)`);
    assert.ok(price <= have, `${VEHICLES[id].name} affordable ($${price} of $${have})`);
    assert.ok(have - price < 100, `only just: $${have - price} left`);
    assert.ok(VEHICLES[id].max < VEHICLES.compact.max, `${id}: a beater, slower than the Hatchback`);
  }
  assert.ok(have < Math.min(...Object.values(VEHICLES).filter((d) => d.price && d.kind === 'car').map((d) => d.price)), 'no list-price car with it');
  assert.ok(Math.min(...prices) >= 2 * base, 'not with a new character\'s own cash alone');
  assert.ok(VEHICLES.rustpickup.slots.length >= 4, 'the pickup\'s bed');
  // the hustle's pocket money (the owner, 11-07): food, ammo or a bail - never a used-lot beater on top of your own
  const hc = FTUE.hustleCash;
  assert.ok(hc >= 150 && hc <= 250 && hc < FTUE.cash, `a smaller grant ($${hc})`);
  assert.ok(base + hc < Math.min(...prices), `no beater with it ($${base + hc})`);
  assert.ok(hc >= 2 * BAIL_PER_STAR && hc >= BUST_FINE_PER_STAR - base, 'a 2-star bail, or a 1-star bust\'s fine');
});

test('honest work: the cash, step 1 the used lot - a beater bought, on a space of its own - then the drive and the round', () => {
  const w = makeWorld();
  const { p, prof, conn } = toQuestion(w);
  const cash0 = prof.cash;
  answer(w, p, 'work');
  const f = prof.ftue;
  assert.equal(prof.cash, cash0 + FTUE.cash, 'the cash');
  assert.equal(f.st, 'goal'); assert.equal(f.step, 1);
  assert.equal(f.car.k, 'buy');
  const lot = lotOf(w, p);
  assert.ok(lot && f.car.poi === lot.poi, 'the station\'s used lot');
  const m = me(w, p);
  assert.match(m.ftue.line, /Buy a cheap car at/); assert.equal(m.ftue.ctl, 'move');
  assert.deepEqual([m.job.x, m.job.y], [Math.round(lot.x), Math.round(lot.y)], 'the way to the lot');
  assert.deepEqual(m.job.step, [1, 3]);
  // the lot's menu: the beaters, affordable
  const poi = w.map.pois[lot.poi];
  teleport(w, p.ped, poi.x, poi.y);
  const menu = economy.buildMenu(w, p, poi), rows = menu.opts.filter((o) => o.id.startsWith('ub:'));
  assert.ok(rows.length >= 1 && rows.every((o) => o.price <= prof.cash + prof.bank), 'a small, cheap stock you can afford');
  const before = prof.cash + prof.bank;
  assert.match(buyAt(w, p, lot.poi, 'starter'), /You bought a Rusty Compact/);
  assert.equal(prof.cash + prof.bank, before - FTUE.lot.starter);
  assert.equal(prof.vehicles.length, 1); assert.equal(prof.vehicles[0].model, 'starter');
  const v = w.get(p.activeVehicle);
  assert.ok(v && v.owner === prof.pid && v.model === 'starter', 'out on the lot');
  assert.ok(Math.hypot(v.x - poi.x, v.y - poi.y) < 2000, 'by the lot');
  assert.deepEqual(prof.firstCar, { k: 'buy', model: 'starter', drove: 0 });
  run(w, 0.6);
  assert.equal(f.step, 2, 'bought: on to the drive');
  assert.match(me(w, p).ftue.line, /Get in your car and drive to/);
  const mk = me(w, p).car;
  assert.deepEqual(mk, [Math.round(v.x), Math.round(v.y), v.def.i, 1], 'YOUR CAR: the one you bought, full');
  // in and driven: the marker small after; on to the goal
  teleport(w, p.ped, v.x, v.y + v.def.W / 2 + 8);
  assert.ok(vehicles.tryEnter(w, p.ped) && p.ped.vehId === v.id);
  v.vx = 200; run(w, 0.6); v.vx = 0;
  assert.equal(prof.firstCar.drove, 1);
  teleport(w, v, f.goal.x + 40, f.goal.y); run(w, 0.6);
  assert.equal(f.step, 3);
  void conn;
});

test('a little hustle: pocket money, step 1 the car left in the alley - stolen, and nobody calls it in - then the fence', () => {
  const w = makeWorld();
  const { p, prof } = toQuestion(w);
  const cash0 = prof.cash;
  answer(w, p, 'hustle');
  const f = prof.ftue;
  assert.equal(prof.cash, cash0 + FTUE.hustleCash, 'pocket money: the car you take');
  assert.equal(f.step, 1); assert.equal(f.car.k, 'steal');
  const v = firstcar.markOf(w, p), m = me(w, p);
  assert.ok(v && v.ftueMark === prof.pid && !v.owner && v.npcOwned, 'a parked car, nobody\'s - left for you');
  assert.deepEqual(m.job.veh, [Math.round(v.x), Math.round(v.y), v.def.i, 'UNLOCKED'], 'the car ringed, UNLOCKED on its plate');
  assert.match(m.ftue.line, /Steal a car/); assert.equal(m.ftue.ctl, 'vehicle');
  assert.doesNotMatch(m.ftue.line, /Safety/);
  const cx0 = prof.criminalExp;
  steal(w, p);
  assert.equal(p.ped.vehId, v.id);
  assert.equal(p.wanted, 0, 'nobody called it in');
  assert.ok(p.toasts.some((t) => /nobody saw this one/.test(t.text)), 'the lesson: next time someone might');
  assert.ok(prof.criminalExp > cx0, 'a crime all the same');
  assert.equal(v.ftueMark, 0, 'an ordinary stolen car from now on');
  run(w, 0.6);
  assert.equal(f.step, 2);
  assert.match(me(w, p).ftue.line, /Drive to/);
  assert.deepEqual(prof.firstCar, { k: 'steal', model: v.model, drove: 0 });
  // a second theft is no gentler than any
  const { p: q } = toQuestion(w);
  answer(w, q, 'hustle');
  const v2 = firstcar.markOf(w, q);
  assert.notEqual(v2.id, v.id, 'a car of their own');
  v2.ftueMark = 0;   // (as if someone else's: an ordinary parked car)
  teleport(w, q.ped, v2.x, v2.y + v2.def.W / 2 + 8);
  q.toasts.length = 0;
  vehicles.tryEnter(w, q.ped);
  assert.ok(!q.toasts.some((t) => /nobody saw this one/.test(t.text)));
});

test('the hustle with Safety mode on: the step says so, and the first press only warns', () => {
  const w = makeWorld();
  const { p, prof } = toQuestion(w);
  safety.set(p, true);
  answer(w, p, 'hustle');
  assert.match(me(w, p).ftue.line, /Safety mode is on: press twice/);
  const v = firstcar.markOf(w, p);
  teleport(w, p.ped, v.x, v.y + v.def.W / 2 + 8);
  vehicles.tryEnter(w, p.ped);
  if (p.ped.vehId !== v.id) { assert.ok(firstcar.markOf(w, p), 'still waiting after the warning'); vehicles.tryEnter(w, p.ped); }
  assert.equal(p.ped.vehId, v.id);
  assert.equal(p.wanted, 0);
  void prof;
});

test('the great outdoors: the cash, the rod and bait, step 1 a pickup at the used lot; roam: the cash and the lot on the map', () => {
  const w = makeWorld();
  const { p, prof } = toQuestion(w);
  answer(w, p, 'outdoors');
  assert.ok(prof.inventory[FTUE.rod] >= 1 && prof.inventory[FTUE.bait[0]] >= FTUE.bait[1], 'the rod and bait');
  assert.equal(prof.ftue.car.k, 'buy');
  const lot = lotOf(w, p);
  assert.match(buyAt(w, p, lot.poi, 'rustpickup'), /You bought a Rusty Pickup/);
  assert.equal(w.get(p.activeVehicle).model, 'rustpickup');
  run(w, 0.6);
  assert.equal(prof.ftue.step, 2);
  // roam
  const { p: r, prof: rp, conn } = toQuestion(w);
  const c0 = rp.cash;
  answer(w, r, 'roam');
  assert.equal(rp.cash, c0 + FTUE.cash);
  assert.equal(rp.ftue.st, 'done'); assert.equal(rp.ftue.how, 'roam');
  const mk = conn.sent.find((m) => m && m.t === 'ftue' && m.a === 'mark'), rl = firstcar.placesFor(w, rp.ftue.stn).lot;
  assert.ok(mk && mk.label === rl.name && mk.x === Math.round(rl.x), 'the used lot as the waypoint');
  assert.equal(me(w, r).job, null, 'no steps');
});

test('each path\'s first step at each arrival station: buy, steal, the pickup, roam', () => {
  const w = makeWorld();
  const cs = firstcar.arrivalChoices(w);
  assert.ok(cs.length >= 2);
  for (const c of cs) {
    const P = firstcar.placesFor(w, c.poi), st = w.map.pois[c.poi];
    assert.ok(P.lot && P.alley, `${c.name}: a lot and an alley`);
    const { p: a } = toQuestion(w, c.poi);
    answer(w, a, 'work');
    assert.match(buyAt(w, a, P.lot.poi, 'starter'), /You bought/, `${c.name}: bought`);
    run(w, 0.6); assert.equal(a.profile.ftue.step, 2, `${c.name}: work, step 2`);
    const { p: b } = toQuestion(w, c.poi);
    answer(w, b, 'hustle');
    const v = steal(w, b);
    assert.ok(Math.hypot(v.x - P.alley.x, v.y - P.alley.y) < 3000, `${c.name}: the car by its alley`);
    run(w, 0.6); assert.equal(b.profile.ftue.step, 2, `${c.name}: hustle, step 2`); assert.equal(b.wanted, 0);
    const { p: o } = toQuestion(w, c.poi);
    answer(w, o, 'outdoors');
    if (o.profile.ftue.st === 'goal') { assert.match(buyAt(w, o, P.lot.poi, 'rustpickup'), /You bought/); run(w, 0.6); assert.equal(o.profile.ftue.step, 2, `${c.name}: outdoors, step 2`); }
    const { p: r } = toQuestion(w, c.poi);
    answer(w, r, 'roam');
    assert.equal(r.profile.ftue.how, 'roam');
    console.log(`# ${c.name}: lot ${P.lot.name} ${Math.round(Math.hypot(P.lot.x - st.x, P.lot.y - st.y))} px, alley ${P.alley.name} ${Math.round(Math.hypot(P.alley.x - st.x, P.alley.y - st.y))} px`);
  }
});

test('fifty new players at the default station inside a minute: each a car by their path, no two on one space', () => {
  const w = makeWorld();
  const st = firstcar.defaultArrival(w), P = firstcar.placesFor(w, st.poi), cars = [];
  for (let i = 0; i < 50; i++) {
    const { p, prof } = toQuestion(w);
    assert.equal(prof.ftue.stn, st.poi);
    if (i % 2) { answer(w, p, 'hustle'); cars.push(steal(w, p)); vehicles.ejectPed(w, p.ped, true); }
    else { answer(w, p, 'work'); assert.match(buyAt(w, p, P.lot.poi, i % 4 ? 'starter' : 'rustpickup'), /You bought/); cars.push(w.get(p.activeVehicle)); }
    run(w, 0.6);   // (fifty in 30 s)
  }
  assert.equal(new Set(cars.map((v) => v.id)).size, 50, 'fifty cars');
  assert.ok(cars.every((v) => !v.removed), 'none taken away by the next one');
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) assert.ok(Math.hypot(cars[i].x - cars[j].x, cars[i].y - cars[j].y) >= 40, `cars ${i} and ${j} on one space`);
  const far = Math.max(...cars.map((v) => Math.hypot(v.x - w.map.pois[st.poi].x, v.y - w.map.pois[st.poi].y)));
  console.log(`# ${st.name}: 50 cars, the furthest ${Math.round(far)} px from the station`);
});

test('the cash once, ever; a replay with a car of your own out goes straight to the drive', () => {
  const w = makeWorld();
  const { p, prof } = toQuestion(w);
  answer(w, p, 'work');
  buyAt(w, p, lotOf(w, p).poi, 'starter');
  ftue.handle(w, p, { a: 'skip' });
  assert.equal(prof.ftue.st, 'done');
  const c0 = prof.cash;
  ftue.handle(w, p, { a: 'replay' });
  ftue.handle(w, p, { a: 'arrived' });
  answer(w, p, 'work');
  assert.equal(prof.cash, c0, 'no second helping');
  assert.equal(prof.ftue.step, 2, 'your car is out: straight to the drive');
  ftue.handle(w, p, { a: 'skip' }); ftue.handle(w, p, { a: 'replay' }); ftue.handle(w, p, { a: 'arrived' });
  answer(w, p, 'hustle');
  assert.equal(prof.cash, c0, 'nor the hustle\'s on a replay');
  // a skipped hustle takes its waiting car away
  const { p: q } = toQuestion(w);
  answer(w, q, 'hustle');
  const v = firstcar.markOf(w, q);
  ftue.handle(w, q, { a: 'skip' });
  assert.ok(v.removed, 'the car left for you, gone');
  void STAR_HEAT; void K;
});
