// The woods' creeks (the redwood overhaul's water, 2026-11-24; the owner, 18:00: "creeks and streams and rivers and
// ponds and waterfalls and rapids don't quite look as good as they could ... hidden beautiful fishing spots"). Counted:
// Highland Woods is 1.8 million tiles of land with 1,248 of water - the forest has almost none. A creek here is laid by
// the land: from a spring it runs down the map's own heights (m.relief, smoothed) to water that is already there,
// wandering a little; where the ground steps down it runs white over a riffle and widens into a pool below; boulders in
// it and on its banks, ferns along it (the redwoods' kit: shared/world3-redwoods.js); where it meets a path the
// path goes over on stepping stones (bridge tiles: walked over, swum under); no trunk left standing over it.
// It keeps off roads, buildings, lots and the places made by hand (a trace that meets one is not laid), and is one of
// the map's running waters (m.waters.ch: clear, with its rapids and pools - the bake draws it so).
// CREEKS3.springs names the creeks laid: ONE for now, the sample for the owner's eye (west of the Giants Loop, down to
// the lake in the Pine Lake hills) - the network follows on his word.
// For the whole-world build only (shared/world3-world.js, after the redwoods' hand-made places). Deterministic:
// arithmetic and integer hashes; Math's trig only inside generateCity (withDeterministicMath).
import { TILE, T } from './constants.js';
import { context, blob, mossRock, fern, spline } from './world3-redwoods.js';
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
  rock: [5, 9, 3],  // tiles between boulders in the water, boulders on a bank, ferns on a bank - about
  pool: [86, 62],   // px: a pool's half axes (its middle deep)
  road: 14,         // tiles: a spring rises no nearer a road, a lot or a building than this
  stones: 14,       // a crossing of more path tiles than this is reported, not laid
  log: [2, 7, 0.5], // a path narrower than this (tiles), crossing no further than this bank to bank, takes a fallen log
                    // this often; else, and a wider path or a longer way over, stepping stones
};

// the line a creek takes from (tx, ty): down the smoothed heights, never back up, to the first water - or null
function trace(m, sx, sy, sites) {
  const G = CREEKS3, W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x, S = G.smooth;
  const sm = (tx, ty) => {
    let a = 0, c = 0;
    for (let dy = -S; dy <= S; dy++) for (let dx = -S; dx <= S; dx++) if (inF(tx + dx, ty + dy)) { a += m.relief[idx(tx + dx, ty + dy)]; c++; }
    return c ? a / c : 255;
  };
  const DIR = [[3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3], [0, -3], [1, -3], [2, -2], [3, -1]];
  const pts = [[sx, sy, sm(sx, sy)]], seen = new Set([idx(sx, sy)]);
  let x = sx, y = sy, h = pts[0][2];
  for (let k = 0; k < G.max; k++) {
    let b = null;
    for (const [dx, dy] of DIR) {
      const nx = x + dx, ny = y + dy;
      if (!inF(nx, ny)) continue;
      // (a path is crossed, not followed: a little dearer; a made place's ground is not entered)
      const i = idx(nx, ny), q = sm(nx, ny) + (m.tiles[i] === T.DIRT ? 0.4 : 0);
      if (seen.has(i) || sites.some((s) => Math.hypot(s[0] - nx, s[1] - ny) < s[2])) continue;
      if (!b || q < b.q) b = { x: nx, y: ny, q, h: sm(nx, ny) };
    }
    if (!b || b.h > h + 0.05) return null;   // (a hollow with no way on: no creek from here)
    x = b.x; y = b.y; h = Math.min(h, b.h);
    const i = idx(x, y), t = m.tiles[i];
    seen.add(i);
    if (t === T.WATER || t === T.DEEP) { pts.push([x, y, h]); return pts; }
    if (t === T.ROAD || t === T.LOT || t === T.FIELD || t === T.BRIDGE || t === T.PLAZA || t === T.SIDEWALK || (m.bld && m.bld[i] >= 0)) return null;
    pts.push([x, y, h]);
  }
  return null;
}

