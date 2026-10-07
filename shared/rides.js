// Rides: the Ferris wheel on Westport Pier, hot-air balloon flights from the Dry Creek Balloon Field and the water
// slides at Splash Bay. server/systems/rides.js sells the tickets and carries the riders; the client draws the
// wheel's cabs going round, the balloons in the air and the sliders (client/art2/game/host.js) and points the
// rider's camera (client/main.js). Everything here is a pure function of the map and the clock, so the server, the
// rider's camera and everyone watching agree on where a cab, a balloon or a slider is.
//   - The wheel turns all the time, once round every FERRIS_S on the world's loop clock. You step into the cab at
//     the bottom (ferrisBoardCab) and ride it once round.
//   - A flight fills and lifts off at the field's launch spot, drifts out over the country on one of the routes
//     (balloonRoutes: the orchard, the vineyard and the old mission; the market, Willow Lake and the falls; the
//     pastures and the wind farm) and comes down where it took off. balloonAt says where it is t seconds in.
//   - A slide: up the tower's stair, along its top deck to the slide's bay, and down it into the splash pool
//     (slideRider says where you are t seconds after boarding; slideDur how long it all takes).
import { FERRIS_S } from './rules.js';

const TAU = Math.PI * 2;

// The wheel, as the art draws it (client/art2/props-park.js ferrisWheel, standing on the pier's deck 4 px up): the
// hub's height, the rim's radius, the cabs round it - each hangs `hang` px under its point on the rim, its floor
// `floor` px under that - and the cab colours in turn.
export const FERRIS = { lift: 4, hubZ: 136, r: 98, n: 16, hang: 14, floor: 6, cols: 4 };
export const BALLOON_ALT = 280;          // cruising height (world px; the field's tethered balloon flies at 230)
const LIFT_S = 7, LAND_S = 9;            // straight up after lift-off, straight down before touch-down
const EASE = 0.14;                       // ...and the drift eases in and out over this much of the way

// The pier's wheel { x, y, board } and the balloon field { launch, board } (shared/naturesites.js), or null.
export function ferrisSite(map) {
  if (map._ferrisSite === undefined) {
    const s = (map.natureSites || []).find((q) => q.kind === 'pier' && q.ferris);
    Object.defineProperty(map, '_ferrisSite', { value: s ? s.ferris : null, enumerable: false, configurable: true });
  }
  return map._ferrisSite;
}
export function balloonSite(map) {
  if (map._balloonSite === undefined) {
    const s = (map.natureSites || []).find((q) => q.kind === 'balloons' && q.launch && q.board);
    Object.defineProperty(map, '_balloonSite', { value: s || null, enumerable: false, configurable: true });
  }
  return map._balloonSite;
}

