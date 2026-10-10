// Art v2 game birds (shared/fauna.js): quail, pheasants, wild turkeys, mallards and Canada geese - one small voxel
// rig, drawn like the four-legged animals (animals.js renderUpright, the character view) so they turn to any of the
// eight headings. Sizes in world px (a person stands ~42): a quail is ~9 px long, a goose ~18 with its neck up.
// Models face +x.
//
//   birdModel(kind, { phase, gait: 'walk'|'run', pose })  -> Vox
//     pose: 'stand' | 'peck' (head down at the ground) | 'alert' (neck up, stretched) | 'fly' (wings spread, phase
//     the wingbeat: 0 up, 0.5 down) | 'swim' (sat on the water, no legs) | 'dead' (on its side, a wing out)
//     kind may carry a variant: ':y' the chicks (quail chicks, poults, ducklings, goslings: small, fluffy, downy
//     colours), ':L' the legendary pure white one (a faint glow)
import { Vox } from './voxel.js';
import { patchHidden } from './vehicles.js';
import { ramp } from './palette.js';
import { F_LEAF } from './gbuf.js';

// len body length, w width, h body height, leg leg length, neck, head (radius), bill length (flat: a duck's bill),
// tail 'short' | 'long' (a pheasant's barred streamer) | 'fan' (a turkey's broad tail); colours: body (the flanks),
// back, belly, breast, head, neckC, ring (a white neck ring), chin (a goose's white chinstrap), wattle (red skin),
// plume (a quail's topknot), billC, feet, bars (light bars on the wings and tail)
export const BIRDS = {
  // (the quail of AN8: the cock blue-grey with the black face in its white border, a chestnut cap, the scaled belly and
  // the comma of a topknot; the hen 'quail:f' plain brown and scaled, a smaller topknot)
  quail: { len: 10.5, w: 7.5, h: 9, tilt: 0.18, leg: 2.6, neck: 6.5, head: 3, bill: 0.9, tail: 'short', body: '#66748c', back: '#5e5e66', belly: '#d8c49a', breast: '#6a7a94', head: '#3e3a46', face: '#16121a', stripe: '#f4f2ec', crown: '#8a4a28', plume: 1, scales: '#3e3430', feet: '#c87a3a' },
  pheasant: { len: 12, w: 6, h: 7, leg: 3.6, neck: 3.6, head: 2.4, bill: 1.1, tail: 'long', body: '#b8642a', back: '#8a5a30', belly: '#6a3a1e', breast: '#c8742e', head: '#2a6a4a', ring: '#f2f0ea', wattle: '#d03a2a', bars: '#e0b070', feet: '#8a7a6a' },
  turkey: { len: 20, w: 11, h: 12, leg: 7, neck: 8.5, head: 2.6, bill: 1.2, tail: 'fan', body: '#4a3a30', back: '#5e4c38', belly: '#2e2620', breast: '#3e3028', head: '#a8bce0', neckC: '#c84a3a', wattle: '#c8302a', bars: '#d8c098', feet: '#9a7468' },
  duck: { len: 12, w: 7, h: 6, leg: 2.4, neck: 3.4, head: 2.6, bill: 2.4, flat: 1, tail: 'short', body: '#a8a8a4', back: '#7a705e', belly: '#d8d4cc', breast: '#7a3e2a', head: '#2a6a3e', ring: '#f2f0ea', billC: '#e0c040', feet: '#e08a2a', stern: '#26242a' },
  goose: { len: 18, w: 9, h: 8, leg: 4, neck: 9, head: 2.8, bill: 2.6, flat: 1, tail: 'short', body: '#8a7a68', back: '#6e6050', belly: '#e8e2d8', breast: '#b8ae9e', head: '#1e1c20', neckC: '#1e1c20', chin: '#f2f0ea', billC: '#26242a', feet: '#26242a' },
};
const CHICK = { quail: ['#c8a878', '#8a6a48'], pheasant: ['#c8a070', '#8a6a48'], turkey: ['#b89868', '#7a5a3a'], duck: ['#e8d060', '#6a5a38'], goose: ['#c8c070', '#8a8048'] };

