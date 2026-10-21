// Art v2 water: the painters and sprites for the procedural water system (rivergen.js), built to the
// W1 river-country and W2 water-kit targets.
//
// Ground painters (straight into a scene G-buffer, flagged F_GROUND | F_WATER for the water):
//   paintRiver(G, river, opts)   a river or creek from rivergen (or any [[x, y, w], ...] polyline): depth-
//                                tinted teal-blue water, clear shallows over pebbles, a darker channel that
//                                swings to the outside of bends, current lines that follow the flow (opts.
//                                phase 0..1 animates them and loops), whitewater on rapids, banks (grassy,
//                                mud, gravel, rocky, sand, cut) and gravel bars on the inside of bends.
//                                -> info { isWater(x, y), region(x, y), depth(x, y), bank(side, k, spacing) }
//   paintPond(G, inside, opts)   a pool or lake from a mask, deepening away from the shore
//   paintSea(G, isSea, opts)     open sea: depth bands, a lattice of swell lines, surf foam along the shore
//   foamPatch / foamRing / ripples   whitewater in a plunge pool, round a rock in a current, rings
// World water for the live game's chunk baker (client/art2/game/groundbake.js), per pixel in world
// coordinates and allocation free: waterTiles / waterPx (the end of this file: every creek, river, lake, pond, the
// marsh and the sea, see-through over their beds, with the light pass's word for each pixel). Result in WQ.
// Painted water keeps a per-buffer depth map, so a tributary meets its parent without a seam and banks
// never overwrite water that is already there.
//
// Sprites (voxel models, see voxel.js; render(0) faces the camera):
//   fallModel(o) / waterfall(o) / waterfallFrames(o, n)  ledge fall, two-tier fall, tall cliff fall with
//                                mist, concrete weir: basalt columns, white-blue falling sheets with streaks
//                                that run down from frame to frame, a churn of foam at the foot
//   stoneBridge, roadBridge, footbridge, culvert, steppingStone, canoe
// A bridge deck stands faceH above the water: place it with deckAt() so its deck lands on the road and its
// face hangs down over the river (the river reads as running below the road).
import { GBuf, F_GROUND, F_WATER, F_WET, F_NOCAST, hash, vnoise, bayer, step, norm } from './gbuf.js';
import { MAT, ramp } from './palette.js';
import { Vox } from './voxel.js';
import { person } from './people.js';
import { distSq } from './scene.js';
import { prepPoints, detectFeatures } from './rivergen.js';
import { worley, vnc, hh, shadeStep as sd } from './ground.js';
import { T, TILE } from '../../shared/constants.js';
import { DISTRICTS } from '../../shared/mapcore.js';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const R = (h, n = 6, k, o) => ramp(h, n, k ?? Math.floor((n - 1) / 2), o);

// ---- palettes ----------------------------------------------------------------------------------------
export const WATER = {
  deep: R('#1d6680', 7, 3, { dark: 0.55, light: 0.45, shift: 0.08 }),     // the channel
  river: R('#2a8298', 7, 3, { dark: 0.52, light: 0.5, shift: 0.08 }),    // open water
  shallow: R('#4aa8a2', 7, 3, { dark: 0.5, light: 0.5, shift: 0.1 }),    // over sand and pebbles
  sea: R('#1f5f8c', 7, 3, { dark: 0.6, light: 0.5, shift: 0.08 }),
  seaShallow: R('#2fa0a8', 7, 3, { dark: 0.5, light: 0.55, shift: 0.1 }),
  foam: R('#e4f2f0', 5, 2, { dark: 0.3, light: 0.6 }),
  fall: R('#cfe6ec', 6, 3, { dark: 0.42, light: 0.7, shift: 0.06 }),
};
const PEB = R('#9a9286', 6, 3, { dark: 0.5, light: 0.45, shift: 0.15 }), PEBW = R('#b8a88c', 6, 3, { dark: 0.5, light: 0.45 });
const BAR = R('#c8b896', 6, 3, { dark: 0.42, light: 0.4, shift: 0.15 }), MUD = R('#6a4e36', 6, 3, { dark: 0.55, light: 0.4 });
const SOIL = R('#7a5838', 6, 3, { dark: 0.55, light: 0.4 }), ROCKG = R('#77706a', 7, 3, { dark: 0.6, light: 0.45, shift: 0.18 });
const SAND = R('#dcc49a', 6, 3, { dark: 0.42, light: 0.5, shift: 0.18 });
const BASALT = R('#9a948a', 7, 3, { dark: 0.6, light: 0.5, shift: 0.12 }), MOSS = R('#6a8a34', 6, 3, { dark: 0.6, light: 0.5, shift: 0.3 });
const CONC = R('#b8b2a8', 6, 3, { dark: 0.5, light: 0.45, shift: 0.15 }), STONE = R('#948a7c', 7, 3, { dark: 0.58, light: 0.48, shift: 0.18 });
const UP = [0, 0, 1];

// a Worley cell: distance to the nearest pebble centre, its hash, the offset from it, the second distance
function cellPt(x, y, sz, seed) {
  const cx = Math.floor(x / sz), cy = Math.floor(y / sz);
  let b = 1e9, b2 = 1e9, bh = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gy = cy + j, h = hash(gx, gy, seed);
    const px = (gx + 0.15 + 0.7 * h) * sz, py = (gy + 0.15 + 0.7 * hash(gy, gx, seed + 1)) * sz, dx = x - px, dy = y - py, d = dx * dx + dy * dy;
    if (d < b) { b2 = b; b = d; bh = h; bx = dx; by = dy; } else if (d < b2) b2 = d;
  }
  return [Math.sqrt(b), bh, bx, by, Math.sqrt(b2)];
}
// pebbles and cobbles: a stone colour where a pebble is, else null. size: cell size, fill 0..1
function pebbleAt(x, y, sz, seed, fill = 0.4, Rm = PEB) {
  const [d, h, dx, dy] = cellPt(x, y, sz, seed), r = sz * fill * (0.7 + 0.6 * h);
  if (d > r) return null;
  let t = 0.5 + (h - 0.5) * 0.4 - (dx + dy) / r * 0.22;
  if (d > r - 1) t -= 0.25;
  return step(h > 0.8 ? PEBW : Rm, t, x, y, 0.4);
}
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ---- the depth map that keeps overlapping water consistent --------------------------------------------
const DEPTHS = new WeakMap();
function depthMap(G) { let d = DEPTHS.get(G); if (!d) { d = new Float32Array(G.w * G.h).fill(-1); DEPTHS.set(G, d); } return d; }
export const waterDepth = (G, x, y) => (G.inside(x, y) ? depthMap(G)[(y | 0) * G.w + (x | 0)] : -1);
const isWaterPx = (G, i) => (G.flag[i] & F_WATER) !== 0;

// a periodic Worley cell along s (the pattern repeats every `per` cells, so a drift of per * sz px per
// animation loop comes back to the first frame)
function cellPer(s, v, sz, per, seed) {
  const cx = Math.floor(s / sz), cy = Math.floor(v / sz);
  let b = 1e9, b2 = 1e9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gy = cy + j, wx = ((gx % per) + per) % per, h = hash(wx, gy, seed);
    const px = (gx + 0.15 + 0.7 * h) * sz, py = (gy + 0.15 + 0.7 * hash(gy, wx, seed + 1)) * sz, d = (s - px) ** 2 + (v - py) ** 2;
    if (d < b) { b2 = b; b = d; } else if (d < b2) b2 = d;
  }
  return Math.sqrt(b2) - Math.sqrt(b);
}
// one pixel of moving water. dd: depth 0 (edge) .. 1 (deep); s, v: along / across the flow (px);
// cur: current strength 0..1; rap: whitewater 0..1; phase: animation 0..1 (loops)
function streamPx(x, y, dd, s, v, cur, rap, phase, seed, pal = WATER.river) {
  const big = vnoise(x, y, 37, seed + 3), fine = vnoise(x, y, 7, seed + 5);
  let t = 0.6 - dd * 0.3 + (big - 0.5) * 0.16 + (fine - 0.5) * 0.06, c, e = null;
  // current lines: long thin streaks along the flow under a still envelope; the carrier drifts with the phase
  const wob = 2.6 * Math.sin(s * 0.037 + seed + Math.floor(v / 40)), lane = Math.floor((v + wob) / 4.2), lv = (v + wob) / 4.2 - lane;
  const lh = hash(lane, 7, seed), env = vnoise(s * 0.5 + lh * 400, lane * 13.1, 14, seed + 9);
  const car = Math.sin(TAU * (s / (44 + lh * 30) - phase * (1 + Math.floor(lh * 2))) + lh * 40);
  const streak = cur > 0 && lv < 0.3 && env > 0.66 - cur * 0.16 && car > -0.1;
  if (streak) t += car > 0.75 ? 0.36 : 0.18;
  // a slow swell across the flow
  const sw = Math.sin(s * 0.19 - phase * TAU * 2 + v * 0.05 + big * 4);
  t += sw * 0.04;
  const n = norm([sw * 0.05, Math.cos(s * 0.19) * 0.1, 1]);
  c = step(dd + bayer(x, y) * 0.2 > 0.62 ? WATER.deep : pal, t, x, y, 0.7);
  if (streak && car > 0.93 && env > 0.8) c = step(WATER.foam, 0.4, x, y, 0.3);
  if (streak && car > 0.9 && hash(x, y, seed + 13) > 0.93) e = [255, 240, 205, 110];
  // whitewater: a net of foam lines (the edges of Worley cells) drifting downstream, densest on strong rapids
  if (rap > 0.02) {
    const sz = 7, ws = s + (vnoise(x, y, 6, seed + 29) - 0.5) * 9, wv = v * 1.3 + (vnoise(x, y, 5, seed + 31) - 0.5) * 8;
    const edge = cellPer(ws - phase * sz * 6, wv, sz, 6, seed + 19), edge2 = cellPer(ws * 1.6 - phase * sz * 12 + 31, wv * 1.2, sz, 12, seed + 23);
    const th = 0.25 + rap * 0.85;
    if (edge < th * (0.5 + fine * 1.0)) c = step(WATER.foam, 0.55 + (1 - edge / th) * 0.45, x, y, 0.4);
    else if (edge2 < rap * 0.6 && fine > 0.5) c = step(WATER.foam, 0.3, x, y, 0.5);
    else if (edge > 4) c = step(WATER.deep, 0.25 + fine * 0.25, x, y, 0.5);
    else c = step(pal, 0.4 + fine * 0.2, x, y, 0.5);
    if (hash(x, y, seed + 17) > 0.996 - rap * 0.02) e = [255, 250, 235, 100];
  }
  return { c, e, n };
}

