// Riders out in the open (the owner's notes 2, 10-24: server/systems/vehicles.js openRide, riderHit, throwRider): on a
// bike, a motorbike, a horse, a cart, a jet ski or an open boat, a big hit or one that leaves them badly hurt throws the
// rider off - carried on by the momentum, a tumble; off a boat into the water - and the vehicle rolls on a little and
// stops; a small hit they ride out; dying up there always throws them. The closed cars keep their people in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, straightRoad } from './helpers.js';
import { K, TILE } from '../shared/constants.js';
import { WATER_T } from '../shared/map.js';
import { RIDER_KNOCK } from '../shared/rules-play.js';
import { VEHICLES } from '../shared/vehicles.js';
import * as combat from '../server/systems/combat.js';
import * as vehicles from '../server/systems/vehicles.js';
import { spawnNpc } from '../server/systems/npc.js';

function scene() {
  const w = makeWorld();
  const road = straightRoad(w.map, 1400);
  for (const e of [...w.entities.values()]) if ((e.kind === K.VEH || (e.kind === K.PED && !e.player)) && Math.abs(e.y - road.y) < 400) w.remove(e);
  const { p } = joinPlayer(w);   // (someone looking on: nothing tidied away)
  teleport(w, p.ped, road.x + 300, road.y + 120);
  return { w, road };
}
// someone riding model at x, moving east at sp px/s
function rider(w, model, x, y, sp = 300, who = null) {
  const v = w.spawnVehicle(model, x, y, 0, { npcOwned: false });
  const q = who || spawnNpc(w, 'casual', x, y);
  q.hp = q.maxHp = 100;
  q.vehId = v.id; q.seat = 0; v.seats[0] = q.id; q.x = v.x; q.y = v.y;
  v.vx = sp; v.vy = 0;
  return { v, q };
}
// open water, a few tiles each way
function openWater(m) {
  for (let ty = m.y0 + 20; ty < m.y0 + m.h - 20; ty += 7) for (let tx = m.x0 + 20; tx < m.x0 + m.w - 20; tx += 7) {
    let all = true;
    for (let dy = -6; dy <= 6 && all; dy++) for (let dx = -6; dx <= 6 && all; dx++) if (WATER_T[m.tiles[m.idx(tx + dx, ty + dy)]] !== 1) all = false;
    if (all) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}

test('which vehicles leave their riders out in the open', () => {
  for (const id of ['bike', 'dirtbike', 'bicycle', 'horse', 'cart', 'skateboard', 'jetski', 'rowboat', 'kayak', 'rib', 'pontoon']) assert.ok(vehicles.openRide(VEHICLES[id]), `${id}: open`);
  for (const id of ['sedan', 'police', 'convertible', 'jeep', 'policeboat', 'ferry', 'heli']) assert.ok(!vehicles.openRide(VEHICLES[id]), `${id}: they're inside it`);
});

test('a rider rides out a small hit; enough damage throws them off with the momentum, and the bike rolls on and stops', () => {
  const { w, road } = scene();
  const { v, q } = rider(w, 'dirtbike', road.x + 200, road.y);
  combat.damage(w, q, 8, null, 'gun', Math.PI / 2);
  assert.equal(q.vehId, v.id, 'a graze: still on');
  // hurt badly: off
  combat.damage(w, q, 100 * (1 - RIDER_KNOCK.hp) - 8 + 2, null, 'gun', Math.PI / 2);
  assert.ok(!q.dead, 'alive');
  assert.equal(q.vehId, 0, 'thrown off');
  assert.ok(!v.seats.includes(q.id), 'the seat empty');
  assert.ok(q.vx > 150, `carried on by the bike's speed (${q.vx.toFixed(0)} px/s)`);
  assert.ok(w.time < (q.tumbleUntil || 0) || w.time < (q.airUntil || 0), 'a tumble');
  // the bike carries on and stops
  const x0 = v.x;
  for (let i = 0; i < 20 * 6; i++) w.step();
  assert.ok(v.x > x0 + 20, 'it rolled on');
  assert.ok(!v.removed && Math.hypot(v.vx, v.vy) < 5, 'and stopped');
  // one big hit, healthy before it: off too
  const b = rider(w, 'bike', road.x + 700, road.y);
  combat.damage(w, b.q, 100 * RIDER_KNOCK.big + 1, null, 'melee', Math.PI);
  assert.equal(b.q.vehId, 0, 'a big hit throws them');
  // a car keeps its driver in
  const c = rider(w, 'sedan', road.x + 1100, road.y);
  combat.damage(w, c.q, 70, null, 'gun', 0);
  assert.equal(c.q.vehId, c.v.id, 'in a closed car: still in it');
});

test('shot dead on a motorbike or a horse: thrown off it; a player hit hard off their horse', () => {
  const { w, road } = scene();
  const { v, q } = rider(w, 'chopper', road.x + 200, road.y, 380);
  combat.damage(w, q, 999, null, 'gun', Math.PI / 2);
  assert.ok(q.dead, 'dead');
  assert.equal(q.vehId, 0, 'off the bike');
  assert.ok(Math.hypot(q.x - v.x, q.y - v.y) > 10, 'beside it, not in it');
  // a player on a horse
  const { p } = joinPlayer(w);
  const h = rider(w, 'horse', road.x + 700, road.y, 250, p.ped);
  p.ped.protectUntil = 0;
  combat.damage(w, p.ped, p.ped.maxHp, null, 'gun', 0);   // (a player's grit: a big hit, not the end of them)
  assert.ok(!p.ped.dead && p.ped.vehId === 0, 'thrown off the horse');
  void h;
});

test('knocked off a jet ski: into the water beside it', () => {
  const { w } = scene();
  const at = openWater(w.map);
  assert.ok(at, 'open water');
  const { v, q } = rider(w, 'jetski', at.x, at.y, 300);
  combat.damage(w, q, 70, null, 'gun', Math.PI / 2);
  assert.equal(q.vehId, 0, 'off');
  assert.equal(WATER_T[w.map.tileAtPx(q.x, q.y)], 1, 'in the water');
  void v;
});
