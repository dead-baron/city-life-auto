// Emotes on the page (the owner, 2026-11-13; round 2 the same day: "emotes are body animations first" - our own pixel
// balloons, not Unicode emoji). Loaded with chat (client/chat.js creates it), never in the page's first load.
// - the balloons: 16x16 SNES-RPG emotion balloons in the game's palette (BALLOONS: a heart, !, ?, the anger vein, a
//   sweat drop, HAHA, Zzz, a light bulb; 11-14 a waving hand, a thumbs up and a beckoning hand for the gestures - drawn here pixel by pixel after the Kenney Emotes Pack's pixel style, CC0,
//   www.kenney.nl; credited in client/emotes-LICENSE.txt), shown 2x, crisp. Over the head of whoever emoted, for an emote
//   that has one (the server says which: the message's b) - it pops up and settles in place (a scale bounce, two px up
//   at most), holds, blinks out, CHAT.balloonS in all. Meanwhile the bounty skull there gives way (balloonOn: main.js).
// - the typing dots: a balloon of three dots bouncing in turn while someone near is typing (the server's 'typing').
// - the picker: tabs Emotes / Dances / Poses (shared/chatdefs.js EMOTES' tab, DANCES) - a tap (or click) sends one and
//   closes; the X, Back (Esc, a pad's B: client/main.js) and a tap outside close it. On touch it sits over the emote
//   button and the chat button (index.html #b-emote); on a desktop the nav row's emote button or B opens it, under it.
// - the pad's quick radial (hold LB: client/main.js): shared/chatdefs.js RADIAL - type a line (chat's on-screen keyboard),
//   quick lines, emotes, More (the phone's Emote screen) - picked with a stick, sent when LB is let go.
// - the phone's Emote screen (renderApp): the same three tabs as the phone's buttons - the D-pad moves between them.
// createEmotes(ctx) -> { pop(eid, b, own), typing(eid, on), balloonOn(eid), open(), close(), toggle(), isOpen,
//   renderApp(el, api), radial: { open(), point(lx, ly, rx, ry), release() -> slot | null, close(), isOpen } }
// ctx: { send(obj), say(text) (a near quick line), canvas, layer (the speech bubbles' layer: chat.js), host,
//   headOf(eid) -> { x, y } | null (the top of the head, CSS px over the canvas), playing(), device(), typeLine() (the
//   radial's Type: chat.js), moreEmotes() (the radial's More: the phone's Emote screen) }
import { EMOTES, DANCES, RADIAL, QUICK, CHAT } from '../shared/chatdefs.js';
import { wheelPicker } from '../shared/input.js';

const POOL = 8, PX = 2;   // (PX: a balloon's pixel on screen)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- the balloons' pixels ---------------------------------------------------------------------------------------------
// The game's palette (client/style.css tokens: --pad-ink, --pad-cream, --pad-hp, --red-d, --pad-ar, --info-hi, --pad-x,
// --navy3, --pad-gold, --gold-hi, --gold-d, --grey, --grey-d; the balloon's lower edge a shade of the cream)
const C = { k: '#0b1020', w: '#f4ecd8', s: '#cdbf9e', r: '#e8434b', h: '#ff9585', d: '#8f2a22', b: '#4aa8ff', l: '#9ad2ff', x: '#2f6fd8', n: '#22325e', g: '#f6c945', y: '#f4d98a', o: '#a8862e', t: '#5d6478', u: '#2c3244', p: '#f2b98a', q: '#c47e52' };
// (p, q: a hand's skin and its shade - the gesture balloons: wave, thumbs up, come here)
// the balloon: an inked outline, the cream face, its lower edge in shade, the tail down to the head (the icon goes in
// rows 2-11, columns 2-13)
const SHELL = [
  '..kkkkkkkkkkkk..', '.kwwwwwwwwwwwwk.', 'kwwwwwwwwwwwwwwk', 'kwwwwwwwwwwwwwwk', 'kwwwwwwwwwwwwwwk', 'kwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwk', 'kwwwwwwwwwwwwwwk', 'kwwwwwwwwwwwwwwk', 'kwwwwwwwwwwwwwwk', 'kwwwwwwwwwwwwwwk', 'kswwwwwwwwwwwwsk',
  '.kssssssssssssk.', '..kkkksskkkkkk..', '.....ksk........', '......k.........'];
