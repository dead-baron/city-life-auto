// Bounties: a revenge measure (design notes 2026-10-07, "Bounties rework"). When the same player kills you BOUNTY_KILLS
// times within BOUNTY_KILLS_S, you can put a price on their head for a while after (BOUNTY_UNLOCK_S): from the Bounties app
// on your phone, or at the courthouse. The money is your own, out of your bank and held in escrow. It's paid only to a
// hunter who took the contract - a licensed bounty hunter, or an officer on duty - and then kills, arrests or detains the
// target, and it comes back to you if nobody does before the bounty runs out.
// - A bounty runs BOUNTY_RUN_S, counted only while its target is out in the city (online, alive, not inside a home), so
//   logging off or hiding can't run it out. It sticks through deaths from anything else. A target who never comes back:
//   refunded after BOUNTY_LAPSE_DAYS.
// - It's announced to everyone, and a golden skull floats over the target for as long as it lasts (net.js: bt).
// - The contracts live on the target's profile (prof.bounties), so they survive logging off and a server restart.
// - Hunters browse the contracts on the phone, with loose information: the name, what they're wearing, the district
//   they were last seen in and when. A contract taken puts its target on the hunter's radar (a rough ping).
// - Only kills that aren't the law's business count towards one: not a wanted (or already marked) victim, not an
//   officer on duty, not someone who was defending themselves.
// Profile fields: killedBy {pid: [ms]}, revenge {pid: {name, until ms}}, bounties [{id, by, byName, amount, left s,
// placed ms, takers [pid]}], bountySeen {d, x, y, at ms}.
import { K } from '../../shared/constants.js';
import { BOUNTY_KILLS, BOUNTY_KILLS_S, BOUNTY_UNLOCK_S, BOUNTY_AMOUNTS, BOUNTY_RUN_S, BOUNTY_LAPSE_DAYS, BOUNTY_SEEN_S, BOUNTY_ALIVE_SAM, HUNTER_MIN_SAMARITAN } from '../../shared/rules.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as looks from './looks.js';
import * as events from './events.js';
import * as homes from './homes.js';

const SELF_DEFENCE_S = 60;   // hit by the one you killed this recently, and you didn't start it: self-defence (as law.js immune)
const FIGHT_S = 300;         // ...you started it if you threw the first blow this recently
const SEEN_CELL = 640;       // "last seen" is this coarse (px): a spot to head for, not where they are
const CLAIM_SAM = 10;        // Samaritan points for collecting one
const mins = (s) => Math.max(1, Math.round(s / 60));
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
let seq = 0;
const newId = () => Date.now().toString(36) + (seq++).toString(36);

// ---- the state on a player ------------------------------------------------------------------------------------------
const contracts = (prof) => prof.bounties || (prof.bounties = []);
const placedSum = (prof) => (prof.bounties || []).reduce((n, c) => n + c.amount, 0);
const takes = (prof, pid) => (prof.bounties || []).some((c) => c.takers.includes(pid));
// out in the city: the only time a bounty's clock runs
const running = (p) => !!(p.conn && !p.ghostUntil && p.ped && !p.ped.dead && !p.ped.hidden);

// p.bounty (what the HUD shows and what makes someone fair game: law.js isFlagged) is the bounties on their head plus the
// city's (4+ stars: law.js addHeat); the skull is for the placed ones. A change of skull resends the person to everyone.
export function sync(world, p) {
  const placed = placedSum(p.profile);
  p.bounty = placed + (p.cityBounty || 0);
  const skull = placed > 0;
  if (skull !== !!p.skull) { p.skull = skull; if (p.ped) p.ped.appVer = (p.ped.appVer || 0) + 1; }
  p.meDirty = true;
  void world;
}

// the people you can put a bounty on right now (expired chances dropped)
export function revenge(prof) {
  const r = prof.revenge;
  if (!r) return {};
  const now = Date.now();
  for (const pid of Object.keys(r)) if (!(r[pid].until > now)) delete r[pid];
  return r;
}

// For the HUD: the longest-running bounty on you, and whether its clock is stopped.
export function meInfo(p) {
  const list = p.profile.bounties;
  if (!list || !list.length) return null;
  return { left: Math.round(Math.max(...list.map((c) => c.left))), paused: !running(p), n: list.length };
}

