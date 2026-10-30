// Art v2 aircraft (H66, after the owner's concept docs/art-v2/targets/HE1_helicopters.png, I5-A_airport.png,
// SC2-C_police-hq-helipad.png, SC4-B_heli-chase-neon-rain.png): block models of the helicopters - the Skylark (news blue and
// white), the police air unit (black and white, its light bar, the searchlight under the nose), the rescue helicopter
// (red and white), the Hornet gunship (grey - MV1, a narrow tandem cabin, stub wings and missile pods) - and the Larkspur light
// plane (white, a red stripe, its wings banking). Each drawn by the art v2 host (game/host.js _air) up the screen by its
// height as render/aircraft.js lifts it (V2_LIFT), its main rotor its own sprite over the mast: the blades turning while
// it spools, a blurred disc at speed (the tips' paint a ring). Loaded the first time an aircraft is near (the renderer's
// code budget is full: this stays out of it - test/perf.test.js), made here on the page a heading at a time (the host's
// generated-sprite budget), at half resolution (the live game draws 2 world px a pixel anyway).
//   drawAir(H, v, now, me) -> true once drawn (the overlay then leaves the aircraft to it)
//   airLights(H, v, now, night) its lamps after dark, the searchlight's pool on the ground
//   bodyModel(type, o) / rotorModel(R, disc, tip) the Vox models (tests)
import { Vox } from './voxel.js';
import { ramp } from './palette.js';
import { F_GLASS, F_NOCAST } from './gbuf.js';
import { compactVox, halveVox, renderCompact, trimSprite } from './game/actors.js';
import { VEHICLE_BY_INDEX } from '../../shared/vehicles.js';
import { VF } from '../../shared/constants.js';
import { altOfByte, isPlane } from '../../shared/flight.js';
import { spotOf } from '../render/aircraft.js';

const TAU = Math.PI * 2;
const quant = (a, N) => ((Math.round(a / TAU * N) % N) + N) % N;
// the game's aircraft -> the model and its look (HE1's liveries)
export const TYPES = {
  heli: { body: '#e9edf2', trim: '#2c55b8', lower: '#e9edf2', tip: '#f2c230' },   // (a private or charter Skylark: LIVERIES)
  policeheli: { body: '#1d1f24', trim: '#eef0f3', lower: '#1d1f24', tip: '#e8402e', bar: true, light: true },
  rescueheli: { body: '#d8382e', trim: '#f2f2f2', lower: '#d8382e', tip: '#f2f2f2', cross: true },
  gunship: { body: '#646a70', trim: '#80868c', lower: '#4c5157', tip: '#f2c230', gun: true },   // (grey: the owner's MV1, H78)
  plane: { body: '#f1f2f0', trim: '#c4302b', plane: true },
  duster: { body: '#f2c230', trim: '#2f7a3c', lower: '#e0a81e', plane: true, boom: true },   // (the crop duster: yellow, a green stripe, the spray boom)
  // batch 4 (the owner: "Add more helicopter and plane looks"): the news crew's own (deep blue and gold, the camera
  // turret under the nose, the dish on the roof, the mast), the air ambulance (white, a green band, the blue star of
  // life on its doors, the beacon), the floatplane (on its floats)
  newsheli: { body: '#1d3f8a', trim: '#f2c230', lower: '#e9edf2', tip: '#f2c230', cam: true, news: true },
  medheli: { body: '#f4f4f0', trim: '#1f9a6a', lower: '#f4f4f0', tip: '#f2f2f2', med: true },
  seaplane: { body: '#f1f2f0', trim: '#c8302c', plane: true, floats: true },
};
// the liveries a civil aircraft wears by its variant (the wire's vr): the Skylarks, the Larkspurs, the floatplanes
export const LIVERIES = {
  heli: [{}, { body: '#c8302c', trim: '#26282e', lower: '#c8302c' }, { body: '#26282e', trim: '#e0b040', lower: '#26282e', tip: '#e0b040' }, { body: '#f2c230', trim: '#2a2c32', lower: '#f2c230' }, { body: '#e9edf2', trim: '#2f8a5a', lower: '#e9edf2' }],
  plane: [{}, { trim: '#2c55b8' }, { body: '#f2c230', trim: '#26282e' }, { body: '#ece4cc', trim: '#2f7a3c' }, { body: '#2a3448', trim: '#e8e8e4' }],
  seaplane: [{}, { body: '#e8a020', trim: '#26282e' }, { body: '#2f6ab0', trim: '#f1f2f0' }],
};
export const liveryOf = (type, vr) => (LIVERIES[type] ? (((vr | 0) % LIVERIES[type].length) + LIVERIES[type].length) % LIVERIES[type].length : 0);
const typeOf = (type, li) => (li && LIVERIES[type] ? { ...TYPES[type], ...LIVERIES[type][li] } : TYPES[type] || TYPES.heli);
export const LIFT = 0.66;   // (render/aircraft.js V2_LIFT: px up the screen per px of altitude)
const R6 = (h, n = 6, k = 3, o) => ramp(h, n, k, o);

