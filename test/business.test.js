// The new places as businesses and days out: the counters at the countryside places (the winery's tasting room,
// the orchard's fruit stand, the market's stalls, the snack carts, the golf club's bar, the lavender farm stand,
// the boneyard's salvage office, the pier's bait shop), and the rides (the Ferris wheel on Westport Pier, balloon
// flights from the Dry Creek Balloon Field).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { SHOPS, ITEMS } from '../shared/items.js';
import { TILE } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { FERRIS_PRICE, FERRIS_S, BALLOON_PRICE, BALLOON_S, BALLOONS_UP, WINE_S } from '../shared/rules.js';
import { FERRIS, ferrisSite, balloonSite, balloonRoutes, balloonAt, ferrisCab, ferrisBoardCab, BALLOON_ALT } from '../shared/rides.js';
import * as economy from '../server/systems/economy.js';
import * as combat from '../server/systems/combat.js';
import * as rides from '../server/systems/rides.js';
import { viewRect } from '../server/view.js';

const COUNTERS = { winery: /tasting room/, fruitstand: /fruit, cider/, market: /the stalls/, snack: /hot dogs/, clubhouse: /the bar/, farmstand: /farm stand/, salvage: /buys scrap/, tackle: /bait, rods/ };
const lastMenu = (conn) => [...conn.sent].reverse().find((o) => o && o.t === 'menu');
const counterOf = (w, kind) => w.map.pois.find((q) => q.counter && q.kind === kind);
function at(w, p, poi) { teleport(w, p.ped, poi.x, poi.y + 6); p.ped.vx = 0; p.ped.vy = 0; }
// the ride events the world broadcasts
function watchRides(w) {
  const evs = [], b0 = w.broadcast.bind(w);
  w.broadcast = (ev) => { if (ev.e === 'ride' || ev.e === 'rideend') evs.push(ev); b0(ev); };
  return evs;
}

test('every countryside place with a business has a counter: its own prompt, and a menu with what it sells', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w);
  for (const [kind, re] of Object.entries(COUNTERS)) {
    const poi = counterOf(w, kind);
    assert.ok(poi, `a ${kind} counter is on the map`);
    at(w, p, poi);
    const act = players.findInteraction(w, p);
    assert.ok(act && re.test(act.label), `${kind}: the prompt (${act && act.label})`);
    act.run();
    const menu = lastMenu(conn);
    assert.ok(menu && menu.poi === poi.id, `${kind}: the menu opens`);
    for (const o of SHOPS[kind].buy) if (o.kind === 'item') assert.ok(menu.opts.some((q) => q.id.startsWith(`i:${o.id}:`)), `${kind} sells ${o.id}`);
    assert.ok(menu.sub, `${kind}: a line about the place`);
  }
  // the market has a counter in front of each row of stalls, but the phone and the maps list it once
  assert.ok(w.map.pois.filter((q) => q.counter && q.kind === 'market').length >= 2, 'a counter at each row');
  // the rides' boarding points are places too (the phone lists them), with no menu of their own
  for (const label of ['Westport Pier Ferris Wheel', 'Dry Creek Balloon Flights']) {
    const poi = w.map.pois.find((q) => q.kind === 'ride' && q.label === label);
    assert.ok(poi, label);
    assert.equal(economy.poiLabel(w, p, poi), null, `${label}: the ride itself answers the action button`);
  }
});

test('selling to the places: the winery pays more for grapes than town does, the salvage yard more for scrap than the pawn shop', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const sell = (poi, id, n) => {
    p.profile.inventory[id] = n;
    at(w, p, poi);
    const bank0 = p.profile.bank;
    economy.openMenu(w, p, poi);
    economy.handleMenu(w, p, poi.id, `s:${id}`);
    assert.equal(p.profile.inventory[id], 0, `sold the ${id}`);
    return (p.profile.bank - bank0) / n;
  };
  const winery = sell(counterOf(w, 'winery'), 'grapes', 5), town = sell(w.map.pois.find((q) => q.kind === 'convenience'), 'grapes', 5);
  assert.equal(winery, SHOPS.winery.sellPrice.grapes, 'the winery pays its price for grapes');
  assert.ok(winery > town, `more than the corner store (${winery} vs ${town})`);
  const yard = sell(counterOf(w, 'salvage'), 'scrap', 2), pawn = sell(w.map.pois.find((q) => q.kind === 'pawn'), 'scrap', 2);
  assert.equal(yard, SHOPS.salvage.sellPrice.scrap, 'the salvage yard pays its price for scrap');
  assert.ok(yard > pawn, `more than the pawn shop (${yard} vs ${pawn})`);
  assert.equal(sell(counterOf(w, 'fruitstand'), 'apple', 3), SHOPS.fruitstand.sellPrice.apple, 'the orchard stand buys apples');
  assert.equal(sell(counterOf(w, 'farmstand'), 'honey', 1), ITEMS.honey.sell, 'the farm stand buys honey back');
});

