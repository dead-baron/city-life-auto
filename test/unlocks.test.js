// The career unlocks that were "coming" (docs/PROGRESSION.md "Careers and ranks"), made real on the systems there were:
// a crew of your own (crews.js: founding, the tag, the crew bank and its cut, upkeep, a season's reset), a hideout
// (hideout.js: one per player or crew, the stash, lying low), heist contracts (heistjobs.js), detective tracking and the
// station office (tracking.js, Reyes's case board), a second and third business, staff while you're away and the
// penthouse (biz.js, homes.js) - each gated by its rank, saved with the account, and its money flows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, store } from './helpers.js';
import { CAREERS, CAREER_KEYS, CREW, HIDEOUT, HEIST_JOB, HEIST, TRACK, BIZ_RANK, STAFF, PENTHOUSE } from '../shared/rules.js';
import { BIZ } from '../shared/rules-games.js';
import { DAY_LOOP_S } from '../shared/constants.js';
import * as careers from '../server/systems/careers.js';
import * as crews from '../server/systems/crews.js';
import * as cosmetics from '../server/systems/cosmetics.js';
import * as biz from '../server/systems/biz.js';
import * as hideout from '../server/systems/hideout.js';
import * as heist from '../server/systems/heist.js';
import * as heistjobs from '../server/systems/heistjobs.js';
import * as tracking from '../server/systems/tracking.js';
import * as contacts from '../server/systems/contacts.js';
import * as whatsnext from '../server/systems/whatsnext.js';
import * as homes from '../server/systems/homes.js';
import * as mortgage from '../server/systems/mortgage.js';
import * as economy from '../server/systems/economy.js';
import { dayKey } from '../server/systems/goals.js';

const xpAt = (c, k) => CAREERS[c].ranks.find((r) => (r.unlock || []).some((u) => u.k === k)).xp;
const below = (c, k) => xpAt(c, k) - 1;
const bizProf = (n) => ({ careers: { v: 1, main: null, seen: {}, biz: n, props: [], tried: {}, calls: [] } });
function world() { for (const q of store.all()) delete q.biz; return makeWorld(); }
const near = (w, list, x, y) => list.forEach((q, i) => teleport(w, q.p.ped, x + i * 30, y));

test('the "coming" unlocks are live: none of them listed as coming any more', () => {
  for (const k of ['crew', 'heists', 'hideout', 'tracking', 'office', 'second', 'staff', 'penthouse']) {
    const c = CAREER_KEYS.find((q) => CAREERS[q].ranks.some((r) => (r.unlock || []).some((u) => u.k === k)));
    const u = CAREERS[c].ranks.flatMap((r) => r.unlock || []).find((q) => q.k === k);
    assert.ok(!u.soon, `${k} is built`);
    const I = careers.rankInfo({ criminalExp: 9999, policePts: 9999, careers: { biz: 99999 } }, c);
    assert.ok(I.have.some((h) => h.name === u.name && !h.soon), `${k} shows unlocked in What's next`);
    assert.ok(careers.hasUnlock({ criminalExp: 9999, policePts: 9999, careers: { biz: 99999 } }, k), `${k}: hasUnlock`);
  }
});

