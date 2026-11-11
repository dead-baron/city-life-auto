// The other four contacts (server/systems/contacts.js; the data: shared/rules-contacts.js): Mae Holloway's storefront
// lease, "Deacon" Marsh's Port job (the dock shipment, a bank vault, the armored run, the cargo ship's strongroom case)
// and its hideout, Captain Reyes's mirror chain and the detective's office, Victor Lin's tower share and its daily rent;
// the crossing (a cop on Reyes's chain tipped off about a criminal on a Port job step, the criminal warned); the records
// saved with the account; the career's contact named the same everywhere. (Their places on World v3's map:
// test/contacts2w3.test.js - the test map here is today's city, where each falls back to the nearest of its kind.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer } from './helpers.js';
import { CAREERS, CRATE_PAY } from '../shared/rules.js';
import { CONTACTS, CONTACT, CONTACT_ORDER } from '../shared/rules-contacts.js';
import { K } from '../shared/constants.js';
const contacts = await import('../server/systems/contacts.js');
const careers = await import('../server/systems/careers.js');
const calendar = await import('../server/systems/calendar.js');
const biz = await import('../server/systems/biz.js');
const upkeep = await import('../server/systems/upkeep.js');
const extract = await import('../server/systems/extract.js');
const economy = await import('../server/systems/economy.js');
const goals = await import('../server/systems/goals.js');
const nx = await import('../server/systems/whatsnext.js');

const done = (o = {}) => ({ ftue: { st: 'done', tips: 0, m: {} }, ...o });
const texts = (p) => (p.profile.careers.calls || []).map((c) => c.text);
const R = (p, id) => p.profile.contacts.c[id];
const card = (w, p, id) => contacts.cardsFor(w, p).find((q) => q.id.startsWith(`contact:${id}:`));
const xpAt = (c, name) => CAREERS[c].ranks.find((r) => r.name === name).xp;
const rankAt = (c, name) => CAREERS[c].ranks.findIndex((r) => r.name === name);
const EVENTS = new Set(['theft', 'hotEscape', 'rob', 'cleanRob', 'fence', 'heist', 'arrest', 'bounty', 'dispatch', 'duty', 'spiked', 'escort', 'recover', 'visit', 'handover', 'have', 'stakeout', 'haul', 'takings', 'clean', 'shift', 'prop']);
function at(w, p, id) { const q = contacts.placeOf(w, CONTACTS[id]); p.ped.x = q.x; p.ped.y = q.y + 10; w.place(p.ped); return q; }
// the chain walked up to mission i (each done by the dev shortcut, a rank gate met the same way)
function upTo(w, p, id, i) { let n = 0; while (R(p, id).s < i && n++ < 40) contacts.devJump(w, p, id); ready(w, p, id); }
const day = 86400e3;
// the mission on offer waiting for a rank: the rank met (the dev shortcut)
function ready(w, p, id) { const C = CONTACTS[id], S = C.steps[R(p, id).s]; if (S && S.rank > careers.careerRank(p, C.career)) contacts.devJump(w, p, id); contacts.tick(w, p); }

test('the data: six contacts named as the careers name them, 6-8 missions each, the late ones from the late rank', () => {
  assert.deepEqual(CONTACT_ORDER, ['rosa', 'okafor', 'mae', 'deacon', 'reyes', 'lin']);
  for (const c of Object.keys(CAREERS)) {
    const mine = CONTACT_ORDER.map((k) => CONTACTS[k]).filter((C) => C.career === c).map((C) => C.name);
    assert.deepEqual(mine, CAREERS[c].contact, `${c}: the same names everywhere`);
  }
  for (const id of ['mae', 'deacon', 'reyes', 'lin']) {
    const C = CONTACTS[id];
    assert.ok(C.steps.length >= 6 && C.steps.length <= 8, `${id}: 6-8 missions`);
    let last = 0;
    for (const S of C.steps) {
      assert.ok(EVENTS.has(S.ev), `${id}/${S.id}: ${S.ev}`);
      assert.ok(S.rank >= last); last = S.rank;
      assert.ok(S.say && S.say.length < 140 && S.call && S.call.length < 140 && S.t && S.sub, `${id}/${S.id}: short`);
    }
    assert.ok(C.end.xpTo > C.steps.at(-1).rank);
    assert.ok(C.repeat.jobs.length >= 3 && C.repeat.twists.length >= 3);
    for (const J of C.repeat.jobs) assert.ok(EVENTS.has(J.ev) && J.n.length === 3, `${id}/${J.id}`);
  }
  for (const id of ['deacon', 'reyes', 'lin']) assert.equal(CONTACTS[id].steps[0].rank, CAREERS[CONTACTS[id].career].lateFrom, `${id}: from the late rank`);
  assert.equal(CONTACTS.mae.end.xpTo, rankAt('business', 'Owner'));
  assert.equal(CONTACTS.deacon.end.xpTo, rankAt('crime', 'Underboss'));
  assert.equal(CONTACTS.reyes.end.xpTo, rankAt('police', 'Captain'));
  assert.equal(CONTACTS.lin.end.xpTo, rankAt('business', 'Tycoon'));
  assert.ok(CONTACTS.deacon.steps.some((S) => S.spawn === 'port') && CONTACTS.reyes.steps.some((S) => S.spawn === 'port'), 'the Port job, both sides');
});

