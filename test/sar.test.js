// Search and rescue pilot (server/systems/sar.js, H59): signing on issues a rescue helicopter (yours - no theft); a call
// gives a search circle, not the spot; close in and they wave, a flare goes up; land for the hurt and the lost; the harness
// for someone on rough ground or in the water (too high it can't reach); the hand-over on a hospital's roof pad and the
// pay; a hard landing costs; a patient can die on the way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { IN } from '../shared/input.js';
import { VEHICLES } from '../shared/vehicles.js';
import { DM } from '../shared/dance.js';
import { SAR } from '../shared/rules.js';
import { airfields, FLY, floorAt } from '../shared/flight.js';
const sar = await import('../server/systems/sar.js');
const phone = await import('../server/systems/phone.js');
const players = await import('../server/systems/players.js');

const w = makeWorld();
run(w, 0.2);
const pads = airfields(w.map).pads.filter((q) => q.kind === 'hospital');
const yard = pads.find((q) => !q.roof), roof = pads.find((q) => q.roof);
const S = sar.sitesOf(w.map);

let seq = 0;
const send = (p, bits, secs = 0.05) => { for (let t = 0; t < secs - 1e-6; t += 0.05) { p.inputQ.push({ seq: ++seq, bits, mx: 0, my: 0, aim: 0 }); w.step(); } };
// a pilot on a shift, at the controls of their rescue helicopter, flying at alt over (x, y)
function onShift() {
  const { p, prof } = joinPlayer(w);
  p.ped.x = yard.x + 30; p.ped.y = yard.y + 30; w.place(p.ped);
  const err = phone.handle(w, p, { a: 'take', id: 'sar' });
  assert.equal(err.err, null, 'signed on');
  const v = w.get(p.job.truck);
  p.ped.x = v.x + 30; p.ped.y = v.y; w.place(p.ped);
  send(p, IN.VEHICLE); send(p, 0);
  assert.equal(p.ped.vehId, v.id, 'in at the first press: it\'s yours (Safety mode doesn\'t ask)');
  return { p, prof, v };
}
const hover = (v, x, y, alt) => { v.x = x; v.y = y; v.alt = alt; v.vx = 0; v.vy = 0; v.vz = 0; v.spool = 1; w.place(v); };

test('signing on at a hospital\'s helipad (or from the phone) issues a rescue helicopter, marked like a work truck', () => {
  assert.equal(VEHICLES.rescueheli.i, 64, 'the next free aircraft index');
  assert.ok(yard && roof, 'a hospital has a yard pad and a roof pad');
  const { p } = joinPlayer(w);
  p.ped.x = yard.x + 20; p.ped.y = yard.y; w.place(p.ped);
  const act = players.findInteraction(w, p);
  assert.ok(act && /search & rescue/.test(act.label), `the pad's Act prompt (${act && act.label})`);
  assert.ok(phone.boardFor(w, p).jobs.some((j) => j.id === 'sar' && j.fly), 'on the phone\'s job list too');
  act.run();
  assert.equal(p.job.type, 'sar');
  const v = w.get(p.job.truck);
  assert.equal(v.def.id, 'rescueheli');
  assert.equal(v.issuedTo, p.pid, 'issued to you');
  assert.ok(v.workTruck && !v.despawnable, 'kept for the shift');
  const t = phone.jobTarget(w, p);
  assert.ok(t.veh, 'the ring and the arrows point at it');
  // the first call comes in after a few seconds
  run(w, SAR.firstS + 1);
  assert.ok(p.job.call, 'a call came in');
  const c = p.job.call, vic = w.get(c.vic);
  assert.ok(vic && vic.npc && vic.npc.sar === p.pid, 'someone out there');
  const t2 = phone.jobTarget(w, p);
  assert.ok(t2.area && t2.area[2] === SAR.circleR, 'a search circle');
  assert.ok(Math.hypot(t2.area[0] - vic.x, t2.area[1] - vic.y) <= SAR.circleR, 'they\'re inside it');
  assert.ok(!t2.flare && (t2.x !== Math.round(vic.x) || t2.y !== Math.round(vic.y)), 'the marker is the circle, not the spot');
  phone.handle(w, p, { a: 'cancel' });
  run(w, 0.2);
  assert.ok(!w.get(c.vic) || w.get(c.vic).removed, 'cancelled: the one out there is gone');
  assert.ok(v.despawnable, 'the helicopter goes back');
});

