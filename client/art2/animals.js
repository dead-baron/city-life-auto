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
//     AN7, hit and hurt: 'hit' (the flinch: reared back off the forelegs, head up) | 'limp' (wounded: the walk with a
//     foreleg held up off the ground, the head low) | 'down' (bedded down wounded: legs folded under, the head down on
//     the ground) | 'fall' (knocked off its feet: on its side, the legs going)
//     AN5, at the water: 'drink' (the forelegs splayed, the head right down to the water) | 'wade' (standing or walking
//     in the shallows: the legs under the water to the knees)
//     AN2: 'swipe' (a bear rocked back off its forefeet, a forepaw raised (phase < 0.5) and raking forward)
//     'eatfish' (AN5: an otter sat up on the bank, a fish crosswise in its jaws)
//     'dive' (AN5: a swimmer going under, nose first - the rump and the tail up out of the water)
//     AN4: 'pounce' (a cat's leap: off the ground, stretched out, the forepaws reaching (phase < 0.5) or about to land)
//     Nature-A2: 'catch' (head up with its catch in its jaws: o.prey 'fish' - a bear's salmon - or 'mouse' - a fox's)
//     'wadecatch' / 'wadeswipe' (the same, and the swipe, stood in the white water under a falls: the legs in the water)
//     kind may carry a variant: 'deer:y' the young (smaller, a fawn's spots, no antlers), 'deer:L' the legendary
//     pure white one (it glows faintly)
//   renderUpright(vox, heading, { fy = 0.38, dither }) -> GBuf (anchor at the model centre on the ground)
import { Vox } from './voxel.js';
import { patchHidden } from './vehicles.js';
import { ramp } from './palette.js';
import { GBuf, F_LEAF, hash, bayer } from './gbuf.js';

