// Daily and weekly goals (docs/PROGRESSION.md; the numbers and the templates: shared/rules.js GOALS), shown in the "What's
// next" app (server/systems/whatsnext.js, the page's client/whatsnext.js). Three a day - one for your main career, one for
// any career, one side activity - and one a week for your main career, scaled to its rank. Every goal has a solo route
// (a template's need: 'cop' only for someone fit for duty, 'notcop' the way there, 'biz' only with a business to collect
// from). The day turns at GOALS.resetUtcH:00 UTC for everyone (dayKey), the week on Mondays (weekKey); what's rolled is
// seeded by the account and the day, so it's the same however often it's asked.
// Counted from the progress events (careers.js note: each emit point's one line); done, it pays at once - cash and XP of
// its career (a side goal's: your main career's). All three done: a bonus, more for each day of the streak up to
// GOALS.streakMax; one day missed pauses the streak (graceDays), a second resets it. One free reroll a day. The weekly
// pays a crate of your career's tier (GOALS.weekTier by rank) as its cash (CRATE_TIERS' middle: no crate is delivered
// home yet), a cosmetic token (counted: the cosmetics come later) and XP.
//   profile.goals: { day, list: [{ k (template id), slot ('main' | 'any' | 'side'), c (career or 'side'), n, got, done }],
//                    rr (rerolls used today), wk: { k (week), c, n, got, done }, streak: { n, last (day all 3 done) },
//                    tok (cosmetic tokens) } - absent on old profiles (made on first use)
import { GOALS, CAREERS, CAREER_KEYS, ENFORCER_MIN_SAMARITAN } from '../../shared/rules.js';
import { CRATE_TIERS } from '../../shared/items.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as careers from './careers.js';

const DAY_MS = 86400e3;
export const dayKey = (now = Date.now()) => Math.floor((now - GOALS.resetUtcH * 3600e3) / DAY_MS);
export const weekKey = (day) => Math.floor((day + 3) / 7);   // (day 0 was a Thursday: the week from Monday's reset)
export const resetIn = (now = Date.now()) => (dayKey(now) + 1) * DAY_MS + GOALS.resetUtcH * 3600e3 - now;
const tierOf = (r) => (r <= 2 ? 0 : r <= 5 ? 1 : 2);
export const BY_ID = Object.fromEntries(GOALS.daily.map((T) => [T.id, T]));
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const textOf = (T, n) => T.t.replace('{n}', T.money ? money(n) : String(n));
function seed(pid, day, salt) {
  let h = 2166136261 ^ day ^ (salt * 0x9e3779b1);
  for (let i = 0; i < pid.length; i++) h = Math.imul(h ^ pid.charCodeAt(i), 16777619);
  return h >>> 0;
}

