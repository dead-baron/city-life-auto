// Granite Peaks by hand, part 1 (the nature program, 2026-10-20 - the owner's ask: "mountain meadows", "amazing places
// to walk"; the concepts NS1-D, NA1-B, N5, SC3-E and the handcraft research's 4.2). Up in the high country of the
// north-west mountains, between the tree line and the snow:
//   - the alpine meadows, five of them, each named on the map: a ragged round of lush grass on a level bench, drifts of
//     lupines, paintbrush and alpine daisies, heather, a few pale granite boulders (the scattered rock and the pines
//     taken off it); the biggest with its stone hut (NS1-D: a fieldstone refuge under a slate roof, its window lit at
//     night), the spring by it (a pipe out of the rock into a stone basin, a tin mug on its post), a bench at the door
//     and a fire ring to rest by (a campfire rest spot);
//   - the summits: three knobs just under the snow, each with its cairn and a bench looking out, the highest with a
//     coin telescope - named on the map;
//   - the Summit Trail: from the road (or the woods' trail) nearest the hut's meadow - its sign and a map board there -
//     through the meadow past the hut, up to the nearest summit's cairn; routed over the land where it walks easiest
//     (world3-trails.js routeTiles), packed earth through the grass and pale gravel over the scree, the growth off it,
//     a cairn every 30 tiles to mark it above the trees.
// For the whole-world build only (shared/world3-world.js calls buildPeaks3 from its done hook). Deterministic: integer
// hashes and the peaks' height noise; Math's trig only inside generateCity (withDeterministicMath).
import { TILE, T } from './constants.js';
import { peakHeight, SNOW_LINE, TREE_LINE } from './world3-biomes.js';
import { routeTiles } from './world3-trails.js';

const RES = 32, D_PEAKS = 48;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const PEAKS3 = {
  box: [440, 240, 2060, 1490],   // (tiles: the district's extent to search)
  // n meadows at least `spacing` apart, radius r (tiles), between the heights h (peakHeight: under the snow, near or
  // above the tree line), the relief over them within `flat`, `keep` tiles off a road, a named place or a nature site
  meadows: { n: 5, step: 8, spacing: 110, r: [11, 15], h: [TREE_LINE - 0.1, SNOW_LINE - 0.04], flat: 10, keep: 30, names: ['Marmot Meadow', 'Columbine Basin', 'Heather Bench', 'Paintbrush Flat', 'Saxifrage Meadow'] },
  // n summits at least `spacing` apart: a knob (higher than the ground `knob` tiles round it every way) between the
  // heights h (just under the snow line, or at it)
  summits: { n: 3, step: 6, spacing: 200, knob: 14, h: [SNOW_LINE - 0.08, SNOW_LINE + 0.02], keep: 24, names: ['Cairn Peak', 'Eagle Knob', 'Windy Col'] },
  trail: { name: 'Summit Trail', cairnEvery: 30, road: 260, reach: 460 },   // (road: how far to look for its start - a road or a trail; reach: the summit at most this far from the hut)
};
const VEG = /^(tree_|shrub_|bush_|flowers_|log$|boulder|outcrop)/;
// the designed places up in the mountains the snow leaves bare round (shared/world3-world.js's snowfields: the landmarks'
// types) - the Ridge Trail Hunting Camp sat in the snow
export const THAW = new Set(['huntcamp', 'lookout', 'mine', 'observatory', 'camp', 'springs', 'quarry']);