// ---- rivers -------------------------------------------------------------------------------------------------
// opts: phase (0..1), seed, clip [x0,y0,x1,y1], banks: 'grassy'|'mud'|'gravel'|'rocky'|'sand'|'cut' or
// { left, right } or fn(i, side, p) -> kind (side +1 = left of the flow), bankW, bars (true), barK,
// rapids: [[i0, i1, strength]] (default: from the points' slope), rapidSlope, current (1), calm (0..1),
// pal: a ramp for open water, edgeNoise (1)
// curvature measured over a window that scales with the width, then smoothed: what decides bars and the
// channel's swing should follow the bends, not every wiggle of the centreline
function bendCurvature(P) {
  const n = P.length; if (n < 3) return;
  const tan = (i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [(b.x - a.x) / l, (b.y - a.y) / l]; };
  const raw = new Float32Array(n);
  let j0 = 0, j1 = 0;
  for (let i = 0; i < n; i++) {
    const r = P[i].w * 0.8;
    while (j0 < i && P[i].s - P[j0].s > r) j0++;
    while (j1 < n - 1 && P[j1].s - P[i].s < r) j1++;
    const [ax, ay] = tan(j0), [bx, by] = tan(j1);
    raw[i] = -Math.atan2(ax * by - ay * bx, ax * bx + ay * by) / Math.max(1, P[j1].s - P[j0].s);
  }
  for (let i = 0; i < n; i++) {
    const r = P[i].w * 0.6; let sm = 0, c = 0;
    for (let j = i; j >= 0 && P[i].s - P[j].s <= r; j--) { sm += raw[j]; c++; }
    for (let j = i + 1; j < n && P[j].s - P[i].s <= r; j++) { sm += raw[j]; c++; }
    P[i].curv = sm / c;
  }
}
function densify(pts, step = 6) {
  if (!Array.isArray(pts[0])) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 1; k <= n; k++) out.push(a.map((v, j) => v + ((b[j] ?? v) - v) * k / n)); }
  return out;
}
export function paintRiver(G, river, opts = {}) {
  const P = prepPoints(densify(river.points || river)), n = P.length;
  bendCurvature(P);
  const seed = opts.seed ?? 7, phase = opts.phase ?? 0, D = depthMap(G), pal = opts.pal || WATER.river;
  const clip = (opts.clip || [0, 0, G.w, G.h]).map(Math.round);
  let maxW = 0; for (const p of P) maxW = Math.max(maxW, p.w);
  const bankW = (i) => opts.bankW ?? Math.max(4, Math.min(14, P[i].w * 0.14));
  const margin = maxW / 2 + (opts.bankW ?? 14) + 4;
  // rapids strength per point
  const rap = new Float32Array(n);
  const rs = opts.rapidSlope ?? 0.11;
  if (opts.rapids) for (const [a, b, k] of opts.rapids) for (let i = Math.max(0, a); i <= Math.min(n - 1, b); i++) rap[i] = Math.max(rap[i], (k ?? 1) * Math.min(1, Math.min(i - a + 1, b - i + 1) / 3));
  else for (let i = 0; i < n; i++) rap[i] = clamp((P[i].slope - rs) / (rs * 3));
  // bank kind per point and side
  const bk = typeof opts.banks === 'function' ? opts.banks : (i, side) => (typeof opts.banks === 'object' && opts.banks ? (side > 0 ? opts.banks.left : opts.banks.right) : opts.banks) || 'grassy';
  // nearest-centreline field over the bounding box
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of P) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  x0 = Math.max(clip[0], Math.floor(x0 - margin)); y0 = Math.max(clip[1], Math.floor(y0 - margin)); x1 = Math.min(clip[2], Math.ceil(x1 + margin)); y1 = Math.min(clip[3], Math.ceil(y1 + margin));
  const fw = x1 - x0, fh = y1 - y0;
  if (fw <= 0 || fh <= 0) return null;
  const dist = new Float32Array(fw * fh).fill(1e9), seg = new Int32Array(fw * fh).fill(-1), tpar = new Float32Array(fw * fh), sgn = new Int8Array(fw * fh);
  for (let i = 0; i < n - 1; i++) {
    const a = P[i], b = P[i + 1], rr = Math.max(a.w, b.w) / 2 + bankW(i) + 4;
    const sx = b.x - a.x, sy = b.y - a.y, L2 = sx * sx + sy * sy || 1e-6;
    const bx0 = Math.max(x0, Math.floor(Math.min(a.x, b.x) - rr)), bx1 = Math.min(x1, Math.ceil(Math.max(a.x, b.x) + rr)), by0 = Math.max(y0, Math.floor(Math.min(a.y, b.y) - rr)), by1 = Math.min(y1, Math.ceil(Math.max(a.y, b.y) + rr));
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const px = x + 0.5 - a.x, py = y + 0.5 - a.y;
      let t = (px * sx + py * sy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - sx * t, dy = py - sy * t, d = Math.sqrt(dx * dx + dy * dy), k = (y - y0) * fw + x - x0;
      if (d < dist[k]) { dist[k] = d; seg[k] = i; tpar[k] = t; sgn[k] = (sx * py - sy * px) < 0 ? 1 : -1; }
    }
  }
  const region = new Uint8Array(fw * fh), deep = new Float32Array(fw * fh);
  const lastSeg = n - 2;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const k = (y - y0) * fw + x - x0, i = seg[k];
    if (i < 0) continue;
    const t = tpar[k], a = P[i], b = P[i + 1];
    // open ends stay square-ish (a river leaving the panel), not rounded
    if ((i === 0 && t <= 0 && !(opts.roundEnds || opts.roundStart)) || (i === lastSeg && t >= 1 && !(opts.roundEnds || opts.roundEnd))) continue;
    const L = (u, v) => u + (v - u) * t;
    const w = L(a.w, b.w), hw = w / 2, s = L(a.s, b.s), curv = L(a.curv, b.curv), slope = L(a.slope, b.slope), rp = L(rap[i], rap[i + 1]);
    const d = dist[k], v = d * sgn[k];
    const sx = b.x - a.x, sy = b.y - a.y, sl = Math.hypot(sx, sy) || 1, tx = sx / sl, ty = sy / sl;
    const side = v >= 0 ? 1 : -1;
    // the inside of the bend gets a gravel bar where the bed is flat; the channel swings outward
    const flat = 1 - sstep(0.03, 0.09, slope), cw = Math.abs(curv) * w, inside = Math.sign(curv) || 1;
    const barAmt = opts.bars === false ? 0 : clamp((cw - 0.1) * 2.6 * (opts.barK ?? 1)) * flat * clamp((w - 10) / 20);
    const enoise = (vnoise(s * 0.9, side * 50 + 3, 9, seed + 21) - 0.5) * Math.min(5, 1 + w * 0.06) * (opts.edgeNoise ?? 1);
    let edge = hw + enoise;
    const barW = side === inside ? barAmt * hw * 0.62 * (0.75 + 0.5 * vnoise(s, 77, 23, seed + 4)) : 0;
    edge -= barW;
    const bw = bankW(i) * (0.8 + 0.5 * vnoise(s, side * 30, 17, seed + 6));
    const gi = y * G.w + x, already = isWaterPx(G, gi);
    if (d < edge) {
      const off = -inside * Math.min(0.5, cw * 0.9) * hw;
      const q = (v - off) / (v >= off ? Math.max(1, (side > 0 ? edge : hw) - off) : Math.max(1, (side < 0 ? edge : hw) + off));
      const dd = clamp(1 - q * q) * clamp((w - 4) / 46) * (1 - (opts.calm ?? 0) * 0.3);
      if (already && D[gi] >= dd) continue;
      region[k] = 1; deep[k] = dd; D[gi] = dd;
      const ww = edge - d;
      let px;
      // clear shallows show the bed: sand and pebbles tinted by the water
      if (dd < 0.38 && !(rp > 0.5)) {
        const peb = pebbleAt(x, y, w < 30 ? 5 : 6, seed + 31, 0.42) || step(BAR, 0.35 + vnoise(x, y, 5, seed) * 0.3, x, y, 0.6);
        const wpx = streamPx(x, y, dd, s, v, (opts.current ?? 1) * clamp(dd * 3) * (1 - (opts.calm ?? 0)), rp, phase, seed, WATER.shallow);
        const k2 = clamp(0.3 + dd * 1.8 + (ww < 2 ? -0.1 : 0));
        px = { c: mix(peb, wpx.c, k2), e: wpx.e, n: wpx.n };
      } else px = streamPx(x, y, dd, s, v, (opts.current ?? 1) * (0.35 + dd * 0.65) * (1 - (opts.calm ?? 0)), rp, phase, seed, pal);
      // a thin light line where the water laps the edge; foam there on rapids
      if (ww < 1.4) px.c = rp > 0.2 ? step(WATER.foam, 0.6, x, y, 0.4) : mix(px.c, [200, 226, 220], 0.35);
      G.put(x, y, px.c, px.n, 0, px.e, F_GROUND | F_WATER);
      continue;
    }
    if (already) continue;
    if (d < hw + (side === inside ? 0 : 0) && barW > 0) {
      // gravel bar: sand and pebbles, darker and glossy near the water
      region[k] = 2;
      const wet = clamp(1 - (d - edge) / 6);
      const peb = pebbleAt(x, y, 5, seed + 41, 0.45) || step(BAR, 0.5 + (vnoise(x, y, 6, seed + 2) - 0.5) * 0.4 + (hash(x, y, seed) > 0.9 ? 0.15 : 0), x, y, 0.8);
      const big = d - edge > 6 && hash(x >> 3, y >> 3, seed + 3) > 0.93 ? pebbleAt(x, y, 9, seed + 43, 0.4, ROCKG) : null;
      let c = big || peb;
      if (wet > 0) c = shade(c, 1 - wet * 0.3);
      G.put(x, y, c, UP, 0, null, F_GROUND | F_WET);
      continue;
    }
    const outerEdge = Math.max(edge, hw);
    if (d < outerEdge + bw) {
      region[k] = 3;
      const kind = bk(i, side, a), e = (d - edge) / Math.max(1, outerEdge + bw - edge);
      // the bank's outward direction: a bank on the north side of the water shows its face to the camera
      const ny = -tx * side, faceUp = ny < -0.35;
      let c, nn = UP;
      if (kind === 'gravel' || (kind !== 'rocky' && side === inside && barAmt > 0.35)) c = pebbleAt(x, y, 5, seed + 51, 0.45) || step(BAR, 0.45 + (vnoise(x, y, 6, seed) - 0.5) * 0.4, x, y, 0.8);
      else if (kind === 'sand') c = step(SAND, 0.5 + (vnoise(x, y, 8, seed) - 0.5) * 0.3 - (e < 0.3 ? 0.2 : 0), x, y, 0.8);
      else if (kind === 'rocky') {
        const r = pebbleAt(x, y, 8, seed + 53, 0.48, ROCKG);
        c = r || step(SOIL, 0.25 + e * 0.3, x, y, 0.6);
      } else if (kind === 'mud') {
        c = step(MUD, 0.3 + e * 0.35 + (vnoise(x, y, 5, seed + 9) - 0.5) * 0.3 + (hash(x, y, seed) > 0.93 ? 0.2 : 0), x, y, 0.8);
        if (e < 0.25 && hash(x, y, seed + 2) > 0.7) c = shade(c, 0.8);
      } else { // grassy and cut banks
        const face = faceUp && (kind === 'cut' || e < 0.7);
        if (face) { c = step(SOIL, 0.22 + e * 0.35 + ((y + (x >> 3)) % 4 === 0 ? -0.12 : 0) + (hash(x, y >> 1, seed) > 0.9 ? 0.18 : 0), x, y, 0.6); nn = [0, 0.75, 0.66]; if (hash(x, y, seed + 7) > 0.92) c = step(MAT.bark, 0.3, x, y, 0); }
        else if (e < 0.3) c = step(MUD, 0.25 + e, x, y, 0.8);
        else c = step(MAT.grass, 0.18 + e * 0.3 + (hash(x, y, seed + 8) > 0.75 ? 0.15 : 0), x, y, 0.9);
      }
      G.put(x, y, c, nn, 0, null, F_GROUND | F_WET);
      continue;
    }
    // a damp fringe just outside the bank
    if (d < outerEdge + bw + 3) { const j = gi * 4; if (G.col[j + 3]) { const f = 0.82 + (d - outerEdge - bw) * 0.05; G.col[j] *= f; G.col[j + 1] *= f; G.col[j + 2] *= f * 1.02; } }
  }
  // grass blades leaning out over the water on grassy banks
  for (let y = y0 + 1; y < y1 - 1; y++) for (let x = x0 + 1; x < x1 - 1; x++) {
    const k = (y - y0) * fw + x - x0;
    if (region[k] !== 1) continue;
    const up = region[k - fw], dn = region[k + fw];
    if ((up === 3 || dn === 3) && hash(x, y, seed + 61) > 0.55) { const i = seg[k]; if (bk(i, sgn[k], P[i]) === 'grassy' || bk(i, sgn[k], P[i]) === 'cut') G.put(x, y, step(MAT.grass, 0.4 + hash(x, y, 3) * 0.3, x, y, 0), UP, 0, null, F_GROUND | F_WET); }
  }
  const at = (x, y) => { x |= 0; y |= 0; return x < x0 || y < y0 || x >= x1 || y >= y1 ? 0 : region[(y - y0) * fw + x - x0]; };
  return {
    P, x0, y0, x1, y1,
    isWater: (x, y) => at(x, y) === 1,
    region: at,
    depth: (x, y) => (at(x, y) === 1 ? deep[((y | 0) - y0) * fw + (x | 0) - x0] : 0),
    // points along a bank: side +1 left / -1 right of the flow, k: 0 at the water's edge, 1 at the bank's
    // outer edge (beyond 1 = on the land), every `spacing` px (jittered)
    bank(side, k = 0.5, spacing = 30, s0 = 0, s1 = 1e9) {
      const out = [];
      for (let s = s0 + spacing * 0.5; s < Math.min(s1, P[n - 1].s); s += spacing * (0.7 + 0.6 * hash(Math.round(s), side, seed))) {
        let i = 0; while (i < n - 2 && P[i + 1].s < s) i++;
        const p = P[i], [tx, ty] = [(P[i + 1].x - p.x), (P[i + 1].y - p.y)], l = Math.hypot(tx, ty) || 1, nx = ty / l * side, ny = -tx / l * side;
        const dd = p.w / 2 + k * Math.max(4, Math.min(14, p.w * 0.14));
        out.push({ x: p.x + nx * dd, y: p.y + ny * dd, i, side, w: p.w });
      }
      return out;
    },
    // a point on the centreline at arc length s, with tangent and width
    at(s) { let i = 0; while (i < n - 2 && P[i + 1].s < s) i++; const a = P[i], b = P[i + 1], t = clamp((s - a.s) / Math.max(1e-3, b.s - a.s)); const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1; return { x: a.x + tx * t, y: a.y + ty * t, w: a.w + (b.w - a.w) * t, tx: tx / l, ty: ty / l, i }; },
  };
}

// ---- pools and lakes -----------------------------------------------------------------------------------
// inside(x, y) -> true on the water. opts: depthR (px from the shore to full depth), bank ('rocky' | 'mud'
// | 'grassy' | 'sand'), bankW, phase, seed, rim (foam all round, for a plunge pool), lilies
export function paintPond(G, inside, opts = {}) {
  const x0 = Math.round(Math.max(0, opts.bbox?.[0] ?? 0)), y0 = Math.round(Math.max(0, opts.bbox?.[1] ?? 0)), x1 = Math.round(Math.min(G.w, opts.bbox?.[2] ?? G.w)), y1 = Math.round(Math.min(G.h, opts.bbox?.[3] ?? G.h));
  const w = x1 - x0, h = y1 - y0, m = new Uint8Array(w * h), notM = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = inside(x + x0, y + y0) ? 1 : 0; m[y * w + x] = o; notM[y * w + x] = 1 - o; }
  const dIn = distSq(notM, w, h), dOut = distSq(m, w, h), D = depthMap(G), seed = opts.seed ?? 9, phase = opts.phase ?? 0, bw = opts.bankW ?? 6, R0 = opts.depthR ?? 40;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x, X = x + x0, Y = y + y0, gi = Y * G.w + X;
    if (m[k]) {
      const d = Math.sqrt(dIn[k]), dd = clamp(d / R0) * (opts.maxDepth ?? 0.85);
      if (isWaterPx(G, gi) && D[gi] >= dd) continue;
      D[gi] = dd;
      let px;
      if (dd < 0.3) { const peb = pebbleAt(X, Y, 6, seed + 31, 0.42) || step(BAR, 0.35, X, Y, 0.6); const wp = streamPx(X, Y, dd, X * 0.7 + Y * 0.3, Y, 0.15, 0, phase, seed, WATER.shallow); px = { c: mix(peb, wp.c, clamp(0.45 + dd * 1.6)), e: wp.e, n: wp.n }; }
      else px = streamPx(X, Y, dd, X * 0.8 + Y * 0.2 + Math.sin(Y * 0.05) * 20, Y - X * 0.2, opts.current ?? 0.2, 0, phase, seed, opts.pal || WATER.river);
      if (opts.rim && d < 2.5 + vnoise(X, Y, 5, seed) * 3) px.c = step(WATER.foam, 0.5 + hash(X, Y, seed) * 0.3, X, Y, 0.4);
      else if (d < 1.2) px.c = mix(px.c, [200, 226, 220], 0.35);
      G.put(X, Y, px.c, px.n, 0, px.e, F_GROUND | F_WATER);
    } else {
      const d = Math.sqrt(dOut[k]);
      if (d > bw || isWaterPx(G, gi)) continue;
      const e = d / bw, kind = opts.bank || 'grassy';
      let c;
      if (kind === 'rocky') c = pebbleAt(X, Y, 8, seed + 53, 0.48, ROCKG) || step(SOIL, 0.25 + e * 0.3, X, Y, 0.6);
      else if (kind === 'sand') c = step(SAND, 0.4 + e * 0.2, X, Y, 0.8);
      else if (kind === 'mud') c = step(MUD, 0.3 + e * 0.35 + (vnoise(X, Y, 5, seed) - 0.5) * 0.3, X, Y, 0.8);
      else c = e < 0.4 ? step(MUD, 0.25 + e, X, Y, 0.8) : step(MAT.grass, 0.2 + e * 0.3, X, Y, 0.9);
      G.put(X, Y, c, UP, 0, null, F_GROUND | F_WET);
    }
  }
}

// ---- the sea -------------------------------------------------------------------------------------------
// isSea(x, y) -> true on open water. Depth grows with distance from the shore: turquoise shallows, then
// blue; long swell lines run parallel to the shore and break into a scalloped lattice; surf foam washes up
// in two or three bands. opts: phase, seed, bbox, shelf (px of shallows), surf (1)
export function paintSea(G, isSea, opts = {}) {
  const x0 = Math.round(Math.max(0, opts.bbox?.[0] ?? 0)), y0 = Math.round(Math.max(0, opts.bbox?.[1] ?? 0)), x1 = Math.round(Math.min(G.w, opts.bbox?.[2] ?? G.w)), y1 = Math.round(Math.min(G.h, opts.bbox?.[3] ?? G.h)), w = x1 - x0, h = y1 - y0;
  const land = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) land[y * w + x] = isSea(x + x0, y + y0) ? 0 : 1;
  const dl = distSq(land, w, h), D = depthMap(G), seed = opts.seed ?? 13, phase = opts.phase ?? 0, shelf = opts.shelf ?? 40, surf = opts.surf ?? 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x; if (land[k]) continue;
    const X = x + x0, Y = y + y0, gi = Y * G.w + X, d = Math.sqrt(dl[k]), dd = clamp(d / (shelf * 2.5));
    D[gi] = Math.max(D[gi], 1 + dd);
    const big = vnoise(X, Y, 41, seed), fine = vnoise(X, Y, 6, seed + 2);
    // swells parallel to the shore, crossing into a lattice offshore
    const f1 = d * 0.16 - phase * TAU + Math.sin(X * 0.045 + Y * 0.02) * 1.4, f2 = (X * 0.11 + Y * 0.05) + Math.sin(Y * 0.09) * 1.2 + phase * TAU;
    const l1 = Math.sin(f1), l2 = Math.sin(f2) * Math.sin(f1 * 0.5 + 1);
    const deepPal = d < shelf ? WATER.seaShallow : WATER.sea;
    let t = 0.55 - dd * 0.35 + (big - 0.5) * 0.15 + (fine - 0.5) * 0.08;
    if (d >= shelf * 0.6 && d < shelf * 1.1) t -= 0.08;
    let c = step(deepPal, t, X, Y, 0.7), e = null;
    const crest = (l1 > 0.93 && fine > 0.35) || (d > shelf * 0.7 && Math.abs(l2) > 0.9 && l1 > 0.4 && fine > 0.45);
    if (crest) c = d < shelf * 1.5 ? step(WATER.foam, 0.4 + fine * 0.4, X, Y, 0.5) : step(deepPal, 0.95, X, Y, 0.4);
    if (crest && hash(X, Y, seed + 5) > 0.97) e = [255, 246, 222, 100];
    // the wash: foam at the waterline and a broken band just beyond
    if (surf) {
      const wash = 3 + 3 * Math.sin(X * 0.07 + Y * 0.05 + phase * TAU) + fine * 2;
      if (d < wash) c = step(WATER.foam, 0.75 - d / wash * 0.3, X, Y, 0.4);
      else if (Math.abs(d - (12 + 4 * Math.sin(X * 0.05 + phase * TAU))) < 1.6 + fine * 1.5 && hash(X >> 1, Y >> 1, seed) > 0.25) c = step(WATER.foam, 0.6, X, Y, 0.4);
    }
    G.put(X, Y, c, norm([l1 * 0.05, Math.cos(f1) * 0.12, 1]), 0, e, F_GROUND | F_WATER);
  }
}

