// Emotes on the page (the owner, 2026-11-13: "separate the emotes from the chat ... instead of emotes having a text that
// pops up ... an emoji that pops up"). Loaded with chat (client/chat.js creates it), never in the page's first load.
// - the picker: a small grid of the emotes (shared/chatdefs.js EMOTES) - an emoji and its name each; one tap (or click)
//   sends it and closes; the X, Back (Esc, a pad's B: client/main.js) and a tap anywhere outside close it. On touch it
//   sits over the emote button and the chat button (index.html #b-emote); on a desktop B opens it (shared/controls.js),
//   low in the middle of the screen. A pad picks from the phone's Emote screen (client/phone.js) instead.
// - the pop: the emote's emoji over the head of whoever emoted (nothing for Dance: the log's line says it), scaling in,
//   floating up and fading in about two seconds - a few pooled elements, kept over the figure each frame.
// - the phone's Emote screen (renderApp: client/phone.js 'emotes', the home screen's Emote button): the same, as the
//   phone's buttons - a pad's D-pad moves between them like any phone screen.
// createEmotes(ctx) -> { pop(eid, e, own), open(), close(), toggle(), isOpen, renderApp(el, api) }
// ctx: { send(obj), canvas, layer (the speech bubbles' layer: chat.js), host, screenOf(eid) -> { x, y } | null,
//   playing(), device() }
import { EMOTES } from '../shared/chatdefs.js';

const POP_MS = 2000, FADE_MS = 400, POOL = 8;
const DANCE_TILE = '\u{1F483}';   // (the picker's picture for Dance: over the head there's none)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// (the kit's tokens only: test/uitokens.test.js)
const CSS = `
.emo-pop { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; transition: opacity var(--t-drain) var(--ease); }
.emo-pop.out { opacity: 0; }
.emo-pop > i { position: absolute; left: 0; bottom: 0; font: 400 var(--fs-5) var(--ui); font-style: normal; line-height: 1; white-space: nowrap; filter: drop-shadow(0 2px 0 var(--ink)); animation: emo-pop 1.6s var(--ease) forwards; }
@keyframes emo-pop { 0% { opacity: 0; transform: translate(-50%, 8px) scale(.3); } 12% { opacity: 1; transform: translate(-50%, -4px) scale(1.3); } 24% { transform: translate(-50%, -6px) scale(1); } 100% { opacity: 1; transform: translate(-50%, -26px) scale(1); } }
.emo-veil { position: absolute; z-index: 13; inset: 0; background: transparent; pointer-events: auto; touch-action: none; }
.emo-pick { position: absolute; z-index: 14; left: 50%; bottom: 96px; transform: translateX(-50%); width: min(340px, calc(100% - 2 * var(--s3))); background: var(--pad-navy); border: 2px solid var(--pad-ink); border-radius: 0; box-shadow: var(--pn-rim), var(--pn-drop); color: var(--cream); font: 700 var(--fs-2) var(--pixel); animation: enter var(--t2) var(--ease); }
body.touch .emo-pick { left: max(var(--s3), env(safe-area-inset-left)); bottom: calc(max(8px, env(safe-area-inset-bottom)) + 58px); transform: none; }
body.touch.portrait .emo-pick { bottom: calc(max(8px, env(safe-area-inset-bottom)) + 110px); }   /* (upright the emote button is over the chat button: over both) */
.emo-head { display: flex; align-items: center; gap: var(--s1); margin: 2px 2px 0; padding: var(--s1) var(--s1) var(--s1) var(--s2); background: var(--pad-ink); border-bottom: 2px solid var(--pad-gold); }
.emo-head b { flex: 1; color: var(--pad-gold); font: 700 var(--fs-2) var(--pixel); letter-spacing: .5px; }
.emo-pick .x { width: 36px; height: 36px; }
.emo-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s1); padding: var(--s2); }
.emo-t { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 56px; padding: var(--s1) 2px; border: 2px solid var(--pad-line); border-radius: 0; background: var(--pad-navy); color: var(--cream); cursor: pointer; touch-action: manipulation; }
.emo-t:hover, .emo-t.pfocus { border-color: var(--pad-gold); }
.emo-t:active { transform: scale(var(--press)); }
.emo-t i { font: 400 var(--fs-4) var(--ui); font-style: normal; line-height: 1; }
.emo-t span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 var(--fs-1) var(--pixel); color: var(--pad-cream); }
`;

