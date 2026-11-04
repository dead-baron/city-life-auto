// The fix check's findings on the launch foundation's review fixes (11-04), one test each (each failed before its fix):
// email sign-in codes and other browsers, the previous characters, the admin log at shutdown and after a crash, the
// update wipe keeping the account, the keyboard on the gate, a stale refusal reason, a wipe's session end, several
// sign-ins under way at once, and sign-out-everywhere's order.
import { clock, call, fakeWorld, fakePlayer } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore, useStore, store } from '../server/store.js';
import { config } from '../server/config.js';
import { createAccounts } from '../server/accounts.js';
import { createAuthHttp, pnMatches } from '../server/authhttp.js';
import { createAdminLog } from '../server/adminlog.js';
import { createLaunch } from '../server/launch.js';
import { keepPrev, keepPn } from '../client/account.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const quiet = { log() {}, warn() {}, error() {} };
const PN = 'page-nonce-0123456789abcdef', OTHER = 'other-page-nonce-0000000000';
const L0 = { publicUrl: 'https://play.example', pageOrigins: ['https://game.example'], rpId: 'game.example', rpName: 'CLA', devOpen: true, google: { id: 'gid', secret: 'gs' }, discord: { id: '', secret: '' }, reddit: { id: '', secret: '' }, email: { key: 'rkey', from: 'x <a@b.c>' }, gaMeasurementId: '' };
function auth(fetchImpl) {
  const c = clock(), s = new MemoryStore(), A = createAccounts({ store: s, secret: 's', now: c.now });
  const H = createAuthHttp({ launch: L0, accounts: A, secret: 's', now: c.now, ip: (r) => r.ip, fetch: fetchImpl, log: quiet });
  return { A, s, h: (o) => call(H.handle, o) };
}
async function emailCode(S, email, pn) {
  const sent = S.sent;
  await S.h({ method: 'POST', url: '/auth/email/start', body: { email, ret: 'https://game.example/', pn } });
  await new Promise((z) => setImmediate(z));
  const t = JSON.parse(sent[sent.length - 1].opt.body).text.match(/t=([A-Za-z0-9_-]+)/)[1];
  const r = await S.h({ method: 'POST', url: '/auth/email/confirm', body: `t=${t}` });
  return new URLSearchParams(new URL(r.headers.location).hash.slice(1));
}
function emailSetup() {
  const sent = [];
  const S = auth(async (url, opt) => { sent.push({ url, opt }); return { ok: true, status: 200, json: async () => ({}) }; });
  S.sent = sent;
  return S;
}

test('A. an email sign-in code from another page (another browser, or sent by someone else) asks before it switches; OAuth\'s never does', async () => {
  const S = emailSetup();
  const attacker = S.A.signIn('email', (await import('../server/auth.js')).keyedHash('email', 'mallory@example.com', 's')).pid;
  S.s.get(attacker).name = 'Mallory';
  const back = await emailCode(S, 'mallory@example.com', OTHER);
  const code = back.get('cla_login');
  assert.ok(code, 'a known email: a login code');
  let r = await S.h({ method: 'POST', url: '/auth/redeem', body: { code, pns: [PN] } });
  assert.equal(r.status, 409, 'not this page\'s: a question, not a switch');
  assert.equal(r.json().confirm, true);
  assert.equal(r.json().name, 'Mallory');
  assert.ok(!r.json().token);
  r = await S.h({ method: 'POST', url: '/auth/redeem', body: { code, pns: [PN], confirm: true } });
  assert.equal(r.status, 200, 'with the player\'s say-so');
  assert.equal(r.json().pid, attacker);
  const back2 = await emailCode(S, 'mallory@example.com', PN);
  assert.equal((await S.h({ method: 'POST', url: '/auth/redeem', body: { code: back2.get('cla_login'), pns: [PN] } })).status, 200, 'this page\'s own: straight in');
  const acc = read('client/account.js');
  assert.match(acc, /Sign in as \$\{e\.body\.name\}\? This replaces the character on this device/);
});

