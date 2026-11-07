// The starter car (server/systems/starter.js; shared/rules.js STARTER): first day in the arrival station's car park,
// registered to you and never sold, free again at any public garage once lost (after the cooldown), at home once you own
// a garage, one per player, kept across a rejoin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players, fakeConn, store } from './helpers.js';
import { K } from '../shared/constants.js';
import { STARTER } from '../shared/rules.js';
import { VEHICLES } from '../shared/vehicles.js';
import { SHOPS } from '../shared/items.js';
import * as economy from '../server/systems/economy.js';
import * as homes from '../server/systems/homes.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as dealer from '../server/systems/dealer.js';
import { publicGarages, arrivalStation, arrivalFor, defaultArrival, onPlayerGone, overflowOf } from '../server/systems/starter.js';
import * as ftue from '../server/systems/ftue.js';

const starters = (w, pid) => [...w.entities.values()].filter((e) => e.kind === K.VEH && !e.removed && e.starter === pid);
const one = (w, pid) => { const s = starters(w, pid); assert.equal(s.length, 1, `one starter for the player (${s.length})`); return s[0]; };
const optOf = (w, p, poi, id) => economy.buildMenu(w, p, poi).opts.find((o) => o.id === id);
// stand at a POI (on foot) and pick a menu option; the toasts it raised
function pick(w, p, poi, id) {
  if (p.ped.vehId) vehicles.ejectPed(w, p.ped, true);
  teleport(w, p.ped, poi.x, poi.y);
  p.toasts.length = 0;
  economy.handleMenu(w, p, poi.id, id);
  return p.toasts.map((t) => t.text).join(' | ');
}
const station = (w) => w.map.pois[publicGarages(w.map).find((g) => g.station).poi];   // (a station with a car park)
// every note the world shows anyone: [player, text]
function listen(w) { const out = [], n0 = w.notify.bind(w); w.notify = (pl, text, ...r) => { out.push([pl, text]); return n0(pl, text, ...r); }; return out; }
const lose = (w, v) => { w.remove(v); run(w, 1); };
// the clock on s seconds (no need to step the whole world through a five-minute wait), then a moment's ticks
const skip = (w, s) => { w.time += s; run(w, 0.6); };

test('first day: a new character finds their starter car in the arrival station\'s car park', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const v = one(w, prof.pid);
  assert.equal(v.model, 'starter');
  assert.equal(v.def.name, 'Rusty Compact');
  assert.equal(v.paint, STARTER.paint); assert.equal(v.tint, STARTER.paint);   // (the rust brown, over the Hatchback's art)
  assert.equal(VEHICLES.starter.art, 'compact'); assert.equal(VEHICLES.starter.look, 'compact');
  assert.ok(VEHICLES.starter.max < VEHICLES.compact.max && VEHICLES.starter.accel < VEHICLES.compact.accel, 'slow: slower than the Hatchback');
  // the arrival station: until they pick one (the FTUE's card - test/ftue.test.js), the default of the stations to
  // choose from - on a map without arrival lines the station with a car park nearest where new characters wake - and the
  // car is in its car park
  const g = arrivalFor(w, p), st = w.map.pois[g.poi], sp = w.map.spawns.default;
  assert.equal(st.kind, 'station');
  assert.equal(g.poi, defaultArrival(w).poi);
  assert.equal(arrivalStation(w, sp.x, sp.y).poi, g.poi, 'the nearest where new characters wake');
  for (const o of publicGarages(w.map)) if (o.station) { const q = w.map.pois[o.poi]; assert.ok(Math.hypot(q.x - sp.x, q.y - sp.y) >= Math.hypot(st.x - sp.x, st.y - sp.y) - 1, `${q.label} is no nearer`); }
  assert.ok(Math.hypot(v.x - st.x, v.y - st.y) <= STARTER.lotR, 'in the station\'s car park');
  assert.ok(w.map.parking.some((sp) => Math.hypot(sp.x - v.x, sp.y - v.y) < 1), 'in a parking space');
  assert.ok(!p.toasts.some((t) => t.text.includes('starter car is waiting')), 'not told yet: where to arrive is still to pick (the FTUE\'s card)');
  ftue.pick(w, p, null);   // (the default taken)
  assert.ok(p.toasts.some((t) => t.text.includes(st.label)), 'told where it waits once it\'s picked');
  assert.equal(prof.starter.first, undefined, 'the first day is over');
  // an existing character (from before starters) gets none in a car park - only from a public garage
  const { prof: old } = joinPlayer(w, { starter: undefined });
  assert.equal(starters(w, old.pid).length, 0);
  assert.deepEqual(old.starter, {});
});

