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
import { TILE, T } from './constants.js';
import { MAIN_LINE, MAIN_JUNCTIONS, SERVICES, STATIONS, RADIUS } from './world3-skeleton.js';
import { treeSize } from './felling.js';
import { cityRailUnder, STATION_OPEN } from './world3-city.js';
import { TOWNS3 } from './world3-towns.js';
import { MESA } from './world3-mesa.js';
import { GULCH, HOLLOW } from './world3-desert.js';

// ...and under the towns it passes through (Lucky Mesa, the towns' boxes; part 5's ruling: no level crossings in the
// towns), their stations' stretches but (STATION_OPEN). (The north coast's beach towns keep theirs: the train along
// their backs is the scenic route.)
const TOWN_BOXES = [...TOWNS3.map((t) => t.box), MESA.box, GULCH.box, HOLLOW.box].filter(Boolean);
const MAIN_AT = STATIONS.filter((q) => q.line === 'main').map((q) => q.at);
function townRailUnder(x, y) {
  if (!TOWN_BOXES.some(([x0, y0, x1, y1]) => x >= x0 - 6 && y >= y0 - 6 && x < x1 + 6 && y < y1 + 6)) return false;
  return !MAIN_AT.some(([sx, sy]) => (x - sx) * (x - sx) + (y - sy) * (y - sy) < STATION_OPEN * STATION_OPEN);
}

// The El (2026-10-17, the owner's RW1/RW2): the main line up on a steel viaduct over Midtown's Trestle Street (row y,
// tiles), its inclines between the portals (x0, x3: the track at ground level going under) and the full height (x1..x2).
// A point's `ez`: 0..1 of EL_Z (the deck's height, px: client/art2/game/chunkgeom.js EL_Z). Up at full height the track
// is `under` to the generator (nothing on the ground: no bed, no crossings - the streets pass beneath) and `elevated`;
// on the inclines it is at ground level (its bed reserved, no street crosses there) climbing on its ramp.
export const EL = { y: 1664, x0: 2931, x1: 2978, x2: 3592, x3: 3650 };
export function elAt(x, y) {
  if (Math.abs(y - EL.y) > 4 || x <= EL.x0 || x >= EL.x3) return 0;
  if (x < EL.x1) return (x - EL.x0) / (EL.x1 - EL.x0);
  if (x > EL.x2) return (EL.x3 - x) / (EL.x3 - EL.x2);
  return 1;
}
export const TRACK_OFF = 48;   // px from the main line's centre to each track's centre (the two 96 px apart: 3 tiles)
export const HUB_R = 20;       // tiles: every corner at a junction (H33: the hub stations there stand on straight track)
const SAMPLE = 8;              // px between a track's points (as today's railLine)
const ARC_STEP = 6;            // tiles between the points of an arc

const segByName = (n) => MAIN_LINE.find((l) => l.name === n);
const radiusOf = (seg) => seg.r || RADIUS.main;

// The control points of a service run one way, joined end to end (each junction once), with each corner's radius
// and the skeleton's stretches (tunnels, bridges) as control-point index pairs of the joined list. One way is the
// service's run as written (+1), the other the run reversed.
export function serviceRoute(service, way) {
  const run = way > 0 ? service.run : service.run.slice().reverse().map(([n, d]) => [n, -d]);
  const P = [], R = [], tunnels = [], bridges = [], elevated = [], segs = [];
  for (const [name, d] of run) {
    const seg = segByName(name), n = seg.pts.length;
    const pts = d > 0 ? seg.pts : seg.pts.slice().reverse();
    const base = P.length ? P.length - 1 : 0;   // the junction is the last point so far and this segment's first
    const idx = (i) => base + (d > 0 ? i : n - 1 - i);
    for (const [i, j] of seg.tunnels || []) { const a = idx(i), b = idx(j); tunnels.push(a < b ? [a, b] : [b, a]); }
    for (const [i, j] of seg.bridges || []) { const a = idx(i), b = idx(j); bridges.push(a < b ? [a, b] : [b, a]); }
    for (const [i, j] of seg.elevated || []) { const a = idx(i), b = idx(j); elevated.push(a < b ? [a, b] : [b, a]); }
    const r = radiusOf(seg);
    if (P.length) R[P.length - 1] = HUB_R;   // the junction's corner: tight, so the platforms either side stand on the straight
    for (let k = P.length ? 1 : 0; k < n; k++) { P.push(pts[k]); R.push(r); }
    segs.push({ name, way: d, from: base, to: base + n - 1 });
  }
  R[0] = HUB_R;   // (the closing corner is a junction too)
  return { P, R, tunnels, bridges, elevated, segs };
}

