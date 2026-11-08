// Contacts and their mission chains (docs/PROGRESSION.md "Contacts and mission chains"; the data: shared/rules-contacts.js
// CONTACTS, CONTACT). Each contact is a chain of missions built from what the game already counts (careers.js note's
// progress events), gated by your rank in the contact's career, ending in something you keep; after the chain, short
// repeatable jobs at your rank with a rotating twist. Generic: a contact is an entry in CONTACTS (and CONTACT_ORDER);
// what a mission counts is an event some system already notes, or one of the few this module checks itself -
//   'visit'    be at the contact's place (placeOf: their kind of place, in their district, by name)
//   'handover' a stolen car driven up to their place, handed over at the wheel (vehicleInteraction)
//   'have'     an item in your bag; 'duty' also counts being on duty already
// The contact texts you (a line in the HUD's notes, kept with the rank-up calls in the What's next app: careers' calls)
// when they first meet you (CONTACTS[].meet: metOk), when a mission is offered, when the next one waits for a rank, and
// calls at the chain's end (a title card: { t: 'ftue', a: 'rank' }, the rank-up's own - the bump's rank-up folded into it).
// The current mission is the main-career card in What's next (registerCardSource 'contacts'; fit CONTACT.mainFit for your
// main career's contact - above the generic career cards): offered - Accept; under
// way - Call (their brief, and the waypoint); waiting for a rank - Call.
// The chains' rewards:
//   lockup  a lock-up at the contact's place: profile.contacts.lockup { at (contact id), cars [{ model, paint, variant,
//           tint }], crates [{ t, v, s, l }] } - a car driven up to it goes in (vehicleInteraction), the place's menu
//           takes them out and puts a carried crate in (menuOpts / onMenu)
//   car     your own patrol car: profile.contacts.car { unit } - the cruiser dispatch issues you is that unit, never
//           towed back while you're on duty, back sooner when lost (cruiser.js reads it: assigned)
//   xpTo    the career's XP brought up to that rank's threshold (never past it)
//   profile.contacts: { v, c: { [id]: { met, s (the mission), acc, got, said (the mission texted), gated (the mission
//                       whose wait was texted), done, rep ({ k, tw, n, got, acc, t0 (accepted, ms), at }) | null,
//                       next (ms: the next repeatable), nrep } }, lockup?, car? } - absent on old profiles (rec: made
//                       on first use)
import { K } from '../../shared/constants.js';
import { CAREERS } from '../../shared/rules.js';
import { CONTACTS, CONTACT, CONTACT_ORDER } from '../../shared/rules-contacts.js';
import { ITEMS } from '../../shared/items.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { store } from '../store.js';
import { moved } from '../movemark.js';
import * as careers from './careers.js';
import { registerCardSource, nearest, appOn } from './whatsnext.js';
import { copFit } from './goals.js';

export { CONTACTS, CONTACT, CONTACT_ORDER };
var clock = () => Date.now();   // (a var: tests set it, maybe while the systems are still loading)
export function setClock(fn) { clock = fn || (() => Date.now()); }
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const TIER_WORD = ['crate', 'wood box', 'steel barrel', 'iron vault', 'carbon-gold case'];
const tierOf = (r) => (r <= 2 ? 0 : r <= 5 ? 1 : 2);
const posOf = (world, p) => { const ped = p.ped, v = ped && ped.vehId ? world.get(ped.vehId) : null; return v || ped || null; };

// ---- the record --------------------------------------------------------------------------------------------------------
export function book(prof) {
  const B = (prof.contacts ||= { v: 1, c: {} });
  B.c ||= {};
  return B;
}
export function rec(prof, id) {
  const B = book(prof);
  return (B.c[id] ||= { met: 0, s: 0, acc: 0, got: 0, said: -1, gated: -1, done: 0, rep: null, next: 0, nrep: 0 });
}
export const stepOf = (C, r) => (r && !r.done ? C.steps[r.s] || null : null);

