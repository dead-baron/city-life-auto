// Self-hosted analytics (the owner, 11-03): what the server knows, aggregated - never anything personal beyond the
// account id (and that only inside the per-account counters kept on the account itself). The source of truth for the
// economy, retention by account and concurrency; the page's Google Analytics (client/analytics.js, server/ga.js) adds
// the audience, devices and acquisition that ad blockers let through.
// Kept in <data>/analytics.json: a bucket a day (the last 90) and concurrency every 5 minutes (the last 14 days).
//   day: { sessions, sessionMs, uniq, newAcc, returning, peak, signups{method}, logins{method}, ftue{step},
//          act{kind} (jobs, crimes, leisure counted by kind), mins{activity} (player-minutes by what they were doing),
//          earn{source}, spend{source}, deaths{cause}, jobs{type}, errors{where}, dev{class}, preset{p}, fps{bucket},
//          load{bucket}, flags{kind} }
//   cohorts: { day: { n, d1, d7, w1 } } - accounts first seen that day, back on day 1, day 7, any day of the first week
// Per account (acct.an): { first, last, days, sess (sessions; absent on accounts from before 11-12), d1, d7, w1, ftue{} }.
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

export const FTUE_STEPS = ['first_join', 'look_picked', 'moved', 'title_play', 'in_world', 'first_job', 'first_job_done', 'first_crime', 'first_purchase', 'first_death', 'first_chat', 'played_10m', 'played_30m', 'came_back', 'signed_up', 'tutorial_begin', 'tutorial_complete',
  // the first-time experience (server/systems/ftue.js): the arrival, the answer, each step reached, done or skipped; the
  // first-time moments fired; the Guide app opened
  'ftue_pick', 'ftue_pick_default', 'ftue_arrive', 'ftue_answer_work', 'ftue_answer_hustle', 'ftue_answer_outdoors', 'ftue_answer_roam', 'ftue_step1', 'ftue_step2', 'ftue_step3', 'ftue_done', 'ftue_skip',
  'moment_wanted', 'moment_down', 'moment_shop', 'moment_transit', 'moment_night', 'moment_hurt', 'guide_open'];
const CLIENT_FTUE = new Set(['title_play', 'in_world', 'tutorial_begin', 'tutorial_complete', 'look_picked']);
const DAYS_KEPT = 90, CONC_KEPT = 14 * 24 * 12;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayNum = (ms) => Math.floor(ms / 86400e3);
const key = (s) => String(s || 'other').replace(/[^a-z0-9_:.-]/gi, '_').slice(0, 40).toLowerCase();
const bump = (o, k, n = 1) => { const kk = key(k); o[kk] = (o[kk] || 0) + n; };

// what a death was: who or what did it, in a word
export function deathCause(cause, killer) {
  if (killer) {
    if (killer.player) return killer.player.badge ? 'player_police' : 'player';
    if (killer.npc) { const r = killer.npc.role || 'npc'; return r === 'cop' || r === 'swat' || r === 'fbi' || r === 'army' ? 'police' : r === 'gang' ? 'gang' : 'npc'; }
    if (killer.wild || killer.kind === 'animal') return 'animal';
    if (killer.def) return 'vehicle';
  }
  const c = String(cause || '').toLowerCase();
  for (const [re, k] of [[/drown|water|sea/, 'drowned'], [/fall|fell|cliff|height/, 'fall'], [/fire|burn|flame/, 'fire'], [/blast|explo|bomb|grenade/, 'explosion'], [/car|hit by|run over|vehicle|train/, 'vehicle'], [/shark|bear|wolf|snake|animal|bit/, 'animal'], [/shot|gun|bullet/, 'shot'], [/stab|knife|beat|punch/, 'melee']]) if (re.test(c)) return k;
  return 'other';
}
// a perf report's buckets (server/perfreports.js cleanReport)
export const fpsBucket = (fps) => (fps >= 55 ? '55+' : fps >= 45 ? '45-54' : fps >= 30 ? '30-44' : fps >= 20 ? '20-29' : '<20');
export const loadBucket = (ms) => (!ms ? 'unknown' : ms < 5000 ? '<5s' : ms < 10000 ? '5-10s' : ms < 20000 ? '10-20s' : ms < 40000 ? '20-40s' : '40s+');
export function deviceClass(r) {
  const ua = String(r.ua || ''), k = String(r.kind || '');
  if (/iPad|Tablet/.test(ua) || k === 'tablet') return 'tablet';
  if (/iPhone|Android.*Mobile|Mobile/.test(ua) || k === 'phone' || k === 'touch') return 'phone';
  return 'desktop';
}

