// Emotes on the body (the owner, 2026-11-13: "instead of emotes having a text that pops up let's make sure they have an
// animation"). An emote (server/chat.js emote: the message, the rate limit and who sees the emoji) plays here for
// CHAT.emoteS seconds as the ped's gt 'emote' and em - its id in shared/chatdefs.js EMOTES - which every page near
// draws as a short four-frame loop (server/net.js descriptor; client/art2/dances.js poses, game/peds.js personaPose).
// Dance has no pose of its own: it starts the dance button's dance (dance.js). Walking off, a punch, a shot, a dive,
// getting in a vehicle, going down: the emote stops (as a dance does). Not free to move (in a vehicle, on a board, at an
// activity, cuffed...): the emoji still pops up, the body stays as it is.
import { IN } from '../../shared/input.js';
import { CHAT } from '../../shared/chatdefs.js';
import * as dance from './dance.js';

const STOP_BITS = IN.FIRE | IN.DIVE | IN.VEHICLE | IN.THROW | IN.ACTION | IN.BLOCK | IN.DANCE;
const bump = (ped) => { ped.appVer = (ped.appVer || 0) + 1; };

// Play emote e (a key of EMOTES, checked by the caller) on p's body. Returns false when nothing happens at all (Dance
// while dancing already, or where you can't dance) - the caller then sends nothing; true otherwise (the animation, or
// the emoji alone).
export function play(world, p, e) {
  const ped = p.ped;
  if (!ped || ped.dead) return false;
  if (e === 'dance') { if (ped.dancing) return false; stop(ped); return dance.next(world, p, true) >= 0; }
  if (!dance.free(ped) || (ped.gt && ped.gt !== 'emote' && ped.gt !== 'dance')) return true;
  if (ped.dancing) dance.stop(ped);
  ped.gt = 'emote'; ped.em = e; ped.emoteUntil = world.time + CHAT.emoteS;
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
// every tick (players.js inputsOf): the emote's time up
export function tick(world, ped) { if (ped.gt === 'emote' && world.time >= (ped.emoteUntil || 0)) stop(ped); }
// every input (players.js applyInput): moving off, a button that does something, knocked down - the emote stops
export function input(world, p, ped, inp) {
  if (ped.gt !== 'emote') return;
  if (Math.hypot(inp.mx || 0, inp.my || 0) > 0.25 || (inp.bits & STOP_BITS) || !dance.free(ped) || world.time < (ped.downUntil || 0) || world.time < (ped.stunUntil || 0) || world.time < (ped.tumbleUntil || 0)) stop(ped);
}
