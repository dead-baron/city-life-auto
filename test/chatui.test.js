// Chat on the page (client/chat.js) in a real headless Chromium, with a stand-in for the game round it: lines arrive as
// the server sends them (server/chat.js) and what the page sends back is checked. The bubbles over heads (two lines at
// most, apart from each other), the feed under the notes, the sheet (the channels, the quick lines and the emotes, the
// line and SEND, Esc), a name's mute / block / report, the phone's Messages app (threads, unread, a reply, quick
// replies, back), Settings > Chat (the channel switches, unmute), and the sheet riding on top of a phone's keyboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { findChrome } from './hudpage.js';
import { QUICK, EMOTES, REPORT_WHY, CHANNELS } from '../shared/chatdefs.js';
import { CREW } from '../shared/rules.js';
import { KB, PAD, TOUCH, ACTIONS, KEY_ACTION } from '../shared/controls.js';
import { guideSections } from '../shared/guide.js';

const ROOT = new URL('../', import.meta.url);
const PAGE_JS = `
const { createChat } = await import('/client/chat.js');
const out = {}, sent = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const touch = location.hash === '#touch';
document.body.classList.add(touch ? 'touch' : 'kbm');
const pos = { 11: { x: 300, y: 300 }, 12: { x: 330, y: 300 }, 13: { x: 600, y: 200 } };
let up = 0;
const C = createChat({
  send: (m) => sent.push(m), canvas: $('#view'), toast: (t) => sent.push({ toast: t }), screenOf: (eid) => pos[eid] || null,
  device: () => (touch ? 'touch' : 'keyboard'), playing: () => true, focus: (on) => { out.focus = on; }, dot: (on) => { out.dot = on; },
  openApp: () => { out.openedApp = (out.openedApp || 0) + 1; },
});
C.onMessage({ t: 'chatstate', off: {}, mutes: [], blocks: [], names: {}, max: 200, me: 'me0', crew: true, fac: null });
out.inboxAsked = sent.some((m) => m.t === 'inbox');
// someone near says two things, then a third: two lines at most in the bubble; a second speaker beside them is kept apart
C.onMessage({ t: 'chat', ch: 'near', n: 'Marisol', id: 'mar1', eid: 11, text: 'hello there', at: 1 });
C.onMessage({ t: 'chat', ch: 'near', n: 'Marisol', id: 'mar1', eid: 11, text: 'nice car', at: 2 });
C.onMessage({ t: 'chat', ch: 'near', n: 'Marisol', id: 'mar1', eid: 11, text: 'want to race?', at: 3 });
C.onMessage({ t: 'chat', ch: 'near', n: 'Lou', id: 'lou1', eid: 12, text: 'me too', at: 4 });
C.onMessage({ t: 'emote', eid: 13, e: 'wave', n: 'Ann', id: 'ann1' });
await wait(120);
const bubs = [...document.querySelectorAll('.cht-bub')];
out.bubbles = bubs.length;
out.bubLines = bubs.map((b) => [...b.children].map((s) => s.textContent));
const r = bubs.map((b) => b.getBoundingClientRect());
out.bubApart = !(r[0].left < r[1].right && r[1].left < r[0].right && r[0].top < r[1].bottom && r[1].top < r[0].bottom);
out.bubAbove = r[0].bottom <= 300;
out.bubFont = getComputedStyle(bubs[0]).fontFamily;
out.feed = [...document.querySelectorAll('#cht-feed .cht-fl')].map((d) => d.textContent);
// the sheet
C.open();
await wait(30);
out.sheetOpen = !$('.cht-sheet').hidden && document.body.classList.contains('cht-open');
out.tabs = [...document.querySelectorAll('.cht-tab')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '') + (b.classList.contains('na') ? '-' : ''));
out.chips = [...document.querySelectorAll('.q-row .cht-chip')].map((b) => b.textContent);
out.emotes = document.querySelectorAll('.em-row .cht-chip').length;
out.logged = [...document.querySelectorAll('.cht-log .cht-l')].map((d) => d.textContent);
out.focused = document.activeElement === $('.cht-in');
$('.q-row .cht-chip').click();
$('.em-row .cht-chip').click();
$('.cht-in').value = 'typed line'; $('.cht-row').requestSubmit();
$('.cht-in').value = '/c to the crew'; $('.cht-row').requestSubmit();
$('.cht-in').value = '/wave'; $('.cht-row').requestSubmit();
document.querySelectorAll('.cht-tab')[1].click();
out.crewChips = [...document.querySelectorAll('.q-row .cht-chip')].map((b) => b.textContent);
out.crewEmotes = document.querySelectorAll('.em-row .cht-chip').length;
$('.q-row .cht-chip').click();
document.querySelectorAll('.cht-tab')[2].click();
out.factionHint = [...document.querySelectorAll('.cht-log .cht-l')].pop().textContent;
document.querySelectorAll('.cht-tab')[0].click();
// a name in the log: mute, block, report with a reason
document.querySelector('.cht-log [data-who="mar1"]').click();
out.whoTitle = $('.cht-who h2').textContent;
out.whoButtons = [...document.querySelectorAll('.cht-who .btn')].map((b) => b.dataset.w);
$('.cht-who [data-w="mute"]').click();
document.querySelector('.cht-log [data-who="lou1"]').click();
$('.cht-who [data-w="report"]').click();
out.reasons = [...document.querySelectorAll('.cht-who [data-why]')].map((b) => b.dataset.why);
$('.cht-who [data-why="harassment"]').click();
out.whoGone = !$('.cht-who');
// a bubble, while the sheet is up
bubs[1].click();
out.bubbleWho = $('.cht-who h2') && $('.cht-who h2').textContent;
$('.cht-who .x').click();
// Esc closes, and the game's keys come back
$('.cht-in').focus();
$('.cht-in').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
out.closed = $('.cht-sheet').hidden && !document.body.classList.contains('cht-open') && out.focus === false;
// a muted player's lines are dropped
C.onMessage({ t: 'modres', ok: true, note: 'Muted', state: { mutes: ['mar1'], blocks: [], names: { mar1: 'Marisol' } } });
const n0 = C.lines.length;
C.onMessage({ t: 'chat', ch: 'near', n: 'Marisol', id: 'mar1', eid: 11, text: 'muted line', at: 5 });
out.mutedDropped = C.lines.length === n0;
// phone messages: a thread each, unread until looked at
C.onMessage({ t: 'inbox', l: [{ t: 'chat', ch: 'phone', n: 'Big Lou', id: 'lou1', eid: 0, text: 'you around?', at: Date.now() - 60000 }] });
out.unread = C.unread; out.dotOn = out.dot;
C.onMessage({ t: 'contacts', l: [{ id: 'lou1', n: 'Big Lou', how: 'crew', crew: 1, on: true }, { id: 'zed1', n: 'Zed', how: 'met', on: false }] });
const ph = document.getElementById('ph-screen');
let refocused = 0;
C.renderApp(ph, { refocus: () => refocused++, title: (t) => { out.appTitle = t; } });
out.appTabs = [...ph.querySelectorAll('.seg button')].map((b) => b.textContent);
out.appRows = [...ph.querySelectorAll('[data-cmh]')].map((b) => b.dataset.cmh);
ph.querySelector('[data-cmh="lou1"]').click();
out.threadTitle = out.appTitle;
out.threadMsgs = [...ph.querySelectorAll('.cm-m')].map((d) => d.firstChild.textContent);
out.unreadAfter = C.unread; out.dotAfter = out.dot;
ph.querySelector('[data-cmq]').click();
ph.querySelector('.cm-send input').value = 'see you there';
ph.querySelector('.cm-send').requestSubmit();
C.onMessage({ t: 'chat', ch: 'phone', n: 'me', id: 'me0', eid: 0, text: 'see you there', at: Date.now(), own: 1, to: 'lou1', tn: 'Big Lou' });
out.threadAfter = [...ph.querySelectorAll('.cm-m')].map((d) => (d.classList.contains('me') ? '>' : '<') + d.firstChild.textContent);
ph.querySelector('[data-cmx="report"]').click();
out.appReasons = ph.querySelectorAll('[data-cmw]').length;
ph.querySelector('[data-cmw="spam"]').click();
out.backThread = C.appBack(); out.atHome = !!ph.querySelector('.seg'); out.backHome = C.appBack();
ph.querySelector('[data-cmt="near"]').click();
out.nearChips = ph.querySelectorAll('[data-cmq]').length; out.nearEmotes = ph.querySelectorAll('[data-cme]').length;
ph.querySelector('[data-cme]').click();
out.kept = (() => { try { return Object.keys(JSON.parse(localStorage.getItem('cla.msgs.me0') || '{}')); } catch { return 'none'; } })();
await wait(500);
out.keptLater = (() => { try { return Object.keys(JSON.parse(localStorage.getItem('cla.msgs.me0') || '{}')); } catch { return 'none'; } })();
// Settings > Chat
const set = document.getElementById('setbox');
C.settings(set);
out.setRows = set.querySelectorAll('input[data-ch]').length;
out.muteList = [...set.querySelectorAll('[data-un]')].map((b) => b.dataset.a + ':' + b.dataset.un);
set.querySelector('input[data-ch="faction"]').click();
set.querySelector('[data-un]').click();
// a phone's keyboard: the visual viewport shrinks, the sheet rides on top of it and folds its log away
if (touch) {
  C.open();
  out.touchFocused = document.activeElement === $('.cht-in');
  out.touchHidden = getComputedStyle(document.getElementById('touch')).visibility;
  const vv = window.visualViewport;
  Object.defineProperty(vv, 'height', { get: () => innerHeight - 200, configurable: true });
  vv.dispatchEvent(new Event('resize'));
  await wait(30);
  const sr = $('.cht-sheet').getBoundingClientRect();
  out.kbBottom = Math.round(innerHeight - sr.bottom);
  out.kbFold = $('.cht-sheet').classList.contains('kb') && getComputedStyle($('.cht-log')).display === 'none';
  out.kbFits = sr.top >= 0;
  C.close();
}
out.sent = sent;
document.getElementById('out').textContent = JSON.stringify(out);
`;
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/client/style.css"></head><body><div id="game"><canvas id="view" width="10" height="10" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
<div id="hud"><div id="hud-tl"><div id="toasts"></div></div></div><div id="touch"></div><div id="ph-screen"></div><div id="setbox"></div></div><pre id="out"></pre>
<script type="module">${PAGE_JS}</script></body></html>`;
const TYPES = { '.css': 'text/css', '.woff': 'font/woff', '.png': 'image/png', '.js': 'text/javascript' };
function serve() {
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__chat.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
    try {
      const p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (p.includes('..')) throw new Error('no');
      const body = readFileSync(new URL(p, ROOT));
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ port: srv.address().port, close: () => srv.close() })));
}
async function run(dev, size) {
  const chrome = findChrome(), srv = await serve();
  try {
    const html = await new Promise((ok, no) => execFile(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--virtual-time-budget=20000', `--window-size=${size}`, '--dump-dom', `http://127.0.0.1:${srv.port}/__chat.html#${dev}`], { maxBuffer: 16 << 20, timeout: 60000 }, (e, so) => (e ? no(e) : ok(so))));
    const m = /<pre id="out">(\{.*?)<\/pre>/s.exec(html);
    if (!m) throw new Error('the chat page gave nothing: ' + html.slice(-600));
    return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  } finally { srv.close(); }
}

