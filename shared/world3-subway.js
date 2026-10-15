// World v3: the subways (docs/WORLD-V3.md part 5 ruling 5, 8.16; the owner's markup: pink subway line 1, yellow line 2,
// dotted = underground). The skeleton's SUBWAYS (shared/world3-skeleton.js) laid as double track - one track each way,
// 96 px apart as the main line's - and each line run as ONE closed loop for the trains (server/systems/trains.js: the
// loops machinery of 8.10, its signals): out along the line on one track, round the line's own loop where it has one
// (Line 1's under Cedar Isle, Line 2's under Westport, as the markup draws them), back on the other track, and round a
// turning loop below ground beyond each free end (Line 1's at Northshore, Line 2's at the airport and past Southbank),
// so a train never reverses and the two ways never share a track. A loop at a line's end (Cedar Isle) is entered with a
// right turn and left with one, so the line's two tracks run into its two ends without crossing; a loop in the middle
// of a line (Westport) has its tracks cross at the junction (diamonds, below ground: the signals take them whole).
//
// Below ground everywhere (the track `under`: nothing laid on top, the trains drawn underground, the stations reached by
// a kiosk on a plaza with stairs down - shared/map.js reserveSubwayPlazas / subwayKiosk, as today's subway) but on the
// skeleton's viaducts (Line 1 beside the Bay Bridge, Line 2 over the airport's strait): there the track is at grade from
// RAMP tiles before the water to RAMP tiles past it (the generator lays the bed and decks it over the water), and below
// ground again beyond. Each station is a stop on both tracks (a terminal once, after its turning loop); a station at
// a line's junction with its loop stands SHIFT tiles back along the line, clear of the junction.
// The route is built with + - * / and Math.sqrt only (the same in every engine); the passes by the stations measure with
// Math.hypot, at build time, under generateCity's deterministic maths. Nothing is computed when the module loads.
import { TILE, T } from './constants.js';
import { SUBWAYS, STATIONS, RADIUS } from './world3-skeleton.js';
import { roundLoop, trackOf } from './world3-rail.js';

export const SUB_TURN = { r: 24, side: 110, neck: 30 };   // a turning loop beyond a free end (tiles): below ground
const JUNCTION_R = 60;   // tiles: the corners where a line meets its loop
const SHIFT = 50;        // tiles: a station at a line's junction with its loop stands this far back along the line
const RAMP = 12;         // tiles: a viaduct's track at grade this far either side of the water it crosses
const NEAR = 240;        // px: a track point this close to a station's spot is a pass by it

// A subway stop's name: the skeleton's, with " Subway" where the main line has a station of that name (so the two have a
// map point each: Northshore, Cedar Falls, Westport Center, Lakeview)
export const subwayName = (name) => (STATIONS.some((s) => s.line === 'main' && s.name === name) ? `${name} Subway` : name);

const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy) || 1; return [dx / l, dy / l]; };
const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
const same = (a, b) => Math.abs(a[0] - b[0]) < 1 && Math.abs(a[1] - b[1]) < 1;

// The turning loop beyond a free end E reached heading u: straight on to A, a right turn, round a square (left turns)
// and a right turn back at A towards E. Its points after E, ending with A.
function turnLoop(E, u) {
  const n = [-u[1], u[0]], { side: S, neck } = SUB_TURN;
  const A = [E[0] + u[0] * neck, E[1] + u[1] * neck];
  const p = (a, b) => [A[0] + u[0] * a + n[0] * b, A[1] + u[1] * a + n[1] * b];
  return [A, p(0, S / 2), p(S, S / 2), p(S, -S / 2), p(0, -S / 2), A];
}

