// Analytics (server/analytics.js, moneywatch.js, ga.js, client/analytics.js): sessions, new and returning, day-1 and
// day-7 retention, the first-time funnel, money sources and sinks attributed to what was running, deaths by cause,
// devices and performance; GA4 only with a key and the player's consent, its Measurement Protocol payloads, and a
// queue that never holds up the tick.
import { clock, fakeWorld, fakePlayer } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { store } from '../server/store.js';
import { createAccounts } from '../server/accounts.js';
import { createAnalytics, deathCause } from '../server/analytics.js';
import { createGA, MAX_BATCH, MP_URL } from '../server/ga.js';
import { watch, settle } from '../server/moneywatch.js';
import { createAnalytics as createPageGA } from '../client/analytics.js';

const DAY = 86400e3;
const setup = (c = clock(), ga = null, file = null) => ({ c, A: createAccounts({ store, secret: 'test-secret', now: c.now }), an: createAnalytics({ now: c.now, ga, file }), w: fakeWorld() });

test('sessions, new and returning, retention by cohort (day 1, day 7, week 1), and it survives a restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cla-an-'));
  const S = setup(clock(), null, join(dir, 'analytics.json'));
  const ps = [0, 1, 2, 3].map(() => fakePlayer(S.w, store));
  const acct = (p) => S.A.ensure(p.profile);
  for (const p of ps) S.an.sessionStart(p, acct(p));
  S.c.add(30 * 60e3);
  for (const p of ps) S.an.sessionEnd(p);
  let d = S.an.day();
  assert.equal(d.newAcc, 4);
  assert.equal(d.uniq, 4);
  assert.equal(d.sessions, 4);
  assert.equal(Math.round(d.sessionMs / 60000), 120);
  S.an.sessionStart(ps[0], acct(ps[0]));   // (again the same day: a session, not a new player)
  assert.equal(S.an.day().uniq, 4);
  S.c.add(DAY);
  S.an.sessionStart(ps[0], acct(ps[0])); S.an.sessionStart(ps[1], acct(ps[1]));
  assert.equal(S.an.day().returning, 2);
  S.c.add(6 * DAY);
  S.an.sessionStart(ps[0], acct(ps[0])); S.an.sessionStart(ps[2], acct(ps[2]));
  const cohort = Object.values(S.an.data.cohorts)[0];
  assert.deepEqual(cohort, { n: 4, d1: 2, d7: 2, w1: 3 });
  const f = Object.values(S.an.data.days).reduce((o, x) => { for (const [k, v] of Object.entries(x.ftue)) o[k] = (o[k] || 0) + v; return o; }, {});
  assert.equal(f.first_join, 4);
  assert.equal(f.came_back, 3, 'the funnel counts each account once a step');
  S.an.save();
  const again = createAnalytics({ now: S.c.now, file: join(dir, 'analytics.json') });
  assert.deepEqual(Object.values(again.data.cohorts)[0], cohort, 'kept across a restart');
  void d;
});

test('the funnel: steps from the page only where the page is the one that knows; each once', () => {
  const S = setup();
  const p = fakePlayer(S.w, store), a = S.A.ensure(p.profile);
  assert.ok(S.an.ftue(p, a, 'title_play', true));
  assert.ok(!S.an.ftue(p, a, 'title_play', true), 'once');
  assert.ok(!S.an.ftue(p, a, 'first_purchase', true), 'the server says when you bought something, not the page');
  assert.ok(!S.an.ftue(p, a, 'made_up_step', true));
});

