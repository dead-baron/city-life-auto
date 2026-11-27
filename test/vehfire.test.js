// Vehicles and fire (the owner, 11-25 03:23; shared/rules.js VEH_FIRE, server vehicles.js ignite / flameOn / fireTick):
// a flamethrower sets a vehicle alight only after enough of it; alight, it burns down - a healthy one comes through and
// the fire goes out, a battered one goes up; a badly damaged one can catch on its own; water puts it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, run, joinPlayer, teleport } from './helpers.js';
import * as vehicles from '../server/systems/vehicles.js';
import { VEH_FIRE } from '../shared/rules.js';
import { VF, T } from '../shared/constants.js';

const w = makeWorld(), m = w.map;
let road = null;
for (let ty = m.y0 + 20; ty < m.y0 + m.h - 20 && !road; ty += 5) for (let tx = m.x0 + 20; tx < m.x0 + m.w - 20; tx += 5) if (m.tileAt(tx, ty) === T.ROAD) { road = { x: tx * 32 + 16, y: ty * 32 + 16 }; break; }
const { p: watcher } = joinPlayer(w);   // (someone near: a car left in an empty street is tidied away)
teleport(w, watcher.ped, road.x + 60, road.y + 60);
const car = () => w.spawnVehicle('sedan', road.x, road.y, 0, { npcOwned: false });

test('a flamethrower catches a vehicle only after enough of it; alight it burns down, then goes out', () => {
  const v = car();
  vehicles.flameOn(w, v, null, VEH_FIRE.exposeS * 0.4);
  assert.ok(!v.onFire, 'a lick of flame: not alight');
  run(w, 3);
  vehicles.flameOn(w, v, null, VEH_FIRE.exposeS * 0.4);
  assert.ok(!v.onFire, 'and it cools between');
  for (let i = 0; i < 40 && !v.onFire; i++) vehicles.flameOn(w, v, null, 0.1);
  assert.ok(v.onFire, 'held on it: alight');
  assert.ok(vehicles.vehFlags(w, v) & VF.BURN, 'drawn burning');
  const hp = v.hp;
  run(w, 4);
  assert.ok(v.hp < hp, 'burning down');
  run(w, VEH_FIRE.burnS);
  assert.ok(!v.onFire && !v.dead && !v.wreckAt, `a healthy one comes through: out after ${VEH_FIRE.burnS} s (${Math.round(v.hp / v.def.hp * 100)}% left)`);
  w.remove(v);
});

test('a battered vehicle alight goes up; one badly damaged can catch on its own; a hard crash can start it', () => {
  const v = car();
  v.hp = v.def.hp * 0.3;
  vehicles.ignite(w, v, null);
  run(w, VEH_FIRE.burnS + 12);
  assert.ok(v.wreckAt || !w.get(v.id), 'it went up');
  const u = car(), r = w.rand;
  u.hp = u.def.hp * (VEH_FIRE.smoulderBelow - 0.02);
  w.rand = () => 0;
  try { run(w, 1); } finally { w.rand = r; }
  assert.ok(u.onFire, 'a wreck-in-waiting caught on its own');
  w.remove(u);
});

test('nothing that cannot burn catches: a bicycle, a horse', async () => {
  const { VEHICLES } = await import('../shared/vehicles.js');
  for (const k of ['bicycle', 'horse']) { if (!VEHICLES[k]) continue; const v = w.spawnVehicle(k, road.x, road.y, 0, { npcOwned: false }); assert.equal(vehicles.ignite(w, v, null), false, k); w.remove(v); }
});