// A closed loop of control points (the first and the last the same junction) rounded at every corner, the closing
// one too: started half way along its first leg. Returns the sampled path (tiles) and where it passes each control
// point (distance along it), the stretches as distance ranges.
export function roundLoop(route) {
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
  return { pts: out, s, length: s[s.length - 1], tunnels: ranges(route.tunnels), bridges: ranges(route.bridges), elevated: ranges(route.elevated || []), ctl };
}

// One loop's track: points every SAMPLE px, offset TRACK_OFF to the right of the way it runs, in px; each with its
// distance along (s) and `under` in the skeleton's tunnels.
export function trackOf(path, main = false) {   // (main: the main line's - only it climbs onto the El)
  const P = path.pts, S = path.s, total = path.length * TILE, out = [];
  const inR = (list, s) => list.some(([a, b]) => s >= a && s <= b);
  let j = 1;
  for (let d = 0; d < total - 0.5; d += SAMPLE) {
    const s = d / TILE;
    while (j < P.length - 1 && S[j] < s) j++;
    const a = P[j - 1], b = P[j], L = S[j] - S[j - 1] || 1, w = (s - S[j - 1]) / L;
    const dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L;
    const x = (a[0] + (b[0] - a[0]) * w) * TILE - dy * TRACK_OFF, y = (a[1] + (b[1] - a[1]) * w) * TILE + dx * TRACK_OFF;
    // (World v3b's elevated stretch - the main line over Midtown's streets on a viaduct - is laid below ground, flagged
    // `elevated`, until the generator builds a rail viaduct over streets: so no street crosses it at grade)
    const mx = a[0] + (b[0] - a[0]) * w, my = a[1] + (b[1] - a[1]) * w, ez = main ? elAt(mx, my) : 0;
    // (the El: up on its viaduct - `under` to the generator - or on an incline at ground level; the rest of the skeleton's
    // `elevated` stretch, past the portals, is tunnel)
    if (ez >= 1) { out.push({ x, y, under: true, subway: false, tunnel: false, elevated: true, ez: 1 }); continue; }
    if (ez > 0) { out.push({ x, y, under: false, subway: false, tunnel: false, incline: true, ez: Math.round(ez * 1000) / 1000 }); continue; }
    // (and below ground through the city's districts but round the stations - world3-city.js cityRailUnder; a bridge stays one)
    const under = inR(path.tunnels, s) || inR(path.elevated || [], s) || (!inR(path.bridges, s) && (cityRailUnder(mx, my) || townRailUnder(mx, my)));
    out.push({ x, y, under, subway: false, tunnel: under });
  }
  let s = 0;
  for (let i = 0; i < out.length; i++) { if (i) s += Math.sqrt((out[i].x - out[i - 1].x) ** 2 + (out[i].y - out[i - 1].y) ** 2); out[i].s = s; }
  return out;
}

// The main line's loops: each service both ways - { name, service, way, pts (the track, px), stations: [{ name, x, y }]
// (its stops in px, in order), segs, side: 1 (its platforms on the right of the way it runs: the outer side) }.
// `junctions`: the four, in px (where the trains' signals guard).
export function mainLineLoops(m = null) {
  const loops = [];
  for (const sv of SERVICES) for (const way of [1, -1]) {
    const route = serviceRoute(sv, way), path = roundLoop(route), pts = trackOf(path, true);
    const stops = way > 0 ? sv.stops : sv.stops.slice().reverse();
    const stations = stops.map((name) => { const st = STATIONS.find((q) => q.line === 'main' && q.name === name); return { name, x: st.at[0] * TILE, y: st.at[1] * TILE }; });
    loops.push({ name: `${sv.name} (${way > 0 ? 'one way' : 'the other way'})`, service: sv.name, way, pts, stations, side: 1, segs: route.segs.map((g) => g.name + (g.way > 0 ? ' +' : ' -')), hub: true, bores: [] });
  }
  for (const l of loops) l.all = loops;   // (a hub station's platforms are placed clear of every loop's track: shared/map.js hubIndex)
  if (m) mountainBores(m, loops);
  return loops;
}

