// The redwoods by hand (the nature showcase, 2026-10-31: the owner's concepts NR1-E, N2-A and N1-A treated as real
// places, then their kit spread over the other places of the kind in Highland Woods). Three scenes rebuilt:
// - Redwood Creek Falls (NR1-E): a wide curtain fall off a lip of dark basalt columns, a mossy log fallen across its
//   top; the columns wrap the plunge pool in a horseshoe, stepping down toward you either side; spray and mist at the
//   foot; the clear green pool with mossy boulders in it and round its edge; the outflow tumbling between boulders past
//   a cobble bar to the footbridge; a switchback trail down from the trapper's cabin with timber steps to a railed
//   wooden viewing deck on the pool's west side (where the way into the Redwood Caverns runs); redwood trunks and ferns
//   framing it; shafts of sun through the canopy. The camp that stood where the east wall goes moves east of it.
// - Hidden Pool (N2-A, the misty fern glade): the glade's floor dark forest duff with puddles, the big mossy log with
//   fly agarics, shelf fungi and glowing blue caps along it (the forager's round: the mushrooms to pick there), a little
//   falls off a mossy column ledge into the creek's clear pool, stepping stones across it, moss boulders, ferns, mist,
//   autumn-yellow maples among the conifers.
// - The Giants Loop (N1-A): giant redwood trunks along the dirt loop, a spring-fed creek over boulders crossing it under a
//   railed plank footbridge into a little pond inside the loop, split-rail fence at the turns, mossy fallen logs, ferns
//   and shafts of light (the hikers already walk it: server/systems/wildfolk.js).
// The kit (each a function here, laid by the scenes and again elsewhere): columnBowl - a falls off basalt columns with
// its horseshoe and pool; cheeks - basalt columns wrapping the ends of a ledge fall's lip and stepping down its banks;
// gladeDress - the fern glade's floor, log fungi, puddles, ferns, maples, mist; creek - a boulder creek with a plank
// footbridge where a trail crosses it; trailEdge - ferns, split rails, mossy logs and light along a trail. Spread to the
// ledge falls (Mossy Ledge Falls, Twin Falls, Willow River Falls), the glades (Fern Hollow, Elk Glade, Toadstool Glade)
// and the trails (Mast Ridge Trail, Gorge Trail, Highland Way, Giants Link).
// The art: client/art2/props-redwoods.js (props 'rk': k 'cols', 'fall', 'fungi', 'puddle', 'stone', 'mist', 'ray' -
// client/art2/game/statics.js rkItem). For the whole-world build only (shared/world3-world.js's done hook, before the
// falls in view). Deterministic: arithmetic and integer hashes.
import { TILE, T } from './constants.js';

export const REDWOODS3 = {
  ledges: ['Mossy Ledge Falls', 'Twin Falls', 'Willow River Falls'],
  glades: ['Fern Hollow', 'Elk Glade', 'Toadstool Glade'],
  trails: ['Mast Ridge Trail', 'Gorge Trail', 'Highland Way', 'Giants Link'],
  trunk: { giantL: 62, giant: 48, giantS: 36 },   // (solid radius: shared/naturesites.js REDWOOD_TRUNK)
};
const RES = 32;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// a Catmull-Rom line through control points, n samples a span
function spline(cp, n = 8) {
  const out = [];
  for (let i = 0; i < cp.length - 1; i++) {
    const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(cp[cp.length - 1].slice());
  return out;
}

// the pass's tools: tiles, props to add, props to take away, solids
function context(m, H3) {
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const P = [], S = [], gone = new Set();
  const C = {
    m, W, HH, inF, idx, P, S, gone,
    at: (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return inF(tx, ty) ? idx(tx, ty) : -1; },
    tile: (x, y) => { const i = C.at(x, y); return i < 0 ? -1 : m.tiles[i]; },
    wet: (x, y) => { const t = C.tile(x, y); return t === T.WATER || t === T.DEEP; },
    // open woods ground: grass, dirt or sand, not a building's, not a road's
    open: (x, y) => { const i = C.at(x, y); if (i < 0) return false; const t = m.tiles[i]; return (t === T.GRASS || t === T.DIRT || t === T.SAND) && m.land[i] && !(m.bld && m.bld[i] >= 0); },
    prop: (t, x, y, r = 0, ex = null) => { P.push([t, Math.round(x), Math.round(y), r, ex]); },
    solid: (x, y, r) => S.push([Math.round(x), Math.round(y), r]),
    // take away what stood where pred(p) says (by its spot)
    drop: (pred) => { for (const p of m.props) if (p && pred(p)) gone.add(p.x + ',' + p.y); },
    water: (i, deep = false) => { m.tiles[i] = deep ? T.DEEP : T.WATER; m.land[i] = 0; m.river[i] = 1; m.reserve[i] |= RES; if (m.lake) m.lake[i] = 0; if (m.flow) m.flow.delete(i); },
    ground: (i, t) => { if (m.tiles[i] === T.ROAD || m.tiles[i] === T.BRIDGE || m.tiles[i] === T.LOT || (m.bld && m.bld[i] >= 0)) return; m.tiles[i] = t; m.land[i] = 1; m.river[i] = 0; m.reserve[i] |= RES; },
    // a dirt path along pts (px): the tiles within hw dirt, the ground bake's track drawn along it
    path: (pts, hw = 26) => {
      for (const [x, y] of pts) for (let ty = Math.floor((y - hw) / TILE); ty <= Math.floor((y + hw) / TILE); ty++) for (let tx = Math.floor((x - hw) / TILE); tx <= Math.floor((x + hw) / TILE); tx++) {
        if (!inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > hw) continue;
        const i = idx(tx, ty); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.SAND) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; }
      }
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      (m.tracks ||= []).push({ pts: pts.map(([x, y]) => [Math.round(x), Math.round(y)]), hw, bb: [x0 - 40, y0 - 40, x1 + 40, y1 + 40] });
      C.drop((p) => p.t !== 'painted' && pts.some(([x, y]) => Math.abs(p.x - x) < hw + 16 && Math.abs(p.y - y) < hw + 16) && /^(tree_|shrub_|bush_|flowers_|redwood|boulder|log$|rwlog|rwstump)/.test(p.t));
    },
    flush: () => {
      if (gone.size && H3.removeProps) H3.removeProps(m, (x, y) => gone.has(x + ',' + y));
      for (const [t, x, y, r, ex] of P) H3.addProp(m, t, x, y, r, ex);
      if (m.addSolidProp) for (const [x, y, r] of S) m.addSolidProp(x, y, r);
      P.length = 0; S.length = 0; gone.clear();
    },
  };
  return C;
}

