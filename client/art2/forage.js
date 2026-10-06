// Art v2 forage finds, modelled on the N9 concept sheet (docs/art-v2/targets/N9_forage.png): wild
// mushrooms (and the fictional glowing ones the black market buys), desert, shore and orchard finds, and
// the basket and sack they are carried in. Every find is drawn twice from one shape description:
//   icon(kind, size = 32)        inventory icon: the find on a little base (grass tuft, coal rocks, sand),
//                                transparent background, dark hue-tinted outline, soft drop shadow
//   groundSprite(kind, seed = 0) the find where it grows, at game scale (~8-14 px, a person is ~42 px):
//                                a cluster on forest floor or a log, crystals on dark rock, mussels on a
//                                wet stone, a berry bush... anchor = its foot, upright heights, flat ground
//                                pixels F_GROUND, ready for Scene.add in any biome scene
//   FORAGE[kind]  { name (fictional, player-facing), biomes, use: 'restaurant'|'cook'|'blackmarket'|'sell',
//                 glow (emissive colour or null), toxic (never cookable), carry (bag slots, for gear) }
//   ITEMS         the kinds in sheet order
// Shapes are given in a 32-unit box (the foot of a find at about v = 27). Prices live in shared/rules.js.
import { F_NOCAST, F_LEAF, hash } from './gbuf.js';
import { ramp, MAT } from './palette.js';
import { Pen } from './critters.js';

const R5 = (c, o) => ramp(c, 5, 2, o);
const M = {
  red: R5('#cc2e2a', { light: 0.5 }), cream: R5('#e8dcc2', { dark: 0.45 }), chant: R5('#eca42a', { light: 0.55 }), brown: R5('#8a4a26', { light: 0.55 }),
  pore: R5('#d8c88e', { dark: 0.4 }), oyster: R5('#bcae9c', { dark: 0.5 }), morel: R5('#a07a50'), puff: R5('#ece6d8', { dark: 0.4 }),
  lamp: R5('#3a8cff', { light: 0.7 }), widow: R5('#dadcb4', { dark: 0.42 }), violet: R5('#7428c4', { light: 0.5 }), glass: R5('#6a90d4', { light: 0.55, dark: 0.45 }),
  coal: R5('#3c3842', { light: 0.38 }), fruit: R5('#c42e52', { light: 0.5 }), flesh: R5('#f4867a', { light: 0.5 }), sage: R5('#84a06e', { light: 0.5 }),
  twine: ramp('#c8a060', 4, 2), cactus: R5('#4e8c3a', { light: 0.5 }), bloom: R5('#f0a424', { light: 0.6 }), mussel: R5('#2e3448', { light: 0.65 }),
  meat: ramp('#e8a050', 4, 2), kelp: R5('#6c5a1e', { light: 0.6 }), urchin: R5('#4e2252', { light: 0.6 }), spine: R5('#6e2c74', { light: 0.6 }),
  apple: R5('#c8302a', { light: 0.55 }), leaf: R5('#4a8a2e', { light: 0.5 }), straw: R5('#d82838', { light: 0.5 }), blue: R5('#3a4aa8', { light: 0.6 }),
  black: R5('#3a2244', { light: 0.5 }), rasp: R5('#c83050'), herb: R5('#5a8a3a', { light: 0.5 }), honey: R5('#e8a020', { light: 0.6 }),
  wicker: R5('#a8682e', { light: 0.5 }), sack: R5('#d8c8a6', { dark: 0.45 }), soil: MAT.soil, grass: MAT.grass, wood: R5('#6a4a30'), stone: R5('#8a8890', { light: 0.45 }),
  sand: ramp('#dcc29a', 4, 2), moss: R5('#5a7e2e'), white: [244, 240, 232], ink: [52, 34, 44], gold: [240, 214, 120],
};
const GLOW_V = [206, 112, 255], GLOW_B = [96, 176, 255], GLOW_G = [196, 224, 255];

