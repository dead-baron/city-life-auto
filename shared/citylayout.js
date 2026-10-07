// Layout of the built-up world, after the world map concept (one concept pixel = one tile):
// Metro City on the central island - its streets (avenues, Broadway on the diagonal, each
// district's own blocks) are laid in metro.js; here are the elevated ring highway with slip ramps
// to one-way frontage roads either side, curving coast and river drives, Bayside Heights'
// crescents - and across the river Southbank's winding suburban streets with cul-de-sacs. East of
// the city the farm country of Dry Creek. Bridges lead out to the wild islands that come later.
//
// Everything here is in tiles unless a name says px. The generator (map.js) turns the road
// lines into the network (roads.js) and the tiles.
import { TILE } from './constants.js';
import { rounded, offset, measure, pointAt, chaikin, simplify, cubic, dirOf, project } from './geom.js';

// Zones (map.zone): which part of the world a tile belongs to.
export const Z = { SEA: 0, CITY: 1, SOUTH: 2, EAST: 3, WILD: 4, KEY: 5, ROCK: 6, WEST: 7, NORTH: 8, ISLE: 9, GULL: 10 };

// The ring highway (centre line corners, clockwise) and the frontage roads either side of it.
export const RING = [[648, 650], [648, 482], [716, 430], [1022, 430], [1022, 520], [990, 548], [955, 578], [932, 612], [900, 634], [850, 644], [760, 652]];
export const RING_R = 20;      // corner radius
export const BAND = 20;        // ring centre line -> frontage road centre line
// Greenfield Park: a whole superblock with no streets through it.
export const PARK = { x0: 688, y0: 584, x1: 748, y1: 642, label: 'Greenfield Park' };
// Bayside Heights: crescents around a round green instead of a grid.
export const CRESCENT = { x: 958, y: 520, r: [12, 26] };

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

// Where the interchanges go: at every other avenue crossing (by arc length along the clockwise ring), never
// where something else (another avenue, the railway) passes under the deck within a ramp's reach.
export const RAMP_REACH = 1900;   // px along the ring from the avenue to where a ramp leaves (or joins) the deck
export function rampSites(ringPts, crossS, keepOut) {
  const L = ringPts[ringPts.length - 1].s;
  const sorted = crossS.slice().sort((a, b) => a - b);
  const sites = [];
  for (const s of sorted) {
    if (sites.length && s - sites[sites.length - 1] < 2 * RAMP_REACH + 500) continue;
    if (sites.length && L - s + sites[0] < 2 * RAMP_REACH + 500) continue;
    const clear = keepOut.every((k) => { const d = Math.abs(((k - s) % L + L * 1.5) % L - L / 2); return d > RAMP_REACH + 220 || d < 1; });
    if (clear) sites.push(s);
  }
  return sites;
}

