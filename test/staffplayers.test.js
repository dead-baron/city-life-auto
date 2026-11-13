// The staff's Players page (server/staffplayers.js, served by server/adminhttp.js at /admin/players): it needs the
// staff session and a role that may see players; the actions go through the staff commands (server/admin.js) - the
// same powers, the same admin log; a form without the session's token is refused; destructive actions ask again.
import { clock, fakeWorld, fakePlayer, call } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoryStore, useStore, store } from '../server/store.js';
import { config } from '../server/config.js';
import { createLaunch } from '../server/launch.js';
import { dur } from '../server/staffplayers.js';
import { browserOf } from '../server/perfreports.js';

const quiet = { log() {}, warn() {}, error() {} };
function launch() {
  useStore(new MemoryStore());
  const world = fakeWorld(); world.stats = { tickMs: 0 };
  const c = clock();
  const cfg = { ...config, launch: { ...config.launch, devOpen: true, google: { id: '', secret: '' }, discord: { id: '', secret: '' }, email: { key: '', from: '' } } };
  const L = createLaunch({ config: cfg, store, world, ip: () => '1.2.3.4', dataDir: null, now: c.now, log: quiet, signOutCloseMs: 0 });
  const join = (o = {}, role = null) => {
    const p = fakePlayer(world, store, o);
    L.hooks.join(p, {}, {});
    if (role) { L.accounts.get(p.pid).kind = 'member'; L.accounts.setRole(p.pid, role); }
    return p;
  };
  // a staff session: the one-time link opened, its cookie kept
  const enter = async (pid) => {
    const u = new URL(L.adminHttp.pageLink(pid, 'players'));
    const r = await call(L.http, { url: u.pathname + u.search });
    return `cla_admin=${r.headers['set-cookie'].match(/cla_admin=([^;]+)/)[1]}`;
  };
  const get = (cookie, url) => call(L.http, { url, headers: cookie ? { cookie } : {} });
  const post = (cookie, fields) => call(L.http, { method: 'POST', url: '/admin/players', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
  const csrfOf = (html) => (html.match(/name="csrf" value="([^"]+)"/) || [])[1];
  return { L, world, c, join, enter, get, post, csrfOf };
}

test('the players page needs the staff session and a role that may see players', async () => {
  const T = launch();
  const owner = T.join({ name: 'Boss' }, 'owner'), nobody = T.join({ name: 'Nobody' });
  T.join({ name: 'Racer', wanted: 3 });
  assert.equal((await T.get(null, '/admin/players')).status, 401, 'signed out');
  assert.equal((await T.get(await T.enter(nobody.pid), '/admin/players')).status, 403, 'a player without a role');
  const r = await T.get(await T.enter(owner.pid), '/admin/players');
  assert.equal(r.status, 200);
  for (const n of ['Boss', 'Nobody', 'Racer', 'Midtown', '***', 'Online now: <b>3</b>']) assert.ok(r.body.includes(n), n);
  assert.match(r.body, /<meta http-equiv="refresh" content="15">/, 'refreshes itself, no script');
  assert.match(r.body, /<a href="\/admin\/players">Players<\/a>/, 'in the nav');
  assert.ok(!/<script/i.test(r.body));
  // the game hands out the link (pagelink), for the staff only
  assert.match(T.L.hooks.message(owner, { t: 'admin', a: 'pagelink', page: 'players' }).data.url, /\/admin\/enter\?c=/);
  assert.equal(T.L.hooks.message(nobody, { t: 'admin', a: 'pagelink', page: 'players' }).ok, false);
  assert.match(readFileSync(new URL('../client/account.js', import.meta.url), 'utf8'), /data-page="players"/, 'Settings -> Account -> Staff tools');
});

test('a player\'s page: their account, device, activity, chat and log; seen in the last day listed offline', async () => {
  const T = launch();
  const owner = T.join({ name: 'Boss' }, 'owner'), p = T.join({ name: 'Racer' });
  T.L.accounts.signIn('discord', 'u123', { linkPid: p.pid });
  T.L.hooks.perf({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1', kind: 'touch' }, p);
  T.L.chat.said(p).push({ at: T.c.now(), ch: 'local', text: 'hello there' });
  T.c.add(25 * 60e3);
  const gone = store.create('f'.repeat(24)); gone.name = 'Earlier'; T.L.accounts.ensure(gone); gone.lastSeen = T.c.now() - 3 * 3600e3;
  const old = store.create('e'.repeat(24)); old.name = 'LongAgo'; T.L.accounts.ensure(old); old.lastSeen = T.c.now() - 48 * 3600e3;
  const ck = await T.enter(owner.pid);
  const list = (await T.get(ck, '/admin/players')).body;
  assert.ok(list.includes('signed in (discord)'));
  assert.ok(list.includes('phone · Safari'), 'the device\'s class and browser');
  assert.ok(list.includes('25 min'), 'this session');
  assert.ok(list.includes('on foot'));
  assert.ok(list.includes('Earlier') && !list.includes('LongAgo'), 'offline: the last day only');
  const d = await T.get(ck, `/admin/players?id=${p.pid}`);
  assert.equal(d.status, 200);
  assert.ok(d.body.includes('hello there'), 'their recent chat');
  assert.ok(d.body.includes('session (member)') || d.body.includes('session (guest)'), 'their log');
  assert.ok(T.L.adminLog.tail(5).some((e) => e.what === 'plog' && e.target.id === p.pid && e.who.id === owner.pid), 'a look at their log is logged');
  assert.equal((await T.get(ck, '/admin/players?id=nosuchplayer')).status, 404);
  assert.equal(dur(65 * 60e3), '1 h 05 min');
  assert.deepEqual(browserOf('Mozilla/5.0 Chrome/120.0 Safari/537.36'), { name: 'Chrome', v: '120' });
});

test('actions: the session\'s token is required, destructive ones ask again, and they go through the staff commands (logged)', async () => {
  const T = launch();
  const owner = T.join({ name: 'Boss' }, 'owner'), p = T.join({ name: 'Racer' });
  const ck = await T.enter(owner.pid);
  const csrf = T.csrfOf((await T.get(ck, `/admin/players?id=${p.pid}`)).body);
  assert.ok(csrf, 'each form carries the token');
  assert.equal((await T.post(ck, { id: p.pid, a: 'ban', hours: '24', why: 'cheating', confirm: '1' })).status, 403, 'no token');
  assert.equal((await T.post(ck, { csrf: 'x' + csrf.slice(1), id: p.pid, a: 'ban', hours: '24', why: 'cheating', confirm: '1' })).status, 403, 'a wrong token');
  assert.equal((await call(T.L.http, { method: 'POST', url: '/admin/players', headers: { cookie: ck, 'sec-fetch-site': 'cross-site' }, body: `csrf=${csrf}&id=${p.pid}&a=ban&confirm=1` })).status, 403, 'another site');
  assert.equal(T.L.accounts.banned(p.pid), null);
  // the first post asks; nothing done yet
  const ask = await T.post(ck, { csrf, id: p.pid, a: 'ban', hours: '24', why: 'cheating' });
  assert.equal(ask.status, 200);
  assert.match(ask.body, /Ban Racer for 1 day - "cheating"\?/);
  assert.match(ask.body, /name="confirm" value="1"/);
  assert.equal(T.L.accounts.banned(p.pid), null, 'not until Yes');
  // Yes
  const r = await T.post(ck, { csrf, id: p.pid, a: 'ban', hours: '24', why: 'cheating', confirm: '1' });
  assert.equal(r.status, 303);
  assert.equal(r.headers.location, `/admin/players?id=${p.pid}`);
  assert.ok(T.L.accounts.banned(p.pid));
  assert.equal(p.conn.code, 4010, 'kicked out as from the game');
  const e = T.L.adminLog.tail(5).find((x) => x.what === 'ban');
  assert.equal(e.who.id, owner.pid);
  assert.equal(e.target.id, p.pid);
  assert.equal(e.note, 'cheating');
  assert.match((await T.get(ck, `/admin/players?id=${p.pid}`)).body, /Done: ban\./, 'the result shown once');
  // unban: no second step
  assert.equal((await T.post(ck, { csrf, id: p.pid, a: 'unban' })).status, 303);
  assert.equal(T.L.accounts.banned(p.pid), null);
  assert.ok(T.L.adminLog.tail(5).some((x) => x.what === 'unban' && x.ok !== false));
  // mute and unmute, a strike
  await T.post(ck, { csrf, id: p.pid, a: 'mute', hours: '6', confirm: '1' });
  assert.ok(T.L.mod.mutedUntil(T.L.accounts.get(p.pid)) > T.c.now());
  await T.post(ck, { csrf, id: p.pid, a: 'unmute' });
  assert.equal(T.L.mod.mutedUntil(T.L.accounts.get(p.pid)), 0);
  await T.post(ck, { csrf, id: p.pid, a: 'strike', why: 'slurs', confirm: '1' });
  assert.equal(T.L.mod.activeStrikes(T.L.accounts.get(p.pid)), 1);
  // the token belongs to the session: another staff member's doesn't work in this one
  const admin = T.join({ name: 'Mod' }, 'admin'), ck2 = await T.enter(admin.pid);
  assert.equal((await T.post(ck2, { csrf, id: p.pid, a: 'kick', confirm: '1' })).status, 403);
  // an action that isn't on the page
  assert.equal((await T.post(ck, { csrf, id: p.pid, a: 'role', role: 'admin', confirm: '1' })).status, 400);
  assert.equal(T.L.accounts.role(p.pid), null);
});

test('a helper sees the players but can\'t ban: refused by the staff command, and the refusal logged', async () => {
  const T = launch();
  const helper = T.join({ name: 'Helpy' }, 'helper'), p = T.join({ name: 'Racer' });
  const ck = await T.enter(helper.pid);
  assert.equal((await T.get(ck, '/admin/players')).status, 200, 'helpers may see players (the players and plog powers)');
  const d = await T.get(ck, `/admin/players?id=${p.pid}`);
  assert.equal(d.status, 200);
  assert.ok(!/name="a" value="ban"/.test(d.body), 'no Ban button for a helper');
  assert.ok(!/<a href="\/admin\/reviews">/.test(d.body), 'nor the admins\' pages in the nav');
  const r = await T.post(ck, { csrf: T.csrfOf(d.body), id: p.pid, a: 'ban', hours: '0', why: 'x', confirm: '1' });
  assert.equal(r.status, 303);
  assert.equal(T.L.accounts.banned(p.pid), null, 'not banned');
  assert.match((await T.get(ck, `/admin/players?id=${p.pid}`)).body, /Not done: You don&#39;t have that power\./);
  assert.ok(T.L.adminLog.tail(10).some((e) => e.what === 'ban' && e.ok === false && e.who.id === helper.pid), 'the refusal is in the admin log');
});
