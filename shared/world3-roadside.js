// The desert's roads by their furniture (the nature program, 2026-10-21; the owner, 10-16: "desert roads look like old
// desert roads ... every road type fits its setting"; the handcraft research's 5.1: "white delineator posts with red
// reflectors" along the desert highway and its roads). Out in the Red Rock Desert a road had no pavement or lamps
// (2026-10-17) and nothing else beside it; now white delineator posts with their red reflectors stand along both
// shoulders every eight tiles, the highways' too - on the sand or gravel by the asphalt, never in a town, at a junction or
// a level crossing, on a bridge, on a designed place's ground or in someone's yard. Not solid (a car brushes past them).
// And a few gravel pull-offs on the desert's highways (the research's 5.1: "gravel pull-off with shade ramada, water
// tank"), far apart, off one shoulder: a gravel apron, a timber shade ramada over a picnic table, a water tank, a bin.
// For the whole-world build only (shared/world3-world.js's done hook). Deterministic: arithmetic.
import { TILE, T } from './constants.js';

// styles: the districts' styles they line; every: px between posts along the road; off: px out from the asphalt's edge;
// end: px kept clear at each end of a road (its junctions); max: the most in the world
export const ROADSIDE3 = { styles: new Set(['desert']), every: 256, off: 18, end: 160, max: 4000 };
// the pull-offs: n of them, apart (tiles) at the least, len x deep (tiles) of open ground off the asphalt, end (tiles)
// kept from each end of the highway's edge, step (px) along it while looking
export const PULLOFF3 = { n: 3, apart: 220, len: 12, deep: 6, end: 30, step: 96 };

export function desertRoadside3(m, H3) {
  const out = { posts: 0, roads: 0 };
  if (!H3 || !H3.addProp || !Array.isArray(m.edges)) return out;
  const R = ROADSIDE3, W = m.w, HH = m.h, styles = m._distStyle || [];
  const tileAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < W && ty < HH ? ty * W + tx : -1; };
  // (reserve 1 by a highway: its band, kept clear of buildings - map.js; a post may stand there)
  const shoulder = (i, hwy) => i >= 0 && m.land[i] && (m.tiles[i] === T.SAND || m.tiles[i] === T.DIRT) && !(m.reserve[i] & (16 | 32 | (hwy ? 0 : 1) | 2 | 8)) && !(m.bld && m.bld[i] >= 0) && R.styles.has(styles[m.dist[i]]);
  const isRoad = (i) => i >= 0 && (m.tiles[i] === T.ROAD || m.tiles[i] === T.BRIDGE || m.tiles[i] === T.SIDEWALK);
  // (the rails: no post within three tiles of the track - a level crossing has its own signals)
  const rail = new Set();
  for (const r of m.rails || (m.rail ? [m.rail] : [])) for (const p of r.pts || []) if (!p.under) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) rail.add((ty + dy) * W + tx + dx);
  }
  out.pullOffs = pullOffs(m, H3, shoulder, isRoad, tileAt, rail, styles);
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
        const o = (e.hw || 40) + R.off, px = Math.round(x + nx * sd * o), py = Math.round(y + ny * sd * o), i = tileAt(px, py);   // (rounded first: the post's own tile)
        // on the shoulder, with open desert beyond it (not another road's asphalt a tile further out)
        if (!shoulder(i, e.kind === 'hwy') || rail.has(i) || isRoad(tileAt(px + nx * sd * TILE, py + ny * sd * TILE))) continue;
        H3.addProp(m, 'delineator', px, py, 0, { a: Math.round(Math.atan2(dy, dx) * 100) / 100 });
        out.posts++; made++;
      }
    }
    if (made) out.roads++;
  }
  return out;
}

