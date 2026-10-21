// The rivers' current (2026-10-21): along the nearest creek's or river's centre line (m.waters.ch, downstream), fastest
// mid-channel, a rapid (ch.r) faster, still in a pocket (ch.p), a lake, the sea. Swimmers and steered boats drift with
// it (physics.js); the client predicts it alike. Arithmetic and sqrt only; cached beside the map. (docs/DEVLOG.md)
import { TILE, T } from './constants.js';

// px/s mid-channel (times 0.5 + half ch.v), a rapid's factor, the share left at the bank, the grid's cell (tiles)
export const FLOW = { creek: 34, river: 40, rapid: 2.4, edge: 0.3, cell: 8 };

const CACHE = new WeakMap();
function build(m) {
  const V = m.waters, G = new Map(), C = FLOW.cell, chs = [];
  if (!V || !Array.isArray(V.ch)) return { G, chs };
  V.ch.forEach((c) => {
    if ((c.k !== 'river' && c.k !== 'creek') || !Array.isArray(c.pts) || c.pts.length < 2) return;
    const P = c.pts, S = [0];
    for (let j = 1; j < P.length; j++) { const dx = P[j][0] - P[j - 1][0], dy = P[j][1] - P[j - 1][1]; S.push(S[j - 1] + Math.sqrt(dx * dx + dy * dy)); }
    const ci = chs.length, hw = c.w / 2 + 1;
    chs.push({ c, S, base: (c.k === 'creek' ? FLOW.creek : FLOW.river) * (0.5 + 0.5 * Math.min(1, Math.max(0, c.v || 0))) });
    for (let j = 0; j < P.length - 1; j++) {
      const x0 = Math.floor((Math.min(P[j][0], P[j + 1][0]) - hw) / C), x1 = Math.floor((Math.max(P[j][0], P[j + 1][0]) + hw) / C);
      const y0 = Math.floor((Math.min(P[j][1], P[j + 1][1]) - hw) / C), y1 = Math.floor((Math.max(P[j][1], P[j + 1][1]) + hw) / C);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const k = cy * 4096 + cx; let a = G.get(k); if (!a) G.set(k, (a = [])); a.push(ci, j); }
    }
  });
  return { G, chs };
}

const OUT = [0, 0];
// the current at (x, y) px: [vx, vy] px/s (a shared array), or null where it's still
export function flowAt(m, x, y) {
  if (!m || !m.waters || !m.river) return null;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!m.inside(tx, ty)) return null;
  const i = m.idx(tx, ty), t = m.tiles[i];
  if ((t !== T.WATER && t !== T.DEEP) || !m.river[i] || (m.lake && m.lake[i])) return null;
  let F = CACHE.get(m);
  if (!F) { F = build(m); CACHE.set(m, F); }
  const a = F.G.get(Math.floor(ty / FLOW.cell) * 4096 + Math.floor(tx / FLOW.cell));
  if (!a) return null;
  const px = x / TILE, py = y / TILE;
  let best = null, bd = 1e9, bt = 0, bj = 0;
  for (let k = 0; k < a.length; k += 2) {
    const ch = F.chs[a[k]], j = a[k + 1], P = ch.c.pts, ax = P[j][0], ay = P[j][1], dx = P[j + 1][0] - ax, dy = P[j + 1][1] - ay, l2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)), ex = ax + dx * u - px, ey = ay + dy * u - py, d = ex * ex + ey * ey;
    if (d < bd) { bd = d; best = ch; bt = u; bj = j; }
  }
  if (!best) return null;
  const c = best.c, d = Math.sqrt(bd), hw = c.w / 2;
  if (d > hw + 1) return null;
  for (const q of c.p || []) { const qx = q[0] - px, qy = q[1] - py; if (qx * qx + qy * qy < (q[2] + 1) * (q[2] + 1)) return null; }
  const P = c.pts, dx = P[bj + 1][0] - P[bj][0], dy = P[bj + 1][1] - P[bj][1], l = Math.sqrt(dx * dx + dy * dy) || 1, s = best.S[bj] + l * bt;
  let v = best.base;
  for (const r of c.r || []) if (s >= r[0] && s <= r[1]) { v *= 1 + (FLOW.rapid - 1) * (0.6 + 0.4 * (r[2] || 1)); break; }
  const e = Math.min(1, d / (hw || 1));
  v *= 1 - (1 - FLOW.edge) * e * e;
  OUT[0] = (dx / l) * v; OUT[1] = (dy / l) * v;
  return OUT;
}
