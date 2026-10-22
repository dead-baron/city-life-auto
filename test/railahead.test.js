// The art ahead of a train you ride (client/art2/game/host.js _railAhead): the line's points ahead, from the map the
// renderer has now. World v3's window holds only its regions' points (shared/regionpack.js compacts them), so a new
// window has new, shorter lists - the index kept from the old window pointed past their ends and threw every frame on
// the train (the owner, 10-22: the subway "crashed" on the way into Lake District Station).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../client/art2/game/host.js';

const line = (x0, n, step = 64) => Array.from({ length: n }, (_, i) => ({ x: x0 + i * step, y: 1000, s: i * step }));

test('the line ahead of a train: indexed afresh for each new window; holes and missing points never throw', () => {
  const w = Object.create(World2.prototype);
  w.map = { rails: [{ pts: line(0, 400) }] };
  const a = w._railAhead(1000, 1000, 300, 0, 2000);
  assert.ok(a && a.length >= 4 && a[0][0] > 1000, 'points ahead, east');
  // the window moves on: the same line, its list now only this window's points (shorter, starting further east)
  w.map = { rails: [{ pts: line(12000, 60) }] };
  let b;
  assert.doesNotThrow(() => { b = w._railAhead(13000, 1000, 300, 0, 2000); });
  assert.ok(b && b[0][0] > 13000, 'the new window\'s line');
  assert.doesNotThrow(() => w._railAhead(1000, 1000, 300, 0, 2000), 'where the old window was: nothing, no throw');
  // a list with a hole in it (a point not held)
  const P = line(0, 100); delete P[41]; delete P[44];
  w.map = { rails: [{ pts: P }] };
  assert.doesNotThrow(() => w._railAhead(2500, 1000, 300, 0, 4000));
  assert.doesNotThrow(() => w._railAhead(2800, 1000, -300, 0, 4000));
});
