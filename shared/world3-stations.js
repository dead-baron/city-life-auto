// World v3b: the main line's stations and level crossings against the roads (the owner's playtest, 2026-10-15):
//   "Train stations should have streets and parking lots connected to them, some places don't seem to have that setup
//   yet. The street and parking lot should be setup so that cars can make a turn out of the parking lot and back out,
//   instead sometimes in the world they would just form traffic jams leading up to the parking lots of train stations."
//   "train tracks should cross streets almost perpendicular so the crossing guard cross the street instead of just
//   angled on the street."
// Two passes over the build's road lines (px, the generator's form), at the end of shared/world3-world.js' `lines` hook
// (every road is laid by then; the network is built from them next), and one over the tiles from the `rails` hook:
// - squareCrossings3(lines, m): every road that meets the main line at grade (where its track is up: not in a tunnel,
//   below the city or a town - shared/world3-rail.js trackOf) at less than SQUARE degrees is bent where it crosses: it
//   leaves its line, crosses both tracks square on a straight stretch, and comes back to its line (a Z of round
//   corners), checked to stay on dry land and clear of every other road; a crossing it can't square is listed.
// - planStations3(lines, m): every main-line station gets a street to its front door and a car park with a way through
//   it - a loop, never a dead end. Two ways, whichever fits (each side of the line tried; the cheapest wins):
//   * 'front': a station road along the station's front (FRONT_C tiles off the line, beyond the house), each of its
//     ends carried straight on to the nearest road (along the line, or away from it); the car park behind it, between
//     its two arms when they go away from the line. A road's stub ending between the line and the station road is cut
//     back to it (it meets the station road: a junction, not a dead end by the platform).
//   * 'road': a road already runs along the station's front (between ROAD_C tiles off the line): the house faces it,
//     and the car park is across it, a loop off it (two arms out from it and a lane along the far side).
//   The house's spot (its hub point and facing) is planned with it: shared/world3-passes.js buildRailHubs puts it there.
//   m.world3.stations: [{ name, how, side, house: { x, y, a }, lot: { x, y, ux, uy, a0, a1, c0, c1 }, roads, ends }].
// - stampStations3(m): the car parks paved (LOT) and kept clear of the blocks (reserve 16), their rows of spaces, and
//   each station's forecourt (PLAZA) between its house and its street.
// World v3 only (the generator's v3 hooks): today's world is untouched. Deterministic: + - * / Math.sqrt / hypot /
// atan2 / cos / sin inside the generator's withDeterministicMath (nothing computed at load).
import { TILE, T } from './constants.js';
import { measure, pointAt, rounded, segX } from './geom.js';
import { ROAD_KINDS, sidewalkPx } from './roads.js';
import { DISTRICTS } from './mapcore.js';
import { STATIONS } from './world3-skeleton.js';
import { mainLineLoops } from './world3-rail.js';
import { CITY3 } from './world3-city.js';

export const SQUARE = 80;        // degrees: a crossing at less than this is squared (the aim: >= 75 everywhere)
const FRONT_C = 13;              // tiles from the line's centre to the station road's (house: 5 - 8.5, its forecourt)
const FRONT_A = 12;              // tiles either way along the line: the station road's half length
const ROAD_C = [12.5, 24];       // a road this far off the line (tiles), along it: the station's front street
const HUB_C = 6.5;               // tiles from the line's centre to the hub point (the house's middle 18 px further)
const LOT_D = 7;                 // tiles: the car park's depth
const REACH = 60;                // tiles: how far a station road's arm looks for a road to meet
const STATION_KIND = 'minor';    // the station roads (a local road with pavements, no lights)
const hwOf = (kind) => ((ROAD_KINDS[kind] || ROAD_KINDS.st).w * TILE) / 2;
const MEET = new Set(['ave', 'blvd', 'art', 'st', 'minor', 'drive', 'rural', 'front']);   // what a station road may meet

