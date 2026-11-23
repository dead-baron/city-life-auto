// The console's Status tab (server/status.js; the owner, 11-23: "flag any issues the server may be having ... see if the
// art is being redrawn and how far that is into it"): the facts turned into one level, plain lines worst first, the art
// redraw's progress with a time left; the deploy scripts' records read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { health, artProgress, readDeployLog, readBackup, readPagesWait, readDisk, pageErrorsLastHour, STATUS } from '../server/status.js';

const NOW = Date.UTC(2026, 10, 23, 15, 0, 0);
const calm = (over = {}) => ({
  now: NOW, tickBudgetMs: 50, tickMsAvg: 8, tickMsMax: 40, host: { cores: 4, load: [1, 1, 1], freeMB: 12000, totalMB: 24000, rssMB: 2500 },
  disk: { freeGB: 120, totalGB: 200, free: 0.6 }, art: { art: 'abc123', have: 1000, of: 1000, threads: 3, avgBakeMs: 2400 },
  deploys: [{ t: NOW - 3600000, kind: 'restart', text: 'a -> b, server restarted OK' }], backup: { t: NOW - 10 * 3600000, size: '40M', kept: 7 }, pageErrHour: 0, ...over,
});

test('a calm server: all good, the art up to date', () => {
  const h = health(calm());
  assert.equal(h.level, 'ok');
  assert.deepEqual(h.flags, []);
  assert.equal(h.art.state, 'done');
});

test('the art redrawn: its progress and the time left, said but not a problem', () => {
  const h = health(calm({ art: { art: 'def456', have: 2500, of: 10000, threads: 3, avgBakeMs: 2400 }, lastBakeAt: NOW - 1000 }));
  assert.equal(h.level, 'ok', 'a redraw on its own is news, not trouble');
  assert.equal(h.art.state, 'baking');
  assert.equal(h.art.pct, 25);
  assert.equal(h.art.leftMin, Math.round((7500 * 2400) / 3 / 60000));   // 100 min
  assert.equal(h.art.leftText, '1 h 40 min');
  assert.match(h.flags[0].text, /Redrawing the art: 25% \(2,500 of 10,000 chunks\), about 1 h 40 min left/);
  const stuck = health(calm({ art: { art: 'def456', have: 2500, of: 10000, threads: 3, avgBakeMs: 2400 }, lastBakeAt: NOW - (STATUS.stalledMin + 1) * 60000 }));
  assert.equal(stuck.level, 'bad');
  assert.match(stuck.flags[0].text, /stopped/);
  assert.equal(artProgress(null, NOW).state, 'off');
});

test('trouble is flagged in plain words, worst first', () => {
  const h = health(calm({ tickMsAvg: 45, host: { cores: 4, load: [9, 9, 9], freeMB: 900, totalMB: 24000, rssMB: 9000 }, disk: { freeGB: 8, totalGB: 200, free: 0.04 },
    deploys: [{ t: NOW - 600000, kind: 'rollback', text: 'abc did not start - rolled back to def' }], backup: { t: NOW - 50 * 3600000, size: '40M' }, pageErrHour: 30,
    art: { art: 'x', have: 5, of: 10, threads: 2, avgBakeMs: 1000 }, lastBakeAt: NOW }));
  assert.equal(h.level, 'bad');
  const lv = h.flags.map((f) => f.lvl);
  assert.deepEqual([...lv].sort((a, b) => ['bad', 'warn', 'info'].indexOf(a) - ['bad', 'warn', 'info'].indexOf(b)), lv, 'worst first');
  const all = h.flags.map((f) => f.text).join('\n');
  for (const re of [/running slow/, /memory is almost full/, /disk is almost full/, /rolled back \(10 min ago\)/, /last backup is 50 h 00 min old/, /30 errors in the last hour/]) assert.match(all, re);
  assert.ok(!/\d{1,2}:\d{2} (AM|PM)/.test(all), 'no clock times (the server keeps UTC; the owner reads "x ago")');
  assert.equal(health(calm({ backup: null })).level, 'warn', 'no backup recorded: worth a look');
});

test('the deploy scripts\' records read back; a missing file is no error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cla-status-'));
  assert.deepEqual(readDeployLog(dir), []);
  assert.equal(readBackup(dir), null);
  assert.equal(readPagesWait(dir), null);
  writeFileSync(join(dir, 'deploy-log.txt'), `${NOW / 1000 - 60}\trestart\taaaaaaa -> bbbbbbb, server restarted OK\n${NOW / 1000}\tupdate\tbbbbbbb -> ccccccc (no server code changed, no restart)\n`);
  const d = readDeployLog(dir);
  assert.equal(d[0].kind, 'update', 'newest first');
  assert.equal(d[1].t, NOW - 60000);
  writeFileSync(join(dir, 'backup-last'), `${NOW / 1000}\t41M\t7\n`);
  assert.deepEqual(readBackup(dir), { t: NOW, size: '41M', kept: 7 });
  writeFileSync(join(dir, 'pages-wait'), `0123456789abcdef ${NOW / 1000}\n`);
  assert.deepEqual(readPagesWait(dir), { commit: '0123456', since: NOW });
  const disk = readDisk(dir);
  assert.ok(disk && disk.totalGB > 0 && disk.free > 0 && disk.free <= 1);
});

test('page errors in the last hour, from the folded reports', () => {
  const list = [{ t: new Date(NOW - 60000).toISOString(), n: 4 }, { t: new Date(NOW - 2 * 3600000).toISOString(), n: 9 }, { t: new Date(NOW - 1000).toISOString() }];
  assert.equal(pageErrorsLastHour(list, NOW), 5);
});
