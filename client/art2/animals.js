// Art v2 animals: one adjustable four-legged rig (voxel model) that makes every dog breed, cat, farm
// animal and wild animal in the A1-A3 targets (docs/art-v2/targets). Models face +x; render them at any
// heading with voxel.js, or with renderUpright() - the character view the live game uses for animals (the
// ground depth foreshortened like the people sprites, heights kept), so an animal walking toward the
// camera reads as head, chest and legs instead of a long strip of back. `phase` (0..1) swings the legs for
// a walk / trot / run cycle and bobs the body; `wag` (0..1) swings the tail on its own.
//
//   animalModel(kind, { phase, gait: 'walk'|'run', pose, wag, pant })  -> Vox
//     pose: 'stand' | 'sit' | 'graze' (head down) | 'lie' (on the belly) | 'alert' (head up high) | 'stalk' (low,
//     creeping) | 'rear' (up on the hind legs: a bear) | 'swim' (only the head and back above the water) | 'float'
//     (a sea otter on its back) | 'climb' (a squirrel on a trunk, head up) | 'dead' (on its side, legs out)
//     kind may carry a variant: 'deer:y' the young (smaller, a fawn's spots, no antlers), 'deer:L' the legendary
//     pure white one (it glows faintly)
//   renderUpright(vox, heading, { fy = 0.38, dither }) -> GBuf (anchor at the model centre on the ground)
import { Vox } from './voxel.js';
import { patchHidden } from './vehicles.js';
import { ramp } from './palette.js';
import { GBuf, F_LEAF, hash, bayer } from './gbuf.js';

