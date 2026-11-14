// The placement lint (the owner, 2026-11-13: "Is there a way to go through the game and catch some of these kinds of
// errors since we're seeing a fair amount of signs being partially covered or some visual issues like boats parked in
// rocks?"). World v3 as the server builds it, every placed thing checked against what's round it:
//   - a moored boat, a hire craft's spot, a floating prop: on clear water - not on the rocks (a sea stack, a seal rock,
//     a boulder), not on a pier's planks or the shore
//   - a standing sign: not over another sign, not over a building's front (its door, its name), not hidden in a building
//   - one name, one sign: no two boards of the same words near each other, nor a board beside the building whose own
//     front says it already (the Harbor's HARBOR MARINA over its boat hire's Rentals)
//   - a prop not standing inside a building's walls
//   - in the wilds a board is a wooden trail sign, never a lit panel (the owner: "it should just be a more appropriate
//     wooden sign")
//   - a race's start buoy clear of the craft waiting for it (drawn over one, it hid it: the Redwood River Run)
// The checks are on the map's own data, so a failure names the thing and where: fix it in the data, not here.
// (One v3 build, about 100 s and 2 GB: the heavy lock.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { lint, LINT_ALLOW } from '../tools/placementlint.mjs';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const L = lint(M);
const say = (rows) => rows.slice(0, 10).map((r) => `${r.what} at ${Math.round(r.x / 32)}, ${Math.round(r.y / 32)}${r.why ? ` (${r.why})` : ''}`).join('; ');

for (const k of Object.keys(L.rows)) {
  test(`placement: ${k}`, () => {
    const rows = L.rows[k];
    assert.ok(rows.length <= (LINT_ALLOW[k] || 0), `${rows.length} found (allowed ${LINT_ALLOW[k] || 0}): ${say(rows)}`);
  });
}

test('the lint looked at things (it isn\'t passing on an empty world)', () => {
  assert.ok(L.seen.boats > 200 && L.seen.signs > 150 && L.seen.props > 20000, JSON.stringify(L.seen));
});
