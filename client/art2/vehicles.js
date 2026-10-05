// Art v2 vehicles: every vehicle in the game (shared/vehicles.js) as a voxel model, built to the V1-V6
// targets (docs/art-v2/targets). Models are rendered at any heading by voxel.js, so cars turn smoothly
// and are lit, shaded and shadowed like everything else. 1 voxel = 1 world px; the model's x axis runs
// from the rear (0) to the front (L), y across (0 = left side), z up. Footprints match the server's.
//
//   vehicleModel(type, { paint, lights, siren, state, cargo })  -> Vox
//     type     any id from shared/vehicles.js (compact sedan taxi sports pickup flatbed van bus police swat
//              ambulance armored bike policebike bicycle speedboat dinghy jetski policeboat boxtruck
//              dumptruck mixer tanker garbage firetruck towtruck)
//     paint    a hex colour for civilian bodies (each model has a default)
//     lights   0..1 headlights / tail lights on       siren   light bar flashing (true) or off
//     state    'clean' | 'dented' | 'wrecked' | 'burnt'
//     cargo    crate tiers to strap onto a bed or deck, e.g. [1, 3]
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, hash } from './gbuf.js';

export const VEHICLE_DIMS = {
  compact: [84, 44], sedan: [100, 48], taxi: [100, 48], sports: [96, 48], pickup: [110, 50], flatbed: [150, 56],
  van: [112, 54], bus: [190, 60], police: [100, 48], swat: [120, 58], ambulance: [116, 54], armored: [118, 56],
  bike: [48, 20], policebike: [50, 20], bicycle: [40, 14], speedboat: [104, 48], dinghy: [80, 40], jetski: [46, 22],
  policeboat: [104, 48], boxtruck: [150, 58], dumptruck: [140, 60], mixer: [146, 60], tanker: [160, 58],
  garbage: [140, 60], firetruck: [176, 64], towtruck: [134, 58],
};
const DEFAULT_PAINT = {
  compact: '#3f8a46', sedan: '#3f6a8e', taxi: '#e8b830', sports: '#c8302c', pickup: '#b0402e', van: '#e2e0d8',
  police: '#22242c', swat: '#262c44', ambulance: '#ecebe4', armored: '#7a7e84', flatbed: '#e6e2d8', boxtruck: '#e6e2d8',
  dumptruck: '#c0402c', mixer: '#e6e2d8', tanker: '#c0402c', garbage: '#e6e2d8', firetruck: '#c0302a', towtruck: '#e6e2d8',
  bus: '#e8e0cc', bike: '#c8302c', policebike: '#e8e8e4', bicycle: '#4a7a3a', speedboat: '#f0eee8', dinghy: '#4e6a4a',
  jetski: '#c8302c', policeboat: '#f0eee8',
};

const R = (h, n = 6, k) => ramp(h, n, k);