test('registered to you, never sold: no price, no dealer stock, no slot in your garage, no one else\'s garage - but it steals easily', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e6 });
  const v = one(w, prof.pid);
  assert.equal(v.owner, prof.pid); assert.equal(v.ownerName, p.name);
  assert.equal(v.despawnable, false, 'never tidied away like a stranger\'s car');
  assert.equal(VEHICLES.starter.price, undefined, 'no price: nothing buys or sells it');
  assert.ok(!SHOPS.dealer.buy.includes('starter'), 'no dealer sells it');
  const dl = w.map.pois.find((q) => q.kind === 'dealer');
  assert.ok(!economy.buildMenu(w, p, dl).opts.some((o) => o.id === 'vb:starter'));
  assert.match(pick(w, p, dl, 'vb:starter'), /not available/);
  for (const ls of w.lotState) for (const s of ls) { const e = w.get(s.v); assert.ok(!e || e.model !== 'starter', 'never on a lot'); }
  dealer.update(w);
  assert.equal(prof.vehicles.length, 0, 'not one of your cars');
  // someone else takes it: no lock, plain theft - and their garage won't keep it
  const { p: thief, prof: tp } = joinPlayer(w, { bank: 1e6, starter: {} });   // (no starter car of their own to get into instead)
  teleport(w, thief.ped, v.x + 40, v.y);
  assert.equal(vehicles.entryInfo(w, thief, v).crime, 'theft');
  assert.ok(vehicles.tryEnter(w, thief.ped));
  assert.equal(thief.ped.vehId, v.id, 'in and away');
  const h = w.map.homes.find((q) => q.garage && !w.homeOwner.has(q.id));
  homes.claim(w, thief, h, h.price);
  teleport(w, v, h.garage.x, h.garage.y); thief.ped.x = v.x; thief.ped.y = v.y;
  thief.toasts.length = 0;
  assert.equal(homes.storeVehicle(w, thief, v, h), 'registered');
  assert.ok(!v.removed && tp.vehicles.length === 0, 'not in the thief\'s garage');
  assert.ok(thief.toasts.some((t) => t.text.includes(p.name)), 'registered to its owner');
});

test('lost: free again at any public garage once the cooldown is up - a station\'s car park, a Fresh Coat Garage, a dealership', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const v = one(w, prof.pid), notes = listen(w);
  v.wreckAt = w.time; run(w, 1);   // wrecked
  assert.equal(starters(w, prof.pid).length, 0, 'the burnt shell is no starter');
  assert.ok(notes.some(([q, t]) => q === p && /starter car is wrecked/.test(t)));
  assert.ok(prof.starter.readyAt > Date.now() + (STARTER.cooldownS - 5) * 1000, 'the cooldown, on the profile');
  const st = station(w), garage = w.map.pois.find((q) => q.kind === 'garage'), dl = w.map.pois.find((q) => q.kind === 'dealer');
  for (const g of [st, garage, dl]) {
    const o = optOf(w, p, g, 'starter');
    assert.ok(o && o.dis && /ready in [45]:\d\d/.test(o.label), `${g.label}: ${o && o.label}`);
  }
  assert.match(pick(w, p, garage, 'starter'), /not available/i);
  assert.equal(starters(w, prof.pid).length, 0, 'not before the cooldown');
  skip(w, STARTER.cooldownS - 60);
  assert.ok(optOf(w, p, st, 'starter').dis, 'a minute to go');
  skip(w, 61);
  for (const g of [st, garage, dl]) assert.ok(!optOf(w, p, g, 'starter').dis, `${g.label}: ready`);
  assert.match(economy.poiLabel(w, p, garage), /starter car/, 'the garage\'s prompt says so');
  pick(w, p, st, 'starter');
  const v2 = one(w, prof.pid);
  assert.ok(Math.hypot(v2.x - st.x, v2.y - st.y) <= STARTER.lotR, 'in the station\'s car park');
  assert.equal(prof.starter.readyAt, undefined);
  // out and intact: any garage brings that one round (no new car, no cooldown)
  pick(w, p, dl, 'starter');
  const v3 = one(w, prof.pid);
  assert.equal(v3.id, v2.id, 'the same car, brought round');
  assert.ok(publicGarages(w.map).find((g) => g.poi === dl.id).spots.some((sp) => Math.hypot(v3.x - sp.x, v3.y - sp.y) < 1), 'on the dealership\'s lot');
  // despawned (any way at all): lost, the cooldown again
  lose(w, v3);
  assert.equal(optOf(w, p, garage, 'starter').dis, true);
});