// ---- bases under the icons ---------------------------------------------------------------------------
function tuftBase(p, back) {
  if (back) {
    p.ell(16, 27.4, 9.5, 2.4, M.soil, { k: 0.4, pat: (u, v, x, y) => (hash(x, y, 3) > 0.8 ? 0.25 : 0) });
    for (let i = 0; i < 9; i++) { const x = 7.5 + i * 2.1 + hash(i, 1, 5) * 1.2, h = 3 + hash(i, 2, 5) * 3.5; p.line([x, 27], [x + (hash(i, 3, 5) - 0.5) * 3, 27 - h], (t, X, Y) => MAT.grass[Math.min(5, 1 + Math.round(t * 4))], { ol: false }); }
    return;
  }
  for (let i = 0; i < 5; i++) { const x = 8 + i * 4 + hash(i, 4, 6) * 2, h = 2 + hash(i, 5, 6) * 2.5; p.line([x, 28.4], [x + (hash(i, 6, 6) - 0.5) * 2.5, 28.4 - h], (t) => MAT.grass[Math.min(5, 2 + Math.round(t * 3))], { ol: false }); }
  for (let i = 0; i < 3; i++) p.ell(9 + i * 7 + hash(i, 7, 6) * 3, 28.6, 0.9, 0.7, M.stone, { k: 0.5 });
}
function rockBase(p, back) {
  const R = back ? [[9, 25.6, 3.4, 2.4], [22.5, 25.4, 3.6, 2.6], [16, 25, 3, 2]] : [[6.5, 27.4, 2.6, 1.9], [12, 28, 3, 2.1], [19.5, 28.2, 3.2, 2], [25.5, 27.6, 2.6, 1.9]];
  R.forEach(([x, y, rx, ry], i) => p.ell(x, y, rx, ry, M.coal, { k: back ? 0.4 : 0.52, pat: (u, v, X, Y) => (hash(X, Y, 9 + i) > 0.8 ? 0.22 : 0) }));
}
function sandBase(p, back) {
  if (back) return;
  for (let i = 0; i < 22; i++) { const a = hash(i, 1, 8) * 6.28, r = 7 + hash(i, 2, 8) * 7; p.dot(16 + Math.cos(a) * r, 27.4 + Math.sin(a) * r * 0.25, M.sand[hash(i, 3, 8) > 0.5 ? 2 : 1], { ol: false }); }
}
function pebbleBase(p, back) {
  if (back) { p.ell(16, 27.6, 10, 2, M.sand, { k: 0.45 }); return; }
  for (let i = 0; i < 5; i++) p.ell(6 + i * 5 + hash(i, 1, 4) * 2, 28.2 + hash(i, 2, 4), 1.4, 1, M.stone, { k: 0.55 });
}
const BASES = { tuft: tuftBase, rocks: rockBase, sand: sandBase, pebbles: pebbleBase, none: () => {} };

