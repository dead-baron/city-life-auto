// World v3's passes of the generator (docs/WORLD-V3.md 8.23): what only v3 builds reach, moved out of shared/map.js so the
// city worker's fallback generator (client/worldgen.js: it builds today's world when the server can't serve it) doesn't
// carry it. Registered with map.js (setWorld3Passes) when this module is imported - shared/world3-islands.js imports it,
// as every v3 build imports that - the way world3-islands.js registers the island builds (setIslandBuilds).
// - quays: World v3's container quays and Port Westport's container port (8.5; opts.quays)
// - rails: the main line's loops, each its own rail, their level crossings once each, the stations as one (the hubs),
//   the switches (8.10, 8.10.1; opts.rails)
// - hubIndex: a station's place on one of the loops (stationIndex in map.js asks it for a loop with `hub`)
// - bores: the main line's bores through the mountains (8.10.1)
// The code is map.js's as it was (2026-10-11, H49): the worlds it builds are the same to the bit.
import { T, TILE } from './constants.js';
import { CROSSING_ARM } from './mapcore.js';
import { coverAtPx, TUNNEL_WALL } from './tunnels.js';
import { setWorld3Passes, PLATFORM_HALF } from './map.js';

// (map.js's own, handed over at registration)
let addProp, clearArea, simpleBuilding, buildRailway, markUnderpasses, underpassed, PLATFORM_IN, PLATFORM_OUT;

