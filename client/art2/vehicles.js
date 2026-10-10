// Art v2 vehicles: every vehicle in the game (shared/vehicles.js) as a voxel model, built to the V1-V6
// targets (docs/art-v2/targets). Models are rendered at any heading by voxel.js, so cars turn smoothly
// and are lit, shaded and shadowed like everything else. 1 voxel = 1 world px; the model's x axis runs
// from the rear (0) to the front (L), y across (0 = the left side, L = the right side, which faces south
// at heading 0), z up.
//
//   vehicleModel(type, o) -> Vox (with .anchors, see below)
//     type     any id from shared/vehicles.js (compact sedan taxi sports pickup flatbed van bus police swat
//              ambulance armored bike policebike bicycle speedboat dinghy jetski policeboat boxtruck
//              dumptruck mixer tanker garbage firetruck towtruck) or a scenery model (suv limo foodtruck
//              tram tugboat ferry tractor combine plane excavator)
//     o.paint  hex body colour (civilian bodies; on liveried models a respray); o.cab truck cab colour; o.band a
//              bus's band in its line's colour
//     o.lights 0..1 headlights and tail lights      o.brake / o.reverse  brake and reversing lamps lit
//     o.siren  false | true (all lamps lit) | 1 | 2 (the two flash phases: red side or blue side lit)
//     o.state  'clean' | 'dented' | 'wrecked' | 'burning' | 'burnt' | 'smoulder' (burnt, embers glowing)
//     o.variant integer: roof racks, rust, two-tone roofs, sunroofs, stickers, hubcaps, dirt (per model)
//     o.bloody blood on the front      o.cargo crate tiers to strap onto a bed or deck (scenery only;
//              the game places crates as their own sprites)      o.dry skip the normals (anchors only)
//   vehicleAnchors(type) -> the lamp, siren, seat, exhaust and fire points of a model (model coordinates,
//              x from the rear, y from the left side, z up), measured once per type.
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, hash } from './gbuf.js';

// footprints [length, width] in world px. The game's physics footprint (VEHICLE_ART_SIZE in
// shared/prefab-data.js) differs by up to ~20% for a few models; actors.js reports the table.
export const VEHICLE_DIMS = {
  compact: [80, 48], sedan: [94, 52], taxi: [100, 48], sports: [96, 48], pickup: [110, 50], flatbed: [150, 56],
  van: [112, 54], bus: [186, 62], police: [100, 48], swat: [120, 58], ambulance: [112, 56], armored: [122, 54],
  bike: [48, 20], policebike: [50, 20], bicycle: [40, 14], speedboat: [104, 48], dinghy: [80, 40], jetski: [46, 22],
  cruiser: [42, 16], mtb: [42, 16], roadbike: [42, 12], bmx: [34, 14], cargobike: [58, 18],
  policeboat: [104, 48], boxtruck: [150, 58], dumptruck: [140, 60], mixer: [146, 60], tanker: [160, 58],
  garbage: [140, 60], firetruck: [172, 66], towtruck: [134, 58],
  // the MC1 motorcycles (task #366)
  vtwin: [54, 20], tourer: [58, 26], chopper: [66, 20], bobber: [50, 20], caferacer: [50, 18], dirtbike: [48, 18], scooter: [40, 18], trike: [60, 38], ratbike: [54, 22], bagger: [58, 26],
  // scenery-only variants (parked and NPC traffic; they share the sedan / van footprints in play)
  suv: [104, 50], limo: [150, 50], foodtruck: [124, 58],
  // transit and harbour scenery (World v2): a two-section tram, a harbour tug, a car and passenger ferry
  tram: [300, 56], tugboat: [150, 64], ferry: [470, 150],
  // the island ferries' water bus (server/systems/ferries.js; the car ferry is the 'ferry' above)
  waterbus: [240, 76],
  // the five-star response (server/systems/police.js): the FBI's black SUV, the army's olive truck
  fbi: [104, 50], army: [120, 58],
  // country and works scenery
  tractor: [84, 54], combine: [150, 120], plane: [104, 130], excavator: [130, 60],
  // the search-and-rescue boat (server/systems/rescue.js; RS1): an orange rigid inflatable
  rescueboat: [96, 48],
};
// height of the body (roof) in world px
export const VEHICLE_TALL = {
  compact: 31, sedan: 33, taxi: 33, police: 33, sports: 27, pickup: 36, van: 46, suv: 42, limo: 32, ambulance: 54, armored: 50,
  swat: 52, bus: 62, flatbed: 46, boxtruck: 62, dumptruck: 46, mixer: 62, tanker: 54, garbage: 60, firetruck: 56, towtruck: 50,
  bike: 24, policebike: 31, bicycle: 20, speedboat: 22, dinghy: 14, jetski: 16, policeboat: 34,
  cruiser: 21, mtb: 21, roadbike: 22, bmx: 18, cargobike: 20,
  tractor: 50, combine: 70, plane: 40, excavator: 70, tram: 66, tugboat: 70, ferry: 112, waterbus: 70, foodtruck: 60,
  fbi: 42, army: 52,
  vtwin: 25, tourer: 31, chopper: 35, bobber: 24, caferacer: 25, dirtbike: 28, scooter: 25, trike: 28, ratbike: 26, bagger: 29,
  rescueboat: 30,
};
const DEFAULT_PAINT = {
  rescueboat: '#e8601e',
  compact: '#3f8a46', sedan: '#3f6a8e', taxi: '#e8b830', sports: '#c8302c', pickup: '#b0402e', van: '#e2e0d8',
  police: '#22242c', swat: '#262c44', ambulance: '#ecebe4', armored: '#7a7e84', flatbed: '#e6e2d8', boxtruck: '#e6e2d8',
  dumptruck: '#c0402c', mixer: '#e6e2d8', tanker: '#c0402c', garbage: '#3f7a3a', firetruck: '#c0302a', towtruck: '#2f4a8a',
  bus: '#e8e0cc', bike: '#c8302c', policebike: '#e8e8e4', bicycle: '#4a7a3a', speedboat: '#f0eee8', dinghy: '#4e6a4a',
  cruiser: '#5ab0a8', mtb: '#d8682a', roadbike: '#c8302c', bmx: '#3a7ad0', cargobike: '#2f5a7a',
  vtwin: '#26282e', tourer: '#b8302a', chopper: '#2a2a2e', bobber: '#26282e', caferacer: '#e6e2d8', dirtbike: '#2f56b0', scooter: '#7ac0a0', trike: '#22357a', ratbike: '#4e5a34', bagger: '#22357a',
  jetski: '#c8302c', policeboat: '#22305a', suv: '#2c3a5e', fbi: '#17181d', army: '#4f5a36', limo: '#1c1e24', foodtruck: '#2f6ab0', tram: '#ecebe4', tugboat: '#2a2c36', ferry: '#f0eee6', waterbus: '#f0eee6', tractor: '#b83a2e', combine: '#b83a2e', plane: '#ecebe4', excavator: '#e0b030',
};
const DEFAULT_CAB = { flatbed: '#e6e2d8', boxtruck: '#e6e2d8', dumptruck: '#c0402c', mixer: '#e6e2d8', tanker: '#c0402c', garbage: '#e6e2d8', towtruck: '#e6e2d8' };

const R = (h, n = 6, k) => ramp(h, n, k);
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---- materials ---------------------------------------------------------------------------------------
// Glossy paint. The shader works out the ramp step voxel.js would pick (its own occlusion and up-facing
// terms) and returns the offset that lands on a whole step, so big panels are clean flat tones with a
// narrow dithered seam between bands instead of an ordered-dither mesh. The bands: the sides darken
// toward the sill, the shoulder crease catches the light, horizontal paint is lighter toward the world's
// north-west (a sky sheen that follows the heading, m.view), a few chips. (f is kept for tuning.)
function paintShader(m, k = 3) {
  // the heading-free part (side bands, the shoulder crease, chips): game/actors.js bakes it per voxel
  const base = (x, y, z, vi) => {
    const nz = m.nz[vi], ny = m.ny[vi], L = m.look || {};
    let t = 0;
    if (nz < 0.5 && Math.abs(ny) > 0.45) {
      const top = L.belt || 18, z0 = L.z0 || 3, u = (z - z0) / Math.max(1, top - z0);
      t += u > 1.05 ? 0.8 : u > 0.62 ? 0.75 : u > 0.22 ? 0.3 : -0.3;
      if (u <= 1.05 && Math.abs(z - (top - 2.5)) < 0.8) t += 1.1;
    }
    const h = hash(x | 0, (y | 0) * 3 + (z | 0), L.seed || 1);
    if (h > 0.992) t -= 1.1; else if (h < 0.0015) t += 1.2;
    return t;
  };
  const shade = (x, y, z, vi) => {
    const nz = m.nz[vi], L = m.look || {};
    let t = base(x, y, z, vi);
    if (nz >= 0.5 && m.view) t += paintSheen(m, x, y, m.view.c, m.view.s, L.sheen ?? 1);
    // horizontal paint ignores the occlusion term (a stepped hood would band), sides keep half of it
    const tv = k + (nz >= 0.5 ? 0.55 : (m.ao[vi] - 0.75) * 1.1) + (nz > 0.7 ? 0.5 : 0) + t;
    return Math.round(tv) - (k + (m.ao[vi] - 0.75) * 2.2 + (nz > 0.7 ? 0.5 : 0));
  };
  shade.base = base;
  return shade;
}
// the sky sheen on horizontal paint at heading (c, s) = (cos, sin): lighter toward the world's north-west
export function paintSheen(m, x, y, c, s, k = 1) {
  const dx = x - m.w / 2, dy = y - m.d / 2;
  return Math.max(-0.5, Math.min(0.6, -((c * dx - s * dy) + (s * dx + c * dy)) / (m.w * 0.5))) * k;
}
// a body paint: the panels, the darker sill and the panel-seam shade
function paintSet(m, paint) {
  const P = ramp(paint, 7, 3, { dark: 0.64, light: 0.62, shift: 0.24 });
  return { body: m.mat({ ramp: P, k: 3, shade: paintShader(m, 3) }), lower: m.mat({ ramp: ramp(P[2], 5, 2), k: 2 }), seam: m.mat({ ramp: ramp(P[1], 5, 2), k: 1.6 }) };
}
// Lamps glow only when lit; the siren lamps by phase (1 = the red side, 2 = the blue side, true = both).
function mats(m, paint, o) {
  const lit = o.lights ? 1 : 0, sir = o.siren, redOn = sir === true || sir === 1 || sir === 3, blueOn = sir === true || sir === 2 || sir === 3;
  const look = () => m.look || {}, paintShade = paintShader(m, 3);
  const PS = paintSet(m, paint);
  const M = {
    body: PS.body, lower: PS.lower, seam: PS.seam,
    arch: m.mat({ ramp: R('#1e1c24'), k: 1 }),
    glass: m.mat({ ramp: ramp('#22324a', 6, 2, { light: 0.5, shift: 0.4 }), k: 1.0, flag: F_GLASS, shade: (x, y, z) => {
      const L = look(), roof = L.roof || 33;
      return ((x * 0.9 + z * 1.6 + y * 0.35) % 17 < 2.2 ? 1.6 : 0) + (z > roof - 3.5 ? 0.8 : 0) - (z < (L.belt || 18) + 2.5 ? 0.4 : 0);
    } }),
    tyre: m.mat({ ramp: R('#2a2a30', 5, 2), k: 1.2, shade: (x, y, z) => (((x + z) | 0) % 3 === 0 ? -0.6 : 0) }),
    rim: m.mat({ ramp: R('#b8bec8', 6, 3, { light: 0.75 }), k: 3, shade: (x, y, z) => {
      const L = look(), ws = L.wheels || [], r = L.wr || 7;
      let best = 1e9, bx = 0;
      for (const w of ws) { const d = Math.abs(x - w); if (d < best) { best = d; bx = w; } }
      const dx = x - bx, dz = z - r, d = Math.hypot(dx, dz);
      if (d < r * 0.2) return -1.6;
      const a = (Math.atan2(dz, dx) / (Math.PI * 2)) * 5 + 10;
      return a % 1 < 0.38 ? 0.7 : d > r * 0.48 ? -0.3 : -1.1;
    } }),
    trim: m.mat({ ramp: MAT.metalDark, k: 1.6 }), chrome: m.mat({ ramp: MAT.chrome, k: 2.6 }),
    grille: m.mat({ ramp: R('#2a2c34', 5, 2), k: 1.4, shade: (x, y, z) => ((z | 0) % 2 ? -0.8 : 0.4) }),
    head: m.mat({ ramp: R('#f6f0d8', 5, 3), k: 3, emi: lit ? [255, 244, 210, 255] : null }),
    tail: m.mat({ ramp: R('#d8302a', 5, 3), k: 2.6, emi: o.brake ? [255, 46, 30, 255] : lit ? [255, 40, 28, 190] : [255, 40, 30, 46] }),
    brakeL: m.mat({ ramp: R('#c8302a', 5, 2), k: 2, emi: o.brake ? [255, 40, 28, 255] : null }),
    rev: m.mat({ ramp: R('#ecebe6', 5, 3), k: 3, emi: o.reverse ? [255, 250, 240, 230] : null }),
    ind: m.mat({ ramp: R('#e89a2a', 5, 2), k: 2.4 }),
    plate: m.mat({ ramp: R('#e6e2d0', 5, 3), k: 3, shade: (x, y, z) => (((y | 0) + (z | 0)) % 3 === 0 ? -1.4 : 0) }),
    dark: m.mat({ ramp: R('#2c2e36'), k: 2 }), interior: m.mat({ ramp: R('#3a3034'), k: 1.6 }), seat: m.mat({ ramp: R('#4a3a36'), k: 2 }),
    white: m.mat({ ramp: ramp('#ecebe6', 6, 3, { dark: 0.45, light: 0.6 }), k: 3, shade: paintShade }),
    black: m.mat({ ramp: ramp('#26282e', 6, 3, { light: 0.55 }), k: 3, shade: paintShade }),
    bar: m.mat({ ramp: MAT.metalDark, k: 2 }),
    red: m.mat({ ramp: R('#e83a30', 5, 3), k: redOn ? 4 : 2, emi: redOn ? [255, 50, 40, 255] : null, flag: F_NOCAST }),
    blue: m.mat({ ramp: R('#3a6ae8', 5, 3), k: blueOn ? 4 : 2, emi: blueOn ? [60, 110, 255, 255] : null, flag: F_NOCAST }),
    amber: m.mat({ ramp: R('#f0a030', 5, 3), k: sir ? 4 : 2.4, emi: sir ? [255, 170, 50, 255] : null, flag: F_NOCAST }),
    stripeRed: m.mat({ ramp: R('#c8302c'), k: 3, shade: paintShade }), stripeTeal: m.mat({ ramp: R('#2f8a86'), k: 3, shade: paintShade }),
    stripeBlue: m.mat({ ramp: R('#2f56b0'), k: 3, shade: paintShade }), stripeYellow: m.mat({ ramp: R('#e8b830'), k: 3, shade: paintShade }),
    gold: m.mat({ ramp: R('#e0b040', 5, 2), k: 3 }),
    wood: m.mat({ ramp: MAT.woodDock, k: 3, shade: (x) => ((Math.round(x) % 6 === 0) ? -0.8 : 0) }),
    steel: m.mat({ ramp: MAT.metal, k: 3 }),
    liner: m.mat({ ramp: R('#34343c'), k: 2, shade: (x, y) => ((y | 0) % 3 === 0 ? -0.7 : 0) }),
    paintLine: m.mat({ ramp: R('#e8c860'), k: 3 }),
    hatch: m.mat({ ramp: R('#e8b870', 5, 2), k: 3, emi: [255, 210, 140, 40 + lit * 160], shade: (x, y, z) => (Math.round(z) % 7 === 0 ? -1.5 : 0) + (Math.round(x) % 9 === 0 ? -0.8 : 0) }),
    awn: m.mat({ ramp: R('#ecebe4'), k: 3, shade: (x) => (Math.floor(x / 5) % 2 ? -2 : 0) }), awn2: m.mat({ ramp: R('#c8343a'), k: 3 }),
    rust: m.mat({ ramp: R('#8a4e2c'), k: 2, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) - 0.5) * 1.6 }),
    dirt: m.mat({ ramp: R('#6a5a48'), k: 2.4, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) - 0.5) * 1.4 }),
    blood: m.mat({ ramp: R('#7a1a1e', 5, 2), k: 2, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) > 0.7 ? 1 : 0) }),
    crate: [R('#b08048'), R('#8a949c'), R('#5e6e3e'), R('#2c2c34')].map((r, i) => m.mat({ ramp: r, k: 3, emi: i === 3 ? [255, 200, 90, 40] : null, shade: (x, y, z) => ((Math.round(z) % 4 === 0 || Math.round(x) % 6 === 0) ? -0.6 : 0) })),
  };
  M.paint = M.body; M.hub = M.rim; M.cab = M.body;
  M.band = o.band ? m.mat({ ramp: R(o.band), k: 3, shade: paintShade }) : M.stripeTeal;   // a bus's line colour (o.band)
  return M;
}

