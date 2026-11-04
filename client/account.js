// Accounts on the page (the launch foundation; the server does the deciding: server/launch.js, authhttp.js). Loaded
// after the page is up (main.js launchCall), never at startup. What the UI's next stage wires into the title screen,
// settings and the phone:
//   boot(ctx)               the first-launch gate (17+ and the analytics choice), a sign-in coming back (#cla_login),
//                           then Google Analytics if it was accepted (client/analytics.js)
//   gateNeeded() / showGate(onDone) / gate() / setConsent('all' | 'essential')
//   launchInfo()            what the server has switched on (/launch.json: providers, passkeys, the GA id)
//   signIn(provider, { link }) · emailLink(email, { link }) · passkeyRegister() · passkeySignIn()
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
// into: a container of the page's own (the title screen's slot) - else a full-screen overlay
export function showGate(onDone, { into = null } = {}) {
  const g = gate() || {};
  const ov = el(`<div style="${into ? '' : css}" role="dialog" aria-modal="${into ? 'false' : 'true'}"><div style="${box}">
    <h2 style="margin:0 0 8px">Before you play</h2>
    <p>City Life Auto has mature themes: crime, violence, and online play with other people that isn't rated. Never share personal information in chat.</p>
    <label style="display:block;margin:10px 0"><input type="checkbox" id="g-age" ${g.age17 ? 'checked' : ''}> I'm 17 or older</label>
    <p style="margin:12px 0 4px">We'd like to use Google Analytics to see how people find and play the game. Essential only keeps it off.</p>
    <div><button id="g-all" style="${btn}">Accept</button><button id="g-ess" style="${btn2}">Essential only</button></div>
    <p id="g-msg" style="color:#ff8a80;min-height:1.2em;margin:8px 0 0"></p></div></div>`);
  (into || document.body).appendChild(ov);
  const go = (consent) => {
    if (!ov.querySelector('#g-age').checked) { ov.querySelector('#g-msg').textContent = 'You need to be 17 or older to play.'; return; }
    const v = { age17: g.age17 || Date.now(), consent, at: Date.now(), v: 1 };
    ls.set(GATE_KEY, JSON.stringify(v));
    ov.remove();
    if (C) C.send({ t: 'acct', a: 'age' });
    if (onDone) onDone(v);
  };
  ov.querySelector('#g-all').onclick = () => go('all');
  ov.querySelector('#g-ess').onclick = () => go('essential');
  return ov;
}

