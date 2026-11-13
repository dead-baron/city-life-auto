// The independent review's findings on the launch foundation (11-04), one test each (each failed before its fix):
// the gate and the account panel on a gamepad, admin-log spam and its tail, money noted against the player who's on
// now, reports from throwaway guests, guest renaming before any sign-in is offered, bans and sign-outs, the refusal
// codes the page stops on, and the smaller items.
import { clock, fakeWorld, fakePlayer, call, fakeConn } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore, useStore, store } from '../server/store.js';
import { config } from '../server/config.js';
import { createLaunch } from '../server/launch.js';
import { createAccounts } from '../server/accounts.js';
import { createAdminLog } from '../server/adminlog.js';
import { createAdminHttp } from '../server/adminhttp.js';
import { createModeration, reporterWeight } from '../server/moderation.js';
import { createChat } from '../server/chat.js';
import { createAntiCheat, RATES, DEFAULT_RATE } from '../server/anticheat.js';
import { filter } from '../server/chatfilter.js';
import { watch, settle, release } from '../server/moneywatch.js';
import { moved } from '../server/movemark.js';
import { cookies } from '../server/httputil.js';
import { padMove } from '../client/account.js';
import { createAnalytics as createPageGA } from '../client/analytics.js';
import { CHAT } from '../shared/chatdefs.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const quiet = { log() {}, warn() {}, error() {} };
function launch(over = {}) {
  useStore(new MemoryStore());
  const world = fakeWorld(); world.stats = { tickMs: 0 };
  const c = clock();
  const cfg = { ...config, launch: { ...config.launch, devOpen: true, google: { id: '', secret: '' }, discord: { id: '', secret: '' }, email: { key: '', from: '' }, ...over } };
  const L = createLaunch({ config: cfg, store, world, ip: () => '1.2.3.4', dataDir: null, now: c.now, log: quiet, signOutCloseMs: 0 });
  const join = (o = {}) => { const p = fakePlayer(world, store, o); L.hooks.join(p, {}, {}); return p; };
  return { L, world, c, join };
}

