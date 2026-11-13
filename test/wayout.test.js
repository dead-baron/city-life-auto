// Every screen has a way out on every device (the owner, 2026-11-12: the phone's Camera on a phone had none - its clean
// screen hid everything and only Esc / F2 closed it): each overlay or mode a player can open, with a close or back a
// finger can see and tap, Esc on a keyboard and B on a pad. In the spirit of test/hudlayout.test.js, but read from the
// code: the button in the screen's markup, the key and the pad's B in the code that handles them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const HTML = read('index.html'), MAIN = read('client/main.js');
const block = (id) => { const a = HTML.indexOf(`<div id="${id}"`); assert.ok(a >= 0, `index.html has #${id}`); return HTML.slice(a, HTML.indexOf('\n  <div id=', a + 10) > 0 ? HTML.indexOf('\n  <div id=', a + 10) : undefined); };
// (the generic overlay: Esc closes the top one but the first-launch gate; B the same - client/main.js)
const ESC_ANY = /if \(k === 'Escape'\) \{ if \(topOverlay\(\)\) \{ if \(topOverlay\(\) !== 'gate'\) closeOverlay\(\); \}/;
const B_ANY = /if \(input\.menuBack\) closeOverlay\(\);/;

// each: where its touch close / back is (a file and a pattern), and Esc and B (a file and a pattern each)
const SCREENS = {
  'the hub (pause, map, phone and its apps, the Guide, bag, people, settings)': {
    touch: ['index.html', /<button id="hub-close" class="x"[^>]*aria-label="Close"/], back: ['index.html', /<button id="hub-back"[^>]*aria-label="Back"/],
    esc: ['client/main.js', /k === 'Escape' && HUB_IDS\.includes\(topOverlay\(\)\)\) \{ hubBack\(\);/], b: ['client/main.js', /HUB_IDS\.includes\(topOverlay\(\)\) && input\.menuBack\) \{ hubBack\(\);/] },
  'an arcade cabinet, the pool table, chess, air hockey (#arcade)': { touch: ['index.html', /<button id="arc-x" class="x"[^>]*aria-label="Leave the game"/], esc: ['client/main.js', ESC_ANY], b: ['client/main.js', B_ANY] },
  'the arrival by train': { touch: ['index.html', /<button id="arr-skip"/], esc: ['client/main.js', ESC_ANY], b: ['client/main.js', B_ANY] },
  'the install help': { touch: ['index.html', /<div id="install"[\s\S]*?<button class="x" data-close>/], esc: ['client/main.js', ESC_ANY], b: ['client/main.js', B_ANY] },
  'the dev password': { touch: ['index.html', /<div id="devpw"[\s\S]*?<button class="x" data-close>/], esc: ['client/main.js', ESC_ANY], b: ['client/main.js', B_ANY] },
  'sign in': { touch: ['index.html', /<div id="signin"[\s\S]*?data-back aria-label="Back"/], esc: ['client/main.js', ESC_ANY], b: ['client/main.js', B_ANY] },
  'a job offer, a run\'s result (#jobcard)': { touch: ['client/jobcard.js', /<button class="x" data-close aria-label="Close"/], esc: ['client/main.js', ESC_ANY], b: ['client/main.js', B_ANY] },
  'the character creator': { touch: ['client/creator.js', /<button class="x" data-act="done" aria-label="Done">/], esc: ['client/main.js', ESC_ANY], b: ['client/creator.js', /input\.menuBack/] },
  'the debug menu': { touch: ['client/devmenu.js', /<button class="dev-x"/], esc: ['client/main.js', ESC_ANY], b: ['client/devmenu.js', /inp\.menuBack\) goBack\(\)/] },
  'a counter, a shop, a door, someone to talk to (#menu)': { touch: ['index.html', /<button id="m-close" aria-label="Close">/], esc: ['client/main.js', /else if \(S\.hud\?\.menuOpen\) S\.hud\.closeMenu\(\)/], b: ['client/main.js', /if \(input\.menuBack\) S\.hud\.closeMenu\(\);/] },
  'the chat sheet': { touch: ['client/chat.js', /class="x"/], esc: ['client/main.js', /k === 'Escape' && S\.launch && S\.launch\.chat\.isOpen && !topOverlay\(\)\) \{ S\.launch\.chat\.close\(\);/], b: ['client/main.js', /input\.menuBack && !inOverlay && S\.launch && S\.launch\.chat\.isOpen\) S\.launch\.chat\.close\(\);/] },
  'the Camera (the photo mode, client/director.js)': { touch: ['client/director.js', /mk\('cine-x', 'Close the camera \(Esc, B\)', \(\) => close\(\)/], esc: ['client/director.js', /k === 'Escape' && !D\.holds\(\) && D\.isOpen\(\)\) \{ close\(\);/], b: ['client/director.js', /if \(I\.menuBack && D\.isOpen\(\)\) close\(\);/] },
  'the camera\'s free cameras (drone, drift, on someone)': { touch: ['client/director.js', /btn\('✕', false, \(\) => setMode\('follow'\)\)/], esc: ['client/director.js', /if \(down && k === 'Escape'\) \{ setMode\('follow'\); return true; \}/], b: ['client/director.js', /if \(I\.menuBack\) \{ setMode\('follow'\); return; \}/] },
  'the weapon picker (hold the weapon card)': { touch: ['client/inventory.js', /x\.className = 'x wp-x'; x\.type = 'button'; x\.setAttribute\('aria-label', 'Close'\)/], esc: ['client/main.js', /k === 'Escape' && wpick\.open\) \{ wpick\.close\(\);/], b: ['client/main.js', /input\.menuBack && !inOverlay && wpick\.open\) wpick\.close\(\);/] },
};

