// World v2 rivers: a pure-data, seeded generator for the procedural water system (no DOM, no
// G-buffer - it moves to shared/ world code later). It traces water downhill over a height map from
// springs to the sea or a lake:
//
//   height map    seeded value-noise fbm, a ridge term, terrace steps in rocky patches (benches and
//                 cliffs, where waterfalls come from) and an optional sea along one map edge
//   fill          priority-flood depression filling (Barnes et al.) with a small epsilon gradient, so
//                 every land cell drains; basins deeper than lakeDepth become lakes
//   D8 + flow     steepest-descent directions on the filled surface, flow accumulation (rain per cell)
//   extraction    cells above the creek threshold are streams; chains run head -> confluence along the
//                 main stem (the bigger upstream wins at each junction), split creek / river where the
//                 flow passes the river threshold, broken at lakes (a lake's outlet starts a new chain)
//   polylines     Chaikin smoothing, resampling, per-point width / depth / flow / slope / elevation,
//                 meanders in flat stretches (wavelength and amplitude scale with width; tributary
//                 mouths are re-snapped onto the moved parent), signed curvature for bars and cut banks
//   features      rapids (steep runs), falls (drops over a short run, one or two tiers), lakes, mouths
//                 at the sea, confluences, springs and gravel bars on the inside of bends
//   crossings     where road polylines cross the water: culvert, ford or bridge by river width
//
//   const R = generateRivers(seed, w, h, opts)
//   R.height                      { w, h, cell, gw, gh, data: Float32Array }  (heightAt(R.height, x, y))
//   R.rivers[i]                   { id, kind: 'river'|'creek', points: [{x,y,w,depth,flow,slope,z,curv,s}],
//                                   end: 'sea'|'lake'|'join'|'edge', into, intoAt, fromLake, toLake, length }
//   R.lakes[i]                    { id, x, y, level, cells, area, bbox: [x0,y0,x1,y1], outlet: {x,y} }
//   R.features[i]                 { type: 'rapids'|'fall'|'lake'|'mouth'|'confluence'|'spring'|'bar', x, y, ... }
//   R.crossings(roads, opts)      roads: [{ points: [[x,y]...], width, kind }] -> [{ x, y, kind, ... }]
//   R.grid                        { gw, gh, cell, filled, acc, dir, lake, sea } raw rasters
// Also exported: riverFromPath (a hand-shaped river run through the same pipeline), pickReach / fitReach
// (lift a good stretch of a generated river into a scene), findCrossings, detectFeatures, heightAt.

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---- seeded noise ------------------------------------------------------------------------------------
export function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 0x9e3779b9, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
export function vnoise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let tx = x - ix, ty = y - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
export function fbm(x, y, oct = 4, seed = 0) {
  let s = 0, amp = 0.5, tot = 0, f = 1;
  for (let o = 0; o < oct; o++) { s += vnoise2(x * f + o * 17.3, y * f - o * 11.1, seed + o * 101) * amp; tot += amp; amp *= 0.5; f *= 2.03; }
  return s / tot;
}

// ---- a binary min-heap of (key, cell) for the priority flood ------------------------------------------
class Heap {
  constructor(n) { this.k = new Float64Array(n); this.v = new Int32Array(n); this.n = 0; }
  push(key, val) {
    const k = this.k, v = this.v; let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], n = --this.n, lk = k[n], lv = v[n];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
    k[i] = lk; v[i] = lv; return top;
  }
}
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

export const RIVER_DEFAULTS = {
  cell: 16,            // grid spacing, world px
  scale: 1100,         // size of the big landforms, world px
  relief: 170,         // elevation range, world px (z)
  sea: 'south',        // 'north' | 'south' | 'east' | 'west' | null (then water leaves by the map edges)
  seaWidth: 0.1,       // mean sea depth into the map, fraction of the map's extent across the coast
  edgeRaise: 0.35,     // raise the non-sea borders (fraction of relief) so water heads for the sea
  terraces: 0.85,      // strength of the terrace steps (benches and cliffs) in rocky patches, 0..1
  stepH: 40,           // terrace step height, world px
  rain: 0.5,           // how much rainfall varies across the map, 0..1
  creekFlow: 3,      // flow (catchment area in 10 000 px^2) where a creek begins
  riverFlow: 14,        // flow where a creek becomes a river
  widthK: 5.5,           // width = widthK * sqrt(flow), clamped to [minW, maxW]
  minW: 5, maxW: 140,
  lakeDepth: 3,        // a filled basin deeper than this (world px) is a lake...
  lakeMinCells: 6,     // ...if it covers at least this many cells
  meander: 1,          // meander strength (0 = none)
  flatSlope: 0.035,    // below this slope a stretch counts as flat (meanders, bars)
  rapidSlope: 0.11,    // above this slope: rapids
  fallSlope: 0.5,      // above this slope: a waterfall...
  fallDrop: 14,        // ...if the drop over the run is at least this (world px); 2 tiers past fallDrop * 2.6
  barCurv: 0.006,      // curvature (1/px) at a bend apex for a gravel bar
};