// ---- the Ferris wheel ---------------------------------------------------------------------------------------------
// The angle of cab k round the wheel at loop time t: 0 level with the hub on the east side, pi/2 the top.
export function ferrisCabAngle(k, t) { return ((k + 0.5) / FERRIS.n + t / FERRIS_S) * TAU; }
// The cab at the bottom at loop time t (the one you step into).
export function ferrisBoardCab(t) {
  let best = 0, bd = 9;
  for (let k = 0; k < FERRIS.n; k++) {
    const a = ferrisCabAngle(k, t) + Math.PI / 2, d = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
// Where cab k is at loop time t: the ground point under it (x; y is the wheel's plane) and the height of its floor.
export function ferrisCab(wheel, k, t, out = {}) {
  const a = ferrisCabAngle(k, t);
  out.x = wheel.x + Math.cos(a) * FERRIS.r;
  out.y = wheel.y;
  out.z = FERRIS.lift + FERRIS.hubZ + Math.sin(a) * FERRIS.r - FERRIS.hang - FERRIS.floor;
  out.a = a;
  return out;
}

// ---- balloon flights ----------------------------------------------------------------------------------------------
// The routes: places to drift over, by name (a landmark's middle or a designed place's spot), out from the launch
// spot and back to it; any the map doesn't have are left out, and a route needs two.
const ROUTES = [
  { name: 'the orchard, the vineyard and the old mission', via: ['Willow River Orchard', 'Willow River Vineyard', 'Old Mission Ruins', 'Sunfield Solar Farm'] },
  { name: 'the old town market, Willow Lake and the falls', via: ['Willow River Orchard', 'Old Town Market', 'Willow Lake', 'Willow River Falls'] },
  { name: 'the pastures and the wind farm', via: ['Dry Creek Farm Co-op Pasture', 'Dry Creek Wind Farm'] },
];
const SAMPLES = 20;                      // points per stretch of the smoothed route

function placeNamed(map, name) {
  const l = (map.landmarks || []).find((q) => q.name === name);
  if (l) return [l.x + (l.w || 0) / 2, l.y + (l.h || 0) / 2];
  const s = (map.natureSites || []).find((q) => q.name === name);
  return s ? [s.x, s.y] : null;
}

// A closed Catmull-Rom curve through the points (the launch spot first), sampled into a polyline.
function smoothLoop(P) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < SAMPLES; k++) {
      const t = k / SAMPLES, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]));
    }
  }
  out.push(P[0][0], P[0][1]);
  return out;
}

// [{ name, pts: [x0, y0, x1, y1, ...], cum: [arc length at each point], len }] for this map (made once).
export function balloonRoutes(map) {
  if (map._balloonRoutes) return map._balloonRoutes;
  const site = balloonSite(map), routes = [];
  if (site) {
    for (const r of ROUTES) {
      const via = r.via.map((n) => placeNamed(map, n)).filter(Boolean);
      if (via.length < 2) continue;
      const pts = smoothLoop([[site.launch.x, site.launch.y], ...via]), cum = [0];
      for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
      routes.push({ name: r.name, pts, cum, len: cum[cum.length - 1] });
    }
  }
  Object.defineProperty(map, '_balloonRoutes', { value: routes, enumerable: false, configurable: true });
  return routes;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
// how far along the route (0..1) at s of the drifting time: eased in and out, steady in between
function along(s) {
  s = clamp01(s);
  const k = 2 * EASE * (1 - EASE);
  if (s < EASE) return (s * s) / k;
  if (s > 1 - EASE) return 1 - ((1 - s) * (1 - s)) / k;
  return (s - EASE / 2) / (1 - EASE);
}

// Where a flight on this route is t seconds after lift-off (dur: take-off to touch-down): the ground point under the
// basket (x, y), the basket's height z, and whether it's down (on the ground: filling or emptying).
export function balloonAt(route, t, dur, out = {}) {
  const u = along((t - LIFT_S) / Math.max(1, dur - LIFT_S - LAND_S)) * route.len, cum = route.cum, pts = route.pts;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= u) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1, f = clamp01((u - cum[lo]) / seg);
  out.x = pts[lo * 2] + (pts[hi * 2] - pts[lo * 2]) * f;
  out.y = pts[lo * 2 + 1] + (pts[hi * 2 + 1] - pts[lo * 2 + 1]) * f;
  const up = Math.min(smoothstep(t / 18), smoothstep((dur - t) / 20));
  out.z = BALLOON_ALT * up + Math.sin(t * 0.7) * 5 * up;
  out.down = t <= 0 || t >= dur;
  return out;
}

// ---- the Splash Bay water slides ----------------------------------------------------------------------------------
// The slides as the art builds them (client/art2/props-park.js waterSlide: from the tower's top deck at (x, y), z up,
// a channel swinging out in an S and down to (x + dx, y + len) in its splash pool), and the stair up the tower's east
// side (slideTower: three flights, the first from the north end, turning at each landing). Down an open flume you
// lie on your back, feet first; in the tube you're out of sight.
export const SLIDE = { wig: 34, ride: 4.2, walk: 72 };   // the S's swing (px), the time down (s), the climb's pace (px/s)
const STAIR_X = 48, TOP_Z = 84;                           // the stair's middle, east of the tower's; the top deck