test('a glass of wine from the tasting room: health comes back faster for a couple of minutes; a hot dog from the cart heals a little', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 200 });
  const { p: q } = joinPlayer(w);
  const winery = counterOf(w, 'winery');
  at(w, p, winery);
  economy.openMenu(w, p, winery);
  economy.handleMenu(w, p, winery.id, 'i:redwine:30:1');
  assert.equal(p.profile.inventory.redwine, 1, 'a bottle of red');
  assert.equal(p.profile.cash, 170, 'for $30');
  economy.useItem(w, p, 'redwine');
  assert.ok(p.ped.buffs.wine > w.time + WINE_S - 1, 'the wine buff');
  assert.ok(players.buildMe(w, p).buffs.wine > 0, 'shown on the HUD');
  // both hurt, out of the fight a while, out of the way: the one who had a drink heals faster
  teleport(w, q.ped, p.ped.x + 60, p.ped.y);
  for (const ped of [p.ped, q.ped]) { ped.hp = 50; ped.lastHitAt = w.time - 60; ped.bleeding = false; }
  run(w, 5);
  const a = p.ped.hp - 50, b = q.ped.hp - 50;
  assert.ok(b > 0 && a > b * 2, `faster with wine (${a.toFixed(1)} vs ${b.toFixed(1)})`);
  // a hot dog at the snack cart
  const cart = counterOf(w, 'snack');
  at(w, p, cart);
  economy.openMenu(w, p, cart);
  economy.handleMenu(w, p, cart.id, `i:hotdog:${SHOPS.snack.buy.find((o) => o.id === 'hotdog').price}:1`);
  assert.equal(p.profile.inventory.hotdog, 1, 'a hot dog');
  p.ped.hp = 40;
  economy.useItem(w, p, 'hotdog');
  assert.equal(p.ped.hp, 40 + ITEMS.hotdog.heal, 'it heals a little');
});

test('the Ferris wheel: $5 and you ride the cab at the bottom once round - out of harm\'s way - and step back out on the deck', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 20, bank: 0 });
  const wheel = ferrisSite(w.map);
  assert.ok(wheel, 'the wheel is on the pier');
  const evs = watchRides(w);
  teleport(w, p.ped, wheel.board.x, wheel.board.y);
  let act = players.findInteraction(w, p);
  assert.ok(act && act.label.includes(`Ferris wheel ($${FERRIS_PRICE})`), `the prompt (${act && act.label})`);
  act.run();
  assert.equal(p.profile.cash, 20 - FERRIS_PRICE, 'a ticket');
  assert.ok(p.ped.hidden && p.ped.ride && p.ped.ride.k === 'ferris', 'aboard');
  const start = evs.find((e) => e.e === 'ride');
  assert.ok(start && start.k === 'ferris' && start.cab === p.ped.ride.cab && start.ped === p.ped.id, 'everyone is told (the cab, the rider)');
  assert.equal(players.buildMe(w, p).ride.k, 'ferris', 'and the rider\'s HUD');
  // the cab is the one at the bottom; a turn later it is back there
  const lowest = (t) => { let best = Infinity; for (let k = 0; k < FERRIS.n; k++) best = Math.min(best, ferrisCab(wheel, k, t).z); return best; };
  assert.ok(Math.abs(ferrisCab(wheel, start.cab, w.loopTime).z - lowest(w.loopTime)) < 1, 'you get the bottom cab');
  assert.ok(ferrisCab(wheel, start.cab, w.loopTime + FERRIS_S / 2).z > FERRIS.hubZ + FERRIS.r / 2, 'which goes over the top');
  // nothing to do but look: no prompt to press, no harm, the action button does nothing
  act = players.findInteraction(w, p);
  assert.ok(act.passive && /On the Ferris wheel/.test(act.label), 'a note, not a button');
  assert.equal(combat.damage(w, p.ped, 50, null, 'gun'), false, 'nobody can hurt you up there');
  run(w, FERRIS_S - 2);
  assert.ok(p.ped.ride, 'still going round');
  run(w, 3);
  assert.ok(!p.ped.ride && !p.ped.hidden, 'off again');
  assert.ok(Math.hypot(p.ped.x - wheel.board.x, p.ped.y - wheel.board.y) < 20, 'on the boarding deck');
  assert.ok(evs.some((e) => e.e === 'rideend' && e.id === start.id), 'everyone is told it\'s over');
  // not while wanted, not without the money
  p.wanted = 2;
  assert.ok(rides.start(w, p, 'ferris'), 'not with the police after you');
  p.wanted = 0; p.profile.cash = 0;
  assert.ok(rides.start(w, p, 'ferris'), 'not without a ticket');
  assert.ok(!p.ped.ride && !p.ped.hidden, 'still on the deck');
});