test('a crew of your own: founded at the rank, its tag by every name, persistence, a crew of one', () => {
  const w = world();
  const A = joinPlayer(w, { criminalExp: below('crime', 'crew'), cash: 20000 }), B = joinPlayer(w);
  assert.match(crews.found(w, A.p, 'Night Owls'), /comes at Lieutenant/, 'below the rank: no');
  assert.equal(crews.panel(w, A.p).found.can, 0);
  A.prof.criminalExp = xpAt('crime', 'crew');
  assert.equal(crews.panel(w, A.p).found.can, 1);
  assert.match(crews.found(w, A.p, '!!'), /crew's name/, 'a name by the names\' rules');
  assert.equal(crews.found(w, A.p, 'Night Owls'), null);
  assert.equal(A.prof.cash, 20000 - CREW.foundCost, 'paid for');
  const c = crews.crewOf(A.p.pid);
  assert.deepEqual([c.f.name, c.f.tag, c.members.length], ['Night Owls', 'NO', 1], 'a crew of one to start');
  assert.equal(cosmetics.plateOf(A.prof).k, 'NO', 'the tag on the nameplate');
  const C = joinPlayer(w, { criminalExp: xpAt('crime', 'crew'), cash: 20000 });
  assert.match(crews.found(w, C.p, 'night owls'), /another crew's name/, 'one crew to a name');
  // asked in as ever: the tag by their name too
  near(w, [A, B], A.p.ped.x, A.p.ped.y);
  crews.invite(w, A.p, B.p);
  crews.accept(w, B.p);
  assert.ok(crews.mates(A.p, B.p));
  assert.equal(cosmetics.plateOf(B.prof).k, 'NO');
  B.p.npDirty = true; run(w, 1.1);
  assert.equal(B.p.np && B.p.np.k, 'NO', 'sent on the nameplate (cosmetics.js refresh)');
  // kept with the store; B leaves - a founded crew stands with one
  assert.ok(Object.values(store.kept.crews).some((q) => q.f && q.f.name === 'Night Owls'), 'kept');
  crews.leave(w, B.p);
  assert.ok(crews.crewOf(A.p.pid) && !crews.crewOf(B.p.pid));
  assert.equal((cosmetics.plateOf(B.prof) || {}).k, undefined, 'the tag off');
});

test('the crew bank: the members\' cut of a job done together, putting in, paying out; upkeep and the name lapsing; a season\'s end', () => {
  const w = world();
  const A = joinPlayer(w, { criminalExp: xpAt('crime', 'crew'), cash: 50000, bank: 0 }), B = joinPlayer(w, { cash: 1000, bank: 0 });
  crews.found(w, A.p, 'Dock Rats');
  near(w, [A, B], A.p.ped.x, A.p.ped.y);
  crews.invite(w, A.p, B.p); crews.accept(w, B.p);
  const c = crews.crewOf(A.p.pid);
  // a shift done with a crewmate near: the cut into the bank
  B.prof.cash = 1000;
  careers.note(w, B.p, 'shift', { job: 'taxi', n: 1000 });
  assert.equal(c.bank, Math.round(1000 * CREW.cut), 'the members\' cut');
  assert.equal(B.prof.cash, 1000 - Math.round(1000 * CREW.cut));
  // alone (the crewmate far away): no cut
  teleport(w, A.p.ped, A.p.ped.x + CREW.togetherPx * 3, A.p.ped.y);
  careers.note(w, B.p, 'shift', { job: 'taxi', n: 1000 });
  assert.equal(c.bank, Math.round(1000 * CREW.cut), 'not done together');
  // put in, paid out evenly (the lead only)
  assert.equal(crews.put(w, A.p), null);
  assert.equal(c.bank, Math.round(1000 * CREW.cut) + CREW.put);
  assert.match(crews.payout(w, B.p), /Only the crew's lead/);
  const each = Math.floor(c.bank / 2), bb = B.prof.bank;
  assert.equal(crews.payout(w, A.p), null);
  assert.equal(B.prof.bank - bb, each, 'into each member\'s bank');
  // upkeep: a day from the bank; short, arrears; CREW.lapseDays unpaid in a row, the name lapses
  c.bank = CREW.upkeep; const d0 = c.up.d, ms = (d) => (d + 0.5) * 86400e3 + 6 * 3600e3;
  crews.bill(w, c, ms(d0 + 1));
  assert.equal(c.bank, 0, 'a day paid');
  assert.equal(c.up.owed, 0);
  crews.bill(w, c, ms(d0 + 3));
  assert.equal(c.up.owed, CREW.upkeep * 2, 'two days owed');
  assert.ok(c.f, 'still named');
  crews.bill(w, c, ms(d0 + 3 + CREW.lapseDays));
  assert.ok(!c.f && crews.crewOf(A.p.pid) === c, 'the name lapsed; still a crew of two');
  // a season's end: the holdings go, the members stay
  crews.found(w, A.p, 'Dock Rats');
  c.bank = 777;
  crews.seasonReset();
  assert.equal(c.bank, 0);
  assert.ok(c.f && c.members.length === 2, 'the name and the members kept');
  assert.equal(c.up.d, dayKey());
});

test('a hideout: one per player or crew, at the rank; its stash of crates and cars; lying low cools the heat', () => {
  const w = world();
  const A = joinPlayer(w, { criminalExp: below('crime', 'hideout'), bank: 1e6 }), B = joinPlayer(w, { criminalExp: xpAt('crime', 'hideout'), bank: 1e6 });
  const [s, s2] = biz.sites(w).filter((q) => q.t === 'hideout');
  assert.match(biz.buy(w, A.p, s), /A hideout comes at Underboss/, 'below the rank: no');
  A.prof.criminalExp = xpAt('crime', 'hideout');
  assert.equal(biz.buy(w, A.p, s), null);
  assert.match(biz.buy(w, A.p, s2), /You have a hideout already/, 'one each');
  near(w, [A, B], A.p.ped.x, A.p.ped.y);
  crews.invite(w, A.p, B.p); crews.accept(w, B.p);
  assert.match(biz.buy(w, B.p, s2), /Your crew has a hideout already/, 'one a crew');
  assert.equal(hideout.hideoutFor(w, B.p).s.id, s.id, 'the crewmate\'s is yours too');
  // the stash: a crate carried in by a crewmate at the office, taken out by the owner
  teleport(w, B.p.ped, s.x, s.y);
  const crate = w.spawnCrate(3, s.x, s.y, { value: 900, contraband: true });
  crate.state = 'carried'; crate.parent = B.p.ped.id; B.p.ped.carrying = crate.id;
  const menu = biz.menuOf(w, B.p, s);
  assert.ok(menu.opts.some((o) => o.id === 'hdo:p' && !o.dis), 'a crewmate puts a crate away');
  biz.onMenu(w, B.p, -100 - s.i, 'hdo:p');
  const S = A.prof.biz[s.id].stash;
  assert.equal(S.crates.length, 1, 'in the stash, on the owner\'s entry');
  assert.equal(B.p.ped.carrying, 0);
  teleport(w, A.p.ped, s.x, s.y);
  biz.onMenu(w, A.p, -100 - s.i, 'hdo:t:0');
  assert.ok(A.p.ped.carrying && w.get(A.p.ped.carrying).value === 900, 'out again, carried');
  // a car: driven up to the door, into the stash; out again, parked
  const v = w.spawnVehicle('sedan', s.x + 40, s.y, 0, {});
  v.vx = 0; v.vy = 0;
  A.p.ped.carrying = 0;
  assert.equal(hideout.intoStash(w, A.p, v), null);
  assert.equal(S.cars.length, 1);
  assert.ok(v.removed || !w.get(v.id), 'the car in');
  biz.onMenu(w, A.p, -100 - s.i, 'hdo:c:0');
  assert.equal(S.cars.length, 0, 'out again');
  // lying low: in the yard, wanted, the heat cools HIDEOUT.coolX as fast
  const P = B.p;
  teleport(w, P.ped, s.x + 20, s.y + 20);
  P.heat = 300; P.wanted = 3; P.seenAt = w.time - 60;
  assert.equal(hideout.lieLow(w, P), HIDEOUT.coolX);
  const h0 = P.heat; run(w, 1); const fast = h0 - P.heat;
  P.lieLowX = 0; crews.leave(w, P);
  assert.equal(hideout.lieLow(w, P), 0, 'out of the crew: not your hideout');
  P.heat = 300; P.wanted = 3; P.seenAt = w.time - 60;
  const h1 = P.heat; run(w, 1); const slow = h1 - P.heat;
  assert.ok(fast > slow * (HIDEOUT.coolX - 0.5), `faster lying low (${fast.toFixed(2)} vs ${slow.toFixed(2)})`);
});

test('heist contracts: a What\'s next card at the rank; accepted, a drill fronted; paid when the vault opens with you there; lapsed', () => {
  const w = world();
  let now = Date.now();
  heistjobs.setClock(() => now);
  try {
    const A = joinPlayer(w, { criminalExp: below('crime', 'heists'), cash: 0, inventory: {}, ftue: { st: 'done' } });
    const ids = () => whatsnext.candidates(w, A.p).map((c) => c.id);
    assert.ok(!ids().some((id) => id.startsWith('heists:')), 'below the rank: no contracts');
    A.prof.criminalExp = xpAt('crime', 'heists');
    const card = whatsnext.candidates(w, A.p).find((c) => c.id.startsWith('heists:offer:'));
    assert.ok(card && card.btn.k === 'accept', 'offered');
    assert.ok(!ids().some((id) => id.startsWith('career:heist:')), 'the plain vault tip gives way to it');
    assert.equal(card.accept(w, A.p), null);
    const c = A.prof.heists.c;
    assert.equal(A.prof.inventory.drill, 1, 'a drill fronted');
    assert.equal(c.front, HEIST.drillPrice);
    assert.ok(whatsnext.candidates(w, A.p).some((q) => q.id === `heists:on:${c.bid}`), 'under way: its card');
    // the vault, drilled through with the holder there
    const b = w.map.buildings[c.bid], V0 = heist.stateOf(w, c.bid);
    assert.equal(V0, null);
    teleport(w, A.p.ped, c.x, c.y + 20);
    assert.ok(heist.start(w, A.p, b));
    const V = heist.stateOf(w, c.bid);
    V.jamAt = []; V.work = HEIST.drillS;
    const cash0 = A.prof.cash, xp0 = A.prof.criminalExp;
    run(w, 0.1);
    assert.equal(V.st, 'open');
    assert.equal(A.prof.heists.c, null, 'done');
    assert.equal(A.prof.cash - cash0, c.pay - c.front, 'the pay, less the fronted drill');
    assert.ok(A.prof.criminalExp - xp0 >= HEIST_JOB.xp, 'and the XP');
    assert.ok(A.prof.heists.next > now, 'the next one later');
    // lapsed
    now = A.prof.heists.next + 1;
    const card2 = whatsnext.candidates(w, A.p).find((q) => q.id.startsWith('heists:offer:'));
    assert.equal(card2.accept(w, A.p), null);
    now += HEIST_JOB.limitMin * 60e3 + 1000;
    heistjobs.tick(w, A.p, now);
    assert.equal(A.prof.heists.c, null, 'lapsed');
    assert.equal(A.prof.heists.n, 1);
  } finally { heistjobs.setClock(() => Date.now()); }
});

test('detective tracking: on duty at the rank, one suspect, rate-limited fixes on that cop\'s map only; the case board\'s Track; a station office', () => {
  const w = world();
  const cop = joinPlayer(w, { policePts: below('police', 'tracking'), ftue: { st: 'done' } }), other = joinPlayer(w, { policePts: xpAt('police', 'tracking') });
  const crook = joinPlayer(w), crook2 = joinPlayer(w);
  for (const q of [crook, crook2]) { q.p.wanted = 3; q.p.heat = 200; }
  cop.p.badge = true; other.p.badge = true;
  assert.match(tracking.start(w, cop.p, crook.p.pid), /comes at Detective/, 'below the rank');
  cop.prof.policePts = xpAt('police', 'tracking');
  cop.p.badge = false;
  assert.match(tracking.start(w, cop.p, crook.p.pid), /On duty only/);
  cop.p.badge = true;
  // the case board's card: Track
  const card = contacts.cardsFor(w, cop.p).find((q) => q.id.startsWith('contact:office:'));
  assert.ok(card && card.btn.k === 'accept' && card.btn.label === 'Track', 'a detective\'s case board card tracks');
  const top = contacts.caseBoard(w, cop.p)[0].p;
  assert.equal(card.accept(w, cop.p), null);
  assert.ok(tracking.on(cop.p, top.pid));
  const snap = (v) => Math.floor(v / TRACK.fuzzPx) * TRACK.fuzzPx + TRACK.fuzzPx / 2;
  const blip = () => tracking.radar(w, cop.p, []).find((r) => r.k === 'track');
  assert.equal(blip().x, snap(top.ped.x), 'a fix, to the fuzz');
  assert.ok(!tracking.radar(w, other.p, []).some((r) => r.k === 'track'), 'only on that cop\'s map');
  // the rate limits: another suspect not straight away; the fix not refreshed before everyS
  const second = top === crook.p ? crook2.p : crook.p;
  assert.match(tracking.start(w, cop.p, second.pid), /a new suspect in/);
  teleport(w, top.ped, top.ped.x + 900, top.ped.y);
  run(w, TRACK.everyS - 2);
  assert.notEqual(blip().x, snap(top.ped.x), 'not refreshed yet');
  run(w, 2.5);
  assert.equal(blip().x, snap(top.ped.x), 'refreshed after everyS');
  w.time += TRACK.startGapS;
  assert.equal(tracking.start(w, cop.p, second.pid), null, 'after the gap, another');
  // over when they're not wanted
  second.wanted = 0; second.heat = 0;
  tracking.step(w, cop.p);
  assert.equal(cop.p.trk, null, 'not wanted: off');
  // the station office at the rank: Reyes's precinct, a quicker fix
  assert.equal(tracking.everyS(cop.p), TRACK.everyS);
  assert.equal(tracking.office(w, cop.p), false, 'not yet');
  cop.prof.policePts = xpAt('police', 'office');
  assert.equal(tracking.office(w, cop.p), true);
  assert.deepEqual(cop.prof.contacts.office, { at: 'reyes', rank: 1 });
  assert.equal(tracking.everyS(cop.p), TRACK.officeS);
});

test('businesses: one before the rank, three from it; staff at the rank earn a share while you\'re away (from the timestamps), up to the till', () => {
  const w = world();
  const A = joinPlayer(w, { bank: 5e6, ...bizProf(below('business', 'second')) });
  const [f1, f2] = biz.sites(w).filter((s) => s.t === 'farm'), club = biz.sites(w).find((s) => s.t === 'club');
  assert.equal(BIZ_RANK.first, 1);
  assert.equal(biz.buy(w, A.p, f1), null);
  assert.match(biz.buy(w, A.p, club), /A second business comes at Landlord/, 'one before the rank');
  A.prof.careers.biz = xpAt('business', 'second');
  assert.equal(biz.buy(w, A.p, club), null, 'a second at it');
  assert.equal(biz.buy(w, A.p, f2), null, 'and a third');
  // staff: at their rank, for a share of its price
  teleport(w, A.p.ped, club.x, club.y);
  assert.ok(biz.menuOf(w, A.p, club).opts.find((o) => o.id === 'staff').dis, 'not yet');
  A.prof.careers.biz = xpAt('business', 'staff');
  const row = biz.menuOf(w, A.p, club).opts.find((o) => o.id === 'staff');
  assert.ok(!row.dis && row.price === biz.staffCost(club));
  const bank0 = A.prof.bank + A.prof.cash;
  biz.onMenu(w, A.p, -100 - club.i, 'staff');
  assert.equal(bank0 - A.prof.bank - A.prof.cash, biz.staffCost(club), 'paid for');
  const e = A.prof.biz[club.id];
  assert.ok(e.staff && e.staff.at > 0);
  // away three in-game days: the share of each day's takings into the till
  e.till = 0; e.stock = 10;
  const t0 = e.staff.at, got = biz.awayPay(w, A.prof, t0 + 3 * DAY_LOOP_S * 1000 + 5000);
  assert.equal(got.length, 1);
  assert.ok(e.till > 0 && e.stock < 10, 'takings in, stock used');
  const day = e.till / 3;
  assert.ok(Math.abs(day - Math.round(BIZ.club.night * 0.5)) < BIZ.club.night * 2 * STAFF.share, `a share a day (${day})`);
  assert.equal(e.staff.at, t0 + 3 * DAY_LOOP_S * 1000, 'the clock moved on by the days counted');
  // a long time away: no more than the till holds
  biz.awayPay(w, A.prof, t0 + 400 * DAY_LOOP_S * 1000);
  const till1 = e.till;
  biz.awayPay(w, A.prof, t0 + 800 * DAY_LOOP_S * 1000);
  assert.equal(e.till, till1, 'full: the staff add no more');
  // no staff: nothing while away
  delete A.prof.biz[f1.id].staff;
  A.prof.biz[f1.id].till = 0;
  biz.awayPay(w, A.prof, Date.now() + 9 * DAY_LOOP_S * 1000);
  assert.equal(A.prof.biz[f1.id].till, 0);
  // back in town: the first second says what they took; the clock kept at now while you're here
  e.till = 0; e.stock = 10; e.staff.at = Date.now() - 2 * DAY_LOOP_S * 1000 - 1000;
  A.p.staffSeen = 0; A.conn.sent.length = 0;
  w.tick = 30; w.step();
  assert.ok(e.till > 0, 'credited on the way back');
  assert.ok(Date.now() - e.staff.at < DAY_LOOP_S * 1000);
});

test('the penthouse: a Tycoon pays less for one - cash or a mortgage; others the full price', () => {
  const w = world();
  const pent = [...w.units.values()].find((u) => u.plan === 'penthouse' && !w.homeOwner.has(u.id));
  assert.ok(pent, 'a penthouse in town');
  const A = joinPlayer(w, { bank: 5e6, cash: 0, ...bizProf(below('business', 'penthouse')) });
  assert.equal(homes.priceFor(A.prof, pent), pent.price);
  A.prof.careers.biz = xpAt('business', 'penthouse');
  const cut = Math.round((pent.price * (1 - PENTHOUSE.off)) / 500) * 500;
  assert.equal(homes.priceFor(A.prof, pent), cut);
  assert.ok(mortgage.terms(pent, A.prof).deposit < mortgage.terms(pent, null).deposit, 'a smaller deposit too');
  const flat = [...w.units.values()].find((u) => u.plan !== 'penthouse');
  assert.equal(homes.priceFor(A.prof, flat), flat.price, 'only a penthouse');
  const b0 = A.prof.bank;
  assert.equal(homes.buy(w, A.p, pent, economy.payFrom), null);
  assert.equal(b0 - A.prof.bank, cut, 'charged the Tycoon\'s price');
  assert.equal(A.prof.deeds[pent.id], cut, 'the deed says what was paid');
  homes.sell(w, A.p, pent);
});

test('saved with the account: a founded crew, a hideout\'s stash, a contract, staff - old saves load', () => {
  const w = world();
  const A = joinPlayer(w, { criminalExp: 9999, bank: 1e6 });
  crews.found(w, A.p, 'Old Guard');
  const s = biz.sites(w).filter((q) => q.t === 'hideout').find((q) => !biz.ownerOf(w, q.id));
  assert.equal(biz.buy(w, A.p, s), null);
  A.prof.biz[s.id].stash = { cars: [{ model: 'sedan', paint: 1 }], crates: [{ t: 3, v: 500, s: 1, l: '' }] };
  const saved = JSON.parse(JSON.stringify({ prof: A.prof, crews: store.kept.crews }));
  assert.equal(saved.prof.biz[s.id].stash.cars[0].model, 'sedan');
  assert.ok(Object.values(saved.crews).some((c) => c.f && c.f.name === 'Old Guard' && c.up));
  // an old save: no crew fields, no stash, no contract record, no staff - all of it reads as none
  const old = joinPlayer(w, { criminalExp: 9999 });
  assert.equal(crews.tagOf(old.p.pid), null);
  assert.equal(hideout.hideoutFor(w, old.p), null);
  assert.equal(biz.awayPay(w, old.prof).length, 0);
  heistjobs.tick(w, old.p);
  assert.equal(crews.panel(w, old.p).crew, null);
});
