// The falls chain, part 2: the ledge falls (the nature program, 2026-10-21; the handcraft research's 3.1, "a ledge fall
// across the whole width on rivers (SC3-D, NK1-F twin curtains) ... a staircase of steps on creeks (N1-E) ... each gets
// its plunge pool, mist, a viewpoint", and its R1, "below the falls: an emerald plunge pool, then rapids"). The rivers
// ran white down their steep reaches (shared/world3-rapids.js) but never fell: the only falls in the wilds were the
// designed places'. Now six of the steep reaches that run toward the camera start with a fall:
// - Long Ledge Falls on the woods' eastern river below Highland Woods: a band of basalt right across the river, the
//   water over it in a row of curtains between the rock ribs;
// - Granite Steps on the creek that leaves the peaks' river under Granite Peaks: three low ledges in a staircase;
// - Sandpiper Falls, the river's last ledge before the beach on the Sandpiper Coast;
// - Slickrock Falls in the Red Rock Desert's canyon river, over red sandstone;
// - Willow River Falls, where the river out of the woods comes down into Willow Valley's fields;
// - Mossy Ledge Falls at the outlet of a small lake in the north of the woods, just above the road's bridge.
// Each: the lip a row of rock from bank to bank (drawn as the water over it; boats stop at it, a swimmer goes down it
// and can't come back up - shared/ledges.js), the falls drawn over it (client/art2/game/statics.js
// addNature: 'ledgefall'), mist off its foot (client/art2/game/waterlife.js), a calm plunge pool below it where the big
// fish hold (the rapids' calm pockets: the fishing's 'pocket' spot), the white water starting below the pool, and a bench
// on the bank below with the falls' name on a post. No tree stands in front of them (shared/world3-falls.js).
// For the whole-world build only (shared/world3-world.js's done hook, after the rapids and before the falls in view).
// Deterministic: arithmetic and sqrt.
import { TILE, T } from './constants.js';
import { RAPIDS } from './world3-rapids.js';