// ---- whitewater decals ---------------------------------------------------------------------------------
// churning foam in a plunge pool (densest at the centre), only over water
export function foamPatch(G, cx, cy, rx, ry, phase = 0, seed = 3, k = 1) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    if (!G.inside(x, y) || !isWaterPx(G, y * G.w + x)) continue;
    const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (q > 1) continue;
    const a = Math.atan2(y - cy, x - cx), r = Math.sqrt(q);
    const net = Math.sin(r * 18 - phase * TAU * 2 + Math.sin(a * 5 + seed) * 1.5) + Math.sin(a * 9 + r * 6 + phase * TAU) * 0.8 + (vnoise(x, y, 4, seed) - 0.5) * 1.4;
    const th = -0.8 + r * 2.3 / k;
    if (net > th) { const j = (y * G.w + x) * 4, c = step(WATER.foam, 0.4 + (net - th) * 0.35, x, y, 0.5); G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; }
  }
}
// foam round a rock standing in a current, and a V of wake trailing downstream (dir: the flow heading)
export function foamRing(G, x, y, r, dir = Math.PI / 2, phase = 0, seed = 5, k = 1) {
  const fx = Math.cos(dir), fy = Math.sin(dir), L = r * (2.2 + k);
  for (let yy = Math.floor(y - r - L); yy <= y + r + L; yy++) for (let xx = Math.floor(x - r - L); xx <= x + r + L; xx++) {
    if (!G.inside(xx, yy) || !isWaterPx(G, yy * G.w + xx)) continue;
    const dx = xx - x, dy = yy - y, along = dx * fx + dy * fy, across = -dx * fy + dy * fx, d = Math.hypot(dx, dy);
    let on = false;
    if (d < r + 1.5 + hash(xx, yy, seed) * 2) on = hash(xx, yy, seed + 1) > 0.45;
    else if (along > 0 && along < L) { const wv = Math.abs(Math.abs(across) - (r * 0.7 + along * 0.45)); on = wv < 1 && hash(xx >> 1, yy >> 1, seed + Math.floor(along / 3 - phase * 4)) > 0.45 + along / L * 0.4; }
    else if (along < 0 && along > -r * 1.2 && Math.abs(across) < r + 2) on = hash(xx, yy, seed + 2) > 0.5;
    if (on) { const j = (yy * G.w + xx) * 4, c = step(WATER.foam, 0.5 + hash(xx, yy, seed + 3) * 0.3, xx, yy, 0.4); G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; }
  }
}
// rings spreading on still water (a fishing float, a paddle stroke)
export function ripples(G, cx, cy, r = 12, n = 3, phase = 0) {
  for (let i = 0; i < n; i++) {
    const rr = ((i + phase) / n) * r + 2;
    for (let a = 0; a < TAU; a += 0.6 / rr) {
      const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr * 0.45);
      if (!G.inside(x, y) || !isWaterPx(G, y * G.w + x) || hash(x, y, i) < 0.3) continue;
      const j = (y * G.w + x) * 4, c = mix([G.col[j], G.col[j + 1], G.col[j + 2]], [226, 242, 238], 0.6 * (1 - i / n));
      G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2];
    }
  }
}
// a wake behind a boat moving along heading hd (two spreading lines and churned water at the stern)
export function wake(G, x, y, hd, len = 60, phase = 0) {
  const bx = -Math.cos(hd), by = -Math.sin(hd);
  for (let s = 6; s < len; s += 0.5) for (const sg of [-1, 1]) {
    const spread = 4 + s * 0.35, px = x + bx * s - by * spread * sg, py = y + by * s + bx * spread * sg;
    const X = Math.round(px), Y = Math.round(py);
    if (!G.inside(X, Y) || !isWaterPx(G, Y * G.w + X) || hash(X, Y, Math.floor(s / 4 - phase * 3)) < 0.35) continue;
    const j = (Y * G.w + X) * 4, c = mix([G.col[j], G.col[j + 1], G.col[j + 2]], [226, 242, 238], 0.75 * (1 - s / len));
    G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2];
  }
}

// columnar basalt: each column lit down its left (sunward) side, dark seams between columns, cross cracks
function basaltShade(x, y, z, seed) {
  const c = cellPt(x, y, 11, seed + 7), crack = 8 + Math.floor(c[1] * 7);
  return (c[4] - c[0] < 1.3 ? -1.3 : 0) - c[2] / 5.5 * 0.75 + (c[1] - 0.5) * 0.8 + (Math.round(z + c[1] * 20) % crack === 0 ? -0.8 : 0) + (z < 4 ? -0.5 : 0);
}
// ---- waterfalls ------------------------------------------------------------------------------------------
// A cliff of columnar basalt (or a concrete weir) with water pouring over a notch in it. Built facing the
// camera: model y runs north -> south, the falling sheets are on the south faces.
//   o.kind   'ledge' (a small fall over a step) | 'twoTier' (a fall into a shelf pool, then a second, split
//            fall) | 'cliff' (one tall narrow fall from a high wall, with mist) | 'weir' (a concrete sill)
//   o.width  water width; o.drop total drop (z); o.rock side rock width each side; o.frame / o.frames
//   o.streams  for the lower tier of 'twoTier': [[x0, x1], ...] relative to the centre
// The model's .face is the y of the lowest face (the anchor the sprite is placed by) and .lip the drop.
const SANDROCK = R('#c49a6a', 7, 3, { dark: 0.55, light: 0.45 });
export function fallModel(o = {}) {
  const kind = o.kind || 'ledge', seed = o.seed ?? 3, frames = o.frames || 4;
  const width = o.width ?? (kind === 'cliff' ? 22 : kind === 'weir' ? 120 : 60), drop = o.drop ?? (kind === 'cliff' ? 120 : kind === 'twoTier' ? 110 : kind === 'weir' ? 12 : 26);
  const side = o.rock ?? (kind === 'weir' ? 12 : kind === 'cliff' ? 44 : 36);
  const W = Math.round(width + side * 2), cx = W / 2;
  const tier2 = kind === 'twoTier', mid = tier2 ? Math.round(drop * 0.48) : 0;
  const d1 = kind === 'weir' ? 18 : kind === 'cliff' ? 36 : tier2 ? 34 : 26, d2 = tier2 ? d1 + 30 : d1, apron = kind === 'weir' ? 16 : kind === 'cliff' ? 26 : 20;
  const Dp = d2 + apron, Hh = drop + 14;
  const m = new Vox(W, Dp, Hh);
  const frame = { v: o.frame || 0 };
  // basalt: columns from a jittered grid (Voronoi), each with its own top; seams between columns
  const CC = new Map(), colAt = (x, y) => { const k = (x | 0) * 4096 + (y | 0); let c = CC.get(k); if (!c) { c = cellPt((x | 0) + 0.5, (y | 0) + 0.5, 11, seed + 7); CC.set(k, c); } return c; };
  // (o.stone 'sand': a resort's rockwork of warm sandstone in courses - Lucky Mesa's Mesa Grande)
  const sand = o.stone === 'sand';
  const rock = m.mat({ ramp: kind === 'weir' ? CONC : sand ? SANDROCK : BASALT, k: kind === 'weir' ? 3 : 4, shade: (x, y, z) => {
    if (sand) return (Math.round(z) % 9 === 0 ? -0.6 : 0) + (hash(Math.round(x / 5), Math.round(z / 4), seed) - 0.5) * 0.8 + (hash(Math.round(x), Math.round(y), seed + 3) > 0.9 ? 0.3 : 0);
    if (kind === 'weir') return (Math.round(z) % 6 === 0 ? -0.6 : 0) + (Math.round(x) % 24 === 0 ? -0.8 : 0) + (z < 4 ? -0.5 : 0) + (hash(Math.round(x / 3), Math.round(z / 3), seed) - 0.5) * 0.5;
    return basaltShade(x, y, z, seed);
  } });
  const moss = m.mat({ ramp: MOSS, k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.4 });
  const wtop = m.mat({ ramp: WATER.river, k: 3, flag: F_WATER | F_NOCAST, shade: (x, y) => Math.sin(y * 0.6 - frame.v / frames * TAU * 2 + hash(Math.round(x), 1, seed) * 3) * 0.5 + (hash(Math.round(x), Math.round(y), seed) > 0.9 ? 1 : 0) - 0.2 });
  const sheet = m.mat({ ramp: WATER.fall, k: 3, flag: F_WATER | F_NOCAST, shade: (x, y, z) => {
    const col = Math.round(x), h = hash(col, 3, seed), u = (Hh - z) / (7 + h * 7) + frame.v / frames * (2 + Math.floor(h * 2)) * -1;
    const band = Math.sin(TAU * (u + h * 5)), top = z > (sheetTop(x) - 4) ? -1.1 : 0;
    return (band > 0.2 ? 1.6 : band < -0.6 ? -0.7 : 0.5) + (h > 0.7 ? 0.8 : h < 0.2 ? -0.5 : 0) + top + (Hh - z) / Hh * 0.6;
  } });
  const foam = m.mat({ ramp: WATER.foam, k: 2, flag: F_WATER | F_NOCAST, shade: (x, y, z) => (hash(Math.round(x), Math.round(y) + Math.round(frame.v * 3), Math.round(z)) - 0.4) * 2 });
  let sheetTop = () => drop;
  // the rock mass
  const inNotch = (x, lo = -width / 2, hi = width / 2) => x - cx >= lo && x - cx < hi;
  const edgeWob = (x, y) => (vnoise(x, y, 9, seed + 5) - 0.5) * 8;
  m.fill((x, y, z) => {
    const c = colAt(x, y), colTop = (c[1] - 0.5) * 16;
    const sideRock = !inNotch(x, -width / 2 - edgeWob(y, 1) * 0.3, width / 2 + edgeWob(y, 2) * 0.3);
    if (kind === 'weir') {
      if (y >= d1) return -1;
      if (!inNotch(x)) return z < drop + 10 ? rock : -1;      // the end piers
      return z < drop - 1 ? rock : -1;                        // the sill
    }
    if (sideRock) {
      // the cliff wings stand a little proud of the water, stepping down toward the front
      const front = y > d2 - 4 - c[1] * 12 + edgeWob(x, y) * 0.5 ? -1e9 : y > d1 + edgeWob(x, 9) && tier2 ? drop - 6 + colTop : drop + 4 + colTop;
      if (z < front) return z > front - 2 && hash(Math.round(x), Math.round(y), seed + 9) > 0.55 ? moss : rock;
      return -1;
    }
    if (y < d1) return z < drop - 2 ? rock : -1;               // under the upper water
    if (tier2 && y < d2) return z < mid - 2 ? rock : -1;      // the shelf
    return -1;
  }, 0, 0, 0, W, d2, Hh);
  // the lower face is ragged: a few columns stand forward of it, beside the falls
  for (let i = 0; i < 6; i++) {
    const r = 4 + hash(i, 3, seed) * 4, sx = hash(i, 1, seed) < 0.5 ? cx - width / 2 - r - 5 - hash(i, 2, seed) * (side - 16) : cx + width / 2 + r + 5 + hash(i, 2, seed) * (side - 16), top = (tier2 ? mid : drop) * (0.4 + hash(i, 4, seed) * 0.5);
    if (kind !== 'weir') m.cyl('z', sx, d2 - 2 + hash(i, 5, seed) * 6, 0, r, 0, top, rock);
  }
  // water on the lip(s) and the falling sheets
  const sheetX = (x, z, lo, hi) => inNotch(x, lo, hi);
  if (kind === 'weir') {
    m.box(cx - width / 2, 0, drop - 1, cx + width / 2, d1, drop + 1, wtop);
    m.fill((x, y, z) => (inNotch(x) && z < drop + 1 && y >= d1 && y < d1 + 2 + (drop - z) * 0.25 ? sheet : -1), 0, d1, 0, W, d1 + 8, drop + 1);
  } else {
    // upper water runs to the edge of the top step
    m.fill((x, y, z) => (inNotch(x, -width / 2 + 2, width / 2 - 2) && z >= drop - 2 && z < drop ? wtop : -1), 0, 0, drop - 2, W, d1, drop);
    // the upper (or only) fall: a sheet that leaves the lip and curves out a little as it falls
    const lo1 = tier2 ? mid - 2 : 0, w1 = kind === 'cliff' ? width : width - 4;
    sheetTop = () => drop;
    const ups = o.upper || null;   // (o.upper: the top fall split into strands [lo, hi] across the notch, basalt between)
    // (a strand fans out as it falls - its edges ragged - so the rocks that split it at the lip are hidden below: they
    // break the water near the top and the strands join into one curtain further down, not posts down the face)
    const spr = (z, top, k) => Math.max(0, (top - z) * 0.24 + (hash(Math.round(z / 4), k, seed + 11) - 0.5) * 2.6);
    m.fill((x, y, z) => {
      if (!inNotch(x, -w1 / 2 + Math.sin(z * 0.2 + x) * 0.6, w1 / 2)) return -1;
      if (ups && !ups.some(([lo, hi], k) => inNotch(x, lo - spr(z, drop, k * 2) + Math.sin(z * 0.3 + lo) * 0.8, hi + spr(z, drop, k * 2 + 1)))) return -1;
      const out = (drop - z) * 0.12 + Math.min(3, (drop - z) * 0.04);
      return y >= d1 + out - 1 && y < d1 + out + 2 ? sheet : -1;
    }, 0, d1 - 2, lo1, W, d1 + Math.ceil(drop * 0.2) + 4, drop);
    if (ups) for (let i = 0; i < ups.length - 1; i++) {
      const a = ups[i][1], b = ups[i + 1][0];
      m.fill((x, y, z) => {
        if (y < d1 - 4 || y >= d1 + 2 || z < lo1 || z >= drop + 1 + hash(Math.round(x / 3), 2, seed) * 2) return -1;
        const l = a + spr(z, drop, i * 2 + 1) + (hash(Math.round(z / 3), i, seed + 5) - 0.5) * 2, r = b - spr(z, drop, i * 2 + 2) - (hash(Math.round(z / 3), i + 9, seed + 5) - 0.5) * 2;
        return inNotch(x, l, r) ? rock : -1;
      }, 0, d1 - 4, lo1, W, d1 + 2, drop + 3);
    }
    if (tier2) {
      // the shelf pool, its foam, then the split lower falls
      m.fill((x, y, z) => (inNotch(x, -width / 2 + 3, width / 2 - 3) && z >= mid - 2 && z < mid ? (y < d1 + 10 && hash(Math.round(x), Math.round(y), seed + Math.round(frame.v)) > 0.35 ? foam : wtop) : -1), 0, d1, mid - 2, W, d2, mid);
      const streams = o.streams || [[-width / 2 + 2, -4], [6, width / 2 - 2]];
      const spr2 = (z, k) => spr(z, mid, k) * 1.7;   // (the lower streams fan wider: the rock between them a ragged wedge)
      streams.forEach(([lo, hi], k) => m.fill((x, y, z) => {
        if (!inNotch(x, lo - spr2(z, 40 + k * 2), hi + spr2(z, 41 + k * 2))) return -1;
        const out = (mid - z) * 0.1;
        return y >= d2 + out - 1 && y < d2 + out + 2 ? sheet : -1;
      }, 0, d2 - 2, 0, W, d2 + Math.ceil(mid * 0.15) + 4, mid));
      // the rock between the lower streams: the shelf's lip, the streams fanning round it as they fall
      for (let i = 0; i < streams.length - 1; i++) {
        const a = streams[i][1], b = streams[i + 1][0];
        m.fill((x, y, z) => {
          if (y < d1 || y >= d2 + 2 || z >= mid - 1 + hash(Math.round(x / 3), 1, seed) * 2 || (y < d2 - 2 && z >= mid - 2)) return -1;   // (flush with the shelf's pool, under it behind the lip: a rock breaking its lip, not a post)
          const zz = Math.min(z, mid), f = y >= d2 - 2 ? 1 : 0.3, l = a + spr2(zz, 41 + i * 2) * f + (hash(Math.round(z / 3), i + 20, seed + 5) - 0.5) * 3, r = b - spr2(zz, 42 + i * 2) * f - (hash(Math.round(z / 3), i + 29, seed + 5) - 0.5) * 3;
          return inNotch(x, l, r) ? rock : -1;
        }, 0, d1, 0, W, d2 + 2, mid + 6);
      }
    }
  }
  // the churn at the foot
  const footW = kind === 'cliff' ? width * 1.6 : width;
  m.fill((x, y, z) => {
    const dx = (x - cx) / (footW / 2 + 4), dy = (y - d2) / apron, q = dx * dx + dy * dy * 1.4;
    if (q > 1 || y < d2 + 1) return -1;
    const hgt = (1 - q) * (kind === 'weir' ? 4 : kind === 'cliff' ? 9 : 7) * (0.6 + vnoise(x, y + frame.v * 3, 4, seed) * 0.8);
    return z < hgt ? foam : -1;
  }, 0, d2, 0, W, Dp, 12);
  m.face = d2; m.lip = drop; m.depth = Dp; m.mid = mid; m.width = width; m.kind = kind; m.frameRef = frame; m.smooth = 1;
  return m;
}
// a rendered fall (heading 0, facing the camera), anchored at the foot of its lowest face; sheets get
// normals tipped toward the sky so they read bright, and the tall fall gets a veil of mist
export function waterfall(o = {}, model = null) {
  const m = model || fallModel(o);
  if (o.frame != null) m.frameRef.v = o.frame;
  const G = m.render(0, { dither: 0.4 });
  G.ay += m.face - m.depth / 2;
  const tip = norm([-0.3, 0.25, 0.92]);
  for (let i = 0; i < G.w * G.h; i++) if (G.col[i * 4 + 3] && (G.flag[i] & F_WATER)) { const j = i * 4; G.nrm[j] = (tip[0] * 0.5 + 0.5) * 255; G.nrm[j + 1] = (tip[1] * 0.5 + 0.5) * 255; G.nrm[j + 2] = (tip[2] * 0.5 + 0.5) * 255; }
  const mist = o.mist ?? (m.kind === 'cliff' ? 1 : m.kind === 'twoTier' ? 0.5 : 0.2);
  if (mist > 0) {
    const seed = o.seed ?? 3, f = m.frameRef.v, cx = G.ax, cy = G.ay - 4, rx = m.width * (m.kind === 'cliff' ? 1.6 : 0.8) + 10, ry = 10 + mist * 34;
    for (let y = Math.floor(cy - ry * 1.6); y < Math.min(G.h, cy + ry * 0.5); y++) for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
      if (!G.inside(x, y)) continue;
      const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (q > 1.4) continue;
      const nz = vnoise(x + f * 3, y - f * 5, 7, seed + 77) * 0.7 + vnoise(x, y - f * 2, 3, seed + 78) * 0.3;
      const a = (1 - q / 1.4) * mist * (nz - 0.3) * 1.8; if (a <= 0.05) continue;
      const j = (y * G.w + x) * 4, A = Math.min(0.75, a);
      if (G.col[j + 3] === 255) { G.col[j] += (236 - G.col[j]) * A * 0.8; G.col[j + 1] += (244 - G.col[j + 1]) * A * 0.8; G.col[j + 2] += (246 - G.col[j + 2]) * A * 0.8; }
      else if (!G.col[j + 3]) { G.col[j] = 232; G.col[j + 1] = 242; G.col[j + 2] = 246; G.col[j + 3] = Math.round(A * 200); G.flag[y * G.w + x] = F_NOCAST; }
    }
  }
  return G;
}
// n animation frames of one fall (the rock is voxelised once)
export function waterfallFrames(o = {}, n = 4) { const m = fallModel({ ...o, frames: n }); return Array.from({ length: n }, (_, f) => waterfall({ ...o, frame: f }, m)); }