export function createAnalytics({ file = null, now = Date.now, ga = null, onEarned = null } = {}) {
  let S = { v: 1, days: {}, cohorts: {}, conc: [] };
  if (file && existsSync(file)) { try { const d = JSON.parse(readFileSync(file, 'utf8')); if (d && d.v === 1) S = { ...S, ...d }; } catch { /* start over */ } }
  let dirty = false;
  function day(t = now()) {
    const k = dayKey(t);
    let d = S.days[k];
    if (!d) {
      d = S.days[k] = { sessions: 0, sessionMs: 0, uniq: 0, newAcc: 0, returning: 0, peak: 0, signups: {}, logins: {}, ftue: {}, act: {}, mins: {}, earn: {}, spend: {}, deaths: {}, jobs: {}, errors: {}, dev: {}, preset: {}, fps: {}, load: {}, flags: {} };
      const keys = Object.keys(S.days).sort();
      for (const old of keys.slice(0, Math.max(0, keys.length - DAYS_KEPT))) delete S.days[old];
    }
    dirty = true;
    return d;
  }
  const an = (acct) => (acct.an ||= { first: 0, last: 0, days: 0, sess: 0, d1: 0, d7: 0, w1: 0, ftue: {} });
  const gaEvent = (p, name, params) => { if (ga) ga.event(p, name, params); };

  function ftue(p, acct, step, fromClient = false) {
    if (!FTUE_STEPS.includes(step) || (fromClient && !CLIENT_FTUE.has(step)) || !acct) return false;
    const a = an(acct);
    if (a.ftue[step]) return false;
    a.ftue[step] = now();
    bump(day().ftue, step);
    if (step === 'tutorial_begin' || step === 'tutorial_complete') gaEvent(p, step, {});
    else if (step === 'ftue_arrive' || step === 'ftue_done') gaEvent(p, step === 'ftue_arrive' ? 'tutorial_begin' : 'tutorial_complete', {});   // (GA's own names for the funnel's ends)
    return true;
  }
  function sessionStart(p, acct) {
    const t = now(), d = day(t), a = an(acct), dn = dayNum(t);
    p.anStart = t; p.anPlayed = 0;
    d.sessions++;
    a.sess = (a.sess || 0) + 1;   // (sessions all told: the staff's Players page - server/staffplayers.js)
    if (!a.first) {
      a.first = dn; d.newAcc++;
      const c = (S.cohorts[a.first] ||= { n: 0, d1: 0, d7: 0, w1: 0 }); c.n++;
      ftue(p, acct, 'first_join');
    } else if (a.last !== dn) {
      d.returning++;
      const since = dn - a.first, c = (S.cohorts[a.first] ||= { n: 0, d1: 0, d7: 0, w1: 0 });
      if (since === 1 && !a.d1) { a.d1 = 1; c.d1++; }
      if (since === 7 && !a.d7) { a.d7 = 1; c.d7++; }
      if (since >= 1 && since <= 7 && !a.w1) { a.w1 = 1; c.w1++; }
      ftue(p, acct, 'came_back');
    }
    if (a.last !== dn) { a.last = dn; a.days++; d.uniq++; }
    const cks = Object.keys(S.cohorts).map(Number).sort((x, y) => x - y);
    for (const k of cks.slice(0, Math.max(0, cks.length - DAYS_KEPT))) delete S.cohorts[k];
  }
  function sessionEnd(p) {
    if (!p.anStart) return;
    day().sessionMs += now() - p.anStart;
    p.anStart = 0;
  }
  function signIn(p, acct, method, created) {
    const d = day();
    bump(created ? d.signups : d.logins, method);
    if (created) ftue(p, acct, 'signed_up');
    gaEvent(p, created ? 'sign_up' : 'login', { method });
  }
  // a player's money changed by net from one source (server/moneywatch.js settle)
  function money(p, src, net, opt) {
    const d = day(), s = key(src);
    if (net > 0) {
      bump(d.earn, s, net);
      if (s !== 'dev') {
        const e = (p.anEarn ||= []);
        e.push([now(), net]);
        const t0 = now() - 3600e3;
        while (e.length && e[0][0] < t0) e.shift();
        if (onEarned) onEarned(p, e.reduce((x, y) => x + y[1], 0), norm());
        gaAdd(p, 'earn', s, net);
      }
    } else {
      bump(d.spend, s, -net);
      if (s !== 'dev') gaAdd(p, 'spend', s, -net);
    }
    void opt;
  }
  // earn / spend for GA: summed per player and source, sent once a minute (GA's event limits)
  function gaAdd(p, kind, src, n) {
    if (!ga || !ga.enabledFor(p)) return;
    const m = (p.gaMoney ||= new Map()), k = kind + '|' + src;
    m.set(k, (m.get(k) || 0) + n);
  }
  function gaMoneyFlush(world) {
    if (!ga) return;
    for (const p of world.players.values()) {
      const m = p.gaMoney;
      if (!m || !m.size) continue;
      for (const [k, v] of m) {
        const [kind, src] = k.split('|');
        gaEvent(p, kind === 'earn' ? 'earn_virtual_currency' : 'spend_virtual_currency', kind === 'earn' ? { virtual_currency_name: 'dollars', value: Math.round(v), source: src } : { virtual_currency_name: 'dollars', value: Math.round(v), item_name: src });
      }
      m.clear();
    }
  }
  // the norm: dollars earned an hour played, over today and yesterday (dev money left out)
  function norm() {
    let earned = 0, ms = 0;
    for (const k of [dayKey(now()), dayKey(now() - 86400e3)]) {
      const d = S.days[k];
      if (!d) continue;
      for (const [s, v] of Object.entries(d.earn)) if (s !== 'dev') earned += v;
      ms += d.sessionMs + (d.liveMs || 0);
    }
    return ms > 3600e3 ? earned / (ms / 3600e3) : 0;
  }
  function event(kind, p, data = {}) {
    const d = day();
    if (kind === 'crime') { bump(d.act, 'crime:' + data.type); if (p && p.acct) ftue(p, p.acct, 'first_crime'); gaEvent(p, 'crime', { crime: key(data.type) }); }
    else if (kind === 'death') { const c = deathCause(data.cause, data.killer); bump(d.deaths, c); if (p && p.acct) ftue(p, p.acct, 'first_death'); gaEvent(p, 'player_death', { cause: c }); }
    else if (kind === 'job_start') { bump(d.act, 'job:' + data.type); if (p && p.acct) ftue(p, p.acct, 'first_job'); }
    else if (kind === 'job_done') { bump(d.jobs, data.type); if (p && p.acct) ftue(p, p.acct, 'first_job_done'); gaEvent(p, 'job_complete', { job: key(data.type), value: Math.round(data.earned || 0) }); }
    else if (kind === 'leisure') { bump(d.act, 'leisure:' + data.type); gaEvent(p, 'select_content', { content_type: 'leisure', content_id: key(data.type) }); }
    else if (kind === 'purchase') { bump(d.act, 'buy:' + data.what); if (p && p.acct) ftue(p, p.acct, 'first_purchase'); }
    else if (kind === 'error') bump(d.errors, data.where || 'page');
    else if (kind === 'flag') bump(d.flags, data.kind);
    else if (kind === 'rank') bump(d.act, `rank:${data.career}:${data.rank}`);   // (a career rank-up: server/systems/careers.js)
    else if (kind === 'chat') { bump(d.act, 'chat:' + data.ch); if (p && p.acct) ftue(p, p.acct, 'first_chat'); }
  }
  function perf(r) {
    if (!r) return;
    const d = day();
    bump(d.dev, deviceClass(r)); bump(d.preset, r.preset || 'unknown');
    if (r.stage !== 'play') { bump(d.fps, fpsBucket(r.fps || 0)); bump(d.load, loadBucket((r.at && r.at.screen) || 0)); }
  }
  // what the online players are doing, a minute's worth (call once a minute), and how many are on (every 5 minutes)
  function activityOf(world, p) {
    const ped = p.ped;
    if (!ped || ped.dead) return 'down';
    if (p.job) return 'job:' + (p.job.type || 'job');
    if (p.badge) return 'police';
    if (p.wanted > 0) return 'wanted';
    if (p.prison || p.custody) return 'custody';
    if (ped.onTrain || ped.ride) return 'transit';
    if (ped.home) return 'home';
    if (ped.vehId) { const v = world.get(ped.vehId); return 'vehicle:' + ((v && v.def && v.def.kind) || 'car'); }
    if (ped.interior || ped.hidden) return 'indoors';
    return 'foot';
  }
  function minute(world) {
    const d = day();
    let n = 0;
    for (const p of world.players.values()) {
      if (!p.conn) continue;
      n++;
      bump(d.mins, activityOf(world, p));
      p.anPlayed = (p.anPlayed || 0) + 1;
      if (p.acct) p.acct.playMin = (p.acct.playMin || 0) + 1;   // (minutes played, all told: a reporter's weight - moderation.js)
      if (p.acct) { if (p.anPlayed === 10) ftue(p, p.acct, 'played_10m'); if (p.anPlayed === 30) ftue(p, p.acct, 'played_30m'); }
    }
    if (n > d.peak) d.peak = n;
    d.liveMs = 0;
    for (const p of world.players.values()) if (p.conn && p.anStart) d.liveMs += now() - p.anStart;
    gaMoneyFlush(world);
    return n;
  }
  function concurrency(n) {
    S.conc.push([now(), n]);
    if (S.conc.length > CONC_KEPT) S.conc.splice(0, S.conc.length - CONC_KEPT);
    dirty = true;
  }
  function save() {
    if (!file || !dirty) return;
    dirty = false;
    try { writeFileSync(file + '.tmp', JSON.stringify(S)); renameSync(file + '.tmp', file); } catch (e) { dirty = true; console.error('[analytics] save failed:', e.message); }
  }
  return { sessionStart, sessionEnd, signIn, money, event, perf, minute, concurrency, ftue, norm, save, activityOf, get data() { return S; }, day };
}
