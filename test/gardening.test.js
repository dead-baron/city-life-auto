// Gardening at home (H61, server/systems/gardening.js): an owned home's yard has a few plots found from the built map;
// seeds from the co-op's counter, planted, watered (or rained on), growing over in-game days only while wet, wilting
// when dry too long, picked ripe (now and then a prize one), eaten, sold at the grocery; kept with the home in the
// profile across a rejoin, growing while you're away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run, store, players } from './helpers.js';
import { GARDEN, GARDEN_CROPS } from '../shared/rules.js';
import { DAY_LOOP_S } from '../shared/constants.js';
import { ITEMS } from '../shared/items.js';

const gardening = await import('../server/systems/gardening.js');
const homes = await import('../server/systems/homes.js');
const economy = await import('../server/systems/economy.js');
const DAY = DAY_LOOP_S;

// a house with a garden of at least three plots, bought by a new player standing at its first plot
function scene() {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w);
  prof.bank = 1e6;
  const h = w.map.homes.find((q) => !q.gone && q.kind === 'house' && !w.homeOwner.has(q.id) && gardening.plotSpots(w.map, q).length >= 3);
  assert.ok(h, 'a house with a garden');
  assert.equal(homes.buy(w, p, h, economy.payFrom), null);
  const spots = gardening.plotSpots(w.map, h);
  teleport(w, p.ped, spots[0].x, spots[0].y + 6);
  return { w, p, prof, conn, h, spots };
}
const label = (w, p) => (gardening.interaction(w, p) || {}).label || '';

test('every house with a yard has garden plots, in the yard, apart; an apartment has none', () => {
  const w = makeWorld();
  const houses = w.map.homes.filter((h) => !h.gone && h.kind === 'house');
  const withPlots = houses.filter((h) => gardening.plotSpots(w.map, h).length > 0);
  assert.ok(withPlots.length > houses.length * 0.6, `most houses have a garden (${withPlots.length}/${houses.length})`);
  for (const h of withPlots) {
    const s = gardening.plotSpots(w.map, h);
    assert.ok(s.length <= GARDEN.plots);
    for (const q of s) {
      assert.ok(Math.hypot(q.x - h.x, q.y - h.y) >= 96, 'not by the door');
      for (const o of s) if (o !== q) assert.ok(Math.abs(o.x - q.x) >= 68 || Math.abs(o.y - q.y) >= 40, 'apart');
    }
  }
  for (const h of w.map.homes.filter((q) => q.kind === 'apartment')) assert.equal(gardening.plotSpots(w.map, h).length, 0);
  // the same spots from the same map, every time (the page is sent them; nothing is added to the map)
  const h = withPlots[0];
  assert.deepEqual(gardening.plotSpots(w.map, h), gardening.plotSpots(makeWorld().map, h));
});

test('buy seeds at the co-op, plant, water, it grows over days only while wet, wilts when dry, is picked and eaten and sold', () => {
  const { w, p, prof, h } = scene();
  assert.match(label(w, p), /buy seeds/);
  assert.match(players.findInteraction(w, p).label, /buy seeds/, 'the Act button\'s prompt at your plot');
  // the co-op's counter sells seeds
  const coop = w.map.pois.find((q) => q.kind === 'farm');
  const menu = economy.buildMenu(w, p, coop);
  assert.ok(menu.opts.some((o) => o.id.startsWith('i:seed_tomato:')), 'tomato seeds on the counter');
  assert.ok(menu.opts.some((o) => o.id === 'job:fieldwork'), 'and farm work');
  const at = { x: p.ped.x, y: p.ped.y };
  teleport(w, p.ped, coop.x, coop.y);
  const buy = menu.opts.find((o) => o.id.startsWith('i:seed_tomato:')).id;
  economy.handleMenu(w, p, coop.id, buy);
  economy.handleMenu(w, p, coop.id, buy);
  assert.equal(prof.inventory.seed_tomato, 2);
  teleport(w, p.ped, at.x, at.y);
  // plant
  assert.match(label(w, p), /Plant tomato seeds/);
  gardening.interaction(w, p).run();
  assert.equal(prof.inventory.seed_tomato, 1);
  const q = prof.garden[h.id].plots[0];
  assert.equal(q.c, 'tomato');
  q.p = false;   // (no prize this time)
  // water: a watering lasts GARDEN.waterDays; it grows only while wet
  gardening.water(w, p);
  assert.equal(q.m, 1);
  gardening.advance(w, GARDEN.waterDays * DAY);
  const wetGrowth = q.g;
  assert.ok(Math.abs(wetGrowth - GARDEN.waterDays / GARDEN_CROPS.tomato.days) < 0.02, `grew while wet (${wetGrowth.toFixed(2)})`);
  assert.equal(q.m, 0, 'dry now');
  gardening.advance(w, GARDEN.wiltDays * DAY * 0.5);
  assert.equal(q.g, wetGrowth, 'no growing while dry');
  assert.ok(!gardening.wilted(q));
  gardening.advance(w, GARDEN.wiltDays * DAY * 0.6);
  assert.ok(gardening.wilted(q), 'wilting, dry too long');
  assert.match(label(w, p), /Water the wilting tomato/);
  gardening.interaction(w, p).run();
  assert.ok(!gardening.wilted(q), 'perked up');
  // the rain waters it: grown on to ripe over the days, rained on now and then
  for (let k = 0; k < 10 && q.g < 1; k++) gardening.advance(w, GARDEN.waterDays * DAY * 0.9, k % 2 === 0);
  assert.equal(q.g, 1, 'ripe');
  assert.equal(gardening.stageOf(q), 4);
  assert.match(label(w, p), /Pick the tomato/);
  gardening.interaction(w, p).run();
  assert.equal(prof.inventory.tomato, GARDEN_CROPS.tomato.yield);
  assert.equal(prof.garden[h.id].plots[0], null, 'the plot empty again');
  // eaten: it heals
  p.ped.hp = 50;
  economy.useItem(w, p, 'tomato');
  assert.equal(p.ped.hp, 50 + ITEMS.tomato.heal);
  assert.equal(prof.inventory.tomato, GARDEN_CROPS.tomato.yield - 1);
  // sold at the grocery
  const gro = w.map.pois.find((q) => q.kind === 'grocery');
  teleport(w, p.ped, gro.x, gro.y);
  const bank = prof.bank;
  economy.handleMenu(w, p, gro.id, 's:tomato');
  assert.equal(prof.bank, bank + (GARDEN_CROPS.tomato.yield - 1) * GARDEN_CROPS.tomato.sell);
  assert.equal(prof.inventory.tomato, 0);
});

