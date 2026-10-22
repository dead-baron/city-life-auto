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
// - Mossy Ledge Falls at the outlet of a small lake in the north of the woods, just above the road's bridge;
// - Twin Falls (2026-10-21, WC186's "twin waterfalls in a granite gorge", the research's "twin falls off the rocky
//   knoll"): in Highland Woods below the fire lookout, where the wide river splits round an island. The island's head
//   is a knoll of granite with pines on it and the river falls off both its sides: a narrow fall in the west arm, a
//   wide one in the east. Two fenced overlooks face each other across the gorge, a footbridge crosses the narrow arm
//   below, and there are golden aspens and fallen logs on the banks; a camp on the island below looks up at the falls.
// Each: the lip a row of rock from bank to bank (drawn as the water over it; boats stop at it, a swimmer goes down it
// and can't come back up - shared/ledges.js), the falls drawn over it (client/art2/game/statics.js
// addNature: 'ledgefall'), mist off its foot (client/art2/game/waterlife.js), a calm plunge pool below it where the big
// fish hold (the rapids' calm pockets: the fishing's 'pocket' spot), the white water starting below the pool, and a bench
// on the bank below with the falls' name on a post; where the outlet's narrow enough, a footbridge across it below the
// pool. No tree stands in front of them (shared/world3-falls.js). (A knoll's falls are two sites, one per arm.)
// For the whole-world build only (shared/world3-world.js's done hook, after the rapids and before the falls in view).
// Deterministic: arithmetic and sqrt.
import { TILE, T } from './constants.js';
import { RAPIDS } from './world3-rapids.js';
import { camp3, campFits, campQuiet } from './world3-camps.js';

