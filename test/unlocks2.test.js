// The last four career unlocks that were "coming" (docs/PROGRESSION.md "Careers and ranks"), made real on the systems there
// were: black-market armor tiers (armor.js: the fence's counter, combat.js damage, the vest on the look), a K9 partner
// (k9.js partner: the armory, the cruiser, a takedown held for the cuffs, the cooldown), commercial property (biz.js type
// 'unit': shops let to tenants, rent through upkeep.js's day) and the top of each ladder's title over your name
// (cosmetics.js: Kingpin, Chief, Tycoon - gold, for everyone, kept with its season).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, store, straightRoad } from './helpers.js';
import { CAREERS, CAREER_KEYS, ARMOR, K9_UNIT, COMMERCIAL, UPKEEP, SEASON } from '../shared/rules.js';
import { BIZ } from '../shared/rules-games.js';
import { IN } from '../shared/input.js';
import { decodeLook, byName } from '../shared/lookcore.js';
import * as careers from '../server/systems/careers.js';
import * as armor from '../server/systems/armor.js';
import * as combat from '../server/systems/combat.js';
import * as k9 from '../server/systems/k9.js';
import * as law from '../server/systems/law.js';
import * as biz from '../server/systems/biz.js';
import * as upkeep from '../server/systems/upkeep.js';
import * as cosmetics from '../server/systems/cosmetics.js';
import * as economy from '../server/systems/economy.js';
import * as players from '../server/systems/players.js';
import { descriptor } from '../server/net.js';
import { dayKey } from '../server/systems/goals.js';

const xpAt = (c, k, v) => CAREERS[c].ranks.find((r) => (r.unlock || []).some((u) => u.k === k && (v === undefined || u.v === v))).xp;
const bizProf = (n) => ({ careers: { v: 1, main: null, seen: {}, biz: n, props: [], tried: {}, calls: [] } });
function world() { for (const q of store.all()) delete q.biz; return makeWorld(); }
const payFrom = economy.payFrom;

test('nothing is "coming" any more: every unlock live, the four new ones with it, shown unlocked in What\'s next', () => {
  for (const c of CAREER_KEYS) for (const r of CAREERS[c].ranks) for (const u of r.unlock || []) assert.ok(!u.soon, `${c} ${r.name}: ${u.name}`);
  const top = { criminalExp: 99999, policePts: 99999, careers: { biz: 99999 } };
  for (const k of ['armor', 'k9', 'commercial', 'kingpin', 'chief', 'tycoon']) assert.ok(careers.hasUnlock(top, k), k);
  for (const c of CAREER_KEYS) { const I = careers.rankInfo(top, c); assert.ok(I.have.every((h) => !h.soon), `${c}: all unlocked`); }
  assert.equal(careers.unlockValue(top, 'armor'), ARMOR.tiers.length);
  assert.equal(careers.unlockValue({ careers: { biz: xpAt('business', 'commercial', 2) } }, 'commercial'), 2);
  assert.equal(careers.unlockValue(top, 'commercial'), 4);
});

