// The desert's roads by their furniture (the nature program, 2026-10-21; the owner, 10-16: "desert roads look like old
// desert roads ... every road type fits its setting"; the handcraft research's 5.1: "white delineator posts with red
// reflectors" along the desert highway and its roads). Out in the Red Rock Desert a road had no pavement or lamps
// (2026-10-17) and nothing else beside it; now white delineator posts with their red reflectors stand along both
// shoulders every eight tiles, the highways' too - on the sand or gravel by the asphalt, never in a town, at a junction or
// a level crossing, on a bridge, on a designed place's ground or in someone's yard. Not solid (a car brushes past them).
// For the whole-world build only (shared/world3-world.js's done hook). Deterministic: arithmetic.
import { TILE, T } from './constants.js';

// styles: the districts' styles they line; every: px between posts along the road; off: px out from the asphalt's edge;
// end: px kept clear at each end of a road (its junctions); max: the most in the world
export const ROADSIDE3 = { styles: new Set(['desert']), every: 256, off: 18, end: 160, max: 4000 };

export function desertRoadside3(m, H3) {
  const out = { posts: 0, roads: 0 };
  if (!H3 || !H3.addProp || !Array.isArray(m.edges)) return out;
  const R = ROADSIDE3, W = m.w, HH = m.h, styles = m._distStyle || [];
  const tileAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < W && ty < HH ? ty * W + tx : -1; };
  const shoulder = (i) => i >= 0 && m.land[i] && (m.tiles[i] === T.SAND || m.tiles[i] === T.DIRT) && !(m.reserve[i] & (16 | 32 | 1 | 2 | 8)) && !(m.bld && m.bld[i] >= 0) && R.styles.has(styles[m.dist[i]]);
  const isRoad = (i) => i >= 0 && (m.tiles[i] === T.ROAD || m.tiles[i] === T.BRIDGE || m.tiles[i] === T.SIDEWALK);
  // (the rails: no post within three tiles of the track - a level crossing has its own signals)
  const rail = new Set();
  for (const r of m.rails || (m.rail ? [m.rail] : [])) for (const p of r.pts || []) if (!p.under) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) rail.add((ty + dy) * W + tx + dx);
  }
  for (const e of m.edges) {
    if (out.posts >= R.max) break;
    if (!e || !Array.isArray(e.pts) || e.pts.length < 2 || e.kind === 'dirt' || e.kind === 'ramp' || e.lvl || e.tunnel || e.bridge) continue;
    const P = e.pts.map((p) => [p.x ?? p[0], p.y ?? p[1]]), S = [0];
    for (let k = 1; k < P.length; k++) S.push(S[k - 1] + Math.sqrt((P[k][0] - P[k - 1][0]) * (P[k][0] - P[k - 1][0]) + (P[k][1] - P[k - 1][1]) * (P[k][1] - P[k - 1][1])));
    const L = S[S.length - 1];
    if (L < R.end * 2 + R.every) continue;
    // (a desert road: its middle in a desert district)
    const mid = tileAt(P[Math.floor(P.length / 2)][0], P[Math.floor(P.length / 2)][1]);
    if (mid < 0 || !R.styles.has(styles[m.dist[mid]])) continue;
    let made = 0, q = 1;
    for (let s = R.end; s <= L - R.end && out.posts < R.max; s += R.every) {
      while (q < P.length - 1 && S[q] < s) q++;
      const t = (s - S[q - 1]) / ((S[q] - S[q - 1]) || 1), x = P[q - 1][0] + (P[q][0] - P[q - 1][0]) * t, y = P[q - 1][1] + (P[q][1] - P[q - 1][1]) * t;
      const dx = P[q][0] - P[q - 1][0], dy = P[q][1] - P[q - 1][1], l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l, ny = dx / l;
      if (isRoad(tileAt(x, y)) === false) continue;   // (the road's own line off its asphalt: not here)
      for (const sd of [-1, 1]) {
        const o = (e.hw || 40) + R.off, px = x + nx * sd * o, py = y + ny * sd * o, i = tileAt(px, py);
        // on the shoulder, with open desert beyond it (not another road's asphalt a tile further out)
        if (!shoulder(i) || rail.has(i) || isRoad(tileAt(px + nx * sd * TILE, py + ny * sd * TILE))) continue;
        H3.addProp(m, 'delineator', Math.round(px), Math.round(py), 0, { a: Math.round(Math.atan2(dy, dx) * 100) / 100 });
        out.posts++; made++;
      }
    }
    if (made) out.roads++;
  }
  return out;
}