// a pool and its run as a creek channel of the map's waters (shared/world3-waterbodies.js; the bake's water reads it:
// running clear, not a pond's still water with lilies) with a plunge pool at its head - pts tiles, w its width (tiles),
// pool [x, y, r] tiles
// a trunk this close to a trail's line (the woods' trails: shared/world3-trails.js natureSites) would stand on it
function onTrail3(C, x, y, r = 70) {
  for (const q of C.m.natureSites || []) if (q && q.kind === 'trail' && Array.isArray(q.line)) for (const [a, b] of q.line) if (Math.abs(a - x) < r && Math.abs(b - y) < r) return true;
  return false;
}
function channel(C, pts, w, pool, rap = null) {
  const V = C.m.waters;
  if (!V || !Array.isArray(V.ch)) return;
  V.ch.push({ k: 'creek', w, t: 'forest', v: 0.45, hand: 1, pts: pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]), ...(pool ? { p: [[...pool.map((q) => Math.round(q * 10) / 10), 2]] } : {}), ...(rap ? { r: [rap] } : {}) });
}
// a rim of big mossy boulders along the shore of the water tiles in box [x0, y0, x1, y1] (px) - over the tiles'
// stepped edge, a little out into the water - north of yN none (under a falls); every so often a smaller one between
function rimRocks(C, x0, y0, x1, y1, yN, seed, pick = null) {
  const m = C.m, wetT = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP;
  let n = 0;
  for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) {
    if (!C.inF(tx, ty) || !wetT(C.idx(tx, ty))) continue;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const j = C.idx(tx + dx, ty + dy), t = m.tiles[j];
      if (wetT(j) || t === T.ROAD || t === T.BRIDGE || t === T.WALL) continue;
      const x = (tx + 0.5 + dx * 0.36) * TILE, y = (ty + 0.5 + dy * 0.36) * TILE + 6;
      if (y < yN || (pick && !pick(x, y)) || hh(tx * 4 + dx + 2, ty * 4 + dy + 2, seed) < 0.08) continue;
      const big = hh(tx, ty * 3 + dx, seed + 1);
      C.prop('boulder', x + (hh(tx, ty, seed + 2) - 0.5) * 10, y, 0, { s: big < 0.6 ? 34 + Math.round(big * 30) : 18 + Math.round(big * 10), moss: hh(tx, ty, seed + 3) < 0.35 ? 1 : 0, style: 'granite' });
      n++;
    }
  }
  return n;
}
// ---- the kit --------------------------------------------------------------------------------------------------
// a run of basalt columns with its front's foot at (x, y), solid along its footprint
function cols(C, x, y, len, h, d, seed, wet = 0, fall = 0) {
  C.prop('rk', x, y, 0, { k: 'cols', len, h, d, s: seed, wet, fall });
  for (const yy of [y - 12, y - d + 14]) for (let k = -len / 2 + 12; k <= len / 2 - 12; k += 18) C.solid(x + k, yy, 13);
}
// a rough round of tiles (cx, cy, rx, ry px; wob 0..1 how ragged; seed): fn(i, q) for each, q 0 (middle) .. 1 (edge)
function blob(C, cx, cy, rx, ry, wob, seed, fn) {
  for (let ty = Math.floor((cy - ry * 1.3) / TILE); ty <= Math.floor((cy + ry * 1.3) / TILE); ty++) for (let tx = Math.floor((cx - rx * 1.3) / TILE); tx <= Math.floor((cx + rx * 1.3) / TILE); tx++) {
    if (!C.inF(tx, ty)) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, a = Math.atan2((y - cy) / ry, (x - cx) / rx);
    const k = 1 + wob * (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 5 + seed * 1.7) * 0.3 + (hh(tx, ty, seed) - 0.5) * 0.4);
    const q = Math.sqrt(((x - cx) / (rx * k)) ** 2 + ((y - cy) / (ry * k)) ** 2);
    if (q <= 1) fn(C.idx(tx, ty), q, x, y);
  }
}
// a sword fern (the big ones of the redwood floor) on open ground
function fern(C, x, y, big = true) { if (C.open(x, y)) C.prop('shrub_a', x, y, 0, { sp: big ? 'fernR' : 'fern', k: 1 }); }
function mossRock(C, x, y, s, style = 'basalt') { C.prop('boulder', x, y, s > 26 ? 14 : 0, { s, moss: 1, style }); }

