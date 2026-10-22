// The Starlite Drive-In (the owner's #322; the lot itself: shared/countryside.js drivein - the big screen, the rows of
// speaker posts with a stall beside each, the snack bar and the marquee by the gate). After dark it shows features back
// to back: the first at dusk, then one after another with a short intermission between, till the last runs out into the
// dawn - the bill the same for anyone on the server, worked out from the world's clock (its day and where it is in the
// chrono loop). The films are invented: the drive-in's own creature features and westerns, and The Grand Theatre's
// (shared/cinema.js FILMS), drawn as plain shapes of coloured light (client/cinema.js film). Park in a stall facing
// the screen and tune in (server/systems/drivein.js); the page shows the film on the screen (client/drivein.js).
//   showAt(day, loopTime)  what's on: { night, k (the show, 0..shows-1), f (its FEATURES index), at (seconds into it;
//                          below 0: the intermission before it, counting down), len } - or null (the day; the night's
//                          bill run)
//   driveInOf(map)         the drive-in: { name, x0, y0, x1, y1 (the lot, px), sx, sy (the foot of the screen) } or null
import { TILE, DAY_LOOP_S, DAY_PART_S } from './constants.js';
import { CINE, FILMS } from './cinema.js';
import { DRIVEIN } from './rules-games.js';

// the bill: the drive-in's own (kinds client/cinema.js film draws: a monster, a saucer, a western, a beach party) and
// the Grand's four. pal: the sky, the light, the figure, the accent
export const FEATURES = [
  { title: 'Attack of the 50-Foot Cactus', tag: 'it came from the desert', kind: 'monster', pal: ['#160c26', '#ffd23a', '#3f9a3a', '#ff5a3a'] },
  { title: 'Saucers Over the Mesa', tag: 'they came for the cattle', kind: 'saucer', pal: ['#080a1e', '#a0ffd0', '#e8e2d0', '#ff4ab0'] },
  { title: 'Showdown at Dry Creek', tag: 'two guns, one town', kind: 'western', pal: ['#e8743a', '#ffd27a', '#1e120a', '#c8262b'] },
  { title: 'Beach Blanket Bonanza', tag: 'surf\'s up all summer', kind: 'surf', pal: ['#4ac0f0', '#fff2a0', '#163a6a', '#ff6a8a'] },
  ...FILMS,
];
// the shows: the first starts first seconds into the loop (just after dark falls), each runs len, gap between them;
// the tonight card goes up lead seconds before the first
export const SHOW = { first: DAY_PART_S - 28, lead: 30, len: CINE.FILM_S, gap: DRIVEIN.gapS, shows: DRIVEIN.shows };

export function showAt(day, lt) {
  let t = lt - SHOW.first, night = day | 0;
  if (t < -SHOW.lead && lt < DAY_PART_S / 2) { t += DAY_LOOP_S; night--; }   // (after the loop turns over: still last night's bill)
  if (t < -SHOW.lead) return null;
  const per = SHOW.len + SHOW.gap;
  let k = 0, at = t;
  if (t >= 0) {
    k = Math.floor(t / per); at = t - k * per;
    if (at >= SHOW.len) { k++; at -= per; }   // (the intermission: counting down to the next)
  }
  if (k >= SHOW.shows) return null;
  return { night, k, f: featureFor(night, k), at, len: SHOW.len };
}
// show k of a night's bill: the features in turn, a different run each night
export const featureFor = (night, k) => ((((night * SHOW.shows + k) % FEATURES.length) + FEATURES.length) % FEATURES.length);

export function driveInOf(m) {
  const L = m && (m.landmarks || []).find((q) => q && q.type === 'drivein');
  if (!L) return null;
  // (the screen stands across the lot's middle, four tiles in from its back: countryside.js drivein)
  return { name: L.name, x0: L.x, y0: L.y, x1: L.x + L.w, y1: L.y + L.h, sx: L.x + L.w / 2, sy: L.y + 4 * TILE };
}
