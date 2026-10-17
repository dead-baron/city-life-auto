// Art v2: the El (World v3's main line up on its steel viaduct over Midtown's Trestle Street - the owner's RW1/RW2,
// OS27): the voxel parts the chunk bake stands under and beside the deck (game/statics.js addEl paints the deck and
// its inclines itself).
//   elPier(Z, span)     a steel bent: two riveted columns on the pavements either side of the street, a cap girder
//                       across under the deck (span along y, the column centres span apart; Z the deck's top)
//   elStairs(len, Z)    a station's stair tower: a straight steel stair from the pavement up to the deck along x, its
//                       stringers, treads, handrails, a landing at the top under a small canopy, a lit sign box
import { Vox } from './voxel.js';
import { ramp } from './palette.js';
import { F_NOCAST, F_THIN, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);
const STEEL = '#3e5a54';   // the El's painted steel: a dark green-grey (RW1)

export function elPier(Z = 128, span = 300) {
  const W = 18, D = span + W + 8, H = Z - 18;
  const m = new Vox(W, D, H);
  const st = m.mat({ ramp: R(STEEL), k: 3, shade: (x, y, z) => (Math.round(z) % 24 === 0 ? -1.2 : 0) + (hash(Math.round(y / 4), Math.round(z / 4), 7) > 0.92 ? 0.8 : 0) });
  const base = m.mat({ ramp: R('#9a968c'), k: 3 });
  const y0 = 4, y1 = 4 + span;
  for (const yc of [y0, y1]) {
    m.box(1, yc - 1, 0, W - 1, yc + W + 1, 6, base);              // the footing
    m.box(3, yc + 1, 6, W - 3, yc + W - 1, H - 10, st);            // the column
    m.box(2, yc, H - 22, W - 2, yc + W, H - 10, st);               // its knee
  }
  m.box(1, y0, H - 10, W - 1, y1 + W, H, st);                      // the cap girder under the deck
  for (let y = y0 + 14; y < y1; y += 22) m.box(1, y, H - 12, W - 1, y + 2, H - 10, st);   // (its stiffeners)
  return m;
}

export function elStairs(len = 150, Z = 128, on = 1) {
  const W = 44, H = Z + 40;
  const m = new Vox(len + 20, W, H);
  const st = m.mat({ ramp: R(STEEL), k: 3 }), tread = m.mat({ ramp: R('#8a8a84'), k: 3, shade: (x) => (Math.round(x) % 6 === 0 ? -1.4 : 0) });
  const rail = m.mat({ ramp: R('#2e3e3a'), k: 3, flag: F_THIN });
  const roof = m.mat({ ramp: R('#5a6a66'), k: 3 }), lamp = m.mat({ ramp: R('#f8f0d0', 5, 3), k: 4, emi: [255, 236, 190, 60 + on * 180], flag: F_NOCAST });
  const sign = m.mat({ ramp: R('#1c4a8a'), k: 3, emi: [120, 170, 255, 40 + on * 140], shade: (x, y, z) => (Math.hypot(x - 10, z - (H - 14)) < 4 ? 3 : 0) });
  for (let x = 0; x < len; x++) {
    const z = Math.round((x / len) * (Z - 4));
    m.box(x, 6, Math.max(0, z - 5), x + 1, W - 6, z + 1, tread);           // the treads
    for (const y of [3, W - 6]) m.box(x, y, Math.max(0, z - 12), x + 1, y + 3, z + 2, st);   // the stringers
    if (x % 3 === 0) for (const y of [3, W - 6]) m.box(x, y + 1, z + 2, x + 1, y + 2, z + 18, rail);   // the balusters
    for (const y of [3, W - 6]) m.box(x, y, z + 17, x + 1, y + 3, z + 19, rail);            // the handrails
  }
  // the posts under the flight, the landing at the top, its canopy and lamp
  for (const x of [Math.round(len * 0.35), Math.round(len * 0.7)]) { const z = Math.round((x / len) * (Z - 4)); for (const y of [4, W - 8]) m.box(x, y, 0, x + 4, y + 4, z - 10, st); }
  m.box(len - 4, 2, Z - 6, len + 20, W - 2, Z, tread);
  for (const y of [2, W - 6]) m.box(len + 16, y, 0, len + 20, y + 4, Z + 30, st);
  m.box(len - 10, 0, Z + 30, len + 20, W, Z + 34, roof);
  m.box(len + 2, W / 2 - 3, Z + 27, len + 12, W / 2 + 3, Z + 30, lamp);
  m.box(0, W / 2 - 8, 0, 4, W / 2 + 8, 10, st);                               // (the foot's newel)
  m.box(8, W / 2 - 2, 0, 12, W / 2 + 2, 44, st); m.box(2, W / 2 - 10, 44, 20, W / 2 + 10, 64, sign);   // the sign box on its post at the foot
  return m;
}
