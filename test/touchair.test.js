// At the controls of an aircraft on a touch screen (H69; the touch slots, UI-2): CLIMB and DOWN are one rocker in the
// context slots, clear of the aim stick, FIRE, ACT, EXIT, ITEMS and FIRE ON - the climb button once sat under FIRE's lower half (the phone
// playtest: tapping just above ▲ fired) - and BRAKE is put away up there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchSlots } from '../shared/touchcontrols.js';
import { slotGeometry } from '../client/touchslots.js';

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('in the air CLIMB and DOWN are one rocker, clear of the aim stick, FIRE, ACT, EXIT, ITEMS and FIRE ON; no BRAKE, HORN or RELOAD there', () => {
  const air = touchSlots({ air: true, inVeh: true, driver: true, armed: true, shoot: true, prompt: true });
  assert.equal(air.slots.c2.a, 'climb'); assert.equal(air.slots.c1.a, 'descend');
  for (const a of ['dive', 'horn', 'reload']) assert.ok(!Object.values(air.slots).some((s) => s.a === a), `${a} put away in the air`);
  for (const [W, H] of [[844, 390], [740, 360], [390, 844], [360, 780], [1024, 768]]) {
    const g = slotGeometry(W, H, H > W ? { t: 47, b: 34 } : {});
    for (const k of ['stick', 'fire', 'act', 'car', 'u1', 'u4']) assert.ok(!overlap(g.rk, g[k]), `${W}x${H}: the rocker clear of ${k}`);
    assert.ok(g.rk.h >= 88 && g.rk.w >= 44, `${W}x${H}: each half 44 px or more`);
    if (H > W) assert.ok(g.rk.x >= W / 2, `${W}x${H}: right of the middle (the move stick's half)`);
  }
});