// ---- building blocks ----------------------------------------------------------------------------------
const open6 = (m, x, y, z) => !m.get(x + 1, y, z) || !m.get(x - 1, y, z) || !m.get(x, y + 1, z) || !m.get(x, y - 1, z) || !m.get(x, y, z + 1) || !m.get(x, y, z - 1);
// Repaint the surface voxels inside a box. test(x, y, z, v, side) - side: 'x' (front/back face), 'y'
// (a side), 'z' (top) - picks which; mat is a material or fn(x, y, z, v) -> material.
function deco(m, mat, x0, y0, z0, x1, y1, z1, test = null) {
  for (let z = Math.max(0, Math.floor(z0)); z < Math.min(m.h, Math.ceil(z1)); z++) for (let y = Math.max(0, Math.floor(y0)); y < Math.min(m.d, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(m.w, Math.ceil(x1)); x++) {
    const i = m.idx(x, y, z), v = m.v[i];
    if (!v || !open6(m, x, y, z)) continue;
    // a side wins over a top on a sloped wall (its surface is a staircase of both)
    const side = (!m.get(x, y + 1, z) || !m.get(x, y - 1, z)) ? 'y' : (!m.get(x + 1, y, z) || !m.get(x - 1, y, z)) ? 'x' : 'z';
    if (test && !test(x + 0.5, y + 0.5, z + 0.5, v, side)) continue;
    const nm = typeof mat === 'function' ? mat(x + 0.5, y + 0.5, z + 0.5, v) : mat;
    if (nm >= 0) m.v[i] = nm;
  }
  m.prepared = false;
}
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
// a wheel set into an arch on both sides: the arch is cut out of the body down to the tyre's inner face
// (its inside painted dark), the tyre a ring, the rim recessed one voxel with spokes and a hub
function wheel(m, M, wx, r, o = {}) {
  const W = m.d, ww = o.width ?? 7, wi = o.inset ?? 2, ra = r + (o.arch ?? 1.6), zc = r;
  for (const side of [0, 1]) {
    const yin = side ? W - wi - ww - 1.5 : wi + ww + 1.5;
    if (o.arch !== 0) {
      m.fill((x, y, z) => (Math.hypot(x - wx, z - zc) < ra && (side ? y > yin : y < yin) && (!o.top || z < o.top(x)) ? 0 : -1), Math.floor(wx - ra - 1), 0, 0, Math.ceil(wx + ra + 1), W, Math.ceil(zc + ra + 1));
      deco(m, M.arch, wx - ra - 2, side ? yin - 4 : 0, 0, wx + ra + 2, side ? W : yin + 4, zc + ra + 2, (x, y, z, vv, sd) => sd !== 'z' && z < Math.min(zc + ra - 0.3, o.top ? o.top(x) - 0.5 : 99) && Math.hypot(x - wx, z - zc) < ra + 1.3);
    }
    const ya = side ? W - wi - ww : wi, yb = ya + ww;
    m.cyl('y', wx, 0, zc, r, ya, yb, M.tyre, r * 0.64, 0);
    m.cyl('y', wx, 0, zc, r * 0.66, side ? ya : ya + 1, side ? yb - 1 : yb, M.rim);
  }
}
function wheels(m, xs, r, mats, o = {}) { for (const x of xs) wheel(m, mats, x, r, o); }
// head and tail lights, a bumper at each end (scenery models)
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
// a roof light bar: red on the left half, blue on the right (amber for works vehicles)
function lightbar(m, M, x0, x1, z, o = {}) {
  const W = m.d, y0 = Math.round(W * (o.wide ? 0.18 : 0.28)), y1 = Math.round(W * (o.wide ? 0.82 : 0.72)), ym = Math.round(W / 2);
  m.box(x0, y0, z, x1, y1, z + 1, M.bar);
  m.box(x0, y0, z + 1, x1, ym - 1, z + 3, o.amber ? M.amber : M.red);
  m.box(x0, ym - 1, z + 1, x1, ym + 1, z + 3, M.bar);
  m.box(x0, ym + 1, z + 1, x1, y1, z + 3, o.amber ? M.amber : M.blue);
  const A = m.anchors;
  if (A) { const zz = z + 2, xm = (x0 + x1) / 2; A.siren.push([xm, (y0 + ym) / 2, zz, o.amber ? 2 : 0], [xm, (ym + y1) / 2, zz, o.amber ? 2 : 1]); }
}
function crateOn(m, x, y, z, tier, M) {
  const s = 12;
  const mat = M.crate[Math.max(0, Math.min(3, tier - 1))];
  m.box(x, y, z, x + s, y + s, z + s - 1, mat);
}

// ---- the car body -------------------------------------------------------------------------------------
// A lower tub (hood, doors, boot) with a rounded plan, a tumblehome shoulder and a rounded nose and tail;
// a glass cabin on top (windscreen and rear window leaning in, pillars, a rounded roof); wheels in
// arches; lamps, bumpers, grille, plates, mirrors, door seams and handles. Every x in the spec is a
// fraction of the length.
function carBody(m, M, s) {
  const L = m.w, W = m.d, cy = W / 2, z0 = s.z0 ?? 3, belt = s.belt;
  const nose = s.nose ?? belt - 5, tail = s.tail ?? belt - 2, hood = (s.hood ?? 0.7) * L, boot = (s.boot ?? 0.22) * L;
  const topAt = (x) => (x > hood ? belt + (nose - belt) * Math.pow(sm((x - hood) / (L - hood)), 0.85) : x < boot ? tail + (belt - tail) * sm(x / Math.max(1, boot)) : belt);
  const hw0 = cy - 1.2, rf = s.rf ?? 9, rr = s.rr ?? 7, wr = s.wr ?? 7.5;
  const wx = s.wheels.map((f) => f * L);
  m.look = { ...(m.look || {}), belt, z0, roof: s.roof, wheels: wx, wr };
  const body = M.body;
  const tub = (x, y, z) => {
    const top = topAt(x);
    if (z > top + 0.5) return false;
    const ends = Math.max(0, z - (top - 3)) * 0.85 + Math.max(0, z0 + 2.5 - z) * 0.9;
    const xa = 0.5 + ends * (s.rearRound ?? 1), xb = L - 0.5 - ends * (s.frontRound ?? 1);
    if (x < xa || x > xb) return false;
    const tuck = Math.max(0, z - (top - 4)) * (s.shoulder ?? 0.5) + Math.max(0, z0 + 2.5 - z) * 0.8;
    const hw = hw0 - tuck, dy = Math.abs(y - cy);
    if (dy > hw) return false;
    const front = x > L / 2, r = front ? rf : rr, kx = front ? xb - r : xa + r, ky = hw - r;
    if ((front ? x > kx : x < kx) && dy > ky && (x - kx) ** 2 + (dy - ky) ** 2 > r * r) return false;
    return true;
  };
  m.fill((x, y, z) => (tub(x, y, z) ? body : -1), 0, 0, Math.max(0, z0 - 1), L, W, Math.ceil(Math.max(belt, nose, tail) + 1));
  // cabin
  if (s.cab) {
    const c0 = s.cab[0] * L, c1 = s.cab[1] * L, rz = s.roof, fr = s.fr ?? 13, br = s.br ?? 10, ci0 = s.ci0 ?? 3, ci1 = s.ci1 ?? 6.5;
    const pil = (s.pillars || []).map((f) => f * L), roofMat = s.roofMat ?? body, win = s.win;
    m.fill((x, y, z) => {
      const t = (z - belt) / (rz - belt), xf = c1 - fr * t, xr = c0 + br * t, hw = hw0 - (ci0 + (ci1 - ci0) * t), dy = Math.abs(y - cy);
      if (x > xf || x < xr || dy > hw) return -1;
      const cr = s.cr ?? 3, kx = Math.max(xr + cr, Math.min(xf - cr, x)), ky = hw - cr;
      if (dy > ky && (x - kx) ** 2 + (dy - ky) ** 2 > cr * cr) return -1;
      const side = hw - dy, front = xf - x, back = x - xr, top = rz - z;
      if (top < 2.2 && (Math.max(0, 2.2 - side) ** 2 + Math.max(0, 2.2 - top) ** 2 > 4.8 || Math.max(0, 2.2 - front) ** 2 + Math.max(0, 2.2 - top) ** 2 > 4.8 || Math.max(0, 2.2 - back) ** 2 + Math.max(0, 2.2 - top) ** 2 > 4.8)) return -1;
      if (top < 1.7) return roofMat;
      const skin = side < 1.5 || front < 1.9 || back < 1.9;
      if (!skin) return M.interior;
      if (z < belt + 1.2) return body;
      const face = side < 1.5 ? (front < 2.8 || back < 2.8 ? 'corner' : 'side') : front < 1.9 ? 'front' : 'back';
      if (face === 'corner' || (face === 'side' && pil.some((p) => Math.abs(x - p) < 1.3))) return s.pillarMat ?? body;
      if (win && !win(x, y, z, face)) return body;
      return M.glass;
    }, 0, 0, Math.floor(belt), L, W, Math.ceil(rz + 1));
  }
  // wheels
  for (const x of wx) wheel(m, M, x, wr, { width: s.ww ?? 7, inset: s.wi ?? 2.5, top: (xx) => topAt(xx) - 2 });
  // lamps: head at the front corners, tail clusters at the rear corners (wrapping round onto the sides so a
  // side-on car shows them), a reversing lamp in each cluster, indicators, a third brake lamp
  const lz = s.lampZ ?? belt - 6, lh = s.lampH ?? 4, lw = s.lampW ?? 9;
  const headT = (x, y, z) => Math.abs(y - cy) > hw0 - lw - 0.5;
  deco(m, M.head, L - 5, 0, lz, L, W, lz + lh, headT);
  deco(m, M.ind, L - 3.5, 0, lz - 2, L, W, lz, headT);
  deco(m, (x, y) => (Math.abs(y - cy) < hw0 - lw + 2.5 ? M.rev : M.tail), 0, 0, lz + (s.tailUp ?? 0), 4.5, W, lz + lh + (s.tailUp ?? 0), (x, y) => Math.abs(y - cy) > hw0 - lw - 0.5);
  // grille between the headlamps, bumpers and number plates
  deco(m, M.grille, L - 3, 0, lz - 1, L, W, lz + lh - 0.5, (x, y, z, v, side) => side === 'x' && Math.abs(y - cy) < hw0 - lw - 1);
  const bumper = s.bumper ?? M.trim;
  deco(m, bumper, L - 3.2, 0, z0, L, W, z0 + 3.4, (x, y, z, v, side) => side !== 'z' || x > L - 2);
  deco(m, bumper, 0, 0, z0, 3.2, W, z0 + 3.4, (x, y, z, v, side) => side !== 'z' || x < 2);
  deco(m, M.plate, 0, cy - 5, z0 + 3.5, 2.5, cy + 5, z0 + 6.5, (x, y, z, v, side) => side === 'x');
  deco(m, M.plate, L - 2.5, cy - 4, z0 + 1, L, cy + 4, z0 + 3.5, (x, y, z, v, side) => side === 'x');
  // door seams and handles
  for (const f of s.seams || []) {
    const sx = f * L;
    deco(m, M.seam, sx - 0.5, 0, z0 + 3, sx + 0.5, W, belt + 0.2, (x, y, z, v, side) => side === 'y');
    deco(m, M.chrome, sx + 2.5, 0, belt - 4.5, sx + 5.5, W, belt - 3.5, (x, y, z, v, side) => side === 'y');
  }
  // mirrors on the A pillars
  if (s.cab && s.mirrors !== false) { const mx = s.cab[1] * L - (s.fr ?? 13) * 0.25 - 4; for (const y of [0, W - 2]) { m.box(mx, y, belt, mx + 3, y + 2, belt + 3, body); m.box(mx + 2, y, belt - 1, mx + 3, y + 2, belt, M.trim); } }
  // smooth normals for the stepped surfaces (voxel stairs would band in the light): the hood and boot
  // follow their profile, the roof is flat, the windscreen, rear window and side glass lean as built
  m.fixNormals = () => {
    const cab = s.cab, c0 = cab ? cab[0] * L : 0, c1 = cab ? cab[1] * L : 0, rz = s.roof || belt, fr = s.fr ?? 13, br = s.br ?? 10, ci0 = s.ci0 ?? 3, ci1 = s.ci1 ?? 6.5, Hc = Math.max(1, rz - belt);
    const set = (i, a, b, c) => { const l = Math.hypot(a, b, c) || 1; m.nx[i] = a / l; m.ny[i] = b / l; m.nz[i] = c / l; };
    for (let z = Math.max(0, Math.floor(z0)); z < Math.min(m.h, Math.ceil(rz + 1)); z++) for (let y = 0; y < W; y++) for (let x = 0; x < L; x++) {
      const i = m.idx(x, y, z);
      if (!m.v[i] || (!m.nx[i] && !m.ny[i] && !m.nz[i])) continue;
      const X = x + 0.5, Y = y + 0.5, Zc = z + 0.5, dy = Math.abs(Y - cy), sgn = Y < cy ? -1 : 1;
      const top = topAt(X);
      if (Zc > top - 1.6 && Zc <= top + 0.6 && dy < hw0 - 3.2 && X > 1.5 && X < L - 2.5) { set(i, -(topAt(X + 1) - topAt(X - 1)) / 2, 0, 1); continue; }
      if (!cab || Zc < belt + 0.8) continue;
      const t = (Zc - belt) / Hc, xf = c1 - fr * t, xr = c0 + br * t, hw = hw0 - (ci0 + (ci1 - ci0) * t);
      if (Zc > rz - 1.7 && X < xf - 2.5 && X > xr + 2.5 && dy < hw - 2.5) set(i, 0, 0, 1);
      else if (X > xf - 1.9 && dy < hw - 2.5 && Zc < rz - 1.5) set(i, Hc, 0, fr);
      else if (X < xr + 1.9 && dy < hw - 2.5 && Zc < rz - 1.5) set(i, -Hc, 0, Math.max(br, 0.5));
      else if (dy > hw - 1.5 && X < xf - 2.6 && X > xr + 2.6 && Zc < rz - 1.7) set(i, 0, sgn * Hc, ci1 - ci0);
    }
  };
  const A = m.anchors;
  if (A) {
    A.head.push([L - 1, cy - hw0 + lw / 2, lz + lh / 2], [L - 1, cy + hw0 - lw / 2, lz + lh / 2]);
    A.tail.push([1, cy - hw0 + lw / 2, lz + lh / 2 + (s.tailUp ?? 0)], [1, cy + hw0 - lw / 2, lz + lh / 2 + (s.tailUp ?? 0)]);
    A.rev.push([1, cy - hw0 + lw - 1.5, lz + lh / 2], [1, cy + hw0 - lw + 1.5, lz + lh / 2]);
    A.exhaust = [0, cy + hw0 * 0.55, z0 + 1];
    A.fire.push([L * 0.86, cy, belt], [L * 0.5, cy, (s.roof || belt + 12) - 4]);
    A.seat = [L * ((s.cab ? (s.cab[0] + s.cab[1]) / 2 : 0.5)), cy - W * 0.18, belt + 2];
  }
  return { L, W, cy, hw0, belt, z0, lz, lh, topAt, tub, wx, wr };
}
// a third brake lamp at the top of the rear window
function thirdBrake(m, M, b, c0, roof) {
  deco(m, M.brakeL, c0 * b.L - 1, b.cy - 4, roof - 4, c0 * b.L + 10, b.cy + 4, roof - 1.2, (x, y, z, v) => v === M.glass || v === M.body);
}
// an open bed behind the cab (pickups): floor at bz, walls 2 px thick, a ribbed liner
function cutBed(m, M, b, x0, x1, bz) {
  m.fill((x, y, z) => (x > x0 + 2 && x < x1 - 1 && Math.abs(y - b.cy) < b.hw0 - 2.5 ? 0 : -1), 0, 0, bz, m.w, m.d, m.h);
  // wheel wells: humps over the rear wheels inside the bed
  for (const wx of b.wx) if (wx > x0 && wx < x1) m.fill((x, y, z) => ((x - wx) ** 2 + (z - b.wr) ** 2 < (b.wr + 2.2) ** 2 && Math.abs(y - b.cy) > b.hw0 - 11 && Math.abs(y - b.cy) < b.hw0 - 2 ? M.liner : -1), Math.floor(wx - b.wr - 3), 0, bz - 1, Math.ceil(wx + b.wr + 3), m.d, Math.ceil(b.wr * 2 + 3));
  deco(m, M.liner, x0 + 1, 0, bz - 1, x1, m.d, m.h, (x, y, z, v, side) => Math.abs(y - b.cy) < b.hw0 - 2 && x > x0 + 1.5 && x < x1 - 0.5);
  deco(m, M.trim, x0, 0, b.belt - 0.5, x1, m.d, b.belt + 1);
}

// ---- trucks -------------------------------------------------------------------------------------------
// A conventional cab at the front: a short hood with a grille, an upright cab with a big windscreen and a
// door window, mirror arms, roof marker lamps and an exhaust stack. Returns the cab's rear x.
function truckCab(m, M, x1, H, o = {}) {
  const W = m.d, cabL = o.cabL ?? 30, hood = o.hood ?? 14, cy = W / 2, cab = o.mat ?? M.cab ?? M.body;
  const x0 = x1 - cabL - hood, hz = o.hoodZ ?? 26;
  shell(m, { x0: x1 - hood - 2, x1, y0: 3, y1: W - 3, z0: 7, z1: hz, fr: 3, r: 4, rz: 3, mat: cab });          // hood
  shell(m, { x0, x1: x1 - hood + 2, y0: 2, y1: W - 2, z0: 7, z1: H, fr: 4, r: 3, rz: 3, mat: (x, y, z, s) => {
    if (s.top < 1.8) return cab;
    const skin = s.side < 1.6 || s.front < 2.3;
    if (!skin || z < H * 0.56 || z > H - 3) return z < 12 ? M.lower : cab;
    if (s.front < 2.3) return s.side < 2.5 ? cab : M.glass;                                                   // windscreen
    if (x > x0 + cabL * 0.42 && x < x1 - hood - 2.5) return M.glass;                                          // door window
    return cab;
  } });
  deco(m, M.seam, x0 + cabL * 0.36, 0, 10, x0 + cabL * 0.36 + 1, W, H - 2, (x, y, z, v, side) => side === 'y');
  deco(m, M.chrome, x0 + cabL * 0.42, 0, H * 0.48, x0 + cabL * 0.42 + 3, W, H * 0.48 + 1, (x, y, z, v, side) => side === 'y');
  deco(m, M.grille, x1 - 3, 6, 9, x1, W - 6, hz - 3, (x, y, z, v, side) => side === 'x');
  deco(m, M.chrome, x1 - 3, 0, 7, x1, W, 10, (x, y, z, v, side) => side !== 'z');                              // bumper
  deco(m, M.head, x1 - 3, 0, 13, x1, W, 18, (x, y, z, v, side) => Math.abs(y - cy) > cy - 9);
  deco(m, M.ind, x1 - 3, 0, 18, x1, W, 20, (x, y, z, v, side) => Math.abs(y - cy) > cy - 7);
  for (const y of [0, W - 2]) { m.box(x1 - hood - 1, y, H - 20, x1 - hood + 1, y + 2, H - 8, M.trim); m.box(x1 - hood - 3, y, H - 21, x1 - hood + 1, y + 2, H - 20, M.chrome); }   // mirrors on arms
  for (const y of [cy - 12, cy - 4, cy + 4, cy + 12]) m.box(x1 - hood - 6, y - 1, H, x1 - hood - 3, y + 1, H + 1, M.ind); // roof marker lamps
  if (o.stack !== false) { m.cyl('z', x0 + 2.5, 4, 0, 1.6, 12, H + 10, M.chrome); m.box(x0 + 1, 3, H + 8, x0 + 4, 5, H + 10, M.trim); }
  const A = m.anchors;
  if (A) {
    A.head.push([x1 - 1, 5.5, 15.5], [x1 - 1, W - 5.5, 15.5]);
    A.exhaust = [x0 + 2.5, 4, H + 10];
    A.fire.push([x1 - hood / 2, cy, hz], [x0 + cabL / 2, cy, H - 4]);
    A.seat = [x0 + cabL * 0.6, cy - W * 0.2, 24];
  }
  return x0;
}
// chassis rails, a fuel tank and steps, dual wheels
function chassis(m, M, x0, x1, o = {}) {
  const W = m.d;
  m.box(2, 9, 6, x1, W - 9, 11, M.trim);
  m.cyl('x', 0, 4.5, 9.5, 4, x0 - 20, x0 - 3, M.chrome);
  m.cyl('x', 0, W - 4.5, 9.5, 4, x0 - 20, x0 - 3, M.steel);
  for (const y of [0, W - 3]) m.box(x0 + 1, y, 7, x0 + 7, y + 3, 9, M.trim);                                 // cab steps
}
// tail lamps and a bumper on a truck body's rear face
function truckRear(m, M, zt = 12, o = {}) {
  const W = m.d, cy = W / 2;
  deco(m, M.tail, 0, 0, zt, 3, W, zt + 4, (x, y, z, v, side) => Math.abs(y - cy) > cy - 8);
  deco(m, M.rev, 0, 0, zt, 3, W, zt + 4, (x, y, z, v, side) => Math.abs(y - cy) > cy - 10 && Math.abs(y - cy) <= cy - 8);
  m.box(0, 4, 5, 3, W - 4, 8, M.trim);
  const A = m.anchors;
  if (A) { A.tail.push([1, 5, zt + 2], [1, W - 5, zt + 2]); A.rev.push([1, 9, zt + 2], [1, W - 9, zt + 2]); }
}
// a body box behind the cab (box trucks, the ambulance and armored boxes): rounded edges, panel seams
function boxBody(m, x0, x1, z0, z1, mat, o = {}) {
  shell(m, { x0, x1, y0: o.y0 ?? 1.5, y1: o.y1 ?? m.d - 1.5, z0, z1, r: o.r ?? 2, rz: o.rz ?? 2, mat });
}

// detail for a big flat roof whose top is at height z: panel seams across it, a few vents or hatches
function roofKit(m, M, x0, x1, z, o = {}) {
  const W = m.d, st = o.step ?? 16;
  deco(m, M.seam, x0, 0, z - 2, x1, W, z + 1, (x, y, zz, v, side) => side === 'z' && (x - x0) % st < 1 && x > x0 + 4 && x < x1 - 4);
  for (const [vx, vy, vw = 7, vd = 7] of o.vents || []) {
    m.box(vx, vy, z, vx + vw, vy + vd, z + 2, M.steel);
    deco(m, M.dark, vx, vy, z, vx + vw, vy + vd, z + 3, (x, y, zz, v, side) => side === 'z' && (y | 0) % 2 === 0 && x > vx + 0.9 && x < vx + vw - 0.9 && y > vy + 0.9 && y < vy + vd - 0.9);
  }
}

// ---- bicycles --------------------------------------------------------------------------------------------
// The pedal bikes (shared/vehicles.js pedal), all from one builder: the wheels (spoked; balloon, knobby or skinny
// tyres), the frame drawn as tubes in the bike's middle plane, the fork, bars, saddle and each type's own kit.
// Coordinates: x from the rear (0) to the front, z up; the frame sits at y = cy.
export const PEDAL = new Set(['bicycle', 'cruiser', 'mtb', 'roadbike', 'bmx', 'cargobike']);
const BIKES = {
  // r: wheel radius; tw: tyre thickness across (voxels); xr / xf: the axles (rf: a smaller front wheel); bb: the bottom
  // bracket; st: the top of the seat tube; ht / hb: the head tube's top and bottom; seat: the saddle [x0, x1, z, half-width];
  // bars: [x, z, half-width, kind]
  bicycle: { r: 7, tw: 1, xr: 7, xf: 33, bb: [17.5, 6], st: [15.5, 16.5], ht: [30, 16.5], hb: [31, 12.5], seat: [13, 18, 18, 1.5], bars: [29, 19, 4, 'up'], step: true, fenders: 'body', rack: true },
  cruiser: { r: 7.5, tw: 2, xr: 8, xf: 34, bb: [19, 6], st: [17, 16], ht: [31, 16], hb: [32, 11.5], seat: [13, 19, 18, 2.5], bars: [30, 19.5, 6, 'swept'], cantilever: true, fenders: 'chrome', springs: true },
  mtb: { r: 7.5, tw: 2, knobby: true, xr: 8, xf: 34, bb: [19, 6.5], st: [16, 16.5], ht: [30.5, 17], hb: [31.5, 13], seat: [13, 17.5, 19.5, 1.5], bars: [29.5, 18.5, 6, 'flat'], slope: 14, suspension: true, thick: 2 },
  roadbike: { r: 8, tw: 1, xr: 8, xf: 34, bb: [19.5, 6.5], st: [16.5, 18], ht: [30.5, 18], hb: [31.5, 13.5], seat: [13, 17.5, 20.5, 1], bars: [31.5, 18.5, 3, 'drop'] },
  bmx: { r: 5.5, tw: 2, xr: 6, xf: 28, bb: [14.5, 5], st: [13, 12], ht: [23, 12.5], hb: [24, 9.5], seat: [10, 14.5, 13, 1.5], bars: [22.5, 17, 5, 'riser'], pegs: true, thick: 2 },
  cargobike: { r: 7, rf: 5, tw: 1, xr: 8, xf: 52, bb: [17, 6], st: [14.5, 17], ht: [25.5, 18], hb: [27, 6.5], seat: [11, 16, 18, 1.5], bars: [24.5, 19, 4, 'up'], box: [29, 48], rack: true, beam: true },
};
function pedalBike(m, M, V, type, A) {
  const L = m.w, W = m.d, cy = W / 2, B = BIKES[type];
  const fy = Math.floor(cy - 0.5);   // the frame's plane: one voxel across (wider tubes fill the triangles in, seen from above)
  // m.fill only draws on whole-voxel bounds
  const fillI = (fn, x0, y0, z0, x1, y1, z1) => m.fill(fn, Math.floor(x0), Math.floor(y0), Math.floor(z0), Math.ceil(x1), Math.ceil(y1), Math.ceil(z1));
  // a tube from (x0, z0) to (x1, z1) in the frame's plane, d voxels thick (and across: from y0 to y1)
  const tube = (x0, z0, x1, z1, mat, d = 1.2, y0 = fy, y1 = fy + 1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2) + 1;
    for (let i = 0; i <= n; i++) { const k = i / n, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k; m.box(x - d / 2, y0, z - d / 2, x + d / 2, y1, z + d / 2, mat); }
  };
  // a curve through a control point (quadratic)
  const bend = (x0, z0, cx, cz, x1, z1, mat, d = 1.2, y0 = fy, y1 = fy + 1) => {
    const n = Math.ceil((Math.hypot(cx - x0, cz - z0) + Math.hypot(x1 - cx, z1 - cz)) * 2) + 1;
    for (let i = 0; i <= n; i++) { const k = i / n, a = (1 - k) * (1 - k), b = 2 * k * (1 - k), c = k * k; const x = a * x0 + b * cx + c * x1, z = a * z0 + b * cz + c * z1; m.box(x - d / 2, y0, z - d / 2, x + d / 2, y1, z + d / 2, mat); }
  };
  // the wheels: a tyre ring, spokes and a hub; balloon / knobby tyres two voxels across, skinny ones one
  const ty1 = fy + B.tw;
  const knob = B.knobby ? m.mat({ ramp: R('#2a2a30', 5, 2), k: 1.2, shade: (x, y, z) => ((Math.round(Math.atan2(z - B.r, x - (x < L / 2 ? B.xr : B.xf)) * 5) & 1) ? -0.9 : 0.5) }) : M.tyre;
  const wheel = (x, r) => {
    m.cyl('y', x, 0, r, r, fy, ty1, knob, r - (B.tw === 1 ? 1 : 1.5), 0);
    fillI((xx, y, z) => { const dx = xx - x, dz = z - r, d = Math.hypot(dx, dz); return d < r - 1 && (Math.abs(dx) < 0.5 || Math.abs(dz) < 0.5 || Math.abs(dx - dz) < 0.6 || Math.abs(dx + dz) < 0.6) ? M.rim : -1; }, x - r, fy, 0, x + r, fy + 1, 2 * r);
    m.box(x - 0.5, fy - 1, r - 0.5, x + 0.5, ty1 + 1, r + 0.5, M.chrome);   // hub
  };
  const rf = B.rf || B.r;
  wheel(B.xr, B.r); wheel(B.xf, rf);
  m.look = { ...m.look, belt: 14, z0: B.r, roof: B.seat[2] + 2, wheels: [B.xr, B.xf], wr: B.r };
  const F = M.body, [bx, bz] = B.bb, [sx, sz] = B.st, [hx, hz] = B.ht, [hbx, hbz] = B.hb;
  const dt = B.thick ? 1.7 : 1.3;   // (the down tube: fatter on the mountain bike and the BMX)
  // the frame
  if (B.step) bend(hbx, hbz, (hbx + bx) / 2, bz + 0.5, bx, bz, F, 1.5);                         // a step-through: one low sweep
  else if (B.cantilever) {
    bend(hx, hz - 0.5, (hx + sx) / 2 + 1, sz - 7, sx, sz - 3, F, 1.2);                            // the swooping top tube
    bend(hbx, hbz, (hbx + bx) / 2 + 3, bz - 1.5, B.xr + 3, B.r + 1.5, F, 1.2);                     // ...and the long low one to the back
    tube(hbx, hbz, bx, bz, F, 1.3);
  } else {
    tube(hx, hz - 0.5, sx + 0.5, B.slope || sz - 0.5, F, 1.2);                                     // top tube (sloping on the mountain bike)
    tube(hbx, hbz, bx, bz, F, dt);                                                                 // down tube
  }
  if (B.beam) { m.box(bx, fy - 1, 3, B.xf - 3, fy + 2, 4.5, F); tube(B.xf - 3.5, 4, B.xf - 1, rf + 6, F, 1.3); }   // the cargo bike's long low beam under the box
  tube(bx, bz, sx, sz, F, 1.2);                                                                     // seat tube
  tube(bx, bz, B.xr, B.r, F, 1);                                                                    // chain stays
  tube(sx + 0.3, sz - 1.2, B.xr, B.r, F, 1);                                                        // seat stays
  tube(hx, hz, hbx, hbz, F, 1.4);                                                                   // head tube (the cargo bike's: its steering column)
  m.cyl('y', bx, 0, bz, 2.2, fy + 1, fy + 2, M.chrome);                                             // chainring
  m.box(bx - 1.5, fy - 1, bz - 0.5, bx + 1.5, fy + 2, bz + 0.5, M.trim);                            // cranks
  // the fork: legs either side of the front wheel (a suspension fork: chrome stanchions in fat dark lowers)
  const fx = B.beam ? B.xf - 1 : hbx, fz = B.beam ? rf + 6 : hbz;
  for (const y of [fy - 1, ty1]) {
    if (B.suspension) { const mx = fx + (B.xf - fx) * 0.4, mz = fz - (fz - rf) * 0.4; tube(fx, fz, mx, mz, M.chrome, 1, y, y + 1); tube(mx, mz, B.xf, rf, M.dark, 1.6, y, y + 1); }
    else tube(fx, fz, B.xf, rf, M.chrome, 1, y, y + 1);
  }
  m.box(fx - 0.5, fy - 1, fz - 0.5, fx + 0.5, ty1 + 1, fz + 0.5, M.chrome);                         // the fork crown
  // seat post and saddle
  const [s0, s1, sh, sw] = B.seat;
  tube(sx, sz, (s0 + s1) / 2 + 0.5, sh, M.chrome, 1);
  m.box(s0, cy - sw, sh, s1, cy + sw, sh + 1.2, M.seat);
  m.box(s1 - 1, cy - 0.5, sh, s1 + 1, cy + 0.5, sh + 1, M.seat);                                     // the nose
  if (B.springs) for (const y of [cy - sw + 0.5, cy + sw - 1]) m.box(s0 + 0.5, y, sh - 1.5, s0 + 1.5, y + 1, sh, M.chrome);
  // stem and bars
  const [ax, az, aw, kind] = B.bars;
  tube(hx, hz, ax, az - 0.5, M.trim, 1);
  const grips = (gx0, gx1) => { for (const y of [cy - aw, cy + aw - 1]) m.box(gx0, y, az, gx1, y + 1, az + 1, M.seat); };
  if (kind === 'drop') {
    m.box(ax - 0.5, cy - aw, az, ax + 0.5, cy + aw, az + 1, M.trim);
    for (const y of [cy - aw, cy + aw - 1]) { tube(ax, az + 0.5, ax + 2, az - 0.5, M.trim, 1, y, y + 1); tube(ax + 2, az - 0.5, ax + 1, az - 3, M.trim, 1, y, y + 1); tube(ax + 1, az - 3, ax - 0.5, az - 3, M.dark, 1, y, y + 1); }
  } else if (kind === 'swept') {
    m.box(ax - 0.5, cy - aw, az, ax + 0.5, cy + aw, az + 1, M.chrome);
    for (const y of [cy - aw, cy + aw - 1]) m.box(ax - 4, y, az + 0.5, ax, y + 1, az + 1.5, M.chrome);   // swept back to the rider
    for (const y of [cy - aw, cy + aw - 1]) m.box(ax - 5.5, y, az + 0.5, ax - 3.5, y + 1, az + 1.5, M.seat);
  } else if (kind === 'riser') {
    for (const y of [cy - aw * 0.6, cy + aw * 0.6 - 1]) tube(ax, az - 3.5, ax - 0.5, az, M.trim, 1, y, y + 1);
    m.box(ax - 1, cy - aw * 0.6, az - 2, ax, cy + aw * 0.6, az - 1, M.trim);                        // the crossbar
    m.box(ax - 1, cy - aw, az, ax, cy + aw, az + 1, M.trim);
    grips(ax - 1, ax);
  } else {
    m.box(ax - 0.5, cy - aw, az, ax + 0.5, cy + aw, az + 1, kind === 'flat' ? M.dark : M.trim);
    grips(ax - 0.5, ax + 0.5);
  }
  // each type's own kit
  const arc = (x, r, a0, a1, mat, y0, y1) => fillI((xx, y, z) => { const d = Math.hypot(xx - x, z - r), a = Math.atan2(z - r, xx - x); return Math.abs(d - (r + 1)) < 0.55 && a > a0 && a < a1 ? mat : -1; }, x - r - 2, y0, 0, x + r + 2, y1, 2 * r + 2);
  if (B.fenders) { const fm = B.fenders === 'chrome' ? M.chrome : M.trim; arc(B.xr, B.r, 0.5, 3.0, fm, fy, ty1); arc(B.xf, rf, 0.15, 2.5, fm, fy, ty1); }   // mudguards: over and behind the back wheel, over and ahead of the front
  if (B.rack) { m.box(B.xr - 4.5, fy - 1, B.r * 2 + 1, B.xr + 4, fy + 2, B.r * 2 + 2, M.trim); tube(B.xr - 4, B.r * 2 + 1, B.xr, B.r, M.trim, 0.8); }   // a rear rack
  if (B.pegs) for (const x of [B.xr, B.xf]) m.box(x - 0.5, fy - 3, B.r - 0.5, x + 0.5, ty1 + 3, B.r + 0.5, M.chrome);
  if (B.box) {   // the cargo box: wooden walls, an open top, a painted rim
    const [x0, x1] = B.box, z0 = 5, z1 = 15;
    m.box(x0, 1, z0, x1, W - 1, z0 + 1, M.wood);
    fillI((x, y, z) => (x < x0 + 1 || x > x1 - 1 || y < 2 || y > W - 2 ? M.wood : -1), x0, 1, z0, x1, W - 1, z1);
    m.box(x0, 1, z1 - 1, x1, W - 1, z1, F); fillI(() => 0, x0 + 1, 2, z1 - 1, x1 - 1, W - 2, z1);
  }
  // a basket on the front: wicker on some commuters and cruisers
  if ((type === 'bicycle' || type === 'cruiser') && V.rack) { const bx0 = B.xf - 1, bz0 = rf * 2 - 2; m.box(bx0, cy - 3, bz0, bx0 + 6, cy + 3, bz0 + 5, M.wood); fillI(() => 0, bx0 + 1, cy - 2, bz0 + 1, bx0 + 5, cy + 2, bz0 + 5); }
  const front = B.box ? B.box[1] : B.xf + 1, lamp = B.box ? 12 : Math.min(B.bars[1] - 3, 15);
  m.box(front - 1, fy, lamp - 1, front + 0.5, fy + 1, lamp + 1, M.head);
  A.head.push([front, cy, lamp]); A.tail.push([Math.max(1, B.xr - B.r + 1), cy, B.r + 2]); A.rev.push([Math.max(1, B.xr - B.r + 1), cy, B.r + 2]);
  A.seat = [(s0 + s1) / 2, cy, sh + 1];
}

