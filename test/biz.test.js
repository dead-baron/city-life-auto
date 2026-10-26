// Tier-4 properties, the businesses (server/systems/biz.js): every kind laid out round today's city - the farms, the
// nightclubs, the hideouts, the auto shops, the food truck - listed in the real-estate app, bought at its office, earning
// (a day's takings in the till, and as it's worked), its manager's menu; the hideout's guards defending it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, store } from './helpers.js';
import { BIZ } from '../shared/rules-games.js';
import { K } from '../shared/constants.js';
import * as biz from '../server/systems/biz.js';
import * as economy from '../server/systems/economy.js';
import * as homes from '../server/systems/homes.js';
import * as phone from '../server/systems/phone.js';
import * as farming from '../server/systems/farming.js';
import * as players from '../server/systems/players.js';
import { spawnNpc } from '../server/systems/npc.js';
import * as nightclubs from '../server/systems/nightclubs.js';

const lastMenu = (conn) => [...conn.sent].reverse().find((m) => m && m.t === 'menu');
const siteOf = (w, t) => biz.sites(w).find((s) => s.t === t);
const poiOf = (s) => -1 - s.i;
const choose = (w, p, s, opt) => economy.handleMenu(w, p, poiOf(s), opt);
function at(w, p, s) { teleport(w, p.ped, s.x, s.y); p.ped.vx = 0; p.ped.vy = 0; }
function newDay(w) { w.day++; run(w, 2.2); }
// (the profiles stay in the store from test to test: nobody owns anything at the start of one)
function world() {
  for (const q of store.all()) delete q.biz;
  const w = makeWorld(), n0 = w.notify.bind(w);
  w.heard = [];   // (every toast, whoever it was for: { pid, text })
  w.notify = (p, text, tone) => { if (p) w.heard.push({ pid: p.pid, text }); n0(p, text, tone); };
  return w;
}
const told = (w, p, re) => w.heard.some((q) => q.pid === p.pid && re.test(q.text));

test('the businesses: every kind laid out, in the real-estate app, bought at its office - its menu, the map, a place to wake up', () => {
  const w = world();
  const kinds = new Set(biz.sites(w).map((s) => s.t));
  for (const t of ['farm', 'club', 'hideout', 'shop', 'truck']) assert.ok(kinds.has(t), `a ${t} for sale`);
  assert.ok(biz.sites(w).filter((s) => s.t === 'hideout').length >= 3, 'several hideouts round the world');
  const { p, prof, conn } = joinPlayer(w, { bank: 2e6 });
  // the app's Businesses list
  const r = phone.handle(w, p, { a: 'homes', kind: 'biz' });
  assert.ok(r.biz && r.biz.sale.length >= 5, 'businesses listed for sale');
  assert.ok(['farm', 'club', 'hideout', 'shop'].every((t) => r.biz.sale.some((q) => q.t === t && q.p > 0 && Number.isFinite(q.x))), 'each kind, priced, with a place');
  for (const t of ['farm', 'club', 'hideout']) {
    const s = siteOf(w, t);
    at(w, p, s);
    if (s.poi != null) {   // (a club: the manager's office is a row of its bar's menu)
      economy.openMenu(w, p, w.map.pois[s.poi]);
      const row = lastMenu(conn).opts.find((o) => o.id === 'biz');
      assert.ok(row && /for sale/.test(row.label), `${t}: the bar's menu has the office (${row && row.label})`);
      economy.handleMenu(w, p, s.poi, 'biz');
    } else {
      const act = players.findInteraction(w, p);
      assert.ok(act && /For sale/.test(act.label), `${t}: the office's prompt (${act && act.label})`);
      act.run();
    }
    const sale = lastMenu(conn);
    assert.equal(sale.poi, poiOf(s), `${t}: its own menu`);
    assert.ok(sale.opts.some((o) => o.id === 'buy' && o.price === s.price), `${t}: for sale at its price`);
    const before = prof.bank + prof.cash;
    choose(w, p, s, 'buy');
    assert.equal(biz.ownerOf(w, s.id), p.pid, `${t}: yours`);
    assert.ok(prof.biz[s.id] && prof.biz[s.id].t === t, `${t}: on the profile`);
    assert.equal(before - prof.bank - prof.cash, s.price, `${t}: paid for`);
    const menu = lastMenu(conn);
    for (const id of ['take', 'stock', 'rest', 'spawn', 'sell']) assert.ok(menu.opts.some((o) => o.id === id), `${t}: the manager's menu has ${id}`);
    assert.ok(menu.opts.some((o) => o.id.startsWith('up:') && o.price > 0), `${t}: upgrades to buy`);
  }
  assert.equal(prof.biz[siteOf(w, 'club').id].stock, BIZ.club.stock.qty, 'a first load of stock comes with it');
  // the map, the death screen, the app's own list
  const me = players.buildMe(w, p);
  const list = biz.mapList(w, prof);
  assert.equal(list.length, 3, 'all three on the map');
  assert.ok(list.some((q) => q.k === 'club') && list.some((q) => q.k === 'gang') && list.some((q) => q.k === 'farm'), 'their icons');
  assert.ok(me.biz && me.biz.length === 3, 'in the self record');
  const opts = homes.spawnOptions(w, p);
  assert.ok(opts.some((o) => o.id === `biz:${siteOf(w, 'farm').id}`), 'wake up at the farm');
  const wake = homes.resolveSpawn(w, p, `biz:${siteOf(w, 'farm').id}`, null);
  assert.ok(Math.hypot(wake.x - siteOf(w, 'farm').x, wake.y - siteOf(w, 'farm').y) < 20, 'woken there');
  assert.equal(phone.handle(w, p, { a: 'homes' }).biz.mine.length, 3, 'yours in the app');
  // a fourth: no (BIZ.max)
  const shop = siteOf(w, 'shop');
  at(w, p, shop);
  assert.equal(biz.buy(w, p, shop), `You own ${BIZ.max} businesses already - sell one first.`);
  // sold: 60% of what it cost back, for sale again
  const club = siteOf(w, 'club'), b0 = prof.bank;
  at(w, p, club);
  choose(w, p, club, 'sell');
  assert.equal(prof.bank - b0, Math.round(club.price * BIZ.sellBack), 'sold back');
  assert.equal(biz.ownerOf(w, club.id), null, 'for sale again');
});

