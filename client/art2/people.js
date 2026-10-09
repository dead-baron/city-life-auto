// Art v2 people (targets C1-C7): chunky, big-headed adults about 42 px tall, built as a small 3D rig -
// ellipsoids, tapered capsules and boxes posed by a skeleton (two-bone IK for arms and legs) - and ray-cast
// through the game's high 3/4 camera (orthographic, 35 deg above the horizon). Every pose therefore turns
// through all 8 directions with the same volume, overlap and light, and lying, rolling, riding and swimming
// come from the same body. The 16-bit look comes from the shading: 5-step hue-shifted ramps per material,
// ordered dither between steps, cast shadows between parts (a cap brim on the eyes, the head on the collar),
// crease darkening, face stamps (eyes, brows, mouth) placed through the head's own frame, and dark hue-tinted
// outlines round the figure and between overlapping parts (an arm across the body, the chin over the shirt).
//
// person(app, dir, pose, frame, opt) -> GBuf. Anchor .ax/.ay = the feet (for seated, lying, rolling and swimming
//   poses: the ground or water point under the hips). z = height above it in world px; every pixel F_CHAR.
//   dir: 0 S, 1 SE, 2 E, 3 NE, 4 N, 5 NW, 6 W, 7 SW (all eight drawn, nothing mirrored)
//   pose: a POSES key (frames per pose below); the first version's 'walk' (4 frames) and 'held' still work
//   opt: { held: items.js kind (overrides app.held), tight: crop to the figure (otherwise the classic 36 x 50
//          box with the feet on row 47, grown when a pose needs more), lineLen: fishing line length (px; default:
//          down to the anchor's level), debug: colour each primitive flat (a development aid) }
// app: { skin 0-5, build 0 slim | 1 average | 2 heavy | 3 tall, body {h, w, limb, belly, muscle} (overrides build),
//   fem, hair {style, color}, beard 'short'|'full'|'stubble', top {kind, color, color2, pattern, tie}, bottom {kind, color},
//   shoes (colour), shoeKind, hat {kind, color}, glasses 'sun'|'round', mask, bandana (colour), chain, carry, held,
//   back 'backpack', backColor, gloves (colour), tattoo, seed, censored }
// The look system (shared/look.js lookArt) adds: skin 0-15, age 0-5 (posture), face {shape, eyes, eyeColor, brows, nose,
//   lips, freckles, mole, dimples}, makeup {kind, color}, tattoo (bits: 1 arms 2 legs 4 neck 8 chest 16 face), piercings
//   (bits: 1 ears 2 nose 4 brow 8 lip), scar 1-5, top {inner, trim, sleeve, len, pattern: stripes check camo floral tiedye},
//   bottom {len, trim}, shoeTrim, bootTall, hiTop, hat.plain, glasses 'goggles'|'patch'|'domino' (+ lens, glassColor),
//   mask (+ maskTrim: a ski mask; a mask hides the hair), medmask, jewel {chain, choker, ear, watch, bangles, color}, chain
//   (colour), bagColor, bagSmall, beltBag; more hair (undercut fade mullet topknot pixie twinbuns pigtails braid curlylong
//   shag cornrows curtains halfup) and beards (long goatee moustache handlebar chinstrap chops soul vandyke).
//   hair: spiky short buzz bald afro long wavy pony bun braids dreads mohawk slick curly bob
//   tops: tee tank polo shirt hoodie jacket suit leather puffer flannel hawaiian vest hivis uniform tactical scrubs
//         apron overalls tracksuit jersey coat cardigan dress fur none bikini swimsuit towel
//   bottoms: jeans pants cargo shorts skirt track leggings trunks bikini towel none
//   shoeKind: sneaker shoe boot heel sandal barefoot (else from the colour)
//   hats: cap trucker police beanie bucket sunhat cowboy fedora hard helmet bandana headband hood
//   carry: briefcase bag purse toolbag shopping coffee phone cane board, or any items.js kind (held)
// Undressed bodies (a 'none' bottom, or a 'none' top on a woman) get a small pixelated censor block over the
// private areas only; app.censored dresses them in swimwear instead. Adults only.
// Dither and texture patterns are anchored to the feet, so they hold still from frame to frame.
// Also exported: POSES (frames per pose), SEATS (seat heights), PERSON_CAM, HAIR_STYLES, TOP_KINDS, SKIN_TONES,
// cloth(colour) -> 5-step ramp, ARCHETYPES (named looks, C2/C3) and randomPerson(seed, archetype) -> app.
import { GBuf, F_CHAR, F_NOCAST, hash, bayer } from './gbuf.js';
import { ITEMS, drawItem, itemSpan } from './items.js';

// ---- camera, light, poses -------------------------------------------------------------------------------------
const EL = 35 * Math.PI / 180, CA = Math.cos(EL), SA = Math.sin(EL), S0 = 400;
const LT = (() => { const v = [-0.6, 0.38, 0.7], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
export const PERSON_CAM = { elevation: 35, zScale: CA };          // world px of height per model unit = zScale
// seat heights (world px above the anchor) the seated poses sit on: motorbike / jet ski, bicycle, bench, car, the ground
// (by a campfire, knees up)
export const SEATS = { ride: 20, pedal: 19, sit: 11, drive: 9, sitlow: 3 };
export const POSES = { idle: 2, walk0: 6, walk1: 6, walk2: 6, walk3: 6, punch: 6, swing: 6, aim: 2, aimw: 6, carry: 6, handsup: 2, fish: 4, kneel: 2, roll: 4, down: 2, dead: 1, swim: 2, ride: 1, pedal: 4, sit: 2, drive: 1, walk: 4, held: 2, sitlow: 2, cuffed: 6,
  // hit reactions: a stagger (0-1 knocked back, 2-3 shoved forward), a limp, crawling on the stomach, down on the face or the
  // back (1: pushing up to get back on their feet), dead face down or on the side ('dead' lies on the back)
  stagger: 4, limp: 6, crawl: 4, downF: 2, downB: 2, deadF: 1, deadS: 1 };
const ALIAS = { move0: 'walk0', move1: 'walk1', move2: 'walk2', move3: 'walk3', jog: 'walk1', run: 'walk2', sprint: 'walk3', held: 'idle', stand: 'idle' };
export const HAIR_STYLES = ['spiky', 'short', 'buzz', 'bald', 'afro', 'long', 'wavy', 'pony', 'bun', 'braids', 'dreads', 'mohawk', 'slick', 'curly', 'bob'];
export const TOP_KINDS = ['tee', 'tank', 'polo', 'shirt', 'hoodie', 'jacket', 'suit', 'leather', 'puffer', 'flannel', 'hawaiian', 'vest', 'hivis', 'uniform', 'tactical', 'scrubs', 'apron', 'overalls', 'tracksuit', 'jersey', 'coat', 'cardigan', 'dress', 'fur', 'none', 'bikini', 'swimsuit', 'towel'];

// ---- colour -----------------------------------------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hexRgb = (h) => { let s = String(h).replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; const n = parseInt(s, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  return [(mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60, s, l];
}
function hslRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return s ? [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(clamp(v, 0, 1) * 255)) : [l, l, l].map((v) => Math.round(v * 255));
}
const NAMED = {
  white: '#e8e4dc', black: '#2c2c34', denim: '#3e5f8f', navy: '#2c3a66', red: '#b8343a', orange: '#d8722e', yellow: '#e0b83a', green: '#3f7a46',
  teal: '#2f8a86', purple: '#6a3e8e', pink: '#d86a90', khaki: '#b49a6a', grey: '#80808a', brown: '#6a4a32', cream: '#e6dcc4', olive: '#5c6236',
  maroon: '#76242c', tan: '#c49a6c', gold: '#d6a63a', sky: '#6aa6d6', lime: '#b8e02a', charcoal: '#3a3a44', beige: '#cdb894', lilac: '#a88ac8',
  coral: '#e2765e', mint: '#7ac8a4', rust: '#a4502e', forest: '#2e5a38', leather: '#5a3a26',
};
const RC = new Map();
function hueTo(a, b, k) { const d = ((b - a + 540) % 360) - 180; return a + d * k; }
// n steps with the base colour at index k: darker steps lose light and lean toward violet, lighter ones gain light and
// lean a little toward warm yellow
function hramp(rgb, n, k, dark, light, sd = 0.22, sl = 0.1, keepSat = 0) {
  const [h, s, l] = rgbHsl(rgb[0], rgb[1], rgb[2]), out = [];
  for (let i = 0; i < n; i++) {
    const t = i - k;
    if (t < 0) { const u = -t / Math.max(1, k); out.push(hslRgb(hueTo(h, 255, sd * u), Math.min(1, s * (1 + 0.2 * u) + (s < 0.1 ? 0.05 * u : 0)), l * (1 - dark * u))); }
    else if (t > 0) { const u = t / Math.max(1, n - 1 - k); out.push(hslRgb(hueTo(h, 48, sl * u), Math.min(1, s * (1 - 0.15 * u * (1 - keepSat)) + keepSat * 0.06 * u), l + (1 - l) * light * u)); }
    else out.push(rgb.map(Math.round));
  }
  return out;
}
// a 5-step clothing ramp for a colour name, '#hex', [r,g,b] or a ready ramp; the base sits where front-lit
// cloth lands, very dark colours keep two lighter steps (black still reads), very light ones four darker steps
export function cloth(c) {
  if (Array.isArray(c) && Array.isArray(c[0])) return c;
  const key = Array.isArray(c) ? c.join(',') : String(c || 'grey');
  let R = RC.get(key);
  if (R) return R;
  const rgb = Array.isArray(c) ? c : hexRgb(NAMED[key] || (key[0] === '#' ? key : NAMED.grey)), l = rgbHsl(rgb[0], rgb[1], rgb[2])[2];
  R = l < 0.17 ? hramp(rgb, 5, 2, 0.45, 0.26, 0.2, 0.04) : l > 0.8 ? hramp(rgb, 5, 4, 0.48, 0, 0.3) : hramp(rgb, 5, 3, 0.62, 0.28, 0.32, 0.1);
  if (RC.size > 4000) RC.clear(); // (custom colours are endless: a long session doesn't keep them all)
  RC.set(key, R);
  return R;
}
// skin: the targets' saturated warm peach-to-brown; shadows lean rose-red and lose a little saturation, highlights
// stay saturated and lean warm (the server's six tones)
export const SKIN_TONES = ['#f1c9a5', '#e0ac7e', '#c68953', '#a86b3c', '#7d4a26', '#4f2f1a', '#f8dcc8', '#ecc0a0', '#e8c08a', '#d8a070', '#c89a6a', '#b87a4a', '#946038', '#6a4024', '#5a3422', '#3e2416'];
const SKIN = SKIN_TONES.map((hx) => {
  const [h, s, l] = rgbHsl(...hexRgb(hx));
  const S = clamp(s + 0.24, 0, 0.92), L = l < 0.4 ? l + 0.04 : l - 0.02;
  return [[-0.42, 16, -0.16], [-0.27, 10, -0.12], [-0.13, 5, -0.04], [0, 2, 0], [0.13, -3, 0]].map(([dl, dh, ds]) => hslRgb(h - dh, clamp(S + ds, 0, 1), dl < 0 ? L * (1 + dl) : L + (1 - L) * dl));
});
const HAIRS = ['#2e2422', '#8a4a26', '#b06a30', '#e2c066', '#a8a8ac', '#b8432e'];
function hairRamp(c) {
  const hx = typeof c === 'number' ? HAIRS[c] || HAIRS[0] : NAMED[c] || (c && c[0] === '#' ? c : HAIRS[0]), key = 'hair' + hx;
  let R = RC.get(key);
  if (R) return R;
  const rgb = hexRgb(hx), l = rgbHsl(...rgb)[2];
  R = hramp(rgb, 5, 3, 0.58, l < 0.16 ? 0.22 : l > 0.75 ? 0.36 : 0.3, 0.28, 0.2, 1);
  RC.set(key, R);
  return R;
}
const lum = (c) => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
const mixHex = (a, b, k) => { const A = hexRgb(NAMED[a] || a), B = hexRgb(NAMED[b] || b); return '#' + A.map((v, i) => clamp(Math.round(v + (B[i] - v) * k), 0, 255).toString(16).padStart(2, '0')).join(''); };

// ---- vectors and frames (3x3 row-major; the columns are a frame's right, forward and up axes) ------------------
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vlerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mmul = (A, B) => { const C = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return C; };
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const mcol = (M, i) => [M[i], M[3 + i], M[6 + i]];
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; };   // pitch forward (up tips to +y)
const rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; };   // yaw right (forward turns to +x)
const ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };   // roll right (up tips to +x)
// body-space frame whose forward axis is f and whose up axis is as close to u as it can be
function frameFU(f, u = [0, 0, 1]) {
  f = vnorm(f);
  let r = vcross(f, u);
  if (vlen(r) < 1e-4) r = vcross(f, [0, -1, 0.001]);
  r = vnorm(r);
  const up = vcross(r, f);
  return [r[0], f[0], up[0], r[1], f[1], up[1], r[2], f[2], up[2]];
}
// a frame whose up axis is the given direction (limbs, canes)
const frameUp = (u, f = [0, 1, 0]) => { u = vnorm(u); let r = vcross(f, u); if (vlen(r) < 1e-4) r = vcross([1, 0, 0.001], u); r = vnorm(r); const ff = vcross(u, r); return [r[0], ff[0], u[0], r[1], ff[1], u[1], r[2], ff[2], u[2]]; };
// two-bone IK: the middle joint for root a and target t, bending toward hint
function ik(a, t, l1, l2, hint) {
  let d = vsub(t, a), L = vlen(d) || 1e-6;
  const mx = l1 + l2 - 0.02, mn = Math.abs(l1 - l2) + 0.05;
  if (L > mx) { d = vmul(d, mx / L); L = mx; } else if (L < mn) { d = vmul(d, mn / L); L = mn; }
  const dn = vmul(d, 1 / L), x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), hh = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let p = vsub(hint, vmul(dn, vdot(hint, dn)));
  if (vlen(p) < 1e-4) p = vsub([0, 1, 0], vmul(dn, dn[1]));
  p = vnorm(p);
  return { mid: vadd(a, vadd(vmul(dn, x), vmul(p, hh))), end: vadd(a, d) };
}
const sm = (t) => t * t * (3 - 2 * t);

// ---- body ---------------------------------------------------------------------------------------------------------
// face shapes (look.js FACE_OPTS.shape): head radii x, y, z and the jaw's width
const FACE_SHAPE = [[1, 1, 1, 0.74], [1.05, 1.03, 0.96, 0.8], [1.04, 1, 0.98, 0.88], [0.95, 0.97, 1.07, 0.7], [1.02, 1, 1, 0.62], [0.98, 1, 1.02, 0.66]];
const NOSE = [[1, 1, 1], [0.8, 0.85, 0.85], [0.95, 0.8, 0.9], [1.35, 1, 1], [0.9, 1.3, 1.25], [1, 1.25, 1.1]];
const BUILDS = [{ h: 0.98, w: 0.88, limb: 0.86 }, { h: 1, w: 1, limb: 1 }, { h: 0.96, w: 1.22, limb: 1.18, belly: 1.5 }, { h: 1.1, w: 0.96, limb: 0.96 }];
function dims(A) {
  const fem = !!A.fem, b = { h: 1, w: 1, limb: 1, belly: 0, muscle: 0, ...(BUILDS[A.build ?? 1] || BUILDS[1]), ...(A.body || {}) };
  const h = b.h * (fem ? 0.97 : 1), w = b.w * (fem ? 0.9 : 1), lm = b.limb * (fem ? 0.86 : 1), mu = b.muscle || 0, bel = b.belly || 0;
  const D = {
    fem, h, w, lm, mu, belly: bel,
    ank: 3.1, shin: 7.0 * h, thigh: 7.0 * h, hipX: 3.4 * w * (fem ? 1.1 : 1),
    pelR: [6.5 * w * (fem ? 1.08 : 1), 4.7 * w, 4.6], waistR: [7.0 * w * (fem ? 0.86 : 1) + bel * 1.4, 4.9 * w + bel * 1.2, 4.9], waistUp: 4.3 * h,
    chestR: [8.4 * w * (1 + mu * 0.1), 5.4 * w * (1 + mu * 0.08), 6.5 * h], chestUp: 8.9 * h,
    shX: 8.3 * w * (1 + mu * 0.1), shUp: 12.9 * h, shBar: 3.6 * w * (1 + mu * 0.08), neckUp: 15.0 * h, neckR: 2.4 * w * (1 + mu * 0.25),
    head: (fem ? [7.2, 7.2, 7.6] : [7.5, 7.4, 7.9]).map((v, i) => v * (FACE_SHAPE[A.face?.shape | 0] || FACE_SHAPE[0])[i]), headUp: 7.5,
    jawW: (FACE_SHAPE[A.face?.shape | 0] || FACE_SHAPE[0])[3], age: A.age | 0,
    upper: 8.3 * h, fore: 7.0 * h, armR: [2.95 * lm * (1 + mu * 0.2), 2.55 * lm * (1 + mu * 0.12)], foreR: [2.5 * lm * (1 + mu * 0.15), 2.0 * lm], fist: 3.0 * lm * (fem ? 0.95 : 1),
    thighR: [3.7 * lm * (fem ? 1.06 : 1), 3.0 * lm], shinR: [2.85 * lm, 2.3 * lm], foot: fem ? [2.35, 4.0, 2.1] : [2.75, 4.6, 2.45],
  };
  D.pelZ = D.ank + (D.shin + D.thigh) * 0.985 + 1.0;
  D.reach = D.upper + D.fore + 1.2;
  return D;
}

