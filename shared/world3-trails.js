// Highland Woods' trails and glades (the nature program, 2026-10-20: Nature-D2's trail furniture, Nature-C2's secluded
// glades; docs/handcraft-research-nature-water: "a trail network, not single tracks"). World v3's woods get walking
// trails between their places - the Highland Way end to end from Pine Ridge Campground by Pine Lake and Redwood Creek's
// falls to Silver Thread Falls, the Mast Ridge Trail up to the fire lookout and the radio mast, the Gorge Trail from
// Fern Gorge over Silver Thread Creek's gorge on a rope bridge to the falls' viewing platform, the Giants Link from the
// Giants Loop - each laid over the land where it walks easiest (A* over the tiles: the slope, the water, the roads and
// what stands there priced), two tiles of packed dirt, the trees taken off it.
//
// The furniture (D2): a trailhead board, a sign, a drinking fountain and a bin where a trail starts; fingerposts at the
// junctions; a painted blaze on a post every 40 tiles in the trail's colour; log steps where it climbs and a handrail
// where the ground falls away beside it; a log bridge over a creek, a timber footbridge over wider water, the rope
// bridge where the water runs deep below; benches where the water is in view; the fire lookout on the high ground with
// its coin telescope.
//
// The glades (C2): four hidden clearings off the trails, each down its own short path - a stone fire ring (a campfire
// rest spot) with log seats and stumps, a long mossy log with the three mushrooms on it (red, gold and the blue that
// glows), berry bushes, boulders, white flowers in the grass; the one by Redwood Creek with its pool and a little fall.
// Deer come to them (server/systems/wildlife.js: the 'glade' habitat).
//
// For the whole-world build only (shared/world3-world.js calls buildTrails3 from its done hook, after the water bodies;
// the page and the city worker never import this module). Deterministic: integer costs and hashes, Math's trig only
// inside generateCity (withDeterministicMath).
import { TILE, T } from './constants.js';

