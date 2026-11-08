// District reputation (docs/PROGRESSION.md, "Visible consequences and identity"; server/systems/reputation.js): the
// standing's math and its fade by the clock, the shops' prices and refusal, the shotgun under the counter, the police
// knowing a repeat offender on sight, a witness who vouches for you once, the Samaritan points credited where they were
// earned, people's reactions and the phone's list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players, straightRoad } from './helpers.js';
import { K } from '../shared/constants.js';
import { REPUTATION as R } from '../shared/rules.js';
import { IN } from '../shared/input.js';
import * as rep from '../server/systems/reputation.js';
import * as economy from '../server/systems/economy.js';
import * as law from '../server/systems/law.js';
import * as phone from '../server/systems/phone.js';
import { spawnNpc } from '../server/systems/npc.js';

const DAY = 86400000;
const nameAt = (w, x, y) => rep.districtOf(w, x, y).name;
const setRep = (prof, name, e) => { (prof.rep ||= {})[name] = { s: 0, r: 0, o: 0, t: Date.now(), ...e }; };
function listen(w) {
  const log = [], notify = w.notify.bind(w);
  w.notify = (q, text, tone) => { log.push(text); return notify(q, text, tone); };
  return (re) => log.some((t) => re.test(t));
}
function says(w) {
  const log = [], emit = w.emit.bind(w);
  w.emit = (x, y, ev) => { if (ev.e === 'say') log.push(ev); return emit(x, y, ev); };
  return log;
}
// somewhere open on a street, nobody else about
function onStreet(w, p) {
  const r = straightRoad(w.map, 900);
  teleport(w, p.ped, r.x + r.len / 2, r.y - r.hw - 40);
  for (const e of w.query(p.ped.x, p.ped.y, 900, K.PED)) if (e !== p.ped && e.npc) w.remove(e);
  w.map.cameras = w.map.cameras.filter((c) => Math.hypot(c.x - p.ped.x, c.y - p.ped.y) > c.r + 600);
  return p.ped;
}

test('the math: standing as a word, clamped, fading toward neutral by the clock (about a week from Feared)', () => {
  assert.equal(rep.word(-100), 'Feared'); assert.equal(rep.word(R.words.feared), 'Feared'); assert.equal(rep.word(R.words.feared + 1), 'Disliked');
  assert.equal(rep.word(0), 'Neutral'); assert.equal(rep.word(R.words.liked), 'Liked'); assert.equal(rep.word(R.words.loved), 'Loved');
  const t0 = 1e12, e = { s: -100, r: 3, o: 4, t: t0 };
  rep.settle(e, t0 + DAY);
  assert.ok(Math.abs(e.s - (-100 + R.fadeBad)) < 1e-6, 'a day: fadeBad back');
  assert.ok(Math.abs(e.r - (3 - R.fadeRobs)) < 1e-6 && Math.abs(e.o - (4 - R.fadeOffenses)) < 1e-6, 'robs and offenses fade too');
  rep.settle(e, t0 + 6 * DAY);
  assert.ok(e.s < 0 && rep.word(e.s) !== 'Feared', `six days: no longer feared (${e.s.toFixed(1)})`);
  rep.settle(e, t0 + 8 * DAY);
  assert.equal(e.s, 0, 'a week and a bit: neutral');
  const g = rep.settle({ s: 50, t: t0 }, t0 + 100 * DAY);
  assert.equal(g.s, 0, 'the good side fades to neutral too, and never past it');
  const st = rep.settle({ s: -40, t: t0 }, t0 - DAY);
  assert.equal(st.s, -40, 'a clock that went back fades nothing');
});

