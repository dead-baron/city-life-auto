// The sea's sparkle at night (task #392): only some nights, the same for everyone (render/atmos.js bioAt, from the
// server's day), along some stretches of shore and moving with the waves (art v2 lightgame.js waterSurf); the water's
// own baked glints - which glowed on all the water every night - are gone (client/art2/water.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bioAt, BIO_NIGHTS } from '../client/render/atmos.js';
import { seaPx, stillPx } from '../client/art2/water.js';
import { gameClock, DAY_LOOP_S } from '../shared/constants.js';

const at = (day, loopTime) => bioAt(day * DAY_LOOP_S + loopTime, gameClock(loopTime).minutes);

test('the sea sparkles only some nights - the same nights for everyone - never by day', () => {
  let on = 0;
  const N = 400, seeds = new Set();
  for (let d = 5000; d < 5000 + N; d++) {
    const a = at(d, 1050), b = at(d, 1050);   // (01:30)
    assert.deepEqual(a, b, 'the same night, the same sparkle');
    if (a[0] > 0) on++;
    seeds.add(a[1].toFixed(6));
    for (const lt of [60, 300, 600, 830]) assert.equal(at(d, lt)[0], 0, 'none by day');
  }
  assert.ok(on / N > BIO_NIGHTS - 0.08 && on / N < BIO_NIGHTS + 0.08, `${(on / N * 100).toFixed(0)}% of nights (it was every night)`);
  assert.ok(seeds.size > N * 0.9, 'each night its own stretches of shore');
});

test('a sparkling night fades in after dusk and out before dawn, never in one step', () => {
  for (let d = 7000; d < 7100; d++) {
    if (at(d, 1050)[0] === 0) continue;
    let prev = at(d, 0)[0], worst = 0;
    for (let s = 0.25; s < DAY_LOOP_S; s += 0.25) { const k = at(d, s)[0]; worst = Math.max(worst, Math.abs(k - prev)); prev = k; }
    assert.ok(worst < 0.02, `day ${d}: jumps ${worst.toFixed(3)} in a quarter second`);
  }
});

test('the water has no glowing pixels of its own any more', () => {
  let n = 0;
  for (let Y = 0; Y < 400; Y += 3) for (let X = 0; X < 400; X += 3) {
    for (const r of [seaPx(X, Y, (X + Y) % 60, ((X * 7 + Y) % 100) / 100, (X >> 6) % 3), stillPx(X, Y, (X * 3 + Y) % 40, ((X + Y * 3) % 100) / 100, (Y >> 7) & 1, (X >> 7) & 1)]) { n++; assert.equal(r.e, 0); }
  }
  assert.ok(n > 30000);
});
