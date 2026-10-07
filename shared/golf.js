// Golf at Cedar Hills Golf Club: what the ball lies on, the clubs and the swing meter. The course itself is laid
// out by shared/naturesites.js golfClub (map.golf: the holes with their tees, pins and pars, the greens, the
// fairways, the course's bounds; the bunkers are sand tiles, the pond water). server/systems/golf.js plays it; the
// client draws your aim line and the swing meter from the same numbers.
import { T } from './constants.js';

export const GOLF_FEE = 5;               // a hole, paid on the tee
export const HOLE_IN_ONE_PRIZE = 500;    // the club's prize (once a hole for each player)
export const MAX_STROKES = 10;           // ...then you pick up
export const SWING_S = 1;                // the meter fills in this long while you hold, then falls back again
export const GOLF_REACH = 34;            // stand this close to your ball to hit it
export const CUP_R = 7;                  // the ball drops when it rolls this close to the pin...
export const CUP_SPEED = 110;            // ...no faster than this (any faster and it runs over or lips out)
export const GOLF_GRAV = 900;            // px/s² (the ball's height on the wire is in px)

// The bag: the club is picked by the lie and how far the pin is (loft: launch angle, max: launch speed at a full
// swing, spread: how far off line a shot can go).
export const CLUBS = {
  driver: { name: 'Driver', loft: 0.5, max: 760, spread: 0.03 },
  iron: { name: 'Iron', loft: 0.62, max: 600, spread: 0.028 },
  wedge: { name: 'Wedge', loft: 0.85, max: 470, spread: 0.022 },
  sand: { name: 'Sand wedge', loft: 0.95, max: 430, spread: 0.035 },
  putter: { name: 'Putter', loft: 0, max: 330, spread: 0.006 },
};
// What each lie does to a ball: bounce (how much of the fall comes back up), land (how much of the speed is kept
// on landing), roll (how fast a rolling ball slows, px/s²).
export const LIES = {
  green: { bounce: 0.22, land: 0.72, roll: 150 },
  tee: { bounce: 0.3, land: 0.62, roll: 300 },
  fairway: { bounce: 0.3, land: 0.62, roll: 300 },
  path: { bounce: 0.45, land: 0.8, roll: 170 },
  rough: { bounce: 0.15, land: 0.38, roll: 720 },
  sand: { bounce: 0, land: 0.05, roll: 2600 },
};
export const LIE_NAME = { green: 'on the green', tee: 'on the tee', fairway: 'on the fairway', path: 'on the cart path', rough: 'in the rough', sand: 'in a bunker', water: 'in the water', out: 'out of bounds' };

// The meter while you hold the swing: 0 -> 1 over SWING_S, back down to 0, up again...
export function swingMeter(t) { const u = (Math.max(0, t) / SWING_S) % 2; return u <= 1 ? u : 2 - u; }

function segDist(pts, x, y) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}

// What the ball lies on at (x, y): 'green', 'tee', 'fairway', 'sand', 'path', 'rough', 'water' or 'out'.
export function lieAt(map, x, y) {
  const g = map.golf;
  if (!g) return 'out';
  const r = g.rect;
  if (x < r.x0 || x >= r.x1 || y < r.y0 || y >= r.y1) return 'out';
  const t = map.tileAtPx(x, y);
  if (t === T.WATER || t === T.DEEP) return 'water';
  for (const q of g.greens) if (Math.hypot(x - q.x, y - q.y) < q.r) return 'green';
  for (const q of g.tees) if (x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h) return 'tee';
  if (t === T.SAND) return 'sand';
  for (const f of g.fairways) if (segDist(f.pts, x, y) < f.hw) return 'fairway';
  if (t === T.PLAZA) return 'path';
  if (t === T.GRASS || t === T.DIRT || t === T.LOT) return 'rough';
  return 'out';   // (a building, a wall: off the course)
}

// The club for a shot from this lie with the pin this far away (a long way out of a fairway bunker: an iron, which
// the sand takes some of the speed off - server/systems/golf.js).
export function clubFor(lie, dist) {
  if (lie === 'green') return 'putter';
  if (lie === 'sand') return dist > 400 ? 'iron' : 'sand';
  if (dist < 300) return 'wedge';
  if (lie === 'rough') return 'iron';
  return 'driver';
}
// A shot's launch: speed (px/s, along the ground and up), from the club and the meter (0..1).
export function launchSpeed(club, power) { return CLUBS[club].max * (0.12 + 0.88 * Math.max(0, Math.min(1, power))); }
// How far a full flight carries on flat ground before it first lands (no roll), for the aim line.
export function carry(club, power) {
  const c = CLUBS[club], v = launchSpeed(club, power);
  if (!c.loft) return (v * v) / (2 * LIES.green.roll);   // (a putt rolls)
  return (v * v * Math.sin(2 * c.loft)) / GOLF_GRAV;
}
// The score's name against par.
export function scoreName(strokes, par) {
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  return d <= -3 ? 'Albatross!' : d === -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par.' : d === 1 ? 'Bogey.' : d === 2 ? 'Double bogey.' : `${d} over par.`;
}
