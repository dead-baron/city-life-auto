// The desert's windmills and stock tanks (the nature program, 2026-10-21; the handcraft research's 4.6 and NS1-C: "the
// windmills and stock tanks", a desert set piece of a windmill and its stock tank). Out on the open range of the Red
// Rock Desert and the Dry Creek Desert, far from the towns and well off the roads, a few windmill pumps stand over
// their round galvanized stock tanks brim-full of water, a trough beside, a corner of corral fence and a mesquite or
// two for shade, the ground round the water trodden bare - and a two-rut track out to each from the nearest road.
// Range cattle graze round them (server/systems/wildlife.js: the stock tanks keep cows about as the farms keep their
// livestock). Each windmill is on the map (m.natureSites 'stocktank').
// For the whole-world build only (shared/world3-world.js's done hook). Deterministic: arithmetic, integer hashes.
import { TILE, T } from './constants.js';

const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// districts: the ranges; n: how many; apart: tiles between them at the least; step: the scan's (tiles); room: open
// ground all round (tiles); road: how far off a road (tiles: at the least, at the most - the track's length); away:
// tiles from any other nature site (a camp, a fall, a lake...); tank: the tank's radius (px)
export const STOCK3 = { districts: [50, 41], n: 6, apart: 90, step: 5, room: 7, road: [12, 46], away: 40, tank: 26 };

const RIDGE = new Set([T.SAND, T.DIRT, T.GRASS]);