test('I. several sign-ins under way: an emailed link still finishes after Google was pressed', async () => {
  assert.ok(pnMatches({ pns: ['a'.repeat(20), PN] }, PN));
  assert.ok(!pnMatches({ pns: ['a'.repeat(20)] }, PN));
  assert.ok(pnMatches({ pn: PN }, PN));
  const t0 = 1e6;
  let l = keepPn([], 'one-nonce-000000000000', t0);
  l = keepPn(l, 'two-nonce-000000000000', t0 + 1000);
  assert.deepEqual(l.map((x) => x.pn), ['two-nonce-000000000000', 'one-nonce-000000000000'], 'both kept');
  for (let i = 0; i < 9; i++) l = keepPn(l, `n${i}-nonce-0000000000000`, t0 + 2000 + i);
  assert.equal(l.length, 5, 'a few, not all');
  assert.equal(keepPn(l, 'late-nonce-00000000000', t0 + 3600e3).length, 1, 'old ones dropped');
  const S = emailSetup();
  const pid = S.A.signIn('email', (await import('../server/auth.js')).keyedHash('email', 'ann@example.com', 's')).pid;
  const back = await emailCode(S, 'ann@example.com', 'email-flow-nonce-00000000');
  // (then Google was pressed: a newer nonce at the front)
  const r = await S.h({ method: 'POST', url: '/auth/redeem', body: { code: back.get('cla_login'), pns: ['google-flow-nonce-0000000', 'email-flow-nonce-00000000'] } });
  assert.equal(r.status, 200);
  assert.equal(r.json().pid, pid);
});

test('B. the previous characters: up to three, newest first, named; the switch-back rows are in the panel', () => {
  let l = [];
  for (const [t, n] of [['t1', 'Guest1111'], ['t2', 'BigAl'], ['t3', 'Guest3333'], ['t4', 'Ann']]) l = keepPrev(l, { token: t, name: n, at: 0 });
  assert.deepEqual(l.map((x) => x.name), ['Ann', 'Guest3333', 'BigAl']);
  l = keepPrev(l, { token: 't2', name: 'BigAl', at: 1 });
  assert.deepEqual(l.map((x) => x.token), ['t2', 't4', 't3'], 'no doubles');
  const acc = read('client/account.js');
  assert.match(acc, /Switch back to \$\{esc\(p\.name\)\}/);
  assert.match(acc, /export function switchBack\(i\)/);
  assert.ok(!/stays on this device as your previous one/.test(acc), 'the choice\'s text is true now');
});

test('C. the admin log: queued lines are written at stop; a crash between the lines and the head is repaired, not reported as tampering', async () => {
  useStore(new MemoryStore());
  const dir = mkdtempSync(join(tmpdir(), 'cla-alog3-'));
  const world = fakeWorld(); world.stats = { tickMs: 0 };
  const L = createLaunch({ config: { ...config, launch: { ...config.launch } }, store, world, ip: () => '1', dataDir: dir, log: quiet });
  L.adminLog.append({ who: { id: 'a' }, what: 'kick' });
  L.adminLog.append({ who: { id: 'a' }, what: 'ban' });
  L.stop();   // (SIGTERM: index.js shutdown calls it)
  assert.equal(createAdminLog(join(dir, 'admin-log.jsonl')).count, 2, 'nothing queued was lost');
  const f = join(dir, 'admin-log.jsonl'), hf = join(dir, 'admin-log.head.json');
  let A = createAdminLog(f);
  A.append({ who: { id: 'a' }, what: 'kick' }); await A.flush();
  const head = readFileSync(hf, 'utf8');
  A.append({ who: { id: 'a' }, what: 'unban' }); await A.flush();
  writeFileSync(hf, head);   // (killed before the head was renamed into place)
  A = createAdminLog(f);
  A.append({ who: { id: 'a' }, what: 'role' }); A.flushSync();
  assert.deepEqual(A.checkHead(), { ok: true, n: 5 });
  assert.equal(A.verify().ok, true, 'the chain runs on from the repaired head');
  // a file cut short is still reported
  const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean);
  writeFileSync(f, lines.slice(0, -1).join('\n') + '\n');
  assert.equal(createAdminLog(f).checkHead().ok, false);
  assert.match(read('server/index.js'), /launch\.stop\(\)/, 'the shutdown stops it');
});