// (World v3) each loop its own rail; m.rail the first
function rails(m, railLines) {
  m.rails = railLines.map((line) => buildRailway(m, line.pts, line)); m.rail = m.rails[0];
  // the level crossings of all the loops, once each (two loops on one track cross a road at one crossing): `uses` the
  // loops and where along each; a loop's crossing knows its own (xi) - the gates' states are by this list
  // the double track's two crossings of a road are one: its gates outside both tracks (`arm`, from the middle)
  m.railXings = [];
  const pair = (o, c) => { const dx = c.x - o.x, dy = c.y - o.y, tx = Math.cos(o.a), ty = Math.sin(o.a), across = Math.abs(-dx * ty + dy * tx), along = Math.abs(dx * tx + dy * ty); return Math.abs(Math.sin(c.a - o.a)) < 0.2 && along < 40 && across > 60 && across < 130 ? across : 0; };
  m.rails.forEach((r, ri) => r.crossings.forEach((c) => {
    let xi = m.railXings.findIndex((o) => Math.hypot(o.x0 - c.x, o.y0 - c.y) < 24 || (o.x1 !== undefined && Math.hypot(o.x1 - c.x, o.y1 - c.y) < 24));
    if (xi < 0) {
      xi = m.railXings.findIndex((o) => o.x1 === undefined && pair(o, c));
      if (xi >= 0) { const o = m.railXings[xi], d = pair(o, c); o.x1 = c.x; o.y1 = c.y; o.x = (o.x0 + c.x) / 2; o.y = (o.y0 + c.y) / 2; o.arm = CROSSING_ARM + d / 2; o.hw = Math.max(o.hw, c.hw); }
    }
    if (xi < 0) { xi = m.railXings.length; m.railXings.push({ x: c.x, y: c.y, x0: c.x, y0: c.y, a: c.a, hw: c.hw, s: c.s, uses: [] }); }
    m.railXings[xi].uses.push([ri, c.s]); c.xi = xi;
  }));
  roadOfCrossings(m);   // (2026-10-15: the road each crosses - its gates go across it)
  buildRailHubs(m);   // (H33: one station per name - its building, its one map point, the services calling)
  railSwitches(m);    // (H33: the turnouts and the diamonds where the loops' tracks part and cross)
}
// (2026-10-15, the owner: "the crossing guards come down almost parallel to the street instead of across it") Each level
// crossing's road: `ra` its heading where it crosses (the way that leads from the gates on the tracks' left, -r, to
// those on their right, +r: r = (-sin a, cos a)) and `rw` its half width (px). The gates stand across the road, one each
// side of the tracks `arm` px off their middle (mapcore.js crossingGates: the server's and both renderers' geometry).
function roadOfCrossings(m) {
  for (const c of m.railXings) {
    const rx = -Math.sin(c.a), ry = Math.cos(c.a);
    let bd = Infinity, best = null;
    for (const e of m.edges) {
      if (e.lvl !== 0 || e.kind === 'hwy' || e.kind === 'ramp') continue;
      const P = e.pts;
      if (Math.abs(P[0].x - c.x) > e.len + 200 && Math.abs(P[P.length - 1].x - c.x) > e.len + 200) continue;
      for (let k = 0; k + 1 < P.length; k++) {
        const a = P[k], b = P[k + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        if (!l2) continue;
        const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2)), d = Math.hypot(a.x + dx * t - c.x, a.y + dy * t - c.y);
        if (d < bd) { bd = d; const l = Math.sqrt(l2); best = { e, ux: dx / l, uy: dy / l }; }
      }
    }
    if (!best || bd > 160) continue;
    const sg = best.ux * rx + best.uy * ry < 0 ? -1 : 1;
    c.ra = Math.atan2(best.uy * sg, best.ux * sg); c.rw = best.e.hw;
  }
}
// (H33) A station's place on one of World v3's loops: worked out once per station for every loop calling there
// (hubPlan), so loops on one track stop at one platform and the two tracks' platforms stand side by side.
const hubPlans = new WeakMap();   // (the list of loops -> station name -> loop -> its point)
function hubIndex(m, line, name, sx, sy) {
  const all = line.all || [line];
  let plans = hubPlans.get(all);
  if (!plans) hubPlans.set(all, (plans = new Map()));
  if (!plans.has(name)) {
    for (const l of all) if (!underpassed.has(l)) { markUnderpasses(m, l.pts); underpassed.add(l); }   // (every loop's underpasses known first)
    plans.set(name, hubPlan(m, all.filter((l) => l.stations.some((st) => st.name === name)), all, sx, sy));
  }
  return plans.get(name).get(line);
}
// Each calling loop's candidates: its points near the station's spot (the skeleton's) where a whole platform stands on
// straight track, off the bores and tunnels, its outer side clear of every other loop's track (cost: the distance, and
// a street under the platform 1000 px). Then each loop takes the cheapest - preferring a spot another loop already stops
// at on the same track (one platform for both), or facing one across the double track (side by side).
function hubPlan(m, calling, all, sx, sy) {
  const R = 4000, CELL = 64, half = Math.ceil((PLATFORM_HALF + 8) / 8);
  const key = (x, y) => (Math.floor(x / CELL) + 8192) * 16384 + Math.floor(y / CELL) + 8192;
  const grid = (list) => { const g = new Map(); for (const p of list) if (Math.abs(p.x - sx) < R + 600 && Math.abs(p.y - sy) < R + 600) { const k = key(p.x, p.y); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(p); } return g; };
  const near = (g, x, y, r) => { for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 1; cy++) for (const p of g.get(key(x + cx * CELL, y + cy * CELL)) || []) if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r && Math.hypot(p.x - x, p.y - y) < r) return p; return null; };
  const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const info = calling.map((line) => {
    const pts = line.pts, n = pts.length, mine = grid(pts), others = grid(all.filter((o) => o !== line).flatMap((o) => o.pts));
    const head = (i) => { const p = pts[(i + n) % n], q = pts[(i + 1 + n) % n]; return Math.atan2(q.y - p.y, q.x - p.x); };
    const road = (p) => { for (const [dx, dy] of [[0, 0], [-24, 0], [24, 0], [0, -24], [0, 24]]) { const tx = Math.floor((p.x + dx) / TILE), ty = Math.floor((p.y + dy) / TILE), t = m.tileAt(tx, ty); if (t === T.ROAD || (t === T.BRIDGE && m.roadAxis[ty * m.w + tx])) return 1; } return 0; };
    const cand = [];
    for (let i = 0; i < n; i++) { const d = Math.hypot(pts[i].x - sx, pts[i].y - sy); if (d < R) cand.push([d, i]); }
    cand.sort((a, b) => a[0] - b[0]);
    const ok = [];
    let nearest = cand.length ? cand[0][1] : 0;
    for (const [d, c] of cand) {
      if (ok.length >= 640) break;
      if (turn(head(c - half), head(c)) > 0.05 || turn(head(c), head(c + half)) > 0.05) continue;
      let fine = true, roads = 0;
      for (let k = -half; k <= half && fine; k++) { const p = pts[(c + k + n) % n]; if (p.under || p.bore) fine = false; else if (!(k & 3)) roads += road(p); }
      // the platform's strip (and a little beyond): no other loop's track over it, unless it is this loop's own track
      for (let k = -half; k <= half && fine; k += 2) {
        const p = pts[(c + k + n) % n], a = head(c + k), nx = -Math.sin(a) * line.side, ny = Math.cos(a) * line.side;
        for (let off = PLATFORM_IN - 8; off <= PLATFORM_OUT + 24 && fine; off += 16) {
          const q = near(others, p.x + nx * off, p.y + ny * off, 36);
          if (q && !near(mine, q.x, q.y, 6)) fine = false;
        }
      }
      if (fine) ok.push({ i: c, x: pts[c].x, y: pts[c].y, a: head(c), cost: d + roads * 1000 });
    }
    return { line, ok, nearest };
  });
  const pick = new Map();
  for (const q of info) pick.set(q.line, q.ok.length ? q.ok.reduce((a, b) => (b.cost < a.cost ? b : a)) : null);
  for (let round = 0; round < 3; round++) for (const q of info) {
    let best = pick.get(q.line), bc = Infinity;
    for (const c of q.ok) {
      let bonus = 0;
      for (const [o, p] of pick) {
        if (o === q.line || !p) continue;
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < 10) bonus = Math.max(bonus, 2500);   // the same platform
        else if (Math.abs(d - 2 * 48) < 10 && turn(p.a, c.a + Math.PI) < 0.1) bonus = Math.max(bonus, 1500);   // facing it
      }
      if (c.cost - bonus < bc) { bc = c.cost - bonus; best = c; }
    }
    pick.set(q.line, best);
  }
  const out = new Map();
  for (const q of info) out.set(q.line, pick.get(q.line) ? pick.get(q.line).i : q.nearest);
  return out;
}
// The tiles of a station house's forecourt round its spot h (h.a: the way it faces, out from the track). Where the track
// runs along the grid, the block of (2·du + 1) by (2·dv + 1) tiles round it, as ever; where it runs at an angle, the
// tiles whose middles lie in that much turned with the house - du along the track, dv out from it (the owner, 10-16:
// "Stations at an angle look awkward": the square forecourt stood askew of its house and platforms).
export function stationForecourt(h, du, dv) {
  const out = [], tx0 = Math.floor(h.x / TILE), ty0 = Math.floor(h.y / TILE);
  if (!offAxis(h.a)) {
    for (let dy = -dv; dy <= dv; dy++) for (let dx = -du; dx <= du; dx++) out.push([tx0 + dx, ty0 + dy]);
    return out;
  }
  const ux = -Math.sin(h.a), uy = Math.cos(h.a), vx = Math.cos(h.a), vy = Math.sin(h.a), U = (du + 0.5) * TILE, V = (dv + 0.5) * TILE, r = du + dv + 2;
  for (let ty = ty0 - r; ty <= ty0 + r; ty++) for (let tx = tx0 - r; tx <= tx0 + r; tx++) {
    const dx = (tx + 0.5) * TILE - h.x, dy = (ty + 0.5) * TILE - h.y;
    if (Math.abs(dx * ux + dy * uy) <= U && Math.abs(dx * vx + dy * vy) <= V) out.push([tx, ty]);
  }
  return out;
}
// a track (or a house facing out from it) at an angle to the grid: more than 4 degrees off it
export const offAxis = (a) => Math.abs(Math.sin(2 * a)) > 0.14;