export function woodsCreeks3(m, H3) {
  const out = { creeks: [], unlaid: [] };
  if (!H3 || !H3.addProp || !m.relief || !m.waters || !Array.isArray(m.waters.ch)) return out;
  const G = CREEKS3, C = context(m, H3);
  const sites = (m.natureSites || []).filter((s) => s.kind !== 'trail' && s.kind !== 'pulloff').map((s) => [s.x / TILE, s.y / TILE, (s.r ? s.r / TILE : 8) + G.off]);
  for (const S of G.springs) {
    let tr = null;
    for (const [sx, sy] of S.at) { const q = trace(m, sx, sy, sites); if (q && q.length * G.step >= G.min) { tr = q; break; } }
    // (the spring rises in the woods: the head of the trace within sight of a road, a lot or a building is left dry)
    const built = (tx, ty) => { for (let dy = -G.road; dy <= G.road; dy += 2) for (let dx = -G.road; dx <= G.road; dx += 2) { if (dx * dx + dy * dy > G.road * G.road || !C.inF(tx + dx, ty + dy)) continue; const i = C.idx(tx + dx, ty + dy), t = m.tiles[i]; if (t === T.ROAD || t === T.LOT || (m.bld && m.bld[i] >= 0)) return true; } return false; };
    while (tr && tr.length && built(tr[0][0], tr[0][1])) tr.shift();
    if (!tr || tr.length * G.step < G.min) { out.unlaid.push(S.name); continue; }
    const seed = tr[0][0] * 7 + tr[0][1];
    // its line: the trace's points wandered a little side to side (not the spring, not the mouth), then a smooth curve
    const cp = tr.map(([x, y], k) => {
      if (k === 0 || k >= tr.length - 2) return [(x + 0.5) * TILE, (y + 0.5) * TILE];
      const [ax, ay] = tr[k - 1], [bx, by] = tr[k + 1], l = Math.hypot(bx - ax, by - ay) || 1, o = (hh(k, seed, 71) - 0.5) * 2 * G.wander;
      return [(x + 0.5 - (by - ay) / l * o) * TILE, (y + 0.5 + (bx - ax) / l * o) * TILE];
    });
    const line = spline(cp, 6), n = line.length, hAt = (k) => tr[Math.min(tr.length - 1, Math.floor(k / 6))][2];
    // the paths it will cross: their tiles under it, before it is water
    const hwAt = (k) => G.hw[0] + (G.hw[1] - G.hw[0]) * k / n, paths = new Map();
    for (let k = 0; k < n; k++) {
      const [x, y] = line[k], w = hwAt(k);
      for (let ty = Math.floor((y - w) / TILE); ty <= Math.floor((y + w) / TILE); ty++) for (let tx = Math.floor((x - w) / TILE); tx <= Math.floor((x + w) / TILE); tx++) {
        if (!C.inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > w) continue;
        const i = C.idx(tx, ty);
        if (m.tiles[i] === T.DIRT && !paths.has(i)) paths.set(i, [tx, ty, k]);
      }
    }
    // the water (narrow at the spring, wider below), what grew there gone
    let tiles = 0;
    for (let k = 0; k < n; k++) {
      const [x, y] = line[k], w = hwAt(k) * (0.85 + 0.3 * hh(k >> 2, seed, 73));
      for (let ty = Math.floor((y - w) / TILE); ty <= Math.floor((y + w) / TILE); ty++) for (let tx = Math.floor((x - w) / TILE); tx <= Math.floor((x + w) / TILE); tx++) {
        if (!C.inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > w) continue;
        const i = C.idx(tx, ty), t = m.tiles[i];
        if ((t === T.GRASS || t === T.DIRT || t === T.SAND) && !(m.bld && m.bld[i] >= 0)) { C.water(i); tiles++; }
      }
    }
    C.drop((p) => p.t !== 'painted' && !/^(fingerpost|textsign|mapboard|pbench|blaze)/.test(p.t) && line.some(([x, y], k) => Math.abs(p.x - x) < hwAt(k) + 20 && Math.abs(p.y - y) < hwAt(k) + 20));
    // boulders in it and on its banks, ferns along it - by the tile along its run, hashed, never in step
    const perT = 2;   // (points a tile)
    for (let k = 4; k < n - 4; k++) {
      const [x0, y0] = line[k - 1], [x1, y1] = line[k + 1], l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l, ny = (x1 - x0) / l, w = hwAt(k), [x, y] = line[k];
      if (hh(k, seed, 21) < 1 / (G.rock[0] * perT)) mossRock(C, x + nx * (hh(k, seed, 22) - 0.5) * w * 1.1, y + ny * (hh(k, seed, 22) - 0.5) * w * 1.1, 12 + Math.round(hh(k, seed, 23) * 12), 'granite');
      if (hh(k, seed, 24) < 1 / (G.rock[1] * perT)) { const sd = hh(k, seed, 25) < 0.5 ? -1 : 1, bx = x + nx * sd * (w + 22), by = y + ny * sd * (w + 22); if (C.open(bx, by) && m.tiles[C.at(bx, by)] !== T.DIRT) mossRock(C, bx, by, 20 + Math.round(hh(k, seed, 26) * 16), 'granite'); }
      if (hh(k, seed, 27) < 1 / (G.rock[2] * perT)) { const sd = hh(k, seed, 28) < 0.5 ? -1 : 1, o = w + 26 + hh(k, seed, 29) * 30, fx = x + nx * sd * o, fy = y + ny * sd * o; if (m.tiles[C.at(fx, fy)] === T.GRASS) fern(C, fx, fy, hh(k, seed, 30) < 0.7); }
    }
    // riffles and pools where the ground steps down
    const rap = [], pools = [];
    let last = -1e9, hLast = hAt(0);
    for (let k = 12; k < n - 18; k++) {
      if (hLast - hAt(k) < G.fall || (k - last) * (TILE * G.step / 6) / TILE < G.apart) continue;
      const pk = Math.min(n - 8, k + 9), [px, py] = line[pk];
      if ([...paths.values()].some((q) => Math.abs(q[2] - pk) < 12)) continue;   // (not at a crossing)
      rap.push([Math.max(0, k - 4), k + 4, 0.75]);
      blob(C, px, py, G.pool[0], G.pool[1], 0.22, 300 + k, (i, q) => { const t = m.tiles[i]; if (t === T.WATER || t === T.DEEP) { if (q < 0.5) C.water(i, true); } else if ((t === T.GRASS || t === T.SAND) && !(m.bld && m.bld[i] >= 0)) { C.water(i, q < 0.5); tiles++; } });
      pools.push([Math.round(px / TILE * 10) / 10, Math.round(py / TILE * 10) / 10, 3, 2]);
      for (const [dx, dy, s] of [[-G.pool[0] - 8, -10, 24], [G.pool[0] + 4, 14, 20], [-20, -G.pool[1] - 6, 28]]) if (C.open(px + dx, py + dy)) mossRock(C, px + dx, py + dy, s, 'granite');
      for (const [dx, dy] of [[-G.pool[0] - 30, 26], [G.pool[0] + 28, -18], [24, G.pool[1] + 26]]) fern(C, px + dx, py + dy, true);
      C.drop((p) => /^(tree_|redwood|shrub_|bush_|flowers_|boulder|log$|rwlog|rwstump)/.test(p.t) && Math.hypot(p.x - px, p.y - py) < G.pool[0] + 14);
      last = k; hLast = hAt(k);
    }
    // the spring: a small round head pool, mossy boulders ringed round its upstream side, ferns between them - the
    // creek rises from among the rocks (not a channel's cut end)
    {
      const [x0, y0] = line[0], [x4, y4] = line[Math.min(n - 1, 5)], l = Math.hypot(x4 - x0, y4 - y0) || 1, ux = -(x4 - x0) / l, uy = -(y4 - y0) / l;   // (upstream)
      blob(C, x0 + ux * 8, y0 + uy * 8, 46, 36, 0.18, seed + 5, (i) => { const t = m.tiles[i]; if ((t === T.GRASS || t === T.SAND) && !(m.bld && m.bld[i] >= 0)) { C.water(i); tiles++; } });
      C.drop((p) => /^(tree_|redwood|shrub_|bush_|flowers_|boulder|log$|rwlog|rwstump)/.test(p.t) && Math.hypot(p.x - x0, p.y - y0) < 96);
      for (const [da, o, sz] of [[0, 66, 40], [0.62, 62, 30], [-0.66, 64, 34], [1.25, 58, 24], [-1.3, 60, 22]]) { const ca = Math.cos(da), sa = Math.sin(da), rx = ux * ca - uy * sa, ry = ux * sa + uy * ca; mossRock(C, x0 + rx * o, y0 + ry * o * 0.8, sz, 'granite'); }
      for (const [da, o] of [[0.3, 96], [-0.35, 100], [1.0, 92], [-1.0, 94], [1.7, 84], [-1.75, 86]]) { const ca = Math.cos(da), sa = Math.sin(da); fern(C, x0 + (ux * ca - uy * sa) * o, y0 + (ux * sa + uy * ca) * o * 0.8, true); }
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
        if (!C.inF(X, Y) || own.has(C.idx(X, Y)) || m.tiles[C.idx(X, Y)] !== T.DIRT) continue;
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
          if (d > 24) C.ground(i, T.DIRT);
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
        C.prop('logbridge', mx * TILE, my * TILE, 0, { len: Math.round((span * TILE + 16) / 8) * 8, a: Math.round(Math.atan2(uy, ux) * 1000) / 1000 });
        kinds.log++;
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
    m.waters.ch.push({ k: 'creek', w: Math.round(G.hw[1] * 2 / TILE * 10) / 10, t: 'forest', v: 0.55, hand: 1, pts: line.filter((_, k) => k % 3 === 0 || k === n - 1).map(([x, y]) => [Math.round(x / TILE * 10) / 10, Math.round(y / TILE * 10) / 10]), ...(pools.length ? { p: pools } : {}), ...(rap.length ? { r: rap.map(([a, b, s]) => [Math.round(a / 3), Math.round(b / 3), s]) } : {}) });
    (m.natureSites ||= []).push({ kind: 'woodscreek', name: S.name, x: Math.round(line[0][0]), y: Math.round(line[0][1]), mouth: [Math.round(line[n - 1][0]), Math.round(line[n - 1][1])], len: Math.round(n * TILE * G.step / 6 / TILE), pools: pools.map((p) => [Math.round(p[0] * TILE), Math.round(p[1] * TILE)]), line: line.filter((_, k) => k % 6 === 0 || k === n - 1).map(([x, y]) => [Math.round(x), Math.round(y)]) });
    out.creeks.push({ name: S.name, tiles: Math.round(n * G.step / 6), water: tiles, pools: pools.length, riffles: rap.length, crossings, kinds, clips, long, fall: Math.round((tr[0][2] - tr[tr.length - 1][2]) * 10) / 10 });
  }
  return out;
}
