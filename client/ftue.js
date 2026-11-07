// The first-time experience on the page (the server decides it all: server/systems/ftue.js) - loaded the first time the
// server speaks of it (client/main.js), never with the page:
//   the arrival   a short staged scene: inside the carriage, its doors' windows on the city going by as the camera rides
//                 in along the line, the next-stop sign; a chime, the doors slide open onto the platform and you. Esc,
//                 B, a tap or Skip ends it ({ t: 'intro', a: 'skip' }); played to the end, { a: 'arrived' }
//   the question  the server's menu on the conversation screen (client/hud.js openMenu) - nothing of its own here
//   the steps     one line in the prompt's style with the control's glyph for the device in hand (client/glyphs.js), up
//                 FTUE_LINE_S then fading (the owner's minimal HUD); the way itself is the job card's and the job's arrow
//   the end       the big moment (hud.js moment)
//   a tip         a first-time moment: one fading line and "More in your Guide" (the phone's Guide, at its section)
// ctx: { S, send, openOverlay, closeOverlay, topOverlay, sfx, hud(), openGuide(sec), setCam(fn|null) }
import { glyph } from './glyphs.js';
import { KIND_ICON, actKind, svg } from './touchicons.js';
import { input } from './input.js';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// a step's control as the device in hand shows it; on touch the action button's icon is what the line offers (the
// contextual action icons: client/touchicons.js actKind) - a briefcase for a job, the rod to cast, a speech bubble to talk
const ctlGlyph = (ctl, text) => (ctl === 'action' && input.device === 'touch' ? `<span class="g-touch g-ico" role="img" aria-label="ACT">${svg(KIND_ICON[actKind(text)])}</span>` : glyph(ctl));
const LINE_S = 7;   // (shared/rules.js FTUE.lineS: kept here so the page doesn't load rules.js for one number)
let C = null, A = null, lineSig = '', lineT = 0;

export function init(ctx) {
  C = ctx;
  $('arrival').addEventListener('pointerdown', (e) => { if (A && !e.target.closest('#arr-skip')) { e.preventDefault(); end(true); } });
  $('arr-skip').onclick = () => end(true);
  // a tip: a tap anywhere on it opens the phone's Guide at its section; its x puts it away (on touch it sits over the
  // move stick's zone while it's up - style.css #ftue-line.tip - and goes back under it as it fades)
  $('ftue-line').addEventListener('click', (e) => {
    const el = $('ftue-line');
    if (el.classList.contains('faded')) return;
    if (e.target.closest('.fl-x')) { hideLine(); return; }
    const sec = el.dataset.guide;
    if (sec && el.classList.contains('tip')) { C.openGuide(sec); hideLine(); }
  });
}

// ---- the server's messages: { t: 'ftue', a: 'arrive' | 'end' | 'tip' } ------------------------------------------------
export function onMsg(m) {
  if (m.a === 'arrive') arrive(m);
  else if (m.a === 'end') { const h = C.hud(); if (h) h.moment(m.title, m.sub, 'good'); C.sfx && C.sfx('cash', 0.8); }
  else if (m.a === 'tip') tip(m);
}
// A first-time moment never shows over the down / death screen or the wake-up's "Loading the area..." veil (the owner's
// 11-06 screenshot: "Hurt? ... a bandage" over YOU'RE DOWN; the server holds them too: server/systems/ftue.js moment):
// one that comes then waits until you're up and the veil has gone; the hurt one is dropped if you went down meanwhile
// (and one on screen as you go down goes) - 'down' itself is about that screen and shows on it.
let held = null, heldT = 0;
const isDown = () => !!(C && C.S.me && C.S.me.dead);
const veiled = () => { const v = $('veil'); return !!(v && v.classList.contains('on')); };
function tip(m) {
  if (m.id === 'down' || (!isDown() && !veiled())) { held = null; showLine(m.ctl, m.text, m.sec, `tip:${m.id}`); return; }
  held = { m, down: isDown() };
  clearInterval(heldT); heldT = setInterval(heldTick, 500);
}
function heldTick() {
  if (!held) { clearInterval(heldT); return; }
  if (isDown()) { held.down = true; return; }
  if (veiled()) return;
  const { m, down } = held;
  held = null; clearInterval(heldT);
  if (!(down && m.id === 'hurt')) showLine(m.ctl, m.text, m.sec, `tip:${m.id}`);
}
// the self record: the step's line when the step changes; a tip on screen goes as you go down
export function onMe(me) {
  if (((me.dead && lineSig !== 'tip:down') || me.tips === 0) && lineSig.startsWith('tip:')) { hideLine(); lineSig = ''; }   // (down, or tips turned off in Settings)
  if (held && me.dead) held.down = true;
  const f = me.ftue;
  if (!f || f.st !== 'goal') { if (lineSig.startsWith('step:')) hideLine(); lineSig = f || lineSig.startsWith('tip:') ? lineSig : ''; return; }   // (a tip's sig kept: it goes as you go down)
  const sig = `step:${f.step}:${f.line}`;
  if (sig === lineSig) return;
  showLine(f.ctl, f.line, null, sig);
}

