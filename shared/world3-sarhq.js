// World v3's Search & Rescue HQ (the owner, 2026-10-15: "let's give the search and rescue jobs a home like a search and
// rescue hq"): the rescue pilots' base on Westport International's field, east of the terminal's apron - the HQ
// building (its door the place: kind 'sar', where a shift starts - server/systems/sar.js), the hangar, the helipad on
// the apron in front (shared/flight.js airfields: SAR_PAD from the place; a rescue helicopter parks on it -
// server/systems/aircraft.js), the windsock, the fuel, floodlights, a paved drive out to the nearest road.
// Built in the world build's dressing pass (world3-world.js dress -> buildSarHq3), on open ground found nearest the
// planned spot. Deterministic (integer layout; no Math.random, no trigonometry).
import { T, TILE } from './constants.js';
import { SAR_PAD } from './flight.js';

export const SAR_HQ = { name: 'Search & Rescue HQ', at: [1700, 2650], w: 34, h: 28 };
const OPEN = new Set([T.GRASS, T.DIRT, T.SAND, T.FIELD, T.LOT, T.PLAZA]);
const RES = 32;

// H: { addProp, simpleBuilding, removeProps } (map.js's dressing hook) -> { poi, building, hangar } | null
export function buildSarHq3(m, H, plan = SAR_HQ) {
  const ok = (x, y) => m.inside(x, y) && m.land[m.idx(x, y)] && OPEN.has(m.tiles[m.idx(x, y)]) && m.bld[m.idx(x, y)] < 0 && !(m.reserve[m.idx(x, y)] & 3) && !m.deck[m.idx(x, y)];
  const fits = (x0, y0) => { for (let y = y0; y < y0 + plan.h; y++) for (let x = x0; x < x0 + plan.w; x++) if (!ok(x, y)) return false; return true; };
  let at = null;
  for (let d = 0; d <= 240 && !at; d += 2) for (let dy = -d; dy <= d && !at; dy += 2) for (let dx = -d; dx <= d; dx += (Math.abs(dy) === d ? 2 : 2 * d || 2)) if (fits(plan.at[0] + dx, plan.at[1] + dy)) { at = [plan.at[0] + dx, plan.at[1] + dy]; break; }
  if (!at) return null;
  const [x0, y0] = at, x1 = x0 + plan.w, y1 = y0 + plan.h;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  if (H.removeProps) H.removeProps(m, (px, py) => px >= x0 * TILE && px < x1 * TILE && py >= y0 * TILE && py < y1 * TILE);
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
  // the drive: paved, three tiles wide, from the apron's front straight out to the nearest road (a row or a column)
  const cx = x0 + 9, cy = y1;
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
        if (t === T.GRASS || t === T.DIRT || t === T.SAND || t === T.FIELD || t === T.PLAZA) { m.set(qx, qy, T.LOT); m.reserve[m.idx(qx, qy)] |= RES; }
      }
    }
  }
  (m.landmarks ||= []).push({ name: plan.name, type: 'sar', x: x0 * TILE, y: y0 * TILE, w: plan.w * TILE, h: plan.h * TILE });
  return { poi, building: hq ? hq.id : -1, hangar: hangar ? hangar.id : -1, pad, at };
}