// body sizes in world px (an adult is ~42 px tall): len body length, h shoulder height, w body width
export const ANIMALS = {
  // (the pets of A1: chunky, the head big and carried high, the legs sturdy - a face to see from the front)
  golden: { len: 24, h: 19, w: 11, coat: '#d89a44', belly: '#e8b868', ears: 'flop', tail: 'feather', snout: 4, head: 5.4, fluffy: 1, collar: '#2f5aa8', tongue: 1 },
  puppy: { len: 15, h: 12, w: 8, coat: '#e0a858', belly: '#f0d098', ears: 'flop', tail: 'feather', snout: 2.2, head: 4.6, fluffy: 1, collar: '#c83030', tongue: 1 },
  lab: { len: 24, h: 19, w: 11, coat: '#3a383f', eye: '#7a5a42', ears: 'flop', tail: 'down', snout: 4, head: 5.4, collar: '#c83030', tongue: 1 },
  spaniel: { len: 19, h: 15, w: 9.5, coat: '#f0ece4', patch: '#8a3a22', pattern: 'saddle', headC: '#8a3a22', muzzle: '#f4f0ea', blaze: '#f4f0ea', ears: 'long', tail: 'feather', tailC: '#f4f0ea', snout: 3, head: 4.8, collar: '#3a8a46' },
  shepherd: { len: 27, h: 21, w: 11, coat: '#c08840', patch: '#2a2420', pattern: 'saddle', muzzle: '#2e2824', earC: '#3a2c24', ears: 'up', tail: 'bushy', tailC: '#3a2c24', snout: 5, head: 5.4, collar: '#c83030', tongue: 1 },
  husky: { len: 25, h: 20, w: 11, coat: '#8a8c94', belly: '#f0ece8', muzzle: '#f4f2ee', blaze: '#f4f2ee', cheeks: '#f4f2ee', legC: '#f0ece8', ears: 'up', tail: 'curl', snout: 4, head: 5.4, fluffy: 1, collar: '#3a6ab0', tongue: 1, eye: '#5a9ad8' },
  pitbull: { len: 23, h: 18, w: 12, coat: '#a8683a', belly: '#f0e8dc', muzzle: '#f0e8dc', blaze: '#f0e8dc', socks: '#f0e8dc', ears: 'flop', tail: 'down', snout: 3.2, head: 5.8, collar: '#34343c', tongue: 1 },
  bulldog: { len: 19, h: 17, w: 13, coat: '#d8904a', belly: '#f4ece0', muzzle: '#f4ece0', blaze: '#f4ece0', legC: '#f4ece0', ears: 'flop', tail: 'stub', snout: 1.8, head: 6.4, collar: '#3a6ab0', tongue: 1 },
  chihuahua: { len: 12, h: 10, w: 6.5, coat: '#e0a050', belly: '#f0d8a8', ears: 'big', tail: 'curl', snout: 2, head: 4.2, collar: '#c83030' },
  terrier: { len: 17, h: 13.5, w: 8.5, coat: '#7a7c84', muzzle: '#b4b6bc', ears: 'flop', tail: 'up', tailN: 7, snout: 3.2, head: 4.6, fluffy: 1, beard: 1, collar: '#3a8a46', tongue: 1 },
  dalmatian: { len: 25, h: 20, w: 10, coat: '#f2f0ec', patch: '#26262c', pattern: 'dots', earC: '#26262c', ears: 'flop', tail: 'down', snout: 4, head: 5, collar: '#c83030', tongue: 1 },
  catBlack: { len: 18, h: 11.5, w: 7.5, legK: 0.8, catFace: 1, hup: 0.7, nose: '#f6adbb', coat: '#302e38', eye: '#e8c83a', ears: 'cat', tail: 'cat', tailLow: 1, snout: 0.9, head: 4.5, cat: 1, collar: '#c83030' },
  catTabby: { len: 18, h: 11.5, w: 7.5, legK: 0.8, catFace: 1, hup: 0.7, nose: '#f6adbb', eye: '#e8c440', coat: '#8a8c90', patch: '#4a4c52', pattern: 'tabby', muzzle: '#d8d8d4', ears: 'cat', tail: 'cat', tailLow: 1, tailBands: '#4a4c52', snout: 0.9, head: 4.5, cat: 1, collar: '#3a8a46' },
  catGinger: { len: 18, h: 11.5, w: 7.5, legK: 0.8, catFace: 1, hup: 0.7, nose: '#f6adbb', eye: '#5a9a3a', coat: '#e08a3a', patch: '#b85a20', pattern: 'tabby', belly: '#f4dcb8', muzzle: '#f4e4cc', ears: 'cat', tail: 'cat', tailBands: '#b85a20', snout: 0.9, head: 4.5, cat: 1, collar: '#3a6ab0' },
  catCalico: { len: 18, h: 11.5, w: 7.5, legK: 0.8, catFace: 1, hup: 0.7, nose: '#f6adbb', eye: '#5a9a3a', coat: '#f2ece2', patch: '#d8783a', patch2: '#2a2830', pattern: 'calico', headC: '#d8783a', muzzle: '#f4f0ea', blaze: '#f4f0ea', ears: 'cat', tail: 'cat', tailC: '#d8783a', snout: 0.9, head: 4.5, cat: 1, collar: '#c83030' },
  catWhite: { len: 18, h: 11.5, w: 8.5, legK: 0.85, catFace: 1, hup: 0.7, nose: '#f6adbb', eye: '#4a9ad0', coat: '#f2eee8', ears: 'cat', tail: 'feather', snout: 0.9, head: 4.7, cat: 1, fluffy: 1, collar: '#b04a9a' },
  cow: { len: 48, h: 31, w: 19, coat: '#f2f0ec', patch: '#26262c', pattern: 'spots', ears: 'side', earC: '#26262c', tail: 'thin', snout: 6, head: 8, hup: 0.5, muzzle: '#e8b4ac', nose: '#b87878', horns: 'short', udder: 1 },
  horse: { len: 50, h: 36, w: 14, coat: '#8a4a26', belly: '#8a4a26', mane: '#2a1e1a', ears: 'up', tail: 'long', snout: 9, head: 6, neck: 18, socks: '#f2eee8' },
  sheep: { len: 27, h: 19, w: 15, coat: '#ece2c8', headC: '#34303a', muzzle: '#34303a', legC: '#34303a', earC: '#34303a', eye: '#e8e0c8', ears: 'side', tail: 'stub', snout: 3, head: 5.2, hup: 0.5, fluffy: 2 },
  pig: { len: 29, h: 17, w: 15, coat: '#f0a8a0', ears: 'side', earC: '#e08a8a', tail: 'curl', snout: 3.4, head: 6.2, hup: 0.3, muzzle: '#e8949a', nose: '#c86878' },
  goat: { len: 25, h: 19, w: 10.5, coat: '#f2eee4', ears: 'side', tail: 'up', tailN: 4, snout: 4, head: 5, hup: 0.6, horns: 'back', beard: 1, muzzle: '#e4dccc' },
  // (the wild ones: jl jointed legs, lower the shins' colour, hoof dark hooves; throat a pale throat patch)
  deer: { len: 34, h: 26, w: 10, coat: '#a8693a', belly: '#f0e4cc', pattern: 'rump', patch: '#f4eee2', ears: 'up', tail: 'stub', snout: 5, head: 5, neck: 10, antlers: 1, jl: 1, lower: '#8a5630', hoof: 1, throat: '#f2ece0', nose: '#2a2228' },
  rabbit: { len: 11, h: 7, w: 6.5, coat: '#9a7652', belly: '#f0e4d4', ears: 'rabbit', tail: 'puff', snout: 1.5, head: 3.6, jl: 1, lower: '#b8946a', haunch: 1, hop: 2.2 },
  raccoon: { len: 17, h: 13.5, w: 9.5, hk: 1.15, coat: '#7a7678', mask: '#26242a', eye: '#f0ece4', ears: 'cat', tail: 'ringed', snout: 2.5, head: 4.4, jl: 1, lower: '#3a383c', fluffy: 1 },
  coyote: { len: 26, h: 17, w: 8, coat: '#a8885a', belly: '#e8dcc0', ears: 'up', tail: 'bushy', snout: 5, head: 4.6, jl: 1, lower: '#c0a070', throat: '#ece2cc', tips: '#6a5a46' },
  // (Nature-A2's grey wolves: bigger and longer-legged than a coyote, grizzled grey with a darker saddle, a pale face and
  // legs, the bushy tail)
  wolf: { len: 32, h: 22, w: 11, coat: '#8e8a84', belly: '#dcd6cc', pattern: 'saddle', patch: '#5e5a56', ears: 'up', tail: 'bushy', snout: 5.6, head: 5.8, jl: 1, lower: '#b8b2a8', throat: '#e6e0d6', muzzle: '#d8d2c8', fluffy: 1, eye: '#c8a040' },
  // the wilds (shared/fauna.js): deer and their kin, the predators, the water's edge, small game
  elk: { len: 44, h: 32, w: 13, coat: '#b08458', belly: '#6a4a30', mane: '#4e3424', neckC: '#6a4a32', pattern: 'rump', patch: '#e2cea4', ears: 'up', tail: 'stub', snout: 6, head: 6, neck: 13, antlers: 2, jl: 1, lower: '#4a3222', hoof: 1 },
  moose: { len: 42, h: 43, w: 16.5, legK: 0.62, coat: '#3e2c22', socks: '#a8988a', ears: 'side', tail: 'stub', snout: 10, head: 7.2, neck: 11, antlers: 3, hump: 2.4, slope: 4.5, hfwd: 0.95, hdrop: 0.85, bell: 1, droop: 1, muzzle: '#5a4638', jl: 1, lower: '#a8988a', hoof: 1 },
  mtgoat: { len: 27, h: 23, w: 12.5, coat: '#f2eee6', ears: 'side', tail: 'stub', snout: 4.5, head: 4.8, neck: 6, hup: 0.6, muzzle: '#e4dccc', horns: 'black', beard: 1, fluffy: 1, hump: 0.8, socks: '#2a262c', jl: 1, lower: '#ece6da', hoof: 1 },
  boar: { len: 32, h: 19, w: 12, coat: '#4a3a2e', mane: '#241c18', ears: 'up', tail: 'thin', snout: 7, head: 6.4, nose: '#6a5a52', tusks: 1, jl: 1, lower: '#2e2420', hoof: 1, tips: '#6e5a48' },
  blackbear: { len: 33, h: 25, w: 15.5, coat: '#2e2a32', muzzle: '#9a7a58', ears: 'round', tail: 'stub', snout: 4.6, head: 7, fluffy: 1, bear: 1, arch: 0.3, slope: -2.2, hfwd: 0.45, hdrop: 0.8, jl: 1 },
  grizzly: { len: 41, h: 34, w: 19, coat: '#7a5634', muzzle: '#9a7650', tips: '#b89a70', ears: 'round', tail: 'stub', snout: 5.4, head: 8, fluffy: 1, bear: 1, hump: 0.7, arch: 0.14, slope: 0.6, hfwd: 0.5, hdrop: 0.85, jl: 1, lower: '#5a3e26' },
  cougar: { len: 34, h: 18, w: 9, coat: '#c08a54', belly: '#ecdcc0', ears: 'cat', tail: 'longcat', tailTip: '#3a2a22', snout: 2.2, head: 4.6, cat: 1, jl: 1 },
  bobcat: { len: 22, h: 14, w: 9, hk: 1.15, coat: '#a8885e', patch: '#5a4632', pattern: 'dots', belly: '#e8dcc4', muzzle: '#e8dcc4', ears: 'tufted', tail: 'stub', snout: 1.6, head: 4.6, cat: 1, jl: 1, eye: '#d8b040' },
  redfox: { len: 20, h: 12, w: 6.5, coat: '#d0682a', belly: '#f2ece0', ears: 'up', tail: 'fox', tailTip: '#f4f0e8', snout: 4, head: 4, socks: '#2a2228', jl: 1, lower: '#2a2228' },
  greyfox: { len: 19, h: 11.5, w: 6.5, coat: '#8a8a8e', patch: '#b8683a', pattern: 'flank', belly: '#f0ece4', ears: 'up', tail: 'fox', tailTip: '#26242a', snout: 3.6, head: 4, jl: 1 },
  beaver: { len: 21, h: 11, w: 12.5, hk: 1.1, coat: '#6a4630', ears: 'tiny', tail: 'paddle', snout: 2.5, head: 4.5, buck: 1 },
  otter: { len: 26, h: 9, w: 7.5, hk: 1.1, coat: '#5a3e2c', belly: '#8a6a52', muzzle: '#c8b098', ears: 'tiny', tail: 'otter', snout: 2, head: 3.6 },
  seaotter: { len: 24, h: 8, w: 9, coat: '#5a4434', face: '#d8ccb8', ears: 'tiny', tail: 'otter', snout: 1.6, head: 4.4 },
  squirrel: { len: 9, h: 5, w: 4, coat: '#8a8a8c', belly: '#ece8e0', ears: 'cat', tail: 'squirrel', snout: 1.2, head: 2.8 },
  shark: { len: 98, h: 10, w: 13, coat: '#5c6a74', belly: '#dcdcd6', ears: 'tiny', tail: 'stub', snout: 2, head: 6 },   // (drawn by sharkModel, not the legged rig)
};
// the young of a kind: smaller, bigger-headed, no antlers, horns or tusks; a fawn's (or an elk calf's) white spots,
// a piglet's stripes, fluffier cubs and kits
const darker = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
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
const TAIL_ROOM = { longcat: 14, fox: 9, paddle: 8, otter: 8, squirrel: 3, cat: 12 };
// A great white (server/systems/sharks.js) seen from above as it swims: its long dark shape just under the water, the
// dorsal fin standing out of it and the top of the tail beating side to side (phase); biting, the head up out of the
// water, the jaws wide; dead, rolled belly up. +x is its nose, as every animal's.
function sharkModel(pose, phase) {
  // (11-25, the owner: "The shark could use another pass on it let's try to make it look better" - it swam as a dark
  // torpedo with a stub of a tail. Now a shark's own shape from above: a pointed snout, widest at the shoulders, a long
  // taper to a narrow tail stock; broad swept pectoral fins, small pelvic fins; its back a tone lighter where it lies
  // just under the surface; the dorsal fin tall, a small second one near the tail; the tail's upper lobe a tall
  // swept blade.)
  const O = 10, L = 132, W = 58, H = 26, cy = W / 2, m = new Vox(L, W, H);
  const dark = m.mat({ ramp: ramp('#2a4250', 5, 2), k: 1 }), mid = m.mat({ ramp: ramp('#44606f', 5, 2), k: 2 }), back = m.mat({ ramp: ramp('#5c6a74', 6, 3), k: 3 }), belly = m.mat({ ramp: ramp('#dcdcd6', 6, 3), k: 3 });
  const mouth = m.mat({ ramp: ramp('#8a2a2a', 5, 2), k: 2 }), teeth = m.mat({ ramp: ramp('#f4f2ea', 4, 2), k: 1 }), eye = m.mat({ ramp: ramp('#101418', 3, 1), k: 1 });
  const sway = Math.sin((phase + 0.25) * Math.PI * 2) * 4;   // (two swim frames: the tail one side, then the other)
  // (the body's half width along it, tail 0 to nose 1: the narrow stock, the swell to the shoulders, the pointed snout)
  const half = (u) => { if (u < 0.1) return 2.5 + u * 15; if (u < 0.55) { const t = (u - 0.1) / 0.45, e = t * t * (3 - 2 * t); return 4 + 9 * e; } if (u < 0.7) return 13; return Math.max(1, 13 * (1 - Math.pow((u - 0.7) / 0.3, 1.7))); };
  const X = (u) => O + 6 + u * 98;
  if (pose === 'dead') {
    for (let x = O + 6; x < O + 104; x++) { const u = (x - O - 6) / 98, hw = half(u) * 0.9; m.box(x, cy - hw, 0, x + 1, cy + hw, 3, back); m.box(x, cy - hw * 0.8, 3, x + 1, cy + hw * 0.8, 6, belly); }
    for (const sd of [-1, 1]) for (let k = 0; k < 12; k++) m.box(O + 62 - k * 0.6, cy + sd * (11 + k), 1, O + 73 - k * 1.3, cy + sd * (12 + k), 3, back);   // (the pectorals out flat)
    m.smooth = 1; patchHidden(m); return m;
  }
  const bite = pose === 'bite';
  // the shape under the water: the body (the tail end swinging), its back a tone lighter along the middle
  for (let x = O + 6; x < O + 104; x++) {
    const u = (x - O - 6) / 98, hw = half(u), off = u < 0.35 ? sway * (1 - u / 0.35) : 0;
    if (bite && u > 0.86) continue;   // (the snout's tip is up out of the water; the body runs on under the raised head)
    m.box(x, cy + off - hw, 0, x + 1, cy + off + hw, 2, dark);
    if (u > 0.14 && u < 0.93 && hw > 4) m.box(x, cy + off - hw * 0.5, 2, x + 1, cy + off + hw * 0.5, 2.7, mid);
  }
  // the pectoral fins: broad at the root, swept back to a point; the small pelvic fins further back
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 15; k++) m.box(O + 63 - k * 0.6, cy + sd * (12 + k) - 0.5, 0, O + 75 - k * 1.3, cy + sd * (12 + k) + 0.5, 2, dark);
    for (let k = 0; k < 5; k++) m.box(O + 32 - k * 0.5, cy + sd * (7 + k) - 0.5, 0, O + 38 - k * 1.1, cy + sd * (7 + k) + 0.5, 1.5, dark);
  }
  // the tail under the water: its lower lobe trailing
  for (let k = 0; k < 9; k++) m.box(O + 5 - k * 0.7, cy + sway - 1.5, 0, O + 8 - k * 0.5, cy + sway + 1.5, 1, dark);
  // the dorsal fin: a tall swept-back triangle out of the water, a little ahead of the middle; a small second one aft
  for (let z = 2; z < 20; z++) { const t = (z - 2) / 18, x0 = O + 58 - t * 9, x1 = O + 58 + (1 - t) * 17 - t * 6; m.box(x0, cy - 1, z, Math.max(x0 + 1, x1), cy + 1, z + 1, z > 17 ? dark : back); }
  for (let z = 2; z < 6; z++) { const t = (z - 2) / 4; m.box(O + 26 - t * 3, cy + sway * 0.3 - 0.7, z, O + 31 - t * 4, cy + sway * 0.3 + 0.7, z + 1, back); }
  // the top of the tail: its upper lobe a tall blade swept back, beating side to side, out of the water
  for (let z = 1; z < 17; z++) { const t = (z - 1) / 16; m.box(O + 5 - t * 11, cy + sway * 1.4 - 1, z, O + 10 - t * 9 + (1 - t) * 1.5, cy + sway * 1.4 + 1, z + 1, z > 14 ? dark : back); }
  if (bite) {
    // the head up out of the water at the bite (redrawn 11-25, the owner: "when it opens it mouth to attack part of its
    // head disappear and looks off" - the head was a flat slab over a gap in the body): a cone of a snout, rounded
    // across, grey above and white under; the lower jaw dropped, the mouth red between them, teeth along both jaws'
    // edges, the black eye, the gill slits behind it. The body under the water runs on beneath it (above).
    const HX0 = O + 64, HX1 = O + 113;
    for (let x = HX0; x < HX1; x++) {
      const u = (x - HX0) / (HX1 - HX0), hw = 12.5 * (1 - Math.pow(u, 2.4) * 0.82), rise = 2 + u * 9, th = 6 - u * 3.2;
      for (let y = -Math.ceil(hw); y <= hw; y++) {
        const v = y / hw; if (v < -1 || v > 1) continue;
        const zt = rise + 8 - v * v * 3.2, zu = zt - th * (1 - v * v * 0.35);      // (the upper jaw's top and its underside)
        m.box(x, cy + y, Math.max(2, zu), x + 1, cy + y + 1, zt, Math.abs(v) > 0.86 && u > 0.1 ? belly : back);
        if (u < 0.84) {
          const zl = 2.2 + u * 1.2 - v * v * 1.2;                                  // (the lower jaw, white, shorter than the snout)
          m.box(x, cy + y, 0, x + 1, cy + y + 1, zl, belly);
          if (u > 0.1 && Math.abs(v) < 0.82 && zu > zl + 0.6) m.box(x, cy + y, zl, x + 1, cy + y + 1, zu, mouth);
        }
      }
      // teeth: a row along each jaw's edge, every other px, longer at the front
      if (u > 0.16 && u < 0.97 && (x & 1)) for (const sd of [-1, 1]) {
        const yy = cy + sd * hw * 0.84, zt = rise + 8 - 0.7 * 3.2, zu = zt - th * 0.83;
        m.box(x, yy - 0.5, zu - 1.6 - u, x + 1, yy + 0.5, zu, teeth);
        if (u < 0.82) m.box(x, yy - 0.5, 2 + u * 1.2, x + 1, yy + 0.5, 3.4 + u * 1.6, teeth);
      }
    }
    for (const sd of [-1, 1]) {
      m.box(O + 86, cy + sd * 10 - 0.6, 11.2, O + 88, cy + sd * 10 + 0.6, 12.8, eye);
      for (let g = 0; g < 3; g++) m.box(O + 69 + g * 3, cy + sd * 12.2 - 0.3, 5.5, O + 70 + g * 3, cy + sd * 12.2 + 0.3, 9.5, dark);   // (gill slits)
    }
  }
  m.smooth = 1;
  patchHidden(m);
  return m;
}

