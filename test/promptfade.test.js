// The action prompt fades a few seconds after it comes up (the owner, 2026-11-04: "things like entering buildings with
// the UI text that pops up, we can have that disappear after a few seconds so it's not always on the screen"): the
// touch button it lit stays lit; a new target, or the same one after leaving it, brings it back; a prompt that counts
// down, asks, wants a hold or waits for safety mode's second press stays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { promptFades } from '../client/notelog.js';
import { PROMPT_FADE_S } from '../shared/rules.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the prompt fades after PROMPT_FADE_S, the touch button stays lit, a countdown or a question stays', () => {
  assert.equal(PROMPT_FADE_S, 3);
  assert.equal(promptFades("E: Into Old Town Apt #1229's lobby"), true, 'going in somewhere');
  assert.equal(promptFades('E: Rob the till - a crime'), true, 'a crime the same');
  assert.equal(promptFades('E: Leaving in 5s'), false, 'a countdown');
  assert.equal(promptFades('E: Sell the car for $400?'), false, 'a question');
  assert.equal(promptFades('E: Hold to pick the lock'), false, 'a hold');
  assert.equal(promptFades('E: Into the lobby', true), false, 'safety mode waiting for the second press');
  const hud = read('client/hud.js');
  assert.match(hud, /this\.fadeT = setTimeout\(\(\) => \{ if \(pr\.dataset\.sig === sig && promptFades\(words, pr\.classList\.contains\('armed'\)\)\) pr\.classList\.add\('faded'\); \}, PROMPT_FADE_S \* 1000\);/);
  assert.match(hud, /pr\.dataset\.sig = ''; crimeMarks\(pr, 0\); this\.unarm\(\); clearTimeout\(this\.fadeT\); pr\.classList\.remove\('faded'\);/, 'gone and back: shown again');
  assert.ok(!/faded[^\n]*#tbtns|#tbtns[^\n]*faded/.test(hud), 'the touch button is left lit');
  assert.match(read('client/style.css'), /#helpbox\.faded \{ opacity: 0; transition: opacity \.4s; \}/);
});
