// World v3's river mouths (the owner, 2026-10-22: "can we fix these water connections around the world to look better?
// Right now its unnatural" - a river reaching the sea in a round end poking through the beach, touching the sea at a
// narrow neck). Each river and creek whose end runs out to the sea (world3-skeleton.js STREAMS and RIVER, smoothed as
// the land cut them: world3-land.js) opens out there into an estuary:
// - over its last stretch (`len`: longer for a wider river) the channel widens - up to `flare` again its width and `add`
//   tiles more at the very end - its banks wandering a little as they go, each side its own way;
// - past its end it runs on into the sea (the beach or the dunes between cut away), opening wider still, so it meets the
//   sea along a broad front instead of at a point;
// - where the coast there is a beach, the banks of the widened stretch are sand too - the beach curving round into the
//   river's mouth - tapering off upstream.
// Only open ground is touched (grass, earth, sand, a field's edge): never a road, a pavement, a bridge, a dock, a
// building or a designed place's tiles, nor anything within a couple of tiles of a road or a building - in a town the
// river keeps its quays. The water of the widened channel is the river's; what it cuts past its end is the sea's. The
// pages blend the two waters where they meet (client/art2/water.js mouths). For the whole-world build only
// (world3-world.js's done hook, after the outlets). Deterministic: arithmetic and integer hashes.
import { T, TILE } from './constants.js';
import { STREAMS, RIVER } from './world3-skeleton.js';
import { smoothPath } from './world3-land.js';

// len: the widening stretch, tiles (a multiple of the width, within these); flare: how much wider it ends, as a share
// of its width; add: tiles more either side at the end; open: tiles a side the opening widens per tile out past the
// end; wob: how far each bank wanders (tiles); sand: the beach's tiles up the banks at the mouth; near: a sea this close
// to a river's end (tiles past its banks) makes it a mouth; clear: tiles kept from a road or a building
export const ESTUARY3 = { len: [26, 64], lenK: 1.6, flare: 0.9, add: 4, open: 1, run: 8, wob: 2.4, jit: 1.2, sand: 5, near: 12, clear: 2, beach: 18, round: 3 };

const ih = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const HARD = new Set([T.ROAD, T.SIDEWALK, T.BRIDGE, T.DOCK, T.BUILDING, T.LOT, T.PLAZA, T.WALL, T.FLOOR, T.COUNTER]);
const OPEN = new Set([T.GRASS, T.DIRT, T.SAND, T.FIELD]);

