// The owner's console's Status tab (server/adminconsole-page.js drawStatus; the owner, 11-23 07:09: "Can we make the status
// easier to read and more organized? It would be good to be able to see info more clearly and flag any issues the server
// may be having. Would be good to see if the art is being redrawn and how far that is into it.")
// health(facts) turns what the server knows about itself into one answer: a level (ok / warn / bad), the problems as plain
// lines (worst first), the art redraw's progress with a time left, and the cards' numbers. The thresholds are STATUS, named
// here so a test and a reader see the same ones. The facts come from server/index.js statusFacts(): the tick, the
// machine, the art and world builds (artcdn.js, worldcdn.js summary), the pages' error reports (perfreports.js), and two
// small files the deploy scripts leave in the data dir (deploy/auto-update.sh -> deploy-log.txt, deploy/backup.sh ->
// backup-last) - the system journal isn't readable from the game. Nothing here names a player, an address or an account.
import { readFileSync, statfsSync } from 'node:fs';
import { join } from 'node:path';

export const STATUS = {
  tickWarn: 0.5, tickBad: 0.8,      // the tick's average, as a share of its budget (TICK_MS)
  tickMaxWarn: 4,                   // the slowest tick lately, in budgets (a hitch players feel)
  memWarn: 0.88, memBad: 0.95,      // the machine's memory in use
  diskWarn: 0.15, diskBad: 0.05,    // the data disk's free share
  backupWarnH: 36,                  // the nightly backup's age
  pagesWaitWarnMin: 30,             // an update waiting on GitHub Pages
  rollbackH: 24,                    // a rolled-back update counts as news this long
  pageErrWarn: 25,                  // page errors reported in the last hour
  bakeErrWarn: 5,                   // art chunks that failed to bake
  stalledMin: 20,                   // an art redraw with nothing baked for this long, chunks still to do
};
export const DEPLOY_LOG = 'deploy-log.txt', BACKUP_LAST = 'backup-last', PAGES_WAIT = 'pages-wait';

// the deploy script's lines: "epoch<TAB>kind<TAB>text" (kinds: update, restart, rollback, down, wait, skip), newest first
export function readDeployLog(dir, n = 8) {
  try {
    return readFileSync(join(dir, DEPLOY_LOG), 'utf8').trim().split('\n').filter(Boolean).slice(-n).reverse().map((l) => {
      const [t, kind, ...rest] = l.split('\t');
      return { t: +t * 1000 || 0, kind: kind || '', text: rest.join(' ').slice(0, 200) };
    });
  } catch { return []; }
}
// the nightly backup: "epoch<TAB>size<TAB>kept"
export function readBackup(dir) {
  try { const [t, size, kept] = readFileSync(join(dir, BACKUP_LAST), 'utf8').trim().split('\t'); return +t ? { t: +t * 1000, size: size || '', kept: +kept || 0 } : null; } catch { return null; }
}
// an update waiting for GitHub Pages to publish: "commit since-epoch" (removed once it moves on)
export function readPagesWait(dir) {
  try { const [c, since] = readFileSync(join(dir, PAGES_WAIT), 'utf8').trim().split(' '); return +since ? { commit: String(c).slice(0, 7), since: +since * 1000 } : null; } catch { return null; }
}
export function readDisk(dir) {
  try { const s = statfsSync(dir); return { freeGB: +((s.bavail * s.bsize) / 1e9).toFixed(1), totalGB: +((s.blocks * s.bsize) / 1e9).toFixed(1), free: s.blocks ? s.bavail / s.blocks : 1 }; } catch { return null; }
}

