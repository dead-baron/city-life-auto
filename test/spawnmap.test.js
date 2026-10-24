// The death screen's spawn map (the owner, 10-23: "a spawn point map when you are choosing a place to spawn"): the
// places you can wake up come with where they are (client/deathscreen.js marks them on the world map), the hospitals
// nearest where you went down first, your homes ahead of them; the death spot rides with them (me.deadAt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import * as homes from '../server/systems/homes.js';
import * as combat from '../server/systems/combat.js';
import { buildMe } from '../server/systems/players.js';

test('spawn map: the places to wake up with where they are, nearest first; the death spot', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const h = w.map.hospitals[w.map.hospitals.length - 1];
  teleport(w, p.ped, h.x + 300, h.y + 40);
  combat.damage(w, p.ped, 99999, null, 'crash', 0);
  assert.ok(p.ped.dead, 'down');
  const opts = homes.spawnOptions(w, p);
  assert.equal(opts.length, w.map.hospitals.length, 'every hospital and clinic');
  assert.ok(opts.every((o) => Number.isFinite(o.x) && Number.isFinite(o.y)), 'each with where it is');
  const d = (o) => Math.hypot(o.x - p.ped.x, o.y - p.ped.y);
  for (let i = 1; i < opts.length; i++) assert.ok(d(opts[i - 1]) <= d(opts[i]), 'nearest first');
  assert.equal(opts[0].label, h.name, 'the one by you first');
  const me = buildMe(w, p);
  assert.deepEqual(me.deadAt, [Math.round(p.ped.x), Math.round(p.ped.y)], 'where you went down');
  assert.equal(me.spawnOpts.length, opts.length);
});