// The mountain tunnels (H33): a skeleton tunnel under dry, roadless ground is a bore through the hill - the track at
// ground level under shared/tunnels.js' cover (the hill drawn over it, its portals, sight blocked, the hill fading for
// whoever is inside: shared/map.js addRailBores); one under water or a town's streets stays below ground (`under`).
function mountainBores(m, loops) {
  const W = new Set([T.WATER, T.DEEP, T.BRIDGE, T.ROAD]);
  for (const l of loops) {
    const P = l.pts;
    let i = 0;
    while (i < P.length) {
      if (!P[i].under) { i++; continue; }
      let j = i; while (j + 1 < P.length && P[j + 1].under) j++;
      let dry = j - i > 8 && !cityRailUnder(P[(i + j) >> 1].x / TILE, P[(i + j) >> 1].y / TILE);   // (under the city it stays below ground: no hill over it)
      for (let k = i; k <= j && dry; k += 2) for (const [dx, dy] of [[0, 0], [-40, 0], [40, 0], [0, -40], [0, 40]]) if (W.has(m.tileAtPx(P[k].x + dx, P[k].y + dy))) { dry = false; break; }
      if (dry) { for (let k = i; k <= j; k++) { P[k].under = false; P[k].tunnel = false; P[k].bore = true; } l.bores.push({ s0: P[i].s, s1: P[j].s }); }
      i = j + 1;
    }
  }
}
export const mainJunctions = () => MAIN_JUNCTIONS.map((j) => ({ name: j.name, x: j.at[0] * TILE, y: j.at[1] * TILE }));

// The El's furniture (2026-10-17): where it stands for the server and both renderers - m.el = { y (its centre line,
// px), x0, x1, x2, x3 (px: the portals and the ends of its full height), Z (unused here: the art's EL_Z), piers: [x]
// (a steel bent every PIER_GAP px under the full-height deck, clear of the cross streets' roadways), stairs: [{ x, y,
// dir, station }] (a station's stair towers, foot on the pavement, the flight rising toward +dir along x) } - and its
// stations: up on the deck (`el`), boarded from the stair foot on the side of their track (eastbound south, westbound
// north). Their hub's map point moves to the south stairs and it has no house. Called from shared/world3-world.js'
// done hook, before the station houses are seated.
const PIER_GAP = 288, PIER_SPAN = 384;   // (the columns on the middle of Trestle Street's pavements, 192 px either side of its centre)
export function elFurniture(m, removeProps = null) {
  if (!m.rails) return null;
  const T0 = TILE, yc = (EL.y + 0.5) * T0;   // (the street's centre line; the deck's - the tracks' - is EL.y * TILE)
  const el = { y: EL.y * T0, py: yc, x0: EL.x0 * T0, x1: EL.x1 * T0, x2: EL.x2 * T0, x3: EL.x3 * T0, span: PIER_SPAN, piers: [], stairs: [] };
  // the piers: every PIER_GAP px, moved off any roadway crossing beneath (a column on the pavement, never in a lane)
  const lane = (x) => { for (const dy of [-PIER_SPAN / 2, PIER_SPAN / 2]) { const t = m.tileAtPx(x, yc + dy); if (t === T.ROAD) return true; } return false; };
  for (let x = el.x1 + 40; x < el.x2 - 20; x += PIER_GAP) {
    let px = x;
    for (let k = 0; k < 12 && lane(px); k++) px += 16;
    if (lane(px)) continue;
    el.piers.push(Math.round(px));
    for (const dy of [-PIER_SPAN / 2, PIER_SPAN / 2]) m.addSolidProp(px, yc + dy, 12);
  }
  // the stations up on it: the stair towers on the pavements either side, at the station's cross street
  const done = new Set();
  for (const r of m.rails) for (const st of r.stations || []) {
    if (elAt(st.x / T0, st.y / T0) < 1) continue;
    st.el = true; st.under = true;
    const south = st.y > el.y, key = st.name + (south ? 's' : 'n');
    // (the foot: south side east of the cross street, north side west of it; on the pavement's middle)
    const xs = Math.round(st.x / T0) * T0;
    let fx = xs + (south ? 220 : -220);
    for (let k = 0; k < 20 && m.tileAtPx(fx + (south ? 0 : 0), yc + (south ? 196 : -196)) === T.ROAD; k++) fx += south ? 16 : -16;
    const foot = { x: fx, y: yc + (south ? 196 : -196) };
    st.platform = foot;
    if (!done.has(key)) { done.add(key); el.stairs.push({ x: foot.x, y: foot.y, dir: south ? 1 : -1, station: st.name }); }
  }
  for (const h of m.railHubs || []) {
    if (elAt(h.x / T0, h.y / T0) < 1 && Math.abs(h.y - yc) > 400) continue;
    if (h.x < el.x1 || h.x > el.x2) continue;
    const s = el.stairs.find((q) => q.dir > 0) || el.stairs[0];
    if (!s) continue;
    h.el = true; h.x = s.x; h.y = s.y; h.bridges = [];
    const poi = m.pois[h.poi];
    if (poi) { poi.x = s.x; poi.y = s.y; }
  }
  // nothing tall under the deck: the trees and lamps the streets were dressed with along its line go
  if (removeProps) removeProps(m, (x, y) => x > el.x0 - 32 && x < el.x3 + 32 && Math.abs(y - el.y) < 150 && m.props.some((p) => p.x === x && p.y === y && /^(tree|palm|lamp)/.test(p.t)));
  m.el = el;
  return { piers: el.piers.length, stairs: el.stairs.length };
}