test('Mae Holloway: meets honest money, shifts and clean money and honest freight count, ends with a storefront lease at a cut rent and Owner', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, done({ careers: { ...careers.fresh(), biz: 5, pv: 1 } }));
  goals.state(p).list = [];
  contacts.tick(w, p);
  assert.equal(R(p, 'mae').met, 1);
  assert.equal(texts(p)[0], CONTACTS.mae.steps[0].say);
  assert.ok(!p.profile.contacts.c.lin, 'Victor waits for a Landlord');
  contacts.accept(w, p, 'mae');
  at(w, p, 'mae'); contacts.tick(w, p);
  assert.equal(R(p, 'mae').s, 1);
  contacts.tick(w, p); contacts.accept(w, p, 'mae');
  careers.note(w, p, 'shift', { job: 'taxi' });
  assert.equal(R(p, 'mae').s, 2);
  contacts.tick(w, p); contacts.accept(w, p, 'mae');
  careers.note(w, p, 'clean', { n: 300 }); careers.note(w, p, 'clean', { n: 250 });
  assert.equal(R(p, 'mae').s, 3, '$500 clean');
  // honest freight: a dock crate handed in at a bank's vault (extract.js notes 'haul')
  p.profile.careers.biz = xpAt('business', 'Shopkeeper');
  contacts.tick(w, p); contacts.accept(w, p, 'mae');
  const c = w.spawnCrate(2, p.ped.x, p.ped.y, { contraband: false, value: CRATE_PAY[2] });
  c.extract = { src: 'dock', stolen: false, ev: 'dock:1', from: { x: 0, y: 0 } };
  c.state = 'carried'; c.parent = p.ped.id; p.ped.carrying = c.id;
  assert.equal(extract.deliver(w, p, c, 'vault').kind, 'vault');
  assert.equal(R(p, 'mae').s, 4);
  careers.tick(w, p);
  upTo(w, p, 'mae', CONTACTS.mae.steps.length - 1);
  contacts.accept(w, p, 'mae');
  at(w, p, 'mae'); contacts.tick(w, p);
  assert.equal(R(p, 'mae').done, 1);
  assert.equal(careers.careerRank(p, 'business'), rankAt('business', 'Owner'));
  assert.equal(careers.careerXp(p, 'business'), xpAt('business', 'Owner'), 'up to the threshold, not past it');
  const L = p.profile.contacts.lease, s = biz.siteById(w, L.site), e = p.profile.biz[L.site];
  assert.ok(s && e, 'a business of your own');
  assert.equal(s.t, 'shop', 'a storefront: the auto shop nearest her lot');
  assert.equal(e.paid, 0);
  assert.deepEqual(e.lease, { by: 'mae', off: CONTACT.leaseOff });
  assert.equal(biz.ownerOf(w, s.id), p.pid);
  const row = upkeep.props(w, p.profile).find((q) => q.key === `b:${s.id}`);
  assert.equal(row.daily, Math.round(upkeep.bizDaily(s) * (1 - CONTACT.leaseOff)), 'half the rent');
  const last = conn.sent.filter((m) => m && m.t === 'ftue' && m.a === 'rank').at(-1);
  assert.equal(last.title, 'OWNER');
  assert.match(last.sub, new RegExp(s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('"Deacon" Marsh: meets a Lieutenant; the dock\'s crate, iron, a bank vault, the gold; the Port job\'s case on the quay; a hideout and Underboss', () => {
  const w = makeWorld();
  let now = 1e12;
  contacts.setClock(() => now);
  try {
    const { p } = joinPlayer(w, done({ criminalExp: xpAt('crime', 'Enforcer') }));
    goals.state(p).list = [];
    contacts.tick(w, p);
    assert.ok(!p.profile.contacts.c.deacon, 'not before Lieutenant');
    p.profile.criminalExp = xpAt('crime', 'Lieutenant');
    careers.tick(w, p);
    contacts.tick(w, p);
    assert.equal(R(p, 'deacon').met, 1);
    assert.ok(texts(p).includes(CONTACTS.deacon.steps[0].say));
    contacts.accept(w, p, 'deacon'); at(w, p, 'deacon'); contacts.tick(w, p);
    assert.equal(R(p, 'deacon').s, 1);
    // off the boat: only the dock shipment's crate counts
    contacts.tick(w, p); contacts.accept(w, p, 'deacon');
    assert.equal(card(w, p, 'deacon').x, calendar.dockSite(w).x, 'the card points at the quay');
    careers.note(w, p, 'fence', { n: 900, crate: 2, src: 'vault' });
    assert.equal(R(p, 'deacon').s, 1);
    careers.note(w, p, 'fence', { n: 900, crate: 2, src: 'dock' });
    assert.equal(R(p, 'deacon').s, 2);
    contacts.tick(w, p); contacts.accept(w, p, 'deacon');
    careers.note(w, p, 'fence', { n: 900, crate: 2, src: 'dock' });
    assert.equal(R(p, 'deacon').s, 2, 'steel is not iron');
    careers.note(w, p, 'fence', { n: 2000, crate: 3, src: 'vault' });
    assert.equal(R(p, 'deacon').s, 3);
    contacts.tick(w, p); contacts.accept(w, p, 'deacon');
    careers.note(w, p, 'heist');
    assert.equal(R(p, 'deacon').s, 4, 'a bank vault cracked (heist.js)');
    upTo(w, p, 'deacon', 6);
    // the Port job: accepting it puts the strongroom case on the quay, for everyone's map
    const S = CONTACTS.deacon.steps[6];
    assert.equal(S.spawn, 'port');
    contacts.accept(w, p, 'deacon');
    const r = R(p, 'deacon'), c = w.get(r.case), site = calendar.dockSite(w);
    assert.ok(c && c.kind === K.CRATE && c.tier === 4);
    assert.deepEqual([c.extract.src, c.extract.stolen, c.extract.ev], ['port', true, `port:${p.pid}`]);
    assert.ok(Math.hypot(c.x - site.x, c.y - site.y) < 400, 'by the cargo ship');
    w.tick = 4; extract.update(w);
    assert.ok((w.extractMarks || []).some((m) => m.id === c.id && m.all), 'carbon-gold: on every map');
    // gone without you delivering it: the next one is in the hold a little later
    w.remove(c); contacts.tick(w, p);
    assert.equal(r.case, 0);
    assert.match(texts(p)[0], /another/);
    contacts.tick(w, p);
    assert.equal(r.case, 0, 'not at once');
    now += CONTACT.portGapS * 1000; contacts.tick(w, p);
    const c2 = w.get(r.case);
    assert.ok(c2 && c2 !== c);
    // fenced: the chain's end
    c2.state = 'carried'; c2.parent = p.ped.id; p.ped.carrying = c2.id;
    assert.equal(extract.deliver(w, p, c2, 'fence').kind, 'fence');
    assert.equal(r.done, 1);
    assert.equal(careers.careerXp(p, 'crime'), xpAt('crime', 'Underboss'), 'Underboss, exactly');
    const H = p.profile.contacts.hideout, hs = biz.siteById(w, H.site);
    assert.equal(hs.t, 'hideout');
    assert.equal(p.profile.biz[H.site].paid, 0);
    assert.equal(biz.ownerOf(w, H.site), p.pid);
  } finally { contacts.setClock(null); }
});

test('Captain Reyes: a stakeout while the ship unloads, the seized Port haul to a station, the office and its case board, Captain', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, done({ samaritan: 60, policePts: xpAt('police', 'Detective') }));
  goals.state(p).list = [];
  p.badge = true;
  careers.tick(w, p);
  contacts.tick(w, p);
  assert.equal(R(p, 'reyes').met, 1);
  contacts.accept(w, p, 'reyes'); at(w, p, 'reyes'); contacts.tick(w, p);
  assert.equal(R(p, 'reyes').s, 1);
  // the stakeout: on the quay, only while a shipment is on, once a shipment
  contacts.tick(w, p); contacts.accept(w, p, 'reyes');
  const site = calendar.dockSite(w);
  p.ped.x = site.x; p.ped.y = site.y; w.place(p.ped);
  contacts.tick(w, p);
  assert.equal(R(p, 'reyes').s, 1, 'no ship in');
  w.cal ??= { started: new Set(), live: [] };
  w.cal.live.push({ id: 'dock', k: 7, over: false });
  contacts.tick(w, p);
  assert.equal(R(p, 'reyes').s, 2);
  upTo(w, p, 'reyes', 6);
  contacts.accept(w, p, 'reyes');
  const r = R(p, 'reyes'), c = w.get(r.case);
  assert.ok(c && c.extract.src === 'port');
  careers.note(w, p, 'recover', { crate: 3, src: 'vault' });
  assert.equal(r.s, 6, 'not the Port haul');
  c.state = 'carried'; c.parent = p.ped.id; p.ped.carrying = c.id;
  assert.equal(extract.deliver(w, p, c, 'police').kind, 'recover');
  assert.equal(r.s, 7);
  contacts.tick(w, p); contacts.accept(w, p, 'reyes');
  const hq = at(w, p, 'reyes'); contacts.tick(w, p);
  assert.equal(r.done, 1);
  assert.equal(careers.careerRank(p, 'police'), rankAt('police', 'Captain'));
  assert.equal(careers.careerXp(p, 'police'), xpAt('police', 'Captain'));
  assert.deepEqual(p.profile.contacts.office, { at: 'reyes' });
  assert.equal(conn.sent.filter((m) => m && m.t === 'ftue' && m.a === 'rank').at(-1).title, 'CAPTAIN');
  // the case board: the most wanted online, at the HQ's desk and as a card on duty
  const crook = joinPlayer(w, done({ criminalExp: 10 })).p;
  crook.name = 'Vinnie'; crook.wanted = 3;
  const opts = economy.buildMenu(w, p, hq).opts;
  const row = opts.find((o) => o.id === 'ofc:0');
  assert.match(row.label, /case board: (track )?Vinnie/);   // (a detective can track them from here: tracking.js)
  assert.match(row.note, /3 stars/);
  const cs = contacts.cardsFor(w, p).find((q) => q.id === `contact:office:${crook.pid}`);
  assert.equal(cs.x, Math.round(crook.ped.x));
  p.badge = false;
  assert.ok(!contacts.cardsFor(w, p).some((q) => q.id.startsWith('contact:office:')), 'on duty only');
});