// ---- the finds ------------------------------------------------------------------------------------------
const spots = (n, m, th) => (u, v, x, y) => { const cu = u * n + v * 0.6, cv = v * m, fu = cu - Math.round(cu), fv = cv - Math.round(cv); return fu * fu + fv * fv < th && hash(Math.round(cu), Math.round(cv), 5) > 0.2 ? M.white : 0; };
function capOn(p, x, y, rx, ry, R, o = {}) { p.ell(x, y, rx, ry, R, { k: 0.6, ...o, pat: (u, v, X, Y) => (v > (o.cut ?? 0.42) ? false : o.pat ? o.pat(u, v, X, Y) : 0) }); }
const DRAW = {
  redcap(p) {
    p.cap([16, 27], [16, 16], 2.4, 2.1, M.cream, { k: 0.58 });
    p.ell(16, 19.4, 3.3, 0.9, M.cream, { k: 0.7 });
    p.ell(16, 15.6, 8.4, 1.6, M.cream, { k: 0.32 });
    capOn(p, 16, 13, 9.2, 6.2, M.red, { pat: spots(2.4, 2.2, 0.11) });
  },
  goldTrumpet(p) {
    p.cap([16, 27], [16, 14], 1.6, 4.2, M.chant, { k: 0.5, pat: (t, s) => (Math.abs(Math.sin(s * 6)) > 0.8 ? -0.2 : 0) });
    for (const s of [-1, 1]) p.ell(16 + s * 7.4, 13.6, 2.4, 1.8, M.chant, { k: 0.5 });
    p.ell(16, 12, 9, 3.2, M.chant, { k: 0.66, pat: (u, v) => (Math.abs(v) > 0.72 + 0.22 * Math.sin(u * 9) ? false : v < -0.1 && Math.abs(u) < 0.6 ? -0.18 : 0) });
  },
  bunCap(p) {
    p.ell(16, 21.4, 5.2, 6, M.cream, { k: 0.56, pat: (u, v, x, y) => (hash(x, y, 2) > 0.8 ? -0.14 : 0) });
    p.ell(16, 15.8, 7.6, 1.4, M.pore, { k: 0.45 });
    capOn(p, 16, 13.4, 9, 6.4, M.brown, { cut: 0.36, pat: (u, v) => (u < -0.3 && v < -0.3 ? 0.18 : 0) });
  },
  shelfOyster(p) {
    p.cap([4.5, 26.5], [27.5, 25.8], 2.8, 2.8, M.wood, { k: 0.45, pat: (t, s, x, y) => (hash(x, y, 4) > 0.75 ? M.moss[2] : Math.abs(s) < 0.2 ? -0.2 : 0) });
    for (const [x, y, rx, ry, a] of [[11, 13.6, 6.4, 3.4, -0.2], [21, 12.4, 6.8, 3.6, 0.14], [13.6, 19.4, 6.2, 3.2, -0.08], [22.4, 19.6, 5.4, 3, 0.16]]) {
      p.ell(x, y, rx, ry, M.oyster, { a, k: 0.66, pat: (u, v) => (v > 0.05 ? (Math.round(Math.atan2(v + 1.2, u) * 9) % 2 ? -0.38 : -0.16) : v < -0.6 ? 0.1 : 0) });
    }
  },
  pittedSpire(p) {
    p.cap([16, 27], [16, 19.5], 2.8, 2.4, M.cream, { k: 0.6 });
    p.ell(16, 12, 5.6, 8.6, M.morel, { k: 0.6, pat: (u, v) => { const cv = v * 4.2, row = Math.floor(cv + 0.5), cu = u * 2.6 + (row & 1) * 0.5, fu = cu - Math.round(cu), fv = cv - row; return fu * fu * 1.3 + fv * fv < 0.1 ? [86, 58, 40] : 0.12; } });
  },
  moonPuff(p) { p.ell(16, 20, 7.4, 6.8, M.puff, { k: 0.6, pat: (u, v, x, y) => (hash(x, y, 7) > 0.86 ? -0.15 : 0) }); },
  bluelamp(p) {
    for (const [x, y, s] of [[11, 18.5, 0.9], [16.5, 13.5, 1.1], [21, 16.5, 1], [14, 21.5, 0.8], [23.5, 21.5, 0.75]]) {
      p.cap([x, 27], [x, y + 1], 0.7 * s, 0.6 * s, M.lamp, { k: 0.75, e: [...GLOW_B, 80] });
      capOn(p, x, y, 2.8 * s, 1.7 * s, M.lamp, { k: 0.72, cut: 0.3, e: (u, v) => [...GLOW_B, v < 0 ? 180 : 130] });
    }
  },
  paleWidow(p) {
    p.ell(16, 26, 3.4, 1.9, M.widow, { k: 0.5 });
    p.cap([16, 26], [16, 12], 1.7, 1.5, M.widow, { k: 0.62 });
    p.ell(16, 16.6, 3, 1, M.widow, { k: 0.72 });
    p.ell(16, 11.8, 6.8, 1.3, M.widow, { k: 0.34 });
    capOn(p, 16, 9.8, 7.6, 4.4, M.widow, { k: 0.66, pat: (u, v, x, y) => (hash(x, y, 9) > 0.86 ? -0.15 : 0) });
  },
  violetPrism(p) {
    for (const pts of [[[8.5, 27], [7.5, 21.5], [9.6, 19.5], [11.2, 26]], [[21.5, 27], [22.5, 20.5], [24.6, 22.4], [24, 27]], [[12.5, 27.5], [13, 23.5], [14.4, 23], [14.6, 27.5]]])
      p.poly(pts, M.violet, { k: 0.6, e: [...GLOW_V, 80] });
    p.cap([16, 26], [16, 13], 2.4, 2, M.violet, { k: 0.7, e: [...GLOW_V, 80] });
    capOn(p, 16, 11.4, 9.8, 6.2, M.violet, { k: 0.42, e: (u, v) => [...GLOW_V, v > 0.2 ? 90 : 30], pat: (u, v) => (v > 0.22 ? 0.35 : 0) });
  },
  ghostglass(p) {
    for (const pts of [[[7.5, 27], [5.8, 19], [8.4, 17.5], [10.6, 26.5]], [[21.8, 27], [24.2, 18.6], [26.2, 20.4], [25, 27]], [[11, 27.5], [12.2, 21], [13.6, 21.6], [13.8, 27.5]], [[18, 27.5], [18.4, 22], [20, 21], [20.6, 27.5]]])
      p.poly(pts, M.glass, { k: 0.6, e: [...GLOW_G, 30], pat: (u) => (Math.round(u * 2) % 2 ? 0.15 : 0) });
    p.poly([[14.2, 26], [14.8, 13], [17.4, 13], [17.8, 26]], M.glass, { k: 0.66, e: [...GLOW_G, 40] });
    p.poly([[6.6, 13.2], [10.8, 8.2], [16, 5.6], [21.4, 8], [25.4, 13], [16, 14.8]], M.glass, { k: 0.62, e: [...GLOW_G, 30], pat: (u, v) => (Math.abs(u - 16 + (v - 10) * 0.6) < 0.5 || Math.abs(u - 16 - (v - 10) * 0.6) < 0.5 ? 0.3 : v > 12.6 ? -0.2 : 0) });
  },
  desertRuby(p) {
    p.ell(12.5, 17, 5.6, 7.4, M.fruit, { a: -0.15, k: 0.58, pat: (u, v, x, y) => { const cu = u * 3, cv = v * 4; return Math.abs(cu - Math.round(cu)) < 0.15 && Math.abs(cv - Math.round(cv)) < 0.15 && (Math.round(cu) + Math.round(cv)) % 2 === 0 ? M.gold : 0; } });
    p.ell(22, 21.4, 5.4, 5, M.fruit, { k: 0.46 });
    p.ell(21, 21, 4.4, 4.1, M.flesh, { k: 0.62, lk: 0.3, pat: (u, v, x, y) => (Math.hypot(u, v) > 0.82 ? M.fruit[1] : Math.hypot(u, v) > 0.25 && hash(x, y, 4) > 0.78 ? [60, 28, 30] : 0), flatN: true });
  },
  dustSage(p) {
    for (let i = 0; i < 12; i++) {
      const a = -2.75 + i / 11 * 2.3 + (hash(i, 1, 3) - 0.5) * 0.15, l = 9 + hash(i, 2, 3) * 5, bx = 16 + Math.cos(a) * 1.2, by = 23.5;
      p.ell(bx + Math.cos(a) * l * 0.6, by + Math.sin(a) * l * 0.6, l * 0.5, 1.9, M.sage, { a, k: i % 2 ? 0.48 : 0.62, pat: (u, v) => (Math.abs(v) < 0.2 && u < 0.7 ? -0.18 : 0) });
    }
    for (let i = 0; i < 5; i++) p.line([14.6 + i * 0.7, 24], [14 + i * 1, 30.6], M.herb[1 + (i % 2)]);
    p.ell(16, 24.6, 3, 1.3, M.twine, { k: 0.6, pat: (u) => (Math.round(u * 3) % 2 ? -0.2 : 0) });
  },
  sunburstBloom(p) {
    const ribs = (u, v, x, y) => (Math.abs(Math.sin(u * 4.6)) > 0.9 ? -0.22 : hash(x, y, 6) > 0.9 ? M.gold : 0);
    p.ell(10.4, 21.4, 4.8, 5.8, M.cactus, { k: 0.5, pat: ribs });
    p.ell(22, 22.2, 4.6, 5, M.cactus, { k: 0.5, pat: ribs });
    p.ell(16, 18.4, 4.6, 7.2, M.cactus, { k: 0.6, pat: ribs });
    for (let i = 0; i < 11; i++) { const a = i / 11 * 6.28; p.ell(16 + Math.cos(a) * 3.3, 10 + Math.sin(a) * 2, 3, 1.2, M.bloom, { a, k: Math.sin(a) < 0 ? 0.5 : 0.7 }); }
    p.ell(16, 10, 1.8, 1.2, R5('#c85a1a'), { k: 0.5 });
  },
  rockMussels(p) {
    const lines = (u, v, x, y) => (Math.round(u * 5) % 2 && v > -0.4 ? -0.12 : hash(x, y, 2) > 0.9 ? M.stone[3] : 0);
    p.ell(11.5, 15.5, 7, 3.6, M.mussel, { a: -0.55, k: 0.5, pat: lines });
    p.ell(21.5, 16.6, 6.2, 3.1, M.mussel, { a: -0.25, k: 0.52, pat: lines });
    p.ell(13, 22.4, 8.4, 4, M.mussel, { a: 0.08, k: 0.5, pat: lines });
    p.ell(13.6, 22, 5.8, 2.3, M.meat, { a: 0.08, k: 0.6, pat: (u, v) => (Math.hypot(u, v) > 0.82 ? [40, 30, 34] : 0) });
    p.ell(23, 23.6, 4.6, 2.6, M.mussel, { a: 0.2, k: 0.4, pat: lines });
  },
  ribbonKelp(p) {
    const strands = [[[4, 24], [8, 18], [13, 21], [18, 15], [22, 19], [28, 17]], [[5, 21], [10, 24], [15, 18], [20, 23], [27, 23]], [[8, 27], [12, 22], [17, 26], [23, 20], [26, 26]], [[11, 15], [15, 23], [19, 19], [24, 26]]];
    strands.forEach((st, k) => { for (let i = 1; i < st.length; i++) p.cap(st[i - 1], st[i], 1.7, 1.4, M.kelp, { k: 0.45 + (k % 2) * 0.1, pat: (t, s) => (s < -0.4 ? 0.2 : 0) }); });
    for (const [x, y] of [[13, 21], [18, 15], [15, 18], [20, 23], [17, 26], [22, 19], [8, 18], [10, 24], [23, 20], [26, 23]]) p.ell(x, y, 1.9, 1.7, M.kelp, { k: 0.66, lk: 1.2 });
  },
  spineUrchin(p) {
    const sp = (front) => { for (let i = 0; i < 46; i++) { const a = i / 46 * 6.28 + hash(i, 1, 2) * 0.1, f = Math.sin(a) > 0.1; if (f !== front) continue; const l = 8.4 + hash(i, 2, 2) * 3; p.line([16 + Math.cos(a) * 4, 19 + Math.sin(a) * 3.2], [16 + Math.cos(a) * l, 19 + Math.sin(a) * l * 0.62], (t) => M.spine[Math.min(4, 1 + Math.round(t * 2.4 + (front ? 1 : 0)))], { ol: false }); } };
    sp(false);
    p.ell(16, 19, 5.8, 4.6, M.urchin, { k: 0.5, pat: (u, v, x, y) => (hash(x, y, 3) > 0.7 ? 0.25 : 0) });
    sp(true);
  },
  wildApples(p) {
    const streak = (u, v) => (Math.sin(u * 9 + v * 2) > 0.6 && v > -0.4 ? 0.15 : u < -0.3 && v < -0.3 ? 0.25 : 0);
    p.ell(12, 18.4, 6.6, 6.1, M.apple, { k: 0.56, pat: streak });
    p.line([12.4, 12.6], [13.6, 9.4], M.wood[1]);
    p.ell(9.2, 9.6, 3, 1.4, M.leaf, { a: -0.4, k: 0.6, pat: (u, v) => (Math.abs(v) < 0.2 ? -0.2 : 0) });
    p.ell(21.4, 22.4, 5.4, 5.1, M.apple, { k: 0.56, pat: streak });
    p.line([21.6, 17.6], [22.6, 15.6], M.wood[1]);
  },
  brambleBerries(p) {
    for (const [x, y, a] of [[9, 11.5, -0.6], [20.5, 10, 0.5], [14.6, 9, 0.05], [25, 14.5, 0.9]]) p.ell(x, y, 4, 1.9, M.leaf, { a, k: 0.48, pat: (u, v) => (Math.abs(v) < 0.2 ? -0.2 : 0) });
    const drupes = (cx, cy, R) => { for (const [dx, dy] of [[0, -1.6], [-1.3, -0.6], [1.3, -0.6], [0, 0], [-1.4, 0.7], [1.4, 0.7], [-0.7, 1.4], [0.7, 1.4]]) p.ell(cx + dx, cy + dy, 1, 1, R, { k: 0.58, lk: 1.4 }); };
    drupes(19.4, 14.4, M.black); drupes(9.4, 17, M.rasp);
    p.ell(14.4, 16.4, 3.3, 4, M.straw, { k: 0.6, pat: (u, v, x, y) => ((x + y * 2) % 3 === 0 && hash(x, y, 3) > 0.4 ? M.gold : 0) });
    p.ell(14.4, 12.6, 2.4, 0.9, M.leaf, { k: 0.6 });
    drupes(22.6, 20.4, M.rasp); drupes(16.8, 22.4, M.black);
    for (const [x, y] of [[8, 22.4], [12, 24.4], [25.6, 24.6], [21, 25.4], [5.6, 25]]) p.ell(x, y, 2, 1.9, M.blue, { k: 0.56, pat: (u, v) => (u < -0.2 && v < -0.2 ? 0.3 : Math.hypot(u, v - 0.6) < 0.25 ? -0.4 : 0) });
  },
  meadowHerbs(p) {
    for (let i = 0; i < 9; i++) {
      const a = -2.6 + i / 8 * 2.05, l = 10 + hash(i, 1, 7) * 6, bx = 16, by = 23.5, ex = bx + Math.cos(a) * l, ey = by + Math.sin(a) * l;
      p.line([bx, by], [ex, ey], M.herb[1]);
      for (let k = 1; k < 9; k++) { const t = k / 9, x = bx + (ex - bx) * t, y = by + (ey - by) * t, s = k % 2 ? 1 : -1; p.line([x, y], [x + Math.cos(a + s * 1.1) * 2.2, y + Math.sin(a + s * 1.1) * 2.2], M.herb[i % 2 ? 2 : 3]); }
      if (i % 3 === 1) { p.dot(ex, ey - 1, M.white); p.dot(ex + 1, ey - 1, M.white); p.dot(ex, ey - 2, M.white); }
    }
    for (let i = 0; i < 4; i++) p.line([15 + i * 0.6, 24], [14.4 + i, 30.4], M.herb[0]);
    p.ell(16, 24.4, 2.8, 1.3, M.twine, { k: 0.6, pat: (u) => (Math.round(u * 3) % 2 ? -0.2 : 0) });
  },
  wildHoneycomb(p) {
    p.poly([[24.6, 9.6], [27.4, 12.4], [27.6, 23.6], [25.6, 22.6]], M.honey, { k: 0.3 });
    p.poly([[5.6, 10.2], [24.6, 9.6], [25.6, 22.6], [6.6, 24.4]], M.honey, { k: 0.56, bevel: 0.6, pat: (u, v) => { const cv = (v - 10) / 3.2, row = Math.floor(cv), cu = (u - 6) / 3.6 + (row & 1) * 0.5, fu = cu - Math.floor(cu) - 0.5, fv = cv - row - 0.5; const d = Math.max(Math.abs(fu) * 1.2, Math.abs(fv) * 0.9 + Math.abs(fu) * 0.5); return d > 0.42 ? 0.32 : fu < -0.1 && fv < -0.1 ? 0.15 : -0.18; } });
    p.cap([11, 23.5], [10.4, 26.4], 1.1, 1.4, M.honey, { k: 0.66 });
    p.ell(10.2, 27, 3.2, 1.1, M.honey, { k: 0.6, flatN: true });
  },
  forageBasket(p) {
    p.ell(16, 15.2, 10.4, 3, M.wicker, { k: 0.3 });
    for (const [x, y] of [[11, 13.6], [15, 12.6], [19, 13.4]]) p.ell(x, y, 3, 1.8, M.leaf, { k: 0.55 });
    for (let i = 0; i < 16; i++) { const t = i / 15, a = Math.PI * (1 + t); p.ell(16 + Math.cos(a) * 9.4, 15 + Math.sin(a) * 10.8, 1.1, 1.1, M.wicker, { k: 0.5 + (i % 2) * 0.12 }); }
    p.poly([[5.6, 15.4], [26.4, 15.4], [24.2, 27.4], [7.8, 27.4]], M.wicker, { k: 0.55, bevel: 0.5, pat: (u, v) => ((Math.floor(u / 2) + Math.floor((v - 15) / 2)) % 2 ? -0.18 : 0.08) });
    p.ell(16, 15.8, 10.6, 1.5, M.wicker, { k: 0.7, pat: (u) => (Math.round(u * 8) % 2 ? -0.15 : 0) });
    p.poly([[17.5, 14.4], [24.6, 13.6], [25.6, 22], [20.4, 24.2]], [[150, 30, 34], [196, 44, 44], [226, 70, 62], [244, 110, 96]], { k: 0.5, pat: (u, v) => ((Math.floor(u / 1.6) + Math.floor(v / 1.6)) % 2 ? M.white : 0) });
  },
  forageSack(p) {
    p.ell(16, 20.4, 8.4, 8, M.sack, { k: 0.56, pat: (u, v, x, y) => (Math.abs(v + 0.42) < 0.09 && (x & 1) ? [190, 44, 40] : hash(x, y, 3) > 0.85 ? -0.12 : 0) });
    for (const [x, y] of [[13.6, 9.4], [17.6, 8.8], [15.6, 7.6]]) p.ell(x, y, 2.6, 1.6, M.herb, { k: 0.55 });
    p.ell(16, 11.4, 5.2, 2.2, M.sack, { k: 0.66, pat: (u) => (Math.round(u * 5) % 2 ? -0.16 : 0) });
    p.cap([18.6, 12.6], [22.6, 18.6], 0.7, 0.7, M.twine, { k: 0.6 }); p.cap([22.6, 18.6], [24.6, 27.4], 0.7, 0.7, M.twine, { k: 0.6 });
    p.ell(24.6, 28, 1.1, 0.9, M.twine, { k: 0.5 });
  },
};

