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
//   back 'backpack', backColor, gloves (colour), tattoo, seed }
// The look system (shared/look.js lookArt) adds: skin 0-15, age 0-5 (posture), face {shape, eyes, eyeColor, brows, nose,
//   lips, freckles, mole, dimples}, makeup {kind, color}, tattoo (bits: 1 arms 2 legs 4 neck 8 chest 16 face), piercings
//   (bits: 1 ears 2 nose 4 brow 8 lip), scar 1-5, top {inner, trim, sleeve, len, pattern: stripes check camo floral tiedye},
//   bottom {len, trim}, shoeTrim, bootTall, hiTop, hat.plain, glasses 'goggles'|'patch'|'domino' (+ lens, glassColor, glassForm avi wrap half),
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
// Undressed bodies (a 'none' bottom, or a 'none' top on a woman) get a pixelated mosaic, the Sims' way, over the
// private areas only, for everyone. Adults only.
// Dither and texture patterns are anchored to the feet, so they hold still from frame to frame.
// Also exported: POSES (frames per pose), SEATS (seat heights), PERSON_CAM, HAIR_STYLES, TOP_KINDS, SKIN_TONES,
// cloth(colour) -> 5-step ramp. (Named looks for scenes, ARCHETYPES and randomPerson: client/art2/peoplepresets.js; the face
// close up: client/art2/peopleclose.js.)
import { GBuf, F_CHAR, F_NOCAST, hash, bayer } from './gbuf.js';
import { ITEMS, drawItem, itemSpan } from './items.js';
import { CLUBS } from '../../shared/clubs.js';   // (the biker clubs' patches: task #366)
let PL = null;   // (the staged polish pass, off: peoplepolish.js, docs/characters/NOTES.md)
export function setPolish(p) { PL = p || null; }


// ---- camera, light, poses -------------------------------------------------------------------------------------
const EL = 35 * Math.PI / 180, CA = Math.cos(EL), SA = Math.sin(EL), S0 = 400;
const LT = (() => { const v = [-0.6, 0.38, 0.7], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
export const PERSON_CAM = { elevation: 35, zScale: CA };          // world px of height per model unit = zScale
// seat heights (world px above the anchor) the seated poses sit on: motorbike / jet ski, bicycle, bench, car, the ground
// (by a campfire, knees up)
export const SEATS = { ride: 20, pedal: 19, sit: 11, drive: 9, sitlow: 3, cartsit: 8, saddle: 37 };   // (saddle: up on a horse's back, #325 - drawn at the horse's own feet)
export const POSES = { idle: 4, walk0: 6, walk1: 6, walk2: 6, walk3: 6, punch: 6, swing: 6, aim: 2, aimw: 6, carry: 6, handsup: 2, fish: 4, kneel: 2, roll: 4, down: 2, dead: 1, swim: 2, ride: 1, pedal: 4, sit: 2, drive: 1, walk: 4, held: 2, sitlow: 2, cuffed: 6,
  // hit reactions: a stagger (0-1 knocked back, 2-3 shoved forward), a limp, crawling on the stomach, down on the face or the
  // back (1: pushing up to get back on their feet), dead face down or on the side ('dead' lies on the back)
  stagger: 4, limp: 6, crawl: 4, downF: 2, downB: 2, deadF: 1, deadS: 1 };
const ALIAS = { move0: 'walk0', move1: 'walk1', move2: 'walk2', move3: 'walk3', jog: 'walk1', run: 'walk2', sprint: 'walk3', held: 'idle', stand: 'idle' };
// ---- motorcycle riders (task #366, MC1): leaned back on a chopper ('chop': feet forward on the pegs, hands up on the ape
// hangers), tucked down on a sport bike ('tuck': chest to the tank, hands low on the clip-ons). Built on the 'ride' pose
// (rigMoto, below). shared/vehicles.js ride picks one per bike.
POSES.chop = 1; POSES.tuck = 1;
POSES.saddle = 1;   // (on a horse: astride the saddle, the legs down its flanks to the stirrups, hands low on the reins - #325)
const MOTO_POSES = new Set(['chop', 'tuck']);
// ---- hit by a car (task #361): 'hood', clinging face down on a car's hood, arms spread up to the windscreen (on downF)
POSES.hood = 1;
function rigHood(D, P) {
  const top = D.pelZ + D.neckUp + D.headUp;
  P.root = rx(Math.PI / 2 - 0.12); P.headPitch = -0.6; P.headYaw = 0;
  P.fL = [-D.hipX - 3.4, 1.4, D.ank]; P.fR = [D.hipX + 3.4, 1.4, D.ank]; P.kneeL = [-1, 0.3, 0]; P.kneeR = [1, 0.3, 0];
  P.hands = () => { P.hL = [-9.5, 2.4, top + 7]; P.hR = [9.5, 2.4, top + 7]; P.elL = [-1, 0, 0.4]; P.elR = [1, 0, 0.4]; };
  return P;
}
function rigMoto(P, pose) {
  const seat = SEATS.ride / CA, hands = P.hands;
  if (pose === 'chop') {
    P.lean = -0.16; P.headPitch = 0.05; P.pel = [P.pel[0], P.pel[1] - 1.2, P.pel[2] - 1.2];
    P.fL = [-4.6, 9.5, seat - 9]; P.fR = [4.6, 9.5, seat - 9]; P.kneeL = [-0.5, 0.7, 1]; P.kneeR = [0.5, 0.7, 1];
    P.hands = (S) => { hands(S); P.hL = [-6.4, 10.5, seat + 15.5]; P.hR = [6.4, 10.5, seat + 15.5]; P.elL = [-1, 0, -0.6]; P.elR = [1, 0, -0.6]; };
  } else {
    P.lean = 0.95; P.headPitch = -0.5;
    P.fL = [-4.4, -1, seat - 8.5]; P.fR = [4.4, -1, seat - 8.5]; P.kneeL = [-0.6, 1, 0.3]; P.kneeR = [0.6, 1, 0.3];
    P.hands = (S) => { hands(S); P.hL = [-5, 13.5, seat + 5.5]; P.hR = [5, 13.5, seat + 5.5]; P.elL = [-1, -0.2, -0.2]; P.elR = [1, -0.2, -0.2]; };
  }
  return P;
}
// ---- end motorcycle riders
// ---- biker club patches (NP4, task #366): what colour, if any, the back of a club vest is at (u across, z up)
function clubPatch(ci, u, z, D) {
  const C = CLUBS[ci];
  if (!C) return null;
  const [field, mark] = C.patch, au = Math.abs(u), mid = (D.waistUp + D.chestUp) / 2 + 0.4;
  const top = D.chestUp + 1.4 - u * u * 1.6;                         // the top rocker, arched
  if (au < 0.62 && z > top - 0.9 && z < top + 0.9) return Math.abs(z - top) < 0.32 && (Math.round(u * 14) & 1) ? mark : field;
  const bot = D.waistUp - 0.2 + u * u * 1.4;                         // the bottom rocker
  if (au < 0.5 && z > bot - 0.7 && z < bot + 0.7) return field;
  const dx = u / 0.3, dz = (z - mid) / 2.1, r = Math.hypot(dx, dz);  // the centre patch: a round field, the emblem on it
  if (r > 1) return null;
  if (r > 0.82) return mark;
  if (C.emblem === 'wheel') return Math.abs(r - 0.45) < 0.12 || (r < 0.45 && (Math.abs(dx) < 0.08 || Math.abs(dz) < 0.1)) || (Math.abs(dz) < 0.12 && r > 0.5) ? mark : field;
  if (C.emblem === 'crow') return (dz > -0.15 && dz < 0.35 && Math.abs(dx) < 0.75 - Math.abs(dz)) || (Math.abs(dx) < 0.2 && dz > -0.6 && dz < 0.6) ? mark : field;
  return (dz > -0.5 && Math.abs(dx) < 0.32 - dz * 0.2) || (dz > 0.3 && Math.abs(Math.abs(dx) - 0.35) < 0.12) ? mark : field;   // the jackal: a long head, two tall ears
}
// ---- end biker club patches
export const HAIR_STYLES = ['spiky', 'short', 'buzz', 'bald', 'afro', 'long', 'wavy', 'pony', 'bun', 'braids', 'dreads', 'mohawk', 'slick', 'curly', 'bob'];
// the look system's variants (shared/look.js HAIR_STYLES), each drawn from a base style with its own touch (hairPrims):
// short back and sides (a faded crew cut), a side part, a quiff, a man bun, shoulder length, box braids with cuffs, big
// curls, a shaved side
const BASE_HAIR = { sides: 'fade', sidepart: 'slick', quiff: 'short', manbun: 'slick', shoulder: 'long', boxbraids: 'dreads', bigcurls: 'curlylong', shavedside: 'undercut', balding: 'short', flattop: 'short', pompadour: 'slick', puffs: 'twinbuns', lowpony: 'slick', emo: 'short', waves: 'buzz', fauxhawk: 'fade', locupdo: 'fade', receding: 'short', pincurls: 'bob' };   // (the last six: pass 2's, their shapes the polish pass's - PL.hair)
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
  const sf = PL && PL.rampSoft, key = (sf ? '~' : '') + (Array.isArray(c) ? c.join(',') : String(c || 'grey'));
  let R = RC.get(key);
  if (R) return R;
  const k0 = sf ? key.slice(1) : key, rgb = Array.isArray(c) ? c : hexRgb(NAMED[k0] || (k0[0] === '#' ? k0 : NAMED.grey)), l = rgbHsl(rgb[0], rgb[1], rgb[2])[2];
  // (the polish pass, PL.rampSoft: a light colour's shadows turn less toward red and go less dark - a yellow shirt's
  // were rust and dark red, a white one's dusty rose: stains at the game's size, and a brown arm's own colours)
  if (sf && l > 0.42) R = l > 0.8 ? hramp(rgb, 5, 4, 0.4, 0, 0.3 * sf) : hramp(rgb, 5, 3, 0.62 - (1 - sf) * 0.16, 0.28, 0.32 * sf, 0.1);
  else R = l < 0.17 ? hramp(rgb, 5, 2, 0.45, 0.26, 0.2, 0.04) : l > 0.8 ? hramp(rgb, 5, 4, 0.48, 0, 0.3) : hramp(rgb, 5, 3, 0.62, 0.28, 0.32, 0.1);
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
// close up (render opt.res > 1): a ramp with a step between each two of its own, so light turns round a form in finer
// steps (kept per ramp)
const FINE = new WeakMap();
function fine(R) {
  let F = FINE.get(R);
  if (F) return F;
  F = [];
  for (let i = 0; i < R.length; i++) { F.push(R[i]); if (i < R.length - 1) F.push([0, 1, 2].map((j) => Math.round((R[i][j] + R[i + 1][j]) / 2))); }
  FINE.set(R, F);
  return F;
}
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
  // Proportions, third pass (the owner, 2026-10-09 07:10: "make it match ... the concepts"): C1 and CC9 shrunk to the
  // game's size (about 24 art pixels tall) read as about 3 heads with the hair - a big head and big hair, a chunky body,
  // short sturdy legs, thick arms and big hands - the SNES way of keeping a face and a haircut readable at that size. The
  // second pass's 3.7 heads (a small head on long legs) shrank the face and the hair to a few pixels. So: the head 1.36x,
  // the legs 0.88x, the arms a little shorter with them, the limbs 1.2x as thick, the body 1.08x as wide. Shoulders and
  // hips by base and build as before: a man's taper from the shoulders, a woman's waist and hips.
  const [HK, LK, AK, TK, WK] = PL ? PL.K : [1.36, 0.88, 0.94, 1.2, 1.08];
  const D = {
    fem, h, w, lm, mu, belly: bel,
    ank: 3.1, shin: 8.2 * h * LK, thigh: 8.2 * h * LK, hipX: 3.4 * w * (fem ? 1.12 : 1),
    pelR: [6.4 * w * (fem ? 1.12 : 1) * WK, 4.6 * w, 4.6], waistR: [(6.7 * w * (fem ? 0.8 : 0.97) + bel * 1.4) * WK, 4.7 * w + bel * 1.2, 5.1], waistUp: 4.5 * h,
    chestR: [8.4 * w * (1 + mu * 0.1) * (fem ? 0.94 : 1.02) * WK, 5.3 * w * (1 + mu * 0.08), 6.6 * h], chestUp: 9.4 * h,
    shX: 8.3 * w * (1 + mu * 0.1) * (fem ? 0.95 : 1.03) * WK, shUp: 13.6 * h, shBar: 3.5 * w * (1 + mu * 0.08), neckUp: 15.8 * h, neckR: 2.0 * w * (1 + mu * 0.25),
    head: (fem ? [5.5, 5.5, 5.8] : [5.72, 5.68, 6.03]).map((v, i) => v * HK * (A.headK || 1) * (FACE_SHAPE[A.face?.shape | 0] || FACE_SHAPE[0])[i]), headUp: 5.8 * HK * (A.headK || 1),
    jawW: (FACE_SHAPE[A.face?.shape | 0] || FACE_SHAPE[0])[3], age: A.age | 0,
    upper: 8.8 * h * AK, fore: 7.4 * h * AK, armR: [2.95 * lm * (1 + mu * 0.2) * TK, 2.55 * lm * (1 + mu * 0.12) * TK], foreR: [2.5 * lm * (1 + mu * 0.15) * TK, 2.0 * lm * TK], fist: 2.6 * lm * (fem ? 0.93 : 1) * TK,
    thighR: [3.7 * lm * (fem ? 1.06 : 1) * TK, 3.0 * lm * TK], shinR: [2.85 * lm * TK, 2.3 * lm * TK], foot: fem ? [2.45, 4.3, 2.15] : [2.9, 4.95, 2.5],
  };
  D.pelZ = D.ank + (D.shin + D.thigh) * 0.985 + 1.0;
  D.reach = D.upper + D.fore + 1.2;
  if (PL) PL.dims(D, A, b);
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
  P.gait = G; P.gaitY = ys; P.ph = ph;
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
// ---- lights to carry and felling trees (#358, #359): the axe swung like a sledge, the lantern carried by its bail ----
Object.assign(ICLS, { axe: 'big', lantern: 'bill', pickaxe: 'big', phoneSelfie: 'phoneup' });   // (pickaxe: a miner's - server activities.js)
ITEMS.phoneSelfie = ITEMS.phoneUp;   // (a selfie: PL.selfie's hold)
// ---- end ----
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
  else if (c === 'phoneup') { P.hR = vadd(S.chest, mv(S.SP, [1.2, 8.8, 7.8])); P.hL = vadd(S.chest, mv(S.SP, [-0.9, 8.6, 7.4])); setItem(P, kind, [0, 0, 1], [0, 1, 0]); P.elR = [1, -0.2, -0.4]; P.elL = [-1, -0.2, -0.4]; if (PL && PL.selfie && kind === 'phoneSelfie') PL.selfie(P, (x, y, z) => vadd(S.chest, mv(S.SP, [x, y, z]))); }
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
  if (MOTO_POSES.has(pose)) return rigMoto(rig(D, A, 'ride', f, null, null), pose);   // (motorcycle riders, task #366)
  if (pose === 'hood') return rigHood(D, rig(D, A, 'downF', 0, null, null));
  const P = base(D), c = kind ? ICLS[kind] : null;
  if (GAITS2[pose]) { GAITS2[pose](D, P, f, kind, acc); return P; }   // (the city's people, at the end)
  if (pose === 'idle') {
    // standing: the breath fills the chest only (P.calm), never the head; 2, 3: a glance aside (peds.js idleFrame)
    P.calm = 1;
    P.breath = f === 1 ? 0.5 : 0;
    if (f === 2 || f === 3) P.headYaw = f === 2 ? 0.55 : -0.55;
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
  } else if (pose === 'pushup') {
    // push-ups (server workout.js): face down up on straight arms (f 0), then the chest lowered to the ground (f 1) -
    // heels to head in a line
    P.acc = false; P.ground = true; P.lean = 0; P.headPitch = -0.3;
    P.root = rx(Math.PI / 2 - (f ? 0.12 : 0.36));
    P.fL = [-D.hipX + 0.6, 1.2, D.ank]; P.fR = [D.hipX - 0.6, 1.2, D.ank];
    P.hands = (S) => { P.hL = vadd(S.shL, [-1.4, f ? 4.2 : 8.4, 1.2]); P.hR = vadd(S.shR, [1.4, f ? 4.2 : 8.4, 1.2]); P.elL = [-1, f ? 0.5 : 0, 0.2]; P.elR = [1, f ? 0.5 : 0, 0.2]; P.openL = P.openR = 1; };
  } else if (pose === 'situp') {
    // sit-ups (server workout.js): flat on the back, knees up, hands behind the head (f 0); curled up to the knees (f 1)
    P.acc = false; P.headPitch = f ? 0.45 : 0.1;
    P.fL = [-D.hipX - 0.6, 8.4, D.ank]; P.fR = [D.hipX + 0.6, 8.4, D.ank]; P.kneeL = [-0.25, 0.4, 1]; P.kneeR = [0.25, 0.4, 1];
    if (f) { P.pel = [0, -0.6, SEATS.sitlow / CA + 3.7]; P.lean = 0.62; }
    else { P.ground = true; P.root = [-1, 0, 0, 0, 0, 1, 0, 1, 0]; P.lean = 0; P.fL = [-D.hipX - 0.6, 7.6, D.ank + 6.2]; P.fR = [D.hipX + 0.6, 7.6, D.ank + 6.2]; }
    P.hands = (S) => { P.hL = vadd(S.shL, [0.6, -2.4, 6.4]); P.hR = vadd(S.shR, [-0.6, -2.4, 6.4]); P.elL = [-1, 0.6, 0.2]; P.elR = [1, 0.6, 0.2]; };
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
  } else if (pose === 'ride' || pose === 'pedal' || pose === 'sit' || pose === 'drive' || pose === 'sitlow' || pose === 'cartsit' || pose === 'saddle') {
    const seat = SEATS[pose] / CA;
    P.acc = false; P.pel = [0, pose === 'sit' || pose === 'sitlow' ? -0.6 : -1.6, seat + 3.7];
    if (pose === 'saddle') {   // astride a horse: the knees out round its barrel, the feet down in the stirrups, the hands low on the reins
      P.lean = 0.2; P.headPitch = -0.1;
      P.fL = [-9.4, 1.6, seat - 11.5]; P.fR = [9.4, 1.6, seat - 11.5]; P.kneeL = [-1, 0.5, 0.15]; P.kneeR = [1, 0.5, 0.15];
      P.hands = (S) => { P.hL = [-2.6, 9.6, seat + 7.4]; P.hR = [2.6, 9.6, seat + 7.4]; P.elL = [-1, -0.2, -0.3]; P.elR = [1, -0.2, -0.3]; };
    } else if (pose === 'ride') {
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
    } else if (pose === 'cartsit') {   // in a shopping cart's basket (shared/vehicles.js cart): knees up, hands on the rims (0) - or both arms up, whooping (1: CC02)
      P.lean = f ? -0.14 : -0.06; P.headPitch = f ? -0.22 : -0.06;
      P.fL = [-D.hipX - 0.6, 6.4, seat + D.ank - 2.6]; P.fR = [D.hipX + 0.6, 6.2, seat + D.ank - 2.6]; P.kneeL = [-0.2, 0.5, 1]; P.kneeR = [0.2, 0.5, 1];
      P.hands = (S) => {
        if (f) { P.hL = vadd(S.shL, [-3.2, 1.6, 12.4]); P.hR = vadd(S.shR, [3.4, 1.2, 12.8]); P.elL = [-1, 0, 0.2]; P.elR = [1, 0, 0.2]; P.openL = P.openR = 1; }
        else { P.hL = [-6.4, 2.6, seat + 8.6]; P.hR = [6.4, 2.6, seat + 8.6]; P.elL = [-1, -0.2, -0.2]; P.elR = [1, -0.2, -0.2]; }
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
  else if (acc === 'purse' && D.hold === 2) { P.hR = vadd(S.chest, mv(S.SP, [5.0, 10.4, -8.4])); P.elR = [1, -0.6, -0.5]; }   // (a ball on the palm, out in front of the hip)
  else if (acc === 'purse' && D.hold) { P.hR = vadd(S.chest, mv(S.SP, [3.4, 5.6, -4.4])); P.elR = [1, -0.5, -0.5]; }   // (the forearm across the body, the thing held to the chest: it shows from the front)
  else if (acc === 'briefcase' || acc === 'purse') { if (!P.hR || acc === 'briefcase') P.hR = vadd(S.shR, [2.0, 1.2, -r * 0.95]); }
  else if (acc === 'shopping') { P.hR = vadd(S.shR, [2.4, 1.0, -r * 0.94]); P.hL = vadd(S.shL, [-2.4, 1.0, -r * 0.94]); }
}

// ---- solving the rig ------------------------------------------------------------------------------------------------
// the camera's pull on the head: chin up a touch, and in side views a quarter turn toward the viewer
function headFrame(S, P, cam) { return mmul(S.SP, mmul(rz(P.headYaw + cam), rx(P.headPitch - P.lean * 0.75 - 0.16))); }
function spine(D, P) {
  const PF = rz(P.pelYaw), SP = mmul(PF, mmul(rz(P.twist), mmul(rx(P.lean), ry(P.tilt)))), SH = mmul(PF, mmul(rz(P.twist * 0.5), rx(P.lean * 0.5)));
  const pel = P.pel, at = (M, v) => vadd(pel, mv(M, v)), b = P.breath, cb = P.calm ? b : b * 0.3, sb = P.calm ? 0 : b, nb = sb;
  const S = {
    PF, SP, SH, pel, waist: at(SH, [0, 0.15, D.waistUp]), chest: at(SP, [0, 0, D.chestUp + cb]),
    shL: at(SP, [-D.shX, -0.4, D.shUp + sb]), shR: at(SP, [D.shX, -0.4, D.shUp + sb]), neck: at(SP, [0, 0.2, D.neckUp + nb]),
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
  flannel: { sl: 1, check: 1, open: 0.16, inner: 'white', cuff: 1 }, openshirt: { sl: 1, open: 0.2, collar: 1, cuff: 1 }, layertee: { sl: 1, layer: 0.45 },   // (an open shirt over a tee or a bare chest; a tee over a long sleeve: the sleeve past `layer` is the trim's)
  hawaiian: { sl: 0.45, floral: 1, open: 0.1, collar: 1 },
  vest: { sl: 0.45, vest: 1 }, hivis: { sl: 1, vest: 1, hivis: 1 }, uniform: { sl: 0.5, collar: 1, placket: 1, badge: 1, pockets: 1, tuck: 1, duty: 1 },
  tactical: { sl: 1, plates: 1, tuck: 1, duty: 1, cuff: 1 }, scrubs: { sl: 0.45, vneck: 1 }, apron: { sl: 0.45, apron: 1 }, overalls: { sl: 0.45, bib: 1 },
  tracksuit: { sl: 1, zip: 1, stripe: 1, cuff: 1, hem: 1 }, jersey: { sl: 0.45, number: 1 }, coat: { sl: 1, open: 0.18, long: 1, cuff: 1 },
  cardigan: { sl: 1, open: 0.2, buttons: 1, cuff: 1 }, dress: { sl: 0, tank: 1, dress: 1 }, fur: { sl: 1, open: 0.24, long: 1, fur: 1 },
  none: { sl: 0, bare: 1 }, bikini: { sl: 0, bikini: 1 }, swimsuit: { sl: 0, tank: 1, swimsuit: 1 }, towel: { sl: 0, towel: 1 },
  // the look system's (shared/look.js)
  longsleeve: { sl: 1, cuff: 1 }, blouse: { sl: 1, collar: 1, placket: 1, cuff: 1 }, sweater: { sl: 1, cuff: 1, hem: 1, knit: 1 }, turtleneck: { sl: 1, cuff: 1, turtle: 1, knit: 1 },
  crop: { sl: 0.45, crop: 1 }, tube: { sl: 0, tank: 1, tube: 1 }, corset: { sl: 0, tank: 1, lace: 1 }, bra: { sl: 0, bikini: 1 }, under: { sl: 0.45 },
  blazer: { sl: 1, open: 0.22, lapel: 1, cuff: 1 }, ziphoodie: { sl: 1, hood: 1, open: 0.09, zip: 1, cuff: 1, strings: 1 }, gown: { sl: 0, tank: 1, dress: 1, gown: 1 },
  // the police's (CC5): the dress uniform (gold buttons, shoulder boards and cuffs; the shirt and tie at the collar), a
  // tactical vest worn over the uniform shirt (the K9 handler's)
  dressuni: { sl: 1, open: 0.16, tie: 1, collar: 1, tuck: 1, cuff: 1, badge: 1, dressuni: 1, inner: 'white' }, kevlar: { sl: 0.5, plates: 1, tuck: 1, duty: 1, badge: 1 },
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
  Q.zs = (Q.Z - TF.p[2]) - (Q.Y - TF.p[1]) * (SA / CA);   // (its height over the pelvis centre as the screen shows it - a point nearer the camera lies lower: a hem level on the screen, W.pel)
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
  // (the concepts' CB4, 11-20: a circle beard - the moustache joined to the chin's tuft round the mouth; a horseshoe - the
  // moustache run down to the jaw each side; a walrus, heavy over the mouth; a pencil line; a fu manchu, thin tails past the chin)
};
// a living statue (the buskers, Shared-9: server/systems/personas.js BUSKS statue): every colour of the look bronze - the
// skin, the clothes, the hat, the hair - so it reads as a cast figure on its crate
const BRONZE_SKIN = cloth('#a07a44'), BRONZE = ['#8a6a3a', '#7a5a30', '#9a7844', '#6e5028'];
function statueApp(A) {
  const re = (o, k) => (o ? { ...o, color: BRONZE[k], color2: BRONZE[(k + 1) % 4], inner: BRONZE[(k + 2) % 4], trim: BRONZE[(k + 3) % 4], tie: BRONZE[3], sleeve: o.sleeve ? BRONZE[k] : o.sleeve, pattern: null } : o);
  return { ...A, bronze: true, top: re(A.top, 0), bottom: re(A.bottom, 1), hat: re(A.hat, 2), shoes: BRONZE[3], shoeTrim: BRONZE[2], hair: { ...(A.hair || {}), color: BRONZE[0] }, chain: null, jewel: null, glassColor: BRONZE[3], bagColor: BRONZE[1], backColor: BRONZE[1], tattoo: 0 };
}
// The founder's Dead Baron look (server/founder.js; game/peds.js app.fd)
export const FOUNDER = Object.freeze({ seed: 7, skin: 0, founder: 1, fem: false, headK: 1.24, body: { h: 1.03, w: 0.74, limb: 0.5 }, hair: { style: 'bald', color: '#efe6cf' }, top: { kind: 'none' }, bottom: { kind: 'none' }, shoes: '#efe6cf', shoeKind: 'barefoot', glasses: 'round', glassForm: 'founder', glassColor: '#5c1f6e', lens: '#ff8ae6', fmask: { k: 'skull', c: '#f2ead6', t: '#2a2024' }, wings: '#2ec8e6' });
const BONE = [[70, 52, 72], [150, 136, 138], [208, 198, 180], [238, 232, 214], [253, 250, 240]], BONE_GAP = cloth('#241a2c'), WTIP = cloth('#d4f8ff'), WIN = cloth('#1683b0'), WCOV = cloth('#7ee6f6');
function boneTorso(Q, D, au, z, front, back) {
  const r0 = D.waistUp + 0.4, r1 = D.chestUp + 2.4;
  if (z > r1) return BONE;
  if (z < r0) return (front || back) && au < 0.14 ? BONE : BONE_GAP;
  if (au < (front ? 0.09 : 0.12) && (front || back)) return BONE;
  const t = (z - r0) / 2.2;
  if (t - Math.floor(t) > 0.5 || au > 0.9) return BONE_GAP;
  if (front && au < 0.24) Q.k -= 0.14;
  return BONE;
}
function founderWings(E, A, D, S, P) {
  const wc = cloth(A.wings), beat = P.gait ? Math.sin(2 * Math.PI * (P.ph || 0)) : 0, up = P.gait ? 0.5 + beat * 0.2 : 0.7;
  for (const s of [-1, 1]) {
    const root = vadd(S.chest, mv(S.SP, [s * D.chestR[0] * 0.45, -(D.chestR[1] + 1.3), 3.6]));
    const row = (rx, rz, dz, back, tilt, part, fn, scal) => {
      const F = mmul(S.SP, ry(-s * (up + tilt)));
      E(vadd(root, mv(F, [s * rx * 0.92, -back, dz])), F, [rx, 1.0, rz], GR.ACC, part, (Q) => fn(Q, (Q.l0 * s + 1) / 2), scal ? (a, b, c) => c > -0.96 + 0.5 * Math.abs(Math.sin((a + 1) * Math.PI * scal)) : null);
    };
    row(13.5, 4.4, -1.4, 0, 0.06, 'wing', (Q, t) => { if (t > 0.72) { Q.e = [120, 230, 255, 70]; return WTIP; } if (Math.abs(((t * 7) % 1) - 0.5) < 0.1 && Q.l2 < 0.3) Q.k -= 0.28; return wc; }, 3.5);
    row(9.5, 3.4, -2.2, -0.7, -0.08, 'wing2', (Q, t) => { if (Math.abs(((t * 6) % 1) - 0.5) < 0.12) Q.k -= 0.25; return WIN; }, 3);
    row(5.6, 2.6, 0.8, -1.3, 0.04, 'wing3', (Q) => { Q.k += 0.08; return WCOV; }, 2);
  }
}
function wardrobe(A, D, TF, seed) {
  if (A.carry === 'statue') A = statueApp(A);
  const tk = A.top?.kind || 'tee', bk = A.bottom?.kind || 'jeans';
  const T = PL && A.top?.zipped && TOP[tk] ? { ...TOP[tk], open: 0 } : TOP[tk] || TOP.tee, skin = A.founder ? BONE : A.bronze ? BRONZE_SKIN : SKIN[clamp(A.skin ?? 1, 0, SKIN.length - 1) | 0];
  const top = cloth(A.top?.color || (tk === 'bikini' || tk === 'swimsuit' ? 'teal' : tk === 'towel' ? 'white' : 'grey')), top2 = cloth(A.top?.color2 || 'white');
  const bot = cloth(A.bottom?.color || (bk === 'jeans' ? 'denim' : bk === 'trunks' || bk === 'bikini' ? (A.top?.color || 'red') : bk === 'towel' ? 'white' : 'black'));
  const shoeC = A.shoes || 'white', shoe = cloth(shoeC), sk = SHOE_OF(shoeC, A);
  const hairR = hairRamp(A.hair?.color ?? 0), inner = cloth(A.top?.inner || T.inner || A.top?.color2 || 'white'), tie = cloth(A.top?.tie || A.top?.color2 || 'navy');
  const hasInner = !!A.top && 'inner' in A.top, trim = cloth(A.top?.trim || 'white'), chainR = typeof A.chain === 'string' ? cloth(A.chain) : null;
  const tat = A.tattoo === true ? 3 : A.tattoo | 0, jw = A.jewel || null, jwR = jw ? cloth(jw.color || 'gold') : null;
  const fm = A.fmask ? A.fmask.k : null, fmC = fm ? cloth(A.fmask.c) : null, fmHead = fm === 'pig' || fm === 'alien';   // (CP2's masks)
  const W = { T, tk, bk, skin, top, top2, bot, shoe, sk, hairR, seed, bare: !A.founder && (bk === 'none' || (tk === 'none' && D.fem)) };
  const dark = (R) => R[Math.max(0, R.length - 4)], gold0 = cloth('gold'), white = cloth('white'), black = cloth('black'), silver = cloth('#c8ccd4');
  const gold = gold0, chainC = chainR || gold0;
  // the look system's patterns (shared/look.js PATTERNS), in model space so they run on across the seams: main colour,
  // trim colour; null where the base colour shows
  // At the game's scale a pattern is laid on the art grid (SPEC: 2 x 2 world px, anchored to the feet), so a stripe, a
  // check or a flower is whole pixels after the bake (it was a blur); close up (the creator) it runs in model space,
  // across the seams
  const patFn = (spec) => {
    const p = spec && spec.pattern;
    if (!p || !spec.trim || p === 'ripped' || p === 'quilt') return null;   // (the look system's always have a trim; the NPCs' old camo and florals keep their own)
    const a = cloth(spec.color || 'grey'), b = cloth(spec.trim || spec.color2 || 'white'), m = cloth(mixHex(spec.color || '#888888', spec.trim || '#ffffff', 0.5));
    // (the polish pass, the owner 11-20: "stripes ... not one horizontal line at any angle". Every third art-pixel row of the
    // SCREEN was a ruler laid across the chest and both sleeves, the same from every side. A stripe is a ring round the part
    // it is on: Q.sv is how far up the trunk, or down the sleeve or the leg, a pixel sits (set by the part's own colour
    // function). On the trunk that is its level on the screen plus a third (PL.stripeTilt) of what the high camera adds for a
    // point nearer to it: a stripe dips a little in front and leans a little on a body turned three quarters - all of it was
    // a sash from shoulder to hip. Down a sleeve or a leg it is the limb's own length: the rings turn with the arm and sit
    // at the arm's height, not the chest's. Decided a world pixel at a time it came out thick here, thin there and broken
    // between (the owner, 19:06): the pattern only says where a pixel sits (Q.sv) and in what color a stripe would be
    // (Q.sr); render() lays the stripes on the art grid, a whole art pixel thick, joined from one side to the other.)
    // (the concepts' two missing patterns, the polish pass's: dots - an art pixel of the trim on every second row, each row
    // set half a step from the last - and a pinstripe, every third column of art pixels. Both on the art grid itself.)
    if (p === 'dots' || p === 'pinstripe') return PL ? (Q) => { if (Q.res !== 1) return null; const cx = Math.floor(Math.round(Q.x) / 2), cy = Math.floor(Math.round(Q.y) / 2); return (p === 'dots' ? !(cy & 1) && (((cx + (cy & 2)) % 4) + 4) % 4 === 0 : ((cx % 3) + 3) % 3 === 0) ? b : null; } : null;
    if (p === 'stripes') return (Q) => { if (PL && PL.stripeN && Q.res === 1 && Q.sv !== undefined) { Q.sr = b; return null; }   // (the stripe itself is laid on the art grid - render(): one art pixel thick, unbroken)
      return (Q.res > 1 ? (Math.floor((Q.Z + 64) / 1.6) & 1) : (((Math.floor(Q.y / 2) % 3) + 3) % 3 === 0)) ? b : null; };
    if (p === 'check') return (Q) => { const i = Q.res > 1 ? Math.floor((Q.X + Q.Y + 128) / 2.1) : Math.floor(Q.x / 4), j = Q.res > 1 ? Math.floor((Q.Z + 64) / 2.1) : Math.floor(Q.y / 4); if ((i & 1) && (j & 1)) return b; if ((i + j) & 1) return m; return null; };
    if (p === 'floral') return (Q) => { const n = Q.res > 1 ? hash(Math.floor(Q.X / 1.5), Math.floor(Q.Z / 1.5) + Math.floor(Q.Y / 1.5) * 7, seed + 5) : hash(Math.floor(Q.x / 2), Math.floor(Q.y / 2), seed + 5); return n > 0.8 ? b : n < 0.08 ? m : null; };
    if (p === 'camo') { const d = cloth(mixHex(spec.color || '#888888', '#000000', 0.45)); return (Q) => { const n = Q.res > 1 ? hash(Math.floor(Q.X / 2.6), Math.floor(Q.Y / 2.6) + Math.floor(Q.Z / 2.2) * 7, seed + 31) : hash(Math.floor(Q.x / 4), Math.floor(Q.y / 4), seed + 31); return n < 0.24 ? b : n < 0.4 ? d : null; }; }
    if (p === 'tiedye') { const c3 = cloth(mixHex(spec.trim || '#ffffff', '#ff4fa0', 0.5)); return (Q) => { const X = Q.res > 1 ? Q.X : Math.floor(Q.x / 2) * 2, Y = Q.res > 1 ? Q.Y : 0, Z = Q.res > 1 ? Q.Z : -Math.floor(Q.y / 2) * 2.4; const t = Math.sin(X * 0.55 + Z * 0.42) + Math.sin(Y * 0.5 - Z * 0.66); return t > 0.7 ? b : t < -0.7 ? c3 : t > 0.1 && t < 0.3 ? m : null; }; }
    return null;
  };
  // the old flannel check and Hawaiian flowers, the same way
  const gridCheck = (Q, R) => { const a = Math.floor(Q.x / 4), b = Math.floor(Q.y / 4); if ((a + b) & 1) Q.k -= 0.2; return (a & 1) && (b & 1) ? dark(R) : null; };
  const topPat = patFn(A.top), botPat = patFn(A.bottom);
  const ink = [skin[0], skin[1], skin[1]].map((c) => [c[0] * 0.55, c[1] * 0.6, c[2] * 0.85].map(Math.round));
  const hiv = cloth('#e8ecea');
  const bag = A.carry === 'bag' || A.carry === 'purse';
  const sleeve = A.top?.sleeve === 'skin' ? skin : A.top?.sleeve ? cloth(A.top.sleeve) : T.vest ? (T.hivis ? cloth(A.top?.color2 || 'charcoal') : top2) : T.bib || T.apron ? top2 : top;
  // woodland camouflage (the army: game/peds.js): blotches in model space, so they run on across the seams
  const CAMO = A.top?.pattern === 'camo' || A.bottom?.pattern === 'camo' ? [cloth('#39432a'), cloth('#76704c'), cloth('#25261e')] : null;
  const camo = (Q) => { const n = hash(Math.floor(Q.X / 2.6), Math.floor(Q.Y / 2.6) + Math.floor(Q.Z / 2.2) * 7, seed + 31); return n < 0.22 ? CAMO[0] : n < 0.36 ? CAMO[1] : n > 0.86 ? CAMO[2] : null; };
  // ---- torso (chest, waist, shoulder bar, belly, bust, the shirt part of the pelvis)
  const HEMZ = T.tuck ? 2.4 : T.bare || T.bikini || T.towel || T.crop ? 9 : T.tank ? 0.4 : -0.9;   // (the shirt's hem, up from the hips)
  // (the polish pass: is this pixel under the hem? The hem is a line level on the screen, and on the art grid: it runs along
  // the bottom of the art pixel row it falls in - cut at the world's pixels, a row of art pixels was shirt in one and
  // trousers in the next, as each one's four pixels fell)
  const underHem = (Q) => { const y = Math.round(Q.y); return Math.floor(y / 2) > Math.floor((y + CA * (Q.zs - HEMZ)) / 2); };
  W.torso = (Q) => {
    tco(TF, Q);
    const u = Q.u, au = Math.abs(u), f = Q.f, z = Q.z, front = f > 0.05, back = f < -0.35;
    if (A.founder) return boneTorso(Q, D, au, z, front, back);
    // (the polish pass, the owner 11-20: "the shirts form this V shape at the bottom". W.pel cuts the hem level on the screen;
    // the waist stands forward of the hips, so from the high camera its lowest pixels lie under that line - a tab of shirt
    // two art pixels wide hanging over the trousers. Under the hem's line on the screen, the waist is the trousers' too)
    if (PL && Q.res === 1 && HEMZ < 2 && Q.part !== 'bust' && z < HEMZ + 4.5 && !(T.dress || T.swimsuit || T.long || T.towel || T.bib) && underHem(Q)) return W.pel(Q);
    if (W.bare && tk === 'none' && D.fem) return skin;
    if (T.crop && z < D.waistUp + 0.9) return skin;                                              // a bare midriff
    if (T.tube && z > D.chestUp + 1.4) return (tat & 8) && front && au > 0.35 && hash(Math.floor(u * 9), Math.floor(z), seed + 3) > 0.6 ? ink : skin;
    if (T.bare) { if (front && z > D.chestUp - 2.6 && z < D.chestUp - 1.5 && au < 0.7) Q.k -= 0.12; if (A.chain && front && Math.abs(z - (D.shUp - 1.6 - (1 - u * u) * 2.8)) < 0.45 && au < 0.6) { Q.gloss = 1; return chainC; } if ((tat & 8) && au > 0.25 && au < 0.75 && z > D.chestUp - 1 && hash(Math.floor(u * 10), Math.floor(z * 0.9), seed + 3) > 0.62) return ink; return skin; }
    if (T.towel) { if (z < D.chestUp + 1.6) { if (front && Math.abs(u - 0.35) < 0.08 && z > D.chestUp - 1) Q.k -= 0.25; return top; } return skin; }
    if (T.bikini) { if (Q.part === 'bust' || (z > D.chestUp - 0.6 && z < D.chestUp + 1.5 && !(front && au < 0.08))) return top; if (z > D.chestUp && au > 0.26 && au < 0.38) return top; return skin; }
    // (the polish pass, the owner 11-20: a strap is a whole art pixel wide and joins the top - at a third of one it broke into
    // dots over a row of skin)
    const sA = PL ? 0.22 : 0.33, sB = PL ? (f < 0 ? 0.95 : 0.66) : 0.5;   // (behind, the top's back runs out to the shoulders: a strap's edge on the last art pixel beside the hair was white on one side and skin on the other)
    if ((T.tank || T.swimsuit) && z > D.shUp - 1.7 && au > sA) return au < sB ? (T.dress ? top : top) : skin;   // bare shoulders, straps
    if (T.tank && front && z > D.chestUp + 2.9 - (sA - au) * 3 && au < sA) return skin;                       // scoop neckline
    if (T.vneck && front && z > D.chestUp + 3.4 - (0.32 - au) * 8 && au < 0.32) return skin;
    // (the polish pass, the owner 11-20: "necklaces a pixel more", "bow tie, stethoscope and other one-pixel details get lost",
    // a lanyard "all the way round". A chain is a whole art pixel thick and a little wider; a pendant two pixels; a lanyard
    // and a stethoscope hang lower - a card on the one, a silver disc on the other; a lanyard shows on the collar from behind.)
    if (PL && A.chain && !T.open) {   // (laid on the art grid: peoplepolish.js dress(), NECK)
    } else if (A.chain && front && !T.open && au < 0.36) {   // (from the neck's sides down to a U on the chest: a V of three art pixels at the game's size)
      const cz = D.shUp - 0.6 - (1 - (u / 0.36) * (u / 0.36)) * 3;
      if (Math.abs(z - cz) < (jw && jw.chain === 2 ? 0.8 : 0.5) || (jw && jw.pendant && au < 0.07 && z < cz && z > cz - 1.6)) { Q.gloss = 1; return chainC; }
    }
    let R = top;
    // ---- a biker club's back patch (NP4, task #366): the top rocker (the club's name, a curved band), the emblem in a round
    // field in the middle, the bottom rocker - in the club's colours (shared/clubs.js)
    if (T.vest && back && A.top?.patch !== undefined) { const pc = clubPatch(A.top.patch, u, z, D); if (pc) return cloth(pc); }
    // ---- end club patch
    // straps of a backpack or a bag across the chest
    if (!PL && (A.back === 'backpack' || A.back === 'guitarcase') && Math.abs(au - 0.5) < 0.09 && z > D.waistUp && (front || back)) return black;   // (the polish pass lays straps on the art grid: peoplepolish.js NECK)
    if (A.rig && Math.abs(au - 0.42) < 0.08 && z > D.chestUp && (front || back)) return cloth(A.rig);
    if (bag && !(PL && A.prop) && front && Math.abs(-u * 0.9 + (z - D.chestUp) / 6 - 0.15) < 0.11) return cloth(A.bagBig && A.bagColor ? A.bagColor : 'leather');   // (a tote's or a messenger's strap its own)
    if (T.vest || T.bib || T.apron) {
      // a panel over a shirt: the shirt shows round the arms and the collar
      const panel = T.bib ? (front && au < 0.55 && z < D.chestUp + 2.6) || (au > 0.25 && au < 0.42 && z > D.chestUp && !(PL && A.top.onestrap && u > 0)) || z < D.waistUp - 1 || (PL && back && ((au > 0.2 && au < 0.42 && !(A.top.onestrap && u > 0)) || (au <= 0.2 && z < D.waistUp + 2.4))) :   // (the polish pass, the owner 11-20: "bib overalls don't connect at the back" - the straps run on down the back to a low panel over the waist)
         T.apron ? front && au < 0.62 && z < D.chestUp + 2.2 : !(Q.part === 'shb' && au > 0.62) && !(front && au < 0.14 && z > D.chestUp);
      if (!panel) {
        if (T.apron && au < 0.4 && z > D.chestUp + 2.2 && front && Math.abs(au - 0.3) < 0.06) return dark(top);   // (the neck strap)
        if (A.top?.bareUnder) return skin;                                   // (worn over nothing much: bare shoulders)
        if (A.top?.innerKind === 'flannel') { const g = gridCheck(Q, top2); if (g) return g; }   // (a flannel shirt under it)
        return top2;
      }
      if (T.hivis && (Math.abs(z - (D.chestUp - 1.2)) < 0.6 || Math.abs(z - (D.waistUp + 0.4)) < 0.6 || (au > 0.3 && au < 0.44 && z > D.chestUp))) { Q.k += 0.1; return hiv; }
      if (A.top?.pattern === 'quilt' && Math.round(z * 0.55) % 2 === 0 && Math.abs(z * 0.55 - Math.round(z * 0.55)) < 0.12) Q.k -= 0.3;
      if (T.vest && !T.hivis && front && au < 0.1 && z > D.waistUp - 1 && Math.round(z) % 2 === 0) return gold;     // waistcoat buttons
      R = top;
    }
    if (T.dressuni) {
      if (Q.part === 'shb' && au > 0.62) { Q.gloss = 1; return gold; }                       // (shoulder boards)
      if (front && au < 0.05 && z > D.waistUp - 2.4 && z < D.chestUp + 1.6 && (Math.round(z * 0.8) & 1)) { Q.gloss = 1; return gold; }   // (buttons)
    }
    if (T.open && front && au < T.open + (T.lapel && z > D.chestUp ? (z - D.chestUp) * 0.06 : 0) && (!T.dressuni || z > D.chestUp + 1.4)) {
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
    if (T.check && !topPat) { if (Q.res > 1) { const a = Math.floor((u + 2) * 3.2), b = Math.floor(z / 1.7); if ((a + b) & 1) Q.k -= 0.22; if ((a & 1) && (b & 1)) return dark(top); } else { const g = gridCheck(Q, top); if (g) return g; } }
    if (T.floral && !topPat && (Q.res > 1 ? hash(Math.round(u * 6), Math.round(z), 7) : hash(Math.floor(Q.x / 2), Math.floor(Q.y / 2), 7)) > 0.78) return top2;
    if (T.quilt && Math.abs(z * 0.5 - Math.round(z * 0.5)) < 0.1) Q.k -= 0.3;
    // the people of the wilds' vests (shared/lookcore.js, Nature-C4): a field vest's rows of pockets down the front; a life
    // vest's straps across it, in the trim colour
    if (A.top?.pockets && front && au > 0.2 && au < 0.64 && z > D.waistUp - 1.2 && z < D.chestUp + 1.2) { const r2 = (z - D.waistUp + 1.2) % 2.3; if (r2 < 0.35) Q.k -= 0.3; else if (Math.abs(au - 0.42) > 0.19) Q.k -= 0.12; }
    if (A.top?.pfd && (front || back) && (Math.abs(z - D.waistUp - 0.6) < 0.4 || Math.abs(z - D.chestUp + 0.4) < 0.4)) return trim;
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
    if (!PL && T.number && (front || back) && au < 0.22 && z > D.waistUp && z < D.chestUp + 1.4) { const gx = Math.floor((u + 0.22) * 14), gy = Math.floor((z - D.waistUp) * 1.4); if ((gx === 1 || gy % 3 === 0 || (gy > 3 ? gx === 5 : gx === 0))) return white; }
    if (T.fur && z > D.shUp - 1.2) { Q.k += hash(Math.round(Q.X * 2), Math.round(Q.Z * 2), 3) * 0.4 - 0.1; return cloth('#efe6d4'); }
    if (T.hem && z < D.waistUp - 2.6 + (tk === 'jacket' ? 0 : 0.4)) Q.k -= 0.15;
    if (!T.bare && au > 0.78 && z > D.waistUp - 1 && z < D.chestUp + 1.5) Q.k -= 0.12;                 // the fold under the arm
    if (!T.bare && !T.long && z > D.waistUp - 2.2 && z < D.waistUp - 0.6 && (Math.floor((u + 2) * 4.5) & 1)) Q.k -= 0.08;   // bunched over the belt
    if (T.gloss) Q.gloss = T.gloss;
    if (T.swimsuit && z < D.waistUp - 1) R = top;
    if (R === top && topPat) { Q.sv = Q.zs + (z - Q.zs) * (PL ? PL.stripeTilt || 0 : 0) + 3.0; return topPat(Q) || R; }
    if (R === top && A.top?.pattern === 'camo') return camo(Q) || R;
    return R;
  };
  // the pelvis: the shirt's hem, a belt, then the trousers (or the dress, a coat's tails, swimwear)
  W.pel = (Q) => {
    tco(TF, Q);
    const z = Q.z, front = Q.f > 0.05, au = Math.abs(Q.u);
    if (T.dress || T.swimsuit || T.long || (T.towel && bk !== 'none')) { if (T.swimsuit && z < -0.3 && au > 0.42) return skin; Q.sv = Q.zs + (z - Q.zs) * (PL ? PL.stripeTilt || 0 : 0) + 3.0; return (topPat && topPat(Q)) || top; }
    if (T.bib) return top;
    const hemZ = HEMZ;
    // (the polish pass, the owner 11-20: a hem is level on the screen. Level in the world it was a V from the high camera - low
    // in front, up at the hips - on every untucked shirt)
    if (PL && Q.res === 1 && !T.tuck ? !underHem(Q) : z > hemZ + (T.tuck ? 0.9 : 0)) return W.torso(Q);
    if (T.tuck && z > hemZ - 0.2) { if (front && au < 0.12) { Q.gloss = 1; return T.duty ? silver : gold; } return T.duty ? black : cloth('#3a2a22'); }
    if (A.founder) return z > 1.6 ? (au < 0.12 ? BONE : BONE_GAP) : (front && au < 0.16 && z < 0.4) || au > 0.86 ? BONE_GAP : BONE;
    if (bk === 'none') return skin;
    if (bk === 'bikini') return z > 1.3 || (au > 0.5 && z > -1.5) ? skin : bot;
    if (bk === 'trunks' && z > 2.4) return skin;
    if (bk === 'skirt' || bk === 'towel') return bot;
    if (bk === 'jeans' && front && Math.abs(au - 0.52) < 0.05 && z > -0.5) Q.k -= 0.2;   // pocket seams
    if (A.beltBag && front && z > 0.6 && z < 1.6) return cloth('#2a2a2e');            // the belt bag's strap
    Q.sv = Q.zs + (z - Q.zs) * (PL ? PL.stripeTilt || 0 : 0) + 3.0; return (botPat && botPat(Q)) || bot;
  };
  W.neck = (Q) => {
    if (T.turtle) return top;
    if (fm === 'gaiter' || fm === 'gas' || fmHead) return fmC;
    if (jw && jw.choker && Q.l0 > 0.3 && Q.l0 < 0.62) { if (jw.studs && (Math.round(Q.l1 * 8 + Q.l2 * 8) & 1)) { Q.gloss = 1; return cloth(jw.trim || 'silver'); } return jwR; }
    if ((tat & 4) && hash(Math.floor(Q.l0 * 6), Math.floor((Q.l1 + 2) * 3), seed + 4) > 0.55) return ink;
    return skin;
  };
  W.ear = (Q) => {
    if (fmHead) return fmC;
    if (Q.l2 < (jw && jw.ear === 2 ? -0.22 : -0.5) && ((jw && jw.ear) || ((A.piercings | 0) & 1))) { Q.gloss = 1; return jw && jw.ear ? jwR : silver; }   // earrings (pearl drops longer)
    if (jw && jw.cuff && Q.l2 > 0.3) { Q.gloss = 1; return jwR; }   // ear cuffs, up the rim
    if (Math.abs(Q.l0) > 0.45 && Math.abs(Q.l1) < 0.5 && Math.abs(Q.l2) < 0.55) Q.k -= 0.3; return skin;
  };
  W.skinM = () => skin;
  // arms: sleeves to `sl` of the arm's length, then skin; cuffs; gloves; tattoos on bare skin
  const slv = (T.bib || T.apron || tk === 'kevlar' || (PL && A.top?.draped)) && A.top?.innerKind && TOP[A.top.innerKind] ? (A.top.bareUnder ? 0 : TOP[A.top.innerKind].sl) : T.sl, gl = A.gloves ? cloth(A.gloves) : null;   // (an apron or bib overalls worn over a top: the top's sleeves)
  W.arm = (Q) => {
    const along = Q.part === 'ua' ? Q.l0 * 0.5 : 0.5 + Q.l0 * 0.5;
    if (along < slv - (slv >= 1 ? 0.06 : 0)) {
      if (T.layer && along > T.layer) return top2;
      if (T.cuff && along > slv - 0.16) Q.k -= 0.14;
      if (Math.abs(along - 0.5) < 0.05 && Q.l2 < 0) Q.k -= 0.16;               // the elbow's crease
      if (T.stripe && Q.l1 > 0.55) return white;
      if (T.fur && along > 0.86) { Q.k += 0.15; return cloth('#efe6d4'); }
      if (T.hivis && Math.abs(along - 0.3) < 0.04) return hiv;
      if (A.top?.chevrons && Q.part === 'ua' && Q.l1 > 0.1 && ((along > 0.14 && along < 0.2) || (along > 0.24 && along < 0.3))) { Q.gloss = 0.6; return gold; }   // (a sergeant's chevrons: two gold bars at the game's size)
      if (T.dressuni && along > slv - 0.1) { Q.gloss = 0.8; return gold; }                  // (gold cuffs)
      if (T.check || ((T.bib || T.apron) && A.top?.innerKind === 'flannel')) { if (Q.res > 1) { const a = Math.floor(along * 9), b = Math.floor((Q.l2 + 1) * 1.6); if ((a + b) & 1) Q.k -= 0.22; } else { const g = gridCheck(Q, sleeve); if (g) return g; } }
      if (A.top?.varsity && sleeve === top) return trim;
      if (sleeve === top && topPat) { Q.sv = 4.9 - along * (D.upper + D.fore); return topPat(Q) || sleeve; }   // (rings down the sleeve: the first a little under the shoulder, so a short sleeve has one)
      if (sleeve === top && A.top?.pattern === 'camo') return camo(Q) || sleeve;
      return sleeve;
    }
    if (slv > 0 && slv < 1 && along < slv + 0.03) Q.k -= 0.18;           // the sleeve's shadow on the arm
    if (gl && along > 0.88) return gl;
    if (jw && jw.cuffband && Q.part === 'fa' && along > 0.78 && along < 0.9) return jwR;
    if (PL && jw && Q.part === 'fa' && ((jw.watch && Q.g === GR.ARML && along > 0.76 && along < 0.9) || (jw.bangles && along > 0.74 && along < 0.9))) { Q.gloss = 1; return jwR; }   // (the polish pass, the owner 11-20: a watch on one wrist, wrapping it; bracelets all the way round - a whole art pixel of the forearm, not two hairlines)
    if (!PL && jw && Q.part === 'fa' && ((jw.watch && along > 0.82 && along < 0.88) || (jw.bangles && ((along > 0.8 && along < 0.83) || (along > 0.85 && along < 0.88))))) { Q.gloss = 1; return jwR; }
    if (A.founder) { if (Math.abs(along - 0.5) < 0.06 || along > 0.93) Q.k -= 0.2; else if (Q.part === 'fa' && Math.abs(Q.l1) < 0.12) Q.k -= 0.32; return skin; }
    if ((tat & 1) && along > 0.25 && along < 0.85 && hash(Math.floor(along * 14), Math.floor((Q.l1 + 2) * 2.4), seed) > 0.55) return ink;
    return skin;
  };
  W.hand = () => gl || skin;
  // legs
  const legSkin = bk === 'none' || bk === 'bikini' || bk === 'skirt' || bk === 'towel' || T.dress || T.swimsuit || (T.towel && bk !== 'jeans' && bk !== 'pants');
  const sox = A.socks && !A.founder ? cloth(A.socks.color) : null;
  W.leg = (Q) => {
    const along = Q.part === 'th' ? Q.l0 * 0.5 : 0.5 + Q.l0 * 0.5, side = Q.l1 * Q.side;
    if (T.bib) return along > 0.94 ? dark(top) : top;
    // (the polish pass, the owner 11-20 17:44: "a random blue pixel here and there", "a random white pixel". The hem is a line
    // level on the screen (underHem), and a thigh's top stands out beside the hips over that line: at an angle an art pixel of
    // trousers in the shirt's side, and the shirt a row lower beside it. Over the hem's line a thigh is under the shirt too.)
    if (PL && Q.res === 1 && Q.part === 'th' && along < 0.3 && HEMZ < 2 && !(T.dress || T.swimsuit || T.long || T.towel || T.tuck) && !A.founder) { tco(TF, Q); if (!underHem(Q)) { const R = W.torso(Q); if (R !== skin || legSkin) return R; } }   // (...but never bare where the leg is clothed: the top's own bare places - an open front, a scooped side - are not the thigh's)
    if (A.founder) { if (Math.abs(along - 0.5) < 0.07) Q.k -= 0.22; return skin; }
    if (legSkin || (bk === 'shorts' && along > 0.33) || (bk === 'trunks' && along > 0.18)) {
      if (bk === 'shorts' && along < 0.37) Q.k -= 0.2;
      if (sox && along > A.socks.h) return sox;   // (the socks slot)
      if ((tat & 2) && along < 0.4 && side > 0.3 && hash(Math.floor(along * 16), Math.floor((Q.l2 + 2) * 2), seed + 1) > 0.6) return ink;
      return skin;
    }
    if (bk === 'track' && side > 0.82) return white;
    if (PL && A.bottom?.sidestripe && side > 0.8) return cloth(A.bottom.sidestripe);   // (a uniform trouser's stripe down the outside of the leg)
    if (bk === 'cargo' && side > 0.45 && along > 0.2 && along < 0.4) Q.k -= along > 0.37 || side < 0.52 ? 0.3 : 0.05;
    if (bk === 'jeans') { if (Math.abs(along - 0.5) < 0.1) Q.k += 0.08; if (Math.abs(side) > 0.9) Q.k -= 0.1; }
    // folds (SF/SM): a crease behind the knee and a lit fold over it, the hip crease, the stack at the ankle
    if (Math.abs(along - 0.5) < 0.07) Q.k += Q.l2 < -0.2 ? -0.2 : Q.l2 > 0.45 ? 0.07 : 0;
    if (Q.part === 'th' && along < 0.14 && Q.l2 > 0.1 && side < -0.1) Q.k -= 0.14;
    if (bk !== 'leggings' && along > 0.8 && along < 0.9 && ((Math.floor(along * 40) + (Q.l2 > 0 ? 1 : 0)) & 1)) Q.k -= 0.1;
    if (A.bottom?.pattern === 'ripped' && Math.abs(along - 0.5) < 0.04 && Q.l2 > 0.2) return skin;
    if (along > 0.93) Q.k -= 0.12;                                       // the trouser cuff
    if (tk === 'tactical' && Math.abs(along - 0.5) < 0.08 && Q.l2 > 0.3) return cloth('#30343a');   // knee pads
    if (tk === 'uniform' && side > 0.85) Q.k -= 0.18;
    if (botPat) { Q.sv = -along * (D.thigh + D.shin); return botPat(Q) || bot; }
    if (A.bottom?.pattern === 'camo') return camo(Q) || bot;
    return bot;
  };
  // shoes: sneakers (white rubber sole, laces), leather shoes, boots, heels, sandals, bare feet; CP4's: a sandal's straps
  // in its own colour (two, a flip-flop's thong, a slide's wide band), socks, a fur cuff, a buckled strap, gloss, a sole in
  // the trim colour (espadrilles, chunky soles), a check
  const sole = A.shoe_sole || A.shoe_chunky ? cloth(A.shoeTrim || '#c8a070') : sk === 'sneaker' ? cloth(A.shoeTrim && A.shoeTrim !== A.shoes ? A.shoeTrim : lum(shoe[3]) > 0.7 ? '#b8b4ae' : '#ece8e0') : sk === 'sandal' || sk === 'barefoot' ? skin : cloth('#2a2228');
  const socks = A.shoe_socks ? cloth('#ece8e0') : null, furC = A.shoe_fur ? cloth('#ece2cc') : null, shoePat = A.shoePat ? patFn({ pattern: A.shoePat, color: A.shoes, trim: A.shoeTrim }) : null;
  W.shoeKind = sk;
  W.shoe = (Q) => {
    if (sk === 'barefoot') return socks || skin;
    if (sk === 'sandal') {
      if (Q.l2 < -0.3) return shoe;
      if (PL && Q.res === 1) return socks || skin;   // (the polish pass: at the game's size a sandal is its sole under the foot - the straps were stray pixels on it; close up they're drawn)
      const st = A.shoe_strap | 0;
      return (st === 1 ? Math.abs(Q.l1 - 0.3) < 0.1 && Q.l2 > -0.1 : st === 2 ? Math.abs(Q.l1 - 0.05) < 0.32 && Q.l2 > -0.2 : Math.abs(Q.l1 - 0.25) < 0.12 || Math.abs(Q.l1 + 0.3) < 0.1) ? shoe : socks || skin;
    }
    if (Q.l2 < -0.32) return sole;
    if (furC && (Q.part === 'boot' ? Q.l0 > 0.7 : Q.l2 > 0.3 && Q.l1 < 0.2)) { Q.k += hash(Q.x, Q.y, 5) * 0.2 - 0.1; return furC; }
    if (A.shoe_buckle && Q.part === 'boot' && Math.abs(Q.l0 - 0.45) < 0.11) { if (Math.abs(Q.l1) > 0.55) { Q.gloss = 1; return silver; } Q.k -= 0.28; }
    if (sk === 'sneaker' && !(PL && Q.res === 1) && Q.l1 > 0.05 && Q.l1 < 0.6 && Math.abs(Q.l0) < 0.3 && Q.l2 > 0.25 && ((Math.round(Q.l1 * 8)) & 1)) return white;   // (laces: close up only under the polish pass - at the game's size they were a stray white pixel on the ankle)
    if (A.shoe_gloss) Q.gloss = 1;
    else if (sk === 'shoe' || sk === 'heel' || sk === 'boot') Q.gloss = 0.6;
    return (shoePat && shoePat(Q)) || shoe;
  };
  W.sole = () => (PL && sk === 'sandal' ? shoe : sole);   // (the polish pass: a sandal's sole shows round the foot)
  // head: skin, beard / stubble / moustache, a face bandana, a balaclava; CP2's masks (A.fmask): a pig's or an alien's
  // whole head, a clown's or a skull's face (the nose red, or a hole), a gas mask's rubber, a neck gaiter to the nose
  const bandana = A.bandana ? cloth(typeof A.bandana === 'string' ? A.bandana : 'red') : null, maskR = cloth(typeof A.mask === 'string' ? A.mask : '#24242a');
  W.head = (Q) => {
    const a = Q.l0, b = Q.l1, c = Q.l2;
    if (A.founder) { if (Q.part === 'nose') return BONE_GAP; if (Q.part === 'jaw' && b > 0.25) { if (Math.abs(c + 0.05) < 0.16) return BONE_GAP; if (c < -0.05 && c > -0.6 && Math.abs(a) < 0.62 && ((Q.x >> 1) & 1)) return BONE_GAP; } return skin; }
    if (fm) {
      if (fmHead) return fmC;
      if (fm === 'clown' || fm === 'skull') { if (Q.part === 'nose') return fm === 'clown' ? cloth(A.fmask.t) : dark(fmC); if (b > 0.2 && c < 0.62) return fmC; }
      else if (fm === 'gas') { if (Q.part !== 'head' || (b > 0.25 && c < 0.35) || Math.abs(c - 0.32) < 0.09) return fmC; }   // (the jaw and the nose under it: the jaw's and the nose's own coordinates)
      else if (fm === 'gaiter' && (Q.part !== 'head' || c < 0.02 + Math.abs(a) * 0.04)) return fmC;
    }
    if (A.mask) { if (b > 0.5 && c > -0.02 && c < 0.3 && Math.abs(a) < 0.62) return skin; if (A.maskTrim && c > 0.42 && c < 0.6) return cloth(A.maskTrim); return maskR; }
    if (A.medmask && b > 0.15 && c < -0.06 && c > -0.88 && Math.abs(a) < 0.9) { if (Math.abs(c + 0.4) < 0.04) Q.k -= 0.15; return cloth(A.medmask); }
    if (bandana && b > 0.05 && c < 0.0 + Math.abs(a) * 0.08 && c > -0.95) { if (b > 0.6 && Math.abs(a) < 0.08) Q.k -= 0.2; return bandana; }
    if (PL && PL.BST && PL.BST[A.beard]) { /* (the polish pass: a small picture in art pixels - peoplepolish.js masks()) */ }
    else if (A.beard && b > -0.3 && BEARD[A.beard]) { if (BEARD[A.beard](Math.abs(a), b, c)) return hairR; }
    else if (A.beard && b > -0.3) {
      const full = A.beard === 'full', stub = A.beard === 'stubble';
      const chin = c < -0.2 - (full ? 0 : 0.1) && (full || Math.abs(a) < 0.62 || c < -0.62);
      const mou = c > -0.4 && c < -0.2 && b > 0.72 && Math.abs(a) < 0.4;
      if (chin || (mou && !stub)) { if (stub || A.beard === 'short') return ((Q.x + Q.y) & 1) || c < -0.55 ? hairR : skin; return hairR; }
    }
    return skin;
  };
  const stubble = hairR.map((c, i) => c.map((v, j) => Math.round(v * 0.62 + skin[i][j] * 0.38)));
  // (at the game's size a buzz cut must still read as hair - a dark cap - and a fade's or an undercut's shaved sides as
  // skin under the hair on top: the plain stubble mix read as the same brown for all three)
  const buzzR = hairR.map((c, i) => c.map((v, j) => Math.round(v * 0.84 + skin[i][j] * 0.16))), shK = PL ? 0.62 : 0.36, shD = PL && lum(hairR[3]) > 0.45 ? 2 : 0, shavedR = hairR.map((c, i) => c.map((v, j) => Math.round(hairR[Math.max(0, i - shD)][j] * shK + skin[Math.max(0, i - (shD ? 1 : 0))][j] * (1 - shK))));   // (fair hair's stubble two tones down: at its own tone you couldn't tell the shaved part from the rest, the owner 11-20)   // (the polish pass: short hair is still mostly the hair's colour - at 0.36 a dark crop's sides were skin, and the hair on top a cap)
  W.hairM = (Q) => {
    // clumps: darker grooves radiating from the crown, a sheen band
    const az = Math.atan2(Q.l0, Q.l1), ex = A.hair?.style, st = BASE_HAIR[ex] || ex;
    if (ex === 'sidepart' && Q.part === 'hair' && Math.abs(Q.l0 + 0.36) < (Q.res > 1 ? 0.045 : 0.13) && Q.l1 > -0.2 && Q.l2 > 0.45) { if (Q.res > 1 || PL) { Q.k -= 0.4; return hairR; } return skin; }   // (the parting: a line of scalp, wide enough to be a whole art pixel - under the polish pass a shadow in the hair: the scalp read as a bald spot, the owner 11-20)
    if (st === 'buzz' && Q.part === 'hair') { Q.k += hash(Q.x, Q.y, seed) > 0.7 ? -0.12 : 0; return Q.res > 1 ? stubble : buzzR; }
    if (st === 'mohawk' && Q.part === 'hair') return Q.res > 1 ? stubble : shavedR;
    if (st === 'cornrows') { if (Math.round(Q.l0 * (Q.res > 1 ? 8 : 4.5)) & 1) Q.k -= 0.34; return hairR; }   // (rows two art pixels wide at the game's size)
    if ((st === 'undercut' || st === 'fade') && Q.l2 < 0.45 && !(PL && Q.res === 1 && Q.part !== 'hair')) { if (!(PL && Q.res === 1)) Q.k += hash(Q.x, Q.y, seed) > 0.7 ? -0.12 : 0; return Q.res > 1 ? stubble : shavedR; }   // (the polish pass: the short sides are the cap's alone and one clean tone - the block on top is all hair, or it came out mottled)
    if (st === 'slick') { Q.gloss = 0.8; if ((Math.round(Q.l0 * 7) & 1) && Q.l2 > 0) Q.k -= 0.15; return hairR; }
    Q.k -= Q.res > 1 ? 0.1 : 0.04;
    if (Q.res > 1) {
      // close up (the creator): locks running down from the crown, a dark line between them, each lock a little lighter
      // or darker than the next, and a sheen where the light catches the top
      const g = az * 8.5 + Q.l2 * (st === 'curly' || st === 'afro' ? 3.2 : 0.9) + 40, lock = Math.floor(g), fr = g - lock, n = hash(lock, Math.floor(Q.l2 * 3 + 5), seed);
      Q.k += fr < 0.16 ? -0.24 : n > 0.66 ? -0.1 : n < 0.3 ? 0.1 : 0;
      if (Q.l2 > 0.86) Q.k += hash(Math.round(Q.l0 * 7), Math.round(Q.l1 * 7), seed) > 0.62 ? -0.12 : 0.03;
      Q.gloss = Math.max(Q.gloss, st === 'afro' || st === 'curly' ? 0.25 : 0.6);
    } else if (Q.l2 < 0.78) { const sl = Math.floor(az * 5.2 + Q.l2 * 1.3 + 20), n = hash(sl, Math.floor(Q.l2 * 2.2 + 3), seed); Q.k += n > 0.62 ? -0.2 : n < 0.3 ? 0.12 : 0; }
    else Q.k += hash(Math.round(Q.l0 * 3), Math.round(Q.l1 * 3), seed) > 0.6 ? -0.12 : 0.04;
    if (Q.res === 1 && Q.nz > 0.55 && Q.ny > -0.2) Q.k += 0.1;              // (C2: the light catches the top of the hair, seen from the high camera)
    if (st === 'wavy' || st === 'long' || st === 'braids' || st === 'dreads') Q.k += Math.sin(Q.Z * 1.3 + az * 3) * 0.12;
    return hairR;
  };
  W.cuff = (Q) => { Q.gloss = 1; return gold; };
  W.hairLock = (Q) => {
    Q.k += Math.sin(Q.l0 * 9 + Q.l1 * 2) * 0.14 - 0.04;
    if ((A.hair?.style === 'braids' || A.hair?.style === 'braid' || A.hair?.style === 'boxbraids') && ((Math.floor(Q.l0 * 10) + (Q.l1 > 0 ? 1 : 0)) & 1)) Q.k -= 0.22;
    if (Q.res > 1) { const g = Math.atan2(Q.l0, Q.l1 || 1e-6) * 7 + 30, fr = g - Math.floor(g); if (fr < 0.18) Q.k -= 0.2; Q.gloss = Math.max(Q.gloss, 0.5); }
    return hairR;
  };
  // hats
  const hatR = cloth(A.hat?.color || 'navy'), hk = A.hat?.kind;
  const hatTrim = A.hat?.trim && A.hat.trim !== A.hat.color ? cloth(A.hat.trim) : null;
  const turbanU = PL && hk === 'turban' ? cloth(mixHex(A.hat.color || 'cream', '#3a2618', 0.5)) : null;
  const hatPat = A.hat?.pattern ? patFn({ pattern: A.hat.pattern, color: A.hat.color, trim: A.hat.trim }) : null;
  W.hat = (Q) => {
    if (Q.part === 'flower') { const i = Math.abs(Math.round(Q.X * 3 + Q.Y * 5)) % 3; return i === 0 ? hatR : i === 1 ? white : cloth('#f2c21b'); }
    if (Q.part === 'leaf') return cloth(A.hat?.trim || '#2f9a3a');
    if (hk === 'catears' && Q.part === 'ear' && Q.l1 > 0.2) return cloth(A.hat?.trim || 'pink');
    if (hk === 'skatehelmet' && Q.part === 'crown' && Q.l2 > 0.3 && (Math.round(Math.atan2(Q.l0, Q.l1) * 2.2) & 1) && Math.abs(Q.l2 - 0.62) < 0.14) Q.k -= 0.45;   // (vents)
    if (hk === 'turban' && Q.part === 'crown' && PL) {   // (wound: the layers rise to a point over the brow - the under-wrap shows in a peak there - and each layer is a fold's shadow)
      const t = Q.l2 + Math.abs(Q.l0) * 1.2; if (Q.l1 > 0.2 && t < 0.46) { Q.k -= 0.1; return turbanU; } const f = t * 1.45 - Math.floor(t * 1.45); if (f < 0.42) Q.k -= 0.42;
    } else if (hk === 'turban' && Q.part === 'crown' && (Math.round(Q.l2 * 4 + Q.l0 * 1.5) & 1)) Q.k -= 0.14;   // (the folds)
    if (hk === 'moto' || hk === 'skatehelmet') Q.gloss = 0.7;
    if (hatPat) { const c = hatPat(Q); if (c) return c; }
    if (hk === 'trucker' && Q.part === 'crown' && Q.l1 > 0.45 && Q.l2 > 0.05) return white;
    // (2026-11-14: hats that read at the game's size - a cap's logo in its trim on the front panel and its button, a felt
    // hat's sheen and a dark band round a light one)
    if (hk === 'cap' && hatTrim && !(PL && A.hat.back) && (Q.part === 'button' || (Q.part === 'crown' && Q.l1 * (A.hat.back ? -1 : 1) > 0.7 && Math.abs(Q.l0) < 0.32 && Q.l2 > 0.1 && Q.l2 < 0.6))) return hatTrim;
    if (FELT.has(hk) && Q.part === 'crown') Q.gloss = 0.4;
    if (hk === 'police' && Q.part === 'crown' && Q.l1 > 0.85 && Math.abs(Q.l0) < 0.16 && Q.l2 > -0.4) { Q.gloss = 1; return gold; }
    if (hk === 'hard' && Math.abs(Q.l0) < 0.12 && Q.part === 'crown') Q.k += 0.18;
    if (hk === 'beanie' && Q.part === 'crown') { if (Q.l2 < 0.42) Q.k -= Q.l2 > 0.3 ? 0.36 : 0.18; if ((Math.round(Math.atan2(Q.l0, Q.l1) * 6) & 1)) Q.k -= 0.08; }
    if ((hk === 'fedora' || hk === 'cowboy' || hk === 'sunhat') && Q.part === 'crown' && Q.l2 < 0.12 && !(PL && Q.res === 1 && Q.l1 < -0.25)) return W.band();   // (the polish pass: no band round the back at the game's size - from behind the crown's band was a smile on a face)
    if ((hk === 'fedora' || hk === 'cowboy') && Q.part === 'crown' && Q.l2 > 0.5 && Math.abs(Q.l0) < 0.15) Q.k -= 0.4;   // (the dent along the top)
    if (hk === 'helmet' && Q.part === 'crown' && Math.abs(Q.l2 - 0.1) < 0.07) Q.k -= 0.25;
    if (hk === 'hard' || hk === 'helmet' || hk === 'police') Q.gloss = PL && A.hat.riding ? 1 : 0.7;
    return hatR;
  };
  W.band = () => (FELT.has(hk) && lum(hatR[3]) > 0.4 ? cloth('#2a1a1e') : hk === 'police' ? (A.hat?.braid ? gold : black) : hk === 'sailor' || hk === 'tiara' || hk === 'earmuffs' || A.hat?.pom ? cloth(A.hat?.trim || 'navy') : hk === 'tophat' ? cloth(A.hat?.trim && A.hat.trim !== A.hat.color ? A.hat.trim : '#2a1a1e') : dark(hatR));
  W.brim = (Q) => { if (hk === 'police') { Q.gloss = 1; return black; } if (hk === 'cap' || hk === 'visor' || hk === 'flatcap') Q.k -= PL && A.hat.back ? 0.34 : 0.16; if (PL && A.hat.riding) Q.k -= 0.3; return hatR; };
  W.glass = (Q) => { Q.gloss = 1; Q.k -= 0.1; return cloth('#2a3442'); };
  W.skirt = (Q) => { const R = T.dress ? top : T.long ? top : bot, pf = R === top ? topPat : botPat; if (Q.l0 > 0.92) Q.k -= 0.16; if (pf) { const pr = pf(Q); if (pr) return pr; }
    if ((T.towel || bk === 'towel') && Math.abs(Q.l1 - 0.6) < 0.12 && Q.l2 > 0.2) Q.k -= 0.22;                      // the tucked-in corner
    if ((T.towel || bk === 'towel') && Math.abs(Q.l0 - 0.82) < 0.05) return cloth(A.bottom?.color2 || 'sky'); if (T.long && Math.abs(Q.l1) < 0.12 && Q.l2 > 0.8) Q.k -= 0.2; if (T.check) { const a = Math.floor((Math.atan2(Q.l1, Q.l2) + 4) * 3), b = Math.floor(Q.l0 * 6); if ((a + b) & 1) Q.k -= 0.22; } return R; };
  W.lining = () => dark(T.long ? top : bot);
  W.apron = (Q) => { if (Math.abs(Q.l2 - 0.15) < 0.08 && Math.abs(Q.l0) < 0.8) Q.k -= 0.25; if (Q.l2 < -0.88) Q.k -= 0.12; return top; };   // (a pocket across it, the hem)
  W.fur = (Q) => { Q.k += hash(Math.round(Q.X * 2), Math.round(Q.Z * 2), 3) * 0.4 - 0.12; return cloth('#efe6d4'); };
  W.hood = (Q) => { if (Q.l1 > 0.2) Q.k -= 0.2; return top; };
  W.collar = (Q) => { Q.k += Q.l2 > 0.3 ? 0.1 : -0.12; if (T.gloss) Q.gloss = T.gloss; return tk === 'fur' ? cloth('#efe6d4') : top; };
  W.pack = (Q) => { const R = cloth(A.backColor || 'navy'); if (Q.l2 > 0.55) Q.k -= 0.15; if (Math.abs(Q.l2 - 0.2) < 0.06) Q.k -= 0.25; return R; };
  { const wh = cloth(A.shoeTrim || '#e0508c'); W.wheel = (Q) => { Q.gloss = 0.4; return wh; }; }
  W.leather = (Q) => { Q.gloss = 0.5; if (Q.l2 > 0.82) Q.k += 0.12; return cloth(A.bagColor || (A.carry === 'purse' ? (A.top?.color2 || 'maroon') : '#5a3a26')); };
  W.case = (Q) => { Q.gloss = 0.6; if (Math.abs(Q.l2 - 0.55) < 0.08 || Math.abs(Q.l0) > 0.94) Q.k -= 0.2; return cloth(A.bagColor || '#4a2e1e'); };
  W.tool = (Q) => (Q.l2 > 0.85 && (Math.round(Q.l0 * 4) & 1) ? cloth(A.bagColor ? '#c8ccd4' : '#c8302c') : cloth(A.bagColor || '#3a3632'));
  W.beltbag = (Q) => { if (Math.abs(Q.l2) < 0.12) Q.k -= 0.2; return cloth(A.beltBag || 'black'); };
  W.paper = (Q) => (Q.l2 > 0.86 ? cloth('cream') : cloth(Q.part === 'bagL' ? (A.bagColor ? '#c8262b' : '#d84a6a') : A.bagColor || '#e8dcc8'));
  W.cup = (Q) => (Q.l0 > 0.3 && Q.l0 < 0.75 ? cloth('#8a5a36') : cloth('#f0ece4'));
  W.wood = (Q) => { if (Q.l0 > 0.94) Q.k += 0.2; return cloth('#6a4428'); };
  W.board = (Q) => (Math.abs(Q.l0) < 0.12 ? cloth('teal') : cloth('#f0ece4'));
  W.holster = () => black;
  W.HEMZ = HEMZ; W.pat = !!(topPat || botPat || T.check || T.floral || A.drape); if (PL && PL.dress) PL.dress(W, A, D, T, TF);
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
  // (the polish pass, the owner 11-20: a belly is its own shape, low and in front - the old one was a ball round the whole trunk,
  // out at the back as far as at the front, and the bust was lost in it)
  // (a belly, the polish pass - the owner, 11-20: its own shape in front, round and never a point; high enough that from the
  // camera's height it doesn't hang over the underwear's middle - the camera looks down, and what stands forward shows lower)
  if (D.belly && PL) { const m = D.fem ? 0 : 1, hz = m ? 0.386 : 0.243; E(vadd(S.pel, mv(S.SH, [0, 1.75 + m * 0.35 + D.belly * (1.3 + m * 0.1), m ? 6.3 : 5.1])), S.SH, [(6.3 + D.belly * 0.9) * D.w, 2.0 + m * 0.4 + D.belly * (1.45 + m * 0.15), 7.0], GR.TORSO, 'belly', W.torso, (a, b, c) => c > -hz && c < hz); }
  else if (D.belly) E(vadd(S.pel, mv(S.SH, [0, 1.6 + D.belly * 1.4, 4.4])), S.SH, [(7.2 + D.belly * 1.4) * D.w, 4.4 + D.belly * 2.2, 6.0 + D.belly * 0.6], GR.TORSO, 'belly', W.torso);
  if (fem && PL) {   // (the polish pass, the owner 11-20: "a little shape" to a woman's chest and seat - enough to show from the side)
    // (a curve two art pixels tall and one out, never a point: tall, shallow shapes - the owner, 11-20: "they shouldn't have a point")
    // (the bust two art pixels tall and one out, low enough that the row under the neck stays in - a neckline; the seat the
    // same step out on every build - a slim one's pelvis is smaller, and a seat of one size stood out of it as a point)
    const bk = D.shape || 1;
    const bu = D.bust || bk;
    const big = D.belly >= 1.2;   // (over a belly the bust sits higher and shorter: a notch between the two, not one long front)
    for (const s of [-1, 1]) E(vadd(S.chest, mv(S.SP, [s * 2.6 * D.w, D.chestR[1] - 0.9, big ? -0.8 : -1.7])), S.SP, [2.7 * D.w * (bu > 1.3 ? 1.08 : 1), 2.6 * bu, big ? 2.7 : 3.5], GR.TORSO, 'bust', W.torso);
    E(vadd(S.pel, mv(S.PF, [0, -(D.pelR[1] + 1.7 * bk - 4.6), -1.0])), S.PF, [D.pelR[0] * 0.88, 4.6, 9.0], GR.TORSO, 'pel', W.pel, (a, b, c) => c > -0.25 && c < 0.56).seat = 1;   // (...and not so low that it shows between the thighs from the front)   // (cut level with the pelvis: hanging lower it covered the tops of the legs from behind - one shape, no legs)   // (three art pixels tall: at two, with a strap's colour on one of them, it read as a point - the owner, 11-20)   // (a broad shallow curve: three art pixels tall, one out)
  } else if (fem) for (const s of [-1, 1]) E(vadd(S.chest, mv(S.SP, [s * 2.5, D.chestR[1] - 1.5, 1.0])), S.SP, [2.3, 1.9, 2.0], GR.TORSO, 'bust', W.torso);
  if (W.T.hood && hat !== 'hood') E(vadd(S.neck, mv(S.SP, [0, -3.0, -0.2])), S.SP, [4.8, 2.4, 2.8], GR.TORSO, 'hood', W.hood);
  if (W.T.fur) E(vadd(S.neck, mv(S.SP, [0, 0.4, -1.2])), S.SP, [6.6, 5.2, 2.2], GR.TORSO, 'fur', W.fur);
  else if (W.T.open && W.T.open > 0.15 && !W.T.hood) E(vadd(S.neck, mv(S.SP, [0, -0.5, -1.7])), S.SP, [D.neckR + 2.0, D.neckR + 1.6, 1.25], GR.TORSO, 'collar', W.collar, (a, b) => b < 0.5 - Math.abs(a) * 0.2);   // (SF/SM: a jacket's collar, a layer over the top)
  if (W.T.duty) B(vadd(S.pel, mv(S.PF, [D.pelR[0] + 0.4, 0.6, 0.2])), S.PF, [1.0, 1.8, 2.4], GR.ACC, 'holster', W.holster);
  // neck and head
  C(vadd(S.neck, mv(S.SP, [0, -0.2, -2.6])), vadd(S.head, mv(HD, [0, -0.8, -4.0])), D.neckR, D.neckR * 0.95, GR.TORSO, 'neck', W.neck);
  const headP = E(S.head, HD, hr, GR.HEAD, 'head', W.head);
  E(at([0, 0.42, -0.5]), HD, [hr[0] * (D.jawW || 0.74), hr[1] * 0.6, hr[2] * 0.5], GR.HEAD, 'jaw', W.head);
  const nz = NOSE[A.face?.nose | 0] || NOSE[0];
  E(at([0, 0.97, -0.24]), HD, [0.9 * nz[0], 1.1 * nz[1] * (PL ? PL.noseK : 1), 1.15 * nz[2]], GR.HEAD, 'nose', W.head);
  // (the polish pass: hair that stands off the head - a full beard's mass under the jaw, a long one's length, a goatee's tuft -
  // in the beard's one tone; peoplepolish.js BVOL. Part of the head's group: the hair's own lighting isn't laid over it)
  const bvol = PL && PL.BVOL && !A.mask && !A.fmask && !A.medmask && !A.bandana ? PL.BVOL[A.beard] : null;
  if (PL && A.beard && PL.beardTone) { const br = PL.beardTone(W.hairR, W.skin); W.beardR = br; W.beardM = (Q) => { Q.gloss = 0; return br; }; }
  if (bvol) for (const v of bvol) E(at(v[0]), HD, [hr[0] * v[1][0], hr[1] * v[1][1], hr[2] * v[1][2]], GR.HEAD, 'beard', W.beardM);
  else if (A.beard === 'long' && !A.mask && !A.fmask) E(at([0, 0.5, -1.02]), HD, [hr[0] * 0.48, hr[1] * 0.34, hr[2] * 0.42], GR.HAIR, 'beard', W.hairLock);
  // (the last of the concepts' missing pieces, 11-21. A parka: a hood down the back with a roll of fur along its edge. A coat
  // over the shoulders: the arms are out of it - the top's sleeves, or bare - and its empty sleeves hang from the shoulders.)
  if (PL && A.top?.furhood && hat !== 'hood') { const fr = cloth(A.top.trim || '#e8dcc4'), fm = (Q) => { Q.gloss = 0; return fr; };
    E(vadd(S.neck, mv(S.SP, [0, -3.4, -0.6])), S.SP, [5.6, 2.9, 3.2], GR.TORSO, 'hood', W.hood || (() => W.top));
    E(vadd(S.neck, mv(S.SP, [0, -3.0, 1.9])), S.SP, [6.3, 3.4, 1.5], GR.TORSO, 'fur', fm);
    for (const s2 of [-1, 1]) E(vadd(S.neck, mv(S.SP, [s2 * 4.6, 0.6, 0.4])), S.SP, [1.9, 2.6, 1.5], GR.TORSO, 'fur', fm); }
  if (PL && A.top?.draped) for (const [k2, s2] of [['L', -1], ['R', 1]]) { const sh = S['sh' + k2], cm = W.hood || (() => W.top);   // (over each shoulder, and an empty sleeve down the outside of the arm: from behind the arm is under the coat, from the front it's out of it)
    E(vadd(sh, mv(S.SP, [s2 * 0.5, -0.9, 0.9])), S.SP, [4.5, 3.9, 3.5], GR.TORSO, 'drape', cm);
    C(vadd(sh, mv(S.SP, [s2 * 2.3, -1.7, 0.6])), vadd(sh, mv(S.SP, [s2 * 3.3, -2.3, -(D.upper + D.fore) * 0.86])), 3.7, 3.0, GR.TORSO, 'drape', cm); }
  // (the polish pass: a scarf is a shape - a roll round the neck as wide as the head, up over the chin and the mouth, and an end
  // hanging down the chest with a band across its foot; peoplepolish.js dress() W.scarf)
  if (PL && W.scarf) { const nk = (x, y, z) => vadd(S.neck, mv(S.SP, [x, y, z]));
    E(nk(0, 1.0, 2.7), S.SP, [hr[0] * 1.0, hr[1] * 1.08, 3.8], GR.ACC, 'scarf', W.scarf);
    C(nk(2.8, hr[1] * 0.9, -0.5), nk(3.1, D.chestR[1] + 1.5, -8.4), 2.3, 2.2, GR.ACC, 'scarf', W.scarf);
    E(nk(3.1, D.chestR[1] + 1.5, -9.2), S.SP, [2.5, 2.1, 1.3], GR.ACC, 'scarf', W.scarfD); }
  for (const s of [-1, 1]) E(at([s * 0.97, -0.1, 0.04]), HD, [1.1, 1.3, 1.75], GR.HEAD, 'ear', W.ear);
  hairPrims(E, C, A, D, P, S, W, at, hat, seed);
  if (hat) hatPrims(E, C, A, D, S, W, at, hat, B);
  if (hat && A.hat.lamp) lampPrims(E, S, at, hat);   // (a lamp on the forehead: lights to carry, below)
  if (A.fmask || A.masq) maskPrims(E, C, B, A, at, HD, hr);
  // (the polish pass, the owner's notes of 11-20. "Tactical vest too small": a plate carrier with bulk - a plate standing off the
  // chest and the back, three pouches under it. "Ghillie suit with vegetation": tufts of it standing out of the shoulders,
  // the arms, the hood and the hips - a shaggy outline, not a camouflage print.)
  if (PL && A.top && A.top.riot) { const gr = cloth(A.top.color2 && A.top.color2[0] === '#' ? A.top.color2 : '#3a3a40'); for (const k of ['L', 'R']) { E(vadd(S['sh' + k], [0, 0, 1.0]), S.SP, [3.9, 3.7, 2.6], GR.ACC, 'pad', (Q) => { Q.gloss = 0.5; return gr; }); const el = S['el' + k], ha = S['ha' + k]; C(vlerp(el, ha, 0.15), vlerp(el, ha, 0.75), 3.0, 2.7, GR.ACC, 'pad', () => gr); } }   // (riot armor: a guard on each shoulder and forearm over the plates)
  if (PL && W.T.plates) { const plR = cloth(A.top?.color2 && A.top.color2 !== 'white' && A.top.color2 !== '#f0eee8' ? A.top.color2 : '#3e4654'), pm = (Q) => { if (Q.l2 < -0.5) Q.k -= 0.22; return plR; };
    B(vadd(S.chest, mv(S.SP, [0, D.chestR[1] + 0.8, -0.5])), S.SP, [D.chestR[0] * 0.74, 1.3, 4.7], GR.ACC, 'plate', pm);
    B(vadd(S.chest, mv(S.SP, [0, -(D.chestR[1] + 0.7), 0.2])), S.SP, [D.chestR[0] * 0.74, 1.1, 5.0], GR.ACC, 'plate', pm);
    for (const s of [-1, 0, 1]) B(vadd(S.chest, mv(S.SP, [s * D.chestR[0] * 0.44, D.chestR[1] + 2.2, -3.6])), S.SP, [1.5, 0.9, 1.6], GR.ACC, 'pouch', (Q) => { Q.k -= 0.18; return plR; }); }
  if (PL && A.drape === 'ghillie') { const GH = [cloth('#3c4a26'), cloth('#6b6a3a'), cloth('#4f5e2c')]; let gi = 0; const tuft = (p, d) => { const i = gi++; C(p, vadd(p, d), 1.25, 0.55, GR.ACC, 'tuft', () => GH[i % 3]); };
    for (const [k, s] of [['L', -1], ['R', 1]]) { tuft(vadd(S['sh' + k], [0, 0, 1.2]), mv(S.SP, [s * 3.4, 0.4, -2.0])); tuft(vadd(S['sh' + k], [0, 0, 0.6]), mv(S.SP, [s * 1.8, -2.8, -2.4])); tuft(S['el' + k], mv(S.SP, [s * 3.0, -0.8, -2.6])); tuft(vlerp(S['sh' + k], S['el' + k], 0.5), mv(S.SP, [s * 2.8, 1.0, -2.2])); tuft(vadd(S.pel, mv(S.PF, [s * D.pelR[0], 0, 1.0])), mv(S.PF, [s * 2.8, 0, -2.8])); tuft(at([s * 0.95, 0.1, 0.5]), mv(S.SP, [s * 2.8, 0, -2.2])); }
    tuft(at([0, -0.95, 0.5]), mv(S.SP, [0, -2.8, -2.4])); tuft(at([0, 0, 1.15]), mv(S.SP, [1.6, -1.2, 1.8])); tuft(vadd(S.chest, mv(S.SP, [0, -D.chestR[1], 1.0])), mv(S.SP, [0.6, -3.0, -2.6])); }
  // arms
  for (const [k, s, g] of [['L', -1, GR.ARML], ['R', 1, GR.ARMR]]) {
    const sh = S['shA' + k] || S['sh' + k], el = S['el' + k], ha = S['ha' + k], fd = vnorm(vsub(ha, el)), wr = vsub(ha, vmul(fd, 1.25));
    const side = mv(S.SP, [s, 0, 0]);
    const ua = C(sh, el, D.armR[0], D.armR[1], g, 'ua', W.arm, null, side, mv(S.SP, [0, 1, 0])); ua.side = 1;
    C(el, wr, D.foreR[0], D.foreR[1], g, 'fa', W.arm, null, side, mv(S.SP, [0, 1, 0])).side = 1;
    const open = P['open' + k];
    E(ha, frameFU(fd, side), open ? [D.fist * 0.62, D.fist * 1.25, D.fist * 0.95] : [D.fist * 0.95, D.fist * 1.06, D.fist], g, 'hand', W.hand);
    if (P.peace && k === 'R') for (const t of [-1, 1]) C(vadd(ha, [0, 0, 0.8]), vadd(ha, mv(S.SP, [1.2 + t * 1.7, 0.6, 5.2])), 0.66, 0.52, g, 'finger', W.hand);
  }
  // legs and feet
  for (const [k, s, g] of [['L', -1, GR.LEGL], ['R', 1, GR.LEGR]]) {
    const hp = S['hip' + k], kn = S['kn' + k], an = S['an' + k], side = mv(S.PF, [s, 0, 0]);
    const hm = PL && A.bottom?.harem ? 1 : 0;   // (harem trousers: full from the hip, fullest at the knee, gathered at the ankle)
    C(hp, kn, D.thighR[0] * (hm ? 1.22 : 1), D.thighR[1] * (hm ? 1.62 : 1), g, 'th', W.leg, null, side, mv(S.PF, [0, 1, 0])).side = 1;
    C(kn, an, D.shinR[0] * (hm ? 1.7 : 1), D.shinR[1] * (hm ? 1.08 : 1), g, 'sh', W.leg, null, side, mv(S.PF, [0, 1, 0])).side = 1;
    const FF = mmul(rz(P.pelYaw + s * P.splay), rx(P['toe' + k])), fr = W.shoeKind === 'barefoot' || W.shoeKind === 'sandal' ? (PL && PL.bareK ? D.foot.map((v, i) => v * PL.bareK[i]) : [D.foot[0] * 0.8, D.foot[1] * 0.9, D.foot[2] * 0.75]) : W.shoeKind === 'heel' ? [D.foot[0] * 0.85, D.foot[1] * 0.92, D.foot[2] * 0.9] : D.foot;
    const fc = vadd(an, mv(FF, [0, 1.5, -1.62]));
    E(fc, FF, fr, g, 'shoe', W.shoe, (a, b, c) => c > -0.62);
    const th = A.shoe_platform || A.shoe_chunky ? 1.05 : 0.55;   // (a platform or a chunky sole: taller, from the same ground)
    if (PL || (W.shoeKind !== 'barefoot' && W.shoeKind !== 'sandal')) E(vadd(fc, mv(FF, [0, 0.1, -fr[2] * 0.6 + th - 0.55])), FF, [fr[0] + (A.shoe_chunky ? 0.4 : 0.12), fr[1] + 0.2, th], g, 'sole', W.sole);
    if (PL && A.shoe_skate) for (const fy of [-0.62, 0.62]) E(vadd(fc, mv(FF, [0, fy * fr[1], -fr[2] * 0.6 - 0.9])), FF, [fr[0] * 0.92, 1.45, 1.45], g, 'sole', W.wheel);   // (roller skates: a pair of wheels under the heel and under the toe)
    if (W.shoeKind === 'boot' || (A.hiTop && W.shoeKind === 'sneaker')) { const bt = A.bootTall === 2 ? 8.5 : A.bootTall ? 5 : A.hiTop ? 2.2 : 2.6; C(vadd(an, [0, 0, -0.6]), vadd(an, mv(S.PF, [0, -0.2, bt])), D.shinR[1] + 0.55, D.shinR[1] + (bt > 3 ? 0.65 : 0.45), g, 'boot', W.shoe); }
  }
  // skirts, dresses, coat tails
  const T = W.T;
  if (T.dress || W.bk === 'skirt' || W.bk === 'towel' || T.long || (T.towel && W.bk !== 'jeans')) {
    const kn = vmul(vadd(S.knL, S.knR), 0.5), top = vadd(S.pel, mv(S.PF, [0, 0.2, T.towel ? 6 : 2.2])), long = T.long;
    // (the look system's lengths: a gown or a maxi skirt to the ankles, a mini well above the knee)
    const ln = T.dress ? (T.gown ? -1 : A.top?.len | 0) : W.bk === 'skirt' ? A.bottom?.len | 0 : 0, lnZ = ln < 0 ? -9 : ln > 0 ? 3.2 : 0;
    // (SF/SM: the hem swings with the stride and flares as the legs part)
    const swayH = P.gait ? Math.sin(2 * Math.PI * (P.ph || 0)) * (P.gait.run ? 1.5 : 0.9) : 0, flare = P.gaitY ? Math.min(1.4, Math.abs(P.gaitY[0] - P.gaitY[1]) * 0.08) : 0;
    const hem = [kn[0] * 0.8 + swayH, kn[1] * 0.7 + S.pel[1] * 0.3, Math.max(kn[2] + lnZ + (long ? -0.5 : T.dress ? 1.6 : W.bk === 'towel' || T.towel ? 2.8 : 3.4), 1.5)];
    const r0 = D.pelR[0] * (T.towel ? 1.06 : 1.02), r1 = D.pelR[0] + (long ? 1.6 : T.dress ? 2.6 : 1.4) + (ln < 0 ? 1.4 : ln > 0 ? -0.6 : 0) + flare;
    const open = long ? (h, c1, c2) => h > 0.002 && h < 0.998 && !(c2 > 0.55 && Math.abs(c1) < 0.5 && h > 0.15) : (h) => h > 0.002 && h < 0.998;
    C(top, hem, r0, r1, GR.SKIRT, 'skirt', W.skirt, open, mv(S.PF, [1, 0, 0]), mv(S.PF, [0, 1, 0]));
    if (long) C(top, hem, r0 - 0.7, r1 - 0.7, GR.SKIRT, 'lining', W.lining, (h) => h > 0.002 && h < 0.998);
  }
  // an apron hangs on to the knees in front (CC9's barista; CC4's work aprons): a flat panel before the thighs
  if (T.apron) {
    const kn = vmul(vadd(S.knL, S.knR), 0.5), lo = Math.max(kn[2] + 1.2, 3), hi = S.pel[2] + 2.4, cz = (lo + hi) / 2;
    B(vadd(S.pel, mv(S.PF, [0, D.pelR[1] + 0.9, cz - S.pel[2]])), S.PF, [D.pelR[0] * 0.92, 0.5, (hi - lo) / 2], GR.SKIRT, 'apron', W.apron);
  }
  // things carried on the body
  if (A.backBox) B(vadd(S.chest, mv(S.SP, [0, -(D.chestR[1] + 2.8), 0.8])), S.SP, [5.0, 2.9, 5.0], GR.ACC, 'pack', (Q) => { if (Math.abs(Q.l2 - 0.5) < 0.1) Q.k += 0.25; return W.pack(Q); });   // (a courier's insulated box)
  else if (A.back === 'backpack' && !A.backBig && PL) { B(vadd(S.chest, mv(S.SP, [0, -(D.chestR[1] + 2.2), -0.2])), S.SP, [D.chestR[0] * 0.66, 2.7, 6.0], GR.ACC, 'pack', (Q) => { if (Math.abs(Q.l2 + 0.2) < 0.07) Q.k -= 0.2; return W.pack(Q); }); B(vadd(S.chest, mv(S.SP, [0, -(D.chestR[1] + 4.4), -2.6])), S.SP, [D.chestR[0] * 0.44, 0.8, 2.2], GR.ACC, 'pack', (Q) => { Q.k -= 0.12; return W.pack(Q); }); }   // (the polish pass, the owner 11-20: "backpacks too small" - two thirds of the back across, deeper, a pocket on it)
  else if (A.back === 'backpack' && !A.backBig) B(vadd(S.chest, mv(S.SP, [0, -(D.chestR[1] + 1.3), -0.6])), S.SP, [4.4, 1.7, 5.0], GR.ACC, 'pack', W.pack);
  if (A.back === 'backpack' && A.backBig) {   // a backpacker's trekking pack (Nature-C4): tall, up over the shoulders, the rolled bedroll strapped on top
    B(vadd(S.chest, mv(S.SP, [0, -(D.chestR[1] + 2.0), 0.6])), S.SP, [4.6, 2.4, 7.4], GR.ACC, 'pack', (Q) => { if (Math.abs(Q.l2 + 0.35) < 0.06 || Math.abs(Q.l0) > 0.9) Q.k -= 0.22; return W.pack(Q); });
    C(vadd(S.chest, mv(S.SP, [-4.8, -(D.chestR[1] + 2.0), 9.0])), vadd(S.chest, mv(S.SP, [4.8, -(D.chestR[1] + 2.0), 9.0])), 1.7, 1.7, GR.ACC, 'bedroll', MAT('#3a6a9a'));
  }
  if (A.wings) founderWings(E, A, D, S, P);
  if (A.back === 'guitarcase' && PL) { const gm = (Q) => { Q.gloss = 0.4; return cloth(A.backColor || 'black'); }, GF = mmul(S.SP, ry(0.38));   // (the polish pass, the owner 11-20: "guitar case unreadable" - a guitar's outline: a wide round body low, a narrower waist, a long neck up over the shoulder)
    // (the owner, 20:15: "bigger like the actual size of a guitar compared to a person" - from the back of the knees to over the head)
    E(vadd(S.chest, mv(S.SP, [-2.2, -(D.chestR[1] + 2.3), -8.0])), GF, [6.6, 2.3, 6.8], GR.ACC, 'gcase', gm); E(vadd(S.chest, mv(S.SP, [0.6, -(D.chestR[1] + 2.3), -0.6])), GF, [4.8, 2.2, 4.8], GR.ACC, 'gcase', gm);
    C(vadd(S.chest, mv(S.SP, [2.0, -(D.chestR[1] + 2.1), 2.6])), vadd(S.chest, mv(S.SP, [7.4, -(D.chestR[1] + 1.9), 15.5])), 2.1, 1.8, GR.ACC, 'gcase', gm); B(vadd(S.chest, mv(S.SP, [8.0, -(D.chestR[1] + 1.9), 17.0])), GF, [1.9, 1.3, 2.3], GR.ACC, 'gcase', gm); }
  else if (A.back === 'guitarcase') E(vadd(S.chest, mv(S.SP, [1.0, -(D.chestR[1] + 1.7), -1.6])), mmul(S.SP, ry(0.38)), [3.3, 1.5, 11.5], GR.ACC, 'gcase', (Q) => { Q.gloss = 0.4; if (Math.abs(Q.l2 + 0.25) < 0.05) Q.k -= 0.25; return cloth(A.backColor || 'black'); });
  if (A.jewel && A.jewel.bow && PL) ;   // (the polish pass lays it on the art grid: peoplepolish.js NECK)
  else if (A.jewel && A.jewel.bow) for (const s of [-1, 1]) E(vadd(S.chest, mv(S.SP, [s * 0.75, D.chestR[1] + 0.45, D.chestR[2] - 0.7])), S.SP, [0.85, 0.5, 0.6], GR.ACC, 'bow', MAT(A.jewel.color));   // (a bow tie at the collar)
  if (A.rig) B(vadd(S.chest, mv(S.SP, [0, D.chestR[1] + 0.8, -0.6])), S.SP, [3.8, 1.0, 2.3], GR.ACC, 'rig', (Q) => { if (Math.abs(Q.l0) < 0.05 || Math.abs(Q.l2 - 0.2) < 0.08) Q.k -= 0.25; return cloth(A.rig); });
  // a robbery's takings (server hotmoney.js; game/host.js puts back 'moneybag' on while the descriptor's mb): a canvas sack, tied off
  if (A.back === 'yogamat' && PL) { const mc = cloth(A.backColor || 'purple'); C(vadd(S.chest, mv(S.SP, [-5.6, -(D.chestR[1] + 2.4), -4.6])), vadd(S.chest, mv(S.SP, [5.6, -(D.chestR[1] + 2.4), 5.2])), 2.5, 2.5, GR.ACC, 'pack', (Q) => { if (Q.l0 < 0.06 || Q.l0 > 0.94) Q.k += 0.4; else if (Math.abs(Q.l0 - 0.3) < 0.04 || Math.abs(Q.l0 - 0.7) < 0.04) Q.k -= 0.4; return mc; }); }   // (a yoga mat rolled and slung across the back, two ties round it; its strap is laid on the art grid)
  if (PL && A.jewel && A.jewel.boxing) { const bc = cloth(A.jewel.color || 'red'), cf = cloth(A.jewel.trim || 'white'); for (const k of ['L', 'R']) { E(S['ha' + k], S.SP, [3.2, 3.3, 3.5], GR.ACC, 'glove', (Q) => { Q.gloss = 0.7; return bc; }); const el = S['el' + k], ha = S['ha' + k]; C(vlerp(el, ha, 0.72), vlerp(el, ha, 0.88), 2.9, 2.9, GR.ACC, 'glove', () => cf); } }   // (boxing gloves: a big round glove on each fist, a cuff behind it)
  if (A.back === 'moneybag') { const sack = (Q) => { if (Q.l2 > 0.6) Q.k -= 0.14; return cloth('#9a8a5c'); }; E(vadd(S.chest, mv(S.SP, [0, -(D.chestR[1] + 2.3), -1.4])), S.SP, [3.5, 2.4, 3.7], GR.ACC, 'sack', sack); E(vadd(S.chest, mv(S.SP, [0, -(D.chestR[1] + 2.1), 2.5])), S.SP, [1.2, 1.0, 1.1], GR.ACC, 'sack', (Q) => { Q.k -= 0.22; return cloth('#7a6a44'); }); }
  if (acc === 'bag') B(vadd(S.pel, mv(S.PF, [-D.pelR[0] - (A.bagBig ? 1.9 : 1.4), 0.6, A.bagBig ? -0.4 : 1.0])), S.PF, A.bagBig ? [1.7, 4.6, 4.4] : [1.4, 3.6, 2.8], GR.ACC, 'bag', W.leather);
  if (acc === 'toolbag' && PL && A.duffel) {   // (the polish pass, the owner 20:15: "much bigger and look like a duffel bag", "a strap over the shoulder" - a long round bag behind the hip, a pale band round each end, two handles on top; its strap across the chest is laid on the art grid, peoplepolish.js NECK)
    const p0 = vadd(S.pel, mv(S.PF, [D.pelR[0] + 3.3, -1.0, -1.6])), dc = cloth(A.bagColor || '#2a2a2e'), dm = (Q) => { if (Math.abs(Q.l0 - 0.2) < 0.06 || Math.abs(Q.l0 - 0.8) < 0.06) Q.k += 0.45; return dc; };
    C(vadd(p0, mv(S.PF, [0, -6.6, 0])), vadd(p0, mv(S.PF, [0, 6.6, 0])), 3.7, 3.7, GR.ACC, 'tool', dm); B(vadd(p0, mv(S.PF, [0, 0, 3.9])), S.PF, [0.7, 2.6, 0.7], GR.ACC, 'tool', (Q) => { Q.k += 0.3; return dc; }); }
  else if (acc === 'toolbag' && PL) {   // (the owner, 20:15: "should that not be a bigger thing to carry? Looks like a purse almost" - a tool box: long, carried by its handle in the hand where the pose has a free one, tools standing out of its open top)
    const hand = P.acc && P.item === null, p0 = hand ? vadd(S.haR, [0.4, 0, -5.2]) : vadd(S.pel, mv(S.PF, [D.pelR[0] + 2.6, 0.8, -1.6]));
    B(p0, S.PF, [2.1, 5.4, 2.9], GR.ACC, 'tool', (Q) => { if (Q.l2 < 0.85 && Math.abs(Q.l2 - 0.3) < 0.1) Q.k -= 0.28; return W.tool(Q); });
    B(vadd(p0, mv(S.PF, [0, 0, 3.7])), S.PF, [0.7, 3.2, 0.7], GR.ACC, 'tool', (Q) => { Q.k -= 0.3; return W.tool(Q); });
    for (const [y, c] of [[-3.2, '#c8ccd4'], [0, '#e0b020'], [3.0, '#c8ccd4']]) C(vadd(p0, mv(S.PF, [0, y, 2.6])), vadd(p0, mv(S.PF, [0, y + 0.6, 5.6])), 0.8, 0.7, GR.ACC, 'tool', ((R) => () => R)(cloth(c))); }
  else if (acc === 'toolbag') B(vadd(S.pel, mv(S.PF, [D.pelR[0] + 1.2, 0.8, -0.4])), S.PF, [1.4, 2.3, 2.4], GR.ACC, 'tool', W.tool);
  if (A.beltBag) B(vadd(S.pel, mv(S.PF, [0.6, D.pelR[1] + 0.8, 1.1])), S.PF, [2.6, 1.0, 1.2], GR.ACC, 'beltbag', W.beltbag);
  if (P.acc && acc && P.item === null) {
    const hR = S.haR, hL = S.haL;
    if (acc === 'briefcase') B(vadd(hR, [0, 0, -4.2]), S.PF, [1.3, 4.0, 3.0], GR.ACC, 'case', W.case);
    const prop = PL && A.prop ? A.prop[0] : null, pbox = prop && PL.propBox && PL.propBox[prop];   // (the polish pass's things to carry: each its own size in the hand - peoplepolish.js propBox, dress())
    // (the owner, 23:27: "should be a sphere not this current shape" - it sat against the chest with the forearm across it, a ball
    // of four and a half art pixels wherever the hand put it: a lump. Now it rests on the palm out in front of the hip, nothing
    // over it, five art pixels across with its middle on an art pixel's middle - the same round disc from every side - and its
    // seams are drawn on those art pixels: peoplepolish.js dress())
    if (prop === 'board') E(vadd(hR, mv(S.SP, [2.6, -0.6, 9.5])), mmul(S.SP, mmul(rz(0.5), rx(0.1))), [1.25, 5.2, 21], GR.ACC, 'purse', W.leather);   // (a surfboard under the arm: as tall as its owner, nose up)
    if (prop === 'ball') { const bp = E(vadd(hR, mv(S.SP, [0, 1.4, 5.6])), S.SP, [5, 5, 5], GR.ACC, 'purse', W.leather), c = bp.c; bp.ball = 1; c[0] = 2 * Math.round((c[0] - 1) / 2) + 1; const sy = c[1] * SA - c[2] * CA, sy1 = 2 * Math.round((sy - 1) / 2) + 1; c[2] += (sy - sy1) / CA; W.ballC = [(c[0] - 1) / 2, (sy1 - 1) / 2]; }   // (the prim's place is the world's: the screen's x, and y * SA - z * CA down it)
    else if (prop === 'glow') { const gm = (c) => { const rgb = hexRgb(c), R = cloth(c); return (Q) => { Q.e = [rgb[0], rgb[1], rgb[2], 150]; Q.k += 0.5; return R; }; }; C(vadd(hR, [0, 0.4, -0.6]), vadd(hR, [0.6, 1.2, 5.6]), 0.9, 0.9, GR.ACC, 'purse', gm(A.bagColor || '#5af04a')); C(vadd(hL, [0, 0.4, -0.6]), vadd(hL, [-0.6, 1.2, 5.6]), 0.9, 0.9, GR.ACC, 'purse', gm(A.prop[1] || '#ff5aa8')); }
    else if (acc === 'purse' && pbox) B(vadd(hR, D.hold ? mv(S.SP, [-2.6, 3.6, 5.2]) : mv(S.PF, [pbox[4] || 0.2, 1.8, pbox[3]])), D.hold ? S.SP : S.PF, pbox.slice(0, 3), GR.ACC, 'purse', W.leather);   // (in front of the thigh, where it shows from the front; the sprite ends at the hand)
    else if (acc === 'purse' && !(PL && A.prop && A.prop[0] === 'camera')) B(vadd(hR, [0, 0, A.bagSmall ? -1.6 : -3.2]), S.PF, A.bagSmall ? [0.8, 2.2, 1.2] : [1.1, 2.6, 2.0], GR.ACC, 'purse', W.leather);   // (the polish pass: a camera hangs on the chest from its strap - peoplepolish.js NECK - not in the hand)   // (the polish pass: a camera's body three art pixels by two)
    if (acc === 'shopping') { B(vadd(hR, [0.4, 0, -4.4]), S.PF, [1.2, 2.8, 3.4], GR.ACC, 'bagR', W.paper); B(vadd(hL, [-0.4, 0, -4.4]), S.PF, [1.2, 2.8, 3.4], GR.ACC, 'bagL', W.paper); }
    if (acc === 'coffee') C(vadd(hR, [0, 0.4, 1.2]), vadd(hR, [0, 0.4, 4.4]), 1.2, 1.55, GR.ACC, 'cup', W.cup);
    if (acc === 'cane') C(vadd(hR, [0, 0.6, 0.6]), [hR[0] + 0.6, hR[1] + 3.4, 0.4], 0.62, 0.55, GR.ACC, 'cane', W.wood);
    if (acc === 'cane' && prop === 'poles') C(vadd(hL, [0, 0.6, 0.6]), [hL[0] - 0.6, hL[1] + 3.4, 0.4], 0.62, 0.55, GR.ACC, 'cane', W.wood);   // (trekking poles: one a hand)
    if (acc === 'board') E(vadd(hR, [1.9, -0.8, 6.4]), frameUp([0.08, 0.15, 1], [0, 1, 0]), [1.0, 4.4, 14], GR.ACC, 'board', W.board);
  }
  figure365(B, C, E, D, P, S, acc);   // (the city's people, at the end)
  return { prims: out, head: out.indexOf(headP), W, TF };
}
// CB3's silhouettes (second pass): each style its own outline - spikes that stick out, curls and an afro as a bumpy mass,
// braids and locks hanging down the back, a ponytail that swings with the stride, buns on top, long hair falling over
// the shoulders and down the back, a mohawk's crest of spikes, a fade's short sides under a block of volume on top.
// The camera mostly sees the top and the back of a head, so the outline counts from behind and above as much as in front.
function hairPrims(E, C, A, D, P, S, W, at, hat, seed) {
  // the look system's variants of a style (shared/look.js HAIR_STYLES: no two styles drawn alike) start from their base
  // style and add their own touch below
  const ex = A.hair?.style || 'short';
  let st = BASE_HAIR[ex] || ex;
  if (A.mask || (A.fmask && (A.fmask.k === 'pig' || A.fmask.k === 'alien'))) return;   // a balaclava, a ski mask or a costume head hides the hair completely
  const hatOn = hat && !['bandana', 'headband', 'visor', 'flowers', 'tiara', 'earmuffs', 'catears', 'veil'].includes(hat) && !(PL && hat === 'paper');   // (the polish pass: a paper hat is a narrow cap on top of the hair - cut as under a hat, the head was bald round it)   // (a crown of flowers, a tiara, earmuffs, cat ears or a veil sit on the hair as it is)
  if (hatOn) { if (st === 'afro' || st === 'spiky' || st === 'curly' || st === 'mohawk' || st === 'topknot' || st === 'twinbuns' || st === 'curtains' || st === 'shag') st = 'short'; if (['hood', 'helmet', 'hijab', 'turban', 'durag', 'wrap', 'moto', 'skatehelmet'].includes(hat)) return; }   // (all the hair under a hood, a helmet, a hijab, a turban, a durag or a wrap)
  if (st === 'bald') return;
  const hr = D.head, HD = S.HD;
  const vol = ({ sides: 0.7, quiff: 0.7, sidepart: 0.75, bigcurls: 1.2, shoulder: 0.95, boxbraids: 0.55 }[ex] ?? { buzz: 0.25, slick: 0.55, short: 0.85, spiky: 0.9, curly: 1.05, afro: 1.0, long: 0.95, wavy: 1.15, pony: 0.7, bun: 0.7, braids: 0.6, dreads: 0.85, mohawk: 0.22, bob: 1.25,
    undercut: 0.75, fade: 0.45, mullet: 0.9, topknot: 0.6, pixie: 0.85, twinbuns: 0.7, pigtails: 0.75, braid: 0.7, curlylong: 1.3, shag: 1.15, cornrows: 0.3, curtains: 1.0, halfup: 0.95 }[st] ?? 0.9) * ((PL && PL.hairVol) || 1);
  // the hairline in the cap's own unit coords, by the angle round the head from the face: [forehead, temple, sideburn,
  // above the ear, nape]; the face, temples and ears stay clear so a profile still shows the eye, nose and ear
  const LN0 = { buzz: [0.5, 0.44, -0.12, 0.2, -0.5], slick: [0.5, 0.44, -0.2, 0.14, -0.55], short: [0.42, 0.38, -0.28, 0.1, -0.6], spiky: [0.5, 0.42, -0.24, 0.1, -0.62],
    curly: [0.42, 0.36, -0.22, 0.02, -0.62], afro: [0.42, 0.36, -0.12, -0.15, -0.7], long: [0.4, 0.34, -0.75, -0.75, -1.1], wavy: [0.38, 0.32, -0.75, -0.75, -1.1],
    pony: [0.42, 0.38, -0.08, 0.06, -0.55], bun: [0.42, 0.38, -0.08, 0.06, -0.55], braids: [0.42, 0.36, -0.32, -0.3, -1.1], dreads: [0.4, 0.36, -0.32, -0.32, -1.1],
    mohawk: [0.6, 0.54, 0.0, 0.25, -0.45], bob: [0.3, 0.26, -0.62, -0.62, -0.75],
    undercut: [0.42, 0.42, 0.32, 0.42, 0.25], fade: [0.46, 0.42, 0.05, 0.28, -0.15], mullet: [0.42, 0.38, -0.28, 0.1, -0.6], topknot: [0.46, 0.42, -0.1, 0.12, -0.5],
    pixie: [0.3, 0.28, -0.25, 0.08, -0.55], twinbuns: [0.42, 0.38, -0.08, 0.06, -0.55], pigtails: [0.38, 0.36, -0.1, 0.0, -0.6], braid: [0.42, 0.38, -0.08, 0.06, -0.55],
    curlylong: [0.36, 0.3, -0.75, -0.75, -1.1], shag: [0.28, 0.24, -0.6, -0.6, -0.8], cornrows: [0.5, 0.44, -0.12, 0.2, -0.5], curtains: [0.3, 0.26, -0.3, 0.08, -0.6],
    halfup: [0.4, 0.34, -0.75, -0.75, -1.1] }[st] || [0.42, 0.38, -0.28, 0.1, -0.6], LN = (PL && PL.hairLN && (PL.hairLN[ex] || PL.hairLN[st])) || LN0;
  const AZ = [0, 0.8, 1.2, 1.32, 1.5, 1.64, 2.2, Math.PI], HV = [LN[0], LN[0], LN[1], LN[2], LN[2], LN[3], LN[3] - 0.04, LN[4]];
  const jag = st === 'spiky' || st === 'short' || st === 'curly' || st === 'bob' || st === 'pixie' || st === 'shag' || st === 'curtains' || st === 'mullet';
  const cut = hatOn ? 0.18 : (PL && PL.hairCut && PL.hairCut[ex]) || 9;
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
  // round the neck in the torso's frame (x right, y forward, z up): where hanging hair falls; the stride's sway (side to
  // side with the steps, lifted back on a run) grows down its length
  const nk = (x, y, z) => vadd(S.neck, mv(S.SP, [x, y, z]));
  const G = P.gait, swing = G ? Math.sin(2 * Math.PI * (P.ph || 0)) * (G.run ? 2.2 : 1.3) : (P.breath || 0) * 0.6, lift = G && G.run ? 1.8 : 0;
  const sw = (p, k) => vadd(p, mv(S.SP, [swing * k, -lift * k, lift * 0.45 * k]));
  const backY = -(D.chestR[1] + 0.9);                               // just off the upper back
  const lock = (a, b, ra, rb, part = 'lock') => C(a, b, ra, rb, GR.HAIR, part, W.hairLock);
  // a point on the cap's surface at angle az round the head (0 the face, + to the right) and el above the ear line
  const onCap = (az, el, out = 0) => vadd(capC, mv(HD, [Math.sin(az) * Math.cos(el) * (hr[0] + vol + out), Math.cos(az) * Math.cos(el) * (hr[1] + vol + out), Math.sin(el) * (hr[2] + vol * 0.85 + out)]));
  const spike = (n, len, el0, el1, r0, backK = 0.6, face = 0.55) => {
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + rnd(i, 1) * 0.5, el = el0 + (el1 - el0) * rnd(i, 2);
      if (Math.cos(az) > face && el < 0.55) continue;                 // keep the face clear
      const d = vnorm([Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el) * 0.85 - 0.05, Math.sin(el) + 0.12]);
      const b = vadd(capC, mv(HD, [d[0] * hr[0] * 0.72, d[1] * hr[1] * 0.72, d[2] * hr[2] * 0.72]));
      const L = hr[0] + vol + len * (0.65 + rnd(i, 3) * 0.55) * (Math.cos(az) < -0.4 ? backK : 1);
      C(b, vadd(capC, mv(HD, [d[0] * L, d[1] * L, d[2] * L])), r0, 0.3, GR.HAIR, 'spike', W.hairM);
    }
  };
  // bumps round a mass: curls standing proud of its outline
  const bumps = (c0, R, n, r, el0, el1, face = 0.5, k = 0.94) => {
    for (let i = 0; i < n; i++) {
      const az = i * 2.39996 + rnd(i, 4) * 0.4, el = el0 + (el1 - el0) * rnd(i, 5);
      if (Math.cos(az) > face && el < 0.5) continue;
      E(vadd(c0, mv(HD, [Math.sin(az) * Math.cos(el) * R[0] * k, Math.cos(az) * Math.cos(el) * R[1] * k, Math.sin(el) * R[2] * k])), HD, [r, r, r * 0.92], GR.HAIR, 'curl', W.hairM);
    }
  };
  if (cut < 9) { if (!['pony', 'long', 'wavy', 'braids', 'dreads', 'bob', 'pigtails', 'braid', 'curlylong', 'halfup', 'mullet'].includes(st)) return; }
  const HX = PL && { E, C, at, nk, sw, lock, bumps, W, S, D, hr, HD, backY, GR, capC, mmul, rx, ry, hatOn }, re = HX && PL.hairRe && PL.hairRe(ex, HX);   // (pass 5: the styles the pass draws in shapes of its own)
  if (re) { /* drawn */ }
  else if (st === 'spiky') {
    spike(12, 4.6, 0.3, 1.35, 2.3);
    for (let i = 0; i < 4; i++) { const a = -0.55 + i * 0.36; C(at([a * 0.9, 0.5, 0.92]), at([a * 1.2, 1.2, 0.55 + rnd(i, 9) * 0.12]), 1.6, 0.4, GR.HAIR, 'spike', W.hairM); }
  }
  else if (st === 'curly') bumps(capC, [hr[0] + vol, hr[1] + vol, hr[2] + vol * 0.85], 18, 2.0, 0.0, 1.35, 0.55, 0.98);
  else if (st === 'afro') {
    const ac = vadd(S.head, mv(HD, [0, -0.6, 2.0])), R = [hr[0] * 1.48, hr[1] * 1.42, hr[2] * 1.2];
    E(ac, HD, R, GR.HAIR, 'afro', W.hairM, (a, b, c) => !(b > 0.45 && c < 0.08 && Math.abs(a) < 0.7));
    bumps(ac, R, 22, 2.5, -0.35, 1.4, 0.45, 0.9);
  }
  else if (st === 'bun') { E(at([0, -0.3, 1.12]), HD, [3.1, 3.0, 2.7], GR.HAIR, 'bun', W.hairM); E(at([0, -0.3, 0.9]), HD, [2.1, 2.0, 0.9], GR.HAIR, 'tie', () => cloth('#3a2a30')); }
  else if (st === 'pony') {
    // tied high at the back of the crown, the tail rising before it falls (CB3-F, CC9): from the game's camera it shows
    // over the head even from the front
    const r0 = at([0, -0.72, 0.86]), up = sw(at([0, -1.3, 1.22]), 0.2), m = sw(nk(0, -5.8, 3.6), 0.45), e = sw(nk(0, backY - 0.8, -3.8), 1);
    E(r0, HD, [1.6, 1.4, 1.5], GR.HAIR, 'tie', () => cloth('#c8302c'));
    lock(r0, up, 2.5, 2.4, 'tail'); lock(up, m, 2.4, 2.0, 'tail'); lock(m, e, 2.0, 0.8, 'tail');
  }
  else if (st === 'topknot') { E(at([0, -0.05, 1.18]), HD, [2.3, 2.2, 2.3], GR.HAIR, 'bun', W.hairM); E(at([0, -0.05, 1.0]), HD, [1.5, 1.4, 0.7], GR.HAIR, 'tie', () => cloth('#2a2226')); }
  else if (st === 'twinbuns') for (const s of [-1, 1]) E(at([s * 0.62, -0.18, 0.95]), HD, [2.5, 2.4, 2.3], GR.HAIR, 'bun', W.hairM);
  else if (st === 'pigtails') for (const s of [-1, 1]) { const r0 = at([s * 0.9, -0.45, 0.3]), m = sw(nk(s * (hr[0] + 1.6), -2.6, 1.0), 0.5), e = sw(nk(s * (hr[0] + 1.2), -2.2, -4.6), 1); E(r0, HD, [1.2, 1.1, 1.2], GR.HAIR, 'tie', () => cloth('#c8302c')); lock(r0, m, 1.8, 1.6, 'tail'); lock(m, e, 1.6, 0.8, 'tail'); }
  else if (st === 'braid') {
    // a single braid down the back: beads one under the other read as plaited
    const r0 = at([0, -0.98, 0.2]), e = sw(nk(0, backY - 0.6, -10.5), 1);
    for (let i = 0; i <= 6; i++) { const t = i / 6, p = vlerp(r0, e, t); E(vadd(p, mv(S.SP, [(i & 1 ? 0.35 : -0.35), 0, 0])), S.SP, [1.7 - t * 0.7, 1.4 - t * 0.5, 1.5 - t * 0.4], GR.HAIR, 'lock', W.hairLock); }
    E(vadd(e, [0, 0, -0.6]), HD, [0.8, 0.8, 0.7], GR.HAIR, 'tie', () => cloth('#c8302c'));
  }
  else if (st === 'halfup') E(at([0, -0.88, 0.62]), HD, [1.9, 1.7, 1.7], GR.HAIR, 'bun', W.hairM);
  else if (st === 'mullet') { lock(at([0, -0.7, -0.1]), sw(nk(0, backY, -5.6), 1), 4.6, 3.4, 'curtain'); for (const s of [-1, 1]) lock(at([s * 0.6, -0.6, -0.2]), sw(nk(s * 2.6, backY + 0.3, -4.8), 1), 2.0, 1.2); }
  else if (st === 'mohawk') {
    // a crest of spikes from the forehead over the crown to the nape, the sides shaved
    E(at([0, -0.08, 0.9]), HD, [1.05, hr[1] * 0.98, hr[2] * 0.6], GR.HAIR, 'crest', W.hairM, (a, b, c) => c > -0.3);
    for (let i = 0; i < 7; i++) {
      const t = i / 6, ang = 0.95 - t * 2.35, dy = Math.sin(ang), dz = Math.cos(ang);
      const b = vadd(S.head, mv(HD, [0, dy * hr[1] * 0.8, dz * hr[2] * 0.8])), L = 1 + (3.2 + 2.2 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + rnd(i, 3) * 0.8) / Math.max(hr[1], hr[2]);
      C(b, vadd(S.head, mv(HD, [0, dy * hr[1] * L + 0.6, dz * hr[2] * L])), 1.75, 0.35, GR.HAIR, 'spike', W.hairM);
    }
  }
  else if (st === 'fade') {
    // short sides and back (stubble, W.hairM) under a block of volume on top
    const tc = at([0, 0.06, 0.8]);
    E(tc, HD, [hr[0] * 0.8, hr[1] * 0.86, 3.4], GR.HAIR, 'top', W.hairM, (a, b, c) => c > -0.55);
    if (ex === 'fade') bumps(tc, [hr[0] * 0.8, hr[1] * 0.86, 3.4], 10, 1.45, 0.2, 1.2, 0.95, 0.92);
  }
  else if (st === 'undercut') { const F = mmul(HD, ry(ex === 'shavedside' ? 0.5 : 0.3)); E(at([0.1, 0.1, 0.74]), F, [hr[0] * 0.86, hr[1] * 0.96, 2.6], GR.HAIR, 'top', W.hairM, (a, b, c) => c > -0.6); }
  else if (st === 'pixie') E(at([0.3, 0.62, 0.62]), mmul(HD, ry(0.5)), [hr[0] * 0.55, 2.4, 1.7], GR.HAIR, 'sweep', W.hairM);
  else if (st === 'curtains') for (const s of [-1, 1]) E(at([s * 0.46, 0.7, 0.38]), mmul(HD, ry(-s * 0.55)), [hr[0] * 0.5, 2.3, 2.3], GR.HAIR, 'sweep', W.hairM);   // (parted in the middle, falling to the brows at the sides)
  else if (st === 'cornrows') for (let i = -2; i <= 2; i++) lock(at([i * 0.22, -0.9, -0.35]), sw(nk(i * 0.9, backY + 1.4, -3.2), 0.6), 0.75, 0.55);
  else if (st === 'shag') for (let i = 0; i < 12; i++) {                // layers: jagged ends round the sides and the back
    const az = 0.9 + (i / 11) * (2 * Math.PI - 1.8) + rnd(i, 6) * 0.2, el = -0.45 + rnd(i, 7) * 0.4;
    C(onCap(az, el + 0.4, -1.2), onCap(az, el - 0.25, 0.6 + rnd(i, 8) * 0.9), 1.5, 0.4, GR.HAIR, 'spike', W.hairM);
  }
  if (!hatOn && !re) {
    if (ex === 'quiff') { E(at([0.04, 0.5, 1.02]), mmul(HD, rx(-0.5)), [hr[0] * 0.72, 3.2, 2.9], GR.HAIR, 'quiff', W.hairM); E(at([0.02, 0.05, 1.04]), HD, [hr[0] * 0.66, 3.6, 1.8], GR.HAIR, 'quiff', W.hairM); }
    else if (ex === 'sidepart') E(at([0.28, 0.32, 0.9]), mmul(HD, ry(0.25)), [hr[0] * 0.62, hr[1] * 0.62, 1.8], GR.HAIR, 'sweep', W.hairM);
    else if (ex === 'manbun') { E(at([0, -0.66, 0.84]), HD, [2.6, 2.5, 2.5], GR.HAIR, 'bun', W.hairM); E(at([0, -0.52, 0.72]), HD, [1.6, 1.0, 1.4], GR.HAIR, 'tie', () => cloth('#2a2226')); }
    else if (ex === 'bigcurls') bumps(vadd(capC, mv(HD, [0, -0.4, -1.2])), [hr[0] + 1.9, hr[1] + 1.6, hr[2] + 0.9], 18, 2.4, -0.55, 1.05, 0.45, 1);
    else if (ex === 'shavedside') { lock(at([-0.35, 0.25, 1.02]), at([1.0, 0.3, -0.1]), 2.7, 1.8); lock(at([0.2, -0.3, 0.98]), sw(at([1.08, -0.4, -0.6]), 0.3), 2.5, 1.6); lock(at([0.6, 0.0, 0.5]), at([1.12, 0.05, -0.75]), 1.6, 0.6); }
  }
  if (HX && PL.hair && !hatOn && !re) PL.hair(ex, HX);
  if (st === 'long' || st === 'wavy' || st === 'braids' || st === 'dreads' || st === 'bob' || st === 'curlylong' || st === 'halfup' || st === 'shag') {
    const curls = st === 'curlylong', wav = st === 'wavy' || st === 'curlylong' || st === 'halfup';
    if (st === 'curlylong' || st === 'halfup') st = 'wavy'; else if (st === 'shag') st = 'bob';
    if (st === 'dreads' || st === 'braids') {
      // locks or braids hanging all round the back and sides: a curtain of strands seen from behind
      const bx = ex === 'boxbraids', br = st === 'braids', nL = bx ? 14 : br ? 9 : 10, drop = bx ? -9.5 : br ? -8.5 : -6.0;
      for (let i = 0; i < nL; i++) {
        const a = -2.0 + i * (4.0 / (nL - 1)), d = [Math.sin(a), Math.cos(a) * 0.9 - 0.25, 0], side = Math.abs(a) > 1.3;
        const r0 = at([d[0] * 0.95, d[1] * 0.95, 0.1]), e = sw(nk(d[0] * (hr[0] * (side ? 1.05 : 0.8)), side ? d[1] * 3 - 1.5 : backY - 0.3 + Math.abs(d[0]) * 1.4, drop * (side ? 0.8 : 1) + rnd(i, 11) * 1.2), 1);
        const rr = bx ? 0.78 : br ? 1.05 : 1.0;
        lock(r0, e, rr, rr * 0.8);
        if (bx && i % 2 === 0) E(vadd(e, mv(S.SP, [0, 0, 0.9])), HD, [0.85, 0.85, 0.75], GR.HAIR, 'cuff', W.cuff);
        if (br && i % 3 === 1) E(vadd(e, [0, 0, -0.4]), HD, [0.7, 0.7, 0.6], GR.HAIR, 'cuff', W.cuff);
      }
    } else if (st === 'bob') {
      lock(at([0, -0.5, 0.05]), nk(0, -3.3, 0.2), hr[0] * 0.84, hr[0] * 0.76, 'curtain');
      for (const s of [-1, 1]) lock(at([s * 0.9, 0.22, 0.25]), at([s * 0.97, 0.36, -0.88]), 2.7, 2.3, 'curtain');   // (framing the face to the jaw, CB3-F)
    } else {
      // long hair: a sheet down the back to the shoulder blades (or the shoulders), wider than the neck
      const top = at([0, -0.62, 0.2]), hem = sw(nk(0, backY - 0.4, ex === 'shoulder' ? -4.2 : -10.2), 1), mid = vlerp(top, hem, 0.5), up = vsub(top, hem);
      const len = vlen(up) / 2 + 1.2, F = frameUp(up, mv(S.SP, [0, 1, 0]));
      E(mid, F, [hr[0] * (ex === 'shoulder' ? 1.0 : 1.08), 2.0, len], GR.HAIR, 'curtain', W.hairLock, (a, b, c) => c < 0.62 || b < 0.2);
      if (wav || curls) for (let i = 0; i < (curls ? 10 : 6); i++) {   // waves and curls break the edges and the hem
        const t = 0.25 + (i >> 1) / ((curls ? 10 : 6) / 2) * 0.75, s = i & 1 ? 1 : -1, p = vadd(vlerp(top, hem, t), mv(F, [s * hr[0] * (1.0 - t * 0.15), -0.4, 0]));
        E(p, HD, curls ? [2.0, 2.0, 1.9] : [1.5, 1.5, 2.2], GR.HAIR, curls ? 'curl' : 'lock', curls ? W.hairM : W.hairLock);
      }
    }
    // in front of the shoulders: locks over the collarbones (CB3-F)
    // (fuller and from the temples at the game's size, so long hair frames the face from the front as CB3-F draws it)
    if (st !== 'dreads' && st !== 'bob' && (D.fem || ex === 'shoulder')) for (const [k, s] of [['L', -1], ['R', 1]]) lock(at([s * 0.88, 0.24, 0.22]), vadd(S['sh' + k], mv(S.SP, [-s * 1.8, 2.3, st === 'braids' ? -6.5 : ex === 'shoulder' ? 0.5 : -3.8])), st === 'braids' ? 1.4 : 2.8, st === 'braids' ? 1.1 : 2.0);
  }
}
// ---- lights to carry (#359): a lamp on the forehead - the headlamp on its strap (hat kind 'headband'), or on the
// front of the hard hat (A.hat.lamp; game/host.js puts them on from the descriptor's fl / hh). Small: a dark housing,
// a pale lens (its beam is the renderer's light).
const LAMP_BODY = cloth('#2a2a32'), LAMP_LENS = cloth('#fff4c8');
function lampPrims(E, S, at, k) {
  const y = k === 'hard' ? 1.45 : 1.12, z = k === 'hard' ? 0.5 : 0.4;
  E(at([0, y, z]), S.HD, [1.45, 0.95, 1.1], GR.HAT, 'lamp', () => LAMP_BODY);
  E(at([0, y + 0.1, z]), S.HD, [0.85, 0.55, 0.7], GR.HAT, 'lens', () => LAMP_LENS);
}
// ---- end ----
// CP2's masks that stand off the face: a pig's ears and snout, a gas mask's filters, a welding mask's shield with its
// dark window, a masquerade mask's feathers
function maskPrims(E, C, B, A, at, HD, hr) {
  const k = A.fmask && A.fmask.k, mc = A.fmask ? cloth(A.fmask.c) : null;
  if (k === 'pig' && A.fmask.animal === 'chicken' && PL) {   // (a chicken: a red comb in three lobes over the crown, a yellow beak, a wattle under it)
    const red = cloth(A.fmask.t || '#c8262b'), yl = cloth('#f2a81b');
    for (const [y, hgt] of [[0.5, 2.3], [0.1, 3.0], [-0.3, 2.3]]) E(at([0, y, 1.02]), HD, [1.3, 1.6, hgt], GR.HAT, 'pigear', () => red);
    C(at([0, 0.82, -0.2]), at([0, 1.32, -0.34]), 1.8, 0.7, GR.HAT, 'snout', () => yl);
    E(at([0, 0.88, -0.66]), HD, [1.0, 0.8, 1.6], GR.HAT, 'pigear', () => red);
  } else if (k === 'pig' && A.fmask.animal && PL) {
    // (the polish pass, the owner 11-20: "bear and panda masks need ears/markings" - both were a pig's head in another color.
    // Round ears up on the corners of the head, two art pixels each (a panda's black); a short pale muzzle, a dark nose on it)
    const panda = A.fmask.animal === 'panda', ec = panda ? cloth(A.fmask.t || '#1a1a1e') : cloth(mixHex(A.fmask.c, '#000000', 0.3)), mz = cloth(mixHex(A.fmask.c, '#ffffff', panda ? 0 : 0.5)), nose = cloth('#1a1416');
    for (const s of [-1, 1]) E(at([s * 0.8, -0.05, 0.98]), HD, [3.1, 1.5, 3.1], GR.HAT, 'pigear', () => ec);   // (the owner, 20:15: "ears could be bigger")
    C(at([0, 0.8, -0.36]), at([0, 1.2, -0.42]), 2.3, 2.0, GR.HAT, 'snout', () => mz);   // (short: at an angle a long one read as a beak; its nose and mouth are stamped on it - peoplepolish.js masks)
  } else if (k === 'pig' && PL) {   // (the polish pass: ears that show - folded triangles on the corners - and a short broad snout, its nostrils stamped on)
    const ec = cloth(mixHex(A.fmask.c, '#7a2a40', 0.3)), sn = cloth(mixHex(A.fmask.c, '#ffffff', 0.25));
    for (const s of [-1, 1]) E(at([s * 0.78, 0.0, 0.95]), mmul(HD, ry(s * 0.5)), [2.5, 1.2, 2.2], GR.HAT, 'pigear', () => ec);
    C(at([0, 0.8, -0.34]), at([0, 1.02, -0.36]), 2.2, 2.0, GR.HAT, 'snout', () => sn);
  } else if (k === 'pig') {
    for (const s of [-1, 1]) E(at([s * 0.6, -0.05, 0.84]), HD, [1.25, 0.55, 1.5], GR.HAT, 'pigear', () => mc);
    const sn = cloth(mixHex(A.fmask.c, '#ffffff', 0.2)), hole = cloth('#8a4a58');
    C(at([0, 0.86, -0.3]), at([0, 1.2, -0.32]), 1.5, 1.4, GR.HAT, 'snout', (Q) => (Q.l0 > 0.97 && Math.abs(Q.l1) > 0.2 && Math.abs(Q.l1) < 0.65 && Math.abs(Q.l2) < 0.4 ? hole : sn));
  } else if (k === 'gas') {
    const fc = cloth(A.fmask.t);
    if (PL) C(at([0, 0.86, -0.6]), at([0, 1.22, -0.7]), 2.0, 1.9, GR.HAT, 'filter', (Q) => { if (Q.l0 > 0.75) Q.k -= 0.3; return fc; });   // (the polish pass: one canister in front of the mouth - two small ones at the cheeks were specks)
    else for (const s of [-1, 1]) C(at([s * 0.38, 0.9, -0.58]), at([s * 0.72, 1.28, -0.72]), 1.25, 1.2, GR.HAT, 'filter', (Q) => { if (Q.l0 > 0.8) Q.k -= 0.25; return fc; });
  } else if (k === 'welding') {
    const win = cloth(PL ? '#2f6f5a' : '#141618');   // (the polish pass: a dark green glass - black on charcoal did not show)
    B(at([0, 1.0, -0.12]), HD, [hr[0] * 0.9, 1.3, hr[2] * 0.88], GR.HAT, 'weld', (Q) => (Math.abs(Q.l2 - 0.3) < (PL ? 0.22 : 0.16) && Math.abs(Q.l0) < 0.62 ? (PL && (Q.gloss = 1), win) : mc));   // (deep enough that the nose stays behind it)
  }
  if (k === 'clown' && PL) { const tc = cloth(A.fmask.t || '#c8262b'); for (const s of [-1, 1]) E(at([s * 1.12, -0.15, 0.3]), HD, [3.0, 3.0, 3.0], GR.HAT, 'pigear', () => tc); }   // (a clown's tufts of hair at the sides, in its trim)
  if (A.masq) {
    const F = [cloth(A.masq), cloth('#c8262b'), cloth('#7a3ac8')];
    for (let i = 0; i < 3; i++) C(at([0.55, 0.62, 0.42]), at([0.75 + i * 0.16, 0.5 - i * 0.18, (PL ? 1.75 : 1.45) + (i === 1 ? 0.15 : 0)]), PL ? 0.95 : 0.62, PL ? 0.45 : 0.2, GR.HAT, 'feather', () => F[i]);
  }
}
function hatPrims(E, C, A, D, S, W, at, k, B) {
  // peaks turn up a little and stay short: from the game's high camera a long flat peak would hide the eyes
  const hr = D.head, HD = S.HD, HDb = mmul(HD, rx(-0.24));
  const brim = (dy, rx_, ry_, th, z = 0.32, F = HDb) => E(vadd(S.head, mv(F, [0, dy, hr[2] * z])), F, [rx_, ry_, th], GR.HAT, 'brim', W.brim);
  if (k === 'cap' || k === 'trucker') {
    const bk = A.hat.back ? -1 : 1;   // (worn backwards: the peak over the nape)
    // (the polish pass, the owner 20:15: worn backwards "a little gap in the back of the hat (which is facing us in the front view) where the adjuster is" - an arch over the brow, the strap under it)
    E(at([0, -0.05, 0.3]), HD, [hr[0] + 1.1, hr[1] + 1.1, hr[2] * 0.82], GR.HAT, 'crown', W.hat, (a, b, c) => c > (b * bk > 0.3 ? 0.05 : -0.14) && !(PL && bk < 0 && b > 0.55 && Math.abs(a) < 0.36 && c > 0.06 && c < 0.5));
    if (bk > 0) brim(hr[1] + 0.5, hr[0] * 0.78, 2.9, 0.6, 0.44);
    else if (PL) brim(-(hr[1] + 1.9), hr[0] * 0.86, 4.2, 0.8, 0.26, mmul(HD, rx(0.2)));   // (the polish pass, the owner 11-20: "cap backwards has no bill" - out past the hair behind, two art pixels of it)
    else brim(-(hr[1] + 0.4), hr[0] * 0.78, 2.6, 0.6, 0.34, mmul(HD, rx(0.3)));
    E(at([0, -0.05, 1.07]), HD, [0.8, 0.8, 0.6], GR.HAT, 'button', W.hat);
  } else if (k === 'police') {
    E(at([0, 0.04, 0.62]), HD, [hr[0] + 1.5, hr[1] + 1.7, 2.6], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.6);
    E(at([0, 0, 0.36]), HD, [hr[0] + 0.9, hr[1] + 0.9, 1.4], GR.HAT, 'band', W.band);
    brim(hr[1] + 0.5, hr[0] * 0.72, 2.6, 0.6, 0.42);
  } else if (k === 'hard') {
    E(at([0, -0.08, 0.4]), HD, [hr[0] + 1.6, hr[1] + 1.3, hr[2] * 0.9], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.02);
    if (PL && A.hat.riding) {   // (a riding helmet - the owner, 21:55: "could look cooler": a glossy dome, a dark peak out over the brow, a band of the trim from the brow over the crown to the nape, a harness strap down each cheek)
      const tr = cloth(A.hat.trim || 'silver'), dk = cloth('#1a1a1e'); brim(hr[1] + 1.3, hr[0] * 0.84, 3.6, 0.7, 0.36);
      E(at([0, -0.08, 0.42]), HD, [1.5, hr[1] + 1.55, hr[2] * 0.9 + 0.5], GR.HAT, 'crest', (Q) => { Q.gloss = 1; return tr; }, (a, b, c) => c > 0.05);
      for (const s of [-1, 1]) C(at([s * 0.98, 0.25, 0.1]), at([s * 0.7, 0.55, -0.85]), 0.7, 0.7, GR.HAT, 'strapc', () => dk);
    }
    else brim(-0.5, hr[0] + 2.1, hr[1] + 2.0, 0.55, 0.42, HD);
    if (PL && A.hat.fire) {   // (the polish pass, the owner's note: a fire helmet - a ridge over the crown, the long brim down the neck, a shield in front)
      const tr = cloth(A.hat.trim || 'yellow');
      C(at([0, 0.7, 1.12]), at([0, -0.8, 1.12]), 1.0, 1.0, GR.HAT, 'crest', W.hat);
      E(vadd(S.head, mv(HD, [0, -(hr[1] + 2.2), hr[2] * 0.3])), mmul(HD, rx(0.35)), [hr[0] + 1.2, 3.2, 0.6], GR.HAT, 'brim', W.brim);
      E(at([0, 0.98, 0.62]), HD, [1.7, 0.6, 1.5], GR.HAT, 'shield', () => tr);
    }
  } else if (k === 'beanie') {
    E(at([0, -0.15, 0.2]), HD, [hr[0] + 1.15, hr[1] + 1.1, hr[2] * 1.0], GR.HAT, 'crown', W.hat, (a, b, c) => c > (b > 0.2 ? 0.12 : -0.36));
    if (A.hat.pom) E(at([0, -0.12, 1.3]), HD, [1.9, 1.9, 1.7], GR.HAT, 'pom', W.band);                                     // (a pom-pom on top, the trim's colour)
    if (A.hat.slouch) E(at([0, -0.75, 0.75]), mmul(HD, rx(0.5)), [hr[0] * 0.9, 2.6, 2.4], GR.HAT, 'crown', W.hat);       // (the slouch at the back)
  } else if (k === 'bucket' || k === 'sunhat' || k === 'cowboy' || k === 'fedora') {
    // (CP1: the crown sits on top of the head and the brim at the hairline, its front turned up a little, so the high camera
    // still sees the eyes under it; a cowboy hat's sides curl up. At the game's size the brim has to read as a ring round
    // the crown - so it's thick and only a little tilted - and the dent along a cowboy hat's or a fedora's top is a darker
    // crease (W.hat), not a cut: cut, it read as two ears)
    const big = k === 'sunhat' ? 3.9 : k === 'cowboy' ? 3.9 : k === 'fedora' ? 2.6 : 1.8, HDw = mmul(HD, rx(k === 'bucket' ? -0.3 : -0.3)), tall = k === 'cowboy' || k === 'fedora';
    // the crown: narrower than the head and set high for a cowboy hat or a fedora (the brim stands out round it), a dome for
    // a bucket or a sun hat
    E(at([0, -0.1, k === 'bucket' ? 0.56 : tall ? 0.86 : 0.68]), HD, tall ? [hr[0] * 0.84, hr[1] * 0.8, hr[2] * 0.72] : [hr[0] + 0.5, hr[1] + 0.45, hr[2] * 0.78], GR.HAT, 'crown', W.hat, (a, b, c) => c > (tall ? -0.6 : -0.1));
    E(vadd(S.head, mv(HDw, [0, -0.4, hr[2] * 0.5])), HDw, [hr[0] + big, hr[1] + big * 0.85, 1.05], GR.HAT, 'brim', W.brim);
    if (PL && A.hat.feather) { const fc = cloth(A.hat.trim || 'red'); C(at([1.0, 0.15, 0.62]), at([1.35, -0.75, 1.9]), 1.15, 0.45, GR.HAT, 'feather', (Q) => { if (Math.abs(Q.l1) < 0.2) Q.k -= 0.22; return fc; }); }   // (a feather in the band, swept back: the concepts' feathered hat)
    if (k === 'cowboy' && !A.hat.flat) for (const s of [-1, 1]) E(vadd(S.head, mv(HDw, [s * (hr[0] + big - 1.0), -0.4, hr[2] * 0.66])), HDw, PL ? [1.3, hr[1] * 0.62, 1.2] : [1.3, hr[1] + 1.8, 1.3], GR.HAT, 'brim', W.brim);   // (the polish pass: the curl at the sides only - run the brim's whole length, it stood as two walls from behind and the hat was a box)
  } else if (k === 'helmet') {
    E(at([0, -0.2, 0.15]), HD, [hr[0] + 1.9, hr[1] + 2.0, hr[2] + 1.0], GR.HAT, 'crown', W.hat, (a, b, c) => c > (b > 0.4 ? -0.08 : -0.42));
    if (!A.hat.plain) E(at([0, 1.0, 0.16]), HD, [hr[0] * 0.78, 1.3, 1.6], GR.HAT, 'goggles', W.glass);
  } else if (k === 'beret') {
    E(at([0.12, -0.12, 0.66]), mmul(HD, ry(0.22)), [hr[0] + 1.7, hr[1] + 1.5, 2.3], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.45);
  } else if (k === 'tophat') {
    const b0 = at([0, -0.05, 0.55]);
    if (PL) {   // (the polish pass, the owner 20:15: "the white ring ... looked better on the before picture. Just want to make sure the top part is flat" - the round crown and its brim as they were, the dome cut off level under a lid)
      const R0 = hr[0] * 0.86; let LID = null; E(vadd(b0, mv(HD, [0, 0, 4.9])), HD, [R0 * 1.1, R0 * 1.1, 11.2], GR.HAT, 'crown', W.hat, (a, b, c) => Math.abs(c) < 0.44);
      E(vadd(b0, mv(HD, [0, 0, 9.8])), HD, [R0, R0, 0.4], GR.HAT, 'crown', (Q) => { const R = W.hat(Q); Q.gloss = 0; return (LID ||= [R[0], R[0], R[1], R[1], R[2]]); });   // (the lid in the hat's own dark tones: lit from straight above it came out white)
    }
    else C(b0, vadd(b0, mv(HD, [0, 0, 8.5])), hr[0] * 0.84, hr[0] * 0.9, GR.HAT, 'crown', W.hat);
    if (PL) E(vadd(b0, mv(HD, [0, 0, 1.5])), HD, [hr[0] * 1.0, hr[0] * 1.0, 5.0], GR.HAT, 'band', W.band, (a, b, c) => Math.abs(c) < 0.24);   // (the band a ring round the crown's foot, proud of it: as a capsule its domed end came up through the lid)
    else C(vadd(b0, mv(HD, [0, 0, 0.6])), vadd(b0, mv(HD, [0, 0, 2.0])), hr[0] * 0.87, hr[0] * 0.87, GR.HAT, 'band', W.band);
    E(vadd(S.head, mv(HD, [0, -0.2, hr[2] * 0.5])), HD, [hr[0] + 2.3, hr[1] + 2.1, 0.55], GR.HAT, 'brim', W.brim);
  } else if (k === 'visor') {
    E(at([0, -0.05, 0.34]), HD, PL ? [hr[0] + 2.9, hr[1] + 2.9, 1.9] : [hr[0] + 0.7, hr[1] + 0.7, 1.3], GR.HAT, 'crown', W.hat);   // (the polish pass, the owner 11-20: "visor needs a bill and wraps the head" - the band out over the hair all the way round, the bill twice as long)
    if (PL) brim(hr[1] + 2.6, hr[0] * 0.86, 4.2, 0.7, 0.34); else brim(hr[1] + 0.5, hr[0] * 0.78, 2.9, 0.5, 0.36);
  } else if (k === 'bandana' || k === 'headband') {
    E(at([0, -0.05, k === 'bandana' ? 0.3 : 0.34]), HD, [hr[0] + 0.7, hr[1] + 0.7, k === 'bandana' ? hr[2] * 0.85 : 1.3], GR.HAT, 'crown', W.hat, k === 'bandana' ? (a, b, c) => c > 0.16 : null);
    if (k === 'bandana') { E(at([0, -1.05, 0.25]), HD, [1.5, 1.2, 1.2], GR.HAT, 'knot', W.hat); C(at([0, -1.1, 0.2]), at([0.15, -1.3, -0.5]), 0.9, 0.5, GR.HAT, 'tail', W.hat); }
  } else if (k === 'hood') {
    E(at([0, -0.32, 0.12]), HD, [hr[0] + 1.9, hr[1] + 1.7, hr[2] + 1.6], GR.HAT, 'hoodup', (Q) => { if (Q.l1 > 0.3) Q.k -= 0.15; return W.top; }, (a, b, c) => !(b > 0.42 && c < 0.62 && Math.abs(a) < 0.74));
  }
  // ---- CP1's other headwear (2026-10-09), drawn for the game's size: each its own outline from the high camera
  else if (k === 'flatcap') {   // a newsboy: a flat crown pulled forward over a short peak
    E(at([0, 0.12, 0.52]), HD, [hr[0] + 1.2, hr[1] + 1.7, hr[2] * 0.55], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.25);
    brim(hr[1] + 0.6, hr[0] * 0.72, 1.9, 0.5, 0.34);
  } else if (k === 'bowler') {   // a round dome over a narrow curled brim
    E(at([0, -0.05, 0.74]), HD, [hr[0] * 0.98, hr[1] * 0.98, hr[2] * 0.78], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.35);
    E(at([0, -0.05, 0.42]), HD, [hr[0] * 0.99, hr[1] * 0.99, 0.9], GR.HAT, 'band', W.band);
    E(vadd(S.head, mv(HDb, [0, -0.3, hr[2] * 0.4])), HDb, [hr[0] + 1.6, hr[1] + 1.4, 0.75], GR.HAT, 'brim', W.brim);
  } else if (k === 'toque') {   // a chef's tall puffed white hat
    const b0 = at([0, -0.05, 0.5]);
    C(b0, vadd(b0, mv(HD, [0, -0.2, 2.4])), hr[0] * 0.9, hr[0] * 0.9, GR.HAT, 'band', W.hat);
    E(vadd(b0, mv(HD, [0, -0.3, 6.2])), HD, [hr[0] * 1.1, hr[1] * 1.08, 4.4], GR.HAT, 'crown', W.hat);
  } else if (k === 'paper') {   // the diner's paper hat: a folded garrison cap, front to back on top
    if (PL) E(at([0, 0, 1.12]), HD, [hr[0] * 0.62, hr[1] * 1.08, 3.0], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.35);   // (the polish pass: on top of the hair's volume and big enough to see - at its old place it was inside the hair)
    else E(at([0, 0, 0.8]), HD, [hr[0] * 0.5, hr[1] * 1.02, 1.7], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.3);
  } else if (k === 'veil') {   // a bride's veil: back from a comb on the crown, down over the shoulders behind
    E(at([0, -0.45, 0.3]), HD, [hr[0] + 1.1, hr[1] + 0.8, hr[2] + 0.7], GR.HAT, 'crown', W.hat, (a, b, c) => b < 0.3 - c * 0.3);
    E(vadd(S.neck, mv(S.SP, [0, -1.6, -1.8])), S.SP, [D.shX * 0.75, 0.9, 3.8], GR.HAT, 'drape', W.hat);
  } else if (k === 'sailor') {   // a round white cap, a stripe round it, the brim turned up all round
    E(at([0, -0.05, 0.62]), HD, [hr[0] + 0.8, hr[1] + 0.8, hr[2] * 0.62], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.2);
    E(at([0, -0.05, 0.42]), HD, [hr[0] + 1.3, hr[1] + 1.3, 1.3], GR.HAT, 'band', W.band);
  } else if (k === 'durag') {   // a tight cloth cap over the brow, its tails down the back of the neck
    E(at([0, -0.06, 0.22]), HD, [hr[0] + 0.45, hr[1] + 0.45, hr[2] + 0.4], GR.HAT, 'crown', W.hat, (a, b, c) => c > (b > 0.3 ? 0.36 : -0.55));
    for (const s of [-1, 1]) C(at([s * 0.18, -1.02, -0.1]), at([s * 0.34, -1.3, -1.35]), 1.1, 0.6, GR.HAT, 'tail', W.hat);
  } else if (k === 'wrap') {   // a patterned head wrap: a big wrapped mass on top, knotted at the front
    E(at([0, -0.3, 0.85]), HD, [hr[0] + 1.9, hr[1] + 1.8, hr[2] * 0.92], GR.HAT, 'crown', W.hat, (a, b, c) => c > -0.42);
    E(at([0, 0.5, 1.2]), HD, [2.4, 1.9, 1.8], GR.HAT, 'knot', W.hat);
  } else if (k === 'hijab') {   // over the head and the neck, framing the face, falling over the shoulders
    E(at([0, -0.15, 0.08]), HD, [hr[0] + 1.4, hr[1] + 1.35, hr[2] + 1.3], GR.HAT, 'crown', W.hat, (a, b, c) => !(b > 0.32 && Math.abs(a) < 0.66 && c < 0.5 && c > -0.88));
    E(vadd(S.neck, mv(S.SP, [0, -0.4, -1.6])), S.SP, [D.shX * 0.8, D.chestR[1] + 0.9, 3.6], GR.HAT, 'drape', W.hat, (a, b, c) => c > -0.4 || b < 0.6);
  } else if (k === 'turban') {   // wound round: a rounded volume with its folds
    // (the polish pass, the owner 20:15: "should look wrapped at some part of it" - a taller, fuller volume; its folds and the peak of the
    // under-wrap over the brow are drawn by W.hat)
    if (PL) E(at([0, -0.06, 0.78]), HD, [hr[0] + 2.0, hr[1] + 1.9, hr[2] * 1.08], GR.HAT, 'crown', W.hat, (a, b, c) => c > (b > 0.5 ? -0.16 : -0.45));
    else E(at([0, -0.1, 0.72]), HD, [hr[0] + 1.5, hr[1] + 1.45, hr[2] * 0.98], GR.HAT, 'crown', W.hat, (a, b, c) => c > (b > 0.5 ? -0.1 : -0.45));
  } else if (k === 'flowers') {   // a ring of flowers and leaves round the head
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; E(at([Math.sin(a) * 1.02, Math.cos(a) * 1.0, 0.42]), HD, [1.25, 1.25, 1.0], GR.HAT, i % 3 === 2 ? 'leaf' : 'flower', W.hat); }
  } else if (k === 'tiara') {   // a small crest of silver at the front of the head, a stone in it
    if (PL) {   // (the polish pass, the owner 20:15: "a little bigger and more clear it's a tiara ... back view doesn't look like anything" - a band over the hair from ear to ear, so it shows from behind; three points at the front, the middle one tall with the stone)
      const sv = (Q) => { Q.gloss = 1; Q.k += 0.2; return W.hat(Q); }, HT = mmul(HD, rx(0.42));
      E(at([0, 0.1, 0.1]), HT, [hr[0] + 2.9, 1.2, hr[2] + 2.9], GR.HAT, 'crown', sv, (a, b, c) => c > 0.2);
      for (const [x, hgt] of [[-0.42, 1.7], [0, 2.9], [0.42, 1.7]]) E(vadd(at([x, 0.1, 0.1]), mv(HT, [0, 0, hr[2] + 2.9 + hgt * 0.6])), HT, [1.25, 1.1, hgt], GR.HAT, 'crown', sv);
      E(vadd(at([0, 0.1, 0.1]), mv(HT, [0, 0.9, hr[2] + 4.3])), HT, [1.2, 0.9, 1.2], GR.HAT, 'gem', (Q) => { Q.gloss = 1; return W.band(); });
    } else {
    E(at([0, 0.58, 0.88]), mmul(HD, rx(0.5)), [hr[0] * 0.62, 0.5, 1.5], GR.HAT, 'crown', W.hat);
    E(at([0, 0.72, 0.98]), HD, [0.8, 0.6, 0.8], GR.HAT, 'gem', W.band);
    }
  } else if (k === 'earmuffs') {   // fluffy pads over the ears on a band over the top
    if (PL) {   // (the polish pass, the owner 11-20: "earmuffs not visible, add headphones" - the pads out past the hair, the band an arch over it; headphones a paler band and a colored face on each cup)
      const ph = A.hat.phones, bandC = ph ? cloth(mixHex(A.hat.color || '#1a1a1e', '#ffffff', 0.32)) : null, tr = cloth(A.hat.trim || 'royal blue');
      // (the owner, 20:15: the muffs "maybe too big now", the headphones "probably better before" - the first shapes' sizes, a little over, set out past the hair so they show; the band a thin arch)
      for (const s of [-1, 1]) { E(at([s * 1.36, -0.05, -0.08]), HD, ph ? [1.7, 2.2, 2.5] : [2.2, 2.5, 2.7], GR.HAT, 'muff', W.hat); if (ph) E(at([s * 1.5, -0.05, -0.08]), HD, [0.9, 1.3, 1.5], GR.HAT, 'cup', () => tr); }
      E(at([0, -0.05, 0]), HD, [hr[0] + 2.7, ph ? 0.75 : 0.9, hr[2] + 2.7], GR.HAT, 'band', ph ? () => bandC : W.band, (a, b, c) => c > 0.3);
    } else {
    for (const s of [-1, 1]) E(at([s * 1.22, -0.05, -0.05]), HD, [2.1, 2.3, 2.4], GR.HAT, 'muff', W.hat);
    E(at([0, -0.05, 0.98]), HD, [hr[0] + 0.5, 0.75, 0.6], GR.HAT, 'band', W.band);
    }
  } else if (k === 'catears') {   // two pointed ears on a band
    E(at([0, 0.0, 0.96]), HD, [hr[0] * 0.95, 0.6, 0.55], GR.HAT, 'band', W.hat);
    for (const s of [-1, 1]) C(at([s * 0.55, 0.0, 0.82]), at([s * 0.72, 0.05, 1.5]), 1.6, 0.25, GR.HAT, 'ear', W.hat);
  } else if (k === 'moto') {   // an open-face motorcycle helmet, glossy
    E(at([0, -0.15, 0.15]), HD, [hr[0] + 1.6, hr[1] + 1.7, hr[2] + 1.0], GR.HAT, 'crown', W.hat, (a, b, c) => !(b > 0.42 && Math.abs(a) < 0.72 && c < 0.36 && c > -0.95));
    if (PL && A.hat.riot) { const vz = cloth(A.hat.trim || 'sky'); E(at([0, 0.1, -0.2]), HD, [hr[0] + 1.3, hr[1] + 1.5, hr[2] * 0.72], GR.HAT, 'visor', (Q) => { Q.gloss = 1; Q.k += 0.2; return vz; }, (a, b, c) => b > 0.35 && c < 0.75); }   // (a riot helmet: a clear visor down over the face)
  } else if (k === 'skatehelmet') {   // a round skate helmet with its vents
    E(at([0, -0.12, 0.3]), HD, [hr[0] + 1.3, hr[1] + 1.35, hr[2] + 0.55], GR.HAT, 'crown', W.hat, (a, b, c) => c > (b > 0.4 ? 0.12 : -0.3));
    if (PL && A.hat.gog) {   // (the owner, 22:19: "doesnt look right still, it also doesnt cover eyes on the angled view" - shapes now, not stamps on the face, so they are there from every side: a dark frame across the eyes, a lens standing out of it over each, the strap round the helmet)
      const dk = cloth('#26262c'), ln = cloth(A.hat.trim || 'mustard');
      E(at([0, -0.12, 0.3]), HD, [hr[0] + 1.75, hr[1] + 1.8, 1.1], GR.HAT, 'band', () => dk, (a, b, c) => b < 0.6);
      B(at([0, 0.98, 0.1]), HD, [hr[0] * 0.86, 1.0, 1.9], GR.HAT, 'gog', () => dk);
      for (const s of [-1, 1]) E(at([s * 0.44, 1.12, 0.1]), HD, [2.1, 0.9, 1.7], GR.HAT, 'gog', (Q) => { Q.gloss = 1; if (Q.nz > 0.3) Q.k += 0.3; return ln; });
    }
  }
}

// ---- rendering ----------------------------------------------------------------------------------------------------------------
let CAP = 0, NEAR, PID, NX, NY, NZ, L0, L1, L2, ZW, CR, CG, CB, EM, NOO, LN, AO, FL, MTL, LG;
function scratch(n) {
  if (n <= CAP) return;
  CAP = n;
  NEAR = new Float32Array(n); PID = new Int16Array(n); NX = new Float32Array(n); NY = new Float32Array(n); NZ = new Float32Array(n);
  L0 = new Float32Array(n); L1 = new Float32Array(n); L2 = new Float32Array(n); ZW = new Float32Array(n);
  CR = new Uint8ClampedArray(n); CG = new Uint8ClampedArray(n); CB = new Uint8ClampedArray(n); EM = new Array(n).fill(null); NOO = new Uint8Array(n); LN = new Uint8Array(n); AO = new Float32Array(n); FL = new Uint8Array(n); MTL = new Uint16Array(n); LG = new Uint8Array(n);
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
const FELT = new Set(['fedora', 'cowboy', 'sunhat', 'bowler', 'tophat']);
const EYE = [34, 22, 30], WHITE = [236, 230, 222], LASH = [34, 22, 26];
// the face's stamps at the game's size (face() stamp: an art pixel each - dx outward then dy down as digits from -1, a colour key)
const EYE_ST = ['11i', '11i10l', '11i21d', '11i10s20s', '11i10l21w', '11i10d21d'], BROW_ST = ['', '10h20h', '20m', '1/m20m', '10m20m', '10h20h1/h00h'];
const NOSE_ST = ['11s', '', '11d01l', '01d11d', '11d10s', '11k10l'], LIP_ST = ['11a', '11t', '11a21a', '01a11a21a', '01c11b21c', '11c'], SHAPE_ST = ['', '', '23j', '', '22c', '22c23j'];
const GLS = { founder: '11G21L12L22L01F02F31F32F10F20F13F23F', sun: '11G01F21F12D', 'sun+': '00F10F20F02D22D', avi: '10H11G01F21F12D22D', wrap: '11G01L21L31F', round: '10F01F21F12F11E', half: '11E01F21F12F',
  frames: '00F20F01F21F02F22F11E', 'frames+': '10F12F', browline: '00F10F20F21T12T11E', rimless: '11E21W01W', roundsun: '10F01F21F12F11G',
  goggles: '00F10F20F01L11G21L31F02F12F22F', swim: '01F11G21F', safety: '00F10F20F01C11E21C', monocle: '10F01F21F12F11G22F23F', patch: '10F11F21F12F', domino: '01F21F31F10F20F12F11K' };
export const CLOSE = { SA, CA, NOSE, WHITE, LASH, hexRgb, lum };   // (for client/art2/peopleclose.js)
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
    const [u0, u1, va] = itemSpan(it.kind), hs = ID.hs * (ITEM_SCALE[ICLS[it.kind]] || 1.04) * (PL && PL.itemK || 1), vk = ID.vk || 1, gy = grip[1] * SA - grip[2] * CA;
    const ux = ID.bill ? hs : IT.axis[0] * hs, uy = ID.bill ? 0 : (IT.axis[1] * SA - IT.axis[2] * CA) * hs, r = va * hs * vk / (ID.bill ? 1 : CA) + 2;
    grow(grip[0] + ux * u0, gy + uy * u0, r); grow(grip[0] + ux * u1, gy + uy * u1, r);
    if (ID.tip && P.line) {   // the fishing line down from the tip
      const tx = grip[0] + ux * ID.tip[0], ty = gy + uy * ID.tip[0], tz = grip[2] + (ID.bill ? 0 : IT.axis[2] * ID.tip[0] * hs);
      grow(tx, ty + (P.line > 0 ? P.line : Math.max(6, tz * CA + 1)) + 4, 4);   // (the float hangs 6 px below)
    }
  }
  if (P.water) grow(0, 0, 16);
  if (!opt.tight && !opt.region) { x0 = Math.min(x0, -18); x1 = Math.max(x1, 18); y0 = Math.min(y0, -47); y1 = Math.max(y1, 3); }
  // the creator's close-ups (opt.region 'head': the head and shoulders only - a thumbnail costs a fraction of a figure)
  // ('face': just the face, for the feature thumbnails; or a box [x0, y0, x1, y1] in world px round the head's centre)
  const RB = opt.region === 'head' ? [-17, -23, 17, 17] : opt.region === 'face' ? [-11, -2, 11, 13] : Array.isArray(opt.region) ? opt.region : null;   // (the third pass's bigger heads: 1.36x)
  if (RB && fig.head >= 0) {
    const hc = prims[fig.head].c, hx = hc[0], hy = hc[1] * SA - hc[2] * CA;
    x0 = Math.max(x0, hx + RB[0]); x1 = Math.min(x1, hx + RB[2]); y0 = Math.max(y0, hy + RB[1]); y1 = Math.min(y1, hy + RB[3]);
  }
  if (PL && PL.ol) { x0 -= 2; y0 -= 2; x1 += 2; y1 += 2; }   // (room for the outline on the art grid, below)
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  // R: pixels per world px. 1 in the game (and the creator, which shows the game's own sprite); a close render (tools,
  // tests) casts R x R rays per world px - the same shapes, light and materials, finer - and, given opt.closeFace
  // (client/art2/peopleclose.js), draws the face with real eyes, brows, a nose and lips
  const R = opt.res > 1 ? Math.min(8, opt.res | 0) : 1, iR = 1 / R;
  const w = Math.min(200 * R, (x1 - x0) * R), h = Math.min(200 * R, (y1 - y0) * R), AX = -x0 * R, AY = -y0 * R, n = w * h;
  scratch(n);
  NEAR.fill(-1e9, 0, n); PID.fill(-1, 0, n); NOO.fill(0, 0, n); LN.fill(0, 0, n); AO.fill(0, 0, n); FL.fill(0, 0, n); EM.fill(null, 0, n); MTL.fill(0, 0, n); LG.fill(0, 0, n);
  const RMP = [], SPAIR = new Map(); let SV = null, SRI = null;   // (the ramps by number; where a stripe could be: how far along its part, and the stripe's ramp)
  const MID = new Map();   // (each material's ramp, numbered: what a pixel is made of - the outline pass's tidy-up reads it)
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
    xa = Math.max(0, Math.floor(xa * R + AX - R)); xb = Math.min(w - 1, Math.ceil(xb * R + AX + R)); ya = Math.max(0, Math.floor(ya * R + AY - R)); yb = Math.min(h - 1, Math.ceil(yb * R + AY + R));
    for (let y = ya; y <= yb; y++) {
      const sy = (y + 0.5 - AY) * iR, oy = sy * SA + S0 * CA, oz = -sy * CA + S0 * SA;
      for (let x = xa; x <= xb; x++) {
        if (NEAR[y * w + x] >= smax || !hitP(p, (x + 0.5 - AX) * iR, oy, oz, 0, -CA, -SA)) continue;
        const s = S0 - HT, i = y * w + x;
        if (s <= NEAR[i]) continue;
        NEAR[i] = s; PID[i] = k; NX[i] = HN0; NY[i] = HN1; NZ[i] = HN2; L0[i] = HL0; L1[i] = HL1; L2[i] = HL2;
      }
    }
  }
  // (the polish pass: a ball of which only a pixel or a sliver shows from behind the body - a speck of orange at the hip - isn't
  // drawn: the figure is cast again without it)
  if (PL && !fig.ballOff) { const bi = prims.findIndex((p) => p.ball); if (bi >= 0) { let c = 0; for (let i = 0; i < n; i++) if (PID[i] === bi) c++; if (c > 0 && c < 32 * R * R) { prims[bi].clip = () => false; fig.ballOff = 1; return render(fig, P, S, X, D, A, opt); } } }
  // 1b. close up, the head and the jaw are one smooth surface: their normals are blurred together (a box R px wide,
  // across then down) so the jaw's edge doesn't show as a ring round the face
  if (R > 1 && fig.head >= 0) {
    const K = fig.head, isF = (i) => PID[i] === K || PID[i] === K + 1, rad = R;
    const TX = new Float32Array(n), TY = new Float32Array(n), TZ = new Float32Array(n);
    for (let pass = 0; pass < 2; pass++) {
      const SX = pass ? TX : NX, SY = pass ? TY : NY, SZ = pass ? TZ : NZ, DX = pass ? NX : TX, DY = pass ? NY : TY, DZ = pass ? NZ : TZ;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!isF(i)) { if (!pass) { TX[i] = NX[i]; TY[i] = NY[i]; TZ[i] = NZ[i]; } continue; }
        let sx = 0, sy = 0, sz = 0;
        for (let d = -rad; d <= rad; d++) {
          const xx = pass ? x : x + d, yy = pass ? y + d : y;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (!isF(j)) continue;
          sx += SX[j]; sy += SY[j]; sz += SZ[j];
        }
        const l = Math.hypot(sx, sy, sz) || 1;
        DX[i] = sx / l; DY[i] = sy / l; DZ[i] = sz / l;
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
  const OCW = Math.ceil(w / R) + 1, OCK = R > 1 ? new Int16Array(OCW * (Math.ceil(h / R) + 1)) : null, OCV = R > 1 ? new Uint8Array(OCK.length) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, k = PID[i];
    if (k < 0) continue;
    const p = prims[k], s = NEAR[i], sy = (y + 0.5 - AY) * iR;
    Q.X = (x + 0.5 - AX) * iR; Q.Y = sy * SA + s * CA; Q.Z = -sy * CA + s * SA;
    Q.nx = NX[i]; Q.ny = NY[i]; Q.nz = NZ[i]; Q.l0 = L0[i]; Q.l1 = L1[i]; Q.l2 = L2[i]; Q.x = x - AX; Q.y = y - AY; Q.sv = undefined; Q.sr = null; Q.k = 0; Q.e = null; Q.gloss = 0; Q.part = p.part; Q.side = p.side || 0; Q.g = p.g; Q.res = R;
    const RM = p.m(Q);
    let c, mi = MID.get(RM);
    if (!mi) MID.set(RM, mi = MID.size + 1);
    MTL[i] = mi; RMP[mi] = RM;
    if (Q.sr && Q.sv !== undefined) { const sr = PL.rampFix ? PL.rampFix(Q.sr) : Q.sr; let si = MID.get(sr); if (!si) MID.set(sr, si = MID.size + 1); RMP[si] = sr; if (!SV) { SV = new Float32Array(n); SRI = new Uint16Array(n); } SV[i] = Q.sv; SRI[i] = si; SPAIR.set(si, mi); }
    if (RM.length === 3 && !Array.isArray(RM[0])) c = RM;
    else {
      const ndl = Q.nx * LT[0] + Q.ny * LT[1] + Q.nz * LT[2];
      let v = 0.45 + 0.62 * ndl + Q.k - AO[i];
      if (ndl > 0.05) {   // (close up: one shadow test per world px and part, shared by its R x R pixels)
        let sh;
        if (R === 1) sh = occluded(prims, k, Q.X + Q.nx * 0.45, Q.Y + Q.ny * 0.45, Q.Z + Q.nz * 0.45);
        else { const cell = ((y * iR) | 0) * OCW + ((x * iR) | 0); if (OCK[cell] === k + 1) sh = OCV[cell] === 1; else { sh = occluded(prims, k, Q.X + Q.nx * 0.45, Q.Y + Q.ny * 0.45, Q.Z + Q.nz * 0.45); OCK[cell] = k + 1; OCV[cell] = sh ? 1 : 0; } }
        if (sh) v -= (PL && PL.shK !== undefined ? PL.shK : 0.32) * Math.min(1, ndl * 2.4);
      }
      if (Q.gloss && R > 1) v += 0.3 * Q.gloss * sm(clamp((ndl - 0.5) / 0.4, 0, 1));   // (close up: the sheen fades in)
      else if (Q.gloss && ndl > 0.72) v += 0.3 * Q.gloss;
      if (PL && PL.vMin && R === 1) { const vm = PL.vLight && RM.length === 5 && RM[4][0] + RM[4][1] + RM[4][2] > 600 ? PL.vLight : PL.vSkin && RM === fig.W.skin ? PL.vSkin : PL.vMin; if (v < vm) v = vm; }   // (PL.vSkin: bare skin's shade stops a tone higher - its deep tone is its lines')   // (...and a white or pale cloth keeps to its upper tones: its lower ones are greys and browns - dirt on a white shirt)   // (the ramp's darkest step is the lines' and the outline's, not a patch of shade)
      if (R > 1) { const F2 = fine(RM); c = F2[clamp(Math.round(v * (F2.length - 1) + bayer(x - AX, y - AY) * 0.9), 0, F2.length - 1)]; }   // (close up: twice the steps, dithered)
      else c = RM[clamp(Math.round(v * (RM.length - 1) + bayer(Math.floor((x - AX) / 2), Math.floor((y - AY) / 2)) * (PL && PL.dith !== undefined ? PL.dith : 0.18)), 0, RM.length - 1)];   // (the dither on the art grid: whole art pixels after the bake, not a blur; light - at 24 art pixels tall C1 shows two or three clean tones a cloth, not a checker)
    }
    CR[i] = c[0]; CG[i] = c[1]; CB[i] = c[2]; ZW[i] = Q.Z; EM[i] = Q.e;
    if (opt.debug) { const hh = hash(k, 1, 77), part = p.part; CR[i] = 60 + hash(k, 2, 5) * 195; CG[i] = 60 + hh * 195; CB[i] = part === 'head' ? 255 : 60 + hash(k, 3, 9) * 120; }
  }
  // 4. the held item, depth-tested against the body
  if (IT && R === 1) heldItem(IT, P, w, h, AX, AY, opt);   // (the creator's close renders show no held item)
  // 5. the face, stamped through the head's frame
  if (fig.head >= 0) { if (R === 1) face(fig, P, A, D, w, h, AX, AY); else if (opt.closeFace) opt.closeFace({ PID, CR, CG, CB }, fig, P, A, D, w, h, AX, AY, R); }   // (close up: client/art2/peopleclose.js, for those that load it)
  // 6. water: the body under the surface fades out, foam where it breaks the surface
  if (P.water) water(w, h, AX, AY, X, S, P, R);
  // 7. censor blocks over private areas on an undressed body
  if (fig.W.bare) censor(fig, S, X, D, w, h, AX, AY, R);
  // 8. lines between overlapping parts (on the farther pixel), then the outline round the figure
  const grp = (k) => (k === ITEMID ? GR.ITEM : prims[k].g);
  const LNC = (PL && R === 1 && PL.lnC) || 0;
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
    // (the polish pass, PL.lnC: the line's drawn only where the two parts' colours don't already part them - a bare arm on a
    // white shirt needs none. LG keeps where a line belongs by shape alone: the outline pass reads that, so a figure's
    // outline never moves with its colours)
    let ln = 0, lg = 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0 || !step(i, j, g)) continue;
      lg = 1;
      if (!LNC || Math.abs(CR[i] - CR[j]) + Math.abs(CG[i] - CG[j]) + Math.abs(CB[i] - CB[j]) <= LNC) { ln = 1; break; }
    }
    LN[i] = ln; LG[i] = lg;
  }
  // (the polish pass, PL.clean - the owner, 11-20: "dark shades", and a body that looked dirty at the game's size. A body is a
  // dozen small round shapes, each lit on its own, and the bake shows one of an art pixel's four world pixels - where they
  // differ, the one that differs most: a speck. So before the lines are coloured, on the art grid: every art pixel of the
  // body takes one tone, the one most of it has; and one alone in its tone among its own part - no neighbour of its tone
  // above, below or beside it - takes its neighbours'. Shade stays in runs and patches, as a pixel artist would lay it.)
  if (PL && PL.clean && R === 1) {
    const ox = AX & 1, oy = AY & 1, bw = (w + ox + 1) >> 1, bh = (h + oy + 1) >> 1, BK = new Int32Array(bw * bh).fill(-1), BT = new Int32Array(bw * bh).fill(-1);
    const bodyG = (g) => g === GR.TORSO || g === GR.ARML || g === GR.ARMR || g === GR.LEGL || g === GR.LEGR || g === GR.SKIRT;
    const cells = (bx, by, f) => { for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const x = 2 * bx - ox + dx, y = 2 * by - oy + dy, i = y * w + x; if (x >= 0 && y >= 0 && x < w && y < h && PID[i] >= 0 && PID[i] < prims.length && !NOO[i] && !EM[i] && AO[i] >= 0 && MTL[i] && bodyG(prims[PID[i]].g)) f(i); } };
    const col = (i) => (CR[i] << 16) | (CG[i] << 8) | CB[i], lumC = (c) => (c >> 16) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const T = []; cells(bx, by, (i) => T.push(i));
      if (T.length < 2) continue;
      // (the art pixel's own surface: the material and part most of it is)
      let bk = -1, bc = 0; for (const i of T) { const k = MTL[i] * 16 + prims[PID[i]].g; let c = 0; for (const j of T) if (MTL[j] * 16 + prims[PID[j]].g === k) c++; if (c > bc) { bc = c; bk = k; } }
      const M = T.filter((i) => MTL[i] * 16 + prims[PID[i]].g === bk); let mc = -1, mn = 0;
      for (const i of M) { let c = 0; for (const j of M) if (col(j) === col(i)) c++; if (c > mn || (c === mn && lumC(col(i)) > lumC(mc))) { mn = c; mc = col(i); } }
      for (const i of M) { CR[i] = mc >> 16; CG[i] = (mc >> 8) & 255; CB[i] = mc & 255; }
      if (M.length >= 2 && T.every((i) => !LN[i] || MTL[i] * 16 + prims[PID[i]].g !== bk)) { BK[by * bw + bx] = bk; BT[by * bw + bx] = mc; }
    }
    for (let pass = 0; pass < 2; pass++) { const set = [];
      for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) {
        const q = by * bw + bx; if (BK[q] < 0) continue;
        const nb = [q - 1, q + 1, q - bw, q + bw].filter((r) => BK[r] === BK[q]);
        if (nb.length < 2 || nb.some((r) => BT[r] === BT[q])) continue;
        let best = -1, bn = 0; for (const r of nb) { let c = 0; for (const t of nb) if (BT[t] === BT[r]) c++; if (c > bn || (c === bn && Math.abs(lumC(BT[r]) - lumC(BT[q])) < Math.abs(lumC(best) - lumC(BT[q])))) { bn = c; best = BT[r]; } }
        set.push(q, best);
      }
      for (let k = 0; k < set.length; k += 2) { const q = set[k], c = set[k + 1], bx = q % bw, by = (q / bw) | 0; BT[q] = c; cells(bx, by, (i) => { if (MTL[i] * 16 + prims[PID[i]].g === BK[q]) { CR[i] = c >> 16; CG[i] = (c >> 8) & 255; CB[i] = c & 255; } }); } }
    // (a line one art pixel long, on the body: no line - the top of an arm's line at the armpit, a scrap of one under a hand.
    // On its own it is a dark speck on the skin or the shirt. A line is two art pixels or more; peoplepolish.js lone)
    { const lone = PL.lone(LN, w, h, ox, oy); for (let i = 0; i < n; i++) if (lone[i] && PID[i] >= 0 && PID[i] < prims.length && bodyG(prims[PID[i]].g)) LN[i] = 0; }
    // (stripes, on the art grid - the owner, 11-20 19:06: "thicker in places and thinner and not complete in others ... make
    // the full stripe connect all the way around". Each part - the trunk, each sleeve, each leg - has its art pixels'
    // places along it (SV); down each column of the part a stripe is every PL.stripeN-th art pixel, exactly one thick, and
    // from one column to the next it moves an art pixel at most: one line from side to side. A limb held level is cut
    // along its rows instead.)
    if (SV) {
      const STEP = 2 / CA, N3 = PL.stripeN, GS = new Map(), GC = new Map();
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { const acc = new Map(); let cov = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const x = 2 * bx - ox + dx, y = 2 * by - oy + dy, i = y * w + x; if (x < 0 || y < 0 || x >= w || y >= h || PID[i] < 0) continue; cov++; if (!SRI[i] || PID[i] >= prims.length) continue; const g = prims[PID[i]].g, e = acc.get(g) || acc.set(g, [0, 0, 0]).get(g); e[0] += SV[i]; e[1]++; e[2] = i; }
        for (const [g, e] of acc) {
          // (one pixel of a part alone in an art pixel is no part of its stripes: it takes what the rest of the art pixel is, so
          // the bake cannot show it as a dot of stripe - or of cloth in a stripe)
          if (e[1] === 1) { let src = -1; for (let dy = 0; dy < 2 && src < 0; dy++) for (let dx = 0; dx < 2; dx++) { const x = 2 * bx - ox + dx, y = 2 * by - oy + dy, j = y * w + x; if (x >= 0 && y >= 0 && x < w && y < h && j !== e[2] && PID[j] >= 0 && PID[j] < prims.length && !NOO[j] && !LN[j]) { src = j; break; } }
            if (src >= 0) { const i = e[2]; CR[i] = CR[src]; CG[i] = CG[src]; CB[i] = CB[src]; MTL[i] = MTL[src]; SRI[i] = SRI[src] && prims[PID[src]].g === g ? SRI[src] : 0; continue; } }
          if (e[1] * 2 <= cov) continue;   // (...and a part that is half an art pixel or less - the rest an arm in front of it - lays no stripe there: what the bake shows of such an art pixel is anyone's guess, and a stripe would seem to stop, or to double)
          (GS.get(g) || GS.set(g, new Map()).get(g)).set(by * bw + bx, e[0] / e[1]); GC.set(g * 65536 + by * bw + bx, e[1]); } }   // (an art pixel can be two parts' - a sleeve's edge on the chest: each part lays its own stripe on its own pixels there)
      for (const [g, B] of GS) {
        let dy = 0, ny = 0, dx = 0, nx = 0; for (const [q, v] of B) { if (B.has(q + bw)) { dy += B.get(q + bw) - v; ny++; } if (q % bw < bw - 1 && B.has(q + 1)) { dx += B.get(q + 1) - v; nx++; } }
        const col = Math.abs(ny ? dy / ny : 0) >= Math.abs(nx ? dx / nx : 0), sg = (col ? dy : dx) < 0 ? -1 : 1;   // (cut down the columns, or along the rows; which way the part runs)
        const L = new Map(); for (const [q, v] of B) { const a = col ? q % bw : (q / bw) | 0, t = col ? (q / bw) | 0 : q % bw, e = L.get(a) || L.set(a, [0, 0]).get(a); e[0] += v - sg * STEP * t; e[1]++; }
        const keys = [...L.keys()].sort((a, b) => a - b), nOf = new Map(); let mid = keys[0]; for (const k of keys) if (L.get(k)[1] > L.get(mid)[1]) mid = k;
        const base = (k) => Math.floor(L.get(k)[0] / L.get(k)[1] / STEP + 0.5);
        nOf.set(mid, base(mid));
        for (let i = keys.indexOf(mid) + 1; i < keys.length; i++) { const p = nOf.get(keys[i - 1]), v = keys[i] - keys[i - 1] > 1 ? base(keys[i]) : Math.max(p - 1, Math.min(p + 1, base(keys[i]))); nOf.set(keys[i], v); }
        for (let i = keys.indexOf(mid) - 1; i >= 0; i--) { const p = nOf.get(keys[i + 1]), v = keys[i + 1] - keys[i] > 1 ? base(keys[i]) : Math.max(p - 1, Math.min(p + 1, base(keys[i]))); nOf.set(keys[i], v); }
        const ST = new Set(); for (const q of B.keys()) { const a = col ? q % bw : (q / bw) | 0, t = col ? (q / bw) | 0 : q % bw, k = nOf.get(a) + sg * t; if (!(((k % N3) + N3) % N3)) ST.add(q); }
        // (...and a stripe runs on to the part's edge: where the next art pixel along is the part's and the stripe would stop -
        // its own turn in that column falls outside the part, under an arm or off the edge - the stripe takes it)
        for (let pass = 0, ch = true; ch && pass < 6; pass++) { ch = false; for (const q of [...ST]) for (const sd of [-1, 1]) { const r = q + (col ? sd : sd * bw), u = col ? bw : 1; if (!B.has(r) || ST.has(r) || (col && ((r % bw) - (q % bw)) !== sd)) continue; if (ST.has(r - u) || ST.has(r + u)) continue; ST.add(r); ch = true; } }
        for (const q of ST) {
          const bx = q % bw, by = (q / bw) | 0;
          for (let ddy = 0; ddy < 2; ddy++) for (let ddx = 0; ddx < 2; ddx++) { const x = 2 * bx - ox + ddx, y = 2 * by - oy + ddy, i = y * w + x; if (x < 0 || y < 0 || x >= w || y >= h || !SRI[i] || PID[i] < 0 || PID[i] >= prims.length || prims[PID[i]].g !== g) continue;
            const RB = RMP[MTL[i]], RS = RMP[SRI[i]]; let j = 3; if (RB && Array.isArray(RB[0])) for (let t2 = 0; t2 < RB.length; t2++) if (RB[t2][0] === CR[i] && RB[t2][1] === CG[i] && RB[t2][2] === CB[i]) { j = t2; break; }
            const c = RS[Math.min(RS.length - 1, j)]; CR[i] = c[0]; CG[i] = c[1]; CB[i] = c[2]; MTL[i] = SRI[i]; } }
      }
    }
  }
  // (at the game's scale an inner line is a whole art pixel after the bake: a step darker, as SPEC asks, not the
  // outline's near-black, which made a busy figure of every overlap)
  if (R === 1) {
    // (the polish pass, PL.lnL - the owner, 11-20: a line is a shade of what it's drawn on, lighter the lighter that is. At
    // half its colour it was a near-black scratch on a white shirt and a brown blotch on skin. Between the legs it stays
    // dark: that line is the legs' separation. PL.lnHead: a fringe's or a hat's line on the face, a shadow)
    const hk = (PL && PL.lnHead) || 0, lk = (PL && PL.lnL) || 0;
    // (the owner, 11-20 16:51: a line on bare skin is the skin's own shade - the tone a step and a half under the one it is drawn
    // on, never under the skin's second tone. A darkened copy of a light skin's color was a tan smudge, and on a leg - an arm
    // or the other leg in front of it at an angle - near-black: "an extra line on her leg", "dark shading". PL.skinLine below.)
    const SKM = PL && PL.skinLine ? MID.get(fig.W.skin) : 0, SK = fig.W.skin;
    for (let i = 0; i < n; i++) if (LN[i]) {
      const g = PID[i] < prims.length ? prims[PID[i]].g : 0, L = (CR[i] * 0.3 + CG[i] * 0.59 + CB[i] * 0.11) / 255;
      const legs = g === GR.LEGL || g === GR.LEGR;
      if (SKM && MTL[i] === SKM && g !== GR.HEAD) { const c = PL.skinLine(SK, CR[i], CG[i], CB[i]); if (c) { CR[i] = c[0]; CG[i] = c[1]; CB[i] = c[2]; continue; } }
      if (lk && !legs && g !== GR.HEAD && L > 0.3) {   // (as dark as the colour's own deep shade and no darker: seven tenths of a mid or a light tone; a shaded one goes less far)
        const s = Math.max(L * (L > 0.7 ? 0.82 : 0.74), Math.min(L * 0.94, 0.39)) / L;
        const warm = CR[i] > CB[i] + 40;   // (skin and warm cloth keep their warmth in a line - a cool one on light skin was a grey smudge; white and cool cloth go a little cool)
        CR[i] *= s; CG[i] *= s * (warm ? 0.9 : 0.95); CB[i] *= s * (warm ? 0.82 : 1.04); continue;
      }
      const k = legs ? 0 : g === GR.HEAD ? hk : 0;
      CR[i] = CR[i] * (0.52 + k) + 8 * (1 - k * 2); CG[i] = CG[i] * (0.48 + k) + 6 * (1 - k * 2); CB[i] = CB[i] * (0.56 + k) + 14 * (1 - k * 2);
    }
  }
  else for (let i = 0; i < n; i++) if (LN[i]) { CR[i] = CR[i] * 0.3 + 12; CG[i] = CG[i] * 0.26 + 8; CB[i] = CB[i] * 0.34 + 18; }
  if (PL && PL.post && R === 1) PL.post({ PID, NEAR, LN, NOO, CR, CG, CB, prims, w, h, AX, AY, GR, fig, A, D, P });
  // pack: colour, a soft normal (half the shape's own, half facing the camera and up), height, glow, flags; then the
  // outline into the empty pixels round the figure
  const G = new GBuf(w, h), gc = G.col, gn = G.nrm, gz = G.z, ge = G.emi, gf = G.flag;
  G.ax = AX; G.ay = AY;
  const cand = (q, j) => (PID[q] >= 0 && !NOO[q] && PID[q] !== FOAMID && (j < 0 || NEAR[q] > NEAR[j]) ? q : j);
  // The polish pass's outline (PL.ol, 11-20): drawn on the art grid, not at this buffer's - the game shows a figure at 2 x 2
  // of these pixels (gbuf.js downsample2, blocks counted from the anchor), and a one-pixel line here came out there as a
  // whole art pixel in one place, half a one mixed into the body in the next and nothing in a third. So: the art pixels
  // the figure fills (2 of a block's 4 or more) stay as they are; each empty one beside them (not across a corner) is
  // filled whole with a darker tone of the art pixel it borders - an outline one art pixel wide all the way round, in
  // the colour of what it outlines (the concepts' edges), lighter on the lit side (left and above) than in the shade.
  let OL = null, BS = null, BC = null, BN = null;
  if (PL && PL.ol && R === 1) {
    const ox = AX & 1, oy = AY & 1, bw = (w + ox + 1) >> 1, bh = (h + oy + 1) >> 1, BA = new Uint8Array(bw * bh), BL = new Uint8Array(bw * bh), DM = new Uint8Array(bw * bh);
    BN = new Uint8Array(bw * bh); BS = new Int32Array(bw * bh).fill(-1); BC = new Float32Array(bw * bh * 3); OL = new Int32Array(n);
    // First, where two materials meet inside one art pixel (a shirt's hem over shorts, a sock over a shoe, a sleeve over
    // an arm): the art pixel goes to the one with more of it (a tie: the one in front). The bake's own rule there keeps the
    // texel that differs most - right for a button, but along a hem it threw single pixels of one garment into the other.
    // A material with nothing more of it round the art pixel is a detail (a button, a buckle) and stays.
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const T = [], x0 = 2 * bx - ox, y0 = 2 * by - oy;
      let mixed = false, skip = false;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const x = x0 + dx, y = y0 + dy, i = y * w + x;
        if (x < 0 || y < 0 || x >= w || y >= h || PID[i] < 0) continue;
        if (NOO[i] || PID[i] >= prims.length || !MTL[i] || EM[i]) { skip = true; continue; }
        if (T.length && MTL[i] !== MTL[T[0]]) mixed = true;
        T.push(i);
      }
      if (skip || !mixed) continue;
      let maj = -1, mc = 0, mn = -1e9;
      for (const i of T) { let c = 0, nr = -1e9; for (const j of T) if (MTL[j] === MTL[i]) { c++; if (NEAR[j] > nr) nr = NEAR[j]; } if (c > mc || (c === mc && nr > mn)) { mc = c; mn = nr; maj = MTL[i]; } }
      let r = 0, g = 0, b = 0, majG = 0;
      const peekG = (i) => { const q = prims[PID[i]].g; return q === GR.HAIR || q === GR.HEAD ? q : 0; };
      for (const i of T) if (MTL[i] === maj) { r += CR[i]; g += CG[i]; b += CB[i]; majG = prims[PID[i]].g; }
      for (const i of T) {
        const m = MTL[i];
        if (m === maj) continue;
        if (SPAIR.get(m) === maj || SPAIR.get(maj) === m) continue;   // (a cloth and its own stripe: laid on the art grid already, a part at a time - a sleeve's ring is not the chest's)
        let c = 0;
        for (let y = Math.max(0, y0 - 1); y <= Math.min(h - 1, y0 + 2); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(w - 1, x0 + 2); x++) if ((x < x0 || x > x0 + 1 || y < y0 || y > y0 + 1) && PID[y * w + x] >= 0 && MTL[y * w + x] === m) c++;
        if (c < 3 && !(peekG(i) && majG !== peekG(i) && (majG === GR.HAT || majG === GR.HAIR))) continue;   // (...but hair through a hat's brim, or the head through hair, is no detail: two dark dots at the back of a sun hat)
        CR[i] = r / mc; CG[i] = g / mc; CB[i] = b / mc; MTL[i] = maj; LN[i] = 0;
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, q = ((y + oy) >> 1) * bw + ((x + ox) >> 1);
      if (PID[i] < 0) continue;
      BA[q]++;
      if (NOO[i] || PID[i] === FOAMID) continue;
      BN[q]++; BL[q] += LG[i]; BC[q * 3] += CR[i]; BC[q * 3 + 1] += CG[i]; BC[q * 3 + 2] += CB[i];
      if (BS[q] < 0 || NEAR[i] > NEAR[BS[q]]) BS[q] = i;
    }
    const bg = (q) => (BS[q] < 0 || PID[BS[q]] >= prims.length ? 0 : prims[PID[BS[q]]].g);
    // (a sliver: an art pixel at the figure's edge that's all inner line - the far arm or shoulder a pixel out from behind
    // the body at an angle, which with an outline round it was a dark strap down the figure's side: it is the outline there)
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const q = by * bw + bx;
      if (BA[q] < 2 || !BN[q]) continue;
      if (!DM[q] && BL[q] === BN[q] && ((bx > 0 && BA[q - 1] < 2) || (bx < bw - 1 && BA[q + 1] < 2) || (by > 0 && BA[q - bw] < 2) || (by < bh - 1 && BA[q + bw] < 2))) DM[q] = 1;
      // (and the far shoulder's cap beside the cheek: one art pixel of arm between the head and nothing)
      const g = bg(q);
      if ((g === GR.ARML || g === GR.ARMR || g === GR.TORSO) && bx > 0 && bx < bw - 1 && ((BA[q - 1] < 2 && bg(q + 1) === GR.HEAD) || (BA[q + 1] < 2 && bg(q - 1) === GR.HEAD))) {
        DM[q] = 1;
        // (what's left of it in the cheek's own art pixel takes the cheek's colour: half a pixel of dark sleeve there was a black pixel on the face)
        const hb = BA[q - 1] < 2 ? q + 1 : q - 1, hx = 2 * (hb % bw) - ox, hy = 2 * by - oy, T4 = [];
        let r = 0, gg = 0, b = 0, c = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const x = hx + dx, y = hy + dy, i = y * w + x;
          if (x < 0 || y < 0 || x >= w || y >= h || PID[i] < 0 || PID[i] >= prims.length) continue;
          if (prims[PID[i]].g === GR.HEAD && !LN[i]) { r += CR[i]; gg += CG[i]; b += CB[i]; c++; } else T4.push(i);
        }
        if (c) for (const i of T4) { CR[i] = r / c; CG[i] = gg / c; CB[i] = b / c; }
        const ob = BA[q - 1] < 2 ? q - 1 : q + 1;   // (and its last half pixel out beyond: gone)
        if (BA[ob]) DM[ob] = 2;
      }
    }
    // (a lone art pixel of the head inside the hair - an ear's tip through hair that hangs over it, seen from the side or from
    // behind: hair, like the hair on both sides of it)
    for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) {
      const q = by * bw + bx;
      if (BA[q] < 2 || bg(q) !== GR.HEAD) continue;
      const nb = [q - 1, q + 1, q - bw, q + bw], hn = nb.filter((r) => BN[r] >= 2 && bg(r) === GR.HAIR);
      if (hn.length < 2 || nb.some((r) => BN[r] >= 2 && !DM[r] && bg(r) !== GR.HAIR)) continue;   // (hair or nothing on every side)
      const r = hn[0], k = 1 / BN[r];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const x = 2 * bx - ox + dx, y = 2 * by - oy + dy, i = y * w + x; if (x >= 0 && y >= 0 && x < w && y < h && PID[i] >= 0) { CR[i] = BC[r * 3] * k; CG[i] = BC[r * 3 + 1] * k; CB[i] = BC[r * 3 + 2] * k; } }
    }
    // (a point on top of the hair: one art pixel with nothing beside or over it - a dome's top row. Off, bar the styles that are points)
    if (!(PL.tipKeep && PL.tipKeep.includes(A.hair && A.hair.style))) for (let by = 1; by < bh; by++) for (let bx = 1; bx < bw - 1; bx++) {
      const q = by * bw + bx;
      if (BA[q] >= 2 && !DM[q] && bg(q) === GR.HAIR && BA[q - 1] < 2 && BA[q + 1] < 2 && BA[q - bw] < 2) DM[q] = 1;
    }
    // (...and one out to the side of a head of hair, with nothing over or under it and the hair's edge running straight past
    // it: "a pixel sticking out on the head" from the side, the owner, 11-20 16:51. A tail or a lock is longer than that.)
    if (fig.dir8 >= 2 && fig.dir8 <= 6 && fig.dir8 !== 4 && PL.nubOff && PL.nubOff.includes(A.hair && A.hair.style)) for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) {   // (in profile and from three quarters behind: from the front a fringe's corner is that shape; and only the smooth styles named - a curl or a braid's end is that shape too, and the hair is as the owner passed it)
      const q = by * bw + bx;
      if (BA[q] < 2 || DM[q] || bg(q) !== GR.HAIR || BA[q - bw] >= 2 || BA[q + bw] >= 2 || (BA[q - 1] >= 2) === (BA[q + 1] >= 2)) continue;
      const inner = BA[q - 1] >= 2 ? q - 1 : q + 1;
      if (bg(inner) === GR.HAIR && BA[inner - bw] >= 2 && BA[inner + bw] >= 2 && bg(inner - bw) === GR.HAIR && bg(inner + bw) === GR.HAIR) DM[q] = 1;
    }
    // (a scrap of the far arm at the figure's edge - one or two art pixels of it out behind the body in a side view, a bump on
    // the shoulder: the outline there)
    { const armG = (q) => { const g = bg(q); return BA[q] >= 2 && !DM[q] && (g === GR.ARML || g === GR.ARMR) ? g : 0; }, same = (q, g) => [q - 1, q + 1, q - bw, q + bw].filter((r) => r >= 0 && r < bw * bh && armG(r) === g);
      const hit = [];
      for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) {
        const q = by * bw + bx, g = armG(q);
        if (!g || !(BA[q - 1] < 2 || BA[q + 1] < 2)) continue;
        const n = same(q, g);
        if (n.length === 0 || (n.length === 1 && same(n[0], g).length <= 1)) hit.push(q, ...n);
      }
      for (const q of hit) DM[q] = 1; }
    // (a point on the trunk: one art pixel of it out to the side with nothing over or under it - the tip of a curve, a bust's
    // or a seat's. The outline there: a curve at this size is a step two pixels tall or none - the owner, 11-20)
    const PT = (g) => g === GR.TORSO || g === GR.LEGL || g === GR.LEGR || ((g === GR.ARML || g === GR.ARMR) && !IT);   // (...a thigh's or a shin's too; a shoe's toe stays)
    const shoeQ = (r) => { const pp = prims[PID[BS[r]]].part; return pp === 'shoe' || pp === 'sole' || pp === 'boot'; };   // (...and an elbow's or a hand's, hanging at the side - not an arm holding something out)
    const points = (strict) => { for (let pass = 0; pass < 2; pass++) { const hit = [], on = (r) => BA[r] >= 2 && (strict ? !DM[r] : DM[r] !== 2);   // (twice: a point two art pixels long goes whole - its tip dropped, the next the outline)
      for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) {
        const q = by * bw + bx;
        if (!on(q) || DM[q] || !PT(bg(q)) || shoeQ(q)) continue;
        if (!on(q - 1) && !on(q + 1) && !on(q - bw)) { hit.push(q); continue; }   // (...or up: the top of an upper arm over the shoulder line, seen from behind)
        if (on(q - bw) || on(q + bw)) continue;
        if (on(q - 1) !== on(q + 1)) hit.push(q);
      }
      for (const q of hit) { if (!on(q - 1) && !on(q + 1)) { DM[q] = 1; continue; } const inner = BA[q - 1] >= 2 ? q - 1 : q + 1; DM[q] = !on(inner - bw) && !on(inner + bw) && PT(bg(inner)) ? 2 : 1; } } };
    points();
    // (a bump on the trunk: one art pixel out and one or two tall, flush above and below - a man's chest, half a pixel in front
    // of his waist, drawn a whole one; a pixel of collar beside a neck. The outline there. Not a woman's bust or seat, which
    // are that shape on purpose - the owner, 11-20)
    { const on = (r) => BA[r] >= 2 && DM[r] !== 2 && !DM[r], tr = (r) => on(r) && bg(r) === GR.TORSO && !prims[PID[BS[r]]].seat && prims[PID[BS[r]]].part !== 'bust', hit = [];
      for (let by = 1; by < bh - 3; by++) for (let bx = 1; bx < bw - 1; bx++) for (const sd of [-1, 1]) {
        const q = by * bw + bx, edge = (r) => tr(r) && !on(r + sd) && on(r - sd);
        if (!edge(q) || on(q - bw)) continue;
        let len = 1; while (len < 3 && edge(q + len * bw)) len++;
        if (len <= 2 && !on(q + len * bw) && !(len === 2 && prims[PID[BS[q]]].part === 'belly')) for (let k = 0; k < len; k++) hit.push(q + k * bw);   // (a belly two tall is a belly)
      }
      for (const q of hit) DM[q] = 1; }
    // (a neck from the side - the owner, 11-20: "lost definition to the neck". Under the chin a row of the outline is set in
    // from the chin above it and from the chest below it. Where the head sits half an art pixel lower on a build, the jaw's
    // lowest row runs out as far as the chin and the chest starts right under it: that row's front art pixel goes)
    if ((fig.dir8 === 2 || fig.dir8 === 6) && (fig.pose === 'idle' || fig.pose === 'stand' || fig.pose.startsWith('walk'))) {
      const sd = fig.dir8 === 2 ? 1 : -1, on = (r) => BA[r] >= 2 && !DM[r], F = (by) => { let v = -1; for (let bx = 0; bx < bw; bx++) if (on(by * bw + bx)) { if (sd > 0 || v < 0) v = bx; } return v; };
      let yc = -1; for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) if (on(by * bw + bx) && bg(by * bw + bx) === GR.HEAD) yc = by;
      if (yc > 1 && yc < bh - 1) { const a = F(yc - 1), b = F(yc), c = F(yc + 1);
        if (a >= 0 && b >= 0 && c >= 0 && sd * (b - a) >= 0 && sd * (c - b) >= 0 && bg(yc * bw + b) === GR.HEAD) DM[yc * bw + b] = 1; }
    }
    // (a tank top in profile - the owner, 11-20 16:51: "extra white pixel on neck", "white pixel showing", "pixel missing
    // (showing skin pixel)". From the side a strap over the shoulder and the scooped neck are an art pixel each: one of the
    // top's on the neck's row, one of skin in the top's chest. In profile only: the top's highest row keeps no art pixel of
    // the top that stands alone in it, and a single art pixel of skin with the top on both sides of it is the top's.)
    if ((fig.dir8 === 2 || fig.dir8 === 6) && fig.W.T && fig.W.T.tank && !fig.W.T.dress) {
      const SK = fig.W.skin, SKM = MID.get(SK), on = (r) => BA[r] >= 2 && !DM[r], mt = (r) => MTL[BS[r]], tr = (r) => on(r) && bg(r) === GR.TORSO && !LN[BS[r]];
      const paint = (q, c, m, same) => { const bx = q % bw, by = (q / bw) | 0; let nn = 0, r = 0, g = 0, b = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const x = 2 * bx - ox + dx, y = 2 * by - oy + dy, i = y * w + x; if (x < 0 || y < 0 || x >= w || y >= h || PID[i] < 0 || PID[i] >= prims.length) continue; if (prims[PID[i]].g === GR.TORSO && (same ? MTL[i] === SKM : MTL[i] !== SKM)) { CR[i] = c[0]; CG[i] = c[1]; CB[i] = c[2]; MTL[i] = m; LN[i] = 0; } nn++; r += CR[i]; g += CG[i]; b += CB[i]; }
        if (nn) { BN[q] = nn; BC[q * 3] = r; BC[q * 3 + 1] = g; BC[q * 3 + 2] = b; } };
      // (an art pixel is the top's, or skin's, if any of its trunk's pixels are: the bake may show either)
      const cnt = (q, f) => { const bx = q % bw, by = (q / bw) | 0; let c = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const x = 2 * bx - ox + dx, y = 2 * by - oy + dy, i = y * w + x; if (x >= 0 && y >= 0 && x < w && y < h && PID[i] >= 0 && PID[i] < prims.length && !NOO[i] && f(i)) c++; } return c; };
      const cloth = (q) => on(q) && cnt(q, (i) => prims[PID[i]].g === GR.TORSO && MTL[i] !== SKM), skinT = (q) => on(q) && cnt(q, (i) => prims[PID[i]].g === GR.TORSO && MTL[i] === SKM), skinAny = (q) => on(q) && cnt(q, (i) => MTL[i] === SKM);
      let top = -1; for (let by = 1; by < bh - 1 && top < 0; by++) for (let bx = 1; bx < bw - 1; bx++) if (cloth(by * bw + bx)) { top = by; break; }
      if (top > 0 && SKM) { const lone = []; for (let bx = 1; bx < bw - 1; bx++) { const q = top * bw + bx; if (cloth(q) && !cloth(q - 1) && !cloth(q + 1)) lone.push(q); } for (const q of lone) paint(q, SK[3], SKM, false); }
      // (...nor anywhere an art pixel of the top with none of it above, below or beside it: a strap's end behind the arm)
      if (SKM) { const lone = []; for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) { const q = by * bw + bx; if (cloth(q) && !cloth(q - 1) && !cloth(q + 1) && !cloth(q - bw) && !cloth(q + bw)) lone.push(q); } for (const q of lone) paint(q, SK[3], SKM, false); }
      if (SKM) { const hit = []; for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) { const q = by * bw + bx;
        if (!skinT(q) || cloth(q) > skinT(q)) continue;
        const nb = [q - 1, q + 1, q - bw, q + bw];
        if (nb.some(skinAny)) continue;
        const cl = nb.filter((r) => cloth(r) >= 2);
        if (cl.length >= 2) hit.push(q, cl[0]); }
        for (let k = 0; k < hit.length; k += 2) { let j = -1; cnt(hit[k + 1], (i) => { if (j < 0 && prims[PID[i]].g === GR.TORSO && MTL[i] !== SKM && !LN[i]) j = i; return 0; }); if (j >= 0) paint(hit[k], [CR[j], CG[j], CB[j]], MTL[j], true); } }
    }
    points(true);   // (...and again, counting only what is still body: what the two rules above took off can leave a point where a step was)
    // (the inseam: facing the camera or away from it, the line between the legs runs on up from where they stand apart to the
    // crotch - or to the underwear, on bare skin. The thighs meet at one depth there, and the renderer's own lines want a
    // step in depth: without it the legs were one shape from the knees up - the owner, 11-20)
    if (PL.inseam && fig.dir8 % 4 === 0 && (fig.pose === 'idle' || fig.pose === 'stand' || fig.pose.startsWith('walk'))) {
      const leg = (r) => BA[r] >= 2 && (bg(r) === GR.LEGL || bg(r) === GR.LEGR);
      let gx = -1, gy = -1, gx2 = -1;
      for (let by = 2; by < bh - 1 && gy < 0; by++) for (let bx = 1; bx < bw - 2; bx++) {
        const q = by * bw + bx;
        if (!leg(q)) continue;
        if (BA[q + 1] < 2 && leg(q + 2) && bg(q + 2) !== bg(q)) { gx = bx + 1; gy = by; break; }                               // (a gap one art pixel wide)
        if (BA[q + 1] < 2 && BA[q + 2] < 2 && bx < bw - 3 && leg(q + 3) && bg(q + 3) !== bg(q)) { gx = bx + 1 + (((AX >> 1) + (ox ? 1 : 0)) > bx + 1 ? 1 : 0); gx2 = 2 * bx + 3 - gx; gy = by; break; }   // (two wide: the one nearer the middle; on bare legs the other too - below)
      }
      if (gy < 0) for (let by = bh - 2; by > 1 && gy < 0; by--) for (let bx = 1; bx < bw - 1; bx++) {   // (legs that touch all the way down: where the two meet, on the farther one)
        const q = by * bw + bx;
        if (leg(q) && leg(q + 1) && bg(q) !== bg(q + 1)) { gx = NEAR[BS[q]] < NEAR[BS[q + 1]] ? bx : bx + 1; gy = by + 1; break; }
      }
      const zTop = (D.pelZ || 0) - 1.5;
      for (let by = gy - 1; gy > 0 && by > 0; by--) {
        const q = by * bw + gx, g = BA[q] >= 2 ? bg(q) : 0;
        if (!(g === GR.LEGL || g === GR.LEGR || g === GR.TORSO) || ZW[BS[q]] > zTop) break;
        const k = 1 / Math.max(1, BN[q]), below = q + bw, kb = 1 / Math.max(1, BN[below]);
        if (BN[below] && Math.abs(BC[q * 3] * k - BC[below * 3] * kb) + Math.abs(BC[q * 3 + 1] * k - BC[below * 3 + 1] * kb) + Math.abs(BC[q * 3 + 2] * k - BC[below * 3 + 2] * kb) > 90 && g === GR.TORSO) break;   // (another cloth: the underwear, a shirt's hem)
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const x = 2 * gx - ox + dx, y = 2 * by - oy + dy, i = y * w + x; if (x >= 0 && y >= 0 && x < w && y < h && PID[i] >= 0 && PID[i] < prims.length) { CR[i] = CR[i] * 0.52 + 8; CG[i] = CG[i] * 0.48 + 6; CB[i] = CB[i] * 0.56 + 14; LN[i] = 1; } }
        // (bare legs that stand two art pixels apart stay two apart up to the underwear: with one line over a gap of two, one
        // thigh was an art pixel wider than the other for a row - "an extra skin pixel between the thighs", the owner, 11-20)
        if (gx2 >= 0) { const q2 = by * bw + gx2, g2 = BA[q2] >= 2 ? bg(q2) : 0, j = BS[q2], SK = fig.W.skin;
          if ((g2 === GR.LEGL || g2 === GR.LEGR) && j >= 0 && SK.some((c) => c[0] === CR[j] && c[1] === CG[j] && c[2] === CB[j]))
            for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const x = 2 * gx2 - ox + dx, y = 2 * by - oy + dy, i = y * w + x; if (x >= 0 && y >= 0 && x < w && y < h && PID[i] >= 0 && PID[i] < prims.length) { CR[i] = CR[i] * 0.52 + 8; CG[i] = CG[i] * 0.48 + 6; CB[i] = CB[i] * 0.56 + 14; LN[i] = 1; } }
          else gx2 = -1; }
      }
    }
    // (skin showing through - the owner, 11-20 22:19: "T shirt dress and jersey dress have skin pixels showing through". A
    // thigh's top pokes out of a skirt's side, a thigh under a jacket's hem takes the open front's bare chest: one art pixel
    // of skin with clothing on three or four sides and no skin beside it. It takes the clothing's color - the same rule
    // tools/bodycheck.mjs wardrobe() checks, on every piece. Not where a piece is made to show skin: W.holes.)
    if (PL.speck !== false && !fig.W.holes) { const SK = fig.W.skin, SKM = MID.get(SK); if (SKM) {
      const BODY = (g) => g === GR.TORSO || g === GR.LEGL || g === GR.LEGR, WEAR = (g) => BODY(g) || g === GR.ARML || g === GR.ARMR || g === GR.SKIRT, NOT = { neck: 1, collar: 1, hand: 1, foot: 1, shoe: 1, sh: 1, sole: 1, boot: 1 };
      const px = (q, f) => { const bx = q % bw, by = (q / bw) | 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const x = 2 * bx - ox + dx, y = 2 * by - oy + dy, i = y * w + x; if (x >= 0 && y >= 0 && x < w && y < h && PID[i] >= 0 && PID[i] < prims.length && !NOO[i]) f(i); } };
      const st = new Uint8Array(bw * bh);   // (per art pixel: 1 bare skin of the trunk or a leg, 2 any skin, 4 clothing)
      for (let q = 0; q < bw * bh; q++) { if (BA[q] < 2 || DM[q]) continue; let sk = 0, any = 0, cl = 0; px(q, (i) => { const p = prims[PID[i]]; if (MTL[i] === SKM) { any++; if (BODY(p.g) && !NOT[p.part]) sk++; } else if (WEAR(p.g)) cl++; }); st[q] = (sk ? 1 : 0) | (any >= 3 ? 2 : 0) | (cl >= 2 && any < 2 ? 4 : 0); }   // (skin beside it: an art pixel mostly skin - a hand's edge in a corner of one is not)
      for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) { const q = by * bw + bx; if (!(st[q] & 1)) continue; const N = [q - 1, q + 1, q - bw, q + bw]; if (N.some((r) => st[r] & 2)) continue; const C = N.filter((r) => st[r] & 4); if (C.length < 3) continue;
        let j = -1; px(C[0], (i) => { if (j < 0 && MTL[i] !== SKM && !LN[i]) j = i; }); if (j < 0) continue;
        px(q, (i) => { if (MTL[i] === SKM && BODY(prims[PID[i]].g)) { CR[i] = CR[j]; CG[i] = CG[j]; CB[i] = CB[j]; MTL[i] = MTL[j]; LN[i] = 0; } });
        let nn = 0, r = 0, g = 0, b = 0; px(q, (i) => { nn++; r += CR[i]; g += CG[i]; b += CB[i]; }); if (nn) { BN[q] = nn; BC[q * 3] = r; BC[q * 3 + 1] = g; BC[q * 3 + 2] = b; } st[q] = 4; }
      // (...and an art pixel of a cloth the trunk has plenty of, on its own inside another: the shirt under a jacket, seen at
      // an angle through an opening half an art pixel wide. Not on a patterned piece - a dot is such a pixel - nor a lit one.)
      if (!fig.W.pat) { const mB = (q) => (BS[q] >= 0 ? MTL[BS[q]] : 0), tot = new Map(), T4 = (q) => (st[q] & 4) && bg(q) === GR.TORSO;
        for (let q = 0; q < bw * bh; q++) if (T4(q)) tot.set(mB(q), (tot.get(mB(q)) || 0) + 1);
        for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) { const q = by * bw + bx, m0 = mB(q); if (!T4(q) || (tot.get(m0) || 0) < 6 || EM[BS[q]]) continue;
          let alone = true; for (let dy = -1; dy <= 1 && alone; dy++) for (let dx = -1; dx <= 1; dx++) { const r = q + dy * bw + dx; if (r !== q && BA[r] >= 2 && !DM[r] && mB(r) === m0) { alone = false; break; } } if (!alone) continue;
          if (![q - 1, q + 1, q - bw, q + bw].every((r) => st[r] & 4)) continue;
          const j = BS[q - 1]; if (j < 0 || MTL[j] === m0) continue;
          px(q, (i) => { if (MTL[i] === m0 && prims[PID[i]].g === GR.TORSO) { CR[i] = CR[j]; CG[i] = CG[j]; CB[i] = CB[j]; MTL[i] = MTL[j]; LN[i] = 0; } }); }
      }
    } }
    // (a sole's last pixel out beyond the shoe - the far foot's at an angle, a toe's under the near one: on its own it's a
    // white pixel beside the foot, not a sole)
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const q = by * bw + bx;
      if (BA[q] < 2 || DM[q] || BS[q] < 0 || PID[BS[q]] >= prims.length || prims[PID[BS[q]]].part !== 'sole') continue;
      let c = 0;
      if (bx > 0 && BA[q - 1] >= 2 && !DM[q - 1]) c++; if (bx < bw - 1 && BA[q + 1] >= 2 && !DM[q + 1]) c++; if (by > 0 && BA[q - bw] >= 2 && !DM[q - bw]) c++; if (by < bh - 1 && BA[q + bw] >= 2 && !DM[q + bw]) c++;
      if (c <= 1) DM[q] = c ? 1 : 2;
    }
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const q = by * bw + bx;
      if (BA[q] >= 2 && !DM[q]) continue;
      let sb = -1;
      const t = (r) => { if (BN[r] >= 2 && !DM[r] && (sb < 0 || NEAR[BS[r]] > NEAR[BS[sb]])) sb = r; };
      if (bx > 0) t(q - 1); if (bx < bw - 1) t(q + 1); if (by > 0) t(q - bw); if (by < bh - 1) t(q + bw);
      if (sb < 0 && !DM[q]) continue;
      const v0 = sb < 0 ? 1 << 30 : 0;   // (...and an art pixel folded into the outline with no body left beside it goes: on its own it stayed, a stray pixel off the figure's edge)
      const v = v0 || (sb === q + 1 || sb === q + bw ? sb + 1 : -(sb + 1));   // (+: the lit side - this pixel is left of or above what it outlines)
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const x = 2 * bx - ox + dx, y = 2 * by - oy + dy; if (x >= 0 && y >= 0 && x < w && y < h) OL[y * w + x] = v; }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    let j = i, ob = -1;
    if (OL) { if (OL[i] === 1 << 30) continue; if (OL[i]) { ob = Math.abs(OL[i]) - 1; j = BS[ob]; } else if (PID[i] < 0) continue; }
    else if (PID[i] < 0) {
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
    } else if (ob >= 0) {
      const lit = OL[i] > 0 ? 0 : 2, m = PL.ol[lit] / BN[ob];
      let r = 24 + BC[ob * 3] * m, g = 16 + BC[ob * 3 + 1] * m * 0.92, b = 26 + BC[ob * 3 + 2] * m;
      const L = r * 0.3 + g * 0.59 + b * 0.11, cap = PL.ol[lit + 1];
      if (L > cap) { r *= cap / L; g *= cap / L; b *= cap / L; }
      gc[o] = r; gc[o + 1] = g; gc[o + 2] = b; gf[i] = F_CHAR | FL[j];
    } else { gc[o] = 24 + CR[j] * 0.12; gc[o + 1] = 16 + CG[j] * 0.09; gc[o + 2] = 26 + CB[j] * 0.13; gf[i] = F_CHAR | FL[j]; }
  }
  // (opt.info, for the tools and the layering test: what each pixel is - its material's number, its part's group, 1 where it's outline)
  if (opt.info) { const mtl = MTL.slice(0, n), grp = new Uint8Array(n), ol = new Uint8Array(n), ln = new Uint8Array(n), part = new Array(n).fill(''); for (let i = 0; i < n; i++) { if (OL && OL[i]) { ol[i] = 1; mtl[i] = 0; } else if (PID[i] < 0) mtl[i] = 0; else { grp[i] = PID[i] >= prims.length ? GR.ITEM : prims[PID[i]].g; part[i] = PID[i] >= prims.length ? 'item' : prims[PID[i]].seat ? 'seat' : prims[PID[i]].part; ln[i] = LN[i]; } } G.info = { mtl, grp, ol, part, ln, D }; }
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
  if (G.info) { O.info = {}; for (const k in G.info) { const s = G.info[k]; if (k === 'D') { O.info.D = s; continue; } const d = O.info[k] = s.slice(0, w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = s[(y + y0) * G.w + x0 + x]; } }
  return O;
}
// a held item: items.js draws it flat along the item's axis; its plane is turned toward the camera when it would be
// seen edge-on, and every pixel is depth-tested against the body (fists close round the grip, things held behind are hidden)
const ITEM_SCALE = { gun1: 1.08, gun2: 1.18, rocket: 1.06, bill: 1, phone: 1, umb: 1 };
function heldItem(IT, P, w, h, AX, AY, opt) {
  const ID = IT.ID, cls = ICLS[IT.kind], hs = ID.hs * (ITEM_SCALE[cls] || 1.04) * (PL && PL.itemK || 1), A3 = IT.axis, Cv = [0, CA, SA];
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
// The face at the game's scale is drawn on the art grid (SPEC: one art pixel is 2 x 2 world px, the grid anchored to
// the feet), each feature a whole art pixel, so the bake keeps it as it is: an eye is one dark pixel (tinted by its
// colour), the mouth one pixel a row of skin below, glasses a bar across. (One-pixel stamps used to be merged by the bake:
// eyes, brows and lashes into a dark smear, the mouth into the cheek.)
function face(fig, P, A, D, w, h, AX, AY) {
  const hp = fig.prims[fig.head], c = hp.c, M = hp.M, r = hp.r, K = fig.head, W = fig.W;
  const at = (l0, l1, l2) => {
    const lx = l0 * r[0], ly = l1 * r[1], lz = l2 * r[2];
    const X = c[0] + M[0] * lx + M[1] * ly + M[2] * lz, Y = c[1] + M[3] * lx + M[4] * ly + M[5] * lz, Z = c[2] + M[6] * lx + M[7] * ly + M[8] * lz;
    const nx = M[0] * l0 / r[0] + M[1] * l1 / r[1] + M[2] * l2 / r[2], ny = M[3] * l0 / r[0] + M[4] * l1 / r[1] + M[5] * l2 / r[2], nz = M[6] * l0 / r[0] + M[7] * l1 / r[1] + M[8] * l2 / r[2];
    const nl = Math.hypot(nx, ny, nz) || 1, x = Math.floor(AX + X), y = Math.floor(AY + Y * SA - Z * CA);
    // (the art pixel it falls in: its top-left world px)
    return { x, y, bx: AX + 2 * Math.floor((x - AX) / 2), by: AY + 2 * Math.floor((y - AY) / 2), fc: (ny * CA + nz * SA) / nl };
  };
  const JAW = K + 1, SNP = PL && A.fmask ? (pk) => pk >= 0 && pk < fig.prims.length && fig.prims[pk].part === 'snout' : null;   // (the polish pass: an animal mask's muzzle is face too - its nose and mouth are stamped on it)
  const onHead = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (PID[y * w + x] === K || PID[y * w + x] === JAW || (SNP !== null && SNP(PID[y * w + x])));
  // one art pixel: the 2 x 2 block at (bx, by), where it's on the face; dx, dy step whole art pixels
  const put = (q, col, dx = 0, dy = 0) => {
    const x0 = q.bx + dx * 2, y0 = q.by + dy * 2;
    let n = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (onHead(x0 + i, y0 + j)) n++;
    if (n < 2) return false;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const x = x0 + i, y = y0 + j;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = y * w + x, pk = PID[k];   // (on the face, or a fringe over it; never a held item: its PID is ITEMID)
      if (onHead(x, y) || (pk >= 0 && pk < fig.prims.length && fig.prims[pk].g === GR.HAIR)) { CR[k] = col[0]; CG[k] = col[1]; CB[k] = col[2]; }
    }
    return true;
  };
  const skin = W.skin;
  // as the head turns away from the camera the near-side features slide back round it (pixel-art profiles keep the
  // eye a pixel inside the face's edge)
  const fh = Math.hypot(M[1], M[4]), turn = fh > 0.2 ? Math.abs(M[1]) / fh : 0, near = M[3] >= 0 ? 1 : -1;
  const azE = (s) => ((A.founder ? 33 : 24) + (s === near ? 16 * turn : 0)) * Math.PI / 180;
  let eyes = [-1, 1].map((s) => { const a = azE(s); return { s, p: at(s * Math.sin(a), Math.cos(a) * 0.99, PL ? PL.eyeZ : 0.12) }; }).filter((e) => e.p.fc > 0.28 && onHead(e.p.x, e.p.y));
  if (eyes.length === 2 && eyes[0].p.bx === eyes[1].p.bx) eyes = [eyes[0].p.fc > eyes[1].p.fc ? eyes[0] : eyes[1]];   // (one pixel wide: the nearer eye)
  // (the polish pass, the owner 11-20 23:27: at an angle the far eye landed an art row off the near one - a face with its eyes on
  // a slope, and every picture laid over the eyes' row - a mask's eye holes, a sleep mask's band - missed one of them. Level:
  // both on the row of the eye that faces the camera more)
  if (PL && PL.eyeLevel && eyes.length === 2 && eyes[0].p.by !== eyes[1].p.by) {
    // (where: on the face with a pixel of cheek beyond it; else a column nearer the other eye, a pixel of skin still between them;
    // else at the face's edge, where all of that art pixel is face - the far eye of a face turned three quarters. And if the eye
    // that faces us less can't come onto the other's row, the other goes onto its row)
    const k0 = eyes[0].p.fc >= eyes[1].p.fc ? 0 : 1;
    for (const k of [k0, 1 - k0]) {
      const o = eyes[1 - k], by = eyes[k].p.by, dx = Math.sign(o.p.bx - eyes[k].p.bx) || 1;
      const cnt = (bx) => { let c = 0; for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (onHead(bx + i, by + j)) c++; return c; };
      const far = (bx) => Math.abs(bx - eyes[k].p.bx) >= 4, C = [[o.p.bx, 3, 2], [o.p.bx - dx * 2, 3, 2], [o.p.bx, 4, 0], [o.p.bx - dx * 2, 4, 0]];
      let ok = 0; for (const [bx, a, b] of C) if (far(bx) && cnt(bx) >= a && cnt(bx + dx * 2) >= b) { o.p = { ...o.p, x: bx, bx, y: by, by }; ok = 1; break; }
      if (ok) break;
    }
  }
  // (the polish pass, 11-20: a face at an angle keeps its far eye - two art pixels on from the near one, a pixel of skin
  // between, where the face has room for it; with one eye it read as a broken face)
  if (PL && PL.eye2 && eyes.length === 1 && turn > 0.2 && turn < 0.9) {
    const e = eyes[0], s2 = -e.s, a2 = azE(s2), p2 = at(s2 * Math.sin(a2), Math.cos(a2) * 0.99, PL.eyeZ), dx = Math.sign(p2.x - e.p.x) || (M[1] > 0 ? 1 : -1), bx = e.p.bx + dx * 4;
    let c = 0; for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (onHead(bx + i, e.p.by + j) && onHead(bx + dx * 2 + i, e.p.by + j)) c++;   // (with a pixel of cheek beyond it: an eye on the face's edge is a notch in it)
    if (c >= 3) eyes.push({ s: s2, p: { ...p2, x: bx, y: e.p.by, bx, by: e.p.by } });
  }
  const glasses = A.glasses, F = A.face || {}, mk = A.makeup || null, fm = A.fmask ? A.fmask.k : null;
  // (#429: the eye's one pixel takes the iris's colour - it was mostly the dark base, and every colour looked the same -
  // darkened only as far as it takes to stand out from the skin round it)
  const iris = F.eyeColor ? hexRgb(F.eyeColor) : null, far = (q) => Math.hypot(q[0] - skin[0][0], q[1] - skin[0][1], q[2] - skin[0][2]) >= 60;
  let eyeC = EYE;
  if (iris) for (let k = 0.8; k > 0.25; k -= 0.1) { eyeC = iris.map((v, i) => Math.round(EYE[i] + (v - EYE[i]) * k)); if (far(eyeC)) break; }
  const lit = (cc, k) => cc.map((v) => Math.min(255, Math.round(v + (255 - v) * k)));
  const cx0 = at(0, 1, 0).x, outOf = (e) => (e.p.x < cx0 ? -1 : 1);   // (the side of the face an eye is on)
  // (2026-11-14: every option reads at the game's size) stamps of art pixels round a point (the *_ST tables)
  const e0 = eyes[0] && eyes[0].p, mixC = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const stamp = (q, s, K, o = 1, dy = 0) => { for (let i = 0; i < s.length; i += 3) put(q, K[s[i + 2]], (s.charCodeAt(i) - 49) * o, s.charCodeAt(i + 1) - 49 + dy); };
  // the nose under the eyes, its shadow to the right (the light's from the left): straight, small, button, wide, long, hooked
  const covered0 = A.mask || A.bandana || A.medmask || fm;
  const cx = PL && { at, put, onHead, eyes, e0, A, D, P, F, W, skin, eyeC, near, turn, EYE, WHITE, LASH, hexRgb };
  if (e0 && !covered0) {
    const an = near * turn * 0.3, n = at(Math.sin(an), Math.cos(an), -0.2);
    if (cx) PL.nose(cx, n);
    else stamp({ bx: n.bx, by: e0.by + 2 }, NOSE_ST[F.nose | 0], { s: skin[2], d: skin[1], k: skin[0], l: lit(skin[3], 0.3) });
  }
  if (A.glassForm === 'founder' && !eyes.length) for (const sd of [-1, 1]) for (let t = 0; t <= 1; t += 0.1) { const az = (75 + t * 105) * Math.PI / 180, q = at(sd * Math.sin(az), Math.cos(az), 0.22); if (q.fc > 0) put(q, [176, 44, 150]); }   // (from behind: the band of his glasses)
  if (glasses && eyes.length) {
    // frames and lenses kept a step from the skin they sit on (dark frames on dark skin, gold on tan), a glint on the
    // left lens, the arms back to the ears; GLS: each kind's stamp round an eye
    const sk = lum(skin[3]), pop = (c) => (Math.hypot(c[0] - skin[3][0], c[1] - skin[3][1], c[2] - skin[3][2]) > 70 ? c : lum(c) < 0.3 && sk < 0.42 ? lit(c, 0.5) : c.map((v) => Math.round(v * 0.72)));
    const fcol = pop(hexRgb(A.glassColor || '#1a1a1e')), tcol = pop(hexRgb(A.glassTrim || '#d9a21b')), gk = A.glassForm || glasses;
    const lens = glasses === 'goggles' ? tcol : pop(A.lens ? hexRgb(A.lens).map((v) => Math.round(v * 0.8)) : glasses === 'swim' ? fcol : [26, 28, 38]);
    const K = { F: fcol, H: lit(fcol, 0.45), L: lens, D: lens.map((v) => Math.round(v * 0.6)), G: lit(lens, 0.5), E: mixC(eyeC, [206, 224, 238], 0.5), T: tcol, C: [196, 210, 216], W: mixC(skin[3], [240, 244, 248], 0.6), K: eyeC };
    const strap = (col, a0 = 50, a1 = 150) => { for (const s of [-1, 1]) for (let t = 0; t <= 1; t += 0.25) { const az = (a0 + t * (a1 - a0)) * Math.PI / 180, q = at(s * Math.sin(az), Math.cos(az), 0.14); if (q.fc > 0) put(q, col); } };   // (round the head at the eyes)
    if (gk === 'goggles' || gk === 'swim' || gk === 'safety') strap(gk === 'safety' ? tcol : fcol);
    else if (gk === 'founder') strap(fcol, 60, 180);
    else if (turn > 0.35 && gk !== 'patch' && gk !== 'domino' && gk !== 'monocle') strap(fcol, 66, gk === 'sleep' ? 150 : 100);
    const one = gk === 'monocle' || gk === 'patch' ? eyes.reduce((a, b) => (b.s > a.s ? b : a)) : null;
    if (gk === 'visor') {   // (a shield, mirrored in a rainbow, its rim under it)
      const xs = eyes.map((e) => e.p.bx), xa = Math.min(...xs), xb = Math.max(...xs), RB = [[214, 64, 58], [240, 168, 40], [60, 128, 222], [150, 72, 204]];
      let i = 0; for (let x = xa - 2; x <= xb + 2; x += 2) { put({ bx: x, by: e0.by }, RB[i++ % 4]); if (x >= xa && x <= xb) put({ bx: x, by: e0.by + 2 }, fcol); }
    } else for (const e of eyes) {
      if (one && e !== one) { put(e.p, eyeC); continue; }
      const o = outOf(e);
      K.G = o < 0 ? lit(lens, 0.5) : lens;
      stamp(e.p, ((PL && PL.GLS && PL.GLS[gk]) || GLS[gk] || GLS.round) + (A.glassBig ? GLS[gk + '+'] || '' : '') + (A.glassCat ? '20F30F' : '') + (A.glassChain ? '22T23T' : ''), K, o);
    }
    if (gk === 'patch') {   // (ONE strap round the head, up over the other side)
      const e = one;
      for (let t = 0.2; t <= 1; t += 0.2) { const q = at(e.s * (0.45 - t * 1.3), Math.cos(t * 1.4) * 0.9, 0.2 + t * 0.62); if (q.fc > 0) put(q, fcol); }
    }
  } else {
    // the eyes and brows (CC8's options): almond the iris alone; round and big tall with lashes over (big the white
    // showing beside); narrow a dark squint; hooded the lid's shadow over; sleepy a heavy lid drooping out. Brows in the
    // hair's colour over them: natural unmarked, thick, thin, arched, straight, bushy
    const E5 = F.eyes | 0, hairC = W.hairR ? W.hairR[1] : EYE, lid = mixC(LASH, skin[1], 0.2);
    const EK = { i: E5 === 2 ? mixC(eyeC, LASH, 0.55) : eyeC, l: LASH, w: WHITE, s: skin[1], d: lid, h: hairC, m: mixC(hairC, skin[3], 0.45) };
    if (cx) PL.eyes(cx);
    else for (const e of eyes) {
      if (!P.eyes) { put(e.p, skin[0]); continue; }
      const o = outOf(e);
      stamp(e.p, EYE_ST[E5] || '11i', EK, o);
      stamp(e.p, BROW_ST[F.brows | 0] || '', EK, o, E5 & 1 || E5 === 4 ? -1 : 0);
    }
  }
  // the face's shape at the game's size: a square jaw's corners, a heart's cheekbones, a diamond's both
  if (!covered0 && SHAPE_ST[F.shape | 0]) for (const e of eyes) stamp(e.p, SHAPE_ST[F.shape | 0], { j: skin[2], c: lit(skin[3], 0.25) }, outOf(e));
  // CP2's masks: an alien's big black eyes, a skull's sockets, a gas mask's round lenses, a clown's painted diamonds
  if (fm && !(A.founder && glasses)) for (const e of eyes) {
    if (fm === 'alien') { put(e.p, [14, 16, 14]); put(e.p, [14, 16, 14], outOf(e), 0); }
    else if (PL && fm === 'pig' && A.fmask.animal === 'panda') { const bk = [26, 22, 26]; put(e.p, bk); put(e.p, bk, outOf(e), 0); put(e.p, bk, 0, 1); put(e.p, bk, outOf(e), 1); }   // (a panda's black patches round the eyes: two art pixels by two)
    else if (PL && fm === 'pig' && A.fmask.animal === 'bear') put(e.p, [26, 20, 18]);
    else if (fm === 'skull') { put(e.p, [24, 20, 22]); put(e.p, [24, 20, 22], 0, -1); }
    else if (fm === 'gas') put(e.p, [150, 172, 182]);
    else if (fm === 'clown') put(e.p, [52, 104, 214], 0, -1);
  }
  // marks a pixel across can carry: blush, a face tattoo, a scar
  const covered = A.mask || A.bandana || A.medmask || (fm && fm !== 'clown' && fm !== 'skull'), dot = (l0, l1, l2, col, min = 0.35) => { const q = at(l0, l1, l2); if (q.fc > min) put(q, col); };
  if (!covered && F.freckles) for (const sx of [-1, 1]) dot(sx * 0.5, 0.86, -0.28, [Math.round(skin[1][0] * 0.82), Math.round(skin[1][1] * 0.7), Math.round(skin[1][2] * 0.66)], 0.45);
  if (!covered && F.mole) dot(0.38, 0.9, -0.5, [70, 44, 36], 0.45);
  if (!A.mask && !fm) {
    if (mk && (mk.kind === 'blush' || mk.kind === 'glam')) for (const s of [-1, 1]) dot(s * 0.55, 0.82, -0.26, [Math.min(255, skin[3][0] + 14), Math.round(skin[3][1] * 0.84), Math.round(skin[3][2] * 0.86)], 0.5);
    if ((A.tattoo | 0) & 16) dot(0.42, 0.88, -0.06, [52, 58, 84], 0.4);
    if (!covered && A.scar) { const S = [null, [0.48, 0.84, -0.12], [0.36, 0.92, 0.32], [0.16, 0.95, -0.5], [0.06, 0.88, -0.76], [0.4, 0.9, 0.46]][A.scar | 0]; if (S) dot(S[0], S[1], S[2], [Math.min(255, skin[3][0] + 34), Math.min(255, skin[3][1] + 14), Math.min(255, skin[3][2] + 14)], 0.4); }
  }
  // the mouth (not under a bandana or a mask): one pixel, a row of skin under the eyes
  if (!covered) {
    const am = near * turn * 0.25, m = at(Math.sin(am), Math.cos(am) * 0.9, -0.58);
    if (m.fc > 0.3 && onHead(m.x, m.y)) {
      const mc = fm === 'clown' ? hexRgb(A.fmask.t) : mk && mk.color && (mk.kind === 'lipstick' || mk.kind === 'glam') ? hexRgb(mk.color) : mk && mk.kind === 'goth' ? [34, 22, 34] : null;
      const lip = mc || (D.fem ? [Math.round(skin[1][0] * 0.9 + 26), Math.round(skin[1][1] * 0.72), Math.round(skin[1][2] * 0.78)] : skin[1]);
      // (on the eyes' row or right under it - a very short face - it moves down one)
      const L5 = fm === 'clown' ? 3 : A.face?.lips | 0, my = e0 && m.by - e0.by < 4 ? 1 : 0;
      if (fm === 'skull') { put(m, [40, 34, 30], -1, my); put(m, [40, 34, 30], 1, my); }   // (the teeth between two gaps)
      else if (cx) PL.mouth(cx, m, lip, L5, my);
      else stamp(m, LIP_ST[L5], { a: lip, t: mixC(lip, skin[0], 0.5), b: lit(lip, 0.3), c: mixC(lip, skin[3], 0.5) }, 1, my);   // (medium, thin a dark line, full two pixels, wide three, a bow's lit top, small a faint dot)
    }
  }
  if (cx && PL.masks && e0) PL.masks({ ...cx, fm, fwd: M[1] > 0 ? 1 : -1 });   // (the polish pass: masks as small pictures in art pixels, over all of the above)
}
function water(w, h, AX, AY, X, S, P, R = 1) {
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
  const c = X.pt(vlerp(S.shL, S.shR, 0.5)), cx = AX + c[0] * R, cy = AY + (c[1] * SA + 1) * R;
  for (let a = 0; a < 6.283; a += 0.1 / R) {
    const x = Math.round(cx + Math.cos(a) * 11 * R), y = Math.round(cy + Math.sin(a) * 4.2 * R);
    if (x < 0 || y < 0 || x >= w || y >= h || hash(x - AX, y - AY, 9) < 0.35) continue;
    const i = y * w + x;
    if (PID[i] >= 0) continue;
    PID[i] = FOAMID; NOO[i] = 1; FL[i] = F_NOCAST; CR[i] = 214; CG[i] = 238; CB[i] = 242; ZW[i] = 0; NEAR[i] = -1e8; EM[i] = null;
  }
}
// The Sims' way (the owner, 11-01: "pixelated instead of a blue square"): over each private area a mosaic of chunky
// blocks, each the average of the body's own pixels under it - skin, shading and all - so it reads as the body blurred
// into squares, not a patch stuck on. Blocks are 2 art pixels (2R close up) on a grid that moves with the body; the
// mosaic is a little larger than what it hides, and no crease or outline line crosses it (AO -1).
function censor(fig, S, X, D, w, h, AX, AY, R = 1) {
  const W = fig.W, spots = [];
  // (the polish pass, the owner 11-20: two patches apart, like The Sims' - the hips' and the chest's, a row of skin between them on the chunky build)
  if (W.bk === 'none') spots.push([vadd(S.pel, mv(S.PF, [0, D.pelR[1] * 0.95, -D.pelR[2] * (PL ? 0.55 : 0.3)])), PL ? 8 : 10, PL ? 6 : 8]);
  if (PL && W.bk === 'none') spots.push([vadd(S.pel, mv(S.PF, [0, -D.pelR[1] * 0.95, -D.pelR[2] * 0.5])), 8, 6]);   // (pass 2: from behind too)
  if (W.tk === 'none' && D.fem) spots.push([vadd(S.chest, mv(S.SP, [0, D.chestR[1] + 0.2, PL ? 1.6 : 1.0])), PL ? 12 : 14, PL ? 4 : 6]);
  const B = 2 * R;
  for (const [p, bw, bh] of spots) {
    const q = X.pt(p), s = q[1] * CA + q[2] * SA, cx = Math.round(AX + q[0] * R), cy = Math.round(AY + (q[1] * SA - q[2] * CA) * R);
    let seen = false;                                                // facing us (a body pixel close by is not much nearer)
    for (let dy = -R; dy <= R && !seen; dy++) for (let dx = -R; dx <= R; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < w && y < h && PID[y * w + x] >= 0 && NEAR[y * w + x] - s < 4) { seen = true; break; } }
    if (!seen) continue;
    const nx = Math.max(2, Math.round(bw * R / B)), ny = Math.max(2, Math.round(bh * R / B));
    let xa = cx - ((nx * B) >> 1), ya = cy - ((ny * B) >> 1);
    if (PL && R === 1) { xa -= (xa + (Math.round(AX) & 1)) & 1; ya -= (ya + (Math.round(AY) & 1)) & 1; }   // (the polish pass: its squares are art pixels - off the grid the chest's came out a blur and the hips' a checker, the owner 11-20)
    for (let j = 0; j < ny; j++) for (let k = 0; k < nx; k++) {
      // (the corners left out: a rounded patch, as the game's mosaic reads)
      if ((j === 0 || j === ny - 1) && (k === 0 || k === nx - 1) && nx > 3 && ny > 3) continue;
      const bx = xa + k * B, by = ya + j * B;
      let r = 0, g = 0, b = 0, m = 0;
      // (averaged over the block and a pixel round it: soft, like a blur, the neighbours' tones bleeding in)
      for (let y = by - 1; y < by + B + 1; y++) for (let x = bx - 1; x < bx + B + 1; x++) { if (x < 0 || y < 0 || x >= w || y >= h) continue; const i = y * w + x; if (PID[i] < 0) continue; r += CR[i]; g += CG[i]; b += CB[i]; m++; }
      if (!m) continue;
      const jt = ((j + k) & 1 ? (PL ? 1.26 : 1.12) : PL ? 0.64 : 0.86) + (hash(k + Math.round(cx / B), j + Math.round(cy / B), 41) - 0.5) * 0.14;   // (each block its own shade, neighbours apart: the squares show)
      r = r / m * jt; g = g / m * jt; b = b / m * jt;
      for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) { if (x < 0 || y < 0 || x >= w || y >= h) continue; const i = y * w + x; if (PID[i] < 0) continue; CR[i] = r; CG[i] = g; CB[i] = b; AO[i] = -1; }
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
  if (['pushup', 'situp', 'carry', 'handsup', 'cuffed', 'kneel', 'roll', 'down', 'dead', 'swim', 'ride', 'pedal', 'sit', 'sitlow', 'drive', 'crawl', 'downF', 'downB', 'deadF', 'deadS', 'chop', 'tuck', 'sitx', 'bars', 'bang', 'thump', 'cue', 'cartkick', 'cartride', 'cartsit', 'surfpad', 'surf', 'surfair', 'saddle'].includes(pn)) kind = null;   // (nothing in the hands on a shopping cart)
  if (pn === 'hood') kind = null;
  const acc = A.carry && CARRY.includes(A.carry) ? A.carry : null;
  const th = Math.PI / 2 - (((dir | 0) % 8) + 8) % 8 * Math.PI / 4;
  const D = dims(A); if (PL && A.prop && PL.propHold && PL.propHold[A.prop[0]]) D.hold = PL.propHold[A.prop[0]];   // (the polish pass: a newspaper, a clipboard, a laptop sleeve, a ball are held against the chest - accHands)
  const P = rig(D, A, pn, f, kind, acc);
  if (opt.blink) P.eyes = 0;   // (a blink: the figure as it stands, the eyes shut)
  if (A.founder && pn === 'idle' && !kind) { const h0 = P.hands; P.hands = (S) => { if (h0) h0(S); P.hR = vadd(S.shR, mv(S.SP, [7.6, 1.6, 8.0 + (f & 1) * 0.5])); P.elR = [1, 0, -0.6]; P.peace = 1; }; }
  if (!P.root) P.camYaw = 0.3 * Math.cos(th);                       // E +, W -: the face turns toward the camera (south)
  const S = solve(D, P);
  if (opt.lineLen > 0 && P.line) P.line = opt.lineLen;              // (a pose's hands set its line while solving)
  const X = makeXF(th, P), seed = seedOf(A);
  // (the polish pass, the owner 11-20 16:51: "arms/hands seem way too long on side view". The camera looks down, so what
  // stands nearer to it is drawn lower: from the side the near arm - a shoulder's width nearer than the spine - hung two
  // art pixels lower than it does from the front, its hand at the knee. Standing or walking in profile, the near arm is
  // lifted by PL.armLift of that drop (PL.armLiftMax at most: a big build's shoulder is not lifted into his ear); what the hand holds or wears goes with it.)
  if (PL && PL.armLift && (((dir | 0) % 4) + 4) % 4 === 2 && (pn === 'idle' || pn === 'stand' || pn.startsWith('walk'))) {
    const mid = X.pt(vlerp(S.shL, S.shR, 0.5))[1];
    for (const k of ['L', 'R']) { const dz = Math.min(PL.armLiftMax || 99, PL.armLift * (X.pt(S['sh' + k])[1] - mid) * (SA / CA)); if (dz <= 0) continue; for (const j of ['el', 'ha']) S[j + k] = vadd(S[j + k], [0, 0, dz]); S['shA' + k] = vadd(S['sh' + k], [0, 0, dz]); }
  }
  const fig = buildFigure(A, D, P, S, X, kind, acc, seed);
  fig.dir8 = (((dir | 0) % 8) + 8) % 8; fig.pose = pn;
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

// ==== The city's people (task #365, server/systems/personas.js): personality walks and props ========================
// walks (POSES): hunch (a senior's stoop on a cane), strut, skate, blade (rollerblades), dance, push (a cart), lean (on a
// wall); props (app.carry): trolley, cart, leads (three dogs'), guitar, call (the phone at an ear)
Object.assign(POSES, { hunch: 6, strut: 6, skate: 8, blade: 6, dance: 4, push: 6, lean: 2 });
Object.assign(POSES, { pushup: 2, situp: 2 });   // (working out: server workout.js)
// skateboarding (server skate.js, shared/skate.js TRICKS): skatec rolling, skateair the ollie (lifted by the renderer),
// skflip kick- (0-5) and heelflip (6-11), skshove, sktre, skgrab (indy melon method nosegrab), skgrind (50-50 5-0
// boardslide crooked), skmanual
Object.assign(POSES, { skatec: 1, skateair: 3, skflip: 12, skshove: 6, sktre: 6, skgrab: 4, skgrind: 4, skmanual: 2 });
// surfing (server surf.js): surfpad lying on the board paddling, surf up on a wave (the carve each way), surfair off the
// lip (lifted by the renderer); the board (P.surf) under the feet or the body
Object.assign(POSES, { surfpad: 2, surf: 2, surfair: 1 });
// a shopping cart (shared/vehicles.js cart): cartkick (8 frames, a foot kicking the ground), cartride (up on the back
// rail), cartsit (in the basket)
Object.assign(POSES, { cartkick: 8, cartride: 2, cartsit: 2 });
CARRY.push('trolley', 'cart', 'leads', 'guitar', 'call', 'map');
Object.assign(ACC_HANDS, { trolley: 1, cart: 2, leads: 1, guitar: 2, call: 1, map: 2 });
// the buskers (server personas.js BUSKS): sax, violin (and its stand), drums (upturned buckets), statue (a living statue
// in bronze on its crate; statuebow when a coin drops); the guitarist has his amp and the open case
CARRY.push('sax', 'violin', 'drums', 'statue');
Object.assign(ACC_HANDS, { sax: 2, violin: 2, drums: 2, statue: 2 });
Object.assign(POSES, { statue: 1, statuebow: 1 });
// people at their activities (server activities.js): easel (a painter's), cooler (an angler's), chess (on the table)
CARRY.push('easel', 'cooler', 'chess', 'sponge', 'crate', 'rifle', 'dice');
Object.assign(ACC_HANDS, { easel: 1, sponge: 1 });   // (sponge: washing the car, the bucket at their feet; crate: a picker's)
// part 2: fence (the neighbours' garden fence), cueup (the cue stood up beside him); the pose cue (the stroke: 4 frames)
CARRY.push('fence', 'cueup');
Object.assign(ACC_HANDS, { cueup: 1 });
Object.assign(POSES, { cue: 4 });
// the people of the wilds (server wildfolk.js): binoculars, poles, radio in the hands; and whatever the pose basket, kayak
// (on the shoulder), tripod (a spotting scope), tackle, campstove, climbkit, rope (over the shoulder, up the rock)
CARRY.push('binoculars', 'poles', 'radio', 'basket', 'kayak', 'tripod', 'tackle', 'campstove', 'climbkit', 'rope');
// people at their jobs (server personas.js): broom (a sweeper's), letters (a mail carrier's, at a mailbox)
CARRY.push('broom', 'letters');
// a surfboard of your own carried under the arm (server gear.js: the descriptor's pp 'surfboard')
CARRY.push('surfboard');
Object.assign(ACC_HANDS, { surfboard: 1 });
Object.assign(ACC_HANDS, { broom: 2, letters: 1 });
Object.assign(ACC_HANDS, { binoculars: 2, radio: 1, basket: 1, kayak: 2 });
const MAT = (c, g = 0) => (Q) => { if (g) Q.gloss = g; return cloth(c); };
// in the air over the board: knees tucked up (the feet `up` over the ankles' height), arms out; the deck drawn apart (P.deck)
function skTuck(D, P, up, tw) {
  P.acc = false; P.board = true; P.lean = 0.04; P.twist = tw; P.pelYaw = -0.5; P.headYaw = 0.45; P.headPitch = 0.1;
  P.pel = [-1.2, 3.2, D.pelZ - 1.0];
  P.fL = [-1.4, 7.6, D.ank + up]; P.fR = [-1.6, -1.2, D.ank + up - 0.4]; P.kneeL = [-0.3, 1, 1.1]; P.kneeR = [0.3, -0.2, 1.2];
  P.hands = (S) => { P.hL = vadd(S.shL, [-9.6, 1.6, -2.0]); P.hR = vadd(S.shR, [9.4, -1.4, -1.6]); P.openL = P.openR = 1; };
}
const STATUE_UP = 8;   // (the living statue's crate: how high it stands)
// an instrument case open on the ground in front of a busker (x, y: its middle, in the figure's frame), coins in its lining
function buskCase(B, E, x, y, shell = '#2a2228', lining = '#a83040') {
  B([x, y, 0.8], I3, [2.8, 7.4, 0.8], GR.ACC, 'case', MAT(shell, 0.3));
  B([x, y, 1.45], I3, [2.2, 6.6, 0.2], GR.ACC, 'lining', MAT(lining));
  for (const [dx, dy] of [[-0.8, -2.4], [0.9, -0.4], [-0.4, 1.6], [0.7, 3.4], [-1.0, 4.6]]) E([x + dx, y + dy, 1.8], I3, [0.6, 0.6, 0.2], GR.ACC, 'coin', M365.brass);
}
const M365 = { brass: MAT('#d8a83a', 0.6), violin: MAT('#9a4a22', 0.5), metal: MAT('#a4a8b0', 0.5), rubber: MAT('#26262a'), blanket: MAT('#6a7a9a'), tartan: MAT('#8a2a34'), wood: MAT('#d0903e', 0.4), deck: MAT('#2a9aa8', 0.3), surf: MAT('#f4efe2', 0.55), stripe: MAT('#e0582a', 0.4), lead: MAT('#c8262b'), dark: MAT('#1c1c22', 0.4), wheel: MAT('#f2c21b'), bag: MAT('#3a5a3a') };
const GAITS2 = {
  surfpad(D, P, f) {   // prone on the board, head up, paddling: an arm reaching forward beside the board, the other pulling back
    P.acc = false; P.ground = true; P.rise = 0.4; P.headPitch = -1.15; P.lean = 0; P.surf = 'pad';
    P.fL = [-D.hipX * 0.6, -1.0, D.ank]; P.fR = [D.hipX * 0.6, -1.0, D.ank];
    P.hands = (S) => {
      const fw = [0, 4.0, 14.6], bk = [0, 4.6, -12.4], o = 3.2;
      P.hR = vadd(S.shR, f ? [o, bk[1], bk[2]] : [o * 0.6, fw[1], fw[2]]); P.hL = vadd(S.shL, f ? [-o * 0.6, fw[1], fw[2]] : [-o, bk[1], bk[2]]);
      P.elR = [1, 0.4, -0.2]; P.elL = [-1, 0.4, -0.2]; P.openL = P.openR = 1;
    };
    P.root = rx(1.45);
  },
  surf(D, P, f) {   // up on the wave: side-on along the board, knees deep, arms out for the balance - leaning into the carve
    const s = f ? -1 : 1;
    P.acc = false; P.surf = 'ride'; P.lean = 0.16; P.twist = 0.34 + s * 0.08; P.pelYaw = -0.6; P.headYaw = 0.55; P.headPitch = -0.06; P.tilt = s * 0.08;
    P.pel = [-1.4, 3.0, D.pelZ - 3.4];
    P.fL = [-1.6, 9.2, D.ank + 1.8]; P.kneeL = [-0.4, 1, 0.5];
    P.fR = [-1.8, -3.2, D.ank + 1.8]; P.kneeR = [0.4, -0.3, 0.7];
    P.hands = (S) => { P.hL = vadd(S.shL, [-8.6, 3.2 + s * 1.6, -3.4 + s]); P.hR = vadd(S.shR, [8.2, -3.0 + s * 1.4, -4.2 - s]); P.openL = P.openR = 1; };
  },
  surfair(D, P) {   // up off the lip: knees tucked over the board, arms out
    skTuck(D, P, 5.0, 0.3);
    P.board = false; P.surf = 'air';
  },
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
  skate(D, P, f) {   // a kick (8 frames, shared/physics.js KICK: the page plays them on the push's own phase): 0 rolling with
    // the back foot on the tail, off the deck, ahead, planted, driving back, the toe-off, forward again, back on the tail;
    // the front foot stays over the front bolts, its knee giving as the body sinks into the push
    const k = f & 7;
    const FR = [[-1.0, -2.4, 2.3], [1.8, 1.4, 4.8], [3.6, 8.2, 2.0], [3.9, 5.4, 0], [4.0, -4.2, 0], [3.6, -11.0, 0.8], [2.8, -6.4, 4.4], [0.6, -3.0, 3.6]][k];
    const sink = [0.9, 1.6, 2.6, 3.6, 3.4, 2.8, 1.9, 1.2][k], lean = [0.07, 0.1, 0.16, 0.22, 0.25, 0.26, 0.17, 0.1][k];
    P.acc = false; P.board = true; P.lean = lean; P.twist = [-0.06, -0.08, -0.14, -0.12, 0.02, 0.1, 0.04, -0.04][k]; P.headPitch = -0.1;
    P.pel = [-0.6 + FR[0] * 0.12, 0.4, D.pelZ - sink];
    P.fL = [-1.5, 5.6, D.ank + 2.3]; P.kneeL = [-0.2, 1, 0.3];
    P.fR = [k === 0 ? -1.0 : D.hipX + FR[0] - 1.6, FR[1], D.ank + FR[2]]; P.kneeR = [0.2, 1, k >= 5 && k <= 6 ? -0.3 : 0];
    const sw = [0, 0.3, 0.8, 1, 0.4, -0.5, -0.8, -0.3][k];   // (the arms swing against the pushing leg)
    P.hands = (S) => { P.hL = vadd(S.shL, [-4.6, 1.4 + sw * 2.6, -9.2 + Math.abs(sw) * 0.8]); P.hR = vadd(S.shR, [4.4, -1.2 - sw * 2.8, -9.4 + Math.abs(sw) * 0.8]); P.openL = P.openR = 1; };
  },
  skatec(D, P) {   // rolling: the front foot over the front bolts, the back foot on the tail, side-on to the way they go
    P.acc = false; P.board = true; P.lean = 0.06; P.twist = 0.32; P.pelYaw = -0.55; P.headYaw = 0.5; P.headPitch = -0.08;
    P.pel = [-1.2, 3.2, D.pelZ - 2.0];
    P.fL = [-1.4, 8.4, D.ank + 2.3]; P.kneeL = [-0.3, 1, 0.4];
    P.fR = [-1.6, -1.8, D.ank + 2.3]; P.kneeR = [0.3, -0.2, 0.6];
    P.hands = (S) => { P.hL = vadd(S.shL, [-5.6, 2.4, -8.6]); P.hR = vadd(S.shR, [5.2, -2.2, -8.8]); P.openL = P.openR = 1; };
  },
  skateair(D, P, f) {   // 0: crouched to pop; 1: up, knees tucked, arms out for balance; 2: landing, knees taking it
    const up = f === 1, low = up ? 1.6 : f === 0 ? 4.0 : 3.0;
    P.acc = false; P.board = true; P.lean = up ? 0.04 : 0.14; P.twist = 0.3; P.pelYaw = -0.5; P.headYaw = 0.45; P.headPitch = up ? -0.14 : 0.02;
    P.pel = [-1.2, 3.2, D.pelZ - low];
    P.fL = [-1.4, 8.0, D.ank + 2.3]; P.kneeL = [-0.3, 1, up ? 0.9 : 0.5];
    P.fR = [-1.6, -1.6, D.ank + 2.3]; P.kneeR = [0.3, -0.2, up ? 1.0 : 0.7];
    P.hands = (S) => {
      if (up) { P.hL = vadd(S.shL, [-9.6, 1.6, -2.4]); P.hR = vadd(S.shR, [9.4, -1.4, -2.0]); }
      else if (f === 0) { P.hL = vadd(S.shL, [-6.4, 3.4, -7.0]); P.hR = vadd(S.shR, [6.2, -1.2, -7.4]); }
      else { P.hL = vadd(S.shL, [-8.4, 0.6, -5.0]); P.hR = vadd(S.shR, [8.2, -0.8, -5.4]); }
      P.openL = P.openR = 1;
    };
  },
  // the tricks: the deck where the trick has it (P.deck: its middle and how it's turned - figure365), the body round it
  skflip(D, P, f) {   // the deck turning over under tucked feet: a kickflip one way (0-5), a heelflip the other (6-11)
    const k = f % 6, s = f < 6 ? 1 : -1;
    skTuck(D, P, 6.0, 0.4);
    P.deck = { c: [-1.5, 3.6, 3.0], M: ry(s * k * Math.PI / 3) };
  },
  skshove(D, P, f) {   // the deck spinning half round under them, the feet up out of its way
    skTuck(D, P, 5.4, 0.3);
    P.deck = { c: [-1.5, 3.6, 2.6], M: rz(f * Math.PI / 6) };
  },
  sktre(D, P, f) {   // a 360 flip: spinning round and turning over at once
    skTuck(D, P, 6.4, 0.5);
    P.deck = { c: [-1.5, 3.6, 3.0], M: mmul(rz(f * Math.PI / 3), ry(f * Math.PI / 3)) };
  },
  skgrab(D, P, f) {   // knees up, the board brought up to a hand: 0 indy (the back hand, toe side), 1 melon (the front hand,
    // heel side), 2 method (the board kicked out behind, the front hand on it), 3 nosegrab (the nose up in the front hand)
    skTuck(D, P, 7.2, 0.2);
    const z = D.ank + 5.6;
    P.deck = { c: [-1.5, f === 2 ? 0.6 : 3.6, f === 3 ? 4.6 : 4.0], M: f === 2 ? mmul(ry(-0.5), rx(0.25)) : f === 3 ? rx(-0.55) : I3 };
    P.hands = (S) => {
      if (f === 0) { P.hR = [1.6, 3.4, z]; P.hL = vadd(S.shL, [-8.8, 2.0, -2.6]); }
      else if (f === 1) { P.hL = [-3.8, 4.4, z]; P.hR = vadd(S.shR, [8.6, -1.2, -2.0]); }
      else if (f === 2) { P.hL = [-3.6, 0.4, z + 0.6]; P.hR = vadd(S.shR, [8.2, 2.4, 1.6]); P.twist = 0.5; }
      else { P.hL = [-1.6, 9.4, z + 1.8]; P.hR = vadd(S.shR, [8.4, -2.0, -1.4]); }
      P.openL = P.openR = 0;
    };
  },
  skgrind(D, P, f) {   // up on a rail, crouched, the arms out for the balance: 0 50-50, 1 5-0 (on the back truck, the nose up),
    // 2 boardslide (the deck across the rail, the feet apart along it), 3 crooked (the front truck, the nose down and in)
    P.acc = false; P.board = true; P.lean = f === 1 ? -0.06 : 0.1; P.headPitch = -0.08;
    if (f === 2) {
      P.twist = 0.9; P.pelYaw = -1.2; P.headYaw = 0.9;
      P.pel = [-1.2, 3.6, D.pelZ - 2.6];
      P.fL = [-5.0, 3.6, D.ank + 2.3]; P.fR = [2.2, 3.6, D.ank + 2.3]; P.kneeL = [-1, 0.4, 0.3]; P.kneeR = [1, 0.4, 0.3];
      P.deck = { c: [-1.5, 3.6, 1.7], M: rz(Math.PI / 2) };
    } else {
      P.twist = 0.32; P.pelYaw = -0.55; P.headYaw = 0.5;
      P.pel = [-1.2, f === 1 ? 1.6 : 3.2, D.pelZ - 2.8];
      P.fL = [-1.4, 8.4, D.ank + 2.3 + (f === 1 ? 1.8 : f === 3 ? -0.8 : 0)]; P.fR = [-1.6, -1.8, D.ank + 2.3 + (f === 3 ? 1.0 : 0)];
      P.kneeL = [-0.3, 1, 0.6]; P.kneeR = [0.3, -0.2, 0.8];
      if (f === 1) P.deck = { c: [-1.5, 3.6, 2.4], M: rx(-0.22) };
      else if (f === 3) P.deck = { c: [-1.5, 3.6, 2.0], M: mmul(rz(0.3), rx(0.16)) };
    }
    P.hands = (S) => { P.hL = vadd(S.shL, [-9.4, 1.4, -3.2]); P.hR = vadd(S.shR, [9.2, -1.2, -2.8]); P.openL = P.openR = 1; };
  },
  skmanual(D, P, f) {   // on the back wheels, the nose up, the weight back over the tail and the arms out (a little either way)
    const w = f ? 1 : -1;
    P.acc = false; P.board = true; P.lean = -0.1; P.twist = 0.3; P.pelYaw = -0.5; P.headYaw = 0.45; P.headPitch = -0.12;
    P.pel = [-1.2, 1.8, D.pelZ - 2.0];
    P.fL = [-1.4, 8.0, D.ank + 4.0]; P.fR = [-1.6, -1.8, D.ank + 1.8]; P.kneeL = [-0.3, 1, 0.5]; P.kneeR = [0.3, -0.2, 0.6];
    P.deck = { c: [-1.5, 3.6, 2.6], M: rx(-0.32) };
    P.hands = (S) => { P.hL = vadd(S.shL, [-9.2, 2.2 + w, -3.4 + w * 0.8]); P.hR = vadd(S.shR, [9.0, -1.4 + w, -3.0 - w * 0.8]); P.openL = P.openR = 1; };
  },
  cartkick(D, P, f) {   // (the cart's handle and back rail ahead: client/art2/vehicles.js shoppingCart; the rider at shared/vehicles.js crew[0])
    const k = f & 7, FR = [[1.6, 2.6, 2.2], [3.0, 4.2, 1.2], [3.2, 3.0, 0], [3.4, -1.6, 0], [3.4, -6.4, 0], [3.0, -9.6, 0.8], [2.6, -6.0, 3.0], [2.0, -1.0, 3.2]][k];
    const sink = [0.4, 0.9, 1.5, 2.0, 1.8, 1.4, 0.9, 0.5][k];
    P.acc = false; P.lean = 0.3 + sink * 0.04; P.headPitch = -0.16; P.twist = [-0.04, -0.06, -0.1, -0.08, 0.02, 0.08, 0.04, -0.02][k];
    P.pel = [-0.3, 1.4, D.pelZ + 0.6 - sink];
    P.fL = [-1.8, 6.4, D.ank + 4.6]; P.kneeL = [-0.2, 1, 0.5];
    P.fR = [D.hipX + FR[0] - 2.2, FR[1], D.ank + FR[2]]; P.kneeR = [0.2, 1, k >= 4 && k <= 5 ? -0.3 : 0];
    P.hands = (S) => { P.hL = [-5.2, 6.2, 31.2]; P.hR = [5.2, 6.2, 31.2]; P.elL = [-1, -0.5, -0.4]; P.elR = [1, -0.5, -0.4]; P.openL = P.openR = 0; };
  },
  cartride(D, P, f) {   // both feet up on the back rail, the weight forward on the handle, a little bob
    P.acc = false; P.lean = 0.34; P.headPitch = -0.12 - f * 0.04;
    P.pel = [-0.2, 1.8, D.pelZ + 3.0 - f * 0.4];
    P.fL = [-1.9, 6.4, D.ank + 4.6]; P.fR = [1.9, 6.0, D.ank + 4.6]; P.kneeL = [-0.2, 1, 0.6]; P.kneeR = [0.2, 1, 0.6];
    P.hands = (S) => { P.hL = [-5.2, 6.2, 31.2]; P.hR = [5.2, 6.2, 31.2]; P.elL = [-1, -0.5, -0.4]; P.elR = [1, -0.5, -0.4]; P.openL = P.openR = 0; };
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
  statue(D, P) {   // a living statue up on its crate: weight on one leg, the right hand at the hat's brim, the left on the hip
    const up = STATUE_UP;
    P.acc = false; P.lean = -0.03; P.headPitch = -0.1; P.headYaw = 0.2; P.pelYaw = -0.15;
    P.pel = [0.5, 0, D.pelZ + up]; P.fL = [-D.hipX - 0.3, 1.2, D.ank + up]; P.fR = [D.hipX + 0.9, -0.6, D.ank + up]; P.kneeR = [0.3, 1, 0.4];
    P.hands = (S) => { P.hR = vadd(S.neck, mv(S.SP, [3.2, 2.4, 5.6])); P.elR = [1, 0.2, 0.4]; P.hL = vadd(S.shL, mv(S.SP, [-2.4, -0.4, -8.0])); P.elL = [-1, -0.6, 0]; };
  },
  statuebow(D, P) {   // ...a coin in the hat: it comes to life for a moment - a deep bow, the hat swept off in the right hand
    const up = STATUE_UP;
    P.acc = false; P.lean = 0.62; P.headPitch = 0.3;
    P.pel = [0, -1.2, D.pelZ + up - 0.6]; P.fL = [-D.hipX - 0.4, 0.4, D.ank + up]; P.fR = [D.hipX + 0.4, 0.2, D.ank + up];
    P.hands = (S) => { P.hR = vadd(S.shR, mv(S.SP, [5.6, 6.4, -2.0])); P.elR = [1, -0.3, -0.2]; P.hL = vadd(S.shL, mv(S.SP, [-1.4, -1.6, -8.4])); P.elL = [-1, -0.4, 0]; };
  },
  lean(D, P, f, kind, acc) {   // back to a wall, a foot up on it behind, arms folded (1: a glance along the street)
    P.lean = -0.14; P.pel = [0.6, -1.2, D.pelZ - 0.4]; P.headYaw = f ? 0.55 : -0.1; P.headPitch = -0.05;
    P.fL = [-D.hipX - 0.8, 1.6, D.ank]; P.fR = [D.hipX - 0.2, -4.6, D.ank + 6.2]; P.kneeR = [0.2, 1, 0];
    P.hands = acc ? (S) => accHands(D, P, S, acc) : (S) => { P.hL = vadd(S.chest, mv(S.SP, [3.0, 6.4, -2.4])); P.hR = vadd(S.chest, mv(S.SP, [-3.0, 6.8, -1.4])); P.elL = [-1, 0.2, -0.6]; P.elR = [1, 0.2, -0.6]; };
  },
  push(D, P, f, kind, acc) {
    gait(D, P, 0, f / 6, false);
    P.lean = 0.2; P.headPitch = -0.12;
    wrapAcc(D, P, acc || 'cart');
  },
  cue(D, P, f) {   // bent low over the table, feet apart, the left hand's bridge on the felt, the right drawing the cue back and through
    const k = [0, -2.2, -3.6, 1.8][f & 3];
    P.acc = false; P.cue = true; P.lean = 0.95; P.headPitch = -0.85; P.twist = -0.12;
    P.pel = [0.4, -1.6, D.pelZ - 0.8];
    P.fL = [-D.hipX - 1.2, 4.2, D.ank]; P.fR = [D.hipX + 1.4, -3.6, D.ank]; P.kneeL = [-0.2, 1, 0.2]; P.kneeR = [0.2, 1, 0];
    P.hands = (S) => { P.hL = [-1.6, 17.5, 21.2]; P.hR = [2.2, 3.4 + k, 22.4]; P.elL = [-1, 0.2, -0.4]; P.elR = [1, -0.2, -0.6]; P.openL = 1; };
  },
};
function wrapAcc(D, P, acc) { if (!acc) return; const sw = P.hands; P.hands = (S) => { if (sw) sw(S); accHands(D, P, S, acc); }; }
// the hands on a prop (accHands)
const CART_Z = 25, CART_Y = 11.6;
function accHands2(D, P, S, acc) {
  if (STRETCHERS.has(acc)) return stretcherHands(P);   // (the paramedics' stretcher, at the end)
  const r = D.reach;
  if (acc === 'trolley') { P.hR = vadd(S.shR, [2.2, -3.6, -r * 0.86]); P.elR = [1, 0.3, -0.5]; return true; }
  if (acc === 'cart') { P.hR = [4.4, CART_Y, CART_Z]; P.hL = [-4.4, CART_Y, CART_Z]; P.elR = [1, -0.6, -0.4]; P.elL = [-1, -0.6, -0.4]; return true; }
  if (acc === 'leads') { P.hR = vadd(S.shR, [0.4, 7.2, -r * 0.62]); P.elR = [1, -0.5, -0.5]; return true; }
  if (acc === 'guitar') { P.hL = vadd(S.chest, mv(S.SP, [-8.6, 6.4, -2.2])); P.hR = vadd(S.chest, mv(S.SP, [2.2, 7.0, -6.6 + P.breath * 2])); P.elL = [-1, -0.4, -0.5]; P.elR = [1, -0.6, -0.4]; return true; }
  if (acc === 'call') { P.hR = vadd(S.neck, mv(S.SP, [4.4, 1.6, 5.6])); P.elR = [1, -0.2, -1]; P.headYaw += 0.15; return true; }
  if (acc === 'sax') { P.hL = vadd(S.chest, mv(S.SP, [0.4, 7.2, -0.6])); P.hR = vadd(S.chest, mv(S.SP, [1.6, 7.6, -5.4 + P.breath * 1.5])); P.elL = [-1, -0.5, -0.5]; P.elR = [1, -0.5, -0.4]; P.headPitch -= 0.08 + P.breath * 0.1; return true; }   // (the fingers on its keys, swaying with the tune)
  if (acc === 'violin') { P.hL = vadd(S.shL, mv(S.SP, [-2.0, 9.6, 1.2])); P.elL = [-1, -0.4, -0.3]; P.hR = vadd(S.chest, mv(S.SP, [3.4 - P.breath * 6, 6.4, 1.6])); P.elR = [1, -0.4, -0.2]; P.headYaw -= 0.35; P.headPitch += 0.12; return true; }   // (the bow drawn across: P.breath)
  if (acc === 'drums') { const k = P.breath > 0.2 ? 1 : 0; P.hL = [-3.6, 9.4, 13.4 + (k ? 3.4 : 0)]; P.hR = [3.6, 9.4, 13.4 + (k ? 0 : 3.4)]; P.elL = [-1, -0.4, -0.3]; P.elR = [1, -0.4, -0.3]; P.lean = 0.22; P.headPitch += 0.2; return true; }   // (the sticks coming down in turn)
  if (acc === 'map') { P.hR = vadd(S.chest, mv(S.SP, [4.4, 7.4, -1.6])); P.hL = vadd(S.chest, mv(S.SP, [-4.4, 7.4, -1.6])); P.elR = [1, -0.5, -0.5]; P.elL = [-1, -0.5, -0.5]; P.headPitch += 0.3; return true; }
  if (acc === 'sponge') { P.hR = [2.0 + P.breath * 5, 13.4, 23 + P.breath * 3]; P.elR = [1, -0.3, -0.4]; P.lean = 0.16; return true; }   // (wiping the car's side)
  if (acc === 'easel') { P.hR = [2.6 + P.breath * 3, 12.2, 31 + P.breath * 4]; P.elR = [1, -0.4, -0.5]; P.hL = vadd(S.shL, [-2.6, 4.4, -r * 0.62]); P.elL = [-1, -0.3, -0.5]; P.headPitch += 0.08; return true; }   // (a dab of the brush, the palette low in the other hand)
  if (acc === 'cueup') { P.hR = vadd(S.shR, [1.8, 2.6, -r * 0.45]); P.elR = [1, -0.2, -0.7]; return true; }   // (the cue stood up beside him, waiting his turn)
  if (acc === 'hail') { P.hR = vadd(S.shR, [2.2, 1.4, r * 0.92]); P.elR = [1, 0.1, 0.3]; P.openR = 1; return true; }   // (an arm up for a cab: server taxijob.js, H72)
  if (acc === 'binoculars') { P.hR = vadd(S.head, mv(S.HD, [1.3, 2.6, -0.5])); P.hL = vadd(S.head, mv(S.HD, [-1.3, 2.6, -0.5])); P.elR = [1, -0.1, -0.7]; P.elL = [-1, -0.1, -0.7]; return true; }   // (a birder's, up at the eyes)
  if (acc === 'radio') { P.hR = vadd(S.neck, mv(S.SP, [2.8, 2.8, 3.6])); P.elR = [1, -0.2, -1]; P.headYaw += 0.1; return true; }   // (a ranger's, a word on it)
  if (acc === 'basket') { P.hL = vadd(S.shL, [-2.2, 3.4, -r * 0.52]); P.elL = [-1, -0.3, -0.7]; return true; }   // (on the crook of the arm)
  if (acc === 'broom') { const k = P.breath * 3; P.hR = [2.4, 8.6 + k, 17]; P.hL = [-0.8, 5.0 + k, 24.5]; P.elR = [1, -0.4, -0.5]; P.elL = [-1, -0.4, -0.4]; P.lean += 0.12; P.headPitch += 0.15; return true; }
  if (acc === 'letters') { P.hR = vadd(S.chest, mv(S.SP, [2.4, 8.2, -0.8])); P.elR = [1, -0.4, -0.4]; return true; }
  if (acc === 'surfboard') { P.hR = vadd(S.shR, [1.8, 0.6, -r * 0.5]); P.elR = [1, -0.1, -0.6]; return true; }   // (the board's rail in the hand, tucked under the arm)
  if (acc === 'kayak') { P.hR = vadd(S.shR, [0.6, 1.0, 2.6]); P.elR = [1, 0.2, -0.3]; P.hL = vadd(S.shL, [-1.8, 2.6, -r * 0.62]); P.elL = [-1, -0.3, -0.5]; return true; }   // (the cockpit's rim up on the shoulder; the paddle)
  return false;
}
// what the props and walks add to the figure (buildFigure)
function figure365(B, C, E, D, P, S, acc) {
  const I = I3;
  if (P.board) {   // the deck under the front foot, its four wheels; in a trick, where the trick has it (P.deck)
    const dk = P.deck, c = dk ? dk.c : [-1.5, 3.6, 1.7], M = dk ? dk.M : I;
    E(c, M, [2.7, 8.6, 0.7], GR.ACC, 'deck', M365.deck);
    if (dk) E(vadd(c, mv(M, [0, 0, -0.75])), M, [2.2, 7.4, 0.3], GR.ACC, 'grip', M365.dark);   // (its underside: a trick turns it over)
    for (const [x, y] of [[-1.6, -6.0], [1.6, -6.0], [-1.6, 6.0], [1.6, 6.0]]) E(vadd(c, mv(M, [x, y, -0.9])), M, [0.7, 0.8, 0.8], GR.ACC, 'wheel', M365.wheel);
  }
  if (P.surf) {   // a surfboard: a long white oval, the stripe down it - under the feet (along the way they ride), or under the
    // body lying on it (along it, head to feet)
    if (P.surf === 'pad') { E([0, 5.2, 17], I, [8.6, 1.1, 28], GR.ACC, 'board', M365.surf); E([0, 4.0, 17], I, [0.8, 0.16, 27], GR.ACC, 'stripe', M365.stripe); }
    else { const c = [-1.6, 3.0, P.surf === 'air' ? D.ank + 3.6 : 1.0]; E(c, I, [6.6, 21, 0.9], GR.ACC, 'board', M365.surf); E(vadd(c, [0, 0, 0.85]), I, [0.8, 20, 0.14], GR.ACC, 'stripe', M365.stripe); }
  }
  if (P.blades) for (const k of ['L', 'R']) {   // a wheel bar under each boot
    const a = S['an' + k];
    B(vadd(a, [0, 1.4, -3.9]), S.PF, [0.75, 3.6, 0.6], GR.ACC, 'blade', M365.dark);
    for (const y of [-1.4, 1.4, 4.2]) E(vadd(a, [0, y, -4.7]), I, [0.6, 0.8, 0.8], GR.ACC, 'wheel', M365.wheel);
  }
  if (P.cue) {   // the pool cue: from behind the drawing hand, through the bridge, on toward the cue ball; the chalked tip
    const a = S.haR, b = S.haL, d = vsub(b, a);
    C(vadd(a, vmul(d, -0.55)), vadd(b, vmul(d, 0.35)), 0.75, 0.4, GR.ACC, 'cue', M365.wood);
    E(vadd(b, vmul(d, 0.37)), I, [0.45, 0.45, 0.45], GR.ACC, 'tip', MAT('#3a6ad0'));
  }
  if (ACT_PROPS[acc]) { ACT_PROPS[acc](B, C, E, S); return; }   // (at an activity: whatever the pose)
  if (!P.acc || !acc || P.item !== null) return;
  if (STRETCHERS.has(acc)) { stretcherFigure(B, C, E, acc); return; }   // (the paramedics' stretcher, at the end)
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
  } else if (acc === 'broom') {   // the shaft from the upper hand down through the lower to the head on the ground ahead
    const h = [0.6, 18 + P.breath * 3, 1.2];
    C(S.haL, h, 0.4, 0.4, GR.ACC, 'broomh', M365.wood); B(h, I, [5.2, 1.0, 1.0], GR.ACC, 'broomb', M365.dark);
  } else if (acc === 'letters') {   // a little bundle of white envelopes
    B(vadd(S.haR, [0, 1.0, 0.8]), I, [1.6, 0.4, 1.1], GR.ACC, 'letters', MAT('#f4f0e6'));
  } else if (acc === 'leads') {   // three leads from the hand down to the dogs' collars, out in front
    for (const [x, y] of [[-8, 21], [0, 24], [8, 21]]) C(hR, [x, y, 5.4], 0.42, 0.42, GR.ACC, 'lead', M365.lead);
  } else if (acc === 'guitar') {   // held across the body: the body low at the right, the neck up to the left hand
    const c = vadd(S.chest, mv(S.SP, [1.4, D.chestR[1] + 3.0, -6.0]));
    E(c, S.SP, [5.2, 2.0, 4.3], GR.ACC, 'guitar', M365.wood);
    E(vadd(c, mv(S.SP, [0.4, 1.9, 0.4])), S.SP, [1.3, 0.3, 1.3], GR.ACC, 'hole', M365.dark);
    C(vadd(c, mv(S.SP, [-4.0, 0.6, 1.6])), vadd(S.haL, mv(S.SP, [-1.6, 0, 0.8])), 0.8, 0.65, GR.ACC, 'neck', MAT('#6a4428'));
    // (his kit on the ground: the case open in front with the coins in it, the little amp at his side)
    buskCase(B, E, -5, 13);
    B([10.2, 2.4, 3.4], I, [2.6, 2.0, 3.4], GR.ACC, 'amp', M365.dark); B([10.2, 4.45, 3.6], I, [2.0, 0.05, 2.4], GR.ACC, 'grille', MAT('#5a5a60'));
  } else if (acc === 'sax') {   // a gold saxophone: the mouthpiece up at the lips, the body down the front, the bell turned up and out
    const top = vadd(S.neck, mv(S.SP, [0.6, 3.4, 2.4])), low = vadd(S.chest, mv(S.SP, [1.4, D.chestR[1] + 2.6, -8.6]));
    C(top, low, 1.0, 1.5, GR.ACC, 'sax', M365.brass);
    E(vadd(low, mv(S.SP, [1.8, 0.8, 1.4])), S.SP, [2.3, 2.0, 2.4], GR.ACC, 'bell', M365.brass);
    E(vadd(low, mv(S.SP, [2.0, 1.4, 2.2])), S.SP, [1.4, 0.6, 1.4], GR.ACC, 'mouth', M365.dark);
    buskCase(B, E, -4, 12, '#2a2228', '#2a4a8a');
  } else if (acc === 'violin') {   // under the chin on the left shoulder, its neck out to the left hand; the bow in the right
    const body = vadd(S.shL, mv(S.SP, [1.6, 3.2, 1.6]));
    E(body, mmul(S.SP, rx(0.25)), [2.3, 3.8, 1.1], GR.ACC, 'violin', M365.violin);
    C(vadd(body, mv(S.SP, [-0.8, 2.6, 0])), S.haL, 0.35, 0.3, GR.ACC, 'vneck', M365.dark);
    C(vadd(S.haR, mv(S.SP, [-0.6, 0.2, 0])), vadd(S.haR, mv(S.SP, [-8.4, 1.8, 1.4])), 0.22, 0.22, GR.ACC, 'bow', MAT('#e8e0c8'));
    // the music stand in front of him, his case open at his feet
    C([0, 13.4, 0.4], [0, 13.4, 24], 0.4, 0.35, GR.ACC, 'stand', M365.dark);
    for (const [x, y] of [[-3.2, 15.4], [3.2, 15.4], [0, 10.6]]) C([0, 13.4, 3.4], [x, y, 0.3], 0.35, 0.3, GR.ACC, 'leg', M365.dark);
    B([0, 13.8, 26.4], rx(-0.45), [4.4, 0.3, 3.0], GR.ACC, 'music', MAT('#2a2a30'));
    B([0, 13.5, 26.8], rx(-0.45), [3.6, 0.15, 2.4], GR.ACC, 'sheet', MAT('#f0ece0'));
    buskCase(B, E, 7, 9, '#3a2a22', '#8a2a3a');
  } else if (acc === 'drums') {   // the sticks; upturned buckets and a stock pot in front of him (white, blue, red, steel)
    for (const [h, d] of [[S.haL, -1], [S.haR, 1]]) C(h, vadd(h, [d * 0.8, 4.6, -2.6]), 0.3, 0.3, GR.ACC, 'stick', M365.wood);
    for (const [x, y, r, hgt, c] of [[-4.8, 12.6, 3.0, 7.6, '#e8e8e4'], [0.4, 14.6, 3.0, 8.2, '#2f68c8'], [5.4, 12.4, 2.8, 7.2, '#c8342e'], [-0.4, 10.0, 2.4, 6.0, '#a8acb4']]) {
      C([x, y, 0.4], [x, y, hgt], r * 0.86, r, GR.ACC, 'bucket', MAT(c, 0.3));
      E([x, y, hgt + 0.1], I, [r * 0.96, r * 0.96, 0.3], GR.ACC, 'bottom', MAT(c, 0.2));
    }
    E([-7.6, 13.6, 1.2], I, [2.2, 2.2, 1.2], GR.ACC, 'pot', M365.metal);   // (the tip pot)
  } else if (acc === 'binoculars') {   // two short black barrels between the hands, out in front of the eyes
    const c = vmul(vadd(S.haR, S.haL), 0.5);
    for (const sx of [-0.85, 0.85]) C(vadd(c, mv(S.HD, [sx, -0.6, 0.3])), vadd(c, mv(S.HD, [sx, 1.8, 0.3])), 0.85, 0.75, GR.ACC, 'binocs', M365.dark);
    E(vadd(c, mv(S.HD, [0, 0.4, 0.6])), S.HD, [0.6, 0.9, 0.4], GR.ACC, 'hinge', M365.dark);
  } else if (acc === 'poles') {   // a trekking pole in each hand, its tip planted on the ground ahead of the hand (they swing with the arms)
    for (const [h, sx] of [[S.haL, -0.8], [S.haR, 0.8]]) { C(vadd(h, [0, 0, 1.4]), [h[0] + sx, h[1] + 4.6, 0.2], 0.48, 0.36, GR.ACC, 'pole', MAT('#d8dce4', 0.6)); E(vadd(h, [0, 0, 0.9]), I, [0.55, 0.55, 0.9], GR.ACC, 'grip', M365.dark); }
  } else if (acc === 'radio') {   // a handheld radio up at the mouth, its stubby aerial
    const c = vadd(S.haR, [-0.5, 0.5, 1.0]);
    B(c, S.SP, [0.7, 0.5, 1.5], GR.ACC, 'radio', MAT('#2a2a2e', 0.3)); C(vadd(c, [0.3, 0, 1.4]), vadd(c, [0.3, 0, 3.6]), 0.16, 0.14, GR.ACC, 'aerial', M365.dark);
  } else if (acc === 'call') B(vadd(hR, [-0.6, 0.4, 1.4]), S.SP, [0.5, 1.0, 1.9], GR.ACC, 'phone', M365.dark);
  else if (acc === 'map') B(vmul(vadd(hR, S.haL), 0.5), mmul(S.SP, rx(-0.5)), [5.0, 0.25, 3.4], GR.ACC, 'map', MAT('#e8e0c0'));   // a tourist's map, open in both hands
}
// the things people at their activities have by them (server activities.js), in the figure's frame (y ahead, z up)
const ACT_PROPS = {
  statue(B, C, E) {   // the living statue's crate under its feet, its upturned hat on the ground in front with the coins in it
    const up = STATUE_UP, W = MAT('#8a6a44');
    B([0, 0, up / 2], I3, [6.2, 5.2, up / 2], GR.ACC, 'crate', W);
    for (const z of [2.4, 5.6]) B([0, -5.25, z], I3, [6.3, 0.15, 0.35], GR.ACC, 'slat', MAT('#6a4e30'));
    E([1.6, 11.6, 1.0], I3, [3.0, 3.0, 1.1], GR.ACC, 'hat', MAT('#2a2420'));
    for (const [x, y] of [[0.8, 11.2], [2.4, 12.0], [1.4, 12.4]]) E([x, y, 1.6], I3, [0.6, 0.6, 0.2], GR.ACC, 'coin', M365.brass);
  },
  easel(B, C) {   // three legs, a canvas on its ledge (a painting of sky and grass), the brush's side toward the painter
    const W = M365.wood;
    C([-4.4, 13.2, 0.4], [-2.4, 15.4, 42], 0.5, 0.4, GR.ACC, 'leg', W); C([4.4, 13.2, 0.4], [2.4, 15.4, 42], 0.5, 0.4, GR.ACC, 'leg', W); C([0, 22, 0.4], [0, 16.2, 38], 0.5, 0.4, GR.ACC, 'leg', W);
    B([0, 15.2, 25.6], I3, [7.6, 1.2, 0.5], GR.ACC, 'ledge', W);
    B([0, 15.6, 33], rx(-0.18), [7.2, 0.5, 6.6], GR.ACC, 'canvas', (Q) => cloth(Math.abs(Q.l0) > 0.88 || Math.abs(Q.l2) > 0.86 ? '#efe7d2' : Q.l2 > 0.2 - Q.l0 * 0.15 ? '#86b8e4' : Q.l2 > -0.1 ? '#6a9a52' : '#c8a060'));
  },
  dice(B) {   // a street game's dice and the money down in front of the one shooting (streetdice.js)
    B([-1.8, 16.5, 1.2], rz(0.4), [1.25, 1.25, 1.2], GR.ACC, 'die', MAT('#f6f4ee', 0.4)); B([1.8, 18.2, 1.2], rz(-0.3), [1.25, 1.25, 1.2], GR.ACC, 'die', MAT('#f6f4ee', 0.4));
    B([5.2, 14.4, 0.2], rz(0.2), [3.0, 1.4, 0.15], GR.ACC, 'bills', MAT('#5f9a52')); B([-5.0, 19.6, 0.2], rz(-0.5), [3.0, 1.4, 0.15], GR.ACC, 'bills', MAT('#6aa65c'));
  },
  cooler(B) {   // a blue cooler with a white lid on the deck beside them
    B([-10.5, -1.5, 3.2], I3, [3.6, 2.3, 3.0], GR.ACC, 'cooler', MAT('#2f68c8', 0.3)); B([-10.5, -1.5, 6.6], I3, [3.8, 2.5, 0.5], GR.ACC, 'lid', MAT('#f0f0ec', 0.3));
  },
  sponge(B, C, E, S) {   // the yellow sponge in hand, a bucket of suds at their feet
    E(vadd(S.haR, [0, 1.6, 0.4]), I3, [2.2, 1.6, 1.5], GR.ACC, 'sponge', MAT('#f2d23a'));
    C([-8.5, -1, 0.4], [-8.5, -1, 6.4], 2.8, 3.2, GR.ACC, 'bucket', MAT('#3a7ad0', 0.4)); E([-8.5, -1, 6.6], I3, [2.9, 2.9, 0.7], GR.ACC, 'suds', MAT('#f4f6fa'));
  },
  rifle(B, C) {   // a hunter's rifle slung across his back, the muzzle up over the right shoulder, on its sling
    C([-4.8, -4.8, 21], [3.6, -4.6, 38.5], 1.0, 0.75, GR.ACC, 'stock', M365.wood); C([2.6, -4.7, 36.5], [5.6, -4.6, 44.5], 0.55, 0.48, GR.ACC, 'barrel', M365.dark);
    B([-0.4, -4.4, 29.6], I3, [0.9, 0.7, 1.6], GR.ACC, 'action', M365.dark);
  },
  crate(B, C, E) {   // a wooden crate of tomatoes by the picker
    B([-9.5, 4, 3.4], I3, [4.0, 3.0, 3.2], GR.ACC, 'crate', (Q) => cloth(Math.abs(Q.l2) > 0.7 || Math.abs(Q.l0) > 0.85 ? '#a8743c' : '#8a5a2c'));
    for (const [x, y] of [[-11, 3], [-9, 5], [-8, 2.6], [-10.4, 5.4]]) E([x, y, 7], I3, [1.2, 1.2, 1.0], GR.ACC, 'fruit', MAT('#d8382a', 0.4));
  },
  fence(B) {   // a short run of garden fence between the neighbours: two posts, two rails, white pickets with pointed tops
    const W = MAT('#f2efe6', 0.2), P2 = MAT('#d8d2c2', 0.2);
    for (const x of [-14, 14]) B([x, 11, 12], I3, [1.1, 1.1, 12], GR.ACC, 'post', P2);
    for (const z of [7, 18]) B([0, 11.8, z], I3, [14, 0.45, 0.8], GR.ACC, 'rail', P2);
    for (let x = -11.4; x <= 11.5; x += 3.8) { B([x, 11, 10.5], I3, [1.0, 0.45, 10.5], GR.ACC, 'picket', W); B([x, 11, 21.6], I3, [0.55, 0.45, 0.8], GR.ACC, 'picket', W); }
  },
  cueup(B, C, E, S) {   // the cue stood up beside him, its butt on the floor, the tip above his head, chalked blue
    const h = S.haR, a = [h[0] + 0.6, h[1] + 0.4, 0.6], b = [h[0] + 1.6, h[1] + 1.2, 50];
    C(a, b, 0.8, 0.4, GR.ACC, 'cue', M365.wood); E([b[0], b[1], 50.6], I3, [0.45, 0.45, 0.5], GR.ACC, 'tip', MAT('#3a6ad0'));
  },
  // the people of the wilds (Nature-C4)
  basket(B, C, E, S) {   // a wicker basket hung from the left forearm (on the ground beside them, kneeling), mushrooms and berries in it
    const h = S.haL, c = [h[0] - 3.4, h[1] + 1.8, Math.max(2.4, h[2] - 4.4)];
    B(c, I3, [3.6, 2.8, 2.4], GR.ACC, 'basket', (Q) => { if (Q.l2 > 0.82) return cloth('#8a5e30'); if ((Math.round(Q.l0 * 6) + Math.round(Q.l2 * 4)) & 1) Q.k -= 0.2; return cloth('#e8bc70'); });
    C([c[0] - 3.2, c[1], c[2] + 2.2], [c[0], c[1], c[2] + 5.6], 0.35, 0.35, GR.ACC, 'handle', MAT('#8a5e30')); C([c[0], c[1], c[2] + 5.6], [c[0] + 3.2, c[1], c[2] + 2.2], 0.35, 0.35, GR.ACC, 'handle', MAT('#8a5e30'));
    for (const [x, y, col] of [[-1.6, -0.6, '#d8a030'], [0.8, 0.7, '#e2b040'], [2.0, -0.8, '#c8342e'], [-0.3, 1.2, '#5a2a7a'], [1.1, -1.4, '#f0e0b8']]) E([c[0] + x, c[1] + y, c[2] + 2.4], I3, [1.2, 1.2, 0.7], GR.ACC, 'find', MAT(col));
  },
  surfboard(B, C, E, S) {   // a surfboard under the right arm, on its edge, nose ahead: the white board, its stripe
    const c = vadd(S.haR, [1.4, 1.6, 3.2]);
    E(c, I3, [0.9, 15, 4.4], GR.ACC, 'board', M365.surf); E([c[0] + 0.85, c[1], c[2]], I3, [0.14, 14, 0.7], GR.ACC, 'stripe', M365.stripe);
  },
  kayak(B, C, E, S) {   // a red kayak up on the right shoulder, bow ahead, the cockpit turned in to the head; the paddle in the left hand
    const c = vadd(S.shR, [2.0, 2.2, 3.6]);
    E(c, I3, [2.6, 20, 1.9], GR.ACC, 'kayak', (Q) => { Q.gloss = 0.5; return cloth(Q.l2 < -0.3 ? '#a82420' : '#e03a2e'); }); E([c[0] - 0.6, c[1] - 1.5, c[2] + 0.9], I3, [1.4, 3.0, 0.6], GR.ACC, 'cockpit', M365.dark);
    const h = S.haL; C([h[0], h[1], h[2] - 13], [h[0], h[1], h[2] + 14], 0.3, 0.3, GR.ACC, 'paddle', M365.dark);
    for (const z of [-15, 16]) B([h[0], h[1], h[2] + z], I3, [0.3, 1.2, 2.6], GR.ACC, 'blade', MAT('#f2c21b', 0.4));
  },
  tripod(B, C, E) {   // a spotting scope on its tripod in front, the eyepiece toward them
    for (const [x, y] of [[-3.2, 9.4], [3.2, 9.4], [0, 15.6]]) C([0, 11.8, 30], [x, y, 0.3], 0.35, 0.3, GR.ACC, 'leg', M365.dark);
    C([0, 9.6, 33.4], [0, 15.6, 35.4], 1.2, 1.5, GR.ACC, 'scope', MAT('#4a5a4a', 0.4)); E([0, 8.8, 33.2], I3, [0.7, 0.7, 0.7], GR.ACC, 'eyepiece', M365.dark);
  },
  tackle(B, C, E) {   // a green tackle box at their side, its tray up; a landing net leant by it
    B([-9.6, -1.2, 2.4], I3, [3.2, 2.0, 2.2], GR.ACC, 'tackle', MAT('#2e6a3a', 0.4)); B([-9.6, -1.2, 4.9], I3, [3.0, 1.8, 0.4], GR.ACC, 'tray', MAT('#d8c86a', 0.3));
    C([-13.6, 2.0, 0.4], [-12.4, 1.0, 16], 0.3, 0.3, GR.ACC, 'net', M365.dark); E([-12.2, 0.9, 18.4], I3, [2.6, 0.4, 2.6], GR.ACC, 'hoop', MAT('#8a8a90', 0.4));
  },
  campstove(B, C, E) {   // a folding camp chair under them (its seat, the arms, the cross legs), the stove and its pot in front
    const blue = MAT('#2f68c8'), leg = MAT('#a8acb4', 0.5);
    B([0, -1.2, 15.6], I3, [5.0, 4.4, 0.5], GR.ACC, 'seat', blue); B([0, -5.8, 22.6], rx(0.2), [5.0, 0.4, 6.4], GR.ACC, 'back', blue);
    for (const s of [-1, 1]) { C([s * 5.2, -5, 0.3], [s * 5.2, 3, 15.4], 0.3, 0.3, GR.ACC, 'leg', leg); C([s * 5.2, 3, 0.3], [s * 5.2, -5, 15.4], 0.3, 0.3, GR.ACC, 'leg', leg); B([s * 5.4, -1.4, 19.4], I3, [0.5, 3.6, 0.4], GR.ACC, 'arm', leg); }
    B([0, 13.6, 1.6], I3, [2.6, 2.6, 1.6], GR.ACC, 'stove', MAT('#3a3a40', 0.4)); E([0, 13.6, 3.6], I3, [1.6, 1.6, 0.4], GR.ACC, 'flame', MAT('#5a8ad8'));
    C([0, 13.6, 4.0], [0, 13.6, 6.6], 2.0, 2.0, GR.ACC, 'pot', M365.metal);
  },
  climbkit(B, C, E) {   // a rope in a coil, a helmet and the chalk bag laid out on the ground beside them
    E([-8.6, 3.0, 0.9], I3, [3.6, 3.6, 0.9], GR.ACC, 'rope', (Q) => { if ((Math.round(Math.hypot(Q.l0, Q.l1) * 4)) & 1) Q.k -= 0.18; return cloth('#2fa8c0'); });
    E([-8.6, 3.0, 1.4], I3, [1.2, 1.2, 0.6], GR.ACC, 'hole', MAT('#5a4a3a'));
    E([8.2, 4.4, 1.6], I3, [2.0, 2.2, 1.6], GR.ACC, 'helmet', MAT('#f2c21b', 0.4)); C([9.2, -1.6, 0.4], [9.2, -1.6, 2.6], 1.1, 1.0, GR.ACC, 'chalk', MAT('#c8262b'));
  },
  rope(B, C, E, S) {   // the rope coiled over the right shoulder and across the chest; its end run up the rock in front of them
    C(vadd(S.shR, [0.4, 0.2, 0.8]), vadd(S.chest, [-3.4, 1.4, -3.0]), 0.8, 0.8, GR.ACC, 'coil', MAT('#2fa8c0'));
    E(vadd(S.shR, [1.6, -0.2, -2.2]), I3, [1.2, 2.6, 3.6], GR.ACC, 'coil', (Q) => { if ((Math.round(Q.l2 * 4)) & 1) Q.k -= 0.16; return cloth('#2fa8c0'); });
    C(vadd(S.haR, [0, 0.4, 0]), [S.haR[0], 14, 60], 0.22, 0.22, GR.ACC, 'line', MAT('#2fa8c0'));
  },
  chess(B, C) {   // the board on the table between the players, a few pieces still standing
    B([0, 15, 19.4], I3, [4.2, 4.2, 0.35], GR.ACC, 'chessb', (Q) => cloth(Math.abs(Q.l0) > 0.9 || Math.abs(Q.l1) > 0.9 ? '#5a3a22' : (Math.floor((Q.l0 + 1) * 4) + Math.floor((Q.l1 + 1) * 4)) & 1 ? '#efe2c4' : '#3a2a20'));
    for (const [x, y, w] of [[-2.2, 12.4, 1], [0.4, 12.6, 1], [1.8, 13.4, 1], [-1.0, 17.2, 0], [1.4, 16.8, 0], [2.6, 17.6, 0]]) C([x, y, 19.8], [x, y, 21.6], 0.5, 0.36, GR.ACC, 'piece', MAT(w ? '#f4efe4' : '#1e1e22', 0.4));
  },
};
// ==== end of the city's people ========================================================================================

// ==== The paramedics' stretcher (task #313, server/systems/ems.js): pushed in front like the cart ===================
// props (app.carry): stretcher (wheeled out empty: a wheeled trolley stretcher, its pad, a sheet and a pillow),
// stretcherPt (the patient lying on it: on their back under a blanket, the head on the pillow)
const STRETCHERS = new Set(['stretcher', 'stretcherPt']);
CARRY.push('stretcher', 'stretcherPt');
CARRY.push('hail');   // (a fare flagging down a cab, the right arm up: server taxijob.js, H72)
Object.assign(ACC_HANDS, { hail: 1 });
Object.assign(ACC_HANDS, { stretcher: 2, stretcherPt: 2 });
const MST = { frame: MAT('#c8ccd4', 0.55), pad: MAT('#e2662c', 0.2), sheet: MAT('#eef0f2'), blanket: MAT('#3a6ab0'), skin: MAT('#c48a64'), hair: MAT('#2e241c'), rubber: MAT('#26262a') };
const STR_Z = 22, STR_Y0 = 13, STR_Y1 = 47, STR_X = 5.6;
function stretcherHands(P) { P.hR = [4.2, CART_Y, STR_Z + 2]; P.hL = [-4.2, CART_Y, STR_Z + 2]; P.elR = [1, -0.6, -0.4]; P.elL = [-1, -0.6, -0.4]; return true; }
function stretcherFigure(B, C, E, acc) {
  const I = I3, my = (STR_Y0 + STR_Y1) / 2, hy = (STR_Y1 - STR_Y0) / 2;
  C([-STR_X, CART_Y, STR_Z + 2], [STR_X, CART_Y, STR_Z + 2], 0.6, 0.6, GR.ACC, 'strbar', MST.frame);                 // the push bar
  for (const s of [-1, 1]) {
    C([s * STR_X, CART_Y, STR_Z + 2], [s * STR_X, STR_Y0, STR_Z], 0.5, 0.5, GR.ACC, 'strrail', MST.frame);
    C([s * STR_X, STR_Y0, STR_Z], [s * STR_X, STR_Y1, STR_Z], 0.55, 0.55, GR.ACC, 'strrail', MST.frame);            // the side rails
    for (const y of [STR_Y0 + 3, STR_Y1 - 3]) {                                                                       // legs and castors
      C([s * (STR_X - 1), y, STR_Z - 0.5], [s * (STR_X - 1), y, 2.6], 0.45, 0.45, GR.ACC, 'strleg', MST.frame);
      E([s * (STR_X - 1), y, 1.3], I, [0.6, 1.3, 1.3], GR.ACC, 'wheel', MST.rubber);
    }
  }
  C([-STR_X + 1, my, 9], [STR_X - 1, my, 9], 0.4, 0.4, GR.ACC, 'strbrace', MST.frame);
  C([0, STR_Y0 + 3, 9], [0, STR_Y1 - 3, 9], 0.4, 0.4, GR.ACC, 'strbrace', MST.frame);
  B([0, my, STR_Z + 0.4], I, [STR_X - 0.4, hy, 1.0], GR.ACC, 'strpad', MST.pad);                                      // the pad
  B([0, my, STR_Z + 1.5], I, [STR_X - 1.0, hy - 0.8, 0.3], GR.ACC, 'strsheet', MST.sheet);                             // its sheet
  E([0, STR_Y1 - 3.4, STR_Z + 2.4], I, [3.6, 2.4, 1.2], GR.ACC, 'pillow', MST.sheet);
  if (acc !== 'stretcherPt') return;
  // the patient: lying on their back, the blanket up to the shoulders, the head on the pillow
  B([0, my - 2.4, STR_Z + 3.2], I, [STR_X - 1.4, hy - 5.4, 1.6], GR.ACC, 'blanket', MST.blanket);
  E([0, STR_Y0 + 3.6, STR_Z + 3.6], I, [3.4, 2.2, 1.9], GR.ACC, 'feet', MST.blanket);                                // the feet under it
  E([0, STR_Y1 - 10.4, STR_Z + 4.0], I, [4.6, 3.0, 2.2], GR.ACC, 'chest', MST.blanket);
  for (const s of [-1, 1]) E([s * 3.2, STR_Y1 - 13, STR_Z + 4.6], I, [1.1, 3.2, 0.9], GR.ACC, 'arm', MST.skin);      // the arms on top of it
  E([0, STR_Y1 - 4.6, STR_Z + 4.4], I, [2.3, 2.5, 2.3], GR.ACC, 'head', MST.skin);
  E([0, STR_Y1 - 3.4, STR_Z + 4.0], I, [2.5, 1.7, 2.0], GR.ACC, 'hair', MST.hair);
}
// ==== end of the paramedics' stretcher ================================================================================

// ==== The arrest (task #376, server/systems/custody.js) ================================================================
// escortR / escortL: an officer walking a cuffed prisoner to the police car, a hand on their arm (the prisoner at their right
// / left: the descriptor's es), the other arm swinging with the walk
Object.assign(POSES, { escortR: 6, escortL: 6 });
function escortPose(D, P, f, s) {
  gait(D, P, 0, f / 6, true); P.acc = false; P.headYaw = s * 0.12;
  const k = s > 0 ? 'R' : 'L', sw = P.hands;
  P.hands = (S) => { sw(S); P['h' + k] = vadd(S['sh' + k], mv(S.SP, [s * 3.4, 2.2, -D.reach * 0.84])); P['el' + k] = [s * 0.7, -1, -0.2]; P['open' + k] = 0; };
}
GAITS2.escortR = (D, P, f) => escortPose(D, P, f, 1);
GAITS2.escortL = (D, P, f) => escortPose(D, P, f, -1);
// ==== end of the arrest =================================================================================================

// ==== The cells (task #379, server/systems/cells.js) ===================================================================
// sitx: sitting on a bench or a cell's toilet (the descriptor's sb), six ways two frames each - 0 casual, 1 slouched, 2
//   hunched, 3 the head in the hands, 4 leaning back, 5 the chin on a fist (game/peds.js sitFrame holds each a while)
// bars: both hands on the bars, straight out in front at the chest - 0 looking out, 1 leaning in with the head down,
//   2 / 3 looking along the corridor one way and the other
// bang: rattling the bars (0 thrown back, 1 slammed in); thump: a fist on the wall (0 raised, 1 on it), the other hand flat
Object.assign(POSES, { sitx: 12, bars: 4, bang: 2, thump: 2 });
function sitBase(D, P) {
  const seat = SEATS.sit / CA;
  P.acc = false; P.pel = [0, -0.6, seat + 3.7];
  P.fL = [-D.hipX - 0.9, 7.8, D.ank]; P.fR = [D.hipX + 0.9, 7.6, D.ank]; P.kneeL = P.kneeR = [0, 1, 0.8];
  return seat;
}
GAITS2.sitx = (D, P, f) => {
  const seat = sitBase(D, P), v = Math.floor(f / 2) % 6, k = f & 1;
  P.breath = k * 0.35;
  if (v === 0) {   // casually: upright, the hands resting on the thighs, a glance aside
    P.lean = -0.04; P.headPitch = 0.02; P.headYaw = k ? 0.3 : 0;
    P.hands = () => { P.hL = [-4.6, 6.4, seat + 6.4]; P.hR = [4.6, 6.4, seat + 6.4]; P.elL = [-1, -0.4, -0.3]; P.elR = [1, -0.4, -0.3]; };
  } else if (v === 1) {   // slouched back against the wall, slid down a little, the hands in the lap, the chin down
    P.lean = -0.26; P.pel = [0, 1.0, seat + 3.0]; P.headPitch = 0.3 + k * 0.06; P.headYaw = -0.12;
    P.fL = [-D.hipX - 1.4, 10.4, D.ank]; P.fR = [D.hipX + 1.2, 9.6, D.ank];
    P.hands = () => { P.hL = [-2.0, 7.4, seat + 4.4]; P.hR = [2.2, 7.0, seat + 4.6]; P.elL = [-1, -0.4, -0.3]; P.elR = [1, -0.4, -0.3]; };
  } else if (v === 2) {   // hunched over, the elbows on the knees, the hands hanging between them, the head down
    P.lean = 0.62 + k * 0.03; P.headPitch = 0.42;
    P.hands = () => { P.hL = [-1.2, 10.6, seat + 2.4]; P.hR = [1.2, 10.8, seat + 2.6]; P.elL = [-0.6, 0.2, -1]; P.elR = [0.6, 0.2, -1]; };
  } else if (v === 3) {   // the head in the hands
    P.lean = 0.7 + k * 0.03; P.headPitch = 0.6;
    P.hands = (S) => { P.hL = vadd(S.head, mv(S.HD, [-2.3, 2.6, -1.2])); P.hR = vadd(S.head, mv(S.HD, [2.3, 2.6, -1.2])); P.elL = [-0.4, 0.3, -1]; P.elR = [0.4, 0.3, -1]; P.openL = P.openR = 1; };
  } else if (v === 4) {   // leaning back on the hands, looking up at the ceiling
    P.lean = -0.16; P.headPitch = -0.6; P.headYaw = k ? -0.2 : 0.1;
    P.hands = () => { P.hL = [-6.8, -1.6, seat + 1.6]; P.hR = [6.8, -1.4, seat + 1.6]; P.elL = [-1, -0.6, 0]; P.elR = [1, -0.6, 0]; P.openL = P.openR = 1; };
  } else {   // bored: leaning on a knee, the chin on a fist, the other hand on the thigh
    P.lean = 0.34; P.tilt = 0.08; P.headPitch = 0.14; P.headYaw = k ? 0.18 : 0.05;
    P.hands = (S) => { P.hR = vadd(S.head, mv(S.HD, [0.8, 2.0, -3.4])); P.elR = [0.5, 0.4, -1]; P.hL = [-4.6, 6.6, seat + 6.0]; P.elL = [-1, -0.4, -0.3]; };
  }
};
GAITS2.bars = (D, P, f) => {
  const v = f & 3;
  P.acc = false;
  P.fL = [-D.hipX - 0.8, 0.8, D.ank]; P.fR = [D.hipX + 0.8, -0.4, D.ank];
  P.lean = v === 1 ? 0.16 : 0.03; P.headPitch = v === 1 ? 0.32 : -0.04; P.headYaw = v === 2 ? 0.55 : v === 3 ? -0.55 : 0; P.breath = v ? 0 : 0.2;
  P.hands = (S) => {   // gripping the bars in front of the shoulders, at the top of the chest: the arms straight out
    const z = (S.shL[2] + S.shR[2]) / 2 - 0.8, y = D.reach * 0.9;
    P.hL = [-D.shX - 2.4, y, z]; P.hR = [D.shX + 2.4, y, z];   // (two bars a little wider than the shoulders)
    P.elL = [-0.3, 0, -1]; P.elR = [0.3, 0, -1]; P.openL = P.openR = 0;
  };
};
GAITS2.bang = (D, P, f) => {   // the hands stay on the bars: the body thrown back, then slammed in
  GAITS2.bars(D, P, 0);
  P.lean = f ? 0.22 : -0.14; P.headPitch = f ? 0.12 : -0.14; P.breath = 0;
  P.pel = [P.pel[0], P.pel[1] + (f ? 1.0 : -1.2), P.pel[2] - (f ? 0.4 : 0)];
};
GAITS2.thump = (D, P, f) => {   // a fist on the wall in front: raised, then on it; the other hand flat on the wall
  P.acc = false;
  P.fL = [-D.hipX - 0.6, 2.6, D.ank]; P.fR = [D.hipX + 0.8, -2.4, D.ank];
  P.lean = f ? 0.14 : 0.02; P.twist = f ? -0.12 : 0.18; P.headPitch = f ? 0.12 : 0;
  P.hands = (S) => {
    P.hL = [-D.shX + 1.0, D.reach * 0.62, S.shL[2] - 1.0]; P.elL = [-1, -0.2, -0.6]; P.openL = 1;
    P.hR = f ? [D.shX - 1.6, D.reach * 0.66, S.shR[2] + 0.6] : vadd(S.shR, [1.4, 3.2, 6.4]); P.elR = [1, -0.4, -0.4]; P.openR = 0;
  };
};
// ==== end of the cells ==================================================================================================

// More poses from outside (they register in POSES and here): the dance moves, client/art2/dances.js (task #394) - kept out
// of the chunk bake's reach (only game/peds.js imports them), so a change to a dance doesn't throw away the baked chunks
export { GAITS2 as MORE_POSES };
