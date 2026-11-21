// The people's bodies, checked (the owner, 2026-11-20: "is there a better way ... so that all the things we've discussed
// are fixed and checked and we nail it down this time?"). tools/bodycheck.mjs measures every rule he gave on the game's own
// art pixels - both bases, the five builds, the eight directions, in underwear and in a white top and jeans (160 figures):
// no points or bumps on the body, the legs two legs front and back, underwear whole across its middle, straps on both
// sides, a neck from the side, lines and shade no darker than the colour's own deep tone, a level hem, the eyes there at
// every angle, feet in proportion. A fault here is one he would see: fix the body, not the rule.
// By hand:   node tools/bodycheck.mjs            the list
//            node tools/bodycheck.mjs --show f,3,under,0    one figure's art pixels (base, build, outfit, direction)
import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../tools/bodycheck.mjs';
import { POLISH } from '../client/art2/peoplepolish.js';

test('the bodies: every rule holds on every build, base and direction, in underwear and in clothes', () => {
  const F = check(POLISH);
  assert.equal(F.length, 0, `${F.length} faults:\n` + F.slice(0, 30).map((f) => `  ${f.who}: ${f.text}`).join('\n'));
});
// (walking: the rules that don't need a figure standing square - no points or bumps, nothing too dark, the eyes there)
test('the bodies, walking: no points, no bumps, no dark specks, the eyes at every angle', () => {
  const F = check(POLISH, { poses: ['walk0', 'walk1', 'walk2', 'walk3'] });
  assert.equal(F.length, 0, `${F.length} faults:\n` + F.slice(0, 30).map((f) => `  ${f.who}: ${f.text}`).join('\n'));
});