// One ramp of a diamond interchange where an avenue passes under the deck (docs/WORLD-V2.md, "Highway ramps"):
//   off-ramp (off = true): a deceleration lane peels off the outer lane along a taper, runs alongside the deck as
//   a third lane, bends away in a gentle curve while it eases down the embankment, levels out, and meets the
//   avenue square-on at the ramp's own signalled junction, well clear of the bridge;
//   on-ramp: the mirror image - level start at the avenue, an eased climb through the curve, then an acceleration
//   lane alongside the deck that tapers into the outer lane.
// s: the crossing's arc length on the ring; ave: { x, y, dx, dy } the avenue's point and direction there; dirSign
// +1 for the clockwise carriageway (ramps on the inner side), -1 anticlockwise (outer side). o: { lane, aux, D }
// - the outer lane's and the auxiliary lane's offsets from the ring's centre line, and how far out (from the
// ring's centre line) the ramps meet the avenue. Returns { pts, z0, z1, zr, foot } or null (too skewed a crossing).
export function diamondRamp(ringPts, s, ave, dirSign, off, o) {
  const L = ringPts[ringPts.length - 1].s;
  const at = (q) => {
    const a = pointAt(ringPts, ((q - 24) % L + L) % L), b = pointAt(ringPts, ((q + 24) % L + L) % L), c = pointAt(ringPts, ((q % L) + L) % L);
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return { x: c.x, y: c.y, tx: (dx / l) * dirSign, ty: (dy / l) * dirSign }; // tangent along this carriageway's travel
  };
  const side = (p, d) => ({ x: p.x - p.ty * d, y: p.y + p.tx * d }); // d px to the right of travel
  const C = at(s);
  const rx = -C.ty, ry = C.tx;
  // the avenue, pointing out to this carriageway's side; the ramp junction where it is D px out from the ring
  let dx = ave.dx, dy = ave.dy;
  if (dx * rx + dy * ry < 0) { dx = -dx; dy = -dy; }
  const cosA = dx * rx + dy * ry;
  if (cosA < 0.6) return null;                 // (crossing too skewed for a diamond)
  const k = o.D / cosA, T = { x: ave.x + dx * k, y: ave.y + dy * k };
  const RUN = 450, sg = off ? -1 : 1;           // (off: upstream of the avenue; on: downstream - along the ring that is
                                                // s - q for the clockwise carriageway, s + q for the other)
  // square-on: the last stretch runs across the avenue in the direction of travel. Where the avenue crosses the
  // ring at a slant that would pull the foot in under the bridge on one side, the run-out leans toward the ring's
  // own direction - never so far that it meets the avenue at less than 45 degrees.
  let ax = -dy, ay = dx;
  if (ax * C.tx + ay * C.ty < 0) { ax = -ax; ay = -ay; }
  let nx = ax, ny = ay, F = null;
  for (let w = 0; w <= 1.001; w += 0.125) {
    let mx = ax + (C.tx - ax) * w, my = ay + (C.ty - ay) * w;
    const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    if (Math.abs(mx * dx + my * dy) > 0.72) break;           // (sharper than 45 degrees to the avenue)
    const f = { x: T.x + sg * mx * RUN, y: T.y + sg * my * RUN }, out = (f.x - C.x) * rx + (f.y - C.y) * ry;
    if (out >= o.D * 0.8 && out <= o.D * 1.35) { nx = mx; ny = my; F = f; break; } // (clear of the bridge, inside the frontage road)
  }
  if (!F) return null;
  // along the deck: the taper (outer lane -> auxiliary lane) and the auxiliary lane itself
  const deck = [];
  const q0 = RAMP_REACH, q1 = RAMP_REACH - 350, q2 = RAMP_REACH - 650;
  for (let q = q0; q >= q2 - 0.1; q -= 25) {
    const u = q > q1 ? (q0 - q) / (q0 - q1) : 1, e = u * u * (3 - 2 * u);
    deck.push(side(at(s + sg * dirSign * q), o.lane + (o.aux - o.lane) * e));
  }
  const P2 = deck[deck.length - 1], t2 = at(s + sg * dirSign * q2);
  const span = Math.hypot(F.x - P2.x, F.y - P2.y);
  // the curve between them: leaving the deck along the travel direction, arriving square to the avenue
  const curve = cubic(P2, { x: P2.x - sg * t2.tx * span * 0.42, y: P2.y - sg * t2.ty * span * 0.42 }, { x: F.x + sg * nx * span * 0.42, y: F.y + sg * ny * span * 0.42 }, F, 24);
  // (built from the deck end outward; an off-ramp runs the other way)
  let pts = deck.concat(curve.slice(1)).concat([{ x: T.x, y: T.y }]);
  if (off) {
    // from the deck to the avenue: level along the deck, the descent, the level run-out
    const len = measureLen(pts), a = measureLen(deck), b = len - RUN;
    return { pts, z0: 1, z1: 0, zr: [a / len, b / len], foot: F, end: T };
  }
  pts = pts.reverse();
  const len = measureLen(pts), a = RUN, b = len - measureLen(deck);
  return { pts, z0: 0, z1: 1, zr: [a / len, b / len], foot: F, end: T };
}
const measureLen = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return l; };

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

