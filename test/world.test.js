// Dealership lots and driving out of your home garage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, TILE } from '../shared/constants.js';
import { DISTRICTS, HERO_CORNER } from '../shared/map.js';
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

test('bicycles: sold at the dealership, slower than a motorcycle, and they buckle instead of blowing up', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { bank: 5000 });
  const dealer = w.map.pois.find((q) => q.kind === 'dealer');
  assert.ok(economy.buildMenu(w, p, dealer).opts.some((o) => o.id === 'vb:bicycle'), 'on sale');
  const bike = w.spawnVehicle('bicycle', dealer.x, dealer.y + 200, 0, { npcOwned: false });
  assert.ok(bike.def.max < w.spawnVehicle('bike', dealer.x + 200, dealer.y + 200, 0, {}).def.max * 0.6);
  teleport(w, p.ped, bike.x + 12, bike.y + 12);
  bike.seats[0] = p.ped.id; p.ped.vehId = bike.id; p.ped.seat = 0;
  const events = [];
  const emit = w.emit.bind(w);
  w.emit = (x, y, ev) => { events.push(ev.e); emit(x, y, ev); };
  vehicles.damageVehicle(w, bike, 999, null, true);
  assert.ok(bike.wreckAt, 'wrecked');
  assert.ok(!events.includes('explode'), 'no explosion');
  assert.equal(p.ped.vehId, 0, 'rider thrown off');
  assert.ok(!p.ped.dead);
});

test('ATMs in every district with streets (set into building fronts, a few inside); walking up to one banks your cash; the city feed logs events', async () => {
  const { DISTRICTS } = await import('../shared/map.js');
  const events = await import('../server/systems/events.js');
  const phone = await import('../server/systems/phone.js');
  const w = makeWorld();
  const m = w.map;
  const per = new Map();
  for (const a of m.atms) { const d = m.districtAt(a.x, a.y).id; per.set(d, (per.get(d) || 0) + 1); }
  DISTRICTS.forEach((d, di) => {
    let road = 0;
    for (let i = 0; i < m.tiles.length && road < 40; i++) if (m.dist[i] === di && m.tiles[i] === 3) road++;
    if (road >= 40 && d.style !== 'rocky' && d.style !== 'wild') assert.ok(per.get(di) >= 1, `${d.name} has an ATM`);
  });
  assert.ok(m.atms.length >= 90, `plenty of ATMs (${m.atms.length})`);
  assert.ok([...per.values()].filter((n) => n >= 3).length >= 15, 'busy districts have several');
  // a cash machine stands against a building front (or inside one), not out on the pavement
  const machines = m.props.filter((q) => q.t === 'atmw');
  const walled = machines.filter((q) => q.inside !== undefined || m.tileAtPx(q.x, q.y - 12) === 5);
  assert.ok(walled.length >= machines.length - 4, `${machines.length - walled.length} freestanding`);
  assert.ok(machines.some((q) => q.inside !== undefined), 'some are inside clubs and stores');
  const { p, prof } = joinPlayer(w, { cash: 750, bank: 100 });
  const atm = m.atms[0];
  teleport(w, p.ped, atm.x + 120, atm.y);
  run(w, 0.5);
  assert.equal(prof.cash, 750, 'not banked from across the street');
  teleport(w, p.ped, atm.x + 10, atm.y + 4);
  run(w, 0.5);
  assert.equal(prof.cash, 0);
  assert.equal(prof.bank, 850, 'walked up and banked it');
  // feed: events anywhere show up on the phone, with a place to go
  events.add(w, { kind: 'robbery', x: 20000, y: 20000, until: w.time + 60 });
  const f = phone.handle(w, p, { a: 'feed' });
  assert.equal(f.t, 'feed');
  assert.ok(f.items[0].text && f.items[0].x === 20000 && f.items[0].where, 'the newest item first, with where it is');
});

