// Art v2 game birds (shared/fauna.js): quail, pheasants, wild turkeys, mallards and Canada geese, and the fishers and
// birds of prey of Nature-A2 - the great blue heron, the osprey, the bald eagle - one small voxel rig, drawn like the
// four-legged animals (animals.js renderUpright, the character view) so they turn to any of the eight headings. Sizes
// in world px (a person stands ~42): a quail is ~9 px long, a goose ~18 with its neck up, a heron ~40 stood tall.
// Models face +x.
//
//   birdModel(kind, { phase, gait: 'walk'|'run', pose })  -> Vox
//     pose: 'stand' | 'peck' (head down at the ground) | 'alert' (neck up, stretched) | 'fly' (wings spread, phase
//     the wingbeat: 0 up, 0.5 down) | 'swim' (sat on the water, no legs) | 'dead' (on its side, a wing out) |
//     'dabble' (up-ended on the water, its head under: the stern and tail up, the feet paddling - phase their stroke)
//     Nature-A2: 'poised' (a heron still at the water, the neck drawn back in an S, the bill angled down) | 'stalk' (a
//     heron creeping, the neck out low and forward - phase its step) | 'strike' (the neck shot out and down, the bill
//     in the water) | 'fishbill' (head up, a fish crosswise in the bill) | 'soar' (a bird of prey gliding, the wings
//     out flat, the primaries spread like fingers) | 'stoop' (dropping on its prey: the wings swept back, the talons
//     out) | 'plunge' (in the water after a fish, the wings up over its back)
//     o.carry: 'fish' | 'game' - a bird of prey with a fish (head first) or a rabbit in its talons (soar, fly)
//     o.wade: stood in the shallows - the water half way up its legs (the model cut at the waterline)
//     kind may carry a variant: ':y' the chicks (quail chicks, poults, ducklings, goslings: small, fluffy, downy
//     colours), ':L' the legendary pure white one (a faint glow)
import { Vox } from './voxel.js';
import { patchHidden } from './vehicles.js';
import { ramp } from './palette.js';
import { F_LEAF } from './gbuf.js';