// ---- killed again and again by the same player -----------------------------------------------------------------------
// Was killer ped `a` defending themselves against `v`? (v hit them lately, and they didn't throw the first blow)
export function selfDefence(world, a, v) {
  const now = world.time, back = a.aggressors.get(v.id), began = a.started ? a.started.get(v.id) : undefined;
  return back !== undefined && now - back < SELF_DEFENCE_S && !(began !== undefined && now - began < FIGHT_S);
}

// law.js onKill: player k killed player v, and it counts. The BOUNTY_KILLS-th within the hour opens the chance to put a
// bounty on them (and starts the count again).
export function noteKill(world, k, v) {
  const prof = v.profile, now = Date.now(), win = BOUNTY_KILLS_S * 1000;
  const kb = prof.killedBy || (prof.killedBy = {});
  for (const pid of Object.keys(kb)) { kb[pid] = kb[pid].filter((t) => now - t < win); if (!kb[pid].length) delete kb[pid]; }
  const list = kb[k.pid] || (kb[k.pid] = []);
  list.push(now);
  store.touch();
  if (list.length < BOUNTY_KILLS) return false;
  delete kb[k.pid];
  (prof.revenge || (prof.revenge = {}))[k.pid] = { name: k.name, until: now + BOUNTY_UNLOCK_S * 1000 };
  world.notify(v, `${k.name} has killed you ${BOUNTY_KILLS} times in an hour. You can put a bounty on them for the next ${mins(BOUNTY_UNLOCK_S)} minutes: the Bounties app on your phone, or the courthouse.`, 'warn');
  v.meDirty = true;
  return true;
}

// ---- placing one ---------------------------------------------------------------------------------------------------
// null, or why not
export function place(world, p, targetPid, amount) {
  amount = Math.round(Number(amount));
  if (p.wanted > 0) return 'Criminals are barred from placing bounties.';
  const r = revenge(p.profile)[targetPid];
  if (!r) return `You can only put a bounty on someone who has killed you ${BOUNTY_KILLS} times within an hour.`;
  if (!BOUNTY_AMOUNTS.includes(amount)) return `A bounty is ${BOUNTY_AMOUNTS.slice(0, -1).map(money).join(', ')} or ${money(BOUNTY_AMOUNTS[BOUNTY_AMOUNTS.length - 1])}.`;
  const tp = targetPid === p.pid ? null : store.get(targetPid);
  if (!tp) return 'There\'s nobody by that name.';
  if (contracts(tp).some((c) => c.by === p.pid)) return `You already have a bounty out on ${tp.name}.`;
  if (p.profile.bank < amount) return 'Bounties are paid from your bank balance - not enough funds.';
  p.profile.bank -= amount;
  contracts(tp).push({ id: newId(), by: p.pid, byName: p.name, amount, left: BOUNTY_RUN_S, placed: Date.now(), takers: [] });
  delete p.profile.revenge[targetPid];
  const t = world.players.get(targetPid);
  if (t) { sync(world, t); noteSeen(world, t); }
  for (const q of world.players.values()) {
    if (q === p) world.notify(q, `Bounty placed: ${money(amount)} on ${tp.name}, held in escrow. It goes only to a hunter who takes the contract and gets them. If nobody does within ${mins(BOUNTY_RUN_S)} minutes of them being out in the city, it comes back to your bank.`, 'good');
    else if (q === t) world.notify(q, `${p.name} put a ${money(amount)} bounty on your head! A golden skull marks you for ${mins(BOUNTY_RUN_S)} minutes out in the city - hunters can take the contract.`, 'bad');
    else world.notify(q, `A ${money(amount)} bounty is out on ${tp.name} (from ${p.name}). Licensed hunters can take the contract in the Bounties app.`, 'warn');
  }
  events.feed(world, { kind: 'bounty', text: `${money(amount)} bounty out on ${tp.name}` });
  p.meDirty = true;
  store.touch();
  return null;
}

// ---- taking a contract ---------------------------------------------------------------------------------------------
function findContract(id) {
  for (const prof of store.all()) for (const c of prof.bounties || []) if (c.id === id) return [prof, c];
  return null;
}