const ICONS = {
  heart: ['............', '..rrr..rrr..', '.rhhrrrrrrr.', '.rhrrrrrrrr.', '.rrrrrrrrrd.', '..rrrrrrrd..', '...rrrrrd...', '....rrrd....', '.....rd.....', '............'],
  exclaim: ['.....rr.....', '....rhrr....', '....rrrr....', '....rrrr....', '.....rd.....', '.....rd.....', '............', '.....rr.....', '.....rd.....', '............'],
  question: ['....bbbb....', '...bllbbb...', '...bb..bbx..', '.......bbx..', '......bbx...', '.....bbx....', '.....bx.....', '............', '.....bb.....', '.....bx.....'],
  anger: ['............', '...r....r...', '...rr..rr...', '.rrdr..rdrr.', '..dd....dd..', '............', '..dd....dd..', '.rrdr..rdrr.', '...rr..rr...', '...r....r...'],
  sweat: ['......b.....', '.....bb.....', '.....blb....', '....bllbb...', '....blbbb...', '...bbbbbbx..', '...bbbbbbx..', '....bbbbx...', '.....xxx....', '............'],
  haha: ['..k.k.kkk...', '..kkk.k.k...', '..k.k.kkk...', '..k.k.k.k...', '............', '....k.k.kkk.', '....kkk.k.k.', '....k.k.kkk.', '....k.k.k.k.', '............'],
  zzz: ['......nnnnn.', '.........n..', '........n...', '.......n....', '......nnnnn.', '.nnnn.......', '...n........', '..n.........', '.nnnn.......', '............'],
  wave: ['....k.k.k...', '...kpkpkpk..', '.b.kpkpkpk.b', 'b..kpppppkkk', 'b..kpppppkpk', 'b..kppppppk.', '.b.kqpppppkb', '...kqqpppk..', '....kkkkk...', '............'],
  thumbs: ['.....kk.....', '....kpk.....', '....kpk.....', '...kppkkkk..', '.kkkppppppk.', '.kpkpkkkkk..', '.kpkppppppk.', '.kpkpkkkkk..', '.kqkqqqqqk..', '..k.kkkkk...'],
  beckon: ['.....kkk....', '....kpppk...', '....kpkkpk..', 'b....k..kpk.', '.b.kkkkkkpk.', 'b.kppppppk..', '..kpkkkkk...', '..kppppppk..', '..kqqqqqk...', '...kkkkk....'],
  idea: ['....gggg....', '...gyygggo..', '..gyyggggo..', '..gyggggggo.', '..gggggggo..', '...ggggggo..', '....gggo....', '....tttt....', '....uuuu....', '.....tt.....'],
};
function paint(g, rows, ox, oy) {
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = C[r[x]]; if (c) { g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1); } } });
}
const urls = new Map();
// a balloon's picture as a data URL (made once): an icon's, or the typing dots' strip of three frames
export function balloonUrl(id) {
  if (urls.has(id)) return urls.get(id);
  if (typeof document === 'undefined') return '';
  const typ = id === 'dots', c = document.createElement('canvas');
  c.width = typ ? 48 : 16; c.height = 16;
  const g = c.getContext('2d');
  for (let f = 0; f < (typ ? 3 : 1); f++) {
    paint(g, SHELL, f * 16, 0);
    if (typ) for (let i = 0; i < 3; i++) { g.fillStyle = C.k; g.fillRect(f * 16 + 4 + i * 3, 6 + (i === f ? -1 : 0), 2, 2); }
    else if (ICONS[id]) paint(g, ICONS[id], 2, 2);
  }
  const u = c.toDataURL();
  urls.set(id, u);
  return u;
}
export const BALLOONS = Object.keys(ICONS);