test('chat\'s data: the quick lines (the crew\'s are the Crew app\'s), the reasons, the control on every device, the Guide entry', () => {
  assert.equal(CREW.says, QUICK.crew, 'one list: the Crew app and the chat\'s crew chips');
  for (const ch of ['near', 'crew', 'faction', 'phone']) assert.ok(QUICK[ch].length >= 4 && QUICK[ch].every((t) => t.length <= 40), ch);
  assert.ok(ACTIONS.includes('chat') && KB.chat === 'T' && KEY_ACTION.T === 'chat' && PAD.chat && TOUCH.chat, 'chat on every device');
  const e = guideSections().flatMap((s) => s.entries).find((x) => x.id === 'chat');
  assert.ok(e && e.b.includes('[[chat]]'), 'the Guide teaches it by its control');
  assert.equal(REPORT_WHY.length, 7);
  assert.deepEqual(CHANNELS, ['near', 'crew', 'faction', 'phone']);
});

test('chat on a desktop: bubbles, the feed, the sheet, quick lines and emotes, mute / block / report, the Messages app, Settings', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const o = await run('kbm', '1280,720');
  assert.ok(o.inboxAsked, 'what came while away is asked for on joining');
  assert.equal(o.bubbles, 3);
  assert.deepEqual(o.bubLines[0], ['nice car', 'want to race?'], 'two lines at most in a bubble, the newest last');
  assert.ok(o.bubApart, 'two speakers side by side: their bubbles kept apart');
  assert.ok(o.bubAbove, 'above the speaker');
  assert.match(o.bubFont, /CLA Pixel/, 'in the game\'s pixel face');
  assert.equal(o.feed.length, 2, 'two lines in the feed on a desktop');
  assert.ok(o.feed[1].includes('Ann') && o.feed[1].includes(EMOTES.wave.text));
  assert.ok(o.sheetOpen && o.focused, 'T: the sheet, its line ready to type in');
  assert.deepEqual(o.tabs, ['Near*', 'Crew', 'Faction-'], 'Near first; no faction greyed');
  assert.deepEqual(o.chips, QUICK.near);
  assert.equal(o.emotes, Object.keys(EMOTES).length);
  assert.ok(o.logged.some((l) => l.includes('Marisol') && l.includes('want to race?')));
  assert.deepEqual(o.crewChips, QUICK.crew); assert.equal(o.crewEmotes, 0);
  assert.match(o.factionHint, /No faction/);
  const said = o.sent.filter((m) => m.t === 'chat').map((m) => `${m.ch}:${m.text}${m.to ? '>' + m.to : ''}`);
  assert.deepEqual(said, [`near:${QUICK.near[0]}`, 'near:typed line', 'crew:to the crew', `crew:${QUICK.crew[0]}`, `phone:${QUICK.phone[0]}>lou1`, 'phone:see you there>lou1']);
  assert.deepEqual(o.sent.filter((m) => m.t === 'emote').map((m) => m.e), [Object.keys(EMOTES)[0], 'wave', Object.keys(EMOTES)[0]]);
  assert.equal(o.whoTitle, 'Marisol');
  assert.deepEqual(o.whoButtons, ['mute', 'block', 'report']);
  assert.deepEqual(o.reasons, REPORT_WHY);
  assert.ok(o.whoGone);
  const mods = o.sent.filter((m) => m.t === 'mod').map((m) => `${m.a}:${m.id}${m.why ? ':' + m.why : ''}`);
  assert.deepEqual(mods.slice(0, 2), ['mute:mar1', 'report:lou1:harassment']);
  assert.equal(o.bubbleWho, 'Lou', 'a bubble tapped while the sheet is up: who said it');
  assert.ok(o.closed, 'Esc closes it and gives the keys back');
  assert.ok(o.mutedDropped, 'a muted player\'s lines never show');
  assert.equal(o.unread, 1); assert.equal(o.dotOn, true);
  assert.deepEqual(o.appTabs, ['Messages (1)', 'Near', 'Crew', 'Faction']);
  assert.deepEqual(o.appRows, ['lou1', 'zed1'], 'the threads, then the people met');
  assert.equal(o.threadTitle, 'Big Lou');
  assert.deepEqual(o.threadMsgs, ['you around?']);
  assert.equal(o.unreadAfter, 0); assert.equal(o.dotAfter, false);
  assert.deepEqual(o.threadAfter, ['<you around?', '>see you there']);
  assert.equal(o.appReasons, REPORT_WHY.length);
  assert.ok(mods.includes('report:lou1:spam'));
  assert.ok(o.backThread && o.atHome && !o.backHome, 'back: out of the thread, then the phone\'s own');
  assert.equal(o.nearChips, QUICK.near.length); assert.equal(o.nearEmotes, Object.keys(EMOTES).length);
  assert.deepEqual(o.keptLater, ['lou1'], 'the thread kept in this browser');
  assert.equal(o.setRows, 4);
  assert.deepEqual(o.muteList, ['unmute:mar1']);
  assert.ok(o.sent.some((m) => m.t === 'chatset' && m.off && m.off.faction === true), 'a channel switched off');
  assert.ok(mods.includes('unmute:mar1'));
});

test('chat on a phone (Pixel 7 on its side): no keyboard until the line is tapped, the touch controls away, the sheet on top of the keyboard', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const o = await run('touch', '915,412');
  assert.equal(o.feed.length, 2, 'the feed keeps two (the stylesheet shows the newest on a phone)');
  assert.equal(o.touchFocused, false, 'no keyboard popping up on its own');
  assert.equal(o.touchHidden, 'hidden', 'the touch controls hide while it\'s up');
  assert.ok(o.kbBottom >= 190, `over the keyboard (${o.kbBottom} px up)`);
  assert.ok(o.kbFold && o.kbFits, 'the log folded away; the sheet fits what\'s left');
});