// ---- the contact's place -------------------------------------------------------------------------------------------------
// Their kind of place, preferring (in turn) one named like theirs in their district, any in their district, one named
// like theirs anywhere, the police HQ, any - worked out once per map
var PLACES;
export function placeOf(world, C) {
  const m = world.map;
  PLACES ??= new WeakMap();
  let by = PLACES.get(m);
  if (!by) PLACES.set(m, (by = new Map()));
  if (by.has(C.id)) return by.get(C.id);
  const P = C.place, all = (m.pois || []).filter((q) => q && P.kinds.includes(q.kind));
  const dist = (q) => { const d = m.districtAt ? m.districtAt(q.x, q.y) : null; return d ? d.name : null; };
  const named = (q) => P.label && String(q.label || '').toLowerCase().includes(P.label.toLowerCase());
  const byKind = (l) => [...l].sort((a, b) => P.kinds.indexOf(a.kind) - P.kinds.indexOf(b.kind));
  const q = all.find((o) => named(o) && dist(o) === P.district) || byKind(all.filter((o) => dist(o) === P.district))[0] || all.find(named) || all.find((o) => o.hq) || byKind(all)[0] || null;
  by.set(C.id, q);
  return q;
}
// what they call it, and the place it is on the map when that's named otherwise ("Lucky Pawn (Crown Pawn)")
export function placeName(world, C) {
  const q = placeOf(world, C), n = C.place.name;
  return q && q.label && !String(q.label).toLowerCase().includes(String(n).replace(/^the /, '').toLowerCase()) ? `${n} (${q.label})` : n;
}
const districtOf = (world, x, y) => { const d = world.map.districtAt ? world.map.districtAt(x, y) : null; return d ? d.name : null; };
const homeDistrict = (world, C) => { const q = placeOf(world, C); return q ? districtOf(world, q.x, q.y) : null; };
const nearPlace = (world, C, at) => { const q = placeOf(world, C); return !!(q && at && Math.hypot(at.x - q.x, at.y - q.y) < CONTACT.reachPx); };

// ---- texts and calls -----------------------------------------------------------------------------------------------------
// a line from the contact: in the HUD's notes and the app's calls (careers' record, with the rank-up calls)
export function say(world, p, C, line, kind = 'text') {
  if (!line) return;
  const prof = p.profile;
  if (!prof.careers) careers.migrate(prof);
  const L = (prof.careers.calls ||= []);
  L.unshift({ who: C.name, text: line, c: C.career, at: clock(), k: kind });
  if (L.length > 5) L.length = 5;
  world.notify(p, `${kind === 'call' ? 'Call' : 'Text'} from ${C.name}: "${line}"`, 'info', `${C.short} ${kind === 'call' ? 'called' : 'texted'}`);
  p.nxDirty = true;
  store.touch();
}
// When they first get in touch: crime - you've done some crime, lead with it, or came to town to hustle; police - you've
// served, are on duty, lead with it, or are fit for a badge
export function metOk(p, C) {
  const prof = p.profile, main = careers.mainCareer(p);
  if (C.meet === 'crime') return careers.careerXp(prof, 'crime') > 0 || main === 'crime' || !!(prof.ftue && prof.ftue.ans === 'hustle');
  if (C.meet === 'police') return careers.careerXp(prof, 'police') > 0 || !!p.badge || main === 'police' || copFit(p);
  return careers.careerXp(prof, C.career) > 0 || main === C.career;
}

// ---- what counts -----------------------------------------------------------------------------------------------------------
// o: a mission (or a repeatable job); tw: its twist, if any. Does event ev (its data d) count, and by how much?
export function counts(world, p, C, o, tw, ev, d = {}) {
  if (o.ev !== ev) return 0;
  const f = o.filt || {};
  if (f.crate && !d.crate) return 0;
  if ((f.gentle || (tw && tw.gentle)) && !d.gentle) return 0;
  if (ev === 'rob' && !(d.take > 0)) return 0;
  if (tw && tw.hurt === false && d.hurt) return 0;
  if (tw && tw.turf) { const at = posOf(world, p), h = homeDistrict(world, C); if (!at || !h || districtOf(world, at.x, at.y) !== h) return 0; }
  return o.money ? Math.max(0, Math.round(d.n || 0)) : 1;
}
function onNote(world, p, ev, d) {
  if (!p || !p.profile || !appOn(p) || !p.profile.contacts) return;
  for (const id of CONTACT_ORDER) {
    const C = CONTACTS[id], r = p.profile.contacts.c[id];
    if (!C || !r) continue;
    const S = stepOf(C, r);
    if (S && r.acc) { const n = counts(world, p, C, S, null, ev, d); if (n) progress(world, p, C, r, n); }
    else if (r.done && r.rep && r.rep.acc) { const J = jobOf(C, r.rep.k), tw = twistOf(C, r.rep.tw), n = J ? counts(world, p, C, J, tw, ev, d) : 0; if (n) progressRep(world, p, C, r, n); }
  }
}
careers.onNote((world, p, ev, d) => onNote(world, p, ev, d));

