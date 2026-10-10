// Art v2 live renderer: actors (docs/art-v2/GAME-RENDERER.md "Actors"). Pure, deterministic sprite
// providers for everything that moves - vehicles, boats, animals, crates, bags, balls, projectiles,
// trains and particles. Worker-safe: no DOM, no WebGL. Every sprite is a fresh G-buffer
// { w, h, ax, ay, col, nrm, z, emi, flag } (trimmed to its pixels) whose anchor (ax, ay) is the thing's
// ground point and whose z is the true height above it; the engine adds the ground height (a deck, a bed).
// Headings: index hi of N means angle hi * 2pi / N, 0 east, + toward south (e.ra). dir8: 0 S, 1 SW, 2 W,
// 3 NW, 4 N, 5 NE, 6 E, 7 SE.
//
//   vehicleKey(d, st, hi, N) / vehicleSprite(d, st, hi, N)   d = spawn descriptor {m, p, vr, tn}; st = {wreck,
//       burn, lights, siren (0 | 1 red phase | 2 blue phase | true both), brake, rev, bloody, dmg (stage 0-4), zones,
//       holes, off, cut, half ('a' | 'b': one half of a car cut in two)}; vehState(flags, phase, hp, dw) builds st from
//       the wire VF bits and the damage word (task #402). Anchor = the vehicle's centre on the ground.
//   vehicleLights(d) -> { L, W, H, kind, head, tail, brake, rev: [[x,y,z]], siren: [[x,y,z,c]] (c 0 red,
//       1 blue, 2 amber), seat, exhaust: [x,y,z], fire: [[x,y,z]], wake: [x,y], bed (cargo floor z) }, local
//       coordinates at heading 0 (+x forward, +y right, z up, origin the centre on the ground)
//   wakeKey / wakeSprite(d, hi, N, frame)   a boat's foam (4 looping frames), drawn under the hull
//   animalKey / animalSprite(kind, pose, dir8, frame)   kind 'pet:<art>' or any animals.js kind; poses and
//       frame counts in ANIMAL_FRAMES (idle 4, walk 4, run 4, sit 2, lie 2, graze 2)
//   crateKey / crateSprite(tier 1-4, label, hi = 0, N = 16)   ('Produce Box' label = the produce crate, 'Explosives' the red one)
//   bagKey / bagSprite(tier 0-4, hi, N)   ballKey / ballSprite(t 0 soccer | 1 volleyball, spin 0-3)
//   projKey / projSprite(w, hi, N)   the rocket in flight (body at z ~14, exhaust glowing)
//   trainKey / trainCarSprite(c, mode, hi, N)   c = TRAIN_CARS index (or {kind, L, W}); mode 'roof' | 'in'
//       (+ '-lit', '-empty', '-doors'); trainLights(c) -> head lamps and window light points
//   fxKey / fxSprite(name, frame), fxInfo(name), FX_NAMES   every client/art2/fx.js effect (.light on frames
//       that light their surroundings); muzzleSprite(size, hi, N, frame), tracerSprite(kind, hi, N, frame),
//       SHOT_FX[weapon index] -> [muzzle size, tracer kind]
//   FX_FOR_V1[v1 particle type] = { name, frames } (+ .decal, .event tables), v1ParticleFx / v1ParticleFrame,
//       v1DecalFx / v1DecalFrame: the v1 pooled particles and decals onto art2 frames
//   critterKey / critterSprite(kind, frame, left), critterInfo(kind), critterShadow(r)   ambient birds etc.
//   rideKey / rideSprite(kind, v)   the rides (shared/rides.js): 'cab' a Ferris wheel gondola (colour v 0-3; anchor
//       the ground point under its floor), 'balloon' a balloon on a flight (palette v 0-3, burner lit; anchor under
//       the basket)
//   useArt({ ferrisCab, hotAirBalloon, starfish })   the art the rides and the tidepools' star are drawn with
//       (props-park.js, props-rural.js, props-wild.js), handed in by whoever draws them - the bake workers
//       (worker.js), which have those modules loaded for the statics anyway. The page's renderer loads this module
//       only for the sprite keys: it never draws these, so it doesn't load their 40 KB of art before it can draw.
//   SPRITES / KEYS   one table per kind for the workers: SPRITES[kind](...args), KEYS[kind](...args)
//   clearActorCaches(), setActorBudget({ modelMB | lowMem })   the model caches (vehicles are kept packed,
//       compactVox / renderCompact: 6 bytes a voxel; default 48 MB of vehicle models, 16 MB on lowMem)
import { GBuf, F_NOCAST, F_GLASS, hash, bayer, norm, cutGBuf } from '../gbuf.js';
import { Vox } from '../voxel.js';
import { ramp, MAT } from '../palette.js';
import { vehicleModel, vehicleAnchors, carPaint, patchHidden, paintSheen, VEHICLE_DIMS, PEDAL, MOTO } from '../vehicles.js';
import { animalModel, renderUpright, ANIMALS } from '../animals.js';
import { birdModel, BIRDS } from '../birds.js';
import { FX, fxFrames, memo, muzzleFlash, tracer, wakeFrames } from '../fx.js';
import { CRITTERS, critterFrames, shadowBlob } from '../critters.js';
import { groundSprite as forageGround } from '../forage.js';
import { VEHICLE_BY_INDEX, PAINTS, unpackVehDamage } from '../../../shared/vehicles.js';
const ART = {};   // (useArt: ferrisCab, hotAirBalloon, starfish)
export function useArt(o) { Object.assign(ART, o); }

const TAU = Math.PI * 2;

