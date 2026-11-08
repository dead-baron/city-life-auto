// Contacts and their mission chains (server/systems/contacts.js; the data: shared/rules-contacts.js): Rosa Vance's and
// Sgt. Okafor's chains move on what the game counts, wait for a rank, end with what you keep (a lock-up, a patrol car, an
// XP bump to a rank's threshold - never past it); the current mission is a What's next card (accept, then call); the
// record is saved with the account and old saves load; after a chain, repeatable jobs with a rotating twist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer } from './helpers.js';
import { CAREERS } from '../shared/rules.js';
import { CONTACTS, CONTACT, CONTACT_ORDER } from '../shared/rules-contacts.js';
import { K } from '../shared/constants.js';
const contacts = await import('../server/systems/contacts.js');
const careers = await import('../server/systems/careers.js');
const nx = await import('../server/systems/whatsnext.js');
const cruiser = await import('../server/systems/cruiser.js');
const economy = await import('../server/systems/economy.js');
const goals = await import('../server/systems/goals.js');

const done = (o = {}) => ({ ftue: { st: 'done', tips: 0, m: {} }, ...o });
const texts = (p) => (p.profile.careers.calls || []).map((c) => c.text);
const R = (p, id) => p.profile.contacts.c[id];
const cards = (w, p) => contacts.cardsFor(w, p);
// the events careers.js note emits, and the ones contacts.js checks itself
const EVENTS = new Set(['theft', 'hotEscape', 'rob', 'cleanRob', 'fence', 'heist', 'arrest', 'bounty', 'dispatch', 'duty', 'spiked', 'escort', 'recover', 'visit', 'handover', 'have']);
// stand at a contact's place
function at(w, p, id) { const q = contacts.placeOf(w, CONTACTS[id]); p.ped.x = q.x; p.ped.y = q.y + 10; w.place(p.ped); return q; }
// a mission on offer accepted from its card (the app's button), then done by the events it counts
function acceptCard(w, p, id) {
  const c = cards(w, p).find((q) => q.id.startsWith(`contact:${id}:`) && q.btn.k === 'accept');
  assert.ok(c, `${id}: a card to accept`);
  assert.equal(c.accept(w, p), null);
  return c;
}

test('the data: two contacts of 6-8 missions from existing systems, gated by rank, ending in something kept', () => {
  assert.deepEqual(CONTACT_ORDER, ['rosa', 'okafor']);
  for (const id of CONTACT_ORDER) {
    const C = CONTACTS[id];
    assert.ok(CAREERS[C.career], id);
    assert.ok(C.steps.length >= 6 && C.steps.length <= 8, `${id}: 6-8 missions`);
    let last = 0;
    for (const S of C.steps) {
      assert.ok(EVENTS.has(S.ev), `${id}/${S.id}: ${S.ev} is counted somewhere`);
      assert.ok(S.rank >= last, `${id}/${S.id}: ranks only go up`); last = S.rank;
      assert.ok(S.say && S.say.length < 140 && S.call && S.t && S.sub, `${id}/${S.id}: one short line of character, a brief`);
    }
    assert.ok(C.end.lockup || C.end.car);
    assert.ok(C.end.xpTo > C.steps[C.steps.length - 1].rank, 'the end bumps you up a rank');
    assert.ok(C.repeat.jobs.length >= 3 && C.repeat.twists.length >= 3);
    for (const J of C.repeat.jobs) assert.ok(EVENTS.has(J.ev) && J.n.length === 3, `${id}/${J.id}`);
  }
  assert.equal(CONTACTS.rosa.end.xpTo, CAREERS.crime.ranks.findIndex((r) => r.name === 'Booster'));
  assert.equal(CONTACTS.okafor.end.xpTo, CAREERS.police.ranks.findIndex((r) => r.name === 'Corporal'));
});

test('their places: Rosa\'s pawn shop in Southside, Sgt. Okafor\'s precinct (else the nearest the map has)', () => {
  const w = makeWorld();
  const rosa = contacts.placeOf(w, CONTACTS.rosa), oka = contacts.placeOf(w, CONTACTS.okafor);
  assert.equal(rosa.kind, 'pawn');
  assert.equal(w.map.districtAt(rosa.x, rosa.y).name, 'Southside');
  assert.equal(oka.kind, 'police');
  assert.match(contacts.placeName(w, CONTACTS.rosa), /^Crown Pawn$/);
});

