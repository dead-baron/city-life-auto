// World v3 (docs/WORLD-V3.md 8.14, H35): Northshore's beach towns - district 54 (Northshore Beaches), the gulf's north
// shore either side of today's Northshore between the Coast Highway and the beach (part 7: "Northshore ... runs on along
// the coast as beach towns"; the owner, 12:50: "less dense"). Generator-only: shared/world3-world.js calls each once.
// - beachStreets (its `lines` hook, after the skeleton's roads): a loose grid of streets on the beach towns' land -
//   streets parallel to the Shore Road (the beachfront road) every ROW tiles inland, cross streets every COL tiles from
//   the Shore Road up; kept clear of the highways (the Coast Highway's room), the main line's bed and Northshore's own
//   blocks; every CROSS-th cross street goes over the main line (a gated level crossing), the rest stop short of it.
//   Their ends reach the arterials and Northshore's streets they come near (a junction), or stay dead ends.
// - beachFront (its `rails` hook, after the roads are drawn, before the blocks): the promenade (a paved strip on the
//   beach's side of the Shore Road), car parks on the Shore Road's land side with steps down to the sand opposite, and
//   the lifeguard towers on the sand (m.lifeguards: drawn by the renderers) - the rest of the land between the streets
//   is the generator's blocks, in the beach style (beach houses, small apartment blocks, cafes, bars, a hotel).
import { TILE, T } from './constants.js';
import { ARTERIALS, MAIN_LINE } from './world3-skeleton.js';
import { TERRAIN3 } from './world3-land.js';

export const BEACH_D = 54;
const TOWN = new Set([31, 32, 34]);   // (Northshore's own: today's picture)
const ROW = 46;        // tiles between the streets parallel to the shore (less dense than the city's 24-30)
const COL = 76;        // tiles between the cross streets
const CROSS = 3;       // every third cross street crosses the main line
const RAIL_CLEAR = 18; // tiles either side of the main line's polyline (the double track's bed and its platforms)
const TOWN_CLEAR = 5;  // tiles off Northshore's own blocks
const REACH = 14;      // tiles a street's end is carried on to meet a road
// tiles either side of a road's middle that a new street keeps clear of (its pavement and a lot's depth), by kind
const CLEAR = { hwy: 26, ramp: 16, ave: 12, blvd: 12, art: 11, front: 10, st: 9, drive: 9, minor: 8, rural: 8, dirt: 6, alley: 5 };
const ON = { hwy: 0, ramp: 0, ave: 4.5, blvd: 4.5, art: 3.5, front: 3, st: 3, drive: 2.5, minor: 2, rural: 2, dirt: 2, alley: 1.5 };
const ROW_NAMES = ['Surf Street', 'Dune Street', 'Seagrass Street', 'Breakers Street', 'Gull Street', 'Sea Breeze Street'];
const COL_NAMES = ['Pier Avenue', 'Coral Street', 'Driftwood Lane', 'Shell Street', 'Tide Street', 'Kelp Street', 'Sand Dollar Lane', 'Anchor Street', 'Starfish Lane', 'Boardwalk Street', 'Conch Street', 'Lantern Lane', 'Harbor View Street', 'Marlin Street', 'Pelican Street', 'Sunset Street', 'Cove Street', 'Riptide Lane', 'Seashell Street', 'Bay Street', 'Clam Street', 'Ocean View Street', 'Saltwater Lane', 'Wave Street', 'Sailfish Street', 'Beacon Street', 'Jetty Street'];