// ---- the chain ---------------------------------------------------------------------------------------------------------------
export const rankIn = (p, C) => careers.careerRank(p, C.career);
// accept the mission on offer: null, or why not
export function accept(world, p, id) {
  const C = CONTACTS[id];
  if (!C) return 'No such contact.';
  const r = rec(p.profile, id), S = stepOf(C, r);
  if (!S) return r.done ? acceptRep(world, p, id) : 'Nothing on offer.';
  if (S.rank > rankIn(p, C)) return `${C.short} has nothing for you until you're a ${careers.rankName(C.career, S.rank)}.`;
  if (r.acc) return null;
  r.acc = 1; r.got = 0; r.said = r.s;
  world.notify(p, `Mission from ${C.short}: ${S.t} - ${S.sub}`, 'info', `${C.short}: ${S.t}`);
  p.nxDirty = true; store.touch();
  check(world, p, C, r);
  return null;
}
function progress(world, p, C, r, n) {
  const S = stepOf(C, r);
  if (!S) return;
  r.got = Math.min(S.n, (r.got || 0) + n);
  p.nxDirty = true; store.touch();
  if (r.got >= S.n) complete(world, p, C, r);
}
// a mission done: paid, the next one offered (or the chain's end)
export function complete(world, p, C, r) {
  const S = stepOf(C, r);
  if (!S) return;
  if (S.cash) p.profile.cash += S.cash;
  if (S.xp) careers.addXp(world, p, C.career, S.xp);
  if (S.cash || S.xp) world.notify(p, `${C.short}: ${S.t} - done. ${[S.cash ? `+${money(S.cash)}` : '', S.xp ? `+${S.xp} ${CAREERS[C.career].name.toLowerCase()} XP` : ''].filter(Boolean).join(', ')}.`, 'good', `${S.t}: done`);
  r.s++; r.acc = 0; r.got = 0;
  if (r.s >= C.steps.length) finish(world, p, C, r);
  p.nxDirty = true; p.meDirty = true; store.touch();
}
// the chain's end: what you keep, the XP bump (its rank-up folded into the one title card), the call
function finish(world, p, C, r) {
  const E = C.end, prof = p.profile, B = book(prof);
  r.done = 1; r.next = clock() + CONTACT.repeatGapS * 1000;
  if (E.lockup && !B.lockup) B.lockup = { at: C.id, cars: [], crates: [] };
  if (E.car && !B.car) B.car = { unit: unitFor(p.pid || prof.pid || '') };
  const c = C.career, seen = prof.careers && prof.careers.seen ? prof.careers.seen[c] : undefined;
  const before = seen ?? careers.careerRank(p, c);   // (the rank last shown: one the missions' own XP reached this second is folded in too)
  if (E.xpTo !== undefined) { const need = CAREERS[c].ranks[E.xpTo].xp - careers.careerXp(prof, c); if (need > 0) careers.addXp(world, p, c, need); }
  const after = careers.careerRank(p, c);
  let title = E.title, sub = `${E.sub} - ${C.name}`;
  if (after > before) {
    if (!prof.careers) careers.migrate(prof);
    prof.careers.seen[c] = after;   // (careers.js checkRanks: no second moment for the same rank)
    const un = careers.unlocksAt(c, after).map((u) => (u.soon ? `coming: ${u.name}` : u.name));
    title = careers.rankName(c, after).toUpperCase();
    sub = `${E.sub} · ${CAREERS[c].name} rank ${after + 1} of ${CAREERS[c].ranks.length}${un.length ? ` · ${un.join(' · ')}` : ''}`;
    if (world.track) world.track('rank', p, { career: c, rank: after });
  }
  say(world, p, C, E.line, 'call');
  if (p.conn) p.conn.sendJSON({ t: 'ftue', a: 'rank', c, title, sub });
  if (world.track) world.track('contact', p, { contact: C.id });
}
// a patrol unit's call sign, the same for an account every time ("4-Adam-27")
const WORDS = ['Adam', 'Baker', 'Charlie', 'David', 'Edward', 'Frank', 'George', 'King', 'Lincoln', 'Mary'];
export function unitFor(pid) {
  let h = 2166136261;
  for (let i = 0; i < pid.length; i++) h = Math.imul(h ^ pid.charCodeAt(i), 16777619);
  h >>>= 0;
  return `${1 + (h % 9)}-${WORDS[(h >>> 4) % WORDS.length]}-${10 + ((h >>> 9) % 90)}`;
}
// the profile's own patrol car, if the chain gave one (cruiser.js)
export const assigned = (p) => (p && p.profile && p.profile.contacts && p.profile.contacts.car) || null;

