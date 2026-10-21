// The drive-through redwood (the nature program, 2026-10-21; task #399, the owner's of 10-09). Giant's Gate: a giant
// coast redwood among the old growth of Highland Woods with a tunnel cut through its foot, a dirt lane running north
// through it from a road, a turning circle past it. The camera looks north, so the lane runs north-south to be seen
// through the arch (client/art2/redwoods.js giantRedwood o.tunnel; client/art2/game/statics.js species 'gate'):
//   - the site: a road running east-west through Highland Woods with open forest floor beside it for the lane's
//     length and room, among the most giants;
//   - the lane: three tiles of dirt from the road's edge, ruts in it (m.tracks), nothing growing on it; a turning
//     circle at its far end;
//   - the tree: on the lane, its trunk solid either side of the arch (small solids, so a car rubbing the wall stops -
//     shared/physics.js), never felled (shared/felling.js), fading while you're in the tunnel like any giant (the
//     host's tree fade); its name on a sign at the lane's mouth, on the map.
// Traffic keeps to the road graph, so only the players drive through. For the whole-world build only
// (shared/world3-world.js's done hook). Deterministic: arithmetic, integer hashes.
import { TILE, T } from './constants.js';

const RES = 32, KEEP = 4;
export const GATE3 = {
  name: "Giant's Gate", sign: "GIANT'S GATE - DRIVE-THRU TREE",
  district: 47, len: 30, at: 14, half: 1, turn: 4,   // (tiles: the lane's length, the tree that far along it, its half-width beyond the middle tile, the turning circle's radius)
  tunnel: 46, wall: [48, 112], deep: 64,             // (px: the arch's half-width; the trunk's walls either side, from the lane's middle; how far they run north and south of the foot)
  room: 4,                                           // (tiles of open ground either side of the lane all along it)
};

