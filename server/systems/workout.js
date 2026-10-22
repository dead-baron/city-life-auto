// Working out (the owner, 10-04 / 10-06: "skills and daily caps... gym mini-game"): push-ups for strength, sit-ups for
// stamina, anywhere you can get down on the ground (the phone's Skills app starts a set). The mini-game is the pace:
// the action button is a rep - steady, one every second or so (WORKOUT.minGap .. maxGap); rush it and the rep doesn't
// count, stop for too long and the set's over. Each rep takes some stamina, so a set ends when you're spent, or at
// WORKOUT.set reps. Every rep counted is skill xp (skills.js: 'pushups', 'situps' - capped a day like the rest).
// Anything else - moving off, a punch, a dive, getting into a car, being hit - and you get up.
//   p.workout: { k ('pushups' | 'situps'), reps, last (world.time of the last rep, or the start), misses }
// Everyone sees it: the descriptor's gt (the pose) and cv (the rep count: the page dips on each - art2 host.js).
import { IN } from '../../shared/input.js';
import { WORKOUT } from '../../shared/rules.js';
import { isSwimming } from '../../shared/mapcore.js';
import * as skills from './skills.js';

export const KINDS = { pushups: { name: 'Push-ups', pose: 'pushup', skill: 'strength' }, situps: { name: 'Sit-ups', pose: 'situp', skill: 'stamina' } };
const STOP_BITS = IN.FIRE | IN.DIVE | IN.VEHICLE | IN.THROW | IN.BLOCK;

function free(world, ped) {
  return !!ped && !ped.dead && !ped.vehId && !ped.hidden && !ped.cuffed && !ped.carrying && !ped.board && !ped.fishing && !ped.onTrain && !ped.sky
    && !ped.sit && !ped.sitBench && !ped.dancing && !(ped.rollT > 0) && world.time >= (ped.downUntil || 0) && world.time >= (ped.stunUntil || 0) && !isSwimming(world.map, ped);
}

// a set from the phone: null, or why not
export function start(world, p, k) {
  const ped = p.ped, K = KINDS[k];
  if (!K) return 'No such exercise.';
  if (!free(world, ped)) return 'Not here - find some open ground, on foot.';
  if (p.wanted > 0) return 'Not with the police after you.';
  if (p.workout) stop(world, p);
  p.workout = { k, reps: 0, last: world.time, misses: 0 };
  ped.gt = K.pose; ped.cv = 0; ped.vx = 0; ped.vy = 0; ped.appVer = (ped.appVer || 0) + 1;
  p.meDirty = true;
  world.notify(p, `${K.name}: the action button for each rep - steady, about one a second. Move to get up.`, 'info');
  return null;
}

export function stop(world, p, why = null) {
  const W = p.workout, ped = p.ped;
  if (!W) return;
  p.workout = null;
  if (ped && ped.gt === KINDS[W.k].pose) { ped.gt = null; ped.cv = undefined; ped.appVer = (ped.appVer || 0) + 1; }
  p.meDirty = true;
  if (why) world.notify(p, why, 'info');
}

// players.js applyInput, while working out: true when the input's been dealt with (no walking off mid-rep)
export function input(world, p, ped, inp, pressed) {
  const W = p.workout;
  if (!W) return false;
  if (!free(world, ped) || ped.gt !== KINDS[W.k].pose) { stop(world, p); return false; }
  if ((pressed & STOP_BITS) || Math.hypot(inp.mx || 0, inp.my || 0) > 0.4) { done(world, p, 'You get up.'); return false; }
  const now = world.time;
  ped.vx = 0; ped.vy = 0;
  if (now - W.last > WORKOUT.maxGap) { done(world, p, 'You lost the rhythm.'); return true; }
  if (!(pressed & IN.ACTION)) return true;
  if (now - W.last < WORKOUT.minGap) {   // (rushed: no rep - and the count starts again from here)
    W.last = now; W.misses++;
    world.notify(p, 'Too fast - steady reps.', 'warn');
    return true;
  }
  if ((ped.stamina || 0) < WORKOUT.drain) { done(world, p, 'Spent - you can\'t do another.'); return true; }
  ped.stamina -= WORKOUT.drain;
  W.reps++; W.last = now;
  ped.cv = W.reps; ped.appVer = (ped.appVer || 0) + 1;
  skills.gain(world, p, W.k);
  p.meDirty = true;
  if (W.reps >= WORKOUT.set) done(world, p, null);
  return true;
}
function done(world, p, why) {
  const W = p.workout;
  if (!W) return;
  const K = KINDS[W.k];
  stop(world, p, W.reps ? `${why ? `${why} ` : ''}${W.reps} ${K.name.toLowerCase()}${W.reps >= WORKOUT.set ? ' - a full set' : ''}.` : why);
}

// the page's bar (players.js me): which, how many, of how many
export const meInfo = (p) => (p.workout ? { k: p.workout.k, name: KINDS[p.workout.k].name, reps: p.workout.reps, of: WORKOUT.set } : null);