// ---- the height map ----------------------------------------------------------------------------------
export function makeHeight(seed, w, h, o) {
  const cell = o.cell, gw = Math.floor(w / cell) + 1, gh = Math.floor(h / cell) + 1, N = gw * gh;
  const data = new Float32Array(N), sea = new Uint8Array(N), S = o.scale, R = o.relief;
  const side = o.sea, vert = side === 'south' || side === 'north', across = vert ? h : w, along = vert ? w : h;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = i * cell, y = j * cell, k = j * gw + i;
    let inland = 1, dc = 1e9;
    if (side) {
      const d = side === 'south' ? h - y : side === 'north' ? y : side === 'east' ? w - x : x;
      const a = vert ? x : y;
      const cw = o.seaWidth * across * (0.45 + 1.1 * fbm(a / (S * 0.7), 3.7, 3, seed + 11));
      dc = d - cw;
      inland = clamp(dc / Math.max(1, across - cw));
    }
    const n = fbm(x / S, y / S, 5, seed), ridge = 1 - Math.abs(2 * fbm(x / (S * 0.55), y / (S * 0.55), 4, seed + 5) - 1);
    let e = R * (0.1 + 0.5 * Math.pow(inland, 0.85)) + R * 0.7 * (n - 0.5) + R * 0.2 * ridge * (0.3 + inland);
    // keep the other borders high so the land drains to the sea, not off the map
    if (side) {
      let m = 1e9;
      if (side !== 'north') m = Math.min(m, y); if (side !== 'south') m = Math.min(m, h - y);
      if (side !== 'west') m = Math.min(m, x); if (side !== 'east') m = Math.min(m, w - x);
      e += R * o.edgeRaise * (1 - sstep(0, along * 0.08, m));
    }
    // terraces: flat benches broken by steep risers, in patches of hard rock
    if (o.terraces > 0) {
      const mask = sstep(0.52, 0.62, fbm(x / (S * 1.2), y / (S * 1.2), 3, seed + 23)) * o.terraces;
      const q = e / o.stepH, f = q - Math.floor(q), ter = (Math.floor(q) + sstep(0.86, 1, f)) * o.stepH;
      e += (ter - e) * mask;
    }
    if (dc < 0) { sea[k] = 1; e = -6 + Math.max(-40, dc * 0.04); }
    else e = Math.max(0.4 + Math.min(dc, 400) * 0.004, e);
    data[k] = e;
  }
  return { w, h, cell, gw, gh, data, sea };
}
// bilinear height at a world position
export function heightAt(H, x, y) {
  const fx = clamp(x / H.cell, 0, H.gw - 1.001), fy = clamp(y / H.cell, 0, H.gh - 1.001), i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, d = H.data, k = j * H.gw + i;
  return lerp(lerp(d[k], d[k + 1], tx), lerp(d[k + H.gw], d[k + H.gw + 1], tx), ty);
}