// A falls off basalt columns with its horseshoe and pool (NR1-E): F the foot of the fall (px); o.w the water's width,
// o.drop, o.side the columns either side of it; o.back / o.arms the runs of columns [dx, dy (front's foot), len, h, d,
// wet, fall] (the back wall either side, the arms stepping down toward the camera); o.pool [dx, dy, rx, ry] carved
// clear water, DEEP in the middle; o.rocks [dx, dy, s] mossy boulders in and round it; o.mist [dx, dy, w, d]
function columnBowl(C, F, o) {
  const [fx, fy] = F, sd = o.seed || 7;
  C.prop('rk', fx, fy, 0, { k: 'fall', w: o.w, drop: o.drop, side: o.side, s: sd, log: o.log === 0 ? 0 : 1 });
  for (let k = -o.w / 2 - o.side + 10; k <= o.w / 2 + o.side - 10; k += 16) C.solid(fx + k, fy - 18, 12);   // (the lip and its rock: not climbed)
  for (let k = -o.w / 2 - o.side + 10; k <= o.w / 2 + o.side - 10; k += 16) if (Math.abs(k) > o.w / 2) C.solid(fx + k, fy - 2, 12);
  for (const [dx, dy, len, h, d, wet, fall] of (o.back || []).concat(o.arms || [])) if (!C.wet(fx + dx, fy + dy - 12) && !C.wet(fx + dx, fy + dy - d / 2)) cols(C, fx + dx, fy + dy, len, h, d, sd + Math.round(dx / 7) + Math.round(dy), wet || 0, fall || 0);   // (never standing in the water)
  let pool = 0;
  if (o.pool) {
    const [dx, dy, rx, ry] = o.pool, north = fy + (o.north ?? 10);
    blob(C, fx + dx, fy + dy, rx, ry, o.wob ?? 0.16, sd, (i, q, x, y) => {
      if (y < north || C.m.tiles[i] === T.ROAD || C.m.tiles[i] === T.BRIDGE || C.m.tiles[i] === T.LOT || (C.m.bld && C.m.bld[i] >= 0)) return;
      if (o.keep && o.keep(x, y)) return;
      for (const [dx, dy, len, , d] of (o.back || []).concat(o.arms || [])) if (Math.abs(x - fx - dx) < len / 2 + 8 && y > fy + dy - d - 8 && y < fy + dy + 14) return;   // (not under the columns)
      C.water(i, q < 0.42 && y > north + 40); pool++;
    });
  }
  for (const [dx, dy, s] of o.rocks || []) mossRock(C, fx + dx, fy + dy, s);
  for (const [dx, dy, w, d] of o.mist || []) C.prop('rk', fx + dx, fy + dy, 0, { k: 'mist', w, d, s: (dx & 3) + 1 });
  return { pool };
}
// basalt columns wrapping the ends of a ledge fall's lip and stepping down its banks: lip from x0 to x1 at y (px);
// each run placed where its footprint is open ground (moved out along the bank if it's in the water, else left out)
function cheeks(C, x0, x1, y, drop, seed) {
  let n = 0;
  const fits = (x, yy, len, d) => { let ok = 0, all = 0; for (let k = -len / 2 + 8; k <= len / 2 - 8; k += 16) for (const dy of [-6, -d / 2, -d + 10]) { all++; if (C.open(x + k, yy + dy) && !(C.m.reserve[C.at(x + k, yy + dy)] & (1 | 2 | 8))) ok++; } return ok >= all * 0.72; };
  for (const side of [-1, 1]) {
    const e = side < 0 ? x0 : x1;
    const H2 = Math.round(drop + 64), runs = [[0, 6, 208, H2, 72, -side], [30, 86, 168, Math.round(H2 * 0.7), 64, 0], [48, 160, 136, Math.round(H2 * 0.46), 56, 0], [56, 226, 112, Math.round(H2 * 0.28), 52, 0]];
    for (const [ox, dy, len, h, d, wet] of runs) {
      let placed = false;
      for (let push = 0; push <= 160 && !placed; push += 32) {
        const x = e + side * (len / 2 - 26 + ox + push), yy = y + dy;
        if (!fits(x, yy, len, d)) continue;
        cols(C, x, yy, len, h, d, seed + n * 5 + side, wet, 0);
        C.drop((p) => /^(tree_|shrub_|bush_|flowers_|redwood|log$|rwlog|rwstump)/.test(p.t) && Math.abs(p.x - x) < len / 2 + 10 && p.y > yy - d - 30 && p.y < yy + 14);
        fern(C, x - side * (len / 2 - 10), yy + 18); fern(C, x + side * (len / 4), yy + 22, false);
        if (hh(x, yy, seed) < 0.6) mossRock(C, x - side * len * 0.3, yy + 12, 20 + Math.round(hh(yy, x, seed) * 12));
        placed = true; n++;
      }
      if (!placed) break;   // (the bank's taken: no arm further down it)
    }
  }
  return n;
}
// the fern glade's dressing (N2-A) round (x, y), r px: its floor dark duff, puddles in it, fungi along its log (lg:
// [x, y, len], a fallen giant: shared/world3-trails.js glades), ferns and moss boulders round the edge, autumn maples
// among the conifers, low mist, a shaft of sun
function gladeDress(C, x, y, r, seed, lg) {
  const m = C.m, keep = new Set();
  C.drop((p) => /^flowers_/.test(p.t) && Math.hypot(p.x - x, p.y - y) < r * 1.1);   // (no meadow flowers on the forest floor)
  blob(C, x, y, r * 1.2, r * 1.05, 0.2, seed + 1, (i) => { m.reserve[i] &= ~128; });   // (the woods' floor round it, not a meadow's flowers)
  blob(C, x, y, r * 0.95, r * 0.8, 0.22, seed, (i, q) => { if (m.tiles[i] === T.GRASS && q < 0.92 && !(hh(i, 1, seed) < 0.18 && q > 0.7)) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; keep.add(i); } });
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const a = hh(k, seed, 11) * Math.PI * 2, rr = r * (0.3 + hh(seed, k, 12) * 0.35), px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
    if (C.open(px, py) && Math.hypot(px - x, py - y) > 80) { C.prop('rk', px, py, 0, { k: 'puddle', w: 36 + Math.round(hh(k, 2, seed) * 28), d: 20 + Math.round(hh(k, 3, seed) * 10), s: k + 1 }); n++; }
  }
  if (lg) {
    const [lx, ly, len] = lg, half = len / 2;
    const F = [['agaric', -0.62, 14], ['shelf', -0.3, 6], ['glow', -0.8, 22], ['agaric', 0.12, 16], ['shelf', 0.4, 6], ['glow', 0.55, 24], ['agaric', 0.78, 14]];
    F.forEach(([v, u, dy], j) => C.prop('rk', lx + u * half, ly + dy, 0, { k: 'fungi', v, s: (j + seed) % 4 }));
  }
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + hh(k, seed, 13) * 0.4, rr = r * (0.82 + hh(k, seed, 14) * 0.3);
    fern(C, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.82, k % 3 !== 2);
  }
  for (let k = 0; k < 3; k++) { const a = Math.PI * (0.15 + k * 0.6) + hh(k, seed, 15) * 0.5, rr = r * 0.78; if (C.open(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8)) mossRock(C, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8, 28 + Math.round(hh(k, seed, 16) * 14), 'granite'); }
  for (let k = 0; k < 3; k++) {   // (the maples among the conifers: gold in the green)
    const a = Math.PI * (1.1 + k * 0.45) + hh(k, seed, 17) * 0.3, rr = r * (1.08 + hh(k, seed, 18) * 0.2), px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
    if (C.open(px, py)) { C.drop((p) => /^(tree_|redwood)/.test(p.t) && Math.hypot(p.x - px, p.y - py) < 70); C.prop('tree_a', px, py, 12, { sp: 'aspen', k: 1.25 + hh(k, seed, 19) * 0.2 }); }
  }
  C.prop('rk', x - r * 0.2, y + r * 0.35, 0, { k: 'mist', w: Math.round(r * 1.4), d: Math.round(r * 0.5), s: seed % 4 + 1 });
  C.prop('rk', x - r * 0.45, y - r * 0.15, 0, { k: 'ray', w: 72, h: 300, s: seed % 4 + 1 });
  return n;
}
// a boulder creek along pts (px; half-width hw) - its water, boulders in it and on its banks - and a railed plank
// footbridge across it at pts[bi] (bridge tiles under its deck: walked over, swum under)
function creek(C, pts, hw, seed, bi = -1) {
  const tiles = [];
  for (let k = 0; k < pts.length; k++) {
    const [x, y] = pts[k], w = hw * (0.8 + 0.35 * Math.sin(k * 0.9 + seed));
    for (let ty = Math.floor((y - w) / TILE); ty <= Math.floor((y + w) / TILE); ty++) for (let tx = Math.floor((x - w) / TILE); tx <= Math.floor((x + w) / TILE); tx++) {
      if (!C.inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > w) continue;
      const i = C.idx(tx, ty), t = C.m.tiles[i];
      if (t === T.GRASS || t === T.DIRT || t === T.SAND) { C.water(i); tiles.push(i); }
    }
  }
  C.drop((p) => p.t !== 'painted' && pts.some(([x, y]) => Math.abs(p.x - x) < hw + 20 && Math.abs(p.y - y) < hw + 20) && !/^(fingerpost|textsign|mapboard|pbench)/.test(p.t));
  for (let k = 1; k < pts.length - 1; k += 2) {
    if (bi >= 0 && Math.abs(k - bi) < 3) continue;
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k + 1], l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l, ny = (x1 - x0) / l, u = hh(k, seed, 21) - 0.5;
    mossRock(C, pts[k][0] + nx * u * hw * 1.2, pts[k][1] + ny * u * hw * 1.2, 12 + Math.round(hh(k, seed, 22) * 12), 'granite');
    if (k % 4 === 1) { const sd = hh(k, seed, 23) < 0.5 ? -1 : 1, bx = pts[k][0] + nx * sd * (hw + 22), by = pts[k][1] + ny * sd * (hw + 22); if (C.open(bx, by)) mossRock(C, bx, by, 22 + Math.round(hh(k, seed, 24) * 14), 'granite'); fern(C, pts[k][0] - nx * sd * (hw + 30), pts[k][1] - ny * sd * (hw + 30)); }
  }
  let bridge = null;
  if (bi >= 0) {
    const [x, y] = pts[bi], [ax, ay] = pts[Math.max(0, bi - 1)], [bx2, by2] = pts[Math.min(pts.length - 1, bi + 1)], ca = Math.atan2(by2 - ay, bx2 - ax), ux = -Math.sin(ca), uy = Math.cos(ca), len = Math.round((hw * 2 + 90) / 8) * 8;
    for (let s = -len / 2; s <= len / 2; s += 8) for (const t of [-14, 0, 14]) { const i = C.at(x + ux * s + Math.cos(ca) * t, y + uy * s + Math.sin(ca) * t); if (i >= 0 && (C.m.tiles[i] === T.WATER || C.m.tiles[i] === T.DEEP)) { C.m.tiles[i] = T.BRIDGE; C.m.reserve[i] |= RES | 4; } }
    C.prop('fbridge', x, y, 0, { len, a: Math.round(Math.atan2(uy, ux) * 1000) / 1000 });
    bridge = { x: Math.round(x), y: Math.round(y), len };
  }
  return { tiles: tiles.length, bridge };
}
// a trail's edges (px line): sword ferns along both sides, a run of split rail on the outside of the turns, a mossy log
// laid beside it now and then, a shaft of sun - only on open ground off the path, in the district d
function trailEdge(C, line, seed, d) {
  const out = { ferns: 0, rails: 0, logs: 0, rays: 0 };
  const inD = (x, y) => { const i = C.at(x, y); return i >= 0 && C.m.dist[i] === d; };
  const offPath = (x, y) => { for (let k = 0; k < line.length; k += 1) if (Math.abs(line[k][0] - x) < 44 && Math.abs(line[k][1] - y) < 44) return false; return true; };
  for (let k = 2; k < line.length - 2; k++) {
    const [x0, y0] = line[k - 1], [x1, y1] = line[k + 1], l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l, ny = (x1 - x0) / l, [x, y] = line[k];
    if (!inD(x, y)) continue;
    const h = hh(k, seed, 31);
    if (k % 3 === 0) for (const sd of [-1, 1]) { const o = 62 + hh(k, sd + 2, seed) * 30, fx = x + nx * sd * o, fy = y + ny * sd * o; if (hh(k, sd + 5, seed) < 0.55 && offPath(fx, fy) && C.open(fx, fy)) { fern(C, fx, fy, hh(k, sd + 7, seed) < 0.7); out.ferns++; } }
    if (k % 37 === 11) {   // (split rail on the outside of the turn)
      const [xa, ya] = line[k - 2], [xb, yb] = line[k + 2], turn = (x - xa) * (yb - y) - (y - ya) * (xb - x), sd = turn > 0 ? -1 : 1, ox = nx * sd * 46, oy = ny * sd * 46;
      const ax = xa + ox, ay = ya + oy, bx = xb + ox, by = yb + oy;
      if (C.open(ax, ay) && C.open(bx, by) && C.open((ax + bx) / 2, (ay + by) / 2)) { C.prop('fenceline', ax, ay, 0, { kind: 'rail', tx: Math.round(bx - ax), ty: Math.round(by - ay) }); out.rails++; }
    }
    if (k % 53 === 29 && h < 0.8) {   // (a fallen giant beside the trail, along it)
      const sd = h < 0.4 ? -1 : 1, lx = x + nx * sd * 120, ly = y + ny * sd * 120;
      if (C.open(lx - 100, ly) && C.open(lx + 100, ly) && offPath(lx - 100, ly) && offPath(lx + 100, ly) && offPath(lx, ly)) { C.drop((p) => /^(tree_|shrub_|redwood)/.test(p.t) && Math.abs(p.x - lx) < 130 && Math.abs(p.y - ly) < 40); C.prop('rwlog', lx, ly, 0, { len: 192, flip: h < 0.2 }); out.logs++; }
    }
    if (k % 61 === 40 && C.open(x - 40, y)) { C.prop('rk', x - 40, y + 10, 0, { k: 'ray', w: 64, h: 280, s: (k & 3) + 1 }); out.rays++; }
  }
  return out;
}

