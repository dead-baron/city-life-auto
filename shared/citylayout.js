// Layout of the built-up world, after the world map concept (one concept pixel = one tile):
// Metro City on the central island - a street grid with a diagonal boulevard through the
// downtown core, an elevated ring highway with slip ramps to one-way frontage roads either side,
// curving coast and river drives, Bayside Heights' crescents - and across the river Southbank's
// winding suburban streets with cul-de-sacs. East of the city the farm country of Dry Creek.
// Bridges lead out to the wild islands that come later.
//
// Everything here is in tiles unless a name says px. The generator (map.js) turns the road
// lines into the network (roads.js) and the tiles.
import { TILE } from './constants.js';
import { rounded, offset, measure, pointAt, chaikin, simplify, cubic, dirOf, project } from './geom.js';

// Zones (map.zone): which part of the world a tile belongs to.
export const Z = { SEA: 0, CITY: 1, SOUTH: 2, EAST: 3, WILD: 4, KEY: 5, ROCK: 6 };

// The ring highway (centre line corners, clockwise) and the frontage roads either side of it.
export const RING = [[648, 650], [648, 482], [716, 430], [1022, 430], [1022, 520], [990, 548], [955, 578], [932, 612], [900, 634], [850, 644], [760, 652]];
export const RING_R = 20;      // corner radius
export const BAND = 20;        // ring centre line -> frontage road centre line
// Street grid (centre lines). Avenues (wider, two lanes each way) pass under the highway;
// plain streets stop at the frontage roads.
export const GRID_X = [538, 568, 598, 628, 658, 688, 718, 748, 778, 808, 838, 868, 898, 928, 958, 988, 1018];
export const GRID_Y = [220, 248, 276, 304, 332, 360, 388, 416, 444, 472, 500, 528, 556, 584, 612, 640, 668, 696, 724, 752, 780, 808, 836, 864, 892];
export const AVE_X = new Set([598, 688, 778, 868, 958]);
export const AVE_Y = new Set([388, 472, 556, 724, 808]);
// Avenues that cross the river into Southbank on bridges.
export const RIVER_BRIDGES = new Set([868, 958]);
// Greenfield Park: a whole superblock with no streets through it.
export const PARK = { x0: 688, y0: 584, x1: 748, y1: 642, label: 'Greenfield Park' };
// Bayside Heights: crescents around a round green instead of a grid.
export const CRESCENT = { x: 958, y: 520, r: [12, 26] };
// Broadway: the diagonal boulevard through the downtown core (through grid crossings).
export const BROADWAY = [[748, 584], [778, 556], [808, 528], [838, 500], [868, 472], [898, 444], [914, 429]];

// District seeds per zone: [district id, x, y]. Tiles take the nearest seed in their zone
// (with a little noise so borders wander), then a few hard overrides (the park).
export const SEEDS = [
  [2, 700, 462], [2, 790, 460], [2, 860, 458],                 // Northgate
  [1, 700, 505], [1, 705, 560], [1, 745, 520],                  // Midtown
  [4, 805, 505], [4, 850, 530], [4, 815, 555], [4, 862, 498],   // Downtown
  [5, 905, 468], [5, 892, 500],                                // Civic Center
  [16, 958, 520], [16, 985, 470], [16, 985, 575],              // Bayside Heights
  [7, 790, 603], [7, 840, 610], [7, 770, 625],                  // Neon Strip
  [17, 890, 585], [17, 915, 560],                               // The Pink Mile
  [18, 960, 360], [18, 1000, 380], [18, 910, 390], [18, 840, 395], [18, 985, 335], // Old Town
  [10, 595, 470], [10, 590, 515], [10, 600, 545],               // Sunset Beach
  [8, 595, 595], [8, 610, 635], [8, 628, 668],                  // Harbor
  [3, 680, 695], [3, 715, 710], [3, 752, 700], [3, 700, 728],   // The Yards
  [0, 815, 735], [0, 860, 768], [0, 890, 720], [0, 830, 775], [0, 915, 790], [0, 900, 840], // Pine Hills
  [6, 985, 700], [6, 1015, 760], [6, 1000, 820], [6, 1030, 690], // Southside
];

const P = (x, y) => ({ x: x * TILE, y: y * TILE });

// --------------------------------------------------------------------------------------------
// Helpers