// ---- building blocks ------------------------------------------------------------------------------
// A body block from x0 (rear) to x1 (front), y0..y1 across, z0..z1 up. fr / br: how far the top of the
// front / rear face leans in (windscreens, hatchbacks); tuck: how far the sides lean in at the top;
// r: plan corner radius. mat: a material, or fn(x, y, z, s) with s = { t, side, front, back, top }.
function shell(m, o) {
  const { x0, x1, z0, z1 } = o, y0 = o.y0 ?? 2, y1 = o.y1 ?? m.d - 2;
  const fr = o.fr || 0, br = o.br || 0, tuck = o.tuck || 0, r = o.r ?? 4, rz = o.rz ?? 0;
  m.fill((x, y, z) => {
    const t = (z - z0) / Math.max(1, z1 - z0);
    const xf = x1 - fr * t, xb = x0 + br * t, ya = y0 + tuck * t, yb = y1 - tuck * t;
    if (x > xf || x < xb || y < ya || y > yb) return -1;
    // rounded plan corners, and a rounded top edge (rz)
    const rr = r + (rz && z1 - z < rz ? rz - (z1 - z) : 0);
    const cx = Math.max(xb + rr, Math.min(xf - rr, x)), cy = Math.max(ya + rr, Math.min(yb - rr, y));
    if (rr > 0 && (x - cx) ** 2 + (y - cy) ** 2 > rr * rr) return -1;
    const s = { t, side: Math.min(y - ya, yb - y), front: xf - x, back: x - xb, top: z1 - z };
    return typeof o.mat === 'function' ? o.mat(x, y, z, s) : o.mat;
  }, Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.max(0, Math.floor(z0)), Math.min(m.w, Math.ceil(x1) + 1), Math.min(m.d, Math.ceil(y1) + 1), Math.min(m.h, Math.ceil(z1)));
}
// glass in a band of the skin, body on the pillars and the roof
function glassy(body, glass, o = {}) {
  const [za, zb] = o.band || [0, 999], pillars = o.pillars || [], pw = o.pw ?? 1.6, roof = o.roof ?? 2;
  return (x, y, z, s) => {
    if (s.top < roof || z < za || z > zb) return body;
    const skin = s.side < 1.6 || s.front < 2.2 || s.back < 2.2;
    if (!skin) return body;
    if (s.side < 1.6 && (pillars.some((p) => Math.abs(x - p) < pw) || s.front < 2.5 || s.back < 2.5)) return body;
    if (o.sideGlass === false && s.side < 1.6) return body;
    if (o.frontGlass === false && s.front < 2.2) return body;
    if (o.backGlass === false && s.back < 2.2) return body;
    return glass;
  };
}
function wheels(m, xs, r, mats, o = {}) {
  const inset = o.inset ?? 3, wd = o.width ?? 7, W = m.d;
  // arches first (cut out of the body), then the tyres and hubs
  for (const x of xs) m.fill((px, py, pz) => (((px - x) ** 2 + (pz - r) ** 2 < (r + 1.2) ** 2 && (py < inset + wd || py > W - inset - wd)) ? (mats.arch && (px - x) ** 2 + (pz - r) ** 2 > (r + 0.2) ** 2 ? mats.arch : 0) : -1), Math.floor(x - r - 3), 0, 0, Math.ceil(x + r + 3), W, Math.ceil(2 * r + 3));
  for (const x of xs) for (const [a, b] of [[inset, inset + wd], [W - inset - wd, W - inset]]) m.cyl('y', x, 0, r, r, a, b, mats.tyre, r * 0.55, mats.hub);
}
// head and tail lights, a bumper at each end
function lamps(m, M, o) {
  const W = m.d, L = m.w, zh = o.zh ?? 12, h = o.h ?? 4, inset = o.inset ?? 4, wd = o.wd ?? 7;
  for (const [a, b] of [[inset, inset + wd], [W - inset - wd, W - inset]]) {
    m.fill((x, y, z) => (m.get(Math.floor(x) - 1, Math.floor(y), Math.floor(z)) && !m.get(Math.floor(x) + 1, Math.floor(y), Math.floor(z)) ? M.head : -1), L - 4, a, zh, L, b, zh + h);
    m.fill((x, y, z) => (m.get(Math.floor(x) + 1, Math.floor(y), Math.floor(z)) && !m.get(Math.floor(x) - 1, Math.floor(y), Math.floor(z)) ? M.tail : -1), 0, a, zh + (o.tailUp || 0), 4, b, zh + h + (o.tailUp || 0));
  }
  if (o.bumpers !== false) {
    const bz = o.bz ?? 5;
    m.fill((x, y, z) => (m.get(Math.floor(x) - 2, Math.floor(y), Math.floor(z)) && !m.get(Math.floor(x) + 1, Math.floor(y), Math.floor(z)) ? M.trim : -1), L - 4, 3, bz, L, W - 3, bz + 3);
    m.fill((x, y, z) => (m.get(Math.floor(x) + 2, Math.floor(y), Math.floor(z)) && !m.get(Math.floor(x) - 1, Math.floor(y), Math.floor(z)) ? M.trim : -1), 0, 3, bz, 4, W - 3, bz + 3);
  }
}
function lightbar(m, M, x0, x1, z, o = {}) {
  const W = m.d, y0 = Math.round(W * 0.28), y1 = Math.round(W * 0.72), ym = Math.round(W / 2);
  m.box(x0, y0, z, x1, y1, z + 3, M.bar);
  m.box(x0, y0, z, x1, ym, z + 3, o.amber ? M.amber : M.red);
  m.box(x0, ym, z, x1, y1, z + 3, o.amber ? M.amber : M.blue);
}
function crateOn(m, x, y, z, tier, M) {
  const s = 12;
  const mat = M.crate[Math.max(0, Math.min(3, tier - 1))];
  m.box(x, y, z, x + s, y + s, z + s - 1, mat);
}