test('money: sources and sinks attributed to the system or message running, netted per source (an ATM is no earning)', () => {
  const S = setup();
  const p = fakePlayer(S.w, store);
  p.profile.cash = 100; p.profile.bank = 1000;
  watch(S.w, p);
  const got = [];
  S.w.curSys = 'taxijob'; p.profile.cash += 85; S.w.curSys = null;
  S.w.curMsg = 'shop:gunshop'; S.w.curOpt = 'w:pistol:450'; p.profile.bank -= 450; S.w.curMsg = null; S.w.curOpt = null;
  S.w.curMsg = 'shop:atm'; p.profile.cash -= 50; p.profile.bank += 50; S.w.curMsg = null;
  S.w.curMsg = 'dev'; p.profile.cash += 1e6; S.w.curMsg = null;
  settle(S.w, (q, src, net, opt) => { got.push([src, net, opt]); S.an.money(q, src, net, opt); });
  assert.deepEqual(got, [['taxijob', 85, null], ['shop:gunshop', -450, 'w:pistol:450'], ['dev', 1e6, null]]);
  const d = S.an.day();
  assert.equal(d.earn.taxijob, 85);
  assert.equal(d.spend['shop:gunshop'], 450);
  assert.equal(p.profile.cash, 100 + 85 - 50 + 1e6, 'the values themselves untouched');
  assert.equal(JSON.parse(JSON.stringify(p.profile)).bank, 1000 - 450 + 50, 'saved as plain numbers');
  assert.equal(S.an.norm(), 0, 'dev money is left out of the norm (and no hour played yet)');
});

