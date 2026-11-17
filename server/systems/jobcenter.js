// The Employment Center (the owner, 11-16: "even having the 'office work' or employment center options in the city so
// we can send beta players that way"; the place: shared/world3-jobcenter.js, across Park West Avenue from the city's
// arrival). Two counters inside:
//   - the front desk (poi kind 'jobcenter'): office work - a round of OFFICE.items quick desk tasks on the menu kit the
//     counters use (economy.js), one kind a round: sort the mail (the tray by the addressee's surname), type up an
//     invoice (its total), put a call through (the department). One right answer of OFFICE.opts; each right one
//     OFFICE.pay, OFFICE.bonus more for a clean round; a round lasts at most OFFICE.roundS s and the next starts
//     OFFICE.roundS s after the last began (a modest, safe wage, under the riskier jobs'). Paid on the server when the
//     round ends - all answered, the time up (update), walked off or stopped - as clean money (careers.js CLEAN: business
//     XP). The tasks are made here (mulberry32 by the world); the page only shows the options and sends the one picked.
//   - the job computer (kind 'jobpc'): the work in town for you (the "What's next" cards - whatsnext.js - each a
//     waypoint), and, when the server's ads are on (CLA_ADS test | on: server/config.js, world.ads), "Watch an ad": the
//     rewarded ad of Google's H5 Games Ads (client/ads.js) - JOBAD.reward to the wallet, JOBAD.perDay a day per character.
// The ad, step by step: the menu's row carries a ticket (ad:<tk>, made when the menu is built, kept on the player); the
// page runs the ad when the row is pressed and reports { t: 'ad', a: 'start' | 'viewed' | 'done', tk, st } (session.js
// -> onAd). Paid only for 'viewed' on a live ticket that was started at least JOBAD.minS s before and handed out under
// JOBAD.maxS s before, within the day's cap, with ads on - then the ticket's gone (one ad, one reward). Nothing for a
// dismissed ad, no ad, a ticket made up or used twice. Guests too (most beta players are guests; it's opt-in and capped
// per character, and offered only after JOBAD.playS s played - none in a first session). Each view is logged (world.track
// 'ad': the analytics and the account's notes) and its money noted as 'msg:ad'.
//   profile.office { n (rounds), right (tasks right, all told) }; profile.ads { d (the goals' day: goals.dayKey), n (paid
//   that day), all (paid ever) } - both absent on older profiles (defaults)
// The Guide's entries: shared/guide.js (places 'jobcenter', earn 'office', activities 'jobpc').
import { randomBytes } from 'node:crypto';
import { OFFICE, JOBAD, GOALS } from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';

// ("What's next" - whatsnext.js - sits deep in the systems' import cycles: reached from here first, it would run before
// biz.js hands it its hooks; so it's fetched once everything has loaded, and its card source registered then)
let whatsnext = null;
import('./whatsnext.js').then((m) => { whatsnext = m; m.registerCardSource('jobcenter', jobCard, { slot: 'near' }); }).catch((e) => console.error('[jobcenter] whatsnext', e));
// the goals' day (goals.js dayKey: it turns for everyone at GOALS.resetUtcH:00 UTC)
const dayKey = (ms) => Math.floor((ms - GOALS.resetUtcH * 3600e3) / 86400e3);

export const KINDS = ['jobcenter', 'jobpc'];
export const isJobPoi = (poi) => !!poi && KINDS.includes(poi.kind);
const rng = mulberry32(4471);
const pick = (l) => l[Math.floor(rng() * l.length)];
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const nowMs = (world) => (world.nowMs ? world.nowMs() : Date.now());
// ads on: 'test' (Google's test ads) or 'on'; a test world sets world.ads itself
export const adsMode = (world) => (world.ads && (world.ads.mode === 'test' || world.ads.mode === 'on') ? world.ads.mode : 'off');

