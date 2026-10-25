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

// The light down there that isn't yours (notes 2: "dark inside for sure but there should be some natural light ... But
// we can still have areas that are completely dark"): shafts of daylight through the roof, lanterns hung along the way
// in, the glowing things - and stretches with none of it, where you need your own light (shared/caverns.js lightCave).
import { lightAt, C, cellAtPx } from '../shared/underground.js';
import { TILE } from '../shared/constants.js';

test('a cave has lit stretches and dark ones: daylight down its shafts, the miners\' lanterns, the glow - and pitch dark', () => {
  const L = undergroundOf(map), K = L.caves[0], R = K.region;
  assert.ok(K.shafts.length >= 2, `shafts of daylight (${K.shafts.length})`);
  assert.ok(K.lanterns.filter((l) => l.hung).length >= 4, 'lanterns hung along the way in');
  assert.ok(K.timbers.length >= 3, 'timber sets across the mine\'s passages');
  let n = 0, lit = 0, dark = 0, litNight = 0;
  for (let ty = R.y0; ty < R.y0 + R.h; ty++) for (let tx = R.x0; tx < R.x0 + R.w; tx++) {
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (cellAtPx(L, x, y) !== C.FLOOR) continue;
    n++;
    const v = lightAt(L, x, y, [], 1);
    if (v >= 0.25) lit++;
    if (v === 0) dark++;
    if (lightAt(L, x, y, [], 0) >= 0.25) litNight++;
  }
  assert.ok(lit / n > 0.2, `lit by day without a light of your own (${(lit / n * 100).toFixed(0)}% of the floor)`);
  assert.ok(dark / n > 0.3, `and pitch dark in places (${(dark / n * 100).toFixed(0)}%)`);
  assert.ok(litNight < lit, 'the shafts give only a little moonlight at night');
  for (const s of K.shafts) assert.ok(lightAt(L, s.x, s.y, [], 1) > 0.7 && lightAt(L, s.x, s.y, [], 0) < lightAt(L, s.x, s.y, [], 1), 'daylight down a shaft');
  assert.ok(lightAt(L, K.den.x, K.den.y, [], 1) === 0, 'the bear\'s den: pitch dark');
  // where a light someone left behind can lie: dry floor, in the light
  assert.ok(K.finds.length >= 4, `spots for a find (${K.finds.length})`);
  for (const f of K.finds) { assert.equal(cellAtPx(L, f.x, f.y), C.FLOOR); assert.ok(lightAt(L, f.x, f.y, [], 1) >= 0.2, 'in the light'); }
  // the same layout everywhere: worked out again, it comes out the same
  const again = undergroundOf({ ...map }).caves[0];
  assert.deepEqual(again.shafts, K.shafts); assert.deepEqual(again.finds, K.finds); assert.deepEqual(again.lanterns, K.lanterns);
});
