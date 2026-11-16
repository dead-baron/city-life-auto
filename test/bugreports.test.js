// Report a bug (the owner, 11-14: server/bugreports.js, client/bugreport.js): POST /report with the page's own token -
// the text and the kind, a WebP or JPEG screenshot under its cap, what the page knows; the server adds who and where.
// The rate limits (a player's few in a few minutes, everyone's an hour), the size cap, nothing personal in the Discord
// post (a fake webhook fetch: no email, no address, no token, no mentions that ping), the newest reports kept and the
// pictures' megabytes capped (oldest dropped with their files), the staff's /admin/bugs page (the screenshot, mark
// done with the session's form token, in the admin log), and /launch.json's Discord invite.
import { clock, call, fakeWorld, fakePlayer } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore, useStore, store } from '../server/store.js';
import { config } from '../server/config.js';
import { createLaunch } from '../server/launch.js';
import { coarseUA, imageType } from '../server/bugreports.js';
import { BUG_REPORT } from '../shared/rules.js';

const ORIGIN = 'https://game.example', HOOK = 'https://discord.com/api/webhooks/1234567890/secret-hook-token_x';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro Build/UQ1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.81 Mobile Safari/537.36';
// a tiny WebP and JPEG (their signatures and some bytes)
const webp = (n = 2000) => { const b = Buffer.alloc(n, 7); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(n - 8, 4); b.write('WEBP', 8, 'latin1'); return b; };
const jpeg = (n = 2000) => { const b = Buffer.alloc(n, 9); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; };
const tick = () => new Promise((z) => setTimeout(z, 5));

function setup({ webhook = HOOK, dir = mkdtempSync(join(tmpdir(), 'cla-bugs-')), hookFails = false } = {}) {
  useStore(new MemoryStore());
  const world = fakeWorld(); world.stats = { tickMs: 0 }; world.build = 'srv-build';
  world.map = { districtAt: () => ({ name: 'Midtown', isl: 'Metro City' }), pois: [] };
  const c = clock(), hooks = [], logged = [];
  const log = { log: (...a) => logged.push(a.join(' ')), warn: (...a) => logged.push(a.join(' ')), error: (...a) => logged.push(a.join(' ')) };
  const fetch = async (url, init) => { hooks.push({ url, init }); if (hookFails) throw Object.assign(new Error('nope'), { name: 'TimeoutError' }); return { ok: true, status: 204 }; };
  const cfg = { ...config, launch: { ...config.launch, publicUrl: 'https://play.example', pageOrigins: [ORIGIN], devOpen: true, google: { id: '', secret: '' }, discord: { id: '', secret: '' }, passwords: true, email: { key: '', from: 'x' }, bugWebhook: webhook, discordInvite: 'https://discord.gg/zuVSkbfjg' } };
  const L = createLaunch({ config: cfg, store, world, ip: (r) => r.ip, dataDir: null, bugDir: dir, now: c.now, log, fetch, signOutCloseMs: 0 });
  const h = (o) => call(L.http, { ...o, headers: { origin: ORIGIN, 'user-agent': UA, ...(o.headers || {}) } });
  const report = (token, body, o = {}) => h({ method: 'POST', url: '/report', body, headers: token ? { authorization: `Bearer ${token}` } : {}, ...o });
  // a guest in the city (their token as the page holds it)
  const guest = (o = {}) => { const r = L.login(null, {}, '5.5.5.5'); const p = fakePlayer(world, store, { pid: r.profile.pid, x: 3200, y: 6400, ...o }); L.hooks.join(p, {}, {}); return { p, token: r.token }; };
  return { L, world, c, hooks, logged, h, report, guest, dir };
}
const SAVED = { ...BUG_REPORT };
const restore = () => Object.assign(BUG_REPORT, SAVED);
const page = { build: 'page-build', fps: 47, preset: 'medium', input: 'touch', w: 390, h: 844, dpr: 3, area: 'MIDTOWN', online: true, errors: [{ at: 1, where: 'frame', msg: 'x is undefined' }] };