// (the kit's tokens only: test/uitokens.test.js)
const CSS = `
.emo-pop { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
.emo-pop > i { position: absolute; left: 0; bottom: 0; width: var(--bal); height: var(--bal); background: center / 100% 100% no-repeat; image-rendering: pixelated; transform-origin: 50% 100%; animation: emo-bal var(--bal-t) steps(1, end) forwards; }
.emo-pop { --bal: 32px; }
.emo-pop.typ > i { background-size: 300% 100%; animation: emo-in 240ms steps(1, end) forwards, emo-dots 900ms steps(1, end) infinite; }
.emo-pop.hide { visibility: hidden; }
@keyframes emo-bal { 0% { transform: translateX(-50%) scale(.25); } 3% { transform: translateX(-50%) scale(.6); } 6% { transform: translate(-50%, -2px) scale(1.2); } 10% { transform: translate(-50%, -2px) scale(.9); } 13% { transform: translate(-50%, -1px) scale(1); opacity: 1; } 84% { opacity: 1; } 87% { opacity: 0; } 90% { opacity: 1; } 93% { opacity: 0; } 96% { opacity: 1; } 99% { opacity: 0; } 100% { transform: translate(-50%, -1px) scale(1); opacity: 0; } }
@keyframes emo-in { 0% { transform: translateX(-50%) scale(.3); } 30% { transform: translateX(-50%) scale(1.15); } 60% { transform: translateX(-50%) scale(.92); } 100% { transform: translateX(-50%) scale(1); } }
@keyframes emo-dots { 0% { background-position: 0 0; } 33.3% { background-position: 50% 0; } 66.6% { background-position: 100% 0; } }
.emo-veil { position: absolute; z-index: 13; inset: 0; background: transparent; pointer-events: auto; touch-action: none; }
.emo-pick { position: absolute; z-index: 14; left: 50%; bottom: 96px; transform: translateX(-50%); width: min(380px, calc(100% - 2 * var(--s3))); background: var(--pad-navy); border: 2px solid var(--pad-ink); border-radius: 0; box-shadow: var(--pn-rim), var(--pn-drop); color: var(--cream); font: 700 var(--fs-2) var(--pixel); animation: enter var(--t2) var(--ease); }
body:not(.touch) .emo-pick { left: auto; right: max(24px, env(safe-area-inset-right)); bottom: auto; top: 132px; transform: none; }   /* (a desktop: under the nav row's emote button - clear of you in the middle) */
body.touch .emo-pick { left: max(var(--s3), env(safe-area-inset-left)); bottom: calc(max(8px, env(safe-area-inset-bottom)) + 58px); transform: none; }
body.touch.portrait .emo-pick { bottom: calc(max(8px, env(safe-area-inset-bottom)) + 110px); }   /* (upright the emote button is over the chat button: over both) */
body.touch:not(.portrait) .emo-grid { max-height: calc(100vh - 170px); }
.emo-head { display: flex; align-items: center; gap: var(--s1); margin: 2px 2px 0; padding: var(--s1) var(--s1) var(--s1) var(--s2); background: var(--pad-ink); border-bottom: 2px solid var(--pad-gold); }
.emo-tabs { display: flex; gap: var(--s1); flex: 1; min-width: 0; }
.emo-tab { min-height: 36px; padding: 0 var(--s2); border: 2px solid transparent; border-radius: 0; background: transparent; color: var(--dim); font: 700 var(--fs-2) var(--pixel); letter-spacing: .5px; cursor: pointer; touch-action: manipulation; }
.emo-tab.on { background: var(--pad-gold); color: var(--pad-ink); border-color: var(--pad-ink); box-shadow: var(--pn-drop); }
.emo-tab:not(.on):hover, .emo-tab.pfocus { color: var(--cream); border-color: var(--gold-a); }
.emo-pick .x { width: 36px; height: 36px; }
.emo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s1); padding: var(--s2); max-height: min(300px, 60vh); overflow-y: auto; touch-action: pan-y; }
.emo-t { display: flex; align-items: center; justify-content: center; gap: var(--s1); min-height: 44px; padding: var(--s1); border: 2px solid var(--pad-line); border-radius: 0; background: var(--pad-navy); color: var(--pad-cream); font: 700 var(--fs-2) var(--pixel); text-align: center; cursor: pointer; touch-action: manipulation; }
.emo-t:hover, .emo-t.pfocus { border-color: var(--pad-gold); }
.emo-t:active { transform: scale(var(--press)); }
.emo-t img, .ph-quick img.emo-ic { width: 32px; height: 32px; flex: none; image-rendering: pixelated; }
.emo-t span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emo-rad { position: fixed; inset: 0; z-index: 30; pointer-events: none; background: radial-gradient(circle at 50% 50%, var(--scrim) 0, var(--ink-a) 220px, transparent 380px); }
.emo-rs { position: absolute; left: 50%; top: 50%; width: 96px; min-height: 40px; margin: -20px 0 0 -48px; display: flex; align-items: center; justify-content: center; gap: 2px; padding: 2px var(--s1); box-sizing: border-box; background: var(--pad-navy); border: 2px solid var(--pad-line); border-radius: 0; color: var(--pad-cream); font: 700 var(--fs-1) var(--pixel); text-align: center; line-height: 1.15; }
.emo-rs img { width: 32px; height: 32px; image-rendering: pixelated; flex: none; }
.emo-rs.on { border-color: var(--pad-gold); background: var(--pick), var(--pad-navy); color: var(--cream); }
.emo-rmid { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); max-width: 140px; font: 700 var(--fs-2) var(--pixel); color: var(--cream); text-align: center; text-shadow: var(--halo-s); }
`;

