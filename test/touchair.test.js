// At the controls of an aircraft on a touch screen (H69; the touch slots, UI-2): CLIMB and DOWN in the context slots -
// since 11-03 two discs, an arrow each, like every other button - clear of the aim stick, FIRE, ACT, EXIT, ITEMS and FIRE
// ON (the climb button once sat under FIRE's lower half: the phone playtest, tapping just above ▲ fired), and BRAKE is put
// away up there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchSlots } from '../shared/touchcontrols.js';
import { slotGeometry } from '../client/touchslots.js';

// (round buttons: apart when their circles are)
const overlap = (a, b) => Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2) < (a.w + b.w) / 2;

test('in the air CLIMB and DOWN are two arrows, clear of the aim stick, FIRE, ACT, EXIT, ITEMS and FIRE ON; no BRAKE, HORN or RELOAD there', () => {
  const air = touchSlots({ air: true, inVeh: true, driver: true, armed: true, shoot: true, prompt: true });
  assert.equal(air.slots.c2.a, 'climb'); assert.equal(air.slots.c1.a, 'descend');
  for (const a of ['dive', 'horn', 'reload']) assert.ok(!Object.values(air.slots).some((s) => s.a === a), `${a} put away in the air`);
  for (const [W, H] of [[844, 390], [740, 360], [390, 844], [360, 780], [1024, 768]]) {
    const g = slotGeometry(W, H, H > W ? { t: 47, b: 34 } : {});
    for (const c of ['c1', 'c2']) {
      for (const k of ['stick', 'fire', 'act', 'car', 'u1', 'u4']) assert.ok(!overlap(g[c], g[k]), `${W}x${H}: ${c} clear of ${k}`);
      assert.ok(g[c].h >= 48 && g[c].w >= 48, `${W}x${H}: ${c} 48 px or more`);
      if (H > W) assert.ok(g[c].x >= W / 2, `${W}x${H}: right of the middle (the move stick's half)`);
    }
  }
});
