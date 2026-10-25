// World v3's Search & Rescue HQs (the owner, 2026-10-15: "let's give the search and rescue jobs a home like a search and
// rescue hq"; 10-23: "We should have a few specific search and rescue HQs to take these missions not the hospital"): the
// rescue pilots' bases - the first on Westport International's field, east of the terminal's apron, and four out in the
// wild land (SAR_HQS: a ranger station under Granite Peaks, coastguard stations on the Egret Coast and the Sandpiper
// Coast, a rescue post in the Red Rock Desert). Each: the HQ building (its door the place: kind 'sar', where a shift
// starts - server/systems/sar.js, which sends the calls near the base you signed on at), the hangar, the helipad on the
// apron in front (shared/flight.js airfields: SAR_PAD from the place; a rescue helicopter parks on it -
// server/systems/aircraft.js), the windsock, the fuel, floodlights, a paved drive out to the nearest road.
// Built in the world build's dressing pass (world3-world.js dress -> buildSarHqs3), on open ground found nearest the
// planned spot (out in the wild: clear of the designed nature places, its trees and rocks cleared off the apron and the
// drive). Deterministic (integer layout; no Math.random, no trigonometry).
import { T, TILE } from './constants.js';
import { SAR_PAD } from './flight.js';

export const SAR_HQ = { name: 'Search & Rescue HQ', at: [1700, 2650], w: 34, h: 28 };
// all the bases (tiles: the planned top-left corner; wild: out in the wild land - see above)
export const SAR_HQS = [
  SAR_HQ,
  { name: 'Granite Peaks Ranger Station', at: [1000, 460], w: 34, h: 28, wild: true },   // (up in the peaks, by the road; the woods below)
  { name: 'Egret Coast Coastguard Station', at: [788, 2788], w: 34, h: 28, wild: true },   // (by the shore: the marsh, the open sea west)
  { name: 'Red Rock Rescue Post', at: [4840, 1160], w: 34, h: 28, wild: true },   // (the canyons and mesas, off the desert road)
  { name: 'Sandpiper Coastguard Station', at: [5492, 2764], w: 34, h: 28, wild: true },   // (on the east coast's shore, west of the point)
];
const OPEN = new Set([T.GRASS, T.DIRT, T.SAND, T.FIELD, T.LOT, T.PLAZA]);
const RES = 32, CLIFF_GAP = 3, TOWN_GAP = 6;

// every base of SAR_HQS that finds its ground -> [{ poi, building, hangar, pad, at }]
export function buildSarHqs3(m, H) { return SAR_HQS.map((plan) => buildSarHq3(m, H, plan)).filter(Boolean); }