// ---- poses ----------------------------------------------------------------------------------------------------------
// A pose sets body-space targets: x = the body's right, y = forward, z = up, the feet on z = 0. P.hands(S) runs once the
// spine is solved and places the hands (and any held item) from the shoulders.
function base(D) {
  return {
    pel: [0, 0, D.pelZ - 0.1], pelYaw: 0, lean: 0.04 + (D.age >= 5 ? 0.12 : D.age >= 4 ? 0.06 : 0), twist: 0, tilt: 0, headYaw: 0, headPitch: 0, breath: 0,
    fL: [-D.hipX - 1.6, 0.3, D.ank], fR: [D.hipX + 1.6, 0.3, D.ank], toeL: 0, toeR: 0, splay: 0.2, kneeL: [0, 1, 0], kneeR: [0, 1, 0],
    hL: null, hR: null, elL: [-0.35, -1, -0.2], elR: [0.35, -1, -0.2], openL: 0, openR: 0,
    root: null, pivot: null, ground: false, rise: 0, item: null, water: false, eyes: 1, hands: null, acc: true, line: 0,
  };
}
const GAIT = [   // walk, jog, run, sprint: stance travel Ss, swing path back Sb / forward Sf, lift, heel kick, ...
  { Ss: 16, Sb: 8, Sf: 8, lift: 2.6, kick: 0, duty: 0.6, sway: 0.4, lean: 0.07, arm: 7, run: 0, twist: 0.16, toe: 0.3 },
  { Ss: 12, Sb: 10, Sf: 8, lift: 4.0, kick: 5, duty: 0.42, sway: 0.25, lean: 0.2, arm: 6, run: 1, twist: 0.2, toe: 0.6 },
  { Ss: 14, Sb: 13, Sf: 10, lift: 5.5, kick: 7, duty: 0.36, sway: 0.15, lean: 0.34, arm: 7, run: 1, twist: 0.24, toe: 0.8 },
  { Ss: 16, Sb: 16, Sf: 11, lift: 6.5, kick: 8, duty: 0.32, sway: 0.1, lean: 0.6, arm: 8.5, run: 1, twist: 0.26, toe: 0.95 },
];
// a smooth path through keys [[u, y, z]]
function path3(K, u) { let i = 1; while (i < K.length - 1 && u > K[i][0]) i++; const a = K[i - 1], b = K[i], t = sm(clamp((u - a[0]) / (b[0] - a[0]), 0, 1)); return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function gait(D, P, lvl, ph, arms = true) {
  const G = GAIT[lvl], ys = [0, 0], st = [0, 0];
  const swing = G.run ? [[0, -G.Ss / 2, 0], [0.22, -G.Sb, G.kick * 0.55 + 1], [0.55, -G.Sb * 0.1, G.kick * 0.6 + G.lift * 0.6], [0.8, G.Sf, G.lift * 0.9], [1, G.Ss / 2, 0.4]] : [[0, -G.Ss / 2, 0], [0.5, 0, G.lift], [1, G.Ss / 2, 0]];
  [['L', -1, 0], ['R', 1, 0.5]].forEach(([k, s, off], j) => {
    const q = (ph + off) % 1;
    let y, z = 0, toe = 0;
    if (q < G.duty) { const u = q / G.duty; y = G.Ss * (0.5 - u); toe = G.run ? -0.15 * (1 - u) + 0.3 * u * u : 0.25 * Math.max(0, u - 0.7) / 0.3; st[j] = 1; }
    else { const u = (q - G.duty) / (1 - G.duty); [y, z] = path3(swing, u); toe = G.toe * Math.sin(Math.PI * Math.min(1, u * 1.25)); }
    P['f' + k] = [s * (D.hipX + 0.35), y, D.ank + z]; P['toe' + k] = toe; ys[j] = y;
  });
  // the pelvis rides as high as the planted feet allow (the walk's bob comes out of that); runs sink a little more
  const L = (D.thigh + D.shin) * 0.975, c = Math.cos(4 * Math.PI * (ph - G.duty / 2));
  let pz = D.pelZ - (G.run ? 0.6 + lvl * 0.35 - c * 0.7 : 0);
  for (let j = 0; j < 2; j++) if (st[j] || !G.run) { const dy = ys[j], dx = 0.35; pz = Math.min(pz, D.ank + Math.sqrt(Math.max(0, L * L - dy * dy - dx * dx)) + 1.0); }
  P.pel = [-G.sway * Math.cos(2 * Math.PI * (ph - G.duty / 2)), 0, pz];
  P.lean = G.lean; P.twist = G.twist * (ys[1] - ys[0]) / (G.Ss + G.Sf); P.pelYaw = -P.twist * 0.6; P.headPitch = -G.lean * 0.45; P.splay = 0.08;
  P.gait = G; P.gaitY = ys;
  if (arms) P.hands = (S) => {
    [['L', -1, 0], ['R', 1, 1]].forEach(([k, s, j]) => {
      const sw = clamp(-ys[j] / (G.run ? (G.Sb + G.Sf) / 2 : G.Ss / 2), -1.2, 1.2) * G.arm, sh = S['sh' + k];   // each arm swings against its leg
      P['h' + k] = G.run ? vadd(sh, [s * 0.6, 1.6 + sw, -9.4 + Math.max(0, sw) * 0.8 + (lvl === 3 ? 1.6 : 0)]) : vadd(sh, [s * 1.6, 1.2 + sw, -D.reach * 0.94 + Math.abs(sw) * 0.25]);
      P['el' + k] = G.run ? [s * 0.25, -1, -0.5] : [s * 0.3, -1, -0.25];
    });
  };
}
// held items: classes by how they are held
const ICLS = {
  pistol: 'gun1', revolver: 'gun1', taser: 'gun1', silencedPistol: 'gun1', pepperSpray: 'gun1', shotgun: 'gun2', rifle: 'gun2', smg: 'gun2', sniper: 'gun2',
  rocketLauncher: 'rocket', bat: 'big', sledgehammer: 'big', crowbar: 'one', nightstick: 'one', knife: 'knife', sword: 'blade', katana: 'blade', energyBlade: 'blade',
  chainsaw: 'saw', fishingRod: 'rod', medkit: 'bill', bandage: 'bill', cash: 'bill', keys: 'bill', phone: 'phone', phoneUp: 'phoneup', bottle: 'bill', coffee: 'bill', spikeStrip: 'bill',
  huntKnife: 'knife', bow: 'gun1', varmintRifle: 'gun2',   // (the bow: held out and aimed like a pistol, its limbs up and down)
  flashlight: 'gun1', // held out like a pistol: low in front at rest, up and pointed when aiming
  umbrella: 'umb',     // held up in the right hand, the shaft straight up (the other arm swings free)
};
// The umbrella's hold, in body space (x right, y forward, z up): the right hand in front of the right shoulder at a
// set height whatever the build, the shaft UMBRELLA_LEN long straight up, so its top - where the renderer puts the
// canopy (game/peds.js umbrellaTop) - is the same for everyone.
export const UMBRELLA_HAND = [9.0, 3.4, 25], UMBRELLA_LEN = 29;
function setItem(P, kind, axis, down, two = false) {
  axis = vnorm(axis);
  let v = vsub(down, vmul(axis, vdot(down, axis)));
  if (vlen(v) < 1e-3) v = vsub([0, 0, -1], vmul(axis, axis[2]));
  P.item = { kind, axis, vdir: vnorm(v), two };
}
// standing about or walking with an item
function restHold(D, P, S, kind) {
  const sR = S.shR, r = D.reach, c = ICLS[kind];
  if (c === 'gun1') { P.hR = vadd(sR, [1.4, 3.2, -r * 0.9]); setItem(P, kind, [0.06, 0.55, -0.83], [0, -0.85, -0.5]); }
  else if (c === 'gun2') { P.hR = vadd(S.pel, mv(S.PF, [3.6, 7.4, 3.4])); setItem(P, kind, [-0.55, 0.8, 0.22], [0, 0, -1], true); P.elR = [1, -0.4, -0.4]; P.elL = [-1, 0, -0.5]; }
  else if (c === 'rocket') { P.hR = vadd(sR, [0.2, 3.4, -4.6]); setItem(P, kind, [0, 1, 0.06], [0, 0, -1], true); P.elR = [1, -0.4, -0.6]; P.elL = [-1, 0, -0.6]; }
  else if (c === 'big') { P.hR = vadd(sR, [-0.2, 4.4, -5.2]); setItem(P, kind, [0.12, -0.55, 0.83], [0, 1, 0], kind === 'sledgehammer'); P.elR = [1, -0.2, -0.6]; }
  else if (c === 'one') { P.hR = vadd(sR, [1.8, 1.6, -r * 0.93]); setItem(P, kind, [0.15, 0.32, -0.93], [0, 1, 0]); }
  else if (c === 'knife') { P.hR = vadd(sR, [1.8, 2.6, -r * 0.9]); setItem(P, kind, [0, 0.8, -0.6], [0, 0, -1]); }
  else if (c === 'rod') { P.hR = vadd(sR, [1.4, 4.2, -r * 0.74]); setItem(P, kind, [0.15, 0.42, 0.9], [0, 1, 0]); P.line = 8; }
  else if (c === 'blade') { P.hR = vadd(S.pel, mv(S.PF, [1.4, 5.6, 4.2])); setItem(P, kind, [0.05, 0.45, 0.89], [0, 1, 0], true); P.elR = [1, -0.3, -0.5]; P.elL = [-1, -0.3, -0.5]; }
  else if (c === 'saw') { P.hR = vadd(S.pel, mv(S.PF, [3, 5.5, 3.4])); setItem(P, kind, [-0.1, 0.9, -0.3], [0, 0, -1], true); }
  else if (c === 'umb') { P.hR = [...UMBRELLA_HAND]; setItem(P, kind, [0, 0, 1], [0, 1, 0]); P.elR = [0.8, -0.3, -1]; }
  else if (c === 'phone') { P.hR = vadd(S.chest, mv(S.SP, [1.4, 6.6, -2.4])); P.hL = vadd(S.chest, mv(S.SP, [-0.6, 6.4, -3])); setItem(P, kind, [0, 1, 0], [0, 0, -1]); P.elR = [1, -0.5, -0.6]; P.elL = [-1, -0.5, -0.6]; }
  // held up in both hands at eye height, arms out: filming or taking a photo of something (server npc.js spectacle)
  else if (c === 'phoneup') { P.hR = vadd(S.chest, mv(S.SP, [1.2, 8.8, 7.8])); P.hL = vadd(S.chest, mv(S.SP, [-0.9, 8.6, 7.4])); setItem(P, kind, [0, 0, 1], [0, 1, 0]); P.elR = [1, -0.2, -0.4]; P.elL = [-1, -0.2, -0.4]; }
  else { P.hR = vadd(sR, [1.6, 2.4, -r * 0.92]); setItem(P, kind, [0, 1, 0], [0, 0, -1]); }
}
// arms and torso for a melee arc, frame k 0 wind-up, 1 strike, 2 follow-through; side -1 swings back the other way
function swingPose(D, P, kind, k, side) {
  const c = ICLS[kind];
  P.fL = [-D.hipX - 0.6, [6.0, 7.6, 7.0][k], D.ank]; P.fR = [D.hipX + 0.8, [-5.4, -6.4, -6.0][k], D.ank]; P.pel[2] -= [1.6, 2.6, 2.2][k]; P.pel[1] += [0, 1.0, 0.8][k];
  if (c === 'knife') {
    P.twist = side * [0.25, -0.36, -0.1][k]; P.lean = [0.08, 0.2, 0.12][k];
    P.hands = (S) => {
      const sh = side > 0 ? S.shR : S.shL;
      const h = vadd(sh, [-side * [1.2, 2.6, 2.2][k], [3.2, 14.5, 8.5][k], [-1.5, 0.4, -0.2][k]]);
      if (side > 0) { P.hR = h; P.hL = vadd(S.shL, [2.6, 5, 0.4]); } else { P.hL = h; P.hR = vadd(S.shR, [-2.6, 5, 0.4]); }
      setItem(P, kind, [0, 1, -0.08 - (k === 0 ? 0.3 : 0)], [0, 0, -1]);
      P.item.hand = side > 0 ? 'R' : 'L';
    };
    return;
  }
  const two = c === 'big' || c === 'blade' || c === 'saw';
  P.twist = side * [0.48, -0.02, -0.36][k]; P.lean = [0.04, 0.2, 0.22][k];
  P.hands = (S) => {
    const sx = side;
    const H = [vadd(S.shR, [sx * 0.2 - (sx < 0 ? 2 * D.shX : 0), 3.2, 3.6]), vadd(S.chest, [sx * 0.6, 10, -2.4]), vadd(S.chest, [-sx * 2.4, 8.6, -5.4])][k];
    const ax = [[sx * 0.12, -0.52, 0.85], [-sx * 0.15, 0.97, 0.12], [-sx * 0.62, 0.72, -0.3]][k];
    P.hR = H; setItem(P, kind, ax, k === 1 ? [0, 0, -1] : [0, 1, 0], two);
    if (!two) P.hL = vadd(S.shL, [2.4, 4.6, -3.5]);
    P.elR = [0.8, -0.5, -0.6]; P.elL = [-0.8, -0.5, -0.6];
  };
}
function aimPose(D, P, kind, rec) {
  const c = ICLS[kind];
  P.fL = [-D.hipX - 0.6, 5.4, D.ank]; P.fR = [D.hipX + 0.9, -4.6, D.ank]; P.pel[2] -= 1.2;
  const r = rec ? 1 : 0;
  if (c === 'gun2' || c === 'rocket') {
    P.twist = 0.34; P.lean = 0.07 - r * 0.06; P.headYaw = -0.22; P.headPitch = 0.12;
    P.hands = (S) => {
      P.hR = c === 'rocket' ? vadd(S.shR, mv(S.SP, [-0.6, 3.6 - r, -4.4 + r * 0.6])) : vadd(S.shR, mv(S.SP, [-2.6, 7.6 - r * 1.2, -3.2 + r * 0.5]));
      setItem(P, kind, [0, 1, 0.03 + r * 0.16], [0, 0, -1], true);
      P.elR = [1, -0.3, -0.7]; P.elL = [-0.6, 0, -1];
    };
  } else if (c === 'gun1') {
    P.twist = 0.1; P.lean = 0.05 - r * 0.06; P.headPitch = 0.05;
    P.hands = (S) => {
      const z = (S.shL[2] + S.shR[2]) / 2;
      P.hR = [0.7, 13.6 - r * 1.6, z - 0.4 + r * 1.6];
      setItem(P, kind, [0, 1, 0.03 + r * 0.4], [0, 0, -1], true);
      P.elR = [1, 0, -1]; P.elL = [-1, 0, -1];
    };
  } else {   // fists (or a melee weapon) up in a guard
    P.lean = 0.1; P.twist = -0.1;
    P.hands = (S) => { P.hR = vadd(S.shR, [-2.4, 5.2, 0.6]); P.hL = vadd(S.shL, [2.6, 6.2, 1.2]); P.elR = [1, 0, -1]; P.elL = [-1, 0, -1]; if (kind) restHoldItem(P, kind); };
  }
}
function restHoldItem(P, kind) { if (ICLS[kind] === 'one' || ICLS[kind] === 'big' || ICLS[kind] === 'knife') setItem(P, kind, [0.1, 0.3, 0.95], [0, 1, 0]); }
function rig(D, A, pose, f, kind, acc) {
  const P = base(D), c = kind ? ICLS[kind] : null;
  if (GAITS2[pose]) { GAITS2[pose](D, P, f, kind, acc); return P; }   // (the city's people, at the end)
  if (pose === 'idle') {
    P.breath = f ? 0.4 : 0;
    if (kind) P.hands = (S) => restHold(D, P, S, kind); else if (acc) P.hands = (S) => accHands(D, P, S, acc);
  } else if (pose === 'walk' || pose[0] === 'w') {
    const lvl = pose === 'walk' ? 0 : +pose[4] || 0;
    gait(D, P, lvl, pose === 'walk' ? f / 4 : f / 6, !kind && !(acc && ACC_HANDS[acc] === 2));
    if (kind) { const sw = P.hands; P.hands = (S) => { if (sw) sw(S); restHold(D, P, S, kind); if (!P.item.two && !P.hL) { const g = P.gait, sw = -P.gaitY[0] / (g.run ? (g.Sb + g.Sf) / 2 : g.Ss / 2) * g.arm; P.hL = vadd(S.shL, g.run ? [-0.6, 1.6 + sw, -9.4 + Math.max(0, sw) * 0.8] : [-1.6, 1.2 + sw, -D.reach * 0.94]); } }; }
    else if (acc) { const sw = P.hands; P.hands = (S) => { if (sw) sw(S); accHands(D, P, S, acc); }; }
  } else if (pose === 'punch' || (pose === 'swing' && (!kind || c === 'gun1' || c === 'gun2' || c === 'rod' || c === 'bill' || c === 'phone' || c === 'rocket'))) {
    const side = f < 3 ? 1 : -1, k = f % 3;
    P.fL = [-D.hipX - 0.6, [6.4, 7.8, 7.2][k], D.ank]; P.fR = [D.hipX + 0.8, [-5.8, -6.6, -6.2][k], D.ank]; P.pel[2] -= [1.8, 2.7, 2.3][k]; P.pel[1] += [0, 1.2, 0.8][k];
    P.lean = [0.12, 0.3, 0.18][k]; P.twist = side * [0.22, -0.4, -0.12][k]; P.headPitch = 0.05; P.acc = false;
    P.hands = (S) => {
      const sh = side > 0 ? S.shR : S.shL, gsh = side > 0 ? S.shL : S.shR;
      const hit = vadd(sh, [-side * [1.4, 2.8, 2.2][k], [3.4, 14.6, 8.6][k], [-0.6, 0.9, 0.6][k]]), guard = vadd(gsh, [side * 2.6, 5.2, 0.8]);
      if (side > 0) { P.hR = hit; P.hL = guard; } else { P.hL = hit; P.hR = guard; }
      P.elR = [1, -0.2, -0.8]; P.elL = [-1, -0.2, -0.8];
    };
  } else if (pose === 'swing') { swingPose(D, P, kind, f % 3, f < 3 ? 1 : -1); P.acc = false; }
  else if (pose === 'aim') { aimPose(D, P, kind, f === 1); P.acc = false; }
  else if (pose === 'aimw') {   // walking while aiming: the legs keep the walk's stride, the arms and torso hold the aim
    gait(D, P, 0, f / 6, false);
    const legs = { fL: P.fL, fR: P.fR, toeL: P.toeL, toeR: P.toeR, pel: P.pel.slice(), pelYaw: P.pelYaw, splay: P.splay };
    aimPose(D, P, kind, false);
    Object.assign(P, legs); P.acc = false;
  }
  else if (pose === 'carry') {
    gait(D, P, 0, f / 6, false); P.lean = -0.05; P.acc = false;
    P.hands = (S) => { for (const [k, s] of [['L', -1], ['R', 1]]) { P['h' + k] = vadd(S.chest, mv(S.SP, [s * 6.6, 7.0, -3.8])); P['el' + k] = [s, -0.4, -0.6]; P['open' + k] = 1; } };
  } else if (pose === 'cuffed') {
    // hands cuffed behind the back (server custody.js): a walk with no arm swing, the head bowed a little
    gait(D, P, 0, f / 6, false); P.acc = false; P.lean = 0.1; P.headPitch = 0.16;
    P.hands = (S) => { for (const [k, s] of [['L', -1], ['R', 1]]) { P['h' + k] = vadd(S.pel, mv(S.PF, [s * 1.1, -4.4, 2.6])); P['el' + k] = [s, -0.8, 0.1]; } };
  } else if (pose === 'handsup') {
    P.acc = false; P.breath = 0.3;
    P.hands = (S) => { for (const [k, s] of [['L', -1], ['R', 1]]) { P['h' + k] = vadd(S['sh' + k], [s * 4.2, 1.6, 15.6 + (f ? 0.6 : 0)]); P['el' + k] = [s, 0, -0.3]; P['open' + k] = 1; } };
  } else if (pose === 'fish') {
    P.acc = false;
    P.fL = [-D.hipX - 0.6, 2.6, D.ank]; P.fR = [D.hipX + 0.7, -1.6, D.ank];
    P.twist = [0, -0.36, 0.06, 0][f]; P.lean = [0.04, 0, 0.16, 0.05][f];
    P.hands = (S) => {
      P.hR = f === 1 ? vadd(S.shR, [0.4, 1.2, 2.6]) : f === 2 ? vadd(S.shR, [-1.8, 9.6, -1.6]) : vadd(S.pel, [2.2, 6.4, f === 3 ? 8.6 : 6.6]);
      setItem(P, 'fishingRod', [[0.06, 0.78, 0.62], [0.25, -0.62, 0.74], [0, 0.96, 0.28], [0.06, 0.6, 0.8]][f], [0, 1, 0], true);
      P.line = f === 0 || f === 3 ? -1 : 0;
      P.elR = [1, -0.4, -0.6]; P.elL = [-1, -0.2, -0.6];
    };
  } else if (pose === 'kneel') {
    P.acc = false;
    P.pel = [0, -1.4, 10.6]; P.lean = 0.42 + f * 0.12; P.headPitch = 0.2;
    P.fR = [D.hipX + 0.3, -6.6, 1.9]; P.toeR = 1.25; P.kneeR = [0, 1, -0.3];
    P.fL = [-D.hipX - 0.6, 6.2, D.ank]; P.kneeL = [0, 1, 0.6];
    P.hands = (S) => { P.hL = [-2.6, 10.6, 8.6 - f * 2.4]; P.hR = [2.6, 10.6, 8.9 - f * 2.4]; P.elL = [-1, 0, -0.3]; P.elR = [1, 0, -0.3]; P.openL = P.openR = 1; };
  } else if (pose === 'roll') {
    P.acc = false; P.ground = true;
    if (f === 0) {
      P.lean = 0.2; P.fL = [-D.hipX, -2.6, D.ank]; P.fR = [D.hipX, -5.5, D.ank + 5.5]; P.kneeR = [0, 1, 0];
      P.hands = (S) => { P.hL = vadd(S.shL, [0.6, 5, 12]); P.hR = vadd(S.shR, [-0.6, 5, 12]); P.elL = [-1, 0, 0]; P.elR = [1, 0, 0]; P.openL = P.openR = 1; };
      P.root = rx(1.15); P.rise = 5;
    } else if (f < 3) {
      P.lean = 0.95; P.headPitch = 0.5; P.pel = [0, 0, D.pelZ];
      P.fL = [-2.4, 5.4, D.pelZ - 8.2]; P.fR = [2.4, 5.4, D.pelZ - 8.2]; P.kneeL = P.kneeR = [0, 1, 0.5];
      P.hands = (S) => { P.hL = [-3.2, 7.6, D.pelZ - 3.2]; P.hR = [3.2, 7.6, D.pelZ - 3.2]; P.elL = [-1, -0.3, 0]; P.elR = [1, -0.3, 0]; };
      P.root = rx(f === 1 ? 1.9 : 3.6); P.pivot = [0, 3, D.pelZ + 3];
    } else {
      P.pel = [0, -1.4, 7.6]; P.lean = 0.72; P.headPitch = -0.35; P.fR = [D.hipX + 0.3, -5.6, 1.9]; P.toeR = 1.2; P.kneeR = [0, 1, -0.3];
      P.fL = [-D.hipX - 0.6, 5.8, D.ank]; P.kneeL = [0, 1, 0.6]; P.ground = false;
      P.hands = (S) => { P.hL = [-4.6, 9.4, 2.6]; P.hR = [5.0, 5.6, 4.2]; P.openL = P.openR = 1; };
    }
  } else if (pose === 'stagger') {
    // hit: frames 0-1 knocked back on the heels (hit from the front), 2-3 shoved forward (hit from behind); the second of each
    // pair is the catch, finding the feet again. A held weapon stays in the right hand.
    const fw = f >= 2, k = f & 1;
    P.acc = false;
    if (!fw) {
      P.lean = [-0.32, -0.12][k]; P.headPitch = [-0.38, -0.12][k]; P.pel = [0, [-1.8, -0.9][k], D.pelZ - [0.7, 0.3][k]];
      P.fL = [-D.hipX - 0.8, [-4.6, -3.2][k], D.ank]; P.fR = [D.hipX + 1.0, [2.4, 1.6][k], D.ank]; P.kneeL = [0, 1, 0.2];
    } else {
      P.lean = [0.46, 0.22][k]; P.headPitch = [0.32, 0.12][k]; P.pel = [0, [1.5, 0.8][k], D.pelZ - [0.9, 0.4][k]];
      P.fL = [-D.hipX - 0.6, [5.6, 3.6][k], D.ank]; P.fR = [D.hipX + 1.0, [-2.6, -1.6][k], D.ank];
    }
    P.hands = (S) => {
      if (kind) restHold(D, P, S, kind);
      else P.hR = fw ? vadd(S.shR, [[4.2, 3.0][k], [-3.4, -1.4][k], [-4.4, -8.2][k]]) : vadd(S.shR, [[3.8, 2.4][k], [5.6, 2.8][k], [-2.4, -8.0][k]]);
      P.hL = fw ? vadd(S.shL, [[-4.4, -3.0][k], [-4.0, -1.6][k], [-5.0, -8.6][k]]) : vadd(S.shL, [[-3.6, -2.6][k], [6.4, 3.2][k], [-4.0, -8.6][k]]);
      P.elL = [-1, 0, -0.3]; P.elR = [1, 0, -0.3]; P.openL = 1; if (!kind) P.openR = 1;
    };
  } else if (pose === 'limp') {
    // walking on a bad right leg: it barely swings or lifts, the body lurches over it, a hand clutches the thigh
    const ph = f / 6;
    gait(D, P, 0, ph, true);
    const fr = P.fR, sw = P.hands;
    P.fR = [fr[0] + 0.4, fr[1] * 0.5 - 1.2, D.ank + Math.min(0.5, fr[2] - D.ank)]; P.kneeR = [0, 0.3, 0];
    const load = Math.max(0, Math.sin(2 * Math.PI * ph));
    P.tilt = 0.05 + 0.1 * load; P.lean = 0.16; P.headPitch = 0.1; P.pel = [P.pel[0] + 0.6 * load, P.pel[1], P.pel[2] - 0.9 * load];
    P.hands = (S) => {
      if (sw) sw(S);
      if (kind) restHold(D, P, S, kind);
      else { P.hR = vadd(S.pel, mv(S.PF, [D.hipX + 1.8, 2.4, -2.6])); P.elR = [1, -0.4, -0.4]; }
    };
  } else if (pose === 'crawl') {
    // on the stomach, dragging along: the arms reach out ahead in turn, the opposite knee draws up and out and pushes
    const s = [0, 1, 0, -1][f], top = D.pelZ + D.neckUp + D.headUp;
    P.acc = false; P.ground = true; P.rise = 0.3; P.lean = 0; P.headPitch = -0.55;
    P.root = rx(Math.PI / 2 - 0.1);
    P.fL = [-D.hipX - 1 - 2.6 * Math.max(0, -s), 2.4, D.ank + 5.5 * Math.max(0, -s)]; P.kneeL = [-1, 0.3, 0];
    P.fR = [D.hipX + 1 + 2.6 * Math.max(0, s), 2.4, D.ank + 5.5 * Math.max(0, s)]; P.kneeR = [1, 0.3, 0];
    P.hands = (S) => { P.hL = [-4.6, 4.6, top - 3 + 4 * s]; P.hR = [4.6, 4.6, top - 3 - 4 * s]; P.elL = [-1, 0.3, 0]; P.elR = [1, 0.3, 0]; P.openL = P.openR = 1; };
  } else if (pose === 'downF') {
    // down on the face (a faceplant, a slide): flat, then pushing up on the hands to get back on the feet
    P.acc = false; P.ground = true; P.headPitch = f ? -0.5 : -0.2; P.headYaw = f ? 0 : 0.7; P.lean = 0;
    P.root = rx(Math.PI / 2 - (f ? 0.32 : 0.04));
    P.fL = [-D.hipX - 1.2, 1.6, D.ank]; P.fR = [D.hipX + 2.6, 2.2, D.ank + (f ? 0 : 3.6)]; P.kneeR = [1, 0.4, 0];
    P.hands = (S) => {
      if (f) { P.hL = vadd(S.shL, [-1.6, 7.4, 1.2]); P.hR = vadd(S.shR, [1.6, 7.4, 1.2]); }
      else { P.hL = vadd(S.shL, [-4.4, 3.6, 7.6]); P.hR = vadd(S.shR, [4.8, 4.4, -6.4]); }
      P.elL = [-1, 0, -0.2]; P.elR = [1, 0, -0.2]; P.openL = P.openR = 1;
    };
  } else if (pose === 'downB') {
    // knocked flat on the back: lying there, then up on the elbows to get up
    P.acc = false; P.ground = true; P.headPitch = f ? 0.35 : 0.1; P.lean = f ? 0.38 : 0;
    P.root = [-1, 0, 0, 0, 0, 1, 0, 1, 0];
    P.fL = [-D.hipX - 1.4, 0.8, D.ank]; P.fR = [D.hipX + 1.6, f ? 4.6 : 0.4, D.ank + (f ? 4.4 : 0.6)]; P.kneeR = [0.3, 1, 0];
    P.hands = (S) => {
      if (f) { P.hL = vadd(S.shL, [-3.2, -4.6, -6.4]); P.hR = vadd(S.shR, [3.2, -4.6, -6.4]); }
      else { P.hL = vadd(S.shL, [-6.6, 0.8, -8.4]); P.hR = vadd(S.shR, [7.2, 1.4, -7.6]); }
      P.elL = [-1, -0.6, 0]; P.elR = [1, -0.6, 0]; P.openL = P.openR = 1;
    };
  } else if (pose === 'deadF') {
    // dead face down: one arm up by the head, one down by the side, a leg drawn up, the face turned to the side
    P.acc = false; P.ground = true; P.headYaw = 0.95; P.headPitch = -0.15; P.eyes = 0; P.lean = 0;
    P.root = rx(Math.PI / 2);
    P.fL = [-D.hipX - 1.4, 1.2, D.ank]; P.fR = [D.hipX + 4.2, 2.0, D.ank + 4.6]; P.kneeR = [1, 0.3, 0];
    P.hands = (S) => { P.hL = vadd(S.shL, [-5.4, 2.4, 9.0]); P.hR = vadd(S.shR, [3.0, 3.0, -13.0]); P.elL = [-1, 0, 0]; P.elR = [1, 0, 0]; P.openL = P.openR = 1; };
  } else if (pose === 'deadS') {
    // dead on the side, curled a little: knees bent, arms fallen forward
    P.acc = false; P.ground = true; P.headPitch = 0.35; P.eyes = 0; P.lean = 0.3;
    P.fL = [-D.hipX, 5.2, D.ank + 2.6]; P.fR = [D.hipX, 7.4, D.ank + 5.0]; P.kneeL = P.kneeR = [0, 1, 0.4];
    P.hands = (S) => { P.hL = vadd(S.chest, mv(S.SP, [-2.4, 7.0, -6.4])); P.hR = vadd(S.chest, mv(S.SP, [2.8, 8.2, -3.0])); P.elL = [-1, 0, -0.5]; P.elR = [1, 0, -0.5]; P.openL = P.openR = 1; };
    P.root = [0, -1, 0, 0, 0, 1, -1, 0, 0]; P.pivot = P.pel.slice();
  } else if (pose === 'down') {
    P.acc = false; P.ground = true; P.lean = 0.5; P.headPitch = 0.3;
    P.fL = [-D.hipX, 5.6 + f, D.pelZ - 9.5]; P.fR = [D.hipX, 4.2, D.pelZ - 10.8 + f * 0.8]; P.kneeL = P.kneeR = [0, 1, 0.4];
    P.hands = (S) => { P.hL = vadd(S.chest, mv(S.SP, [-1.2, 5.6, -4.4 + f])); P.hR = vadd(S.chest, mv(S.SP, [1.8, 5.2, -2])); P.elL = [-1, 0, -0.5]; P.elR = [1, 0, -0.5]; };
    P.root = [0, -1, 0, 0, 0, 1, -1, 0, 0]; P.pivot = P.pel.slice();
  } else if (pose === 'dead') {
    P.acc = false; P.ground = true; P.headYaw = 0.5; P.eyes = 0; P.lean = 0;
    P.fL = [-D.hipX - 2.2, 1.4, D.ank]; P.fR = [D.hipX + 3.8, -0.8, D.ank + 0.5]; P.kneeR = [1, 1, 0];
    P.hands = (S) => { P.hL = vadd(S.shL, [-7.2, 0.5, -11.5]); P.hR = vadd(S.shR, [8.2, 1.2, -9.4]); P.elL = [-1, 0, 0]; P.elR = [1, 0, 0]; P.openL = P.openR = 1; };
    P.root = [-1, 0, 0, 0, 0, 1, 0, 1, 0]; P.pivot = P.pel.slice();
  } else if (pose === 'swim') {
    P.acc = false; P.water = true; P.headPitch = -1.12; P.lean = 0;
    P.fL = [-D.hipX, -1.5 + f, D.ank]; P.fR = [D.hipX, -0.5 - f, D.ank];
    P.hands = (S) => {
      const fw = [0, 3.0, 15.2], bk = [0, -2.2, -14.4];
      P.hR = vadd(S.shR, f ? [0.6, bk[1], bk[2]] : [-0.9, fw[1], fw[2]]); P.hL = vadd(S.shL, f ? [0.9, fw[1], fw[2]] : [-0.6, bk[1], bk[2]]);
      P.elR = [1, 0, -0.2]; P.elL = [-1, 0, -0.2]; P.openL = P.openR = 1;
    };
    P.root = rx(1.32);
  } else if (pose === 'ride' || pose === 'pedal' || pose === 'sit' || pose === 'drive' || pose === 'sitlow') {
    const seat = SEATS[pose] / CA;
    P.acc = false; P.pel = [0, pose === 'sit' || pose === 'sitlow' ? -0.6 : -1.6, seat + 3.7];
    if (pose === 'ride') {
      P.lean = 0.42; P.headPitch = -0.12;
      P.fL = [-4.8, 3.2, seat - 10.5]; P.fR = [4.8, 3.2, seat - 10.5]; P.kneeL = [-0.5, 1, 0.6]; P.kneeR = [0.5, 1, 0.6];
      P.hands = (S) => { P.hL = [-6, 12.2, seat + 10]; P.hR = [6, 12.2, seat + 10]; P.elL = [-1, -0.2, -0.4]; P.elR = [1, -0.2, -0.4]; };
    } else if (pose === 'pedal') {
      P.lean = 0.32; P.headPitch = -0.1;
      const a = f / 4 * Math.PI * 2, cy = 5.5, cz = seat - 13.5;
      P.fL = [-2.8, cy + 3.6 * Math.cos(a), cz + 3.6 * Math.sin(a) + D.ank]; P.fR = [2.8, cy - 3.6 * Math.cos(a), cz - 3.6 * Math.sin(a) + D.ank];
      P.kneeL = P.kneeR = [0, 1, 0.5];
      P.hands = (S) => { P.hL = [-4.6, 11.4, seat + 9]; P.hR = [4.6, 11.4, seat + 9]; P.elL = [-1, -0.3, -0.4]; P.elR = [1, -0.3, -0.4]; };
    } else if (pose === 'sitlow') {
      // on the ground by a fire, knees drawn up: arms resting on the knees (0), or leaning in, hands out to the warmth (1)
      P.lean = f ? 0.34 : 0.1; P.headPitch = f ? 0.12 : 0.04;
      P.fL = [-D.hipX - 0.8, 6.2, D.ank]; P.fR = [D.hipX + 0.8, 6.0, D.ank]; P.kneeL = [-0.2, 0.5, 1]; P.kneeR = [0.2, 0.5, 1];
      P.hands = (S) => {
        if (f) { P.hL = [-2.4, 12.4, seat + 9.6]; P.hR = [2.4, 12.4, seat + 9.9]; P.openL = P.openR = 1; } else { P.hL = [-3.4, 6.8, seat + 10.2]; P.hR = [3.4, 6.8, seat + 10.2]; }
        P.elL = [-1, -0.3, -0.2]; P.elR = [1, -0.3, -0.2];
      };
    } else if (pose === 'sit') {
      P.lean = f ? 0.48 : -0.04; P.headPitch = f ? 0.15 : 0;
      P.fL = [-D.hipX - 0.9, 7.8, D.ank]; P.fR = [D.hipX + 0.9, 7.6, D.ank]; P.kneeL = P.kneeR = [0, 1, 0.8];
      P.hands = (S) => { if (f) { P.hL = [-1.3, 9.2, seat + 5]; P.hR = [1.3, 9.2, seat + 5.3]; } else { P.hL = [-4.6, 6.4, seat + 6.4]; P.hR = [4.6, 6.4, seat + 6.4]; } P.elL = [-1, -0.4, -0.3]; P.elR = [1, -0.4, -0.3]; };
    } else {
      P.lean = -0.12;
      P.fL = [-D.hipX, 13, seat - 3]; P.fR = [D.hipX, 13, seat - 3]; P.kneeL = P.kneeR = [0, 0.4, 1];
      P.hands = (S) => { P.hL = [-3.6, 10.5, seat + 13]; P.hR = [3.6, 10.5, seat + 13.6]; P.elL = [-1, -0.4, -0.5]; P.elR = [1, -0.4, -0.5]; };
    }
  }
  return P;
}
// what the hands do with an accessory while standing or walking (the arm on the item side stops swinging)
const ACC_HANDS = { briefcase: 1, purse: 1, shopping: 2, coffee: 1, phone: 2, cane: 1, board: 1 };
function accHands(D, P, S, acc) {
  if (accHands2(D, P, S, acc)) return;   // (the city's people, at the end)
  const r = D.reach;
  if (acc === 'coffee') { P.hR = vadd(S.shR, [0.8, 5.4, -r * 0.7]); P.elR = [0.6, -1, -0.4]; }
  else if (acc === 'phone') { P.hR = vadd(S.chest, mv(S.SP, [1.4, 6.6, -2.4])); P.hL = vadd(S.chest, mv(S.SP, [-0.6, 6.4, -3])); P.elR = [1, -0.5, -0.6]; P.elL = [-1, -0.5, -0.6]; P.headPitch += 0.35; setItem(P, 'phone', [0, 1, 0], [0, 0, -1]); }
  else if (acc === 'cane') { P.hR = vadd(S.shR, [1.4, 4.6, -r * 0.82]); }
  else if (acc === 'board') { P.hR = vadd(S.shR, [1.6, 0.4, -r * 0.62]); P.elR = [1, -0.2, -0.6]; }
  else if (acc === 'briefcase' || acc === 'purse') { if (!P.hR || acc === 'briefcase') P.hR = vadd(S.shR, [2.0, 1.2, -r * 0.95]); }
  else if (acc === 'shopping') { P.hR = vadd(S.shR, [2.4, 1.0, -r * 0.94]); P.hL = vadd(S.shL, [-2.4, 1.0, -r * 0.94]); }
}

// ---- solving the rig ------------------------------------------------------------------------------------------------
// the camera's pull on the head: chin up a touch, and in side views a quarter turn toward the viewer
function headFrame(S, P, cam) { return mmul(S.SP, mmul(rz(P.headYaw + cam), rx(P.headPitch - P.lean * 0.75 - 0.16))); }
function spine(D, P) {
  const PF = rz(P.pelYaw), SP = mmul(PF, mmul(rz(P.twist), mmul(rx(P.lean), ry(P.tilt)))), SH = mmul(PF, mmul(rz(P.twist * 0.5), rx(P.lean * 0.5)));
  const pel = P.pel, at = (M, v) => vadd(pel, mv(M, v)), b = P.breath;
  const S = {
    PF, SP, SH, pel, waist: at(SH, [0, 0.15, D.waistUp]), chest: at(SP, [0, 0, D.chestUp + b * 0.3]),
    shL: at(SP, [-D.shX, -0.4, D.shUp + b]), shR: at(SP, [D.shX, -0.4, D.shUp + b]), neck: at(SP, [0, 0.2, D.neckUp + b]),
    hipL: at(PF, [-D.hipX, 0, -1.0]), hipR: at(PF, [D.hipX, 0, -1.0]),
  };
  S.HD = headFrame(S, P, P.camYaw || 0);
  S.head = vadd(S.neck, mv(S.HD, [0, 0.6, D.headUp]));
  return S;
}
function solve(D, P) {
  const S = spine(D, P);
  if (P.hands) { P.hands(S); S.HD = headFrame(S, P, P.camYaw || 0); S.head = vadd(S.neck, mv(S.HD, [0, 0.6, D.headUp])); }
  const hang = (s, sh) => vadd(sh, mv(S.SP, [s * (2.2 + D.belly * 1.6), 1.6 + D.belly, -D.reach * 0.93]));
  const R = ik(S.shR, P.hR || hang(1, S.shR), D.upper, D.fore + 1.2, mv(S.SP, P.elR));
  S.elR = R.mid; S.haR = R.end;
  const it = P.item, ID = it && ITEMS[it.kind];
  if (it && it.two && ID && ID.off && it.hand !== 'L') P.hL = vadd(S.haR, vadd(vmul(it.axis, ID.off[0] * ID.hs), vmul(it.vdir, ID.off[1] * ID.hs * (ID.vk || 1))));
  const L = ik(S.shL, P.hL || hang(-1, S.shL), D.upper, D.fore + 1.2, mv(S.SP, P.elL));
  S.elL = L.mid; S.haL = L.end;
  for (const k of ['L', 'R']) { const g = ik(S['hip' + k], P['f' + k], D.thigh, D.shin, mv(S.PF, P['knee' + k])); S['kn' + k] = g.mid; S['an' + k] = g.end; }
  return S;
}
// body space -> world (X east, Y south, Z up): the root turn (lying, rolling, swimming), then the facing
function makeXF(th, P) {
  const s = Math.sin(th), c = Math.cos(th), MF = [-s, c, 0, c, s, 0, 0, 0, 1], R = P.root || I3, pv = P.pivot || P.pel, M = mmul(MF, R);
  return { M, pt: (p) => mv(MF, vadd(pv, mv(R, vsub(p, pv)))), dir: (v) => mv(M, v), mat: (F) => mmul(M, F) };
}

// ---- primitives: E ellipsoid, C round cone (tapered capsule), B box; stored in world space ----------------------------
const GR = { HEAD: 1, HAIR: 2, HAT: 3, TORSO: 4, ARML: 5, ARMR: 6, LEGL: 7, LEGR: 8, SKIRT: 9, ACC: 10, ITEM: 11 };
function mkE(X, c, F, r, g, part, m, clip = null) { const C = X.pt(c); return { t: 0, c: C, M: X.mat(F), r, g, part, m, clip, bc: C, br: Math.max(r[0], r[1], r[2]) }; }
function mkB(X, c, F, r, g, part, m) { const C = X.pt(c); return { t: 2, c: C, M: X.mat(F), r, g, part, m, bc: C, br: Math.hypot(r[0], r[1], r[2]) }; }
function mkC(X, a, b, ra, rb, g, part, m, clip = null, refR = [1, 0, 0], refF = [0, 1, 0]) {
  let A = X.pt(a), B = X.pt(b);
  let ba = vsub(B, A), L = vlen(ba);
  if (L < Math.abs(ra - rb) + 0.1) { const d = L > 1e-4 ? vmul(ba, 1 / L) : [0, 0, 1]; B = vadd(A, vmul(d, Math.abs(ra - rb) + 0.1)); ba = vsub(B, A); L = vlen(ba); }
  const n = vmul(ba, 1 / L);
  let e1 = X.dir(refR); e1 = vsub(e1, vmul(n, vdot(e1, n))); if (vlen(e1) < 1e-3) e1 = vsub([1, 0, 0], vmul(n, n[0])); e1 = vnorm(e1);
  let e2 = X.dir(refF); e2 = vsub(e2, vadd(vmul(n, vdot(e2, n)), vmul(e1, vdot(e2, e1)))); if (vlen(e2) < 1e-3) e2 = vcross(n, e1); e2 = vnorm(e2);
  const rr = ra - rb, m0 = L * L;
  return { t: 1, a: A, b: B, ra, rb, ba, m0, rr, d2: m0 - rr * rr, e1, e2, g, part, m, clip, bc: vlerp(A, B, 0.5), br: L / 2 + Math.max(ra, rb) };
}
let HT = 0, HN0 = 0, HN1 = 0, HN2 = 0, HL0 = 0, HL1 = 0, HL2 = 0;   // the last hit: t, world normal, local coords
function hitE(p, ox, oy, oz, dx, dy, dz) {
  const M = p.M, r = p.r, px = ox - p.c[0], py = oy - p.c[1], pz = oz - p.c[2];
  const o0 = (px * M[0] + py * M[3] + pz * M[6]) / r[0], o1 = (px * M[1] + py * M[4] + pz * M[7]) / r[1], o2 = (px * M[2] + py * M[5] + pz * M[8]) / r[2];
  const d0 = (dx * M[0] + dy * M[3] + dz * M[6]) / r[0], d1 = (dx * M[1] + dy * M[4] + dz * M[7]) / r[1], d2 = (dx * M[2] + dy * M[5] + dz * M[8]) / r[2];
  const A = d0 * d0 + d1 * d1 + d2 * d2, B = o0 * d0 + o1 * d1 + o2 * d2, C = o0 * o0 + o1 * o1 + o2 * o2 - 1, disc = B * B - A * C;
  if (disc < 0) return false;
  const t = (-B - Math.sqrt(disc)) / A, l0 = o0 + t * d0, l1 = o1 + t * d1, l2 = o2 + t * d2;
  if (p.clip && !p.clip(l0, l1, l2)) return false;
  const g0 = l0 / r[0], g1 = l1 / r[1], g2 = l2 / r[2];
  const nx = M[0] * g0 + M[1] * g1 + M[2] * g2, ny = M[3] * g0 + M[4] * g1 + M[5] * g2, nz = M[6] * g0 + M[7] * g1 + M[8] * g2, nl = Math.hypot(nx, ny, nz) || 1;
  HT = t; HN0 = nx / nl; HN1 = ny / nl; HN2 = nz / nl; HL0 = l0; HL1 = l1; HL2 = l2;
  return true;
}
// the rounded cone (after Inigo Quilez's ray / round-cone intersection)
function hitC(p, ox, oy, oz, dx, dy, dz) {
  const a = p.a, ba = p.ba, ra = p.ra, rr = p.rr, m0 = p.m0, d2 = p.d2;
  const oax = ox - a[0], oay = oy - a[1], oaz = oz - a[2], obx = ox - p.b[0], oby = oy - p.b[1], obz = oz - p.b[2];
  const m1 = ba[0] * oax + ba[1] * oay + ba[2] * oaz, m2 = ba[0] * dx + ba[1] * dy + ba[2] * dz, m3 = dx * oax + dy * oay + dz * oaz;
  const m5 = oax * oax + oay * oay + oaz * oaz, m6 = obx * dx + oby * dy + obz * dz, m7 = obx * obx + oby * oby + obz * obz;
  const k2 = d2 - m2 * m2, k1 = d2 * m3 - m1 * m2 + m2 * rr * ra, k0 = d2 * m5 - m1 * m1 + m1 * rr * ra * 2 - m0 * ra * ra, h = k1 * k1 - k0 * k2;
  if (h < 0) return false;
  let t = (-Math.sqrt(h) - k1) / k2, nx, ny, nz;
  const y = m1 - ra * rr + t * m2;
  if (y > 0 && y < d2) { nx = d2 * (oax + t * dx) - ba[0] * y; ny = d2 * (oay + t * dy) - ba[1] * y; nz = d2 * (oaz + t * dz) - ba[2] * y; }
  else {
    const h1 = m3 * m3 - m5 + ra * ra, h2 = m6 * m6 - m7 + p.rb * p.rb;
    if (h1 < 0 && h2 < 0) return false;
    t = 1e20;
    if (h1 > 0) { t = -m3 - Math.sqrt(h1); nx = oax + t * dx; ny = oay + t * dy; nz = oaz + t * dz; }
    if (h2 > 0) { const t2 = -m6 - Math.sqrt(h2); if (t2 < t) { t = t2; nx = obx + t * dx; ny = oby + t * dy; nz = obz + t * dz; } }
  }
  const qx = oax + t * dx, qy = oay + t * dy, qz = oaz + t * dz, hh = clamp((qx * ba[0] + qy * ba[1] + qz * ba[2]) / m0, 0, 1);
  const rx0 = qx - ba[0] * hh, ry0 = qy - ba[1] * hh, rz0 = qz - ba[2] * hh, rad = ra - rr * hh || 1;
  const c1 = (rx0 * p.e1[0] + ry0 * p.e1[1] + rz0 * p.e1[2]) / rad, c2 = (rx0 * p.e2[0] + ry0 * p.e2[1] + rz0 * p.e2[2]) / rad;
  if (p.clip && !p.clip(hh, c1, c2)) return false;
  const nl = Math.hypot(nx, ny, nz) || 1;
  HT = t; HN0 = nx / nl; HN1 = ny / nl; HN2 = nz / nl; HL0 = hh; HL1 = c1; HL2 = c2;
  return true;
}
function hitB(p, ox, oy, oz, dx, dy, dz) {
  const M = p.M, r = p.r, px = ox - p.c[0], py = oy - p.c[1], pz = oz - p.c[2];
  let tn = -1e9, tf = 1e9, ax = -1, sg = 1;
  for (let i = 0; i < 3; i++) {
    const o = px * M[i] + py * M[3 + i] + pz * M[6 + i], d = dx * M[i] + dy * M[3 + i] + dz * M[6 + i];
    if (Math.abs(d) < 1e-9) { if (Math.abs(o) > r[i]) return false; continue; }
    let t1 = (-r[i] - o) / d, t2 = (r[i] - o) / d, s = -1;
    if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; }
    if (t1 > tn) { tn = t1; ax = i; sg = s; }
    if (t2 < tf) tf = t2;
    if (tn > tf) return false;
  }
  if (ax < 0) return false;
  HT = tn; HN0 = M[ax] * sg; HN1 = M[3 + ax] * sg; HN2 = M[6 + ax] * sg;
  HL0 = (px * M[0] + py * M[3] + pz * M[6] + tn * (dx * M[0] + dy * M[3] + dz * M[6])) / r[0];
  HL1 = (px * M[1] + py * M[4] + pz * M[7] + tn * (dx * M[1] + dy * M[4] + dz * M[7])) / r[1];
  HL2 = (px * M[2] + py * M[5] + pz * M[8] + tn * (dx * M[2] + dy * M[5] + dz * M[8])) / r[2];
  return true;
}
const hitP = (p, ox, oy, oz, dx, dy, dz) => (p.t === 0 ? hitE(p, ox, oy, oz, dx, dy, dz) : p.t === 1 ? hitC(p, ox, oy, oz, dx, dy, dz) : hitB(p, ox, oy, oz, dx, dy, dz));

