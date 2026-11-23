// The line at the door (the owner, 11-17: "cap 100 per city" - later several cities, a line that's often long being the
// signal to open another). A city holds config.maxPlayers (CLA_MAX_PLAYERS) players at once; past it, a page that says
// hello waits in line instead of being turned away: "The city's full - you're #3 in line" on the title (client/main.js
// 'line'), the number kept up to date, a Cancel. First come, first served: when a place opens (someone leaves - pump(),
// run on every leaving and once a second by server/index.js) the first in line goes in, through the same hello as
// anyone (session.js).
//   who never waits: the staff (helper, admin, the owner: roles.js) - and a player who dropped out less than graceMs ago
//     (a phone's hiccup, a deploy's restart: the players online when the server stopped are written to the data dir and
//     read back at the start - save()/load());
//   the line itself has room for lineMax; past that a polite refusal ("try again in a few minutes": close 4018);
//   a page waiting costs a socket and a small message every few seconds - no character, no world, no snapshots.
// Its numbers (how many wait now, how long people waited) go to /stats and the console's Server tab (summary()).
import { readFileSync, writeFileSync } from 'node:fs';

export const LINE_FULL_CODE = 4018;
export const LINE_FULL_MSG = 'The city\'s full and so is the line - try again in a few minutes.';
const POS_EVERY_MS = 4000;   // the waiting page's position, at least this often (and at once when it moves)

// opts: max (the cap), lineMax, graceMs, online() -> players in the city now, peek(token) -> { pid, staff } | null,
//       now() (ms), file (the data dir's note of who was online at a stop: optional)
export function createLine({ max, lineMax = 200, graceMs = 120e3, online, peek = () => null, now = Date.now, file = null }) {
  const queue = [];                 // { conn, admit(), at, pid, sentPos, sentAt }
  const dropped = new Map();        // pid -> when they dropped out (the grace's clock)
  const stats = { admitted: 0, waitedMs: 0, maxWaitMs: 0, refused: 0, gave: 0, peak: 0 };

  const recent = (pid) => { const t = pid ? dropped.get(pid) : 0; return !!t && now() - t < graceMs; };
  function tell(e, force) {
    const pos = queue.indexOf(e) + 1;
    if (!pos || (!force && pos === e.sentPos && now() - e.sentAt < POS_EVERY_MS)) return;
    e.sentPos = pos; e.sentAt = now();
    try { e.conn.sendJSON({ t: 'line', pos, n: queue.length, max }); } catch { /* gone */ }
  }
  // A hello: 'in' (go ahead and join), 'queued' (waiting: admit() is called when its turn comes) or 'refused'
  function arrive(conn, token, admit) {
    const who = peek(token);
    const skip = !!who && (who.staff || recent(who.pid));
    if (skip || (online() < max && !queue.length)) { if (who) dropped.delete(who.pid); return 'in'; }
    if (queue.length >= lineMax) {
      stats.refused++;
      try { conn.sendJSON({ t: 'kicked', reason: LINE_FULL_MSG }); conn.close(LINE_FULL_CODE, 'full'); } catch { /* gone */ }
      return 'refused';
    }
    const e = { conn, admit, at: now(), pid: who ? who.pid : null, sentPos: 0, sentAt: 0 };
    queue.push(e);
    if (queue.length > stats.peak) stats.peak = queue.length;
    tell(e, true);
    return 'queued';
  }
  // the page left the line (Cancel, closed the tab): out of it
  function leave(conn) {
    const i = queue.findIndex((e) => e.conn === conn);
    if (i < 0) return false;
    queue.splice(i, 1);
    stats.gave++;
    for (const e of queue) tell(e, false);
    return true;
  }
  // a player left the city: their place held for graceMs; and the next in line may go in
  function left(pid) { if (pid) dropped.set(pid, now()); pump(); }
  // the first in line in while there's room; everyone's place told
  function pump() {
    let moved = false;
    while (queue.length && online() < max) {
      const e = queue.shift();
      if (!e.conn.open) continue;
      const waited = now() - e.at;
      stats.admitted++; stats.waitedMs += waited; if (waited > stats.maxWaitMs) stats.maxWaitMs = waited;
      moved = true;
      try { e.admit(); } catch (err) { console.error('[line] admit', err); }
    }
    for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].conn.open) { queue.splice(i, 1); stats.gave++; moved = true; }
    for (const e of queue) tell(e, moved);
    const t = now();
    if (dropped.size > 500) for (const [pid, at] of dropped) if (t - at >= graceMs) dropped.delete(pid);
  }
  // the server stopping: who's on now, so they're let straight back in after the restart
  function save(pids) {
    if (!file) return;
    try { writeFileSync(file, JSON.stringify({ at: now(), pids })); } catch (e) { console.error('[line] could not note who was on:', e.message); }
  }
  function load() {
    if (!file) return 0;
    try {
      const d = JSON.parse(readFileSync(file, 'utf8'));
      if (!d || !Array.isArray(d.pids) || now() - d.at > graceMs * 5) return 0;   // (a stop long ago: no places held)
      for (const pid of d.pids) if (typeof pid === 'string') dropped.set(pid, now());   // (held from the start, not the stop: the build takes minutes)
      return d.pids.length;
    } catch { return 0; }
  }
  function summary() {
    return { max, waiting: queue.length, peak: stats.peak, admitted: stats.admitted, avgWaitS: stats.admitted ? Math.round(stats.waitedMs / stats.admitted / 1000) : 0, maxWaitS: Math.round(stats.maxWaitMs / 1000), gaveUp: stats.gave, refused: stats.refused, held: [...dropped.values()].filter((t) => now() - t < graceMs).length };
  }
  return { arrive, leave, left, pump, save, load, summary, get length() { return queue.length; } };
}
