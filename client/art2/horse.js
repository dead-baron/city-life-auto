// Art v2's horse (the owner's batch-4 note: "Horse animations could be better, can we make the horses look better and
// have better animation?"): a model of its own, not the four-legged rig's - a barrel of a body (the withers, the dip of
// the back, the round of the croup), a long neck rising to the poll, a long head angled down (the jowl, the flared
// nostrils, the eyes, the ears up), the mane falling down one side of the neck and the forelock, the tail from its dock;
// legs with their joints (the forearm to the knee, the gaskin to the point of the hock, the cannons, the fetlocks and
// pasterns, the hooves). Eight coats with their markings (a star, a blaze, a snip, white socks and stockings, a bay's
// and a dun's black points, a grey's dapples, a paint's patches, an appaloosa's spots). The gaits are real ones, each
// foot on its own beat: the walk (four beats), the trot (the diagonals together), the canter (three beats and the
// rocking body) and the gallop (four beats, the body stretched out, a moment in the air) - the head nodding with the
// walk and rocking with the canter, the tail swinging and lifting the faster it goes. Standing, it rests a hind leg,
// swishes its tail and flicks an ear; grazing, its muzzle is down in the grass. The saddle sits at the model's middle,
// where the game puts the rider (shared/vehicles.js horse.seat, the people's 'saddle' pose at SEATS.saddle).
// The workers load this (game/actors.js loadArt): the page's renderer never builds a horse.
//   horseModel(kind, pose, frame, frames) -> Vox      kind 'horse' | 'horse:s<coat>' (saddled) | 'horse:c<coat>'
//     pose: stand idle graze drink alert stride walk trot canter run gallop rear hit dead fall lie down swim wade
import { Vox } from './voxel.js';
import { ramp } from './palette.js';
import { hash } from './gbuf.js';
import { patchHidden } from './vehicles.js';
import { REPOSE } from './animals.js';

// coat, mane and tail; pts: the points (the lower legs); socks [LF, RF, LH, RH]: 0 none, 1 a sock, 2 a stocking; face:
// star | blaze | snip | stripe; pat: dapple | paint | appy | dorsal; blanket: the saddle cloth's colour
export const HORSE_COATS = [
  { coat: '#8e4a24', mane: '#6a3016', socks: [0, 0, 1, 1], face: 'blaze', blanket: '#2f5a9a' },             // chestnut
  { coat: '#6a3a20', mane: '#16100c', pts: '#1c1410', face: 'star', blanket: '#b8322a' },                    // bay
  { coat: '#25212a', mane: '#121014', socks: [0, 1, 0, 0], face: 'star', blanket: '#c89a2a' },                // black
  { coat: '#b2b0ac', mane: '#e6e4e0', pts: '#6a6866', pat: 'dapple', blanket: '#2a6a4a' },                   // grey
  { coat: '#d6a858', mane: '#f2ead6', socks: [1, 1, 0, 0], face: 'blaze', blanket: '#7a2a5a' },               // palomino
  { coat: '#f0ece4', mane: '#3a2a20', patch: '#6a3a22', pat: 'paint', socks: [2, 2, 2, 2], face: 'blaze', blanket: '#2a4a8a' },   // paint
  { coat: '#c89a5c', mane: '#1c1612', pts: '#241c16', pat: 'dorsal', face: 'snip', blanket: '#3a6a8a' },      // dun
  { coat: '#e6e0d4', mane: '#3a2c24', patch: '#3e2e26', pat: 'appy', socks: [0, 0, 1, 0], face: 'stripe', blanket: '#a8482a' },   // appaloosa
];
// [LF, RF, LH, RH]: when each foot lands (of the cycle), how long it's down (D), its reach either way (E), how high the
// fore and hind feet lift; the body's bob, its rock (front up and down, the canter's and the gallop's), the poll's place
// and the head's angle below level, how much the head nods, how far the tail lifts
const GAITS = {
  walk: { off: [0.25, 0.75, 0, 0.5], D: 0.64, E: 7, lf: 4.5, lh: 3.5, bob: 0.4, rock: 0, poll: [30, 45], ha: 1.08, nod: 1.1, tail: 0 },
  trot: { off: [0, 0.5, 0.5, 0], D: 0.42, E: 9.5, lf: 7.5, lh: 5.5, bob: 1.1, rock: 0, poll: [31, 46], ha: 1.0, nod: 0.3, tail: 0.35 },
  canter: { off: [0.55, 0.3, 0.3, 0], D: 0.4, E: 11, lf: 8, lh: 6, bob: 1.2, rock: 0.055, poll: [32, 44.5], ha: 0.92, nod: 1.4, tail: 0.65 },
  gallop: { off: [0.5, 0.38, 0.12, 0], D: 0.3, E: 14, lf: 9, lh: 7, bob: 1.4, rock: 0.045, poll: [35, 41], ha: 0.7, nod: 1.6, tail: 1 },
};
const GAIT_OF = { stride: 'walk', walk: 'walk', wade: 'walk', swim: 'walk', trot: 'trot', canter: 'canter', run: 'gallop', gallop: 'gallop' };
const LM = 104, DM = 36, HM = 64;   // (the model's box: the saddle at its middle)