function mats(m, T) {
  const panel = (x, y, z) => (Math.round(x) % 23 === 0 ? -0.8 : 0) + (z > 40 ? 0.4 : 0);
  return {
    body: m.mat({ ramp: R6(T.body, 7, 3, { dark: 0.6, light: 0.6, shift: 0.24 }), k: 3, shade: panel }),
    trim: m.mat({ ramp: R6(T.trim, 6, 3), k: 3, shade: panel }),
    lower: m.mat({ ramp: R6(T.lower || T.body, 6, 3), k: 2.4 }),
    dark: m.mat({ ramp: R6('#2a2c32', 5, 2), k: 2 }),
    metal: m.mat({ ramp: R6('#9aa2ac', 6, 3, { light: 0.7 }), k: 3 }),
    glass: m.mat({ ramp: ramp('#22324a', 6, 2, { light: 0.55, shift: 0.4 }), k: 1.2, flag: F_GLASS, shade: (x, y, z) => ((x * 0.9 + z * 1.7 + y * 0.3) % 19 < 2.4 ? 1.8 : 0) + (z > 36 ? 0.7 : 0) }),
    red: m.mat({ ramp: R6('#e8402e', 5, 2), k: 3, emi: [255, 70, 50, 170] }),
    blue: m.mat({ ramp: R6('#3a6cff', 5, 2), k: 3, emi: [70, 120, 255, 170] }),
    green: m.mat({ ramp: R6('#34c759', 5, 2), k: 3, emi: [60, 230, 110, 170] }),
    lamp: m.mat({ ramp: R6('#f4f0d8', 5, 3), k: 3, emi: [255, 240, 200, 200] }),
    white: m.mat({ ramp: R6('#eef0f3', 5, 3), k: 3 }),
  };
}