test('robbing a shop: the standing drops, the district\'s shops charge more, then refuse; Samaritans get a discount', () => {
  const w = makeWorld(), told = listen(w);
  const { p, prof } = joinPlayer(w, { cash: 5000 });
  const shop = w.map.pois.find((q) => q.kind === 'convenience' && rep.districtOf(w, q.x, q.y));
  const D = nameAt(w, shop.x, shop.y);
  teleport(w, p.ped, shop.x, shop.y);
  const goods = (m) => m.opts.filter((o) => /^i:/.test(o.id));
  const base = goods(economy.buildMenu(w, p, shop));
  assert.ok(base.length, 'the store sells things');
  assert.equal(rep.priceMul(0, 0), 1);
  rep.robbed(w, p, shop.x, shop.y);
  assert.equal(prof.rep[D].r, 1);
  assert.equal(prof.rep[D].s, -R.robShop.s, 'a robbery: down by robShop');
  const up = goods(economy.buildMenu(w, p, shop));
  assert.equal(up[0].price, Math.round(base[0].price * R.shops.markup[1]), 'robbed once: marked up');
  assert.match(up[0].id, new RegExp(`:${up[0].price}:`), 'the price in the option\'s id is what execute charges');
  const cash = prof.cash;
  economy.handleMenu(w, p, shop.id, up[0].id);
  assert.equal(cash - prof.cash, up[0].price, 'charged the marked-up price');
  assert.equal(economy.handleMenu(w, p, shop.id, base[0].id), undefined);
  assert.ok(told(/not available here/), 'the old price is no longer on offer');
  rep.robbed(w, p, shop.x, shop.y);
  assert.equal(goods(economy.buildMenu(w, p, shop))[0].price, Math.round(base[0].price * R.shops.markup[2]), 'twice: more');
  rep.robbed(w, p, shop.x, shop.y);
  const no = economy.buildMenu(w, p, shop);
  assert.ok(no.refused && no.opts.length === 1 && no.opts[0].id === 'close', `after ${R.shops.refuse}: no service`);
  const had = prof.cash;
  economy.handleMenu(w, p, shop.id, base[0].id);
  assert.equal(prof.cash, had, 'nothing sold');
  // another district's shops don't know you
  const far = w.map.pois.find((q) => q.kind === 'convenience' && rep.districtOf(w, q.x, q.y) && nameAt(w, q.x, q.y) !== D);
  teleport(w, p.ped, far.x, far.y);
  assert.ok(!economy.buildMenu(w, p, far).refused, 'per district, not global');
  // a week of good behavior later: served again, at the usual price
  prof.rep[D].t -= 8 * DAY;
  teleport(w, p.ped, shop.x, shop.y);
  assert.equal(goods(economy.buildMenu(w, p, shop))[0].price, base[0].price, 'faded: back to normal');
  // liked / loved: a little off
  setRep(prof, D, { s: R.words.liked + 1 });
  assert.equal(goods(economy.buildMenu(w, p, shop))[0].price, Math.round(base[0].price * R.shops.liked));
  setRep(prof, D, { s: R.words.loved + 1 });
  assert.equal(goods(economy.buildMenu(w, p, shop))[0].price, Math.round(base[0].price * R.shops.loved));
  // the hospital and the police are never shops
  const er = w.map.pois.find((q) => q.kind === 'hospital');
  setRep(prof, nameAt(w, er.x, er.y), { r: 5 });
  assert.ok(!economy.buildMenu(w, p, er).refused, 'the ER treats everyone');
});

test('a robbery puts it on the district; robbed there before, a few clerks pull a shotgun instead of the till', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0 });
  const shop = w.map.pois.find((q) => q.kind === 'convenience' && w.map.buildings[q.b] && w.map.buildings[q.b].walkIn);
  const D = nameAt(w, shop.x, shop.y);
  w.map.cameras = w.map.cameras.filter((c) => Math.hypot(c.x - shop.x, c.y - shop.y) > c.r + 600);
  prof.weapons.pistol = 99; p.ped.mag.pistol = 12; p.ped.weapon = 'pistol';
  teleport(w, p.ped, shop.x, shop.y);
  run(w, 1.2);
  const clerk = [...w.entities.values()].find((e) => e.kind === K.PED && e.npc && e.npc.desk && Math.hypot(e.x - shop.x, e.y - shop.y) < 120);
  assert.ok(clerk);
  for (const e of w.query(shop.x, shop.y, 700, K.PED)) if (e !== clerk && e !== p.ped && e.npc) w.remove(e);
  let seq = 1;
  const aim = (secs) => { for (let i = 0; i < Math.round(secs * 20); i++) { players.queueInput(p, { seq: seq++, bits: IN.AIMING, mx: 0, my: 0, aim: Math.atan2(clerk.y - p.ped.y, clerk.x - p.ped.x) }); w.step(); } };
  aim(0.3);
  assert.ok(p.robbery, 'robbery started');
  assert.equal(prof.rep[D].r, 1, 'the district remembers');
  assert.ok(prof.rep[D].s <= -R.robShop.s, 'and thinks less of you');
  // the share of clerks with a shotgun: about shotgunShare, and only after shotgun robberies there
  const fake = (id) => ({ id, x: shop.x, y: shop.y });
  setRep(prof, D, { r: R.shops.shotgun - 1 });
  assert.equal([...Array(400).keys()].filter((i) => rep.shotgun(w, p, fake(i + 1))).length, 0, 'not before');
  setRep(prof, D, { r: R.shops.shotgun });
  const n = [...Array(400).keys()].filter((i) => rep.shotgun(w, p, fake(i + 1))).length;
  assert.ok(Math.abs(n / 400 - R.shops.shotgunShare) < 0.08, `a few of them (${n} of 400)`);
  // this clerk, made one of them: the shotgun comes out, no hands up, no till
  p.robbery = null; clerk.handsUp = false; clerk.npc.blind = false; clerk.npc.robbedUntil = 0;
  const share = R.shops.shotgunShare;
  R.shops.shotgunShare = 1;
  try { aim(0.1); } finally { R.shops.shotgunShare = share; }
  assert.ok(!p.robbery, 'no robbery');
  assert.equal(clerk.weapon, 'shotgun');
  assert.ok(!clerk.npc.desk && clerk.npc.state === 'fight' && clerk.npc.target === p.ped.id, 'coming round the counter at you');
});