// ---- polyline helpers ------------------------------------------------------------------------------
const ATTR = ['flow', 'z'];
function chaikin(P, iters = 2) {
  for (let it = 0; it < iters; it++) {
    if (P.length < 3) return P;
    const Q = [P[0]];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], q = { x: lerp(a.x, b.x, 0.25), y: lerp(a.y, b.y, 0.25) }, r = { x: lerp(a.x, b.x, 0.75), y: lerp(a.y, b.y, 0.75) };
      for (const k of ATTR) { q[k] = lerp(a[k], b[k], 0.25); r[k] = lerp(a[k], b[k], 0.75); }
      if (i > 0) Q.push(q);
      if (i < P.length - 2) Q.push(r);
    }
    Q.push(P[P.length - 1]);
    P = Q;
  }
  return P;
}
function resample(P, step) {
  const out = [{ ...P[0] }];
  let carry = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - carry;
    while (t < L) { const u = t / L, q = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) }; for (const k of ATTR) q[k] = lerp(a[k], b[k], u); out.push(q); t += step; }
    carry = L - (t - step);
  }
  const last = P[P.length - 1], pl = out[out.length - 1];
  if (Math.hypot(last.x - pl.x, last.y - pl.y) > step * 0.35) out.push({ ...last }); else Object.assign(pl, last);
  return out;
}
function arcLength(P) { let s = 0; P[0].s = 0; for (let i = 1; i < P.length; i++) { s += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); P[i].s = s; } return s; }
// tangent at i from a window of +-k points
function tangent(P, i, k = 1) { const a = P[Math.max(0, i - k)], b = P[Math.min(P.length - 1, i + k)]; const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
// widths, depth, slope and curvature for every point (curv > 0: the bend turns toward the left normal
// (ty, -tx) - the inside of the bend is on that side)
function profile(P, o, step) {
  arcLength(P);
  const k = Math.max(1, Math.round(o.cell * 0.6 / step));
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    p.w = clamp(o.widthK * Math.sqrt(Math.max(0, p.flow)), o.minW, o.maxW);
    p.depth = +(1.5 + 0.12 * p.w).toFixed(2);
    const a = P[Math.max(0, i - k)], b = P[Math.min(P.length - 1, i + k)];
    p.slope = Math.max(0, (a.z - b.z) / Math.max(1e-3, b.s - a.s));
  }
  curvature(P);
}
function curvature(P) {
  arcLength(P);
  for (let i = 0; i < P.length; i++) {
    const kk = Math.max(2, Math.round((P[i].w || 10) * 0.25 / Math.max(1, (P[P.length - 1].s / Math.max(1, P.length - 1)))));
    const [ax, ay] = tangent(P, Math.max(0, i - kk), 1), [bx, by] = tangent(P, Math.min(P.length - 1, i + kk), 1);
    const a0 = P[Math.max(0, i - kk)], a1 = P[Math.min(P.length - 1, i + kk)], ds = Math.max(1, a1.s - a0.s);
    P[i].curv = -(ax * by - ay * bx) / ds;
  }
}
// meanders: sideways displacement along the normal where the bed is flat, wavelength ~11 widths and
// amplitude ~0.9 width, tapered to nothing at both ends (so junctions stay put)
function meander(P, o, seed) {
  if (!o.meander || P.length < 4) return;
  const L = P[P.length - 1].s, r0 = hash2(seed, 7, 991) * TAU, wob = hash2(seed, 9, 993) * 100;
  let ph = r0;
  const off = new Float32Array(P.length);
  for (let i = 0; i < P.length; i++) {
    const p = P[i], lam = Math.max(60, 11 * p.w), ds = i ? p.s - P[i - 1].s : 0;
    ph += TAU * ds / lam * (0.8 + 0.4 * vnoise2(p.s / 300, wob, seed));
    const flat = 1 - sstep(o.flatSlope * 0.6, o.flatSlope * 1.8, p.slope);
    const taper = sstep(0, lam * 0.45, p.s) * sstep(0, lam * 0.45, L - p.s);
    off[i] = o.meander * 0.9 * p.w * flat * taper * (Math.sin(ph) + 0.32 * Math.sin(2.3 * ph + 1.7));
  }
  const nx = [], ny = [];
  for (let i = 0; i < P.length; i++) { const [tx, ty] = tangent(P, i, 2); nx.push(ty); ny.push(-tx); }
  for (let i = 0; i < P.length; i++) { P[i].x += nx[i] * off[i]; P[i].y += ny[i] * off[i]; }
}
const round = (P) => P.map((p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), w: +p.w.toFixed(1), depth: p.depth, flow: +p.flow.toFixed(2), slope: +p.slope.toFixed(4), z: +p.z.toFixed(1), curv: +p.curv.toFixed(5), s: +p.s.toFixed(1) }));

// any polyline as river points: [[x, y, w], ...] or [{x, y, w, ...}] -> [{x,y,w,depth,flow,slope,z,curv,s}]
// (missing depth / slope / z / curvature are filled in; w defaults to 20)
export function prepPoints(pts) {
  const P = pts.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1], w: p[2] ?? 20 } : { ...p }));
  for (const p of P) { p.w = p.w ?? 20; p.depth = p.depth ?? 1.5 + 0.12 * p.w; p.flow = p.flow ?? (p.w / 5.5) ** 2; p.slope = p.slope ?? 0; p.z = p.z ?? 0; }
  arcLength(P);
  if (P.some((p) => p.curv == null)) curvature(P);
  return P;
}

