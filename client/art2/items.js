// Art v2 items: weapons and handheld things, modelled on the P4 targets (docs/art-v2/targets). Each item
// is one flat side-view model in "item units" (u along the item from the grip, v across it, v+ the
// underside when u points right), built from lit parts - capsules (round bars, shaded as cylinders),
// polygons (blades, frames, cases; bevel-lit from the upper left), ellipses and rings - so the same model
// draws as an inventory icon and, small, in a character's hand (people.js). Generic designs: no logos,
// no text, no maker marks.
//   icon(kind, size = 32) -> GBuf: transparent background, dark warm outline, soft drop shadow
//   drawItem(set, kind, ox, oy, U, V, opt) draws into any pixel sink, set(x, y, col, emi, noOutline):
//     (ox, oy) is the grip (item origin) on screen, U / V the screen vectors of one item unit along u / v;
//     opt.line overrides the length (px) of a hanging line (fishing rod; 0 = none); opt.org [x, y] anchors the
//     dither pattern (a sprite's own anchor, so it holds still from frame to frame)
//   itemSpan(kind) -> [u min, u max, largest |v|]: the model's extent in item units
//   ITEMS[kind]: { parts, ia icon angle (deg, - tilts the tip up), is icon scale, hs held scale, vk thickening,
//     off [u,v] second-hand grip, bill (always drawn upright), tip [u,v] + line (hanging line length) }
//   ITEM_KINDS (inventory order), ITEM_NAMES (player-facing)
import { GBuf, F_NOCAST, bayer, hash } from './gbuf.js';
import { ramp } from './palette.js';

const R5 = (h, o) => ramp(h, 5, 2, o);
const M = {
  wood: R5('#b8743c', { light: 0.45 }), woodDark: R5('#7e4628'), tape: R5('#36343e', { light: 0.4 }), black: R5('#2a2a34', { light: 0.35 }),
  steel: R5('#aab2bc', { light: 0.75, dark: 0.55, shift: 0.12 }), silver: R5('#b4b8c0', { light: 0.7, shift: 0.12 }), dark: R5('#4c505c', { shift: 0.12 }),
  gun: R5('#40444e', { light: 0.42, shift: 0.12 }), gunLight: R5('#5a5f6a', { light: 0.45, shift: 0.12 }), red: R5('#b23a30'), rodRed: R5('#8e2a2c'),
  gold: R5('#c8962e', { light: 0.6 }), orange: R5('#d8582c', { light: 0.5 }), olive: R5('#666c30'), oliveLight: R5('#84863e'), rust: R5('#8a3c2a'),
  yellow: R5('#e2b222', { light: 0.5 }), blade: R5('#3c86ff', { light: 0.7 }), core: R5('#d8ecff', { dark: 0.2, light: 0.8 }), cream: R5('#e4dac2', { dark: 0.38 }),
  paper: R5('#b88a58', { dark: 0.5, light: 0.4 }), bottle: R5('#3e6a32', { light: 0.6 }), card: R5('#9a6a40'), cup: R5('#f0ece4', { dark: 0.32 }),
  money: R5('#5e8c4a', { light: 0.5 }), medRed: R5('#c8362e', { light: 0.45 }), gauze: R5('#e2d8be', { dark: 0.6, light: 0.55 }), white: R5('#eeece6', { dark: 0.3 }), screen: R5('#3a78d8', { light: 0.7 }),
};
const box = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const rbox = (u0, v0, u1, v1, c = 1) => [[u0 + c, v0], [u1 - c, v0], [u1, v0 + c], [u1, v1 - c], [u1 - c, v1], [u0 + c, v1], [u0, v1 - c], [u0, v0 + c]];
const cap = (a, b, r, m, o = {}) => ({ t: 'c', a, b, r, r1: o.r1 ?? r, m, ...o });
const poly = (pts, m, o = {}) => ({ t: 'p', pts, m, ...o });
const ell = (c, rx, ry, m, o = {}) => ({ t: 'e', c, rx, ry, m, ...o });
const ring = (c, rad, th, m, o = {}) => ({ t: 'r', c, rad, th, m, ...o });
const path = (pts, r, m, o = {}) => pts.slice(1).map((p, i) => cap(pts[i], p, r, m, o));
const GLOW = [70, 150, 255, 220];

// the curved katana blade: spine on the concave (v-) side, edge on the convex side
const katanaBlade = (() => {
  const top = [], bot = [], N = 12, u0 = 4.2, u1 = 26.5;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = u0 + (u1 - u0) * t, c = -0.0062 * (u - u0) * (u - u0), w = 1.2 * (1 - 0.2 * t);
    if (i === N) { top.push([u + 0.4, c - 0.9]); break; }
    top.push([u, c - w]); bot.push([u, c + w * (t > 0.86 ? (1 - t) / 0.14 : 1)]);
  }
  return top.concat(bot.reverse());
})();