// what a radial slot or a picker tile says
const slotOf = (k) => {
  if (k === 'type') return { n: 'Type…' };
  if (k === 'more') return { n: 'More…' };
  if (k.startsWith('q:')) return { n: QUICK.near[+k.slice(2)] || '' };
  const E = EMOTES[k.slice(2)];
  return E ? { n: E.n, b: E.b } : { n: '' };
};

export function createEmotes(ctx) {
  const doc = document, host = ctx.host || doc.body;
  const st = doc.createElement('style');
  st.textContent = CSS;
  doc.head.appendChild(st);
  const LIFE = Math.round(CHAT.balloonS * 1000);

  // ---- the balloons over heads ----------------------------------------------------------------------------------------
  const pool = [], live = [];   // { el, i, eid, own, t0, typ }
  let raf = 0;
  function mk() { const el = doc.createElement('div'), i = doc.createElement('i'); el.setAttribute('aria-hidden', 'true'); el.appendChild(i); return { el, i, eid: 0, own: false, t0: 0, typ: false }; }
  function free(k) { const q = live.splice(k, 1)[0]; q.el.remove(); pool.push(q); }
  function show(eid, b, own, typ) {
    if (!pool.length && live.length >= POOL) free(0);   // (the oldest goes)
    const q = pool.pop() || mk();
    q.eid = eid; q.own = !!own; q.t0 = performance.now(); q.typ = typ;
    q.el.className = typ ? 'emo-pop typ' : 'emo-pop';
    q.i.style.backgroundImage = `url(${balloonUrl(typ ? 'dots' : b)})`;
    q.i.style.setProperty('--bal-t', `${LIFE}ms`);
    q.i.style.animation = 'none'; void q.i.offsetWidth; q.i.style.animation = '';   // (the pop again from its start)
    ctx.layer.appendChild(q.el);
    live.push(q);
    if (raf) cancelAnimationFrame(raf);
    place();
  }
  // an emote's balloon (b: its id - the server says which) over eid's head
  function pop(eid, b, own) {
    if (!eid || !b || !ICONS[b] || !ctx.layer) return;
    for (let i = live.length - 1; i >= 0; i--) if (live[i].eid === eid && !live[i].typ) free(i);   // (one at a time over a head: the new one)
    show(eid, b, own, false);
  }
  // the typing dots over eid's head, on or off (they go on their own after CHAT.typingS without a word)
  function typing(eid, on) {
    if (!eid || !ctx.layer) return;
    const k = live.findIndex((q) => q.eid === eid && q.typ);
    if (!on) { if (k >= 0) free(k); return; }
    if (k >= 0) { live[k].t0 = performance.now(); return; }
    show(eid, null, false, true);
  }
  const balloonOn = (eid) => live.some((q) => q.eid === eid && !q.typ);
  function place() {
    raf = 0;
    const now = performance.now(), cr = ctx.canvas ? ctx.canvas.getBoundingClientRect() : { left: 0, top: 0 }, lr = ctx.layer.getBoundingClientRect();
    for (let k = live.length - 1; k >= 0; k--) {
      const q = live[k], t = now - q.t0;
      if (t >= (q.typ ? CHAT.typingS * 1000 : LIFE)) { free(k); continue; }
      const p = ctx.playing() ? ctx.headOf(q.eid) : null;
      // (the dots give way to an emote's balloon over the same head)
      if (!p || (q.typ && balloonOn(q.eid))) { q.el.classList.add('hide'); continue; }
      q.el.classList.remove('hide');
      // just over the head - the tail's tip a few px above it
      q.el.style.left = `${Math.round(cr.left - lr.left + p.x)}px`; q.el.style.top = `${Math.round(cr.top - lr.top + p.y - 4)}px`;
    }
    if (live.length) raf = requestAnimationFrame(place);
  }

  // ---- the picker -----------------------------------------------------------------------------------------------------
  const TABS = [['emote', 'Emotes'], ['dance', 'Dances'], ['pose', 'Poses']];
  let tab = 'emote';
  const tile = (attr, n, b, hold) => `<button class="emo-t${hold ? ' hold' : ''}" type="button" ${attr} aria-label="${esc(n)}">${b ? `<img alt="" src="${balloonUrl(b)}">` : ''}<span>${esc(n)}</span></button>`;
  const tilesOf = (t, cls = 'emo-t') => (t === 'dance' ? DANCES.map((n, i) => tile(`data-d="${i}"`, n)) : Object.entries(EMOTES).filter(([, v]) => v.tab === t).map(([k, v]) => tile(`data-e="${k}"`, v.n, v.b, v.hold))).join('').replace(/emo-t/g, cls);
  const veil = doc.createElement('div');
  veil.className = 'emo-veil';
  veil.hidden = true;
  const pick = doc.createElement('div');
  pick.className = 'emo-pick';
  pick.hidden = true;
  pick.setAttribute('role', 'dialog');
  pick.setAttribute('aria-label', 'Emotes');
  pick.innerHTML = `<div class="emo-head"><div class="emo-tabs" role="tablist">${TABS.map(([k, n]) => `<button class="emo-tab" type="button" role="tab" data-tab="${k}">${n}</button>`).join('')}</div><button class="x" type="button" aria-label="Close emotes">&times;</button></div><div class="emo-grid"></div>`;
  host.appendChild(veil);
  host.appendChild(pick);
  const grid = pick.querySelector('.emo-grid');
  function renderPick() {
    for (const b of pick.querySelectorAll('.emo-tab')) { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); }
    grid.innerHTML = tilesOf(tab);
    grid.scrollTop = 0;
  }
  let isOpen = false, watch = 0;
  const sendTile = (b) => { if (b.dataset.d !== undefined) ctx.send({ t: 'emote', e: 'dance', m: +b.dataset.d }); else ctx.send({ t: 'emote', e: b.dataset.e }); };
  // (a tap outside: closed - and kept from the game under it)
  veil.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); close(); });
  pick.addEventListener('pointerdown', (e) => e.stopPropagation());
  pick.querySelector('.x').onclick = () => close();
  pick.querySelector('.emo-tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; renderPick(); } };
  grid.onclick = (e) => { const b = e.target.closest('[data-e], [data-d]'); if (!b) return; sendTile(b); close(); };
  function open() {
    if (!ctx.playing() || isOpen) return;
    isOpen = true; veil.hidden = false; pick.hidden = false;
    renderPick();
    doc.body.classList.add('emo-open');
    watch = setInterval(() => { if (!ctx.playing()) close(); }, 500);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; veil.hidden = true; pick.hidden = true;
    doc.body.classList.remove('emo-open');
    clearInterval(watch);
  }
  // the phone's screen (api: { refocus(), close() - the phone away }): the same tabs, as the phone's buttons
  let appTab = 'emote';
  function renderApp(el, api = {}) {
    el.innerHTML = `<div class="seg" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" data-emt="${k}" class="${k === appTab ? 'on' : ''}" aria-checked="${k === appTab}">${n}</button>`).join('')}</div>`
      + `<p class="ph-hint">${appTab === 'pose' ? 'Sit, lie, sleep and the like hold until you move.' : 'Pick one: you act it out where you stand.'}</p><div class="ph-quick">${tilesOf(appTab, 'btn').replace(/<img /g, '<img class="emo-ic" ')}</div>`;
    for (const b of el.querySelectorAll('[data-emt]')) b.onclick = () => { appTab = b.dataset.emt; renderApp(el, api); };
    for (const b of el.querySelectorAll('.ph-quick [data-e], .ph-quick [data-d]')) b.onclick = () => { sendTile(b); if (api.close) api.close(); };
    if (api.refocus) api.refocus();
  }

  // ---- the pad's quick radial (hold LB) -----------------------------------------------------------------------------
  const rad = { el: null, open: false, sel: -1, pickFn: null };
  function radOpen() {
    if (!ctx.playing()) return false;
    if (!rad.el) {
      rad.el = doc.createElement('div');
      rad.el.className = 'emo-rad';
      const n = RADIAL.length, R = 150;
      rad.el.innerHTML = RADIAL.map((k, i) => { const s = slotOf(k), a = (i / n) * 2 * Math.PI; return `<div class="emo-rs" data-i="${i}" style="transform: translate(${Math.round(Math.sin(a) * R * 1.25)}px, ${Math.round(-Math.cos(a) * R)}px)">${s.b ? `<img alt="" src="${balloonUrl(s.b)}">` : ''}<span>${esc(s.n)}</span></div>`; }).join('') + '<div class="emo-rmid"></div>';
      host.appendChild(rad.el);
    }
    rad.el.hidden = false; rad.open = true; rad.sel = -1; rad.pickFn = wheelPicker(RADIAL.length, -1);
    mark();
    return true;
  }
  function mark() {
    for (const s of rad.el.querySelectorAll('.emo-rs')) s.classList.toggle('on', +s.dataset.i === rad.sel);
    rad.el.querySelector('.emo-rmid').textContent = rad.sel >= 0 ? `Let go: ${slotOf(RADIAL[rad.sel]).n}` : 'Point a stick, let go to send';
  }
  function radPoint(lx, ly, rx, ry) { if (!rad.open) return; const s = rad.pickFn(lx || 0, ly || 0, rx || 0, ry || 0); if (s !== rad.sel) { rad.sel = s; mark(); } }
  function radClose() { if (rad.el) rad.el.hidden = true; rad.open = false; }
  // let go: what was picked happens - a quick line said near you, an emote, the keyboard to type, More's phone screen
  function radRelease() {
    if (!rad.open) return null;
    const k = rad.sel >= 0 ? RADIAL[rad.sel] : null;
    radClose();
    if (!k) return null;
    if (k === 'type') { if (ctx.typeLine) ctx.typeLine(); } else if (k === 'more') { if (ctx.moreEmotes) ctx.moreEmotes(); } else if (k.startsWith('q:')) ctx.say(QUICK.near[+k.slice(2)]);
    else ctx.send({ t: 'emote', e: k.slice(2) });
    return k;
  }

  return {
    pop, typing, balloonOn, open, close, toggle: () => (isOpen ? close() : open()), get isOpen() { return isOpen; }, renderApp,
    radial: { open: radOpen, point: radPoint, release: radRelease, close: radClose, get isOpen() { return rad.open; } },
  };
}
