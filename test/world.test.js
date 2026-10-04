// Dealership lots and driving out of your home garage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { HIDE_TIME_S } from '../shared/rules.js';
import * as economy from '../server/systems/economy.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as players from '../server/systems/players.js';
import * as homes from '../server/systems/homes.js';

test('dealership lot: cars in stock with price tags; walk up and buy one on the spot', () => {
  const w = makeWorld();
  const lot = w.map.dealerLots[0];
  assert.ok(lot && lot.slots.length >= 4, 'display spaces');
  const stock = [...w.entities.values()].filter((e) => e.kind === K.VEH && e.forSale);
  assert.equal(stock.length, lot.slots.length, 'every space stocked');
  const { p, prof } = joinPlayer(w, { cash: 0, bank: 50000 });
  // a car with room beside it (the lot's layout varies with the map), stood next to on its open side
  const car = stock.find((c) => stock.every((o) => o === c || Math.hypot(o.x - c.x, o.y - c.y) > 110)) || stock.slice().sort((a, b) => b.def.W - a.def.W)[0];
  teleport(w, p.ped, car.x + car.def.W / 2 + 20, car.y + car.def.W / 2 + 10);
  assert.equal(vehicles.tryEnter(w, p.ped), false, 'locked until bought');
  const act = players.findInteraction(w, p);
  assert.ok(act && /^Buy /.test(act.label) && act.label.includes('$'), act && act.label);
  const price = car.forSale.price;
  act.run();
  assert.equal(car.forSale, null);
  assert.equal(car.owner, prof.pid);
  assert.equal(prof.bank, 50000 - price);
  assert.equal(prof.vehicles.at(-1).model, car.model);
  assert.ok(vehicles.tryEnter(w, p.ped), 'now it is yours');
  assert.equal(p.heat, 0);
});

test('home: change outfit inside, pick a car, the garage opens and you ease out protected', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e6 });
  const h = w.map.homes.find((q) => q.kind === 'farmhouse' && !w.homeOwner.has(q.id));
  const poi = w.map.pois.find((q) => q.kind === 'home' && q.home === h.id);
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, poi.id, 'hbuy');
  economy.handleMenu(w, p, poi.id, 'hhide');
  run(w, HIDE_TIME_S + 0.2);
  assert.ok(p.ped.hidden);
  const app0 = JSON.stringify(p.ped.app);
  economy.handleMenu(w, p, poi.id, 'houtfit');
  assert.notEqual(JSON.stringify(p.ped.app), app0, 'new look');
  prof.vehicles.push({ model: 'sports', paint: 2, variant: 0 });
  economy.handleMenu(w, p, poi.id, 'hcar:0');
  const menu = p.conn.sent.filter((m) => m && m.t === 'menu').pop();
  assert.ok(menu.opts.some((o) => o.id === 'hcargo:0'), 'asks if you are ready');
  w.events.length = 0;
  economy.handleMenu(w, p, poi.id, 'hcargo:0');
  const v = w.get(p.ped.vehId);
  assert.ok(v && v.model === 'sports' && v.scripted, 'behind the wheel, easing out');
  assert.ok(homes.isProtected(w, p.ped));
  run(w, 2.6);
  assert.ok(!v.scripted, 'out of the garage');
  assert.ok(Math.hypot(v.x - h.garage.x, v.y - h.garage.y) < 30, 'parked on the driveway');
  assert.ok(!homes.isProtected(w, p.ped));
});
