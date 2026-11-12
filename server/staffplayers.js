// The staff's Players page (/admin/players; the owner, 11-12: "see who is in the game right now and act on them"):
// everyone online in one table - their account, role, where they are, wanted stars, money, time this session and all
// told, first seen, sessions, the device's class and browser, what they're doing, chat strikes, anti-cheat flags - and
// below it who was on in the last day. A player's own page (?id=) adds their recent log, purchases, strikes, ban, chat
// lines and review-list items, and the staff actions as buttons. Everything here is read from what the server keeps
// already (the account, acct.an, the review list, the player in memory); nothing more personal (no address) is kept.
// The actions go through the staff commands themselves (server/admin.js handle, via act()): the same powers checked,
// the same admin log; this module only draws pages and turns a form into a command.
import { allowed } from './roles.js';
import { esc } from './httputil.js';
import { chatData } from './moderation.js';

export const FLAG_KINDS = ['teleport', 'speed', 'rate', 'input', 'econ'];   // (the anti-cheat audits' review kinds: anticheat.js)
export const RECENT_H = 24, RECENT_MAX = 100;
// the actions the page offers: the staff command, its power, and whether it asks again before it's done
export const ACTIONS = {
  kick: { power: 'kick', confirm: true, label: 'Kick' },
  ban: { power: 'ban', confirm: true, label: 'Ban' },
  unban: { power: 'unban', confirm: false, label: 'Unban' },
  mute: { power: 'mute', confirm: true, label: 'Mute chat' },
  unmute: { power: 'unmute', confirm: false, label: 'Unmute chat' },
  strike: { power: 'strike', confirm: true, label: 'Give a chat strike' },
  rescue: { power: 'rescue', confirm: false, label: 'Rescue (move to the street)' },
  prison: { power: 'prison', confirm: true, label: 'Send to prison' },
};
const BAN_HOURS = [[1, '1 hour'], [24, '1 day'], [72, '3 days'], [168, '1 week'], [720, '30 days'], [0, 'for good']];
const MUTE_HOURS = [[1, '1 hour'], [6, '6 hours'], [24, '1 day'], [168, '1 week']];
const PRISON_MINS = [[5, '5 min'], [15, '15 min'], [30, '30 min'], [60, '1 hour'], [0, 'let out now']];
const DOING = { down: 'down', police: 'on duty (police)', wanted: 'wanted', custody: 'in custody', transit: 'on transit', home: 'at home', indoors: 'indoors', foot: 'on foot' };

export const dur = (ms) => {
  if (!(ms > 0)) return '0 min';
  const m = Math.floor(ms / 60e3);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
};
const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