export function buildPeaks3(m, H3) {
  const out = { meadows: [], summits: [], trail: null, cleared: 0, missed: 0 };
  if (!H3 || !H3.addProp || !m.relief) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const props = [], P = (t, x, y, r = 0, ex = null) => props.push([t, Math.round(x), Math.round(y), r, ex]);
  const drop = new Set();
  // what to keep clear of: the roads (by 8-tile cell), the named places and the nature sites in the mountains
  const roadCell = new Set();
  const [bx0, by0, bx1, by1] = PEAKS3.box;
  for (let ty = Math.max(0, by0 - 40); ty < Math.min(HH, by1 + 40); ty++) for (let tx = Math.max(0, bx0 - 40); tx < Math.min(W, bx1 + 40); tx++) { const t = m.tiles[idx(tx, ty)]; if (t === T.ROAD || t === T.BRIDGE || t === T.BUILDING) roadCell.add(Math.floor(tx / 8) * 4096 + Math.floor(ty / 8)); }
  const nearRoad = (tx, ty, r) => { const c = Math.ceil(r / 8); for (let dy = -c; dy <= c; dy++) for (let dx = -c; dx <= c; dx++) if (roadCell.has((Math.floor(tx / 8) + dx) * 4096 + Math.floor(ty / 8) + dy)) return true; return false; };
  const places = [];
  for (const l of m.landmarks || []) places.push([(l.x + l.w / 2) / TILE, (l.y + l.h / 2) / TILE, Math.max(l.w, l.h) / 2 / TILE]);
  for (const s of m.natureSites || []) if (Number.isFinite(s.x) && Number.isFinite(s.y)) places.push([s.x / TILE, s.y / TILE, (s.r || 0) / TILE]);
  const nearPlace = (tx, ty, r) => places.some(([x, y, pr]) => Math.hypot(x - tx, y - ty) < pr + r);
  const ground = (i) => { const t = m.tiles[i]; return m.dist[i] === D_PEAKS && m.land[i] && (t === T.GRASS || t === T.DIRT) && !(m.reserve[i] & ~128) && (m.bld ? m.bld[i] < 0 : true); };
  const fits = (tx, ty, R) => { for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R) continue; if (!inF(tx + dx, ty + dy) || !ground(idx(tx + dx, ty + dy))) return false; } return true; };
  const flatOver = (tx, ty, R) => { let lo = 1e9, hi = -1e9; for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) { const r = m.relief[idx(tx + dx, ty + dy)]; if (r < lo) lo = r; if (r > hi) hi = r; } return hi - lo; };
  // the growth and the loose rock by 8-tile cell (taken off where a meadow, a summit's vista or the trail goes)
  const VC = 8 * TILE, vgrid = new Map();
  for (const p of m.props) if (p && VEG.test(p.t)) { const k = Math.floor(p.x / VC) * 65536 + Math.floor(p.y / VC); let a = vgrid.get(k); if (!a) vgrid.set(k, (a = [])); a.push(p); }
  const clearVeg = (x, y, r) => { for (let cy = Math.floor((y - r) / VC); cy <= Math.floor((y + r) / VC); cy++) for (let cx = Math.floor((x - r) / VC); cx <= Math.floor((x + r) / VC); cx++) for (const p of vgrid.get(cx * 65536 + cy) || []) if (Math.hypot(p.x - x, p.y - y) < r) drop.add(p.x + ',' + p.y); };

  // ---- the meadows ----
  const M = PEAKS3.meadows, mc = [];
  for (let ty = by0; ty <= by1; ty += M.step) for (let tx = bx0; tx <= bx1; tx += M.step) {
    const jx = tx + Math.floor(hh(tx, ty, 91) * 6) - 3, jy = ty + Math.floor(hh(tx, ty, 92) * 6) - 3;
    if (!inF(jx, jy) || m.dist[idx(jx, jy)] !== D_PEAKS) continue;
    const h = peakHeight(jx, jy);
    if (h < M.h[0] || h > M.h[1]) continue;
    mc.push({ tx: jx, ty: jy, u: hh(jx, jy, 93) });
  }
  mc.sort((a, b) => a.u - b.u);
  const meadows = [];
  for (const c of mc) {
    if (meadows.length >= M.n) break;
    if (meadows.some((q) => Math.hypot(q.tx - c.tx, q.ty - c.ty) < M.spacing)) continue;
    const R = Math.round(M.r[0] + hh(c.tx, c.ty, 94) * (M.r[1] - M.r[0]));
    if (nearRoad(c.tx, c.ty, R + 12) || nearPlace(c.tx, c.ty, R + M.keep)) continue;
    if (!fits(c.tx, c.ty, R + 2) || flatOver(c.tx, c.ty, R) > M.flat) continue;
    meadows.push({ ...c, R });
  }
  out.missed = M.n - meadows.length;
  // the way up to each: the nearest road, or the nearest point of a trail already laid (the woods'), within reach
  const RR = PEAKS3.trail.road;
  const accessOf = (c) => {
    let start = null, bd = 1e9, from = 'meadow';
    for (let dy = -RR; dy <= RR; dy += 2) for (let dx = -RR; dx <= RR; dx += 2) {
      const x = c.tx + dx, y = c.ty + dy;
      if (!inF(x, y) || m.tiles[idx(x, y)] !== T.ROAD) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; start = [x, y]; from = 'road'; }
    }
    for (const s of m.natureSites || []) if (s.kind === 'trail' && s.line) for (const [px, py] of s.line) {
      const x = Math.floor(px / TILE), y = Math.floor(py / TILE), d = (x - c.tx) * (x - c.tx) + (y - c.ty) * (y - c.ty);
      if (d < bd && d < RR * RR) { bd = d; start = [x, y]; from = s.name; }
    }
    return { start, d: Math.sqrt(bd), from };
  };
  // the hut's meadow: the one easiest reached with a summit near it (else the biggest), first
  for (const c of meadows) c.acc = accessOf(c);
  meadows.sort((a, b) => b.R - a.R || a.u - b.u);
  const reachable = meadows.filter((c) => c.acc.start);
  if (reachable.length) { const best = reachable.reduce((a, b) => (b.acc.d < a.acc.d ? b : a)); meadows.splice(meadows.indexOf(best), 1); meadows.unshift(best); }
  meadows.forEach((c, k) => {
    const { tx, ty, R } = c, X = (tx + 0.5) * TILE, Y = (ty + 0.5) * TILE, h = (n) => hh(tx, ty, 900 + n), name = M.names[k % M.names.length];
    // the ground: lush grass in a ragged round, the mountain's own thin grass in a fringe round it (so it fades into the
    // scree, not a hard edge)
    for (let dy = -R - 4; dy <= R + 4; dy++) for (let dx = -R - 4; dx <= R + 4; dx++) {
      const a = Math.atan2(dy, dx), rr = R * (0.8 + 0.3 * hh(Math.round(a * 4), tx + ty, 901)), d2 = dx * dx + dy * dy, fr = rr + 1.5 + 2 * hh(dx & 7, dy & 7, 902);
      if (d2 > fr * fr || !inF(tx + dx, ty + dy)) continue;
      const i = idx(tx + dx, ty + dy);
      if (!ground(i)) continue;
      if (d2 <= rr * rr) { m.tiles[i] = T.GRASS; m.reserve[i] |= RES | 128; }
      else if (m.tiles[i] === T.DIRT && hh(tx + dx, ty + dy, 903) < 0.75) m.tiles[i] = T.GRASS;
    }
    clearVeg(X, Y, R * TILE);
    const ring = (n, r0, r1, k0) => Array.from({ length: n }, (_, j) => { const a = h(k0 + j) * Math.PI * 2, r = R * TILE * (r0 + h(k0 + 40 + j) * (r1 - r0)); return [X + Math.cos(a) * r, Y + Math.sin(a) * r * 0.85]; });
    // the flowers in drifts: a few clumps round each of four drift centres
    for (const [dx0, dy0] of ring(4, 0.2, 0.65, 10)) {
      const sp = h(Math.round(dx0) & 255) < 0.5 ? 'aLupine' : h(Math.round(dy0) & 255) < 0.5 ? 'paintbrush' : 'aDaisies';
      for (let j = 0; j < 4; j++) P('flowers_a', dx0 + (h(20 + j + Math.round(dx0) % 7) - 0.5) * 90, dy0 + (h(30 + j + Math.round(dy0) % 7) - 0.5) * 70, 0, { sp, k: 1.1 });
    }
    for (const [x, y] of ring(4, 0.55, 0.9, 60)) P('shrub_a', x, y, 0, { sp: 'heather', k: 1 });
    for (const [x, y] of ring(3, 0.7, 0.92, 70)) P('boulder', x, y, 14, { s: 24 + Math.round(h(Math.round(x) & 63) * 18) });
    const site = { kind: 'meadow', name, x: Math.round(X), y: Math.round(Y), r: Math.round(R * TILE) };
    if (k === 0) {
      // the stone hut at the meadow's north side, its door to the south; the spring beside it; a bench at the door;
      // the fire ring out in front (a rest spot)
      const hx = X - TILE, hy = Y - R * TILE * 0.42;
      clearVeg(hx, hy - TILE, 5 * TILE);
      P('stonehut', hx, hy, 0);
      if (m.addSolidProp) for (const dx of [-46, -15, 15, 46]) m.addSolidProp(hx + dx, hy - 40, 30);
      P('mtspring', hx + 116, hy - 6, 0);
      if (m.addSolidProp) m.addSolidProp(hx + 116, hy - 12, 14);
      P('pbench', hx - 78, hy + 30, 0, { a: Math.PI / 2 });
      const fx = X - TILE, fy = Y + TILE * 1.5;
      for (let y2 = Math.floor(fy / TILE) - 1; y2 <= Math.floor(fy / TILE) + 1; y2++) for (let x2 = Math.floor(fx / TILE) - 1; x2 <= Math.floor(fx / TILE) + 1; x2++) if (inF(x2, y2) && m.tiles[idx(x2, y2)] === T.GRASS) { m.tiles[idx(x2, y2)] = T.DIRT; m.reserve[idx(x2, y2)] &= ~128; }
      P('campfire', fx, fy, 0, { lit: false, rest: 1 });
      for (let j = 0; j < 3; j++) { const a = j * Math.PI * 2 / 3 + h(80) * 2, r = 62; P('log', fx + Math.cos(a) * r, fy + Math.sin(a) * r * 0.85, 8, { len: 86, a: Math.round(((a + Math.PI / 2) % Math.PI) * 100) / 100, seat: 1 }); }
      (m.restSpots ||= []).push({ x: Math.round(fx), y: Math.round(fy), kind: 'hut', lit: false });
      site.hut = { x: Math.round(hx), y: Math.round(hy) }; site.spring = { x: Math.round(hx + 116), y: Math.round(hy - 6) }; site.fire = { x: Math.round(fx), y: Math.round(fy) };
    }
    out.meadows.push(site);
  });

  // ---- the summits ----
  const S = PEAKS3.summits, sc = [];
  for (let ty = by0; ty <= by1; ty += S.step) for (let tx = bx0; tx <= bx1; tx += S.step) {
    if (!inF(tx, ty) || m.dist[idx(tx, ty)] !== D_PEAKS) continue;
    const h = peakHeight(tx, ty);
    if (h < S.h[0] || h > S.h[1]) continue;
    let knob = true;
    for (let k = 0; k < 8 && knob; k++) { const a = k * Math.PI / 4, x = Math.round(tx + Math.cos(a) * S.knob), y = Math.round(ty + Math.sin(a) * S.knob); if (inF(x, y) && peakHeight(x, y) > h) knob = false; }
    if (knob) sc.push({ tx, ty, h });
  }
  sc.sort((a, b) => b.h - a.h || a.tx - b.tx);
  const summits = [];
  for (const c of sc) {
    if (summits.length >= S.n) break;
    if (summits.some((q) => Math.hypot(q.tx - c.tx, q.ty - c.ty) < S.spacing) || meadows.some((q) => Math.hypot(q.tx - c.tx, q.ty - c.ty) < q.R + 20)) continue;
    if (nearRoad(c.tx, c.ty, 10) || nearPlace(c.tx, c.ty, S.keep) || !fits(c.tx, c.ty, 4)) continue;
    summits.push(c);
  }
  summits.forEach((c, k) => {
    const X = (c.tx + 0.5) * TILE, Y = (c.ty + 0.5) * TILE, name = S.names[k % S.names.length];
    clearVeg(X, Y + 2 * TILE, 4 * TILE);
    P('cairn', X, Y, 10, { v: k, big: 1 });
    P('pbench', X - 10, Y + 2.6 * TILE, 0, { a: Math.PI / 2 });
    if (k === 0) P('scope', X + 64, Y + 2.2 * TILE, 6);
    for (let j = 0; j < 4; j++) P('boulder', X + (hh(c.tx, j, 95) - 0.5) * 7 * TILE, Y + (hh(j, c.ty, 96) - 0.3) * 5 * TILE, 14, { s: 20 + Math.round(hh(c.tx, c.ty, 97 + j) * 16) });
    out.summits.push({ kind: 'summit', name, x: Math.round(X), y: Math.round(Y), h: Math.round(c.h * 1000) / 1000 });
  });

  // ---- the Summit Trail: from the road (or trail) nearest the hut's meadow, through it past the hut, up to the nearest summit ----
  // (to the summit nearest the hut's meadow, if one's within reach)
  const hutM = meadows[0], top = hutM && summits.slice().sort((a, b) => Math.hypot(a.tx - hutM.tx, a.ty - hutM.ty) - Math.hypot(b.tx - hutM.tx, b.ty - hutM.ty))[0];
  const up = hutM && top && Math.hypot(top.tx - hutM.tx, top.ty - hutM.ty) < PEAKS3.trail.reach;
  if (hutM && (up || hutM.acc.start)) {
    const { start, from } = hutM.acc;
    const cost = (i) => { const t = m.tiles[i]; if (t === T.WATER || t === T.DEEP || t === T.WALL || t === T.BUILDING) return 0; if (t === T.ROAD || t === T.BRIDGE) return 12; if (m.reserve[i] & (1 | 2 | 8)) return 0; return t === T.GRASS ? 10 : 14; };
    const legs = [];
    if (start) legs.push([start, [hutM.tx, hutM.ty + 2]]);
    if (up) legs.push([[hutM.tx, hutM.ty + 2], [top.tx, top.ty + 3]]);
    const line = [];
    for (const [a, b] of legs) {
      const p = routeTiles(m, a, b, cost, (x, y) => Math.abs(x - a[0]) + Math.abs(y - a[1]) <= 3 || Math.abs(x - b[0]) + Math.abs(y - b[1]) <= 3, { slope: 80, pad: 90 });
      if (!p) continue;
      for (const q of p) if (!line.length || line[line.length - 1][0] !== q[0] || line[line.length - 1][1] !== q[1]) line.push(q);
    }
    if (line.length > 20) {
      let since = PEAKS3.trail.cairnEvery - 6, len = 0;
      for (let j = 0; j < line.length; j++) {
        const [x, y] = line[j];
        if (j) len += Math.hypot(x - line[j - 1][0], y - line[j - 1][1]);
        for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
          if (!inF(x + dx, y + dy)) continue;
          const i = idx(x + dx, y + dy);
          if (m.reserve[i] & ~(RES | 128) || !m.land[i] || m.dist[i] !== D_PEAKS) continue;
          // (packed earth through the grass; over the scree a path of pale gravel - the renderer's shingle - so it shows)
          if (m.tiles[i] === T.GRASS) { m.tiles[i] = T.DIRT; m.reserve[i] = (m.reserve[i] | RES) & ~128; }
          else if (m.tiles[i] === T.DIRT) { m.tiles[i] = T.SAND; m.reserve[i] |= RES | 128; }
        }
        clearVeg((x + 1) * TILE, (y + 1) * TILE, 1.6 * TILE);
        since++;
        if (since >= PEAKS3.trail.cairnEvery && j > 4 && j < line.length - 6 && m.tiles[idx(x, y)] !== T.ROAD && peakHeight(x, y) > TREE_LINE - 0.06) {
          const side = hh(x, y, 98) < 0.5 ? -1 : 1;
          P('cairn', (x + 1 + side * 2.2) * TILE, (y + 1) * TILE, 6, { v: j % 3 });
          since = 0;
        }
      }
      // the trailhead where it leaves the road or the trail below: its sign and a map board
      if (start && line.length > 8) {
        const [sx, sy] = line[Math.min(6, line.length - 1)], [nx, ny] = line[Math.min(10, line.length - 1)], dx = nx - sx, dy = ny - sy, l = Math.hypot(dx, dy) || 1;
        P('textsign', (sx + 1 - dy / l * 2.4) * TILE, (sy + 1 + dx / l * 2.4) * TILE, 0, { text: 'SUMMIT TRAIL', bg: '#5a4a32', fg: [250, 236, 200], z: 26 });
        P('mapboard', (sx + 1 + dy / l * 2.6) * TILE, (sy + 1 - dx / l * 2.6) * TILE, 0);
      }
      const pts = line.map(([x, y]) => [Math.round((x + 1) * TILE), Math.round((y + 1) * TILE)]);
      out.trail = { name: PEAKS3.trail.name, len: Math.round(len), from, line: pts };
    }
  }
  // what's taken off, then what's put there; the map's lists
  if (drop.size && H3.removeProps) { const before = m.props.length; H3.removeProps(m, (x, y) => drop.has(x + ',' + y)); out.cleared = before - m.props.length; }
  for (const [t, x, y, r, ex] of props) H3.addProp(m, t, x, y, r, ex);
  for (const s of [...out.meadows, ...out.summits]) {
    m.natureSites.push(s);
    const r = s.r || 4 * TILE;
    (m.landmarks ||= []).push({ name: s.name, type: s.kind, x: Math.round(s.x - r), y: Math.round(s.y - r), w: r * 2, h: r * 2 });
  }
  if (out.trail) { m.natureSites.push({ kind: 'trail', name: out.trail.name, x: out.trail.line[0][0], y: out.trail.line[0][1], len: out.trail.len, line: out.trail.line }); out.trail.points = out.trail.line.length; delete out.trail.line; }
  return out;
}
