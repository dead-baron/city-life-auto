// The daylight in at a cave's mouth (client/underground/view.js; the owner, 2026-10-15: "have the entrance of the cave
// lit up with light coming in from the entrance so it's easier to find"): worked out once per cave - from just outside
// the mouth up the passage toward the entrance hall, brightest at the mouth and fading in - as strong as the light
// outside (a little moonlight at night) and in the sky's colour. On a stand-in map with one mine (the cave's layout comes
// from the mine alone: shared/underground.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { undergroundOf } from '../shared/underground.js';

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };   // (the view's darkness canvas: not drawn here)
const { createUgView, MOUTH, mouthLevel, mouthTint } = await import('../client/underground/view.js');

const mine = { kind: 'mine', x: 6000, y: 6000, name: 'Test Mine' };
const map = { seed: 1337, natureSites: [mine], x0: 0, y0: 0, w: 400, h: 400, frame: { w: 400, h: 400 } };

test('the light in at the mouth: from the mouth up the passage, fading in', () => {
  const V = createUgView({ map }, {}), L = undergroundOf(map), K = L.caves[0];
  const spots = V.mouthSpots();
  assert.equal(spots.length, MOUTH.n);
  assert.ok(Math.hypot(spots[0].x - K.mouth.x, spots[0].y - K.mouth.y) < 30, 'the first at the mouth');
  assert.ok((spots[0].y - K.mouth.y) * K.flip >= 0, '(just outside it: the light comes in from there)');
  const last = spots[spots.length - 1], hall = K.ch.hall;
  assert.ok(Math.hypot(last.x - hall.x, last.y - hall.y) < Math.hypot(spots[0].x - hall.x, spots[0].y - hall.y) * 0.3, 'the last most of the way to the entrance hall');
  for (let i = 1; i < spots.length; i++) { assert.ok(spots[i].k < spots[i - 1].k, 'fainter further in'); assert.ok(spots[i].r <= spots[i - 1].r, 'and smaller'); }
  assert.equal(spots[0].k, MOUTH.k0); assert.equal(last.k, 0);
  assert.equal(V.mouthSpots(), spots, 'worked out once');
  // two mines: a light at each mouth
  const map2 = { ...map, natureSites: [mine, { kind: 'mine', x: 9000, y: 9000, name: 'Second Mine' }], frame: { w: 400, h: 400 } };
  assert.equal(createUgView({ map: map2 }, {}).mouthSpots().length, 2 * MOUTH.n);
});

test('as bright as it is outside, in the sky\'s colour: day, dusk, moonlight', () => {
  const noon = { night: 0, amb: [1, 0.98, 0.92] }, dusk = { night: 0.45, amb: [0.95, 0.62, 0.42] }, night = { night: 1, amb: [0.2, 0.26, 0.45] };
  assert.ok(mouthLevel(noon) > 0.9, 'by day: nearly the whole dark lifted at the mouth');
  assert.ok(mouthLevel(night) > 0.15 && mouthLevel(night) < 0.3, 'at night: a little moonlight');
  assert.ok(mouthLevel(dusk) < mouthLevel(noon) && mouthLevel(dusk) > mouthLevel(night));
  const tn = mouthTint(night), td = mouthTint(dusk), tm = mouthTint(noon);
  assert.ok(tn[2] > tn[0], 'moonlight blue'); assert.ok(td[0] > td[2], 'dusk warm'); assert.ok(tm[0] > 200 && tm[1] > 200 && tm[2] > 200, 'noon white');
  assert.ok(tm[3] > tn[3], 'the wash fainter at night');
  assert.ok(mouthLevel(undefined) > 0.9 && mouthTint(undefined)[0] === 255, 'no sky yet: day');
});