// ---- features along one river ------------------------------------------------------------------------
// rapids, falls and bars, found from the slope and curvature profiles. Returns plain records.
export function detectFeatures(river, opts = {}) {
  const o = { ...RIVER_DEFAULTS, ...opts }, P = river.points, out = [], id = river.id ?? 0;
  if (P.length < 3) return out;
  const fall = P.map((p) => p.slope >= o.fallSlope), rap = P.map((p) => p.slope >= o.rapidSlope);
  // falls: runs of very steep bed; the drop is measured from a little above to a little below the run
  for (let i = 0; i < P.length; i++) {
    if (!fall[i]) continue;
    let j = i; while (j + 1 < P.length && fall[j + 1]) j++;
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, j + 1)], drop = a.z - b.z;
    let m = i; for (let k = i; k <= j; k++) if (P[k].slope > P[m].slope) m = k;
    if (drop >= o.fallDrop) {
      const [tx, ty] = tangent(P, m, 2);
      out.push({ type: 'fall', river: id, i: m, i0: i, i1: j, x: P[m].x, y: P[m].y, drop: +drop.toFixed(1), w: P[m].w, dir: [+tx.toFixed(3), +ty.toFixed(3)], tiers: drop >= o.fallDrop * 2.6 ? 2 : 1 });
      for (let k = i; k <= j; k++) rap[k] = false;
    }
    i = j;
  }
  // rapids: steep runs at least two widths long (not counting the falls themselves)
  for (let i = 0; i < P.length; i++) {
    if (!rap[i] || fall[i]) continue;
    let j = i; while (j + 1 < P.length && rap[j + 1] && !fall[j + 1]) j++;
    const len = P[j].s - P[i].s;
    if (len >= Math.max(20, P[i].w * 1.2)) { const m = (i + j) >> 1; let sm = 0; for (let k = i; k <= j; k++) sm = Math.max(sm, P[k].slope); out.push({ type: 'rapids', river: id, i0: i, i1: j, x: P[m].x, y: P[m].y, len: +len.toFixed(1), strength: +clamp((sm - o.rapidSlope) / Math.max(1e-3, o.fallSlope - o.rapidSlope)).toFixed(2) }); }
    i = j;
  }
  // gravel bars at the apex of tight bends in flat stretches, on the inside
  for (let i = 2; i < P.length - 2; i++) {
    const c = Math.abs(P[i].curv);
    if (c * P[i].w < o.barCurv * 40 || P[i].slope > o.flatSlope * 1.5 || P[i].w < 10) continue;
    const prev = out.length ? out[out.length - 1] : null;
    if (prev && prev.type === 'bar' && P[i].s - P[prev.i].s < P[i].w * 2.5) continue;
    if (c < Math.abs(P[i - 1].curv) || c < Math.abs(P[i + 1].curv) || c < Math.abs(P[i - 2].curv) || c < Math.abs(P[i + 2].curv)) continue;
    const [tx, ty] = tangent(P, i, 2), sg = Math.sign(P[i].curv);
    out.push({ type: 'bar', river: id, i, x: P[i].x + ty * sg * P[i].w * 0.4, y: P[i].y - tx * sg * P[i].w * 0.4, side: sg, n: [+(ty * sg).toFixed(3), +(-tx * sg).toFixed(3)], size: +(P[i].w * (0.5 + Math.min(1, c * P[i].w * 2))).toFixed(1) });
  }
  return out;
}

