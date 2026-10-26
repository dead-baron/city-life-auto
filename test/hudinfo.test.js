// The HUD's information (UI-4, the owner's bar of 2026-10-24: "information should come and go as necessary but not
// linger and take up visual real estate"): notes one line with the whole of them in the phone's Log, the first-time
// hint strips shown a few times and then not, the knocked-out screen's choices, a store icon for every kind of shop,
// and the job card's words. No server, no page: client/hudinfo.js, notelog.js, deathscreen.js and storeicons.js as
// they are (test/hudlayout.test.js measures where it all sits; test/jobcardinfo.test.js the server's side).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logNote, noteLog, clearLog, noteLine, NOTE_LINE, promptWords } from '../client/notelog.js';
import { hintDue, hintSeen, hintCounts, hintStrip, HINT_TIMES, HINT_STATES, statusChips, jobWords, jobHtml, jobKey, fmtDist } from '../client/hudinfo.js';
import { deathChoices, WAKE_ROWS } from '../client/deathscreen.js';
import { STORE_ICON, GLYPHS } from '../client/storeicons.js';
import { KIND_ICON } from '../client/mapwaypoints.js';
import { SHOPS } from '../shared/items.js';
import { readFileSync } from 'node:fs';

const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('a note: one line on the screen, the whole of it in the phone\'s Log', () => {
  clearLog();
  const intro = "You drive a cab out of Union Station: your taxi is the green ring. Fares hail you in the street or ring in - pull up by them, then take them where they're going. Quick and smooth earns a tip.";
  const line = noteLine(intro);
  assert.ok(line.length <= NOTE_LINE + 16 && line.length < intro.length, `a line: "${line}"`);
  assert.ok(intro.startsWith(line), 'its first clause');
  assert.equal(noteLine('Wanted level lost.'), 'Wanted level lost.', 'a short one as it is');
  assert.equal(noteLine('You were seen: Vehicle theft. +10 heat - the police are looking for a Sedan.'), 'You were seen: Vehicle theft', 'the clause that says what happened');
  logNote(intro, 'good');
  logNote('Wanted level lost.', 'info');
  logNote('Wanted level lost.', 'info');
  const L = noteLog();
  assert.equal(L[0].text, 'Wanted level lost.', 'newest first');
  assert.equal(L[0].n, 2, 'the same again counted, not stacked');
  assert.equal(L[1].text, intro, 'the long one in full');
  // the HUD: every note logged before it's cut to a line (or to the server's own short line); two on screen at most
  const hud = readFileSync(new URL('../client/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /logNote\(msg, tone\);[^]*const line = short \? localizeText\(short\) : noteLine\(msg\);/);
  assert.match(hud, /while \(this\.toastEls\.length > 2\)/);
  assert.match(hud, /\.toast\.more'\)\) this\.openLog\?\.\(\)/, 'a note cut short: a tap opens the Log');
});

// UI-5 (the owner, 2026-10-26: "We don't need the message that says the crime you're about to commit like when stealing a
// car, the button showing a caution on it is enough"): what Act would do in the prompt's own words, the crime's name off
// it (the key chip and the touch button red with the "!" say it - hud.js crimeMarks); Safety mode's first press marks
// the prompt and the button for the second (hud.js safetyNudge), never a note
test('a crime ahead says so on the button, not in words: the prompt without the crime\'s name, no Safety mode note', () => {
  const crimes = [   // (the server's prompts for every act it knows is a crime: vehicles.js enterLabel, players.js, trains.js, ...)
    ['Steal the Sedan - Vehicle theft', 'Steal the Sedan'],
    ['Steal the Police Cruiser - Stealing a police vehicle (felony)', 'Steal the Police Cruiser'],
    ['Pull the driver out of the Police Cruiser - Carjacking a police vehicle (felony)', 'Pull the driver out of the Police Cruiser'],
    ['Pull the driver out of the Sedan - Violent carjacking (felony)', 'Pull the driver out of the Sedan'],
    ['Pull the rider off the horse - Carjacking', 'Pull the rider off the horse'],
    ['Steal the Road Bike - Bike theft', 'Steal the Road Bike'],
    ['Ride off on the skateboard - Vehicle theft', 'Ride off on the skateboard'],
    ['Ride off on the horse - Horse theft', 'Ride off on the horse'],
    ['Ride the horse bareback - Horse theft', 'Ride the horse bareback'],
    ['Pick up the carbon-gold case - Cargo theft', 'Pick up the carbon-gold case'],
    ['Crack the strongbox - Train robbery', 'Crack the strongbox'],
    ['Hold to unlock the back of the armored truck (5s) - armed robbery', 'Hold to unlock the back of the armored truck (5s)'],
    ['Set the thermal drill on the vault - a bank heist (the alarm goes at once)', 'Set the thermal drill on the vault'],
    ['Climb the wall - the guards will see', 'Climb the wall'],
  ];
  for (const [said, shown] of crimes) for (const pcr of [1, 2]) assert.equal(promptWords('F: ' + said, pcr), 'F: ' + shown, said);
  // no crime: as the server said it, dashes and all
  for (const t of ['E: Shop at the counter - Iron Sights Arms', 'F: Get in your Sedan', 'E: Talk to Ray - the mechanic']) assert.equal(promptWords(t, 0), t);
  assert.equal(promptWords('', 1), '');
  const hud = readFileSync(new URL('../client/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /formatPrompt\(promptWords\(me\.prompt, me\.pcr \| 0\)\)/, 'the prompt in its own words');
  assert.match(hud, /if \(tone === 'safety'\) \{ if \(!\$\('hud'\)\.classList\.contains\('hidden'\)\) this\.safetyNudge\(\); return; \}/, 'Safety mode: no note, not even in the Log');
  assert.doesNotMatch(hud, /tone = 'warn'; \}/);
});

test('a hint strip: the first few times for each thing you do, per character, then not again', () => {
  const st = memStore();
  for (const s of HINT_STATES) assert.ok(hintDue(st, 'p1', s), `${s} due at first`);
  for (let i = 0; i < HINT_TIMES; i++) { assert.ok(hintDue(st, 'p1', 'drive'), `shown ${i}`); hintSeen(st, 'p1', 'drive'); }
  assert.equal(hintDue(st, 'p1', 'drive'), false, `not after ${HINT_TIMES}`);
  assert.equal(hintCounts(st, 'p1').drive, HINT_TIMES);
  assert.ok(hintDue(st, 'p1', 'air'), 'the others still due');
  assert.ok(hintDue(st, 'p2', 'drive'), 'another character on the same device: its own count');
  assert.equal(hintDue(st, 'p1', 'nonsense'), false);
  // the device's own glyphs: the keys, the pad's buttons, the touch slots' names
  const kb = hintStrip('drive', 'kbm'), pad = hintStrip('drive', 'pad'), touch = hintStrip('drive', 'touch');
  assert.deepEqual(kb.map((h) => h[0]), ['WASD', 'SPACE', 'H', 'F']);
  assert.ok(kb.every((h) => h[2] === 'key'));
  assert.deepEqual(pad.map((h) => h[0]), ['L-STICK', 'RT', 'LT', 'X']);
  assert.deepEqual(touch.map((h) => h[0]), ['BRAKE', 'HORN', 'EXIT'], 'the slots as they read at the wheel');
  assert.deepEqual(hintStrip('air', 'touch').map((h) => h[0]), ['CLIMB', 'DOWN', 'EXIT']);
  assert.deepEqual(hintStrip('air', 'kbm').map((h) => h[0]), ['WASD', 'SPACE', 'SHIFT', 'F']);
  assert.deepEqual(hintStrip('horse', 'touch').map((h) => h[0]), ['GALLOP', 'STOP', 'OFF']);
  assert.deepEqual(hintStrip('cine', 'kbm').map((h) => h[0]), ['F2', 'F4', 'F8', 'ESC']);
  for (const s of HINT_STATES) for (const d of ['kbm', 'pad', 'touch']) assert.ok(hintStrip(s, d).length >= 2, `${s} on ${d}`);
});

test('the status line in plain words: Samaritan, Criminal XP, the record on its own', () => {
  const c = statusChips({ faction: 'citizen', sam: 12, cexp: 3, felonies: 15, bleeding: true, buffs: { coffee: 30 } });
  const words = c.map((x) => `${x.t}${x.v ? ' ' + x.v : ''}`);
  assert.deepEqual(words.slice(0, 4), ['Citizen', 'Samaritan 12', 'Criminal XP 3', 'Record 15 felonies']);
  assert.ok(!words.some((w) => /\bSAM\b|\bEXP\b/.test(w)), 'no SAM / EXP');
  assert.ok(c.find((x) => x.t === 'Bleeding').k === 'flag', 'what\'s happening to you now: a flag (a phone shows those)');
  assert.equal(statusChips({ faction: 'enforcer', rank: 'Sergeant' })[0].t, 'Police · Sergeant');
});

test('the job card: the job, the call, step N of M, the objective; a new step is a new key', () => {
  const j = { k: 'Paramedic', n: 2, u: 'Call', step: [1, 3], text: 'Paramedic: someone collapsed on Rowan Street', x: 100, y: 100, left: 610, s: 'shift' };
  const w = jobWords(j);
  assert.equal(w.head, 'PARAMEDIC · CALL 2');
  assert.equal(w.step, 'STEP 1 OF 3');
  assert.equal(w.obj, 'Someone collapsed on Rowan Street', 'the job\'s own name off the objective');
  const big = jobHtml(j, { big: true, dist: '640 M', time: 'SHIFT 10:10' }), chip = jobHtml(j, { dist: '640 M' });
  assert.match(big, /PARAMEDIC · CALL 2.*SHIFT 10:10.*Someone collapsed on Rowan Street.*640 M.*STEP 1 OF 3/s);
  assert.doesNotMatch(chip, /STEP|SHIFT/, 'the chip: the objective and how far only');
  assert.match(jobHtml(j, { big: true, done: true, paid: 140 }), /Job done.*DONE · \+\$140/s, 'finished: the pay');
  assert.notEqual(jobKey(j), jobKey({ ...j, step: [2, 3] }), 'a new step');
  assert.equal(jobKey(j), jobKey({ ...j, left: 400 }), 'the clock running isn\'t one');
  assert.equal(fmtDist(640 * 32), '640 M'); assert.equal(fmtDist(2300 * 32), '2.3 KM');
});

test('the knocked-out screen: where to wake up nearest first, the picked one among them; down, the calls for help', () => {
  const spawnOpts = Array.from({ length: 9 }, (_, i) => ({ id: 'h' + i, label: 'Hospital ' + i, kind: 'hospital', x: 1000 + (8 - i) * 3200, y: 500 }));
  spawnOpts.push({ id: 'home', label: 'Your flat', kind: 'home', x: 1000 + 40 * 3200, y: 500 });
  const down = { help: false, amb: false, canAmb: true, fee: 250, ambUsed: false, finished: false };
  const me = { dead: true, down, spawnOpts, spawnChoice: 'home', deadAt: [1000, 500], deathCause: 'Shot by a police officer in Midtown', respawnIn: 12 };
  const C = deathChoices(me);
  assert.equal(C.title, 'KNOCKED OUT');
  assert.equal(C.cause, 'Shot by a police officer in Midtown', 'how it happened (on a phone too)');
  assert.equal(C.places.length, WAKE_ROWS);
  assert.deepEqual(C.places.slice(0, WAKE_ROWS - 1).map((o) => o.id), ['h8', 'h7', 'h6', 'h5'], 'nearest first');
  assert.equal(C.places[WAKE_ROWS - 1].id, 'home', 'the picked one kept among them');
  assert.ok(C.places.find((o) => o.id === 'home').on && C.chosen.id === 'home');
  assert.ok(Math.abs(C.places[0].d - 0) < 1, 'how far, in metres');
  assert.ok(C.wake, 'WAKE UP HERE');
  assert.deepEqual(C.help.map((b) => b[0]), ['help', 'amb'], 'call for help, the ambulance');
  assert.match(C.help[1][1], /Ambulance \$250/);
  const asked = deathChoices({ ...me, down: { ...down, help: true, amb: true } });
  assert.deepEqual(asked.help.map((b) => b[0]), ['help', 'ambx', 'cancel'], 'asked: call again, cancel the ambulance, cancel the request');
  const wet = deathChoices({ ...me, down: { ...down, wet: true } });
  assert.match(wet.help[1][1], /Rescue boat/);
  const poor = deathChoices({ ...me, down: { ...down, canAmb: false } });
  assert.equal(poor.help[1][3], true, 'no money in the bank: the ambulance greyed');
  const wasted = deathChoices({ ...me, down: { ...down, finished: true } });
  assert.equal(wasted.title, 'WASTED'); assert.deepEqual(wasted.help, [], 'finished: only where to wake');
  assert.equal(deathChoices(me, 'h3').chosen.id, 'h3', 'a place picked here shows at once');
});

test('a store icon for every kind of shop: a round badge with a glyph per trade', () => {
  const SKIP = new Set(['home', 'atm', 'station', 'ride', 'race', 'farm', 'sar']);   // (art2 host.js SHOP_SKIP: marks of their own)
  const kinds = new Set([...Object.keys(KIND_ICON), ...Object.keys(SHOPS)].filter((k) => !SKIP.has(k)));
  const missing = [...kinds].filter((k) => !STORE_ICON[k]);
  assert.deepEqual(missing, [], 'kinds with no icon');
  const glyphless = Object.entries(STORE_ICON).filter(([, g]) => typeof GLYPHS[g] !== 'function');
  assert.deepEqual(glyphless, [], 'icons with no glyph');
  for (const [k, g] of [['gunshop', 'gun'], ['clothing', 'shirt'], ['hardware', 'hammer'], ['convenience', 'cart'], ['pharmacy', 'pill'], ['hospital', 'cross'], ['police', 'badge'], ['courthouse', 'scales'], ['bank', 'bank'], ['roadhouse', 'beer'], ['club', 'cocktail'], ['coffee', 'coffee'], ['gasstation', 'fuel']]) assert.equal(STORE_ICON[k], g, k);
  // each glyph draws: a stub context takes every call
  const calls = [];
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, a])), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.Path2D ??= class { constructor(d) { this.d = d; } };
  for (const [name, fn] of Object.entries(GLYPHS)) { const n = calls.length; fn(g); assert.ok(calls.length > n, `${name} draws`); }
});
