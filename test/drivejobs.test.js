// Driving for a living (H72): the taxi driver (server/systems/taxijob.js), the bus driver (busjob.js) and the tow truck
// driver (towjob.js). Each job taken (the phone, or Act at its place) issues its vehicle; a fare hailing is picked up,
// the meter runs, they're dropped at the kerb and pay the fare and a tip (crashes and the police cost the tip; scare them
// enough and they bail out without paying); the bus at its stops - the waiting passengers board and pay, the ones for
// a stop get off there, a stop on time pays; a car backed up to is hooked and towed to the impound, paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { CAB, BUSJOB, TOWJOB } from '../shared/rules.js';
import { STAR_HEAT } from '../shared/constants.js';

const cab = await import('../server/systems/taxijob.js');
const bus = await import('../server/systems/busjob.js');
const tow = await import('../server/systems/towjob.js');
const phone = await import('../server/systems/phone.js');
const { busLines } = await import('../server/systems/transit.js');
const { openNear } = await import('../server/systems/firefighter.js');
const law = await import('../server/systems/law.js');

const w = makeWorld();
run(w, 0.2);
const put = (e, x, y, a = e.a) => { e.x = x; e.y = y; e.a = a; e.vx = 0; e.vy = 0; e.av = 0; e.lz = 0; w.place(e); };
const steps = (n) => { for (let i = 0; i < n; i++) w.step(); };
function seat(p, v) { const ped = p.ped; if (ped.vehId) return; v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; ped.x = v.x; ped.y = v.y; w.place(ped); }
function onJob(id, at) {
  const { p, prof } = joinPlayer(w);
  if (at) put(p.ped, at.x, at.y);
  const r = phone.handle(w, p, { a: 'take', id });
  assert.equal(r.err, null, `${id}: signed on (${r.err})`);
  return { p, prof, v: w.get(p.job.truck) };
}
// a fare waiting by a place, going to one 3000-5000 px off
function aFare(p) {
  const L = w.map.pois.filter((q) => q.kind === 'convenience' || q.kind === 'delivery');
  for (const a of L) {
    const b = L.find((q) => { const d = Math.hypot(q.x - a.x, q.y - a.y); return d > 3000 && d < 5000; });
    if (!b) continue;
    const f = cab.fareAt(w, p, 'hail', a, { x: b.x, y: b.y, name: b.label });
    if (f) return f;
  }
  return null;
}
// drive the cab with its fare aboard to (x, y) in hops (the meter counts each), then stop there
function driveTo(v, x, y, hop = 300) {
  for (let i = 0; i < 400; i++) {
    const d = Math.hypot(x - v.x, y - v.y);
    if (d < 5) break;
    const k = Math.min(1, hop / d);
    put(v, v.x + (x - v.x) * k, v.y + (y - v.y) * k, Math.atan2(y - v.y, x - v.x));
    for (const s of v.seats) { const q = s && w.get(s); if (q) { q.x = v.x; q.y = v.y; w.place(q); } }
    w.step();
    v.vx = 0; v.vy = 0;
  }
}
function pickUp(p, v, f) {
  const q = w.get(f.cust);
  put(v, q.x + 80, q.y, 0);
  seat(p, v);
  for (let i = 0; i < 80 && !f.aboard; i++) { v.vx = 0; v.vy = 0; w.step(); }
  assert.ok(f.aboard, 'the fare got in');
  assert.equal(q.vehId, v.id, 'in the back of the cab');
}

test('taxi: on the phone\'s job list and at a rank; a cab is issued and marked', () => {
  const { p } = joinPlayer(w);
  const board = phone.handle(w, p, { a: 'board' });
  assert.ok(board.jobs.some((j) => j.id === 'cab' && j.kind === 'drive'), 'on the job list');
  const r = cab.ranksOf(w.map)[0];
  put(p.ped, r.x + 10, r.y + 10);
  const act = cab.interaction(w, p);
  assert.ok(act && /taxi/.test(act.label), 'Act at the rank offers it');
  act.run();
  assert.equal(p.job.type, 'cab');
  const v = w.get(p.job.truck);
  assert.equal(v.model, 'taxi', 'a taxi issued');
  assert.equal(v.issuedTo, p.pid);
  assert.ok(phone.jobTarget(w, p).veh, 'marked until you are in it');
  phone.handle(w, p, { a: 'cancel' });
});