// near: a tile by the top of the steep reach (the rapid starting nearest it, within 16 tiles); drop: px; steps: ledges
// in a staircase, gap tiles apart down the water; stone: the rock ('sand': red sandstone; else basalt)
export const LEDGES3 = [
  { name: 'Long Ledge Falls', near: [2516, 1522], drop: 64 },
  { name: 'Granite Steps', near: [1606, 896], drop: 44, steps: 3, gap: 9 },
  { name: 'Sandpiper Falls', near: [5603, 2727], drop: 56 },
  { name: 'Slickrock Falls', near: [5409, 2480], drop: 60, stone: 'sand' },
  { name: 'Willow River Falls', near: [1384, 1856], drop: 52 },
  { name: 'Mossy Ledge Falls', near: [1355, 591], drop: 40 },
];
const PIECE = 440;         // px of lip to a piece of the falls (each drawn with its rock either side: a buttress between)
const SEEDS = [31, 37, 41, 43];
const LIP = 96;            // (reserve on the lip's rock: drawn as the water over it - client/art2/game/groundbake.js)
// the water of a piece split into strands across its width w (px from its middle: [lo, hi], ...), low rock between -
// the same for the same width and seed (the art keeps one picture of each)
const strands = (w, sd) => { const out = []; let x = -w / 2 + 2; for (let i = 0; x < w / 2 - 14; i++) { const hi = Math.min(w / 2 - 2, x + Math.round(34 + hh(w, i, sd) * 76)); if (hi - x >= 14) out.push([Math.round(x), Math.round(hi)]); x = hi + Math.round(8 + hh(i, w, sd + 1) * 18); } return out; };
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function ledgeFalls3(m, H3) {
  const out = { falls: 0, steps: 0, lip: 0, pools: 0, benches: 0, names: [] };
  const V = m.waters;
  if (!V || !Array.isArray(V.ch) || !H3 || !H3.addProp) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const wet = (x, y) => inF(x, y) && (m.tiles[idx(x, y)] === T.WATER || m.tiles[idx(x, y)] === T.DEEP);
  const openRiver = (x, y) => wet(x, y) && m.river[idx(x, y)] && !(m.lake && m.lake[idx(x, y)]);
  const cum = (P) => { const S = [0]; for (let j = 1; j < P.length; j++) { const dx = P[j][0] - P[j - 1][0], dy = P[j][1] - P[j - 1][1]; S.push(S[j - 1] + Math.sqrt(dx * dx + dy * dy)); } return S; };
  const ptAt = (P, S, s) => { let q = 1; while (q < P.length - 1 && S[q] < s) q++; const t = Math.max(0, Math.min(1, (s - S[q - 1]) / ((S[q] - S[q - 1]) || 1))); return [P[q - 1][0] + (P[q][0] - P[q - 1][0]) * t, P[q - 1][1] + (P[q][1] - P[q - 1][1]) * t]; };
  const landOk = (x, y) => { if (!inF(x, y)) return false; const i = idx(x, y), t = m.tiles[i]; return m.land[i] && (t === T.GRASS || t === T.DIRT || t === T.SAND) && !(m.bld && m.bld[i] >= 0) && !(m.reserve[i] & (16 | 32)); };
  const trailNear = (x, y, r) => { for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { const X = x + dx, Y = y + dy; if (inF(X, Y) && m.land[idx(X, Y)] && (m.reserve[idx(X, Y)] & (1 | 2 | 8))) return true; } return false; };
  const clear = new Set(), P = [];
  for (const F of LEDGES3) {
    // the steep reach: the rapid starting nearest the spot
    let best = null;
    for (const c of V.ch) {
      if (!Array.isArray(c.r) || (c.k !== 'river' && c.k !== 'creek')) continue;
      const S = cum(c.pts);
      for (const r of c.r) { const p = ptAt(c.pts, S, r[0]), d = Math.sqrt((p[0] - F.near[0]) * (p[0] - F.near[0]) + (p[1] - F.near[1]) * (p[1] - F.near[1])); if (d < 16 && (!best || d < best.d)) best = { c, S, r, d }; }
    }
    if (!best) continue;
    const { c, S, r } = best, Lc = S[S.length - 1], steps = F.steps || 1, gap = F.gap || 9;
    let last = -1, made = 0, s = r[0] + 2;
    for (let k = 0; k < steps; k++, s += gap) {
      // (down the reach to where the water runs toward the camera - the falls face south - and a row across it is the
      // channel's own, not a junction's: within half again its width)
      let cx = 0, cy = 0, x0 = 0, x1 = -1;
      for (; s <= Math.min(Lc - 14, r[1] + 4); s += 1) {
        [cx, cy] = ptAt(c.pts, S, s);
        const a0 = ptAt(c.pts, S, s - 4), a1 = ptAt(c.pts, S, s + 4), ul = Math.sqrt((a1[0] - a0[0]) * (a1[0] - a0[0]) + (a1[1] - a0[1]) * (a1[1] - a0[1])) || 1;
        if ((a1[1] - a0[1]) / ul < 0.5) continue;
        const y = Math.round(cy);
        x0 = x1 = Math.round(cx);
        if (!wet(x0, y)) continue;
        while (wet(x0 - 1, y) && cx - x0 < 80) x0--;
        while (wet(x1 + 1, y) && x1 - cx < 80) x1++;
        if (x1 - x0 + 1 <= c.w * 1.5 + 6) break;
      }
      if (s > Math.min(Lc - 14, r[1] + 4)) break;
      // the lip: a row of rock across the water from bank to bank (boats stop at it; a swimmer goes down it and can't come
      // back up: shared/ledges.js) - under the falls, so the bake draws it as the river's water (reserve 64|32 on rock)
      const ly = Math.round(cy);
      for (let x = x0; x <= x1; x++) { const i = idx(x, ly); m.tiles[i] = T.WALL; if (m.lake) m.lake[i] = 0; m.reserve[i] |= LIP | 4; out.lip++; }
      // the falls over it: a few wide pieces along it, each its water split into strands by low ribs of rock (and the
      // taller ones in two tiers, a shelf pool between), the line bowed back upstream in the middle (a horseshoe, as water
      // wears a ledge) and a little ragged; boulders in the white water at the joins and the ends
      const xa = x0 * TILE - 8, xb = (x1 + 1) * TILE + 8, segs = [], drop = Math.round(F.drop * (1 - k * 0.14)), bow = Math.min(1, (xb - xa) / TILE / 40) * TILE;
      const footAt = (xx, j) => { const u = (xx - xa) / (xb - xa); return Math.round((ly + 1) * TILE - bow * (1 - (2 * u - 1) * (2 * u - 1)) + (hh(j, ly, 7) - 0.4) * 12); };
      const n = Math.max(1, Math.round((xb - xa) / PIECE)), span = (xb - xa) / n, w = Math.max(48, Math.round((span - 36) / 16) * 16);
      for (let j = 0; j < n; j++) {
        const mx = Math.round(xa + span * (j + 0.5)), sd = SEEDS[(j * 3 + k) % SEEDS.length], two = drop >= 52 && hh(j, ly, 13) < 0.5;
        segs.push({ x: mx, y: footAt(mx, j), w, d: drop, s: sd, k: two ? 'twoTier' : 'ledge', up: strands(w, sd), ...(two ? { st: strands(w, sd + 5) } : {}) });
      }
      for (let j = 0; j <= n; j++) {
        const bx = Math.round(xa + span * j + (j === 0 ? 10 : j === n ? -10 : 0)), s2 = Math.round(24 + hh(j, ly, 11) * 16);
        P.push(['boulder', bx, footAt(bx, j) + 16, 0, { s: s2 }]);
      }
      const fx = Math.round((xa + xb) / 2), fy = (ly + 1) * TILE;
      m.natureSites.push({ kind: 'ledgefall', name: F.name, step: k, x: fx, y: fy, falls: { x: fx, y: fy - 8, w: Math.round(xb - xa), drop }, segs, ...(F.stone ? { stone: F.stone } : {}) });
      // (what stood where the rock reaches onto the banks goes)
      for (let x2 = x0 - 3; x2 <= x1 + 3; x2++) for (let y = ly - 2; y <= ly + 1; y++) if (inF(x2, y)) clear.add(idx(x2, y));
      last = s; made++; out.steps++;
    }
    if (!made) continue;
    out.falls++; out.names.push(F.name);
    // the plunge pool below the last ledge: calm and deep, the white water after it
    const pr = Math.max(3, Math.min(7, Math.round(c.w * 0.22))), pool = Math.max(8, Math.min(16, pr * 2 + 4));
    const sp = last + 1 + pr + 1.5, [px0, py0] = ptAt(c.pts, S, sp);
    let ok = true;
    for (let dy = -pr; dy <= pr && ok; dy++) for (let dx = -pr; dx <= pr; dx++) if (dx * dx + dy * dy <= pr * pr && !openRiver(Math.round(px0) + dx, Math.round(py0) + dy)) { ok = false; break; }
    if (ok) { (c.p ||= []).push([Math.round(px0 * 10) / 10, Math.round(py0 * 10) / 10, pr, 2]); out.pools++; }   // (kind 2: a plunge pool - world3-rapids.js's are 0 an eddy, 1 a bend pool)
    const r0 = last + pool;
    c.r = c.r.filter((q) => q !== r);
    if (r[1] - r0 >= RAPIDS.min) c.r.push([Math.round(r0 * 10) / 10, r[1], r[2]]);   // (what's left of the white water, if it's still a rapid)
    c.r.sort((p, q) => p[0] - q[0]);
    if (!c.r.length) delete c.r;
    // the viewpoint: a bench on the bank beside the pool, looking up at the falls, the name on a post by it
    let seat = null;
    for (const dir of [-1, 1]) {
      let x = Math.round(px0);
      const y = Math.round(py0);
      while (wet(x, y) && Math.abs(x - px0) < 70) x += dir;
      if (!landOk(x, y) || !landOk(x + dir, y) || !landOk(x + dir * 2, y)) continue;
      const cand = { x: x + dir * 1.5, y, dir, trail: trailNear(x, y, 30) };
      if (!seat || (cand.trail && !seat.trail)) seat = cand;
    }
    if (seat) {
      const bx = (seat.x + 0.5) * TILE, by = (seat.y + 0.5) * TILE;
      P.push(['pbench', bx, by, 0, { a: -Math.PI / 2 }]);
      P.push(['textsign', bx + seat.dir * 52, by + 20, 0, { text: F.name.toUpperCase(), bg: '#5a3a22', fg: [250, 230, 180], z: 30 }]);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) clear.add(idx(Math.round(seat.x) + dx, seat.y + dy));
      out.benches++;
    }
  }
  if (clear.size && H3.removeProps) H3.removeProps(m, (x, y) => clear.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
  for (const [t, x, y, r, ex] of P) H3.addProp(m, t, Math.round(x), Math.round(y), r, ex);
  return out;
}