test('the chains cross: a cop on Reyes\'s chain is tipped off about a criminal on a Port job step, the criminal is warned - once each', () => {
  const w = makeWorld();
  const crook = joinPlayer(w, done({ criminalExp: xpAt('crime', 'Lieutenant') })).p;
  const cop = joinPlayer(w, done({ samaritan: 60, policePts: xpAt('police', 'Detective') })).p;
  crook.name = 'Vinnie'; cop.name = 'Dana';
  goals.state(crook).list = []; goals.state(cop).list = [];
  contacts.tick(w, crook); contacts.tick(w, cop);
  cop.badge = true;
  contacts.cross(w);
  assert.equal(cop.cxTip, null, 'Deacon has nobody working yet');
  upTo(w, crook, 'deacon', 1);
  contacts.accept(w, crook, 'deacon');   // (off the boat: a Port job step)
  crook.ped.x = 3000; crook.ped.y = 3000; w.place(crook.ped);
  contacts.cross(w);
  assert.equal(cop.cxTip.pid, crook.pid);
  assert.equal(texts(cop)[0], CONTACTS.reyes.cross.replace('{name}', 'Vinnie'));
  assert.equal(texts(crook)[0], CONTACTS.deacon.cross);
  const nc = texts(cop).length, nk = texts(crook).length;
  contacts.cross(w);
  assert.equal(texts(cop).length, nc, 'told once');
  assert.equal(texts(crook).length, nk, 'warned once a step');
  const cc = card(w, cop, 'reyes');
  assert.equal(cc.x, cop.cxTip.x);
  assert.match(cc.sub, /^Tip: Vinnie is on a Port job/);
  assert.match(card(w, crook, 'deacon').sub, /A detective is on you/);
  // off duty: no tip; the criminal's step done: no tip
  cop.badge = false; contacts.cross(w);
  assert.equal(cop.cxTip, null);
  cop.badge = true; careers.note(w, crook, 'fence', { n: 900, crate: 2, src: 'dock' }); contacts.cross(w);
  assert.equal(cop.cxTip, null, 'the next step isn\'t accepted yet');
});

