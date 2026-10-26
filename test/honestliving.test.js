// Jobs and the honest living (the owner, 2026-10-11): the job's truck always there and marked, a garage won't keep it,
// the bonus for bringing it back, the Act prompt saying what getting in would be, Safety mode asking first, the crime
// table's felonies, and no world car parked on a home's lot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { WORK_TRUCK, WORK_TRUCK_RETURN, SAFETY_CONFIRM_S } from '../shared/rules.js';
import * as jobs from '../server/systems/jobs.js';
import * as phone from '../server/systems/phone.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as homes from '../server/systems/homes.js';
import * as law from '../server/systems/law.js';
import * as players from '../server/systems/players.js';
import { spawnNpc } from '../server/systems/npc.js';

const told = (p, re) => p.toasts.some((t) => re.test(t.text));
const pickups = (w) => w.map.pois.filter((q) => ['warehouse', 'delivery', 'convenience', 'gasstation'].includes(q.kind));
const destFor = (w, from) => w.map.pois.find((q) => q.kind === 'delivery' && q !== from && Math.hypot(q.x - from.x, q.y - from.y) > 1500);
const beside = (w, ped, v) => teleport(w, ped, v.x - Math.sin(v.a) * (v.def.W / 2 + 18), v.y + Math.cos(v.a) * (v.def.W / 2 + 18));

test('every courier job comes with its flatbed: issued, kept while the job is on, marked until you are in it', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const list = pickups(w);
  assert.ok(list.length > 20, `pickups (${list.length})`);
  let n = 0;
  for (const poi of list.filter((q, i) => i % Math.ceil(list.length / 60) === 0)) {
    const dest = destFor(w, poi);
    jobs.startCourier(w, p, poi, { dest, pay: 300, limit: 900, tier: 1 });
    const v = w.get(p.job.truck);
    const pad = poi.cargoPad || { x: poi.x + 18, y: poi.y + 14 };
    assert.ok(v && v.model === 'flatbed', `${poi.label}: a flatbed`);
    assert.ok(v.issuedTo === p.pid && v.workTruck && !v.despawnable, `${poi.label}: issued to you, kept`);
    assert.ok(Math.hypot(v.x - pad.x, v.y - pad.y) <= WORK_TRUCK.searchR + 1, `${poi.label}: near the pickup`);
    const t = phone.jobTarget(w, p);
    assert.deepEqual(t.veh, [Math.round(v.x), Math.round(v.y), v.def.i], 'the truck is marked (its model with it: the plate names it)');
    assert.equal(t.stage, 'pickup');
    assert.deepEqual(t.dest, [Math.round(dest.x), Math.round(dest.y)], 'and where the cargo goes after');
    jobs.failJob(w, p, 'test');
    assert.ok(v.recall, 'a job given up: the company takes its truck back (jobs.js recall)');
    w.remove(v);
    n++;
  }
  assert.ok(n >= 20, `checked ${n}`);
});

test('a free flatbed already at the pickup is issued to you; the truck is not tidied away while you are across town; in it, it is no longer marked', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const wh = w.map.pois.find((q) => q.kind === 'warehouse');
  const pad = wh.cargoPad || { x: wh.x + 18, y: wh.y + 14 };
  const old = w.spawnVehicle('flatbed', pad.x + 120, pad.y, 0, { parked: true });
  teleport(w, p.ped, wh.x + 6000, wh.y);
  jobs.startCourier(w, p, wh, { dest: destFor(w, wh), pay: 300, limit: 900, tier: 1 });
  assert.equal(p.job.truck, old.id, 'the one waiting there, issued to you');
  assert.equal([...w.entities.values()].filter((e) => e.kind === K.VEH && e.workTruck).length, 1, 'no second one');
  run(w, 3);
  assert.ok(w.get(old.id) && !old.removed, 'still there when you get there');
  beside(w, p.ped, old);
  assert.match(vehicles.enterLabel(w, p, old), /issued to you/);
  assert.ok(vehicles.playerEnter(w, p.ped), 'in (no Safety question: it is yours)');
  assert.equal(p.heat, 0, 'not theft');
  assert.equal(phone.jobTarget(w, p).veh, null, 'in it: no ring, no arrow');
});

