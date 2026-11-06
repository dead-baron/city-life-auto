// The safe exit (the launch plan's item 11, the owner's design, 11-03): LOG OFF in the pause menu counts LOGOFF.countS
// while you stand still, then takes you out of the city cleanly - saved, the session ended as any leaving ends it, and no
// body left behind to rob. Inside a home of your own it's at once. Moving, being hurt, hurting someone or becoming wanted
// calls it off; it can't start while you're wanted or within LOGOFF.calmS of taking or dealing damage (closing the tab
// then leaves the body for GHOST_SECONDS, as always: players.js leave / safeToIdle - combat-logging never saves you).
//
// The page (client/main.js logOff / onLogoff) and the server talk in one message each way:
//   page   -> { t: 'logoff' }               start (again while counting: the count goes on as it was, its state re-sent)
//             { t: 'logoff', a: 'cancel' }  the page called it off (pressed again, the pause menu closed): no answer
//   server -> { t: 'logoff', s: 'start', left }            counting: left seconds to go
//             { t: 'logoff', s: 'cancel', why, c, left? }  refused, or called off: why to show, c the cause (CAUSES),
//                                                          left - for 'fight', the seconds until you may
//             { t: 'logoff', s: 'done', left: 0, earned, spent, xp, cexp, sam, secs }  out: the session's summary -
//                 dollars earned and spent, skill xp, Criminal EXP and Samaritan points gained, seconds played -
//                 then the socket closes with LOGOFF_CLOSE (the page doesn't reconnect on it)
// On foot only (or in an interior, a home's rooms included): see blocker().
import { LOGOFF } from '../../shared/rules.js';
import * as players from './players.js';
import * as homes from './homes.js';

export const LOGOFF_CLOSE = 4016;   // the socket's close code after 'done': logged off - no reconnecting on it
const STILL_PX = 16;                // pushed further than this (half a tile) from where the count began: you moved

// why a count can't start or go on: [cause, text, seconds until it may (a fight only)] - or null
export function blocker(world, p) {
  const ped = p && p.ped;
  if (!ped || ped.dead || ped.removed || world.time < (ped.downUntil || 0)) return ['down', 'You can\'t log off while you\'re down.'];
  if (p.custody || ped.cuffed || p.struggle) return ['custody', 'You can\'t log off in custody.'];
  if (p.wanted > 0) return ['wanted', 'You can\'t log off safely while you\'re wanted - lose the police first.'];
  const calm = world.time - players.lastFight(ped);
  if (calm < LOGOFF.calmS) {
    const left = Math.ceil(LOGOFF.calmS - calm);
    return ['fight', `You were just in a fight - you can log off safely in ${left} s.`, left];
  }
  // on foot: one rule for every ride there is (a parked car, a moving one, a boat, a plane in the air, a seat in someone
  // else's car or a bus), and the ring is round you; stepping out is one button
  if (ped.vehId) return ['vehicle', 'Get out of the vehicle first - you log off on foot.'];
  if (ped.onTrain || ped.ride || ped.sky || ped.board || ped.surf) return ['riding', 'You can\'t log off while you\'re riding - step off first.'];
  if (ped.carrying) return ['crate', 'Put the crate down first.'];
  return null;
}

// where the body is, to tell a move: its rooms' own floor inside a home (ped.home), the street (or the interior) otherwise
function spot(p) {
  const ped = p.ped, h = ped.home && ped.hidden ? ped.home : null;
  return { k: `${ped.inside ?? ''}|${h ? h.id : ''}|${ped.interior ? ped.interior.kind : ''}`, x: h ? h.x : ped.x, y: h ? h.y : ped.y };
}

const say = (p, m) => { if (p.conn) { try { p.conn.sendJSON(m); } catch { /* gone */ } } };
const left = (world, lo) => Math.max(0, Math.round((lo.end - world.time) * 10) / 10);
const refusal = (b) => ({ t: 'logoff', s: 'cancel', why: b[1], c: b[0], ...(b[2] !== undefined ? { left: b[2] } : null) });

// the page's { t: 'logoff', a? }: the answer to send back (null: none - answered already, or nothing to say)
export function request(world, p, a) {
  if (a === 'cancel') { p.logoff = null; return null; }   // (the page has stopped its ring already)
  const lo = p.logoff;
  if (lo) return { t: 'logoff', s: 'start', left: left(world, lo) };   // (asked again while counting: the count goes on)
  const b = blocker(world, p);
  if (b) return refusal(b);
  if (homes.ownsInside(world, p)) { finish(world, p); return null; }   // (at home: at once)
  const at = spot(p);
  p.logoff = { at: world.time, end: world.time + LOGOFF.countS, k: at.k, x: at.x, y: at.y, seq: p.movedSeq || 0, stir: false };
  return { t: 'logoff', s: 'start', left: LOGOFF.countS };
}

// what calls a running count off: [cause, text] - or null
function spoiled(world, p, lo) {
  const ped = p.ped;
  if (lo.stir) return ['move', 'You moved - logging off was called off.'];
  // (a hit of any kind - combat.js damage, fire, a police dog - marks lastHitAt; a bleed's slow drain or a meal's buff
  // wearing off isn't a hit)
  if (ped && !ped.dead && (ped.lastHitAt || -1e9) > lo.at) return ['hurt', 'You were hurt - logging off was called off.'];
  if (ped && (ped.lastCombatAt || -1e9) > lo.at) return ['fight', 'You hurt someone - logging off was called off.'];
  if (p.wanted > 0) return ['wanted', 'You\'re wanted - logging off was called off.'];
  const b = blocker(world, p);
  if (b) return b;
  // moved by the server (movemark.js: a seat, a door, a ride, a rescue, a teleport) - your situation changed, so the count
  // you stood still for is off, whether or not you ended up near where you were; or pushed off the spot
  const at = spot(p);
  if ((p.movedSeq || 0) !== lo.seq || at.k !== lo.k || Math.hypot(at.x - lo.x, at.y - lo.y) > STILL_PX) return ['move', 'You moved - logging off was called off.'];
  return null;
}

export function update(world) {
  let any = false;
  for (const p of world.players.values()) if (p.logoff) { any = true; break; }
  if (!any) return;
  for (const p of [...world.players.values()]) {
    const lo = p.logoff;
    if (!lo) continue;
    if (!p.conn) { p.logoff = null; continue; }   // (the page went: players.leave clears it too - an ordinary disconnect)
    const why = spoiled(world, p, lo);
    if (why) { p.logoff = null; say(p, { t: 'logoff', s: 'cancel', why: why[1], c: why[0] }); continue; }
    if (world.time >= lo.end) finish(world, p);
  }
}

// Out, cleanly: the body leaves the world now (players.logOut: saved where you stood, nothing dropped, no ghost), the
// session ends the way every leaving ends it (session.js endSession: the launch hooks' leave - the money settled, the
// money watcher let go, the analytics session closed), then the summary, and the socket closes.
export function finish(world, p) {
  const conn = p.conn, ped = p.ped;
  p.logoff = null;
  if (ped && !ped.hidden && !ped.removed) world.emit(ped.x, ped.y, { e: 'poof', x: ped.x, y: ped.y });
  players.logOut(world, p);   // (first: what settles as you go - a hand on a casino table - counts in the summary)
  if (typeof p.endSession === 'function') p.endSession();
  const sum = players.sessionSummary(world, p);
  if (conn) {
    try { conn.sendJSON({ t: 'logoff', s: 'done', left: 0, ...sum }); } catch { /* gone */ }
    try { conn.close(LOGOFF_CLOSE, 'logged off'); } catch { /* gone */ }
  }
  return sum;
}
