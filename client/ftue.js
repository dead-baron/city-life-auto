// The first-time experience on the page (the server decides it all: server/systems/ftue.js) - loaded the first time the
// server speaks of it (client/main.js), never with the page:
//   where to      the arrival stations' card: each station's name, region and one line, the default first; a pick goes
//                 back ({ t: 'intro', a: 'pick', stn }), Esc, B or Skip takes the default ({ a: 'skip' })
//   the arrival   a short staged scene on the station's own arrival line (shared/world3-arrivals.js): the train - this
//                 page's alone, drawn into the frame (main.js S.stageCars), never the server's - comes out of the first
//                 tunnel, slows into the platform and stops; a chime, the doors open and you step off (your own
//                 character hidden till then: S.hideMe); the station's card; then it pulls out into the far tunnel behind
//                 the question. Esc, B, a tap or Skip ends it ({ t: 'intro', a: 'skip' }); played to the end,
//                 { a: 'arrived' }. No line (the Guide's replay, a map without one): the card over a slow pan
//   the question  the server's menu on the conversation screen (client/hud.js openMenu) - nothing of its own here
//   the steps     one line in the prompt's style with the control's glyph for the device in hand (client/glyphs.js), up
//                 FTUE_LINE_S then fading (the owner's minimal HUD); the way itself is the job card's and the job's arrow
//   the end       the big moment (hud.js moment)
//   a tip         a first-time moment: one fading line and "More in your Guide" (the phone's Guide, at its section)
// ctx: { S, send, openOverlay, closeOverlay, topOverlay, sfx, hud(), openGuide(sec), setCam(fn|null) }
import { glyph } from './glyphs.js';
import { KIND_ICON, actKind, svg } from './touchicons.js';
import { input } from './input.js';
import { K } from '../shared/constants.js';
import { TRAIN_CARS, CONSIST, CAR_GAP } from '../shared/mapcore.js';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// a step's control as the device in hand shows it; on touch the action button's icon is what the line offers (the
// contextual action icons: client/touchicons.js actKind) - a briefcase for a job, the rod to cast, a speech bubble to talk
const ctlGlyph = (ctl, text) => (ctl === 'action' && input.device === 'touch' ? `<span class="g-touch g-ico" role="img" aria-label="ACT">${svg(KIND_ICON[actKind(text)])}</span>` : glyph(ctl));
const LINE_S = 7;   // (shared/rules.js FTUE.lineS: kept here so the page doesn't load rules.js for one number)
let C = null, A = null, P = null, TR = null, lineSig = '', lineT = 0;
// the scene's clock: the page's, or a time pinned by a capture (S.arrClock: ?debug's tools hold a moment to photograph it)
const clock = () => (C && C.S.arrClock != null ? C.S.arrClock : performance.now());

