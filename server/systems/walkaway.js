// Walking away from an activity (the owner, 11-12: "if you walk away for some reason it will have the job UI disappear"):
// one rule for golf, bowling, hoops and the pitch / court matches. Out of the venue, a warning line ("Walk back to keep
// playing - 8s") as a toast, and the tracker line counts it down; back in time, nothing lost; out QUIT.awayS (shared/
// rules.js), the activity's own system ends it with a toast saying why. A leaf module: the systems import it, it
// imports none of them (server/systems/activityquit.js has the Quit itself).
//   S: the activity's own state (G for golf, p.bowl, p.hoops, a match's per-player record) - awayAt kept on it
import { QUIT } from '../../shared/rules.js';

// out: true while the player is outside the venue. true when it's time to end the activity.
export function walkedOff(world, p, S, out) {
  if (!out) {
    if (S.awayAt) { S.awayAt = 0; S.awayN = 0; p.meDirty = true; }
    return false;
  }
  if (!S.awayAt) {
    S.awayAt = world.time || 1e-6; S.awayN = QUIT.awayS;
    world.notify(p, awayLine(QUIT.awayS), 'warn');
    p.meDirty = true;
    return false;
  }
  const left = QUIT.awayS - (world.time - S.awayAt);
  if (left <= 0) return true;
  const n = Math.ceil(left);
  if (n !== S.awayN) { S.awayN = n; p.meDirty = true; }   // (the tracker's countdown: the self record each second)
  return false;
}

export const awayLine = (s) => `Walk back to keep playing - ${s}s`;
// the tracker line while away (null when not): the countdown in place of the activity's own line
export function awayText(world, S) {
  if (!S || !S.awayAt) return null;
  return awayLine(Math.max(0, Math.ceil(QUIT.awayS - (world.time - S.awayAt))));
}
