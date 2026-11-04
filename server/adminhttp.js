// The owner's protected pages: the admin log (/admin/log), the analytics dashboard (/admin/dashboard) and the review
// list (/admin/reviews). Plain HTML and tables, no scripts, no libraries. The way in: the game hands a signed-in owner
// (or an admin, for the reviews) a one-time link (server/admin.js pagelink: a code good once for a minute); it sets an
// HttpOnly, SameSite=Strict session cookie for an hour. The role is checked again on every request.
import { randomBytes } from 'node:crypto';
import { allowed } from './roles.js';
import { sendHTML, redirect, cookies, setCookie, esc, createRateLimiter } from './httputil.js';
import { FTUE_STEPS } from './analytics.js';

const LINK_TTL_MS = 60e3, SESSION_TTL_MS = 3600e3;

export function createAdminHttp({ accounts, log, mod, analytics, publicUrl, ip, now = Date.now, stats = null }) {
  const links = new Map(), sessions = new Map();
  const rl = createRateLimiter(now);
  const secure = publicUrl.startsWith('https://');
  const sweep = () => { const t = now(); for (const M of [links, sessions]) for (const [k, v] of M) if (v.exp <= t) M.delete(k); };
  function pageLink(pid, page) {
    sweep();
    const c = randomBytes(24).toString('base64url');
    links.set(c, { pid, page, exp: now() + LINK_TTL_MS });
    return `${publicUrl}/admin/enter?c=${c}`;
  }
  function who(req) {
    sweep();
    const s = sessions.get(cookies(req).cla_admin || '');
    if (!s) return null;
    if (accounts.banned(s.pid)) return null;
    return { pid: s.pid, role: accounts.role(s.pid), name: (accounts.profileOf(s.pid) || {}).name || '?' };
  }

  const shell = (title, body, w) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)} - City Life Auto</title>
