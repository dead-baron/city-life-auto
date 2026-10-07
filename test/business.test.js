// The new places as businesses and days out: the counters at the countryside places (the winery's tasting room,
// the orchard's fruit stand, the market's stalls, the snack carts, the golf club's bar, the lavender farm stand,
// the boneyard's salvage office, the pier's bait shop), and the rides (the Ferris wheel on Westport Pier, balloon
// flights from the Dry Creek Balloon Field, the water slides at Splash Bay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { SHOPS, ITEMS } from '../shared/items.js';
import { TILE, T } from '../shared/constants.js';
import { PED_BLOCK, isSwimming } from '../shared/map.js';
import { FERRIS_PRICE, FERRIS_S, BALLOON_PRICE, BALLOON_S, BALLOONS_UP, WINE_S, SALVAGE_S, SALVAGE_REGROW_S, MAZE_PRIZE, PROSPECT_S, WRECK_S, LAP_PRIZE } from '../shared/rules.js';
import { FERRIS, ferrisSite, balloonSite, balloonRoutes, balloonAt, ferrisCab, ferrisBoardCab, BALLOON_ALT, SLIDE, slideSite, slideAt, slideRider, slideDur, slideClimbS } from '../shared/rides.js';
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
  for (const label of ['Westport Pier Ferris Wheel', 'Dry Creek Balloon Flights', 'Splash Bay Water Slides']) {
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

test('the water slides at Splash Bay: free - up the tower stair, down the next slide in turn, and out with a splash in its pool', () => {
  const w = makeWorld();
  const site = slideSite(w.map);
  assert.ok(site && site.slides.length === 3, 'three slides');
  for (const [k, sl] of site.slides.entries()) {
    // each from the tower's top deck down into its splash pool; the ride: from the boarding point up the stair to it
    const top = slideAt(sl, 0), end = slideAt(sl, 1);
    assert.ok(top.z === sl.z && end.z < 6 && end.y - top.y > 8 * TILE, `${sl.name}: from the top down to the pool`);
    for (let t = 0.05; t <= 1; t += 0.05) assert.ok(slideAt(sl, t).z <= slideAt(sl, t - 0.05).z, `${sl.name}: always down (t ${t.toFixed(2)})`);
    const up = slideClimbS(site, k), a = slideRider(site, k, 0), b = slideRider(site, k, up - 0.01), c = slideRider(site, k, up + 0.01), d = slideRider(site, k, slideDur(site, k));
    assert.ok(Math.hypot(a.x - site.board.x, a.y - site.board.y) < 1 && a.z === 0 && a.phase === 0, `${sl.name}: the climb starts where you board`);
    assert.ok(b.z > sl.z - 1 && Math.hypot(b.x - sl.x, b.y - sl.y) < 4 && c.phase === 1, `${sl.name}: at the top, into the slide`);
    assert.ok(Math.hypot(d.x - end.x, d.y - end.y) < 1, `${sl.name}: all the way down`);
    assert.ok(up > 2 && up < 6 && slideDur(site, k) < 12, `${sl.name}: a short ride (${slideDur(site, k).toFixed(1)} s)`);
  }
  const { p, conn } = joinPlayer(w, { cash: 0, bank: 0 });
  const evs = watchRides(w), splashes = [], e0 = w.emit.bind(w);
  w.emit = (x, y, ev) => { if (ev.e === 'splash') splashes.push(ev); e0(x, y, ev); };
  teleport(w, p.ped, site.board.x - 10, site.board.y + 8);
  assert.equal(economy.poiLabel(w, p, w.map.pois.find((q) => q.label === 'Splash Bay Water Slides')), null, 'the ride answers the button');
  let act = players.findInteraction(w, p);
  assert.ok(act && /Climb the tower and ride the blue tube/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  assert.ok(p.ped.hidden && p.ped.ride && p.ped.ride.k === 'slide' && p.ped.ride.sl === 0, 'up the stair - no ticket needed');
  const ev = evs.find((e) => e.e === 'ride');
  assert.ok(ev && ev.k === 'slide' && ev.sl === 0 && ev.app && ev.ped === p.ped.id, 'everyone is told (the slide, who, how they look)');
  assert.equal(players.buildMe(w, p).ride.sl, 0, 'and the rider\'s HUD');
  act = players.findInteraction(w, p);
  assert.ok(act.passive && /Up the stair to the blue tube/.test(act.label), `climbing (${act.label})`);
  run(w, slideClimbS(site, 0) + SLIDE.ride / 2);
  act = players.findInteraction(w, p);
  assert.ok(act.passive && /Down the blue tube/.test(act.label), `sliding (${act.label})`);
  assert.ok(p.ped.y > site.slides[0].y + 2 * TILE, 'the rider goes along (what they\'re sent follows them)');
  assert.equal(combat.damage(w, p.ped, 50, null, 'gun'), false, 'nobody can hurt you on the slide');
  run(w, SLIDE.ride / 2 + 0.3);
  assert.ok(!p.ped.ride && !p.ped.hidden, 'off the end');
  assert.ok(isSwimming(w.map, p.ped), 'in the splash pool');
  const sl = site.slides[0];
  assert.ok(Math.hypot(p.ped.x - (sl.x + sl.dx), p.ped.y - (sl.y + sl.len)) < 40, 'at the bottom of the slide');
  assert.ok(splashes.length === 1 && evs.some((e) => e.e === 'rideend' && e.id === ev.id), 'a splash, and everyone is told it\'s over');
  // back round to the tower: the red flume next, then the yellow one, then the tube again
  for (const name of ['red flume', 'yellow flume', 'blue tube']) {
    teleport(w, p.ped, site.board.x, site.board.y);
    act = players.findInteraction(w, p);
    assert.ok(act && act.label.includes(`ride the ${name}`), `next: the ${name} (${act && act.label})`);
    act.run();
    run(w, p.ped.ride.dur + 0.3);
    assert.ok(!p.ped.ride && isSwimming(w.map, p.ped), `down the ${name}`);
  }
  // not while wanted; logging off on the slide brings you back in the pool
  teleport(w, p.ped, site.board.x, site.board.y);
  p.wanted = 2;
  assert.ok(rides.start(w, p, 'slide'), 'not with the police after you');
  p.wanted = 0;
  rides.start(w, p, 'slide');
  players.savePos(p, p.ped);
  assert.equal(w.map.tileAtPx(p.profile.pos.x, p.profile.pos.y), T.DEEP, 'saved in the splash pool');
  assert.equal(p.profile.cash, 0, 'never a charge');
  assert.ok(conn.sent.some((o) => JSON.stringify(o).includes('Up the tower stair to the blue tube')), 'a note on the way up');
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

test('the boneyard: strip a stored airliner for parts (standing still a few seconds), sell the scrap at the yard office; that plane is bare a while', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w);
  const by = w.map.natureSites.find((q) => q.kind === 'boneyard');
  assert.ok(by && by.stored.length === by.planes, 'the stored planes are listed');
  const q = by.stored[3], ux = Math.cos(q.a), uy = Math.sin(q.a);
  // under the wing, beside the fuselage (the fuselage itself is solid)
  const sx = q.x - uy * 46 + ux * 20, sy = q.y + ux * 46 + uy * 20;
  teleport(w, p.ped, sx, sy);
  let act = players.findInteraction(w, p);
  assert.ok(act && /Strip parts off the plane/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  assert.ok(p.ped.work, 'at work');
  assert.ok(players.findInteraction(w, p).passive, 'a note while working, not a button');
  // walking off stops you
  run(w, 1); teleport(w, p.ped, sx + 40, sy); run(w, 0.3);
  assert.ok(!p.ped.work && !(p.profile.inventory.scrap > 0), 'walked away: nothing');
  // stand still the whole time: scrap
  teleport(w, p.ped, sx, sy);
  players.findInteraction(w, p).run();
  run(w, SALVAGE_S + 0.5);
  const got = p.profile.inventory.scrap || 0;
  assert.ok(got >= 1 && got <= 2, `scrap (${got})`);
  assert.ok(conn.sent.some((o) => JSON.stringify(o).includes('yard office')), 'a note says where to sell it');
  act = players.findInteraction(w, p);
  assert.ok(/Stripped bare/.test(act.label), 'that plane is bare now');
  act.run();
  run(w, SALVAGE_S + 0.5);
  assert.equal(p.profile.inventory.scrap, got, 'nothing more from it');
  w.time += SALVAGE_REGROW_S + 1;
  assert.ok(/Strip parts/.test(players.findInteraction(w, p).label), 'worth stripping again later');
  // the yard office buys it
  const office = counterOf(w, 'salvage');
  at(w, p, office);
  const bank0 = p.profile.bank;
  economy.openMenu(w, p, office);
  economy.handleMenu(w, p, office.id, 's:scrap');
  assert.equal(p.profile.bank - bank0, got * SHOPS.salvage.sellPrice.scrap, 'paid for the scrap');
});

test('Cedar Point Lavender: cut lavender from the rows; the farm stand pays best for it, the market buys it too', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const rows = (w.map.pickables || []).filter((q) => q.item === 'lavender');
  assert.ok(rows.length >= 60, `stretches of row to cut (${rows.length})`);
  const q = rows[Math.floor(rows.length / 2)];
  teleport(w, p.ped, q.x, q.y + 10);
  const act = players.findInteraction(w, p);
  assert.ok(act && /Cut lavender/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  const got = p.profile.inventory.lavender || 0;
  assert.ok(got >= 1, `lavender (${got})`);
  assert.ok(p.toasts.some((t) => t.text.includes('farm stand')), 'a note says where to sell it');
  assert.ok(/Picked clean/.test(players.findInteraction(w, p).label), 'that stretch is cut');
  const stand = counterOf(w, 'farmstand');
  at(w, p, stand);
  const bank0 = p.profile.bank;
  economy.openMenu(w, p, stand);
  economy.handleMenu(w, p, stand.id, 's:lavender');
  assert.equal(p.profile.bank - bank0, got * SHOPS.farmstand.sellPrice.lavender, 'the farm stand buys it');
  assert.ok(SHOPS.farmstand.sellPrice.lavender > ITEMS.lavender.sell && SHOPS.market.sells.includes('lavender'), 'best at the farm, the market too');
});

test('the Bluffs Maze against the clock: in through a gate, the clock runs to the gazebo; a prize the first time, your best kept, the day\'s fastest listed', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { cash: 0 });
  const mz = w.map.natureSites.find((q) => q.kind === 'maze');
  assert.ok(mz && mz.rect && mz.heart, 'the maze');
  const inGate = { x: mz.gate.x, y: mz.rect.y1 - 10 };   // (just inside the south gate)
  teleport(w, p.ped, mz.gate.x, mz.rect.y1 + 40);
  run(w, 0.2);
  assert.ok(!p.maze, 'outside: no clock');
  teleport(w, p.ped, inGate.x, inGate.y);
  run(w, 0.2);
  assert.ok(p.maze && p.maze.t0, 'in through the gate: the clock runs');
  const job = players.buildMe(w, p).job;
  assert.ok(job && /Bluffs Maze/.test(job.text) && job.x === mz.heart.x, `the HUD tracker (${job && job.text})`);
  run(w, 20);
  teleport(w, p.ped, mz.heart.x, mz.heart.y + 50);
  run(w, 0.2);
  assert.ok(p.maze.done, 'made it to the middle');
  assert.equal(p.profile.cash, MAZE_PRIZE, 'the first time: a prize');
  const first = p.profile.mazeBest;
  assert.ok(first >= 20 && first < 22, `the time (${first})`);
  assert.ok(conn.sent.some((o) => String(typeof o === 'string' ? o : JSON.stringify(o)).includes("Today's fastest: 1. ")), 'the day\'s fastest');
  assert.equal(players.buildMe(w, p).job, null, 'the tracker goes');
  // walking back out through the maze doesn't start the clock again; out and back in does
  teleport(w, p.ped, inGate.x, inGate.y); run(w, 0.2);
  assert.ok(p.maze.done, 'still done on the way out');
  teleport(w, p.ped, mz.gate.x, mz.rect.y1 + 40); run(w, 0.2);
  assert.equal(p.maze, null, 'out');
  teleport(w, p.ped, inGate.x, inGate.y); run(w, 0.2);
  assert.ok(p.maze && p.maze.t0, 'a new run');
  run(w, 8);
  teleport(w, p.ped, mz.heart.x, mz.heart.y + 50); run(w, 0.2);
  assert.ok(p.profile.mazeBest < first, 'a new best');
  assert.equal(p.profile.cash, MAZE_PRIZE, 'the prize is only the first time');
  // leaving through a gate mid-run stops the clock
  teleport(w, p.ped, mz.gate.x, mz.rect.y1 + 40); run(w, 0.2);
  teleport(w, p.ped, inGate.x, inGate.y); run(w, 1);
  teleport(w, p.ped, mz.gate.x, mz.rect.y1 + 40); run(w, 0.2);
  assert.equal(p.maze, null, 'gave up');
});

test('the Old Granite Mine: chip at a seam with the old pick (quartz, now and then a gold nugget); the wreck on Wreck Island: search it for old doubloons; the pawn shop buys them', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const mine = w.map.natureSites.find((q) => q.kind === 'mine'), wreck = w.map.natureSites.find((q) => q.kind === 'wreck');
  assert.ok(mine && mine.seams.length >= 3 && wreck && wreck.search.length === 3, 'the seams and the wreck\'s spots');
  const work = (spot, roll, s) => {
    teleport(w, p.ped, spot.x, spot.y);
    const act = players.findInteraction(w, p);
    const r0 = w.rand; w.rand = () => roll;
    act.run();
    run(w, s + 0.5);
    w.rand = r0;
    return act.label;
  };
  assert.ok(/Chip at the seam/.test(work(mine.seams[1], 0.05, PROSPECT_S)), 'the prompt at a seam');
  assert.equal(p.profile.inventory.nugget, 1, 'a gold nugget');
  assert.ok(/Worked out/.test(players.findInteraction(w, p).label), 'that seam is worked out a while');
  work(mine.seams[2], 0.3, PROSPECT_S);
  assert.equal(p.profile.inventory.quartz, 2, 'quartz');
  assert.ok(/Search the wreck/.test(work(wreck.search[1], 0.2, WRECK_S)), 'the prompt at the wreck');
  assert.equal(p.profile.inventory.doubloon, 1, 'an old doubloon');
  // the pawn shop buys the lot
  const pawn = w.map.pois.find((q) => q.kind === 'pawn');
  teleport(w, p.ped, pawn.x, pawn.y);
  const bank0 = p.profile.bank;
  economy.openMenu(w, p, pawn);
  for (const id of ['nugget', 'quartz', 'doubloon']) economy.handleMenu(w, p, pawn.id, `s:${id}`);
  assert.equal(p.profile.bank - bank0, ITEMS.nugget.sell + 2 * ITEMS.quartz.sell + ITEMS.doubloon.sell, 'sold');
});