test('Rosa: meets a criminal, texts the offer, the card accepts it, the events move the chain on and pay', () => {
  const w = makeWorld();
  const honest = joinPlayer(w, done()).p;
  contacts.tick(w, honest);
  assert.equal(honest.profile.contacts, undefined, 'an honest newcomer: Rosa keeps her distance (nothing saved)');
  const { p } = joinPlayer(w, done({ criminalExp: 5 }));
  contacts.tick(w, p);
  assert.equal(R(p, 'rosa').met, 1);
  assert.equal(texts(p)[0], CONTACTS.rosa.steps[0].say, 'the offer is a text in the app\'s calls');
  assert.ok(!p.profile.contacts.c.okafor, 'no police contact for a criminal');
  goals.state(p).list = [];   // (no daily goal paying for the same theft)
  careers.note(w, p, 'theft');
  assert.equal(R(p, 'rosa').s, 0, 'not accepted yet: nothing counts');
  const cash = p.profile.cash, xp = p.profile.criminalExp;
  acceptCard(w, p, 'rosa');
  const on = cards(w, p).find((c) => c.id === 'contact:rosa:0:on');
  assert.equal(on.btn.k, 'call');
  assert.equal(on.call, CONTACTS.rosa.steps[0].call);
  careers.note(w, p, 'theft');
  assert.equal(R(p, 'rosa').s, 1, 'mission 1 done');
  assert.equal(p.profile.cash, cash + CONTACTS.rosa.steps[0].cash);
  assert.equal(p.profile.criminalExp, xp + CONTACTS.rosa.steps[0].xp);
  contacts.tick(w, p);
  assert.equal(texts(p)[0], CONTACTS.rosa.steps[1].say, 'the next one offered');
  // a robbery only counts with a take
  contacts.accept(w, p, 'rosa'); careers.note(w, p, 'hotEscape');
  contacts.tick(w, p); contacts.accept(w, p, 'rosa');
  careers.note(w, p, 'rob', { take: 0 });
  assert.equal(R(p, 'rosa').s, 2, 'an empty till isn\'t a robbery');
  careers.note(w, p, 'rob', { take: 300, hurt: true });
  assert.equal(R(p, 'rosa').s, 3);
});

test('rank gating: the next mission waits for Hustler - a text once, a waiting card, accept refused; the rank opens it', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, done({ criminalExp: 5 }));
  contacts.tick(w, p);
  for (let i = 0; i < 3; i++) contacts.devJump(w, p, 'rosa');
  p.profile.criminalExp = 20;
  contacts.tick(w, p);
  assert.equal(R(p, 'rosa').s, 3);
  assert.match(texts(p)[0], /Hustler/, 'she says what she waits for');
  const n = texts(p).length;
  contacts.tick(w, p);
  assert.equal(texts(p).length, n, 'said once');
  const c = cards(w, p).find((q) => q.id.startsWith('contact:rosa:'));
  assert.equal(c.id, 'contact:rosa:gate:3');
  assert.equal(c.btn.k, 'call');
  assert.match(c.sub, /20 \/ 50 crime XP/);
  assert.match(contacts.accept(w, p, 'rosa'), /Hustler/);
  p.profile.criminalExp = CAREERS.crime.ranks[1].xp;
  contacts.tick(w, p);
  assert.equal(texts(p)[0], CONTACTS.rosa.steps[3].say);
  assert.equal(cards(w, p).find((q) => q.id.startsWith('contact:rosa:')).id, 'contact:rosa:3');
});

test('what counts: money fenced adds up, a crate is a crate, the drill in your bag, the stolen car handed over, the visit', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, done({ criminalExp: 60 }));
  contacts.tick(w, p);
  const r = R(p, 'rosa');
  r.s = 3; r.said = 3;
  contacts.accept(w, p, 'rosa');
  careers.note(w, p, 'fence', { n: 300 });
  assert.equal(r.got, 300);
  assert.match(cards(w, p).find((c) => c.id === 'contact:rosa:3:on').sub, /\$300 \/ \$500/);
  careers.note(w, p, 'fence', { n: 250 });
  assert.equal(r.s, 4, 'wash: $500 fenced');
  contacts.tick(w, p); contacts.accept(w, p, 'rosa');
  careers.note(w, p, 'fence', { n: 900 });
  assert.equal(r.s, 4, 'hot money is not hot cargo');
  careers.note(w, p, 'fence', { n: 400, crate: 1 });
  assert.equal(r.s, 5);
  // the delivery: a stolen car driven up to her shop, handed over at the wheel
  contacts.tick(w, p); contacts.accept(w, p, 'rosa');
  const q = at(w, p, 'rosa');
  const v = w.spawnVehicle('sedan', q.x, q.y + 40, 0, { npcOwned: true });
  v.seats[0] = p.ped.id; p.ped.vehId = v.id; p.ped.seat = 0; v.stolenBy = new Set([p.pid]);
  const it = contacts.vehicleInteraction(w, p);
  assert.match(it.label, /Hand the .* over to Rosa/);
  p.wanted = 2; it.run();
  assert.equal(r.s, 5, 'not with the police on your tail');
  p.wanted = 0; it.run();
  assert.equal(r.s, 6);
  assert.ok(v.removed || !w.get(v.id), 'she has the car');
  assert.equal(p.ped.vehId, 0);
  // the drill: in your bag
  contacts.tick(w, p); contacts.accept(w, p, 'rosa');
  assert.equal(r.s, 6);
  p.profile.inventory.drill = 1;
  contacts.tick(w, p);
  assert.equal(r.s, 7);
  // the visit: at the shop, accepted - the chain's end
  p.ped.x += 3000; w.place(p.ped);
  contacts.tick(w, p); contacts.accept(w, p, 'rosa');
  assert.equal(r.done, 0, 'not there yet');
  at(w, p, 'rosa');
  contacts.tick(w, p);
  assert.equal(r.done, 1);
});