test('taxi: a fare hails (arm up), gets in, the meter runs, dropped at the kerb - the fare and a tip for a smooth, quick ride', () => {
  const { p, prof, v } = onJob('cab');
  p.job.nextAt = 1e9;
  const f = aFare(p);
  assert.ok(f, 'a fare');
  const q = w.get(f.cust);
  assert.equal(q.pp, 'hail', 'an arm up for a cab');
  assert.equal(phone.jobTarget(w, p).stage, 'pickup', 'the fare marked');
  pickUp(p, v, f);
  assert.equal(phone.jobTarget(w, p).x, Math.round(f.to.x), 'then where they are going');
  const cash = prof.cash;
  driveTo(v, (v.x + f.to.x) / 2, (v.y + f.to.y) / 2);
  assert.ok(f.meter > 1000, `the meter runs (${Math.round(f.meter)} px)`);
  run(w, 1.1);
  assert.match(p.job.text, /meter \$\d+/, 'the meter on the job tracker');
  driveTo(v, f.to.x + 60, f.to.y);
  steps(3);
  assert.equal(p.job.fare, null, 'dropped off');
  const lp = p.job.lastPay;
  assert.ok(lp && lp.fare >= CAB.flag + 2 * CAB.perKm, `paid by the distance ($${lp && lp.fare})`);
  assert.ok(lp.tip > 0, `a tip ($${lp.tip})`);
  assert.equal(prof.cash - cash, lp.fare + lp.tip);
  assert.ok(!q.vehId && !q.removed, 'out at the kerb');
  assert.equal(p.job.done, 1);
  phone.handle(w, p, { a: 'cancel' });
});

test('taxi: a crash costs part of the tip, the police after you all of it', () => {
  const { p, v } = onJob('cab');
  p.job.nextAt = 1e9;
  let f = aFare(p);
  pickUp(p, v, f);
  v.hardHitAt = w.time; v.hardHit = CAB.bump + 100;
  steps(2);
  assert.equal(f.crash, 1, 'the crash noticed');
  driveTo(v, f.to.x + 60, f.to.y);
  steps(3);
  const tip1 = p.job.lastPay.tip, full = Math.round((p.job.lastPay.fare * CAB.tip) / 5) * 5;
  assert.ok(tip1 > 0 && tip1 < full, `a smaller tip (${tip1} < ${full})`);
  f = aFare(p);
  pickUp(p, v, f);
  law.addHeat(w, p, STAR_HEAT[1] - (p.heat || 0) + 1, v.x, v.y);
  steps(2);
  assert.ok(f.cops > 0, 'the police after you noticed');
  driveTo(v, f.to.x + 60, f.to.y);
  steps(3);
  p.heat = 0; p.wanted = 0;
  assert.equal(p.job.lastPay.tip, 0, 'no tip with the police after you');
  assert.ok(p.job.lastPay.fare > 0, 'still the fare');
  phone.handle(w, p, { a: 'cancel' });
});

test('taxi: drive like a maniac and the fare bails out without paying', () => {
  const { p, prof, v } = onJob('cab');
  p.job.nextAt = 1e9;
  const f = aFare(p);
  pickUp(p, v, f);
  const q = w.get(f.cust), cash = prof.cash;
  for (let i = 0; i < CAB.bail; i++) { v.hardHitAt = w.time; v.hardHit = CAB.bump + 200; v.vx = 200; w.step(); }
  assert.ok(f.bail, 'they want out');
  assert.equal(q.vehId, v.id, 'not while it is going fast');
  v.vx = 0; v.vy = 0;
  steps(2);
  assert.equal(p.job.fare, null, 'they got out');
  assert.equal(prof.cash, cash, 'and paid nothing');
  phone.handle(w, p, { a: 'cancel' });
});

