// The page's error reporter (main.js reportError hands errors here once it's loaded): each different error once a
// page, at most MAX, to the server ({ t: 'cerr' }: server/perfreports.js lists them at /clienterrors, the analytics
// count them by where) - queued while there's no connection and sent when there is - and counted (where only) to
// Google Analytics when the player accepted it (client/analytics.js).
const MAX = 40;
const seen = new Set(), queue = [];
let ctx = null;

// c: { send(obj) -> bool (false when not connected), build() -> string, note() -> string, analytics? }
export function init(c) { ctx = c; flush(); }
export function report(where, e) {
  const msg = String((e && e.message) || e || 'unknown').slice(0, 300), key = where + '|' + msg;
  if (seen.has(key) || seen.size >= MAX) return false;
  seen.add(key);
  const m = { t: 'cerr', where: String(where).slice(0, 20), msg, stack: String((e && e.stack) || '').slice(0, 1500), build: ctx ? ctx.build() : '', ua: navigator.userAgent.slice(0, 160), ctx: ctx ? safe(ctx.note) : '' };
  queue.push(m);
  if (queue.length > 10) queue.shift();
  if (ctx && ctx.analytics) ctx.analytics.error(where);
  flush();
  return true;
}
function safe(f) { try { return String(f() || '').slice(0, 200); } catch { return ''; } }
export function flush() {
  if (!ctx) return;
  while (queue.length) { if (ctx.send(queue[0]) === false) return; queue.shift(); }
}