// ---- wardrobe: materials per part ------------------------------------------------------------------------------------------
const TOP = {   // sl sleeve length (0 none, 0.45 short, 1 long), open: front opening half-width, tuck: belt shows
  tee: { sl: 0.45 }, tank: { sl: 0, tank: 1 }, polo: { sl: 0.45, collar: 1, placket: 1 }, shirt: { sl: 1, collar: 1, placket: 1, tuck: 1, cuff: 1 },
  hoodie: { sl: 1, hood: 1, pocket: 1, strings: 1, cuff: 1 }, jacket: { sl: 1, open: 0.26, cuff: 1, hem: 1 }, suit: { sl: 1, open: 0.22, tie: 1, lapel: 1, tuck: 1, inner: 'white', cuff: 1 },
  leather: { sl: 1, open: 0.24, gloss: 1, zip: 1, cuff: 1, hem: 1 }, puffer: { sl: 1, quilt: 1, open: 0.08, gloss: 0.6, cuff: 1, hem: 1 },
  flannel: { sl: 1, check: 1, open: 0.16, inner: 'white', cuff: 1 }, hawaiian: { sl: 0.45, floral: 1, open: 0.1, collar: 1 },
  vest: { sl: 0.45, vest: 1 }, hivis: { sl: 1, vest: 1, hivis: 1 }, uniform: { sl: 0.5, collar: 1, placket: 1, badge: 1, pockets: 1, tuck: 1, duty: 1 },
  tactical: { sl: 1, plates: 1, tuck: 1, duty: 1, cuff: 1 }, scrubs: { sl: 0.45, vneck: 1 }, apron: { sl: 0.45, apron: 1 }, overalls: { sl: 0.45, bib: 1 },
  tracksuit: { sl: 1, zip: 1, stripe: 1, cuff: 1, hem: 1 }, jersey: { sl: 0.45, number: 1 }, coat: { sl: 1, open: 0.18, long: 1, cuff: 1 },
  cardigan: { sl: 1, open: 0.2, buttons: 1, cuff: 1 }, dress: { sl: 0, tank: 1, dress: 1 }, fur: { sl: 1, open: 0.24, long: 1, fur: 1 },
  none: { sl: 0, bare: 1 }, bikini: { sl: 0, bikini: 1 }, swimsuit: { sl: 0, tank: 1, swimsuit: 1 }, towel: { sl: 0, towel: 1 },
  // the look system's (shared/look.js)
  longsleeve: { sl: 1, cuff: 1 }, blouse: { sl: 1, collar: 1, placket: 1, cuff: 1 }, sweater: { sl: 1, cuff: 1, hem: 1, knit: 1 }, turtleneck: { sl: 1, cuff: 1, turtle: 1, knit: 1 },
  crop: { sl: 0.45, crop: 1 }, tube: { sl: 0, tank: 1, tube: 1 }, corset: { sl: 0, tank: 1, lace: 1 }, bra: { sl: 0, bikini: 1 }, under: { sl: 0.45 },
  blazer: { sl: 1, open: 0.22, lapel: 1, cuff: 1 }, ziphoodie: { sl: 1, hood: 1, open: 0.09, zip: 1, cuff: 1, strings: 1 }, gown: { sl: 0, tank: 1, dress: 1, gown: 1 },
};
const SHOE_OF = (c, A) => {
  if (A.shoeKind) return A.shoeKind;
  const l = lum(cloth(c)[3]);
  if (A.top?.kind === 'dress') return 'heel';
  if (A.top?.kind === 'tactical' || A.hat?.kind === 'hard' || A.hat?.kind === 'helmet' || A.top?.kind === 'hivis') return 'boot';
  return l > 0.6 || c === 'red' || c === 'pink' || c === 'purple' || (typeof c === 'string' && /^#(c8262b|e04a9a|7a3ac8)/i.test(c)) ? 'sneaker' : 'shoe';
};
// torso coordinates of a hit: u across (-1 left .. 1 right), f depth (+ front), z height above the pelvis centre
function tco(TF, Q) {
  const dx = Q.X - TF.c[0], dy = Q.Y - TF.c[1], dz = Q.Z - TF.c[2];
  Q.u = (dx * TF.x[0] + dy * TF.x[1] + dz * TF.x[2]) / TF.rx;
  Q.f = (dx * TF.y[0] + dy * TF.y[1] + dz * TF.y[2]) / TF.ry;
  Q.z = (Q.X - TF.p[0]) * TF.z[0] + (Q.Y - TF.p[1]) * TF.z[1] + (Q.Z - TF.p[2]) * TF.z[2];
}
// the look system's beards (look.js FACIAL_HAIR) by the head's unit coords: a across (abs), b forward, c up
const MOU = (a, b, c) => c > -0.42 && c < -0.2 && b > 0.7 && a < 0.42;
const BEARD = {
  long: (a, b, c) => c < -0.18 && (a < 0.66 || c < -0.6),
  goatee: (a, b, c) => (c < -0.48 && a < 0.3) || MOU(a, b, c),
  moustache: MOU,
  handlebar: (a, b, c) => (c > -0.44 && c < -0.2 && b > 0.62 && a < 0.55) || (c > -0.56 && c < -0.3 && a > 0.4 && a < 0.58 && b > 0.5),
  chinstrap: (a, b, c) => c < -0.2 && (a > 0.6 || c < -0.72) && c > -1,
  chops: (a, b, c) => a > 0.58 && c < 0.12 && c > -0.62,
  soul: (a, b, c) => c < -0.5 && c > -0.66 && a < 0.12 && b > 0.6,
  vandyke: (a, b, c) => (c < -0.55 && a < 0.26) || MOU(a, b, c),
};
function wardrobe(A, D, TF, seed) {
  let tk = A.top?.kind || 'tee', bk = A.bottom?.kind || 'jeans';
  if (A.censored) {   // the "censored nudity" setting: swimwear instead of nothing
    if (tk === 'none' && D.fem) tk = 'bikini';
    if (bk === 'none') bk = D.fem ? 'bikini' : 'trunks';
  }
  const T = TOP[tk] || TOP.tee, skin = SKIN[clamp(A.skin ?? 1, 0, SKIN.length - 1) | 0];
  const top = cloth(A.top?.color || (tk === 'bikini' || tk === 'swimsuit' ? 'teal' : tk === 'towel' ? 'white' : 'grey')), top2 = cloth(A.top?.color2 || 'white');
  const bot = cloth(A.bottom?.color || (bk === 'jeans' ? 'denim' : bk === 'trunks' || bk === 'bikini' ? (A.top?.color || 'red') : bk === 'towel' ? 'white' : 'black'));
  const shoeC = A.shoes || 'white', shoe = cloth(shoeC), sk = SHOE_OF(shoeC, A);
  const hairR = hairRamp(A.hair?.color ?? 0), inner = cloth(A.top?.inner || T.inner || A.top?.color2 || 'white'), tie = cloth(A.top?.tie || A.top?.color2 || 'navy');
  const hasInner = !!A.top && 'inner' in A.top, trim = cloth(A.top?.trim || 'white'), chainR = typeof A.chain === 'string' ? cloth(A.chain) : null;
  const tat = A.tattoo === true ? 3 : A.tattoo | 0, jw = A.jewel || null, jwR = jw ? cloth(jw.color || 'gold') : null;
  const W = { T, tk, bk, skin, top, top2, bot, shoe, sk, hairR, seed, bare: bk === 'none' || (tk === 'none' && D.fem) };
  const dark = (R) => R[Math.max(0, R.length - 4)], gold0 = cloth('gold'), white = cloth('white'), black = cloth('black'), silver = cloth('#c8ccd4');
  const gold = gold0, chainC = chainR || gold0;
  // the look system's patterns (shared/look.js PATTERNS), in model space so they run on across the seams: main colour,
  // trim colour; null where the base colour shows
  const patFn = (spec) => {
    const p = spec && spec.pattern;
    if (!p || !spec.trim || p === 'ripped' || p === 'quilt') return null;   // (the look system's always have a trim; the NPCs' old camo and florals keep their own)
    const a = cloth(spec.color || 'grey'), b = cloth(spec.trim || spec.color2 || 'white'), m = cloth(mixHex(spec.color || '#888888', spec.trim || '#ffffff', 0.5));
    if (p === 'stripes') return (Q) => ((Math.floor((Q.Z + 64) / 1.6) & 1) ? b : null);
    if (p === 'check') return (Q) => { const i = Math.floor((Q.X + Q.Y + 128) / 2.1), j = Math.floor((Q.Z + 64) / 2.1); if ((i & 1) && (j & 1)) return b; if ((i + j) & 1) return m; return null; };
    if (p === 'floral') return (Q) => { const n = hash(Math.floor(Q.X / 1.5), Math.floor(Q.Z / 1.5) + Math.floor(Q.Y / 1.5) * 7, seed + 5); return n > 0.84 ? b : n < 0.06 ? m : null; };
    if (p === 'camo') { const d = cloth(mixHex(spec.color || '#888888', '#000000', 0.45)); return (Q) => { const n = hash(Math.floor(Q.X / 2.6), Math.floor(Q.Y / 2.6) + Math.floor(Q.Z / 2.2) * 7, seed + 31); return n < 0.24 ? b : n < 0.4 ? d : null; }; }
    if (p === 'tiedye') { const c3 = cloth(mixHex(spec.trim || '#ffffff', '#ff4fa0', 0.5)); return (Q) => { const t = Math.sin(Q.X * 0.55 + Q.Z * 0.42) + Math.sin(Q.Y * 0.5 - Q.Z * 0.66); return t > 0.7 ? b : t < -0.7 ? c3 : t > 0.1 && t < 0.3 ? m : null; }; }
    return null;
  };
  const topPat = patFn(A.top), botPat = patFn(A.bottom);
  const ink = [skin[0], skin[1], skin[1]].map((c) => [c[0] * 0.55, c[1] * 0.6, c[2] * 0.85].map(Math.round));
  const hiv = cloth('#e8ecea');
  const bag = A.carry === 'bag' || A.carry === 'purse';
  const sleeve = A.top?.sleeve === 'skin' ? skin : A.top?.sleeve ? cloth(A.top.sleeve) : T.vest ? (T.hivis ? cloth(A.top?.color2 || 'charcoal') : top2) : T.bib || T.apron ? top2 : top;
  // woodland camouflage (the army: game/peds.js): blotches in model space, so they run on across the seams
  const CAMO = A.top?.pattern === 'camo' || A.bottom?.pattern === 'camo' ? [cloth('#39432a'), cloth('#76704c'), cloth('#25261e')] : null;
  const camo = (Q) => { const n = hash(Math.floor(Q.X / 2.6), Math.floor(Q.Y / 2.6) + Math.floor(Q.Z / 2.2) * 7, seed + 31); return n < 0.22 ? CAMO[0] : n < 0.36 ? CAMO[1] : n > 0.86 ? CAMO[2] : null; };
  // ---- torso (chest, waist, shoulder bar, belly, bust, the shirt part of the pelvis)
  W.torso = (Q) => {
    tco(TF, Q);
    const u = Q.u, au = Math.abs(u), f = Q.f, z = Q.z, front = f > 0.05, back = f < -0.35;
    if (W.bare && tk === 'none' && D.fem) return skin;
    if (T.crop && z < D.waistUp + 0.9) return skin;                                              // a bare midriff
    if (T.tube && z > D.chestUp + 1.4) return (tat & 8) && front && au > 0.35 && hash(Math.floor(u * 9), Math.floor(z), seed + 3) > 0.6 ? ink : skin;
    if (T.bare) { if (front && z > D.chestUp - 2.6 && z < D.chestUp - 1.5 && au < 0.7) Q.k -= 0.12; if (A.chain && front && Math.abs(z - (D.shUp - 1.6 - (1 - u * u) * 2.8)) < 0.45 && au < 0.6) { Q.gloss = 1; return chainC; } if ((tat & 8) && au > 0.25 && au < 0.75 && z > D.chestUp - 1 && hash(Math.floor(u * 10), Math.floor(z * 0.9), seed + 3) > 0.62) return ink; return skin; }
    if (T.towel) { if (z < D.chestUp + 1.6) { if (front && Math.abs(u - 0.35) < 0.08 && z > D.chestUp - 1) Q.k -= 0.25; return top; } return skin; }
    if (T.bikini) { if (Q.part === 'bust' || (z > D.chestUp - 0.6 && z < D.chestUp + 1.5 && !(front && au < 0.08))) return top; if (z > D.chestUp && au > 0.26 && au < 0.38) return top; return skin; }
    if ((T.tank || T.swimsuit) && z > D.shUp - 1.7 && au > 0.33) return au < 0.5 ? (T.dress ? top : top) : skin;   // bare shoulders, straps
    if (T.tank && front && z > D.chestUp + 2.9 - (0.33 - au) * 3 && au < 0.33) return skin;                       // scoop neckline
    if (T.vneck && front && z > D.chestUp + 3.4 - (0.32 - au) * 8 && au < 0.32) return skin;
    let R = top;
    // straps of a backpack or a bag across the chest
    if (A.back === 'backpack' && Math.abs(au - 0.5) < 0.09 && z > D.waistUp && (front || back)) return black;
    if (bag && front && Math.abs(-u * 0.9 + (z - D.chestUp) / 6 - 0.15) < 0.11) return cloth('leather');
    if (T.vest || T.bib || T.apron) {
      // a panel over a shirt: the shirt shows round the arms and the collar
      const panel = T.bib ? (front && au < 0.55 && z < D.chestUp + 2.6) || (au > 0.25 && au < 0.42 && z > D.chestUp) || z < D.waistUp - 1 : T.apron ? front && au < 0.62 && z < D.chestUp + 2.2 : !(Q.part === 'shb' && au > 0.62) && !(front && au < 0.14 && z > D.chestUp);
      if (!panel) return T.apron && au < 0.4 && z > D.chestUp + 2.2 && front && Math.abs(au - 0.3) < 0.06 ? dark(top) : top2;
      if (T.hivis && (Math.abs(z - (D.chestUp - 1.2)) < 0.6 || Math.abs(z - (D.waistUp + 0.4)) < 0.6 || (au > 0.3 && au < 0.44 && z > D.chestUp))) { Q.k += 0.1; return hiv; }
      if (A.top?.pattern === 'quilt' && Math.round(z * 0.55) % 2 === 0 && Math.abs(z * 0.55 - Math.round(z * 0.55)) < 0.12) Q.k -= 0.3;
      if (T.vest && !T.hivis && front && au < 0.1 && z > D.waistUp - 1 && Math.round(z) % 2 === 0) return gold;     // waistcoat buttons
      R = top;
    }
    if (T.open && front && au < T.open + (T.lapel && z > D.chestUp ? (z - D.chestUp) * 0.06 : 0)) {
      // an open front: the shirt beneath, a tie on a suit
      if (T.tie && au < 0.075 && z > D.waistUp - 0.5) return tie;
      if (T.zip && au < 0.04) return silver;
      if (T.buttons && au > T.open - 0.07) return gold;
      R = tk === 'jacket' || tk === 'coat' || tk === 'fur' || tk === 'leather' ? top2 : inner;
      if (tk === 'fur') R = black;
      if (A.chain && Math.abs(z - (D.shUp - 1.6 - (1 - u * u / (T.open * T.open)) * 2.8)) < 0.45) { Q.gloss = 1; return chainC; }
      if (hasInner) R = A.top.inner ? inner : skin;                                   // the look system: the top worn under it
      return R;
    }
    if (T.open && front && au < T.open + 0.1) Q.k -= 0.22;                              // the lapel's edge
    if (T.lace && front && au < 0.09 && (Math.round(z * 1.2) & 1)) return trim;
    if (T.knit && (Math.round(u * 10) & 1)) Q.k -= 0.05;
    if (A.top?.print && front && au < 0.3 && z > D.waistUp + 0.5 && z < D.chestUp + 1.2 && hash(Math.floor(u * 8), Math.floor(z * 0.8), seed + 9) > 0.45) return trim;   // a graphic print
    if (A.top?.varsity && Q.part === 'shb' && au > 0.66) return trim;
    if (T.check && !topPat) { const a = Math.floor((u + 2) * 3.2), b = Math.floor(z / 1.7); if ((a + b) & 1) Q.k -= 0.22; if ((a & 1) && (b & 1)) return dark(top); }
    if (T.floral && !topPat && hash(Math.round(u * 6), Math.round(z), 7) > 0.78) return top2;
    if (T.quilt && Math.abs(z * 0.5 - Math.round(z * 0.5)) < 0.1) Q.k -= 0.3;
    if (T.pocket && front && z > D.waistUp - 2.4 && z < D.waistUp + 1.4 && au < 0.52) { if (au > 0.46 || z > D.waistUp + 1.0) Q.k -= 0.25; }
    if (T.strings && front && z > D.chestUp + 0.6 && Math.abs(au - 0.17) < 0.05) return top2;
    if (T.placket && front && au < 0.035) Q.k -= 0.2;
    if (T.collar && z > D.shUp - 0.9 && f > -0.2) Q.k += 0.12;
    if (T.badge && front && Math.abs(u + 0.42) < 0.1 && Math.abs(z - D.chestUp - 1.6) < 0.7) { Q.gloss = 1; return gold; }
    if (T.pockets && front && au > 0.25 && au < 0.6 && Math.abs(z - D.chestUp - 0.6) < 1.1) Q.k -= Math.abs(z - D.chestUp - 1.6) < 0.3 ? 0.25 : 0.06;
    if (T.plates) {   // a plate carrier with mag pouches over the shirt
      const plate = cloth(A.top?.color2 && A.top.color2 !== 'white' ? A.top.color2 : '#3e4654');
      if (front && au < 0.66 && z > D.waistUp - 0.5 && z < D.chestUp + 3.4) { if (z < D.waistUp + 1.8 && z > D.waistUp - 0.2) { Q.k += Math.abs((au * 6.5) % 2 - 1) < 0.35 ? -0.35 : 0.1; } if (Math.abs(au - 0.62) < 0.05) Q.k -= 0.3; return plate; }
      if (back && au < 0.66 && z > D.waistUp) return plate;
      if (au > 0.4 && au < 0.6 && z > D.chestUp + 2.2) return plate;
    }
    if (T.stripe && Q.part === 'shb' && au > 0.7) return A.top?.trim ? trim : white;
    if (T.number && (front || back) && au < 0.22 && z > D.waistUp && z < D.chestUp + 1.4) { const gx = Math.floor((u + 0.22) * 14), gy = Math.floor((z - D.waistUp) * 1.4); if ((gx === 1 || gy % 3 === 0 || (gy > 3 ? gx === 5 : gx === 0))) return white; }
    if (T.fur && z > D.shUp - 1.2) { Q.k += hash(Math.round(Q.X * 2), Math.round(Q.Z * 2), 3) * 0.4 - 0.1; return cloth('#efe6d4'); }
    if (T.hem && z < D.waistUp - 2.6 + (tk === 'jacket' ? 0 : 0.4)) Q.k -= 0.15;
    if (T.gloss) Q.gloss = T.gloss;
    if (T.swimsuit && z < D.waistUp - 1) R = top;
    if (R === top && topPat) return topPat(Q) || R;
    if (R === top && A.top?.pattern === 'camo') return camo(Q) || R;
    return R;
  };
  // the pelvis: the shirt's hem, a belt, then the trousers (or the dress, a coat's tails, swimwear)
  W.pel = (Q) => {
    tco(TF, Q);
    const z = Q.z, front = Q.f > 0.05, au = Math.abs(Q.u);
    if (T.dress || T.swimsuit || T.long || (T.towel && bk !== 'none')) { if (T.swimsuit && z < -0.3 && au > 0.42) return skin; return (topPat && topPat(Q)) || top; }
    if (T.bib) return top;
    const hemZ = T.tuck ? 2.4 : T.bare || T.bikini || T.towel || T.crop ? 9 : T.tank ? 0.4 : -0.9;
    if (z > hemZ + (T.tuck ? 0.9 : 0)) return W.torso(Q);
    if (T.tuck && z > hemZ - 0.2) { if (front && au < 0.12) { Q.gloss = 1; return T.duty ? silver : gold; } return T.duty ? black : cloth('#3a2a22'); }
    if (bk === 'none') return skin;
    if (bk === 'bikini') return z > 1.3 || (au > 0.5 && z > -1.5) ? skin : bot;
    if (bk === 'trunks' && z > 2.4) return skin;
    if (bk === 'skirt' || bk === 'towel') return bot;
    if (bk === 'jeans' && front && Math.abs(au - 0.52) < 0.05 && z > -0.5) Q.k -= 0.2;   // pocket seams
    if (A.beltBag && front && z > 0.6 && z < 1.6) return cloth('#2a2a2e');            // the belt bag's strap
    return (botPat && botPat(Q)) || bot;
  };
  W.neck = (Q) => {
    if (T.turtle) return top;
    if (jw && jw.choker && Q.l0 > 0.3 && Q.l0 < 0.62) { if (jw.studs && (Math.round(Q.l1 * 8 + Q.l2 * 8) & 1)) { Q.gloss = 1; return cloth(jw.trim || 'silver'); } return jwR; }
    if ((tat & 4) && hash(Math.floor(Q.l0 * 6), Math.floor((Q.l1 + 2) * 3), seed + 4) > 0.55) return ink;
    return skin;
  };
  W.ear = (Q) => {
    if (Q.l2 < -0.5 && ((jw && jw.ear) || ((A.piercings | 0) & 1))) { Q.gloss = 1; return jw && jw.ear ? jwR : silver; }   // earrings
    if (Math.abs(Q.l0) > 0.45 && Math.abs(Q.l1) < 0.5 && Math.abs(Q.l2) < 0.55) Q.k -= 0.3; return skin;
  };
  W.skinM = () => skin;
  // arms: sleeves to `sl` of the arm's length, then skin; cuffs; gloves; tattoos on bare skin
  const slv = T.sl, gl = A.gloves ? cloth(A.gloves) : null;
  W.arm = (Q) => {
    const along = Q.part === 'ua' ? Q.l0 * 0.5 : 0.5 + Q.l0 * 0.5;
    if (along < slv - (slv >= 1 ? 0.06 : 0)) {
      if (T.cuff && along > slv - 0.16) Q.k -= 0.14;
      if (T.stripe && Q.l1 > 0.55) return white;
      if (T.fur && along > 0.86) { Q.k += 0.15; return cloth('#efe6d4'); }
      if (T.hivis && Math.abs(along - 0.3) < 0.04) return hiv;
      if (T.check) { const a = Math.floor(along * 9), b = Math.floor((Q.l2 + 1) * 1.6); if ((a + b) & 1) Q.k -= 0.22; }
      if (A.top?.varsity && sleeve === top) return trim;
      if (sleeve === top && topPat) return topPat(Q) || sleeve;
      if (sleeve === top && A.top?.pattern === 'camo') return camo(Q) || sleeve;
      return sleeve;
    }
    if (slv > 0 && slv < 1 && along < slv + 0.03) Q.k -= 0.18;           // the sleeve's shadow on the arm
    if (gl && along > 0.88) return gl;
    if (jw && Q.part === 'fa' && ((jw.watch && along > 0.82 && along < 0.88) || (jw.bangles && ((along > 0.8 && along < 0.83) || (along > 0.85 && along < 0.88))))) { Q.gloss = 1; return jwR; }
    if ((tat & 1) && along > 0.25 && along < 0.85 && hash(Math.floor(along * 14), Math.floor((Q.l1 + 2) * 2.4), seed) > 0.55) return ink;
    return skin;
  };
  W.hand = () => gl || skin;
  // legs
  const legSkin = bk === 'none' || bk === 'bikini' || bk === 'skirt' || bk === 'towel' || T.dress || T.swimsuit || (T.towel && bk !== 'jeans' && bk !== 'pants');
  W.leg = (Q) => {
    const along = Q.part === 'th' ? Q.l0 * 0.5 : 0.5 + Q.l0 * 0.5, side = Q.l1 * Q.side;
    if (T.bib) return along > 0.94 ? dark(top) : top;
    if (legSkin || (bk === 'shorts' && along > 0.33) || (bk === 'trunks' && along > 0.18)) {
      if (bk === 'shorts' && along < 0.37) Q.k -= 0.2;
      if ((tat & 2) && along < 0.4 && side > 0.3 && hash(Math.floor(along * 16), Math.floor((Q.l2 + 2) * 2), seed + 1) > 0.6) return ink;
      return skin;
    }
    if (bk === 'track' && side > 0.82) return white;
    if (bk === 'cargo' && side > 0.45 && along > 0.2 && along < 0.4) Q.k -= along > 0.37 || side < 0.52 ? 0.3 : 0.05;
    if (bk === 'jeans') { if (Math.abs(along - 0.5) < 0.1) Q.k += 0.08; if (Math.abs(side) > 0.9) Q.k -= 0.1; }
    if (A.bottom?.pattern === 'ripped' && Math.abs(along - 0.5) < 0.04 && Q.l2 > 0.2) return skin;
    if (along > 0.93) Q.k -= 0.12;                                       // the trouser cuff
    if (tk === 'tactical' && Math.abs(along - 0.5) < 0.08 && Q.l2 > 0.3) return cloth('#30343a');   // knee pads
    if (tk === 'uniform' && side > 0.85) Q.k -= 0.18;
    if (botPat) return botPat(Q) || bot;
    if (A.bottom?.pattern === 'camo') return camo(Q) || bot;
    return bot;
  };
  // shoes: sneakers (white rubber sole, laces), leather shoes, boots, heels, sandals, bare feet
  const sole = sk === 'sneaker' ? cloth(A.shoeTrim && A.shoeTrim !== A.shoes ? A.shoeTrim : lum(shoe[3]) > 0.7 ? '#b8b4ae' : '#ece8e0') : sk === 'sandal' || sk === 'barefoot' ? skin : cloth('#2a2228');
  W.shoeKind = sk;
  W.shoe = (Q) => {
    if (sk === 'barefoot') return skin;
    if (sk === 'sandal') { if (Q.l2 < -0.3) return cloth('#6a4a32'); return Math.abs(Q.l1 - 0.25) < 0.12 || Math.abs(Q.l1 + 0.3) < 0.1 ? cloth('#6a4a32') : skin; }
    if (Q.l2 < -0.32) return sole;
    if (sk === 'sneaker' && Q.l1 > 0.05 && Q.l1 < 0.6 && Math.abs(Q.l0) < 0.3 && Q.l2 > 0.25 && ((Math.round(Q.l1 * 8)) & 1)) return white;
    if (sk === 'shoe' || sk === 'heel' || sk === 'boot') Q.gloss = 0.6;
    return shoe;
  };
  W.sole = () => sole;
  // head: skin, beard / stubble / moustache, a face bandana, a balaclava
  const bandana = A.bandana ? cloth(typeof A.bandana === 'string' ? A.bandana : 'red') : null, maskR = cloth(typeof A.mask === 'string' ? A.mask : '#24242a');
  W.head = (Q) => {
    const a = Q.l0, b = Q.l1, c = Q.l2;
    if (A.mask) { if (b > 0.5 && c > -0.02 && c < 0.3 && Math.abs(a) < 0.62) return skin; if (A.maskTrim && c > 0.42 && c < 0.6) return cloth(A.maskTrim); return maskR; }
    if (A.medmask && b > 0.15 && c < -0.06 && c > -0.88 && Math.abs(a) < 0.9) { if (Math.abs(c + 0.4) < 0.04) Q.k -= 0.15; return cloth(A.medmask); }
    if (bandana && b > 0.05 && c < 0.0 + Math.abs(a) * 0.08 && c > -0.95) { if (b > 0.6 && Math.abs(a) < 0.08) Q.k -= 0.2; return bandana; }
    if (A.beard && b > -0.3 && BEARD[A.beard]) { if (BEARD[A.beard](Math.abs(a), b, c)) return hairR; }
    else if (A.beard && b > -0.3) {
      const full = A.beard === 'full', stub = A.beard === 'stubble';
      const chin = c < -0.2 - (full ? 0 : 0.1) && (full || Math.abs(a) < 0.62 || c < -0.62);
      const mou = c > -0.4 && c < -0.2 && b > 0.72 && Math.abs(a) < 0.4;
      if (chin || (mou && !stub)) { if (stub || A.beard === 'short') return ((Q.x + Q.y) & 1) || c < -0.55 ? hairR : skin; return hairR; }
    }
    return skin;
  };
  const stubble = hairR.map((c, i) => c.map((v, j) => Math.round(v * 0.62 + skin[i][j] * 0.38)));
  W.hairM = (Q) => {
    // clumps: darker grooves radiating from the crown, a sheen band
    const az = Math.atan2(Q.l0, Q.l1), st = A.hair?.style;
    if (st === 'buzz' || st === 'mohawk' && Q.part === 'hair') { Q.k += hash(Q.x, Q.y, seed) > 0.7 ? -0.12 : 0; return stubble; }
    if (st === 'cornrows') { if (Math.round(Q.l0 * 8) & 1) Q.k -= 0.3; return hairR; }
    if ((st === 'undercut' || st === 'fade') && Q.l2 < 0.45) { Q.k += hash(Q.x, Q.y, seed) > 0.7 ? -0.12 : 0; return stubble; }
    if (st === 'slick') { Q.gloss = 0.8; if ((Math.round(Q.l0 * 7) & 1) && Q.l2 > 0) Q.k -= 0.15; return hairR; }
    Q.k -= 0.1;
    if (Q.l2 < 0.78) { const st = Math.floor(az * 5.2 + Q.l2 * 1.3 + 20), n = hash(st, Math.floor(Q.l2 * 2.2 + 3), seed); Q.k += n > 0.62 ? -0.2 : n < 0.3 ? 0.12 : 0; }
    else Q.k += hash(Math.round(Q.l0 * 3), Math.round(Q.l1 * 3), seed) > 0.6 ? -0.12 : 0.04;
    if (st === 'wavy' || st === 'long' || st === 'braids' || st === 'dreads') Q.k += Math.sin(Q.Z * 1.3 + az * 3) * 0.12;
    return hairR;
  };
  W.hairLock = (Q) => { Q.k += Math.sin(Q.l0 * 9 + Q.l1 * 2) * 0.14 - 0.04; if ((A.hair?.style === 'braids' || A.hair?.style === 'braid') && ((Math.floor(Q.l0 * 10) + (Q.l1 > 0 ? 1 : 0)) & 1)) Q.k -= 0.22; return hairR; };
  // hats
  const hatR = cloth(A.hat?.color || 'navy'), hk = A.hat?.kind;
  W.hat = (Q) => {
    if (hk === 'trucker' && Q.part === 'crown' && Q.l1 > 0.45 && Q.l2 > 0.05) return white;
    if (hk === 'police' && Q.part === 'crown' && Q.l1 > 0.85 && Math.abs(Q.l0) < 0.16 && Q.l2 > -0.4) { Q.gloss = 1; return gold; }
    if (hk === 'hard' && Math.abs(Q.l0) < 0.12 && Q.part === 'crown') Q.k += 0.18;
    if (hk === 'beanie' && Q.part === 'crown') { if (Q.l2 < 0.42) Q.k -= 0.18; if ((Math.round(Math.atan2(Q.l0, Q.l1) * 6) & 1)) Q.k -= 0.08; }
    if ((hk === 'fedora' || hk === 'cowboy' || hk === 'sunhat') && Q.part === 'crown' && Q.l2 < 0.12) return dark(hatR);
    if (hk === 'helmet' && Q.part === 'crown' && Math.abs(Q.l2 - 0.1) < 0.07) Q.k -= 0.25;
    if (hk === 'hard' || hk === 'helmet' || hk === 'police') Q.gloss = 0.7;
    return hatR;
  };
  W.band = () => (hk === 'police' ? black : hk === 'tophat' ? cloth(A.hat?.trim && A.hat.trim !== A.hat.color ? A.hat.trim : '#2a1a1e') : dark(hatR));
  W.brim = (Q) => { if (hk === 'police') { Q.gloss = 1; return black; } return hatR; };
  W.glass = (Q) => { Q.gloss = 1; Q.k -= 0.1; return cloth('#2a3442'); };
  W.skirt = (Q) => { const R = T.dress ? top : T.long ? top : bot, pf = R === top ? topPat : botPat; if (Q.l0 > 0.92) Q.k -= 0.16; if (pf) { const pr = pf(Q); if (pr) return pr; }
    if ((T.towel || bk === 'towel') && Math.abs(Q.l1 - 0.6) < 0.12 && Q.l2 > 0.2) Q.k -= 0.22;                      // the tucked-in corner
    if ((T.towel || bk === 'towel') && Math.abs(Q.l0 - 0.82) < 0.05) return cloth(A.bottom?.color2 || 'sky'); if (T.long && Math.abs(Q.l1) < 0.12 && Q.l2 > 0.8) Q.k -= 0.2; if (T.check) { const a = Math.floor((Math.atan2(Q.l1, Q.l2) + 4) * 3), b = Math.floor(Q.l0 * 6); if ((a + b) & 1) Q.k -= 0.22; } return R; };
  W.lining = () => dark(T.long ? top : bot);
  W.fur = (Q) => { Q.k += hash(Math.round(Q.X * 2), Math.round(Q.Z * 2), 3) * 0.4 - 0.12; return cloth('#efe6d4'); };
  W.hood = (Q) => { if (Q.l1 > 0.2) Q.k -= 0.2; return top; };
  W.pack = (Q) => { const R = cloth(A.backColor || 'navy'); if (Q.l2 > 0.55) Q.k -= 0.15; if (Math.abs(Q.l2 - 0.2) < 0.06) Q.k -= 0.25; return R; };
  W.leather = (Q) => { Q.gloss = 0.5; if (Q.l2 > 0.82) Q.k += 0.12; return cloth(A.bagColor || (A.carry === 'purse' ? (A.top?.color2 || 'maroon') : '#5a3a26')); };
  W.case = (Q) => { Q.gloss = 0.6; if (Math.abs(Q.l2 - 0.55) < 0.08 || Math.abs(Q.l0) > 0.94) Q.k -= 0.2; return cloth(A.bagColor || '#4a2e1e'); };
  W.tool = (Q) => (Q.l2 > 0.85 && (Math.round(Q.l0 * 4) & 1) ? cloth(A.bagColor ? '#c8ccd4' : '#c8302c') : cloth(A.bagColor || '#3a3632'));
  W.beltbag = (Q) => { if (Math.abs(Q.l2) < 0.12) Q.k -= 0.2; return cloth(A.beltBag || 'black'); };
  W.paper = (Q) => (Q.l2 > 0.86 ? cloth('cream') : cloth(Q.part === 'bagL' ? '#d84a6a' : '#e8dcc8'));
  W.cup = (Q) => (Q.l0 > 0.3 && Q.l0 < 0.75 ? cloth('#8a5a36') : cloth('#f0ece4'));
  W.wood = (Q) => { if (Q.l0 > 0.94) Q.k += 0.2; return cloth('#6a4428'); };
  W.board = (Q) => (Math.abs(Q.l0) < 0.12 ? cloth('teal') : cloth('#f0ece4'));
  W.holster = () => black;
  return W;
}

// ---- building the figure ----------------------------------------------------------------------------------------------------------
function buildFigure(A, D, P, S, X, kind, acc, seed) {
  const out = [];
  const TF = { c: X.pt(S.chest), x: X.dir(mcol(S.SP, 0)), y: X.dir(mcol(S.SP, 1)), z: X.dir(mcol(S.SP, 2)), p: X.pt(S.pel), rx: D.chestR[0], ry: D.chestR[1] };
  const W = wardrobe(A, D, TF, seed);
  const E = (c, F, r, g, part, m, clip) => { const p = mkE(X, c, F, r, g, part, m, clip); out.push(p); return p; };
  const C = (a, b, ra, rb, g, part, m, clip, refR, refF) => { const p = mkC(X, a, b, ra, rb, g, part, m, clip, refR, refF); out.push(p); return p; };
  const B = (c, F, r, g, part, m) => { const p = mkB(X, c, F, r, g, part, m); out.push(p); return p; };
  const fem = D.fem, hr = D.head, HD = S.HD;
  const hat = A.hat && A.hat.kind, at = (l) => vadd(S.head, mv(HD, [l[0] * hr[0], l[1] * hr[1], l[2] * hr[2]]));
  // torso
  E(S.pel, S.PF, D.pelR, GR.TORSO, 'pel', W.pel);
  E(S.waist, S.SH, D.waistR, GR.TORSO, 'waist', W.torso);
  E(S.chest, S.SP, D.chestR, GR.TORSO, 'chest', W.torso);
  const sb = (s) => vadd(S.pel, mv(S.SP, [s * (D.shX - 1.3), -0.5, D.shUp - 0.5 + P.breath]));
  C(sb(-1), sb(1), D.shBar, D.shBar, GR.TORSO, 'shb', W.torso);
  if (D.belly) E(vadd(S.pel, mv(S.SH, [0, 1.6 + D.belly * 1.4, 4.4])), S.SH, [(7.2 + D.belly * 1.4) * D.w, 4.4 + D.belly * 2.2, 6.0 + D.belly * 0.6], GR.TORSO, 'belly', W.torso);
  if (fem) for (const s of [-1, 1]) E(vadd(S.chest, mv(S.SP, [s * 2.5, D.chestR[1] - 1.5, 1.0])), S.SP, [2.3, 1.9, 2.0], GR.TORSO, 'bust', W.torso);
  if (W.T.hood && hat !== 'hood') E(vadd(S.neck, mv(S.SP, [0, -3.0, -0.2])), S.SP, [4.8, 2.4, 2.8], GR.TORSO, 'hood', W.hood);
  if (W.T.fur) E(vadd(S.neck, mv(S.SP, [0, 0.4, -1.2])), S.SP, [6.6, 5.2, 2.2], GR.TORSO, 'fur', W.fur);
  if (W.T.duty) B(vadd(S.pel, mv(S.PF, [D.pelR[0] + 0.4, 0.6, 0.2])), S.PF, [1.0, 1.8, 2.4], GR.ACC, 'holster', W.holster);
  // neck and head
  C(vadd(S.neck, mv(S.SP, [0, -0.2, -2.6])), vadd(S.head, mv(HD, [0, -0.8, -4.0])), D.neckR, D.neckR * 0.95, GR.TORSO, 'neck', W.neck);
  const headP = E(S.head, HD, hr, GR.HEAD, 'head', W.head);
  E(at([0, 0.42, -0.5]), HD, [hr[0] * (D.jawW || 0.74), hr[1] * 0.6, hr[2] * 0.5], GR.HEAD, 'jaw', W.head);
  const nz = NOSE[A.face?.nose | 0] || NOSE[0];
  E(at([0, 0.97, -0.24]), HD, [0.9 * nz[0], 1.1 * nz[1], 1.15 * nz[2]], GR.HEAD, 'nose', W.head);
  if (A.beard === 'long' && !A.mask) E(at([0, 0.5, -1.02]), HD, [hr[0] * 0.48, hr[1] * 0.34, hr[2] * 0.42], GR.HAIR, 'beard', W.hairLock);
  for (const s of [-1, 1]) E(at([s * 0.97, -0.1, 0.04]), HD, [1.1, 1.3, 1.75], GR.HEAD, 'ear', W.ear);
  hairPrims(E, C, A, D, P, S, W, at, hat, seed);
  if (hat) hatPrims(E, C, A, D, S, W, at, hat);
  // arms
  for (const [k, s, g] of [['L', -1, GR.ARML], ['R', 1, GR.ARMR]]) {
    const sh = S['sh' + k], el = S['el' + k], ha = S['ha' + k], fd = vnorm(vsub(ha, el)), wr = vsub(ha, vmul(fd, 1.25));
    const side = mv(S.SP, [s, 0, 0]);
    const ua = C(sh, el, D.armR[0], D.armR[1], g, 'ua', W.arm, null, side, mv(S.SP, [0, 1, 0])); ua.side = 1;
    C(el, wr, D.foreR[0], D.foreR[1], g, 'fa', W.arm, null, side, mv(S.SP, [0, 1, 0])).side = 1;
    const open = P['open' + k];
    E(ha, frameFU(fd, side), open ? [D.fist * 0.62, D.fist * 1.25, D.fist * 0.95] : [D.fist * 0.95, D.fist * 1.06, D.fist], g, 'hand', W.hand);
  }
  // legs and feet
  for (const [k, s, g] of [['L', -1, GR.LEGL], ['R', 1, GR.LEGR]]) {
    const hp = S['hip' + k], kn = S['kn' + k], an = S['an' + k], side = mv(S.PF, [s, 0, 0]);
    C(hp, kn, D.thighR[0], D.thighR[1], g, 'th', W.leg, null, side, mv(S.PF, [0, 1, 0])).side = 1;
    C(kn, an, D.shinR[0], D.shinR[1], g, 'sh', W.leg, null, side, mv(S.PF, [0, 1, 0])).side = 1;
    const FF = mmul(rz(P.pelYaw + s * P.splay), rx(P['toe' + k])), fr = W.shoeKind === 'barefoot' || W.shoeKind === 'sandal' ? [D.foot[0] * 0.8, D.foot[1] * 0.9, D.foot[2] * 0.75] : W.shoeKind === 'heel' ? [D.foot[0] * 0.85, D.foot[1] * 0.92, D.foot[2] * 0.9] : D.foot;
    const fc = vadd(an, mv(FF, [0, 1.5, -1.62]));
    E(fc, FF, fr, g, 'shoe', W.shoe, (a, b, c) => c > -0.62);
    if (W.shoeKind !== 'barefoot' && W.shoeKind !== 'sandal') E(vadd(fc, mv(FF, [0, 0.1, -fr[2] * 0.6])), FF, [fr[0] + 0.12, fr[1] + 0.2, 0.55], g, 'sole', W.sole);
    if (W.shoeKind === 'boot' || (A.hiTop && W.shoeKind === 'sneaker')) { const bt = A.bootTall === 2 ? 8.5 : A.bootTall ? 5 : A.hiTop ? 2.2 : 2.6; C(vadd(an, [0, 0, -0.6]), vadd(an, mv(S.PF, [0, -0.2, bt])), D.shinR[1] + 0.55, D.shinR[1] + (bt > 3 ? 0.65 : 0.45), g, 'boot', W.shoe); }
  }
  // skirts, dresses, coat tails
  const T = W.T;
  if (T.dress || W.bk === 'skirt' || W.bk === 'towel' || T.long || (T.towel && W.bk !== 'jeans')) {
    const kn = vmul(vadd(S.knL, S.knR), 0.5), top = vadd(S.pel, mv(S.PF, [0, 0.2, T.towel ? 6 : 2.2])), long = T.long;
    // (the look system's lengths: a gown or a maxi skirt to the ankles, a mini well above the knee)
    const ln = T.dress ? (T.gown ? -1 : A.top?.len | 0) : W.bk === 'skirt' ? A.bottom?.len | 0 : 0, lnZ = ln < 0 ? -9 : ln > 0 ? 3.2 : 0;
    const hem = [kn[0] * 0.8, kn[1] * 0.7 + S.pel[1] * 0.3, Math.max(kn[2] + lnZ + (long ? -0.5 : T.dress ? 1.6 : W.bk === 'towel' || T.towel ? 2.8 : 3.4), 1.5)];
    const r0 = D.pelR[0] * (T.towel ? 1.06 : 1.02), r1 = D.pelR[0] + (long ? 1.6 : T.dress ? 2.6 : 1.4) + (ln < 0 ? 1.4 : ln > 0 ? -0.6 : 0);
    const open = long ? (h, c1, c2) => h > 0.002 && h < 0.998 && !(c2 > 0.55 && Math.abs(c1) < 0.5 && h > 0.15) : (h) => h > 0.002 && h < 0.998;
    C(top, hem, r0, r1, GR.SKIRT, 'skirt', W.skirt, open, mv(S.PF, [1, 0, 0]), mv(S.PF, [0, 1, 0]));
    if (long) C(top, hem, r0 - 0.7, r1 - 0.7, GR.SKIRT, 'lining', W.lining, (h) => h > 0.002 && h < 0.998);
  }
  // things carried on the body
  if (A.back === 'backpack') B(vadd(S.chest, mv(S.SP, [0, -(D.chestR[1] + 1.3), -0.6])), S.SP, [4.4, 1.7, 5.0], GR.ACC, 'pack', W.pack);
  // a robbery's takings (server hotmoney.js; game/host.js puts back 'moneybag' on while the descriptor's mb): a canvas sack, tied off
  if (A.back === 'moneybag') { const sack = (Q) => { if (Q.l2 > 0.6) Q.k -= 0.14; return cloth('#9a8a5c'); }; E(vadd(S.chest, mv(S.SP, [0, -(D.chestR[1] + 2.3), -1.4])), S.SP, [3.5, 2.4, 3.7], GR.ACC, 'sack', sack); E(vadd(S.chest, mv(S.SP, [0, -(D.chestR[1] + 2.1), 2.5])), S.SP, [1.2, 1.0, 1.1], GR.ACC, 'sack', (Q) => { Q.k -= 0.22; return cloth('#7a6a44'); }); }
  if (acc === 'bag') B(vadd(S.pel, mv(S.PF, [-D.pelR[0] - 1.4, 0.6, 1.0])), S.PF, [1.4, 3.6, 2.8], GR.ACC, 'bag', W.leather);
  if (acc === 'toolbag') B(vadd(S.pel, mv(S.PF, [D.pelR[0] + 1.2, 0.8, -0.4])), S.PF, [1.4, 2.3, 2.4], GR.ACC, 'tool', W.tool);
  if (A.beltBag) B(vadd(S.pel, mv(S.PF, [0.6, D.pelR[1] + 0.8, 1.1])), S.PF, [2.6, 1.0, 1.2], GR.ACC, 'beltbag', W.beltbag);
  if (P.acc && acc && P.item === null) {
    const hR = S.haR, hL = S.haL;
    if (acc === 'briefcase') B(vadd(hR, [0, 0, -4.2]), S.PF, [1.3, 4.0, 3.0], GR.ACC, 'case', W.case);
    if (acc === 'purse') B(vadd(hR, [0, 0, A.bagSmall ? -1.6 : -3.2]), S.PF, A.bagSmall ? [0.8, 2.2, 1.2] : [1.1, 2.6, 2.0], GR.ACC, 'purse', W.leather);
    if (acc === 'shopping') { B(vadd(hR, [0.4, 0, -4.4]), S.PF, [1.2, 2.8, 3.4], GR.ACC, 'bagR', W.paper); B(vadd(hL, [-0.4, 0, -4.4]), S.PF, [1.2, 2.8, 3.4], GR.ACC, 'bagL', W.paper); }
    if (acc === 'coffee') C(vadd(hR, [0, 0.4, 1.2]), vadd(hR, [0, 0.4, 4.4]), 1.2, 1.55, GR.ACC, 'cup', W.cup);
    if (acc === 'cane') C(vadd(hR, [0, 0.6, 0.6]), [hR[0] + 0.6, hR[1] + 3.4, 0.4], 0.62, 0.55, GR.ACC, 'cane', W.wood);
    if (acc === 'board') E(vadd(hR, [1.9, -0.8, 6.4]), frameUp([0.08, 0.15, 1], [0, 1, 0]), [1.0, 4.4, 14], GR.ACC, 'board', W.board);
  }
  figure365(B, C, E, D, P, S, acc);   // (the city's people, at the end)
  return { prims: out, head: out.indexOf(headP), W, TF };
}
function hairPrims(E, C, A, D, P, S, W, at, hat, seed) {
  let st = A.hair?.style || 'short';
  if (A.mask) return;                                               // a balaclava or a ski mask hides the hair completely
  const hatOn = hat && hat !== 'bandana' && hat !== 'headband' && hat !== 'visor';
  if (hatOn) { if (st === 'afro' || st === 'spiky' || st === 'curly' || st === 'mohawk' || st === 'topknot' || st === 'twinbuns' || st === 'curtains' || st === 'shag') st = 'short'; if (hat === 'hood' || hat === 'helmet') return; }
  if (st === 'bald') return;
  const hr = D.head, HD = S.HD;
  const vol = { buzz: 0.25, slick: 0.55, short: 0.9, spiky: 1.5, curly: 1.4, afro: 1.0, long: 0.9, wavy: 1.1, pony: 0.75, bun: 0.75, braids: 0.7, dreads: 0.9, mohawk: 0.25, bob: 1.0,
    undercut: 0.8, fade: 0.6, mullet: 0.9, topknot: 0.6, pixie: 0.8, twinbuns: 0.7, pigtails: 0.75, braid: 0.7, curlylong: 1.4, shag: 1.2, cornrows: 0.3, curtains: 1.0, halfup: 0.9 }[st] ?? 0.9;
  // the hairline in the cap's own unit coords, by the angle round the head from the face: [forehead, temple, sideburn,
  // above the ear, nape]; the face, temples and ears stay clear so a profile still shows the eye, nose and ear
  const LN = { buzz: [0.5, 0.44, -0.12, 0.2, -0.5], slick: [0.5, 0.44, -0.2, 0.14, -0.55], short: [0.42, 0.38, -0.28, 0.1, -0.6], spiky: [0.5, 0.42, -0.24, 0.1, -0.62],
    curly: [0.42, 0.36, -0.22, 0.02, -0.62], afro: [0.42, 0.36, -0.12, -0.15, -0.7], long: [0.4, 0.34, -0.75, -0.75, -1.1], wavy: [0.38, 0.32, -0.75, -0.75, -1.1],
    pony: [0.42, 0.38, -0.08, 0.06, -0.55], bun: [0.42, 0.38, -0.08, 0.06, -0.55], braids: [0.42, 0.36, -0.32, -0.3, -1.1], dreads: [0.4, 0.36, -0.32, -0.32, -1.1],
    mohawk: [0.6, 0.54, 0.0, 0.25, -0.45], bob: [0.3, 0.26, -0.62, -0.62, -0.75],
    undercut: [0.42, 0.42, 0.32, 0.42, 0.25], fade: [0.46, 0.42, 0.05, 0.28, -0.15], mullet: [0.42, 0.38, -0.28, 0.1, -0.6], topknot: [0.46, 0.42, -0.1, 0.12, -0.5],
    pixie: [0.3, 0.28, -0.25, 0.08, -0.55], twinbuns: [0.42, 0.38, -0.08, 0.06, -0.55], pigtails: [0.38, 0.36, -0.1, 0.0, -0.6], braid: [0.42, 0.38, -0.08, 0.06, -0.55],
    curlylong: [0.36, 0.3, -0.75, -0.75, -1.1], shag: [0.28, 0.24, -0.6, -0.6, -0.8], cornrows: [0.5, 0.44, -0.12, 0.2, -0.5], curtains: [0.3, 0.26, -0.3, 0.08, -0.6],
    halfup: [0.4, 0.34, -0.75, -0.75, -1.1] }[st] || [0.42, 0.38, -0.28, 0.1, -0.6];
  const AZ = [0, 0.8, 1.2, 1.32, 1.5, 1.64, 2.2, Math.PI], HV = [LN[0], LN[0], LN[1], LN[2], LN[2], LN[3], LN[3] - 0.04, LN[4]];
  const jag = st === 'spiky' || st === 'short' || st === 'curly' || st === 'bob' || st === 'pixie' || st === 'shag' || st === 'curtains' || st === 'mullet';
  const cut = hatOn ? 0.18 : 9;
  const clip = (a, b, c) => {
    const az = Math.abs(Math.atan2(a, b));
    let k = 1; while (k < AZ.length - 1 && az > AZ[k]) k++;
    let line = HV[k - 1] + (HV[k] - HV[k - 1]) * clamp((az - AZ[k - 1]) / (AZ[k] - AZ[k - 1]), 0, 1);
    if (jag && az < 1.0) line -= hash(Math.floor((a + 1) * 5.5), 3, seed) * 0.12;
    return c > line && c < cut;
  };
  const capC = vadd(S.head, mv(HD, [0, -0.2, 0.18]));
  E(capC, HD, [hr[0] + vol, hr[1] + vol, hr[2] + vol * 0.85], GR.HAIR, 'hair', W.hairM, clip);
  const rnd = (i, k) => hash(i, k, seed + 77);
  const spike = (n, len, el0, el1, r0) => {
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + rnd(i, 1) * 0.6, el = el0 + (el1 - el0) * rnd(i, 2);
      if (Math.cos(az) > 0.55 && el < 0.55) continue;                 // keep the face clear
      const d = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el) * 0.8 - 0.05, Math.sin(el) + 0.1];
      const b = vadd(capC, mv(HD, [d[0] * hr[0] * 0.7, d[1] * hr[1] * 0.7, d[2] * hr[2] * 0.7]));
      const L = hr[0] + vol * 0.85 + len * (0.6 + rnd(i, 3) * 0.6) * (Math.cos(az) < -0.4 ? 0.6 : 1);   // short at the back: a compact profile
      C(b, vadd(capC, mv(HD, [d[0] * L, d[1] * L, d[2] * L])), r0, 0.35, GR.HAIR, 'spike', W.hairM);
    }
  };
  if (cut < 9) { if (!['pony', 'long', 'wavy', 'braids', 'dreads', 'bob', 'pigtails', 'braid', 'curlylong', 'halfup', 'mullet'].includes(st)) return; }
  if (st === 'spiky') { spike(18, 1.7, 0.2, 1.3, 2.4); for (let i = 0; i < 4; i++) { const a = -0.5 + i * 0.33; C(at([a * 0.9, 0.5, 0.92]), at([a * 1.15, 1.06, 0.46 + rnd(i, 9) * 0.1]), 1.5, 0.5, GR.HAIR, 'spike', W.hairM); } }
  else if (st === 'curly') for (let i = 0; i < 16; i++) { const az = i * 2.4 + rnd(i, 4), el = 0.1 + rnd(i, 5) * 1.2; if (Math.cos(az) > 0.6 && el < 0.6) continue; E(vadd(capC, mv(HD, [Math.sin(az) * Math.cos(el) * (hr[0] + vol - 0.4), Math.cos(az) * Math.cos(el) * (hr[1] + vol - 0.4), Math.sin(el) * (hr[2] + 0.4)])), HD, [1.7, 1.7, 1.6], GR.HAIR, 'curl', W.hairM); }
  else if (st === 'afro') E(vadd(S.head, mv(HD, [0, -0.6, 2.2])), HD, [hr[0] * 1.42, hr[1] * 1.38, hr[2] * 1.15], GR.HAIR, 'afro', W.hairM, (a, b, c) => !(b > 0.45 && c < 0.08 && Math.abs(a) < 0.7));
  else if (st === 'bun') E(at([0, -0.42, 1.02]), HD, [2.7, 2.6, 2.4], GR.HAIR, 'bun', W.hairM);
  else if (st === 'pony') { const r0 = at([0, -0.98, 0.32]), m = at([0, -1.32, -0.3]), e = at([0, -1.2, -1.15]); E(r0, HD, [1.4, 1.2, 1.3], GR.HAIR, 'tie', () => cloth('#c8302c')); C(r0, m, 1.9, 1.7, GR.HAIR, 'tail', W.hairLock); C(m, e, 1.7, 0.8, GR.HAIR, 'tail', W.hairLock); }
  else if (st === 'topknot') E(at([0, -0.18, 1.1]), HD, [2.2, 2.1, 2.0], GR.HAIR, 'bun', W.hairM);
  else if (st === 'twinbuns') for (const s of [-1, 1]) E(at([s * 0.6, -0.22, 0.92]), HD, [2.2, 2.1, 2.0], GR.HAIR, 'bun', W.hairM);
  else if (st === 'pigtails') for (const s of [-1, 1]) { const r0 = at([s * 0.88, -0.45, 0.25]), e = at([s * 1.22, -0.55, -1.3]); E(r0, HD, [1.1, 1.0, 1.1], GR.HAIR, 'tie', () => cloth('#c8302c')); C(r0, e, 1.6, 0.8, GR.HAIR, 'tail', W.hairLock); }
  else if (st === 'braid') { const r0 = at([0, -0.98, 0.2]), m = at([0, -1.25, -0.7]), e = vadd(at([0, -1.1, -1.3]), [0, 0, -4.5]); C(r0, m, 1.7, 1.5, GR.HAIR, 'tail', W.hairLock); C(m, e, 1.5, 0.8, GR.HAIR, 'tail', W.hairLock); }
  else if (st === 'halfup') E(at([0, -0.86, 0.62]), HD, [1.8, 1.6, 1.6], GR.HAIR, 'bun', W.hairM);
  else if (st === 'curlylong') for (let i = 0; i < 12; i++) { const az = i * 2.4 + rnd(i, 4), el = 0.2 + rnd(i, 5) * 1.0; if (Math.cos(az) > 0.5 && el < 0.7) continue; E(vadd(capC, mv(HD, [Math.sin(az) * Math.cos(el) * (hr[0] + 0.8), Math.cos(az) * Math.cos(el) * (hr[1] + 0.8), Math.sin(el) * (hr[2] + 0.4)])), HD, [1.6, 1.6, 1.5], GR.HAIR, 'curl', W.hairM); }
  else if (st === 'mullet') C(at([0, -0.7, -0.1]), vadd(S.neck, mv(S.SP, [0, -3.3, -3.4])), 4.2, 3.2, GR.HAIR, 'curtain', W.hairLock);
  else if (st === 'mohawk') E(at([0, -0.08, 0.94]), HD, [1.15, hr[1] * 0.95, hr[2] * 0.55], GR.HAIR, 'crest', (Q) => { Q.k += (Math.round(Q.l1 * 6) & 1) * -0.18; return W.hairR; }, (a, b, c) => c > -0.25);
  if (st === 'long' || st === 'wavy' || st === 'braids' || st === 'dreads' || st === 'bob' || st === 'curlylong' || st === 'halfup' || st === 'shag') {
    if (st === 'curlylong' || st === 'halfup') st = 'wavy'; else if (st === 'shag') st = 'bob';
    const nape = vadd(S.neck, mv(S.SP, [0, -3.2, st === 'bob' ? -1 : -6.2]));
    if (st === 'dreads') for (let i = 0; i < 9; i++) { const a = -1.9 + i * 0.475, d = [Math.sin(a), Math.cos(a) * 0.9 - 0.25, 0]; C(at([d[0] * 0.95, d[1] * 0.95, 0.05]), vadd(at([d[0] * 1.15, d[1] * 1.1 - 0.15, -1.3]), [0, 0, -3]), 0.95, 0.75, GR.HAIR, 'lock', W.hairLock); }
    else C(at([0, -0.55, 0.0]), nape, st === 'bob' ? 5.8 : 5.0, st === 'bob' ? 5.4 : 4.2, GR.HAIR, 'curtain', W.hairLock);
    if (st !== 'dreads' && st !== 'bob' && D.fem) for (const [k, s] of [['L', -1], ['R', 1]]) C(at([s * 0.86, 0.2, -0.05]), vadd(S['sh' + k], mv(S.SP, [-s * 1.6, 2.2, st === 'braids' ? -6 : -3])), st === 'braids' ? 1.3 : 1.9, st === 'braids' ? 1.0 : 1.3, GR.HAIR, 'lock', W.hairLock);
  }
}
function hatPrims(E, C, A, D, S, W, at, k) {
  // peaks turn up a little and stay short: from the game's high camera a long flat peak would hide the eyes
  const hr = D.head, HD = S.HD, HDb = mmul(HD, rx(-0.24));
  const brim = (dy, rx_, ry_, th, z = 0.32, F = HDb) => E(vadd(S.head, mv(F, [0, dy, hr[2] * z])), F, [rx_, ry_, th], GR.HAT, 'brim', W.brim);
  if (k === 'cap' || k === 'trucker') {
    E(at([0, -0.05, 0.3]), HD, [hr[0] + 1.1, hr[1] + 1.1, hr[2] * 0.82], GR.HAT, 'crown', W.hat, (a, b, c) => c > (b > 0.3 ? 0.05 : -0.14));
    brim(hr[1] + 0.5, hr[0] * 0.78, 2.9, 0.6, 0.44);
    E(at([0, -0.05, 1.07]), HD, [0.8, 0.8, 0.6], GR.HAT, 'button', W.hat);
  } else if (k === 'police') {
    E(at([0, 0.04, 0.62]), HD, [hr[0] + 1.5, hr[1] + 1.7, 2.6], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.6);
    E(at([0, 0, 0.36]), HD, [hr[0] + 0.9, hr[1] + 0.9, 1.4], GR.HAT, 'band', W.band);
    brim(hr[1] + 0.5, hr[0] * 0.72, 2.6, 0.6, 0.42);
  } else if (k === 'hard') {
    E(at([0, -0.08, 0.4]), HD, [hr[0] + 1.6, hr[1] + 1.3, hr[2] * 0.9], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.02);
    brim(-0.5, hr[0] + 2.1, hr[1] + 2.0, 0.55, 0.42, HD);
  } else if (k === 'beanie') {
    E(at([0, -0.15, 0.2]), HD, [hr[0] + 1.15, hr[1] + 1.1, hr[2] * 1.0], GR.HAT, 'crown', W.hat, (a, b, c) => c > (b > 0.2 ? 0.12 : -0.36));
  } else if (k === 'bucket' || k === 'sunhat' || k === 'cowboy' || k === 'fedora') {
    const big = k === 'sunhat' ? 3.6 : k === 'cowboy' ? 3.4 : k === 'fedora' ? 2.4 : 2.2, HDw = mmul(HD, rx(-0.16));
    E(at([0, -0.05, k === 'bucket' ? 0.48 : 0.62]), HD, [hr[0] + 0.6, hr[1] + 0.6, hr[2] * (k === 'cowboy' || k === 'fedora' ? 0.95 : 0.75)], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.1 && !(k !== 'bucket' && k !== 'sunhat' && c > 0.85 && Math.abs(a) < 0.25));
    E(vadd(S.head, mv(HDw, [0, -0.3, hr[2] * 0.44])), HDw, [hr[0] + big, hr[1] + big * 0.92, 0.6], GR.HAT, 'brim', W.brim);
    if (k === 'cowboy') for (const s of [-1, 1]) E(vadd(S.head, mv(HDw, [s * (hr[0] + big - 0.9), -0.3, hr[2] * 0.62])), HDw, [1.1, hr[1] + 1.4, 1.0], GR.HAT, 'brim', W.brim);
  } else if (k === 'helmet') {
    E(at([0, -0.2, 0.15]), HD, [hr[0] + 1.9, hr[1] + 2.0, hr[2] + 1.0], GR.HAT, 'crown', W.hat, (a, b, c) => c > (b > 0.4 ? -0.08 : -0.42));
    if (!A.hat.plain) E(at([0, 1.0, 0.16]), HD, [hr[0] * 0.78, 1.3, 1.6], GR.HAT, 'goggles', W.glass);
  } else if (k === 'beret') {
    E(at([0.12, -0.12, 0.66]), mmul(HD, ry(0.22)), [hr[0] + 1.7, hr[1] + 1.5, 2.3], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.45);
  } else if (k === 'tophat') {
    const b0 = at([0, -0.05, 0.55]);
    C(b0, vadd(b0, mv(HD, [0, 0, 8.5])), hr[0] * 0.84, hr[0] * 0.9, GR.HAT, 'crown', W.hat);
    C(vadd(b0, mv(HD, [0, 0, 0.6])), vadd(b0, mv(HD, [0, 0, 2.0])), hr[0] * 0.87, hr[0] * 0.87, GR.HAT, 'band', W.band);
    E(vadd(S.head, mv(HD, [0, -0.2, hr[2] * 0.5])), HD, [hr[0] + 2.3, hr[1] + 2.1, 0.55], GR.HAT, 'brim', W.brim);
  } else if (k === 'visor') {
    E(at([0, -0.05, 0.34]), HD, [hr[0] + 0.7, hr[1] + 0.7, 1.3], GR.HAT, 'crown', W.hat);
    brim(hr[1] + 0.5, hr[0] * 0.78, 2.9, 0.5, 0.36);
  } else if (k === 'bandana' || k === 'headband') {
    E(at([0, -0.05, k === 'bandana' ? 0.3 : 0.34]), HD, [hr[0] + 0.7, hr[1] + 0.7, k === 'bandana' ? hr[2] * 0.85 : 1.3], GR.HAT, 'crown', W.hat, k === 'bandana' ? (a, b, c) => c > 0.16 : null);
    if (k === 'bandana') { E(at([0, -1.05, 0.25]), HD, [1.5, 1.2, 1.2], GR.HAT, 'knot', W.hat); C(at([0, -1.1, 0.2]), at([0.15, -1.3, -0.5]), 0.9, 0.5, GR.HAT, 'tail', W.hat); }
  } else if (k === 'hood') {
    E(at([0, -0.32, 0.12]), HD, [hr[0] + 1.9, hr[1] + 1.7, hr[2] + 1.6], GR.HAT, 'hoodup', (Q) => { if (Q.l1 > 0.3) Q.k -= 0.15; return W.top; }, (a, b, c) => !(b > 0.42 && c < 0.62 && Math.abs(a) < 0.74));
  }
}