// ---- the helicopters: x from the tail (0) to the nose (L), y across (the right side +y), z up -----------------------------
// (sized to the game's footprint: shared/vehicles.js L x W; the gunship's stub wings stand out wider)
function heliModel(type, T) {
  const L = type === 'gunship' ? 160 : type === 'rescueheli' ? 156 : 150, W = T.gun ? 96 : 58, H = 56, cy = W / 2;
  const m = new Vox(L, W, H), M = mats(m, T);
  const hw = T.gun ? 13 : 23;   // (the cabin's half width)
  // the skids on their struts
  for (const s of [-1, 1]) {
    const y = cy + s * (T.gun ? 14 : 22);
    m.box(L * 0.24, y - 1.5, 1, L * 0.76, y + 1.5, 4, M.dark);
    m.box(L * 0.74, y - 1.5, 2, L * 0.78, y + 1.5, 6, M.dark);   // (the skid's toe turned up)
    for (const x of [L * 0.36, L * 0.64]) for (let z = 3; z < 15; z++) { const yy = y - s * (z - 3) * 0.45; m.box(x, yy - 1, z, x + 2.5, yy + 1, z + 1, M.dark); }
  }
  // the cabin: a rounded body (an ellipsoid over a flatter floor), the nose glazed, side windows, the doors' seam
  const cx = L * 0.6, rx = L * (T.gun ? 0.3 : 0.27), cz = 26, rz = T.gun ? 13 : 15;
  m.fill((x, y, z) => {
    const ex = (x - cx) / rx, ey = (y - cy) / hw, ez = (z - cz) / rz;
    if (z < 12 || ex * ex + ey * ey + Math.max(0, ez) ** 2 + Math.min(0, ez) ** 2 * 0.35 > 1) return -1;
    const side = Math.abs(y - cy) > hw * 0.72, front = ex > 0.55;
    if (T.gun) { if (z > 31 && ex > -0.35 && ex < 0.8 && Math.abs(y - cy) < hw * 0.75) return M.glass; }   // (the tandem canopy)
    else {
      if (front && z > 20) return M.glass;                                       // the nose's glazing
      if (side && z > 24 && z < 35 && ex > -0.45 && ex < 0.5 && Math.abs(ex - 0.02) > 0.05) return M.glass;   // the cabin's side windows
    }
    if (T.cross && side && z > 15 && z < 23 && ex > -0.5 && ex < 0.4) return M.trim;   // (the rescue's white band)
    if (!T.gun && side && z > 22.5 && z < 24.5) return M.trim;                     // the stripe along the sides
    if (type === 'policeheli' && side && z >= 15 && z <= 34 && ex > -0.42 && ex < 0.42) return M.trim;   // (the police one's white doors)
    return z < 17 ? M.lower : M.body;
  }, Math.floor(cx - rx), 0, 12, Math.ceil(cx + rx) + 1, W, H);
  // the engine housing over the cabin, its exhausts; the mast and the hub
  m.box(L * 0.42, cy - 9, 38, L * 0.64, cy + 9, 45, M.body);
  m.box(L * 0.42, cy - 7, 45, L * 0.6, cy + 7, 47, M.lower);
  for (const s of [-1, 1]) m.box(L * 0.4, cy + s * 6 - 2, 40, L * 0.44, cy + s * 6 + 2, 44, M.dark);
  m.cyl('z', L * 0.56, cy, 0, 3, 46, 53, M.dark);
  // the tail boom tapering to the fin, the tailplane, the fin and its tail rotor
  m.fill((x, y, z) => { const t = (x - L * 0.06) / (L * 0.36), r = 3 + 3.5 * t, zc = 32 - 2 * t; return Math.hypot(y - cy, z - zc) < r ? (t > 0.15 && Math.abs(z - zc) < 1.2 && !T.gun ? M.trim : M.body) : -1; }, Math.floor(L * 0.04), 0, 20, Math.ceil(L * 0.44), W, 42);
  m.box(L * 0.12, cy - 13, 30, L * 0.2, cy + 13, 32, M.body);
  m.fill((x, y, z) => (Math.abs(y - cy) < 1.6 && z > 28 && z < 48 - (L * 0.12 - x) * 0.3 && x < L * 0.12 - (z - 28) * 0.35 + 6 ? (z > 42 ? M.trim : M.body) : -1), 0, 0, 26, Math.ceil(L * 0.14), W, 50);
  m.cyl('y', L * 0.05, cy + 2, 42, 9, cy + 2, cy + 3, M.metal);   // (the tail rotor, seen still: a disc)
  m.box(0, cy - 1, 44, 3, cy + 1, 47, M.red);                       // (the beacon on the fin)
  // the police one: the light bar on the roof, the searchlight under the nose; the news one: its camera ball
  if (T.bar) { m.box(L * 0.66, cy - 10, 40, L * 0.7, cy - 1, 43, M.red); m.box(L * 0.66, cy + 1, 40, L * 0.7, cy + 10, 43, M.blue); }
  if (T.light) { m.ell(L * 0.78, cy, 9, 5, 5, 4, M.dark); m.box(L * 0.81, cy - 3, 7, L * 0.83, cy + 3, 11, M.lamp); }
  if (T.cam) m.ell(L * 0.8, cy, 10, T.news ? 5.5 : 4, T.news ? 5.5 : 4, T.news ? 5 : 4, M.dark);
  if (T.news) { m.box(L * 0.83, cy - 2, 8, L * 0.85, cy + 2, 12, M.glass); m.cyl('z', L * 0.34, cy, 0, 5, 44, 46, M.white); m.ell(L * 0.34, cy, 47, 4, 4, 2, M.white); m.box(L * 0.46, cy - 0.5, 47, L * 0.47, cy + 0.5, 58, M.dark); }   // (the camera's lens, the dish, the mast)
  if (T.med) {   // the star of life on each door, the beacon on the roof, the hoist's rail over the door
    const sx = L * 0.6, sz = 26;
    m.fill((x, y, z) => { if (Math.abs(y - cy) < hw * 0.6 || !m.get(Math.floor(x), Math.floor(y), Math.floor(z))) return -1; const dx = x - sx, dz = z - sz, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx); return r < 6 * (0.42 + 0.58 * Math.abs(Math.cos(a * 3)) ** 3) ? M.blue : -1; }, Math.floor(sx - 7), 0, sz - 7, Math.ceil(sx + 7), W, sz + 7);
    m.box(L * 0.5, cy - 2, 47, L * 0.53, cy + 2, 49, M.red);
  }
  if (T.cross) { m.box(L * 0.5, cy - 4, 45, L * 0.54, cy + 4, 46, M.white); m.box(L * 0.48, cy - 1.5, 45, L * 0.56, cy + 1.5, 46, M.white); }   // (a white cross on the roof)
  // the gunship: stub wings, the rocket pods under them (red-tipped), the chin gun
  if (T.gun) {
    m.box(L * 0.5, cy - 46, 20, L * 0.6, cy + 46, 23, M.lower);
    for (const s of [-1, 1]) for (const [d, r] of [[38, 5], [27, 4]]) {   // (two pods a wing: MV1)
      const y = cy + s * d;
      m.cyl('x', 0, y, 16, r, L * 0.44, L * 0.66, M.dark);
      m.cyl('x', 0, y, 16, r - 1, L * 0.66, L * 0.69, M.red);
    }
    m.box(L * 0.86, cy - 2, 10, L * 0.95, cy + 2, 13, M.dark);
  }
  return m;
}