test('dry for days it dies; a prize plant gives a prize vegetable worth more; someone else can\'t work your garden', () => {
  const { w, p, prof, h, spots } = scene();
  prof.inventory.seed_pumpkin = 2;
  gardening.plant(w, p, 'pumpkin');
  const q = prof.garden[h.id].plots[0];
  gardening.advance(w, GARDEN.dieDays * DAY + GARDEN.waterDays * DAY);
  assert.ok(q.dead, 'dead');
  assert.match(label(w, p), /Clear the dead pumpkin/);
  gardening.interaction(w, p).run();
  assert.equal(prof.garden[h.id].plots[0], null);
  // a prize one
  gardening.plant(w, p, 'pumpkin');
  const z = prof.garden[h.id].plots[0];
  z.p = true;
  for (let k = 0; k < 12 && z.g < 1; k++) { gardening.water(w, p); gardening.advance(w, GARDEN.waterDays * DAY * 0.9); }
  assert.equal(z.g, 1);
  assert.match(label(w, p), /prize one/);
  gardening.harvest(w, p);
  assert.equal(prof.inventory.prize_pumpkin, 1);
  assert.ok(ITEMS.prize_pumpkin.sell >= ITEMS.pumpkin.sell * GARDEN.prizeX);
  // someone else in your yard: nothing to do with your plots
  const { p: other } = joinPlayer(w);
  other.profile.inventory.seed_tomato = 3;
  teleport(w, other.ped, spots[0].x, spots[0].y + 6);
  assert.equal(gardening.interaction(w, other), null);
  // but they see it (the plots near them, anyone's)
  const near = gardening.nearPlots(w, spots[0].x, spots[0].y);
  assert.ok(near.some((r) => r[0] === spots[0].x && r[1] === spots[0].y));
});

test('the garden is kept with the home in the profile across a rejoin, and grew while you were away; the page is sent the plots', () => {
  const { w, p, prof, conn, h, spots } = scene();
  prof.inventory.seed_lettuce = 1;
  gardening.plant(w, p, 'lettuce');
  gardening.water(w, p);
  run(w, 2.5);
  const msg = conn.sent.filter((m) => m && m.t === 'garden').pop();
  assert.ok(msg && msg.g.some((r) => r[0] === spots[0].x && r[2] === gardening.CROP_IDS.indexOf('lettuce')), 'the plots near you sent');
  const g0 = prof.garden[h.id].plots[0].g;
  players.leave(w, p);
  p.ghostUntil = w.time;
  run(w, 0.2);
  assert.ok(!w.players.has(prof.pid), 'gone');
  gardening.advance(w, GARDEN.waterDays * DAY * 0.5);   // (a while passes)
  const back = players.join(w, conn, store.get(prof.pid));
  const q = back.profile.garden[h.id].plots[0];
  assert.equal(q.c, 'lettuce', 'still there');
  assert.ok(q.g > g0, 'and it grew while you were away');
  // a server down for a while: caught up from the garden's wall clock on the first step
  back.profile.garden[h.id].at = Date.now() - GARDEN.waterDays * DAY * 1000 * 0.3;
  delete w.gardenAt;
  const g1 = q.g;
  run(w, 2.1);
  assert.ok(q.g > g1 + 0.05, `caught up (${g1.toFixed(2)} -> ${q.g.toFixed(2)})`);
});

test('the dev garden won\'t move you out from under your vehicle: on foot first (H69)', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const v = w.spawnVehicle('sedan', p.ped.x + 60, p.ped.y, 0, { npcOwned: false });
  v.seats[0] = p.ped.id; p.ped.vehId = v.id; p.ped.seat = 0;
  const x = p.ped.x, y = p.ped.y;
  const err = gardening.devGarden(w, p, {}, homes.buy);
  assert.match(String(err), /vehicle/, 'it says why');
  assert.equal(p.ped.x, x); assert.equal(p.ped.y, y);
  p.ped.vehId = 0; v.seats[0] = 0;
  assert.equal(gardening.devGarden(w, p, {}, homes.buy), null, 'on foot: the garden, and you at it');
});