test('a report: kept with who and where, the screenshot on disk, posted to Discord with nothing personal in it', async () => {
  const S = setup();
  // a member with an email address, signed in on the page
  let r = await S.h({ method: 'POST', url: '/auth/password/signup', body: { email: 'ann@example.com', password: 'a long passphrase about tacos', confirm: 'a long passphrase about tacos', action: 'new' } });
  assert.equal(r.status, 200, r.body);
  const { token, pid } = r.json();
  const p = fakePlayer(S.world, store, { pid, x: 1600, y: 3200 }); S.L.hooks.join(p, {}, {});
  r = await S.report(token, { text: 'Fell through the road @everyone\nby the bank', kind: 'stuck', shot: webp().toString('base64'), page });
  assert.equal(r.status, 200, r.body);
  const id = r.json().id;
  const rep = S.L.bugs.get(id);
  assert.equal(rep.pid, pid); assert.equal(rep.name, p.profile.name); assert.equal(rep.guest, false);
  assert.equal(rep.region, 'Midtown, Metro City'); assert.deepEqual([rep.x, rep.y], [1600, 3200]);
  assert.equal(rep.ua, 'Android 14 · Chrome 131', 'the browser and system, coarse - no phone model');
  assert.equal(rep.device, 'phone · touch'); assert.equal(rep.screen, '390x844@3');
  assert.equal(rep.build, 'page-build'); assert.equal(rep.serverBuild, 'srv-build'); assert.equal(rep.fps, 47); assert.equal(rep.preset, 'medium');
  assert.equal(rep.errors.length, 1);
  assert.equal(rep.shot, `${id}.webp`);
  assert.ok(existsSync(join(S.dir, 'img', rep.shot)), 'the screenshot kept');
  S.L.bugs.flush();
  const kept = readFileSync(join(S.dir, 'reports.json'), 'utf8');
  for (const no of ['ann@example.com', token, '9.9.9.9', UA]) assert.ok(!kept.includes(no), `not kept: ${no}`);
  // the Discord post: an embed (the first line its title, the fields) and the screenshot attached
  await tick();
  assert.equal(S.hooks.length, 1);
  assert.equal(S.hooks[0].url, HOOK);
  const fd = S.hooks[0].init.body, pl = JSON.parse(fd.get('payload_json')), file = fd.get('files[0]');
  assert.ok(S.hooks[0].init.signal, 'with a timeout');
  assert.deepEqual(pl.allowed_mentions, { parse: [] }, 'nothing in a report can ping anyone');
  const e = pl.embeds[0];
  assert.equal(e.title, 'Fell through the road @everyone');
  assert.deepEqual(e.fields.map((f) => f.name), ['Player', 'Where', 'Device', 'Build', 'FPS', 'Kind']);
  assert.equal(e.fields[1].value, 'Midtown, Metro City'); assert.equal(e.fields[4].value, '47');
  assert.equal(e.image.url, `attachment://${id}.webp`);
  assert.equal(file.type, 'image/webp'); assert.equal(file.size, 2000);
  const all = JSON.stringify(pl);
  for (const no of ['ann@example.com', token, '9.9.9.9', pid, 'Pixel 7', HOOK]) assert.ok(!all.includes(no), `not in the Discord post: ${no}`);
  assert.ok(!S.logged.join('\n').includes(HOOK) && !S.logged.join('\n').includes(token), 'neither the webhook nor a token logged');
});

test('who may send: the page\'s own token (a guest too); no token, a forged one or a banned account - refused', async () => {
  const S = setup({ webhook: '' });
  assert.equal((await S.report(null, { text: 'hi' })).status, 401);
  assert.equal((await S.report('forged.token', { text: 'hi' })).status, 401);
  const g = S.guest();
  let r = await S.report(g.token, { text: 'the bus never came' });
  assert.equal(r.status, 200, r.body);
  assert.equal(S.L.bugs.get(r.json().id).guest, true);
  assert.equal(S.L.bugs.get(r.json().id).shot, null, 'no screenshot: fine');
  S.L.accounts.ban(g.p.pid, { why: 'test' });
  assert.equal((await S.report(g.token, { text: 'again' })).status, 401);
  // something to say: text, or a kind picked (a pad has no keys)
  const h = S.guest();
  assert.equal((await S.report(h.token, { text: '   ' })).status, 400);
  assert.equal((await S.report(h.token, { kind: 'graphics' })).status, 200, 'a kind is enough');
  // the preflight for the page's origin
  r = await S.h({ method: 'OPTIONS', url: '/report' });
  assert.equal(r.status, 204); assert.equal(r.headers['access-control-allow-origin'], ORIGIN);
  assert.equal((await S.h({ url: '/report' })).status, 405);
  await tick();
  assert.equal(S.hooks.length, 0, 'no webhook set: only kept');
});

