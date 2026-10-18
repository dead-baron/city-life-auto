// The shopping cart (task #329; the owner, 2026-10-18): a vehicle kicked along from the back and ridden on its back rail,
// as fast as a bike, one rides in the basket; a crash throws the one in the basket, often the driver, and two loaded carts
// head on throw everyone. They stand outside the groceries and markets, free to take.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run, straightRoad } from './helpers.js';
import { T, TILE, K } from '../shared/constants.js';
import { VEHICLES, VEHICLE_BY_INDEX } from '../shared/vehicles.js';
import { CART } from '../shared/rules.js';
import { vehStep, newVehState } from '../shared/physics.js';
import { POSES } from '../client/art2/people.js';
import { pedSprite } from '../client/art2/game/peds.js';
import { vehicleModel } from '../client/art2/vehicles.js';
import * as vehicles from '../server/systems/vehicles.js';
import { cartSpots } from '../server/systems/traffic.js';
import * as players from '../server/systems/players.js';

const W = makeWorld();
const ROAD = straightRoad(W.map, 1200);
const C = VEHICLES.cart;
const seat = (v, ped, i) => { teleport(W, ped, v.x, v.y); ped.vehId = v.id; ped.seat = i; v.seats[i] = ped.id; ped.hidden = false; };
const thrown = (ped) => !ped.vehId && W.time < (ped.airUntil || 0);

test('the shopping cart: a bike\'s speed on the road, hopeless on grass; light on its casters; two aboard', () => {
  assert.ok(C && C.cart && C.kind === 'bike' && C.pedal && VEHICLE_BY_INDEX[C.i] === C);
  assert.equal(C.max, VEHICLES.bicycle.max, 'as fast as the commuter bike');
  assert.equal(C.seats, 2, 'the driver and one in the basket');
  assert.ok(C.crew[0][0] < -C.L / 2 && Math.abs(C.crew[1][0]) < C.L / 2, 'the driver stands behind it, the passenger sits in it');
  const at = (tile) => ({ w: 1e5, h: 1e5, tileAt: () => tile, tileAtPx: () => tile, solidProps: new Map(), levels: null, inside: () => true, idx: () => 0, frame: null });
  const top = (tile) => { const s = newVehState(5000, 5000, 0); for (let i = 0; i < 100; i++) vehStep(s, { throttle: 1, steer: 0, hb: false, slide: false, drv: true }, 0.05, at(tile), C, {}); return Math.hypot(s.vx, s.vy); };
  const road = top(T.ROAD), grass = top(T.GRASS);
  assert.ok(road > C.max * 0.9, `on the road: ${Math.round(road)} px/s`);
  assert.ok(grass < road * 0.6, `on the grass the casters dig in: ${Math.round(grass)} px/s`);
  assert.ok(C.grip < VEHICLES.bicycle.grip, 'it slides round the corners more than a bike');
});

test('a cart into a wall: the one in the basket goes flying; the driver often does, always when it\'s hard', () => {
  const v = W.spawnVehicle('cart', ROAD.x + 400, ROAD.y, 0, { npcOwned: false });
  const a = joinPlayer(W).p, b = joinPlayer(W).p;
  seat(v, a.ped, 0); seat(v, b.ped, 1);
  const rand = W.rand;
  W.rand = () => 0.99;   // (the driver hangs on whenever the chance allows)
  vehicles.cartCrash(W, v, CART.hit + 30);
  assert.ok(thrown(b.ped), 'the passenger is thrown');
  assert.equal(a.ped.vehId, v.id, 'a light knock: the driver can hang on');
  W.time += 1;
  seat(v, b.ped, 1);
  vehicles.cartCrash(W, v, CART.hard + 10);
  assert.ok(thrown(a.ped) && thrown(b.ped), 'a hard one: both off');
  W.rand = () => 0.01;
  W.time += 1;
  for (const q of [a, b]) { q.ped.airUntil = 0; q.ped.downUntil = 0; }
  seat(v, a.ped, 0);
  vehicles.cartCrash(W, v, CART.hit + 5);
  assert.ok(thrown(a.ped), 'and often the driver on a light one too');
  W.rand = rand;
  // nothing happens below the line, and it's hurt a little, not a lot
  W.time += 1; for (const q of [a, b]) { q.ped.airUntil = 0; q.ped.downUntil = 0; q.ped.hp = q.ped.maxHp; }
  seat(v, a.ped, 0); seat(v, b.ped, 1);
  vehicles.cartCrash(W, v, CART.hit - 10);
  assert.ok(a.ped.vehId === v.id && b.ped.vehId === v.id, 'a bump: nobody thrown');
  vehicles.cartCrash(W, v, CART.hard);
  assert.ok(b.ped.maxHp - b.ped.hp <= CART.hurt[1] + 1 && b.ped.hp < b.ped.maxHp, `hurt a little (${b.ped.maxHp - b.ped.hp})`);
  // driven into a wall for real: the physics' impact throws them (stepVehicle)
  W.time += 1; for (const q of [a, b]) { q.ped.airUntil = 0; q.ped.downUntil = 0; }
  let wall = null;
  for (let ty = W.map.y0 + 20; ty < W.map.y0 + W.map.h - 20 && !wall; ty++) for (let tx = W.map.x0 + 20; tx < W.map.x0 + W.map.w - 20; tx++) {
    if (W.map.tileAt(tx, ty) !== T.BUILDING) continue;
    let ok = true; for (let k = 1; k <= 8 && ok; k++) for (const dy of [-1, 0, 1]) if (W.map.tileAt(tx - k, ty + dy) !== T.ROAD && W.map.tileAt(tx - k, ty + dy) !== T.SIDEWALK) ok = false;
    if (ok) wall = [(tx - 6) * TILE, (ty + 0.5) * TILE];
  }
  assert.ok(wall, 'a run up to a wall');
  v.x = wall[0]; v.y = wall[1]; v.a = 0; v.vx = 300; v.vy = 0;
  seat(v, a.ped, 0); seat(v, b.ped, 1);
  v.input = { throttle: 1, steer: 0, hb: false, slide: false, drv: true };
  for (let i = 0; i < 20 && b.ped.vehId; i++) vehicles.stepVehicle(W, v, 0.05);
  assert.ok(!b.ped.vehId, 'into the wall: the passenger thrown out');
  for (const q of [a, b]) { if (q.ped.vehId) vehicles.ejectPed(W, q.ped, false); players.leave(W, q); }
  W.remove(v);
});

