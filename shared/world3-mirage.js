// The desert by hand, part 1: Mirage Lake (the nature program, 2026-10-21; the handcraft research's desert notes and the
// concepts N4-B, N4-C and SC3-F: "an oasis ... a fall into a turquoise pool, palms", "a murky seep pool under a palo
// verde"). The lake south of the North Coast Road lay in the bare sand as a stiff octagon, the desert's dirt to its
// edge. Now its rim wavers round in slow lobes; a green belt of grass, reeds and cattails rings its north and east
// shores under desert fan palms, date palms and a palo verde or two; a pale beach of white sand lies along its south
// and west shores with a plank jetty out from it and a rowboat tied up; boulders here and there. The camp at the end
// of the Mirage Track (Mirage Camp) stands north of it as it was.
// For the whole-world build only (shared/world3-world.js's done hook, after the coasts'). Deterministic: arithmetic,
// integer hashes, Math's functions only inside generateCity.
import { TILE, T } from './constants.js';

const RES = 32, KEEP = 4, LUSH = 128, BEACH = 36;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const MIRAGE3 = {
  name: 'Mirage Lake', near: [4470, 905], reach: 40,
  grow: 1.12,      // the new rim: this much the lake's own radii, wavering
  belt: 3,         // the green belt: tiles from the water (north and east)
  beach: 3,        // the white beach: tiles from the water (south and west)
};

