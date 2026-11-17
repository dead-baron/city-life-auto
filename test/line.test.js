// The line at the door (the owner, 11-17: cap 100 a city): past CLA_MAX_PLAYERS a newcomer waits in line - told their
// place, let in first come first served when someone leaves; staff and a player back within the grace skip it; the line
// itself has room for so many (server/line.js, session.js, client/main.js inLine).
import { makeWorld, fakeConn, store } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../server/config.js';
import { createLaunch } from '../server/launch.js';
import { createSession } from '../server/session.js';
import { createLine, LINE_FULL_CODE } from '../server/line.js';

const quiet = { log() {}, warn() {}, error() {}, info() {} };
function boot({ max = 2, lineMax = 3, file = null } = {}) {
  const world = makeWorld();
  let t = Date.now();
  const now = () => t;
  const cfg = { ...config, launch: { ...config.launch, devOpen: true, gaMeasurementId: '', gaApiSecret: '', requireAge: false } };
  const L = createLaunch({ config: cfg, store, world, ip: () => '1.2.3.4', dataDir: null, log: quiet, now });
  const online = () => [...world.players.values()].filter((p) => p.conn).length;
  const line = createLine({ max, lineMax, online, peek: (tk) => L.peek(tk), now, file });
  const connect = (token = null) => {
    const conn = fakeConn();
    conn.close = function (code) { this.open = false; this.code = code; };
    const s = createSession(world, conn, { seed: 1337, dev: false, maxPlayers: max, label: 'test', login: (tk, h) => L.login(tk, h, '1.2.3.4'), hooks: L.hooks, line });
    s.onMessage(JSON.stringify({ t: 'hello', token, dm: 'cd'.repeat(16) }), false);
    const c = { conn, s, welcome: () => conn.sent.find((m) => m.t === 'welcome'), last: (k) => [...conn.sent].reverse().find((m) => m.t === k), drop() { conn.open = false; s.onClose(); } };
    return c;
  };
  return { world, L, line, connect, later: (ms) => { t += ms; } };
}

test('a full city: the newcomer waits in line, told their place; a leaving lets the first in, the rest move up', () => {
  const B = boot({ max: 2 });
  const a = B.connect(), b = B.connect();
  assert.ok(a.welcome() && b.welcome(), 'two in');
  const c = B.connect(), d = B.connect();
  assert.equal(c.welcome(), undefined, 'the third waits');
  assert.deepEqual(c.last('line'), { t: 'line', pos: 1, n: 1, max: 2 });
  assert.equal(d.last('line').pos, 2);
  assert.ok(c.conn.open && d.conn.open, 'waiting, not turned away');
  assert.equal(B.line.summary().waiting, 2);
  // nothing goes to a page in line but its place: no snapshots, no character
  assert.equal(B.world.players.size, 2);
  a.drop();
  assert.ok(c.welcome(), 'the first in line goes in when a place opens');
  assert.equal(d.welcome(), undefined);
  assert.equal(d.last('line').pos, 1, 'the next moves up');
  B.later(30e3);
  b.drop();
  assert.ok(d.welcome());
  const S = B.line.summary();
  assert.equal(S.waiting, 0);
  assert.equal(S.admitted, 2);
  assert.equal(S.maxWaitS, 30);
});

test('Cancel (the page closes): out of the line; the others move up', () => {
  const B = boot({ max: 1 });
  B.connect();
  const c = B.connect(), d = B.connect();
  assert.equal(d.last('line').pos, 2);
  c.drop();
  assert.equal(d.last('line').pos, 1);
  assert.equal(B.line.summary().gaveUp, 1);
});

test('staff never wait; a player back within the grace gets their place back; after it, the line', () => {
  const B = boot({ max: 1 });
  // a helper's account (made while there was room, then gone longer than the grace)
  const h = B.connect();
  const ht = h.welcome().token;
  B.L.accounts.setRole(h.welcome().pid, 'helper');
  h.drop();
  B.later(3 * 60e3);
  const a = B.connect();
  const tok = a.welcome().token, pid = a.welcome().pid;
  const q = B.connect();
  assert.equal(q.welcome(), undefined, 'full: a newcomer waits');
  const h2 = B.connect(ht);
  assert.ok(h2.welcome(), 'staff skip the line');
  h2.drop();
  assert.equal(q.welcome(), undefined, 'the staff\'s place was over the cap: nobody let in');
  // a dropped connection: back within the grace, in at once (past the one waiting)
  a.drop();
  assert.ok(q.welcome(), 'the dropped place went to the line');
  const back = B.connect(tok);
  assert.ok(back.welcome(), 'back within the grace: in');
  assert.equal(back.welcome().pid, pid);
  // gone longer than the grace: the line like anyone
  back.drop(); q.drop();
  B.later(3 * 60e3);
  const w = B.connect();   // (someone took the place meanwhile)
  assert.ok(w.welcome());
  const late = B.connect(tok);
  assert.equal(late.welcome(), undefined);
  assert.equal(late.last('line').pos, 1);
});

test('the line has room for so many; past it a polite refusal the page doesn\'t retry', () => {
  const B = boot({ max: 1, lineMax: 2 });
  B.connect();
  B.connect(); B.connect();
  const x = B.connect();
  assert.equal(x.conn.code, LINE_FULL_CODE);
  assert.match(x.last('kicked').reason, /try again in a few minutes/);
  assert.equal(B.line.summary().refused, 1);
  const main = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.match(main, /const REFUSED = new Set\(\[[^\]]*\b4018\b/, 'the page stops on it and says why');
  assert.match(main, /case 'line': inLine\(m\)/, 'and shows its place in the line');
});

test('a restart: the players on at the stop are let straight back in', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'cla-line-')), 'line-held.json');
  let t = 1e12, n = 0;
  const L1 = createLine({ max: 1, online: () => n, peek: (tk) => ({ pid: tk, staff: false }), now: () => t, file });
  L1.save(['p1', 'p2']);
  t += 150e3;   // (the build takes minutes)
  const L2 = createLine({ max: 1, online: () => n, peek: (tk) => ({ pid: tk, staff: false }), now: () => t, file });
  assert.equal(L2.load(), 2);
  n = 5;
  const conn = { open: true, sendJSON() {}, close() {} };
  assert.equal(L2.arrive(conn, 'p1', () => {}), 'in');
  assert.equal(L2.arrive(conn, 'p9', () => {}), 'queued');
});
