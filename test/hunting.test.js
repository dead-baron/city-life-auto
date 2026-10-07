// Hunting (server/systems/hunting.js): drop a deer with the hunting rifle, field dress it for venison and a hide,
// cook the venison over a campfire, sell what you brought in at the Highland Hunting Lodge. Livestock isn't game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { SHOPS, ITEMS, WEAPONS } from '../shared/items.js';
import { HUNT_DRESS_S, HUNT_COOK_S } from '../shared/rules.js';
import { spawnAnimal } from '../server/systems/wildlife.js';
import * as combat from '../server/systems/combat.js';
import * as economy from '../server/systems/economy.js';

// open ground in Highland Woods near the Giants Loop
function wildSpot(w) {
  const s = w.map.natureSites.find((q) => q.name === 'Giants Loop');
  return { x: s.x + 260, y: s.y - 300 };
}

test('the hunting rifle drops a deer in one shot; field dress it for venison and a hide; the carcass is gone after', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = wildSpot(w);
  teleport(w, p.ped, at.x, at.y);
  p.profile.weapons.huntrifle = 5; p.ped.weapon = 'huntrifle'; (p.ped.mag ||= {}).huntrifle = 5;
  const deer = spawnAnimal(w, 'deer', at.x + 160, at.y);
  assert.ok(WEAPONS.huntrifle.dmg >= deer.hp, 'one clean shot');
  p.ped.a = 0; p.ped.lastShot = -99;
  combat.tryAttack(w, p.ped, 0);
  run(w, 0.5);
  assert.ok(deer.dead, 'the deer is down');
  teleport(w, p.ped, deer.x - 20, deer.y);
  const act = players.findInteraction(w, p);
  assert.ok(act && /Field dress the deer/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  run(w, HUNT_DRESS_S + 0.5);
  const inv = p.profile.inventory;
  assert.ok(inv.venison >= 3 && inv.venison <= 5, `venison (${inv.venison})`);
  assert.equal(inv.deerHide, 1, 'a hide');
  assert.ok(!w.get(deer.id), 'the carcass is gone');
});

test('livestock is not game; cook raw meat over a lit campfire; the lodge buys meat, hides and antlers best', () => {
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
  p.profile.inventory.venison = 4; p.profile.inventory.rabbitMeat = 1;
  teleport(w, p.ped, fire.x + 24, fire.y + 10);
  const cookAct = players.findInteraction(w, p);
  assert.ok(cookAct && /Cook your meat/.test(cookAct.label), `the prompt (${cookAct && cookAct.label})`);
  cookAct.run();
  run(w, HUNT_COOK_S + 0.5);
  assert.equal(p.profile.inventory.venisonSteak, 4, 'venison steaks');
  assert.equal(p.profile.inventory.rabbitRoast, 1, 'roast rabbit');
  assert.ok(!p.profile.inventory.venison, 'no raw meat left');
  assert.ok(ITEMS.venisonSteak.food && ITEMS.venisonSteak.heal > 0, 'real food');
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
  assert.ok(SHOPS.lodge.buy.some((o) => o.kind === 'weapon' && o.id === 'huntrifle'), 'the lodge sells the rifle');
});
