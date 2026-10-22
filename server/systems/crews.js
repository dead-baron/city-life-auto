// Crews (the owner, 10-08: "friends and crews (up to 4): land on the same server, crew chat, crew events and heists";
// the standing rule: crews hold up to 4 for now). Walk up to another player and the action button asks them into your
// crew; they say yes the same way, near you, while the asking stands (CREW.inviteS). A crew of up to CREW.max:
// - you see each other on the radar and the big map wherever you are (a green blip with the name), and your mates' name
//   tags are green;
// - no friendly fire: a crewmate's blows, shots and blasts don't hurt you (combat.js damage), so nothing to report;
// - crew chat: the phone's Crew app sends one of the quick lines (CREW.says - no free text) to everyone in it;
// - a bank heist's drawers are split with the crewmates there when the vault opens (heist.js);
// - the Crew app lists who's in it, who's on and how far, a waypoint to any of them, leaving, and (whoever started it)
//   taking someone off it.
// The crews are kept with the profiles (store.kept.crews) so a restart doesn't break them up; you stay in yours while
// you're offline.
//   store.kept.crews: id -> { lead (pid), members [pid], names { pid: name } }; p.crewAsk: { from (pid), at } (asked in)
import { CREW } from '../../shared/rules.js';
import { store } from '../store.js';

const kept = () => (store.kept.crews ||= {});
let index = null, indexOf = null, seq = 0;   // pid -> crew id (rebuilt when the crews change, or for a new store)
function idx() {
  const K = kept();
  if (index && indexOf === K) return index;
  index = new Map(); indexOf = K;
  for (const [id, c] of Object.entries(K)) for (const pid of c.members) index.set(pid, id);
  return index;
}
const changed = () => { index = null; store.touch(); };

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
  if (!c) {
    do id = `c${Date.now().toString(36)}${(seq++).toString(36)}`; while (K[id]);   // (two crews in one tick: their own ids)
    c = K[id] = { lead: q.pid, members: [q.pid], names: { [q.pid]: q.name } };
  }
  c.members.push(p.pid);
  c.names[p.pid] = p.name;
  changed();
  tell(world, c, `${p.name} joined the crew (${c.members.length}/${CREW.max}).`, 'good');
  return true;
}

// out of it (the Crew app); a crew of one is no crew
export function leave(world, p, why = 'left the crew') {
  const id = crewIdOf(p.pid), K = kept(), c = id ? K[id] : null;
  if (!c) return false;
  c.members = c.members.filter((pid) => pid !== p.pid);
  delete c.names[p.pid];
  if (c.lead === p.pid) c.lead = c.members[0] || null;
  const who = p.name || 'Someone';
  if (c.members.length < 2) { delete K[id]; for (const pid of c.members) { const q = world.players.get(pid); if (q) { world.notify(q, `${who} ${why} - the crew's broken up.`, 'info'); q.meDirty = true; } } }
  else tell(world, c, `${who} ${why}.`, 'info');
  changed();
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
  if (!c) return { t: 'crew', crew: null, max: CREW.max, says: CREW.says };
  const members = c.members.map((pid, k) => {
    const q = world.players.get(pid), at = q && q.ped && !q.prison ? q.ped : null;
    if (q && q.name && c.names[pid] !== q.name) c.names[pid] = q.name;   // (a new name: the list keeps up)
    return { k, n: (q && q.name) || c.names[pid] || 'Someone', me: pid === p.pid, lead: pid === c.lead, on: !!q, x: at ? Math.round(at.x) : null, y: at ? Math.round(at.y) : null, d: at && me ? Math.round(Math.hypot(at.x - me.x, at.y - me.y)) : null, where: at ? world.map.districtAt(at.x, at.y).name : null };
  });
  return { t: 'crew', crew: { lead: c.lead === p.pid, members }, max: CREW.max, says: CREW.says };
}
// the phone's messages: { a: 'crewsay', i } / 'crewleave' / 'crewkick', k
export function phone(world, p, msg) {
  if (msg.a === 'crewsay') say(world, p, Number(msg.i));
  else if (msg.a === 'crewleave') leave(world, p);
  else if (msg.a === 'crewkick') { const err = kick(world, p, Number(msg.k), msg.n); if (err) world.notify(p, err, 'warn'); }
  return panel(world, p);
}