// ---- bridges and river works ----------------------------------------------------------------------------
// a length of columnar basalt cliff (len along x, `depth` deep, h tall) with mossy tops and a ragged foot
// (the moss on the columns' tops is the rock's crust: it holds still in the wind with the rock - gbuf.js "What sways";
// task #425)
export function cliffWall(len = 120, h = 60, depth = 40, seed = 1) {
  const m = new Vox(len, depth, h + 8);
  const rock = m.mat({ ramp: BASALT, k: 4, shade: (x, y, z) => basaltShade(x, y, z, seed) });
  const moss = m.mat({ ramp: MOSS, k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.4 });
  for (let y = 0; y < depth; y++) for (let x = 0; x < len; x++) {
    const c = cellPt(x + 0.5, y + 0.5, 11, seed + 7), top = Math.round(h + (c[1] - 0.5) * 20 - (y > depth - 18 ? (y - depth + 18) * 1.6 * c[1] : 0));
    const front = depth - 3 - c[1] * 14 + (vnoise(x, 1, 13, seed) - 0.5) * 6;
    if (y > front) continue;
    m.box(x, y, 0, x + 1, y + 1, top - 2, rock); m.box(x, y, top - 2, x + 1, y + 1, top, hash(x, y, seed + 9) > 0.5 ? moss : rock);
  }
  m.smooth = 1;
  return m;
}
// a cave's mouth in a face of columnar basalt (Nature-B2): the rock w wide and h tall with a dark arch in its middle
// running back into black; style 0 'moss' (a forest falls' - moss on the columns' tops, strands hanging over the arch,
// ferns at its foot), 1 'sea' (a sea cave's - a dark wet band of barnacles along its foot, a glint of water inside)
export function caveMouth(w = 96, h = 72, style = 0) {
  const depth = 46, m = new Vox(w, depth, h + 8), sea = style === 1, seed = 7 + style;
  const rock = m.mat({ ramp: BASALT, k: 4, shade: (x, y, z) => basaltShade(x, y, z, seed) });
  const moss = m.mat({ ramp: MOSS, k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.4 });
  const wet = m.mat({ ramp: R('#3a3834', 6, 2), k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(z / 2), 5) > 0.8 ? 1.2 : 0) + (hash(Math.round(x), Math.round(z), 6) - 0.5) * 0.8 });
  const dark = m.mat({ ramp: R('#0c0a0e', 5, 1), k: 0, flag: F_NOCAST });
  const glint = m.mat({ ramp: R('#1a2e38', 5, 2), k: 2, flag: F_WATER | F_NOCAST, shade: (x, y) => (hash(Math.round(x), Math.round(y), 9) - 0.5) * 1.2 - 0.4 });
  const ow = w * 0.48, oh = h * 0.66, cx = w / 2;
  const inArch = (x, z) => { const u = (x - cx) / (ow / 2); if (Math.abs(u) > 1) return false; const top = oh * 0.62 + oh * 0.38 * Math.sqrt(Math.max(0, 1 - u * u)); return z < top - Math.abs(u) * 3; };
  for (let y = 0; y < depth; y++) for (let x = 0; x < w; x++) {
    const c = cellPt(x + 0.5, y + 0.5, 10, seed), shoulder = Math.abs(x - cx) / (w / 2);
    const top = Math.round(h * (1 - shoulder * shoulder * 0.28) + (c[1] - 0.5) * 14);
    const front = depth - 4 - c[1] * 10 - shoulder * 8 + (vnoise(x, 1, 11, seed) - 0.5) * 5;
    if (y > front) continue;
    for (let z = 0; z < top; z++) {
      if (inArch(x, z)) {   // (the way in: hollow back to a black wall; its floor dark, a sea cave's wet)
        if (y < depth * 0.2) m.box(x, y, z, x + 1, y + 1, z + 1, dark);
        else if (z < 2) m.box(x, y, z, x + 1, y + 1, z + 1, sea ? (Math.abs(x - cx) < ow * 0.22 ? glint : wet) : dark);
        continue;
      }
      const mat = sea && z < 10 ? wet : z >= top - 2 && !sea && hash(x, y, seed + 9) > 0.35 ? moss : rock;
      m.box(x, y, z, x + 1, y + 1, z + 1, mat);
    }
  }
  if (!sea) for (let k = 0; k < 9; k++) {   // moss strands over the arch, ferns at its foot
    const x = cx - ow / 2 + 4 + k * (ow - 8) / 8, len = 6 + hash(k, 3, seed) * 10, y = depth * 0.62;
    m.box(x, y, oh - len, x + 1, y + 1, oh, moss);
  }
  if (!sea) for (const dx of [-0.42, 0.42]) m.ell(cx + dx * w * 0.6, depth * 0.78, 3, 7, 5, 4, moss);
  m.smooth = 1;
  return m;
}
// a wooden rowboat drawn up on a beach (as the cave river's - art2/vehicles.js rowboat - without its oars out): planked,
// painted above the waterline, its oars laid in it
export function rowboatProp(color = '#3f6a7a') {
  const L = 64, Wd = 28, hz = 10, m = new Vox(L, Wd, 12), cy = Wd / 2;
  const plank = m.mat({ ramp: R('#7a5434'), k: 3, shade: (x, y, z) => (Math.round(z) % 3 === 0 ? -0.9 : 0) });
  const paint = m.mat({ ramp: R(color, 6, 3), k: 3 }), trim = m.mat({ ramp: R('#d8d0bc'), k: 3 }), inner = m.mat({ ramp: R('#9a7046'), k: 3, shade: (x) => (Math.round(x) % 5 === 0 ? -0.6 : 0) });
  m.fill((x, y, z) => {
    const t = x / L, bow = t > 0.62 ? (t - 0.62) / 0.38 : t < 0.1 ? (0.1 - t) / 0.1 * 0.35 : 0;
    const half = (Wd / 2 - 1) * (1 - bow * bow * 0.9) * (0.58 + 0.42 * (z / hz));
    if (Math.abs(y - cy) > half) return -1;
    if (z > hz - 2) return Math.abs(y - cy) > half - 2 ? trim : -1;
    if (Math.abs(y - cy) > half - 2) return z > hz * 0.45 ? paint : plank;
    return z < 3 ? inner : -1;
  }, 0, 0, 0, L, Wd, hz);
  for (const x of [L * 0.32, L * 0.6]) m.box(x, 3, 5, x + 5, Wd - 3, 7, inner);
  for (const y of [cy - 4, cy + 3]) m.box(L * 0.12, y, 3, L * 0.86, y + 1.5, 4.5, plank);   // (the oars, shipped)
  return m;
}
// deck markings for a road deck: asphalt with a yellow double centre line and white edge lines
function deckMats(m, d, edge) {
  const asp = m.mat({ ramp: MAT.asphaltWorn, k: 1, shade: (x, y) => (hash(Math.round(x), Math.round(y), 5) - 0.5) * 0.8 + (hash(Math.round(x / 4), Math.round(y / 4), 6) > 0.92 ? -0.6 : 0) });
  const yl = m.mat({ ramp: MAT.paintYellow, k: 1 }), wl = m.mat({ ramp: MAT.paintWhite, k: 1 });
  return (x, y) => { const c = d / 2; if (Math.abs(y - c) < 2.2 && Math.abs(y - c) > 0.7) return yl; if (Math.abs(y - edge - 2) < 1) return wl; if (Math.abs(y - (d - edge - 2)) < 1) return wl; return asp; };
}
// an old two-arch stone road bridge: len along x, roadW wide, deck faceH above the water, parapets
export function stoneBridge(len = 260, roadW = 96, faceH = 26, arches = 2, o = {}) {
  const par = 7, d = roadW + par * 2, H = faceH + 11, seed = o.seed ?? 5;
  const m = new Vox(len, d, H);
  const blocks = (x, z, row = 5, col = 11) => { const r = Math.floor(z / row), off = (r & 1) * (col / 2), bx = Math.floor((x + off) / col); return (Math.round(z) % row === 0 || Math.round(x + off) % col === 0 ? -1.1 : 0) + (hash(bx, r, seed) - 0.5) * 0.7; };
  const st = m.mat({ ramp: STONE, k: 3, shade: (x, y, z) => blocks(x, z) + (z < 5 ? -0.5 : 0) });
  const ring = m.mat({ ramp: R('#a89c8a', 7, 3, { dark: 0.58, light: 0.5 }), k: 3, shade: (x, y, z) => (hash(Math.round(Math.atan2(z, x) * 20), 1, seed) - 0.5) * 0.8 });
  const cope = m.mat({ ramp: R('#b4aa9a', 6, 3), k: 3, shade: (x) => (Math.round(x) % 14 === 0 ? -1 : 0) });
  const moss = m.mat({ ramp: MOSS, k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.5 });
  const deck = deckMats(m, d, par);
  // o.under: the arches' openings shut with the dark under the bridge and a line of water at its foot, on the face
  // (for a river drawn at the road's level, where nothing shows through the arch)
  const dark = o.under ? m.mat({ ramp: R('#1e2a2c', 5, 2), k: 1, shade: (x, y, z) => (z > rise * 0.6 ? -0.6 : 0) + (hash(Math.round(x), Math.round(z), 3) - 0.5) * 0.4 }) : 0;
  const wat = o.under ? m.mat({ ramp: WATER.river, k: 2, flag: F_WATER | F_NOCAST, shade: (x, y, z) => (hash(Math.round(x), Math.round(z), 4) - 0.5) * 1.2 - 0.8 }) : 0;
  const ab = Math.round(len * 0.14), pier = 16, span = (len - ab * 2 - pier * (arches - 1)) / arches, rise = faceH - 8;
  const archAt = (x, z) => { for (let a = 0; a < arches; a++) { const x0 = ab + a * (span + pier), c = x0 + span / 2; const q = ((x - c) / (span / 2)) ** 2 + (z / rise) ** 2; if (q < 1) return q; } return 9; };
  m.fill((x, y, z) => {
    const q = archAt(x, z);
    if (q < 1) return o.under && y >= d - 2 ? (z < 3 ? wat : dark) : -1;
    if (z >= faceH) { // parapets
      if (y >= par && y < d - par) return -1;
      return z >= faceH + 8 ? cope : (z < faceH + 3 && hash(Math.round(x), Math.round(y) + Math.round(z), seed) > 0.93 ? moss : st);
    }
    if (z >= faceH - 2) return y >= par && y < d - par ? deck(x, y) : cope;
    if (q < 1.45) return ring;
    if ((z < 6 || (z < 12 && vnoise(x, z, 6, seed) > 0.7)) && hash(Math.round(x), Math.round(z), seed + 3) > 0.45) return moss;
    return st;
  }, 0, 0, 0, len, d, H);
  // cutwaters on the piers, to the south (downstream side shown)
  for (let a = 1; a < arches; a++) { const px = ab + a * span + (a - 1) * pier + pier / 2; m.fill((x, y, z) => (Math.abs(x - px) < pier / 2 - (y - (d - 6)) * 0.8 && z < rise * 0.7 ? st : -1), px - pier, d - 8, 0, px + pier, d, rise); }
  m.faceH = faceH; m.roadW = roadW;
  return m;
}
// a modern concrete road bridge: slab deck on square piers, a metal railing on low parapets
export function roadBridge(len = 300, roadW = 100, faceH = 24, piers = 2, o = {}) {
  const par = 5, d = roadW + par * 2, H = faceH + 16;
  const m = new Vox(len, d, H);
  const cc = m.mat({ ramp: CONC, k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(z / 2), 3) - 0.5) * 0.4 + (Math.round(x) % 40 === 0 ? -0.7 : 0) });
  const beam = m.mat({ ramp: CONC, k: 2, shade: (x, y, z) => (z > faceH - 3 ? 0.9 : -0.2) });
  const rail = m.mat({ ramp: MAT.metal, k: 3 }), dark = m.mat({ ramp: R('#5a5a58'), k: 2 });
  const deck = deckMats(m, d, par);
  const pierXs = []; for (let i = 1; i <= piers; i++) pierXs.push(Math.round(len * i / (piers + 1)));
  m.fill((x, y, z) => {
    if (z >= faceH - 10 && z < faceH - 1) return beam;
    if (z >= faceH - 1 && z < faceH + 1) return y < par || y >= d - par ? cc : deck(x, y);
    if (z >= faceH + 1 && z < faceH + 5 && (y < par || y >= d - par)) return cc;
    if (z >= faceH + 5 && (y < 3 || y >= d - 3)) { if (Math.round(x) % 14 < 2 && z < faceH + 15) return rail; if (z >= faceH + 13 && z < faceH + 15) return rail; if (z >= faceH + 9 && z < faceH + 10) return rail; }
    if (z < faceH - 10) { for (const px of pierXs) if (Math.abs(x - px) < 7 && y > d * 0.18 && y < d * 0.82) return z < 4 ? dark : cc; if (x < 12 || x >= len - 12) return z < 3 ? dark : cc; }
    return -1;
  }, 0, 0, 0, len, d, H);
  for (const ex of [2, len - 8]) for (const ey of [0, d - 6]) m.box(ex, ey, faceH, ex + 6, ey + 6, faceH + 18, cc);
  m.faceH = faceH; m.roadW = roadW;
  return m;
}
// a wooden footbridge: plank deck on log stringers, posts and two handrails
export function footbridge(len = 140, w = 26, h = 12, o = {}) {
  const m = new Vox(len, w, h + 20);
  const plank = m.mat({ ramp: MAT.woodDock, k: 3, shade: (x, y) => (Math.round(x) % 6 === 0 ? -1.1 : 0) + (hash(Math.floor(x / 6), 1, 3) - 0.5) * 0.7 + (hash(Math.round(x), Math.round(y), 4) > 0.94 ? -0.6 : 0) });
  const post = m.mat({ ramp: MAT.woodDark, k: 3 }), rail = m.mat({ ramp: R('#7a5838'), k: 3 });
  m.box(0, 3, h - 3, len, w - 3, h, plank);
  m.box(0, 4, h - 6, len, 7, h - 3, post); m.box(0, w - 7, h - 6, len, w - 4, h - 3, post);
  for (let x = 2; x < len; x += 22) for (const y of [2, w - 4]) m.box(x, y, x < 6 || x > len - 26 ? 0 : h - 6, x + 3, y + 2, h + 16, post);
  for (const y of [2, w - 4]) { m.box(0, y, h + 13, len, y + 2, h + 16, rail); m.box(0, y, h + 6, len, y + 2, h + 8, rail); }
  return m;
}
// a road culvert: the road on top, a concrete headwall facing the camera with an arched opening that the
// stream runs out of, wing walls stepping down either side
export function culvert(len = 180, roadW = 96, faceH = 26, r = 15, o = {}) {
  const par = 4, d = roadW + par * 2;
  const m = new Vox(len, d + 10, faceH + 14);
  const cc = m.mat({ ramp: CONC, k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(z / 3), 7) - 0.5) * 0.6 + (z < 6 ? -0.6 : 0) + (Math.round(z) % 9 === 0 ? -0.4 : 0) });
  const dark = m.mat({ ramp: R('#2a2e34', 5, 2), k: 1 }), lip = m.mat({ ramp: CONC, k: 4 });
  const wat = m.mat({ ramp: WATER.fall, k: 2, flag: F_WATER | F_NOCAST, shade: (x, y) => (hash(Math.round(x), Math.round(y), 2) - 0.5) * 1.6 });
  const rail = m.mat({ ramp: MAT.metal, k: 3 }), moss = m.mat({ ramp: MOSS, k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.5 });
  const deck = deckMats(m, d, par), cx = len / 2;
  m.fill((x, y, z) => {
    if (y >= d) { // the headwall and wings in front of the road
      const wing = Math.abs(x - cx) > r + 22;
      const top = wing ? faceH - (Math.abs(x - cx) - r - 22) * 0.35 - (y - d) * 1.2 : faceH + 2;
      if (z >= top || y >= d + 6) return -1;
      const rr = Math.hypot(x - cx, z - 2);
      if (rr < r) return y < d + 3 ? (z < 3 ? wat : dark) : -1;
      if (rr < r + 2.5) return lip;
      return z < 5 && hash(Math.round(x), Math.round(z), 3) > 0.5 ? moss : cc;
    }
    if (z < faceH - 2) return Math.hypot(x - cx, z - 2) < r ? (z < 3 ? wat : dark) : cc;
    if (z < faceH) return y < par || y >= d - par ? cc : deck(x, y);
    if ((y < 2 || (y >= d - 2 && y < d)) && z < faceH + 12) { if (Math.round(x) % 16 < 2 || z >= faceH + 9) return rail; }
    return -1;
  }, 0, 0, 0, len, d + 10, faceH + 14);
  m.faceH = faceH; m.roadW = roadW; m.front = d; m.deckD = d;
  return m;
}
// a flat-topped stepping stone
export function steppingStone(seed = 1, r = 9) {
  const m = new Vox(r * 2 + 4, r * 2 + 4, 8);
  const st = m.mat({ ramp: ROCKG, k: 3, shade: (x, y, z) => (z > 4 ? 0.7 : -0.2) + (hash(Math.round(x / 2), Math.round(y / 2), seed) - 0.5) * 0.8 });
  const wet = m.mat({ ramp: R('#4a4a46', 6, 3), k: 2 });
  const c = r + 2;
  m.fill((x, y, z) => { const a = Math.atan2(y - c, x - c), wob = 1 + Math.sin(a * 3 + seed) * 0.12 + Math.sin(a * 5 + seed * 2) * 0.07; const q = ((x - c) / (r * wob)) ** 2 + ((y - c) / (r * 0.8 * wob)) ** 2; if (q > 1 || z > 6 - q * 3) return -1; return z < 1.5 ? wet : st; });
  m.smooth = 2;
  return m;
}
// a canoe (len along x) with a paddler kneeling in it; returns a sprite for heading hd
export function canoe(hd = 0, color = '#b83a2e', app = null, o = {}) {
  const L = o.len ?? 64, Wd = 16, m = new Vox(L, Wd, 12);
  const hull = m.mat({ ramp: R(color, 6, 3, { light: 0.55 }), k: 3, shade: (x, y, z) => (z > 6.5 ? 0.7 : 0) });
  const gun = m.mat({ ramp: MAT.woodDark, k: 3 }), inside = m.mat({ ramp: R('#a87a4a'), k: 3, shade: (x) => (Math.round(x) % 7 === 0 ? -0.9 : 0) });
  m.fill((x, y, z) => {
    const t = (x / L) * 2 - 1, half = (Wd / 2 - 1) * Math.sqrt(Math.max(0, 1 - t ** 4)) * (1 - Math.abs(t) * 0.15), dy = Math.abs(y - Wd / 2);
    if (dy > half) return -1;
    const floor = 1 + (dy / Math.max(1, half)) ** 2 * 5 - Math.abs(t) ** 3 * 2, rim = 8 + Math.abs(t) ** 4 * 3;
    if (z < floor || z > rim) return -1;
    if (z > rim - 1.2) return gun;
    if (dy < half - 1.5 && z > floor + 1.5) return z < floor + 3 ? inside : -1;
    return hull;
  });
  for (const tx of [0.32, 0.68]) m.box(L * tx, 2, 6, L * tx + 2, Wd - 2, 7, gun);
  if (o.vox) return m;   // (the model itself, for the world's statics: they turn and light it)
  const g = m.render(hd), out = new GBuf(g.w + 30, g.h + 30); out.ax = g.ax + 15; out.ay = g.ay + 15;
  out.blit(g, 15, 15);
  if (app) {
    const k = Math.round(hd / (Math.PI / 4)), dir = ((2 - k) % 8 + 8) % 8, p = person(app, dir, 'idle', 0);
    const cut = p.ay - 15, px = Math.round(out.ax - p.ax - Math.cos(hd) * 6), py = Math.round(out.ay - 8 - cut);
    for (let y = 0; y < cut; y++) for (let x = 0; x < p.w; x++) {
      const si = y * p.w + x; if (!p.col[si * 4 + 3]) continue;
      const X = px + x, Y = py + y; if (!out.inside(X, Y)) continue;
      const di = Y * out.w + X; for (let c = 0; c < 4; c++) { out.col[di * 4 + c] = p.col[si * 4 + c]; out.nrm[di * 4 + c] = p.nrm[si * 4 + c]; }
      out.z[di] = p.z[si] + 8; out.flag[di] = p.flag[si];
    }
    // the paddle across the body, blade in the water on one side
    const ca = Math.cos(hd), sa = Math.sin(hd), bx = out.ax - ca * 6, by = out.ay - 18;
    for (let s = -14; s <= 16; s++) {
      const X = Math.round(bx + (-sa) * s * 0.9 + ca * s * 0.25), Y = Math.round(by + ca * s * 0.45 + s * 0.35);
      for (const w of s > 9 ? [-1, 0, 1] : [0]) if (out.inside(X + w, Y)) out.put(X + w, Y, s > 9 ? MAT.woodDock[2] : MAT.woodDark[3], [0, 0.5, 0.85], Math.max(1, 14 - s), null, 0);
    }
  }
  return out;
}
// place a bridge / culvert model so its deck lands on the road centred at (x, yRoad) (world px); returns
// the sort base, for putting vehicles and people on the deck with onDeck()
export function deckAt(sc, model, x, yRoad, hd = 0, key = null) {
  const y = yRoad + model.faceH + (model.d - (model.deckD ?? model.d)) / 2;
  sc.addWorld(key ? sc.render(model, hd, key) : model.render(hd), x, y, 0, y + (model.d || 0) / 2);
  return { base: y + (model.d || 0) / 2, faceH: model.faceH };
}
export function onDeck(sc, spr, x, y, deck) { return sc.addWorld(spr, x, y + deck.faceH, deck.faceH, deck.base + 1 + (y % 7) * 0.01); }

