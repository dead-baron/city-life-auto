// Your weapons (the owner, 2026-11-14: "carried guns are at risk, with one stash"; server/systems/arms.js, the numbers:
// shared/rules.js ARMS): what can be lost, the loadout (2 guns, 1 melee, 1 throwable), the stash at home and at a gun shop's or a pawn shop's counter,
// buying straight to the stash, death (each gun a pickup for ARMS.dropS), the arrest (the legal guns to the stash), a gun
// dropped on the ground or handed to a crewmate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { ARMS, GUN_PRICES, DROP_LIFE_S } from '../shared/rules.js';
import { SHOPS, WEAPONS } from '../shared/items.js';
import * as arms from '../server/systems/arms.js';
import * as economy from '../server/systems/economy.js';
import * as cargo from '../server/systems/cargo.js';
import * as combat from '../server/systems/combat.js';
import * as custody from '../server/systems/custody.js';
import * as crews from '../server/systems/crews.js';
import * as players from '../server/systems/players.js';

const gunsNear = (w, x, y, r = 80) => [...w.entities.values()].filter((e) => e.kind === K.BAG && e.gun && Math.hypot(e.x - x, e.y - y) < r);
const optsAt = (w, p, poi) => economy.buildMenu(w, p, poi).opts;
const at = (w, p, poi) => { teleport(w, p.ped, poi.x, poi.y); w.step(); };

test('what can be lost: the guns, anything illegal, the dear blades - not your fists, police issue, or a cheap legal bat or pole', () => {
  for (const id of ['pistol', 'revolver', 'shotgun', 'rifle', 'huntrifle', 'bow', 'smg', 'rocket', 'grenade', 'sword', 'katana', 'plasma']) assert.ok(arms.atRisk(id), `${id} is at risk`);
  for (const id of ['fists', 'bat', 'knife', 'crowbar', 'rod', 'pepper', 'heavyflash', 'huntknife', 'service', 'prifle', 'taser', 'baton', 'spikes']) assert.ok(!arms.atRisk(id), `${id} stays with you`);
  assert.ok(arms.shopPrice('sledge') <= ARMS.keepMax && !arms.atRisk('sledge'));
  assert.ok(!arms.stashable('fists') && !arms.stashable('service') && arms.stashable('bat') && arms.stashable('pistol'));
  // the basic pistol: cheap now it can be lost
  assert.equal(SHOPS.gunshop.buy.find((o) => o.id === 'pistol').price, GUN_PRICES.pistol);
  assert.equal(SHOPS.pawn.buy.find((o) => o.id === 'pistol').price, GUN_PRICES.pawnPistol);
  assert.ok(GUN_PRICES.pistol <= 300 && GUN_PRICES.pawnPistol < GUN_PRICES.pistol);
});

test('down: each gun falls where you lay, a pickup anyone can take for ARMS.dropS; you wake with your fists and your bat', () => {
  const w = makeWorld();
  const a = joinPlayer(w), b = joinPlayer(w);
  a.prof.weapons = { fists: 0, pistol: 30, shotgun: 12, bat: 0 };
  a.p.ped.mag.pistol = 12; a.p.ped.weapon = 'pistol';
  const x = a.p.ped.x, y = a.p.ped.y;
  combat.damage(w, a.p.ped, 99999, null, 'crash', 0);
  assert.deepEqual(Object.keys(a.prof.weapons).sort(), ['bat', 'fists']);
  assert.equal(a.p.ped.weapon, 'fists');
  const guns = gunsNear(w, x, y);
  assert.deepEqual(guns.map((g) => g.gun).sort(), ['pistol', 'shotgun']);
  const pg = guns.find((g) => g.gun === 'pistol');
  assert.match(cargo.bagLabel(pg, b.p), /^Pick up the Pistol/);
  assert.match(cargo.bagLabel(pg, a.p), /^Pick up your Pistol/);
  // someone else takes the pistol, rounds and all
  teleport(w, b.p.ped, pg.x, pg.y);
  cargo.lootBag(w, b.p, pg);
  assert.equal(b.prof.weapons.pistol, 30);
  assert.equal(b.p.ped.mag.pistol, 12, 'a full magazine out of them');
  assert.ok(!w.get(pg.id), 'off the ground');
  // the other blinks at the end, then it's gone
  const sg = guns.find((g) => g.gun === 'shotgun');
  assert.ok(!cargo.bagBlinks(w, sg));
  run(w, ARMS.dropS - ARMS.blinkS + 1);
  assert.ok(w.get(sg.id) && cargo.bagBlinks(w, sg), 'blinking in its last seconds');
  run(w, ARMS.blinkS);
  assert.ok(!w.get(sg.id), 'gone after about a minute');
});