// A subway line as its closed route: control points P (P[last] = P[0]), each corner's radius R, and which legs are the
// skeleton's viaducts (`via`: the leg from control point k to k + 1).
export function subwayRoute(sw) {
  const L = sw.pts, n = L.length, R0 = sw.r || RADIUS.sub;
  const loop = SUBWAYS.find((q) => q.loopOf === sw.name);
  const j = loop ? L.findIndex((p) => same(p, loop.pts[0])) : -1;
  const viaLeg = (i) => (sw.bridges || []).some(([a, b]) => i >= a && i < b);
  // the loop's own points between its two visits of the junction, oriented so a line ending on it enters with a right turn
  let lp = loop ? loop.pts.slice(1, -1) : [];
  if (loop && j === n - 1 && cross(unit(L[j - 1], L[j]), unit(L[j], lp[0])) < 0) lp = lp.reverse();
  const seq = [];
  const push = (p, r, via) => seq.push({ p, r, via });
  // out along the line (round its loop where it meets it)
  for (let i = 0; i < n; i++) {
    if (i === j) {
      push(L[i], JUNCTION_R, false);
      for (const q of lp) push(q, R0, false);
      push(L[i], JUNCTION_R, i < n - 1 ? viaLeg(i) : viaLeg(i - 1));
    } else push(L[i], R0, i < n - 1 ? viaLeg(i) : false);
  }
  // the far end: its loop (done above) or a turning loop, back to the end point
  if (j !== n - 1) {
    const t = turnLoop(L[n - 1], unit(L[n - 2], L[n - 1]));
    for (const q of t) push(q, SUB_TURN.r, false);
    push(L[n - 1], 0, viaLeg(n - 2));
  }
  // back along the line on the other track (round the middle loop the other way), to the start
  for (let i = n - 2; i >= 0; i--) {
    if (i === j) {
      push(L[i], JUNCTION_R, false);
      for (let k = lp.length; k--;) push(lp[k], R0, false);
      push(L[i], JUNCTION_R, i > 0 ? viaLeg(i - 1) : false);
    } else if (i > 0) push(L[i], R0, viaLeg(i - 1));
    else push(L[i], 0, false);
  }
  // the start: a turning loop beyond it, back to the first point (the route's first control point)
  for (const q of turnLoop(L[0], unit(L[1], L[0]))) push(q, SUB_TURN.r, false);
  seq[0].r = 0;   // (the first control point is the start's straight pass)
  return { P: [...seq.map((q) => q.p), L[0]], R: [...seq.map((q) => q.r), 0], via: seq.map((q) => q.via), tunnels: [], bridges: [], line: sw, loop, j };
}

// The subway lines as the trains' loops: { name, service, way: 1, subway (the line's name), pts (the track, px: `under`
// below ground), stations [{ name, x, y }] (each pass, px), side: 1, hub: false, bores: [], color }.
export function subwayLoops(m = null) {
  const out = [];
  for (const sw of SUBWAYS) {
    if (sw.loop) { out.push(...closedLoops(sw, m)); continue; }   // (World v3b: the lines are closed loops)
    if (sw.loopOf) continue;
    const route = subwayRoute(sw), path = roundLoop(route), nP = route.P.length;
    // the viaducts' stretches (along the centre line, tiles): the legs flagged, from corner to corner
    const ctl = (k) => (k === nP - 1 ? path.ctl(0) : path.ctl(k));
    const via = [];
    route.via.forEach((v, k) => { if (!v) return; const a = ctl(k), b = ctl(k + 1); if (k === 0) { via.push([0, b]); via.push([a, path.length]); } else via.push(a <= b ? [a, b] : [a, path.length]); });
    // everything else below ground
    via.sort((a, b) => a[0] - b[0]);
    const tunnels = []; let s0 = 0;
    for (const [a, b] of via) { if (a > s0) tunnels.push([s0, a]); s0 = Math.max(s0, b); }
    if (s0 < path.length) tunnels.push([s0, path.length]);
    path.tunnels = tunnels;
    const pts = trackOf(path);
    // the viaducts at grade only near the water they cross: RAMP tiles either side of it, below ground beyond
    if (m) {
      const N = pts.length, wet = new Uint8Array(N), K = Math.ceil(RAMP * TILE / 8);
      for (let i = 0; i < N; i++) if (!pts[i].under) { const t = m.tileAtPx(pts[i].x, pts[i].y); wet[i] = t === T.WATER || t === T.DEEP ? 1 : 0; }
      const near = new Int32Array(N).fill(1 << 30);
      for (let i = 0, last = -(1 << 30); i < N; i++) { if (wet[i]) last = i; near[i] = i - last; }
      for (let i = N - 1, last = 1 << 30; i >= 0; i--) { if (wet[i]) last = i; near[i] = Math.min(near[i], last - i); }
      for (let i = 0; i < N; i++) if (!pts[i].under && near[i] > K) pts[i].under = true;
    }
    for (const p of pts) { p.tunnel = p.under; p.subway = p.under; }
    // the stations: each pass of the track by its spot (a junction's moved back along the line; a terminal once, after
    // its turning loop - the pass heading back into the line)
    const L = sw.pts, nL = L.length, mine = STATIONS.filter((s) => s.line === sw.name);
    const freeEnd = route.j !== nL - 1;
    const near0 = mine.reduce((a, s) => (Math.hypot(s.at[0] - L[0][0], s.at[1] - L[0][1]) < Math.hypot(a.at[0] - L[0][0], a.at[1] - L[0][1]) ? s : a));
    const nearN = mine.reduce((a, s) => (Math.hypot(s.at[0] - L[nL - 1][0], s.at[1] - L[nL - 1][1]) < Math.hypot(a.at[0] - L[nL - 1][0], a.at[1] - L[nL - 1][1]) ? s : a));
    const defs = [];
    for (const s of mine) {
      let at = s.at;
      if (route.loop && same(at, route.loop.pts[0])) { const u = unit(L[route.j], L[route.j - 1]); at = [at[0] + u[0] * SHIFT, at[1] + u[1] * SHIFT]; }
      const X = at[0] * TILE, Y = at[1] * TILE, passes = [];
      let run = null;
      for (let i = 0; i <= pts.length; i++) {
        const p = pts[i % pts.length], d = i < pts.length ? Math.hypot(p.x - X, p.y - Y) : Infinity;
        if (d < NEAR) { if (!run || d < run.d) run = { i, d }; continue; }
        if (run) { passes.push(run.i); run = null; }
      }
      const heading = (i) => { const p = pts[i], q = pts[(i + 1) % pts.length]; return [q.x - p.x, q.y - p.y]; };
      let keep = passes;
      if (s === near0) keep = passes.filter((i) => { const h = heading(i), u = unit(L[0], L[1]); return h[0] * u[0] + h[1] * u[1] > 0; });
      else if (freeEnd && s === nearN) keep = passes.filter((i) => { const h = heading(i), u = unit(L[nL - 1], L[nL - 2]); return h[0] * u[0] + h[1] * u[1] > 0; });
      for (const i of keep.slice(0, 2)) defs.push({ name: subwayName(s.name), x: pts[i].x, y: pts[i].y, i });
    }
    defs.sort((a, b) => a.i - b.i);
    out.push({ name: sw.name, service: sw.name, way: 1, subway: sw.name, color: sw.color, pts, stations: defs.map(({ name, x, y }) => ({ name, x, y })), side: 1, hub: false, bores: [] });
  }
  return out;
}