// len body length, w width, h body height, leg leg length, neck, head (radius), bill length (flat: a duck's bill),
// tail 'short' | 'long' (a pheasant's barred streamer) | 'fan' (a turkey's broad tail); colours: body (the flanks),
// back, belly, breast, head, neckC, ring (a white neck ring), chin (a goose's white chinstrap), wattle (red skin),
// plume (a quail's topknot), billC, feet, bars (light bars on the wings and tail); the heron's: sneck (the S of its
// neck), crest (the black plume back from the eye), dagger (the long spear of a bill); the birds of prey's: raptor
// (broad fingered wings - wingL x its length - a hooked bill), mask (an osprey's dark stripe through the eye), tailC (an
// eagle's white tail), prim (the dark flight feathers)
export const BIRDS = {
  // (the quail of AN8: the cock blue-grey with the black face in its white border, a chestnut cap, the scaled belly and
  // the comma of a topknot; the hen 'quail:f' plain brown and scaled, a smaller topknot)
  quail: { len: 10.5, w: 7.5, h: 9, tilt: 0.18, leg: 2.6, neck: 6.5, head: 3, bill: 0.9, tail: 'short', body: '#66748c', back: '#5e5e66', belly: '#d8c49a', breast: '#6a7a94', head: '#3e3a46', face: '#16121a', stripe: '#f4f2ec', crown: '#8a4a28', plume: 1, scales: '#3e3430', feet: '#c87a3a' },
  pheasant: { len: 12, w: 6, h: 7, leg: 3.6, neck: 3.6, head: 2.4, bill: 1.1, tail: 'long', body: '#b8642a', back: '#8a5a30', belly: '#6a3a1e', breast: '#c8742e', head: '#2a6a4a', ring: '#f2f0ea', wattle: '#d03a2a', bars: '#e0b070', feet: '#8a7a6a' },
  turkey: { len: 20, w: 11, h: 12, leg: 7, neck: 8.5, head: 2.6, bill: 1.2, tail: 'fan', body: '#4a3a30', back: '#5e4c38', belly: '#2e2620', breast: '#3e3028', head: '#a8bce0', neckC: '#c84a3a', wattle: '#c8302a', bars: '#d8c098', feet: '#9a7468' },
  duck: { len: 12, w: 7, h: 6, leg: 2.4, neck: 3.4, head: 2.6, bill: 2.4, flat: 1, tail: 'short', body: '#a8a8a4', back: '#7a705e', belly: '#d8d4cc', breast: '#7a3e2a', head: '#2a6a3e', ring: '#f2f0ea', billC: '#e0c040', feet: '#e08a2a', stern: '#26242a' },
  goose: { len: 18, w: 9, h: 8, leg: 4, neck: 9, head: 2.8, bill: 2.6, flat: 1, tail: 'short', body: '#8a7a68', back: '#6e6050', belly: '#e8e2d8', breast: '#b8ae9e', head: '#1e1c20', neckC: '#1e1c20', chin: '#f2f0ea', billC: '#26242a', feet: '#26242a' },
  // Nature-A2: the heron of the reeds and lily pads (blue-grey, the white face and the black crest, the yellow dagger),
  // the osprey (dark brown above, white below, the dark stripe through its eye), the bald eagle (dark brown, the white
  // head and tail, the yellow hooked bill and feet)
  heron: { len: 18, w: 7.5, h: 8.5, tilt: -0.2, leg: 16, neck: 16, head: 2.6, bill: 7, tail: 'short', body: '#8292a8', back: '#7484a0', belly: '#aeb6c4', breast: '#9aa4b2', head: '#eceae4', neckC: '#a2abb8', crest: '#1e1c24', billC: '#d8a838', feet: '#6a5c4a', sneck: 1, dagger: 1, wingL: 1.45, prim: '#3a4252' },
  osprey: { len: 13, w: 7.5, h: 6.5, leg: 3.4, neck: 2.2, head: 2.6, bill: 1.5, hook: 1, tail: 'short', body: '#efe9e0', back: '#4a3a2e', belly: '#f6f2ea', breast: '#e2d8cc', head: '#f2eee8', mask: '#3a2e26', billC: '#2a2628', feet: '#cfcfc4', raptor: 1, wingL: 1.75, prim: '#2a221e', bars: '#6a5a4a' },
  eagle: { len: 16, w: 9, h: 8, leg: 4, neck: 2.6, head: 3.1, bill: 2.3, hook: 1, tail: 'short', body: '#3c2c22', back: '#3e2e22', belly: '#34261e', breast: '#3a2a20', head: '#f6f4ee', tailC: '#f2f0ea', billC: '#e8c040', feet: '#e8c040', raptor: 1, wingL: 1.8, prim: '#22180f' },
};
// the hens drawn apart (':f'): the quail's plain brown hen with a smaller topknot (AN8), the mallard's mottled brown
// duck with her orange bill (AN5)
const HEN = {
  quail: { body: '#6a5a4a', back: '#5e4c3e', breast: '#7a6a58', belly: '#ccb48e', head: '#6a5a4a', face: null, stripe: null, crown: null, plume: 0.65, scales: '#4e4036' },
  duck: { body: '#8a6c4c', back: '#6e563e', breast: '#8a6c4c', belly: '#a88a66', head: '#7a5e44', ring: null, stern: null, billC: '#d0863a', scales: '#4e3a2a' },
};
const CHICK = { quail: ['#c8a878', '#8a6a48'], pheasant: ['#c8a070', '#8a6a48'], turkey: ['#b89868', '#7a5a3a'], duck: ['#e8d060', '#6a5a38'], goose: ['#c8c070', '#8a8048'] };

