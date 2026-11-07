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
  assert.match(bag, /s\.innerHTML = glyph\(glyphOfWeapon\(id, \(WEAPONS\[id\] \|\| \{\}\)\.type\), Math\.round\(h \* 1\.15\)\);/, 'a weapon: its class\'s glyph, not the thin top-down sprite');
  assert.ok(!/fittedIcon/.test(bag));
});

test('the launch code in the title\'s slots: SIGN IN opens client/account.js\'s panel, the 17+ gate shows in the gate\'s slot', () => {
  assert.match(MAIN, /acc\.boot\(\{ send, toast, serverUrl, analytics: ga, noGate: true,/, 'the title shows the gate itself');
  assert.match(MAIN, /signIn: \(el, close\) => \{ el\.innerHTML = ''; acc\.openPanel\(\{ into: el \}\)\.then\(\(p\) => \{ if \(p\) p\.onback = close; \}\)/);
  assert.match(MAIN, /gate: \(el, done\) => \{ el\.innerHTML = ''; acc\.showGate\(done, \{ into: el \}\); \}/);
  assert.match(MAIN, /if \(id === 'signin' && S\.launch\) S\.launch\.acc\.closePanel\(\);/, 'closed with the screen, its pad with it');
  assert.match(MAIN, /if \(\(topOverlay\(\) === 'signin' \|\| topOverlay\(\) === 'gate'\) && S\.launch && S\.launch\.acc\.padActive\(\)\) return false;/, 'the pad is the panel\'s');
  assert.match(MAIN, /if \(!accountUi && !S\.practice\) \{ launchCall\('boot'\);/, 'PLAY before the launch code is in: the gate waits for it');
});

test('LOG OFF to the end (the server\'s safe exit, f5d9fc16): done, the socket closes 4016 - final, a summary on the title, PLAY connects', async () => {
  assert.match(MAIN, /if \(ev && ev\.code === 4016\) \{ loggedOff\(S\.offSummary\); return; \}/, 'no reconnecting on it');
  assert.match(MAIN, /else if \(m\.s === 'done'\) \{ S\.offSummary = m; stopLogoff\(\);/, 'the summary kept for the close');
  const lo = MAIN.slice(MAIN.indexOf('function loggedOff(sum) {'), MAIN.indexOf('function idleOut() {'));
  assert.match(lo, /S\.ws = null; S\.welcomed = false; S\.playing = false; S\.refused = 4016;/, 'PLAY connects again (playGo: S.refused)');
  assert.match(lo, /\$\('t-off'\)\.innerHTML = offSummaryHtml\(sum \|\| \{\}\);/);
  assert.match(MAIN, /S\.me && S\.me\.offNow \? 'at once here - your own home'/, 'the server\'s offNow, not a guess');
  assert.match(MAIN, /const LOGOFF_WAIT_MS = 1500;/, 'an old server: as before after 1.5 s');
  assert.match(HTML, /<div id="t-off" class="hidden" role="status" aria-live="polite"><\/div>/);
  const { offSummaryHtml, playedFor } = await import('../client/titlescreen.js');
  const h = offSummaryHtml({ earned: 1250, spent: 300, xp: 42, cexp: 0, sam: 5, secs: 4380 });
  assert.match(h, /SAVED - SAFE TRAVELS/);
  for (const w of ['Earned', '\\$1,250', 'Spent', '\\$300', 'XP', '\\+42', 'Samaritan', '\\+5', 'Played', '1 h 13 min']) assert.match(h, new RegExp(w), w);
  assert.ok(!/Criminal EXP/.test(h), 'only when it moved');
  assert.equal(playedFor(20), 'under a minute'); assert.equal(playedFor(600), '10 min'); assert.equal(playedFor(7200), '2 h');
});

// the owner, 11-06: "How do you quit a job you started?" - the HUD's job card is the way in: a tap or a click on it
// opens the phone's Jobs app with the job you're on at its top (what it is, Show on map, Quit job); P / the pad's phone
// button open the phone at home, the job on top there too. The Guide's Finding work says so.
test('the job card opens the phone\'s current job, with Quit job', async () => {
  // a page of stand-in elements: enough for the HUD's information and the phone to run
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', dataset: {}, style: {}, attrs: {}, listeners: {}, classList: { s: new Set(), toggle(c, on) { if (on === undefined ? !this.s.has(c) : on) this.s.add(c); else this.s.delete(c); }, add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, f) { this.listeners[k] = f; }, querySelectorAll: () => [], querySelector: () => null, getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }) }); return els.get(id); };
  const had = { document: globalThis.document, window: globalThis.window };
  globalThis.document = { getElementById: el, body: { classList: el('body').classList }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el(Math.random()) };
  globalThis.window ||= globalThis;
  try {
    const { createInfo } = await import('../client/hudinfo.js');
    let opened = 0;
    const H = { openJob: () => opened++ };
    const info = createInfo(H);
    const job = el('job');
    assert.equal(typeof job.listeners.click, 'function', 'the card takes a tap or a click');
    info.me({ hp: 100, cash: 50, weapon: 'fists', weapons: [], job: { k: 'Forklift', text: 'Forklift: get on your forklift - tap this card to quit', step: [1, 2], x: 10, y: 10 } }, null);
    assert.match(job.innerHTML, /tap this card to quit/i, 'its first line says so');
    job.listeners.click();
    assert.equal(opened, 1, 'a tap on it opens the phone at the job');
    assert.match(job.attrs['aria-label'], /Quit job/);
    // the phone's Jobs app: the job you're on at its top, Quit job on it
    const { createPhone } = await import('../client/phone.js');
    const sent = [];
    const ph = createPhone({ map: () => ({ pois: [], places: [] }), pos: () => ({ x: 0, y: 0 }), isCop: () => false, send: (m) => sent.push(m), setWaypoint() {}, waypoint: () => null, toast() {}, refocus() {}, close() {}, job: () => ({ text: 'Forklift: get on your forklift', x: 5, y: 5 }) });
    ph.openApp('jobs');
    assert.ok(sent.some((m) => m.t === 'phone' && m.a === 'board'), 'it asks for the board');
    ph.onBoard({ job: { type: 'forklift', text: 'Forklift', pay: 770 }, jobs: [] });
    const screen = el('ph-screen').innerHTML;
    assert.match(screen, /ON A JOB · FORKLIFT/);
    assert.match(screen, /data-act="cancel">Quit job</, 'Quit job, first on the screen');
    assert.ok(screen.indexOf('Quit job') < screen.indexOf('ph-chips'), 'above the board');
  } finally { globalThis.document = had.document; if (!had.window) delete globalThis.window; }
  // the page wires it: the card's tap to the phone's Jobs app
  assert.match(MAIN, /S\.hud\.openJob = \(\) => \{ if \(S\.playing\) openHub\('phone', 'jobs'\); \};/);
  assert.match(read('shared/guide.js'), /To quit, tap the job card on your screen \(or \[\[phone\]\]\)/);
});
