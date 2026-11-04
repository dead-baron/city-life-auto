// The launch foundation's accounts (server/accounts.js, auth.js, authhttp.js, webauthn.js): tokens old and new,
// guests migrated without loss, linked sign-ins, transfer codes, OAuth (state, the CSRF cookie, PKCE), email magic
// links, passkeys verified with generated keys (ES256, RS256), and the rate limits on all of it.
import { clock, call, fakeConn } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash, createHmac } from 'node:crypto';
import { MemoryStore } from '../server/store.js';
import { issueToken, verifyToken, safeEqual } from '../server/auth.js';
import { createAccounts, TRANSFER_TTL_MS } from '../server/accounts.js';
import { createAuthHttp } from '../server/authhttp.js';
import { cborEncode, cborDecode, verifyRegistration, verifyAssertion, ALG, createChallenges } from '../server/webauthn.js';

const SECRET = 'test-secret';
const LAUNCH = {
  publicUrl: 'https://play.example', pageOrigins: ['https://game.example'], rpId: 'game.example', rpName: 'CLA', devOpen: true,
  google: { id: 'gid', secret: 'gsecret' }, discord: { id: 'did', secret: 'dsecret' }, reddit: { id: '', secret: '' }, email: { key: 'rkey', from: 'CLA <a@b.c>' }, gaMeasurementId: '',
};
function setup(c = clock(), fetchImpl = null) {
  const store = new MemoryStore();
  const A = createAccounts({ store, secret: SECRET, now: c.now });
  const signins = [];
  const H = createAuthHttp({ launch: LAUNCH, accounts: A, secret: SECRET, now: c.now, ip: (r) => r.ip, fetch: fetchImpl, log: { warn() {}, error() {}, log() {} }, onSignIn: (...a) => signins.push(a), onTransfer: () => {} });
  return { store, A, H, c, signins, h: (o) => call(H.handle, o) };
}

