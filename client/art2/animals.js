// Art v2 animals: one adjustable four-legged rig (voxel model) that makes every dog breed, cat, farm
// animal and wild animal in the A1-A3 targets (docs/art-v2/targets). Models face +x; render them at any
// heading with voxel.js. `phase` (0..1) swings the legs for a walk / trot / run cycle and bobs the body.
//
//   animalModel(kind, { phase, gait: 'walk'|'run', pose: 'stand'|'sit'|'graze' })  -> Vox
import { Vox } from './voxel.js';
import { ramp } from './palette.js';
import { F_LEAF, hash } from './gbuf.js';

// body sizes in world px (an adult is ~42 px tall): len body length, h shoulder height, w body width
export const ANIMALS = {
  golden: { len: 26, h: 16, w: 9, coat: '#d89a44', belly: '#e8b868', ears: 'flop', tail: 'feather', snout: 4, head: 5, fluffy: 1, collar: '#2f5aa8' },
  lab: { len: 26, h: 16, w: 9, coat: '#2c2a2e', ears: 'flop', tail: 'down', snout: 4, head: 5, collar: '#c83030' },
  spaniel: { len: 20, h: 12, w: 8, coat: '#f0ece4', patch: '#8a3a22', pattern: 'saddle', ears: 'long', tail: 'stub', snout: 3, head: 4.5 },
  shepherd: { len: 28, h: 18, w: 9, coat: '#c08840', patch: '#2a2420', pattern: 'saddle', ears: 'up', tail: 'down', snout: 5, head: 5, collar: '#c83030' },
  husky: { len: 26, h: 17, w: 9, coat: '#8a8c94', belly: '#f0ece8', ears: 'up', tail: 'curl', snout: 4, head: 5, fluffy: 1, collar: '#3a6ab0' },
  pitbull: { len: 24, h: 15, w: 11, coat: '#a8683a', belly: '#f0e8dc', ears: 'flop', tail: 'down', snout: 3.5, head: 5.5 },
  bulldog: { len: 20, h: 11, w: 12, coat: '#d8904a', belly: '#f4ece0', ears: 'flop', tail: 'stub', snout: 2, head: 6, collar: '#3a6ab0' },
  chihuahua: { len: 12, h: 8, w: 5, coat: '#e0a050', ears: 'big', tail: 'curl', snout: 2, head: 3.8, collar: '#c83030' },
  terrier: { len: 18, h: 11, w: 7, coat: '#7a7c84', ears: 'flop', tail: 'up', snout: 3, head: 4.2, fluffy: 1, collar: '#3a8a46' },
  dalmatian: { len: 26, h: 17, w: 8, coat: '#f2f0ec', patch: '#26262c', pattern: 'spots', ears: 'flop', tail: 'down', snout: 4, head: 4.8, collar: '#c83030' },
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
  deer: { len: 34, h: 26, w: 10, coat: '#b8743a', belly: '#f0e4cc', ears: 'up', tail: 'stub', snout: 5, head: 5, neck: 10, antlers: 1 },
  rabbit: { len: 10, h: 6, w: 6, coat: '#9a7a5a', belly: '#f0e4d4', ears: 'rabbit', tail: 'puff', snout: 1.5, head: 3.4 },
  raccoon: { len: 18, h: 9, w: 9, coat: '#7a7678', mask: '#26242a', ears: 'cat', tail: 'ringed', snout: 2.5, head: 4 },
  coyote: { len: 26, h: 17, w: 8, coat: '#a8885a', belly: '#e8dcc0', ears: 'up', tail: 'bushy', snout: 5, head: 4.6 },
};