// ---- helpers ------------------------------------------------------------------------------------------------------
// the main line's tracks (both ways, px) at grade: segments in a grid
function trackGrid(loops) {
  const C = 256, g = new Map(), key = (cx, cy) => (cx + 4096) * 16384 + cy + 4096;
  const segs = [];
  for (const l of loops) {
    const P = l.pts, n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      if (a.under || b.under || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 64) continue;
      const k = segs.length;
      segs.push([a, b]);
      for (let cy = Math.floor(Math.min(a.y, b.y) / C); cy <= Math.floor(Math.max(a.y, b.y) / C); cy++)
        for (let cx = Math.floor(Math.min(a.x, b.x) / C); cx <= Math.floor(Math.max(a.x, b.x) / C); cx++) { const kk = key(cx, cy); let l2 = g.get(kk); if (!l2) g.set(kk, (l2 = [])); l2.push(k); }
    }
  }
  // the at-grade track segments near a box
  const near = (x0, y0, x1, y1) => {
    const out = new Set();
    for (let cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++) for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) for (const k of g.get(key(cx, cy)) || []) out.add(k);
    return [...out].map((k) => segs[k]);
  };
  // the distance from a point to the nearest at-grade track (px; Infinity past r)
  const dist = (x, y, r = 640) => {
    let d = Infinity;
    for (const [a, b] of near(x - r, y - r, x + r, y + r)) d = Math.min(d, segDist(x, y, a, b));
    return d;
  };
  return { near, dist };
}
function segDist(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}
// the lines' segments in a grid (rebuilt when the lines change): near(x0, y0, x1, y1) -> [[line, k]]
function lineGrid(lines, ok) {
  const C = 256, g = new Map(), key = (cx, cy) => (cx + 4096) * 16384 + cy + 4096;
  lines.forEach((l, li) => {
    if (!ok(l)) return;
    for (let k = 0; k + 1 < l.pts.length; k++) {
      const a = l.pts[k], b = l.pts[k + 1];
      for (let cy = Math.floor(Math.min(a.y, b.y) / C); cy <= Math.floor(Math.max(a.y, b.y) / C); cy++)
        for (let cx = Math.floor(Math.min(a.x, b.x) / C); cx <= Math.floor(Math.max(a.x, b.x) / C); cx++) { const kk = key(cx, cy); let l2 = g.get(kk); if (!l2) g.set(kk, (l2 = [])); l2.push(li * 65536 + k); }
    }
  });
  return (x0, y0, x1, y1) => {
    const out = new Set();
    for (let cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++) for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) for (const v of g.get(key(cx, cy)) || []) out.add(v);
    return [...out].map((v) => [Math.floor(v / 65536), v % 65536]);
  };
}
const ground = (l) => l.lvl === 0 && l.pts.length >= 2;
const angDeg = (ux, uy, vx, vy) => Math.atan2(Math.abs(ux * vy - uy * vx), Math.abs(ux * vx + uy * vy)) * 180 / Math.PI;   // (0: parallel, 90: square)
// dry land under a point (px), and the pavement a road of `kind` has there
const landAt = (m, x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && !!m.land[ty * m.w + tx] && !(m.river && m.river[ty * m.w + tx]); };
const walkAt = (m, kind, x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); const d = tx >= 0 && ty >= 0 && tx < m.w && ty < m.h ? m.dist[ty * m.w + tx] : 0; return sidewalkPx(kind, (DISTRICTS[d] || DISTRICTS[0]).style); };
// the places a road may not run through: the city's keeps (the park, the stadium, the airport's field ...)
const KEEPS = [];
for (const c of CITY3) for (const k of c.keep || []) KEEPS.push(k);
const inKeep = (x, y) => { const tx = x / TILE, ty = y / TILE; return KEEPS.some(([x0, y0, x1, y1]) => tx > x0 && ty > y0 && tx < x1 && ty < y1); };

// ---- 1. the level crossings squared ---------------------------------------------------------------------------------
// Where line l crosses the at-grade tracks: [{ s (along l, px), x, y, tx, ty (the track's direction), rx, ry (l's) }],
// the double track's two crossings of one road as one (their middle).
function crossingsOf(l, tracks) {
  const hits = [];
  for (let k = 0; k + 1 < l.pts.length; k++) {
    const a = l.pts[k], b = l.pts[k + 1];
    for (const [c, d] of tracks.near(Math.min(a.x, b.x) - 8, Math.min(a.y, b.y) - 8, Math.max(a.x, b.x) + 8, Math.max(a.y, b.y) + 8)) {
      const x = segX(a, b, c, d);
      if (!x) continue;
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, M = Math.hypot(d.x - c.x, d.y - c.y) || 1;
      hits.push({ s: a.s + L * x.t, x: x.x, y: x.y, tx: (d.x - c.x) / M, ty: (d.y - c.y) / M, rx: (b.x - a.x) / L, ry: (b.y - a.y) / L });
    }
  }
  hits.sort((p, q) => p.s - q.s);
  const out = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (last && h.s - last.s1 < 24 * TILE) { last.n++; last.s1 = h.s; last.xs.push(h); continue; }   // (at a slant the two tracks are far apart along the road)
    out.push({ s0: h.s, s1: h.s, n: 1, xs: [h] });
  }
  return out.map((g) => {
    const n = g.xs.length, x = g.xs.reduce((a, h) => a + h.x, 0) / n, y = g.xs.reduce((a, h) => a + h.y, 0) / n;
    let tx = g.xs.reduce((a, h) => a + h.tx * Math.sign(h.tx * g.xs[0].tx + h.ty * g.xs[0].ty || 1), 0), ty = g.xs.reduce((a, h) => a + h.ty * Math.sign(h.tx * g.xs[0].tx + h.ty * g.xs[0].ty || 1), 0);
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const h0 = g.xs[0];
    return { s: (g.s0 + g.s1) / 2, x, y, tx, ty, rx: h0.rx, ry: h0.ry, angle: Math.min(...g.xs.map((h) => angDeg(h.rx, h.ry, h.tx, h.ty))) };
  });
}

// the stretch of l from arc length s0 to s1 (px), as points
function stretch(pts, s0, s1) {
  const out = [pointAt(pts, s0)];
  for (const p of pts) if (p.s > s0 && p.s < s1) out.push(p);
  out.push(pointAt(pts, s1));
  return out.map((p) => ({ x: p.x, y: p.y }));
}

