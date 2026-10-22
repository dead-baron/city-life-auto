// A train car turns in finer steps than a car (the owner, 10-16: "Trains look odd on wide curves (angle steps)"): a
// 212 px coach drawn at a car's 32 turns jumped 11 degrees at a time round a wide curve, its ends swinging ~21 px at
// each jump. Now a train car has twice a car's turns (client/art2/game/host.js trainSteps): 64 on most screens, 128 on
// High, so its ends move a few px at a time - and the renderer draws a coach at any of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainSteps } from '../client/art2/game/host.js';
import { TRAIN_CARS } from '../shared/mapcore.js';
import * as actors from '../client/art2/game/actors.js';

const TAU = Math.PI * 2;

test('a train car has twice a car\'s turns, so its ends swing a few px at a step', () => {
  assert.deepEqual([16, 32, 64].map(trainSteps), [32, 64, 128]);
  const longest = Math.max(...TRAIN_CARS.map((d) => d.L));
  // how far a car's end jumps when it snaps one step on (its half length times the step's angle)
  const jump = (N) => (longest / 2) * (TAU / N);
  assert.ok(jump(32) > 20, `it used to jump ${jump(32).toFixed(1)} px`);
  assert.ok(jump(trainSteps(32)) < 12, `now ${jump(trainSteps(32)).toFixed(1)} px on most screens`);
  assert.ok(jump(trainSteps(64)) < 6, `and ${jump(trainSteps(64)).toFixed(1)} px on High`);
});

test('a coach drawn at a fine turn: its own sprite, between the two either side of it', () => {
  const N = trainSteps(64), c = TRAIN_CARS.findIndex((d) => d.kind !== 'loco');
  assert.ok(c >= 0);
  assert.notEqual(actors.trainKey(c, 'roof', 1, N), actors.trainKey(c, 'roof', 1, 64), 'its own key');
  const s0 = actors.trainCarSprite(c, 'roof', 0, N), s1 = actors.trainCarSprite(c, 'roof', 1, N), s2 = actors.trainCarSprite(c, 'roof', 2, N);
  for (const s of [s0, s1, s2]) assert.ok(s && s.w > 0 && s.h > 0);
  // turning a little from running east: the box round it grows taller step by step
  assert.ok(s0.h <= s1.h && s1.h <= s2.h, `heights ${s0.h} ${s1.h} ${s2.h}`);
  assert.ok(s2.h > s0.h, 'turned');
});