// ---- the line: [glyph] words (· More in your Guide · x), then it fades ----------------------------------------------------
function showLine(ctl, text, sec, sig) {
  const el = $('ftue-line');
  if (!el) return;
  lineSig = sig;
  el.innerHTML = `${ctl ? ctlGlyph(ctl, text) : ''}<span>${esc(text)}</span>${sec ? '<button class="fl-more">More in your Guide</button><button class="fl-x" aria-label="Dismiss">&times;</button>' : ''}`;
  if (sec) el.dataset.guide = sec; else delete el.dataset.guide;
  el.classList.remove('off', 'faded');
  el.classList.toggle('tip', !!sec);
  void el.offsetWidth;
  el.classList.add('in');
  clearTimeout(lineT);
  lineT = setTimeout(() => { if (lineSig === sig) el.classList.add('faded'); }, LINE_S * 1000);
}
function hideLine() { const el = $('ftue-line'); if (el) { el.classList.add('faded'); } clearTimeout(lineT); }
// a new device in hand (a pad picked up): the line's glyph again
export function redraw() { const me = C.S.me; if (me && me.ftue && me.ftue.st === 'goal') { lineSig = ''; onMe(me); } }

// ---- the arrival --------------------------------------------------------------------------------------------------------
// m: { name, place, from: [x, y], to: [x, y], s (seconds), replay }
// The timeline (k: the share of s): the doors shut to 0.72 while the camera rides in (fast, then easing to a stop at the
// platform); the chime at 0.7; the doors slide open 0.74-0.84; the bars and the card go at 0.92; done at 1
function arrive(m) {
  if (A) end(false, true);
  const S = C.S, dur = Math.max(4, m.s || 14) * 1000;
  A = { m, t0: performance.now(), dur, chimed: false, opened: false };
  A.iv = setInterval(() => { if (A) tick(Math.min(1, (performance.now() - A.t0) / A.dur)); }, 200);   // (its own clock too: the scene ends on time even when the frames stall - a phone loading the area)
  $('arr-name').textContent = m.name || '';
  $('arr-place').textContent = m.place || '';
  $('arr-led').textContent = `NEXT STOP · ${String(m.name || '').toUpperCase()}`;
  $('arr-skip-g').innerHTML = input.device === 'touch' ? '' : glyph('back');
  const el = $('arrival');
  el.classList.remove('open', 'leaving', 'lit');
  el.classList.toggle('replay', !!m.replay);
  if (C.topOverlay() !== 'arrival') C.openOverlay('arrival');
  void el.offsetWidth;
  el.classList.add('lit');
  const [fx, fy] = m.from, [tx, ty] = m.to;
  C.setCam((now) => {
    if (!A) return null;
    const k = Math.min(1, (now - A.t0) / A.dur), r = Math.min(1, k / 0.72), e = 1 - (1 - r) * (1 - r) * (1 - r);   // (ease out: in fast, slowing into the platform)
    tick(k);
    return [fx + (tx - fx) * e, fy + (ty - fy) * e];
  });
  void S;
}
function tick(k) {
  const el = $('arrival');
  if (!A || !el) return;
  if (!A.chimed && k >= 0.7) { A.chimed = true; C.sfx && C.sfx('good', 0.7); $('arr-led').textContent = `${String(A.m.name || '').toUpperCase()} · DOORS OPENING`; }
  if (!A.opened && k >= 0.74) { A.opened = true; el.classList.add('open'); }
  if (k >= 0.92 && !el.classList.contains('leaving')) el.classList.add('leaving');
  if (k >= 1) end(false);
}
// skipped (Esc, B, a tap, Skip), or played to the end: the overlay away, the server told
function end(skipped, quiet = false) {
  if (!A) return;
  clearInterval(A.iv);
  A = null;
  C.setCam(null);
  if (C.topOverlay() === 'arrival') C.closeOverlay('arrival');
  else $('arrival').classList.add('hidden');
  if (!quiet) C.send({ t: 'intro', a: skipped ? 'skip' : 'arrived' });
}
// main.js closeOverlay('arrival') - Esc or B backed out of it: a skip
export function closed() { if (A) end(true); }
export const playing = () => !!A;
