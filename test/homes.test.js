import { RESPAWN_SECONDS } from '../shared/rules.js';
// Homes & estates, hiding indoors, spawn protection / spread, paint shops, felony payoff, bait.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players, fakeConn } from './helpers.js';
import { ESTATE_TYPES, PED_BLOCK, CAR_SPAWN_BLOCK } from '../shared/map.js';
import { K } from '../shared/constants.js';
import { HIDE_TIME_S, SPAWN_PROTECT_S, PAINT_PRICE, PAINT_TIME_S, FELONY_FINE } from '../shared/rules.js';
import * as economy from '../server/systems/economy.js';
import * as combat from '../server/systems/combat.js';
import * as homes from '../server/systems/homes.js';
import * as jobs from '../server/systems/jobs.js';
import { spawnNpc } from '../server/systems/npc.js';

const poiOf = (w, h) => w.map.pois.find((q) => q.kind === 'home' && q.home === h.id);

test('estates: farmhouses, cottages, beach houses and a mansion, each with a reachable garage', () => {
  const w = makeWorld();
  for (const k of Object.keys(ESTATE_TYPES)) {
    const list = w.map.homes.filter((h) => h.kind === k);
    assert.ok(list.length >= 1, `no ${k} on the map`);
    for (const h of list) {
      assert.equal(h.price, h.dock ? Math.round((ESTATE_TYPES[k].price * 1.3) / 500) * 500 : ESTATE_TYPES[k].price);
      assert.equal(PED_BLOCK[w.map.tileAtPx(h.x, h.y)], 0, `${h.name}: door blocked`);
      assert.ok(h.garage, `${h.name}: no garage`);
      assert.equal(CAR_SPAWN_BLOCK[w.map.tileAtPx(h.garage.x, h.garage.y)], 0, `${h.name}: garage spot not drivable`);
      assert.ok(poiOf(w, h), `${h.name}: no door POI`);
    }
  }
  assert.ok(w.map.mansions.length >= 1 && w.map.mansions[0].lot.tw >= 20, 'mansion with a big yard');
  assert.ok(w.map.garages.length >= 1, 'built garages (painted houses have their own)');
});

test('own any number of homes; every car comes out of any home garage (door opens)', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e6 });
  const picks = w.map.homes.filter((h) => h.garage && !w.homeOwner.has(h.id)).slice(0, 5);
  for (const h of picks) { teleport(w, p.ped, h.x, h.y); economy.handleMenu(w, p, poiOf(w, h).id, 'hbuy'); }
  assert.equal(homes.ownedHomes(w, prof).length, 5, 'no cap on homes');
  prof.vehicles.push({ model: 'sedan', paint: 1, variant: 0 });
  const far = picks[4];
  teleport(w, p.ped, far.x, far.y);
  w.events.length = 0;
  economy.handleMenu(w, p, poiOf(w, far).id, 'hcar:0');
  const car = [...w.entities.values()].find((e) => e.kind === K.VEH && e.owner === prof.pid);
  assert.ok(car && Math.hypot(car.x - far.garage.x, car.y - far.garage.y) < 5, 'car at this home\'s garage');
  assert.ok(w.events.some((e) => e.ev.e === 'garagedoor' && e.ev.home === far.id), 'garage door opens');
});