// body sizes in world px (an adult is ~42 px tall): len body length, h shoulder height, w body width
export const ANIMALS = {
  golden: { len: 26, h: 16, w: 9, coat: '#d89a44', belly: '#e8b868', ears: 'flop', tail: 'feather', snout: 4, head: 5, fluffy: 1, collar: '#2f5aa8', tongue: 1 },
  puppy: { len: 17, h: 10, w: 7, coat: '#e0a858', belly: '#f0d098', ears: 'flop', tail: 'feather', snout: 2.5, head: 4.6, fluffy: 1, collar: '#c83030', tongue: 1 },
  lab: { len: 26, h: 16, w: 9, coat: '#2c2a2e', ears: 'flop', tail: 'down', snout: 4, head: 5, collar: '#c83030', tongue: 1 },
  spaniel: { len: 20, h: 12, w: 8, coat: '#f0ece4', patch: '#8a3a22', pattern: 'saddle', ears: 'long', tail: 'stub', snout: 3, head: 4.5 },
  shepherd: { len: 28, h: 18, w: 9, coat: '#c08840', patch: '#2a2420', pattern: 'saddle', ears: 'up', tail: 'down', snout: 5, head: 5, collar: '#c83030', tongue: 1 },
  husky: { len: 26, h: 17, w: 9, coat: '#8a8c94', belly: '#f0ece8', ears: 'up', tail: 'curl', snout: 4, head: 5, fluffy: 1, collar: '#3a6ab0', tongue: 1 },
  pitbull: { len: 24, h: 15, w: 11, coat: '#a8683a', belly: '#f0e8dc', ears: 'flop', tail: 'down', snout: 3.5, head: 5.5, tongue: 1 },
  bulldog: { len: 20, h: 11, w: 12, coat: '#d8904a', belly: '#f4ece0', ears: 'flop', tail: 'stub', snout: 2, head: 6, collar: '#3a6ab0', tongue: 1 },
  chihuahua: { len: 12, h: 8, w: 5, coat: '#e0a050', ears: 'big', tail: 'curl', snout: 2, head: 3.8, collar: '#c83030' },
  terrier: { len: 18, h: 11, w: 7, coat: '#7a7c84', ears: 'flop', tail: 'up', snout: 3, head: 4.2, fluffy: 1, collar: '#3a8a46', tongue: 1 },
  dalmatian: { len: 26, h: 17, w: 8, coat: '#f2f0ec', patch: '#26262c', pattern: 'spots', ears: 'flop', tail: 'down', snout: 4, head: 4.8, collar: '#c83030', tongue: 1 },
  catBlack: { len: 16, h: 9, w: 6, coat: '#2a2830', ears: 'cat', tail: 'up', snout: 1, head: 3.6, cat: 1, collar: '#c83030' },
  catTabby: { len: 16, h: 9, w: 6, coat: '#8a8c90', patch: '#4a4c52', pattern: 'tabby', ears: 'cat', tail: 'up', snout: 1, head: 3.6, cat: 1 },
  catGinger: { len: 16, h: 9, w: 6, coat: '#e08a3a', patch: '#b85a20', pattern: 'tabby', belly: '#f4dcb8', ears: 'cat', tail: 'up', snout: 1, head: 3.6, cat: 1, collar: '#3a8a46' },
  catCalico: { len: 16, h: 9, w: 6, coat: '#f2ece2', patch: '#d8783a', patch2: '#2a2830', pattern: 'calico', ears: 'cat', tail: 'up', snout: 1, head: 3.6, cat: 1 },
  catWhite: { len: 16, h: 9, w: 7, coat: '#f2eee8', ears: 'cat', tail: 'feather', snout: 1, head: 3.8, cat: 1, fluffy: 1 },
  cow: { len: 50, h: 30, w: 18, coat: '#f2f0ec', patch: '#26262c', pattern: 'spots', ears: 'side', tail: 'thin', snout: 6, head: 7, horns: 'short', udder: 1 },
  horse: { len: 50, h: 36, w: 14, coat: '#8a4a26', belly: '#8a4a26', mane: '#2a1e1a', ears: 'up', tail: 'long', snout: 8, head: 6, neck: 14, socks: '#f2eee8' },
  sheep: { len: 28, h: 18, w: 14, coat: '#ece2c8', face: '#2c2a2e', ears: 'side', tail: 'stub', snout: 3, head: 4.5, fluffy: 2 },
  pig: { len: 30, h: 15, w: 14, coat: '#f0a8a0', ears: 'up', tail: 'curl', snout: 3, head: 5.5, nose: '#e08a8a' },
  goat: { len: 26, h: 18, w: 9, coat: '#f2eee4', ears: 'side', tail: 'up', snout: 4, head: 4.5, horns: 'back', beard: 1 },
  // (the wild ones: jl jointed legs, lower the shins' colour, hoof dark hooves; throat a pale throat patch)
  deer: { len: 34, h: 26, w: 10, coat: '#a8693a', belly: '#f0e4cc', pattern: 'rump', patch: '#f4eee2', ears: 'up', tail: 'stub', snout: 5, head: 5, neck: 10, antlers: 1, jl: 1, lower: '#8a5630', hoof: 1, throat: '#f2ece0', nose: '#2a2228' },
  rabbit: { len: 11, h: 7, w: 6.5, coat: '#9a7652', belly: '#f0e4d4', ears: 'rabbit', tail: 'puff', snout: 1.5, head: 3.6, jl: 1, lower: '#b8946a', haunch: 1, hop: 2.2 },
  raccoon: { len: 18, h: 9, w: 9, coat: '#7a7678', mask: '#26242a', ears: 'cat', tail: 'ringed', snout: 2.5, head: 4, jl: 1, lower: '#3a383c' },
  coyote: { len: 26, h: 17, w: 8, coat: '#a8885a', belly: '#e8dcc0', ears: 'up', tail: 'bushy', snout: 5, head: 4.6, jl: 1, lower: '#c0a070', throat: '#ece2cc', tips: '#6a5a46' },
  // the wilds (shared/fauna.js): deer and their kin, the predators, the water's edge, small game
  elk: { len: 44, h: 32, w: 13, coat: '#b08458', belly: '#6a4a30', mane: '#4e3424', neckC: '#6a4a32', pattern: 'rump', patch: '#e2cea4', ears: 'up', tail: 'stub', snout: 6, head: 6, neck: 13, antlers: 2, jl: 1, lower: '#4a3222', hoof: 1 },
  moose: { len: 50, h: 40, w: 15, coat: '#3e2c22', socks: '#a8988a', ears: 'side', tail: 'stub', snout: 9, head: 7, neck: 10, antlers: 3, hump: 1.4, bell: 1, droop: 1, jl: 1, lower: '#a8988a', hoof: 1 },
  mtgoat: { len: 28, h: 23, w: 11, coat: '#f2eee6', ears: 'side', tail: 'stub', snout: 4.5, head: 4.4, neck: 6, horns: 'black', beard: 1, fluffy: 1, hump: 0.8, socks: '#2a262c', jl: 1, lower: '#ece6da', hoof: 1 },
  boar: { len: 32, h: 19, w: 12, coat: '#4a3a2e', mane: '#241c18', ears: 'up', tail: 'thin', snout: 7, head: 6.4, nose: '#6a5a52', tusks: 1, jl: 1, lower: '#2e2420', hoof: 1, tips: '#6e5a48' },
  blackbear: { len: 36, h: 24, w: 15, coat: '#2e2a32', muzzle: '#9a7a58', ears: 'round', tail: 'stub', snout: 4, head: 6.5, fluffy: 1, bear: 1, jl: 1 },
  grizzly: { len: 44, h: 30, w: 18, coat: '#7a5634', muzzle: '#9a7650', tips: '#b89a70', ears: 'round', tail: 'stub', snout: 5, head: 7.5, fluffy: 1, bear: 1, hump: 1.5, jl: 1, lower: '#5a3e26' },
  cougar: { len: 34, h: 18, w: 9, coat: '#c08a54', belly: '#ecdcc0', ears: 'cat', tail: 'longcat', tailTip: '#3a2a22', snout: 2.2, head: 4.6, cat: 1, jl: 1 },
  bobcat: { len: 22, h: 13, w: 8, coat: '#a8885e', patch: '#5a4632', pattern: 'spots', belly: '#e8dcc4', ears: 'tufted', tail: 'stub', snout: 1.6, head: 4, cat: 1, jl: 1 },
  redfox: { len: 20, h: 12, w: 6.5, coat: '#d0682a', belly: '#f2ece0', ears: 'up', tail: 'fox', tailTip: '#f4f0e8', snout: 4, head: 4, socks: '#2a2228', jl: 1, lower: '#2a2228' },
  greyfox: { len: 19, h: 11.5, w: 6.5, coat: '#8a8a8e', patch: '#b8683a', pattern: 'flank', belly: '#f0ece4', ears: 'up', tail: 'fox', tailTip: '#26242a', snout: 3.6, head: 4, jl: 1 },
  beaver: { len: 22, h: 8, w: 11, coat: '#6a4630', ears: 'tiny', tail: 'paddle', snout: 2.5, head: 4.5, buck: 1 },
  otter: { len: 26, h: 7, w: 7, coat: '#5a3e2c', belly: '#8a6a52', ears: 'tiny', tail: 'otter', snout: 2, head: 3.6 },
  seaotter: { len: 24, h: 8, w: 9, coat: '#5a4434', face: '#d8ccb8', ears: 'tiny', tail: 'otter', snout: 1.6, head: 4.4 },
  squirrel: { len: 9, h: 5, w: 4, coat: '#8a8a8c', belly: '#ece8e0', ears: 'cat', tail: 'squirrel', snout: 1.2, head: 2.8 },
};
// the young of a kind: smaller, bigger-headed, no antlers, horns or tusks; a fawn's (or an elk calf's) white spots,
// a piglet's stripes, fluffier cubs and kits
function youngOf(A, base) {
  const k = base === 'moose' || base === 'elk' ? 0.55 : 0.6;
  const Y = { ...A, len: A.len * k, h: A.h * k * 1.08, w: A.w * k, head: A.head * k * 1.25, snout: A.snout * k, neck: (A.neck || A.head * 0.9) * k, antlers: 0, horns: base === 'mtgoat' ? 'nub' : null, tusks: 0, mane: null, hump: 0, bell: 0, beard: 0, fluffy: (A.fluffy || 0) + 0.5 };
  if (base === 'deer' || base === 'elk') { Y.pattern = 'fawn'; Y.patch = '#f2ead8'; }
  if (base === 'boar') { Y.pattern = 'stripes'; Y.coat = '#8a6a48'; Y.patch = '#d8b888'; }
  return Y;
}
// the legend of a kind: pure white, pale gold antlers and horns, a faint glow
function legendOf(A) {
  return { ...A, coat: '#f6f4f0', belly: '#ffffff', patch: A.pattern === 'spots' || A.pattern === 'rump' || A.pattern === 'flank' ? '#e6e4e0' : '#f6f4f0', patch2: null, mane: A.mane ? '#eceae4' : null, socks: null, face: A.face ? '#ffffff' : null, mask: A.mask ? '#d8d6d2' : null, muzzle: A.muzzle ? '#e8e2d8' : null, tips: null, tailTip: A.tailTip ? '#ffffff' : null, nose: A.nose ? '#d8c8c8' : null, lower: A.lower ? '#e8e6e2' : null, throat: A.throat ? '#ffffff' : null, neckC: A.neckC ? '#eeece8' : null, legend: 1 };
}

