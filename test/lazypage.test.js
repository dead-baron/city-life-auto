// What the page needn't start with stays out of its start-up code (H69, the page's budget full at 483 of 485 KB):
// the debug menu (client/devmenu.js, with its sections, give panels and teleport map) and the free camera
// (client/spectator.js) load the first time they're used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closure } from '../tools/perf.mjs';

const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the debug menu and the free camera are not in the page\'s start-up code, and main.js loads them when used', () => {
  const page = new Set(closure(['client/boot.js', 'client/main.js']));
  for (const f of ['client/devmenu.js', 'client/devcats.js', 'client/devgive.js', 'client/devtp.js', 'client/spectator.js']) assert.ok(!page.has(f), `${f} loads lazily`);
  const main = src('client/main.js');
  assert.match(main, /import\('\.\/devmenu\.js'\)/, 'the debug menu, when it\'s on');
  assert.match(main, /import\('\.\/spectator\.js'\)/, 'the free camera, when it\'s first used');
  const menu = closure(['client/devmenu.js']);
  for (const f of ['client/devcats.js', 'client/devgive.js', 'client/devtp.js']) assert.ok(menu.includes(f), `the menu brings ${f}`);
});

test('the debug menu module has what it is handed: every name it uses from main.js comes through init', async () => {
  const m = src('client/devmenu.js');
  const handed = /export function init\(ctx\) \{ \(\{ ([^}]+) \} = ctx\); \}/.exec(m);
  assert.ok(handed, 'init hands the page\'s functions over');
  const names = handed[1].split(',').map((s) => s.trim());
  for (const n of ['S', '$', 'send', 'closeOverlay', 'topOverlay', 'requestPlayers', 'enterSpectate', 'openCreator', 'freshPress']) assert.ok(names.includes(n), n);
  const main = src('client/main.js');
  const call = /import\('\.\/devmenu\.js'\)\.then\(\(m\) => \{ m\.init\(\{ ([^}]+) \}\)/.exec(main);
  assert.ok(call, 'main.js calls init');
  assert.deepEqual(call[1].split(',').map((s) => s.trim()).sort(), [...names].sort(), 'main.js hands over the same names');
});
