// The launch foundation, wired together for the online server (server/index.js): accounts and sign-ins, roles and the
// admin log, chat and moderation, anti-cheat audits, analytics (self-hosted, and GA4 from the server). session.js
// knows it only as opts.hooks, so offline practice (client/practice-worker.js, which runs session.js in a browser) is
// untouched by any of it.
import { join as pathJoin } from 'node:path';
import { createAccounts } from './accounts.js';
import { verifyToken, newPlayerId, keyedHash } from './auth.js';
import { createAuthHttp, enabledProviders, resetsOn } from './authhttp.js';
import { createNewsList } from './newslist.js';
import { normEmail } from './passwords.js';
import { legalHttp } from './legal.js';
import { createAdminLog } from './adminlog.js';
import { createAdminHttp } from './adminhttp.js';
import { createAdmin, note, notePurchase } from './admin.js';
import { allowed } from './roles.js';
import { filter as loadFilter } from './chatfilter.js';
import { createModeration } from './moderation.js';
import { createChat } from './chat.js';
import { createAntiCheat } from './anticheat.js';
import { createAnalytics, deviceClass } from './analytics.js';
import { browserOf } from './perfreports.js';
import { createGA } from './ga.js';
import { watch, settle, release } from './moneywatch.js';
import { createRateLimiter } from './httputil.js';
import { cleanName, lookKey } from '../shared/names.js';
import { USERNAME_GAP_DAYS } from './accounts.js';
import * as devmode from './devmode.js';
import * as players from './systems/players.js';
import * as crews from './systems/crews.js';
import * as bounties from './systems/bounties.js';
import * as careers from './systems/careers.js';

const LEISURE = { arcade: 'arcade', chess: 'chess', mus: 'music', racebook: 'racebook', cine: 'cinematic' };

