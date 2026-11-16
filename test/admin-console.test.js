// The owner's tools of 11-16 (the owner: "clean up admin tools ... an analytics page that gives me a real-time look at what's
// currently happening ... for me only"; "my Dead Baron logo avatar character ... when I'm in admin mode"; "we don't need to
// have the 'beta' tag on every player"):
//   - the console (/admin/: server/adminconsole.js, adminhttp.js api): the staff session and the console power; one page and
//     its own script (no inline script; a CSP); the JSON never carries an address, an email or an account id - a player is a
//     ref good for this session (/admin/go);
//   - the rolling buckets (server/analytics.js trends, places): per minute and per hour, bounded, kept through a restart;
//   - where from (server/geo.js): the country from the address (the packed DB-IP table) or the time zone, never the address;
//   - the in-game admin panel's commands (server/admin.js): the role checked, each one logged; gifts within GIFT;
//   - the founder (server/founder.js): the owner's crown for everyone, his look only in admin mode and only his;
//   - name tags: no Beta plate by the name (cosmetics.js card plates).
import { clock, fakeWorld, fakePlayer, call } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore, useStore, store } from '../server/store.js';
import { config } from '../server/config.js';
import { createLaunch } from '../server/launch.js';
import { createAnalytics, ROLL } from '../server/analytics.js';
import { createGeo, packTable, parseIp } from '../server/geo.js';
import { founderSync } from '../server/founder.js';
import { descriptor } from '../server/net.js';
import { K } from '../shared/constants.js';
import { allowed } from '../server/roles.js';
import { GIFT, COSMETICS } from '../shared/rules.js';
import * as cosmetics from '../server/systems/cosmetics.js';
import { adaptApp, appKey } from '../client/art2/game/peds.js';
import { person, FOUNDER } from '../client/art2/people.js';

const quiet = { log() {}, warn() {}, error() {} };
function launch() {
  useStore(new MemoryStore());
  const world = fakeWorld(); world.stats = { tickMs: 0 }; world.emit = () => {};
  const c = clock();
  const cfg = { ...config, launch: { ...config.launch, devOpen: true, google: { id: '', secret: '' }, discord: { id: '', secret: '' }, email: { key: '', from: '' } } };
  const L = createLaunch({ config: cfg, store, world, ip: () => '1.2.3.4', dataDir: null, now: c.now, log: quiet, signOutCloseMs: 0 });
  const join = (o = {}, role = null, hello = {}) => {
    const p = fakePlayer(world, store, o);
    if (role) { L.accounts.ensure(p.profile); L.accounts.get(p.pid).kind = 'member'; L.accounts.setRole(p.pid, role); }
    L.hooks.join(p, hello, {});
    return p;
  };
  const enter = async (pid, page = 'console') => {
    const u = new URL(L.adminHttp.pageLink(pid, page));
    const r = await call(L.http, { url: u.pathname + u.search });
    return `cla_admin=${r.headers['set-cookie'].match(/cla_admin=([^;]+)/)[1]}`;
  };
  const get = (cookie, url) => call(L.http, { url, headers: cookie ? { cookie } : {} });
  const adm = (p, a, args = {}) => L.hooks.message(p, { t: 'admin', a, ...args });
  return { L, world, c, join, enter, get, adm };
}