// ---- dressing a painted river with rocks, reeds and whitewater -------------------------------------------
// sc: a Scene; info: what paintRiver returned. o: rocks (count on rocky banks per 100 px), reeds, phase,
// boulder(seed, size) and reed(seed) makers (props from props-district / props-park are passed in by the
// scene so this module stays light), rapids: [[s0, s1]] stretches (arc length) to strew boulders in
export function dressRiver(sc, info, o = {}) {
  const G = sc.G, seed = o.seed ?? 11, phase = o.phase ?? 0, P = info.P;
  const placed = [];
  if (o.boulder && o.rapids) for (const [s0, s1, dens = 1] of o.rapids) {
    for (let s = s0, i = 0; s < s1; s += 9 / dens, i++) {
      const c = info.at(s), off = (hash(i, 1, seed) - 0.5) * c.w * 0.95, x = c.x + c.ty * off, y = c.y - c.tx * off;
      if (hash(i, 2, seed) > 0.62) continue;
      const r = 5 + hash(i, 3, seed) * 9;
      foamRing(G, x, y, r * 0.8, Math.atan2(c.ty, c.tx), phase, seed + i);
      placed.push([x, y, r]);
    }
  }
  if (o.boulder && o.rocks) for (const side of [1, -1]) for (const b of info.bank(side, 0.2, 100 / o.rocks, o.s0 ?? 0, o.s1 ?? 1e9)) {
    if (o.rockSide && o.rockSide !== side) continue;
    const r = 6 + hash(Math.round(b.x), Math.round(b.y), seed) * 10;
    if (info.isWater(b.x, b.y)) foamRing(G, b.x, b.y, r * 0.7, 0, phase, seed + 3, 0.3);
    placed.push([b.x, b.y, r]);
  }
  for (const [x, y, r] of placed) sc.addWorld(o.boulder(Math.round(x * 7 + y) % 97, Math.round(r * 2)), x, y + r * 0.3);
  if (o.reed && o.reeds) for (const side of [1, -1]) for (const b of info.bank(side, -0.3, 100 / o.reeds, o.s0 ?? 0, o.s1 ?? 1e9)) {
    if (o.reedSide && o.reedSide !== side) continue;
    sc.addWorld(o.reed(Math.round(b.x + b.y) % 50), b.x, b.y);
  }
  return placed;
}
export { detectFeatures };

