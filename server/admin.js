// Privileged messages: { t: 'admin', a, ... } -> { t: 'admin', a, ok, err?, data? }. The role is read from the
// account on the server for every one (server/roles.js); a message from someone without the power is refused, and
// both what was done and what was refused go to the admin log (server/adminlog.js) with who, what, the target, when
// and the values before and after.
//   whoami                                     -> your role and powers (anyone)
//   claim { code }                             -> become the owner with the one-time code from the server log (anyone)
//   players                                    -> who's online, with account ids (helper)
//   plog { id }                                -> a player's recent log: money, purchases, deaths, crimes, jobs, flags (helper)
//   refund { id, i }                           -> a purchase from their recent purchases back into their bank (helper)
//   rescue { id }                              -> a stuck player moved to the nearest open street (helper)
//   restore { id, item, n }                    -> an item (or a weapon, with n rounds) given back (helper)
//   kick { id, why } · ban { id, hours (0: for good), why } · unban { id }               (admin)
//   mute { id, hours } · unmute { id } · strike { id, why } · unstrike { id, i }         (admin)
//   reviews · resolve { rid, note }                                                     (admin)
//   role { id, role: 'admin' | 'helper' | null }                                        (owner)
//   pagelink { page: 'log' | 'dashboard' | 'reviews' } -> a one-time link to the protected pages (helper and up)
import { allowed, rankOf, GRANTABLE, POWERS } from './roles.js';
import { ITEMS, WEAPONS } from '../shared/items.js';
import { escapeSpot, safeSpot } from './systems/unstuck.js';
import { ejectPed } from './systems/vehicles.js';
import { chatData } from './moderation.js';
import * as devmode from './devmode.js';
import { moved } from './movemark.js';

const PLOG_MAX = 60, BUYS_MAX = 20, REFUND_DAYS = 30;
const CLAIM_TRIES = 5, CLAIM_WINDOW_MS = 10 * 60e3, REFUSAL_LOG_MS = 60e3;

// a player's recent log, kept with their account (the helpers read it: plog)
export function note(acct, k, d) {
  if (!acct) return;
  const l = (acct.plog ||= []);
  l.push({ at: Date.now(), k, d });
  if (l.length > PLOG_MAX) l.splice(0, l.length - PLOG_MAX);
}
// a purchase, kept so a helper can refund it
export function notePurchase(acct, amt, what) {
  if (!acct) return null;
  const b = (acct.buys ||= []);
  const i = (acct.buySeq = (acct.buySeq || 0) + 1);
  b.push({ i, at: Date.now(), amt: Math.round(amt), what: String(what).slice(0, 60) });
  if (b.length > BUYS_MAX) b.splice(0, b.length - BUYS_MAX);
  return i;
}