test('Victor Lin: takings, clean capital, property, freight; a tower share paying rent each day into the bank, and Tycoon', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, done({ careers: { ...careers.fresh(), biz: xpAt('business', 'Landlord'), pv: 1 } }));
  goals.state(p).list = [];
  contacts.tick(w, p);
  assert.equal(R(p, 'lin').met, 1);
  upTo(w, p, 'lin', 1);
  contacts.accept(w, p, 'lin');
  careers.note(w, p, 'takings', { n: 2000 }); careers.note(w, p, 'takings', { n: 1000 });
  assert.equal(R(p, 'lin').s, 2);
  upTo(w, p, 'lin', 3);
  contacts.accept(w, p, 'lin');
  careers.note(w, p, 'prop', { k: 'h1' });
  assert.equal(R(p, 'lin').s, 4, 'a property bought');
  upTo(w, p, 'lin', CONTACTS.lin.steps.length);
  assert.equal(R(p, 'lin').done, 1);
  assert.equal(careers.careerXp(p, 'business'), xpAt('business', 'Tycoon'));
  const st = p.profile.contacts.stake;
  assert.deepEqual(st, { at: 'lin', tower: contacts.towerFor(w, CONTACTS.lin), share: CONTACT.stakeShare, rent: CONTACT.stakeRent });
  assert.match(st.tower, /Tower$/);
  // the rent: with the upkeep, each day billed
  const t0 = Date.UTC(2026, 10, 9, 12);
  upkeep.check(w, p, t0);
  const bank = p.profile.bank, xp = careers.careerXp(p, 'business');
  upkeep.check(w, p, t0 + 2 * day);
  assert.equal(p.profile.bank, bank + 2 * CONTACT.stakeRent, 'two days of rent');
  assert.ok(careers.careerXp(p, 'business') > xp, 'clean money: business XP');
  upkeep.check(w, p, t0 + 2 * day);
  assert.equal(p.profile.bank, bank + 2 * CONTACT.stakeRent, 'not twice for the same day');
});