// crop a sprite to its visible pixels (+1 px), keeping the anchor
export function trimSprite(G, pad = 1) {
  const { w, h, col } = G;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (col[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { const E = new GBuf(1, 1); E.ax = 0; E.ay = 0; if (G.ap) E.ap = G.ap; return E; }
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const S = new GBuf(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) {
    const si = y * w + x0, di = (y - y0) * S.w, n = S.w;
    S.col.set(G.col.subarray(si * 4, (si + n) * 4), di * 4); S.nrm.set(G.nrm.subarray(si * 4, (si + n) * 4), di * 4);
    S.emi.set(G.emi.subarray(si * 4, (si + n) * 4), di * 4); S.z.set(G.z.subarray(si, si + n), di); S.flag.set(G.flag.subarray(si, si + n), di);
  }
  S.ax = (G.ax ?? 0) - x0; S.ay = (G.ay ?? 0) - y0;
  if (G.ap) S.ap = G.ap;
  return S;
}

// LRU caches of built models, by count or by bytes (building a model costs more than rendering a heading)
class LRU {
  constructor(n, maxBytes = 0) { this.n = n; this.max = maxBytes; this.bytes = 0; this.m = new Map(); }
  get(k, make) {
    let v = this.m.get(k);
    if (v) { this.m.delete(k); this.m.set(k, v); return v; }
    v = make(); this.m.set(k, v); this.bytes += v.bytes || 0;
    while (this.m.size > 1 && (this.m.size > this.n || (this.max && this.bytes > this.max))) { const k0 = this.m.keys().next().value; this.bytes -= this.m.get(k0).bytes || 0; this.m.delete(k0); }
    return v;
  }
  clear() { this.m.clear(); this.bytes = 0; }
}

// ---- compact voxel models ------------------------------------------------------------------------------------
// A built Vox costs 17 bytes a voxel (occupancy plus four Float32 maps: a sedan ~3.7 MB, a bus ~14 MB) and
// traffic needs dozens of them warm (a car asks for a new heading every time it turns), so the live game
// keeps each model packed into 6 bytes a voxel - occupancy, an Int8 normal, an occlusion byte and the
// material's shade baked per voxel - and renders that exactly as Vox.render does (voxel.js); the paint's
// heading-dependent sky sheen (vehicles.js paintSheen) is added at render time.
const clampi = (v, a, b) => (v < a ? a : v > b ? b : v);
export function compactVox(m) {
  m.prepare(m.smooth ?? 1);
  const { w, d, h } = m, n = w * d * h, wd = w * d, v = m.v.slice(), N = new Int8Array(n * 3), AO = new Uint8Array(n), SH = new Int8Array(n);
  const vs = m.vs || 1;   // (world px a voxel: 2 for a model kept at half resolution, halveVox; its materials shade by world px)
  for (let i = 0; i < n; i++) {
    const mt = v[i];
    if (!mt) continue;
    const nx = m.nx[i], ny = m.ny[i], nz = m.nz[i];
    if (!nx && !ny && !nz) continue;                         // deep inside: never hit by a ray
    N[i * 3] = Math.round(nx * 127); N[i * 3 + 1] = Math.round(ny * 127); N[i * 3 + 2] = Math.round(nz * 127);
    AO[i] = Math.round(m.ao[i] * 255);
    const M = m.mats[mt], fn = M.shade && (M.shade.base || M.shade);
    if (fn) SH[i] = clampi(Math.round(fn(((i % w) + 0.5) * vs, ((((i / w) | 0) % d) + 0.5) * vs, ((i / wd) | 0) * vs, i) * 16), -127, 127);
  }
  const mats = m.mats.map((M) => M && { ramp: M.ramp, k: M.k, emi: M.emi, flag: M.flag, paint: !!(M.shade && M.shade.base) });
  return { w, d, h, vs, v, N, AO, SH, mats, sheen: (m.look && m.look.sheen) ?? 1, bytes: n * 6 + 256 };
}
// A model at half resolution: each k x k x k block of m one voxel, k world px a voxel (out.vs). A block is solid when
// at least two of its voxels are (thin rails and masts stay, a stray voxel goes) and takes the material most of its
// voxels on the surface have (the inside never shows). m is built without its normals (vehicleModel dry); the result
// is prepared here.
export function halveVox(m, k = 2) {
  const W = Math.ceil(m.w / k), D = Math.ceil(m.d / k), H = Math.ceil(m.h / k), out = new Vox(W, D, H);
  out.mats = m.mats; out.look = m.look; out.anchors = m.anchors; out.vs = k; out.smooth = 2;
  const { w, d, h, v } = m, wd = w * d, cnt = new Uint16Array(m.mats.length), seen = [];
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < w && y < d && z < h && v[z * wd + y * w + x] !== 0;
  for (let Z = 0; Z < H; Z++) for (let Y = 0; Y < D; Y++) for (let X = 0; X < W; X++) {
    let n = 0;
    seen.length = 0;
    for (let dz = 0; dz < k; dz++) for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const x = X * k + dx, y = Y * k + dy, z = Z * k + dz;
      if (x >= w || y >= d || z >= h) continue;
      const mt = v[z * wd + y * w + x];
      if (!mt) continue;
      n++;
      const surf = !solid(x + 1, y, z) || !solid(x - 1, y, z) || !solid(x, y + 1, z) || !solid(x, y - 1, z) || !solid(x, y, z + 1) || !solid(x, y, z - 1);
      if (!cnt[mt]) seen.push(mt);
      cnt[mt] += surf ? 8 : 1;
    }
    if (n >= 2) { let best = 0, bn = 0; for (const mt of seen) if (cnt[mt] > bn) { bn = cnt[mt]; best = mt; } out.v[(Z * D + Y) * W + X] = best; }
    for (const mt of seen) cnt[mt] = 0;
  }
  out.prepare(2);
  patchHidden(out);
  // (the paint's shader reads its model's normals by voxel index: the full-size model's, which it was made for - so
  // that model takes these; its own coordinates are world px, which is what compactVox gives it)
  m.nx = out.nx; m.ny = out.ny; m.nz = out.nz; m.ao = out.ao;
  return out;
}
const NBUF = [0, 0, 0];
// opt.px: world px per art pixel (1, or the live game's 2): one ray per art pixel, so the model is drawn straight
// at the art pixel - its shading, dither and outline on the art grid (crisper than shrinking a full-size render);
// the anchor lands on an art pixel corner and G.ap says the size
// opt.lift: k - the body tilted along its length (a car up on a tow truck's wheel lift, server tow.js): each voxel raised
// k px for every px it is from the end left on the ground - k > 0 its nose up (the tail stays down), k < 0 its tail up.
// A shear, not a turn (it's a few degrees): the ray meets each layer where that layer has been lifted to.
export function renderCompact(C, heading = 0, opt = {}) {
  const { w, d, h, v, N, AO, SH, mats, sheen } = C, wd = w * d, S = opt.px || 1, vs = C.vs || 1, iv = 1 / vs;
  const kk = opt.lift || 0, p0 = -Math.sign(kk) * w * vs / 2, up = Math.abs(kk) * w * vs;   // (p0: the end on the ground, along the length)
  const R = Math.ceil(Math.hypot(w * vs, d * vs) / 2) + 2, ax = Math.ceil(R / S), ay = Math.ceil((R + h * vs + up) / S);
  const G = new GBuf(2 * ax, ay + Math.ceil((R + 2) / S));
  G.ax = ax; G.ay = ay; if (S > 1) G.ap = S;
  const c = Math.cos(heading), s = Math.sin(heading), dither = opt.dither ?? 0.5, fo = opt.flag || 0, brk = 5 + (S - 1) * 2;
  const depth = new Float32Array(G.w * G.h).fill(-1e9), sh0 = { w, d };
  for (let py = 0; py < G.h; py++) for (let px = 0; px < G.w; px++) {
    const X = (px - ax) * S + 0.5, sy = (py - ay) * S + 0.5;
    for (let Z = h - 1; Z >= 0; Z--) {
      // (a model at half resolution, vs 2: its layers and cells 2 world px apart - the ray in model voxels)
      const zw = (Z + 0.5) * vs;
      let Y = sy + zw, lift = 0;
      if (kk) { const u = (c * X + s * (sy + zw) - s * kk * p0) / (1 - s * kk); lift = kk * (u - p0); Y += lift; }   // (tilted: where along it the ray meets this layer, and how high that is)
      const mx = (c * X + s * Y) * iv + w / 2, my = (-s * X + c * Y) * iv + d / 2;
      if (mx < 0 || my < 0 || mx >= w || my >= d) continue;
      const vi = Z * wd + (my | 0) * w + (mx | 0), mt = v[vi];
      if (!mt) continue;
      const M = mats[mt];
      let nx = N[vi * 3] / 127, ny = N[vi * 3 + 1] / 127, nz = N[vi * 3 + 2] / 127;
      if (!nx && !ny && !nz) nz = 1;
      if (kk) { const tx = nx - kk * nz; nz += kk * nx; nx = tx; }   // (the faces tilt with it)
      const ao = AO[vi] / 255;
      let t;
      if (M.paint) t = Math.round(M.k + (nz >= 0.5 ? 0.55 : (ao - 0.75) * 1.1) + (nz > 0.7 ? 0.5 : 0) + SH[vi] / 16 + (nz >= 0.5 ? paintSheen(sh0, mx, my, c, s, sheen) : 0));
      else t = M.k + (ao - 0.75) * 2.2 + (nz > 0.7 ? 0.5 : 0) + SH[vi] / 16;
      t += bayer(px, py) * dither;
      const RM = M.ramp;
      NBUF[0] = c * nx - s * ny; NBUF[1] = s * nx + c * ny; NBUF[2] = nz;
      const zo = (vs > 1 ? zw - 0.5 : Z) + lift;
      G.put(px, py, RM[clampi(Math.round(t), 0, RM.length - 1)], NBUF, zo, M.emi, M.flag | fo);
      depth[py * G.w + px] = Y + zo;
      break;
    }
  }
  // dark lines along depth breaks and the outline, as in Vox.render
  for (let py = 1; py < G.h; py++) for (let px = 1; px < G.w - 1; px++) {
    const i = py * G.w + px, j = i * 4;
    if (!G.col[j + 3]) continue;
    const me = depth[i], up = depth[i - G.w], lf = depth[i - 1], rt = depth[i + 1];
    if ((up > -1e8 && up - me > brk) || (lf > -1e8 && lf - me > brk) || (rt > -1e8 && rt - me > brk)) { G.col[j] *= 0.62; G.col[j + 1] *= 0.6; G.col[j + 2] = G.col[j + 2] * 0.66 + 8; }
  }
  G.outline(0.42, true);
  return G;
}
// the art pixel the voxel things (vehicles, trains, animals, crates, bags, rockets) are drawn at: 1 world px, or
// the live game's 2 (worker.js sets it; the preview tools draw full size unless they ask)
let ART_PX = 1;
export function setArtPx(k) { ART_PX = k === 2 ? 2 : 1; }
export const artPx = () => ART_PX;
// model caches: vehicles by bytes (a compact sedan ~1.3 MB, a bus ~5 MB), trains by count
let MODEL_MB = 48;
const MODELS = new LRU(64, MODEL_MB * 1e6);
// lowMem (consoles, ?lowmem): a smaller model cache
export function setActorBudget(o = {}) { if (o.modelMB) { MODEL_MB = o.modelMB; MODELS.max = MODEL_MB * 1e6; } else if (o.lowMem) { MODELS.max = 16e6; } }
const wrapHi = (hi, N) => ((Math.round(hi) % N) + N) % N;

// ---- vehicles ---------------------------------------------------------------------------------------
export const VARIANTS = 8;
// civilian bodies take the spawn paint; liveried models keep their livery unless resprayed (tn >= 0);
// work trucks take a cab colour from a short fleet list
const CIVIL = new Set(['compact', 'sedan', 'sports', 'pickup', 'van', 'bike', 'speedboat', 'dinghy', 'jetski', ...PEDAL, ...[...MOTO].filter((t) => t !== 'policebike' && t !== 'ratbike')]);
const WORK = new Set(['flatbed', 'boxtruck', 'dumptruck', 'mixer', 'tanker', 'garbage', 'towtruck']);
const CABS = ['#e6e2d8', '#e6e2d8', '#c0402c', '#2f5a9a', '#e0b030', '#3f7a46', '#e6e2d8', '#8a8e96', '#e6e2d8', '#2c2e36'];
export const vehDef = (d) => VEHICLE_BY_INDEX[d && d.m] || VEHICLE_BY_INDEX[1];
// the art2 model for a game model (every game model has its own art2 model of the same id)
export const vehType = (d) => { const id = vehDef(d).id; return VEHICLE_DIMS[id] ? id : 'sedan'; };
// st from the wire flags (shared/constants.js VF): the host may also pass its own object
// dmg: the damage stage 0-4 (task #402: scuffed, dented, crumpled, the engine dead - a door hanging; the burnt shell is
// the wreck) from the server's damage word dw (a vehicle record's parent field: shared/vehicles.js packVehDamage), with
// zones (the sides it was hit on), holes (bullet holes), off (parts gone or hanging) and cut (cut in two by a plasma
// blade: where along it). Without a word: the SMOKE flag is a crumpled front, hp (0..1) below 60% a dented one.
export function vehState(flags, sirenPhase = 1, hp = 1, dw = 0) {
  const D = unpackVehDamage(dw >>> 0);
  const dmg = D.stage ? Math.min(4, D.stage) : flags & 64 ? 3 : hp < 0.6 ? 2 : 0;
  return { lights: !!(flags & 1), siren: flags & (2 | 16384) ? sirenPhase : 0, brake: !!(flags & 4), rev: !!(flags & 8), wreck: !!(flags & 16), burn: !!(flags & 32), dmg, zones: D.zones, holes: D.holes, off: D.off, cut: D.cut, bloody: !!(flags & 512) };
}
// tow: on a tow truck's hook (the wire's extra byte: server tow.js) - 1 / 2 its nose up (half way, still being winched up /
// right up), -1 / -2 its tail up; the model's the same, it's drawn tilted (renderCompact opt.lift)
// (holes in steps of 0-3 and the zones only where they show: a few damage looks per model, cached like the other states)
function normSt(st = {}) {
  const s = { wreck: !!st.wreck, burn: !!st.burn, lights: !!st.lights, siren: st.siren === true ? 3 : st.siren | 0, brake: !!st.brake, rev: !!st.rev, bloody: !!st.bloody, dmg: st.dmg === true ? 3 : Math.max(0, Math.min(4, st.dmg | 0)), tow: Math.max(-2, Math.min(2, st.tow | 0)),
    zones: (st.zones | 0) & 15, holes: Math.min(3, Math.ceil((st.holes | 0) / 2)), off: (st.off | 0) & 63, cut: (st.cut | 0) & 255, half: st.half === 'a' || st.half === 'b' ? st.half : '' };
  if (!s.dmg) { s.zones = 0; s.off = 0; }
  if (s.dmg && !s.zones) s.zones = 1;
  if (!s.cut) s.half = '';
  if (s.wreck || s.burn) { s.lights = false; s.siren = 0; s.brake = false; s.rev = false; s.bloody = false; }
  if (s.wreck) { s.dmg = 0; s.zones = 0; s.holes = 0; s.off = 0; }   // (the burnt shell)
  return s;
}
// the tow truck's wheel lift: px the hooked end rises for every px along the body (right up; half that being winched up)
export const TOW_TILT = 0.11;
// st.tow from a vehicle's wire record (main.js keeps the extra byte: bits 0-1 the end up - 1 nose, 2 tail - bit 2 being winched)
export const towOf = (extra) => { const e = (extra | 0) & 3; return !e ? 0 : (e === 2 ? -1 : 1) * ((extra & 4) ? 1 : 2); };
const stKey = (s) => (s.wreck ? 'W' : '') + (s.burn ? 'B' : '') + (s.lights ? 'L' : '') + (s.siren ? 'S' + s.siren : '') + (s.brake ? 'K' : '') + (s.rev ? 'R' : '') + (s.bloody ? 'X' : '') + (s.dmg ? 'D' + s.dmg + 'z' + s.zones + 'o' + s.off : '') + (s.holes ? 'H' + s.holes : '') + (s.half ? 'C' + s.cut + s.half : '') || '-';
function vehLook(d) {
  const t = vehType(d), tn = d.tn ?? -1, p = (((d.p ?? 0) % PAINTS.length) + PAINTS.length) % PAINTS.length;
  if (CIVIL.has(t)) return { t, paint: carPaint(PAINTS[tn >= 0 ? tn : p]) };
  if (WORK.has(t)) return { t, cab: tn >= 0 ? carPaint(PAINTS[tn]) : p % 5 < 2 ? undefined : CABS[p % CABS.length] };   // 2 in 5 keep the model's own cab
  if (t === 'bus' && tn < 0) return { t, band: carPaint(PAINTS[p]) };   // a bus wears its line's colour in a band (server transit.js)
  return tn >= 0 ? { t, paint: carPaint(PAINTS[tn]) } : { t };
}
// WRECK + BURN: the fresh wreck still burning (charred, embers glowing; the host adds the fire); WRECK: the
// burnt-out shell (a bicycle just buckles); BURN alone: on fire before it blows (hp < 15%)
// (the dents, parts and holes: o.damage - art2/vehicles.js applyDamage; a half of one cut in two: o.half)
const modelState = (t, s) => (s.wreck ? (PEDAL.has(t) ? 'wrecked' : s.burn ? 'smoulder' : 'burnt') : s.burn ? 'burning' : 'clean');
export function vehicleKey(d, st, hi = 0, N = 32) {
  const s = normSt(st), k = vehLook(d);
  return `v|${k.t}|${k.paint || k.cab || k.band || 'L'}|${(((d.vr ?? 0) % VARIANTS) + VARIANTS) % VARIANTS}|${stKey(s)}|${wrapHi(hi, N)}|${N}${s.tow ? '|T' + s.tow : ''}`;
}
// The biggest models are kept at half resolution in the live game, 2 world px a voxel - what it draws them at anyway
// (ART_PX 2). The car ferry at full size is 470 x 150 x 123 voxels: 52 MB packed (a phone worker keeps 20 MB of models)
// and ~150 MB while its normals are worked out, a second to build; halved, 6.5 MB.
const COARSE = { ferry: 2, waterbus: 2 };
function vehModel(d, s) {
  const k = vehLook(d), vr = (((d.vr ?? 0) % VARIANTS) + VARIANTS) % VARIANTS, key = `${k.t}|${k.paint || k.cab || k.band || 'L'}|${vr}|${stKey(s)}`;
  return MODELS.get(key, () => {
    const o = { paint: k.paint, cab: k.cab, band: k.band, variant: vr, lights: s.lights ? 1 : 0, brake: s.brake, reverse: s.rev, siren: s.siren || false, bloody: s.bloody, state: modelState(k.t, s),
      damage: s.dmg || s.holes ? { stage: s.dmg, zones: s.zones, holes: s.holes * 2, off: s.off } : null, half: s.half || null, cut: s.cut, cool: s.wreck };
    const q = ART_PX > 1 ? COARSE[k.t] : 0;
    return compactVox(q ? halveVox(vehicleModel(k.t, { ...o, dry: true }), q) : vehicleModel(k.t, o));
  });
}
// the vehicle sprite at heading index hi of N (angle hi * 2pi / N, 0 east, + toward south); anchor = the
// vehicle's centre on the ground
export function vehicleSprite(d, st, hi = 0, N = 32) {
  const s = normSt(st), C = vehModel(d, s), a = wrapHi(hi, N) * TAU / N;
  return trimSprite(renderCompact(C, a, { dither: 0.35, px: ART_PX, lift: s.tow ? Math.sign(s.tow) * TOW_TILT * (Math.abs(s.tow) === 2 ? 1 : 0.5) : 0 }));
}
// lamp and fitting positions in local coordinates at heading 0 (+x forward, +y right, z up, origin the
// centre on the ground): head / tail / brake / rev lamps [[x, y, z]], siren [[x, y, z, colour]] (0 red,
// 1 blue, 2 amber; phase 1 lights the red side, phase 2 the blue side), seat [x, y, z] (where a rider's
// hips go on bikes, jet skis and boats; the driver's seat in cars), exhaust, fire [[x, y, z]] (where the
// flames go when it burns), wake [x, y] (boats), bed (cargo floor height), L, W, H (art size), kind
const LIGHTS = new Map();
export function vehicleLights(d) {
  const t = vehType(d);
  let r = LIGHTS.get(t);
  if (r) return r;
  const A = vehicleAnchors(t), hx = A.L / 2, hy = A.W / 2;
  const loc = (p) => (p ? [p[0] - hx, p[1] - hy, p[2], ...p.slice(3)] : null);
  r = { L: A.L, W: A.W, H: A.H, kind: vehDef(d).kind, head: A.head.map(loc), tail: A.tail.map(loc), brake: A.tail.map(loc), rev: A.rev.map(loc), siren: A.siren.map(loc),
    seat: loc(A.seat), exhaust: loc(A.exhaust), fire: A.fire.map(loc), wake: A.wake ? [A.wake[0] - hx, A.wake[1] - hy] : null, bed: A.bed };
  LIGHTS.set(t, r);
  return r;
}

// ---- animals ------------------------------------------------------------------------------------------
// Pets arrive as d.ar = 'pet:<art id>' (server/systems/pets.js); any art2 animal kind (animals.js ANIMALS:
// dogs, cats, farm and wild animals) works too. Poses and their frame counts: idle 4 (tail wag, panting),
// walk 4, run 4, sit 2, lie 2, graze 2 (head down - sniffing for pets). dir8: 0 S, 1 SW, 2 W, 3 NW, 4 N,
// 5 NE, 6 E, 7 SE (the v1 order). Animals use the upright character view (animals.js renderUpright).
// The wild animals arrive as 'pet:<kind>' too (server/systems/wildlife.js: shared/fauna.js kinds), with ':y' for the
// young and ':L' for a legend (the kind's variants in animals.js and birds.js). Their poses: stalk 4 (low, creeping),
// alert 1 (head up), rear 2 (a bear up on its hind legs), swim 2 (head and back above the water), float 2 (a sea
// otter on its back), climb 2 (a squirrel on a trunk), dead 1 (on its side); the game birds: peck 2, fly 4 (the
// wingbeat), swim 2, alert 1, dead 1.
const PET_ART = { dog_golden: 'golden', dog_retriever: 'golden', dog_black: 'lab', dog_spaniel: 'spaniel', dog_pup: 'puppy', cat_black: 'catBlack', cat_grey: 'catTabby', cat_ginger: 'catGinger' };
export const ANIMAL_FRAMES = { idle: 4, walk: 4, run: 4, sit: 2, lie: 2, graze: 2, alert: 1, stalk: 4, rear: 2, swim: 2, float: 2, climb: 2, dead: 1, peck: 2, fly: 4, cutA: 1, cutB: 1, hit: 1, limp: 4, down: 2, fall: 2, drink: 2, wade: 4, wadedrink: 2, strut: 2, swipe: 2, pounce: 2, crouch: 2 };   // (strut, swipe: AN2; pounce, crouch: AN4)   // (hit, limp, down, fall: AN7; drink, wade: AN5)
export function animalKind(kind) {
  let k = String(kind ?? '');
  if (k.startsWith('pet:')) k = k.slice(4);
  const [base, v] = k.split(':');
  if (PET_ART[base]) return PET_ART[base];
  if (!ANIMALS[base] && !BIRDS[base]) return 'golden';
  return v === 'y' || v === 'L' || (v === 'f' && BIRDS[base]) ? `${base}:${v}` : base;   // (':f' a hen: the quail's plain brown hen)
}
const animPose = (pose) => (ANIMAL_FRAMES[pose] ? pose : pose === 'move' ? 'walk' : 'idle');
const wrap8 = (d) => ((Math.round(d) % 8) + 8) % 8;
export function animalKey(kind, pose = 'idle', dir8 = 0, frame = 0) {
  const k = animalKind(kind), p = animPose(pose), n = ANIMAL_FRAMES[p];
  return `a|${k}|${p}|${wrap8(dir8)}|${(((frame | 0) % n) + n) % n}`;
}
export const isBird = (kind) => !!BIRDS[animalKind(kind).split(':')[0]];
// animal models stay full Vox (renderUpright reads them): ~17 bytes a voxel, a dog ~1.4 MB, a cow ~7 MB
const ANIMAL_MODELS = new LRU(24, 16e6);
export function animalSprite(kind, pose = 'idle', dir8 = 0, frame = 0) {
  const k = animalKind(kind), p = animPose(pose), n = ANIMAL_FRAMES[p], f = (((frame | 0) % n) + n) % n;
  const bird = !!BIRDS[k.split(':')[0]];
  let o;
  if (bird) o = p === 'walk' ? { phase: f / n, gait: 'walk' } : p === 'run' ? { phase: f / n, gait: 'run' } : p === 'fly' ? { pose: 'fly', phase: f / n } : p === 'graze' || p === 'peck' ? { pose: 'peck' } : p === 'swim' || p === 'float' ? { pose: 'swim' } : p === 'dead' || p === 'lie' || p === 'down' || p === 'fall' ? { pose: 'dead' } : p === 'alert' || p === 'hit' ? { pose: 'alert' } : p === 'limp' ? { phase: f / n, gait: 'walk' } : p === 'strut' ? { pose: 'strut', phase: f / n } : p === 'pounce' ? { phase: f / n, gait: 'run' } : p === 'drink' || p === 'wadedrink' ? { pose: 'peck' } : p === 'wade' ? { pose: 'swim' } : { pose: 'stand' };
  else o = p === 'walk' ? { phase: f / n, wag: f / n } : p === 'run' ? { phase: f / n, gait: 'run', pant: 1 } : p === 'sit' ? { pose: 'sit', wag: f * 0.25, pant: 1 }
    : p === 'lie' ? { pose: 'lie', wag: f * 0.2 } : p === 'graze' || p === 'peck' ? { pose: 'graze', wag: f * 0.25 } : p === 'stalk' ? { pose: 'stalk', phase: f / n }
      : p === 'alert' ? { pose: 'alert' } : p === 'rear' ? { pose: 'rear', wag: f * 0.3 } : p === 'swim' ? { pose: 'swim', phase: f / n } : p === 'float' ? { pose: 'float' }
        : p === 'climb' ? { pose: 'climb' } : p === 'dead' ? { pose: 'dead' } : p === 'fly' ? { gait: 'run', phase: f / n }
          : p === 'hit' ? { pose: 'hit' } : p === 'limp' ? { pose: 'limp', phase: f / n } : p === 'down' ? { pose: 'down', wag: f * 0.2 } : p === 'fall' ? { pose: 'fall', phase: f / n } : p === 'drink' ? { pose: 'drink', wag: f * 0.25 } : p === 'wade' ? { pose: 'wade', phase: f / n } : p === 'wadedrink' ? { pose: 'wadedrink', wag: f * 0.25 } : p === 'swipe' ? { pose: 'swipe', phase: f / n } : p === 'pounce' ? { pose: 'pounce', phase: f / n } : p === 'crouch' ? { pose: 'stalk', wag: f * 0.4 } : { wag: f * 0.22, pant: f >> 1 };
  // (cut in two by the plasma blade: the dead body's two halves, the edges seared)
  const cut = p === 'cutA' || p === 'cutB';
  if (cut) o = { pose: 'dead' };
  const mk = cut ? 'dead' : p;
  const m = ANIMAL_MODELS.get(`${k}|${mk}|${p === mk ? f : 0}`, () => { const mm = bird ? birdModel(k, o) : animalModel(k, o); mm.bytes = mm.w * mm.d * mm.h * 17; return mm; });
  const G = trimSprite(renderUpright(m, Math.PI / 2 + wrap8(dir8) * Math.PI / 4, { px: ART_PX }));
  return cut ? cutGBuf(G, p === 'cutA' ? 'a' : 'b', 6) : G;
}

// ---- small objects --------------------------------------------------------------------------------------
// Crates (tier 1 wood, 2 steel, 3 iron vault, 4 carbon-gold, or the 'Produce Box', 'Explosives'), bags (0 dropped cash,
// 1 canvas duffel, 2 tactical backpack, 3 security case, 4 gold lockbox; 5-9 a dropped backpack, Common to
// Legendary), balls, rockets: small voxel
// models drawn in the world projection like the vehicles they ride on, at heading hi of N.
const RP = (h, n = 6, k) => ramp(h, n, k);
function objModel(w, d, h) { const m = new Vox(w, d, h); m.smooth = 1; return m; }
function crateModel(tier, label) {
  if (label === 'Produce Box') {
    const m = objModel(24, 20, 14), wood = m.mat({ ramp: RP('#b08048'), k: 3, shade: (x) => ((x | 0) % 7 === 0 ? -0.8 : 0) }), dark = m.mat({ ramp: RP('#6a4a2c'), k: 2 });
    const fruit = ['#c8302c', '#e88a2a', '#5e9a34', '#e8c840', '#a82848'].map((c) => m.mat({ ramp: RP(c, 5, 2), k: 2.6 }));
    m.fill((x, y, z) => { const e = Math.min(x - 2, 22 - x, y - 2, 18 - y); if (e < 0) return -1; if (e < 1.5) return z % 4 === 3 && x > 4 && x < 20 && y > 4 && y < 16 ? dark : wood; return z < 2 ? dark : -1; }, 0, 0, 0, 24, 20, 10);
    for (let i = 0; i < 26; i++) { const x = 5 + hash(i, 1, 7) * 14, y = 5 + hash(i, 2, 7) * 10, z = 6 + hash(i, 3, 7) * 3, r = 2 + hash(i, 4, 7) * 1.3; m.ell(x, y, z, r, r, r * 0.9, fruit[Math.floor(hash(i, 5, 7) * fruit.length)]); }
    m.fill(() => 0, 0, 0, 12, 24, 20, 14);
    return m;
  }
  if (label === 'Explosives') {
    // a crate of explosives (task #398): red-painted planks on dark battens, a black-and-yellow hazard band round the
    // top, an orange diamond with a black burst on the lid and on each long side
    const m = objModel(24, 20, 16), x0 = 2, x1 = 22, y0 = 2, y1 = 18, H = 13;
    const red = m.mat({ ramp: RP('#b8341e'), k: 3, shade: (x, y, z) => ((z | 0) % 4 === 0 ? -0.6 : (hash(x >> 2, y >> 2, 3) - 0.5) * 0.5) });
    const dark = m.mat({ ramp: RP('#5a1c12'), k: 2 }), yel = m.mat({ ramp: RP('#e8c020', 5, 3), k: 3 }), blk = m.mat({ ramp: RP('#1c1a18'), k: 1.5 }), org = m.mat({ ramp: RP('#f07818', 5, 3), k: 3 });
    m.fill((x, y, z) => {
      const ex = Math.min(x - x0, x1 - x), ey = Math.min(y - y0, y1 - y), ez = Math.min(z, H - z);
      if (ex < 0 || ey < 0 || ez < 0) return -1;
      if ((ex < 1.6) + (ey < 1.6) + (ez < 1.6) >= 2) return dark;
      const dl = Math.abs(x - 12) + Math.abs(y - 10), ds = Math.abs(x - 12) + Math.abs(z - 6.5);
      if (ez < 1 && z > H / 2 && dl < 6) return dl < 2.2 ? blk : org;
      if (ey < 1 && ds < 4.6) return ds < 1.7 ? blk : org;
      if (z > H - 4 && (ex < 1 || ey < 1)) return ((x + y + z) | 0) % 4 < 2 ? yel : blk;
      return red;
    });
    return m;
  }
  const t = Math.max(1, Math.min(4, tier | 0));
  if (t === 4) {
    // carbon-gold: a flat hard case in woven carbon, gold edges and corner caps, a gold latch (faint glow)
    const m = objModel(26, 22, 16);
    const carbon = m.mat({ ramp: RP('#2a2a32', 5, 2), k: 2, shade: (x, y, z) => (((x >> 1) + (y >> 1) + (z >> 1)) & 1 ? -0.7 : 0.5) });
    const gold = m.mat({ ramp: RP('#e0b040', 6, 3), k: 3, emi: [255, 214, 120, 60] }), goldD = m.mat({ ramp: RP('#b88a28', 5, 2), k: 2 });
    m.fill((x, y, z) => { const ex = Math.min(x - 2, 24 - x), ey = Math.min(y - 2, 20 - y), ez = Math.min(z, 13 - z); if (ex < 0 || ey < 0 || ez < 0) return -1; const edges = (ex < 1.2) + (ey < 1.2) + (ez < 1.2); return edges >= 2 ? gold : (ex < 3 && ey < 3) ? goldD : carbon; }, 0, 0, 0, 26, 22, 13);
    m.box(10, 19, 5, 16, 21, 9, gold); m.box(11, 21, 6, 15, 22, 8, goldD);
    return m;
  }
  const m = objModel(26, 26, 20), x0 = 3, x1 = 23, y0 = 3, y1 = 23, H = t === 1 ? 18 : 17;
  if (t === 1) {
    // wood: planks with seams, edge battens and a diagonal brace on every side, rope handles
    const plank = m.mat({ ramp: RP('#b0804a'), k: 3, shade: (x, y, z) => (hash(x >> 2, (y >> 2) + (z | 0) * 3, 5) - 0.5) * 0.8 }), batten = m.mat({ ramp: RP('#8a5c34'), k: 3 }), seam = m.mat({ ramp: RP('#5a3a22'), k: 2 }), rope = m.mat({ ramp: RP('#c8a874'), k: 3, shade: (x, y, z) => (((x + z) | 0) % 2 ? -0.6 : 0.3) });
    m.fill((x, y, z) => {
      const ex = Math.min(x - x0, x1 - x), ey = Math.min(y - y0, y1 - y), ez = Math.min(z, H - z);
      if (ex < 0 || ey < 0 || ez < 0) return -1;
      if ((ex < 2) + (ey < 2) + (ez < 2) >= 2) return batten;
      if (ey < 1) return Math.abs((x - x0) - z * (x1 - x0) / H) < 1.7 ? batten : (z | 0) % 5 === 0 ? seam : plank;
      if (ex < 1) return Math.abs((y - y0) - z * (y1 - y0) / H) < 1.7 ? batten : (z | 0) % 5 === 0 ? seam : plank;
      if (ez < 1 && z > H / 2) return (y | 0) % 5 === 0 ? seam : plank;
      return plank;
    });
    for (const [ya, yb] of [[1, 3], [23, 25]]) { m.box(9, ya, 9, 10, yb, 13, rope); m.box(16, ya, 9, 17, yb, 13, rope); m.box(9, ya === 1 ? 1 : 24, 12, 17, ya === 1 ? 2 : 25, 13, rope); }
    return m;
  }
  // steel (2) and iron vault (3): a metal box with framed edges, a handle slot or latches, rivets
  const body = t === 2 ? m.mat({ ramp: RP('#9aa4ae', 6, 3), k: 3, shade: (x, y, z) => ((x | 0) % 6 === 0 || (y | 0) % 6 === 0 ? -0.4 : 0) }) : m.mat({ ramp: RP('#5e6e3e'), k: 3 });
  const frame = t === 2 ? m.mat({ ramp: RP('#5a626c'), k: 2.6 }) : m.mat({ ramp: RP('#3e4a28'), k: 2.6 }), dark = m.mat({ ramp: RP('#26282e'), k: 1.5 }), rivet = m.mat({ ramp: MAT.chrome, k: 3 });
  const stencil = m.mat({ ramp: RP('#c8c090', 5, 2), k: 3 });
  m.fill((x, y, z) => {
    const ex = Math.min(x - x0, x1 - x), ey = Math.min(y - y0, y1 - y), ez = Math.min(z, H - z);
    if (ex < 0 || ey < 0 || ez < 0) return -1;
    const edges = (ex < 1.6) + (ey < 1.6) + (ez < 1.6);
    if (edges >= 2) return ex < 3 && ey < 3 && (ez < 3) ? rivet : frame;
    if (t === 3 && ez < 1 && z > H / 2 && Math.abs(y - 13) > 3 && (x | 0) % 9 === 4) return frame;
    return body;
  });
  for (const [ya, yb] of [[y0, y0 + 1], [y1 - 1, y1]]) {
    if (t === 2) m.fill((x, y, z) => (Math.abs(x - 13) < 3.5 && Math.abs(z - 11) < 1.2 ? dark : -1), 0, ya, 0, 26, yb, H);
    else { for (const lx of [6, 18]) m.box(lx, ya === y0 ? y0 - 1 : y1 - 1, H - 5, lx + 2, ya === y0 ? y0 + 1 : y1 + 1, H - 2, dark); m.fill((x, y, z) => (x > 7 && x < 19 && Math.abs(z - 6) < 0.7 ? stencil : -1), 0, ya, 0, 26, yb, H); }
  }
  if (t === 3) { for (const hy of [7, 18]) m.box(9, hy, H, 17, hy + 1, H + 1, dark); }
  if (t === 2) m.fill((x, y, z) => ((Math.abs(x - 13) === 6.5 || Math.abs(y - 13) === 6.5) && Math.abs(x - 13) <= 6.5 && Math.abs(y - 13) <= 6.5 ? frame : -1), 0, 0, H - 1, 26, 26, H);
  return m;
}
// Dropped backpacks (bag tiers 5-9 = rarity 1 Common .. 5 Legendary: shared/items.js PACK_TIERS): one upright pack
// that gets richer with the rarity - faded khaki canvas; a green trail pack with a bedroll and a bottle; a black
// tactical pack with webbing and blue piping that glows faintly; an armoured purple pack with glowing seams; the
// black-and-gold legendary pack with gold plates, glowing seams and a bright core. The glow of the rare ones is
// their emissive material here plus a light about them (host.js _lights).
const PACK_LOOK = [null,
  { body: '#a89a74', trim: '#7c6c4a', strap: '#5a4a34', pocket: '#958a66' },
  { body: '#3e6a3a', trim: '#86e070', strap: '#28361f', pocket: '#4b7b44', roll: '#c85a2c', bottle: '#5aa4cc' },
  { body: '#2c3038', trim: '#4aa0ff', strap: '#1b1e25', pocket: '#363b45', web: true, glow: [90, 170, 255, 90] },
  { body: '#2a2034', trim: '#c27aff', strap: '#19131f', pocket: '#3a2c48', plate: '#56446a', web: true, glow: [196, 120, 255, 170] },
  { body: '#2a2219', trim: '#ffc848', strap: '#3a2e1c', pocket: '#33291c', plate: '#dcae3c', glow: [255, 204, 96, 230], core: [255, 244, 200, 255] },
];
function packModel(r) {
  const L = PACK_LOOK[r], m = objModel(24, 20, 28);
  const body = m.mat({ ramp: RP(L.body, 6, 3), k: 3, shade: (x, y, z) => (hash(x | 0, (y | 0) + (z | 0) * 7, 11) > 0.93 ? -0.45 : 0) });
  const pocket = m.mat({ ramp: RP(L.pocket, 6, 3), k: 3 }), strap = m.mat({ ramp: RP(L.strap, 5, 2), k: 2 });
  const trim = m.mat({ ramp: RP(L.trim, 5, 3), k: 3, ...(L.glow ? { emi: L.glow } : null) });
  const metal = m.mat({ ramp: r === 5 ? RP('#f0c860', 6, 3) : MAT.metal, k: 3, ...(r === 5 ? { emi: [255, 214, 130, 70] } : null) });
  const X0 = 5, X1 = 19, Y0 = 6, Y1 = 14, ZT = 21, CX = 12;   // the main bag: 14 wide, 8 deep, 21 high, a domed lid
  const inBag = (x, y, z) => {
    if (x < X0 || x > X1 || y < Y0 || y > Y1 || z > ZT) return false;
    if (z > ZT - 6) { const u = (x - CX) / 7.2, w = (z - (ZT - 6)) / 6.2; if (u * u + w * w > 1) return false; }
    return !(z < 1 && (Math.min(x - X0, X1 - x) < 1 || Math.min(y - Y0, Y1 - y) < 1));
  };
  m.fill((x, y, z) => {
    if (!inBag(x, y, z)) return -1;
    const ex = Math.min(x - X0, X1 - x), ey = Math.min(y - Y0, Y1 - y);
    if (Math.abs(z - (ZT - 6.5)) < 0.6 && ey < 1) return trim;      // the lid's zip all round
    if (ex < 0.8 && ey < 0.8) return trim;                            // piping down the corners
    return body;
  }, 0, 0, 0, 24, 20, 28);
  // the front pocket (+y), its zip along the top; webbing rows on the tactical ones
  m.fill((x, y, z) => {
    const ex = Math.min(x - 7, 17 - x), ez = Math.min(z - 3, 12 - z);
    if (ex < 0 || ez < 0 || (ex < 1 && ez < 1)) return -1;
    if (Math.abs(z - 11.5) < 0.6) return trim;
    if (L.web && (z | 0) % 2 === 0 && z < 10.5 && ex > 0.8) return strap;
    return pocket;
  }, 7, 14, 3, 17, 16, 12);
  // side pockets, the shoulder straps and back panel (-y), a haul loop on top, a compression strap across the front
  m.box(3, 8, 2, 5, 13, 9, pocket); m.box(19, 8, 2, 21, 13, 9, pocket);
  m.box(4, 8, 8, 5, 13, 9, trim); m.box(19, 8, 8, 20, 13, 9, trim);
  for (const sx of [7, 15]) { m.box(sx, 4, 4, sx + 2, 6, 18, strap); m.box(sx, 5, 3, sx + 2, 6, 4, metal); }
  m.box(6, 5, 2, 18, 6, 19, strap);
  m.box(10, 9, ZT - 1, 14, 11, ZT + 1, strap);
  m.box(X0, 14, 13, X1 + 1, 15, 14, strap); m.box(11, 14, 12.5, 13, 16, 14.5, metal);
  if (r === 2) {
    // the trail pack: a bedroll strapped under the lid and a bottle in the side pocket
    const roll = m.mat({ ramp: RP(L.roll, 6, 3), k: 3, shade: (x) => (Math.abs(x - 7.5) < 0.6 || Math.abs(x - 16.5) < 0.6 ? -0.9 : 0) });
    m.cyl('x', 0, 10, ZT + 3.2, 3, 3, 21, roll);
    const bottle = m.mat({ ramp: RP(L.bottle, 5, 3), k: 3, gloss: 0.5 });
    m.cyl('z', 20.5, 10.5, 0, 1.6, 6, 13, bottle); m.cyl('z', 20.5, 10.5, 0, 1, 13, 14, metal);
  }
  if (r >= 4) {
    // armour plates over the front pocket and the sides, edged with the glowing trim
    const plate = m.mat({ ramp: RP(L.plate, 6, 3), k: 3, gloss: r === 5 ? 0.6 : 0.3, ...(r === 5 ? { shade: (x, y, z) => (((x + z) | 0) % 4 === 0 ? -0.6 : 0.15) } : null) });
    m.fill((x, y, z) => { const ex = Math.min(x - 8, 16 - x), ez = Math.min(z - 4, 11 - z); if (ex < 0 || ez < 0) return -1; return ex < 0.9 || ez < 0.9 ? trim : plate; }, 8, 16, 4, 16, 17, 11);
    m.box(2, 9, 3, 3, 12, 8, plate); m.box(21, 9, 3, 22, 12, 8, plate);
    m.fill((x, y, z) => (inBag(x, y, z) && z > ZT - 6 && Math.min(y - Y0, Y1 - y) < 1.5 ? plate : -1), 0, 0, ZT - 6, 24, 20, ZT + 1);   // a plated lid
    m.box(X0 + 1, 7, ZT - 2, X1 - 1, 13, ZT - 1, trim);
    if (r === 4) { m.box(17, 6, ZT - 3, 18, 7, ZT + 5, metal); m.box(16.5, 5.5, ZT + 5, 18.5, 7.5, ZT + 6, trim); }   // a stubby antenna
  }
  if (r === 5) {
    // the legendary core: a bright gem set in the front plate, in a gold ring
    const core = m.mat({ ramp: RP('#fff4d0', 5, 3), k: 4, emi: L.core, flag: F_NOCAST });
    m.cyl('y', 12, 0, 7.5, 2.6, 17, 18, metal); m.cyl('y', 12, 0, 7.5, 1.6, 17, 19, core);
    for (const sx of [7, 15]) m.box(sx, 4, 10, sx + 2, 5, 12, metal);
  }
  return m;
}
function bagModel(tier) {
  if ((tier | 0) > 4) return packModel(Math.min(5, (tier | 0) - 4));
  const t = Math.max(0, Math.min(4, tier | 0));
  if (t === 0) {
    // dropped cash: two banded bricks of notes and a loose note
    const m = objModel(18, 14, 6), note = m.mat({ ramp: RP('#5e9a4a', 5, 2), k: 2.6, shade: (x, y, z) => ((z | 0) % 2 ? -0.5 : 0.2) }), band = m.mat({ ramp: RP('#e8e0c8', 5, 2), k: 3 });
    m.box(2, 2, 0, 13, 7, 2, note); m.box(7, 2, 0, 9, 7, 2, band);
    m.box(4, 6, 2, 15, 11, 4, note); m.box(9, 6, 2, 11, 11, 4, band);
    m.box(12, 1, 0, 17, 4, 1, note);
    return m;
  }
  if (t === 1) {
    // canvas duffel: an olive roll with dark straps, handles and a zip
    const m = objModel(28, 18, 16), canvas = m.mat({ ramp: RP('#6e7040'), k: 3, shade: (x, y, z) => (hash(x | 0, (y | 0) + (z | 0) * 5, 3) > 0.9 ? -0.6 : 0) }), strap = m.mat({ ramp: RP('#3a3a2e'), k: 2 }), zip = m.mat({ ramp: MAT.metalDark, k: 2 });
    m.fill((x, y, z) => { if (x < 2 || x > 26) return -1; const end = Math.min(x - 2, 26 - x), r = 6.2 * (end < 2 ? 0.75 + end * 0.12 : 1); return (y - 9) ** 2 + ((z - 6.2) * 1.1) ** 2 < r * r ? ((x | 0) === 8 || (x | 0) === 19 ? strap : end < 1 ? strap : canvas) : -1; });
    m.box(4, 8.5, 12, 24, 9.5, 13, zip);
    for (const hx of [10, 17]) m.box(hx, 7, 12, hx + 1, 11, 15, strap); m.box(10, 7, 14, 18, 8, 15, strap); m.box(10, 10, 14, 18, 11, 15, strap);
    return m;
  }
  if (t === 2) {
    // tactical backpack: a dark upright pack, a front pocket with webbing, a top handle
    const m = objModel(18, 16, 20), pack = m.mat({ ramp: RP('#30323a'), k: 3 }), web = m.mat({ ramp: RP('#1e2026'), k: 2 }), buckle = m.mat({ ramp: MAT.metal, k: 3 });
    m.fill((x, y, z) => { const ex = Math.min(x - 3, 15 - x), ey = Math.min(y - 3, 12 - y), ez = Math.min(z, 16 - z); if (ex < 0 || ey < 0 || ez < 0) return -1; if (ez < 2 && ex < 2 && ey < 2 && (ez + ex + ey) < 2.5) return -1; return pack; });
    m.fill((x, y, z) => (x > 4.5 && x < 13.5 && z > 3 && z < 11 ? ((z | 0) % 3 === 0 ? web : pack) : -1), 0, 12, 0, 18, 14, 16);
    m.box(5, 13, 9, 7, 14, 11, buckle); m.box(11, 13, 9, 13, 14, 11, buckle);
    m.box(7, 7, 16, 11, 8, 18, web);
    return m;
  }
  if (t === 3) {
    // security case: a black ribbed hard case, silver latches, a handle on top
    const m = objModel(26, 20, 12), shell = m.mat({ ramp: RP('#2a2c32'), k: 3, shade: (x, y, z) => (z > 7 && (y | 0) % 4 === 0 ? -0.8 : 0) }), latch = m.mat({ ramp: MAT.chrome, k: 3 }), grip = m.mat({ ramp: RP('#1a1c20'), k: 2 });
    m.fill((x, y, z) => { const ex = Math.min(x - 2, 24 - x), ey = Math.min(y - 3, 17 - y), ez = Math.min(z, 9 - z); if (ex < 0 || ey < 0 || ez < 0) return -1; if (ex < 1.2 && ey < 1.2) return -1; return Math.abs(z - 4.5) < 0.6 ? grip : shell; });
    for (const lx of [7, 17]) m.box(lx, 16.5, 4, lx + 2, 18, 7, latch);
    m.box(10, 9, 9, 11, 11, 11, grip); m.box(15, 9, 9, 16, 11, 11, grip); m.box(10, 9, 11, 16, 11, 12, grip);
    return m;
  }
  // gold lockbox: banded gold, a dark lock plate, a faint shine
  const m = objModel(20, 16, 13), gold = m.mat({ ramp: RP('#e0b040', 6, 3), k: 3, emi: [255, 214, 120, 46] }), band = m.mat({ ramp: RP('#a8802a', 5, 2), k: 2.4 }), lock = m.mat({ ramp: RP('#2c2a30'), k: 2 });
  m.fill((x, y, z) => { const ex = Math.min(x - 3, 17 - x), ey = Math.min(y - 3, 13 - y), ez = Math.min(z, 10 - z); if (ex < 0 || ey < 0 || ez < 0) return -1; return Math.abs(z - 6.5) < 0.6 || Math.abs(x - 6) < 0.8 || Math.abs(x - 14) < 0.8 ? band : gold; });
  m.box(8.5, 12.5, 3, 11.5, 14, 7, lock);
  return m;
}
function rocketModel() {
  const m = objModel(24, 10, 22), cy = 5, cz = 14;
  const body = m.mat({ ramp: RP('#5e6638'), k: 3 }), nose = m.mat({ ramp: RP('#8a2a24'), k: 3 }), fin = m.mat({ ramp: MAT.metalDark, k: 2.4 });
  const flame = m.mat({ ramp: RP('#ffb040', 5, 3), k: 4, emi: [255, 170, 60, 255], flag: F_NOCAST });
  m.cyl('x', 0, cy, cz, 2.3, 5, 17, body);
  m.fill((x, y, z) => { const t = (x - 17) / 5; return t >= 0 && t <= 1 && Math.hypot(y - cy, z - cz) < 2.3 * (1 - t * 0.85) ? nose : -1; }, 17, 0, 0, 23, 10, 22);
  m.box(5, cy - 4.5, cz - 0.5, 8, cy + 4.5, cz + 0.5, fin); m.box(5, cy - 0.5, cz - 4.5, 8, cy + 0.5, cz + 4.5, fin);
  m.fill((x, y, z) => { const t = (5 - x) / 4; return t >= 0 && t <= 1 && Math.hypot(y - cy, z - cz) < 2 * (1 - t * 0.7) ? flame : -1; }, 0, 0, 0, 6, 10, 22);
  return m;
}
const OBJ_MODELS = new LRU(16);
const objRender = (key, make, hi, N) => { const m = OBJ_MODELS.get(key, () => { const mm = make(); patchHidden(mm); return mm; }); return trimSprite(m.render(wrapHi(hi, N) * TAU / N, { dither: 0.3, px: ART_PX })); };
const crateK = (tier, label) => (label === 'Produce Box' ? 'P' : label === 'Explosives' ? 'X' : Math.max(1, Math.min(4, tier | 0)));
export const crateKey = (tier, label = '', hi = 0, N = 16) => `c|${crateK(tier, label)}|${wrapHi(hi, N)}|${N}`;
export function crateSprite(tier, label = '', hi = 0, N = 16) { return objRender('crate' + crateK(tier, label), () => crateModel(tier, label), hi, N); }
export const bagKey = (tier, hi = 0, N = 16) => `g|${Math.max(0, Math.min(9, tier | 0))}|${wrapHi(hi, N)}|${N}`;
export function bagSprite(tier, hi = 0, N = 16) { const t = Math.max(0, Math.min(9, tier | 0)); return objRender('bag' + t, () => bagModel(t), hi, N); }
export const projKey = (w, hi = 0, N = 32) => `p|${w | 0}|${wrapHi(hi, N)}|${N}`;
// a projectile flying at its launch height (z ~14): the rocket (weapon 12; any weapon but the bow gets the rocket),
// its exhaust glowing; an arrow (the bow, weapon 24: a cedar shaft, a steel broadhead, red and white fletching).
// Anchor = the ground point under it.
// (weapon 30, the fire bow: a fire arrow - a black shaft and fletching, its head wrapped and burning)
export function projSprite(w, hi = 0, N = 32) { return (w | 0) === 24 ? objRender('arrow', arrowModel, hi, N) : (w | 0) === 30 ? objRender('firearrow', fireArrowModel, hi, N) : objRender('rocket', rocketModel, hi, N); }
function fireArrowModel() {
  const m = objModel(30, 9, 20), cy = 4.5, cz = 14;
  const shaft = m.mat({ ramp: RP('#3a2a22'), k: 3 }), black = m.mat({ ramp: RP('#1e1c22'), k: 3 }), wrap = m.mat({ ramp: RP('#6a4a2a'), k: 3 });
  const flame = m.mat({ ramp: RP('#ffb040', 5, 3), k: 4, emi: [255, 160, 50, 255], flag: F_NOCAST });
  m.box(3, cy - 0.5, cz - 0.5, 24, cy + 0.5, cz + 0.5, shaft);
  m.box(22, cy - 1.1, cz - 1.1, 25, cy + 1.1, cz + 1.1, wrap);
  m.fill((x, y, z) => { const t = (x - 21) / 9, r = Math.hypot(y - cy, z - cz - t * 1.2); return t >= 0 && t <= 1 && r < 2.6 * (1 - t) + 0.4 ? flame : -1; }, 21, 0, 0, 30, 9, 20);
  for (const o of [1.8, -1.8]) m.fill((x, y, z) => { const t = (x - 3) / 5; if (t < 0 || t > 1) return -1; const r = 0.4 + 1.6 * Math.sin(t * Math.PI * 0.9); return Math.abs(z - cz) < 0.5 && (o > 0 ? y - cy : cy - y) > 0.4 && Math.abs(y - cy) < r ? black : -1; }, 3, 0, 0, 9, 9, 20);
  return m;
}
function arrowModel() {
  const m = objModel(30, 7, 18), cy = 3.5, cz = 14;
  const shaft = m.mat({ ramp: RP('#c8a46c'), k: 3 }), head = m.mat({ ramp: MAT.chrome, k: 3 }), red = m.mat({ ramp: RP('#c84a32'), k: 3 }), white = m.mat({ ramp: RP('#ece8e0', 5, 2), k: 3 });
  m.box(3, cy - 0.5, cz - 0.5, 25, cy + 0.5, cz + 0.5, shaft);
  m.fill((x, y, z) => { const t = (x - 25) / 4; return t >= 0 && t <= 1 && Math.abs(y - cy) < 1.8 * (1 - t) + 0.3 && Math.abs(z - cz) < 0.6 ? head : -1; }, 25, 0, 0, 30, 7, 18);
  for (const [o, mt] of [[1.8, red], [-1.8, red], [0, white]]) m.fill((x, y, z) => { const t = (x - 3) / 5; if (t < 0 || t > 1) return -1; const r = 0.4 + 1.6 * Math.sin(t * Math.PI * 0.9); return o ? (Math.abs(z - cz) < 0.5 && (o > 0 ? y - cy : cy - y) > 0.4 && Math.abs(y - cy) < r ? mt : -1) : (Math.abs(y - cy) < 0.5 && z - cz > 0.4 && z - cz < r ? mt : -1); }, 3, 0, 0, 9, 7, 18);
  return m;
}

// balls: a painted sphere (t 0 soccer, 1 volleyball, 2 a golf ball: small, white, dimpled), spin 0..3 turns the
// pattern as it rolls; anchor = the ground contact, z from 0 at the bottom to the top of the ball
const ICO = (() => { const p = (1 + Math.sqrt(5)) / 2, v = []; for (const a of [-1, 1]) for (const b of [-p, p]) { v.push(norm([0, a, b]), norm([a, b, 0]), norm([b, 0, a])); } return v; })();
export const ballKey = (t, spin = 0) => `b|${Math.max(0, Math.min(4, t | 0))}|${((spin % 4) + 4) % 4}`;
export function ballSprite(t = 0, spin = 0) {
  if ((t | 0) === 2) return golfBall();
  if ((t | 0) === 3) return basketball(spin);
  if ((t | 0) === 4) return bowlingBall(spin);
  const r = 5.5, S = 15, G = new GBuf(S, S), cx = 7.5, cyy = S - 1.5 - r, rot = (((spin % 4) + 4) % 4) * Math.PI / 4 + 0.3;
  G.ax = 7; G.ay = S - 2;
  const W = RP('#ecebe6', 5, 2), K = RP('#2a2a30', 5, 2), Y = RP('#e8c84a', 5, 2), B = RP('#2f56b0', 5, 2), L = norm([-0.55, -0.62, 0.56]);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5 - cx) / r, v = (y + 0.5 - cyy) / r, q = u * u + v * v;
    if (q > 1) continue;
    const w = Math.sqrt(1 - q), n = norm([u, (v + w) * 0.7071, (w - v) * 0.7071]);
    // the pattern turns with the spin (round the x axis), lit from the upper left
    const p = [n[0] * cr - n[2] * sr, n[1], n[0] * sr + n[2] * cr];
    const lit = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
    let R = W, tt = 0.55 + lit * 0.35;
    if (t) { const ax = Math.abs(p[0]), ay = Math.abs(p[1]), az = Math.abs(p[2]); R = ax > ay && ax > az ? Y : ay > az ? W : B; if (Math.abs(ax - ay) < 0.06 || Math.abs(ay - az) < 0.06 || Math.abs(ax - az) < 0.06) tt -= 0.35; }
    else { let best = -2; for (const c of ICO) best = Math.max(best, c[0] * p[0] + c[1] * p[1] + c[2] * p[2]); if (best > 0.93) R = K; else if (best > 0.9) tt -= 0.3; }
    if (lit > 0.8 && q < 0.5) tt += 0.3;
    const col = R[Math.max(0, Math.min(R.length - 1, Math.round(tt * (R.length - 1) + bayer(x, y) * 0.4)))];
    G.put(x, y, col, n, r + n[2] * r, null, 0);
  }
  G.outline(0.45, false);
  return G;
}