// ---- motorcycles (MC1, task #366) -----------------------------------------------------------------------------------
// One builder for the MC1 line-up: the wheels (spoked or cast; fat, knobbly or small), a V-twin or a single (a scooter's
// hidden under its body), the frame, the tank, the seat, the fork (raked out long on the chopper), the bars (pull-backs,
// ape hangers, clip-ons, wide motocross bars) and each type's kit: a fairing and screen, hard bags and a top box, a sissy
// bar, number boards, a scooter's apron and floorboard, the trike's axle and rear body, the rat bike's rust and leather
// satchels, the chopper's flames, the police tourer's lights.
export const MOTO = new Set(['vtwin', 'tourer', 'chopper', 'bobber', 'caferacer', 'dirtbike', 'scooter', 'trike', 'ratbike', 'bagger', 'policebike']);
// r / rf: rear / front wheel radius; tw: tyre width across; xr / xf: the axles; eng: 'vtwin' | 'single' | 'scoot';
// tank: [x0, x1, z0, z1, half-width]; seat: [x0, x1, z, half-width, kind]; head: the top of the steering head [x, z]
// (the fork runs from it to the front axle); bars: [x, z, half-width, kind]; fender: 'full' | 'bob' | 'high'
const MOTOS = {
  vtwin:     { r: 7, rf: 7, tw: 4, xr: 9, xf: 45, eng: 'vtwin', tank: [25, 37, 15, 21, 3.5], seat: [11, 26, 18, 3.5, 'step'], head: [40, 22], bars: [36, 25, 8, 'pull'], fender: 'full', pipes: 2 },
  tourer:    { r: 7, rf: 7, tw: 4, xr: 10, xf: 49, eng: 'vtwin', tank: [28, 39, 16, 22, 4.5], seat: [9, 28, 18, 4, 'two'], head: [43, 22], bars: [39, 25.5, 8, 'pull'], fender: 'full', fairing: 'shell', screen: 7, bags: [3, 19], topbox: true, cast: true },
  chopper:   { r: 7.5, rf: 6.5, tw: 4, xr: 9, xf: 58, eng: 'vtwin', tank: [27, 36, 17, 22, 3], seat: [12, 25, 17, 3, 'king'], head: [38, 25], bars: [36, 34, 7, 'ape'], fender: 'bob', sissy: true, pipes: 2, flames: true },
  bobber:    { r: 7.5, rf: 7.5, tw: 5, xr: 9, xf: 41, eng: 'vtwin', tank: [23, 33, 15, 20, 3.5], seat: [14, 22, 18, 3, 'solo'], head: [36, 21], bars: [32, 24, 7, 'pull'], fender: 'bob', pipes: 1 },
  caferacer: { r: 7, rf: 7, tw: 3, xr: 9, xf: 41, eng: 'single', tank: [22, 33, 16, 21, 3.5], seat: [8, 22, 18, 2.5, 'hump'], head: [36, 21], bars: [33, 19.5, 6, 'clip'], fender: 'bob', pipes: 1 },
  dirtbike:  { r: 7, rf: 8, tw: 3, xr: 8, xf: 40, eng: 'single', tank: [21, 30, 17, 22, 3.5], seat: [8, 28, 20, 2.5, 'long'], head: [33, 24], bars: [31, 27, 8, 'mx'], fender: 'high', knobby: true, plate: true, pipes: 1 },
  scooter:   { r: 5, rf: 5, tw: 4, xr: 8, xf: 34, eng: 'scoot', seat: [6, 22, 17, 4, 'scoot'], head: [31, 20], bars: [30, 23, 7, 'scoot'], fender: null, cast: true },
  trike:     { r: 8, rf: 7, tw: 7, xr: 10, xf: 51, eng: 'vtwin', tank: [29, 40, 16, 22, 4], seat: [17, 31, 18, 4, 'two'], head: [44, 22], bars: [40, 25.5, 8, 'pull'], fender: 'full', trike: true, cast: true },
  ratbike:   { r: 7.5, rf: 7.5, tw: 5, xr: 9, xf: 45, eng: 'vtwin', tank: [25, 36, 15, 21, 3.5], seat: [12, 25, 18, 3.5, 'solo'], head: [40, 22], bars: [36, 25, 8, 'pull'], fender: 'bob', rat: true, pipes: 2, knobby: true },
  bagger:    { r: 7, rf: 7, tw: 4, xr: 10, xf: 49, eng: 'vtwin', tank: [28, 39, 15, 21, 4.5], seat: [10, 28, 17, 4, 'two'], head: [43, 22], bars: [39, 24.5, 8, 'pull'], fender: 'full', fairing: 'bat', screen: 4, bags: [3, 19], cast: true },
  policebike: { r: 7, rf: 7, tw: 4, xr: 8, xf: 42, eng: 'vtwin', tank: [23, 33, 16, 21, 4], seat: [10, 24, 18, 3.5, 'solo'], head: [36, 22], bars: [33, 25, 7, 'pull'], fender: 'full', fairing: 'shell', screen: 6, bags: [2, 14], cast: true, police: true },
};
function motoBike(m, M, V, type, A) {
  const L = m.w, W = m.d, cy = W / 2, B = MOTOS[type];
  const fy = Math.floor(cy - 0.5);
  const fillI = (fn, x0, y0, z0, x1, y1, z1) => m.fill(fn, Math.floor(x0), Math.floor(y0), Math.floor(z0), Math.ceil(x1), Math.ceil(y1), Math.ceil(z1));
  // a round bar from (x0, z0) to (x1, z1), d thick, y0..y1 across
  const tube = (x0, z0, x1, z1, mat, d = 1.4, y0 = fy, y1 = fy + 1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2) + 1;
    for (let i = 0; i <= n; i++) { const k = i / n, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k; m.box(x - d / 2, y0, z - d / 2, x + d / 2, y1, z + d / 2, mat); }
  };
  const police = !!B.police, body = police ? M.white : M.body;
  const leather = m.mat({ ramp: R('#6a4228', 6, 2), k: 2.2, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) - 0.5) * 0.9 });
  const seatM = m.mat({ ramp: R(type === 'caferacer' || type === 'bobber' || type === 'scooter' ? '#7a4a2a' : '#2e2a2c', 6, 2), k: 2.4, shade: (x) => ((Math.round(x) % 3 === 0 && type === 'caferacer') ? -0.8 : 0) });
  // ---- wheels: a tyre ring and a cast or spoked rim; knobbly tyres on the dirt bike and the rat bike
  const knob = B.knobby ? m.mat({ ramp: R('#2a2a30', 5, 2), k: 1.2, shade: (x, y, z) => ((Math.round(Math.atan2(z - 7, x - (x < L / 2 ? B.xr : B.xf)) * 6) & 1) ? -0.9 : 0.5) }) : M.tyre;
  const wheel = (x, r, y0, y1) => {
    m.cyl('y', x, 0, r, r, y0, y1, knob, r - (B.knobby ? 2 : 1.8), 0);
    if (B.cast) m.cyl('y', x, 0, r, r - 1.8, y0 + 0.5, y1 - 0.5, M.rim);
    else fillI((xx, y, z) => { const dx = xx - x, dz = z - r, d = Math.hypot(dx, dz); return d < r - 1.5 && (d < 1.4 || Math.abs(dx) < 0.5 || Math.abs(dz) < 0.5 || Math.abs(dx - dz) < 0.6 || Math.abs(dx + dz) < 0.6) ? M.chrome : -1; }, x - r, fy, 0, x + r, fy + 1, 2 * r);
    m.box(x - 1, y0 - 0.5, r - 1, x + 1, y1 + 0.5, r + 1, M.chrome);   // the hub
  };
  const twA = Math.floor(cy - B.tw / 2), twB = twA + B.tw;
  wheel(B.xf, B.rf, twA, twB);
  if (B.trike) for (const y0 of [1, W - 1 - B.tw]) wheel(B.xr, B.r, y0, y0 + B.tw);   // the trike: two wheels at the back
  else wheel(B.xr, B.r, twA, twB);
  m.look = { ...m.look, belt: 18, z0: B.r, roof: B.seat[2] + 2, wheels: [B.xr, B.xf], wr: B.r };
  const [hx, hz] = B.head, [t0, t1, tz0, tz1, thw] = B.tank || [0, 0, 0, 0, 0], [s0, s1, sz, shw, sk] = B.seat;
  // ---- the frame and the engine
  const ex = B.eng === 'scoot' ? B.xr + 6 : (B.tank ? t0 - 2 : 20), ez0 = Math.max(4, B.r - 2);
  if (B.eng !== 'scoot') {
    tube(hx - 1, hz - 3, ex + 6, ez0, M.dark, 1.6);                 // the down tube
    tube(hx - 1, hz - 1, s1 - 2, sz - 1, M.dark, 1.4);               // the backbone under the tank to the seat
    tube(ex - 4, ez0 + 1, s0 + 2, sz - 1, M.dark, 1.2);              // the seat rail
    for (const y of [twA - 1, twB]) tube(ex - 2, ez0 + 2, B.xr, B.r, M.dark, 1.4, y, y + 1);   // the swingarm, both sides
    for (const y of [twA - 1, twB]) tube(s0 + 3, sz - 1, B.xr + 1, B.r + 2, B.rat ? M.rust : M.chrome, 1, y, y + 1);   // the shocks
  }
  if (B.eng === 'vtwin') {
    m.box(ex - 5, cy - 3, ez0, ex + 6, cy + 3, ez0 + 5, M.dark);                                    // the crankcase
    m.cyl('y', ex, 0, ez0 + 3, 3, cy + 3, cy + 4, M.chrome); m.cyl('y', ex, 0, ez0 + 3, 3, cy - 4, cy - 3, M.chrome);   // the covers
    for (const [dx, lean] of [[-2.5, -0.5], [2.5, 0.5]]) for (let z = ez0 + 5; z < Math.min(tz0 + 1, ez0 + 12); z++) {   // two cylinders in a V, finned
      const x = ex + dx + (z - ez0 - 5) * lean;
      m.box(x - 1.8, cy - 2.5, z, x + 1.8, cy + 2.5, z + 1, (z & 1) ? M.chrome : M.steel);
    }
  } else if (B.eng === 'single') {
    m.box(ex - 4, cy - 3, ez0, ex + 5, cy + 3, ez0 + 5, M.dark);
    m.cyl('y', ex, 0, ez0 + 3, 2.5, cy + 3, cy + 4, M.chrome);
    for (let z = ez0 + 5; z < Math.min(tz0, ez0 + 11); z++) m.box(ex - 2.2, cy - 2.5, z, ex + 2.2, cy + 2.5, z + 1, (z & 1) ? M.steel : M.trim);
  }
  // ---- the tank (a teardrop: rounded, leaning in at the front and the back)
  if (B.tank) shell(m, { x0: t0, x1: t1, y0: cy - thw, y1: cy + thw, z0: tz0, z1: tz1, fr: 2, br: 2.5, r: 2, rz: 2, mat: body });
  if (B.flames) deco(m, (x, y, z) => (x + Math.sin(z * 1.3) * 1.6 > t0 + 4 ? M.stripeYellow : M.stripeRed), t0, 0, tz0, t1 - 2, W, tz1, (x, y, z, vv, side) => vv === body && side === 'y' && x + Math.sin(z * 1.3) * 1.6 > t0 + 1.5);
  if (police) deco(m, M.stripeBlue, t0, 0, tz0 + 2, t1, W, tz0 + 3.5, (x, y, z, vv, side) => side === 'y');
  // ---- the seat
  const seatBox = (x0, x1, z0, z1, hw) => shell(m, { x0, x1, y0: cy - hw, y1: cy + hw, z0, z1, r: Math.min(1.5, hw - 0.5), rz: 1, mat: seatM });
  if (sk === 'step') { seatBox(s0 + 6, s1, sz, sz + 2, shw); seatBox(s0, s0 + 7, sz + 1, sz + 3, shw - 0.5); }
  else if (sk === 'two') { seatBox(s0, s1, sz, sz + 2.2, shw); seatBox(s0, s0 + 3, sz + 2, sz + 7, shw - 0.5); }                       // a dual seat with a backrest
  else if (sk === 'king') { seatBox(s0 + 4, s1, sz - 1, sz + 1.5, shw); seatBox(s0, s0 + 5, sz + 1, sz + 3, shw - 0.5); }
  else if (sk === 'solo') { seatBox(s0, s1, sz, sz + 2, shw); for (const y of [cy - shw + 1, cy + shw - 2]) m.box(s0 + 1, y, sz - 3, s0 + 2, y + 1, sz, M.chrome); }   // sprung
  else if (sk === 'hump') { seatBox(s0 + 5, s1, sz, sz + 1.6, shw); shell(m, { x0: s0, x1: s0 + 6, y0: cy - shw, y1: cy + shw, z0: sz, z1: sz + 4, br: 2, r: 1.5, rz: 1.5, mat: body }); }
  else if (sk === 'long') { seatBox(s0, s1, sz, sz + 1.6, shw); }
  else if (sk === 'scoot') { seatBox(s0 + 2, s1, sz, sz + 2.5, shw); }
  // ---- the scooter's body: the rear cowl over the engine, the floorboard, the apron and the headset
  if (B.eng === 'scoot') {
    shell(m, { x0: 2, x1: s1 + 1, y0: cy - shw - 1, y1: cy + shw + 1, z0: 4, z1: sz, br: 4, fr: 2, r: 3, rz: 3, mat: body });         // the rear cowl
    m.box(s1 - 1, cy - 4, 4, hx - 1, cy + 4, 6, M.dark);                                                                       // the floorboard
    shell(m, { x0: hx - 4, x1: hx + 1, y0: cy - 5, y1: cy + 5, z0: 5, z1: hz, fr: -1, r: 2, rz: 1, mat: body });                     // the apron (leg shield)
    shell(m, { x0: B.xf - 4, x1: B.xf + 4, y0: cy - 3, y1: cy + 3, z0: B.rf + 2, z1: B.rf * 2 + 2, r: 2, rz: 2, mat: body });       // the front mudguard
    tube(hx - 1, hz, B.xf, B.rf, M.trim, 1.6);
  } else {
    // ---- the fork: two legs to the front axle (raked out long on the chopper), the triple clamp, the headlamp
    for (const y of [twA - 1, twB]) tube(hx, hz, B.xf, B.rf, B.rat ? M.trim : M.chrome, 1.2, y, y + 1);
    m.box(hx - 1.5, twA - 1, hz - 1, hx + 1.5, twB + 1, hz + 1, M.trim);
  }
  // ---- the bars
  const [ax, az, aw, bk] = B.bars, grips = (x0, x1, z) => { for (const y of [cy - aw, cy + aw - 1]) m.box(x0, y, z, x1, y + 1, z + 1, M.dark); };
  if (bk === 'ape') {
    for (const y of [cy - aw + 1, cy + aw - 2]) tube(hx, hz, ax, az, M.chrome, 1, y, y + 1);   // tall ape hangers
    m.box(ax - 0.5, cy - aw + 1, az - 1, ax + 0.5, cy + aw - 1, az, M.chrome);
    grips(ax - 3, ax, az - 1);
  } else if (bk === 'clip') { for (const y of [cy - aw, cy + aw - 1]) tube(hx, hz - 1, ax, az, M.trim, 1, y, y + 1); grips(ax - 2, ax, az); }
  else if (bk === 'mx') { m.box(ax - 0.5, cy - aw, az, ax + 0.5, cy + aw, az + 1, M.trim); m.box(ax - 0.5, cy - aw * 0.5, az - 1.5, ax + 0.5, cy + aw * 0.5, az - 0.5, M.trim); tube(hx, hz, ax, az, M.trim, 1.2); grips(ax - 0.5, ax + 0.5, az); }
  else if (bk === 'scoot') { shell(m, { x0: ax - 3, x1: ax + 2, y0: cy - 3, y1: cy + 3, z0: hz, z1: az + 1, r: 1.5, rz: 1, mat: body }); m.box(ax - 1, cy - aw, az - 0.5, ax + 1, cy + aw, az + 0.5, M.trim); grips(ax - 1, ax + 1, az - 0.5); }
  else { tube(hx, hz, ax + 1, az, M.chrome, 1.2); m.box(ax - 0.5, cy - aw, az, ax + 1, cy + aw, az + 1, M.chrome); grips(ax - 3, ax - 0.5, az); }   // pull-backs
  // ---- mudguards: an arc over each wheel (full: wrapping the back of the rear wheel; bobbed: short; high: motocross)
  const arc = (x, r, a0, a1, mat, y0, y1, gap = 1) => fillI((xx, y, z) => { const d = Math.hypot(xx - x, z - r), a = Math.atan2(z - r, xx - x); return Math.abs(d - (r + gap)) < 0.7 && a > a0 && a < a1 ? mat : -1; }, x - r - 3, y0, 0, x + r + 3, y1, 2 * r + 3);
  const fm = B.rat ? M.rust : body;
  if (B.fender === 'full') { if (!B.trike) arc(B.xr, B.r, 0.4, 3.0, fm, twA - 0.5, twB + 0.5); arc(B.xf, B.rf, 0.3, 2.2, fm, twA - 0.5, twB + 0.5); }
  else if (B.fender === 'bob') { if (!B.trike) arc(B.xr, B.r, 0.9, 2.4, fm, twA, twB); }
  else if (B.fender === 'high') {
    m.box(B.xf - 5, cy - 2.5, B.rf * 2 + 3, B.xf + 6, cy + 2.5, B.rf * 2 + 4, body);   // the front fender high over the wheel
    shell(m, { x0: 1, x1: s0 + 4, y0: cy - 2.5, y1: cy + 2.5, z0: sz - 2, z1: sz, br: -2, r: 1, mat: body });              // the rear fender, a long plastic tail
  }
  // ---- the exhaust: chrome pipes along the right side (two stacked on the V-twins), a black can on the dirt bike
  if (B.eng !== 'scoot') {
    const n = B.pipes || 1;
    for (let k = 0; k < n; k++) { const z0 = ez0 + 1 + k * 3; tube(ex + 3, z0 + 3, ex - 3, z0, M.chrome, 1.6, W - 3 - k, W - 1 - k); tube(ex - 3, z0, Math.max(2, B.xr - 6), z0 + (B.fender === 'high' ? 8 : 2), B.fender === 'high' ? M.dark : M.chrome, 2, W - 3, W - 1); }
  } else tube(8, 5, 2, 6, M.chrome, 2, W - 4, W - 2);
  // ---- each type's kit
  if (B.fairing === 'shell') {
    // a touring fairing: a rounded nose round the head, the screen rising out of it
    shell(m, { x0: hx - 2, x1: hx + 7, y0: cy - 6, y1: cy + 6, z0: hz - 6, z1: hz + 2, fr: 4, r: 3, rz: 2, mat: body });
    shell(m, { x0: hx - 1, x1: hx + 3, y0: cy - 5, y1: cy + 5, z0: hz + 2, z1: hz + 2 + B.screen, fr: 3, r: 2, rz: 1, mat: M.glass });
  } else if (B.fairing === 'bat') {
    // a batwing: wide and low on the fork, a short screen
    shell(m, { x0: hx - 1, x1: hx + 6, y0: 1, y1: W - 1, z0: hz - 5, z1: hz + 1, fr: 3, r: 4, rz: 2, mat: body });
    shell(m, { x0: hx, x1: hx + 3, y0: cy - 6, y1: cy + 6, z0: hz + 1, z1: hz + 1 + B.screen, fr: 2, r: 2, rz: 1, mat: M.glass });
  }
  if (B.bags) {   // hard bags either side of the rear wheel
    const [b0, b1] = B.bags;
    for (const [y0, y1] of [[0, Math.min(4.5, twA - 0.5)], [Math.max(W - 4.5, twB + 0.5), W]]) shell(m, { x0: b0, x1: b1, y0, y1, z0: 6, z1: 15, r: 1.5, rz: 2, mat: body });
    if (police) deco(m, M.stripeBlue, b0, 0, 10, b1, W, 11.5, (x, y, z, vv, side) => side === 'y');
  }
  if (B.topbox) { shell(m, { x0: 1, x1: 9, y0: cy - 5, y1: cy + 5, z0: 17, z1: 25, r: 2, rz: 2, mat: body }); m.box(2, cy - 4, 21, 3, cy + 4, 22, M.trim); }
  if (B.sissy) { for (const y of [cy - 3, cy + 2]) tube(s0 + 1, sz + 1, s0 - 1, sz + 12, M.chrome, 1, y, y + 1); m.box(s0 - 2, cy - 3, sz + 11, s0, cy + 3, sz + 12.5, M.chrome); }
  if (B.plate) { m.box(B.xf - 3, twA - 2, hz - 4, B.xf - 1, twB + 2, hz, M.white); m.box(s0 + 6, 0, sz - 5, s0 + 14, W, sz - 1, M.white); deco(m, M.dark, s0 + 9, 0, sz - 4, s0 + 11, W, sz - 2, (x, y, z, vv, side) => side === 'y'); }
  if (B.trike) {
    // the rear body: a wide boot between the back wheels, the seat on top, arches over the wheels, a bumper
    shell(m, { x0: 1, x1: B.xr + B.r + 3, y0: 1 + B.tw, y1: W - 1 - B.tw, z0: 6, z1: sz - 1, br: 3, r: 4, rz: 3, mat: body });
    for (const y0 of [0, W - 2 - B.tw]) shell(m, { x0: B.xr - B.r - 1, x1: B.xr + B.r + 2, y0, y1: y0 + B.tw + 2, z0: B.r * 2 - 1, z1: B.r * 2 + 1.5, r: 2, rz: 1, mat: body });
    m.box(B.xr - 1, 2, B.r - 1, B.xr + 1, W - 2, B.r + 1, M.trim);   // the axle
    m.box(0, 6, 7, 2, W - 6, 10, M.chrome);
  }
  if (B.rat) {
    deco(m, M.rust, 0, 0, 0, L, W, m.h, (x, y, z, vv) => (vv === body || vv === M.chrome) && vnoiseLite(x * 1.4, y * 1.4, z * 1.4) > 0.62);
    for (const y0 of [0, W - 4]) shell(m, { x0: s0 - 4, x1: s0 + 5, y0, y1: y0 + 4, z0: 9, z1: 17, r: 1.5, rz: 1.5, mat: leather });   // leather satchels
    m.cyl('y', s0 - 2, 0, sz + 2.5, 2.5, cy - 5, cy + 5, m.mat({ ramp: R('#5a6a3a'), k: 2.2 }));   // the bedroll
  }
  if (police) {
    // red and blue on the front either side of the lamp, a light pole behind the seat
    m.box(hx + 3, cy - 5, hz - 4, hx + 5, cy - 3, hz - 2, M.red); m.box(hx + 3, cy + 3, hz - 4, hx + 5, cy + 5, hz - 2, M.blue);
    m.box(s0 - 1, cy - 0.5, sz + 2, s0, cy + 0.5, sz + 10, M.trim); m.box(s0 - 2, cy - 1, sz + 10, s0 + 1, cy + 1, sz + 12, M.blue);
    A.siren.push([s0 - 0.5, cy, sz + 11, 1], [hx + 4.5, cy - 4, hz - 3, 0], [hx + 4.5, cy + 4, hz - 3, 1]);
  }
  // ---- lamps and anchors
  const lampX = B.fairing ? hx + 6 : B.eng === 'scoot' ? ax + 2 : hx + 2.5, lampZ = B.fairing ? hz - 2 : B.eng === 'scoot' ? az - 1 : hz - 2.5;
  m.box(lampX - 1.5, cy - 1.5, lampZ - 1.5, lampX + 1, cy + 1.5, lampZ + 1.5, M.head);
  if (B.eng !== 'scoot' && !B.fairing) m.box(lampX - 2.5, cy - 2, lampZ - 2, lampX - 1.5, cy + 2, lampZ + 2, M.chrome);   // the lamp's chrome bucket
  const tailX = B.trike || B.topbox ? 1 : Math.max(1, B.xr - B.r), tailZ = B.trike ? 12 : B.topbox ? 19 : B.fender === 'high' ? sz - 1 : B.r * 2 + 1;
  m.box(tailX - 1, cy - 1.5, tailZ - 1, tailX + 1, cy + 1.5, tailZ + 1, M.tail);
  A.head.push([lampX + 0.5, cy, lampZ]); A.tail.push([tailX, cy, tailZ]); A.rev.push([tailX, cy, tailZ]);
  A.seat = [(s0 + s1) / 2 + (sk === 'two' || sk === 'step' ? 3 : 0), cy, sz + 2];
  A.exhaust = [Math.max(2, B.xr - 6), W - 2, ez0 + 2]; A.fire.push([ex, cy, ez0 + 6]);
  void V;
}