export function animalModel(kind, o = {}) {
  const [baseKind, variant] = String(kind).split(':');
  if (baseKind === 'shark') { const p0 = o.pose || 'stand'; return sharkModel(p0 === 'dead' ? 'dead' : p0 === 'bite' || p0 === 'swipe' || p0 === 'attack' ? 'bite' : 'swim', o.phase || 0); }
  let A = ANIMALS[baseKind] || ANIMALS.golden;
  if (variant === 'y') A = youngOf(A, baseKind);
  else if (variant === 'L') A = legendOf(A);
  // (a horse in the game is client/art2/horse.js's own model - game/actors.js; this rig's is its stand-in)
  const pose0 = o.pose || 'stand';
  if (pose0 === 'float') return floatModel(A);
  if (pose0 === 'rear' || pose0 === 'climb') return pitchUp(animalModel(kind, { ...o, pose: pose0 === 'rear' ? 'stand' : 'alert', phase: 0 }), A, pose0 === 'rear' ? 1.15 : 1.45, pose0 === 'rear');
  if (pose0 === 'dead') return onSide(animalModel(kind, { ...o, pose: 'stand', phase: 0.12 }), A);
  if (pose0 === 'fall') return onSide(animalModel(kind, { ...o, pose: 'stand', gait: 'run', phase: o.phase || 0 }), A);   // (AN7: the legs going as it hits the ground)
  if (pose0 === 'swipe') return flinch(animalModel(kind, { ...o, pose: 'swipeleg' }), A, 0.36);   // (AN2: the bear's swipe)
  if (pose0 === 'catch') return animalModel(kind, { ...o, pose: 'alert', prey: o.prey || 'fish' });   // (Nature-A2: up with its catch)
  if (pose0 === 'wadecatch') return waterline(animalModel(kind, { ...o, pose: 'alert', prey: o.prey || 'fish', wl: A.h * 0.3 }), A, 0.3);
  if (pose0 === 'wadeswipe') return waterline(animalModel(kind, { ...o, pose: 'swipe' }), A, 0.3);
  if (pose0 === 'hit') return flinch(animalModel(kind, { ...o, pose: 'alert', phase: 0 }), A, 0.2);              // (AN7: the flinch)
  if (pose0 === 'swim') return waterline(animalModel(kind, { ...o, pose: 'alert' }), A);
  if (pose0 === 'dive') return waterline(tipDown(animalModel(kind, { ...o, pose: 'stand', phase: 0 }), 0.75), A);   // (AN5: going under)
  if (pose0 === 'wade' || pose0 === 'wadedrink') return waterline(animalModel(kind, { ...o, pose: pose0 === 'wade' ? 'stand' : 'drink', wl: A.h * 0.3 }), A, 0.3);   // (AN5: in the shallows; drinking there)
  const phase = o.phase || 0, run = o.gait === 'run', pose = pose0, down = pose === 'down', lie = pose === 'lie' || down, alert = pose === 'alert', stalk = pose === 'stalk', limp = pose === 'limp', swipe = pose === 'swipeleg', pounce = pose === 'pounce';
  const hk = A.hk || (A.len <= 30 && (!A.jl || A.len < 14) ? 1.2 : 1);            // pets get the chunky big-headed look of A1 (the wild ones true to life, but for a rabbit)
  const L = Math.ceil(A.len * 1.7 + 10 + (A.len <= 30 && !A.jl ? 4 : 0) + (A.antlers ? 8 : 0) + (TAIL_ROOM[A.tail] || 0)), W = Math.ceil(A.w * 2.3 + 12 + (A.antlers >= 2 ? 22 : 0)), Hh = Math.ceil(A.h * 2.2 + 12 + (A.antlers >= 2 ? 16 : 0));
  const m = new Vox(L, W, Hh);
  const cache = new Map();
  const glow = A.legend ? [214, 232, 255, 70] : null;
  // (x: what the art-pixel renderer reads - renderArt: limb a leg, thin a part thinner than an art pixel, pri a feature)
  const R = (c, k = 3, x = null) => { const key = c + k + (x ? JSON.stringify(x) : ''); if (!cache.has(key)) cache.set(key, m.mat({ ramp: ramp(c, 6, 3), k, flag: A.fluffy ? F_LEAF : 0, emi: glow, ...x })); return cache.get(key); };
  const LIMB = { limb: 1, thin: 1 }, THIN = { thin: 1 };
  const base = R(A.coat), belly = A.belly ? R(A.belly, 4) : base;   // (the belly a tone up: in the body's shadow it stays its own colour)
  const patch = A.patch ? R(A.patch) : base, patch2 = A.patch2 ? R(A.patch2) : patch;
  const darkC = A.legend ? '#8a8a96' : '#2a2228';
  const dark = m.mat({ ramp: ramp(darkC, 5, 2), k: 1 }), hoofM = m.mat({ ramp: ramp(darkC, 5, 2), k: 1, limb: 1, thin: 1 });
  // (the features: each its own material, a pixel each in the game's picture - drawn over `as`, the coat under it)
  const feat = (c, flat = 1, x = null) => m.mat({ ramp: ramp(c, 5, 2), k: 1, feat: 1, flat, as: base, ...x });
  // (a cat's nose: its own light pink - the ramp's middle tone, not the darker step every other nose takes, which came out
  // a dark red; the owner, 11-25 15:42: "slightly more light pink, right now its too dark red")
  const nose = feat(A.nose || darkC, A.catFace ? 2 : 1, { min: 1, name: 'nose' }), eyeC = A.legend ? '#6a6a7a' : A.eye || '#1c161c', eyeMin = A.head < 3.6 ? 1 : 2, eyes = [feat(eyeC, A.eye ? 2 : 1, { name: 'eyeL', side: -1, min: eyeMin }), feat(eyeC, A.eye ? 2 : 1, { name: 'eyeR', side: 1, min: eyeMin })];   // (a small head's eye: whatever shows of it)
  const limbOf = new Map(), asLimb = (mt) => { if (!limbOf.has(mt)) limbOf.set(mt, m.mat({ ...m.mats[mt], ...LIMB })); return limbOf.get(mt); };
  const thinOf = new Map(), asThin = (mt) => { if (!thinOf.has(mt)) thinOf.set(mt, m.mat({ ...m.mats[mt], ...THIN })); return thinOf.get(mt); };
  const face = A.face ? R(A.face) : A.mask ? R(A.mask) : base;
  const cy = W / 2, bodyR = A.w / 2 * (A.len <= 30 ? 1.15 : 1), legLen = A.h - bodyR * 1.1;
  const bob = run ? Math.abs(Math.sin(phase * Math.PI * 2)) * 1.5 * (A.hop || 1) : Math.abs(Math.sin(phase * Math.PI * 2)) * 0.5;   // (a rabbit's hop: up off the ground)
  const eatfish = pose === 'eatfish', sit = pose === 'sit' || eatfish, drink = pose === 'drink', graze = pose === 'graze' || drink;
  const x0 = 5 + (A.tail === 'long' || A.tail === 'feather' ? 4 : 2) + (TAIL_ROOM[A.tail] || 0), x1 = x0 + A.len;          // rump .. chest
  const bz = lie ? bodyR * 1.05 + 0.3 : (sit ? A.h * 0.7 : stalk ? (A.h - bodyR) * 0.72 : A.h - bodyR) + bob + (pounce ? A.h * 0.45 : 0);   // (pounce: in the air)
  void legLen;
  // coat pattern
  const coat = (x, y, z) => {
    if (z < bz - bodyR * 0.45 && belly !== base) return belly;
    if (A.pattern === 'spots') { const c = A.len > 40 ? 9 : 3.5; if (hash(Math.floor(x / c), Math.floor(y / c) * 31 + Math.floor(z / c), 7) > (A.len > 40 ? 0.55 : 0.72)) return patch; }
    if (A.pattern === 'saddle' && z > bz + bodyR * 0.1 && x < x1 - 4) return patch;
    if (A.pattern === 'dots' && z > bz - bodyR * 0.8 && (x | 0) % 7 < 4 && (y | 0) % 7 < 4 && (z | 0) % 7 < 4 && hash(((x | 0) / 7) | 0, (((y | 0) / 7) | 0) * 31 + (((z | 0) / 7) | 0), 7) > 0.1) return patch;   // (a dalmatian's: an art pixel each, apart)
    if (A.pattern === 'tabby' && z > bz - bodyR * 0.35 && (((x - x0) % 7) + 7) % 7 < 3) return patch;   // (bands down the flanks, an art pixel wide)
    if (A.pattern === 'calico') { const h = hash(Math.floor((x - (A.tail === 'cat' ? TAIL_ROOM.cat - 4 : 0)) / 6), Math.floor((y + z) / 6), 9);   // (her patches where they were before her tail's room grew, 11-25)
      if (h > 0.72) return patch; if (h < 0.18) return patch2; }
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
    const zc = sit ? bz - (1 - t) * A.h * 0.35 : bz + (t - 0.5) * (1.2 + (A.slope || 0));   // (slope: the withers over the rump - a moose; under it - a black bear)
    const r = bodyR * (1 + (A.fluffy || 0) * 0.12) * (0.82 + 0.25 * Math.sin(t * Math.PI)) * (A.udder ? 1.05 : 1);
    const rz = r * (A.len > 40 ? 1.25 : 1.05) * (1 + (A.arch || 0) * Math.sin(t * Math.PI)) * (A.hump && z > zc ? 1 + A.hump * 0.16 * Math.exp(-(((t - 0.74) / 0.14) ** 2)) : 1);   // (a shoulder hump: a grizzly, a moose)
    const ex = Math.min(t, 1 - t) < 0.15 ? 1 - Math.pow(1 - Math.min(t, 1 - t) / 0.15, 2) * 0.5 : 1;
    const pw = A.bear ? 2.3 : 2;   // (a bear's barrel of a body: a little boxier than an egg)
    return Math.abs((y - cy) / (r * ex)) ** pw + Math.abs((z - zc) / (rz * ex)) ** pw <= 1 ? coat(x, y, z) : -1;
  });
  if (A.udder) m.ell(x0 + A.len * 0.3, cy, bz - bodyR * 1.15, 3, 3, 2, R('#f0b0a8'));
  if (A.mane && !A.hump) for (let x = x0 + 4; x < x1 - 1; x += 0.6) m.box(x, cy - 0.8, bz + bodyR * 0.85, x + 1, cy + 0.8, bz + bodyR * 0.85 + 1.4 + (A.tusks ? 2.6 * Math.exp(-((((x - x0) / A.len - 0.8) / 0.2) ** 2)) : 0), R(A.mane));   // a boar's bristles, a crest over the shoulders
  if (A.haunch && !lie) for (const s of [-1, 1]) m.ell(x0 + A.len * 0.24, cy + s * bodyR * 0.45, bz - bodyR * 0.15, A.len * 0.26, bodyR * 0.5, bodyR * 0.8, base);   // a rabbit's big haunches
  // legs: front pair and back pair, swinging in opposite phase; a sit folds the back legs under
  const legR = Math.max(A.len < 14 ? 1.2 : 1.7, A.w * 0.16 + (A.len > 40 ? 0.8 : 0)) * (A.bear ? 1.35 : 1) * (A.legK || 1);
  const sw = Math.sin(phase * Math.PI * 2) * (run ? 0.75 : 0.4);
  const lo = Math.max(bodyR * 0.62, Math.min(bodyR - 0.5, legR + 1.2));   // (the legs apart: two to see from the front)
  const legs = [[x1 - 3, cy - lo, sw], [x1 - 3, cy + lo, -sw], [x0 + 3, cy - lo, -sw], [x0 + 3, cy + lo, sw]];
  // the wild ones (A.jl, the AN1-AN4 sheets) get jointed legs: a knee bending forward on the forelegs, a hock pointing
  // back on the hind legs, the feet stepping through a stance (planted, sliding back under the body) and a swing
  // (lifted, carried forward). Walking: a four-beat walk (hind, fore, hind, fore); running: a gallop (a rabbit's hop),
  // the forelegs together and the hind legs together, stretched out, then gathered under the body
  const jl = A.jl && !sit && !lie, moving = o.phase != null && !graze;
  const D = run ? 0.38 : stalk ? 0.72 : 0.62, OFF = run ? [0, 0.1, 0.5, 0.6] : [0.25, 0.75, 0, 0.5];
  const stride = A.h * (run ? 1.15 : stalk ? 0.4 : 0.55) * (A.bear ? 0.8 : 1), lift = A.h * (run ? 0.3 : 0.16);
  const lower = asLimb(A.lower ? R(A.lower) : base), hoof = A.hoof ? hoofM : lower, limbBase = asLimb(base);
  legs.forEach(([lx, ly, a], i) => {
    const back = i >= 2;
    if (jl) {
      const top = bz - bodyR * 0.3, L2 = Math.max(top - (pounce ? A.h * 0.45 : 0), (A.h - bodyR) * 0.92 - bodyR * 0.3) * (back ? 1.07 : 1.015) / 2;   // (crouched in a stalk: the legs bend)
      let fx = back ? -0.6 : 0.6, fz = 0;
      if (moving) { const p = (((phase + OFF[i]) % 1) + 1) % 1; if (p < D) fx = stride * (0.5 - p / D); else { const u = (p - D) / (1 - D); fx = stride * (u - 0.5); fz = Math.sin(u * Math.PI) * lift; } }
      if (pounce) { const reach = phase < 0.5; fx = back ? -stride * (reach ? 1.0 : 0.55) : stride * (reach ? 1.05 : 0.6); fz = back ? A.h * (reach ? 0.42 : 0.3) : A.h * (reach ? 0.6 : 0.3); }   // (AN4: stretched out, then gathering to land)
      if (swipe && i === 1) { const up = phase < 0.5; fx = stride * (up ? 0.25 : 1.15); fz = A.h * (up ? 0.62 : 0.4); }   // (AN2: the paw up, then raking forward)
      if (drink && !back) fx = stride * (i === 0 ? 0.62 : -0.28);   // (AN5: drinking, the forelegs splayed)
      if (limp && i === 1) { fx = stride * 0.12; fz = A.h * 0.22 + Math.sin(phase * Math.PI * 2) * 0.6; }   // (AN7: the hurt foreleg held up, dangling)
      const dx = fx, dz = fz - top, d = Math.max(0.5, Math.min(L2 * 1.995, Math.hypot(dx, dz))), th = Math.atan2(dz, dx), al = Math.acos(Math.min(1, d / (2 * L2)));
      const kx = lx + Math.cos(th + (back ? -al : al)) * L2, kz = top + Math.sin(th + (back ? -al : al)) * L2;
      const seg = (x0s, z0s, x1s, z1s, r0, r1, mt) => { const n = Math.ceil(Math.hypot(x1s - x0s, z1s - z0s) * 2) + 1; for (let k = 0; k <= n; k++) { const t = k / n, x = x0s + (x1s - x0s) * t, z = z0s + (z1s - z0s) * t, r = r0 + (r1 - r0) * t; m.box(x - r, ly - r, Math.max(0, z - 0.5), x + r, ly + r, Math.max(0, z) + 0.6, mt); } };
      const sl = A.hoof && !A.hump ? 0.82 : 1;   // (a deer's, an elk's, a boar's slender legs)
      seg(lx, top + legR, kx, kz, legR * (back ? 1.6 : 1.3) * (A.bear ? 0.8 : 1) * sl, legR * 0.85 * sl, limbBase);   // (the thigh, the forearm)
      seg(kx, kz, lx + fx, fz + 0.6, legR * 0.8 * sl, legR * 0.7 * sl, lower);                // (the cannon, the shin)
      m.box(lx + fx - legR * 0.8, ly - legR * 0.8, fz, lx + fx + legR + 0.6, ly + legR * 0.8, fz + 1.2, hoof);   // (a hoof or a paw)
      return;
    }
    if (sit && back) { m.ell(lx + 2, ly, 2.5, 4, legR + 1, 2.5, coat(lx, ly, 3)); return; }
    if (lie) {                                                             // front paws out in front, haunches folded beside the rump
      if (back) m.ell(lx + 3, ly + (ly < cy ? -1 : 1), legR + 1, A.len * 0.18, legR + 1.2, legR + 0.8, coat(lx, ly, 2));
      else for (let s2 = 0; s2 < A.h * 0.55; s2 += 0.5) m.box(lx + s2 - 1, ly - legR, 0, lx + s2 + 1, ly + legR, legR * 1.8, s2 > A.h * 0.45 ? (A.legC ? R(A.legC) : A.socks ? R(A.socks) : belly) : coat(lx + s2, ly, 1));
      return;
    }
    const top = bz - bodyR * 0.3, len = top;
    for (let s = 0; s <= len; s += 0.5) {
      const t = s / len, bend = back ? Math.sin(t * Math.PI) * 1.2 : 0;
      const x = lx + Math.sin(a) * s - bend, z = top - Math.cos(a) * s;
      if (z < 0) break;
      const sock = A.legC && z < bz - bodyR * 0.75 ? R(A.legC) : A.socks && t > 0.7 ? R(A.socks) : (A.cat || A.len <= 30) && t > 0.85 ? belly : t > 0.9 ? dark : coat(x, ly, z);
      m.box(x - legR, ly - legR, Math.max(0, z), x + legR, ly + legR, Math.max(0, z) + 1, asLimb(A.len > 40 && t > 0.92 ? dark : sock));
    }
  });
  // neck and head
  const neck = A.neck || A.head * 0.9;
  const HD = A.head * hk, hup = A.hup ?? (hk > 1 ? 1 : 0);   // (hup: the head carried up over the back - the pets of A1)
  const plain = !drink && !graze && !stalk && !down && !lie, hx = (plain ? (A.hfwd || 0) * HD : 0) + x1 + (drink ? 3.5 : graze ? 2 : stalk ? neck * 0.55 : down ? neck * 0.75 : neck * 0.35), hz = drink ? Math.max(HD * 0.55, (o.wl || 0) + HD * 0.4) : graze ? HD + 1 : down ? HD * 0.85 : stalk ? bz + bodyR * 0.2 + neck * 0.3 : bz + bodyR * 0.4 + neck * (lie ? 0.55 : alert ? 0.95 : limp ? 0.3 : 0.75) + (sit ? 2 : 0) + (alert ? 1.5 : 0) + hup * HD * (lie ? 0.25 : limp ? 0.1 : 0.5) - (plain && !alert ? (A.hdrop || 0) * HD : 0);   // (down: the head stretched out on the ground;   // (down: the head stretched out on the ground; limp: hung low)
  const neckC = A.neckC ? R(A.neckC) : null;   // (an elk's dark neck and head)
  for (let s = 0; s <= 1; s += 0.08) { const x = x1 - 2 + (hx - x1 + 2) * s, z = bz + (hz - bz) * s; m.ell(x, cy, z, HD * 0.65, HD * 0.62, HD * 0.7, neckC && s > 0.15 ? neckC : coat(x, cy, z + 2)); }
  if (A.mane && !A.tusks) for (let s = 0; s <= 1; s += 0.05) { const x = x1 - 4 + (hx - x1) * s, z = bz + bodyR + (hz - bz - 2) * s; m.box(x - 1.5, cy - 1, z, x + 1, cy + 1, z + 2.5, R(A.mane)); }
  if (A.throat && !lie) { const x = x1 - 2 + (hx - x1 + 2) * 0.8 + HD * 0.25, z = bz + (hz - bz) * 0.8 - HD * 0.2; m.ell(x, cy, z, HD * 0.5, HD * 0.55, HD * 0.5, R(A.throat)); }   // a deer's white throat
  m.ell(hx + 1, cy, hz, HD * (A.catFace ? 0.88 : 1), HD * (A.catFace ? 1.16 : hk > 1 ? 1.02 : 0.9), HD * (A.catFace ? 0.86 : 0.9), A.headC ? R(A.headC) : A.mask ? base : neckC || coat(hx, cy, hz + 4));
  if (A.cheeks) m.fill((x, y, z) => (x > hx + 1 + HD * 0.1 && z < hz + HD * 0.05 && m.get(x | 0, y | 0, z | 0) ? R(A.cheeks) : -1), Math.floor(hx), Math.floor(cy - HD - 1), Math.floor(hz - HD), Math.ceil(hx + HD + 2), Math.ceil(cy + HD + 1), Math.ceil(hz + HD));   // (a husky's white face under its grey cap)
  if (A.blaze) m.fill((x, y, z) => (x > hx + 1 + HD * 0.3 && z < hz + HD * 0.7 && Math.abs(y - cy) < Math.max(1.1, HD * 0.2) && m.get(x | 0, y | 0, z | 0) ? R(A.blaze) : -1), Math.floor(hx), Math.floor(cy - HD), Math.floor(hz - HD), Math.ceil(hx + HD + 2), Math.ceil(cy + HD), Math.ceil(hz + HD));   // (white up the middle of the face)
  if (A.face) m.ell(hx + 1.5, cy, hz, HD * 0.85, HD * 0.8, HD * 0.85, face);
  if (A.mask) m.box(hx + 1, cy - HD * 0.9, hz, hx + HD, cy + HD * 0.9, hz + 2, face);
  // snout and nose (a moose's long drooping one; a bear's paler muzzle)
  const sx = hx + HD * 0.7, sz = hz - HD * 0.25 - (A.droop ? 1.6 : 0);
  m.ell(sx + A.snout * 0.5, cy, sz, A.snout * 0.7 + 1, HD * (A.droop ? 0.62 : 0.5), HD * (A.droop ? 0.55 : 0.42), A.muzzle ? R(A.muzzle) : A.mask ? R('#d8d4d0') : A.belly && !A.cat && !A.legend ? belly : coat(sx, cy, sz));
  if (!A.catFace) m.box(sx + A.snout + 0.5, cy - 1, sz, sx + A.snout + 1.8, cy + 1, sz + 1.5, nose);
  else m.box(sx + A.snout + 0.3, cy - 0.7, sz - 1.5, sx + A.snout + 1.3, cy + 0.7, sz - 0.4, nose);   // (a cat's: small, pink, low on the face under the eyes - 11-25, the owner: "a cuter face ... the dog ... has a nose"; on 11-21 one level with an eye read as a second eye)
  if (eatfish) {   // (AN5: the fish crosswise in its jaws, silver, the tail fin out to one side, a bite gone - wag: the chewing)
    const fx = sx + A.snout * 0.55, fz = sz - HD * 0.35 - (o.wag || 0) * 0.6;
    m.ell(fx, cy + 1, fz, 1.7, 4.8, 1.6, R('#dce6ee')); m.ell(fx, cy + 1, fz + 0.9, 1.2, 4.4, 0.7, R('#5a7a8c'));
    m.box(fx - 1, cy + 5.4, fz - 1.8, fx + 1, cy + 6.8, fz + 1.8, R('#5a7a8c'));
  }
  if (o.prey && !eatfish) {   // (Nature-A2: a salmon crosswise in a bear's jaws, its tail flapping; a mouse in a fox's)
    const fx = sx + A.snout * 0.7, fz = sz - HD * 0.3, big = A.len > 30 ? 1.5 : 1;
    if (o.prey === 'fish') {
      m.ell(fx, cy + 1, fz, 1.9 * big, 5.4 * big, 1.7 * big, R('#c8a8a2')); m.ell(fx, cy + 1, fz + 1 * big, 1.3 * big, 4.8 * big, 0.7 * big, R('#5a6a74'));
      m.box(fx - 1.2 * big, cy + 6 * big, fz - 2 * big + (o.wag || 0) * 0.8, fx + 1.2 * big, cy + 7.4 * big, fz + 2 * big + (o.wag || 0) * 0.8, R('#5a6a74'));
    } else {
      m.ell(fx + 0.4, cy + 1.2, fz - 0.4, 1.7, 1.1, 1.1, R('#7a6a5e'));
      for (let k = 0; k < 3.5; k += 0.5) m.box(fx + 0.2, cy + 2.2 + k, fz - 0.8 - k * 0.3, fx + 0.7, cy + 2.7 + k, fz - 0.4 - k * 0.3, R('#c8a8a0'));
    }
  }
  if (A.tusks) for (const s of [-1, 1]) for (let k = 0; k < 2.6; k += 0.4) m.box(sx + A.snout * 0.55 - k * 0.3, cy + s * 1.6, sz + k * 0.7 - 0.6, sx + A.snout * 0.55 - k * 0.3 + 0.9, cy + s * 1.6 + 0.9, sz + k * 0.7 + 0.3, R('#f0ead8', 3, THIN));   // a boar's tusks
  if (A.buck) m.box(sx + A.snout + 0.2, cy - 0.8, sz - HD * 0.45, sx + A.snout + 1.2, cy + 0.8, sz - HD * 0.1, R('#e08a2a'));   // a beaver's orange teeth
  if (A.bell) m.ell(hx - 0.5, cy, hz - HD * 0.95, 1.1, 0.9, 2.6, coat(hx, cy, hz));   // a moose's bell
  // eyes
  { const HY = HD * (A.catFace ? 1.16 : hk > 1 ? 1.02 : 0.9), ef = A.eyeF ?? (A.catFace ? 0.46 : 0.54), es = A.eyeS ?? 0.5, eh = A.eyeH ?? 0.2, q = Math.max(1, HD * 0.25);
    for (const s of [-1, 1]) { const ex = hx + 1 + HD * ef, ey = cy + s * HY * es, ez = hz + HD * 0.9 * eh; m.box(Math.round(ex - q), Math.round(ey - q), Math.round(ez - 1), Math.round(ex + q), Math.round(ey + q), Math.round(ez + 1), eyes[s < 0 ? 0 : 1]); } }   // (whole voxels: the two the same either side)
  if (A.tongue && o.pant) m.box(sx + A.snout * 0.4, cy - 1, sz - HD * 0.55, sx + A.snout * 0.4 + 2, cy + 1, sz - HD * 0.1, feat('#e0607a', 2, { min: 1 }));
  // ears (each big enough for an art pixel or two; the hanging ones a shade off the coat, so they stand off the head)
  const HY = HD * (A.catFace ? 1.16 : hk > 1 ? 1.02 : 0.9), flopC = A.earC ? R(A.earC, 3, THIN) : A.pattern === 'saddle' ? asThin(patch) : R(darker(A.coat, 0.8), 3, THIN);
  for (const s of [-1, 1]) {
    const ey = cy + s * HY * (A.catFace ? 0.74 : 0.62), ez = hz + HD * 0.62, ex = hx - HD * 0.1;   // (a cat's set wide: two triangles with the crown between them)
    const ear = A.earC ? flopC : A.ears === 'tufted' ? R(A.coat, 3, THIN) : asThin(A.ears === 'cat' || A.ears === 'up' || A.ears === 'big' ? coat(ex, ey, ez + 3) : A.pattern === 'saddle' ? patch : coat(ex, ey, ez));
    if (A.ears === 'up' || A.ears === 'cat' || A.ears === 'big' || A.ears === 'tufted') {
      const eh = Math.max(3, HD * (A.ears === 'big' ? 1.25 : A.ears === 'up' ? 0.95 : A.catFace ? 1.15 : 0.8)), br = Math.max(1.5, HD * (A.ears === 'big' ? 0.5 : A.catFace ? 0.52 : 0.4));
      for (let k = 0; k < eh; k += 0.5) { const r = (1 - k / eh) * br; m.ell(ex, ey + s * 0.2 * k, ez - 0.6 + k, r * 0.7 + 0.5, r + 0.4, 0.6, ear); }
      if (A.ears === 'tufted') m.box(ex - 0.5, ey + s * 0.8 - 0.5, ez + eh - 0.2, ex + 0.5, ey + s * 0.8 + 0.5, ez + eh + 0.8, R('#4a3a2c', 3, THIN));
    }
    else if (A.ears === 'round') m.ell(ex - 0.4, cy + s * HY * 0.7, hz + HD * 0.8, 1.6, 1.4, 1.7, ear);   // a bear's round ears
    else if (A.ears === 'tiny') m.ell(ex - 0.4, cy + s * HD * 0.7, hz + HD * 0.55, 0.8, 0.7, 0.7, ear);
    else if (A.ears === 'rabbit') for (let k = 0; k < 6; k += 0.5) m.ell(ex - k * 0.3, ey, ez + k, 0.9, 0.8, 0.6, ear);
    else if (A.ears === 'side') m.ell(ex, cy + s * (HY + 1.2), hz + HD * 0.3, 1.3, 1.7, 0.9, ear);
    else { const lg = A.ears === 'long'; m.ell(hx - HD * 0.25, cy + s * (HY + 0.2), hz - HD * (lg ? 0.3 : 0.05), HD * 0.5, 1.4, HD * (lg ? 0.95 : 0.72), flopC); }   // (hanging down the side of the head)
  }
  if (A.horns === 'black' || A.horns === 'nub') for (const s of [-1, 1]) for (let k = 0; k < (A.horns === 'nub' ? 1.2 : 7.5); k += 0.4) m.ell(hx - k * 0.75 - (k > 3 ? (k - 3) * 0.4 : 0), cy + s * HD * 0.35, hz + HD * 0.7 + k * 0.85, 0.95, 0.95, 0.9, A.legend ? R('#e8d8a8', 3, THIN) : R('#2a262c', 3, THIN));   // a mountain goat's black daggers, curving back
  else if (A.horns) for (const s of [-1, 1]) for (let k = 0; k < 4; k += 0.5) m.ell(hx - (A.horns === 'back' ? k * 0.8 : 0), cy + s * (HD * 0.4 + (A.horns === 'short' ? k * 0.5 : 0)), hz + HD * 0.7 + k * 0.6, 0.95, 0.95, 0.9, R('#d8ccb0', 3, THIN));
  const tine = A.legend ? R('#ecdcae', 3, THIN) : R('#c8b48a', 3, THIN);
  if (A.antlers === 1) for (const s of [-1, 1]) for (let u = 0; u <= 1; u += 0.04) {   // (the beams sweep back, up and forward in a C, the tines straight up off them: a rack that reads from the side as in AN1)
    const x = hx - 5 * Math.sin(Math.PI * u) + 3 * u, y = cy + s * (HD * 0.5 + Math.sin(u * Math.PI * 0.5) * 6.5), z = hz + HD * 0.6 + u * 10.5;
    m.ell(x, y, z, 0.75, 1.25, 0.7, tine);   // (deep across the line of sight, or the character view's steep look skips it)
    if (Math.abs(u - 0.36) < 0.02 || Math.abs(u - 0.6) < 0.02 || Math.abs(u - 0.84) < 0.02) for (let t = 0; t < 3.5; t += 0.5) m.ell(x - 0.2, y, z + t, 0.6, 1.1, 0.6, tine);
  }
  if (A.antlers === 2) for (const s of [-1, 1]) {   // an elk's rack: long beams sweeping back, the tines forward
    for (let k = 0; k <= 17; k += 0.5) {
      const x = hx - k * 0.62 - (k > 9 ? (k - 9) * 0.6 : 0), y = cy + s * (HD * 0.45 + k * 0.5), z = hz + HD * 0.55 + k * 1.1;
      m.ell(x, y, z, 1.15, 1.1, 1.1, tine);
      if ([2.5, 5.5, 8.5, 11.5, 14.5].includes(k)) for (let t = 0; t < 5; t += 0.5) m.ell(x + t * 0.78, y, z + t * 0.62, 0.85, 0.8, 0.8, tine);
    }
  }
  if (A.antlers === 3) for (const s of [-1, 1]) {   // a moose's palms: out to the side and up, broad and flat, the points its fingers
    const palm = A.legend ? R('#d8c690', 3, THIN) : R('#96703e', 3, THIN), mt = A.legend ? tine : R('#d2aa66', 3, THIN);   // (a moose's: tan, as in AN4)
    for (let k = 0; k < 3; k += 0.5) m.ell(hx - 0.5, cy + s * (HD * 0.5 + k), hz + HD * 0.7 + k * 0.5, 0.9, 0.9, 0.9, mt);
    // the palm: a broad plate leaning out and up like an open hand (u up along it, v front to back), its top edge cut
    // into fingers - from the side the palm and its points, as in AN4
    const by = cy + s * (HD * 0.5 + 2.5), bzz = hz + HD * 0.7 + 1.5, ca = Math.cos(0.95), sa = Math.sin(0.95), vx = hx - 4;
    m.fill((x, y, z) => {
      const dy = (y - by) * s, dz = z - bzz, u = dy * ca + dz * sa, w = -dy * sa + dz * ca, v = x - vx;
      if (u < 0 || u > 12.5 || Math.abs(w) > 1.1) return -1;
      // (the palm sweeps back from the brow: longer behind than in front, its points up off the top edge - the
      // tallest in the middle - and one brow point forward, low)
      if (v > 4 && v < 10.5 && u > 1.2 && u < 3.4) return mt;
      const vb = -(3.5 + Math.min(u, 6) * 1.5), vf = 2.5 + Math.min(u, 6) * 0.75;
      if (v < vb || v > vf) return -1;
      if (u > 6.5) { const f = ((v - vb) % 6 + 6) % 6; return f < 2.6 && u < 12.5 - Math.abs(v + 3) * 0.3 ? mt : -1; }
      return u > 1.8 && u < 5.6 && v > vb + 2 && v < vf - 1.6 ? palm : mt;   // (the palm's hollow a tone darker than its rim and its points)
    }, Math.floor(hx - 18), Math.floor(Math.min(by, by + s * 14) - 1), Math.floor(bzz - 1), Math.ceil(hx + 8), Math.ceil(Math.max(by, by + s * 14) + 1), Math.ceil(bzz + 16));
  }
  if (A.beard) m.ell(sx + A.snout * 0.35, cy, sz - HD * 0.5, 1.5, 1.4, 2, A.muzzle ? R(A.muzzle) : base);
  if (A.collar) { const col = R(A.collar), cx = Math.round(x1 + (hx - x1) * 0.25); for (let z = Math.floor(bz); z < m.h; z++) for (let y = 0; y < W; y++) for (const x of [cx, cx + 1]) { const i = m.idx(x, y, z); if (m.v[i] && z < hz - HD * 0.5) m.v[i] = col; } }
  // tail
  const tx = x0, tz = bz + bodyR * 0.5;
  const tail = (pts, r) => pts.forEach(([dx, dz, dy = 0], i) => m.ell(tx - dx, cy + dy, tz + dz, r(i), r(i), r(i), asThin(A.tail === 'ringed' ? (i % 2 ? R('#2a282c') : base) : A.tailBands && (i >> 1) % 2 ? R(A.tailBands) : A.tailC ? R(A.tailC) : coat(tx - dx, cy, tz + dz + 6))));
  const wag = Math.sin((o.wag ?? phase) * Math.PI * 4) * 1.2;
  // a cat's tail (11-25, the owner: "a little thinner and longer like a cats tail (or variations if we have a long hair
  // cat in the mix vs a short haired cat)"): thin and long - carried up behind with the tip hooked back, or (tailLow)
  // out low behind and curling up at its tip; the long-haired white cat keeps its plume ('feather')
  if (A.tail === 'cat') tail([...Array(30)].map((_, i) => { const u = i / 29; return A.tailLow ? [0.5 + u * 10.5 + wag * 0.3 * u, -1.2 + u * u * u * 8.5, u * 2.5] : [0.6 + u * 4.4 + (u > 0.7 ? (u - 0.7) * 11 : 0) + wag * 0.3 * u, Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.5) * 11 - (u > 0.78 ? (u - 0.78) * 8 : 0), u * 5]; }), () => 0.72);
  else if (A.tail === 'up') tail([...Array(A.tailN || 12)].map((_, i) => [i * 0.45 - wag * 0.25 * (i / 10) * (i / 10) - (i > 7 ? (i - 7) * 0.5 : 0), i * 0.85]), () => 1.25);
  else if (A.tail === 'curl') tail([...Array(10)].map((_, i) => [1.5 - Math.cos(i * 0.6) * 2.4, 2.5 + Math.sin(i * 0.6) * 3]), () => 1.4);
  else if (A.tail === 'down') tail([...Array(9)].map((_, i) => [i * 0.6, -i * 0.7]), () => 1.25);
  else if (A.tail === 'feather' || A.tail === 'bushy') tail([...Array(10)].map((_, i) => [i * 0.8, i * 0.2 - (A.tail === 'bushy' ? i * 0.4 : 0) + wag * (i / 10)]), (i) => 1 + Math.sin(i / 9 * Math.PI) * 1.4);
  else if (A.tail === 'long') tail([...Array(14)].map((_, i) => [i * 0.6, -i * 1.1]), (i) => 1.2 + (i > 6 ? 0.6 : 0));
  else if (A.tail === 'thin') tail([...Array(14)].map((_, i) => [i * 0.25, -i * 1.2]), (i) => (i > 11 ? 1.2 : 0.5));
  else if (A.tail === 'ringed') tail([...Array(12)].map((_, i) => [i * 0.8, -i * 0.3]), () => 1.8);
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