// Is the new stretch `pts` of line li (kind) fine: dry, off the keeps, clear of every other road (and of l's own other
// parts), crossing the tracks only square on, nowhere near a platform? -> null | why not
function stretchOk(m, lines, grid, tracks, li, pts, kind, X, opt = {}) {
  const hw = hwOf(kind), tooClose = (o) => hw + hwOf(o.kind) + 40;
  measure(pts);
  const L = pts[pts.length - 1].s;
  for (let s = 0; s <= L; s += 8) {
    const p = pointAt(pts, s), nx = -p.ty, ny = p.tx;
    for (const o of [0, -hw, hw]) if (!landAt(m, p.x + nx * o, p.y + ny * o)) return 'water';
    if (inKeep(p.x, p.y)) return 'keep';
  }
  // other roads: none within reach of it (the line's own points outside the stretch are left out by the caller: `own`)
  for (let s = 0; s <= L; s += 16) {
    const p = pointAt(pts, s);
    for (const [oj, k] of grid(p.x - 400, p.y - 400, p.x + 400, p.y + 400)) {
      const o = lines[oj];
      if (oj === li && !opt.selfToo) continue;
      if (opt.skip && opt.skip.has(oj)) continue;
      const a = o.pts[k], b = o.pts[k + 1];
      if (segDist(p.x, p.y, a, b) < tooClose(o)) return `near ${o.name || o.kind}`;
    }
  }
  // the tracks: met only on the straight across (within `cross` px of X)
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    for (const [c, d] of tracks.near(Math.min(a.x, b.x) - 8, Math.min(a.y, b.y) - 8, Math.max(a.x, b.x) + 8, Math.max(a.y, b.y) + 8)) {
      const x = segX(a, b, c, d);
      if (!x) continue;
      if (!X || Math.hypot(x.x - X.x, x.y - X.y) > (opt.cross || 0)) return 'tracks';
    }
  }
  for (let s = 0; s <= L; s += 32) { const p = pointAt(pts, s); if (!X || Math.hypot(p.x - X.x, p.y - X.y) > (opt.cross || 0) + 8) { if (tracks.dist(p.x, p.y, 200) < hw + 80) return 'by the tracks'; } }
  return null;
}

// does another ground line come within r px of line li's stretch from s0 to s1 (px along it)?
function attached(lines, grid, li, pts, s0, s1, r) {
  for (let s = s0; s <= s1; s += 16) {
    const p = pointAt(pts, s);
    for (const [oj, k] of grid(p.x - r - 8, p.y - r - 8, p.x + r + 8, p.y + r + 8)) {
      if (oj === li) continue;
      const o = lines[oj];
      if (segDist(p.x, p.y, o.pts[k], o.pts[k + 1]) < r) return true;
    }
  }
  return false;
}
// Square up one crossing of line li: its stretch round the crossing replaced by a Z of round corners - off its line,
// straight across both tracks along the tracks' normal, back onto its line. -> the new points | null
function squareOne(m, lines, grid, tracks, li, c, stations) {
  const l = lines[li], pts = l.pts, Ls = pts[pts.length - 1].s;
  let nx = -c.ty, ny = c.tx;
  if (nx * c.rx + ny * c.ry < 0) { nx = -nx; ny = -ny; }
  // (not where the road meets another at the crossing, or the stretch would cut it off: every other line's end or
  // crossing within the replaced stretch rules that size out - checked by stretchOk's clearance)
  const tries = [];
  for (const H of [7, 9, 11]) for (const d of [16, 22, 28, 36, 46]) for (const dt of [0, -4, 4, -8, 8]) tries.push([H, d, dt]);
  let best = null;
  for (const [H, d, dt] of tries) {
    const lead = 10;
    const s0 = c.s - (d + lead) * TILE, s1 = c.s + (d + lead) * TILE;
    if (s0 < 0 || s1 > Ls) continue;
    const X = { x: c.x + c.tx * dt * TILE, y: c.y + c.ty * dt * TILE };
    const Qa = pointAt(pts, s0), Q1 = pointAt(pts, c.s - d * TILE), Q2 = pointAt(pts, c.s + d * TILE), Qb = pointAt(pts, s1);
    const C2 = { x: X.x - nx * H * TILE, y: X.y - ny * H * TILE }, C3 = { x: X.x + nx * H * TILE, y: X.y + ny * H * TILE };
    // the approach must come at C2 from behind it (and leave C3 ahead): no doubling back
    const fw = (p, q) => (q.x - p.x) * nx + (q.y - p.y) * ny;
    if (fw(Q1, C2) < -2 * TILE || fw(C3, Q2) < -2 * TILE) continue;
    const R = Math.min(H * 0.98, 10) * TILE;
    const corners = [Qa, Q1, C2, C3, Q2, Qb].map((p) => ({ x: p.x, y: p.y }));
    // the round corners' radii as laid (rounded() cuts a corner's radius to 0.49 of its shorter leg): none tight
    let tight = false;
    for (let i = 1; i < corners.length - 1; i++) {
      const p0 = corners[i - 1], p1 = corners[i], p2 = corners[i + 1];
      const l0 = Math.hypot(p1.x - p0.x, p1.y - p0.y), l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const ux = (p1.x - p0.x) / l0, uy = (p1.y - p0.y) / l0, vx = (p2.x - p1.x) / l2, vy = (p2.y - p1.y) / l2;
      const turn = Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy);
      if (turn < 0.2) continue;
      const rr = Math.min(R, 0.49 * l0, 0.49 * l2);
      // (the arc's radius from its tangent length rr and the turn)
      const rad = rr / Math.tan(turn / 2);
      if (rad < 6 * TILE || turn > 1.75) tight = true;
    }
    if (tight) continue;
    // (no other road joins or crosses the stretch that goes: it would be cut off)
    if (attached(lines, grid, li, pts, s0 + 4 * TILE, s1 - 4 * TILE, hwOf(l.kind) + 8)) continue;
    const mid = rounded(corners, R, false, 10);
    const why = stretchOk(m, lines, grid, tracks, li, mid, l.kind, X, { cross: H * TILE });
    if (why) continue;
    // nowhere near a station's platforms
    if (stations.some(([sx, sy]) => mid.some((p) => Math.hypot(p.x - sx, p.y - sy) < 14 * TILE))) continue;
    const added = mid.reduce((a, p, i) => a + (i ? Math.hypot(p.x - mid[i - 1].x, p.y - mid[i - 1].y) : 0), 0) - (s1 - s0);
    const cost = added + Math.abs(dt) * TILE * 2;
    if (!best || cost < best.cost) best = { cost, s0, s1, mid, H, d, dt };
  }
  if (!best) return null;
  const out = [...pts.filter((p) => p.s < best.s0).map((p) => ({ x: p.x, y: p.y })), ...best.mid, ...pts.filter((p) => p.s > best.s1).map((p) => ({ x: p.x, y: p.y }))];
  measure(out);
  return { pts: out, H: best.H, d: best.d, dt: best.dt };
}

