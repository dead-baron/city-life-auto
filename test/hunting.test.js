// Hunting (server/systems/hunting.js): drop a deer with the hunting rifle and field dress it (a perfect hide with a
// Hunting Knife, a torn one without); how it was taken decides what it's worth; the young, the protected sea otters
// and the legends; the silent bow (arrows come back from the carcass, and can be picked up where they fell); a
// wounded animal bleeds out and beds down; cook the meat over a campfire for a hearty meal; sell at the lodge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { SHOPS, ITEMS, WEAPONS } from '../shared/items.js';
import { HUNT_DRESS_S, HUNT_COOK_S, WARDEN_FINE, HEARTY_HP, HEARTY_S } from '../shared/rules.js';
import { K } from '../shared/constants.js';
import { spawnAnimal } from '../server/systems/wildlife.js';
import * as combat from '../server/systems/combat.js';
import * as economy from '../server/systems/economy.js';

// open ground in Highland Woods near the Giants Loop
function wildSpot(w) {
  const s = w.map.natureSites.find((q) => q.name === 'Giants Loop');
  return { x: s.x + 260, y: s.y - 300 };
}
// a clear line east of (x, y): no trunk or rock in the way of a shot
function clearLane(w, x, y, len = 700) { for (const arr of w.map.solidProps.values()) for (const e of arr) if (Math.abs(e.y - y) < 60 && e.x > x - 40 && e.x < x + len) e.off = true; }
function hunter(w, kit = ['huntrifle', 'huntknife']) {
  const { p } = joinPlayer(w);
  const at = wildSpot(w);
  teleport(w, p.ped, at.x, at.y);
  clearLane(w, at.x, at.y);
  for (const id of kit) { const W = WEAPONS[id]; p.profile.weapons[id] = W.mag ? W.mag * 2 : 0; if (W.mag) p.ped.mag[id] = W.mag; }
  return { p, at };
}
// shoot east with weapon id until `until()` (or a few seconds)
function shootEast(w, p, id, until) {
  p.ped.weapon = id; p.ped.a = 0;
  for (let i = 0; i < 80 && !until(); i++) { p.ped.lastShot = -99; combat.tryAttack(w, p.ped, 0); run(w, 0.1); }
}
// stand over the carcass and dress it; returns the prompt's label
function dressIt(w, p, c) {
  teleport(w, p.ped, c.x - 20, c.y);
  const act = players.findInteraction(w, p);
  assert.ok(act, 'a prompt over the carcass');
  act.run();
  run(w, HUNT_DRESS_S * 2 + 0.5);
  return act.label;
}

test('the hunting rifle drops a deer in one shot: dressed with a hunting knife, a perfect hide; without one, a torn hide and less meat', () => {
  const w = makeWorld();
  const { p, at } = hunter(w);
  const deer = spawnAnimal(w, 'deer', at.x + 160, at.y);
  assert.ok(WEAPONS.huntrifle.dmg >= deer.hp, 'one clean shot');
  shootEast(w, p, 'huntrifle', () => deer.dead);
  assert.ok(deer.dead, 'the deer is down');
  assert.equal(p.wanted, 0, 'hunting in the wilds is no crime');
  const label = dressIt(w, p, deer);
  assert.match(label, /Field dress the .*deer/);
  const inv = p.profile.inventory;
  assert.ok(inv.venison >= 3 && inv.venison <= 5, `venison (${inv.venison})`);
  assert.equal(inv.deerHide_3, 1, 'a perfect hide: one clean shot from the right gun, skinned with the right knife');
  assert.ok(!w.get(deer.id), 'the carcass is gone');
  // no knife: the hide's torn a grade, less meat
  delete p.profile.weapons.huntknife;
  const d2 = spawnAnimal(w, 'deer', p.ped.x + 160, p.ped.y);
  clearLane(w, p.ped.x, p.ped.y);
  shootEast(w, p, 'huntrifle', () => d2.dead);
  dressIt(w, p, d2);
  assert.equal(inv.deerHide, 1, 'a good (not perfect) hide without a hunting knife');
  assert.ok(inv.venison >= 3 + 2 && inv.venison <= 5 + 4, `less venison (${inv.venison})`);
  assert.ok(ITEMS.deerHide_3.sell > ITEMS.deerHide.sell && ITEMS.deerHide.sell > ITEMS.deerHide_1.sell, 'perfect > good > poor');
});

