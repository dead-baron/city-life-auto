// The hub (UI-3, the overhaul the owner approved on 2026-10-24): one panel - RESUME first, then MAP · PHONE · BAG ·
// PEOPLE · SETTINGS - in place of the HUD's seven round buttons, the long pause list and every duplicate way in. The
// pause list's items each have a home; Esc / Start / MENU open it on the last tab, the bumpers (Tab) change tabs; the
// phone has a job card first, an icon grid of every app and a Log of every note; jobs are short cards with one tap to
// accept, and the same card comes up when you Act at a job's place; the bag is a grid by category with Use / Equip /
// Drop / Pin; Settings is in sections with the controls of the device you're on. Its tabs load when first opened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closure } from '../tools/perf.mjs';
import { KB, PAD, TOUCH } from '../shared/controls.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const HTML = read('index.html'), MAIN = read('client/main.js');
const hubHtml = HTML.slice(HTML.indexOf('<div id="hub"'), HTML.indexOf('<div id="install"'));

test('the HUD row is MENU · PHONE · MAP, and the hub has RESUME first, then its five tabs, each one of the panels', () => {
  const row = HTML.slice(HTML.indexOf('<div id="hud-btns">'), HTML.indexOf('<span id="hp-text"'));
  assert.deepEqual([...row.matchAll(/<button id="(b-[a-z]+)"/g)].map((m) => m[1]), ['b-menu', 'b-phone', 'b-map'], 'three buttons, no more round ones');
  assert.deepEqual([...row.matchAll(/<\/svg>([A-Z]+)<span class="kchip kbm-only">([A-Z]+)<\/span>/g)].map((m) => m.slice(1).join(' ')), ['MENU ESC', 'PHONE P', 'MAP M'], 'labelled, the keys on a keyboard');
  for (const gone of ['b-bag', 'b-settings', 'b-fs', 'b-dev', 'id="pause"', 'id="controls"', 'help-tpl', 'class="hub hub-float"']) assert.ok(!HTML.includes(gone), `${gone} is gone`);
  const bar = hubHtml.slice(0, hubHtml.indexOf('<div id="hub-body">'));
  assert.ok(bar.indexOf('id="hub-resume"') < bar.indexOf('id="hub-tabs"'), 'RESUME first');
  assert.deepEqual([...bar.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1]), ['map', 'phone', 'bag', 'people', 'settings']);
  const body = hubHtml.slice(hubHtml.indexOf('<div id="hub-body">'));
  for (const id of ['bigmap', 'phone', 'inv', 'players', 'settings']) assert.match(body, new RegExp(`<div id="${id}" class="hidden[^"]*hubtab`), `${id} is a tab inside the hub`);
  assert.match(MAIN, /const HUB_TABS = \{ map: 'bigmap', phone: 'phone', bag: 'inv', people: 'players', settings: 'settings' \};/);
  assert.ok(!/openOverlay\('pause'\)/.test(MAIN) && !/'controls'/.test(MAIN), 'no pause list or controls page left');
});