export function init(ctx) {
  C = ctx;
  $('arrival').addEventListener('pointerdown', (e) => { if (A && !P && !e.target.closest('#arr-skip')) { e.preventDefault(); end(true); } });
  $('arr-skip').onclick = () => (P ? choose(null) : end(true));
  $('arr-pick').addEventListener('click', (e) => { const b = e.target.closest('[data-stn]'); if (b && P) choose(Number(b.dataset.stn)); });
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

// ---- the server's messages: { t: 'ftue', a: 'pick' | 'arrive' | 'end' | 'tip' | 'mark' } ------------------------------------------------
export function onMsg(m) {
  if (m.a === 'pick') pick(m);
  else if (m.a === 'arrive') arrive(m);
  else if (m.a === 'end') { const h = C.hud(); if (h) h.moment(m.title, m.sub, 'good'); C.sfx && C.sfx('cash', 0.8); }
  else if (m.a === 'tip') tip(m);
  else if (m.a === 'mark') { const w = { x: m.x, y: m.y, label: m.label }, h = C.hud(); C.S.waypoint = w; if (h) h.waypoint = w; }   // (just let me roam: the used lot as your waypoint)
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

// ---- where to: the arrival stations' card ---------------------------------------------------------------------------
// m: { title, sub, opts: [{ id, name, region, vibe, def }], s }
function pick(m) {
  if (A) end(false, true);
  P = { m };
  const el = $('arrival');
  el.classList.remove('open', 'leaving', 'lit', 'replay');
  el.classList.add('picking');
  $('arr-pick').innerHTML = `<small>${esc(m.title || 'Where to?')}</small><p>${esc(m.sub || '')}</p>` + m.opts.map((o) => `<button class="ap-opt${o.def ? ' def' : ''}" data-stn="${o.id}"><b>${esc(o.name)}</b><i>${esc(o.region)}${o.def ? ' &middot; suggested' : ''}</i>${o.vibe ? `<span>${esc(o.vibe)}</span>` : ''}</button>`).join('');
  $('arr-skip-g').innerHTML = input.device === 'touch' ? '' : glyph('back');
  if (C.topOverlay() !== 'arrival') C.openOverlay('arrival');
  else C.refocus && C.refocus();
  warm();
}
// while the card is up: the train's pictures asked for (each car, the four ways a line can run), far off the screen -
// so the train is drawn as it comes out of the tunnel, not a moment later (a phone's sprite bakes)
function warm() {
  if (C.S.stageCars) return;
  const S = C.S, W = [];
  for (let i = 0; i < 2; i++) for (let k = 0; k < 4; k++) W.push({ id: -9100 - i * 4 - k, kind: K.TRAIN, rx: 0, ry: 0, ra: k * Math.PI / 2, rz: 0, flags: 8, extra: 0, buf: [], d: { c: i, tr: -9, n: 1, l: -1 } });
  S.stageCars = (cars) => {
    if (!P) { if (S.stageCars && !TR) S.stageCars = null; return; }
    const x = (S.cam ? S.cam.x : 0) + 9000, y = S.cam ? S.cam.y : 0;
    for (const c of W) { c.rx = x; c.ry = y; cars.push(c); }
  };
}
// a station picked (null: the default)
function choose(stn) {
  if (!P) return;
  P = null;
  $('arrival').classList.remove('picking');
  C.send(stn === null ? { t: 'intro', a: 'skip' } : { t: 'intro', a: 'pick', stn });
}

// ---- the arrival --------------------------------------------------------------------------------------------------------
// m: { name, place, from: [x, y], to: [x, y], s (seconds), replay, line?: { x, y, a, len, in, out, stop, door }, stop,
// door, leave, gone (seconds: the train stopped, the doors open, it pulls out, and how long it takes to be gone) }
// The timeline (k: the share of s): with a line, the train in and stopped by `stop`, the chime, the doors open at `door`
// (you on the platform), the card, the bars away at 0.92, done at 1 - the train pulls out at `leave`, on its own after.
// Without one: the camera eases in from `from`, the card at 0.74, the same end.
function arrive(m) {
  if (A) end(false, true);
  P = null;
  const dur = Math.max(4, m.s || 12) * 1000;
  A = { m, t0: clock(), dur, chimed: false, opened: false, line: m.line || null };
  A.iv = setInterval(() => { if (A) tick(Math.min(1, (clock() - A.t0) / A.dur)); }, 200);   // (its own clock too: the scene ends on time even when the frames stall - a phone loading the area)
  $('arr-name').textContent = m.name || '';
  $('arr-place').textContent = m.place || '';
  $('arr-led').textContent = `NEXT STOP · ${String(m.name || '').replace(/ Station$/, '').toUpperCase()}`;
  $('arr-skip-g').innerHTML = input.device === 'touch' ? '' : glyph('back');
  const el = $('arrival');
  el.classList.remove('open', 'leaving', 'lit', 'picking');
  el.classList.toggle('replay', !!m.replay);
  if (C.topOverlay() !== 'arrival') C.openOverlay('arrival');
  document.body.classList.add('arriving');   // (the touch buttons out of the picture: style.css)
  void el.offsetWidth;
  el.classList.add('lit');
  if (A.line) train(m, A.t0);
  const [fx, fy] = m.from, [tx, ty] = m.to, L = A.line;
  C.setCam(() => {
    if (!A) return null;
    const now = clock(), t0 = A.t0, dur = A.dur, k = Math.min(1, (now - t0) / dur);
    tick(k);
    if (!A) return null;   // (that was its last frame: tick ended the scene - the camera is the player's again)
    if (!L || !TR) { const r = Math.min(1, k / 0.72), e = 1 - (1 - r) * (1 - r) * (1 - r); return [fx + (tx - fx) * e, fy + (ty - fy) * e]; }
    // on the line: by the first portal, then along with the front car, settling on the doors you step out of; as it
    // pulls out, a look after it toward the far portal (an upright phone's narrow view), back to you as the scene ends
    const t = (now - t0) / 1000, f = trainFront(t), u = Math.max(L.in + 170, Math.min(L.door, f - 150)), ca = Math.cos(L.a), sa = Math.sin(L.a);
    const x = L.x + ca * u - sa * 30, y = L.y + sa * u + ca * 30, s = Math.min(1, Math.max(0, (t - m.stop) / 1.2));
    let cx = x + (tx - x) * s * s * (3 - 2 * s), cy = y + (ty - y) * s * s * (3 - 2 * s);
    const t1 = dur / 1000, w = t < m.leave ? 0 : Math.min(1, (t - m.leave - 0.2) / 1) * Math.min(1, Math.max(0, (t1 - 0.2 - t) / 1.2));
    if (w > 0) { const d = Math.max(0, Math.min(L.out - 140, f - 450) - L.door) * w * w * (3 - 2 * w); cx += ca * d; cy += sa * d; }
    return [cx, cy];
  });
}
function tick(k) {
  const el = $('arrival');
  if (!A || !el) return;
  const m = A.m, t = k * A.dur / 1000, line = !!A.line;
  const chimeAt = line ? (m.stop || 6) + 0.3 : 0.7 * A.dur / 1000, openAt = line ? (m.door || 7.2) : 0.74 * A.dur / 1000;
  if (!A.chimed && t >= chimeAt) { A.chimed = true; C.sfx && C.sfx('good', 0.7); $('arr-led').textContent = `${String(m.name || '').replace(/ Station$/, '').toUpperCase()} · DOORS OPENING`; }
  if (!A.opened && t >= openAt) { A.opened = true; el.classList.add('open'); C.S.hideMe = false; }
  if (k >= 0.92 && !el.classList.contains('leaving')) el.classList.add('leaving');
  if (k >= 1) end(false);
}
// skipped (Esc, B, a tap, Skip), or played to the end: the overlay away, the server told; the train, if it's in, pulls
// out (still coming in: gone)
function end(skipped, quiet = false) {
  if (!A) return;
  clearInterval(A.iv);
  const t = (clock() - A.t0) / 1000, m = A.m;
  A = null;
  C.setCam(null);
  C.S.hideMe = false;
  document.body.classList.remove('arriving');
  if (TR) { if (t < (m.stop || 6)) stopTrain(); else if (t < TR.leave) TR.leave = t; }
  if (C.topOverlay() === 'arrival') C.closeOverlay('arrival');
  else $('arrival').classList.add('hidden');
  if (!quiet) C.send({ t: 'intro', a: skipped ? 'skip' : 'arrived' });
}
// main.js closeOverlay('arrival') - Esc or B backed out of it: a skip (the card: the default)
export function closed() { if (P) choose(null); else if (A) end(true); }
export const playing = () => !!A || !!P;

// ---- the train ---------------------------------------------------------------------------------------------------------
// This page's own: three cars (shared/mapcore.js CONSIST) drawn as the server's trains are, along the arrival line (a
// straight run: { x, y } its start, a its heading, in / out the portals, stop the middle where it stops). Inside the
// hill a car isn't drawn (the hill over the portal hides the part of one coming out). Out past the far portal, gone.
const OFF = [];   // (each car's middle behind the front, px)
{ let o = 0; for (const k of CONSIST) { const L = TRAIN_CARS.find((c) => c.kind === k).L; OFF.push(o + L / 2); o += L + CAR_GAP; } }
const LEN = OFF[OFF.length - 1] + TRAIN_CARS.find((c) => c.kind === CONSIST[CONSIST.length - 1]).L / 2;
function train(m, t0) {
  const L = m.line;
  TR = { L, t0, stop: m.stop || 6, leave: m.leave || 8.4, gone: m.gone || 4.6, f0: L.in - 110, f1: L.stop + LEN / 2, f2: L.len + LEN + 40, door: m.door || 7.2, cars: CONSIST.map((k, i) => ({ id: -9000 - i, kind: K.TRAIN, rx: L.x, ry: L.y, ra: L.a, rz: 0, flags: 8, extra: 0, buf: [], d: { c: TRAIN_CARS.findIndex((c) => c.kind === k), tr: -9, n: i + 1, l: -1 } })) };
  C.S.hideMe = true;
  C.S.camPull = innerHeight > innerWidth ? 1.55 : 1.15;   // (pulled back a little: the whole train in the picture - an upright phone most)
  C.S.stageCars = stage;
}
// where the front car's nose is, t seconds in: easing in to the stop, standing, then away
function trainFront(t) {
  if (!TR) return 0;
  if (t <= TR.stop) { const e = Math.max(0, t / TR.stop); return TR.f0 + (TR.f1 - TR.f0) * (1 - (1 - e) * (1 - e) * (1 - e)); }
  if (t <= TR.leave) return TR.f1;
  const e = (t - TR.leave) / TR.gone;
  return TR.f1 + (TR.f2 - TR.f1) * e * e;
}
function stage(cars) {
  if (!TR) return;
  const t = (clock() - TR.t0) / 1000, f = trainFront(t), L = TR.L, ca = Math.cos(L.a), sa = Math.sin(L.a);
  if (f >= TR.f2) { stopTrain(); return; }
  const doors = t >= TR.door - 0.6 && t < TR.leave ? 2 : 0;
  TR.cars.forEach((c, i) => {
    const s = f - OFF[i];
    if (s < L.in || s > L.out) return;   // (inside a hill)
    c.rx = L.x + ca * s; c.ry = L.y + sa * s; c.flags = 8 | doors;
    cars.push(c);
  });
}
function stopTrain() { TR = null; C.S.stageCars = null; C.S.camPull = null; }
