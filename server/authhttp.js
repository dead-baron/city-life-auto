// The sign-in endpoints (docs/LAUNCH-SETUP.md). The page lives on another origin (GitHub Pages) and talks to these with
// fetch (CORS for the game's own pages only) or, for the OAuth providers, a top-level navigation that comes back to the
// page as #cla_login=<code>: a one-time code (two minutes) the page swaps for its token at /auth/redeem. Every flow:
// short-lived single-use codes and challenges, rate limits per address, constant-time compares, secrets only from the
// environment and never logged, nothing personal kept (an email address only as a keyed hash - unless its player asked
// for news: server/newslist.js).
//   GET  /launch.json                         what's switched on: providers, passkeys, password resets, the GA id
// Signing in and linking are two things (the review, 11-04): a provider button signs in - an identity already linked
// to an account signs into it, wherever - and linking a new sign-in to the character on this page is its own explicit
// step. Both are bound to the page that started them: the page makes a nonce (pn) it keeps to itself, sends it with
// /start, and must show it again to redeem what comes back - a flow someone else set off in your browser can't be
// finished by your page (login and link CSRF). A link is then confirmed by a POST carrying the page's own token.
//   GET  /auth/<google|discord>/start?ret=<page url>&pn=<nonce>&mode=login|link   -> the provider (state + PKCE)
//   GET  /auth/<provider>/callback            -> the page: #cla_login=<code> (an account it signs into), #cla_link=<code>
//                                                &m=<mode>&known=0|1 (to link, or an identity no account has yet), or
//                                                #cla_login_error=<why>
//   POST /auth/redeem {code, pn}              -> { token, pid, method }
//   POST /auth/link-confirm {code, pn, action: link (Bearer) | login | new} -> { token, pid, linked?, created? }
// Email + password (the owner, 11-12; passwords.js) - fetch from the game's own pages only (the Origin checked):
//   POST /auth/password/signup {email, password, confirm, news, action: new | link (Bearer)} -> { token, pid, created? linked? }
//   POST /auth/password/login {email, password} -> { token, pid, method } | 401 "Wrong email or password." (whatever was wrong)
//   POST /auth/password/forgot {email}        -> always { ok } (a reset link by email, if an account uses the address)
//   GET  /auth/password/reset?t=              -> a page asking for the new password (a mail scanner opening it changes
//                                                nothing) -> POST /auth/password/reset (form) -> the password changed, the
//                                                account's other devices signed out
//   GET  /auth/password/verify?t=             -> one button -> POST: the address confirmed (not needed to play)
//   GET  /auth/news/unsubscribe?t=            -> one button -> POST: off the news list
//   POST /auth/transfer {code}                -> { token, pid }: a guest's one-time transfer code
//   POST /auth/passkey/register/options (Bearer) | /register/verify (Bearer) | /login/options | /login/verify
//   GET  /auth/me (Bearer) · POST /auth/unlink (Bearer) {p} · POST /auth/signout-all (Bearer)
import { randomBytes, createHash } from 'node:crypto';
import { keyedHash, safeEqual } from './auth.js';
import { readJSON, readForm, sendJSON, sendHTML, redirect, cors, cookies, setCookie, bearer, createRateLimiter, esc } from './httputil.js';
import { verifyRegistration, verifyAssertion, createChallenges, ALG } from './webauthn.js';
import { hashPassword, verifyPassword, passwordProblem, normEmail, emailKey, pwFingerprint, signLink, readLink } from './passwords.js';
import { ACCOUNT } from '../shared/rules.js';

