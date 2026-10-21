// Kestrel Lake by hand (the nature program, 2026-10-20; the handcraft research's 4.11 from WR2-C, SC3-G, NS1-E: "a sand
// beach on the east side - swim area, buoys, lifeguard chair - reeds and lilies in the south bays by the outlet"). The
// lake was laid as a polygon and the farm valley's fields were laid up to it, so its south shore ran ruler-straight for
// a third of a kilometre, fields to the water. Once the water bodies are known:
//   - the south shore's straight runs wander: bays dug back into the meadow between the fields and points built out
//     into the water, in a slow wave along the shore (never into a field, a dock, the boathouse or a road); the bays'
//     shallows grown with reeds and cattails, lily rafts out in them, willows and a boulder or two on the points;
//   - Kestrel Beach on the east shore, where the most open ground lies between the water and the fields: sand from the
//     waterline up, a lifeguard chair, umbrellas and towels, the swim area roped off with floats out in the water and a
//     swim raft beyond it, picnic blankets on the grass behind, a sign; named on the map.
// For the whole-world build only (shared/world3-world.js's done hook, after the water bodies). Deterministic:
// arithmetic and integer hashes.
import { TILE, T } from './constants.js';

const RES = 32;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const KESTREL3 = {
  // the south shore: the columns x0..x1 looked at, the shore found between rows y0 and y1 (the lake north of it); a
  // straight run at least `run` tiles long wanders - a wave `wave` tiles long, the shore moved between amp[0] (a bay dug
  // in) and amp[1] tiles (a point built out), easing in over `ease` tiles at the run's ends and `keep` tiles from
  // anything built
  south: { x: [3140, 3540], y: [1100, 1235], run: 30, wave: 46, amp: [-7, 8], ease: 12, keep: 12 },
  // the beach: looked for along the east shore in this box; `depth` tiles of sand up from the water, `half` tiles
  // either way along the shore from its middle; the swim area `swim` tiles out
  beach: { box: [3470, 930, 3660, 1120], depth: 8, half: 20, swim: 9, name: 'Kestrel Beach' },
};

