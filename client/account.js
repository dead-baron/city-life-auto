// Accounts on the page (the launch foundation; the server does the deciding: server/launch.js, authhttp.js). Loaded
// after the page is up (main.js launchCall), never at startup. What the UI's next stage wires into the title screen,
// settings and the phone:
//   boot(ctx)               the first-launch gate (13+ and the analytics choice), a sign-in coming back (#cla_login),
//                           then Google Analytics if it was accepted (client/analytics.js)
//   gateNeeded() / showGate(onDone) / gate() / setConsent('all' | 'essential')
//   launchInfo()            what the server has switched on (/launch.json: providers, passkeys, the GA id)
//   signIn(provider) (log in) · signIn(provider, { link: true }) (link to this account)
//   passwordSignIn(email, pw) · passwordSignUp({ email, password, confirm, news }) (asks: link or a new account) ·
//   forgotPassword(email)
//   passkeyRegister() (add one to this account) · passkeySignIn() · pad(inp) / padActive() (gamepad: main.js)
//   makeTransferCode() (asks the server: the code arrives in onMessage) · useTransferCode(code)
//   pickUsername(name) · signOutEverywhere() · claimOwner(code) · staffPage('log' | 'dashboard' | 'reviews' | 'bugs')
//   onMessage(m)            the server's 'acct', 'admin' and 'agegate' messages
//   newsBox(el) / legal(el) Settings > Account's "Game news by email" and Settings > Legal's two pages (main.js slots)
//   openPanel({ into })     a minimal working account panel, in a container of the page's or over everything (the
//                           polished screens come with UI stage 2); closePanel()
// Self-contained: no imports, browser APIs only, its own inline styles - it drops into the title screen's slot.
// ctx: { send(obj), token() -> string | null, setToken(token), serverUrl() -> 'wss://host/ws', toast(text, tone),
//        analytics: client/analytics.js module (optional) }
const GATE_KEY = 'cla.gate', DM_KEY = 'cla.dm', TOKEN_KEY = 'cla.token';
let C = null, info = null, state = null, panel = null, pendingAdmin = new Map(), adminSeq = 0;
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } } };

export function httpBase(wsUrl) {
  const u = new URL(wsUrl || (C && C.serverUrl()) || 'wss://play.deadbaron.com/ws');
  return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`;
}
async function api(path, body, { auth = false, method = 'POST' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth && C.token()) headers.authorization = `Bearer ${C.token()}`;
  const r = await fetch(httpBase() + path, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}), credentials: 'omit' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.err || `HTTP ${r.status}`); e.body = j; e.status = r.status; throw e; }
  return j;
}
export async function launchInfo() {
  if (info) return info;
  try { info = await api('/launch.json', null, { method: 'GET' }); } catch { info = { providers: {}, passkeys: false, ga: '' }; }
  return info;
}

// ---- the device marker (a soft one: a random id this browser keeps; a ban notes it) ----
export function deviceMarker() {
  let d = ls.get(DM_KEY);
  if (!d || !/^[a-f0-9]{32}$/.test(d)) {
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    d = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    ls.set(DM_KEY, d);
  }
  return d;
}

// ---- the first-launch gate: 13+ (under 18 with a parent's permission - the owner, 11-15; was 17+) and the analytics
// choice, kept in this browser. The field is still called age17 (stored in browsers and accounts): it means the age floor was confirmed ----
export function gate() { try { return JSON.parse(ls.get(GATE_KEY) || 'null'); } catch { return null; } }
export const gateNeeded = () => { const g = gate(); return !g || !g.age17 || !g.consent; };
export function setConsent(v) {
  const g = gate() || {};
  g.consent = v === 'all' ? 'all' : 'essential';
  g.at = Date.now();
  ls.set(GATE_KEY, JSON.stringify(g));
  if (C && C.analytics) C.analytics.consent(g.consent);
  return g.consent;
}
const css = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(8,9,12,.92);color:#eee;font:15px/1.45 system-ui,sans-serif';
const box = 'max-width:30em;margin:16px;padding:20px 22px;background:#1b1e24;border:1px solid #333;border-radius:10px';
const btn = 'margin:6px 6px 0 0;padding:9px 14px;border:0;border-radius:6px;font:inherit;cursor:pointer;background:#3a7bd5;color:#fff';
const btn2 = btn.replace('#3a7bd5', '#444');
function el(html) { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- the pad (the review, 11-04: the gate couldn't be answered with a gamepad - the page's own pad handling only knew
// the title's buttons, so A pressed PLAY underneath). While one of these is up, main.js hands it the pad (pad()) and
// leaves the title alone (padActive()): the D-pad or the stick moves between its controls, A presses (ticks a box,
// opens a text field), B backs out where that makes sense. The control with the pad's focus is outlined.
const modals = [];   // what's up, top last: the gate, the panel, a choice
function closeModal(m) { const i = modals.indexOf(m); if (i >= 0) modals.splice(i, 1); m.remove(); }
// a dialog the keyboard can use: focus starts on its first control, Tab and Shift+Tab go round inside it (Enter and Space
// press the focused button or tick the box - the browser's own; client/input.js leaves keys inside a dialog alone)
export function keyboardDialog(m) {
  const items = () => [...m.querySelectorAll('button, input, select, a[href]')].filter((e) => !e.disabled && e.offsetParent !== null);
  m.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && m.onback) { e.preventDefault(); m.onback(); return; }
    if (e.key !== 'Tab') return;
    const l = items();
    if (!l.length) return;
    const i = l.indexOf(document.activeElement);
    e.preventDefault();
    l[(i + (e.shiftKey ? -1 : 1) + l.length) % l.length].focus();
  });
  const first = items()[0];
  if (first && first.focus) first.focus();
}
const FOCUS_CSS = 'cla-pfocus';
let padIdx = 0, styled = false;
function padStyle() { if (styled || typeof document === 'undefined') return; styled = true; const st = document.createElement('style'); st.textContent = `.${FOCUS_CSS}{outline:3px solid #ffd27f !important;outline-offset:2px}`; document.head.appendChild(st); }
// the next focus for a pad press, among n controls: -> { idx, act: 'press' | 'back' | null }
export function padMove(n, idx, inp) {
  if (!n) return { idx: 0, act: inp.back ? 'back' : null };
  let i = Math.max(0, Math.min(n - 1, idx | 0));
  const step = inp.nav || inp.lr || 0;
  if (step) i = (i + step + n) % n;
  return { idx: i, act: inp.select ? 'press' : inp.back ? 'back' : null };
}
const topModal = () => { for (let i = modals.length - 1; i >= 0; i--) if (modals[i].isConnected) return modals[i]; else modals.splice(i, 1); return null; };
export const padActive = () => !!topModal();
export function pad(inp) {
  const m = topModal();
  if (!m) return false;
  padStyle();
  const items = [...m.querySelectorAll('button, input, select, a[href]')].filter((e) => !e.disabled && e.offsetParent !== null);
  const r = padMove(items.length, padIdx, inp), moved = r.idx !== padIdx || !!(inp.nav || inp.lr);
  padIdx = r.idx;
  const cur = items[padIdx];
  // (this runs every frame the panel is up: the ring and the scroll follow a pad press only - scrolled every frame, the
  // sheet snapped back to its focused control and a mouse wheel or a finger never reached the bottom; the owner, 11-14)
  if (moved || r.act) {
    for (const e of m.querySelectorAll('.' + FOCUS_CSS)) e.classList.remove(FOCUS_CSS);
    if (cur) { cur.classList.add(FOCUS_CSS); if (cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' }); }
  }
  if (r.act === 'press' && cur) { if (cur.tagName === 'INPUT' && cur.type !== 'checkbox') cur.focus(); else cur.click(); }
  else if (r.act === 'back' && m.onback) m.onback();
  return true;
}
// into: a container of the page's own (the title screen's slot) - else a full-screen overlay
export function showGate(onDone, { into = null } = {}) {
  const g = gate() || {};
  const ov = el(`<div style="${into ? '' : css}" role="dialog" aria-modal="${into ? 'false' : 'true'}" data-cla-modal="1"><div style="${box}">
    <h2 style="margin:0 0 8px">Before you play</h2>
    <p>City Life Auto has crime, shooting, cartoon blood and police chases, and online play and chat with other players who are strangers. Never share personal information in chat.</p>
    <label style="display:block;margin:10px 0"><input type="checkbox" id="g-age" ${g.age17 ? 'checked' : ''}> I'm 13 or older (under 18: with a parent or guardian's permission)</label>
    <p style="margin:12px 0 4px">We'd like to use Google Analytics to see how people find and play the game. Essential only keeps it off.</p>
    <div><button id="g-all" style="${btn}">Accept</button><button id="g-ess" style="${btn2}">Essential only</button></div>
    <p id="g-msg" style="color:#ff8a80;min-height:1.2em;margin:8px 0 0"></p></div></div>`);
  (into || document.body).appendChild(ov);
  modals.push(ov); padIdx = 0;
  keyboardDialog(ov);
  const go = (consent) => {
    if (!ov.querySelector('#g-age').checked) { ov.querySelector('#g-msg').textContent = 'You need to be 13 or older to play.'; return; }
    const v = { age17: g.age17 || Date.now(), consent, at: Date.now(), v: 1 };
    ls.set(GATE_KEY, JSON.stringify(v));
    closeModal(ov);
    if (C) C.send({ t: 'acct', a: 'age' });
    if (onDone) onDone(v);
  };
  ov.querySelector('#g-all').onclick = () => go('all');
  ov.querySelector('#g-ess').onclick = () => go('essential');
  return ov;
}

// ---- sign-ins ----
// Signing in and linking are two different buttons (the review, 11-04):
//   signIn(provider)            log in: an identity that's already on an account signs into it, wherever. One that no
//                               account has yet comes back to a choice (chooseLink): link it to the character on this
//                               page, or start a new account (the guest stays as it was: its token is kept as the
//                               previous one, Settings goes back to it).
//   signIn(provider, { link })  link it to the character on this page (Settings: "Link to this account").
// Each flow carries a nonce this page keeps to itself (localStorage cla.pn) and shows again to finish: a sign-in set off
// in your browser by someone else can't be finished by your page. Email + password (the owner, 11-12) works the same
// way: signing in logs into that account; making an account asks first - link it to this character, or start anew.
const PNS_KEY = 'cla.pns', PREV_KEY = 'cla.token.prev', PREVS_KEY = 'cla.prevs';
const PN_TTL_MS = 30 * 60e3, PN_MAX = 5, PREV_MAX = 3;
// the page's live nonces, newest first: one per flow started in the last half hour (Google pressed, then Discord: both
// still finish)
export function keepPn(list, pn, at) { return [{ pn, at }, ...(Array.isArray(list) ? list : []).filter((x) => x && x.pn !== pn && at - x.at < PN_TTL_MS)].slice(0, PN_MAX); }
const livePns = () => { try { return (JSON.parse(ls.get(PNS_KEY) || '[]') || []).filter((x) => Date.now() - x.at < PN_TTL_MS).map((x) => x.pn); } catch { return []; } };
function newPn() {
  const b = new Uint8Array(24); crypto.getRandomValues(b);
  const pn = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let list = [];
  try { list = JSON.parse(ls.get(PNS_KEY) || '[]'); } catch { list = []; }
  ls.set(PNS_KEY, JSON.stringify(keepPn(list, pn, Date.now())));
  return pn;
}
export function signIn(provider, { link = false } = {}) {
  const ret = location.href.split('#')[0];
  location.href = `${httpBase()}/auth/${provider}/start?ret=${encodeURIComponent(ret)}&pn=${encodeURIComponent(newPn())}&mode=${link ? 'link' : 'login'}`;
}
// email + password: -> { reload } (another account: this character kept as the previous one) | { same }
export async function passwordSignIn(email, password) {
  const j = await api('/auth/password/login', { email, password });
  if (state && j.pid === state.id) { C.setToken(j.token); return { same: true }; }
  takeToken(j.token);
  return { reload: true };
}
// a new email + password: linked to the character on this page, or a new account - the player picks (never merged
// silently) -> { linked } | { reload } | null (canceled)
export async function passwordSignUp({ email, password, confirm, news }) {
  const s = state || {}, opts = s.email ? [] : [['link', s.guest ? 'Link it to the character I’m playing (keeps its progress)' : 'Add it to this account (another way to sign in)']];
  const go = await choose(`Make ${email} a sign-in.`, [...opts, ['new', 'Start a new account (you can switch back to this character from Settings → Account)'], ['cancel', 'Cancel']]);
  if (go !== 'link' && go !== 'new') return null;
  const j = await api('/auth/password/signup', { email, password, confirm, news: news === true, action: go }, { auth: go === 'link' });
  if (go === 'link') { C.setToken(j.token); C.send({ t: 'acct', a: 'state' }); return { linked: true, verifySent: j.verifySent }; }
  takeToken(j.token);
  return { reload: true };
}
export async function forgotPassword(email) { const j = await api('/auth/password/forgot', { email }); return j.msg; }
// a new token for this page; the one it replaces kept as the previous one (Settings -> go back to it)
// The characters this page played before a sign-in or a code switched it (up to PREV_MAX, newest first, with their
// names): Settings -> Account -> "Switch back to <name>". The newest also goes in cla.token.prev, which main.js's
// own Settings button goes back to.
export function keepPrev(list, entry, max = PREV_MAX) {
  if (!entry || !entry.token) return Array.isArray(list) ? list.slice(0, max) : [];
  // (one entry per character: a sign-in gives the same account a new token - the owner, 11-14, saw "Switch back to" his
  // own character twice)
  const same = (x) => x.token === entry.token || (entry.pid && x.pid === entry.pid);
  return [entry, ...(Array.isArray(list) ? list : []).filter((x) => x && x.token && !same(x))].slice(0, max);
}
// (never the character played now: its token, its account id, or - entries kept before ids were - its name)
export function previousCharacters() {
  let list = [];
  try { list = JSON.parse(ls.get(PREVS_KEY) || '[]') || []; } catch { return []; }
  const tok = C && C.token(), id = state && state.id, name = state && state.name, seen = new Set();
  return list.filter((x) => {
    if (!x || !x.token || x.token === tok || (id && x.pid === id) || (!x.pid && name && x.name === name)) return false;
    const k = x.pid || `n:${x.name}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}
function takeToken(t) {
  const old = C.token();
  if (old && old !== t) {
    let list = [];
    try { list = JSON.parse(ls.get(PREVS_KEY) || '[]'); } catch { list = []; }
    ls.set(PREVS_KEY, JSON.stringify(keepPrev(list, { token: old, pid: (state && state.id) || undefined, name: (state && state.name) || 'your previous character', at: Date.now() })));
    ls.set(PREV_KEY, old);
  }
  C.setToken(t);
}
// Sign out (the owner, 11-15: "an option to sign out or switch accounts"): this page forgets the account - kept in the
// list above, so "Switch back to" or signing in again brings it back - and starts again as a new guest
export function signOutHere() {
  const old = C.token();
  if (old) {
    let list = [];
    try { list = JSON.parse(ls.get(PREVS_KEY) || '[]'); } catch { list = []; }
    ls.set(PREVS_KEY, JSON.stringify(keepPrev(list, { token: old, pid: (state && state.id) || undefined, name: (state && state.name) || 'your account', at: Date.now() })));
    ls.set(PREV_KEY, old);
  }
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
  location.reload();
}
// back to one of them (the one played now joins the list in its place)
export function switchBack(i) {
  const p = previousCharacters()[i | 0];
  if (!p) return false;
  takeToken(p.token);
  location.reload();
  return true;
}
const NAMES = { google: 'Google', discord: 'Discord', password: 'Email', passkey: 'Passkey' };
// A sign-in that came back (the hash): a login code swapped for its token; a link confirmed with this page's own token;
// an identity no account has yet: the choice. -> { reload } | { error } | { linked } | null
export async function consumeLoginHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const code = h.get('cla_login'), lc = h.get('cla_link'), err = h.get('cla_login_error');
  if (!code && !lc && !err) return null;
  history.replaceState(null, '', location.href.split('#')[0]);
  if (err) return { error: err };
  const pns = livePns(), pn = pns[0] || '';
  try {
    if (code) {
      const j = await api('/auth/redeem', { code, pns });
      takeToken(j.token);
      return { method: j.method, reload: true };
    }
    const mode = h.get('m'), known = h.get('known') === '1', prov = NAMES[h.get('p')] || 'that sign-in';
    if (mode === 'link') {
      try { const j = await api('/auth/link-confirm', { code: lc, pns, action: 'link' }, { auth: true }); C.setToken(j.token); return { linked: prov }; }
      catch (e) { if (!known) throw e; }
      // (already on another account: signing into that one instead is offered, never done silently)
      const go = await choose(`${prov} is already linked to another account.`, [['login', `Sign in to that account`], ['cancel', 'Stay here']]);
      if (go !== 'login') return null;
      const j = await api('/auth/link-confirm', { code: lc, pns, action: 'login' });
      takeToken(j.token);
      return { reload: true };
    }
    const go = await choose(`No account uses this ${prov} sign-in yet.`, [['link', 'Link it to the character I’m playing (keeps its progress)'], ['new', 'Start a new account (you can switch back to this character from Settings → Account)'], ['cancel', 'Cancel']]);
    if (go === 'cancel' || !go) return null;
    const j = await api('/auth/link-confirm', { code: lc, pns, action: go }, { auth: go === 'link' });
    if (go === 'link') { C.setToken(j.token); return { linked: prov }; }
    takeToken(j.token);
    return { reload: true };
  } catch (e) { return { error: e.message }; }
}
// a small choice over everything: -> the picked key
function choose(text, opts) {
  return new Promise((resolve) => {
    const ov = el(`<div style="${css}" role="dialog" aria-modal="true" data-cla-modal="1"><div style="${box}"><p>${esc(text)}</p>${opts.map(([k, t], i) => `<div><button data-k="${esc(k)}" style="${i ? btn2 : btn};width:100%;text-align:left">${esc(t)}</button></div>`).join('')}</div></div>`);
    document.body.appendChild(ov);
    modals.push(ov);
    keyboardDialog(ov);
    for (const b of ov.querySelectorAll('[data-k]')) b.onclick = () => { closeModal(ov); resolve(b.dataset.k); };
    ov.dataset.back = 'cancel';
    ov.onback = () => { closeModal(ov); resolve('cancel'); };
  });
}

// ---- passkeys (WebAuthn) ----
const b2u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const u2b = (s) => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return b.buffer; };
export const passkeysWork = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;
export async function passkeyRegister(name = 'This device') {
  if (!passkeysWork()) throw new Error('This browser doesn\'t do passkeys.');
  const o = await api('/auth/passkey/register/options', {}, { auth: true });
  const cred = await navigator.credentials.create({ publicKey: { ...o, challenge: u2b(o.challenge), user: { ...o.user, id: u2b(o.user.id) }, excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: u2b(c.id) })) } });
  const r = cred.response;
  await api('/auth/passkey/register/verify', { id: cred.id, rawId: b2u(cred.rawId), type: cred.type, name, response: { clientDataJSON: b2u(r.clientDataJSON), attestationObject: b2u(r.attestationObject) } }, { auth: true });
  return true;
}
export async function passkeySignIn() {   // (a passkey signs into its own account: this page's character kept as the previous one)
  if (!passkeysWork()) throw new Error('This browser doesn\'t do passkeys.');
  const o = await api('/auth/passkey/login/options', {});
  const cred = await navigator.credentials.get({ publicKey: { challenge: u2b(o.challenge), rpId: o.rpId, userVerification: o.userVerification, timeout: o.timeout, allowCredentials: [] } });
  const r = cred.response;
  const j = await api('/auth/passkey/login/verify', { id: cred.id, rawId: b2u(cred.rawId), type: cred.type, response: { clientDataJSON: b2u(r.clientDataJSON), authenticatorData: b2u(r.authenticatorData), signature: b2u(r.signature), userHandle: r.userHandle ? b2u(r.userHandle) : null } });
  takeToken(j.token);
  return j;
}

// ---- transfer codes, usernames, sign-out, staff ----
export function makeTransferCode() { C.send({ t: 'acct', a: 'transfer' }); }
export async function useTransferCode(code) { const j = await api('/auth/transfer', { code: String(code || '').trim() }); takeToken(j.token); return j; }
export function pickUsername(name) { C.send({ t: 'acct', a: 'name', name }); }
export async function signOutEverywhere() { const j = await api('/auth/signout-all', {}, { auth: true }); C.setToken(j.token); return true; }
export function admin(a, args = {}) {
  return new Promise((resolve) => { const k = ++adminSeq; pendingAdmin.set(a, resolve); C.send({ t: 'admin', a, ...args, k }); setTimeout(() => { if (pendingAdmin.get(a) === resolve) { pendingAdmin.delete(a); resolve({ ok: false, err: 'No answer.' }); } }, 8000); });
}
export const claimOwner = (code) => admin('claim', { code });
export async function staffPage(page) { const r = await admin('pagelink', { page }); if (r.ok && r.data && r.data.url) window.open(r.data.url, '_blank', 'noopener'); return r; }
export const accountState = () => state;

export function onMessage(m) {
  if (m.t === 'acct') {
    if (m.a === 'transfer') { C.toast(`Your transfer code: ${m.code} - enter it on your other device within 10 minutes. It works once.`, 'info'); if (panel) panel.querySelector('#a-code').textContent = m.code; return; }
    if (m.a === 'name') { const t = m.ok ? `You're ${m.name} now.` : m.err; C.toast(t, m.ok ? 'good' : 'warn'); const e = panel && panel.querySelector('#a-msg'); if (e) e.textContent = t; return; }
    if (m.a === 'news') { if (!m.ok) C.toast(m.err, 'warn'); return; }
    if (!m.a) { state = m; if (panel) renderPanel(); if (newsEl) renderNews(); if (C && C.analytics && C.analytics.props) C.analytics.props({ player_type: m.guest ? 'guest' : 'account' }); }   // (GA's Player type: guest or signed in)
    return;
  }
  if (m.t === 'admin') { const r = pendingAdmin.get(m.a); if (r) { pendingAdmin.delete(m.a); r(m); } else if (!m.ok && m.err) C.toast(m.err, 'warn'); return; }
  if (m.t === 'agegate') { try { localStorage.removeItem(GATE_KEY); } catch { /* blocked */ } showGate(() => location.reload()); }
}

// ---- the minimal panel ----
// (email + password first - it needs no third party - then Google, Discord, a passkey; the forms are real forms, so the
// browser's password manager fills and saves them)
const inp = 'display:block;width:100%;box-sizing:border-box;margin:4px 0 8px;padding:9px;font:inherit;font-size:16px;background:#111318;color:#fff;border:1px solid #3a3f49;border-radius:6px';
const tab = (on) => `flex:1;padding:8px;border:0;border-bottom:2px solid ${on ? '#ffd27f' : 'transparent'};background:none;color:${on ? '#ffd27f' : '#aab'};font:inherit;font-weight:700;cursor:pointer`;
const linkBtn = 'border:0;background:none;color:#8cc8ff;font:inherit;font-size:14px;padding:4px 0;cursor:pointer;text-decoration:underline';
let pwTab = 'in';
// Google's sign-in button as its branding guidelines draw it (the dark theme: the four-colour G, "Continue with
// Google"); Discord's blurple. The owner, 11-14: "should have like a google looking symbol ... just saying Google
// doesn't seem legit"
const G_SVG = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" style="flex:none"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const PROV = {
  google: { cls: 'a-pg', icon: G_SVG, style: 'background:#131314;color:#e3e3e3;border:1px solid #8e918f;font-family:Roboto,Arial,sans-serif' },
  discord: { cls: 'a-pd', icon: '', style: 'background:#5865f2;color:#fff;border:1px solid #5865f2' },
};
const provBase = 'display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin:6px 0 0;padding:10px 12px;border-radius:6px;font:inherit;font-weight:600;cursor:pointer';
const provBtn = (p, attr, label) => `<button ${attr} class="a-prov ${(PROV[p] || {}).cls || ''}" style="${provBase};${(PROV[p] || {}).style || ''}">${(PROV[p] || {}).icon || ''}<span>${label}</span></button>`;
let outAsk = false, delAsk = false, prevOpen = false;
function renderPanel() {
  const s = state || {}, pr = (info && info.providers) || s.providers || {};
  const linked = new Set(s.logins || []), on = Object.keys(NAMES).filter((p) => p !== 'passkey' && p !== 'password' && pr[p]);
  const pwOn = !!pr.password, min = (info && info.password && info.password.min) || 10;
  const inner = panel.querySelector('#a-body'), prevs = previousCharacters();
  const legalUrl = (k) => `${httpBase()}/legal/${k}`;
  inner.innerHTML = `
    <p><b>${esc(s.name || 'You')}</b> · ${s.guest ? 'guest (progress saved on this device)' : `signed in${linked.size ? ` with ${[...linked].map((p) => NAMES[p] || p).join(', ')}` : ''}`}${s.role ? ` · <b>${esc(s.role)}</b>` : ''}${s.email ? ` · email${s.verified ? ' ✓' : ' (not confirmed yet)'}` : ''}</p>
    ${s.guest ? '' : `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 6px"><button type="button" id="a-out" style="${btn2}">${outAsk ? 'Sure? Sign out' : 'Sign out'}</button></div>
    <p style="font-size:13px;color:#9aa0aa;margin:0 0 4px">${outAsk ? 'This device starts again as a new guest. Your account stays safe: sign in again any time.' : 'Your progress is saved to your account, on any device you sign in on.'}</p>
    <p style="margin:14px 0 2px">Switch account:</p>`}
    ${on.length || passkeysWork() ? `<div class="a-provs">${on.map((p) => provBtn(p, `data-in="${p}"`, `Continue with ${NAMES[p]}`)).join('')}${passkeysWork() ? `<button id="a-pks" class="a-prov" style="${provBase};${btn2}">Sign in with a passkey</button>` : ''}</div>
    ${pwOn ? '<p class="a-or" style="text-align:center;color:#9aa0aa;margin:12px 0 4px">or use your email</p>' : ''}` : ''}
    ${pwOn ? `<div style="display:flex;margin:4px 0 8px;border-bottom:1px solid #333"><button type="button" data-tab="in" aria-selected="${pwTab === 'in'}" style="${tab(pwTab === 'in')}">Sign in</button><button type="button" data-tab="up" aria-selected="${pwTab === 'up'}" style="${tab(pwTab === 'up')}">Create account</button></div>
    <form id="a-fin" ${pwTab === 'in' ? '' : 'hidden'} autocomplete="on">
      <label>Email<input id="a-ine" name="email" type="email" autocomplete="username" inputmode="email" required style="${inp}"></label>
      <label>Password<input id="a-inp" name="password" type="password" autocomplete="current-password" required style="${inp}"></label>
      <button id="a-ingo" style="${btn};width:100%;margin:2px 0 0">Sign in</button>
      <button type="button" id="a-forgot" class="a-link" style="${linkBtn}">Forgot password?</button>
    </form>
    <form id="a-fup" ${pwTab === 'up' ? '' : 'hidden'} autocomplete="on">
      <label>Email<input id="a-upe" name="email" type="email" autocomplete="username" inputmode="email" required style="${inp}"></label>
      <label>Password <small style="color:#9aa0aa">(at least ${min} characters - a few words together work well)</small><input id="a-upp" name="new-password" type="password" autocomplete="new-password" minlength="${min}" required style="${inp}"></label>
      <label>The same again<input id="a-upc" type="password" autocomplete="new-password" minlength="${min}" required style="${inp}"></label>
      <label style="display:flex;gap:8px;align-items:center;margin:2px 0 8px"><input id="a-news" type="checkbox"> Email me game news and updates</label>
      <button id="a-upgo" style="${btn};width:100%;margin:2px 0 0">Create account</button>
      <p style="font-size:13px;color:#9aa0aa;margin:6px 0 0">Making an account means you accept the <a href="${legalUrl('terms')}" target="_blank" rel="noopener" style="color:#8cc8ff">Terms</a>; the <a href="${legalUrl('privacy')}" target="_blank" rel="noopener" style="color:#8cc8ff">Privacy Policy</a> says what's kept.</p>
    </form>` : ''}
    ${on.length || passkeysWork() ? `<p style="margin:14px 0 2px">Link to this account (${s.guest ? 'keeps this character’s progress on every device' : 'another way in'}):</p>
    <div class="a-links">${on.map((p) => `<button data-link="${p}" class="a-linkb" style="${btn2};display:inline-flex;align-items:center;gap:8px">${(PROV[p] || {}).icon || ''}${linked.has(p) ? `${NAMES[p]} linked ✓` : `Link ${NAMES[p]}`}</button>`).join('')}${passkeysWork() ? `<button id="a-pk" style="${btn2}">${s.passkeys ? `Passkey (${s.passkeys}) - add one` : 'Add a passkey'}</button>` : ''}</div>` : ''}
    ${pwOn && !s.email ? `<p style="font-size:13px;color:#9aa0aa;margin:4px 0 0">Email and password: Create account asks whether to link it to ${s.guest ? 'this character' : 'this account'}.</p>` : ''}
    ${s.canRename ? `<p style="margin:12px 0 2px">${s.guest ? 'Name' : 'Username'}${s.renameIn ? ` (next change in ${Math.ceil(s.renameIn / 86400e3)} days)` : ''}${s.guest ? ' <small style="color:#9aa0aa">(sign in to keep it yours)</small>' : ''}:</p><input id="a-name" maxlength="16" value="${esc(s.name || '')}" style="padding:7px"> <button id="a-namego" style="${btn}">Save</button>` : ''}
    ${prevs.length ? `<p style="margin:12px 0 2px"><button type="button" id="a-prevs" style="${btn2}">Other characters on this device (${prevs.length}) ${prevOpen ? '▴' : '▾'}</button></p>
    ${prevOpen ? `<p style="font-size:13px;color:#9aa0aa;margin:4px 0">Characters this device played before you signed in or used a code.</p>${prevs.map((p, i) => `<div><button data-back="${i}" style="${btn2}">Switch back to ${esc(p.name === 'your previous character' || p.name === 'your account' ? 'an earlier character' : p.name)}</button></div>`).join('')}` : ''}` : ''}
    <p style="margin:12px 0 2px">Move to another device:</p><button id="a-xfer" style="${btn2}">Make a transfer code</button> <code id="a-code" style="font-size:18px;margin-left:6px"></code>
    <div style="margin-top:6px"><input id="a-xin" placeholder="ABCDE-FGHJK" style="padding:7px;width:9em;text-transform:uppercase"> <button id="a-xuse" style="${btn2}">Use a code</button></div>
    ${s.claim ? `<p style="margin:12px 0 2px">Claim ownership (the code in the server log):</p><input id="a-claim" style="padding:7px"> <button id="a-claimgo" style="${btn2}">Claim</button>` : ''}
    ${s.role ? `<p style="margin:12px 0 2px">Staff tools:</p><button data-page="players" style="${btn2}">Players</button>${s.role === 'owner' ? `<button data-page="dashboard" style="${btn2}">Dashboard</button><button data-page="log" style="${btn2}">Admin log</button><button data-page="news" style="${btn2}">News list</button>` : ''}${s.role !== 'helper' ? `<button data-page="reviews" style="${btn2}">Review list</button><button data-page="bugs" style="${btn2}">Bug reports</button>` : ''}` : ''}
    ${s.id ? `<p style="margin:12px 0 0;font-size:14px;color:#9aa0aa">Account id: <code id="a-id" style="user-select:all">${esc(s.id)}</code> <button type="button" id="a-idcopy" class="a-link" style="${linkBtn}">Copy</button></p>` : ''}
    ${s.deleteDays ? `<p style="margin:14px 0 2px">Delete account:</p><button type="button" id="a-del" style="${btn2}${delAsk ? ';color:#ff8a80;border-color:#ff8a80' : ''}">${delAsk ? 'Sure? Delete my account' : 'Delete account'}</button>
    ${delAsk ? `<p style="font-size:13px;color:#9aa0aa;margin:4px 0 0">Your account and character leave the game now. For ${s.deleteDays} days you can change your mind: open the game and press RESTORE. After that they're erased for good.</p>` : ''}` : ''}
    <p id="a-msg" style="min-height:1.2em;margin:10px 0 0;color:#ffd27f"></p>`;
  const msg = (t) => { inner.querySelector('#a-msg').textContent = t; };
  const tryIt = (f) => async () => { try { const r = await f(); if (typeof r === 'string') msg(r); } catch (e) { msg(e.message || String(e)); } };
  const pick = (p, link) => signIn(p, { link });
  for (const b of inner.querySelectorAll('[data-in]')) b.onclick = () => pick(b.dataset.in, false);
  for (const b of inner.querySelectorAll('[data-link]')) b.onclick = () => pick(b.dataset.link, true);
  for (const b of inner.querySelectorAll('[data-tab]')) b.onclick = () => { pwTab = b.dataset.tab; renderPanel(); const f = inner.querySelector(pwTab === 'in' ? '#a-ine' : '#a-upe'); if (f) f.focus(); };
  const val = (id) => { const e = inner.querySelector(id); return e ? e.value : ''; };
  const form = (id, f) => { const e = inner.querySelector(id); if (e) e.onsubmit = (ev) => { ev.preventDefault(); tryIt(f)(); }; };
  form('#a-fin', async () => {
    msg('Signing in...');
    const r = await passwordSignIn(val('#a-ine'), val('#a-inp'));
    if (r.reload) { location.reload(); return 'Signed in.'; }
    return 'You\'re signed in to this account already.';
  });
  form('#a-fup', async () => {
    const pw = val('#a-upp');
    if (pw.length < min) return `A password is at least ${min} characters.`;
    if (pw !== val('#a-upc')) return 'The two passwords don\'t match.';
    const r = await passwordSignUp({ email: val('#a-upe'), password: pw, confirm: val('#a-upc'), news: !!(inner.querySelector('#a-news') || {}).checked });
    if (!r) return '';
    if (r.reload) { location.reload(); return 'Account made.'; }
    return `Linked - this character signs in with your email now.${r.verifySent ? ' Check your inbox to confirm the address.' : ''}`;
  });
  const onc = (id, f) => { const e = inner.querySelector(id); if (e) e.onclick = tryIt(f); };
  onc('#a-forgot', async () => {
    if (!(info && info.resets)) return 'Password resets aren\'t available yet - they come with the launch.';
    const e = val('#a-ine').trim();
    if (!e) return 'Type your email above, then press Forgot password again.';
    return forgotPassword(e);
  });
  onc('#a-pk', async () => { await passkeyRegister(); return 'Passkey added - sign in with it on this device any time.'; });
  onc('#a-pks', async () => { await passkeySignIn(); location.reload(); return 'Signed in.'; });
  onc('#a-idcopy', async () => { try { await navigator.clipboard.writeText(s.id); return 'Account id copied.'; } catch { return 'Select the id and copy it.'; } });
  onc('#a-namego', () => { pickUsername(inner.querySelector('#a-name').value); return 'Asked for it...'; });
  onc('#a-xfer', () => { makeTransferCode(); return 'Making a code...'; });
  onc('#a-xuse', async () => { await useTransferCode(inner.querySelector('#a-xin').value); location.reload(); return 'Moving...'; });
  onc('#a-claimgo', async () => { const r = await claimOwner(inner.querySelector('#a-claim').value); return r.ok ? 'You are the owner.' : r.err; });
  for (const b of inner.querySelectorAll('[data-back]')) b.onclick = () => switchBack(Number(b.dataset.back));
  const pv = inner.querySelector('#a-prevs');   // (one button, the list behind it - the owner, 11-15: "we don't need so many options here")
  if (pv) pv.onclick = () => { prevOpen = !prevOpen; renderPanel(); };
  const out = inner.querySelector('#a-out');
  if (out) out.onclick = () => { if (outAsk) { outAsk = false; signOutHere(); } else { outAsk = true; renderPanel(); } };   // (two taps: the first says what happens)
  // Delete account (the owner, 11-15: players delete their own; kept deleteDays for RESTORE - server/accounts.js): two taps
  const del = inner.querySelector('#a-del');
  if (del) del.onclick = () => { if (!delAsk) { delAsk = true; renderPanel(); return; } delAsk = false; if (C) C.send({ t: 'delacct' }); msg('Deleting...'); };
  for (const b of inner.querySelectorAll('[data-page]')) b.onclick = tryIt(async () => { const r = await staffPage(b.dataset.page); return r.ok ? '' : r.err; });
}

// ---- Settings > Account: game news by email (the owner, 11-12: opt-in, off until asked; Google and Discord are asked
// for no address - the player types one here). The server keeps the address on the news list only. ----
let newsEl = null, newsAsk = false;
export function newsBox(el) { newsEl = el; renderNews(); }
function renderNews() {
  const el = newsEl, s = state;
  if (!el || !el.isConnected) return;
  if (!s) { el.innerHTML = ''; return; }
  if (s.guest) { el.innerHTML = '<p class="msub">Game news by email: sign in first, then turn it on here.</p>'; return; }
  el.innerHTML = s.news
    ? `<p class="msub">Game news by email: <b>on</b> (${esc(s.news)})</p><button class="sbtn" id="s-news-off">Turn game news off</button>`
    : newsAsk
      ? `<p class="msub">Game news by email - where to? (Only for news; unsubscribe any time.)</p><div class="m-opts devpw-row"><input id="s-news-in" type="email" placeholder="you@example.com" autocomplete="email" spellcheck="false"><button class="btn" id="s-news-go">Turn on</button></div>`
      : '<p class="msub">Game news by email: <b>off</b></p><button class="sbtn" id="s-news-on">Turn game news on</button>';
  const q = (id) => el.querySelector(id);
  if (q('#s-news-off')) q('#s-news-off').onclick = () => C.send({ t: 'acct', a: 'news', on: false });
  if (q('#s-news-on')) q('#s-news-on').onclick = () => { newsAsk = true; renderNews(); const i = q('#s-news-in'); if (i) i.focus(); };
  if (q('#s-news-go')) q('#s-news-go').onclick = () => { newsAsk = false; C.send({ t: 'acct', a: 'news', on: true, email: q('#s-news-in').value }); };
}
// Settings > Legal: the drafts of the terms and the privacy policy, on the game server (server/legal.js)
export function legal(el) {
  for (const b of el.querySelectorAll('[data-legal]')) { b.disabled = false; b.onclick = () => window.open(`${httpBase()}/legal/${b.dataset.legal}`, '_blank', 'noopener'); }
}
export async function openPanel({ into = null } = {}) {
  await launchInfo();
  if (panel) panel.remove();
  panel = into
    ? el('<div class="cla-account"><div id="a-body"></div></div>')
    : el(`<div style="${css}"><div style="${box};max-height:90vh;overflow:auto"><div style="display:flex;justify-content:space-between"><h2 style="margin:0">Account</h2><button id="a-x" style="${btn2}">Close</button></div><div id="a-body"></div></div></div>`);
  (into || document.body).appendChild(panel);
  panel.dataset.claModal = '1';
  modals.push(panel); padIdx = 0;
  panel.onback = closePanel;
  if (!into) panel.querySelector('#a-x').onclick = closePanel;
  C.send({ t: 'acct', a: 'state' });
  renderPanel();
  keyboardDialog(panel);
  // (a mouse and keyboard: straight into the email; a phone keeps its keyboard down until a field is tapped)
  const em = panel.querySelector('#a-ine');
  if (em && window.matchMedia && matchMedia('(pointer: fine)').matches) em.focus();
  return panel;
}
export function closePanel() { if (panel) { closeModal(panel); panel = null; } }

// ctx.gateInto: where the gate goes (the title screen's slot) - else over everything; ctx.noGate: the page shows it itself
export async function boot(ctx) {
  C = ctx;
  const back = await consumeLoginHash();
  if (back && back.error) C.toast(`Sign-in: ${back.error}`, 'warn');
  else if (back && back.reload) { location.reload(); return; }
  else if (back && back.linked) C.toast(`${back.linked} is linked to this account - your progress is saved to it.`, 'good');
  const start = () => { const g = gate(); if (g && C.analytics) C.analytics.consent(g.consent); };
  if (gateNeeded() && !C.noGate) showGate(start, { into: C.gateInto || null }); else start();
  launchInfo();
}
export { TOKEN_KEY };
