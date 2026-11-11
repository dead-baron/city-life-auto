// Crews (the owner, 10-08: "friends and crews (up to 4): land on the same server, crew chat, crew events and heists";
// the standing rule: crews hold up to 4 for now). Walk up to another player and the action button asks them into your
// crew; they say yes the same way, near you, while the asking stands (CREW.inviteS). A crew of up to CREW.max:
// - you see each other on the radar and the big map wherever you are (a green blip with the name), and your mates' name
//   tags are green;
// - no friendly fire: a crewmate's blows, shots and blasts don't hurt you (combat.js damage), so nothing to report;
// - crew chat: the phone's Crew app sends one of the quick lines (CREW.says) to everyone in it, and free text goes on
//   the crew channel (server/chat.js);
// - a bank heist's drawers are split with the crewmates there when the vault opens (heist.js);
// - the Crew app lists who's in it, who's on and how far, a waypoint to any of them, leaving, and (whoever started it)
//   taking someone off it.
// The crews are kept with the profiles (store.kept.crews) so a restart doesn't break them up; you stay in yours while
// you're offline.
// A crew of your own (the crime career's 'crew' unlock, docs/PROGRESSION.md - the numbers: CREW): its lead, at that rank,
// founds it in the Crew app (found: CREW.foundCost; a crew of one to start, asking people in as before) - a name and a
// tag (tagOf: by every member's name - the nameplate's k, cosmetics.js plateOf); a crew bank (CREW.cut of what a member
// earns on a job done with a crewmate near - a shift, fencing, a heist contract: cutFrom - members put money in, the lead
// pays it out evenly); its upkeep (CREW.upkeep a wall-clock day from the bank - bill; CREW.lapseDays unpaid in a row and
// the name lapses: an ordinary crew again, the bank kept). A season's end empties the bank and the arrears (seasonReset:
// the crews' holdings; the members and the name stay - seasons.js).
//   store.kept.crews: id -> { lead (pid), members [pid], names { pid: name }, f? { name, tag, at } (founded), bank? ($),
//                     up? { d (the day billed to), owed, n (days unpaid in a row) } }; p.crewAsk: { from (pid), at }
import { CREW } from '../../shared/rules.js';
import { cleanName, nameKey } from '../../shared/names.js';
import { store } from '../store.js';
import * as careers from './careers.js';   // (the 'crew' unlock; the jobs done together: careers.js onNote)
import { dayKey } from './goals.js';

const kept = () => (store.kept.crews ||= {});
// Guests and crews (the owner, 11-04): while a sign-in is on offer (server/launch.js sets the policy), a guest can join a
// crew but not start or lead one. With no policy - offline practice, or no provider switched on - nothing changes.
let policy = { limited: () => false };
export function setPolicy(p) { policy = { ...policy, ...p }; }
export const GUEST_LEAD = 'Guests can\'t start or lead a crew - sign in (Settings \u2192 Account) to lead one.';
const limited = (p) => !!(p && policy.limited(p));
let index = null, indexOf = null, seq = 0;   // pid -> crew id (rebuilt when the crews change, or for a new store)
function idx() {
  const K = kept();
  if (index && indexOf === K) return index;
  index = new Map(); indexOf = K;
  for (const [id, c] of Object.entries(K)) for (const pid of c.members) index.set(pid, id);
  return index;
}
const changed = () => { index = null; store.touch(); };