test('balloon flights: $40, the balloon drifts out over the country on its route and lands back at the field; three up at once', () => {
  const w = makeWorld();
  const field = balloonSite(w.map), routes = balloonRoutes(w.map);
  assert.ok(field && routes.length >= 3, 'the field and its routes');
  for (const r of routes) {
    assert.ok(r.len > 150 * TILE, `${r.name}: a real trip (${Math.round(r.len / TILE)} tiles)`);
    const a = balloonAt(r, 0, BALLOON_S), b = balloonAt(r, BALLOON_S, BALLOON_S), mid = balloonAt(r, BALLOON_S / 2, BALLOON_S);
    assert.ok(Math.hypot(a.x - field.launch.x, a.y - field.launch.y) < 4 && Math.hypot(b.x - field.launch.x, b.y - field.launch.y) < 4, `${r.name}: from the launch spot and back`);
    assert.ok(a.z === 0 && b.z === 0 && mid.z > BALLOON_ALT * 0.9, `${r.name}: up high in the middle`);
    assert.ok(Math.hypot(mid.x - field.launch.x, mid.y - field.launch.y) > 40 * TILE, `${r.name}: well away from the field`);
  }
  const { p, conn } = joinPlayer(w, { cash: 100, bank: 0 });
  const evs = watchRides(w);
  teleport(w, p.ped, field.board.x, field.board.y);
  const v0 = viewRect(w, p, {}), w0 = v0.x1 - v0.x0;
  const act = players.findInteraction(w, p);
  assert.ok(act && act.label.includes(`balloon flight ($${BALLOON_PRICE})`), `the prompt (${act && act.label})`);
  act.run();
  assert.equal(p.profile.cash, 100 - BALLOON_PRICE, 'a ticket');
  assert.ok(p.ped.hidden && p.ped.ride && p.ped.ride.k === 'balloon', 'aboard');
  assert.ok(evs.some((e) => e.e === 'ride' && e.k === 'balloon' && e.r === p.ped.ride.r), 'everyone sees it go up (the route)');
  // the rider goes along (what they're sent follows the balloon), and the camera pulls back
  run(w, BALLOON_S / 2);
  assert.ok(Math.hypot(p.ped.x - field.launch.x, p.ped.y - field.launch.y) > 40 * TILE, 'out over the country');
  const vr = viewRect(w, p, {});
  assert.ok(vr.x1 - vr.x0 > w0 * 1.3, `a wider view while riding (${Math.round(w0)} -> ${Math.round(vr.x1 - vr.x0)})`);
  assert.ok(rides.active(w).some((r) => r.id === p.ped.ride.id), 'someone joining now sees the balloon');
  // logging off up there brings you back at the field
  players.savePos(p, p.ped);
  assert.deepEqual([p.profile.pos.x, p.profile.pos.y], [field.board.x, field.board.y], 'saved at the boarding point');
  run(w, BALLOON_S / 2 + 1);
  assert.ok(!p.ped.ride && !p.ped.hidden, 'landed');
  assert.ok(Math.hypot(p.ped.x - field.board.x, p.ped.y - field.board.y) < 20, 'by the booking table');
  assert.ok(!PED_BLOCK[w.map.tileAtPx(p.ped.x, p.ped.y)], 'on open ground');
  assert.ok(conn.sent.some((o) => JSON.stringify(o).includes('Thanks for flying')), 'a note says so');
  // three balloons: the fourth flyer waits
  const flyers = [0, 1, 2, 3].map(() => joinPlayer(w, { cash: 100 }).p);
  for (const q of flyers) { teleport(w, q.ped, field.board.x, field.board.y); rides.start(w, q, 'balloon'); }
  assert.equal(flyers.filter((q) => q.ped.ride).length, BALLOONS_UP, `${BALLOONS_UP} up at once`);
  assert.equal(flyers[3].profile.cash, 100, 'the last one is not charged');
  assert.notEqual(flyers[0].ped.ride.r, flyers[1].ped.ride.r, 'flights take turns at the routes');
});

test('a ride ends cleanly if something else takes you off it (a dev teleport), and the cab you board is always the bottom one', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 50 });
  const wheel = ferrisSite(w.map);
  teleport(w, p.ped, wheel.board.x, wheel.board.y);
  const evs = watchRides(w);
  rides.start(w, p, 'ferris');
  p.ped.hidden = false; // (what a dev teleport does)
  run(w, 0.2);
  assert.ok(!p.ped.ride, 'the ride is forgotten');
  assert.ok(evs.some((e) => e.e === 'rideend'), 'and everyone told');
  for (let t = 0; t < FERRIS_S; t += 0.7) {
    const k = ferrisBoardCab(t), z = ferrisCab(wheel, k, t).z;
    for (let j = 0; j < FERRIS.n; j++) assert.ok(ferrisCab(wheel, j, t).z >= z - 0.01, `t ${t.toFixed(1)}: cab ${k} is the lowest`);
  }
});