// (H35, 8.14) Each station's house on open ground: the house (140 x 92 px, its canopy toward the tracks, drawn by the
// renderers at the hub's place moved 18 px along `a`) where map.js buildRailHubs put it if it stands clear there, else
// the nearest spot round the platforms that is dry, off the roads, the buildings and 70 px off every track - facing away
// from the nearest track; its map point and its forecourt move with it. Called once, from the `done` hook.
const HOUSE_OK = new Set([T.GRASS, T.PLAZA, T.SIDEWALK, T.SAND, T.LOT, T.DIRT]);
export function seatStationHouses(m) {
  if (!m.railHubs) return 0;
  const C = 128, key = (cx, cy) => (cx + 8192) * 16384 + cy + 8192, cells = new Map();
  for (const r of m.rails) for (const p of r.pts) { if (p.under) continue; const k = key(Math.floor(p.x / C), Math.floor(p.y / C)); let a = cells.get(k); if (!a) cells.set(k, (a = [])); a.push(p); }
  const nearest = (x, y) => { let d = Infinity, q = null; const cx = Math.floor(x / C), cy = Math.floor(y / C); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const p of cells.get(key(cx + dx, cy + dy)) || []) { const e = Math.hypot(p.x - x, p.y - y); if (e < d) { d = e; q = p; } } return [d, q]; };
  // (the 16 px cells within about 70 px of a track: a house's corner may not stand in one)
  const S = 16, close = new Set(), sk = (x, y) => (Math.floor(x / S) + 32768) * 65536 + Math.floor(y / S) + 32768;
  for (const r of m.rails) for (let j = 0; j < r.pts.length; j += 2) { const p = r.pts[j]; if (p.under) continue; for (let dy = -80; dy <= 80; dy += S) for (let dx = -80; dx <= 80; dx += S) if (dx * dx + dy * dy <= 80 * 80) close.add(sk(p.x + dx, p.y + dy)); }
  // (World v3b's dense city: a plain building - no business, no home in it - may be cleared for the house: the third try)
  const busy = new Set();
  for (const p of m.pois) if (p.b !== undefined && p.b >= 0) busy.add(p.b);
  for (const hm of m.homes || []) if (hm && hm.b !== undefined) busy.add(hm.b);
  const clearable = (px, py) => { const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE); if (!m.inside(tx, ty) || m.tiles[m.idx(tx, ty)] !== T.BUILDING) return false; const b = m.buildings[m.bld[m.idx(tx, ty)]]; return !!b && !b.gone && !busy.has(b.id); };
  let clearing = false;
  const fits = (x, y, a, us = [-74, -37, 0, 37, 74]) => {
    const ux = Math.cos(a - Math.PI / 2), uy = Math.sin(a - Math.PI / 2), vx = Math.cos(a), vy = Math.sin(a);
    for (const u of us) for (const v of [-50, -2, 46]) {
      const px = x + ux * u + vx * v, py = y + uy * u + vy * v;
      if ((!HOUSE_OK.has(m.tileAtPx(px, py)) && !(clearing && clearable(px, py))) || close.has(sk(px, py))) return false;
    }
    return true;
  };
  // clear the plain buildings under a house's footprint (gone, their ground a plaza)
  const clearUnder = (x, y, a) => {
    const ux = Math.cos(a - Math.PI / 2), uy = Math.sin(a - Math.PI / 2), vx = Math.cos(a), vy = Math.sin(a);
    for (let u = -80; u <= 80; u += 8) for (let v = -56; v <= 52; v += 8) {
      const px = x + ux * u + vx * v, py = y + uy * u + vy * v, tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if (!m.inside(tx, ty) || m.tiles[m.idx(tx, ty)] !== T.BUILDING) continue;
      const b = m.buildings[m.bld[m.idx(tx, ty)]];
      if (!b || b.gone || busy.has(b.id)) continue;
      b.gone = true;
      if (b.roof >= 0 && m.roofs[b.roof]) m.roofs[b.roof].gone = true;
      if (b.prefab >= 0 && m.prefabs[b.prefab]) m.prefabs[b.prefab] = { ...m.prefabs[b.prefab], gone: true, tw: 0, th: 0 };
      for (let yy = b.ty; yy < b.ty + b.th; yy++) for (let xx = b.tx; xx < b.tx + b.tw; xx++) { m.set(xx, yy, T.PLAZA); m.bld[m.idx(xx, yy)] = -1; }
    }
  };
  let moved = 0;
  for (const h of m.railHubs) {
    if (h.el) continue;   // (up on the El: no house - its stair towers, elFurniture)
    const cx = h.x + Math.cos(h.a) * 18, cy = h.y + Math.sin(h.a) * 18;
    if (fits(cx, cy, h.a)) continue;
    // (the whole house; failing that - a dense block - its middle at least on open ground; every platform within 560 px)
    const plats = h.calls.map(([ri, si]) => m.rails[ri].stations[si].platform).filter(Boolean);
    // (a station whose track is below ground all round it - Midtown's, on the elevated stretch laid below ground - has no
    // surface track to face away from: its house faces away from the station's own place)
    const [d0, q0] = nearest(h.x, h.y), sunk = !q0 || d0 > 500;
    let best = null;
    for (const [us, clr] of [[undefined, false], [[0], false], [undefined, true]]) for (let r = clr ? 0 : 60; r <= 900 && !best; r += 20) for (let k = 0; k < 64 && !best; k++) {
      clearing = clr;
      const x = h.x + Math.cos(k / 64 * Math.PI * 2) * r, y = h.y + Math.sin(k / 64 * Math.PI * 2) * r;
      if ((!HOUSE_OK.has(m.tileAtPx(x, y)) && !(clr && clearable(x, y))) || close.has(sk(x, y))) continue;
      const [d, q1] = nearest(x, y), q = q1 && d <= 500 ? q1 : sunk ? h : null;
      if (!q) continue;
      const a = Math.atan2(y - q.y, x - q.x);
      const hx = x - Math.cos(a) * 18, hy = y - Math.sin(a) * 18;
      if (plats.some((p) => Math.hypot(p.x - hx, p.y - hy) > 560)) continue;
      if (fits(x, y, a, us)) best = { x: hx, y: hy, a, clr, cx: x, cy: y };
    }
    clearing = false;
    if (!best) continue;
    if (best.clr) clearUnder(best.cx, best.cy, best.a);
    h.x = Math.round(best.x); h.y = Math.round(best.y); h.a = best.a; h.moved = true; moved++;
    const poi = m.pois[h.poi];
    if (poi) { poi.x = h.x; poi.y = h.y; }
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {   // its forecourt
      const tx = Math.floor(h.x / TILE) + dx, ty = Math.floor(h.y / TILE) + dy, t = m.tileAt(tx, ty);
      if (m.inside(tx, ty) && (t === T.GRASS || t === T.SAND || t === T.LOT || t === T.DIRT) && !close.has(sk((tx + 0.5) * TILE, (ty + 0.5) * TILE))) m.set(tx, ty, T.PLAZA);
    }
  }
  return moved;
}