test('a repeat offender with a record: an officer who sees them in that district knows them - 1 star, no witness', () => {
  const w = makeWorld(), told = listen(w);
  const { p, prof } = joinPlayer(w);
  const ped = onStreet(w, p), D = nameAt(w, ped.x, ped.y);
  const cop = spawnNpc(w, 'cop', ped.x + 120, ped.y, 'cop');
  cop.npc.state = 'idle';
  setRep(prof, D, { o: R.repeat.offenses });
  run(w, 1);
  assert.equal(p.wanted, 0, 'a clean record: nothing to know you by');
  prof.felonies = 1;
  setRep(prof, D, { o: R.repeat.offenses - 1 });
  run(w, 1);
  assert.equal(p.wanted, 0, 'not a repeat offender yet');
  setRep(prof, D, { o: R.repeat.offenses });
  run(w, 1);
  assert.equal(p.wanted, 1, 'recognized: 1 star');
  assert.ok(!p.soft, 'the usual chase, not a word');
  assert.ok(told(/officer recognized you/), 'told why');
  assert.ok(w.dispatch.some((d) => d.l === 'Known offender sighted' && d.via === 'officer'), 'on the dispatch log');
  law.clearWanted(w, p);
  run(w, 2);
  assert.equal(p.wanted, 0, `once every ${R.repeat.cooldownS} s at most`);
  p.recognizedAt -= R.repeat.cooldownS + 1;
  w.remove(cop);
  run(w, 1);
  assert.equal(p.wanted, 0, 'no officer in sight: nobody knows you');
  // another district: a stranger there
  const r2 = { ...prof.rep }; prof.rep = {};
  const cop2 = spawnNpc(w, 'cop', ped.x + 120, ped.y, 'cop'); cop2.npc.state = 'idle';
  run(w, 1);
  assert.equal(p.wanted, 0, 'per district');
  prof.rep = r2;
});

test('well liked: a passer-by vouches for you once - a witness\'s call dropped; not for a felony, not for an officer', () => {
  const w = makeWorld(), told = listen(w);
  const { p, prof } = joinPlayer(w);
  const ped = onStreet(w, p), D = nameAt(w, ped.x, ped.y);
  const crowd = () => {
    for (const e of w.query(ped.x, ped.y, 900, K.PED)) if (e !== ped && e.npc) w.remove(e);
    for (let i = 0; i < 8; i++) { const e = spawnNpc(w, 'senior', ped.x + 60 + i * 12, ped.y + (i % 2 ? 20 : -20)); e.a = Math.atan2(ped.y - e.y, ped.x - e.x); e.npc.state = 'idle'; }
  };
  crowd();
  setRep(prof, D, { s: R.words.liked + 5 });
  law.crime(w, ped, 'assault', null);
  assert.equal(p.wanted, 0, 'vouched for');
  assert.ok(told(/talked them out of it/));
  assert.ok(prof.rep[D].v > 0, 'used');
  law.crime(w, ped, 'assault', null);
  assert.ok(p.wanted >= 1, 'once: the next one is called in');
  law.clearWanted(w, p);
  // a felony: no
  const p2 = joinPlayer(w).p; teleport(w, p2.ped, ped.x, ped.y - 4); teleport(w, ped, ped.x, ped.y + 4000);
  setRep(p2.profile, D, { s: R.words.loved });
  crowd.call(null);
  for (const e of w.query(p2.ped.x, p2.ped.y, 300, K.PED)) if (e.npc) e.a = Math.atan2(p2.ped.y - e.y, p2.ped.x - e.x);
  law.crime(w, p2.ped, 'murder', null);
  assert.ok(p2.wanted >= 1 && !p2.profile.rep[D].v, 'nobody vouches for a murder');
  // an officer sees it: no
  law.clearWanted(w, p2); p2.profile.felonies = 0;
  const cop = spawnNpc(w, 'cop', p2.ped.x + 80, p2.ped.y, 'cop'); cop.a = Math.PI; cop.npc.state = 'idle';
  law.crime(w, p2.ped, 'assault', null);
  assert.ok(p2.wanted >= 1 && !p2.profile.rep[D].v, 'an officer\'s own eyes');
  // neutral: nobody to vouch
  const p3 = joinPlayer(w).p;
  assert.equal(rep.vouch(w, p3, p2.ped.x, p2.ped.y), false);
});

