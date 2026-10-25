// K9 units (task #324 - server/systems/k9.js): a patrol car now and then carries a dog handler and a German shepherd.
// Out with the crew, the dog is walked in on its lead and let go only near the suspect; it runs a little faster than
// anyone runs, gets hold of them (slowed, a little health, never the last of it) and is knocked off by a blow or by
// mashing attack; hurt, it limps off - never killed; it leaves people in vehicles alone, and rides back in with its handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { K9 } from '../shared/rules-play.js';
import { decodeLook } from '../shared/lookcore.js';
import { spawnNpc } from '../server/systems/npc.js';
import * as k9 from '../server/systems/k9.js';
import * as net from '../server/net.js';
import * as combat from '../server/systems/combat.js';
import { PED } from '../shared/physics.js';

function spy(w) { const said = [], n0 = w.notify.bind(w); w.notify = (pl, t, tone) => { said.push(t); return n0(pl, t, tone); }; return said; }
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

// the crew out of the car, the handler at (hx, hy)
function out(w, v, h, hx, hy) { h.vehId = 0; v.seats[0] = 0; h.x = hx; h.y = hy; w.place(h); w.step(); }
// the handler walking the dog toward the suspect (their own AI held still: we move them)
function walkTo(w, h, x, y, sp = 110) { const d = Math.hypot(x - h.x, y - h.y); if (d > 1) { h.x += (x - h.x) / d * sp * 0.05; h.y += (y - h.y) / d * sp * 0.05; h.a = Math.atan2(y - h.y, x - h.x); w.place(h); } }

test('a K9 unit: the dog rides in the back, comes out on its lead at the handler\'s side, and is let go only near the suspect', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = openGround(w.map);
  teleport(w, p.ped, at.x + 200, at.y);
  p.wanted = 2;
  const { v, h, dog } = k9Unit(w, p, at);
  const said = spy(w);
  const L = decodeLook(h.app.lk);
  assert.ok(L && L.outfit.jacket, 'the handler in the K9 vest');
  assert.equal(net.descriptor(dog).ar, 'pet:dog_shepherd', 'a German shepherd on the wire');
  w.step();
  assert.ok(dog.hidden && dog.k9.mode === 'ride', 'in the back of the car');
  // out with the crew, the suspect well off: on the lead, beside the handler, the lead on the wire
  out(w, v, h, at.x - 330, at.y + 70);
  for (let i = 0; i < 20; i++) { h.npc.state = 'idle'; p.wanted = 2; w.step(); }
  assert.equal(dog.k9.mode, 'leash', 'on the lead');
  assert.ok(Math.hypot(dog.x - h.x, dog.y - h.y) <= K9.leash + 1, 'no further from the hand than the lead');
  assert.equal(net._fields(w, dog)[2], h.id, 'the lead on the wire: the handler\'s id');
  assert.ok(K9.release > 150, 'let go only when close');
  // the two closing on each other: let go within K9.release of the suspect, with a word to them
  let gone = -1;
  for (let i = 0; i < 20 * 8 && gone < 0; i++) {
    walkTo(w, p.ped, h.x, h.y); p.wanted = 2; w.step();
    if (dog.k9.mode !== 'leash') gone = Math.hypot(p.ped.x - h.x, p.ped.y - h.y);
  }
  assert.ok(gone > 0 && gone <= K9.release + 10, `let go near the suspect (${gone.toFixed(0)} px off)`);
  assert.ok(said.some((t) => /off the lead/.test(t)), 'the heads-up');
  assert.equal(net._fields(w, dog)[2], 0, 'off the lead on the wire');
  // back in the car with its handler
  h.vehId = v.id;
  w.step();
  assert.ok(dog.hidden, 'riding back in');
  w.remove(v); w.step();
  assert.ok(dog.removed, 'gone with it');
});

