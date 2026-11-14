// The skate parks' grind kit is solid on foot (the owner, 2026-11-14: "you can walk straight through the grind boxes /
// ledges" - an NPC stood on one at Fountain Avenue's plaza). Every skate spot's ledges, grind boxes, flat bars, rails,
// benches and planters (shared/skate.js's grind segments) get a row of solid posts along them, flagged `sk`: people on
// foot walk round them; a rider in the air or grinding passes over them as over any bench or bin (shared/physics.js: a
// board's `over`), and the crew's friend sitting on a ledge is let sit on it (physics.js noProps 'sk'). The kicker, the
// pyramid and the quarter pipes are ridden (and walked) up as before - a quarter pipe has its own posts (map.js
// qpipeSolids). Run once at the end of World v3's build (world3-world.js), before the last tidy.
import { TILE } from './constants.js';
import { benchAlongX } from './skate.js';

const BENCH = new Set(['bench_a', 'bench_b', 'bench_m', 'pbench']);
const R = 8, STEP = 12;   // the posts' radius and spacing (px): a ledge is a low concrete block ~16 px deep
// the line a grind piece of kit covers [x0, y0, x1, y1] (skate.js buildChunk's segments), or null
function lineOf(m, p) {
  const w = p.w || 96;
  switch (p.t) {
    case 'ledge': return [p.x - w / 2 + 3, p.y, p.x + w / 2 - 3, p.y];
    case 'flatbar': return [p.x - w / 2 + 4, p.y, p.x + w / 2 - 4, p.y];
    case 'planter_fl': return [p.x - 20, p.y, p.x + 20, p.y];
    case 'planter_g': return [p.x - 10, p.y, p.x + 10, p.y];
    default: if (BENCH.has(p.t)) return benchAlongX(m, p) ? [p.x - 14, p.y, p.x + 14, p.y] : [p.x, p.y - 14, p.x, p.y + 14];
  }
  return null;
}
export function skateSolids3(m) {
  const spots = m.skateSpots || [];
  let n = 0;
  if (!spots.length) return n;
  const inSpot = (x, y) => spots.some((q) => x >= q.x * TILE && x <= (q.x + q.w) * TILE && y >= q.y * TILE && y <= (q.y + q.h) * TILE);
  m.props.forEach((p, i) => {
    if (!p || m.propSolid.has(i) || !inSpot(p.x, p.y)) return;
    const L = lineOf(m, p);
    if (!L) return;
    const [x0, y0, x1, y1] = L, len = Math.hypot(x1 - x0, y1 - y0), k = len > 2 * R ? Math.max(1, Math.round((len - 2 * R) / STEP)) : 0;
    for (let j = 0; j <= k; j++) {
      const f = len > 2 * R ? (R + (len - 2 * R) * j / k) / len : 0.5;
      const e = m.addSolidProp(Math.round(x0 + (x1 - x0) * f), Math.round(y0 + (y1 - y0) * f), R);
      e.sk = 1;
    }
    n++;
  });
  return n;
}