test('a lap of the Stadium Lido against the clock: push off the wall, the rope at the deep end and back; a prize the first time, your best kept', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w, { cash: 0 });
  const pool = (w.map.pools || []).find((q) => q.deep && q.lanes);
  assert.ok(pool, 'the lido');
  const y = pool.y + pool.h * 0.375, step = (x, s = 0.2) => { teleport(w, p.ped, x, y); run(w, s); };
  step(pool.x + 20);
  assert.ok(p.lap && p.lap.phase === 'wall', 'in the water at the wall: ready');
  step(pool.x + 120, 3);
  assert.ok(p.lap.phase === 'out' && p.lap.t0, 'pushed off: the clock runs');
  assert.ok(/Lido lap/.test(players.buildMe(w, p).job.text), 'the HUD tracker');
  step(pool.deep.x - 10, 3);
  assert.equal(p.lap.phase, 'back', 'turned at the rope');
  step(pool.x + 20);
  assert.ok(p.profile.lapBest > 5 && p.profile.lapBest < 8, `the time (${p.profile.lapBest})`);
  assert.equal(p.profile.cash, LAP_PRIZE, 'the first lap: a prize');
  assert.ok(conn.sent.some((o) => String(typeof o === 'string' ? o : JSON.stringify(o)).includes("Today's fastest: 1. ")), 'the day\'s fastest');
  // out of the water mid-lap: off
  step(pool.x + 120);
  teleport(w, p.ped, pool.x + 120, pool.y - 40); run(w, 0.2);
  assert.equal(p.lap, null, 'climbed out: the lap is off');
});