// ---- the repeatables -------------------------------------------------------------------------------------------------------
const jobOf = (C, k) => (C.repeat ? C.repeat.jobs.find((j) => j.id === k) || null : null);
const twistOf = (C, k) => (C.repeat ? C.repeat.twists.find((t) => t.id === k) || null : null);
const fits = (world, C, J, T) => (!T.only || T.only.includes(J.id)) && (!T.turf || !!homeDistrict(world, C));
// the next one, in turn: job by the count done, its twist rotating against it (only the twists that fit the job)
export function rollRep(world, p, C, r) {
  const R = C.repeat, i = r.nrep || 0;
  const jobs = R.jobs.filter((j) => j.need !== 'cop' || copFit(p) || p.badge);
  const J = (jobs.length ? jobs : R.jobs)[i % (jobs.length || R.jobs.length)];
  const tws = R.twists.filter((t) => fits(world, C, J, t));
  const T = tws.length ? tws[(i + Math.floor(i / R.jobs.length)) % tws.length] : null;
  const n = J.n[tierOf(rankIn(p, C))] * (T && T.twice ? 2 : 1);
  r.rep = { k: J.id, tw: T ? T.id : null, n, got: 0, acc: 0, t0: 0, at: clock() };
  return r.rep;
}
export const repTitle = (J, T, n) => `${J.t.replace('{n}', J.money ? money(n) : String(n))}${T ? ` ${T.t}` : ''}`;
export const repPay = (p, C, J, T) => ({ cash: Math.round(J.cash * (1 + CONTACT.rankStep * rankIn(p, C)) * (T ? T.mult : 1)), xp: Math.round(J.xp * (T ? T.mult : 1)) });
function acceptRep(world, p, id) {
  const C = CONTACTS[id], r = rec(p.profile, id);
  if (!r.rep) return 'Nothing on offer right now.';
  if (r.rep.acc) return null;
  r.rep.acc = 1; r.rep.got = 0; r.rep.t0 = clock();
  const J = jobOf(C, r.rep.k), T = twistOf(C, r.rep.tw);
  world.notify(p, `Job from ${C.short}: ${repTitle(J, T, r.rep.n)}`, 'info', `${C.short}: a job`);
  p.nxDirty = true; store.touch();
  return null;
}
function progressRep(world, p, C, r, n) {
  const R = r.rep;
  R.got = Math.min(R.n, R.got + n);
  p.nxDirty = true; store.touch();
  if (R.got < R.n) return;
  const J = jobOf(C, R.k), T = twistOf(C, R.tw), pay = repPay(p, C, J, T);
  p.profile.cash += pay.cash;
  careers.addXp(world, p, C.career, pay.xp);
  world.notify(p, `${C.short}'s job done: ${repTitle(J, T, R.n)}. +${money(pay.cash)}, +${pay.xp} ${CAREERS[C.career].name.toLowerCase()} XP.`, 'good', `+${money(pay.cash)}`);
  r.rep = null; r.nrep = (r.nrep || 0) + 1; r.next = clock() + CONTACT.repeatGapS * 1000;
  p.meDirty = true;
}

