// World v3's river banks (the nature program, 2026-10-20 - the owner's note of 10-16, "rivers that look natural: bends,
// banks, varied width, sandy and rocky shores"). Along every creek and river out in the country (the woods, the peaks,
// the farm valley, the desert, the Egret Coast - not in the towns, the lakes or the marsh), from its centre line
// (world3-skeleton.js STREAMS and RIVER, smoothed as the land cut them):
// - on the inside of each bend a gravel bar: shingle (T.SAND with reserve 128, the ground bake's river gravel) built out
//   into the water from the bank - wider the tighter the bend, never past a third of the channel - and up the bank
//   behind it;
// - on the outside of the bend the cut bank: bare earth (T.DIRT - the woods' duff, the peaks' scree, the desert's
//   sand by the ground under it) where the current digs in;
// - along the straight reaches between, the lush green strip (T.GRASS with reserve 128) that runs beside water even in
//   dry country.
// So the water's width wanders - narrower past each bar - and its edge changes as it goes. Only open ground and open
// water are touched: never a road, a bridge, a dock or a building, nor a designed place's tiles (its reserve bits set),
// and nothing within a few tiles of a road or a bridge. Pure arithmetic and integer hashes (CLAUDE.md: the same world
// in every engine).
import { T } from './constants.js';
import { STREAMS, RIVER } from './world3-skeleton.js';
import { smoothPath } from './world3-land.js';
import { LAKE_PIECES, MARSH_BOX } from './world3-waterbodies.js';

// the country districts (World v3's ids): the woods, the peaks, the farm valley, the desert, North Ridge, the Egret
// Coast and its rocks, Paradise Cay
export const BANK_DISTRICTS = new Set([45, 47, 48, 49, 50, 51, 53, 56]);
export const BANK = { step: 1, bend0: 0.12, bendK: 26, barMax: 0.33, upBank: 3, cut: 0.22, cutW: 2, lush: 0.08, lushW: 2, road: 3 };