test('black-market armor: tiers by crime rank at the fence; what a vest takes, and the police\'s guns still win', () => {
  const w = world();
  const A = joinPlayer(w, { criminalExp: 0, cash: 0, bank: 1e6 }), cop = joinPlayer(w);
  const fence = w.map.pois.find((q) => q && q.kind === 'fence');
  const rows = () => economy.buildMenu(w, A.p, fence).opts.filter((o) => o.id.startsWith('armor:'));
  assert.equal(rows().length, ARMOR.tiers.length, 'every tier on the black market\'s counter');
  assert.ok(rows().every((o) => o.dis && /at .* \(crime\)/.test(o.note)), 'below Booster: none');
  assert.match(armor.buy(w, A.p, 1, payFrom), /comes at Booster/);
  A.prof.criminalExp = xpAt('crime', 'armor', 1);
  assert.deepEqual(rows().map((o) => !!o.dis), [false, true, true], 'a light vest at Booster');
  assert.match(armor.buy(w, A.p, 2, payFrom), /comes at Lieutenant/);
  A.prof.criminalExp = xpAt('crime', 'armor', 3);
  assert.ok(rows().every((o) => !o.dis), 'all at Underboss');
  // the math: hits from the police service pistol to drop someone (after a player's grit), bare and in each vest
  const ped = A.p.ped;
  cop.p.ped.weapon = 'service';
  const hitsToDrop = (t, weapon = 'service') => {
    if (t) armor.buy(w, A.p, t, payFrom); else delete A.prof.armor;
    cop.p.ped.weapon = weapon;
    ped.dead = false; ped.hp = ped.maxHp = 100; ped.downUntil = 0; ped.protectUntil = 0;
    let n = 0;
    while (!ped.dead && n < 50) { combat.damage(w, ped, 20, cop.p.ped, 'gun'); n++; }   // (20: the service pistol's dmg)
    ped.dead = false; ped.hp = 100;
    return n;
  };
  const bare = hitsToDrop(0);
  assert.equal(bare, 7, 'seven service-pistol hits bare (PLAYER_GRIT)');
  const vests = [1, 2, 3].map((t) => hitsToDrop(t));
  assert.deepEqual(vests, [9, 10, 11], 'light, plated, heavy: a few hits more - at most pts more health');
  for (const [i, T] of ARMOR.tiers.entries()) assert.ok(vests[i] - bare <= Math.ceil(T.pts / (20 / 1.4)) + 1, `${T.name}: no power spike`);
  // the marksman rifle (95) still drops someone in the heaviest vest in two
  const sniper = (() => { armor.buy(w, A.p, 3, payFrom); cop.p.ped.weapon = 'psniper'; ped.hp = 100; ped.dead = false; let n = 0; while (!ped.dead && n < 9) { combat.damage(w, ped, 95, cop.p.ped, 'gun'); n++; } ped.dead = false; ped.hp = 100; return n; })();
  assert.equal(sniper, 2, 'rifle rounds go partly through');
  // what it takes, and spent
  delete A.prof.armor; armor.buy(w, A.p, 1, payFrom);
  const T1 = ARMOR.tiers[0];
  ped.hp = 100; cop.p.ped.weapon = 'service';
  combat.damage(w, ped, 14, null, 'gun');
  const took = Math.round((14 / 1.4) * T1.absorb * 100) / 100;
  assert.ok(Math.abs(ped.hp - (100 - (10 - took))) < 0.01, 'a share of the hit taken');
  assert.ok(Math.abs(A.prof.armor.pts - (T1.pts - took)) < 0.01, 'off its points');
  ped.hp = 100;
  combat.damage(w, ped, 30, null, 'explosion');
  assert.ok(Math.abs(A.prof.armor.pts - (T1.pts - took)) < 0.01, 'a blast: the vest doesn\'t take it');
  ped.hp = 100;
  for (let i = 0; i < 12 && A.prof.armor; i++) { ped.hp = 100; combat.damage(w, ped, 14, null, 'gun'); }
  assert.equal(A.prof.armor, undefined, 'spent: gone');
  // the vest on the look (others see it) and the heavy one's slower run
  armor.buy(w, A.p, 3, payFrom);
  const J = decodeLook(ped.app.lk).outfit.jacket;
  assert.ok(J && J.id === byName('Tactical vest'), 'a tactical vest over the clothes (the K9 handler\'s: no new art)');
  assert.notEqual(A.prof.look, ped.app.lk, 'the look on the wire carries the vest; your own look untouched');
  assert.equal(players.pedMods(w, ped).speedMul, ARMOR.tiers[2].slow, 'heavy: a slower run');
  delete A.prof.armor; armor.refreshLook(A.p);
  assert.equal(ped.app.lk, A.prof.look, 'off: your own look');
  // kept with the account; an old save has none
  armor.buy(w, A.p, 2, payFrom);
  const saved = JSON.parse(JSON.stringify(A.prof));
  assert.deepEqual(saved.armor, { t: 2, pts: ARMOR.tiers[1].pts });
  const old = joinPlayer(w);
  assert.equal(armor.worn(old.prof), null);
  assert.equal(players.pedMods(w, old.p.ped).speedMul, 1);
});