test('let go, the dog is a little faster than a sprint, gets hold without jitter, slows you and takes a little health; mashing attack or a blow knocks it off', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = openGround(w.map);
  teleport(w, p.ped, at.x, at.y);
  p.wanted = 2;
  const { v, h, dog } = k9Unit(w, p, at);
  const said = spy(w);
  out(w, v, h, at.x - 150, at.y + 70);
  for (let i = 0; i < 4; i++) { h.npc.state = 'idle'; w.step(); }
  assert.equal(dog.k9.mode, 'run', 'close already: let go');
  const sprint = PED.aSprint;
  assert.ok(K9.speed * PED.aRun > sprint && K9.speed * PED.aRun < sprint * 1.25, `a little faster than a sprint (${(K9.speed * PED.aRun).toFixed(0)} vs ${sprint})`);
  // the suspect sprints east; the dog closes and gets hold
  let seq = 0, held = -1, top = 0;
  for (let i = 0; i < 20 * 10 && held < 0; i++) {
    const x0 = dog.x, y0 = dog.y;
    p.inputQ.push({ seq: ++seq, bits: IN.SPRINT, mx: 1, my: 0, aim: 0 }); h.npc.state = 'idle'; walkTo(w, h, p.ped.x - 150, p.ped.y, 240); w.step();
    top = Math.max(top, Math.hypot(dog.x - x0, dog.y - y0) / 0.05);
    if (k9.latchedOn(w, p.ped) === dog) held = i;
  }
  assert.ok(held >= 0, 'caught up and got hold');
  assert.ok(top < K9.speed * PED.aRun * 1.15, `no faster than its speed (${top.toFixed(0)} px/s)`);
  assert.ok(w.time >= (p.ped.downUntil || 0), 'not brought down: just held');
  // held: at their side every step (no back and forth), slowed, a little health gone - never the last of it
  const hp0 = p.ped.hp;
  let worst = 0, sp = 0, n = 0;
  for (let i = 0; i < 40 && k9.latchedOn(w, p.ped); i++) {
    p.inputQ.push({ seq: ++seq, bits: IN.SPRINT, mx: 1, my: 0, aim: 0 }); h.npc.state = 'idle'; w.step();
    worst = Math.max(worst, Math.abs(Math.hypot(dog.x - p.ped.x, dog.y - p.ped.y) - 15));
    sp += Math.hypot(p.ped.vx, p.ped.vy); n++;
  }
  assert.ok(worst < 1, `it holds on at their side, steady (${worst.toFixed(2)} px off)`);
  assert.ok(sp / n < sprint * 0.6, `slowed down (${(sp / n).toFixed(0)} px/s)`);
  assert.ok(p.ped.hp < hp0 && p.ped.hp > p.ped.maxHp * K9.floor - 1, `a little health (${hp0.toFixed(0)} -> ${p.ped.hp.toFixed(0)})`);
  // mashing attack shakes it off
  if (!k9.latchedOn(w, p.ped)) { dog.k9.biteAt = -99; dog.x = p.ped.x - 10; dog.y = p.ped.y; for (let i = 0; i < 10 && !k9.latchedOn(w, p.ped); i++) { p.inputQ.push({ seq: ++seq, bits: 0, mx: 0, my: 0, aim: 0 }); w.step(); } }
  assert.ok(k9.latchedOn(w, p.ped), 'held again');
  for (let i = 0; i < K9.mash * 2 + 2 && k9.latchedOn(w, p.ped); i++) { p.inputQ.push({ seq: ++seq, bits: i % 2 ? 0 : IN.FIRE, mx: 0, my: 0, aim: Math.PI }); w.step(); }
  assert.ok(!k9.latchedOn(w, p.ped), 'mashing attack knocks it off');
  assert.ok(w.time >= (p.ped.k9Until || 0), 'your speed back');
  assert.ok(said.some((t) => /knock the police dog off/.test(t)), 'and you\'re told to run');
  // a blow knocks it off too (and slows it)
  dog.k9.biteAt = -99; dog.x = p.ped.x - 10; dog.y = p.ped.y;
  for (let i = 0; i < 10 && !k9.latchedOn(w, p.ped); i++) { p.inputQ.push({ seq: ++seq, bits: 0, mx: 0, my: 0, aim: 0 }); w.step(); }
  assert.ok(k9.latchedOn(w, p.ped), 'held again');
  combat.damage(w, dog, 5, p.ped, 'melee', 0);
  assert.ok(!k9.latchedOn(w, p.ped) && dog.k9.slowUntil > w.time, 'a blow knocks it off and slows it');
});

