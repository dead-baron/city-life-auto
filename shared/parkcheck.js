// Where a parked vehicle may stand (the owner, 2026-11-14: "parked vehicles must never sit on a promenade or a sidewalk"):
// all of its footprint - a step in from its edges, so a kerb bay's car may touch the kerb - off the pavements, the
// promenades and plazas, the lawns, the sand, a pier's planks and the buildings (parkWhy). The valet (server mycar.js)
// asks for more: every bit of it on the road, a car park or a bridge's deck (out in the country, a dirt yard) - strict.
// The parked cars (server traffic.js), a fire call's burning car (firefighter.js), the auto shop's customer (biz.js),
// the valet and the placement lint (tools/placementlint.mjs parked) all ask it. Server and tools only: the page never
// loads it.
import { TILE, T } from './constants.js';
import { VEHICLES } from './vehicles.js';
import { fencesNear, fencesOf, fencesReset } from './fences.js';

const PARK_ON = new Set([T.ROAD, T.LOT, T.BRIDGE, T.DIRT]);
// gravel (sand with reserve bit 128, the ground bake's shingle - the Red Rock trailhead's lot): ground a car may stand on
// (11-23: its two 4x4s were never parked - sand counted as a beach)
const GRAVEL = 128;
export const PARK_NEVER = new Set([T.SIDEWALK, T.PLAZA, T.GRASS, T.SAND, T.DOCK, T.BUILDING, T.FLOOR, T.COUNTER, T.WATER, T.DEEP]);
const TN = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k.toLowerCase()]));
// null when (x, y, a) holds a vehicle L x W on proper ground, else what's under it ('on sidewalk', 'on plaza'...).
// strict: only the road, a car park, a bridge or a dirt yard (a wall at a lot's edge fails it too).
export function parkWhy(m, x, y, a, L, W, strict = false) {
  const ca = Math.cos(a || 0), sa = Math.sin(a || 0);
  const hl = Math.max(0, L / 2 - 8), hw = Math.max(0, W / 2 - 5);
  for (let s = -hl; s <= hl + 0.01; s += Math.max(4, hl / 3)) for (const w of [-hw, 0, hw]) {
    const px = x + ca * s - sa * w, py = y + sa * s + ca * w;
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (!m.inside(tx, ty)) return 'off the map';
    const i = m.idx(tx, ty), t = m.tiles[i];
    if (!strict && t === T.SAND && m.reserve && (m.reserve[i] & GRAVEL)) continue;   // (gravel: a trailhead's lot - the sand's shingle look)
    if (strict ? !PARK_ON.has(t) : PARK_NEVER.has(t)) return `on ${TN[t] || 'nothing'}`;
  }
  // nor across a fence (11-23: a vehicle is held by every fence now - shared/fences.js; a car park's row with a court's
  // chain-link through it)
  const F = fencesOf(m), L2 = L / 2 - 2, W2 = W / 2 - 2;
  for (const id of fencesNear(m, x, y, Math.hypot(L2, W2) + 4)) {
    const g = F.segs[id], n = Math.max(1, Math.ceil(Math.hypot(g.x1 - g.x0, g.y1 - g.y0) / 4));
    for (let j = 0; j <= n; j++) {
      const qx = g.x0 + (g.x1 - g.x0) * j / n - x, qy = g.y0 + (g.y1 - g.y0) * j / n - y;
      if (Math.abs(qx * ca + qy * sa) < L2 && Math.abs(-qx * sa + qy * ca) < W2) return 'across a fence';
    }
  }
  return null;
}

// The parking spaces whose car would stand on a pavement, a promenade or a plaza, a lawn, the sand, a pier or a building
// (parkWhy, as a sedan: the owner, 2026-11-14: "parked vehicles must never sit on a promenade or a sidewalk") taken off
// the map's list - the server already left them empty (server/systems/traffic.js badBay), but their wheel stop was still
// drawn (client/art2/game/statics.js) and the lint counted them (tools/placementlint.mjs parked). A driveway's, a golf
// cart's and the car lots' spaces are their own. For the whole-world build's done hook (shared/world3-world.js).
//   badBays3(m) -> how many taken off
// The spaces the rule above doesn't apply to: a home's driveway, a golf cart's, and the MX park's pits (shared/world3-dirt.js
// - its bikes and trucks stand on the open ground by design: test/world3dirt.test.js). One answer for the build, the lint
// and the server (server/systems/traffic.js).
export const parkExempt = (sp, model = sp && sp.model) => !!sp && (!!sp.drive || model === 'golfcart' || !!sp.mx);
export function badBays3(m) {
  if (!Array.isArray(m.parking) || !m.tileAtPx) return 0;
  const before = m.parking.length;
  fencesReset(m);   // (the fences as they stand now, at the build's end: fences.js keeps them per map)
  const dims = (sp) => { const V = (VEHICLES && VEHICLES[sp.model]) || VEHICLES.sedan; return [V.L, V.W]; };   // (as the lint measures: the spot's own model, else a sedan)
  m.parking = m.parking.filter((sp) => !sp || parkExempt(sp) || !parkWhy(m, sp.x, sp.y, sp.a || 0, ...dims(sp)));
  fencesReset(m);
  return before - m.parking.length;
}