test('two loaded carts head on: everyone goes flying', () => {
  const v1 = W.spawnVehicle('cart', ROAD.x + 700, ROAD.y, 0, { npcOwned: false }), v2 = W.spawnVehicle('cart', ROAD.x + 728, ROAD.y, Math.PI, { npcOwned: false });
  const ps = [0, 1, 2, 3].map(() => joinPlayer(W).p);
  seat(v1, ps[0].ped, 0); seat(v1, ps[1].ped, 1); seat(v2, ps[2].ped, 0); seat(v2, ps[3].ped, 1);
  v1.vx = 200; v2.vx = -200;
  const rand = W.rand; W.rand = () => 0.99;   // (even drivers who'd hang on in any other crash)
  W.step();
  W.rand = rand;
  for (const [i, q] of ps.entries()) assert.ok(!q.ped.vehId && W.time < q.ped.airUntil, `rider ${i} thrown`);
  for (const q of ps) players.leave(W, q);
  W.remove(v1); W.remove(v2);
});

test('carts stand outside the groceries, free to take; the riders\' poses and the cart\'s model build', () => {
  const spots = cartSpots(W.map);
  const groc = W.map.pois.filter((p) => p.kind === 'grocery');
  assert.ok(groc.length > 0 && spots.length >= groc.length, `${spots.length} cart spots by ${groc.length} groceries`);
  for (const sp of spots) { const t = W.map.tileAtPx(sp.x, sp.y); assert.ok(t === T.SIDEWALK || t === T.PLAZA || t === T.LOT, 'on the paving'); }
  // a player by one: carts appear there (traffic.js), and taking one is no crime
  const { p } = joinPlayer(W);
  teleport(W, p.ped, spots[0].x + 300, spots[0].y);
  p.joinedAt = W.time;
  run(W, 2);
  const cart = W.query(spots[0].x, spots[0].y, 120, K.VEH).find((e) => e.def && e.def.cart);
  assert.ok(cart, 'a cart by the door');
  assert.equal(vehicles.entryInfo(W, p, cart).crime, null, 'free to take');
  players.leave(W, p);
  // the poses: the kick (8), up on the back rail (2), in the basket - each frame its own
  assert.equal(POSES.cartkick, 8); assert.equal(POSES.cartride, 2); assert.equal(POSES.cartsit, 1);
  const app = { s: 2, h: 1, hc: '#3a2414', t: 4, tc: '#7a3a2a', tc2: '#eee', l: '#4a5a3a', sh: '#eee' };
  const sum = (G) => { let h = 0; for (let i = 0; i < G.col.length; i += 3) h = (Math.imul(h, 31) + G.col[i]) | 0; return h; };
  const set = new Set(); for (let f = 0; f < 8; f++) set.add(sum(pedSprite(app, 'cartkick', 2, f, 0, { ar: 'casual' })));
  set.add(sum(pedSprite(app, 'cartride', 2, 0, 0, { ar: 'casual' }))); set.add(sum(pedSprite(app, 'cartsit', 2, 0, 0, { ar: 'casual' })));
  assert.equal(set.size, 10, 'all different');
  const m = vehicleModel('cart', { variant: 2 });
  let n = 0; for (let i = 0; i < m.v.length; i++) if (m.v[i]) n++;
  assert.ok(m.w === C.L && m.d === C.W && n > 300, `the cart's model: ${m.w} x ${m.d}, ${n} voxels`);
});