// a profile reset to a new character (players.js wipeProgress): out of its crew with nothing said (the reset itself is
// the news); a crew left with one is gone
export function forget(pid) {
  const K = kept();
  for (const [id, c] of Object.entries(K)) {
    if (!c.members.includes(pid)) continue;
    c.members = c.members.filter((q) => q !== pid);
    if (c.names) delete c.names[pid];
    if (c.members.length < minOf(c)) delete K[id]; else if (c.lead === pid) c.lead = c.members[0];
  }
  changed();
}
// a founded crew stands with its lead alone; an ordinary one needs two
export const minOf = (c) => (c && c.f ? 1 : 2);
export function crewOf(pid) { const id = idx().get(pid); return id ? kept()[id] : null; }
export function crewIdOf(pid) { return idx().get(pid) || null; }
// the same crew (two different players)
export function mates(a, b) {
  if (!a || !b || a === b) return false;
  const id = idx().get(a.pid);
  return !!id && id === idx().get(b.pid);
}
// the crew's players online now (p's crewmates, not p)
export function matesOnline(world, p) {
  const c = crewOf(p.pid);
  if (!c) return [];
  const out = [];
  for (const pid of c.members) { if (pid === p.pid) continue; const q = world.players.get(pid); if (q) out.push(q); }
  return out;
}
const tell = (world, c, text, tone = 'info', but = null) => { for (const pid of c.members) { const q = world.players.get(pid); if (q && q !== but) { world.notify(q, text, tone); q.meDirty = true; } } };
const fit = (q) => q && q.ped && !q.ped.dead && !q.ped.vehId && !q.custody && !q.prison && !q.ped.hidden;

// The action button near another player (players.js interaction): say yes to their asking (near the top of the list),
// or ask them in (near the bottom: a shop's door, a car and the rest come first)
export function joinPrompt(world, p) {
  const ped = p.ped, ask = p.crewAsk;
  if (!ask || !fit(p) || world.time - ask.at > CREW.inviteS || crewOf(p.pid)) return null;
  const q = world.players.get(ask.from);
  if (fit(q) && Math.hypot(q.ped.x - ped.x, q.ped.y - ped.y) <= CREW.reach * 1.5) return { label: `Join ${q.name}'s crew`, run: () => accept(world, p) };
  return null;
}
export function askPrompt(world, p) {
  const ped = p.ped;
  if (!fit(p)) return null;
  const mine = crewOf(p.pid);
  if (mine && mine.members.length >= CREW.max) return null;
  let best = null, bd = CREW.reach;
  for (const q of world.players.values()) {
    if (q === p || !fit(q)) continue;
    const d = Math.hypot(q.ped.x - ped.x, q.ped.y - ped.y);
    if (d < bd && !crewOf(q.pid)) { bd = d; best = q; }
  }
  if (!best) return null;
  if (best.crewAsk && best.crewAsk.from === p.pid && world.time - best.crewAsk.at <= CREW.inviteS + CREW.askAgainS) return { label: `Asked ${best.name} into your crew...`, passive: true, run: () => {} };
  if (best.crewAsk && world.time - best.crewAsk.at <= CREW.inviteS) return null;   // (someone else's asking stands)
  return { label: `Ask ${best.name} into your crew`, run: () => invite(world, p, best) };
}

export function invite(world, p, q) {
  if (!fit(p) || !fit(q) || q === p || crewOf(q.pid)) return false;
  const mine = crewOf(p.pid);
  if (!mine && limited(p)) { world.notify(p, GUEST_LEAD, 'warn'); return false; }   // (asking someone in starts a crew you'd lead)
  if (mine && mine.members.length >= CREW.max) { world.notify(p, `Your crew's full (${CREW.max}).`, 'warn'); return false; }
  const prev = q.crewAsk;   // (an asking that stands isn't overwritten; the same one again only after a while)
  if (prev && world.time - prev.at <= CREW.inviteS + (prev.from === p.pid ? CREW.askAgainS : 0)) return false;
  q.crewAsk = { from: p.pid, at: world.time };
  world.notify(q, `${p.name} asks you into their crew - walk up to them and press the action button to join.`, 'info');
  world.notify(p, `You asked ${q.name} into your crew.`, 'info');
  p.meDirty = true; q.meDirty = true;
  return true;
}