// ---- rendering ----------------------------------------------------------------------------------------------------------------
let CAP = 0, NEAR, PID, NX, NY, NZ, L0, L1, L2, ZW, CR, CG, CB, EM, NOO, LN, AO, FL;
function scratch(n) {
  if (n <= CAP) return;
  CAP = n;
  NEAR = new Float32Array(n); PID = new Int16Array(n); NX = new Float32Array(n); NY = new Float32Array(n); NZ = new Float32Array(n);
  L0 = new Float32Array(n); L1 = new Float32Array(n); L2 = new Float32Array(n); ZW = new Float32Array(n);
  CR = new Uint8ClampedArray(n); CG = new Uint8ClampedArray(n); CB = new Uint8ClampedArray(n); EM = new Array(n).fill(null); NOO = new Uint8Array(n); LN = new Uint8Array(n); AO = new Float32Array(n); FL = new Uint8Array(n);
}
const Q = { X: 0, Y: 0, Z: 0, nx: 0, ny: 0, nz: 0, l0: 0, l1: 0, l2: 0, x: 0, y: 0, k: 0, e: null, gloss: 0, part: '', side: 0, u: 0, f: 0, z: 0 };
const ITEMID = 32000, FOAMID = 32001;
function occluded(prims, skip, ox, oy, oz) {
  for (let k = 0; k < prims.length; k++) {
    if (k === skip) continue;
    const p = prims[k], wx = p.bc[0] - ox, wy = p.bc[1] - oy, wz = p.bc[2] - oz, tc = wx * LT[0] + wy * LT[1] + wz * LT[2];
    if (tc < -p.br) continue;
    if (wx * wx + wy * wy + wz * wz - tc * tc > p.br * p.br) continue;
    if (hitP(p, ox, oy, oz, LT[0], LT[1], LT[2]) && HT > 0.25) return true;
  }
  return false;
}
const EYE = [34, 22, 30], WHITE = [236, 230, 222];
function render(fig, P, S, X, D, A, opt) {
  const prims = fig.prims;
  // extent: every primitive's bounding circle on screen, the held item, the classic box
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const grow = (sx, sy, r) => { x0 = Math.min(x0, sx - r); y0 = Math.min(y0, sy - r); x1 = Math.max(x1, sx + r); y1 = Math.max(y1, sy + r); };
  for (const p of prims) grow(p.bc[0], p.bc[1] * SA - p.bc[2] * CA, p.br + 2);
  let IT = null;
  if (P.item && ITEMS[P.item.kind]) {
    const it = P.item, grip = X.pt(it.hand === 'L' ? S.haL : S.haR), ID = ITEMS[it.kind];
    IT = { kind: it.kind, grip, axis: X.dir(it.axis), vdir: X.dir(it.vdir), ID };
    // the item's own extent along its axis, its profile at most hs * vk / CA px either side (see heldItem)
    const [u0, u1, va] = itemSpan(it.kind), hs = ID.hs * (ITEM_SCALE[ICLS[it.kind]] || 1.04), vk = ID.vk || 1, gy = grip[1] * SA - grip[2] * CA;
    const ux = ID.bill ? hs : IT.axis[0] * hs, uy = ID.bill ? 0 : (IT.axis[1] * SA - IT.axis[2] * CA) * hs, r = va * hs * vk / (ID.bill ? 1 : CA) + 2;
    grow(grip[0] + ux * u0, gy + uy * u0, r); grow(grip[0] + ux * u1, gy + uy * u1, r);
    if (ID.tip && P.line) {   // the fishing line down from the tip
      const tx = grip[0] + ux * ID.tip[0], ty = gy + uy * ID.tip[0], tz = grip[2] + (ID.bill ? 0 : IT.axis[2] * ID.tip[0] * hs);
      grow(tx, ty + (P.line > 0 ? P.line : Math.max(6, tz * CA + 1)) + 4, 4);   // (the float hangs 6 px below)
    }
  }
  if (P.water) grow(0, 0, 16);
  if (!opt.tight) { x0 = Math.min(x0, -18); x1 = Math.max(x1, 18); y0 = Math.min(y0, -47); y1 = Math.max(y1, 3); }
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  const w = Math.min(200, x1 - x0), h = Math.min(200, y1 - y0), AX = -x0, AY = -y0, n = w * h;
  scratch(n);
  NEAR.fill(-1e9, 0, n); PID.fill(-1, 0, n); NOO.fill(0, 0, n); LN.fill(0, 0, n); AO.fill(0, 0, n); FL.fill(0, 0, n); EM.fill(null, 0, n);
  // 1. ray-cast every primitive into the depth buffer
  const smaxOf = (p) => p.bc[1] * CA + p.bc[2] * SA + p.br;          // the nearest any of a primitive's points can be
  const order = prims.map((p, k) => k).sort((a, b) => smaxOf(prims[b]) - smaxOf(prims[a]) || a - b);   // front to back
  for (const k of order) {
    const p = prims[k], smax = smaxOf(p);
    let xa, xb, ya, yb;
    if (p.t === 1) {   // a round cone: the box round its two end spheres (much tighter than its bounding circle)
      const ay = p.a[1] * SA - p.a[2] * CA, by = p.b[1] * SA - p.b[2] * CA;
      xa = Math.min(p.a[0] - p.ra, p.b[0] - p.rb); xb = Math.max(p.a[0] + p.ra, p.b[0] + p.rb); ya = Math.min(ay - p.ra, by - p.rb); yb = Math.max(ay + p.ra, by + p.rb);
    } else { const cy = p.bc[1] * SA - p.bc[2] * CA, r = p.br; xa = p.bc[0] - r; xb = p.bc[0] + r; ya = cy - r; yb = cy + r; }
    xa = Math.max(0, Math.floor(xa + AX - 1)); xb = Math.min(w - 1, Math.ceil(xb + AX + 1)); ya = Math.max(0, Math.floor(ya + AY - 1)); yb = Math.min(h - 1, Math.ceil(yb + AY + 1));
    for (let y = ya; y <= yb; y++) {
      const sy = y + 0.5 - AY, oy = sy * SA + S0 * CA, oz = -sy * CA + S0 * SA;
      for (let x = xa; x <= xb; x++) {
        if (NEAR[y * w + x] >= smax || !hitP(p, x + 0.5 - AX, oy, oz, 0, -CA, -SA)) continue;
        const s = S0 - HT, i = y * w + x;
        if (s <= NEAR[i]) continue;
        NEAR[i] = s; PID[i] = k; NX[i] = HN0; NY[i] = HN1; NZ[i] = HN2; L0[i] = HL0; L1[i] = HL1; L2[i] = HL2;
      }
    }
  }
  // 2. creases: pixels with something much nearer right beside them
  const nearer = (i, j) => (PID[j] >= 0 && PID[j] !== PID[i] && NEAR[j] - NEAR[i] > 2.2 ? 1 : 0);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (PID[i] < 0) continue;
    const c = nearer(i, i - 1) + nearer(i, i + 1) + nearer(i, i - w) + nearer(i, i + w) + nearer(i, i - w - 1) + nearer(i, i - w + 1);
    AO[i] = c > 4 ? 0.3 : c * 0.07;
  }
  // 3. shade
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, k = PID[i];
    if (k < 0) continue;
    const p = prims[k], s = NEAR[i], sy = y + 0.5 - AY;
    Q.X = x + 0.5 - AX; Q.Y = sy * SA + s * CA; Q.Z = -sy * CA + s * SA;
    Q.nx = NX[i]; Q.ny = NY[i]; Q.nz = NZ[i]; Q.l0 = L0[i]; Q.l1 = L1[i]; Q.l2 = L2[i]; Q.x = x - AX; Q.y = y - AY; Q.k = 0; Q.e = null; Q.gloss = 0; Q.part = p.part; Q.side = p.side || 0;
    const R = p.m(Q);
    let c;
    if (R.length === 3 && !Array.isArray(R[0])) c = R;
    else {
      const ndl = Q.nx * LT[0] + Q.ny * LT[1] + Q.nz * LT[2];
      let v = 0.45 + 0.62 * ndl + Q.k - AO[i];
      if (ndl > 0.05 && occluded(prims, k, Q.X + Q.nx * 0.45, Q.Y + Q.ny * 0.45, Q.Z + Q.nz * 0.45)) v -= 0.32 * Math.min(1, ndl * 2.4);
      if (Q.gloss && ndl > 0.72) v += 0.3 * Q.gloss;
      c = R[clamp(Math.round(v * (R.length - 1) + bayer(x - AX, y - AY) * 0.42), 0, R.length - 1)];
    }
    CR[i] = c[0]; CG[i] = c[1]; CB[i] = c[2]; ZW[i] = Q.Z; EM[i] = Q.e;
    if (opt.debug) { const hh = hash(k, 1, 77), part = p.part; CR[i] = 60 + hash(k, 2, 5) * 195; CG[i] = 60 + hh * 195; CB[i] = part === 'head' ? 255 : 60 + hash(k, 3, 9) * 120; }
  }
  // 4. the held item, depth-tested against the body
  if (IT) heldItem(IT, P, w, h, AX, AY, opt);
  // 5. the face, stamped through the head's frame
  if (fig.head >= 0) face(fig, P, A, D, w, h, AX, AY);
  // 6. water: the body under the surface fades out, foam where it breaks the surface
  if (P.water) water(w, h, AX, AY, X, S, P);
  // 7. censor blocks over private areas on an undressed body
  if (fig.W.bare) censor(fig, S, X, D, w, h, AX, AY);
  // 8. lines between overlapping parts (on the farther pixel), then the outline round the figure
  const grp = (k) => (k === ITEMID ? GR.ITEM : prims[k].g);
  const step = (i, j, g) => {   // is neighbour j a separate part standing clearly in front of pixel i?
    const kj = PID[j];
    if (kj < 0 || NOO[j] || kj === FOAMID) return false;
    const gj = grp(kj), d = NEAR[j] - NEAR[i];
    return d > (gj !== g ? (g === GR.HEAD && gj === GR.HAIR ? 0.7 : g === GR.HAIR && gj === GR.HEAD ? 2.6 : 1.6) : 4.2);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, k = PID[i];
    if (k < 0 || NOO[i] || k === FOAMID || AO[i] < 0) continue;      // (AO -1: a censor block, kept whole)
    const g = grp(k);
    if ((x > 0 && step(i, i - 1, g)) || (x < w - 1 && step(i, i + 1, g)) || (y > 0 && step(i, i - w, g)) || (y < h - 1 && step(i, i + w, g))) LN[i] = 1;
  }
  for (let i = 0; i < n; i++) if (LN[i]) { CR[i] = CR[i] * 0.3 + 12; CG[i] = CG[i] * 0.26 + 8; CB[i] = CB[i] * 0.34 + 18; }
  // pack: colour, a soft normal (half the shape's own, half facing the camera and up), height, glow, flags; then the
  // outline into the empty pixels round the figure
  const G = new GBuf(w, h), gc = G.col, gn = G.nrm, gz = G.z, ge = G.emi, gf = G.flag;
  G.ax = AX; G.ay = AY;
  const cand = (q, j) => (PID[q] >= 0 && !NOO[q] && PID[q] !== FOAMID && (j < 0 || NEAR[q] > NEAR[j]) ? q : j);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    let j = i;
    if (PID[i] < 0) {
      j = -1;
      if (x > 0) j = cand(i - 1, j);
      if (x < w - 1) j = cand(i + 1, j);
      if (y > 0) j = cand(i - w, j);
      if (y < h - 1) j = cand(i + w, j);
      if (j < 0) continue;
    }
    let nx = 0, ny = 0.42, nz = 0.91;
    if (PID[j] < ITEMID) { nx = NX[j] * 0.45; ny = NY[j] * 0.45 + 0.231; nz = NZ[j] * 0.45 + 0.5; }
    const l = 1 / (Math.hypot(nx, ny, nz) || 1), e = EM[j];
    gn[o] = (nx * l * 0.5 + 0.5) * 255; gn[o + 1] = (ny * l * 0.5 + 0.5) * 255; gn[o + 2] = (nz * l * 0.5 + 0.5) * 255; gn[o + 3] = 255;
    gz[i] = Math.max(1, Math.round(ZW[j] * CA)); gc[o + 3] = 255;
    if (j === i) {
      gc[o] = CR[i]; gc[o + 1] = CG[i]; gc[o + 2] = CB[i]; gf[i] = F_CHAR | FL[i];
      if (e) { ge[o] = e[0]; ge[o + 1] = e[1]; ge[o + 2] = e[2]; ge[o + 3] = e[3] ?? 255; }
    } else if (e && e[3] > 180) {
      gc[o] = e[0] * 0.45; gc[o + 1] = e[1] * 0.55; gc[o + 2] = e[2] * 0.85; ge[o] = e[0]; ge[o + 1] = e[1]; ge[o + 2] = e[2]; ge[o + 3] = 140; gf[i] = F_CHAR | F_NOCAST;
    } else { gc[o] = 24 + CR[j] * 0.12; gc[o + 1] = 16 + CG[j] * 0.09; gc[o + 2] = 26 + CB[j] * 0.13; gf[i] = F_CHAR | FL[j]; }
  }
  return opt.tight ? crop(G) : G;
}
function crop(G) {
  let x0 = G.w, y0 = G.h, x1 = -1, y1 = -1;
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (G.col[(y * G.w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { const E = new GBuf(1, 1); E.ax = 0; E.ay = 0; return E; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, O = new GBuf(w, h);
  O.ax = G.ax - x0; O.ay = G.ay - y0;
  for (let y = 0; y < h; y++) {
    const si = (y + y0) * G.w + x0, di = y * w;
    O.col.set(G.col.subarray(si * 4, (si + w) * 4), di * 4); O.nrm.set(G.nrm.subarray(si * 4, (si + w) * 4), di * 4); O.emi.set(G.emi.subarray(si * 4, (si + w) * 4), di * 4);
    O.z.set(G.z.subarray(si, si + w), di); O.flag.set(G.flag.subarray(si, si + w), di);
  }
  return O;
}
// a held item: items.js draws it flat along the item's axis; its plane is turned toward the camera when it would be
// seen edge-on, and every pixel is depth-tested against the body (fists close round the grip, things held behind are hidden)
const ITEM_SCALE = { gun1: 1.08, gun2: 1.18, rocket: 1.06, bill: 1, phone: 1, umb: 1 };
function heldItem(IT, P, w, h, AX, AY, opt) {
  const ID = IT.ID, cls = ICLS[IT.kind], hs = ID.hs * (ITEM_SCALE[cls] || 1.04), A3 = IT.axis, Cv = [0, CA, SA];
  let V3 = IT.vdir;
  const proj = (v) => [v[0], v[1] * SA - v[2] * CA];
  let U = proj(A3), V = proj(V3);
  const lu = Math.hypot(U[0], U[1]) || 1e-6, lv = Math.hypot(V[0], V[1]) || 1e-6, cr = Math.abs(U[0] * V[1] - U[1] * V[0]) / (lu * lv);
  if (cr < 0.55 && !ID.bill) {
    let N = vsub(Cv, vmul(A3, vdot(Cv, A3)));
    if (vlen(N) > 1e-3) { N = vnorm(N); let Vb = vcross(A3, N); if (vdot(Vb, V3) < 0) Vb = vmul(Vb, -1); V3 = vnorm(vadd(V3, vmul(Vb, 2.2 * (0.55 - cr) / 0.55 + 0.4))); V = proj(V3); }
  }
  // the profile keeps its full thickness (the camera would squash a vertical profile by cos 35 deg), as the targets draw it
  U = [U[0] * hs, U[1] * hs]; V = [V[0] * hs / CA, V[1] * hs / CA];
  if (ID.bill) { U = [hs, 0]; V = [0, hs]; }                     // flat things (a medkit, a phone) face the camera
  const det = U[0] * V[1] - U[1] * V[0];
  if (Math.abs(det) < 1e-4) return;
  const g = IT.grip, gx = AX + Math.round(g[0] * 256) / 256, gy = AY + Math.round((g[1] * SA - g[2] * CA) * 256) / 256, vk = ID.vk || 1;   // (exact sums: the same raster wherever the buffer starts)
  const gs = g[1] * CA + g[2] * SA + (ID.bill ? 2.0 : cls === 'gun1' || cls === 'gun2' || cls === 'rocket' ? 1.8 : 0.8), au = ID.bill ? 0 : vdot(A3, Cv) * hs, av = ID.bill ? 0 : vdot(V3, Cv) * hs * vk;
  const zu = ID.bill ? 0 : A3[2] * hs, zv = ID.bill ? -1 / CA : V3[2] * hs * vk;
  // the fishing line hangs from the rod tip down to the ground (or the water) at the feet
  let line = P.line;
  if (line < 0 && ID.tip) { const tz = g[2] + (A3[2] * ID.tip[0] + V3[2] * ID.tip[1] * vk) * hs; line = Math.max(6, Math.round(tz * CA + 1)); }
  drawItem((x, y, c, e, no) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x, dx = x + 0.5 - gx, dy = y + 0.5 - gy;
    const u = (dx * V[1] - dy * V[0]) / det, v = (U[0] * dy - U[1] * dx) / det / vk;
    const s = no ? 1e6 : gs + u * au + v * av;
    if (PID[i] >= 0 && PID[i] !== ITEMID && s <= NEAR[i] - 0.2) return;
    NEAR[i] = no ? Math.max(NEAR[i], gs) : s; PID[i] = ITEMID; NOO[i] = no ? 1 : 0;
    CR[i] = c[0]; CG[i] = c[1]; CB[i] = c[2]; EM[i] = e || null; ZW[i] = no ? Math.max(1, (g[2] - (dy) / CA)) : g[2] + u * zu + v * zv;
  }, IT.kind, gx, gy, U, V, { line: ID.tip ? line : 0, org: [AX, AY] });
}
function face(fig, P, A, D, w, h, AX, AY) {
  const hp = fig.prims[fig.head], c = hp.c, M = hp.M, r = hp.r, K = fig.head, W = fig.W;
  const at = (l0, l1, l2) => {
    const lx = l0 * r[0], ly = l1 * r[1], lz = l2 * r[2];
    const X = c[0] + M[0] * lx + M[1] * ly + M[2] * lz, Y = c[1] + M[3] * lx + M[4] * ly + M[5] * lz, Z = c[2] + M[6] * lx + M[7] * ly + M[8] * lz;
    const nx = M[0] * l0 / r[0] + M[1] * l1 / r[1] + M[2] * l2 / r[2], ny = M[3] * l0 / r[0] + M[4] * l1 / r[1] + M[5] * l2 / r[2], nz = M[6] * l0 / r[0] + M[7] * l1 / r[1] + M[8] * l2 / r[2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    return { x: Math.floor(AX + X), y: Math.floor(AY + Y * SA - Z * CA), fc: (ny * CA + nz * SA) / nl };
  };
  const JAW = K + 1, onHead = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (PID[y * w + x] === K || PID[y * w + x] === JAW);
  const put = (x, y, col) => { if (onHead(x, y)) { const i = y * w + x; CR[i] = col[0]; CG[i] = col[1]; CB[i] = col[2]; } };
  const skin = W.skin, hairR = W.hairR, brow = lum(hairR[2]) > 0.55 ? hairR[0] : hairR[1];
  // as the head turns away from the camera the near-side features slide back round it (pixel-art profiles keep the
  // eye a couple of pixels inside the face's edge)
  const fh = Math.hypot(M[1], M[4]), turn = fh > 0.2 ? Math.abs(M[1]) / fh : 0, near = M[3] >= 0 ? 1 : -1;
  const azE = (s) => (21 + (s === near ? 17 * turn : 0)) * Math.PI / 180;
  const eyes = [-1, 1].map((s) => { const a = azE(s); return { s, p: at(s * Math.sin(a), Math.cos(a) * 0.99, 0.14), b: at(s * Math.sin(a + 0.06), Math.cos(a + 0.06) * 0.95, 0.38) }; }).filter((e) => e.p.fc > 0.28 && onHead(e.p.x, e.p.y));
  const glasses = A.glasses, mid = at(0, 1, 0), F = A.face || {}, mk = A.makeup || null;
  const iris = F.eyeColor ? hexRgb(F.eyeColor).map((v, i) => Math.round(v * 0.7 + EYE[i] * 0.3)) : EYE;
  const shadowC = mk && (mk.kind === 'smoky eyes' || mk.kind === 'goth') ? [40, 30, 44] : mk && mk.kind === 'glam' ? hexRgb(mk.color || '#7a3ac8') : null;
  const tall = F.eyes !== 2 && F.eyes !== 5;      // narrow and sleepy eyes are one pixel tall
  for (const e of eyes) {
    const { x, y } = e.p;
    if (!P.eyes) { put(x, y + 1, skin[0]); put(x + (e.p.x < mid.x ? -1 : 1), y + 1, skin[0]); continue; }
    put(x, y, EYE); if (tall) put(x, y + 1, iris); else put(x, y + 1, skin[1]);
    if (shadowC && !glasses) put(x + (x < mid.x ? -1 : 1), y - 1, shadowC);
    const out = x < mid.x ? -1 : x > mid.x ? 1 : e.s, fwd = M[1] >= 0 ? 1 : -1;
    if (turn > 0.85 && !glasses) put(x + fwd, y, WHITE);                         // in profile the white sits in front
    else if (e.p.fc > 0.7 && !glasses) put(x + out, y, WHITE);
    if (D.fem) put(x + out, y - 1, EYE);
    if (!A.mask && glasses !== 'sun' && glasses !== 'goggles' && glasses !== 'domino') {
      const bx = e.b.x, by = Math.min(e.b.y, y - 1);
      put(bx, by, brow);
      if (F.brows !== 2) put(bx + out, by - (D.fem || F.brows === 4 ? 0 : 1), brow);           // thin brows: one pixel
      if (F.brows === 1 || F.brows === 5) put(bx + out, by - (D.fem ? 1 : 0), brow);       // thick and bushy: another
      if (F.brows === 3) put(bx + out * 2, by, brow);                                       // arched: a tail
    }
  }
  if (glasses && eyes.length) {
    const xs = eyes.map((e) => e.p.x), ys = eyes.map((e) => e.p.y), ya = Math.min(...ys), xa = Math.min(...xs) - 1, xb = Math.max(...xs) + 1;
    if (glasses === 'sun' || glasses === 'domino') { const lc = A.lens ? hexRgb(A.lens).map((v) => Math.round(v * 0.7)) : glasses === 'domino' ? hexRgb(A.glassColor || '#1a1a1e') : [26, 28, 38]; for (let x = xa - (glasses === 'domino' ? 1 : 0); x <= xb + (glasses === 'domino' ? 1 : 0); x++) for (let y = ya; y <= ya + 1; y++) put(x, y, x === xa + 1 && y === ya && glasses === 'sun' ? [128, 150, 178] : lc); }
    else if (glasses === 'goggles') { const lc = hexRgb(A.glassTrim || '#ef7a1a'), sc = hexRgb(A.glassColor || '#1a1a1e'); for (let x = xa - 1; x <= xb + 1; x++) for (let y = ya - 1; y <= ya + 1; y++) put(x, y, y === ya - 1 || x === xa - 1 || x === xb + 1 ? sc : lc); }
    else if (glasses === 'patch') {
      // one eye covered, ONE strap round the head (up over the other side)
      const e = eyes.reduce((a, b) => (b.s > a.s ? b : a)), pc = hexRgb(A.glassColor || '#1a1a1e');
      for (const [dx, dy] of [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, -1]]) put(e.p.x + dx, e.p.y + dy, pc);
      for (let t = 0; t <= 1; t += 0.06) { const q = at(e.s * (0.45 - t * 1.3), Math.cos(t * 1.4) * 0.9, 0.2 + t * 0.62); if (q.fc > 0) put(q.x, q.y, pc); }
    }
    else { for (const e of eyes) { const o = e.p.x < mid.x ? -1 : 1; for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [o, 0]]) put(e.p.x + dx, e.p.y + dy, [74, 56, 50]); } if (eyes.length === 2) for (let x = xa + 2; x <= xb - 2; x++) put(x, ya, [74, 56, 50]); }
  }
  // marks on the face (the look system): freckles, a beauty mark, dimples, blush, piercings, a scar, a face tattoo
  const covered = A.mask || A.bandana || A.medmask, dot = (l0, l1, l2, c, min = 0.35) => { const q = at(l0, l1, l2); if (q.fc > min) put(q.x, q.y, c); };
  if (!A.mask) {
    if (F.freckles) for (const s of [-1, 1]) { dot(s * 0.42, 0.88, -0.06, skin[1]); dot(s * 0.3, 0.92, -0.12, skin[1]); }
    if (mk && (mk.kind === 'blush' || mk.kind === 'glam')) for (const s of [-1, 1]) dot(s * 0.5, 0.84, -0.2, [Math.min(255, skin[3][0] + 20), Math.round(skin[3][1] * 0.78), Math.round(skin[3][2] * 0.82)]);
    if ((A.tattoo | 0) & 16) dot(0.38, 0.9, -0.02, [40, 46, 70], 0.4);
    const pc = [214, 218, 226];
    if ((A.piercings | 0) & 4) dot(0.4, 0.88, 0.44, pc);
    if (!covered) {
      if (F.mole) dot(0.3, 0.92, -0.34, [70, 40, 30], 0.45);
      if ((A.piercings | 0) & 2) dot(0.14, 0.99, -0.26, pc, 0.5);
      if (A.scar) { const S = [null, [[0.42, 0.86, -0.04], [0.5, 0.82, -0.16]], [[0.36, 0.92, 0.5], [0.36, 0.93, 0.0]], [[0.14, 0.95, -0.36], [0.16, 0.94, -0.52]], [[0.0, 0.9, -0.72], [0.12, 0.88, -0.74]], [[0.34, 0.92, 0.5], [0.46, 0.88, 0.42]]][A.scar | 0]; if (S) { const sc = [Math.min(255, skin[3][0] + 30), Math.min(255, skin[3][1] + 10), Math.min(255, skin[3][2] + 10)]; for (let t = 0; t <= 1; t += 0.25) dot(S[0][0] + (S[1][0] - S[0][0]) * t, S[0][1] + (S[1][1] - S[0][1]) * t, S[0][2] + (S[1][2] - S[0][2]) * t, sc, 0.4); } }
    }
  }
  // the mouth (not under a bandana or a mask)
  if (!covered) {
    const am = near * turn * 0.2, m = at(Math.sin(am), Math.cos(am) * 0.9, -0.44);
    if (m.fc > 0.3 && onHead(m.x, m.y)) {
      const mc = mk && mk.color && (mk.kind === 'lipstick' || mk.kind === 'glam') ? hexRgb(mk.color) : mk && mk.kind === 'goth' ? [34, 22, 34] : mk && mk.kind === 'natural' ? [Math.round(skin[1][0] * 0.85 + 40), Math.round(skin[1][1] * 0.7), Math.round(skin[1][2] * 0.75)] : null;
      const lip = mc || (D.fem ? [Math.round(skin[1][0] * 0.9 + 30), Math.round(skin[1][1] * 0.75), Math.round(skin[1][2] * 0.8)] : skin[0]);
      put(m.x, m.y, lip);
      if (m.fc > 0.62) put(m.x + (eyes.length === 1 ? (eyes[0].p.x < mid.x ? -1 : 1) : -1), m.y, lip);
      if ((F.lips === 2 || F.lips === 3) && m.fc > 0.62) put(m.x + (eyes.length === 1 ? (eyes[0].p.x < mid.x ? 1 : -1) : 1), m.y, lip);   // full and wide lips
      if (F.dimples && m.fc > 0.7) { put(m.x - 2, m.y - 1, skin[1]); put(m.x + 2, m.y - 1, skin[1]); }
      if ((A.piercings | 0) & 8) put(m.x + 1, m.y + 1, [214, 218, 226]);
    }
  }
}
function water(w, h, AX, AY, X, S, P) {
  const WATERC = [36, 116, 140];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (PID[i] < 0) continue;
    const z = ZW[i];
    if (z < -1.8) { PID[i] = -1; continue; }
    if (z < -0.9) { const k = 0.62 + Math.min(1, -z / 5.5) * 0.25; CR[i] = CR[i] * (1 - k) + WATERC[0] * k; CG[i] = CG[i] * (1 - k) + WATERC[1] * k; CB[i] = CB[i] * (1 - k) + WATERC[2] * k; NOO[i] = 1; FL[i] = F_NOCAST; }
    else if (z < 0.7 && hash(x - AX, y - AY, 5) > 0.25) { CR[i] = 226; CG[i] = 244; CB[i] = 246; NOO[i] = 1; FL[i] = F_NOCAST; }
  }
  // a broken ring of ripples round the swimmer
  const c = X.pt(vlerp(S.shL, S.shR, 0.5)), cx = AX + c[0], cy = AY + c[1] * SA + 1;
  for (let a = 0; a < 6.283; a += 0.1) {
    const x = Math.round(cx + Math.cos(a) * 11), y = Math.round(cy + Math.sin(a) * 4.2);
    if (x < 0 || y < 0 || x >= w || y >= h || hash(x - AX, y - AY, 9) < 0.35) continue;
    const i = y * w + x;
    if (PID[i] >= 0) continue;
    PID[i] = FOAMID; NOO[i] = 1; FL[i] = F_NOCAST; CR[i] = 214; CG[i] = 238; CB[i] = 242; ZW[i] = 0; NEAR[i] = -1e8; EM[i] = null;
  }
}
function censor(fig, S, X, D, w, h, AX, AY) {
  const W = fig.W, spots = [];
  if (W.bk === 'none') spots.push([vadd(S.pel, mv(S.PF, [0, D.pelR[1] * 0.95, -D.pelR[2] * 0.36])), 6, 6]);
  if (W.tk === 'none' && D.fem) spots.push([vadd(S.chest, mv(S.SP, [0, D.chestR[1] + 0.2, 1.0])), 10, 4]);
  const soft = W.skin[4];
  for (const [p, bw, bh] of spots) {
    const q = X.pt(p), s = q[1] * CA + q[2] * SA, cx = Math.round(AX + q[0]), cy = Math.round(AY + q[1] * SA - q[2] * CA);
    let seen = false;                                                // facing us (a body pixel close by is not much nearer)
    for (let dy = -1; dy <= 1 && !seen; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < w && y < h && PID[y * w + x] >= 0 && NEAR[y * w + x] - s < 4) { seen = true; break; } }
    if (!seen) continue;
    const xa = cx - (bw >> 1), ya = cy - (bh >> 1);
    for (let by = ya; by < ya + bh; by += 3) for (let bx = xa; bx < xa + bw; bx += 3) {
      let r = 0, g = 0, b = 0, m = 0;
      for (let y = by; y < by + 3; y++) for (let x = bx; x < bx + 3; x++) { if (x < 0 || y < 0 || x >= w || y >= h) continue; const i = y * w + x; if (PID[i] < 0) continue; r += CR[i]; g += CG[i]; b += CB[i]; m++; }
      if (!m) continue;
      // a visible mosaic: 3 px blocks of soft skin tone, alternately lighter and darker, which no crease line crosses
      const j = (((bx - xa) / 3 + (by - ya) / 3) & 1 ? 1.1 : 0.86) + hash(bx - AX, by - AY, 41) * 0.06;
      r = (r / m * 0.35 + soft[0] * 0.65) * j; g = (g / m * 0.35 + soft[1] * 0.65) * j; b = (b / m * 0.35 + soft[2] * 0.65) * j;
      for (let y = by; y < by + 3; y++) for (let x = bx; x < bx + 3; x++) { if (x < 0 || y < 0 || x >= w || y >= h) continue; const i = y * w + x; if (PID[i] < 0) continue; CR[i] = r; CG[i] = g; CB[i] = b; AO[i] = -1; }
    }
  }
}

