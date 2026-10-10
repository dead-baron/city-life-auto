// The player's dance (task #394). The owner: "dancing animations for NPCs and the player". The dance button (IN.DANCE: G,
// L3 on a pad, the phone's Dance button) starts you dancing where you stand; each press after it the next move
// (shared/dance.js DANCE_PLAYER: the two-step, the bounce, the fist pump, the disco point, the spin, the robot, the sway,
// jumping), and after the last you stop. Walking, a dive, a punch or a shot, getting in a vehicle, going down: you stop.
// Everyone sees it: the descriptor's gt 'dance' and dm (server/net.js), sent again when appVer changes.
import { IN } from '../../shared/input.js';
import { DANCE_PLAYER, DANCE_NAMES } from '../../shared/dance.js';

const STOP_BITS = IN.FIRE | IN.DIVE | IN.VEHICLE | IN.THROW | IN.ACTION | IN.BLOCK;

function set(ped, dm) {
  ped.gt = 'dance'; ped.dm = dm; ped.dancing = true;
  ped.vx = 0; ped.vy = 0;
  ped.appVer = (ped.appVer || 0) + 1;
}
export function stop(ped) {
  if (!ped || !ped.dancing) return false;
  ped.dancing = false; ped.dm = undefined;
  if (ped.gt === 'dance') ped.gt = null;
  ped.appVer = (ped.appVer || 0) + 1;
  return true;
}
// can this player dance right now? (on foot, up, free)
function free(ped) {
  return !!ped && !ped.dead && !ped.vehId && !ped.hidden && !ped.cuffed && !ped.carrying && !ped.fishing && !ped.onTrain && !ped.hoodOf && !ped.sit && !ped.sitBench && !(ped.rollT > 0) && !(ped.downUntil > 0 && ped.swimming);
}
// The dance button (or the phone's): start, the next move, or stop after the last. Returns the move's index or -1 (stopped).
export function next(world, p) {
  const ped = p.ped;
  if (!free(ped)) { stop(ped); return -1; }
  const i = ped.dancing ? DANCE_PLAYER.indexOf(ped.dm) + 1 : 0;
  if (i >= DANCE_PLAYER.length) { stop(ped); world.notify?.(p, 'You stop dancing.', 'info'); return -1; }
  set(ped, DANCE_PLAYER[i]);
  world.notify?.(p, `Dancing: ${DANCE_NAMES[ped.dm]} - press again for the next move, move to stop`, 'info');
  return ped.dm;
}
// every input (players.js applyInput): the button, and whatever stops the dance
export function input(world, p, ped, inp, pressed) {
  if (pressed & IN.DANCE) { next(world, p); return; }
  if (!ped.dancing) return;
  if (Math.hypot(inp.mx || 0, inp.my || 0) > 0.25 || (inp.bits & STOP_BITS) || !free(ped)) stop(ped);
}