// opts: { config, store, world, fetch, log, now, dataDir (null: nothing written - tests) }
export function createLaunch(opts) {
  const { config, store, world } = opts;
  const L = config.launch, now = opts.now || Date.now, log = opts.log || console, secret = config.secret;
  const signOutCloseMs = opts.signOutCloseMs ?? 1500;
  const dataDir = opts.dataDir === undefined ? config.dataDir : opts.dataDir;
  const accounts = createAccounts({ store, secret, now });
  const adminLog = createAdminLog(dataDir ? pathJoin(dataDir, 'admin-log.jsonl') : null, now);
  const mod = createModeration({ store, now });
  const news = createNewsList({ file: dataDir ? pathJoin(dataDir, 'news.json') : null, now, publicUrl: L.publicUrl, mailAddress: L.mailAddress || '', log });
  const ga = createGA({ measurementId: L.gaMeasurementId, apiSecret: L.gaApiSecret, fetch: opts.fetch, now, log, userHash: (pid) => keyedHash('ga-user', pid, secret), regionOf: (p) => (p.ped && world.map ? (world.map.districtAt(p.ped.x, p.ped.y) || {}).isl : '') });
  let ac = null;
  const analytics = createAnalytics({ file: dataDir ? pathJoin(dataDir, 'analytics.json') : null, now, ga, onEarned: (p, perHour, norm) => { if (ac) ac.earned(p, perHour, norm); } });
  const modWithStats = { ...mod, review: (kind, who, noteText, data, by) => { if (['teleport', 'speed', 'rate', 'input', 'econ'].includes(kind)) { analytics.event('flag', null, { kind }); const a = who && accounts.get(who.id); if (a) note(a, 'flag', `${kind}: ${noteText}`); } return mod.review(kind, who, noteText, data, by); } };
  ac = createAntiCheat({ mod: modWithStats, now, log });
  const chat = createChat({ accounts, filter: loadFilter(), mod, now, onLine: (p, ch) => analytics.event('chat', p, { ch }) });
  const adminHttp = createAdminHttp({ accounts, log: adminLog, mod, analytics, news, mailAddress: L.mailAddress || '', publicUrl: L.publicUrl, ip: (req) => opts.ip(req), now, texts: opts.texts || null, world, store, act: (actor, msg) => admin.handle(world, actor, msg), said: (p) => chat.said(p), stats: () => ({ online: [...world.players.values()].filter((p) => p.conn).length, profiles: store.count, tickMsAvg: +world.stats.tickMs.toFixed(2), ga: ga.stats }) });
  const admin = createAdmin({ accounts, log: adminLog, mod, store, pageLink: adminHttp.pageLink, now });
  const onlineOf = (pid) => { const p = world.players.get(pid); return p && p.conn ? p : null; };
  const authHttp = createAuthHttp({
    launch: L, accounts, secret, fetch: opts.fetch, now, log, ip: (req) => opts.ip(req), extraOrigins: opts.extraOrigins || [], news, mail: opts.mail,
    onSignIn(pid, method, created, linked) {
      const p = onlineOf(pid), a = accounts.get(pid);
      analytics.signIn(p || { pid }, a, method, created);
      note(a, 'signin', `${method}${created ? ' (new account)' : linked ? ' (linked)' : ''}`);
      if (linked) becameMember(pid);
      if (p) { p.meDirty = true; sendAcct(p); if (linked) world.notify(p, `Signed in with ${METHOD[method] || method} - your progress is saved to this account.`, 'good'); }
    },
    onReset(pid) { note(accounts.get(pid), 'signin', 'password reset by email (signed out everywhere)'); },
    onTransfer(pid) { const p = onlineOf(pid); if (p) { try { p.conn.sendJSON({ t: 'kicked', reason: 'This character moved to another device.' }); p.conn.close(4012, 'moved'); } catch { /* gone */ } } },
    // signed out everywhere: its sessions closed (4015 - each page comes back with the token it holds: the one that asked
    // has the new one; the others are refused, 4014)
    // (a moment after the reply, so the page that asked has its new token before it reconnects: SIGNOUT_CLOSE_MS)
    onSignOutAll(pid) { const t = setTimeout(() => { const p = onlineOf(pid); if (p) { try { p.conn.close(4015, 'signed out'); } catch { /* gone */ } } }, signOutCloseMs); if (t.unref) t.unref(); },
    onFlag(pid, kind, text) { const a = accounts.get(pid), prof = store.get(pid); mod.review(kind, { id: pid, n: prof ? prof.name : '?' }, text); note(a, 'flag', text); },
  });
  devmode.setPolicy({
    open: L.devOpen,
    may: (p) => allowed(accounts.role(p.pid), 'dev'),
    onEnter: (p, by) => adminLog.append({ who: by ? { id: by.pid, n: by.name, role: accounts.role(by.pid) } : { id: p.pid, n: p.name, role: accounts.role(p.pid) }, what: 'devmode', target: { id: p.pid, n: p.name }, before: false, after: true }),
  });
  accounts.bootstrapOwner(L.ownerId, (s) => log.log(s));
  const guestRl = createRateLimiter(now);

  // ---- the hello: who this page is ----
  // -> { profile, token, note? } | { refused, code }
  // the close codes a refusal goes with (the page stops reconnecting on them and says why: client/main.js)
  // 4009 kicked, 4010 banned, 4011 the age gate, 4013 too many new guests, 4014 signed out (a stale member token)
  function login(token, hello = {}, ip = '?') {
    const c = accounts.checkToken(token);
    if (c && c.acct) {
      const ban = accounts.banned(c.pid);
      if (ban) return { refused: `This account is banned${ban.until ? ` until ${new Date(ban.until).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}${ban.why ? ': ' + ban.why : ''}.`, code: 4010 };
      if ((c.acct.kickUntil || 0) > now()) return { refused: 'You were kicked - wait a minute before coming back.', code: 4009 };
      if (L.requireAge && !c.acct.age17 && !hello.age17) return { refused: 'agegate', code: 4011 };
      return { profile: store.get(c.pid), token };
    }
    if (c && !c.acct) {   // (a genuine token whose profile isn't here: made again, as before)
      const prof = store.create(c.pid);
      accounts.ensure(prof);
      return { profile: prof, token: accounts.token(c.pid) };
    }
    // a member's token from before "sign out everywhere": signed out here - sign in again (not a new guest made silently)
    const stale = accounts.staleToken(token);
    if (stale && stale.member) return { refused: 'You were signed out on this device. Sign in again - or press PLAY to play as a new guest.', code: 4014 };
    // a new guest (no token, a forged one, or a guest's that has since moved to another device)
    const v = verifyToken(token, secret);
    if (L.blockBannedDevices && accounts.deviceBanned(hello.dm)) return { refused: 'This device is banned.', code: 4010 };
    if (L.guestPerHour && !guestRl.hit(`guest:${ip}`, L.guestPerHour, 3600e3)) return { refused: 'Too many new characters from your network this hour - try again later.', code: 4013 };
    if (L.requireAge && !hello.age17) return { refused: 'agegate', code: 4011 };
    const pid = newPlayerId();
    const prof = store.create(pid);
    accounts.ensure(prof);
    return { profile: prof, token: accounts.token(pid), note: v ? 'moved' : null };
  }

  function acctState(p) {
    const a = accounts.get(p.pid);
    const gap = a.username && a.nameAt ? Math.max(0, a.nameAt + USERNAME_GAP_DAYS * 86400e3 - now()) : 0;
    const pwl = accounts.passwordOf(p.pid), nw = news.byPid(p.pid);
    return { t: 'acct', id: p.pid, kind: a.kind, guest: a.kind !== 'member', name: p.name, username: !!a.username, renameIn: gap, canRename: true, role: a.role, logins: a.logins.map((l) => l.p), passkeys: a.passkeys.length, providers: enabledProviders(L), resets: resetsOn(L), email: !!pwl, verified: !!(pwl && pwl.vf), news: nw ? news.masked(nw) : '', ga: L.gaMeasurementId || '', devOpen: !!L.devOpen, age17: a.age17 || 0, claim: accounts.claimOpen && !accounts.ownerExists() };
  }
  const sendAcct = (p) => { if (p.conn) p.conn.sendJSON(acctState(p)); };
  const METHOD = { google: 'Google', discord: 'Discord', password: 'your email and password', passkey: 'a passkey' };

  // guests can't start or lead a crew, nor post a bounty - while a sign-in is on offer (with email + password on, it
  // always is: CLA_PASSWORDS=0 and no provider keys bring back the open game of before)
  const signInOffered = () => Object.values(enabledProviders(L)).some(Boolean);
  const guestLimited = (p) => !!p && signInOffered() && accounts.isGuest(p.pid);
  crews.setPolicy({ limited: guestLimited });
  bounties.setPolicy({ limited: guestLimited });

  // ---- names (the owner, 11-12): guests pick and change theirs, but never one a member owns - nor its lookalike
  // (shared/names.js lookKey: case, separators and the usual digit swaps aside). A member's name is theirs: one they
  // pick that only guests hold is taken from those guests (each back to a Guest number, told why). A guest who signs up
  // or links keeps their name unless a member owns it - and from then on it's protected. ----
  const isMember = (q) => !!(q && q.acct && q.acct.kind === 'member');
  function memberOwns(name, except) { const k = lookKey(name); for (const q of store.all()) if (q.pid !== except && isMember(q) && lookKey(q.name) === k) return true; return false; }
  const guestsHolding = (name, except) => { const k = lookKey(name), out = []; for (const q of store.all()) if (q.pid !== except && !isMember(q) && lookKey(q.name) === k) out.push(q); return out; };
  function guestNumber() {
    const taken = new Set(); for (const q of store.all()) taken.add(String(q.name).toLowerCase());
    for (let i = 0; i < 50; i++) { const n = 'Guest' + String(1000 + Math.floor(Math.random() * 9000)); if (!taken.has(n.toLowerCase())) return n; }
    return 'Guest' + String(Date.now()).slice(-6);
  }
  // a profile's name given back for a Guest number (online: over their head at once, and told why)
  function toGuestNumber(prof, why) {
    const was = prof.name, n = guestNumber();
    prof.name = n;
    const q = world.players.get(prof.pid);
    if (q) { q.name = n; if (q.ped) { q.ped.name = n; q.ped.appVer = (q.ped.appVer || 0) + 1; } q.meDirty = true; world.notify(q, why(n), 'warn'); sendAcct(q); }
    note(prof.acct, 'name', `${was} -> ${n} (${q ? 'online' : 'offline'}: a member's name)`);
    store.touch();
  }
  // a guest became a member (linked a sign-in): over their head in white now; their name kept unless a member has it
  function becameMember(pid) {
    const prof = store.get(pid);
    if (!prof) return;
    const p = onlineOf(pid);
    if (p) { p.guest = false; if (p.ped) p.ped.appVer = (p.ped.appVer || 0) + 1; }
    if (/^Guest\d+$/.test(prof.name)) return;
    if (memberOwns(prof.name, pid)) { toGuestNumber(prof, (n) => `Another member owns that name - you're ${n} for now. Pick a username in Settings, Account.`); return; }
    for (const q of guestsHolding(prof.name, pid)) toGuestNumber(q, (n) => `A signed-in player owns that name now - you're ${n}. Pick another in Settings, Account (or sign in to keep a name of your own).`);
  }
  function rename(p, raw) {
    const a = accounts.get(p.pid), member = a.kind === 'member';
    const r = cleanName(raw);
    if (r.err) return r.err;
    if (!loadFilter().nameOk(r.name)) return 'Pick another name.';
    if (member && a.username && a.nameAt && now() - a.nameAt < USERNAME_GAP_DAYS * 86400e3) return `You can change your username again in ${Math.ceil((a.nameAt + USERNAME_GAP_DAYS * 86400e3 - now()) / 86400e3)} days.`;
    if (!member && lookKey(r.name) !== lookKey(p.name) && memberOwns(r.name, p.pid)) return `${r.name} belongs to a signed-in player - pick another, or sign in to keep a name of your own.`;
    const yieldTo = member ? guestsHolding(r.name, p.pid) : [];
    const before = p.name;
    if (!players.rename(world, p, r.name, { yields: (q) => yieldTo.includes(q) })) return 'That name didn\'t go through - try again in a moment, or pick another.';   // (players.rename noted why)
    if (p.name !== before) for (const q of yieldTo) toGuestNumber(q, (n) => `A signed-in player took the name ${r.name} - you're ${n} now. Pick another in Settings, Account (or sign in to keep a name of your own).`);
    if (member && (p.name !== before || !a.username)) { a.username = true; a.nameAt = now(); store.touch(); }
    if (p.name !== before) note(a, 'name', `${before} -> ${p.name}`);
    return null;
  }
  // game news by email (Settings, Account; members): on with an address (theirs to give - Google and Discord are asked
  // for nothing more), off at once
  const newsRl = createRateLimiter(now);
  function setNews(p, msg) {
    const a = accounts.get(p.pid);
    if (a.kind !== 'member') return 'Sign in first - news goes to accounts.';
    if (!newsRl.hit(`news:${p.pid}`, 10, 3600e3)) return 'Too many changes - try again later.';
    if (!msg.on) { if (news.optOutPid(p.pid)) note(a, 'news', 'off'); return null; }
    const email = normEmail(msg.email);
    if (!email) return 'That doesn\'t look like an email address.';
    news.optIn(email, 'settings', p.pid);
    note(a, 'news', 'on');
    return null;
  }

  const hooks = {
    join(p, hello = {}, res = {}) {
      const a = accounts.ensure(p.profile);
      p.acct = a;
      p.guest = a.kind !== 'member';   // (over their head in grey, "Guest" in the players list: net.js gu, devmode.js)
      accounts.noteDevice(p.pid, hello.dm);
      if (hello.age17 && !a.age17) { a.age17 = now(); store.touch(); }
      watch(world, p);
      analytics.sessionStart(p, a);
      note(a, 'join', `session (${a.kind})`);
      sendAcct(p);
      chat.onJoin(world, p);
      if (res.note === 'moved') world.notify(p, 'Your old character moved to another device (a transfer code), so this is a new guest.', 'warn');
    },
    leave(p) { settle(world, onMoney); release(p); analytics.sessionEnd(p); ga.clear(p); },
    allow(p, t) { return ac.allow(p, t); },
    input(p) { return ac.input(p); },
    // (and the device's class and browser on the player, in memory only: the staff's Players page - server/staffplayers.js)
    perf(c, p) { analytics.perf(c); if (p && c.stage !== 'play') { const b = browserOf(c.ua); p.device = `${deviceClass(c)} · ${b ? b.name : 'a browser'}`; } },
    error(p, where) { analytics.event('error', p, { where: String(where || 'page').slice(0, 20) }); },
    devCommand(p, c, msg) { admin.devCommand(p, c, msg); },
    // a message for the launch foundation: undefined when it isn't one (session.js goes on routing it)
    message(p, msg) {
      const t = msg.t;
      if (t === 'chat' || t === 'emote' || t === 'chatset' || t === 'mod' || t === 'contacts' || t === 'inbox') return chat.handle(world, p, msg);
      if (t === 'admin') return admin.handle(world, p, msg);
      if (t === 'name') { const err = rename(p, msg.name); if (err) world.notify(p, err, 'warn'); else sendAcct(p); return null; }
      if (t === 'acct') {
        const a = accounts.get(p.pid);
        if (msg.a === 'state') return acctState(p);
        if (msg.a === 'transfer') { const x = accounts.makeTransfer(p.pid); note(a, 'transfer', 'made a transfer code'); return { t: 'acct', a: 'transfer', code: x.code, exp: x.exp, guest: a.kind !== 'member' }; }
        if (msg.a === 'name') { const err = rename(p, msg.name); return { t: 'acct', a: 'name', ok: !err, err: err || undefined, name: p.name }; }
        if (msg.a === 'age') { if (!a.age17) { a.age17 = now(); store.touch(); } return null; }
        if (msg.a === 'news') { const err = setNews(p, msg); if (!err) sendAcct(p); return { t: 'acct', a: 'news', ok: !err, err: err || undefined }; }
        return null;
      }
      if (t === 'ftue') { if (typeof msg.s === 'string') analytics.ftue(p, p.acct, msg.s, true); return null; }
      if (t === 'ga') { if (msg.on && ga.setClient(p, msg.cid, msg.sid)) { /* consent given: server events go to GA */ } else ga.clear(p); return null; }
      if (Object.hasOwn(LEISURE, t)) {
        const k = LEISURE[t], last = (p.anLeisure ||= {});
        if (now() - (last[k] || 0) > 5 * 60e3) { last[k] = now(); analytics.event('leisure', p, { type: t === 'arcade' && msg.id ? `arcade:${String(msg.id).slice(0, 20)}` : k }); }
      }
      return undefined;
    },
  };

  // what the world reports (law.js crime, players.js onPedDeath, crews.js accept)
  world.track = (kind, p, d = {}) => {
    if (!p) return;
    if (kind === 'crime') { analytics.event('crime', p, { type: d.type }); note(p.acct, 'crime', d.type); }
    else if (kind === 'death') { analytics.event('death', p, { cause: d.cause, killer: d.killer }); note(p.acct, 'death', String(d.cause || '').slice(0, 80)); }
    else if (kind === 'crewed' && d.other) chat.addContact(p, d.other, 'crew');
    else if (kind === 'ftue') analytics.ftue(p, p.acct, d.step);
    else if (kind === 'rank') { analytics.event('rank', p, { career: d.career, rank: d.rank }); note(p.acct, 'rank', `${d.career} ${d.rank}`); }   // (careers.js rankUp)   // (the first-time experience's funnel: systems/ftue.js)
  };

  function onMoney(p, src, net, opt) {
    analytics.money(p, src, net, opt);
    careers.onMoney(world, p, src, net);   // (clean money: business XP and the goals - careers.js)
    if (net > 0 && src !== 'dev') p.anEarnTotal = (p.anEarnTotal || 0) + net;
    if (p.sess && src !== 'dev') { if (net > 0) p.sess.earned += net; else p.sess.spent -= net; }   // (the safe exit's summary: players.js sessionSummary)
    const a = p.acct;
    if (Math.abs(net) >= 1) note(a, net > 0 ? 'earn' : 'spend', `${net > 0 ? '+' : '-'}$${Math.abs(Math.round(net))} ${src}${opt ? ' ' + String(opt).slice(0, 30) : ''}`);
    if (net < 0 && src.startsWith('shop:')) { notePurchase(a, -net, `${src.slice(5)}${opt ? ' ' + String(opt).slice(0, 30) : ''}`); analytics.event('purchase', p, { what: src.slice(5) }); }
  }
  function jobsTick() {
    for (const p of world.players.values()) {
      const cur = p.job ? p.job.type || 'job' : null;
      if (cur === (p.anJob || null)) continue;
      if (p.anJob) { const earned = (p.anEarnTotal || 0) - (p.anJobEarn0 || 0); if (earned > 0) analytics.event('job_done', p, { type: p.anJob, earned }); }
      p.anJob = cur;
      p.anJobEarn0 = p.anEarnTotal || 0;
      if (cur) analytics.event('job_start', p, { type: cur });
    }
  }
  // the timers (none in tests unless asked): audits twice a second, contacts and jobs each second, analytics a minute
  const timers = [];
  let ticks = 0;
  function halfSecond() {
    try { halfSecondBody(); } catch (e) { log.error('[launch] the half-second work failed:', e && e.message); }
  }
  function halfSecondBody() {
    settle(world, onMoney);
    ac.audit(world);
    if (++ticks % 2 === 0) { jobsTick(); chat.update(world, 1); }
    if (ticks % 120 === 0) analytics.minute(world);
    if (ticks % 600 === 0) { analytics.concurrency([...world.players.values()].filter((p) => p.conn).length); accounts.sweep(); }
    if (ticks % 120 === 60) analytics.save();
  }
  function start() {
    timers.push(setInterval(halfSecond, 500));
    timers.push(setInterval(() => { ga.flush().catch(() => {}); }, 10e3));
    for (const t of timers) t.unref();
  }
  // at shutdown (index.js SIGTERM / SIGINT): the money settled, the analytics and the admin log's queued lines written now
  function stop() {
    for (const t of timers) clearInterval(t);
    timers.length = 0;
    try { settle(world, onMoney); } catch (e) { log.error('[launch] settling at stop:', e && e.message); }
    try { adminLog.flushSync(); } catch (e) { log.error('[launch] the admin log at stop:', e && e.message); }
    analytics.save();
  }

  const legal = legalHttp({ launch: L, ga: () => !!L.gaMeasurementId });
  async function http(req, res, url) {
    if (legal(req, res, url)) return true;
    if (await authHttp.handle(req, res, url)) return true;
    if (await adminHttp.handle(req, res, url)) return true;
    return false;
  }
  return { login, hooks, http, start, stop, halfSecond, accounts, news, rename, memberOwns, onLinked: becameMember, adminLog, mod, chat, ac, analytics, ga, admin, authHttp, adminHttp, acctState, onMoney, jobsTick, save: () => analytics.save() };
}