export const ITEMS = {
  bat: { ia: -62, hs: 0.72, off: [-3.2, 0], parts: [
    ell([-5.6, 0], 1.3, 2.6, M.wood),
    cap([-5, 0], [3, 0], 1.5, M.tape, { flat: true }),
    cap([3, 0], [9, 0], 1.5, M.wood, { r1: 1.8, flat: true, pat: grain }),
    cap([9, 0], [20.6, 0], 1.8, M.wood, { r1: 3.4, pat: grain }),
  ] },
  knife: { ia: -55, hs: 0.65, is: 1.35, parts: [
    ell([-3.7, 0], 1, 1.5, M.dark),
    cap([-3.2, 0], [2.6, 0], 1.35, M.black, { flat: true, pat: (u, v) => (Math.abs(v) < 0.5 && (Math.abs(u + 1.4) < 0.5 || Math.abs(u - 1) < 0.5) ? M.silver[3] : 0) }),
    poly(box(2.6, -2.2, 3.7, 2.2), M.dark),
    poly([[3.7, -1.5], [13.5, -1.5], [17.2, -0.5], [15, 1.1], [11, 1.8], [3.7, 1.8]], M.steel, { k: 0.05, pat: (u, v) => (v > 1 && u < 14 ? 0.3 : 0) }),
  ] },
  crowbar: { ia: -62, hs: 0.8, off: [6, 0], parts: [
    cap([-3, 0], [-4.6, 1.8], 1, M.steel, { k: -0.05 }),
    cap([-3, 0], [17.4, 0], 1.3, M.red),
    ...path([[17.4, 0], [19.4, -1], [20.4, -3], [19.3, -4.9], [17.4, -4.7]], 1.25, M.red),
    ell([17.1, -4.5], 0.95, 0.95, M.steel),
  ] },
  sledgehammer: { ia: -50, hs: 0.85, off: [-3.5, 0], parts: [
    cap([-4, 0], [16.5, 0], 1.3, M.wood, { pat: grain }),
    cap([-4.6, 0], [1, 0], 1.5, M.tape),
    poly(rbox(15.6, -6.8, 23.6, 5.6, 1.3), M.dark, { k: 0.08 }),
    poly(box(15.6, -0.9, 23.6, -0.3), M.dark, { k: -0.3 }),
  ] },
  chainsaw: { ia: -40, hs: 0.8, off: [7.5, -7.4], parts: [
    cap([11, 0], [26, 0], 2.5, M.steel, { k: -0.08, pat: (u, v) => (Math.abs(v) > 1.75 ? M.gun[(Math.round(u) & 1) + 1] : Math.abs(u - 13.5) < 0.5 && Math.abs(v) < 0.5 ? M.dark[1] : 0) }),
    cap([-1.6, 0], [2.6, 0], 1.3, M.black),
    ...path([[3.6, -3.8], [4.8, -7.6], [10, -7.8], [11.6, -4.2]], 1.15, M.black),
    poly([[2.4, -4], [10, -5], [12.4, -3.4], [12.4, 4.4], [3.2, 4.4], [2.2, 1.8]], M.orange),
    poly(box(4.6, -1.6, 9.6, 2.4), M.orange, { k: -0.2, pat: (u, v) => (Math.round(v * 1.4) % 2 === 0 && u < 8.5 ? -0.25 : 0) }),
    poly(box(10.4, -2.4, 12.4, 2.4), M.black),
  ] },
  sword: { ia: -58, hs: 0.95, off: [-2.4, 0], parts: [
    ell([-4, 0], 1.2, 1.45, M.gold),
    cap([-3.3, 0], [2.4, 0], 1.05, M.woodDark, { flat: true, pat: (u) => (Math.round(u * 1.3) % 2 ? -0.22 : 0) }),
    cap([3.1, -4], [3.1, 4], 0.95, M.gold),
    poly([[3.9, -1.75], [21, -1.6], [24.8, 0], [21, 1.6], [3.9, 1.75]], M.steel, { k: 0.05, pat: (u, v) => (Math.abs(v) < 0.45 && u < 19 ? -0.28 : 0) }),
  ] },
  katana: { ia: -55, hs: 0.95, off: [-4.2, 0], parts: [
    ell([-6.7, 0], 0.8, 1.2, M.gold),
    cap([-6.3, 0], [2.1, 0], 1.15, M.black, { flat: true, pat: (u, v) => ((Math.round(u * 0.9) + (v > 0 ? 1 : 0)) % 2 === 0 && Math.abs(v) < 0.75 ? M.red[2] : 0) }),
    ell([2.8, 0], 0.85, 2.5, M.gold),
    poly(box(3.4, -1.3, 4.3, 1.3), M.gold, { k: 0.15 }),
    poly(katanaBlade, M.steel, { pat: (u, v) => (v > -0.0062 * (u - 4.2) * (u - 4.2) + 0.25 ? 0.28 : 0) }),
  ] },
  energyBlade: { ia: -60, hs: 0.95, off: [-2.6, 0], parts: [
    ell([-4.9, 0], 0.8, 1.25, M.dark),
    cap([-4.6, 0], [4, 0], 1.3, M.silver, { flat: true, pat: (u) => ([-2.6, -0.6, 1.4].some((b) => Math.abs(u - b) < 0.5) ? -0.4 : 0) }),
    poly(box(4, -1.6, 5.3, 1.6), M.dark),
    cap([5.3, 0], [24, 0], 1.7, M.blade, { e: GLOW, k: 0.15 }),
    cap([5.5, 0], [23.6, 0], 0.75, M.core, { e: [210, 235, 255, 255], k: 0.3 }),
  ] },
  nightstick: { ia: -62, hs: 0.75, parts: [
    ell([-4.4, 0], 1.55, 1.6, M.black),
    cap([-4.2, 0], [18, 0], 1.5, M.black, { k: 0.1 }),
    cap([1.6, 0], [1.6, 4.2], 1.1, M.black),
    ell([1.6, 4.6], 1.15, 0.9, M.black, { k: 0.05 }),
  ] },
  taser: { ia: -10, hs: 0.78, is: 1.5, off: [-0.5, 1.5], parts: [
    poly([[-2.2, -2], [1.4, -2], [1.1, 3.6], [-1.9, 3.9]], M.black),
    poly([[-3, -5.5], [8, -5.5], [8.8, -4.8], [8.8, -1.3], [8, -1], [1.5, -1], [1.4, -2], [-2.5, -2], [-3, -3]], M.yellow, { pat: (u) => (u > 3 && u < 3.9 ? M.black[2] : 0) }),
    poly(box(7.4, -5.6, 9.2, -1.2), M.black),
    poly(box(9.2, -4.8, 9.9, -4), M.blade, { e: GLOW, k: 0.3 }),
    poly(box(9.2, -2.6, 9.9, -1.8), M.blade, { e: GLOW, k: 0.3 }),
    ...path([[1.4, -1], [1.7, 0.6], [3.6, 0.6], [4, -1]], 0.42, M.black),
  ] },
  pistol: { ia: -12, hs: 0.72, is: 1.35, off: [-0.6, 1.6], parts: [
    poly([[-3, -1.6], [1.8, -1.6], [1.2, 4.5], [-3.6, 4.6], [-3.4, -0.4]], M.gun, { k: -0.1, pat: (u, v) => (hash(Math.round(u * 2), Math.round(v * 2), 3) > 0.8 ? -0.18 : 0) }),
    poly([[-3, -3.3], [11, -3.3], [11, -2.2], [3.6, -2.2], [2, -1.5], [-2.6, -1.5]], M.gun),
    poly([[-3.6, -6], [11.6, -6], [12.1, -5.4], [12.1, -3.2], [-3.6, -3.2]], M.gunLight, { pat: (u) => (u < 0.5 && u > -2.6 && (Math.round(u * 1.5) & 1) ? -0.3 : 0) }),
    ell([12.1, -4.5], 0.45, 0.5, M.black, { k: -0.4 }),
    ...path([[1.8, -1.6], [2.2, 0.4], [4.2, 0.4], [4.6, -2.2]], 0.42, M.gun),
  ] },
  revolver: { ia: -12, hs: 0.7, is: 1.3, off: [-0.8, 1.8], parts: [
    poly([[-2.4, -1.8], [1, -1.8], [0.8, 1], [-0.2, 4.5], [-3.6, 4.8], [-3.9, 2], [-3, -0.6]], M.woodDark, { k: 0.1, pat: grain }),
    poly([[-2.6, -6.2], [1, -6.6], [1, -1.5], [-1.6, -1.2]], M.silver, { k: -0.12 }),
    poly([[-2.5, -6], [-4.2, -7.6], [-3.2, -8], [-1.4, -6.4]], M.dark),
    cap([4.6, -5], [14, -5], 1.05, M.silver, { flat: true }),
    cap([5, -3.5], [11, -3.5], 0.5, M.silver, { k: -0.15 }),
    poly(box(13, -6.7, 13.8, -5.8), M.silver),
    poly(rbox(1, -6.7, 5.2, -2.3, 0.6), M.silver, { pat: (u, v) => (Math.abs(v + 5.3) < 0.3 || Math.abs(v + 3.7) < 0.3 ? -0.3 : 0) }),
    ...path([[1, -1.5], [1.3, 0.3], [3.6, 0.3], [4, -2.3]], 0.4, M.silver, { k: -0.1 }),
  ] },
  shotgun: { ia: -32, hs: 0.54, vk: 1.4, off: [15.5, -2.2], parts: [
    poly([[-1, -5], [-15, -3.2], [-15.2, 2.6], [-12.5, 2.8], [-2, -0.6], [-0.8, -1.2]], M.woodDark, { k: 0.1, pat: grain }),
    poly([[-15, -3.2], [-16.2, -3.1], [-16.3, 2.6], [-15.2, 2.6]], M.black),
    cap([5, -4], [30, -4], 0.95, M.gun, { flat: true }),
    cap([8, -2.3], [28, -2.3], 0.85, M.gun, { k: -0.12, flat: true }),
    poly(box(-1, -5.4, 8.2, -1.2), M.gun, { k: 0.05 }),
    poly(rbox(11, -3.4, 20.5, -0.8, 0.5), M.woodDark, { k: 0.12, pat: (u) => (Math.round(u * 1.2) % 2 ? -0.18 : 0) }),
    ...path([[1, -1.2], [1.4, 0.4], [3.6, 0.4], [4, -1.2]], 0.42, M.gun),
  ] },
  rifle: { ia: -32, hs: 0.54, vk: 1.5, off: [12, -2.4], parts: [
    cap([-3.5, -4.3], [-9, -4.3], 0.9, M.gun),
    poly([[-8, -5.4], [-14, -5], [-14.5, 1.2], [-12.4, 1.2], [-8, -2.8]], M.gun, { k: -0.05 }),
    poly([[1.5, -0.8], [5.2, -0.8], [6.8, 5.4], [3.3, 6.2]], M.gun, { k: -0.06 }),
    poly([[-2.6, -0.8], [0.2, -0.8], [-0.8, 4.4], [-3.4, 4.2]], M.gun, { k: -0.12 }),
    poly(box(-3, -3.4, 6.4, -0.8), M.gun),
    poly(box(-3.6, -5.6, 7, -3.4), M.gunLight, { pat: (u, v) => (v < -5 && (Math.round(u) & 1) ? -0.3 : 0) }),
    cap([17, -3.6], [27, -3.6], 0.55, M.gun, { flat: true }),
    cap([26, -3.6], [28.6, -3.6], 0.8, M.gun, { flat: true, k: -0.1 }),
    poly(box(7, -5.4, 17, -2), M.gun, { pat: (u, v) => (Math.abs(v + 3.7) < 0.5 && (Math.round(u) & 1) && u < 16 ? -0.35 : 0) }),
    poly([[15, -5.4], [15.6, -8], [16.6, -8], [16.6, -5.4]], M.gun),
    cap([0, 0.3], [1.6, 0.3], 0.35, M.gun),
  ] },
  smg: { ia: -10, hs: 0.75, vk: 1.1, is: 1.15, off: [10.5, -1.5], parts: [
    ...path([[-6, -5], [-8.6, -5], [-8.6, -2.5], [-6, -2.5]], 0.45, M.gunLight),
    poly([[-1.2, -1.6], [2.6, -1.6], [2.6, 9], [-0.8, 9.2]], M.gun, { k: -0.12 }),
    poly(box(-1.4, 8.8, 3, 9.8), M.gun, { k: 0.05 }),
    poly([[-6, -6], [9, -6], [9.6, -5.4], [9.6, -1.6], [-6, -1.6]], M.gun, { k: 0.05, pat: (u, v) => (v < -5.2 && u > -4 && u < 7 ? 0.25 : 0) }),
    ell([2, -6.4], 0.7, 0.6, M.gunLight),
    cap([9.6, -4], [13, -4], 0.8, M.gun, { flat: true }),
    cap([12.6, -4], [13.8, -4], 1, M.gun, { flat: true, k: -0.1 }),
    ...path([[2.6, -1.6], [2.8, 0.6], [5.4, 0.6], [5.6, -1.6]], 0.45, M.gun),
  ] },
  rocketLauncher: { ia: -62, hs: 0.85, vk: 1.15, off: [5, -0.5], parts: [
    poly([[-14, -8.4], [-17.6, -9.6], [-17.6, -2.4], [-14, -3.6]], M.olive, { k: -0.28 }),
    cap([-14, -6], [9, -6], 2.4, M.olive, { flat: true }),
    poly(box(-7, -8.6, -3, -3.4), M.rust),
    poly(box(-1, -9.8, 2.2, -8.4), M.black),
    poly([[-1.6, -3.6], [1, -3.6], [0.6, 1.2], [-1.7, 1.2]], M.black),
    poly([[4, -3.6], [6, -3.6], [5.8, -0.5], [4.2, -0.5]], M.black),
    poly(box(8.6, -8.6, 10.2, -3.4), M.gun),
    poly([[10, -8.2], [12.6, -9.9], [16.4, -9.6], [20.4, -7.6], [22.8, -6], [20.4, -4.4], [16.4, -2.4], [12.6, -2.1], [10, -3.8]], M.oliveLight),
  ] },
  fishingRod: { ia: -68, hs: 1.25, off: [-5.4, 0], tip: [30.5, 0], line: 11, parts: [
    cap([-7.2, 0], [-1, 0], 1.15, M.black),
    cap([-1, 0], [30.5, 0], 0.85, M.rodRed, { r1: 0.32 }),
    ...[8, 15, 21, 26].map((u) => ell([u, -0.95], 0.55, 0.5, M.silver)),
    cap([-1.2, 0.6], [-1.2, 1.4], 0.5, M.silver),
    ell([-1.2, 2.9], 1.9, 1.9, M.silver),
    ell([-1.2, 2.9], 0.7, 0.7, M.dark),
  ] },
  medkit: { ia: 0, hs: 0.8, is: 1.45, bill: true, parts: [
    ...path([[-2.6, 1.8], [-2.6, 0], [2.6, 0], [2.6, 1.8]], 0.75, M.black),
    poly(rbox(-7.6, 1.6, 7.6, 11.6, 1.6), M.medRed, { pat: (u, v) => (v < 2.9 ? 0.2 : Math.abs(v - 3.4) < 0.35 ? -0.35 : 0) }),
    poly(box(-1.1, 4.6, 1.1, 10.4), M.white, { k: 0.15 }),
    poly(box(-3, 6.4, 3, 8.6), M.white, { k: 0.15 }),
    poly(box(-6.4, 2.4, -5, 3.4), M.dark), poly(box(5, 2.4, 6.4, 3.4), M.dark),
  ] },
  bandage: { ia: 0, hs: 0.62, is: 1.6, bill: true, off: [3.5, 1], parts: [
    poly([[1.8, 3.4], [6.4, 4.2], [8.2, 8.6], [3.6, 8.2]], M.gauze, { k: 0.12, pat: (u, v) => (Math.round(v * 1.3) % 2 ? -0.12 : 0) }),
    cap([0, -2.6], [0, 4.6], 3.8, M.gauze, { flat: true, pat: (u, v) => (Math.round(v * 0.8) % 3 === 0 ? -0.12 : 0) }),
    ell([0, -2.6], 3.8, 1.6, M.gauze, { k: 0.28, pat: (u, v) => { const r = Math.hypot(u, (v + 2.6) * 2.4); return Math.abs(r - 2) < 0.5 || r < 0.75 ? -0.4 : 0; } }),
  ] },
  phone: { ia: 0, hs: 0.7, is: 1.6, bill: true, parts: [
    poly(rbox(-3.6, -6.8, 3.6, 6.8, 1.2), M.black, { k: 0.1 }),
    poly(box(-2.7, -5.4, 2.7, 5.2), M.screen, { e: [60, 130, 230, 150], pat: (u, v) => { const a = (u + 2.7) / 1.8, b = (v + 5.4) / 1.8; return a % 1 > 0.25 && b % 1 > 0.25 && b < 4 ? 0.35 : 0; } }),
    poly(box(-1, -6.2, 1, -5.8), M.dark),
  ] },
  cash: { ia: 0, hs: 0.7, is: 1.45, bill: true, off: [5.5, 0], parts: [
    poly(box(-5.4, -6, 8.6, 0), M.money, { k: -0.15, pat: (u, v) => (v < -4.6 ? 0.25 : 0) }),
    poly(box(-8, -3, 6, 4), M.money, { pat: (u, v) => (v < -1.6 ? 0.25 : v > 0 && Math.round(v * 2) % 2 ? -0.2 : 0) }),
    poly(box(-2, -3.1, 1.2, 4.1), M.cream, { k: 0.08 }),
    poly(box(0.8, -6.1, 3.6, -1.9), M.cream, { k: -0.05 }),
  ] },
  keys: { ia: 0, hs: 0.6, is: 1.55, bill: true, parts: [
    ring([0, 2], 1.8, 0.55, M.silver),
    poly([[-2.6, 8.6], [-1.2, 8.6], [-1.2, 14.6], [-1.9, 15.3], [-2.6, 14.6]], M.silver, { pat: (u, v) => (u > -1.7 && ((v > 10 && v < 11) || (v > 12.2 && v < 13.2)) ? 0.25 : 0) }),
    poly(box(-1.2, 10, -0.4, 11), M.silver), poly(box(-1.2, 12.2, -0.5, 13.2), M.silver),
    poly(rbox(-4, 4.2, -0.2, 8.8, 1.1), M.black, { k: 0.1 }),
    cap([0.9, 3.6], [2.4, 4.8], 0.45, M.silver),
    poly(rbox(1, 4.6, 5.4, 12.4, 1.3), M.black, { k: 0.12 }),
    ell([3.2, 7.4], 1, 1, M.medRed, { k: 0.15 }), ell([3.2, 10.2], 0.7, 0.7, M.dark, { k: 0.2 }),
  ] },
  // the rest of the game's arsenal and street props
  silencedPistol: { ia: -10, hs: 0.72, is: 1.15, off: [-0.6, 1.6], parts: null },
  sniper: { ia: -26, hs: 0.47, vk: 1.4, off: [14, -2.4], parts: [
    poly([[-3, -5.4], [-16, -4.8], [-16.4, 1.8], [-13.4, 2], [-6.6, -1.4], [-2.6, -1.6]], M.gunLight, { k: -0.05 }),
    poly([[1.5, -0.8], [4.6, -0.8], [5.8, 4.8], [2.8, 5.4]], M.gun, { k: -0.08 }),
    poly(box(-3.4, -5.6, 12, -1.2), M.gun, { pat: (u, v) => (v < -5 && (Math.round(u) & 1) ? -0.25 : 0) }),
    poly(box(12, -4.8, 21, -2.2), M.gun),
    cap([20, -3.6], [37, -3.6], 0.6, M.gun, { flat: true }),
    cap([36, -3.6], [38.6, -3.6], 0.95, M.gun, { flat: true, k: -0.1 }),
    poly(box(2.6, -7.2, 3.6, -5.6), M.black), poly(box(8.4, -7.2, 9.4, -5.6), M.black),
    cap([0.4, -8.4], [12, -8.4], 1.25, M.black, { flat: true, k: 0.1 }),
    ell([12.2, -8.4], 0.5, 1.5, M.black), ell([12.3, -8.4], 0.3, 0.9, M.blade, { k: 0.2 }),
    ...path([[1.5, -1.2], [1.8, 0.4], [3.8, 0.4], [4.2, -1.2]], 0.4, M.gun),
  ] },
  pepperSpray: { ia: -18, hs: 0.95, is: 1.7, parts: [
    cap([-2.8, 0], [4.2, 0], 1.9, M.black, { flat: true }),
    poly(box(-1.6, -2, 2.4, 2), M.orange, { k: -0.05 }),
    poly(box(4.2, -1.4, 5.8, 1.4), M.red), poly(box(5.8, -0.5, 6.7, 0.5), M.dark),
  ] },
  bottle: { ia: 0, hs: 0.62, is: 1.6, bill: true, parts: [
    cap([0, -8], [0, -2.2], 0.85, M.bottle, { r1: 1.2 }),
    poly([[-2.6, -2.6], [2.6, -2.6], [3.2, 7.2], [-3.2, 7.2]], M.paper, { pat: (u, v) => (hash(Math.round(u * 1.2), Math.round(v * 0.8), 9) > 0.78 ? -0.22 : v < -1.6 ? 0.18 : 0) }),
  ] },
  coffee: { ia: 0, hs: 0.6, is: 1.6, bill: true, parts: [
    poly([[-2.3, -3.4], [2.3, -3.4], [1.8, 4], [-1.8, 4]], M.cup),
    poly(box(-2.7, -4.6, 2.7, -3.3), M.cup, { k: 0.12 }),
    poly([[-2.15, -1.2], [2.15, -1.2], [2, 1.8], [-2, 1.8]], M.card),
  ] },
  spikeStrip: { ia: 0, hs: 0.62, is: 1.4, bill: true, parts: [
    poly(rbox(-7.4, -1.8, 7.4, 1.8, 0.7), M.black, { k: 0.1 }),
    ...[-5.5, -2.8, 0, 2.8, 5.5].map((u) => poly([[u - 0.9, -1.8], [u + 0.9, -1.8], [u, -3.6]], M.steel)),
    poly(box(-7.4, -0.3, 7.4, 0.5), M.yellow, { k: -0.1 }),
  ] },
};
ITEMS.silencedPistol.parts = [...ITEMS.pistol.parts, cap([11.6, -4.6], [20, -4.6], 1.4, M.dark, { flat: true, k: 0.05 }), ell([20, -4.6], 0.45, 1.35, M.black, { k: -0.3 })];
function grain(u, v) { return hash(Math.round(u * 0.6), Math.round(v * 1.6), 5) > 0.82 ? -0.14 : 0; }