// ---- the models ---------------------------------------------------------------------------------------
const CAR = {
  compact: { belt: 17, nose: 12, tail: 15.5, hood: 0.74, boot: 0.05, cab: [0.05, 0.73], roof: 31, fr: 11, br: 3.5, ci0: 3, ci1: 6, wheels: [0.17, 0.81], wr: 7, rf: 9, rr: 6, lampW: 8, seams: [0.5], pillars: [0.48], tailUp: 3 },
  sedan: { belt: 18, nose: 13, tail: 16.5, hood: 0.72, boot: 0.23, cab: [0.25, 0.75], roof: 33, fr: 13, br: 10, wheels: [0.19, 0.8], wr: 7.5, seams: [0.33, 0.55], pillars: [0.5] },
  taxi: { belt: 18, nose: 13, tail: 16.5, hood: 0.72, boot: 0.23, cab: [0.25, 0.75], roof: 33, fr: 13, br: 10, wheels: [0.19, 0.8], wr: 7.5, seams: [0.33, 0.55], pillars: [0.5] },
  police: { belt: 18, nose: 13, tail: 16.5, hood: 0.72, boot: 0.23, cab: [0.26, 0.74], roof: 33, fr: 13, br: 10, wheels: [0.19, 0.8], wr: 7.5, seams: [0.33, 0.55], pillars: [0.5] },
  sports: { belt: 16.5, nose: 11, tail: 15, hood: 0.66, boot: 0.2, cab: [0.28, 0.7], roof: 28, fr: 16, br: 13, ci0: 4, ci1: 8, wheels: [0.19, 0.8], wr: 7, rf: 11, rr: 8, lampW: 10, lampH: 3, seams: [0.56], pillars: [], shoulder: 0.45, ww: 8, wi: 2 },
  suv: { belt: 22, nose: 18, tail: 21, hood: 0.8, boot: 0.04, cab: [0.05, 0.79], roof: 42, fr: 12, br: 2.5, ci0: 2.5, ci1: 5, wheels: [0.19, 0.8], wr: 8.5, seams: [0.37, 0.6], pillars: [0.37, 0.6], z0: 5, tailUp: 6 },
  limo: { belt: 18, nose: 13, tail: 16, hood: 0.8, boot: 0.15, cab: [0.17, 0.82], roof: 32, fr: 14, br: 10, wheels: [0.13, 0.86], wr: 7.5, seams: [0.38, 0.55, 0.7], pillars: [0.4, 0.55, 0.68] },
};
CAR.fbi = CAR.suv;   // (the FBI's SUV: the same body, unmarked)
// soften the game's paint list for car bodies: saturated but not neon, no paper white
export function carPaint(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(...c), mn = Math.min(...c), l = (mx + mn) / 2, dl = mx - mn;
  if (dl < 0.02) { const g = Math.round((l > 0.8 ? 0.84 : Math.max(0.16, l * 0.9)) * 255).toString(16).padStart(2, '0'); return '#' + g + g + g; }
  const s = dl / (1 - Math.abs(2 * l - 1));
  let h = mx === c[0] ? (c[1] - c[2]) / dl + (c[1] < c[2] ? 6 : 0) : mx === c[1] ? (c[2] - c[0]) / dl + 2 : (c[0] - c[1]) / dl + 4;
  h *= 60;
  // warm paints (reds, oranges, yellows) stay rich; cool ones (greens, blues, purples) are toned down
  const warm = h < 70 || h > 330, sat = Math.min(s, warm ? 0.72 : 0.42), lt = l > 0.8 ? 0.84 : Math.max(0.16, l * (warm ? 0.95 : 0.88));
  const q = lt < 0.5 ? lt * (1 + sat) : lt + sat - lt * sat, pp = 2 * lt - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? pp + (q - pp) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? pp + (q - pp) * (2 / 3 - t) * 6 : pp; };
  return '#' + [f(h / 360 + 1 / 3), f(h / 360), f(h / 360 - 1 / 3)].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
}