function mats(m, paint, o) {
  const lit = o.lights || 0;
  const P = R(paint);
  const M = {
    body: m.mat({ ramp: P, k: 1.4, shade: (x, y, z) => ((Math.round(x + z * 2) % 17) < 1 ? 1.2 : 0) }),
    arch: m.mat({ ramp: R('#1e1e24'), k: 1 }),
    lower: m.mat({ ramp: ramp(P[2], 5, 2), k: 2 }),
    glass: m.mat({ ramp: MAT.glassDark, k: 2, flag: F_GLASS, shade: (x, y, z) => ((Math.round(x * 0.7 + z) % 13) < 2 ? 2 : 0) }),
    tyre: m.mat({ ramp: MAT.tyre, k: 1 }), hub: m.mat({ ramp: MAT.chrome, k: 2 }),
    trim: m.mat({ ramp: MAT.metalDark, k: 2 }), chrome: m.mat({ ramp: MAT.chrome, k: 3 }),
    head: m.mat({ ramp: R('#f6f0d8', 5, 3), k: 3, emi: lit ? [255, 244, 210, 255] : null }),
    tail: m.mat({ ramp: R('#d8302a', 5, 3), k: 3, emi: lit ? [255, 50, 36, 230] : [255, 40, 30, 50] }),
    dark: m.mat({ ramp: R('#2c2e36'), k: 2 }), interior: m.mat({ ramp: R('#3c3232'), k: 2 }),
    white: m.mat({ ramp: MAT.paintWhiteCar, k: 3 }), black: m.mat({ ramp: MAT.paintBlack, k: 3 }),
    bar: m.mat({ ramp: MAT.metalDark, k: 2 }),
    red: m.mat({ ramp: R('#e83a30', 5, 3), k: 3, emi: o.siren ? [255, 50, 40, 255] : null, flag: F_NOCAST }),
    blue: m.mat({ ramp: R('#3a6ae8', 5, 3), k: 3, emi: o.siren ? [60, 110, 255, 255] : null, flag: F_NOCAST }),
    amber: m.mat({ ramp: R('#f0a030', 5, 3), k: 3, emi: o.siren ? [255, 170, 50, 255] : null, flag: F_NOCAST }),
    stripeRed: m.mat({ ramp: R('#c8302c'), k: 3 }), stripeTeal: m.mat({ ramp: R('#2f8a86'), k: 3 }),
    wood: m.mat({ ramp: MAT.woodDock, k: 3, shade: (x) => (Math.round(x) % 6 === 0 ? -0.8 : 0) }),
    steel: m.mat({ ramp: MAT.metal, k: 3 }),
    crate: [R('#b08048'), R('#8a949c'), R('#5e6e3e'), R('#2c2c34')].map((r, i) => m.mat({ ramp: r, k: 3, emi: i === 3 ? [255, 200, 90, 40] : null, shade: (x, y, z) => ((Math.round(z) % 4 === 0 || Math.round(x) % 6 === 0) ? -0.6 : 0) })),
  };
  return M;
}

// a truck cab at the front: short hood, upright cab, big windscreen; returns the cab's rear x
function truckCab(m, M, x1, H, o = {}) {
  const W = m.d, cabL = o.cabL ?? 30, hood = o.hood ?? 12;
  const x0 = x1 - cabL - hood;
  shell(m, { x0, x1, z0: 6, z1: 28, r: 3, rz: 2, mat: M.cab ?? M.body });                                      // hood and grille block
  shell(m, { x0, x1: x1 - hood + 4, z0: 6, z1: H, fr: 6, r: 3, rz: 3, mat: glassy(M.cab ?? M.body, M.glass, { band: [H * 0.55, H - 3], pillars: [x0 + cabL * 0.45], sideGlass: true }) });
  m.box(x1 - 2, 6, 10, x1, W - 6, 22, M.trim);                                                               // grille
  for (const y of [3, W - 6]) m.box(x0 + cabL - 6, y, H - 14, x0 + cabL - 3, y + 3, H - 8, M.trim);           // mirrors
  m.box(x0 + 2, W / 2 - 1, H, x0 + 4, W / 2 + 1, H + 10, M.trim);                                             // exhaust stack
  return x0;
}