export function squareCrossings3(lines, m, loops = mainLineLoops()) {
  const tracks = trackGrid(loops);
  const stations = STATIONS.filter((q) => q.line === 'main').map((q) => [q.at[0] * TILE, q.at[1] * TILE]);
  const out = { found: 0, squared: [], left: [] };
  const ok = (l) => ground(l) && l.kind !== 'hwy' && l.kind !== 'ramp' && !l.foot;
  let grid = lineGrid(lines, ground);
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li];
    if (!ok(l)) continue;
    measure(l.pts);
    const cs = crossingsOf(l, tracks);
    out.found += cs.length;
    // (the furthest along first: squaring one doesn't move the ones before it)
    for (const c of cs.slice().reverse()) {
      if (c.angle >= SQUARE) continue;
      const r = squareOne(m, lines, grid, tracks, li, c, stations);
      const rec = { name: l.name || l.kind, kind: l.kind, at: [Math.round(c.x / TILE), Math.round(c.y / TILE)], angle: Math.round(c.angle * 10) / 10 };
      if (!r) {
        const q = { ...rec, x: Math.round(c.x), y: Math.round(c.y), tx: c.tx, ty: c.ty, hw: hwOf(l.kind) };
        // (the road's line near it, for the underpass to run as far as the road keeps over the tracks - not listed)
        Object.defineProperty(q, 'road', { value: l.pts.map((p) => ({ x: p.x, y: p.y })), enumerable: false });
        out.left.push(q); continue;
      }
      l.pts = r.pts;
      rec.after = Math.round(Math.min(...crossingsOf(l, tracks).filter((q) => Math.hypot(q.x - c.x, q.y - c.y) < 20 * TILE).map((q) => q.angle)) * 10) / 10;
      rec.jog = [r.H, r.d, r.dt];
      out.squared.push(rec);
      grid = lineGrid(lines, ground);
    }
  }
  return out;
}

// A crossing that couldn't be squared (a road that meets another right at the tracks, or ends there): the tracks go
// under the road instead - a short underpass, as where the line meets a highway (map.js markUnderpasses: down UNDER_RAMP
// either side), unless that would put it under water. From the `rails` hook, on the loops it hands the generator.
const UNDER_RAMP = 9 * TILE;
export function underpassLeft(m, loops, left) {
  const out = [];
  for (const c of left || []) {
    // (along the tracks: as far as the road's width covers them at its slant, and the ramp beyond)
    const sin = Math.max(0.2, Math.sin(c.angle * Math.PI / 180)), R = (c.hw + 64) / sin + UNDER_RAMP;
    const runs = loops.map((l) => l.pts.filter((p) => Math.abs(p.x - c.x) < R + 64 && Math.abs(p.y - c.y) < R + 64 && Math.abs((p.x - c.x) * c.tx + (p.y - c.y) * c.ty) < R && Math.abs(-(p.x - c.x) * c.ty + (p.y - c.y) * c.tx) < 160));
    const wet = runs.some((P) => P.some((p) => { const t = m.tileAtPx(p.x, p.y); return t === T.WATER || t === T.DEEP || t === T.BRIDGE; }));
    if (wet) { out.push({ ...c, under: false }); continue; }
    for (const P of runs) for (const p of P) { p.under = true; p.underpass = true; }
    // (a road that runs on alongside the tracks at its slant - over their bed - keeps them under it as far as it does,
    // and the ramp beyond)
    const wetHere = (p) => { const t = m.tileAtPx(p.x, p.y); return t === T.WATER || t === T.DEEP || t === T.BRIDGE; };
    if (c.road) for (const l of loops) {
      const P = l.pts;
      let s0 = Infinity, s1 = -Infinity;
      for (const p of P) {
        if (Math.abs(p.x - c.x) > 4000 || Math.abs(p.y - c.y) > 4000) continue;
        let d = Infinity;
        for (let k = 0; k + 1 < c.road.length; k++) d = Math.min(d, segDist(p.x, p.y, c.road[k], c.road[k + 1]));
        if (d < c.hw + 64 && p.s !== undefined) { s0 = Math.min(s0, p.s); s1 = Math.max(s1, p.s); }
      }
      if (s0 <= s1) for (const p of P) if (p.s >= s0 - UNDER_RAMP && p.s <= s1 + UNDER_RAMP && !wetHere(p)) { p.under = true; p.underpass = true; }
    }
    out.push({ ...c, under: true });
  }
  return out;
}