test('each one earns: a day\'s takings in its till, collected - the hideout\'s as hot money; short of stock, less', () => {
  const w = world();
  const { p, prof, conn } = joinPlayer(w, { bank: 2e6, cash: 0 });
  const farm = siteOf(w, 'farm'), club = siteOf(w, 'club'), hide = siteOf(w, 'hideout');
  for (const s of [farm, club, hide]) assert.equal(biz.buy(w, p, s), null);
  at(w, p, farm);
  biz.openMenu(w, p, farm);
  choose(w, p, farm, 'up:chickens');
  choose(w, p, farm, 'up:hands');
  assert.equal(prof.biz[farm.id].up.chickens, 1);
  newDay(w);
  for (const s of [farm, club, hide]) assert.ok(prof.biz[s.id].till > 0, `${s.t}: a day's takings (${prof.biz[s.id].till})`);
  assert.ok(told(w, p, /Your businesses/), 'told');
  assert.equal(prof.biz[club.id].stock, BIZ.club.stock.qty - 1, 'a case a night');
  // collected
  const till = prof.biz[farm.id].till;
  at(w, p, farm);
  choose(w, p, farm, 'take');
  assert.equal(prof.cash, till, 'the farm\'s takings in your pocket');
  assert.equal(prof.biz[farm.id].till, 0);
  const ht = prof.biz[hide.id].till;
  at(w, p, hide);
  choose(w, p, hide, 'take');
  assert.equal(prof.hot, ht, 'the hideout\'s product is hot money');
  // the till only holds so many days
  for (let k = 0; k < BIZ.tillDays + 3; k++) newDay(w);
  const c1 = prof.biz[club.id].till;
  newDay(w);
  assert.equal(prof.biz[club.id].till, c1, 'full: no more till it\'s collected');
  // no stock: the hideout grows nothing
  prof.biz[hide.id].stock = 0; prof.biz[hide.id].till = 0;
  newDay(w);
  assert.equal(prof.biz[hide.id].till, 0, 'no nutrients, no product');
  at(w, p, hide);
  biz.openMenu(w, p, hide);
  assert.ok(/short of bags of nutrients/.test(lastMenu(conn).sub), lastMenu(conn).sub);
});