test('a rebuilt world: homes from the old one are bought back (deed or old price list), you wake at a hospital, cars and stash kept', async () => {
  const { WORLD_VERSION } = await import('../shared/constants.js');
  const { LEGACY_HOMES } = await import('../server/systems/legacy-homes.js');
  const { store } = await import('./helpers.js');
  const w0 = makeWorld();
  const at = w0.map.spawns.police;
  const [h1, h2] = w0.map.homes.filter((h) => !w0.homeOwner.has(h.id)).slice(0, 2);
  // saved in an older world, before deeds were kept for one of its homes
  const stale = store.create('0ldw0r1d' + Date.now().toString(16).padStart(16, '0'));
  Object.assign(stale, { wv: WORLD_VERSION - 1, homes: [h1.id, h2.id], spawnHome: h1.id, deeds: { [h1.id]: 41000 }, bank: 1000, pos: { x: at.x, y: at.y },
    vehicles: [{ model: 'sports', paint: 1, variant: 0 }], stash: { items: { medkit: 2 }, weapons: {} } });
  // a server starting up with it in the store: nothing of the old world gets registered as theirs
  const w = makeWorld();
  assert.ok(!w.homeOwner.has(h1.id) && !w.homeOwner.has(h2.id), 'their old homes are on the market');
  const oldPrice = (LEGACY_HOMES[WORLD_VERSION - 1] || [])[h2.id];
  const refund = 41000 + (oldPrice ? oldPrice[0] : 25000);
  assert.deepEqual(stale.homes, []);
  assert.equal(stale.spawnHome, null);
  assert.deepEqual(stale.deeds, {});
  assert.equal(stale.bank, 1000 + refund, 'bought back: the deed, else the old price list');
  assert.equal(stale.wv, WORLD_VERSION);
  assert.equal(stale.pos, null, 'the saved spot belongs to the old streets');
  assert.ok(stale.worldNote && stale.worldNote.homes === 2 && stale.worldNote.refund === refund);
  // coming back: told once, at a hospital, cars and stash still theirs
  const p = players.join(w, fakeConn(), stale);
  assert.ok(w.map.hospitals.some((q) => Math.hypot(q.x - p.ped.x, q.y - p.ped.y) < 260), 'wakes at a hospital');
  assert.ok(p.toasts.some((t) => /rebuilt/.test(t.text) && t.text.includes(refund.toLocaleString())), 'told what happened to their homes');
  assert.equal(stale.worldNote, undefined, 'only once');
  assert.equal(stale.vehicles.length, 1, 'cars kept');
  assert.equal(stale.stash.items.medkit, 2, 'stash kept');
  assert.equal(homes.ownedHomes(w, stale).length, 0);
  // a profile from a world with no price list: what the deed says, else a house's price
  const older = store.create('0ldw0r2d' + Date.now().toString(16).padStart(16, '0'));
  Object.assign(older, { wv: -7, homes: [h1.id], deeds: {}, bank: 0 });
  const note = homes.checkWorld(w, older);
  assert.equal(note.refund, 25000);
  assert.equal(homes.checkWorld(w, older), null, 'nothing more to do once it is in this world');
  // this world's profiles keep their homes; buying records the deed, selling clears it
  const { p: q, prof } = joinPlayer(w, { bank: 1e6 });
  teleport(w, q.ped, h1.x, h1.y);
  economy.handleMenu(w, q, poiOf(w, h1).id, 'hbuy');
  assert.equal(prof.deeds[h1.id], h1.price, 'the deed remembers the price');
  assert.equal(homes.checkWorld(w, prof), null);
  assert.equal(w.homeOwner.get(h1.id), prof.pid);
  homes.sell(w, q, h1);
  assert.equal(prof.deeds[h1.id], undefined);
});