const RES = 32;   // (the designed places' reserve bit: naturesites.js)
// (a trail's `blaze`: its colour's number in the art's palette - statics.js BLAZES: blue, red, yellow, white)
// Anchors: 'camp:<country site>' (its lot's east side), 'site:<nature site>' (its spot; Pine Lake: its lakeside camp),
// 'mast:<landmark>', 'falls' (the west end of Silver Thread Falls' lip), 'platform' (the falls' viewing platform),
// 'trail:<name>' (the nearest point of a trail already laid to the leg's next point), 'rope:<x>' (the gorge's crossing
// at that column: a rope bridge from rim to rim) or [x, y] (tiles). The legs between them are routed.
export const WOODS3 = {
  district: 47,
  trails: [
    { name: 'Highland Way', blaze: 0, pts: ['camp:Pine Ridge Campground', [1185, 1605], 'site:Pine Lake', [1330, 1418], [1420, 1335], 'site:Redwood Creek', [1590, 1215], [1640, 1120], 'falls'] },
    { name: 'Mast Ridge Trail', blaze: 1, pts: ['trail:Highland Way', [1395, 1235], 'mast:Highland Radio Mast', [1255, 1092], 'lookout'], from: [1425, 1330] },
    { name: 'Gorge Trail', blaze: 2, pts: ['site:Fern Gorge', [1985, 1300], 'rope:1995', [1915, 1130], [1820, 1062], 'platform'] },
    { name: 'Giants Link', blaze: 3, pts: ['site:Giants Loop', 'trail:Highland Way'], to: [1565, 1330] },
  ],
  // the glades: near [x, y] (tiles), off the trail named; `creek`: by the nearest creek, with its pool and fall
  glades: [
    { name: 'Fern Hollow', trail: 'Highland Way', near: [1225, 1565] },
    { name: 'Elk Glade', trail: 'Highland Way', near: [1450, 1300] },
    { name: 'Toadstool Glade', trail: 'Highland Way', near: [1645, 1185] },
    { name: 'Hidden Pool', trail: 'Highland Way', near: [1520, 1340], creek: true },
  ],
  lookout: { name: 'Highland Fire Lookout', trail: 'Mast Ridge Trail', near: [1165, 1066], r: 30, road: 14 },   // (the ridge where the woods climb toward Granite Peaks)
};
export const TRAIL = { r: 30, blazeEvery: 40, steep: 0.9, drop: 1.5, clear: 46, pad: 70 };
const VEG = /^(tree_|redwood|shrub_|bush_|flowers_|rwstump|rwlog|log$|fern|gnaw)/;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function buildTrails3(m, H3) {
  const out = { trails: [], glades: [], lookout: null, missed: [], cleared: 0 };
  if (!H3 || !H3.addProp || !m.relief) return out;
  const W = m.w, HH = m.h, D = WOODS3.district;
  const inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH;
  const idx = (x, y) => y * W + x;
  const wetT = (t) => t === T.WATER || t === T.DEEP;
  const props = [], drop = new Set(), solids = [];
  const P = (t, x, y, r = 0, extra = null) => props.push([t, Math.round(x), Math.round(y), r, extra]);
  // what stands where a trail can't go: anything not the woods' own growth (by tile; a big one by its reach)
  const blocked = new Set();
  for (const p of m.props) {
    if (!p || VEG.test(p.t) || p.t === 'painted') continue;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (!inF(tx, ty) || m.dist[idx(tx, ty)] !== D) continue;
    blocked.add(idx(tx, ty));
  }
  for (const [k, arr] of m.solidProps || []) for (const e of arr) if (e.r >= 16 && !(e.pi >= 0 && m.props[e.pi] && VEG.test(m.props[e.pi].t))) blocked.add(k);
  const cost = (i) => {
    if (blocked.has(i)) return 0;
    const t = m.tiles[i], r = m.reserve[i];
    if (r & (1 | 2 | 8)) return 0;
    switch (t) {
      case T.GRASS: return r & RES ? 20 : 10;
      case T.DIRT: return 8;
      case T.SAND: return r & RES ? 20 : 13;
      case T.FIELD: return 40;
      case T.WATER: case T.DEEP: return m.lake && m.lake[i] ? 0 : 400;   // (a crossing only where it must: one bank kept)
      case T.ROAD: return 70;
      case T.BRIDGE: return 40;
      case T.DOCK: return 12;
      case T.SIDEWALK: case T.PLAZA: case T.LOT: return 30;
    }
    return 0;
  };
  // A* over the tiles in a box round the two ends: the step, the slope (squared: it keeps to the contours), the ground
  const route = (a, b, free) => {
    const PAD = TRAIL.pad;
    const bx0 = Math.max(1, Math.min(a[0], b[0]) - PAD), by0 = Math.max(1, Math.min(a[1], b[1]) - PAD);
    const bx1 = Math.min(W - 2, Math.max(a[0], b[0]) + PAD), by1 = Math.min(HH - 2, Math.max(a[1], b[1]) + PAD);
    const BW = bx1 - bx0 + 1, BH = by1 - by0 + 1, N = BW * BH;
    const z = new Float32Array(N), c = new Int16Array(N);
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const tx = bx0 + x + dx, ty = by0 + y + dy; if (inF(tx, ty)) { s += m.relief[idx(tx, ty)]; n++; } }
      z[y * BW + x] = s / n;
      const i = idx(bx0 + x, by0 + y);
      c[y * BW + x] = free(bx0 + x, by0 + y) && !wetT(m.tiles[i]) && cost(i) === 0 && !(m.reserve[i] & (1 | 2 | 8)) && m.tiles[i] !== T.BUILDING && m.tiles[i] !== T.WALL ? 20 : cost(i);
    }
    const g = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const hf = [], hk = [];
    const push = (f, k) => { hf.push(f); hk.push(k); let i = hf.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] < hf[i] || (hf[p] === hf[i] && hk[p] <= hk[i])) break; [hf[p], hf[i]] = [hf[i], hf[p]]; [hk[p], hk[i]] = [hk[i], hk[p]]; i = p; } };
    const pop = () => {
      const k = hk[0], lf = hf.pop(), lk = hk.pop();
      if (hf.length) {
        hf[0] = lf; hk[0] = lk; let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < hf.length && (hf[l] < hf[s] || (hf[l] === hf[s] && hk[l] < hk[s]))) s = l; if (r < hf.length && (hf[r] < hf[s] || (hf[r] === hf[s] && hk[r] < hk[s]))) s = r; if (s === i) break; [hf[s], hf[i]] = [hf[i], hf[s]]; [hk[s], hk[i]] = [hk[i], hk[s]]; i = s; }
      }
      return k;
    };
    const ax = a[0] - bx0, ay = a[1] - by0, gx = b[0] - bx0, gy = b[1] - by0, start = ay * BW + ax, goal = gy * BW + gx;
    const hx = (k) => { const x = k % BW, y = (k / BW) | 0, dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) * 10 + Math.min(dx, dy) * 4; };
    g[start] = 0; push(hx(start), start);
    while (hf.length) {
      const k = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === goal) break;
      const x = k % BW, y = (k / BW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= BW || ny >= BH) continue;
        const j = ny * BW + nx;
        if (closed[j] || !c[j]) continue;
        if (dx && dy && (!c[y * BW + nx] || !c[ny * BW + x])) continue;
        const d = dx && dy ? 1.4142 : 1, dz = Math.abs(z[j] - z[k]) / d;
        const ng = g[k] + d * (c[j] + 60 * dz * dz + 6 * dz);
        if (ng < g[j]) { g[j] = ng; came[j] = k; push(ng + hx(j), j); }
      }
    }
    if (goal !== start && came[goal] < 0) return null;
    const path = [];
    for (let k = goal; k >= 0; k = came[k]) { path.push([bx0 + (k % BW), by0 + ((k / BW) | 0)]); if (k === start) break; }
    return path.reverse();
  };
  // the nearest tile a trail may stand on to (x, y), within r
  const snap = (x, y, r = 10) => {
    x = Math.round(x); y = Math.round(y);
    for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const tx = x + dx, ty = y + dy;
      if (!inF(tx, ty)) continue;
      const i = idx(tx, ty), t = m.tiles[i];
      if ((t === T.GRASS || t === T.DIRT || t === T.SAND || t === T.LOT) && !blocked.has(i) && !(m.reserve[i] & (1 | 2 | 8))) return [tx, ty];
    }
    return null;
  };
  const laid = new Map();   // name -> its tile path
  const nearestOn = (name, x, y) => { const p = laid.get(name); if (!p) return null; let best = null, bd = 1e18; for (const q of p) { const d = (q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y); if (d < bd) { bd = d; best = q; } } return best; };
  const west = m.world3?.west?.built?.falls;
  const anchor = (a, next) => {
    if (Array.isArray(a)) return snap(a[0], a[1], 12);
    const [k, n] = a.split(':');
    if (k === 'camp') { const c = (m.countrySites || []).find((q) => q.name === n); return c ? snap(c.x + c.w + 2, c.y + (c.h >> 1), 8) : null; }
    if (k === 'site') {
      const s = (m.natureSites || []).find((q) => q.name === n);
      if (!s) return null;
      const at = s.camp || s;
      return snap(at.x / TILE + (s.camp ? 3 : 0), at.y / TILE + (s.camp ? 4 : 0), 14);
    }
    if (k === 'mast') { const l = (m.landmarks || []).find((q) => q.name === n); return l ? snap((l.x + l.w / 2) / TILE, (l.y + l.h) / TILE + 3, 12) : null; }
    if (k === 'falls') return west && west.lip ? snap(west.lip.x0 - 4, west.lip.y - 6, 12) : null;
    if (k === 'platform') return west && west.platformAt ? snap(west.platformAt[0], west.platformAt[1] + 4, 8) : null;
    if (k === 'trail') return next ? nearestOn(n, next[0], next[1]) : null;
    if (k === 'lookout') return out.lookout ? snap(out.lookout.x / TILE, out.lookout.y / TILE + 4, 8) : null;
    if (k === 'rope') return next ? gorgeRims(+n, next) : null;
    return null;
  };
  // the gorge at column x: its water nearest the trail's last point (a river's), and the rims either side - where the
  // ground has climbed back up to its height - as the rope bridge's two ends, the near one first
  const gorgeRims = (x, from) => {
    let wy0 = -1, wy1 = -1, bd = 1e9;
    for (let y = from[1] - 120; y <= from[1] + 120; y++) {
      if (!inF(x, y) || !wetT(m.tiles[idx(x, y)]) || !m.river[idx(x, y)]) continue;
      let a = y, b = y; while (inF(x, b + 1) && wetT(m.tiles[idx(x, b + 1)])) b++;
      const d = Math.abs((a + b) / 2 - from[1]);
      if (d < bd) { bd = d; wy0 = a; wy1 = b; }
      y = b;
    }
    if (wy0 < 0) return null;
    const rim = (y0, dir) => {
      let top = 0; for (let k = 1; k <= 24; k++) top = Math.max(top, relAt((x + 0.5) * TILE, (y0 + dir * k + 0.5) * TILE));
      for (let k = 1; k <= 24; k++) { const y = y0 + dir * k; if (relAt((x + 0.5) * TILE, (y + 0.5) * TILE) >= top - 2 && !wetT(m.tiles[idx(x, y)])) return y; }
      return y0 + dir * 24;
    };
    const north = [x, rim(wy0, -1)], south = [x, rim(wy1, 1)];
    return { pair: from[1] > wy1 ? [south, north] : [north, south] };
  };
  const ropes = [];
  const inRope = (x, y) => ropes.some((r) => Math.abs(x - (r.x + 0.5) * TILE) < 56 && y > Math.min(r.y0, r.y1) * TILE - 8 && y < (Math.max(r.y0, r.y1) + 1) * TILE + 8);
  const lookout = () => {
    // the high ground near the line so far: the highest open tile within r of the spot, away from the trees' thickest
    const L = WOODS3.lookout;
    let best = null;
    for (let ty = L.near[1] - L.r; ty <= L.near[1] + L.r; ty += 2) for (let tx = L.near[0] - L.r; tx <= L.near[0] + L.r; tx += 2) {
      if (!inF(tx, ty)) continue;
      let ok = true;
      for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -4; dx <= 4 && ok; dx++) { const i = idx(tx + dx, ty + dy); if (m.tiles[i] !== T.GRASS || m.reserve[i] || m.dist[i] !== D || blocked.has(i)) ok = false; }
      if (!ok) continue;
      let road = false;
      for (let dy = -L.road; dy <= L.road && !road; dy += 2) for (let dx = -L.road; dx <= L.road; dx += 2) { if (!inF(tx + dx, ty + dy)) continue; const t = m.tiles[idx(tx + dx, ty + dy)]; if (t === T.ROAD || t === T.BRIDGE) { road = true; break; } }
      if (road) continue;
      const h = m.relief[idx(tx, ty)] + hh(tx, ty, 931) * 0.5;
      if (!best || h > best.h) best = { tx, ty, h };
    }
    if (!best) return null;
    const x = (best.tx + 0.5) * TILE, y = (best.ty + 0.5) * TILE;
    clearRound(x, y, 4.5 * TILE, T.DIRT);
    P('lookout', x, y - 20, 34, { h: 240 }); P('scope', x + 76, y + 64, 6);   // (a tall tower: up over the redwoods' crowns)
    for (let k = 1; k <= 6; k++) clearVeg(x, y + k * 3 * TILE, (5 - k * 0.5) * TILE);   // (the trees in front of it in this view) P('pbench', x - 70, y + 70, 0, { a: Math.PI / 2 });
    P('textsign', x - 100, y + 30, 0, { text: 'FIRE LOOKOUT', bg: '#5a3a22', fg: [250, 230, 180], z: 30 });
    return { name: L.name, x: Math.round(x), y: Math.round(y), h: Math.round(best.h) };
  };
  // clear a round of ground: the growth on it goes, the ground made `tile` (open woods ground only)
  const clearRound = (x, y, r, tile, lush = false) => {
    for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++) for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
      if (!inF(tx, ty)) continue;
      const i = idx(tx, ty), t = m.tiles[i];
      if (Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > r) continue;
      if (t === T.GRASS || t === T.DIRT) { m.tiles[i] = lush ? T.GRASS : tile === T.GRASS ? t : tile; m.reserve[i] |= RES | (lush ? 128 : 0); }   // (lush: the sunlit grass of a clearing - reserve 128, the ground bake's pasture)
    }
    clearVeg(x, y, r + 12);
  };
  const VG = [];
  for (const p of m.props) if (p && VEG.test(p.t)) VG.push(p);
  const vgrid = new Map(), VC = 8 * TILE;
  for (const p of VG) { const k = Math.floor(p.x / VC) * 65536 + Math.floor(p.y / VC); let a = vgrid.get(k); if (!a) vgrid.set(k, a = []); a.push(p); }
  const clearVeg = (x, y, r) => {
    for (let cy = Math.floor((y - r) / VC); cy <= Math.floor((y + r) / VC); cy++) for (let cx = Math.floor((x - r) / VC); cx <= Math.floor((x + r) / VC); cx++) {
      for (const p of vgrid.get(cx * 65536 + cy) || []) if (Math.hypot(p.x - x, p.y - y) < r) drop.add(p.x + ',' + p.y);
    }
  };
  // the line of a tile path: every third tile, rounded twice (Chaikin), px
  const smooth = (path) => {
    let p = path.filter((_, k) => k % 3 === 0 || k === path.length - 1).map(([x, y]) => [(x + 0.5) * TILE, (y + 0.5) * TILE]);
    for (let r = 0; r < 2; r++) { const q = [p[0]]; for (let k = 1; k < p.length; k++) { const [x0, y0] = p[k - 1], [x1, y1] = p[k]; q.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]); } q.push(p[p.length - 1]); p = q; }
    return p;
  };
  // the samples along a line, every `step` px: [x, y, heading]
  const samples = (line, step) => {
    const s = [];
    for (let k = 1; k < line.length; k++) {
      const [x0, y0] = line[k - 1], [x1, y1] = line[k], L = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
      const n = Math.max(1, Math.round(L / step));
      for (let j = k === 1 ? 0 : 1; j <= n; j++) s.push([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n, a]);
    }
    return s;
  };
  const relAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inF(tx + dx, ty + dy)) { s += m.relief[idx(tx + dx, ty + dy)]; n++; } return n ? s / n : 0; };
  const tileAtPx = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return inF(tx, ty) ? m.tiles[idx(tx, ty)] : -1; };
  const deck = [];   // (the bridges' deck tiles over the water)
  // lay a line: the dirt under it, the growth off it, bridges where it crosses water
  const lay = (line, r, info) => {
    const S = samples(line, 8);
    let run = null;
    const runs = [];
    for (const [x, y, a] of S) {
      const t = tileAtPx(x, y);
      if (inRope(x, y)) { if (run) { runs.push(run); run = null; } continue; }   // (the rope bridge's span: its own, below)
      if (wetT(t)) { if (!run) run = { pts: [] }; run.pts.push([x, y, a]); continue; }
      if (run) { runs.push(run); run = null; }
      for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++) for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
        if (!inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > r) continue;
        const i = idx(tx, ty), tt = m.tiles[i];
        if (tt === T.GRASS || tt === T.DIRT) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; m.reserve[i] &= ~128; }
      }
      clearVeg(x, y, TRAIL.clear);
    }
    if (run) runs.push(run);
    for (const R of runs) {
      const a0 = R.pts[0], a1 = R.pts[R.pts.length - 1], a = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]);
      const ux = Math.cos(a), uy = Math.sin(a), L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) + 16;
      const mx = (a0[0] + a1[0]) / 2, my = (a0[1] + a1[1]) / 2;
      // the deck over the water: bridge tiles (a deck walked onto from the bank, the water still under it - swimmers and
      // boats pass beneath, the river stays one, the bake draws the water) along its chord and under every step of the
      // line over the water
      for (const [x, y] of R.pts) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const tx = Math.floor(x / TILE) + dx, ty = Math.floor(y / TILE) + dy;
        if (!inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > 30) continue;
        const i = idx(tx, ty);
        if (wetT(m.tiles[i])) { m.tiles[i] = T.BRIDGE; m.reserve[i] |= RES; deck.push(i); }
      }
      for (let d = -L / 2 - 8; d <= L / 2 + 8; d += 8) for (const o of [-18, 0, 18]) {
        const px = mx + ux * d - uy * o, py = my + uy * d + ux * o, tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
        if (!inF(tx, ty)) continue;
        const i = idx(tx, ty);
        if (wetT(m.tiles[i])) { m.tiles[i] = T.BRIDGE; m.reserve[i] |= RES; deck.push(i); }
      }
      // how far the water lies below the banks: a gorge takes the rope bridge
      const bank = Math.min(relAt(a0[0] - ux * 64, a0[1] - uy * 64), relAt(a1[0] + ux * 64, a1[1] + uy * 64)), low = relAt(mx, my);
      const tiles = L / TILE, kind = bank - low >= 10 ? 'ropebridge' : tiles <= 4.5 ? 'logbridge' : 'fbridge';
      P(kind, mx, my, 0, { len: Math.round(L + (kind === 'ropebridge' ? 64 : 40)), a: Math.round(a * 1000) / 1000 });
      info.bridges.push(kind);
    }
  };
  // the furniture along a laid line: blazes, steps, handrails, benches by the water
  const furnish = (line, T0, info) => {
    const S = samples(line, TILE);
    let lastBench = -999, side = 1;
    for (let k = 2; k < S.length - 2; k++) {
      const [x, y, a] = S[k], nx = -Math.sin(a), ny = Math.cos(a), t = tileAtPx(x, y);
      if (t !== T.DIRT || inRope(x, y)) continue;
      // the blaze: a post at the trail's edge in its colour, either side in turn
      if (k % TRAIL.blazeEvery === 0) {
        const bx = x + nx * 46 * side, by = y + ny * 46 * side, bt = tileAtPx(bx, by);
        if (bt === T.GRASS || bt === T.DIRT) { P('blaze', bx, by, 0, { c: T0.blaze, a: Math.round(a * 100) / 100 }); clearVeg(bx, by, 20); info.blazes++; side = -side; }
      }
      // steps up the steep stretches (every other tile), a handrail where the ground falls away to one side
      const dz = Math.abs(relAt(S[k + 2][0], S[k + 2][1]) - relAt(S[k - 2][0], S[k - 2][1])) / 4;
      if (dz >= TRAIL.steep && k % 2 === 0) { P('logsteps', x, y, 0, { a: Math.round(a * 100) / 100, w: 60 }); info.steps++; }
      const across = relAt(x + nx * 64, y + ny * 64) - relAt(x - nx * 64, y - ny * 64);
      if (Math.abs(across) / 4 >= TRAIL.drop && k % 3 === 0) {
        const s = across > 0 ? -1 : 1;
        P('creekrail', x + nx * 40 * s, y + ny * 40 * s, 0, { len: 96, a: Math.round(a * 1000) / 1000 }); info.rails++;
      }
      // a bench where a lake or the river is in view (one in 120 tiles)
      if (k - lastBench > 120) {
        let wat = 0;
        for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) { const tx = Math.floor(x / TILE) + dx, ty = Math.floor(y / TILE) + dy; if (inF(tx, ty) && wetT(m.tiles[idx(tx, ty)])) wat++; }
        const bx = x - nx * 52, by = y - ny * 52, bt = tileAtPx(bx, by);
        if (wat >= 12 && (bt === T.GRASS || bt === T.DIRT)) { P('pbench', bx, by, 0, { a: Math.round(a * 100) / 100 }); clearVeg(bx, by, 30); lastBench = k; info.benches++; }
      }
    }
  };
  // a trailhead: the board, the trail's sign, a drinking fountain and a bin beside the trail's first steps
  const trailhead = (line, T0) => {
    const [x0, y0] = line[0], [x1, y1] = line[Math.min(line.length - 1, 6)], a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
    const at = (d, o) => [x0 + Math.cos(a) * d + nx * o, y0 + Math.sin(a) * d + ny * o];
    const put = (t, d, o, r, ex) => { const [x, y] = at(d, o), tt = tileAtPx(x, y); if (tt === T.GRASS || tt === T.DIRT || tt === T.LOT) { P(t, x, y, r, ex); clearVeg(x, y, 30); } };
    put('mapboard', 40, 58, 10); put('textsign', 70, -64, 0, { text: T0.name.toUpperCase(), bg: '#3a5a2a', fg: [250, 236, 190], z: 34 });
    put('drinkfount', 20, -50, 6); put('trashcan', 0, 52, 6); put('fingerpost', 96, 50, 4);
  };
  for (const T0 of WOODS3.trails) {
    const info = { name: T0.name, len: 0, legs: 0, bridges: [], steps: 0, rails: 0, blazes: 0, benches: 0 };
    let path = [];
    const pts = T0.pts;
    let prev = null;   // (a trail that starts or ends on another joins it nearest its 'from' / 'to' point)
    for (let j = 0; j < pts.length; j++) {
      if (pts[j] === 'lookout' && !out.lookout) out.lookout = lookout();
      const onTrail = typeof pts[j] === 'string' && pts[j].startsWith('trail:');
      const at = anchor(pts[j], onTrail ? (j === 0 ? T0.from : T0.to) : prev);
      if (!at) { out.missed.push(`${T0.name}: ${pts[j]}`); continue; }
      const to = at.pair ? at.pair[0] : at;
      if (prev) {
        const free = (x, y) => Math.abs(x - prev[0]) + Math.abs(y - prev[1]) <= 5 || Math.abs(x - to[0]) + Math.abs(y - to[1]) <= 5;
        const leg = route(prev, to, free);
        if (!leg) { out.missed.push(`${T0.name}: leg ${j}`); prev = at.pair ? at.pair[1] : at; continue; }
        path = path.length ? path.concat(leg.slice(1)) : leg;
        info.legs++;
      }
      if (at.pair) {
        // the rope bridge: straight over from rim to rim
        const [a0, a1] = at.pair, n = Math.abs(a1[1] - a0[1]), sy = Math.sign(a1[1] - a0[1]);
        for (let k = 1; k <= n; k++) path.push([a0[0], a0[1] + sy * k]);
        ropes.push({ x: a0[0], y0: a0[1], y1: a1[1], trail: T0.name });
        prev = a1;
      } else prev = at;
    }
    if (path.length < 8) { out.missed.push(T0.name); continue; }
    laid.set(T0.name, path);
    const line = smooth(path);
    lay(line, TRAIL.r, info);
    furnish(line, T0, info);
    const startsOnTrail = typeof T0.pts[0] === 'string' && T0.pts[0].startsWith('trail:');
    if (startsOnTrail) { const [x, y] = line[0]; P('fingerpost', x + 40, y + 30, 4); clearVeg(x + 40, y + 30, 24); } else trailhead(line, T0);
    const last = line[line.length - 1], lastOnTrail = typeof T0.pts[T0.pts.length - 1] === 'string' && T0.pts[T0.pts.length - 1].startsWith('trail:');
    if (lastOnTrail) { P('fingerpost', last[0] - 40, last[1] + 30, 4); clearVeg(last[0] - 40, last[1] + 30, 24); }
    for (let k = 1; k < path.length; k++) info.len += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
    info.len = Math.round(info.len);
    info.line = line.filter((_, k) => k % 4 === 0 || k === line.length - 1).map(([x, y]) => [Math.round(x), Math.round(y)]);
    out.trails.push(info);
  }
  // the rope bridges: a deck over the water under each span (bridge tiles, as the footbridges'), the gorge's rock under
  // its line made walkable ground, the bridge hung from rim to rim
  for (const r of ropes) {
    const y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
    for (let y = y0; y <= y1; y++) for (const dx of [-1, 0, 1]) {
      const x = r.x + dx; if (!inF(x, y)) continue;
      const i = idx(x, y);
      if (wetT(m.tiles[i])) { m.tiles[i] = T.BRIDGE; m.reserve[i] |= RES; deck.push(i); }
      else if (m.tiles[i] === T.WALL) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; }
      clearVeg((x + 0.5) * TILE, (y + 0.5) * TILE, 40);
    }
    for (let k = 1; k <= 5; k++) clearVeg((r.x + 0.5) * TILE, (y1 + k * 2.5) * TILE, (4.5 - k * 0.5) * TILE);   // (the trees in front of its south end in this view)
    P('ropebridge', (r.x + 0.5) * TILE, ((y0 + y1) / 2 + 0.5) * TILE, 0, { len: (y1 - y0 + 1) * TILE + 32, a: Math.round(Math.PI / 2 * 1000) / 1000 });
    const t = out.trails.find((q) => q.name === r.trail); if (t) t.bridges.push('ropebridge');
    out.ropes = (out.ropes || 0) + 1;
  }
  // the glades
  for (const G of WOODS3.glades) {
    const g = glade(G);
    if (g) out.glades.push(g); else out.missed.push(G.name);
  }
  function glade(G) {
    const path = laid.get(G.trail);
    if (!path) return null;
    // the spot: open woods ground for the clearing (a 9-tile round), 12-30 tiles from the trail; by a creek for the pool
    let creek = null;
    if (G.creek) {
      let bd = 1e9;
      for (let ty = G.near[1] - 40; ty <= G.near[1] + 40; ty++) for (let tx = G.near[0] - 40; tx <= G.near[0] + 40; tx++) {
        if (!inF(tx, ty)) continue;
        const i = idx(tx, ty);
        if (!wetT(m.tiles[i]) || !m.river[i] || (m.lake && m.lake[i])) continue;
        let n = 0; for (let k = -4; k <= 4; k++) { if (inF(tx + k, ty) && wetT(m.tiles[idx(tx + k, ty)])) n++; if (inF(tx, ty + k) && wetT(m.tiles[idx(tx, ty + k)])) n++; }
        if (n > 9) continue;   // (a creek: narrow)
        const d = Math.hypot(tx - G.near[0], ty - G.near[1]);
        if (d < bd) { bd = d; creek = [tx, ty]; }
      }
    }
    const trailD = (tx, ty) => { let bd = 1e9; for (let k = 0; k < path.length; k += 2) { const d = Math.hypot(path[k][0] - tx, path[k][1] - ty); if (d < bd) bd = d; } return bd; };
    let best = null;
    const c0 = creek || G.near;
    for (let ty = c0[1] - 30; ty <= c0[1] + 30; ty += 2) for (let tx = c0[0] - 30; tx <= c0[0] + 30; tx += 2) {
      if (!inF(tx, ty)) continue;
      let open = 0, bad = 0;
      for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
        if (dx * dx + dy * dy > 81) continue;
        const x = tx + dx, y = ty + dy;
        if (!inF(x, y)) { bad++; continue; }
        const i = idx(x, y), t = m.tiles[i];
        if (t === T.GRASS && !m.reserve[i] && m.dist[i] === D && !blocked.has(i)) open++;
        else if (!(creek && wetT(t))) bad++;
      }
      if (bad > (creek ? 60 : 6)) continue;
      const td = trailD(tx, ty);
      if (td < 12 || td > 32) continue;
      const cd = creek ? Math.hypot(tx - creek[0], ty - creek[1]) : 0;
      if (creek && (cd < 7 || cd > 13)) continue;
      const sc = open - Math.abs(td - 18) * 2 - cd - Math.hypot(tx - G.near[0], ty - G.near[1]) * 0.3 + hh(tx, ty, 941) * 2;
      if (!best || sc > best.sc) best = { tx, ty, sc };
    }
    if (!best) return null;
    const { tx, ty } = best, X = (tx + 0.5) * TILE, Y = (ty + 0.5) * TILE, h = (k) => hh(tx, ty, 950 + k);
    // the clearing: sunlit grass, its edge wavering (no tree in it); the path in from the nearest point of the trail
    const R = 8 + h(0) * 2;
    for (let a = 0; a < 16; a++) { const an = a * Math.PI / 8, r = R * (0.85 + h(1 + a) * 0.3); clearRound(X + Math.cos(an) * r * TILE * 0.5, Y + Math.sin(an) * r * TILE * 0.5, r * TILE * 0.55, T.GRASS, true); }
    clearRound(X, Y, R * TILE * 0.7, T.GRASS, true);
    for (let k = 1; k <= 6; k++) clearVeg(X, Y + R * TILE * (0.5 + k * 0.3), R * TILE * (0.85 - k * 0.09));   // (the tall trees in front of it in this view, so it reads as open)
    let near = null, nd = 1e9;
    for (const q of path) { const d = Math.hypot(q[0] - tx, q[1] - ty); if (d < nd) { nd = d; near = q; } }
    const spur = route(near, [tx, ty], (x, y) => Math.abs(x - tx) + Math.abs(y - ty) <= 10 || Math.abs(x - near[0]) + Math.abs(y - near[1]) <= 3);
    if (spur) lay(smooth(spur), 20, { bridges: [] });
    // the fire ring in the middle, the log seats round it, two stumps
    const lit = h(2) < 0.3;
    const ring = [X, Y];
    for (let ty2 = ty - 2; ty2 <= ty + 2; ty2++) for (let tx2 = tx - 2; tx2 <= tx + 2; tx2++) if (inF(tx2, ty2) && m.tiles[idx(tx2, ty2)] === T.GRASS && Math.hypot(tx2 - tx, ty2 - ty) <= 1.6) { m.tiles[idx(tx2, ty2)] = T.DIRT; m.reserve[idx(tx2, ty2)] &= ~128; }
    P('campfire', X, Y, 0, { lit, rest: 1 });
    const a0 = h(3) * Math.PI * 2;
    for (let k = 0; k < 3; k++) { const a = a0 + k * Math.PI * 2 / 3, r = 64; P('log', X + Math.cos(a) * r, Y + Math.sin(a) * r * 0.85, 8, { len: 90, a: Math.round(((a + Math.PI / 2) % Math.PI) * 100) / 100, seat: 1, moss: 1 }); }
    for (let k = 0; k < 2; k++) { const a = a0 + Math.PI / 3 + k * Math.PI, r = 110; P('rwstump', X + Math.cos(a) * r, Y + Math.sin(a) * r * 0.85, 12); }
    // the long mossy log at the edge, the three mushrooms along it; berry bushes, boulders, white flowers
    const la = a0 + Math.PI * (0.9 + h(4) * 0.3), lr = R * TILE * 0.62, lx = X + Math.cos(la) * lr, ly = Y + Math.sin(la) * lr * 0.85;
    P('rwlog', lx, ly, 0, { len: 216, flip: h(5) < 0.5 });
    const forage = (m.forage ||= []);
    const MUSH = ['redcap', 'goldTrumpet', 'goldTrumpet', 'ghostglass'];
    for (let k = 0; k < 4; k++) forage.push({ x: Math.round(lx - 80 + k * 52 + (h(6 + k) - 0.5) * 12), y: Math.round(ly + 26), k: MUSH[k], glade: 1 });
    for (let k = 0; k < 3; k++) { const a = a0 + Math.PI * (0.25 + k * 0.5) + h(10 + k) * 0.4, r = R * TILE * (0.7 + h(13 + k) * 0.15), bx = X + Math.cos(a) * r, by = Y + Math.sin(a) * r * 0.85; P('shrub_a', bx, by, 0, { sp: 'berry', k: 1.1 }); forage.push({ x: Math.round(bx), y: Math.round(by + 18), k: 'berries', glade: 1 }); }
    for (let k = 0; k < 3; k++) { const a = a0 + Math.PI * (1.4 + k * 0.35) + h(16 + k) * 0.3, r = R * TILE * (0.72 + h(19 + k) * 0.2); P('boulder', X + Math.cos(a) * r, Y + Math.sin(a) * r * 0.85, 14, { s: 22 + Math.round(h(22 + k) * 16), moss: 1 }); }
    for (let k = 0; k < 7; k++) { const a = h(25 + k) * Math.PI * 2, r = R * TILE * (0.4 + h(32 + k) * 0.45); P('flowers_a', X + Math.cos(a) * r, Y + Math.sin(a) * r * 0.85, 0, { sp: 'daisies', k: 1 }); }
    // the creek's pool and its little fall (Hidden Pool): the creek widened where it passes, the fall just above
    let pool = null;
    if (creek) {
      const [cx, cy] = creek;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy * 1.4 > 9.5 || !inF(cx + dx, cy + dy)) continue;
        const i = idx(cx + dx, cy + dy), t = m.tiles[i];
        if (t === T.GRASS || t === T.DIRT || t === T.SAND) { m.tiles[i] = dx * dx + dy * dy < 3 ? T.DEEP : T.WATER; m.land[i] = 0; m.river[i] = 1; m.reserve[i] |= RES; }
      }
      clearVeg((cx + 0.5) * TILE, (cy + 0.5) * TILE, 4 * TILE);
      P('fallsmall', (cx + 0.5) * TILE, (cy - 2.2) * TILE, 0, { w: 40, h: 26 });
      P('boulder', (cx - 2.6) * TILE, (cy - 2.4) * TILE, 14, { s: 26, moss: 1 }); P('boulder', (cx + 3.4) * TILE, (cy - 2.2) * TILE, 14, { s: 22, moss: 1 });
      P('rwlog', (cx + 0.5) * TILE, (cy + 3.6) * TILE, 0, { len: 168, flip: false });   // (the log across its outflow)
      pool = { x: Math.round((cx + 0.5) * TILE), y: Math.round((cy + 0.5) * TILE) };
    }
    return { name: G.name, x: Math.round(X), y: Math.round(Y), r: Math.round(R * TILE), ring, lit, pool, trail: G.trail };
  }
  // the woods' growth off the trails, the glades and the lookout; then what they put there
  if (drop.size && H3.removeProps) { const before = m.props.length; H3.removeProps(m, (x, y) => drop.has(x + ',' + y)); out.cleared = before - m.props.length; }
  for (const [t, x, y, r, extra] of props) H3.addProp(m, t, x, y, r, extra);
  out.bridges = deck.length;
  // the map's lists: the trails (their lines), the glades (rest spots: their fires), the lookout
  for (const t of out.trails) m.natureSites.push({ kind: 'trail', name: t.name, x: t.line[0][0], y: t.line[0][1], len: t.len, line: t.line });
  for (const g of out.glades) {
    m.natureSites.push({ kind: 'glade', name: g.name, x: g.x, y: g.y, r: g.r, ...(g.pool ? { pool: g.pool } : {}) });
    (m.restSpots ||= []).push({ x: g.ring[0], y: g.ring[1], kind: 'glade', lit: g.lit });
  }
  if (out.lookout) (m.landmarks ||= []).push({ name: out.lookout.name, type: 'lookout', x: out.lookout.x - 3 * TILE, y: out.lookout.y - 3 * TILE, w: 6 * TILE, h: 6 * TILE });
  for (const t of out.trails) delete t.line;
  return out;
}