// ---- sign-ins ----
async function linkTicket() { if (!C.token()) return null; try { return (await api('/auth/link-ticket', {}, { auth: true })).ticket; } catch { return null; } }
// to the provider and back (#cla_login=<code>); link: add it to the account playing on this page (keeps its progress)
export async function signIn(provider, { link = true } = {}) {
  const ret = location.href.split('#')[0];
  const t = link ? await linkTicket() : null;
  location.href = `${httpBase()}/auth/${provider}/start?ret=${encodeURIComponent(ret)}${t ? `&link=${encodeURIComponent(t)}` : ''}`;
}
export async function emailLink(email, { link = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (link && C.token()) headers.authorization = `Bearer ${C.token()}`;
  const r = await fetch(httpBase() + '/auth/email/start', { method: 'POST', headers, body: JSON.stringify({ email, ret: location.href.split('#')[0], link: !!link }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.err || 'Could not send the link.');
  return true;
}
// a sign-in that came back: swap the one-time code for the token, then reload into it
export async function consumeLoginHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const code = h.get('cla_login'), err = h.get('cla_login_error');
  if (!code && !err) return null;
  history.replaceState(null, '', location.href.split('#')[0]);
  if (err) return { error: err };
  try {
    const j = await api('/auth/redeem', { code });
    C.setToken(j.token);
    return { token: j.token, method: j.method, created: j.created, linked: j.linked, reload: !j.linked };
  } catch (e) { return { error: e.message }; }
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
export async function passkeySignIn() {
  if (!passkeysWork()) throw new Error('This browser doesn\'t do passkeys.');
  const o = await api('/auth/passkey/login/options', {});
  const cred = await navigator.credentials.get({ publicKey: { challenge: u2b(o.challenge), rpId: o.rpId, userVerification: o.userVerification, timeout: o.timeout, allowCredentials: [] } });
  const r = cred.response;
  const j = await api('/auth/passkey/login/verify', { id: cred.id, rawId: b2u(cred.rawId), type: cred.type, response: { clientDataJSON: b2u(r.clientDataJSON), authenticatorData: b2u(r.authenticatorData), signature: b2u(r.signature), userHandle: r.userHandle ? b2u(r.userHandle) : null } });
  C.setToken(j.token);
  return j;
}

// ---- transfer codes, usernames, sign-out, staff ----
export function makeTransferCode() { C.send({ t: 'acct', a: 'transfer' }); }
export async function useTransferCode(code) { const j = await api('/auth/transfer', { code: String(code || '').trim() }); C.setToken(j.token); return j; }
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
const NAMES = { google: 'Google', discord: 'Discord', reddit: 'Reddit', email: 'Email link' };
function renderPanel() {
  const s = state || {}, pr = (info && info.providers) || s.providers || {};
  const linked = new Set(s.logins || []);
  const inner = panel.querySelector('#a-body');
  inner.innerHTML = `
    <p><b>${s.name || 'You'}</b> · ${s.guest ? 'guest (progress saved on this device)' : 'account'}${s.role ? ` · <b>${s.role}</b>` : ''}</p>
    <p style="margin:6px 0 2px">${s.guest ? 'Sign in to keep your progress on every device and pick a username:' : 'Sign-ins on this account:'}</p>
    <div>${Object.keys(NAMES).filter((p) => pr[p]).map((p) => `<button data-p="${p}" style="${linked.has(p) ? btn2 : btn}">${NAMES[p]}${linked.has(p) ? ' ✓' : ''}</button>`).join('')}
      ${passkeysWork() ? `<button id="a-pk" style="${btn}">${s.passkeys ? `Passkeys (${s.passkeys}) - add one` : 'Add a passkey'}</button><button id="a-pks" style="${btn2}">Sign in with a passkey</button>` : ''}</div>
    <div id="a-email" style="display:none;margin-top:8px"><input id="a-em" type="email" placeholder="you@example.com" style="padding:7px;width:16em"> <button id="a-ems" style="${btn}">Send link</button></div>
    ${s.guest ? '' : `<p style="margin:12px 0 2px">Username${s.renameIn ? ` (next change in ${Math.ceil(s.renameIn / 86400e3)} days)` : ''}:</p><input id="a-name" maxlength="16" value="${(s.name || '').replace(/"/g, '')}" style="padding:7px"> <button id="a-namego" style="${btn}">Save</button>`}
    <p style="margin:12px 0 2px">Move to another device:</p><button id="a-xfer" style="${btn2}">Make a transfer code</button> <code id="a-code" style="font-size:18px;margin-left:6px"></code>
    <div style="margin-top:6px"><input id="a-xin" placeholder="ABCDE-FGHJK" style="padding:7px;width:9em;text-transform:uppercase"> <button id="a-xuse" style="${btn2}">Use a code</button></div>
    ${s.claim ? `<p style="margin:12px 0 2px">Claim ownership (the code in the server log):</p><input id="a-claim" style="padding:7px"> <button id="a-claimgo" style="${btn2}">Claim</button>` : ''}
    ${s.role ? `<p style="margin:12px 0 2px">Staff tools:</p>${s.role === 'owner' ? `<button data-page="dashboard" style="${btn2}">Dashboard</button><button data-page="log" style="${btn2}">Admin log</button>` : ''}${s.role !== 'helper' ? `<button data-page="reviews" style="${btn2}">Review list</button>` : ''}` : ''}
    <p id="a-msg" style="min-height:1.2em;margin:10px 0 0;color:#ffd27f"></p>`;
  const msg = (t) => { inner.querySelector('#a-msg').textContent = t; };
  const tryIt = (f) => async () => { try { const r = await f(); if (typeof r === 'string') msg(r); } catch (e) { msg(e.message || String(e)); } };
  for (const b of inner.querySelectorAll('[data-p]')) b.onclick = () => { if (b.dataset.p === 'email') { inner.querySelector('#a-email').style.display = 'block'; return; } signIn(b.dataset.p, { link: true }); };
  const on = (id, f) => { const e = inner.querySelector(id); if (e) e.onclick = tryIt(f); };
  on('#a-ems', async () => { await emailLink(inner.querySelector('#a-em').value, { link: true }); return 'Check your email for the sign-in link.'; });
  on('#a-pk', async () => { await passkeyRegister(); return 'Passkey added - sign in with it on this device any time.'; });
  on('#a-pks', async () => { await passkeySignIn(); location.reload(); return 'Signed in.'; });
  on('#a-namego', () => { pickUsername(inner.querySelector('#a-name').value); return 'Asked for it...'; });
  on('#a-xfer', () => { makeTransferCode(); return 'Making a code...'; });
  on('#a-xuse', async () => { await useTransferCode(inner.querySelector('#a-xin').value); location.reload(); return 'Moving...'; });
  on('#a-claimgo', async () => { const r = await claimOwner(inner.querySelector('#a-claim').value); return r.ok ? 'You are the owner.' : r.err; });
  for (const b of inner.querySelectorAll('[data-page]')) b.onclick = tryIt(async () => { const r = await staffPage(b.dataset.page); return r.ok ? '' : r.err; });
}
// into: a container of the page's own (the title screen's sign-in slot, a settings tab) - else a full-screen overlay
export async function openPanel({ into = null } = {}) {
  await launchInfo();
  if (panel) panel.remove();
  panel = into
    ? el('<div class="cla-account"><div id="a-body"></div></div>')
    : el(`<div style="${css}"><div style="${box};max-height:90vh;overflow:auto"><div style="display:flex;justify-content:space-between"><h2 style="margin:0">Account</h2><button id="a-x" style="${btn2}">Close</button></div><div id="a-body"></div></div></div>`);
  (into || document.body).appendChild(panel);
  if (!into) panel.querySelector('#a-x').onclick = closePanel;
  C.send({ t: 'acct', a: 'state' });
  renderPanel();
  return panel;
}
export function closePanel() { if (panel) { panel.remove(); panel = null; } }

// ctx.gateInto: where the gate goes (the title screen's slot) - else over everything; ctx.noGate: the page shows it itself
export async function boot(ctx) {
  C = ctx;
  const back = await consumeLoginHash();
  if (back && back.error) C.toast(`Sign-in: ${back.error}`, 'warn');
  else if (back && back.reload) { location.reload(); return; }
  else if (back) C.toast(`Signed in with ${back.method}.`, 'good');
  const start = () => { const g = gate(); if (g && C.analytics) C.analytics.consent(g.consent); };
  if (gateNeeded() && !C.noGate) showGate(start, { into: C.gateInto || null }); else start();
  launchInfo();
}
export { TOKEN_KEY };