test('the chain\'s end: Rosa\'s lock-up, crime XP up to Booster\'s threshold (not past it), one title card, her call', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, done({ criminalExp: 5 }));
  goals.state(p).list = [];
  contacts.tick(w, p);
  careers.tick(w, p);
  while (!R(p, 'rosa').done) contacts.devJump(w, p, 'rosa');
  const booster = CAREERS.crime.ranks[2].xp;
  assert.equal(p.profile.criminalExp, booster, 'up to the threshold exactly');
  assert.ok(p.profile.contacts.lockup && p.profile.contacts.lockup.at === 'rosa');
  assert.equal(texts(p)[0], CONTACTS.rosa.end.line);
  const card = conn.sent.filter((m) => m && m.t === 'ftue' && m.a === 'rank');
  assert.equal(card.length, 1);
  assert.equal(card[0].title, 'BOOSTER');
  assert.match(card[0].sub, /lock-up/);
  careers.tick(w, p);
  assert.equal(conn.sent.filter((m) => m && m.t === 'ftue' && m.a === 'rank').length, 1, 'no second card for the same rank');
  // already past it: no bump down, no rank card - the reward's own
  const q = joinPlayer(w, done({ criminalExp: 1000 }));
  contacts.tick(w, q.p);
  while (!R(q.p, 'rosa').done) contacts.devJump(w, q.p, 'rosa');
  assert.ok(q.p.profile.criminalExp >= 1000 && careers.careerRank(q.p, 'crime') === 4, 'no bump down');
  assert.equal(q.conn.sent.filter((m) => m && m.t === 'ftue' && m.a === 'rank').at(-1).title, 'YOUR LOCK-UP');
});

test('the lock-up: a car driven up to it goes in, the counter takes it out and a carried crate in', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, done({ criminalExp: 60, contacts: { v: 1, c: { rosa: { met: 1, s: 8, done: 1, acc: 0, got: 0, said: 7, gated: -1, rep: null, next: Date.now() + 1e9, nrep: 0 } }, lockup: { at: 'rosa', cars: [], crates: [] } } }));
  const q = at(w, p, 'rosa');
  const v = w.spawnVehicle('sedan', q.x, q.y + 40, 0, { npcOwned: true });
  v.seats[0] = p.ped.id; p.ped.vehId = v.id; p.ped.seat = 0; v.stolenBy = new Set([p.pid]);
  const it = contacts.vehicleInteraction(w, p);
  assert.match(it.label, /in your lock-up \(0\/2\)/);
  it.run();
  assert.deepEqual(p.profile.contacts.lockup.cars.map((c) => c.model), ['sedan']);
  const opts = economy.buildMenu(w, p, q).opts;
  const take = opts.find((o) => o.id === 'lku:c:0');
  assert.ok(take, 'the counter has it');
  assert.equal(contacts.onMenu(w, p, q, ['lku', 'c', '0']), null);
  assert.equal(p.profile.contacts.lockup.cars.length, 0);
  const out = [...w.entities.values()].find((e) => e.kind === K.VEH && e.lockupOf === p.pid);
  assert.ok(out && out.stolenBy.has(p.pid), 'out front, yours to drive off in');
  // a crate carried in, and out again
  const c = w.spawnCrate(3, p.ped.x, p.ped.y, { contraband: true, value: 2400 });
  c.state = 'carried'; c.parent = p.ped.id; p.ped.carrying = c.id;
  assert.ok(economy.buildMenu(w, p, q).opts.find((o) => o.id === 'lku:p'));
  assert.equal(contacts.onMenu(w, p, q, ['lku', 'p']), null);
  assert.deepEqual(p.profile.contacts.lockup.crates, [{ t: 3, v: 2400, s: 1, l: c.label || '' }]);
  assert.equal(p.ped.carrying, 0);
  assert.equal(contacts.onMenu(w, p, q, ['lku', 't', '0']), null);
  assert.ok(p.ped.carrying);
  assert.equal(w.get(p.ped.carrying).value, 2400);
});

