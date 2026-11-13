// Chat on the page (shared/chatdefs.js; the server decides who hears what: server/chat.js). Loaded with the launch code
// after the page is up (main.js launchCall), never in its first load. Every device gets all of it:
// - speech bubbles over the speaker's head for what's said near you (two lines at most, each gone after a few seconds,
//   kept off each other and off the screen's edges; your own smaller and above your name);
// - the feed: the newest lines in the HUD's top-left column (#hud-tl; bottom left on a desktop), one on a phone, two on a
//   desktop, each fading on its own;
// - the chat sheet: T on a keyboard, the HUD's chat button (the top-right row: phone, map, chat, menu) - the channel
//   (Near / Crew / Faction), the log, quick lines and emotes as chips, the line and SEND; on a phone it sits on top of
//   the on-screen keyboard (visualViewport) and the touch controls hide while it's up; Esc / the X closes it;
// - the phone's Messages app (renderApp): threads with the people you've met and your crew, a reply line and quick
//   replies, and the Near / Crew / Faction quick lines and emotes - a pad's way into chat (D-pad left, the phone);
// - Settings > Chat (settings): the channel switches, who's muted and blocked;
// - a name in the log or a bubble (while the sheet is up): mute, block, report (shared/chatdefs.js REPORT_WHY).
// createChat(ctx) -> { onMessage(m), open(ch?), close(), toggle(), say(ch, text, to?), emote(e), renderApp(el, api),
//   appBack(), settings(el), unread, isOpen, state, lines, contactList }
// ctx: { send(obj), canvas, toast(text, tone), screenOf(eid) -> { x, y } | null (CSS px over the canvas), selfEid(),
//   device() ('keyboard' | 'gamepad' | 'touch'), playing() (in the city, online), focus(on) (typing: the game's keys
//   off), dot(on) (unread phone messages: the HUD's chat button and the phone's Messages app), openApp() (the phone's
//   Messages app) }
import { CHANNELS, CHAT, EMOTES, REPORT_WHY, REPORT_LABEL, QUICK } from '../shared/chatdefs.js';
import { glyph } from './touchicons.js';