// ---- 2. the stations' streets and car parks --------------------------------------------------------------------------
// The main line's centre near a station: its point nearest `at` (px), the line's direction there, below ground or not.
function lineAt(loops, ax, ay) {
  const P0 = loops[0].pts, P1 = loops[1].pts;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < P0.length; i++) { const d = Math.hypot(P0[i].x - ax, P0[i].y - ay); if (d < bd) { bd = d; bi = i; } }
  const p = P0[bi], q = P0[(bi + 4) % P0.length], o = P0[(bi - 4 + P0.length) % P0.length];
  let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  // the other track's nearest point: the centre between the two
  let cd = Infinity, cq = p;
  for (let i = 0; i < P1.length; i++) { const d = Math.hypot(P1[i].x - p.x, P1[i].y - p.y); if (d < cd) { cd = d; cq = P1[i]; } }
  const cx = (p.x + cq.x) / 2, cy = (p.y + cq.y) / 2;
  // (along the line from the centre point to `at`)
  const a = (ax - cx) * tx + (ay - cy) * ty;
  return { x: cx + tx * a, y: cy + ty * a, tx, ty, under: !!(p.under && cq.under) };
}

// A straight arm from (x, y) along (dx, dy) to the first road it meets within REACH tiles: { x, y, len, line } | null.
// It may not leave the land, run into a keep, pass a highway or come near the tracks; it meets a road it comes at
// across (not one it runs along).
function arm(m, lines, grid, tracks, x, y, dx, dy, hw, skip) {
  for (let s = 2 * TILE; s <= REACH * TILE; s += 8) {
    const px = x + dx * s, py = y + dy * s;
    if (!landAt(m, px, py) || !landAt(m, px - dy * hw, py + dx * hw) || !landAt(m, px + dy * hw, py - dx * hw) || inKeep(px, py)) return null;
    if (tracks.dist(px, py, 300) < hw + 6 * TILE) return null;
    for (const [oj, k] of grid(px - 300, py - 300, px + 300, py + 300)) {
      if (skip && skip.has(oj)) continue;
      const o = lines[oj], a = o.pts[k], b = o.pts[k + 1];
      const d = segDist(px, py, a, b);
      if (o.kind === 'hwy' || o.kind === 'ramp' || o.kind === 'alley' || o.foot || o.notraffic || !MEET.has(o.kind)) { if (d < hw + hwOf(o.kind) + 24) return null; continue; }
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ang = angDeg(dx, dy, (b.x - a.x) / L, (b.y - a.y) / L);
      if (d <= Math.max(4, hwOf(o.kind) * 0.25)) {
        if (ang < 35) return null;
        // the meeting point: on o's centre line
        const t = Math.max(0, Math.min(1, ((px - a.x) * (b.x - a.x) + (py - a.y) * (b.y - a.y)) / (L * L)));
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, len: s, line: oj };
      }
      if (ang < 35 && d < hw + hwOf(o.kind) + 40) return null;   // (running along another road)
    }
  }
  return null;
}

// The stretch of line oj nearest (x, y) and its direction there
function nearestOn(l, x, y) {
  let bd = Infinity, best = null;
  for (let k = 0; k + 1 < l.pts.length; k++) {
    const a = l.pts[k], b = l.pts[k + 1], d = segDist(x, y, a, b);
    if (d < bd) { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; bd = d; best = { d, k, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L }; }
  }
  return best;
}

