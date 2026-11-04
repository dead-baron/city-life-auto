// The sign-in endpoints (docs/LAUNCH-SETUP.md). The page lives on another origin (GitHub Pages) and talks to these with
// fetch (CORS for the game's own pages only) or, for the OAuth providers and magic links, a top-level navigation that
// comes back to the page as #cla_login=<code>: a one-time code (two minutes) the page swaps for its token at
// /auth/redeem. Every flow: short-lived single-use codes and challenges, rate limits per address, constant-time compares,
// secrets only from the environment and never logged, nothing personal kept (an email address only as a keyed hash).
//   GET  /launch.json                         what's switched on: providers, passkeys, the GA measurement id
//   GET  /auth/<google|discord|reddit>/start?ret=<page url>&link=<ticket>    -> the provider (state + PKCE)
//   GET  /auth/<provider>/callback            -> the page, #cla_login=<code> (or #cla_login_error=<why>)
//   POST /auth/email/start {email, ret, link} -> a magic link by email (Resend)
//   GET  /auth/email/callback?t=              -> a one-button page (link scanners don't spend the link) -> POST confirm
//   POST /auth/redeem {code}                  -> { token, pid, method, created }
//   POST /auth/transfer {code}                -> { token, pid }: a guest's one-time transfer code
//   POST /auth/link-ticket (Bearer)           -> { ticket }: link a provider to the account signed in on this page
//   POST /auth/passkey/register/options (Bearer) | /register/verify (Bearer) | /login/options | /login/verify
//   GET  /auth/me (Bearer) · POST /auth/unlink (Bearer) {p} · POST /auth/signout-all (Bearer)
import { randomBytes, createHash } from 'node:crypto';
import { keyedHash, safeEqual } from './auth.js';
import { readJSON, readForm, sendJSON, sendHTML, redirect, cors, cookies, setCookie, bearer, createRateLimiter, esc } from './httputil.js';
import { verifyRegistration, verifyAssertion, createChallenges, ALG } from './webauthn.js';

const FLOW_TTL_MS = 10 * 60e3, EMAIL_TTL_MS = 15 * 60e3, TICKET_TTL_MS = 2 * 60e3;
const b64u = (b) => Buffer.from(b).toString('base64url');
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: b64u(createHash('sha256').update(verifier).digest()) }; };

// The OAuth providers: what each needs. scope: the least that names the user - an id, never an email or a profile.
export const OAUTH = {
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', me: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid', pkce: true, extra: { prompt: 'select_account' }, sub: (j) => j && j.sub,
  },
  discord: {
    auth: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token', me: 'https://discord.com/api/users/@me',
    scope: 'identify', pkce: true, extra: { prompt: 'none' }, sub: (j) => j && j.id,
  },
  reddit: {   // (no PKCE at Reddit: the state, the cookie and the client secret guard it)
    auth: 'https://www.reddit.com/api/v1/authorize', token: 'https://www.reddit.com/api/v1/access_token', me: 'https://oauth.reddit.com/api/v1/me',
    scope: 'identity', pkce: false, basic: true, extra: { duration: 'temporary' }, sub: (j) => j && j.id,
  },
};
const UA = 'CityLifeAuto/1.0 (by deadbaron)';

export function enabledProviders(L) {
  return { google: !!(L.google.id && L.google.secret), discord: !!(L.discord.id && L.discord.secret), reddit: !!(L.reddit.id && L.reddit.secret), email: !!L.email.key };
}