// ---- the desk's tasks ---------------------------------------------------------------------------------------------------
const TRAYS = ['A - F', 'G - L', 'M - R', 'S - Z'];
const SURNAMES = ['Abara', 'Bishop', 'Castillo', 'Delgado', 'Ellis', 'Fontaine', 'Garza', 'Hale', 'Ibarra', 'Jensen', 'Kowalski', 'Lindqvist', 'Moreau', 'Nakamura', 'Okafor', 'Petrov', 'Quinn', 'Rossi', 'Sato', 'Tran', 'Ueda', 'Vance', 'Whitaker', 'Young', 'Zamora'];
const INITIALS = 'ABCDEFGHJKLMNPRSTW';
const TITLES = ['Mr.', 'Ms.', 'Dr.', 'Mx.'];
const GOODS = [['boxes of paper', 6, 18], ['desk lamps', 14, 32], ['crates of oranges', 9, 22], ['tires', 40, 90], ['office chairs', 45, 120], ['cases of soda', 8, 16], ['toner cartridges', 25, 60], ['bags of cement', 7, 14]];
const DEPTS = ['Sales', 'Billing', 'Repairs', 'Lost and found'];
const CALLS = [
  ['"I\'d like to buy forty desks for my new office."', 0], ['"Do you do a discount if I order in bulk?"', 0], ['"Can someone show me your new models?"', 0],
  ['"I was charged twice this month!"', 1], ['"When is my invoice due?"', 1], ['"I want a refund for my last order."', 1],
  ['"The printer you sold me is smoking."', 2], ['"My delivery van won\'t start."', 2], ['"The lights in our showroom keep flickering."', 2],
  ['"I left my umbrella in your lobby yesterday."', 3], ['"Has anyone handed in a set of car keys?"', 3], ['"I think I dropped my phone at your front desk."', 3],
];
const ROUND = {
  mail: { title: 'Sort the mail', ask: 'Which tray?' },
  invoice: { title: 'Type up the invoices', ask: 'What\'s the total?' },
  calls: { title: 'Answer the phones', ask: 'Put it through to:' },
};
export const ROUND_KINDS = Object.keys(ROUND);
const shuffle = (l) => { for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };
// one task: { q (the line), opts [labels], ans (the right one's index) }
export function task(kind) {
  const n = OFFICE.opts;
  if (kind === 'mail') {
    const s = pick(SURNAMES), k = TRAYS.findIndex((t) => s[0] >= t[0] && s[0] <= t[t.length - 1]);
    return { q: `For ${pick(TITLES)} ${pick(INITIALS.split(''))}. ${s}`, opts: TRAYS.slice(0, n), ans: k };
  }
  if (kind === 'invoice') {
    const [what, lo, hi] = pick(GOODS), q = 2 + Math.floor(rng() * 7), each = lo + Math.floor(rng() * (hi - lo + 1)), total = q * each;
    const near = new Set([total]);
    for (const d of shuffle([each, -each, 10, -10, q, -q, 2 * each, 1])) { if (near.size >= n) break; if (total + d > 0) near.add(total + d); }
    const opts = shuffle([...near]).map(money);
    return { q: `${q} ${what} at ${money(each)} each`, opts, ans: opts.indexOf(money(total)) };
  }
  const [line, d] = pick(CALLS);
  return { q: `Caller: ${line}`, opts: DEPTS.slice(0, n), ans: d };
}