// The search-and-rescue boat (RS1): a rigid inflatable - a dark deep-V hull inside a fat orange tube collar (a grey
// rubbing strake, white reflective patches), a grey non-slip deck, a centre console with its little windscreen and two
// jockey seats behind it, an A-frame arch over the stern with the light bar on top and a life ring hung on it, twin
// outboards. The paint is the tubes' colour. A.crew: the four places people stand or sit aboard (shared/vehicles.js
// rescueboat.crew), so the renderer can stand riders there.
function rescueBoat(m, M, A, L, W) {
  const cy = W / 2, r = 6.5, zc = 9, xb = L * 0.58, ax = L - 1 - r * 0.6 - xb, Rb = W / 2 - r;
  const deckM = m.mat({ ramp: R('#4a4c52'), k: 2, shade: (x, y) => (((x | 0) + (y | 0)) % 3 === 0 ? -0.6 : 0) });
  const hullM = m.mat({ ramp: R('#3a3c44'), k: 2 }), strake = m.mat({ ramp: R('#5a5c62'), k: 2 });
  const tape = m.mat({ ramp: ramp('#f2f2ee', 6, 3, { light: 0.7 }), k: 3 });
  // the tube collar: round in section, its centreline down each side and in to a point at the bow (a gentle ogive)
  const half = (x) => (x <= xb ? Rb : Rb * Math.max(0, 1 - ((x - xb) / ax) ** 1.8));
  const line = [];
  for (let k = 0; k <= 24; k++) { const x = xb + (ax * k) / 24; line.push([x, half(x)]); }
  const toLine = (x, yy) => {
    let best = x <= xb ? Math.abs(yy - Rb) : 1e9;
    for (let k = 1; k < line.length; k++) {
      const [x0, y0] = line[k - 1], [x1, y1] = line[k], dx = x1 - x0, dy = y1 - y0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (yy - y0) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(x - x0 - dx * t, yy - y0 - dy * t));
    }
    return best;
  };
  m.fill((x, y, z) => {
    if (x < 2) return -1;
    const dp = toLine(x, Math.abs(y - cy)), dz = z - zc;
    if (dp * dp + dz * dz > r * r) return -1;
    if (Math.abs(dz + 1.5) < 0.8) return strake;
    if (dz > 0 && dz < 2.5 && x < xb && Math.floor(x / 14) % 2 === 1) return tape;
    return M.body;
  }, 0, 0, 2, L, W, zc + r + 1);
  // the hull under it: a deep V, in to the bow
  m.fill((x, y, z) => (Math.abs(y - cy) <= (half(Math.min(x + 4, L)) + 1) * (0.35 + 0.65 * (z / 6)) ? hullM : -1), 1, 0, 0, L - 3, W, 6);
  // the deck inside the tubes
  m.fill((x, y) => (Math.abs(y - cy) < half(x) ? deckM : -1), 2, 0, 5, L - 4, W, 7);
  // the console, its windscreen, and the jockey seats behind it
  const c0 = Math.round(L * 0.5), c1 = Math.round(L * 0.62);
  m.box(c0, cy - 7, 7, c1, cy + 7, 18, M.dark);
  m.box(c1 - 2, cy - 6, 18, c1, cy + 6, 23, M.glass);
  m.box(c0 + 2, cy - 5, 18, c1 - 3, cy + 5, 19, M.trim);
  for (const y of [cy - 9, cy + 2]) { m.box(L * 0.36, y, 7, L * 0.45, y + 7, 12, M.seat); m.box(L * 0.36, y, 12, L * 0.38, y + 7, 16, M.seat); }
  // the A-frame over the stern: two legs, the cross bar, the light bar on top, a life ring hung on it, an aerial
  for (const y of [cy - 15, cy + 14]) m.box(12, y, 7, 14, y + 1, 29, M.chrome);
  m.box(12, cy - 15, 27, 14, cy + 15, 29, M.chrome);
  lightbar(m, M, 11, 15, 29);
  const ring = m.mat({ ramp: R('#ef6a1a'), k: 3 });
  m.cyl('x', 0, cy, 21, 4.5, 14, 15, ring, 2.5, 0);
  m.box(13, cy + 9, 29, 14, cy + 10, 40, M.trim);
  // twin outboards on the transom
  for (const y of [cy - 9, cy + 2]) { m.box(0, y, 2, 5, y + 7, 17, M.dark); m.box(0, y, 15, 6, y + 7, 19, M.trim); }
  A.head.push([L - 3, cy, zc + 3]); A.tail.push([2, cy - 12, zc + 3], [2, cy + 12, zc + 3]); A.wake = [0, cy]; A.fire.push([L * 0.4, cy, 10]);
  A.seat = [L * 0.42, cy - 6, 12];
}