test('D. the update wipe (CLA_FRESH_ON_UPDATE=all) keeps the account, as Start fresh does', () => {
  const src = read('server/systems/players.js');
  const i = src.indexOf('function wipeProgress'), body = src.slice(i, src.indexOf('\n}\n', i));
  assert.match(body, /if \(prof\.acct\) \{ keep\.acct = prof\.acct;/);
});

test('E. the keyboard on the 17+ gate: Enter doesn\'t start the game under it; Tab, Enter and Space work inside it', () => {
  const main = read('client/main.js'), input = read('client/input.js'), acc = read('client/account.js');
  const i = main.indexOf('initInput(canvas, {'), onKey = main.slice(i, i + 600);
  assert.match(onKey, /if \(document\.querySelector\('\[data-cla-modal\]'\)\) return;/, 'no game keys while it\'s up');
  assert.match(input, /e\.target\.closest\('\[data-cla-modal\]'\)\) return;/, 'its own keys reach it (Tab isn\'t swallowed)');
  const g = acc.slice(acc.indexOf('export function showGate'), acc.indexOf('export function showGate') + 2500);
  assert.match(g, /keyboardDialog\(ov\)/, 'focus starts in it and Tab goes round inside');
  assert.match(acc, /export function keyboardDialog\(m\)/);
});

test('G. a refusal shows its own reason: none left over from an earlier connection, never one for the age gate', () => {
  const main = read('client/main.js');
  const c = main.slice(main.indexOf('function connect() {'), main.indexOf('function connect() {') + 900);
  assert.match(c, /S\.refusedWhy = null;/);
  assert.match(main, /const why = \(code !== 4011 && S\.refusedWhy\) \|\|/);
});

test('H. a wipe ends the session like any leaving: the analytics session closed, the money watcher let go', () => {
  const src = read('server/session.js');
  const i = src.indexOf("if (msg.t === 'wipe')"), body = src.slice(i, i + 500);
  assert.ok(body.indexOf('hooks.leave(p)') > 0 && body.indexOf('hooks.leave(p)') < body.indexOf('players.wipeAccount'), 'before the wipe');
});

test('F. sign-out everywhere: the reply first, the sessions closed a moment later', async () => {
  useStore(new MemoryStore());
  const world = fakeWorld(); world.stats = { tickMs: 0 };
  const L = createLaunch({ config: { ...config, launch: { ...config.launch } }, store, world, ip: () => '1', dataDir: null, log: quiet, signOutCloseMs: 50 });
  const p = fakePlayer(world, store);
  L.hooks.join(p, {}, {});
  L.accounts.get(p.pid).kind = 'member';
  const r = await call(L.authHttp.handle, { method: 'POST', url: '/auth/signout-all', headers: { authorization: `Bearer ${L.accounts.token(p.pid)}` } });
  assert.equal(r.status, 200);
  assert.equal(p.conn.open, true, 'still open as the reply goes');
  await new Promise((z) => setTimeout(z, 80));
  assert.equal(p.conn.code, 4015);
});