function variant(kind) {
  const [base, v] = String(kind).split(':');
  const B = BIRDS[base] || BIRDS.quail;
  if (v === 'y') {
    const [c, d] = CHICK[base] || CHICK.quail, k = base === 'goose' || base === 'turkey' ? 0.42 : 0.5;
    return { ...B, len: B.len * k, w: B.w * k * 1.1, h: B.h * k * 1.15, leg: B.leg * k, neck: B.neck * k * 0.7, head: B.head * k * 1.45, bill: B.bill * k, tail: 'none', body: c, back: d, belly: c, breast: c, head: c, neckC: null, ring: null, chin: null, wattle: null, plume: 0, bars: null, face: null, stripe: null, crown: null, scales: null, stern: null, fluffy: 1 };
  }
  if (v === 'f') return { ...B, body: '#6a5a4a', back: '#5e4c3e', breast: '#7a6a58', belly: '#ccb48e', head: '#6a5a4a', face: null, stripe: null, crown: null, plume: 0.65, scales: '#4e4036' };   // a hen
  if (v === 'L') return { ...B, body: '#f6f4f0', back: '#ecebe6', belly: '#ffffff', breast: '#f8f6f2', head: '#f8f6f2', neckC: B.neckC ? '#f4f2ee' : null, ring: null, chin: null, wattle: B.wattle ? '#e8c8c0' : null, face: null, stripe: null, crown: null, scales: null, stern: null, bars: '#e4e2dc', billC: '#e8d8a0', feet: '#d8c8a8', legend: 1 };
  return B;
}