// --------------------------------------------------------------------------------------------
// Breaking up a street grid so it reads like a real city instead of graph paper.
//
// A grid line runs the length of the city, crossing every street of the other direction. Each
// stretch of a plain street between two crossings is looked at on its own (a hash of where it is,
// so the same city comes out every time):
//  * north-south stretches are sometimes left out, so the blocks either side join into one long
//    block - room for a long run of storefronts along the avenue in front of it (never two side
//    by side, so blocks don't grow into giant squares);
//  * some stretches (either way) are narrowed to a back alley instead of a street;
//  * a long block usually gets an alley of its own: a dead-end service alley in from the street
//    behind the buildings, or a narrow lane right through between two groups of buildings.
// Avenues are never touched, nor anywhere protect(xTile, yTile) says to leave alone.
export const ALLEY = { drop: 0.62, alleyV: 0.2, alleyH: 0.24, serviceIn: 0.5, through: 0.38 };
export function breakGrid(lines, xs, ys, protect, salt = 0) {
  const T = (v) => v * TILE;
  const out = [];
  const isSt = (l) => l.kind === 'st';
  const verticalOf = (l) => Math.abs(l.pts[0].x - l.pts[l.pts.length - 1].x) < 1;
  const xsS = [...xs].sort((a, b) => a - b), ysS = [...ys].sort((a, b) => a - b);
  const h = (a, b, k) => hashXY(a, b, salt * 31 + k);
  // a north-south stretch at grid column ix, between grid rows iy and iy+1
  const dropV = (ix, iy, x, ya) => (ix + iy) % 2 === 0 && h(x, ya, 1) < ALLEY.drop;
  const alleyV = (x, ya) => h(x, ya, 1) >= ALLEY.drop && h(x, ya, 1) < ALLEY.drop + ALLEY.alleyV;
  // is there a street of the other direction crossing (c, s)? (a stretch is only reshaped between
  // two real crossings, so nothing is left hanging in mid-air)
  const spans = lines.filter((l) => l.pts.length >= 2).map((l) => {
    const xa = Math.min(...l.pts.map((p) => p.x)) / TILE, xb = Math.max(...l.pts.map((p) => p.x)) / TILE;
    const ya = Math.min(...l.pts.map((p) => p.y)) / TILE, yb = Math.max(...l.pts.map((p) => p.y)) / TILE;
    return { v: xb - xa < 0.05, xa, xb, ya, yb };
  });
  const crossedAt = (vert, c, s) => spans.some((q) => (vert ? !q.v && Math.abs(q.ya - s) < 0.05 && q.xa <= c + 0.5 && q.xb >= c - 0.5
    : q.v && Math.abs(q.xa - s) < 0.05 && q.ya <= c + 0.5 && q.yb >= c - 0.5));
  for (const l of lines) {
    if (!isSt(l) || l.pts.length < 2) { out.push(l); continue; }
    const vert = verticalOf(l);
    const horiz = !vert && Math.abs(l.pts[0].y - l.pts[l.pts.length - 1].y) < 1;
    if (!vert && !horiz) { out.push(l); continue; }
    const c = vert ? l.pts[0].x / TILE : l.pts[0].y / TILE;
    const a0 = Math.min(...l.pts.map((p) => (vert ? p.y : p.x))) / TILE, a1 = Math.max(...l.pts.map((p) => (vert ? p.y : p.x))) / TILE;
    const cross = (vert ? ysS : xsS).filter((v) => v > a0 + 1 && v < a1 - 1);
    const ix = (vert ? xsS : ysS).indexOf(c);
    const cuts = [a0, ...cross, a1];
    const pt = (v) => (vert ? { x: T(c), y: T(v) } : { x: T(v), y: T(c) });
    let run = null;
    const flush = () => { if (run) { out.push({ ...l, pts: [pt(run[0]), pt(run[1])] }); run = null; } };
    for (let k = 0; k + 1 < cuts.length; k++) {
      const s0 = cuts[k], s1 = cuts[k + 1];
      // reshaped only between two crossings, or the end stretch out to wherever the street stops
      // (dropping that leaves no stub; the street just ends at its last crossing)
      const endOk = (v, other) => crossedAt(vert, c, v) || ((v === a0 || v === a1) && crossedAt(vert, c, other));
      const inner = cuts.length > 2 && endOk(s0, s1) && endOk(s1, s0) && s1 - s0 >= 8;
      const mid = (s0 + s1) / 2;
      const safe = !protect(vert ? c : mid, vert ? mid : c);
      let what = 'st';
      if (inner && safe && ix >= 0) {
        const grid = vert ? ysS : xsS;
        const iy = grid.indexOf(s0) >= 0 ? grid.indexOf(s0) : grid.indexOf(s1) - 1;
        const both = crossedAt(vert, c, s0) && crossedAt(vert, c, s1); // an alley must join streets at both ends
        if (vert) what = dropV(ix, iy, c, s0) ? 'drop' : both && alleyV(c, s0) ? 'alley' : 'st';
        else what = both && h(s0, c, 2) < ALLEY.alleyH ? 'alley' : 'st';
      }
      if (what === 'st') { if (run) run[1] = s1; else run = [s0, s1]; continue; }
      flush();
      if (what === 'alley') { out.push({ pts: [pt(s0), pt(s1)], kind: 'alley', lvl: 0, name: 'Back Alley' }); continue; }
      // dropped: the long block gets an alley of its own, off-centre so the blocks stay unequal
      const r = h(c, s0, 3), side = h(c, s0, 4) < 0.5 ? -1 : 1, off = side * (9 + Math.floor(h(c, s0, 5) * 4));
      const ax = c + off;
      if (protect(ax, mid)) continue;
      if (r < ALLEY.serviceIn && crossedAt(true, ax, s0)) {
        const depth = (s1 - s0) * (0.5 + h(c, s0, 6) * 0.15);
        out.push({ pts: [{ x: T(ax), y: T(s0) }, { x: T(ax), y: T(s0 + depth) }], kind: 'alley', lvl: 0, name: 'Service Alley', culdesac: true }); // a dead end on purpose
      } else if (r < ALLEY.serviceIn + ALLEY.through && crossedAt(true, ax, s0) && crossedAt(true, ax, s1)) {
        out.push({ pts: [{ x: T(ax), y: T(s0) }, { x: T(ax), y: T(s1) }], kind: 'alley', lvl: 0, name: 'Back Alley' });
      }
    }
    flush();
  }
  return out;
}
function hashXY(x, y, seed) {
  let h = (Math.imul(Math.round(x * 4) | 0, 374761393) + Math.imul(Math.round(y * 4) | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  // full avalanche (murmur3 finaliser): neighbouring grid crossings get unrelated values
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