function variant(kind) {
  const [base, v] = String(kind).split(':');
  const B = BIRDS[base] || BIRDS.quail;
  if (v === 'y') {
    const [c, d] = CHICK[base] || CHICK.quail, k = base === 'goose' || base === 'turkey' ? 0.42 : 0.5;
    return { ...B, len: B.len * k, w: B.w * k * 1.1, h: B.h * k * 1.15, leg: B.leg * k, neck: B.neck * k * 0.7, head: B.head * k * 1.45, bill: B.bill * k, tail: 'none', body: c, back: d, belly: c, breast: c, head: c, neckC: null, ring: null, chin: null, wattle: null, plume: 0, bars: null, face: null, stripe: null, crown: null, scales: null, stern: null, fluffy: 1 };
  }
  if (v === 'f') return HEN[base] ? { ...B, ...HEN[base] } : B;   // a hen
  if (v === 'L') return { ...B, body: '#f6f4f0', back: '#ecebe6', belly: '#ffffff', breast: '#f8f6f2', head: '#f8f6f2', neckC: B.neckC ? '#f4f2ee' : null, ring: null, chin: null, wattle: B.wattle ? '#e8c8c0' : null, face: null, stripe: null, crown: null, scales: null, stern: null, bars: '#e4e2dc', billC: '#e8d8a0', feet: '#d8c8a8', legend: 1 };
  return B;
}

