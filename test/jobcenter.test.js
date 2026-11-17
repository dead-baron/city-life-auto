// The Employment Center and the ads behind a switch (the owner, 11-16: "get ads going so they're ready to turn on when
// the time is right ... the 'office work' or employment center options in the city so we can send beta players that
// way"): CLA_ADS / CLA_ADSENSE_CLIENT read and served in /launch.json, the privacy page's ads paragraph only with ads on;
// office work's rounds (paid on the server, by what's right, at most a round per OFFICE.roundS); the job computer's
// rewarded ad - paid only for a view the page reports on a live, started ticket, long enough, capped a day, never with
// ads off; the page's ads module (never on a portal, Google's test mode, the reward callbacks); the Guide's entries.
// (The place in the world - its door, its room, its two counters: test/world3jobcenter.test.js, one World v3 build.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { call } from './launchkit.js';
import { adsOf, TEST_CLIENT } from '../server/config.js';
import { createAuthHttp } from '../server/authhttp.js';
import { createAccounts } from '../server/accounts.js';
import { MemoryStore } from '../server/store.js';
import { privacyPage } from '../server/legal.js';
import * as jobcenter from '../server/systems/jobcenter.js';
import * as economy from '../server/systems/economy.js';
import { endLine } from '../server/systems/ftue.js';
import { OFFICE, JOBAD } from '../shared/rules.js';
import { createAds, onPortal } from '../client/ads.js';
import { guideSections } from '../shared/guide.js';
import { closure } from '../tools/perf.mjs';

const PUB = 'ca-pub-1234567890123456';
test('CLA_ADS / CLA_ADSENSE_CLIENT: off by default; test runs Google\'s test ads; on needs a publisher id', () => {
  assert.deepEqual(adsOf('', ''), { mode: 'off', client: '' });
  assert.deepEqual(adsOf('off', PUB), { mode: 'off', client: '' });
  assert.deepEqual(adsOf('test', ''), { mode: 'test', client: TEST_CLIENT }, 'test mode without an id of its own: the placeholder of Google\'s example');
  assert.deepEqual(adsOf('TEST', PUB), { mode: 'test', client: PUB });
  assert.deepEqual(adsOf('on', ''), { mode: 'off', client: '' }, 'on with no id stays off');
  assert.deepEqual(adsOf('on', 'pub-123'), { mode: 'off', client: '' }, 'not a ca-pub id');
  assert.deepEqual(adsOf('on', PUB), { mode: 'on', client: PUB });
  assert.deepEqual(adsOf('yes', PUB), { mode: 'off', client: '' });
  // the server reads them as it loads (a fresh process: the config built from the environment)
  for (const [env, want] of [[{ CLA_ADS: 'test' }, { mode: 'test', client: TEST_CLIENT }], [{ CLA_ADS: 'on', CLA_ADSENSE_CLIENT: PUB }, { mode: 'on', client: PUB }], [{}, { mode: 'off', client: '' }]]) {
    const out = execFileSync(process.execPath, ['-e', "import('./server/config.js').then((m) => console.log(JSON.stringify(m.config.launch.ads)))"], { cwd: new URL('..', import.meta.url), env: { ...process.env, CLA_ADS: '', CLA_ADSENSE_CLIENT: '', ...env } });
    assert.deepEqual(JSON.parse(String(out)), want, JSON.stringify(env));
  }
  // no publisher id written into the repo: it comes from the environment (deploy/set-keys.sh)
  const src = readFileSync(new URL('../server/config.js', import.meta.url), 'utf8');
  assert.match(src, /env\('CLA_ADSENSE_CLIENT'\)/);
  assert.doesNotMatch(src, /ca-pub-\d{12,}/, 'no real publisher id in the code');
  assert.match(readFileSync(new URL('../deploy/set-keys.sh', import.meta.url), 'utf8'), /ask CLA_ADSENSE_CLIENT[\s\S]*ask CLA_ADS /);
});