// The water park { tower, board, slides: [{ x, y, dx, len, z, kind, name }] } (shared/naturesites.js), or null.
export function slideSite(map) {
  if (map._slideSite === undefined) {
    const s = (map.natureSites || []).find((q) => q.kind === 'waterpark' && q.slides && q.board);
    Object.defineProperty(map, '_slideSite', { value: s || null, enumerable: false, configurable: true });
  }
  return map._slideSite;
}

// Where on slide sl at t (0 its top, 1 the splash pool): the ground point (x, y), the height of its floor (z), and
// the way down (a: the heading of the path there).
export function slideAt(sl, t, out = {}) {
  t = clamp01(t);
  const w = SLIDE.wig, s = t * t * (3 - 2 * t), sn = Math.sin(t * TAU), k = 1 - t * 0.3;
  out.x = sl.x + sl.dx * s + w * sn * k;
  out.y = sl.y + t * sl.len;
  out.z = t > 0.9 ? 3 : 3 + (sl.z - 3) * (1 - t / 0.9);
  out.a = Math.atan2(sl.len, sl.dx * 6 * t * (1 - t) + w * (TAU * Math.cos(t * TAU) * k - 0.3 * sn));
  return out;
}

// The walk up to slide k: [x, y, z] corners from the boarding point round to the foot of the stair, up its three
// flights, along the top deck's front to the slide's bay, and the distance walked at each (made once per slide).
const climbs = new WeakMap();
function climb(site, k) {
  let c = climbs.get(site);
  if (!c) climbs.set(site, (c = []));
  if (c[k]) return c[k];
  const T = site.tower, b = site.board, sl = site.slides[k], X = T.x + STAIR_X, yN = T.y - 54, yS = T.y - 9;
  const pts = [[b.x, b.y, 0], [T.x + 70, yN - 2, 0], [X, yN - 2, 0], [X, yS, 28], [X, yN + 2, 56], [X, yS, TOP_Z], [sl.x, T.y - 4, TOP_Z], [sl.x, sl.y, TOP_Z]];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) { const [x0, y0, z0] = pts[i - 1], [x1, y1, z1] = pts[i]; cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0, z1 - z0)); }
  return (c[k] = { pts, cum, len: cum[cum.length - 1] });
}
// How long the climb to slide k takes, and the whole ride (boarding to the splash).
export const slideClimbS = (site, k) => climb(site, k).len / SLIDE.walk;
export const slideDur = (site, k) => slideClimbS(site, k) + SLIDE.ride;
// how far down (0..1) tau seconds after pushing off: slow away from the top, quicker all the way to the pool
const downAt = (tau) => Math.pow(clamp01(tau / SLIDE.ride), 1.3);

// Where a rider on slide k is t seconds after boarding: the ground point (x, y), the height they're at (z: the step
// or the deck under their feet, the floor of the slide), the heading they're drawn at (a: where they're walking; on
// the slide, head back up it - feet first), and climbing (phase 0; dist: how far walked, for the stride) or sliding
// (phase 1; at: how far down, 0..1).
export function slideRider(site, k, t, out = {}) {
  const c = climb(site, k), up = c.len / SLIDE.walk;
  if (t < up) {
    const d = Math.max(0, t) * SLIDE.walk, cum = c.cum;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const a = c.pts[i - 1], b = c.pts[i], f = clamp01((d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1));
    out.x = a[0] + (b[0] - a[0]) * f; out.y = a[1] + (b[1] - a[1]) * f; out.z = a[2] + (b[2] - a[2]) * f;
    out.a = Math.atan2(b[1] - a[1], b[0] - a[0]);
    out.phase = 0; out.dist = d; out.at = 0;
    return out;
  }
  const u = downAt(t - up);
  slideAt(site.slides[k], u, out);
  out.a += Math.PI;
  out.phase = 1; out.dist = 0; out.at = u;
  return out;
}
