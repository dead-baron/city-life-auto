// Roles, the admin log and the anti-cheat audits (server/roles.js, admin.js, adminlog.js, devmode.js, anticheat.js):
// every privileged message refused to someone without the power, and logged; the owner hands out admin and helper;
// the log is append-only and a hand edit shows; the debug mode closes to non-admins at launch; movement, rate and
// economy audits flag to the review list.
import { clock, fakeWorld, fakePlayer } from './launchkit.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { store } from '../server/store.js';
import { createAccounts } from '../server/accounts.js';
import { createModeration } from '../server/moderation.js';
import { createAdminLog } from '../server/adminlog.js';
import { createAdmin, notePurchase } from '../server/admin.js';
import { POWERS, allowed } from '../server/roles.js';
import { createAntiCheat, RATES } from '../server/anticheat.js';
import * as devmode from '../server/devmode.js';
import { VEHICLES } from '../shared/vehicles.js';

function setup(c = clock()) {
  for (const k of Object.keys(store.kept)) delete store.kept[k];
  const A = createAccounts({ store, secret: 'test-secret', now: c.now });
  const mod = createModeration({ store, now: c.now });
  const log = createAdminLog(null, c.now);
  const admin = createAdmin({ accounts: A, log, mod, store, pageLink: (pid, page) => `https://x/admin/enter?c=abc&p=${page}`, now: c.now });
  const w = fakeWorld();
  const P = (role = null, o = {}) => { const p = fakePlayer(w, store, o); const a = A.ensure(p.profile); a.kind = 'member'; if (role) A.setRole(p.pid, role); return p; };
  return { c, A, mod, log, admin, w, P };
}

test('roles: the powers each role has, and nobody else', () => {
  for (const [power, need] of Object.entries(POWERS)) {
    assert.equal(allowed(null, power), false, `a player can't ${power}`);
    assert.equal(allowed('owner', power), true, `the owner can ${power}`);
    assert.equal(allowed('helper', power), need === 'helper');
    assert.equal(allowed('admin', power), need !== 'owner');
  }
  assert.equal(allowed('owner', 'no-such-power'), false);
  assert.equal(allowed('superuser', 'kick'), false, 'a made-up role is nothing');
});

