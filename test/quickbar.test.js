// The HUD's quick bar (client/hud.js quickBar): a keyboard's only - touch and a pad keep the quick wheel (the owner,
// 11-22 N7). On a phone upright it sat under the BAG and weapon buttons with "HOLD HOLD BAG" beside it (11-23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../client/hud.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('  quickBar(me) {'), src.indexOf('\n  }\n', src.indexOf('  quickBar(me) {')));

test('the quick bar shows only with a keyboard', () => {
  assert.ok(body.length > 100, 'quickBar found');
  assert.match(body, /input\.device !== 'keyboard' \? \[\]/, 'no slots for touch or a pad');
});

test('the quick bar carries no hold-key label', () => {
  assert.doesNotMatch(body, />HOLD \$\{|class="qk"/, 'no "HOLD <key>" text beside the slots');
  assert.doesNotMatch(readFileSync(new URL('../client/style.css', import.meta.url), 'utf8'), /#qbar \.qk/);
});