test('the console: one page for the staff, its own script, live JSON with no ids or addresses', async () => {
  const T = launch();
  const owner = T.join({ name: 'Boss' }, 'owner', { tz: 'America/Chicago', dk: 'desktop' });
  const helper = T.join({ name: 'Helpy' }, 'helper');
  const guest = T.join({ name: 'Guest1234', wanted: 2 }, null, { ip: '203.0.113.9', tz: 'Europe/Berlin', dk: 'phone' });
  assert.equal((await T.get(null, '/admin/')).status, 401, 'signed out');
  assert.equal((await T.get(await T.enter(helper.pid), '/admin/')).status, 403, 'a helper: no console');
  const ck = await T.enter(owner.pid);
  const page = await T.get(ck, '/admin/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  assert.match(page.body, /<script src="\/admin\/console.js"><\/script>/);
  assert.ok(!/<script>/.test(page.body), 'no inline script');
  for (const t of ['Now', 'Trends', 'Where from', 'Moderation', 'Server', 'Tools']) assert.ok(page.body.includes(`>${t}</button>`), t);
  assert.equal((await T.get(ck, '/admin')).status, 200, '/admin as well');
  const js = await T.get(ck, '/admin/console.js');
  assert.equal(js.status, 200); assert.match(js.headers['content-type'], /javascript/);
  T.L.analytics.minute(T.world);
  const api = await T.get(ck, '/admin/api?win=1h&more=1'), d = JSON.parse(api.body);
  assert.equal(d.now.online, 3); assert.equal(d.now.guests, 1);
  const g = d.now.list.find((x) => x.n === 'Guest1234');
  assert.equal(g.gu, 1); assert.equal(g.c, 'DE', 'the country from the time zone (no IP table here)'); assert.equal(g.dev, 'phone'); assert.equal(g.w, 2);
  assert.equal(d.now.list.find((x) => x.n === 'Boss').fo, 1, 'the founder');
  assert.equal(d.now.list.find((x) => x.n === 'Boss').r, 'Central');
  for (const pid of [owner.pid, helper.pid, guest.pid]) assert.ok(!api.body.includes(pid), 'no account id');
  assert.ok(!api.body.includes('203.0.113.9') && !api.body.includes('1.2.3.4'), 'no address');
  assert.ok(d.trends && d.trends.series.length === 60, 'the hour, minute by minute');
  assert.equal(d.windows.length, 5);
  assert.ok(d.where.countries.some(([c]) => c === 'DE') && d.where.names.DE === 'Germany');
  assert.ok(d.moderation && d.moderation.log, 'the owner sees the admin log');
  assert.ok(d.server.rss > 0 && d.server.up >= 0);
  // a row opens the player's page through its ref
  const go = await T.get(ck, `/admin/go?ref=${encodeURIComponent(g.ref)}`);
  assert.equal(go.status, 303); assert.equal(go.headers.location, `/admin/players?id=${guest.pid}`);
  assert.equal((await T.get(ck, '/admin/go?ref=nope')).headers.location, '/admin/');
  // the game hands out its link; the other pages link back to it
  assert.match(T.adm(owner, 'pagelink', { page: 'console' }).data.url, /\/admin\/enter\?c=/);
  assert.match((await T.get(ck, '/admin/players')).body, /<a href="\/admin\/"><b>Console<\/b><\/a>/);
  assert.match(readFileSync(new URL('../client/account.js', import.meta.url), 'utf8'), /data-page="console"/, 'Settings -> Account -> Staff tools');
  assert.equal(guest.cc.s, 'tz');
  assert.equal(Object.values(guest).includes('203.0.113.9'), false, 'the address isn\'t kept on the player');
});

test('the rolling buckets: minutes for 6 h, hours for 7 days, bounded, kept through a restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cla-roll-')), c = { t: Date.UTC(2026, 10, 16, 0, 0, 30) }, now = () => c.t;
  const A = createAnalytics({ file: join(dir, 'analytics.json'), now });
  const world = { players: new Map(), get: () => null };
  const mk = (i, cc) => ({ pid: `p${i}`, conn: {}, ped: { x: 0, y: 0 }, cc, acct: {} });
  const ps = [mk(1, { c: 'US', r: 'Central' }), mk(2, { c: 'US', r: 'Eastern' }), mk(3, { c: 'FR' }), mk(4, null)];
  for (const p of ps) { world.players.set(p.pid, p); A.sessionStart(p, p.acct); }
  for (let m = 0; m < 9 * 60; m++) { A.minute(world); if (m === 30) A.event('job_done', ps[0], { type: 'taxi' }); c.t += 60e3; }
  A.sessionEnd(ps[0]);
  const h = A.trends('1h'), d = A.trends('24h');
  assert.equal(h.uniq, 4); assert.equal(h.peak, 4); assert.equal(h.series.length, 60);
  assert.equal(d.nw, 4, 'new players'); assert.equal(d.se, 4); assert.equal(d.jb, 1); assert.equal(d.sn, 1); assert.ok(d.avgMin > 500);
  assert.equal(A.data.roll.m.length, ROLL.min, 'minutes bounded');
  assert.ok(A.data.roll.h.length <= 10);
  const P = A.places('24h');
  assert.deepEqual(Object.fromEntries(P.countries), { US: 2, FR: 1 }); assert.equal(P.unknown, 1);
  assert.deepEqual(Object.fromEntries(P.regions), { 'US/Central': 1, 'US/Eastern': 1 });
  assert.ok(!JSON.stringify(A.data.roll).includes('p1'), 'players kept as salted keys, not ids');
  A.save();
  const B = createAnalytics({ file: join(dir, 'analytics.json'), now });
  assert.equal(B.trends('24h').uniq, 4, 'the week survives a restart');
  c.t += 8 * 86400e3; B.minute({ players: new Map() });
  assert.equal(B.trends('7d').uniq, 0, 'old hours age out');
});