// near: a tile by the top of the steep reach (the rapid starting nearest it, within 16 tiles); drop: px; steps: ledges
// in a staircase, gap tiles apart down the water; stone: the rock ('sand': red sandstone; else basalt); knoll: the falls
// where an island splits the river - one either side of its rocky head; camp: a camp of that kind
// (shared/world3-camps.js) on the bank by the pool, across from the bench
export const LEDGES3 = [
  { name: 'Long Ledge Falls', near: [2516, 1522], drop: 64 },
  { name: 'Granite Steps', near: [1606, 896], drop: 44, steps: 3, gap: 9 },
  { name: 'Sandpiper Falls', near: [5603, 2727], drop: 56 },
  { name: 'Slickrock Falls', near: [5409, 2480], drop: 60, stone: 'sand', camp: 'canyon' },
  { name: 'Willow River Falls', near: [1384, 1856], drop: 52 },
  { name: 'Mossy Ledge Falls', near: [1355, 591], drop: 40, camp: 'woods' },
  { name: 'Twin Falls', near: [1211, 1223], drop: 60, knoll: true },
];
const KNOLL = { arm: 5, gap: [6, 30], below: 6, above: 8, max: 900, deck: 4 };   // (tiles: the narrowest arm; the rock between; the knoll's rock below the lip and above it; the most of it; an overlook's deck)
const PIECE = 440;         // px of lip to a piece of the falls (each drawn with its rock either side: a buttress between)
const SEEDS = [31, 37, 41, 43];
const BRIDGE = { max: 26 };   // (tiles: the widest outlet a footbridge spans)
const LIP = 96;            // (reserve on the lip's rock: drawn as the water over it - client/art2/game/groundbake.js)
// the water of a piece split into strands across its width w (px from its middle: [lo, hi], ...), low rock between -
// the same for the same width and seed (the art keeps one picture of each)
const strands = (w, sd) => { const out = []; let x = -w / 2 + 2; for (let i = 0; x < w / 2 - 14; i++) { const hi = Math.min(w / 2 - 2, x + Math.round(34 + hh(w, i, sd) * 76)); if (hi - x >= 14) out.push([Math.round(x), Math.round(hi)]); x = hi + Math.round(8 + hh(i, w, sd + 1) * 18); } return out; };
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function ledgeFalls3(m, H3) {
  const out = { falls: 0, steps: 0, lip: 0, pools: 0, benches: 0, bridges: 0, names: [] };
  const V = m.waters;
  if (!V || !Array.isArray(V.ch) || !H3 || !H3.addProp) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const wet = (x, y) => inF(x, y) && (m.tiles[idx(x, y)] === T.WATER || m.tiles[idx(x, y)] === T.DEEP);
  const openRiver = (x, y) => wet(x, y) && m.river[idx(x, y)] && !(m.lake && m.lake[idx(x, y)]);
  const cum = (P) => { const S = [0]; for (let j = 1; j < P.length; j++) { const dx = P[j][0] - P[j - 1][0], dy = P[j][1] - P[j - 1][1]; S.push(S[j - 1] + Math.sqrt(dx * dx + dy * dy)); } return S; };
  const ptAt = (P, S, s) => { let q = 1; while (q < P.length - 1 && S[q] < s) q++; const t = Math.max(0, Math.min(1, (s - S[q - 1]) / ((S[q] - S[q - 1]) || 1))); return [P[q - 1][0] + (P[q][0] - P[q - 1][0]) * t, P[q - 1][1] + (P[q][1] - P[q - 1][1]) * t]; };
  const landOk = (x, y) => { if (!inF(x, y)) return false; const i = idx(x, y), t = m.tiles[i]; return m.land[i] && (t === T.GRASS || t === T.DIRT || t === T.SAND) && !(m.bld && m.bld[i] >= 0) && !(m.reserve[i] & (16 | 32)); };
  const trailNear = (x, y, r) => { for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { const X = x + dx, Y = y + dy; if (inF(X, Y) && m.land[idx(X, Y)] && (m.reserve[idx(X, Y)] & (1 | 2 | 8))) return true; } return false; };
  // (a knoll's falls: the row split in two by an island - the arm the centre line is in and another across a piece of
  // land 6-30 tiles wide whose upstream end, a few rows up, is the island's tip; both arms open water, the banks beyond)
  const armsAt = (cx0, y) => {
    const main = runAt(y, cx0);
    if (!main || main[1] - main[0] + 1 < KNOLL.arm) return null;
    for (const dir of [-1, 1]) {
      let x = dir < 0 ? main[0] - 1 : main[1] + 1, g = 0;
      while (!wet(x, y) && g <= KNOLL.gap[1]) { if (!m.land[idx(x, y)]) g = 1e9; x += dir; g++; }
      if (g < KNOLL.gap[0] || g > KNOLL.gap[1]) continue;
      const other = runAt(y, x);
      if (!other || other[1] - other[0] + 1 < KNOLL.arm) continue;
      const arms = dir < 0 ? [other, main] : [main, other], gm = Math.round((arms[0][1] + arms[1][0]) / 2);
      let t = 1;
      while (t <= KNOLL.above && !wet(gm, y - t)) t++;
      if (t > KNOLL.above || !m.land[idx(arms[0][0] - 1, y)] || !m.land[idx(arms[1][1] + 1, y)]) continue;
      return arms;
    }
    return null;
  };
  // (the wet run on row y nearest x: an arm's water further down)
  const runAt = (y, x) => {
    let x0 = Math.round(x), k = 0;
    while (!wet(x0, y) && k < 12) { k++; x0 = Math.round(x) + (k % 2 ? (k + 1) / 2 : -k / 2); }
    if (!wet(x0, y)) return null;
    let a = x0, b = x0;
    while (wet(a - 1, y) && x0 - a < 80) a--;
    while (wet(b + 1, y) && b - x0 < 80) b++;
    return [a, b];
  };
  // a footbridge from e0 to e1 (tiles): bridge tiles over the water under it (walkers cross; swimmers and boats pass
  // beneath, the water drawn under it)
  const footbridge = (e0, e1) => {
    const L2 = Math.sqrt((e1[0] - e0[0]) * (e1[0] - e0[0]) + (e1[1] - e0[1]) * (e1[1] - e0[1])), ux = (e1[0] - e0[0]) / L2, uy = (e1[1] - e0[1]) / L2;
    for (let d = 0; d <= L2; d += 0.25) for (const o of [-0.6, 0, 0.6]) {
      const x = Math.floor(e0[0] + ux * d - uy * o), y = Math.floor(e0[1] + uy * d + ux * o), i = idx(x, y);
      if (wet(x, y)) { m.tiles[i] = T.BRIDGE; m.reserve[i] |= 32 | 4; }
    }
    P.push(['fbridge', ((e0[0] + e1[0]) / 2) * TILE, ((e0[1] + e1[1]) / 2) * TILE, 0, { len: Math.round(L2 * TILE + 40), a: Math.round(Math.atan2(uy, ux) * 1000) / 1000 }]);
    out.bridges++;
  };
  // a knoll's falls: the island's head between the two arms turned to granite with pines on it, a plunge pool below
  // each fall, a footbridge over the narrower arm below, an overlook on each bank facing the other across the gorge
  const knoll = (F, c, arms, ly) => {
    const [A, B] = arms, K = { rock: 0, pools: 0, decks: 0, bridge: 0, camp: null };
    // the rock: the island's land from its tip to KNOLL.below rows under the lip, the puddles in it filled - between the
    // falls' ends (under a fall the ground stays open: its drop - shared/ledges.js - is the lip alone)
    const rock = new Set(), st = [], plainAt = (i) => m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND;
    for (let x = A[1] + 1; x < B[0]; x++) { rock.add(idx(x, ly)); st.push(x, ly); }
    while (st.length && rock.size < KNOLL.max) {
      const y = st.pop(), x = st.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, i = idx(X, Y);
        if (Y < ly - KNOLL.above || Y > ly + KNOLL.below || X <= A[1] || X >= B[0] || rock.has(i) || !inF(X, Y) || wet(X, Y) || !m.land[i] || !plainAt(i)) continue;
        rock.add(i); st.push(X, Y);
      }
    }
    if (rock.size < KNOLL.max) {
      const rows = new Map();
      for (const i of rock) { const x = i % W, y = (i - x) / W, r2 = rows.get(y); if (!r2) rows.set(y, [x, x]); else { r2[0] = Math.min(r2[0], x); r2[1] = Math.max(r2[1], x); } }
      for (const [y, [a, b]] of rows) for (let x = a; x <= b; x++) if (wet(x, y)) rock.add(idx(x, y));
      for (const i of rock) { m.tiles[i] = T.WALL; m.reserve[i] |= 32 | 4; m.land[i] = 1; if (m.river) m.river[i] = 0; if (m.lake) m.lake[i] = 0; clear.add(i); }
      K.rock = rock.size;
      // boulders on its head, pines on its back
      const top = [...rows.keys()].sort((p, q) => p - q);
      for (let j = 0; j < Math.min(3, top.length); j++) { const y = top[j], [a, b] = rows.get(y); P.push(['boulder', ((a + b) / 2 + (hh(j, y, 4601) - 0.5) * (b - a)) * TILE + 16, y * TILE + 16, 0, { s: 26 + Math.round(hh(j, y, 4602) * 14), style: 'granite', moss: j % 2 }]); }
      for (let j = 0, n = 0; j < 8 && n < 3; j++) {
        const y = ly + 2 + (j % 4), r2 = rows.get(y);
        if (!r2 || r2[1] - r2[0] < 4) continue;
        const x = Math.round(r2[0] + 2 + hh(j, y, 4603) * (r2[1] - r2[0] - 4));
        if (P.some((q) => q[0] === 'tree_a' && Math.abs(q[1] - (x + 0.5) * TILE) + Math.abs(q[2] - (y + 0.5) * TILE) < 3 * TILE)) continue;
        P.push(['tree_a', (x + 0.5) * TILE, (y + 0.5) * TILE, 12, { sp: hh(j, y, 4604) < 0.5 ? 'pondPine' : 'fir', k: 1.3 + hh(j, y, 4605) * 0.3 }]); n++;
      }
    }
    // a plunge pool below each fall (the arm's water as it runs on), as small as it must be to fit
    for (const [p0, q0] of arms) {
      for (let pr = Math.max(2, Math.min(7, Math.round((q0 - p0 + 1) * 0.22))); pr >= 2; pr--) {
        const y = Math.round(ly + 1 + pr + 1.5), run = runAt(y, (p0 + q0) / 2);
        if (!run) continue;
        const px0 = (run[0] + run[1]) / 2;
        let ok = true;
        for (let dy = -pr; dy <= pr && ok; dy++) for (let dx = -pr; dx <= pr; dx++) if (dx * dx + dy * dy <= pr * pr && !openRiver(Math.round(px0) + dx, y + dy)) { ok = false; break; }
        if (ok) { (c.p ||= []).push([Math.round(px0 * 10) / 10, y, pr, 2]); out.pools++; K.pools++; break; }
      }
    }
    // a footbridge over the narrower arm further down, from its bank to the island, where it's narrowest
    const narrow = A[1] - A[0] <= B[1] - B[0] ? 0 : 1;
    let fb = null;
    for (let y = ly + KNOLL.below + 1; y <= ly + KNOLL.below + 30; y++) {
      const run = runAt(y, narrow ? (B[0] + B[1]) / 2 : (A[0] + A[1]) / 2);
      if (!run || run[1] - run[0] + 3 > BRIDGE.max || !landOk(run[0] - 1, y) || !landOk(run[1] + 1, y)) continue;
      if (!fb || run[1] - run[0] < fb.run[1] - fb.run[0]) fb = { y, run };
    }
    if (fb) { footbridge([fb.run[0] - 0.5, fb.y + 0.5], [fb.run[1] + 1.5, fb.y + 0.5]); K.bridge = 1; }
    // the overlooks: a railed deck on each bank just below the falls, its open side to the land, a bench on it looking
    // across; golden aspens behind and a fallen log; the falls' name on a post by the west one
    for (const side of [-1, 1]) {
      const arm = side < 0 ? A : B;
      for (let y0 = ly + 2; y0 <= ly + 10; y0++) {
        const run = runAt(y0 + 1, (arm[0] + arm[1]) / 2);
        if (!run) continue;
        const xe = side < 0 ? run[0] - 1 : run[1] + 1, cells = [];
        for (let a = 0; a < KNOLL.deck; a++) for (let b = 0; b < KNOLL.deck; b++) cells.push([xe + side * a, y0 + b]);
        if (!cells.every(([x, y]) => landOk(x, y))) continue;
        for (const [x, y] of cells) { m.reserve[idx(x, y)] |= 32 | 4; }
        for (let y = y0 - 2; y < y0 + KNOLL.deck + 2; y++) for (let x = xe + side * (KNOLL.deck + 3); x !== xe - side * 2; x -= side) if (inF(x, y)) clear.add(idx(x, y));
        const dx = (xe + side * (KNOLL.deck - 1) / 2 + 0.5) * TILE, dy = (y0 + KNOLL.deck / 2) * TILE, a = side < 0 ? 0 : Math.PI;
        P.push(['viewdeck', dx, dy, 0, { len: KNOLL.deck * TILE, w: KNOLL.deck * TILE, a }]);
        P.push(['pbench', dx - side * 0.9 * TILE, dy, 0, { a, lift: 8 }]);
        const bx = dx + side * (KNOLL.deck / 2 + 1.4) * TILE;
        if (side < 0) P.push(['textsign', bx, dy - 1.4 * TILE, 0, { text: F.name.toUpperCase(), bg: '#5a3a22', fg: [250, 230, 180], z: 30 }]);
        for (let j = 0; j < 2; j++) { const tx = Math.floor(bx / TILE) + side * (1 + j), ty = y0 - 1 + j * (KNOLL.deck + 1); if (landOk(tx, ty)) P.push(['tree_a', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 12, { sp: 'aspen', k: 1.25 + hh(j, ty, 4606) * 0.25 }]); }
        P.push(['log', bx + side * 0.6 * TILE, dy + (KNOLL.deck / 2 + 1.2) * TILE, 0, { a: Math.round((0.35 + hh(side + 2, y0, 4607) * 0.5) * 100) / 100, len: 110 + Math.round(hh(side + 2, y0, 4608) * 40), moss: 1 }]);
        K.decks++;
        break;
      }
    }
    if (K.decks) out.benches++;
    // a camp on the island below, as near the falls as there's room, looking up at them (shared/world3-camps.js)
    for (let y = ly + KNOLL.below + 4; y <= ly + KNOLL.below + 40 && !K.camp; y++) {
      const ra = runAt(y, (A[0] + A[1]) / 2), rb = runAt(y, (B[0] + B[1]) / 2);
      if (!ra || !rb || ra[1] >= rb[0]) continue;
      const mid = (ra[1] + rb[0]) / 2;
      for (let d = 0; d <= (rb[0] - ra[1]) / 2 && !K.camp; d++) for (const x of d ? [Math.round(mid - d), Math.round(mid + d)] : [Math.round(mid)]) {
        if (K.camp || !campFits(m, x, y)) continue;
        K.camp = [x, y]; camp3(m, x, y, 'bar', -Math.PI / 2, (t, px, py, r, ex) => P.push([t, px, py, r, ex]), clear); (out.camps ||= []).push(F.name);
      }
    }
    (out.knolls ||= []).push({ name: F.name, ...K });
  };
  const clear = new Set(), P = [];
  for (const F of LEDGES3) {
    // the steep reach: the one starting nearest the spot (world3-rapids.js ch.st - its white water, ch.r, may be less of it)
    let best = null;
    for (const c of V.ch) {
      const st = c.st || c.r;
      if (!Array.isArray(st) || (c.k !== 'river' && c.k !== 'creek')) continue;
      const S = cum(c.pts);
      for (const r of st) { const p = ptAt(c.pts, S, r[0]), d = Math.sqrt((p[0] - F.near[0]) * (p[0] - F.near[0]) + (p[1] - F.near[1]) * (p[1] - F.near[1])); if (d < 16 && (!best || d < best.d)) best = { c, S, r, d }; }
    }
    if (!best) continue;
    const { c, S, r } = best, Lc = S[S.length - 1], steps = F.steps || 1, gap = F.gap || 9;
    let last = -1, made = 0, s = r[0] + 2, arms = null, lastLy = 0;
    for (let k = 0; k < steps; k++, s += gap) {
      // (down the reach to where the water runs toward the camera - the falls face south - and a row across it is the
      // channel's own, not a junction's: within half again its width)
      let cx = 0, cy = 0, x0 = 0, x1 = -1;
      for (; s <= Math.min(Lc - 14, r[1] + 4); s += 1) {
        [cx, cy] = ptAt(c.pts, S, s);
        const a0 = ptAt(c.pts, S, s - 4), a1 = ptAt(c.pts, S, s + 4), ul = Math.sqrt((a1[0] - a0[0]) * (a1[0] - a0[0]) + (a1[1] - a0[1]) * (a1[1] - a0[1])) || 1;
        if ((a1[1] - a0[1]) / ul < 0.5) continue;
        const y = Math.round(cy);
        if (F.knoll) { arms = armsAt(Math.round(cx), y); if (arms) break; continue; }
        x0 = x1 = Math.round(cx);
        if (!wet(x0, y)) continue;
        while (wet(x0 - 1, y) && cx - x0 < 80) x0--;
        while (wet(x1 + 1, y) && x1 - cx < 80) x1++;
        if (x1 - x0 + 1 <= c.w * 1.5 + 6) break;
      }
      if (s > Math.min(Lc - 14, r[1] + 4)) break;
      // the lip: a row of rock across the water from bank to bank (boats stop at it; a swimmer goes down it and can't come
      // back up: shared/ledges.js) - under the falls, so the bake draws it as the river's water (reserve 64|32 on rock)
      const ly = Math.round(cy), lips = arms || [[x0, x1]];
      lastLy = ly;
      lips.forEach(([x0, x1], j2) => {
        for (let x = x0; x <= x1; x++) { const i = idx(x, ly); m.tiles[i] = T.WALL; if (m.lake) m.lake[i] = 0; m.reserve[i] |= LIP | 4; out.lip++; }
        // the falls over it: a few wide pieces along it, each its water split into strands by low ribs of rock (and the
        // taller ones in two tiers, a shelf pool between), the line bowed back upstream in the middle (a horseshoe, as
        // water wears a ledge) and a little ragged; boulders in the white water at the joins and the ends
        const xa = x0 * TILE - 8, xb = (x1 + 1) * TILE + 8, segs = [], drop = Math.round(F.drop * (1 - k * 0.14)), bow = Math.min(1, (xb - xa) / TILE / 40) * TILE;
        const footAt = (xx, j) => { const u = (xx - xa) / (xb - xa); return Math.round((ly + 1) * TILE - bow * (1 - (2 * u - 1) * (2 * u - 1)) + (hh(j, ly, 7) - 0.4) * 12); };
        const n = Math.max(1, Math.round((xb - xa) / PIECE)), span = (xb - xa) / n, w = Math.max(48, Math.round((span - 36) / 16) * 16);
        for (let j = 0; j < n; j++) {
          const mx = Math.round(xa + span * (j + 0.5)), sd = SEEDS[(j * 3 + k + j2) % SEEDS.length], two = drop >= 52 && hh(j + j2 * 7, ly, 13) < 0.5;
          segs.push({ x: mx, y: footAt(mx, j), w, d: drop, s: sd, k: two ? 'twoTier' : 'ledge', up: strands(w, sd), ...(two ? { st: strands(w, sd + 5) } : {}) });
        }
        for (let j = 0; j <= n; j++) {
          const bx = Math.round(xa + span * j + (j === 0 ? 10 : j === n ? -10 : 0)), s2 = Math.round(24 + hh(j, ly, 11) * 16);
          P.push(['boulder', bx, footAt(bx, j) + 16, 0, { s: s2 }]);
        }
        const fx = Math.round((xa + xb) / 2), fy = (ly + 1) * TILE;
        m.natureSites.push({ kind: 'ledgefall', name: F.name, step: k + j2, x: fx, y: fy, falls: { x: fx, y: fy - 8, w: Math.round(xb - xa), drop }, segs, ...(F.stone ? { stone: F.stone } : {}) });
        // (what stood where the rock reaches onto the banks goes)
        for (let x2 = x0 - 3; x2 <= x1 + 3; x2++) for (let y = ly - 2; y <= ly + 1; y++) if (inF(x2, y)) clear.add(idx(x2, y));
        out.steps++;
      });
      if (arms) knoll(F, c, arms, ly);
      last = s; made++;
    }
    if (!made) continue;
    out.falls++; out.names.push(F.name);
    // the plunge pool below the last ledge: calm and deep, the white water after it
    const pr = Math.max(3, Math.min(7, Math.round(c.w * 0.22))), pool = Math.max(8, Math.min(16, pr * 2 + 4));
    const sp = last + 1 + pr + 1.5, [px0, py0] = ptAt(c.pts, S, sp);
    let ok = !F.knoll;
    for (let dy = -pr; dy <= pr && ok; dy++) for (let dx = -pr; dx <= pr; dx++) if (dx * dx + dy * dy <= pr * pr && !openRiver(Math.round(px0) + dx, Math.round(py0) + dy)) { ok = false; break; }
    if (ok) { (c.p ||= []).push([Math.round(px0 * 10) / 10, Math.round(py0 * 10) / 10, pr, 2]); out.pools++; }   // (kind 2: a plunge pool - world3-rapids.js's are 0 an eddy, 1 a bend pool)
    // (what's left of the white water below the pool, if it's still a rapid - none above it, down to the pool)
    const r0 = last + pool, rest = [];
    for (const q of c.r || []) {
      if (q[1] <= r[0] || q[0] >= r[1]) rest.push(q);   // (another reach's)
      else if (q[1] - Math.max(q[0], r0) >= RAPIDS.min) rest.push([Math.round(Math.max(q[0], r0) * 10) / 10, q[1], q[2]]);
    }
    rest.sort((p, q) => p[0] - q[0]);
    if (rest.length) c.r = rest; else delete c.r;
    if (c.st) c.st = c.st.filter((q) => q !== r);
    // a footbridge across the outlet below the pool where the river's narrow enough (walkers cross there; bridge tiles:
    // swimmers and boats pass beneath, the water drawn under it)
    const sb = last + pool + 3;
    if (sb < Lc - 6 && !F.knoll) {
      const [qx, qy] = ptAt(c.pts, S, sb), q0 = ptAt(c.pts, S, sb - 3), q1 = ptAt(c.pts, S, sb + 3), ql = Math.sqrt((q1[0] - q0[0]) * (q1[0] - q0[0]) + (q1[1] - q0[1]) * (q1[1] - q0[1])) || 1;
      const nx = -(q1[1] - q0[1]) / ql, ny = (q1[0] - q0[0]) / ql, wetAt = (x, y) => wet(Math.round(x - 0.5), Math.round(y - 0.5));
      let a = 0, b = 0;
      while (a < BRIDGE.max && wetAt(qx - nx * (a + 1), qy - ny * (a + 1))) a++;
      while (b < BRIDGE.max && wetAt(qx + nx * (b + 1), qy + ny * (b + 1))) b++;
      const e0 = [qx - nx * (a + 1.5), qy - ny * (a + 1.5)], e1 = [qx + nx * (b + 1.5), qy + ny * (b + 1.5)];
      if (a < BRIDGE.max && b < BRIDGE.max && a + b + 1 <= BRIDGE.max && landOk(Math.floor(e0[0]), Math.floor(e0[1])) && landOk(Math.floor(e1[0]), Math.floor(e1[1]))) {
        footbridge(e0, e1);
      }
    }
    // the viewpoint: a bench on the bank beside the pool, looking up at the falls, the name on a post by it
    let seat = null;
    for (const dir of F.knoll ? [] : [-1, 1]) {
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
    // a camp by the pool (F.camp): on open ground 6-30 tiles from it, away from the bench and any road, looking at the
    // falls
    if (F.camp) {
      const [qx, qy] = ptAt(c.pts, S, last + 1 + pr + 1.5);
      let best2 = null;
      for (let dy = -30; dy <= 30; dy++) for (let dx = -30; dx <= 30; dx++) {
        const x = Math.round(qx) + dx, y = Math.round(qy) + dy, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 6 || d > 30 || y < lastLy - 2 || (seat && Math.abs(x - seat.x) + Math.abs(y - seat.y) < 14) || !campFits(m, x, y) || !campQuiet(m, x, y, 12)) continue;
        const sc = d + (seat && Math.sign(x - qx) === seat.dir ? 20 : 0);   // (the other bank, if there's room)
        if (!best2 || sc < best2.sc) best2 = { x, y, sc };
      }
      if (best2) { camp3(m, best2.x, best2.y, F.camp, Math.atan2(qy - best2.y, qx - best2.x), (t, px, py, r, ex) => P.push([t, px, py, r, ex]), clear); (out.camps ||= []).push(F.name); }
    }
  }
  if (clear.size && H3.removeProps) H3.removeProps(m, (x, y) => clear.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
  for (const [t, x, y, r, ex] of P) H3.addProp(m, t, Math.round(x), Math.round(y), r, ex);
  for (const c of V.ch) delete c.st;   // (the steep reaches: only the falls needed them - the map keeps its white water, ch.r)
  return out;
}