const LABEL = { near: 'Near', crew: 'Crew', faction: 'Faction', phone: 'Phone' };
const SAY = ['near', 'crew', 'faction'];   // (the sheet's channels: phone messages live in the phone's Messages app)
const OFF_LABEL = { near: 'Near - people around you, about ' + CHAT.nearM + ' m', crew: 'Crew - your crew, wherever they are', faction: 'Faction - the police on duty, or your gang', phone: 'Phone messages - kept for you while this is off' };
const BUBBLE_MS = 6000, OWN_MS = 4500, BUBBLE_LINES = 2, FEED_MS = 8000, THREAD_MAX = 40, THREADS_MAX = 40;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// (the kit's tokens only: test/uitokens.test.js reads this)
const CSS = `
#cht-bubs { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.cht-bub { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; gap: 2px; max-width: 220px; padding: var(--s1) var(--s2); background: var(--cream); color: var(--ink); border: 2px solid var(--ink); border-radius: var(--r1); box-shadow: var(--lift); font: 700 var(--fs-2) var(--pixel); line-height: 1.25; letter-spacing: 0; text-align: center; white-space: normal; overflow-wrap: anywhere; transition: opacity var(--t3) var(--ease); }
.cht-bub::after { content: ''; position: absolute; left: 50%; bottom: -8px; margin-left: -6px; border: 6px solid transparent; border-top-color: var(--ink); border-bottom: 0; }
.cht-bub > span { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.cht-bub > span.em { font-style: italic; color: var(--navy3); }
.cht-bub > span + span { padding-top: 2px; border-top: 1px dashed var(--grey); }
.cht-bub.me { max-width: 180px; opacity: .88; font-size: var(--fs-1); }
.cht-bub.out { opacity: 0; }
body.touch .cht-bub { max-width: 180px; }
body.cht-open .cht-bub:not(.me) { pointer-events: auto; cursor: pointer; }
#cht-feed { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s1); width: min(30vw, 360px); pointer-events: none; }
body:not(.touch) #cht-feed { position: fixed; left: var(--sl); bottom: var(--sb); }
body:not(.touch) #hud:has(#hints:not(.off)) #cht-feed { bottom: calc(var(--sb) + 56px); }
.touch #cht-feed { width: min(100%, 380px); }
.touch:not(.portrait) #cht-feed { width: min(220px, calc(33vw - var(--sl) - 6px)); }
body.touch.portrait #cht-feed { position: fixed; left: var(--sl); top: calc(var(--st) + 236px); width: calc(100vw - var(--sl) - var(--sr)); }
#cht-feed:empty, body.cht-open #cht-feed { display: none; }
.cht-fl { max-width: 100%; padding: 3px 8px 3px 6px; background: var(--pad-veil); border: 2px solid var(--pad-ink); border-left: 4px solid var(--pad-cream); border-radius: 0; box-shadow: none; font: 700 var(--fs-2) var(--pixel); line-height: 1.3; color: var(--pad-cream); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: auto; cursor: pointer; touch-action: manipulation; transition: opacity var(--t3) var(--ease); }
.touch #cht-feed .cht-fl:not(:last-child) { display: none; }
.cht-fl.out { opacity: 0; }
.cht-fl.crew { border-left-color: var(--money); } .cht-fl.faction { border-left-color: var(--info); } .cht-fl.phone { border-left-color: var(--gold); } .cht-fl.em { border-left-color: var(--lotus); }
.cht-fl b { color: var(--gold-hi); }

.cht-sheet { position: absolute; z-index: 12; left: max(var(--s3), env(safe-area-inset-left)); bottom: var(--s3); display: flex; flex-direction: column; width: min(440px, 46vw); max-height: calc(100% - 2 * var(--s3)); background: var(--pad-navy); border: 2px solid var(--pad-ink); border-radius: 0; box-shadow: var(--pn-rim), var(--pn-drop); color: var(--cream); font: 700 var(--fs-3) var(--pixel); animation: enter var(--t2) var(--ease); }
body.touch .cht-sheet { left: 0; right: 0; bottom: 0; width: min(680px, 100%); margin: 0 auto; border-bottom: 0; border-radius: 0; padding-bottom: env(safe-area-inset-bottom); }
body.touch.cht-open #touch, body.touch.cht-open #hud-low, body.touch.cht-open #hints { visibility: hidden; }
.cht-head { display: flex; align-items: center; gap: var(--s1); margin: 2px 2px 0; padding: var(--s1) var(--s1) var(--s1) var(--s2); background: var(--pad-ink); border-bottom: 2px solid var(--pad-gold); border-radius: 0; }
.cht-tabs { display: flex; gap: var(--s1); flex: 1; min-width: 0; }
.cht-tab { min-height: 36px; padding: 0 var(--s2); border: 2px solid transparent; border-radius: 0; background: transparent; color: var(--dim); font: 700 var(--fs-2) var(--pixel); letter-spacing: .5px; cursor: pointer; touch-action: manipulation; }
.cht-tab.on { background: var(--pad-gold); color: var(--pad-ink); border-color: var(--pad-ink); box-shadow: var(--pn-drop); }
.cht-tab.na { opacity: .45; }
.cht-tab:not(.on):hover, .cht-tab.pfocus { color: var(--cream); border-color: var(--gold-a); }
.cht-msgs { position: relative; display: inline-flex; align-items: center; gap: var(--s1); min-height: 36px; padding: 0 var(--s2); border: 2px solid var(--gold-a); border-radius: 0; background: var(--navy2); color: var(--cream); font: 700 var(--fs-2) var(--pixel); cursor: pointer; touch-action: manipulation; --ic: 18px; }
.cht-msgs svg { width: var(--ic); height: var(--ic); }
.cht-msgs b { min-width: 18px; height: 18px; padding: 0 4px; border-radius: 0; background: var(--heat); color: var(--ink); font: 700 var(--fs-1) var(--pixel); line-height: 18px; text-align: center; }
.cht-msgs b:empty { display: none; }
.cht-sheet .x { width: 36px; height: 36px; }
.cht-log { flex: 1 1 auto; min-height: 48px; max-height: 190px; overflow-y: auto; padding: var(--s1) var(--s2); touch-action: pan-y; -webkit-overflow-scrolling: touch; user-select: text; -webkit-user-select: text; }
body.touch:not(.portrait) .cht-log { max-height: 110px; }
body.touch.portrait .cht-log { max-height: 30vh; }
.cht-l { padding: 2px 0; font: 700 var(--fs-3) var(--pixel); line-height: 1.3; color: var(--cream); overflow-wrap: anywhere; }
.cht-l.crew .cht-t { color: var(--money-hi); } .cht-l.faction .cht-t { color: var(--info-hi); } .cht-l.phone .cht-t { color: var(--gold-hi); }
.cht-l.em { font-style: italic; color: var(--lotus); }
.cht-l.sys { color: var(--danger-hi); }
.cht-l.hint { color: var(--dim); }
.cht-tag { display: inline-block; margin-right: var(--s1); padding: 0 var(--s1); border-radius: 0; background: var(--navy3); font: 700 var(--fs-1) var(--pixel); letter-spacing: 0; vertical-align: 1px; }
.cht-tag.crew { color: var(--money); } .cht-tag.faction { color: var(--info); } .cht-tag.phone { color: var(--gold); }
.cht-n { margin-right: var(--s1); padding: 0; border: 0; background: none; color: var(--gold); font: 700 var(--fs-3) var(--pixel); cursor: pointer; touch-action: manipulation; }
.cht-n::after { content: ':'; }
.cht-l.em .cht-n::after { content: ''; }
span.cht-n { cursor: default; color: var(--dim); }
.cht-chips { display: flex; gap: var(--s1); padding: var(--s1) var(--s2) 0; overflow-x: auto; scrollbar-width: none; touch-action: pan-x; -webkit-overflow-scrolling: touch; -webkit-mask-image: linear-gradient(90deg, var(--ink) calc(100% - 24px), transparent); mask-image: linear-gradient(90deg, var(--ink) calc(100% - 24px), transparent); padding-right: var(--s5); }
.cht-chips::-webkit-scrollbar { display: none; }
.cht-chip { flex: none; min-height: 34px; padding: 0 var(--s3); border: 2px solid var(--pad-line); border-radius: 0; background: var(--pad-navy); color: var(--cream); font: 700 var(--fs-2) var(--pixel); white-space: nowrap; cursor: pointer; touch-action: manipulation; }
.cht-chip:hover, .cht-chip.pfocus { border-color: var(--pad-gold); }
.cht-chip.em { color: var(--lotus); border-style: dashed; }
.cht-row { display: flex; gap: var(--s2); padding: var(--s2); }
.cht-row .field { min-height: 40px; }
.cht-row .btn { min-height: 40px; padding: 0 var(--s4); }
.cht-sheet.kb .cht-log, .cht-sheet.kb .cht-chips.em-row { display: none; }
.cht-sheet.em-only :is(.cht-log, .cht-chips.q-row, .cht-row) { display: none; }
.cht-sheet.em-only .cht-chips.em-row { flex-wrap: wrap; padding-bottom: var(--s2); -webkit-mask-image: none; mask-image: none; }
.cht-sheet.em-only .cht-chip { min-height: var(--tap); }
.cht-sheet.kb.tight .cht-head { display: none; }

.cht-who { position: absolute; z-index: 47; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(340px, calc(100% - 2 * var(--s4))); max-height: calc(100% - 2 * var(--s4)); overflow-y: auto; animation: enter var(--t2) var(--ease); }
.cht-who .mhead h2 { font-size: var(--fs-4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cht-who .cht-wb { display: flex; flex-direction: column; gap: var(--s2); padding: var(--s3); }
.cht-who .cht-wb .btn { width: 100%; }
.cht-who .msub { border: 0; padding: 0; background: none; }

.cm-app .seg { margin-bottom: var(--s2); }
.cm-app .seg > button { flex: 1; padding: 0 var(--s1); min-height: 40px; font-size: var(--fs-2); }
.cm-app .seg > button.na { opacity: .5; }
.cm-app .ph-row .un { min-width: 22px; height: 22px; padding: 0 6px; border-radius: var(--r3); background: var(--heat); color: var(--ink); font: 700 var(--fs-1) var(--pixel); line-height: 22px; text-align: center; }
.cm-app .ph-row .ic.on { color: var(--money); }
.cm-thread { display: flex; flex-direction: column; gap: var(--s1); margin: var(--s2) 0; }
.cm-m { max-width: 82%; padding: var(--s1) var(--s3); border-radius: var(--r2); background: var(--navy3); color: var(--cream); font: 600 var(--fs-3) var(--ui); line-height: 1.3; overflow-wrap: anywhere; align-self: flex-start; }
.cm-m.me { align-self: flex-end; background: var(--gold); color: var(--ink); }
.cm-m small { display: block; color: var(--dim); font: 500 var(--fs-1) var(--ui); }
.cm-m.me small { color: var(--navy3); }
.cm-log { margin: var(--s2) 0; padding: var(--s2); border-radius: var(--r2); background: var(--shade); min-height: 60px; }
.cm-chips { display: flex; flex-wrap: wrap; gap: var(--s1); margin: var(--s2) 0; }
.cm-chips .cht-chip { min-height: 40px; }
.cm-send { display: flex; gap: var(--s2); margin: var(--s2) 0; }
.cm-send .field { min-height: 44px; }
.cm-mod { display: flex; flex-wrap: wrap; gap: var(--s1); margin-top: var(--s3); }
.cm-mod .btn { min-height: 40px; padding: 0 var(--s3); font-size: var(--fs-2); }
.cs-list .srow .btn { min-height: 36px; padding: 0 var(--s3); }
`;

