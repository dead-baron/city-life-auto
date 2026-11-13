// Email + password sign-in (the owner, 11-12: server/passwords.js, authhttp.js, newslist.js): sign up, sign in, a wrong
// password, the lockout, a reset by email through a fake mailer (one use, 30 minutes, a one-button page), the address
// check, linking to the guest on the page keeps its progress, nothing says whether an address has an account, the
// opt-in news list (unchecked by default, an unsubscribe link, the owner's CSV in the admin log) and the legal drafts.
import { clock, call, fakeWorld, fakePlayer } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoryStore, useStore, store } from '../server/store.js';
import { config } from '../server/config.js';
import { createLaunch } from '../server/launch.js';
import { hashPassword, verifyPassword, passwordProblem, normEmail } from '../server/passwords.js';
import { ACCOUNT } from '../shared/rules.js';

const quiet = { log() {}, warn() {}, error() {} };
const ORIGIN = 'https://game.example';
const PW = 'correct horse battery staple';
function setup({ resend = true, passwords = true } = {}) {
  useStore(new MemoryStore());
  const world = fakeWorld(); world.stats = { tickMs: 0 };
  const c = clock(), mails = [], logged = [];
  const log = { log: (...a) => logged.push(a.join(' ')), warn: (...a) => logged.push(a.join(' ')), error: (...a) => logged.push(a.join(' ')) };
  const cfg = { ...config, launch: { ...config.launch, publicUrl: 'https://play.example', pageOrigins: [ORIGIN], devOpen: true, google: { id: '', secret: '' }, discord: { id: '', secret: '' }, passwords, email: { key: resend ? 'rkey' : '', from: 'CLA <a@b.c>' }, mailAddress: '1 Test Street, Testville', gaMeasurementId: '' } };
  const L = createLaunch({ config: cfg, store, world, ip: (r) => r.ip, dataDir: null, now: c.now, log, signOutCloseMs: 0, mail: (m) => { mails.push(m); return true; } });
  const h = (o) => call(L.http, { ...o, headers: { origin: ORIGIN, ...(o.headers || {}) } });
  const post = (path, body, o = {}) => h({ method: 'POST', url: path, body, ...o });
  const join = (o = {}) => { const p = fakePlayer(world, store, o); L.hooks.join(p, {}, {}); return p; };
  return { L, world, c, mails, logged, h, post, join };
}
const tick = () => new Promise((z) => setImmediate(z));
const linkIn = (mail, path) => mail.text.match(new RegExp(`https://play\\.example${path}\\?t=([A-Za-z0-9_.-]+)`))[1];
const form = (o) => new URLSearchParams(o).toString();

test('passwords: scrypt with a salt each, constant-time checked; the rules (length, the common ones, the address)', async () => {
  const a = await hashPassword(PW), b = await hashPassword(PW);
  assert.match(a, /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b, 'a random salt each time');
  assert.ok(!a.includes(PW));
  assert.equal(await verifyPassword(PW, a), true);
  assert.equal(await verifyPassword(PW + '!', a), false);
  assert.equal(await verifyPassword(PW, null), false, 'no hash: checked against a dummy, false');
  assert.match(readFileSync(new URL('../server/passwords.js', import.meta.url), 'utf8'), /timingSafeEqual\(w, k\)/);
  assert.match(passwordProblem('short'), new RegExp(`at least ${ACCOUNT.pwMin}`));
  for (const bad of ['password123', 'Password123', '1234567890', 'qwertyuiop', 'aaaaaaaaaaaa', 'abcdefghijk', 'citylifeauto']) assert.ok(passwordProblem(bad), bad);
  assert.ok(passwordProblem('ann.smith@example.com', 'ann.smith@example.com'), 'not the address');
  assert.equal(passwordProblem('a long passphrase about tacos and rain at midnight'), null, 'long passphrases welcome');
  assert.ok(passwordProblem('x'.repeat(ACCOUNT.pwMax + 1)));
  assert.equal(normEmail('  Ann@Example.COM '), 'ann@example.com');
  assert.equal(normEmail('not an email'), null);
});