export const ITEM_KINDS = ['bat', 'knife', 'crowbar', 'sledgehammer', 'chainsaw', 'sword', 'katana', 'energyBlade', 'nightstick', 'taser', 'pistol', 'revolver', 'shotgun', 'rifle', 'smg', 'rocketLauncher', 'fishingRod', 'medkit', 'bandage', 'phone', 'cash', 'keys', 'silencedPistol', 'sniper', 'pepperSpray', 'bottle', 'coffee', 'spikeStrip'];
export const ITEM_NAMES = {
  bat: 'Baseball bat', knife: 'Knife', crowbar: 'Crowbar', sledgehammer: 'Sledgehammer', chainsaw: 'Chainsaw', sword: 'Sword', katana: 'Katana',
  energyBlade: 'Energy blade', nightstick: 'Nightstick', taser: 'Taser', pistol: 'Pistol', revolver: 'Revolver', shotgun: 'Pump shotgun', rifle: 'Rifle',
  smg: 'SMG', rocketLauncher: 'Rocket launcher', fishingRod: 'Fishing rod', medkit: 'Medical kit', bandage: 'Bandage', phone: 'Phone', cash: 'Cash', keys: 'Keys',
  silencedPistol: 'Silenced pistol', sniper: 'Marksman rifle', pepperSpray: 'Pepper spray', bottle: 'Bottle in a bag', coffee: 'Coffee', spikeStrip: 'Spike strip',
};