export function createChat(ctx) {
  const doc = document, $ = (id) => doc.getElementById(id);
  const host = $('game') || doc.body;
  const st = doc.createElement('style');
  st.textContent = CSS;
  doc.head.appendChild(st);

  // ---- the data ---------------------------------------------------------------------------------------------------
  let state = { off: {}, mutes: [], blocks: [], names: {}, max: CHAT.maxLen, me: null, crew: false, fac: null, muted: 0 };
  const lines = [];                 // the log: { k: 'chat' | 'emote' | 'sys', ch, n, id, text, own, tn, e, at }
  const threads = new Map();        // a contact's id -> { n, l: [{ me, text, at }], un, at }
  const named = new Map();          // an id seen -> its name
  let contactList = null, sayCh = 'near', isOpen = false, inboxAt = 0, refreshAt = 0;
  const muted = (id) => state.mutes.includes(id) || state.blocks.includes(id);
  const unread = () => { let n = 0; for (const t of threads.values()) n += t.un || 0; return n; };

  // the threads are kept in this browser (the server only holds what comes while you're away - its inbox)
  const keyOf = () => (state.me ? `cla.msgs.${state.me}` : null);
  function loadThreads() {
    threads.clear();
    try {
      const raw = keyOf() && localStorage.getItem(keyOf());
      for (const [id, t] of Object.entries(raw ? JSON.parse(raw) : {})) if (t && Array.isArray(t.l)) threads.set(id, { n: String(t.n || 'Someone'), l: t.l.slice(-THREAD_MAX), un: t.un | 0, at: +t.at || 0 });
    } catch { /* storage blocked or spoiled: start empty */ }
  }
  let saveT = 0;
  function saveThreads() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        const keep = [...threads.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, THREADS_MAX);
        if (keyOf()) localStorage.setItem(keyOf(), JSON.stringify(Object.fromEntries(keep)));
      } catch { /* no storage: this session only */ }
    }, 400);
  }
  function threadAdd(id, n, me, text, at) {
    let t = threads.get(id);
    if (!t) { t = { n, l: [], un: 0, at: 0 }; threads.set(id, t); }
    if (n) t.n = n;
    t.l.push({ me: me ? 1 : 0, text, at });
    if (t.l.length > THREAD_MAX) t.l.splice(0, t.l.length - THREAD_MAX);
    t.at = at;
    const looking = !me && app.view === 'thread' && app.id === id && appShowing();
    if (!me && !looking) t.un = (t.un || 0) + 1;
    saveThreads();
    dot();
  }
  function dot() { const n = unread(); if (ctx.dot) ctx.dot(n > 0); const b = sheet.querySelector('.cht-msgs b'); if (b) b.textContent = n ? String(n) : ''; }

  // ---- the speech bubbles -----------------------------------------------------------------------------------------
  const layer = doc.createElement('div');
  layer.id = 'cht-bubs';
  const view = $('view');
  if (view) view.after(layer); else host.appendChild(layer);
  const bubbles = new Map();   // eid -> { el, l: [{ el, until }], me, id, n }
  let raf = 0;
  function bubble(eid, text, em, me, id, n) {
    if (!eid) return;
    let b = bubbles.get(eid);
    if (!b) {
      b = { el: doc.createElement('div'), l: [] };
      b.el.className = 'cht-bub';
      b.el.dataset.eid = eid;
      b.el.onclick = () => { if (b.id && !b.me) who(b.id, b.n); };
      layer.appendChild(b.el);
      bubbles.set(eid, b);
    }
    if (!b.l.length) { b.el.textContent = ''; b.goneAt = 0; }   // (one fading away: its last line goes, the new one comes)
    Object.assign(b, { me: !!me, id, n });
    b.el.classList.toggle('me', !!me);
    b.el.classList.remove('out');
    const s = doc.createElement('span');
    if (em) s.className = 'em';
    s.textContent = text;
    b.el.appendChild(s);
    b.l.push({ el: s, until: performance.now() + (me ? OWN_MS : BUBBLE_MS) });
    while (b.l.length > BUBBLE_LINES) b.l.shift().el.remove();
    if (raf) cancelAnimationFrame(raf);
    place();   // (placed at once - a busy frame doesn't leave it in the corner - then kept over the speaker each frame)
  }
  function place() {
    raf = 0;
    const now = performance.now(), cr = ctx.canvas ? ctx.canvas.getBoundingClientRect() : { left: 0, top: 0 }, lr = layer.getBoundingClientRect();
    const W = lr.width || innerWidth, H = lr.height || innerHeight, shown = [];
    for (const [eid, b] of bubbles) {
      while (b.l.length && now >= b.l[0].until) { const x = b.l.shift(); if (b.l.length) x.el.remove(); }
      if (!b.l.length) {   // (the last line fades with the bubble)
        if (!b.goneAt) { b.goneAt = now + 260; b.el.classList.add('out'); }
        if (now >= b.goneAt) { b.el.remove(); bubbles.delete(eid); }
        continue;
      }
      b.goneAt = 0;
      const p = ctx.playing() ? ctx.screenOf(eid) : null;
      if (!p) { b.el.style.visibility = 'hidden'; continue; }
      b.el.style.visibility = '';
      const w = b.el.offsetWidth, h = b.el.offsetHeight;
      // above the head and its name tag (yours higher still: your character stays in view under it)
      const x = Math.max(4, Math.min(W - w - 4, cr.left - lr.left + p.x - w / 2)), y = cr.top - lr.top + p.y - (b.me ? 62 : 50) - h;
      shown.push({ b, x, y, w, h });
    }
    // nearest the top first; one that lands on another goes up over it
    shown.sort((a, c) => c.y - a.y);
    for (let i = 0; i < shown.length; i++) {
      const a = shown[i];
      for (let k = 0; k < i; k++) { const o = shown[k]; if (a.x < o.x + o.w && o.x < a.x + a.w && a.y < o.y + o.h + 4 && o.y < a.y + a.h) a.y = o.y - a.h - 6; }
      a.y = Math.max(4, Math.min(H - a.h - 4, a.y));
      a.b.el.style.left = `${Math.round(a.x)}px`; a.b.el.style.top = `${Math.round(a.y)}px`;
    }
    if (bubbles.size) raf = requestAnimationFrame(place);
  }

  // ---- the feed under the HUD's notes ---------------------------------------------------------------------------
  const feed = doc.createElement('div');
  feed.id = 'cht-feed';
  feed.setAttribute('aria-live', 'polite');
  const tl = $('hud-tl');   // (the zone map: chat's last lines top left under the world on a phone, bottom left on a desktop - its CSS)
  if (tl) tl.appendChild(feed); else ($('hud') || host).appendChild(feed);
  feed.onclick = () => { if (ctx.playing()) open(); };
  function feedLine(l) {
    if (isOpen || l.own) return;
    const d = doc.createElement('div');
    d.className = `cht-fl ${l.k === 'emote' ? 'em' : l.ch || ''}`;
    d.innerHTML = l.k === 'emote' ? `<b>${esc(l.n)}</b> ${esc(EMOTES[l.e].text)}` : `${l.ch !== 'near' ? `${LABEL[l.ch]} · ` : ''}<b>${esc(l.n)}:</b> ${esc(l.text)}`;
    feed.appendChild(d);
    while (feed.children.length > 2) feed.firstChild.remove();   // (two on a desktop, the newest on a phone: its CSS)
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 300); }, FEED_MS);
  }

  // ---- the chat sheet -------------------------------------------------------------------------------------------
  const sheet = doc.createElement('div');
  sheet.className = 'cht-sheet';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Chat');
  sheet.innerHTML = `<div class="cht-head"><div class="cht-tabs" role="tablist">${SAY.map((c) => `<button class="cht-tab" role="tab" data-ch="${c}">${LABEL[c]}</button>`).join('')}</div>`
    + `<button class="cht-msgs" type="button" aria-label="Messages (the phone)">${glyph('smartphone')}<span>Messages</span><b></b></button><button class="x" type="button" aria-label="Close chat">&times;</button></div>`
    + '<div class="cht-log" aria-live="polite"></div><div class="cht-chips q-row"></div><div class="cht-chips em-row"></div>'
    + `<form class="cht-row" autocomplete="off"><input class="field cht-in" type="text" maxlength="${CHAT.maxLen}" enterkeyhint="send" autocapitalize="sentences" spellcheck="true" aria-label="Your message"><button class="btn btn-1" type="submit">SEND</button></form>`;
  host.appendChild(sheet);
  const logEl = sheet.querySelector('.cht-log'), inEl = sheet.querySelector('.cht-in'), qRow = sheet.querySelector('.q-row'), eRow = sheet.querySelector('.em-row');
  const placeholder = () => (sayCh === 'near' ? `Say to people near you${ctx.device() === 'keyboard' ? ' (Enter sends, Esc closes)' : ''}` : `Say to your ${sayCh === 'crew' ? 'crew' : 'faction'}`);

  function lineHtml(l) {
    if (l.k === 'sys') return `<div class="cht-l ${l.hint ? 'hint' : 'sys'}">${esc(l.text)}</div>`;
    const nm = l.own ? `<span class="cht-n">${l.ch === 'phone' ? `To ${esc(l.tn || 'them')}` : 'You'}</span>` : `<button class="cht-n" type="button" data-who="${esc(l.id)}">${esc(l.n)}</button>`;
    if (l.k === 'emote') return `<div class="cht-l em">${nm}${esc(EMOTES[l.e].text)}</div>`;
    return `<div class="cht-l ${l.ch}">${l.ch !== 'near' ? `<span class="cht-tag ${l.ch}">${LABEL[l.ch].toUpperCase()}</span>` : ''}${nm}<span class="cht-t">${esc(l.text)}</span></div>`;
  }
  function renderLog() { logEl.innerHTML = lines.slice(-40).map(lineHtml).join('') || '<div class="cht-l hint">Nobody\'s said anything yet. Say hi - or pick a quick line.</div>'; logEl.scrollTop = logEl.scrollHeight; }
  const chipsHtml = (ch) => (QUICK[ch] || []).map((t, i) => `<button class="cht-chip" type="button" data-q="${i}">${esc(t)}</button>`).join('');
  const emotesHtml = () => Object.entries(EMOTES).map(([k, v]) => `<button class="cht-chip em" type="button" data-e="${k}">${esc(v.n)}</button>`).join('');
  const reach = (ch) => ch === 'near' || (ch === 'crew' ? state.crew : ch === 'faction' ? !!state.fac : true);
  const whyNot = (ch) => (ch === 'crew' ? 'No crew yet: walk up to another player and ask them in.' : 'No faction: go on duty with the police, or join a gang.');
  function renderSheet() {
    for (const b of sheet.querySelectorAll('.cht-tab')) { const c = b.dataset.ch; b.classList.toggle('on', c === sayCh); b.classList.toggle('na', !reach(c) || !!state.off[c]); b.setAttribute('aria-selected', String(c === sayCh)); }
    qRow.innerHTML = chipsHtml(sayCh);
    eRow.innerHTML = sayCh === 'near' ? emotesHtml() : '';
    eRow.hidden = sayCh !== 'near';
    inEl.placeholder = placeholder();
    inEl.maxLength = state.max || CHAT.maxLen;
    renderLog();
    dot();
  }
  function pickCh(c) {
    sayCh = c;
    renderSheet();
    if (!reach(c)) sysLine(whyNot(c), true);
    else if (state.off[c]) sysLine(`${LABEL[c]} is switched off in Settings › Chat.`, true);
  }
  for (const b of sheet.querySelectorAll('.cht-tab')) b.onclick = () => pickCh(b.dataset.ch);
  sheet.querySelector('.x').onclick = () => close();
  sheet.querySelector('.cht-msgs').onclick = () => { close(); app.view = 'home'; app.tab = 'msgs'; if (ctx.openApp) ctx.openApp(); };
  qRow.onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) say(sayCh, QUICK[sayCh][+b.dataset.q]); };
  eRow.onclick = (e) => { const b = e.target.closest('[data-e]'); if (b) emote(b.dataset.e); };
  logEl.onclick = (e) => { const b = e.target.closest('[data-who]'); if (b) who(b.dataset.who, b.textContent); };
  // (a mouse wheel moves a row of chips sideways)
  for (const r of [qRow, eRow]) r.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { r.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  sheet.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const text = inEl.value.trim();
    inEl.value = '';
    if (!text) { if (ctx.device() !== 'touch') close(); return; }
    // /me <emote> (or /wave), /c crew, /f faction, /n near
    const cmd = text.match(/^\/(\w+)\s*(.*)$/);
    const e2 = cmd && (cmd[1] === 'me' ? cmd[2].trim().toLowerCase() : cmd[1].toLowerCase());
    if (cmd && Object.hasOwn(EMOTES, e2)) { emote(e2); return; }
    if (cmd && (cmd[1] === 'c' || cmd[1] === 'f' || cmd[1] === 'n')) say(cmd[1] === 'c' ? 'crew' : cmd[1] === 'f' ? 'faction' : 'near', cmd[2]);
    else say(sayCh, text);
    if (ctx.device() === 'keyboard') close();   // (a keyboard: Enter sends and gives the keys back, as T took them; a phone keeps it up)
  };
  // the T that opened it would land in the line as its first letter: that one keystroke is dropped
  let openedAt = -1e9;
  inEl.addEventListener('beforeinput', (e) => { if (performance.now() - openedAt < 250 && !inEl.value && /^t$/i.test(e.data || '')) { e.preventDefault(); openedAt = -1e9; } });
  inEl.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  inEl.addEventListener('keyup', (e) => e.stopPropagation());
  inEl.addEventListener('focus', () => { if (ctx.focus) ctx.focus(true); fit(); });
  inEl.addEventListener('blur', () => { setTimeout(() => { fit(); if (!isOpen || doc.activeElement !== inEl) { try { if (scrollY) scrollTo(0, 0); } catch { /* fine */ } } }, 60); });

  // the on-screen keyboard: the sheet rides on top of it (Android Chrome and iOS Safari both shrink only the visual
  // viewport); with little room left, the log and the emotes fold away, then the channel row
  const vv = window.visualViewport;
  function fit() {
    if (!isOpen) return;
    if (!vv || ctx.device() !== 'touch') { sheet.style.bottom = ''; sheet.style.maxHeight = ''; sheet.classList.remove('kb', 'tight'); return; }
    const hr = host.getBoundingClientRect(), under = Math.max(0, hr.bottom - (vv.height + vv.offsetTop));
    sheet.style.bottom = under > 1 ? `${Math.round(under)}px` : '';
    sheet.style.maxHeight = `${Math.round(vv.height - Math.max(0, vv.offsetTop - hr.top))}px`;
    const kb = under > 60 || vv.height < innerHeight * 0.75;
    sheet.classList.toggle('kb', kb);
    sheet.classList.toggle('tight', kb && vv.height < 200);
  }
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  addEventListener('resize', fit);

  let watch = 0;
  function open(ch) {
    if (!ctx.playing()) return;
    if (ch && SAY.includes(ch)) sayCh = ch;
    sheet.classList.remove('em-only');
    if (!isOpen) {
      isOpen = true;
      sheet.hidden = false;
      doc.body.classList.add('cht-open');
      for (const d of [...feed.children]) d.remove();
      if (Date.now() - refreshAt > 15000) { refreshAt = Date.now(); ctx.send({ t: 'chatset' }); }   // (in a crew, in a faction: the tabs)
      watch = setInterval(() => { if (!ctx.playing()) close(); }, 500);
    }
    renderSheet();
    fit();
    if (ctx.device() !== 'touch') { openedAt = performance.now(); inEl.focus({ preventScroll: true }); if (ctx.focus) ctx.focus(true); }   // (a phone: the keyboard only when the line's tapped)
  }
  // the emotes straight away (the thumb's chat button held - client/main.js): the sheet with its emote row only
  function emotes() { open(); sheet.classList.add('em-only'); }
  function close() {
    if (!isOpen) return;
    sheet.classList.remove('em-only');
    isOpen = false;
    clearInterval(watch);
    inEl.blur();
    sheet.hidden = true;
    sheet.classList.remove('kb', 'tight');
    doc.body.classList.remove('cht-open');
    closeWho();
    if (ctx.focus) ctx.focus(false);
    try { if (scrollY) scrollTo(0, 0); } catch { /* fine */ }
  }

  // ---- mute / block / report -------------------------------------------------------------------------------------
  let whoEl = null, whoId = null, whoN = '', whoStep = 'main';
  function who(id, n) {
    if (!id || id === state.me) return;
    whoId = id; whoN = n || named.get(id) || state.names[id] || 'Someone'; whoStep = 'main';
    if (!contactList) ctx.send({ t: 'contacts' });
    renderWho();
  }
  function closeWho() { if (whoEl) { whoEl.remove(); whoEl = null; } whoId = null; }
  function renderWho() {
    if (!whoId) return;
    if (!whoEl) { whoEl = doc.createElement('div'); whoEl.className = 'cht-who panel'; whoEl.setAttribute('role', 'dialog'); host.appendChild(whoEl); }
    const isM = state.mutes.includes(whoId), isB = state.blocks.includes(whoId), contact = (contactList || []).some((c) => c.id === whoId);
    let body;
    if (whoStep === 'report') body = `<p class="msub">What's wrong? Their last lines go to the moderators with your report.</p>${REPORT_WHY.map((w) => `<button class="btn" type="button" data-why="${w}">${esc(REPORT_LABEL[w] || w)}</button>`).join('')}<button class="btn" type="button" data-w="back">Back</button>`;
    else body = (contact && !isB ? '<button class="btn btn-1" type="button" data-w="msg">Message</button>' : '')
      + `<button class="btn" type="button" data-w="${isM ? 'unmute' : 'mute'}">${isM ? 'Unmute' : 'Mute'}<small class="dim">&nbsp;${isM ? '' : '- hide their lines'}</small></button>`
      + `<button class="btn" type="button" data-w="${isB ? 'unblock' : 'block'}">${isB ? 'Unblock' : 'Block'}<small class="dim">&nbsp;${isB ? '' : '- no messages either way'}</small></button>`
      + '<button class="btn btn-x" type="button" data-w="report">Report…</button>';
    whoEl.innerHTML = `<div class="mhead"><h2>${esc(whoN)}</h2><button class="x" type="button" aria-label="Close">&times;</button></div><div class="cht-wb">${body}</div>`;
    whoEl.querySelector('.x').onclick = closeWho;
    whoEl.onclick = (e) => {
      const b = e.target.closest('[data-w], [data-why]');
      if (!b) return;
      const w = b.dataset.w, id = whoId;
      if (b.dataset.why) { report(id, b.dataset.why); closeWho(); return; }
      if (w === 'back') { whoStep = 'main'; renderWho(); return; }
      if (w === 'report') { whoStep = 'report'; renderWho(); return; }
      if (w === 'msg') { closeWho(); close(); openThread(id, whoN); return; }
      ctx.send({ t: 'mod', a: w, id });
      closeWho();
    };
  }
  function report(id, why, note) { ctx.send({ t: 'mod', a: 'report', id, why: REPORT_WHY.includes(why) ? why : 'other', note }); }

  // ---- what the server sends -------------------------------------------------------------------------------------
  function push(l) {
    l.at ||= Date.now();
    lines.push(l);
    if (lines.length > CHAT.logMax) lines.shift();
    if (isOpen) renderLog();
    feedLine(l);
    refreshApp();
  }
  function sysLine(text, hint = false) { if (isOpen) push({ k: 'sys', text, hint }); else ctx.toast(text, hint ? 'info' : 'warn'); }
  function onMessage(m) {
    switch (m.t) {
      case 'chat': {
        if (!m.own && muted(m.id)) return;
        if (m.id && m.n && !m.own) named.set(m.id, m.n);
        const l = { k: 'chat', ch: m.ch, n: m.n, id: m.id, text: String(m.text || ''), own: !!m.own, tn: m.tn, at: m.at };
        if (m.ch === 'phone') threadAdd(m.own ? m.to : m.id, m.own ? m.tn : m.n, m.own, l.text, m.at || Date.now());
        push(l);
        if (m.ch === 'near') bubble(m.eid, l.text, false, m.own, m.id, m.n);
        return;
      }
      case 'emote': {
        const E = Object.hasOwn(EMOTES, m.e) ? EMOTES[m.e] : null;
        if (!E || (m.id !== state.me && muted(m.id))) return;
        const own = !!state.me && m.id === state.me;
        push({ k: 'emote', e: m.e, n: m.n, id: m.id, own });
        bubble(m.eid, `${E.text}`, true, own, m.id, m.n);
        return;
      }
      case 'chatstate': {
        const meWas = state.me, mutedWas = state.muted;
        state = { ...state, ...m };
        if (state.me !== meWas) loadThreads();
        inEl.maxLength = state.max || CHAT.maxLen;
        if (m.muted && m.muted > Date.now() && m.muted !== mutedWas) sysLine(`You're muted from chat until ${new Date(m.muted).toLocaleString()}.`);
        if (Date.now() - inboxAt > 5000) { inboxAt = Date.now(); ctx.send({ t: 'inbox' }); }   // (what came while you were away)
        if (isOpen) renderSheet();
        renderSettings(); refreshApp(true); dot();
        return;
      }
      case 'chatsay': if (!m.ok) sysLine(m.err || 'Not sent.'); return;
      case 'modres': if (m.state) state = { ...state, ...m.state }; ctx.toast(m.ok ? m.note : m.err, m.ok ? 'good' : 'warn'); renderSettings(); refreshApp(true); return;
      case 'contacts': contactList = m.l || []; for (const c of contactList) named.set(c.id, c.n); if (whoEl) renderWho(); refreshApp(true); return;
      case 'inbox': for (const l of m.l || []) onMessage(l); return;
      default:
    }
  }
  function say(ch, text, to) {
    text = String(text || '').trim();
    if (!text) return;
    ctx.send({ t: 'chat', ch, text: text.slice(0, state.max || CHAT.maxLen), to });
  }
  function emote(e) { if (Object.hasOwn(EMOTES, e)) ctx.send({ t: 'emote', e }); }

  // ---- the phone's Messages app ----------------------------------------------------------------------------------
  // app.tab: 'msgs' (the threads) | 'near' | 'crew' | 'faction' (quick lines, emotes, a line to type); app.view 'home'
  // or 'thread' (app.id: whose); app.step: 'report' while picking a reason
  const app = { tab: 'msgs', view: 'home', id: null, n: '', step: null, el: null, root: null, api: null };
  const appShowing = () => !!(app.root && app.root.isConnected);
  function openThread(id, n) {
    app.tab = 'msgs'; app.view = 'thread'; app.id = id; app.n = n || (threads.get(id) || {}).n || named.get(id) || 'Someone'; app.step = null;
    const t = threads.get(id);
    if (t) t.un = 0;
    saveThreads(); dot();
    if (appShowing()) renderAppNow(); else if (ctx.openApp) ctx.openApp();
  }
  const ago = (at) => { const s = Math.max(0, (Date.now() - at) / 1000); return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 86400)} d`; };
  function people() {
    // the threads, newest first, then the people you've met with none yet
    const out = [...threads.entries()].map(([id, t]) => ({ id, n: t.n, last: t.l[t.l.length - 1], un: t.un || 0, at: t.at }));
    out.sort((a, b) => b.at - a.at);
    const have = new Set(out.map((q) => q.id)), byId = new Map((contactList || []).map((c) => [c.id, c]));
    for (const q of out) { const c = byId.get(q.id); if (c) { q.on = c.on; q.crew = c.crew; } }
    const rest = (contactList || []).filter((c) => !have.has(c.id) && !state.blocks.includes(c.id));
    return { out, rest };
  }
  const contactRow = (q) => `<button class="ph-row" type="button" data-cmh="${esc(q.id)}" data-cmn="${esc(q.n)}"><span class="ic${q.on ? ' on' : ''}">${q.on ? '●' : '○'}</span><span class="nm">${esc(q.n)}${q.crew ? ' <small>(crew)</small>' : ''}<small>${q.last ? `${q.last.me ? 'You: ' : ''}${esc(q.last.text)}` : q.how === 'met' ? 'Met in town' : q.how ? esc(q.how) : ''}</small></span>${q.un ? `<span class="un">${q.un}</span>` : q.at ? `<span class="d">${ago(q.at)}</span>` : ''}</button>`;
  function appListHtml() {
    if (app.view === 'thread') {
      const t = threads.get(app.id), l = t ? t.l : [];
      return `<div class="cm-thread">${l.length ? l.map((x) => `<div class="cm-m${x.me ? ' me' : ''}">${esc(x.text)}<small>${ago(x.at)}</small></div>`).join('') : '<p class="ph-empty">No messages yet. Say hello.</p>'}</div>`;
    }
    if (app.tab === 'msgs') {
      if (!contactList && !threads.size) return '<p class="ph-empty">Loading…</p>';
      const { out, rest } = people();
      if (!out.length && !rest.length) return `<p class="ph-hint">Nobody to text yet. Spend a few seconds within ${CHAT.metM} m of another player and they're in your contacts - your crew are too. Messages wait for them if they're away.</p>`;
      return out.map(contactRow).join('') + (rest.length ? `<h3>People you've met</h3>${rest.map((c) => contactRow({ id: c.id, n: c.n, on: c.on, crew: c.crew, how: c.how === 'met' ? 'met' : c.how === 'crew' ? 'Your crew' : c.how })).join('')}` : '');
    }
    const ch = app.tab, mine = lines.filter((x) => (x.k === 'emote' ? ch === 'near' : x.k === 'chat' && x.ch === ch)).slice(-8);
    return `<div class="cm-log">${mine.length ? mine.map(lineHtml).join('') : `<div class="cht-l hint">${ch === 'near' ? 'Nothing said near you lately.' : `Nothing on ${LABEL[ch]} lately.`}</div>`}</div>`;
  }
  function renderAppNow() {
    const el = app.el;
    if (!el) return;
    const tabs = [['msgs', 'Messages'], ['near', 'Near'], ['crew', 'Crew'], ['faction', 'Faction']];
    let h = '';
    if (app.view === 'thread') {
      const isB = state.blocks.includes(app.id), isM = state.mutes.includes(app.id), c = (contactList || []).find((q) => q.id === app.id);
      h += `<h3>${esc(app.n)}${c ? ` <small class="dim">${c.on ? '· online' : '· away'}</small>` : ''}</h3><div class="cm-list">${appListHtml()}</div>`;
      if (!isB) h += `<div class="cm-chips">${chipsHtml('phone').replace(/data-q=/g, 'data-cmq=')}</div><form class="cm-send" autocomplete="off"><input class="field" type="text" maxlength="${state.max || CHAT.maxLen}" enterkeyhint="send" placeholder="Message ${esc(app.n)}" aria-label="Message"><button class="btn btn-1" type="submit">SEND</button></form>`;
      h += app.step === 'report'
        ? `<p class="ph-hint">Report ${esc(app.n)} for:</p><div class="cm-mod">${REPORT_WHY.map((w) => `<button class="btn" type="button" data-cmw="${w}">${esc(REPORT_LABEL[w] || w)}</button>`).join('')}<button class="btn" type="button" data-cmx="back">Back</button></div>`
        : `<div class="cm-mod"><button class="btn" type="button" data-cmx="${isM ? 'unmute' : 'mute'}">${isM ? 'Unmute' : 'Mute'}</button><button class="btn" type="button" data-cmx="${isB ? 'unblock' : 'block'}">${isB ? 'Unblock' : 'Block'}</button><button class="btn btn-x" type="button" data-cmx="report">Report…</button></div>`;
    } else {
      h += `<div class="seg" role="tablist">${tabs.map(([k, n]) => `<button type="button" role="tab" data-cmt="${k}" class="${k === app.tab ? 'on' : ''}${k !== 'msgs' && !reach(k) ? ' na' : ''}" aria-checked="${k === app.tab}">${n}${k === 'msgs' && unread() ? ` (${unread()})` : ''}</button>`).join('')}</div>`;
      if (app.tab === 'msgs') h += `<div class="cm-list">${appListHtml()}</div>`;
      else if (!reach(app.tab)) h += `<p class="ph-hint">${whyNot(app.tab)}</p>`;
      else {
        h += `<div class="cm-list">${appListHtml()}</div><div class="cm-chips">${chipsHtml(app.tab).replace(/data-q=/g, 'data-cmq=')}${app.tab === 'near' ? emotesHtml().replace(/data-e=/g, 'data-cme=') : ''}</div>`
          + `<form class="cm-send" autocomplete="off"><input class="field" type="text" maxlength="${state.max || CHAT.maxLen}" enterkeyhint="send" placeholder="Say to ${app.tab === 'near' ? 'people near you' : `your ${app.tab}`}" aria-label="Your line"><button class="btn btn-1" type="submit">SEND</button></form>`;
        if (state.off[app.tab]) h += `<p class="ph-hint">${LABEL[app.tab]} is switched off in Settings › Chat.</p>`;
      }
    }
    el.innerHTML = `<div class="cm-app">${h}</div>`;
    app.root = el.firstChild;
    wireApp(app.root);
    if (app.api && app.api.title) app.api.title(app.view === 'thread' ? app.n : 'Messages');
  }
  function wireApp(root) {
    root.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.type === 'submit') return;
      const d = b.dataset;
      if (d.cmt) { app.tab = d.cmt; if (d.cmt === 'msgs') ctx.send({ t: 'contacts' }); renderAppNow(); refocus(true); return; }
      if (d.cmh) { openThread(d.cmh, d.cmn); refocus(true); return; }
      if (d.cmq !== undefined) { const ch = app.view === 'thread' ? 'phone' : app.tab, t = QUICK[ch][+d.cmq]; say(ch, t, app.view === 'thread' ? app.id : undefined); return; }
      if (d.cme) { emote(d.cme); return; }
      if (d.cmw) { report(app.id, d.cmw); app.step = null; renderAppNow(); refocus(true); return; }
      if (d.cmx === 'report') { app.step = 'report'; renderAppNow(); refocus(true); return; }
      if (d.cmx === 'back') { app.step = null; renderAppNow(); refocus(true); return; }
      if (d.cmx) { ctx.send({ t: 'mod', a: d.cmx, id: app.id }); return; }
    };
    const f = root.querySelector('form');
    if (f) {
      const i = f.querySelector('input');
      f.onsubmit = (e) => { e.preventDefault(); const t = i.value.trim(); i.value = ''; if (!t) return; if (app.view === 'thread') say('phone', t, app.id); else say(app.tab, t); };
      i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); i.blur(); } });
      i.addEventListener('keyup', (e) => e.stopPropagation());
      i.addEventListener('focus', () => { if (ctx.focus) ctx.focus(true); });
      i.addEventListener('blur', () => { if (ctx.focus && !isOpen) ctx.focus(false); });
    }
    const list = root.querySelector('.cm-thread');
    if (list) setTimeout(() => list.lastElementChild && list.lastElementChild.scrollIntoView({ block: 'nearest' }), 0);
  }
  const refocus = (start) => { if (app.api && app.api.refocus) app.api.refocus(start); };
  // something changed while it's open: the list only (a line being typed, and the pad's place, are kept); a whole new
  // render when the tabs or the buttons may have changed
  function refreshApp(all = false) {
    if (!appShowing()) return;
    if (app.view === 'thread') { const t = threads.get(app.id); if (t && t.un) { t.un = 0; saveThreads(); dot(); } }
    const typing = app.root.contains(doc.activeElement) && doc.activeElement.tagName === 'INPUT';
    if (all && !typing) { renderAppNow(); refocus(false); return; }
    const box = app.root.querySelector('.cm-list');
    if (box) { box.innerHTML = appListHtml(); const list = box.querySelector('.cm-thread'); if (list && list.lastElementChild) list.lastElementChild.scrollIntoView({ block: 'nearest' }); }
  }
  // the phone renders the app into el; api: { refocus(start), title(t) }
  function renderApp(el, api) {
    app.el = el; app.api = api || null;
    if (app.view === 'thread' && threads.get(app.id)) threads.get(app.id).un = 0;
    ctx.send({ t: 'contacts' });
    if (Date.now() - inboxAt > 5000) { inboxAt = Date.now(); ctx.send({ t: 'inbox' }); }
    renderAppNow();
    dot();
  }
  // the phone's back: out of a thread (or a report's reasons) first
  function appBack() {
    if (!appShowing()) return false;
    if (app.step) { app.step = null; renderAppNow(); refocus(true); return true; }
    if (app.view === 'thread') { app.view = 'home'; app.tab = 'msgs'; app.id = null; renderAppNow(); refocus(true); return true; }
    return false;
  }

  // ---- Settings > Chat ------------------------------------------------------------------------------------------
  let setEl = null;
  function settings(el) { setEl = el; renderSettings(); }
  function renderSettings() {
    if (!setEl) return;
    const ids = [...new Set([...state.blocks, ...state.mutes])];
    setEl.innerHTML = '<p class="msub">Who you hear. A channel switched off brings you none of its lines, and you can\'t send on it.</p>'
      + CHANNELS.map((c) => `<label class="srow"><span>${esc(OFF_LABEL[c])}</span><input type="checkbox" data-ch="${c}"${state.off[c] ? '' : ' checked'}></label>`).join('')
      + (state.muted && state.muted > Date.now() ? `<p class="msub bad">You're muted from chat until ${esc(new Date(state.muted).toLocaleString())}.</p>` : '')
      + '<p class="msub">Muted and blocked</p><div class="cs-list">'
      + (ids.length ? ids.map((id) => { const b = state.blocks.includes(id); return `<div class="srow"><span>${esc(state.names[id] || named.get(id) || 'Someone')} <small class="dim">${b ? 'blocked' : 'muted'}</small></span><button class="btn" type="button" data-un="${esc(id)}" data-a="${b ? 'unblock' : 'unmute'}">${b ? 'Unblock' : 'Unmute'}</button></div>`; }).join('') : '<div class="srow"><span class="dim">Nobody.</span></div>')
      + '</div><p class="msub">To mute, block or report someone, tap their name in the chat, or their speech bubble while chat is open. In a phone thread, the buttons are under the messages.</p>';
    for (const i of setEl.querySelectorAll('input[data-ch]')) i.onchange = () => ctx.send({ t: 'chatset', off: { [i.dataset.ch]: !i.checked } });
    for (const b of setEl.querySelectorAll('[data-un]')) b.onclick = () => ctx.send({ t: 'mod', a: b.dataset.a, id: b.dataset.un });
  }

  return {
    onMessage, open, close, say, emote, emotes, renderApp, appBack, settings,
    toggle(ch) { if (isOpen) close(); else open(ch); },
    who, openThread,
    setOff(ch, off) { ctx.send({ t: 'chatset', off: { [ch]: !!off } }); },
    contacts() { ctx.send({ t: 'contacts' }); },
    inbox() { ctx.send({ t: 'inbox' }); },
    mute(id) { ctx.send({ t: 'mod', a: 'mute', id }); }, unmute(id) { ctx.send({ t: 'mod', a: 'unmute', id }); },
    block(id) { ctx.send({ t: 'mod', a: 'block', id }); }, unblock(id) { ctx.send({ t: 'mod', a: 'unblock', id }); },
    report,
    get state() { return state; }, get lines() { return lines; }, get contactList() { return contactList; }, get isOpen() { return isOpen; },
    get unread() { return unread(); }, get threads() { return threads; }, get app() { return app; },
  };
}