test('worked: a farm\'s rows harvested, a club\'s cover and bar, the DJ\'s tips', () => {
  const w = world();
  const { p, prof } = joinPlayer(w, { bank: 2e6, cash: 500 });
  const farm = siteOf(w, 'farm');
  biz.buy(w, p, farm);
  // a ripe row of the farm's, driven down in a tractor
  const F = farming.fieldsOf(w).find((fd) => farm.fields.includes(fd.i) && fd.rows.some((row) => row.okN >= 3));
  const r = F.rows.findIndex((row) => row.okN >= 3);
  F.rows[r].s = farming.ROW.RIPE; F.rows[r].m = 0;
  const [a, b] = farming.rowEnds(F, r), v = { model: 'tractor', x: a.x, y: a.y, a: 0 };
  for (let k = 0; k <= 40; k++) { v.x = a.x + (b.x - a.x) * k / 40; v.y = a.y + (b.y - a.y) * k / 40; farming.work(w, p, v); }
  assert.equal(F.rows[r].s, farming.ROW.STUBBLE, 'harvested');
  assert.equal(prof.biz[farm.id].till, BIZ.farm.row + BIZ.farm.own, 'the row pays the farm, more for driving it yourself');
  assert.ok(told(w, p, /into .*'s till/), 'told so');
  // the club: someone let in pays the cover; a drink at the bar, a cut
  const club = siteOf(w, 'club');
  biz.buy(w, p, club);
  biz.clubAdmit(w, { key: club.key });
  assert.equal(prof.biz[club.id].till, BIZ.club.cover, 'the cover');
  const { p: q, conn: qc } = joinPlayer(w, { cash: 500 });
  teleport(w, q.ped, club.x, club.y);
  economy.openMenu(w, q, w.map.pois[club.poi]);
  const drink = [...qc.sent].reverse().find((m) => m && m.t === 'menu').opts.find((o) => /^i:/.test(o.id) && o.price > 0);
  assert.ok(drink, 'the bar sells drinks');
  economy.handleMenu(w, q, club.poi, drink.id);
  assert.equal(prof.biz[club.id].till, BIZ.club.cover + Math.round(drink.price * BIZ.club.barCut), 'the owner\'s cut of the bar');
  // the decks at night: the floor drops and they tip
  for (let t = 0; t < 1200 && !w.clock.isNight; t += 10) w.loopTime = t;
  assert.ok(w.clock.isNight, 'night');
  const c = nightclubs.clubByKey(w, club.key);
  c.state = 'open';
  for (let k = 0; k < 4; k++) { const d = spawnNpc(w, 'casual', c.floor.x0 + 10 + k * 8, c.floor.y0 + 4, 'civ'); d.npc.dancer = true; d.npc.desk = { x: d.x, y: d.y, a: 0 }; c.dancers.push(d.id); }
  teleport(w, p.ped, club.x, club.y);
  biz.openMenu(w, p, club);
  const t0 = prof.biz[club.id].till;
  choose(w, p, club, 'dj');
  assert.ok(c.dropUntil > w.time, 'the floor drops');
  run(w, BIZ.club.dj.every + 1.5);
  assert.ok(prof.biz[club.id].till >= t0 + 4 * BIZ.club.dj.tip, `tips (${prof.biz[club.id].till - t0})`);
});

test('the auto shop: a customer\'s car fixed by hand pays the till; other drivers\' bills a cut, yours free', () => {
  const w = world();
  const { p, prof } = joinPlayer(w, { bank: 2e6 });
  const shop = biz.sites(w).find((s) => s.t === 'shop' && s.poi != null);   // (the Fresh Coat garage)
  biz.buy(w, p, shop);
  at(w, p, shop);
  biz.openMenu(w, p, shop);
  choose(w, p, shop, 'job');
  assert.ok(p.bizFix, 'a car brought in');
  const car = w.get(p.bizFix.v);
  assert.ok(car && car.hp < car.def.hp, 'a damaged car on the lot');
  assert.ok(biz.targetFor(w, p), 'a waypoint to it');
  teleport(w, p.ped, car.x + 40, car.y);
  const act = players.findInteraction(w, p);
  assert.ok(act && /Fix the customer's car/.test(act.label), act && act.label);
  act.run();
  run(w, BIZ.shop.fix.s + 1);
  assert.equal(p.bizFix, null, 'done');
  assert.equal(car.hp, car.def.hp, 'fixed');
  assert.equal(prof.biz[shop.id].till, BIZ.shop.fix.pay, 'the customer paid');
  assert.equal(prof.biz[shop.id].stock, BIZ.shop.parts.qty - 1, 'a part fitted');
  // another driver's repair at the counter: the owner's cut; the owner's own: free
  const poi = w.map.pois[shop.poi];
  const { p: q, prof: qp } = joinPlayer(w, { cash: 1000 });
  const qv = w.spawnVehicle('sedan', poi.x + 60, poi.y + 60, 0, { owner: q.pid });
  q.lastVehicle = qv.id;
  teleport(w, q.ped, poi.x, poi.y);
  economy.handleMenu(w, q, poi.id, 'repair');
  assert.equal(qp.cash, 700, 'they paid');
  assert.equal(prof.biz[shop.id].till, BIZ.shop.fix.pay + Math.round(300 * BIZ.shop.cut), 'the cut');
  const pv = w.spawnVehicle('sedan', poi.x - 60, poi.y + 60, 0, { owner: p.pid });
  p.lastVehicle = pv.id;
  const c0 = prof.cash, b0 = prof.bank;
  teleport(w, p.ped, poi.x, poi.y);
  economy.handleMenu(w, p, poi.id, 'repair');
  assert.equal(prof.cash + prof.bank, c0 + b0, 'free at your own shop');
  // the day's customers
  newDay(w);
  assert.ok(prof.biz[shop.id].till > BIZ.shop.fix.pay + Math.round(300 * BIZ.shop.cut), 'the day\'s cars');
});

test('the food truck: bought at the dealership, the van out, parked by a crowd with the hatch up - it sells', () => {
  const w = world();
  const { p, prof, conn } = joinPlayer(w, { bank: 1e5 });
  const s = siteOf(w, 'truck'), poi = w.map.pois[s.poi];
  teleport(w, p.ped, poi.x, poi.y);
  economy.openMenu(w, p, poi);
  assert.ok(lastMenu(conn).opts.some((o) => o.id === 'biz'), 'the dealership sells food trucks');
  economy.handleMenu(w, p, poi.id, 'biz');
  choose(w, p, s, 'buy');
  assert.ok(prof.biz.truck, 'yours');
  choose(w, p, s, 'van');
  const v = biz.truckOf(w, p);
  assert.ok(v && v.model === 'icecream' && v.foodTruck === p.pid, 'the van out');
  // somewhere with people about
  const nx = -Math.sin(v.a), ny = Math.cos(v.a);
  for (let k = 0; k < 8; k++) spawnNpc(w, 'casual', v.x + nx * 120 + (k - 4) * 30, v.y + ny * 120, 'civ');
  teleport(w, p.ped, v.x + nx * 50, v.y + ny * 50);
  const act = players.findInteraction(w, p);
  assert.ok(act && /food truck/.test(act.label), act && act.label);
  act.run();
  assert.equal(lastMenu(conn).poi, biz.TRUCK_POI, 'the truck\'s menu');
  economy.handleMenu(w, p, biz.TRUCK_POI, 'hatch');
  assert.ok(v.hatch, 'open');
  const stock0 = prof.biz.truck.stock;
  run(w, 30);
  assert.ok(prof.biz.truck.stock < stock0, `meals sold (${stock0 - prof.biz.truck.stock})`);
  assert.equal(prof.biz.truck.till, (stock0 - prof.biz.truck.stock) * BIZ.truck.meal[0], 'each at the menu\'s price');
  economy.handleMenu(w, p, biz.TRUCK_POI, 'take');
  assert.equal(prof.biz.truck.till, 0, 'the till emptied');
  // walked away from it: the hatch comes down
  teleport(w, p.ped, v.x + 900, v.y);
  run(w, 1.2);
  assert.ok(!v.hatch, 'shut with nobody serving');
});

test('the hideout\'s guards: posted while the owner is near, an outsider in the yard warned then shot at, the owner left be', () => {
  const w = world();
  const { p } = joinPlayer(w, { bank: 1e6 });
  const s = siteOf(w, 'hideout');
  biz.buy(w, p, s);
  at(w, p, s);
  run(w, 1);
  const guards = biz.guardsOf(w, s.id);
  assert.equal(guards.length, BIZ.hideout.guards0, 'the guards at the door');
  const { p: o } = joinPlayer(w);
  o.ped.hp = o.ped.maxHp = 5000;
  teleport(w, o.ped, s.x + 60, s.y + 30);
  run(w, 1);
  assert.ok(told(w, o, /Private property/), 'warned first');
  assert.ok(!guards.some((g) => g.npc.state === 'fight' && g.npc.target === o.ped.id), 'not yet');
  run(w, BIZ.hideout.warnS + 1);
  assert.ok(guards.some((g) => g.npc.state === 'fight' && g.npc.target === o.ped.id), 'the guards go for the outsider');
  assert.ok(!guards.some((g) => g.npc.state === 'fight' && g.npc.target === p.ped.id), 'never the owner');
  // nobody about: they go; sold: no more guards
  teleport(w, p.ped, s.x + 9000, s.y); teleport(w, o.ped, s.x + 9000, s.y);
  run(w, 1);
  assert.equal(biz.guardsOf(w, s.id).filter((g) => !g.removed).length, 0, 'gone home');
});

test('an owned business whose place is gone (the world changed): bought back at what was paid', () => {
  const pid = 'ffffffffffff0000biz00001';
  const prof = store.create(pid);
  prof.biz = { 'hide:999999': { t: 'hideout', paid: 75000, up: {}, stock: 0, till: 0 } };
  const bank = prof.bank;
  const w = makeWorld();
  assert.equal(biz.ownerOf(w, 'hide:999999'), null);
  assert.equal(prof.bank - bank, 75000, 'refunded');
  assert.ok(!prof.biz['hide:999999'], 'gone from the profile');
});