// ---- the Larkspur light plane: a high wing (banking: one side up, the other down), the red stripe, the tailplane and
// fin, the cowling and the propeller, the wheels; the wing tips' lights (red left, green right) ---------------------------
// (banked, the model stands zoffOf(bank) px higher in a taller box, the low wing tip still in it: drawn that much lower)
export const zoffOf = (bank) => (bank ? Math.ceil(84 * Math.abs(Math.sin(bank))) + 2 : 0);
// Banked, the whole plane rolls about its fuselage - the body, the fin, the wheels and the propeller with the wings (the
// owner, 10-16: "Plane wings tilt without the body: bank them together"): it's built level, then turned (rolled).
function planeModel(T, bank) {
  const m = planeLevel(T, zoffOf(bank));
  return bank ? rolled(m, bank, 168 / 2, 18 + zoffOf(bank) + 4) : m;
}
// (each voxel of the rolled model from the level one's, turned back about the x axis through (cy, zr): banked right, the
// right wing (+y) down; the nearest voxel to the turned-back point, else the next nearest across its nearer edge, so a
// thin strut keeps no holes and the model hardly thickens)
function rolled(src, bank, cy, zr) {
  const out = new Vox(src.w, src.d, src.h), c = Math.cos(bank), s = Math.sin(bank);
  out.mats = src.mats;
  for (let z = 0; z < src.h; z++) for (let y = 0; y < src.d; y++) {
    const dy = y + 0.5 - cy, dz = z + 0.5 - zr, ys = cy + dy * c - dz * s - 0.5, zs = zr + dy * s + dz * c - 0.5;
    const y0 = Math.floor(ys), z0 = Math.floor(zs), fy = ys - y0, fz = zs - z0;
    const ny = fy < 0.5 ? y0 : y0 + 1, nz = fz < 0.5 ? z0 : z0 + 1, order = Math.abs(fy - 0.5) < Math.abs(fz - 0.5) ? [[ny, nz], [fy < 0.5 ? y0 + 1 : y0, nz]] : [[ny, nz], [ny, fz < 0.5 ? z0 + 1 : z0]];
    for (let x = 0; x < src.w; x++) {
      let v = 0;
      for (const [yy, zz] of order) { v = src.get(x, yy, zz); if (v) break; }
      if (v) out.v[out.idx(x, y, z)] = v;
    }
  }
  return out;
}
function planeLevel(T, zo) {
  const L = 128, W = 168, H = 64 + 2 * zo, cy = W / 2, zb = 18 + zo;
  const m = new Vox(L, W, H), M = mats(m, T);
  const dz = () => 0;   // (level: the roll is the whole model's - planeModel)
  // the fuselage: thin at the tail, the cabin's bulk, the cowling at the nose
  m.fill((x, y, z) => {
    const t = x / L, r = t < 0.5 ? 3 + 8 * (t / 0.5) : t < 0.86 ? 11 : 11 - (t - 0.86) * 30, zc = zb + 4 + (t < 0.5 ? (0.5 - t) * 8 : 0);
    const d = Math.hypot(y - cy, (z - zc) * 1.15);
    if (d > r) return -1;
    if (z > zc + 3 && t > 0.56 && t < 0.74) return M.glass;
    if (t > 0.86) return z > zc - 1 ? M.body : M.lower;
    if (Math.abs(z - (zc - 1)) < 1.1) return M.trim;
    return M.body;
  }, 0, cy - 14, zo + 6, L, cy + 14, zo + 40);
  // the wing over the cabin (its struts to the fuselage), the tips red
  m.fill((x, y, z) => { const zw = zb + 15 + dz(y); return z >= zw && z < zw + 3 ? (Math.abs(y - cy) > 74 ? M.trim : M.body) : -1; }, Math.floor(L * 0.52), 2, 0, Math.ceil(L * 0.67), W - 2, H);
  for (const s of [-1, 1]) for (let k = 0; k < 30; k++) { const y = cy + s * (9 + k), z = zb + 2 + k * 0.42 + dz(cy + s * (9 + k)) * (k / 30); m.box(L * 0.58, y, z, L * 0.6, y + 1, z + 1, M.dark); }
  // wing-tip lights
  m.box(L * 0.6, 1, zb + 15 + dz(2), L * 0.64, 4, zb + 18 + dz(2), M.red);
  m.box(L * 0.6, W - 4, zb + 15 + dz(W - 2), L * 0.64, W - 1, zb + 18 + dz(W - 2), M.green);
  // the tailplane (it rolls with it too) and the fin
  m.fill((x, y, z) => { const zt = zb + 6 + dz(y); return z >= zt && z < zt + 2 ? M.body : -1; }, 2, cy - 26, 0, 18, cy + 26, H);
  m.fill((x, y, z) => (Math.abs(y - cy) < 1.6 && z > zb + 6 && z < zb + 30 && x < 18 - (z - zb - 6) * 0.45 ? (z > zb + 24 ? M.trim : M.body) : -1), 0, 0, zb, 20, W, H);
  // the propeller (two blades, still) and the spinner
  m.box(L - 4, cy - 2, zb + 1, L, cy + 2, zb + 6, M.dark);
  m.box(L - 2, cy - 1, zb - 9, L - 1, cy + 1, zb + 17, M.dark);
  // the wheels: the main gear under the wing, the nose wheel
  for (const s of [-1, 1]) { m.cyl('y', L * 0.58, 0, zo + 5, 5, cy + s * 16 - 2, cy + s * 16 + 2, M.dark); for (let z = zo + 5; z < zb; z++) m.box(L * 0.58 - 1, cy + s * (16 - (z - zo - 5) * 0.5) - 1, z, L * 0.58 + 1, cy + s * (16 - (z - zo - 5) * 0.5) + 1, z + 1, M.metal); }
  m.cyl('y', L * 0.88, 0, zo + 4, 4, cy - 1.5, cy + 1.5, M.dark); m.box(L * 0.88 - 1, cy - 1, zo + 4, L * 0.88 + 1, cy + 1, zb, M.metal);
  if (T.floats) {   // (the floatplane: the wheels' place taken by two long floats on their struts, pointed at the bow)
    m.fill((x, y, z) => (z < zo + 6 ? 0 : -1), 0, 0, 0, L, W, zo + 6);
    for (const s of [-1, 1]) {
      m.fill((x, y, z) => { const t = x / L, r = 4.2 * (t > 0.82 ? Math.max(0.15, 1 - (t - 0.82) / 0.2) : t < 0.12 ? 0.4 + t * 5 : 1); return Math.hypot(y - cy - s * 17, (z - zo - 4) * 1.3) < r ? (z > zo + 5.5 ? M.trim : M.body) : -1; }, Math.floor(L * 0.08), Math.floor(cy + s * 17 - 6), 0, Math.ceil(L * 0.98), Math.ceil(cy + s * 17 + 6), zo + 9);
      for (const x of [L * 0.45, L * 0.72]) for (let z = zo + 7; z < zb; z++) m.box(x, cy + s * (17 - (z - zo - 7) * 0.6) - 1, z, x + 2, cy + s * (17 - (z - zo - 7) * 0.6) + 1, z + 1, M.metal);
    }
  }
  m.box(L * 0.3, cy - 1, zb + 11, L * 0.34, cy + 1, zb + 13, M.red);   // (the beacon on the back)
  if (T.boom) {   // (the crop duster: the spray boom under the wing's trailing edge, its nozzles; the hopper's lid ahead of the cabin)
    for (let y = 8; y < W - 8; y++) { const z = zb + 12 + dz(y); m.box(L * 0.5, y, z, L * 0.52, y + 1, z + 1, M.dark); if (y % 9 === 0) m.box(L * 0.5, y, z - 2, L * 0.51, y + 1, z, M.metal); }
    m.box(L * 0.75, cy - 6, zb + 12, L * 0.83, cy + 6, zb + 14, M.trim);
  }
  return m;
}

