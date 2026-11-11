// Property upkeep (docs/PROGRESSION.md "Money sinks", progression build item 6; the numbers: shared/rules.js UPKEEP).
// Every home and business you own costs a little a day, charged from the bank on the wall-clock day (the goals' day:
// goals.js dayKey) - worked out from the days that have passed whenever you're in the city (the tick below, which starts
// on joining), never by a loop over every account. A day away is billed too, at most UPKEEP.backDays at once. What the
// bank can't cover waits as arrears - paid from the bank the moment it can, or from the Homes app (cash first) - and the
// phone says so (a text: the What's next app's calls, the HUD's note, a statement in the mailbox):
//   1 day unpaid        a text: it couldn't be paid
//   shabbyDays unpaid   the place looks shabby (the Homes app's line, and one on going in: homes.js goInside's note)
//   repoDays - 1        the final notice (its time kept: fw)
//   repoDays unpaid     repossessed - only once the final notice is finalWarnH hours old, never while you're inside it
//                       (a home) or on its lot (a business): the city sells it and pays you repoBack of its price (and its
//                       upgrades'), less the arrears and a mortgage's debt; its furniture goes into storage (homes.js
//                       stowDecor: placed in your next home), your cars and your stash stay yours
// A rule of the design: a sink should feel like care, never a tax (the arithmetic of a day's play: docs/DEVLOG.md).
//   profile.upkeep: { d (the day billed to), due: { [key]: { n (days unpaid), amt ($ owed), w (the warning sent: 0-3),
//                     fw (the final notice's time, ms) } }, paidD (the day the last bill was paid) } - absent on old
//                     profiles (made the first time they own something: billed from the next day)
//   key: 'h:<home id>' | 'b:<business site id>' (the food truck: none - it's a van)
// A business on a lease (a contact's: contacts.js - its entry's lease { by, off }) costs off less a day: the rent. A tower
// share (profile.contacts.stake { tower, rent }: Victor Lin's chain) pays its rent into the bank for each day billed -
// clean money (business XP: careers.js onMoney). So does each commercial unit (biz.js type 'unit': biz.rentOf) - billed its
// upkeep like any business, its rent in first.
import { UPKEEP } from '../../shared/rules.js';
import { store } from '../store.js';
import { dayKey } from './goals.js';
import * as homes from './homes.js';
import * as homeups from './homeups.js';
import * as biz from './biz.js';
import * as mail from './mail.js';
import * as careers from './careers.js';   // (a tower share's rent is clean money)

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const clampDay = (n) => Math.max(UPKEEP.min, Math.min(UPKEEP.max, Math.round(n)));
export const homeDaily = (h) => clampDay((h.price || 0) * UPKEEP.homeRate);
export const bizDaily = (s) => clampDay((s.price || 0) * UPKEEP.bizRate);
export const leaseDaily = (s, L) => Math.round(bizDaily(s) * (1 - (L.off || 0)));
const stakeOf = (prof) => (prof.contacts && prof.contacts.stake) || null;
const SENDER = 'City Property Office';

// what you own that has upkeep: [{ key, name, daily, h | s }]
export function props(world, prof) {
  const out = [];
  for (const h of homes.ownedHomes(world, prof)) if (h) out.push({ key: `h:${h.id}`, name: h.name, daily: homeDaily(h), h });
  if (prof.biz) for (const { s, e, id } of biz.ownedBy(world, prof)) if (id !== 'truck' && s.t !== 'truck') out.push({ key: `b:${s.id}`, name: s.name, daily: e && e.lease ? leaseDaily(s, e.lease) : bizDaily(s), s });
  return out;
}
export const dailyTotal = (world, prof) => props(world, prof).reduce((t, q) => t + q.daily, 0);
const dueOf = (prof, key) => (prof.upkeep && prof.upkeep.due && prof.upkeep.due[key]) || null;
export const shabby = (prof, key) => { const D = dueOf(prof, key); return !!D && D.amt > 0 && D.n >= UPKEEP.shabbyDays; };
export function owed(prof) { let t = 0; for (const D of Object.values((prof.upkeep && prof.upkeep.due) || {})) t += D.amt || 0; return Math.round(t); }