// ---- the owner's decisions (11-04) ----
test('J. the devices\' reports and the pages\' errors are for admins and the owner: behind the staff login; the old addresses point there', async () => {
  const { createAdminHttp } = await import('../server/adminhttp.js');
  const { createModeration } = await import('../server/moderation.js');
  useStore(new MemoryStore());
  const c = clock(), A = createAccounts({ store, secret: 's', now: c.now });
  const mk = (role) => { const pid = (role || 'none').padEnd(4, 'x').split('').map((ch) => ch.charCodeAt(0).toString(16)).join('').slice(0, 8).padEnd(24, '0'); store.create(pid); A.ensure(store.get(pid)).kind = 'member'; if (role) A.setRole(pid, role); return pid; };
  const H = createAdminHttp({ accounts: A, log: createAdminLog(null), mod: createModeration({ store }), analytics: { data: { days: {}, cohorts: {}, conc: [] }, norm: () => 0 }, publicUrl: 'https://play.example', ip: () => '1', now: c.now, texts: { perf: () => 'PERF REPORTS', errors: () => 'PAGE ERRORS' } });
  const enter = async (pid, page) => { const u = new URL(H.pageLink(pid, page)); const r = await call(H.handle, { url: u.pathname + u.search }); return r.headers['set-cookie'].match(/cla_admin=([^;]+)/)[1]; };
  assert.equal((await call(H.handle, { url: '/admin/perf' })).status, 401, 'signed out');
  const helper = await enter(mk('helper'), 'reviews');
  assert.equal((await call(H.handle, { url: '/admin/clienterrors', headers: { cookie: `cla_admin=${helper}` } })).status, 403, 'not a helper\'s');
  const admin = await enter(mk('admin'), 'perf');
  const r = await call(H.handle, { url: '/admin/perf', headers: { cookie: `cla_admin=${admin}` } });
  assert.equal(r.status, 200);
  assert.equal(r.body, 'PERF REPORTS');
  assert.equal((await call(H.handle, { url: '/admin/clienterrors', headers: { cookie: `cla_admin=${admin}` } })).body, 'PAGE ERRORS');
  const index = read('server/index.js');
  assert.match(index, /if \(path === '\/perf' \|\| path === '\/clienterrors'\) \{ res\.writeHead\(302, \{ location: `\/admin\$\{path\}`/);
  assert.ok(!/res\.end\(reportsText\(world\)\)/.test(index), 'nothing served in the open');
  assert.match(read('server/session.js'), /msg\.t === 'cerr'/, 'the pages still send their errors');
});

function crewWorld(providers) {
  useStore(new MemoryStore());
  const world = fakeWorld(); world.stats = { tickMs: 0 }; world.time = 100;
  const cfg = { ...config, launch: { ...config.launch, google: providers ? { id: 'g', secret: 's' } : { id: '', secret: '' }, discord: { id: '', secret: '' }, reddit: { id: '', secret: '' }, email: { key: '', from: '' } } };
  const L = createLaunch({ config: cfg, store, world, ip: () => '1', dataDir: null, log: quiet });
  const P = (member) => { const p = fakePlayer(world, store, { x: 0, y: 0 }); L.hooks.join(p, {}, {}); if (member) L.accounts.get(p.pid).kind = 'member'; return p; };
  return { L, world, P };
}
test('K. while a sign-in is on offer, guests can\'t start or lead a crew or post a bounty - told to sign in; with none, nothing changes', async () => {
  const crews = await import('../server/systems/crews.js');
  const bounties = await import('../server/systems/bounties.js');
  let S = crewWorld(true);
  const g = S.P(false), m = S.P(true), m2 = S.P(true);
  assert.equal(crews.invite(S.world, g, m), false, 'a guest can\'t start one');
  assert.ok(S.world.notes.some((n) => n.p === g && /sign in/.test(n.text)));
  assert.equal(bounties.place(S.world, g, m.pid, 1000), bounties.GUEST_BOUNTY);
  assert.match(bounties.GUEST_BOUNTY, /sign in/);
  assert.notEqual(bounties.place(S.world, m, g.pid, 1000), bounties.GUEST_BOUNTY, 'a member goes on to the usual checks');
  // a guest can join a member's crew; when the member leaves, another member leads, not the guest
  assert.ok(crews.invite(S.world, m, g));
  assert.ok(crews.accept(S.world, g));
  S.world.time += 100;
  assert.ok(crews.invite(S.world, m, m2));
  assert.ok(crews.accept(S.world, m2));
  crews.leave(S.world, m);
  assert.equal(crews.crewOf(g.pid).lead, m2.pid);
  // no provider switched on: today's game
  S = crewWorld(false);
  const g2 = S.P(false), g3 = S.P(false);
  assert.ok(crews.invite(S.world, g2, g3), 'guests start crews as before');
  assert.notEqual(bounties.place(S.world, g2, g3.pid, 1000), bounties.GUEST_BOUNTY);
});

test('L. the biker faction channel waits until biker groups exist: no biker chat, the flag off', async () => {
  const { FACTIONS } = await import('../shared/chatdefs.js');
  assert.equal(FACTIONS.biker, false);
  const S = crewWorld(false);
  const a = S.P(true), b = S.P(true);
  a.profile.biker = 'crows'; b.profile.biker = 'crows';
  const r = S.L.chat.handle(S.world, a, { t: 'chat', ch: 'faction', text: 'ride out' });
  assert.match(r.err, /not in a faction/);
  assert.equal(b.conn.sent.filter((m) => m.t === 'chat').length, 0);
  assert.ok(!/biker/i.test(read('client/chat.js')), 'nothing on the page offers it');
});