test('deaths by cause, devices and performance buckets, activity and the concurrency samples', () => {
  const S = setup();
  assert.equal(deathCause('You drowned.', null), 'drowned');
  assert.equal(deathCause('x', { npc: { role: 'cop' } }), 'police');
  assert.equal(deathCause('x', { player: { badge: false } }), 'player');
  assert.equal(deathCause('Run over by a bus', null), 'vehicle');
  const p = fakePlayer(S.w, store);
  S.an.event('death', p, { cause: 'Fell off the cliff' });
  S.an.perf({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)', preset: 'medium', fps: 58, at: { screen: 7000 } });
  S.an.perf({ ua: 'Mozilla/5.0 (Windows NT 10.0)', preset: 'ultra', fps: 25, at: { screen: 25000 } });
  p.job = { type: 'taxi' };
  S.an.minute(S.w);
  S.an.concurrency(1);
  const d = S.an.day();
  assert.equal(d.deaths.fall, 1);
  assert.deepEqual(d.dev, { phone: 1, desktop: 1 });
  assert.deepEqual(d.fps, { '55_': 1, '20-29': 1 });
  assert.deepEqual(d.load, { '5-10s': 1, '20-40s': 1 });
  assert.equal(d.mins['job:taxi'], 1);
  assert.equal(d.peak, 1);
  assert.equal(S.an.data.conc.length, 1);
  assert.ok(!JSON.stringify(S.an.data).includes(p.pid), 'nothing personal in the aggregates');
});

// ---- GA4 ----
function fakeFetch(delayMs = 0) {
  const calls = [];
  const f = (url, opt) => { calls.push({ url, body: JSON.parse(opt.body) }); return new Promise((ok) => setTimeout(() => ok({ status: 204 }), delayMs)); };
  return { f, calls };
}
test('GA from the server: nothing without both keys, nothing for a player who didn\'t consent', async () => {
  const F = fakeFetch();
  const off = createGA({ measurementId: '', apiSecret: 's', fetch: F.f });
  const p = { pid: 'p1' };
  assert.equal(off.setClient(p, '123.456'), false);
  assert.equal(off.event(p, 'login', { method: 'google' }), false);
  const noSecret = createGA({ measurementId: 'G-ABCDE12345', apiSecret: '', fetch: F.f });
  assert.equal(noSecret.enabled, false);
  const on = createGA({ measurementId: 'G-ABCDE12345', apiSecret: 'sec', fetch: F.f, userHash: (pid) => 'h_' + pid.length });
  const q = { pid: 'p2' };
  assert.equal(on.event(q, 'login', { method: 'google' }), false, 'no client id: no consent was given');
  assert.equal(on.setClient(q, 'not-a-cid'), false);
  assert.ok(on.setClient(q, '1234567890.1700000000', '1700000000'));
  assert.ok(on.event(q, 'login', { method: 'google' }));
  on.clear(q);
  assert.equal(on.event(q, 'sign_up', { method: 'google' }), false, 'consent withdrawn');
  await on.flush();
  assert.equal(F.calls.length, 1);
  assert.equal(await off.flush(), 0);
});

test('GA Measurement Protocol payloads: client_id, a hashed user_id, events of 25 at most, clean params, the session id', async () => {
  const F = fakeFetch();
  const ga = createGA({ measurementId: 'G-ABCDE12345', apiSecret: 'sec', fetch: F.f, userHash: () => 'hashed-user', now: () => 1700000000000 });
  const p = { pid: 'secretpid', name: 'Somebody', profile: {}, badge: false, wanted: 0 };
  ga.setClient(p, '111.222', '333');
  for (let i = 0; i < 30; i++) ga.event(p, 'earn_virtual_currency', { virtual_currency_name: 'dollars', value: i, source: 'x'.repeat(150), 'bad key': 1, ga_reserved: 2, obj: { a: 1 } });
  assert.equal(ga.event(p, 'bad name!', {}), false);
  await ga.flush();
  assert.equal(F.calls.length, 2);
  const u = new URL(F.calls[0].url);
  assert.equal(u.origin + u.pathname, MP_URL);
  assert.equal(u.searchParams.get('measurement_id'), 'G-ABCDE12345');
  const b = F.calls[0].body;
  assert.equal(b.client_id, '111.222');
  assert.equal(b.user_id, 'hashed-user');
  assert.equal(b.events.length, MAX_BATCH);
  assert.equal(F.calls[1].body.events.length, 5);
  const e = b.events[0];
  assert.equal(e.name, 'earn_virtual_currency');
  assert.equal(e.timestamp_micros, 1700000000000 * 1000);
  assert.equal(e.params.session_id, '333');
  assert.equal(e.params.engagement_time_msec, 1);
  assert.equal(e.params.source.length, 100);
  assert.ok(!('bad key' in e.params) && !('ga_reserved' in e.params) && !('obj' in e.params));
  const all = JSON.stringify(F.calls.map((c) => c.body));
  assert.ok(!all.includes('secretpid') && !all.includes('Somebody'), 'no account id, no name');
});

test('the GA queue never blocks: events are pushed while a slow send is out, the queue is capped, a failing endpoint is shrugged off', async () => {
  const F = fakeFetch(200);
  const ga = createGA({ measurementId: 'G-ABCDE12345', apiSecret: 'sec', fetch: F.f });
  const p = { pid: 'p' };
  ga.setClient(p, '1.2');
  ga.event(p, 'login', {});
  const sending = ga.flush();
  const t0 = performance.now();
  for (let i = 0; i < 10000; i++) ga.event(p, 'crime', { crime: 'theft' });
  assert.ok(performance.now() - t0 < 1000, 'ten thousand events queued at well under a tenth of a millisecond each (a tick is 50 ms)');
  assert.ok(ga.queue.length <= 5000, 'capped');
  assert.equal(await ga.flush(), 0, 'one send at a time');
  await sending;
  const broken = createGA({ measurementId: 'G-ABCDE12345', apiSecret: 'sec', fetch: () => Promise.reject(new Error('down')), log: { warn() {} } });
  broken.setClient(p, '1.2');
  broken.event(p, 'login', {});
  assert.equal(await broken.flush(), 0);
  assert.equal(broken.stats.failed, 1);
});

test('analytics feeds GA only for consenting players, money summed per source once a minute', () => {
  const sent = [];
  const fakeGa = { event: (p, n, prm) => sent.push([p.pid, n, prm]), enabledFor: (p) => !!p.ga };
  const S = setup(clock(), fakeGa);
  const yes = fakePlayer(S.w, store), no = fakePlayer(S.w, store);
  yes.ga = { cid: '1.1' };
  for (const p of [yes, no]) { S.an.money(p, 'taxijob', 40); S.an.money(p, 'taxijob', 60); S.an.money(p, 'shop:gunshop', -450); }
  S.an.minute(S.w);
  const mine = sent.filter((x) => x[1].endsWith('virtual_currency'));
  assert.equal(mine.filter((x) => x[0] === no.pid).length, 0);
  assert.deepEqual(mine.map((x) => [x[1], x[2].value]), [['earn_virtual_currency', 100], ['spend_virtual_currency', 450]]);
});

// ---- GA on the page ----
function fakePage() {
  const appended = [];
  const win = {};
  const doc = { createElement: (t) => ({ tag: t }), head: { appendChild: (e) => appended.push(e) } };
  return { win, doc, appended };
}
test('GA on the page: no gtag.js without an id and an Accept; Consent Mode v2 defaults to denied, Accept grants; withdrawing tells the server', () => {
  let P = fakePage();
  const sends = [];
  let ga = createPageGA({ win: P.win, doc: P.doc, send: (m) => sends.push(m) });
  ga.setId('G-ABCDE12345');
  assert.equal(P.appended.length, 0, 'no choice made yet: nothing loaded');
  ga.consent('essential');
  assert.equal(P.appended.length, 0, 'Essential only: never loaded');
  assert.equal(ga.event('play_click'), false);
  assert.equal(P.win.dataLayer, undefined, 'nothing for Google at all');
  P = fakePage();
  ga = createPageGA({ win: P.win, doc: P.doc, send: (m) => sends.push(m) });
  ga.consent('all');
  assert.equal(P.appended.length, 0, 'Accept, but no measurement id from the server: off');
  ga.setId('not-an-id');
  assert.equal(P.appended.length, 0);
  assert.ok(ga.event('play_click'), 'held until it loads');
  ga.setId('G-ABCDE12345');
  assert.equal(P.appended.length, 1);
  assert.match(P.appended[0].src, /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-ABCDE12345$/);
  const dl = P.win.dataLayer.map((a) => [...a]);
  const def = dl.find((a) => a[0] === 'consent' && a[1] === 'default');
  assert.deepEqual([def[2].analytics_storage, def[2].ad_storage, def[2].ad_user_data, def[2].ad_personalization], ['denied', 'denied', 'denied', 'denied']);
  assert.ok(dl.findIndex((a) => a[0] === 'consent' && a[1] === 'default') < dl.findIndex((a) => a[0] === 'config'), 'the default before config');
  const upd = dl.find((a) => a[0] === 'consent' && a[1] === 'update');
  assert.equal(upd[2].analytics_storage, 'granted');
  assert.ok(dl.some((a) => a[0] === 'event' && a[1] === 'play_click'), 'the held event went');
  ga.consent('essential');
  const last = P.win.dataLayer[P.win.dataLayer.length - 1];
  assert.equal(last[2].analytics_storage, 'denied');
  assert.deepEqual(sends[sends.length - 1], { t: 'ga', on: 0 });
  assert.equal(ga.event('in_world'), false);
});

test('GA on the page: errors counted only (where), a few a page; perf as buckets', () => {
  const P = fakePage();
  const ga = createPageGA({ win: P.win, doc: P.doc, send: () => {} });
  ga.consent('all'); ga.setId('G-ABCDE12345');
  let n = 0;
  for (let i = 0; i < 20; i++) if (ga.error('frame')) n++;
  assert.equal(n, 10);
  const ev = P.win.dataLayer.map((a) => [...a]).filter((a) => a[0] === 'event' && a[1] === 'client_error');
  assert.deepEqual(Object.keys(ev[0][2]), ['where']);
  ga.perf({ fps: 40, at: { screen: 12000 }, preset: 'high', ua: 'Android 14; Mobile' });
  const pr = P.win.dataLayer.map((a) => [...a]).find((a) => a[1] === 'perf_report');
  assert.deepEqual([pr[2].fps_bucket, pr[2].load_bucket, pr[2].device_class, pr[2].graphics_preset], ['30-44', '10-20s', 'phone', 'high']);
});