// ---- the scenes -----------------------------------------------------------------------------------------------
export function redwoodsByHand3(m, H3) {
  const out = { falls: null, glade: null, loop: null, ledges: [], glades: [], trails: [] };
  if (!H3 || !H3.addProp || !Array.isArray(m.natureSites)) return out;
  const C = context(m, H3), site = (k, n) => m.natureSites.find((s) => s.kind === k && (!n || s.name === n));
  const creekS = site('creek', 'Redwood Creek');
  const woods = creekS ? m.dist[C.at(creekS.falls.x, creekS.falls.y)] : -1;
  if (creekS) out.falls = fallsScene(C, creekS, site('cavemouth', 'Redwood Caverns'));
  const hp = site('glade', 'Hidden Pool');
  if (hp) out.glade = hiddenPool(C, hp);
  const gl = site('trail', 'Giants Loop');
  if (gl) out.loop = giantsLoop(C, gl);
  C.flush();
  // the kit, spread: the ledge falls' cheeks, the glades, the trails' edges
  for (const name of REDWOODS3.ledges) for (const s of m.natureSites) {
    if (s.kind !== 'ledgefall' || s.name !== name || !s.falls) continue;
    const f = s.falls, n = cheeks(C, f.x - f.w / 2, f.x + f.w / 2, f.y + 8, f.drop, 300 + (f.x % 97));
    C.prop('rk', f.x, f.y + 60, 0, { k: 'mist', w: Math.min(400, Math.round(f.w * 0.6)), d: 90, s: (f.x & 3) + 1 });
    out.ledges.push([name, n]);
  }
  for (const name of REDWOODS3.glades) {
    const g = site('glade', name);
    if (!g) continue;
    const lg = m.props.find((p) => p && p.t === 'rwlog' && Math.hypot(p.x - g.x, p.y - g.y) < g.r + 20);
    out.glades.push([name, gladeDress(C, g.x, g.y, g.r, 500 + (g.x % 89), lg ? [lg.x, lg.y, lg.len || 216] : null)]);
  }
  for (const name of REDWOODS3.trails) {
    const t = m.natureSites.find((s) => s.kind === 'trail' && s.name === name && Array.isArray(s.line));
    if (!t) continue;
    const r = trailEdge(C, t.line, 700 + name.length * 13, woods);
    out.trails.push([name, r.ferns, r.rails, r.logs, r.rays]);
  }
  C.flush();
  return out;
}