// The main rotor: the blades (4, seen still or turning) or, up to speed, the disc they blur into - a faint grey with the
// tips' paint a ring round it (drawn see-through: the host's alpha)
export function rotorModel(R, disc, tip) {
  const n = 2 * R + 2, c = n / 2, m = new Vox(n, n, 4);
  const blade = m.mat({ ramp: R6('#4a4d54', 5, 2), k: 2 }), tipM = m.mat({ ramp: R6(tip, 5, 2), k: 3 }), hub = m.mat({ ramp: R6('#2a2c32', 5, 2), k: 2 });
  if (disc) {
    const blur = m.mat({ ramp: R6('#c8cdd6', 5, 3, { light: 0.6 }), k: 3, flag: F_NOCAST, shade: (x, y) => (Math.floor(Math.atan2(y - c, x - c) * 6) % 3 === 0 ? 0.6 : 0) });
    const ring = m.mat({ ramp: R6(tip, 5, 2), k: 3, flag: F_NOCAST });
    m.fill((x, y, z) => { const d = Math.hypot(x - c, y - c); return z >= 1 && z < 2 && d < R ? (d > R - 5 ? ring : blur) : -1; });
  } else {
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      const ex = c + ca * R, ey = c + sa * R;
      m.fill((x, y, z) => { const u = (x - c) * ca + (y - c) * sa, w = -(x - c) * sa + (y - c) * ca; return z >= 1 && z < 3 && u > 3 && u < R && Math.abs(w) < 2.6 ? (u > R - 9 ? tipM : blade) : -1; }, Math.floor(Math.min(c, ex) - 3), Math.floor(Math.min(c, ey) - 3), 0, Math.ceil(Math.max(c, ex) + 3), Math.ceil(Math.max(c, ey) + 3), 4);
    }
  }
  m.cyl('z', c, c, 0, 4, 0, 4, hub);
  return m;
}

