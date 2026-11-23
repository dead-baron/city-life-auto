// A vehicle's trunk (server/systems/trunk.js; the owner, 11-23: its own small storage, not a door to the stash): opened at
// the back of a car of yours standing still, things and a gun in and out, its room by the vehicle's kind, kept while the
// car stands parked, spilled where it is wrecked - and never your stash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { TRUNK } from '../shared/rules.js';
import { VEHICLES } from '../shared/vehicles.js';
import { parkWhy } from '../shared/parkcheck.js';
import * as homes from '../server/systems/homes.js';
import * as players from '../server/systems/players.js';
import * as stash from '../server/systems/stash.js';
import * as trunk from '../server/systems/trunk.js';
import * as vehicles from '../server/systems/vehicles.js';

function bay(w) {
  const m = w.map, lots = homes.homeLotSpots(m);
  const ok = m.parking.filter((sp, i) => !sp.drive && !lots.has(i) && !parkWhy(m, sp.x, sp.y, sp.a, VEHICLES.sedan.L, VEHICLES.sedan.W, true));
  return ok[Math.floor(ok.length / 2)];
}

test('the trunk: opened at your car\'s back, its own few slots, kept parked, spilled when wrecked - not your stash', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  p.conn = { sendJSON: () => {} };
  const sp = bay(w);
  prof.vehicles.push({ model: 'sedan', paint: 1 });
  assert.equal(homes.spawnOwnedAt(w, p, prof.vehicles.length - 1, { x: sp.x, y: sp.y, a: sp.a || 0 }, { keep: true }), null);
  const v = w.get(p.activeVehicle);
  assert.ok(v && v.ownVid, 'a car of yours out in the world');
  assert.equal(trunk.slotsOf(v.def), TRUNK.slots.car);
  for (const id of ['medkit', 'bandage', 'coffee', 'apple', 'scrap', 'stone', 'lure']) prof.inventory[id] = 3;
  prof.weapons.pistol = 24;

  // at its side: nothing; at its back: the trunk
  teleport(w, p.ped, v.x - Math.sin(v.a) * 80, v.y + Math.cos(v.a) * 80); w.step();   // (beside it, whichever way it faces)
  assert.ok(!/trunk/i.test((players.findInteraction(w, p) || {}).label || ''), 'not from its side');
  const [bx, by] = trunk.backOf(v);
  teleport(w, p.ped, bx - Math.cos(v.a) * 16, by - Math.sin(v.a) * 16); w.step();
  const act = players.findInteraction(w, p);
  assert.match(act && act.label, /Open the trunk \(0\/6\)/);
  act.run();
  assert.equal(p.stashAt && p.stashAt.k, 'trunk');

  // in: a gun and things, up to its slots
  stash.handle(w, p, { t: 'stash', a: 'put', k: 'w', id: 'pistol' });
  for (const id of ['medkit', 'bandage', 'coffee', 'apple', 'scrap']) stash.handle(w, p, { t: 'stash', a: 'put', k: 'i', id });
  stash.handle(w, p, { t: 'stash', a: 'put', k: 'i', id: 'stone' });
  const ov = prof.vehicles.at(-1);
  assert.equal(trunk.used(ov.trunk), 6, 'six slots, full');
  assert.equal(ov.trunk.items.stone, undefined, 'a seventh kind: no room');
  assert.equal(prof.inventory.stone, 3);
  stash.handle(w, p, { t: 'stash', a: 'put', k: 'i', id: 'medkit', n: 1 });
  assert.equal(prof.inventory.medkit, undefined, 'more of a kind already in: always room');
  assert.equal(ov.trunk.weapons.pistol, 24);
  assert.ok(!(prof.stash && prof.stash.weapons && prof.stash.weapons.pistol), 'the trunk, not your stash');

  // out again; walked off, it closes; it's still in there
  stash.handle(w, p, { t: 'stash', a: 'take', k: 'i', id: 'coffee' });
  assert.equal(prof.inventory.coffee, 3);
  teleport(w, p.ped, v.x + 400, v.y);
  for (let i = 0; i < 6; i++) w.step();   // (it checks every few ticks)
  assert.ok(!p.stashAt, 'closed once you walk off');
  run(w, 2);
  assert.equal(ov.trunk.weapons.pistol, 24, 'kept while it stands parked');

  // wrecked: what was in it spills where it is
  const before = [...w.entities.values()].filter((e) => e.kind === K.BAG).length;
  vehicles.explode(w, v, null);
  const bags = [...w.entities.values()].filter((e) => e.kind === K.BAG && Math.hypot(e.x - v.x, e.y - v.y) < 60);
  assert.ok(bags.length > 0 && [...w.entities.values()].filter((e) => e.kind === K.BAG).length > before, 'a bag where it burned');
  assert.equal(trunk.used(ov.trunk), 0, 'the trunk empty');
});