test('close in and they wave and a flare goes up; land and the hurt are helped aboard; the roof pad hands them over for the pay', () => {
  assert.ok(S.open.length > 20 && S.rough.length > 10 && S.water.length > 20, `places for calls (open ${S.open.length}, rough ${S.rough.length}, water ${S.water.length})`);
  const { p, prof, v } = onShift();
  const s = S.open[Math.floor(S.open.length / 3)];
  const c = sar.callAt(w, p, 'ground', s.x, s.y);
  const vic = w.get(c.vic);
  hover(v, s.x + 1500, s.y, 200);
  run(w, 0.5);
  assert.ok(!c.found, 'not yet: far off');
  hover(v, s.x + SAR.seeR - 120, s.y, 200);
  run(w, 0.3);
  assert.ok(c.found, 'spotted');
  assert.equal(vic.gt, 'dance'); assert.equal(vic.dm, DM.pump, 'waving (the arm up)');
  const t = phone.jobTarget(w, p);
  assert.ok(t.flare && !t.area, 'the flare, the circle gone');
  // land near them
  hover(v, s.x + 150, s.y, 0);
  run(w, SAR.boardS + 6);
  assert.ok(c.aboard, 'helped aboard');
  assert.equal(vic.vehId, v.id);
  // a hard landing costs
  v.landAt = w.time; v.landSink = FLY.HARD_SINK + 60;
  run(w, 0.1);
  assert.equal(c.hard, 1, 'a hard landing counted');
  // on the hospital's roof
  const cash = prof.cash;
  hover(v, roof.x, roof.y, roof.alt);
  assert.equal(floorAt(w.map, v.x, v.y), roof.alt, 'the roof is the floor there');
  run(w, 0.5);
  assert.equal(p.job.call, null, 'handed over');
  assert.ok(prof.cash > cash, `paid (+$${prof.cash - cash})`);
  assert.equal(p.job.lastPay.hard, 1);
  assert.ok(p.job.lastPay.roof, 'on the roof pad');
  const full = Math.round(((SAR.base + (c.far / 1000) * SAR.perKm) * (1 + SAR.fast)) / 5) * 5;
  assert.ok(prof.cash - cash < full, 'less than a quick, gentle rescue');
  assert.ok(!w.get(c.vic) || w.get(c.vic).removed, 'the patient is with the trauma team');
  phone.handle(w, p, { a: 'cancel' });
});

test('the harness: over someone on rough ground - too high it can\'t reach, drifting it can\'t hold, low and steady it winches them in', () => {
  const { p, v } = onShift();
  const s = S.rough[Math.floor(S.rough.length / 2)];
  const c = sar.callAt(w, p, 'rough', s.x, s.y);
  hover(v, s.x, s.y, 520);
  run(w, 0.3);
  assert.ok(c.found);
  send(p, IN.ACTION, 6);
  assert.ok(!c.hooked && c.cable <= SAR.hoist.maxLen, `too high: the cable runs out (${c.cable.toFixed(0)} px)`);
  send(p, 0, 4);
  assert.ok(c.cable < 1, 'let go: winched back up');
  hover(v, s.x + 400, s.y, 140);
  send(p, IN.ACTION, 3);
  assert.ok(!c.hooked && c.cable < 1, 'not over them: nothing paid out');
  hover(v, s.x + 20, s.y, 140);
  const t0 = w.time;
  for (let i = 0; i < 160 && !c.hooked; i++) { v.x = s.x + 20; v.y = s.y; v.vx = 0; v.vy = 0; send(p, IN.ACTION); }
  assert.ok(c.hooked, 'clipped on');
  assert.ok(w.time - t0 > 1, 'it took the cable a while to pay out');
  assert.ok(phone.jobTarget(w, p).hoist, 'the page draws the harness');
  for (let i = 0; i < 120 && !c.aboard; i++) send(p, IN.ACTION);
  assert.ok(c.aboard, 'winched in');
  phone.handle(w, p, { a: 'cancel' });
});