test('Sgt. Okafor: meets someone fit for a badge; spike stops and arrests without force count; the patrol car and Corporal', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, done({ samaritan: 40 }));
  goals.state(p).list = [];
  contacts.tick(w, p);
  assert.equal(R(p, 'okafor').met, 1);
  assert.equal(texts(p)[0], CONTACTS.okafor.steps[0].say);
  acceptCard(w, p, 'okafor');
  p.badge = true;
  contacts.tick(w, p);
  assert.equal(R(p, 'okafor').s, 1, 'on duty already: reported');
  contacts.tick(w, p); contacts.accept(w, p, 'okafor');
  careers.note(w, p, 'dispatch'); careers.note(w, p, 'dispatch');
  contacts.tick(w, p); contacts.accept(w, p, 'okafor');
  careers.note(w, p, 'spiked');
  assert.equal(R(p, 'okafor').s, 3);
  p.profile.policePts = CAREERS.police.ranks[1].xp;
  contacts.tick(w, p); contacts.accept(w, p, 'okafor');
  careers.note(w, p, 'arrest', { stars: 1, gentle: false });
  assert.equal(R(p, 'okafor').s, 3, 'a beaten suspect doesn\'t count');
  careers.note(w, p, 'arrest', { stars: 1, gentle: true });
  assert.equal(R(p, 'okafor').s, 4);
  careers.tick(w, p);
  while (!R(p, 'okafor').done) contacts.devJump(w, p, 'okafor');
  assert.equal(careers.careerRank(p, 'police'), 2, 'up to Corporal, not past it');
  assert.ok(p.profile.policePts >= CAREERS.police.ranks[2].xp && p.profile.policePts < CAREERS.police.ranks[3].xp);
  const unit = p.profile.contacts.car.unit;
  assert.match(unit, /^\d-[A-Z][a-z]+-\d\d$/);
  assert.equal(contacts.unitFor(p.pid), unit, 'the same call sign every time');
  assert.equal(conn.sent.filter((m) => m && m.t === 'ftue' && m.a === 'rank').at(-1).title, 'CORPORAL');
  // the cruiser dispatch issues is your unit, waits for you, and comes back sooner
  const v = cruiser.issueNow(w, p);
  assert.equal(v.unit, unit);
  assert.equal(v.ownerName, `Unit ${unit}`);
  p.cruiserLostAt = w.time;
  assert.ok(cruiser.cooldownLeft(w, p) <= CONTACT.carCooldownS);
});

test('the What\'s next card: the contacts source, the main career\'s card in the app with its button', () => {
  const w = makeWorld();
  assert.ok(nx.sources().includes('contacts'));
  const { p } = joinPlayer(w, done({ criminalExp: 5, careers: { ...careers.fresh(), main: 'crime', pv: 1 } }));
  contacts.tick(w, p);
  const S = nx.handle(w, p, { a: 'next' });
  const c = S.cards.find((q) => q.id === 'contact:rosa:0');
  assert.ok(c, 'Rosa\'s offer is a card');
  assert.equal(c.slot, 'career');
  assert.equal(c.btn.k, 'accept');
  assert.equal(c.who, 'Rosa Vance');
  const go = nx.handle(w, p, { a: 'nextgo', id: c.id });
  assert.equal(go.ok, 1);
  assert.equal(R(p, 'rosa').acc, 1);
  const S2 = nx.handle(w, p, { a: 'next' });
  const on = S2.cards.find((q) => q.id === 'contact:rosa:0:on');
  assert.equal(on.btn.k, 'call');
  const call = nx.handle(w, p, { a: 'nextgo', id: on.id });
  assert.equal(call.ok, 1);
  assert.ok(p.toasts.some((t) => t.text.includes(CONTACTS.rosa.steps[0].call)), 'she briefs you on the phone');
});