// ---- the table ------------------------------------------------------------------------------------------
// base: what the icon stands on; gs: how it grows in the world [ground patch, copies [[dx, dy, scale]...], extra]
const T = (name, biomes, use, base, gs, o = {}) => ({ name, biomes, use, base, gs, glow: o.glow || null, toxic: !!o.toxic, carry: o.carry || 0 });
const CL3 = [[0, 0, 0.38], [-5.5, 1.2, 0.27], [5, 1.8, 0.3]], ONE = (s) => [[0, 0, s]];
export const FORAGE = {
  redcap: T('Redcap Toadstool', ['forest', 'redwood', 'mountain'], 'sell', 'tuft', ['moss', CL3], { toxic: true }),
  goldTrumpet: T('Golden Trumpet', ['forest', 'redwood'], 'restaurant', 'tuft', ['moss', CL3]),
  bunCap: T('Bun Cap', ['forest', 'mountain'], 'restaurant', 'tuft', ['moss', CL3]),
  shelfOyster: T('Shelf Oyster', ['forest', 'rainforest', 'wetland'], 'cook', 'none', ['none', ONE(0.52)]),
  pittedSpire: T('Pitted Spire', ['forest', 'mountain'], 'restaurant', 'tuft', ['moss', [[0, 0, 0.36], [5, 1.5, 0.28]]]),
  moonPuff: T('Moon Puff', ['park', 'farm', 'forest'], 'cook', 'tuft', ['grass', [[0, 0, 0.36], [-5, 1.5, 0.22]]]),
  bluelamp: T('Bluelamp Cluster', ['cave', 'rainforest'], 'sell', 'tuft', ['moss', ONE(0.5)], { glow: GLOW_B }),
  paleWidow: T('Pale Widow', ['forest', 'redwood'], 'sell', 'tuft', ['moss', [[0, 0, 0.36], [-5, 1.5, 0.26]]], { toxic: true }),
  violetPrism: T('Violet Prism Cap', ['cave'], 'blackmarket', 'rocks', ['rock', [[0, 0, 0.44], [6, 1.5, 0.26]]], { glow: GLOW_V }),
  ghostglass: T('Ghostglass Cap', ['cave', 'mountain'], 'blackmarket', 'rocks', ['rock', [[0, 0, 0.42], [-6, 1.5, 0.24]]], { glow: GLOW_G }),
  desertRuby: T('Desert Ruby', ['desert'], 'cook', 'sand', ['pads', ONE(0.3)]),
  dustSage: T('Dust Sage', ['desert', 'mountain'], 'cook', 'none', ['shrub', ONE(0.4)]),
  sunburstBloom: T('Sunburst Bloom', ['desert'], 'sell', 'pebbles', ['sand', ONE(0.44)]),
  rockMussels: T('Rock Mussels', ['tidepool', 'beach'], 'restaurant', 'sand', ['stone', ONE(0.36)]),
  ribbonKelp: T('Ribbon Kelp', ['tidepool', 'beach'], 'cook', 'sand', ['none', ONE(0.44)]),
  spineUrchin: T('Spine Urchin', ['tidepool'], 'restaurant', 'sand', ['stone', ONE(0.36)]),
  wildApples: T('Wild Apples', ['farm', 'garden', 'park'], 'cook', 'none', ['litter', [[0, 0, 0.3], [6, 1, 0.26]]]),
  brambleBerries: T('Bramble Berries', ['forest', 'farm', 'wetland', 'park'], 'cook', 'none', ['bush', ONE(0.3)]),
  meadowHerbs: T('Meadow Herbs', ['garden', 'park', 'farm'], 'cook', 'none', ['grass', ONE(0.42)]),
  wildHoneycomb: T('Wild Honeycomb', ['forest', 'farm', 'garden'], 'sell', 'none', ['stump', ONE(0.34)]),
  forageBasket: T('Forage Basket', ['town'], 'sell', 'none', ['none', ONE(0.42)], { carry: 8 }),
  forageSack: T('Forage Sack', ['town'], 'sell', 'none', ['none', ONE(0.4)], { carry: 5 }),
};
export const ITEMS = Object.keys(FORAGE);