// fit for police duty, or on it (the 'cop' goals); a business with takings to collect (not a hideout's product)
export const copFit = (p) => !!p.badge || ((p.profile.samaritan || 0) >= ENFORCER_MIN_SAMARITAN && !(p.profile.felonies > 0) && !p.profile.gang);
const hasBiz = (p) => Object.values(p.profile.biz || {}).some((e) => e && e.t !== 'hideout' && e.t !== 'unit');   // (a till to collect: not a hideout's product, nor a commercial unit's rent)
export function eligible(p, T) {
  if (T.need === 'cop') return copFit(p);
  if (T.need === 'notcop') return !copFit(p);
  if (T.need === 'biz') return hasBiz(p);
  return true;
}
// a career's rank for the template's size (a side goal: your main career's)
const rankFor = (p, c) => careers.careerRank(p, CAREERS[c] ? c : careers.mainCareer(p));
function make(p, T, slot) { return { k: T.id, slot, c: T.c, n: T.n[tierOf(rankFor(p, T.c))], got: 0, done: 0 }; }
function pick(rnd, list) { return list.length ? list[Math.floor(rnd() * list.length)] : null; }
// today's three: the main career's, another of any career's (another career's if there is one), a side activity's
export function roll(p, day, salt = 0, keep = []) {
  const rnd = mulberry32(seed(p.pid || p.profile.pid || '', day, salt)), main = careers.mainCareer(p);
  const ok = (T) => eligible(p, T) && !keep.includes(T.id);
  const a = pick(rnd, GOALS.daily.filter((T) => T.c === main && ok(T)));
  const others = GOALS.daily.filter((T) => CAREER_KEYS.includes(T.c) && T.c !== main && ok(T));
  const b = pick(rnd, others.length ? others : GOALS.daily.filter((T) => CAREER_KEYS.includes(T.c) && ok(T) && T !== a));
  const s = pick(rnd, GOALS.daily.filter((T) => T.c === 'side' && ok(T)));
  return [a && make(p, a, 'main'), b && make(p, b, 'any'), s && make(p, s, 'side')].filter(Boolean);
}
function rollWeek(p, wk) {
  const c = careers.mainCareer(p), W = GOALS.weekly[c];
  return { k: wk, c, n: W.n[tierOf(careers.careerRank(p, c))], got: 0, done: 0 };
}
// the record, today's: rolled afresh when the day (or the week) has turned
export function state(p, now = Date.now()) {
  const prof = p.profile, d = dayKey(now);
  const G = (prof.goals ||= { day: -1, list: [], rr: 0, wk: null, streak: { n: 0, last: -9 }, tok: 0 });
  G.streak ||= { n: 0, last: -9 };
  if (G.day !== d) { G.day = d; G.rr = 0; G.list = roll(p, d); store.touch(); }
  const wk = weekKey(d);
  if (!G.wk || G.wk.k !== wk) { G.wk = rollWeek(p, wk); store.touch(); }
  return G;
}
// the streak as it stands today: n days, 0 once it's gone more than graceDays without all three
export function streakNow(G, d) { const S = G.streak || { n: 0, last: -9 }; return d - S.last > 1 + GOALS.graceDays ? 0 : S.n; }
export const streakMult = (n) => 1 + GOALS.streakStep * (Math.min(Math.max(n, 1), GOALS.streakMax) - 1);