// One station, one side, one way: the plan or null. P: the line's centre by the station, (tx, ty) along it, (nx, ny)
// toward the side.
function tryFront(m, lines, grid, tracks, st, P, tx, ty, nx, ny) {
  const hw = hwOf(STATION_KIND), C = FRONT_C * TILE, A = FRONT_A * TILE;
  const at = (a, c) => ({ x: P.x + tx * a + nx * c, y: P.y + ty * a + ny * c });
  const E0 = at(-A, C), E1 = at(A, C);
  // the forecourt between the line and the station road: a road's stub ending in it is cut back to the station road;
  // a road running through it (across the line) meets the station road
  const trims = [];
  const zone = (p) => { const a = (p.x - P.x) * tx + (p.y - P.y) * ty, c = (p.x - P.x) * nx + (p.y - P.y) * ny; return Math.abs(a) <= A + 2 * TILE && c > -2 * TILE && c < C + TILE; };
  const fpts = [E0, E1];
  const crossers = new Set(), cuts = [];
  for (const [oj, k] of grid(Math.min(E0.x, E1.x, P.x) - 2 * A, Math.min(E0.y, E1.y, P.y) - 2 * A, Math.max(E0.x, E1.x, P.x) + 2 * A, Math.max(E0.y, E1.y, P.y) + 2 * A)) {
    const o = lines[oj], a = o.pts[k], b = o.pts[k + 1];
    if (!ground(o)) continue;
    const x = segX(E0, E1, a, b);
    if (x) {
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      if (o.kind === 'hwy' || o.kind === 'ramp' || o.kind === 'alley' || o.foot || angDeg(tx, ty, (b.x - a.x) / L, (b.y - a.y) / L) < 40) return null;
      crossers.add(oj);
      cuts.push((x.x - P.x) * tx + (x.y - P.y) * ty);   // (where along the station road it meets it)
      for (const end of [0, 1]) { const e = end ? o.pts[o.pts.length - 1] : o.pts[0]; if (zone(e)) trims.push({ oj, end, x: x.x, y: x.y, k: x.u }); }
    }
  }
  // lines along the station road (not across it) or ending in the forecourt without reaching the road: it doesn't fit
  for (const [oj, k] of grid(Math.min(E0.x, E1.x) - 300, Math.min(E0.y, E1.y) - 300, Math.max(E0.x, E1.x) + 300, Math.max(E0.y, E1.y) + 300)) {
    const o = lines[oj];
    if (!ground(o) || crossers.has(oj)) continue;
    const a = o.pts[k], b = o.pts[k + 1];
    const d = Math.min(segDist(a.x, a.y, E0, E1), segDist(b.x, b.y, E0, E1), segDist(E0.x, E0.y, a, b), segDist(E1.x, E1.y, a, b));
    if (d < hw + hwOf(o.kind) + 48) return null;
    if (zone(a) || zone(b)) return null;
  }
  for (const p of fpts) if (!landAt(m, p.x, p.y)) return null;
  for (let s = 0; s <= 2 * A; s += 16) { const p = at(-A + s, C); if (!landAt(m, p.x, p.y) || inKeep(p.x, p.y) || tracks.dist(p.x, p.y, 400) < 9 * TILE) return null; }
  // each end carried on to a road: away from the line, or on along it (the shortest)
  const skip = new Set(crossers);
  const ends = [[E0, -1], [E1, 1]].map(([E, sg]) => {
    const opts = [arm(m, lines, grid, tracks, E.x, E.y, nx, ny, hw, skip), arm(m, lines, grid, tracks, E.x, E.y, tx * sg, ty * sg, hw, skip)].filter(Boolean);
    return opts.length ? opts.reduce((p, q) => (q.len < p.len ? q : p)) : null;
  });
  if (ends[0] && ends[1] && Math.hypot(ends[0].x - ends[1].x, ends[0].y - ends[1].y) < 8 * TILE) ends[1] = null;
  // where the station road meets the network: its arms' ends and the roads across it. Two or more: a way through (an
  // end with no arm stops at the last road across it); one: a dead end, with a turning circle (the generator's bulb)
  const J = [...cuts];
  if (ends[0]) J.push(-A);
  if (ends[1]) J.push(A);
  if (!J.length) return null;
  const loop = J.length >= 2 && Math.max(...J) - Math.min(...J) >= 10 * TILE;
  const a0 = ends[0] || !loop ? -A : Math.min(...J), a1 = ends[1] || !loop ? A : Math.max(...J);
  if (a1 - a0 < 14 * TILE) return null;
  const main = [];
  if (ends[0]) main.push({ x: ends[0].x, y: ends[0].y });
  main.push(at(a0, C), at(a1, C));
  if (ends[1]) main.push({ x: ends[1].x, y: ends[1].y });
  const roads = [rounded(main, 3 * TILE, false, 6)];
  // the car park behind the station road: between its arms when they go away from the line, else LOT_D deep
  const c0 = FRONT_C + (hw + 64) / TILE + 0.5;
  let c1 = c0 + LOT_D;
  for (const e of ends) if (e && Math.abs(((e.x - P.x) * nx + (e.y - P.y) * ny) - C) > 4 * TILE) c1 = Math.min(c1, ((e.x - P.x) * nx + (e.y - P.y) * ny) / TILE - 4);
  // (a car park squeezed between its arms costs: the other side, or the other way, may have room for a whole one)
  const cost = (ends[0] ? ends[0].len : 0) + (ends[1] ? ends[1].len : 0) + (a1 - a0) + (loop ? 0 : 60 * TILE) + Math.max(0, c0 + LOT_D - c1) * 30 * TILE;
  const la0 = a0 / TILE + 3, la1 = a1 / TILE - 3;
  return { how: 'front', loop, roads, trims, arms: ends.filter(Boolean), ends: ends.map((e) => (e ? { at: [Math.round(e.x / TILE), Math.round(e.y / TILE)], len: Math.round(e.len / TILE) } : null)), crossers: crossers.size, front: { c: FRONT_C, a0: a0 / TILE, a1: a1 / TILE }, lot: c1 - c0 >= 3 && la1 - la0 >= 8 ? { a0: la0, a1: la1, c0, c1, open: [FRONT_C + hw / TILE, c0] } : null, cost };
}

