// Highland Woods by hand, part 2 (the nature program, 2026-10-20; the owner's notes of 10-16: "forest: some semi-open,
// spaced-out clearings, on and off the paths", "forage items (mushrooms) easier to see, in visible spots"):
//   - clearings across the woods, each its own: deer meadows (sunlit grass, lupines and foxglove, a snag, berries -
//     the deer and elk come to them), old loggers' stump clearings (the old-growth stumps sawn long ago, felled logs, a
//     ring of second growth round a stump, ferns and bracken, mushrooms on the rot) and windfalls (a fallen giant across
//     the gap it tore, its root plate reared up, seedlings and ferns along it, shelf oysters on it) - some the trails
//     pass through, most off them down nothing but deer paths; named on the map;
//   - the mushrooms in sight: every forage spot in the woods that a tree in front of it in this view would hide (the
//     camera looks north: a trunk or a crown south of it covers it) moved to the nearest open ground within eight tiles
//     - or, with none, left out.
// For the whole-world build only (shared/world3-world.js calls these from its done hook, after the trails and the
// caves). Deterministic: integer hashes; Math's trig only inside generateCity (withDeterministicMath).
import { TILE, T } from './constants.js';

const RES = 32, D_WOODS = 47;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const CLEARINGS = {
  box: [520, 1000, 2100, 1700],   // (tiles: the woods' extent to search)
  step: 6, spacing: 44, n: 18, onTrail: 5,   // (a candidate every `step` tiles; clearings at least `spacing` apart; how many the trails pass through)
  kinds: {
    meadow: { r: [8, 11], names: ['Lupine Meadow', 'Deer Meadow', 'Foxglove Meadow', 'Bracken Flat', 'Elk Meadow', 'Sunny Flat'] },
    stumps: { r: [6, 8], names: ["Logger's Clearing", 'Old Stumps', 'Springboard Flat', 'Sawyer\'s Gap', 'Stump Hollow', 'Crosscut Flat'] },
    windfall: { r: [6, 7], names: ['Fallen Giant', 'Windthrow Gap', 'Nurse Log Hollow', 'Root Plate Gap', 'Storm Gap', 'Old Windfall'] },
  },
};
const ORDER = ['meadow', 'stumps', 'windfall'];
const VEG = /^(tree_|redwood|shrub_|bush_|flowers_|rwstump|rwlog|log$|fern|gnaw)/;

