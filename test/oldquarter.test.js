// The Old Quarter's Chapel Street quarter, handcrafted (shared/world3-oldquarter.js, 2026-10-19): Lantern Lane and Bell
// Lane run from Elm Street to Cedar Street, Tanner's Alley between them; the streets round it stay the grid's - Old
// Quarter Road, Harbor Avenue, Elm Street across from the station, Cedar Street. (The district built in the whole
// world: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OLDQUARTER, QX, QY } from '../shared/world3-oldquarter.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('the Old Quarter: the lanes run from Elm Street to Cedar Street, the alley between them', () => {
  assert.ok(HAND_PLANS.includes(OLDQUARTER));
  const S = OLDQUARTER.streets(), by = (n) => S.find((s) => s.name === n).pts;
  for (const n of ['Lantern Lane', 'Bell Lane']) {
    const P = by(n);
    assert.deepEqual([P[0][0], P.at(-1)[0]], [QX.elm, QX.cedar], `${n}: Elm Street to Cedar Street`);
    assert.ok(P.some((p, i) => i > 0 && p[1] !== P[i - 1][1]), `${n}: it jogs`);
  }
  const A = by("Tanner's Alley"), on = (P, q) => P.some((p) => p[0] === q[0] && p[1] === q[1]);
  assert.ok(on(by('Lantern Lane').concat([[QX.tanner, 1838]]), A[0]) && A[0][1] === 1838 && A.at(-1)[1] === 1872, 'the alley from one lane to the other');
});

test('the Old Quarter: the streets round it stay the grid\'s', () => {
  for (let x = QX.elm + 6; x < QX.cedar - 4; x += 11) for (const y of [QY.oqr, QY.harbor]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  for (let y = QY.oqr + 6; y < QY.harbor - 4; y += 9) for (const x of [QX.elm, QX.cedar]) assert.equal(handPlanAt(x, y), null, `${x}, ${y}`);
  assert.equal(handPlanAt(2300, 1850), OLDQUARTER);
  assert.equal(handPlanAt(2201, 1868), null, 'the station stays the grid\'s');
});