test('a garage will not keep a work truck; bringing it back where it was issued once the job is done pays the bonus', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const wh = w.map.pois.find((q) => q.kind === 'warehouse');
  const dest = destFor(w, wh);
  jobs.startCourier(w, p, wh, { dest, pay: 300, limit: 900, tier: 1 });
  const v = w.get(p.job.truck), crate = w.get(p.job.crates[0]);
  // the garage: refused, and the prompt says so
  const h = w.map.homes.find((q) => q.garage && !q.gone && q.kind !== 'apartment');
  prof.homes.push(h.id); w.homeOwner.set(h.id, p.pid);
  teleport(w, v, h.garage.x, h.garage.y);
  beside(w, p.ped, v);
  assert.ok(vehicles.tryEnter(w, p.ped) && p.ped.vehId === v.id);
  const act = homes.vehicleInteraction(w, p);
  assert.match(act.label, /won't keep it/);
  assert.equal(homes.storeVehicle(w, p, v, h), 'work truck');
  assert.ok(!v.removed && prof.vehicles.length === 0, 'not stored');
  assert.ok(told(p, /belongs to the company/));
  vehicles.exitVehicle(w, p.ped);
  // the job done: the crate delivered
  p.ped.carrying = crate.id; crate.state = 'carried'; crate.parent = p.ped.id;
  teleport(w, p.ped, dest.x, dest.y);
  const dz = jobs.deliveryZoneFor(w, p, crate);
  assert.ok(dz, 'at the drop-off');
  dz.run();
  assert.equal(p.job, null, 'job done');
  const t = phone.jobTarget(w, p);
  assert.equal(t.stage, 'return');
  assert.deepEqual([t.x, t.y], [v.returnTo.x, v.returnTo.y], 'the tracker points back where it was issued');
  assert.ok(t.veh, 'and at the truck');
  // driving it back
  teleport(w, v, v.returnTo.x + 900, v.returnTo.y);
  beside(w, p.ped, v);
  assert.ok(vehicles.tryEnter(w, p.ped));
  assert.equal(jobs.truckInteraction(w, p), null, 'not back yet');
  teleport(w, v, v.returnTo.x + 30, v.returnTo.y);
  const ret = jobs.truckInteraction(w, p);
  assert.match(ret.label, new RegExp(`\\+\\$${WORK_TRUCK_RETURN} bonus`));
  const cash = prof.cash;
  ret.run();
  assert.equal(prof.cash, cash + WORK_TRUCK_RETURN, 'the bonus');
  assert.ok(v.removed && !p.ped.vehId, 'handed in, you are out');
  assert.equal(phone.jobTarget(w, p), null);
});

test('the Act prompt says what getting in is: your car, your work truck, your rental, vehicle theft, carjacking', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const x = p.ped.x + 400, y = p.ped.y;
  const mk = (model, o = {}) => Object.assign(w.spawnVehicle(model, x, y, 0, { npcOwned: true }), o);
  const L = (v) => vehicles.enterLabel(w, p, v);
  assert.match(L(mk('sedan', { owner: p.pid, npcOwned: false })), /^Get in your Sedan$/);
  assert.match(L(mk('sedan', { rentedBy: p.pid, npcOwned: false })), /^Get in your rental Sedan$/);
  assert.match(L(mk('flatbed', { issuedTo: p.pid, workTruck: true, npcOwned: false })), /issued to you/);
  assert.match(L(mk('sedan')), /^Steal the Sedan - Vehicle theft$/);
  assert.match(L(mk('police')), /Stealing a police vehicle \(felony\)/);
  assert.match(L(mk('flatbed', { issuedTo: 'someone-else', workTruck: true, npcOwned: false })), /Vehicle theft/, 'someone else\'s company truck');
  const car = mk('sedan');
  const drv = spawnNpc(w, 'casual', x, y, 'driver');
  car.seats[0] = drv.id; drv.vehId = car.id; drv.seat = 0;
  assert.match(L(car), /^Pull the driver out of the Sedan - Carjacking$/, 'stopped: carjacking, no felony');
  car.vx = 400;
  assert.match(L(car), /Violent carjacking \(felony\)/, 'moving: they get hurt - a felony');
  // and the prompt itself (players.findInteraction) is that label
  const own = mk('sedan', { owner: p.pid, npcOwned: false });
  teleport(w, own, p.ped.x + 900, p.ped.y);
  beside(w, p.ped, own);
  const act = players.findInteraction(w, p);
  if (act && act.key === 'F') assert.equal(act.label, 'Get in your Sedan');
});