// a bowling ball (Pinwheel Lanes): deep blue with a swirl, glossy, its three finger holes turning with the spin
function bowlingBall(spin = 0) {
  const r = 3.7, S = 10, G = new GBuf(S, S), cx = 5, cyy = S - 1 - r, rot = (((spin % 4) + 4) % 4) * Math.PI / 2 + 0.4;
  G.ax = 5; G.ay = S - 1;
  const C = RP('#2846a8', 5, 2), SW = RP('#7a3cc0', 5, 2), HOLE = RP('#0c1020', 3, 1), L = norm([-0.55, -0.62, 0.56]), cr = Math.cos(rot), sr = Math.sin(rot);
  const holes = [[0.42, 0.62], [0.62, 0.38], [0.18, 0.2]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5 - cx) / r, v = (y + 0.5 - cyy) / r, q = u * u + v * v;
    if (q > 1) continue;
    const w = Math.sqrt(1 - q), n = norm([u, (v + w) * 0.7071, (w - v) * 0.7071]);
    const pu = n[0] * cr - n[1] * sr, pv = n[0] * sr + n[1] * cr, lit = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
    let R = Math.sin(pu * 5 + pv * 3) > 0.55 ? SW : C, tt = 0.45 + lit * 0.4;
    if (n[2] > 0.3 && holes.some(([a, b]) => Math.hypot(pu - a + 0.4, pv - b + 0.4) < 0.17)) { R = HOLE; tt = 0.3; }
    if (lit > 0.82 && q < 0.45) tt += 0.4;
    G.put(x, y, R[Math.max(0, Math.min(R.length - 1, Math.round(tt * (R.length - 1) + bayer(x, y) * 0.3)))], n, r + n[2] * r, null, 0);
  }
  G.outline(0.45, false);
  return G;
}
// a basketball: orange, its black seams turning with the spin
function basketball(spin = 0) {
  const r = 4.6, S = 12, G = new GBuf(S, S), cx = 6, cyy = S - 1 - r, rot = (((spin % 4) + 4) % 4) * Math.PI / 4;
  G.ax = 6; G.ay = S - 1;
  const O = RP('#e0702a', 5, 2), B = RP('#1e1a18', 4, 1), L = norm([-0.55, -0.62, 0.56]), cr = Math.cos(rot), sr = Math.sin(rot);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5 - cx) / r, v = (y + 0.5 - cyy) / r, q = u * u + v * v;
    if (q > 1) continue;
    const w = Math.sqrt(1 - q), n = norm([u, (v + w) * 0.7071, (w - v) * 0.7071]), lit = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
    const px = n[0] * cr - n[2] * sr, pz = n[0] * sr + n[2] * cr, seam = Math.abs(px) < 0.12 || Math.abs(n[1]) < 0.1 || Math.abs(Math.abs(pz) - 0.7) < 0.1;
    const R = seam ? B : O, tt = 0.5 + lit * 0.38;
    G.put(x, y, R[Math.max(0, Math.min(R.length - 1, Math.round(tt * (R.length - 1))))], n, r + n[2] * r, null, 0);
  }
  G.outline(0.5, false);
  return G;
}
function golfBall() {
  const r = 2.6, S = 8, G = new GBuf(S, S), cx = 4, cyy = S - 1 - r;
  G.ax = 4; G.ay = S - 1;
  const W = RP('#f4f4f0', 5, 2), L = norm([-0.55, -0.62, 0.56]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5 - cx) / r, v = (y + 0.5 - cyy) / r, q = u * u + v * v;
    if (q > 1) continue;
    const w = Math.sqrt(1 - q), n = norm([u, (v + w) * 0.7071, (w - v) * 0.7071]), lit = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
    const tt = 0.62 + lit * 0.32 - (((x + y) & 1) && q < 0.6 ? 0.06 : 0);   // (the dimples: a faint check)
    G.put(x, y, W[Math.max(0, Math.min(W.length - 1, Math.round(tt * (W.length - 1))))], n, r + n[2] * r, null, 0);
  }
  G.outline(0.5, false);
  return G;
}