test('every privileged message from a non-staff player is refused and logged; the role comes from the account, not the message', () => {
  const S = setup();
  const p = S.P(), target = S.P();
  for (const a of [...Object.keys(POWERS), 'pagelink']) {
    S.c.add(61e3);   // (refusals are logged at most once a minute a player)
    const r = S.admin.handle(S.w, p, { a, id: target.pid, role: 'admin', item: 'bandage', n: 5, i: 1, hours: 1, page: 'log', isOwner: true, role_override: 'owner' });
    assert.equal(r.ok, false, `${a} refused`);
    assert.match(r.err, /don't have that power/, a);
  }
  const refused = S.log.tail(500).filter((e) => !e.ok);
  assert.ok(refused.length >= Object.keys(POWERS).length, 'refusals are in the log');
  assert.equal(S.A.role(p.pid), null);
  assert.equal(S.A.role(target.pid), null, 'nothing changed');
  // a helper is refused the admin and owner powers
  const h = S.P('helper');
  for (const a of ['kick', 'ban', 'mute', 'strike', 'role', 'reviews']) { S.c.add(11e3); assert.equal(S.admin.handle(S.w, h, { a, id: target.pid }).ok, false, `helper: ${a}`); }
  // an admin is refused the owner's
  const ad = S.P('admin');
  assert.equal(S.admin.handle(S.w, ad, { a: 'role', id: target.pid, role: 'admin' }).ok, false);
});

test('the owner hands out admin and helper (never owner); nobody acts on their own rank or above; every action logged with before and after', () => {
  const S = setup();
  const owner = S.P('owner'), a1 = S.P(), a2 = S.P(), guest = fakePlayer(S.w, store);
  S.A.ensure(guest.profile);
  assert.ok(S.admin.handle(S.w, owner, { a: 'role', id: a1.pid, role: 'admin' }).ok);
  assert.equal(S.A.role(a1.pid), 'admin');
  assert.equal(S.admin.handle(S.w, owner, { a: 'role', id: a2.pid, role: 'owner' }).ok, false, 'not owner');
  assert.equal(S.admin.handle(S.w, owner, { a: 'role', id: guest.pid, role: 'helper' }).ok, false, 'guests sign in first');
  assert.ok(S.admin.handle(S.w, owner, { a: 'role', id: a2.pid, role: 'admin' }).ok);
  assert.equal(S.admin.handle(S.w, a1, { a: 'ban', id: a2.pid, hours: 1 }).ok, false, 'admin on admin');
  assert.equal(S.admin.handle(S.w, a1, { a: 'kick', id: owner.pid }).ok, false, 'admin on the owner');
  const e = S.log.tail(10).find((x) => x.what === 'role' && x.target.id === a1.pid);
  assert.equal(e.before, null);
  assert.equal(e.after, 'admin');
  assert.equal(e.who.id, owner.pid);
  assert.equal(e.who.role, 'owner');
  assert.ok(e.at > 0);
  // ban: kicked, logged, the login refused till it ends; unban
  const bad = S.P();
  assert.ok(S.admin.handle(S.w, a1, { a: 'ban', id: bad.pid, hours: 2, why: 'griefing' }).ok);
  assert.equal(bad.conn.open, false);
  assert.ok(S.A.banned(bad.pid));
  const be = S.log.tail(5).find((x) => x.what === 'ban');
  assert.equal(be.before, null);
  assert.equal(be.after.why, 'griefing');
  assert.ok(S.admin.handle(S.w, a1, { a: 'unban', id: bad.pid }).ok);
  assert.equal(S.A.banned(bad.pid), null);
});

test('helper powers: refund a purchase once, restore an item, read the recent log - before and after in the admin log', () => {
  const S = setup();
  const h = S.P('helper'), p = S.P();
  p.profile.bank = 100;
  const acct = S.A.get(p.pid);
  const i = notePurchase(acct, 450, 'gunshop w:pistol:450');
  let r = S.admin.handle(S.w, h, { a: 'refund', id: p.pid, i });
  assert.ok(r.ok);
  assert.equal(p.profile.bank, 550);
  assert.match(S.admin.handle(S.w, h, { a: 'refund', id: p.pid, i }).err, /Already/);
  const e = S.log.tail(5).find((x) => x.what === 'refund');
  assert.deepEqual([e.before.bank, e.after.bank], [100, 550]);
  const had = p.profile.inventory.bandage || 0;
  assert.ok(S.admin.handle(S.w, h, { a: 'restore', id: p.pid, item: 'bandage', n: 2 }).ok);
  assert.equal(p.profile.inventory.bandage, had + 2);
  assert.equal(S.admin.handle(S.w, h, { a: 'restore', id: p.pid, item: 'gold_bar_of_doom' }).ok, false);
  r = S.admin.handle(S.w, h, { a: 'plog', id: p.pid });
  assert.ok(r.ok);
  assert.ok(r.data.log.some((x) => x.k === 'staff' && /refund/.test(x.d)), 'the player\'s own log notes it');
  assert.equal(r.data.buys[0].refunded.by, h.pid);
});

test('the admin log: append-only lines in a chain, verified end to end; an edit or a removed line shows; a restart carries on the chain', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cla-alog-'));
  const file = join(dir, 'admin-log.jsonl');
  let L = createAdminLog(file);
  for (let i = 0; i < 5; i++) L.append({ who: { id: 'o', n: 'Owner', role: 'owner' }, what: 'kick', target: { id: `t${i}`, n: 'T' }, before: i, after: i + 1 });
  L.flushSync();
  assert.deepEqual(L.verify(), { ok: true, n: 5, brokenAt: -1 });
  L = createAdminLog(file);   // (a restart)
  L.append({ who: { id: 'o' }, what: 'unban' });
  L.flushSync();
  assert.equal(L.verify().ok, true);
  assert.equal(L.tail(1)[0].what, 'unban');
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  writeFileSync(file, lines.map((l, i) => (i === 2 ? l.replace('"after":3', '"after":99') : l)).join('\n') + '\n');
  assert.deepEqual({ ...L.verify(), why: undefined }, { ok: false, n: 2, brokenAt: 2, why: undefined }, 'an edited line');
  writeFileSync(file, lines.filter((_, i) => i !== 1).join('\n') + '\n');
  assert.equal(L.verify().brokenAt, 1, 'a removed line');
  assert.deepEqual(L.tail(2, 't4').map((e) => e.target.id), ['t4'], 'filtered by target');
});