test('saved with the account: the lease, the hideout, the office, the share and a Port job under way survive a save; old saves load', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, done({ criminalExp: xpAt('crime', 'Lieutenant') }));
  goals.state(p).list = [];
  contacts.tick(w, p);
  upTo(w, p, 'deacon', 6);
  contacts.accept(w, p, 'deacon');
  p.profile.contacts.office = { at: 'reyes' };
  p.profile.contacts.stake = { at: 'lin', tower: 'Union Trust Tower', share: 0.05, rent: 750 };
  p.profile.contacts.lease = { site: 'x' };
  const saved = JSON.parse(JSON.stringify(p.profile));
  delete saved.pid;
  const w2 = makeWorld();
  const back = joinPlayer(w2, saved).p;
  assert.equal(R(back, 'deacon').s, 6);
  assert.equal(R(back, 'deacon').acc, 1);
  assert.deepEqual(back.profile.contacts.office, { at: 'reyes' });
  assert.equal(back.profile.contacts.stake.rent, 750);
  // a new server: the old case is gone (a new player too) - a fresh one on the quay, then fenced as before
  contacts.tick(w2, back);
  const c = w2.get(R(back, 'deacon').case);
  assert.ok(c && c.extract.ev === `port:${back.pid}`);
  careers.note(w2, back, 'fence', { n: 5000, crate: 4, src: 'port' });
  assert.equal(R(back, 'deacon').done, 1);
  const old = JSON.parse(JSON.stringify(p.profile));
  delete old.contacts; delete old.pid;
  const o = joinPlayer(w2, old).p;
  assert.doesNotThrow(() => { contacts.tick(w2, o); contacts.cross(w2); contacts.cardsFor(w2, o); upkeep.check(w2, o); });
});

test('one name for a career\'s contact: the goal cards ask the contact whose chain you\'re on', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, done({ careers: { ...careers.fresh(), biz: 5, pv: 1, main: 'business' } }));
  assert.equal(careers.contactOf('business', 0, p), 'Mae Holloway');
  contacts.tick(w, p);
  p.profile.careers.biz = xpAt('business', 'Landlord');
  assert.equal(careers.contactOf('business', 4, p), 'Mae Holloway', 'still on her chain');
  contacts.tick(w, p);
  assert.equal(careers.contactOf('business', 4, p), 'Victor Lin', 'the later chain once he\'s in touch');
  R(p, 'lin').done = 1; R(p, 'mae').done = 1;
  assert.equal(careers.contactOf('business', 4, p), 'Victor Lin', 'by rank after');
  const S = nx.handle(w, p, { a: 'next' });
  for (const c of S.cards) if (c.who && c.career === 'business') assert.ok(CAREERS.business.contact.includes(c.who), c.who);
});
