// The "What's next" phone app (docs/PROGRESSION.md; the numbers: shared/rules.js NEXT; the page: client/whatsnext.js).
// Always three cards, picked on the server for your rank, path and place: one from your main career, one from today's
// goals (server/systems/goals.js), one happening near you - each with one button (a waypoint, a call to the contact, or
// accept). Ranked by fit to your careers, distance, novelty and pay per time (score); a card skipped NEXT.skipDrop times
// is gone for the day; every NEXT.novelEvery-th card shown is something you've never tried. Above them each career's rank
// bar and its next unlock (careers.js rankInfo), below them the goals. On the HUD: a dot on the phone when the cards
// change (the self record's nx - players.js buildMe) and, the first time each session, one fading line (client/ftue.js).
// It takes over when the first-time experience is done (profile.ftue.st 'done': ftue.js finish - after its third step,
// or skipped).
//
// Cards come from a registry of sources, so later features plug in: registerCardSource(name, fn, { slot }) - fn(world,
// p, now) -> [card] (now: Date.now()). The event calendar wires in as
//     registerCardSource('events', (world, p, now) => eventCards(p, now), { slot: 'near' })
// A card (what a source returns; everything but accept goes to the page):
//   { id      string, stable while it's the same offer (skips are counted by it) - prefix it with the source's name
//     slot    'career' | 'goal' | 'near' (the source's own unless it says)
//     career  'crime' | 'police' | 'business' | null (who it's for: the fit)
//     act     what doing it counts as having tried (careers.js note: an event's name, a job's type) - the novelty
//     title, sub   one line each; who: the contact's name, if a contact is offering it; icon: a client/touchicons.js name
//     x, y    where (px), if anywhere: the distance, the waypoint
//     pay     about how many $ it's worth; mins: about how many minutes it takes (with the trip there)
//     until   world.time (s) it's gone after; novel: true - never tried (set from act when absent); fit: 0..1 to override
//     btn     { k: 'way' | 'call' | 'accept', label } - way: the waypoint; call: the contact says `call` (and the
//             waypoint, if x/y); accept: accept(world, p) -> null | why not (on the server only) }
// The page's messages ({ t: 'phone', a }): next (the app's state), nextgo { id } (a card's button), nextskip { id },
// nextmain { c } (lead with this career), reroll { i } (a daily goal) - each answered with the state, { t: 'next' }.
import { NEXT, CAREERS, CAREER_KEYS, GOALS, HOT_FENCE_CUT } from '../../shared/rules.js';
import { EVENT_KINDS } from '../../shared/worldevents.js';
import { store } from '../store.js';
import * as careers from './careers.js';
import * as goals from './goals.js';
import * as phone from './phone.js';
import * as biz from './biz.js';

const SOURCES = new Map();
export function registerCardSource(name, fn, opts = {}) { SOURCES.set(name, { fn, slot: opts.slot || 'career' }); }
export const sources = () => [...SOURCES.keys()];
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const meters = (d) => (d >= 32000 ? `${(d / 32000).toFixed(1)} km` : `${Math.round(d / 32)} m`);
export const appOn = (p) => !!p && !!p.profile && (!p.profile.ftue || p.profile.ftue.st === 'done');
const posOf = (world, p) => { const ped = p.ped, v = ped && ped.vehId ? world.get(ped.vehId) : null; return v || ped || null; };

// the places by kind, kept once per map
function placesOf(world, kinds) {
  const by = (world._nxPois ||= new Map());
  if (!by.size) for (const q of world.map.pois || []) { if (!q || !q.kind) continue; let l = by.get(q.kind); if (!l) by.set(q.kind, (l = [])); l.push(q); }
  return kinds.flatMap((k) => by.get(k) || []);
}
export function nearest(world, at, kinds) {
  if (!at) return null;
  let best = null, bd = Infinity;
  for (const q of placesOf(world, kinds)) { const d = (q.x - at.x) ** 2 + (q.y - at.y) ** 2; if (d < bd) { bd = d; best = q; } }
  return best;
}

