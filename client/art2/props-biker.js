// Art v2 props for the Rusty Spur, the biker roadhouse (MC3, task #366): the burn barrel with its fire, and the pole
// sign by the road with the neon bull skull (lit at night). Each maker returns a Vox, built along +x (voxel.js).
import { Vox } from './voxel.js';
import { ramp } from './palette.js';
import { F_NOCAST, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);

// a rusted oil drum with holes punched round it, a fire roaring out of the top (on: 1 burning)
export function burnBarrel(on = 1) {
  const m = new Vox(16, 16, 34);
  const rust = m.mat({ ramp: R('#7a4428'), k: 3, shade: (x, y, z) => (Math.round(z) % 6 === 0 ? -0.8 : 0) + (hash(Math.round(x), Math.round(z), 5) > 0.72 ? -0.9 : 0) });
  const glow = m.mat({ ramp: R('#f8a030', 5, 3), k: 4, emi: [255, 140, 40, 220 * on], flag: F_NOCAST });
  const fl = m.mat({ ramp: R('#f8a030', 5, 3), k: 4, emi: [255, 150, 50, 255 * on], flag: F_NOCAST });
  const core = m.mat({ ramp: R('#fff0a0', 5, 3), k: 4, emi: [255, 230, 140, 255 * on], flag: F_NOCAST });
  m.cyl('z', 8, 8, 0, 6, 0, 18, rust, 4.8, 0);
  m.cyl('z', 8, 8, 0, 4.8, 0, 2, rust);
  // the punched holes: the fire showing through
  for (let a = 0; a < 6.28; a += 0.9) for (const z of [6, 11]) { const x = 8 + Math.cos(a) * 5.6, y = 8 + Math.sin(a) * 5.6; m.box(x - 0.5, y - 0.5, z, x + 0.5, y + 0.5, z + 1.5, on ? glow : 0); }
  if (on) m.fill((x, y, z) => { const d = Math.hypot(x - 8, y - 8), top = 32 - d * 2.6 + Math.sin(x * 1.4 + y * 0.7) * 3; return z > 12 && z < top && d < 5 ? (d < 2.2 && z < top - 5 ? core : fl) : -1; }, 2, 2, 12, 14, 14, 34);
  m.smooth = 1;
  return m;
}

// a tall timber pole sign by the road: a dark board with the bull skull in neon (horns, the long face, the eyes), lit
// red-orange at night (on: how bright, 0..1)
export function skullSign(on = 1) {
  const m = new Vox(36, 8, 86);
  const wood = m.mat({ ramp: R('#5a3a22'), k: 3, shade: (x, y, z) => (Math.round(x) % 5 === 0 ? -0.6 : 0) });
  const board = m.mat({ ramp: R('#2a2024'), k: 2 });
  const neon = m.mat({ ramp: R('#ff8a5a', 5, 3), k: 4, emi: [255, 80, 40, Math.round(90 + 165 * on)], flag: F_NOCAST });
  const bone = m.mat({ ramp: R('#ecdcc0', 5, 3), k: 3 });
  for (const x of [5, 29]) m.box(x, 3, 0, x + 3, 6, 84, wood);
  m.box(2, 2, 46, 34, 6, 84, board);
  // the skull on the board's face (y = 6): horns sweeping up and out, the face tapering to the snout, two eye holes
  const pts = [];
  for (let t = 0; t <= 1.0001; t += 0.05) { pts.push([18 - 4 - 10 * t, 78 - 8 * t + 12 * t * t]); pts.push([18 + 4 + 10 * t, 78 - 8 * t + 12 * t * t]); }
  for (let z = 52; z <= 74; z++) { const hw = 6 - (74 - z) * 0.17; pts.push([18 - hw, z], [18 + hw, z]); }
  for (let x = 12; x <= 24; x++) pts.push([x, 74]);
  for (let x = 15; x <= 21; x++) pts.push([x, 52]);
  for (const [x, z] of pts) m.box(x - 0.5, 6, z - 0.5, x + 0.5, 7, z + 0.5, neon);
  for (const ex of [15, 21]) m.box(ex - 1, 6, 64, ex + 1, 7, 67, neon);
  m.box(17, 6, 55, 18, 7, 57, bone); m.box(19, 6, 55, 20, 7, 57, bone);
  m.smooth = 1;
  return m;
}
