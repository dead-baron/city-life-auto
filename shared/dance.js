// Dancing (task #394): the moves, shared by the server (who dances what: server/systems/nightclubs.js, the player's dance
// button: server/systems/dance.js) and the renderers (client/art2/game/peds.js, client/render/body.js). Someone dancing
// has the descriptor's gt 'dance' and dm, their move's index here (no dm: the street dancers' own wild dance).
// The moves (DN1): a loose two-step, a bounce, an arm up with a fist pump, the disco point, a spin, the robot, a sway with
// the eyes closed; the couples' slow dance and salsa (the lead and the partner, face to face); jumping in the crowd.
export const DANCE_MOVES = ['step', 'bounce', 'pump', 'point', 'spin', 'robot', 'sway', 'slow', 'slowf', 'salsa', 'salsaf', 'jump'];
export const DM = Object.fromEntries(DANCE_MOVES.map((m, i) => [m, i]));
export const DANCE_SOLO = [0, 1, 2, 3, 4, 5, 6];             // anyone on their own
export const DANCE_COUPLES = [[7, 8], [9, 10]];              // [the lead, the partner]: the slow dance, the salsa
export const DANCE_JUMP = 11;                                // the crowd at the drop (peak hour)
export const DANCE_PLAYER = [0, 1, 2, 3, 4, 5, 6, 11];       // what the dance button goes through, a press each (then stops)
export const DANCE_NAMES = ['the two-step', 'the bounce', 'the fist pump', 'the disco point', 'the spin', 'the robot', 'the sway', 'a slow dance', 'a slow dance', 'the salsa', 'the salsa', 'jumping'];
const FPS = [3.4, 3.6, 3.4, 3.2, 4, 3, 1.7, 1.6, 1.6, 3, 3, 4.4];   // frames a second, each move (4 frames to a move)
export const DANCE_FRAMES = 4;
export const COUPLE_PX = 13;                                 // a couple stand this far apart, face to face

// The frame (0-3) of move dm that someone (id) is on at time now (s): the couples and the jumping crowd on the beat
// together, everyone else a little off it.
export function danceFrame(dm, id, now) {
  const ph = dm >= 7 ? 0 : ((id | 0) % 7) * 0.37;
  return Math.floor(now * (FPS[dm] || 3.4) + ph) & 3;
}
// The heading the figure is drawn at (dir8: 0 S .. 6 E, the renderers' order) for a move's frame: the spin goes round.
export function danceDir(dm, d8, frame) { return dm === 4 ? ((d8 | 0) + (frame | 0) * 2) % 8 : d8; }
