// K9 units (task #324 - server/systems/k9.js): a patrol car now and then carries a dog handler and a German shepherd.
// Let out when the crew gets out, the dog runs a wanted suspect on foot down - faster than anyone runs - and a bite puts
// them on the ground long enough for the cuffs; it leaves people in vehicles alone, and rides back in with its handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { K9 } from '../shared/rules.js';
import { decodeLook } from '../shared/lookcore.js';
import { spawnNpc } from '../server/systems/npc.js';
import * as k9 from '../server/systems/k9.js';
import * as net from '../server/net.js';

function openGround(m, r = 14) {
  const ok = (t) => t === T.ROAD || t === T.PLAZA || t === T.LOT || t === T.GRASS || t === T.SIDEWALK;
  for (let ty = m.y0 + 60; ty < m.y0 + m.h - 60; ty += 5) for (let tx = m.x0 + 60; tx < m.x0 + m.w - 60; tx += 5) {
    let all = true;
    for (let dy = -r; dy <= r && all; dy++) for (let dx = -r; dx <= r && all; dx++) if (!ok(m.tiles[m.idx(tx + dx, ty + dy)])) all = false;
    if (all) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}
function k9Unit(w, p, at) {
  const v = w.spawnVehicle('police', at.x - 260, at.y, 0, {});
  const h = spawnNpc(w, 'cop', v.x, v.y, 'cop');
  h.npc.unit = v.id; h.vehId = v.id; h.seat = 0; v.seats[0] = h.id;
  h.npc.state = 'idle';
  const dog = k9.attach(w, v, h, p);
  return { v, h, dog };
}

test('a K9 unit: the dog rides in the back, is let out with its handler, runs a suspect down and puts them on the ground', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = openGround(w.map);
  teleport(w, p.ped, at.x, at.y);
  p.wanted = 2;
  const { v, h, dog } = k9Unit(w, p, at);
  const L = decodeLook(h.app.lk);
  assert.ok(L && L.outfit.jacket, 'the handler in the K9 vest');
  assert.equal(net.descriptor(dog).ar, 'pet:dog_shepherd', 'a German shepherd on the wire');
  w.step();
  assert.ok(dog.hidden, 'in the back of the car');
  // the crew gets out: the dog with them, after the suspect (who runs, flat out, east)
  h.vehId = 0; v.seats[0] = 0; h.x = v.x + 30; h.y = v.y + 30;
  let seq = 0, down = -1;
  for (let i = 0; i < 20 * 8 && down < 0; i++) {
    p.inputQ.push({ seq: ++seq, bits: IN.SPRINT, mx: 1, my: 0, aim: 0 }); w.step();
    if (w.time < (p.ped.downUntil || 0)) down = i;
  }
  assert.ok(!dog.hidden, 'let out');
  assert.ok(down >= 0, 'caught and brought down');
  assert.ok(p.ped.downUntil - w.time > K9.downS - 0.5, 'down a while');
  assert.ok(!p.ped.dead, 'bitten, not killed');
  // back in the car with its handler
  h.vehId = v.id;
  w.step();
  assert.ok(dog.hidden, 'riding back in');
  // the unit gone: so is the dog
  w.remove(v); w.step();
  assert.ok(dog.removed, 'gone with it');
});

test('the dog leaves someone in a vehicle alone, and a suspect who isn\'t wanted', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = openGround(w.map);
  teleport(w, p.ped, at.x, at.y);
  p.wanted = 0;
  const { v, h, dog } = k9Unit(w, p, at);
  h.vehId = 0; v.seats[0] = 0;
  run(w, 4);
  assert.ok(!dog.hidden && w.time >= (p.ped.downUntil || 0), 'not wanted: no bite');
  assert.ok(Math.hypot(dog.x - h.x, dog.y - h.y) < 120, 'at its handler\'s heel');
});

test('the dog stays on its own level, lets someone just broken free get going, and is called back when they\'re well away', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = openGround(w.map);
  teleport(w, p.ped, at.x, at.y);
  p.wanted = 2;
  const { v, h, dog } = k9Unit(w, p, at);
  h.vehId = 0; v.seats[0] = 0; h.x = at.x - 60; h.y = at.y;
  w.step();
  dog.x = at.x - 20; dog.y = at.y;
  // down a manhole (underground.js keeps you at its x, y): out of the dog's reach
  p.ped.sub = true; p.ped.ug = 1;
  for (let i = 0; i < 20; i++) w.step();
  assert.ok(w.time >= (p.ped.downUntil || 0), 'no bite through the street');
  p.ped.sub = false; p.ped.ug = 0;
  // just broken free of an officer (struggle.js graceUntil): a moment's grace
  p.ped.graceUntil = w.time + 1.5;
  dog.x = at.x - 20; dog.y = at.y;
  for (let i = 0; i < 20; i++) w.step();
  assert.ok(w.time >= (p.ped.downUntil || 0), 'no bite in the grace');
  // well away from the handler: called back to heel
  teleport(w, p.ped, h.x + K9.sight + 300, h.y);
  for (let i = 0; i < 20 * 3; i++) w.step();
  assert.ok(Math.hypot(dog.x - h.x, dog.y - h.y) < 120, 'back at its handler\'s heel');
});
