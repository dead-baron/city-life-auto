// Accounts on the page (the launch foundation; the server does the deciding: server/launch.js, authhttp.js). Loaded
// after the page is up (main.js launchCall), never at startup. What the UI's next stage wires into the title screen,
// settings and the phone:
//   boot(ctx)               the first-launch gate (17+ and the analytics choice), a sign-in coming back (#cla_login),
//                           then Google Analytics if it was accepted (client/analytics.js)
//   gateNeeded() / showGate(onDone) / gate() / setConsent('all' | 'essential')
//   launchInfo()            what the server has switched on (/launch.json: providers, passkeys, the GA id)
//   signIn(provider) (log in) · signIn(provider, { link: true }) (link to this account) · emailLink(email, { link })
//   passkeyRegister() (add one to this account) · passkeySignIn() · pad(inp) / padActive() (gamepad: main.js)
//   makeTransferCode() (asks the server: the code arrives in onMessage) · useTransferCode(code)
//   pickUsername(name) · signOutEverywhere() · claimOwner(code) · staffPage('log' | 'dashboard' | 'reviews')
//   onMessage(m)            the server's 'acct', 'admin' and 'agegate' messages
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
  if (!r.ok) throw new Error(j.err || `HTTP ${r.status}`);
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

// ---- the first-launch gate: 17+ and the analytics choice, kept in this browser ----
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
  const r = padMove(items.length, padIdx, inp);
  padIdx = r.idx;
  for (const e of m.querySelectorAll('.' + FOCUS_CSS)) e.classList.remove(FOCUS_CSS);
  const cur = items[padIdx];
  if (cur) { cur.classList.add(FOCUS_CSS); if (cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' }); }
  if (r.act === 'press' && cur) { if (cur.tagName === 'INPUT' && cur.type !== 'checkbox') cur.focus(); else cur.click(); }
  else if (r.act === 'back' && m.onback) m.onback();
  return true;
}
// into: a container of the page's own (the title screen's slot) - else a full-screen overlay
export function showGate(onDone, { into = null } = {}) {
  const g = gate() || {};
  const ov = el(`<div style="${into ? '' : css}" role="dialog" aria-modal="${into ? 'false' : 'true'}" data-cla-modal="1"><div style="${box}">
    <h2 style="margin:0 0 8px">Before you play</h2>
    <p>City Life Auto has mature themes: crime, violence, and online play with other people that isn't rated. Never share personal information in chat.</p>
    <label style="display:block;margin:10px 0"><input type="checkbox" id="g-age" ${g.age17 ? 'checked' : ''}> I'm 17 or older</label>
    <p style="margin:12px 0 4px">We'd like to use Google Analytics to see how people find and play the game. Essential only keeps it off.</p>
    <div><button id="g-all" style="${btn}">Accept</button><button id="g-ess" style="${btn2}">Essential only</button></div>
    <p id="g-msg" style="color:#ff8a80;min-height:1.2em;margin:8px 0 0"></p></div></div>`);
  (into || document.body).appendChild(ov);
  modals.push(ov); padIdx = 0;
  const go = (consent) => {
    if (!ov.querySelector('#g-age').checked) { ov.querySelector('#g-msg').textContent = 'You need to be 17 or older to play.'; return; }
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
// in your browser by someone else can't be finished by your page.
const PN_KEY = 'cla.pn', PREV_KEY = 'cla.token.prev';
function newPn() {
  const b = new Uint8Array(24); crypto.getRandomValues(b);
  const pn = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  ls.set(PN_KEY, pn);
  return pn;
}
export function signIn(provider, { link = false } = {}) {
  const ret = location.href.split('#')[0];
  location.href = `${httpBase()}/auth/${provider}/start?ret=${encodeURIComponent(ret)}&pn=${encodeURIComponent(newPn())}&mode=${link ? 'link' : 'login'}`;
}
export async function emailLink(email, { link = false } = {}) {
  const r = await fetch(httpBase() + '/auth/email/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, ret: location.href.split('#')[0], pn: newPn(), mode: link ? 'link' : 'login' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.err || 'Could not send the link.');
  return true;
}
// a new token for this page; the one it replaces kept as the previous one (Settings -> go back to it)
function takeToken(t) {
  const old = C.token();
  if (old && old !== t) ls.set(PREV_KEY, old);
  C.setToken(t);
}
const NAMES = { google: 'Google', discord: 'Discord', reddit: 'Reddit', email: 'Email link', passkey: 'Passkey' };
// A sign-in that came back (the hash): a login code swapped for its token; a link confirmed with this page's own token;
// an identity no account has yet: the choice. -> { reload } | { error } | { linked } | null
export async function consumeLoginHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const code = h.get('cla_login'), lc = h.get('cla_link'), err = h.get('cla_login_error');
  if (!code && !lc && !err) return null;
  history.replaceState(null, '', location.href.split('#')[0]);
  if (err) return { error: err };
  const pn = ls.get(PN_KEY) || '';
  try {
    if (code) { const j = await api('/auth/redeem', { code, pn }); takeToken(j.token); return { method: j.method, reload: true }; }
    const mode = h.get('m'), known = h.get('known') === '1', prov = NAMES[h.get('p')] || 'that sign-in';
    if (mode === 'link') {
      try { const j = await api('/auth/link-confirm', { code: lc, pn, action: 'link' }, { auth: true }); C.setToken(j.token); return { linked: prov }; }
      catch (e) { if (!known) throw e; }
      // (already on another account: signing into that one instead is offered, never done silently)
      const go = await choose(`${prov} is already linked to another account.`, [['login', `Sign in to that account`], ['cancel', 'Stay here']]);
      if (go !== 'login') return null;
      const j = await api('/auth/link-confirm', { code: lc, pn, action: 'login' });
      takeToken(j.token);
      return { reload: true };
    }
    const go = await choose(`No account uses this ${prov} sign-in yet.`, [['link', 'Link it to the character I’m playing (keeps its progress)'], ['new', 'Start a new account (this character stays on this device as your previous one)'], ['cancel', 'Cancel']]);
    if (go === 'cancel' || !go) return null;
    const j = await api('/auth/link-confirm', { code: lc, pn, action: go }, { auth: go === 'link' });
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
    if (m.a === 'name') { C.toast(m.ok ? `You're ${m.name} now.` : m.err, m.ok ? 'good' : 'warn'); return; }
    if (!m.a) { state = m; if (panel) renderPanel(); }
    return;
  }
  if (m.t === 'admin') { const r = pendingAdmin.get(m.a); if (r) { pendingAdmin.delete(m.a); r(m); } else if (!m.ok && m.err) C.toast(m.err, 'warn'); return; }
  if (m.t === 'agegate') { try { localStorage.removeItem(GATE_KEY); } catch { /* blocked */ } showGate(() => location.reload()); }
}

// ---- the minimal panel ----
function renderPanel() {
  const s = state || {}, pr = (info && info.providers) || s.providers || {};
  const linked = new Set(s.logins || []), on = Object.keys(NAMES).filter((p) => p !== 'passkey' && pr[p]);
  const inner = panel.querySelector('#a-body');
  inner.innerHTML = `
    <p><b>${esc(s.name || 'You')}</b> · ${s.guest ? 'guest (progress saved on this device)' : 'account'}${s.role ? ` · <b>${esc(s.role)}</b>` : ''}</p>
    ${on.length || passkeysWork() ? `<p style="margin:6px 0 2px">Sign in (an account you have, on any device):</p>
    <div>${on.map((p) => `<button data-in="${p}" style="${btn}">${NAMES[p]}</button>`).join('')}${passkeysWork() ? `<button id="a-pks" style="${btn}">Passkey</button>` : ''}</div>
    <p style="margin:10px 0 2px">Link to this account (${s.guest ? 'keeps this character’s progress on every device' : 'another way in'}):</p>
    <div>${on.map((p) => `<button data-link="${p}" style="${btn2}">${NAMES[p]}${linked.has(p) ? ' ✓' : ''}</button>`).join('')}${passkeysWork() ? `<button id="a-pk" style="${btn2}">${s.passkeys ? `Passkey (${s.passkeys}) - add one` : 'Add a passkey'}</button>` : ''}</div>
    <div id="a-email" style="display:none;margin-top:8px"><input id="a-em" type="email" placeholder="you@example.com" style="padding:7px;width:16em"> <button id="a-ems" style="${btn}">Send link</button></div>` : ''}
    ${s.canRename ? `<p style="margin:12px 0 2px">${s.guest ? 'Name' : 'Username'}${s.renameIn ? ` (next change in ${Math.ceil(s.renameIn / 86400e3)} days)` : ''}:</p><input id="a-name" maxlength="16" value="${esc(s.name || '')}" style="padding:7px"> <button id="a-namego" style="${btn}">Save</button>` : s.guest ? '<p style="margin:12px 0 2px">Sign in to pick a username.</p>' : ''}
    <p style="margin:12px 0 2px">Move to another device:</p><button id="a-xfer" style="${btn2}">Make a transfer code</button> <code id="a-code" style="font-size:18px;margin-left:6px"></code>
    <div style="margin-top:6px"><input id="a-xin" placeholder="ABCDE-FGHJK" style="padding:7px;width:9em;text-transform:uppercase"> <button id="a-xuse" style="${btn2}">Use a code</button></div>
    ${s.claim ? `<p style="margin:12px 0 2px">Claim ownership (the code in the server log):</p><input id="a-claim" style="padding:7px"> <button id="a-claimgo" style="${btn2}">Claim</button>` : ''}
    ${s.role ? `<p style="margin:12px 0 2px">Staff tools:</p>${s.role === 'owner' ? `<button data-page="dashboard" style="${btn2}">Dashboard</button><button data-page="log" style="${btn2}">Admin log</button>` : ''}${s.role !== 'helper' ? `<button data-page="reviews" style="${btn2}">Review list</button>` : ''}` : ''}
    <p id="a-msg" style="min-height:1.2em;margin:10px 0 0;color:#ffd27f"></p>`;
  const msg = (t) => { inner.querySelector('#a-msg').textContent = t; };
  const tryIt = (f) => async () => { try { const r = await f(); if (typeof r === 'string') msg(r); } catch (e) { msg(e.message || String(e)); } };
  let emailLinkMode = false;
  const pick = (p, link) => { if (p === 'email') { emailLinkMode = link; inner.querySelector('#a-email').style.display = 'block'; return; } signIn(p, { link }); };
  for (const b of inner.querySelectorAll('[data-in]')) b.onclick = () => pick(b.dataset.in, false);
  for (const b of inner.querySelectorAll('[data-link]')) b.onclick = () => pick(b.dataset.link, true);
  const onc = (id, f) => { const e = inner.querySelector(id); if (e) e.onclick = tryIt(f); };
  onc('#a-ems', async () => { await emailLink(inner.querySelector('#a-em').value, { link: emailLinkMode }); return 'Check your email for the sign-in link (open it in this browser).'; });
  onc('#a-pk', async () => { await passkeyRegister(); return 'Passkey added - sign in with it on this device any time.'; });
  onc('#a-pks', async () => { await passkeySignIn(); location.reload(); return 'Signed in.'; });
  onc('#a-namego', () => { pickUsername(inner.querySelector('#a-name').value); return 'Asked for it...'; });
  onc('#a-xfer', () => { makeTransferCode(); return 'Making a code...'; });
  onc('#a-xuse', async () => { await useTransferCode(inner.querySelector('#a-xin').value); location.reload(); return 'Moving...'; });
  onc('#a-claimgo', async () => { const r = await claimOwner(inner.querySelector('#a-claim').value); return r.ok ? 'You are the owner.' : r.err; });
  for (const b of inner.querySelectorAll('[data-page]')) b.onclick = tryIt(async () => { const r = await staffPage(b.dataset.page); return r.ok ? '' : r.err; });
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