test('how it was taken: three pistol shots tear the hide; roadkill has spoiled; the young, the protected and the legends', () => {
  const w = makeWorld();
  const { p, at } = hunter(w, ['pistol', 'huntknife']);
  const inv = p.profile.inventory;
  // shot up with a pistol (three hits to bring it down): a poor hide
  const deer = spawnAnimal(w, 'deer', at.x + 120, at.y);
  p.ped.weapon = 'pistol';
  for (let k = 0; k < 3 && !deer.dead; k++) combat.damage(w, deer, k < 2 ? 20 : 99, p.ped, 'gun', 0);
  assert.ok(deer.dead && deer.wild.hits.length === 3, `down after ${deer.wild.hits.length} shots`);
  assert.equal(deer.wild.grade, 1, 'three pistol holes: a poor hide');
  dressIt(w, p, deer);
  assert.equal(inv.deerHide_1, 1, 'a pistol is too little gun for a deer');
  assert.ok(!inv.deerHide_3);
  // roadkill: no meat, a poor hide
  const meat0 = inv.venison || 0, rk = spawnAnimal(w, 'deer', p.ped.x + 60, p.ped.y);
  rk.hp = 0; rk.dead = true; rk.deadAt = w.time; rk.wild.roadkill = true; rk.wild.grade = 1; rk.wild.hits = [{ c: 'vehicle' }];
  dressIt(w, p, rk);
  assert.equal(inv.venison || 0, meat0, 'the meat has spoiled');
  assert.ok(inv.deerHide_1 >= 1, 'a poor hide');
  // a fawn: nothing worth taking
  const fawn = spawnAnimal(w, 'deer', p.ped.x + 60, p.ped.y, 0, { young: true });
  combat.damage(w, fawn, 999, p.ped, 'gun');
  teleport(w, p.ped, fawn.x - 20, fawn.y);
  assert.match(players.findInteraction(w, p).label, /young/);
  w.remove(fawn);
  // a sea otter is protected: the wardens' fine
  p.profile.cash = 2000; p.profile.bank = 0;
  const otter = spawnAnimal(w, 'seaotter', p.ped.x + 40, p.ped.y);
  combat.damage(w, otter, 999, p.ped, 'gun');
  assert.equal(p.profile.cash, 2000 - WARDEN_FINE, 'fined');
  teleport(w, p.ped, otter.x - 20, otter.y);
  assert.match(players.findInteraction(w, p).label, /protected/);
  w.remove(otter);
  // the legend: its own pelt, and the trophy
  const hart = spawnAnimal(w, 'deer', p.ped.x + 60, p.ped.y, 0, { legend: true });
  assert.match(hart.d ? '' : hart.archetype, /:L$/, 'drawn as the legend');
  assert.ok(hart.maxHp > 60, 'tougher');
  combat.damage(w, hart, 999, p.ped, 'gun');
  const label = dressIt(w, p, hart);
  assert.match(label, /White Hart/);
  assert.equal(inv.legend_deer, 1, 'the legendary pelt');
  assert.ok(inv.antlers >= 1, 'and its antlers');
  assert.ok(ITEMS.legend_deer.sell > ITEMS.deerHide_3.sell * 3, 'worth a great deal');
});

test('the bow: no gunshot for the animals to hear; the arrow comes back from the carcass; a miss can be picked up', () => {
  const w = makeWorld();
  const { p, at } = hunter(w, ['bow', 'huntknife']);
  const arrows0 = p.profile.weapons.bow;
  const deer = spawnAnimal(w, 'deer', at.x + 220, at.y);
  const shots0 = w.shotLog.length;
  shootEast(w, p, 'bow', () => deer.dead);
  assert.ok(deer.dead, 'one arrow drops a deer');
  assert.equal(w.shotLog.length, shots0, 'silent: nothing logged as a gunshot');
  assert.equal(deer.wild.grade, 3, 'a clean arrow kill: a perfect hide');
  const after = p.profile.weapons.bow;
  assert.ok(after < arrows0, 'arrows used');
  dressIt(w, p, deer);
  assert.equal(p.profile.weapons.bow, after + deer.arrows, 'the arrow back from the carcass');
  // a miss into open ground: it lies there; walk over it to pick it up
  run(w, 1);
  const n0 = p.profile.weapons.bow;
  p.ped.weapon = 'bow'; p.ped.mag.bow = 1; p.ped.reloadUntil = 0;
  combat.tryAttack(w, p.ped, Math.PI / 2);
  run(w, 1.5);
  assert.equal(p.profile.weapons.bow, n0 - 1);
  const lying = (w.arrows || []).find((a) => a.owner === p.ped.id);
  assert.ok(lying, 'the arrow lies where it came down');
  teleport(w, p.ped, lying.x, lying.y);
  run(w, 0.3);
  assert.equal(p.profile.weapons.bow, n0, 'picked up again');
});