export function buildClearings3(m, H3) {
  const out = { clearings: [], missed: 0, cleared: 0 };
  if (!H3 || !H3.addProp) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const props = [], P = (t, x, y, r = 0, ex = null) => props.push([t, Math.round(x), Math.round(y), r, ex]);
  const drop = new Set();
  // where things are: the trails' lines, the designed places to keep clear of (the glades, the caves' mouths, the enduro)
  const trails = (m.natureSites || []).filter((s) => s.kind === 'trail' && s.line);
  // (nothing that grows or lies about on a trail that passes through: a clearing's ferns, stumps, logs and boulders
  // keep a tile and a half off its line - by its segments, 64-px cells)
  const SC = 64, seg = new Map();
  for (const t of trails) for (let k = 1; k < t.line.length; k++) {
    const [ax, ay] = t.line[k - 1], [bx, by] = t.line[k];
    for (let cy = Math.floor(Math.min(ay, by) / SC) - 1; cy <= Math.floor(Math.max(ay, by) / SC) + 1; cy++) for (let cx = Math.floor(Math.min(ax, bx) / SC) - 1; cx <= Math.floor(Math.max(ax, bx) / SC) + 1; cx++) { const key = cx * 65536 + cy; let a2 = seg.get(key); if (!a2) seg.set(key, (a2 = [])); a2.push([ax, ay, bx, by]); }
  }
  const onTrail = (x, y, r) => { for (const [ax, ay, bx, by] of seg.get(Math.floor(x / SC) * 65536 + Math.floor(y / SC)) || []) { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0, ex = ax + dx * t - x, ey = ay + dy * t - y; if (ex * ex + ey * ey < r * r) return true; } return false; };
  const keepOff = (m.natureSites || []).filter((s) => s.kind === 'glade' || s.kind === 'cavemouth' || s.kind === 'enduro' || s.kind === 'creek' || s.kind === 'redwoodcove' || s.kind === 'gorge').map((s) => [s.x / TILE, s.y / TILE, s.kind === 'glade' ? 30 : 40]);
  // (and every named place in the woods - a mast, a camp, a lodge, the lookout: its box and 16 tiles round it)
  for (const l of m.landmarks || []) { const cx = (l.x + l.w / 2) / TILE, cy = (l.y + l.h / 2) / TILE; if (inF(Math.floor(cx), Math.floor(cy)) && m.dist[idx(Math.floor(cx), Math.floor(cy))] === D_WOODS) keepOff.push([cx, cy, Math.max(l.w, l.h) / 2 / TILE + 16]); }
  const tgrid = new Map(), TG = 16;   // (the trails' points by 16-tile cell)
  for (const t of trails) for (const [x, y] of t.line) { const k = Math.floor(x / TILE / TG) * 4096 + Math.floor(y / TILE / TG); let a = tgrid.get(k); if (!a) tgrid.set(k, (a = [])); a.push([x / TILE, y / TILE]); }
  const trailD = (tx, ty) => { let bd = 1e9; const cx = Math.floor(tx / TG), cy = Math.floor(ty / TG); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) for (const [x, y] of tgrid.get((cx + dx) * 4096 + cy + dy) || []) { const d = Math.hypot(x - tx, y - ty); if (d < bd) bd = d; } return bd; };
  const okTile = (i, onTrail) => { const t = m.tiles[i]; return m.dist[i] === D_WOODS && m.land[i] && (t === T.GRASS || (onTrail && t === T.DIRT)) && !(m.reserve[i] & ~(onTrail ? RES : 0) & ~128) && (m.bld ? m.bld[i] < 0 : true); };
  const nearRoad = (tx, ty, r) => { for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) if (inF(tx + dx, ty + dy) && m.tiles[idx(tx + dx, ty + dy)] === T.ROAD) return true; return false; };
  const fits = (tx, ty, R, onTrail) => {
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      if (!inF(tx + dx, ty + dy)) return false;
      const i = idx(tx + dx, ty + dy), t = m.tiles[i];
      if (t === T.WATER || t === T.DEEP || t === T.ROAD || t === T.WALL || t === T.BUILDING) return false;
      if (!okTile(i, onTrail) && !(onTrail && t === T.BRIDGE)) return false;
    }
    return true;
  };
  // the candidates: open woods ground, the relief gentle (a meadow lies flat), off the roads and the designed places
  const [bx0, by0, bx1, by1] = CLEARINGS.box, cands = [];
  for (let ty = by0; ty <= by1; ty += CLEARINGS.step) for (let tx = bx0; tx <= bx1; tx += CLEARINGS.step) {
    const jx = tx + Math.floor(hh(tx, ty, 71) * 4) - 2, jy = ty + Math.floor(hh(tx, ty, 72) * 4) - 2;
    if (!inF(jx, jy) || m.dist[idx(jx, jy)] !== D_WOODS) continue;
    if (keepOff.some(([x, y, r]) => Math.hypot(x - jx, y - jy) < r)) continue;
    if (nearRoad(jx, jy, 12)) continue;
    const td = trailD(jx, jy);
    cands.push({ tx: jx, ty: jy, td, h: hh(jx, jy, 73) });
  }
  cands.sort((a, b) => a.h - b.h);
  const chosen = [];
  let onT = 0, kindK = 0;
  const why = out.why = { near: 0, spaced: 0, fit: 0, flat: 0 };
  // (the ones the trails pass through first, then the rest off them)
  for (const pass of [0, 1]) for (const c of cands) {
    if (chosen.length >= CLEARINGS.n) break;
    const on = !pass && c.td <= 3 && onT < CLEARINGS.onTrail, off = pass && c.td >= 14 && c.td <= 60;
    if (!pass && c.td <= 3) why.near++;
    if (!on && !off) continue;
    if (chosen.some((q) => Math.hypot(q.tx - c.tx, q.ty - c.ty) < CLEARINGS.spacing)) { if (on) why.spaced++; continue; }
    const kind = on && ORDER[kindK % 3] === 'windfall' ? 'meadow' : ORDER[kindK % 3], K = CLEARINGS.kinds[kind], R = Math.round(K.r[0] + hh(c.tx, c.ty, 74) * (K.r[1] - K.r[0]));   // (no fallen giant across a trail)
    if (!fits(c.tx, c.ty, R + 1, on)) { if (on) why.fit++; continue; }
    // (a meadow lies flat: the relief within a few metres over it)
    if (m.relief && kind === 'meadow') { let lo = 1e9, hi = -1e9; for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) { const r = m.relief[idx(c.tx + dx, c.ty + dy)]; lo = Math.min(lo, r); hi = Math.max(hi, r); } if (hi - lo > 8) { why.flat++; continue; } }
    chosen.push({ ...c, kind, R, on, name: K.names[Math.floor(kindK / 3) % K.names.length] });
    kindK++; if (on) onT++;
  }
  out.missed = CLEARINGS.n - chosen.length;
  // the growth taken off: in the clearing, and the tall trees in front of it in this view
  const vg = [], VC = 8 * TILE, vgrid = new Map();
  for (const p of m.props) if (p && VEG.test(p.t)) vg.push(p);
  for (const p of vg) { const k = Math.floor(p.x / VC) * 65536 + Math.floor(p.y / VC); let a = vgrid.get(k); if (!a) vgrid.set(k, (a = [])); a.push(p); }
  const clearVeg = (x, y, r) => { for (let cy = Math.floor((y - r) / VC); cy <= Math.floor((y + r) / VC); cy++) for (let cx = Math.floor((x - r) / VC); cx <= Math.floor((x + r) / VC); cx++) for (const p of vgrid.get(cx * 65536 + cy) || []) if (Math.hypot(p.x - x, p.y - y) < r) drop.add(p.x + ',' + p.y); };
  const forage = (m.forage ||= []);
  for (const c of chosen) {
    const { tx, ty, R, kind } = c, X = (tx + 0.5) * TILE, Y = (ty + 0.5) * TILE, h = (k) => hh(tx, ty, 800 + k);
    // the ground: a ragged round (lush sunlit grass in a meadow and a windfall's gap; a stump clearing's left as it is)
    for (let dy = -R - 1; dy <= R + 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const a = Math.atan2(dy, dx), rr = R * (0.82 + 0.28 * hh(Math.round(a * 4), tx + ty, 801));
      if (dx * dx + dy * dy > rr * rr || !inF(tx + dx, ty + dy)) continue;
      const i = idx(tx + dx, ty + dy);
      if (m.tiles[i] !== T.GRASS) continue;
      m.reserve[i] |= RES | 128;   // (sunlit grass where the canopy's open)
    }
    clearVeg(X, Y, R * TILE * 0.95);
    for (let k = 1; k <= 6; k++) clearVeg(X, Y + R * TILE * (0.5 + k * 0.32), R * TILE * (0.8 - k * 0.08));   // (so it reads as open)
    // (n spots round the clearing between r0 and r1 of its radius - none on a trail that passes through it)
    const ring = (n, r0, r1, k0) => { const o = []; for (let k = 0; o.length < n && k < n * 4; k++) { const a = h(k0 + k) * Math.PI * 2, r = R * TILE * (r0 + h(k0 + 20 + k) * (r1 - r0)), x = X + Math.cos(a) * r, y = Y + Math.sin(a) * r * 0.85; if (!c.on || !onTrail(x, y, 1.5 * TILE)) o.push([x, y]); } return o; };
    if (kind === 'meadow') {
      for (const [x, y] of ring(9, 0.15, 0.8, 10)) P('flowers_a', x, y, 0, { sp: h(40 + Math.round(x)) < 0.4 ? 'lupines' : h(41 + Math.round(y)) < 0.5 ? 'foxglove' : 'wildflowers', k: 1.1 });
      for (const [x, y] of ring(5, 0.3, 0.85, 50)) P('flowers_a', x, y, 0, { sp: 'tallGrass', k: 1 });
      const [sx, sy] = ring(1, 0.55, 0.7, 60)[0];
      P('tree_b', sx, sy, 12, { sp: 'deadSnag', k: 1.5 });
      for (const [x, y] of ring(3, 0.65, 0.85, 62)) P('boulder', x, y, 14, { s: 22 + Math.round(h(Math.round(x) & 63) * 16), moss: 1 });
      for (const [x, y] of ring(2, 0.7, 0.9, 66)) { P('shrub_a', x, y, 0, { sp: 'berry', k: 1.1 }); forage.push({ x: Math.round(x), y: Math.round(y + 18), k: 'berries', clearing: 1 }); }
    } else if (kind === 'stumps') {
      for (const [x, y] of ring(5, 0.2, 0.75, 10)) P('rwstump', x, y, 14);
      for (const [x, y] of ring(2, 0.35, 0.7, 20)) P('log', x, y, 0, { a: Math.round(h(Math.round(x) & 127) * 314) / 100, len: 110 + Math.round(h(Math.round(y) & 127) * 60), moss: 1 });
      // the fairy ring: second-growth redwoods round the oldest stump, at the clearing's edge
      const [fx, fy] = ring(1, 0.8, 0.9, 30)[0];
      P('rwstump', fx, fy, 16);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + h(31), r = 70; P('redwood', fx + Math.cos(a) * r, fy + Math.sin(a) * r * 0.85, 16, { sp: 'redwood2', k: 1 }); }
      for (const [x, y] of ring(6, 0.1, 0.8, 40)) P('shrub_a', x, y, 0, { sp: h(Math.round(x) & 255) < 0.5 ? 'fern' : 'bracken', k: 1 });
      for (const [x, y] of ring(3, 0.2, 0.7, 50)) forage.push({ x: Math.round(x), y: Math.round(y + 22), k: h(Math.round(x) & 255) < 0.6 ? 'goldTrumpet' : 'ghostglass', clearing: 1 });
    } else {
      // the windfall: a giant down across the gap, its root plate reared up at its foot
      const len = 300 + Math.round(h(10) * 80), a = (h(11) - 0.5) * 0.5, lx = X, ly = Y - TILE;
      P('rwlog', lx, ly, 0, { len, flip: h(12) < 0.5 });
      if (m.addSolidProp) for (const k of [-0.4, -0.2, 0, 0.2, 0.4]) m.addSolidProp(lx + len * k, ly, 14);
      P('rootplate', lx + (h(12) < 0.5 ? -1 : 1) * (len / 2 + 20), ly + 6, 18);
      for (let k = 0; k < 4; k++) P('tree_b', lx - len * 0.35 + k * len * 0.23, ly - 10, 0, { sp: 'mtnFir', k: 0.4 + h(13 + k) * 0.15 });   // (seedlings on the nurse log)
      for (let k = 0; k < 4; k++) forage.push({ x: Math.round(lx - len * 0.3 + k * len * 0.2 + (h(20 + k) - 0.5) * 16), y: Math.round(ly + 26), k: 'shelfOyster', clearing: 1 });
      for (const [x, y] of ring(6, 0.3, 0.85, 30)) P('shrub_a', x, y, 0, { sp: 'fern', k: 1.1 });
      for (const [x, y] of ring(4, 0.2, 0.7, 40)) P('flowers_a', x, y, 0, { sp: 'foxglove', k: 1 });
      void a;
    }
    const site = { kind: 'clearing', type: kind, name: c.name, x: Math.round(X), y: Math.round(Y), r: Math.round(R * TILE), onTrail: !!c.on };
    m.natureSites.push(site);
    (m.landmarks ||= []).push({ name: c.name, type: 'clearing', x: Math.round(X - R * TILE), y: Math.round(Y - R * TILE), w: R * 2 * TILE, h: R * 2 * TILE });
    out.clearings.push(site);
  }
  if (drop.size && H3.removeProps) { const before = m.props.length; H3.removeProps(m, (x, y) => drop.has(x + ',' + y)); out.cleared = before - m.props.length; }
  const LIES = /^(tree_|redwood|shrub_|bush_|rwstump|rwlog|log$|boulder|rootplate)/;
  for (const [t, x, y, r, ex] of props) { if (LIES.test(t) && onTrail(x, y, 1.5 * TILE)) { out.offTrail = (out.offTrail || 0) + 1; continue; } H3.addProp(m, t, x, y, r, ex); }
  return out;
}