test('a K9 partner: at Corporal from the armory; rides in the cruiser; takes a fleeing suspect down and holds them for the cuffs; the cooldown; shaken off', () => {
  const w = world();
  const R = straightRoad(w.map, 1400);
  const cop = joinPlayer(w, { policePts: xpAt('police', 'k9') - 1 });
  cop.p.badge = true;
  assert.match(k9.partnerRefusal(w, cop.p), /comes at Corporal/);
  cop.prof.policePts = xpAt('police', 'k9');
  cop.p.badge = false;
  assert.match(k9.partnerRefusal(w, cop.p), /On-duty/);
  cop.p.badge = true;
  const at = { x: R.x + 200, y: R.y };
  teleport(w, cop.p.ped, at.x, at.y);
  assert.equal(k9.takePartner(w, cop.p), null);
  const dog = k9.partnerOf(w, cop.p);
  assert.ok(dog && dog.k9.mode === 'heel' && !dog.hidden, 'at your heel');
  assert.match(k9.takePartner(w, cop.p), /with you already/);
  // into a police cruiser with you: the K9 unit; out again by it, at heel
  const v = w.spawnVehicle('police', at.x + 40, at.y, 0, {});
  cop.p.ped.vehId = v.id; v.seats[0] = cop.p.ped.id;
  run(w, 0.2);
  assert.ok(dog.hidden && dog.k9.mode === 'ride' && v.k9 === dog.id, 'in the back: the K9 unit');
  cop.p.ped.vehId = 0; v.seats[0] = 0; teleport(w, cop.p.ped, at.x, at.y);
  run(w, 0.2);
  assert.ok(!dog.hidden && dog.k9.mode === 'heel', 'out with you');
  // a wanted suspect on foot down the road: sent, a takedown, held - arrestable
  const crook = joinPlayer(w), crook2 = joinPlayer(w);
  for (const q of [crook, crook2]) { q.p.wanted = 2; q.p.heat = 400; }
  teleport(w, crook.p.ped, at.x + 360, at.y);
  teleport(w, crook2.p.ped, at.x + 3000, at.y);
  let downAt = -1;
  for (let i = 0; i < 20 * 8 && downAt < 0; i++) { crook.p.wanted = 2; w.step(); if (dog.k9.mode === 'hold') downAt = w.time; }
  assert.ok(downAt > 0, 'taken down');
  assert.ok(w.time < crook.p.ped.downUntil, 'held down');
  assert.ok(law.arrestable(w, crook.p.ped), 'cuffable');
  assert.equal(crook.p.ped.hp, crook.p.ped.maxHp, 'non-lethal: not a scratch');
  law.arrest(w, cop.p.ped, crook.p.ped);
  assert.ok(crook.p.custody, 'cuffed');
  w.step();
  assert.equal(dog.k9.mode, 'heel', 'lets go for the cuffs');
  assert.ok(dog.k9.readyAt >= w.time + K9_UNIT.cooldownS - 1, 'the cooldown');
  // another suspect, close: not sent before the cooldown's up
  teleport(w, crook2.p.ped, cop.p.ped.x + 300, cop.p.ped.y);
  teleport(w, dog, cop.p.ped.x + 10, cop.p.ped.y);
  run(w, 2);
  assert.equal(dog.k9.mode, 'heel', 'cooling down');
  w.time = dog.k9.readyAt;
  for (let i = 0; i < 20 * 8 && dog.k9.mode !== 'hold'; i++) { crook2.p.wanted = 2; w.step(); }
  assert.equal(dog.k9.mode, 'hold', 'after the cooldown: sent again');
  // mashing attack shakes it off
  let seq = 1000;
  for (let i = 0; i < K9_UNIT.mash * 2 + 2 && dog.k9.mode === 'hold'; i++) { crook2.p.inputQ.push({ seq: ++seq, bits: i % 2 ? 0 : IN.FIRE, mx: 0, my: 0, aim: 0 }); w.step(); }
  assert.equal(dog.k9.mode, 'heel', 'shaken off');
  assert.ok(w.time >= crook2.p.ped.downUntil, 'up again');
  // off duty: back to the kennels
  cop.p.badge = false;
  w.step();
  assert.ok(dog.removed && !k9.partnerOf(w, cop.p), 'gone with the shift');
});