export function take(world, p, id) {
  const f = findContract(String(id));
  if (!f) return 'That contract is gone - collected, or it ran out.';
  const [tp, c] = f;
  if (tp.pid === p.pid) return 'That\'s the bounty on your own head.';
  if (c.by === p.pid) return 'You can\'t take your own contract.';
  if (c.takers.includes(p.pid)) return 'You already have this contract.';
  if (p.wanted > 0) return 'Not while you\'re wanted.';
  if (!p.hunter && !p.badge) return `Contracts are for licensed bounty hunters (and officers on duty). Register at the courthouse: ${HUNTER_MIN_SAMARITAN}+ Samaritan, not wanted.`;
  c.takers.push(p.pid);
  world.notify(p, `Contract taken: ${money(c.amount)} on ${tp.name}. They show on your radar while they're out in the city - kill, arrest or detain them to collect.`, 'good');
  const t = world.players.get(tp.pid);
  if (t) world.notify(t, 'A bounty hunter has taken the contract on your head.', 'bad');
  p.meDirty = true;
  store.touch();
  return null;
}

// ---- collecting ----------------------------------------------------------------------------------------------------
// Hunter h got target t (how: 'kill' | 'arrest' | 'detain'): the contracts on t that h took are paid to h's bank, and
// the city's bounty too if h is a licensed hunter or on duty. What was paid (0: nothing for h).
export function collect(world, h, t, how) {
  if (!h || !t || h === t) return 0;
  const prof = t.profile;
  const mine = (prof.bounties || []).filter((c) => c.takers.includes(h.pid));
  const city = h.hunter || h.badge ? t.cityBounty || 0 : 0;
  if (!mine.length && !city) return 0;
  const placed = mine.reduce((n, c) => n + c.amount, 0), paid = placed + city;
  if (mine.length) prof.bounties = prof.bounties.filter((c) => !mine.includes(c));
  if (city) t.cityBounty = 0;
  h.profile.bank += paid;
  h.profile.samaritan += CLAIM_SAM;
  if (h.badge) law.addPolicePts(world, h, 15);
  const them = how === 'arrest' ? 'arrested them' : how === 'detain' ? 'brought them in alive' : 'took them out';
  const did = how === 'arrest' ? `arrested ${t.name}` : how === 'detain' ? `brought ${t.name} in` : `took out ${t.name}`;
  world.notify(h, `Bounty on ${t.name} collected: +${money(paid)} to your bank, +${CLAIM_SAM} Samaritan.`, 'good');
  world.notify(t, `${h.name} collected the bounty on your head.`, 'bad');
  if (mine.length) {
    // the ones who placed them, the other hunters on them, and everyone who heard the bounty announced
    const told = new Set([h.pid, t.pid]);
    for (const c of mine) {
      const by = world.players.get(c.by);
      if (by && !told.has(by.pid)) { told.add(by.pid); world.notify(by, `Your bounty on ${t.name} was collected: ${h.name} ${them}.`, 'good'); }
      for (const pid of c.takers) { const q = world.players.get(pid); if (q && !told.has(pid)) { told.add(pid); world.notify(q, `${h.name} got to ${t.name} first - that contract is closed.`, 'info'); } }
    }
    for (const q of world.players.values()) if (!told.has(q.pid)) world.notify(q, `${h.name} ${did} and collected the ${money(placed)} bounty.`, 'info');
  }
  events.feed(world, { kind: 'bounty', text: `${h.name} collected the ${money(paid)} bounty on ${t.name}`, x: t.ped ? t.ped.x : undefined, y: t.ped ? t.ped.y : undefined });
  sync(world, t);
  h.meDirty = true;
  store.touch();
  return paid;
}

