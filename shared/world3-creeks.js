// The woods' creeks (the redwood overhaul's water, 2026-11-24; the owner, 18:00: "creeks and streams and rivers and
// ponds and waterfalls and rapids don't quite look as good as they could ... hidden beautiful fishing spots"). Counted:
// Highland Woods is 1.8 million tiles of land with 1,248 of water - the forest has almost none. A creek here is laid by
// the land: from a spring it runs down the map's own heights (m.relief, smoothed) to water that is already there,
// wandering a little; where the ground steps down it runs white over a riffle and widens into a pool below; boulders in
// it and on its banks, ferns along it (the redwoods' kit: shared/world3-redwoods.js); where it meets a path the
// path goes over on stepping stones (bridge tiles: walked over, swum under); no trunk left standing over it.
// It keeps off roads, buildings, lots and the places made by hand (a trace that meets one is not laid), and is one of
// the map's running waters (m.waters.ch: clear, with its rapids and pools - the bake draws it so).
// CREEKS3.springs names the first creek, the sample the owner looked at (west of the Giants Loop, down to the lake in
// the Pine Lake hills; 11-25 09:03: "Creek looks good let's go with it"); CREEKS3.net lays the rest by the same rule:
// springs found on the woods' high ground, the highest first and well apart, each run down the land to the first
// water - the lake, a river, a creek laid before it (so they gather into one water) - or to a hollow with no way on,
// where it ends in a pond. A network creek goes round rock, passes under a road it meets in a culvert (the road's
// tiles stay road), and is not laid where it would run along a path, or through a lot, a field or a building.
// For the whole-world build only (shared/world3-world.js, after the redwoods' hand-made places). Deterministic:
// arithmetic and integer hashes; Math's trig only inside generateCity (withDeterministicMath).
import { TILE, T } from './constants.js';
import { context, blob, mossRock as mossRockW, fern as fernW, spline } from './world3-redwoods.js';
import { reliefMetres } from './mapcore.js';
import { COVER, TREE_COVER } from './world3-clearings.js';

const RES = 32;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const CREEKS3 = {
  springs: [{ name: 'Fernwater Creek', at: [[1600, 1420], [1580, 1400], [1560, 1420], [1560, 1400]] }],   // (tiles: the first of these it can run from)
  step: 3,          // tiles a step of the trace
  smooth: 3,        // tiles either side: the heights' mean the trace reads
  max: 420,         // steps at most
  min: 30,          // tiles: a shorter run is no creek
  off: 6,           // tiles kept from a hand-made place's ground (its radius and this)
  wander: 1.4,      // tiles: how far the line strays from the trace, side to side
  hw: [26, 38],     // px: its half width at the spring and at its mouth
  fall: 1,          // a step down of the smoothed height by this much makes a riffle and a pool
  apart: 40,        // tiles between two riffles at least
  rock: [11, 6, 3], // tiles between boulders in the water, boulders on a bank, ferns on a bank - about
  pool: [86, 62],   // px: a pool's half axes (its middle deep)
  road: 14,         // tiles: a spring rises no nearer a road, a lot or a building than this
  stones: 14,       // a crossing of more path tiles than this is reported, not laid
  log: [2, 7, 0.5], // a path narrower than this (tiles), crossing no further than this bank to bank, takes a fallen log
  sticks: 0.4,       // of those log crossings, the share that is a makeshift bridge of poles instead (the owner, 11-24 21:40)
                    // this often; else, and a wider path or a longer way over, stepping stones
  // the network (11-25): `n` more creeks at most, their springs tried on a `grid` of tiles over the woods (district
  // `dist`), the highest first, `apart` tiles from every other spring and `dry` tiles from any water; a creek at
  // least `min` tiles long; a road passed in a culvert of at most `culvert` tiles; a pond's half axes (px)
  // (px); stall: over this many steps of its trace it got no further than this many tiles - it is winding round a
  // hollow's floor: the pond is put where that began (was: a scribble of creek 500 tiles long, round and round)
  net: { n: 7, dist: 47, grid: 56, apart: 110, dry: 14, min: 40, culvert: 12, pond: [150, 108], room: 40, stall: [12, 12], reach: 16,
    names: ['Salamander Creek', 'Thimbleberry Run', 'Mossy Fork', 'Owl Hollow Creek', 'Sorrel Brook', 'Dipper Creek', 'Huckleberry Run', 'Newt Creek'] },
  // the mountains' streams (11-25, the owner's note: "water chunks that blend into the mountainous area above and
  // foothills below"; counted: Granite Peaks had one tarn and not one running water in 572,588 tiles of land): the same
  // rule over Granite Peaks - a spring may rise on scree, a path there is a trail's own tiles (the scree is dirt too),
  // bare granite boulders and no ferns, clear alpine water; one that ends in a hollow makes a tarn with granite
  // outcrops round its far shore
  alp: { alp: 1, n: 6, dist: 48, grid: 64, apart: 140, dry: 14, min: 50, culvert: 12, pond: [170, 120], room: 40, stall: [12, 12], reach: 16, tarn: 'Tarn Creek',
    names: ['Pika Creek', 'Marmot Run', 'Granite Fork', 'Columbine Creek', 'Eagle Run', 'Windy Fork', 'Heather Brook'] },
};

