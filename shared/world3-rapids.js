// World v3's rapids and calm pockets (rivers part 2: the nature program, 2026-10-20 - the owner's notes of 10-16, "rivers
// that look natural: ... calm fishing pockets" and "see-through clear water ... rapids"). Along every creek and river
// (m.waters' channels, each running downstream - world3-waterbodies.js), once the water bodies are known:
// - the rapids: where the land falls fast under the water (the relief's fall per tile over RAPIDS.win tiles at least
//   RAPIDS.slope: about the steepest tenth of all the rivers' length), in runs at least RAPIDS.min tiles long (or half
//   the channel's width), near ones joined, none at a channel's very ends: ch.r = [[s0, s1, k], ...] - tiles along the
//   centre line from its top, and how wild the water is (0.45 .. 1). The art draws them white - standing waves, foam
//   streaks, boulders strewn right across with their collars - and fast (client/art2/water.js).
// - the calm pockets: deep, slow water by a bank, where the fish hold - an eddy just below each rapid, on the inside of
//   its bend, and on the quiet reaches a pool under the cut bank on the outside of each tight bend, POCKETS.spacing
//   tiles apart along a channel at least: ch.p = [[x, y, r, kind], ...] (tiles; kind 0 an eddy, 1 a bend pool), only
//   where all its water is open river water (no bridge, dock or lake by it). The art draws them still, deep and dark,
//   with a slow swirl and the eddy's line of foam; the fishing calls it the 'pocket' spot (server/systems/fishing.js
//   habitatAt: the big trout and bass hold there); the anglers of the wilds take its bank first (wildfolk.js); the fish
//   are seen holding in it (client/art2/game/waterlife.js).
// For the whole-world build only (world3-world.js's done hook, after the water bodies). Arithmetic and sqrt only.
import { T } from './constants.js';

// step: the samples' spacing along a channel (tiles); win: the fall measured over this many tiles; slope: the fall per
// tile that makes a rapid; gap: runs this close joined; min: the shortest rapid; end: none this near a channel's ends;
// span: how much steeper than `slope` is the wildest water; wide: a river wider than this (tiles) has none - a big
// river's fall is a long glide, and white water right across it read as the sea gone wrong (the owner, 10-22: "some
// water has a rapid effect moving at a rapid pace"); mouth: none within this many of its widths of its lower end (where
// it opens out into the sea, a lake or the marsh); low: none where the land under its lower end is lower than this (the
// coast, the valley floors - a river cut through to the sea dropped steeply there and came out white to the beach)
export const RAPIDS = { step: 2, win: 16, slope: 0.13, gap: 10, min: 12, end: 10, span: 0.25, wide: 36, mouth: 2, low: 12 };
// spacing: tiles between a channel's pockets; apart: between any two pockets; below: an eddy this far below its rapid
// (tiles: half the channel's width, within these); turn: a bend pool where the channel turns through more than this (the
// cosine of the turn over `bendW` tiles either side); quiet: a bend pool this far from any rapid; r: the pocket's
// radius (a fifth of the channel's width or so, within these)
export const POCKETS = { spacing: 90, apart: 36, below: [5, 16], turn: 0.86, bendW: 16, quiet: 30, r: [3, 7] };