test('a wounded elk bleeds, beds down, and dies of it; its hide is still graded by the arrow', () => {
  const w = makeWorld();
  const { p, at } = hunter(w, ['bow']);
  teleport(w, p.ped, at.x - 900, at.y);
  const elk = spawnAnimal(w, 'elk', at.x, at.y);
  combat.damage(w, elk, 100, p.ped, 'arrow');
  elk.bleeding = true;
  assert.ok(!elk.dead && elk.hp < elk.maxHp);
  let rested = false;
  for (let i = 0; i < 90 && !elk.dead; i++) { run(w, 0.5); if (elk.wild.state === 'rest') rested = true; }
  assert.ok(rested, 'it bedded down once weak');
  assert.ok(elk.dead, 'and bled out');
  assert.equal(elk.wild.grade, 3, 'one arrow: still a perfect hide');
});

test('livestock is not game; cook raw meat over a lit campfire into a hearty meal; the lodge buys meat, hides and antlers best', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = wildSpot(w);
  teleport(w, p.ped, at.x, at.y);
  const cow = spawnAnimal(w, 'cow', at.x + 20, at.y);
  cow.hp = 0; cow.dead = true; cow.deadAt = w.time;
  const act = players.findInteraction(w, p);
  assert.ok(act && /livestock/.test(act.label), `a cow is not game (${act && act.label})`);
  w.remove(cow);
  // cook at a campfire
  const fire = w.map.props.find((q) => q && q.t === 'campfire' && q.lit);
  assert.ok(fire, 'a lit campfire');
  p.profile.inventory.venison = 4; p.profile.inventory.rabbitMeat = 1; p.profile.inventory.elkMeat = 2;
  teleport(w, p.ped, fire.x + 24, fire.y + 10);
  const cookAct = players.findInteraction(w, p);
  assert.ok(cookAct && /Cook your meat/.test(cookAct.label), `the prompt (${cookAct && cookAct.label})`);
  cookAct.run();
  run(w, HUNT_COOK_S + 0.5);
  assert.equal(p.profile.inventory.venisonSteak, 4, 'venison steaks');
  assert.equal(p.profile.inventory.rabbitRoast, 1, 'roast rabbit');
  assert.equal(p.profile.inventory.elkSteak, 2, 'elk steaks');
  assert.ok(!p.profile.inventory.venison, 'no raw meat left');
  // a hearty meal: health, and more of it for a while
  p.ped.hp = 60;
  economy.useItem(w, p, 'venisonSteak');
  assert.equal(p.ped.maxHp, 100 + HEARTY_HP, 'built up');
  assert.ok(p.ped.hp > 60 + ITEMS.venisonSteak.heal - 1, 'and healed');
  run(w, HEARTY_S + 1);
  assert.equal(p.ped.maxHp, 100, 'it wears off');
  assert.ok(p.ped.hp <= 100);
  // sell at the lodge
  const lodge = w.map.pois.find((q) => q.counter && q.kind === 'lodge');
  assert.ok(lodge, 'the lodge counter');
  p.profile.inventory.deerHide = 2; p.profile.inventory.antlers = 1;
  teleport(w, p.ped, lodge.x, lodge.y + 6);
  const la = players.findInteraction(w, p);
  assert.ok(la && /Hunting Lodge/.test(la.label), `the lodge prompt (${la && la.label})`);
  const bank0 = p.profile.bank;
  economy.openMenu(w, p, lodge);
  economy.handleMenu(w, p, lodge.id, 's:deerHide');
  economy.handleMenu(w, p, lodge.id, 's:antlers');
  assert.equal(p.profile.bank - bank0, 2 * SHOPS.lodge.sellPrice.deerHide + SHOPS.lodge.sellPrice.antlers, 'paid for the hides and the antlers');
  assert.ok(SHOPS.lodge.sellPrice.deerHide > ITEMS.deerHide.sell, 'the lodge pays best');
  for (const id of ['huntrifle', 'bow', 'huntknife', 'varmint']) assert.ok(SHOPS.lodge.buy.some((o) => o.kind === 'weapon' && o.id === id), `the lodge sells the ${id}`);
  assert.ok(SHOPS.lodge.buy.some((o) => o.kind === 'ammo' && o.id === 'bow'), 'and arrows');
  void K;
});