// the line a creek takes from (tx, ty): down the smoothed heights, never back up, to the first water - or null
// (net: a network creek's rules - CREEKS3.net: round rock, over a road, to water within two tiles, a pond in a hollow)
let WHY = '';   // (why the last trace gave no creek: for the build's report)
function smoothed(m) {
  const W = m.w, HH = m.h, S = CREEKS3.smooth, memo = new Map();
  return (tx, ty) => {
    const key = ty * W + tx, got = memo.get(key);
    if (got !== undefined) return got;
    let a = 0, c = 0;
    for (let dy = -S; dy <= S; dy++) for (let dx = -S; dx <= S; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < W && y < HH) { a += m.relief[y * W + x]; c++; } }
    const v = c ? reliefMetres(a / c) : 999;
    memo.set(key, v);
    return v;
  };
}
function trace(m, sx, sy, sites, sm, net = null, over = false) {   // (over: it may run over a band of the land's own rock - a cascade)
  const G = CREEKS3, W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const wetT = (x, y) => inF(x, y) && (m.tiles[idx(x, y)] === T.WATER || m.tiles[idx(x, y)] === T.DEEP);
  let road = 0;
  // (where it would end in a hollow: water within net.reach tiles - it runs on into that, cutting through whatever lip
  // lies between; the owner, 11-25 13:35, on a stream that ended in a pool at the sea's edge: "streams and flowing
  // water is still connecting to the larger bodies of water its going towards, doesnt just close off right before")
  const pondOr = (pts, x, y, h) => {
    let best = null;
    for (let dy = -net.reach; dy <= net.reach; dy++) for (let dx = -net.reach; dx <= net.reach; dx++) { const d = dx * dx + dy * dy; if (d <= net.reach * net.reach && wetT(x + dx, y + dy) && (!best || d < best[2])) best = [x + dx, y + dy, d]; }
    if (best) pts.push([best[0], best[1], h]); else pts.pond = 1;
    return pts;
  };
  const DIR = [[3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3], [0, -3], [1, -3], [2, -2], [3, -1]];
  const pts = [[sx, sy, sm(sx, sy)]], seen = new Set([idx(sx, sy)]);
  let x = sx, y = sy, h = pts[0][2];
  let ldx = 0, ldy = 0;
  for (let k = 0; k < G.max; k++) {
    let b = null;
    // (a cascade's stream on a road: straight on the way it came, whatever the heights - it passes under and takes the
    // land's level on the far side; the networks' creeks keep their own way, as laid and looked at)
    if (over && road && (ldx || ldy)) { const nx = x + ldx, ny = y + ldy; if (inF(nx, ny) && !seen.has(idx(nx, ny))) b = { x: nx, y: ny, q: 0, h: sm(nx, ny), free: true }; }
    else for (const [dx, dy] of DIR) {
      const nx = x + dx, ny = y + dy;
      if (!inF(nx, ny)) continue;
      // (a path is crossed, not followed: a little dearer; a made place's ground is not entered)
      const i = idx(nx, ny), q = sm(nx, ny) + (m.tiles[i] === T.DIRT ? 0.4 : 0);
      if (seen.has(i) || sites.some((s) => Math.hypot(s[0] - nx, s[1] - ny) < s[2])) continue;
      if (net && m.tiles[i] === T.WALL && !(over && (m.reserve[i] & 32))) continue;   // (round the rock)
      if (over) { let hard = false; for (let ey = -2; ey <= 2 && !hard; ey++) for (let ex = -2; ex <= 2; ex++) { if (!inF(nx + ex, ny + ey)) continue; const j = idx(nx + ex, ny + ey), t = m.tiles[j]; if (t === T.LOT || t === T.FIELD || t === T.PLAZA || t === T.SIDEWALK || t === T.BRIDGE || (m.bld && m.bld[j] >= 0) || (t === T.WALL && !(m.reserve[j] & 32))) { hard = true; break; } } if (hard) continue; }   // (and two tiles clear of built ground)
      if (!b || q < b.q) b = { x: nx, y: ny, q, h: sm(nx, ny) };
    }
    // (a hollow with no way on: no creek from here - a network creek long enough ends there in a pond)
    if (!b || (!b.free && b.h > h + 0.05)) { if (net && !road && pts.length * G.step >= net.min) return pondOr(pts, x, y, h); WHY = `no way on at ${x},${y} after ${pts.length} steps`; return null; }
    ldx = b.x - x; ldy = b.y - y;
    x = b.x; y = b.y; h = b.free ? b.h : Math.min(h, b.h);
    const i = idx(x, y), t = m.tiles[i];
    seen.add(i);
    if (t === T.WATER || t === T.DEEP) { pts.push([x, y, h]); return pts; }
    if (net && t === T.ROAD && !(m.bld && m.bld[i] >= 0)) { road += G.step; if (road > net.culvert * (over ? 2 : 1)) { WHY = `a road too wide at ${x},${y}`; if (!over) return null; pts.length -= Math.min(pts.length - 1, Math.round(road / G.step) + 3); const e = pts[pts.length - 1]; return pondOr(pts, e[0], e[1], e[2]); } pts.push([x, y, h]); continue; }   // (a cascade's stream that meets a road it cannot pass ends above it, in a pond or the water near by)   // (under the road)
    if (t === T.ROAD || t === T.LOT || t === T.FIELD || t === T.BRIDGE || t === T.PLAZA || t === T.SIDEWALK || (m.bld && m.bld[i] >= 0)) { WHY = `built ground (tile ${t}) at ${x},${y}`; return null; }
    road = 0;
    pts.push([x, y, h]);
    if (net && pts.length > net.stall[0] && Math.hypot(pts[pts.length - 1 - net.stall[0]][0] - x, pts[pts.length - 1 - net.stall[0]][1] - y) < net.stall[1]) {
      pts.length -= net.stall[0] - 2;
      if (pts.length * G.step < net.min) { WHY = `winds in place at ${x},${y}`; return null; }
      { const e = pts[pts.length - 1]; return pondOr(pts, e[0], e[1], e[2]); }
    }
    if (net) { // (water within two tiles: it joins it)
      let j = null;
      for (let dy = -2; dy <= 2 && !j; dy++) for (let dx = -2; dx <= 2; dx++) if (wetT(x + dx, y + dy)) { j = [x + dx, y + dy]; break; }
      if (j) { pts.push([j[0], j[1], h]); return pts; }
    }
  }
  return null;
}