// ---- the models ---------------------------------------------------------------------------------
export function vehicleModel(type, o = {}) {
  const [L, W] = VEHICLE_DIMS[type] || VEHICLE_DIMS.sedan;
  const tall = { van: 48, ambulance: 54, armored: 52, swat: 56, bus: 64, flatbed: 50, boxtruck: 64, dumptruck: 56, mixer: 62, tanker: 56, garbage: 62, firetruck: 64, towtruck: 58, pickup: 38 }[type] || 36;
  const m = new Vox(L, W, tall + 14);
  const M = mats(m, o.paint || DEFAULT_PAINT[type] || '#808080', o);
  const lit = o.lights || 0;
  switch (type) {
    case 'compact': case 'sedan': case 'taxi': case 'police': case 'sports': {
      const sp = type === 'sports', cmp = type === 'compact';
      const belt = sp ? 16 : 19, roof = sp ? 28 : cmp ? 32 : 33;
      const lowerMat = type === 'police' ? (x, y, z, s) => (s.side < 2 && x > L * 0.3 && x < L * 0.72 && z > 8 ? M.white : M.body) : M.body;
      const seams = cmp ? [L * 0.5] : sp ? [L * 0.55] : [L * 0.5, L * 0.28, L * 0.72];
      shell(m, { x0: 1, x1: L - 1, z0: 3, z1: belt, r: sp ? 9 : 7, rz: 3, tuck: 0, mat: (x, y, z, s) => {
        if (z < 6) return M.lower;
        if (s.side < 1.5 && seams.some((sx) => Math.abs(x - sx) < 0.6) && z > 6) return M.lower;
        if (s.side < 1.5 && Math.abs(z - (belt - 2)) < 0.6) return M.chrome;
        if (s.side < 1.5 && seams.slice(0, 2).some((sx) => Math.abs(x - (sx + 5)) < 1) && Math.abs(z - (belt - 4)) < 0.6) return M.chrome;   // door handles
        return typeof lowerMat === 'function' ? lowerMat(x, y, z, s) : lowerMat;
      } });
      const c0 = cmp ? L * 0.14 : sp ? L * 0.3 : L * 0.25, c1 = cmp ? L * 0.76 : sp ? L * 0.72 : L * 0.75;
      shell(m, { x0: c0, x1: c1, z0: belt, z1: roof, fr: sp ? 14 : cmp ? 10 : 14, br: cmp ? 3 : sp ? 12 : 10, tuck: 5, r: 4, rz: 2,
        mat: glassy(type === 'police' ? M.white : M.body, M.glass, { band: [belt + 1, roof - 2], pillars: [(c0 + c1) / 2 + (cmp ? 4 : 2)] }) });
      wheels(m, [L * (cmp ? 0.2 : 0.2), L * (cmp ? 0.8 : 0.79)], 7, M);
      lamps(m, M, { zh: belt - 6, h: 4, inset: 4, wd: 9 });
      for (const y of [1, W - 3]) m.box(c1 - 6, y, belt, c1 - 3, y + 2, belt + 3, M.body);                         // mirrors
      if (type === 'taxi') {
        const sign = m.mat({ ramp: R('#f4f0d8'), k: 3, emi: lit ? [255, 240, 180, 200] : null });
        m.box(L / 2 - 6, W / 2 - 5, roof, L / 2 + 6, W / 2 + 5, roof + 4, sign);
        m.fill((x, y, z) => ((y < 3 || y > W - 4) && z >= 12 && z < 15 && x > L * 0.25 && x < L * 0.75 ? (((Math.floor(x / 3) + Math.floor(z / 1.5)) % 2) ? M.black : M.white) : -1), 0, 0, 11, L, W, 16);
      }
      if (type === 'police') lightbar(m, M, L / 2 - 6, L / 2 + 6, roof);
      if (sp) { m.box(2, 4, belt, 6, W - 4, belt + 5, M.trim); m.box(1, 3, belt + 5, 8, W - 3, belt + 6, M.body); }   // rear wing
      break;
    }
    case 'pickup': {
      shell(m, { x0: 1, x1: L - 1, z0: 4, z1: 21, r: 6, rz: 2, mat: (x, y, z) => (z < 7 ? M.lower : M.body) });
      shell(m, { x0: 50, x1: 84, z0: 21, z1: 37, fr: 9, br: 1, tuck: 3, r: 3, rz: 2, mat: glassy(M.body, M.glass, { band: [22, 34], pillars: [68] }) });
      m.fill((x, y) => (x > 4 && x < 49 && y > 4 && y < W - 5 ? 0 : -1), 0, 0, 11, L, W, 22);
      m.box(5, 5, 10, 49, W - 5, 11, M.trim);
      wheels(m, [L * 0.2, L * 0.8], 7.5, M);
      lamps(m, M, { zh: 14, h: 4, inset: 4, wd: 8 });
      (o.cargo || []).forEach((t, i) => crateOn(m, 8 + (i % 3) * 13, 8 + Math.floor(i / 3) * 16, 11, t, M));
      break;
    }
    case 'van': {
      shell(m, { x0: 1, x1: L - 1, z0: 4, z1: 46, fr: 0, r: 5, rz: 3, mat: (x, y, z, s) => {
        if (z < 8) return M.lower;
        if (x > L - 30 && z > 24 && z < 42 && (s.side < 1.6 || s.front < 2.2) && !(s.side < 1.6 && Math.abs(x - (L - 22)) < 1.5)) return M.glass;
        return M.body;
      } });
      m.fill((x, y, z) => (x > L - 14 && z > 24 + (x - (L - 14)) * 1.6 ? 0 : -1), L - 14, 0, 24, L, W, 47);               // sloped windscreen
      m.fill((x, y, z) => (x > L - 15 && z > 23 + (x - (L - 15)) * 1.6 && z < 25 + (x - (L - 15)) * 1.6 && y > 3 && y < W - 3 ? M.glass : -1), L - 15, 0, 23, L, W, 47);
      for (let x = 20; x < L - 34; x += 30) m.box(x, 0, 10, x + 1, 2, 40, M.trim);                                     // panel seams
      wheels(m, [L * 0.18, L * 0.8], 8, M);
      lamps(m, M, { zh: 14, h: 5, inset: 4, wd: 9, tailUp: 6 });
      break;
    }
    case 'ambulance': case 'armored': case 'swat': {
      M.cab = M.body;
      const boxH = type === 'ambulance' ? 54 : type === 'swat' ? 52 : 50;
      const cx0 = truckCab(m, M, L - 1, 42, { cabL: 24, hood: 14 });
      shell(m, { x0: 1, x1: cx0 + 2, z0: 7, z1: boxH, r: 3, rz: 3, mat: (x, y, z, s) => {
        if (type === 'ambulance' && z > 18 && z < 23) return M.stripeRed;
        if (type !== 'ambulance' && s.side < 1.6 && z > 30 && z < 36 && (Math.floor(x / 14) % 3 === 1)) return M.glass;   // gun-port windows
        if (type === 'armored' && (Math.round(x) % 12 === 0 || Math.round(z) % 12 === 0) && s.side < 1.6) return M.lower;   // riveted plates
        return M.body;
      } });
      wheels(m, [L * 0.18, L * 0.8], 8.5, M);
      lamps(m, M, { zh: 14, h: 5, inset: 4, wd: 8, tailUp: 10 });
      if (type === 'ambulance') { lightbar(m, M, cx0 - 2, cx0 + 4, boxH); for (const x of [4, cx0 - 8]) m.box(x, 2, boxH - 6, x + 4, 5, boxH - 2, M.red); }
      if (type === 'swat') { lightbar(m, M, cx0 + 4, cx0 + 12, 42); m.box(6, 4, boxH, cx0 - 4, 6, boxH + 3, M.trim); m.box(6, W - 6, boxH, cx0 - 4, W - 4, boxH + 3, M.trim); }
      if (type === 'armored') for (const x of [6, cx0 - 10]) m.box(x, 2, boxH - 4, x + 4, 5, boxH - 1, M.amber);
      break;
    }
    case 'bus': {
      shell(m, { x0: 1, x1: L - 1, z0: 7, z1: 62, r: 4, rz: 4, mat: (x, y, z, s) => {
        if (z < 12) return M.lower;
        if (z > 18 && z < 24) return M.stripeTeal;
        const win = z > 30 && z < 50;
        if (win && (s.side < 1.6 || s.front < 2.2) && !(s.side < 1.6 && Math.round(x) % 22 < 2)) return M.glass;
        return M.body;
      } });
      m.box(L / 2 - 20, W / 2 - 8, 62, L / 2, W / 2 + 8, 66, M.steel);                                               // roof units
      m.box(30, W / 2 - 6, 62, 44, W / 2 + 6, 65, M.steel);
      for (const x of [L - 30, L / 2 + 6]) m.box(x, 0, 12, x + 14, 2, 50, M.glass);                                   // doors
      wheels(m, [L * 0.18, L * 0.82], 9, M);
      lamps(m, M, { zh: 14, h: 5, inset: 4, wd: 8 });
      break;
    }
    case 'flatbed': case 'boxtruck': case 'dumptruck': case 'mixer': case 'tanker': case 'garbage': case 'towtruck': {
      M.cab = type === 'tanker' || type === 'dumptruck' ? M.body : M.white;
      const cx0 = truckCab(m, M, L - 1, 46, { cabL: 30, hood: 14 });
      // chassis rail and fuel tank
      m.box(4, 10, 6, cx0, W - 10, 11, M.trim);
      m.cyl('x', 0, 5, 9, 4, cx0 - 22, cx0 - 4, M.steel);
      const back0 = 2, back1 = cx0 - 2;
      if (type === 'flatbed') {
        m.box(back0, 3, 11, back1, W - 3, 15, M.wood);
        for (const [a, b] of [[3, 5], [W - 5, W - 3]]) m.box(back0, a, 15, back1, b, 20, M.wood);
        m.box(back1 - 3, 3, 15, back1, W - 3, 42, M.trim);                                                               // headboard
        (o.cargo || []).forEach((t, i) => crateOn(m, back0 + 4 + (i % 3) * 26, 8 + Math.floor(i / 3) * 22, 15, t, M));
      } else if (type === 'boxtruck' || type === 'garbage') {
        const col = type === 'garbage' ? m.mat({ ramp: R('#3f7a3a'), k: 3 }) : M.white;
        shell(m, { x0: back0, x1: back1, z0: 11, z1: 62, r: 2, rz: 2, mat: (x, y, z, s) => {
          if (type === 'boxtruck' && s.side < 1.6 && z > 30 && z < 44 && x > back1 * 0.35 && x < back1 * 0.6) return m.mats.length > 0 ? M.pink ?? (M.pink = m.mat({ ramp: R('#d86a90'), k: 3 })) : col;
          if ((Math.round(x) % 18 === 0) && s.side < 1.6) return type === 'garbage' ? M.lower : M.trim;
          return col;
        } });
      } else if (type === 'dumptruck') {
        shell(m, { x0: back0, x1: back1, z0: 11, z1: 40, br: -4, r: 2, mat: (x, y, z, s) => (s.side < 1.6 && Math.round(x) % 10 === 0 ? M.lower : M.body) });
        const gravel = m.mat({ ramp: R('#6e6258'), k: 3, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) - 0.5) * 1.6 });
        m.fill((x, y, z) => (x > back0 + 3 && x < back1 - 3 && y > 3 && y < W - 3 ? (z < 34 + Math.sin(x * 0.2) * 2 + Math.cos(y * 0.3) * 2 ? gravel : 0) : -1), 0, 0, 16, L, W, 41);
      } else if (type === 'mixer') {
        const drum = m.mat({ ramp: MAT.paintWhiteCar, k: 3 }), band = m.mat({ ramp: R('#c8302c'), k: 3 });
        m.fill((x, y, z) => { const t = (x - back0) / (back1 - back0); const rr = 20 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.95 + 0.2); const cz = 32 + t * 6; return (y - W / 2) ** 2 + (z - cz) ** 2 < rr * rr ? (Math.floor(t * 6) % 2 ? band : drum) : -1; }, back0, 0, 10, back1, W, 62);
      } else if (type === 'tanker') {
        const tank = m.mat({ ramp: MAT.chrome, k: 3 });
        m.cyl('x', 0, W / 2, 33, W / 2 - 3, back0, back1, tank);
        m.fill((x, y, z) => (Math.abs(z - 33) < 2.5 && (y < 5 || y > W - 5) ? M.stripeRed : -1), back0 + 4, 0, 30, back1 - 4, W, 36);
        for (let x = back0 + 14; x < back1 - 10; x += 30) m.cyl('z', x, W / 2, 0, 4, 52, 55, M.steel);
      } else {                                                                                                         // tow truck
        m.box(back0, 4, 11, back1, W - 4, 22, M.body);
        const boom = m.mat({ ramp: R('#2f4a8a'), k: 3 });
        for (let s = 0; s < 46; s++) m.box(back1 - 16 - s * 0.9, W / 2 - 3, 22 + s * 0.55, back1 - 10 - s * 0.9, W / 2 + 3, 26 + s * 0.55, boom);
        m.box(2, W / 2 - 1, 30, 4, W / 2 + 1, 46, M.trim);
        lightbar(m, M, cx0 + 6, cx0 + 14, 46, { amber: true });
      }
      wheels(m, [L * 0.14, L * 0.28, L * 0.84], 9.5, M);
      lamps(m, M, { zh: 14, h: 5, inset: 3, wd: 8 });
      break;
    }
    case 'firetruck': {
      shell(m, { x0: 1, x1: L - 1, z0: 7, z1: 54, r: 3, rz: 3, mat: (x, y, z, s) => {
        if (z > 26 && z < 29) return M.white;
        if (x > L - 34 && z > 34 && z < 50 && (s.side < 1.6 || s.front < 2.2)) return M.glass;
        if (s.side < 1.6 && x > 30 && x < L - 40 && Math.round(x) % 22 === 0) return M.lower;                      // compartment doors
        return M.body;
      } });
      const lad = m.mat({ ramp: MAT.chrome, k: 3 });
      for (const y of [8, W - 10]) m.box(10, y, 56, L - 30, y + 2, 59, lad);
      for (let x = 12; x < L - 30; x += 6) m.box(x, 8, 56, x + 1, W - 8, 58, lad);
      for (const x of [10, L - 34]) m.box(x, 8, 54, x + 4, W - 8, 56, M.trim);
      lightbar(m, M, L - 30, L - 22, 54);
      wheels(m, [L * 0.14, L * 0.26, L * 0.82], 9.5, M);
      lamps(m, M, { zh: 14, h: 5, inset: 3, wd: 8 });
      break;
    }
    case 'bike': case 'policebike': {
      const cy = W / 2;
      for (const x of [7, L - 8]) m.cyl('y', x, 0, 7, 7, cy - 2, cy + 2, M.tyre, 3.5, M.hub);
      shell(m, { x0: 10, x1: L - 12, y0: cy - 4, y1: cy + 4, z0: 8, z1: 20, fr: -4, r: 2, rz: 2, mat: M.body });          // fairing / tank
      m.box(10, cy - 3, 19, 26, cy + 3, 22, M.dark);                                                                     // seat
      m.box(L - 14, cy - 6, 22, L - 12, cy + 6, 24, M.trim);                                                             // bars
      m.box(L - 12, cy - 2, 15, L - 10, cy + 2, 19, M.head);
      m.box(4, cy - 3, 11, 12, cy - 1, 13, M.chrome);                                                                    // exhaust
      m.box(6, cy - 2, 16, 8, cy + 2, 18, M.tail);
      if (type === 'policebike') { for (const y of [cy - 6, cy + 3]) m.box(4, y, 9, 14, y + 3, 19, M.white); m.box(12, cy - 1, 24, 14, cy + 1, 30, M.trim); m.box(12, cy - 1, 30, 14, cy + 1, 32, M.blue); }
      (o.cargo || []).slice(0, 1).forEach((t) => crateOn(m, 1, cy - 6, 20, t, M));
      break;
    }
    case 'bicycle': {
      const cy = W / 2;
      for (const x of [7, L - 7]) m.cyl('y', x, 0, 7, 7, cy - 1, cy + 1, M.tyre, 5.5, 0);
      for (let s = 0; s <= 20; s++) { const t = s / 20; m.box(7 + t * 13, cy - 1, 7 + t * 9, 9 + t * 13, cy + 1, 9 + t * 9, M.body); m.box(20 + t * 13, cy - 1, 16 - t * 9, 22 + t * 13, cy + 1, 18 - t * 9, M.body); }
      m.box(9, cy - 2, 17, 15, cy + 2, 19, M.dark); m.box(L - 10, cy - 5, 18, L - 8, cy + 5, 20, M.trim);
      m.box(L - 8, cy - 3, 13, L - 2, cy + 3, 17, M.trim);                                                               // basket
      break;
    }
    case 'speedboat': case 'policeboat': case 'dinghy': case 'jetski': {
      const hz = type === 'jetski' ? 8 : type === 'dinghy' ? 9 : 12, cy = W / 2;
      const deck = type === 'dinghy' ? M.lower : m.mat({ ramp: MAT.woodDock, k: 3 });
      m.fill((x, y, z) => {
        const t = x / L, bow = t > 0.68 ? (t - 0.68) / 0.32 : 0;
        const half = (W / 2 - 1) * (1 - bow * bow * 0.95) * (0.62 + 0.38 * (z / hz));
        if (Math.abs(y - cy) > half) return -1;
        if (z > hz - 2) return Math.abs(y - cy) > half - 2.5 ? M.body : type === 'jetski' ? M.dark : deck;
        if (type !== 'dinghy' && z > hz * 0.45 && z < hz * 0.62) return type === 'policeboat' ? M.blue : M.stripeTeal;
        return z < 3 ? M.lower : M.body;
      }, 0, 0, 0, L, W, hz);
      if (type === 'dinghy') { m.fill((x, y) => (Math.abs(y - cy) < W / 2 - 4 && x > 6 && x < L - 16 ? 0 : -1), 0, 0, 3, L, W, hz); m.box(0, cy - 4, 4, 6, cy + 4, 18, M.dark); m.box(30, 4, 3, 36, W - 4, 7, deck); }
      if (type === 'speedboat') { m.fill((x, y, z) => (x > L * 0.52 && x < L * 0.6 && Math.abs(y - cy) < W / 2 - 6 ? M.glass : -1), 0, 0, hz, L, W, hz + 8); m.box(L * 0.3, cy - 8, hz, L * 0.5, cy + 8, hz + 4, M.interior); m.box(0, cy - 5, hz - 4, 3, cy + 5, hz + 6, M.dark); }
      if (type === 'policeboat') { shell(m, { x0: L * 0.35, x1: L * 0.7, y0: 8, y1: W - 8, z0: hz, z1: hz + 18, fr: 6, r: 2, rz: 2, mat: glassy(M.white, M.glass, { band: [hz + 7, hz + 15], pillars: [L * 0.52] }) }); lightbar(m, M, L * 0.45, L * 0.55, hz + 18); for (const y of [3, W - 4]) m.box(L * 0.15, y, hz, L * 0.85, y + 1, hz + 6, M.chrome); }
      if (type === 'jetski') { m.box(L * 0.35, cy - 3, hz, L * 0.62, cy + 3, hz + 4, M.dark); m.box(L * 0.62, cy - 6, hz + 2, L * 0.66, cy + 6, hz + 6, M.trim); }
      (o.cargo || []).forEach((t, i) => crateOn(m, 4 + i * 14, cy - 6, hz, t, M));
      break;
    }
    default: return vehicleModel('sedan', o);
  }
  m.smooth = 2;
  if (o.state && o.state !== 'clean') applyState(m, o.state, type);
  return m;
}