export function bodyModel(type, o = {}) { const T = typeOf(type, o.li | 0); return T.plane ? planeModel(T, o.bank || 0) : heliModel(type, T); }

// ---- made on the page: the models kept packed (compact), each heading rendered the first time it's wanted -----------------
const MODELS = new Map(), MADE = new Map();
// staged (the live game, drawAir): a model is made over three frames - the full-size model, then halved, then packed and
// its first heading drawn - not all in one (a 60-250 ms hitch when the first one came into view: H69); null until it's
// ready (the overlay's drawing stands in meanwhile)
let stageAt = -1e9;
const STAGE_GAP_MS = 24;   // (a stage a frame at most)
function compact(key, make, half, staged = false) {
  let C = MODELS.get(key);
  if (C) return C;
  if (!staged) { const m = make(); C = compactVox(half ? halveVox(m, 2) : m); MODELS.set(key, C); return C; }
  if (performance.now() - stageAt < STAGE_GAP_MS) return null;
  const was = MADE.get(key);
  if (!was) MADE.set(key, { m: make(), h: null });
  else if (half && !was.h) was.h = halveVox(was.m, 2);
  else { C = compactVox(half ? was.h : was.m); MODELS.set(key, C); MADE.delete(key); }
  stageAt = performance.now();
  return C || null;
}
const BANKS = [-0.6, -0.3, 0, 0.3, 0.6];
export function bodySprite(type, hi, N, bi, px, staged = false, li = 0) {
  const C = compact(`${type}|${bi}|${li}`, () => bodyModel(type, { bank: BANKS[bi] ?? 0, li }), true, staged);
  return C && trimSprite(renderCompact(C, hi * TAU / N, { dither: 0.35, px }));
}
export function rotorSprite(R, disc, tip, hi, N, px, staged = false) {
  const C = compact(`rotor|${R}|${disc ? 1 : 0}|${tip}`, () => rotorModel(R, disc, tip), true, staged);
  return C && trimSprite(renderCompact(C, hi * TAU / N, { dither: disc ? 0.2 : 0.35, px }));
}

