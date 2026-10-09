// Fighting back (the owner's note, 2026-10-09 05:01: "when you get tackled or pinned by an officer you can fight back
// with punches ... and might be able to break free"). A wanted player an NPC officer brings down - a tackle, a grab, a
// taser, dragged out of a car - isn't pinned and cuffed on the spot any more: the officer gets on top of them and goes
// for the cuffs, and they struggle. Every press of the attack button fills the struggle meter (a wriggle of the move
// stick a little), and the officer pushes it back down at a steady rate that grows the longer they've held them.
//   - Full: they throw the officer off (down for a moment: longer at low stars, so running really works) and are on
//     their feet with a short grace from the next tackle - to run, or to keep fighting (punching an officer is
//     assaulting one, as ever: law.js).
//   - Empty, or still held when the cuffs come out (STRUGGLE_CUFF_S): cuffed (law.arrest -> custody.js), as before.
// The odds (rules.js STRUGGLE_*): fair at 1-3 stars, much harder at 4, very hard at 5; health is strength (a hearty
// meal's extra counts, an energy drink helps, a taser's twitch doesn't); who's on you (a cop, an agent, SWAT, a soldier,
// their build, how well they got hold of you); a second officer on you pushes too (STRUGGLE_SECOND). Once cuffed there
// is no struggle - only custody.js's ways out. A player officer's arrest is unchanged (they press E on the suspect).
// NPC crooks the police take down get a dice roll instead (npcBreaksFree).
//
//   p.struggle: { m (the meter, 0-1), since, by: [officer ped ids: the first holds them, a second joined], grip: { id: how
//                 hard that one holds }, last (the last press counted), wa / wAt (the stick's direction at the last
//                 wriggle, and when), heard (the last scuffle sound) }
//   officer.pinning: the suspect's ped id while they're on them (police.js leaves them be)
//   ped.struggling: on the descriptor (net.js sg: the client draws them thrashing under the officer)
//   ped.graceUntil: just broke free - no tackle or grab lands before this (police.js tackleHit, players.js tackle)
import { IN } from '../../shared/input.js';
import { angleDiff } from '../../shared/math.js';
import {
  STRUGGLE_START, STRUGGLE_PRESS, STRUGGLE_WRIGGLE, STRUGGLE_HOLD, STRUGGLE_STARS, STRUGGLE_KIND, STRUGGLE_BUILD, STRUGGLE_GRIP_VAR,
  STRUGGLE_RAMP, STRUGGLE_CUFF_S, STRUGGLE_HP_FLOOR, STRUGGLE_HP_CAP, STRUGGLE_ENERGY, STRUGGLE_STUNNED, STRUGGLE_GRACE_S,
  STRUGGLE_KNOCK_S, STRUGGLE_NPC_FREE, STRUGGLE_SECOND,
} from '../../shared/rules.js';
import * as law from './law.js';

const REACH_PX = 40;      // an officer further off than this has lost hold of them
const PRESS_GAP = 0.08;   // presses closer together than this count once (one input a tick, so ~10 a second at most anyway)
const WRIGGLE_RAD = 1.2;  // the stick swung this far (about 70 degrees) from the last wriggle's direction: another wriggle
const WRIGGLE_GAP = 0.12;
const SOUND_GAP = 0.22;   // the grunts and scuffles: at most this often

export const of = (p) => (p && p.struggle) || null;
const stars = (p) => Math.max(1, Math.min(5, p.wanted | 0));

// How strong they are right now: health is strength (to STRUGGLE_HP_CAP: a hearty meal's extra counts); an energy drink
// helps, a taser's or the pepper spray's lingering twitch doesn't.
export function power(ped, now) {
  const hp = Math.max(0, Math.min(STRUGGLE_HP_CAP, (ped.hp || 0) / 100));
  let k = STRUGGLE_HP_FLOOR + (1 - STRUGGLE_HP_FLOOR) * hp;
  if (ped.buffs && ped.buffs.energy > now) k *= STRUGGLE_ENERGY;
  if (now < (ped.stunUntil || 0)) k *= STRUGGLE_STUNNED;
  return k;
}
// How hard an officer holds them down: who they are, their build, how well they got hold of them this time.
function gripOf(world, c) {
  const kind = STRUGGLE_KIND[c.archetype] ?? 1, str = c.build ? c.build.str : 1;
  return kind * (1 + (str - 1) * STRUGGLE_BUILD) * (1 - STRUGGLE_GRIP_VAR + 2 * STRUGGLE_GRIP_VAR * world.rand());
}