function creeks3(m, H3, cfg) {
  const out = { creeks: [], unlaid: [] };
  if (!H3 || !H3.addProp || !m.relief || !m.waters || !Array.isArray(m.waters.ch)) return out;
  const G = CREEKS3, C = context(m, H3);
  const sites = (m.natureSites || []).filter((s) => s.kind !== 'trail' && s.kind !== 'pulloff').map((s) => [s.x / TILE, s.y / TILE, (s.r ? s.r / TILE : 8) + G.off]);
  const sm = smoothed(m), NET = cfg.net, ALP = !!NET.alp, springs = [];
  // (the mountains: bare granite boulders, no ferns; a path is a trail's own tiles - the scree is dirt too)
  const fern = ALP ? () => {} : fernW, mossRock = ALP ? (c, x, y, sz) => c.prop('boulder', x, y, sz > 26 ? 14 : 0, { s: sz, style: 'granite' }) : mossRockW;
  const soft = (i) => { const t = m.tiles[i]; return (t === T.GRASS || t === T.SAND || (ALP && t === T.DIRT && !isPath(i))) && !(m.bld && m.bld[i] >= 0); };   // (what a pool, a pond or a spring's head takes: in the mountains the scree too)
  const isPath = (i) => i >= 0 && (ALP ? (m.tiles[i] === T.DIRT && !!(m.reserve[i] & RES) && !(m.reserve[i] & 192)) || (m.tiles[i] === T.SAND && (m.reserve[i] & (RES | 128)) === (RES | 128)) : m.tiles[i] === T.DIRT);
  // (the spring rises in the woods: the head of the trace within sight of a road, a lot or a building is left dry)
  const built = (tx, ty) => { for (let dy = -G.road; dy <= G.road; dy += 2) for (let dx = -G.road; dx <= G.road; dx += 2) { if (dx * dx + dy * dy > G.road * G.road || !C.inF(tx + dx, ty + dy)) continue; const i = C.idx(tx + dx, ty + dy), t = m.tiles[i]; if (t === T.ROAD || t === T.LOT || (m.bld && m.bld[i] >= 0)) return true; } return false; };
  const lay = (S, tr, net) => {
    const seed = tr[0][0] * 7 + tr[0][1];
    // its line: the trace's points wandered a little side to side (not the spring, not the mouth), then a smooth curve
    const cp = tr.map(([x, y], k) => {
      if (k === 0 || k >= tr.length - 2) return [(x + 0.5) * TILE, (y + 0.5) * TILE];
      const [ax, ay] = tr[k - 1], [bx, by] = tr[k + 1], l = Math.hypot(bx - ax, by - ay) || 1, o = (hh(k, seed, 71) - 0.5) * 2 * G.wander;
      return [(x + 0.5 - (by - ay) / l * o) * TILE, (y + 0.5 + (bx - ax) / l * o) * TILE];
    });
    const line = spline(cp, 6), n = line.length, hAt = (k) => tr[Math.min(tr.length - 1, Math.floor(k / 6))][2];
    // where it passes under a road: the runs of its line on road tiles (the road stays; a culvert carries it)
    const under = new Uint8Array(n), spans = [];
    for (let k = 0; k < n; k++) { const i = C.at(line[k][0], line[k][1]); if (i >= 0 && m.tiles[i] === T.ROAD) under[k] = 1; }
    for (let k = 0; k < n; k++) if (under[k]) { let e = k; while (e + 1 < n && under[e + 1]) e++; spans.push([k, e]); k = e; }
    // where it runs over rock (a cascade: S.over): the runs of its line on the land's own rock
    const rspans = [];
    if (S.over) for (let k = 0; k < n; k++) { const i = C.at(line[k][0], line[k][1]); if (i >= 0 && m.tiles[i] === T.WALL && (m.reserve[i] & 32)) { let e = k; while (e + 1 < n) { const j = C.at(line[e + 1][0], line[e + 1][1]); if (j >= 0 && m.tiles[j] === T.WALL && (m.reserve[j] & 32)) e++; else break; } rspans.push([k, e]); k = e; } }
    const nearSpan = (k, d) => spans.some(([a, b]) => k >= a - d && k <= b + d) || rspans.some(([a, b]) => k >= a - d && k <= b + d);
    if (net) {
      // a network creek is laid only where it fits: open ground (or water, or a road to pass under) all along its line,
      // each culvert short, with open ground either end, none at its spring or its mouth
      for (let k = 0; k < n; k++) { const i = C.at(line[k][0], line[k][1]), t = i < 0 ? -1 : m.tiles[i]; if (!(t === T.GRASS || t === T.DIRT || t === T.SAND || t === T.WATER || t === T.DEEP || t === T.ROAD || (S.over && t === T.WALL && (m.reserve[i] & 32))) || (m.bld && m.bld[i] >= 0)) return `ground: tile ${t} at ${Math.floor(line[k][0] / TILE)},${Math.floor(line[k][1] / TILE)}`; }
      for (const [a, b] of spans) if ((b - a + 1) * G.step / 6 > NET.culvert * (S.over ? 2 : 1) || a < 12 || b > n - 12 || (S.over && hAt(Math.min(n - 1, b + 6)) > hAt(Math.max(0, a - 6)) + 1)) return 'road';   // (a cascade's: and not up to higher ground the far side)
      // (a pond needs room: where rock or a road hems the hollow in, no creek ends there)
      if (tr.pond) { let room = 0; blob(C, line[n - 1][0], line[n - 1][1], NET.pond[0], NET.pond[1], 0.2, seed + 9, (i) => { const t = m.tiles[i]; if (t === T.WATER || t === T.DEEP || soft(i)) room++; }); if (room < NET.room) return 'pond'; }
    }
    // the paths it will cross: their tiles under it, before it is water
    const hwAt = (k) => G.hw[0] + (G.hw[1] - G.hw[0]) * k / n, paths = new Map();
    for (let k = 0; k < n; k++) {
      const [x, y] = line[k], w = hwAt(k);
      for (let ty = Math.floor((y - w) / TILE); ty <= Math.floor((y + w) / TILE); ty++) for (let tx = Math.floor((x - w) / TILE); tx <= Math.floor((x + w) / TILE); tx++) {
        if (!C.inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > w) continue;
        const i = C.idx(tx, ty);
        if (isPath(i) && !paths.has(i)) paths.set(i, [tx, ty, k, m.tiles[i]]);
      }
    }
    if (net) { // (not along a path: a crossing of more path tiles than G.stones is no crossing)
      const gs = [];
      for (const [, [tx, ty]] of paths) { let g = gs.find((q) => q.some((r) => Math.abs(r[0] - tx) <= 2 && Math.abs(r[1] - ty) <= 2)); if (!g) gs.push((g = [])); g.push([tx, ty]); }
      if (gs.some((g) => g.length > G.stones)) return 'path';
    }
    // the water (narrow at the spring, wider below), what grew there gone
    let tiles = 0, decks = 0;
    for (let k = 0; k < n; k++) {
      const [x, y] = line[k], w = hwAt(k) * (0.85 + 0.3 * hh(k >> 2, seed, 73));
      for (let ty = Math.floor((y - w) / TILE); ty <= Math.floor((y + w) / TILE); ty++) for (let tx = Math.floor((x - w) / TILE); tx <= Math.floor((x + w) / TILE); tx++) {
        if (!C.inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > w) continue;
        const i = C.idx(tx, ty), t = m.tiles[i];
        if ((t === T.GRASS || t === T.DIRT || t === T.SAND || (S.over && t === T.WALL && (m.reserve[i] & 32))) && !(m.bld && m.bld[i] >= 0)) { C.water(i); tiles++; }
      }
    }
    C.drop((p) => p.t !== 'painted' && !/^(fingerpost|textsign|mapboard|pbench|blaze)/.test(p.t) && line.some(([x, y], k) => !nearSpan(k, 4) && Math.abs(p.x - x) < hwAt(k) + 20 && Math.abs(p.y - y) < hwAt(k) + 20));
    // under a road: the road's tiles over the creek are a bridge's - a deck with the water running under it, seen on
    // both sides right up to it (the owner, 11-25 13:33, on the first try's stone headwalls: "doesnt look like the
    // stream is goin under the road, just looks like its leading into a skinny concrete structure ... more like a
    // bridge with the road going over it")
    // (and a rail along each edge of the road over the water - a stone kerb with timber posts, the art's creekRail -
    // lying the way the road runs there: the long axis of the road's own tiles round the crossing)
    for (const [a, b] of spans) {
      const [x0, y0] = line[Math.max(0, a - 2)], [x1, y1] = line[Math.min(n - 1, b + 2)], cx = Math.floor((x0 + x1) / 2 / TILE), cy = Math.floor((y0 + y1) / 2 / TILE);   // (a point clear of the road's own tiles either side: a piece is not put on a road)
      let sx = 0, sy = 0, c = 0, xx = 0, yy = 0, xy = 0;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) if (C.inF(cx + dx, cy + dy) && m.tiles[C.idx(cx + dx, cy + dy)] === T.ROAD) { sx += dx; sy += dy; c++; }
      if (!c) continue;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) if (C.inF(cx + dx, cy + dy) && m.tiles[C.idx(cx + dx, cy + dy)] === T.ROAD) { const u = dx - sx / c, v = dy - sy / c; xx += u * u; yy += v * v; xy += u * v; }
      const ra = Math.round(0.5 * Math.atan2(2 * xy, xx - yy) * 1000) / 1000, len = Math.round(hwAt(a) * 2 + 52);
      C.prop('creekrail', x0, y0, 0, { a: ra, len }); C.prop('creekrail', x1, y1, 0, { a: ra, len });
    }
    for (const [a, b] of spans) for (let k = Math.max(0, a - 2); k <= Math.min(n - 1, b + 2); k++) {
      const [x, y] = line[k], w = hwAt(k) + 6;
      for (let ty = Math.floor((y - w) / TILE); ty <= Math.floor((y + w) / TILE); ty++) for (let tx = Math.floor((x - w) / TILE); tx <= Math.floor((x + w) / TILE); tx++) {
        if (!C.inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > w) continue;
        const i = C.idx(tx, ty);
        if (m.tiles[i] === T.ROAD) { m.tiles[i] = T.BRIDGE; m.reserve[i] |= RES; decks++; }
      }
    }
    // boulders in it and on its banks, ferns along it - by the tile along its run, hashed, never in step
    const perT = 2;   // (points a tile)
    for (let k = 4; k < n - 4; k++) {
      if (nearSpan(k, 5)) continue;   // (nothing set down on the road or at a culvert's mouth)
      const [x0, y0] = line[k - 1], [x1, y1] = line[k + 1], l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l, ny = (x1 - x0) / l, w = hwAt(k), [x, y] = line[k];
      if (hh(k, seed, 21) < 1 / (G.rock[0] * perT)) mossRock(C, x + nx * (hh(k, seed, 22) - 0.5) * w * 1.1, y + ny * (hh(k, seed, 22) - 0.5) * w * 1.1, 12 + Math.round(hh(k, seed, 23) * 12), 'granite');
      if (hh(k, seed, 24) < 1 / (G.rock[1] * perT)) { const sd = hh(k, seed, 25) < 0.5 ? -1 : 1, bx = x + nx * sd * (w + 22), by = y + ny * sd * (w + 22); if (C.open(bx, by) && !isPath(C.at(bx, by))) mossRock(C, bx, by, 20 + Math.round(hh(k, seed, 26) * 16), 'granite'); }
      if (hh(k, seed, 27) < 1 / (G.rock[2] * perT)) { const sd = hh(k, seed, 28) < 0.5 ? -1 : 1, o = w + 26 + hh(k, seed, 29) * 30, fx = x + nx * sd * o, fy = y + ny * sd * o; if (m.tiles[C.at(fx, fy)] === T.GRASS) fern(C, fx, fy, hh(k, seed, 30) < 0.7); }
    }
    // riffles and pools where the ground steps down
    const rap = [], pools = [];
    // the cascade: white water all the way over the rock; where it comes out through a cliff's face, that face gives
    // way to a fall of its height with a plunge pool at its foot
    let cascades = 0;
    for (const [a, b] of rspans) {
      rap.push([a, b, 1]);
      const [ex, ey] = line[Math.min(n - 1, b + 1)];
      const face = m.props.find((p) => p && p.t === 'cliff' && Math.abs(p.x - ex) < p.w / 2 + 20 && Math.abs(p.y - ey) < 3 * TILE);
      if (!face) continue;
      C.drop((p) => p === face);
      C.prop('coastfall', ex, face.y + 6, 0, { w: 44, drop: Math.round(face.h * (face.w >= 160 ? 1.5 : face.w >= 96 ? 1.25 : 1)), s: 7 + cascades, mist: 0.6 });
      blob(C, ex, face.y + 64, 84, 58, 0.2, seed + 13 + b, (i, q) => { const t = m.tiles[i]; if (t === T.WATER || t === T.DEEP) { if (q < 0.5) C.water(i, true); } else if (soft(i)) { C.water(i, q < 0.5); tiles++; } });
      pools.push([Math.round(ex / TILE * 10) / 10, Math.round((face.y + 64) / TILE * 10) / 10, 3, 2]);
      cascades++;
    }
    let last = -1e9, hLast = hAt(0);
    for (let k = 12; k < n - 18; k++) {
      if (hLast - hAt(k) < G.fall || (k - last) * (TILE * G.step / 6) / TILE < G.apart) continue;
      const pk = Math.min(n - 8, k + 9), [px, py] = line[pk];
      if ([...paths.values()].some((q) => Math.abs(q[2] - pk) < 12) || nearSpan(pk, 30) || nearSpan(k, 12)) continue;   // (not at a crossing, not by a road)
      rap.push([Math.max(0, k - 4), k + 4, 0.75]);
      blob(C, px, py, G.pool[0], G.pool[1], 0.22, 300 + k, (i, q) => { const t = m.tiles[i]; if (t === T.WATER || t === T.DEEP) { if (q < 0.5) C.water(i, true); } else if (soft(i)) { C.water(i, q < 0.5); tiles++; } });
      pools.push([Math.round(px / TILE * 10) / 10, Math.round(py / TILE * 10) / 10, 3, 2]);
      for (const [dx, dy, s] of [[-G.pool[0] - 8, -10, 24], [G.pool[0] + 4, 14, 20], [-20, -G.pool[1] - 6, 28]]) if (C.open(px + dx, py + dy)) mossRock(C, px + dx, py + dy, s, 'granite');
      for (const [dx, dy] of [[-G.pool[0] - 30, 26], [G.pool[0] + 28, -18], [24, G.pool[1] + 26]]) fern(C, px + dx, py + dy, true);
      C.drop((p) => /^(tree_|redwood|shrub_|bush_|flowers_|boulder|log$|rwlog|rwstump)/.test(p.t) && Math.hypot(p.x - px, p.y - py) < G.pool[0] + 14);
      last = k; hLast = hAt(k);
    }
    // the spring: a small round head pool, mossy boulders ringed round its upstream side, ferns between them - the
    // creek rises from among the rocks (not a channel's cut end)
    if (!S.nohead) {
      const [x0, y0] = line[0], [x4, y4] = line[Math.min(n - 1, 5)], l = Math.hypot(x4 - x0, y4 - y0) || 1, ux = -(x4 - x0) / l, uy = -(y4 - y0) / l;   // (upstream)
      blob(C, x0 + ux * 8, y0 + uy * 8, 46, 36, 0.18, seed + 5, (i) => { if (soft(i)) { C.water(i); tiles++; } });
      C.drop((p) => /^(tree_|redwood|shrub_|bush_|flowers_|boulder|log$|rwlog|rwstump)/.test(p.t) && Math.hypot(p.x - x0, p.y - y0) < 96);
      for (const [da, o, sz] of [[0, 66, 40], [0.62, 62, 30], [-0.66, 64, 34], [1.25, 58, 24], [-1.3, 60, 22]]) { const ca = Math.cos(da), sa = Math.sin(da), rx = ux * ca - uy * sa, ry = ux * sa + uy * ca; mossRock(C, x0 + rx * o, y0 + ry * o * 0.8, sz, 'granite'); }
      for (const [da, o] of [[0.3, 96], [-0.35, 100], [1.0, 92], [-1.0, 94], [1.7, 84], [-1.75, 86]]) { const ca = Math.cos(da), sa = Math.sin(da); fern(C, x0 + (ux * ca - uy * sa) * o, y0 + (ux * sa + uy * ca) * o * 0.8, true); }
    }
    // a network creek that ends in a hollow: a pond there, deep in its middle, boulders and ferns round it, the trees
    // back from its shore
    if (tr.pond) {
      const [px, py] = line[n - 1], [rx, ry] = NET.pond;
      blob(C, px, py, rx, ry, 0.2, seed + 9, (i, q) => { const t = m.tiles[i]; if (t === T.WATER || t === T.DEEP) { if (q < 0.5) C.water(i, true); } else if (soft(i)) { C.water(i, q < 0.5); tiles++; } });
      pools.push([Math.round(px / TILE * 10) / 10, Math.round(py / TILE * 10) / 10, 5, 3.5]);
      C.drop((p) => /^(tree_|redwood|shrub_|bush_|flowers_|boulder|log$|rwlog|rwstump)/.test(p.t) && Math.hypot(p.x - px, (p.y - py) * rx / ry) < rx + 30);
      for (let j = 0; j < 9; j++) { const a = j * 0.7 + hh(j, seed, 41) * 0.5, o = 1.12 + hh(j, seed, 42) * 0.14, bx = px + Math.cos(a) * rx * o, by = py + Math.sin(a) * ry * o; if (j % 3 === 0) { if (C.open(bx, by) && !isPath(C.at(bx, by))) { if (ALP && Math.sin(a) < 0.2) C.prop('outcrop', bx, by, 26, { w: 84, d: 54, h: 52, s: j + 3, style: 'granite' }); else mossRock(C, bx, by, 22 + Math.round(hh(j, seed, 43) * 16), 'granite'); } } else if (m.tiles[C.at(bx, by)] === T.GRASS) fern(C, bx, by, true); }
    }
    // the crossings: a path's tiles under the creek become stepping stones
    const groups = [];
    for (const [i, [tx, ty, k]] of paths) {
      if (m.tiles[i] !== T.WATER && m.tiles[i] !== T.DEEP) continue;
      let g = groups.find((q) => q.some((r) => Math.abs(r[1] - tx) <= 2 && Math.abs(r[2] - ty) <= 2));
      if (!g) groups.push((g = []));
      g.push([i, tx, ty, k]);
    }
    // (a narrow path: a fallen log laid across as a bridge - shared/world3-footbridges.js carries it to its banks and
    // links its ends; a wide trail: stepping stones, each its own size and shape, not one a tile; where the creek
    // only clipped a path's edge the path keeps its ground)
    let crossings = 0, long = 0, clips = 0;
    const kinds = { stones: 0, log: 0 };
    groups.sort((p, q) => p[0][3] - q[0][3]);
    for (const g of groups) {
      if (g.length > G.stones) { long++; continue; }
      // the path's own ground beside these tiles, by the bank it is on
      const A = [], B = [], own = new Set(g.map((q) => q[0]));
      for (const [, tx, ty, k] of g) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = tx + dx, Y = ty + dy;
        if (!C.inF(X, Y) || own.has(C.idx(X, Y)) || !isPath(C.idx(X, Y))) continue;
        const [ax, ay] = line[Math.max(0, k - 2)], [bx, by] = line[Math.min(n - 1, k + 2)], cr = (bx - ax) * ((Y + 0.5) * TILE - line[k][1]) - (by - ay) * ((X + 0.5) * TILE - line[k][0]);
        (cr < 0 ? A : B).push([X + 0.5, Y + 0.5]);
      }
      if (!A.length || !B.length) {
        // (the creek only clipped the path's edge: no crossing - the path keeps its ground; where the creek's own run
        // lies on it, stones)
        for (const [i, tx, ty, k] of g) {
          let d = 1e9;
          for (let q = Math.max(0, k - 8); q <= Math.min(n - 1, k + 8); q++) d = Math.min(d, Math.hypot((tx + 0.5) * TILE - line[q][0], (ty + 0.5) * TILE - line[q][1]));
          tiles--;
          if (d > 24) C.ground(i, paths.get(i)[3]);
          else { m.tiles[i] = T.BRIDGE; m.reserve[i] |= RES | 4; C.prop('rk', (tx + 0.5) * TILE + (hh(tx, ty, 81) - 0.5) * 12, (ty + 0.5) * TILE + 6, 0, { k: 'stone', r: 9 + Math.round(hh(tx, ty, 83) * 7), s: Math.floor(hh(tx, ty, 84) * 8) }); }
        }
        clips++;
        continue;
      }
      for (const [i] of g) { m.tiles[i] = T.BRIDGE; m.reserve[i] |= RES | 4; tiles--; }
      const cen = (P) => [P.reduce((a, q) => a + q[0], 0) / P.length, P.reduce((a, q) => a + q[1], 0) / P.length], [x0, y0] = cen(A), [x1, y1] = cen(B);
      const span = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / span, uy = (y1 - y0) / span, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      let w0 = 0, w1 = 0; for (const q of g) { const d = -(q[1] + 0.5 - mx) * uy + (q[2] + 0.5 - my) * ux; w0 = Math.min(w0, d); w1 = Math.max(w1, d); }
      if (w1 - w0 < G.log[0] && span <= G.log[1] && hh(Math.round(mx), Math.round(my), 89) < G.log[2]) {
        const sticks = hh(Math.round(mx), Math.round(my), 91) < G.sticks;   // (a makeshift bridge of poles instead of the one great log)
        C.prop('logbridge', mx * TILE, my * TILE, 0, { len: Math.round((span * TILE + 16) / 8) * 8, a: Math.round(Math.atan2(uy, ux) * 1000) / 1000, ...(sticks && { k: 'sticks' }) });
        kinds.log++; if (sticks) kinds.sticks = (kinds.sticks || 0) + 1;
      } else {
        for (const [, tx, ty] of g) {
          const u = hh(tx, ty, 81), big = 9 + Math.round(hh(tx, ty, 83) * 7);
          C.prop('rk', (tx + 0.5) * TILE + (u - 0.5) * 12, (ty + 0.5) * TILE + 6 + (hh(tx, ty, 82) - 0.5) * 10, 0, { k: 'stone', r: big, s: Math.floor(hh(tx, ty, 84) * 8) });
          if (big <= 11 && hh(tx, ty, 85) < 0.6) C.prop('rk', (tx + 0.5) * TILE + (u < 0.5 ? 11 : -11), (ty + 0.5) * TILE + 6 + (hh(tx, ty, 86) - 0.5) * 14, 0, { k: 'stone', r: 7 + Math.round(hh(tx, ty, 87) * 2), s: Math.floor(hh(tx, ty, 88) * 8) });
        }
        kinds.stones++;
      }
      crossings++;
    }
    // in sight (the camera looks north): no redwood's trunk standing over the water - its crown overhead is carried
    // high (statics.js) - and no smaller tree at all, trunk or crown
    C.drop((p) => {
      if (!/^(tree_a|tree_b|redwood)$/.test(p.t)) return false;
      const rw = p.t === 'redwood', c = rw ? COVER[p.sp] || COVER.giant : TREE_COVER, tw = (rw ? c[0] + 10 : c[2]), th = rw ? c[1] * 0.42 : c[1];
      for (let k = 0; k < n; k += 3) { const dy = p.y - line[k][1]; if (dy > -6 && dy < th && Math.abs(p.x - line[k][0]) < tw + hwAt(k) * 0.6) return true; }
      return false;
    });
    C.flush();
    m.waters.ch.push({ k: 'creek', w: Math.round(G.hw[1] * 2 / TILE * 10) / 10, t: cfg.t, v: 0.55, hand: 1, pts: line.filter((_, k) => k % 3 === 0 || k === n - 1).map(([x, y]) => [Math.round(x / TILE * 10) / 10, Math.round(y / TILE * 10) / 10]), ...(pools.length ? { p: pools } : {}), ...(rap.length ? { r: rap.map(([a, b, s]) => [Math.round(a / 3), Math.round(b / 3), s]) } : {}) });
    (m.natureSites ||= []).push({ kind: cfg.kind, name: S.name, x: Math.round(line[0][0]), y: Math.round(line[0][1]), mouth: [Math.round(line[n - 1][0]), Math.round(line[n - 1][1])], len: Math.round(n * TILE * G.step / 6 / TILE), pools: pools.map((p) => [Math.round(p[0] * TILE), Math.round(p[1] * TILE)]), line: line.filter((_, k) => k % 6 === 0 || k === n - 1).map(([x, y]) => [Math.round(x), Math.round(y)]) });
    out.creeks.push({ name: S.name, tiles: Math.round(n * G.step / 6), water: tiles, pools: pools.length, riffles: rap.length, crossings, kinds, clips, long, fall: Math.round((tr[0][2] - tr[tr.length - 1][2]) * 10) / 10, ...(net && { net: 1 }), ...(spans.length && { culverts: spans.length, decks }), ...(tr.pond && { pond: 1 }), ...(rspans.length && { rock: rspans.reduce((q, [a, b]) => q + Math.round((b - a + 1) * G.step / 6), 0), falls: cascades }) });
    springs.push([tr[0][0], tr[0][1]]);
    return '';
  };
  for (const S of cfg.springs) {
    let tr = null;
    for (const [sx, sy] of S.at) { const q = trace(m, sx, sy, sites, sm, S.over ? NET : null, !!S.over); if (q && q.length * G.step >= G.min) { tr = q; break; } }
    if (tr && S.from) { const pond = tr.pond; tr.unshift([S.from[0], S.from[1], tr[0][2]]); if (pond) tr.pond = 1; }   // (it starts at water that is there: a tarn's outflow)
    while (!S.from && tr && tr.length && built(tr[0][0], tr[0][1])) tr.shift();
    const why = !tr ? 'trace: ' + WHY : tr.length * G.step < G.min ? 'short' : lay(S, tr, !!S.over);
    if (why) { out.unlaid.push(S.name); (out.why ||= {})[S.name] = why; }
  }
  // ---- the network: springs over the woods' high ground, the highest first ----
  const cand = [], open0 = (i) => m.dist[i] === NET.dist && m.land[i] && (m.tiles[i] === T.GRASS || (ALP && m.tiles[i] === T.DIRT)) && !(m.reserve[i] & ~128) && !(m.bld && m.bld[i] >= 0);
  for (let gy = 0; gy < m.h; gy += NET.grid) for (let gx = 0; gx < m.w; gx += NET.grid) {
    const tx = gx + Math.floor(hh(gx, gy, 51) * NET.grid), ty = gy + Math.floor(hh(gx, gy, 52) * NET.grid);
    if (!C.inF(tx, ty) || !open0(C.idx(tx, ty)) || built(tx, ty)) continue;
    if (sites.some((s) => Math.hypot(s[0] - tx, s[1] - ty) < s[2] + 4)) continue;
    let wet = false;
    for (let dy = -NET.dry; dy <= NET.dry && !wet; dy += 2) for (let dx = -NET.dry; dx <= NET.dry; dx += 2) { if (!C.inF(tx + dx, ty + dy)) continue; const t = m.tiles[C.idx(tx + dx, ty + dy)]; if (t === T.WATER || t === T.DEEP) { wet = true; break; } }
    if (!wet) cand.push([tx, ty, sm(tx, ty)]);
  }
  cand.sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);
  out.net = { tried: 0, laid: 0, why: {} };
  for (const [tx, ty] of cand) {
    if (out.net.laid >= NET.n) break;
    if (springs.some(([x, y]) => Math.hypot(x - tx, y - ty) < NET.apart)) continue;
    out.net.tried++;
    const tr = trace(m, tx, ty, sites, sm, NET);
    let why = !tr ? 'trace' : '';
    if (tr) { const pond = tr.pond; while (tr.length && built(tr[0][0], tr[0][1])) tr.shift(); if (pond) tr.pond = 1; if (tr.length * G.step < NET.min) why = 'short'; }
    if (!why && tr[0][2] - tr[tr.length - 1][2] < 2) why = 'level';
    if (!why) why = lay({ name: NET.names[out.net.laid % NET.names.length] }, tr, true);
    if (why) { const w = why.split(':')[0]; out.net.why[w] = (out.net.why[w] || 0) + 1; } else out.net.laid++;
  }
  return out;
}