<style>body{font:14px/1.4 system-ui,sans-serif;background:#14161a;color:#e8e8e8;margin:16px}a{color:#8cc8ff}table{border-collapse:collapse;margin:8px 0 20px;font-size:13px}td,th{border:1px solid #333;padding:3px 7px;text-align:left;vertical-align:top}th{background:#22252b}h1{font-size:20px}h2{font-size:16px;margin-top:24px}.n{text-align:right;font-variant-numeric:tabular-nums}.bad{color:#ff8a80}.ok{color:#9be29b}nav a{margin-right:14px}.bar{display:inline-block;height:9px;background:#5b9bd5;vertical-align:middle}</style>
<nav>${allowed(w.role, 'dashboard') ? '<a href="/admin/dashboard">Dashboard</a>' : ''}${allowed(w.role, 'adminlog') ? '<a href="/admin/log">Admin log</a>' : ''}<a href="/admin/reviews">Review list</a> · signed in as ${esc(w.name)} (${esc(w.role)})</nav><h1>${esc(title)}</h1>${body}`;
  const table = (head, rows) => `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => (typeof c === 'number' ? `<td class="n">${c.toLocaleString('en-US')}</td>` : `<td>${c}</td>`)).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}">nothing yet</td></tr>`}</table>`;
  const when = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '');
  const j = (v) => (v === undefined ? '' : esc(typeof v === 'string' ? v : JSON.stringify(v)));
  const sumObj = (days, f) => { const o = {}; for (const d of days) for (const [k, v] of Object.entries(d[f] || {})) o[k] = (o[k] || 0) + v; return o; };
  const top = (o, n = 25) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const bars = (o, n = 25, money = false) => { const l = top(o, n), max = l.length ? l[0][1] : 1; return table(['', money ? 'dollars' : 'count', ''], l.map(([k, v]) => [esc(k), Math.round(v), `<span class="bar" style="width:${Math.max(1, Math.round((v / max) * 240))}px"></span>`])); };

  function logPage(req, url) {
    const q = url.searchParams.get('q') || null;
    const list = log.tail(300, q);
    const v = log.verify();
    return `<p>${v.ok ? `<span class="ok">The chain checks out: ${v.n} entries, none changed or taken out.</span>` : `<span class="bad">The chain is broken at entry ${v.brokenAt + 1} - the file was edited by hand.</span>`} Newest first, the last 300${q ? `, for ${esc(q)}` : ''}. Filter: add ?q=&lt;account id or action&gt;.</p>`
      + table(['when (UTC)', 'who', 'role', 'what', 'target', 'before', 'after', 'note', 'ok'], list.map((e) => [when(e.at), e.who ? `${esc(e.who.n)}<br><small>${esc(e.who.id)}</small>` : '', esc(e.who && e.who.role), esc(e.what), e.target ? `${esc(e.target.n || '')}<br><small>${esc(e.target.id || '')}</small>` : '', j(e.before), j(e.after), esc(e.note || ''), e.ok ? '<span class="ok">yes</span>' : '<span class="bad">refused</span>']));
  }
  function reviewsPage() {
    const list = mod.reviews().slice(0, 200);
    return '<p>Reports, filter hits, movement and economy flags, floods - newest first. Resolve them from the game (admin tools).</p>'
      + table(['when (UTC)', 'kind', 'player', 'by', 'note', 'times', 'data', 'resolved'], list.map((r) => [when(r.at), esc(r.kind), r.who ? `${esc(r.who.n)}<br><small>${esc(r.who.id)}</small>` : '', r.by ? esc(r.by.n) : '', esc(r.note), r.n || 1, j(r.data), r.done ? `${when(r.done.at)} ${esc(r.done.by && r.done.by.n)}: ${esc(r.done.note)}` : `<small>${esc(r.id)}</small>`]));
  }
  function dashboardPage() {
    const S = analytics.data, keys = Object.keys(S.days).sort().reverse();
    const days = keys.map((k) => S.days[k]), last7 = days.slice(0, 7), last30 = days.slice(0, 30);
    const st = stats ? stats() : null;
    let out = st ? `<p>Online now: <b>${st.online}</b> · accounts: ${st.profiles} · tick ${st.tickMsAvg} ms · GA: ${st.ga ? (st.ga.enabled ? `on (${st.ga.sent} sent, ${st.ga.queued} queued, ${st.ga.failed} failed)` : 'off') : 'off'}</p>` : '';
    out += '<h2>Days</h2>' + table(['day', 'players', 'new', 'returning', 'sessions', 'avg session (min)', 'peak online', 'sign-ups', 'earned $', 'spent $', 'deaths', 'client errors'], keys.slice(0, 30).map((k) => {
      const d = S.days[k], sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
      return [k, d.uniq, d.newAcc, d.returning, d.sessions, d.sessions ? +(d.sessionMs / d.sessions / 60000).toFixed(1) : 0, d.peak, sum(d.signups), Math.round(sum(d.earn)), Math.round(sum(d.spend)), sum(d.deaths), sum(d.errors)];
    }));
    // concurrency: the last 24 hours, hourly peaks
    const hours = new Map();
    for (const [t, n] of S.conc) if (now() - t < 86400e3) { const h = new Date(t).toISOString().slice(0, 13); hours.set(h, Math.max(hours.get(h) || 0, n)); }
    out += '<h2>Concurrent players, the last 24 hours (hourly peak)</h2>' + bars(Object.fromEntries([...hours].map(([h, n]) => [h.replace('T', ' ') + ':00', n])), 24);
    const ck = Object.keys(S.cohorts).map(Number).sort((a, b) => b - a).slice(0, 30);
    out += '<h2>Retention by cohort (accounts first seen that day)</h2>' + table(['first day', 'accounts', 'day 1', 'day 7', 'any day in week 1'], ck.map((c) => { const o = S.cohorts[c], pct = (x) => (o.n ? `${x} (${Math.round((x / o.n) * 100)}%)` : '0'); return [new Date(c * 86400e3).toISOString().slice(0, 10), o.n, pct(o.d1), pct(o.d7), pct(o.w1)]; }));
    const f = sumObj(last30, 'ftue');
    out += '<h2>First-time funnel (last 30 days, accounts reaching each step)</h2>' + table(['step', 'accounts'], FTUE_STEPS.map((s) => [esc(s), f[s] || 0]));
    out += '<h2>Activity: what players do (last 7 days, player-minutes)</h2>' + bars(sumObj(last7, 'mins'));
    out += '<h2>Activity mix: jobs, crimes, leisure, chat, purchases started (last 7 days)</h2>' + bars(sumObj(last7, 'act'), 40);
    out += '<h2>Jobs done (last 7 days)</h2>' + bars(sumObj(last7, 'jobs'));
    out += '<h2>Money sources (last 7 days)</h2>' + bars(sumObj(last7, 'earn'), 30, true);
    out += '<h2>Money sinks (last 7 days)</h2>' + bars(sumObj(last7, 'spend'), 30, true);
    out += `<p>Earnings norm: $${Math.round(analytics.norm()).toLocaleString('en-US')} an hour played (today and yesterday, debug money left out).</p>`;
    out += '<h2>Deaths by cause (last 7 days)</h2>' + bars(sumObj(last7, 'deaths'));
    out += '<h2>Sign-ups and logins by method (last 30 days)</h2>' + table(['method', 'sign-ups', 'logins'], [...new Set([...Object.keys(sumObj(last30, 'signups')), ...Object.keys(sumObj(last30, 'logins'))])].map((m) => [esc(m), sumObj(last30, 'signups')[m] || 0, sumObj(last30, 'logins')[m] || 0]));
    out += '<h2>Devices (last 30 days, page loads)</h2>' + bars(sumObj(last30, 'dev')) + bars(sumObj(last30, 'preset'));
    out += '<h2>Frame rate and load time (last 30 days)</h2>' + bars(sumObj(last30, 'fps')) + bars(sumObj(last30, 'load'));
    out += '<h2>Client errors by where (last 7 days)</h2>' + bars(sumObj(last7, 'errors'));
    out += '<h2>Anti-cheat flags (last 7 days)</h2>' + bars(sumObj(last7, 'flags'));
    return out;
  }

  function handle(req, res, url) {
    const path = url.pathname;
    if (!path.startsWith('/admin/')) return false;
    if (!rl.hit(`admin:${ip(req)}`, 120, 60e3)) { sendHTML(res, 429, 'Too many requests.'); return true; }
    if (path === '/admin/enter') {
      sweep();
      const c = url.searchParams.get('c') || '', l = links.get(c);
      if (!l) { sendHTML(res, 410, 'This link has expired or was used - open it again from the game.'); return true; }
      links.delete(c);
      const sid = randomBytes(32).toString('base64url');
      sessions.set(sid, { pid: l.pid, exp: now() + SESSION_TTL_MS });
      redirect(res, `/admin/${l.page}`, { 'set-cookie': setCookie('cla_admin', sid, { maxAge: SESSION_TTL_MS / 1000, path: '/admin', sameSite: 'Strict', secure }) });
      return true;
    }
    const w = who(req);
    if (!w) { sendHTML(res, 401, 'Signed out - open this page from the game (Settings -> Account -> staff tools).'); return true; }
    const page = path.slice(7);
    const need = page === 'log' ? 'adminlog' : page === 'dashboard' ? 'dashboard' : page === 'reviews' ? 'reviews' : null;
    if (!need) { sendHTML(res, 404, 'No such page.'); return true; }
    if (!allowed(w.role, need)) { sendHTML(res, 403, 'Not for your role.'); return true; }
    const body = page === 'log' ? logPage(req, url) : page === 'dashboard' ? dashboardPage() : reviewsPage();
    sendHTML(res, 200, shell(page === 'log' ? 'Admin log' : page === 'dashboard' ? 'Analytics' : 'Review list', body, w));
    return true;
  }
  return { handle, pageLink };
}