// extra room behind the rump for the long tails (so they stay inside the model)
const TAIL_ROOM = { longcat: 14, fox: 9, paddle: 8, otter: 8, squirrel: 3 };
export function animalModel(kind, o = {}) {
  const [baseKind, variant] = String(kind).split(':');
  let A = ANIMALS[baseKind] || ANIMALS.golden;
  if (variant === 'y') A = youngOf(A, baseKind);
  else if (variant === 'L') A = legendOf(A);
  const pose0 = o.pose || 'stand';
  if (pose0 === 'float') return floatModel(A);
  if (pose0 === 'rear' || pose0 === 'climb') return pitchUp(animalModel(kind, { ...o, pose: pose0 === 'rear' ? 'stand' : 'alert', phase: 0 }), A, pose0 === 'rear' ? 1.15 : 1.45, pose0 === 'rear');
  if (pose0 === 'dead') return onSide(animalModel(kind, { ...o, pose: 'stand', phase: 0.12 }), A);
  if (pose0 === 'swim') return waterline(animalModel(kind, { ...o, pose: 'alert' }), A);
  const phase = o.phase || 0, run = o.gait === 'run', pose = pose0, lie = pose === 'lie', alert = pose === 'alert', stalk = pose === 'stalk';
  const hk = A.len <= 30 && (!A.jl || A.len < 14) ? 1.2 : 1;            // pets get the chunky big-headed look of A1 (the wild ones true to life, but for a rabbit)
  const L = Math.ceil(A.len * 1.7 + 10 + (A.antlers ? 8 : 0) + (TAIL_ROOM[A.tail] || 0)), W = Math.ceil(A.w * 2.3 + 12 + (A.antlers >= 2 ? 22 : 0)), Hh = Math.ceil(A.h * 2.2 + 12 + (A.antlers >= 2 ? 16 : 0));
  const m = new Vox(L, W, Hh);
  const cache = new Map();
  const glow = A.legend ? [214, 232, 255, 70] : null;
  const R = (c, k = 3) => { const key = c + k; if (!cache.has(key)) cache.set(key, m.mat({ ramp: ramp(c, 6, 3), k, flag: A.fluffy ? F_LEAF : 0, emi: glow })); return cache.get(key); };
  const base = R(A.coat), belly = A.belly ? R(A.belly) : base, patch = A.patch ? R(A.patch) : base, patch2 = A.patch2 ? R(A.patch2) : patch;
  const dark = m.mat({ ramp: ramp(A.legend ? '#8a8a96' : '#2a2228', 5, 2), k: 1 }), nose = A.nose ? R(A.nose) : dark;
  const face = A.face ? R(A.face) : A.mask ? R(A.mask) : base;
  const cy = W / 2, bodyR = A.w / 2 * (A.len <= 30 ? 1.15 : 1), legLen = A.h - bodyR * 1.1;
  const bob = run ? Math.abs(Math.sin(phase * Math.PI * 2)) * 1.5 * (A.hop || 1) : Math.abs(Math.sin(phase * Math.PI * 2)) * 0.5;   // (a rabbit's hop: up off the ground)
  const sit = pose === 'sit', graze = pose === 'graze';
  const x0 = 5 + (A.tail === 'long' || A.tail === 'feather' ? 4 : 2) + (TAIL_ROOM[A.tail] || 0), x1 = x0 + A.len;          // rump .. chest
  const bz = lie ? bodyR * 1.05 + 0.3 : (sit ? A.h * 0.7 : stalk ? (A.h - bodyR) * 0.72 : A.h - bodyR) + bob;
  void legLen;
  // coat pattern
  const coat = (x, y, z) => {
    if (z < bz - bodyR * 0.45 && belly !== base) return belly;
    if (A.pattern === 'spots') { const c = A.len > 40 ? 9 : 3.5; if (hash(Math.floor(x / c), Math.floor(y / c) * 31 + Math.floor(z / c), 7) > (A.len > 40 ? 0.55 : 0.72)) return patch; }
    if (A.pattern === 'saddle' && z > bz + bodyR * 0.1 && x < x1 - 4) return patch;
    if (A.pattern === 'tabby' && Math.floor(x * 0.9 + Math.sin(z * 0.8) * 1.2) % 3 === 0) return patch;
    if (A.pattern === 'calico') { const h = hash(Math.floor(x / 4), Math.floor((y + z) / 4), 9); if (h > 0.72) return patch; if (h < 0.18) return patch2; }
    if (A.pattern === 'rump' && x < x0 + 5 && z > bz - bodyR * 0.6) return patch;                       // an elk's pale rump
    if (A.pattern === 'flank' && z < bz + bodyR * 0.2 && z > bz - bodyR * 0.5 && x > x0 + 3) return patch;   // a grey fox's rusty sides
    if (A.pattern === 'fawn' && z > bz - bodyR * 0.1 && x > x0 + 2 && x < x1 - 2 && hash(Math.floor(x / 2.2), Math.floor(y / 2.2) * 17 + Math.floor(z / 2.2), 11) > 0.8) return patch;   // a fawn's spots along the back
    if (A.pattern === 'stripes' && z > bz - bodyR * 0.3 && Math.floor((y + Math.sin(x * 0.4)) / 1.6) % 2 === 0) return patch;   // a piglet's stripes
    if (A.tips && z > bz + bodyR * 0.7 && x < x1 + 1 && hash(Math.floor(x / 1.5), Math.floor(y / 1.5) * 7 + Math.floor(z / 1.5), 13) > 0.72) return R(A.tips);   // a grizzly's silver-tipped back
    return base;
  };
  // body: a stretched ellipsoid, the chest a little deeper; sitting tilts the back down
  m.fill((x, y, z) => {
    const t = (x - x0) / (x1 - x0);
    if (t < 0 || t > 1) return -1;
    const zc = sit ? bz - (1 - t) * A.h * 0.35 : bz + (t - 0.5) * 1.2;
    const r = bodyR * (1 + (A.fluffy || 0) * 0.12) * (0.82 + 0.25 * Math.sin(t * Math.PI)) * (A.udder ? 1.05 : 1);
    const rz = r * (A.len > 40 ? 1.25 : 1.05) * (A.hump && z > zc ? 1 + A.hump * 0.16 * Math.exp(-(((t - 0.74) / 0.14) ** 2)) : 1);   // (a shoulder hump: a grizzly, a moose)
    const ex = Math.min(t, 1 - t) < 0.15 ? 1 - Math.pow(1 - Math.min(t, 1 - t) / 0.15, 2) * 0.5 : 1;
    const pw = A.bear ? 2.8 : 2;   // (a bear's barrel of a body: boxier than an egg)
    return Math.abs((y - cy) / (r * ex)) ** pw + Math.abs((z - zc) / (rz * ex)) ** pw <= 1 ? coat(x, y, z) : -1;
  });
  if (A.udder) m.ell(x0 + A.len * 0.3, cy, bz - bodyR * 1.15, 3, 3, 2, R('#f0b0a8'));
  if (A.mane && !A.hump) for (let x = x0 + 4; x < x1 - 1; x += 0.6) m.box(x, cy - 0.8, bz + bodyR * 0.85, x + 1, cy + 0.8, bz + bodyR * 0.85 + 1.4 + (A.tusks ? 2.6 * Math.exp(-((((x - x0) / A.len - 0.8) / 0.2) ** 2)) : 0), R(A.mane));   // a boar's bristles, a crest over the shoulders
  if (A.haunch && !lie) for (const s of [-1, 1]) m.ell(x0 + A.len * 0.24, cy + s * bodyR * 0.45, bz - bodyR * 0.15, A.len * 0.26, bodyR * 0.5, bodyR * 0.8, base);   // a rabbit's big haunches
  // legs: front pair and back pair, swinging in opposite phase; a sit folds the back legs under
  const legR = Math.max(1.1, A.w * 0.13 + (A.len > 40 ? 0.8 : 0)) * (A.bear ? 1.35 : 1);
  const sw = Math.sin(phase * Math.PI * 2) * (run ? 0.75 : 0.4);
  const legs = [[x1 - 3, cy - bodyR * 0.55, sw], [x1 - 3, cy + bodyR * 0.55, -sw], [x0 + 3, cy - bodyR * 0.55, -sw], [x0 + 3, cy + bodyR * 0.55, sw]];
  // the wild ones (A.jl, the AN1-AN4 sheets) get jointed legs: a knee bending forward on the forelegs, a hock pointing
  // back on the hind legs, the feet stepping through a stance (planted, sliding back under the body) and a swing
  // (lifted, carried forward). Walking: a four-beat walk (hind, fore, hind, fore); running: a gallop (a rabbit's hop),
  // the forelegs together and the hind legs together, stretched out, then gathered under the body
  const jl = A.jl && !sit && !lie, moving = o.phase != null && !graze;
  const D = run ? 0.38 : stalk ? 0.72 : 0.62, OFF = run ? [0, 0.1, 0.5, 0.6] : [0.25, 0.75, 0, 0.5];
  const stride = A.h * (run ? 1.15 : stalk ? 0.4 : 0.55) * (A.bear ? 0.8 : 1), lift = A.h * (run ? 0.3 : 0.16);
  const lower = A.lower ? R(A.lower) : base, hoof = A.hoof ? dark : lower;
  legs.forEach(([lx, ly, a], i) => {
    const back = i >= 2;
    if (jl) {
      const top = bz - bodyR * 0.3, L2 = Math.max(top, (A.h - bodyR) * 0.92 - bodyR * 0.3) * (back ? 1.07 : 1.015) / 2;   // (crouched in a stalk: the legs bend)
      let fx = back ? -0.6 : 0.6, fz = 0;
      if (moving) { const p = (((phase + OFF[i]) % 1) + 1) % 1; if (p < D) fx = stride * (0.5 - p / D); else { const u = (p - D) / (1 - D); fx = stride * (u - 0.5); fz = Math.sin(u * Math.PI) * lift; } }
      const dx = fx, dz = fz - top, d = Math.max(0.5, Math.min(L2 * 1.995, Math.hypot(dx, dz))), th = Math.atan2(dz, dx), al = Math.acos(Math.min(1, d / (2 * L2)));
      const kx = lx + Math.cos(th + (back ? -al : al)) * L2, kz = top + Math.sin(th + (back ? -al : al)) * L2;
      const seg = (x0s, z0s, x1s, z1s, r0, r1, mt) => { const n = Math.ceil(Math.hypot(x1s - x0s, z1s - z0s) * 2) + 1; for (let k = 0; k <= n; k++) { const t = k / n, x = x0s + (x1s - x0s) * t, z = z0s + (z1s - z0s) * t, r = r0 + (r1 - r0) * t; m.box(x - r, ly - r, Math.max(0, z - 0.5), x + r, ly + r, Math.max(0, z) + 0.6, mt); } };
      seg(lx, top + legR, kx, kz, legR * (back ? 1.6 : 1.3) * (A.bear ? 0.8 : 1), legR * 0.85, base);   // (the thigh, the forearm)
      seg(kx, kz, lx + fx, fz + 0.6, legR * 0.8, legR * 0.7, lower);                // (the cannon, the shin)
      m.box(lx + fx - legR * 0.8, ly - legR * 0.8, fz, lx + fx + legR + 0.6, ly + legR * 0.8, fz + 1.2, hoof);   // (a hoof or a paw)
      return;
    }
    if (sit && back) { m.ell(lx + 2, ly, 2.5, 4, legR + 1, 2.5, coat(lx, ly, 3)); return; }
    if (lie) {                                                             // front paws out in front, haunches folded beside the rump
      if (back) m.ell(lx + 3, ly + (ly < cy ? -1 : 1), legR + 1, A.len * 0.18, legR + 1.2, legR + 0.8, coat(lx, ly, 2));
      else for (let s2 = 0; s2 < A.h * 0.55; s2 += 0.5) m.box(lx + s2 - 1, ly - legR, 0, lx + s2 + 1, ly + legR, legR * 1.8, s2 > A.h * 0.45 ? (A.cat || A.len < 20 ? belly : dark) : coat(lx + s2, ly, 1));
      return;
    }
    const top = bz - bodyR * 0.3, len = top;
    for (let s = 0; s <= len; s += 0.5) {
      const t = s / len, bend = back ? Math.sin(t * Math.PI) * 1.2 : 0;
      const x = lx + Math.sin(a) * s - bend, z = top - Math.cos(a) * s;
      if (z < 0) break;
      const sock = A.socks && t > 0.7 ? R(A.socks) : (A.cat || A.len <= 30) && t > 0.85 ? belly : t > 0.9 ? dark : coat(x, ly, z);
      m.box(x - legR, ly - legR, Math.max(0, z), x + legR, ly + legR, Math.max(0, z) + 1, A.len > 40 && t > 0.92 ? dark : sock);
    }
  });
  // neck and head
  const neck = A.neck || A.head * 0.9;
  const HD = A.head * hk;
  const hx = x1 + (graze ? 2 : stalk ? neck * 0.55 : neck * 0.35), hz = graze ? HD + 1 : stalk ? bz + bodyR * 0.2 + neck * 0.3 : bz + bodyR * 0.4 + neck * (lie ? 0.55 : alert ? 0.95 : 0.75) + (sit ? 2 : 0) + (alert ? 1.5 : 0);
  const neckC = A.neckC ? R(A.neckC) : null;   // (an elk's dark neck and head)
  for (let s = 0; s <= 1; s += 0.08) { const x = x1 - 2 + (hx - x1 + 2) * s, z = bz + (hz - bz) * s; m.ell(x, cy, z, HD * 0.65, HD * 0.62, HD * 0.7, neckC && s > 0.15 ? neckC : coat(x, cy, z + 2)); }
  if (A.mane && !A.tusks) for (let s = 0; s <= 1; s += 0.05) { const x = x1 - 4 + (hx - x1) * s, z = bz + bodyR + (hz - bz - 2) * s; m.box(x - 1.5, cy - 1, z, x + 1, cy + 1, z + 2.5, R(A.mane)); }
  if (A.throat && !lie) { const x = x1 - 2 + (hx - x1 + 2) * 0.8 + HD * 0.25, z = bz + (hz - bz) * 0.8 - HD * 0.2; m.ell(x, cy, z, HD * 0.5, HD * 0.55, HD * 0.5, R(A.throat)); }   // a deer's white throat
  m.ell(hx + 1, cy, hz, HD, HD * (hk > 1 ? 1.02 : 0.9), HD * 0.9, A.mask ? base : neckC || coat(hx, cy, hz + 4));
  if (A.face) m.ell(hx + 1.5, cy, hz, HD * 0.85, HD * 0.8, HD * 0.85, face);
  if (A.mask) m.box(hx + 1, cy - HD * 0.9, hz, hx + HD, cy + HD * 0.9, hz + 2, face);
  // snout and nose (a moose's long drooping one; a bear's paler muzzle)
  const sx = hx + HD * 0.7, sz = hz - HD * 0.25 - (A.droop ? 1.6 : 0);
  m.ell(sx + A.snout * 0.5, cy, sz, A.snout * 0.7 + 1, HD * (A.droop ? 0.62 : 0.5), HD * (A.droop ? 0.55 : 0.42), A.muzzle ? R(A.muzzle) : A.mask ? R('#d8d4d0') : A.belly && !A.cat && !A.legend ? belly : coat(sx, cy, sz));
  m.box(sx + A.snout + 0.5, cy - 1, sz, sx + A.snout + 1.8, cy + 1, sz + 1.5, nose);
  if (A.tusks) for (const s of [-1, 1]) for (let k = 0; k < 2.6; k += 0.4) m.box(sx + A.snout * 0.55 - k * 0.3, cy + s * 1.6, sz + k * 0.7 - 0.6, sx + A.snout * 0.55 - k * 0.3 + 0.9, cy + s * 1.6 + 0.9, sz + k * 0.7 + 0.3, R('#f0ead8'));   // a boar's tusks
  if (A.buck) m.box(sx + A.snout + 0.2, cy - 0.8, sz - HD * 0.45, sx + A.snout + 1.2, cy + 0.8, sz - HD * 0.1, R('#e08a2a'));   // a beaver's orange teeth
  if (A.bell) m.ell(hx - 0.5, cy, hz - HD * 0.95, 1.1, 0.9, 2.6, coat(hx, cy, hz));   // a moose's bell
  // eyes
  for (const s of [-1, 1]) m.box(hx + HD * 0.55, cy + s * HD * 0.45 - 0.5, hz + HD * 0.15, hx + HD * 0.55 + 1, cy + s * HD * 0.45 + 0.5, hz + HD * 0.15 + 1.4, dark);
  if (A.tongue && o.pant) m.box(sx + A.snout * 0.4, cy - 1, sz - HD * 0.55, sx + A.snout * 0.4 + 2, cy + 1, sz - HD * 0.1, R('#e0607a'));
  // ears
  for (const s of [-1, 1]) {
    const ey = cy + s * HD * 0.6, ez = hz + HD * 0.6, ex = hx - HD * 0.1;
    const ear = A.ears === 'cat' || A.ears === 'up' || A.ears === 'big' ? coat(ex, ey, ez + 3) : A.pattern === 'saddle' ? patch : coat(ex, ey, ez);
    if (A.ears === 'up' || A.ears === 'cat' || A.ears === 'big' || A.ears === 'tufted') { const eh = A.ears === 'big' ? 4 : A.ears === 'cat' || A.ears === 'tufted' ? 2.5 : 3.5; for (let k = 0; k < eh; k += 0.5) { const r = (1 - k / eh) * (A.ears === 'big' ? 2 : 1.4); m.ell(ex, ey + s * 0.3 * k, ez + k, r + 0.3, r, 0.6, ear); } if (A.ears === 'tufted') m.box(ex - 0.4, ey + s * 0.8, ez + eh, ex + 0.4, ey + s * 0.8 + 0.8, ez + eh + 1.8, dark); }
    else if (A.ears === 'round') m.ell(ex - 0.4, cy + s * HD * 0.62, hz + HD * 0.78, 1.5, 1.1, 1.5, coat(ex, ey, ez + 3));   // a bear's round ears
    else if (A.ears === 'tiny') m.ell(ex - 0.4, cy + s * HD * 0.7, hz + HD * 0.55, 0.8, 0.7, 0.7, ear);
    else if (A.ears === 'rabbit') for (let k = 0; k < 6; k += 0.5) m.ell(ex - k * 0.3, ey, ez + k, 0.9, 0.8, 0.6, ear);
    else if (A.ears === 'side') m.ell(ex, cy + s * (HD + 1.2), hz + HD * 0.3, 1.2, 1.6, 0.8, ear);
    else { const len = A.ears === 'long' ? 5 : 3; for (let k = 0; k < len; k += 0.5) m.ell(ex, ey + s * 0.6, ez - k, 1.4, 1, 0.7, ear); }
  }
  if (A.horns === 'black' || A.horns === 'nub') for (const s of [-1, 1]) for (let k = 0; k < (A.horns === 'nub' ? 1.2 : 6); k += 0.4) m.ell(hx - k * 0.75 - (k > 3 ? (k - 3) * 0.4 : 0), cy + s * HD * 0.35, hz + HD * 0.7 + k * 0.85, 0.65, 0.6, 0.55, A.legend ? R('#e8d8a8') : R('#2a262c'));   // a mountain goat's black daggers, curving back
  else if (A.horns) for (const s of [-1, 1]) for (let k = 0; k < 4; k += 0.5) m.ell(hx - (A.horns === 'back' ? k * 0.8 : 0), cy + s * (HD * 0.4 + (A.horns === 'short' ? k * 0.5 : 0)), hz + HD * 0.7 + k * 0.6, 0.7, 0.7, 0.6, R('#d8ccb0'));
  const tine = A.legend ? R('#ecdcae') : R('#c8b48a');
  if (A.antlers === 1) for (const s of [-1, 1]) for (let k = 0; k < 8; k += 0.5) { const tn = k > 3 && Math.round(k) % 2 === 0 ? 1.5 : 0; m.ell(hx - k * 0.3 - tn, cy + s * (HD * 0.5 + k * 0.5), hz + HD * 0.6 + k, 0.75, 0.7, 0.7, tine); }
  if (A.antlers === 2) for (const s of [-1, 1]) {   // an elk's rack: long beams sweeping back, the tines forward
    for (let k = 0; k <= 17; k += 0.5) {
      const x = hx - k * 0.62 - (k > 9 ? (k - 9) * 0.6 : 0), y = cy + s * (HD * 0.45 + k * 0.5), z = hz + HD * 0.55 + k * 1.1;
      m.ell(x, y, z, 1.15, 1.1, 1.1, tine);
      if ([2.5, 5.5, 8.5, 11.5, 14.5].includes(k)) for (let t = 0; t < 5; t += 0.5) m.ell(x + t * 0.78, y, z + t * 0.62, 0.85, 0.8, 0.8, tine);
    }
  }
  if (A.antlers === 3) for (const s of [-1, 1]) {   // a moose's palms: out to the side and up, broad and flat, points round the rim
    for (let k = 0; k < 3; k += 0.5) m.ell(hx - 0.5, cy + s * (HD * 0.5 + k), hz + HD * 0.7 + k * 0.5, 0.9, 0.9, 0.9, tine);
    // the palm: a broad plate leaning out at ~50 degrees (u out from the head along the lean, v front to back)
    const by = cy + s * (HD * 0.5 + 2.5), bzz = hz + HD * 0.7 + 1.5, ca = Math.cos(0.85), sa = Math.sin(0.85);
    m.fill((x, y, z) => {
      const dy = (y - by) * s, dz = z - bzz, u = dy * ca + dz * sa, w = -dy * sa + dz * ca, v = x - (hx - 1.5);
      if (u < 0 || u > 11.5 || Math.abs(w) > 1.1) return -1;
      const half = 1.6 + Math.min(u, 7) * 0.62, tip = u > 9.5 && Math.round((v + 20) * 0.75) % 2 === 1;   // (points along the far edge)
      return Math.abs(v) <= half && !tip ? tine : -1;
    }, Math.floor(hx - 10), Math.floor(Math.min(by, by + s * 12) - 1), Math.floor(bzz - 1), Math.ceil(hx + 8), Math.ceil(Math.max(by, by + s * 12) + 1), Math.ceil(bzz + 11));
  }
  if (A.beard) m.ell(sx, cy, sz - HD * 0.6, 0.8, 0.8, 1.5, base);
  if (A.collar) { const col = R(A.collar), cx = Math.round(x1 + (hx - x1) * 0.25); for (let z = Math.floor(bz); z < m.h; z++) for (let y = 0; y < W; y++) for (const x of [cx, cx + 1]) { const i = m.idx(x, y, z); if (m.v[i] && z < hz - HD * 0.5) m.v[i] = col; } }
  // tail
  const tx = x0, tz = bz + bodyR * 0.5;
  const tail = (pts, r) => pts.forEach(([dx, dz], i) => m.ell(tx - dx, cy, tz + dz, r(i), r(i), r(i), A.tail === 'ringed' ? (i % 2 ? R('#2a282c') : base) : coat(tx - dx, cy, tz + dz + 6)));
  const wag = Math.sin((o.wag ?? phase) * Math.PI * 4) * 1.2;
  if (A.tail === 'up') tail([...Array(10)].map((_, i) => [i * 0.3 - wag * 0.25 * (i / 10) * (i / 10), i * 0.9]), () => 0.9);
  else if (A.tail === 'curl') tail([...Array(10)].map((_, i) => [1.5 - Math.cos(i * 0.6) * 2, 2 + Math.sin(i * 0.6) * 2.5]), () => 1);
  else if (A.tail === 'down') tail([...Array(9)].map((_, i) => [i * 0.6, -i * 0.7]), () => 0.9);
  else if (A.tail === 'feather' || A.tail === 'bushy') tail([...Array(10)].map((_, i) => [i * 0.8, i * 0.2 - (A.tail === 'bushy' ? i * 0.4 : 0) + wag * (i / 10)]), (i) => 1 + Math.sin(i / 9 * Math.PI) * 1.4);
  else if (A.tail === 'long') tail([...Array(14)].map((_, i) => [i * 0.6, -i * 1.1]), (i) => 1.2 + (i > 6 ? 0.6 : 0));
  else if (A.tail === 'thin') tail([...Array(14)].map((_, i) => [i * 0.25, -i * 1.2]), (i) => (i > 11 ? 1.2 : 0.5));
  else if (A.tail === 'ringed') tail([...Array(12)].map((_, i) => [i * 0.8, -i * 0.3]), () => 1.4);
  else if (A.tail === 'puff') m.ell(tx - 1, cy, tz, 1.6, 1.6, 1.6, R('#f2ece4'));
  else if (A.tail === 'longcat') [...Array(22)].forEach((_, i) => { const t = i / 21, x = tx - i * 0.62, z = tz - Math.sin(t * Math.PI * 0.8) * 5 + (t > 0.75 ? (t - 0.75) * 10 : 0) + wag * t * 0.6; m.ell(x, cy, Math.max(1, z), 1.25, 1.25, 1.25, t > 0.86 ? R(A.tailTip) : coat(x, cy, z + 6)); });   // a lion's long tail, curling up at the dark tip
  else if (A.tail === 'fox') [...Array(14)].forEach((_, i) => { const t = i / 13, x = tx - i * 0.75, z = tz - i * 0.35 + wag * t; const r = 1.2 + Math.sin(t * Math.PI) * 1.9; m.ell(x, cy, z, r, r, r, t > 0.84 ? R(A.tailTip) : coat(x, cy, z + 6)); });   // a fox's brush, its tip white or black
  else if (A.tail === 'paddle') m.fill((x, y, z) => (((x - (tx - 4.5)) / 4.6) ** 2 + ((y - cy) / 2.8) ** 2 <= 1 && Math.abs(z - Math.max(1, tz - bodyR * 0.7)) < 0.8 ? R(A.legend ? '#c8c6c2' : '#3a2e2c') : -1), Math.floor(tx - 10), Math.floor(cy - 3), 0, Math.ceil(tx), Math.ceil(cy + 3), Math.ceil(tz));   // a beaver's flat, scaly paddle
  else if (A.tail === 'otter') [...Array(10)].forEach((_, i) => { const t = i / 9, x = tx - i * 0.9, z = tz - bodyR * 0.3 - i * 0.25; const r = 1.8 - t * 1.2; m.ell(x, cy, Math.max(r, z), r, r, r, coat(x, cy, z + 6)); });   // an otter's thick, tapering tail
  else if (A.tail === 'squirrel') [...Array(16)].forEach((_, i) => { const t = i / 15, x = tx - 1 - Math.sin(t * Math.PI * 0.9) * 2.4 + (t > 0.7 ? (t - 0.7) * 5 : 0), z = tz + t * 7.5; const r = 1 + Math.sin(t * Math.PI) * 1.3; m.ell(x, cy, z, r, r, r, coat(x, cy, z)); });   // a squirrel's plume up over its back
  else tail([[0, 0], [0.8, 0.4]], () => 1);
  m.smooth = 1;
  patchHidden(m);
  return m;
}