test('tokens: an old token (no generation) keeps working; a forged or other-secret one does not; constant-time compare', () => {
  const pid = 'a'.repeat(24);
  const payload = Buffer.from(JSON.stringify({ pid, iat: 1 })).toString('base64url');
  const old = `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;   // (as the server made them before)
  assert.equal(verifyToken(old, SECRET).pid, pid);
  assert.equal(verifyToken(old, SECRET).g, 0);
  assert.equal(verifyToken(old, 'other'), null);
  assert.equal(verifyToken(old.slice(0, -2) + 'xx', SECRET), null);
  assert.equal(verifyToken(issueToken(pid, 3, SECRET), SECRET).g, 3);
  assert.ok(safeEqual('abc', 'abc') && !safeEqual('abc', 'abd') && !safeEqual('abc', 'abcd'));
});

test('migration: a profile from before gets an account record on login, its progress untouched, its old token still good', () => {
  const { store, A } = setup();
  const pid = 'b'.repeat(24);
  const prof = store.create(pid);
  Object.assign(prof, { name: 'Guest4242', cash: 1234, bank: 98765, criminalExp: 77, homes: ['h1'] });
  delete prof.acct;
  const before = JSON.parse(JSON.stringify(prof));
  const tok = issueToken(pid, 0, SECRET);
  const c = A.checkToken(tok);
  assert.equal(c.pid, pid);
  assert.equal(c.acct.kind, 'guest');
  assert.equal(c.acct.gen, 0);
  for (const k of Object.keys(before)) assert.deepEqual(prof[k], before[k], `${k} kept`);
  assert.ok(A.isGuest(pid));
});

test('linking: one account, several sign-ins; a sign-in on another account is refused; unlink keeps one', () => {
  const { A, store } = setup();
  const pid = 'c'.repeat(24); store.create(pid);
  assert.equal(A.signIn('google', 'g-1', { linkPid: pid }).pid, pid);
  assert.equal(A.isGuest(pid), false, 'a member now');
  assert.equal(A.signIn('discord', 'd-1', { linkPid: pid }).pid, pid);
  assert.equal(A.signIn('google', 'g-1').pid, pid, 'signing in again finds it');
  assert.equal(A.signIn('discord', 'd-1').created, false);
  const other = A.signIn('google', 'g-2');
  assert.ok(other.created && other.pid !== pid);
  assert.match(A.signIn('google', 'g-2', { linkPid: pid }).err, /another account/);
  assert.equal(A.unlink(pid, 'google'), null);
  assert.match(A.unlink(pid, 'discord'), /at least one/);
});

test('sign out everywhere and bans: older tokens stop working; a ban ends, a device marker is noted', () => {
  const c = clock();
  const { A, store } = setup(c);
  const pid = 'd'.repeat(24); store.create(pid);
  const t0 = A.token(pid);
  const t1 = A.signOutEverywhere(pid);
  assert.equal(A.checkToken(t0), null);
  assert.equal(A.checkToken(t1).pid, pid);
  A.noteDevice(pid, 'f'.repeat(32));
  A.ban(pid, { hours: 1, why: 'test' });
  assert.ok(A.banned(pid));
  assert.equal(A.checkToken(t1), null, 'a ban signs it out');
  assert.ok(A.deviceBanned('f'.repeat(32)));
  assert.ok(!A.deviceBanned('e'.repeat(32)));
  c.add(3600e3 + 1);
  assert.equal(A.banned(pid), null, 'over after the hour');
  assert.ok(!A.deviceBanned('f'.repeat(32)));
});

test('owner bootstrap: CLA_OWNER_ID, or a one-time claim code', () => {
  const { A, store } = setup();
  const pid = 'e'.repeat(24), other = '1'.repeat(24); store.create(pid); store.create(other);
  const lines = [];
  const code = A.bootstrapOwner('', (s) => lines.push(s));
  assert.ok(code && lines.some((l) => l.includes(code)));
  assert.match(A.claimOwner(other, 'WRONG-CODE'), /isn't the code/);
  assert.equal(A.claimOwner(pid, code.toLowerCase()), null);
  assert.equal(A.role(pid), 'owner');
  assert.match(A.claimOwner(other, code), /Nothing to claim/, 'works once');
  const s2 = setup();
  s2.store.create(pid);
  assert.equal(s2.A.bootstrapOwner(pid, () => {}), null);
  assert.equal(s2.A.role(pid), 'owner');
});

test('transfer codes: one-time, ten minutes, the old device signed out (a guest moves), guessing rate-limited', async () => {
  const c = clock();
  const { A, store, h } = setup(c);
  const pid = '2'.repeat(24); store.create(pid);
  const oldTok = A.token(pid);
  const { code } = A.makeTransfer(pid);
  assert.match(code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  let r = await h({ method: 'POST', url: '/auth/transfer', body: { code: code.toLowerCase().replace('-', ' ') } });
  assert.equal(r.status, 200);
  const j = r.json();
  assert.equal(j.pid, pid);
  assert.ok(j.moved);
  assert.equal(A.checkToken(oldTok), null, 'the old device is signed out');
  assert.equal(A.checkToken(j.token).pid, pid);
  r = await h({ method: 'POST', url: '/auth/transfer', body: { code } });
  assert.equal(r.status, 400, 'used once');
  const { code: c2 } = A.makeTransfer(pid);
  c.add(TRANSFER_TTL_MS + 1);
  assert.equal(A.redeemTransfer(c2), null, 'expired');
  // five wrong guesses from one address, then 429
  for (let i = 0; i < 5; i++) assert.equal((await h({ method: 'POST', url: '/auth/transfer', body: { code: 'AAAAA-AAAAA' }, ip: '7.7.7.7' })).status, 400);
  assert.equal((await h({ method: 'POST', url: '/auth/transfer', body: { code: 'AAAAA-AAAAA' }, ip: '7.7.7.7' })).status, 429);
  assert.equal((await h({ method: 'POST', url: '/auth/transfer', body: { code: 'AAAAA-AAAAA' }, ip: '7.7.7.8' })).status, 400, 'another address is unaffected');
});

test('/launch.json: what is switched on (providers without keys are off)', async () => {
  const { h } = setup();
  const j = (await h({ url: '/launch.json', headers: { origin: 'https://game.example' } })).json();
  assert.deepEqual(j.providers, { google: true, discord: true, reddit: false, email: true });
  assert.equal(j.passkeys, true);
  assert.equal(j.age, 17);
});

// a provider that answers like Google / Discord do
function fakeProvider(sub) {
  const calls = [];
  const f = async (url, opt = {}) => {
    calls.push({ url, opt });
    if (/token/.test(url)) return { ok: true, status: 200, json: async () => ({ access_token: 'at-123' }) };
    return { ok: true, status: 200, json: async () => ({ sub, id: sub }) };
  };
  return { f, calls };
}

test('OAuth: state + PKCE out, the CSRF cookie checked, a one-time code back to the page only, linking with a ticket', async () => {
  const P = fakeProvider('google-user-9');
  const { h, A, store, signins } = setup(clock(), P.f);
  let r = await h({ url: '/auth/google/start?ret=' + encodeURIComponent('https://evil.example/steal') });
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.location);
  assert.equal(loc.origin, 'https://accounts.google.com');
  const state = loc.searchParams.get('state');
  assert.ok(state && loc.searchParams.get('code_challenge') && loc.searchParams.get('code_challenge_method') === 'S256');
  assert.equal(loc.searchParams.get('scope'), 'openid');
  assert.equal(loc.searchParams.get('redirect_uri'), 'https://play.example/auth/google/callback');
  const cookie = r.headers['set-cookie'].match(/cla_oauth=([^;]+)/)[1];
  assert.match(r.headers['set-cookie'], /HttpOnly/);
  // another browser comes back with the state: refused (no cookie)
  r = await h({ url: `/auth/google/callback?state=${state}&code=abc` });
  assert.match(decodeURIComponent(r.headers.location), /cla_login_error=.*different browser/);
  assert.match(r.headers.location, /^https:\/\/game\.example\//, 'never the evil page: back to one of ours');
  // the state was spent: a second try is refused even with the cookie
  r = await h({ url: `/auth/google/callback?state=${state}&code=abc`, headers: { cookie: `cla_oauth=${cookie}` } });
  assert.match(decodeURIComponent(r.headers.location), /expired/);
  // a clean run
  r = await h({ url: '/auth/google/start?ret=' + encodeURIComponent('https://game.example/play/?x=1') });
  const st2 = new URL(r.headers.location).searchParams.get('state'), ck2 = r.headers['set-cookie'].match(/cla_oauth=([^;]+)/)[1];
  r = await h({ url: `/auth/google/callback?state=${st2}&code=thecode`, headers: { cookie: `cla_oauth=${ck2}` } });
  const back = new URL(r.headers.location);
  assert.equal(back.origin + back.pathname, 'https://game.example/play/');
  const code = new URLSearchParams(back.hash.slice(1)).get('cla_login');
  assert.ok(code);
  const tokenCall = P.calls.find((c) => /token/.test(c.url));
  const form = new URLSearchParams(tokenCall.opt.body);
  assert.ok(form.get('code_verifier'), 'PKCE verifier sent');
  assert.equal(form.get('code'), 'thecode');
  r = await h({ method: 'POST', url: '/auth/redeem', body: { code } });
  const j = r.json();
  assert.equal(j.method, 'google');
  assert.ok(j.created);
  assert.equal(A.findLogin('google', 'google-user-9'), j.pid);
  assert.equal((await h({ method: 'POST', url: '/auth/redeem', body: { code } })).status, 400, 'the code works once');
  assert.equal(signins.length, 1);
  // linking: a guest asks for a ticket with its token, and the sign-in lands on it
  const guest = '3'.repeat(24); store.create(guest);
  const P2 = fakeProvider('discord-user-1');
  const S2 = setup(clock(), P2.f);
  S2.store.create(guest);
  const t = (await S2.h({ method: 'POST', url: '/auth/link-ticket', headers: { authorization: `Bearer ${S2.A.token(guest)}` } })).json().ticket;
  r = await S2.h({ url: `/auth/discord/start?link=${t}` });
  const st3 = new URL(r.headers.location).searchParams.get('state'), ck3 = r.headers['set-cookie'].match(/cla_oauth=([^;]+)/)[1];
  r = await S2.h({ url: `/auth/discord/callback?state=${st3}&code=x`, headers: { cookie: `cla_oauth=${ck3}` } });
  const code3 = new URLSearchParams(new URL(r.headers.location).hash.slice(1)).get('cla_login');
  const j3 = (await S2.h({ method: 'POST', url: '/auth/redeem', body: { code: code3 } })).json();
  assert.equal(j3.pid, guest, 'linked to the guest: its progress kept');
  assert.ok(j3.linked);
  assert.equal(S2.A.isGuest(guest), false);
  // a provider without keys isn't there
  assert.equal((await h({ url: '/auth/reddit/start' })).status, 404);
});

test('email magic link: sent through Resend, the same answer for any address, one POST confirms it once', async () => {
  const sent = [];
  const f = async (url, opt) => { sent.push({ url, opt }); return { ok: true, status: 200, json: async () => ({}) }; };
  const { h, A } = setup(clock(), f);
  let r = await h({ method: 'POST', url: '/auth/email/start', body: { email: 'Player@Example.com', ret: 'https://game.example/' } });
  assert.equal(r.status, 200);
  await new Promise((z) => setImmediate(z));
  assert.equal(sent[0].url, 'https://api.resend.com/emails');
  assert.equal(sent[0].opt.headers.authorization, 'Bearer rkey');
  const mail = JSON.parse(sent[0].opt.body);
  assert.deepEqual(mail.to, ['player@example.com']);
  const link = mail.text.match(/https:\/\/play\.example\/auth\/email\/callback\?t=([A-Za-z0-9_-]+)/);
  assert.ok(link);
  // the GET is a page with one button (a mail scanner opening the link doesn't spend it)
  r = await h({ url: `/auth/email/callback?t=${link[1]}` });
  assert.equal(r.status, 200);
  assert.match(r.body, /<form method="post"/);
  r = await h({ method: 'POST', url: '/auth/email/confirm', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `t=${link[1]}` });
  const code = new URLSearchParams(new URL(r.headers.location).hash.slice(1)).get('cla_login');
  const j = (await h({ method: 'POST', url: '/auth/redeem', body: { code } })).json();
  assert.equal(j.method, 'email');
  const acct = A.get(j.pid);
  assert.ok(!JSON.stringify(acct).includes('example.com'), 'the address is never kept, only a keyed hash');
  r = await h({ method: 'POST', url: '/auth/email/confirm', body: `t=${link[1]}` });
  assert.equal(r.status, 410, 'once');
  assert.equal((await h({ method: 'POST', url: '/auth/email/start', body: { email: 'not an email' } })).status, 400);
  for (let i = 0; i < 4; i++) await h({ method: 'POST', url: '/auth/email/start', body: { email: `x${i}@example.com` } });
  assert.equal((await h({ method: 'POST', url: '/auth/email/start', body: { email: 'y@example.com' } })).status, 429, 'five a ten minutes from one address');
});

// ---- WebAuthn with generated keys ----
const b64u = (b) => Buffer.from(b).toString('base64url');
const sha = (b) => createHash('sha256').update(b).digest();
function authenticator(alg) {
  const kp = alg === ALG.ES256 ? generateKeyPairSync('ec', { namedCurve: 'P-256' }) : generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = kp.publicKey.export({ format: 'jwk' });
  const cose = alg === ALG.ES256
    ? new Map([[1, 2], [3, ALG.ES256], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]])
    : new Map([[1, 3], [3, ALG.RS256], [-1, Buffer.from(jwk.n, 'base64url')], [-2, Buffer.from(jwk.e, 'base64url')]]);
  const credId = Buffer.from(`cred-${alg}-${Math.random()}`);
  let count = 0;
  const authData = (rpId, flags, withCred) => {
    const head = Buffer.alloc(37);
    sha(Buffer.from(rpId)).copy(head, 0);
    head[32] = flags;
    head.writeUInt32BE(count, 33);
    if (!withCred) return head;
    const len = Buffer.alloc(2); len.writeUInt16BE(credId.length);
    return Buffer.concat([head, Buffer.alloc(16), len, credId, cborEncode(cose)]);
  };
  return {
    id: b64u(credId),
    create({ challenge, origin = 'https://game.example', rpId = 'game.example', flags = 0x45 }) {
      const cd = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }));
      const att = cborEncode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData(rpId, flags, true)]]));
      return { id: b64u(credId), rawId: b64u(credId), type: 'public-key', response: { clientDataJSON: b64u(cd), attestationObject: b64u(att) } };
    },
    get({ challenge, origin = 'https://game.example', rpId = 'game.example', flags = 0x05, step = 1, userHandle = null }) {
      count += step;
      const cd = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin }));
      const ad = authData(rpId, flags, false);
      const data = Buffer.concat([ad, sha(cd)]);
      const sig = alg === ALG.ES256 ? sign('sha256', data, { key: kp.privateKey, dsaEncoding: 'der' }) : sign('sha256', data, kp.privateKey);
      return { id: b64u(credId), rawId: b64u(credId), type: 'public-key', response: { clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(sig), userHandle } };
    },
  };
}
const opts = (challenge) => ({ challenge, origins: ['https://game.example'], rpId: 'game.example' });

test('CBOR: round trips, indefinite lengths, truncation refused', () => {
  const v = new Map([['a', 1], [-3, Buffer.from([1, 2, 3])], [5, [true, false, null, 'x', -500, 70000]]]);
  const [back] = cborDecode(cborEncode(v));
  assert.equal(back.get('a'), 1);
  assert.deepEqual([...back.get(-3)], [1, 2, 3]);
  assert.deepEqual(back.get(5), [true, false, null, 'x', -500, 70000]);
  assert.deepEqual(cborDecode(Buffer.from([0x9f, 0x01, 0x02, 0xff]))[0], [1, 2]);
  assert.equal(cborDecode(Buffer.from([0x7f, 0x61, 0x61, 0x61, 0x62, 0xff]))[0], 'ab');
  assert.throws(() => cborDecode(Buffer.from([0x58, 0x05, 1, 2])), /truncated/);
});

for (const [name, alg] of [['ES256', ALG.ES256], ['RS256', ALG.RS256]]) {
  test(`WebAuthn ${name}: registration (attestation none) and sign-in verified; wrong challenge, origin, rpId, flags, signature and counter refused`, () => {
    const a = authenticator(alg);
    const ch = b64u(Buffer.from('challenge-' + name));
    const cred = verifyRegistration(a.create({ challenge: ch }), opts(ch));
    assert.equal(cred.id, a.id);
    assert.equal(cred.alg, alg);
    assert.equal(cred.fmt, 'none');
    assert.throws(() => verifyRegistration(a.create({ challenge: 'other' }), opts(ch)), /challenge/);
    assert.throws(() => verifyRegistration(a.create({ challenge: ch, origin: 'https://evil.example' }), opts(ch)), /origin/);
    assert.throws(() => verifyRegistration(a.create({ challenge: ch, rpId: 'evil.example' }), opts(ch)), /rpId/);
    assert.throws(() => verifyRegistration(a.create({ challenge: ch, flags: 0x40 }), opts(ch)), /not present/);
    const c2 = b64u(Buffer.from('second'));
    const r = verifyAssertion(a.get({ challenge: c2 }), cred, opts(c2));
    assert.equal(r.count, 1);
    cred.count = r.count;
    assert.throws(() => verifyAssertion(a.get({ challenge: c2, step: 0 }), cred, opts(c2)), /counter/, 'the same count again: a cloned key');
    const good = a.get({ challenge: c2 });
    const bad = { ...good, response: { ...good.response, signature: b64u(Buffer.from(good.response.signature, 'base64url').map((x, i) => (i === 10 ? x ^ 1 : x))) } };
    assert.throws(() => verifyAssertion(bad, cred, opts(c2)), /signature|counter/);
    assert.throws(() => verifyAssertion(a.get({ challenge: c2, origin: 'https://evil.example' }), cred, opts(c2)), /origin/);
    assert.throws(() => verifyAssertion(a.get({ challenge: 'nope' }), cred, opts(c2)), /challenge/);
  });
}

test('WebAuthn: a synced passkey that always counts 0 is fine; challenges are single-use and expire', () => {
  const a = authenticator(ALG.ES256);
  const ch = b64u(Buffer.from('c'));
  const cred = verifyRegistration(a.create({ challenge: ch }), opts(ch));
  assert.equal(verifyAssertion(a.get({ challenge: ch, step: 0 }), cred, opts(ch)).count, 0);
  assert.equal(verifyAssertion(a.get({ challenge: ch, step: 0 }), cred, opts(ch)).count, 0);
  const c = clock(), C = createChallenges(c.now);
  const issued = C.issue({ kind: 'auth' });
  const cd = b64u(JSON.stringify({ challenge: issued }));
  assert.equal(C.take(cd, 'reg'), null, 'the wrong kind');
  assert.equal(C.take(cd, 'auth').challenge, issued);
  assert.equal(C.take(cd, 'auth'), null, 'once');
  const late = C.issue({ kind: 'auth' });
  c.add(5 * 60e3 + 1);
  assert.equal(C.take(b64u(JSON.stringify({ challenge: late })), 'auth'), null, 'expired');
});

test('passkeys through the endpoints: add one to your account, sign in with it on its own', async () => {
  const S = setup();
  const pid = '4'.repeat(24); S.store.create(pid);
  const auth = { authorization: `Bearer ${S.A.token(pid)}`, origin: 'https://game.example' };
  assert.equal((await S.h({ method: 'POST', url: '/auth/passkey/register/options', headers: { origin: 'https://game.example' }, body: {} })).status, 401, 'signed in first');
  const o = (await S.h({ method: 'POST', url: '/auth/passkey/register/options', headers: auth, body: {} })).json();
  assert.equal(o.rp.id, 'game.example');
  assert.equal(o.attestation, 'none');
  const a = authenticator(ALG.ES256);
  let r = await S.h({ method: 'POST', url: '/auth/passkey/register/verify', headers: auth, body: { ...a.create({ challenge: o.challenge }), name: 'My phone' } });
  assert.equal(r.status, 200, r.body);
  assert.equal(S.A.isGuest(pid), false, 'a passkey makes a member');
  const lo = (await S.h({ method: 'POST', url: '/auth/passkey/login/options', headers: { origin: 'https://game.example' }, body: {} })).json();
  r = await S.h({ method: 'POST', url: '/auth/passkey/login/verify', headers: { origin: 'https://game.example' }, body: a.get({ challenge: lo.challenge, userHandle: b64u(Buffer.from(pid, 'hex')) }) });
  assert.equal(r.status, 200, r.body);
  assert.equal(r.json().pid, pid);
  assert.equal(S.A.checkToken(r.json().token).pid, pid);
  r = await S.h({ method: 'POST', url: '/auth/passkey/login/verify', headers: { origin: 'https://game.example' }, body: a.get({ challenge: lo.challenge }) });
  assert.equal(r.status, 400, 'the challenge was spent');
  assert.equal((await S.h({ method: 'POST', url: '/auth/passkey/login/options', headers: { origin: 'https://evil.example' }, body: {} })).status, 403);
  void fakeConn;
});