// (H33) World v3's stations, one per name: every loop's platform there (side by side on the straight), its one map point
// moved to the station's building - behind the platform nearest the middle of them all, on the outer side - and the
// services calling there: m.railHubs [{ name, poi, x, y, a (the building's facing), services, calls [[loop, station]],
// bridges [{ x, y, a, len }] (the footbridges across the tracks between platforms that face each other) }].
function buildRailHubs(m) {
  const by = new Map();
  m.rails.forEach((r, ri) => !r.subway && r.stations.forEach((st, si) => {   // (the subway lines' stops are their own, not the main line's hubs)
    let h = by.get(st.name);
    if (!h) by.set(st.name, (h = { name: st.name, poi: st.poi, calls: [], services: [], bridges: [] }));
    h.calls.push([ri, si]); st.poi = h.poi;
    if (!h.services.includes(m.rails[ri].service)) h.services.push(m.rails[ri].service);
  }));
  m.railHubs = [];
  for (const h of by.values()) {
    const all = h.calls.map(([ri, si]) => m.rails[ri].stations[si]), sts = all.some((st) => !st.under) ? all.filter((st) => !st.under) : all;
    const mx = sts.reduce((a, st) => a + st.platform.x, 0) / sts.length, my = sts.reduce((a, st) => a + st.platform.y, 0) / sts.length;
    let pick = null, pd = Infinity;
    for (const st of sts) for (const off of [56, 116, 176, 236]) {   // (behind the platform; further back off a pier, a quay)
      const nx = -Math.sin(st.a) * st.side, ny = Math.cos(st.a) * st.side, x = st.x + nx * (PLATFORM_OUT + off), y = st.y + ny * (PLATFORM_OUT + off), t = m.tileAtPx(x, y);
      const d = Math.hypot(x - mx, y - my) + off + (t === T.ROAD || t === T.BUILDING || t === T.WALL || t === T.WATER || t === T.DEEP || t === T.BRIDGE || t === T.DOCK ? 5000 : 0);
      if (d < pd) { pd = d; pick = { x, y, a: Math.atan2(ny, nx) }; }
    }
    // (2026-10-15) the station's planned spot - facing its street and car park (shared/world3-stations.js) - when it is by
    // the platforms
    const plan = m.world3 && m.world3.stations && m.world3.stations.find((q) => `${q.name} Station` === h.name && q.house);
    if (plan && Math.hypot(plan.house.x - mx, plan.house.y - my) < 700) pick = { x: plan.house.x, y: plan.house.y, a: plan.house.a };
    h.x = Math.round(pick.x); h.y = Math.round(pick.y); h.a = pick.a;
    // its forecourt (turned with the house where the track runs at an angle: stationForecourt)
    for (const [tx, ty] of stationForecourt(h, 3, 2)) {
      const t = m.tileAt(tx, ty);
      if (!m.inside(tx, ty) || (m.reserve[m.idx(tx, ty)] & 2 && Math.hypot((tx + 0.5) * TILE - h.x, (ty + 0.5) * TILE - h.y) > 70)) continue;
      if (t === T.GRASS || t === T.SAND || t === T.LOT || t === T.SIDEWALK) m.set(tx, ty, T.PLAZA);   // (not the ballast: DIRT)
    }
    const poi = m.pois[h.poi];
    poi.x = h.x; poi.y = h.y; poi.services = h.services.slice();
    // the footbridges: between two platforms facing each other across the double track (one per pair)
    for (let i = 0; i < sts.length; i++) for (let j = i + 1; j < sts.length; j++) {
      const a = sts[i].platform, b = sts[j].platform, d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 60 || d > 360) continue;
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      if (h.bridges.some((f) => Math.hypot(f.x - x, f.y - y) < 120)) continue;
      h.bridges.push({ x: Math.round(x), y: Math.round(y), a: Math.atan2(b.y - a.y, b.x - a.x), len: Math.round(d + 40) });
    }
    m.railHubs.push(h);
  }
}
// (H33) Where World v3's loops' tracks part (a turnout: the points where one leaves another, the frog where its rail
// crosses the other's) and cross (a diamond): m.railSwitches [{ kind: 'turnout' | 'diamond', x, y, a (the through
// track's heading), b (the other's), fx, fy (a turnout's frog) }], once each.
function railSwitches(m) {
  const CELL = 64, key = (x, y) => (Math.floor(x / CELL) + 8192) * 16384 + Math.floor(y / CELL) + 8192;
  const grids = m.rails.map((r) => { const g = new Map(); r.pts.forEach((p, i) => { const k = key(p.x, p.y); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(i); }); return g; });
  // (the distance to another loop's track itself - its segments either side of its nearest point - and that point)
  const seg = (P, i, x, y) => { const n = P.length, a = P[i], b = P[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1; let t = ((x - a.x) * dx + (y - a.y) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(a.x + dx * t - x, a.y + dy * t - y); };
  const nearest = (ri, x, y) => { let bd = Infinity, bi = -1; const P = m.rails[ri].pts; for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 1; cy++) for (const i of grids[ri].get(key(x + cx * CELL, y + cy * CELL)) || []) { const d = Math.hypot(P[i].x - x, P[i].y - y); if (d < bd) { bd = d; bi = i; } } return bi < 0 ? [bd, bi] : [Math.min(seg(P, bi, x, y), seg(P, (bi - 1 + P.length) % P.length, x, y)), bi]; };
  const out = [], seen = (x, y) => out.some((o) => Math.hypot(o.x - x, o.y - y) < 48);
  const hd = (P, i) => { const n = P.length, p = P[(i - 1 + n) % n], q = P[(i + 1) % n]; return Math.atan2(q.y - p.y, q.x - p.x); };
  m.rails.forEach((r, ri) => {
    const P = r.pts, n = P.length;
    m.rails.forEach((o, oi) => {
      if (oi === ri || r.subway || o.subway) return;   // (World v3's subway lines: below ground where they meet the main line, no switches)
      let prev = Infinity;
      for (let i = 0; i < n; i++) {
        if (P[i].under) { prev = Infinity; continue; }
        const [d, j] = nearest(oi, P[i].x, P[i].y);
        if (j >= 0 && d < 1.5 && prev >= 1.5 && prev < 40) {   // a track coming in to run on another's: the points; the frog back where they were a gauge apart
          let fx = P[i].x, fy = P[i].y;
          for (let k = 1; k < 80; k++) { const q = P[(i - k + n) % n], [dq] = nearest(oi, q.x, q.y); if (dq >= 24) { fx = q.x; fy = q.y; break; } }
          if (!seen(P[i].x, P[i].y)) out.push({ kind: 'turnout', x: Math.round(P[i].x), y: Math.round(P[i].y), a: hd(o.pts, j), b: hd(P, i), fx: Math.round(fx), fy: Math.round(fy) });
        }
        if (j >= 0 && d < 6) {
          const ta = hd(P, i), tb = hd(o.pts, j), dif = Math.abs(Math.atan2(Math.sin(ta - tb), Math.cos(ta - tb)));
          if (dif > 0.2 && dif < Math.PI - 0.2 && !seen(P[i].x, P[i].y)) out.push({ kind: 'diamond', x: Math.round(P[i].x), y: Math.round(P[i].y), a: tb, b: ta });
        }
        if (j >= 0 && d >= 1.5 && d < 40 && prev < 1.5 && i > 0) {   // a track leaving another's: the points behind, the frog ahead
          const pp = P[i - 1];
          let fx = P[i].x, fy = P[i].y;
          for (let k = 1; k < 80; k++) { const q = P[(i + k) % n], [dq] = nearest(oi, q.x, q.y); if (dq >= 24) { fx = q.x; fy = q.y; break; } }
          if (!seen(pp.x, pp.y)) out.push({ kind: 'turnout', x: Math.round(pp.x), y: Math.round(pp.y), a: hd(o.pts, j), b: hd(P, i), fx: Math.round(fx), fy: Math.round(fy) });
        }
        prev = d;
      }
    });
  });
  m.railSwitches = out;
}
// (H33) A bore of one of World v3's main line loops (m.rails[ri]) from s0 to s1 px along its track (shared/tunnels.js'
// kind of tunnel: m.cover, m.tunnels; made here, in the generator, so the page doesn't load it): a long tunnel through
// the mountains, so the cover is stamped along the track every 8 px (a slab of the bore at each point - nothing past the
// mouths; addTunnel's tile-by-tile search is for short ones), the rock either side, its two mouths. Two loops on one
// track share it (nothing is added where the stretch is already covered); the double track's two bores lie side by side.
function addRailBore(m, ri, s0, s1) {
  const R = m.rails && m.rails[ri];
  if (!R || s1 - s0 < 64 || !m.tunnels || m.tunnels.length >= 255) return null;
  const P = R.pts.filter((p) => p.s >= s0 && p.s <= s1);
  if (P.length < 4) return null;
  const mid = P[P.length >> 1];
  if (coverAtPx(m, mid.x, mid.y)) return null;
  const hw = 40, id = m.tunnels.length, mark = id + 1, walls = [], reach = hw + TUNNEL_WALL;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < P.length; k++) {
    const p = P[k], q = P[Math.min(P.length - 1, k + 1)], o = P[Math.max(0, k - 1)], l = Math.hypot(q.x - o.x, q.y - o.y) || 1, tx = (q.x - o.x) / l, ty = (q.y - o.y) / l;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    for (let ty0 = Math.floor((p.y - reach) / TILE); ty0 <= Math.floor((p.y + reach) / TILE); ty0++) for (let tx0 = Math.floor((p.x - reach) / TILE); tx0 <= Math.floor((p.x + reach) / TILE); tx0++) {
      if (!m.inside(tx0, ty0)) continue;
      const dx = (tx0 + 0.5) * TILE - p.x, dy = (ty0 + 0.5) * TILE - p.y, along = dx * tx + dy * ty, across = Math.abs(-dx * ty + dy * tx);
      if (Math.abs(along) > 6 || across > reach) continue;
      const i = m.idx(tx0, ty0);
      if (across <= hw) { if (!m.cover[i]) { m.cover[i] = mark; if (m.tiles[i] === T.WALL) m.tiles[i] = T.DIRT; } }
      else walls.push(i);
    }
  }
  for (const i of walls) if (!m.cover[i]) m.tiles[i] = T.WALL;
  const line = [];
  for (let k = 0; k < P.length; k += 4) line.push(Math.round(P[k].x), Math.round(P[k].y));
  const a = P[0], a1 = P[1], b = P[P.length - 1], b1 = P[P.length - 2], la = Math.hypot(a1.x - a.x, a1.y - a.y) || 1, lb = Math.hypot(b.x - b1.x, b.y - b1.y) || 1;
  const pad = reach + TILE;
  const t = {
    id, kind: 'rail', edge: 'rail', rail: ri, s0: a.s, s1: b.s, len: b.s - a.s, hw, line,
    mouths: [{ x: a.x, y: a.y, ox: -(a1.x - a.x) / la, oy: -(a1.y - a.y) / la, closed: false }, { x: b.x, y: b.y, ox: (b.x - b1.x) / lb, oy: (b.y - b1.y) / lb, closed: false }],
    box: [Math.floor(x0 - pad), Math.floor(y0 - pad), Math.ceil(x1 + pad), Math.ceil(y1 + pad)],
  };
  m.tunnels.push(t);
  return t;
}