test('the loadout (ARMS.carry): 2 guns, 1 melee, 1 throwable - a new one of a full kind sends the one in hand, else the oldest, to the stash', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 20000 });
  const gun = w.map.pois.find((q) => q.kind === 'gunshop');
  at(w, p, gun);
  assert.deepEqual(ARMS.carry, { gun: 2, melee: 1, throw: 1 });
  assert.equal(arms.classOf('bow'), 'gun'); assert.equal(arms.classOf('rocket'), 'gun'); assert.equal(arms.classOf('sword'), 'melee');
  assert.equal(arms.classOf('grenade'), 'throw'); assert.equal(arms.classOf('bat'), null); assert.equal(arms.classOf('service'), null);
  prof.weapons = { fists: 0, bat: 0, rod: 0, revolver: 10, shotgun: 12, sword: 0, grenade: 3 };
  assert.ok(arms.full(prof, 'gun') && arms.full(prof, 'melee') && arms.full(prof, 'throw'));
  // bought with the guns full, the shotgun in hand: the shotgun to the stash
  combat.selectWeapon(w, p.ped, 'shotgun');
  const row = optsAt(w, p, gun).find((o) => o.id === `w:pistol:${GUN_PRICES.pistol}`);
  assert.match(row.note, /swaps one/);
  economy.handleMenu(w, p, gun.id, row.id);
  assert.ok(prof.weapons.pistol > 0 && prof.weapons.shotgun === undefined && prof.stash.weapons.shotgun === 12, 'the one in hand went to the stash, rounds and all');
  assert.equal(arms.ofClass(prof, 'gun').length, 2);
  // picked up with your fists out: the oldest gun (the revolver) goes
  combat.selectWeapon(w, p.ped, 'fists');
  cargo.lootBag(w, p, arms.dropAt(w, p.ped.x + 10, p.ped.y, 'varmint', 20));
  assert.ok(prof.weapons.varmint === 20 && prof.weapons.revolver === undefined && prof.stash.weapons.revolver === 10, 'the oldest to the stash');
  assert.deepEqual(arms.ofClass(prof, 'gun').sort(), ['pistol', 'varmint']);
  // the other kinds on their own: a katana swaps for the sword, the bat and the rod don't count
  cargo.lootBag(w, p, arms.dropAt(w, p.ped.x + 10, p.ped.y, 'katana', 0));
  assert.ok(prof.weapons.katana === 0 && prof.weapons.sword === undefined && prof.weapons.bat === 0 && prof.weapons.rod === 0);
  // out of the stash with the guns full: a swap too
  economy.handleMenu(w, p, gun.id, 'stash');
  economy.handleMenu(w, p, gun.id, 'htw:shotgun');
  assert.ok(prof.weapons.shotgun === 12 && arms.ofClass(prof, 'gun').length === 2);
  // the upgrades to come raise a kind, up to its cap
  prof.carryUp = { gun: 9 };
  assert.equal(arms.carryOf(prof, 'gun'), ARMS.carryMax.gun);
});