// deps: { accounts, mod, analytics, store, world, said(p) -> [{ at, ch, text }], now }
// ui: { table(head, rows), when(ms) } - the admin pages' own (server/adminhttp.js)
export function createStaffPlayers({ accounts, mod, analytics, store, world, said = null, now = Date.now }, ui) {
  const online = (pid) => { const q = world && world.players.get(pid); return q && q.conn ? q : null; };
  // the review list's anti-cheat flags, by account: { n, open, kinds }
  function flagIndex() {
    const m = new Map();
    for (const r of mod.reviews()) {
      if (!r.who || !FLAG_KINDS.includes(r.kind)) continue;
      const f = m.get(r.who.id) || { n: 0, open: 0, kinds: new Set() };
      f.n += r.n || 1; if (!r.done) f.open++; f.kinds.add(r.kind);
      m.set(r.who.id, f);
    }
    return m;
  }
  function doing(p) {
    if (p.prison) return 'in prison';
    const k = analytics && analytics.activityOf ? analytics.activityOf(world, p) : '';
    if (k.startsWith('job:')) return `on a job (${k.slice(4)})`;
    if (k.startsWith('vehicle:')) return `in a vehicle (${k.slice(8)})`;
    return (DOING[k] || k) + (p.away ? ', away' : '');
  }
  // what the page shows of one account (online or not)
  function info(pid, flags) {
    const prof = store.get(pid);
    if (!prof) return null;
    const a = accounts.get(pid), p = online(pid), an = a.an || {};
    const prov = [...new Set((a.logins || []).map((l) => l.p))];
    if ((a.passkeys || []).length) prov.push('passkey');
    const ped = p && p.ped, d = ped && world.map && world.map.districtAt ? world.map.districtAt(ped.x, ped.y) : null;
    return {
      pid, p, prof, a, name: p ? p.name : prof.name,
      account: a.kind === 'member' ? `signed in${prov.length ? ` (${prov.join(', ')})` : ''}` : 'guest',
      role: a.role || '', district: (d && d.name) || '', wanted: p ? p.wanted || 0 : 0,
      cash: prof.cash, bank: prof.bank,
      session: p && p.anStart ? now() - p.anStart : 0,
      played: (a.playMin || 0) * 60e3,
      first: a.created || prof.created || 0,
      sessions: an.sess || 0, days: an.days || 0,
      device: (p && p.device) || '',
      doing: p ? doing(p) : 'offline',
      strikes: mod.activeStrikes(a), muted: mod.mutedUntil(a), ban: accounts.banned(pid),
      flags: (flags || flagIndex()).get(pid) || null, live: (p && p.acLog) || [],
      lastSeen: prof.lastSeen || 0,
    };
  }
  const nameCell = (x) => `<a href="/admin/players?id=${esc(x.pid)}">${esc(x.name)}</a>${x.ban ? ' <span class="bad">banned</span>' : ''}`;
  const flagCell = (x) => {
    const n = (x.flags ? x.flags.n : 0), live = x.live.length;
    if (!n && !live) return '';
    return `<span class="${x.flags && x.flags.open ? 'bad' : ''}">${n}${x.flags ? ` (${esc([...x.flags.kinds].join(', '))})` : ''}${x.flags && x.flags.open ? `, ${x.flags.open} open` : ''}</span>${live ? `<br><small>${live} this session</small>` : ''}`;
  };
  const strikeCell = (x) => `${x.strikes}${x.muted ? ` <span class="bad">muted till ${esc(ui.when(x.muted))}</span>` : ''}`;

  // the list: everyone online, then who was on in the last day
  function listPage() {
    const flags = flagIndex(), on = [];
    if (world) for (const q of world.players.values()) if (q.conn) { const x = info(q.pid, flags); if (x) on.push(x); }
    on.sort((a, b) => a.name.localeCompare(b.name));
    let out = `<p>Online now: <b>${on.length}</b> · refreshes every 15 s · times UTC · click a name for their page and the actions.</p>`;
    out += '<div class="wide">' + ui.table(['name', 'account', 'role', 'district', 'wanted', 'cash', 'bank', 'this session', 'played', 'first seen', 'sessions', 'device', 'doing', 'chat strikes', 'anti-cheat flags'],
      on.map((x) => [nameCell(x), esc(x.account), esc(x.role), esc(x.district), x.wanted ? `<span class="bad">${'*'.repeat(Math.min(6, x.wanted))}</span>` : '', money(x.cash), money(x.bank), dur(x.session), dur(x.played), esc(ui.when(x.first).slice(0, 10)), `${x.sessions || '?'} <small>(${days(x.days)})</small>`, esc(x.device), esc(x.doing), strikeCell(x), flagCell(x)])) + '</div>';
    // who was on in the last day and isn't now (the profile's lastSeen, set as they leave: players.js leave)
    const cut = now() - RECENT_H * 3600e3, gone = [];
    for (const prof of store.all()) if ((prof.lastSeen || 0) >= cut && !online(prof.pid) && prof.acct) gone.push(prof);
    gone.sort((a, b) => b.lastSeen - a.lastSeen);
    out += `<h2>Offline, seen in the last ${RECENT_H} hours (${gone.length}${gone.length > RECENT_MAX ? `, the latest ${RECENT_MAX}` : ''})</h2>`;
    out += ui.table(['name', 'account', 'role', 'last seen', 'played', 'chat strikes', 'anti-cheat flags'], gone.slice(0, RECENT_MAX).map((prof) => {
      const x = info(prof.pid, flags);
      return [nameCell(x), esc(x.account), esc(x.role), esc(ui.when(x.lastSeen)), dur(x.played), strikeCell(x), flagCell(x)];
    }));
    return out;
  }

  // a form for one action (hidden: the session's token, the player, the action)
  const hidden = (k, v) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`;
  const select = (name, opts, sel) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const why = (ph) => `<input name="why" maxlength="200" placeholder="${esc(ph)}" size="28">`;
  function actionForm(csrf, x, a, extra = '') {
    return `<form method="post" action="/admin/players" class="act">${hidden('csrf', csrf)}${hidden('id', x.pid)}${hidden('a', a)}${extra}<button>${esc(ACTIONS[a].label)}</button></form>`;
  }
  function actionsHtml(role, csrf, x) {
    const may = (a) => allowed(role, ACTIONS[a].power);
    const f = [];
    if (may('rescue') && x.p) f.push(actionForm(csrf, x, 'rescue'));
    if (may('kick') && x.p) f.push(actionForm(csrf, x, 'kick', why('reason (they see it)')));
    if (may('ban')) f.push(x.ban ? (may('unban') ? actionForm(csrf, x, 'unban') : '') : actionForm(csrf, x, 'ban', select('hours', BAN_HOURS, 24) + why('reason (they see it)')));
    if (may('mute')) f.push(x.muted ? (may('unmute') ? actionForm(csrf, x, 'unmute') : '') : actionForm(csrf, x, 'mute', select('hours', MUTE_HOURS, 24)));
    if (may('strike')) f.push(actionForm(csrf, x, 'strike', why('what for')));
    if (may('prison')) f.push(actionForm(csrf, x, 'prison', select('mins', PRISON_MINS, 15) + why('reason')));
    const l = f.filter(Boolean);
    return l.length ? `<h2>Actions</h2><p><small>Each goes through the staff command itself: your role is checked and it's written to the admin log. Kick, ban, mute, strike and prison ask again first.</small></p>${l.join('')}` : '<p><small>Your role has no actions on players here.</small></p>';
  }

  // a player's page. plog: the staff command's reply (admin.js 'plog': logged as a look at their log)
  function detailPage(role, csrf, pid, plog, flash) {
    const x = info(pid);
    if (!x) return null;
    const d = plog || {};
    let out = flash ? `<p class="${flash.ok ? 'ok' : 'bad'}">${esc(flash.text)}</p>` : '';
    out += `<p><a href="/admin/players">All players</a> · <a href="/admin/players?id=${esc(pid)}">Refresh</a> · <a href="/admin/log?q=${esc(pid)}">Admin log for them</a></p>`;
    const kv = [['account id', `<small>${esc(pid)}</small>`], ['status', x.p ? '<span class="ok">online</span>' : `offline${x.lastSeen ? `, last seen ${esc(ui.when(x.lastSeen))}` : ''}`], ['account', esc(x.account)], ['role', esc(x.role || 'player')],
      ['district', esc(x.district)], ['wanted', x.wanted ? `<span class="bad">${x.wanted} stars</span>` : '0'], ['cash / bank', `${money(x.cash)} / ${money(x.bank)}`],
      ['this session', x.p ? dur(x.session) : ''], ['played, all told', dur(x.played)], ['first seen', esc(ui.when(x.first))], ['sessions', `${x.sessions || '?'} (on ${days(x.days)})`],
      ['device', esc(x.device)], ['doing', esc(x.doing)], ['chat', strikeCell(x)],
      ['ban', x.ban ? `<span class="bad">${x.ban.until ? `until ${esc(ui.when(x.ban.until))}` : 'for good'}</span> since ${esc(ui.when(x.ban.at))}${x.ban.why ? `: ${esc(x.ban.why)}` : ''}${x.ban.by ? ` <small>by ${esc((store.get(x.ban.by) || {}).name || x.ban.by)}</small>` : ''}` : 'no'],
      ['anti-cheat flags', flagCell(x) || 'none']];
    out += `<table>${kv.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>`;
    out += actionsHtml(role, csrf, x);
    const lines = x.p && said ? said(x.p) || [] : [];
    out += `<h2>Recent chat (this session, the last ${lines.length})</h2>` + ui.table(['when (UTC)', 'channel', 'line'], lines.slice().reverse().map((l) => [esc(ui.when(l.at)), esc(l.ch), esc(l.text)]));
    if (x.live.length) out += '<h2>Anti-cheat flags this session</h2>' + ui.table(['when (UTC)', 'kind', 'note'], x.live.slice().reverse().map((f) => [esc(ui.when(f.at)), esc(f.kind), esc(f.note)]));
    out += '<h2>Recent log (newest first)</h2>' + ui.table(['when (UTC)', 'kind', 'what'], (d.log || []).map((e) => [esc(ui.when(e.at)), esc(e.k), esc(e.d)]));
    out += '<h2>Purchases</h2>' + ui.table(['#', 'when (UTC)', 'what', 'amount', 'refunded'], (d.buys || []).map((b) => [b.i, esc(ui.when(b.at)), esc(b.what), money(b.amt), b.refunded ? esc(ui.when(b.refunded.at)) : '']));
    const st = chatData(x.a).strikes || [];
    out += '<h2>Chat strikes (all kept)</h2>' + ui.table(['when (UTC)', 'why', 'by', 'state'], st.map((s) => [esc(ui.when(s.at)), esc(s.why), esc(s.by === 'filter' ? 'the filter' : (store.get(s.by) || {}).name || s.by), s.removed ? 'taken back' : s.spent ? 'spent on a mute' : '<span class="bad">active</span>']));
    const rv = mod.reviews().filter((r) => r.who && r.who.id === pid).slice(0, 50);
    out += '<h2>Review-list items about them</h2>' + ui.table(['when (UTC)', 'kind', 'by', 'note', 'times', 'resolved'], rv.map((r) => [esc(ui.when(r.at)), esc(r.kind), r.by ? esc(r.by.n) : '', esc(r.note), r.n || 1, r.done ? `${esc(ui.when(r.done.at))} ${esc(r.done.by && r.done.by.n)}: ${esc(r.done.note)}` : '<span class="bad">open</span>']));
    return { title: x.name, body: out };
  }

  // a form posted: the staff command it asks for ({ a, id, hours?, mins?, why? }), or null when it isn't one
  function command(form) {
    const a = String(form.a || '');
    if (!Object.hasOwn(ACTIONS, a)) return null;
    const msg = { a, id: String(form.id || '').slice(0, 40) };
    if (a === 'ban' || a === 'mute') msg.hours = Math.max(0, Number(form.hours) || 0);
    if (a === 'prison') msg.mins = Math.max(0, Number(form.mins) || 0);
    if (a === 'kick' || a === 'ban' || a === 'strike' || a === 'prison') msg.why = String(form.why || '').slice(0, 200);
    if (a === 'mute' && !msg.hours) msg.hours = 24;
    return msg;
  }
  // the second step of a destructive action: what's about to happen, Yes or Cancel
  function confirmPage(csrf, msg) {
    const x = info(msg.id);
    const name = x ? x.name : msg.id;
    const what = msg.a === 'ban' ? `Ban ${name} ${msg.hours ? `for ${(BAN_HOURS.find(([h]) => h === msg.hours) || [0, `${msg.hours} hours`])[1]}` : 'for good'}`
      : msg.a === 'mute' ? `Mute ${name} from chat for ${(MUTE_HOURS.find(([h]) => h === msg.hours) || [0, `${msg.hours} hours`])[1]}`
        : msg.a === 'prison' ? (msg.mins ? `Send ${name} to Prison Island for ${msg.mins} min` : `Let ${name} out of prison`)
          : msg.a === 'kick' ? `Kick ${name} (they can come back in a minute)` : `Give ${name} a chat strike`;
    const fields = Object.entries(msg).map(([k, v]) => hidden(k, v)).join('');
    return `<p>${esc(what)}${msg.why ? ` - "${esc(msg.why)}"` : ''}?</p><form method="post" action="/admin/players" class="act">${hidden('csrf', csrf)}${fields}${hidden('confirm', '1')}<button class="danger">Yes, ${esc(ACTIONS[msg.a].label.toLowerCase())}</button></form> <a href="/admin/players?id=${esc(msg.id)}">Cancel</a>`;
  }
  return { listPage, detailPage, command, confirmPage, info };
}