// Redwood Creek Falls (NR1-E). F: the fall's foot (the creek site's falls); the cave's way in in the columns west of it
function fallsScene(C, s, cave) {
  const m = C.m, F = [Math.round(s.falls.x), Math.round(s.falls.y)], [fx, fy] = F;
  const MX = cave ? cave.x : fx - 209, MY = cave ? cave.y - 8 : fy + 26;
  const nearCave = (p) => /^(lantern|textsign|rail|stairs|cavemouth)$/.test(p.t) && Math.hypot(p.x - MX, p.y - (MY + 100)) < 150;
  // what stood in the bowl and the old camp goes (the cave's way in, the trapper's, the beavers' and the pull-off stay)
  const KEEP = /^(cavemouth|stairs|textsign|rail|fenceline|beaverdam|lodge|gnaw|cottage|woodpile|hiderack|chair|blaze|painted)$/;
  const camp0 = s.camp ? [s.camp.x, s.camp.y] : [fx + 306, fy + 126];
  C.drop((p) => {
    if (KEEP.test(p.t) || nearCave(p)) return false;
    if (/^(picnic|trashcan|mapboard)$/.test(p.t) && p.x < fx - 300) return false;   // (the pull-off's)
    const inBowl = p.x > fx - 470 && p.x < fx + 470 && p.y > fy - 80 && p.y < fy + 280, inCamp = Math.hypot(p.x - camp0[0], p.y - camp0[1]) < 200;
    return inBowl || inCamp;
  });
  // the old camp's dirt back to woods floor (the east wall stands there now)
  blob(C, camp0[0], camp0[1], 170, 170, 0, 3, (i) => { if (m.tiles[i] === T.DIRT && !(m.reserve[i] & 4)) m.tiles[i] = T.GRASS; });
  // the falls, its walls, the pool (its west edge clear of the cave's path along the bank)
  const bowl = columnBowl(C, F, {
    w: 128, drop: 140, side: 80, seed: 7,
    back: [[-158, -14, 64, 150, 48, 1, 0], [-340, -20, 160, 144, 60, 0, 1], [222, -6, 180, 152, 64, -1, 0]],
    arms: [[-370, 40, 140, 120, 60, 0, 1], [-380, 108, 112, 84, 52, 0, 1], [290, 64, 150, 120, 64, 0, 0], [310, 134, 130, 86, 60, 0, 0], [300, 200, 110, 52, 52, 0, 0]],
    pool: [30, 120, 172, 112], north: 12, wob: 0.07,
    keep: (x, y) => x < fx - 150 || (x > fx + 212 && y < fy + 70) || (x > fx + 242 && y < fy + 210),
    rocks: [[-82, 40, 26], [96, 48, 22], [-128, 150, 26], [-110, 200, 34], [-68, 218, 28], [-30, 232, 18], [178, 160, 30], [150, 222, 24], [196, 96, 20], [60, 236, 16]],
    mist: [[0, 44, 240, 72]],
  });
  // the outflow: the creek's channel below the pool (shared/naturesites.js redwoodCreek), boulders tumbled in it, a
  // cobble bar on its east bank down to the footbridge
  const fb = s.footbridge;
  const outPts = fb ? spline([[fx + 20, fy + 222], [fx + 64, fy + 262], [(fx + 20 + fb.x) / 2 - 10, (fy + 236 + fb.y) / 2 + 6], [fb.x + 26, fb.y - 52], [fb.x, fb.y - 24]], 5) : [];
  for (let k = 0; k < outPts.length; k++) {
    const [x, y] = outPts[k], hw = 46 + 12 * Math.sin(k * 0.8);
    blob(C, x, y, hw, hw * 0.75, 0.12, 40 + k, (i) => { if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) C.water(i); });
    // (the stones in the run: the white water breaks round them - the channel's rapid below)
    mossRock(C, x + (hh(k, 1, 77) - 0.5) * hw * 1.2, y + 4, 16 + Math.round(hh(k, 2, 77) * 14));
    if (k % 2 === 1) mossRock(C, x + (hh(k, 5, 77) - 0.5) * hw, y - 10, 12 + Math.round(hh(k, 6, 77) * 8));
    if (k % 3 === 1) mossRock(C, x + 76 + (hh(k, 3, 77) - 0.5) * 30, y + 12, 10 + Math.round(hh(k, 4, 77) * 8), 'granite');
  }
  if (outPts.length > 4) { const [x, y] = outPts[Math.floor(outPts.length / 2)]; blob(C, x + 70, y + 8, 56, 34, 0.06, 61, (i) => { if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) { m.tiles[i] = T.SAND; m.reserve[i] |= RES | 128; } }); }   // (one smooth cobble bar on the inside of the bend)
  C.drop((p) => /^(shrub_|bush_|tree_|flowers_)/.test(p.t) && outPts.some(([x, y]) => Math.hypot(p.x - x, p.y - y) < 90));
  for (const [dx, dy] of [[-40, 30], [50, 34], [0, 52]]) C.prop('rk', fx + dx, fy + dy, 0, { k: 'foam', w: 96, d: 48, s: 2 });   // (where the curtain lands)
  // the pool's front lip and sides and the run's banks held by big mossy boulders over the tiles' stepped edge (not on
  // the cave's path along the west bank)
  const rim = rimRocks(C, fx - 200, fy + 40, fx + 260, (fb ? fb.y : fy + 340) - 40, fy + 40, 81, (x, y) => !(x < fx - 140 && y < fy + 230));
  for (const [dx, dy, sz] of [[-30, -210, 22], [26, -236, 18], [-8, -262, 26], [40, -196, 16]]) if (C.wet(fx + dx, fy + dy) || C.open(fx + dx, fy + dy)) mossRock(C, fx + dx, fy + dy, sz);   // (the creek above the lip)
  // the viewing deck on the pool's west side where the cave's path runs along the bank, railed, looking at the falls
  const deck = [fx - 250, fy + 112];
  C.prop('viewdeck', deck[0], deck[1], 0, { len: 96, w: 96, a: 0 });
  C.prop('pbench', deck[0] - 20, deck[1] + 8, 0, { a: 0, lift: 8 });
  C.prop('textsign', deck[0] - 70, deck[1] + 64, 0, { text: 'REDWOOD CREEK FALLS', bg: '#4a3a24', fg: [240, 228, 196], z: 30 });
  // the picnic pull-off (shared/naturesites.js) packed dirt, not gravel, a dirt path from it down to the deck
  for (let ty = Math.floor((fy + 120) / TILE); ty <= Math.floor((fy + 340) / TILE); ty++) for (let tx = Math.floor((fx - 500) / TILE); tx <= Math.floor((fx - 200) / TILE); tx++) { const i = C.idx(tx, ty); if (m.tiles[i] === T.LOT) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; } }
  const down = spline([[fx - 400, fy + 250], [fx - 330, fy + 205], [deck[0] - 30, deck[1] + 58]], 5);
  C.path(down, 26);
  // the switchback down from the trapper's cabin with timber steps at the bends, to the deck; a rail on the drop side
  const tr = spline([[fx - 330, fy - 300], [fx - 470, fy - 210], [fx - 400, fy - 120], [fx - 520, fy - 30], [fx - 470, fy + 70], [fx - 330, fy + 150], [deck[0] - 40, deck[1] + 30]], 7);
  C.path(tr, 24);
  for (const k of [7, 14, 21, 28, 35]) {
    if (k + 1 >= tr.length) continue;
    const [x, y] = tr[k], [x2, y2] = tr[k + 1];
    C.prop('logsteps', x, y, 0, { w: 56, a: Math.round(Math.atan2(y2 - y, x2 - x) * 100) / 100 });
  }
  for (const [a, b] of [[2, 6], [16, 20], [30, 34]]) { if (b >= tr.length) continue; const [ax, ay] = tr[a], [bx, by] = tr[b]; C.prop('fenceline', ax + 34, ay + 8, 0, { kind: 'rail', tx: Math.round(bx - ax), ty: Math.round(by - ay) }); }
  // the camp, moved east of the bowl: its fire, seats, tents, table and board; the path to it from the footbridge
  const camp = [fx + 580, fy + 150];
  blob(C, camp[0], camp[1], 150, 120, 0.2, 9, (i) => { if (m.tiles[i] === T.GRASS) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; } });
  C.drop((p) => p.t !== 'painted' && Math.hypot(p.x - camp[0], p.y - camp[1]) < 170);
  C.prop('campfire', camp[0], camp[1] + 10, 0, { lit: 1 });
  C.prop('log', camp[0] - 4, camp[1] - 40, 0, { a: 0, len: 80, seat: 1 });
  C.prop('log', camp[0] + 54, camp[1] + 22, 0, { a: 1.57, len: 80, seat: 1 });
  C.prop('tent', camp[0] - 90, camp[1] - 64, 0, { v: 1 });
  C.prop('tent', camp[0] + 70, camp[1] - 80, 0, { v: 0 });
  C.prop('picnic', camp[0] - 96, camp[1] + 54, 0);
  C.prop('mapboard', camp[0] + 110, camp[1] + 70, 0);
  C.prop('lantern', camp[0] - 40, camp[1] + 80, 0);
  if (fb) C.path(spline([[fb.x + Math.cos(fb.a) * fb.len * 0.5 + 30, fb.y + Math.sin(fb.a) * fb.len * 0.5], [fx + 400, fy + 300], [camp[0] - 120, camp[1] + 60]], 6), 22);
  s.camp = { x: camp[0], y: camp[1] };
  // redwood giants framing it (none in front of the falls: shared/world3-falls.js), ferns round the walls' feet and
  // the pool, shafts of sun through the canopy from the west
  for (const [dx, dy, sp] of [[-700, 60, 'giantL'], [-560, -260, 'giant'], [520, -250, 'giant'], [760, 20, 'giantS'], [-700, 300, 'giant'], [480, 340, 'giantS']]) {
    const x = fx + dx, y = fy + dy;
    if (!C.open(x, y) || C.tile(x, y) === T.LOT || onTrail3(C, x, y)) continue;   // (not on the Highland Way passing by)
    C.drop((p) => /^(tree_|redwood)/.test(p.t) && Math.hypot(p.x - x, p.y - y) < 120);
    C.prop('redwood', x, y, REDWOODS3.trunk[sp], { sp, k: 1 });
  }
  for (const [dx, dy] of [[-445, 64], [-300, 60], [-450, 130], [218, 86], [372, 92], [384, 160], [362, 224], [240, 228], [-150, 30], [-520, 200], [-560, 100], [-380, -100], [-280, -60], [330, -40], [420, 30]]) fern(C, fx + dx, fy + dy, (dx + dy) % 3 !== 0);
  C.prop('rk', fx - 420, fy + 30, 0, { k: 'ray', w: 84, h: 320, s: 1 });
  C.prop('rk', fx - 300, fy - 70, 0, { k: 'ray', w: 60, h: 280, s: 2 });
  // the falls bigger on the map's lists: the mist, the roar and the fish below it read them (falls.w, falls.drop)
  s.falls = { x: fx, y: fy - 10, w: 128, drop: 140 };
  s.bowl = 1; s.gorge = [];
  { const cp = [[fx / TILE, fy / TILE + 1], [(fx + 30) / TILE, (fy + 120) / TILE], ...outPts.map(([x, y]) => [x / TILE, y / TILE])]; let L0 = 0; for (let j = 1; j < 2; j++) L0 += Math.hypot(cp[j][0] - cp[j - 1][0], cp[j][1] - cp[j - 1][1]); let L = L0; for (let j = 2; j < cp.length; j++) L += Math.hypot(cp[j][0] - cp[j - 1][0], cp[j][1] - cp[j - 1][1]);
    channel(C, cp, 9, [(fx + 30) / TILE, (fy + 105) / TILE, 5], [Math.round((L0 + 3.5) * 10) / 10, Math.round(L * 10) / 10, 0.85]); }   // (the run below the pool white water among its stones)
  return { pool: bowl.pool, deck, camp, trail: tr.length, rim };
}