export function birdModel(kind, o = {}) {
  const B = variant(kind);
  if (o.wade) { const cut = Math.max(1, Math.round(B.leg * 0.5)); return sink(birdModel(kind, { ...o, wade: 0, wl: cut }), cut); }   // (in the shallows: the water half way up its legs)
  const pose = o.pose || 'stand', phase = o.phase || 0, run = o.gait === 'run';
  const soar = pose === 'soar', stoop = pose === 'stoop', plunge = pose === 'plunge';
  const dab = pose === 'dabble', fly = pose === 'fly' || soar || stoop, swim = pose === 'swim' || dab || plunge, dead = pose === 'dead', peck = pose === 'peck', alert = pose === 'alert', strut = pose === 'strut' && B.tail === 'fan';   // (strut: a tom's display, AN2)
  const poised = pose === 'poised', stalkP = pose === 'stalk', strike = pose === 'strike', fishbill = pose === 'fishbill';
  const span = fly || plunge ? B.len * (B.wingL || 1.25) : 0, trail = fly && B.sneck && !stoop ? B.leg * 0.95 : 0;   // (trail: a heron's legs out behind it in flight)
  const L = Math.ceil(B.len * 2 + B.neck + 12 + trail), W = Math.ceil(B.w + 8 + span * 2 + (strut ? B.len * 0.8 : 0)), H = Math.ceil(B.h + B.leg + B.neck + 10 + (fly ? span : plunge ? span * 0.9 : 0));
  const m = new Vox(L, W, H), cy = W / 2;
  const glow = B.legend ? [214, 232, 255, 70] : null, cache = new Map();
  const R = (c, k = 3) => { const key = c + k; if (!cache.has(key)) cache.set(key, m.mat({ ramp: ramp(c, 6, 3), k, flag: B.fluffy ? F_LEAF : 0, emi: glow })); return cache.get(key); };
  const dark = m.mat({ ramp: ramp(B.legend ? '#7a7a88' : '#1e1a20', 4, 1), k: 1 });
  const step = Math.sin(phase * Math.PI * 2);
  // the body: an egg, its long axis tilted a little nose-down when running, flat on the water when swimming
  const cx = 6 + (B.tail === 'long' ? 9 : 3) + B.len / 2 + trail;
  const low = B.sneck && (strike || poised || stalkP) ? B.leg * 0.12 : 0;   // (a heron sinks a little on its legs to strike)
  const bz = dead ? B.w * 0.45 : swim ? B.h * 0.3 : fly ? span * 0.5 + B.h * 0.6 + 2 : B.leg + B.h * 0.5 + (run ? Math.abs(step) * 0.5 : 0) - low;
  const tilt = run ? -0.18 : stoop ? -0.3 : fly ? 0 : dab ? -0.95 : B.sneck && (strike || stalkP) ? -0.38 : (B.tilt || -0.05);   // (a quail stands up plump, its breast high; dabbling, tipped right up)
  const col = (x, y, z) => {
    if (z > bz + B.h * 0.18) return B.bars && Math.abs(y - cy) > B.w * 0.3 && Math.round(x * 0.9) % 3 === 0 ? R(B.bars) : R(B.back);
    if (x > cx + B.len * 0.18 && z < bz + B.h * 0.1) return R(B.breast);
    if (B.stern && x < cx - B.len * 0.3) return R(B.stern);   // (a drake's black stern)
    if (z < bz - B.h * 0.25) return B.scales && (Math.round(x * 1.1) + Math.round(z * 1.3) * 2) % 4 === 0 ? R(B.scales) : R(B.belly);   // (a quail's scaled belly)
    return B.scales && z < bz + B.h * 0.05 && (Math.round(x * 0.8) + Math.round(y)) % 5 === 0 ? R(B.belly) : R(B.body);   // (and the pale streaks on its flanks)
  };
  const puff = strut ? 1.12 + phase * 0.06 : 1;   // (strutting: puffed up, breathing in and out)
  m.fill((x, y, z) => { const dx = x - cx, dz = z - bz - dx * tilt; return (dx / (B.len / 2 * puff)) ** 2 + ((y - cy) / (B.w / 2 * puff)) ** 2 + (dz / (B.h / 2 * puff)) ** 2 <= 1 ? col(x, y, z) : -1; });
  // folded wings along the flanks (spread in flight: broad, the primaries dark, beating)
  const primC = B.legend ? '#d8d6d2' : B.prim || '#3a3430';
  if (fly || plunge) {
    // each wing a broad plate out from the shoulder, its chord narrowing to the tip, raised or lowered with the beat
    const flap = Math.cos(phase * Math.PI * 2), y0w = B.w * 0.38, small = B.len < 15 && !B.raptor && !B.sneck;
    // (a small bird's spread wings in two flat tones, so a steep wing reads as a shape, not a stack of lit steps)
    const flat = (c) => { const r = ramp(c, 6, 3); return m.mat({ ramp: [r[2], r[2], r[2], r[3], r[3], r[3]], k: 3, emi: glow }); };
    const two = small || B.raptor || B.sneck;   // (the herons' and the birds of prey's broad wings too: no lit stripes along them)
    const prim = two ? flat(primC) : R(primC), cov = two ? flat(B.back) : R(B.back);
    // (the big birds' beat kept shallow: a wing raised steeply would fold over itself from the camera's height; the small
    // ones' deep - a quail's flush, the wings up over its back, then down below the body, as in AN3 and AN8). A bird of
    // prey soaring holds them out flat (a breath of movement); stooping, swept back and half folded; in the water after
    // a fish, raised up over its back
    let ang = small ? 0.3 + flap * 0.62 : Math.atan(flap * 0.3), sweep = 0, sp = small ? span * 0.8 : span;
    if (soar) ang = 0.07 + flap * 0.035;
    if (stoop) { ang = 0.32; sweep = 0.8; sp = span * 0.72; }
    if (plunge) { ang = 1.1 + flap * 0.12; sp = span * 0.72; }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (const s of [-1, 1]) for (let t = 0; t <= 1; t += 0.4 / sp) {
      const chord = B.len * (small ? 0.62 - t * t * 0.4 : B.raptor ? 0.72 - t * 0.26 : 0.66 - t * 0.36) * (stoop ? 0.72 : 1);
      const y = cy + s * (y0w + sp * t * ca * (1 - sweep * 0.4)), z = bz + B.h * 0.2 + sp * t * sa, xa = cx - chord * 0.5 - t * 1.5 - sweep * sp * t * 0.8;
      for (let x = xa; x <= xa + chord; x += 0.5) {
        if (B.raptor && t > 0.8 && x > xa + 0.8 && Math.floor((x - xa) / 1.3) % 2 === 1) continue;   // (the fingers: a bird of prey's primaries spread at the tip)
        m.box(x, y - 0.5, z - 0.6, x + 0.6, y + 0.5, z + 0.6, t > 0.7 || x < xa + 1.2 ? prim : cov);
      }
    }
  } else if (strut) for (const s of [-1, 1]) for (let t = 0; t <= 1; t += 0.1) m.ell(cx - B.len * 0.1 + t * 2, cy + s * B.w * 0.5, bz + B.h * 0.1 - t * (bz - 0.8), B.len * 0.3, B.w * 0.12, 1.2, t > 0.75 ? R(B.bars || B.back) : R(B.back));   // (the wings drooped, the tips trailing on the ground)
  else if (!dead) for (const s of [-1, 1]) m.ell(cx - B.len * 0.06, cy + s * B.w * 0.36, bz + B.h * 0.12 + (dab ? B.len * 0.1 : 0), B.len * 0.36, B.w * 0.16, B.h * 0.3, R(B.back));
  if (dead) m.fill((x, y, z) => ((x - cx) / (B.len * 0.45)) ** 2 + ((y - cy - B.w * 0.9) / (B.w * 0.75)) ** 2 <= 1 && z < 1.5 ? R(B.back) : -1);   // a wing spread on the ground
  // the tail (a bird of prey's broader - fanned out when it soars; an eagle's white)
  const tx = cx - B.len / 2, tz = bz + B.h * 0.1;
  if (dab) m.ell(tx + 0.5, cy, bz + B.len * 0.5 + 0.6, 1.6, B.w * 0.3, 1.4, R(B.stern || B.back));   // (straight up out of the water)
  else if (B.raptor) m.ell(tx - 2.2, cy, tz + 0.2, 3.4, B.w * (soar ? 0.5 : fly ? 0.38 : 0.28), 0.9, R(B.tailC || B.back));
  else if (B.tail === 'short') m.ell(tx - 1, cy, tz + (swim ? 1 : 0.4), 2, B.w * 0.28, 0.9, R(B.back));
  else if (B.tail === 'long') for (let k = 0; k < 11; k += 0.5) m.box(tx - k, cy - 0.6, tz + k * 0.22, tx - k + 1, cy + 0.6, tz + k * 0.22 + 0.9, Math.round(k) % 2 && B.bars ? R(B.bars) : R(B.back));
  else if (strut) m.fill((x, y, z) => { const r = Math.hypot((y - cy) * 0.85, z - tz), dx = tx + 1 - x; return dx > -0.5 && dx < 2 + (z - tz) * 0.12 && z > tz - 1 && r < B.len * 0.62 ? (r > B.len * 0.55 ? R(B.bars || B.back) : r > B.len * 0.5 ? R('#2a221c') : R(B.back)) : -1; });   // (the fan raised in a wheel, a pale rim)
  else if (B.tail === 'fan') m.fill((x, y, z) => { const dx = tx + 1 - x, r = Math.hypot(dx, (y - cy) * 0.9); return dx > 0 && r < B.len * 0.42 && Math.abs(z - (tz + dx * 0.35)) < 0.8 ? (r > B.len * 0.36 ? R(B.bars || B.back) : R(B.back)) : -1; });
  if (!dab) {
    // the neck and the head (down at the ground pecking; stretched up when alert; out straight in flight). A heron's
    // long neck: drawn up in an S stood at ease (and folded back on its shoulders in flight), coiled back and poised
    // over the water, stretched out low and forward stalking, shot out to the water in the strike
    const nx0 = cx + B.len * 0.36, nz0 = bz + B.h * 0.22;
    let hx = dead ? nx0 + B.neck * 0.8 : strut ? nx0 + B.neck * 0.05 : peck ? nx0 + B.neck * 0.7 + 1 : fly ? nx0 + B.neck * 0.95 : nx0 + B.neck * (alert ? 0.15 : 0.32) + (run ? 1 : 0) + step * (o.gait ? 0.5 : 0);
    let hz = dead ? 1.3 : strut ? nz0 + B.neck * 0.62 : peck ? B.head * 0.8 : fly ? nz0 + 1 : nz0 + B.neck * (alert ? 1.05 : 0.85);
    let bend = null, ba = 0.05;   // (bend: the S's control point; ba: the bill's angle down)
    if (B.sneck && !dead) {
      if (fly && !stoop) { hx = nx0 + B.neck * 0.22; hz = nz0 + 1.8; bend = [nx0 - B.neck * 0.05, nz0 + B.neck * 0.3]; }
      else if (strike) { hx = nx0 + B.neck * 0.95; hz = Math.max(B.head * 0.9, (o.wl || 0) + B.head * 0.6); ba = 0.95; }
      else if (poised) { hx = nx0 + B.neck * 0.38; hz = nz0 + B.neck * 0.5; bend = [nx0 - B.neck * 0.14, nz0 + B.neck * 0.42]; ba = 0.55; }
      else if (stalkP) { hx = nx0 + B.neck * 0.72; hz = nz0 + B.neck * 0.42; bend = [nx0 + B.neck * 0.2, nz0 + B.neck * 0.5]; ba = 0.4; }
      else if (!peck && !swim) { hx = nx0 + B.neck * 0.24; hz = nz0 + B.neck * (alert || fishbill ? 0.98 : 0.86); bend = [nx0 + B.neck * 0.36, nz0 + B.neck * 0.42]; ba = fishbill ? 0.1 : 0.12; }
    } else if (fishbill) ba = 0.1;
    if (stoop) { hx = nx0 + B.neck * 0.9 + 1; hz = nz0 - 0.4; ba = 0.35; }
    const neckM = B.neckC ? R(B.neckC) : R(B.head);
    for (let t = 0; t <= 1; t += B.sneck ? 0.035 : 0.06) {
      const u = 1 - t, x = bend ? u * u * nx0 + 2 * u * t * bend[0] + t * t * hx : nx0 + (hx - nx0) * t, z = bend ? u * u * nz0 + 2 * u * t * bend[1] + t * t * hz : nz0 + (hz - nz0) * t;
      const r = B.sneck ? 0.85 + u * 0.45 : 1.1 + u * 0.6;   // (a heron's: slender, but deep across - the character view's steep look skips a thin one)
      m.ell(x, cy, z, r, B.sneck ? 1.45 + u * 0.4 : 1 + u * 0.5, B.sneck ? 1 : 1.1, t < 0.25 ? col(x, cy, z) : neckM);
    }
    if (B.ring) { const x = nx0 + (hx - nx0) * 0.3, z = nz0 + (hz - nz0) * 0.3; m.ell(x, cy, z, 1.3, 1.25, 0.55, R(B.ring)); }
    m.ell(hx, cy, hz, B.head, B.head * 0.85, B.head * 0.9, R(B.head));
    if (B.face) m.ell(hx + B.head * 0.3, cy, hz - B.head * 0.15, B.head * 0.7, B.head * 0.75, B.head * 0.55, R(B.face));
    if (B.stripe) for (const s of [-1, 1]) m.box(hx - B.head * 0.6, cy + s * B.head * 0.82 - 0.6, hz + B.head * 0.15, hx + B.head * 0.7, cy + s * B.head * 0.82 + 0.6, hz + B.head * 0.15 + 0.9, R(B.stripe));
    if (B.mask) for (const s of [-1, 1]) m.box(hx - B.head * 0.95, cy + s * B.head * 0.8 - 0.6, hz - 0.3, hx + B.head * 0.45, cy + s * B.head * 0.8 + 0.6, hz + 0.7, R(B.mask));   // (an osprey's dark stripe back through the eye)
    if (B.crest) {   // (a heron's black stripe over the eye and its plume streaming back)
      for (const s of [-1, 1]) m.box(hx - B.head * 0.7, cy + s * B.head * 0.72 - 0.5, hz + B.head * 0.25, hx + B.head * 0.45, cy + s * B.head * 0.72 + 0.5, hz + B.head * 0.25 + 0.8, R(B.crest));
      for (let k = 0; k < 4.5; k += 0.4) m.ell(hx - B.head * 0.7 - k * 0.75, cy, hz + B.head * 0.45 - k * 0.22, 0.55, 0.45, 0.4, R(B.crest));
    }
    if (B.chin) for (const s of [-1, 1]) m.ell(hx - 0.2, cy + s * B.head * 0.62, hz - B.head * 0.25, B.head * 0.5, 0.5, B.head * 0.42, R(B.chin));
    if (B.wattle) m.ell(hx + B.head * 0.55, cy, hz - B.head * 0.75, 0.6, 0.6, B.head * 0.45, R(B.wattle));
    if (B.crown) m.ell(hx - 0.2, cy, hz + B.head * 0.45, B.head * 0.75, B.head * 0.62, B.head * 0.5, R(B.crown));   // a cock quail's chestnut cap
    if (B.plume) { const P = B.plume, bob = o.gait ? Math.sin(phase * Math.PI * 2) * 0.4 : 0; for (let k = 0; k < 4.8 * P; k += 0.3) { const up = Math.min(k, 3 * P), over = Math.max(0, k - 3 * P); m.ell(hx + 0.4 + up * 0.25 + over * 0.7 + bob, cy, hz + B.head * 0.8 + up * 0.9 - over * 0.55, k > 4 * P ? 1.05 : 0.7, 0.6, k > 4 * P ? 0.95 : 0.7, dark); } }   // a quail's topknot: a comma up and curling forward, bobbing as it goes
    // eyes, and the bill: a duck's and a goose's flat and broad, the others short and pointed; a heron's long dagger and a
    // bird of prey's hook drawn along their angle (down at the water poised, straight down in the strike)
    for (const s of [-1, 1]) m.box(hx + B.head * 0.35, cy + s * B.head * 0.6 - 0.4, hz + B.head * 0.2, hx + B.head * 0.35 + 0.8, cy + s * B.head * 0.6 + 0.4, hz + B.head * 0.2 + 0.8, dark);
    const bill = R(B.billC || (B.legend ? '#d8c8a0' : '#c8b088'));
    if (B.flat) m.fill((x, y, z) => { const t = (x - hx - B.head * 0.6) / B.bill; return t >= 0 && t <= 1 && Math.abs(y - cy) < B.head * 0.42 && Math.abs(z - (hz - B.head * 0.25 - t * 0.4)) < 0.7 ? bill : -1; });
    else if (B.dagger || B.hook) {
      const bx0 = hx + B.head * 0.7, bz0 = hz - B.head * 0.15, ca = Math.cos(ba), sa = Math.sin(ba), th = B.hook ? 1.05 : 0.75;
      for (let t = 0; t <= 1; t += 0.4 / B.bill) { const r = th * (1 - t) + 0.3; m.ell(bx0 + ca * B.bill * t, cy, Math.max(0.4, bz0 - sa * B.bill * t), r + 0.15, r + 0.45, r, bill); }
      if (B.hook) m.ell(bx0 + ca * B.bill + 0.3, cy, bz0 - sa * B.bill - 0.7, 0.45, 0.4, 0.65, bill);   // (the hook over the tip)
      if (fishbill) {   // a fish crosswise in the bill, its tail out to one side
        const fx = bx0 + ca * B.bill * 0.55, fz = Math.max(1, bz0 - sa * B.bill * 0.55 - 0.4);
        m.ell(fx, cy + 0.8, fz, 1.2, 3.8, 1.1, R('#d6dfe6')); m.ell(fx, cy + 0.8, fz + 0.6, 0.8, 3.4, 0.5, R('#5a7488'));
        m.box(fx - 0.7, cy + 4.4, fz - 1.2, fx + 0.7, cy + 5.4, fz + 1.2, R('#5a7488'));
      }
    } else m.fill((x, y, z) => { const t = (x - hx - B.head * 0.75) / B.bill; return t >= 0 && t <= 1 && Math.hypot(y - cy, z - (hz - B.head * 0.15)) < 0.7 * (1 - t) + 0.3 ? bill : -1; });
  }
  // the legs (none on the water or in the air; out stiff when dead), swinging as it walks or runs
  if (!swim && !fly) {
    const feet = R(B.feet || '#8a7a6a');
    for (const [s, ph] of [[-1, 0], [1, 0.5]]) {
      const a = dead ? 1.2 : Math.sin((phase + ph) * Math.PI * 2) * (run ? 0.55 : o.gait ? 0.35 : 0);
      const lx = cx + 0.5, ly = cy + s * B.w * 0.18, top = bz - B.h * 0.35;
      // (down to the ground; deep across the line of sight, or the character view's steep look skips a thin leg)
      for (let t = 0; t <= (dead ? B.leg : top / Math.max(0.5, Math.cos(a))) + 0.6; t += 0.4) { const x = lx + Math.sin(a) * t, z = dead ? top + t * 0.3 : top - Math.cos(a) * t; if (z < 0) break; m.box(x - 0.4, ly - 1.2, z, x + 0.5, ly + 1.2, z + 0.6, feet); }
      if (!dead) m.box(lx + Math.sin(a) * B.leg - 0.4, ly - 0.6, 0, lx + Math.sin(a) * B.leg + 1.4 + (B.sneck ? 1.2 : 0), ly + 0.6, 0.6, feet);
    }
  }
  const feet = R(B.feet || '#8a7a6a');
  // a heron in flight: the long legs trailing out behind
  if (trail) for (const s of [-1, 1]) for (let t = 0; t <= 1; t += 0.04) { const x = cx - B.len * 0.32 - t * trail, z = bz - B.h * 0.2 - t * 0.6; m.box(x - 0.4, cy + s * 0.9 - 0.5, z - 0.45, x + 0.4, cy + s * 0.9 + 0.5, z + 0.45, feet); }
  // a bird of prey stooping: the talons thrown forward, open
  if (stoop && B.raptor) for (const s of [-1, 1]) for (let t = 0; t <= 1; t += 0.08) { const x = cx + t * B.len * 0.55, z = bz - B.h * 0.4 - t * 1.6; m.box(x - 0.5, cy + s * 1.2 - 0.55, z - 0.5, x + 0.5, cy + s * 1.2 + 0.55, z + 0.5, feet); }
  // a bird of prey with its catch in its talons: a fish (head first, as an osprey carries it) or a rabbit
  if (o.carry && fly) {
    const pz = bz - B.h * 0.5 - 2.4;
    for (const s of [-1, 1]) m.box(cx - 0.4, cy + s * 1.3 - 0.5, pz + 0.6, cx + 0.8, cy + s * 1.3 + 0.5, bz - B.h * 0.3, feet);
    if (o.carry === 'fish') {
      m.ell(cx + 1, cy, pz, 5.2, 1.5, 1.4, R('#c6d0d8')); m.ell(cx + 1, cy, pz + 0.8, 4.6, 1, 0.6, R('#4e6a7c'));
      m.box(cx - 5.2, cy - 1.8, pz - 0.4, cx - 3.8, cy + 1.8, pz + 0.6, R('#4e6a7c'));
    } else {
      const fur = R('#9a7652');
      m.ell(cx + 0.4, cy, pz - 0.8, 4.4, 2.4, 2.1, fur); m.ell(cx + 4.4, cy, pz - 0.6, 1.8, 1.6, 1.5, fur);
      for (const s of [-1, 1]) m.ell(cx + 3.6, cy + s * 0.8, pz + 0.9, 0.6, 0.5, 1.4, fur);
      m.ell(cx - 4, cy, pz - 0.4, 1.1, 1.1, 1.1, R('#f2ece4'));
    }
  }
  if (dab) {
    // up-ended: the orange feet up behind the tail, paddling to keep it down; the front half under the water
    const k = Math.sin(phase * Math.PI * 2);
    for (const sd of [-1, 1]) m.box(tx + 1.6 + sd * k * 0.7, cy + sd * B.w * 0.22 - 0.6, bz + B.len * 0.42, tx + 2.8 + sd * k * 0.7, cy + sd * B.w * 0.22 + 0.6, bz + B.len * 0.42 + 1.2, feet);
    m.box(0, 0, 0, L, W, Math.max(1, bz), 0);
  }
  m.smooth = 1;
  patchHidden(m);
  return m;
}
// stood in the water: everything below the waterline cut away and the rest let down to it
function sink(m, cut) {
  const n = new Vox(m.w, m.d, Math.max(4, m.h - cut));
  n.mats = m.mats; n.smooth = m.smooth;
  for (let z = 0; z < n.h; z++) for (let y = 0; y < m.d; y++) for (let x = 0; x < m.w; x++) { const v = m.get(x, y, z + cut); if (v) n.v[n.idx(x, y, z)] = v; }
  patchHidden(n);
  return n;
}
