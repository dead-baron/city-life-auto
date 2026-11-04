// UI-10 (stage 2 of the owner's UI concepts, 2026-11-03): every screen on the stage-1 kit - the title and its loading
// state (UIC-08), the pause list (UIC-07) with a safe LOG OFF, the settings' tabs with the launch's slots (UIC-06), the
// phone's apps and the Guide's place (UIC-02..05), the map's legend (UIC-01), the bag's carried slots (UIC-19), the
// conversation and the gun store (UIC-16, UIC-18), the job offer (UIC-17), the big moments and the knocked-out screen
// (UIC-15). The page is a dumb window: these read its markup and code, and run the parts that are plain functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closure } from '../tools/perf.mjs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const HTML = read('index.html'), MAIN = read('client/main.js'), CSS = read('client/style.css');

test('the title (UIC-08): a loading state - "Connecting...", the bar, a tip - then the menu, your card and who is online', async () => {
  const title = HTML.slice(HTML.indexOf('<div id="title"'), HTML.indexOf('<div id="signin"'));
  for (const id of ['t-status', 't-load', 't-warm', 't-tip', 'play', 't-char', 't-settings', 't-card', 't-signin', 't-online']) assert.match(title, new RegExp(`id="${id}"`), id);
  assert.ok(title.indexOf('id="play"') < title.indexOf('id="t-row2"'), 'PLAY, then CHARACTER and SETTINGS under it');
  assert.match(CSS, /#title\.loading :is\(#t-buttons, #t-row2, #t-gfx, #t-tools, #t-practice\) \{ display: none; \}/, 'loading: no menu');
  assert.match(CSS, /#title:not\(\.loading\) #t-load \{ display: none; \}/, 'ready: no bar');
  const ts = read('client/titlescreen.js');
  assert.match(ts, /const isLoading = warm \|\| \(!ctx\.idle\(\) && \$\('play'\)\.disabled && !S\.practice\);/, 'loading while PLAY cannot be pressed, or the art warms up');
  assert.match(ts, /if \(loading && now - lastTip > 6000\) nextTip\(\);/, 'a new tip every few seconds');
  const { TIPS } = await import('../client/titlescreen.js');
  assert.equal(TIPS[0], 'Explore the city to find new opportunities.', 'the concept\'s own first');
  for (const t of TIPS) assert.ok(!/colour|centre|neighbour|tyre|pavement|car park/i.test(t), `American English: ${t}`);
  assert.match(MAIN, /\$\('t-status'\)\.textContent = 'Connecting\.\.\.';/);
  const page = new Set(closure(['client/boot.js', 'client/main.js']));
  assert.ok(page.has('client/titlescreen.js'), 'on the page from the start (it is the first thing you see)');
});

test('the sign-in panel and the first-launch gate: slots the launch work fills, a stub until then', () => {
  assert.match(HTML, /<div id="signin" class="hidden overlay">[\s\S]*<div id="signin-body" data-slot="account"><\/div>/);
  assert.match(HTML, /<div id="gate" class="hidden overlay">[\s\S]*<div id="gate-body" data-slot="gate"><\/div>/);
  assert.match(MAIN, /function setAccountUi\(ui\) \{/);
  assert.match(MAIN, /window\.CLA = \{[^\n]*setAccountUi/, 'reachable for the launch code');
  assert.match(MAIN, /if \(accountUi && accountUi\.signIn\) \{ accountUi\.signIn\(body,/, 'its panel when it is there');
  assert.match(MAIN, /Sign-in is coming soon\./, 'else the stub');
  for (const w of ['Guest', 'Google', 'Discord', 'Reddit', 'Email link', 'Passkey']) assert.ok(MAIN.includes(`'${w}'`), w);
  assert.match(MAIN, /return \(\) => withGate\(\(\) => \{/, 'the gate before the first PLAY');
  assert.match(MAIN, /if \(topOverlay\(\) === 'gate' && input\.menuBack\) return true;/, 'answered, not backed out of');
});

test('the pause list (UIC-07): LOG OFF asks the server, falls back to leaving; LEAVE GAME goes to the title', () => {
  const p = MAIN.slice(MAIN.indexOf('const PAUSE_GO = {'), MAIN.indexOf('function syncLogoff()'));
  assert.match(p, /leave: \(\) => \{ sfx\('click', 0\.8\); exitToTitle\(\); \}/);
  assert.match(p, /send\(\{ t: 'logoff' \}\);/, 'asks the server');
  assert.match(p, /const LOGOFF_WAIT_MS = 1500;/);
  assert.match(p, /if \(logoff && logoff\.st === 'ask'\) \{ stopLogoff\(\); exitToTitle\(\); \}/, 'no answer: as before');
  assert.match(p, /if \(logoff\.st === 'count'\) send\(\{ t: 'logoff', a: 'cancel' \}\);/, 'pressed again: called off');
  assert.match(MAIN, /case 'logoff': onLogoff\(m\); break;/);
  assert.match(CSS, /#hub\[data-tab=pause\] #hub-bar \{ display: none; \}/, 'the pause list is its own panel');
  assert.match(CSS, /body\.portrait #hub\[data-tab=pause\] \{ align-items: flex-end;/, 'upright: at the foot, in the thumb\'s reach');
});

test('settings (UIC-06): tabs along the top; Chat and Legal are slots; the Danger zone at the foot of Account', () => {
  const set = HTML.slice(HTML.indexOf('<div id="settings"'), HTML.indexOf('<div id="install"'));
  assert.match(set, /<section data-sec="chat" hidden><h2>CHAT<\/h2>\s*<div id="s-chatbox" data-slot="chat">/);
  assert.match(set, /<section data-sec="legal" hidden><h2>LEGAL<\/h2>\s*<div id="s-legalbox" data-slot="legal">/);
  assert.match(set, /MATURE CONTENT/);
  const acct = set.slice(set.indexOf('<section data-sec="account"'), set.indexOf('<section data-sec="help"'));
  assert.match(acct, /id="s-signin"/); assert.match(acct, /class="set-danger"[\s\S]*id="s-fresh"/);
  assert.match(set, /<section data-sec="game" hidden>[\s\S]*id="s-safety"[\s\S]*id="s-shopmarks"/, 'the game options in GAME');
  assert.ok(!set.includes('data-h="title"'), 'leaving the game is the pause list\'s, once');
});

test('the phone (UIC-02..05): pixel tiles, the Guide\'s place, Places opens in place, Jobs has its filters and START', () => {
  const ph = read('client/phone.js');
  assert.match(ph, /\['camera', 'Camera'\], \['guide', 'Guide'\]\];/, 'the Guide last');
  assert.match(ph, /screen === 'guide'/);
  assert.match(ph, /<span class="ph-tile">\$\{pix\(APP_PIX\[k\]\)\}<\/span>/);
  assert.match(ph, /data-grp="\$\{g\.id\}" aria-expanded/, 'Places: a kind opens under itself');
  assert.match(ph, /const JOB_FILTERS = \[\['all', 'All'\], \['driving', 'Driving'\], \['delivery', 'Delivery'\], \['service', 'Service'\]\];/);
  assert.match(CSS, /#hub\[data-tab=phone\] \.hub-frame \{[^}]*animation: phone-up/, 'it slides up (UIC-20 05)');
});

test('the bag (UIC-19): the carried slots - 2 guns, a melee weapon, a throwable - and the carry gear\'s locked ones', async () => {
  const { carryKind, CARRY, CARRY_GEAR, CARRY_CAPS } = await import('../client/bag.js');
  assert.deepEqual(CARRY.map((c) => c[0]), ['gun', 'gun', 'melee', 'throw']);
  assert.deepEqual(CARRY_GEAR.map((c) => c[2]), ['Shoulder holster', 'Back sling', 'Chest rig']);
  assert.deepEqual(CARRY_CAPS, { gun: 4, melee: 2, throw: 2 });
  assert.equal(carryKind('pistol'), 'gun'); assert.equal(carryKind('rifle'), 'gun'); assert.equal(carryKind('bat'), 'melee');
  assert.equal(carryKind('grenade'), 'throw'); assert.equal(carryKind('fists'), null); assert.equal(carryKind('rod'), null);
  const bag = read('client/bag.js');
  assert.match(bag, /data-a="use"[\s\S]*data-a="drop"[\s\S]*data-a="equip"/, 'USE, DROP, EQUIP in the same three places');
});

test('the menu at a counter: a conversation (UIC-16), a gun store with tabs and bars (UIC-18), the number keys', () => {
  const hud = read('client/hud.js');
  assert.match(hud, /const talk = !store && !m\.board && m\.opts\.length <= 4/);
  assert.match(hud, /Not enough cash for \$\{f\.label\}\./);
  assert.match(hud, /const KIND_NAME = \{ pistols: 'PISTOLS', rifles: 'RIFLES', melee: 'MELEE', throw: 'THROWABLES', ammo: 'AMMO', gear: 'GEAR' \};/);
  assert.match(MAIN, /if \(S\.hud\.menuOpen\) S\.hud\.pickMenu\(n\);/, 'a number key picks the n-th row on show');
});

test('big moments (UIC-15): BUSTED, LEVEL UP, JOB DONE come and go by themselves; the knocked-out screen\'s ring', () => {
  const hud = read('client/hud.js');
  assert.match(hud, /this\.moment\('BUSTED'/); assert.match(hud, /this\.moment\('LEVEL UP'/);
  assert.match(read('client/hudinfo.js'), /H\.moment\('JOB DONE'/);
  assert.match(hud, /this\.momentT = setTimeout\(\(\) => \{ el\.classList\.add\('out'\);/, 'gone on its own');
  const ds = read('client/deathscreen.js');
  assert.match(ds, /id="d-ring"/); assert.match(ds, /RESPAWN HERE/);
});

test('a desktop\'s screens scale with the window (the 11-04 review): one zoom on the panels, phones as they were', () => {
  assert.match(MAIN, /function uiScale\(w, h\) \{ return Math\.round\(Math\.min\(1\.6, Math\.max\(1, Math\.min\(h \/ 615, w \/ 1090\)\)\) \* 20\) \/ 20; \}/);
  const uiScale = new Function(`${MAIN.match(/function uiScale\(w, h\) \{[^\n]*\}/)[0]}; return uiScale;`)();
  assert.equal(uiScale(1920, 1080), 1.6); assert.equal(uiScale(1366, 768), 1.25); assert.equal(uiScale(1024, 600), 1);
  assert.match(CSS, /body:not\(\.touch\) #hub:not\(\[data-tab=map\]\) \.hub-frame, body:not\(\.touch\) #menu \.panel, body:not\(\.touch\) \.jc-pop, body:not\(\.touch\) #d-panel \{ zoom: var\(--zk, 1\); \}/, 'the panels, not the map or the HUD, and never on a phone');
  const bag = read('client/bag.js');
  assert.match(bag, /if \(c\.width \/ Math\.max\(1, c\.height\) < 3\.4 && c\.height >= h \* 0\.35\) return c;/, 'a thin sprite: the class glyph instead');
});
