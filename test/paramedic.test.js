// The paramedic (H68, server/systems/paramedic.js): signing on at a hospital or from the phone issues an ambulance
// (its siren on H); a minor call treated on the spot (hold Act by them); a serious one stabilised, helped aboard when
// the ambulance pulls up alongside, handed over at a hospital (paid by the drive too) - or dead if nobody comes; a
// player down nearby is a call, and reviving them pays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { IN } from '../shared/input.js';
import { MEDIC } from '../shared/rules.js';

const pm = await import('../server/systems/paramedic.js');
const ff = await import('../server/systems/firefighter.js');
const phone = await import('../server/systems/phone.js');
const revive = await import('../server/systems/revive.js');
const combat = await import('../server/systems/combat.js');

const w = makeWorld();
run(w, 0.2);
const S = ff.sitesOf(w.map);
const hospitals = w.map.pois.filter((q) => q.kind === 'hospital');
let seq = 0;
const send = (p, bits, secs = 0.05) => { for (let t = 0; t < secs - 1e-6; t += 0.05) { p.inputQ.push({ seq: ++seq, bits, mx: 0, my: 0, aim: 0 }); w.step(); } };
const put = (e, x, y) => { e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.lz = 0; w.place(e); };
function onShift() {
  const { p, prof } = joinPlayer(w);
  put(p.ped, hospitals[0].x + 20, hospitals[0].y + 20);
  const r = phone.handle(w, p, { a: 'take', id: 'medic' });
  assert.equal(r.err, null, 'signed on');
  p.job.nextAt = 1e9;
  return { p, prof, v: w.get(p.job.truck) };
}

test('signing on at a hospital or from the phone issues an ambulance, marked; its siren works', () => {
  const { p } = joinPlayer(w);
  assert.ok(phone.handle(w, p, { a: 'board' }).jobs.some((j) => j.id === 'medic'), 'on the phone\'s job list');
  put(p.ped, hospitals[1].x + 10, hospitals[1].y + 10);
  const act = pm.interaction(w, p);
  assert.ok(act && /paramedic/.test(act.label), 'Act at the hospital offers it');
  act.run();
  const v = w.get(p.job.truck);
  assert.equal(p.job.type, 'medic');
  assert.equal(v.model, 'ambulance', 'an ambulance issued');
  assert.ok(phone.jobTarget(w, p).veh, 'marked');
  put(p.ped, v.x + 40, v.y);
  send(p, IN.VEHICLE); send(p, 0);
  assert.equal(p.ped.vehId, v.id, 'in at the first press');
  send(p, IN.HORN); send(p, 0);
  assert.ok(v.siren, 'H: the siren (traffic pulls over)');
  phone.handle(w, p, { a: 'cancel' });
});

test('a minor call: lying there hurt; hold Act by them and they\'re up and on their way - paid', () => {
  const { p, prof } = onShift();
  const c = pm.callAt(w, p, 'minor', S.shops[4]);
  const q = w.get(c.patient);
  assert.ok(q.downUntil > w.time + 100 && q.hp < q.maxHp, 'down and hurt');
  run(w, 2);
  assert.ok(!q.dead && q.downUntil > w.time, 'they stay down, waiting');
  put(p.ped, q.x + 30, q.y);
  const act = pm.interaction(w, p);
  assert.ok(act && /treat/.test(act.label), 'the Act prompt: treat them');
  const cash0 = prof.cash;
  send(p, IN.ACTION, MEDIC.treatS + 0.3); send(p, 0);
  assert.equal(p.job.call, null, 'treated: the call is done');
  assert.ok(prof.cash > cash0 + MEDIC.pay.minor * 0.9, `paid ($${prof.cash - cash0})`);
  run(w, 2);
  assert.ok(q.removed || q.downUntil <= w.time, 'up again');
  phone.handle(w, p, { a: 'cancel' });
});

test('a serious call: stabilised, aboard when the ambulance pulls up, handed over at a hospital; nobody comes and they die', () => {
  const { p, prof, v } = onShift();
  const c = pm.callAt(w, p, 'serious', S.shops[20]);
  const q = w.get(c.patient);
  put(p.ped, q.x + 30, q.y);
  send(p, IN.ACTION, MEDIC.treatS + 0.3); send(p, 0);
  assert.ok(c.treated && p.job.call === c, 'stable - not done yet');
  put(v, q.x + 90, q.y); run(w, 0.3);
  assert.ok(c.aboard && q.vehId === v.id, 'helped aboard the ambulance alongside');
  const t = phone.jobTarget(w, p);
  const h = hospitals.find((o) => Math.hypot(o.x - t.x, o.y - t.y) < 2);
  assert.ok(h, 'the tracker points to a hospital');
  const cash0 = prof.cash;
  put(v, h.x + 40, h.y + 40); run(w, 0.3);
  assert.equal(p.job.call, null, 'handed over');
  assert.ok(prof.cash - cash0 >= MEDIC.pay.serious, `paid with the drive ($${prof.cash - cash0})`);
  assert.ok(q.removed, 'taken in');
  // left alone
  const c2 = pm.callAt(w, p, 'serious', S.shops[30]);
  const q2 = w.get(c2.patient);
  run(w, MEDIC.lifeS.serious + 1);
  assert.ok(q2.dead || q2.removed, 'they died waiting');
  assert.equal(p.job.lastPay.pay, 0, 'unpaid');
  phone.handle(w, p, { a: 'cancel' });
});

test('a player down nearby is a call; getting them back on their feet pays', () => {
  const { p, prof } = onShift();
  const { p: hurt } = joinPlayer(w);
  put(hurt.ped, p.ped.x + 900, p.ped.y);
  combat.kill(w, hurt.ped, null, 'fall');
  assert.ok(revive.isDowned(hurt.ped), 'they\'re down');
  p.job.nextAt = w.time;
  run(w, 0.1);
  assert.equal(p.job.call && p.job.call.k, 'player', 'the call is for them');
  const cash0 = prof.cash;
  revive.revive(w, hurt.ped, { by: p.ped });
  run(w, 0.1);
  assert.equal(p.job.call, null, 'done');
  assert.ok(prof.cash > cash0, 'paid');
  phone.handle(w, p, { a: 'cancel' });
});