// ---- the generator ---------------------------------------------------------------------------------
export function generateRivers(seed = 1, w = 4096, h = 2730, opts = {}) {
  const o = { ...RIVER_DEFAULTS, ...opts }, cell = o.cell;
  const H = makeHeight(seed, w, h, o), { gw, gh, data, sea } = H, N = gw * gh;
  const hasSea = sea.some((v) => v);
  // priority flood from the outlets (the sea, or the map edges when there is none)
  const F = new Float32Array(N), seen = new Uint8Array(N), seed0 = new Uint8Array(N), heap = new Heap(N), eps = 1e-3;
  const border = (i, j) => i === 0 || j === 0 || i === gw - 1 || j === gh - 1;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i;
    if (sea[k] || (!hasSea && border(i, j)) || (hasSea && o.edgeOutlets && border(i, j))) { F[k] = data[k]; seen[k] = 1; seed0[k] = 1; heap.push(F[k], k); }
  }
  while (heap.n) {
    const c = heap.pop(), ci = c % gw, cj = (c / gw) | 0;
    for (const [dx, dy] of NB) {
      const i = ci + dx, j = cj + dy; if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
      const n = j * gw + i; if (seen[n]) continue;
      seen[n] = 1; F[n] = Math.max(data[n], F[c] + eps * (dx && dy ? 1.414 : 1)); heap.push(F[n], n);
    }
  }
  // D8 steepest descent on the filled surface
  const dir = new Int32Array(N).fill(-1);
  for (let k = 0; k < N; k++) {
    if (seed0[k]) continue;
    const ci = k % gw, cj = (k / gw) | 0; let best = -1, bs = 0;
    for (const [dx, dy] of NB) {
      const i = ci + dx, j = cj + dy; if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
      const n = j * gw + i, s = (F[k] - F[n]) / (dx && dy ? 1.414 : 1);
      if (s > bs) { bs = s; best = n; }
    }
    dir[k] = best;
  }
  // flow accumulation, high to low; rain varies a little across the map
  const order = new Int32Array(N); for (let k = 0; k < N; k++) order[k] = k;
  order.sort((a, b) => F[b] - F[a]);
  const acc = new Float32Array(N), area = cell * cell / 1e4;
  for (let k = 0; k < N; k++) acc[k] = area * (1 - o.rain * 0.5 + o.rain * fbm((k % gw) * cell / (o.scale * 1.5), ((k / gw) | 0) * cell / (o.scale * 1.5), 2, seed + 41));
  for (const k of order) if (dir[k] >= 0) acc[dir[k]] += acc[k];
  // lakes: filled basins deep and wide enough
  const lake = new Int32Array(N).fill(-1), lakes = [];
  const deep = (k) => !seed0[k] && F[k] - data[k] > o.lakeDepth;
  for (let k0 = 0; k0 < N; k0++) {
    if (lake[k0] >= 0 || !deep(k0)) continue;
    const comp = [k0], id = lakes.length; lake[k0] = id;
    for (let q = 0; q < comp.length; q++) {
      const c = comp[q], ci = c % gw, cj = (c / gw) | 0;
      for (const [dx, dy] of NB) { const i = ci + dx, j = cj + dy; if (i < 0 || j < 0 || i >= gw || j >= gh) continue; const n = j * gw + i; if (lake[n] < 0 && deep(n)) { lake[n] = id; comp.push(n); } }
    }
    if (comp.length < o.lakeMinCells) { for (const c of comp) lake[c] = -2; continue; }
    let sx = 0, sy = 0, lv = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, out = null, outF = 1e9;
    for (const c of comp) {
      const x = (c % gw) * cell, y = ((c / gw) | 0) * cell; sx += x; sy += y; lv = Math.max(lv, F[c]);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      const d = dir[c]; if (d >= 0 && lake[d] !== id && F[c] < outF) { outF = F[c]; out = d; }
    }
    lakes.push({ id, x: +(sx / comp.length).toFixed(1), y: +(sy / comp.length).toFixed(1), level: +lv.toFixed(1), cells: comp.length, area: comp.length * cell * cell, bbox: [x0 - cell / 2, y0 - cell / 2, x1 + cell / 2, y1 + cell / 2], outlet: out === null ? null : { x: (out % gw) * cell, y: ((out / gw) | 0) * cell } });
  }
  for (let k = 0; k < N; k++) if (lake[k] === -2) lake[k] = -1;
  // streams, the main upstream of every stream cell, the heads
  const creekT = o.creekFlow, riverT = o.riverFlow;
  const stream = new Uint8Array(N);
  for (let k = 0; k < N; k++) stream[k] = acc[k] >= creekT && !sea[k] && lake[k] < 0 ? 1 : 0;
  const mainUp = new Int32Array(N).fill(-1), hasUp = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    if (!stream[k]) continue;
    const d = dir[k]; if (d < 0 || !stream[d]) continue;
    hasUp[d] = 1; if (mainUp[d] < 0 || acc[k] > acc[mainUp[d]]) mainUp[d] = k;
  }
  const chains = [];
  for (let k = 0; k < N; k++) {
    if (!stream[k] || hasUp[k]) continue;
    const cells = [k]; let c = k, end = 'edge', fromLake = -1, toLake = -1;
    // a chain fed by a lake starts at the lake's edge
    { const ci = k % gw, cj = (k / gw) | 0; for (const [dx, dy] of NB) { const i = ci + dx, j = cj + dy; if (i < 0 || j < 0 || i >= gw || j >= gh) continue; const n = j * gw + i; if (dir[n] === k && lake[n] >= 0) { fromLake = lake[n]; cells.unshift(n); break; } } }
    for (let guard = 0; guard < N; guard++) {
      const d = dir[c];
      if (d < 0) { end = sea[c] ? 'sea' : 'edge'; break; }
      cells.push(d);
      if (sea[d]) { end = 'sea'; break; }
      if (lake[d] >= 0) { end = 'lake'; toLake = lake[d]; break; }
      if (!stream[d]) { end = 'edge'; break; }
      if (mainUp[d] !== c) { end = 'join'; break; }
      c = d;
    }
    chains.push({ cells, end, fromLake, toLake });
  }
  // split creek / river where the flow passes the river threshold
  const recs = [];
  for (const ch of chains) {
    const { cells } = ch; let kk = cells.findIndex((c) => lake[c] < 0 && acc[c] >= riverT);
    if (kk < 0) recs.push({ ...ch, kind: 'creek' });
    else if (kk <= (ch.fromLake >= 0 ? 1 : 0)) recs.push({ ...ch, kind: 'river' });
    else { recs.push({ cells: cells.slice(0, kk + 1), end: 'join', fromLake: ch.fromLake, toLake: -1, kind: 'creek', cont: true }); recs.push({ cells: cells.slice(kk), end: ch.end, fromLake: -1, toLake: ch.toLake, kind: 'river' }); }
  }
  // order: the biggest flow first, so ids rank rivers; which record owns each cell
  const endFlow = (r) => acc[r.cells[r.cells.length - (r.end === 'join' || r.end === 'sea' || r.end === 'lake' ? 2 : 1)]] || 0;
  recs.sort((a, b) => endFlow(b) - endFlow(a) || a.cells[0] - b.cells[0]);
  const owner = new Int32Array(N).fill(-1);
  recs.forEach((r, id) => { r.id = id; const n = r.end === 'join' || r.end === 'sea' || r.end === 'lake' ? r.cells.length - 1 : r.cells.length; for (let q = r.fromLake >= 0 ? 1 : 0; q < n; q++) if (owner[r.cells[q]] < 0) owner[r.cells[q]] = id; });
  for (const r of recs) r.into = r.end === 'join' ? owner[r.cells[r.cells.length - 1]] : -1;
  // geometry, parents before tributaries
  const step = Math.max(2, cell * 0.5), done = new Array(recs.length).fill(false), rivers = new Array(recs.length);
  const P0 = new Array(recs.length);
  const build = (r) => {
    const raw = r.cells.map((c) => {
      const x = (c % gw) * cell, y = ((c / gw) | 0) * cell;
      const z = lake[c] >= 0 ? lakes[lake[c]].level : sea[c] ? null : F[c];
      return { x, y, flow: acc[c], z };
    });
    for (let q = 0; q < raw.length; q++) if (raw[q].z === null) raw[q].z = q ? raw[q - 1].z : 0;
    if (r.end === 'join' || r.end === 'lake' || r.end === 'sea') raw[raw.length - 1].flow = raw[Math.max(0, raw.length - 2)].flow;
    if (r.fromLake >= 0 && raw.length > 1) raw[0].flow = raw[1].flow;
    let P = resample(chaikin(raw, 3), step);
    profile(P, o, step);
    P0[r.id] = P.map((p) => [p.x, p.y]);
    meander(P, o, seed * 7919 + r.id);
    // a tributary's mouth follows its parent's meanders
    if (r.into >= 0 && rivers[r.into]) {
      const par = rivers[r.into].points, pre = P0[r.into], jc = r.cells[r.cells.length - 1], jx = (jc % gw) * cell, jy = ((jc / gw) | 0) * cell;
      let bi = 0, bd = 1e18; for (let q = 0; q < pre.length; q++) { const d = (pre[q][0] - jx) ** 2 + (pre[q][1] - jy) ** 2; if (d < bd) { bd = d; bi = q; } }
      const last = P[P.length - 1], dx = par[bi].x - last.x, dy = par[bi].y - last.y, L = last.s, span = Math.min(L, Math.max(60, par[bi].w * 3));
      for (const p of P) { const k = sstep(L - span, L, p.s); p.x += dx * k; p.y += dy * k; }
      r.intoAt = bi;
    }
    curvature(P);
    rivers[r.id] = { id: r.id, kind: r.kind, points: round(P), end: r.end, into: r.into, intoAt: r.intoAt ?? -1, fromLake: r.fromLake, toLake: r.toLake, length: +P[P.length - 1].s.toFixed(1) };
    done[r.id] = true;
  };
  for (let pass = 0; pass < recs.length + 1; pass++) {
    let left = false;
    for (const r of recs) { if (done[r.id]) continue; if (r.into >= 0 && !done[r.into]) { left = true; continue; } build(r); }
    if (!left) break;
  }
  for (const r of recs) if (!done[r.id]) { r.into = -1; build(r); }
  // features
  const features = [];
  for (const rv of rivers) {
    features.push(...detectFeatures(rv, o));
    const P = rv.points, a = P[0], b = P[P.length - 1];
    if (rv.fromLake < 0 && !recs[rv.id].cont && !recs.some((q) => q.cont && q.into === rv.id) && rv.kind === 'creek') features.push({ type: 'spring', river: rv.id, x: a.x, y: a.y });
    if (rv.end === 'sea') { const [tx, ty] = tangent(P, P.length - 1, 3); features.push({ type: 'mouth', river: rv.id, x: b.x, y: b.y, w: P[P.length - 2]?.w ?? b.w, dir: [+tx.toFixed(3), +ty.toFixed(3)] }); }
    if (rv.end === 'join' && !recs[rv.id].cont) features.push({ type: 'confluence', river: rv.id, into: rv.into, x: b.x, y: b.y });
  }
  for (const L of lakes) features.push({ type: 'lake', lake: L.id, x: L.x, y: L.y, area: L.area });
  const R = {
    seed, w, h, params: o,
    height: { w, h, cell, gw, gh, data },
    grid: { gw, gh, cell, filled: F, acc, dir, lake, sea },
    rivers, lakes, features,
    crossings: (roads, co = {}) => findCrossings(rivers, roads, co),
  };
  return R;
}