// World v3b's subway lines are closed loops (SUBWAYS' `loop`): double track as the main line's - each way its own loop
// of the trains, the track offset to the right of the way it runs, so the two ways are the line's two tracks. Below
// ground but within RAMP tiles of the water it crosses (on its viaducts and bridges there, the generator's decks); with
// no map, below ground everywhere. Each station a stop on both tracks, once each way round.
function closedLoops(sw, m) {
  const out = [];
  for (const way of [1, -1]) {
    const P = way > 0 ? sw.pts : sw.pts.slice().reverse();
    const path = roundLoop({ P, R: P.map(() => sw.r || RADIUS.sub), tunnels: [], bridges: [] });
    const pts = trackOf(path);
    const N = pts.length, K = Math.ceil(RAMP * TILE / 8);
    if (m) {
      const wet = new Uint8Array(N);
      for (let i = 0; i < N; i++) { const t = m.tileAtPx(pts[i].x, pts[i].y); wet[i] = t === T.WATER || t === T.DEEP ? 1 : 0; }
      // (the distance in track points to the nearest wet one, round the loop)
      const near = new Int32Array(N).fill(1 << 30);
      for (let pass = 0; pass < 2; pass++) for (let k = 0, last = -(1 << 30); k < 2 * N; k++) { const i = k % N; if (wet[i]) last = k; near[i] = Math.min(near[i], k - last); }
      for (let pass = 0; pass < 2; pass++) for (let k = 2 * N - 1, last = 1 << 30; k >= 0; k--) { const i = k % N; if (wet[i]) last = k; near[i] = Math.min(near[i], last - k); }
      for (let i = 0; i < N; i++) pts[i].under = near[i] > K;
    } else for (const p of pts) p.under = true;
    for (const p of pts) { p.tunnel = p.under; p.subway = p.under; }
    const defs = [];
    for (const s of STATIONS.filter((q) => q.line === sw.name)) {
      const X = s.at[0] * TILE, Y = s.at[1] * TILE;
      let best = -1, bd = NEAR;
      for (let i = 0; i < N; i++) { const d = Math.hypot(pts[i].x - X, pts[i].y - Y); if (d < bd) { bd = d; best = i; } }
      if (best >= 0) defs.push({ name: subwayName(s.name), x: pts[best].x, y: pts[best].y, i: best });
    }
    defs.sort((a, b) => a.i - b.i);
    out.push({ name: `${sw.name} (${way > 0 ? 'one way' : 'the other way'})`, service: sw.name, way, subway: sw.name, color: sw.color, pts, stations: defs.map(({ name, x, y }) => ({ name, x, y })), side: 1, hub: false, bores: [] });
  }
  return out;
}