export const woodsCreeks3 = (m, H3) => creeks3(m, H3, { springs: CREEKS3.springs, net: CREEKS3.net, kind: 'woodscreek', t: 'forest' });
// the mountains' streams by the same rule - and first Summit Tarn's outflow, which ended on the scree: it runs on from
// the last water south of the tarn's falls, over the band of rock below it as a cascade (a sample for the owner's eye,
// 11-25: the rule that would let any stream take a cliff band waits for his word)
export function peakCreeks3(m, H3) {
  const A = CREEKS3.alp, springs = [], W = m.w;
  const tarn = (m.natureSites || []).find((q) => q.kind === 'tarn' && q.falls);
  if (tarn && A.tarnOn) {   // (not yet: below the rock it comes down beside a road to a junction and finds no room to end - 11-25)
    const fx = Math.floor(tarn.falls.x / TILE), fy = Math.floor(tarn.falls.y / TILE), wet = (x, y) => x >= 0 && y >= 0 && x < W && y < m.h && (m.tiles[y * W + x] === T.WATER || m.tiles[y * W + x] === T.DEEP) && !(m.lake && m.lake[y * W + x]);
    let end = null;
    for (let y = fy; y < fy + 40; y++) { let hit = null; for (let dx = 0; dx <= 8 && !hit; dx++) for (const x of [fx + dx, fx - dx]) if (wet(x, y)) { hit = [x, y]; break; } if (hit) end = hit; else if (end) break; }
    if (end) springs.push({ name: A.tarn, from: end, at: [[end[0], end[1] + 4], [end[0] + 2, end[1] + 4], [end[0] - 2, end[1] + 4]], over: 1, nohead: 1 });
  }
  return creeks3(m, H3, { springs, net: A, kind: 'peakcreek', t: 'alpine' });
}