test('going inside: blink in over a few seconds, hidden and untouchable, stash things, step out protected', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e5, cash: 300 });
  const h = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id));
  const poi = poiOf(w, h);
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, poi.id, 'hbuy');
  // moving away cancels
  economy.handleMenu(w, p, poi.id, 'hhide');
  assert.ok(p.ped.entering);
  assert.equal(homes.blinkState(w, p.ped), 1, 'slow blink first');
  teleport(w, p.ped, h.x + 40, h.y);
  run(w, 0.2);
  assert.ok(!p.ped.entering && !p.ped.hidden, 'stepping away cancels');
  // stand still -> inside
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, poi.id, 'hhide');
  run(w, HIDE_TIME_S * 0.8);
  assert.equal(homes.blinkState(w, p.ped), 2, 'fast blink at the end');
  run(w, HIDE_TIME_S * 0.3);
  assert.ok(p.ped.hidden, 'inside');
  assert.equal(homes.blinkState(w, p.ped), 3);
  assert.ok(!w.query(h.x, h.y, 200, K.PED).includes(p.ped), 'hidden from everyone');
  combat.damage(w, p.ped, 50, null, 'melee');
  assert.equal(p.ped.hp, 100, 'can\'t be hurt inside');
  // stash cash + items + a gun
  prof.inventory.medkit = 2;
  prof.weapons.pistol = 20; p.ped.mag.pistol = 12;
  economy.handleMenu(w, p, poi.id, 'dep:all');
  economy.handleMenu(w, p, poi.id, 'hst:medkit');
  economy.handleMenu(w, p, poi.id, 'hsw:pistol');
  assert.equal(prof.cash, 0);
  assert.equal(prof.inventory.medkit, 0);
  assert.equal(prof.stash.items.medkit, 2);
  assert.equal(prof.weapons.pistol, undefined);
  assert.equal(prof.stash.weapons.pistol, 32);
  economy.handleMenu(w, p, poi.id, 'htw:pistol');
  economy.handleMenu(w, p, poi.id, 'htk:medkit');
  assert.equal(p.ped.mag.pistol + prof.weapons.pistol, 32);
  assert.equal(prof.inventory.medkit, 2);
  // step out: ~2 s of protection, can't shoot
  economy.handleMenu(w, p, poi.id, 'hleave');
  assert.ok(!p.ped.hidden && w.query(h.x, h.y, 200, K.PED).includes(p.ped));
  assert.equal(homes.blinkState(w, p.ped), 2);
  combat.damage(w, p.ped, 50, null, 'melee');
  assert.equal(p.ped.hp, 100, 'protected after stepping out');
  p.ped.weapon = 'pistol';
  assert.equal(combat.tryAttack(w, p.ped, 0), false, 'no shooting while protected');
  run(w, SPAWN_PROTECT_S + 0.1);
  assert.equal(homes.blinkState(w, p.ped), 0);
  combat.damage(w, p.ped, 10, null, 'melee');
  assert.equal(p.ped.hp, 90);
});

test('hiding inside shakes the police: nobody sees you, heat fades', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { bank: 1e5 });
  const h = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id));
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, poiOf(w, h).id, 'hbuy');
  economy.handleMenu(w, p, poiOf(w, h).id, 'hhide');
  run(w, HIDE_TIME_S + 0.2);
  assert.ok(p.ped.hidden);
  p.heat = 40; p.wanted = 2; p.seenAt = 0;
  const cop = spawnNpc(w, 'cop', h.x + 60, h.y + 20, 'cop');
  cop.a = Math.atan2(h.y - cop.y, h.x - cop.x);
  run(w, 2);
  assert.ok(w.time - p.seenAt > 1.5, 'the cop outside can\'t see you');
});

test('every spawn: a few spots around the place, and a couple of seconds of protection', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const hosp = w.map.hospitals[0];
  const spots = new Set();
  for (let i = 0; i < 8; i++) {
    combat.kill(w, p.ped, null, 'melee', 0);
    p.respawnChoice = 'h:0';
    run(w, RESPAWN_SECONDS + 1);
    assert.ok(!p.ped.dead);
    const d = Math.hypot(p.ped.x - hosp.x, p.ped.y - hosp.y);
    assert.ok(d < 200, `near the hospital (${d})`);
    assert.equal(PED_BLOCK[w.map.tileAtPx(p.ped.x, p.ped.y)], 0);
    spots.add(`${Math.round((p.ped.x - hosp.x) / 40)},${Math.round((p.ped.y - hosp.y) / 40)}`);
  }
  assert.ok(spots.size >= 3, `spawns spread out (${spots.size} spots)`);
  combat.kill(w, p.ped, null, 'melee', 0);
  run(w, RESPAWN_SECONDS + 1);
  assert.ok(homes.isProtected(w, p.ped), 'fresh spawn is protected');
  combat.damage(w, p.ped, 30, null, 'melee');
  assert.equal(p.ped.hp, 100);
  run(w, SPAWN_PROTECT_S);
  assert.ok(!homes.isProtected(w, p.ped));
});