export function horseModel(kind, pose = 'stand', frame = 0, frames = 1) {
  const [, v] = String(kind).split(':');
  const C = HORSE_COATS[(v ? +v.slice(1) || 0 : 1) % HORSE_COATS.length], tack = !!v && v[0] === 's';
  const ph = frames > 1 ? frame / frames : 0;
  if (pose === 'dead' || pose === 'fall') return REPOSE.onSide(build(C, tack, { gait: pose === 'fall' ? 'gallop' : null, ph: pose === 'fall' ? ph : 0.1 }), { w: 15 });
  if (pose === 'swim') return REPOSE.waterline(build(C, tack, { gait: 'walk', ph, swim: true }), { h: 36 }, 0.62);
  if (pose === 'wade' || pose === 'wadedrink') return REPOSE.waterline(build(C, tack, pose === 'wade' ? { gait: 'walk', ph } : { graze: true }), { h: 36 }, 0.3);
  if (pose === 'rear' || pose === 'hit') return rearUp(build(C, tack, { rear: true, ph }), pose === 'hit' ? 0.22 : 0.5);
  const o = { gait: GAIT_OF[pose] || null, ph };
  if (pose === 'graze' || pose === 'drink' || pose === 'peck') { o.graze = true; o.chew = frame & 1; }
  else if (pose === 'alert') o.alert = true;
  else if (pose === 'lie' || pose === 'down') o.lie = true;
  else if (!o.gait) { o.idle = frame; }   // (stand, idle: resting a hind leg, the tail and an ear going)
  return build(C, tack, o);
}

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function build(C, tack, o) {
  const m = new Vox(LM, DM, HM), xc = LM / 2, cy = DM / 2;
  const mats = new Map(), R = (c, k = 3, sh = null) => { const key = c + k + (sh ? 's' : ''); if (!mats.has(key)) mats.set(key, m.mat({ ramp: ramp(c, 6, 3), k, shade: sh })); return mats.get(key); };
  const hair = (x, y, z) => (hash(Math.floor(y * 1.4), Math.floor(z / 2.5) + Math.floor(x / 3) * 7, 31) - 0.5) * 1.3;
  const body = R(C.coat, 3, (x, y, z) => (z > 30 ? 0.35 : z < 22 ? -0.45 : 0)), mane = R(C.mane, 3, hair), dark = R('#221c1c', 1), white = R('#f2efe8', 3);
  const pts = C.pts ? R(C.pts, 2) : null, patch = C.patch ? R(C.patch, 3) : null, hoofD = R('#3a3230', 2), hoofL = R('#a89274', 2);
  const muzzle = R(C.coat === '#25212a' ? '#2a2428' : '#4a3c3c', 2), eye = R('#141012', 1), pink = R('#c89090', 2);
  const G = o.gait ? GAITS[o.gait] : null, ph = o.ph || 0;
  // the body's bob (from how much weight the feet carry) and its rock
  let load = 0;
  const feet = [];
  for (let i = 0; i < 4; i++) {
    const fore = i < 2;
    if (!G) { feet.push(null); continue; }
    const p = (((ph - G.off[i]) % 1) + 1) % 1;
    if (p < G.D) { feet.push({ x: G.E * (1 - 2 * p / G.D), z: 0, up: 0 }); load += Math.sin(Math.PI * p / G.D); }
    else { const u = (p - G.D) / (1 - G.D), s = Math.sin(Math.PI * u); feet.push({ x: -G.E + 2 * G.E * sm(u) - (fore ? G.lf * 0.35 * s : 0), z: (fore ? G.lf : G.lh) * s, up: s }); }
  }
  const pitch = G ? G.rock * Math.sin(Math.PI * 2 * (ph + 0.1)) : o.rear ? 0 : 0;
  const bob = G ? G.bob * Math.max(-0.6, 1 - load) : 0;
  const drop = o.lie ? 15 : 0;
  const zb = (x) => bob + pitch * x - drop;   // (x from the middle)
  // the coat's patterns and markings over the body
  const coatAt = (x, y, z) => {
    const X = x - xc;
    if (C.pat === 'dapple' && z > 16) { const d = hash(Math.floor(x / 3.2), Math.floor(y / 3.2) * 13 + Math.floor(z / 3.2), 7); if (d > 0.72) return R('#d2d0cc', 3); if (d < 0.12) return R('#8e8c88', 3); }
    if (C.pat === 'paint') { const n = Math.sin(X * 0.21 + 1.3) + Math.sin(z * 0.33 - X * 0.07) * 0.9 + Math.sin(y * 0.4 + X * 0.05) * 0.4; if (n > 0.55 && z > 14) return patch; }
    if (C.pat === 'appy' && X < -2 && z > 20 && hash(Math.floor(x / 2.4), Math.floor(y / 2.4) * 17 + Math.floor(z / 2.4), 9) > 0.7) return patch;
    if (C.pat === 'dorsal' && Math.abs(y - cy) < 1.2 && z > 32 + zb(X) && X > -20 && X < 12) return mane;
    return body;
  };
  // ---- the body: the chest and shoulder, the barrel, the hindquarters and the round of the croup, blended into one
  const E = [[13, 27.6, 9.5, 6.6, 8.6], [0, 26.6, 16, 7.4, 7.6], [-13, 28, 10.5, 7, 8.2], [-16, 31.5, 8, 6.2, 4.4], [17, 25.5, 5, 5.2, 6.5]];
  m.fill((x, y, z) => {
    let s = 0;
    for (const [ex, ez, rx, ry, rz] of E) {
      const q = Math.hypot((x - xc - ex) / rx, (y - cy) / ry, (z - ez - zb(ex)) / rz);
      s += Math.exp(-9 * (q - 1));
    }
    return s >= 1 ? coatAt(x, y, z) : -1;
  }, Math.floor(xc - 30), 0, Math.max(0, Math.floor(15 - drop)), Math.ceil(xc + 26), DM, Math.ceil(40 + bob - drop + 3));
  // ---- the neck and the head: tubes along their lines, in their own coordinates (a along, c across, toward the crest
  // or the face's front; the width across the y axis)
  const tube = (P0, P1, rc, rs, c0, mat, top) => {
    const dx = P1[0] - P0[0], dz = P1[1] - P0[1], Ln = Math.hypot(dx, dz), hx = dx / Ln, hz = dz / Ln, nx = -hz, nz = hx;
    const xs = [P0[0], P1[0]], zs = [P0[1], P1[1]];
    m.fill((x, y, z) => {
      const px = x - xc - P0[0], pz = z - P0[1], a = px * hx + pz * hz;
      if (a < -2 || a > Ln + 2) return -1;
      const t = Math.max(0, Math.min(1, a / Ln)), c = px * nx + pz * nz - c0(t), s = y - cy, ra = rc(t), rb = rs(t);
      const end = a < 0 ? -a : a > Ln ? a - Ln : 0;
      return (c / ra) ** 2 + (s / rb) ** 2 + (end / Math.min(ra, rb)) ** 2 <= 1 ? mat(t, c / ra, s, a) : -1;
    }, Math.floor(xc + Math.min(...xs) - 9), 0, Math.max(0, Math.floor(Math.min(...zs) - 9)), Math.ceil(xc + Math.max(...xs) + 9), DM, Math.min(HM, Math.ceil(Math.max(...zs) + top)));
    return { hx, hz, nx, nz, Ln };
  };
  // where the poll is and which way the head points
  let poll = G ? [...G.poll] : [29, 45.5], ha = G ? G.ha : 1.1;
  if (G) poll[1] += -G.nod * (o.gait === 'walk' ? Math.cos(Math.PI * 4 * ph) : Math.sin(Math.PI * 2 * (ph + 0.1))) + zb(poll[0]) - bob * 0.4;
  if (o.idle !== undefined) { poll = [29, 44.5 - (o.idle === 3 ? 1.2 : 0)]; ha = 1.12; }
  if (o.alert) { poll = [27, 51]; ha = 0.95; }
  if (o.graze) { poll = [29, 14 + (o.chew ? 0.6 : 0)]; ha = 1.32; }
  if (o.lie) { poll = [27, 33]; ha = 1.05; }
  if (o.rear) { poll = [27, 50]; ha = 0.75; }
  if (o.swim) { poll = [31, 44]; ha = 0.85; }
  const base = [13, 30.5 + zb(13)];
  // the neck: deep at its base, the crest arched, the throat narrowing to the jaw
  const nk = tube(base, poll, (t) => 7.4 - 3.6 * t, (t) => 4.7 - 1.5 * t, (t) => Math.sin(Math.PI * t) * 0.9, (t, c, s, a) => coatAt(xc + base[0] + a * 0.5, cy + s, base[1] + a * 0.7), 8);
  // the mane: down the crest from the poll to the withers and over the right side, in locks; up and back at a gallop
  const lift = G ? G.tail : 0;
  for (let a = 1; a < nk.Ln + 1.5; a += 0.5) {
    const t = Math.min(1, a / nk.Ln), rc = 7.4 - 3.6 * t, c0 = Math.sin(Math.PI * t) * 0.9;
    const qx = base[0] + nk.hx * a + nk.nx * (rc + c0), qz = base[1] + nk.hz * a + nk.nz * (rc + c0);
    const lock = hash(Math.floor(a / 1.6), 3, 17), hang = (2.6 + lock * 2.2) * (1 - lift * 0.55), up = 1 + lift * 1.6 * lock;
    m.box(xc + qx - 0.7 - lift * 1.4, cy - 1.4, qz - 0.6, xc + qx + 0.7, cy + 1.6, qz + up, mane);
    for (let k = 0; k <= hang; k += 0.5) m.box(xc + qx - 0.6 - k * (0.35 + lift * 0.6), cy + 1.2 + Math.min(k, 2.4) * 1.3, qz - k * (1 - lift * 0.5), xc + qx + 0.6 - k * (0.35 + lift * 0.6), cy + 2.4 + Math.min(k, 2.4) * 1.3, qz - k * (1 - lift * 0.5) + 1, mane);
  }
  // the head: the forehead, the wide jowl behind, down the face to the muzzle
  const Lh = 18.5, tip = [poll[0] + Math.cos(-ha) * Lh, poll[1] + Math.sin(-ha) * Lh];
  const face = (t, c, s, a) => {
    if (t > 0.82) return Math.abs(s) < 1.3 && c > 0.3 && C.face === 'snip' ? white : muzzle;
    if (c > 0.55 && Math.abs(s) < (C.face === 'blaze' ? 1.6 : 1.1) && ((C.face === 'star' && t > 0.12 && t < 0.3) || ((C.face === 'blaze' || C.face === 'stripe') && t > 0.1 && t < 0.86))) return white;
    return coatAt(xc + poll[0], cy + s, poll[1] - a * 0.5);
  };
  const hd = tube(poll, tip, (t) => 3.9 + 1.1 * Math.exp(-(((t - 0.3) / 0.2) ** 2)) - 1.2 * t, (t) => 3.7 - 1.1 * t + (t > 0.85 ? 0.5 : 0), (t) => -0.9 * Math.exp(-(((t - 0.32) / 0.18) ** 2)), face, 6);
  const at = (a, c, s) => [xc + poll[0] + hd.hx * a + hd.nx * c, cy + s, poll[1] + hd.hz * a + hd.nz * c];
  for (const sd of [-1, 1]) {
    const [ex, ey, ez] = at(4.6, 1.4, sd * 3.3); m.box(ex - 0.6, ey - 0.6, ez - 0.6, ex + 0.7, ey + 0.7, ez + 0.7, eye);               // the eyes
    const [nx2, ny2, nz2] = at(Lh - 0.6, 0.6, sd * 1.5); m.box(nx2 - 0.6, ny2 - 0.5, nz2 - 0.6, nx2 + 0.6, ny2 + 0.6, nz2 + 0.6, dark);   // the nostrils
    // the ears: up off the poll, a little forward (one turned back now and then)
    const flick = o.idle === 2 && sd > 0 ? 0.6 : o.alert ? -0.25 : 0, ea = -ha + Math.PI / 2 + 0.55 - 0.4 + flick;
    for (let k = 0; k < 4.6; k += 0.5) { const [bx, by, bz] = at(0.8, 3, sd * 1.9), r = 1.2 - k * 0.18; m.box(bx - k * Math.cos(ea) * 0.2 + k * 0.25 - r, by + sd * k * 0.15 - r, bz + k * 0.95 - r, bx + k * 0.25 + r, by + sd * k * 0.15 + r, bz + k * 0.95 + r, k > 3 ? mane : body); }
  }
  { const [mx, my, mz] = at(Lh - 1.2, -2, 0); m.box(mx - 1.4, my - 1.9, mz - 0.4, mx + 0.8, my + 1.9, mz + 0.4, dark); }   // (the mouth's line)
  for (let k = 0; k < 3.5; k += 0.5) { const [fx, fy, fz] = at(1 + k, 3.6 - k * 0.2, 0); m.box(fx - 0.8, fy - 1.2, fz - 0.6, fx + 0.8, fy + 1.2, fz + 0.6, mane); }   // the forelock
  // ---- the legs: [LF, RF, LH, RH] - the top of each free leg, the bones' lengths, where its foot is
  const legs = [[13, -3.6, 10.6, 7.6], [13, 3.6, 10.6, 7.6], [-11, -3.6, 11.6, 9.6], [-11, 3.6, 11.6, 9.6]];
  legs.forEach(([tx, ly, L1, L2], i) => {
    const fore = i < 2, sock = (C.socks || [])[i] || 0, tz0 = (fore ? 20.6 : 22.6), tzz = tz0 + zb(tx);
    let fx = fore ? 13.5 : -14.5, fz = 3.2, up = 0;
    const f = feet[i];
    if (f) { fx += f.x; fz += f.z; up = f.up; }
    if (o.idle !== undefined && i === 2) { fx += 2.5; fz += 1.4; up = 0.5; }                  // (resting a hind leg on its toe)
    if (o.graze && i === 0) fx += 4;                                                          // (a foreleg forward to reach the grass)
    if (o.rear && fore) { fx += 6; fz += 9; up = 1; }
    if (o.lie) { fx = fore ? 18 - (i & 1) * 4 : -8 + (i & 1) * 3; fz = 2.2; up = 1; }
    const dx = fx - tx, dz = fz - tzz, d = Math.max(0.5, Math.min((L1 + L2) * 0.995, Math.hypot(dx, dz))), th = Math.atan2(dz, dx);
    const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const kx = tx + Math.cos(th + (fore ? al : -al)) * L1, kz = tzz + Math.sin(th + (fore ? al : -al)) * L1;
    const lowM = (t) => (sock === 2 || (sock === 1 && t > 0.62) ? white : pts || coatAt(xc + fx, cy + ly, 8));
    const seg = (x0, z0, x1, z1, r0, r1, mt) => {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2) + 1;
      for (let k = 0; k <= n; k++) { const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, r = r0 + (r1 - r0) * t; m.box(xc + x - r, cy + ly - r * 0.9, Math.max(0, z - r * 0.7), xc + x + r, cy + ly + r * 0.9, Math.max(0, z + r * 0.7) + 0.5, typeof mt === 'function' ? mt(t) : mt); }
    };
    seg(tx + (fore ? 0.5 : -1.5), tzz + 4, kx, kz, fore ? 2.7 : 3.4, fore ? 1.5 : 1.6, (t) => (pts && t > 0.8 ? pts : coatAt(xc + tx, cy + ly, tzz)));   // the forearm, the gaskin
    seg(kx, kz, fx, fz, fore ? 1.25 : 1.3, 1.15, lowM);                                    // the cannon
    m.box(xc + kx - 1.6, cy + ly - 1.3, kz - 1, xc + kx + 1.4, cy + ly + 1.3, kz + 1, pts && fore ? pts : sock === 2 ? white : coatAt(xc + kx, cy + ly, kz));   // the knee, the hock
    if (!fore) m.box(xc + kx - 2.4, cy + ly - 0.8, kz - 0.2, xc + kx - 1, cy + ly + 0.8, kz + 1.6, pts || body);   // (the point of the hock)
    // the fetlock, the pastern down to the hoof - folded back off the ground as the foot comes through
    const hx = fx + 1.2 - up * 2.8, hz = fz - 2 + up * 0.7;
    m.box(xc + fx - 1.4, cy + ly - 1.2, fz - 0.9, xc + fx + 1.3, cy + ly + 1.2, fz + 1, lowM(1));
    seg(fx, fz, hx, hz + 1, 1.05, 1.0, lowM(1));
    m.box(xc + hx - 1.5, cy + ly - 1.4, Math.max(0, hz - 1.1), xc + hx + 1.8, cy + ly + 1.4, Math.max(0, hz - 1.1) + 2.1, sock ? hoofL : hoofD);
  });
  // ---- the tail: the dock off the croup, the hair falling from it - swinging, lifting and streaming the faster it goes
  const rootX = -22, rootZ = 33.2 + zb(-22);
  const sw = G ? Math.sin(Math.PI * 2 * ph) * (1.2 + lift) : o.idle !== undefined ? [0, 2.4, -2.2, 0.8][o.idle & 3] : o.graze ? (o.chew ? 1.4 : -0.6) : 0;
  for (let k = 0; k <= 4; k += 0.5) m.box(xc + rootX - k * 0.9 - 1.3, cy - 1.4, rootZ - k * (0.7 - lift * 0.5) - 1.3, xc + rootX - k * 0.9 + 1.3, cy + 1.4, rootZ - k * (0.7 - lift * 0.5) + 1.3, k < 2.5 ? body : mane);
  const dx0 = rootX - 3.6, dz0 = rootZ - 3 + lift * 2;
  const len = o.lie ? 14 : 22;
  for (let t = 0; t <= 1; t += 0.03) {
    const x = dx0 - (3 + lift * 13) * t - 1.5 * t * t, z = Math.max(1, dz0 - (len - lift * 12) * Math.pow(t, 1.15) + lift * 2 * t * t), y = cy + sw * Math.pow(t, 1.4), r = 1.5 + Math.sin(Math.PI * Math.min(1, t * 1.25)) * 1.4;
    m.box(xc + x - r * 0.8, y - r, z - 0.8, xc + x + r * 0.8, y + r, z + 0.8, mane);
  }
  // ---- the tack (a riding horse's, 's'): the saddle cloth, the saddle (the seat, the cantle, the horn), the fenders and
  // stirrups, the girth; the bridle (the headstall, the browband, the noseband), the bit and the reins back to the horn
  if (tack && !o.lie) {
    const blanket = R(C.blanket || '#b8322a'), leather = R('#6a3c1e'), dk = R('#3a2414', 2), steel = R('#b8b4ac', 2), top = 34.3 + zb(2);
    m.fill((x, y, z) => { const X = x - xc - 1.5; return Math.abs(X) < 9 && Math.abs(y - cy) < 8.4 - Math.max(0, z - top) * 1.4 && z < top + 1.8 && Math.hypot(X / 9.5, (y - cy) / 8.6) < 1 && z > top - 6.5 + Math.abs(X) * 0.1 ? blanket : -1; }, Math.floor(xc - 9), 0, Math.floor(top - 7), Math.ceil(xc + 12), DM, Math.ceil(top + 2));
    m.ell(xc + 1.5, cy, top + 1.6, 6.4, 5.8, 1.6, leather);
    m.ell(xc - 4, cy, top + 3, 1.6, 5, 2.2, dk);                       // (the cantle)
    m.ell(xc + 6.6, cy, top + 3, 1.6, 3.4, 1.8, leather); m.ell(xc + 7.2, cy, top + 5, 1, 1, 1.6, dk);   // (the pommel, the horn)
    for (const sd of [-1, 1]) {
      const fy = cy + sd * 8.2;
      m.box(xc - 1.5, fy - 0.6, top - 9, xc + 2.5, fy + 0.6, top + 0.6, leather);   // (the fender)
      m.box(xc - 1.2, fy - 1, top - 11.6, xc + 2.4, fy + 1, top - 10.2, steel);     // (the stirrup)
      const [bx, by, bz] = at(Lh - 3.5, -0.8, sd * 2.4);
      for (let t = 0; t <= 1; t += 0.04) { const x = xc + 7.4 + (bx - xc - 7.4) * t, y = cy + sd * 1.6 + (by - cy - sd * 1.6) * t, z = top + 4.6 + (bz - top - 4.6) * t - Math.sin(Math.PI * t) * 3; m.box(x - 0.45, y - 0.45, z - 0.45, x + 0.45, y + 0.45, z + 0.45, dk); }   // (the reins)
      m.box(bx - 0.6, by - 0.6, bz - 0.6, bx + 0.6, by + 0.6, bz + 0.6, steel);   // (the bit)
    }
    // the girth: round the barrel behind the forelegs
    for (let z = 0; z < HM; z++) for (let y = 0; y < DM; y++) for (let x = Math.floor(xc + 6); x < xc + 8; x++) { const i = m.idx(x, y, z); if (m.v[i] && z < top - 4 && z > 14) m.v[i] = dk; }
    // the bridle: a strap round behind the ears and round the nose, the browband between
    for (const a of [1.2, Lh - 5]) for (let q = 0; q < Math.PI * 2; q += 0.18) { const [x, y, z] = at(a, Math.cos(q) * (a < 3 ? 4.6 : 3.4), Math.sin(q) * (a < 3 ? 4 : 3)); m.box(x - 0.45, y - 0.45, z - 0.45, x + 0.45, y + 0.45, z + 0.45, dk); }
  }
  m.smooth = 1;
  patchHidden(m);
  return m;
}
// rearing up (and the flinch, a little of it): the whole horse turned nose-up about its hind feet
function rearUp(m, ang) {
  const px = LM / 2 - 15, c = Math.cos(ang), s = Math.sin(ang), n = new Vox(m.w, m.d, m.h + 24);
  n.mats = m.mats; n.smooth = m.smooth;
  for (let z = 0; z < n.h; z++) for (let y = 0; y < n.d; y++) for (let x = 0; x < n.w; x++) {
    const dx = x + 0.5 - px, dz = z + 0.5, ox = px + dx * c + dz * s, oz = -dx * s + dz * c;
    const v = m.get(Math.floor(ox), y, Math.floor(oz));
    if (v) n.v[n.idx(x, y, z)] = v;
  }
  patchHidden(n);
  return n;
}
