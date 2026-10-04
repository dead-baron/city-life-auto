// Cost and abuse guards: the monthly outbound-data cap and per-IP connection limits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLimits, clientIp } from '../server/limits.js';

test('data cap: turns new players away near the cap, closes at it, reopens next month, survives restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cla-limits-'));
  let t = Date.UTC(2026, 9, 10);
  const mk = () => createLimits({ dataDir: dir, monthlyGB: 1, overhead: 1, now: () => t });
  let L = mk();
  assert.equal(L.state(), 'ok');
  assert.equal(L.checkUpgrade('1.1.1.1'), null);
  L.addBytes(0.96e9);
  assert.equal(L.state(), 'closing', 'past 95%: no new players');
  L.addBytes(0.05e9);
  assert.equal(L.state(), 'over');
  assert.equal(L.checkUpgrade('1.1.1.1'), 'quota', 'nobody gets in');
  assert.equal(L.checkHttp('1.1.1.1'), 'quota');
  L.save();
  L = mk(); // restart
  assert.equal(L.state(), 'over', 'the meter persists across restarts');
  t = Date.UTC(2026, 10, 1, 0, 0, 1); // 1st of next month
  assert.equal(L.state(), 'ok', 'reopens on the 1st');
  assert.equal(L.summary().month, '2026-11');
});

test('overhead is added to what the server counts', () => {
  const L = createLimits({ monthlyGB: 100, overhead: 1.12 });
  L.addBytes(1e9);
  assert.ok(Math.abs(L.used() - 1.12e9) < 1);
});

test('per-IP: limited simultaneous connections and connection rate; other addresses unaffected', () => {
  let t = 0;
  const L = createLimits({ monthlyGB: 100, maxPerIp: 3, connPerMinute: 5, httpPerMinute: 300, now: () => t });
  for (let i = 0; i < 3; i++) { assert.equal(L.checkUpgrade('9.9.9.9'), null); L.track('9.9.9.9'); }
  assert.equal(L.checkUpgrade('9.9.9.9'), 'per-ip', 'fourth at once is refused');
  assert.equal(L.checkUpgrade('8.8.8.8'), null, 'someone else is fine');
  L.untrack('9.9.9.9');
  assert.equal(L.checkUpgrade('9.9.9.9'), null, 'a slot freed up'); L.track('9.9.9.9');
  assert.equal(L.checkUpgrade('9.9.9.9'), 'rate', 'sixth try within a minute');
  t += 61000;
  assert.equal(L.checkUpgrade('9.9.9.9'), 'per-ip', 'rate window resets (still 3 open)');
  for (let i = 0; i < 400; i++) L.checkHttp('7.7.7.7');
  assert.equal(L.checkHttp('7.7.7.7'), 'rate', 'HTTP hammering is throttled');
});

test('everything is off unless configured - but the meter still counts', () => {
  const L = createLimits({});
  for (let i = 0; i < 50; i++) { assert.equal(L.checkUpgrade('5.5.5.5'), null); L.track('5.5.5.5'); }
  for (let i = 0; i < 1000; i++) assert.equal(L.checkHttp('5.5.5.5'), null);
  L.addBytes(50e12);
  assert.equal(L.state(), 'ok', 'no cap');
  assert.ok(L.summary().gbUsed > 49000 && L.summary().gbCap === 'off');
});

test('client IP: the proxy header is only trusted behind the local proxy', () => {
  const req = { headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientIp(req, true), '203.0.113.5');
  assert.equal(clientIp(req, false), '127.0.0.1', 'exposed directly, a spoofed header is ignored');
});