export function createEmotes(ctx) {
  const doc = document, host = ctx.host || doc.body;
  const st = doc.createElement('style');
  st.textContent = CSS;
  doc.head.appendChild(st);

  // ---- the pop over the head ----------------------------------------------------------------------------------------
  const pool = [], live = [];
  let raf = 0;
  function pop(eid, e, own) {
    const E = Object.hasOwn(EMOTES, e) ? EMOTES[e] : null;
    if (!eid || !E || !E.emoji || !ctx.layer) return;
    for (let i = live.length - 1; i >= 0; i--) if (live[i].eid === eid) free(i);   // (one at a time over a head: the new one)
    const q = pool.pop() || (live.length >= POOL ? (free(0), pool.pop()) : mk());
    q.eid = eid; q.own = !!own; q.t0 = performance.now();
    q.i.textContent = E.emoji;
    q.el.classList.remove('out');
    q.i.style.animation = 'none'; void q.i.offsetWidth; q.i.style.animation = '';   // (the pop again from its start)
    ctx.layer.appendChild(q.el);
    live.push(q);
    if (raf) cancelAnimationFrame(raf);
    place();
  }
  function mk() { const el = doc.createElement('div'), i = doc.createElement('i'); el.className = 'emo-pop'; el.setAttribute('aria-hidden', 'true'); el.appendChild(i); return { el, i, eid: 0, own: false, t0: 0 }; }
  function free(k) { const q = live.splice(k, 1)[0]; q.el.remove(); pool.push(q); }
  function place() {
    raf = 0;
    const now = performance.now(), cr = ctx.canvas ? ctx.canvas.getBoundingClientRect() : { left: 0, top: 0 }, lr = ctx.layer.getBoundingClientRect();
    for (let k = live.length - 1; k >= 0; k--) {
      const q = live[k], t = now - q.t0;
      if (t >= POP_MS) { free(k); continue; }
      if (t >= POP_MS - FADE_MS) q.el.classList.add('out');
      const p = ctx.playing() ? ctx.screenOf(q.eid) : null;
      if (!p) { q.el.style.visibility = 'hidden'; continue; }
      q.el.style.visibility = '';
      // over the head and its name tag (yours a little higher: your character stays in view under it)
      q.el.style.left = `${Math.round(cr.left - lr.left + p.x)}px`; q.el.style.top = `${Math.round(cr.top - lr.top + p.y - (q.own ? 58 : 50))}px`;
    }
    if (live.length) raf = requestAnimationFrame(place);
  }

  // ---- the picker ---------------------------------------------------------------------------------------------------
  const veil = doc.createElement('div');
  veil.className = 'emo-veil';
  veil.hidden = true;
  const pick = doc.createElement('div');
  pick.className = 'emo-pick';
  pick.hidden = true;
  pick.setAttribute('role', 'dialog');
  pick.setAttribute('aria-label', 'Emotes');
  pick.innerHTML = '<div class="emo-head"><b>EMOTES</b><button class="x" type="button" aria-label="Close emotes">&times;</button></div><div class="emo-grid">'
    + Object.entries(EMOTES).map(([k, v]) => `<button class="emo-t" type="button" data-e="${k}" aria-label="${esc(v.n)}"><i aria-hidden="true">${v.emoji || DANCE_TILE}</i><span>${esc(v.n)}</span></button>`).join('') + '</div>';
  host.appendChild(veil);
  host.appendChild(pick);
  let isOpen = false, watch = 0;
  // (a tap outside: closed - and kept from the game under it)
  veil.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); close(); });
  pick.addEventListener('pointerdown', (e) => e.stopPropagation());
  pick.querySelector('.x').onclick = () => close();
  pick.querySelector('.emo-grid').onclick = (e) => { const b = e.target.closest('[data-e]'); if (!b) return; ctx.send({ t: 'emote', e: b.dataset.e }); close(); };
  function open() {
    if (!ctx.playing() || isOpen) return;
    isOpen = true; veil.hidden = false; pick.hidden = false;
    doc.body.classList.add('emo-open');
    watch = setInterval(() => { if (!ctx.playing()) close(); }, 500);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; veil.hidden = true; pick.hidden = true;
    doc.body.classList.remove('emo-open');
    clearInterval(watch);
  }
  // the phone's screen (api: { refocus(), close() - the phone away })
  function renderApp(el, api = {}) {
    el.innerHTML = '<p class="ph-hint">Tap one: everyone near sees it over your head.</p><div class="ph-quick">'
      + Object.entries(EMOTES).map(([k, v]) => `<button class="btn" type="button" data-emo="${k}"><span aria-hidden="true">${v.emoji || DANCE_TILE}</span>${esc(v.n)}</button>`).join('') + '</div>';
    for (const b of el.querySelectorAll('[data-emo]')) b.onclick = () => { ctx.send({ t: 'emote', e: b.dataset.emo }); if (api.close) api.close(); };
    if (api.refocus) api.refocus();
  }
  return { pop, open, close, toggle: () => (isOpen ? close() : open()), get isOpen() { return isOpen; }, renderApp };
}