const MAST = 0.06, MAST_Z = 50;   // (the rotor's hub: along the body from its middle, and up)
// the altitude drawn: yours from the prediction, the others' eased (render/aircraft.js keeps v._alt)
const altOf = (v) => (v._own && v.ralt !== undefined && v.ralt !== null ? v.ralt : v._alt ?? altOfByte(v.extra | 0));

export function drawAir(H, v, now, me) {
  const def = VEHICLE_BY_INDEX[v.d.m], E = H.E, N = H.tier.N;
  const type = def && TYPES[def.id] ? def.id : 'heli', li = liveryOf(type, v.d.vr), T = typeOf(type, li), px = E.ap || 1;
  const alt = altOf(v), lift = Math.max(0, alt) * LIFT, f = v.flags | 0, hi = quant(v.ra, N);
  // the plane's bank: yours from the prediction, the others' from their turning (render/aircraft.js keeps v._bank)
  const bank = isPlane(def) ? (v._own ? v.rbank : v._bank) || 0 : 0, bi = Math.max(0, Math.min(4, Math.round(bank / 0.3) + 2));
  const key = `air|${type}${li}|${bi}|${hi}|${N}`;
  const mk = () => bodySprite(type, hi, N, bi, px, true, li);
  let k = H._conv(key, mk, true);
  // (past the frame's time for made sprites: the nearest heading made, or this one now if there's none - host.js GEN_MS)
  if (!k) k = H._near((h) => `air|${type}${li}|${bi}|${h}|${N}`, hi, N) || H._near((h) => `air|${type}${li}|2|${h}|${N}`, hi, N) || H._conv(key, mk, 2);
  if (!k) return false;
  const o = H.opts, z0 = lift + (alt < 1 ? H._z0(v, false) : 0) - (T.plane ? zoffOf(BANKS[bi]) : 0);
  o.alpha = 1; o.flash = 0; o.xray = !!me && alt < 30; o.flipX = false; o.shadow = alt < 6; o.under = 0; o.air = alt > 24;   // (off the ground its shadow is the overlay's: render/aircraft.js airShadow - the march would make a column of it)
  o.tint = f & VF.WRECK ? [0.32, 0.3, 0.3] : null;
  E.drawSprite(k, v.rx, v.ry, z0, o);
  H.n.drawn++;
  // yours: the headings either side made ahead while the frame has time, so a turn finds them made
  if (me) for (let d = -1; d <= 1; d += 2) { const h = (hi + d + N) % N; H._conv(`air|${type}${li}|${bi}|${h}|${N}`, () => bodySprite(type, h, N, bi, px, true, li), true); }
  // the main rotor over the mast: the blades while it spools (turning), the blurred disc once it's up to speed
  if (!T.plane && !(f & VF.WRECK)) {
    const R = def.rotor || 76, s = v._spin || 0, c = Math.cos(v.ra), sn = Math.sin(v.ra), mx = v.rx + c * def.L * MAST, my = v.ry + sn * def.L * MAST;
    o.shadow = alt < 6; o.xray = false; o.tint = null;
    // (up to speed, the blurred disc is the overlay's - render/aircraft.js rotorDisc: a canvas blends, the renderer only
    // dithers - and here only the blades while they're still to be seen)
    if (s < 0.9) {
      const bh = quant((v._ph || 0) % (Math.PI / 2), N), bk = H._conv(`air|blades|${R}|${T.tip}|${bh}|${N}`, () => rotorSprite(R, false, T.tip, bh, N, px, true), true) || H._near((h) => `air|blades|${R}|${T.tip}|${h}|${N}`, bh, N);
      if (bk) { o.alpha = 1 - Math.max(0, (s - 0.55) / 0.35); E.drawSprite(bk, mx, my, z0 + MAST_Z, o); }
    }
    o.alpha = 1;
  }
  o.air = false; o.tint = null;
  return true;
}