// ---- ranking ------------------------------------------------------------------------------------------------------------
// ctx: { main, at ({ x, y } or null), tried (act -> 1), skips (id -> n) }
export function score(c, ctx) {
  const W = NEXT.w;
  const fit = c.fit ?? (c.career === ctx.main ? 1 : c.career ? 0.5 : NEXT.fitAny);
  const d = ctx.at && Number.isFinite(c.x) ? Math.hypot(c.x - ctx.at.x, c.y - ctx.at.y) : null;
  const near = d === null ? 0.5 : 1 / (1 + d / NEXT.distPx);
  const novel = c.novel ?? (c.act ? !(ctx.tried && ctx.tried[c.act]) : false);
  const mins = Math.max(1, c.mins || (2 + (d || 0) / 1500));
  const pay = c.pay ? Math.min(1, c.pay / mins / NEXT.payMin) : 0;
  const skipped = (ctx.skips && ctx.skips[c.id]) || 0;
  return W.fit * fit + W.dist * near + W.novel * (novel ? 1 : 0) + W.pay * pay - 0.3 * skipped;
}
// The three: the best of each slot ('career', 'goal', 'near') not dropped (skipped skipDrop times today); a slot with
// none takes the best card left of another (not a goal). Every novelEvery-th new card shown in the career or near slot
// is the best never-tried one (state.shown counts them; state.last: the ids shown last time).
export function pickThree(cands, ctx, state) {
  const live = cands.filter((c) => ((ctx.skips && ctx.skips[c.id]) || 0) < NEXT.skipDrop);
  for (const c of live) { c.s = score(c, ctx); if (c.novel === undefined) c.novel = !!(c.act && !(ctx.tried && ctx.tried[c.act])); }
  live.sort((a, b) => b.s - a.s);
  const used = new Set(), out = [];
  const take = (c) => { used.add(c.id); out.push(c); return c; };
  for (const slot of ['career', 'goal', 'near']) {
    let c = live.find((q) => q.slot === slot && !used.has(q.id)) || (slot !== 'goal' ? live.find((q) => q.slot !== 'goal' && !used.has(q.id)) : null);
    if (!c) continue;
    if (slot !== 'goal' && !(state.last || []).includes(c.id)) {
      state.shown = (state.shown || 0) + 1;
      if (state.shown % NEXT.novelEvery === 0) { const nv = live.find((q) => q.novel && q.slot !== 'goal' && !used.has(q.id)); if (nv) c = nv; }
    }
    take(c);
  }
  state.last = out.map((c) => c.id);
  return out;
}

