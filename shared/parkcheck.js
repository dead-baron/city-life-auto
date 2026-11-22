// Where a parked vehicle may stand (the owner, 2026-11-14: "parked vehicles must never sit on a promenade or a sidewalk"):
// all of its footprint - a step in from its edges, so a kerb bay's car may touch the kerb - off the pavements, the
// promenades and plazas, the lawns, the sand, a pier's planks and the buildings (parkWhy). The valet (server mycar.js)
// asks for more: every bit of it on the road, a car park or a bridge's deck (out in the country, a dirt yard) - strict.
// The parked cars (server traffic.js), a fire call's burning car (firefighter.js), the auto shop's customer (biz.js),
// the valet and the placement lint (tools/placementlint.mjs parked) all ask it. Server and tools only: the page never
// loads it.
import { TILE, T } from './constants.js';
import { VEHICLES } from './vehicles.js';

const PARK_ON = new Set([T.ROAD, T.LOT, T.BRIDGE, T.DIRT]);
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
    const t = m.tiles[m.idx(tx, ty)];
    if (strict ? !PARK_ON.has(t) : PARK_NEVER.has(t)) return `on ${TN[t] || 'nothing'}`;
  }
  return null;
}

// The parking spaces whose car would stand on a pavement, a promenade or a plaza, a lawn, the sand, a pier or a building
// (parkWhy, as a sedan: the owner, 2026-11-14: "parked vehicles must never sit on a promenade or a sidewalk") taken off
// the map's list - the server already left them empty (server/systems/traffic.js badBay), but their wheel stop was still
// drawn (client/art2/game/statics.js) and the lint counted them (tools/placementlint.mjs parked). A driveway's, a golf
// cart's and the car lots' spaces are their own. For the whole-world build's done hook (shared/world3-world.js).
//   badBays3(m) -> how many taken off
export function badBays3(m) {
  if (!Array.isArray(m.parking) || !m.tileAtPx) return 0;
  const before = m.parking.length;
  const dims = (sp) => { const V = (VEHICLES && VEHICLES[sp.model]) || VEHICLES.sedan; return [V.L, V.W]; };   // (as the lint measures: the spot's own model, else a sedan)
  m.parking = m.parking.filter((sp) => !sp || sp.drive || sp.model === 'golfcart' || !parkWhy(m, sp.x, sp.y, sp.a || 0, ...dims(sp)));
  return before - m.parking.length;
}