test('lost pets: one runs off near you, take its collar, walk it to the owner for a reward', async () => {
  const pets = await import('../server/systems/pets.js');
  const { PET_REWARD, PET_SAMARITAN } = await import('../shared/rules.js');
  const combat = await import('../server/systems/combat.js');
  const w = makeWorld();
  const shop = w.map.pois.find((q) => q.kind === 'coffee');
  const { p, prof } = joinPlayer(w, { cash: 0 });
  teleport(w, p.ped, shop.x, shop.y + 40);
  let pet = null;
  for (let k = 0; k < 20 && !pet; k++) pet = pets.spawnLost(w, p);
  assert.ok(pet, 'a pet went missing');
  const owner = w.get(pet.pet.owner);
  assert.ok(owner && owner.npc.petOwner === pet.id);
  assert.ok(w.happenings.some((e) => e.kind === 'pet'), 'on the radar');
  assert.equal(combat.damage(w, pet, 50, p.ped, 'melee'), false, 'nobody hurts a lost pet');
  teleport(w, p.ped, pet.x + 20, pet.y);
  let act = players.findInteraction(w, p);
  assert.ok(act && /collar/.test(act.label), act && act.label);
  act.run();
  assert.equal(pet.pet.follow, p.ped.id);
  // walk to the owner: the pet follows at heel
  for (let k = 0; k < 120; k++) {
    const dx = owner.x - p.ped.x, dy = owner.y - p.ped.y, d = Math.hypot(dx, dy);
    if (d < 60) break;
    teleport(w, p.ped, p.ped.x + dx / d * Math.min(40, d - 50), p.ped.y + dy / d * Math.min(40, d - 50));
    run(w, 0.5);
    assert.equal(pet.pet.follow, p.ped.id, 'still on the collar');
  }
  assert.ok(Math.hypot(pet.x - p.ped.x, pet.y - p.ped.y) < 200, 'it kept up');
  act = players.findInteraction(w, p);
  assert.ok(act && /Give .* back/.test(act.label), act && act.label);
  act.run();
  assert.equal(prof.cash, PET_REWARD);
  assert.ok(prof.samaritan >= PET_SAMARITAN);
  assert.ok(!w.get(pet.id), 'home again');
});

test('nightclubs: shutters down by day, open after dark, a bar inside', async () => {
  const { DAY_PART_S } = await import('../shared/constants.js');
  const w = makeWorld();
  const clubs = w.map.pois.filter((q) => q.kind === 'club');
  assert.ok(clubs.length >= 3, `clubs (${clubs.length})`);
  const club = clubs.find((c) => c.gate !== undefined);
  assert.ok(club, 'a club with a shutter');
  const gate = w.map.gates[club.gate];
  w.loopTime = 90; run(w, 0.5);
  assert.ok(gate.props.every((pr) => !pr.off), 'shut by day');
  w.loopTime = DAY_PART_S + 5; run(w, 0.5);
  assert.ok(w.clock.isNight);
  assert.ok(gate.props.every((pr) => pr.off), 'open at night');
  const { p } = joinPlayer(w, { cash: 100 });
  const menu = economy.buildMenu(w, p, club);
  assert.ok(menu.opts.some((o) => /Cocktail/.test(o.label)), 'cocktails at the bar');
});

test('the hero corner: Holly St x Madison St in Midtown - a signalled crossroads, the walk-in diner and corner mart, iron lamps', () => {
  const w = makeWorld(), m = w.map;
  const J = m.nodes.find((n) => n && n.hero);
  assert.ok(J, 'the crossroads is laid');
  assert.equal(J.edges.length, 4, 'four ways');
  assert.equal(DISTRICTS[m.districtAt(J.x, J.y).id].name, HERO_CORNER.district);
  assert.ok(J.light, 'signalled');
  const names = new Set(J.edges.map((id) => m.edges[id].name));
  assert.equal(names.size, 2, `two streets cross (${[...names]})`);
  for (const [name, kind, sx] of [[HERO_CORNER.diner, 'coffee', -1], [HERO_CORNER.mart, 'convenience', 1]]) {
    const b = m.buildings.find((o) => o.name === name && !o.gone);
    assert.ok(b && b.hero && b.art, `${name} stands`);
    // on its own corner, north of Madison Street
    assert.ok(Math.sign((b.tx + b.tw / 2) * TILE - J.x) === sx && (b.ty + b.th) * TILE < J.y, `${name} on its corner`);
    assert.ok(b.walkIn && b.walkIn.units.some((u) => u.kind === kind), `${name} is a walk-in ${kind}`);
    assert.ok(m.pois.some((p) => p.kind === kind && p.b === b.id), `${name} trades as ${kind}`);
  }
  const lamps = m.props.filter((p) => p.t === 'lamp' && Math.abs(p.x - J.x) < 600 && Math.abs(p.y - J.y) < 600);
  assert.ok(lamps.length >= 5 && lamps.filter((p) => p.style === 'iron').length >= 5, 'black iron lamps round the corner');
  assert.ok(m.props.some((p) => p.t === 'foodcart' && Math.hypot(p.x - J.x, p.y - J.y) < 600), 'the hot-dog cart');
});
