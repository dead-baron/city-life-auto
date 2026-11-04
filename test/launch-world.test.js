// The launch foundation in a running world (server/launch.js through server/session.js, as server/index.js wires it):
// an old guest's token and profile come through untouched; bans and kicks are refused at the door; a non-admin is
// refused every privileged message once the open debug mode is closed; chat goes through the session; money, deaths
// and crimes reach the analytics; a helper's rescue; the movement audit on real moves.
import { makeWorld, fakeConn, store, run } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { config } from '../server/config.js';
import { createLaunch } from '../server/launch.js';
import { createSession } from '../server/session.js';
import { POWERS } from '../server/roles.js';
import * as players from '../server/systems/players.js';
import * as law from '../server/systems/law.js';
import * as devmode from '../server/devmode.js';

const quiet = { log() {}, warn() {}, error() {} };
function boot({ devOpen = true, google = false } = {}) {
  const world = makeWorld();
  const cfg = { ...config, launch: { ...config.launch, devOpen, gaMeasurementId: '', gaApiSecret: '', requireAge: false, google: google ? { id: 'gid', secret: 'gs' } : { id: '', secret: '' } } };
  const L = createLaunch({ config: cfg, store, world, ip: () => '1.2.3.4', dataDir: null, log: quiet });
  const connect = (token = null, extra = {}) => {
    const conn = fakeConn();
    conn.close = function (code) { this.open = false; this.code = code; };
    const s = createSession(world, conn, { seed: 1337, dev: false, maxPlayers: 50, label: 'test', login: (t, h) => L.login(t, h, '1.2.3.4'), hooks: L.hooks });
    s.onMessage(JSON.stringify({ t: 'hello', token, dm: 'ab'.repeat(16), ...extra }), false);
    const welcome = conn.sent.find((m) => m.t === 'welcome');
    const p = welcome ? world.players.get(welcome.pid) : null;
    if (p && p.ped) p.ped.protectUntil = 0;
    const say = (m) => s.onMessage(JSON.stringify(m), false);
    return { conn, s, welcome, p, say, last: (t) => [...conn.sent].reverse().find((m) => m.t === t) };
  };
  return { world, L, connect };
}
const oldToken = (pid) => { const pl = Buffer.from(JSON.stringify({ pid, iat: 1 })).toString('base64url'); return `${pl}.${createHmac('sha256', config.secret).update(pl).digest('base64url')}`; };

test('an old guest comes back: the same token, the same progress, an account made for it; a new page is a new guest', () => {
  const B = boot();
  const pid = '5'.repeat(24);
  const prof = store.create(pid);
  Object.assign(prof, { name: 'Guest7777', cash: 4321, bank: 87654, criminalExp: 99 });
  delete prof.acct;
  const tok = oldToken(pid);
  const c = B.connect(tok);
  assert.equal(c.welcome.pid, pid);
  assert.equal(c.welcome.token, tok, 'the token it had keeps working');
  assert.equal(c.p.profile.bank, 87654);
  assert.equal(c.p.profile.criminalExp, 99);
  assert.equal(c.p.name, 'Guest7777');
  const acct = c.last('acct');
  assert.equal(acct.guest, true);
  assert.equal(acct.id, pid);
  const g = B.connect(null);
  assert.ok(g.welcome && g.welcome.pid !== pid);
  assert.match(g.p.name, /^Guest\d{4}$/);
  B.L.stop();
});

test('at the door: a banned account and a banned device are refused; a kicked player waits a minute', () => {
  const B = boot();
  const c = B.connect(null);
  const pid = c.p.pid, tok = c.welcome.token;
  B.L.accounts.ban(pid, { hours: 1, why: 'cheating' });
  const again = B.connect(B.L.accounts.token(pid));
  assert.equal(again.welcome, undefined);
  assert.match(again.last('kicked').reason, /banned.*cheating/);
  assert.equal(again.conn.code, 4010);
  const fresh = B.connect(null);   // (the same device marker, no token: a new guest from a banned device)
  assert.equal(fresh.welcome, undefined, 'the device marker');
  B.L.accounts.unban(pid);
  const k = B.connect(B.L.accounts.token(pid));
  const owner = B.connect(null);
  B.L.accounts.setRole(owner.p.pid, 'owner');
  owner.say({ t: 'admin', a: 'kick', id: k.p.pid, why: 'test' });
  assert.equal(k.conn.code, 4009);
  assert.match(B.connect(B.L.accounts.token(pid)).last('kicked').reason, /wait a minute/);
  void tok;
  B.L.stop();
});