// ---- the entry point -------------------------------------------------------------------------------------------------------------
const CARRY = ['briefcase', 'bag', 'purse', 'toolbag', 'shopping', 'coffee', 'phone', 'cane', 'board'];
const heldKind = (A) => (A.held && ITEMS[A.held] ? A.held : A.carry && !CARRY.includes(A.carry) && ITEMS[A.carry] ? A.carry : null);
function seedOf(A) {
  if (A.seed !== undefined) return A.seed | 0;
  const s = JSON.stringify([A.skin, A.hair, A.top, A.bottom, A.shoes, A.hat]);
  let hh = 7; for (let i = 0; i < s.length; i++) hh = (hh * 31 + s.charCodeAt(i)) | 0;
  return hh & 0xffff;
}
export function person(app, dir = 0, pose = 'idle', frame = 0, opt = {}) {
  const A = app || {};
  let pn = ALIAS[pose] || pose;
  if (POSES[pn] === undefined) pn = 'idle';
  const nf = POSES[pn], f = (((frame | 0) % nf) + nf) % nf;
  let kind = opt.held !== undefined ? (opt.held && ITEMS[opt.held] ? opt.held : null) : heldKind(A);
  if (pn === 'fish') kind = 'fishingRod';
  if (['carry', 'handsup', 'cuffed', 'kneel', 'roll', 'down', 'dead', 'swim', 'ride', 'pedal', 'sit', 'sitlow', 'drive', 'crawl', 'downF', 'downB', 'deadF', 'deadS'].includes(pn)) kind = null;
  const acc = A.carry && CARRY.includes(A.carry) ? A.carry : null;
  const th = Math.PI / 2 - (((dir | 0) % 8) + 8) % 8 * Math.PI / 4;
  const D = dims(A), P = rig(D, A, pn, f, kind, acc);
  if (!P.root) P.camYaw = 0.3 * Math.cos(th);                       // E +, W -: the face turns toward the camera (south)
  const S = solve(D, P);
  if (opt.lineLen > 0 && P.line) P.line = opt.lineLen;              // (a pose's hands set its line while solving)
  const X = makeXF(th, P), seed = seedOf(A);
  const fig = buildFigure(A, D, P, S, X, kind, acc, seed);
  // lying, rolling and swimming bodies are lowered onto the ground (or the water) as a whole
  if (P.ground || P.water) {
    let dz;
    if (P.water) { const sh = X.pt(vlerp(S.shL, S.shR, 0.5)); dz = 1.4 - sh[2]; }
    else { let mn = 1e9; for (const p of fig.prims) mn = Math.min(mn, lowest(p)); dz = -mn + P.rise; }
    for (const p of fig.prims) shift(p, dz);
    fig.TF.c = [fig.TF.c[0], fig.TF.c[1], fig.TF.c[2] + dz]; fig.TF.p = [fig.TF.p[0], fig.TF.p[1], fig.TF.p[2] + dz];
    const X0 = X.pt;
    X.pt = (q) => { const v = X0(q); v[2] += dz; return v; };
  }
  return render(fig, P, S, X, D, A, opt);
}
function lowest(p) {
  if (p.t === 1) return Math.min(p.a[2] - p.ra, p.b[2] - p.rb);
  const M = p.M, r = p.r;
  return p.t === 0 ? p.c[2] - Math.hypot(r[0] * M[6], r[1] * M[7], r[2] * M[8]) : p.c[2] - (Math.abs(r[0] * M[6]) + Math.abs(r[1] * M[7]) + Math.abs(r[2] * M[8]));
}
function shift(p, dz) {
  if (p.t === 1) { p.a = [p.a[0], p.a[1], p.a[2] + dz]; p.b = [p.b[0], p.b[1], p.b[2] + dz]; p.bc = vlerp(p.a, p.b, 0.5); }
  else { p.c = [p.c[0], p.c[1], p.c[2] + dz]; p.bc = p.c; }
}