// (H33) World v3's main line through the mountains: each loop's bores (shared/world3-rail.js mountainBores) under the
// hill's cover - one bore per track (two loops on one track share it).
function addRailBores(m) {
  if (!m.rails) return;
  m.rails.forEach((r, ri) => { for (const b of r.bores || []) addRailBore(m, ri, b.s0, b.s1); });
}
// World v3's container quays (docs/WORLD-V3.md 8.5; only island builds on the v3 land ask for them: opts.quays): along
// the side of the rectangle that faces the channel, the shore is a straight quay - three tiles of dock where the land
// meets the water - with stacks of crates behind it and a crane every 48 tiles (m.quays: where the art's gantry crane
// goes, client/art2/props-transit.js; no prop draws it yet)
function buildQuays(m, quays) {
  m.quays = [];
  const W = m.w, open = (t) => t === T.GRASS || t === T.SAND || t === T.DIRT || t === T.PLAZA || t === T.LOT || t === T.SIDEWALK;
  for (const q of quays) {
    const [x0, y0, x1, y1] = q.rect, west = q.faces !== 'east', edge = [];
    for (let y = y0; y < y1; y++) {
      let sx = -1;
      if (west) { for (let x = Math.max(1, x0 - 24); x < x1; x++) if (m.land[y * W + x]) { sx = x; break; } }
      else for (let x = Math.min(W - 2, x1 + 24); x > x0; x--) if (m.land[y * W + x]) { sx = x; break; }
      if (sx < 0 || m.land[y * W + sx + (west ? -1 : 1)]) continue;
      edge.push([sx, y]);
      for (let k = 0; k < 3; k++) { const x = sx + (west ? k : -k), i = y * W + x; if (open(m.tiles[i]) && !(m.reserve[i] & 1)) { m.tiles[i] = T.DOCK; m.reserve[i] |= 16; } }
    }
    const cranes = [];
    for (let k = 0; k < edge.length; k++) {
      const [sx, y] = edge[k], bx = sx + (west ? 5 : -5), i = y * W + bx;
      if (k % 48 === 24) cranes.push({ x: (sx + (west ? 1.5 : -0.5)) * TILE, y: (y + 0.5) * TILE, a: west ? Math.PI : 0 });
      if (k % 6 === 3 && open(m.tiles[i]) && !m.reserve[i]) addProp(m, 'crates', (bx + 0.5) * TILE, (y + 0.5) * TILE, 12);
    }
    m.quays.push({ name: q.name, x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE, length: edge.length, cranes });
    buildContainerPort(m, q, edge, west, cranes);
  }
}
// World v3's container port (docs/WORLD-V3.md 8.5): the quay's district cleared and laid out as a container yard, the
// quay's gantry cranes and a ship moored (m.port; tiles - the ship: stern, nine holds, bow)
const PORT = { apron: 6, bw: 5, bl: 8, lane: 4, group: 4, ship: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 10] };
function buildContainerPort(m, q, edge, west, cranes) {
  if (edge.length < 60) return;
  const W = m.w, [rx0, ry0, rx1, ry1] = q.rect, dir = west ? 1 : -1, RW = rx1 - rx0, RH = ry1 - ry0;
  const inRect = (x, y) => x >= rx0 && x < rx1 && y >= ry0 && y < ry1, li = (x, y) => (y - ry0) * RW + (x - rx0);
  const mid = edge[edge.length >> 1], dd = m.dist[mid[1] * W + mid[0] + dir * 12];
  const hv = (a, b) => (((a * 73856093) ^ (b * 19349663)) >>> 0) % 9973;
  // (the freight stop's row and the junkyard stay)
  const fr = m.buildings.find((b) => !b.gone && b.name === q.freight && inRect(b.tx, b.ty));
  const keepB = new Set(m.buildings.filter((b) => !b.gone && inRect(b.tx, b.ty) && (b.kind === 'junkyard' || (fr && b.ty === fr.ty && b.th === fr.th))).map((b) => b.id));
  for (const b of m.buildings) {
    const cx = b.tx + (b.tw >> 1), cy = b.ty + (b.th >> 1);
    if (!b.gone && !keepB.has(b.id) && inRect(cx, cy) && m.dist[cy * W + cx] === dd) clearArea(m, b.tx, b.ty, b.tw, b.th);
  }
  const keep = new Uint8Array(RW * RH), yard = new Uint8Array(RW * RH), sxOf = new Int32Array(RH).fill(-1);
  for (const id of keepB) { const b = m.buildings[id]; for (let y = b.ty - 1; y <= b.ty + b.th; y++) for (let x = b.tx - 1; x <= b.tx + b.tw; x++) if (inRect(x, y)) keep[li(x, y)] = 1; }
  for (const [sx, y] of edge) if (inRect(sx, y)) sxOf[y - ry0] = sx;
  const cnt = new Map(); for (const [sx] of edge) cnt.set(sx, (cnt.get(sx) || 0) + 1);
  const SX = [...cnt].sort((a, b) => b[1] - a[1])[0][0], X0 = SX + dir * (3 + PORT.apron);
  const NOT = new Set([T.ROAD, T.SIDEWALK, T.BRIDGE, T.WATER, T.DEEP, T.DOCK, T.BUILDING]);
  for (let y = ry0; y < ry1; y++) {
    const sx = sxOf[y - ry0] >= 0 ? sxOf[y - ry0] : SX;
    let run = -1;
    for (let x = rx0; x <= rx1; x++) {
      const ok = x < rx1 && (west ? x >= sx + 3 : x <= sx - 3) && m.dist[y * W + x] === dd && !NOT.has(m.tiles[y * W + x]) && !keep[li(x, y)];
      if (ok) { yard[li(x, y)] = 1; if (run < 0) run = x; } else if (run >= 0) { clearArea(m, run, y, x - run, 1); run = -1; }
    }
  }
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) if (yard[li(x, y)] || (keep[li(x, y)] && m.dist[y * W + x] === dd && m.tiles[y * W + x] === T.GRASS)) m.set(x, y, T.LOT);
  // from the dock back: the apron, pairs of blocks and a lane; along the quay, groups of four blocks and a cross lane
  const isYard = (x, y) => inRect(x, y) && yard[li(x, y)] === 1;
  let QY0 = -1, QY1 = -1, Y0 = -1, Y1 = -1;
  for (let y = ry0; y < ry1; y++) { if (sxOf[y - ry0] === SX) { if (QY0 < 0) QY0 = y; QY1 = y; } if (isYard(X0, y)) { if (Y0 < 0) Y0 = y; Y1 = y; } }
  const blocks = [], lanes = [], solid = [], P = 2 * PORT.bw + 1 + PORT.lane, GP = PORT.group * (PORT.bl + 1) + PORT.lane - 1;
  const fits = (bx, by) => { for (let y = by - 1; y <= by + PORT.bl; y++) for (let x = bx - 1; x <= bx + PORT.bw; x++) if (!isYard(x, y)) return false; return true; };
  for (let k = 0; ; k++) {
    const c0 = X0 + dir * k * P;
    if (west ? c0 >= rx1 : c0 < rx0) break;
    const cols = [0, PORT.bw + 1].map((o) => (west ? c0 + o : c0 - o - PORT.bw + 1));
    lanes.push({ x: west ? c0 + 2 * PORT.bw + 1 : c0 - 2 * PORT.bw - PORT.lane, w: PORT.lane, ns: true });
    for (let g = 0; Y0 + 1 + g * GP < Y1; g++) for (let r = 0; r < PORT.group; r++) {
      const by = Y0 + 1 + g * GP + r * (PORT.bl + 1);
      for (const [j, bx] of cols.entries()) if (fits(bx, by)) blocks.push({ x: bx, y: by, w: PORT.bw, h: PORT.bl, v: hv(bx, by) % 6, pair: j, g, r, k });
    }
  }
  for (let g = 0; Y0 + 1 + g * GP < Y1; g++) lanes.push({ y: Y0 + 1 + g * GP + PORT.group * (PORT.bl + 1) - 1, h: PORT.lane, ew: true });
  const solidAt = (x, y, r) => { m.addSolidProp(x, y, r); solid.push([x, y, r]); };
  for (const b of blocks) {
    addProp(m, 'cstack', (b.x + b.w / 2) * TILE, (b.y + b.h / 2) * TILE, 0, { v: b.v, tall: 240 });
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) solidAt((x + 0.5) * TILE, (y + 0.5) * TILE, 18);
  }
  const at = new Set(blocks.map((b) => `${b.x},${b.y}`));
  // masts between a pair, straddle carriers parked in a lane
  for (const b of blocks) {
    if (b.pair !== 0 || b.r !== 2) continue;
    const ox = west ? b.x + PORT.bw : b.x - 1;
    if (!at.has(`${b.x},${b.y - PORT.bl - 1}`) || !at.has(`${west ? b.x + PORT.bw + 1 : b.x - PORT.bw - 1},${b.y}`)) continue;
    addProp(m, 'ymast', (ox + 0.5) * TILE, (b.y - 0.5) * TILE, 0, { tall: 160 });
    solidAt((ox + 0.5) * TILE, (b.y - 0.5) * TILE, 6);
  }
  for (const b of blocks) {
    if (b.pair !== 1 || b.r !== 1 || (b.g + b.k) % 3 !== 0) continue;
    const lx = west ? b.x + PORT.bw + PORT.lane / 2 : b.x - PORT.lane / 2, ly = b.y + PORT.bl / 2;
    let ok = true;
    for (let y = Math.floor(ly - 2); y <= Math.floor(ly + 1); y++) for (let x = Math.floor(lx - 1); x <= Math.floor(lx); x++) if (!isYard(x, y)) ok = false;
    if (!ok) continue;
    addProp(m, 'straddle', lx * TILE, ly * TILE, 0, { a: Math.PI / 2, tall: 120 });
    solidAt(lx * TILE, (ly - 0.7) * TILE, 18); solidAt(lx * TILE, (ly + 0.7) * TILE, 18);
  }
  // the gate: a lane, a pavement, then a road - nearest the stacks' middle; the gatehouse beside it
  let gate = null, best = 1e18;
  const mx = blocks.reduce((a, b) => a + b.x + b.w / 2, 0) / Math.max(1, blocks.length), my = blocks.reduce((a, b) => a + b.y + b.h / 2, 0) / Math.max(1, blocks.length);
  const onLane = (y) => lanes.some((l) => l.ew && y >= l.y && y < l.y + l.h);
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
    if (!isYard(x, y)) continue;
    for (const [dx, dy] of [[0, 1], [dir, 0], [0, -1]]) {
      if (!isYard(x - dy, y - dx) || !isYard(x + dy, y + dx)) continue;
      let n = 1;
      while (n < 5 && m.tiles[(y + dy * n) * W + x + dx * n] === T.SIDEWALK) n++;
      const sc = (x - mx) ** 2 + (y - my) ** 2 + (dx && onLane(y) && onLane(y - 1) && onLane(y + 1) ? 0 : 400);
      if (n > 1 && n < 5 && m.tiles[(y + dy * n) * W + x + dx * n] === T.ROAD && sc < best) { best = sc; gate = { tx: x, ty: y, dx, dy, road: [x + dx * n, y + dy * n] }; }
    }
  }
  let house = null;
  if (gate) {
    for (const s of [2, -3]) {
      const hx = gate.dy ? gate.tx + s : gate.tx - gate.dx * 3, hy = gate.dy ? gate.ty - gate.dy * 2 - (gate.dy > 0 ? 1 : 0) : gate.ty + s;
      let ok = true;
      for (let y = hy - 1; y <= hy + 2; y++) for (let x = hx - 1; x <= hx + 2; x++) if (!isYard(x, y) || at.has(`${x},${y}`)) ok = false;
      for (const b of blocks) if (hx + 2 > b.x - 1 && hx < b.x + b.w + 1 && hy + 2 > b.y - 1 && hy < b.y + b.h + 1) ok = false;
      if (!ok) continue;
      house = simpleBuilding(m, hx, hy, 2, 2, 'Gatehouse', 'hut', dd, 'tar');
      break;
    }
    addProp(m, 'ygate', (gate.tx + 0.5) * TILE, (gate.ty + 0.5) * TILE, 0, { a: gate.dy ? 0 : Math.PI / 2 });
  }
  // the fence along the gate's part of the yard where it faces the street, open at the gate
  const fences = [];
  if (gate) {
    const part = new Uint8Array(RW * RH), st = [[gate.tx, gate.ty]];
    part[li(gate.tx, gate.ty)] = 1;
    while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isYard(x + dx, y + dy) && !part[li(x + dx, y + dy)]) { part[li(x + dx, y + dy)] = 1; st.push([x + dx, y + dy]); } }
    const street = (x, y) => { const t = m.tiles[y * W + x]; return t === T.SIDEWALK || t === T.ROAD; };
    const open = (x, y) => Math.abs(x - gate.tx) <= 2 && Math.abs(y - gate.ty) <= 2;
    const piece = (x0, y0, x1, y1) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (4 * TILE)));
      for (let k = 0; k < n; k++) {
        const ax = x0 + (x1 - x0) * k / n, ay = y0 + (y1 - y0) * k / n, bx = x0 + (x1 - x0) * (k + 1) / n, by = y0 + (y1 - y0) * (k + 1) / n;
        addProp(m, 'yfence', ax, ay, 0, { x1: bx, y1: by });
        fences.push([ax, ay, bx, by]);
      }
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (let d = 8; d <= len - 8; d += 12) solidAt(x0 + (x1 - x0) * d / len, y0 + (y1 - y0) * d / len, 7);
    };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const outer = dx ? RW : RH, inner = dx ? RH : RW;
      for (let a = 0; a < outer; a++) {
        let run = -1;
        for (let b = 0; b <= inner; b++) {
          const x = rx0 + (dx ? a : b), y = ry0 + (dx ? b : a);
          const ok = b < inner && part[li(x, y)] && street(x + dx, y + dy) && !open(x, y);
          if (ok && run < 0) run = b;
          if (!ok && run >= 0) {
            if (dx) { const ex = dx > 0 ? (x + 1) * TILE - 10 : x * TILE + 10; piece(ex, (ry0 + run) * TILE + 4, ex, (ry0 + b) * TILE - 4); }
            else { const ey = dy > 0 ? (y + 1) * TILE - 10 : y * TILE + 10; piece((rx0 + run) * TILE + 4, ey, (rx0 + b) * TILE - 4, ey); }
            run = -1;
          }
        }
      }
    }
  }
  // the cranes on the quay's edge, the rails, the ship alongside
  const rail = [(SX + (west ? 0.4 : 0.6)) * TILE, (SX + dir * 3.6 + (west ? 0 : 1)) * TILE];
  const cr = [];
  for (const [n, c] of cranes.entries()) {
    const cx = (rail[0] + rail[1]) / 2;
    let ok = true;
    for (const dy of [-36, 36]) {
      const ty = Math.floor((c.y + dy) / TILE), wx = Math.floor(rail[0] / TILE), w = m.tiles[ty * W + wx - dir];
      if (m.tiles[ty * W + wx] !== T.DOCK || (w !== T.WATER && w !== T.DEEP) || m.tiles[ty * W + Math.floor(rail[1] / TILE)] !== T.LOT) ok = false;
    }
    if (!ok) continue;
    addProp(m, 'gcrane', cx, c.y, 0, { a: west ? 0 : Math.PI, k: n % 2, tall: 720 });
    for (const lx of rail) for (const dy of [-36, 36]) solidAt(lx, c.y + dy, 9);
    cr.push({ x: cx, y: c.y });
  }
  for (const rx of rail) for (let y = QY0; y + 8 <= QY1 + 1; y += 8) {
    let ok = true;
    for (let k = 0; k < 8; k++) { const t = m.tiles[(y + k) * W + Math.floor(rx / TILE)]; if (t !== T.DOCK && t !== T.LOT) ok = false; }
    if (ok) addProp(m, 'crail', rx, (y + 4) * TILE, 0, { len: 256 });
  }
  let ship = null;
  const LS = PORT.ship.reduce((a, b) => a + b, 0), hx0 = west ? SX - 8 : SX + 2, sm = Math.floor((QY0 + QY1 - LS) / 2);
  for (const off of [0, -20, 20, -40, 40, -60, 60]) {
    const ys = sm + off;
    let ok = ys > QY0 && ys + LS < QY1;
    for (let y = ys - 1; y <= ys + LS && ok; y++) for (let x = hx0 - 1; x < hx0 + 8; x++) if (m.tiles[y * W + x] !== T.WATER && m.tiles[y * W + x] !== T.DEEP) { ok = false; break; }
    if (!ok) continue;
    const cxp = west ? SX * TILE - 120 : (SX + 1) * TILE + 120;
    let y = ys * TILE;
    for (const [n, len] of PORT.ship.entries()) {
      addProp(m, 'cship', cxp, y + len * TILE / 2, 0, { v: n === 0 ? 2 : n === PORT.ship.length - 1 ? 0 : 1, c: hv(n, ys) % 4, a: Math.PI / 2, tall: 250 });
      y += len * TILE;
    }
    for (let yy = ys * TILE + 16; yy < (ys + LS) * TILE; yy += 28) for (const ox of [-94, 94]) solidAt(cxp + ox, yy, 16);
    ship = { x: cxp - 110, y: ys * TILE, w: 220, h: LS * TILE };
    break;
  }
  m.port = { name: q.name, dist: dd, yard: [rx0, ry0, rx1, ry1], apron: { x: west ? SX + 3 : SX - 2 - PORT.apron, w: PORT.apron, y0: QY0, y1: QY1 }, blocks, lanes, solid, cranes: cr, rail, ship, freight: fr ? fr.id : -1,
    gate: gate ? { x: (gate.tx + 0.5) * TILE, y: (gate.ty + 0.5) * TILE, road: gate.road } : null, gatehouse: house ? house.id : -1, fences };
}

setWorld3Passes((g) => {
  ({ addProp, clearArea, simpleBuilding, buildRailway, markUnderpasses, underpassed, PLATFORM_IN, PLATFORM_OUT } = g);
  return { quays: buildQuays, rails, hubIndex, bores: addRailBores };
});