test('a loadout from before the limit keeps its extras - until the stash: trimmed there, the one in hand and the newest kept', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.weapons = { fists: 0, pistol: 12, revolver: 6, rifle: 20, smg: 30, grenade: 2, sword: 0, katana: 0 };
  combat.selectWeapon(w, p.ped, 'pistol');
  w.step();
  assert.equal(arms.ofClass(prof, 'gun').length, 4, 'kept as it was');
  const pawn = w.map.pois.find((q) => q.kind === 'pawn');
  at(w, p, pawn);
  economy.handleMenu(w, p, pawn.id, 'stash');
  assert.deepEqual(arms.ofClass(prof, 'gun').sort(), ['pistol', 'smg'], 'the one in hand and the newest');
  assert.deepEqual(arms.ofClass(prof, 'melee'), ['katana']);
  assert.ok(prof.stash.weapons.revolver === 6 && prof.stash.weapons.rifle === 20 && prof.stash.weapons.sword === 0, 'the rest in the stash');
});

test('the stash at a gun shop and a pawn shop: put away, take out, buy straight to it (several), ammo for one in it', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 20000 });
  const gun = w.map.pois.find((q) => q.kind === 'gunshop'), pawn = w.map.pois.find((q) => q.kind === 'pawn');
  at(w, p, gun);
  assert.ok(optsAt(w, p, gun).some((o) => o.id === 'stash'), 'Your stash at the gun shop');
  // to the stash: the revolver and the rifle, one after the other
  for (const id of ['revolver', 'rifle']) {
    const row = optsAt(w, p, gun).find((o) => o.id.startsWith(`w:${id}:`) && o.id.endsWith(':s'));
    assert.ok(row && /to your stash/.test(row.label), `${id}: a to-stash line`);
    economy.handleMenu(w, p, gun.id, row.id);
  }
  assert.equal(prof.weapons.revolver, undefined, 'not in your hands');
  assert.equal(prof.stash.weapons.revolver, WEAPONS.revolver.mag * 2);
  assert.ok(prof.stash.weapons.rifle > 0);
  assert.ok(optsAt(w, p, gun).find((o) => o.id.startsWith('w:rifle:') && o.id.endsWith(':s')).dis, 'one in the stash: not again');
  // its ammunition: into the stash with it
  const am = optsAt(w, p, gun).find((o) => o.id.startsWith('a:rifle:'));
  assert.ok(!am.dis && /stash/.test(am.note));
  const had = prof.stash.weapons.rifle;
  economy.handleMenu(w, p, gun.id, am.id);
  assert.ok(prof.stash.weapons.rifle > had);
  // the stash's own menu: take the revolver out, put the rifle... it's there; open it at the pawn shop
  at(w, p, pawn);
  economy.handleMenu(w, p, pawn.id, 'stash');
  const m = economy.buildMenu(w, p, pawn);
  assert.equal(m.title, 'Your stash');
  assert.ok(m.opts.some((o) => o.id === 'htw:revolver') && m.opts.some((o) => o.id === 'htw:rifle'));
  economy.handleMenu(w, p, pawn.id, 'htw:revolver');
  assert.ok(prof.weapons.revolver > 0 && prof.stash.weapons.revolver === undefined, 'out of the stash, in your hands');
  economy.handleMenu(w, p, pawn.id, 'hsw:revolver');
  assert.ok(prof.weapons.revolver === undefined && prof.stash.weapons.revolver > 0, 'and back');
  economy.handleMenu(w, p, pawn.id, 'stback');
  assert.notEqual(economy.buildMenu(w, p, pawn).title, 'Your stash', 'back at the counter');
  // a counter that isn't one: no stash
  const sports = w.map.pois.find((q) => q.kind === 'sports');
  if (sports) { at(w, p, sports); assert.ok(!optsAt(w, p, sports).some((o) => o.id === 'stash')); }
  // the nearest place to open it (the phone's Find my weapons does the same on the page)
  const near = arms.nearestStashPlace(w, [], pawn.x + 5, pawn.y);
  assert.ok(near && Math.hypot(near.x - pawn.x, near.y - pawn.y) < 1, 'the pawn shop by you');
  const home = { x: pawn.x + 3, y: pawn.y, name: 'Your flat' };
  assert.equal(arms.nearestStashPlace(w, [home], pawn.x + 5, pawn.y).label, 'Your flat', 'or a home of yours');
});