// ---- archetypes for scenes (the first version's sheet, extended) --------------------------------------------------------------------
const PALET = ['white', 'black', 'denim', 'navy', 'red', 'orange', 'yellow', 'green', 'teal', 'purple', 'pink', 'khaki', 'grey', 'brown'];
export const ARCHETYPES = {
  banker: { top: { kind: 'suit', color: 'black', color2: 'white', tie: 'navy' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'brown', carry: 'briefcase', glasses: 'sun' },
  socialite: { fem: true, hair: { style: 'wavy', color: 3 }, top: { kind: 'tank', color: 'white' }, bottom: { kind: 'pants', color: 'khaki' }, shoes: 'brown', shoeKind: 'sandal', carry: 'shopping', glasses: 'sun' },
  yachtie: { hair: { style: 'short', color: 4 }, top: { kind: 'polo', color: 'teal' }, bottom: { kind: 'shorts', color: 'white' }, shoes: 'brown', glasses: 'sun' },
  athleisure: { fem: true, hair: { style: 'bun', color: 1 }, top: { kind: 'tank', color: 'pink' }, bottom: { kind: 'leggings', color: 'pink' }, shoes: 'white', carry: 'phone' },
  valet: { top: { kind: 'vest', color: 'black', color2: 'white' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'black' },
  office: { top: { kind: 'shirt', color: 'white' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'brown', carry: 'bag', glasses: 'round' },
  nurse: { fem: true, hair: { style: 'bun', color: 0 }, top: { kind: 'scrubs', color: 'denim' }, bottom: { kind: 'pants', color: 'denim' }, shoes: 'white', carry: 'coffee' },
  dad: { hair: { style: 'short', color: 1 }, beard: 'short', top: { kind: 'jacket', color: 'green', color2: 'white' }, bottom: { kind: 'pants', color: 'khaki' }, shoes: 'brown', glasses: 'round' },
  student: { hair: { style: 'short', color: 0 }, top: { kind: 'hoodie', color: 'grey' }, bottom: { kind: 'jeans', color: 'black' }, shoes: 'black', hat: { kind: 'cap', color: 'red' }, back: 'backpack' },
  barista: { fem: true, hair: { style: 'bun', color: 2 }, top: { kind: 'apron', color: 'green', color2: 'black' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'white', carry: 'coffee' },
  mechanic: { build: 2, beard: 'full', top: { kind: 'overalls', color: 'navy', color2: 'navy' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'brown', hat: { kind: 'cap', color: 'navy' } },
  nightshift: { top: { kind: 'hivis', color: 'yellow', color2: 'black' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'brown', hat: { kind: 'beanie', color: 'black' }, carry: 'coffee' },
  punk: { hair: { style: 'mohawk', color: 5 }, top: { kind: 'leather', color: 'black', color2: 'grey' }, bottom: { kind: 'jeans', color: 'denim', pattern: 'ripped' }, shoes: 'black', shoeKind: 'boot', tattoo: true },
  tracksuit: { build: 2, top: { kind: 'tracksuit', color: 'navy', color2: 'white' }, bottom: { kind: 'track', color: 'navy' }, shoes: 'white', hat: { kind: 'cap', color: 'white' }, chain: true },
  surfer: { hair: { style: 'wavy', color: 3 }, top: { kind: 'none' }, bottom: { kind: 'trunks', color: 'teal' }, shoes: 'brown', shoeKind: 'barefoot', carry: 'board' },
  tourist: { build: 2, top: { kind: 'hawaiian', color: 'teal', color2: 'orange', pattern: 'floral' }, bottom: { kind: 'shorts', color: 'khaki' }, shoes: 'brown', shoeKind: 'sandal', hat: { kind: 'bucket', color: 'khaki' }, glasses: 'sun' },
  farmer: { beard: 'full', hair: { style: 'short', color: 4 }, top: { kind: 'overalls', color: 'denim', color2: 'red' }, bottom: { kind: 'pants', color: 'denim' }, shoes: 'brown', shoeKind: 'boot', hat: { kind: 'cowboy', color: 'khaki' } },
  trucker: { build: 2, beard: 'full', top: { kind: 'flannel', color: 'brown', color2: 'white' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', shoeKind: 'boot', hat: { kind: 'trucker', color: 'red' } },
  granny: { fem: true, build: 0, hair: { style: 'bun', color: 4 }, top: { kind: 'cardigan', color: 'purple', color2: 'pink' }, bottom: { kind: 'skirt', color: 'brown' }, shoes: 'brown', carry: 'cane', glasses: 'round' },
  cop: { top: { kind: 'uniform', color: 'navy', color2: 'gold' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'black', hat: { kind: 'police', color: 'navy' }, glasses: 'sun' },
  swat: { build: 2, top: { kind: 'tactical', color: 'black' }, bottom: { kind: 'cargo', color: 'black' }, shoes: 'black', hat: { kind: 'helmet', color: 'black' }, gloves: 'black' },
  medic: { fem: true, hair: { style: 'pony', color: 1 }, top: { kind: 'uniform', color: 'green' }, bottom: { kind: 'pants', color: 'green' }, shoes: 'black', gloves: '#5a8ad8' },
  firefighter: { build: 2, top: { kind: 'coat', color: 'khaki', color2: 'yellow' }, bottom: { kind: 'pants', color: 'khaki' }, shoes: 'black', shoeKind: 'boot', hat: { kind: 'hard', color: 'red' }, gloves: 'black' },
  syndicate: { top: { kind: 'vest', color: 'black', color2: 'white', pattern: 'quilt' }, bottom: { kind: 'track', color: 'black' }, shoes: 'purple', hat: { kind: 'cap', color: 'black' }, chain: true, bandana: 'purple', tattoo: true },
  enforcer: { build: 2, hair: { style: 'bald' }, top: { kind: 'puffer', color: 'purple', color2: 'white' }, bottom: { kind: 'track', color: 'black' }, shoes: 'purple', chain: true, glasses: 'sun' },
  robber: { top: { kind: 'hoodie', color: 'black' }, bottom: { kind: 'cargo', color: 'grey' }, shoes: 'black', hat: { kind: 'beanie', color: 'black' }, mask: true },
  driver: { top: { kind: 'leather', color: 'black', color2: 'red' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'black', hat: { kind: 'cap', color: 'red' } },
  bounty: { beard: 'short', top: { kind: 'coat', color: 'brown', color2: 'black' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', shoeKind: 'boot', hat: { kind: 'fedora', color: 'brown' }, chain: true },
  clerk: { top: { kind: 'polo', color: 'green' }, bottom: { kind: 'pants', color: 'black' }, hat: { kind: 'cap', color: 'green' } },
  guard: { build: 2, top: { kind: 'tactical', color: 'grey' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'black', hat: { kind: 'cap', color: 'grey' } },
  inmate: { hair: { style: 'buzz', color: 0 }, top: { kind: 'scrubs', color: 'orange' }, bottom: { kind: 'pants', color: 'orange' }, shoes: 'white' },
  warden: { build: 2, top: { kind: 'uniform', color: 'grey', color2: 'gold' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'black', hat: { kind: 'police', color: 'navy' } },
  cook: { top: { kind: 'apron', color: 'white', color2: 'white' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'black', hat: { kind: 'beanie', color: 'white' } },
  janitor: { top: { kind: 'overalls', color: 'navy', color2: 'grey' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'brown', hat: { kind: 'cap', color: 'grey' } },
  lifter: { build: 2, body: { h: 1, w: 1.12, limb: 1.2, muscle: 1 }, hair: { style: 'buzz', color: 0 }, top: { kind: 'tank', color: 'grey' }, bottom: { kind: 'shorts', color: 'black' }, shoes: 'white' },
  boxer: { build: 0, hair: { style: 'short', color: 0 }, top: { kind: 'tank', color: 'white' }, bottom: { kind: 'shorts', color: 'red' }, shoes: 'black', hat: { kind: 'helmet', color: 'red' } },
  yogi: { fem: true, hair: { style: 'bun', color: 0 }, top: { kind: 'tank', color: 'black' }, bottom: { kind: 'leggings', color: 'black' }, shoes: 'white' },
  busker: { beard: 'short', top: { kind: 'jacket', color: 'brown', color2: 'khaki' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', hat: { kind: 'fedora', color: 'brown' } },
  commuter: { top: { kind: 'hoodie', color: 'green' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'white', back: 'backpack', backColor: 'brown' },
  courier: { fem: true, top: { kind: 'polo', color: 'pink' }, bottom: { kind: 'shorts', color: 'black' }, shoes: 'black', hat: { kind: 'cap', color: 'pink' }, back: 'backpack', backColor: 'pink', glasses: 'sun' },
  dockhand: { top: { kind: 'hivis', color: 'orange', color2: 'denim' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', hat: { kind: 'hard', color: 'yellow' }, gloves: '#c8a050' },
  lifeguard: { hair: { style: 'short', color: 3 }, top: { kind: 'none' }, bottom: { kind: 'trunks', color: 'red' }, shoes: 'brown', shoeKind: 'sandal', glasses: 'sun' },
  swimmer: { fem: true, hair: { style: 'pony', color: 1 }, top: { kind: 'swimsuit', color: 'navy' }, bottom: { kind: 'bikini', color: 'navy' }, shoeKind: 'barefoot' },
  sunbather: { fem: true, hair: { style: 'long', color: 3 }, top: { kind: 'bikini', color: 'coral' }, bottom: { kind: 'bikini', color: 'coral' }, shoeKind: 'sandal', glasses: 'sun' },
  bather: { hair: { style: 'short', color: 0 }, top: { kind: 'none' }, bottom: { kind: 'towel', color: 'white' }, shoeKind: 'sandal' },
  spa: { fem: true, hair: { style: 'bun', color: 1 }, top: { kind: 'towel', color: 'cream' }, bottom: { kind: 'towel', color: 'cream' }, shoeKind: 'sandal' },
};
export function randomPerson(seed, kind = null) {
  const r = (k) => hash(seed, k, 97);
  const pick = (arr, k) => arr[Math.floor(r(k) * arr.length) % arr.length];
  const fem = r(1) < 0.5;
  const app = {
    fem, seed: seed & 0xffff, skin: Math.floor(r(2) * 6), build: r(3) < 0.18 ? 2 : r(3) < 0.4 ? 0 : r(3) > 0.9 ? 3 : 1,
    hair: { style: fem ? pick(['long', 'wavy', 'pony', 'bun', 'braids', 'curly', 'short', 'bob'], 5) : pick(['spiky', 'short', 'buzz', 'afro', 'bald', 'curly', 'dreads', 'slick'], 5), color: Math.floor(r(6) * 6) },
    beard: !fem && r(18) < 0.25 ? pick(['short', 'full', 'stubble'], 19) : null,
    top: { kind: pick(['tee', 'tee', 'hoodie', 'polo', 'shirt', 'jacket', 'tank', 'flannel', 'leather'], 7), color: pick(PALET, 8), color2: pick(PALET, 9) },
    bottom: { kind: fem && r(10) < 0.25 ? 'skirt' : pick(['jeans', 'jeans', 'pants', 'cargo', 'shorts'], 10), color: pick(['denim', 'denim', 'black', 'khaki', 'navy', 'grey', 'brown'], 11) },
    shoes: pick(['white', 'white', 'black', 'brown', 'red'], 12),
    hat: r(13) < 0.2 ? { kind: pick(['cap', 'beanie', 'bucket'], 14), color: pick(PALET, 15) } : null,
    glasses: r(16) < 0.12 ? pick(['sun', 'round'], 17) : null,
    carry: r(20) < 0.15 ? pick(['bag', 'coffee', 'phone', 'shopping'], 21) : null,
  };
  if (kind === 'business') return randomPerson(seed, 'banker');
  if (kind === 'beach') return randomPerson(seed, r(30) < 0.5 ? 'surfer' : 'lifeguard');
  if (kind === 'thug') return randomPerson(seed, 'syndicate');
  if (kind && ARCHETYPES[kind]) {
    const a = ARCHETYPES[kind];
    Object.assign(app, { hat: null, glasses: null, carry: null }, a);
    if (a.fem === undefined && a.top && a.top.kind === 'none') app.fem = false;
    if (a.fem !== undefined && !a.hair) app.hair = { style: a.fem ? 'pony' : 'short', color: app.hair.color };
    if (!app.fem && !a.hair && ['long', 'wavy', 'pony', 'bun', 'braids', 'bob'].includes(app.hair.style)) app.hair = { style: 'short', color: app.hair.color };
    if (app.fem) app.beard = null;
  }
  return app;
}

// ==== The city's people (task #365, server/systems/personas.js): personality walks and props ========================
// walks (POSES): hunch (a senior's slow stoop on a cane), strut (hips swaying, the feet on one line), skate (riding a board,
// pushing off), blade (rollerblades: the long side-pushed glide), dance (four frames of letting go), push (pushing a cart)
// props (app.carry): trolley (a senior's two-wheeled shopping trolley, pulled along), cart (a shopping cart with a blanket
// in it, pushed), leads (three dog leads out in front, to where the dogs trot), guitar (a busker's), call (the phone at an ear)
Object.assign(POSES, { hunch: 6, strut: 6, skate: 4, blade: 6, dance: 4, push: 6 });
CARRY.push('trolley', 'cart', 'leads', 'guitar', 'call');
Object.assign(ACC_HANDS, { trolley: 1, cart: 2, leads: 1, guitar: 2, call: 1 });
const MAT = (c, g = 0) => (Q) => { if (g) Q.gloss = g; return cloth(c); };
const M365 = { metal: MAT('#a4a8b0', 0.5), rubber: MAT('#26262a'), blanket: MAT('#6a7a9a'), tartan: MAT('#8a2a34'), wood: MAT('#d0903e', 0.4), deck: MAT('#2a9aa8', 0.3), lead: MAT('#c8262b'), dark: MAT('#1c1c22', 0.4), wheel: MAT('#f2c21b'), bag: MAT('#3a5a3a') };
const GAITS2 = {
  hunch(D, P, f, kind, acc) {
    gait(D, P, 0, f / 6, !kind && !(acc && ACC_HANDS[acc] === 2));
    for (const k of ['fL', 'fR']) P[k] = [P[k][0], P[k][1] * 0.55, D.ank + (P[k][2] - D.ank) * 0.5];
    P.pel = [P.pel[0] * 0.6, P.pel[1] - 0.6, P.pel[2] - 1.3]; P.lean = 0.42; P.headPitch = -0.32; P.splay = 0.25;
    wrapAcc(D, P, acc);
  },
  strut(D, P, f, kind, acc) {
    gait(D, P, 0, f / 6, !kind && !(acc && ACC_HANDS[acc] === 2));
    for (const [k, s] of [['fL', -1], ['fR', 1]]) P[k] = [s * 0.5, P[k][1] * 1.1, P[k][2]];
    P.pel = [P.pel[0] * 3.2, P.pel[1], P.pel[2] + 0.2]; P.tilt = -P.pel[0] * 0.07; P.pelYaw *= 1.8; P.twist *= 1.6; P.lean = -0.02; P.headPitch = -0.14; P.splay = 0.34;
    wrapAcc(D, P, acc);
  },
  skate(D, P, f) {   // the front (left) foot on the board, the right pushing off the ground beside it
    const k = f & 3;
    P.acc = false; P.board = true; P.lean = 0.16; P.twist = -0.1; P.headPitch = -0.1;
    P.pel = [-0.6, 0.4, D.pelZ - 1.6];
    P.fL = [-1.5, 3.2, D.ank + 2.3]; P.kneeL = [-0.2, 1, 0.3];
    P.fR = [D.hipX + 1.2, [1.6, -7.4, -6.2, -1.2][k], D.ank + [0, 0, 3.2, 2.6][k]]; P.kneeR = [0.2, 1, 0];
    P.hands = (S) => { P.hL = vadd(S.shL, [-4.6, 1.6 - k * 0.3, -9.2]); P.hR = vadd(S.shR, [4.2, -1.4 + k * 0.4, -9.6]); P.openL = P.openR = 1; };
  },
  blade(D, P, f) {   // each stride pushed out to the side, a long glide, low and leaning
    gait(D, P, 1, f / 6, true);
    const s = Math.sin(2 * Math.PI * f / 6);
    P.fL = [P.fL[0] - 1.6 - 2.4 * Math.max(0, s), P.fL[1] * 0.75, D.ank + 1.4 + (P.fL[2] - D.ank) * 0.4];
    P.fR = [P.fR[0] + 1.6 + 2.4 * Math.max(0, -s), P.fR[1] * 0.75, D.ank + 1.4 + (P.fR[2] - D.ank) * 0.4];
    P.pel = [P.pel[0] * 1.5, P.pel[1], P.pel[2] - 0.4]; P.lean = 0.32; P.blades = true; P.acc = false;
  },
  dance(D, P, f) {   // up, down, point, wiggle: hips side to side, knees bouncing, arms everywhere
    const s = f & 1 ? 1 : -1, low = f & 1;
    P.acc = false;
    P.pel = [s * 1.5, 0, D.pelZ - (low ? 2.2 : 0.5)]; P.tilt = s * 0.14; P.twist = s * 0.28; P.lean = -0.04; P.headPitch = low ? 0.08 : -0.2; P.headYaw = -s * 0.25;
    P.fL = [-D.hipX - 2.2, 0.6, D.ank + (f === 2 ? 2.6 : 0)]; P.fR = [D.hipX + 2.2, -0.4, D.ank + (f === 0 ? 2.4 : 0)]; P.kneeL = [-0.4, 1, 0]; P.kneeR = [0.4, 1, 0];
    P.hands = (S) => {
      if (f === 0) { P.hL = vadd(S.shL, [-4.6, 2, 13.4]); P.hR = vadd(S.shR, [4.6, 2, 13.4]); P.openL = P.openR = 1; }
      else if (f === 1) { P.hL = vadd(S.chest, mv(S.SP, [-3.6, 7.6, 1.6])); P.hR = vadd(S.chest, mv(S.SP, [3.4, 7.8, 3.6])); }
      else if (f === 2) { P.hR = vadd(S.shR, [5.2, 3.4, 12.6]); P.hL = vadd(S.pel, [-D.pelR[0] - 1.2, 0.8, 2.6]); P.openR = 1; }
      else { P.hL = vadd(S.shL, [-11.6, 2.4, 1.8]); P.hR = vadd(S.shR, [11.6, 2.4, 3.2]); P.openL = P.openR = 1; }
      P.elL = [-1, -0.2, -0.3]; P.elR = [1, -0.2, -0.3];
    };
  },
  push(D, P, f, kind, acc) {
    gait(D, P, 0, f / 6, false);
    P.lean = 0.2; P.headPitch = -0.12;
    wrapAcc(D, P, acc || 'cart');
  },
};
function wrapAcc(D, P, acc) { if (!acc) return; const sw = P.hands; P.hands = (S) => { if (sw) sw(S); accHands(D, P, S, acc); }; }
// the hands on a prop (accHands)
const CART_Z = 25, CART_Y = 11.6;
function accHands2(D, P, S, acc) {
  const r = D.reach;
  if (acc === 'trolley') { P.hR = vadd(S.shR, [2.2, -3.6, -r * 0.86]); P.elR = [1, 0.3, -0.5]; return true; }
  if (acc === 'cart') { P.hR = [4.4, CART_Y, CART_Z]; P.hL = [-4.4, CART_Y, CART_Z]; P.elR = [1, -0.6, -0.4]; P.elL = [-1, -0.6, -0.4]; return true; }
  if (acc === 'leads') { P.hR = vadd(S.shR, [0.4, 7.2, -r * 0.62]); P.elR = [1, -0.5, -0.5]; return true; }
  if (acc === 'guitar') { P.hL = vadd(S.chest, mv(S.SP, [-8.6, 6.4, -2.2])); P.hR = vadd(S.chest, mv(S.SP, [2.2, 7.0, -6.6 + P.breath * 2])); P.elL = [-1, -0.4, -0.5]; P.elR = [1, -0.6, -0.4]; return true; }
  if (acc === 'call') { P.hR = vadd(S.neck, mv(S.SP, [4.4, 1.6, 5.6])); P.elR = [1, -0.2, -1]; P.headYaw += 0.15; return true; }
  return false;
}
// what the props and walks add to the figure (buildFigure)
function figure365(B, C, E, D, P, S, acc) {
  const I = I3;
  if (P.board) {   // the deck under the front foot, its four wheels
    E([-1.5, 3.6, 1.7], I, [2.7, 8.6, 0.7], GR.ACC, 'deck', M365.deck);
    for (const [x, y] of [[-3.1, -2.4], [0.1, -2.4], [-3.1, 9.6], [0.1, 9.6]]) E([x, y, 0.8], I, [0.7, 0.8, 0.8], GR.ACC, 'wheel', M365.wheel);
  }
  if (P.blades) for (const k of ['L', 'R']) {   // a wheel bar under each boot
    const a = S['an' + k];
    B(vadd(a, [0, 1.4, -3.9]), S.PF, [0.75, 3.6, 0.6], GR.ACC, 'blade', M365.dark);
    for (const y of [-1.4, 1.4, 4.2]) E(vadd(a, [0, y, -4.7]), I, [0.6, 0.8, 0.8], GR.ACC, 'wheel', M365.wheel);
  }
  if (!P.acc || !acc || P.item !== null) return;
  const hR = S.haR;
  if (acc === 'trolley') {   // pulled along behind: a tartan bag on two wheels, the handle up to the hand
    const at = [hR[0] + 1.2, hR[1] - 6.4, 7.4];
    B(at, I, [2.4, 2.0, 4.4], GR.ACC, 'trolley', M365.tartan);
    for (const s of [-1, 1]) E([at[0] + s * 2.6, at[1] - 0.6, 1.5], I, [0.7, 1.5, 1.5], GR.ACC, 'wheel', M365.rubber);
    C(vadd(at, [0, -1.6, 4.2]), hR, 0.45, 0.45, GR.ACC, 'handle', M365.metal);
  } else if (acc === 'cart') {   // pushed in front: the basket on its frame and wheels, a blanket and a bag in it
    B([0, CART_Y + 9.6, 19], I, [5.6, 8.4, 5.0], GR.ACC, 'cart', M365.metal);
    C([-5.6, CART_Y, CART_Z], [5.6, CART_Y, CART_Z], 0.6, 0.6, GR.ACC, 'cartbar', M365.metal);
    for (const s of [-1, 1]) for (const y of [CART_Y + 2.4, CART_Y + 16.6]) { C([s * 4.6, y, 14], [s * 4.6, y, 2], 0.45, 0.45, GR.ACC, 'cartleg', M365.metal); E([s * 4.6, y, 1.3], I, [0.6, 1.3, 1.3], GR.ACC, 'wheel', M365.rubber); }
    B([0, CART_Y + 9.0, 24.8], I, [5.4, 7.0, 1.4], GR.ACC, 'blanket', M365.blanket);
    E([2.4, CART_Y + 13, 26.2], I, [2.4, 2.2, 2.4], GR.ACC, 'bag', M365.bag);
  } else if (acc === 'leads') {   // three leads from the hand down to the dogs' collars, out in front
    for (const [x, y] of [[-8, 21], [0, 24], [8, 21]]) C(hR, [x, y, 5.4], 0.42, 0.42, GR.ACC, 'lead', M365.lead);
  } else if (acc === 'guitar') {   // held across the body: the body low at the right, the neck up to the left hand
    const c = vadd(S.chest, mv(S.SP, [1.4, D.chestR[1] + 3.0, -6.0]));
    E(c, S.SP, [5.2, 2.0, 4.3], GR.ACC, 'guitar', M365.wood);
    E(vadd(c, mv(S.SP, [0.4, 1.9, 0.4])), S.SP, [1.3, 0.3, 1.3], GR.ACC, 'hole', M365.dark);
    C(vadd(c, mv(S.SP, [-4.0, 0.6, 1.6])), vadd(S.haL, mv(S.SP, [-1.6, 0, 0.8])), 0.8, 0.65, GR.ACC, 'neck', MAT('#6a4428'));
  } else if (acc === 'call') B(vadd(hR, [-0.6, 0.4, 1.4]), S.SP, [0.5, 1.0, 1.9], GR.ACC, 'phone', M365.dark);
}
// ==== end of the city's people ========================================================================================