test('the police dog is never killed: hurt badly it limps off, out of the chase; other pets are as they were', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = openGround(w.map);
  teleport(w, p.ped, at.x, at.y);
  p.wanted = 2;
  const { v, h, dog } = k9Unit(w, p, at);
  out(w, v, h, at.x - 150, at.y + 70);
  for (let i = 0; i < 4; i++) { h.npc.state = 'idle'; w.step(); }
  // shot, again and again: never dead
  for (let i = 0; i < 10; i++) combat.damage(w, dog, 40, p.ped, 'gun', 0);
  combat.kill(w, dog, p.ped, 'gun', 0);
  assert.ok(!dog.dead && dog.hp >= 1, 'not killed');
  assert.equal(dog.k9.mode, 'limp', 'limping off');
  assert.ok(net._fields(w, dog)[1] < K9.limpAt, 'its health on the wire: the clients draw the limp');
  const d0 = Math.hypot(dog.x - p.ped.x, dog.y - p.ped.y);
  let top = 0;
  for (let i = 0; i < 40; i++) { const x0 = dog.x, y0 = dog.y; h.npc.state = 'idle'; w.step(); top = Math.max(top, Math.hypot(dog.x - x0, dog.y - y0) / 0.05); }
  assert.ok(Math.hypot(dog.x - p.ped.x, dog.y - p.ped.y) > d0 + 20, 'away from whoever hurt it');
  assert.ok(top < PED.aWalk, `slowly (${top.toFixed(0)} px/s)`);
  assert.ok(!k9.latchedOn(w, p.ped), 'it leaves you be');
  // limped off, it heels and stays out of it
  w.time += K9.limpS + 1;
  for (let i = 0; i < 60; i++) { h.npc.state = 'idle'; w.step(); }
  assert.ok(dog.k9.mode === 'heel' && !k9.latchedOn(w, p.ped), 'out of the chase');
  // a pet that isn't a police dog: still unhurt by anything (pets.js)
  const pet = w.spawnPed(at.x + 60, at.y + 60, { hp: 40, archetype: 'pet:dog_lab', name: 'Rex' });
  pet.pet = { kind: 'dog', name: 'Rex' };
  combat.damage(w, pet, 30, p.ped, 'melee', 0);
  assert.equal(pet.hp, 40, 'a pet: not hurt at all, as before');
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
  assert.ok(!dog.hidden && !k9.latchedOn(w, p.ped), 'not wanted: no bite');
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
  assert.ok(!k9.latchedOn(w, p.ped), 'no bite through the street');
  p.ped.sub = false; p.ped.ug = 0;
  // just broken free of an officer (struggle.js graceUntil): a moment's grace
  p.ped.graceUntil = w.time + 1.5;
  dog.x = at.x - 20; dog.y = at.y;
  for (let i = 0; i < 20; i++) w.step();
  assert.ok(!k9.latchedOn(w, p.ped), 'no bite in the grace');
  // well away from the handler: called back to heel
  teleport(w, p.ped, h.x + K9.sight + 300, h.y);
  for (let i = 0; i < 20 * 3; i++) w.step();
  assert.ok(Math.hypot(dog.x - h.x, dog.y - h.y) < 120, 'back at its handler\'s heel');
});
