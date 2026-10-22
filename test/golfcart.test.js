// Golf carts to drive - or steal (the owner, 10-08): the carts parked on the golf courses' cart paths were scenery. Now
// they're vehicles (shared/vehicles.js golfcart: electric, slow, two seats under a canopy): parked at spots along the
// paths (m.parking, model 'golfcart'), one there most of the time someone's near; anyone's to take - it's theft.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { K } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { IN } from '../shared/input.js';
import { VEHICLE_DIMS, VEHICLE_TALL, vehicleModel } from '../client/art2/vehicles.js';
import { ENGINE_CLASS } from '../client/sound/vehicles.js';

test('a golf cart: slow, small, electric - drawn, heard', () => {
  const g = VEHICLES.golfcart;
  assert.ok(g && g.kind === 'car' && g.seats === 2);
  assert.ok(g.max < VEHICLES.compact.max * 0.7 && g.L < VEHICLES.compact.L * 0.8, 'slower and smaller than a hatchback');
  assert.ok(VEHICLE_DIMS.golfcart && VEHICLE_TALL.golfcart && ENGINE_CLASS.golfcart === 'electric');
  const m = vehicleModel('golfcart');
  assert.ok(m, 'its model');
});

test('the golf course: carts parked on the cart path - get in one and drive off (it\'s theft)', () => {
  const w = makeWorld();
  const spots = w.map.parking.filter((s) => s.model === 'golfcart');
  assert.ok(spots.length >= 3, `carts' spots on the path (${spots.length})`);
  const { p } = joinPlayer(w);
  let cart = null;
  for (const sp of spots) {
    teleport(w, p.ped, sp.x + 140, sp.y);
    p.joinedAt = w.time;   // (fresh in: the parked cars come at once)
    run(w, 0.5);
    cart = w.query(sp.x, sp.y, 30, K.VEH).find((v) => v.model === 'golfcart');
    if (cart) break;
  }
  assert.ok(cart, 'a golf cart parked at one');
  teleport(w, p.ped, cart.x, cart.y + 30);
  let seq = 1;
  for (let i = 0; i < 40 && !p.ped.vehId; i++) { players.queueInput(p, { seq: seq++, bits: i % 2 ? IN.VEHICLE : 0, mx: 0, my: 0, aim: 0 }); w.step(); }
  assert.equal(p.ped.vehId, cart.id, 'in the golf cart');
  const x0 = cart.x, y0 = cart.y;
  for (let i = 0; i < 60; i++) { players.queueInput(p, { seq: seq++, bits: 0, mx: Math.cos(cart.a), my: Math.sin(cart.a), aim: 0 }); w.step(); }
  assert.ok(Math.hypot(cart.x - x0, cart.y - y0) > 40, 'driven off');
  assert.ok(Math.hypot(cart.vx, cart.vy) <= VEHICLES.golfcart.max + 1, 'no faster than a golf cart');
});