test('the harness in the water; a patient left too long dies on the way', () => {
  const { p, v } = onShift();
  const s = S.water[Math.floor(S.water.length / 4)];
  const c = sar.callAt(w, p, 'water', s.x, s.y);
  hover(v, s.x, s.y, 120);
  run(w, 0.3);
  assert.ok(c.found);
  for (let i = 0; i < 200 && !c.aboard; i++) { v.x = s.x; v.y = s.y; v.vx = 0; v.vy = 0; send(p, IN.ACTION); }
  assert.ok(c.aboard, 'pulled out of the water');
  const vic = c.vic;
  c.life = 1;
  run(w, 1.5);
  assert.equal(p.job.call, null, 'the call is over');
  assert.ok(!w.get(vic) || w.get(vic).removed, 'they didn\'t make it');
  assert.equal(p.job.lastPay, undefined, 'and nothing paid');
  phone.handle(w, p, { a: 'cancel' });
});

// ---- the charter pilot (server/systems/charter.js) ----------------------------------------------------------------------
const charter = await import('../server/systems/charter.js');
const { CHARTER } = await import('../shared/rules.js');

test('charter pilot: a customer waits at a helipad, an airfield, a mansion\'s lawn or an island; land, they board; land there for the fare and a tip for a smooth ride', () => {
  const L = charter.placesOf(w.map);
  assert.ok(L.some((q) => q.kind === 'pad') && L.some((q) => q.kind === 'lawn') && L.some((q) => q.kind === 'island'), `places: ${[...new Set(L.map((q) => q.kind))].join(', ')}`);
  const { p, prof } = joinPlayer(w);
  p.ped.x = yard.x + 30; p.ped.y = yard.y + 30; w.place(p.ped);
  assert.ok(phone.boardFor(w, p).jobs.some((j) => j.id === 'charter' && j.fly), 'on the phone\'s job list');
  assert.equal(phone.handle(w, p, { a: 'take', id: 'charter' }).err, null);
  const v = w.get(p.job.truck);
  assert.equal(v.def.id, 'heli'); assert.equal(v.issuedTo, p.pid, 'the company\'s helicopter, issued to you');
  p.ped.x = v.x + 30; p.ped.y = v.y; w.place(p.ped);
  send(p, IN.VEHICLE); send(p, 0);
  assert.equal(p.ped.vehId, v.id, 'in at the first press (yours)');
  run(w, CHARTER.firstS + 1);
  const t = p.job.trip;
  assert.ok(t && t.fare > CHARTER.base, `a booking: ${t && t.who}, ${t && t.a.name} -> ${t && t.b.name}, $${t && t.fare}`);
  assert.ok(Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) >= CHARTER.minTrip, 'somewhere far');
  assert.ok(phone.jobTarget(w, p).dest, 'the pickup marked, and where they\'re going');
  // land by them: they board
  const cust = w.get(t.cust);
  hover(v, cust.x + 160, cust.y, 0);
  run(w, CHARTER.boardS + 5);
  assert.ok(t.aboard && cust.vehId === v.id, 'aboard');
  // a smooth, quick flight: the fare and a tip
  const cash = prof.cash;
  hover(v, t.b.x, t.b.y, floorAt(w.map, t.b.x, t.b.y));
  run(w, 0.3);
  assert.equal(p.job.trip, null, 'they stepped out');
  assert.ok(p.job.lastPay.tip > 0, `a tip ($${p.job.lastPay.tip})`);
  assert.equal(prof.cash - cash, t.fare + p.job.lastPay.tip, 'the fare and the tip');
  // the next one: a hard landing on the way - no tip
  run(w, CHARTER.gapS + 1);
  const t2 = p.job.trip, c2 = w.get(t2.cust);
  hover(v, c2.x + 160, c2.y, 0);
  run(w, CHARTER.boardS + 5);
  assert.ok(t2.aboard);
  v.landAt = w.time; v.landSink = FLY.HARD_SINK + 80;
  run(w, 0.1);
  const cash2 = prof.cash;
  hover(v, t2.b.x, t2.b.y, floorAt(w.map, t2.b.x, t2.b.y));
  run(w, 0.3);
  assert.equal(p.job.lastPay.tip, 0, 'no tip after a hard landing');
  assert.equal(prof.cash - cash2, t2.fare, 'just the fare');
  phone.handle(w, p, { a: 'cancel' });
  run(w, 0.2);
  assert.ok(v.despawnable, 'the helicopter goes back');
});
