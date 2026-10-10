// The campfire's look and the screen while you sit by it (client/render/campfx.js, client/hud.js), and the death screen
// (client/deathscreen.js): tasks #390, #375 and #403.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Campfires, EMBERS } from '../client/render/campfx.js';
import { calmState } from '../client/hud.js';
import { deathPanel, deathFold, deathLeft } from '../client/deathscreen.js';
import { CALM_PROMPT_S, CALM_HUD_S, DEATH_REVEAL_S } from '../shared/rules.js';

// Math.random seeded for a test, put back after
function seeded(fn) {
  const orig = Math.random; let s = 12345;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { return fn(); } finally { Math.random = orig; }
}
// a campfire in view for `secs`, a loud crackle every `crack` s (0: none): the embers made, and when the flares came
function burn(secs, crack, thin = false) {
  const fire = { t: 'campfire', lit: true, x: 100, y: 100 };
  let embers = 0;
  const S = { map: { props: [fire] }, flashes: [], loopClock: 0, fx: { thin, spawn: (type) => { if (type === 10) embers++; return {}; }, fire() {} } };
  const C = new Campfires(S), flares = [], dt = 1 / 60, F = { view: { x0: 0, y0: 0, x1: 400, y1: 400 }, dt };
  let nextCrack = crack;
  for (let t = 0; t < secs; t += dt) {
    S.loopClock = t;
    const before = C.flare.get(fire);
    C.tick(F);
    if (crack && t >= nextCrack) { C.crackle(100, 100, 1); nextCrack += crack; }
    if (C.flare.get(fire) !== before) flares.push(t);
  }
  return { embers, flares };
}

test('a campfire lets a few embers drift up; a loud crackle flares it now and then, never constantly (task #390)', () => seeded(() => {
  const calm = burn(60, 0);
  assert.ok(calm.embers / 60 > EMBERS.rate * 0.8 && calm.embers / 60 < 2, `at rest: ${(calm.embers / 60).toFixed(2)} embers a second`);
  assert.ok(calm.flares.length <= 8, `on its own it flares only once in a while (${calm.flares.length} in a minute)`);
  // crackling hard all the time (a loud crackle every 0.2 s): it still flares no more than every few seconds
  const loud = burn(60, 0.2);
  for (let i = 1; i < loud.flares.length; i++) assert.ok(loud.flares[i] - loud.flares[i - 1] >= EMBERS.gap[0] - 1e-6, 'flares a few seconds apart');
  assert.ok(loud.flares.length >= 6 && loud.flares.length <= 16, `${loud.flares.length} flares in a minute`);
  assert.ok(loud.embers / 60 < 3.5, `with the flares: ${(loud.embers / 60).toFixed(2)} embers a second (it was over 20)`);
  assert.ok(loud.embers > calm.embers, 'the crackles send more');
  assert.ok(burn(60, 0, true).embers < calm.embers, 'fewer on Low');
}));

test('sitting by a campfire: the prompt fades after a few seconds, the HUD after a while; anything you do brings them back (task #375)', () => {
  const sat = 10000, s = 1000;
  assert.deepEqual(calmState(0, 0, 99999), { prompt: false, hud: false }, 'not sitting: nothing fades');
  assert.deepEqual(calmState(sat, 0, sat + (CALM_PROMPT_S - 0.5) * s), { prompt: false, hud: false });
  assert.deepEqual(calmState(sat, 0, sat + (CALM_PROMPT_S + 0.5) * s), { prompt: true, hud: false }, 'the prompt fades first');
  assert.deepEqual(calmState(sat, 0, sat + (CALM_HUD_S + 0.5) * s), { prompt: true, hud: true }, 'then the whole HUD');
  const did = sat + 30 * s;
  assert.deepEqual(calmState(sat, did, did + 100), { prompt: false, hud: false }, 'a key, a move or a touch: all back at once');
  assert.ok(CALM_PROMPT_S >= 2 && CALM_PROMPT_S <= 6 && CALM_HUD_S >= 10 && CALM_HUD_S <= 40);
});

test('the death screen: the scene first, then the choices docked at the bottom; back folds them away to watch, and back again (task #403)', () => {
  const D = { at: 0, fold: false }, t0 = 5000, up = t0 + DEATH_REVEAL_S * 1000 + 10;
  assert.equal(deathPanel(D, true, t0), 'scene', 'first only the scene');
  assert.equal(deathFold(D, t0 + 100), false, 'back does nothing before the choices are up');
  assert.equal(deathPanel(D, true, up), 'open', 'then the choices');
  assert.equal(deathFold(D, up + 10), true);
  assert.equal(deathPanel(D, true, up + 20), 'bar', 'folded away: a slim bar with the countdown');
  assert.equal(deathFold(D, up + 30), true);
  assert.equal(deathPanel(D, true, up + 40), 'open', 'and back');
  assert.equal(deathPanel(D, false, up + 50), 'off', 'alive again: gone');
  assert.deepEqual([D.at, D.fold], [0, false], 'and reset for next time');
  // the countdown runs on between the server's updates
  const me = { respawnIn: 10 }, C = {};
  assert.equal(deathLeft(C, me, 1000), 10);
  assert.ok(Math.abs(deathLeft(C, me, 3500) - 7.5) < 1e-9);
  assert.equal(deathLeft(C, me, 99999), 0);
});