export function mirageByHand3(m, H3) {
  const out = { lake: 0, added: 0, removed: 0, belt: 0, beach: 0, palms: 0, jetty: 0 };
  if (!H3 || !H3.addProp) return out;
  const M = MIRAGE3, W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const wetT = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP;
  // the lake: its water from the nearest wet tile to its spot
  let s0 = null;
  for (let r = 0; r < 20 && !s0; r++) for (let dy = -r; dy <= r && !s0; dy++) for (let dx = -r; dx <= r; dx++) { const x = M.near[0] + dx, y = M.near[1] + dy; if (inF(x, y) && wetT(idx(x, y))) { s0 = [x, y]; break; } }
  if (!s0) return out;
  const water = new Set([idx(...s0)]), q = [s0];
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy, j = idx(X, Y); if (!water.has(j) && inF(X, Y) && wetT(j) && Math.abs(X - M.near[0]) < M.reach && Math.abs(Y - M.near[1]) < M.reach) { water.add(j); q.push([X, Y]); } } }
  if (water.size < 20 || water.size > 3000) return out;
  out.lake = water.size;
  let sx = 0, sy = 0;
  for (const i of water) { sx += i % W; sy += (i - (i % W)) / W; }
  const cx = sx / water.size, cy = sy / water.size;
  let vx = 0, vy = 0;
  for (const i of water) { const x = i % W, y = (i - x) / W; vx += (x - cx) * (x - cx); vy += (y - cy) * (y - cy); }
  const rx = Math.sqrt(vx / water.size) * 2 * M.grow, ry = Math.sqrt(vy / water.size) * 2 * M.grow;
  const lake0 = m.lake ? m.lake[[...water][0]] : 0, dist0 = m.dist[[...water][0]], zone0 = m.zone ? m.zone[[...water][0]] : 0;
  // the new rim: an ellipse wavering in six slow lobes (eased between)
  const rim = (x, y) => { const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = Math.atan2(dy / ry, dx / rx), u = ((a + Math.PI) / (Math.PI * 2)) * 6, j = Math.floor(u), f = u - j, e = f * f * (3 - 2 * f), w0 = hh(j % 6, 7, 1101), w1 = hh((j + 1) % 6, 7, 1101); return Math.sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry)) / (0.86 + 0.24 * (w0 + (w1 - w0) * e)); };
  const changed = new Set();
  const bx0 = Math.floor(cx - rx * 1.6 - 8), bx1 = Math.ceil(cx + rx * 1.6 + 8), by0 = Math.floor(cy - ry * 1.6 - 8), by1 = Math.ceil(cy + ry * 1.6 + 8);
  const plain = (i) => (m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND || m.tiles[i] === T.GRASS) && m.land[i] && !(m.reserve[i] & ~(KEEP | LUSH)) && !(m.bld && m.bld[i] >= 0);
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    if (!inF(x, y)) continue;
    const i = idx(x, y), r = rim(x, y);
    if (r <= 1 && !water.has(i) && plain(i)) { m.tiles[i] = T.WATER; m.land[i] = 0; if (m.lake) m.lake[i] = lake0; if (m.river) m.river[i] = 0; m.dist[i] = dist0; if (m.zone) m.zone[i] = zone0; m.reserve[i] |= RES; water.add(i); changed.add(i); out.added++; }
    else if (r > 1.08 && water.has(i) && m.tiles[i] === T.WATER) { m.tiles[i] = T.SAND; m.land[i] = 1; if (m.lake) m.lake[i] = 0; if (m.river) m.river[i] = 0; m.reserve[i] |= RES; water.delete(i); changed.add(i); out.removed++; }
  }
  // the shores: distance from the water over the land round it
  const dist = new Map(), bq = [];
  for (const i of water) for (const j of [i - 1, i + 1, i - W, i + W]) if (!water.has(j) && !dist.has(j) && m.land[j]) { dist.set(j, 1); bq.push(j); }
  for (let h = 0; h < bq.length; h++) { const i = bq[h], d = dist.get(i); if (d >= Math.max(M.belt, M.beach) + 1) continue; for (const j of [i - 1, i + 1, i - W, i + W]) if (!dist.has(j) && !water.has(j) && m.land[j]) { dist.set(j, d + 1); bq.push(j); } }
  const side = (i) => { const x = i % W, y = (i - x) / W; return Math.atan2(y + 0.5 - cy, x + 0.5 - cx); };   // (0 east, pi/2 south)
  const greenSide = (a) => a < 0.5 && a > -2.4;   // (north-west round to east-south-east)
  const P = [], put = (t, x, y, r = 0, ex = null) => P.push([t, Math.round(x), Math.round(y), r, ex]);
  for (const [i, d] of dist) {
    if (!plain(i) && !changed.has(i)) continue;
    const x = i % W, y = (i - x) / W, a = side(i), lim = (greenSide(a) ? M.belt : M.beach) + (hh(x >> 1, y >> 1, 1102) < 0.4 ? 1 : 0);
    if (d > lim) continue;
    if (greenSide(a)) { m.tiles[i] = T.GRASS; m.reserve[i] = (m.reserve[i] | LUSH | RES) & ~64; out.belt++; }
    else { m.tiles[i] = T.SAND; m.reserve[i] = (m.reserve[i] | BEACH) & ~(LUSH | 64); out.beach++; }
    changed.add(i);
  }
  // the green side's planting: reeds and cattails at the water, palms behind them, a palo verde or two
  const edge = [...dist].filter(([i, d]) => d === 1 && greenSide(side(i))).map(([i]) => i);
  for (const i of edge) { const x = i % W, y = (i - x) / W; if (hh(x, y, 1103) < 0.5) put('shrub_a', (x + 0.5) * TILE, (y + 0.5) * TILE, 0, { sp: hh(x, y, 1104) < 0.5 ? 'reeds' : 'cattails', k: 1 }); }
  const back = [...dist].filter(([i, d]) => d === 2 + (hh(i, 3, 1105) < 0.5 ? 1 : 0) && greenSide(side(i))).map(([i]) => i).sort((a, b) => side(a) - side(b));
  let lastA = -9;
  for (const i of back) {
    const a = side(i);
    if (a - lastA < 0.38) continue;
    lastA = a;
    const x = i % W, y = (i - x) / W, u = hh(x, y, 1106);
    if (u < 0.15) put('tree_a', (x + 0.5) * TILE, (y + 0.5) * TILE, 10, { sp: 'paloVerde', k: 1.15 });
    else { put('palm_a', (x + 0.5) * TILE, (y + 0.5) * TILE, 10, { sp: u < 0.4 ? 'date' : 'desertFan', k: 1.15 + hh(x, y, 1107) * 0.35 }); out.palms++; }
  }
  // the jetty: out from the beach's middle (the south shore) into the water, two planks wide; a rowboat by it
  const south = [...dist].filter(([i, d]) => d === 1 && Math.abs(side(i) - Math.PI / 2) < 0.5).map(([i]) => i).sort((a, b) => Math.abs((a % W) - cx) - Math.abs((b % W) - cx));
  if (south.length) {
    const i0 = south[0], jx = i0 % W, jy = (i0 - jx) / W;
    for (let y = jy - 4; y <= jy; y++) for (let x = jx; x <= jx + 1; x++) { const i = idx(x, y); if (inF(x, y) && (water.has(i) || y === jy)) { m.tiles[i] = T.DOCK; m.reserve[i] |= RES; out.jetty++; changed.add(i); } }
    put('rowboat', (jx + 2.8) * TILE, (jy - 2.5) * TILE, 0, { a: Math.PI / 2 });
    put('pbench', (jx + 0.5) * TILE, (jy + 2.2) * TILE, 0, { a: -Math.PI / 2 });
  }
  // a few boulders on the beach
  const beachT = [...dist].filter(([i, d]) => d === 2 && !greenSide(side(i))).map(([i]) => i);
  for (let k = 0; k < 4 && beachT.length; k++) { const i = beachT[Math.floor(hh(k, 9, 1108) * beachT.length)], x = i % W, y = (i - x) / W, s = 14 + k * 4; put('boulder', (x + 0.5) * TILE, (y + 0.5) * TILE, Math.round(s * 0.3), { s }); }
  // what stood on the changed ground goes; then the shore's own
  if (changed.size && H3.removeProps) H3.removeProps(m, (x, y) => changed.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
  for (const [t, x, y, r, ex] of P) H3.addProp(m, t, x, y, r, ex);
  if (!(m.landmarks || []).some((l) => l.name === M.name)) (m.landmarks ||= []).push({ name: M.name, type: 'lake', x: Math.round((cx - rx - 2) * TILE), y: Math.round((cy - ry - 2) * TILE), w: Math.round((rx * 2 + 4) * TILE), h: Math.round((ry * 2 + 4) * TILE) });
  m.natureSites.push({ kind: 'lake', name: M.name, x: Math.round((cx + 0.5) * TILE), y: Math.round((cy + 0.5) * TILE), palms: out.palms });
  return out;
}