// ---- each second ----------------------------------------------------------------------------------------------------------
// what this module checks itself: being at their place, an item in your bag, already on duty; a repeatable run out of time
function check(world, p, C, r) {
  const S = stepOf(C, r);
  if (S && r.acc) {
    if (S.ev === 'visit' && nearPlace(world, C, posOf(world, p))) progress(world, p, C, r, 1);
    else if (S.ev === 'have' && (p.profile.inventory[S.item] || 0) > 0) progress(world, p, C, r, 1);
    else if (S.ev === 'duty' && p.badge) progress(world, p, C, r, 1);
  }
  const R = r.done ? r.rep : null;
  if (R && R.acc) {
    const T = twistOf(C, R.tw);
    if (T && T.limitS && clock() - R.t0 > T.limitS * 1000) {
      say(world, p, C, `Too slow - I gave it to someone else. Next time.`);
      r.rep = null; r.next = clock() + CONTACT.repeatGapS * 1000;
    }
  }
}
export function tick(world, p) {
  if (!appOn(p) || !p.ped) return;
  for (const id of CONTACT_ORDER) {
    const C = CONTACTS[id];
    if (!C) continue;
    const had = p.profile.contacts && p.profile.contacts.c && p.profile.contacts.c[id];
    if (!had && !metOk(p, C)) continue;
    const r = rec(p.profile, id);
    if (!r.met) { if (!metOk(p, C)) continue; r.met = 1; store.touch(); }
    const S = stepOf(C, r);
    if (S) {
      if (S.rank > rankIn(p, C)) {
        if (r.gated !== r.s) { r.gated = r.s; if (r.s > 0) say(world, p, C, C.gate.replace('{rank}', careers.rankName(C.career, S.rank))); else store.touch(); }
        continue;
      }
      if (r.said !== r.s) { r.said = r.s; say(world, p, C, S.say); }
    } else if (r.done && C.repeat && !r.rep && clock() >= (r.next || 0)) {
      rollRep(world, p, C, r);
      const L = C.repeat.say;
      say(world, p, C, L[(r.nrep || 0) % L.length]);
    }
    check(world, p, C, r);
  }
}
export function update(world) {
  if (world.tick % 20 !== 9) return;
  for (const p of world.players.values()) {
    if (!p.profile || !p.conn || !p.ped || p.ped.dead) continue;
    try { tick(world, p); } catch (e) { if (world.opts && world.opts.throwErrors) throw e; console.error('[contacts]', e); }
  }
}

// ---- the What's next card --------------------------------------------------------------------------------------------------
// where a mission points: their place, the nearest of its kinds of place, the armored truck run under way (its van)
function whereOf(world, p, C, o) {
  if (o.place === 'home') { const q = placeOf(world, C); return q ? { x: q.x, y: q.y, label: placeName(world, C) } : null; }
  if (Array.isArray(o.place)) { const q = nearest(world, posOf(world, p), o.place); return q ? { x: q.x, y: q.y, label: q.label } : null; }
  if (o.ev === 'escort') {
    const run = world.cal && world.cal.live && world.cal.live.find((q) => q.id === 'armored' && !q.over), van = run && run.sev ? world.get(run.sev.van) : null;
    return van && !van.removed ? { x: van.x, y: van.y, label: 'The armored truck' } : null;
  }
  return null;
}
const amount = (o, n) => (o.money ? money(n) : String(n));
export function cardsFor(world, p) {
  if (!appOn(p) || !p.profile.contacts) return [];
  const out = [], main = careers.mainCareer(p);
  for (const id of CONTACT_ORDER) {
    const C = CONTACTS[id], r = p.profile.contacts.c[id];
    if (!C || !r || !r.met) continue;
    const fit = C.career === main ? CONTACT.mainFit : 0.6, S = stepOf(C, r), base = { career: C.career, who: C.name, icon: C.icon, slot: 'career' };
    if (S) {
      const w = whereOf(world, p, C, S), at = w ? { x: w.x, y: w.y } : {};
      if (S.rank > rankIn(p, C)) {
        const need = CAREERS[C.career].ranks[S.rank], xp = careers.careerXp(p.profile, C.career), rk = need.name;
        out.push({ ...base, id: `contact:${id}:gate:${r.s}`, fit: 0.3, title: `${C.name}: the next job is for a ${rk}`, sub: `${xp} / ${need.xp} ${CAREERS[C.career].name.toLowerCase()} XP`, pay: 0, mins: 30, btn: { k: 'call', label: `Call ${C.short}` }, call: C.gate.replace('{rank}', rk) });
        continue;
      }
      const cop = S.need === 'cop' && !p.badge ? ' Go on duty first.' : '';
      if (!r.acc) out.push({ ...base, ...at, id: `contact:${id}:${r.s}`, fit, title: `${C.name} has a job: ${S.t}`, sub: `${S.sub}${cop}`, pay: S.cash, mins: 8, btn: { k: 'accept', label: 'Accept' }, accept: (wd, q) => accept(wd, q, id) });
      else out.push({ ...base, ...at, id: `contact:${id}:${r.s}:on`, fit, title: `${C.short}: ${S.t}`, sub: `${S.n > 1 || S.money ? `${amount(S, r.got)} / ${amount(S, S.n)} · ` : ''}${S.sub}${cop}`, pay: S.cash, mins: 6, btn: { k: 'call', label: `Call ${C.short}` }, call: S.call });
    } else if (r.done && r.rep) {
      const R = r.rep, J = jobOf(C, R.k), T = twistOf(C, R.tw);
      if (!J) continue;
      const w = whereOf(world, p, C, J), at = w ? { x: w.x, y: w.y } : {}, pay = repPay(p, C, J, T);
      const left = T && T.limitS && R.acc ? Math.max(0, Math.ceil((T.limitS * 1000 - (clock() - R.t0)) / 60000)) : null;
      if (!R.acc) out.push({ ...base, ...at, id: `contact:${id}:rep:${r.nrep || 0}`, fit, title: `${C.name} has a job: ${repTitle(J, T, R.n)}`, sub: `+${pay.xp} XP${J.need === 'cop' && !p.badge ? ' · on duty' : ''}`, pay: pay.cash, mins: 8, btn: { k: 'accept', label: 'Accept' }, accept: (wd, q) => accept(wd, q, id) });
      else out.push({ ...base, ...at, id: `contact:${id}:rep:${r.nrep || 0}:on`, fit, title: `${C.short}: ${repTitle(J, T, R.n)}`, sub: `${amount(J, R.got)} / ${amount(J, R.n)}${left !== null ? ` · ${left} min left` : ''}`, pay: pay.cash, mins: 6, btn: { k: 'call', label: `Call ${C.short}` }, call: T && T.turf ? `In ${homeDistrict(world, C)}, mind - it only counts there.` : 'You know what to do.' });
    }
  }
  return out;
}
registerCardSource('contacts', (world, p) => cardsFor(world, p), { slot: 'career' });

