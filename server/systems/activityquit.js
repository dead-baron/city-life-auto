// One Quit for every activity (the owner, 11-12: "When you start a game of golf but walk away the job waypoint still
// stays on screen, is there a way to cancel playing golf and similar activities or if you walk away for some reason it
// will have the job UI disappear?"). Whatever is in the HUD's tracker (the job slot) - or on its own screen (pool, air
// hockey, chess, an arcade machine) - is ended here through that activity's own leave: a game against a player is
// forfeited, a lane handed back, a hole given up, exactly as walking away from it always did; its tracker line and
// waypoint go with it, and a short toast says so.
//   On the wire: the phone's { t: 'phone', a: 'quit', k } (client/phone.js: the Jobs app's "Quit <activity>", the tracker
//   line tapped opens it) answers with the job board; k names the activity the page showed, so a Quit pressed just as
//   that activity ended never quits the next thing (a job). The board's `act` ({ k, n }) is what's on now.
//   Walking off a venue: walkaway.js (each system's own update). Logged off (no connection) QUIT.awayS: ended quietly.
import { QUIT } from '../../shared/rules.js';
import * as golf from './golf.js';
import * as bowling from './bowling.js';
import * as hoops from './hoops.js';
import * as poolmatch from './poolmatch.js';
import * as hockeymatch from './hockeymatch.js';
import * as chess from './chess.js';
import * as arcade from './arcade.js';
import * as minigames from './minigames.js';
import * as cinema from './cinema.js';
import * as drivein from './drivein.js';
import * as races from './races.js';
import * as places from './places.js';
import * as jobs from './jobs.js';
import * as evhooks from './eventhooks.js';

// in the tracker's order (players.js buildMe's job), the ones on a screen of their own first. n: the phone's "Quit <n>";
// end(world, p) ends it and returns the toast (null: the activity's own leave says it)
const ACTS = [
  { k: 'pool', n: 'pool', on: (w, p) => !!p.pool, end: (w, p) => { const watching = p.pool.seat < 0; poolmatch.leave(w, p, 'gone'); return watching ? 'You stop watching the pool game.' : 'You got up from the pool table.'; } },
  { k: 'hockey', n: 'air hockey', on: (w, p) => !!p.hockey, end: (w, p) => { hockeymatch.leave(w, p, 'gone'); return 'You stepped away from the air hockey table.'; } },
  { k: 'chess', n: 'chess', on: (w, p) => !!p.chess, end: (w, p) => { const watching = p.chess.seat < 0; chess.getUp(w, p, 'gone'); return watching ? 'You stop watching the chess game.' : 'You got up from the chess table.'; } },
  { k: 'arcade', n: 'the game', on: (w, p) => !!p.arcade && !p.arcade.quit, end: (w, p) => { arcade.quit(w, p); return null; } },   // (the score so far comes in and is toasted: arcade.js onScore)
  { k: 'maze', n: 'the maze', on: (w, p) => !!p.maze && !p.maze.done, end: (w, p) => { places.quitMaze(w, p); return 'You stop the clock on the maze.'; } },
  { k: 'lap', n: 'the lap', on: (w, p) => !!p.lap && (p.lap.phase === 'out' || p.lap.phase === 'back'), end: (w, p) => { places.quitLap(w, p); return 'The lap is off.'; } },
  { k: 'hoops', n: 'hoops', on: (w, p) => !!p.hoops, end: (w, p) => { const H = p.hoops; hoops.stop(w, p, false); return `You put the ball down${H.shots ? ` (${H.made} of ${H.shots})` : ''}.`; } },
  { k: 'bowling', n: 'bowling', on: (w, p) => !!p.bowl, end: (w, p) => { bowling.leave(w, p, true); return null; } },   // ("You hand your shoes back. Your score: ...")
  { k: 'cinema', n: 'the movie', on: (w, p) => !!p.cine, end: (w, p) => { cinema.leave(w, p, 'You get up - the movie goes on without you.'); return null; } },
  { k: 'drivein', n: 'the drive-in', on: (w, p) => !!p.drivein, end: (w, p) => { drivein.leave(w, p, 'You hang the speaker back up - the movie goes on without you.'); return null; } },
  { k: 'golf', n: 'golf', on: (w, p) => !!p.golf, end: (w, p) => { golf.quit(w, p, null); return 'You gave up the hole.'; } },
  { k: 'match', n: 'the match', on: (w, p) => minigames.matchOf(w, p) >= 0, end: (w, p) => { minigames.leaveMatch(w, p); return 'You walked off - forfeited. The match goes on without you.'; } },
  { k: 'race', n: 'the race', on: (w, p) => races.raceOf(w, p) >= 0, end: (w, p) => { races.withdraw(w, p); return 'You pulled out of the race.'; } },
  { k: 'event', n: null, on: (w, p) => !!evhooks.first('quit', w, p), end: (w, p) => { const e = evhooks.first('quit', w, p); return e ? e.end() : null; } },   // (street race night: calevents.js)
  { k: 'job', n: 'the job', on: (w, p) => !!p.job, end: (w, p) => { jobs.failJob(w, p, 'Job canceled.'); return null; } },
];
export const KINDS = ACTS.map((a) => a.k);

const nameOf = (world, p, A) => A.n || (A.k === 'event' ? (evhooks.first('quit', world, p) || {}).n || 'the event' : A.k);
// what p is in now (the first in the tracker's order): { k, n } or null
export function current(world, p) {
  const A = ACTS.find((a) => a.on(world, p));
  return A ? { k: A.k, n: nameOf(world, p, A) } : null;
}

// Quit: k the one the page showed (any: whatever's on now). An error to show, or null when something was ended.
export function quit(world, p, k) {
  const A = k ? ACTS.find((a) => a.k === k) : ACTS.find((a) => a.on(world, p));
  if (!A || !A.on(world, p)) return 'Nothing to quit.';
  const say = A.end(world, p);
  if (say) world.notify(p, say, 'info');
  p.meDirty = true;
  return null;
}

// each tick (world.js): a player whose connection has gone (a ghost body, logging off) is out of whatever they were in
// after QUIT.awayS, quietly - a job keeps its own rules
export function update(world) {
  if (world.tick % 10 !== 4) return;
  for (const p of world.players.values()) {
    if (p.conn) { if (p.goneAt) p.goneAt = 0; continue; }
    if (!p.goneAt) { p.goneAt = world.time || 1e-6; continue; }
    if (world.time - p.goneAt < QUIT.awayS) continue;
    for (const A of ACTS) if (A.k !== 'job' && A.on(world, p)) A.end(world, p);
  }
}
