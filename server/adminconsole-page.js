// The owner's console's page script (served as /admin/console.js by server/adminhttp.js; the page: server/adminconsole.js).
// A plain browser script, no imports, no libraries: polls /admin/api (every POLL_MS for the live parts, the trends with them
// every MORE_MS or when a tab or a window is picked), draws the tabs, the charts as inline SVG. Opening a player goes
// through /admin/go?ref= (the page never holds an account id).
(() => {
  const POLL_MS = 5000, MORE_MS = 30000;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (Math.round(n || 0)).toLocaleString('en-US');
  const dur = (ms) => { const m = Math.floor((ms || 0) / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m` : `${m} min`; };
  const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
  const flag = (c) => (c && /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map((x) => 0x1f1a5 + x.charCodeAt(0))) : '');
  const WINS = [['1h', 'Last hour'], ['6h', '6 hours'], ['24h', '24 hours'], ['3d', '3 days'], ['7d', '7 days']];
  const UI = { tab: 'now', win: '24h', last: 0, more: 0, data: null, fail: 0 };
  try { const s = JSON.parse(localStorage.getItem('cla.console') || '{}'); if (s.tab) UI.tab = s.tab; if (s.win) UI.win = s.win; } catch { /* storage blocked */ }
  const keep = () => { try { localStorage.setItem('cla.console', JSON.stringify({ tab: UI.tab, win: UI.win })); } catch { /* storage blocked */ } };

  // ---- drawing helpers ----
  function bars(obj, opt = {}) {
    const l = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, opt.n || 12), max = l.length ? l[0][1] : 1;
    if (!l.length) return '<div class="empty">Nobody yet.</div>';
    return `<div class="bars">${l.map(([k, v]) => `<span>${opt.label ? opt.label(k) : esc(k)}</span><i style="width:${Math.max(3, (v / max) * 100)}%;background:${opt.col || 'var(--gold)'}"></i><span class="v">${num(v)}</span>`).join('')}</div>`;
  }
  // a chart of one series: an area (line) or bars, with the scale on the left and a few times along the bottom
  // (drawn at the box's own width in CSS px, so the type stays 11 px on a phone and a wide screen alike: fillCharts)
  function chart(series, key, opt = {}) {
    const W = Math.max(260, Math.round(opt.w || 640)), H = opt.h || Math.round(Math.min(220, Math.max(140, W * 0.28))), L = 34, B = 22, T = 10, R = 8, n = series.length;
    if (!n) return '<div class="empty">No data yet.</div>';
    const max = Math.max(1, ...series.map((q) => q[key])), top = max <= 4 ? max : Math.ceil(max / 4) * 4;
    const x = (i) => L + (i + 0.5) * ((W - L - R) / n), y = (v) => T + (H - T - B) * (1 - v / top), bw = Math.max(1, ((W - L - R) / n) * 0.72);
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = (top * k) / 4, yy = y(v); g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#ffffff14"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#a6aec4">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`; }
    const tick = Math.max(1, Math.round(n / Math.max(2, Math.floor(W / 110)))), fmt = opt.days ? (t) => new Date(t).toLocaleDateString([], { weekday: 'short', hour: '2-digit' }) : (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    for (let i = 0; i < n; i += tick) g += `<text x="${x(i)}" y="${H - 5}" text-anchor="middle" font-size="11" fill="#a6aec4">${esc(fmt(series[i].t))}</text>`;
    const col = opt.col || '#e2bd57';
    if (opt.bars) g += series.map((q, i) => (q[key] ? `<rect x="${x(i) - bw / 2}" y="${y(q[key])}" width="${bw}" height="${H - B - y(q[key])}" rx="1.5" fill="${col}"><title>${esc(fmt(q.t))}: ${q[key]}</title></rect>` : '')).join('');
    else {
      const pts = series.map((q, i) => `${x(i).toFixed(1)},${y(q[key]).toFixed(1)}`);
      g += `<path d="M${x(0)},${H - B} L${pts.join(' L')} L${x(n - 1)},${H - B} Z" fill="${col}" fill-opacity=".18"/><polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>`;
      const i = n - 1; g += `<circle cx="${x(i)}" cy="${y(series[i][key])}" r="3.5" fill="${col}"/>`;
    }
    return `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label || key)}">${g}</svg>`;
  }
  // a chart's box on the page (data-c: which one), filled once the page is laid out, at the box's width
  const box = (c) => `<div class="chartbox" data-c="${c}"></div>`;
  function fillCharts() {
    const T = UI.data && UI.data.trends;
    if (!T) return;
    const days = T.win === '3d' || T.win === '7d', C = { on: ['on', { days, label: 'online' }], u: ['u', { bars: 1, days, col: '#5ab0ff', label: 'players' }], se: ['se', { bars: 1, days, col: '#6cd06c', label: 'sessions' }] };
    for (const el of document.querySelectorAll('#trends .chartbox')) { const [k, o] = C[el.dataset.c]; el.innerHTML = chart(T.series, k, { ...o, w: el.clientWidth }); }
  }
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(fillCharts, 150); });
  const tile = (v, label, cls = '') => `<div class="tile ${cls}"><b>${v}</b><span>${esc(label)}</span></div>`;

  // ---- the tabs ----
  function drawKpis(d) {
    const day = (d.windows || []).find((q) => q.win === '24h');
    const k = (v, l, c = '') => `<div class="kpi ${c}"><b>${v}</b><span>${esc(l)}</span></div>`;
    $('kpis').innerHTML = k(num(d.now.online), 'online now', 'gold') + k(`${num(d.now.online - d.now.guests)}<small style="font-size:14px;color:var(--dim)"> / ${num(d.now.guests)}</small>`, 'members · guests') + (day ? k(num(day.uniq), 'players, 24 h') + k(num(day.peak), 'peak online, 24 h') + k(num(day.nw), 'new players, 24 h') : k('…', 'players, 24 h') + k('…', 'peak, 24 h') + k('…', 'new, 24 h'));
  }
  function drawNow(d) {
    const N = d.now;
    const rows = N.list.map((p) => `<tr data-ref="${esc(p.ref)}"><td><span class="nm${p.gu ? ' gu' : ''}">${p.fo ? '<span class="crown">♛</span>' : ''}${esc(p.n)}</span>${p.gu ? '<span class="tag gu">guest</span>' : ''}${p.role ? `<span class="tag role">${esc(p.role)}</span>` : ''}${p.w ? `<span class="tag w">${'★'.repeat(Math.min(5, p.w))}</span>` : ''}<div class="sub">${esc(p.doing)}${p.d ? ' · ' + esc(p.d) : ''}</div></td><td class="hide-s">${esc(p.d)}</td><td>${dur(p.sess)}</td><td class="hide-s">${esc(p.dev)}</td><td title="${esc(p.r)}">${flag(p.c)} ${esc(p.c || '?')}</td></tr>`).join('');
    $('now').innerHTML = `<div class="grid">
<div class="card wide"><h2>Who's on <small>${num(N.online)} now · tap a player for their page and the actions</small></h2>${N.list.length ? `<div style="overflow-x:auto"><table class="players"><thead><tr><th>Player · doing</th><th class="hide-s">District</th><th>Session</th><th class="hide-s">Device</th><th>From</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Nobody in the city right now.</div>'}</div>
<div class="card"><h2>Doing</h2>${bars(N.doing)}</div><div class="card"><h2>Where in the city</h2>${bars(N.dist, { col: 'var(--info)' })}</div><div class="card"><h2>Devices</h2>${bars(N.devs, { col: 'var(--money)' })}</div></div>`;
    for (const tr of $('now').querySelectorAll('tr[data-ref]')) tr.onclick = () => window.open(`/admin/go?ref=${encodeURIComponent(tr.dataset.ref)}`, '_blank', 'noopener');
  }
  function drawTrends(d) {
    const T = d.trends;
    if (!T) { $('trends').innerHTML = '<div class="empty">Loading…</div>'; return; }
    const days = T.win === '3d' || T.win === '7d';
    const W = d.windows || [];
    const cmpRow = (label, f, fmt = num) => `<tr><td>${label}</td>${W.map((q) => `<td>${fmt(f(q))}</td>`).join('')}</tr>`;
    $('trends').innerHTML = `<div class="chips" id="wins">${WINS.map(([k, l]) => `<button data-w="${k}" class="${k === UI.win ? 'on' : ''}">${l}</button>`).join('')}</div>
<div class="grid tr"><div class="card wide"><h2>${esc((WINS.find((w) => w[0] === T.win) || [])[1] || T.win)}</h2><div class="tiles">${tile(num(T.uniq), 'players')}${tile(num(T.peak), 'peak online')}${tile(T.avg, 'average online')}${tile(num(T.nw), 'new players')}${tile(num(T.rt), 'came back')}${tile(num(T.se), 'sessions')}${tile(T.avgMin ? T.avgMin + ' min' : '-', 'average session')}${tile(num(T.su), 'sign-ups')}${tile(num(T.jb), 'jobs done')}${tile(num(T.cr), 'crimes')}${tile(num(T.de), 'deaths')}${tile(num(T.ch), 'chat lines')}</div></div>
<div class="card wide"><h2>Online <small>most at once</small></h2>${box('on')}</div>
<div class="card half"><h2>Players seen</h2>${box('u')}</div>
<div class="card half"><h2>Sessions begun</h2>${box('se')}</div>
<div class="card wide"><h2>Side by side</h2><div style="overflow-x:auto"><table class="cmp"><thead><tr><th></th>${W.map((q) => `<th>${esc((WINS.find((w) => w[0] === q.win) || [])[1] || q.win)}</th>`).join('')}</tr></thead><tbody>
${cmpRow('Players', (q) => q.uniq)}${cmpRow('Peak online', (q) => q.peak)}${cmpRow('New players', (q) => q.nw)}${cmpRow('Came back', (q) => q.rt)}${cmpRow('Sessions', (q) => q.se)}${cmpRow('Average session (min)', (q) => q.avgMin, (v) => v || '-')}${cmpRow('Sign-ups', (q) => q.su)}${cmpRow('Jobs done', (q) => q.jb)}${cmpRow('Crimes', (q) => q.cr)}${cmpRow('Deaths', (q) => q.de)}${cmpRow('Chat lines', (q) => q.ch)}${cmpRow('Page errors', (q) => q.er)}
</tbody></table></div><div class="note">Minute by minute for the last 6 hours, hour by hour for 7 days; kept through restarts. The long view (retention, the first-time funnel, money) is on the full analytics page under Tools.</div></div></div>`;
    for (const b of $('wins').querySelectorAll('button')) b.onclick = () => { UI.win = b.dataset.w; keep(); poll(true); };
    fillCharts();
    void days;
  }
  function drawWhere(d) {
    const P = d.where;
    if (!P) { $('where').innerHTML = '<div class="empty">Loading…</div>'; return; }
    const name = (c) => `${flag(c)} ${esc(P.names[c] || c)}`;
    const nowC = {}; for (const p of d.now.list) if (p.c) nowC[p.c] = (nowC[p.c] || 0) + 1;
    $('where').innerHTML = `<div class="chips" id="wins2">${WINS.map(([k, l]) => `<button data-w="${k}" class="${k === UI.win ? 'on' : ''}">${l}</button>`).join('')}</div>
<div class="grid"><div class="card"><h2>Countries <small>${num(P.known)} players${P.unknown ? `, ${num(P.unknown)} unknown` : ''}</small></h2>${bars(Object.fromEntries(P.countries), { label: name, n: 25 })}</div>
<div class="card"><h2>Regions</h2>${bars(Object.fromEntries(P.regions), { label: (k) => `${flag(k.slice(0, 2))} ${esc(k.slice(3))} <small class="sub">${esc(k.slice(0, 2))}</small>`, col: 'var(--info)', n: 20 })}</div>
<div class="card"><h2>On now</h2>${bars(nowC, { label: name, col: 'var(--money)' })}</div></div>
<div class="note">The country comes from the connecting address${d.server.geo && d.server.geo.table ? ` (${esc(d.server.geo.credit)}, <a href="https://db-ip.com" rel="noopener">db-ip.com</a>)` : ' (the IP table isn\'t on the server yet - from the device\'s time zone for now)'}, the region from the device's time zone; the address itself is never stored.</div>`;
    for (const b of $('wins2').querySelectorAll('button')) b.onclick = () => { UI.win = b.dataset.w; keep(); poll(true); };
  }
  function drawMod(d) {
    const M = d.moderation;
    if (!M) { $('mod').innerHTML = '<div class="empty">Loading…</div>'; return; }
    const rv = M.reviews, bg = M.bugs;
    $('mod').innerHTML = `<div class="grid"><div class="card wide"><div class="tiles">${tile(num(rv.open), 'open on the review list', rv.open ? 'bad' : '')}${tile(num(rv.reports), 'player reports')}${bg ? tile(num(bg.open), 'open bug reports') + tile(num(bg.count), 'bug reports in all') : ''}</div></div>
<div class="card"><h2>The review list <small><a href="/admin/reviews">all</a></small></h2>${rv.latest.length ? `<ul class="list">${rv.latest.map((r) => `<li><b>${esc(r.kind)}</b> · ${esc(r.n)}${r.times > 1 ? ` ×${r.times}` : ''}<br><small>${esc(r.note)}${r.by ? ` - by ${esc(r.by)}` : ''} · ${ago(r.at)}</small></li>`).join('')}</ul>` : '<div class="empty">Nothing open.</div>'}<div class="note">Resolve items in the game (the admin panel) or on the full list.</div></div>
${bg ? `<div class="card"><h2>Bug reports <small><a href="/admin/bugs?open=1">open ones</a></small></h2>${bg.latest.length ? `<ul class="list">${bg.latest.map((r) => `<li>${esc(r.t || '(' + r.kind + ')')}<br><small>${esc(r.n)}${r.gu ? ' (guest)' : ''} · ${esc(r.where)}${r.shot ? ' · screenshot' : ''} · ${ago(r.at)}</small></li>`).join('')}</ul>` : '<div class="empty">No open reports.</div>'}</div>` : ''}
${M.log ? `<div class="card"><h2>Recent admin actions <small><a href="/admin/log">the log</a></small></h2><ul class="list">${M.log.length ? '' : '<li class="empty">Nothing yet.</li>'}${M.log.map((e) => `<li><b>${esc(e.what)}</b>${e.t ? ` → ${esc(e.t)}` : ''} <span class="${e.ok ? 'ok' : 'bad'}">${e.ok ? '' : 'refused'}</span><br><small>${esc(e.who)}${e.note ? ' · ' + esc(e.note) : ''} · ${ago(e.at)}</small></li>`).join('')}</ul></div>` : ''}</div>`;
  }
  function drawServer(d) {
    const S = d.server;
    $('server').innerHTML = `<div class="grid"><div class="card wide"><div class="tiles">${tile(dur(S.up * 1000), 'up for')}${tile((S.tickMsAvg ?? '?') + ' ms', 'tick, average')}${tile((S.tickMsMax ?? '?') + ' ms', 'tick, slowest lately')}${tile(S.rss + ' MB', 'memory (process)')}${tile(S.heap + ' / ' + S.heapMax + ' MB', 'heap used / held')}${tile(num(S.ents), 'things in the world')}${tile(num(S.profiles), 'accounts')}${S.line ? tile(num(S.line.waiting) + ' / ' + num(S.line.max), 'in line / the cap', S.line.waiting ? 'bad' : '') + tile((S.line.avgWaitS || 0) + ' s', 'waited, average (' + num(S.line.admitted) + ' let in)') : ''}${tile(num(S.errors24), 'page errors, 24 h', S.errors24 ? 'bad' : '')}</div></div>
<div class="card"><h2>Build</h2><ul class="list"><li>Version <b>${esc(S.build || '?')}</b>${S.builtAt ? `<br><small>built ${esc(new Date(S.builtAt).toLocaleString())}</small>` : ''}</li><li>Google Analytics: ${S.ga ? (S.ga.enabled ? `<span class="ok">on</span> <small>(${num(S.ga.sent)} sent, ${num(S.ga.queued)} queued, ${num(S.ga.failed)} failed)</small>` : 'off') : 'off'}</li><li>Country table: ${S.geo && S.geo.table ? '<span class="ok">loaded</span>' : '<span class="sub">not yet (time zones only)</span>'}</li></ul></div>
<div class="card"><h2>Reports</h2><ul class="list"><li><a href="/admin/perf">Devices</a> <small>frame rates, load times</small></li><li><a href="/admin/clienterrors">Page errors</a> <small>what broke in browsers</small></li></ul></div></div>`;
  }
  function drawTools(d) {
    const t = d.tools || {}, a = (on, href, l, s) => (on ? `<a href="${href}">${l}<span>${s}</span></a>` : '');
    $('tools').innerHTML = `<div class="tools">${a(t.players, '/admin/players', 'Players', 'everyone online and the last day; their pages and actions')}${a(t.bugs, '/admin/bugs', 'Bug reports', 'screenshots, devices, mark done')}${a(t.reviews, '/admin/reviews', 'Review list', 'reports, filter hits, anti-cheat flags')}${a(t.log, '/admin/log', 'Admin log', 'every privileged action, hash-chained')}${a(t.dashboard, '/admin/dashboard', 'Full analytics', 'days, retention, the funnel, money, devices')}${a(t.news, '/admin/news', 'News list', 'opted-in emails (CSV)')}${a(true, '/admin/perf', 'Devices', 'frame rates and load times')}${a(true, '/admin/clienterrors', 'Page errors', 'what broke in browsers')}</div>
<p class="note">In the game: the admin panel (admin mode, the debug menu's ADMIN tile) watches, teleports, heals, revives, gifts and moderates players.</p>`;
  }
  function draw() {
    const d = UI.data;
    if (!d) return;
    drawKpis(d);
    if (UI.tab === 'now') drawNow(d);
    else if (UI.tab === 'trends') drawTrends(d);
    else if (UI.tab === 'where') drawWhere(d);
    else if (UI.tab === 'mod') drawMod(d);
    else if (UI.tab === 'server') drawServer(d);
    else drawTools(d);
    const n = d.moderation ? d.moderation.reviews.open + (d.moderation.bugs ? d.moderation.bugs.open : 0) : 0, mb = $('tabs').querySelector('[data-t="mod"]');
    mb.innerHTML = `Moderation${n ? `<span class="n">${n}</span>` : ''}`;
  }

  // ---- polling ----
  let busy = false;
  async function poll(more = false) {
    if (busy) return;
    busy = true;
    const want = more || !UI.data || !UI.data.trends || Date.now() - UI.more > MORE_MS;
    try {
      const r = await fetch(`/admin/api?win=${encodeURIComponent(UI.win)}${want ? '&more=1' : ''}`, { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 401 || r.status === 403) { $('ago').textContent = 'signed out - open the console from the game again'; $('dot').classList.add('off'); busy = false; return; }
      const d = await r.json();
      if (!want && UI.data) { for (const k of ['trends', 'windows', 'where', 'moderation', 'tools']) d[k] = UI.data[k]; }
      else UI.more = Date.now();
      UI.data = d; UI.last = Date.now(); UI.fail = 0;
      $('dot').classList.remove('off');
      draw();
    } catch { UI.fail++; $('dot').classList.add('off'); }
    busy = false;
  }
  setInterval(() => { if (!document.hidden) poll(); }, POLL_MS);
  setInterval(() => { $('ago').textContent = UI.last ? (UI.fail ? `offline · last ${ago(UI.last)}` : `live · ${ago(UI.last)}`) : 'connecting…'; }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  for (const b of $('tabs').querySelectorAll('button')) b.onclick = () => {
    UI.tab = b.dataset.t; keep();
    for (const x of $('tabs').querySelectorAll('button')) x.classList.toggle('on', x === b);
    for (const s of document.querySelectorAll('main section')) s.classList.toggle('on', s.id === UI.tab);
    draw();
    if (UI.tab !== 'now' && UI.tab !== 'server') poll(true);
  };
  for (const x of $('tabs').querySelectorAll('button')) x.classList.toggle('on', x.dataset.t === UI.tab);
  for (const s of document.querySelectorAll('main section')) s.classList.toggle('on', s.id === UI.tab);
  poll(true);
})();
