// Finish or hide (the owner, 11-24 08:44): what isn't finished for the beta is switched off - no start, no marks, no
// place listed, no Guide entry. Today: the kayak races (shared/hidden.js RACES_HIDDEN) - kayaks still hire and ride.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { RACES_HIDDEN, raceShown, racePlaceHidden } from '../shared/hidden.js';
import { placesOf } from '../client/mapwaypoints.js';
import { guideSections } from '../shared/guide.js';

test('the kayak races are hidden for the beta: not listed, not in the Guide; the other races are', async () => {
  const { map: M } = await buildWorld3(1337, { log: () => {} });
  const kayak = M.races.filter((r) => RACES_HIDDEN.includes(r.kind)), shown = M.races.filter(raceShown);
  assert.ok(kayak.length >= 1 && shown.length >= 2, `${kayak.length} hidden, ${shown.length} shown`);
  const listed = placesOf(M).filter((p) => p.kind === 'race');
  assert.ok(!listed.some((p) => kayak.some((r) => Math.hypot(r.start.x - p.x, r.start.y - p.y) < 2)), 'no hidden race\'s start in Places or on the map');
  assert.ok(listed.length >= shown.filter((r) => M.pois.some((p) => p.kind === 'race' && p.x === r.start.x && p.y === r.start.y)).length, 'the shown ones listed');
  assert.ok(M.pois.filter((p) => p.kind === 'rental').length && !placesOf(M).every((p) => p.kind !== 'rental'), 'the kayak hire still listed');
  const ids = guideSections(M).flatMap((s) => Object.values(s).find(Array.isArray) || []).map((e) => e.id);
  assert.ok(!ids.includes('riverrun'), 'no Guide entry for the river run');
  assert.ok(racePlaceHidden(M, M.pois.find((p) => p.kind === 'race' && kayak.some((r) => r.start.x === p.x && r.start.y === p.y))));
});