export function accept(world, p) {
  const ask = p.crewAsk;
  p.crewAsk = null;
  const q = ask && world.players.get(ask.from);
  if (!q || world.time - ask.at > CREW.inviteS || crewOf(p.pid)) return false;
  const K = kept();
  let id = crewIdOf(q.pid), c = id ? K[id] : null;
  if (c && c.members.length >= CREW.max) { world.notify(p, `${q.name}'s crew is full now.`, 'warn'); return false; }
  if (!c && limited(q)) { world.notify(p, `${q.name} can't start a crew as a guest.`, 'warn'); world.notify(q, GUEST_LEAD, 'warn'); return false; }
  if (!c) {
    do id = `c${Date.now().toString(36)}${(seq++).toString(36)}`; while (K[id]);   // (two crews in one tick: their own ids)
    c = K[id] = { lead: q.pid, members: [q.pid], names: { [q.pid]: q.name } };
  }
  c.members.push(p.pid);
  c.names[p.pid] = p.name;
  p.npDirty = true;
  changed();
  if (world.track) for (const pid of c.members) { const m = world.players.get(pid); if (m && m !== p) world.track('crewed', p, { other: m }); }   // (contacts for phone messages: server/chat.js)
  tell(world, c, `${p.name} joined the crew (${c.members.length}/${CREW.max}).`, 'good');
  return true;
}

// out of it (the Crew app); a crew of one is no crew
export function leave(world, p, why = 'left the crew') {
  const id = crewIdOf(p.pid), K = kept(), c = id ? K[id] : null;
  if (!c) return false;
  c.members = c.members.filter((pid) => pid !== p.pid);
  delete c.names[p.pid];
  if (c.lead === p.pid) c.lead = c.members.find((pid) => { const m = world.players.get(pid); return !(m && limited(m)); }) || c.members[0] || null;   // (a signed-in member first: a guest leads only if there's nobody else)
  const who = p.name || 'Someone';
  if (c.members.length < minOf(c)) {
    delete K[id];
    if (c.bank > 0) { const last = c.members[0] || p.pid, prof = store.get(last); if (prof) prof.bank = (prof.bank || 0) + c.bank; }   // (the bank to whoever's left - or the last out)
    for (const pid of c.members) { const q = world.players.get(pid); if (q) { world.notify(q, `${who} ${why} - the crew's broken up.`, 'info'); q.meDirty = true; } }
  } else tell(world, c, `${who} ${why}.`, 'info');
  changed();
  for (const pid of [p.pid, ...c.members]) { const q = world.players.get(pid); if (q) q.npDirty = true; }   // (the tag off: cosmetics.js)
  p.meDirty = true;
  return true;
}
// whoever started it takes someone off it (k: their place in the list)
export function kick(world, p, k, name = null) {
  const c = crewOf(p.pid);
  if (!c || c.lead !== p.pid) return 'Only whoever started the crew can do that.';
  const pid = c.members[k];
  if (!pid || pid === p.pid) return 'Not in the crew.';
  if (name !== null && name !== undefined && String(name) !== (c.names[pid] || '')) return 'The crew\'s changed - have another look.';   // (the list the page had is out of date)
  const q = world.players.get(pid);
  leave(world, q || { pid, name: c.names[pid] }, 'was taken off the crew');
  if (q) world.notify(q, 'You were taken off the crew.', 'info');
  return null;
}

const lastSay = new WeakMap();
export function say(world, p, i) {
  const c = crewOf(p.pid), line = CREW.says[i | 0];
  if (!c || !line) return false;
  const last = lastSay.get(p) || -99;
  if (world.time - last < CREW.sayGapS) return false;
  lastSay.set(p, world.time);
  const where = p.ped && i === 2 ? world.map.districtAt(p.ped.x, p.ped.y).name : '';
  tell(world, c, `${p.name} (crew): ${line}${where ? ` - ${where}` : ''}`, 'info');
  return true;
}

