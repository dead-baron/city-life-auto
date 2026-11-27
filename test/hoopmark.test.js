// The marker over a hoop (the owner, 11-23: "When you start the basketball activity an arrow shows up over the hoop and
// blocks the hoop art so it's hard to see where you're shooting"): the job marker stands above what it marks - its
// height sent with the target (server hoops.js targetFor h) - and a hoop's fades once you've seen it (fade; the page:
// client/main.js jobMarkAlpha).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { courtHoops } from '../shared/hoops.js';
import * as hoops from '../server/systems/hoops.js';

test('the hoop marker: above the backboard, and it fades', () => {
  const w = makeWorld();
  const H = courtHoops(w.map);
  assert.ok(H.length, 'courts with hoops');
  const { p } = joinPlayer(w);
  const h = H[0];
  teleport(w, p.ped, (h.court.x0 + h.court.x1) / 2, (h.court.y0 + h.court.y1) / 2);
  assert.equal(hoops.start(w, p, 0), null);
  const t = hoops.targetFor(w, p);
  assert.ok(t && t.x === h.rim.x && t.y === h.rim.y, 'on the rim');
  assert.ok(t.h >= (h.rim.z || 0) + 20, `above the backboard (${t.h} over the ground, the rim at ${h.rim.z})`);
  assert.equal(t.fade, 1, 'it fades');
  // the page draws it lifted by h, and fades a fading one
  const src = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.ok(/j\.y - \(j\.h \|\| 0\)/.test(src) && /j\.fade \? jobMarkAlpha/.test(src), 'main.js: lifted and faded');
});