// a text from the property office: the app's calls, the HUD's note (and a statement in the mailbox for a home's)
function text(world, p, msg, tone, home) {
  const C = (p.profile.careers ||= { v: 1, main: null, seen: {}, biz: 0, props: [], tried: {}, calls: [] });
  (C.calls ||= []).unshift({ who: SENDER, text: msg, c: 'business', at: Date.now() });
  if (C.calls.length > 5) C.calls.length = 5;
  world.notify(p, `Text from the ${SENDER}: "${msg}"`, tone);
  if (home) mail.post(p, 'stmt', `${SENDER}: ${msg}`);
  p.nxDirty = true;
}

// Inside a home of yours (or standing on your business's lot): nothing's taken from under you.
function present(world, p, q) {
  const ped = p.ped;
  if (!ped || ped.dead) return false;
  if (q.h) return !!ped.hidden && (ped.inside === q.h.id || (ped.home && ped.home.id === q.h.id));
  return Math.hypot(ped.x - q.s.x, ped.y - q.s.y) < 300;
}

// The day's reckoning for a player in the city: bill the days gone by, settle what the bank covers, warn, repossess.
// (now: ms - the tests' clock)
export function check(world, p, now = Date.now()) {
  const prof = p.profile;
  if (!prof) return;
  const list = props(world, prof);
  const stake = stakeOf(prof);
  if (!list.length && !prof.upkeep && !stake) return;
  const today = dayKey(now);
  const U = (prof.upkeep ||= { d: today, due: {} });
  U.due ||= {};
  let touched = false;
  const keys = new Set(list.map((q) => q.key));
  for (const k of Object.keys(U.due)) if (!keys.has(k)) { delete U.due[k]; touched = true; }   // (sold, or gone)
  const days = Math.min(UPKEEP.backDays, Math.max(0, today - (U.d ?? today)));
  let billed = 0;
  if (today > (U.d ?? today)) {
    U.d = today; touched = true;
    if (days > 0) for (const q of list) { const D = (U.due[q.key] ||= { n: 0, amt: 0, w: 0 }); D.amt += q.daily * days; D.n += days; billed += q.daily * days; }
    const units = list.filter((q) => q.s && q.s.t === 'unit');
    if (days > 0 && units.length) {   // (commercial units' rent: in before the bills are settled - clean money)
      const rent = units.reduce((t, q) => t + biz.rentOf(q.s), 0) * days;
      prof.bank = (prof.bank || 0) + rent;
      careers.onMoney(world, p, 'biz', rent);
      careers.note(world, p, 'rent', { n: rent, units: units.length });
      world.notify(p, `Rent from your commercial unit${units.length === 1 ? '' : 's'}: ${money(rent)} to your bank${days > 1 ? ` (${days} days)` : ''}.`, 'good');
    }
    if (days > 0 && stake && stake.rent > 0) {   // (the tower share's rent: in before the bills are settled)
      const rent = stake.rent * days;
      prof.bank = (prof.bank || 0) + rent;
      careers.onMoney(world, p, 'biz', rent);
      world.notify(p, `Rent from your share of ${stake.tower}: ${money(rent)} to your bank${days > 1 ? ` (${days} days)` : ''}.`, 'good');
    }
  }
  // settle: each place's arrears, all at once, when the bank covers them
  let paid = 0, n = 0, one = '';
  for (const q of list) {
    const D = U.due[q.key];
    if (!D || !(D.amt > 0)) continue;
    if ((prof.bank || 0) < D.amt) continue;
    prof.bank -= D.amt; paid += D.amt; n++; one = q.name;
    delete U.due[q.key]; touched = true;
  }
  if (paid) {
    U.paidD = today;
    world.notify(p, billed && paid === billed ? `Upkeep: ${money(paid)} from your bank for ${n === 1 ? one : `your ${n} places`} (${days > 1 ? `${days} days` : 'a day'}).` : `Upkeep paid: ${money(paid)} from your bank.`, 'info');
    p.meDirty = true;
  }
  // warn, then repossess
  for (const q of list) {
    const D = U.due[q.key];
    if (!D || !(D.amt > 0)) continue;
    const lvl = D.n >= UPKEEP.repoDays - 1 ? 3 : D.n >= UPKEEP.shabbyDays ? 2 : D.n >= 1 ? 1 : 0;
    if (lvl > (D.w || 0)) {
      D.w = lvl; touched = true;
      if (lvl === 3) { D.fw = now; text(world, p, `Final notice: ${q.name} is repossessed in ${UPKEEP.finalWarnH} hours unless its ${money(D.amt)} upkeep is paid - your bank or the Homes app.`, 'bad', !!q.h); }
      else if (lvl === 2) text(world, p, `${q.name} is looking shabby - ${D.n} days of upkeep unpaid (${money(D.amt)}). Unpaid ${UPKEEP.repoDays} days and it's repossessed.`, 'warn', !!q.h);
      else text(world, p, `${q.name}'s upkeep (${money(D.amt)}) couldn't be paid from your bank. Top it up, or pay it in the Homes app.`, 'warn', !!q.h);
    }
    if (D.n >= UPKEEP.repoDays && D.fw && now - D.fw >= UPKEEP.finalWarnH * 3600e3 && !present(world, p, q)) { repossess(world, p, q, D); touched = true; }
  }
  if (touched) { p.meDirty = true; store.touch(); }
}