const FLOW_TTL_MS = 10 * 60e3, PEND_TTL_MS = 5 * 60e3;
const PN_RE = /^[A-Za-z0-9_-]{16,64}$/;
// the page's live nonces (a few: a Discord sign-in started after a Google one doesn't spoil it) - does one of them match
// the flow's?
export function pnMatches(body, want) {
  if (!want || !body) return false;
  const list = Array.isArray(body.pns) ? body.pns.slice(0, 5) : [];
  if (typeof body.pn === 'string') list.push(body.pn);
  let ok = false;
  for (const x of list) if (typeof x === 'string' && safeEqual(x, want)) ok = true;   // (every one compared: no early out)
  return ok;
}
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
};
const UA = 'CityLifeAuto/1.0 (by deadbaron)';
// the small pages the emails' links open (the game's dark panels and its yellow)
export const PAGE_CSS = 'body{margin:0;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;background:#0f1115;color:#e8e8e8;display:grid;place-items:center;min-height:100vh}main{width:min(28em,calc(100% - 32px));padding:22px;background:#1b1e24;border:1px solid #2c3038;border-radius:10px;box-sizing:border-box}.logo{margin:0 0 8px;font-weight:800;letter-spacing:.12em;color:#ffd27f;font-size:13px}h1{font-size:21px;margin:0 0 10px}label{display:block;margin:12px 0 0;font-size:14px;color:#b9bec8}input{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:10px;font:inherit;font-size:16px;background:#111318;color:#fff;border:1px solid #3a3f49;border-radius:6px}button{margin-top:16px;width:100%;padding:12px;font:inherit;font-weight:700;border:0;border-radius:6px;background:#ffd27f;color:#14161a;cursor:pointer}.err{color:#ff8a80}.sub{font-size:13px;color:#9aa0aa}a{color:#8cc8ff}';

// (Reddit and the email magic links are gone - the owner, 11-12: the accounts that signed in with them keep them)
export function enabledProviders(L) {
  return { google: !!(L.google.id && L.google.secret), discord: !!(L.discord.id && L.discord.secret), password: L.passwords !== false };
}
export const resetsOn = (L) => L.passwords !== false && !!(L.email && L.email.key);