test('where from: the packed IP table, else the time zone; addresses parsed, never kept', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cla-geo-'));
  writeFileSync(join(dir, 'ipcountry.bin'), packTable(['1.0.0.0,1.0.0.255,AU', '8.8.8.0,8.8.8.255,US', '2a00:1450::,2a00:1450:ffff:ffff:ffff:ffff:ffff:ffff,IE', 'junk'].join('\n')));
  const G = createGeo({ dir });
  assert.equal(G.byIp('1.0.0.7'), 'AU'); assert.equal(G.byIp('::ffff:8.8.8.8'), 'US'); assert.equal(G.byIp('2a00:1450:4001::1'), 'IE');
  assert.equal(G.byIp('8.8.9.1'), null, 'past a range: nobody\'s'); assert.equal(G.byIp('0.0.0.1'), null);
  assert.deepEqual(G.where('8.8.8.8', 'America/Chicago'), { c: 'US', r: 'Central', s: 'ip' }, 'the region from the time zone when they agree');
  assert.deepEqual(G.where('8.8.8.8', 'Europe/Paris'), { c: 'US', s: 'ip' });
  assert.deepEqual(G.where('5.5.5.5', 'Asia/Calcutta'), { c: 'IN', s: 'tz' }, 'an old zone name (a link)');
  assert.equal(G.where(null, null), null);
  assert.equal(parseIp('300.1.1.1'), null); assert.equal(parseIp('1::2::3'), null);
  assert.equal(createGeo({ dir: mkdtempSync(join(tmpdir(), 'cla-geo-')) }).table, false, 'no table: time zones only');
});

test('the admin panel\'s commands: staff only, every one logged, gifts within limits', () => {
  const T = launch();
  const owner = T.join({ name: 'Boss' }, 'owner'), admin = T.join({ name: 'Mod' }, 'admin'), p = T.join({ name: 'Racer' });
  for (const a of ['watch', 'tpto', 'bring', 'send', 'heal', 'revive', 'endjob', 'gift', 'console']) assert.ok(allowed('admin', a) && !allowed('helper', a), a);
  assert.ok(allowed('owner', 'founder') && !allowed('admin', 'founder'));
  assert.equal(T.adm(p, 'gift', { id: owner.pid, kind: 'money', n: 100 }).ok, false, 'a player: refused');
  const r = T.adm(admin, 'roster');
  assert.equal(r.ok, true); assert.equal(r.data.l.length, 3); assert.equal(r.data.founder, null, 'the switch is the owner\'s');
  assert.ok(r.data.gifts.money.length && r.data.gifts.items.length && !r.data.gifts.plates.some(([id]) => id === 'beta'), 'no season gift in the catalog');
  const bank = p.profile.bank;
  assert.equal(T.adm(admin, 'gift', { id: p.pid, kind: 'money', n: 1e12 }).ok, true);
  assert.equal(p.profile.bank, bank + GIFT.maxMoney, 'capped');
  const had = p.profile.inventory.bandage || 0;
  assert.equal(T.adm(admin, 'gift', { id: p.pid, kind: 'item', what: 'bandage', n: 999 }).ok, true);
  assert.equal(p.profile.inventory.bandage, had + GIFT.maxItems);
  assert.equal(T.adm(admin, 'gift', { id: p.pid, kind: 'color', what: COSMETICS.colors[0].id }).ok, true);
  assert.ok(cosmetics.hasColor(p.profile, COSMETICS.colors[0].id));
  assert.equal(T.adm(admin, 'gift', { id: p.pid, kind: 'plate', what: 'beta' }).ok, false, 'the beta plate is never handed out');
  assert.ok(T.world.notes.some((n) => n.p === p && /sent you a gift/.test(n.text)));
  p.ped.hp = 10; p.ped.maxHp = 100;
  assert.equal(T.adm(admin, 'heal', { id: p.pid }).ok, true); assert.equal(p.ped.hp, 100);
  assert.equal(T.adm(admin, 'revive', { id: p.pid }).ok, false, 'not down');
  assert.equal(T.adm(admin, 'endjob', { id: p.pid }).ok, false, 'nothing to end');
  const w = T.adm(admin, 'watch', { id: p.pid });
  assert.equal(w.ok, true); assert.equal(w.data.eid, p.ped.id); assert.deepEqual(admin.watch, { pid: p.pid }); assert.equal(admin.invincible, true);
  assert.equal(T.adm(admin, 'watch', { id: null }).ok, true); assert.equal(admin.watch, null); assert.equal(admin.invincible, false);
  assert.equal(T.adm(admin, 'bring', { id: owner.pid }).ok, false, 'not the owner');
  const lines = T.L.adminLog.tail(50).map((e) => e.what);
  for (const a of ['gift', 'heal', 'watch']) assert.ok(lines.includes(a), `${a} logged`);
  assert.ok(T.L.adminLog.tail(50).some((e) => e.what === 'gift' && e.ok === false), 'a refusal logged too');
});

