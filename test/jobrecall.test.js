// A job's vehicle goes back (the owner, 2026-10-23: "Canceling a job should make you have to give up the vehicle like a
// helicopter so that you can't just take a job to steal a helicopter then cancel it and have a helicopter"): server
// jobs.js recall. Cancelled at the wheel on the ground: set down beside it a moment later, the vehicle collected a few
// seconds after; in the air: kept until it's down on the ground, never anyone dropped mid-air; nobody aboard: collected,
// its cargo left on the ground; issued again for a new job before then: kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { RECALL } from '../shared/rules.js';
import { vehicleWord, VEHICLES } from '../shared/vehicles.js';

const phone = await import('../server/systems/phone.js');
const jobs = await import('../server/systems/jobs.js');

const w = makeWorld();
run(w, 0.2);
function seat(p, v) { const ped = p.ped; v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; ped.x = v.x; ped.y = v.y; w.place(ped); p.lastVehicle = v.id; }
function onJob(id) {
  const { p, prof } = joinPlayer(w);
  const r = phone.handle(w, p, { a: 'take', id });
  assert.equal(r.err, null, `${id}: signed on (${r.err})`);
  return { p, prof, v: w.get(p.job.truck) };
}

test('cancelled at the wheel of the cab: set down beside it, and the cab goes back', () => {
  const { p, v } = onJob('cab');
  seat(p, v);
  v.vx = 300; v.vy = 0;
  phone.handle(w, p, { a: 'cancel' });
  assert.ok(!p.job && v.recall, 'the job over, the cab recalled');
  run(w, 1);
  assert.equal(p.ped.vehId, v.id, 'a moment to pull over');
  run(w, RECALL.outS + 0.5);
  assert.equal(p.ped.vehId, 0, 'set down');
  assert.ok(Math.hypot(p.ped.x - v.x, p.ped.y - v.y) < 200, 'beside it');
  assert.ok(!v.removed, 'not gone the moment you\'re out');
  run(w, RECALL.goneS + 0.5);
  assert.ok(v.removed, 'collected');
});

test('a helicopter on a cancelled charter: nobody dropped from the sky - it goes back once it\'s down', () => {
  const { p, v } = onJob('charter');
  assert.equal(v.def.air, 'heli');
  seat(p, v);
  v.alt = 300; v.spool = 1;
  const said = [], n0 = w.notify.bind(w);
  w.notify = (q, t, tone) => { if (q === p) said.push(t); return n0(q, t, tone); };
  phone.handle(w, p, { a: 'cancel' });
  w.notify = n0;
  assert.ok(said.some((t) => /helicopter back/.test(t) && /Set it down/.test(t)), `told to land (${said.join(' | ')})`);
  for (let k = 0; k < 4; k++) { v.alt = 300; v.vx = 0; v.vy = 0; run(w, 5); }
  assert.equal(p.ped.vehId, v.id, 'still aboard up in the air');
  assert.ok(!v.removed, 'not taken from under you');
  v.alt = 0; v.vx = 0; v.vy = 0; v.vz = 0; v.spool = 0;
  run(w, 0.5);
  assert.equal(p.ped.vehId, 0, 'down on the ground: set down beside it');
  run(w, RECALL.goneS + 0.5);
  assert.ok(v.removed, 'the helicopter collected');
});

test('nobody aboard: the truck is collected and its cargo left on the ground; issued again for a new job, it\'s kept', () => {
  const { p } = joinPlayer(w);
  const wh = w.map.pois.find((q) => q.kind === 'warehouse');
  jobs.startCourier(w, p, wh, { pay: 300, limit: 900, tier: 1 });
  const v = w.get(p.job.truck), crate = w.get(p.job.crates[0]);
  crate.state = 'loaded'; crate.parent = v.id; crate.slot = 0; v.cargo[0] = crate.id;
  phone.handle(w, p, { a: 'cancel' });
  run(w, RECALL.goneS + 1);
  assert.ok(v.removed, 'collected');
  assert.ok(!crate.removed && crate.state === 'ground', 'the crate left on the ground');
  // taken on again before it's gone: the same truck, kept
  jobs.startCourier(w, p, wh, { pay: 300, limit: 900, tier: 1 });
  const v2 = w.get(p.job.truck);
  phone.handle(w, p, { a: 'cancel' });
  assert.ok(v2.recall);
  jobs.startCourier(w, p, wh, { pay: 300, limit: 900, tier: 1 });
  assert.equal(p.job.truck, v2.id, 'the recalled truck issued again');
  assert.ok(!v2.recall, 'not on its way back any more');
  run(w, RECALL.goneS + 2);
  assert.ok(!v2.removed, 'kept for the new job');
  phone.handle(w, p, { a: 'cancel' });
});

test('a job\'s vehicle is named for what it is (not "your truck" for a helicopter)', () => {
  assert.equal(vehicleWord(VEHICLES.rescueheli), 'helicopter');
  assert.equal(vehicleWord(VEHICLES.heli), 'helicopter');
  assert.equal(vehicleWord(VEHICLES.duster), 'plane');
  assert.equal(vehicleWord(VEHICLES.rescueboat), 'boat');
  assert.equal(vehicleWord(VEHICLES.ambulance), 'ambulance');
  assert.equal(vehicleWord(VEHICLES.taxi), 'cab');
  assert.equal(vehicleWord(VEHICLES.flatbed), 'truck');
  assert.equal(vehicleWord(VEHICLES.firetruck), 'fire engine');
  const { p, v } = onJob('charter');
  const t = phone.jobTarget(w, p);
  assert.equal(t.veh[2], v.def.i, 'the job\'s mark carries the model: the plate over it says YOUR HELICOPTER');
  phone.handle(w, p, { a: 'cancel' });
});
