// Careers and ranks (docs/PROGRESSION.md; server/systems/careers.js, shared/rules.js CAREERS): the rank math, the old
// police ranks kept, the unlocks' gating hooks, crime against the badge, clean money, the rank-up's call and title card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { CAREERS, CAREER_KEYS, POLICE_RANKS, HOT_FENCE_CUT, MORTGAGE } from '../shared/rules.js';
import * as careers from '../server/systems/careers.js';
import * as law from '../server/systems/law.js';
import * as mortgage from '../server/systems/mortgage.js';

// the HUD's notes sent (net.js: in the events message)
const toasts = (conn) => conn.sent.map((m) => (typeof m === 'string' && m.startsWith('{"t":"ev"') ? JSON.parse(m) : m)).filter((m) => m && m.t === 'ev').flatMap((m) => m.l).filter((e) => e.e === 'toast');
const done = (prof) => { prof.ftue = { st: 'done', tips: 0, m: {} }; return prof; };

test('three careers of 8 ranks each, named as the spec, thresholds climbing from 0', () => {
  const names = {
    crime: ['Corner Kid', 'Hustler', 'Booster', 'Enforcer', 'Lieutenant', 'Captain', 'Underboss', 'Kingpin'],
    police: ['Recruit', 'Officer', 'Corporal', 'Sergeant', 'Detective', 'Lieutenant', 'Captain', 'Chief'],
    business: ['Vendor', 'Shopkeeper', 'Owner', 'Proprietor', 'Landlord', 'Investor', 'Mogul', 'Tycoon'],
  };
  assert.deepEqual(CAREER_KEYS, ['crime', 'police', 'business']);
  for (const c of CAREER_KEYS) {
    const R = CAREERS[c].ranks;
    assert.deepEqual(R.map((r) => r.name), names[c]);
    assert.equal(R[0].xp, 0);
    for (let i = 1; i < R.length; i++) assert.ok(R[i].xp > R[i - 1].xp, `${c} ${R[i].name} above ${R[i - 1].name}`);
    // rank from XP: each threshold is its rank, one below is the rank under it
    for (let i = 0; i < R.length; i++) { assert.equal(careers.rankOfXp(c, R[i].xp), i); if (i) assert.equal(careers.rankOfXp(c, R[i].xp - 1), i - 1); }
    assert.equal(careers.rankOfXp(c, 1e9), 7);
  }
  assert.deepEqual(POLICE_RANKS.map((r) => r.name), names.police, 'law.js reads the police ladder');
});

test('the XP each career reads: criminal EXP, police points, business XP; rankInfo for the app', () => {
  const prof = { criminalExp: 160, policePts: 45, careers: { biz: 70 } };
  assert.equal(careers.careerRank(prof, 'crime'), 2);
  assert.equal(careers.careerRank(prof, 'police'), 1);
  assert.equal(careers.careerRank(prof, 'business'), 1);
  const I = careers.rankInfo(prof, 'crime');
  assert.equal(I.title, 'Booster'); assert.equal(I.lo, 150); assert.equal(I.hi, 400); assert.equal(I.next.name, 'Enforcer');
  assert.ok(I.next.unlocks.length && I.have.length >= 1);
  assert.equal(careers.rankInfo({ criminalExp: 9999 }, 'crime').next, null, 'the top rank: no next');
  assert.equal(careers.contactOf('crime', 0), 'Rosa Vance'); assert.equal(careers.contactOf('crime', 6), '"Deacon" Marsh');
  assert.equal(careers.contactOf('police', 1), 'Sgt. Dana Okafor'); assert.equal(careers.contactOf('police', 5), 'Captain Luis Reyes');
  assert.equal(careers.contactOf('business', 2), 'Mae Holloway'); assert.equal(careers.contactOf('business', 7), 'Victor Lin');
});