// opts: { launch (config.launch), accounts, ip(req), fetch, now, onSignIn(pid, method, created), log, news (newslist.js),
//         mail({ to, subject, text, html }) (else Resend's HTTP API with RESEND_API_KEY), onSignOutAll(pid) }
export function createAuthHttp(opts) {
  const L = opts.launch, A = opts.accounts, now = opts.now || Date.now, http = opts.fetch || globalThis.fetch, log = opts.log || console;
  const origins = [...new Set([...L.pageOrigins, ...(opts.extraOrigins || [])])];
  const rl = createRateLimiter(now);
  const flows = new Map();     // OAuth state -> { provider, verifier, ret, mode, pn, nonce, exp }
  const pending = new Map();   // link code -> { provider, sub, pn, mode, exp }: an identity to link, or to start an account with
  const challenges = createChallenges(now);
  const providers = () => enabledProviders(L);
  const secure = L.publicUrl.startsWith('https://');
  const sweep = () => { const t = now(); for (const M of [flows, pending]) for (const [k, v] of M) if (v.exp <= t) M.delete(k); };

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
  const signedIn = (pid, provider, created, linked) => { if (opts.onSignIn) { try { opts.onSignIn(pid, provider, created, linked); } catch (e) { log.error('[auth] onSignIn', e.message); } } };
  // an identity came back from a provider: a login code when it signs into an account; else a code to link it or start
  // an account with, which the page that set off the flow confirms
  function finish(res, ret, provider, sub, mode, pn) {
    const known = A.findLogin(provider, sub);
    if (mode === 'login' && known) {
      if (A.banned(known)) return backErr(res, ret, 'This account is banned.');
      signedIn(known, provider, false, false);
      return back(res, ret, A.makeLoginCode(known, { method: provider, pn }));
    }
    sweep();
    const code = randomBytes(24).toString('base64url');
    if (pending.size > 5000) pending.delete(pending.keys().next().value);
    pending.set(code, { provider, sub, pn, mode, exp: now() + PEND_TTL_MS });
    return redirect(res, `${pageUrl(ret)}#cla_link=${encodeURIComponent(code)}&m=${mode}&known=${known ? 1 : 0}&p=${provider}`);
  }
  const modeOf = (v) => (v === 'link' ? 'link' : 'login');
  const pnOf = (v) => (typeof v === 'string' && PN_RE.test(v) ? v : null);
  const limited = (req, what, n, ms) => !rl.hit(`${what}:${opts.ip(req)}`, n, ms);
  const bad = (res, status, err) => sendJSON(res, status, { err });

  async function oauthStart(req, res, url, name) {
    const P = OAUTH[name], C = L[name];
    if (!providers()[name]) return sendHTML(res, 404, 'Not switched on.');
    if (limited(req, 'oauth', 20, 60e3)) return sendHTML(res, 429, 'Too many tries - wait a minute.');
    sweep();
    const ret = pageUrl(url.searchParams.get('ret'));
    const pn = pnOf(url.searchParams.get('pn')), mode = modeOf(url.searchParams.get('mode'));
    if (!pn) return backErr(res, ret, 'Start signing in from the game\'s page.');
    const state = randomBytes(24).toString('base64url'), nonce = randomBytes(24).toString('base64url');
    const p = P.pkce ? pkce() : null;
    if (flows.size > 5000) flows.delete(flows.keys().next().value);
    flows.set(state, { provider: name, verifier: p && p.verifier, ret, mode, pn, nonce, exp: now() + FLOW_TTL_MS });
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
    if (url.searchParams.get('error')) return backErr(res, f.ret, 'Sign-in canceled.');
    const code = url.searchParams.get('code');
    if (!code || code.length > 2048) return backErr(res, f.ret, 'No code from the provider.');
    try {
      const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${L.publicUrl}/auth/${name}/callback` });
      const headers = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': UA };
      form.set('client_id', C.id); form.set('client_secret', C.secret);
      if (f.verifier) form.set('code_verifier', f.verifier);
      const tr = await http(P.token, { method: 'POST', headers, body: form.toString(), signal: AbortSignal.timeout(10000) });
      const tj = await tr.json().catch(() => null);
      if (!tr.ok || !tj || !tj.access_token) return backErr(res, f.ret, 'The provider turned the sign-in down.');
      const mr = await http(P.me, { headers: { authorization: `Bearer ${tj.access_token}`, 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      const mj = await mr.json().catch(() => null);
      const sub = mr.ok ? P.sub(mj) : null;
      if (!sub) return backErr(res, f.ret, 'The provider didn\'t say who you are.');
      return finish(res, f.ret, name, String(sub), f.mode, f.pn);
    } catch (e) {
      log.warn(`[auth] ${name} sign-in failed: ${e.name || 'error'}`);
      return backErr(res, f.ret, 'Couldn\'t reach the provider - try again.');
    }
  }

  // ---- email (Resend's HTTP API): the password resets and the address checks; sent in the background - the page's
  // answer never waits on the mail service, nor says whether an address has an account ----
  function sendMail(msg) {
    if (opts.mail) return Promise.resolve(opts.mail(msg)).catch((e) => log.warn(`[auth] the mailer: ${(e && e.name) || 'error'}`));
    if (!L.email.key) return Promise.resolve(false);
    return http('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${L.email.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: L.email.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }), signal: AbortSignal.timeout(10000) })
      .then((r) => { if (!r.ok) log.warn(`[auth] the email service answered ${r.status}`); return r.ok; })
      .catch((e) => { log.warn(`[auth] the email service: ${e.name || 'error'}`); return false; });
  }
  const mailBody = (lead, link, button, tail) => ({
    text: `${lead}\n\n${link}\n\n${tail}`,
    html: `<p>${esc(lead)}</p><p><a href="${esc(link)}">${esc(button)}</a></p><p>${esc(tail)}</p>`,
  });

  // ---- email + password ----
  // Wrong tries counted by address (whether or not an account uses it: the lockout says nothing about that), the
  // per-address rate limits likewise; the error a sign-in gives is the same whatever was wrong.
  const fails = new Map();   // email key -> { n, at }
  const LOCK_MS = ACCOUNT.lockMin * 60e3;
  const locked = (k) => { const f = fails.get(k); if (!f) return false; if (now() - f.at > LOCK_MS) { fails.delete(k); return false; } return f.n >= ACCOUNT.lockTries; };
  const failed = (k) => { const f = fails.get(k); if (!f || now() - f.at > LOCK_MS) fails.set(k, { n: 1, at: now() }); else f.n++; if (fails.size > 20000) fails.delete(fails.keys().next().value); };
  const WRONG = 'Wrong email or password.';
  const fromPage = (req) => { const o = req.headers.origin; return !!o && origins.includes(o); };
  const verifyLink = (pid, sub) => `${L.publicUrl}/auth/password/verify?t=${signLink('verify', { pid, s: sub, exp: now() + ACCOUNT.verifyDays * 86400e3 }, opts.secret)}`;
  function sendVerify(pid, sub, email) {
    if (!resetsOn(L)) return;
    sendMail({ to: email, subject: 'Confirm your City Life Auto email', ...mailBody('Confirm the email address of your City Life Auto account:', verifyLink(pid, sub), 'Confirm my email', `The link works for ${ACCOUNT.verifyDays} days. If you didn't make an account, ignore this email.`) });
  }
  // the account a reset link is for, while it's still good: its login's password unchanged since the link was made
  function resetTarget(t) {
    const d = readLink('reset', t, opts.secret, now());
    if (!d || typeof d.s !== 'string') return null;
    if (A.findEmail(d.s) !== d.pid || A.banned(d.pid)) return null;
    const l = A.passwordOf(d.pid);
    if (l && l.sub !== d.s) return null;
    return safeEqual(pwFingerprint(l && l.pw, opts.secret), String(d.f || '')) ? { pid: d.pid, sub: d.s, login: l } : null;
  }
  const pwForm = (t, err = '') => page(`<h1>A new password</h1>${err ? `<p class="err">${esc(err)}</p>` : ''}<form method="post" action="/auth/password/reset"><input type="hidden" name="t" value="${esc(t)}">
    <label>New password<input type="password" name="pw" autocomplete="new-password" minlength="${ACCOUNT.pwMin}" maxlength="${ACCOUNT.pwMax}" required></label>
    <label>The same again<input type="password" name="pw2" autocomplete="new-password" minlength="${ACCOUNT.pwMin}" maxlength="${ACCOUNT.pwMax}" required></label>
    <p class="sub">At least ${ACCOUNT.pwMin} characters - a few words together work well. Changing it signs your account out on your other devices.</p>
    <button>Change my password</button></form>`);
  const GONE = 'This link has expired or was used. Ask for a new one in the game: Sign in, then Forgot password.';

  async function password(req, res, url, step) {
    if (!providers().password) return bad(res, 404, 'Email sign-in isn\'t switched on.');
    // the emails' pages: a GET shows one button (or the form), a POST does it - a mail scanner opening a link spends nothing
    if (step === 'reset' || step === 'verify') {
      if (req.method === 'GET') {
        const t = url.searchParams.get('t') || '';
        if (step === 'reset') return resetTarget(t) ? sendHTML(res, 200, pwForm(t)) : sendHTML(res, 410, page(`<p>${GONE}</p>`));
        return readLink('verify', t, opts.secret, now()) ? sendHTML(res, 200, page(`<h1>Confirm your email</h1><form method="post" action="/auth/password/verify"><input type="hidden" name="t" value="${esc(t)}"><button>Confirm my email</button></form>`)) : sendHTML(res, 410, page('<p>This link has expired. Sign in to the game and ask for a new one.</p>'));
      }
      if (req.method !== 'POST') return bad(res, 405, 'POST only.');
      if (limited(req, 'pwpage', 20, 10 * 60e3)) return sendHTML(res, 429, page('<p>Too many tries - wait a few minutes.</p>'));
      const f = await readForm(req, 4096);
      const t = f && typeof f.t === 'string' ? f.t : '';
      if (step === 'verify') {
        const d = readLink('verify', t, opts.secret, now()), l = d && A.passwordOf(d.pid);
        if (!l || l.sub !== d.s) return sendHTML(res, 410, page('<p>This link has expired. Sign in to the game and ask for a new one.</p>'));
        if (!l.vf) { l.vf = now(); A.touch(); }
        return sendHTML(res, 200, page('<h1>Email confirmed</h1><p>Thanks - you can close this page and go back to the game.</p>'));
      }
      const tg = resetTarget(t);
      if (!tg) return sendHTML(res, 410, page(`<p>${GONE}</p>`));
      const pw1 = typeof f.pw === 'string' ? f.pw : '', pw2 = typeof f.pw2 === 'string' ? f.pw2 : '';
      if (pw1 !== pw2) return sendHTML(res, 400, pwForm(t, 'The two passwords don\'t match.'));
      const why = passwordProblem(pw1);
      if (why) return sendHTML(res, 400, pwForm(t, why));
      const h = await hashPassword(pw1);
      const again = resetTarget(t);   // (two tabs posting at once: the first one wins, the link is spent)
      if (!again) return sendHTML(res, 410, page(`<p>${GONE}</p>`));
      const err = A.setPassword(again.pid, again.sub, h, { verified: now() });   // (the link came to the address: it's confirmed)
      if (err) return sendHTML(res, 400, page(`<p>${esc(err)}</p>`));
      fails.delete(again.sub);
      A.signOutEverywhere(again.pid);
      if (opts.onSignOutAll) opts.onSignOutAll(again.pid);
      if (opts.onReset) { try { opts.onReset(again.pid); } catch { /* a note only */ } }
      return sendHTML(res, 200, page(`<h1>Password changed</h1><p>Go back to the game and sign in with your email and the new password. Your account was signed out on your other devices.</p><p><a href="${esc(origins[0] + '/')}">Back to City Life Auto</a></p>`));
    }
    if (req.method !== 'POST') return bad(res, 405, 'POST only.');
    if (!fromPage(req)) return bad(res, 403, 'Sign in from the game\'s own page.');
    const body = await readJSON(req, 4096);
    if (!body) return bad(res, 400, 'Bad request.');
    const email = normEmail(body.email);

    if (step === 'forgot') {
      if (!resetsOn(L)) return bad(res, 503, 'Password resets aren\'t available yet.');
      if (limited(req, 'pwforgot', 5, 10 * 60e3)) return bad(res, 429, 'Too many tries - wait a few minutes.');
      if (!email) return bad(res, 400, 'That doesn\'t look like an email address.');
      const sub = emailKey(email, opts.secret), ok = { ok: true, msg: 'If an account uses that address, a reset link is on its way. It works once, for ' + ACCOUNT.resetMin + ' minutes.' };
      if (!rl.hit(`pwforgotto:${sub}`, 3, 60 * 60e3)) return sendJSON(res, 200, ok);   // (the same answer: nothing learnt)
      const pid = A.findEmail(sub);
      if (pid && !A.banned(pid)) {
        const l = A.passwordOf(pid);
        if (!l || l.sub === sub) {
          const link = `${L.publicUrl}/auth/password/reset?t=${signLink('reset', { pid, s: sub, f: pwFingerprint(l && l.pw, opts.secret), exp: now() + ACCOUNT.resetMin * 60e3 }, opts.secret)}`;
          sendMail({ to: email, subject: 'Reset your City Life Auto password', ...mailBody('Someone (we hope you) asked to reset the password of your City Life Auto account. Choose a new one here:', link, 'Choose a new password', `The link works once, for ${ACCOUNT.resetMin} minutes. If you didn't ask, ignore this email - your password stays as it is.`) });
        }
      }
      return sendJSON(res, 200, ok);
    }

    if (step === 'login') {
      if (limited(req, 'pwlogin', 20, 10 * 60e3)) return bad(res, 429, 'Too many tries - wait a few minutes.');
      const pw = typeof body.password === 'string' ? body.password : '';
      if (!email || !pw) return bad(res, 401, WRONG);
      const sub = emailKey(email, opts.secret);
      if (locked(sub)) return bad(res, 429, `Too many wrong passwords for that email - wait ${ACCOUNT.lockMin} minutes, or reset it (Forgot password).`);
      const pid = A.findLogin('password', sub), l = pid ? A.passwordOf(pid) : null;
      const ok = await verifyPassword(pw, l && l.sub === sub ? l.pw : null);   // (no account: a dummy hash checked all the same)
      if (!ok) { failed(sub); return bad(res, 401, WRONG); }
      fails.delete(sub);
      if (A.banned(pid)) return bad(res, 403, 'This account is banned.');
      signedIn(pid, 'password', false, false);
      return sendJSON(res, 200, { token: A.token(pid), pid, method: 'password', verified: !!l.vf });
    }

    if (step === 'signup') {
      if (limited(req, 'pwsignup', 6, 60 * 60e3)) return bad(res, 429, 'Too many new accounts from your network - try again later.');
      if (!email) return bad(res, 400, 'That doesn\'t look like an email address.');
      const pw = typeof body.password === 'string' ? body.password : '';
      if (typeof body.confirm === 'string' && body.confirm !== pw) return bad(res, 400, 'The two passwords don\'t match.');
      const why = passwordProblem(pw, email);
      if (why) return bad(res, 400, why);
      const sub = emailKey(email, opts.secret);
      if (!rl.hit(`pwsignupto:${sub}`, 5, 60 * 60e3)) return bad(res, 429, 'Too many tries - wait a while.');
      // an address that already signs in somewhere: no second account (the answer can't help saying so - beta accounts
      // play at once, before any email is read; the rate limits keep it from being a lookup service)
      const TAKEN = 'That email can\'t make a new account. If it\'s yours, sign in - or use Forgot password.';
      if (A.findEmail(sub)) return bad(res, 409, TAKEN);
      const action = body.action === 'link' ? 'link' : 'new';
      const linkPid = action === 'link' ? who(req) : null;
      if (action === 'link' && !linkPid) return bad(res, 401, 'Not signed in on this page.');
      if (linkPid && A.passwordOf(linkPid)) return bad(res, 409, 'This account already has an email and password.');
      const h = await hashPassword(pw);
      if (A.findEmail(sub)) return bad(res, 409, TAKEN);   // (one made while it hashed)
      let pid = linkPid, created = false;
      if (!pid) { const r = A.signIn('password', sub); if (r.err) return bad(res, 400, r.err); pid = r.pid; created = true; }
      const err = A.setPassword(pid, sub, h);
      if (err) return bad(res, 400, err);
      if (body.news === true && opts.news) opts.news.optIn(email, 'signup', pid);
      sendVerify(pid, sub, email);
      signedIn(pid, 'password', created, !created);
      return sendJSON(res, 200, { token: A.token(pid), pid, created, linked: !created, verifySent: resetsOn(L) });
    }
    return bad(res, 404, 'No such step.');
  }

  // ---- off the news list: one button (a mail scanner opening the link unsubscribes nobody) ----
  async function unsubscribe(req, res, url) {
    const N = opts.news;
    if (req.method === 'GET') {
      const t = url.searchParams.get('t') || '';
      if (!N || !N.byToken(t)) return sendHTML(res, 200, page('<h1>Unsubscribed</h1><p>That address isn\'t on the news list (any more).</p>'));
      return sendHTML(res, 200, page(`<h1>Game news by email</h1><p>Stop the City Life Auto news emails to this address?</p><form method="post" action="/auth/news/unsubscribe"><input type="hidden" name="t" value="${esc(t)}"><button>Unsubscribe</button></form>`));
    }
    if (req.method !== 'POST') return bad(res, 405, 'POST only.');
    if (limited(req, 'unsub', 30, 10 * 60e3)) return sendHTML(res, 429, page('<p>Too many tries - wait a few minutes.</p>'));
    const f = await readForm(req, 2048);
    if (N && f && typeof f.t === 'string') N.unsubscribe(f.t);
    return sendHTML(res, 200, page('<h1>Unsubscribed</h1><p>No more news emails to that address. You can turn them back on in the game: Settings, Account.</p>'));
  }
  const page = (body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>City Life Auto</title><style>${PAGE_CSS}</style><body><main><p class="logo">CITY LIFE AUTO</p>${body}</main>`;

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
      found.cred.count = Math.max(found.cred.count || 0, r.count);
      A.touch();
      // a count that went backwards: possibly a cloned key - signed in all the same (a lockout would punish the owner of
      // a key someone copied), and flagged for an admin to look at
      if (r.cloned && opts.onFlag) opts.onFlag(found.pid, 'passkey', `a passkey's sign counter went backwards (${r.was} -> ${r.count}): a cloned key?`);
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
        sendJSON(res, 200, { providers: providers(), passkeys: true, guests: true, resets: resetsOn(L), password: { min: ACCOUNT.pwMin, max: ACCOUNT.pwMax }, ga: L.gaMeasurementId || '', devOpen: !!L.devOpen, requireAge: !!L.requireAge, age: 17 }, { 'cache-control': 'max-age=60' });
        return true;
      }
      const m = path.match(/^\/auth\/(google|discord)\/(start|callback)$/);
      if (m && req.method === 'GET') { await (m[2] === 'start' ? oauthStart(req, res, url, m[1]) : oauthCallback(req, res, url, m[1])); return true; }
      const pw = path.match(/^\/auth\/password\/(signup|login|forgot|reset|verify)$/);
      if (pw) { await password(req, res, url, pw[1]); return true; }
      if (path === '/auth/news/unsubscribe') { await unsubscribe(req, res, url); return true; }
      const pk = path.match(/^\/auth\/passkey\/((?:register|login)\/(?:options|verify))$/);
      if (pk && req.method === 'POST') { await passkey(req, res, pk[1]); return true; }
      if (req.method !== 'POST' && path !== '/auth/me') { bad(res, 405, 'POST only.'); return true; }
      if (path === '/auth/redeem') {
        if (limited(req, 'redeem', 30, 60e3)) { bad(res, 429, 'Too many tries.'); return true; }
        const body = await readJSON(req, 2048), peek = body && A.redeemLoginCode(body.code, { keep: true });
        if (!peek) { bad(res, 400, 'That sign-in code expired - sign in again.'); return true; }
        // the page that started it, or nobody (a code someone else's flow made is spent, not handed over)
        if (peek.pn && !pnMatches(body, peek.pn)) { A.redeemLoginCode(body.code); bad(res, 403, 'Finish signing in on the page you started from.'); return true; }
        const v = A.redeemLoginCode(body.code);
        if (!v) { bad(res, 400, 'That sign-in code expired - sign in again.'); return true; }
        if (A.banned(v.pid)) { bad(res, 403, 'This account is banned.'); return true; }
        sendJSON(res, 200, { token: A.token(v.pid), pid: v.pid, method: v.method });
        return true;
      }
      if (path === '/auth/link-confirm') {
        if (limited(req, 'redeem', 30, 60e3)) { bad(res, 429, 'Too many tries.'); return true; }
        const body = await readJSON(req, 2048);
        sweep();
        const code = body && typeof body.code === 'string' ? body.code : '', pv = pending.get(code);
        if (!pv) { bad(res, 400, 'That sign-in expired - try again.'); return true; }
        if (!pnMatches(body, pv.pn)) { bad(res, 403, 'Finish this on the page you started from (the same browser and tab).'); return true; }
        const known = A.findLogin(pv.provider, pv.sub), action = String(body.action || '');
        if (action === 'link') {
          const pid = who(req);
          if (!pid) { bad(res, 401, 'Not signed in on this page.'); return true; }
          if (known && known !== pid) { bad(res, 409, 'That sign-in is already linked to another account - sign in with it instead.'); return true; }
          if (!known) { const err = A.link(pid, pv.provider, pv.sub); if (err) { bad(res, 400, err); return true; } }
          pending.delete(code);
          signedIn(pid, pv.provider, false, true);
          sendJSON(res, 200, { token: A.token(pid), pid, linked: true });
          return true;
        }
        if (action === 'login') {
          if (!known) { bad(res, 404, 'No account uses that sign-in yet.'); return true; }
          if (A.banned(known)) { bad(res, 403, 'This account is banned.'); return true; }
          pending.delete(code);
          signedIn(known, pv.provider, false, false);
          sendJSON(res, 200, { token: A.token(known), pid: known });
          return true;
        }
        if (action === 'new') {
          if (known) { bad(res, 409, 'That sign-in already has an account - sign in with it instead.'); return true; }
          const r = A.signIn(pv.provider, pv.sub);
          if (r.err) { bad(res, 400, r.err); return true; }
          pending.delete(code);
          signedIn(r.pid, pv.provider, true, false);
          sendJSON(res, 200, { token: A.token(r.pid), pid: r.pid, created: true });
          return true;
        }
        bad(res, 400, 'No such action.');
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
        const a = A.get(pid), prof = A.profileOf(pid), pwl = A.passwordOf(pid);
        sendJSON(res, 200, { id: pid, kind: a.kind, name: prof.name, logins: a.logins.map((l) => l.p), passkeys: a.passkeys.map((k) => ({ name: k.name, at: k.at })), role: a.role, username: !!a.username, providers: providers(), email: !!pwl, verified: !!(pwl && pwl.vf) });
        return true;
      }
      if (path === '/auth/unlink') {
        const body = await readJSON(req, 1024);
        const err = A.unlink(pid, body && String(body.p || ''));
        if (err) bad(res, 400, err); else sendJSON(res, 200, { ok: true });
        return true;
      }
      if (path === '/auth/signout-all') {
        const token = A.signOutEverywhere(pid);
        sendJSON(res, 200, { token });   // (the reply first: the asking page has its new token before its socket closes)
        if (opts.onSignOutAll) opts.onSignOutAll(pid);   // (its live sessions closed - after a moment: launch.js)
        return true;
      }
      bad(res, 404, 'No such endpoint.');
    } catch (e) {
      log.error('[auth] endpoint error:', e && e.message);
      bad(res, 500, 'Something went wrong.');
    }
    return true;
  }
  return { handle, pageUrl, flows, pending, challenges, origins, sendMail };
}