// ---- trains -----------------------------------------------------------------------------------------------
// TRAIN_CARS in shared/map.js (by wire index): kept in step here so workers needn't load the map generator.
export const TRAIN_DIMS = [{ kind: 'loco', L: 196, W: 76, H: 66 }, { kind: 'coach', L: 212, W: 76, H: 64 }, { kind: 'mail', L: 188, W: 76, H: 60 }];
const COACH_SEATS = [-84, -60, -36, 36, 60, 84].flatMap((ox) => [[ox, -23], [ox, 23]]);
const LOCO_SEATS = [-84, -60, -36, 36].flatMap((ox) => [[ox, -23], [ox, 23]]); // the front car: seats behind the cab
const CAB_OX = 50;                                                              // ...whose bulkhead is this far forward of the middle
const MAIL_BOX = { ox: -58, oy: 0 };
// mode: 'roof' (the normal outside view) or 'in' (the cut-away interior of my own train), plus '-lit'
// (lights on: windows glow, the loco's headlights), '-empty' (the mail car's strongbox gone), '-doors'
const trainDef = (c) => (typeof c === 'object' && c ? { ...TRAIN_DIMS.find((d) => d.kind === c.kind) || TRAIN_DIMS[1], ...c } : TRAIN_DIMS[c | 0] || TRAIN_DIMS[1]);
const trainMode = (mode = 'roof') => { const s = String(mode); return (s.includes('in') && !s.includes('lit') ? 'in' : s.includes('in') ? 'in-lit' : s.includes('lit') ? 'roof-lit' : 'roof') + (s.includes('empty') ? '-empty' : '') + (s.includes('door') ? '-doors' : ''); };
function trainModel(def, mode) {
  const { kind, L, W } = def, H = def.H || 62, inside = mode.startsWith('in'), lit = mode.includes('lit'), empty = mode.includes('empty'), doors = mode.includes('doors');
  const m = new Vox(L, W, H + 7), cy = W / 2;
  m.smooth = 2;
  const mail = kind === 'mail', loco = kind === 'loco';
  // I3: silver commuter stock with a blue band under the windows; the mail car is a dark olive van
  const skin = mail ? RP('#56663e') : RP('#b4bcc6', 6, 3), Rk = (c, n = 6) => RP(c, n);
  const body = m.mat({ ramp: skin, k: 3, shade: (x, y, z, vi) => (Math.abs(m.ny[vi]) > 0.5 && z < 24 && (x | 0) % 3 === 0 ? -0.5 : 0) + (m.nz[vi] > 0.6 ? 0.3 : 0) });
  const roofM = m.mat({ ramp: Rk(mail ? '#4a5834' : '#8e96a2'), k: 3, shade: (x) => ((x | 0) % 20 === 0 ? -0.8 : 0) });
  const stripe = m.mat({ ramp: Rk(mail ? '#d8b040' : '#2f56b0'), k: 3 }), skirt = m.mat({ ramp: Rk('#34363e'), k: 2 }), dark = m.mat({ ramp: Rk('#26282e'), k: 1.6 });
  // windows show the lit inside: warm light, seat backs and the odd passenger; glowing when the lights are on
  // by day the glass is darker (tinted, a sky streak), the inside dimly warm; at night it all glows
  const inner = m.mat({ ramp: lit ? RP('#f0d8a0', 6, 3) : RP('#7a7468', 6, 3), k: lit ? 3.4 : 3, flag: F_GLASS, emi: lit ? [255, 214, 150, 210] : [255, 200, 130, 40], shade: (x, y, z) => (z > 38 ? 0.7 : 0) + (!lit && (x * 0.9 + z * 1.4) % 21 < 2.5 ? 1.6 : 0) });
  const seatWin = m.mat({ ramp: Rk(lit ? '#2a4a90' : '#263652'), k: 2.4, flag: F_GLASS, emi: lit ? [70, 110, 200, 60] : null });
  const head2 = m.mat({ ramp: Rk('#3a2e2a'), k: 2, flag: F_GLASS });
  const glass = m.mat({ ramp: RP('#28384c', 6, 2), k: 1.2, flag: F_GLASS, emi: lit ? [150, 170, 200, 22] : null, shade: (x, y, z) => ((x + z * 1.5) % 19 < 2 ? 1.6 : 0) });
  const doorM = m.mat({ ramp: Rk(mail ? '#3e4a2a' : '#9aa2ae'), k: 3 }), doorEdge = m.mat({ ramp: Rk('#e0b030'), k: 3 });
  const metal = m.mat({ ramp: MAT.metal, k: 3 }), grille = m.mat({ ramp: Rk('#3a3e46'), k: 2, shade: (x) => ((x | 0) % 2 ? -0.8 : 0.4) });
  const head = m.mat({ ramp: RP('#f6f0d8', 5, 3), k: 3, emi: lit ? [255, 244, 210, 255] : null });
  const floorM = m.mat({ ramp: Rk(mail ? '#6a5236' : '#3a4660'), k: 3, shade: (x, y) => (mail ? ((x | 0) % 6 === 0 ? -0.8 : 0) : Math.abs(y - cy) < 4 ? 0.8 : 0) });
  const seatM = m.mat({ ramp: Rk('#2a58b0'), k: 3 }), seatBack = m.mat({ ramp: Rk('#2048a0'), k: 2.6 });
  const noseL = loco ? 26 : 0, zr = H, cabX = loco ? L / 2 + CAB_OX : L; // the front car: cab ahead of cabX, seats behind
  // what a passenger window shows at (x, z): seat backs low, heads now and then, light above
  const winAt = (x, z) => { const bay = Math.floor(x / 13); if (z < 31) return (x | 0) % 13 < 9 ? seatWin : inner; if (z < 37 && hash(bay, 7, 3) > 0.55 && Math.abs((x % 13) - 6) < 2.2) return head2; return inner; };
  // body shell: rounded plan corners and roof; the loco's cab nose rounds down to a big windscreen
  m.fill((x, y, z) => {
    const ex = Math.min(x - 1, L - 1 - x), ey = Math.min(y - 2, W - 2 - y);
    if (ex < 0 || ey < 0 || z < 6) return -1;
    const nx = x - (L - 1 - noseL);
    if (loco && nx > 0) {
      // a rounded cab front: the plan narrows toward the nose, the roof curves down to the windscreen
      const u = nx / noseL, half = cy - 2 - Math.pow(u, 2.4) * 10, top = zr - Math.pow(u, 1.8) * 22;
      if (Math.abs(y - cy) > half || z > top) return -1;
      if (z > 30 && z > top - 2.4 && Math.abs(y - cy) < half - 3 && u > 0.25) return glass;      // the windscreen wraps over the nose
      if (z > 30 && z < top - 1 && Math.abs(y - cy) > half - 1.6 && u > 0.1 && u < 0.6) return glass; // cab side windows
      if (z > 15 && z < 19) return stripe;
      return z < 10 ? skirt : body;
    }
    const r = 6, rz = 7;
    if (ex < r && ey < r && (r - ex) ** 2 + (r - ey) ** 2 > r * r) return -1;
    if (zr - z < rz && ey < rz && (rz - ey) ** 2 + (rz - (zr - z)) ** 2 > rz * rz) return -1;
    if (z >= zr) return -1;
    const side = ey < 1.6, top = zr - z < 1.6;
    if (z < 10) return skirt;
    if (top) return roofM;
    if (!side && ex > 1.6) return body;
    if (z > 18 && z < 23) return stripe;
    // windows / doors / grilles by kind
    const mid = Math.abs(x - L / 2);
    if (side && mid < 12 && z < 46) return Math.abs(mid - 11) < 1 ? doorEdge : (z > 26 && z < 42 && Math.abs(mid - 5.5) < 4.5) ? (mail ? inner : winAt(x, z)) : doorM;
    if ((kind === 'coach' || (loco && x < cabX - 8)) && side && z > 25 && z < 43 && ex > 12 && (x | 0) % 26 > 4) return winAt(x, z);
    if (mail && side && z > 32 && z < 40 && (ex > 10 && ex < 26)) return inner;
    if (loco && side && z > 28 && z < 44 && x > cabX + 4 && x < L - noseL - 2) return glass;              // the cab's side windows
    if (loco && side && Math.abs(x - cabX) < 1 && z > 10) return dark;                                    // the bulkhead seam
    return body;
  }, 0, 0, 0, L, W, H + 2);
  // bogies and wheels, couplers, gangway bellows at the ends
  for (const bx of [0.17, 0.83].map((f) => f * L)) {
    m.box(bx - 14, 6, 0, bx + 14, W - 6, 7, dark);
    for (const wx of [bx - 8, bx + 8]) for (const [ya, yb] of [[4, 8], [W - 8, W - 4]]) m.cyl('y', wx, 0, 5, 5, ya, yb, metal, 2, dark);
  }
  m.box(0, cy - 14, 10, 2, cy + 14, H - 6, dark);
  m.box(L - 2, cy - 14, 10, L, cy + 14, loco ? 16 : H - 6, dark);
  if (loco) {
    // headlights low on the nose, a yellow warning panel, roof fans and the horn (its back end is a gangway)
    for (const sy of [-1, 1]) m.fill((x, y, z) => (m.get(x | 0, y | 0, z | 0) && !m.get((x | 0) + 1, y | 0, z | 0) ? head : -1), L - 8, cy + sy * 14 - 3, 12, L, cy + sy * 14 + 3, 17);
    m.fill((x, y, z) => (m.get(x | 0, y | 0, z | 0) && !m.get((x | 0) + 1, y | 0, z | 0) && Math.abs(y - cy) < 8 ? doorEdge : -1), L - 8, 0, 19, L, W, 27);
    if (!inside) for (const fx of [0.2, 0.33, 0.46]) m.cyl('z', fx * L, cy, 0, 9, zr - 1, zr + 2, grille);          // roof fans (the engine's under the floor)
    m.box(cabX + 4, cy - 3, zr - 1, cabX + 10, cy + 3, zr + 5, metal);                                                  // horn housing, on the cab roof
  } else if (!inside) {
    m.fill((x, y, z) => (m.get(x | 0, y | 0, z | 0) && Math.abs(y - cy) < 2 && x > 8 && x < L - 8 ? metal : -1), 0, 0, zr - 1, L, W, zr);
    for (const fx of [0.28, 0.72]) { m.box(fx * L - 14, cy - 12, zr - 1, fx * L + 14, cy + 12, zr + 4, metal); m.fill((x, y) => ((x | 0) % 3 === 0 ? grille : -1), fx * L - 12, cy - 10, zr + 3, fx * L + 12, cy + 10, zr + 4); }
  }
  // cut-away interior (my own train): no roof, walls down to the window sills, floor, seats or mail.
  // The front car opens up as far as its cab: the bulkhead (with the cab door) and the cab stay roofed.
  if (inside) {
    const wallZ = 22, x1 = cabX;
    m.fill((x, y, z) => (loco && x > x1 - 3 ? -1 : x - 1 > 2.5 && x1 - 1 - x > 2.5 && Math.min(y - 2, W - 2 - y) > 2.5 ? 0 : z > wallZ ? 0 : -1), 0, 0, 10, x1, W, m.h);
    m.box(4, 5, 9, x1 - (loco ? 3 : 4), W - 5, 10, floorM);
    if (loco) m.box(x1 - 3, cy - 7, 10, x1 - 2, cy + 7, 44, doorM); // the cab door, shut
    if (!mail) {
      for (const [ox, oy] of loco ? LOCO_SEATS : COACH_SEATS) { const sx = L / 2 + ox, sy = cy + oy; m.box(sx - 9, sy - 10, 10, sx + 9, sy + 10, 14, seatM); m.box(ox < 0 ? sx - 9 : sx + 6, sy - 10, 14, ox < 0 ? sx - 6 : sx + 9, sy + 10, 21, seatBack); }
      for (const ox of loco ? [-48, 0] : [-48, 0, 48]) m.box(L / 2 + ox - 0.5, cy - 0.5, 10, L / 2 + ox + 0.5, cy + 0.5, 34, metal);
    } else {
      const sack = m.mat({ ramp: Rk('#b89a6a'), k: 3 }), shelf = m.mat({ ramp: Rk('#5a4630'), k: 3 });
      for (const [sx, sy] of [[44, -26], [56, 24], [68, -14], [20, 26], [76, 10], [6, -26]]) m.ell(L / 2 + sx, cy + sy, 13, 8, 6, 4, sack);
      m.box(L - 14, 6, 10, L - 8, W - 6, 30, shelf);
      const bx = L / 2 + MAIL_BOX.ox, by = cy + MAIL_BOX.oy;
      if (!empty) { const steel = m.mat({ ramp: Rk('#4a5058'), k: 3 }), dial = m.mat({ ramp: Rk('#d8a828'), k: 3 }); m.box(bx - 13, by - 13, 10, bx + 13, by + 13, 26, steel); m.cyl('y', bx, 0, 18, 4, by + 12, by + 14, dial); }
      else m.box(bx - 13, by - 13, 10, bx + 13, by + 13, 10.5, dark);
    }
  }
  if (doors) for (const ys of [[0, 3], [W - 3, W]]) m.fill(() => 0, L / 2 - 10, ys[0], 10, L / 2 + 10, ys[1], 46);
  return m;
}
export const trainKey = (c, mode = 'roof', hi = 0, N = 32) => `t|${trainDef(c).kind}|${trainMode(mode)}|${wrapHi(hi, N)}|${N}`;
const TRAIN_MODELS = new LRU(3);
export function trainCarSprite(c, mode = 'roof', hi = 0, N = 32) {
  const def = trainDef(c), md = trainMode(mode), C = TRAIN_MODELS.get(def.kind + '|' + md, () => { const mm = trainModel(def, md); patchHidden(mm); return compactVox(mm); });
  return trimSprite(renderCompact(C, wrapHi(hi, N) * TAU / N, { dither: 0.3, px: ART_PX }));
}
// a car's lamps in local coordinates (+x the way it runs): the loco's headlights, window light points
export function trainLights(c) {
  const d = trainDef(c), hx = d.L / 2, hy = d.W / 2, win = [], x1 = d.kind === 'loco' ? CAB_OX - 10 : hx - 16;
  for (let x = -hx + 20; x < x1; x += 26) win.push([x, -hy, 34], [x, hy, 34]);
  return { L: d.L, W: d.W, H: d.H, head: d.kind === 'loco' ? [[hx - 3, -14, 14.5], [hx - 3, 14, 14.5]] : [], tail: [], windows: win };
}