test('every item of the old pause list has a home in the hub', () => {
  const help = hubHtml.slice(hubHtml.indexOf('<section data-sec="help"'), hubHtml.indexOf('<section data-sec="danger"'));
  const homes = {
    resume: /id="hub-resume"/, map: /data-tab="map"/, phone: /data-tab="phone"/, players: /data-tab="people"/, settings: /data-tab="settings"/,
    controls: /<section data-sec="controls">[\s\S]*id="set-binds"/, look: /data-h="look"/, cine: /data-h="cine"/, unstuck: /data-h="unstuck"/, surrender: /data-h="surrender"/,
    fullscreen: /data-h="fullscreen"/, devmode: /data-h="devmode"/, title: /data-h="title"/, dev: /data-h="dev"/,
  };
  for (const [k, re] of Object.entries(homes)) assert.match(hubHtml, re, k);
  // the police cruiser: a quick action on the phone; the cinematic mode is also the phone's Camera app
  const ph = read('client/phone.js');
  assert.match(ph, /quick\.push\(\['cruiser', 'Call a cruiser'\]\)/);
  assert.match(ph, /\['camera', 'Camera'\]/);
  // the debug menu: reachable, last and quiet
  const lines = [...help.matchAll(/data-h="([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(lines[lines.length - 1], 'dev', 'the debug menu is the last line');
  assert.match(help, /class="opt quiet play-only" data-h="dev"/, 'and never loud');
  // each Help line does what the pause line did
  const hub = read('client/hub.js');
  for (const h of ['unstuck', 'surrender', 'cine', 'fullscreen', 'title', 'install', 'look', 'devmode', 'dev']) assert.match(hub, new RegExp(`\\b${h}: `), `Help: ${h}`);
  assert.match(MAIN, /function surrender\(b\) \{[\s\S]*?send\(\{ t: 'surrender' \}\)/, 'surrender, pressed twice');
  assert.match(MAIN, /function exitToTitle\(\) \{ closeHub\(\); S\.playing = false;/);
  // the Danger zone stands apart
  assert.match(hubHtml, /<button role="tab" data-sec="danger" class="danger">Danger zone<\/button>/);
});

test('Esc, Start and MENU open the hub on the last tab; P, M, I a tab; LB / RB (Tab) step through them; the D-pad moves', () => {
  assert.match(MAIN, /else if \(S\.playing\) openHub\(\); \}/, 'Esc with nothing open: the hub');
  assert.match(MAIN, /input\.padStart && S\.playing\) openHub\(\);/, 'Start: the hub');
  assert.match(MAIN, /\$\('b-menu'\)\.onclick = \(\) => \{ if \(!S\.playing\) return; if \(inHub\(\)\) closeHub\(\); else openHub\(\); \};/, 'MENU: the hub, or away');
  assert.match(MAIN, /function openHub\(tab = hubTab, app\)/, 'on the last tab used');
  assert.match(MAIN, /hubTab = tab;/);
  assert.match(MAIN, /k === 'KeyP'[^\n]*hubToggle\('phone'\)/);
  assert.match(MAIN, /k === 'KeyM'[^\n]*hubToggle\('map'\)/);
  assert.match(MAIN, /function toggleBag\(\) \{[\s\S]*?openHub\('bag'\);/, 'I (and D-pad right): the bag');
  assert.match(MAIN, /up && input\.padPhone\) openHub\('phone'\)/, 'D-pad left: the phone');
  assert.match(MAIN, /HUB_IDS\.includes\(topOverlay\(\)\) && input\.menuTab && S\.playing\) \{ hubStep\(input\.menuTab\); return true; \}/, 'LB / RB');
  assert.match(MAIN, /k === 'Tab' && S\.playing && HUB_IDS\.includes\(topOverlay\(\)\)\) \{ hubStep\(1\); return; \}/, 'Tab on a keyboard');
  assert.match(MAIN, /const bar = HUB_IDS\.includes\(id\) && S\.playing \? \[\.\.\.\$\('hub-bar'\)\.querySelectorAll\('button'\)\] : \[\];/, 'the D-pad reaches RESUME and the tabs');
  assert.match(MAIN, /function startFocus\(\) \{ const i = focusables\(\)\.findIndex\(\(el\) => !el\.closest\('#hub-bar'\)\);/, 'focus starts in the tab, not on the bar');
  // one source for the controls: the hub's entries on every device, and the README
  for (const a of ['hub', 'hubtab']) assert.ok(KB[a] && TOUCH[a] && PAD[a], a);
  assert.equal(KB.hub, 'ESC'); assert.equal(PAD.hub[0], 'MENU'); assert.match(PAD.hubtab[0], /LB \/ RB/);
  const readme = read('README.md');
  assert.match(readme, /\| Menu \(the hub\) \|/);
  assert.match(readme, /\| Bag \(the hub's BAG tab[^\n]*\| tap ITEMS \|/);
});

test('the hub\'s tabs load when first opened, not with the page', () => {
  const page = new Set(closure(['client/boot.js', 'client/main.js']));
  for (const f of ['client/hub.js', 'client/bag.js', 'client/jobcard.js', 'client/phone.js']) assert.ok(!page.has(f), `${f} is lazy`);
  for (const f of ['hub', 'bag', 'jobcard', 'phone']) assert.match(MAIN, new RegExp(`import\\('\\./${f}\\.js'\\)`), `main.js loads ${f}.js when needed`);
  assert.ok(page.has('client/notelog.js'), 'the log store is on the page (every note goes in)');
});

test('the log store keeps every note in full, newest first, the same note counted, the oldest dropped past the cap', async () => {
  const { logNote, noteLog, clearLog, LOG_MAX } = await import('../client/notelog.js');
  clearLog();
  logNote('Waypoint set: Sunset Pier', 'info', 1000);
  logNote('A long note: Coast guard - your patrol boat is waiting at the Liberty Bay docks (the green ring).', 'good', 2000);
  logNote('A long note: Coast guard - your patrol boat is waiting at the Liberty Bay docks (the green ring).', 'good', 3000);
  let L = noteLog();
  assert.equal(L.length, 2);
  assert.match(L[0].text, /Liberty Bay docks \(the green ring\)\.$/, 'newest first, in full');
  assert.equal(L[0].n, 2, 'the same note again: counted');
  assert.equal(L[1].tone, 'info');
  logNote('   ', 'info'); assert.equal(noteLog().length, 2, 'nothing for an empty note');
  for (let i = 0; i < LOG_MAX + 10; i++) logNote(`note ${i}`, 'info', 10000 + i * 70000);
  L = noteLog();
  assert.equal(L.length, LOG_MAX);
  assert.equal(L[0].text, `note ${LOG_MAX + 9}`);
  clearLog(); assert.equal(noteLog().length, 0);
  assert.match(read('client/hud.js'), /logNote\(msg, tone\);/, 'every note the HUD shows goes in');
  assert.match(read('client/phone.js'), /screen === 'log'[\s\S]*?noteLog\(\)/, 'the phone\'s Log app reads it');
});

test('a job\'s card: what it is, the pay range, how far, the first step and one Accept; the Jobs app lists them', async () => {
  const { jobCardHtml, payText } = await import('../client/jobcard.js');
  const j = { id: 'fire', kind: 'fire', title: 'Firefighter - a shift from Fire Station 7', sub: 'fire calls', pay: 280, lo: 150, hi: 420, per: 'a call', step: 'Get in the fire engine at Fire Station 7', x: 3200, y: 0 };
  assert.equal(payText(j), '$150-$420');
  const h = jobCardHtml(j, { dist: 3200 });
  for (const want of ['Firefighter - a shift from Fire Station 7', '$150-$420', 'a call', 'FIRST</i>Get in the fire engine', '100 m', 'data-take="fire"', '>Accept<']) assert.ok(h.includes(want), want);
  const busy = jobCardHtml(j, { dist: 0, busy: true, compact: true });
  assert.match(busy, /class="jc compact"/); assert.match(busy, /disabled>Busy</);
  assert.ok(!busy.includes('fire calls'), 'the list\'s card is short: no description');
  const ph = read('client/phone.js');
  assert.match(ph, /jobCardHtml\(j, \{ dist: dist\(j\), busy: !!job, compact: true \}\)/, 'the Jobs app: short cards');
  assert.match(ph, /if \(taking && \(taking\.x \|\| taking\.y\)\) ctx\.setWaypoint/, 'accepted: the waypoint');
  assert.match(ph, /ctx\.close\(\);\n        return;/, 'and the hub away');
  assert.match(ph, /<div class="ph-cur">[\s\S]*?Show on map[\s\S]*?Quit job/, 'the job you\'re on: first, with Show on map and Quit job');
});

test('the server: every job on the board has its pay range and first step; Act at a job\'s place brings its card, Accept signs on', async () => {
  const { makeWorld, joinPlayer, run } = await import('./helpers.js');
  const phone = await import('../server/systems/phone.js');
  const players = await import('../server/systems/players.js');
  const ff = await import('../server/systems/firefighter.js');
  const { IN } = await import('../shared/input.js');
  const w = makeWorld();
  run(w, 1.2);
  const { p } = joinPlayer(w);
  const board = phone.handle(w, p, { a: 'board' });
  assert.ok(board.jobs.length > 5);
  for (const j of board.jobs) {
    if (j.kind === 'delivery' || j.kind === 'patrol') continue;
    assert.ok(Number.isFinite(j.lo) && Number.isFinite(j.hi) && j.hi >= j.lo && j.lo > 0, `${j.id}: a pay range ${j.lo}-${j.hi}`);
    assert.ok(j.per && j.step && j.step.length > 8, `${j.id}: what it's paid for, the first step`);
  }
  // at a fire station: Act brings the card, nothing is started yet
  let at = null;
  for (const r of ff.sitesOf(w.map).stations) { p.ped.x = r.x + 10; p.ped.y = r.y + 10; w.place(p.ped); const it = players.findInteraction(w, p); if (it && it.card && it.card.id === 'fire') { at = r; break; } }
  assert.ok(at, 'a fire station whose Act is signing on');
  p.conn.sent.length = 0;
  let seq = 0;
  const press = (bits) => { p.inputQ.push({ seq: ++seq, bits, mx: 0, my: 0, aim: 0 }); w.step(); };
  press(IN.ACTION); press(0);
  const card = p.conn.sent.find((m) => m && m.t === 'jobcard');
  assert.ok(card, 'the card');
  assert.equal(card.job.id, 'fire');
  assert.equal(card.where, at.name, 'headed with the place');
  assert.ok(card.job.lo > 0 && card.job.step, 'with its pay and first step');
  assert.equal(p.job, null, 'not signed on yet');
  // Accept (one tap): signed on, here
  const r = phone.handle(w, p, { a: 'take', id: 'fire', card: 1 });
  assert.ok(r.ok, r.err || '');
  assert.equal(p.job && p.job.type, 'fire');
  assert.equal(w.get(p.job.truck).model, 'firetruck', 'the fire engine issued');
  phone.handle(w, p, { a: 'cancel' });
  // walked off before accepting: refused
  press(IN.ACTION); press(0);
  p.ped.x += 900; w.place(p.ped);
  const far = phone.handle(w, p, { a: 'take', id: 'fire', card: 1 });
  assert.ok(!far.ok && /walked away/.test(far.err));
});

test('the bag: a grid by category; Drop puts things in a bag at your feet (never from a car); weapons too', async () => {
  const { itemCat, BAG_CATS, describe } = await import('../client/bag.js');
  assert.deepEqual(BAG_CATS.map((c) => c[0]), ['weapons', 'healing', 'food', 'clothes', 'fishing', 'tools', 'hunting', 'garden', 'valuables', 'other']);
  const want = { medkit: 'healing', bandage: 'healing', revivekit: 'healing', apple: 'food', coffee: 'food', redwine: 'food', buckskinJacket: 'clothes', camoCloak: 'clothes', worms: 'fishing', flyRod: 'fishing', bass: 'fishing', flashlight: 'tools', parachute: 'tools', venison: 'hunting', wolfPelt: 'hunting', jewelry: 'valuables', filmTicket: 'other' };
  for (const [id, c] of Object.entries(want)) assert.equal(itemCat(id), c, id);
  assert.match(describe('medkit'), /\+60 health, stops bleeding/);
  const bag = read('client/bag.js');
  assert.match(bag, /send\(\{ t: 'inv', a: 'use', id: t\.id \}\)/, 'Use');
  assert.match(bag, /send\(\{ t: 'weapon', id: t\.id \}\)/, 'Equip');
  assert.match(bag, /send\(\{ t: 'inv', a: 'drop', id: t\.id, w: t\.kind === 'w', n: a === 'dropall' \? t\.n : 1 \}\)/, 'Drop (pressed twice)');
  assert.match(bag, /send\(\{ t: 'inv', a: 'slot', i, id: quick\[i\] === t\.id \? null : t\.id \}\)/, 'Pin to the quick wheel');
  assert.match(bag, /SORTS = \[\['kind', 'By kind'\], \['name', 'A-Z'\], \['count', 'Most'\], \['value', 'Value'\]\]/, 'sorted');
  assert.match(bag, /data-cat="\$\{c\}"/, 'filtered');
  assert.match(bag, /<section class="bag-craft" hidden/, 'a place kept for crafting');
  // the server
  const { makeWorld, joinPlayer } = await import('./helpers.js');
  const cargo = await import('../server/systems/cargo.js');
  const { K } = await import('../shared/constants.js');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  p.profile.inventory.medkit = 3; p.profile.weapons.pistol = 40; p.ped.weapon = 'pistol';
  const bags = () => w.query(p.ped.x, p.ped.y, 80, K.BAG);
  assert.equal(cargo.dropItem(w, p, 'medkit', 1, false), null);
  assert.equal(p.profile.inventory.medkit, 2);
  assert.ok(bags().some((b) => b.items.medkit === 1), 'one med kit in a bag at your feet');
  assert.equal(cargo.dropItem(w, p, 'medkit', 99, false), null);
  assert.equal(p.profile.inventory.medkit, undefined, 'drop all');
  assert.equal(cargo.dropItem(w, p, 'pistol', 1, true), null);
  assert.equal(p.profile.weapons.pistol, undefined);
  assert.equal(p.ped.weapon, 'fists', 'the gun in your hand dropped: fists');
  assert.ok(bags().some((b) => b.weapons.pistol === 40), 'with its rounds');
  assert.match(cargo.dropItem(w, p, 'fists', 1, true), /don't have/);
  assert.match(cargo.dropItem(w, p, 'medkit', 1, false), /don't have/);
  const car = w.spawnVehicle('sedan', p.ped.x + 40, p.ped.y, 0, { npcOwned: false });
  p.profile.inventory.apple = 1; p.ped.vehId = car.id;
  assert.match(cargo.dropItem(w, p, 'apple', 1, false), /Get out first/);
  assert.match(read('server/session.js'), /msg\.t === 'inv' && msg\.a === 'drop'[^\n]*cargo\.dropItem/);
});

test('Settings: in sections, the controls of the device you\'re on (the others one tab away), every row 44 px', async () => {
  const { bindsHtml, devOf, BIND_GROUPS } = await import('../client/hub.js');
  assert.deepEqual([...hubHtml.matchAll(/data-sec="([a-z]+)"/g)].map((m) => m[1]).slice(0, 6), ['controls', 'sound', 'graphics', 'account', 'help', 'danger']);
  assert.equal(devOf('gamepad'), 'pad'); assert.equal(devOf('touch'), 'touch'); assert.equal(devOf('keyboard'), 'kbm');
  const kb = bindsHtml('kbm'), pad = bindsHtml('pad'), touch = bindsHtml('touch');
  assert.match(kb, /Interact<\/span><span class="kchip">E</); assert.match(pad, /Interact<\/span><span class="kchip">B</); assert.match(touch, /Interact<\/span><span class="kchip">ACT</);
  assert.ok(!kb.includes('>RT<') && !touch.includes('>SPACE<'), 'only the device\'s own');
  for (const [, rows] of BIND_GROUPS) for (const [a] of rows) assert.ok(KB[a] || PAD[a] || TOUCH[a], `${a} is in shared/controls.js`);
  // the options for one device show only on its tab
  assert.match(hubHtml, /<label class="srow" data-for="kbm"><span>Keyboard driving/);
  assert.match(hubHtml, /<label class="srow" data-for="pad"><span>Gamepad driving/);
  assert.match(hubHtml, /<label class="srow" data-for="pad touch"><span>Vibration/);
  assert.match(read('client/hub.js'), /for \(const el of \$\('settings'\)\.querySelectorAll\('\[data-for\]'\)\) el\.hidden = !el\.dataset\.for\.split\(' '\)\.includes\(d\);/);
  assert.match(read('client/hub.js'), /if \(!dev\) dev = devOf\(ctx\.input\.device\);/, 'it opens on the device you\'re using');
  const css = read('client/style.css');
  assert.match(css, /#set-nav button \{ min-height: var\(--tap-l\);/);
  assert.match(css, /\.set-bind \{[^}]*min-height: var\(--tap\);/);
  assert.match(css, /#set-body \.srow select \{ min-height: var\(--tap\);/);
});

test('a sideways phone: the shop\'s menu has a compact head and a scroll cue; the bag fits', () => {
  const css = read('client/style.css');
  const short = css.slice(css.indexOf("/* a shop's menu on a sideways phone"));
  assert.match(short, /#menu \.mhead \{ padding: 2px var\(--s2\) 2px var\(--s3\); min-height: var\(--tap\); \}/);
  assert.match(short, /#m-opts \{ flex: 1; min-height: 0; overflow-y: auto; \}/);
  assert.match(css, /\.cue-down \{[^}]*mask-image/);
  assert.match(read('client/hud.js'), /box\.classList\.toggle\('cue-down'/, 'the menu shows when there is more below');
  assert.match(read('client/bag.js'), /export function cue\(el\) \{ el\.classList\.toggle\('cue-down'/, 'the bag\'s grid too');
  assert.match(css, /@media \(max-height: 560px\) \{\n  \.bag \{ grid-template-columns: minmax\(0, 1fr\) 260px;/, 'the bag beside its details at 844x390');
});
