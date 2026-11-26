// The woods' and the meadows' found places (the art pass, 2026-11-24; concepts NS1-B "pine and oak set pieces" and NS1-E
// "meadow and farm set pieces"; the nature audit of 11-21: "the small found places ... outside Highland Woods", "placed
// by rule through every stretch of that biome"). Little scenes come across a short walk off a trail or a road, never
// on one, each a few props that belong together:
//   in the pine and oak woods   the ruins of a house (an L of wall, ivy, fallen blocks), an old oak with a bench and a
//                               fingerpost, a fire ring with log seats, a mossy log with ferns and its mushrooms;
//   in the valley's meadows     a run of dry-stone wall with a field gate, the same with a stile through it and berry
//                               bushes, an oak with a rope swing, a row of beehives by sunflowers, a windmill and its
//                               trough.
//   in the Red Rock Desert      (11-25, NS1-C and NR1-B "desert set pieces", "sandstone desert rocks") a cracked
//                               playa with a dead snag, a stand of hoodoos, saguaros round a rock pile, joshua
//                               trees among boulders, a tin shack with a rusted pickup. On its bare dirt (not the sand sheets), level, off the tables.
// The pieces drawn for them on 11-21 and never placed (client/art2/props-rural.js: dryStoneWall, fieldGate, stile,
// ropeSwing, woodRuins) are world props here - 'ruins', 'drywall', 'fgate', 'stile', 'rswing' (statics.js draws them) -
// solid by the world's own circles. (shared/naturesites.js waysideFinds did this for the first city's districts: its
// table names none of World v3's, so the whole world had not one.)
// For the whole-world build only (shared/world3-world.js, after the places made by hand, so a find keeps off them all).
// Deterministic: integer hashes; Math's trig only inside generateCity (withDeterministicMath).
import { TILE, T } from './constants.js';
import { terrainAt, reliefMetres } from './mapcore.js';

const RES = 32;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const WAYSIDE = {
  step: 7,            // a candidate every `step` tiles, jittered
  apart: 36,          // two finds at least this far apart (tiles)
  off: [6, 56],       // tiles from the nearest trail or road: a short walk off it
  R: 4,               // a find's ground, tiles round its middle
  by: {               // district: how many, and what (in turn, so a district has each kind before a second of any)
    47: { n: 18, set: 'woods', kinds: ['ruins', 'oakbench', 'firering', 'mushlog'] },   // Highland Woods (Egret Coast has no pine and oak ground that fits: its own finds come with the coast)
    49: { n: 16, set: 'valley', kinds: ['drywall', 'oakswing', 'apiary', 'stilewall', 'windpump'] },   // Willow Valley
    50: { n: 30, set: 'desert', kinds: ['playa', 'hoodoos', 'saguaros', 'joshuas', 'tinshack'] },   // the Red Rock Desert
  },
};
const VEG = /^(tree_|redwood|shrub_|bush_|flowers_|rwstump|rwlog|log$|fern|gnaw|boulder$|cactus$)/, TALL = /^(tree_|redwood)/;   // (what grows or lies wild: a find clears it from its ground)
const HARD = new Set([T.ROAD, T.BRIDGE, T.LOT, T.BUILDING, T.WALL, T.WATER, T.DEEP, T.SIDEWALK, T.PLAZA, T.DOCK, T.FIELD]);