// ---- at the wheel by their place: a stolen car handed over; a car into your lock-up ----------------------------------------
const lockupOf = (p) => { const B = p.profile.contacts; return B && B.lockup ? B.lockup : null; };
const stealable = (p, v) => v.stolenBy && v.stolenBy.has(p.pid) && v.owner !== p.pid && !v.def.police && !v.rentedBy && !v.workTruck && !v.cruiserOf && !v.starter && (v.def.kind === 'car' || v.def.kind === 'bike') && !v.def.horse && !v.def.pedal;
const keepable = (p, v) => v.owner !== p.pid && !v.def.police && !v.rentedBy && !v.workTruck && !v.cruiserOf && !v.starter && (v.def.kind === 'car' || v.def.kind === 'bike') && !v.def.horse && !v.def.board && !v.def.surfboard;
export function vehicleInteraction(world, p) {
  const ped = p.ped, v = ped && ped.vehId ? world.get(ped.vehId) : null;
  if (!v || ped.seat !== 0 || v.wreckAt || !p.profile.contacts) return null;
  for (const id of CONTACT_ORDER) {
    const C = CONTACTS[id], r = p.profile.contacts.c[id], S = stepOf(C, r);
    if (S && r.acc && S.ev === 'handover' && nearPlace(world, C, v) && stealable(p, v)) return { label: `Hand the ${v.def.name} over to ${C.short}`, run: () => handOver(world, p, C, v) };
  }
  const L = lockupOf(p), C = L && CONTACTS[L.at];
  if (C && nearPlace(world, C, v) && keepable(p, v)) {
    if (Math.hypot(v.vx, v.vy) > 60) return { label: 'Slow down to put it in your lock-up', run: () => {} };
    return { label: `Put the ${v.def.name} in your lock-up (${L.cars.length}/${CONTACT.lockupCars})`, run: () => intoLockup(world, p, v) };
  }
  return null;
}
// out of the car by the door, the car gone (taken in: theirs or the lock-up's)
function leave(world, p, v, C) {
  const ped = p.ped, q = placeOf(world, C);
  for (const cid of v.cargo || []) if (cid) { const c = world.get(cid); if (c) { c.state = 'ground'; c.parent = 0; c.x = v.x; c.y = v.y; } }
  ped.vehId = 0; ped.seat = -1;
  if (q) { ped.x = q.x; ped.y = q.y + 12; } else { ped.x = v.x; ped.y = v.y; }
  moved(ped); world.place(ped);
  if (p.activeVehicle === v.id) p.activeVehicle = 0;
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
  world.remove(v);
  p.meDirty = true;
}
function handOver(world, p, C, v) {
  if ((p.wanted || 0) > 0) { world.notify(p, `${C.short}: "Not with the police on your tail. Lose them, then come back."`, 'warn'); return; }
  if (v.seats.some((s, i) => i > 0 && s)) { world.notify(p, 'Your passengers have to get out first.', 'warn'); return; }
  leave(world, p, v, C);
  world.notify(p, `${C.short} takes the keys to the ${v.def.name}.`, 'good');
  const r = rec(p.profile, C.id);
  progress(world, p, C, r, 1);
}
export function intoLockup(world, p, v) {
  const L = lockupOf(p), C = L && CONTACTS[L.at];
  if (!C) return 'No lock-up.';
  let why = null;
  if ((p.wanted || 0) > 0) why = 'Not with the police watching - lose them first.';
  else if (L.cars.length >= CONTACT.lockupCars) why = `Your lock-up is full (${L.cars.length}/${CONTACT.lockupCars} cars).`;
  else if (v.seats.some((s, i) => i > 0 && s)) why = 'Your passengers have to get out first.';
  if (why) { world.notify(p, why, 'warn'); return why; }
  L.cars.push({ model: v.model, paint: v.paint, variant: v.variant, ...(v.tint !== undefined ? { tint: v.tint } : {}) });
  const name = v.def.name;
  leave(world, p, v, C);
  store.touch();
  world.notify(p, `The ${name} is in your lock-up (${L.cars.length}/${CONTACT.lockupCars}). Nobody saw a thing.`, 'good');
  return null;
}