test('own a home with a garage: the starter moves there and comes out of it; the public garages send you home', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e6 });
  const v = one(w, prof.pid);
  const h = w.map.homes.find((q) => q.garage && !w.homeOwner.has(q.id) && q.kind !== 'apartment');
  const hp = w.map.pois.find((q) => q.kind === 'home' && q.home === h.id);
  pick(w, p, hp, 'hbuy');
  assert.ok(homes.ownedHomes(w, prof).includes(h));
  assert.ok(v.removed && starters(w, prof.pid).length === 0, 'moved off the street into the garage');
  assert.ok(p.toasts.some((t) => t.text.includes(`garage at ${h.name}`)));
  const garage = w.map.pois.find((q) => q.kind === 'garage');
  const o = optOf(w, p, garage, 'starter');
  assert.ok(o.dis && o.label.includes(h.name), o.label);
  assert.equal(economy.poiLabel(w, p, garage).includes('starter'), false);
  // out of the home's garage, onto its driveway - free, no cooldown (it was put away, not lost)
  const ho = optOf(w, p, hp, 'hstarter');
  assert.ok(ho && !ho.dis, ho && ho.label);
  pick(w, p, hp, 'hstarter');
  const v2 = one(w, prof.pid);
  assert.ok(Math.hypot(v2.x - h.garage.x, v2.y - h.garage.y) < 5, 'at the garage');
  // parked back in: put away (not one of the cars' slots), and out again at once
  teleport(w, v2, h.garage.x, h.garage.y);
  homes.storeVehicle(w, p, v2, h);
  run(w, 1);
  assert.ok(v2.removed && prof.vehicles.length === 0, 'in the garage, no slot taken');
  assert.equal(optOf(w, p, hp, 'hstarter').dis, undefined, 'no cooldown');
  // wrecked: the cooldown, at home too
  pick(w, p, hp, 'hstarter');
  const notes = listen(w);
  one(w, prof.pid).wreckAt = w.time; run(w, 1);
  assert.ok(optOf(w, p, hp, 'hstarter').dis);
  assert.ok(notes.some(([q, t]) => q === p && t.includes(`in your garage at ${h.name}`)));
});

