// Idle kick (decided 10-06 / 10-08: "'Still there?' then a disconnect - 10 min for everyone"): server/systems/players.js
// idleCheck asks a player who's done nothing for 9 minutes if they're still there, and disconnects them at 10 (close
// 4006: the page shows why and a button to come back - client/main.js idleOut). Real time, not the game's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer } from './helpers.js';
import * as players from '../server/systems/players.js';

const step = (w, n = 25) => { for (let i = 0; i < n; i++) w.step(); };

test('idle: asked at nine minutes, disconnected at ten; anything done starts the clock again', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  step(w);
  assert.ok(p.conn.open, 'just joined: here');
  // nine and a half minutes of nothing: are you still there?
  p.activeAtMs = Date.now() - 9.5 * 60e3;
  const toasts = [], notify = w.notify.bind(w);
  w.notify = (q, text, tone) => { if (q === p) toasts.push(text); return notify(q, text, tone); };
  step(w);
  assert.ok(p.conn.open && toasts.some((t) => /Still there\?/.test(t)), 'asked if still there');
  // a key pressed: the clock starts again
  players.queueInput(p, { seq: p.ack + 5, bits: 1, mx: 0, my: 0, aim: 0 });
  assert.ok(Date.now() - p.activeAtMs < 1000 && !p.idleWarned, 'pressing something counts');
  // the same input over and over isn't anyone there
  const at = p.activeAtMs - 1;
  p.activeAtMs = at;
  players.queueInput(p, { seq: p.ack + 6, bits: 1, mx: 0, my: 0, aim: 0 });
  assert.equal(p.activeAtMs, at, 'the same keys held, unchanged: no');
  // ten and a half minutes: gone
  p.activeAtMs = Date.now() - 10.5 * 60e3;
  step(w);
  assert.ok(!p.conn.open, 'disconnected');
  assert.ok(p.conn.sent.some((m) => m && m.t === 'kicked' && m.idle), 'told why');
});

test('idle: a clock jumped on in the game (a test, a skip) isn\'t idling', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  step(w);
  w.time += 3600;
  step(w);
  assert.ok(p.conn.open, 'still connected');
});