export function createAdmin({ accounts, log, mod, store, pageLink = null, now = Date.now }) {
  const me = (p) => ({ id: p.pid, n: p.name, role: accounts.role(p.pid) });
  const reply = (a, ok, x = {}) => ({ t: 'admin', a, ok, ...x });
  const lastRefusalLog = new WeakMap(), claimTries = new WeakMap();

  // the player a message names: by account id only (a name can be ambiguous - two players may look alike)
  function resolve(world, id) {
    const s = String(id || '');
    if (!/^[a-f0-9]{16,32}$/.test(s)) return null;
    const q = world.players.get(s) || null;
    const pid = s;
    const prof = store.get(pid);
    if (!prof) return null;
    return { pid, p: q || null, prof, acct: accounts.get(pid), name: q ? q.name : prof.name };
  }
  const tgt = (t) => (t ? { id: t.pid, n: t.name } : null);
  // may the actor act on the target? (nobody on the owner but the owner; never on someone of your own rank or above,
  // except yourself where that makes sense)
  const over = (actor, t) => t.pid === actor.pid || rankOf(accounts.role(actor.pid)) > rankOf(accounts.role(t.pid));

  function kickOut(world, q, reason, code = 4009) {
    if (!q || !q.conn) return;
    try { q.conn.sendJSON({ t: 'kicked', reason }); q.conn.close(code, 'kicked'); } catch { /* gone */ }
  }

  function handle(world, p, msg) {
    const a = String(msg.a || '');
    const role = accounts.role(p.pid);
    if (a === 'whoami') return reply(a, true, { data: { role, powers: Object.keys(POWERS).filter((k) => allowed(role, k)), devOpen: devmode.devOpen(), claim: accounts.claimOpen && !accounts.ownerExists() } });
    if (a === 'claim') {
      // a few tries in a while per player (the code is long, but guessing is still guessing); a refusal logged at most
      // once a minute per player, so a script can't fill the log
      const c = (claimTries.get(p) || []).filter((t) => now() - t < CLAIM_WINDOW_MS);
      if (c.length >= CLAIM_TRIES) return reply(a, false, { err: 'Too many tries - wait a few minutes.' });
      c.push(now()); claimTries.set(p, c);
      const err = accounts.claimOwner(p.pid, msg.code);
      if (!err || now() - (lastRefusalLog.get(p) || 0) > REFUSAL_LOG_MS) {
        if (err) lastRefusalLog.set(p, now());
        log.append({ who: me(p), what: 'claim-owner', target: { id: p.pid, n: p.name }, before: role, after: err ? role : 'owner', ok: !err });
      }
      if (err) return reply(a, false, { err });
      p.meDirty = true;
      return reply(a, true, { data: { role: 'owner' } });
    }
    const power = a === 'pagelink' ? 'plog' : a;
    if (!POWERS[power]) return reply(a, false, { err: 'No such action.' });
    if (!allowed(role, power)) {
      const t = lastRefusalLog.get(p) || 0;
      if (now() - t > REFUSAL_LOG_MS) { lastRefusalLog.set(p, now()); log.append({ who: me(p), what: a, target: msg.id ? { id: String(msg.id).slice(0, 32) } : null, ok: false, note: 'refused: no such power' }); }
      return reply(a, false, { err: 'You don\'t have that power.' });
    }
    const t = msg.id !== undefined ? resolve(world, msg.id) : null;
    const need = !['players', 'reviews', 'resolve', 'pagelink'].includes(a);
    if (need && !t) return reply(a, false, { err: 'No such player.' });
    if ((a === 'refund' || a === 'restore') && t && t.pid === p.pid && role !== 'owner') return reply(a, false, { err: 'Not on your own account - ask another helper.' });
    const done = (x) => { log.append({ who: me(p), target: tgt(t), ...x }); if (t && t.acct && x.ok !== false) note(t.acct, 'staff', `${a} by ${p.name}${x.note ? ': ' + x.note : ''}`); store.touch(); };
    switch (a) {
      case 'players': {
        const l = [];
        for (const q of world.players.values()) if (q.conn) l.push({ id: q.pid, n: q.name, role: accounts.role(q.pid), guest: accounts.isGuest(q.pid), d: q.ped ? world.map.districtAt(q.ped.x, q.ped.y).name : '', w: q.wanted || 0 });
        log.append({ who: me(p), what: 'players', ok: true });
        return reply(a, true, { data: l });
      }
      case 'plog': {
        done({ what: 'plog' });
        return reply(a, true, { data: { name: t.name, guest: accounts.isGuest(t.pid), role: accounts.role(t.pid), log: (t.acct.plog || []).slice(-60).reverse(), buys: (t.acct.buys || []).slice().reverse(), strikes: chatData(t.acct).strikes, ban: t.acct.ban, cash: t.prof.cash, bank: t.prof.bank } });
      }
      case 'refund': {
        const b = (t.acct.buys || []).find((x) => x.i === Number(msg.i));
        if (!b) return reply(a, false, { err: 'No such purchase.' });
        if (b.refunded) return reply(a, false, { err: 'Already refunded.' });
        if (now() - b.at > REFUND_DAYS * 86400e3) return reply(a, false, { err: `Older than ${REFUND_DAYS} days.` });
        const before = t.prof.bank;
        t.prof.bank = before + b.amt;
        b.refunded = { at: now(), by: p.pid };
        if (t.p) { t.p.meDirty = true; world.notify(t.p, `A helper refunded $${b.amt} (${b.what}) to your bank.`, 'good'); }
        done({ what: 'refund', before: { bank: before }, after: { bank: t.prof.bank }, note: `$${b.amt} ${b.what}` });
        return reply(a, true, { data: { bank: t.prof.bank } });
      }
      case 'rescue': {
        const q = t.p, ped = q && q.ped;
        if (!ped || ped.dead) return reply(a, false, { err: 'They aren\'t in the world right now.' });
        if (q.wanted > 0 || q.custody || q.prison || ped.cuffed) return reply(a, false, { err: 'Not while they\'re wanted or in custody.' });
        if (ped.home) return reply(a, false, { err: 'They\'re inside a home: ask them to step out.' });
        const before = { x: Math.round(ped.x), y: Math.round(ped.y) };
        if (ped.vehId) ejectPed(world, ped, true);
        const spot = escapeSpot(world.map, ped.x, ped.y) || safeSpot(world.map, ped.x, ped.y);
        if (!spot) return reply(a, false, { err: 'No open street found near them.' });
        ped.x = spot.x; ped.y = spot.y; ped.vx = 0; ped.vy = 0; ped.ug = 0; ped.interior = null; ped.hidden = false; ped.lz = 0;
        world.place(ped); moved(ped);
        q.teleportAt = world.time; q.meDirty = true;
        world.notify(q, 'A helper moved you out to the street.', 'good');
        done({ what: 'rescue', before, after: { x: Math.round(spot.x), y: Math.round(spot.y) } });
        return reply(a, true);
      }
      case 'restore': {
        const id = String(msg.item || ''), n = Math.max(1, Math.min(id in WEAPONS ? 500 : 10, Number(msg.n) | 0 || 1));
        if (!ITEMS[id] && !WEAPONS[id]) return reply(a, false, { err: 'No such item.' });
        const prof = t.prof;
        let before, after;
        if (WEAPONS[id]) { before = prof.weapons[id] ?? null; prof.weapons[id] = (prof.weapons[id] || 0) + (Number(msg.n) > 0 ? n : 0); after = prof.weapons[id]; }
        else { before = prof.inventory[id] || 0; prof.inventory[id] = before + n; after = prof.inventory[id]; }
        if (t.p) { t.p.meDirty = true; world.notify(t.p, `A helper gave you back: ${(ITEMS[id] || WEAPONS[id]).name}${n > 1 ? ' x' + n : ''}.`, 'good'); }
        done({ what: 'restore', before: { [id]: before }, after: { [id]: after } });
        return reply(a, true);
      }
      case 'kick': case 'ban': {
        if (t.pid === p.pid || !over(p, t)) return reply(a, false, { err: 'Not on someone of your rank or above.' });
        const why = String(msg.why || '').slice(0, 200);
        if (a === 'kick') {
          t.acct.kickUntil = now() + 60e3;
          kickOut(world, t.p, `You were kicked by a moderator${why ? ': ' + why : ''}.`);
          done({ what: 'kick', note: why });
          return reply(a, true);
        }
        const before = t.acct.ban;
        const hours = Math.max(0, Math.min(24 * 3650, Number(msg.hours) || 0));
        const b = accounts.ban(t.pid, { hours, why, by: p.pid });
        kickOut(world, t.p, `You're banned${hours ? ` for ${hours} h` : ''}${why ? ': ' + why : ''}.`, 4010);
        done({ what: 'ban', before, after: b, note: why });
        return reply(a, true);
      }
      case 'unban': {
        const before = t.acct.ban;
        if (!accounts.unban(t.pid)) return reply(a, false, { err: 'Not banned.' });
        done({ what: 'unban', before, after: null });
        return reply(a, true);
      }
      case 'mute': case 'unmute': {
        if (!over(p, t)) return reply(a, false, { err: 'Not on someone of your rank or above.' });
        const c = chatData(t.acct), before = c.muteUntil || 0;
        if (a === 'mute') mod.mute(t.acct, msg.hours); else mod.unmute(t.acct);
        if (t.p) world.notify(t.p, a === 'mute' ? 'A moderator muted you from chat.' : 'You can chat again.', a === 'mute' ? 'bad' : 'good');
        done({ what: a, before: { muteUntil: before }, after: { muteUntil: c.muteUntil || 0 } });
        return reply(a, true);
      }
      case 'strike': case 'unstrike': {
        if (!over(p, t)) return reply(a, false, { err: 'Not on someone of your rank or above.' });
        const before = mod.activeStrikes(t.acct);
        if (a === 'strike') mod.strike(t.acct, String(msg.why || 'by a moderator').slice(0, 120), p.pid);
        else if (!mod.unstrike(t.acct, msg.i)) return reply(a, false, { err: 'No such strike.' });
        done({ what: a, before: { strikes: before }, after: { strikes: mod.activeStrikes(t.acct), muteUntil: chatData(t.acct).muteUntil || 0 } });
        return reply(a, true);
      }
      case 'reviews': log.append({ who: me(p), what: 'reviews', ok: true }); return reply(a, true, { data: mod.openReviews(100) });
      case 'resolve': {
        const r = mod.resolve(String(msg.rid || ''), { id: p.pid, n: p.name }, msg.note);
        if (!r) return reply(a, false, { err: 'No such open review.' });
        log.append({ who: me(p), what: 'resolve', target: r.who, before: { review: r.id, kind: r.kind }, after: { done: true }, note: r.done.note });
        return reply(a, true);
      }
      case 'role': {
        const want = msg.role === null || msg.role === '' ? null : String(msg.role);
        if (want !== null && !GRANTABLE.includes(want)) return reply(a, false, { err: 'The owner hands out admin and helper only.' });
        if (t.pid === p.pid || accounts.role(t.pid) === 'owner') return reply(a, false, { err: 'Not on the owner.' });
        if (want && accounts.isGuest(t.pid)) return reply(a, false, { err: 'Guests can\'t hold a role - they sign in first.' });
        const before = accounts.role(t.pid);
        accounts.setRole(t.pid, want);
        if (t.p && t.p.devMode && !devmode.mayDev(t.p)) devmode.exit(world, t.p);
        if (t.p) { t.p.meDirty = true; world.notify(t.p, want ? `You're a ${want} now.` : 'Your staff role was removed.', 'info'); }
        done({ what: 'role', before, after: want });
        return reply(a, true);
      }
      case 'pagelink': {
        if (!pageLink) return reply(a, false, { err: 'Not available here.' });
        const page = ['log', 'dashboard', 'reviews', 'perf', 'clienterrors'].includes(msg.page) ? msg.page : 'reviews';
        const pw = page === 'log' ? 'adminlog' : page === 'dashboard' ? 'dashboard' : 'reviews';
        if (!allowed(role, pw)) return reply(a, false, { err: 'You don\'t have that power.' });
        log.append({ who: me(p), what: 'pagelink', note: page, ok: true });
        return reply(a, true, { data: { url: pageLink(p.pid, page) } });
      }
      default: return reply(a, false, { err: 'No such action.' });
    }
  }
  // a debug command from someone in dev mode: logged (what and its main arguments) - an admin's always; while the open
  // debug mode is on (CLA_DEV_OPEN=1) every tester has it, and their commands aren't privileged actions: not logged
  function devCommand(p, c, msg) {
    if (devmode.devOpen() && !allowed(accounts.role(p.pid), 'dev')) return;
    const args = {};
    for (const k of ['pid', 'k', 'id', 'n', 'm', 'x', 'y', 's', 'on']) if (msg && msg[k] !== undefined) args[k] = typeof msg[k] === 'string' ? msg[k].slice(0, 40) : msg[k];
    log.append({ who: me(p), what: 'dev', note: String(c).slice(0, 40), after: Object.keys(args).length ? args : undefined, target: msg && msg.pid ? { id: String(msg.pid).slice(0, 32) } : null });
  }
  return { handle, devCommand, resolve };
}