// ---- effects ------------------------------------------------------------------------------------------------
// fxSprite(name, frame): a copy of a frame of any client/art2/fx.js effect (FX: 42 names - muzzle flashes,
// tracers, impacts, the explosion, fire, smoke, exhaust, skids, water, dust, glass, leaves, sparkles, blood,
// footprints, and the single particles p* and decals d* the pooled systems use). Frames that light their
// surroundings carry .light { x, y, z, r, k, col }; fxInfo(name) gives frames, fps, loop, decal, hold.
const copySprite = (S) => {
  const G = new GBuf(S.w, S.h);
  G.col.set(S.col); G.nrm.set(S.nrm); G.z.set(S.z); G.emi.set(S.emi); G.flag.set(S.flag);
  G.ax = S.ax; G.ay = S.ay;
  if (S.light) G.light = { ...S.light };
  return G;
};
export const FX_NAMES = Object.keys(FX);
export function fxInfo(name) { const d = FX[name]; return d ? { frames: d.frames, fps: d.fps || 0, loop: !!d.loop, decal: !!d.decal, hold: d.hold || 0, particle: !!d.particle } : null; }
export const fxKey = (name, frame = 0) => `f|${name}|${frame | 0}`;
export function fxSprite(name, frame = 0) {
  const fr = fxFrames(FX[name] ? name : 'smokeLight'), f = ((frame | 0) % fr.length + fr.length) % fr.length;
  return copySprite(fr[f]);
}
// muzzle flashes and tracers pointed along heading hi of N (size 0 pistol, 1 SMG/revolver, 2 shotgun/rifle;
// tracer kind 'orange' | 'white'); anchors at the muzzle / the bullet head
export const muzzleKey = (size, hi, N = 16, frame = 0) => `m|${size | 0}|${wrapHi(hi, N)}|${N}|${frame | 0}`;
export function muzzleSprite(size = 0, hi = 0, N = 16, frame = 0) { const fr = memo(muzzleFlash, Math.max(0, Math.min(2, size | 0)), 1, wrapHi(hi, N) * TAU / N || 0); return copySprite(fr[Math.max(0, Math.min(fr.length - 1, frame | 0))]); }
export const tracerKey = (kind, hi, N = 16, frame = 0) => `r|${kind}|${wrapHi(hi, N)}|${N}|${frame | 0}`;
export function tracerSprite(kind = 'orange', hi = 0, N = 16, frame = 0) { const fr = memo(tracer, kind === 'white' ? 'white' : 'orange', 1, wrapHi(hi, N) * TAU / N || 0); return copySprite(fr[Math.max(0, Math.min(fr.length - 1, frame | 0))]); }
// a boat's wake (foam along the hull and a V trail behind) at heading hi of N, 4 looping frames; draw it at
// the boat's centre under the hull (it lies on the water)
// (foam is soft: 16 directions are plenty, so the heading is snapped to 16 whatever N is)
const wake16 = (hi, N) => wrapHi(Math.round(wrapHi(hi, N) * 16 / N), 16);
export const wakeKey = (d, hi, N = 32, frame = 0) => `w|${vehType(d)}|${wake16(hi, N)}|${(frame | 0) & 3}`;
export function wakeSprite(d, hi = 0, N = 32, frame = 0) { const L = vehicleLights(d), fr = memo(wakeFrames, L.L, L.W, wake16(hi, N) * TAU / 16); return trimSprite(fr[(frame | 0) & 3]); }
// the shot effect for a weapon index (shared/items.js WEAPON_BY_INDEX): muzzle size, tracer colour
export const SHOT_FX = { 6: [0, 'white'], 7: [0, 'orange'], 8: [1, 'orange'], 9: [2, 'orange'], 10: [2, 'orange'], 11: [1, 'orange'], 12: [2, 'orange'], 14: [0, 'orange'], 15: [2, 'orange'], 16: [2, 'white'], 17: [2, 'orange'], 18: [2, 'orange'], 19: [0, 'white'], 22: [2, 'white'], 25: [1, 'white'] };