// ---- the sources --------------------------------------------------------------------------------------------------------
// the career cards: what your careers' contacts would have you do now, from what the game has (contacts' missions come
// with build step 3 - their own source)
function careerCards(world, p) {
  const prof = p.profile, at = posOf(world, p), out = [];
  if (!at) return out;
  const R = (c) => careers.careerRank(p, c), who = (c) => careers.contactOf(c, R(c));
  // crime: fence the hot money on you; a store's till; a car to boost; a vault
  const hot = prof.hot || 0;
  if (hot > 0) { const f = nearest(world, at, ['fence', 'pawn']); if (f) out.push({ id: `career:fence:${f.id}`, career: 'crime', act: 'fence', who: who('crime'), icon: 'money', title: `${who('crime')}: clean that ${money(hot)}`, sub: `${f.label} takes it for a cut`, x: f.x, y: f.y, pay: hot * (1 - careers.fenceCut(p, HOT_FENCE_CUT)), mins: 4, btn: { k: 'way', label: 'Waypoint' } }); }
  else {
    const s = nearest(world, at, ['convenience', 'gasstation']);
    if (s) out.push({ id: `career:rob:${s.id}`, career: 'crime', act: 'rob', who: who('crime'), icon: 'rob', title: `${who('crime')} has a tip: ${s.label}`, sub: 'The till\'s full. Gun on the clerk, then lose the heat.', x: s.x, y: s.y, pay: 500, mins: 6, btn: { k: 'call', label: `Call ${who('crime').replace(/"/g, '')}` }, call: `${s.label}. In, gun on the clerk, out before the alarm. Then lie low.` });
    if (R('crime') >= 3) { const b = nearest(world, at, ['bank']); if (b) out.push({ id: `career:heist:${b.id}`, career: 'crime', act: 'heist', who: who('crime'), icon: 'bank', title: `${who('crime')}: the vault at ${b.label}`, sub: 'A thermal drill from the black market opens it.', x: b.x, y: b.y, pay: 6000, mins: 20, btn: { k: 'call', label: 'Call' }, call: `${b.label}'s vault. Bring a drill, bring friends if you have them - and a way out.` }); }
  }
  out.push({ id: 'career:boost', career: 'crime', act: 'theft', who: who('crime'), icon: 'steal', title: `${who('crime')}: boost something nice`, sub: 'Steal a car and shake the police.', pay: 250, mins: 5, btn: { k: 'call', label: 'Call' }, call: 'Grab a car - something with an engine worth hearing. Let them chase you, then lose them.' });
  // police: the badge, or the way to one; on duty, the patrol calls and the reports on your map
  if (!p.badge) {
    const st = nearest(world, at, ['police']), lock = careers.dutyLock(p);
    if (st && goals.copFit(p) && !lock && !(p.wanted > 0)) out.push({ id: `career:duty:${st.id}`, career: 'police', act: 'duty', who: who('police'), icon: 'siren', title: `${who('police')}: we're short a unit`, sub: `Pick up a badge at ${st.label}`, x: st.x, y: st.y, pay: 300, mins: 10, btn: { k: 'way', label: 'Waypoint' } });
    else if (!goals.copFit(p)) out.push({ id: 'career:samaritan', career: 'police', act: 'duty', who: who('police'), icon: 'friend', title: `${who('police')}: the force wants good people`, sub: 'Help people out for Samaritan points - and no felonies.', pay: 100, mins: 10, btn: { k: 'call', label: 'Call' }, call: 'Help someone up, stop a purse-snatcher, return a wallet. Show me you\'re one of the good ones, then come see me.' });
  } else {
    for (const j of world.jobBoard || []) if (j.kind === 'patrol') out.push({ id: `career:patrol:${j.id}`, career: 'police', act: 'dispatch', who: who('police'), icon: 'siren', title: `${who('police')}: a patrol call`, sub: 'Reports of trouble - find the suspect and stop them.', x: j.x, y: j.y, pay: careers.patrolPay(p, j.pay), mins: 6, btn: { k: 'accept', label: 'Take the call' }, accept: (w, q) => takeJob(w, q, j.id) });
  }
  // business: a till to empty; the job board's work
  for (const [id, e] of Object.entries(prof.biz || {})) {
    if (!e || !(e.till > 0) || e.t === 'hideout') continue;
    const s = biz.siteById(world, id);
    if (s) out.push({ id: `career:till:${id}`, career: 'business', act: 'biz', who: who('business'), icon: 'money', title: `${money(e.till)} in the till at ${s.name}`, sub: 'Go and collect the takings.', x: s.x, y: s.y, pay: e.till, mins: 3, btn: { k: 'way', label: 'Waypoint' } });
  }
  let board = null;
  try { board = phone.boardFor(world, p); } catch { board = null; }
  for (const j of (board && board.jobs) || []) {
    if (j.kind === 'patrol' || !(j.pay > 0) || !(j.x || j.y)) continue;
    const act = jobAct(j.id);
    out.push({ id: `career:job:${j.id}`, career: 'business', act, who: who('business'), icon: 'jobs', title: j.title, sub: `${j.lo ? `${money(j.lo)}-${money(j.hi)} ${j.per || ''}` : money(j.pay)}`.trim(), x: j.x, y: j.y, pay: j.pay, mins: 8, btn: { k: 'accept', label: 'Take the job' }, accept: (w, q) => takeJob(w, q, j.id) });
  }
  return out;
}
const JOB_ACT = { mailwalk: 'mail', coastair: 'coast' };
export const jobAct = (id) => (/^\d+$/.test(String(id)) ? 'courier' : JOB_ACT[id] || String(id));
function takeJob(world, p, id) {
  if (p.job) return 'You already have a job - quit it first (Phone, Jobs).';
  const r = phone.handle(world, p, { a: 'take', id });
  return r && r.err ? r.err : null;
}
// a hint from the career's contact for a goal with no place to point at
const HINT = {
  hotcar: 'Take a car where someone sees you, let it get to two stars, then lose them. Back streets, a paint shop, anywhere quiet.',
  thefts: 'Cars on the street, bikes, boats - anything with a key in it. Mind who\'s watching.',
  samaritan: 'Help someone who\'s collapsed, break up a fight, return a lost wallet - it all counts.',
  shifts: 'Any job on your phone\'s board counts: finish it and get paid.',
  clean: 'Jobs, fish, a shop\'s takings - honest money, any way you like.',
  takings: 'Your business fills its till every day you\'re in town. Go and empty it.',
};
function goalCards(world, p) {
  const G = goals.state(p), at = posOf(world, p), out = [];
  for (const g of G.list) {
    if (g.done) continue;
    const T = goals.BY_ID[g.k], c = CAREERS[g.c] ? g.c : null, who = careers.contactOf(c || careers.mainCareer(p), careers.careerRank(p, c || careers.mainCareer(p)));
    const kinds = p.badge && T.need === 'cop' ? null : T.place;
    const q = kinds ? nearest(world, at, kinds) : null;
    const card = { id: `goal:${g.k}`, slot: 'goal', career: c, title: goals.textOf(T, g.n), sub: `${g.got}/${g.n} · +${money(T.cash)}, +${T.xp} XP${q ? ` · ${q.label}` : ''}`, pay: T.cash, mins: 10, fit: 1, icon: 'star' };
    if (q) Object.assign(card, { x: q.x, y: q.y, btn: { k: 'way', label: 'Waypoint' } });
    else Object.assign(card, { who, btn: { k: 'call', label: `Ask ${who.replace(/"/g, '')}` }, call: HINT[g.k] || 'You\'ll manage. Check your map.' });
    out.push(card);
  }
  return out;
}
// what's going on near you (the HUD's happenings: events.js): a card each, fit to the careers it's for
const HAP_CAREER = { armored: 'crime', drop: 'crime', snatch: 'police', robbery: 'police', shootout: 'police', copchase: 'police', heist: 'police', bikethief: 'police' };
const HAP_PAY = { armored: 2500, drop: 1500, snatch: 100, robbery: 150, shootout: 300, copchase: 200, heist: 600, bikethief: 150, fight: 50, faint: 60, wallet: 40, pet: 80 };
function nearCards(world, p) {
  const at = posOf(world, p), out = [];
  if (!at) return out;
  for (const e of world.happenings || []) {
    const K = EVENT_KINDS[e.kind];
    if (!K || K.noArrow || e.kind === 'revive' || e.kind === 'amb' || e.pid === p.pid) continue;
    const d = Math.hypot(e.x - at.x, e.y - at.y);
    if (d > NEXT.nearPx) continue;
    out.push({ id: `near:${e.id}`, slot: 'near', career: HAP_CAREER[e.kind] || null, icon: 'eye', title: e.text || K.label, sub: K.hint, x: e.x, y: e.y, pay: HAP_PAY[e.kind] || 50, mins: 3, until: e.until, btn: { k: 'way', label: 'Waypoint' } });
  }
  return out;
}
// never tried: the side activities' places (the novelty rule's pick - one card in NEXT.novelEvery)
const NOVEL = [
  { act: 'fish', kinds: ['tackle', 'fishmarket'], title: 'Try fishing', sub: 'A rod and bait from the tackle shop, then cast off any bank.', icon: 'fish' },
  { act: 'bowl', kinds: ['bowling'], title: 'Bowl a few frames', sub: 'Rent a lane at the bowling alley.', icon: 'star' },
  { act: 'soccer', kinds: ['arena'], title: 'Play car soccer', sub: 'Join at the arena\'s gate - the city\'s drivers fill the teams.', icon: 'steal' },
  { act: 'race', kinds: ['race'], title: 'Enter a race', sub: 'Pull up to a race\'s start line.', icon: 'car' },
];
function novelCards(world, p) {
  const at = posOf(world, p), out = [];
  for (const N of NOVEL) {
    if (careers.tried(p, N.act)) continue;
    const q = nearest(world, at, N.kinds);
    if (q) out.push({ id: `novel:${N.act}`, career: null, act: N.act, novel: true, icon: N.icon, title: N.title, sub: `${N.sub} · ${q.label}`, x: q.x, y: q.y, pay: 0, mins: 10, btn: { k: 'way', label: 'Waypoint' } });
  }
  return out;
}
registerCardSource('career', careerCards, { slot: 'career' });
registerCardSource('goals', goalCards, { slot: 'goal' });
registerCardSource('happenings', nearCards, { slot: 'near' });
registerCardSource('novel', novelCards, { slot: 'career' });