export function vehicleModel(type, o = {}) {
  const [L, W] = VEHICLE_DIMS[type] || VEHICLE_DIMS.sedan;
  if (!VEHICLE_DIMS[type]) return vehicleModel('sedan', o);
  const tall = VEHICLE_TALL[type] || 36;
  const m = new Vox(L, W, tall + (type === 'policeboat' ? 16 : 11));
  m.anchors = { head: [], tail: [], rev: [], brake: [], siren: [], fire: [], seat: null, exhaust: null, wake: null, bed: null };
  // variant bits: rack (roof rails / ladder rack / basket), box (roof box on a rack), rusty, twoTone, sunroof
  const v = (o.variant | 0) & 7, V = { rack: !!(v & 1), box: (v & 3) === 3, rusty: v >= 6, twoTone: v === 4 || v === 5, sunroof: v === 2 };
  // how strongly horizontal paint picks up the sky sheen: full on cars, faint on big flat roofs
  const sheen = { van: 0.45, ambulance: 0.4, armored: 0.4, swat: 0.4, army: 0.4, bus: 0.3, firetruck: 0.3, foodtruck: 0.3, tram: 0.3, ferry: 0.2, tugboat: 0.4 }[type] ?? (VEHICLE_TALL[type] > 44 ? 0.35 : 1);
  m.look = { seed: 1 + v * 7 + (type.length * 13), sheen };
  const M = mats(m, o.paint || DEFAULT_PAINT[type] || '#808080', o);
  if (o.cab || DEFAULT_CAB[type]) { const C = paintSet(m, o.cab || DEFAULT_CAB[type]); M.cab = C.body; M.cabLower = C.lower; }
  const lit = o.lights || 0;
  const A = m.anchors;
  switch (type) {
    case 'compact': case 'sedan': case 'taxi': case 'police': case 'sports': case 'suv': case 'limo': case 'fbi': {
      const s = { ...CAR[type] };
      if (type === 'police') { s.roofMat = M.white; s.bumper = M.trim; }
      if (type === 'compact' && V.twoTone) s.roofMat = M.white;                     // two-tone roof
      if (type === 'sedan' && V.twoTone) s.roofMat = M.black;                       // vinyl top
      const b = carBody(m, M, s);
      thirdBrake(m, M, b, s.cab[0] + 0.02, s.roof);
      if (type === 'police') {
        // black-and-white: white doors from the front wheel to the rear wheel, a gold star on the doors,
        // the light bar, a push bar on some
        deco(m, M.white, b.wx[0] + b.wr + 2, 0, b.z0 + 2.5, b.wx[1] - b.wr - 2, W, b.belt + 1.2, (x, y, z, vv, side) => side === 'y' && vv === M.body);
        deco(m, M.gold, L * 0.44 - 2.5, 0, b.belt - 9, L * 0.44 + 2.5, W, b.belt - 4, (x, y, z, vv, side) => side === 'y' && (Math.abs(x - L * 0.44) + Math.abs(z - (b.belt - 6.5))) < 3);
        lightbar(m, M, L * 0.5 - 4, L * 0.5 + 2, s.roof, { wide: true });
        if (V.rack) { m.box(L - 2, 8, 5, L, W - 8, 16, M.trim); for (const y of [12, W - 14]) m.box(L - 3, y, 5, L, y + 2, 17, M.trim); }
      }
      if (type === 'taxi') {
        // checker band along the sides, the roof sign, a door roundel
        deco(m, (x, y, z) => (((Math.floor(x / 2.5) + Math.floor(z / 1.6)) % 2) ? M.black : M.white), b.wx[0] + b.wr + 1, 0, b.belt - 7.5, b.wx[1] - b.wr - 1, W, b.belt - 4.2, (x, y, z, vv, side) => side === 'y');
        const sign = m.mat({ ramp: R('#f4f0d8', 6, 3), k: 3, emi: lit ? [255, 236, 170, 230] : null, shade: (x, y, z) => ((z | 0) % 4 === 0 ? -1.2 : 0) });
        const sx = L * 0.47;
        m.box(sx - 4, b.cy - 6, s.roof, sx + 4, b.cy + 6, s.roof + 1, M.trim);
        shell(m, { x0: sx - 3.5, x1: sx + 3.5, y0: b.cy - 5.5, y1: b.cy + 5.5, z0: s.roof + 1, z1: s.roof + 5, r: 1, rz: 1.5, mat: sign });
        if (v & 2) deco(m, M.stripeRed, sx - 4, 0, s.roof + 2, sx + 4, W, s.roof + 4, (x, y, z, vv, side) => side !== 'z');   // an advert band
      }
      if (type === 'sports') {
        if (!V.rack) { m.box(1, 6, s.tail, 5, W - 6, s.tail + 5, M.trim); m.box(0, 4, s.tail + 5, 7, W - 4, s.tail + 7, M.body); }   // rear wing
        if (v & 2) deco(m, M.white, 0, b.cy - 4, 0, L, b.cy + 4, m.h, (x, y, z, vv, side) => side === 'z' && vv === M.body);       // racing stripes
        deco(m, M.seam, L * 0.8, 0, b.belt - 4, L * 0.86, W, b.belt + 1, (x, y, z, vv, side) => side === 'z' && Math.abs(Math.abs(y - b.cy) - 6) < 0.6); // hood vents
      }
      if ((type === 'compact' || type === 'sedan' || type === 'suv') && V.rack) {                                          // roof rails
        for (const y of [b.cy - b.hw0 + 6, b.cy + b.hw0 - 7]) m.box(L * s.cab[0] + 8, y, s.roof, L * s.cab[1] - 12, y + 1, s.roof + 2, M.trim);
        if (type !== 'suv' && V.box) shell(m, { x0: L * 0.38, x1: L * 0.62, y0: b.cy - 8, y1: b.cy + 8, z0: s.roof + 2, z1: s.roof + 6, r: 3, rz: 2, mat: M.dark });   // roof box
      }
      if (type === 'sedan' && V.sunroof) deco(m, M.glass, L * 0.42, b.cy - 6, s.roof - 1, L * 0.56, b.cy + 6, s.roof + 1, (x, y, z, vv, side) => side === 'z');   // sunroof
      if (type === 'limo') { deco(m, M.chrome, 0, 0, b.belt - 1, L, W, b.belt + 0.5, (x, y, z, vv, side) => side === 'y'); }
      if (type === 'fbi') {
        // unmarked: no light bar, the strobes hidden in the grille and at the top of the tailgate
        for (const [x0, x1, z0, s2] of [[L - 2, L, 9, 0], [0, 2, s.tail + 3, 1]]) {
          m.box(x0, b.cy - 7, z0, x1, b.cy - 4, z0 + 2, M.red); m.box(x0, b.cy + 4, z0, x1, b.cy + 7, z0 + 2, M.blue);
          const xa = s2 ? x0 + 0.5 : x1 - 0.5;
          A.siren.push([xa, b.cy - 5.5, z0 + 1, 0], [xa, b.cy + 5.5, z0 + 1, 1]);
        }
      }
      if (type === 'police' || type === 'taxi') A.seat = [L * 0.56, b.cy - W * 0.18, b.belt + 2];
      break;
    }
    case 'pickup': {
      const s = { belt: 21, nose: 16, tail: 20.5, hood: 0.79, boot: 0.02, cab: [0.45, 0.77], roof: 36, fr: 10, br: 1.5, ci0: 2.5, ci1: 5, wheels: [0.19, 0.81], wr: 8, z0: 4, seams: [0.62], pillars: [], lampW: 7, tailUp: 3, rr: 4 };
      const b = carBody(m, M, s);
      cutBed(m, M, b, 0, L * 0.44, 10);
      A.bed = 10;
      deco(m, M.seam, 1.5, 0, b.z0 + 4, 2.5, W, b.belt, (x, y, z, vv, side) => side === 'x' && Math.abs(y - b.cy) < b.hw0 - 3);       // tailgate seam
      thirdBrake(m, M, b, s.cab[0] + 0.005, s.roof);
      if (V.rack) { m.box(L * 0.42, 3, b.belt, L * 0.44, W - 3, b.belt + 9, M.trim); for (const y of [3, W - 5]) m.box(L * 0.42 - 3, y, b.belt, L * 0.42, y + 2, b.belt + 9, M.trim); }   // headache rack
      (o.cargo || []).forEach((t, i) => crateOn(m, 8 + (i % 3) * 13, 8 + Math.floor(i / 3) * 16, 11, t, M));
      break;
    }
    case 'van': {
      // a one-box delivery van: short nose, steep windscreen, glass only in the cab doors and the back doors
      const s = { belt: 25, nose: 21, tail: 24.5, hood: 0.84, boot: 0.0, cab: [0.0, 0.88], roof: 46, fr: 9, br: 0, ci0: 0.5, ci1: 2.5, wheels: [0.17, 0.81], wr: 8, z0: 5, seams: [0.7, 0.48], pillars: [], lampW: 8, lampZ: 17, tailUp: 4, rr: 4, rf: 8,
        win: (x, y, z, face) => face === 'front' || (face === 'side' && x > L * 0.68 && x < L * 0.82 && z > 31) || (face === 'back' && z > 30 && z < 41 && Math.abs(y - W / 2) > 2) };
      const b = carBody(m, M, s);
      deco(m, M.seam, 0, 0, 8, L * 0.66, W, 44, (x, y, z, vv, side) => side === 'y' && (Math.abs(x - L * 0.4) < 0.5 || (Math.abs(z - 41) < 0.5 && x > L * 0.38)));   // sliding door
      deco(m, M.seam, 0, b.cy - 0.5, 8, 2, b.cy + 0.5, 44, (x, y, z, vv, side) => side === 'x');                                        // back doors
      roofKit(m, M, 4, L * 0.8, s.roof - 1, { step: 18, vents: V.rack ? [] : [[L * 0.5, W / 2 - 4, 8, 8]] });
      if (V.rack) for (let x = L * 0.12; x < L * 0.7; x += 14) m.box(x, 6, s.roof, x + 2, W - 6, s.roof + 2, M.trim);              // ladder rack
      if (v & 2) deco(m, M.stripeBlue, 0, 0, 22, L * 0.66, W, 26, (x, y, z, vv, side) => side === 'y' && vv === M.body);             // fleet stripe
      if (v & 4) deco(m, M.stripeRed, 0, 0, 26, L * 0.66, W, 28, (x, y, z, vv, side) => side === 'y' && vv === M.body);
      A.seat = [L * 0.76, b.cy - W * 0.2, 28];
      break;
    }
    case 'ambulance': case 'armored': case 'swat': case 'army': {
      const amb = type === 'ambulance', boxH = amb ? 54 : type === 'swat' || type === 'army' ? 52 : 50, cabH = amb ? 44 : 42;
      // the cab: a van nose; the box behind it is taller and squarer
      const s = { belt: amb ? 24 : 23, nose: amb ? 20 : 19, tail: 22, hood: 0.84, boot: 0.0, cab: [0.66, 0.89], roof: cabH, fr: 8, br: 0, ci0: 1.5, ci1: 3, wheels: [0.18, 0.8], wr: 8.5, z0: 5, seams: [0.76], pillars: [], lampW: 8, lampZ: 16, rr: 3, rf: 7, mirrors: true,
        win: (x, y, z, face) => face === 'front' || (face === 'side' && x > L * 0.74 && z > cabH - 13) };
      const b = carBody(m, M, s);
      const bx1 = L * 0.7, boxMat = (x, y, z, sh) => {
        if (amb && z > 18 && z < 24) return M.stripeRed;
        if (!amb && sh.side < 1.6 && (Math.round(x) % 14 === 0 || Math.round(z) % 13 === 0)) return M.seam;
        return M.body;
      };
      boxBody(m, 1, bx1, 8, boxH, boxMat, { r: amb ? 3 : 2, rz: amb ? 3 : 1.5 });
      roofKit(m, M, 2, bx1, boxH - 1, { step: amb ? 20 : 14, vents: amb ? [[L * 0.3, W / 2 - 5, 10, 10]] : type === 'armored' ? [[L * 0.2, W / 2 - 4, 8, 8], [L * 0.45, W / 2 - 4, 8, 8]] : [] });
      wheel(m, M, b.wx[0], b.wr, { width: 8, inset: 2 });
      // rear doors, tail lamps high on the box corners
      deco(m, M.seam, 0, b.cy - 0.5, 9, 2, b.cy + 0.5, boxH - 2, (x, y, z, vv, side) => side === 'x');
      deco(m, M.tail, 0, 0, boxH - 10, 3, W, boxH - 4, (x, y, z, vv, side) => Math.abs(y - b.cy) > b.cy - 4);
      deco(m, M.tail, 0, 0, 12, 3, W, 18, (x, y, z, vv, side) => Math.abs(y - b.cy) > b.cy - 6);
      A.tail.push([1, 4, boxH - 7], [1, W - 4, boxH - 7]);
      if (amb) {
        // the box: a red band, a blue star emblem, red corner beacons, a light bar on the cab
        const em = L * 0.36, ez = 36;
        deco(m, M.stripeBlue, em - 6, 0, ez - 6, em + 6, W, ez + 6, (x, y, z, vv, side) => side === 'y' && (Math.abs(x - em) < 1.4 || Math.abs(z - ez) < 1.4 || Math.abs((x - em) - (z - ez)) < 1.2 || Math.abs((x - em) + (z - ez)) < 1.2) && Math.hypot(x - em, z - ez) < 5.8);
        deco(m, M.glass, L * 0.08, 0, 30, L * 0.16, W, 42, (x, y, z, vv, side) => side === 'y');                                       // box side window
        for (const x of [2, bx1 - 6]) for (const y of [1, W - 4]) m.box(x, y, boxH - 6, x + 4, y + 3, boxH - 1, M.red);
        for (const y of [1, W - 4]) A.siren.push([bx1 - 4, y + 1.5, boxH - 3, 0]);
        lightbar(m, M, L * 0.74, L * 0.79, cabH, { wide: true });
        deco(m, M.stripeRed, L * 0.7, 0, 18, L, W, 24, (x, y, z, vv, side) => side === 'y' && vv === M.body);
      } else {
        // armored and SWAT: small barred windows, riveted plates, an emblem; beacons and roof rails
        for (const wx0 of [L * 0.12, L * 0.3, L * 0.48]) deco(m, M.glass, wx0, 0, 32, wx0 + 7, W, 38, (x, y, z, vv, side) => side === 'y');
        const em = L * 0.36, ez = 22;
        if (type === 'army') {   // a white five-pointed star on the doors
          deco(m, M.white, em - 6, 0, ez - 6, em + 6, W, ez + 6, (x, y, z, vv, side) => { if (side !== 'y') return false; const dx = x - em, dz = z - ez, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx); return r < 5.6 * (0.52 + 0.48 * Math.pow(Math.abs(Math.cos(2.5 * (a - Math.PI / 2))), 3)); });
        } else deco(m, type === 'swat' ? M.gold : M.white, em - 5, 0, ez - 5, em + 5, W, ez + 5, (x, y, z, vv, side) => side === 'y' && Math.abs(x - em) + Math.max(0, z - ez) * 0.6 + Math.max(0, ez - z) * 1.2 < 5);
        deco(m, M.chrome, 0, 0, 0, bx1, W, boxH, (x, y, z, vv, side) => side === 'y' && (Math.round(x) % 14 === 7 && Math.round(z) % 8 === 4));    // rivets
        if (type === 'armored') { for (const y of [2, W - 5]) { m.box(bx1 - 6, y, boxH, bx1 - 2, y + 3, boxH + 3, M.amber); A.siren.push([bx1 - 4, y + 1.5, boxH + 2, 2]); } }
        else {
          if (type !== 'army') lightbar(m, M, L * 0.75, L * 0.8, cabH, { wide: true });   // (the army has no siren)
          for (const y of [3, W - 4]) m.box(4, y, boxH, bx1 - 4, y + 1, boxH + 3, M.trim);                                               // roof rails
          for (let x = 8; x < bx1 - 4; x += 16) m.box(x, 3, boxH + 2, x + 1, W - 3, boxH + 3, M.trim);
          m.box(L - 2, 6, 6, L, W - 6, 20, M.trim);                                                                                       // push bar
        }
      }
      A.fire.push([L * 0.35, b.cy, boxH - 6]);
      break;
    }
    case 'bus': {
      // a city bus: cream body, teal band, a deep window band with mullions, doors front and middle,
      // roof units, a lit destination sign
      const cy = W / 2, banded = !!o.band;
      shell(m, { x0: 1, x1: L - 1, y0: 1.5, y1: W - 1.5, z0: 7, z1: 62, r: 5, rz: 4, fr: 3, mat: (x, y, z, s) => {
        if (z < 11) return M.lower;
        if (z > 15 && z < 23 && s.side < 1.6) return M.band;
        if (banded && z > 56 && (s.side < 3 || s.front < 16)) return M.band;   // a line's bus: its colour round the roof's edge and over the cab (seen from above)
        const win = z > 29 && z < 50;
        if (win && s.front < 2.4 && s.side > 2) return M.glass;
        if (win && s.side < 1.6 && Math.round(x) % 21 > 1 && x > 8 && x < L - 8) return M.glass;
        if (s.back < 2.2 && z > 34 && z < 48 && s.side > 4) return M.glass;
        return M.body;
      } });
      m.look = { ...m.look, belt: 29, z0: 7, roof: 62, wheels: [L * 0.18, L * 0.8], wr: 9.5 };
      for (const x of [L - 20, L * 0.52]) deco(m, (xx) => (Math.abs(xx - (x + 7)) < 0.8 ? M.trim : M.glass), x, 0, 12, x + 14, W, 50, (xx, y, z, vv, side) => side === 'y');   // doors
      roofKit(m, M, 4, L - 4, 61, { step: 22 });
      m.box(L * 0.4, cy - 9, 62, L * 0.58, cy + 9, 66, M.steel); m.box(L * 0.18, cy - 7, 62, L * 0.26, cy + 7, 65, M.steel);             // roof units
      deco(m, M.dark, L * 0.41, cy - 8, 65, L * 0.57, cy + 8, 67, (x, y, z) => (x | 0) % 3 === 0);
      const dest = m.mat({ ramp: R('#2a2a2e'), k: 2, emi: [255, 170, 60, 110 + lit * 140] });
      deco(m, dest, L - 4, cy - 10, 52, L, cy + 10, 57, (x, y, z, vv, side) => side === 'x');
      wheels(m, [L * 0.18, L * 0.8], 9.5, M, { width: 8, inset: 2 });
      deco(m, M.head, L - 3, 0, 13, L, W, 18, (x, y, z, vv, side) => Math.abs(y - cy) > cy - 8);
      truckRear(m, M, 14);
      A.head.push([L - 1, 5, 15.5], [L - 1, W - 5, 15.5]);
      A.exhaust = [0, W - 8, 8]; A.fire.push([L * 0.15, cy, 40], [L * 0.6, cy, 40]); A.seat = [L - 14, 12, 28];
      break;
    }
    case 'flatbed': case 'boxtruck': case 'dumptruck': case 'mixer': case 'tanker': case 'garbage': case 'towtruck': {
      const cabH = 46, cx0 = truckCab(m, M, L - 1, cabH, { cabL: 30, hood: 14 });
      chassis(m, M, cx0, cx0 + 4);
      const back0 = 2, back1 = cx0 - 2, cy = W / 2;
      m.look = { ...m.look, belt: 30, z0: 7, roof: cabH, wheels: [L * 0.13, L * 0.27, L * 0.84], wr: 9.5 };
      if (type === 'flatbed') {
        // the deck rides above the dual wheels: a steel frame with a plank floor, low stake sides
        m.box(back0, 2, 17, back1, W - 2, 20, M.trim);
        m.box(back0, 3, 20, back1, W - 3, 22, M.wood);
        for (const [a, bb] of [[2, 4], [W - 4, W - 2]]) { for (let x = back0; x < back1; x += 12) m.box(x, a, 22, x + 2, bb, 28, M.trim); m.box(back0, a, 25, back1, bb, 27, M.wood); }   // stakes and rails
        m.box(back1 - 3, 2, 22, back1, W - 2, 44, M.trim);                                                                                   // headboard
        deco(m, M.steel, back1 - 3, 2, 22, back1, W - 2, 44, (x, y, z) => (z | 0) % 4 === 0);
        A.bed = 22;
        (o.cargo || []).forEach((t, i) => crateOn(m, back0 + 4 + (i % 3) * 26, 8 + Math.floor(i / 3) * 22, 22, t, M));
      } else if (type === 'boxtruck' || type === 'garbage') {
        const gar = type === 'garbage', boxM = gar ? M.body : M.white;
        boxBody(m, back0, back1, 11, gar ? 56 : 62, (x, y, z, s) => {
          if (gar && s.side < 1.6 && Math.round(x) % 16 === 0) return M.seam;
          if (!gar && s.side < 1.6 && Math.round(x) % 22 === 0) return M.seam;
          return boxM;
        }, { r: 1.5, rz: 1.5 });
        roofKit(m, M, back0, back1, gar ? 55 : 61, { step: gar ? 16 : 22 });
        if (gar) {
          // compactor at the back (hopper), the recycling arrows
          shell(m, { x0: 0, x1: 18, y0: 3, y1: W - 3, z0: 9, z1: 58, br: -6, r: 2, rz: 2, mat: M.lower });
          deco(m, M.trim, 0, 0, 9, 19, W, 58, (x, y, z, vv, side) => side === 'y' && ((x | 0) % 6 === 0 || (z | 0) % 9 === 0));
          const ex = back1 * 0.55, ez = 34;
          deco(m, M.white, ex - 7, 0, ez - 7, ex + 7, W, ez + 7, (x, y, z, vv, side) => side === 'y' && Math.abs(Math.hypot(x - ex, z - ez) - 5) < 1.2 && Math.atan2(z - ez, x - ex) % 2.1 > 0.5);
        } else {
          // a generic courier logo: a pink pig in a hurry
          const ex = back1 * 0.62, ez = 36, pink = m.mat({ ramp: R('#d86a90'), k: 3 });
          deco(m, pink, ex - 12, 0, ez - 8, ex + 9, W, ez + 8, (x, y, z, vv, side) => side === 'y' && (((x - ex) / 7) ** 2 + ((z - ez) / 5.5) ** 2 < 1 || ((x > ex - 12 && x < ex - 6) && Math.abs(((z - ez) | 0) % 3) === 0 && Math.abs(z - ez) < 5)));
          deco(m, M.white, ex - 1, 0, ez, ex + 1, W, ez + 2, (x, y, z, vv, side) => side === 'y');
          deco(m, M.seam, 0, cy - 0.5, 12, 2, cy + 0.5, 61, (x, y, z, vv, side) => side === 'x');
        }
      } else if (type === 'dumptruck') {
        shell(m, { x0: back0, x1: back1, y0: 2, y1: W - 2, z0: 11, z1: 40, br: -4, r: 2, mat: (x, y, z, s) => (s.side < 1.6 && Math.round(x) % 10 === 0 ? M.seam : M.body) });
        const gravel = m.mat({ ramp: R('#6e6258'), k: 3, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) - 0.5) * 1.8 });
        m.fill((x, y, z) => (x > back0 + 3 && x < back1 - 3 && y > 4 && y < W - 4 ? (z < 34 + Math.sin(x * 0.2) * 2 + Math.cos(y * 0.3) * 2 ? gravel : 0) : -1), 0, 0, 16, L, W, 41);
        m.box(back1 - 2, 4, 40, back1 + 6, W - 4, 42, M.body);                                                                               // cab guard
        A.bed = 30;
      } else if (type === 'mixer') {
        const drum = m.mat({ ramp: MAT.paintWhiteCar, k: 3 }), band = m.mat({ ramp: R('#c8302c'), k: 3 });
        m.fill((x, y, z) => { const t = (x - back0) / (back1 - back0); const rr = 20 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.95 + 0.2); const cz = 32 + t * 6; return (y - cy) ** 2 + (z - cz) ** 2 < rr * rr ? (Math.floor(t * 7 + (y - cy) * 0.04) % 2 ? band : drum) : -1; }, back0 + 4, 0, 10, back1, W, 62);
        m.box(back0, cy - 3, 18, back0 + 8, cy + 3, 30, M.trim);                                                                             // chute
        for (let z = 14; z < 50; z += 4) m.box(back1 - 3, W - 4, z, back1 - 1, W - 2, z + 1, M.steel);                                       // ladder
        m.box(back1 - 3, W - 4, 12, back1 - 2, W - 3, 52, M.steel);
      } else if (type === 'tanker') {
        const tank = m.mat({ ramp: MAT.chrome, k: 2.6, shade: (x, y, z) => (z > 44 ? 0.8 : z < 26 ? -0.6 : 0) });
        m.cyl('x', 0, cy, 34, cy - 3, back0, back1, tank);
        for (const [a, bb] of [[back0, back0 + 3], [back1 - 3, back1]]) m.cyl('x', 0, cy, 34, cy - 2, a, bb, M.steel);
        deco(m, M.stripeRed, back0, 0, 29, back1, W, 33, (x, y, z, vv, side) => side === 'y');
        const ex = back1 * 0.8, ez = 38;
        deco(m, M.stripeRed, ex - 4, 0, ez - 4, ex + 4, W, ez + 4, (x, y, z, vv, side) => side === 'y' && Math.abs(x - ex) + Math.abs(z - ez) < 3.6);
        for (let x = back0 + 14; x < back1 - 10; x += 28) { m.cyl('z', x, cy, 0, 4, 52, 55, M.steel); m.cyl('z', x, cy, 0, 2, 55, 56, M.trim); }
        m.box(back0 + 6, cy - 1, 52, back1 - 6, cy + 1, 54, M.steel);                                                                       // catwalk
      } else {                                                                                                                              // tow truck
        const boom = m.mat({ ramp: R('#2f4a8a'), k: 3 });
        m.box(back0, 4, 11, back1, W - 4, 22, boom);
        deco(m, M.stripeYellow, back0, 0, 15, back1, W, 18, (x, y, z, vv, side) => side === 'y' && (((x | 0) >> 2) % 2 === 0));
        for (let s = 0; s < 46; s++) m.box(back1 - 16 - s * 0.9, cy - 3, 22 + s * 0.55, back1 - 10 - s * 0.9, cy + 3, 26 + s * 0.55, boom);
        m.box(2, cy - 1, 30, 4, cy + 1, 47, M.trim);                                                                                         // cable
        m.box(1, cy - 2, 26, 5, cy + 2, 30, M.chrome);                                                                                       // hook
        m.box(0, 5, 6, 8, W - 5, 9, M.trim);                                                                                                 // wheel lift
        lightbar(m, M, cx0 + 5, cx0 + 11, cabH, { amber: true, wide: true });
      }
      wheels(m, [L * 0.13, L * 0.27, L * 0.84], 9.5, M, { width: 8, inset: 2 });
      truckRear(m, M, 12);
      if (type !== 'tanker' && type !== 'mixer') A.fire.push([L * 0.35, cy, 30]);
      break;
    }
    case 'firetruck': {
      // cab-forward fire engine: red body, white band, chrome pump panel, roller doors, a ladder on top
      const cy = W / 2, cabX = L - 34;
      shell(m, { x0: 1, x1: L - 1, y0: 1.5, y1: W - 1.5, z0: 7, z1: 50, r: 3, rz: 3, mat: (x, y, z, s) => {
        if (z > 25 && z < 28 && s.side < 1.6) return M.white;
        if (x > cabX && z > 32 && z < 47 && (s.side < 1.6 || s.front < 2.2) && !(s.side < 1.6 && Math.abs(x - (cabX + 14)) < 1.2)) return M.glass;
        if (z < 11) return M.lower;
        return M.body;
      } });
      m.box(cabX + 2, 4, 50, L - 3, W - 4, 54, M.white);                                                                                    // cab roof
      m.look = { ...m.look, belt: 28, z0: 7, roof: 54, wheels: [L * 0.14, L * 0.26, L * 0.82], wr: 9.5 };
      deco(m, M.seam, 4, 0, 10, cabX - 4, W, 46, (x, y, z, vv, side) => side === 'y' && (Math.abs(((x - 4) % 20) - 19.5) < 0.6 || Math.abs(z - 46) < 0.6));   // roller doors
      deco(m, M.chrome, cabX - 22, 0, 12, cabX - 4, W, 44, (x, y, z, vv, side) => side === 'y');                                            // pump panel
      deco(m, M.dark, cabX - 20, 0, 18, cabX - 6, W, 40, (x, y, z, vv, side) => side === 'y' && (Math.hypot(((x - cabX + 20) % 6) - 3, ((z - 18) % 6) - 3) < 1.8));
      const lad = m.mat({ ramp: MAT.chrome, k: 3 });
      for (const y of [7, W - 9]) m.box(8, y, 52, L - 40, y + 2, 55, lad);
      for (let x = 10; x < L - 40; x += 5) m.box(x, 7, 52, x + 1, W - 7, 54, lad);
      for (const x of [8, L - 44]) m.box(x, 6, 50, x + 4, W - 6, 52, M.trim);
      m.cyl('y', 16, 0, 46, 5, 10, W - 10, M.trim);                                                                                          // hose reel
      lightbar(m, M, L - 29, L - 23, 54, { wide: true });
      wheels(m, [L * 0.14, L * 0.26, L * 0.82], 9.5, M, { width: 8, inset: 2 });
      deco(m, M.head, L - 3, 0, 13, L, W, 18, (x, y, z, vv, side) => Math.abs(y - cy) > cy - 9);
      deco(m, M.chrome, L - 3, 0, 7, L, W, 11, (x, y, z, vv, side) => side !== 'z');
      truckRear(m, M, 13);
      A.head.push([L - 1, 6, 15.5], [L - 1, W - 6, 15.5]); A.exhaust = [0, W - 8, 8]; A.fire.push([L * 0.5, cy, 40], [L - 20, cy, 40]); A.seat = [L - 18, 14, 30];
      break;
    }
    case 'vtwin': case 'tourer': case 'chopper': case 'bobber': case 'caferacer': case 'dirtbike': case 'scooter': case 'trike': case 'ratbike': case 'bagger': case 'policebike':
      motoBike(m, M, V, type, A); break;
    case 'bike': {
      // a sport bike: two spoked wheels, a fairing and tank, the seat and tail, forks, bars, a chrome pipe
      const cy = W / 2, pol = false, bodyM = M.body;
      for (const x of [8, L - 8]) { m.cyl('y', x, 0, 7, 7, cy - 2, cy + 2, M.tyre, 4.6, 0); m.cyl('y', x, 0, 7, 4.8, cy - 1, cy + 1, M.rim); }
      m.look = { ...m.look, belt: 18, z0: 8, roof: 24, wheels: [8, L - 8], wr: 7 };
      m.box(14, cy - 3, 6, 30, cy + 3, 13, M.dark);                                                                                          // engine
      deco(m, M.chrome, 14, 0, 6, 30, W, 13, (x, y, z) => (z | 0) % 3 === 0);
      shell(m, { x0: 14, x1: L - 11, y0: cy - 4.5, y1: cy + 4.5, z0: 11, z1: 21, fr: 5, r: 2.5, rz: 2.5, mat: bodyM });                     // tank and fairing
      shell(m, { x0: L - 17, x1: L - 9, y0: cy - 4, y1: cy + 4, z0: 13, z1: 24, fr: 6, br: -2, r: 2, mat: (x, y, z, s) => (z > 20 ? M.glass : bodyM) });   // nose and screen
      m.box(8, cy - 3, 18, 26, cy + 3, 21, M.seat);                                                                                          // seat
      shell(m, { x0: 3, x1: 14, y0: cy - 3, y1: cy + 3, z0: 15, z1: 22, br: 3, r: 1.5, mat: bodyM });                                       // tail
      for (let k = 0; k < 9; k++) m.box(L - 9 - k * 0.5, cy - 3, 7 + k, L - 8 - k * 0.5, cy - 2, 8 + k, M.chrome);                          // forks
      for (let k = 0; k < 9; k++) m.box(L - 9 - k * 0.5, cy + 2, 7 + k, L - 8 - k * 0.5, cy + 3, 8 + k, M.chrome);
      m.box(L - 16, 1, 21, L - 14, W - 1, 23, M.trim);                                                                                      // bars
      m.box(L - 10, cy - 2, 15, L - 8, cy + 2, 18, M.head);
      m.box(3, cy - 2, 17, 5, cy + 2, 19, M.tail);
      for (let k = 0; k < 14; k++) m.box(6 + k, W - 3, 7 + k * 0.35, 8 + k, W - 1, 9 + k * 0.35, M.chrome);                                 // exhaust
      if (pol) {
        for (const y of [0, W - 5]) shell(m, { x0: 2, x1: 13, y0: y, y1: y + 5, z0: 8, z1: 19, r: 1.5, rz: 1.5, mat: M.white });             // panniers
        deco(m, M.stripeBlue, 2, 0, 12, 13, W, 14, (x, y, z, vv, side) => side === 'y');
        deco(m, M.stripeBlue, 14, 0, 14, L - 11, W, 16, (x, y, z, vv, side) => side === 'y');
        m.box(4, cy - 0.5, 22, 5, cy + 0.5, 30, M.trim); m.box(3, cy - 1, 30, 6, cy + 1, 33, M.blue); m.box(L - 11, cy - 4, 18, L - 10, cy - 2, 20, M.red); m.box(L - 11, cy + 2, 18, L - 10, cy + 4, 20, M.blue);
        A.siren.push([4.5, cy, 31.5, 1], [L - 10.5, cy - 3, 19, 0], [L - 10.5, cy + 3, 19, 1]);
      }
      A.head.push([L - 9, cy, 16.5]); A.tail.push([4, cy, 18]); A.rev.push([4, cy, 18]); A.seat = [17, cy, 21]; A.exhaust = [6, W - 2, 8]; A.fire.push([22, cy, 14]);
      break;
    }
    case 'bicycle': case 'cruiser': case 'mtb': case 'roadbike': case 'bmx': case 'cargobike': pedalBike(m, M, V, type, A); break;
    case 'speedboat': case 'policeboat': case 'dinghy': case 'jetski': {
      const pol = type === 'policeboat', jet = type === 'jetski', din = type === 'dinghy';
      const hz = jet ? 8 : din ? 9 : 12, cy = W / 2;
      // speedboats keep a white hull and wear the paint as their stripe; the police boat is navy and white
      const navy = m.mat({ ramp: R('#22305a'), k: 3 }), sb = type === 'speedboat', accent = sb ? M.body : M.stripeBlue;
      const hullTop = pol ? navy : sb ? M.white : M.body, hullLow = pol ? navy : din ? M.lower : sb ? M.white : M.body;
      const deck = din ? M.lower : jet ? M.dark : m.mat({ ramp: R(pol ? '#8a8e96' : '#e4d8bc'), k: 3, shade: (x, y) => ((y | 0) % 4 === 0 ? -0.5 : 0) });
      const teak = m.mat({ ramp: MAT.woodDock, k: 3, shade: (x, y) => ((y | 0) % 3 === 0 ? -0.9 : 0) });
      m.fill((x, y, z) => {
        const t = x / L, bow = t > 0.66 ? (t - 0.66) / 0.34 : 0;
        const half = (W / 2 - 1) * (1 - bow * bow * 0.95) * (0.66 + 0.34 * (z / hz)) * (t < 0.02 ? 0.92 : 1);
        if (Math.abs(y - cy) > half) return -1;
        if (z > hz - 2) return Math.abs(y - cy) > half - 2.5 ? hullTop : (!din && !jet && !pol && t > 0.74) ? teak : deck;
        if (z > hz * 0.42 && z < hz * 0.62) return pol ? M.stripeYellow : din ? hullLow : jet ? M.white : accent;
        return z < hz * 0.42 ? hullLow : hullTop;
      }, 0, 0, 0, L, W, hz);
      if (din) {
        m.fill((x, y) => (Math.abs(y - cy) < W / 2 - 4 && x > 5 && x < L - 14 ? 0 : -1), 0, 0, 3, L, W, hz);                                // open hull
        deco(m, M.wood, 4, 0, 2, L - 13, W, 4, (x, y, z, vv, side) => side === 'z');
        for (const x of [L * 0.45, L * 0.2]) m.box(x, 4, 3, x + 6, W - 4, 7, M.wood);                                                        // benches
        m.box(0, cy - 4, 4, 6, cy + 4, 19, M.dark); m.box(-1, cy - 2, 0, 2, cy + 2, 5, M.trim); m.box(1, cy - 3, 16, 7, cy + 3, 19, M.trim);  // outboard
        if (v & 1) { m.box(L * 0.3, 6, 3, L * 0.3 + 8, 12, 9, M.white); m.box(L * 0.3, 6, 9, L * 0.3 + 8, 12, 10, M.stripeBlue); }         // cooler
        if (v & 2) for (const y of [5, W - 6]) for (let k = 0; k < 12; k++) m.box(L * 0.55 + k * 0.6, y, 6 + k * 1.4, L * 0.55 + k * 0.6 + 1, y + 1, 7 + k * 1.4, M.trim);   // rods
        A.seat = [10, cy, 7];
      }
      if (type === 'speedboat') {
        m.fill((x, y, z) => (x > L * 0.5 && x < L * 0.58 && Math.abs(y - cy) < W / 2 - 6 && z < hz + 8 - (x - L * 0.5) * 0.6 ? M.glass : -1), 0, 0, hz, L, W, hz + 9);
        deco(m, M.chrome, L * 0.5, 0, hz + 6, L * 0.58, W, hz + 9, (x, y, z, vv, side) => side === 'z');
        m.box(L * 0.3, 4, hz, L * 0.48, W - 4, hz + 1, M.seat);                                                                              // cockpit floor
        for (const y of [5, cy + 2]) m.box(L * 0.36, y, hz + 1, L * 0.44, y + 9, hz + 5, deck);                                              // seats
        m.box(L * 0.06, 4, hz, L * 0.26, W - 4, hz + 4, deck);                                                                              // rear bench
        for (const y of [cy - 9, cy + 2]) { m.box(-2, y, 3, 4, y + 7, hz + 8, M.dark); m.box(-2, y, hz + 6, 5, y + 7, hz + 9, M.trim); }    // twin outboards
        A.seat = [L * 0.4, cy - 5, hz + 4];
      }
      if (pol) {
        shell(m, { x0: L * 0.36, x1: L * 0.72, y0: 7, y1: W - 7, z0: hz, z1: hz + 18, fr: 6, r: 2, rz: 2, mat: glassy(M.white, M.glass, { band: [hz + 7, hz + 15], pillars: [L * 0.54] }) });
        lightbar(m, M, L * 0.48, L * 0.54, hz + 18, { wide: false });
        m.box(L * 0.42, cy - 0.5, hz + 18, L * 0.42 + 1, cy + 0.5, hz + 30, M.trim);                                                       // antenna
        for (const y of [3, W - 4]) { m.box(L * 0.1, y, hz, L * 0.9, y + 1, hz + 1, M.chrome); for (let x = L * 0.1; x < L * 0.9; x += 8) m.box(x, y, hz, x + 1, y + 1, hz + 6, M.chrome); m.box(L * 0.1, y, hz + 5, L * 0.36, y + 1, hz + 6, M.chrome); m.box(L * 0.72, y, hz + 5, L * 0.9, y + 1, hz + 6, M.chrome); }
        const ring = m.mat({ ramp: R('#e86a2a'), k: 3 });
        for (const y of [6, W - 7]) m.cyl('y', L * 0.6, 0, hz + 9, 3.5, y, y + 1, ring, 2, 0);
        m.box(-2, cy - 5, 3, 4, cy + 5, hz + 8, M.dark);
        A.seat = [L * 0.5, cy - 5, hz + 2];
      }
      if (jet) {
        m.box(L * 0.32, cy - 3, hz, L * 0.66, cy + 3, hz + 4, M.seat);
        shell(m, { x0: L * 0.6, x1: L * 0.86, y0: cy - 5, y1: cy + 5, z0: hz - 1, z1: hz + 5, fr: 4, r: 2, rz: 2, mat: M.body });
        m.box(L * 0.64, 1, hz + 5, L * 0.68, W - 1, hz + 7, M.trim);
        deco(m, M.white, 0, 0, hz - 3, L, W, hz, (x, y, z, vv, side) => side === 'y' && x > L * 0.2 && x < L * 0.6);
        A.seat = [L * 0.48, cy, hz + 4];
      }
      A.head.push([L - 2, cy, hz + 1]); A.tail.push([1, cy - 4, hz], [1, cy + 4, hz]); A.wake = [0, cy]; A.fire.push([L * 0.3, cy, hz + 4]);
      if (!A.seat) A.seat = [L * 0.4, cy, hz];
      break;
    }
    case 'rescueboat': rescueBoat(m, M, A, L, W); break;
    // ---- scenery models (not driven in the game) ----
    case 'foodtruck': {
      const y0 = 2, y1 = W - 8;
      shell(m, { x0: 1, x1: L - 1, y0, y1, z0: 5, z1: 58, r: 4, rz: 3, mat: (x, y, z, s) => {
        if (z < 9) return M.lower;
        if (x > L - 26 && z > 26 && z < 44 && (s.side < 1.6 || s.front < 2.2)) return M.glass;
        if (y > y1 - 1.6 && x > L * 0.22 && x < L * 0.66 && z > 24 && z < 42) return M.hatch;
        if (z > 46 && z < 50) return M.white;
        return M.body;
      } });
      m.fill((x, y, z) => (x > L - 12 && z > 30 + (x - (L - 12)) * 1.8 ? 0 : -1), L - 12, 0, 30, L, W, 59);
      m.box(L * 0.22, y1, 42, L * 0.66, W, 44, M.awn); m.box(L * 0.22, W - 1, 39, L * 0.66, W, 42, M.awn2);
      m.box(L * 0.22, y1, 23, L * 0.66, y1 + 4, 25, M.steel);
      m.box(L * 0.4, W / 2 - 6, 58, L * 0.55, W / 2 + 6, 63, M.steel);
      wheels(m, [L * 0.2, L * 0.78], 8, M, { inset: 3, arch: 0 });
      m.fill((x, y, z) => (y > y1 && z < 20 ? 0 : -1), 0, 0, 0, L, W, 20);
      lamps(m, M, { zh: 14, h: 5, inset: 4, wd: 8, tailUp: 6 });
      break;
    }
    case 'tractor': {
      shell(m, { x0: 30, x1: L - 2, y0: 14, y1: W - 14, z0: 12, z1: 30, r: 4, rz: 3, mat: (x, y, z) => (Math.round(x) % 6 === 0 && z > 16 && z < 26 ? M.lower : M.body) });
      shell(m, { x0: 6, x1: 36, y0: 8, y1: W - 8, z0: 14, z1: 50, r: 2, rz: 2, mat: glassy(M.body, M.glass, { band: [26, 46], pillars: [21] }) });
      m.box(6, 6, 48, 38, W - 6, 52, M.white);
      m.cyl('z', L - 14, W / 2, 0, 1.6, 30, 46, M.trim);
      for (const y of [0, W - 12]) m.cyl('y', 18, 0, 15, 15, y, y + 12, M.tyre, 8, M.rim);
      for (const y of [4, W - 12]) m.cyl('y', L - 14, 0, 9, 9, y, y + 8, M.tyre, 5, M.rim);
      lamps(m, M, { zh: 22, h: 4, inset: 16, wd: 6, bumpers: false });
      break;
    }
    case 'combine': {
      const hx = L - 26;
      shell(m, { x0: 4, x1: hx, y0: 26, y1: W - 26, z0: 16, z1: 56, r: 4, rz: 4, mat: M.body });
      m.box(10, 30, 56, 60, W - 30, 62, M.body);
      shell(m, { x0: hx - 28, x1: hx, y0: 40, y1: W - 40, z0: 44, z1: 70, r: 2, rz: 2, mat: glassy(M.body, M.glass, { band: [48, 66], pillars: [], sideGlass: true }) });
      m.box(hx - 6, 4, 6, L, W - 4, 22, M.body); m.box(hx - 4, 4, 22, L - 2, W - 4, 24, M.trim);
      m.cyl('y', L - 10, 0, 22, 9, 4, W - 4, M.trim, 6, 0);
      for (let y = 6; y < W - 6; y += 6) m.box(L - 2, y, 4, L, y + 2, 8, M.steel);
      for (let k = 0; k < 50; k++) m.box(30 + k * 0.4, 20 - k * 0.3, 58 + k * 0.1, 33 + k * 0.4, 24 - k * 0.3, 61 + k * 0.1, M.body);
      for (const y of [20, W - 34]) m.cyl('y', hx - 20, 0, 16, 16, y, y + 14, M.tyre, 9, M.rim);
      for (const y of [28, W - 38]) m.cyl('y', 20, 0, 10, 10, y, y + 10, M.tyre, 6, M.rim);
      break;
    }
    case 'plane': {
      const cy = W / 2;
      m.fill((x, y, z) => { const t = x / L, r = t < 0.15 ? 7 * (t / 0.15) + 2 : t > 0.75 ? 9 - (t - 0.75) * 24 : 9; return Math.hypot(y - cy, (z - 18) * 1.1) < r ? (z > 22 && t > 0.55 && t < 0.72 ? M.glass : Math.abs(z - 16) < 1 ? M.stripeRed : M.body) : -1; }, 0, 0, 6, L, W, 32);
      m.box(L * 0.45, 2, 22, L * 0.62, W - 2, 25, M.body); m.box(L * 0.45, 2, 22, L * 0.5, 10, 25, M.stripeRed); m.box(L * 0.45, W - 10, 22, L * 0.5, W - 2, 25, M.stripeRed);
      m.box(2, cy - 22, 18, 14, cy + 22, 20, M.body); m.box(2, cy - 1, 18, 14, cy + 1, 36, M.body); m.box(2, cy - 1, 30, 10, cy + 1, 36, M.stripeRed);
      m.box(L - 2, cy - 12, 12, L, cy + 12, 24, M.trim);
      for (const [x, y] of [[L * 0.62, cy - 14], [L * 0.62, cy + 12], [L * 0.86, cy - 1]]) { m.box(x, y, 3, x + 2, y + 2, 10, M.trim); m.cyl('y', x + 1, 0, 3, 3, y - 1, y + 3, M.tyre); }
      break;
    }
    case 'excavator': {
      const tw = 14;
      for (const y of [2, W - 2 - tw]) m.fill((x, yy, z) => (z < 14 - Math.max(0, Math.abs(x - L * 0.32) - 26) * 0.5 && x > 4 && x < L * 0.64 ? (Math.round(x) % 4 === 0 ? M.dark : M.tyre) : -1), 0, y, 0, L, y + tw, 14);
      m.box(L * 0.12, 8, 14, L * 0.56, W - 8, 34, M.body); m.box(L * 0.06, 10, 14, L * 0.16, W - 10, 34, M.dark);
      shell(m, { x0: L * 0.4, x1: L * 0.56, y0: 8, y1: 28, z0: 34, z1: 58, r: 2, mat: glassy(M.body, M.glass, { band: [38, 54], pillars: [] }) });
      for (let k = 0; k < 40; k++) { const x = L * 0.5 + k * 0.9, z = 32 + k * 0.9; m.box(x, W / 2 - 3, z, x + 3, W / 2 + 3, z + 4, M.body); }
      for (let k = 0; k < 40; k++) { const x = L * 0.5 + 36 + k * 0.5, z = 68 - k * 1.3; m.box(x, W / 2 - 2.5, z, x + 3, W / 2 + 2.5, z + 3, M.body); }
      m.fill((x, y, z) => (Math.hypot(x - (L - 8), z - 12) < 9 && x < L - 3 + (z - 12) * 0.3 && Math.abs(y - W / 2) < 7 ? M.dark : -1), L - 18, 0, 0, L, W, 24);
      break;
    }
    case 'tram': {
      const half = (L - 6) / 2;
      for (const [a, b, front] of [[1, half, false], [half + 6, L - 1, true]]) {
        shell(m, { x0: a, x1: b, z0: 6, z1: 58, fr: front ? 6 : 0, br: front ? 0 : 6, r: 6, rz: 4, mat: (x, y, z, s) => {
          if (z < 12) return M.lower;
          if (z > 14 && z < 19) return M.stripeRed;
          const win = z > 24 && z < 48;
          if (win && (s.side < 1.6 || (front && s.front < 2.4) || (!front && s.back < 2.4)) && !(s.side < 1.6 && Math.round(x) % 26 < 2)) return M.glass;
          if (s.side < 1.6 && z >= 48 && z < 51) return M.stripeRed;
          return M.body;
        } });
      }
      m.box(half, 6, 10, half + 6, W - 6, 54, M.dark);
      for (const [a, b] of [[30, 70], [half + 40, half + 80], [half - 60, half - 30]]) m.box(a, W / 2 - 12, 58, b, W / 2 + 12, 63, M.steel);
      for (let k = 0; k < 12; k++) { m.box(L * 0.62 + k * 1.5, W / 2 - 1, 63 + k, L * 0.62 + k * 1.5 + 2, W / 2 + 1, 64 + k, M.trim); m.box(L * 0.62 + 34 - k * 1.5, W / 2 - 1, 63 + k, L * 0.62 + 36 - k * 1.5, W / 2 + 1, 64 + k, M.trim); }
      m.box(L * 0.62 + 10, W / 2 - 12, 75, L * 0.62 + 26, W / 2 + 12, 77, M.trim);
      for (const x of [30, half - 30, half + 36, L - 30]) m.cyl('y', x, 0, 5, 5, 4, W - 4, M.tyre, 3, M.rim);
      lamps(m, M, { zh: 14, h: 5, inset: 6, wd: 8 });
      const dest = m.mat({ ramp: R('#2a2a2e'), k: 2, emi: [255, 180, 60, 120 + lit * 120] });
      m.box(L - 6, W / 2 - 10, 50, L - 2, W / 2 + 10, 54, dest);
      break;
    }
    case 'tugboat': case 'ferry': {
      const ferry = type === 'ferry', hz = ferry ? 30 : 22, cy = W / 2;
      const red = M.stripeRed, navy = m.mat({ ramp: R('#2a3a6a'), k: 3 }), topDeck = m.mat({ ramp: R(ferry ? '#3e7a5a' : '#8a6a48'), k: 3, shade: (x, y) => (Math.round(y) % 8 === 0 ? -0.6 : 0) });
      const carDeck = m.mat({ ramp: R('#5a5e66'), k: 3, shade: (x, y) => (Math.abs((y % 46) - 23) < 0.8 ? 2.5 : hash(Math.round(x / 3), Math.round(y / 3), 2) > 0.9 ? -0.6 : 0) });
      const deckM = ferry ? carDeck : topDeck;
      const hullBody = ferry ? M.white : M.body;
      m.fill((x, y, z) => {
        const t = x / L, bow = t > (ferry ? 0.8 : 0.66) ? (t - (ferry ? 0.8 : 0.66)) / (ferry ? 0.2 : 0.34) : 0;
        const halfW = (W / 2 - 2) * (1 - bow * bow * 0.9) * (0.8 + 0.2 * (z / hz)), stern = t < 0.03 ? t / 0.03 : 1;
        if (Math.abs(y - cy) > halfW * (0.7 + 0.3 * stern)) return -1;
        if (z > hz - 3) return Math.abs(y - cy) > halfW - 3 ? hullBody : deckM;
        if (z < 6) return ferry ? navy : red;
        if (ferry && z > hz - 12 && z < hz - 8) return red;
        if (ferry && z >= hz - 8 && z < hz - 5) return navy;
        return hullBody;
      }, 0, 0, 0, L, W, hz);
      if (!ferry) {
        for (let x = 6; x < L - 20; x += 13) for (const y of [1, W - 6]) m.cyl('y', x, 0, hz - 6, 4.5, y, y + 5, M.tyre, 2.2, 0);
        shell(m, { x0: L * 0.42, x1: L * 0.72, y0: cy - 18, y1: cy + 18, z0: hz, z1: hz + 26, r: 3, rz: 2, mat: glassy(M.white, M.glass, { band: [hz + 12, hz + 22], pillars: [L * 0.52, L * 0.62] }) });
        shell(m, { x0: L * 0.5, x1: L * 0.66, y0: cy - 12, y1: cy + 12, z0: hz + 26, z1: hz + 38, r: 2, mat: glassy(M.white, M.glass, { band: [hz + 28, hz + 36], pillars: [] }) });
        m.cyl('z', L * 0.36, cy, 0, 5, hz, hz + 34, M.dark); m.box(L * 0.36 - 5, cy - 5, hz + 30, L * 0.36 + 5, cy + 5, hz + 34, red);
        m.box(L * 0.6, cy - 1, hz + 38, L * 0.6 + 2, cy + 1, hz + 46, M.trim);
        m.box(L * 0.1, cy - 8, hz, L * 0.2, cy + 8, hz + 6, M.trim);
      } else {
        const c0 = L * 0.42, c1 = L * 0.86;
        shell(m, { x0: c0, x1: c1, y0: 6, y1: W - 6, z0: hz, z1: hz + 50, fr: 8, r: 4, rz: 2, mat: (x, y, z, s) => {
          const win = (z > hz + 10 && z < hz + 20) || (z > hz + 32 && z < hz + 42);
          if (win && (s.side < 1.6 || s.front < 2.4) && Math.round(x) % 24 > 2) return M.glass;
          if (z > hz + 24 && z < hz + 27) return navy;
          return M.white;
        } });
        m.box(c0 + 4, 10, hz + 50, c1 - 12, W - 10, hz + 51, topDeck);
        for (let x = c0 + 10; x < c1 - 20; x += 18) m.box(x, cy - 30, hz + 51, x + 10, cy - 26, hz + 54, M.wood);
        for (let x = c0 + 10; x < c1 - 20; x += 18) m.box(x, cy + 26, hz + 51, x + 10, cy + 30, hz + 54, M.wood);
        for (const y of [8, W - 9]) m.box(c0 + 2, y, hz + 51, c1 - 10, y + 1, hz + 58, M.chrome);
        for (const fy of [cy - 22, cy + 22]) { m.cyl('z', c0 + 40, fy, 0, 9, hz + 51, hz + 78, M.white); m.box(c0 + 31, fy - 9, hz + 66, c0 + 49, fy + 9, hz + 70, red); m.box(c0 + 31, fy - 9, hz + 70, c0 + 49, fy + 9, hz + 73, navy); m.cyl('z', c0 + 40, fy, 0, 6, hz + 78, hz + 81, M.dark); }
        m.box(c1 - 30, cy - 2, hz + 51, c1 - 26, cy + 2, hz + 92, M.white);
        for (const y of [6, W - 7]) m.box(4, y, hz, c0, y + 1, hz + 8, M.chrome);
        // (the stripes 2 px wide on a 4 px step from a multiple of 4: the game keeps this model at 2 px a voxel, where
        // stripes off that grid run together into one band)
        const zx = Math.round((L * 0.18) / 4) * 4;
        for (let k = 0; k < 8; k++) m.box(zx + k * 4, 14, hz, zx + k * 4 + 2, W - 14, hz + 1, M.paintLine);
      }
      break;
    }
    case 'waterbus': {
      // the island water bus: a white hull with a navy boot-top and a teal band, a long glazed cabin below and an open
      // top deck aft with benches and a rail, the wheelhouse forward on top, a mast with a light
      const hz = 20, cy = W / 2, teal = m.mat({ ramp: R('#2f8a86'), k: 3 }), navy = m.mat({ ramp: R('#22305a'), k: 3 });
      const topDeck = m.mat({ ramp: R('#8a6a48'), k: 3, shade: (x, y) => (Math.round(y) % 6 === 0 ? -0.6 : 0) });
      m.fill((x, y, z) => {
        const t = x / L, bow = t > 0.78 ? (t - 0.78) / 0.22 : 0;
        const halfW = (W / 2 - 1.5) * (1 - bow * bow * 0.92) * (0.82 + 0.18 * (z / hz)), stern = t < 0.03 ? t / 0.03 : 1;
        if (Math.abs(y - cy) > halfW * (0.7 + 0.3 * stern)) return -1;
        if (z > hz - 2) return Math.abs(y - cy) > halfW - 3 ? M.white : topDeck;
        if (z < 5) return navy;
        if (z > hz - 9 && z < hz - 5) return teal;
        return M.white;
      }, 0, 0, 0, L, W, hz);
      const c0 = L * 0.12, c1 = L * 0.8;
      shell(m, { x0: c0, x1: c1, y0: 6, y1: W - 6, z0: hz, z1: hz + 22, fr: 6, r: 3, rz: 2, mat: (x, y, z, s) => {
        if (z > hz + 6 && z < hz + 16 && (s.side < 1.6 || s.front < 2.4) && Math.round(x) % 16 > 2) return M.glass;
        if (z > hz + 18) return teal;
        return M.white;
      } });
      m.box(c0 + 2, 8, hz + 22, c1 - 2, W - 8, hz + 23, topDeck);
      for (let x = c0 + 8; x < L * 0.56; x += 14) for (const yy of [cy - 20, cy + 14]) m.box(x, yy, hz + 23, x + 9, yy + 6, hz + 27, M.wood);   // benches
      for (const yy of [8, W - 9]) m.box(c0 + 2, yy, hz + 23, c1 - 2, yy + 1, hz + 29, M.chrome);                                           // the rail
      shell(m, { x0: L * 0.6, x1: c1 - 2, y0: cy - 16, y1: cy + 16, z0: hz + 23, z1: hz + 40, r: 2, mat: glassy(M.white, M.glass, { band: [hz + 29, hz + 37], pillars: [L * 0.66, L * 0.72] }) });
      m.box(L * 0.66, cy - 1, hz + 40, L * 0.66 + 2, cy + 1, hz + 58, M.trim);                                                               // the mast
      deco(m, m.mat({ ramp: R('#f4f0d8', 5, 3), k: 3, emi: [255, 244, 210, 120 + (o.lights ? 135 : 0)] }), L * 0.66, cy - 1, hz + 56, L * 0.66 + 2, cy + 1, hz + 58, () => true);
      for (const yy of [4, W - 6]) m.box(L * 0.02, yy, hz, c0, yy + 1, hz + 6, M.chrome);
      break;
    }
    default: return vehicleModel('sedan', o);
  }
  // variant wear: rust and dirt (civilian models), blood on the front
  const civ = type === 'compact' || type === 'sedan' || type === 'pickup' || type === 'van' || type === 'suv' || type === 'dinghy';
  if (civ && V.rusty) {
    deco(m, M.rust, 0, 0, 0, L, W, 14, (x, y, z, vv, side) => vv === M.body && side !== 'z' && vnoiseLite(x, y, z) > 0.78);
  }
  if (o.bloody) deco(m, M.blood, L * 0.8, 0, 0, L, W, m.h, (x, y, z, vv) => vv !== M.glass && vv !== M.tyre && vnoiseLite(x * 1.6, y * 1.6, z * 1.6) > 0.55);
  if (o.state && o.state !== 'clean') applyState(m, M, o.state, type);
  m.smooth = 2;
  if (o.dry) return m;                                   // anchors only: no normals
  m.prepare(2);
  if (m.fixNormals) m.fixNormals();
  patchHidden(m);
  return m;
}