test('commercial property: shop units let to tenants, at Owner (two) and Landlord (four), rent into the bank each day upkeep bills, not a business slot', () => {
  const w = world();
  const units = biz.sites(w).filter((s) => s.t === 'unit');
  assert.ok(units.length >= 6 && units.length <= COMMERCIAL.max, `units in the city (${units.length})`);
  const others = new Set(biz.sites(w).filter((s) => s.t !== 'unit' && s.poi != null).map((s) => s.poi));
  assert.ok(units.every((s) => !others.has(s.poi) && COMMERCIAL.kinds.includes(w.map.pois[s.poi].kind)), 'shops nobody runs as a business');
  const A = joinPlayer(w, { bank: 2e6, cash: 0, ...bizProf(xpAt('business', 'commercial', 2) - 1) });
  assert.match(biz.buy(w, A.p, units[0]), /comes at Owner/);
  // at the shop's counter: the unit's row
  const opts = []; biz.menuRow(w, A.p, w.map.pois[units[0].poi], opts);
  assert.ok(opts.length === 1 && /commercial property/.test(opts[0].label), 'its row at the counter');
  A.prof.careers.biz = xpAt('business', 'commercial', 2);
  assert.equal(biz.buy(w, A.p, units[0]), null);
  assert.equal(biz.buy(w, A.p, units[1]), null);
  assert.match(biz.buy(w, A.p, units[2]), /You own 2 .* Landlord/, 'two at Owner');
  // not a business slot: a farm still buyable with one allowed
  const farm = biz.sites(w).find((s) => s.t === 'farm');
  assert.equal(biz.buy(w, A.p, farm), null, 'units don\'t count toward the business cap');
  A.prof.careers.biz = xpAt('business', 'commercial', 4);
  assert.equal(biz.buy(w, A.p, units[2]), null, 'more at Landlord');
  biz.sell(w, A.p, farm);
  // the rent, a day later: into the bank (clean money: business XP), the upkeep out
  const mine = [units[0], units[1], units[2]];
  const rent = mine.reduce((t, s) => t + biz.rentOf(s), 0), day = mine.reduce((t, s) => t + upkeep.bizDaily(s), 0);
  assert.equal(biz.rentOf(units[0]), Math.round(units[0].price * COMMERCIAL.rent));
  assert.ok(rent > day * 4, 'rent well over its upkeep');
  const today = dayKey(), at = (d) => (d + 0.5) * 86400e3 + UPKEEP.backDays;
  upkeep.check(w, A.p, at(today));
  const b0 = A.prof.bank, xp0 = A.prof.careers.biz;
  upkeep.check(w, A.p, at(today + 1));
  assert.equal(A.prof.bank - b0, rent - day, 'a day\'s rent in, its upkeep out');
  assert.ok(A.prof.careers.biz > xp0, 'clean money: business XP');
  // days away count (up to UPKEEP.backDays)
  const b1 = A.prof.bank;
  upkeep.check(w, A.p, at(today + 4));
  assert.equal(A.prof.bank - b1, 3 * (rent - day), 'three days away: three days of rent');
  // the Homes app's row; sold back
  const row = biz.listings(w, A.p).mine.find((r) => r.id === units[0].id);
  assert.equal(row.rent, biz.rentOf(units[0]));
  const b2 = A.prof.bank;
  assert.equal(biz.sell(w, A.p, units[0]), null);
  assert.equal(A.prof.bank - b2, Math.round(units[0].price * BIZ.sellBack));
  // kept with the account
  assert.ok(JSON.parse(JSON.stringify(A.prof)).biz[units[1].id].t === 'unit');
});

test('the top of a ladder: Kingpin, Chief, Tycoon over your name for everyone, in gold - kept with its season', () => {
  const w = world();
  const K = joinPlayer(w, { criminalExp: 0 });
  for (let i = 0; i < 25; i++) w.step();   // (cosmetics' first look)
  assert.notEqual((cosmetics.plateOf(K.prof) || {}).t, 'Kingpin', 'no title yet');
  K.prof.criminalExp = CAREERS.crime.ranks[7].xp;
  for (let i = 0; i < 25; i++) w.step();   // (the rank-up: careers.js -> the nameplate looked at again)
  assert.deepEqual(cosmetics.plateOf(K.prof), { t: 'Kingpin', g: 1 }, 'Kingpin over the name, gold');
  assert.deepEqual(descriptor(K.p.ped).np, { t: 'Kingpin', g: 1 }, 'on the wire: everyone sees it');
  // a season's wipe takes the rank: the title kept with its season
  K.prof.criminalExp = 0;
  assert.deepEqual(cosmetics.plateOf(K.prof), { t: `S${SEASON.n} Kingpin`, g: 1 });
  // Chief and Tycoon alike
  const C = joinPlayer(w, { policePts: CAREERS.police.ranks[7].xp }), T = joinPlayer(w, { ...bizProf(CAREERS.business.ranks[7].xp) });
  for (let i = 0; i < 25; i++) w.step();
  assert.equal(cosmetics.plateOf(C.prof).t, 'Chief');
  assert.equal(cosmetics.plateOf(T.prof).t, 'Tycoon');
  // a top reached before the title went over names: put on once, unless another plate's worn
  const O = joinPlayer(w);
  O.prof.cosm = { c: [], pl: [], tops: [{ c: 'crime', s: 0 }], nc: null, tp: null, gifts: { beta: { at: 1, s: 0 } }, sb: [0], bp: [] };
  cosmetics.noteTops(O.prof);
  assert.equal(cosmetics.plateOf(O.prof).t, `S0 Kingpin`);
  O.prof.cosm.tp = null; cosmetics.noteTops(O.prof);
  assert.equal(cosmetics.plateOf(O.prof), null, 'once: taken off, it stays off');
});
