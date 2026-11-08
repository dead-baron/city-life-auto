// Money sinks (docs/PROGRESSION.md "Money sinks", progression build item 6): property upkeep by the wall-clock day - billed
// across days, arrears, shabby, the final notice and repossession (never while you're inside; the furniture kept in
// storage) - vehicle insurance (a claim, the goodwill once, gone uninsured, held when the bank is short, the fee rising
// with recent wrecks, the tow), name colors and title plates on the nameplate (kept through a reset), the beta gift
// surviving a progress-epoch bump, and the fees by rank.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, store } from './helpers.js';
import { UPKEEP, INSURANCE, COSMETICS, GOALS, FEES, BAIL_PER_STAR, TOW_FEE } from '../shared/rules.js';
import { PIECE_IDS } from '../shared/lookcore.js';
import * as W from '../shared/wardrobe.js';
import { resetProfile, oldEpoch, PROGRESS_EPOCH } from '../server/store.js';
import { descriptor } from '../server/net.js';
import * as upkeep from '../server/systems/upkeep.js';
import * as insurance from '../server/systems/insurance.js';
import * as cosmetics from '../server/systems/cosmetics.js';
import * as homes from '../server/systems/homes.js';
import * as careers from '../server/systems/careers.js';
import * as vehicles from '../server/systems/vehicles.js';
import { payFrom } from '../server/systems/economy.js';

const DAY = 86400e3;
const at = (day, h = 3) => day * DAY + (GOALS.resetUtcH + h) * 3600e3;   // (h hours into that wall-clock day)
const D0 = 20500;
function owner(w, o = {}) {
  const { p, prof } = joinPlayer(w, { ftue: { st: 'done', tips: 0, m: {} }, cash: 0, bank: 0, ...o });
  const h = w.map.homes.find((q) => q && !q.gone && q.price >= 20000 && !w.homeOwner.has(q.id));
  homes.claim(w, p, h, h.price);
  return { p, prof, h };
}
function listen(w) {
  const log = [], notify = w.notify.bind(w);
  w.notify = (q, text, tone) => { log.push(text); return notify(q, text, tone); };
  return (re) => log.some((t) => re.test(t));
}

test('upkeep: billed by the wall-clock day from the bank, a day away too (at most backDays at once)', () => {
  const w = makeWorld();
  const { p, prof, h } = owner(w, { bank: 100000 });
  const daily = upkeep.homeDaily(h);
  assert.equal(daily, Math.max(UPKEEP.min, Math.min(UPKEEP.max, Math.round(h.price * UPKEEP.homeRate))));
  upkeep.check(w, p, at(D0));
  assert.equal(prof.bank, 100000, 'the first day seen: nothing yet');
  upkeep.check(w, p, at(D0, 10));
  assert.equal(prof.bank, 100000, 'the same day: nothing more');
  upkeep.check(w, p, at(D0 + 1));
  assert.equal(prof.bank, 100000 - daily, 'the next day: one day');
  upkeep.check(w, p, at(D0 + 4));
  assert.equal(prof.bank, 100000 - 4 * daily, 'three days away: three days');
  upkeep.check(w, p, at(D0 + 40));
  assert.equal(prof.bank, 100000 - (4 + UPKEEP.backDays) * daily, 'a long time away: at most backDays');
  assert.equal(upkeep.owed(prof), 0);
});

