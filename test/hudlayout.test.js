// The HUD on every screen (H70): the prompt (what Act would do - "Steal the Sedan - Vehicle theft"), the notes, the job
// line and the cruiser's hint fully on the screen and never under a button, the minimap, the cash and the stars, nor
// each other - on desktops (1280x720, 1920x1080), phones on their side (844x390, 740x360) and upright (390x844) and a
// tablet (1024x768), with a keyboard, a pad or the touch controls, on foot, driving, flying and as the police. The QA
// sweep of 2026-10-11 found the prompt under the round buttons on a phone (its first word or two showing) and on a
// desktop with a long prompt, and the notes over the job line on a phone.
// Measured for real: the HUD's markup from index.html with the stylesheet in a headless Chromium (test/hudpage.js;
// skipped when there's none - set CLA_CHROME to one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problems, scenarios, findChrome, measureAll } from './hudpage.js';

test('the prompt, the notes, the job line and the cruiser hint are readable and clear of the buttons on every screen', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const all = await measureAll();
  assert.equal(all.length, scenarios().length, 'every scenario measured');
  const bad = all.flatMap(problems);
  assert.ok(all.every((r) => r.read.some((b) => b.name === 'prompt')), 'the prompt shows everywhere');
  assert.deepEqual(bad, [], bad.slice(0, 30).join('\n'));
});