test('launch mode (devOpen off): a non-admin is refused every privileged message, dev mode and the debug commands', () => {
  const B = boot({ devOpen: false });
  const c = B.connect(null), target = B.connect(null);
  const cash = c.p.profile.cash;
  for (const a of Object.keys(POWERS)) {
    c.p.acRate = null;
    c.say({ t: 'admin', a, id: target.p.pid, role: 'admin', hours: 1, item: 'bandage' });
    const r = c.last('admin');
    assert.equal(r.a, a);
    assert.equal(r.ok, false, `${a} refused`);
  }
  c.say({ t: 'devmode' });
  assert.ok(!c.p.devMode, 'no dev mode');
  c.p.devMode = true;   // (even if something set it: every debug command asks for the role again)
  c.say({ t: 'dev', c: 'money' });
  assert.equal(c.p.profile.cash, cash, 'no money from the debug menu');
  c.p.devMode = false;
  assert.equal(B.L.accounts.role(target.p.pid), null);
  // the admin role opens it, and every command is logged
  B.L.accounts.setRole(c.p.pid, 'admin');
  c.say({ t: 'devmode' });
  assert.ok(c.p.devMode);
  c.say({ t: 'dev', c: 'money' });
  assert.equal(c.p.profile.cash, cash + 5000);
  assert.ok(B.L.adminLog.tail(5).some((e) => e.what === 'dev' && e.note === 'money' && e.who.id === c.p.pid));
  devmode.setPolicy({ open: true, may: () => false });
  B.L.stop();
});

test('chat through the session; once a sign-in is offered guests can\'t rename, members pick a filtered username', () => {
  const B = boot({ google: true });
  const a = B.connect(null), b = B.connect(null);
  b.p.ped.x = a.p.ped.x + 64; b.p.ped.y = a.p.ped.y; B.world.place(b.p.ped);
  a.say({ t: 'chat', ch: 'near', text: 'hello neighbour' });
  assert.equal(b.last('chat').text, 'hello neighbour');
  const was = a.p.name;
  a.say({ t: 'name', name: 'BigAl' });
  assert.equal(a.p.name, was, 'a guest keeps the Guest number');
  B.L.accounts.signIn('google', 'g-world-1', { linkPid: a.p.pid });
  a.p.acRate = null;
  a.say({ t: 'acct', a: 'name', name: 'Big_D1ck' });
  assert.equal(a.last('acct').ok, false);
  a.p.renameTryAt = 0;
  a.say({ t: 'acct', a: 'name', name: 'BigAl' });
  assert.equal(a.last('acct').ok, true, JSON.stringify(a.last('acct')));
  assert.equal(a.p.name, 'BigAl');
  a.p.renameTryAt = 0; a.p.acRate = null;
  a.say({ t: 'acct', a: 'name', name: 'BigAlTwo' });
  assert.match(a.last('acct').err, /30 days/);
  B.L.stop();
});

test('analytics in the world: debug money attributed to dev, a crime and a death counted, a job done when it paid', () => {
  const B = boot();
  const c = B.connect(null);
  c.say({ t: 'devmode' });
  c.say({ t: 'dev', c: 'money' });
  B.L.halfSecond();
  const d = B.L.analytics.day();
  assert.equal(d.earn.dev, 25000);
  law.crime(B.world, c.p.ped, 'assault', null);
  assert.equal(d.act['crime:assault'], 1);
  players.onPedDeath(B.world, c.p.ped, null, 'You drowned in the bay.');
  assert.equal(d.deaths.drowned, 1);
  c.p.job = { type: 'taxi' };
  B.L.jobsTick();
  B.world.curSys = 'taxijob'; c.p.profile.cash += 120; B.world.curSys = null;
  B.L.halfSecond();
  c.p.job = null;
  B.L.jobsTick();
  assert.equal(d.jobs.taxi, 1);
  assert.equal(d.earn.taxijob, 120);
  B.L.stop();
});