// The woods' finds in sight (the camera looks north: what stands south of a spot, up to its height, is drawn over it):
// a giant redwood's trunk hides what's just behind it, its crown what's further back; a pine the same, smaller. Each
// spot hidden so is moved to the nearest open ground within a few tiles that nothing hides; with none, it's left out.
const COVER = { giantL: [70, 770, 125], giant: [54, 660, 105], giantS: [40, 555, 88], redwood2: [16, 365, 50] };   // (trunk half-width, height, crown half-width - px: client/art2/game/statics.js)
export function forageInSight3(m) {
  const out = { moved: 0, dropped: 0, seen: 0 };
  const list = m.forage || [];
  if (!list.length) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  // the tall things by 8-tile cell: [x, y, trunk half-width, height, crown half-width]
  const G = new Map(), GC = 8 * TILE;
  for (const p of m.props) {
    if (!p) continue;
    const c = p.t === 'redwood' ? COVER[p.sp] || COVER.giant : p.t === 'tree_a' || p.t === 'tree_b' ? [12, 190, 46] : null;
    if (!c) continue;
    const s = p.k && p.t === 'redwood' ? Math.min(1, p.k) : 1, e = [p.x, p.y, c[0] * s, c[1] * s, c[2] * s];
    const k = Math.floor(p.x / GC) * 65536 + Math.floor(p.y / GC); let a = G.get(k); if (!a) G.set(k, (a = [])); a.push(e);
  }
  const hidden = (x, y) => {
    for (let cy = Math.floor(y / GC); cy <= Math.floor((y + 800) / GC); cy++) for (let cx = Math.floor((x - 140) / GC); cx <= Math.floor((x + 140) / GC); cx++) for (const [tx, ty, tw, th, cw] of G.get(cx * 65536 + cy) || []) {
      const dy = ty - y, dx = Math.abs(tx - x);
      if (dy <= -6 || dy > th) continue;
      if (dy < th * 0.42 ? dx < tw + 10 : dx < cw) return true;
    }
    return false;
  };
  const open = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); if (!inF(tx, ty)) return false; const t = m.tiles[idx(tx, ty)]; return t === T.GRASS || t === T.DIRT; };
  const keep = [];
  for (const f of list) {
    const tx = Math.floor(f.x / TILE), ty = Math.floor(f.y / TILE);
    if (!inF(tx, ty) || m.dist[idx(tx, ty)] !== D_WOODS || f.k === 'goldStar') { keep.push(f); continue; }
    if (!hidden(f.x, f.y)) { keep.push(f); out.seen++; continue; }
    let to = null;
    for (let r = 32; r <= 256 && !to; r += 32) for (let k = 0; k < 12 && !to; k++) {
      const a = (k / 12) * Math.PI * 2 + hh(tx, ty, r) * 0.5, x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r;
      if (open(x, y) && !hidden(x, y)) to = [Math.round(x), Math.round(y)];
    }
    if (to) { keep.push({ ...f, x: to[0], y: to[1] }); out.moved++; } else out.dropped++;
  }
  m.forage = keep;
  return out;
}