test('every screen a player can open has a close or back to tap, Esc and B', () => {
  const bad = [];
  for (const [name, w] of Object.entries(SCREENS)) for (const k of ['touch', 'back', 'esc', 'b']) {
    if (!w[k]) continue;
    const [f, re] = w[k];
    if (!re.test(read(f))) bad.push(`${name}: no ${k === 'touch' ? 'close to tap' : k === 'back' ? 'back to tap' : k === 'esc' ? 'Esc' : 'B'} (${f} ${re})`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
  // every overlay the page opens is one of them (or the first-launch gate: answered, not backed out of)
  const opened = new Set([...MAIN.matchAll(/openOverlay\('([a-z-]+)'\)/g)].map((m) => m[1]));
  const covered = { arcade: 1, arrival: 1, install: 1, devpw: 1, signin: 1, jobcard: 1, creator: 1, dev: 1, settings: 1, bigmap: 1, gate: 1 };
  for (const id of opened) assert.ok(covered[id], `#${id} is opened by the page: list its way out here`);
  for (const id of ['pause', 'bigmap', 'phone', 'inv', 'players', 'settings']) assert.match(block(id), /hubtab/, `#${id} is a screen of the hub (its close and back)`);
});

test('the Camera: its way out over the clean screen, and on touch a shutter', () => {
  const D = read('client/director.js');
  assert.match(D, /body\.cine-on #cine-x, body\.touch\.cine-on #cine-shut \{ display: block; \}/, 'the close on every device, the shutter on touch, while it\'s open');
  assert.match(D, /#cine-x \{[^}]*width: var\(--tap\); height: var\(--tap\);[^}]*opacity: \.55;/, '44 px in the corner, faint till it\'s touched');
  assert.match(D, /z-index: 72/, 'over the panel and the clean screen');
  assert.match(D, /mk\('cine-shut', 'Take a picture', \(\) => shot\(\)\)/);
  // the photo mode is everyone's; what runs the debug menu's commands or moves you is debug mode's
  assert.match(D, /if \(\(m === 'tour' \|\| m === 'scene'\) && !dev\(\)\) m = 'follow';/, 'the tour and the follow scenes: debug mode');
  assert.match(D, /if \(!dev\(\)\) return;   \/\/ \(the rest - the Showcase, the staged scenes - debug mode's/);
  assert.match(D, /if \(!\(S\.dev \|\| S\.devMode\)\) \{ api\.toast\('The staged scenes use the debug menu/, 'and the scenes refuse without it');
  assert.match(read('client/phone.js'), /\['camera', 'Camera'\]/, 'the phone calls it Camera');
  assert.match(read('shared/guide.js'), /id: 'camera', t: 'Camera \(photo mode\)'/, 'and the Guide has it');
});
