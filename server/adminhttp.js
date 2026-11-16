// The owner's protected pages: the admin log (/admin/log), the analytics dashboard (/admin/dashboard), the review
// list (/admin/reviews), the players' bug reports (/admin/bugs, admins and up: server/bugreports.js - each with its
// screenshot, marked done or open again with a POST like the players' actions), the players (/admin/players: server/staffplayers.js) and the news list (/admin/news, owner
// only: its count and the opted-in addresses as a CSV, /admin/news.csv - every download in the admin log). Plain HTML and tables, no scripts, no
// libraries. The way in: the game hands a signed-in owner
// (or an admin, for the reviews) a one-time link (server/admin.js pagelink: a code good once for a minute); it sets an
// HttpOnly, SameSite=Strict session cookie for an hour. The role is checked again on every request.
// The one page that changes anything (the players' actions) takes a POST carrying the session's own token (csrf, in
// each form) on top of the Strict cookie, and hands the command to the staff commands themselves (act: server/admin.js
// handle - the same powers, the same admin log).
import { randomBytes } from 'node:crypto';
import { allowed } from './roles.js';
import { sendHTML, cookies, setCookie, esc, createRateLimiter, readForm } from './httputil.js';
import { safeEqual } from './auth.js';
import { FTUE_STEPS } from './analytics.js';
import { createStaffPlayers, ACTIONS } from './staffplayers.js';
import { consolePage, consoleScript, CONSOLE_CSP } from './adminconsole.js';
import { WINDOWS } from './analytics.js';
import { names as COUNTRY_NAMES } from './geo.js';
import { randomBytes as rb } from 'node:crypto';

const LINK_TTL_MS = 60e3, SESSION_TTL_MS = 3600e3;

// texts: { perf() -> string, errors() -> string } - the devices' reports and the pages' errors (server/perfreports.js),
// read at /admin/perf and /admin/clienterrors by admins and the owner (the owner's call, 11-04: not public any more)
// world, store, act(actor, msg) -> the staff command's reply, said(p) -> their recent chat lines: the players page (none: off)
export function createAdminHttp({ bugs = null, accounts, log, mod, analytics, news = null, mailAddress = '', publicUrl, ip, now = Date.now, stats = null, texts = null, world = null, store = null, act = null, said = null, geo = null }) {
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
    return { pid: s.pid, role: accounts.role(s.pid), name: (accounts.profileOf(s.pid) || {}).name || '?', s };
  }

  const shell = (title, body, w, head = '') => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">${head}<title>${esc(title)} - City Life Auto</title>
