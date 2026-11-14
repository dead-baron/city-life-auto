// Your car (the owner, 2026-11-14: "map + valet delivery, no teleport"; server/systems/mycar.js, the numbers:
// shared/rules.js VALET): the car you last took out stays where you left it (a logoff, a restart) and shows on your map;
// the phone's "Have it delivered" - a valet parks it on a proper space near you, out of sight, for a fee and a cooldown;
// not while wanted; a wrecked one costs more. And no parked vehicle on a pavement (shared/parkcheck.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T, TILE } from '../shared/constants.js';
import { VALET } from '../shared/rules.js';
import { VEHICLES } from '../shared/vehicles.js';
import { parkWhy } from '../shared/parkcheck.js';
import { store } from '../server/store.js';
import * as mycar from '../server/systems/mycar.js';
import * as homes from '../server/systems/homes.js';
import * as insurance from '../server/systems/insurance.js';
import * as players from '../server/systems/players.js';
import * as phone from '../server/systems/phone.js';

const tileAt = (m, x, y) => m.tiles[m.idx(Math.floor(x / TILE), Math.floor(y / TILE))];
// a parking bay out in town (not a home's, on proper ground) and a spot on foot a little way from it
function townBay(w, far = 0) {
  const m = w.map, lots = homes.homeLotSpots(m);
  const ok = m.parking.map((sp, i) => ({ sp, i })).filter(({ sp, i }) => !sp.drive && !lots.has(i) && !parkWhy(m, sp.x, sp.y, sp.a, VEHICLES.sedan.L, VEHICLES.sedan.W, true));
  return ok[far ? ok.length - 1 : Math.floor(ok.length / 2)].sp;
}
function ownCar(w, p, spot) {
  p.profile.vehicles.push({ model: 'sedan', paint: 1 });
  assert.equal(homes.spawnOwnedAt(w, p, p.profile.vehicles.length - 1, { x: spot.x, y: spot.y, a: spot.a || 0 }, { keep: true }), null);
  return w.get(p.activeVehicle);
}

test('your car stays where you left it and shows on your map - through a logoff and a restart', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w);
  const bay = townBay(w);
  const v = ownCar(w, p, bay);
  teleport(w, p.ped, bay.x + 300, bay.y);
  const car = players.buildMe(w, p).car;
  assert.ok(car && car[0] === Math.round(v.x) && car[1] === Math.round(v.y) && car[2] === v.def.i, 'on your map');
  run(w, 6);
  assert.ok(prof.carAt && prof.carAt.vid === v.ownVid && Math.abs(prof.carAt.x - v.x) < 1, 'its place kept with the character');
  // a restart: a new world, the same profile - the car back on its space
  const w2 = makeWorld({ keepKept: true });
  const again = players.join(w2, conn, prof);
  const v2 = w2.get(again.activeVehicle);
  assert.ok(v2 && v2.owner === prof.pid && v2.ownVid === prof.carAt.vid && Math.hypot(v2.x - bay.x, v2.y - bay.y) < 1, 'put back where you left it');
  void store;
});

test('Have it delivered: a valet parks it on a proper space near you, out of sight, after a wait, for the fee; then the cooldown', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 1000, bank: 0 });
  const far = townBay(w, 1), near = townBay(w);
  ownCar(w, p, far);
  teleport(w, p.ped, near.x, near.y);
  // wanted: no valet
  p.wanted = 1;
  assert.match(mycar.request(w, p), /wanted/);
  p.wanted = 0;
  assert.equal(phone.handle(w, p, { a: 'valet' }), null);
  assert.ok(p.valet, 'on its way');
  assert.equal(prof.cash, 1000 - VALET.fee, 'the fee');
  const before = w.get(p.activeVehicle);
  run(w, VALET.waitS + 0.5);
  assert.ok(!p.valet, 'delivered');
  const v = w.get(p.activeVehicle);
  assert.ok(v && v !== before && !w.get(before.id), 'your car, brought round (the one left far away gone)');
  const d = Math.hypot(v.x - p.ped.x, v.y - p.ped.y);
  assert.ok(d >= VALET.minD - 1 && d <= VALET.maxD + 1, `a short walk away (${Math.round(d)} px)`);
  assert.equal(parkWhy(w.map, v.x, v.y, v.a, v.def.L, v.def.W), null, 'on the road or a car park - never the pavement');
  assert.ok([T.ROAD, T.LOT, T.BRIDGE, T.DIRT].includes(tileAt(w.map, v.x, v.y)));
  // the cooldown
  teleport(w, p.ped, far.x, far.y);
  assert.match(mycar.request(w, p), /try again/);
});

test('a wrecked car comes from the body shop: the bigger fee', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0, bank: 5000 });
  const far = townBay(w, 1), near = townBay(w);
  const v = ownCar(w, p, far);
  prof.vehicles[0].ins = 1;
  v.wreckAt = w.time;
  assert.equal(insurance.wrecked(w, v, 'wrecked'), 'claim');
  assert.equal(prof.vehicles[0].wr, 1);
  teleport(w, p.ped, near.x, near.y);
  const bank = prof.bank;
  assert.equal(mycar.request(w, p), null);
  assert.equal(prof.bank, bank - VALET.wreckFee);
  run(w, VALET.waitS + 0.5);
  const nv = w.get(p.activeVehicle);
  assert.ok(nv && nv !== v && !nv.wreckAt, 'a mended car parked near you');
  assert.equal(prof.vehicles[0].wr, undefined);
});

test('no car, no valet; a car close by: just walk to it', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 1000 });
  assert.match(mycar.request(w, p), /no car/);
  const near = townBay(w);
  ownCar(w, p, near);
  teleport(w, p.ped, near.x + 100, near.y);
  assert.match(mycar.request(w, p), /only .* away/);
});