export function kestrelByHand3(m, H3) {
  const out = { bays: 0, points: 0, dug: 0, built: 0, runs: 0, beach: null };
  if (!H3 || !H3.addProp || !m.lake) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const wetT = (t) => t === T.WATER || t === T.DEEP;
  const isLake = (i) => wetT(m.tiles[i]) && m.lake[i] === 1;
  const props = [], P = (t, x, y, r = 0, ex = null) => props.push([t, Math.round(x), Math.round(y), r, ex]);
  const drop = new Set();
  // the built things the shore keeps clear of: docks, bridges, roads, buildings, walls, and the designed places' ground
  // (the lake's green shore band is kept - reserve 4, world3-water.js - and is the meadow this reshapes: any other
  // designed place's bits keep it off)
  const built = (i) => { const t = m.tiles[i]; return t === T.DOCK || t === T.BRIDGE || t === T.ROAD || t === T.BUILDING || t === T.WALL || t === T.SIDEWALK || t === T.LOT || t === T.PLAZA || (m.land[i] && (m.reserve[i] & ~(128 | 4))) || (m.bld && m.bld[i] >= 0); };
  const open = (i) => m.land[i] && (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && !(m.reserve[i] & ~(128 | 4)) && (m.bld ? m.bld[i] < 0 : true);
  // the props on a tile (to take off where the ground changes)
  const PC = 4 * TILE, pgrid = new Map();
  for (const p of m.props) if (p) { const k = Math.floor(p.x / PC) * 65536 + Math.floor(p.y / PC); let a = pgrid.get(k); if (!a) pgrid.set(k, (a = [])); a.push(p); }
  const dropOn = (tx, ty) => { for (const p of pgrid.get(Math.floor((tx + 0.5) * TILE / PC) * 65536 + Math.floor((ty + 0.5) * TILE / PC)) || []) if (Math.floor(p.x / TILE) === tx && Math.floor(p.y / TILE) === ty) drop.add(p.x + ',' + p.y); };

  // ---- the south shore ----
  const S = KESTREL3.south, xs = [], sy = new Int32Array(S.x[1] - S.x[0] + 1).fill(-1);
  for (let x = S.x[0]; x <= S.x[1]; x++) {
    // (from the south up: land, then the first lake water - the shore - with land all the way below it)
    let y = S.y[1];
    while (y > S.y[0] && inF(x, y) && !isLake(idx(x, y))) y--;
    if (y > S.y[0] && inF(x, y + 1) && m.land[idx(x, y + 1)]) sy[x - S.x[0]] = y;
    xs.push(x);
  }
  // the straight runs
  const runs = [];
  let a0 = -1;
  for (let k = 0; k <= sy.length; k++) {
    const ok = k < sy.length && sy[k] >= 0 && (k === 0 || a0 < 0 || Math.abs(sy[k] - sy[k - 1]) <= 1);
    if (ok && a0 < 0) a0 = k;
    else if (!ok && a0 >= 0) { if (k - a0 >= S.run) runs.push([a0, k - 1]); a0 = k < sy.length && sy[k] >= 0 ? k : -1; }
  }
  out.runs = runs.length;
  // what's built near each column (within `keep` tiles of its shore, either way along it)
  const near = new Uint8Array(sy.length);
  for (let k = 0; k < sy.length; k++) {
    if (sy[k] < 0) { near[k] = 1; continue; }
    const x = S.x[0] + k, y = sy[k];
    for (let dy = -S.keep; dy <= S.keep && !near[k]; dy += 2) for (let dx = -S.keep; dx <= S.keep; dx += 2) { if (!inF(x + dx, y + dy)) continue; const i = idx(x + dx, y + dy); if (built(i)) { near[k] = 1; break; } }
  }
  // the wave along the shore: a hash every `wave` tiles, eased between (smooth)
  const wave = (k) => { const u = k / S.wave, j = Math.floor(u), f = u - j, t = f * f * (3 - 2 * f), a = hh(j, 17, 811), b = hh(j + 1, 17, 811); return a + (b - a) * t; };
  const shoreAt = new Int32Array(sy.length).fill(-1);
  for (const [k0, k1] of runs) {
    for (let k = k0; k <= k1; k++) {
      // (easing in at the run's ends and by what's built)
      let e = Math.min(1, (k - k0) / S.ease, (k1 - k) / S.ease);
      for (let d = 0; d <= S.ease && e > 0; d++) { if ((k - d >= 0 && near[k - d]) || (k + d < sy.length && near[k + d])) { e = Math.min(e, d / S.ease); break; } }
      const s = Math.round((S.amp[0] + (S.amp[1] - S.amp[0]) * wave(k)) * e), x = S.x[0] + k, y = sy[k];
      shoreAt[k] = y - s;
      if (s > 0) {   // a point: the meadow built out into the water
        for (let yy = y - s + 1; yy <= y; yy++) {
          const i = idx(x, yy);
          if (!isLake(i)) continue;
          const src = idx(x, y + 1);
          m.tiles[i] = T.GRASS; m.land[i] = 1; m.lake[i] = 0; if (m.river) m.river[i] = 0; m.dist[i] = m.dist[src]; m.reserve[i] |= RES | 128;
          dropOn(x, yy); out.built++;
        }
      } else if (s < 0) {   // a bay: dug back into the meadow (never a field)
        for (let yy = y + 1; yy <= y - s; yy++) {
          const i = idx(x, yy);
          if (!open(i)) break;
          const src = idx(x, y);
          m.tiles[i] = T.WATER; m.land[i] = 0; m.lake[i] = 1; if (m.river) m.river[i] = m.river[src]; m.dist[i] = m.dist[src];
          dropOn(x, yy); out.dug++;
        }
      }
    }
    // the dressing: the points' willows and boulders, the bays' reeds, cattails and lilies
    for (let k = k0 + 2; k <= k1 - 2; k++) {
      const s0 = sy[k] - shoreAt[k], x = S.x[0] + k;
      const prev = sy[k - 1] - shoreAt[k - 1], next = sy[k + 1] - shoreAt[k + 1];
      if (s0 >= 4 && s0 >= prev && s0 > next) {   // a point's tip
        out.points++;
        const ty = shoreAt[k] + 1;
        P('tree_a', (x + 0.5) * TILE, (ty + 2.2) * TILE, 12, { sp: 'willow', k: 1.3 });
        P('boulder', (x - 1.5) * TILE, (ty + 0.6) * TILE, 14, { s: 22 + Math.round(hh(x, ty, 812) * 14) });
        if (hh(x, ty, 813) < 0.6) P('boulder', (x + 2.2) * TILE, (ty + 1.2) * TILE, 14, { s: 18 + Math.round(hh(ty, x, 814) * 10) });
      } else if (s0 <= -3 && s0 <= prev && s0 < next) {   // a bay's head
        out.bays++;
        const by = sy[k] - s0;   // (the bay's shore row)
        for (let j = -6; j <= 6; j++) {
          const rx = x + j, kk = k + j;
          if (kk < 0 || kk >= sy.length || shoreAt[kk] < 0) continue;
          const ry = shoreAt[kk] - 0.4 - hh(rx, by, 815) * 1.6;   // (in the shallows just off the bay's shore)
          if (!inF(rx, Math.floor(ry)) || !isLake(idx(rx, Math.floor(ry)))) continue;
          if (hh(rx, by, 816) < 0.7) P('shrub_a', (rx + 0.5) * TILE, ry * TILE, 0, { sp: hh(rx, by, 817) < 0.5 ? 'reeds' : 'cattails', k: 1 });
        }
        for (let j = 0; j < 4; j++) {
          const lx = x + (hh(x, j, 818) - 0.5) * 8, ly = sy[k] - 3 - hh(j, x, 819) * 4;
          if (inF(Math.floor(lx), Math.floor(ly)) && isLake(idx(Math.floor(lx), Math.floor(ly)))) P('lily', lx * TILE, ly * TILE, 0, { v: j % 4 });
        }
      }
    }
  }

  // ---- Kestrel Beach ----
  const B = KESTREL3.beach;
  // the shore tiles in the box: land beside the lake's water; how much open ground lies inland of each (along the way
  // away from the water, up to depth + 6 tiles)
  let best = null;
  for (let ty = B.box[1]; ty <= B.box[3]; ty++) for (let tx = B.box[0]; tx <= B.box[2]; tx++) {
    if (!inF(tx, ty) || !open(idx(tx, ty))) continue;
    let wx = 0, wy = 0, n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (inF(tx + dx, ty + dy) && isLake(idx(tx + dx, ty + dy))) { wx += dx; wy += dy; n++; }
    if (n < 3 || !(isLake(idx(tx - 1, ty)) || isLake(idx(tx + 1, ty)) || isLake(idx(tx, ty - 1)) || isLake(idx(tx, ty + 1)))) continue;
    const l = Math.sqrt(wx * wx + wy * wy) || 1, ix = -wx / l, iy = -wy / l;   // (inland)
    let depth = 0;
    for (let d = 1; d <= B.depth + 6; d++) { const x = Math.round(tx + ix * d), y = Math.round(ty + iy * d); if (!inF(x, y) || !open(idx(x, y))) break; depth = d; }
    // (the run along the shore: open shore tiles either way)
    let along = 0;
    for (const sd of [-1, 1]) for (let d = 1; d <= B.half; d++) { const x = Math.round(tx - iy * d * sd), y = Math.round(ty + ix * d * sd); if (!inF(x, y) || built(idx(x, y))) break; along++; }
    const score = Math.min(depth, B.depth + 4) * 3 + along + hh(tx, ty, 821);
    if (depth >= B.depth && along >= B.half && (!best || score > best.score)) best = { tx, ty, ix, iy, score };
  }
  if (best) {
    const { tx, ty, ix, iy } = best, ax = -iy, ay = ix;   // (ax, ay: along the shore)
    // the sand: every open tile up to `depth` tiles from the water (by a walk over the land from the shore), the depth
    // easing off at the beach's ends and wavering slowly along it - one piece, no grass left in it
    const R0 = B.half + 6 + B.depth, bx0 = tx - R0, by0 = ty - R0, BW = 2 * R0 + 1, dist = new Int16Array(BW * BW).fill(-1), q = [];
    for (let y = 0; y < BW; y++) for (let x = 0; x < BW; x++) { const gx = bx0 + x, gy = by0 + y; if (inF(gx, gy) && isLake(idx(gx, gy))) { dist[y * BW + x] = 0; q.push(y * BW + x); } }
    for (let h = 0; h < q.length; h++) {
      const k = q[h], x = k % BW, y = (k / BW) | 0;
      if (dist[k] > B.depth + 2) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= BW || ny >= BW || dist[ny * BW + nx] >= 0) continue;
        const gi = idx(bx0 + nx, by0 + ny);
        if (!inF(bx0 + nx, by0 + ny) || !m.land[gi]) continue;
        dist[ny * BW + nx] = dist[k] + 1; q.push(ny * BW + nx);
      }
    }
    let sand = 0;
    for (let y = 0; y < BW; y++) for (let x = 0; x < BW; x++) {
      const d = dist[y * BW + x], gx = bx0 + x, gy = by0 + y;
      if (d < 1) continue;
      const a = (gx - tx) * ax + (gy - ty) * ay;   // (along the shore from the middle)
      if (Math.abs(a) > B.half + 3) continue;
      const u = Math.abs(a) / (B.half + 3), lim = B.depth * (u > 0.75 ? 1 - (u - 0.75) * 3.4 : 1) + (hh(Math.floor(a / 6), 3, 822) - 0.5) * 2;
      const i = idx(gx, gy);
      if (d > lim || !open(i)) continue;
      m.tiles[i] = T.SAND; m.reserve[i] = (m.reserve[i] | RES | 4) & ~128; dropOn(gx, gy); sand++;
    }
    const X = (tx + 0.5) * TILE, Y = (ty + 0.5) * TILE, at = (a, d) => [X + (ax * a + ix * d) * TILE, Y + (ay * a + iy * d) * TILE];
    // the lifeguard chair facing the water, umbrellas and towels along the sand, blankets on the grass behind
    const [lx, ly] = at(0, B.depth * 0.45);
    P('lguard', lx, ly, 14, { a: Math.atan2(-iy, -ix) });
    if (m.addSolidProp) m.addSolidProp(lx, ly, 16);
    for (let k = 0; k < 6; k++) {
      const a = -B.half + 4 + k * ((2 * B.half - 8) / 5) + (k >= 3 ? 2 : -2), [ux, uy] = at(a, B.depth * (0.35 + hh(k, tx, 823) * 0.3));
      P(['umbrella_r', 'umbrella_y', 'umbrella_b', 'umbrella_g'][k % 4], ux, uy, 0);
      P('towel', ux + 18, uy + 22, 0, { v: k % 4 });
    }
    for (let k = 0; k < 3; k++) { const [bx, by] = at(-B.half + 6 + k * B.half * 0.8, B.depth + 3.5); P('blanket', bx, by, 0, { v: k % 4 }); }
    const [sx, sy2] = at(-B.half - 1, B.depth + 2);
    P('textsign', sx, sy2, 0, { text: 'KESTREL BEACH', bg: '#2a6a8a', fg: [250, 244, 220], z: 28 });
    P('lifering', ...at(B.half - 2, B.depth * 0.6), 0);
    // the swim area out in the water: a line of floats round it, from the beach out, along and back; the raft in it
    const lake = (x, y) => { const qx = Math.floor(x / TILE), qy = Math.floor(y / TILE); return inF(qx, qy) && isLake(idx(qx, qy)); };
    const A = B.half - 4, line = [];
    for (let d = 0; d <= B.swim; d += 1.6) line.push(at(-A, -d));
    for (let a = -A + 1.6; a <= A - 1.6; a += 1.6) line.push(at(a, -B.swim));
    for (let d = B.swim; d >= 0; d -= 1.6) line.push(at(A, -d));
    let floats = 0;
    for (const [x, y] of line) if (lake(x, y)) { P('swimbuoy', x, y, 0, { v: floats % 2 }); floats++; }
    const [rx, ry] = at(B.half * 0.3, -B.swim * 0.62);
    if (lake(rx, ry)) P('swimraft', rx, ry, 0);
    out.floats = floats;
    const site = { kind: 'beach', name: B.name, x: Math.round(X + ix * B.depth * 0.5 * TILE), y: Math.round(Y + iy * B.depth * 0.5 * TILE), r: Math.round(B.half * TILE), sand, lake: 'Kestrel Lake' };
    m.natureSites.push(site);
    (m.landmarks ||= []).push({ name: B.name, type: 'beach', x: Math.round(site.x - B.half * TILE), y: Math.round(site.y - B.half * TILE), w: B.half * 2 * TILE, h: B.half * 2 * TILE });
    out.beach = { x: site.x, y: site.y, sand, ix: Math.round(ix * 100) / 100, iy: Math.round(iy * 100) / 100 };
  }
  if (drop.size && H3.removeProps) H3.removeProps(m, (x, y) => drop.has(x + ',' + y));
  for (const [t, x, y, r, ex] of props) H3.addProp(m, t, x, y, r, ex);
  return out;
}