test('busted: the illegal guns taken for good, the legal ones to your stash after the fine', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 500 });
  prof.weapons = { fists: 0, smg: 60, pistol: 24, bat: 0 };
  p.ped.mag.smg = 30; p.ped.mag.pistol = 12;
  p.heat = 15; p.wanted = 1;
  custody.surrender(w, p);
  assert.ok(p.custody && p.custody.stage === 'cell', 'booked');
  assert.equal(prof.weapons.smg, undefined, 'the SMG taken');
  assert.equal((prof.stash.weapons || {}).smg, undefined, '...for good');
  assert.equal(prof.weapons.pistol, undefined, 'the pistol not in your hands');
  assert.equal(prof.stash.weapons.pistol, 24, 'but in your stash');
  assert.equal(prof.weapons.bat, 0, 'the bat kept');
});

test('a gun dropped for anyone, a gun handed to a crewmate: the same pickup', () => {
  const w = makeWorld();
  const a = joinPlayer(w), b = joinPlayer(w);
  a.prof.weapons.pistol = 20; a.p.ped.mag.pistol = 12;
  a.prof.weapons.rifle = 40;
  // not a crewmate: no
  teleport(w, b.p.ped, a.p.ped.x + 40, a.p.ped.y);
  assert.match(arms.handTo(w, a.p, 'pistol'), /No crewmate/);
  // into a crew together (crews.js: asked in, and yes): then the hand-over
  crews.askPrompt(w, a.p).run();
  crews.joinPrompt(w, b.p).run();
  assert.ok(crews.mates(a.p, b.p));
  assert.equal(arms.handTo(w, a.p, 'pistol'), null);
  assert.equal(a.prof.weapons.pistol, undefined);
  assert.equal(b.prof.weapons.pistol, 20, 'theirs, rounds and all');
  assert.ok(!gunsNear(w, b.p.ped.x, b.p.ped.y).length, 'taken there and then: nothing left on the ground');
  teleport(w, b.p.ped, a.p.ped.x + ARMS.giveR + 60, a.p.ped.y);
  assert.match(arms.handTo(w, a.p, 'rifle'), /close enough/);
  // dropped from the bag: a pickup at your feet, DROP_LIFE_S
  assert.equal(cargo.dropItem(w, a.p, 'rifle', 1, true), null);
  const bag = gunsNear(w, a.p.ped.x, a.p.ped.y, 60)[0];
  assert.ok(bag && bag.gun === 'rifle' && bag.weapons.rifle === 40 && Math.abs(bag.expires - w.time - DROP_LIFE_S) < 0.2);
  cargo.lootBag(w, a.p, bag);
  assert.equal(a.prof.weapons.rifle, 40, 'picked back up');
  assert.ok(players.buildMe(w, a.p).weapons.some((q) => q.id === 'rifle'));
});

test('the Guide teaches it from the data: Your stash, Getting your car, Knocked down, Busted', async () => {
  const { guideSections } = await import('../shared/guide.js');
  const { VALET } = await import('../shared/rules.js');
  const entry = (S, sec, id) => S.find((s) => s.id === sec).entries.find((e) => e.id === id);
  const was = { gun: ARMS.carry.gun, dropS: ARMS.dropS, fee: VALET.fee };
  try {
    ARMS.carry.gun = 3; ARMS.dropS = 45; VALET.fee = 77;
    const S = guideSections();
    assert.match(entry(S, 'items', 'stash').b, /You carry 3 guns/);
    assert.match(entry(S, 'law', 'down').b, /for 45 seconds/);
    assert.match(entry(S, 'law', 'busted').b, /legal guns sent to your stash/);
    assert.match(entry(S, 'around', 'mycar').b, /for \$77/);
  } finally { ARMS.carry.gun = was.gun; ARMS.dropS = was.dropS; VALET.fee = was.fee; }
});