// the Shore Road's middle at column x (tiles): the skeleton's polyline
const SHORE = ARTERIALS.find((A) => A.name === 'Shore Road').pts;
export function shoreY(x) {
  if (x <= SHORE[0][0]) return SHORE[0][1];
  for (let k = 1; k < SHORE.length; k++) {
    const [x0, y0] = SHORE[k - 1], [x1, y1] = SHORE[k];
    if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return SHORE[SHORE.length - 1][1];
}

// the box of the beach towns' land (tiles), from the land layer
export function beachBox(L, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0; i < W * H; i++) if (L.land[i] && L.dist[i] === BEACH_D) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

// lay the beach towns' streets into the build's lines (px). L: the land layer.
export function beachStreets(lines, m, L) {
  const W = m.w, H = m.h, box = beachBox(L, W, H), out = { rows: 0, cols: 0, crossing: 0, joined: 0, length: 0, names: [] };
  if (!box) return out;
  const first = lines.length;   // (this call's streets: lines.slice(first) - see 4.)
  const P = 30, bx = box[0] - P, by = box[1] - P, BW = box[2] - box[0] + 1 + 2 * P, BH = box[3] - box[1] + 1 + 2 * P;
  const inB = (x, y) => x >= bx && y >= by && x < bx + BW && y < by + BH;
  const near = new Uint8Array(BW * BH), on = new Uint8Array(BW * BH), rail = new Uint8Array(BW * BH);
  // the roads already laid: kept clear (near), and the road itself (on: a street's end may join it; not a highway's)
  const disc = (grid, cx, cy, r) => {
    const r2 = r * r;
    for (let y = Math.max(by, Math.floor(cy - r)); y <= Math.min(by + BH - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(bx, Math.floor(cx - r)); x <= Math.min(bx + BW - 1, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) grid[(y - by) * BW + x - bx] = 1;
    }
  };
  const stampLine = (pts, r, grid) => {
    for (let j = 1; j < pts.length; j++) {
      const ax = pts[j - 1][0], ay = pts[j - 1][1], cx = pts[j][0], cy = pts[j][1], n = Math.max(1, Math.ceil(Math.hypot(cx - ax, cy - ay) * 1.5));
      if (Math.max(ax, cx) < bx - r || Math.min(ax, cx) > bx + BW + r || Math.max(ay, cy) < by - r || Math.min(ay, cy) > by + BH + r) continue;
      for (let t = 0; t <= n; t++) { const x = ax + (cx - ax) * t / n, y = ay + (cy - ay) * t / n; if (inB(Math.floor(x), Math.floor(y)) || inB(Math.floor(x - r), Math.floor(y - r)) || inB(Math.floor(x + r), Math.floor(y + r))) disc(grid, x, y, r); }
    }
  };
  for (const l of lines) {
    const lv = l.lvl ?? 0, pts = l.pts.map((p) => [p.x / TILE, p.y / TILE]);
    stampLine(pts, CLEAR[l.kind] ?? 9, near);
    if (lv === 0 && ON[l.kind] && !l.foot) stampLine(pts, ON[l.kind], on);
  }
  for (const S of MAIN_LINE) stampLine(S.pts, RAIL_CLEAR, rail);
  // the land a street may run on: the beach towns' (not their beach), off Northshore's own blocks
  const town = new Uint8Array(BW * BH);
  for (let y = by; y < by + BH; y++) for (let x = bx; x < bx + BW; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (L.land[y * W + x] && TOWN.has(L.dist[y * W + x])) disc(town, x + 0.5, y + 0.5, TOWN_CLEAR);
  }
  const base = (x, y) => {
    if (!inB(x, y) || x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = y * W + x, j = (y - by) * BW + x - bx;
    return !!(m.land[i] && L.land[i] && L.dist[i] === BEACH_D && L.terrain[i] !== TERRAIN3.SAND && !m.lake[i] && !near[j] && !town[j]);
  };
  const okAt = (x, y, overRail) => base(x, y) && (overRail || !rail[(y - by) * BW + x - bx]);
  const onAt = (x, y) => inB(x, y) && !!on[(y - by) * BW + x - bx];
  const emit = (pts, name, kind = 'st') => {
    const q = pts.map(([x, y]) => ({ x: x * TILE, y: y * TILE }));
    lines.push({ pts: q, kind, lvl: 0, name, beach: true });
    let len = 0; for (let j = 1; j < pts.length; j++) len += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
    out.length += len;
    if (!out.names.includes(name)) out.names.push(name);
  };
  // carry a run's end on (dir: the step) up to REACH tiles to the road it meets; null if none
  const carry = (x, y, dx, dy) => { for (let k = 1; k <= REACH; k++) { const tx = x + dx * k, ty = y + dy * k; if (onAt(Math.round(tx), Math.round(ty))) { out.joined++; return [tx, ty]; } } return null; };

  // 1. the streets parallel to the shore: ROW, 2 ROW, ... tiles inland of the Shore Road
  for (let k = 1; k <= 7; k++) {
    let run = [];
    const flush = () => {
      if (run.length >= 24) {
        const pts = [];
        for (let j = 0; j < run.length; j += 6) pts.push(run[j]);
        if (pts[pts.length - 1] !== run[run.length - 1]) pts.push(run[run.length - 1]);
        const a = carry(run[0][0], run[0][1], -1, 0), b = carry(run[run.length - 1][0], run[run.length - 1][1], 1, 0);
        if (a) pts.unshift([a[0], shoreY(a[0]) - k * ROW]);
        if (b) pts.push([b[0], shoreY(b[0]) - k * ROW]);
        emit(pts.map(([x, y]) => [x + 0.5, y + 0.5]), ROW_NAMES[(k - 1) % ROW_NAMES.length]);
        out.rows++;
      }
      run = [];
    };
    for (let x = box[0]; x <= box[2]; x++) {
      const y = Math.round(shoreY(x) - k * ROW);
      if (okAt(x, y, false) && okAt(x, y - 4, false) && okAt(x, y + 4, false)) run.push([x, y]); else flush();
    }
    flush();
  }
  // 2. the cross streets: from the Shore Road up, every COL tiles (each CROSS-th over the main line)
  let c = 0;
  for (let x = box[0] + (COL >> 1); x <= box[2]; x += COL, c++) {
    const over = c % CROSS === 1, y0 = shoreY(x);
    // from the Shore Road's middle up to where the land stops being the beach towns' (or the line's bed, or a road)
    let y = Math.floor(y0) - 1, n = 0;
    while (y > box[1] && !okAt(x, y, over) && n < REACH) { y--; n++; }   // (across the Shore Road's pavement)
    if (!okAt(x, y, over) || !okAt(x - 3, y, over) || !okAt(x + 3, y, over)) continue;
    const ys = y;
    while (y > box[1] && okAt(x, y - 1, over) && okAt(x - 3, y - 1, over) && okAt(x + 3, y - 1, over)) y--;
    if (ys - y < 16) continue;
    const pts = [[x + 0.5, y0]];
    for (let yy = ys - 8; yy > y; yy -= 8) pts.push([x + 0.5, yy + 0.5]);
    pts.push([x + 0.5, y + 0.5]);
    const top = carry(x, y, 0, -1);
    if (top) pts.push([x + 0.5, top[1] + 0.5]);
    emit(pts, COL_NAMES[c % COL_NAMES.length]);
    out.cols++;
    if (over) out.crossing++;
  }
  // 3. north of the main line: a cross street that stops at its bed carries on beyond it (from the line's room up), so
  // the streets along the shore there are cut into blocks too
  c = 0;
  const railAt = (x, y) => inB(x, y) && !!rail[(y - by) * BW + x - bx];
  for (let x = box[0] + (COL >> 1); x <= box[2]; x += COL, c++) {
    if (c % CROSS !== 0) continue;   // (every third: less dense up there - the owner's "less dense")
    let y = Math.floor(shoreY(x)) - 1;
    while (y > box[1] && !railAt(x, y)) y--;   // (up to the line's room)
    if (y <= box[1]) continue;
    while (y > box[1] && railAt(x, y)) y--;    // (across it)
    let n = 0;
    while (y > box[1] && !(okAt(x, y, false) && okAt(x - 3, y, false) && okAt(x + 3, y, false)) && n < REACH) { y--; n++; }
    if (n >= REACH) continue;
    const ys = y;
    while (y > box[1] && okAt(x, y - 1, false) && okAt(x - 3, y - 1, false) && okAt(x + 3, y - 1, false)) y--;
    if (ys - y < 16) continue;
    const pts = [];
    for (let yy = ys; yy > y; yy -= 8) pts.push([x + 0.5, yy + 0.5]);
    pts.push([x + 0.5, y + 0.5]);
    const top = carry(x, y, 0, -1);
    if (top) pts.push([x + 0.5, top[1] + 0.5]);
    emit(pts, COL_NAMES[c % COL_NAMES.length]);
    out.cols++;
    out.north = (out.north || 0) + 1;
  }
  // 4. no street left on its own: a short row whose ends reached no road and that no cross street came to cut (and so
  // anything only it met) would be a loose piece of road off the network - left out, until every one left meets another
  // road or ends on one (the merged world build of 8.13 + 8.14 had two: Surf Street and Gull Street, 25 tiles each)
  out.dropped = dropLoose(lines, first);
  out.length = Math.round(out.length);
  m.beachTowns = { box, ...out };
  return out;
}

// the beach streets (lines from `first` on) that touch no other road - no crossing, and neither end within 2 tiles of
// one - taken out of `lines`, again while taking one out leaves another on its own; -> how many
function dropLoose(lines, first) {
  const NEAR = 2 * TILE, segX = (a, b, c, d) => {
    const d1 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x), d2 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
    const d3 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x), d4 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
    return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
  };
  const near = (p, q) => { for (let k = 0; k + 1 < q.length; k++) if (segDist(p.x, p.y, [q[k].x, q[k].y], [q[k + 1].x, q[k + 1].y]) < NEAR) return true; return false; };
  const boxes = new Map(), boxOf = (L) => {
    let bx = boxes.get(L);
    if (!bx) { bx = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of L.pts) { if (p.x < bx[0]) bx[0] = p.x; if (p.y < bx[1]) bx[1] = p.y; if (p.x > bx[2]) bx[2] = p.x; if (p.y > bx[3]) bx[3] = p.y; } boxes.set(L, bx); }
    return bx;
  };
  const touches = (A, B) => {
    const p = boxOf(A), q = boxOf(B);
    if (p[0] > q[2] + NEAR || q[0] > p[2] + NEAR || p[1] > q[3] + NEAR || q[1] > p[3] + NEAR) return false;
    const a = A.pts, b = B.pts;
    if (near(a[0], b) || near(a[a.length - 1], b) || near(b[0], a) || near(b[b.length - 1], a)) return true;
    for (let i = 0; i + 1 < a.length; i++) for (let j = 0; j + 1 < b.length; j++) if (segX(a[i], a[i + 1], b[j], b[j + 1])) return true;
    return false;
  };
  let dropped = 0;
  for (let again = true; again;) {
    again = false;
    for (let i = lines.length - 1; i >= first; i--) {
      const A = lines[i];
      let ok = false;
      for (let j = 0; j < lines.length && !ok; j++) if (j !== i) ok = touches(A, lines[j]);
      if (!ok) { lines.splice(i, 1); dropped++; again = true; }
    }
  }
  return dropped;
}