// ---- the world's water (the live game's chunk baker) ------------------------------------------------------------
// The world's water as the chunk baker paints it (the water upgrade, 2026-10-18): every pixel of a creek, a river, a
// lake, a pond, the marsh and the sea, see-through where it is shallow - the bed under it (pebbles in a mountain creek,
// gravel and silt in a river, sand and seagrass and coral in the sea, mud and weed in a pond) fading into the water's
// own colour as it deepens, the depth bands ordered-dithered (no hard edge, the 16-bit way) - with the current's lines
// curving along each channel and the ripples and crests on top. client/art2/game/groundbake.js calls it: waterTiles
// once per chunk (what each tile of the window is: which water, how far from land, which way it runs), waterPx per
// water pixel. Allocation free in the pixel loop; the result lands in WQ.
//
// What it reads of the map: the tiles and their water flags (m.lake: 1 a lake, 2 a pond; m.river; land-flagged water
// is dug on land - a pond), m.flow (a nature site's creek: which way, sixteenths of a turn) and World v3's m.waters
// (shared/world3-waterbodies.js: each channel's centre line downstream, its width, kind, setting and speed; the lakes
// laid as polygons). A map without m.waters (today's world, the tests' maps) gets the same water from its flags: the
// rivers by m.flow where they have it, still where not.
//
// For the light pass (lightgame.js waterSurf) each water pixel says, in the albedo's alpha (WQ.code) and the
// F_NOCAST flag (WQ.inl: inland water - nothing on the flat ground casts with it, so the flag is free on water):
//   sea (no F_NOCAST): 191 + px from the shore (0..47: the waves break, the swash runs), else 239 + how clear
//     (0..15: the sun's caustics on the bed), else 255 (open, deep);
//   inland running (F_NOCAST): 128 + direction * 4 + fast * 2 + clear (direction in sixteenths of a turn);
//   inland still (F_NOCAST): 192 + px from the shore (0..23: it laps), else 216 + how clear (0..7) on a lake, the
//     marsh or a still river, 224 + how clear on a pond (a mirror).
export const WK = { LAND: 0, SEA: 1, CREEK: 2, RIVER: 3, LAKE: 4, POND: 5, MARSH: 6 };
const RW = (h, n = 7, k = 3, o = {}) => ramp(h, n, k, { dark: 0.55, light: 0.5, shift: 0.08, ...o });
const RB = (h, o = {}) => ramp(h, 6, 3, { dark: 0.5, light: 0.45, shift: 0.15, ...o });
const BAYW = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const by = (X, Y) => BAYW[(Y & 3) * 4 + (X & 3)];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- the beds -------------------------------------------------------------------------------------------------
const BED = {
  peb: RB('#9a9286'), pebW: RB('#bcae92'), pebD: RB('#5e584e'), pebR: RB('#a07a56'), pebG: RB('#7e8a86'), gran: RB('#8c8a86', { shift: 0.1 }), granW: RB('#c2c0ba', { shift: 0.08 }),
  bar: RB('#c8b896', { dark: 0.42, light: 0.4 }), silt: RB('#8a8270', { dark: 0.45 }), mud: RB('#6a5038', { dark: 0.55, light: 0.4 }),
  weed: RB('#4e5e2c', { dark: 0.55, shift: 0.25 }), leaf: RB('#8a5a2c', { dark: 0.5 }), red: RB('#c08a62', { dark: 0.45 }),
  sand: RB('#d6ccaa', { dark: 0.4, light: 0.45 }), grass: RB('#3e6e3c', { dark: 0.55, shift: 0.3 }), kelp: RB('#6e5c26', { dark: 0.55, shift: 0.25 }),
  rock: RB('#6e6c68', { dark: 0.6, light: 0.45, shift: 0.18 }),
  coral: [RB('#c87868', { shift: 0.2 }), RB('#c89a58', { shift: 0.2 }), RB('#9a78a8', { shift: 0.2 }), RB('#b8b070', { shift: 0.2 }), RB('#c8909a', { shift: 0.2 }), RB('#7a8a5a', { shift: 0.2 })],
};
// ---- the wrecks on the bed (shared/world3-wrecks.js; the owner, 10-16: "underwater rocks and wrecks") ------------
// A sunken boat lying on the bed, seen through the water as the bed is (tinted by it, fading as it deepens): its
// planks along the hull, the dark rim of the gunwale broken here and there, the ribs showing where the planking's
// gone (the bed through between them), a thwart across a rowboat, weed growing on it; a sloop's mast lying beside.
// wreckPx(list, X, Y, seed): the bed's colour there, or null where no wreck is (list: the chunk's, groundbake C.wk).
const WRK = { wood: RB('#7c6648', { dark: 0.5 }), dark: RB('#4a3a2a', { dark: 0.55 }), weed: RB('#56683a', { dark: 0.5, shift: 0.2 }) };
export function wreckPx(list, X, Y, seed) {
  for (let n = 0; n < list.length; n++) {
    const w = list[n], dx = X - w.x, dy = Y - w.y, R = w.len * 0.6 + 40;
    if (dx * dx + dy * dy > R * R) continue;
    const ca = Math.cos(w.a), sa = Math.sin(w.a), lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca, hl = w.len / 2, x = X | 0, y = Y | 0, s = seed + w.v * 13;
    if (w.kind === 'sloop') {   // (the mast, fallen across the bed from its step, with a tangle of rigging)
      const px = lx + hl * 0.05, py = ly + w.beam * 0.25, mc = Math.cos(-0.65), ms = Math.sin(-0.65), along = px * mc + py * ms, off = -px * ms + py * mc;
      if (along > 0 && along < w.len * 0.85 && Math.abs(off) < 2.2) return sd(Math.abs(off) > 1.2 ? WRK.dark : WRK.wood, 0.45 - along / w.len * 0.1, x, y, 0.4);
    }
    if (lx < -hl || lx > hl) continue;
    const u = lx / hl, hb = w.beam / 2 * (u > 0 ? 1 - u * u : 1 - u * u * u * u * 0.55);
    const ay = Math.abs(ly);
    if (ay > hb) continue;
    const edge = hb - ay, weed = vnc(X, Y, 6, s + 5) > 0.74;
    if (edge < 2.4) {   // the gunwale's rim, broken in places
      if (vnc(lx, ly, 11, s + 3) > 0.83) return null;
      return sd(weed ? WRK.weed : WRK.dark, 0.5 + (edge < 1 ? -0.15 : 0.05), x, y, 0.4);
    }
    if (w.kind === 'rowboat' && Math.abs(lx - hl * 0.1) < 2.6) return sd(WRK.dark, 0.5, x, y, 0.4);   // (the thwart)
    // the planking gone in holes, the ribs across between them and the bed showing through
    if (Math.abs(u) < 0.8 && vnc(lx, ly, 10, s + 7) > 0.64) return ((((lx | 0) % 9) + 9) % 9) < 2 ? sd(WRK.dark, 0.42, x, y, 0.4) : null;
    if (weed) return sd(WRK.weed, 0.45 + (hh(x >> 1, y >> 1, s + 9) - 0.5) * 0.2, x, y, 0.4);
    const pl = Math.floor((ly + hb) / 4), seam = ((ly + hb) % 4 + 4) % 4 < 0.9;
    return sd(WRK.wood, 0.52 + (hh(pl, w.v, s + 11) - 0.5) * 0.24 - (seam ? 0.22 : 0) - (1 - edge / hb) * 0.08, x, y, 0.4);
  }
  return null;
}
// one stone of a bed: its ramp's colour, lit from the upper left with a dark rim, or null between the stones
function stoneOf(X, Y, sz, seed, fill, A, B) {
  const w = worley(X + 0.5, Y + 0.5, sz, seed, 0.85), r = sz * fill * (0.65 + 0.7 * w.h);
  if (w.d1 >= r) return null;
  let t = 0.54 + (w.h - 0.5) * 0.4 - (w.dx + w.dy) / r * 0.3;
  if (w.d1 > r - 1.5) t -= 0.32;
  return sd(w.h > 0.82 ? B : A, t, X | 0, Y | 0, 0.4);
}
// the bed at a pixel: kind of bed, distT the tiles to the shore, fine a small noise
function bedPx(bed, X, Y, distT, fine, seed) {
  const x = X | 0, y = Y | 0;
  switch (bed) {
    case 1: {   // a creek's: pebbles and cobbles on gravel, a big stone now and then
      const big = stoneOf(X, Y, 30, seed + 41, 0.4, BED.pebD, BED.peb);
      if (big && hh(Math.floor(X / 30), Math.floor(Y / 30), seed + 43) > 0.7) return big;
      const hc = hh(Math.floor(X / 12), Math.floor(Y / 12), seed + 29);
      return stoneOf(X, Y, 12, seed + 31, 0.46, hc > 0.7 ? BED.pebR : hc > 0.45 ? BED.pebG : BED.peb, BED.pebW) || stoneOf(X + 5, Y + 3, 7, seed + 39, 0.42, BED.pebD, BED.peb) || sd(BED.pebD, 0.2 + fine * 0.25, x, y, 0.6);
    }
    case 2: {   // granite: grey cobbles and pale sand, boulders
      const big = stoneOf(X, Y, 34, seed + 45, 0.42, BED.gran, BED.granW);
      if (big && hh(Math.floor(X / 34), Math.floor(Y / 34), seed + 47) > 0.6) return big;
      return stoneOf(X, Y, 13, seed + 33, 0.42, BED.gran, BED.granW) || sd(BED.sand, 0.42 + fine * 0.3, x, y, 0.6);
    }
    case 3: {   // a river's: gravel by the banks, sand and silt out in the channel, ripple marks
      if (distT < 2.6 + fine * 1.5) { const s = stoneOf(X, Y, 11, seed + 35, 0.38, BED.peb, BED.pebW); if (s) return s; }
      const rip = Math.sin(X * 0.19 + Y * 0.11 + vnc(X, Y, 37, seed + 49) * 5);
      return sd(distT > 6 ? BED.silt : BED.bar, 0.42 + rip * 0.12 + (fine - 0.5) * 0.2, x, y, 0.6);
    }
    case 4: {   // red desert sand, ripples, a few pebbles
      const s = hh(x >> 3, y >> 3, seed + 51) > 0.88 ? stoneOf(X, Y, 12, seed + 37, 0.32, BED.peb, BED.pebW) : null;
      if (s) return s;
      return sd(BED.red, 0.45 + Math.sin(X * 0.17 + Y * 0.07 + vnc(X, Y, 41, seed + 53) * 5) * 0.12 + (fine - 0.5) * 0.15, x, y, 0.6);
    }
    case 5: {   // mud: dark weed in patches, fallen leaves
      if (hh(x >> 1, y >> 1, seed + 55) > 0.985) return sd(BED.leaf, 0.5 + fine * 0.3, x, y, 0.4);
      const wv = vnc(X, Y, 23, seed + 57) + (fine - 0.5) * 0.3;
      if (wv > 0.62) return sd(BED.weed, 0.3 + (wv - 0.62) * 1.2 + (hh(x, y >> 1, seed + 59) - 0.5) * 0.3, x, y, 0.5);
      return sd(BED.mud, 0.4 + fine * 0.3, x, y, 0.6);
    }
    case 6: {   // a sandy seabed: ripples along the shore, seagrass meadows, a boulder now and then
      const g = vnc(X, Y, 61, seed + 61) + (vnc(X, Y, 13, seed + 63) - 0.5) * 0.25;
      if (distT > 3 && g > 0.6) return sd(BED.grass, 0.25 + (g - 0.6) * 1.4 + (Math.sin(X * 0.9 + vnc(X, Y, 5, seed + 65) * 6) > 0.2 ? 0.3 : 0), x, y, 0.5);
      const b = hh(Math.floor(X / 31), Math.floor(Y / 31), seed + 67) > 0.9 ? stoneOf(X, Y, 31, seed + 69, 0.35, BED.rock, BED.gran) : null;
      if (b) return b;
      const rip = Math.sin(X * 0.21 + Y * 0.09 + vnc(X, Y, 43, seed + 71) * 6);
      return sd(BED.sand, 0.5 + rip * 0.1 + (fine - 0.5) * 0.2, x, y, 0.6);
    }
    case 7: {   // a reef: coral heads in patches (lumpy, a few colours), white sand and seagrass between
      const w = worley(X + 0.5, Y + 0.5, 30, seed + 73, 0.9), r = (9 + 9 * w.h) * (0.75 + 0.5 * vnc(X, Y, 9, seed + 85));
      if (distT > 2 && w.h > 0.35 && w.d1 < r && vnc(X, Y, 120, seed + 87) > 0.38) {
        const C = BED.coral[(w.h * 97 | 0) % BED.coral.length], f = worley(X + 0.5, Y + 0.5, 4, seed + 75, 0.9);
        return sd(C, 0.5 - w.d1 / r * 0.32 + (f.d2 - f.d1 < 0.8 ? -0.28 : 0.04) - (w.dx + w.dy) / r * 0.14, x, y, 0.4);
      }
      return bedPx(6, X, Y, distT, fine, seed);
    }
    case 8: {   // a rocky seabed: boulders, kelp, sand between
      const s = stoneOf(X, Y, 22, seed + 77, 0.46, BED.rock, BED.gran);
      if (s) return s;
      const k = vnc(X, Y, 29, seed + 79);
      if (k > 0.55 && Math.sin(X * 0.35 + Y * 0.6 + vnc(X, Y, 7, seed + 81) * 5) > 0) return sd(BED.kelp, 0.3 + (k - 0.55) * 1.4, x, y, 0.5);
      return sd(BED.sand, 0.35 + fine * 0.25, x, y, 0.6);
    }
    default:    // silt (harbours, canals)
      return sd(BED.silt, 0.38 + fine * 0.25 + (hh(x >> 2, y >> 2, seed + 83) > 0.97 ? -0.25 : 0), x, y, 0.6);
  }
}

// ---- the waters' looks ----------------------------------------------------------------------------------------
// r: the water's own colour from the shallows to the deep (four ramps, dithered between by depth over clarity);
// clar: metres the bed shows through (an e-fold); bed: bedPx's kind; lat: the ripple lattice's strength
const STY = [];
// mul: how the water colours what is seen through it (its shallow colour, brightest channel 1)
// (the sea colours what is under it more than fresh water does: the reds go first)
// mul: what the water does to the light off the bed (the sea's takes the reds first, then the greens: turquoise over
// sand; fresh water's a little green)
const sty = (name, hex, clar, bed, lat = 1, deepBed = bed, sea = false) => {
  const r = hex.map((h) => RW(h)), c = r[0][3], mx = Math.max(c[0], c[1], c[2]) || 1;
  const mul = sea ? [0.42, 0.84, 1.0] : [0.62 + 0.3 * c[0] / mx, 0.66 + 0.3 * c[1] / mx, 0.7 + 0.3 * c[2] / mx];
  STY.push({ name, r, clar, bed, deepBed, lat, mul }); return STY.length - 1;
};
const S = {
  alpine: sty('alpine', ['#62bcb4', '#2e93a6', '#1e6492', '#173f70'], 4.2, 2),
  forest: sty('forest', ['#3f9a8c', '#2f817e', '#1f5f6e', '#173f56'], 2.6, 1, 1, 5),
  valley: sty('valley', ['#5c9e88', '#30828a', '#1e6282', '#164a70'], 1.7, 3, 1, 3),
  desert: sty('desert', ['#7ca88c', '#4c8c82', '#2e6c74', '#20505e'], 1.5, 4, 1, 4),
  marsh: sty('marsh', ['#6a7c5c', '#536a56', '#40564e', '#304444'], 0.6, 5, 0.5, 5),
  park: sty('park', ['#3e8278', '#2a6668', '#1d4e5e', '#163a4a'], 1.1, 5, 0.35, 5),
  tropic: sty('tropic', ['#5ad2da', '#3ab6ca', '#1e88b6', '#155a90'], 7.0, 7, 1, 7, true),
  warm: sty('warm', ['#4cc4d0', '#30a8c4', '#1c7cb0', '#155a90'], 5.0, 6, 1, 6, true),
  temperate: sty('temperate', ['#48b2c4', '#2a9cc0', '#1a72aa', '#155a90'], 3.6, 6, 1, 6, true),
  cold: sty('cold', ['#4aa2a6', '#2a869c', '#1a6492', '#14466e'], 2.5, 8, 1, 8, true),
  harbour: sty('harbour', ['#5c8c82', '#3e7282', '#2a5c7a', '#1d4668'], 1.2, 0, 1, 0, true),
};
const FOAM = RW('#e4f2f0', 5, 2, { dark: 0.3, light: 0.6 }), DUCKWEED = RB('#6a8a3a', { dark: 0.5, shift: 0.3 });
const BY_T = { alpine: S.alpine, forest: S.forest, valley: S.valley, desert: S.desert, marsh: S.marsh, park: S.park };
// the sea's look by the coast it washes (the district of the nearest land)
const TROPIC = new Set([14, 44, 45]), WARM = new Set([10, 43, 52, 59]), COLD = new Set([19, 20, 21, 29, 31, 32, 33, 34, 47, 48, 51, 53, 54, 56, 65]);
function seaStyle(d, ty) {
  const D = DISTRICTS[d];
  if (D && (D.style === 'harbor' || D.tier === 'industrial')) return S.harbour;
  if (TROPIC.has(d)) return S.tropic;
  if (WARM.has(d)) return S.warm;
  if (COLD.has(d) || ty < 1000) return S.cold;
  return S.temperate;
}