// ---- damage and fire ------------------------------------------------------------------------------------
// dented: scuffed paint and a cracked windscreen; wrecked: the front crushed in, glass broken out, a flat;
// burning: paint scorching from the engine back, fire behind the glass; burnt: a charred shell, no glass,
// no tyres; smoulder: burnt with glowing embers.
function applyState(m, M, state, type) {
  const L = m.w, W = m.d, cy = W / 2, burntish = state === 'burnt' || state === 'smoulder';
  const charred = m.mat({ ramp: ramp('#2a282c', 6, 2, { light: 0.35 }), k: 1.4, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) - 0.5) * 1.6 + (z > 14 ? 0.4 : 0) });
  const ash = m.mat({ ramp: R('#5a5450', 5, 2), k: 2, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) - 0.5) * 2 });
  const ember = m.mat({ ramp: R('#e86a2a', 5, 3), k: 3, emi: [255, 120, 40, 230] });
  // fire behind the glass: a dim orange glow broken by soot, brightest low in the cabin
  const fireGlass = m.mat({ ramp: R('#d86a28', 6, 3), k: 2.2, emi: [255, 120, 40, 150], flag: F_NOCAST, shade: (x, y, z) => (hash(x >> 1, z >> 1, 5) - 0.5) * 2.4 - (z - 20) * 0.08 });
  const soot = m.mat({ ramp: R('#2a2626', 5, 2), k: 1.5, flag: F_GLASS });
  const primer = m.mat({ ramp: R('#8a8a86', 5, 2), k: 2.2, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) - 0.5) });
  const scorch = m.mat({ ramp: R('#3a3438', 5, 2), k: 1.5, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) - 0.5) * 1.4 });
  const crack = m.mat({ ramp: R('#c8d8e4', 5, 3), k: 3, flag: F_GLASS });
  const scuffs = new Map();
  const scuffOf = (v) => { if (!scuffs.has(v)) { const Mv = m.mats[v]; scuffs.set(v, m.mat({ ...Mv, k: Math.max(0, Mv.k - 1.2), shade: null, emi: null })); } return scuffs.get(v); };
  const small = PEDAL.has(type) || MOTO.has(type) || type === 'bike' || type === 'jetski';
  const crushD = state === 'wrecked' ? (small ? 4 : 9) : burntish ? (small ? 2 : 5) : state === 'dented' ? 3 : 0;
  const isLamp = (v) => v === M.head || v === M.tail || v === M.rev || v === M.brakeL || v === M.red || v === M.blue || v === M.amber;
  for (let z = 0; z < m.h; z++) for (let y = 0; y < W; y++) for (let x = 0; x < L; x++) {
    const i = m.idx(x, y, z), v = m.v[i];
    if (!v) continue;
    const Mv = m.mats[v], glass = (Mv.flag & F_GLASS) !== 0, front = x / L;
    // the crushed front: an irregular bite out of the nose (deeper toward one corner)
    if (crushD) {
      const bite = crushD * (0.55 + 0.45 * (y / W)) * (0.7 + 0.6 * hash(y >> 2, z >> 2, 9));
      if (x > L - 1 - bite && z > 2) { m.v[i] = 0; continue; }
    }
    if (burntish) {
      if (glass && z > 4) { m.v[i] = 0; continue; }
      if (v === M.tyre) { m.v[i] = z < 2 ? ash : 0; continue; }
      if (v === M.interior || v === M.seat) { m.v[i] = ash; continue; }
      m.v[i] = v === M.rim || v === M.chrome ? scuffOf(v) : (state === 'smoulder' && hash(x >> 1, (y >> 1) * 7 + (z >> 1), 13) > 0.93) ? ember : vnoiseLite(x, y, z) > 0.9 ? M.rust : charred;
      continue;
    }
    if (state === 'burning') {
      if (glass) { m.v[i] = hash(x >> 1, (y >> 1) + (z >> 1) * 3, 21) > 0.55 ? fireGlass : soot; continue; }
      const sc = (front - 0.45) * 2.4 + (vnoiseLite(x, y, z) - 0.5) * 1.2 + (z > 20 ? 0.25 : 0);
      if (!isLamp(v) && v !== M.tyre && sc > 0.35) m.v[i] = sc > 0.85 ? charred : scorch;
      continue;
    }
    // dented / wrecked
    if (glass) {
      if (state === 'wrecked' && front < 0.62 && hash(x >> 1, (y >> 1) + z * 5, 4) > 0.35 && z > 4) { m.v[i] = 0; continue; }
      // a crack web round an impact point on the windscreen
      if (front > 0.55) { const dy = y - W * 0.62, dz = z - (m.look && m.look.belt ? m.look.belt + 6 : 24), a = Math.atan2(dz, dy), r = Math.hypot(dy, dz); if (r < 2 || Math.abs((a * 7 / Math.PI) % 1) < 0.16 || Math.abs(r - 5) < 0.5 || Math.abs(r - 9) < 0.5 || hash(x, y * 3 + z, 6) > (state === 'wrecked' ? 0.8 : 0.94)) m.v[i] = crack; }
      continue;
    }
    if (isLamp(v)) { if (front > 0.7 && state === 'wrecked') m.v[i] = M.dark; continue; }
    const h = hash(x, y * 7 + z, 17);
    if (front > 0.72 && v !== M.tyre && v !== M.rim && vnoiseLite(x * 1.5, y * 1.5, z * 1.5) > (state === 'wrecked' ? 0.62 : 0.78)) { m.v[i] = primer; continue; }
    if (h < (state === 'wrecked' ? 0.3 : 0.14) * (0.5 + front)) m.v[i] = scuffOf(v);
  }
  if (state === 'wrecked') {
    // a flat front tyre: the bottom rows of one front wheel squashed out
    for (let z = 0; z < 3; z++) for (let y = 0; y < W; y++) for (let x = Math.floor(L * 0.74); x < L; x++) { const i = m.idx(x, y, z); if (m.v[i] === M.tyre && y > cy) m.v[i] = 0; }
  }
  m.prepared = false;
}