export function stockTanks3(m, H3) {
  const out = { sites: [] };
  if (!H3 || !H3.addProp) return out;
  const S = STOCK3, W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const DS = new Set(S.districts);
  const designed = (i) => { const a = m.solidProps && m.solidProps.get(i); return !!a && a.some((e) => e.pi < 0); };
  const plain = (i) => m.land[i] && RIDGE.has(m.tiles[i]) && !(m.reserve[i] & ~(4 | 128)) && !(m.bld && m.bld[i] >= 0) && !(m.lake && m.lake[i]) && !(m.river && m.river[i]);
  const open = (x, y) => {
    for (let dy = -S.room; dy <= S.room; dy++) for (let dx = -S.room; dx <= S.room; dx++) {
      if (dx * dx + dy * dy > S.room * S.room) continue;
      const X = x + dx, Y = y + dy;
      if (!inF(X, Y)) return false;
      const i = idx(X, Y);
      if (!plain(i) || designed(i)) return false;
    }
    return true;
  };
  // the nearest road tile along eight directions (and the way to it all open ground): [x, y, d] or null
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
  const roadFrom = (x, y) => {
    let best = null;
    for (const [ux, uy] of DIRS) {
      for (let d = S.room; d <= S.road[1]; d++) {
        const X = Math.round(x + ux * d), Y = Math.round(y + uy * d);
        if (!inF(X, Y)) break;
        const i = idx(X, Y), t = m.tiles[i];
        if (t === T.ROAD) { if (d >= S.road[0] && (!best || d < best[2])) best = [X, Y, d, ux, uy]; break; }
        if (!m.land[i] || !(RIDGE.has(t) || t === T.SIDEWALK) || (m.bld && m.bld[i] >= 0) || (m.reserve[i] & 32) || designed(i)) break;
      }
    }
    return best;
  };
  const others = (m.natureSites || []).map((s) => [s.x / TILE, s.y / TILE]);
  const cands = [];
  for (let y = S.room + 2; y < HH - S.room - 2; y += S.step) for (let x = S.room + 2; x < W - S.room - 2; x += S.step) {
    const i = idx(x, y);
    if (!DS.has(m.dist[i]) || !plain(i)) continue;
    cands.push([x, y, hh(x, y, 5511)]);
  }
  cands.sort((a, b) => a[2] - b[2]);
  const chosen = [];
  for (const [x, y] of cands) {
    if (chosen.length >= S.n) break;
    if (chosen.some((c) => (c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y) < S.apart * S.apart)) continue;
    if (others.some(([ox, oy]) => (ox - x) * (ox - x) + (oy - y) * (oy - y) < S.away * S.away)) continue;
    if (!open(x, y)) continue;
    const rd = roadFrom(x, y);
    if (!rd) continue;
    chosen.push([x, y, rd]);
  }
  const P = [], clear = new Set();
  const put = (t, x, y, r = 0, ex = null) => P.push([t, Math.round(x), Math.round(y), r, ex]);
  const solids = [];
  for (const [tx, ty, rd] of chosen) {
    const X = (tx + 0.5) * TILE, Y = (ty + 0.5) * TILE, h = (k) => hh(tx, ty, 5600 + k);
    // facing the road: the windmill on the far side of the tank from it, the corral's corner behind
    const [, , d, ux, uy] = rd, vx = -uy, vy = ux;
    // the ground round the water trodden bare (dirt); nothing grows there
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const q = dx * dx + dy * dy, i = idx(tx + dx, ty + dy);
      if (q <= 4 * 4) { if (m.tiles[i] === T.GRASS || m.tiles[i] === T.SAND) m.tiles[i] = T.DIRT; m.reserve[i] |= 4 | 32; m.reserve[i] &= ~128; }
      if (q <= 6 * 6) clear.add(i);
    }
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) if (dx * dx + dy * dy <= 49) clear.add(idx(tx + dx, ty + dy));
    // the tank in the middle, the windmill behind it (its pipe over the rim), the trough beside it
    put('stocktank', X, Y, 0, { r: S.tank });
    for (const [ox, oy] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) solids.push([X + ox, Y + oy, 16]);
    const wx = X - ux * 2.4 * TILE, wy = Y - uy * 2.4 * TILE;
    put('windmill', wx, wy, 18); solids.push([wx, wy, 18]);
    put('trough', X + vx * 2.6 * TILE + ux * 0.6 * TILE, Y + vy * 2.6 * TILE + uy * 0.6 * TILE, 8, { a: Math.round(Math.atan2(vy, vx) * 100) / 100 });
    // a corner of corral fence on the side away from the trough, square to the compass (the fence's rails run along x or y)
    const sx = Math.abs(vx) > 0.3 ? -Math.sign(vx) : 1, sy = Math.abs(vy) > 0.3 ? -Math.sign(vy) : 1;
    const fx = X + sx * 3 * TILE, fy = Y + sy * 3 * TILE;
    put('fenceline', fx, fy, 0, { kind: 'rail', tx: Math.round(sx * 4.5 * TILE), ty: 0 });
    put('fenceline', fx, fy, 0, { kind: 'rail', tx: 0, ty: Math.round(sy * 4.5 * TILE) });
    // a mesquite or two for shade, out past the bare ground
    for (let j = 0; j < 1 + (h(1) < 0.6 ? 1 : 0); j++) {
      const a = Math.atan2(-uy, -ux) + (j ? -1.3 : 1.2) + (h(2 + j) - 0.5) * 0.5, r = (5.6 + h(4 + j)) * TILE;
      put('tree_a', X + Math.cos(a) * r, Y + Math.sin(a) * r, 14, { sp: 'mesquite', k: 1.1 + h(6 + j) * 0.2 });
    }
    // the two-rut track out to the road
    const ruts = [];
    for (let k = 4; k < d; k++) {
      const cx = tx + 0.5 + ux * k, cy = ty + 0.5 + uy * k;
      for (const sd of [-1, 1]) {
        const x = Math.floor(cx + vx * 0.9 * sd), y = Math.floor(cy + vy * 0.9 * sd);
        if (!inF(x, y)) continue;
        const i = idx(x, y);
        if (!m.land[i] || !RIDGE.has(m.tiles[i]) || (m.bld && m.bld[i] >= 0)) continue;
        m.tiles[i] = T.SAND; m.reserve[i] |= 4 | 128;   // (gravel: the desert's jeep tracks' look - world3-desert.js)
        ruts.push(i);
      }
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy; if (inF(x, y)) clear.add(idx(x, y)); }
    }
    const ax = Math.round(X + ux * 4 * TILE), ay = Math.round(Y + uy * 4 * TILE), bx = Math.round(X + ux * d * TILE), by = Math.round(Y + uy * d * TILE);
    (m.tracks ||= []).push({ pts: [[ax, ay], [bx, by]], hw: 34, bb: [Math.min(ax, bx) - 70, Math.min(ay, by) - 70, Math.max(ax, bx) + 70, Math.max(ay, by) + 70] });
    m.natureSites.push({ kind: 'stocktank', x: Math.round(X), y: Math.round(Y), windmill: [Math.round(wx), Math.round(wy)], track: [[ax, ay], [bx, by]] });
    out.sites.push({ x: tx, y: ty, road: d, ruts: ruts.length });
  }
  if (clear.size && H3.removeProps) H3.removeProps(m, (x, y) => clear.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
  for (const [t, x, y, r, e] of P) H3.addProp(m, t, x, y, r, e);
  // (the solids: after the props are cleared - clearing them builds the solids again from the props)
  if (m.addSolidProp) for (const [x, y, r] of solids) m.addSolidProp(Math.round(x), Math.round(y), r);
  return out;
}