// ---- whole-body poses made from a standing model -----------------------------------------------------------
// copy a model into a new one through a mapping from the new voxel to the old (null: empty)
function remap(m, w, d, h, fn) {
  const n = new Vox(w, d, h);
  n.mats = m.mats; n.smooth = m.smooth;
  for (let z = 0; z < h; z++) for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
    const s = fn(x + 0.5, y + 0.5, z + 0.5);
    if (!s) continue;
    const v = m.get(Math.floor(s[0]), Math.floor(s[1]), Math.floor(s[2]));
    if (v) n.v[n.idx(x, y, z)] = v;
  }
  patchHidden(n);
  return n;
}
// up on the hind legs (a bear standing, rearing): the body pitched up round the hips, the hind legs kept planted.
// climb: the whole of it pitched up, as on a trunk.
function pitchUp(m, A, ang, keepLegs) {
  const px = 5 + (A.tail === 'long' || A.tail === 'feather' ? 4 : 2) + (TAIL_ROOM[A.tail] || 0) + 2, pz = keepLegs ? A.h * 0.55 : 0;
  const c = Math.cos(ang), s = Math.sin(ang), H = Math.ceil(pz + (m.w - px) * s + m.h * c + 4), W = Math.ceil(px + m.h * s * 0.8 + 10);
  return remap(m, W, m.d, H, (X, Y, Z) => {
    // the body: rotate back to where it was before it pitched up (nose-up by ang round (px, pz))
    const dx = X - px, dz = Z - pz, x = px + dx * c + dz * s, z = pz - dx * s + dz * c;
    if (z >= (keepLegs ? pz * 0.75 : 0) && x >= 0 && x < m.w && z < m.h && m.get(Math.floor(x), Math.floor(Y), Math.floor(z))) return [x, Y, z];
    if (keepLegs && Z < pz && X < px + 5 && X >= 0 && X < m.w) return [X, Y, Z];   // the hind legs, planted
    return null;
  });
}
// dead: rolled onto its side, the legs out stiff
function onSide(m, A) {
  const cy = m.d / 2, H = Math.ceil(A.w * 1.4 + 4), D = Math.ceil(m.d / 2 + m.h + 2);
  return remap(m, m.w, D, H, (X, Y, Z) => {
    // new y runs out from the back (y = cy) toward the feet; new z is the old y across the body
    const z = Y - (D - m.h - 1), y = cy + (Z - A.w * 0.7);
    return z >= 0 && z < m.h && y >= 0 && y < m.d ? [X, y, m.h - 1 - z] : null;
  });
}
// swimming: only what shows above the water - the head, the top of the back - sat at the surface
function waterline(m, A) {
  const cut = Math.max(1, Math.round(A.h * 0.62));
  return remap(m, m.w, m.d, Math.max(4, m.h - cut), (X, Y, Z) => [X, Y, Z + cut]);
}
// a sea otter on its back in the kelp: the pale head up, paws on the chest, the hind feet and tail out behind, low
// in the water
function floatModel(A) {
  const L = Math.ceil(A.len + 14), W = Math.ceil(A.w * 2 + 8), m = new Vox(L, W, 10), cy = W / 2;
  const glow = A.legend ? [214, 232, 255, 70] : null;
  const body = m.mat({ ramp: ramp(A.coat, 6, 3), k: 3, flag: F_LEAF, emi: glow }), pale = m.mat({ ramp: ramp(A.face || A.coat, 6, 3), k: 3, emi: glow }), dark = m.mat({ ramp: ramp('#2a2228', 5, 2), k: 1 });
  m.ell(L / 2, cy, 2.4, A.len / 2, A.w * 0.55, 2.6, body);
  m.ell(L / 2 + A.len / 2 + 1.5, cy, 4, A.head * 0.9, A.head * 0.85, A.head * 0.8, pale);
  for (const s of [-1, 1]) { m.box(L / 2 + A.len / 2 + A.head * 0.6, cy + s * 1.4 - 0.5, 6.2, L / 2 + A.len / 2 + A.head * 0.6 + 1, cy + s * 1.4 + 0.5, 7, dark); m.ell(L / 2 + A.len * 0.25, cy + s * 1.6, 4.6, 1.3, 1, 0.8, body); m.ell(L / 2 - A.len / 2 - 1, cy + s * 2, 3.2, 2, 1.2, 0.7, body); }
  m.box(L / 2 + A.len / 2 + A.head + 1, cy - 0.6, 3.4, L / 2 + A.len / 2 + A.head + 2, cy + 0.6, 4.4, dark);
  m.ell(L / 2 - A.len / 2 - 3, cy, 2.2, 3.5, 1.2, 0.8, body);
  m.smooth = 1;
  patchHidden(m);
  return m;
}