// An NPC officer on a downed suspect (police.js, where they used to cuff them there and then). True: it's a struggle
// (begun, joined, or one going on with no room for a third officer: they stand by); false: not a player it applies to
// (an NPC, not wanted, already cuffed) - the caller cuffs them as before.
export function grab(world, c, t) {
  const p = t && t.player, now = world.time;
  if (!p || !c || !c.npc || c.dead || p.custody || t.dead || t.vehId || !(p.wanted > 0)) return false;
  let s = p.struggle;
  if (!s) {
    s = p.struggle = { m: STRUGGLE_START, since: now, by: [], grip: {}, last: -9, wa: null, wAt: -9, heard: now };
    show(t, true);
    t.rollT = 0; t.vx = 0; t.vy = 0;
    world.emit(t.x, t.y, { e: 'struggle', x: t.x, y: t.y, id: t.id });
  }
  if (!s.by.includes(c.id) && s.by.length < 2 && !c.pinning) {
    s.by.push(c.id);
    s.grip[c.id] = gripOf(world, c);
    c.pinning = t.id;
  }
  p.meDirty = true;
  return true;
}

// Is this officer on someone (police.js: then the struggle moves them, not their unit)? A stale mark is cleared.
export function pinning(world, c) {
  if (!c.pinning) return false;
  const t = world.get(c.pinning), s = t && t.player ? t.player.struggle : null;
  if (s && s.by.includes(c.id)) return true;
  c.pinning = 0;
  return false;
}

// The player's input while it lasts (players.js applyInput: nothing else happens meanwhile).
export function input(world, p, ped, inp, pressed) {
  const s = p.struggle, now = world.time;
  if (!s) return;
  const k = power(ped, now);
  if ((pressed & IN.FIRE) && now - s.last >= PRESS_GAP) {
    s.last = now;
    s.m += STRUGGLE_PRESS * k * (0.75 + 0.5 * world.rand());
    ped.attackAnimUntil = now + 0.16;   // (the flags: a heave - the client draws them pushing up off the ground)
    if (now - s.heard >= SOUND_GAP) { s.heard = now; world.emit(ped.x, ped.y, { e: 'struggle', x: ped.x, y: ped.y, id: ped.id }); }
    p.meDirty = true;
  }
  // a wriggle: the move stick swung round to a new direction (left-right, round and round)
  if (Math.hypot(inp.mx || 0, inp.my || 0) > 0.5) {
    const a = Math.atan2(inp.my, inp.mx);
    if (s.wa === null) s.wa = a;
    else if (Math.abs(angleDiff(s.wa, a)) > WRIGGLE_RAD && now - s.wAt >= WRIGGLE_GAP) { s.wa = a; s.wAt = now; s.m += STRUGGLE_WRIGGLE * k; p.meDirty = true; }
  }
}

export function update(world, dt) {
  for (const p of world.players.values()) if (p.struggle) step(world, p, dt);
}

function step(world, p, dt) {
  const s = p.struggle, ped = p.ped, now = world.time;
  if (!ped || ped.removed || ped.dead || ped.vehId || p.custody || !(p.wanted > 0)) { end(world, p); return; }
  // who's still on them: alive, on their feet, right there
  const on = [];
  for (const id of s.by) {
    const c = world.get(id);
    if (c && !c.dead && !c.removed && !c.vehId && now >= c.downUntil && now >= c.stunUntil && Math.hypot(c.x - ped.x, c.y - ped.y) < REACH_PX) on.push(c);
    else if (c && c.pinning === ped.id) c.pinning = 0;
  }
  s.by = on.map((c) => c.id);
  if (!on.length) { free(world, p, null); return; }   // (knocked off them by someone else, killed, gone: up you get)
  // the officers bear down: the meter goes back down, faster the longer they've had you
  const held = now - s.since;
  let grip = 0;
  on.forEach((c, i) => { grip += (s.grip[c.id] || 1) * (i ? STRUGGLE_SECOND : 1); });   // (a second officer on top: STRUGGLE_SECOND)
  s.m -= STRUGGLE_HOLD * STRUGGLE_STARS[stars(p)] * grip * (1 + STRUGGLE_RAMP * held) * dt;
  // held down, the officers kneeling on them
  ped.downUntil = Math.max(ped.downUntil || 0, now + 0.3); ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  for (const c of on) kneel(world, c, ped);
  if (s.m >= 1) { free(world, p, on); return; }
  if (s.m <= 0 || held >= STRUGGLE_CUFF_S) { cuffed(world, p, on[0]); return; }
  p.meDirty = true;
}

// an officer on them: down on one knee beside them, facing them
function kneel(world, c, ped) {
  const d = Math.hypot(c.x - ped.x, c.y - ped.y) || 1;
  if (d > 16) { c.x += (ped.x + (c.x - ped.x) / d * 15 - c.x) * 0.35; c.y += (ped.y + (c.y - ped.y) / d * 15 - c.y) * 0.35; }
  c.vx = 0; c.vy = 0; c.rollT = 0;
  c.a = Math.atan2(ped.y - c.y, ped.x - c.x);
  c.kneelUntil = world.time + 0.3;
}