// How the v1 pooled particles and decals (client/render/fx.js) map onto art2 frames, so the existing FX
// state can drive the new renderer unchanged. FX_FOR_V1[particle type] = { name, frames }: every particle set
// is ordered by age, so frame = floor(age / life * frames) (v1ParticleFrame does that); v1ParticleFx picks the
// exact set (dark smoke or light steam by the v1 colour, paper or leaves); .decal[type] and .event[name] map
// decals and server events, and v1DecalFx / v1DecalFrame pick a decal's set and variant.
const V1_PART = { 1: { name: 'pBlood', frames: 3 }, 2: { name: 'pSmoke', frames: 8 }, 3: { name: 'pFlame', frames: 8 }, 4: { name: 'pSpark', frames: 3 }, 5: { name: 'pWater', frames: 3 }, 6: { name: 'pWater', frames: 3 }, 8: { name: 'pPaper', frames: 4 }, 9: { name: 'pRubble', frames: 4 } };
export const FX_FOR_V1 = {
  ...V1_PART,
  particle: V1_PART,
  decal: { 1: { name: 'bloodSplat', frames: 3 }, 2: { name: 'footprints', frames: 6 }, 3: { name: 'dScorch', frames: 3 }, 4: { name: 'dSkid', frames: 8 }, 5: { name: 'dBloodPool', frames: 3, oil: 'dOil' }, 6: { name: 'dLitter', frames: 6 } },
  // events (main.js onEvent) -> one-shot effects
  event: { shot: 'muzzleSmall', explode: 'explosion', spark: 'impactSpark', taser: 'sparkleBlue', splash: 'waterSplash', sinkboom: 'waterSplash', crash: 'impactSpark', glass: 'glassShatter', poof: 'dustPuff', loot: 'sparkle', cash: 'sparkle', deposit: 'sparkle', revive: 'sparkleBlue', blood: 'bloodSpray', geyser: 'waterSplash', pop: 'impactDirt', knockdown: 'dustPuff', hit: 'impactSpark' },
};
// the leading number of a v1 'rgba(n,' colour (allocation-free)
const rgbaLead = (c) => { let n = 0; if (typeof c !== 'string') return 128; for (let i = 5; i < c.length; i++) { const k = c.charCodeAt(i) - 48; if (k < 0 || k > 9) break; n = n * 10 + k; } return n; };
export function v1ParticleFx(p) {
  if (p.type === 2) return rgbaLead(p.color) < 100 ? 'pSmokeDark' : 'pSteam';
  if (p.type === 8) {
    const c = typeof p.color === 'string' && p.color[0] === '#' && p.color.length >= 7 ? p.color : '#e8e4d8', r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    return g > r + 12 && g > b + 12 ? 'pLeaf' : r > g + 30 && g > b ? 'pLeafAutumn' : 'pPaper';
  }
  return (V1_PART[p.type] || V1_PART[4]).name;
}
export function v1ParticleFrame(p) {
  const d = V1_PART[p.type] || V1_PART[4], age = p.max ? 1 - Math.max(0, Math.min(1, p.life / p.max)) : 0;
  if (p.type === 8) return Math.floor(Math.abs(p.ph || 0) * 2) & 3;                  // paper flutters through its 4 frames
  return Math.min(d.frames - 1, Math.floor(age * d.frames));
}
// a pool (decal 5) is oil when its colour is a dark grey rather than a red
const greyish = (c) => { if (typeof c !== 'string' || c[0] !== '#' || c.length < 7) return false; const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16); return r < 0x60 && Math.abs(r - g) < 0x20; };
export function v1DecalFx(d) { return d.type === 5 && greyish(d.color) ? 'dOil' : (FX_FOR_V1.decal[d.type] || FX_FOR_V1.decal[6]).name; }
export function v1DecalFrame(d) {
  const s = d.size || 1;
  switch (d.type) {
    case 1: return s > 7 ? 0 : s > 4 ? 1 : 2;
    case 2: return ((d.alpha ?? 1) > 0.66 ? 0 : (d.alpha ?? 1) > 0.33 ? 2 : 4) + ((Math.floor(d.x + d.y) & 1));
    case 3: return s > 30 ? 2 : s > 14 ? 1 : 0;
    case 4: { const a = (((d.a || 0) % Math.PI) + Math.PI) % Math.PI; return Math.round(a / Math.PI * 8) & 7; }
    case 5: return s > 11 ? 2 : s > 6 ? 1 : 0;
    case 6: return Math.floor(hash(Math.floor(d.x), Math.floor(d.y), 3) * 6);
    default: return 0;
  }
}