test('one per player: fetching again brings the same one round; a stolen one left empty is taken away and free again', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const { p: thief } = joinPlayer(w);
  const v = one(w, prof.pid);
  const st = station(w), garage = w.map.pois.find((q) => q.kind === 'garage');
  for (let i = 0; i < 3; i++) { pick(w, p, i % 2 ? st : garage, 'starter'); one(w, prof.pid); }
  assert.equal(one(w, prof.pid).id, v.id);
  // stolen and driven off: not the garages' to hand out while someone has it
  teleport(w, thief.ped, v.x + 40, v.y);
  assert.ok(vehicles.tryEnter(w, thief.ped));
  run(w, 1);
  const o = optOf(w, p, garage, 'starter');
  assert.ok(o.dis && /someone else/.test(o.label), o.label);
  assert.match(pick(w, p, garage, 'starter'), /not available/i);
  one(w, prof.pid);
  // ...left empty out of sight: taken away after strayS - lost, then free after the cooldown
  vehicles.ejectPed(w, thief.ped, true);
  teleport(w, thief.ped, v.x + 6000, v.y); teleport(w, p.ped, v.x + 6000, v.y + 200);
  w.players.forEach((q) => { if (q !== p && q !== thief) q.conn = null; });
  run(w, 1); skip(w, STARTER.strayS + 1);
  assert.ok(v.removed, 'the strayed starter is gone');
  assert.equal(starters(w, prof.pid).length, 0);
  skip(w, STARTER.cooldownS + 1);
  pick(w, p, garage, 'starter');
  const v2 = one(w, prof.pid);
  assert.notEqual(v2.id, v.id);
  // a second starter can never sit beside the first, even made directly: the old one goes (or, with someone in it, is
  // nobody's starter any more)
  teleport(w, thief.ped, v2.x + 40, v2.y);
  assert.ok(vehicles.tryEnter(w, thief.ped));
  w.starter.lostAt.set(prof.pid, w.time - STARTER.cooldownS - 1); w.starter.car.delete(prof.pid);   // (as if the garage lost track of it)
  pick(w, p, garage, 'starter');
  const now = one(w, prof.pid);
  assert.notEqual(now.id, v2.id);
  assert.equal(v2.starter, 0); assert.equal(v2.owner, null);
});

test('kept across a rejoin and a restart: the first day isn\'t repeated, a lost one\'s cooldown carries on', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const v = one(w, prof.pid);
  // log off and come back on the same server: the same car, still waiting
  players.leave(w, p);
  run(w, 0.2);
  const back = players.join(w, fakeConn(), prof);
  assert.equal(one(w, prof.pid).id, v.id, 'the same car');
  // lost, then a restart: the cooldown holds
  lose(w, v);
  const saved = JSON.parse(JSON.stringify(prof));
  assert.ok(saved.starter.readyAt > Date.now(), 'saved with the profile');
  assert.equal(saved.starter.first, undefined);
  void back;
  const w2 = makeWorld({ keepKept: true });
  Object.assign(prof, saved);
  const p2 = players.join(w2, fakeConn(), prof);
  p2.ped.protectUntil = 0;
  assert.equal(starters(w2, prof.pid).length, 0, 'no second first day');
  const garage = w2.map.pois.find((q) => q.kind === 'garage');
  const o = optOf(w2, p2, garage, 'starter');
  assert.ok(o.dis && /ready in [45]:\d\d/.test(o.label), o.label);
  skip(w2, STARTER.cooldownS + 1);
  pick(w2, p2, garage, 'starter');
  one(w2, prof.pid);
  // a profile whose cooldown ran out while away: ready at once
  const w3 = makeWorld({ keepKept: true });
  prof.starter = { readyAt: Date.now() - 1000 };
  const p3 = players.join(w3, fakeConn(), prof);
  assert.equal(optOf(w3, p3, garage, 'starter').dis, undefined);
  assert.equal(prof.starter.readyAt, undefined);
});

