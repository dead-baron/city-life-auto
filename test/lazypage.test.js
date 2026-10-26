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

// The trim pass of 2026-10-26 (the page's budget full at 498 KB): the page reads its handful of game numbers from
// shared/rules-page.js, never all of shared/rules.js (30 KB gzipped), and the install help sheet's steps and Repair
// install (client/installhelp.js) load the first time one is pressed.
test('the page leaves shared/rules.js and the install help out of its start-up code', async () => {
  const page = new Set(closure(['client/boot.js', 'client/main.js']));
  assert.ok(!page.has('shared/rules.js'), 'shared/rules.js: the page imports shared/rules-page.js');
  assert.ok(page.has('shared/rules-page.js'));
  assert.ok(!page.has('client/installhelp.js'), 'client/installhelp.js loads lazily');
  const main = src('client/main.js');
  assert.match(main, /import\('\.\/installhelp\.js'\)/, 'the install help, when first opened');
  // the sheet is filled and opened only once the module is here (no lost first press)
  assert.match(main, /installHelp\(\)\.then\(\(m\) => \{\s*\$\('i-body'\)\.innerHTML = m\.installSteps\(\) \+ m\.stuckSteps\(\);[\s\S]*?openOverlay\('install'\)/);
  // rules.js still hands out every number rules-page.js has, the same values
  const R = await import('../shared/rules.js'), P = await import('../shared/rules-page.js');
  for (const [k, v] of Object.entries(P)) assert.equal(R[k], v, `shared/rules.js re-exports ${k}`);
  const H = await import('../client/installhelp.js').catch(() => null);
  if (H) for (const f of ['installSteps', 'stuckSteps', 'repairInstall']) assert.equal(typeof H[f], 'function', f);
});
