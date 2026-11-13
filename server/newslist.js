// The opt-in news list (the owner, 11-12): the addresses of the players who asked for game news by email - kept apart
// from the sign-ins (an account finds its email login only by a keyed hash; the address itself is here, and only
// here, and only when its player ticked the box). Each entry: { email, at (opted in), src ('signup' | 'settings'),
// pid (the account that asked), t (its unsubscribe token) }. Unsubscribing removes the entry: nothing is kept.
// Kept in <data>/news.json (written whole on each change, through a temporary file). The owner exports it as a CSV
// from the staff pages (server/adminhttp.js /admin/news) for Resend's broadcasts; every news email carries the
// address's unsubscribe link and the owner's postal address (newsFooter, CLA_MAIL_ADDRESS).
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { safeEqual } from './auth.js';

export function createNewsList({ file = null, now = Date.now, publicUrl = '', mailAddress = '', log = console } = {}) {
  let list = [];
  if (file && existsSync(file)) {
    try { const j = JSON.parse(readFileSync(file, 'utf8')); if (Array.isArray(j.list)) list = j.list.filter((e) => e && typeof e.email === 'string' && typeof e.t === 'string'); } catch (e) { log.error('[news] the list did not load:', e && e.message); }
  }
  function save() {
    if (!file) return;
    try { writeFileSync(file + '.tmp', JSON.stringify({ v: 1, list }), { mode: 0o600 }); renameSync(file + '.tmp', file); } catch (e) { log.error('[news] the list was not saved:', e && e.message); }
  }
  const byPid = (pid) => list.find((e) => e.pid === pid) || null;
  // opt in (an address already on the list: its account and source updated, its token kept)
  function optIn(email, src, pid) {
    let e = list.find((x) => x.email === email);
    const was = byPid(pid);
    if (was && was !== e) list.splice(list.indexOf(was), 1);   // (one address an account: a new one replaces it)
    if (!e) { e = { email, at: now(), src, pid, t: randomBytes(24).toString('base64url') }; list.push(e); }
    else { e.pid = pid; e.src = e.src || src; }
    save();
    return e;
  }
  function optOutPid(pid) { const e = byPid(pid); if (!e) return false; list.splice(list.indexOf(e), 1); save(); return true; }
  const byToken = (t) => (typeof t === 'string' && t.length >= 20 && t.length <= 64 ? list.find((e) => safeEqual(e.t, t)) || null : null);
  function unsubscribe(t) { const e = byToken(t); if (!e) return false; list.splice(list.indexOf(e), 1); save(); return true; }
  const unsubUrl = (e) => `${publicUrl}/auth/news/unsubscribe?t=${e.t}`;
  // what ends every news email: the way off the list and the sender's postal address
  const newsFooter = (e) => `You get this because you asked for City Life Auto news. Unsubscribe: ${unsubUrl(e)}\n${mailAddress || '[postal address: set CLA_MAIL_ADDRESS]'}`;
  // the export: one row an address (a spreadsheet's formula characters at the start of a cell are defused)
  const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function csv() {
    const rows = [['email', 'opted_in_utc', 'source', 'unsubscribe_url']];
    for (const e of list) rows.push([e.email, new Date(e.at).toISOString(), e.src, unsubUrl(e)]);
    return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  }
  // an address shown to its own player: the first letter and the domain
  const masked = (e) => (e ? e.email.replace(/^(.)[^@]*@/, '$1•••@') : '');
  return { optIn, optOutPid, unsubscribe, byPid, byToken, csv, newsFooter, unsubUrl, masked, get count() { return list.length; }, get list() { return list; } };
}