test('Spray & Go: an unseen respray clears your wanted level; with a witness they refuse', async () => {
  const w = makeWorld();
  const covered = (b) => w.map.cameras.some((c) => Math.hypot(c.x - (b.tx + 1.5) * 32, c.y - (b.ty + 1.5) * 32) < c.r + 60);
  const i = w.map.bays.findIndex((b) => !covered(b));
  assert.ok(i >= 0, 'a bay out of camera view');
  const b = w.map.bays[i];
  const { p, prof } = joinPlayer(w, { cash: 0, bank: 1000 });
  const cx = (b.tx + 1.5) * 32, cy = (b.ty + 1.5) * 32;
  const v = w.spawnVehicle('sedan', cx, cy, 0, { npcOwned: false });
  teleport(w, p.ped, cx + 20, cy);
  assert.ok((await import('../server/systems/vehicles.js')).tryEnter(w, p.ped));
  const paint0 = v.paint;
  // seen: a cop is watching
  p.heat = 40; p.wanted = 2; p.seenAt = -99;
  const door = w.map.pois[b.poi]; // standing out front, looking into the bay
  const cop = spawnNpc(w, 'cop', door.x, door.y + (b.south ? 60 : -60), 'cop');
  cop.a = Math.atan2(cy - cop.y, cx - cop.x);
  run(w, 1);
  assert.equal(v.paint, paint0, 'refused while watched');
  assert.equal(prof.bank, 1000);
  w.remove(cop);
  p.heat = 40; p.wanted = 2; p.seenAt = -99;
  v.vx = 0; v.vy = 0;
  run(w, PAINT_TIME_S + 1);
  assert.notEqual(v.paint, paint0, 'new colour');
  assert.equal(prof.bank, 1000 - PAINT_PRICE);
  assert.equal(p.wanted, 0, 'wanted level cleared');
});

test('felony fines: pay them at the courthouse or police for a clean record (not while wanted)', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0, bank: 5000, felonies: 2, peakWanted: 3 });
  const court = w.map.pois.find((q) => q.kind === 'courthouse');
  teleport(w, p.ped, court.x, court.y);
  p.wanted = 1; p.heat = 20;
  economy.handleMenu(w, p, court.id, 'payrecord');
  assert.equal(prof.felonies, 2, 'not while wanted');
  p.wanted = 0; p.heat = 0;
  economy.handleMenu(w, p, court.id, 'payrecord');
  assert.equal(prof.felonies, 0);
  assert.equal(prof.bank, 5000 - 2 * FELONY_FINE);
});

test('tackle shops: rods and bait; chosen bait is used up on a catch; fish sell there', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0, bank: 500 });
  const shops = w.map.pois.filter((q) => q.kind === 'tackle');
  assert.ok(shops.length >= 3, 'several bait shops');
  const shop = shops[0];
  teleport(w, p.ped, shop.x, shop.y);
  economy.handleMenu(w, p, shop.id, 'w:rod:60');
  assert.ok(prof.weapons.rod !== undefined);
  economy.handleMenu(w, p, shop.id, 'i:squid:35:3');
  economy.handleMenu(w, p, shop.id, 'i:worms:10:5');
  economy.handleMenu(w, p, shop.id, 'bait:squid');
  assert.equal(prof.bait, 'squid');
  p.ped.fishing = { biteAt: w.time - 0.1, window: 2, kind: 'shore', x: p.ped.x, y: p.ped.y };
  jobs.reelIn(w, p);
  assert.equal(prof.inventory.squid, 2, 'one squid used');
  assert.equal(prof.inventory.worms, 5);
  const fish = ['bass', 'catfish', 'salmon', 'tuna'].find((f) => prof.inventory[f] > 0);
  assert.ok(fish);
  const bank = prof.bank;
  economy.handleMenu(w, p, shop.id, `s:${fish}`);
  assert.ok(prof.bank > bank, 'sold to the bank');
});