// taken back: sold by the city, the rest (repoBack of its worth, less the arrears and a mortgage's debt) into the bank
export function repossess(world, p, q, D = dueOf(p.profile, q.key) || { amt: 0 }) {
  const prof = p.profile;
  let back = 0;
  if (q.h) {
    const h = q.h, loan = prof.loans && prof.loans[h.id], debt = loan ? loan.owed : 0;
    if (loan) delete prof.loans[h.id];
    const ups = homeups.sellOff(prof, h.id);
    homes.release(world, prof, h);   // (the furniture into storage: homes.js stowDecor)
    back = Math.max(0, Math.round((h.price + ups) * UPKEEP.repoBack) - debt - Math.round(D.amt || 0));
  } else {
    const r = biz.forfeit(world, p, q.s);
    if (!r) return;
    back = Math.max(0, Math.round(r.paid * UPKEEP.repoBack) + r.till - Math.round(D.amt || 0));
  }
  if (prof.upkeep && prof.upkeep.due) delete prof.upkeep.due[q.key];
  prof.bank = (prof.bank || 0) + back;
  text(world, p, `${q.name} has been repossessed - a week of upkeep unpaid. The city sold it: ${money(back)} paid into your bank after what was owed.${q.h ? ' Your furniture is in storage for your next home; your cars and stash are still yours.' : ''}`, 'bad', !!q.h);
  p.meDirty = true;
  store.touch();
}

// Pay every place's arrears now (the Homes app: cash first, then the bank). null, or why not.
export function payAll(world, p, pay) {
  const prof = p.profile, U = prof.upkeep, amt = owed(prof);
  if (!U || amt <= 0) return 'Nothing owed.';
  if (!pay(p, amt)) return `You need ${money(amt)} (cash + bank).`;
  U.due = {};
  U.paidD = dayKey();
  store.touch(); p.meDirty = true;
  world.notify(p, `Upkeep paid: ${money(amt)}. Everything's looked after.`, 'good');
  return null;
}

// The Homes app's line for a place: { day ($ a day), due, n (days unpaid), shabby }
export function rowInfo(prof, key, daily) {
  const D = dueOf(prof, key);
  return { day: daily, ...(D && D.amt > 0 ? { due: Math.round(D.amt), n: D.n, ...(D.n >= UPKEEP.shabbyDays ? { shab: 1 } : null) } : null) };
}
export function summary(world, prof) {
  return { day: dailyTotal(world, prof), due: owed(prof), repo: UPKEEP.repoDays, shabby: UPKEEP.shabbyDays };
}

// going into a home of yours: a line when it's shabby (homes.js goInside asks)
export function enterNote(world, p, h) {
  const D = dueOf(p.profile, `h:${h.id}`);
  if (!D || !(D.amt > 0) || D.n < UPKEEP.shabbyDays) return null;
  return `The place looks shabby - ${D.n} days of upkeep unpaid (${money(D.amt)}). Pay it in the Homes app before it's repossessed.`;
}
homes.setEnterNote(enterNote);

export function update(world) {
  if (world.tick % 40 !== 29) return;
  for (const p of world.players.values()) {
    if (!p.conn || !p.profile) continue;
    try { check(world, p); } catch (e) { if (world.opts && world.opts.throwErrors) throw e; console.error('[upkeep]', e); }
  }
}