// (H35, 8.14) The dressing cleared round the main line's bed and platforms: the build only kept props 46 px off the
// track (map.js clearPropsOnRail), so a redwood's crown hung over the track and the platforms. A tree stays CROWN px
// (by its size, felling.js treeSize) off the track - and off a platform's far edge beside a platform - and nothing but
// a lamp stands on a platform. A bore's and a tunnel's track is under cover: what grows on top stays.
// Called once, from shared/world3-world.js' `done` hook, with map.js removeProps.
const CROWN = [0, 70, 90, 120, 150];
export function clearRailDressing(m, removeProps) {
  const out = { trees: 0, platform: 0 };
  if (!m.rails || !removeProps) return out;
  const C = 256, key = (cx, cy) => (cx + 4096) * 8192 + cy + 4096, cells = new Map(), near = new Set();
  for (const r of m.rails) for (const p of r.pts) {
    if (p.under || p.bore) continue;
    const cx = Math.floor(p.x / C), cy = Math.floor(p.y / C), k = key(cx, cy);
    let a = cells.get(k); if (!a) cells.set(k, (a = [])); a.push(p);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.add(key(cx + dx, cy + dy));
  }
  const sts = [];
  for (const r of m.rails) for (const st of r.stations || []) if (!st.under) sts.push(st);
  const gone = new Set(), houses = (m.railHubs || []).map((h) => [h.x + Math.cos(h.a) * 18, h.y + Math.sin(h.a) * 18]);
  for (const pr of m.props) {
    const cx = Math.floor(pr.x / C), cy = Math.floor(pr.y / C);
    if (!near.has(key(cx, cy)) || pr.t === 'lamp') continue;
    const size = treeSize(pr);
    // (the station house: nothing on it, no crown over it)
    if (houses.some(([x, y]) => Math.hypot(pr.x - x, pr.y - y) < 84 + (size ? CROWN[size] * 0.7 : 0))) { gone.add(pr.x + ',' + pr.y); out.house = (out.house || 0) + 1; continue; }
    let d = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const p of cells.get(key(cx + dx, cy + dy)) || []) { const e = Math.hypot(p.x - pr.x, p.y - pr.y); if (e < d) d = e; }
    if (d > 300) continue;
    // on a platform, or beside one (its span along the track and a little past either end, on its side)?
    let plat = false, by = false;
    for (const st of sts) {
      const dx = pr.x - st.x, dy = pr.y - st.y;
      if (Math.abs(dx) > 500 || Math.abs(dy) > 500) continue;
      const along = dx * Math.cos(st.a) + dy * Math.sin(st.a), across = (-dx * Math.sin(st.a) + dy * Math.cos(st.a)) * (st.side || 1), L = st.half || 112;
      if (Math.abs(along) < L + 16 && across > (st.inner || 40) - 8 && across < (st.outer || 104) + 16) plat = true;
      if (Math.abs(along) < L + 120 && across > 0) by = true;
    }
    if (plat) { gone.add(pr.x + ',' + pr.y); out.platform++; continue; }
    if (size && d < CROWN[size] + (by ? 104 : 24)) { gone.add(pr.x + ',' + pr.y); out.trees++; }
  }
  if (gone.size) removeProps(m, (x, y) => gone.has(x + ',' + y));
  return out;
}