// ---- 1: the gamepad ----
test('1. the gate and the panel on a gamepad: D-pad moves, A presses, B backs out; the title isn\'t driven underneath', () => {
  assert.deepEqual(padMove(3, 0, { nav: 1 }), { idx: 1, act: null });
  assert.deepEqual(padMove(3, 2, { nav: 1 }), { idx: 0, act: null }, 'wraps');
  assert.deepEqual(padMove(3, 0, { lr: -1 }), { idx: 2, act: null });
  assert.deepEqual(padMove(3, 1, { select: true }), { idx: 1, act: 'press' });
  assert.deepEqual(padMove(3, 1, { back: true }), { idx: 1, act: 'back' });
  const main = read('client/main.js'), acc = read('client/account.js');
  assert.match(main, /const inOverlay = overlayPad\(\) \|\| launchPad\(\);/, 'in the city: the pad is the panel\'s while it\'s up');
  assert.match(main, /if \(pollPadForMenus\(\) && !overlayPad\(\) && !launchPad\(\)\) titlePad\(\);/, 'before the city: the title waits while the gate is up');
  assert.match(main, /if \(!inOverlay && !S\.playing\) titlePad\(\);/);
  for (const what of ['export function showGate', 'export async function openPanel', 'function choose(']) {
    const i = acc.indexOf(what), body = acc.slice(i, i + 2500);
    assert.ok(/modals\.push\(/.test(body) && /data-cla-modal|claModal/.test(body), `${what}: the pad drives it`);
  }
  assert.match(acc, /const FOCUS_CSS = 'cla-pfocus'/);
  assert.match(acc, /\{outline:3px solid #ffd27f/, 'the pad\'s focus is shown');
});

// ---- 2: signing in on another device (also test/launch-auth.test.js) ----
test('2. the panel\'s sign-in buttons log in; linking is its own button', () => {
  const acc = read('client/account.js');
  assert.match(acc, /data-in="\$\{p\}"/);
  assert.match(acc, /data-link="\$\{p\}"/);
  assert.match(acc, /\[data-in\]'\)\) b\.onclick = \(\) => pick\(b\.dataset\.in, false\)/, 'sign-in: login mode');
  assert.ok(!/link-ticket/.test(acc), 'no link ticket fetched for a sign-in');
});

// ---- 3: admin log spam, async appends, a capped tail, truncation ----
test('3. claim attempts are throttled and their refusals logged once a minute; open-mode debug commands by non-admins aren\'t logged', () => {
  const { L, join, c } = launch();
  const p = join();
  for (let i = 0; i < 100; i++) L.hooks.message(p, { t: 'admin', a: 'claim', code: 'x' + i });
  assert.ok(L.adminLog.count <= 1, `${L.adminLog.count} entries for 100 tries`);
  c.add(11 * 60e3);
  L.hooks.message(p, { t: 'admin', a: 'claim', code: 'y' });
  assert.ok(L.adminLog.count <= 2);
  const before = L.adminLog.count;
  for (let i = 0; i < 50; i++) L.hooks.devCommand(p, 'money', {});
  assert.equal(L.adminLog.count, before, 'a tester\'s debug commands in the open mode');
  L.accounts.get(p.pid).kind = 'member'; L.accounts.setRole(p.pid, 'admin');
  L.hooks.devCommand(p, 'money', {});
  assert.equal(L.adminLog.count, before + 1, 'an admin\'s are');
});

test('3. the admin log appends in the background, reads a capped tail, and its head catches a file cut short', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cla-alog2-'));
  const file = join(dir, 'admin-log.jsonl');
  const L = createAdminLog(file, Date.now, { delayMs: 5 });
  for (let i = 0; i < 2000; i++) L.append({ who: { id: 'o' }, what: 'kick', target: { id: `t${i}` }, note: 'x'.repeat(100) });
  assert.throws(() => readFileSync(file), /ENOENT/, 'nothing written in the caller\'s time');
  await L.flush();
  assert.equal(readFileSync(file, 'utf8').split('\n').filter(Boolean).length, 2000);
  assert.deepEqual(L.checkHead(), { ok: true, n: 2000 });
  assert.equal(L.tail(5)[0].target.id, 't1999');
  assert.ok(L.tail(5000).length < 2000, 'the page reads the file\'s last part only');
  assert.equal(L.verify().ok, true);
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  writeFileSync(file, lines.slice(0, -3).join('\n') + '\n');   // (the last three taken off: the chain alone can't tell)
  const L2 = createAdminLog(file);
  assert.equal(L2.checkHead().ok, false, 'the head says there was more');
  assert.equal(L2.verify().ok, false);
});

// ---- 4: moneywatch after a rejoin ----
test('4. money is noted against the player who\'s on now, not the first session\'s; nothing after they leave', () => {
  const world = { players: new Map() };
  const profile = { pid: 'a', cash: 100, bank: 500 };
  const p1 = { pid: 'a', profile, name: 'one' }, seen = [];
  watch(world, p1);
  world.curSys = 'taxijob'; profile.cash += 10; world.curSys = null;
  settle(world, (p, src, net) => seen.push([p.name, net]));
  release(p1);
  world.curSys = 'mortgage'; profile.bank -= 5; world.curSys = null;
  settle(world, (p, src, net) => seen.push([p.name, net]));
  const p2 = { pid: 'a', profile, name: 'two' };
  watch(world, p2);
  world.curSys = 'taxijob'; profile.cash += 20; world.curSys = null;
  settle(world, (p, src, net) => seen.push([p.name, net]));
  assert.deepEqual(seen, [['one', 10], ['two', 20]]);
  assert.equal(profile.cash, 130);
  assert.equal(profile.bank, 495);
});

// ---- 5: reports ----
test('5. nine throwaway guests can\'t mute anyone; weighted reports go to the review list, never an automatic mute', () => {
  for (const k of Object.keys(store.kept)) delete store.kept[k];
  const c = clock(), A = createAccounts({ store, secret: 'test-secret', now: c.now }), mod = createModeration({ store, now: c.now });
  const chat = createChat({ accounts: A, filter: filter(), mod, now: c.now });
  const w = fakeWorld();
  const target = fakePlayer(w, store); A.ensure(target.profile).kind = 'member';
  for (let i = 0; i < 9; i++) {
    const g = fakePlayer(w, store); A.ensure(g.profile);
    chat.handle(w, g, { t: 'mod', a: 'report', id: chat.hid(target.pid), why: 'harassment' });
  }
  assert.equal(mod.mutedUntil(A.get(target.pid)), 0, 'not muted');
  assert.equal(mod.activeStrikes(A.get(target.pid)), 0, 'no strike');
  assert.ok(!mod.openReviews().some((r) => r.kind === 'reports'), 'new guests weigh nothing');
  const reps = [];
  for (let i = 0; i < CHAT.reportsToStrike; i++) { const m = fakePlayer(w, store); A.ensure(m.profile).kind = 'member'; reps.push(m); }
  for (const m of reps) chat.handle(w, m, { t: 'mod', a: 'report', id: chat.hid(target.pid), why: 'hate' });
  assert.ok(mod.openReviews().some((r) => r.kind === 'reports' && r.who.id === target.pid), 'members\' reports: to the top of the review list');
  assert.equal(mod.mutedUntil(A.get(target.pid)), 0, 'still for an admin to decide');
  // an older guest with real play counts half
  const old = fakePlayer(w, store), oa = A.ensure(old.profile);
  oa.created = c.t - 7 * 3600e3; oa.playMin = 90;
  assert.equal(reporterWeight(oa, c.t), 0.5);
  assert.equal(reporterWeight(A.get(reps[0].pid), c.t), 1);
});

// ---- 7 and 9: the door ----
test('7. no guest limit unless set, its refusal has its own code; the page stops reconnecting on refusals and says why', () => {
  assert.equal(config.launch.guestPerHour, 0, 'off by default');
  const { L } = launch({ guestPerHour: 2 });
  assert.ok(L.login(null, {}, '5.5.5.5').profile);
  assert.ok(L.login(null, {}, '5.5.5.5').profile);
  const r = L.login(null, {}, '5.5.5.5');
  assert.equal(r.code, 4013);
  const main = read('client/main.js');
  assert.match(main, /const REFUSED = new Set\(\[4009, 4010, 4011, 4012, 4013, 4014\]\)/);
  assert.match(main, /if \(ev && REFUSED\.has\(ev\.code\)\) \{ refusedAtDoor\(ev\.code\); return; \}/);
  assert.match(main, /if \(S\.refused\) \{/, 'PLAY tries again');
});

test('9. a ban: the page is told why; a banned retry doesn\'t look through every profile; unbanning a guest lets it back in', () => {
  const { L, join } = launch();
  const g = join();
  const tok = L.accounts.token(g.pid);
  L.accounts.noteDevice(g.pid, 'c'.repeat(32));
  L.accounts.ban(g.pid, { hours: 0, why: 'griefing' });
  const r = L.login(tok, {});
  assert.equal(r.code, 4010);
  assert.match(r.refused, /banned.*griefing/);
  let scans = 0;
  const all = store.all.bind(store);
  store.all = () => { scans++; return all(); };
  try {
    L.login(null, { dm: 'c'.repeat(32) });
    const before = scans;
    for (let i = 0; i < 20; i++) assert.equal(L.login(null, { dm: 'c'.repeat(32) }).code, 4010, 'the banned device');
    assert.equal(scans, before, 'no profile scan on a retry');
  } finally { store.all = all; }
  L.accounts.unban(g.pid);
  const back = L.login(tok, {});
  assert.equal(back.profile && back.profile.pid, g.pid, 'the guest is back in with its own token');
  assert.equal(L.login(null, { dm: 'c'.repeat(32) }).profile ? 'ok' : 'no', 'ok', 'and the device');
});

test('9. sign out everywhere closes the account\'s live sessions; the stale token elsewhere is refused, not turned into a new guest', async () => {
  const { L, join } = launch();
  const p = join();
  L.accounts.get(p.pid).kind = 'member';
  const old = L.accounts.token(p.pid);
  const r = await call(L.authHttp.handle, { method: 'POST', url: '/auth/signout-all', headers: { authorization: `Bearer ${old}` } });
  assert.equal(r.status, 200);
  await new Promise((z) => setTimeout(z, 20));   // (closed a moment after the reply: launch.js signOutCloseMs)
  assert.equal(p.conn.open, false);
  assert.equal(p.conn.code, 4015);
  const again = L.login(old, {});
  assert.equal(again.code, 4014);
  assert.ok(L.login(r.json().token, {}).profile, 'the new token works');
});

// ---- 8: guest names (the owner, 11-12: guests pick theirs too; test/guestnames.test.js) ----
test('8. guests rename with a sign-in on offer or not; a name a member owns is theirs', () => {
  for (const over of [{ passwords: false }, { google: { id: 'gid', secret: 'gs' } }]) {
    const a = launch(over);
    const g = a.join();
    assert.equal(a.L.acctState(g).canRename, true);
    a.L.hooks.message(g, { t: 'name', name: 'Saltwater' });
    assert.equal(g.name, 'Saltwater');
  }
});

// ---- 10: the smaller items ----
test('10. lookups by own keys only; a bad cookie isn\'t a 500; the half-second work never throws', () => {
  const ac = createAntiCheat({ mod: null, now: Date.now, log: null });
  const p = { pid: 'x', name: 'x' };
  let n = 0;
  for (let i = 0; i < 40; i++) if (ac.allow(p, 'constructor')) n++;
  assert.equal(n, DEFAULT_RATE, '"constructor" is no kind of its own');
  assert.ok(!Object.hasOwn(RATES, 'toString'));
  const c = clock(), A = createAccounts({ store, secret: 'test-secret', now: c.now }), mod = createModeration({ store, now: c.now });
  const chat = createChat({ accounts: A, filter: filter(), mod, now: c.now });
  const w = fakeWorld(), q = fakePlayer(w, store); A.ensure(q.profile);
  assert.equal(chat.emote(w, q, 'constructor'), false);
  assert.equal(chat.emote(w, q, '__proto__'), false);
  const { L, join, world } = launch();
  const j = join();
  assert.equal(L.hooks.message(j, { t: 'constructor' }), undefined);
  assert.deepEqual(cookies({ headers: { cookie: 'a=%E0%A4%A; b=ok' } }), { a: '%E0%A4%A', b: 'ok' });
  world.players.set('broken', { get conn() { throw new Error('boom'); } });
  assert.doesNotThrow(() => L.halfSecond());
});

test('10. the admin link lands on a same-site page (the cookie isn\'t lost on a cross-site first load)', async () => {
  const c = clock(), A = createAccounts({ store, secret: 'test-secret', now: c.now });
  const pid = 'd'.repeat(24); store.create(pid); A.ensure(store.get(pid)); A.setRole(pid, 'owner');
  const H = createAdminHttp({ accounts: A, log: createAdminLog(null), mod: createModeration({ store }), analytics: { data: { days: {}, cohorts: {}, conc: [] }, norm: () => 0 }, publicUrl: 'https://play.example', ip: () => '1', now: c.now });
  const url = new URL(H.pageLink(pid, 'dashboard'));
  const r = await call(H.handle, { url: url.pathname + url.search });
  assert.equal(r.status, 200, 'a page, not a redirect');
  assert.match(r.body, /http-equiv="refresh" content="0;url=\/admin\/dashboard"/);
  const sid = r.headers['set-cookie'].match(/cla_admin=([^;]+)/)[1];
  const d = await call(H.handle, { url: '/admin/dashboard', headers: { cookie: `cla_admin=${sid}` } });
  assert.equal(d.status, 200);
});

test('10. helpers can\'t refund or restore their own account; staff act on an id, never a name', () => {
  const { L, join } = launch();
  const h = join(), p = join({ name: 'Somebody' });
  L.accounts.get(h.pid).kind = 'member'; L.accounts.setRole(h.pid, 'helper');
  assert.match(L.hooks.message(h, { t: 'admin', a: 'restore', id: h.pid, item: 'bandage' }).err, /own account/);
  assert.match(L.hooks.message(h, { t: 'admin', a: 'refund', id: h.pid, i: 1 }).err, /own account/);
  L.accounts.setRole(h.pid, 'admin');
  assert.match(L.hooks.message(h, { t: 'admin', a: 'ban', id: 'Somebody' }).err, /No such player/);
  assert.equal(L.accounts.banned(p.pid), null);
});

test('10. a passkey whose counter went backwards signs in and is flagged for review', async () => {
  const src = read('server/authhttp.js');
  assert.match(src, /if \(r\.cloned && opts\.onFlag\) opts\.onFlag\(found\.pid, 'passkey'/);
  assert.ok(!/throw new Error\('sign counter/.test(read('server/webauthn.js')));
});

test('10. GA: Accept grants analytics storage only; the ids are sent again on a reconnect', () => {
  const appended = [], win = {}, sends = [];
  const ga = createPageGA({ win, doc: { createElement: (t) => ({ tag: t }), head: { appendChild: (e) => appended.push(e) } }, send: (m) => sends.push(m) });
  ga.consent('all'); ga.setId('G-ABCDE12345');
  const upd = win.dataLayer.map((a) => [...a]).find((a) => a[0] === 'consent' && a[1] === 'update');
  assert.deepEqual(upd[2], { analytics_storage: 'granted' });
  let asked = 0;
  win.gtag = (...a) => { if (a[0] === 'get') { asked++; a[3](a[2] === 'client_id' ? '1.2' : '3'); } };
  ga.resend();
  assert.equal(asked, 0, '(the page\'s own gtag: via the dataLayer)');
  assert.ok(win.dataLayer.filter((a) => a[0] === 'get').length >= 2, 'asked for the ids again');
  assert.match(read('client/main.js'), /L\.ga\.setId\(a\.ga\); L\.ga\.resend\(\); L\.er\.flush\(\);/, 'on every new session: the GA ids, and errors queued while offline');
});

test('10. the account panel escapes names; smaller per-account logs', () => {
  const acc = read('client/account.js');
  assert.ok(!/\$\{s\.name \|\| 'You'\}/.test(acc) && /\$\{esc\(s\.name \|\| 'You'\)\}/.test(acc));
  assert.ok(!/value="\$\{\(s\.name/.test(acc));
  assert.ok(CHAT.inboxMax <= 30 && CHAT.contactsMax <= 100);
  assert.match(read('server/admin.js'), /const PLOG_MAX = 60, BUYS_MAX = 20/);
});

test('10. the movement audit doesn\'t flag the server\'s own moves (seats, doors, rides, fires, the chess table, campfires)', () => {
  const c = clock(), mod = createModeration({ store, now: c.now });
  const ac = createAntiCheat({ mod, now: c.now, log: null });
  const w = fakeWorld(), p = fakePlayer(w, store, { x: 0, y: 0 });
  p.ped.player = p;
  ac.audit(w);
  w.time += 0.5; p.ped.x += 6000; moved(p.ped);
  assert.deepEqual(ac.audit(w), [], 'marked: not a teleport');
  w.time += 0.5; p.ped.x += 6000;
  assert.equal(ac.audit(w)[0].kind, 'teleport', 'unmarked: flagged');
  for (const [f, n] of [['homes', 1], ['rides', 2], ['firefighter', 2], ['chess', 2], ['campfires', 1], ['bathhouse', 1], ['cinema', 1], ['homeinside', 5], ['unstuck', 1], ['station', 1]]) {
    const src = read(`server/systems/${f}.js`);
    assert.ok((src.match(/moved\(ped\)/g) || []).length >= n, `${f}.js marks its moves`);
  }
  void fakeConn;
});
