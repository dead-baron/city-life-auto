// World v3: the main line (docs/WORLD-V3.md part 5 ruling 4, 8.10). The skeleton's MAIN_LINE (six segments between
// four junctions) as double track - one track each way, side by side - and its services, each both ways, as the loops
// the trains run: a service's run of segments joined end to end, its corners and its junctions turned on arcs (the
// main line's 300 m, 200 m in the gulf), the whole offset to the right of the way it runs, so a loop running a
// segment one way is always on that segment's track for that way. Two loops running the same segment the same way
// share its track to the point (the same corners, the same arcs); where they part at a junction one curves off the
// other's track (a turnout), and where a loop crosses the other way's track at a junction it crosses at grade (a
// diamond, guarded by the trains' signals: server/systems/trains.js).
//
// The generator lays each loop as it lays today's one (shared/map.js reserveRail / buildRailway, through the world
// build's `rails` hook): the track bed, the bridges over water, the level crossings with gates where it meets a road,
// the underpasses where it meets a highway at grade, and the stations - a platform on the outer side of each track
// (so a double track has one each side). The skeleton's tunnels are `under` (the track below ground, as today's subway
// stretch). Only + - * / and Math.sqrt: the same in every engine.
import { TILE } from './constants.js';
import { MAIN_LINE, MAIN_JUNCTIONS, SERVICES, STATIONS, RADIUS } from './world3-skeleton.js';

export const TRACK_OFF = 48;   // px from the main line's centre to each track's centre (the two 96 px apart: 3 tiles)
const SAMPLE = 8;              // px between a track's points (as today's railLine)
const ARC_STEP = 6;            // tiles between the points of an arc

const segByName = (n) => MAIN_LINE.find((l) => l.name === n);
const radiusOf = (seg) => seg.r || RADIUS.main;

// The control points of a service run one way, joined end to end (each junction once), with each corner's radius
// and the skeleton's stretches (tunnels, bridges) as control-point index pairs of the joined list. One way is the
// service's run as written (+1), the other the run reversed.
export function serviceRoute(service, way) {
  const run = way > 0 ? service.run : service.run.slice().reverse().map(([n, d]) => [n, -d]);
  const P = [], R = [], tunnels = [], bridges = [], segs = [];
  for (const [name, d] of run) {
    const seg = segByName(name), n = seg.pts.length;
    const pts = d > 0 ? seg.pts : seg.pts.slice().reverse();
    const base = P.length ? P.length - 1 : 0;   // the junction is the last point so far and this segment's first
    const idx = (i) => base + (d > 0 ? i : n - 1 - i);
    for (const [i, j] of seg.tunnels || []) { const a = idx(i), b = idx(j); tunnels.push(a < b ? [a, b] : [b, a]); }
    for (const [i, j] of seg.bridges || []) { const a = idx(i), b = idx(j); bridges.push(a < b ? [a, b] : [b, a]); }
    const r = radiusOf(seg);
    if (P.length) R[P.length - 1] = Math.min(R[P.length - 1], r);   // the junction's corner: the tighter of the two
    for (let k = P.length ? 1 : 0; k < n; k++) { P.push(pts[k]); R.push(r); }
    segs.push({ name, way: d, from: base, to: base + n - 1 });
  }
  return { P, R, tunnels, bridges, segs };
}