// the gravel pull-offs: [{ x, y }] (tiles, the apron's middle)
function pullOffs(m, H3, shoulder, isRoad, tileAt, rail, styles) {
  const Q = PULLOFF3, W = m.w, made = [], P = [], clear = new Set();
  for (const e of m.edges) {
    if (made.length >= Q.n) break;
    if (!e || e.kind !== 'hwy' || e.lvl || e.bridge || e.tunnel || !Array.isArray(e.pts) || e.pts.length < 2) continue;
    const pts = e.pts.map((p) => [p.x ?? p[0], p.y ?? p[1]]), S = [0];
    for (let k = 1; k < pts.length; k++) S.push(S[k - 1] + Math.sqrt((pts[k][0] - pts[k - 1][0]) * (pts[k][0] - pts[k - 1][0]) + (pts[k][1] - pts[k - 1][1]) * (pts[k][1] - pts[k - 1][1])));
    const L = S[S.length - 1];
    let q = 1;
    for (let s = Q.end * TILE; s <= L - Q.end * TILE && made.length < Q.n; s += Q.step) {
      while (q < pts.length - 1 && S[q] < s) q++;
      const t = (s - S[q - 1]) / ((S[q] - S[q - 1]) || 1), x = pts[q - 1][0] + (pts[q][0] - pts[q - 1][0]) * t, y = pts[q - 1][1] + (pts[q][1] - pts[q - 1][1]) * t;
      const dx = pts[q][0] - pts[q - 1][0], dy = pts[q][1] - pts[q - 1][1], l = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / l, uy = dy / l;
      if (!R3styles(styles, m, tileAt(x, y))) continue;
      for (const sd of [-1, 1]) {
        const nx = -uy * sd, ny = ux * sd, o0 = (e.hw || 40) / TILE + 0.6;
        // the apron: len along the road, deep out from the asphalt's edge, all open desert (and one tile more round it)
        let ok = true;
        const tiles = [];
        for (let a = -Q.len / 2 - 1; a <= Q.len / 2 + 1 && ok; a += 0.5) for (let b = o0; b <= o0 + Q.deep + 1 && ok; b += 0.5) {
          const i = tileAt(x + (ux * a + nx * b) * TILE, y + (uy * a + ny * b) * TILE);
          if (!shoulder(i, true) || rail.has(i)) ok = false;
          else if (Math.abs(a) <= Q.len / 2 && b <= o0 + Q.deep) tiles.push(i);
        }
        if (!ok) continue;
        const cx = x + nx * (o0 + Q.deep / 2) * TILE, cy = y + ny * (o0 + Q.deep / 2) * TILE;
        if (made.some((p) => (p.x - cx / TILE) * (p.x - cx / TILE) + (p.y - cy / TILE) * (p.y - cy / TILE) < Q.apart * Q.apart)) continue;
        for (const i of tiles) { m.tiles[i] = T.SAND; m.reserve[i] |= 4 | 32 | 128; clear.add(i); }   // (gravel: the shingle, as the desert's jeep tracks)
        for (let a = -Q.len / 2 - 2; a <= Q.len / 2 + 2; a += 0.5) for (let b = o0 - 0.5; b <= o0 + Q.deep + 2; b += 0.5) { const i = tileAt(x + (ux * a + nx * b) * TILE, y + (uy * a + ny * b) * TILE); if (i >= 0) clear.add(i); }
        // the ramada over its table in the apron's middle, the water tank at its far end, a bin by the road
        P.push(['pergola', cx, cy, 0, { w: 152, d: 104, h: 58, dark: 1 }], ['picnic', cx, cy + 8, 8, null]);
        P.push(['otank', cx + ux * (Q.len / 2 - 1.5) * TILE, cy + uy * (Q.len / 2 - 1.5) * TILE, 26, { r: 26, h: 56, c: '#8a7a68' }]);
        P.push(['trashcan', cx - ux * (Q.len / 2 - 2) * TILE - nx * (Q.deep / 2 - 1) * TILE, cy - uy * (Q.len / 2 - 2) * TILE - ny * (Q.deep / 2 - 1) * TILE, 5, null]);
        made.push({ x: Math.round(cx / TILE), y: Math.round(cy / TILE) });
        (m.natureSites ||= []).push({ kind: 'pulloff', x: Math.round(cx), y: Math.round(cy) });
        break;
      }
    }
  }
  if (clear.size && H3.removeProps) H3.removeProps(m, (x, y) => clear.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
  for (const [t, x, y, r, ex] of P) H3.addProp(m, t, Math.round(x), Math.round(y), r, ex);
  return made;
}
const R3styles = (styles, m, i) => i >= 0 && ROADSIDE3.styles.has(styles[m.dist[i]]);