// ---- counting -----------------------------------------------------------------------------------------------------------
const amountOf = (T, ev, d) => (T.money || ev === 'sam' ? Math.max(0, Math.round(d.n || 0)) : 1);
export function onNote(world, p, ev, d = {}, now = Date.now()) {
  if (!p.profile || !p.profile.ftue || p.profile.ftue.st !== 'done') return;   // (the app - and its goals - after the first goal)
  const G = state(p, now);
  let moved = false;
  for (const g of G.list) {
    const T = BY_ID[g.k];
    if (!T || g.done || T.ev !== ev) continue;
    if (T.min && !((d.lb || 0) >= T.min)) continue;
    if (T.job && d.job !== T.job) continue;
    const add = amountOf(T, ev, d);
    if (!add) continue;
    g.got = Math.min(g.n, g.got + add); moved = true;
    if (g.got >= g.n) finish(world, p, G, g, now);
  }
  const W = G.wk;
  if (W && !W.done && ev === `xp:${W.c}` && d.n > 0) {
    W.got = Math.min(W.n, W.got + Math.round(d.n)); moved = true;
    if (W.got >= W.n) finishWeek(world, p, G);
  }
  if (moved) { p.nxDirty = true; store.touch(); }
}
careers.onNote((world, p, ev, d) => onNote(world, p, ev, d));
function finish(world, p, G, g, now) {
  const T = BY_ID[g.k], c = CAREERS[g.c] ? g.c : careers.mainCareer(p);
  g.done = 1;
  p.profile.cash += T.cash;
  careers.addXp(world, p, c, T.xp);
  world.notify(p, `Goal done: ${textOf(T, g.n)}. +${money(T.cash)}, +${T.xp} ${CAREERS[c].name.toLowerCase()} XP.`, 'good', `Goal done: +${money(T.cash)}`);
  if (G.list.length && G.list.every((q) => q.done)) allDone(world, p, G, dayKey(now));
}
// all three: the streak (a day missed pauses it - grace - another resets it) and its bonus
function allDone(world, p, G, d) {
  const S = G.streak, gap = d - S.last;
  if (gap <= 0) return;
  S.n = gap <= 1 + GOALS.graceDays ? S.n + 1 : 1;
  S.last = d;
  const k = streakMult(S.n), cash = Math.round(GOALS.allCash * k), xp = Math.round(GOALS.allXp * k), c = careers.mainCareer(p);
  p.profile.cash += cash;
  careers.addXp(world, p, c, xp);
  if (p.conn) p.conn.sendJSON({ t: 'ftue', a: 'end', title: 'ALL DONE TODAY', sub: `+${money(cash)} · +${xp} XP · streak ${Math.min(S.n, GOALS.streakMax)} day${S.n === 1 ? '' : 's'}` });
  world.notify(p, `All three goals done today: +${money(cash)}, +${xp} XP (a ${S.n}-day streak).`, 'good');
}
// the weekly's crate: your career's tier by rank, paid as its cash; a cosmetic token; XP
export function weekReward(p, c) {
  const tier = GOALS.weekTier[careers.careerRank(p, c)] || 1, T = CRATE_TIERS[tier];
  return { tier, crate: T.name, cash: Math.round((T.min + T.max) / 2), xp: GOALS.weekXp };
}
function finishWeek(world, p, G) {
  const W = G.wk, R = weekReward(p, W.c);
  W.done = 1;
  p.profile.cash += R.cash;
  G.tok = (G.tok || 0) + 1;
  careers.addXp(world, p, W.c, R.xp);
  if (p.conn) p.conn.sendJSON({ t: 'ftue', a: 'end', title: 'WEEKLY GOAL DONE', sub: `${R.crate}: +${money(R.cash)} · a cosmetic token` });
  world.notify(p, `Weekly goal done: the ${R.crate}'s worth, +${money(R.cash)}, and a cosmetic token (${G.tok}).`, 'good');
}

// ---- the app -----------------------------------------------------------------------------------------------------------
// One free reroll a day: goal i (not done) for another of its kind. null, or why not.
export function reroll(p, i, now = Date.now()) {
  const G = state(p, now), g = G.list[i];
  if (!g) return 'No such goal.';
  if (g.done) return 'That one\'s done already.';
  if ((G.rr || 0) >= GOALS.rerolls) return 'You\'ve used today\'s reroll.';
  const keep = G.list.map((q) => q.k);
  for (let salt = 1; salt < 40; salt++) {
    const fresh = roll(p, G.day, salt + (G.rr || 0) * 40, keep).find((q) => q.slot === g.slot);
    if (fresh) { G.list[i] = fresh; G.rr = (G.rr || 0) + 1; store.touch(); p.nxDirty = true; return null; }
  }
  return 'Nothing else to swap it for today.';
}
export function panel(p, now = Date.now()) {
  const G = state(p, now), d = G.day, W = G.wk, n = streakNow(G, d);
  return {
    daily: G.list.map((g, i) => { const T = BY_ID[g.k]; return { i, k: g.k, slot: g.slot, c: g.c, t: textOf(T, g.n), n: g.n, got: g.got, done: g.done, cash: T.cash, xp: T.xp, money: T.money ? 1 : 0 }; }),
    weekly: W ? { c: W.c, t: GOALS.weekly[W.c].t.replace('{n}', String(W.n)), n: W.n, got: W.got, done: W.done, ...weekReward(p, W.c) } : null,
    streak: n, today: G.streak.last === d ? 1 : 0, mult: +streakMult(G.streak.last === d ? n : n + 1).toFixed(2), rr: Math.max(0, GOALS.rerolls - (G.rr || 0)), resetS: Math.round(resetIn(now) / 1000), tok: G.tok || 0,
    allCash: GOALS.allCash,
  };
}