// your crewmates on the radar and the big map (players.js buildMe radar): where each one online is
export function radar(world, p, out) {
  for (const q of matesOnline(world, p)) {
    if (!q.ped || q.prison) continue;
    out.push({ k: 'crew', x: Math.round(q.ped.x), y: Math.round(q.ped.y), n: q.name, d: q.ped.dead ? 1 : 0 });
  }
  return out;
}
// the page's own: whose name tags are green (their people's ids), the crew's size; asked in (and by whom)
export function meInfo(world, p) {
  const c = crewOf(p.pid), ask = p.crewAsk && world.time - p.crewAsk.at <= CREW.inviteS ? world.players.get(p.crewAsk.from) : null;
  if (!c && !ask) return null;
  return { ids: c ? matesOnline(world, p).filter((q) => q.ped).map((q) => q.ped.id) : [], n: c ? c.members.length : 0, ask: ask ? ask.name : null };
}

// The phone's Crew app
export function panel(world, p) {
  const c = crewOf(p.pid), me = p.ped;
  const fnd = { can: canFound(p, c) ? 1 : 0, need: careers.rankName('crime', unlockRank()), cost: CREW.foundCost };
  if (!c) return { t: 'crew', crew: null, max: CREW.max, says: CREW.says, found: fnd };
  const members = c.members.map((pid, k) => {
    const q = world.players.get(pid), at = q && q.ped && !q.prison ? q.ped : null;
    if (q && q.name && c.names[pid] !== q.name) c.names[pid] = q.name;   // (a new name: the list keeps up)
    return { k, n: (q && q.name) || c.names[pid] || 'Someone', me: pid === p.pid, lead: pid === c.lead, on: !!q, x: at ? Math.round(at.x) : null, y: at ? Math.round(at.y) : null, d: at && me ? Math.round(Math.hypot(at.x - me.x, at.y - me.y)) : null, where: at ? world.map.districtAt(at.x, at.y).name : null };
  });
  const own = c.f ? { name: c.f.name, tag: c.f.tag, bank: Math.round(c.bank || 0), day: CREW.upkeep, owed: Math.round((c.up && c.up.owed) || 0), n: (c.up && c.up.owed > 0 && c.up.n) || 0, lapse: CREW.lapseDays, cut: CREW.cut, put: CREW.put } : null;
  return { t: 'crew', crew: { lead: c.lead === p.pid, members, own }, max: CREW.max, says: CREW.says, found: fnd };
}
// the phone's messages: { a: 'crewsay', i } / 'crewleave' / 'crewkick', k / 'crewfound', name / 'crewput' / 'crewpay'
export function phone(world, p, msg) {
  let err = null;
  if (msg.a === 'crewsay') say(world, p, Number(msg.i));
  else if (msg.a === 'crewleave') leave(world, p);
  else if (msg.a === 'crewkick') err = kick(world, p, Number(msg.k), msg.n);
  else if (msg.a === 'crewfound') err = found(world, p, msg.name);
  else if (msg.a === 'crewput') err = put(world, p);
  else if (msg.a === 'crewpay') err = payout(world, p);
  if (err) world.notify(p, err, 'warn');
  return panel(world, p);
}

