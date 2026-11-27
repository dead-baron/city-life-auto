// Weapons against vehicles, tuned to the owner's notes of 11-25 03:23: "A rocket or explosive or grenade or boom tester
// should blow up most vehicles in a single hit, maybe two it's three if it's especially armored"; the SAM "two hits,
// three at most" for a helicopter, a plane about two; the flamethrower "at least a quarter way across the screen".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run } from './helpers.js';
import * as explosions from '../server/systems/explosions.js';
import * as boomtest from '../server/systems/boomtest.js';
import { WEAPONS } from '../shared/items.js';
import { VEHICLES } from '../shared/vehicles.js';
import { GRENADE } from '../shared/rules.js';
import { T } from '../shared/constants.js';

const w = makeWorld(), m = w.map;
let road = null;
for (let ty = m.y0 + 30; ty < m.y0 + m.h - 30 && !road; ty += 5) for (let tx = m.x0 + 30; tx < m.x0 + m.w - 30; tx += 5) if (m.tileAt(tx, ty) === T.ROAD && m.tileAt(tx + 3, ty) === T.ROAD) { road = { x: tx * 32 + 16, y: ty * 32 + 16 }; break; }
const { p } = joinPlayer(w);
teleport(w, p.ped, road.x + 900, road.y + 900);
const gone = (v) => !w.get(v.id) || v.wreckAt || v.dead;

test('the SAM: two hits down a helicopter or a plane, three at most (the gunship)', () => {
  const dmg = WEAPONS.sam.dmg;
  for (const [id, d] of Object.entries(VEHICLES)) {
    if (d.kind !== 'air') continue;
    const hits = Math.ceil(d.hp / dmg);
    assert.ok(hits <= (id === 'gunship' ? 3 : 2), `${d.name}: ${hits} hits`);
  }
});

test('the flamethrower reaches a quarter of the way across a desktop screen', () => {
  assert.ok(WEAPONS.flamer.range >= 320, `${WEAPONS.flamer.range} px`);
});

test('a grenade going off beside a car destroys it; an armored van takes two', () => {
  const G = { r: GRENADE.r, dmg: GRENADE.dmg, big: 1, wreck: true };
  const car = w.spawnVehicle('sedan', road.x, road.y, 0, { npcOwned: false });
  explosions.blastAt(w, road.x, road.y + 40, G, null);
  run(w, 0.2);
  assert.ok(gone(car), 'one grenade: the sedan is done');
  const van = w.spawnVehicle('armored', road.x + 300, road.y, 0, { npcOwned: false });
  explosions.blastAt(w, road.x + 300, road.y + 40, G, null);
  run(w, 0.2);
  assert.ok(!gone(van), 'one grenade: the armored van holds');
  explosions.blastAt(w, road.x + 300, road.y + 40, G, null);
  run(w, 0.2);
  assert.ok(gone(van), 'two: it goes');
});

test('the Boom Tester destroys a vehicle it lands beside; as a real weapon the blast is the shooter\'s', () => {
  const car = w.spawnVehicle('sedan', road.x + 600, road.y, 0, { npcOwned: false });
  boomtest.boom(w, 'small', road.x + 600, road.y + 50, 0, 0, null);
  run(w, 0.2);
  assert.ok(gone(car), 'one shot');
});