test('saved with the account: the record survives a save and a load; an old save without it loads and starts fresh', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, done({ criminalExp: 5 }));
  contacts.tick(w, p);
  contacts.devJump(w, p, 'rosa'); contacts.devJump(w, p, 'rosa');
  contacts.tick(w, p); contacts.accept(w, p, 'rosa');
  const saved = JSON.parse(JSON.stringify(p.profile));   // (the account record as the file store keeps it)
  delete saved.pid;
  assert.deepEqual(saved.contacts.c.rosa.s, 2);
  const w2 = makeWorld();
  const back = joinPlayer(w2, saved).p;
  assert.equal(R(back, 'rosa').s, 2);
  assert.equal(R(back, 'rosa').acc, 1);
  careers.note(w2, back, 'rob', { take: 100 });
  assert.equal(R(back, 'rosa').s, 3, 'the accepted mission carries on after the load');
  const old = JSON.parse(JSON.stringify(p.profile));
  delete old.contacts; delete old.pid;
  const o = joinPlayer(w2, old).p;
  assert.doesNotThrow(() => { contacts.tick(w2, o); contacts.cardsFor(w2, o); careers.note(w2, o, 'theft'); });
  assert.equal(R(o, 'rosa').s, 0);
});

test('repeatables after the chain: offered after a gap, a twist rotating against the job, pay by rank, rush runs out, turf counts only there', () => {
  const w = makeWorld();
  let now = 1e12;
  contacts.setClock(() => now);
  try {
    const { p } = joinPlayer(w, done({ criminalExp: 60 }));
    contacts.tick(w, p);
    while (!R(p, 'rosa').done) contacts.devJump(w, p, 'rosa');
    const r = R(p, 'rosa');
    contacts.tick(w, p);
    assert.equal(r.rep, null, 'a gap after the chain');
    now += CONTACT.repeatGapS * 1000;
    contacts.tick(w, p);
    assert.ok(r.rep, 'the first repeatable');
    const seen = [];
    for (let i = 0; i < 8; i++) {
      if (!r.rep) { now += CONTACT.repeatGapS * 1000; contacts.tick(w, p); }
      seen.push(`${r.rep.k}/${r.rep.tw}`);
      const c = cards(w, p).find((q) => q.id.startsWith('contact:rosa:rep:'));
      assert.equal(c.btn.k, 'accept');
      contacts.devJump(w, p, 'rosa');
    }
    assert.ok(new Set(seen.map((s) => s.split('/')[0])).size >= 3, 'the jobs rotate');
    assert.ok(new Set(seen.map((s) => s.split('/')[1])).size >= 3, 'so do the twists');
    assert.ok(new Set(seen).size >= 6, 'and not in lockstep');
    // pay: more at a higher rank, more for the twist
    const C = CONTACTS.rosa, J = C.repeat.jobs[0], T = C.repeat.twists.find((t) => t.id === 'twice');
    p.profile.criminalExp = 150; const lo = contacts.repPay(p, C, J, null).cash;
    p.profile.criminalExp = 4000; const hi = contacts.repPay(p, C, J, null).cash;
    assert.ok(hi > lo);
    assert.ok(contacts.repPay(p, C, J, T).cash > hi);
    // rush: accepted, then too slow
    now += CONTACT.repeatGapS * 1000; contacts.tick(w, p);
    r.rep.tw = 'rush'; contacts.accept(w, p, 'rosa');
    now += 481e3; contacts.tick(w, p);
    assert.equal(r.rep, null);
    assert.match(texts(p)[0], /Too slow/);
    // turf: counted only in Southside
    now += CONTACT.repeatGapS * 1000; contacts.tick(w, p);
    Object.assign(r.rep, { k: 'getaway', tw: 'turf', n: 1, got: 0 }); contacts.accept(w, p, 'rosa');
    p.ped.x = 50; p.ped.y = 50; w.place(p.ped);
    careers.note(w, p, 'hotEscape');
    assert.equal(r.rep.got, 0, 'not in Southside');
    at(w, p, 'rosa');
    const cash = p.profile.cash;
    careers.note(w, p, 'hotEscape');
    assert.equal(r.rep, null, 'done in Southside');
    assert.ok(p.profile.cash > cash);
  } finally { contacts.setClock(null); }
});

test('the dev shortcut: a step on, a rank gate met, a reset', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, done());
  assert.match(contacts.devJump(w, p, 'rosa'), /done/);
  assert.equal(R(p, 'rosa').s, 1);
  assert.match(contacts.devJump(w, p, 'nobody'), /No contact/);
  contacts.devReset(p);
  assert.equal(p.profile.contacts, undefined);
});
