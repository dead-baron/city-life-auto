// Cooking at home (the owner, 10-06: "Home life: mowing (grass grows), cooking"): at the fridge, three things from it -
// the plainest first: fruit, the garden's crops, mushrooms, game - go into a Home-cooked Meal at the stove (a few
// seconds standing there), back in the fridge when it's done: +60 health, hearty. Never a meal already cooked nor a
// prize crop; not as someone's guest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { HOME_IN } from '../shared/rules.js';
import { ITEMS } from '../shared/items.js';
import * as economy from '../server/systems/economy.js';
import * as homes from '../server/systems/homes.js';
import * as homeinside from '../server/systems/homeinside.js';

const lastMenu = (conn) => [...conn.sent].reverse().find((m) => m && m.t === 'menu');
test('three things from the fridge into a Home-cooked Meal', () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { bank: 1e6 });
  const h = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id));
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, w.map.pois.find((q) => q.kind === 'home' && q.home === h.id).id, 'hbuy');
  homes.goInside(w, p, h);
  prof.stash = { items: { apple: 2, orange: 1, venisonSteak: 1, prize_tomato: 1 }, weapons: {} };
  homeinside.openMenu(w, p, 'fridge');
  const m = lastMenu(conn), cook = m.opts.find((o) => o.id === 'hi:cook');
  assert.ok(cook && /Crisp Apple, Crisp Apple, Sweet Orange/.test(cook.label), `the plainest three (${cook && cook.label})`);
  economy.handleMenu(w, p, m.poi, 'hi:cook');
  assert.equal(prof.stash.items.apple, 0); assert.equal(prof.stash.items.orange, 0);
  assert.equal(prof.stash.items.venisonSteak, 1, 'the steak kept'); assert.equal(prof.stash.items.prize_tomato, 1, 'the prize crop kept');
  assert.ok(p.ped.home.cook > w.time, 'at the stove');
  assert.match(homeinside.interaction(w, p).label, /Cooking/);
  run(w, HOME_IN.cookS + 0.5);
  assert.equal(prof.stash.items.homeMeal, 1, 'dinner\'s ready, in the fridge');
  assert.ok(!p.ped.home.cook);
  // eaten: +60, hearty
  p.ped.hp = 20;
  homeinside.openMenu(w, p, 'fridge');
  economy.handleMenu(w, p, lastMenu(conn).poi, 'hi:eat:homeMeal');
  assert.ok(p.ped.hp >= 20 + ITEMS.homeMeal.heal, `+60 health and hearty (${p.ped.hp})`);
  assert.equal(prof.stash.items.homeMeal, 0);
  // two left: not enough to cook
  homeinside.openMenu(w, p, 'fridge');
  assert.ok(!lastMenu(conn).opts.some((o) => o.id === 'hi:cook') && lastMenu(conn).opts.some((o) => o.id === 'hi:nocook' && o.dis), 'not with two things');
});