// ---- rasterising ----------------------------------------------------------------------------------
const LD = (() => { const l = Math.hypot(-0.55, -0.62, 0.56); return [-0.55 / l, -0.62 / l, 0.56 / l]; })();
const shade = (R, v, x, y) => { const t = Math.max(0, Math.min(0.999, v)) * (R.length - 1) + bayer(x, y) * 0.55; return R[Math.max(0, Math.min(R.length - 1, Math.round(t)))]; };
const SUB = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];

function extent(p) {
  if (p.t === 'c') return [[...p.a, Math.max(p.r, p.r1)], [...p.b, Math.max(p.r, p.r1)]];
  if (p.t === 'p') return p.pts.map((q) => [q[0], q[1], 0]);
  if (p.t === 'e') return [[p.c[0], p.c[1], Math.max(p.rx, p.ry)]];
  return [[p.c[0], p.c[1], p.rad + p.th]];
}
// inside test in item space; returns null (outside) or the surface offset [wu, wv] (|w| <= 1) for round parts
function hit(p, u, v) {
  if (p.t === 'c') {
    const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], L2 = dx * dx + dy * dy || 1;
    const tr = ((u - p.a[0]) * dx + (v - p.a[1]) * dy) / L2;
    if (p.flat && (tr < 0 || tr > 1)) return null;
    const t = Math.max(0, Math.min(1, tr)), r = p.r + (p.r1 - p.r) * t;
    const wu = u - p.a[0] - dx * t, wv = v - p.a[1] - dy * t, d = Math.hypot(wu, wv);
    return d <= r ? [wu / r, wv / r] : null;
  }
  if (p.t === 'e') { const wu = (u - p.c[0]) / p.rx, wv = (v - p.c[1]) / p.ry; return wu * wu + wv * wv <= 1 ? [wu, wv] : null; }
  if (p.t === 'r') { const du = u - p.c[0], dv = v - p.c[1], d = Math.hypot(du, dv) || 1, k = (d - p.rad) / p.th; return Math.abs(k) <= 1 ? [du / d * k, dv / d * k] : null; }
  let ins = false; const P = p.pts;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > v) !== (P[j][1] > v) && u < (P[j][0] - P[i][0]) * (v - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) ins = !ins;
  return ins ? [0, 0] : null;
}
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)); return Math.hypot(px - ax - dx * t, py - ay - dy * t); }