// Vox.render marches each pixel's ray one height step at a time, so on a sloped or stepped surface it
// often lands on the voxel just under the surface, which prepare() leaves as interior (no normal, no
// occlusion): those pixels come out a step darker and dither into stripes. Give every near-surface
// interior voxel the average normal and occlusion of its surface neighbours. Call after prepare().
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export function patchHidden(m) {
  if (!m.prepared) m.prepare(m.smooth ?? 1);
  const { w, d, h, v } = m, n = w * d * h, wd = w * d;
  // near the surface = within one voxel (26-neighbourhood) of an empty cell: dilate the empty mask on x, y, z
  const a = new Uint8Array(n), b = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = v[i] ? 0 : 1;
  for (let i = 0; i < n; i++) { const x = i % w; b[i] = a[i] | (x > 0 ? a[i - 1] : 1) | (x < w - 1 ? a[i + 1] : 1); }
  for (let i = 0; i < n; i++) { const y = ((i / w) | 0) % d; a[i] = b[i] | (y > 0 ? b[i - w] : 1) | (y < d - 1 ? b[i + w] : 1); }
  for (let i = 0; i < n; i++) { const z = (i / wd) | 0; b[i] = a[i] | (z > 0 ? a[i - wd] : 1) | (z < h - 1 ? a[i + wd] : 1); }
  for (let i = 0; i < n; i++) {
    if (!v[i] || !b[i] || m.nx[i] || m.ny[i] || m.nz[i]) continue;
    const x = i % w, y = ((i / w) | 0) % d, z = (i / wd) | 0;
    let ax = 0, ay = 0, az = 0, ao = 0, c = 0;
    for (const [dx, dy, dz] of N6) {
      const xx = x + dx, yy = y + dy, zz = z + dz;
      if (xx < 0 || yy < 0 || zz < 0 || xx >= w || yy >= d || zz >= h) continue;
      const j = i + dx + dy * w + dz * wd;
      if (!v[j] || (!m.nx[j] && !m.ny[j] && !m.nz[j])) continue;
      ax += m.nx[j]; ay += m.ny[j]; az += m.nz[j]; ao += m.ao[j]; c++;
    }
    if (c) { const l = Math.hypot(ax, ay, az) || 1; m.nx[i] = ax / l; m.ny[i] = ay / l; m.nz[i] = az / l; m.ao[i] = ao / c; }
    else { m.nz[i] = 1; m.ao[i] = 0.8; }
  }
}

// cheap 3D value noise for rust patches and scorch
function vnoiseLite(x, y, z) { const s = 6, ix = Math.floor(x / s), iy = Math.floor(y / s), iz = Math.floor(z / s); return (hash(ix, iy * 31 + iz, 41) * 0.6 + hash(Math.floor(x / 3), Math.floor((y + z) / 3), 43) * 0.4); }

// lamp / siren / seat / exhaust / fire points of a model (model coordinates), measured once per type
const ANCHORS = new Map();
// (the island ferries have no lamps, seats or wake anchors: theirs come without building the model - the page asks for
// them to light the scene, and the car ferry is a second's work on a phone)
const BARE = new Set(['ferry', 'waterbus']);
export function vehicleAnchors(type) {
  let a = ANCHORS.get(type);
  if (!a && BARE.has(type)) { const [L, W] = VEHICLE_DIMS[type]; a = { head: [], tail: [], rev: [], brake: [], siren: [], fire: [], seat: null, exhaust: null, wake: null, bed: null, L, W, H: VEHICLE_TALL[type] || 36 }; ANCHORS.set(type, a); }
  if (!a) { const m = vehicleModel(type, { dry: true }); a = { ...m.anchors, L: m.w, W: m.d, H: VEHICLE_TALL[type] || 36 }; ANCHORS.set(type, a); }
  return a;
}