// opts: { launch (config.launch), accounts, ip(req), fetch, now, onSignIn(pid, method, created), log }
export function createAuthHttp(opts) {
  const L = opts.launch, A = opts.accounts, now = opts.now || Date.now, http = opts.fetch || globalThis.fetch, log = opts.log || console;
  const origins = [...new Set([...L.pageOrigins, ...(opts.extraOrigins || [])])];
  const rl = createRateLimiter(now);
  const flows = new Map();     // OAuth state -> { provider, verifier, ret, linkPid, nonce, exp }
  const mails = new Map();     // magic-link token -> { sub, ret, linkPid, exp }
  const tickets = new Map();   // link ticket -> { pid, exp }
  const challenges = createChallenges(now);
  const providers = () => enabledProviders(L);
  const secure = L.publicUrl.startsWith('https://');
  const sweep = () => { const t = now(); for (const M of [flows, mails, tickets]) for (const [k, v] of M) if (v.exp <= t) M.delete(k); };

  // where to send the page back to: one of the game's own pages, never anywhere else (no open redirect)
  function pageUrl(ret) {
    try { const u = new URL(String(ret || '')); if (origins.includes(u.origin)) { u.hash = ''; return u.toString(); } } catch { /* not a url */ }
    return origins[0] + '/';
  }
  const back = (res, ret, code) => redirect(res, `${pageUrl(ret)}#cla_login=${encodeURIComponent(code)}`);
  const backErr = (res, ret, why) => redirect(res, `${pageUrl(ret)}#cla_login_error=${encodeURIComponent(why)}`);
  // the account a Bearer token signs in (current generation, not banned)
  function who(req) {
    const t = bearer(req), c = t ? A.checkToken(t) : null;
    if (!c || !c.acct || A.banned(c.pid)) return null;
    return c.pid;
  }
  function takeTicket(t) {
    sweep();
    if (typeof t !== 'string' || !t) return null;
    const v = tickets.get(t);
    if (!v) return null;
    tickets.delete(t);
    return v.pid;
  }
  function finish(res, ret, provider, sub, linkPid) {
    const r = A.signIn(provider, sub, { linkPid });
    if (r.err) return backErr(res, ret, r.err);
    if (A.banned(r.pid)) return backErr(res, ret, 'This account is banned.');
    if (opts.onSignIn) { try { opts.onSignIn(r.pid, provider, r.created, !!r.linked); } catch (e) { log.error('[auth] onSignIn', e.message); } }
    return back(res, ret, A.makeLoginCode(r.pid, { method: provider, created: r.created, linked: !!r.linked }));
  }
  const limited = (req, what, n, ms) => !rl.hit(`${what}:${opts.ip(req)}`, n, ms);
  const bad = (res, status, err) => sendJSON(res, status, { err });

  async function oauthStart(req, res, url, name) {
    const P = OAUTH[name], C = L[name];
    if (!providers()[name]) return sendHTML(res, 404, 'Not switched on.');
    if (limited(req, 'oauth', 20, 60e3)) return sendHTML(res, 429, 'Too many tries - wait a minute.');
    sweep();
    const ret = pageUrl(url.searchParams.get('ret'));
    const linkPid = url.searchParams.get('link') ? takeTicket(url.searchParams.get('link')) : null;
    if (url.searchParams.get('link') && !linkPid) return backErr(res, ret, 'The link expired - try again.');
    const state = randomBytes(24).toString('base64url'), nonce = randomBytes(24).toString('base64url');
    const p = P.pkce ? pkce() : null;
    if (flows.size > 5000) flows.delete(flows.keys().next().value);
    flows.set(state, { provider: name, verifier: p && p.verifier, ret, linkPid, nonce, exp: now() + FLOW_TTL_MS });
    const q = new URLSearchParams({ client_id: C.id, redirect_uri: `${L.publicUrl}/auth/${name}/callback`, response_type: 'code', scope: P.scope, state, ...P.extra });
    if (p) { q.set('code_challenge', p.challenge); q.set('code_challenge_method', 'S256'); }
    return redirect(res, `${P.auth}?${q}`, { 'set-cookie': setCookie('cla_oauth', nonce, { maxAge: 600, path: '/auth', secure }) });
  }

  async function oauthCallback(req, res, url, name) {
    const P = OAUTH[name], C = L[name];
    sweep();
    const state = url.searchParams.get('state') || '', f = flows.get(state);
    if (!f || f.provider !== name) return backErr(res, null, 'The sign-in expired - try again.');
    flows.delete(state);   // (single use, whatever happens next)
    // CSRF: the browser that came back is the one that set off (the cookie set at /start)
    if (!safeEqual(cookies(req).cla_oauth || '', f.nonce)) return backErr(res, f.ret, 'The sign-in came back to a different browser - try again.');
    if (url.searchParams.get('error')) return backErr(res, f.ret, 'Sign-in cancelled.');
    const code = url.searchParams.get('code');
    if (!code || code.length > 2048) return backErr(res, f.ret, 'No code from the provider.');
    try {
      const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${L.publicUrl}/auth/${name}/callback` });
      const headers = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': UA };
      if (P.basic) headers.authorization = 'Basic ' + Buffer.from(`${C.id}:${C.secret}`).toString('base64');
      else { form.set('client_id', C.id); form.set('client_secret', C.secret); }
      if (f.verifier) form.set('code_verifier', f.verifier);
      const tr = await http(P.token, { method: 'POST', headers, body: form.toString(), signal: AbortSignal.timeout(10000) });
      const tj = await tr.json().catch(() => null);
      if (!tr.ok || !tj || !tj.access_token) return backErr(res, f.ret, 'The provider turned the sign-in down.');
      const mr = await http(P.me, { headers: { authorization: `Bearer ${tj.access_token}`, 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      const mj = await mr.json().catch(() => null);
      const sub = mr.ok ? P.sub(mj) : null;
      if (!sub) return backErr(res, f.ret, 'The provider didn\'t say who you are.');
      return finish(res, f.ret, name, String(sub), f.linkPid);
    } catch (e) {
      log.warn(`[auth] ${name} sign-in failed: ${e.name || 'error'}`);
      return backErr(res, f.ret, 'Couldn\'t reach the provider - try again.');
    }
  }

  // ---- email magic links (Resend's HTTP API) ----
  const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
  async function emailStart(req, res) {
    if (!providers().email) return bad(res, 404, 'Email sign-in isn\'t switched on.');
    if (limited(req, 'email', 5, 10 * 60e3)) return bad(res, 429, 'Too many tries - wait a few minutes.');
    const body = await readJSON(req, 4096);
    const email = body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) return bad(res, 400, 'That doesn\'t look like an email address.');
    const sub = keyedHash('email', email, opts.secret);
    if (!rl.hit(`emailto:${sub}`, 3, 60 * 60e3)) return sendJSON(res, 200, { ok: true });   // (the same answer: nothing learnt)
    const linkPid = body.link ? who(req) : null;
    sweep();
    const t = randomBytes(32).toString('base64url');
    mails.set(t, { sub, ret: pageUrl(body.ret), linkPid, exp: now() + EMAIL_TTL_MS });
    const link = `${L.publicUrl}/auth/email/callback?t=${t}`;
    const text = `Sign in to City Life Auto:\n\n${link}\n\nThe link works once, for 15 minutes. If you didn't ask for it, ignore this email.`;
    const html = `<p>Sign in to <b>City Life Auto</b>:</p><p><a href="${esc(link)}">Sign in</a></p><p>The link works once, for 15 minutes. If you didn't ask for it, ignore this email.</p>`;
    // sent in the background: the page's answer never waits on the mail service, nor says whether the address exists
    http('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${L.email.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: L.email.from, to: [email], subject: 'Your City Life Auto sign-in link', text, html }), signal: AbortSignal.timeout(10000) })
      .then((r) => { if (!r.ok) log.warn(`[auth] the email service answered ${r.status}`); })
      .catch((e) => log.warn(`[auth] the email service: ${e.name || 'error'}`));
    return sendJSON(res, 200, { ok: true });
  }
  function emailLanding(req, res, url) {
    const t = url.searchParams.get('t') || '';
    if (!mails.has(t)) return sendHTML(res, 410, page('This sign-in link has expired or was used. Ask for a new one in the game.'));
    return sendHTML(res, 200, page(`<form method="post" action="/auth/email/confirm"><input type="hidden" name="t" value="${esc(t)}"><button>Sign in to City Life Auto</button></form>`));
  }
  async function emailConfirm(req, res) {
    if (limited(req, 'emailc', 20, 10 * 60e3)) return sendHTML(res, 429, page('Too many tries - wait a few minutes.'));
    const f = await readForm(req);
    sweep();
    const t = f && typeof f.t === 'string' ? f.t : '', m = mails.get(t);
    if (!m) return sendHTML(res, 410, page('This sign-in link has expired or was used. Ask for a new one in the game.'));
    mails.delete(t);
    return finish(res, m.ret, 'email', m.sub, m.linkPid);
  }
  const page = (body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>City Life Auto</title><body style="font:16px system-ui;background:#111;color:#eee;display:grid;place-items:center;min-height:90vh"><div style="max-width:28em;text-align:center">${body}</div>`;

  // ---- passkeys ----
  const rpIdFor = (origin) => { try { const h = new URL(origin).hostname; return h === L.rpId || h.endsWith('.' + L.rpId) ? L.rpId : h; } catch { return L.rpId; } };
  async function passkey(req, res, step) {
    if (limited(req, 'passkey', 30, 60e3)) return bad(res, 429, 'Too many tries - wait a minute.');
    const origin = req.headers.origin;
    if (!origin || !origins.includes(origin)) return bad(res, 403, 'Passkeys work from the game\'s own page.');
    const rpId = rpIdFor(origin);
    const body = await readJSON(req, 16384);
    if (!body) return bad(res, 400, 'Bad request.');
    if (step === 'register/options') {
      const pid = who(req);
      if (!pid) return bad(res, 401, 'Play once first - a passkey is added to your account.');
      const prof = A.profileOf(pid), acct = A.get(pid);
      const challenge = challenges.issue({ kind: 'reg', pid, rpId });
      return sendJSON(res, 200, {
        challenge, rp: { id: rpId, name: L.rpName }, user: { id: b64u(Buffer.from(pid, 'hex')), name: prof.name, displayName: prof.name },
        pubKeyCredParams: [{ type: 'public-key', alg: ALG.ES256 }, { type: 'public-key', alg: ALG.RS256 }],
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
        attestation: 'none', timeout: 120000, excludeCredentials: acct.passkeys.map((k) => ({ type: 'public-key', id: k.id })),
      });
    }
    if (step === 'register/verify') {
      const pid = who(req);
      if (!pid) return bad(res, 401, 'Signed out - play once first.');
      const ch = body.response && challenges.take(body.response.clientDataJSON, 'reg');
      if (!ch || ch.pid !== pid) return bad(res, 400, 'The passkey request expired - try again.');
      let cred;
      try { cred = verifyRegistration(body, { challenge: ch.challenge, origins, rpId: ch.rpId }); } catch (e) { return bad(res, 400, `Passkey refused: ${e.message}`); }
      const err = A.addPasskey(pid, { ...cred, name: body.name });
      if (err) return bad(res, 409, err);
      if (opts.onSignIn) opts.onSignIn(pid, 'passkey', false, true);
      return sendJSON(res, 200, { ok: true });
    }
    if (step === 'login/options') {
      const challenge = challenges.issue({ kind: 'auth', rpId });
      return sendJSON(res, 200, { challenge, rpId, userVerification: 'preferred', timeout: 120000, allowCredentials: [] });
    }
    if (step === 'login/verify') {
      const id = typeof body.id === 'string' ? body.id.replace(/=+$/, '') : '';
      const ch = body.response && challenges.take(body.response.clientDataJSON, 'auth');
      if (!ch) return bad(res, 400, 'The passkey request expired - try again.');
      const found = id ? A.findPasskey(id) : null;
      if (!found) return bad(res, 401, 'That passkey isn\'t registered here.');
      let r;
      try { r = verifyAssertion(body, found.cred, { challenge: ch.challenge, origins, rpId: ch.rpId, userHandle: b64u(Buffer.from(found.pid, 'hex')) }); } catch (e) { return bad(res, 401, `Passkey refused: ${e.message}`); }
      found.cred.count = r.count;
      A.touch();
      if (A.banned(found.pid)) return bad(res, 403, 'This account is banned.');
      if (opts.onSignIn) opts.onSignIn(found.pid, 'passkey', false, false);
      return sendJSON(res, 200, { token: A.token(found.pid), pid: found.pid, method: 'passkey' });
    }
    return bad(res, 404, 'No such step.');
  }

  async function handle(req, res, url) {
    const path = url.pathname;
    if (path !== '/launch.json' && !path.startsWith('/auth/')) return false;
    cors(req, res, origins);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    try {
      if (path === '/launch.json') {
        sendJSON(res, 200, { providers: providers(), passkeys: true, guests: true, ga: L.gaMeasurementId || '', devOpen: !!L.devOpen, requireAge: !!L.requireAge, age: 17 }, { 'cache-control': 'max-age=60' });
        return true;
      }
      const m = path.match(/^\/auth\/(google|discord|reddit)\/(start|callback)$/);
      if (m && req.method === 'GET') { await (m[2] === 'start' ? oauthStart(req, res, url, m[1]) : oauthCallback(req, res, url, m[1])); return true; }
      if (path === '/auth/email/start' && req.method === 'POST') { await emailStart(req, res); return true; }
      if (path === '/auth/email/callback' && req.method === 'GET') { emailLanding(req, res, url); return true; }
      if (path === '/auth/email/confirm' && req.method === 'POST') { await emailConfirm(req, res); return true; }
      const pk = path.match(/^\/auth\/passkey\/((?:register|login)\/(?:options|verify))$/);
      if (pk && req.method === 'POST') { await passkey(req, res, pk[1]); return true; }
      if (req.method !== 'POST' && path !== '/auth/me') { bad(res, 405, 'POST only.'); return true; }
      if (path === '/auth/redeem') {
        if (limited(req, 'redeem', 30, 60e3)) { bad(res, 429, 'Too many tries.'); return true; }
        const body = await readJSON(req, 1024), v = body && A.redeemLoginCode(body.code);
        if (!v) { bad(res, 400, 'That sign-in code expired - sign in again.'); return true; }
        sendJSON(res, 200, { token: A.token(v.pid), pid: v.pid, method: v.method, created: !!v.created, linked: !!v.linked });
        return true;
      }
      if (path === '/auth/transfer') {
        // guessing guard: five tries per address per ten minutes, and the codes are ~49 bits, one-time, ten minutes long
        if (limited(req, 'xfer', 5, 10 * 60e3) || !rl.hit('xfer:all', 200, 10 * 60e3)) { bad(res, 429, 'Too many tries - wait ten minutes.'); return true; }
        const body = await readJSON(req, 1024), pid = body && A.redeemTransfer(body.code);
        if (!pid) { bad(res, 400, 'That code isn\'t right, or it expired. Make a new one on your other device.'); return true; }
        if (A.banned(pid)) { bad(res, 403, 'This account is banned.'); return true; }
        // a guest moves: the old device's token stops working (it's played on here now); a member just signs in here too
        const token = A.isGuest(pid) ? A.signOutEverywhere(pid) : A.token(pid);
        if (A.isGuest(pid) && opts.onTransfer) opts.onTransfer(pid);
        sendJSON(res, 200, { token, pid, moved: A.isGuest(pid) });
        return true;
      }
      if (limited(req, 'acct', 60, 60e3)) { bad(res, 429, 'Too many tries.'); return true; }
      const pid = who(req);
      if (!pid) { bad(res, 401, 'Not signed in.'); return true; }
      if (path === '/auth/me') {
        const a = A.get(pid), prof = A.profileOf(pid);
        sendJSON(res, 200, { id: pid, kind: a.kind, name: prof.name, logins: a.logins.map((l) => l.p), passkeys: a.passkeys.map((k) => ({ name: k.name, at: k.at })), role: a.role, username: !!a.username, providers: providers() });
        return true;
      }
      if (path === '/auth/link-ticket') {
        sweep();
        const t = randomBytes(24).toString('base64url');
        tickets.set(t, { pid, exp: now() + TICKET_TTL_MS });
        sendJSON(res, 200, { ticket: t });
        return true;
      }
      if (path === '/auth/unlink') {
        const body = await readJSON(req, 1024);
        const err = A.unlink(pid, body && String(body.p || ''));
        if (err) bad(res, 400, err); else sendJSON(res, 200, { ok: true });
        return true;
      }
      if (path === '/auth/signout-all') { sendJSON(res, 200, { token: A.signOutEverywhere(pid) }); return true; }
      bad(res, 404, 'No such endpoint.');
    } catch (e) {
      log.error('[auth] endpoint error:', e && e.message);
      bad(res, 500, 'Something went wrong.');
    }
    return true;
  }
  return { handle, pageUrl, flows, mails, tickets, challenges, origins };
}
