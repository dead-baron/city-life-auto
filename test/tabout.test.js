// Tabbing out on a phone (the owner, 11-06: "I tabbed out of the game on my phone then tabbed back in and it will show a
// black screen and say reconnecting for a bit. It would be nice if it didn't disconnect so quickly"). The page says it's
// going into the background ({ t: 'away' }); the server lets its socket stay quiet longer (ws.js AWAY_QUIET_MS) and, if
// the socket drops all the same, keeps the body for at least AWAY_GRACE_S even with trouble after it (players.js
// unsafeGrace); back inside that, the same session and character - no new arrival, no "Reconnected" toast. The page
// reconnects at once on coming back into view and keeps the last frame up meanwhile (client/update.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, fakeConn, players, run } from './helpers.js';
import { GHOST_SECONDS } from '../shared/rules.js';
import { AWAY_GRACE_S } from '../server/systems/players.js';
import { onVisible, retryDelay, holdFrame } from '../client/update.js';
import { createSession } from '../server/session.js';

test('a backgrounded page dropped mid-trouble: the body waits AWAY_GRACE_S, and a return inside it is the same session', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  p.wanted = 2;   // (trouble after them: an ordinary drop gets the drop rule's GHOST_SECONDS)
  players.setAway(w, p, true);
  players.leave(w, p);
  assert.ok(AWAY_GRACE_S > GHOST_SECONDS);
  assert.ok(p.ghostUntil - w.time >= AWAY_GRACE_S - 0.01, 'the backgrounded grace, not the drop rule\'s 30 s');
  const ped = p.ped, x = ped.x, y = ped.y;
  run(w, 60);   // a minute on another app
  assert.ok(w.players.has(prof.pid), 'still in the world');
  const conn = fakeConn();
  assert.equal(players.join(w, conn, prof), p, 'the same session');
  assert.equal(p.ped, ped, 'the same body');
  assert.ok(Math.hypot(ped.x - x, ped.y - y) < 40, 'where they were');
  assert.equal(p.ghostUntil, 0); assert.equal(p.away, 0);
  assert.ok(!conn.sent.some((m) => m && m.t === 'toast' && /Reconnected/.test(m.text || '')), 'no "Reconnected" note for a tab-out');
});

test('an ordinary drop with trouble after you keeps the drop rule\'s GHOST_SECONDS', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  p.wanted = 2;
  players.leave(w, p);
  assert.ok(Math.abs(p.ghostUntil - w.time - GHOST_SECONDS) < 0.01);
});

test('the away message lets the socket stay quiet longer, and back lets it go', () => {
  const w = makeWorld();
  const conn = fakeConn();
  const r = joinPlayer(w);
  const s = createSession(w, conn, { dev: false, maxPlayers: 10, login: () => ({ profile: r.prof, token: 't' }) });
  s.onMessage(JSON.stringify({ t: 'hello', token: null }), false);
  s.onMessage(JSON.stringify({ t: 'away', on: true }), false);
  assert.ok(conn.quietMs >= 90000, 'a backgrounded page may miss pongs for longer (ws.js)');
  assert.ok(r.p.away > 0);
  s.onMessage(JSON.stringify({ t: 'away', on: false }), false);
  assert.ok(!conn.quietMs, 'back: the usual keepalive');
  assert.equal(r.p.away, 0);
});

test('the page on coming back into view: reconnects at once, probes an open socket, keeps the frame up', () => {
  assert.equal(onVisible({ everConnected: true, ws: null, connectFailed: true }), 'connect');
  assert.equal(onVisible({ everConnected: true, ws: { readyState: 1 } }), 'probe');
  assert.equal(onVisible({ everConnected: true, ws: { readyState: 0 } }), 'none', 'one on its way');
  assert.equal(onVisible({ everConnected: false, ws: null, connectFailed: true }), 'none', 'never in the game');
  assert.equal(onVisible({ practice: true, everConnected: true, ws: null, connectFailed: true }), 'none');
  assert.equal(retryDelay(8000, false, 300), 0, 'just back in view: no backoff wait');
  assert.equal(retryDelay(8000, false, 60000), 8000);
  assert.ok(retryDelay(1000, true, 0) >= 5000, 'in the background: slower');
  assert.equal(holdFrame({ playing: true, map: {}, everConnected: true, welcomed: false }), true, 'the last frame stays up');
  assert.equal(holdFrame({ playing: false, map: {}, everConnected: true, welcomed: false }), false, 'the title: cleared');
});