// ---- the lock-up at its place's counter --------------------------------------------------------------------------------------
export function menuOpts(world, p, poi, opts) {
  const L = lockupOf(p), C = L && CONTACTS[L.at], q = C && placeOf(world, C);
  if (!q || q.id !== poi.id) return;
  const ped = p.ped, crate = ped && ped.carrying ? world.get(ped.carrying) : null;
  L.cars.forEach((c, i) => opts.push({ id: `lku:c:${i}`, label: `Your lock-up: take out the ${(VEHICLES[c.model] || {}).name || 'car'}`, note: 'parked out front' }));
  L.crates.forEach((c, i) => opts.push({ id: `lku:t:${i}`, label: `Your lock-up: take out the ${TIER_WORD[c.t] || 'crate'}`, note: money(c.v), dis: !!(ped && ped.carrying) }));
  if (crate && crate.kind === K.CRATE && !crate.job) opts.push({ id: 'lku:p', label: `Your lock-up: put the ${TIER_WORD[crate.tier] || 'crate'} away`, note: `${L.crates.length}/${CONTACT.lockupCrates}`, dis: L.crates.length >= CONTACT.lockupCrates });
  if (!L.cars.length && !L.crates.length && !crate) opts.push({ id: 'lku:i', label: 'Your lock-up: empty', note: `drive a car up to it; carry a crate in`, dis: true });
}
export function onMenu(world, p, poi, parts) {
  const L = lockupOf(p), ped = p.ped, prof = p.profile;
  if (!L || !ped) return 'No lock-up here.';
  if (parts[1] === 'c') {
    const i = Number(parts[2]), c = L.cars[i];
    if (!c || !VEHICLES[c.model]) return 'Not in your lock-up.';
    const at = spotNear(world, poi, VEHICLES[c.model]);
    L.cars.splice(i, 1);
    const v = world.spawnVehicle(c.model, at.x, at.y, at.a, { paint: c.paint, variant: c.variant, npcOwned: false });
    if (c.tint !== undefined) v.tint = c.tint;
    (v.stolenBy ||= new Set()).add(p.pid);   // (yours to drive off in: no theft - and anyone's to take after)
    v.lockupOf = p.pid;
    store.touch(); p.meDirty = true;
    world.notify(p, `The ${v.def.name} is out of your lock-up, parked out front.`, 'good');
    return null;
  }
  if (parts[1] === 't') {
    const i = Number(parts[2]), c = L.crates[i];
    if (!c) return 'Not in your lock-up.';
    if (ped.dead || ped.vehId || ped.carrying) return 'Your hands have to be free.';
    L.crates.splice(i, 1);
    const crate = world.spawnCrate(c.t, ped.x, ped.y, { contraband: !!c.s, label: c.l, value: c.v, owner: p.pid });
    crate.extract = { src: 'stash', stolen: !!c.s, ev: null, from: { x: ped.x, y: ped.y }, by: p.pid };
    crate.state = 'carried'; crate.parent = ped.id; crate.z = 10;
    ped.carrying = crate.id;
    store.touch(); p.meDirty = true;
    world.notify(p, `You've got the ${TIER_WORD[c.t] || 'crate'} - it pays once it's delivered.`, 'info');
    return null;
  }
  if (parts[1] === 'p') {
    const crate = ped.carrying ? world.get(ped.carrying) : null;
    if (!crate || crate.kind !== K.CRATE) return 'You\'re not carrying a crate.';
    if (crate.job) return 'That\'s somebody\'s delivery - it doesn\'t go in your lock-up.';
    if (L.crates.length >= CONTACT.lockupCrates) return `Your lock-up is full (${CONTACT.lockupCrates} crates).`;
    L.crates.push({ t: crate.tier, v: crate.value || 0, s: crate.contraband || (crate.extract && crate.extract.stolen) ? 1 : 0, l: crate.label || '' });
    const kept = world.extractLive && world.extractLive.get(crate.id);
    if (kept) kept.done = 'lockup';   // (put away, not lost: extract.js)
    if (crate.extract) crate.extract.done = 'lockup';
    ped.carrying = 0;
    world.remove(crate);
    store.touch(); p.meDirty = true;
    world.notify(p, `The ${TIER_WORD[crate.tier] || 'crate'} is in your lock-up (${L.crates.length}/${CONTACT.lockupCrates}).`, 'good');
    void prof;
    return null;
  }
  return 'Not here.';
}
// a road spot by the place, clear of other cars
function spotNear(world, poi, def) {
  const nodes = (world.map.nodes || []).filter((n) => n.lvl === 0 || n.lvl === undefined);
  let best = null, bd = Infinity;
  for (const n of nodes) {
    const d = Math.hypot(n.x - poi.x, n.y - poi.y);
    if (d < bd && d < 600 && !world.query(n.x, n.y, def.L, K.VEH).length) { bd = d; best = n; }
  }
  return best ? { x: best.x, y: best.y, a: Math.atan2(poi.y - best.y, poi.x - best.x) + Math.PI / 2 } : { x: poi.x, y: poi.y + 80, a: 0 };
}