// Hidden Pool (N2-A): the glade beside Redwood Creek, its pool and little falls
function hiddenPool(C, g) {
  const m = C.m, p = g.pool;
  if (!p) return null;
  // the little falls off a mossy ledge of columns at the pool's north end, the old one's rock gone
  C.drop((q) => (q.t === 'fallsmall' || q.t === 'boulder') && Math.hypot(q.x - p.x, q.y - (p.y - 60)) < 130);
  const F = [p.x + 4, p.y - 34];
  const r = columnBowl(C, F, {
    w: 48, drop: 52, side: 40, seed: 19, log: 0,
    arms: [[-96, 22, 64, 44, 44, 0, 1], [100, 26, 64, 40, 44, 0, 0]],
    pool: [6, 58, 118, 74], north: 4,
    rocks: [[-70, 20, 26], [78, 24, 22], [118, 70, 30], [-112, 86, 24], [96, 116, 18]],
    mist: [[0, 40, 200, 70]],
  });
  // nothing tall standing in front of it in this view (a giant's sprite runs some 20 tiles up the screen)
  C.drop((q) => (/^redwood/.test(q.t) || (q.t === 'tree_a' && q.sp !== 'aspen')) && Math.abs(q.x - p.x) < (/^redwood/.test(q.t) ? 300 : 170) && q.y > p.y - 40 && q.y < p.y + (/^redwood/.test(q.t) ? 640 : 220));
  // stepping stones across its south end (bridge tiles under them: walked over, swum under)
  for (let k = 0; k < 7; k++) {
    const x = p.x - 92 + k * 31, y = p.y + 46 + Math.sin(k * 1.3) * 6, i = C.at(x, y);
    if (i < 0) continue;
    if (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) { m.tiles[i] = T.BRIDGE; m.reserve[i] |= RES | 4; }
    C.prop('rk', x, y + 6, 0, { k: 'stone', r: 11 + (k % 3), s: k % 4 });
  }
  const lg = m.props.find((q) => q && q.t === 'rwlog' && Math.hypot(q.x - g.x, q.y - g.y) < g.r + 40 && Math.hypot(q.x - p.x, q.y - p.y) > 150);
  const n = gladeDress(C, g.x, g.y, g.r, 29, lg ? [lg.x, lg.y, lg.len || 216] : null);
  C.prop('rk', g.x + 40, g.y - 120, 0, { k: 'ray', w: 70, h: 300, s: 3 });
  // (two more patches of mushrooms by the log: the forager's round - server/systems/wildfolk.js foragers)
  if (lg) for (const [dx, k] of [[-60, 'goldTrumpet'], [70, 'redcap']]) (m.forage ||= []).push({ x: Math.round(lg.x + dx), y: Math.round(lg.y + 30), k, glade: 1 });
  channel(C, [[F[0] / TILE, F[1] / TILE + 1], [(p.x + 6) / TILE, (p.y + 58) / TILE], [(p.x + 6) / TILE, (p.y + 120) / TILE]], 6, [(p.x + 6) / TILE, (p.y + 50) / TILE, 3]);
  return { pool: r.pool, puddles: n };
}