export function buildWayside3(m, H3) {
  const out = { finds: [], by: {}, cleared: 0 };
  if (!H3 || !H3.addProp) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x, R = WAYSIDE.R;
  // where the ways are: road tiles and the trails' points, by 8-tile cell
  const CG = 8, GW = Math.ceil(W / CG), GH = Math.ceil(HH / CG), way = new Uint8Array(GW * GH);
  for (let y = 0; y < HH; y += 2) for (let x = 0; x < W; x += 2) if (m.tiles[idx(x, y)] === T.ROAD) way[Math.floor(y / CG) * GW + Math.floor(x / CG)] = 1;
  const trails = (m.natureSites || []).filter((s) => s.kind === 'trail' && s.line);
  for (const t of trails) for (let k = 1; k < t.line.length; k++) {
    const [ax, ay] = t.line[k - 1], [bx, by] = t.line[k], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (CG * TILE / 2)));
    for (let q = 0; q <= n; q++) { const x = Math.floor((ax + (bx - ax) * q / n) / TILE / CG), y = Math.floor((ay + (by - ay) * q / n) / TILE / CG); if (x >= 0 && y >= 0 && x < GW && y < GH) way[y * GW + x] = 1; }
  }
  const wayD = (tx, ty) => { let bd = 1e9; const cx = Math.floor(tx / CG), cy = Math.floor(ty / CG), r = Math.ceil(WAYSIDE.off[1] / CG) + 1; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= GW || y >= GH || !way[y * GW + x]) continue; const d = Math.hypot((x + 0.5) * CG - tx, (y + 0.5) * CG - ty); if (d < bd) bd = d; } return bd; };
  // what to keep off: every place with a name or a site of its own, and the trails' and roads' own ground
  const keep = [];
  for (const s of m.natureSites || []) if (s.kind !== 'trail' && Number.isFinite(s.x)) keep.push([s.x / TILE, s.y / TILE, (s.r ? s.r / TILE : 8) + 14]);
  for (const l of m.landmarks || []) keep.push([(l.x + l.w / 2) / TILE, (l.y + l.h / 2) / TILE, Math.max(l.w, l.h) / 2 / TILE + 12]);
  for (const s of m.countrySites || []) if (Number.isFinite(s.x)) keep.push([(s.x + (s.w || 0) / 2) / TILE, (s.y + (s.h || 0) / 2) / TILE, Math.max(s.w || 0, s.h || 0) / 2 / TILE + 12]);
  // (the orchards and the crop rows are grass too: their own ground, and four tiles round it)
  const farms = (m.orchards || []).map((o) => [o.x / TILE - R - 4, o.y / TILE - R - 4, (o.x + o.w) / TILE + R + 4, (o.y + o.h) / TILE + R + 4]);
  const KG = 32, kgrid = new Map();
  for (const k of keep) { const r = Math.ceil(k[2] / KG); for (let cy = Math.floor(k[1] / KG) - r; cy <= Math.floor(k[1] / KG) + r; cy++) for (let cx = Math.floor(k[0] / KG) - r; cx <= Math.floor(k[0] / KG) + r; cx++) { const key = cx * 4096 + cy; let a = kgrid.get(key); if (!a) kgrid.set(key, (a = [])); a.push(k); } }
  const kept = (tx, ty) => { for (const [x, y, r] of kgrid.get(Math.floor(tx / KG) * 4096 + Math.floor(ty / KG)) || []) if (Math.hypot(x - tx, y - ty) < r) return true; for (const [x0, y0, x1, y1] of farms) if (tx >= x0 && ty >= y0 && tx <= x1 && ty <= y1) return true; return false; };
  // the growth, by 8-tile cell: what a find clears, and what tells a redwood grove from the pine and oak woods
  const VC = 8 * TILE, vgrid = new Map();
  // (...and everything else that stands anywhere: a fence, a pole, a crop row, a hive - a find keeps off what is made)
  const made = new Map();
  for (const p of m.props) { if (!p || p.t === 'painted') continue; const g = VEG.test(p.t) ? vgrid : made, k = Math.floor(p.x / VC) * 65536 + Math.floor(p.y / VC); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(p); }
  const madeNear = (x, y, r) => { for (let cy = Math.floor((y - r) / VC); cy <= Math.floor((y + r) / VC); cy++) for (let cx = Math.floor((x - r) / VC); cx <= Math.floor((x + r) / VC); cx++) for (const p of made.get(cx * 65536 + cy) || []) if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) return true; return false; };
  const around = (x, y, r, fn) => { for (let cy = Math.floor((y - r) / VC); cy <= Math.floor((y + r) / VC); cy++) for (let cx = Math.floor((x - r) / VC); cx <= Math.floor((x + r) / VC); cx++) for (const p of vgrid.get(cx * 65536 + cy) || []) fn(p); };
  const TC = m.terrainCls;
  const fits = (tx, ty, d, set) => {
    let lo = 1e9, hi = -1e9;
    for (let dy = -R - 3; dy <= R + 3; dy++) for (let dx = -R - 3; dx <= R + 3; dx++) {
      if (!inF(tx + dx, ty + dy)) return false;
      const i = idx(tx + dx, ty + dy), t = m.tiles[i];
      if (HARD.has(t)) return false;
      if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
      if (m.dist[i] !== d || t !== (set === 'desert' ? T.DIRT : T.GRASS) || !m.land[i] || (m.reserve[i] & ~128) || (m.bld && m.bld[i] >= 0)) return false;
      if (m.relief) { const r = reliefMetres(m.relief[i]); if (r < lo) lo = r; if (r > hi) hi = r; }
    }
    if (m.relief && hi - lo > 8) return false;   // (level ground: a wall, a bench, a fire ring)
    if (madeNear((tx + 0.5) * TILE, (ty + 0.5) * TILE, (R + 4) * TILE)) return false;
    // (the ground that grows there - 1 grass, 2 forest: a wall and a windmill stand in open meadow, not in the valley's
    // thickets; the woods' finds under trees)
    if (set === 'desert') return true;   // (bare dirt of the desert's own district: nothing more to ask)
    if (TC) for (const [dx, dy] of [[0, 0], [-R, -R], [R, -R], [-R, R], [R, R]]) if (terrainAt(TC.cls, TC.cw, tx + dx, ty + dy) !== (set === 'woods' ? 2 : 1)) return false;
    let trees = 0, red = 0;
    around((tx + 0.5) * TILE, (ty + 0.5) * TILE, 10 * TILE, (p) => { if (TALL.test(p.t)) { trees++; if (p.t === 'redwood' || /^(giant|redwood)/.test(p.sp || '')) red++; } });
    return set === 'woods' ? trees >= 6 && red * 5 <= trees : red === 0;   // (the woods' finds among pine and oak, not in a redwood grove - those are NS1-A's, the redwood step)
  };
  // the candidates, district by district, in an order of their own
  const cands = new Map();
  for (let ty = R + 4; ty < HH - R - 4; ty += WAYSIDE.step) for (let tx = R + 4; tx < W - R - 4; tx += WAYSIDE.step) {
    const jx = tx + Math.floor(hh(tx, ty, 9101) * 5) - 2, jy = ty + Math.floor(hh(tx, ty, 9102) * 5) - 2, d = m.dist[idx(jx, jy)], D = WAYSIDE.by[d];
    if (!D || m.tiles[idx(jx, jy)] !== (D.set === 'desert' ? T.DIRT : T.GRASS) || kept(jx, jy)) continue;
    let a = cands.get(d); if (!a) cands.set(d, (a = []));
    a.push({ tx: jx, ty: jy, h: hh(jx, jy, 9103) });
  }
  const chosen = [];
  for (const d of Object.keys(WAYSIDE.by).map(Number)) {
    const D = WAYSIDE.by[d], list = (cands.get(d) || []).sort((a, b) => a.h - b.h || a.tx - b.tx || a.ty - b.ty);
    let n = 0;
    for (const c of list) {
      if (n >= D.n) break;
      if (chosen.some((q) => Math.hypot(q.tx - c.tx, q.ty - c.ty) < WAYSIDE.apart)) continue;
      const wd = wayD(c.tx, c.ty);
      if (wd < WAYSIDE.off[0] || wd > WAYSIDE.off[1] || !fits(c.tx, c.ty, d, D.set)) continue;
      chosen.push({ ...c, d, kind: D.kinds[n % D.kinds.length], k: n });
      n++;
    }
    out.by[d] = n;
  }
  // built: the growth off its ground and the tall trees just south of it (in this view they would stand in front), its
  // ground kept from the undergrowth, then its props
  const drop = new Set(), props = [], P = (t, x, y, r = 0, ex = null) => props.push([t, Math.round(x), Math.round(y), r, ex]);
  const solid = (x, y, r) => { if (m.addSolidProp) m.addSolidProp(Math.round(x), Math.round(y), r); };
  const forage = (m.forage ||= []);
  for (const c of chosen) {
    const { tx, ty, kind } = c, X = (tx + 0.5) * TILE, Y = (ty + 0.5) * TILE, h = (k) => hh(tx, ty, 9200 + k), pick = (a, k) => a[Math.floor(h(k) * a.length) % a.length];
    around(X, Y, (R + 1) * TILE, (p) => { if (Math.abs(p.x - X) < (R + 0.4) * TILE && Math.abs(p.y - Y) < (R + 0.4) * TILE) drop.add(p.x + ',' + p.y); });
    around(X, Y + 6 * TILE, 6 * TILE, (p) => { if (TALL.test(p.t) && Math.abs(p.x - X) < (R + 0.5) * TILE && p.y > Y && p.y < Y + 9 * TILE) drop.add(p.x + ',' + p.y); });
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) m.reserve[idx(tx + dx, ty + dy)] |= RES;
    // (a patch of trodden earth, ragged, r tiles round (ox, oy) tiles off the middle)
    const earth = (ox, oy, r) => { for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) { const rr = r * (0.75 + 0.35 * hh(tx + dx, ty + dy, 9301)); if (dx * dx + dy * dy <= rr * rr) m.tiles[idx(tx + ox + dx, ty + oy + dy)] = T.DIRT; } };
    // (a run of dry-stone wall west to east through (X, y), `len` px long, a gap `gap` px wide at its middle)
    const wall = (y, len, gap) => {
      const half = (len - gap) / 2, n = Math.max(1, Math.round(half / 80)), pl = half / n;
      for (const sd of [-1, 1]) for (let q = 0; q < n; q++) {
        const cx = X + sd * (gap / 2 + pl * (q + 0.5));
        P('drywall', cx, y, 0, { len: Math.round(pl) + 4, v: Math.floor(h(40 + q + (sd > 0 ? 8 : 0)) * 6) });
        for (let sx = -pl / 2 + 8; sx <= pl / 2 - 8 + 0.01; sx += 16) solid(cx + sx, y, 10);
      }
    };
    switch (kind) {
      case 'ruins':   // (NS1-B: what is left of a house in the woods)
        P('ruins', X, Y - 8, 0, { v: Math.floor(h(1) * 3) });
        // (its walls solid, as the model stands them - props-rural.js woodRuins at statics.js RUINS_K, a voxel 2 px, its
        // middle the prop's: the back wall either side of its doorway, the side wall down from the corner)
        for (const [ox, oy] of [[-62, -50], [-46, -50], [-2, -50], [14, -50], [30, -50], [46, -50], [50, -36], [50, -20], [50, -4], [50, 12], [50, 26]]) solid(X + ox, Y - 8 + oy, 8);
        for (let k = 0; k < 3; k++) P('boulder', X + (k - 1) * 96 + (h(10 + k) - 0.5) * 26, Y + 70 + (h(13 + k) - 0.5) * 30, 10, { s: 14 + Math.round(h(16 + k) * 10), moss: 1 });
        for (let k = 0; k < 5; k++) P('shrub_a', X - 96 + k * 46 + (h(20 + k) - 0.5) * 20, Y - 62 + (h(25 + k) < 0.5 ? 0 : 118) + (h(30 + k) - 0.5) * 16, 0, { sp: h(35 + k) < 0.6 ? 'fern' : 'bracken', k: 1.05 });
        for (let k = 0; k < 2; k++) P('flowers_a', X - 70 + k * 150 + (h(50 + k) - 0.5) * 20, Y + 10 + (h(52 + k) - 0.5) * 40, 0, { sp: 'foxglove', k: 1 });
        break;
      case 'oakbench':   // (NS1-B: the old oak, a bench under it, a fingerpost)
        earth(0, 1, 2.2);
        P('tree_b', X - 26, Y - 22, 12, { sp: 'oak', k: 1.55 });
        P('pbench', X + 34, Y + 14, 8, { a: 0 });
        P('fingerpost', X + 76, Y + 2, 4);
        P('boulder', X - 84, Y + 34, 12, { s: 22, moss: 1 }); P('boulder', X - 62, Y + 46, 0, { s: 10, moss: 1 });
        for (let k = 0; k < 3; k++) P('flowers_a', X - 96 + k * 86 + (h(10 + k) - 0.5) * 24, Y + 74 + (h(13 + k) - 0.5) * 20, 0, { sp: pick(['daisies', 'lupines', 'buttercups'], 16 + k), k: 1 });
        break;
      case 'firering': {   // (NS1-B: a ring of stones, log seats round it, boulders)
        earth(0, 0, 2.6);
        P('campfire', X, Y, 8, { lit: false });
        for (let k = 0; k < 3; k++) { const a = h(1) * 6.283 + k * 2.2, x = X + Math.cos(a) * 46, y = Y + Math.sin(a) * 38; P('log', x, y, 9, { len: 34, a: Math.round((a + 1.571) * 100) / 100, moss: 0 }); }
        for (let k = 0; k < 4; k++) { const a = h(2) * 6.283 + k * 1.571 + 0.6, x = X + Math.cos(a) * 92, y = Y + Math.sin(a) * 74; P('boulder', x, y, 12, { s: 18 + Math.round(h(10 + k) * 14), moss: h(14 + k) < 0.5 ? 1 : 0 }); }
        P('woodpile', X + 86, Y - 60, 8);
        for (let k = 0; k < 3; k++) P('shrub_a', X - 100 + k * 96 + (h(20 + k) - 0.5) * 20, Y - 104 + (h(23 + k) - 0.5) * 12, 0, { sp: 'fern', k: 1 });
        break;
      }
      case 'mushlog': {   // (NS1-B: a mossy log in a sunlit glade, ferns along it, its mushrooms)
        const len = 120 + Math.round(h(1) * 40), a = (h(2) - 0.5) * 0.7, ca = Math.cos(a), sa = Math.sin(a);
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R) m.reserve[idx(tx + dx, ty + dy)] |= 128;   // (sunlit grass where the canopy's open)
        P('log', X, Y, 0, { len, a: Math.round(a * 100) / 100, moss: 1 });
        for (const q of [-0.36, -0.12, 0.12, 0.36]) solid(X + ca * len * q, Y + sa * len * q, 9);
        P('boulder', X + ca * (len / 2 + 30), Y + sa * (len / 2 + 30) - 6, 10, { s: 16, moss: 1 });
        for (let k = 0; k < 5; k++) { const q = (k - 2) / 5; P('shrub_a', X + ca * len * q + (h(10 + k) - 0.5) * 14, Y + sa * len * q + (k % 2 ? 30 : -34), 0, { sp: 'fern', k: 1.05 }); }
        for (let k = 0; k < 2; k++) forage.push({ x: Math.round(X + ca * len * (k ? 0.22 : -0.2)), y: Math.round(Y + sa * len * (k ? 0.22 : -0.2) + 20), k: k ? 'shelfOyster' : 'goldTrumpet', wayside: 1 });
        P('tree_b', X - 110, Y - 70, 0, { sp: 'sapling', k: 1 });
        break;
      }
      case 'drywall': case 'stilewall': {   // (NS1-E: a dry-stone wall across the meadow, a field gate in it - or a stile through it, berry bushes along it)
        const gate = kind === 'drywall', gap = gate ? 60 : 36;
        wall(Y, 2 * R * TILE - 8, gap);
        if (gate) { P('fgate', X, Y, 0); for (const sx of [-22, -8, 8, 22]) solid(X + sx, Y, 7); P('fingerpost', X + 46, Y + 40, 4); }
        else { P('stile', X, Y + 2, 0); for (let k = 0; k < 4; k++) P('shrub_a', X + (k < 2 ? -1 : 1) * (58 + (k % 2) * 44) + (h(10 + k) - 0.5) * 10, Y + 34 + (h(14 + k) - 0.5) * 8, 0, { sp: 'berry', k: 1.1 }); }
        for (let dy = -3; dy <= 3; dy++) if (dy !== 0 && hh(tx, ty + dy, 9302) < 0.85) m.tiles[idx(tx, ty + dy)] = T.DIRT;   // (the path worn up to it and on beyond)
        for (let k = 0; k < 4; k++) P('flowers_a', X - 104 + k * 70 + (h(20 + k) - 0.5) * 20, Y + 44 + (h(24 + k) - 0.5) * 10, 0, { sp: pick(['daisies', 'poppies', 'lupines', 'buttercups'], 28 + k), k: 1 });
        break;
      }
      case 'oakswing':   // (NS1-E: an oak with a rope swing, a stone to sit on)
        earth(1, 1, 1.4);
        P('tree_b', X - 6, Y - 14, 12, { sp: 'oak', k: 1.6 });
        P('rswing', X + 36, Y - 8, 0, { side: 1 });
        P('boulder', X - 64, Y + 30, 10, { s: 16 });
        for (let k = 0; k < 3; k++) P('flowers_a', X - 90 + k * 84 + (h(10 + k) - 0.5) * 24, Y + 70 + (h(13 + k) - 0.5) * 20, 0, { sp: pick(['daisies', 'clover', 'buttercups'], 16 + k), k: 1 });
        break;
      case 'apiary':   // (NS1-E: beehives in a row, sunflowers behind them)
        for (let k = 0; k < 3; k++) P('beehive', X - 40 + k * 40, Y + 6, 7, { v: k % 3 });
        for (let k = 0; k < 4; k++) P('flowers_a', X - 66 + k * 44, Y - 30, 0, { sp: 'sunflowers', k: 1 });
        P('fruitcrate', X + 84, Y + 18, 6);
        for (let k = 0; k < 3; k++) P('flowers_a', X - 80 + k * 80 + (h(10 + k) - 0.5) * 20, Y + 60 + (h(13 + k) - 0.5) * 16, 0, { sp: pick(['lupines', 'daisies', 'poppies'], 16 + k), k: 1 });
        break;
      case 'playa': {   // (NS1-C: a pan of cracked mud, a dead snag at its edge, tumbleweed blown onto it - the ground bake paints the pan from m.tinajas, as a seep's ring)
        (m.tinajas ||= []).push({ x: Math.round(X), y: Math.round(Y), r: 0, ring: Math.round(2.9 * TILE), k: 1 });
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= 12) m.reserve[idx(tx + dx, ty + dy)] |= 192;   // (nothing grows on the pan)
        P('tree_a', X - 100 + h(1) * 30, Y - 84, 8, { sp: 'deadSnag', k: 1.1 });
        for (let k = 0; k < 3; k++) { const a = h(2) * 6.283 + k * 2.1; P('shrub_a', X + Math.cos(a) * (50 + h(10 + k) * 40), Y + Math.sin(a) * (40 + h(13 + k) * 30), 0, { sp: 'tumble', k: 1 }); }
        for (let k = 0; k < 3; k++) { const a = h(3) * 6.283 + k * 2.3 + 1; P('boulder', X + Math.cos(a) * 116, Y + Math.sin(a) * 100, 9, { s: 12 + Math.round(h(16 + k) * 8) }); }
        break;
      }
      case 'hoodoos': {   // (NR1-B: a stand of hoodoos - banded columns under their caps, props-desert.js -, as the five by the arch: world3-desert.js)
        const n = 3 + Math.floor(h(1) * 2);
        for (let k = 0; k < n; k++) { const x = X - 70 + k * (140 / (n - 1)) + (h(10 + k) - 0.5) * 22, y = Y - 20 + (k % 2 ? 34 : 0) + (h(14 + k) - 0.5) * 16; P('hoodoo', x, y, 13, { h: 60 + Math.round(h(18 + k) * 4) * 10, s: k + Math.floor(h(22 + k) * 4) }); }
        for (let k = 0; k < 4; k++) P('boulder', X - 96 + k * 64 + (h(30 + k) - 0.5) * 20, Y + 76 + (h(34 + k) - 0.5) * 20, 9, { s: 12 + Math.round(h(38 + k) * 10) });
        for (let k = 0; k < 3; k++) P('shrub_a', X - 90 + k * 90 + (h(40 + k) - 0.5) * 20, Y - 84 + (h(43 + k) - 0.5) * 14, 0, { sp: k === 1 ? 'brittle' : 'sage', k: 1 });
        break;
      }
      case 'saguaros':   // (NS1-C: saguaros round a pile of rock, barrel cactus and prickly pear at its foot)
        P('outcrop', X + 6, Y - 6, 22, { w: 64, d: 46, h: 34, s: 80 + Math.floor(h(1) * 60), style: 'sandstone' });
        P('cactus', X - 76, Y - 30, 7, { sp: 'saguaroBig', k: 1.1 }); P('cactus', X + 84, Y - 12, 7, { sp: 'saguaroBig', k: 1 }); P('cactus', X - 58, Y + 44, 6, { sp: 'saguaroMid', k: 1 });
        for (let k = 0; k < 3; k++) P('cactus', X - 30 + k * 44 + (h(10 + k) - 0.5) * 16, Y + 58 + (h(13 + k) - 0.5) * 14, 5, { sp: k === 1 ? 'pear' : 'barrel', k: 1 });
        for (let k = 0; k < 2; k++) P('shrub_a', X - 100 + k * 196, Y + 84 + (h(20 + k) - 0.5) * 16, 0, { sp: 'dryGrass', k: 1 });
        break;
      case 'joshuas':   // (NS1-C: joshua trees among boulders, dry grass and a yucca)
        P('tree_a', X - 56, Y - 34, 8, { sp: 'joshua', k: 1.3 }); P('tree_a', X + 60, Y - 8, 8, { sp: 'joshua', k: 1.1 }); if (h(1) < 0.6) P('tree_a', X - 4, Y - 78, 8, { sp: 'joshua', k: 0.95 });
        for (let k = 0; k < 3; k++) P('boulder', X - 90 + k * 84 + (h(10 + k) - 0.5) * 26, Y + 50 + (h(13 + k) - 0.5) * 24, 10, { s: 14 + Math.round(h(16 + k) * 12) });
        P('cactus', X + 10, Y + 22, 5, { sp: 'yucca', k: 1 });
        for (let k = 0; k < 3; k++) P('shrub_a', X - 100 + k * 96 + (h(20 + k) - 0.5) * 20, Y + 96 + (h(23 + k) - 0.5) * 12, 0, { sp: 'dryGrass', k: 1 });
        break;
      case 'tinshack': {   // (NS1-C: a tin shack somebody left, a rusted pickup where it stopped, drums and tyres - props-desert.js)
        const sx = X - 20, sy = Y - 30, a = (h(1) < 0.5 ? 0.5 : 2.7) + (h(2) - 0.5) * 0.5, px = X + 50, py = Y + 56, ca = Math.cos(a), sa = Math.sin(a);
        P('tinshack', sx, sy, 0, { s: Math.floor(h(3) * 3) });
        for (const ox of [-52, -34, -16, 2, 20]) for (const oy of [-24, -4, 16]) solid(sx + ox, sy + oy, 12);   // (its walls: the body stands west of the model's middle - x -62..34, y -34..28 of it -, the lean-to open)
        P('rustpickup', px, py, 0, { a: Math.round(a * 100) / 100 });
        for (const q of [-28, 0, 28]) solid(px + ca * q, py + sa * q, 15);
        P('drum', X - 84, Y + 2, 7); P('drum', X - 96, Y + 16, 7); P('tires', X - 60, Y + 40, 8);
        P('tree_a', X + 96, Y - 70, 8, { sp: 'deadSnag', k: 1 });
        for (let k = 0; k < 3; k++) P('shrub_a', X - 100 + k * 60 + (h(10 + k) - 0.5) * 20, Y + 92 + (h(13 + k) - 0.5) * 12, 0, { sp: k === 1 ? 'tumble' : 'dryGrass', k: 1 });
        break;
      }
      case 'windpump':   // (NS1-E: a windmill over its trough, the ground trodden round it)
        earth(0, 1, 2);
        P('windmill', X - 20, Y - 16, 10);
        P('trough', X + 34, Y + 14, 9);
        P('boulder', X - 78, Y + 40, 10, { s: 16 });
        for (let k = 0; k < 2; k++) P('flowers_a', X - 60 + k * 150 + (h(10 + k) - 0.5) * 20, Y + 80, 0, { sp: 'tallGrass', k: 1 });
        break;
    }
    const site = { kind: 'wayside', type: kind, x: Math.round(X), y: Math.round(Y), r: R * TILE, d: c.d };
    m.natureSites.push(site);
    out.finds.push(site);
  }
  if (drop.size && H3.removeProps) { const before = m.props.length; H3.removeProps(m, (x, y) => drop.has(x + ',' + y)); out.cleared = before - m.props.length; }
  for (const [t, x, y, r, ex] of props) H3.addProp(m, t, x, y, r, ex);
  return out;
}