test('the size cap: the text cut to its length, a screenshot over the cap or not a picture refused', async () => {
  const S = setup({ webhook: '' });
  const g = S.guest();
  let r = await S.report(g.token, { text: 'x'.repeat(BUG_REPORT.text + 400) });
  assert.equal(r.status, 200);
  assert.equal(S.L.bugs.get(r.json().id).text.length, BUG_REPORT.text);
  r = await S.report(g.token, { text: 'big', shot: jpeg(BUG_REPORT.shotKb * 1024 + 10).toString('base64') });
  assert.equal(r.status, 413);
  r = await S.report(g.token, { text: 'a png', shot: Buffer.from('\x89PNG\r\n\x1a\n' + 'z'.repeat(100), 'latin1').toString('base64') });
  assert.equal(r.status, 400);
  const g2 = S.guest();
  r = await S.report(g2.token, { text: 'huge body', shot: 'A'.repeat(BUG_REPORT.shotKb * 1024 * 2) });
  assert.equal(r.status, 413, 'the body itself over the cap');
  r = await S.report(g2.token, { text: 'a jpeg', shot: jpeg().toString('base64') });
  assert.equal(r.status, 200);
  assert.equal(S.L.bugs.get(r.json().id).shot.endsWith('.jpg'), true);
  assert.equal(imageType(webp()), 'webp'); assert.equal(imageType(jpeg()), 'jpg'); assert.equal(imageType(Buffer.from('GIF89a')), null);
  assert.equal(coarseUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'), 'iOS 17.4 · Safari 17');
  assert.equal(coarseUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'), 'Windows · Edge 131');
});

test('the rate limits: a player\'s few in a few minutes, everyone\'s an hour', async () => {
  const S = setup({ webhook: '' });
  try {
    const a = S.guest();
    for (let i = 0; i < BUG_REPORT.perPlayer; i++) assert.equal((await S.report(a.token, { text: `n${i}` })).status, 200);
    const r = await S.report(a.token, { text: 'one more' });
    assert.equal(r.status, 429);
    assert.match(r.json().err, new RegExp(`${BUG_REPORT.perMin} minutes`));
    S.c.add(BUG_REPORT.perMin * 60e3);
    assert.equal((await S.report(a.token, { text: 'later' })).status, 200, 'again after the window');
    // everyone's cap an hour (each from their own network)
    Object.assign(BUG_REPORT, { perHour: 5 });
    const S2 = setup({ webhook: '' });
    let ok = 0, last = null;
    for (let i = 0; i < 8; i++) { const g = S2.guest(); last = await S2.report(g.token, { text: `p${i}` }, { ip: `10.0.0.${i}` }); if (last.status === 200) ok++; }
    assert.equal(ok, 5);
    assert.equal(last.status, 429);
  } finally { restore(); }
});

test('storage: the newest reports kept, the pictures\' megabytes capped - the oldest go, with their files; kept over a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cla-bugs-'));
  try {
    Object.assign(BUG_REPORT, { keep: 4, perPlayer: 99, perHour: 999 });
    const S = setup({ webhook: '', dir });
    const g = S.guest();
    const ids = [];
    for (let i = 0; i < 6; i++) { const r = await S.report(g.token, { text: `r${i}`, shot: webp(3000).toString('base64') }, { ip: `10.1.0.${i}` }); assert.equal(r.status, 200, r.body); ids.push(r.json().id); S.c.add(1000); }
    assert.equal(S.L.bugs.count, 4);
    assert.deepEqual(S.L.bugs.list().map((r) => r.text), ['r5', 'r4', 'r3', 'r2'], 'newest first, the two oldest gone');
    assert.equal(readdirSync(join(dir, 'img')).length, 4, 'their pictures gone too');
    assert.ok(!existsSync(join(dir, 'img', `${ids[0]}.webp`)));
    // the pictures' cap: 10 KB of room - the oldest dropped until it fits
    Object.assign(BUG_REPORT, { keep: 100, keepMb: 10 / 1024 });
    const r = await S.report(g.token, { text: 'r6', shot: webp(3000).toString('base64') }, { ip: '10.1.1.1' });
    assert.equal(r.status, 200);
    assert.deepEqual(S.L.bugs.list().map((q) => q.text), ['r6', 'r5', 'r4'], '9 KB of pictures left');
    S.L.bugs.flush();
    // a restart: read back
    const S3 = setup({ webhook: '', dir });
    assert.deepEqual(S3.L.bugs.list().map((q) => q.text), ['r6', 'r5', 'r4']);
    assert.equal(S3.L.bugs.image(S3.L.bugs.list()[0].id).type, 'image/webp');
  } finally { restore(); }
});