// a road along the station's front: its car park across it, a loop off it
function tryRoad(m, lines, grid, tracks, st, P, tx, ty, nx, ny, under) {
  const at = (a, c) => ({ x: P.x + tx * a + nx * c, y: P.y + ty * a + ny * c });
  // the road met going straight out from the line at three points along the station
  let R = null;
  for (const a of [-6, 0, 6]) {
    const o = at(a * TILE, 0);
    let hit = null;
    for (let c = (under ? 3 : 8) * TILE; c <= ROAD_C[1] * TILE && !hit; c += 8) {
      const p = at(a * TILE, c);
      for (const [oj, k] of grid(p.x - 64, p.y - 64, p.x + 64, p.y + 64)) {
        const l = lines[oj];
        if (!ground(l) || !MEET.has(l.kind) || l.foot || l.notraffic) continue;
        const q = l.pts[k], r = l.pts[k + 1];
        if (segDist(p.x, p.y, q, r) > 6) continue;
        const L = Math.hypot(r.x - q.x, r.y - q.y) || 1;
        if (angDeg(tx, ty, (r.x - q.x) / L, (r.y - q.y) / L) > 25) continue;
        hit = { oj, c };
        break;
      }
    }
    void o;
    if (!hit) return null;
    if (R && R.oj !== hit.oj && Math.abs(R.c - hit.c) > 2 * TILE) return null;
    if (!R || hit.c > R.c) R = hit;
  }
  const l = lines[R.oj], hwR = hwOf(l.kind), walk = walkAt(m, l.kind, P.x, P.y);
  const cR = R.c / TILE;
  // the house between the line and the road (beyond its platforms), else no
  if (!under && cR * TILE - hwR - walk < (HUB_C + 0.56) * TILE + 46 + 8) return null;
  if (cR < ROAD_C[0] && !under) return null;
  // the loop across it: two arms out from it, a lane along the far side (the car park between them and the road)
  const hw = hwOf(STATION_KIND);
  const onR = (p) => { const q = nearestOn(l, p.x, p.y); const a = l.pts[q.k], b = l.pts[q.k + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)); return { x: a.x + dx * t, y: a.y + dy * t, d: q.d }; };
  // (along the road a little, the loop clear of a side street; the nearest that fits)
  for (const ac of [0, 6, -6, 12, -12, 18, -18, 24, -24]) for (const [Al, Lu] of [[11, 20], [9, 17], [11, 16]]) {
    const A = Al * TILE, M = ac * TILE;
    const P0 = onR(at(M - A, R.c)), P1 = onR(at(M + A, R.c)), F0 = at(M - A, R.c + Lu * TILE), F1 = at(M + A, R.c + Lu * TILE);
    if (P0.d > 3 * TILE || P1.d > 3 * TILE) continue;
    const pts = rounded([P0, F0, F1, P1], 3 * TILE, false, 6);
    const why = stretchOk(m, lines, grid, tracks, -1, pts.slice(2, -2), STATION_KIND, null, { skip: new Set([R.oj]) });
    if (why) continue;
    // (the loop's arms meet the road clear of its other junctions)
    if ([P0, P1].some((p) => lines.some((o, oj) => oj !== R.oj && ground(o) && [o.pts[0], o.pts[o.pts.length - 1]].some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 8 * TILE)))) continue;
    const c0 = cR + (hwR + walk) / TILE + 0.5, c1 = cR + Lu - (hw + 64) / TILE - 0.5;
    return { how: 'road', loop: true, road: l.name || l.kind, roads: [pts], trims: [], arms: [], ends: [], crossers: 0, front: { c: cR }, lot: c1 - c0 >= 3 ? { a0: ac - Al + 3, a1: ac + Al - 3, c0, c1, open: [c1, cR + Lu - hw / TILE] } : null, cost: (2 * Lu + 2 * Al + Math.abs(ac)) * TILE * 0.8, houseC: under ? cR - (hwR + walk + 46 + 18 + 24) / TILE : HUB_C };
  }
  return null;
}

export function planStations3(lines, m, loops = mainLineLoops()) {
  const tracks = trackGrid(loops);
  const out = [];
  for (const st of STATIONS.filter((q) => q.line === 'main')) {
    const grid = lineGrid(lines, ground);
    const ax = st.at[0] * TILE, ay = st.at[1] * TILE;
    const L = lineAt(loops, ax, ay);
    const cands = [];
    for (const side of [1, -1]) {
      const nx = -L.ty * side, ny = L.tx * side;
      const r = tryRoad(m, lines, grid, tracks, st, L, L.tx, L.ty, nx, ny, L.under);
      if (r) cands.push({ ...r, side, nx, ny });
      const f = tryFront(m, lines, grid, tracks, st, L, L.tx, L.ty, nx, ny);
      if (f) cands.push({ ...f, side, nx, ny });
    }
    if (!cands.length) { out.push({ name: st.name, how: 'none' }); continue; }
    // (a way through first, then a car park, then the least new road)
    const rank = (q) => (q.loop ? 0 : 2) + (q.lot ? 0 : 1);
    const pick = cands.reduce((p, q) => ((rank(q) - rank(p)) || q.cost - p.cost) < 0 ? q : p);
    // lay it: the stubs in its forecourt cut back to its road, its roads added
    for (const t of pick.trims) {
      const o = lines[t.oj];
      measure(o.pts);
      // (cut at the crossing point with the station road: the end in the forecourt goes)
      const s = nearestS(o.pts, t.x, t.y);
      const keep = t.end ? o.pts.filter((p) => p.s < s - 1).concat([{ x: t.x, y: t.y }]) : [{ x: t.x, y: t.y }].concat(o.pts.filter((p) => p.s > s + 1));
      o.pts = keep.map((p) => ({ x: p.x, y: p.y }));
    }
    // a road an arm meets close to its end, that end toward the tracks (a street stopped short of the line): its stub past
    // the arm goes - the arm's junction is its end now, not a dead end by the line
    for (const e of pick.arms) {
      const o = lines[e.line];
      if (!o || o.city === undefined && o.kind !== 'st' && o.kind !== 'ave' && o.kind !== 'minor') continue;
      measure(o.pts);
      const s = nearestS(o.pts, e.x, e.y), Ls = o.pts[o.pts.length - 1].s;
      for (const [end, left] of [[1, Ls - s], [0, s]]) {
        const q = end ? o.pts[o.pts.length - 1] : o.pts[0];
        if (left < 2 * TILE || left > 24 * TILE || tracks.dist(q.x, q.y, 700) > 12 * TILE) continue;
        o.pts = (end ? o.pts.filter((p) => p.s < s - 1).concat([{ x: e.x, y: e.y }]) : [{ x: e.x, y: e.y }].concat(o.pts.filter((p) => p.s > s + 1))).map((p) => ({ x: p.x, y: p.y }));
        pick.trims.push({ oj: e.line, end, arm: true });
        break;
      }
    }
    for (const pts of pick.roads) lines.push({ pts: pts.map((p) => ({ x: p.x, y: p.y })), kind: STATION_KIND, lvl: 0, name: `${st.name} Station Road`, station: st.name, ...(pick.loop ? {} : { culdesac: true }) });
    // the house: by the station's spot, or along a little where a road runs past it there
    const hc = (pick.houseC ?? HUB_C) * TILE, g2 = lineGrid(lines, ground);
    let ha = 0;
    const span = pick.how === 'front' ? [pick.front.a0 + 3, pick.front.a1 - 3] : [-9, 9];
    for (const a of [0, -3, 3, -6, 6, -9, 9]) if (a >= span[0] && a <= span[1] && houseClear(lines, g2, L, pick.nx, pick.ny, a * TILE, hc)) { ha = a; break; }
    const house = { x: L.x + L.tx * ha * TILE + pick.nx * hc, y: L.y + L.ty * ha * TILE + pick.ny * hc, a: Math.atan2(pick.ny, pick.nx) };
    out.push({ name: st.name, how: pick.how, loop: !!pick.loop, side: pick.side, under: L.under, road: pick.road, ends: pick.ends, crossers: pick.crossers, trims: pick.trims.length,
      house, frame: { x: L.x, y: L.y, tx: L.tx, ty: L.ty, nx: pick.nx, ny: pick.ny }, lot: pick.lot, front: pick.front, houseC: hc / TILE, houseA: ha, cands: cands.length });
  }
  return out;
}
// the house's footprint (140 x 92 px, its middle 18 px out from the hub point; hub at a along the line, c out) clear of
// every road and its pavement
function houseClear(lines, grid, L, nx, ny, a, c) {
  const cx = L.x + L.tx * a + nx * (c + 18), cy = L.y + L.ty * a + ny * (c + 18);
  for (const [oj, k] of grid(cx - 400, cy - 400, cx + 400, cy + 400)) {
    const o = lines[oj], p = o.pts[k], q = o.pts[k + 1], room = hwOf(o.kind) + 40;
    if (o.lvl !== 0) continue;
    for (const u of [-70, -35, 0, 35, 70]) for (const v of [-46, 0, 46]) if (segDist(cx + L.tx * u + nx * v, cy + L.ty * u + ny * v, p, q) < room) return false;
  }
  return true;
}
function nearestS(pts, x, y) {
  let bd = Infinity, bs = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)), d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
    if (d < bd) { bd = d; bs = a.s + Math.sqrt(l2) * t; }
  }
  return bs;
}

