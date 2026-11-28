// World v3: the Employment Center (the owner, 11-16: "even having the 'office work' or employment center options in the
// city so we can send beta players that way" - server/systems/jobcenter.js). Downtown, on the corner of Park East Avenue
// and 22nd Street, across the avenue from Greenfield Park - a walk east through the park from the city's arrival
// (Greenfield Park Station, shared/world3-firstcars.js): the south end of the paving in front of Park East Tower, west of
// the Grand Neon Hotel's fountain drive (shared/world3-downtown.js eastBand) - open ground the craft passes left bare.
// A three-floor civic office in pale stone, EMPLOYMENT CENTER over its glass doors, onto 22nd Street's pavement; the
// tower keeps its forecourt in front of it. Inside (a walk-in: shared/map.js walkInRoom, fitted by shared/shoprooms.js
// FIT.jobs): the front desk at the counter (poi 'jobcenter': office work), the cork job board and NOW HIRING behind it,
// the job computers along one side (poi 'jobpc' at the first: the listings and, with ads on, the ad), waiting chairs, a
// water cooler and plants on the other.
// Laid in the done hook after every other building and place (shared/world3-world.js), so no other building's, home's
// or place's number moves (no WORLD_VERSION bump): its building, its two places and its walk-in join their lists last.
// Its ground is checked free first (paving, no building); anything standing on it is cleared.
// Deterministic: integer tiles, nothing at load.
import { TILE, T } from './constants.js';
import { shopRoom, jobDesk } from './shoprooms.js';

export const JOB_CENTER = { x: 3196, y: 2471, w: 15, h: 12, name: 'Employment Center', d: 4 };
const OPEN = new Set([T.PLAZA, T.GRASS, T.LOT, T.SIDEWALK]);
const WALKABLE = new Set([T.PLAZA, T.SIDEWALK, T.LOT]);

// H3: the done hook's { removeProps, addProp, walkInRoom } (shared/map.js) -> { built, b, poi, pc } | { built: false, why }
export function jobCenter3(m, H3) {
  const J = JOB_CENTER, { x, y, w, h } = J, out = { built: false };
  if (!H3 || !H3.walkInRoom || !m.inside(x, y) || !m.inside(x + w - 1, y + h)) { out.why = 'not in this build'; return out; }
  if (m.dist[m.idx(x + (w >> 1), y + (h >> 1))] !== J.d) { out.why = 'not Downtown'; return out; }
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { const i = m.idx(tx, ty); if (m.bld[i] >= 0 || !OPEN.has(m.tiles[i])) { out.why = `taken at ${tx},${ty}`; return out; } }
  const dtx = x + (w >> 1) - 1;   // (the doorway: two tiles in the middle of the front)
  for (const tx of [dtx, dtx + 1]) if (!WALKABLE.has(m.tiles[m.idx(tx, y + h)])) { out.why = 'no pavement at the door'; return out; }
  // the ground: what stood on it cleared (and a step clear in front of the doors)
  const x0 = x * TILE, x1 = (x + w) * TILE, y0 = y * TILE, y1 = (y + h) * TILE;
  // (and the street trees and poles in front of its frontage, which would stand before its sign - signCovered, world3server)
  const tall = new Set(m.props.filter((pr) => /^(tree_|palm_|powerPole)/.test(pr.t) && pr.x >= x0 - TILE && pr.x < x1 + TILE && pr.y >= y1 && pr.y < y1 + TILE * 3).map((pr) => pr.x + ',' + pr.y));
  if (H3.removeProps) H3.removeProps(m, (px, py) => (px >= x0 - 8 && px < x1 + 8 && py >= y0 - 8 && py < y1 + 8) || (px >= (dtx - 1) * TILE && px < (dtx + 3) * TILE && py >= y1 && py < y1 + TILE * 1.5) || tall.has(px + ',' + py));
  // the building, as the hand plans lay theirs (shared/world3-hand.js handBuilding): its lot record, tiles, art and door
  const bid = m.buildings.length, d = J.d;
  const art = {
    spec: { floors: 3, style: 'stone', wallColor: '#e4dccb', win: 'tall', cornice: 'dentil', parapet: 10, grime: 0.06, roofMat: 'gravel', lip: 10, rimW: 5 },
    shop: { kind: 'lobby', door: 'left', open: true, people: 2, awning: ['#1e3a5e', '#e8e4dc'], sign: { text: 'EMPLOYMENT CENTER', bg: '#1e3a5e', fg: [250, 222, 140], lit: true } },
  };
  const b = { id: bid, prefab: m.prefabs.length, tx: x, ty: y, tw: w, th: h, kind: 'apt1', arch: 'office', name: J.name, business: 'jobcenter', signs: [], hand: true, whole: true, art };
  m.prefabs.push({ key: 'apt1', tx: x, ty: y, tw: w, th: h, rot: 0, d, solid: [0, 0, w, h], hand: true });
  m.buildings.push(b);
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { const i = m.idx(tx, ty); m.tiles[i] = T.BUILDING; m.bld[i] = bid; }
  b.door = { tx: dtx, ty: y + h };
  const px = (dtx + 1) * TILE, py = (y + h + 0.7) * TILE;
  const poi = { id: m.pois.length, kind: 'jobcenter', label: J.name, x: px, y: py, r: 48, b: bid, fixed: true, walk: true, store: 'jobs' };
  m.pois.push(poi);
  b.signs.push({ x: px, y: (y + h - 0.6) * TILE, text: J.name });
  // its walk-in: the room, the doorway, the front desk (the place moved in front of it)
  if (!H3.walkInRoom(m, b, [poi], [poi], true) || !b.walkIn) { out.why = 'no room'; return out; }
  const u = b.walkIn.units[0], R = shopRoom(b, u, TILE, m), at = jobDesk(R);
  const pc = at ? { id: m.pois.length, kind: 'jobpc', label: 'Job computer', x: at.x, y: at.y, r: 30, b: bid, fixed: true } : null;
  if (pc) m.pois.push(pc);
  // its side of the forecourt: a bench, a planter, a bike rack - away from the doors
  if (H3.addProp) {
    H3.addProp(m, 'bench_m', Math.round((x + w + 1.2) * TILE), Math.round((y + h - 1.6) * TILE), 0);
    H3.addProp(m, 'planter_g', Math.round((x + w + 0.7) * TILE), Math.round((y + h - 3.6) * TILE), 0);
    H3.addProp(m, 'bikerack', Math.round((x + w + 1.4) * TILE), Math.round((y + 1.6) * TILE), 0);
  }
  Object.assign(out, { built: true, b: bid, poi: poi.id, pc: pc ? pc.id : null });
  return out;
}