test('a helper rescues a stuck player to the street; the movement audit flags a jump the server didn\'t make', () => {
  const B = boot();
  const h = B.connect(null), p = B.connect(null);
  B.L.accounts.signIn('discord', 'd-helper', { linkPid: h.p.pid });
  B.L.accounts.setRole(h.p.pid, 'helper');
  const x0 = p.p.ped.x;
  h.say({ t: 'admin', a: 'rescue', id: p.p.pid });
  assert.equal(h.last('admin').ok, true, JSON.stringify(h.last('admin')));
  const e = B.L.adminLog.tail(3).find((x) => x.what === 'rescue');
  assert.ok(e && e.before && e.after);
  void x0;
  run(B.world, 0.5);
  B.L.halfSecond();
  run(B.world, 0.5);
  p.p.ped.x += 4000; B.world.place(p.p.ped);
  B.L.halfSecond();
  assert.ok(B.L.ac.flags.some((f) => f.kind === 'teleport' && f.id === p.p.pid), 'flagged');
  assert.ok(!B.L.ac.flags.some((f) => f.id === h.p.pid));
  B.L.stop();
});

test('Start fresh keeps the account - its sign-ins, role, strikes and ban record - and the page keeps its token; only the game starts over', () => {
  const B = boot();
  const c = B.connect(null);
  const pid = c.p.pid, tok = c.welcome.token;
  B.L.accounts.signIn('google', 'g-fresh', { linkPid: pid });
  B.L.accounts.setRole(pid, 'helper');
  B.L.mod.strike(B.L.accounts.get(pid), 'test', 'admin');
  c.p.profile.bank = 99999; c.p.profile.criminalExp = 500;
  c.say({ t: 'wipe' });
  const w = c.last('wiped');
  assert.equal(w.keep, tok, 'the page keeps its token');
  const prof = store.get(pid);
  assert.ok(prof, 'the profile is still there');
  assert.equal(prof.criminalExp, 0);
  assert.equal(prof.bank, 500, 'the progress starts over');
  assert.equal(B.L.accounts.findLogin('google', 'g-fresh'), pid, 'the sign-in still leads here');
  assert.equal(B.L.accounts.role(pid), 'helper');
  assert.equal(B.L.mod.activeStrikes(B.L.accounts.get(pid)), 1);
  const again = B.connect(tok);
  assert.equal(again.welcome.pid, pid, 'back in on the same account');
  B.L.stop();
});

test('a wipe ends the session like any leaving (the analytics, the money watcher); the update wipe keeps the account too', () => {
  const B = boot();
  const c = B.connect(null);
  const pid = c.p.pid, prof = c.p.profile;
  const before = B.L.analytics.day().sessionMs;
  B.world.curSys = 'test'; prof.cash += 1; B.world.curSys = null;   // (the watcher bound to this session's player)
  assert.equal(prof.__mw.p, c.p);
  c.say({ t: 'wipe' });
  assert.equal(prof.__mw.p, null, 'let go');
  assert.ok(B.L.analytics.day().sessionMs >= before && c.p.anStart === 0, 'the session ended');
  B.L.stop();
  // CLA_FRESH_ON_UPDATE=all: a new build wipes the progress - not the account
  const w2 = makeWorld({ build: 'new-build', freshOnUpdate: 'all' });
  const P = store.get(pid);
  B.L.accounts.signIn('google', 'g-update', { linkPid: pid });
  B.L.accounts.setRole(pid, 'helper');
  Object.assign(P, { build: 'old-build', pos: { x: 1, y: 1 }, bank: 4242 });
  const conn = fakeConn();
  players.join(w2, conn, P);
  assert.equal(P.bank, 500, 'the progress went');
  assert.ok(P.acct, 'the account stayed');
  assert.equal(B.L.accounts.role(pid), 'helper');
  assert.equal(B.L.accounts.findLogin('google', 'g-update'), pid);
});