// ---- ambient critters ------------------------------------------------------------------------------------------
// The birds and small life the client simulates (pigeons, gulls, sparrows, butterflies...): frames from
// client/art2/critters.js (pigeon: 0 on the ground, 1 take-off, 2-4 flying; seagull: 4 glide frames).
// left = mirrored (facing west). critterInfo(kind) -> frames, fps, flight altitude, shadow radius.
export const CRITTER_NAMES = Object.keys(CRITTERS);
export const critterKey = (kind, frame = 0, left = false) => `k|${kind}|${frame | 0}|${left ? 1 : 0}`;
export function critterSprite(kind, frame = 0, left = false) { const fr = critterFrames(CRITTERS[kind] ? kind : 'pigeon', !!left); return copySprite(fr[((frame | 0) % fr.length + fr.length) % fr.length]); }
export function critterInfo(kind) { const d = CRITTERS[kind]; return d ? { frames: d.frames, fps: d.fps, fly: !!d.fly, alt: d.alt || null, shadow: d.shadow || 0, ground: d.ground || null, air: d.air || null } : null; }
export function critterShadow(r = 3) { return copySprite(shadowBlob(r)); }

// drop the cached voxel models (a worker under memory pressure; sprites already made stay valid)
// ---- rides ----------------------------------------------------------------------------------------------------
// The Ferris wheel's gondolas go round (the static wheel is baked without them) and a flight's balloon crosses the
// sky: both drawn as the static wheel and the field's balloons draw them. A balloon is a big model (154 x 154 x 266
// voxels): made once for its sprite and not kept.
export const rideKey = (kind, v = 0) => `R|${kind === 'balloon' ? 'b' : 'c'}|${(v | 0) & 3}`;
export function rideSprite(kind, v = 0) {
  const c = (v | 0) & 3;
  if (kind === 'balloon') return trimSprite(ART.hotAirBalloon(c, 1).render(0, { dither: 0.3, px: ART_PX }));
  return objRender('cab' + c, () => ART.ferrisCab(c), 0, 1);
}