// ---- a hand-shaped river through the same pipeline -------------------------------------------------
// ctrl: [[x, y, flow, z], ...] or [{x, y, flow, z}] - flow and z are interpolated where missing (flow
// defaults to the first given, z falls linearly). The result looks like a generated river record and
// carries its own features.
export function riverFromPath(ctrl, opts = {}) {
  const o = { ...RIVER_DEFAULTS, meander: 0, ...opts };
  const C = ctrl.map((c) => (Array.isArray(c) ? { x: c[0], y: c[1], flow: c[2], z: c[3] } : { ...c }));
  const f0 = C.find((c) => c.flow != null)?.flow ?? 4;
  for (let i = 0; i < C.length; i++) { if (C[i].flow == null) C[i].flow = i ? C[i - 1].flow : f0; if (C[i].z == null) C[i].z = i ? C[i - 1].z - 1 : 50; }
  const step = opts.step ?? Math.max(2, o.cell * 0.25);
  const P = resample(chaikin(C, o.smooth ?? 3), step);
  profile(P, { ...o, cell: opts.slopeWin ?? o.cell }, step);
  meander(P, o, o.seed ?? 1);
  curvature(P);
  const rv = { id: o.id ?? 0, kind: o.kind ?? (P[P.length - 1].w >= clamp(o.widthK * Math.sqrt(o.riverFlow), o.minW, o.maxW) ? 'river' : 'creek'), points: round(P), end: o.end ?? 'edge', into: -1, intoAt: -1, fromLake: -1, toLake: -1, length: +P[P.length - 1].s.toFixed(1) };
  rv.features = detectFeatures(rv, o);
  return rv;
}