// (the whole-body poses below, for client/art2/horse.js too)
export const REPOSE = { onSide: (m, A) => onSide(m, A), waterline: (m, A, k) => waterline(m, A, k) };
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
// hit (AN7): the flinch - rocked back onto the hind feet, the forehand up off the ground, the head up (round the hind
// feet, nose up by ang; the full length kept)
function flinch(m, A, ang) {
  const px = 5 + (A.tail === 'long' || A.tail === 'feather' ? 4 : 2) + (TAIL_ROOM[A.tail] || 0) + 3, c = Math.cos(ang), s = Math.sin(ang);
  return remap(m, m.w, m.d, Math.ceil(m.h + (m.w - px) * s + 2), (X, Y, Z) => {
    const dx = X - px, x = px + dx * c + Z * s, z = -dx * s + Z * c;
    return x >= 0 && x < m.w && z >= 0 && z < m.h ? [x, Y, z] : null;
  });
}
// diving (AN5): nose down round the chest, so the rump and the tail rise (then cut at the water)
function tipDown(m, ang) {
  const px = m.w * 0.62, c = Math.cos(ang), s = Math.sin(ang);
  return remap(m, m.w, m.d, Math.ceil(m.h + px * s + 2), (X, Y, Z) => {
    const dx = X - px, x = px + dx * c - Z * s, z = dx * s + Z * c;
    return x >= 0 && x < m.w && z >= 0 && z < m.h ? [x, Y, z] : null;
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
function waterline(m, A, k = 0.62) {   // (k: how deep, of the shoulder's height: wading 0.3)
  const cut = Math.max(1, Math.round(A.h * k));
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
  if ((opt.px || 1) > 1 && !opt.plain) return renderArt(m, heading, opt);
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

// The same view at the game's art pixel (opt.px world px a side: 2). One ray per art pixel loses whatever is thinner
// than the pixel - a leg, a tail, an eye - and takes whichever voxel the ray happens to meet, so the picture came out
// as blobs. Here every art pixel looks at each world px under it and decides as a pixel artist would:
//   a thin part (a material's thin: a leg, a tail, an antler, an ear) fills the pixel it only half covers, a body needs half;
//   the material most of the pixel shows, in its average tone - no dither at this size;
//   the limbs on the far side of the body (limb) go a tone darker, so four legs read as four;
//   a feature (feat: an eye, a nose, a tongue - each its own material, drawn over its `as` material) is one art pixel,
//   where the middle of what shows of it lands: an eye is never a smear, and never lost between two pixels; two eyes
//   never touch;
//   the depth lines and the outline as before.
function renderArt(m, heading, opt) {
  const { w, d, h } = m, fy = opt.fy ?? 0.38, S = opt.px | 0, N = S * S;
  const R = Math.ceil(Math.hypot(w, d) / 2) + 2, Ry = Math.ceil(R * fy) + 1, ax = Math.ceil(R / S), ay = Math.ceil((Ry + h) / S);
  const G = new GBuf(2 * ax, ay + Math.ceil((Ry + 2) / S));
  G.ax = ax; G.ay = ay; G.ap = S;
  const c = Math.cos(heading), s = Math.sin(heading), brk = 3.5 + (S - 1) * 2;
  const depth = new Float32Array(G.w * G.h).fill(-1e9), mats = m.mats;
  const hm = new Int32Array(N), hv = new Int32Array(N), ht = new Float32Array(N), hd = new Float32Array(N), hz = new Int32Array(N);
  const rl = Math.hypot(1, 1 / fy), rz = 1 / rl, ry = 1 / fy / rl;   // (a unit step along the line of sight: down rz, away ry)
  const bare = [];   // (pixels of a material with `bare`: a bird's thin legs - drawn without the line round them, or two legs a pixel apart close up into a post)
  const feats = new Map();   // feature material -> [samples, sum x, sum y] in world px of the picture
  for (let py = 0; py < G.h; py++) for (let px = 0; px < G.w; px++) {
    let n = 0, thin = 0;
    for (let k = 0; k < N; k++) {
      const X = (px - ax) * S + (k % S) + 0.5, sy = (py - ay) * S + ((k / S) | 0) + 0.5;
      // (down the line of sight a world px of depth at a time - a step of a whole voxel down skips 1 / fy of depth, and
      // with it whatever is thinner than that from this side: an eye, a leg seen end on)
      for (let zf = h - fy * 0.5; zf > 0; zf -= fy) {
        const Z = zf | 0, Y = (sy + zf) / fy;
        const mx = c * X + s * Y + w / 2, my = -s * X + c * Y + d / 2;
        if (mx < 0 || my < 0 || mx >= w || my >= d) continue;
        const vi = m.idx(mx | 0, my | 0, Z);
        let mt = m.v[vi];
        if (!mt) continue;
        let M = mats[mt];
        // (a feature shows where it is the surface, or just under it: an eye sits where it reads from the front and from
        // the side both - a little inside a round head - and is seen through that much of the coat)
        let fm = M.feat ? mt : 0;
        for (let q = 1; !fm && q <= 4; q++) {   // (2 world px on along the line of sight, in half steps)
          const Zq = zf - q * 0.5 * rz, Yq = Y - q * 0.5 * ry, qx = c * X + s * Yq + w / 2, qy = -s * X + c * Yq + d / 2;
          if (Zq >= 0 && qx >= 0 && qy >= 0 && qx < w && qy < d) { const mq = m.v[m.idx(qx | 0, qy | 0, Zq | 0)]; if (mq && mats[mq].feat) fm = mq; }
        }
        if (fm) { let f = feats.get(fm); if (!f) feats.set(fm, f = [0, 0, 0]); f[0]++; f[1] += px * S + (k % S) + 0.5; f[2] += py * S + ((k / S) | 0) + 0.5; }
        if (M.feat) { mt = M.as; M = mats[mt]; }
        // (the light from the upper left, a little from the front: the coat its own colour over the back and the flank,
        // lit along the upper left, shaded underneath and to the right - clean bands, not the voxels' speckle)
        const nx = m.nx[vi], ny = m.ny[vi], nz = m.nz[vi], wx = c * nx - s * ny, wy = s * nx + c * ny;
        let t = M.k + (nz * 0.5 - wx * 0.45 + wy * 0.15) * 1.5 - 0.2 + (m.ao[vi] - 0.75) * 0.8 + (M.shade ? M.shade(mx, my, Z, vi) : 0);
        if (M.limb && c * (my - d / 2) < -0.75) t -= 1.1;   // (a leg on the far side of the body)
        if (t < 1) t = 1;   // (never the ramp's last tone: on a small sprite its hue shift reads as a red fleck)
        hm[n] = mt; hv[n] = vi; ht[n] = t; hd[n] = Y * fy + zf; hz[n] = Z; n++;
        if (M.thin) thin = 1;
        break;
      }
    }
    if (!n || (n * 2 < N && !thin)) continue;
    // the material most of the pixel shows (a tie: the nearer)
    let best = -1, bc = 0, bd = -1e9;
    for (let i = 0; i < n; i++) {
      let cnt = 0, dm = -1e9;
      for (let j = 0; j < n; j++) if (hm[j] === hm[i]) { cnt++; if (hd[j] > dm) dm = hd[j]; }
      if (cnt > bc || (cnt === bc && dm > bd)) { best = i; bc = cnt; bd = dm; }
    }
    const mt = hm[best], M = mats[mt];
    let t = 0, tn = 0, zz = 0, dd = -1e9, vi = hv[best];
    for (let i = 0; i < n; i++) if (hm[i] === mt) { t += ht[i]; tn++; if (hz[i] > zz) zz = hz[i]; if (hd[i] > dd) { dd = hd[i]; vi = hv[i]; } }
    t /= tn;
    let nx = m.nx[vi], ny = m.ny[vi], nz = m.nz[vi];
    if (!nx && !ny && !nz) nz = 1;
    const R5 = M.ramp, col = R5[Math.max(0, Math.min(R5.length - 1, Math.round(t)))];
    G.put(px, py, col, [c * nx - s * ny, s * nx + c * ny, nz], zz, M.emi, M.flag | (opt.flag || 0));
    depth[py * G.w + px] = dd;
    if (M.bare) bare.push(py * G.w + px);
  }
  for (let py = 1; py < G.h; py++) for (let px = 1; px < G.w - 1; px++) {
    const i = py * G.w + px, j = i * 4;
    if (!G.col[j + 3]) continue;
    const me = depth[i], up = depth[i - G.w], lf = depth[i - 1], rt = depth[i + 1];
    if ((up > -1e8 && up - me > brk) || (lf > -1e8 && lf - me > brk) || (rt > -1e8 && rt - me > brk)) { G.col[j] *= 0.72; G.col[j + 1] *= 0.7; G.col[j + 2] = G.col[j + 2] * 0.75 + 6; }
  }
  // the features, a pixel each (the bigger ones - M.feat 2 - two pixels across when that much of them shows)
  G.feats = [];   // (what was drawn of them: [name, x, y] in the sprite - the tests read it)
  const put = [];
  for (const [mt, f] of feats) {
    const M = mats[mt];
    if (opt.debug) console.log('feat', M.name, f[0], (f[1] / f[0] / S).toFixed(1), (f[2] / f[0] / S).toFixed(1));
    if (f[0] < (M.min || 2) || (M.side && (M.side * c < -0.9 || s < -0.6))) continue;   // (side on, the far eye isn't seen across the nose; from behind, neither)
    put.push([M, Math.floor(f[1] / f[0] / S), Math.floor(f[2] / f[0] / S)]);
  }
  // two eyes seen together never touch: a pixel of face between them, or they read as one dark blob (a small head's
  // eyes land side by side) - each moved out where the head has the room
  const on = (x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h && G.col[(y * G.w + x) * 4 + 3] > 0;
  const eL = put.find((q) => q[0].name === 'eyeL'), eR = put.find((q) => q[0].name === 'eyeR');
  if (eL && eR && Math.abs(eL[2] - eR[2]) <= 1 && Math.abs(eL[1] - eR[1]) < 2) {
    const a = eL[1] <= eR[1] ? eL : eR, b = a === eL ? eR : eL;
    b[2] = a[2];
    if (b[1] - a[1] < 2 && on(b[1] + 1, b[2])) b[1]++;
    if (b[1] - a[1] < 2 && on(a[1] - 1, a[2])) a[1]--;
  }
  for (const [M, qx, py] of put) {
    if (!on(qx, py)) continue;   // (only over the animal itself)
    const j = (py * G.w + qx) * 4, col = M.ramp[Math.min(M.ramp.length - 1, M.flat ?? 1)];
    G.col[j] = col[0]; G.col[j + 1] = col[1]; G.col[j + 2] = col[2];
    G.feats.push([M.name || 'f', qx, py]);
  }
  if (opt.outline !== false) { for (const i of bare) G.col[i * 4 + 3] = 254; G.outline(0.42, true); for (const i of bare) G.col[i * 4 + 3] = 255; }
  return G;
}