// ---- inventory icon ---------------------------------------------------------------------------------------
export function icon(kind, size = 32) {
  const D = FORAGE[kind], p = new Pen(size, size, size / 2, size - 1);
  if (!D) return p.G;
  const s = size / 32, base = BASES[D.base];
  p.at(0, 0, s);
  base(p, true); DRAW[kind](p); base(p, false);
  const G = p.done({ flag: F_NOCAST });
  for (let i = 0; i < size * size; i++) if (G.col[i * 4 + 3]) G.z[i] = 1;
  // soft drop shadow down and to the right
  for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) {
    const i = y * size + x; if (G.col[i * 4 + 3]) continue;
    const sx = x - 1, sy = y - 1;
    if (sx >= 0 && sy >= 0 && G.col[(sy * size + sx) * 4 + 3] === 255) G.put(x, y, [20, 16, 30], [0, 0, 1], 0, null, F_NOCAST, 60);
  }
  return G;
}

// ---- in-world sprite ---------------------------------------------------------------------------------------
// the context it grows in, drawn at world scale round the foot (fx, fy) before the find itself
function context(p, kind, fx, fy, seed) {
  const g = (x, y, c) => p.set(x, y, c, [0, 0, 1], { ground: true });
  const blob = (rx, ry, R, k = 0.5) => { for (let y = -ry - 1; y <= ry + 1; y++) for (let x = -rx - 1; x <= rx + 1; x++) { const q = (x / rx) ** 2 + (y / ry) ** 2, e = 1 + (hash(x + 9, y + 9, seed) - 0.5) * 0.5; if (q < e) g(fx + x, fy + y, R[Math.max(0, Math.min(R.length - 1, Math.round(k * (R.length - 1) + (hash(x, y, seed + 1) - 0.5) * 2.2)))]); } };
  if (kind === 'moss') { blob(8, 3, M.moss, 0.45); for (let i = 0; i < 6; i++) g(fx - 8 + hash(i, 1, seed) * 16, fy - 2 + hash(i, 2, seed) * 4, [[190, 120, 40], [214, 168, 52], [150, 96, 50]][i % 3]); }
  else if (kind === 'grass') { blob(7, 2.5, M.grass, 0.5); for (let i = 0; i < 7; i++) { const x = fx - 7 + i * 2.2 + hash(i, 3, seed), h = 2 + hash(i, 4, seed) * 2; p.line([x, fy + 1], [x + (hash(i, 5, seed) - 0.5) * 2, fy + 1 - h], (t) => MAT.grass[2 + Math.round(t * 3)], { ol: false }); } }
  else if (kind === 'rock') { blob(8, 3, M.coal, 0.35); for (const [x, y, r] of [[-5, -1, 2.4], [4.5, -1.5, 2.8], [0, 1, 1.6]]) p.ell(fx + x, fy + y, r, r * 0.75, M.coal, { k: 0.5 }); }
  else if (kind === 'sand') blob(7, 2.5, M.sand, 0.55);
  else if (kind === 'stone') { blob(9, 3, M.sand, 0.35); p.ell(fx, fy - 1.5, 7, 3.6, M.stone, { k: 0.5, pat: (u, v, x, y) => (hash(x, y, seed) > 0.8 ? M.moss[2] : v > 0.4 ? -0.2 : 0) }); }
  else if (kind === 'litter') { blob(8, 3, M.grass, 0.4); for (let i = 0; i < 8; i++) g(fx - 8 + hash(i, 6, seed) * 16, fy - 2 + hash(i, 7, seed) * 4, [[190, 120, 40], [170, 60, 40], [214, 168, 52]][i % 3]); }
  else if (kind === 'stump') { blob(7, 2.5, M.moss, 0.45); p.cap([fx, fy], [fx, fy - 6], 4.2, 3.8, M.wood, { k: 0.5 }); p.ell(fx, fy - 6.4, 3.8, 1.4, R5('#c8a070'), { k: 0.6, pat: (u, v) => (Math.round(Math.hypot(u, v) * 3) % 2 ? -0.15 : 0) }); }
  else if (kind === 'pads') {
    blob(7, 2.5, M.sand, 0.55);
    for (const [x, y, a] of [[-3, -4, -0.5], [3, -5, 0.4], [0, -9, 0.05], [-4.5, -9.5, -0.6], [4, -11, 0.5]]) p.ell(fx + x, fy + y, 2.4, 3.4, M.cactus, { a, k: 0.55, pat: (u, v, X, Y) => (hash(X, Y, 3) > 0.85 ? M.gold : 0) });
  } else if (kind === 'shrub') {
    blob(7, 2.5, M.sand, 0.5);
    for (let i = 0; i < 16; i++) { const a = -Math.PI * (0.05 + 0.9 * hash(i, 1, seed)), r = 2 + hash(i, 2, seed) * 5; p.ell(fx + Math.cos(a) * r * 1.2, fy - 4 + Math.sin(a) * r * 0.9, 1.6, 1.2, M.sage, { k: 0.4 + hash(i, 3, seed) * 0.35, flag: F_LEAF }); }
  } else if (kind === 'bush') {
    blob(8, 2.5, M.grass, 0.4);
    for (let i = 0; i < 18; i++) { const a = -Math.PI * (0.02 + 0.96 * hash(i, 1, seed)), r = 2 + hash(i, 2, seed) * 5.5; p.ell(fx + Math.cos(a) * r * 1.3, fy - 4.5 + Math.sin(a) * r, 1.8, 1.5, M.leaf, { k: 0.35 + hash(i, 3, seed) * 0.35, flag: F_LEAF }); }
    for (let i = 0; i < 9; i++) { const x = fx - 6 + hash(i, 4, seed) * 12, y = fy - 9 + hash(i, 5, seed) * 7, R = [M.blue, M.black, M.straw][i % 3]; p.ell(x, y, 0.7, 0.7, R, { k: 0.6, lk: 1.4 }); }
  }
}
export function groundSprite(kind, seed = 0) {
  const D = FORAGE[kind], W = 30, H = 26, fx = 15, fy = 21, p = new Pen(W, H, fx, fy);
  if (!D) return p.G;
  const [ctx, copies] = D.gs;
  context(p, ctx, fx, fy, seed * 31 + 7);
  const lift = ctx === 'stump' ? 6.2 : ctx === 'stone' ? 3.4 : ctx === 'pads' ? 11 : ctx === 'shrub' ? 3 : ctx === 'bush' ? 0 : 0;
  if (ctx !== 'bush' && ctx !== 'shrub') {
    const order = copies.map((c, i) => [c, i]).sort((a, b) => a[0][1] - b[0][1]);
    for (const [[dx, dy, s]] of order) {
      const v = 1 + (hash(seed, dx * 7 + dy, 3) - 0.5) * 0.2, S = s * v;
      p.at(fx + dx - 16 * S, fy + dy - lift - 27 * S, S);
      DRAW[kind](p);
      p.at(0, 0, 1);
    }
  } else if (ctx === 'shrub') { p.at(fx - 16 * 0.32 + 2, fy - 27 * 0.32 - 1, 0.32); DRAW.dustSage(p); p.at(0, 0, 1); }
  return p.done({});
}