// ---- lifting a stretch of a generated river into a scene -------------------------------------------
// the most river-like reach of the given length: sinuosity near `sinuosity`, no falls or mouth inside
// (unless allowed), wide enough. -> { river, i0, i1, points } or null
export function pickReach(R, length, o = {}) {
  const want = o.sinuosity ?? 1.35, minW = o.minW ?? 20;
  let best = null, bs = -1e9;
  for (const rv of R.rivers) {
    if (rv.kind !== (o.kind || 'river') || rv.length < length) continue;
    const P = rv.points, falls = R.features.filter((f) => f.river === rv.id && f.type === 'fall');
    for (let i0 = 0; i0 < P.length; i0 += 3) {
      let i1 = i0; while (i1 < P.length - 1 && P[i1].s - P[i0].s < length) i1++;
      if (P[i1].s - P[i0].s < length * 0.98) break;
      const chord = Math.hypot(P[i1].x - P[i0].x, P[i1].y - P[i0].y), sin = (P[i1].s - P[i0].s) / Math.max(1, chord);
      let mw = 0; for (let k = i0; k <= i1; k++) mw += P[k].w; mw /= i1 - i0 + 1;
      if (mw < minW) continue;
      const hasFall = falls.some((f) => f.i >= i0 && f.i <= i1);
      if (hasFall && !o.allowFalls) continue;
      if (rv.end === 'sea' && i1 >= P.length - 2 && !o.allowMouth) continue;
      const sc = -Math.abs(sin - want) * 4 + Math.min(1, mw / 60) * 0.5 - (o.straightEnds ? 0 : 0);
      if (sc > bs) { bs = sc; best = { river: rv.id, i0, i1, sinuosity: +sin.toFixed(3), points: P.slice(i0, i1 + 1) }; }
    }
  }
  return best;
}
// map a reach so its first point lands on a and its last on b (a similarity transform), widths scaled
// to a mean of o.width (or by the same scale), curvature rescaled
export function fitReach(points, a, b, o = {}) {
  const p0 = points[0], p1 = points[points.length - 1];
  const vx = p1.x - p0.x, vy = p1.y - p0.y, ux = b[0] - a[0], uy = b[1] - a[1];
  const k = Math.hypot(ux, uy) / Math.max(1e-6, Math.hypot(vx, vy)), rot = Math.atan2(uy, ux) - Math.atan2(vy, vx), c = Math.cos(rot) * k, s = Math.sin(rot) * k;
  const flip = o.mirror ? -1 : 1;
  let mw = 0; for (const p of points) mw += p.w; mw /= points.length;
  const wk = o.width ? o.width / mw : k;
  const out = points.map((p) => {
    const dx = p.x - p0.x, dy = (p.y - p0.y), qx = dx, qy = dy;
    return { ...p, x: a[0] + c * qx - s * qy, y: a[1] + s * qx + c * qy, w: p.w * wk, depth: p.depth * wk, curv: p.curv / k, s: (p.s - p0.s) * k, slope: p.slope / k };
  });
  if (flip < 0) { // mirror across the a-b line (a river that bends the other way)
    const L = Math.hypot(ux, uy), ex = ux / L, ey = uy / L;
    for (const p of out) { const dx = p.x - a[0], dy = p.y - a[1], t = dx * ex + dy * ey; p.x = a[0] + 2 * t * ex - dx; p.y = a[1] + 2 * t * ey - dy; p.curv = -p.curv; }
  }
  return out;
}