// H: { addProp, simpleBuilding, removeProps } (map.js's dressing hook) -> { poi, building, hangar } | null
export function buildSarHq3(m, H, plan = SAR_HQ) {
  const keep = plan.wild ? 3 | 32 : 3;   // (in the wild: not on a designed nature place either)
  const ok = (x, y) => m.inside(x, y) && m.land[m.idx(x, y)] && OPEN.has(m.tiles[m.idx(x, y)]) && m.bld[m.idx(x, y)] < 0 && !(m.reserve[m.idx(x, y)] & keep) && !m.deck[m.idx(x, y)];
  // (out in the wild: clear of the relief's cliff bands by CLIFF_GAP too - shared/world3-relief.js lays them first)
  const cliffNear = (x0, y0, x1, y1) => { for (let y = y0 - CLIFF_GAP; y < y1 + CLIFF_GAP; y++) for (let x = x0 - CLIFF_GAP; x < x1 + CLIFF_GAP; x++) if (m.inside(x, y) && m.tiles[m.idx(x, y)] === T.WALL) return true; return false; };
  // (and wholly in the planned spot's own district, TOWN_GAP tiles in: never on a town's ground or up against it - the
  // Sandpiper Coast's station is a short way from Sandpiper Bay's boardwalk)
  const home = plan.wild && m.inside(plan.at[0], plan.at[1]) ? m.dist[m.idx(plan.at[0], plan.at[1])] : -1;
  const ownGround = (x0, y0, x1, y1) => { for (let y = y0 - TOWN_GAP; y < y1 + TOWN_GAP; y++) for (let x = x0 - TOWN_GAP; x < x1 + TOWN_GAP; x++) if (m.inside(x, y) && m.dist[m.idx(x, y)] !== home) return false; return true; };
  const fits = (x0, y0) => { for (let y = y0; y < y0 + plan.h; y++) for (let x = x0; x < x0 + plan.w; x++) if (!ok(x, y)) return false; return !plan.wild || (!cliffNear(x0, y0, x0 + plan.w, y0 + plan.h) && ownGround(x0, y0, x0 + plan.w, y0 + plan.h)); };
  let at = null;
  for (let d = 0; d <= 240 && !at; d += 2) for (let dy = -d; dy <= d && !at; dy += 2) for (let dx = -d; dx <= d; dx += (Math.abs(dy) === d ? 2 : 2 * d || 2)) if (fits(plan.at[0] + dx, plan.at[1] + dy)) { at = [plan.at[0] + dx, plan.at[1] + dy]; break; }
  if (!at) return null;
  const [x0, y0] = at, x1 = x0 + plan.w, y1 = y0 + plan.h;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  // the drive: paved, three tiles wide, from the apron's front straight out to the nearest road (a row or a column) -
  // its tiles worked out first, so the trees and rocks come off it with the apron's
  const cx = x0 + 9, cy = y1, drive = [];
  let road = null;
  for (let r = 1; r <= 160 && !road; r++) for (const [ex, ey] of [[cx, cy + r], [cx - r - 9, y0 + 14], [x1 + r, y0 + 14], [cx, y0 - r]]) if (m.inside(ex, ey) && m.tiles[m.idx(ex, ey)] === T.ROAD) { road = [ex, ey]; break; }
  if (road) {
    const [ex, ey] = road, sx = ex === cx ? cx : ex < x0 ? x0 : x1 - 1, sy = ex === cx ? (ey > y0 ? y1 - 1 : y0) : y0 + 14;
    const n = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
    for (let s = 0; s <= n; s++) {
      const tx = Math.round(sx + ((ex - sx) * s) / (n || 1)), ty = Math.round(sy + ((ey - sy) * s) / (n || 1));
      for (let o = -1; o <= 1; o++) {
        const qx = ex === cx ? tx + o : tx, qy = ex === cx ? ty : ty + o;
        if (!m.inside(qx, qy)) continue;
        const t = m.tiles[m.idx(qx, qy)];
        if (t === T.GRASS || t === T.DIRT || t === T.SAND || t === T.FIELD || t === T.PLAZA) drive.push(m.idx(qx, qy));
      }
    }
  }
  // (out in the wild, no drive - the helicopters don't need one - where it would run along a cliff, or leave the base's
  // district: across a town's ground it paved the boardwalk out from under Sandpiper Bay's rail - or over its paving)
  if (plan.wild && drive.some((i) => { const x = m.x0 + (i % m.w), y = m.y0 + Math.floor(i / m.w); return m.dist[i] !== home || m.tiles[i] === T.PLAZA || (m.reserve[i] & ~RES) || cliffNear(x, y, x + 1, y + 1); })) drive.length = 0;
  const onDrive = new Set(drive);
  if (H.removeProps) H.removeProps(m, (px, py) => (px >= x0 * TILE && px < x1 * TILE && py >= y0 * TILE && py < y1 * TILE) || (plan.wild && onDrive.has(m.idx(Math.floor(px / TILE), Math.floor(py / TILE)))));
  // the ground: a paved apron, a lawn strip along the front of the HQ
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = m.idx(x, y); m.set(x, y, y >= y0 + 9 && y < y0 + 11 && x < x0 + 16 ? T.PLAZA : T.LOT); m.reserve[i] |= RES; }
  // the HQ (its door on the apron, facing south) and the hangar beside it
  const d = m.dist[m.idx(x0 + 8, y0 + 5)];
  const hq = H.simpleBuilding ? H.simpleBuilding(m, x0 + 2, y0 + 2, 14, 7, plan.name, 'sar', d, 'metal') : null;
  const hangar = H.simpleBuilding ? H.simpleBuilding(m, x0 + 19, y0 + 1, 13, 10, 'Rescue Hangar', 'hangar', d, 'metal') : null;
  // the place at the HQ's door; the helipad on the apron in front of it (SAR_PAD, as shared/flight.js reads it)
  const px = (x0 + 9) * TILE, py = (y0 + 10) * TILE;
  const poi = { id: m.pois.length, kind: 'sar', label: plan.name, x: px, y: py, r: 44, fixed: true, b: hq ? hq.id : -1 };
  m.pois.push(poi);
  const pad = { x: px + SAR_PAD[0], y: py + SAR_PAD[1] };
  // round the pad: its lights; the windsock, the fuel bowser and drums, floodlights
  for (let k = 0; k < 8; k++) { const a = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]][k]; add('rwlight', pad.x / TILE + a[0] * 3.1, pad.y / TILE + a[1] * 3.1, 0, { c: k % 2 ? 'w' : 'g' }); }
  add('windsock', x0 + 31, y0 + 14, 4, { a: 0.3 });
  add('otank', x0 + 30, y0 + 22, 22); add('drum', x0 + 32, y0 + 22.6, 6); add('drum', x0 + 32.6, y0 + 22, 6);
  for (const fx of [x0 + 1, x0 + 33]) add('lamp', fx, y0 + 25, 6);
  for (const i of drive) { m.tiles[i] = T.LOT; m.reserve[i] |= RES; }
  (m.landmarks ||= []).push({ name: plan.name, type: 'sar', x: x0 * TILE, y: y0 * TILE, w: plan.w * TILE, h: plan.h * TILE });
  return { poi, building: hq ? hq.id : -1, hangar: hangar ? hangar.id : -1, pad, at };
}