// ---- the menus ----------------------------------------------------------------------------------------------------------
const near = (world, p, poi) => !!(p.ped && !p.ped.dead && !p.ped.vehId && poi && Math.hypot(p.ped.x - poi.x, p.ped.y - poi.y) <= (poi.r || 40) + 60);
const cashOf = (p) => ({ cash: p.profile.cash, bank: p.profile.bank });
export function label(world, p, poi) {
  if (poi.kind === 'jobpc') return 'Use the job computer';
  return p.office ? `Back to your desk - ${ROUND[p.office.kind].title.toLowerCase()}` : `Talk to the front desk - ${poi.label}`;
}
export function menu(world, p, poi) {
  if (poi.kind === 'jobpc') return pcMenu(world, p, poi);
  const R = p.office;
  if (R && R.poi === poi.id) return taskMenu(world, p, poi, R);
  const wait = waitOf(world, p), best = OFFICE.items * OFFICE.pay + OFFICE.bonus, rec = p.profile.office;
  const opts = [{ id: 'of:start', label: wait > 0 ? `Office work - the next batch in ${wait}s` : 'Office work - start a round', note: `${OFFICE.items} quick tasks, ${money(OFFICE.pay)} each right, up to ${money(best)} a round`, dis: wait > 0 }];
  opts.push({ id: 'close', label: 'Leave' });
  const sub = `Honest work, paid by the round: sort the mail, type up invoices, answer the phones. The job computers by the window list the rest of the work in town.${rec && rec.n ? ` Rounds you've done here: ${rec.n}.` : ''}`;
  return { t: 'menu', poi: poi.id, title: poi.label, sub, opts, ...cashOf(p) };
}
function taskMenu(world, p, poi, R) {
  const T = R.tasks[R.i], left = Math.max(0, Math.ceil(R.end - world.time));
  const opts = T.opts.map((o, k) => ({ id: `of:${k}`, label: o }));
  opts.push({ id: 'of:stop', label: 'Stop - paid for what\'s right' });
  return { t: 'menu', poi: poi.id, title: `${ROUND[R.kind].title} - ${R.i + 1} of ${R.tasks.length}`, sub: `${T.q}. ${ROUND[R.kind].ask} (${R.right} right so far, ${left}s left)`, opts, ...cashOf(p) };
}
// the job computer: the work near you, and the ad when ads are on
function pcMenu(world, p, poi) {
  const opts = [];
  let cards = [];
  try { cards = whatsnext && whatsnext.appOn(p) ? whatsnext.refresh(world, p) || [] : []; } catch { cards = []; }
  for (const c of cards) opts.push({ id: `jl:${c.id}`, label: c.title, note: [c.pay ? `about ${money(c.pay)}` : '', c.sub || ''].filter(Boolean).join(' · ').slice(0, 90) });
  const ad = adRow(world, p);
  if (ad) opts.push(ad);
  opts.push({ id: 'close', label: 'Log off' });
  const sub = cards.length ? 'Work in town that suits you - pick one to put it on your map. Your phone\'s Jobs app has the full board.' : 'Your phone\'s Jobs app has the full board of work in town.';
  return { t: 'menu', poi: poi.id, title: 'Job computer', sub, opts, ...cashOf(p), ...(ad && !ad.dis ? { ad: { mode: adsMode(world), client: world.ads.client || '', tk: p.adTk.tk } } : null) };
}
// the ad's row, or null (ads off, not yet - a first session, the day's all used)
export function adState(world, p) {
  if (adsMode(world) === 'off') return { ok: false, why: 'off' };
  const f = p.profile.ftue, played = f ? f.pt || 0 : 0;
  if (played < JOBAD.playS) return { ok: false, why: 'new' };
  const A = p.profile.ads, n = A && A.d === dayKey(nowMs(world)) ? A.n || 0 : 0;   // (only read: saved once an ad's paid)
  if (n >= JOBAD.perDay) return { ok: false, why: 'cap', left: 0 };
  return { ok: true, left: JOBAD.perDay - n };
}
function adRow(world, p) {
  const s = adState(world, p);
  if (!s.ok && s.why !== 'cap') return null;
  if (!s.ok) return { id: 'ad:none', label: `Watch an ad - back tomorrow`, note: `all ${JOBAD.perDay} watched today`, dis: true };
  ticket(world, p);
  return { id: `ad:${p.adTk.tk}`, label: `Watch an ad for ${money(JOBAD.reward)}`, note: `paid to your wallet when it ends · ${s.left} of ${JOBAD.perDay} left today`, shut: true };
}
// the day's count (the goals' day: it turns for everyone at the same hour)
function adsOf(world, p) {
  const d = dayKey(nowMs(world)), A = (p.profile.ads ||= { d, n: 0, all: 0 });
  if (A.d !== d) { A.d = d; A.n = 0; }
  return A;
}
// the player's live ticket: made with the menu, kept until it's used or too old
function ticket(world, p) {
  if (p.adTk && world.time - p.adTk.made < JOBAD.maxS) return p.adTk;
  p.adTk = { tk: randomBytes(9).toString('hex'), made: world.time, at: 0 };
  return p.adTk;
}