test('the founder: the owner\'s crown for everyone; his Dead Baron look only in admin mode, switchable, only his', () => {
  const T = launch();
  const owner = T.join({ name: 'DeadBaron' }, 'owner'), admin = T.join({ name: 'Mod' }, 'admin');
  assert.equal(owner.founder, true); assert.equal(owner.founderLook, false, 'not in admin mode');
  assert.ok(!admin.founder);
  owner.devMode = true; founderSync(owner);
  assert.equal(owner.founderLook, true, 'in admin mode: the look');
  const v0 = owner.ped.appVer;
  assert.equal(T.adm(owner, 'founder', { on: false }).ok, true);
  assert.equal(owner.founderLook, false); assert.equal(T.L.accounts.get(owner.pid).founderOff, true, 'kept on the account');
  assert.ok(owner.ped.appVer > v0, 'the descriptor sent again');
  assert.equal(T.adm(admin, 'founder', { on: true }).ok, false, 'an admin can\'t wear it');
  T.adm(owner, 'founder', { on: true });
  // the descriptor: fo for the crown, app.fd for the look (net.js)
  owner.ped.kind = K.PED; owner.ped.player = owner; owner.ped.app = { lk: 'abc' };
  const d = descriptor(owner.ped);
  assert.equal(d.fo, 1); assert.deepEqual(d.app, { lk: 'abc', fd: 1 });
  owner.devMode = false; founderSync(owner);
  assert.deepEqual(descriptor(owner.ped).app, { lk: 'abc' }, 'out of admin mode: his own look'); assert.equal(descriptor(owner.ped).fo, 1, 'the crown stays');
  // the art: one figure, the game's own people renderer, its own sprite key
  assert.equal(adaptApp({ fd: 1, lk: 'whatever' }), FOUNDER); assert.equal(appKey({ fd: 1, lk: 'x' }), 'F');
  const G = person(FOUNDER, 0, 'idle', 0, { tight: true });
  let wing = 0, pink = 0;
  for (let i = 0; i < G.col.length; i += 4) { if (!G.col[i + 3]) continue; const [r, g, b] = [G.col[i], G.col[i + 1], G.col[i + 2]]; if (b > r + 40 && b > 150) wing++; if (r > 200 && b > 120 && g < 120) pink++; }
  assert.ok(wing > 20, 'blue wings'); assert.ok(pink > 4, 'pink glasses');
  // the name tag's crown (client/main.js)
  assert.match(readFileSync(new URL('../client/main.js', import.meta.url), 'utf8'), /if \(p\.d\.fo\) founderMark\(/);
});

test('name tags: the Beta plate stays on the card, never by the name; old wearers lose it on their next session', () => {
  const prof = { cosm: { c: [], pl: [], tops: [], nc: null, tp: 'beta', gifts: { beta: { at: 1, s: 0 } }, sb: [0], bp: [] } };
  assert.equal(cosmetics.hasPlate(prof, 'beta'), true);
  assert.equal(cosmetics.plateOf(prof), null, 'nothing over the name');
  assert.ok(COSMETICS.plates.find((q) => q.id === 'beta').card);
  const T = launch(), p = T.join({ name: 'Old' });
  Object.assign(cosmetics.cosmOf(p.profile), { tp: 'beta', gifts: { beta: { at: 1, s: 0 } } });
  cosmetics.update({ ...T.world, tick: 9 });
  assert.equal(cosmetics.cosmOf(p.profile).tp, null, 'taken off');
  assert.equal(cosmetics.pick(T.world, p, 'p', 'beta', () => true), 'That one\'s for your card, not over your name.');
});
