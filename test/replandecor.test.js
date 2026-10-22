// A home's rooms changed under its furniture (three villas became mansions: shared/world3-mansions.js): the decor laid in
// the house's rooms would land inside the mansion's walls. At login it goes back into storage (homes.replanDecor), and
// a home's decor now notes the plan it was laid in (homeinside setDecor), so a later change is caught the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer } from './helpers.js';
import * as homes from '../server/systems/homes.js';
import * as homeinside from '../server/systems/homeinside.js';
import { planOf } from '../shared/homelayout.js';

test('furniture laid in other rooms goes back into storage; decor from before plans were noted is kept and noted', () => {
  const w = makeWorld();
  const house = w.map.homes.find((h) => h.kind === 'house'), other = w.map.homes.find((h) => h.kind === 'house' && h !== house), third = w.map.homes.find((h) => h.kind === 'house' && h !== house && h !== other);
  const item = (k) => ({ k, x: 3, y: 3, r: 0 });
  const prof = { decor: {
    [house.id]: { it: [item('sofa')], wall: {}, floor: {}, plan: 'apartment' },   // (laid in another plan)
    [other.id]: { it: [item('lamp')], wall: {}, floor: {} },                     // (from before plans were noted)
    [third.id]: { it: [item('rug'), item('rug')], wall: {}, floor: {} },          // (from before, and its home promoted)
  } };
  w.map.world3 = { mansions: [{ id: third.id }] };
  const moved = homes.replanDecor(w, prof);
  assert.deepEqual(moved.sort(), [house.name, third.name].sort());
  assert.equal(prof.decor[house.id], undefined); assert.equal(prof.decor[third.id], undefined);
  assert.equal(prof.furn.sofa, 1); assert.equal(prof.furn.rug, 2);
  assert.equal(prof.decor[other.id].plan, planOf(other), 'kept, its plan noted');
  assert.equal(homes.replanDecor(w, prof), null, 'nothing more the next time');
});

test('a home\'s decor read only over the rooms it was laid in', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const h = w.map.homes.find((q) => q.kind === 'house');
  w.homeOwner.set(h.id, p.pid);
  prof.decor = { [h.id]: { it: [], wall: {}, floor: {}, plan: planOf(h) } };
  assert.ok(homeinside.decorOf(w, h), 'its own plan');
  prof.decor[h.id].plan = 'mansion' === planOf(h) ? 'house' : 'mansion';
  assert.equal(homeinside.decorOf(w, h), null, 'another plan\'s: not laid over these rooms');
});