// ---- per player ----------------------------------------------------------------------------------------------------------
function skipsOf(p) {
  if (!p.profile.careers) careers.migrate(p.profile);
  const C = p.profile.careers, d = goals.dayKey();
  if (!C.skip || C.skip.day !== d) C.skip = { day: d, ids: {} };
  return C.skip.ids;
}
export function candidates(world, p, now = Date.now()) {
  const out = [];
  for (const [name, S] of SOURCES) {
    let list = [];
    try { list = S.fn(world, p, now) || []; } catch (e) { if (world.opts && world.opts.throwErrors) throw e; console.error('[whatsnext] source', name, e); }
    for (const c of list) { if (!c || !c.id || !c.title) continue; if (c.until && c.until < world.time) continue; c.src = name; c.slot ||= S.slot; c.btn ||= { k: Number.isFinite(c.x) ? 'way' : 'accept', label: Number.isFinite(c.x) ? 'Waypoint' : 'Accept' }; out.push(c); }
  }
  return out;
}
// the cards worked out again: kept on the player (p.nx), the signature for the HUD's dot (p.nxSig)
export function refresh(world, p, now = Date.now()) {
  if (!appOn(p) || !p.ped) { p.nx = null; return null; }
  if (!p.profile.careers) careers.migrate(p.profile);
  const C = p.profile.careers;
  const ctx = { main: careers.mainCareer(p), at: posOf(world, p), tried: C.tried || {}, skips: skipsOf(p) };
  const st = (C.nxs ||= { shown: 0, last: [] });
  const cards = pickThree(candidates(world, p, now), ctx, st);
  p.nx = cards; p.nxAt = world.time; p.nxDirty = false;
  let h = 0;
  for (const c of cards) for (let i = 0; i < c.id.length; i++) h = (Math.imul(h, 31) + c.id.charCodeAt(i)) | 0;
  if (h !== p.nxSig) { p.nxSig = h; p.meDirty = true; }
  return cards;
}
const forPage = (world, p, c) => {
  const at = posOf(world, p), d = at && Number.isFinite(c.x) ? Math.hypot(c.x - at.x, c.y - at.y) : null;
  return { id: c.id, slot: c.slot, career: c.career || null, title: c.title, sub: c.sub || '', who: c.who || null, icon: c.icon || null, novel: c.novel ? 1 : 0, pay: c.pay ? Math.round(c.pay) : 0, d: d === null ? null : meters(d), x: Number.isFinite(c.x) ? Math.round(c.x) : null, y: Number.isFinite(c.y) ? Math.round(c.y) : null, btn: c.btn };
};
// the app's state: { t: 'next', on, main, careers: [rankInfo], cards, goals: goals.panel, calls, sig }
export function stateFor(world, p, extra = {}) {
  if (!appOn(p)) return { t: 'next', on: 0, ...extra };
  if (!p.nx || p.nxDirty || world.time - (p.nxAt || 0) > 2) refresh(world, p);
  const C = p.profile.careers;
  return {
    t: 'next', on: 1, main: careers.mainCareer(p), picked: C.main ? 1 : 0,
    careers: CAREER_KEYS.map((c) => careers.rankInfo(p, c)),
    cards: (p.nx || []).map((c) => forPage(world, p, c)),
    goals: goals.panel(p), calls: (C.calls || []).slice(0, 3).map((q) => ({ who: q.who, text: q.text, c: q.c, ago: Math.round((Date.now() - q.at) / 1000) })),
    sig: p.nxSig || 0, ...extra,
  };
}
export function handle(world, p, msg) {
  const a = String(msg.a || '');
  if (!appOn(p)) return { t: 'next', on: 0 };
  if (a === 'next') return stateFor(world, p);
  if (a === 'nextmain') { careers.setMain(p, String(msg.c || '')); refresh(world, p); return stateFor(world, p); }
  if (a === 'reroll') { const err = goals.reroll(p, Number(msg.i)); refresh(world, p); return stateFor(world, p, err ? { err } : {}); }
  const c = (p.nx || []).find((q) => q.id === String(msg.id || ''));
  if (a === 'nextskip') {
    if (!c) return stateFor(world, p);
    const S = skipsOf(p);
    S[c.id] = (S[c.id] || 0) + 1; store.touch();
    refresh(world, p);
    return stateFor(world, p);
  }
  if (a === 'nextgo') {
    if (!c) { refresh(world, p); return stateFor(world, p, { err: 'That one\'s gone - here\'s what\'s next now.' }); }
    const way = Number.isFinite(c.x) ? { x: Math.round(c.x), y: Math.round(c.y), label: c.title } : null;
    if (c.btn.k === 'accept' && c.accept) {
      const err = c.accept(world, p);
      if (err) return stateFor(world, p, { err });
      refresh(world, p);
      return stateFor(world, p, { ok: 1, way, close: 1 });
    }
    if (c.btn.k === 'call') {
      const who = c.who || careers.contactOf(careers.mainCareer(p), careers.careerRank(p, careers.mainCareer(p)));
      world.notify(p, `${who}: "${c.call || 'Keep at it.'}"`, 'info', `${who} on the phone`);
      return stateFor(world, p, { ok: 1, way, close: way ? 1 : 0 });
    }
    return stateFor(world, p, { ok: 1, way, close: 1 });
  }
  return null;
}

// Each second for a few players: the cards worked out again every NEXT.everyS (sooner when something changed: p.nxDirty);
// the first time each session there are some, the one fading line (the page's first-time line: client/ftue.js)
export function update(world) {
  if (world.tick % 20 !== 17) return;
  for (const p of world.players.values()) {
    if (!p.conn || !p.ped || p.ped.dead || !appOn(p)) continue;
    if (!p.nxDirty && p.nxAt && world.time - p.nxAt < NEXT.everyS) continue;
    try { refresh(world, p); } catch (e) { if (world.opts && world.opts.throwErrors) throw e; console.error('[whatsnext]', e); continue; }
    if (!p.nxSaid && p.nx && p.nx.length && !p.ped.interior) {
      p.nxSaid = 1;
      p.conn.sendJSON({ t: 'ftue', a: 'tip', id: 'next', text: `What's next: ${p.nx[0].title}`, ctl: 'phone', app: 'next' });
    }
  }
}
export const meSig = (p) => (appOn(p) && p.nx ? p.nxSig || 0 : undefined);
void GOALS;
