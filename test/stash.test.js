// The stash, opened in the Inventory (server/systems/stash.js; the owner, 11-23: one pool reached from many doors): opened
// at a gun shop's counter, things in and out of it - items in any number, a weapon with its rounds - the same pool at a
// pawn shop and at home, closed once you walk off; nothing moves while it's closed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { STASH } from '../shared/rules.js';
import * as economy from '../server/systems/economy.js';
import * as stash from '../server/systems/stash.js';

const at = (w, p, poi) => { teleport(w, p.ped, poi.x, poi.y); w.step(); };
const optsAt = (w, p, poi) => economy.buildMenu(w, p, poi).opts;

test('the stash in the Inventory: opened at its doors, items and weapons in and out, closed when you walk off', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 20000 });
  const sent = [];
  p.conn = { sendJSON: (m) => sent.push(m) };
  const last = () => sent.filter((m) => m.t === 'stash').at(-1);
  prof.inventory.medkit = 5; prof.inventory.scrap = 12;
  prof.weapons.pistol = 24;
  const gun = w.map.pois.find((q) => q.kind === 'gunshop'), pawn = w.map.pois.find((q) => q.kind === 'pawn');

  // closed: nothing moves
  stash.handle(w, p, { t: 'stash', a: 'put', k: 'i', id: 'medkit' });
  assert.equal(prof.inventory.medkit, 5, 'not while it is closed');

  // opened at the gun counter's stash menu
  at(w, p, gun);
  economy.handleMenu(w, p, gun.id, 'stash');
  const row = optsAt(w, p, gun).find((o) => o.id === 'stopen');
  assert.ok(row, 'an Open your stash row at the counter');
  economy.handleMenu(w, p, gun.id, 'stopen');
  assert.ok(last() && last().open, 'the page is told it is open');
  assert.equal(last().where, gun.label);

  // items: one, then the rest; a weapon with its rounds
  stash.handle(w, p, { t: 'stash', a: 'put', k: 'i', id: 'medkit', n: 1 });
  assert.equal(prof.inventory.medkit, 4); assert.equal(prof.stash.items.medkit, 1);
  stash.handle(w, p, { t: 'stash', a: 'put', k: 'i', id: 'medkit' });
  assert.equal(prof.inventory.medkit, undefined, 'all of them'); assert.equal(prof.stash.items.medkit, 5);
  stash.handle(w, p, { t: 'stash', a: 'put', k: 'w', id: 'pistol' });
  assert.equal(prof.weapons.pistol, undefined); assert.equal(prof.stash.weapons.pistol, 24);
  assert.deepEqual(last().items, { medkit: 5 }); assert.equal(last().weapons.pistol, 24);
  // nothing you don't have; never your fists
  stash.handle(w, p, { t: 'stash', a: 'put', k: 'i', id: 'scrap', n: 99 });
  assert.equal(prof.stash.items.scrap, 12, 'no more than you carry');
  stash.handle(w, p, { t: 'stash', a: 'put', k: 'w', id: 'fists' });
  assert.equal(prof.stash.weapons.fists, undefined);

  // walked off: it closes
  teleport(w, p.ped, gun.x + STASH.reach * 3, gun.y);
  for (let i = 0; i < 6; i++) w.step();
  stash.update(w);
  assert.ok(!p.stashAt && last() && !last().open, 'closed once you walk off');
  stash.handle(w, p, { t: 'stash', a: 'take', k: 'i', id: 'medkit' });
  assert.equal(prof.stash.items.medkit, 5, 'and nothing moves');

  // the same pool at the pawn shop: take it back
  at(w, p, pawn);
  economy.handleMenu(w, p, pawn.id, 'stash');
  economy.handleMenu(w, p, pawn.id, 'stopen');
  assert.ok(p.stashAt && last().items.medkit === 5, 'the same stash at the pawn shop');
  stash.handle(w, p, { t: 'stash', a: 'take', k: 'i', id: 'medkit', n: 2 });
  stash.handle(w, p, { t: 'stash', a: 'take', k: 'w', id: 'pistol' });
  assert.equal(prof.inventory.medkit, 2); assert.equal(prof.stash.items.medkit, 3);
  assert.equal(prof.weapons.pistol, 24, 'the pistol back, its rounds with it');
  stash.handle(w, p, { t: 'stash', a: 'close' });
  assert.ok(!p.stashAt);
});