const ago = (ms) => `${fmtDur(ms / 60000)} ago`;
const fmtDur = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.max(1, Math.round(min))} min`);

// the art redraw: on -> { state: 'baking' | 'done' | 'stalled', have, of, pct, leftMin, threads, ... }; no art builds here -> off
export function artProgress(a, now, lastBakeAt = 0) {
  if (!a || !a.art) return { state: 'off' };
  const of = a.of || 0, have = Math.min(a.have || 0, of), left = Math.max(0, of - have), threads = Math.max(0, a.threads || 0);
  const pct = of ? Math.floor((have / of) * 1000) / 10 : 100;
  const leftMin = left && threads && a.avgBakeMs ? (left * a.avgBakeMs) / threads / 60000 : null;
  const stalled = left > 0 && lastBakeAt > 0 && now - lastBakeAt > STATUS.stalledMin * 60000;
  return { state: !left ? 'done' : stalled ? 'stalled' : 'baking', art: String(a.art).slice(0, 12), have, of, pct, left, leftMin: leftMin == null ? null : Math.round(leftMin), leftText: leftMin == null ? '' : fmtDur(leftMin), threads, avgBakeMs: a.avgBakeMs || 0, baked: a.baked || 0, errors: a.errors || 0, carried: a.sameServed || 0 };
}

// facts -> { level, flags: [{ lvl, text }], art, tick, machine, disk, deploys, backup, pages, errors }
export function health(f) {
  const now = f.now || Date.now(), flags = [], add = (lvl, text) => flags.push({ lvl, text });
  const budget = f.tickBudgetMs || 50;
  // the game loop
  const tAvg = f.tickMsAvg || 0, tMax = f.tickMsMax || 0;
  if (tAvg >= budget * STATUS.tickBad) add('bad', `The game is running slow: a tick takes ${tAvg.toFixed(1)} ms on average (it has ${budget} ms) - players will feel lag.`);
  else if (tAvg >= budget * STATUS.tickWarn) add('warn', `The game loop is busy: ${tAvg.toFixed(1)} ms a tick on average, of ${budget} ms.`);
  if (tMax >= budget * STATUS.tickMaxWarn) add('warn', `A slow tick lately: ${Math.round(tMax)} ms (a hitch players may have felt).`);
  if (f.tickErrors) add(f.tickErrorsHour ? 'bad' : 'warn', `The game loop hit ${f.tickErrors} error${f.tickErrors === 1 ? '' : 's'} since the start${f.lastTickError ? ` - last: ${String(f.lastTickError).slice(0, 120)}` : ''}.`);
  // the machine
  const h = f.host || {}, memUsed = h.totalMB ? 1 - (h.freeMB || 0) / h.totalMB : 0;
  if (memUsed >= STATUS.memBad) add('bad', `The server's memory is almost full (${Math.round(memUsed * 100)}% in use).`);
  else if (memUsed >= STATUS.memWarn) add('warn', `The server's memory is getting full (${Math.round(memUsed * 100)}% in use).`);
  const d = f.disk;
  if (d && d.free <= STATUS.diskBad) add('bad', `The disk is almost full: ${d.freeGB} GB free of ${d.totalGB} GB.`);
  else if (d && d.free <= STATUS.diskWarn) add('warn', `The disk is getting full: ${d.freeGB} GB free of ${d.totalGB} GB.`);
  // updates
  const deploys = f.deploys || [], recent = deploys.filter((e) => now - e.t < STATUS.rollbackH * 3600000);
  const down = recent.find((e) => e.kind === 'down'), back = recent.find((e) => e.kind === 'rollback');
  if (down) add('bad', `After an update the server didn't come back by itself (${ago(now - down.t)}) - check it.`);
  else if (back) add('bad', `An update failed to start and was rolled back (${ago(now - back.t)}): ${back.text}`);
  const pw = f.pages;
  if (pw && now - pw.since >= STATUS.pagesWaitWarnMin * 60000) add('warn', `An update (${pw.commit}) has waited ${fmtDur((now - pw.since) / 60000)} for GitHub Pages to publish the page.`);
  // the backup
  const b = f.backup;
  if (!b) add('warn', 'No nightly backup has been recorded yet.');
  else if (now - b.t > STATUS.backupWarnH * 3600000) add('warn', `The last backup is ${fmtDur((now - b.t) / 60000)} old (it runs nightly at 03:30).`);
  // what players' pages report
  if ((f.pageErrHour || 0) >= STATUS.pageErrWarn) add('warn', `Players' pages reported ${f.pageErrHour} errors in the last hour (Server tab -> Page errors).`);
  // the art and the world
  const art = artProgress(f.art, now, f.lastBakeAt || 0);
  if (art.state === 'stalled') add('bad', `The art redraw has stopped: ${art.have.toLocaleString('en-US')} of ${art.of.toLocaleString('en-US')} chunks, nothing baked for ${STATUS.stalledMin}+ min.`);
  else if (art.state === 'baking') add('info', `Redrawing the art: ${art.pct}% (${art.have.toLocaleString('en-US')} of ${art.of.toLocaleString('en-US')} chunks)${art.leftText ? `, about ${art.leftText} left` : ''}. Players see the old art or a low-detail picture meanwhile.`);
  if (art.errors >= STATUS.bakeErrWarn) add('warn', `${art.errors} art chunks failed to bake.`);
  if (f.world && f.world.error) add('bad', `The world files failed to build: ${String(f.world.error).slice(0, 120)}`);
  else if (f.world && f.world.state && f.world.state !== 'ready') add('info', `The world files are being written (${f.world.state}).`);
  const order = { bad: 0, warn: 1, info: 2 };
  flags.sort((a, c) => order[a.lvl] - order[c.lvl]);
  const level = flags.some((q) => q.lvl === 'bad') ? 'bad' : flags.some((q) => q.lvl === 'warn') ? 'warn' : 'ok';
  return {
    level, flags, art,
    tick: { avg: +tAvg.toFixed(1), max: Math.round(tMax), budget, errors: f.tickErrors || 0 },
    machine: { cores: h.cores || 0, load: h.load || [], memPct: Math.round(memUsed * 100), freeMB: h.freeMB || 0, totalMB: h.totalMB || 0, rssMB: h.rssMB || 0 },
    disk: d, deploys, backup: b, pages: pw, pageErrHour: f.pageErrHour || 0, world: f.world ? { state: f.world.state, MB: f.world.MB } : null,
  };
}

// the pages' error reports seen in the last hour (perfreports.js keeps them folded: n times, t the last)
export function pageErrorsLastHour(list, now = Date.now()) {
  let n = 0;
  for (const c of list || []) if (now - Date.parse(c.t) < 3600000) n += c.n || 1;
  return n;
}