export function birdModel(kind, o = {}) {
  const B = variant(kind), pose = o.pose || 'stand', phase = o.phase || 0, run = o.gait === 'run';
  const fly = pose === 'fly', swim = pose === 'swim', dead = pose === 'dead', peck = pose === 'peck', alert = pose === 'alert';
  const span = fly ? B.len * 1.25 : 0;
  const L = Math.ceil(B.len * 2 + B.neck + 12), W = Math.ceil(B.w + 8 + span * 2), H = Math.ceil(B.h + B.leg + B.neck + 10 + (fly ? span : 0));
  const m = new Vox(L, W, H), cy = W / 2;
  const glow = B.legend ? [214, 232, 255, 70] : null, cache = new Map();
  const R = (c, k = 3) => { const key = c + k; if (!cache.has(key)) cache.set(key, m.mat({ ramp: ramp(c, 6, 3), k, flag: B.fluffy ? F_LEAF : 0, emi: glow })); return cache.get(key); };
  const dark = m.mat({ ramp: ramp(B.legend ? '#7a7a88' : '#1e1a20', 4, 1), k: 1 });
  const step = Math.sin(phase * Math.PI * 2);
  // the body: an egg, its long axis tilted a little nose-down when running, flat on the water when swimming
  const cx = 6 + (B.tail === 'long' ? 9 : 3) + B.len / 2;
  const bz = dead ? B.w * 0.45 : swim ? B.h * 0.3 : fly ? span * 0.5 + B.h * 0.6 + 2 : B.leg + B.h * 0.5 + (run ? Math.abs(step) * 0.5 : 0);
  const tilt = run ? -0.18 : fly ? 0 : (B.tilt || -0.05);   // (a quail stands up plump, its breast high)
  const col = (x, y, z) => {
    if (z > bz + B.h * 0.18) return B.bars && Math.abs(y - cy) > B.w * 0.3 && Math.round(x * 0.9) % 3 === 0 ? R(B.bars) : R(B.back);
    if (x > cx + B.len * 0.18 && z < bz + B.h * 0.1) return R(B.breast);
    if (B.stern && x < cx - B.len * 0.3) return R(B.stern);   // (a drake's black stern)
    if (z < bz - B.h * 0.25) return B.scales && (Math.round(x * 1.1) + Math.round(z * 1.3) * 2) % 4 === 0 ? R(B.scales) : R(B.belly);   // (a quail's scaled belly)
    return B.scales && z < bz + B.h * 0.05 && (Math.round(x * 0.8) + Math.round(y)) % 5 === 0 ? R(B.belly) : R(B.body);   // (and the pale streaks on its flanks)
  };
  m.fill((x, y, z) => { const dx = x - cx, dz = z - bz - dx * tilt; return (dx / (B.len / 2)) ** 2 + ((y - cy) / (B.w / 2)) ** 2 + (dz / (B.h / 2)) ** 2 <= 1 ? col(x, y, z) : -1; });
  // folded wings along the flanks (spread in flight: broad, the primaries dark, beating)
  if (fly) {
    // each wing a broad plate out from the shoulder, its chord narrowing to the tip, raised or lowered with the beat
    const flap = Math.cos(phase * Math.PI * 2), y0w = B.w * 0.38, small = B.len < 15;
    // (a small bird's spread wings in two flat tones, so a steep wing reads as a shape, not a stack of lit steps)
    const flat = (c) => { const r = ramp(c, 6, 3); return m.mat({ ramp: [r[2], r[2], r[2], r[3], r[3], r[3]], k: 3, emi: glow }); };
    const prim = small ? flat(B.legend ? '#d8d6d2' : '#3a3430') : R(B.legend ? '#d8d6d2' : '#3a3430'), cov = small ? flat(B.back) : R(B.back);
    // (the big birds' beat kept shallow: a wing raised steeply would fold over itself from the camera's height; the small
    // ones' deep - a quail's flush, the wings up over its back, then down below the body, as in AN3 and AN8)
    const ang = small ? 0.3 + flap * 0.62 : Math.atan(flap * 0.3), ca = Math.cos(ang), sa = Math.sin(ang), sp = small ? span * 0.8 : span;
    for (const s of [-1, 1]) for (let t = 0; t <= 1; t += 0.4 / sp) {
      const chord = B.len * (small ? 0.62 - t * t * 0.4 : 0.66 - t * 0.36), y = cy + s * (y0w + sp * t * ca), z = bz + B.h * 0.2 + sp * t * sa, xa = cx - chord * 0.5 - t * 1.5;
      for (let x = xa; x <= xa + chord; x += 0.5) m.box(x, y - 0.5, z - 0.6, x + 0.6, y + 0.5, z + 0.6, t > 0.7 || x < xa + 1.2 ? prim : cov);
    }
  } else if (!dead) for (const s of [-1, 1]) m.ell(cx - B.len * 0.06, cy + s * B.w * 0.36, bz + B.h * 0.12, B.len * 0.36, B.w * 0.16, B.h * 0.3, R(B.back));
  if (dead) m.fill((x, y, z) => ((x - cx) / (B.len * 0.45)) ** 2 + ((y - cy - B.w * 0.9) / (B.w * 0.75)) ** 2 <= 1 && z < 1.5 ? R(B.back) : -1);   // a wing spread on the ground
  // the tail
  const tx = cx - B.len / 2, tz = bz + B.h * 0.1;
  if (B.tail === 'short') m.ell(tx - 1, cy, tz + (swim ? 1 : 0.4), 2, B.w * 0.28, 0.9, R(B.back));
  else if (B.tail === 'long') for (let k = 0; k < 11; k += 0.5) m.box(tx - k, cy - 0.6, tz + k * 0.22, tx - k + 1, cy + 0.6, tz + k * 0.22 + 0.9, Math.round(k) % 2 && B.bars ? R(B.bars) : R(B.back));
  else if (B.tail === 'fan') m.fill((x, y, z) => { const dx = tx + 1 - x, r = Math.hypot(dx, (y - cy) * 0.9); return dx > 0 && r < B.len * 0.42 && Math.abs(z - (tz + dx * 0.35)) < 0.8 ? (r > B.len * 0.36 ? R(B.bars || B.back) : R(B.back)) : -1; });
  // the neck and the head (down at the ground pecking; stretched up when alert; out straight in flight)
  const nx0 = cx + B.len * 0.36, nz0 = bz + B.h * 0.22;
  const hx = dead ? nx0 + B.neck * 0.8 : peck ? nx0 + B.neck * 0.7 + 1 : fly ? nx0 + B.neck * 0.95 : nx0 + B.neck * (alert ? 0.15 : 0.32) + (run ? 1 : 0) + step * (o.gait ? 0.5 : 0);
  const hz = dead ? 1.3 : peck ? B.head * 0.8 : fly ? nz0 + 1 : nz0 + B.neck * (alert ? 1.05 : 0.85);
  const neckM = B.neckC ? R(B.neckC) : R(B.head);
  for (let t = 0; t <= 1; t += 0.06) { const x = nx0 + (hx - nx0) * t, z = nz0 + (hz - nz0) * t; m.ell(x, cy, z, 1.1 + (1 - t) * 0.6, 1 + (1 - t) * 0.5, 1.1, t < 0.25 ? col(x, cy, z) : neckM); }
  if (B.ring) { const x = nx0 + (hx - nx0) * 0.3, z = nz0 + (hz - nz0) * 0.3; m.ell(x, cy, z, 1.3, 1.25, 0.55, R(B.ring)); }
  m.ell(hx, cy, hz, B.head, B.head * 0.85, B.head * 0.9, R(B.head));
  if (B.face) m.ell(hx + B.head * 0.3, cy, hz - B.head * 0.15, B.head * 0.7, B.head * 0.75, B.head * 0.55, R(B.face));
  if (B.stripe) for (const s of [-1, 1]) m.box(hx - B.head * 0.6, cy + s * B.head * 0.82 - 0.6, hz + B.head * 0.15, hx + B.head * 0.7, cy + s * B.head * 0.82 + 0.6, hz + B.head * 0.15 + 0.9, R(B.stripe));
  if (B.chin) for (const s of [-1, 1]) m.ell(hx - 0.2, cy + s * B.head * 0.62, hz - B.head * 0.25, B.head * 0.5, 0.5, B.head * 0.42, R(B.chin));
  if (B.wattle) m.ell(hx + B.head * 0.55, cy, hz - B.head * 0.75, 0.6, 0.6, B.head * 0.45, R(B.wattle));
  if (B.crown) m.ell(hx - 0.2, cy, hz + B.head * 0.45, B.head * 0.75, B.head * 0.62, B.head * 0.5, R(B.crown));   // a cock quail's chestnut cap
  if (B.plume) { const P = B.plume, bob = o.gait ? Math.sin(phase * Math.PI * 2) * 0.4 : 0; for (let k = 0; k < 4.8 * P; k += 0.3) { const up = Math.min(k, 3 * P), over = Math.max(0, k - 3 * P); m.ell(hx + 0.4 + up * 0.25 + over * 0.7 + bob, cy, hz + B.head * 0.8 + up * 0.9 - over * 0.55, k > 4 * P ? 1.05 : 0.7, 0.6, k > 4 * P ? 0.95 : 0.7, dark); } }   // a quail's topknot: a comma up and curling forward, bobbing as it goes
  // eyes, and the bill: a duck's and a goose's flat and broad, the others short and pointed
  for (const s of [-1, 1]) m.box(hx + B.head * 0.35, cy + s * B.head * 0.6 - 0.4, hz + B.head * 0.2, hx + B.head * 0.35 + 0.8, cy + s * B.head * 0.6 + 0.4, hz + B.head * 0.2 + 0.8, dark);
  const bill = R(B.billC || (B.legend ? '#d8c8a0' : '#c8b088'));
  if (B.flat) m.fill((x, y, z) => { const t = (x - hx - B.head * 0.6) / B.bill; return t >= 0 && t <= 1 && Math.abs(y - cy) < B.head * 0.42 && Math.abs(z - (hz - B.head * 0.25 - t * 0.4)) < 0.7 ? bill : -1; });
  else m.fill((x, y, z) => { const t = (x - hx - B.head * 0.75) / B.bill; return t >= 0 && t <= 1 && Math.hypot(y - cy, z - (hz - B.head * 0.15)) < 0.7 * (1 - t) + 0.3 ? bill : -1; });
  // the legs (none on the water or in the air; out stiff when dead), swinging as it walks or runs
  if (!swim && !fly) {
    const feet = R(B.feet || '#8a7a6a');
    for (const [s, ph] of [[-1, 0], [1, 0.5]]) {
      const a = dead ? 1.2 : Math.sin((phase + ph) * Math.PI * 2) * (run ? 0.55 : o.gait ? 0.35 : 0);
      const lx = cx + 0.5, ly = cy + s * B.w * 0.18, top = bz - B.h * 0.35;
      // (down to the ground; deep across the line of sight, or the character view's steep look skips a thin leg)
      for (let t = 0; t <= (dead ? B.leg : top / Math.max(0.5, Math.cos(a))) + 0.6; t += 0.4) { const x = lx + Math.sin(a) * t, z = dead ? top + t * 0.3 : top - Math.cos(a) * t; if (z < 0) break; m.box(x - 0.4, ly - 1.2, z, x + 0.5, ly + 1.2, z + 0.6, feet); }
      if (!dead) m.box(lx + Math.sin(a) * B.leg - 0.4, ly - 0.6, 0, lx + Math.sin(a) * B.leg + 1.4, ly + 0.6, 0.6, feet);
    }
  }
  m.smooth = 1;
  patchHidden(m);
  return m;
}