test('upkeep unpaid: arrears and texts, shabby, the final notice, repossessed after it - never while inside; furniture to storage', () => {
  const w = makeWorld();
  const heard = listen(w);
  const { p, prof, h } = owner(w);
  const daily = upkeep.homeDaily(h);
  prof.decor = { [h.id]: { plan: undefined, it: [{ k: 'sofa', tx: 1, ty: 1 }, { k: 'lamp', tx: 2, ty: 1 }] } };
  upkeep.check(w, p, at(D0));
  upkeep.check(w, p, at(D0 + 1));
  assert.equal(upkeep.owed(prof), daily, 'the bank was empty: owed');
  assert.ok(heard(/couldn't be paid/), 'a text says so');
  assert.equal(upkeep.shabby(prof, `h:${h.id}`), false);
  upkeep.check(w, p, at(D0 + UPKEEP.shabbyDays));
  assert.equal(upkeep.shabby(prof, `h:${h.id}`), true, 'shabby');
  assert.ok(heard(/looking shabby/));
  assert.match(homes.setEnterNote.fn(w, p, h), /shabby/, 'the line on going in');
  const row = upkeep.rowInfo(prof, `h:${h.id}`, daily);
  assert.equal(row.shab, 1); assert.equal(row.due, UPKEEP.shabbyDays * daily);
  upkeep.check(w, p, at(D0 + UPKEEP.repoDays - 1, 20));
  assert.ok(heard(/Final notice/), 'the final notice');
  // a week unpaid, but the final notice not old enough yet
  upkeep.check(w, p, at(D0 + UPKEEP.repoDays, 0));
  assert.equal(w.homeOwner.get(h.id), p.pid, 'still yours: the notice stands finalWarnH hours');
  // inside it: never taken from under you
  p.ped.hidden = true; p.ped.inside = h.id;
  upkeep.check(w, p, at(D0 + UPKEEP.repoDays, 20));
  assert.equal(w.homeOwner.get(h.id), p.pid, 'not while you are inside');
  p.ped.hidden = false; p.ped.inside = null;
  const owedNow = upkeep.owed(prof);
  upkeep.check(w, p, at(D0 + UPKEEP.repoDays, 21));
  assert.equal(w.homeOwner.has(h.id), false, 'repossessed');
  assert.ok(!(prof.homes || []).includes(h.id));
  assert.equal(prof.furn.sofa, 1); assert.equal(prof.furn.lamp, 1);
  assert.ok(!prof.decor[h.id], 'the furniture is in storage, to place in the next home');
  assert.equal(prof.bank, Math.round(h.price * UPKEEP.repoBack) - owedNow, 'the city sold it: repoBack of its price less what was owed');
  assert.ok(heard(/repossessed/));
  assert.equal(upkeep.owed(prof), 0);
});

test('upkeep: arrears paid from the bank as soon as it can, or all at once from the Homes app', () => {
  const w = makeWorld();
  const { p, prof, h } = owner(w);
  const daily = upkeep.homeDaily(h);
  upkeep.check(w, p, at(D0));
  upkeep.check(w, p, at(D0 + 2));
  assert.equal(upkeep.owed(prof), 2 * daily);
  prof.bank = 2 * daily + 5;
  upkeep.check(w, p, at(D0 + 2, 5));
  assert.equal(upkeep.owed(prof), 0, 'paid once the bank could');
  assert.equal(prof.bank, 5);
  upkeep.check(w, p, at(D0 + 3));
  assert.equal(upkeep.owed(prof), daily);
  prof.cash = daily;
  assert.equal(upkeep.payAll(w, p, payFrom), null);
  assert.equal(upkeep.owed(prof), 0); assert.equal(prof.cash, 0);
  assert.equal(upkeep.payAll(w, p, payFrom), 'Nothing owed.');
});

test('upkeep: a returning player is warned before anything is taken (a week away, then the final notice\'s hours)', () => {
  const w = makeWorld();
  const { p, prof, h } = owner(w);
  upkeep.check(w, p, at(D0));
  upkeep.check(w, p, at(D0 + 30));   // (back after a month: the bank empty)
  assert.equal(w.homeOwner.get(h.id), p.pid, 'not taken on coming back');
  assert.ok(prof.upkeep.due[`h:${h.id}`].fw, 'the final notice sent now');
  upkeep.check(w, p, at(D0 + 30) + (UPKEEP.finalWarnH + 1) * 3600e3);
  assert.equal(w.homeOwner.has(h.id), false, 'unpaid after the notice: repossessed');
});

function ownCar(w, p, model = 'sedan', extra = {}) {
  p.profile.vehicles.push({ model, paint: 0, ...extra });
  const i = p.profile.vehicles.length - 1;
  assert.equal(homes.spawnOwnedAt(w, p, i, { x: p.ped.x + 200, y: p.ped.y, a: 0 }, { keep: true }), null);
  return w.get(p.activeVehicle);
}

test('insurance: insured, a wreck comes back for a claim that rises with recent wrecks; held when the bank is short', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 5000, bank: 20000 });
  const v = ownCar(w, p);
  const ov = prof.vehicles[0];
  assert.equal(insurance.buy(w, p, 0, payFrom), null);
  assert.equal(ov.ins, 1);
  assert.equal(prof.cash + prof.bank, 25000 - insurance.premiumOf(ov));
  assert.equal(insurance.premiumOf(ov), Math.round(4000 * INSURANCE.premium / 10) * 10, 'the sedan: its list price x premium');
  const fee1 = insurance.claimFee(ov), bank0 = prof.bank;
  vehicles.explode(w, v, null);
  assert.equal(prof.vehicles.length, 1, 'insured: still yours');
  assert.equal(prof.bank, bank0 - fee1, 'the claim from the bank');
  assert.ok(insurance.claimFee(ov) > fee1, 'a recent wreck: the next claim costs more');
  assert.equal(insurance.claimFee(ov, Date.now() + (INSURANCE.recentDays + 1) * DAY), fee1, 'a week on: back to the base');
  // the bank short: held at the insurer's yard
  prof.bank = 0;
  const again = homes.spawnOwnedAt(w, p, 0, { x: p.ped.x + 300, y: p.ped.y, a: 0 }, { keep: true });
  assert.equal(again, null);
  vehicles.explode(w, w.get(p.activeVehicle), null);
  assert.ok(ov.hold > 0, 'held for its claim');
  assert.match(homes.spawnOwnedAt(w, p, 0, { x: p.ped.x, y: p.ped.y + 300, a: 0 }, { keep: true }), /insurer's yard/, 'can\'t be taken out');
  prof.cash = ov.hold;
  assert.equal(insurance.payHold(w, p, 0, payFrom), null);
  assert.equal(ov.hold, 0);
  assert.equal(homes.spawnOwnedAt(w, p, 0, { x: p.ped.x, y: p.ped.y + 300, a: 0 }, { keep: true }), null, 'out again');
});

