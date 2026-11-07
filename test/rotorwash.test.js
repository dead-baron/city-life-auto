// A helicopter's rotor wash only near the surface (the owner, 2026-11-06, on his phone: "Helicopters still affect water below
// at really high distances, should only be happening when closer to the water or ground"): shared/rules-page.js washK - full
// within ROTOR_WASH.FULL px, nothing from ROTOR_WASH.TOP up - drives the rings and spray on the water (waterlife.js) and the
// grass bent round you (host.js _push); an aircraft up in the air is no land vehicle "sinking" in the water under it
// (main.js vehSinking: the splashes and rings seen under the helicopter at 31 m) and splashes no puddles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { washK, ROTOR_WASH, AIR_UP } from '../shared/rules-page.js';
import { FLY } from '../shared/flight.js';
import { VEHICLES } from '../shared/vehicles.js';

test('rotor wash vs altitude: full at the surface, easing off, none from ROTOR_WASH.TOP up to the ceiling', () => {
  assert.equal(washK(0), 1); assert.equal(washK(-5), 1); assert.equal(washK(ROTOR_WASH.FULL), 1);
  assert.equal(washK(ROTOR_WASH.TOP), 0); assert.equal(washK(VEHICLES.heli.ceiling), 0); assert.equal(washK(992), 0, 'ALT 31 m: none');
  let last = 1;
  for (let a = ROTOR_WASH.FULL; a <= ROTOR_WASH.TOP; a += 8) { const k = washK(a); assert.ok(k <= last + 1e-12 && k >= 0 && k <= 1, `monotonic at ${a}`); assert.ok(last - k < 0.12, `smooth at ${a}`); last = k; }
  assert.ok(ROTOR_WASH.TOP <= 2 * 2 * VEHICLES.heli.rotor, 'within two rotor spans of the surface');
  assert.equal(FLY.AIRBORNE, AIR_UP);
});

test('the grass bent round you: a helicopter low down over its rotor, none high up; a plane only on the ground', async () => {
  const { World2 } = await import('../client/art2/game/host.js');
  const push = (def, alt) => {
    const h = Object.create(World2.prototype);
    h.S = { pred: { kind: 'veh', def, s: { alt } }, myPedId: 0 };
    h._push({ peds: [] }, { x: 100, y: 100 });
    return [h.pushA[2], h.pushA[3]];
  };
  const low = push(VEHICLES.heli, 20), mid = push(VEHICLES.heli, 150), high = push(VEHICLES.heli, 992);
  assert.ok(low[0] > VEHICLES.heli.rotor && low[1] === 5, `low: round the rotor, full (${low})`);
  assert.ok(mid[1] > 0 && mid[1] < 5, `150 px up: some (${mid})`);
  assert.equal(high[0], 0, 'at 31 m: nothing bent');
  assert.equal(push(VEHICLES.plane, 300)[0], 0, 'a plane in the air: nothing');
  assert.ok(push(VEHICLES.plane, 0)[0] > 0, 'a plane on the ground: its blast');
  assert.deepEqual(push(VEHICLES.sedan, 0), [Math.min(64, VEHICLES.sedan.W * 0.5 + 16), 5], 'a car as before');
});

test('an aircraft over the water is not sinking in it unless it is down on it (main.js vehSinking), and splashes no puddles up there', () => {
  const main = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.match(main, /const vehSinking = \(v, def\) => def\.kind !== 'boat' && !\(v\._up = def\.kind === 'air' && \(def\.floats \|\| \(v\.ralt \?\? \(v\.extra \| 0\) \* 4\) > AIR_UP\)\)/);
  const wx = readFileSync(new URL('../client/render/weather.js', import.meta.url), 'utf8');
  assert.match(wx, /\|\| e\._up\) continue;/);
});
