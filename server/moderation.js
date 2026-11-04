// Moderation: the review list and the strike log (the owner, 11-03).
// - The review list: what an admin should look at - reports from players, chat filter hits for hate, economy anomalies
//   (earnings far above the norm), movement audits (speed, teleports), message floods. Kept with the profiles
//   (store.kept.reviews, the newest 500), each { id, at, kind, who: { id, n }, by, note, data, done }.
// - Strikes, per account (acct.chat.strikes): a hate-filter hit (at most one per CHAT.filterStrikeGapS), reports from
//   CHAT.reportsToStrike different players inside CHAT.reportWindowH, or an admin. CHAT.strikesToMute strikes not yet
//   spent mean a CHAT.muteH chat mute, and spend them.
import { CHAT } from '../shared/chatdefs.js';

const MAX_REVIEWS = 500, MAX_STRIKES = 50;

export function chatData(acct) {
  if (!acct) return null;
  return (acct.chat ||= { off: {}, mutes: [], blocks: [], contacts: {}, inbox: [], strikes: [], muteUntil: 0, reportsIn: [] });
}

export function createModeration({ store, now = Date.now }) {
  const reviews = () => (store.kept.reviews ||= []);
  let seq = 0;
  function review(kind, who, note, data = null, by = null) {
    const list = reviews();
    // the same kind about the same player still open within the hour: counted on it, not added again
    const open = list.find((r) => !r.done && r.kind === kind && r.who && who && r.who.id === who.id && now() - r.at < 3600e3 && (!by || (r.by && r.by.id === by.id)));
    if (open) { open.n = (open.n || 1) + 1; open.last = now(); if (data) open.data = data; store.touch(); return open; }
    const r = { id: `r${now().toString(36)}${(seq++).toString(36)}`, at: now(), kind, who: who ? { id: who.id, n: who.n } : null, by: by ? { id: by.id, n: by.n } : null, note: String(note || '').slice(0, 300), data, done: null, n: 1 };
    list.unshift(r);
    if (list.length > MAX_REVIEWS) list.length = MAX_REVIEWS;
    store.touch();
    return r;
  }
  function resolve(id, by, note) {
    const r = reviews().find((q) => q.id === id);
    if (!r || r.done) return null;
    r.done = { at: now(), by: by ? { id: by.id, n: by.n } : null, note: String(note || '').slice(0, 300) };
    store.touch();
    return r;
  }
  const openReviews = (n = 100) => reviews().filter((r) => !r.done).slice(0, n);

  // -> { strikes (active), muted: until | 0 }
  function strike(acct, why, by = 'filter') {
    const c = chatData(acct);
    c.strikes.unshift({ at: now(), why: String(why).slice(0, 120), by, spent: false });
    if (c.strikes.length > MAX_STRIKES) c.strikes.length = MAX_STRIKES;
    const active = c.strikes.filter((s) => !s.spent && !s.removed);
    let muted = 0;
    if (active.length >= CHAT.strikesToMute) {
      for (const s of active) s.spent = true;
      c.muteUntil = Math.max(c.muteUntil || 0, now() + CHAT.muteH * 3600e3);
      muted = c.muteUntil;
    }
    store.touch();
    return { strikes: active.length, muted };
  }
  function unstrike(acct, i) {
    const c = chatData(acct), s = c.strikes[i | 0];
    if (!s || s.removed) return false;
    s.removed = true; store.touch();
    return true;
  }
  const activeStrikes = (acct) => chatData(acct).strikes.filter((s) => !s.spent && !s.removed).length;
  const mutedUntil = (acct) => { const c = chatData(acct); return c.muteUntil && c.muteUntil > now() ? c.muteUntil : 0; };
  function mute(acct, hours) { const c = chatData(acct); c.muteUntil = now() + Math.max(0.1, Math.min(24 * 365, Number(hours) || CHAT.muteH)) * 3600e3; store.touch(); return c.muteUntil; }
  function unmute(acct) { const c = chatData(acct); const had = c.muteUntil > now(); c.muteUntil = 0; store.touch(); return had; }

  // a report on someone: the review list always; a strike once CHAT.reportsToStrike different players reported them
  function report(targetAcct, target, reporter, why, note) {
    const c = chatData(targetAcct), t = now(), win = CHAT.reportWindowH * 3600e3;
    c.reportsIn = (c.reportsIn || []).filter((r) => t - r.at < win && r.by !== reporter.id);
    c.reportsIn.push({ at: t, by: reporter.id, why });
    const r = review('report', target, `${why}${note ? ': ' + note : ''}`, null, reporter);
    let s = null;
    if (c.reportsIn.length >= CHAT.reportsToStrike) { s = strike(targetAcct, `reported by ${c.reportsIn.length} players (${why})`, 'reports'); c.reportsIn = []; }
    store.touch();
    return { review: r, strike: s };
  }
  return { review, resolve, openReviews, reviews, strike, unstrike, activeStrikes, mutedUntil, mute, unmute, report };
}