// ---- the page's picks (economy.js handleMenu asks here first) -----------------------------------------------------------
export function onMenu(world, p, poiId, opt) {
  const poi = world.map.pois[poiId];
  if (!isJobPoi(poi)) {
    if (p.office && opt === 'close') { end(world, p, 'stop'); return false; }
    return false;
  }
  const send = (m) => { if (p.conn) p.conn.sendJSON(m); };
  if (opt === 'close') { if (p.office) end(world, p, 'stop'); return true; }
  if (!near(world, p, poi)) { world.notify(p, 'You walked away from the desk.', 'warn'); if (p.office) end(world, p, 'away'); return true; }
  if (poi.kind === 'jobpc') {
    if (opt.startsWith('jl:')) {
      const r = whatsnext ? whatsnext.handle(world, p, { a: 'nextgo', id: opt.slice(3) }) : null;
      if (r && r.err) world.notify(p, r.err, 'warn');
      else if (r && r.way) { send({ t: 'ftue', a: 'mark', x: r.way.x, y: r.way.y, label: r.way.label }); world.notify(p, `${r.way.label} - it's on your map.`, 'info'); }
      send(menu(world, p, poi));
      return true;
    }
    // (an ad row the page couldn't play - no ad script on it: the computer again)
    send(menu(world, p, poi));
    return true;
  }
  if (opt === 'of:start') { const err = start(world, p, poi); if (err) world.notify(p, err, 'warn'); send(menu(world, p, poi)); return true; }
  if (opt === 'of:stop') { end(world, p, 'stop'); send(menu(world, p, poi)); return true; }
  const m = /^of:(\d)$/.exec(opt), R = p.office;
  if (!m || !R || R.poi !== poi.id) { send(menu(world, p, poi)); return true; }
  if (world.time > R.end) { end(world, p, 'time'); send(menu(world, p, poi)); return true; }
  if (Number(m[1]) === R.tasks[R.i].ans) R.right++;
  R.i++;
  if (R.i >= R.tasks.length) { end(world, p, 'done'); send(menu(world, p, poi)); return true; }
  send(menu(world, p, poi));
  return true;
}
const waitOf = (world, p) => Math.max(0, Math.ceil((p.officeAt ?? -1e9) + OFFICE.roundS - world.time));
export function start(world, p, poi) {
  if (p.office) return null;
  if (p.job) return 'Finish or quit your job first.';
  const w = waitOf(world, p);
  if (w > 0) return `The next batch comes in ${w}s.`;
  const rec = (p.profile.office ||= { n: 0, right: 0 });
  const kind = ROUND_KINDS[rec.n % ROUND_KINDS.length];
  const tasks = [];
  for (let i = 0; i < OFFICE.items; i++) tasks.push(task(kind));
  p.office = { poi: poi.id, kind, tasks, i: 0, right: 0, t0: world.time, end: world.time + OFFICE.roundS };
  p.officeAt = world.time;
  return null;
}
// the round over: paid for what's right (a clean round's bonus), the record kept -> the pay
export function end(world, p, why) {
  const R = p.office;
  if (!R) return 0;
  p.office = null;
  const clean = R.right === R.tasks.length, pay = R.right * OFFICE.pay + (clean ? OFFICE.bonus : 0);
  const rec = (p.profile.office ||= { n: 0, right: 0 });
  rec.n++; rec.right += R.right;
  if (pay > 0) p.profile.cash += pay;
  store.touch(); p.meDirty = true;
  const what = `${R.right} of ${R.tasks.length} right`;
  world.notify(p, pay > 0 ? `Office work: ${what} - +${money(pay)}${clean ? ' (a clean round)' : ''}.` : `Office work: ${what} - nothing earned this round.`, pay > 0 ? 'good' : 'info');
  if (world.track) world.track('office', p, { right: R.right, pay, why });
  return pay;
}

