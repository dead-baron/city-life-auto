// Willow Valley's farm ponds (the nature program, 2026-10-20; the handcraft research's 4.4 and the concepts NS1-E,
// SC3-E and WC191: "farm ponds with jetty and rowboat and windmill tanks", "a reedy pond with lily pads, a small jetty,
// willows"). Out in the valley's pastures, away from the fields, the farmyards and the roads, a few ponds dug where the
// grass lies level, each named on the map: a round of still water, its rim wavering; reeds and cattails round
// part of its rim, lily pads out on it, a willow leaning over it; a plank jetty out from its south bank (a rowboat tied
// up at some), a bench; by some a windmill pump and its trough. The water is a pond's (m.lake 2: the fishing's pond -
// bluegill, bass, carp - and the fish seen in it).
// For the whole-world build only (shared/world3-world.js's done hook, after Kestrel Lake's). Deterministic:
// arithmetic and integer hashes.
import { TILE, T } from './constants.js';

const RES = 32, D_VALLEY = 49;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const FARMPONDS = {
  box: [2700, 700, 4300, 1700],   // (tiles: the valley's extent to search)
  n: 6, step: 10, spacing: 130, r: [6, 10], clear: 12, road: 22, flat: 4,
  names: ['Mill Pond', 'Heron Pond', 'Cattail Pond', 'Clover Pond', 'Bullfrog Pond', 'Duck Pond', 'Willow Pond'],
};
const VEG = /^(tree_|shrub_|bush_|flowers_|log$|boulder)/;