const segDist = (x, y, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; let t = ((x - ax) * dx + (y - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(ax + dx * t - x, ay + dy * t - y); };

// the promenade, the car parks with their steps down to the sand and the lifeguard towers (before the blocks)
export function beachFront(m, L) {
  const W = m.w, box = m.beachTowns?.box, out = { promenade: 0, parks: [], towers: [] };
  if (!box) return out;
  const is54 = (x, y) => x >= 0 && y >= 0 && x < W && y < m.h && m.land[y * W + x] && m.dist[y * W + x] === BEACH_D;
  const tile = (x, y) => m.tiles[y * W + x];
  // the promenade: 3 tiles of paving on the sand along the Shore Road's sea side
  const prom = new Int32Array(box[2] - box[0] + 1).fill(-1);
  for (let x = box[0]; x <= box[2]; x++) {
    let y = Math.round(shoreY(x));
    let n = 0;
    while (n < 12 && is54(x, y) && (tile(x, y) === T.ROAD || tile(x, y) === T.SIDEWALK)) { y++; n++; }
    if (n === 0 || n >= 12) continue;   // (no road here: the Shore Road's bridge, a junction)
    let k = 0;
    for (; k < 3 && is54(x, y + k) && tile(x, y + k) === T.SAND; k++) { m.tiles[(y + k) * W + x] = T.PLAZA; m.reserve[(y + k) * W + x] |= 4; out.promenade++; }
    if (k === 3) prom[x - box[0]] = y + 3;   // (the sand starts here)
  }
  // car parks on the land side of the Shore Road between the cross streets, steps down to the sand opposite them, and a
  // lifeguard tower on the sand in front of every other one
  const PW = 14, PH = 8;
  // (the land side of the Shore Road at column x: the first tile north of its pavement, or -1)
  const landSide = (x) => {
    let y = Math.round(shoreY(x)) + 5, n = 0;
    while (n < 12 && tile(x, y) !== T.ROAD) { y--; n++; }
    if (n >= 12) return -1;
    n = 0;
    while (n < 14 && (tile(x, y) === T.ROAD || tile(x, y) === T.SIDEWALK)) { y--; n++; }
    return n >= 14 ? -1 : y;
  };
  for (let x0 = box[0] + 70; x0 + PW < box[2] - 10; x0 += 150) {
    let x = -1, y = -1, ty = -1;
    for (const dx of [0, -14, 14, -28, 28, -42, 42]) {
      const xx0 = x0 + dx, yl = landSide(xx0 + (PW >> 1));
      if (yl < 0) continue;
      const ty0 = yl - PH + 1;
      let ok = !MAIN_LINE.some((S) => S.pts.some(([px, py], j) => j && segDist(xx0 + PW / 2, ty0 + PH / 2, S.pts[j - 1], [px, py]) < 26));
      for (let yy = ty0; yy <= yl && ok; yy++) for (let xx = xx0; xx < xx0 + PW; xx++) { const i = yy * W + xx; if (!is54(xx, yy) || m.tiles[i] !== T.GRASS) { ok = false; break; } }
      if (ok) { x = xx0; y = yl; ty = ty0; break; }
    }
    if (x < 0) continue;
    for (let yy = ty; yy <= y; yy++) for (let xx = x; xx < x + PW; xx++) { const i = yy * W + xx; m.tiles[i] = T.LOT; m.reserve[i] |= 16; }
    const park = { x: x, y: ty, w: PW, h: PH };
    out.parks.push(park);
    // the steps: from the promenade down onto the sand (a paved flight, 2 tiles wide, 3 long)
    const sx = x + (PW >> 1) - 1, s0 = prom[sx - box[0]];
    if (s0 > 0) {
      for (let yy = s0; yy < s0 + 3; yy++) for (let xx = sx; xx < sx + 2; xx++) if (is54(xx, yy) && tile(xx, yy) === T.SAND) { m.tiles[yy * W + xx] = T.PLAZA; m.reserve[yy * W + xx] |= 4; }
      park.steps = { x: (sx + 1) * TILE, y: (s0 + 1.5) * TILE };
    }
  }
  // the lifeguard towers: every 120 tiles or so along the beach, two thirds of the way down the sand to the water
  for (let x = box[0] + 40; x < box[2] - 20; x += 120) {
    let best = null;
    for (let dx = 0; dx < 40 && !best; dx += 4) {
      const s0 = prom[x + dx - box[0]];
      if (!(s0 > 0)) continue;
      let wy = s0;
      while (wy < s0 + 60 && is54(x + dx, wy) && tile(x + dx, wy) === T.SAND) wy++;
      const depth = wy - s0;
      if (depth >= 10 && tile(x + dx, wy) !== T.SAND) best = { x: (x + dx + 0.5) * TILE, y: Math.round((s0 + depth * 0.62) * TILE), a: Math.PI / 2 };
    }
    if (best) { out.towers.push(best); m.addSolidProp(best.x, best.y, 18); }   // (its stilts and ramp block the way)
  }
  m.lifeguards = out.towers;
  m.beachTowns.front = { promenade: out.promenade, parks: out.parks.length, towers: out.towers.length };
  m.beachTowns.parks = out.parks;
  return out;
}

// (at the end of the build) nothing the dressing put on the promenade, the car parks or the steps: the paved tiles of
// the beach towns' front (PLAZA, LOT) that beachFront reserved
export function clearBeachFront(m, removeProps) {
  if (!m.beachTowns || !removeProps) return;
  const W = m.w;
  removeProps(m, (x, y) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), i = ty * W + tx;
    if (tx < 0 || ty < 0 || tx >= W || ty >= m.h || m.dist[i] !== BEACH_D) return false;
    const t = m.tiles[i];
    return (t === T.PLAZA && (m.reserve[i] & 4) && Math.abs(ty - shoreY(tx)) < 16) || (t === T.LOT && (m.reserve[i] & 16));
  });
}