test('dev mode at launch: closed to everyone but admins and the owner; granting it to a non-admin refused; open while devOpen', () => {
  const S = setup();
  const p = S.P(), ad = S.P('admin');
  devmode.setPolicy({ open: false, may: (q) => allowed(S.A.role(q.pid), 'dev') });
  try {
    assert.equal(devmode.tryPassword(S.w, p, 'GODMODE'), false, 'not even with the old password');
    assert.ok(!p.devMode);
    assert.equal(devmode.mayDev(p), false);
    assert.ok(devmode.tryPassword(S.w, ad, null));
    assert.ok(ad.devMode);
    devmode.grant(S.w, ad, p.pid);
    assert.ok(!p.devMode, 'a non-admin isn\'t given it');
    devmode.setPolicy({ open: true });
    assert.ok(devmode.tryPassword(S.w, p, null), 'open while testing');
  } finally { devmode.setPolicy({ open: true, may: () => false }); }
});

test('movement audit: a teleport the server didn\'t make and sustained overspeed are flagged; a server teleport, a vehicle\'s speed and dev mode are not', () => {
  const S = setup();
  const ac = createAntiCheat({ mod: S.mod, now: S.c.now, log: null });
  const p = S.P(null, { x: 1000, y: 1000 });
  const step = (dx, dy, dt = 0.5) => { S.w.time += dt; p.ped.x += dx; p.ped.y += dy; return ac.audit(S.w); };
  assert.deepEqual(step(0, 0), [], 'the first sample');
  assert.deepEqual(step(100, 0), [], 'a sprint: 200 px/s');
  assert.equal(step(5000, 0)[0].kind, 'teleport', 'five thousand px in half a second');
  p.teleportAt = S.w.time + 0.01;
  assert.deepEqual(step(9000, 0), [], 'the server moved them (a respawn, the dev menu, a train)');
  assert.deepEqual(step(0, 0), []);
  // on foot faster than the physics allows, again and again
  let f = [];
  for (let i = 0; i < 4; i++) f = f.concat(step(300, 0));
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, 'speed');
  // in a sports car at its top speed: fine
  const car = { id: 77, def: VEHICLES.sports };
  S.w.entities.set(77, car);
  p.ped.vehId = 77;
  step(0, 0);
  for (let i = 0; i < 6; i++) assert.deepEqual(step(VEHICLES.sports.max * 0.5, 0), [], 'its own top speed');
  p.ped.vehId = 0;
  p.devMode = true;
  step(0, 0);
  assert.deepEqual(step(20000, 0), [], 'dev mode flies about');
  assert.ok(S.mod.openReviews().some((r) => r.kind === 'teleport'));
  assert.ok(S.mod.openReviews().some((r) => r.kind === 'speed'));
});

test('action rate checks: each message kind at its own rate, the rest dropped; a flood is flagged; inputs capped', () => {
  const S = setup();
  const ac = createAntiCheat({ mod: S.mod, now: S.c.now, log: null });
  const p = S.P();
  let ok = 0;
  for (let i = 0; i < 30; i++) if (ac.allow(p, 'menu')) ok++;
  assert.equal(ok, RATES.menu);
  assert.ok(ac.allow(p, 'chat'), 'another kind has its own count');
  S.c.add(1000);
  assert.ok(ac.allow(p, 'menu'), 'a new second');
  for (let i = 0; i < 100; i++) ac.allow(p, 'name');
  assert.ok(S.mod.openReviews().some((r) => r.kind === 'rate'));
  for (let s = 0; s < 4; s++) { for (let i = 0; i < 200; i++) ac.input(p); S.c.add(1000); }
  ac.input(p);
  assert.ok(S.mod.openReviews().some((r) => r.kind === 'input'));
});

test('economy anomaly: earnings an hour far above the norm flagged once an hour', () => {
  const S = setup();
  const ac = createAntiCheat({ mod: S.mod, now: S.c.now, log: null });
  const p = S.P();
  assert.equal(ac.earned(p, 20000, 5000), null, 'busy but normal');
  assert.equal(ac.earned(p, 80000, 5000).kind, 'econ');
  assert.equal(ac.earned(p, 90000, 5000), null, 'once an hour');
  S.c.add(3600e3 + 1);
  assert.ok(ac.earned(p, 90000, 5000));
});
