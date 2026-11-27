// Finish or hide (the owner, 11-24 08:44): what isn't finished for the beta is switched off - no start, no marks, no
// place listed, no Guide entry (shared/hidden.js RACES_HIDDEN). The kayak races were, till the paddling was done
// (11-27): they're back - and the switch still hides a kind put on the list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { RACES_HIDDEN, raceShown, racePlaceHidden } from '../shared/hidden.js';
import { placesOf } from '../client/mapwaypoints.js';
import { guideSections } from '../shared/guide.js';

test('the kayak race is back now the kayaker paddles: its start listed, the Guide has it; a kind put on the list is hidden again', async () => {
  const { map: M } = await buildWorld3(1337, { log: () => {} });
  const kayak = M.races.filter((r) => r.kind === 'kayak');
  assert.ok(kayak.length >= 1 && kayak.every(raceShown), 'the river run shown');
  const listed = placesOf(M).filter((p) => p.kind === 'race');
  const startOf = (r) => M.pois.find((p) => p.kind === 'race' && p.x === r.start.x && p.y === r.start.y);
  assert.ok(kayak.filter(startOf).every((r) => listed.some((p) => Math.hypot(r.start.x - p.x, r.start.y - p.y) < 2)), 'its start in Places');
  const ids = () => guideSections(M).flatMap((s) => Object.values(s).find(Array.isArray) || []).map((e) => e.id);
  assert.ok(ids().includes('riverrun'), 'the Guide\'s river run entry');
  // the switch: listed, hidden everywhere
  RACES_HIDDEN.push('kayak');
  try {
    assert.ok(kayak.every((r) => !raceShown(r)), 'hidden when listed');
    assert.ok(!placesOf(M).filter((p) => p.kind === 'race').some((p) => kayak.some((r) => Math.hypot(r.start.x - p.x, r.start.y - p.y) < 2)), 'its start off the map and out of Places');
    const st = kayak.map(startOf).find(Boolean);
    if (st) assert.ok(racePlaceHidden(M, st));
    assert.ok(M.pois.some((p) => p.kind === 'rental') && placesOf(M).some((p) => p.kind === 'rental'), 'the kayak hire still listed');
  } finally { RACES_HIDDEN.pop(); }
});
