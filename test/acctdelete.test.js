// Delete account (the owner, 11-15: "writing me to manually delete their account sounds like a bad idea"): a player
// deletes their own account from Settings > Account - out of the game at once, kept ACCOUNT.deleteDays for RESTORE (on
// the title, or staff's undelete), then erased for good by launch.js's purge: the profile, its homes, its name in other
// players' contacts. The owner's account can't be deleted this way.
import { makeWorld, fakeConn, store } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config.js';
import { createLaunch } from '../server/launch.js';
import { createSession } from '../server/session.js';
import { ACCOUNT } from '../shared/rules.js';

const quiet = { log() {}, warn() {}, error() {}, info() {} };
function boot() {
  const world = makeWorld();
  let t = Date.now();
  const cfg = { ...config, launch: { ...config.launch, devOpen: true, gaMeasurementId: '', gaApiSecret: '', requireAge: false } };
  const L = createLaunch({ config: cfg, store, world, ip: () => '1.2.3.4', dataDir: null, log: quiet, now: () => t });
  const connect = (token = null, extra = {}) => {
    const conn = fakeConn();
    conn.close = function (code) { this.open = false; this.code = code; };
    const s = createSession(world, conn, { seed: 1337, dev: false, maxPlayers: 50, label: 'test', login: (tk, h) => L.login(tk, h, '1.2.3.4'), hooks: L.hooks });
    s.onMessage(JSON.stringify({ t: 'hello', token, dm: 'cd'.repeat(16), ...extra }), false);
    const welcome = conn.sent.find((m) => m.t === 'welcome');
    const p = welcome ? world.players.get(welcome.pid) : null;
    return { conn, s, welcome, p, say: (m) => s.onMessage(JSON.stringify(m), false), last: (k) => [...conn.sent].reverse().find((m) => m.t === k) };
  };
  return { world, L, connect, later: (ms) => { t += ms; } };
}

test('Delete account: out at once, refused at the door with RESTORE, restored with everything; erased when the days are up', () => {
  const B = boot();
  const a = B.connect();
  const pid = a.welcome.pid, tok = a.welcome.token;
  a.p.profile.bank = 12345;
  assert.equal(a.last('acct').deleteDays, ACCOUNT.deleteDays, 'the panel is told how long it can be restored');
  a.say({ t: 'delacct' });
  assert.equal(a.conn.code, 4017, 'the session closes as deleted');
  assert.ok(a.conn.sent.some((m) => m.t === 'acctdeleted' && m.until > 0));
  assert.ok(!B.world.players.has(pid), 'out of the world at once');
  assert.ok(store.get(pid), 'kept for now');
  const again = B.connect(tok);
  assert.equal(again.welcome, undefined);
  assert.equal(again.conn.code, 4017);
  assert.match(again.last('kicked').reason, /RESTORE/);
  const back = B.connect(tok, { restore: true });
  assert.equal(back.welcome.pid, pid, 'RESTORE brings the same account back');
  assert.equal(back.p.profile.bank, 12345, 'with its progress');
  assert.ok(!store.get(pid).acct.deleted);
  // deleted again, and the days run out: erased
  back.say({ t: 'delacct' });
  const other = B.connect();
  other.p.profile.acct.chat = { off: {}, mutes: [], blocks: [], contacts: { [pid]: { n: 'x', at: 1, how: 'met' } }, inbox: [], strikes: [], muteUntil: 0, reportsIn: [] };
  B.later(ACCOUNT.deleteDays * 86400e3 - 60e3);
  assert.equal(B.L.purgeDeleted(), 0, 'not before its time');
  B.later(120e3);
  assert.equal(B.L.purgeDeleted(), 1);
  assert.ok(!store.get(pid), 'the profile is gone');
  assert.ok(!other.p.profile.acct.chat.contacts[pid], 'and out of other players\' contacts');
  const gone = B.connect(tok);
  assert.ok(gone.welcome && gone.welcome.pid === pid && gone.p.profile.bank !== 12345, 'its old token only makes a fresh profile');
  B.L.stop();
});

test('the owner\'s account can\'t be deleted; staff can undelete', () => {
  const B = boot();
  const o = B.connect();
  B.L.accounts.setRole(o.welcome.pid, 'owner');
  o.say({ t: 'delacct' });
  assert.ok(B.world.players.has(o.welcome.pid), 'the owner stays');
  assert.ok(!store.get(o.welcome.pid).acct.deleted);
  const v = B.connect();
  const vpid = v.welcome.pid;
  v.say({ t: 'delacct' });
  assert.ok(store.get(vpid).acct.deleted);
  o.s.onMessage(JSON.stringify({ t: 'admin', a: 'undelete', id: vpid, seq: 1 }), false);
  assert.ok(!store.get(vpid).acct.deleted, 'restored by staff');
  B.L.stop();
});
