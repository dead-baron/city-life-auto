// The HUD's layers (client/style.css): the morning playtest of 2026-10-09 found the district's title card drawn
// over the notes beside the minimap - its big letters ran through the text you needed to read (stepping into the
// cave: "Into the cave... switch on a flashlight" under GRANITE PEAKS). The notes now sit over the title card, and
// under the robbery and train bars and every panel (the shop menu, the death screen, the pause menu).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../client/style.css', import.meta.url), 'utf8');

// the z-index of the first rule that is exactly `sel { ... }` (no other selectors on it) and sets one
function z(sel) {
  const esc = sel.replace(/[#.]/g, (c) => '\\' + c);
  const re = new RegExp(`(^|\\n)${esc}\\s*\\{([^}]*)\\}`, 'g');
  for (const m of CSS.matchAll(re)) {
    const v = /z-index:\s*(-?\d+)/.exec(m[2]);
    if (v) return Number(v[1]);
  }
  return null;
}

test('the notes sit over the district title card, under the bars and the panels', () => {
  const toasts = z('#toasts'), district = z('#district');
  assert.ok(toasts !== null, '#toasts has a z-index');
  assert.ok(district !== null, '#district has a z-index');
  assert.ok(toasts > district, `notes (${toasts}) over the district title (${district})`);
  for (const sel of ['#rob', '#trainbar', '#menu', '#death']) {
    const v = z(sel);
    assert.ok(v !== null && v > toasts, `${sel} (${v}) over the notes (${toasts})`);
  }
  const pause = /#pause, #controls, #players, #devpw, #inv \{[^}]*z-index:\s*(\d+)/.exec(CSS);
  assert.ok(pause && Number(pause[1]) > toasts, 'the pause menu over the notes');
  // the notes never take a tap or a click from the game (or the touch buttons under them)
  assert.match(CSS, /#hud \{[^}]*pointer-events:\s*none/);
});

test('an open shop menu\'s wallet line follows what you spend in it (hud.js setMe)', () => {
  const HUD = readFileSync(new URL('../client/hud.js', import.meta.url), 'utf8');
  const setMe = HUD.slice(HUD.indexOf('  setMe(me) {'), HUD.indexOf('\n  }\n', HUD.indexOf('  setMe(me) {')));
  assert.match(setMe, /if \(this\.menu[^\n]*\$\('m-money'\)\.textContent = `Wallet \$\$\{me\.cash/);
});