export function farmPonds3(m, H3) {
  const out = { ponds: [], missed: 0 };
  if (!H3 || !H3.addProp || !m.lake) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const F = FARMPONDS, props = [], P = (t, x, y, r = 0, ex = null) => props.push([t, Math.round(x), Math.round(y), r, ex]);
  const drop = new Set();
  const grass = (i) => m.dist[i] === D_VALLEY && m.land[i] && m.tiles[i] === T.GRASS && !(m.reserve[i] & ~(128 | 4)) && (m.bld ? m.bld[i] < 0 : true);
  const hard = (t) => t === T.ROAD || t === T.BUILDING || t === T.SIDEWALK || t === T.LOT || t === T.PLAZA || t === T.BRIDGE || t === T.DOCK || t === T.WATER || t === T.DEEP || t === T.FIELD || t === T.WALL;
  // the roads, buildings, fields and water by 8-tile cell (kept clear of)
  const hardCell = new Set();
  for (let ty = Math.max(0, F.box[1] - 30); ty < Math.min(HH, F.box[3] + 30); ty++) for (let tx = Math.max(0, F.box[0] - 30); tx < Math.min(W, F.box[2] + 30); tx++) { const t = m.tiles[idx(tx, ty)]; if (t === T.ROAD || t === T.BUILDING || t === T.LOT || t === T.WATER || t === T.DEEP) hardCell.add(Math.floor(tx / 8) * 4096 + Math.floor(ty / 8)); }
  const nearHard = (tx, ty, r) => { const c = Math.ceil(r / 8); for (let dy = -c; dy <= c; dy++) for (let dx = -c; dx <= c; dx++) if (hardCell.has((Math.floor(tx / 8) + dx) * 4096 + Math.floor(ty / 8) + dy)) return true; return false; };
  const places = (m.landmarks || []).map((l) => [(l.x + l.w / 2) / TILE, (l.y + l.h / 2) / TILE, Math.max(l.w, l.h) / 2 / TILE]);
  const VC = 8 * TILE, vgrid = new Map();
  for (const p of m.props) if (p && VEG.test(p.t)) { const k = Math.floor(p.x / VC) * 65536 + Math.floor(p.y / VC); let a = vgrid.get(k); if (!a) vgrid.set(k, (a = [])); a.push(p); }
  const clearVeg = (x, y, r) => { for (let cy = Math.floor((y - r) / VC); cy <= Math.floor((y + r) / VC); cy++) for (let cx = Math.floor((x - r) / VC); cx <= Math.floor((x + r) / VC); cx++) for (const p of vgrid.get(cx * 65536 + cy) || []) if (Math.hypot(p.x - x, p.y - y) < r) drop.add(p.x + ',' + p.y); };
  // the candidates: level open grass with room round it, off the roads, the farmyards, the fields and the water
  const cands = [];
  for (let ty = F.box[1]; ty <= F.box[3]; ty += F.step) for (let tx = F.box[0]; tx <= F.box[2]; tx += F.step) {
    const jx = tx + Math.floor(hh(tx, ty, 71) * 6) - 3, jy = ty + Math.floor(hh(tx, ty, 72) * 6) - 3;
    if (!inF(jx, jy) || !grass(idx(jx, jy)) || nearHard(jx, jy, F.road)) continue;
    if (places.some(([x, y, r]) => Math.hypot(x - jx, y - jy) < r + 30)) continue;
    cands.push({ tx: jx, ty: jy, u: hh(jx, jy, 73) });
  }
  cands.sort((a, b) => a.u - b.u);
  const chosen = [];
  for (const c of cands) {
    if (chosen.length >= F.n) break;
    if (chosen.some((q) => Math.hypot(q.tx - c.tx, q.ty - c.ty) < F.spacing)) continue;
    const R = Math.round(F.r[0] + hh(c.tx, c.ty, 74) * (F.r[1] - F.r[0])), C = R + F.clear;
    let ok = true;
    for (let dy = -C; dy <= C && ok; dy++) for (let dx = -C; dx <= C; dx++) { if (dx * dx + dy * dy > C * C) continue; const x = c.tx + dx, y = c.ty + dy; if (!inF(x, y)) { ok = false; break; } const i = idx(x, y); if (hard(m.tiles[i]) || (dx * dx + dy * dy <= (R + 3) * (R + 3) && !grass(i))) { ok = false; break; } }
    if (!ok) continue;
    let lo = 1e9, hi = -1e9;
    if (m.relief) for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) { const r = m.relief[idx(c.tx + dx, c.ty + dy)]; lo = Math.min(lo, r); hi = Math.max(hi, r); }
    if (m.relief && hi - lo > F.flat) continue;
    chosen.push({ ...c, R });
  }
  out.missed = F.n - chosen.length;
  chosen.forEach((c, k) => {
    const { tx, ty, R } = c, X = (tx + 0.5) * TILE, Y = (ty + 0.5) * TILE, h = (n) => hh(tx, ty, 900 + n), name = F.names[k % F.names.length];
    // the water: a ragged round, deep in its middle
    const rim = [];
    for (let dy = -R - 1; dy <= R + 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      // (the rim's radius wavering smoothly round it: six lobes' hashes, eased between)
      const a = Math.atan2(dy, dx), u = ((a + Math.PI) / (Math.PI * 2)) * 6, j = Math.floor(u), f = u - j, e = f * f * (3 - 2 * f);
      const w0 = hh(j % 6, tx + ty, 901), w1 = hh((j + 1) % 6, tx + ty, 901), rr = R * (0.84 + 0.24 * (w0 + (w1 - w0) * e)), d2 = dx * dx + dy * dy * 1.15;
      if (d2 > rr * rr) continue;
      const i = idx(tx + dx, ty + dy);
      m.tiles[i] = T.WATER; m.land[i] = 0; m.lake[i] = 2; if (m.river) m.river[i] = 0; m.reserve[i] |= RES;
      if (d2 > (rr - 1.3) * (rr - 1.3)) rim.push([tx + dx, ty + dy, a]);
    }
    clearVeg(X, Y, (R + 2.5) * TILE);
    // reeds and cattails round the north and west of the rim (the far side in this view), lilies out on the water
    for (const [x, y, a] of rim) if ((a < -0.3 || a > 2.6) && hh(x, y, 902) < 0.55) P('shrub_a', (x + 0.5) * TILE, (y + 0.5) * TILE, 0, { sp: hh(x, y, 903) < 0.5 ? 'reeds' : 'cattails', k: 1 });
    for (let j = 0; j < 4; j++) { const a = h(10 + j) * Math.PI * 2, r = R * TILE * (0.25 + h(20 + j) * 0.4); P('lily', X + Math.cos(a) * r, Y + Math.sin(a) * r * 0.85, 0, { v: j % 4 }); }
    // a willow leaning over it on the east side
    P('tree_a', X + (R + 1.2) * TILE, Y - R * TILE * 0.3, 12, { sp: 'willow', k: 1.35 });
    // the jetty out from the south bank: two planks wide, four out; a rowboat tied up beside it at some; a bench
    const jx = Math.round(tx - 1 + (h(30) - 0.5) * 2);
    let j0 = ty + R + 1; while (j0 > ty && m.tiles[idx(jx, j0)] !== T.WATER && m.tiles[idx(jx, j0)] !== T.DEEP) j0--;
    let jetty = 0;
    for (let y = j0 - 3; y <= j0 + 1; y++) for (let x = jx; x <= jx + 1; x++) { const i = idx(x, y); m.tiles[i] = T.DOCK; m.reserve[i] |= RES; jetty++; }
    if (h(31) < 0.6) P('rowboat', (jx + 3.3) * TILE, (j0 - 1.5) * TILE, 0, { a: Math.PI / 2 + (h(32) - 0.5) * 0.4 });
    P('pbench', (jx - 2.5) * TILE, (j0 + 3) * TILE, 0, { a: Math.PI / 2 });
    // by some, a windmill pump and its trough
    if (h(33) < 0.6) { P('windmill', X - (R + 6) * TILE, Y + TILE, 18); P('trough', X - (R + 3.2) * TILE, Y + 2.6 * TILE, 8); if (m.addSolidProp) m.addSolidProp(X - (R + 6) * TILE, Y + TILE, 18); }
    const site = { kind: 'pond', name, x: Math.round(X), y: Math.round(Y), r: Math.round(R * TILE), jetty: { x: Math.round((jx + 1) * TILE), y: Math.round((j0 - 1) * TILE) } };
    m.natureSites.push(site);
    (m.landmarks ||= []).push({ name, type: 'pond', x: Math.round(X - (R + 2) * TILE), y: Math.round(Y - (R + 2) * TILE), w: (R + 2) * 2 * TILE, h: (R + 2) * 2 * TILE });
    out.ponds.push({ name, x: tx, y: ty, r: R, jetty });
  });
  if (drop.size && H3.removeProps) H3.removeProps(m, (x, y) => drop.has(x + ',' + y));
  for (const [t, x, y, r, ex] of props) H3.addProp(m, t, x, y, r, ex);
  return out;
}