test('Safety mode: on for new characters; the first press of a crime only warns, naming it; again within a few seconds does it', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  assert.equal(prof.safety, true, 'on for a new character');
  const v = w.spawnVehicle('sedan', p.ped.x + 300, p.ped.y, 0, {});
  beside(w, p.ped, v);
  assert.equal(vehicles.playerEnter(w, p.ped), false, 'first press: a question');
  assert.ok(!p.ped.vehId && told(p, /^That's vehicle theft - press again to do it anyway$/));
  assert.equal(p.toasts.find((t) => /^That's vehicle theft/.test(t.text)).tone, 'safety', 'its own tone: the page shows no note for it - the prompt and the button marked for the second press (hud.js safetyNudge; UI-5)');
  run(w, SAFETY_CONFIRM_S + 1);
  assert.equal(vehicles.playerEnter(w, p.ped), false, 'too long after: asked again');
  // the F key goes through it too (players.applyInput)
  const press = (bits) => { p.inputQ.push({ seq: (p.ack || 0) + 1, bits, mx: 0, my: 0, aim: 0 }); w.step(); };
  press(IN.VEHICLE); press(0);
  assert.equal(p.ped.vehId, v.id, 'pressed again in time: in (and it is theft)');
  assert.ok(v.stolenBy.has(p.pid));
  // switched off: no question
  vehicles.exitVehicle(w, p.ped);
  const v2 = w.spawnVehicle('sedan', p.ped.x + 600, p.ped.y, 0, {});
  beside(w, p.ped, v2);
  prof.safety = false;
  assert.ok(vehicles.playerEnter(w, p.ped) && p.ped.vehId === v2.id, 'Safety mode off: straight in');
  // the other crimes known before they happen: someone else's cargo
  vehicles.exitVehicle(w, p.ped);
  prof.safety = true;
  const c = w.spawnCrate(1, p.ped.x + 20, p.ped.y, { owner: 'someone-else' });
  teleport(w, p.ped, c.x - 16, c.y);
  const act = players.findInteraction(w, p);
  assert.equal(act.crime, 'cargoTheft');
  assert.match(act.label, /Cargo theft/);
});

test('crime table: taking a parked car is theft (no felony); carjacking is a felony only when the driver is hurt or it is a police car; a punch at an officer is no felony', () => {
  const C = law.CRIMES;
  assert.ok(!C.theft.felony && !C.bikeTheft.felony, 'vehicle theft: no felony');
  assert.ok(!C.carjack.felony, 'carjacking someone stopped, unhurt: no felony');
  assert.ok(C.carjackHurt.felony && C.copCarjack.felony && C.policeTheft.felony, 'hurt, or a police car: felonies');
  assert.ok(!C.copPunch.felony && C.copAssault.felony, 'fists on an officer: no felony; a weapon: still one');
  for (const k of ['murder', 'copMurder', 'vehKill', 'robbery', 'trainRobbery', 'escape', 'poaching']) assert.ok(C[k].felony, `${k}: still a felony`);
  // a carjacking at speed goes on the record when it's seen
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const car = w.spawnVehicle('police', p.ped.x + 300, p.ped.y, 0, {});
  const drv = spawnNpc(w, 'casual', car.x, car.y, 'driver');
  car.seats[0] = drv.id; drv.vehId = car.id; drv.seat = 0;
  assert.equal(vehicles.entryInfo(w, p, car).crime, 'copCarjack');
  void prof;
});

test('no world car is parked on a home\'s lot, driveway or in its garage (the owner\'s own only)', () => {
  const w = makeWorld({ npcBudget: 400 });
  const lots = homes.homeLotSpots(w.map);
  assert.ok(lots.size > 50, `spots on home lots (${lots.size})`);
  for (const i of lots) assert.ok(w.map.parking[i].drive, 'only the painted driveway spots');
  const { p } = joinPlayer(w);
  // by the homes with the most of them
  const sp = w.map.parking[[...lots][0]];
  teleport(w, p.ped, sp.x, sp.y + 200);
  p.teleportAt = w.time;
  run(w, 1);
  assert.ok(w.parked && w.parked.size > 0, 'cars parked round about');
  for (const i of w.parked.keys()) assert.ok(!lots.has(i), `spot ${i}: on a home lot`);
  for (const i of lots) {
    const q = w.map.parking[i];
    if (Math.hypot(q.x - p.ped.x, q.y - p.ped.y) > 1100) continue;
    assert.ok(!w.query(q.x, q.y, 30, K.VEH).some((v) => v.parked), `a parked car on a home's lot at ${Math.round(q.x)},${Math.round(q.y)}`);
  }
});

test('a job truck whose driver has left the game is let go: the company collects it', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const wh = w.map.pois.find((q) => q.kind === 'warehouse');
  jobs.startCourier(w, p, wh, { dest: destFor(w, wh), pay: 300, limit: 900, tier: 1 });
  const v = w.get(p.job.truck);
  assert.ok(!v.despawnable);
  players.leave(w, p);
  for (let i = 0; i < 40 && w.players.has(p.pid); i++) run(w, 10);   // (nothing after them: the body waits AWAY_SECONDS - players.js safeToIdle)
  assert.ok(!w.players.has(p.pid), 'gone');
  run(w, 10);
  assert.ok(v.despawnable || v.removed, 'no longer kept');
});
