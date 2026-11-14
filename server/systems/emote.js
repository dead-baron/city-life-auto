// Emotes on the body (the owner, 2026-11-13: "instead of emotes having a text that pops up let's make sure they have an
// animation"; round 2: "emotes are body animations first"). An emote (server/chat.js emote: the message, the rate limit
// and who's told) plays here as the ped's gt 'emote' and em - its id in shared/chatdefs.js EMOTES - which every page near
// draws (server/net.js descriptor; client/art2/dances.js and poses.js, game/peds.js personaPose): for its s seconds
// (CHAT.emoteS when it has none), or - a lasting pose (hold: sit, lie down, sleep, the phone, lean, crouch, kneel) - until
// you move. Dance starts the dance button's dance (dance.js) - a move from the picker's Dances tab, that very move.
// Walking off, a punch, a shot, a dive, getting in a vehicle, going down: the emote stops (as a dance does). Not free to
// move (in a vehicle, on a board, at an activity, cuffed...): the balloon (if it has one) still pops up, the body stays.
import { IN } from '../../shared/input.js';
import { CHAT, EMOTES } from '../../shared/chatdefs.js';
import { DANCE_PLAYER } from '../../shared/dance.js';
import * as dance from './dance.js';

const STOP_BITS = IN.FIRE | IN.DIVE | IN.VEHICLE | IN.THROW | IN.ACTION | IN.BLOCK | IN.DANCE;
const bump = (ped) => { ped.appVer = (ped.appVer || 0) + 1; };

// Play emote e (a key of EMOTES, checked by the caller) on p's body; m: for Dance, a move's index in DANCE_PLAYER (the
// picker's Dances tab) - none, the dance button's next move. Returns false when nothing happens at all (Dance while
// dancing already, the same move again, or where you can't dance) - the caller then sends nothing; true otherwise (the
// animation, or the balloon alone).
export function play(world, p, e, m) {
  const ped = p.ped;
  if (!ped || ped.dead) return false;
  if (e === 'dance') {
    if (m !== undefined && m !== null) { const dm = DANCE_PLAYER[m | 0]; if (dm === undefined || (ped.dancing && ped.dm === dm)) return false; stop(ped); return dance.start(world, p, dm, true) >= 0; }
    if (ped.dancing) return false;
    stop(ped); return dance.next(world, p, true) >= 0;
  }
  if (!dance.free(ped) || (ped.gt && ped.gt !== 'emote' && ped.gt !== 'dance')) return true;
  if (ped.dancing) dance.stop(ped);
  const E = EMOTES[e] || {};
  ped.gt = 'emote'; ped.em = e; ped.emoteUntil = E.hold ? Infinity : world.time + (E.s || CHAT.emoteS);
  ped.vx = 0; ped.vy = 0;
  bump(ped);
  return true;
}
export function stop(ped) {
  if (!ped || ped.gt !== 'emote') return false;
  ped.gt = null; ped.em = undefined; ped.emoteUntil = 0;
  bump(ped);
  return true;
}
// a lasting pose being held (sat down, asleep...): the Zzz again now and then (chat.js update)
export const holding = (ped, e) => !!ped && ped.gt === 'emote' && (e === undefined || ped.em === e) && ped.emoteUntil === Infinity;
// every tick (players.js inputsOf): the emote's time up
export function tick(world, ped) { if (ped.gt === 'emote' && world.time >= (ped.emoteUntil || 0)) stop(ped); }
// every input (players.js applyInput): moving off, a button that does something, knocked down - the emote stops
export function input(world, p, ped, inp) {
  if (ped.gt !== 'emote') return;
  if (Math.hypot(inp.mx || 0, inp.my || 0) > 0.25 || (inp.bits & STOP_BITS) || !dance.free(ped) || world.time < (ped.downUntil || 0) || world.time < (ped.stunUntil || 0) || world.time < (ped.tumbleUntil || 0)) stop(ped);
}
