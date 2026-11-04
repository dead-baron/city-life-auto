// Chat on the page (shared/chatdefs.js; the server decides who hears what: server/chat.js). Speech bubbles over heads
// for what's said near you, a small log, an input line, emotes, the channel toggles, mute / block / report and the
// phone's messages. Loaded the first time a chat message arrives or the chat key is pressed (main.js launchCall).
// What the UI's next stage wires into the HUD, settings and the phone app:
//   createChat(ctx) -> { onMessage(m), open(ch?), close(), say(ch, text, to?), emote(e), setOff(ch, off), state,
//                        contacts() (asks; arrives in onMessage), inbox(), mute(id), block(id), report(id, why, note),
//                        lines (the log), onChange(fn) }
// ctx: { send(obj), screenOf(eid) -> { x, y } | null (CSS px over the game canvas), canvas, toast(text, tone),
//        focus(on) (the game's keys off while typing) }
import { CHANNELS, CHAT, EMOTES, REPORT_WHY } from '../shared/chatdefs.js';

const LABEL = { near: 'Near', crew: 'Crew', faction: 'Faction', phone: 'Phone' };
const COLOR = { near: '#f2f2f2', crew: '#8ef0a0', faction: '#8cc8ff', phone: '#ffd27f', emote: '#d8b4ff', sys: '#ff8a80' };
const BUBBLE_MS = 6000;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createChat(ctx) {
  const doc = document;
  const st = doc.createElement('style');
  st.textContent = `.cla-chat{position:fixed;left:8px;bottom:8px;width:min(360px,60vw);z-index:60;font:13px/1.35 system-ui,sans-serif;color:#eee;pointer-events:none}
.cla-chat .log{max-height:150px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;text-shadow:0 1px 2px #000}
.cla-chat .log div{padding:1px 4px;background:rgba(0,0,0,.35);margin-top:1px;border-radius:3px;word-wrap:break-word}
.cla-chat.faded .log{opacity:.0;transition:opacity 1s}
.cla-chat .row{display:none;margin-top:4px;pointer-events:auto;gap:4px}
.cla-chat.open .row{display:flex}.cla-chat.open .log{opacity:1;max-height:260px;overflow:auto;pointer-events:auto}
.cla-chat select,.cla-chat input,.cla-chat button{font:inherit;background:rgba(20,22,28,.9);color:#eee;border:1px solid #555;border-radius:4px;padding:5px}
.cla-chat input{flex:1;min-width:0}
.cla-bub{position:fixed;z-index:59;transform:translate(-50%,-100%);max-width:220px;padding:4px 8px;border-radius:10px;background:rgba(255,255,255,.93);color:#111;font:13px/1.3 system-ui,sans-serif;pointer-events:none;white-space:pre-wrap;word-wrap:break-word}
.cla-bub.em{background:rgba(60,30,90,.88);color:#f3e6ff;font-style:italic}`;
  doc.head.appendChild(st);
  const root = doc.createElement('div');
  root.className = 'cla-chat faded';
  root.innerHTML = `<div class="log" aria-live="polite"></div><div class="row"><select class="ch">${CHANNELS.map((c) => `<option value="${c}">${LABEL[c]}</option>`).join('')}</select><select class="to" style="display:none"></select><input class="in" maxlength="${CHAT.maxLen}" placeholder="Say something (Enter to send, Esc to close)"><select class="em"><option value="">Emote</option>${Object.entries(EMOTES).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('')}</select></div>`;
  doc.body.appendChild(root);
  const logEl = root.querySelector('.log'), inEl = root.querySelector('.in'), chEl = root.querySelector('.ch'), toEl = root.querySelector('.to'), emEl = root.querySelector('.em');
  const lines = [], bubbles = new Map(), listeners = [];
  let state = { off: {}, mutes: [], blocks: [], max: CHAT.maxLen }, contactList = [], raf = 0, fadeT = 0, isOpen = false;
  const changed = () => { for (const f of listeners) { try { f(); } catch { /* a listener's own trouble */ } } };

  function addLine(cls, html, ch) {
    lines.push({ ch, html, at: Date.now() });
    if (lines.length > CHAT.logMax) lines.shift();
    const d = doc.createElement('div');
    d.style.color = COLOR[cls] || COLOR.near;
    d.innerHTML = html;
    logEl.appendChild(d);
    while (logEl.children.length > CHAT.logMax) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
    root.classList.remove('faded');
    clearTimeout(fadeT);
    if (!isOpen) fadeT = setTimeout(() => root.classList.add('faded'), 12000);
    changed();
  }
  function bubble(eid, text, em) {
    if (!eid) return;
    let b = bubbles.get(eid);
    if (!b) { b = { el: doc.createElement('div') }; doc.body.appendChild(b.el); bubbles.set(eid, b); }
    b.el.className = 'cla-bub' + (em ? ' em' : '');
    b.el.textContent = text;
    b.until = performance.now() + BUBBLE_MS;
    if (!raf) raf = requestAnimationFrame(place);
  }
  function place() {
    raf = 0;
    const now = performance.now(), r = ctx.canvas ? ctx.canvas.getBoundingClientRect() : { left: 0, top: 0 };
    for (const [eid, b] of bubbles) {
      const p = now < b.until ? ctx.screenOf(eid) : null;
      if (!p) { if (now >= b.until) { b.el.remove(); bubbles.delete(eid); } else b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      b.el.style.left = `${r.left + p.x}px`;
      b.el.style.top = `${r.top + p.y - 34}px`;
    }
    if (bubbles.size) raf = requestAnimationFrame(place);
  }

  function onMessage(m) {
    switch (m.t) {
      case 'chat': {
        if (state.mutes.includes(m.id)) return;
        const who = m.ch === 'phone' && m.own ? `to ${esc(m.tn || 'them')}` : esc(m.n);
        addLine(m.ch, `<b>[${LABEL[m.ch] || m.ch}] ${who}:</b> ${esc(m.text)}`, m.ch);
        if (m.ch === 'near') bubble(m.eid, m.text, false);
        return;
      }
      case 'emote': { const E = Object.hasOwn(EMOTES, m.e) ? EMOTES[m.e] : null; if (!E) return; addLine('emote', `<i>${esc(m.n)} ${esc(E.text)}</i>`, 'emote'); bubble(m.eid, `*${E.text}*`, true); return; }
      case 'chatstate': state = m; inEl.maxLength = m.max || CHAT.maxLen; if (m.muted) addLine('sys', `You're muted from chat until ${new Date(m.muted).toLocaleString()}.`, 'sys'); changed(); return;
      case 'chatsay': if (!m.ok) addLine('sys', esc(m.err), 'sys'); return;
      case 'modres': if (m.state) state = m.state; ctx.toast(m.ok ? m.note : m.err, m.ok ? 'good' : 'warn'); changed(); return;
      case 'contacts': contactList = m.l || []; fillContacts(); changed(); return;
      case 'inbox': for (const l of m.l || []) onMessage(l); return;
      default:
    }
  }
  function fillContacts() {
    toEl.innerHTML = contactList.map((c) => `<option value="${esc(c.id)}">${esc(c.n)}${c.crew ? ' (crew)' : ''}${c.on ? ' ●' : ''}</option>`).join('') || '<option value="">no contacts yet</option>';
  }
  function say(ch, text, to) { if (!text) return; ctx.send({ t: 'chat', ch, text: String(text).slice(0, state.max || CHAT.maxLen), to }); }
  function open(ch) {
    isOpen = true;
    root.classList.add('open'); root.classList.remove('faded');
    if (ch && CHANNELS.includes(ch)) chEl.value = ch;
    toEl.style.display = chEl.value === 'phone' ? '' : 'none';
    if (chEl.value === 'phone') ctx.send({ t: 'contacts' });
    if (ctx.focus) ctx.focus(true);
    inEl.focus();
  }
  function close() { isOpen = false; root.classList.remove('open'); inEl.blur(); if (ctx.focus) ctx.focus(false); fadeT = setTimeout(() => root.classList.add('faded'), 8000); }
  chEl.onchange = () => { toEl.style.display = chEl.value === 'phone' ? '' : 'none'; if (chEl.value === 'phone') ctx.send({ t: 'contacts' }); inEl.focus(); };
  emEl.onchange = () => { if (emEl.value) ctx.send({ t: 'emote', e: emEl.value }); emEl.value = ''; inEl.focus(); };
  inEl.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = inEl.value.trim();
    inEl.value = '';
    if (!text) { close(); return; }
    // /me <emote>, /c crew, /f faction
    const cmd = text.match(/^\/(\w+)\s*(.*)$/);
    if (cmd && Object.hasOwn(EMOTES, cmd[1])) { ctx.send({ t: 'emote', e: cmd[1] }); return; }
    if (cmd && (cmd[1] === 'c' || cmd[1] === 'f' || cmd[1] === 'n')) { say(cmd[1] === 'c' ? 'crew' : cmd[1] === 'f' ? 'faction' : 'near', cmd[2]); return; }
    say(chEl.value, text, chEl.value === 'phone' ? toEl.value : undefined);
  });
  inEl.addEventListener('keyup', (e) => e.stopPropagation());

  return {
    onMessage, open, close, say,
    emote(e) { ctx.send({ t: 'emote', e }); },
    setOff(ch, off) { ctx.send({ t: 'chatset', off: { [ch]: !!off } }); },
    contacts() { ctx.send({ t: 'contacts' }); },
    inbox() { ctx.send({ t: 'inbox' }); },
    mute(id) { ctx.send({ t: 'mod', a: 'mute', id }); }, unmute(id) { ctx.send({ t: 'mod', a: 'unmute', id }); },
    block(id) { ctx.send({ t: 'mod', a: 'block', id }); }, unblock(id) { ctx.send({ t: 'mod', a: 'unblock', id }); },
    report(id, why, note) { ctx.send({ t: 'mod', a: 'report', id, why: REPORT_WHY.includes(why) ? why : 'other', note }); },
    onChange(f) { listeners.push(f); },
    get state() { return state; }, get lines() { return lines; }, get contactList() { return contactList; }, get isOpen() { return isOpen; },
  };
}