// ---- the app's Contacts line and the dev menu -------------------------------------------------------------------------------
// each contact you've met: { id, name, career, step, of, title, done, rep } (the dev menu's report; the Guide's)
export function summary(p) {
  const out = [];
  for (const id of CONTACT_ORDER) {
    const C = CONTACTS[id], r = p.profile.contacts && p.profile.contacts.c[id];
    if (!r || !r.met) continue;
    const S = stepOf(C, r);
    out.push({ id, name: C.name, career: C.career, step: r.s, of: C.steps.length, title: S ? S.t : null, acc: r.acc ? 1 : 0, done: r.done ? 1 : 0, rep: r.rep ? r.rep.k : null });
  }
  return out;
}
// (dev) the chain one step on: met if not yet; waiting for a rank - the XP brought up to it; else the mission done (paid)
export function devJump(world, p, id) {
  const C = CONTACTS[id];
  if (!C) return `No contact "${id}".`;
  const r = rec(p.profile, id);
  r.met = 1;
  const S = stepOf(C, r);
  if (!S) {
    if (!r.rep) { r.next = 0; rollRep(world, p, C, r); return `${C.short}: a repeatable job offered.`; }
    if (!r.rep.acc) acceptRep(world, p, id);
    progressRep(world, p, C, r, r.rep.n - r.rep.got);
    return `${C.short}: the repeatable job done.`;
  }
  if (S.rank > rankIn(p, C)) {
    careers.addXp(world, p, C.career, CAREERS[C.career].ranks[S.rank].xp - careers.careerXp(p.profile, C.career));
    return `${C.short}: ${C.career} XP up to ${careers.rankName(C.career, S.rank)}.`;
  }
  r.acc = 1; r.said = r.s;
  complete(world, p, C, r);
  return `${C.short}: "${S.t}" done (${r.done ? 'the chain is over' : `mission ${r.s + 1} of ${C.steps.length} next`}).`;
}
export function devReset(p) { const B = p.profile.contacts; if (B) delete p.profile.contacts; store.touch(); p.nxDirty = true; return 'Contacts reset: chains, lock-up and patrol car gone.'; }