test('bus: a bus on the line, its passengers board at the stop and pay, the stop on time pays; they get off at theirs', () => {
  const L0 = busLines(w)[0], s0 = L0.stops[1];
  const { p, prof, v } = onJob('bus', { x: s0.sx, y: s0.sy });
  const j = p.job, L = busLines(w)[j.line];
  assert.equal(v.model, 'bus', 'a bus issued');
  assert.equal(v.paint, L.paint, 'in the line\'s livery');
  assert.ok(phone.handle(w, p, { a: 'board' }).job.type === 'bus');
  assert.ok(j.wait.length >= BUSJOB.wait[0], `people waiting at the stop (${j.wait.length})`);
  const waiting = j.wait.map((x) => x.id);
  seat(p, v);
  let served = 0, alighted = 0, cash = prof.cash;
  for (let n = 0; n < 4; n++) {
    const k = j.k, st = L.stops[k], due = j.due, n0 = j.wait.length, forHere = j.pax.filter((x) => x.to === k).map((x) => x.id);
    const at = bus.stopPose(w, L, k);
    put(v, at.x, at.y, at.a);
    for (const s of v.seats) { const q = s && w.get(s); if (q) { q.x = v.x; q.y = v.y; } }
    for (let i = 0; i < 400 && j.k === k && p.job === j; i++) { v.vx = 0; v.vy = 0; w.step(); }
    assert.notEqual(j.k, k, `stop ${st.name} served`);
    served++;
    for (const id of forHere) { const q = w.get(id); assert.ok(!q || q.vehId !== v.id, 'got off at their stop'); alighted++; }
    const gain = prof.cash - cash;
    assert.equal(gain, n0 * BUSJOB.perPax + (w.time - due <= BUSJOB.late + BUSJOB.dwellS + 20 ? BUSJOB.perStop : 0), `paid: the fares and the stop (${gain})`);
    cash = prof.cash;
    if (n === 0) assert.ok(waiting.every((id) => w.get(id) && w.get(id).vehId === v.id), 'the waiting passengers are aboard');
    j.due = w.time + 999;
  }
  assert.ok(alighted > 0, 'passengers got off at their stops');
  // late: nothing for the stop
  const st = L.stops[j.k];
  j.due = w.time - 200;
  const n0 = j.wait.length, c0 = prof.cash, k0 = j.k, at = bus.stopPose(w, L, k0);
  put(v, at.x, at.y, at.a);
  for (let i = 0; i < 400 && j.k === k0 && p.job === j; i++) { v.vx = 0; v.vy = 0; w.step(); }
  assert.equal(prof.cash - c0, n0 * BUSJOB.perPax, 'late: just the fares');
  assert.ok(served >= 4 && j.late >= 1);
  phone.handle(w, p, { a: 'cancel' });
  run(w, 1.2);
  assert.ok([...waiting].every((id) => { const q = w.get(id); return !q || !q.vehId; }), 'off shift: everyone off the bus');
});

test('tow truck: backed up to a broken-down car it is hooked, towed to the impound and paid', () => {
  const { p, prof, v: t } = onJob('towjob');
  assert.equal(t.model, 'towtruck', 'a tow truck issued');
  assert.ok(phone.handle(w, p, { a: 'board' }).jobs.some((j) => j.id === 'towjob'), 'on the job list');
  p.job.nextAt = 1e9;
  const yard = tow.yardFor(w, t.x, t.y);
  // a car stopped in a street well away from the impound
  const e = w.map.net.edges.find((q) => q.lvl === 0 && q.len > 600 && q.kind === 'st' && Math.hypot(q.pts[0].x - yard.x, q.pts[0].y - yard.y) > 2500);
  const a0 = Math.atan2(e.pts[1].y - e.pts[0].y, e.pts[1].x - e.pts[0].x), cx = e.pts[0].x + Math.cos(a0) * 200, cy = e.pts[0].y + Math.sin(a0) * 200;
  const car = w.spawnVehicle('sedan', cx, cy, a0, {});
  const c = tow.callAt(w, p, car);
  assert.ok(c, 'a call');
  assert.equal(phone.jobTarget(w, p).stage, 'pickup', 'the car marked');
  // pulled up ahead of it, the same way, then backed up until the tail touches its nose
  const off = car.def.L / 2 + t.def.L / 2 + 40;
  put(t, cx + Math.cos(a0) * off, cy + Math.sin(a0) * off, a0);
  seat(p, t);
  steps(10);
  assert.ok(!c.hooked && !c.hook, 'not touching: nothing');
  put(t, cx + Math.cos(a0) * (off - 36), cy + Math.sin(a0) * (off - 36), a0);
  for (let i = 0; i < 100 && !c.hooked; i++) { t.vx = 0; t.vy = 0; w.step(); }
  assert.ok(c.hooked, 'winched up');
  assert.equal(car.towedBy, t.id);
  assert.equal(car.towEnd, 1, 'by its nose');
  for (let i = 0; i < 30; i++) { t.vx = 0; t.vy = 0; w.step(); }   // (winched round onto the hook)
  // to the impound
  const spot = openNear(w.map, yard.x, yard.y + 120) || yard;
  const cash = prof.cash;
  for (let i = 0; i < 400 && p.job.call; i++) {
    const d = Math.hypot(spot.x - t.x, spot.y - t.y), k = Math.min(1, 300 / Math.max(1, d));
    put(t, t.x + (spot.x - t.x) * k, t.y + (spot.y - t.y) * k, Math.atan2(spot.y - t.y, spot.x - t.x));
    w.step(); t.vx = 0; t.vy = 0;
    if (i % 20 === 0 && p.job.call) assert.ok(Math.hypot(car.x - t.x, car.y - t.y) < car.def.L / 2 + t.def.L / 2 + 20, 'it rides on the hook');
  }
  assert.equal(p.job.call, null, 'delivered');
  assert.ok(car.removed || !w.get(car.id), 'in the impound');
  assert.ok(prof.cash - cash >= TOWJOB.pay, `paid ($${prof.cash - cash})`);
  assert.equal(p.job.done, 1);
  phone.handle(w, p, { a: 'cancel' });
});