// ---- foraging (shared/foraging.js) ----------------------------------------------------------------------------------
// What you can pick where it grows (the host draws it while the spot isn't picked bare): the mushrooms as the forage
// art draws them on the forest floor, on a log or at a stump (client/art2/forage.js groundSprite), and the tidepools'
// golden sea star, lit from within. v: one of four looks.
export const forageKey = (art, v = 0) => `F|${art}|${(v | 0) & 3}`;
export function forageSprite(art, v = 0) { return art === 'star' ? ART.starfish('#f0c040', 6, 1 + ((v | 0) & 3), 1) : forageGround(art, (v | 0) & 3); }

export function clearActorCaches() { for (const c of [MODELS, ANIMAL_MODELS, OBJ_MODELS, TRAIN_MODELS]) c.clear(); LIGHTS.clear(); }

// ---- one table for the workers: sprite(kind, args) and its cache key --------------------------------------------
export const SPRITES = { vehicle: vehicleSprite, animal: animalSprite, crate: crateSprite, bag: bagSprite, ball: ballSprite, proj: projSprite, train: trainCarSprite, fx: fxSprite, muzzle: muzzleSprite, tracer: tracerSprite, wake: wakeSprite, critter: critterSprite, ride: rideSprite, forage: forageSprite };
export const KEYS = { vehicle: vehicleKey, animal: animalKey, crate: crateKey, bag: bagKey, ball: ballKey, proj: projKey, train: trainKey, fx: fxKey, muzzle: muzzleKey, tracer: tracerKey, wake: wakeKey, critter: critterKey, ride: rideKey, forage: forageKey };