// Broke free: the officers thrown off (down a moment - longer at low stars), up on their feet with a grace from the
// next tackle. on: null when nobody was left holding them (knocked off by someone else).
function free(world, p, on) {
  const ped = p.ped, now = world.time;
  end(world, p);
  ped.downUntil = now; ped.stunUntil = 0;
  ped.graceUntil = now + STRUGGLE_GRACE_S;
  if (on) {
    const knock = STRUGGLE_KNOCK_S[stars(p)];
    on.forEach((c, i) => {
      const a = Math.atan2(c.y - ped.y, c.x - ped.x);
      c.vx = Math.cos(a) * 170; c.vy = Math.sin(a) * 170; c.rollT = 0; c.kneelUntil = 0;
      c.downUntil = Math.max(c.downUntil || 0, now + knock * (i ? 0.6 : 1));
      world.emit(c.x, c.y, { e: 'knockdown', x: c.x, y: c.y, id: c.id });
      if (!i) { ped.vx = -Math.cos(a) * 90; ped.vy = -Math.sin(a) * 90; }   // (rolling out from under them)
    });
    world.emit(ped.x, ped.y, { e: 'breakfree', x: ped.x, y: ped.y, id: ped.id });
    world.notify(p, on.length > 1 ? 'You threw them off! Run - or fight.' : 'You threw the officer off! Run - or fight.', 'good');
  } else world.notify(p, 'Nobody\'s holding you down - get up and go!', 'good');
  p.meDirty = true;
}

// Lost it: the cuffs go on (law.arrest: custody.js takes them from here).
function cuffed(world, p, c) {
  const ped = p.ped;
  end(world, p);
  world.emit(ped.x, ped.y, { e: 'cuffs', x: ped.x, y: ped.y, id: ped.id });
  law.arrest(world, c, ped);
}

function end(world, p) {
  const s = p.struggle;
  p.struggle = null;
  if (s) for (const id of s.by) { const c = world.get(id); if (c && p.ped && c.pinning === p.ped.id) c.pinning = 0; }
  if (p.ped) show(p.ped, false);
  p.meDirty = true;
}
function show(ped, on) {
  if (!!ped.struggling === on) return;
  ped.struggling = on;
  ped.appVer = (ped.appVer || 0) + 1;   // (net.js sends the descriptor again: sg)
}

// Logging out mid-struggle: the cuffs go on (then custody.js books them, as for anyone logging out in custody).
export function onLeave(world, p) {
  const s = p.struggle;
  if (!s) return;
  const c = s.by.map((id) => world.get(id)).find((e) => e && !e.dead) || null;
  if (c) cuffed(world, p, c); else end(world, p);
}

// An NPC crook the police have down (police.js runNpcUnit): a dice roll, once a takedown - now and then they shake the
// officer off (STRUGGLE_NPC_FREE, more for a strong one) and run. True: they're free.
export function npcBreaksFree(world, c, t) {
  const n = t && t.npc, now = world.time;
  if (!n || t.player || t.dead) return false;
  const down = Math.max(t.downUntil || 0, t.stunUntil || 0);
  if (n.struggled === down) return false;   // (rolled for this takedown already)
  n.struggled = down;
  if (world.rand() >= STRUGGLE_NPC_FREE * (t.build ? t.build.str : 1)) return false;
  const a = Math.atan2(c.y - t.y, c.x - t.x);
  c.vx = Math.cos(a) * 150; c.vy = Math.sin(a) * 150; c.rollT = 0;
  c.downUntil = Math.max(c.downUntil || 0, now + 1.4);
  t.downUntil = 0; t.stunUntil = 0; n.struggled = 0;
  world.emit(t.x, t.y, { e: 'struggle', x: t.x, y: t.y, id: t.id });
  world.emit(c.x, c.y, { e: 'knockdown', x: c.x, y: c.y, id: c.id });
  world.emit(t.x, t.y, { e: 'breakfree', x: t.x, y: t.y, id: t.id });
  return true;
}

// For the HUD (players.js buildMe): m the meter (0-1), n how many officers are on you, left: seconds to the cuffs.
export function meInfo(world, p) {
  const s = p.struggle;
  if (!s) return null;
  return { m: Math.max(0, Math.min(1, Math.round(s.m * 100) / 100)), n: s.by.length, left: Math.max(0, Math.round((STRUGGLE_CUFF_S - (world.time - s.since)) * 10) / 10) };
}
