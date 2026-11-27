// Street cats and more dog walkers (the owner, 11-25 00:47: "I dont see a lot of dogs or cats or NPCs walking dogs in the
// cities either"): strays on the walk-ups' steps and down the alleys (activities.js 'cat', dogrun.js catStep) - sat still,
// shy of anyone who comes close, back to their spot when left in peace; the dog walkers out more often (personas.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import * as acts from '../server/systems/activities.js';
import * as pets from '../server/systems/pets.js';
import { PERSONAS } from '../server/systems/personas.js';
import { DOGRUN } from '../shared/rules.js';

test('a stray sits on its spot, darts off from someone close, and pads back when left be; nobody has lost it', () => {
  const w = makeWorld(), spots = acts.spotsOf(w.map).list.filter((s) => s.k === 'cat');
  assert.ok(spots.length >= 5, `cat spots ${spots.length}`);
  const s = spots[0], { p } = joinPlayer(w);
  teleport(w, p.ped, s.x, s.y + 900);
  const g = acts.fill(w, s, { seen: true }), cat = w.get(g.ids[0]);
  assert.ok(cat && cat.pet && cat.pet.stray, 'a cat');
  for (let i = 0; i < 60; i++) w.step();
  assert.ok(Math.hypot(cat.x - s.x, cat.y - s.y) < 8 && g.cat.st === 'sit', 'sat on its spot');
  teleport(w, p.ped, cat.x + 30, cat.y);
  for (let i = 0; i < 20; i++) w.step();
  assert.ok(Math.hypot(cat.x - s.x, cat.y - s.y) > DOGRUN.cats.dartPx[0] * 0.6, 'darted off');
  assert.ok(Math.hypot(cat.x - p.ped.x, cat.y - p.ped.y) > 60, 'away from them');
  teleport(w, p.ped, s.x, s.y + 900);
  for (let i = 0; i < 20 * 25; i++) w.step();
  assert.ok(Math.hypot(cat.x - s.x, cat.y - s.y) < 10, 'back on its spot');
  assert.ok(!pets.lostPets(w).includes(cat) && !pets.homePets(w).includes(cat), 'nobody\'s lost pet');
});

test('the dog walkers: out more often, two round a place at most', () => {
  assert.ok(PERSONAS.dogs.cap >= 2 && PERSONAS.dogs.day >= 3);
});