// ---- 3. the car parks and forecourts on the tiles ---------------------------------------------------------------------
// From the `rails` hook (the roads are on the tiles; the blocks are cut after): each station's car park paved, its spaces
// in rows facing in from its long sides, and its forecourt - from the house's front to its street - paved as a plaza;
// both kept off the blocks.
const PAVE_OVER = new Set([T.GRASS, T.DIRT, T.SAND, T.FIELD, T.PLAZA, T.LOT]), OPEN_OVER = new Set([...PAVE_OVER, T.SIDEWALK]);
export function stampStations3(m) {
  const plans = m.world3 && m.world3.stations;
  if (!plans) return { lots: 0, spaces: 0 };
  let lots = 0, spaces = 0;
  for (const s of plans) {
    if (!s.frame) continue;
    const F = s.frame, at = (a, c) => [F.x + F.tx * a * TILE + F.nx * c * TILE, F.y + F.ty * a * TILE + F.ny * c * TILE];
    const paint = (a0, a1, c0, c1, t, over = PAVE_OVER) => {
      let n = 0;
      const xs = [], ys = [];
      for (const [a, c] of [[a0, c0], [a1, c0], [a0, c1], [a1, c1]]) { const [x, y] = at(a, c); xs.push(x); ys.push(y); }
      for (let ty = Math.floor(Math.min(...ys) / TILE); ty <= Math.floor(Math.max(...ys) / TILE); ty++) for (let tx = Math.floor(Math.min(...xs) / TILE); tx <= Math.floor(Math.max(...xs) / TILE); tx++) {
        if (!m.inside(tx, ty)) continue;
        const px = (tx + 0.5) * TILE - F.x, py = (ty + 0.5) * TILE - F.y, a = (px * F.tx + py * F.ty) / TILE, c = (px * F.nx + py * F.ny) / TILE;
        if (a < a0 || a > a1 || c < c0 || c > c1) continue;
        const i = m.idx(tx, ty);
        if (!over.has(m.tiles[i]) || !m.land[i]) continue;
        m.tiles[i] = t; m.reserve[i] |= 16; n++;
      }
      return n;
    };
    // the forecourt: the house and the paving in front of it to the street (and a little either side)
    const hc = s.houseC, ha = s.houseA || 0;
    paint(ha - 4, ha + 4, hc - 1.5, s.front.c, T.PLAZA);
    if (!s.lot) continue;
    const L = s.lot, n = paint(L.a0, L.a1, L.c0, L.c1, T.LOT);
    if (n < 12) { s.lot = null; continue; }
    // its way in: the pavement between it and its station road paved over (a car turns in off the road, and out)
    if (L.open) paint(L.a0 + 1, L.a1 - 1, L.open[0] + 0.2, L.open[1] + 0.2, T.LOT, OPEN_OVER);
    lots++;
    // the spaces: a row along each long side, nose in
    const sp = [];
    for (let a = L.a0 + 1.5; a <= L.a1 - 1.5; a += 2) {
      for (const [c, face] of [[L.c0 + 1.3, 1], [L.c1 - 1.3, -1]]) {
        if (L.c1 - L.c0 < 5 && face < 0) continue;
        const [x, y] = at(a, c);
        if (m.tileAtPx(x, y) !== T.LOT) continue;
        sp.push({ x: Math.round(x), y: Math.round(y), a: Math.atan2(-F.ny * face, -F.nx * face), sparse: true });
      }
    }
    for (const q of sp) m.parking.push(q);
    s.spaces = sp.length; spaces += sp.length;
  }
  return { lots, spaces };
}