test('sign up, then sign in on another device; a wrong password and an unknown address get the same answer; the password is never kept or logged', async () => {
  const S = setup();
  let r = await S.post('/auth/password/signup', { email: 'Ann@Example.com', password: PW, confirm: PW, action: 'new' });
  assert.equal(r.status, 200, r.body);
  const j = r.json();
  assert.ok(j.created && j.token && j.pid);
  const acct = S.L.accounts.get(j.pid);
  assert.equal(acct.kind, 'member');
  const dump = JSON.stringify(store.all());
  assert.ok(!dump.includes(PW) && !dump.toLowerCase().includes('ann@example.com'), 'no password, no address - a hash of each');
  assert.equal(S.L.accounts.passwordOf(j.pid).vf, 0, 'not confirmed yet');
  await tick();
  assert.equal(S.mails.length, 1, 'a confirm-your-email mail (Resend on)');
  assert.match(S.mails[0].subject, /Confirm/);
  r = await S.post('/auth/password/login', { email: ' ann@EXAMPLE.com', password: PW });
  assert.equal(r.status, 200, r.body);
  assert.equal(r.json().pid, j.pid);
  assert.equal(S.L.accounts.checkToken(r.json().token).pid, j.pid);
  const wrong = await S.post('/auth/password/login', { email: 'ann@example.com', password: PW + 'x' });
  const nobody = await S.post('/auth/password/login', { email: 'nobody@example.com', password: PW });
  assert.equal(wrong.status, 401); assert.equal(nobody.status, 401);
  assert.equal(wrong.json().err, nobody.json().err, 'the same words whatever was wrong');
  assert.equal(wrong.json().err, 'Wrong email or password.');
  assert.ok(!S.logged.join('\n').includes(PW), 'never logged');
  // only from the game's own pages (and never a password in a URL: POST bodies only)
  assert.equal((await S.post('/auth/password/login', { email: 'ann@example.com', password: PW }, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await S.h({ url: '/auth/password/login?email=ann@example.com&password=x' })).status, 405);
  // the address check: a one-button page, then confirmed
  const vt = linkIn(S.mails[0], '/auth/password/verify');
  r = await S.h({ url: `/auth/password/verify?t=${vt}` });
  assert.equal(r.status, 200); assert.match(r.body, /<form method="post"/);
  assert.equal(S.L.accounts.passwordOf(j.pid).vf, 0, 'opening it confirms nothing (a mail scanner)');
  await S.h({ method: 'POST', url: '/auth/password/verify', body: form({ t: vt }) });
  assert.ok(S.L.accounts.passwordOf(j.pid).vf > 0);
});

test('the lockout: wrong passwords for one address lock it for a while - an address without an account too (nothing learnt)', async () => {
  const S = setup();
  await S.post('/auth/password/signup', { email: 'bo@example.com', password: PW, confirm: PW, action: 'new' });
  for (let i = 0; i < ACCOUNT.lockTries; i++) {
    assert.equal((await S.post('/auth/password/login', { email: 'bo@example.com', password: 'wrong wrong wrong' }, { ip: `10.0.0.${i}` })).status, 401);
    assert.equal((await S.post('/auth/password/login', { email: 'ghost@example.com', password: 'wrong wrong wrong' }, { ip: `10.0.1.${i}` })).status, 401);
  }
  const a = await S.post('/auth/password/login', { email: 'bo@example.com', password: PW }, { ip: '10.0.2.1' });
  const b = await S.post('/auth/password/login', { email: 'ghost@example.com', password: PW }, { ip: '10.0.2.2' });
  assert.equal(a.status, 429, 'even the right password waits');
  assert.equal(b.status, 429);
  assert.equal(a.json().err, b.json().err, 'an account or not: the same');
  S.c.add(ACCOUNT.lockMin * 60e3 + 1);
  assert.equal((await S.post('/auth/password/login', { email: 'bo@example.com', password: PW }, { ip: '10.0.2.3' })).status, 200, 'over after the wait');
  // and per address: too many tries from one address
  let last = 0;
  for (let i = 0; i < 25; i++) last = (await S.post('/auth/password/login', { email: `x${i}@example.com`, password: 'nope nope nope' }, { ip: '10.9.9.9' })).status;
  assert.equal(last, 429);
});

test('forgot password: one link by email, a page that asks for the new one, works once, 30 minutes; the same answer for any address', async () => {
  const S = setup();
  const { pid } = (await S.post('/auth/password/signup', { email: 'cy@example.com', password: PW, confirm: PW, action: 'new' })).json();
  const old = S.L.accounts.token(pid);
  await tick(); S.mails.length = 0;
  const a = await S.post('/auth/password/forgot', { email: 'cy@example.com' });
  const b = await S.post('/auth/password/forgot', { email: 'nobody@example.com' });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.deepEqual(a.json(), b.json(), 'nothing says whether an account uses it');
  await tick();
  assert.equal(S.mails.length, 1, 'mail only to the real one');
  assert.equal(S.mails[0].to, 'cy@example.com');
  const t = linkIn(S.mails[0], '/auth/password/reset');
  let r = await S.h({ url: `/auth/password/reset?t=${t}` });
  assert.equal(r.status, 200);
  assert.match(r.body, /type="password" name="pw"/, 'the page asks for it (opening the link changes nothing)');
  r = await S.h({ method: 'POST', url: '/auth/password/reset', body: form({ t, pw: 'new pass phrase here', pw2: 'not the same one' }) });
  assert.equal(r.status, 400);
  r = await S.h({ method: 'POST', url: '/auth/password/reset', body: form({ t, pw: 'new pass phrase here', pw2: 'new pass phrase here' }) });
  assert.equal(r.status, 200, r.body);
  assert.match(r.body, /Password changed/);
  assert.equal(S.L.accounts.checkToken(old), null, 'the other devices signed out');
  assert.ok(S.L.accounts.passwordOf(pid).vf > 0, 'the address is confirmed: the link came to it');
  assert.equal((await S.post('/auth/password/login', { email: 'cy@example.com', password: PW })).status, 401, 'the old one is gone');
  assert.equal((await S.post('/auth/password/login', { email: 'cy@example.com', password: 'new pass phrase here' })).status, 200);
  r = await S.h({ method: 'POST', url: '/auth/password/reset', body: form({ t, pw: 'third pass phrase', pw2: 'third pass phrase' }) });
  assert.equal(r.status, 410, 'once');
  // 30 minutes
  await S.post('/auth/password/forgot', { email: 'cy@example.com' }, { ip: '8.8.8.8' });
  await tick();
  const t2 = linkIn(S.mails[S.mails.length - 1], '/auth/password/reset');
  S.c.add(ACCOUNT.resetMin * 60e3 + 1);
  assert.equal((await S.h({ url: `/auth/password/reset?t=${t2}` })).status, 410, 'expired');
  assert.equal((await S.h({ url: `/auth/password/reset?t=${t2.slice(0, -3)}abc` })).status, 410, 'a forged one');
});

test('an old magic-link account (an email login, no password) sets one with Forgot password; with no Resend key, resets say they aren\'t available', async () => {
  const S = setup();
  const { keyedHash } = await import('../server/auth.js');
  const pid = 'f'.repeat(24); store.create(pid);   // (a new profile: the accounts' index is built afresh)
  const a = S.L.accounts.ensure(store.get(pid));
  a.kind = 'member'; a.logins.push({ p: 'email', sub: keyedHash('email', 'old@example.com', config.secret), at: 1 });
  assert.equal((await S.post('/auth/password/signup', { email: 'old@example.com', password: PW, confirm: PW, action: 'new' })).status, 409, 'no second account for that address');
  await S.post('/auth/password/forgot', { email: 'old@example.com' });
  await tick();
  const t = linkIn(S.mails[S.mails.length - 1], '/auth/password/reset');
  assert.equal((await S.h({ method: 'POST', url: '/auth/password/reset', body: form({ t, pw: PW, pw2: PW }) })).status, 200);
  assert.equal((await S.post('/auth/password/login', { email: 'old@example.com', password: PW })).json().pid, pid);
  const N = setup({ resend: false });
  assert.equal((await N.post('/auth/password/forgot', { email: 'a@example.com' })).status, 503);
  assert.match((await N.post('/auth/password/forgot', { email: 'a@example.com' })).json().err, /aren't available yet/);
  assert.equal((await N.h({ url: '/launch.json' })).json().resets, false);
  const r = await N.post('/auth/password/signup', { email: 'dee@example.com', password: PW, confirm: PW, action: 'new' });
  assert.equal(r.status, 200, 'passwords work without Resend');
  assert.equal(r.json().verifySent, false);
  assert.equal(N.mails.length, 0);
  const off = setup({ passwords: false });
  assert.equal((await off.post('/auth/password/login', { email: 'a@example.com', password: PW })).status, 404, 'CLA_PASSWORDS=0');
});

test('link to the character I\'m playing: the guest\'s progress kept, its name too, white over its head; a link needs the page\'s own token', async () => {
  const S = setup();
  const g = S.join({ name: 'Saltwater' });
  g.ped.appVer = 3;
  g.profile.bank = 4321; g.profile.criminalExp = 55;
  assert.equal(g.guest, true);
  assert.equal((await S.post('/auth/password/signup', { email: 'eve@example.com', password: PW, confirm: PW, action: 'link' })).status, 401, 'signed in on the page first');
  const r = await S.post('/auth/password/signup', { email: 'eve@example.com', password: PW, confirm: PW, action: 'link' }, { headers: { authorization: `Bearer ${S.L.accounts.token(g.pid)}` } });
  assert.equal(r.status, 200, r.body);
  assert.equal(r.json().pid, g.pid);
  assert.ok(r.json().linked);
  assert.equal(S.L.accounts.isGuest(g.pid), false);
  assert.equal(store.get(g.pid).bank, 4321); assert.equal(store.get(g.pid).criminalExp, 55);
  assert.equal(g.name, 'Saltwater', 'the name kept');
  assert.equal(g.guest, false);
  assert.ok(g.ped.appVer > 3, 'the descriptor sent again (net.js gu gone)');
  assert.equal(S.L.acctState(g).email, true);
  assert.equal((await S.post('/auth/password/login', { email: 'eve@example.com', password: PW })).json().pid, g.pid);
  // a second address on the same account: refused; the same address for another account: refused
  assert.equal((await S.post('/auth/password/signup', { email: 'eve2@example.com', password: PW, confirm: PW, action: 'link' }, { headers: { authorization: `Bearer ${S.L.accounts.token(g.pid)}` } })).status, 409);
  const other = S.join();
  assert.equal((await S.post('/auth/password/signup', { email: 'eve@example.com', password: PW, confirm: PW, action: 'link' }, { headers: { authorization: `Bearer ${S.L.accounts.token(other.pid)}` } })).status, 409);
  assert.equal(S.L.accounts.isGuest(other.pid), true, 'nothing merged');
  // the page asks the question; the choice is its (client/account.js)
  const acc = readFileSync(new URL('../client/account.js', import.meta.url), 'utf8');
  assert.match(acc, /Link it to the character I’m playing \(keeps its progress\)/);
  assert.match(acc, /<input id="a-news" type="checkbox">/, 'the news box starts unticked');
  assert.match(acc, /autocomplete="current-password"/); assert.match(acc, /autocomplete="new-password"/);
});

test('the news list: opt-in only, kept apart, an unsubscribe link with one button, the owner\'s CSV logged; members turn it on in Settings', async () => {
  const S = setup();
  await S.post('/auth/password/signup', { email: 'no-news@example.com', password: PW, confirm: PW, action: 'new' });
  assert.equal(S.L.news.count, 0, 'unticked: nothing kept');
  const { pid } = (await S.post('/auth/password/signup', { email: 'News@Example.com', password: PW, confirm: PW, action: 'new', news: true })).json();
  assert.equal(S.L.news.count, 1);
  const e = S.L.news.byPid(pid);
  assert.equal(e.email, 'news@example.com'); assert.equal(e.src, 'signup'); assert.ok(e.at && e.t);
  assert.ok(!JSON.stringify(store.get(pid)).includes('news@example.com'), 'not on the account');
  assert.match(S.L.news.newsFooter(e), new RegExp(`https://play\\.example/auth/news/unsubscribe\\?t=${e.t}`));
  assert.match(S.L.news.newsFooter(e), /1 Test Street, Testville/, 'the postal address (CLA_MAIL_ADDRESS)');
  let r = await S.h({ url: `/auth/news/unsubscribe?t=${e.t}` });
  assert.match(r.body, /<form method="post"/);
  assert.equal(S.L.news.count, 1, 'opening the link unsubscribes nobody');
  // Settings: a member (Google, Discord, anyone) turns it on with an address, off at once; a guest can't
  const m = S.join(); S.L.accounts.signIn('google', 'g-news', { linkPid: m.pid });
  let a = S.L.hooks.message(m, { t: 'acct', a: 'news', on: true, email: 'gina@example.com' });
  assert.equal(a.ok, true);
  assert.equal(S.L.news.byPid(m.pid).src, 'settings');
  assert.match(S.L.acctState(m).news, /^g•••@example\.com$/);
  const g = S.join();
  assert.equal(S.L.hooks.message(g, { t: 'acct', a: 'news', on: true, email: 'x@example.com' }).ok, false);
  // the owner's CSV: owner only, in the admin log
  const owner = S.join(); S.L.accounts.signIn('google', 'g-owner', { linkPid: owner.pid }); S.L.accounts.setRole(owner.pid, 'owner');
  const admin = S.join(); S.L.accounts.signIn('google', 'g-admin', { linkPid: admin.pid }); S.L.accounts.setRole(admin.pid, 'admin');
  const enter = async (pid) => { const c = new URL(S.L.adminHttp.pageLink(pid, 'news')).searchParams.get('c'); const x = await S.h({ url: `/admin/enter?c=${c}` }); return x.headers['set-cookie'].match(/cla_admin=([^;]+)/)[1]; };
  const ca = await enter(admin.pid);
  assert.equal((await S.h({ url: '/admin/news.csv', headers: { cookie: `cla_admin=${ca}` } })).status, 403, 'not for an admin');
  const co = await enter(owner.pid);
  r = await S.h({ url: '/admin/news', headers: { cookie: `cla_admin=${co}` } });
  assert.match(r.body, /asked for game news by email: <b>2<\/b>/);
  r = await S.h({ url: '/admin/news.csv', headers: { cookie: `cla_admin=${co}` } });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/csv/);
  assert.match(r.headers['content-disposition'], /attachment/);
  assert.match(r.body, /^email,opted_in_utc,source,unsubscribe_url\r\n/);
  assert.match(r.body, /news@example\.com,[^,]+,signup,https:\/\/play\.example\/auth\/news\/unsubscribe\?t=/);
  assert.ok(S.L.adminLog.tail(10).some((x) => x.what === 'news-export' && x.who.id === owner.pid && x.ok));
  // unsubscribing: gone
  await S.h({ method: 'POST', url: '/auth/news/unsubscribe', body: form({ t: e.t }) });
  assert.equal(S.L.news.byPid(pid), null);
  a = S.L.hooks.message(m, { t: 'acct', a: 'news', on: false });
  assert.equal(S.L.news.count, 0);
  // a cell that starts like a formula is defused
  S.L.news.optIn('=cmd@example.com', 'settings', 'x');
  assert.match(S.L.news.csv(), /\n'=cmd@example\.com,/);
});

test('the legal drafts: served by the game, marked DRAFT, saying what is kept; Settings opens them', async () => {
  const S = setup();
  const p = await S.h({ url: '/legal/privacy' }), t = await S.h({ url: '/legal/terms' });
  assert.equal(p.status, 200); assert.equal(t.status, 200);
  for (const r of [p, t]) assert.match(r.body, /DRAFT - not yet reviewed by a lawyer/);
  for (const w of [/17 and older/, /keyed one-way hash/, /scrypt/, /Resend/, /Google Analytics 4/, /don't keep IP addresses/, /game-icons\.net/, /CC BY 3\.0/, /Kenney/, /CC0/, /unsubscribe/i, /delete your whole account/]) assert.match(p.body, w);
  assert.match(t.body, /17 or older/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /data-legal="terms"/); assert.match(html, /data-legal="privacy"/);
  assert.ok(!/coming with the launch/.test(html));
  assert.match(readFileSync(new URL('../client/account.js', import.meta.url), 'utf8'), /\/legal\/\$\{b\.dataset\.legal\}/);
});
