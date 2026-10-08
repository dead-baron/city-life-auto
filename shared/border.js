// The edge of the world (the user's note, 2026-10-07): the sea runs on past the map's edge, but not for ever, and
// there's no wall to ram. Past the edge you're warned to turn back (the client's HUD, with an arrow the shortest way
// home). Past EDGE_SLOW the way out gets heavier and heavier: anything heading further out slows, sideways a good
// deal too, the way back not at all. At EDGE_OUT nothing goes any further. The map itself ends where it always did
// (its tiles and its signature): only what lies past it is new, open sea (map.js tileAt with softEdge).
//
// The server runs edgeBrake on everything that moves (shared/physics.js pedStep and vehStep), and the client runs
// the same when predicting your own movement, so the two agree.
import { WORLD_W, WORLD_H } from './constants.js';

export const EDGE_SLOW = 480;     // px past the map's edge where the slowing starts
export const EDGE_OUT = 1280;     // px past the edge: no further
const OUT_V = 720;                // the fastest anything goes heading out, at EDGE_SLOW; it falls to 0 at EDGE_OUT
const SIDE_V = 620;               // ...and along the edge: down to a crawl at EDGE_OUT

// How far (x, y) is past the map's edge (d, 0 inside the map) and the unit vector of the shortest way back (nx, ny).
export function edgeInfo(x, y, out = {}) {
  const qx = x < 0 ? 0 : x > WORLD_W ? WORLD_W : x, qy = y < 0 ? 0 : y > WORLD_H ? WORLD_H : y;
  const dx = qx - x, dy = qy - y, d = Math.sqrt(dx * dx + dy * dy);
  out.d = d; out.nx = d > 0 ? dx / d : 0; out.ny = d > 0 ? dy / d : 0;
  return out;
}

// How hard it's holding you back, 0 (free) .. 1 (stopped going out), at d px past the edge.
export const edgeHold = (d) => (d <= EDGE_SLOW ? 0 : d >= EDGE_OUT ? 1 : (d - EDGE_SLOW) / (EDGE_OUT - EDGE_SLOW));

// Brake a moving thing {x, y, vx, vy} past the edge (after its step): its speed out capped lower the further out it
// is, its speed along the edge dragged down too, its speed back toward the city untouched; at EDGE_OUT it is put
// back on the line. Returns how hard it held (0 inside the slowing band's start).
const E = { d: 0, nx: 0, ny: 0 };
export function edgeBrake(s) {
  const e = edgeInfo(s.x, s.y, E);
  if (e.d <= EDGE_SLOW) return 0;
  const k = edgeHold(e.d), back = s.vx * e.nx + s.vy * e.ny;      // (+ toward the city)
  const sx = s.vx - back * e.nx, sy = s.vy - back * e.ny, side = Math.sqrt(sx * sx + sy * sy);
  const outCap = OUT_V * (1 - k) * (1 - k), sideCap = SIDE_V * (1 - 0.9 * k);
  const b = back < -outCap ? -outCap : back, ks = side > sideCap ? sideCap / side : 1;
  s.vx = b * e.nx + sx * ks; s.vy = b * e.ny + sy * ks;
  if (e.d > EDGE_OUT) { s.x += e.nx * (e.d - EDGE_OUT); s.y += e.ny * (e.d - EDGE_OUT); }
  return k;
}