// soften a polyline (Gaussian over arc length, `radius` px), ends held in place; curvature recomputed
export function smoothPath(points, radius = 40) {
  const P = points.map((p) => ({ ...p })); arcLength(P);
  const L = P[P.length - 1].s, out = P.map((p) => ({ ...p }));
  for (let i = 0; i < P.length; i++) {
    let sx = 0, sy = 0, sw = 0;
    for (let j = i; j >= 0 && P[i].s - P[j].s < radius * 2; j--) { const w = Math.exp(-(((P[i].s - P[j].s) / radius) ** 2) * 2); sx += P[j].x * w; sy += P[j].y * w; sw += w; }
    for (let j = i + 1; j < P.length && P[j].s - P[i].s < radius * 2; j++) { const w = Math.exp(-(((P[j].s - P[i].s) / radius) ** 2) * 2); sx += P[j].x * w; sy += P[j].y * w; sw += w; }
    const k = sstep(0, radius, P[i].s) * sstep(0, radius, L - P[i].s);
    out[i].x = lerp(P[i].x, sx / sw, k); out[i].y = lerp(P[i].y, sy / sw, k);
  }
  curvature(out);
  return out;
}

// ---- road crossings -------------------------------------------------------------------------------------
// roads: [{ points: [[x,y]...] | [{x,y}...], width, kind }] (or bare point arrays). A crossing of a river
// narrower than culvertW is a culvert; up to fordW on a dirt / track road it is a ford; otherwise a bridge.
// -> [{ x, y, road, river, riverKind, kind, width, depth, angle (road heading), flow (water heading), span }]
export function findCrossings(rivers, roads, o = {}) {
  const culvertW = o.culvertW ?? 16, fordW = o.fordW ?? 34, out = [];
  roads.forEach((rd, ri) => {
    const pts = (Array.isArray(rd) ? rd : rd.points).map((p) => (Array.isArray(p) ? p : [p.x, p.y]));
    const kind = Array.isArray(rd) ? 'paved' : rd.kind || 'paved', rw = Array.isArray(rd) ? 40 : rd.width || 40;
    for (let a = 0; a < pts.length - 1; a++) {
      const [ax, ay] = pts[a], [bx, by] = pts[a + 1], minx = Math.min(ax, bx), maxx = Math.max(ax, bx), miny = Math.min(ay, by), maxy = Math.max(ay, by);
      for (const rv of rivers) {
        const P = rv.points;
        for (let i = 0; i < P.length - 1; i++) {
          const p = P[i], q = P[i + 1];
          if (Math.max(p.x, q.x) < minx || Math.min(p.x, q.x) > maxx || Math.max(p.y, q.y) < miny || Math.min(p.y, q.y) > maxy) continue;
          const rx = bx - ax, ry = by - ay, sx = q.x - p.x, sy = q.y - p.y, den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((p.x - ax) * sy - (p.y - ay) * sx) / den, u = ((p.x - ax) * ry - (p.y - ay) * rx) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const x = ax + rx * t, y = ay + ry * t, w = lerp(p.w, q.w, u), depth = lerp(p.depth, q.depth, u);
          if (out.some((c) => c.road === ri && c.river === rv.id && Math.hypot(c.x - x, c.y - y) < Math.max(w, rw))) continue;
          const ang = Math.atan2(ry, rx), fl = Math.atan2(sy, sx), sin = Math.abs(Math.sin(fl - ang)) || 1e-3;
          const k = w < culvertW ? 'culvert' : w < fordW && (kind === 'dirt' || kind === 'track') ? 'ford' : 'bridge';
          out.push({ x: +x.toFixed(1), y: +y.toFixed(1), road: ri, river: rv.id, riverKind: rv.kind, kind: k, width: +w.toFixed(1), depth: +depth.toFixed(2), angle: +ang.toFixed(3), flow: +fl.toFixed(3), span: +(w / sin + (k === 'bridge' ? 24 : 8)).toFixed(1), roadWidth: rw });
        }
      }
    }
  });
  return out;
}