export function driveTree3(m, H3) {
  const out = { site: null };
  if (!H3 || !H3.addProp || !m.addSolidProp) return out;
  const G = GATE3, W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const plain = (i) => m.land[i] && (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && !(m.reserve[i] & ~(KEEP | 128)) && !(m.bld && m.bld[i] >= 0) && !(m.lake && m.lake[i]);
  // the giants round about, by 16-tile cell (where the old growth is thickest)
  const cell = new Map();
  for (const p of m.props) if (p && p.t === 'redwood' && p.sp !== 'redwood2') { const k = Math.floor(p.x / TILE / 16) * 65536 + Math.floor(p.y / TILE / 16); cell.set(k, (cell.get(k) || 0) + 1); }
  const giants = (tx, ty) => { let n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) n += cell.get((Math.floor(tx / 16) + dx) * 65536 + Math.floor(ty / 16) + dy) || 0; return n; };
  let best = null;
  for (let y = 4; y < HH - 4; y += 2) for (let x = 8; x < W - 8; x += 2) {
    const i = idx(x, y);
    if (m.tiles[i] !== T.ROAD || m.dist[i] !== G.district || m.tiles[i - 3] !== T.ROAD || m.tiles[i + 3] !== T.ROAD) continue;   // (a road running east-west here)
    for (const dir of [-1, 1]) {
      let y0 = y; while (inF(x, y0) && (m.tiles[idx(x, y0)] === T.ROAD || m.tiles[idx(x, y0)] === T.SIDEWALK)) y0 += dir;
      if (Math.abs(y0 - y) > 6) continue;
      let ok = true;
      for (let k = 0; k <= G.len + G.turn && ok; k++) for (let dx = -G.half - G.room; dx <= G.half + G.room; dx++) { const X = x + dx, Y = y0 + dir * k; if (!inF(X, Y) || !plain(idx(X, Y))) { ok = false; break; } }
      if (!ok) continue;
      const sc = giants(x, y0 + dir * G.at);
      if (!best || sc > best.sc) best = { x, y0, dir, sc };
    }
  }
  if (!best) return out;
  const { x: lx, y0, dir } = best, P = [], clear = new Set();
  const put = (t, x, y, r = 0, ex = null) => P.push([t, Math.round(x), Math.round(y), r, ex]);
  // the lane, and the turning circle at its end
  const tiles = [];
  for (let k = 0; k <= G.len; k++) for (let dx = -G.half; dx <= G.half; dx++) tiles.push(idx(lx + dx, y0 + dir * k));
  const ex = lx, ey = y0 + dir * (G.len + G.turn - 1);
  for (let dy = -G.turn; dy <= G.turn; dy++) for (let dx = -G.turn; dx <= G.turn; dx++) if (dx * dx + dy * dy <= G.turn * G.turn + 1) tiles.push(idx(ex + dx, ey + dy));
  for (const i of tiles) { m.tiles[i] = T.DIRT; m.reserve[i] = (m.reserve[i] & ~128) | RES | KEEP; }
  for (let k = -1; k <= G.len + G.turn * 2; k++) for (let dx = -G.half - 3; dx <= G.half + 3; dx++) if (inF(lx + dx, y0 + dir * k)) clear.add(idx(lx + dx, y0 + dir * k));
  for (let dy = -G.turn - 2; dy <= G.turn + 2; dy++) for (let dx = -G.turn - 2; dx <= G.turn + 2; dx++) if (inF(ex + dx, ey + dy)) clear.add(idx(ex + dx, ey + dy));
  const px = (lx + 0.5) * TILE, pyA = (y0 + 0.5) * TILE, pyB = (y0 + dir * G.len + 0.5) * TILE;
  (m.tracks ||= []).push({ pts: [[Math.round(px), Math.round(pyA)], [Math.round(px), Math.round(pyB)]], hw: 40, bb: [px - 104, Math.min(pyA, pyB) - 64, px + 104, Math.max(pyA, pyB) + 64], ride: G.name });
  // the tree: its foot on the lane's middle, no solid of its own - the walls either side of the arch, small solids
  // on a grid (a car's corner finds each by its own tile)
  const fy = Math.round((y0 + dir * G.at + 0.5) * TILE);
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (inF(lx + dx, y0 + dir * G.at + dy)) clear.add(idx(lx + dx, y0 + dir * G.at + dy));
  put('redwood', px, fy, 0, { sp: 'gate', k: 1 });
  // the sign at the lane's mouth, beside it; a boulder or two at the turning circle's edge
  put('textsign', px + 2.6 * TILE, pyA + dir * 1.5 * TILE, 0, { text: G.sign, bg: '#5a3a22', fg: [250, 230, 180], z: 30 });
  for (const a of [0.6, 2.4]) put('boulder', (ex + 0.5 + Math.cos(a) * (G.turn + 0.8)) * TILE, (ey + 0.5 + Math.sin(a) * (G.turn + 0.8) * dir) * TILE, 10, { s: 24, style: 'granite', moss: 1 });
  if (clear.size && H3.removeProps) H3.removeProps(m, (x, y) => clear.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
  for (const [t, x, y, r, e] of P) H3.addProp(m, t, x, y, r, e);
  // (the trunk's walls: after the props are cleared - clearing them builds the solids again from the props)
  let solids = 0;
  for (const sd of [-1, 1]) for (let ox = G.wall[0] + 12; ox <= G.wall[1]; ox += 20) for (let j = -2; j <= 2; j++) {
    const oy = j * G.deep / 2, r = Math.min(16, ox - G.wall[0]);
    if ((ox / G.wall[1]) * (ox / G.wall[1]) + (oy / G.deep) * (oy / G.deep) > 1.35) continue;   // (the foot's round: not its corners)
    m.addSolidProp(Math.round(px + sd * ox), Math.round(fy + oy), r); solids++;
  }
  m.natureSites.push({ kind: 'drivetree', name: G.name, x: Math.round(px), y: fy, lane: [[Math.round(px), Math.round(pyA)], [Math.round(px), Math.round(pyB)]], tunnel: G.tunnel });
  (m.landmarks ||= []).push({ name: G.name, type: 'park', x: Math.round(px - 6 * TILE), y: Math.round(fy - 6 * TILE), w: 12 * TILE, h: 12 * TILE });
  out.site = { x: lx, y0, dir, tree: [Math.round(px), fy], giants: best.sc, solids };
  return out;
}