// ---- a crew of your own --------------------------------------------------------------------------------------------------
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
// the crime rank the 'crew' unlock comes at
export function unlockRank() { const R = careers.CAREERS.crime.ranks; for (let i = 0; i < R.length; i++) if ((R[i].unlock || []).some((u) => u.k === 'crew')) return i; return R.length - 1; }
// may found one: the rank, signed in, and leading the crew you're in (or in none); not founded already
export const canFound = (p, c = crewOf(p.pid)) => careers.hasUnlock(p, 'crew') && !limited(p) && (!c || (c.lead === p.pid && !c.f));
// the tag by your name: the name's initials (a one-word name: its first letters), up to CREW.tagMax, capitals
export function tagFor(name) {
  const words = String(name).split(/[\s_.-]+/).filter(Boolean).map((w) => w.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean);
  const t = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] || 'CREW');
  return t.slice(0, CREW.tagMax).toUpperCase();
}
export function tagOf(pid) { const c = crewOf(pid); return c && c.f ? c.f.tag : null; }
// cash first, then the bank
function spend(prof, n) {
  if ((prof.cash || 0) + (prof.bank || 0) < n) return false;
  const c = Math.min(prof.cash || 0, n);
  prof.cash -= c; if (n - c > 0) prof.bank -= n - c;
  return true;
}
// Found the crew (the Crew app): -> null, or why not
export function found(world, p, raw) {
  const c0 = crewOf(p.pid);
  if (c0 && c0.f) return `Your crew is ${c0.f.name} already.`;
  if (c0 && c0.lead !== p.pid) return 'Only whoever leads the crew can found it.';
  if (limited(p)) return GUEST_LEAD;
  if (!careers.hasUnlock(p, 'crew')) return `A crew of your own comes at ${careers.rankName('crime', unlockRank())} (crime).`;
  const r = cleanName(raw);
  if (r.err) return r.err.replace('A name', 'A crew\'s name');
  const key = nameKey(r.name);
  for (const q of Object.values(kept())) if (q.f && nameKey(q.f.name) === key) return `${r.name} is another crew's name - pick another.`;
  if (!spend(p.profile, CREW.foundCost)) return `Founding a crew costs ${money(CREW.foundCost)} (cash + bank).`;
  const K = kept();
  let c = c0;
  if (!c) { let id; do id = `c${Date.now().toString(36)}${(seq++).toString(36)}`; while (K[id]); c = K[id] = { lead: p.pid, members: [p.pid], names: { [p.pid]: p.name } }; }
  c.f = { name: r.name, tag: tagFor(r.name), at: Date.now() };
  c.bank = c.bank || 0;
  c.up = { d: dayKey(), owed: 0, n: 0 };
  changed();
  for (const pid of c.members) { const q = world.players.get(pid); if (q) q.npDirty = true; }
  tell(world, c, `${p.name} founded the crew: ${c.f.name} [${c.f.tag}]. The tag's by every member's name; the crew bank takes a ${Math.round(CREW.cut * 100)}% cut of jobs done together, and pays ${money(CREW.upkeep)} a day upkeep.`, 'good');
  if (world.track) world.track('crewfound', p, { name: c.f.name });
  return null;
}
// put CREW.put into the crew bank (any member)
export function put(world, p) {
  const c = crewOf(p.pid);
  if (!c || !c.f) return 'Only a founded crew has a bank.';
  if (!spend(p.profile, CREW.put)) return `You need ${money(CREW.put)}.`;
  c.bank = (c.bank || 0) + CREW.put;
  store.touch(); p.meDirty = true;
  settle(world, c);
  tell(world, c, `${p.name} put ${money(CREW.put)} in the crew bank (${money(c.bank)}).`, 'info');
  return null;
}
// the lead pays the bank out evenly, into every member's bank (online or not); what doesn't divide stays
export function payout(world, p) {
  const c = crewOf(p.pid);
  if (!c || !c.f) return 'Only a founded crew has a bank.';
  if (c.lead !== p.pid) return 'Only the crew\'s lead pays out the bank.';
  if (c.up && c.up.owed > 0) return `The crew owes ${money(c.up.owed)} of upkeep - that comes first.`;
  const each = Math.floor((c.bank || 0) / c.members.length);
  if (each < 1) return 'Nothing in the crew bank to pay out.';
  for (const pid of c.members) { const prof = store.get(pid); if (prof) prof.bank = (prof.bank || 0) + each; const q = world.players.get(pid); if (q) q.meDirty = true; }
  c.bank -= each * c.members.length;
  store.touch();
  tell(world, c, `${p.name} paid out the crew bank: ${money(each)} each, into your bank.`, 'good');
  return null;
}
// The members' cut: money a member made on a job done together (a crewmate online, up and about within CREW.togetherPx)
// - CREW.cut of it from them into the crew bank. -> the cut ($), 0 for none
export function cutFrom(world, p, n, what = 'the job') {
  const c = p && crewOf(p.pid);
  if (!c || !c.f || !(n > 0) || !p.ped) return 0;
  const near = matesOnline(world, p).some((q) => q.ped && !q.ped.dead && !q.prison && Math.hypot(q.ped.x - p.ped.x, q.ped.y - p.ped.y) <= CREW.togetherPx);
  if (!near) return 0;
  const prof = p.profile, cut = Math.min(Math.round(n * CREW.cut), Math.max(0, Math.floor((prof.cash || 0) + (prof.bank || 0))));
  if (cut < 1 || !spend(prof, cut)) return 0;
  c.bank = (c.bank || 0) + cut;
  store.touch(); p.meDirty = true;
  settle(world, c);
  world.notify(p, `${money(cut)} of ${what} to ${c.f.name}'s crew bank - a job done together (${money(c.bank)} in it).`, 'info');
  return cut;
}
careers.onNote((world, p, ev, d) => {
  if (ev === 'shift' && d && d.n > 0) cutFrom(world, p, d.n, `that ${d.job || 'job'}'s pay`);
  else if (ev === 'fence' && d && d.n > 0) cutFrom(world, p, d.n, d.crate ? 'the crate\'s pay' : 'the fenced money');   // (what the fence paid)
});
// arrears paid from the bank the moment it can
function settle(world, c) {
  const U = c.up;
  if (!U || !(U.owed > 0) || !(c.bank > 0)) return;
  const pay = Math.min(c.bank, U.owed);
  c.bank -= pay; U.owed -= pay;
  if (U.owed <= 0) { U.owed = 0; U.n = 0; }
  store.touch();
  void world;
}
// The crew's upkeep on the wall-clock day (goals.js dayKey): a day's worth for each day gone by (at most a week at once),
// from the bank; unpaid CREW.lapseDays days in a row - the name lapses (an ordinary crew; with one left, none: its bank to
// them). (now: ms - the tests' clock)
export function bill(world, c, now = Date.now()) {
  if (!c || !c.f) return;
  const today = dayKey(now), U = (c.up ||= { d: today, owed: 0, n: 0 });
  if (today <= U.d) return;
  const days = Math.min(7, today - U.d);
  U.d = today;
  const was = U.owed > 0;
  U.owed += CREW.upkeep * days;
  const cover = Math.min(c.bank || 0, U.owed);
  c.bank = (c.bank || 0) - cover; U.owed -= cover;
  if (U.owed > 0) U.n += was ? days : Math.max(1, Math.ceil(U.owed / CREW.upkeep)); else U.n = 0;
  store.touch();
  if (U.owed <= 0) return;
  if (U.n >= CREW.lapseDays) {
    const name = c.f.name;
    delete c.f; c.up = null;
    tell(world, c, `${name}'s name has lapsed - ${CREW.lapseDays} days of crew upkeep unpaid. You're still a crew; found it again in the Crew app.`, 'bad');
    for (const pid of c.members) { const q = world.players.get(pid); if (q) q.npDirty = true; }
    if (c.members.length < 2) { const id = Object.keys(kept()).find((k) => kept()[k] === c), prof = store.get(c.members[0]); if (prof && c.bank > 0) prof.bank = (prof.bank || 0) + c.bank; if (id) delete kept()[id]; }
    changed();
  } else if (!was || U.n === CREW.lapseDays - 1) tell(world, c, `${c.f.name}'s crew bank couldn't cover the upkeep (${money(U.owed)} owed). Put money in from the Crew app - ${CREW.lapseDays - U.n} more day${CREW.lapseDays - U.n === 1 ? '' : 's'} and the name lapses.`, 'warn');
}
// A season's end (seasons.js endSeason): the crews' holdings - the bank and the arrears - gone; the members and the name kept
export function seasonReset(now = Date.now()) {
  for (const c of Object.values(kept())) { c.bank = 0; if (c.f) c.up = { d: dayKey(now), owed: 0, n: 0 }; }
  store.touch();
}
// every few seconds: each crew with someone online billed
export function update(world) {
  if (world.tick % 40 !== 31) return;
  const now = Date.now();
  for (const c of Object.values(kept())) {
    if (!c.f || !c.members.some((pid) => world.players.has(pid))) continue;
    try { bill(world, c, now); } catch (e) { if (world.opts && world.opts.throwErrors) throw e; console.error('[crews]', e); }
  }
}