// ---- what each tile of the bake's window is -------------------------------------------------------------------
const F = { n: 0, k: null, st: null, ld: null, dep: null, tmp: null, fx: null, fy: null, fv: null, sa: null, su: null, ch: null, bs: null, cst: null, rp: null, pk: null, pi: null, on: false };
// the window's calm pockets (world3-rapids.js ch.p): { x, y, r (px), ox, oy (the way out to the current) }
const PKW = [];
function ensure(n) {
  if (F.n === n) return;
  F.n = n; F.k = new Uint8Array(n); F.st = new Uint8Array(n); F.ld = new Float32Array(n); F.dep = new Float32Array(n); F.fx = new Float32Array(n); F.fy = new Float32Array(n);
  F.fv = new Float32Array(n); F.sa = new Float32Array(n); F.su = new Float32Array(n); F.ch = new Int16Array(n); F.bs = new Float32Array(n); F.cst = new Uint8Array(n); F.tmp = new Float32Array(n);
  F.rp = new Float32Array(n); F.pk = new Float32Array(n); F.pi = new Int16Array(n);
}
const LAND_R = 24;
// how far (tiles) each tile of the window is from the nearest land, and which land tile that is: a distance transform
// (chamfer 1 / 1.4, carrying the nearest land) over the window and LAND_R tiles round it - land further off doesn't
// matter. Off the map is water (the open sea); a pier, a bridge's deck stand in the water.
const DT = { n: 0, d: null, hit: null };
function landField(M, TX0, TY0, TN) {
  const G = TN + 2 * LAND_R, n = G * G, X0 = TX0 - LAND_R, Y0 = TY0 - LAND_R;
  if (DT.n !== n) { DT.n = n; DT.d = new Float32Array(n); DT.hit = new Int32Array(n); }
  const D = DT.d, Hh = DT.hit;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const k = j * G + i, x = X0 + i, y = Y0 + j;
    let land = false, g = -1;
    if (M.inside(x, y)) { g = M.idx(x, y); const t = M.tiles[g]; land = t !== T.WATER && t !== T.DEEP && t !== T.BRIDGE && t !== T.DOCK; }
    D[k] = land ? 0 : 1e6; Hh[k] = land ? g : -1;
  }
  const S2 = 1.4142;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const k = j * G + i;
    let v = D[k], h = Hh[k];
    if (i > 0 && D[k - 1] + 1 < v) { v = D[k - 1] + 1; h = Hh[k - 1]; }
    if (j > 0) {
      if (D[k - G] + 1 < v) { v = D[k - G] + 1; h = Hh[k - G]; }
      if (i > 0 && D[k - G - 1] + S2 < v) { v = D[k - G - 1] + S2; h = Hh[k - G - 1]; }
      if (i < G - 1 && D[k - G + 1] + S2 < v) { v = D[k - G + 1] + S2; h = Hh[k - G + 1]; }
    }
    D[k] = v; Hh[k] = h;
  }
  for (let j = G - 1; j >= 0; j--) for (let i = G - 1; i >= 0; i--) {
    const k = j * G + i;
    let v = D[k], h = Hh[k];
    if (i < G - 1 && D[k + 1] + 1 < v) { v = D[k + 1] + 1; h = Hh[k + 1]; }
    if (j < G - 1) {
      if (D[k + G] + 1 < v) { v = D[k + G] + 1; h = Hh[k + G]; }
      if (i < G - 1 && D[k + G + 1] + S2 < v) { v = D[k + G + 1] + S2; h = Hh[k + G + 1]; }
      if (i > 0 && D[k + G - 1] + S2 < v) { v = D[k + G - 1] + S2; h = Hh[k + G - 1]; }
    }
    D[k] = v; Hh[k] = h;
  }
  return G;
}
// the channels of m.waters with their bounding boxes and lengths along (tiles), kept per map
const CH = new WeakMap();
function channels(M) {
  const W = M.waters;
  if (!W || !Array.isArray(W.ch)) return null;
  let c = CH.get(W);
  if (c) return c;
  c = W.ch.map((h) => {
    const p = h.pts, s = new Float32Array(p.length), bb = [1e9, 1e9, -1e9, -1e9];
    for (let j = 0; j < p.length; j++) { if (j) s[j] = s[j - 1] + Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]); bb[0] = Math.min(bb[0], p[j][0]); bb[1] = Math.min(bb[1], p[j][1]); bb[2] = Math.max(bb[2], p[j][0]); bb[3] = Math.max(bb[3], p[j][1]); }
    const r = h.w / 2 + 4;
    // (each calm pocket's way out to the current: toward the nearest point of the centre line)
    const pk = (h.p || []).map(([x, y, pr]) => { let bd = 1e9, ox = 0, oy = 0; for (const q of p) { const dx = q[0] - x, dy = q[1] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; ox = dx; oy = dy; } } const l = Math.hypot(ox, oy) || 1; return { x, y, r: pr, ox: ox / l, oy: oy / l }; });
    return { ...h, s, pk, bb: [bb[0] - r, bb[1] - r, bb[2] + r, bb[3] + r], kind: h.k === 'creek' ? WK.CREEK : h.k === 'marsh' ? WK.MARSH : h.k === 'lake' ? WK.LAKE : WK.RIVER, sty: BY_T[h.t] ?? S.forest };
  });
  CH.set(W, c);
  return c;
}
// mats: the bake's water materials { SEA, LAKE, POND, RIVER } (its material ids); b.tm, b.tw: each tile's material
// and whether it is wet; TX0, TY0, TN: the window
export function waterTiles(C, mats, TN) {
  const { M, b, TX0, TY0 } = C, n = TN * TN;
  ensure(n);
  F.on = false;
  if (!M || !M.tiles) return;
  F.k.fill(0); F.dep.fill(0); F.fx.fill(0); F.fy.fill(0); F.fv.fill(0); F.ch.fill(-1); F.bs.fill(1e9); F.cst.fill(0); F.rp.fill(0); F.pk.fill(0); F.pi.fill(-1); PKW.length = 0;
  const lk = M.waters && Array.isArray(M.waters.lk) ? M.waters.lk : [], flow = M.flow || null;
  let any = false;
  for (let k = 0; k < n && !any; k++) if (b.tw[k]) any = true;
  if (!any) return;
  any = false;
  const G = landField(M, TX0, TY0, TN);
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const k = j * TN + i, m = b.tm[k];
    if (!b.tw[k] || (m !== mats.SEA && m !== mats.LAKE && m !== mats.POND && m !== mats.RIVER)) { F.ld[k] = 0; continue; }
    any = true;
    const tx = TX0 + i, ty = TY0 + j, inside = M.inside(tx, ty), g = inside ? M.idx(tx, ty) : -1;
    const q = (j + LAND_R) * G + i + LAND_R, near = { d: Math.min(LAND_R, Math.max(0.5, DT.d[q] - 0.5)), hit: DT.d[q] <= LAND_R + 0.5 ? DT.hit[q] : -1 };   // (land further off than LAND_R is not this water's coast: what the window round it happens to hold beyond)
    F.ld[k] = near.d;
    if (m === mats.SEA) {
      F.k[k] = WK.SEA;
      const h = near.hit, ht = h >= 0 ? M.tiles[h] : -1;
      F.cst[k] = ht === T.SAND ? 1 : ht === T.SIDEWALK || ht === T.ROAD || ht === T.BUILDING || ht === T.LOT || ht === T.PLAZA ? 2 : 0;   // (a quay, a seawall: deep at once; rock - a cliff, the stacks - 0)
      F.st[k] = seaStyle(h >= 0 ? M.dist[h] : 13, ty);
    } else if (m === mats.LAKE || m === mats.POND) {
      const pond = m === mats.POND || (g >= 0 && M.lake && M.lake[g] === 2);
      F.k[k] = pond ? WK.POND : WK.LAKE;
      let st = pond ? S.park : S.forest;
      for (const L of lk) if (tx >= L.box[0] && ty >= L.box[1] && tx < L.box[2] && ty < L.box[3]) { st = BY_T[L.t] ?? st; break; }
      F.st[k] = st;
    } else {
      F.k[k] = WK.RIVER; F.st[k] = S.valley;
      const f = flow && g >= 0 ? flow.get(g) : undefined;
      if (f !== undefined) { const a = f * Math.PI / 8; F.k[k] = WK.CREEK; F.st[k] = S.forest; F.fx[k] = Math.cos(a); F.fy[k] = Math.sin(a); F.fv[k] = 0.6; F.bs[k] = -1; }
    }
  }
  if (!any) return;
  F.on = true;
  // the channels: each tile of their water takes the nearest centre line's - its kind, look, the way it runs, how far
  // along it and across it (px) it is
  const chs = channels(M);
  if (chs) channelTiles(chs, TX0, TY0, TN);
  for (let k = 0; k < n; k++) if (F.k[k]) F.dep[k] = depthOf(F.k[k], F.ld[k], F.cst[k], F.st[k]);
  // (blurred twice over the water's tiles: where a shallow creek runs into a deep lake the bed falls away over a few
  // tiles, not in the tiles' steps)
  const T2 = F.tmp;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
      const k = j * TN + i;
      if (!F.k[k]) { T2[k] = 0; continue; }
      let s = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= TN || jj >= TN) continue;
        const kk = jj * TN + ii;
        if (F.k[kk]) { s += F.dep[kk]; w++; }
      }
      T2[k] = s / w;
    }
    for (let k = 0; k < n; k++) if (F.k[k]) F.dep[k] = Math.min(F.dep[k] * 1.6 + 0.3, T2[k]);   // (never deeper than its own nearly: the shallows by a bank stay shallow)
  }
}
function channelTiles(chs, TX0, TY0, TN) {
  const n = TN * TN;
  const wx0 = TX0, wy0 = TY0, wx1 = TX0 + TN, wy1 = TY0 + TN;
  chs.forEach((c, ci) => {
    if (c.bb[2] < wx0 || c.bb[0] > wx1 || c.bb[3] < wy0 || c.bb[1] > wy1) return;
    const p = c.pts, hw = c.w / 2, reach = hw + 3;
    for (let q = 1; q < p.length; q++) {
      const ax = p[q - 1][0], ay = p[q - 1][1], dx = p[q][0] - ax, dy = p[q][1] - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2) || 1, ux = dx / L, uy = dy / L;
      const i0 = Math.max(0, Math.floor(Math.min(ax, ax + dx) - reach) - wx0), i1 = Math.min(TN - 1, Math.ceil(Math.max(ax, ax + dx) + reach) - wx0);
      const j0 = Math.max(0, Math.floor(Math.min(ay, ay + dy) - reach) - wy0), j1 = Math.min(TN - 1, Math.ceil(Math.max(ay, ay + dy) + reach) - wy0);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * TN + i, kk = F.k[k];
        if (kk !== WK.RIVER && kk !== WK.LAKE && kk !== WK.POND) continue;
        if (F.bs[k] < 0) continue;   // (a nature site's creek: its own way)
        const cx = wx0 + i + 0.5 - ax, cy = wy0 + j + 0.5 - ay;
        let t = L2 ? (cx * dx + cy * dy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = cx - dx * t, ey = cy - dy * t, dist = Math.sqrt(ex * ex + ey * ey);
        if (dist > reach) continue;
        const score = dist / hw;
        if (score >= F.bs[k]) continue;
        F.bs[k] = score; F.ch[k] = ci;
        F.sa[k] = (c.s[q - 1] + t * L) * TILE; F.su[k] = (ex * -uy + ey * ux) * TILE;
        F.fx[k] = ux; F.fy[k] = uy;
      }
    }
  });
  for (let k = 0; k < n; k++) {
    const ci = F.ch[k];
    if (ci < 0 || F.bs[k] < 0) continue;
    const c = chs[ci];
    if (F.k[k] === WK.RIVER) { F.k[k] = c.kind; F.st[k] = c.sty; }
    else if (c.kind === WK.LAKE) F.st[k] = c.sty;   // (a lake laid as a piece: its look)
    if (F.k[k] === WK.LAKE || F.k[k] === WK.POND || F.k[k] === WK.MARSH) { F.fv[k] = 0; continue; }   // (the marsh lies still: its braids barely move)
    // the rapids (world3-rapids.js ch.r: [s0, s1, how wild], tiles along): white, fast water, easing in and out over a
    // few tiles at each end
    let rp = 0;
    if (c.r) { const s = F.sa[k] / TILE; for (const [s0, s1, w] of c.r) if (s > s0 - 6 && s < s1 + 6) rp = Math.max(rp, w * Math.min(1, (s - s0 + 6) / 10, (s1 + 6 - s) / 10)); }
    F.rp[k] = rp;
    F.fv[k] = rp > 0 ? Math.max(c.v, 0.5 + 0.45 * rp) : c.v;
  }
  // the calm pockets: still, deep water by a bank, fading out into the current over a couple of tiles
  chs.forEach((c) => {
    if (!c.pk.length || c.bb[2] < wx0 || c.bb[0] > wx1 || c.bb[3] < wy0 || c.bb[1] > wy1) return;
    for (const P of c.pk) {
      const R = P.r + 2.5;
      if (P.x + R < wx0 || P.x - R > wx1 || P.y + R < wy0 || P.y - R > wy1) continue;
      const pi = PKW.length;
      PKW.push({ x: P.x * TILE, y: P.y * TILE, r: P.r * TILE, ox: P.ox, oy: P.oy });
      for (let j = Math.max(0, Math.floor(P.y - R) - wy0); j <= Math.min(TN - 1, Math.ceil(P.y + R) - wy0); j++) for (let i = Math.max(0, Math.floor(P.x - R) - wx0); i <= Math.min(TN - 1, Math.ceil(P.x + R) - wx0); i++) {
        const k = j * TN + i;
        if (F.k[k] !== WK.RIVER && F.k[k] !== WK.CREEK) continue;
        const d = Math.hypot(wx0 + i + 0.5 - P.x, wy0 + j + 0.5 - P.y), u = Math.min(1, d / R), w = 1 - u * u;   // (deepest in its middle, easing out to the current)
        if (w <= F.pk[k]) continue;
        F.pk[k] = w; F.pi[k] = pi;
        F.fv[k] = F.fv[k] * (1 - 0.95 * w); F.rp[k] *= 1 - w;
      }
    }
  });
}