const ih = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function riverBanks3(m) {
  const W = m.w, H = m.h, out = { bars: 0, barBank: 0, cut: 0, lush: 0 };
  const at = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return tx >= 0 && ty >= 0 && tx < W && ty < H ? ty * W + tx : -1; };
  // the tiles near a road, a bridge or a dock (kept clear): a mask over the frame, BANK.road tiles round each
  const nearRoad = new Uint8Array(W * H), R = BANK.road;
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const t = m.tiles[ty * W + tx];
    if (t !== T.ROAD && t !== T.BRIDGE && t !== T.DOCK && t !== T.SIDEWALK && t !== T.BUILDING) continue;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < W && y < H) nearRoad[y * W + x] = 1; }
  }
  const country = (i) => BANK_DISTRICTS.has(m.dist[i]);
  const openLand = (i) => i >= 0 && m.land[i] && !nearRoad[i] && !m.reserve[i] && (m.bld ? m.bld[i] < 0 : true) && (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) && country(i);
  const openWater = (i) => i >= 0 && m.tiles[i] === T.WATER && m.river[i] && !(m.lake && m.lake[i]) && !nearRoad[i];   // (the water's own district is the sea's: the bank's says whose country it is)
  const barred = [];   // (the bars' tiles: the water caught between them filled after)
  const lines = [RIVER, ...STREAMS].filter(Boolean).filter((S) => !LAKE_PIECES.has(`${(S.first || S.pts[0])[0]},${(S.first || S.pts[0])[1]}`));
  for (const S of lines) {
    const P = smoothPath(S).pts, hw = S.width / 2, n = P.length;
    if (n < 3) continue;
    // resample to a point a tile apart (the smoothed line's points are uneven)
    const Q = [P[0]];
    for (let j = 1; j < n; j++) {
      const a = Q[Q.length - 1], b = P[j], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy);
      if (d < BANK.step) continue;
      const k = Math.floor(d / BANK.step);
      for (let s = 1; s <= k; s++) Q.push([a[0] + dx * s / k, a[1] + dy * s / k]);
    }
    const w = Math.max(4, Math.round(hw * 1.2));   // (a bend is read over about a channel's width each side)
    for (let j = w; j + w < Q.length; j++) {
      const c = Q[j];
      const mid = c[0] >= MARSH_BOX[0] && c[0] <= MARSH_BOX[2] && c[1] >= MARSH_BOX[1] && c[1] <= MARSH_BOX[3];
      if (mid) continue;   // (the marsh: braided, low, its own)
      const u = [c[0] - Q[j - w][0], c[1] - Q[j - w][1]], v = [Q[j + w][0] - c[0], Q[j + w][1] - c[1]];
      const lu = Math.sqrt(u[0] * u[0] + u[1] * u[1]), lv = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
      if (!lu || !lv) continue;
      const bend = (u[0] * v[1] - u[1] * v[0]) / (lu * lv), sb = bend < 0 ? -1 : 1, ab = bend * sb;   // (the sine of the turn; its side)
      const tx = (u[0] + v[0]) / (lu + lv), ty = (u[1] + v[1]) / (lu + lv), tl = Math.sqrt(tx * tx + ty * ty) || 1;
      const t0 = [tx / tl, ty / tl], nrm = [-t0[1], t0[0]];   // (along the channel; across it, to its left)
      const put = (side, d0, d1, f) => {   // the tiles from d0 to d1 tiles off the centre line on this side (and a tile along each way)
        for (let d = d0; d <= d1; d += 0.5) for (const l of [-0.7, 0, 0.7]) {
          const i = at(c[0] + nrm[0] * side * d + t0[0] * l, c[1] + nrm[1] * side * d + t0[1] * l);
          if (i >= 0) f(i);
        }
      };
      if (ab > BANK.bend0) {
        // the inside: the bar out into the water (wider the tighter the bend, a little ragged), and shingle up the bank
        const bar = Math.min(hw * BANK.barMax, (ab - BANK.bend0) * BANK.bendK) * (0.75 + ih(Math.floor(c[0]), Math.floor(c[1]), 11) * 0.5);
        const bank = at(c[0] + nrm[0] * sb * (hw + 1.5), c[1] + nrm[1] * sb * (hw + 1.5));
        if (bar >= 1 && bank >= 0 && m.land[bank] && country(bank)) put(sb, hw - bar, hw - 0.5, (i) => { if (openWater(i)) { m.tiles[i] = T.SAND; m.land[i] = 1; m.river[i] = 0; m.reserve[i] |= 128; out.bars++; barred.push(i); } });
        put(sb, hw, hw + BANK.upBank, (i) => { if (openLand(i) && !(m.reserve[i] & 128)) { m.tiles[i] = T.SAND; m.reserve[i] |= 128; out.barBank++; } });
        // the outside: the cut bank's gravel
        if (ab > BANK.cut) put(-sb, hw, hw + BANK.cutW, (i) => { if (openLand(i) && m.tiles[i] === T.GRASS) { m.tiles[i] = T.DIRT; out.cut++; } });
      } else if (ab < BANK.lush) {
        // a straight reach: green banks both sides
        for (const side of [1, -1]) put(side, hw, hw + BANK.lushW, (i) => { if (openLand(i) && m.tiles[i] === T.GRASS) { m.reserve[i] |= 128; out.lush++; } });
      }
    }
  }
  // the slivers of water left inside a bar (the strokes' lattice): a water tile with bar on three sides or more is bar
  const isBar = (i) => m.tiles[i] === T.SAND && (m.reserve[i] & 128);
  for (let pass = 0; pass < 2; pass++) for (const j of barred) for (const k of [j - 1, j + 1, j - W, j + W]) {
    if (k < 0 || k >= W * H || !openWater(k)) continue;
    let n = 0;
    for (const q of [k - 1, k + 1, k - W, k + W]) if (q >= 0 && q < W * H && isBar(q)) n++;
    if (n >= 3) { m.tiles[k] = T.SAND; m.land[k] = 1; m.river[k] = 0; m.reserve[k] |= 128; out.bars++; barred.push(k); }
  }
  return out;
}