test('many new players at once: fifty at the default station inside a minute - each a car, a space of its own, a marker to it', () => {
  const w = makeWorld();
  const g = publicGarages(w.map).find((q) => q.poi === defaultArrival(w).poi), st = w.map.pois[g.poi], spaces = new Set();
  const ps = [];
  for (let i = 0; i < 50; i++) {
    const j = joinPlayer(w);
    j.prof.lookPicked = true;
    ps.push(j);
    run(w, 0.6);   // (the card comes up: fifty players over 30 s)
  }
  for (const { p } of ps) ftue.handle(w, p, { a: 'skip' });   // (each takes the default station)
  const cars = ps.map(({ p, prof }) => {
    const v = one(w, prof.pid);
    assert.equal(arrivalFor(w, p).poi, g.poi, 'the default station');
    const k = `${Math.round(v.x)},${Math.round(v.y)}`;
    assert.ok(!spaces.has(k), `a space of its own (${k})`);
    spaces.add(k);
    assert.ok(g.spots.concat(overflowOf(w.map, g)).some((sp) => Math.hypot(sp.x - v.x, sp.y - v.y) < 1), 'in a space: the lot\'s, or its overflow\'s');
    return v;
  });
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) assert.ok(Math.hypot(cars[i].x - cars[j].x, cars[i].y - cars[j].y) >= 40, 'no two cars on one space');
  const inLot = cars.filter((v) => Math.hypot(v.x - st.x, v.y - st.y) <= STARTER.lotR).length;
  assert.ok(inLot >= Math.min(g.spots.length, 1), `the lot first (${inLot} of ${g.spots.length})`);
  // each one's marker (me.car) points at their own car, nobody else's
  for (const { p, prof } of ps) {
    teleport(w, p.ped, st.x, st.y + 40);
    const m = players.buildMe(w, p).car, v = one(w, prof.pid);
    assert.ok(m, 'a marker');
    assert.deepEqual([m[0], m[1]], [Math.round(v.x), Math.round(v.y)], 'at their own car');
    assert.equal(m[3], 1, 'the full marker until first driven');
  }
  console.log(`# ${g.name}: ${g.spots.length} spaces in its lot, ${inLot} of 50 there, the rest its overflow (${Math.round(Math.max(...cars.map((v) => Math.hypot(v.x - st.x, v.y - st.y))))} px at most)`);
});

test('your car marked: yours alone, parked and empty while you\'re on foot; full until first driven, then small', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const { p: q } = joinPlayer(w, { starter: {} });
  const v = one(w, prof.pid);
  teleport(w, p.ped, v.x + 300, v.y);
  let m = players.buildMe(w, p).car;
  assert.deepEqual(m, [Math.round(v.x), Math.round(v.y), v.def.i, 1]);
  assert.equal(players.buildMe(w, q).car, null, 'nobody else\'s screen');
  // in it: no marker; driven a little: from now on the small one
  for (const e of w.query(v.x, v.y, 160, K.VEH)) if (e !== v) w.remove(e);
  teleport(w, p.ped, v.x, v.y + v.def.W / 2 + 8);
  assert.ok(vehicles.tryEnter(w, p.ped));
  assert.equal(players.buildMe(w, p).car, null, 'in it');
  v.vx = 200; run(w, 0.6);
  assert.equal(prof.starter.drove, 1, 'first driven');
  vehicles.ejectPed(w, p.ped, true); v.vx = 0; v.vy = 0;
  run(w, 0.2);
  m = players.buildMe(w, p).car;
  assert.ok(m && m[3] === 0, 'the small marker after');
  // someone else in it: none
  teleport(w, q.ped, v.x, v.y + v.def.W / 2 + 8);
  vehicles.tryEnter(w, q.ped); vehicles.tryEnter(w, q.ped);
  if (q.ped.vehId === v.id) assert.equal(players.buildMe(w, p).car, null, 'out with someone in it');
});

test('logged off: a parked starter is put away (no cooldown) and comes back where it was on rejoining - it doesn\'t fill the lot', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const v = one(w, prof.pid), x = Math.round(v.x), y = Math.round(v.y);
  v.hp = v.def.hp * 0.5;
  // (players.js finalizeLogout, past the ghost window)
  players.leave(w, p); onPlayerGone(w, p);
  assert.equal(starters(w, prof.pid).length, 0, 'put away');
  assert.deepEqual([prof.starter.away.x, prof.starter.away.y], [x, y]);
  assert.equal(prof.starter.readyAt, undefined, 'not lost: no cooldown');
  const w2 = makeWorld({ keepKept: true });
  players.join(w2, fakeConn(), prof);
  const back = one(w2, prof.pid);
  assert.deepEqual([Math.round(back.x), Math.round(back.y)], [x, y], 'back where it was');
  assert.ok(Math.abs(back.hp - v.def.hp * 0.5) < 1, 'as it was');
  assert.equal(prof.starter.away, undefined);
});