test('crimes seen there lower it, Samaritan points earned there raise it; owners get a bonus; old saves load', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  delete prof.rep;   // (a profile from before)
  const ped = onStreet(w, p), D = nameAt(w, ped.x, ped.y);
  assert.equal(rep.standingAt(w, p, ped.x, ped.y).word, 'Neutral', 'nothing yet: neutral');
  assert.equal(prof.rep, undefined, 'and nothing saved by looking');
  run(w, 0.6);
  prof.samaritan += 6;
  run(w, 0.6);
  assert.equal(Math.round(prof.rep[D].s), Math.round(Math.min(R.samaritan.maxAct, 6 * R.samaritan.perPoint)), 'credited where earned');
  prof.samaritan += 100;
  run(w, 0.6);
  assert.equal(Math.round(prof.rep[D].s), Math.round(Math.min(R.samaritan.maxAct, 6 * R.samaritan.perPoint) + R.samaritan.maxAct), 'one act counts up to maxAct');
  const before = prof.rep[D].s;
  rep.crimeSeen(w, p, law.CRIMES.assault, ped.x, ped.y);
  assert.ok(Math.abs(prof.rep[D].s - (before - R.crime.s)) < 1e-6 && prof.rep[D].o === 1, 'a crime seen: down, an offense');
  rep.crimeSeen(w, p, law.CRIMES.murder, ped.x, ped.y);
  assert.ok(prof.rep[D].s < before - R.crime.s * 2, 'a felony counts for more');
  rep.crimeSeen(w, p, law.CRIMES.punch, ped.x, ped.y);
  assert.equal(prof.rep[D].o, 2, 'a small crime is no offense');
  // nobody saw it: nothing
  const s0 = prof.rep[D].s;
  for (const e of w.query(ped.x, ped.y, 900, K.PED)) if (e !== ped && e.npc) w.remove(e);
  law.crime(w, ped, 'assault', null);
  assert.equal(prof.rep[D].s, s0, 'unseen');
  // owning a home there
  const h = (w.map.homes || []).find((q) => q && rep.districtOf(w, q.x, q.y));
  const HD = nameAt(w, h.x, h.y);
  const before2 = rep.standingAt(w, p, h.x, h.y).s;
  prof.homes.push(h.id); w.homeOwner.set(h.id, prof.pid); p.repOwn = null;
  const st = rep.standingAt(w, p, h.x, h.y);
  assert.ok(st.own && Math.abs(st.s - Math.min(R.max, before2 + R.owner.bonus)) < 1e-6, `${HD}: the owner's bonus`);
});

test('what people do: out of a feared one\'s way, a gang member\'s nod, a wave for the liked; the phone\'s list', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const ped = onStreet(w, p), D = nameAt(w, ped.x, ped.y), bubbles = says(w);
  prof.criminalExp = R.react.fearExp;
  setRep(prof, D, { s: -90 });
  const civ = spawnNpc(w, 'casual', ped.x + 50, ped.y); civ.npc.state = 'idle';
  const gang = spawnNpc(w, 'syndicate', ped.x - 90, ped.y, 'gang'); gang.npc.state = 'idle';
  run(w, 0.6);
  assert.ok(civ.npc.repAt !== undefined && Math.hypot(civ.npc.wx - ped.x, civ.npc.wy - ped.y) > Math.hypot(civ.x - ped.x, civ.y - ped.y), 'the passer-by heads off away from you');
  assert.ok(bubbles.some((b) => b.id === gang.id && /nod/.test(b.text)), 'the gang member nods');
  // liked: someone waves
  w.remove(civ); w.remove(gang); bubbles.length = 0;
  setRep(prof, D, { s: R.words.liked + 10 });
  const fan = spawnNpc(w, 'casual', ped.x + 60, ped.y); fan.npc.state = 'idle';
  const P = R.react.waveP; R.react.waveP = 1;
  try { run(w, 0.6); } finally { R.react.waveP = P; }
  assert.ok(bubbles.some((b) => b.id === fan.id), 'a wave or a thank-you');
  // the phone: the Skills app's list
  const panel = phone.handle(w, p, { a: 'skills' });
  assert.equal(panel.t, 'skills');
  const row = panel.rep.find((r) => r.n === D);
  assert.ok(row && row.here && row.w === 'Liked', 'where you are, as a word');
  setRep(prof, 'Southside', { s: -80 });
  assert.equal(phone.handle(w, p, { a: 'skills' }).rep[0].w, 'Feared', 'the worst first');
});