// Keep the parts of a polyline (px) where ok(xTile, yTile) holds. Returns pieces (px).
export function clipLine(pts, ok, minLen = 6 * TILE, step = 16) {
  const L = measure(pts);
  const out = [];
  let cur = null;
  for (let s = 0; s <= L + 0.01; s += step) {
    const p = pointAt(pts, Math.min(s, L));
    if (ok(p.x / TILE, p.y / TILE)) { (cur ??= []).push({ x: p.x, y: p.y }); } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.map((q) => simplify(q, 1.5)).filter((q) => q.length >= 2 && measure(q.map((p) => ({ ...p }))) >= minLen);
}

// Offset of a closed loop (px).
export function offsetLoop(pts, d) {
  const n = pts.length - 1; // last == first
  const ext = [pts[n - 1], ...pts, pts[1]];
  const o = offset(ext, d).slice(1, -1);
  o[o.length - 1] = { ...o[0] };
  return o;
}

// Iso-lines of a scalar field (marching squares over tile centres) inside a region: polylines in px.
export function contours(field, W, H, iso, inRegion, x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1) {
  const segs = [];
  const v = (x, y) => field[y * W + x];
  const lerp = (a, b) => (iso - a) / ((b - a) || 1e-6);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!inRegion(x, y)) continue;
    const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1);
    const k = (a >= iso ? 8 : 0) | (b >= iso ? 4 : 0) | (c >= iso ? 2 : 0) | (d >= iso ? 1 : 0);
    if (k === 0 || k === 15) continue;
    const T = [x + lerp(a, b), y], R = [x + 1, y + lerp(b, c)], B = [x + lerp(d, c), y + 1], Lf = [x, y + lerp(a, d)];
    const add = (p, q) => segs.push([p, q]);
    switch (k) {
      case 1: case 14: add(Lf, B); break;
      case 2: case 13: add(B, R); break;
      case 3: case 12: add(Lf, R); break;
      case 4: case 11: add(T, R); break;
      case 5: add(Lf, T); add(B, R); break;
      case 6: case 9: add(T, B); break;
      case 7: case 8: add(Lf, T); break;
      case 10: add(T, R); add(Lf, B); break;
    }
  }
  // chain segments by shared end points
  const key = (p) => `${Math.round(p[0] * 64)},${Math.round(p[1] * 64)}`;
  const ends = new Map();
  segs.forEach((s, i) => { for (const e of [0, 1]) { const k = key(s[e]); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [segs[i][0], segs[i][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? line[line.length - 1] : line[0];
        const next = (ends.get(key(tip)) || []).find((j) => !used[j]);
        if (next === undefined) break;
        used[next] = 1;
        const s = segs[next];
        const other = key(s[0]) === key(tip) ? s[1] : s[0];
        if (dir) line.push(other); else line.unshift(other);
      }
    }
    if (line.length >= 6) lines.push(line.map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })));
  }
  return lines;
}

// Smooth a jaggy traced line into a drivable curve.
export function smoothLine(pts, tol = 20) {
  return chaikin(simplify(chaikin(pts, 2), tol), 2);
}

// --------------------------------------------------------------------------------------------
// The ring highway (px, closed, clockwise) and its frontage roads.
export function ringLine() {
  const pts = rounded(RING.map(([x, y]) => P(x, y)), RING_R * TILE, true, 12);
  measure(pts);
  return pts;
}

// Where the slip ramps go: at every other avenue crossing (by arc length along the clockwise
// ring), never where something else passes under the deck within a ramp's reach.
export function rampSites(ringPts, crossS, keepOut) {
  const L = ringPts[ringPts.length - 1].s;
  const sorted = crossS.slice().sort((a, b) => a - b);
  const sites = [];
  for (const s of sorted) {
    if (sites.length && s - sites[sites.length - 1] < 4300) continue;
    if (sites.length && L - s + sites[0] < 4300) continue;
    const clear = keepOut.every((k) => { const d = Math.abs(((k - s) % L + L * 1.5) % L - L / 2); return d > 2120 || d < 1; });
    if (clear) sites.push(s);
  }
  return sites;
}

// One slip ramp between the deck and a frontage road. dir +1: clockwise carriageway (inner side),
// -1: anticlockwise (outer side). off: leaving the highway (true) or joining it.
export function slipRamp(ringPts, front, s, dirSign, off) {
  const L = ringPts[ringPts.length - 1].s;
  const at = (q) => pointAt(ringPts, ((q % L) + L) % L);
  // travel direction along the ring for this carriageway, and its right-hand side
  const sDeck = off ? s - 2000 * dirSign : s + 2000 * dirSign;
  const sGround = off ? s - 700 * dirSign : s + 700 * dirSign;
  const pd = at(sDeck), pg = at(sGround);
  const tdx = pd.tx * dirSign, tdy = pd.ty * dirSign;
  const gdx = pg.tx * dirSign, gdy = pg.ty * dirSign;
  // right of travel: (-ty, tx)
  const deckPt = { x: pd.x - tdy * 7 * TILE * 0.82, y: pd.y + tdx * 7 * TILE * 0.82 };
  const groundPt = { x: pg.x - gdy * BAND * TILE, y: pg.y + gdx * BAND * TILE };
  // snap the ground end onto the frontage road itself
  let best = null;
  for (const piece of front) {
    if (piece[0].s === undefined) measure(piece);
    const pr = project(piece, groundPt);
    if (pr && (!best || pr.d < best.d)) best = pr;
  }
  if (!best || best.d > 6 * TILE) return null;
  const gp = { x: best.x, y: best.y };
  const span = Math.hypot(gp.x - deckPt.x, gp.y - deckPt.y);
  const a = off ? deckPt : gp, b = off ? gp : deckPt;
  const ta = off ? { x: tdx, y: tdy } : { x: gdx, y: gdy }, tb = off ? { x: gdx, y: gdy } : { x: tdx, y: tdy };
  const pts = cubic(a, { x: a.x + ta.x * span * 0.42, y: a.y + ta.y * span * 0.42 }, { x: b.x - tb.x * span * 0.42, y: b.y - tb.y * span * 0.42 }, b, 20);
  return { pts, z0: off ? 1 : 0, z1: off ? 0 : 1 };
}

// Straight run from (x, y) heading (dx, dy) across water to the next land: returns the far shore
// point and the water length, or null.
export function acrossWater(isLand, x, y, dx, dy, maxLen = 260) {
  let k = 0;
  while (k < 80 && isLand(Math.round(x + dx * k), Math.round(y + dy * k))) k++;
  const w0 = k;
  while (k < maxLen && !isLand(Math.round(x + dx * k), Math.round(y + dy * k))) k++;
  if (k >= maxLen) return null;
  return { x: x + dx * k, y: y + dy * k, wet: k - w0, start: { x: x + dx * w0, y: y + dy * w0 } };
}

export { dirOf };