// the Giants Loop (N1-A): the loop's line from its trailhead (shared/naturesites.js giantsLoop's control points)
function giantsLoop(C, t) {
  const L = [t.x, t.y], P = (dx, dy) => [L[0] + dx * TILE, L[1] + dy * TILE];
  const line = spline([P(3, -1), P(7, -8), P(11, -16), P(18, -21), P(26, -20), P(31, -13), P(29, -5), P(22, -1), P(13, 1), P(5, 0), P(3, -1)], 8);
  // the creek: out of a spring among boulders north-east of the loop, under the trail on its east side, into a pond
  // inside the loop
  const cp = spline([P(39, -21), P(35, -16), P(30.5, -10.5), P(26, -8), P(22.5, -8.5)], 6);
  const bi = cp.reduce((b, q, k) => { let d = 1e9; for (const s of line) d = Math.min(d, Math.hypot(s[0] - q[0], s[1] - q[1])); return d < b.d ? { k, d } : b; }, { k: -1, d: 1e9 }).k;
  const cr = creek(C, cp, 38, 41, bi), nearLine = (x, y, r) => line.some((q) => Math.hypot(q[0] - x, q[1] - y) < r);
  const pond = P(20.5, -8.5);
  blob(C, pond[0], pond[1], 92, 64, 0.2, 43, (i) => { const tt = C.m.tiles[i]; if (tt === T.GRASS || tt === T.DIRT) C.water(i); });
  for (const [dx, dy, s] of [[-80, -20, 26], [70, 40, 22], [-40, 56, 18]]) mossRock(C, pond[0] + dx, pond[1] + dy, s, 'granite');
  channel(C, cp.map(([x, y]) => [x / TILE, y / TILE]).concat([[pond[0] / TILE, pond[1] / TILE]]), 3, null);
  // the old growth: most of the small conifers in the loop's woods out (the giants', the ferns' and the sorrel's floor)
  C.drop((p) => p.t === 'tree_a' && p.x > L[0] - 2 * TILE && p.x < L[0] + 36 * TILE && p.y > L[1] - 26 * TILE && p.y < L[1] + 1 * TILE && hh(p.x, p.y, 57) < 0.65);
  for (let k = 0; k < 26; k++) { const x = L[0] + (2 + hh(k, 1, 58) * 34) * TILE, y = L[1] - (1 + hh(k, 2, 58) * 24) * TILE; if (C.open(x, y) && !nearLine(x, y, 44) && !cp.some((q) => Math.hypot(q[0] - x, q[1] - y) < 60)) fern(C, x, y, k % 4 !== 0); }
  const sp = cp[0]; for (const [dx, dy, s] of [[-40, -30, 34], [36, -26, 28], [10, -50, 40]]) mossRock(C, sp[0] + dx, sp[1] + dy, s, 'granite');
  // the giants along it: trunks two to four tiles off the path, either side (and off the woods' other trails: the Highland Way passes)
  const onTrail = (x, y) => onTrail3(C, x, y);
  let giants = 0;
  for (let k = 3; k < line.length - 3; k += 5) {
    const [x0, y0] = line[k - 1], [x1, y1] = line[k + 1], l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l, ny = (x1 - x0) / l;
    const sd = hh(k, 2, 51) < 0.5 ? -1 : 1, o = 96 + hh(k, 3, 51) * 36, x = line[k][0] + nx * sd * o, y = line[k][1] + ny * sd * o;
    const sp2 = hh(k, 4, 51) < 0.3 ? 'giantL' : hh(k, 4, 51) < 0.75 ? 'giant' : 'giantS';
    if (cr.bridge && Math.abs(x - cr.bridge.x) < 230 && y > cr.bridge.y - 20 && y < cr.bridge.y + 640) continue;
    if (Math.abs(x - pond[0]) < 260 && y > pond[1] && y < pond[1] + 560) continue;
    if (!C.open(x, y) || nearLine(x, y, 96) || onTrail(x, y) || C.wet(x, y + 40) || cp.some((q) => Math.hypot(q[0] - x, q[1] - y) < 110) || Math.hypot(x - pond[0], y - pond[1]) < 150) continue;
    C.drop((p) => /^(tree_|redwood)/.test(p.t) && Math.hypot(p.x - x, p.y - y) < 140);
    C.prop('redwood', x, y, REDWOODS3.trunk[sp2], { sp: sp2, k: 1 }); giants++;
  }
  // split rail along the outside of the bends, mossy fallen giants beside the path, ferns, light
  const e = trailEdge(C, line, 61, C.m.dist[C.at(line[8][0], line[8][1])]);
  for (const [a, b, sd] of [[9, 14, 1], [36, 41, -1], [58, 63, 1]]) {
    if (b >= line.length) continue;
    const [ax, ay] = line[a], [bx, by] = line[b], l = Math.hypot(bx - ax, by - ay) || 1, ox = -(by - ay) / l * sd * 48, oy = (bx - ax) / l * sd * 48;
    if (C.open(ax + ox, ay + oy) && C.open(bx + ox, by + oy)) C.prop('fenceline', ax + ox, ay + oy, 0, { kind: 'rail', tx: Math.round(bx - ax), ty: Math.round(by - ay) });
  }
  for (const [k, dx, dy, fl] of [[20, -150, 30, false], [48, 130, 60, true]]) {
    if (k >= line.length) continue;
    const x = line[k][0] + dx, y = line[k][1] + dy;
    if (C.open(x - 90, y) && C.open(x + 90, y) && !nearLine(x, y, 70)) { C.drop((p) => /^(tree_|shrub_)/.test(p.t) && Math.abs(p.x - x) < 120 && Math.abs(p.y - y) < 40); C.prop('rwlog', x, y, 0, { len: 216, flip: fl }); }
  }
  for (const k of [12, 33, 55]) if (k < line.length) C.prop('rk', line[k][0] - 30, line[k][1] + 8, 0, { k: 'ray', w: 76, h: 320, s: (k & 3) + 1 });
  return { line: line.length, giants, creek: cr.tiles, bridge: cr.bridge, ferns: e.ferns };
}