test('the hunting country: camps, trappers and butchers where their game lives; the bench makes clothing and arrows; beaver ponds', async () => {
  const { wildStyle, habitatAt } = await import('../server/systems/wildlife.js');
  const w = makeWorld();
  const m = w.map;
  for (const kind of ['lodge', 'huntcamp', 'trapper', 'butcher']) {
    const list = m.pois.filter((q) => q.counter && q.kind === kind);
    assert.ok(list.length >= 1, `a ${kind}`);
    for (const q of list) assert.ok(wildStyle(m, q.x, q.y) || (m.beaverPonds || []).some((b) => Math.hypot(b.x - q.x, b.y - q.y) < 1500), `${q.label} is out in the country (or by a beaver pond)`);
  }
  assert.ok(m.pois.filter((q) => q.kind === 'huntcamp').length >= 2 && m.pois.filter((q) => q.kind === 'trapper').length >= 2, 'camps and trappers in more than one place');
  // the trapper's bench: buckskin from three hides (the poor ones go first), arrows from feathers
  const { p } = joinPlayer(w);
  const tr = m.pois.find((q) => q.kind === 'trapper');
  teleport(w, p.ped, tr.x, tr.y + 6);
  const inv = p.profile.inventory;
  inv.deerHide_1 = 2; inv.deerHide_3 = 2; inv.duckFeathers = 2; p.profile.weapons.bow = 3;
  economy.openMenu(w, p, tr);
  economy.handleMenu(w, p, tr.id, 'craft:buckskinJacket');
  assert.equal(inv.buckskinJacket, 1, 'a buckskin jacket');
  assert.ok(!inv.deerHide_1 && inv.deerHide_3 === 1, 'made from the poor hides first');
  economy.handleMenu(w, p, tr.id, 'craft:arrows');
  assert.equal(p.profile.weapons.bow, 11, 'eight arrows fletched');
  assert.ok(SHOPS.clothing.sellPrice.buckskinJacket > ITEMS.buckskinJacket.sell, 'the city clothing shops pay best for it');
  // beaver ponds: dammed, a lodge in the pond, gnawed trees round about; beavers' country
  assert.ok((m.beaverPonds || []).length >= 3, 'beaver ponds');
  for (const b of m.beaverPonds) {
    const near = (t, r) => m.props.some((q) => q && q.t === t && Math.hypot(q.x - b.x, q.y - b.y) < r);
    assert.ok(near('beaverdam', 260) && near('lodge', 260), `${b.name || 'Heron Marsh'}: a dam and a lodge`);
    assert.ok(b.trees.length >= 4 && m.props.some((q) => q && (q.t === 'gnawstump' || q.t === 'gnawlog') && Math.hypot(q.x - b.x, q.y - b.y) < 400), 'trees the beavers have been at');
    assert.ok(habitatAt(m, b.x, b.y).beaver, 'beaver country');
  }
});

test('debug menu: Give Weapons gives every weapon in the game; the hunting kit; animals spawned on demand', async () => {
  const dev = await import('../server/dev.js');
  const { animals } = await import('../server/systems/wildlife.js');
  const w = makeWorld();
  const { p, at } = hunter(w, []);
  dev.command(w, p, 'guns', {});
  for (const [id, W] of Object.entries(WEAPONS)) if (id !== 'fists' && W.type !== 'deploy') assert.ok(p.profile.weapons[id] !== undefined, `Give Weapons: ${W.name}`);
  dev.command(w, p, 'hunt', {});
  assert.equal(p.ped.weapon, 'bow');
  assert.ok(p.profile.weapons.bow >= 12 && p.profile.inventory.camoCloak === 1, 'a quiver of arrows and the cloak');
  for (const k of ['deer', 'blackbear', 'quail', 'duck', 'beaver']) {
    const n0 = animals(w).length;
    dev.command(w, p, 'animal', { k });
    assert.ok(animals(w).length > n0, `a ${k} spawned`);
  }
  dev.command(w, p, 'animal', { k: 'deer', legend: 1, single: 1 });
  assert.ok(animals(w).some((e) => e.wild.legend), 'a legend on demand');
  dev.command(w, p, 'animal', { k: 'cougar', stalk: 1 });
  assert.ok(animals(w).some((e) => e.wild.kind === 'cougar' && e.wild.state === 'stalk' && e.wild.stalkOf === p.ped.id), 'a lion on your trail');
  void at;
});