// Render a model in the character view: like Vox.render (voxel.js) but the ground depth is foreshortened
// by fy (screen y = Y * fy - Z), the way the people sprites are drawn, so a creature facing the camera
// shows its face, chest and legs. Same shading, inner depth lines and outline; z is the true height.
export function renderUpright(m, heading = 0, opt = {}) {
  m.prepare(opt.smooth ?? m.smooth ?? 1);
  const { w, d, h } = m, fy = opt.fy ?? 0.38, dither = opt.dither ?? 0.4, S = opt.px || 1;   // (opt.px: world px per art pixel)
  const R = Math.ceil(Math.hypot(w, d) / 2) + 2, Ry = Math.ceil(R * fy) + 1, ax = Math.ceil(R / S), ay = Math.ceil((Ry + h) / S);
  const G = new GBuf(2 * ax, ay + Math.ceil((Ry + 2) / S));
  G.ax = ax; G.ay = ay; if (S > 1) G.ap = S;
  const c = Math.cos(heading), s = Math.sin(heading), brk = 3.5 + (S - 1) * 2;
  const depth = new Float32Array(G.w * G.h).fill(-1e9);
  for (let py = 0; py < G.h; py++) for (let px = 0; px < G.w; px++) {
    const X = (px - ax) * S + 0.5, sy = (py - ay) * S + 0.5;
    for (let Z = h - 1; Z >= 0; Z--) {
      const Y = (sy + Z + 0.5) / fy;
      const mx = c * X + s * Y + w / 2, my = -s * X + c * Y + d / 2;
      if (mx < 0 || my < 0 || mx >= w || my >= d) continue;
      const vi = m.idx(mx | 0, my | 0, Z), mt = m.v[vi];
      if (!mt) continue;
      const M = m.mats[mt];
      let nx = m.nx[vi], ny = m.ny[vi], nz = m.nz[vi];
      if (!nx && !ny && !nz) nz = 1;
      const wx = c * nx - s * ny, wy = s * nx + c * ny;
      let t = M.k + (m.ao[vi] - 0.75) * 2.2 + (nz > 0.7 ? 0.5 : 0) + (M.shade ? M.shade(mx, my, Z, vi) : 0);
      t += bayer(px, py) * dither;
      const R5 = M.ramp, col = R5[Math.max(0, Math.min(R5.length - 1, Math.round(t)))];
      G.put(px, py, col, [wx, wy, nz], Z, M.emi, M.flag | (opt.flag || 0));
      depth[py * G.w + px] = Y * fy + Z;
      break;
    }
  }
  for (let py = 1; py < G.h; py++) for (let px = 1; px < G.w - 1; px++) {
    const i = py * G.w + px, j = i * 4;
    if (!G.col[j + 3]) continue;
    const me = depth[i], up = depth[i - G.w], lf = depth[i - 1], rt = depth[i + 1];
    if ((up > -1e8 && up - me > brk) || (lf > -1e8 && lf - me > brk) || (rt > -1e8 && rt - me > brk)) { G.col[j] *= 0.62; G.col[j + 1] *= 0.6; G.col[j + 2] = G.col[j + 2] * 0.66 + 8; }
  }
  G.outline(0.42, true);
  return G;
}