test('insurance: uninsured, the dealer\'s goodwill once - then a wreck is gone', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0, bank: 50000 });
  const v = ownCar(w, p, 'compact');
  assert.equal(insurance.wrecked(w, v, 'wrecked'), 'grace', 'the first time: back for the claim');
  assert.equal(prof.vehicles.length, 1);
  assert.equal(prof.insGrace, 1);
  assert.equal(insurance.wrecked(w, v, 'wrecked'), null, 'one wreck, one claim');
  const v2 = ownCar(w, p, 'sports');
  assert.equal(prof.vehicles.length, 2);
  assert.equal(insurance.wrecked(w, v2, 'sunk'), 'gone');
  assert.equal(prof.vehicles.length, 1, 'uninsured: gone');
  assert.equal(prof.vehicles[0].model, 'compact', 'the right one went');
});

test('insurance: towed to the impound - insured for the tow fee, uninsured gone; horses and rentals aren\'t covered', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0, bank: 5000, insGrace: 1 });
  const v = ownCar(w, p, 'pickup');
  prof.vehicles[0].ins = 1;
  assert.equal(insurance.impounded(w, p, v, 'Midtown'), 'claim');
  assert.equal(prof.bank, 5000 - TOW_FEE);
  const v2 = ownCar(w, p, 'van');
  assert.equal(insurance.impounded(w, p, v2, 'Midtown'), 'gone');
  assert.deepEqual(prof.vehicles.map((o) => o.model), ['pickup']);
  assert.equal(insurance.insurable({ model: 'horse' }), false);
  assert.deepEqual(insurance.rows(prof).map((r) => [r.n, r.ins]), [['Pickup Truck', 1]]);
});