<style>body{font:14px/1.4 system-ui,sans-serif;background:#14161a;color:#e8e8e8;margin:16px}a{color:#8cc8ff}table{border-collapse:collapse;margin:8px 0 20px;font-size:13px}td,th{border:1px solid #333;padding:3px 7px;text-align:left;vertical-align:top}th{background:#22252b}h1{font-size:20px}h2{font-size:16px;margin-top:24px}.n{text-align:right;font-variant-numeric:tabular-nums}.bad{color:#ff8a80}.ok{color:#9be29b}nav a{margin-right:14px}.bar{display:inline-block;height:9px;background:#5b9bd5;vertical-align:middle}.wide{overflow-x:auto}form.act{display:inline-block;margin:0 10px 10px 0;padding:6px 8px;border:1px solid #333;background:#1b1e23}form.act input,form.act select{background:#22252b;color:#e8e8e8;border:1px solid #444;padding:3px 5px;margin-right:6px}button{background:#2d4f73;color:#fff;border:0;padding:5px 11px;cursor:pointer;font:inherit}button.danger{background:#8a2b2b}</style>
<nav>${allowed(w.role, 'console') ? '<a href="/admin/"><b>Console</b></a>' : ''}${allowed(w.role, 'players') ? '<a href="/admin/players">Players</a>' : ''}${allowed(w.role, 'dashboard') ? '<a href="/admin/dashboard">Dashboard</a>' : ''}${allowed(w.role, 'adminlog') ? '<a href="/admin/log">Admin log</a>' : ''}${news && allowed(w.role, 'news') ? '<a href="/admin/news">News list</a>' : ''}${allowed(w.role, 'reviews') ? '<a href="/admin/reviews">Review list</a>' + (bugs ? '<a href="/admin/bugs">Bug reports</a>' : '') + '<a href="/admin/perf">Devices</a><a href="/admin/clienterrors">Page errors</a>' : ''} · signed in as ${esc(w.name)} (${esc(w.role)})</nav><h1>${esc(title)}</h1>${body}`;
  const table = (head, rows) => `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => (typeof c === 'number' ? `<td class="n">${c.toLocaleString('en-US')}</td>` : `<td>${c}</td>`)).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}">nothing yet</td></tr>`}</table>`;
  const when = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '');
  const j = (v) => (v === undefined ? '' : esc(typeof v === 'string' ? v : JSON.stringify(v)));
  const SP = world && store && act ? createStaffPlayers({ accounts, mod, analytics, store, world, said, now }, { table, when }) : null;
  const sumObj = (days, f) => { const o = {}; for (const d of days) for (const [k, v] of Object.entries(d[f] || {})) o[k] = (o[k] || 0) + v; return o; };
  const top = (o, n = 25) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const bars = (o, n = 25, money = false) => { const l = top(o, n), max = l.length ? l[0][1] : 1; return table(['', money ? 'dollars' : 'count', ''], l.map(([k, v]) => [esc(k), Math.round(v), `<span class="bar" style="width:${Math.max(1, Math.round((v / max) * 240))}px"></span>`])); };

  function logPage(req, url) {
    const q = url.searchParams.get('q') || null;
    const list = log.tail(300, q);
    // every view: the head (size and last line, cheap); the whole chain hashed again only on ?verify=1
    const full = url.searchParams.get('verify') === '1', v = full ? log.verify() : log.checkHead();
    const verdict = v.ok
      ? `<span class="ok">${full ? `The whole chain checks out: ${v.n} entries, none changed or taken out.` : `${v.n} entries; the end of the file is as the head says.`}</span>${full ? '' : ' <a href="/admin/log?verify=1">Check the whole chain</a>.'}`
      : `<span class="bad">${full ? `The chain is broken at entry ${v.brokenAt + 1}${v.why ? ` (${esc(v.why)})` : ''} - the file was edited by hand.` : `The log doesn't match its head: ${esc(v.why)}.`}</span>`;
    return `<p>${verdict} Newest first, the last 300${q ? `, for ${esc(q)}` : ''}. Filter: add ?q=&lt;account id or action&gt;.</p>`
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

  // the staff member as the staff commands know them: their character when they're in the game (the same refusal
  // memory as in-game), else a stand-in with their id and name
  const standIns = new Map();
  function actor(w) {
    const q = world.players.get(w.pid);
    if (q && q.conn) return q;
    let a = standIns.get(w.pid);
    if (!a) { a = { pid: w.pid, name: w.name }; standIns.set(w.pid, a); }
    a.name = w.name;
    return a;
  }
  function playersGet(res, url, w) {
    const id = url.searchParams.get('id');
    if (!id) { sendHTML(res, 200, shell('Players', SP.listPage(), w, '<meta http-equiv="refresh" content="15">')); return; }
    if (!allowed(w.role, 'plog')) { sendHTML(res, 403, 'Not for your role.'); return; }
    // a look at their log is the staff command 'plog' (logged, as in the game)
    const r = act(actor(w), { a: 'plog', id });
    const flash = w.s.flash || null;
    w.s.flash = null;
    const d = r && r.ok ? SP.detailPage(w.role, w.s.csrf, id, r.data, flash) : null;
    if (!d) { sendHTML(res, 404, shell('Players', `<p>No such player. <a href="/admin/players">All players</a></p>`, w)); return; }
    sendHTML(res, 200, shell(d.title, d.body, w));
  }
  async function playersPost(req, res, w) {
    // cross-site: refused before anything is read (the Strict cookie already keeps another site's form out; the token too)
    if (req.headers['sec-fetch-site'] === 'cross-site') { sendHTML(res, 403, 'Refused.'); return; }
    const form = await readForm(req);
    if (!form || typeof form.csrf !== 'string' || !w.s.csrf || !safeEqual(form.csrf, w.s.csrf)) { sendHTML(res, 403, 'This form is out of date - open the page again.'); return; }
    const msg = SP.command(form);
    if (!msg) { sendHTML(res, 400, 'No such action.'); return; }
    // a destructive one asks again (a page of its own, no script): Yes posts it with confirm=1
    const A = ACTIONS[msg.a];
    if (A.confirm && form.confirm !== '1') { sendHTML(res, 200, shell('Are you sure?', SP.confirmPage(w.s.csrf, msg), w)); return; }
    const r = act(actor(w), msg) || { ok: false, err: 'No reply.' };
    w.s.flash = { ok: !!r.ok, text: r.ok ? `Done: ${A.label.toLowerCase()}.` : `Not done: ${r.err || 'refused'}` };
    res.writeHead(303, { location: `/admin/players?id=${encodeURIComponent(msg.id)}`, 'cache-control': 'no-store' });
    res.end();
  }

  // ---- the players' bug reports (server/bugreports.js): newest first, the screenshot shown, mark done / open again ----
  const BUG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'";
  function bugsPage(url, w) {
    const all = bugs.list(), openOnly = url.searchParams.get('open') === '1', shown = (openOnly ? all.filter((r) => !r.done) : all).slice(0, 100);
    const flash = w.s.flash; w.s.flash = null;
    const card = (r) => `<div style="display:flex;gap:14px;flex-wrap:wrap;padding:10px;margin:0 0 12px;border:1px solid #333;background:${r.done ? '#17191d' : '#1b1e23'};${r.done ? 'opacity:.6' : ''}">`
      + (r.shot ? `<a href="/admin/bugs/img?id=${esc(r.id)}"><img src="/admin/bugs/img?id=${esc(r.id)}" alt="screenshot" style="width:360px;max-width:100%;border:1px solid #444"></a>` : '<div style="width:360px;max-width:100%;color:#888">no screenshot</div>')
      + `<div style="flex:1;min-width:260px"><b>${esc((r.text.split('\n')[0] || '').slice(0, 120) || '(' + r.kind + ')')}</b> <small>${esc(r.kind)}</small>`
      + `<p style="white-space:pre-wrap;margin:6px 0">${esc(r.text)}</p>`
      + table(['', ''], [
        ['when (UTC)', when(r.at)], ['player', `${esc(r.name)}${r.guest ? ' (guest)' : ''} <small>${esc(r.pid)}</small>${SP ? ` · <a href="/admin/players?id=${encodeURIComponent(r.pid)}">their page</a>` : ''}`],
        ['where', `${esc(r.region || '?')}${r.area ? ` · HUD: ${esc(r.area)}` : ''}${r.x !== null ? ` · ${r.x}, ${r.y}` : ''}${r.online ? '' : ' · <span class="bad">not in the city</span>'}`],
        ['device', `${esc(r.device)} · ${esc(r.ua)}${r.screen ? ` · ${esc(r.screen)}` : ''}`], ['build', `${esc(r.build || '?')}${r.serverBuild && r.serverBuild !== r.build ? ` (server ${esc(r.serverBuild)})` : ''}`],
        ['fps · graphics', `${r.fps || '?'} · ${esc(r.preset || '?')}`],
        ['page errors', r.errors.length ? r.errors.map((e) => `${esc(when(e.at))} <b>${esc(e.where)}</b> ${esc(e.msg)}`).join('<br>') : 'none'],
      ])
      + `<form method="post" action="/admin/bugs"><input type="hidden" name="csrf" value="${esc(w.s.csrf)}"><input type="hidden" name="id" value="${esc(r.id)}"><input type="hidden" name="a" value="${r.done ? 'open' : 'done'}">`
      + `${r.done ? `<small class="ok">done ${esc(when(r.done.at))} by ${esc(r.done.by)}</small> ` : ''}<button type="submit">${r.done ? 'Open again' : 'Mark done'}</button></form></div></div>`;
    return `${flash ? `<p class="${flash.ok ? 'ok' : 'bad'}">${esc(flash.text)}</p>` : ''}<p>${bugs.count} report${bugs.count === 1 ? '' : 's'}, <b>${bugs.open}</b> open${bugs.webhookOn ? ' · each one is posted to the Discord too' : ' · no Discord webhook set (BUG_WEBHOOK_URL): kept here only'}. Newest first${openOnly ? ', open ones only - <a href="/admin/bugs">all</a>' : ' - <a href="/admin/bugs?open=1">open ones only</a>'}${shown.length < (openOnly ? bugs.open : bugs.count) ? `, the newest ${shown.length}` : ''}.</p>`
      + (shown.map(card).join('') || '<p>No reports yet.</p>');
  }
  async function bugsPost(req, res, w) {
    if (req.headers['sec-fetch-site'] === 'cross-site') { sendHTML(res, 403, 'Refused.'); return; }
    const form = await readForm(req);
    if (!form || typeof form.csrf !== 'string' || !w.s.csrf || !safeEqual(form.csrf, w.s.csrf)) { sendHTML(res, 403, 'This form is out of date - open the page again.'); return; }
    const ok = bugs.mark(String(form.id || ''), form.a !== 'open', w.name);
    if (ok) log.append({ who: { id: w.pid, n: w.name, role: w.role }, what: form.a === 'open' ? 'bug-open' : 'bug-done', note: String(form.id).slice(0, 24), ok: true });
    w.s.flash = { ok, text: ok ? (form.a === 'open' ? 'Opened again.' : 'Marked done.') : 'No such report.' };
    res.writeHead(303, { location: '/admin/bugs', 'cache-control': 'no-store' });
    res.end();
  }

  // ---- the owner's console (/admin/: server/adminconsole.js draws it; the owner, 11-16: "an analytics page that gives me a
  // real-time look at what's currently happening ... right now clicking in and out of different pages is clunky") ----
  // /admin/api: what the page polls - now (who's on: no account ids, no addresses - each row a ref good for this session,
  // /admin/go?ref= opens their page), trends (the rolling buckets: analytics.js trends, every window's totals and the asked
  // window's chart), where (countries and regions), moderation (the review list, bug reports, the admin log's latest), server.
  const DEV = { phone: 'phone', tablet: 'tablet', desktop: 'desktop', console: 'console', touch: 'phone' };
  function refOf(w, pid) {
    const R = (w.s.refs ||= { by: new Map(), of: new Map() });
    let r = R.by.get(pid);
    if (!r) { r = rb(6).toString('base64url'); R.by.set(pid, r); R.of.set(r, pid); }
    return r;
  }
  function apiNow(w) {
    const list = [], doing = {}, dist = {}, devs = {};
    if (world) for (const q of world.players.values()) {
      if (!q.conn) continue;
      const x = SP ? SP.info(q.pid) : null, ped = q.ped;
      const dv = DEV[q.devKind] || (q.device ? String(q.device).split(' ')[0] : '') || '?';
      const what = x ? x.doing : '';
      const row = { ref: refOf(w, q.pid), n: q.name, gu: q.guest ? 1 : 0, role: accounts.role(q.pid) || '', fo: q.founder ? 1 : 0, d: x ? x.district : '', c: q.cc ? q.cc.c : '', r: q.cc && q.cc.r ? q.cc.r : '', doing: what, sess: q.anStart ? now() - q.anStart : 0, dev: dv, w: q.wanted || 0, hp: ped && ped.maxHp ? Math.round((ped.hp / ped.maxHp) * 100) : 0, dm: q.devMode ? 1 : 0 };
      list.push(row);
      const k = what.replace(/ \(.*$/, '');
      doing[k] = (doing[k] || 0) + 1; if (row.d) dist[row.d] = (dist[row.d] || 0) + 1; devs[dv] = (devs[dv] || 0) + 1;
    }
    list.sort((a, b) => b.sess - a.sess);
    return { online: list.length, guests: list.filter((x) => x.gu).length, list, doing, dist, devs };
  }
  function apiModeration(w) {
    const open = mod.openReviews(500), reports = open.filter((r) => r.kind === 'report');
    const out = {
      reviews: { open: open.length, reports: reports.length, latest: open.slice(0, 8).map((r) => ({ at: r.at, kind: r.kind, n: r.who ? r.who.n : '', by: r.by ? r.by.n : '', note: String(r.note || '').slice(0, 140), times: r.n || 1 })) },
      bugs: bugs ? { count: bugs.count, open: bugs.open, latest: bugs.list().filter((r) => !r.done).slice(0, 6).map((r) => ({ at: r.at, kind: r.kind, n: r.name, gu: r.guest ? 1 : 0, t: String((r.text || '').split('\n')[0] || '').slice(0, 120), where: r.region || '', shot: !!r.shot })) } : null,
    };
    if (allowed(w.role, 'adminlog')) out.log = log.tail(12).map((e) => ({ at: e.at, who: e.who ? e.who.n : '', what: e.what, t: e.target ? e.target.n || '' : '', note: String(e.note || '').slice(0, 80), ok: e.ok !== false }));
    return out;
  }
  function apiServer() {
    const st = stats ? stats() : {}, m = process.memoryUsage(), day = analytics.trends ? analytics.trends('24h') : null;
    return { ...st, up: Math.round(process.uptime()), rss: Math.round(m.rss / 1048576), heap: Math.round(m.heapUsed / 1048576), heapMax: Math.round(m.heapTotal / 1048576), errors24: day ? day.er : 0, geo: geo ? { table: geo.table, credit: geo.credit } : null };
  }
  function api(w, url) {
    const win = WINDOWS[url.searchParams.get('win')] ? url.searchParams.get('win') : '24h';
    const out = { at: now(), me: { n: w.name, role: w.role }, now: apiNow(w), server: apiServer() };
    if (url.searchParams.get('more') === '1') {
      out.trends = analytics.trends ? analytics.trends(win) : null;
      out.windows = analytics.trends ? Object.keys(WINDOWS).map((k) => { const t = analytics.trends(k); delete t.series; return t; }) : [];
      const pl = analytics.places ? analytics.places(win) : { countries: [], regions: [], known: 0, unknown: 0 };
      const codes = new Set([...pl.countries.map(([c]) => c), ...out.now.list.map((x) => x.c).filter(Boolean)]);
      out.where = { win, ...pl, names: Object.fromEntries([...codes].map((c) => [c, COUNTRY_NAMES[c] || c])) };
      out.moderation = apiModeration(w);
      out.tools = { players: allowed(w.role, 'players'), log: allowed(w.role, 'adminlog'), reviews: allowed(w.role, 'reviews'), bugs: !!bugs && allowed(w.role, 'reviews'), news: !!news && allowed(w.role, 'news'), dashboard: allowed(w.role, 'dashboard') };
    }
    return out;
  }

  async function handle(req, res, url) {
    let path = url.pathname;
    if (path === '/admin') path = '/admin/';
    if (!path.startsWith('/admin/')) return false;
    if (!rl.hit(`admin:${ip(req)}`, 120, 60e3)) { sendHTML(res, 429, 'Too many requests.'); return true; }
    if (path === '/admin/enter') {
      sweep();
      const c = url.searchParams.get('c') || '', l = links.get(c);
      if (!l) { sendHTML(res, 410, 'This link has expired or was used - open it again from the game.'); return true; }
      links.delete(c);
      const sid = randomBytes(32).toString('base64url');
      sessions.set(sid, { pid: l.pid, exp: now() + SESSION_TTL_MS, csrf: randomBytes(24).toString('base64url'), flash: null });
      // the link is opened from the game's page, another site: a Strict cookie isn't sent on the redirect that follows a
      // cross-site navigation - so a small page of our own takes the next step, same-site (a meta refresh, no script)
      const to = l.page === 'console' ? '' : l.page;
      sendHTML(res, 200, `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/admin/${to}"><title>City Life Auto</title><body style="font:16px system-ui;background:#14161a;color:#eee"><p><a style="color:#8cc8ff" href="/admin/${to}">Continue</a></p>`, { 'set-cookie': setCookie('cla_admin', sid, { maxAge: SESSION_TTL_MS / 1000, path: '/admin', sameSite: 'Strict', secure }) });
      return true;
    }
    const w = who(req);
    if (!w) { sendHTML(res, 401, 'Signed out - open this page from the game (Settings -> Account -> staff tools).'); return true; }
    const page = path.slice(7);
    if (page === '' || page === 'console.js' || page === 'api' || page === 'go') {
      if (!allowed(w.role, 'console')) { sendHTML(res, 403, 'Not for your role.'); return true; }
      if (page === '') { sendHTML(res, 200, consolePage(w), { 'content-security-policy': CONSOLE_CSP }); return true; }
      if (page === 'console.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(consoleScript()); return true; }
      if (page === 'go') {
        const pid = w.s.refs && w.s.refs.of.get(url.searchParams.get('ref') || '');
        res.writeHead(303, { location: pid && SP ? `/admin/players?id=${encodeURIComponent(pid)}` : '/admin/', 'cache-control': 'no-store' });
        res.end();
        return true;
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(api(w, url)));
      return true;
    }
    if (page === 'players') {
      if (!SP) { sendHTML(res, 404, 'No such page.'); return true; }
      if (!allowed(w.role, 'players')) { sendHTML(res, 403, 'Not for your role.'); return true; }
      if (req.method === 'POST') await playersPost(req, res, w); else playersGet(res, url, w);
      return true;
    }
    if (page === 'bugs' || page === 'bugs/img') {
      if (!bugs) { sendHTML(res, 404, 'No such page.'); return true; }
      if (!allowed(w.role, 'reviews')) { sendHTML(res, 403, 'Not for your role.'); return true; }
      if (page === 'bugs/img') {
        const im = bugs.image(url.searchParams.get('id'));
        if (!im) { res.writeHead(404, { 'cache-control': 'no-store' }); res.end(); return true; }
        res.writeHead(200, { 'content-type': im.type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" });
        res.end(im.body);
        return true;
      }
      if (req.method === 'POST') await bugsPost(req, res, w); else sendHTML(res, 200, shell('Bug reports', bugsPage(url, w), w), { 'content-security-policy': BUG_CSP });
      return true;
    }
    if (page === 'perf' || page === 'clienterrors') {
      if (!allowed(w.role, 'reviews')) { sendHTML(res, 403, 'Not for your role.'); return true; }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(texts ? (page === 'perf' ? texts.perf() : texts.errors()) : '');
      return true;
    }
    if (page === 'news' || page === 'news.csv') {
      if (!news) { sendHTML(res, 404, 'No such page.'); return true; }
      if (!allowed(w.role, 'news')) { sendHTML(res, 403, 'Not for your role.'); return true; }
      if (page === 'news.csv') {
        log.append({ who: { id: w.pid, n: w.name, role: w.role }, what: 'news-export', note: `${news.count} addresses`, ok: true });
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="cla-news-${new Date(now()).toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(news.csv());
        return true;
      }
      sendHTML(res, 200, shell('News list', `<p>Players who asked for game news by email: <b>${news.count}</b>.</p><p><a href="/admin/news.csv">Download the CSV</a> (email, when they opted in, where, their unsubscribe link). Each download goes in the admin log.</p>
<p>Send with Resend's broadcasts: import the CSV as an audience. Every news email must carry its unsubscribe link (the <code>unsubscribe_url</code> column, or Resend's own) and your postal address: <b>${mailAddress ? esc(mailAddress) : '<span class="bad">not set - set CLA_MAIL_ADDRESS</span>'}</b>. Export again before each send: players who unsubscribe in the game leave the list.</p>`, w));
      return true;
    }
    const need = page === 'log' ? 'adminlog' : page === 'dashboard' ? 'dashboard' : page === 'reviews' ? 'reviews' : null;
    if (!need) { sendHTML(res, 404, 'No such page.'); return true; }
    if (!allowed(w.role, need)) { sendHTML(res, 403, 'Not for your role.'); return true; }
    const body = page === 'log' ? logPage(req, url) : page === 'dashboard' ? dashboardPage() : reviewsPage();
    sendHTML(res, 200, shell(page === 'log' ? 'Admin log' : page === 'dashboard' ? 'Analytics' : 'Review list', body, w));
    return true;
  }
  return { handle, pageLink };
}