const ih = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function rapidsAndPockets3(m) {
  const V = m.waters, out = { rapids: 0, rapidTiles: 0, riverTiles: 0, eddies: 0, pools: 0, missed: 0 };
  if (!V || !Array.isArray(V.ch) || !m.relief) return out;
  const W = m.w, H = m.h, rel = m.relief;
  const at = (x, y) => { const tx = Math.round(x), ty = Math.round(y); return tx >= 0 && ty >= 0 && tx < W && ty < H ? ty * W + tx : -1; };
  const hAt = (x, y) => { let s = 0, n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = at(x + dx, y + dy); if (j >= 0) { s += rel[j]; n++; } } return n ? s / n : 0; };   // (the relief is dithered: a 5 x 5 mean)
  const openRiver = (i) => i >= 0 && (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) && m.river[i] && !(m.lake && m.lake[i]);
  const placed = [];
  // a pocket of radius r at (x, y) tiles: all its water open river water, nothing built near, no other pocket close
  const fits = (x, y, r) => {
    for (const q of placed) { const dx = q[0] - x, dy = q[1] - y; if (dx * dx + dy * dy < POCKETS.apart * POCKETS.apart) return false; }
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && !openRiver(at(x + dx, y + dy))) return false;
    const R = r + 4;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const i = at(x + dx, y + dy); if (i >= 0 && (m.tiles[i] === T.BRIDGE || m.tiles[i] === T.DOCK)) return false; }
    return true;
  };
  V.ch.forEach((c, ci) => {
    if (c.k !== 'river' && c.k !== 'creek') return;
    const P = c.pts, S = [0];
    for (let j = 1; j < P.length; j++) { const dx = P[j][0] - P[j - 1][0], dy = P[j][1] - P[j - 1][1]; S.push(S[j - 1] + Math.sqrt(dx * dx + dy * dy)); }
    const L = S[S.length - 1], step = RAPIDS.step;
    out.riverTiles += L;
    if (L < 40) return;
    // samples every `step` tiles down the centre line: where, and the land's height under it
    const n = Math.floor(L / step) + 1, xs = new Float64Array(n), ys = new Float64Array(n), hs = new Float64Array(n);
    let q = 1;
    for (let j = 0; j < n; j++) {
      const s = j * step;
      while (q < P.length - 1 && S[q] < s) q++;
      const t = clamp((s - S[q - 1]) / ((S[q] - S[q - 1]) || 1), 0, 1);
      xs[j] = P[q - 1][0] + (P[q][0] - P[q - 1][0]) * t; ys[j] = P[q - 1][1] + (P[q][1] - P[q - 1][1]) * t; hs[j] = hAt(xs[j], ys[j]);
    }
    // the fall per tile at each sample (over `win` tiles round it)
    const half = Math.max(1, Math.round(RAPIDS.win / step / 2)), sl = new Float64Array(n);
    for (let j = 0; j < n; j++) { const a = Math.max(0, j - half), b = Math.min(n - 1, j + half); sl[j] = b > a ? (hs[a] - hs[b]) / ((b - a) * step) : 0; }
    // the steep reaches: the steep runs, near ones joined, long enough (ch.st - where the ledge falls may start:
    // world3-ledgefalls.js, which drops it once it's placed them); the rapids, the white water drawn: those runs, or the
    // parts of them, that aren't right across a wide river, by its mouth or down at the coast (RAPIDS wide, mouth, low)
    const tail = Math.max(RAPIDS.end, c.w * RAPIDS.mouth), wide = c.w > RAPIDS.wide;
    const drawn = (j) => !wide && j * step <= L - tail && hs[Math.min(n - 1, j + half)] >= RAPIDS.low;
    const runsOf = (pick) => {
      const runs = [];
      let a0 = -1;
      for (let j = 0; j <= n; j++) {
        const on = j < n && sl[j] >= RAPIDS.slope && j * step >= RAPIDS.end && j * step <= L - RAPIDS.end && pick(j);
        if (on && a0 < 0) a0 = j;
        else if (!on && a0 >= 0) { const last = runs[runs.length - 1]; if (last && (a0 - last[1]) * step <= RAPIDS.gap) last[1] = j - 1; else runs.push([a0, j - 1]); a0 = -1; }
      }
      const out2 = [];
      for (const [a, b] of runs) {
        if ((b - a) * step < minLen) continue;
        let s = 0; for (let j = a; j <= b; j++) s += sl[j];
        out2.push([r1(a * step), r1(b * step), r2(clamp((s / (b - a + 1) - RAPIDS.slope) / RAPIDS.span + 0.45, 0.45, 1)), a, b]);
      }
      return out2;
    };
    const minLen = Math.max(RAPIDS.min, c.w * 0.5), ST = runsOf(() => true), R = runsOf(drawn).map((q) => q.slice(0, 3));
    for (const q of runsOf(drawn)) { out.rapids++; out.rapidTiles += (q[4] - q[3]) * step; }
    if (R.length) c.r = R;
    if (ST.length) c.st = ST.map((q) => q.slice(0, 3));
    // the way it runs at a sample, and which side it turns toward there (+1 toward (-uy, ux), -1 the other, 0 straight)
    const tan = (j, w) => { const a = Math.max(0, j - w), b = Math.min(n - 1, j + w), dx = xs[b] - xs[a], dy = ys[b] - ys[a], l = Math.sqrt(dx * dx + dy * dy) || 1; return [dx / l, dy / l]; };
    const bw = Math.max(2, Math.round(POCKETS.bendW / step));
    const bend = (j) => { const t1 = tan(Math.max(0, j - bw), 2), t2 = tan(Math.min(n - 1, j + bw), 2); return { cos: t1[0] * t2[0] + t1[1] * t2[1], side: t1[0] * t2[1] - t1[1] * t2[0] }; };
    const hw = c.w / 2, pr = clamp(Math.round(c.w * 0.22), POCKETS.r[0], POCKETS.r[1]), Pk = [], at_ = [];
    // a pocket by the bank on `side` at sample j, hugging it: out across the water from the centre line to the bank
    // there (a bar's edge, the wandering bank's), the pocket just inside it
    const wetAt = (x, y) => { const i = at(x, y); return i >= 0 && (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP || m.tiles[i] === T.BRIDGE); };
    const pocketAt = (j, side, kind) => {
      const [ux, uy] = tan(j, 2), nx = -uy * side, ny = ux * side;
      let bank = 0;
      while (bank < hw + 14 && wetAt(xs[j] + nx * (bank + 1), ys[j] + ny * (bank + 1))) bank++;
      const off0 = bank - pr - 1.2;
      if (off0 < 0) return false;
      for (const dd of [0, 1.5, 3]) {
        if (off0 - dd < 0) break;
        const x = r1(xs[j] + nx * (off0 - dd)), y = r1(ys[j] + ny * (off0 - dd));
        if (!fits(x, y, pr)) continue;
        Pk.push([x, y, pr, kind]); placed.push([x, y]); at_.push(j * step);
        return true;
      }
      return false;
    };
    // an eddy below each rapid, on the inside of its bend (else the other side)
    for (const [, s1] of R) {
      const j = Math.round((s1 + clamp(c.w * 0.5, POCKETS.below[0], POCKETS.below[1])) / step);
      if (j >= n - 2) continue;
      const b = bend(j), side = b.side > 0.02 ? 1 : b.side < -0.02 ? -1 : ih(ci, j, 7) < 0.5 ? 1 : -1;
      if (pocketAt(j, side, 0) || pocketAt(j, -side, 0)) out.eddies++;
      else out.missed++;
    }
    // the bend pools on the quiet reaches: the tightest bends first, under the cut bank on the outside
    const cand = [];
    for (let j = bw + 2; j < n - bw - 2; j++) {
      const b = bend(j);
      if (b.cos >= POCKETS.turn) continue;
      const s = j * step;
      if (R.some(([s0, s1]) => s > s0 - POCKETS.quiet && s < s1 + POCKETS.quiet)) continue;
      const pb = bend(j - 1), nb = bend(j + 1);
      if (pb.cos < b.cos || nb.cos < b.cos) continue;   // (the bend's tightest point)
      cand.push([b.cos, j, b.side > 0 ? -1 : 1]);
    }
    cand.sort((p, q2) => p[0] - q2[0] || p[1] - q2[1]);
    for (const [, j, side] of cand) {
      const s = j * step;
      if (at_.some((t) => Math.abs(t - s) < POCKETS.spacing)) continue;
      if (pocketAt(j, side, 1)) out.pools++;
    }
    if (Pk.length) c.p = Pk;
  });
  out.rapidTiles = Math.round(out.rapidTiles); out.riverTiles = Math.round(out.riverTiles);
  return out;
}