test('the old police ranks are the first ones of the new ladder: nobody migrated loses standing', () => {
  for (let i = 0; i < careers.LEGACY_POLICE.length; i++) {
    const L = careers.LEGACY_POLICE[i];
    for (const pts of [L.pts, L.pts + 1, (careers.LEGACY_POLICE[i + 1] || { pts: L.pts + 300 }).pts - 1]) {
      const prof = { policePts: pts };
      careers.migrate(prof);
      const r = careers.careerRank(prof, 'police');
      assert.ok(r >= careers.LEGACY_TO[i], `${L.name} at ${pts} pts -> ${careers.rankName('police', r)}`);
      assert.ok(prof.policePts >= pts, 'no points taken');
      assert.equal(careers.uniformRank(prof), Math.min(5, careers.LEGACY_TO[i]), 'the same uniform as before');
      assert.equal(prof.careers.seen.police, r, 'standing they had: no rank-up moment for it');
    }
  }
  // the first five old ranks are the new ladder's first five
  assert.deepEqual(careers.LEGACY_TO.slice(0, 5), [0, 1, 2, 3, 4]);
  // once: a second run changes nothing
  const prof = { policePts: 300 }; careers.migrate(prof); const snap = JSON.stringify(prof);
  assert.equal(careers.migrate(prof), false); assert.equal(JSON.stringify(prof), snap);
  // property owned before careers: counted toward business once
  const rich = { homes: [3], deeds: { 3: 250000 }, biz: { x: { t: 'shop', paid: 50000 } } };
  careers.migrate(rich);
  assert.equal(rich.careers.biz, Math.floor(250000 * CAREERS.business.propPer) + Math.floor(50000 * CAREERS.business.propPer));
  assert.equal(careers.careerRank(rich, 'business'), careers.rankOfXp('business', rich.careers.biz));
});

test('an old profile joins with its police rank, a careers record and no rank-up call for what it had', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w, done({ policePts: 500, criminalExp: 60 }));
  assert.ok(prof.careers && prof.careers.pv);
  assert.equal(law.policeRank(prof), 4);
  assert.equal(POLICE_RANKS[law.policeRank(prof)].name, 'Detective');
  run(w, 1.2);
  assert.ok(!conn.sent.some((m) => m && m.t === 'ftue' && m.a === 'rank'), 'no moment for standing already held');
  void p;
});

test('a rank-up is a moment: the contact calls, a title card with the unlock', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w, done({}));
  run(w, 1.2);
  prof.criminalExp = 55;   // (Hustler)
  run(w, 1.2);
  const card = conn.sent.find((m) => m && m.t === 'ftue' && m.a === 'rank');
  assert.ok(card, 'the title card');
  assert.equal(card.title, 'HUSTLER'); assert.match(card.sub, /fence/i);
  assert.ok(toasts(conn).some((t) => /Rosa Vance/.test(t.text)), 'Rosa Vance calls');
  assert.equal(prof.careers.calls[0].who, 'Rosa Vance');
  assert.equal(prof.careers.seen.crime, 1);
});

test('the gating hooks: hasUnlock, unlockValue - fence cut, loans, patrol pay, police vehicles', () => {
  const low = { criminalExp: 0, policePts: 0, careers: { biz: 0 } };
  const mid = { criminalExp: 450, policePts: 300, careers: { biz: 600 } };
  const top = { criminalExp: 9999, policePts: 9999, careers: { biz: 9999 } };
  assert.equal(careers.hasUnlock(low, 'fenceCut'), false);
  assert.equal(careers.unlockValue(mid, 'fenceCut'), 0.06);
  assert.equal(careers.unlockValue(top, 'fenceCut'), 0.1);
  assert.equal(careers.hasUnlock(top, 'kingpin'), false, 'a coming unlock is not unlocked');
  assert.ok(Math.abs(careers.fenceCut({ profile: top }, HOT_FENCE_CUT) - (HOT_FENCE_CUT - 0.1)) < 1e-9);
  assert.equal(careers.loanDeposit(low, MORTGAGE.deposit), MORTGAGE.deposit);
  assert.equal(careers.loanDeposit(mid, MORTGAGE.deposit), 0.18);
  assert.equal(careers.loanDeposit(top, MORTGAGE.deposit), 0.12);
  assert.equal(careers.loanMax(mid, MORTGAGE.max), MORTGAGE.max + 1);
  assert.equal(careers.loanMax(top, MORTGAGE.max), MORTGAGE.max + 2);
  const h = { price: 100000 };
  assert.ok(mortgage.terms(h, top).deposit < mortgage.terms(h, low).deposit, 'a Tycoon puts down less');
  assert.equal(careers.patrolPay({ profile: top }, 100), 125);
  // police vehicles by rank, for officers on duty
  assert.match(careers.vehicleRefusal({ badge: true, profile: low }, 'policeheli'), /Captain/);
  assert.equal(careers.vehicleRefusal({ badge: true, profile: top }, 'policeheli'), null);
  assert.equal(careers.vehicleRefusal({ badge: true, profile: low }, 'police'), null, 'a cruiser: every rank');
  assert.equal(careers.vehicleRefusal({ badge: false, profile: low }, 'policeheli'), null, 'off duty: theft, as it always was');
});