// ---- the ad (session.js: { t: 'ad', a, tk, st }) -----------------------------------------------------------------------
export function onAd(world, p, msg) {
  const a = String(msg.a || ''), tk = String(msg.tk || ''), T = p.adTk;
  const live = !!T && T.tk === tk && tk.length > 0 && world.time - T.made <= JOBAD.maxS;
  if (a === 'start') { if (live && !T.at) T.at = world.time; return null; }
  if (a === 'done') {
    if (world.track) world.track('ad', p, { st: String(msg.st || '').slice(0, 20) || 'done' });
    if (live) p.adTk = null;   // (the break over - watched and paid, closed early or no ad at all: a fresh ticket next time)
    return null;
  }
  if (a === 'viewed') grant(world, p, live);
  return null;
}
// the reward for a view the page says ran to its end: only on a live ticket that was started, long enough ago, under the
// day's cap, with ads on -> true when paid
export function grant(world, p, live) {
  const T = p.adTk;
  if (adsMode(world) === 'off' || !live || !T || !T.at || world.time - T.at < JOBAD.minS) { if (world.track) world.track('ad', p, { st: 'refused' }); return false; }
  p.adTk = null;   // (one ticket, one reward)
  const s = adState(world, p);
  if (!s.ok) { world.notify(p, s.why === 'cap' ? `That's all ${JOBAD.perDay} for today - thanks for watching.` : 'Not yet.', 'info'); return false; }
  const A = adsOf(world, p);
  A.n++; A.all = (A.all || 0) + 1;
  p.profile.cash += JOBAD.reward;
  store.touch(); p.meDirty = true;
  world.notify(p, `+${money(JOBAD.reward)} for watching - thanks for supporting the game. (${JOBAD.perDay - A.n} left today)`, 'good');
  if (world.track) world.track('ad', p, { st: 'paid', n: A.n });
  return true;
}

// ---- each second: a round's time up, a desk walked away from ------------------------------------------------------------
export function update(world) {
  if (world.tick % 20 !== 11) return;
  for (const p of world.players.values()) {
    const R = p.office;
    if (!R) continue;
    const poi = world.map.pois[R.poi];
    if (!p.conn || !p.ped || p.ped.dead || world.time > R.end) { end(world, p, 'time'); if (p.conn && poi && near(world, p, poi)) p.conn.sendJSON(menu(world, p, poi)); continue; }
    if (!near(world, p, poi)) end(world, p, 'away');
  }
}

// ---- the "What's next" card: office work at the Employment Center, for a character still finding its feet -------------
function jobCard(world, p) {
  const poi = (world.map.pois || []).find((q) => q && q.kind === 'jobcenter');
  if (!poi || p.job) return [];
  const rec = p.profile.office;
  if (rec && rec.n >= 6) return [];   // (once you've the hang of it: the card makes room for the rest)
  return [{ id: 'jobcenter:office', career: 'business', act: 'office', icon: 'jobs', title: `Office work at the ${poi.label}`, sub: 'Quick desk rounds - safe, steady pay.', x: poi.x, y: poi.y, pay: OFFICE.items * OFFICE.pay + OFFICE.bonus, mins: 2 }];
}