// A target you hold a contract on, knocked down (or stunned) within reach: you can detain them (players.js prompt).
// Officers on duty arrest instead (law.js arrestTarget).
export function detainTarget(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId || p.badge) return null;
  let best = null, bd = 52;
  for (const e of world.query(ped.x, ped.y, 52, K.PED)) {
    if (e === ped || !e.player || e.dead || !takes(e.player.profile, p.pid) || !law.arrestable(world, e)) continue;
    const d = Math.hypot(e.x - ped.x, e.y - ped.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Detained: the bounty's paid (and BOUNTY_ALIVE_SAM more for bringing them in alive), and they're taken in to the
// courthouse and let go. A target who's wanted as well is handed to the police: that's an arrest (fines and all).
export function detain(world, by, target) {
  const h = by.player, t = target.player;
  if (!h || !t || target.dead || !law.arrestable(world, target)) return;
  if (t.wanted > 0) { law.arrest(world, by, target); return; }
  if (!collect(world, h, t, 'detain')) return;
  h.profile.samaritan += BOUNTY_ALIVE_SAM;
  world.notify(h, `Brought in alive: +${BOUNTY_ALIVE_SAM} Samaritan more.`, 'good');
  const ct = nearestCourthouse(world, target.x, target.y);
  if (ct) {
    const s = homes.spawnSpot(world, ct.x, ct.y);
    target.x = s.x; target.y = s.y; target.lz = 0; target.vx = 0; target.vy = 0;
    world.place(target);
  }
  target.downUntil = 0; target.stunUntil = world.time + 1; target.passedOut = false;
  homes.protect(world, target);
  world.notify(t, `${h.name} brought you in${ct ? ` to the ${ct.label}` : ''}. The bounty is paid - you're free to go.`, 'bad');
  t.meDirty = true;
  store.touch();
}
function nearestCourthouse(world, x, y) {
  let best = null, bd = Infinity;
  for (const q of world.map.pois) if (q.kind === 'courthouse') { const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = q; } }
  return best;
}

// ---- the clock -----------------------------------------------------------------------------------------------------
function noteSeen(world, p) {
  const ped = p.ped;
  if (!ped) return;
  p.bountySeenT = world.time;
  const d = world.map.districtAt(ped.x, ped.y);
  p.profile.bountySeen = { d: d ? d.name : '', x: (Math.floor(ped.x / SEEN_CELL) + 0.5) * SEEN_CELL, y: (Math.floor(ped.y / SEEN_CELL) + 0.5) * SEEN_CELL, at: Date.now() };
}

function expire(world, prof, gone, p) {
  prof.bounties = prof.bounties.filter((c) => !gone.includes(c));
  for (const c of gone) {
    const by = store.get(c.by);
    if (by) by.bank += c.amount;   // (online or not: it's their bank)
    const bp = world.players.get(c.by);
    if (bp) { world.notify(bp, `Your ${money(c.amount)} bounty on ${prof.name} ran out with nobody collecting - the money is back in your bank.`, 'info'); bp.meDirty = true; }
    for (const pid of c.takers) { const q = world.players.get(pid); if (q) world.notify(q, `The contract on ${prof.name} ran out.`, 'info'); }
  }
  if (p) { world.notify(p, prof.bounties.length ? 'One of the bounties on your head ran out.' : 'The bounty on your head ran out. You\'re in the clear.', 'good'); sync(world, p); }
  events.feed(world, { kind: 'bounty', text: `The bounty on ${prof.name} ran out` });
  store.touch();
}

export function update(world, dt) {
  for (const p of world.players.values()) {
    const list = p.profile.bounties;
    if (!list || !list.length || !running(p)) continue;
    for (const c of list) c.left -= dt;
    if (world.time - (p.bountySeenT ?? -1e9) >= BOUNTY_SEEN_S) { noteSeen(world, p); store.touch(); }
    const gone = list.filter((c) => c.left <= 0);
    if (gone.length) expire(world, p.profile, gone, p);
  }
  // a target who never comes back: refunded once they've been gone BOUNTY_LAPSE_DAYS (looked at once a minute)
  if (world.tick % 1200 === 600) {
    const cut = Date.now() - BOUNTY_LAPSE_DAYS * 86400000;
    for (const prof of store.all()) {
      if (!prof.bounties || !prof.bounties.length || world.players.has(prof.pid)) continue;
      const old = prof.bounties.filter((c) => Math.max(c.placed, prof.lastSeen || 0) < cut);
      if (old.length) expire(world, prof, old, null);
    }
  }
}

// Joining with bounties still on your head (from before you logged off): the skull's back, and you're told.
export function onJoin(world, p) {
  sync(world, p);
  const info = meInfo(p);
  if (info) world.notify(p, `There's still a ${money(placedSum(p.profile))} bounty on your head. It runs ${mins(info.left)} more minute${mins(info.left) === 1 ? '' : 's'} while you're out in the city.`, 'bad');
}

// ---- what hunters see ----------------------------------------------------------------------------------------------
// Radar pings (law.js radarFor): the targets of your contracts while they're out in the city, and - licensed hunters and
// officers on duty - anyone with the city's bounty on them. Rough: a ring 140 px round a spot near them, every 5 s.
export function radar(world, p, out) {
  if (!p.ped) return;
  const ping = Math.floor(world.time / 5), lic = p.hunter || p.badge;
  for (const q of world.players.values()) {
    if (q === p || !q.ped || q.ped.dead || q.ped.hidden) continue;
    let b = lic ? q.cityBounty || 0 : 0;
    for (const c of q.profile.bounties || []) if (c.takers.includes(p.pid)) b += c.amount;
    if (b <= 0) continue;
    const jx = ((ping * 7919 + q.ped.id * 31) % 160) - 80, jy = ((ping * 104729 + q.ped.id * 17) % 160) - 80;
    out.push({ k: 'bounty', x: Math.round(q.ped.x + jx), y: Math.round(q.ped.y + jy), r: 140, b, n: q.name });
  }
}

// The Bounties app (phone.js 'bounties'): every contract out, the ones on you and the ones you placed among them, and the
// people you can put a bounty on.
export function boardFor(world, p) {
  const now = Date.now(), list = [];
  for (const prof of store.all()) {
    const cs = prof.bounties;
    if (!cs || !cs.length) continue;
    const t = world.players.get(prof.pid), seen = prof.bountySeen;
    const desc = law.outfitText(t && t.ped ? t.ped.app : looks.appOf(prof));
    for (const c of cs) list.push({
      id: c.id, name: prof.name, amount: c.amount, left: Math.max(0, Math.round(c.left)), on: !!(t && running(t)), by: c.byName, desc,
      seen: seen ? { d: seen.d, ago: Math.max(0, Math.round((now - seen.at) / 1000)), x: seen.x, y: seen.y } : null,
      takers: c.takers.length, mine: c.takers.includes(p.pid), own: c.by === p.pid, me: prof.pid === p.pid,
    });
  }
  list.sort((a, b) => b.on - a.on || b.amount - a.amount || a.left - b.left);   // (who's out in the city first)
  const rv = revenge(p.profile);
  return {
    t: 'bounties', list, amounts: BOUNTY_AMOUNTS, bank: p.profile.bank, hunter: !!(p.hunter || p.badge), wanted: p.wanted > 0, need: HUNTER_MIN_SAMARITAN,
    revenge: Object.entries(rv).map(([pid, r]) => { const tp = store.get(pid); return { pid, name: r.name, left: Math.round((r.until - now) / 1000), has: !!(tp && contracts(tp).some((c) => c.by === p.pid)) }; }),
  };
}

// The courthouse desk (economy.js): put a bounty on someone who keeps killing you, and what's out right now.
export function courthouseOptions(world, p, opts) {
  for (const [pid, r] of Object.entries(revenge(p.profile))) {
    const tp = store.get(pid);
    if (!tp) continue;
    const has = contracts(tp).some((c) => c.by === p.pid);
    for (const amt of BOUNTY_AMOUNTS) {
      const poor = p.profile.bank < amt;
      opts.push({ id: `bounty:${pid}:${amt}`, label: `Put a ${money(amt)} bounty on ${r.name}`, price: amt, dis: has || poor || p.wanted > 0, note: has ? 'one out already' : poor ? 'not enough in the bank' : 'from your bank' });
    }
  }
}
export function summary(world) {
  const out = [];
  for (const prof of store.all()) { const n = placedSum(prof); if (n > 0) out.push(`${prof.name} ${money(n)}`); }
  void world;
  return out;
}

// ---- dev (server/dev.js) -------------------------------------------------------------------------------------------
// a test bounty on yourself (nobody's money: nothing comes back when it runs out)
export function devOnMe(world, p, amount = 1000) {
  contracts(p.profile).push({ id: newId(), by: 'dev', byName: 'a test', amount, left: BOUNTY_RUN_S, placed: Date.now(), takers: [] });
  sync(world, p); noteSeen(world, p);
  world.notify(p, `[dev] A ${money(amount)} test bounty on your head (the golden skull) for ${mins(BOUNTY_RUN_S)} minutes out in the city.`, 'info');
  store.touch();
}
// the chance to put a bounty on the nearest other player, as if they'd killed you three times
export function devUnlock(world, p) {
  let best = null, bd = Infinity;
  for (const q of world.players.values()) if (q !== p && q.ped && p.ped) { const d = Math.hypot(q.ped.x - p.ped.x, q.ped.y - p.ped.y); if (d < bd) { bd = d; best = q; } }
  if (!best) return 'Nobody else is online.';
  (p.profile.revenge || (p.profile.revenge = {}))[best.pid] = { name: best.name, until: Date.now() + BOUNTY_UNLOCK_S * 1000 };
  world.notify(p, `[dev] You can put a bounty on ${best.name} now (the Bounties app, or the courthouse).`, 'info');
  return null;
}