test('crime against the badge: a cop who commits a crime loses police XP; a fresh 3-star record locks duty', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, done({ policePts: 300, samaritan: 100 }));
  const before = prof.policePts;
  careers.onCrime(w, p, 'theft', law.CRIMES.theft);
  assert.equal(prof.policePts, before - Math.round(law.CRIMES.theft.heat * CAREERS.police.crimeLoss));
  p.badge = true;
  const b2 = prof.policePts;
  careers.onCrime(w, p, 'assault', law.CRIMES.assault);
  assert.equal(prof.policePts, b2 - Math.round(law.CRIMES.assault.heat * CAREERS.police.dutyLoss), 'on duty: more');
  p.badge = false;
  prof.peakWanted = 3; prof.peakWantedAt = Date.now();
  assert.match(careers.dutyLock(p), /too fresh/);
  assert.match(law.goOnDuty(w, p), /too fresh/);
  prof.peakWantedAt = Date.now() - (CAREERS.police.lockMin + 1) * 60e3;
  assert.equal(careers.dutyLock(p), null);
  prof.peakWanted = 2; prof.peakWantedAt = Date.now();
  assert.equal(careers.dutyLock(p), null, 'two stars: no lock');
});

test('clean money is business XP; crime money and other sources are not', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { ftue: { st: 'test', tips: 0, m: {} } });   // (no goals counting: they'd pay XP too)
  careers.onMoney(w, p, 'taxijob', 1000);
  assert.equal(prof.careers.biz, Math.floor(1000 * CAREERS.business.cleanPer));
  careers.onMoney(w, p, 'robbery', 5000); careers.onMoney(w, p, 'shop:fence', 5000); careers.onMoney(w, p, 'dev', 5000);
  assert.equal(prof.careers.biz, Math.floor(1000 * CAREERS.business.cleanPer), 'no XP for crime or the debug menu');
  careers.onMoney(w, p, 'shop:fishmarket', 500);
  assert.equal(prof.careers.biz, Math.floor(1500 * CAREERS.business.cleanPer));
  careers.dirty(p, 800);
  careers.onMoney(w, p, 'jobs', 800);   // (a crate fenced at the Exchange: paid under 'jobs', but crime money)
  assert.equal(prof.careers.biz, Math.floor(1500 * CAREERS.business.cleanPer));
});

test('the counters feed the careers: Samaritan points on duty are police XP; a job ended with pay is a shift', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, done({ samaritan: 30 }));
  const seen = [];
  careers.onNote((world, q, ev, d) => { if (q === p) seen.push([ev, d]); });
  run(w, 1.2);
  p.badge = true; prof.samaritan += 10;
  run(w, 1.2);
  assert.equal(prof.policePts, 10 * CAREERS.police.samPer);
  assert.ok(seen.some(([e, d]) => e === 'sam' && d.n === 10));
  assert.ok(seen.some(([e, d]) => e === 'xp:police' && d.n === 10));
  p.badge = false;
  p.job = { type: 'odd', text: 'x' };   // (a job no system runs: the forklift's own would end it)
  run(w, 1.2);
  p.job = null; prof.bank += 300;
  run(w, 1.2);
  assert.ok(seen.some(([e, d]) => e === 'shift' && d.job === 'odd'), 'a shift');
  assert.ok(careers.tried(p, 'odd'));
});