test('name colors and title plates: bought for cash or tokens, on the nameplate, kept through a progress reset', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 50000, bank: 0, goals: { tok: 1 } });
  const sky = COSMETICS.colors.find((c) => c.cash), tokPlate = COSMETICS.plates.find((q) => q.tok === 1), cashPlate = COSMETICS.plates.find((q) => q.cash);
  assert.equal(cosmetics.pick(w, p, 'c', sky.id, payFrom), null);
  assert.equal(prof.cash, 50000 - sky.cash);
  assert.equal(cosmetics.pick(w, p, 'p', tokPlate.id, payFrom), null);
  assert.equal(prof.goals.tok, 0, 'the token spent');
  assert.match(cosmetics.pick(w, p, 'c', COSMETICS.colors.find((c) => c.tok).id, payFrom), /token/, 'no tokens left');
  assert.deepEqual(cosmetics.plateOf(prof), { c: sky.hex, t: tokPlate.t });
  cosmetics.refresh(p);
  assert.deepEqual(descriptor(p.ped).np, { c: sky.hex, t: tokPlate.t }, 'on the ped\'s descriptor: everyone sees it');
  // a rank's title while you hold it
  assert.match(cosmetics.pick(w, p, 'p', 'r:crime:3', payFrom), /rank/);
  prof.criminalExp = 400;
  assert.equal(cosmetics.pick(w, p, 'p', 'r:crime:3', payFrom), null);
  assert.equal(cosmetics.plateOf(prof).t, 'Enforcer');
  assert.equal(cosmetics.pick(w, p, 'p', cashPlate.id, payFrom), null);
  // the wipe: progress gone, the cosmetics kept
  prof.epoch = PROGRESS_EPOCH - 1;
  assert.ok(oldEpoch(prof));
  resetProfile(prof);
  assert.equal(prof.criminalExp, 0);
  assert.deepEqual(cosmetics.plateOf(prof), { c: sky.hex, t: cashPlate.t }, 'the color and the bought plate kept');
  assert.equal(cosmetics.hasPlate(prof, tokPlate.id), true);
  assert.equal(cosmetics.hasPlate(prof, 'r:crime:3'), false, 'a rank\'s title goes with the rank');
});

test('a career\'s top rank: its title for good', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.criminalExp = 999999;
  w.step(); for (let i = 0; i < 25; i++) w.step();   // (cosmetics.update: the first look at this player)
  assert.ok(cosmetics.cosmOf(prof).tops.some((t) => t.c === 'crime'));
  prof.criminalExp = 0;
  assert.equal(cosmetics.hasPlate(prof, 'r:crime:7'), true, 'Kingpin kept');
  assert.equal(cosmetics.hasPlate(prof, 'r:crime:6'), false);
});

test('the beta gift: the Founding Citizen jacket and the gold Beta plate, once, surviving the progress-epoch bump', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  for (let i = 0; i < 25; i++) w.step();   // (given on the first session's first look: cosmetics.update)
  const jk = PIECE_IDS[COSMETICS.beta.jacket];
  assert.ok(jk, 'the jacket is a piece');
  assert.ok(prof.wardrobe.includes(jk), 'in the wardrobe');
  assert.equal(W.free(jk), false, 'a gift: nobody else owns it');
  assert.equal(W.sellerOf(jk), null, 'never sold');
  assert.deepEqual(cosmetics.plateOf(prof), { t: 'Beta', g: 1 }, 'the gold Beta plate, worn');
  assert.equal(cosmetics.grantBeta(w, p), false, 'once');
  prof.epoch = PROGRESS_EPOCH - 1;
  resetProfile(prof);
  assert.equal(prof.epoch, PROGRESS_EPOCH);
  assert.ok(prof.wardrobe.includes(jk), 'the jacket survives the wipe');
  assert.ok(prof.cosm.gifts.beta, 'the gift is on the account');
  assert.deepEqual(cosmetics.plateOf(prof), { t: 'Beta', g: 1 });
  assert.equal(cosmetics.grantBeta(w, { profile: prof }), false, 'not given twice');
  void store;
});

test('fees by rank: gentle, from the FEES table', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  assert.equal(careers.fee(p, BAIL_PER_STAR * 2), BAIL_PER_STAR * 2, 'rank 0: as ever');
  prof.criminalExp = 999999;
  assert.equal(careers.topRank(p), 7);
  assert.equal(careers.fee(p, 200), Math.round(200 * FEES.rank[7]));
  assert.ok(FEES.rank.every((k, i) => k >= 1 && k <= 1.5 && (i === 0 || k >= FEES.rank[i - 1])), 'conservative and rising');
});