test('/launch.json says whether ads are on (mode and the publisher id), and the privacy page explains them only then', async () => {
  const L = { publicUrl: 'https://play.example', pageOrigins: ['https://game.example'], rpId: 'game.example', rpName: 'CLA', devOpen: true, google: { id: '', secret: '' }, discord: { id: '', secret: '' }, email: { key: '', from: 'x' }, gaMeasurementId: '' };
  const get = async (ads) => {
    const H = createAuthHttp({ launch: { ...L, ads }, accounts: createAccounts({ store: new MemoryStore(), secret: 's', now: Date.now }), secret: 's', now: Date.now, ip: (r) => r.ip, log: { warn() {}, error() {}, log() {} }, onSignIn() {}, onTransfer() {} });
    return (await call(H.handle, { url: '/launch.json', headers: { origin: 'https://game.example' } })).json();
  };
  assert.deepEqual((await get(undefined)).ads, { mode: 'off' });
  assert.deepEqual((await get({ mode: 'off', client: '' })).ads, { mode: 'off' });
  assert.deepEqual((await get({ mode: 'test', client: TEST_CLIENT })).ads, { mode: 'test', client: TEST_CLIENT });
  assert.deepEqual((await get({ mode: 'on', client: PUB })).ads, { mode: 'on', client: PUB });
  const off = privacyPage({ ...L, ads: { mode: 'off' } }), on = privacyPage({ ...L, ads: { mode: 'on', client: PUB } });
  assert.match(off, /there are no ads/);
  assert.doesNotMatch(off, /Google's ads code/);
  assert.match(on, /<h2>Ads \(only if you choose to watch one\)<\/h2>/);
  assert.match(on, /non-personalized/);
  assert.match(on, /policies\.google\.com\/technologies\/ads/);
  assert.doesNotMatch(on, /there are no ads/);
  assert.ok(!on.includes(PUB), 'the publisher id is not on the page');
});

// a world with the Employment Center's two counters by the player (today's test city has none: placed here)
function setup({ ads = 'off', played = JOBAD.playS + 60 } = {}) {
  const w = makeWorld();
  w.ads = ads === 'off' ? { mode: 'off', client: '' } : { mode: ads, client: TEST_CLIENT };
  const { p, conn } = joinPlayer(w);
  p.profile.ftue = { st: 'done', tips: 0, m: {}, pt: played };
  const at = { x: p.ped.x, y: p.ped.y };
  // (the test city is shared by every world made here: the two counters added once, moved to the player each time)
  const put = (o) => { let q = w.map.pois.find((e) => e && e.kind === o.kind); if (!q) { q = { id: w.map.pois.length, ...o }; w.map.pois.push(q); } return Object.assign(q, o); };
  const desk = put({ kind: 'jobcenter', label: 'Employment Center', x: at.x, y: at.y, r: 48, fixed: true });
  const pc = put({ kind: 'jobpc', label: 'Job computer', x: at.x + 20, y: at.y, r: 30, fixed: true });
  return { w, p, conn, desk, pc, last: () => conn.sent.filter((m) => m && m.t === 'menu').pop() };
}
const pickRight = (w, p, desk) => economy.handleMenu(w, p, desk.id, `of:${p.office.tasks[p.office.i].ans}`);
const pickWrong = (w, p, desk) => economy.handleMenu(w, p, desk.id, `of:${(p.office.tasks[p.office.i].ans + 1) % OFFICE.opts}`);

test('office work: a round of quick tasks at the front desk, paid on the server by what is right, a clean round\'s bonus', () => {
  const { w, p, desk, last } = setup();
  assert.match(economy.poiLabel(w, p, desk), /Talk to the front desk - Employment Center/);
  economy.openMenu(w, p, desk);
  assert.ok(last().opts.some((o) => o.id === 'of:start'), 'the front desk offers a round');
  const cash0 = p.profile.cash;
  economy.handleMenu(w, p, desk.id, 'of:start');
  assert.ok(p.office, 'a round on');
  assert.equal(p.office.tasks.length, OFFICE.items);
  assert.equal(last().opts.filter((o) => /^of:\d$/.test(o.id)).length, OFFICE.opts, 'its options, one of them right');
  assert.match(last().title, /1 of 10/);
  for (let i = 0; i < OFFICE.items; i++) pickRight(w, p, desk);
  assert.equal(p.office, null, 'all answered: the round is over');
  assert.equal(p.profile.cash - cash0, OFFICE.items * OFFICE.pay + OFFICE.bonus, 'every one right and the bonus');
  assert.equal(p.profile.office.n, 1);
  // the next batch only OFFICE.roundS after the last began
  economy.handleMenu(w, p, desk.id, 'of:start');
  assert.equal(p.office, null, 'too soon');
  assert.ok(p.toasts.some((t) => /next batch/i.test(t.text)));
  run(w, OFFICE.roundS + 1);
  economy.handleMenu(w, p, desk.id, 'of:start');
  assert.ok(p.office, 'now it starts');
  const c1 = p.profile.cash;
  pickRight(w, p, desk); pickRight(w, p, desk); pickWrong(w, p, desk);
  economy.handleMenu(w, p, desk.id, 'of:stop');
  assert.equal(p.office, null);
  assert.equal(p.profile.cash - c1, 2 * OFFICE.pay, 'stopped early: paid for the right ones, no bonus');
});

test('office work: the time running out or walking off ends the round; the tasks are all answerable; the honest wage is modest', () => {
  const { w, p, desk } = setup();
  economy.handleMenu(w, p, desk.id, 'of:start');
  pickRight(w, p, desk);
  const c0 = p.profile.cash;
  run(w, OFFICE.roundS + 2);
  assert.equal(p.office, null, 'the time is up');
  assert.equal(p.profile.cash - c0, OFFICE.pay, 'the one right answer paid');
  run(w, OFFICE.roundS + 1);
  economy.handleMenu(w, p, desk.id, 'of:start');
  teleport(w, p.ped, desk.x + 400, desk.y);
  run(w, 2);
  assert.equal(p.office, null, 'walked away from the desk');
  // every kind of task: its options distinct, the right one among them
  for (const k of jobcenter.ROUND_KINDS) for (let i = 0; i < 60; i++) {
    const T = jobcenter.task(k);
    assert.equal(T.opts.length, OFFICE.opts, k);
    assert.equal(new Set(T.opts).size, T.opts.length, `${k}: options distinct (${T.opts})`);
    assert.ok(T.ans >= 0 && T.ans < T.opts.length, `${k}: the right answer is one of them (${T.q})`);
  }
  // the best a player can make here an hour (a round every OFFICE.roundS) stays under the mail round's rate
  const perHour = (OFFICE.items * OFFICE.pay + OFFICE.bonus) * 3600 / OFFICE.roundS;
  assert.ok(perHour <= 2400, `office work tops out at $${perHour} an hour`);
});

test('the job computer: the listings with ads off - no ad row, no ticket, no Google script asked for', () => {
  const { w, p, pc, last } = setup({ ads: 'off' });
  assert.equal(economy.poiLabel(w, p, pc), 'Use the job computer');
  economy.openMenu(w, p, pc);
  const m = last();
  assert.equal(m.title, 'Job computer');
  assert.ok(!m.opts.some((o) => o.id.startsWith('ad:')), 'no ad with ads off');
  assert.equal(m.ad, undefined);
  assert.ok(m.opts.some((o) => o.id === 'close'));
  assert.ok(!m.opts.some((o) => /steal|\brob|heist|fence/i.test(o.label)), 'honest work only on the Employment Center\'s computer');
  assert.ok(m.opts.filter((o) => o.id.startsWith('jl:')).length <= 4);
  // a view reported anyway: nothing
  const c0 = p.profile.cash;
  jobcenter.onAd(w, p, { a: 'start', tk: 'x' }); run(w, JOBAD.minS + 1); jobcenter.onAd(w, p, { a: 'viewed', tk: 'x' });
  assert.equal(p.profile.cash, c0);
});

test('the rewarded ad: paid only after a started, finished view on the server\'s ticket; dismissed or made up pays nothing; capped a day', () => {
  const { w, p, pc, last } = setup({ ads: 'test' });
  economy.openMenu(w, p, pc);
  const m = last(), row = m.opts.find((o) => o.id.startsWith('ad:'));
  assert.ok(row, 'ads on: the ad row');
  assert.match(row.label, new RegExp(`Watch an ad for \\$${JOBAD.reward}`));
  assert.ok(row.shut, 'the menu closes for the ad');
  assert.deepEqual(m.ad, { mode: 'test', client: TEST_CLIENT, tk: row.id.slice(3) }, 'the page gets the ticket and Google\'s test mode');
  const tk = row.id.slice(3), cash0 = p.profile.cash;
  // made up, or viewed without a start: nothing
  jobcenter.onAd(w, p, { a: 'viewed', tk: 'deadbeef' });
  jobcenter.onAd(w, p, { a: 'viewed', tk });
  assert.equal(p.profile.cash, cash0, 'no reward without the ad starting on this ticket');
  // started, then "viewed" too soon: refused
  jobcenter.onAd(w, p, { a: 'start', tk });
  jobcenter.onAd(w, p, { a: 'viewed', tk });
  assert.equal(p.profile.cash, cash0, 'a view shorter than JOBAD.minS is not paid');
  // a dismissed ad: the break ends without a view - nothing, and the ticket's gone
  economy.openMenu(w, p, pc);
  let tk2 = last().opts.find((o) => o.id.startsWith('ad:')).id.slice(3);
  jobcenter.onAd(w, p, { a: 'start', tk: tk2 }); run(w, JOBAD.minS + 1);
  jobcenter.onAd(w, p, { a: 'done', tk: tk2, st: 'dismissed' });
  jobcenter.onAd(w, p, { a: 'viewed', tk: tk2 });
  assert.equal(p.profile.cash, cash0, 'dismissed: no reward, not even if a view comes after');
  // a real one: started, long enough, viewed - paid once
  let paid = 0;
  for (let k = 0; k < JOBAD.perDay + 2; k++) {
    economy.openMenu(w, p, pc);
    const r = last().opts.find((o) => o.id.startsWith('ad:'));
    if (!r || r.dis) break;
    const t = r.id.slice(3);
    jobcenter.onAd(w, p, { a: 'start', tk: t }); run(w, JOBAD.minS + 1);
    const c = p.profile.cash;
    jobcenter.onAd(w, p, { a: 'viewed', tk: t });
    jobcenter.onAd(w, p, { a: 'viewed', tk: t });   // (twice: one ticket, one reward)
    jobcenter.onAd(w, p, { a: 'done', tk: t, st: 'viewed' });
    assert.equal(p.profile.cash - c, JOBAD.reward, `view ${k + 1}: paid once`);
    paid++;
  }
  assert.equal(paid, JOBAD.perDay, 'the day\'s cap');
  economy.openMenu(w, p, pc);
  const capped = last().opts.find((o) => o.id.startsWith('ad:'));
  assert.ok(capped && capped.dis, 'capped: the row says back tomorrow');
  assert.equal(last().ad, undefined, 'and no ticket for the page');
  assert.equal(p.profile.ads.n, JOBAD.perDay);
  // the next day (the goals' day): the count starts again
  w.nowMs = () => Date.now() + 86400e3;
  economy.openMenu(w, p, pc);
  assert.ok(!last().opts.find((o) => o.id.startsWith('ad:')).dis, 'a new day');
});

test('the rewarded ad: guests too, but none in a first session (JOBAD.playS played first); old profiles load without the fields', () => {
  const { w, p, pc, last } = setup({ ads: 'on', played: 30 });
  economy.openMenu(w, p, pc);
  assert.ok(!last().opts.some((o) => o.id.startsWith('ad:')), 'a brand-new character: no ad yet');
  p.profile.ftue.pt = JOBAD.playS;
  economy.openMenu(w, p, pc);
  assert.ok(last().opts.some((o) => o.id.startsWith('ad:') && !o.dis), 'played enough: offered (a guest as much as a member)');
  assert.equal(p.profile.ads, undefined, 'nothing saved until an ad is paid');
});

test('the page\'s ads module: Google\'s script only when asked and never on a portal; test mode; the reward callbacks report to the server', () => {
  const added = [], sent = [], toasts = [], hush = [];
  const doc = { head: { appendChild: (s) => added.push(s) }, createElement: () => ({ setAttribute(k, v) { this[k] = v; } }), referrer: '' };
  const win = { location: { search: '', hostname: 'deadbaron.com' }, document: doc, setTimeout: () => 1, clearTimeout: () => {} };
  win.top = win;
  const A = createAds({ win, doc, send: (o) => sent.push(o), toast: (t) => toasts.push(t), sound: () => true, hush: (on) => hush.push(on) });
  assert.equal(A.load({ mode: 'off', client: PUB }), false);
  assert.equal(A.load({ mode: 'test', client: 'nope' }), false);
  assert.equal(added.length, 0, 'nothing loaded while off');
  assert.equal(A.reward('tk'), false, 'no script: no ad');
  assert.equal(A.load({ mode: 'test', client: PUB }), true);
  assert.equal(added.length, 1);
  assert.match(added[0].src, /^https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1234567890123456$/);
  assert.equal(added[0]['data-adbreak-test'], 'on', 'test mode: Google\'s test ads');
  assert.equal(added[0]['data-ad-client'], PUB);
  assert.equal(win.adsbygoogle.requestNonPersonalizedAds, 1, 'non-personalized ads');
  assert.equal(win.adsbygoogle[0].preloadAdBreaks, 'on', 'adConfig: preloaded');
  A.load({ mode: 'test', client: PUB });
  assert.equal(added.length, 1, 'once');
  // pressed: adBreak with type reward - shown at once; watched; done
  assert.equal(A.reward('tk1'), true);
  const brk = win.adsbygoogle[win.adsbygoogle.length - 1];
  assert.equal(brk.type, 'reward');
  let shown = 0;
  brk.beforeReward(() => { shown++; });
  assert.equal(shown, 1, 'showAdFn called in the press');
  brk.beforeAd(); brk.adViewed(); brk.afterAd(); brk.adBreakDone({ breakStatus: 'viewed' });
  assert.deepEqual(sent.map((o) => o.a), ['start', 'viewed', 'done']);
  assert.ok(sent.every((o) => o.t === 'ad' && o.tk === 'tk1'));
  assert.deepEqual(hush, [true, false, false], 'the game hushed while it plays');
  // no ad ready: adBreakDone alone - a line, no start
  sent.length = 0;
  A.reward('tk2');
  win.adsbygoogle[win.adsbygoogle.length - 1].adBreakDone({ breakStatus: 'notReady' });
  assert.deepEqual(sent, [{ t: 'ad', a: 'done', tk: 'tk2', st: 'notReady' }]);
  assert.ok(toasts.some((t) => /No ad to watch/.test(t)));
  // a portal's page never loads it
  for (const host of ['www.crazygames.com', 'games.poki.com', 'html5.gamedistribution.com']) assert.ok(onPortal({ location: { search: '', hostname: host }, document: { referrer: '' }, top: null }), host);
  assert.ok(onPortal({ location: { search: '?portal=1', hostname: 'deadbaron.com' }, document: { referrer: '' } }));
  assert.ok(!onPortal(win), 'our own page');
  // and the page loads the module lazily
  const page = new Set(closure(['client/boot.js', 'client/main.js']));
  assert.ok(!page.has('client/ads.js'), 'client/ads.js loads when the job computer offers an ad, not with the page');
  assert.match(readFileSync(new URL('../client/main.js', import.meta.url), 'utf8'), /import\('\.\/ads\.js'\)/);
});

test('the first-time experience sends honest work on to the Employment Center (its last line and a waypoint)', () => {
  const { w, desk } = setup();
  for (const k of ['mail', 'courier']) {
    const L = endLine(w, k);
    assert.match(L.text, /More steady work at the Employment Center - it's on your map/);
    assert.deepEqual(L.mark, { x: Math.round(desk.x), y: Math.round(desk.y), label: 'Employment Center' });
  }
  assert.equal(endLine(w, 'fish').mark, undefined, 'the outdoors: as it was');
  desk.kind = 'delivery';   // (a world without one: the line as it was)
  try { assert.match(endLine(w, 'mail').text, /After that, the city's yours/); } finally { desk.kind = 'jobcenter'; }
});

test('the Guide: the Employment Center, office work and the job computer - their numbers from the rules', () => {
  const was = { pay: OFFICE.pay, items: OFFICE.items, reward: JOBAD.reward, day: JOBAD.perDay };
  try {
    OFFICE.pay = 7; OFFICE.items = 12; JOBAD.reward = 333; JOBAD.perDay = 9;
    const S = guideSections({ pois: [{ kind: 'jobcenter' }] });
    const e = (sec, id) => S.find((s) => s.id === sec).entries.find((q) => q.id === id);
    assert.match(e('places', 'jobcenter').b, /office work/i);
    assert.match(e('earn', 'office').b, /12 quick tasks/);
    assert.match(e('earn', 'office').b, /\$7 for each one right/);
    assert.match(e('activities', 'jobpc').b, /\$333/);
    assert.match(e('activities', 'jobpc').b, /9 a day/);
  } finally { OFFICE.pay = was.pay; OFFICE.items = was.items; JOBAD.reward = was.reward; JOBAD.perDay = was.day; }
});