// openSea(i): whether tile i is the open sea as the land laid it (world3-land.js WATER3: not a lagoon in the marsh, a
// pond or a river's own water); lines: the rivers (world3-skeleton.js's, or a test's: [{ name, width, pts }])
export function estuaries3(m, H3, openSea = null, lines = null) {
  const out = { mouths: [], water: 0, sand: 0 };
  const W = m.w, H = m.h, E = ESTUARY3;
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1);
  const wet = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP || m.tiles[i] === T.BRIDGE;
  const sea = (i) => i >= 0 && wet(i) && !m.land[i] && !(m.lake && m.lake[i]) && !(m.river && m.river[i]) && (!openSea || openSea(i));
  const rail = new Set();
  const open = (i) => {
    if (i < 0 || rail.has(i) || !OPEN.has(m.tiles[i]) || (m.bld && m.bld[i] >= 0) || (m.reserve && (m.reserve[i] & (16 | 32)))) return false;
    const x = i % W, y = (i - x) / W, c = E.clear;
    for (let dy = -c; dy <= c; dy++) for (let dx = -c; dx <= c; dx++) { const j = at(x + dx, y + dy); if (j >= 0 && (HARD.has(m.tiles[j]) || (m.bld && m.bld[j] >= 0))) return false; }
    return true;
  };
  const gone = new Set();
  for (const S of lines || [...STREAMS, RIVER].filter(Boolean)) {
    const P0 = smoothPath(S).pts;
    for (const end of [1, 0]) {
      const P = end ? P0 : [...P0].reverse(), n = P.length;
      if (n < 3) continue;
      const hw0 = S.width / 2, e = P[n - 1];
      // a mouth: open sea near its end
      const r = Math.ceil(hw0 + E.near);
      let seaNear = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (sea(at(Math.floor(e[0]) + dx, Math.floor(e[1]) + dy))) seaNear++;
      if (!seaNear) continue;
      // the way it runs at its end, and how far on along that the sea begins
      const s = [0];
      for (let j = 1; j < n; j++) s.push(s[j - 1] + Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]));
      const Lend = s[n - 1], back = (d) => { let j = n - 1; while (j > 0 && Lend - s[j - 1] < d) j--; const a = P[Math.max(0, j - 1)], b = P[j], t = s[j] - s[j - 1] > 0 ? (Lend - d - s[j - 1]) / (s[j] - s[j - 1]) : 0; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
      const p10 = back(Math.min(10, Lend)), ul = Math.hypot(e[0] - p10[0], e[1] - p10[1]) || 1, ux = (e[0] - p10[0]) / ul, uy = (e[1] - p10[1]) / ul;
      let tSea = -1;
      for (let t = -Math.floor(hw0); t <= hw0 + 40; t++) if (sea(at(Math.floor(e[0] + ux * t), Math.floor(e[1] + uy * t)))) { tSea = t; break; }
      if (tSea < -hw0) continue;
      const Lf = Math.max(E.len[0], Math.min(E.len[1], S.width * E.lenK + 12)), ext = Math.max(0, tSea) + E.run;
      // the stretch it widens over: the line's last Lf tiles, then on past its end out into the sea
      const Q = [back(Math.min(Lf, Lend))];
      for (let j = 0; j < n; j++) if (Lend - s[j] < Lf) Q.push(P[j]);
      Q.push([e[0] + ux * ext, e[1] + uy * ext]);
      const qs = [0];
      for (let j = 1; j < Q.length; j++) qs.push(qs[j - 1] + Math.hypot(Q[j][0] - Q[j - 1][0], Q[j][1] - Q[j - 1][1]));
      const Lq = qs[qs.length - 1], Lin = Math.min(Lf, Lend), seed = (Math.floor(e[0]) * 31 + Math.floor(e[1])) | 0;
      // each bank's slow wander along the stretch (0..1 eased between hashes every 9 tiles)
      const wander = (sj, side) => { const k = Math.floor(sj / 9), f = sj / 9 - k, a = ih(k, seed, side), b = ih(k + 1, seed, side), q = f * f * (3 - 2 * f); return a + (b - a) * q; };
      const Lsea = Lin + Math.max(0, tSea);   // (where the sea begins along it: the opening widens only from there)
      const halfW = (sj, side) => {
        const f = Math.max(0, Math.min(1, sj / Lin)), ease = f * f * (3 - 2 * f), past = Math.max(0, sj - Lsea);
        return hw0 * (1 + E.flare * ease) + E.add * ease + past * E.open + E.wob * ease * (wander(sj, side) * 2 - 1);
      };
      // the coast at the mouth: a beach (sand along the sea round where it opens)?
      const fx = Math.floor(e[0] + ux * Math.max(0, tSea)), fy = Math.floor(e[1] + uy * Math.max(0, tSea));
      let sandN = 0;
      for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) { const j = at(fx + dx, fy + dy); if (j >= 0 && m.tiles[j] === T.SAND) sandN++; }
      const beachy = sandN >= E.beach;
      const maxHW = hw0 * (1 + E.flare) + E.add + Math.max(0, Lq - Lsea) * E.open + E.wob + E.sand + 2;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const [x, y] of Q) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
      const X0 = Math.max(0, Math.floor(bx0 - maxHW)), X1 = Math.min(W - 1, Math.ceil(bx1 + maxHW)), Y0 = Math.max(0, Math.floor(by0 - maxHW)), Y1 = Math.min(H - 1, Math.ceil(by1 + maxHW));
      let nw = 0, ns = 0;
      const toSand = [];
      // the railway's line across the ground here: kept (the main line runs along the coast - nothing cut from under it)
      rail.clear();
      for (const R of m.rails || []) for (const p of R.pts || []) {
        if (p.under || p.bore) continue;
        const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
        if (tx < X0 - 4 || tx > X1 + 4 || ty < Y0 - 4 || ty > Y1 + 4) continue;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = at(tx + dx, ty + dy); if (j >= 0) rail.add(j); }
      }
      for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
        const i = y * W + x;
        if (wet(i)) continue;
        // the nearest point of the stretch: how far along it, how far from it and on which side
        const cx = x + 0.5, cy = y + 0.5;
        let bd = Infinity, bsj = 0, side = 0;
        for (let j = 1; j < Q.length; j++) {
          const ax = Q[j - 1][0], ay = Q[j - 1][1], dx = Q[j][0] - ax, dy = Q[j][1] - ay, L2 = dx * dx + dy * dy;
          let t = L2 ? ((cx - ax) * dx + (cy - ay) * dy) / L2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t, qy = ay + dy * t, d = Math.hypot(cx - qx, cy - qy);
          if (d < bd) { bd = d; bsj = qs[j - 1] + t * Math.sqrt(L2); side = dx * (cy - ay) - dy * (cx - ax) > 0 ? 1 : 2; }
        }
        if (bsj <= 0.5 && bd > hw0) continue;   // (above the stretch: the river as it was)
        const hw = halfW(bsj, side) + (ih(x, y, seed + 7) - 0.5) * E.jit * Math.min(1, bsj / Lin);   // (and a tile's worth of raggedness: no straight cut along the grid)
        if (bd < hw) {
          if (!open(i)) continue;
          m.tiles[i] = T.WATER; m.land[i] = 0;
          if (m.river) m.river[i] = bsj < Lin - 1 ? 1 : 0;   // (the widened channel the river's; cut past its end, the sea's)
          if (m.lake) m.lake[i] = 0;
          if (m.reserve) m.reserve[i] &= ~(128 | 64 | 32);
          gone.add(i); nw++;
        } else if (beachy && bd < hw + E.sand * Math.min(1, bsj / Lin) + 1 && bsj > Lin * 0.3 && (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && open(i)) toSand.push(i);
      }
      // the corners where the opening meets the coast rounded off: open ground mostly ringed by water goes under too
      for (let pass = 0; pass < E.round; pass++) {
        const sink = [];
        for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
          const i = y * W + x;
          if (wet(i) || !open(i)) continue;
          let w8 = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const j = at(x + dx, y + dy); if (j < 0 || wet(j)) w8++; }
          if (w8 >= 5) sink.push(i);
        }
        for (const i of sink) { m.tiles[i] = T.WATER; m.land[i] = 0; if (m.river) m.river[i] = 0; if (m.lake) m.lake[i] = 0; if (m.reserve) m.reserve[i] &= ~(128 | 64 | 32); gone.add(i); nw++; }
      }
      for (const i of toSand) { if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) { m.tiles[i] = T.SAND; if (m.reserve) m.reserve[i] &= ~128; ns++; } }
      if (nw || ns) out.mouths.push({ name: S.name, x: Math.round(e[0]), y: Math.round(e[1]), water: nw, sand: ns, beach: beachy });
      out.water += nw; out.sand += ns;
    }
  }
  if (gone.size && H3 && H3.removeProps) H3.removeProps(m, (px, py) => gone.has(Math.floor(py / TILE) * W + Math.floor(px / TILE)));   // (what stood on the ground now under water)
  return out;
}