// (the searchlight's spot on the ground: render/aircraft.js spotOf - eased there each frame, read here)
export { spotOf };

const COL = { red: [1, 0.18, 0.14], blue: [0.3, 0.5, 1], green: [0.3, 1, 0.45], white: [0.92, 0.94, 1], beam: [1, 0.96, 0.86] };
// after dark: the light bar (red and blue in turn), the beacon, the plane's wing-tip lights; the searchlight's pool
export function airLights(H, v, now, night) {
  const def = VEHICLE_BY_INDEX[v.d.m], f = v.flags | 0;
  if (!def || (f & VF.WRECK)) return;
  const T = TYPES[def.id] || TYPES.heli, alt = altOf(v), z = Math.max(0, alt) * LIFT, c = Math.cos(v.ra), s = Math.sin(v.ra);
  const at = (fx, fy) => [v.rx + c * fx - s * fy, v.ry + s * fx + c * fy];
  const k = 0.4 + 1.4 * night;
  if (T.med && (f & (VF.SIREN | VF.BEACON)) && Math.floor(now * 3) % 2) { const [x, y] = at(-def.L * 0.06, 0); H._light(x, y, z + 48, 120, COL.red, 1.4 * k); }   // (the air ambulance's beacon on a call)
  if (T.bar && (f & VF.ROTOR)) { const [x, y] = at(def.L * 0.18, 0), red = Math.floor(now * 6) % 2; H._light(x, y, z + 44, 150, red ? COL.red : COL.blue, 1.6 * k); }
  if (Math.floor(now * 1.3 + v.id * 0.37) % 2) { const [x, y] = at(-def.L * 0.48, 0); H._light(x, y, z + 46, 50, COL.red, 0.9 * k); }
  if (T.plane) { const hs = (def.span || 168) / 2; let [x, y] = at(def.L * 0.12, -hs); H._light(x, y, z + 34, 46, COL.red, 0.9 * k); [x, y] = at(def.L * 0.12, hs); H._light(x, y, z + 34, 46, COL.green, 0.9 * k); }
  const q = v._spot;   // (render/aircraft.js spotOf, eased each frame)
  if (q && ((v.parent >>> 24) & 128)) { H._light(q.x, q.y, 30, 190, COL.beam, 3.2 * Math.max(0.35, night)); const [x, y] = at(def.L * 0.32, 0); H._light(x, y, z + 8, 40, COL.beam, 1.2); }
}