test('a webhook that fails or hangs: logged, the report kept and answered all the same', async () => {
  const S = setup({ hookFails: true });
  const g = S.guest();
  const r = await S.report(g.token, { text: 'lag spike' });
  assert.equal(r.status, 200);
  await tick();
  assert.equal(S.hooks.length, 1);
  assert.ok(S.logged.some((l) => /couldn't post report .* to Discord: TimeoutError/.test(l)));
  assert.ok(!S.logged.join('\n').includes(HOOK));
  // a webhook that isn't Discord's: never called
  const S2 = setup({ webhook: 'https://evil.example/api/webhooks/1/x' });
  await S2.report(S2.guest().token, { text: 'x' });
  await tick();
  assert.equal(S2.hooks.length, 0);
});

test('the staff page /admin/bugs: admins and up, the screenshot shown, mark done (the form token; in the admin log); the Discord invite in /launch.json', async () => {
  const S = setup({ webhook: '' });
  const g = S.guest();
  const id = (await S.report(g.token, { text: 'Stuck in a wall <script>', kind: 'stuck', shot: webp().toString('base64'), page })).json().id;
  const admin = S.guest(); S.L.accounts.signIn('google', 'g-admin', { linkPid: admin.p.pid }); S.L.accounts.setRole(admin.p.pid, 'admin');
  const helper = S.guest(); S.L.accounts.signIn('google', 'g-helper', { linkPid: helper.p.pid }); S.L.accounts.setRole(helper.p.pid, 'helper');
  const enter = async (pid) => { const c = new URL(S.L.adminHttp.pageLink(pid, 'bugs')).searchParams.get('c'); const x = await S.h({ url: `/admin/enter?c=${c}` }); return x.headers['set-cookie'].match(/cla_admin=([^;]+)/)[1]; };
  const ch = await enter(helper.p.pid);
  assert.equal((await S.h({ url: '/admin/bugs', headers: { cookie: `cla_admin=${ch}` } })).status, 403, 'not for a helper');
  assert.equal((await S.h({ url: '/admin/bugs' })).status, 401, 'signed out');
  const ca = await enter(admin.p.pid), ck = { cookie: `cla_admin=${ca}` };
  let r = await S.h({ url: '/admin/bugs', headers: ck });
  assert.equal(r.status, 200);
  assert.match(r.body, /Stuck in a wall &lt;script&gt;/, 'escaped');
  assert.match(r.body, new RegExp(`<img src="/admin/bugs/img\\?id=${id}"`));
  assert.match(r.headers['content-security-policy'], /img-src 'self'/);
  assert.match(r.body, /<b>1<\/b> open/);
  r = await S.h({ url: `/admin/bugs/img?id=${id}`, headers: ck });
  assert.equal(r.status, 200); assert.equal(r.headers['content-type'], 'image/webp');
  assert.equal((await S.h({ url: '/admin/bugs/img?id=../../secret', headers: ck })).status, 404);
  const csrf = r.body && (await S.h({ url: '/admin/bugs', headers: ck })).body.match(/name="csrf" value="([^"]+)"/)[1];
  r = await S.h({ method: 'POST', url: '/admin/bugs', headers: { ...ck, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: 'wrong', id, a: 'done' }).toString() });
  assert.equal(r.status, 403);
  r = await S.h({ method: 'POST', url: '/admin/bugs', headers: { ...ck, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf, id, a: 'done' }).toString() });
  assert.equal(r.status, 303);
  assert.ok(S.L.bugs.get(id).done);
  assert.match((await S.h({ url: '/admin/bugs', headers: ck })).body, /<b>0<\/b> open[\s\S]*Open again/);
  assert.ok(S.L.adminLog.tail(10).some((x) => x.what === 'bug-done' && x.note === id && x.who.id === admin.p.pid));
  // the game's staff link: 'bugs' for admins
  assert.equal(S.L.admin.handle(S.world, admin.p, { t: 'admin', a: 'pagelink', page: 'bugs' }).ok, true);
  // the invite
  r = await S.h({ url: '/launch.json' });
  assert.equal(r.json().discord, 'https://discord.gg/zuVSkbfjg');
  // the Ko-fi page (11-16): on by default, at the studio's page
  assert.equal(r.json().support, 'https://ko-fi.com/deadbaron');
});
