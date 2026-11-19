// Device words (pre-beta quick wins): touch and pad players never read a keyboard key. A key named inside a prompt or a
// note ("hold F to finish them", "press E") or an [[action]] comes out as the device's own glyph or words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localizeText, keysHtml } from '../client/glyphs.js';
import { input } from '../client/input.js';

const LINE = 'Hold to revive Sam · hold F to finish them';
test('a key inside the words follows the device: the keyboard its key, a pad its button, touch the button in words (no chip on the card)', () => {
  const was = input.device;
  try {
    input.device = 'keyboard';
    assert.equal(localizeText(LINE), LINE);
    assert.match(keysHtml(LINE), /hold <span class="g-tile"[^>]*aria-label="F"/);
    input.device = 'gamepad';
    assert.doesNotMatch(localizeText(LINE), /hold F\b/);
    input.device = 'touch';
    assert.equal(localizeText(LINE), 'Hold to revive Sam · hold the door button to finish them');
    assert.equal(keysHtml(LINE), 'Hold to revive Sam · hold <b>the door button</b> to finish them');
    assert.doesNotMatch(keysHtml('Use [[action]] here'), /\[\[/, '[[action]] names too');
  } finally { input.device = was; }
});

test('the cinematic panel and its notes speak the device: no Esc / WASD / F-keys on touch', () => {
  const src = readFileSync(new URL('../client/director.js', import.meta.url), 'utf8');
  assert.match(src, /const say = \(o\) => o\[dv\(\)\];/);
  for (const k of ['(F2)', '(F8)', '(F4)', 'N skips, Esc ends it.\'', 'drag or WASD / the stick']) assert.ok(!src.includes(k) || /kbm: '[^']*N skips, Esc ends it\.'/.test(src), k);
  assert.match(src, /touch: \{ drone: 'Free: drag to fly it/);
});

test('a Windows touch tablet with no mouse is a touch device, not an Xbox: the pad cursor needs no touch screen', () => {
  const src = readFileSync(new URL('../client/platform.js', import.meta.url), 'utf8');
  assert.match(src, /const touchScreen = !!\(NAV && NAV\.maxTouchPoints > 0\);/);
  assert.match(src, /const padCursor = [^\n]*&& !touchScreen;/);
  assert.match(readFileSync(new URL('../client/ridehud.js', import.meta.url), 'utf8'), /HORSE · \$\{gallopKey\(\)\} TO GALLOP/, 'no SPRINT on the horse line');
});