// draw one item: grip at (ox, oy), U / V the screen vectors of one item unit along u / v
// an item's extent in its own units, [u min, u max, largest |v|] (callers bound a drawn item with it)
const SPAN = new Map();
export function itemSpan(kind) {
  let s = SPAN.get(kind);
  if (s) return s;
  const D = ITEMS[kind];
  if (!D) return [0, 0, 0];
  let u0 = 1e9, u1 = -1e9, va = 0;
  for (const p of D.parts) for (const [u, v, r] of extent(p)) { u0 = Math.min(u0, u - r); u1 = Math.max(u1, u + r); va = Math.max(va, Math.abs(v) + r); }
  s = [u0, u1, va];
  SPAN.set(kind, s);
  return s;
}
export function drawItem(set, kind, ox, oy, U, V, opt = {}) {
  const D = ITEMS[kind]; if (!D) return;
  if (D.vk) V = [V[0] * D.vk, V[1] * D.vk];
  const det = U[0] * V[1] - U[1] * V[0]; if (Math.abs(det) < 1e-6) return;
  const toItem = (x, y) => { const dx = x - ox, dy = y - oy; return [(dx * V[1] - dy * V[0]) / det, (U[0] * dy - U[1] * dx) / det]; };
  const toScr = (u, v) => [ox + u * U[0] + v * V[0], oy + u * U[1] + v * V[1]];
  const su = Math.hypot(U[0], U[1]), sv = Math.hypot(V[0], V[1]), Uh = [U[0] / su, U[1] / su], Vh = [V[0] / sv, V[1] / sv], org = opt.org || [0, 0];
  for (const p of D.parts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [u, v, r] of extent(p)) { const [x, y] = toScr(u, v), rr = r * Math.max(su, sv) + 1; x0 = Math.min(x0, x - rr); y0 = Math.min(y0, y - rr); x1 = Math.max(x1, x + rr); y1 = Math.max(y1, y + rr); }
    const bx = Math.floor(x0), by = Math.floor(y0), w = Math.ceil(x1) - bx + 1, h = Math.ceil(y1) - by + 1;
    const mask = new Uint8Array(w * h), W = new Float32Array(w * h * 2);
    const sa = p.t === 'c' ? toScr(...p.a) : null, sb = p.t === 'c' ? toScr(...p.b) : null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = bx + x, Y = by + y, c = hit(p, ...toItem(X + 0.5, Y + 0.5));
      let n = 0; for (const [sx, sy] of SUB) if (hit(p, ...toItem(X + sx, Y + sy))) n++;
      let on = c ? 1 : n >= 3 ? 1 : 0, wc = c;
      if (!on && sa && segDist(X + 0.5, Y + 0.5, sa[0], sa[1], sb[0], sb[1]) <= 0.5) on = 1;   // thin bars stay 1 px wide
      if (!on) continue;
      mask[y * w + x] = 1;
      if (!wc) wc = [0, 0];
      W[(y * w + x) * 2] = wc[0]; W[(y * w + x) * 2 + 1] = wc[1];
    }
    const cxp = bx + w / 2, cyp = by + h / 2, ext = Math.max(w, h) / 2 || 1;
    const M_ = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const X = bx + x, Y = by + y;
      let v;
      if (p.t === 'p') {
        v = 0.5 - ((X - cxp) * 0.55 + (Y - cyp) * 0.62) / ext * 0.16;
        if (!M_(x - 1, y) || !M_(x, y - 1)) v += 0.3;
        else if (!M_(x + 1, y) || !M_(x, y + 1)) v -= 0.24;
      } else {
        const wu = W[(y * w + x) * 2], wv = W[(y * w + x) * 2 + 1];
        let nx = wu * Uh[0] + wv * Vh[0], ny = wu * Uh[1] + wv * Vh[1];
        const l = Math.hypot(nx, ny); if (l > 1) { nx /= l; ny /= l; }
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        v = 0.4 + (nx * LD[0] + ny * LD[1] + nz * LD[2]) * 0.62;
      }
      v += p.k ?? 0;
      let col = null;
      if (p.pat) { const [u, vv] = toItem(X + 0.5, Y + 0.5), r = p.pat(u, vv); if (Array.isArray(r)) col = r; else v += r; }
      set(X, Y, col || shade(p.m, v, X - org[0], Y - org[1]), p.e || null, false);
    }
  }
  // a hanging line from the tip, with a red-and-white float
  const ln = opt.line;
  if (D.tip && (ln === undefined ? D.line : ln > 0)) {
    const [tx, ty] = toScr(...D.tip), len = ln === undefined ? Math.max(4, Math.round(D.line * sv)) : Math.max(3, Math.round(ln)), X = Math.round(tx), Y0 = Math.round(ty) + 1;
    for (let k = 0; k < len; k++) set(X, Y0 + k, [214, 212, 204], null, true);
    const b = sv > 0.8 ? 1 : 0, yb = Y0 + len;
    for (let y = 0; y <= 2 + b; y++) for (let x = -b; x <= b; x++) set(X + x, yb + y, y <= (b ? 1 : 0) ? (x < 0 ? [236, 92, 80] : [198, 48, 44]) : x < 0 ? [244, 242, 236] : [206, 204, 198], null, false);
    if (b) { set(X, yb + 4, [150, 150, 158], null, true); set(X + 1, yb + 5, [150, 150, 158], null, true); }
  }
}