// ---- one pixel --------------------------------------------------------------------------------------------------
export const WQ = { c: null, nx: 0, ny: 0, code: 255, inl: false, solid: false, z: 0 };
// ---- boulders in the water ----------------------------------------------------------------------------------------
// One in a 48 px cell now and then, by the water and how near the bank (a mountain creek is strewn with them; a
// river has a few along its banks; a rocky sea coast its stacks of rock; a mountain lake's shore its granite): a dome
// of rock lit by the light pass (its normal, its height), wet and dark at the waterline, moss on top in the woods; a
// collar of foam round it - white on the side the current comes from, a broken wake behind.
const BCELL = 64, BOULDER = [0, 0.1, 0.14, 0.06, 0.06, 0, 0], BOULDER_DT = [0, 5, 99, 3, 3, 0, 0];
const MOSS_W = RB('#5e7a34', { dark: 0.55, shift: 0.3 }), BASALT_W = RB('#4e4c4a', { dark: 0.6, light: 0.45 });
// (rp: how wild the rapids are there - world3-rapids.js: strewn right across them, more the wilder)
function boulder(X, Y, k, st, dt, cst, fx, fy, fv, seed, rp = 0) {
  let pk = k === WK.SEA ? (cst === 0 ? 0.07 : 0) : k === WK.LAKE ? (st === S.alpine || st === S.forest ? BOULDER[k] : 0) : BOULDER[k];
  if (rp > 0.05) pk = Math.max(pk, 0.04 + 0.13 * rp);
  if (!pk || (dt > BOULDER_DT[k] + 1 && rp < 0.25)) return 0;
  const cx = Math.floor(X / BCELL), cy = Math.floor(Y / BCELL), h = hh(cx, cy, seed + 301);
  if (h >= pk * (dt < 2.5 ? 1.7 : 0.55 + rp * 0.6)) return 0;   // (most by the banks - and across a rapid)
  const h2 = hh(cy, cx, seed + 303), r = 6 + 9 * h2 + 6 * rp, bx = (cx + 0.32 + 0.36 * hh(cx, cy, seed + 305)) * BCELL, by2 = (cy + 0.32 + 0.36 * hh(cy, cx, seed + 307)) * BCELL;
  const dx = X - bx, dy = Y - by2, D = Math.sqrt(dx * dx + dy * dy) * (0.86 + 0.28 * vnc(X, Y, 7, seed + 317));   // (lumpy, not round)
  if (D < r) {
    const u = D / r, x = X | 0, y = Y | 0;
    const R0 = k === WK.SEA ? BASALT_W : st === S.alpine ? BED.gran : BED.rock;
    let t = 0.56 - (dx + dy) / r * 0.26 + (hh(x >> 1, y >> 1, seed + 309) - 0.5) * 0.12;
    if (u > 0.82) t -= 0.3;
    WQ.c = st === S.forest && dy < -r * 0.25 && dx < r * 0.3 && vnc(X, Y, 5, seed + 311) > 0.45 ? sd(MOSS_W, t + 0.05, x, y, 0.4) : sd(R0, t, x, y, 0.4);
    WQ.nx = dx / r * 0.9; WQ.ny = dy / r * 0.9; WQ.z = Math.max(1, Math.round((1 - u * u) * r * 0.75));
    WQ.solid = true;
    return 1;
  }
  const run = fv > 0.08, ax = run ? -(dx * fx + dy * fy) / (D || 1) : 0;   // (ax > 0: on the upstream side)
  if (run ? ax > -0.25 && D < r + 1.2 + (ax + 0.25) * 3.2 : D < r + 1.4 && vnc(X, Y, 5, seed + 319) > 0.4) { if (hh(X | 0, Y | 0, seed + 313) > 0.15) return 2; }
  if (run) {   // the wake: broken foam trailing downstream
    const along = (dx * fx + dy * fy), across = Math.abs(-dx * fy + dy * fx);
    if (along > 0 && along < r * 3 && across < r * (0.8 - along / (r * 5)) && vnc(X * 0.7, Y * 0.7, 4, seed + 315) > 0.52 + along / (r * 8)) return 2;
  }
  return 0;
}
const MIX = [0, 0, 0], MIX2 = [0, 0, 0];
const mixTo = (o, a, b, k) => { o[0] = a[0] + (b[0] - a[0]) * k; o[1] = a[1] + (b[1] - a[1]) * k; o[2] = a[2] + (b[2] - a[2]) * k; return o; };
const WET = [200, 226, 220];
// how clear each kind of water is, against its look's clarity (a big river carries silt; a creek runs clear)
const CLAR_K = [1, 1, 1.15, 0.75, 1, 1, 1];
// how much the bed's depth wanders (the sea's sandbanks and hollows; a pond's bowl is smooth)
const DEPTH_N = [0.36, 0.36, 0.3, 0.3, 0.25, 0.1, 0.25];
// metres of water at a pixel: kind, the tiles to the shore, the sea's coast (0 rock, 1 sand, 2 a quay), its look
function depthOf(k, dt, cst, st) {
  switch (k) {
    case WK.SEA: { const s = cst === 1 ? (st === S.tropic ? 0.14 : 0.22) : cst === 2 ? 1.4 : 0.55, e = dt - 10; return s * dt + (e > 0 ? e * e * 0.08 : 0); }
    case WK.LAKE: { const e = dt - 8; return Math.min(14, 0.32 * dt + (e > 0 ? e * e * 0.05 : 0)); }
    case WK.POND: return Math.min(3.2, 0.55 * dt);
    case WK.CREEK: return Math.min(2.4, 0.3 * dt);
    case WK.MARSH: return Math.min(1.4, 0.16 * dt);
    default: return Math.min(3.4, 0.21 * dt);
  }
}
// C: the bake (its window: TX0, TY0, and seed); X, Y world px; d px to the shore (0..47); ti the pixel's tile in the
// window, k00 the top-left of the 2 x 2 tiles round it (vx, vy: where between them); kind: the water its material is
// (what it is when the window's facts are off: a swatch, a map without tiles)
export function waterPx(C, X, Y, d, ti, k00, vx, vy, TN, kind = WK.RIVER) {
  const seed = C.seed | 0, x = X | 0, y = Y | 0;
  let k = kind, st = kind === WK.SEA ? S.temperate : kind === WK.POND ? S.park : kind === WK.LAKE ? S.forest : S.valley, cst = 0, dt = d / TILE, dep = -1, fx = 0, fy = 0, fv = 0, sa = 0, su = 0, chan = false, rp = 0, pk = 0, pi = -1;
  if (F.on) {
    // which water and what look: one of the four tiles round the pixel, picked by their weights through a dither -
    // where two waters meet (a river's mouth at the sea, a creek into a lake, one coast's sea and another's) the
    // looks dither into each other over a tile, not the tiles' steps
    const w00 = (1 - vx) * (1 - vy), w10 = vx * (1 - vy), w01 = (1 - vx) * vy, r = (by(x, y) + 0.5) * 0.55 + hh(x, y, seed + 209) * 0.45;
    let kc = r < w00 ? k00 : r < w00 + w10 ? k00 + 1 : r < w00 + w10 + w01 ? k00 + TN : k00 + TN + 1;
    if (!F.k[kc]) kc = ti;
    if (F.k[kc]) { k = F.k[kc]; st = F.st[kc]; cst = F.cst[kc]; }
    const ld = (F.ld[k00] * (1 - vx) + F.ld[k00 + 1] * vx) * (1 - vy) + (F.ld[k00 + TN] * (1 - vx) + F.ld[k00 + TN + 1] * vx) * vy;
    const far = Math.max(46 / TILE, ld - 0.35), u = d < 36 ? 0 : (d - 36) / 10;
    dt = d >= 46 ? far : d / TILE * (1 - u) + Math.max(d / TILE, far) * u;
    dep = (F.dep[k00] * (1 - vx) + F.dep[k00 + 1] * vx) * (1 - vy) + (F.dep[k00 + TN] * (1 - vx) + F.dep[k00 + TN + 1] * vx) * vy;
    fx = (F.fx[k00] * (1 - vx) + F.fx[k00 + 1] * vx) * (1 - vy) + (F.fx[k00 + TN] * (1 - vx) + F.fx[k00 + TN + 1] * vx) * vy;
    fy = (F.fy[k00] * (1 - vx) + F.fy[k00 + 1] * vx) * (1 - vy) + (F.fy[k00 + TN] * (1 - vx) + F.fy[k00 + TN + 1] * vx) * vy;
    fv = F.fv[ti];
    const c0 = F.ch[k00];
    chan = c0 >= 0 && F.bs[k00] >= 0 && F.ch[k00 + 1] === c0 && F.ch[k00 + TN] === c0 && F.ch[k00 + TN + 1] === c0 && k !== WK.LAKE && k !== WK.POND;
    if (chan) {
      sa = (F.sa[k00] * (1 - vx) + F.sa[k00 + 1] * vx) * (1 - vy) + (F.sa[k00 + TN] * (1 - vx) + F.sa[k00 + TN + 1] * vx) * vy;
      su = (F.su[k00] * (1 - vx) + F.su[k00 + 1] * vx) * (1 - vy) + (F.su[k00 + TN] * (1 - vx) + F.su[k00 + TN + 1] * vx) * vy;
      rp = (F.rp[k00] * (1 - vx) + F.rp[k00 + 1] * vx) * (1 - vy) + (F.rp[k00 + TN] * (1 - vx) + F.rp[k00 + TN + 1] * vx) * vy;
    }
    pk = (F.pk[k00] * (1 - vx) + F.pk[k00 + 1] * vx) * (1 - vy) + (F.pk[k00 + TN] * (1 - vx) + F.pk[k00 + TN + 1] * vx) * vy;
    if (pk > 0) pi = F.pi[ti] >= 0 ? F.pi[ti] : F.pi[k00] >= 0 ? F.pi[k00] : F.pi[k00 + TN + 1];
  }
  WQ.solid = false;
  const rock = boulder(X, Y, k, st, dt, cst, fx, fy, fv, seed, rp);
  if (rock === 1) return WQ;
  const S0 = STY[st], big = vnc(X, Y, 37, seed + 3), fine = vnc(X, Y, 7, seed + 5);
  // metres of water: the tiles' depths blended (seamless across tiles and waters), shallower still by the shore
  let depth = dep >= 0 ? dep : depthOf(k, dt, cst, st);
  if (d < 46) depth = Math.min(depth, depthOf(k, dt, cst, st));
  depth *= 1 + DEPTH_N[k] * (vnc(X, Y, 83, seed + 7) - 0.5);
  // (far out at sea every coast's water is the same deep blue: its clarity eases to the open sea's)
  const clar = k === WK.SEA && dt > 16 ? S0.clar + (STY[S.temperate].clar - S0.clar) * Math.min(1, (dt - 16) / 7) : S0.clar;
  const q = depth / (clar * CLAR_K[k]), vis = Math.exp(-q);
  // the water's own colour: four depths of it, ordered-dithered between
  const qd = q + by(x, y) * 0.5, rr = S0.r[qd < 0.7 ? 0 : qd < 1.8 ? 1 : qd < 3.6 ? 2 : 3];
  const still = k === WK.POND || k === WK.LAKE;
  let t = 0.62 - Math.min(1, q / 5) * 0.2 + (big - 0.5) * 0.14 + (fine - 0.5) * 0.05;
  // the ripples: Worley cells' edges - fish scales on the sea, a fine lattice on lakes, stretched along a river's
  // current; brighter in the shallows, in drifting patches out on open water
  let lat = false, lane = false;
  if (k === WK.SEA) {
    const w = worley(X * 0.8 + fine * 3, Y + big * 7, q < 1.2 ? 11 : 15, seed + 7, 0.85), edge = w.d2 - w.d1;
    lat = edge < (q < 1.2 ? 1.05 : 0.75 * (0.4 + vnc(X, Y, 97, seed + 4)));
  } else {
    const w = chan ? worley(sa * 0.5 + fine * 2, su + big * 4, 12, seed + 9, 0.85) : worley(X * 0.9, Y + big * 5, 12, seed + 9, 0.85), edge = w.d2 - w.d1, patch = vnc(X, Y, 71, seed + 11);
    lat = edge < (q < 0.6 ? 0.85 : patch > 0.55 ? 0.7 : 0.3) * S0.lat * (1 - 0.6 * pk);   // (a calm pocket: glassy)
    if (chan && fv > 0.08) {   // the current: long thin lines along the channel, broken, faster water more of them
      const lp = (su + 2.6 * Math.sin(sa * 0.031 + seed)) / 4.2, ln = Math.floor(lp), lh = hh(ln, 7, seed), env = vnc(sa * 0.5 + lh * 400, ln * 13, 14, seed + 9);
      lane = env > 0.78 - fv * 0.12 && lp - ln < 0.3 && Math.sin(sa / (44 + lh * 30) * 6.283 + lh * 40) > -0.1;
    }
  }
  let c = sd(rr, t, x, y, 0.7);
  // the bed through the water: tinted by it, fading as it deepens (in dithered steps)
  if (vis > 0.04) {
    let bed = bedPx(q > 1.2 && still ? S0.deepBed : k === WK.SEA ? (cst === 1 ? S0.bed : cst === 2 ? 0 : S0.bed === 7 || S0.bed === 6 ? 8 : S0.bed) : S0.bed, X, Y, dt, fine, seed);
    if (C.wk && C.wk.length) { const wp = wreckPx(C.wk, X, Y, seed); if (wp) bed = wp; }   // (a sunken boat lying on it: shared/world3-wrecks.js)
    // (seen through water: coloured by it - the reds go first - and dimmer the deeper it lies)
    const mul = S0.mul, dim = 0.62 + 0.3 * vis;
    MIX2[0] = bed[0] * mul[0] * dim; MIX2[1] = bed[1] * mul[1] * dim; MIX2[2] = bed[2] * mul[2] * dim;
    const kd = Math.floor(clamp01(vis * 1.05 + by(x, y) * 0.22) * 4) / 4;
    if (kd > 0) c = mixTo(MIX, c, MIX2, kd * 0.88);
  }
  if (lat && k === WK.SEA && d < 30 && cst !== 2) c = sd(FOAM, 0.28 + (d < 14 ? 0.15 : 0) + fine * 0.2, x, y, 0.4);   // (the crests break white near the shore)
  else if (lat) c = mixTo(MIX, c, rr[Math.min(rr.length - 1, 5)], q < 0.6 ? 0.34 : 0.2);
  if (lane) c = mixTo(MIX, c, rr[5], 0.22);
  if (rp > 0.04) {   // the rapids: churns of white water in patches, standing waves in trains by them (thin crests across the current), foam streaks along it, the rest paled with air
    const ww = vnc(sa * 0.5, su, 26, seed + 241) - 0.8 + rp * 0.32, bit = vnc(X, Y, 4, seed + 231);
    if (ww > 0 && bit > 0.62 - ww * 1.6) c = sd(FOAM, (hh(x >> 1, y >> 1, seed + 243) > 0.45 ? 0.68 : 0.4) + fine * 0.25, x, y, 0.4);   // (broken: bright foam and blue-grey, gaps between, solid in the middle)
    else if (ww > -0.12 && Math.sin(sa * 0.3 + Math.sin(su * 0.045 + seed) * 1.4 + big * 2.5) > 0.93 && hh(x >> 1, y >> 1, seed + 235) > 0.3) c = sd(FOAM, 0.38 + fine * 0.2, x, y, 0.4);
    else if (vnc(sa * 0.1, su * 1.1, 6, seed + 233) > 0.88 - rp * 0.1) c = mixTo(MIX, c, WET, 0.2 + 0.2 * rp);
    else c = mixTo(MIX, c, WET, 0.2 * rp);
  } else if (pi >= 0 && pk > 0.04) {   // a calm pocket: a slow swirl turning in it, the eddy's line of foam where the current goes by
    const P = PKW[pi], ex = X - P.x, ey = Y - P.y, D = Math.sqrt(ex * ex + ey * ey), u = D / P.r;
    c = mixTo(MIX, c, rr[0], 0.3 * pk);   // (a deep hole: darker, easing out)
    if (u < 0.9 && fine > 0.35 && Math.sin(D * 0.2 - Math.atan2(ey, ex) * 2 + seed) > 0.95) c = mixTo(MIX, c, rr[5], 0.16);
    else if (Math.abs(D - P.r) < 2.2 + fine * 1.5 && ex * P.ox + ey * P.oy > D * 0.4 && vnc(X, Y, 7, seed + 237) > 0.45 && hh(x >> 1, y >> 1, seed + 239) > 0.35) c = sd(FOAM, 0.4 + fine * 0.3, x, y, 0.4);
  }
  // the water's edge
  if (k === WK.SEA) {
    if (cst === 2) { if (d < 1.6) c = sd(FOAM, 0.45, x, y, 0.4); }
    else if (d < 18) {                                  // the wash: foam at the waterline, a broken scalloped band beyond
      const wash = 2.5 + 2 * Math.sin(X * 0.07 + Y * 0.05) + fine * 2.5;
      if (d < wash) c = sd(FOAM, 0.85 - d / wash * 0.35, x, y, 0.4);
      else if (Math.abs(d - (10 + 3.5 * Math.sin(X * 0.05 + Y * 0.031))) < 1.1 + fine * 1.4 && hh(x >> 1, y >> 1, seed) > 0.3) c = sd(FOAM, 0.62, x, y, 0.4);
    }
  } else if (d < 1.4) c = mixTo(MIX, c, WET, k === WK.CREEK ? 0.5 : 0.35);
  else if (k === WK.MARSH && vnc(X, Y, 47, seed + 221) + (fine - 0.5) * 0.3 > 0.76 && hh(x >> 1, y >> 1, seed + 223) > 0.55) c = sd(DUCKWEED, 0.25 + fine * 0.4, x, y, 0.5);   // (duckweed floating in drifts)
  else if (k === WK.CREEK && d < 3.2 && hh(x >> 1, y >> 1, seed + 211) > 0.55) c = mixTo(MIX, c, WET, 0.3);
  if (rock === 2) c = sd(FOAM, 0.55 + fine * 0.35, x, y, 0.4);
  WQ.c = c;
  const calm = k === WK.POND ? 0.25 : k === WK.LAKE || k === WK.MARSH ? 0.6 : 1;
  WQ.nx = (fine - 0.5) * 0.08 * calm; WQ.ny = (big - 0.5) * 0.1 * calm;
  // what the light pass needs (the header)
  const clear = vis > 0.3 ? 1 : 0;
  if (k === WK.SEA) { WQ.inl = false; WQ.code = d < 46.5 ? 191 + Math.round(d) : vis > 0.02 ? 239 + Math.min(15, (vis * 18) | 0) : 255; }
  else if (fv > 0.08 && (fx || fy)) {
    WQ.inl = true;
    const dir = Math.round(Math.atan2(fy, fx) / (Math.PI / 8)) & 15;
    WQ.code = 128 + dir * 4 + (fv > 0.55 ? 2 : 0) + clear;
  } else {
    WQ.inl = true;
    WQ.code = d < 23.5 ? 192 + Math.round(d) : (k === WK.POND ? 224 : 216) + Math.min(7, (vis * 9) | 0);
  }
  return WQ;
}
// the kind of water and how deep it is at a world point, from the last waterTiles (for the dressing: reeds stand in
// the shallows, lilies float on still water): { k, depth } or null on land
export const WAT = { k: 0, depth: 0, fv: 0, st: 0, pk: 0 };
export function waterAt(C, X, Y, d, TN) {
  if (!F.on) return null;
  const tj = Math.floor(Y / TILE) - C.TY0, ti = Math.floor(X / TILE) - C.TX0;
  if (tj < 0 || ti < 0 || tj >= TN || ti >= TN) return null;
  const k = tj * TN + ti;
  if (!F.k[k]) return null;
  const dt = d < 46 ? d / TILE : Math.max(46 / TILE, F.ld[k] - 0.35);
  WAT.k = F.k[k]; WAT.depth = depthOf(WAT.k, dt, F.cst[k], F.st[k]); WAT.fv = F.fv[k]; WAT.st = F.st[k]; WAT.pk = F.pk[k];
  return WAT;
}
export const STYLE_NAMES = STY.map((s) => s.name);
// no window's facts (a swatch sheet): each water by its material alone
export function waterOff() { F.on = false; }