// A closed loop of control points (the first and the last the same junction) rounded at every corner, the closing
// one too: started half way along its first leg. Returns the sampled path (tiles) and where it passes each control
// point (distance along it), the stretches as distance ranges.
function roundLoop(route) {
  const { P, R } = route, n = P.length;   // P[n - 1] is P[0]
  const M = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
  // the rotated list: M, P1 .. P(n-2), P0, M; control point k (1 <= k <= n - 2) is at k, P0 at n - 1
  const Q = [M, ...P.slice(1, n - 1), P[0], M], QR = [0, ...R.slice(1, n - 1), R[0], 0];
  const m = Q.length, seg = [], want = [0];
  for (let i = 0; i < m - 1; i++) seg.push(Math.sqrt((Q[i + 1][0] - Q[i][0]) ** 2 + (Q[i + 1][1] - Q[i][1]) ** 2));
  const geo = (i) => {
    const ux = (Q[i][0] - Q[i - 1][0]) / seg[i - 1], uy = (Q[i][1] - Q[i - 1][1]) / seg[i - 1];
    const vx = (Q[i + 1][0] - Q[i][0]) / seg[i], vy = (Q[i + 1][1] - Q[i][1]) / seg[i];
    return { ux, uy, vx, vy, cross: ux * vy - uy * vx, dot: ux * vx + uy * vy };
  };
  for (let i = 1; i < m - 1; i++) { const g = geo(i); want.push(Math.abs(g.cross) < 1e-9 && g.dot > 0 ? 0 : QR[i] * Math.abs(g.cross) / (1 + g.dot)); }
  want.push(0);
  const share = (i, j, L) => (want[i] + want[j] > L ? L * want[i] / (want[i] + want[j]) : want[i]);
  const out = [[Q[0][0], Q[0][1]]], at = [0];
  for (let i = 1; i < m - 1; i++) {
    const B = Q[i], g = geo(i);
    if (want[i] === 0) { at.push(out.length); out.push([B[0], B[1]]); continue; }
    const tanHalf = Math.abs(g.cross) / (1 + g.dot);
    const t = Math.min(share(i, i - 1, seg[i - 1]), share(i, i + 1, seg[i])), r = t / tanHalf;
    const t1x = B[0] - g.ux * t, t1y = B[1] - g.uy * t, t2x = B[0] + g.vx * t, t2y = B[1] + g.vy * t;
    const sg = g.cross > 0 ? 1 : -1, cx = t1x - g.uy * r * sg, cy = t1y + g.ux * r * sg;
    const ax = (t1x - cx) / r, ay = (t1y - cy) / r, bx = (t2x - cx) / r, by = (t2y - cy) / r;
    const k = Math.max(4, Math.ceil(2 * t / ARC_STEP)), mid = k >> 1;
    for (let j = 0; j <= k; j++) {
      const w = j / k, px = ax * (1 - w) + bx * w, py = ay * (1 - w) + by * w, l = Math.sqrt(px * px + py * py);
      if (j === mid) at.push(out.length);
      out.push([cx + r * px / l, cy + r * py / l]);
    }
  }
  at.push(out.length);
  out.push([Q[m - 1][0], Q[m - 1][1]]);
  const s = [0];
  for (let j = 1; j < out.length; j++) s.push(s[j - 1] + Math.sqrt((out[j][0] - out[j - 1][0]) ** 2 + (out[j][1] - out[j - 1][1]) ** 2));
  const atS = at.map((j) => s[j]);
  // control point k of the route at atS[k] (k >= 1), P0 at atS[n - 1]
  const ctl = (k) => (k === 0 ? atS[n - 1] : atS[k]);
  const ranges = (list) => list.map(([a, b]) => (a === 0 ? [0, ctl(b)] : [ctl(a), b === n - 1 ? atS[n - 1] : ctl(b)]));
  return { pts: out, s, length: s[s.length - 1], tunnels: ranges(route.tunnels), bridges: ranges(route.bridges), ctl };
}

// One loop's track: points every SAMPLE px, offset TRACK_OFF to the right of the way it runs, in px; each with its
// distance along (s) and `under` in the skeleton's tunnels.
function trackOf(path) {
  const P = path.pts, S = path.s, total = path.length * TILE, out = [];
  const inR = (list, s) => list.some(([a, b]) => s >= a && s <= b);
  let j = 1;
  for (let d = 0; d < total - 0.5; d += SAMPLE) {
    const s = d / TILE;
    while (j < P.length - 1 && S[j] < s) j++;
    const a = P[j - 1], b = P[j], L = S[j] - S[j - 1] || 1, w = (s - S[j - 1]) / L;
    const dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L;
    const x = (a[0] + (b[0] - a[0]) * w) * TILE - dy * TRACK_OFF, y = (a[1] + (b[1] - a[1]) * w) * TILE + dx * TRACK_OFF;
    const under = inR(path.tunnels, s);
    out.push({ x, y, under, subway: false, tunnel: under });
  }
  let s = 0;
  for (let i = 0; i < out.length; i++) { if (i) s += Math.sqrt((out[i].x - out[i - 1].x) ** 2 + (out[i].y - out[i - 1].y) ** 2); out[i].s = s; }
  return out;
}

// The main line's loops: each service both ways - { name, service, way, pts (the track, px), stations: [{ name, x, y }]
// (its stops in px, in order), segs, side: 1 (its platforms on the right of the way it runs: the outer side) }.
// `junctions`: the four, in px (where the trains' signals guard).
export function mainLineLoops() {
  const loops = [];
  for (const sv of SERVICES) for (const way of [1, -1]) {
    const route = serviceRoute(sv, way), path = roundLoop(route), pts = trackOf(path);
    const stops = way > 0 ? sv.stops : sv.stops.slice().reverse();
    const stations = stops.map((name) => { const st = STATIONS.find((q) => q.line === 'main' && q.name === name); return { name, x: st.at[0] * TILE, y: st.at[1] * TILE }; });
    loops.push({ name: `${sv.name} (${way > 0 ? 'one way' : 'the other way'})`, service: sv.name, way, pts, stations, side: 1, segs: route.segs.map((g) => g.name + (g.way > 0 ? ' +' : ' -')) });
  }
  return loops;
}
export const mainJunctions = () => MAIN_JUNCTIONS.map((j) => ({ name: j.name, x: j.at[0] * TILE, y: j.at[1] * TILE }));