// ---- inventory icon ---------------------------------------------------------------------------------
const OUT = [38, 24, 34];
export function icon(kind, size = 32) {
  const D = ITEMS[kind], G = new GBuf(size, size);
  if (!D) return G;
  const a = D.ia * Math.PI / 180, vk = D.vk || 1, Uu = [Math.cos(a), Math.sin(a)], Vu = [-Math.sin(a) * vk, Math.cos(a) * vk];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const grow = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  for (const p of D.parts) for (const [u, v, r] of extent(p)) grow(u * Uu[0] + v * Vu[0], u * Uu[1] + v * Vu[1], r);
  if (D.tip) { const tx = D.tip[0] * Uu[0] + D.tip[1] * Vu[0], ty = D.tip[0] * Uu[1] + D.tip[1] * Vu[1]; grow(tx, ty + D.line + 5, 1); }
  const room = size - 5, s = Math.min((D.is ?? 1) * size / 32, room / (x1 - x0), room / (y1 - y0));
  const ox = (size - 1) / 2 - (x0 + x1) / 2 * s - 0.5, oy = (size - 1) / 2 - (y0 + y1) / 2 * s - 0.5;
  const col = new Array(size * size).fill(null), emi = new Array(size * size).fill(null), no = new Uint8Array(size * size);
  drawItem((x, y, c, e, n) => { if (x < 0 || y < 0 || x >= size || y >= size) return; const i = y * size + x; col[i] = c; emi[i] = e; no[i] = n ? 1 : 0; }, kind, ox, oy, [Uu[0] * s, Uu[1] * s], [Vu[0] * s / vk, Vu[1] * s / vk]);
  outlineAndGlow(col, emi, no, size, size);
  for (let i = 0; i < size * size; i++) if (col[i]) G.put(i % size, Math.floor(i / size), col[i], null, 1, emi[i], F_NOCAST);
  G.autoNormals([0, 0.25, 0.97], 3);
  // soft drop shadow down and to the right
  for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) {
    const i = y * size + x; if (col[i]) continue;
    const sx = x - 1, sy = y - 2;
    if (sx >= 0 && sy >= 0 && col[sy * size + sx] && !no[sy * size + sx]) G.put(x, y, [20, 16, 30], [0, 0, 1], 0, null, F_NOCAST, 56);
  }
  return G;
}

// the selective outline shared by icons and held items: warm dark against solid pixels, a blue glow
// against emissive ones; 1 px lines (fishing line) get none
export function outlineAndGlow(col, emi, no, w, h) {
  const add = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (col[i]) continue;
    let solid = null, glow = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const j = Y * w + X; if (!col[j] || no[j]) continue;
      if (emi[j] && emi[j][3] > 180) glow = emi[j]; else solid = col[j];
    }
    if (glow) add.push(i, [Math.round(glow[0] * 0.45), Math.round(glow[1] * 0.55), Math.round(glow[2] * 0.85)], [glow[0], glow[1], glow[2], 140]);
    else if (solid) add.push(i, [Math.round(OUT[0] + solid[0] * 0.08), Math.round(OUT[1] + solid[1] * 0.06), Math.round(OUT[2] + solid[2] * 0.08)], null);
  }
  for (let k = 0; k < add.length; k += 3) { col[add[k]] = add[k + 1]; emi[add[k]] = add[k + 2]; }
}
