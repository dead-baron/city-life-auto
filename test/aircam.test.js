// Your aircraft stays in the middle of the screen at any height (the owner, 2026-11-06, his son's Pixel 10a: "Helicopters
// disappearing when flying in landscape mode on mobile. The helicopter isn't centered on the screen when up in the air"):
// art v2 draws an aircraft up the screen by its height (render/aircraft.js liftOf); the camera now follows all of that
// (camLift - it followed two thirds, so a high one sat above the middle, off the top of a short landscape view), and the
// frame's list keeps an aircraft whose drawn self is on screen even when its ground point isn't (main.js vis).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liftOf, camLift, AIR_CAM } from '../client/render/aircraft.js';
import { VEHICLES } from '../shared/vehicles.js';

test('the camera target vs altitude: the aircraft drawn where the camera looks, from the ground to the ceiling', () => {
  assert.equal(AIR_CAM, 1);
  for (const alt of [0, 40, 256, 480, 700, VEHICLES.heli.ceiling]) {
    const groundY = 5000, drawnY = groundY - liftOf(alt), camY = groundY - camLift(alt);
    assert.equal(drawnY - camY, 0, `centred at ${alt} px`);
  }
  // a phone held landscape: the view ~ 412 css px tall, zoomed out ~1.45x at height - half of it some 300 world px. A third of
  // the lift at the ceiling (the old camera) was more than that: off the top
  const half = 300;
  assert.ok(liftOf(VEHICLES.heli.ceiling) / 3 > half * 0.7, 'the old offset: most of the way to the top edge, past it with the lead');
  assert.ok(liftOf(VEHICLES.heli.ceiling) > half + 160, 'its ground point is off the bottom: culling by it dropped the aircraft');
});

test('the frame keeps an aircraft whose drawn self is on screen (main.js vis), and the cinematic camera centres it too', () => {
  const main = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.match(main, /const vis = \(e\) => [^\n]*e\.ry - upOf\(e\) < view\.y1 \+ 160/);
  assert.match(main, /S\.airMod\.camLift\(myAir\.ralt/);
  assert.doesNotMatch(main, /liftOf\(myAir\.ralt \?\? \(myAir\.extra \| 0\) \* 4\) \* 0\.66/);
  const dir = readFileSync(new URL('../client/director.js', import.meta.url), 'utf8');
  assert.match(dir, /ey -= S\.airMod\.camLift\(/);
});