export function animalModel(kind, o = {}) {
  const A = ANIMALS[kind] || ANIMALS.golden;
  const phase = o.phase || 0, run = o.gait === 'run', pose = o.pose || 'stand';
  const L = Math.ceil(A.len * 1.7 + 10), W = Math.ceil(A.w * 2 + 10), Hh = Math.ceil(A.h * 2.2 + 12);
  const m = new Vox(L, W, Hh);
  const cache = new Map();
  const R = (c, k = 3) => { const key = c + k; if (!cache.has(key)) cache.set(key, m.mat({ ramp: ramp(c, 6, 3), k, flag: A.fluffy ? F_LEAF : 0 })); return cache.get(key); };
  const base = R(A.coat), belly = A.belly ? R(A.belly) : base, patch = A.patch ? R(A.patch) : base, patch2 = A.patch2 ? R(A.patch2) : patch;
  const dark = m.mat({ ramp: ramp('#2a2228', 5, 2), k: 1 }), nose = A.nose ? R(A.nose) : dark;
  const face = A.face ? R(A.face) : A.mask ? R(A.mask) : base;
  const cy = W / 2, bodyR = A.w / 2, legLen = A.h - bodyR * 1.1;
  const bob = run ? Math.abs(Math.sin(phase * Math.PI * 2)) * 1.5 : Math.abs(Math.sin(phase * Math.PI * 2)) * 0.5;
  const sit = pose === 'sit', graze = pose === 'graze';
  const x0 = 5 + (A.tail === 'long' || A.tail === 'feather' ? 4 : 2), x1 = x0 + A.len;          // rump .. chest
  const bz = (sit ? A.h * 0.7 : A.h - bodyR) + bob;
  // coat pattern
  const coat = (x, y, z) => {
    if (z < bz - bodyR * 0.45 && belly !== base) return belly;
    if (A.pattern === 'spots') { const c = A.len > 40 ? 9 : 3.5; if (hash(Math.floor(x / c), Math.floor(y / c) * 31 + Math.floor(z / c), 7) > (A.len > 40 ? 0.55 : 0.72)) return patch; }
    if (A.pattern === 'saddle' && z > bz + bodyR * 0.1 && x < x1 - 4) return patch;
    if (A.pattern === 'tabby' && Math.floor(x * 0.9 + Math.sin(z * 0.8) * 1.2) % 3 === 0) return patch;
    if (A.pattern === 'calico') { const h = hash(Math.floor(x / 4), Math.floor((y + z) / 4), 9); if (h > 0.72) return patch; if (h < 0.18) return patch2; }
    return base;
  };
  // body: a stretched ellipsoid, the chest a little deeper; sitting tilts the back down
  m.fill((x, y, z) => {
    const t = (x - x0) / (x1 - x0);
    if (t < 0 || t > 1) return -1;
    const zc = sit ? bz - (1 - t) * A.h * 0.35 : bz + (t - 0.5) * 1.2;
    const r = bodyR * (1 + (A.fluffy || 0) * 0.12) * (0.82 + 0.25 * Math.sin(t * Math.PI)) * (A.udder ? 1.05 : 1);
    const rz = r * (A.len > 40 ? 1.25 : 1.05);
    const ex = Math.min(t, 1 - t) < 0.15 ? 1 - Math.pow(1 - Math.min(t, 1 - t) / 0.15, 2) * 0.5 : 1;
    return ((y - cy) / (r * ex)) ** 2 + ((z - zc) / (rz * ex)) ** 2 <= 1 ? coat(x, y, z) : -1;
  });
  if (A.udder) m.ell(x0 + A.len * 0.3, cy, bz - bodyR * 1.15, 3, 3, 2, R('#f0b0a8'));
  // legs: front pair and back pair, swinging in opposite phase; a sit folds the back legs under
  const legR = Math.max(1.1, A.w * 0.13 + (A.len > 40 ? 0.8 : 0));
  const sw = Math.sin(phase * Math.PI * 2) * (run ? 0.75 : 0.4);
  const legs = [[x1 - 3, cy - bodyR * 0.55, sw], [x1 - 3, cy + bodyR * 0.55, -sw], [x0 + 3, cy - bodyR * 0.55, -sw], [x0 + 3, cy + bodyR * 0.55, sw]];
  legs.forEach(([lx, ly, a], i) => {
    const back = i >= 2;
    if (sit && back) { m.ell(lx + 2, ly, 2.5, 4, legR + 1, 2.5, coat(lx, ly, 3)); return; }
    const top = bz - bodyR * 0.3, len = top;
    for (let s = 0; s <= len; s += 0.5) {
      const t = s / len, bend = back ? Math.sin(t * Math.PI) * 1.2 : 0;
      const x = lx + Math.sin(a) * s - bend, z = top - Math.cos(a) * s;
      if (z < 0) break;
      const sock = A.socks && t > 0.7 ? R(A.socks) : (A.cat || A.len < 20) && t > 0.85 ? belly : t > 0.9 ? dark : coat(x, ly, z);
      m.box(x - legR, ly - legR, Math.max(0, z), x + legR, ly + legR, Math.max(0, z) + 1, A.len > 40 && t > 0.92 ? dark : sock);
    }
  });
  // neck and head
  const neck = A.neck || A.head * 0.9;
  const hx = x1 + (graze ? 2 : neck * 0.35), hz = graze ? A.head + 1 : bz + bodyR * 0.4 + neck * 0.75 + (sit ? 2 : 0);
  for (let s = 0; s <= 1; s += 0.08) { const x = x1 - 2 + (hx - x1 + 2) * s, z = bz + (hz - bz) * s; m.ell(x, cy, z, A.head * 0.65, A.head * 0.62, A.head * 0.7, coat(x, cy, z + 2)); }
  if (A.mane) for (let s = 0; s <= 1; s += 0.05) { const x = x1 - 4 + (hx - x1) * s, z = bz + bodyR + (hz - bz - 2) * s; m.box(x - 1.5, cy - 1, z, x + 1, cy + 1, z + 2.5, R(A.mane)); }
  m.ell(hx + 1, cy, hz, A.head, A.head * 0.9, A.head * 0.9, A.mask ? base : coat(hx, cy, hz + 4));
  if (A.face) m.ell(hx + 1.5, cy, hz, A.head * 0.85, A.head * 0.8, A.head * 0.85, face);
  if (A.mask) m.box(hx + 1, cy - A.head * 0.9, hz, hx + A.head, cy + A.head * 0.9, hz + 2, face);
  // snout and nose
  const sx = hx + A.head * 0.7, sz = hz - A.head * 0.25;
  m.ell(sx + A.snout * 0.5, cy, sz, A.snout * 0.7 + 1, A.head * 0.5, A.head * 0.42, A.mask ? R('#d8d4d0') : A.belly && !A.cat ? belly : coat(sx, cy, sz));
  m.box(sx + A.snout + 0.5, cy - 1, sz, sx + A.snout + 1.8, cy + 1, sz + 1.5, nose);
  // eyes
  for (const s of [-1, 1]) m.box(hx + A.head * 0.55, cy + s * A.head * 0.45 - 0.5, hz + A.head * 0.15, hx + A.head * 0.55 + 1, cy + s * A.head * 0.45 + 0.5, hz + A.head * 0.15 + 1, dark);
  // ears
  for (const s of [-1, 1]) {
    const ey = cy + s * A.head * 0.6, ez = hz + A.head * 0.6, ex = hx - A.head * 0.1;
    const ear = A.ears === 'cat' || A.ears === 'up' || A.ears === 'big' ? coat(ex, ey, ez + 3) : A.pattern === 'saddle' ? patch : coat(ex, ey, ez);
    if (A.ears === 'up' || A.ears === 'cat' || A.ears === 'big') { const eh = A.ears === 'big' ? 4 : A.ears === 'cat' ? 2.5 : 3.5; for (let k = 0; k < eh; k += 0.5) { const r = (1 - k / eh) * (A.ears === 'big' ? 2 : 1.4); m.ell(ex, ey + s * 0.3 * k, ez + k, r + 0.3, r, 0.6, ear); } }
    else if (A.ears === 'rabbit') for (let k = 0; k < 6; k += 0.5) m.ell(ex - k * 0.3, ey, ez + k, 0.9, 0.8, 0.6, ear);
    else if (A.ears === 'side') m.ell(ex, cy + s * (A.head + 1.2), hz + A.head * 0.3, 1.2, 1.6, 0.8, ear);
    else { const len = A.ears === 'long' ? 5 : 3; for (let k = 0; k < len; k += 0.5) m.ell(ex, ey + s * 0.6, ez - k, 1.4, 1, 0.7, ear); }
  }
  if (A.horns) for (const s of [-1, 1]) for (let k = 0; k < 4; k += 0.5) m.ell(hx - (A.horns === 'back' ? k * 0.8 : 0), cy + s * (A.head * 0.4 + (A.horns === 'short' ? k * 0.5 : 0)), hz + A.head * 0.7 + k * 0.6, 0.7, 0.7, 0.6, R('#d8ccb0'));
  if (A.antlers) for (const s of [-1, 1]) for (let k = 0; k < 8; k += 0.5) { const tine = k > 3 && Math.round(k) % 2 === 0 ? 1.5 : 0; m.ell(hx - k * 0.3 - tine, cy + s * (A.head * 0.5 + k * 0.5), hz + A.head * 0.6 + k, 0.6, 0.6, 0.6, R('#c8b48a')); }
  if (A.beard) m.ell(sx, cy, sz - A.head * 0.6, 0.8, 0.8, 1.5, base);
  if (A.collar) { const col = R(A.collar), cx = Math.round(x1 + (hx - x1) * 0.25); for (let z = Math.floor(bz); z < m.h; z++) for (let y = 0; y < W; y++) for (const x of [cx, cx + 1]) { const i = m.idx(x, y, z); if (m.v[i] && z < hz - A.head * 0.5) m.v[i] = col; } }
  // tail
  const tx = x0, tz = bz + bodyR * 0.5;
  const tail = (pts, r) => pts.forEach(([dx, dz], i) => m.ell(tx - dx, cy, tz + dz, r(i), r(i), r(i), A.tail === 'ringed' ? (i % 2 ? R('#2a282c') : base) : coat(tx - dx, cy, tz + dz + 6)));
  const wag = Math.sin(phase * Math.PI * 4) * 1.2;
  if (A.tail === 'up') tail([...Array(10)].map((_, i) => [i * 0.3, i * 0.9]), () => 0.9);
  else if (A.tail === 'curl') tail([...Array(10)].map((_, i) => [1.5 - Math.cos(i * 0.6) * 2, 2 + Math.sin(i * 0.6) * 2.5]), () => 1);
  else if (A.tail === 'down') tail([...Array(9)].map((_, i) => [i * 0.6, -i * 0.7]), () => 0.9);
  else if (A.tail === 'feather' || A.tail === 'bushy') tail([...Array(10)].map((_, i) => [i * 0.8, i * 0.2 - (A.tail === 'bushy' ? i * 0.4 : 0) + wag * (i / 10)]), (i) => 1 + Math.sin(i / 9 * Math.PI) * 1.4);
  else if (A.tail === 'long') tail([...Array(14)].map((_, i) => [i * 0.6, -i * 1.1]), (i) => 1.2 + (i > 6 ? 0.6 : 0));
  else if (A.tail === 'thin') tail([...Array(14)].map((_, i) => [i * 0.25, -i * 1.2]), (i) => (i > 11 ? 1.2 : 0.5));
  else if (A.tail === 'ringed') tail([...Array(12)].map((_, i) => [i * 0.8, -i * 0.3]), () => 1.4);
  else if (A.tail === 'puff') m.ell(tx - 1, cy, tz, 1.6, 1.6, 1.6, R('#f2ece4'));
  else tail([[0, 0], [0.8, 0.4]], () => 1);
  m.smooth = 1;
  return m;
}