// damage: dents and scratches darken the paint, glass cracks, a wreck loses its front, a burnt-out shell
// turns black and loses its glass
function applyState(m, state, type) {
  const n = m.mats.length;
  const remap = new Array(n).fill(0).map((_, i) => i);
  const charred = m.mat({ ramp: R('#3a2e2a'), k: 2, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) - 0.5) * 2 });
  const scuff = new Map();
  for (let i = 1; i < n; i++) {
    const M = m.mats[i];
    if (state === 'burnt') remap[i] = M.flag & F_GLASS ? 0 : charred;
    else if (M.flag & F_GLASS) scuff.set(i, m.mat({ ...M, shade: (x, y, z) => ((Math.round(x * 1.3 + z * 2) % 7) < 1 ? 3 : 0) }));
    else scuff.set(i, m.mat({ ...M, k: Math.max(0, M.k - 1) }));
  }
  const L = m.w;
  for (let z = 0; z < m.h; z++) for (let y = 0; y < m.d; y++) for (let x = 0; x < m.w; x++) {
    const i = m.idx(x, y, z), v = m.v[i];
    if (!v) continue;
    if (state === 'burnt') { if (m.mats[v].flag & F_GLASS && z > 6) m.v[i] = 0; else m.v[i] = remap[v] || 0; continue; }
    const h = hash(x, y * 7 + z, 17);
    const front = x / L;
    if (state === 'wrecked' && front > 0.82 && hash(x >> 2, y >> 2, 3) > 0.35 + (1 - front) * 2) { m.v[i] = 0; continue; }
    if (h < (state === 'wrecked' ? 0.28 : 0.12) * (0.4 + front)) m.v[i] = scuff.get(v) ?? v;
    if ((m.mats[v].flag & F_GLASS) && front > 0.6) m.v[i] = scuff.get(v) ?? v;
  }
  m.prepared = false;
}
