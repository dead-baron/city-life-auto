// Art v2 rocky biome scenes, built to the N3 (cave and old mine), N4 (desert canyon and oasis), N5
// (mountains: switchbacks, lake, falls, cabin, lookout) and N8 (tidepools under the lighthouse) targets,
// on the height-field terrain (terrain.js) with the wild props (props-wild.js) and the shared people,
// animals, vehicles and plants. 768 x 512 world px each, like the district scenes.
//
// SCENES[name](preset) -> { G, lights };  TARGETS[name] -> target image;  PRESET[name] -> the lighting
// preset each scene is made for (the cave is underground: render it with p=indoor).
import { Scene, Streets, distSq } from './scene.js';
import { Terrain, finishTerrain, scree, onTerrain, boulder, outcrop, stalagmite, crystals } from './terrain.js';
import * as W from './props-wild.js';
import * as P from './props.js';
import * as K from './props-park.js';
import * as U from './props-rural.js';
import * as KT from './props-kit.js';
import * as TW from './props-town.js';
import { vehicleModel } from './vehicles.js';
import { animalModel } from './animals.js';
import { palm, fanPalm, pine, bush, fern, leafyTree } from './trees.js';
import { puddle, ruts, shoreFoam } from './ground.js';
import { GBuf, F_GROUND, F_WATER, F_WET, hash, vnoise, bayer, mulberry32 } from './gbuf.js';
import { MAT, ramp } from './palette.js';

const PI = Math.PI;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const pick = (R, t, x, y, d = 0.6) => R[Math.max(0, Math.min(R.length - 1, Math.round(t * (R.length - 1) + bayer(x, y) * d)))];
const WCLEAR = ramp('#2aa0ae', 7, 3, { dark: 0.62, light: 0.6, shift: 0.12 }), WDEEP = ramp('#1d5a86', 7, 3, { dark: 0.6, light: 0.6, shift: 0.1 });
const PEB = ramp('#6a7a6a', 6, 3, { dark: 0.55, light: 0.4 });

// ---- shared painters ------------------------------------------------------------------------------------
function inPoly(P, x, y) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; }
function blobTest(cx, cy, rx, ry, seed = 0, wob = 0.25) { return (x, y) => { const a = Math.atan2(y - cy, x - cx), w = 1 + wob * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 5 + seed * 2.3) * 0.4); return ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 < w * w; }; }
function worley(x, y, s, seed) {
  const gx = Math.floor(x / s), gy = Math.floor(y / s); let d1 = 1e9, d2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const X = gx + i, Y = gy + j, px = (X + 0.2 + hash(X, Y, seed) * 0.6) * s, py = (Y + 0.2 + hash(X, Y, seed + 1) * 0.6) * s, d = (x - px) ** 2 + (y - py) ** 2; if (d < d1) { d2 = d1; d1 = d; id = hash(X, Y, seed + 2); } else if (d < d2) d2 = d; }
  return [Math.sqrt(d1), Math.sqrt(d2), id];
}
// clear water over a pebbled bottom: deeper (darker, bluer) away from the edge, a caustic net of light
function clearWater(G, test, opt = {}) {
  const { w, h } = G, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = test(x, y) ? 0 : 1;
  const d = distSq(m, w, h), deep = opt.deep ?? 40, seed = opt.seed ?? 7, glint = opt.glint ?? 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (m[i]) continue;
    const dd = clamp(Math.sqrt(d[i]) / deep), [d1, d2, id] = worley(x, y * 1.25, 7, seed);
    const net = Math.sin(x * 0.42 + Math.sin(y * 0.33) * 2.2) + Math.sin(y * 0.38 + Math.sin(x * 0.21) * 2.4);
    let t = 0.66 - dd * 0.38 + (id - 0.5) * 0.16 * (1 - dd) + (d2 - d1 < 1.2 ? -0.12 : 0) + (net > 1.35 ? 0.22 : 0) + (vnoise(x, y, 23, seed) - 0.5) * 0.12;
    const R = dd > 0.75 && opt.blue ? WDEEP : WCLEAR;
    const e = net > 1.65 && hash(x, y, seed) > 0.4 * glint ? [220, 255, 250, 60] : null;
    G.put(x, y, pick(R, clamp(t), x, y, 0.6), [Math.cos(x * 0.42) * 0.05, Math.cos(y * 0.38) * 0.08, 1], 0, e, F_GROUND | F_WATER);
  }
}
// sun glitter on open water: short bright warm crests, densest toward a point
function glitter(G, cx, cy, r, test, seed = 3) {
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const d = Math.hypot((x - cx) / r, (y - cy) / (r * 0.8)); if (d > 1 || !test(x, y)) continue;
    const sw = Math.sin(y * 0.5 + vnoise(x, y, 9, seed) * 6 + x * 0.05);
    if (sw > 0.6 + d * 0.35 && hash(x >> 1, y, seed) > 0.25 + d * 0.5) G.put(x, y, [255, 226 - d * 40, 160 - d * 40], [0, 0.1, 1], 0, [255, 210, 130, 200 * (1 - d)], F_GROUND | F_WATER);
  }
}
// foam round anything standing in the water (from the terrain's footprints): a broken white ring
function rockFoam(G, T, isWater, reach = 7, seed = 9) {
  const { w } = T, rows = Math.min(G.h, T.h), m = new Uint8Array(G.w * G.h);
  for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) m[y * G.w + x] = T.Hi[y * w + x] > 2 ? 1 : 0;
  const d = distSq(m, G.w, G.h), F = MAT.foam;
  for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) {
    const i = y * G.w + x; if (m[i] || !isWater(x, y)) continue;
    const dd = Math.sqrt(d[i]); if (dd > reach) continue;
    const on = dd < 2 ? hash(x, y, seed) > 0.2 : (vnoise(x, y, 4, seed) > 0.42 + dd / reach * 0.4 && hash(x, y, seed + 1) > 0.25);
    if (on) G.put(x, y, pick(F, 0.9 - dd / reach * 0.5, x, y, 0.5), [0, 0, 1], 0, null, F_GROUND | F_WATER);
  }
}
const DESERTBUSH = ramp('#7a8a4a', 7, 3, { dark: 0.62, light: 0.45, shift: 0.25 }), SAGE = ramp('#8a9478', 7, 3, { dark: 0.6, light: 0.5, shift: 0.2 });
const add = (sc, T, spr, x, y, dz = 0) => onTerrain(sc, T, spr, x, y, dz);
const vox = (sc, T, m, x, y, hd = 0, key = null, dz = 0) => sc.add(sc.render(m, hd, key), x, y, T.heightAt(x, y) + dz, y);

// ---- N4 desert canyon: mesas, a natural arch over a dry wash, the oasis with its little fall, the road --
function buildCanyon(preset = 'golden') {
  const sc = new Scene(768, 512, preset, 41), G = sc.G;
  const S = new Streets(768, 512, { lotKind: 'desert', sidewalk: 0 });
  const road = [[236, -20], [222, 30], [182, 92], [146, 150], [124, 212], [134, 272], [172, 330], [226, 398], [268, 452], [292, 530]];
  const wash = [[528, -10], [512, 80], [498, 160], [506, 236], [526, 304], [522, 380], [500, 450], [488, 530]];
  S.zone('gravel', { path: wash, width: 96 });
  S.zone('dirtRoad', { path: road, width: 58 });
  S.build(); S.paint(G, 41);
  ruts(G, road, 24, 41);
  // the wash: pale gravel with sand streaks and cobbles
  for (let i = 0; i < 900; i++) { const t = hash(i, 1, 43), k = Math.floor(t * (wash.length - 1)), f = t * (wash.length - 1) - k, x = wash[k][0] + (wash[k + 1][0] - wash[k][0]) * f + (hash(i, 2, 43) - 0.5) * 92, y = wash[k][1] + (wash[k + 1][1] - wash[k][1]) * f + (hash(i, 3, 43) - 0.5) * 20; const r = 1 + hash(i, 4, 43) * 3; for (let dy = -r; dy <= r; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) { const q = (dx / (r + 1)) ** 2 + (dy / r) ** 2; if (q > 1 || !G.inside(x + dx, y + dy)) continue; G.put(x + dx, y + dy, pick(ramp('#a89480', 6, 3), 0.62 - dx / r * 0.18 - dy / r * 0.22 - (q > 0.7 && dy > 0 ? 0.25 : 0), dx, dy, 0.4), [dx / r * 0.5, dy / r * 0.5, 1], 1, null, F_GROUND | F_WET); } }
  // the oasis pool
  const pool = blobTest(330, 352, 60, 42, 2, 0.22);
  clearWater(G, pool, { deep: 26, seed: 44 });
  const T = new Terrain(768, 512, { seed: 41, below: 140 });
  const VEG = { kind: 'sage', density: 0.014, band: 4, inner: 0.003, size: 3, bloom: true };
  const LEDGE = { kind: 'dry', density: 0.08, band: 3, inner: 0.002 };
  // the big central mesa, stepped, and the right-hand mesa, joined by the arch
  T.plateau({ poly: [[236, 0], [496, 0], [508, 70], [492, 150], [470, 214], [430, 252], [372, 262], [312, 246], [262, 214], [238, 160], [226, 80]] }, { style: 'sandstone', tiers: [[0, 56], [18, 104], [38, 148]], veg: VEG, seed: 3 });
  T.plateau({ poly: [[568, 0], [768, 0], [768, 304], [716, 300], [664, 284], [618, 266], [586, 220], [572, 140], [560, 60]] }, { style: 'sandstone', tiers: [[0, 60], [18, 108], [38, 150]], veg: VEG, seed: 4 });
  T.arch([[468, 178], [530, 194], [602, 210]], 36, 128, 32, { style: 'sandstone', veg: LEDGE, seed: 5 });
  // the ledge the oasis spring falls from, and rocks round the pool
  T.plateau({ poly: [[300, 248], [404, 250], [418, 286], [372, 300], [318, 292]] }, { style: 'sandstone', tiers: [[0, 26], [10, 40]], veg: { kind: 'grass', density: 0.12, band: 3, inner: 0.03 }, seed: 6 });
  for (const [x, y, rx, ry, h] of [[262, 330, 24, 16, 26], [400, 382, 30, 18, 30], [294, 410, 26, 16, 22], [376, 420, 28, 16, 26], [430, 330, 22, 16, 30], [452, 410, 34, 22, 40], [430, 460, 30, 18, 28], [236, 280, 22, 14, 22]]) T.plateau({ blob: { cx: x, cy: y, rx, ry, seed: x + y, wob: 0.3 } }, { style: 'sandstone', seed: x + y, tiers: [[0, h * 0.6], [6, h]], jag: 5, block: 8, veg: { kind: 'sage', density: 0.05, band: 2 } });
  // the left mesas and the low blocks along the road
  T.plateau({ poly: [[-10, 236], [56, 226], [100, 262], [112, 330], [96, 420], [116, 530], [-10, 530]] }, { style: 'sandstone', tiers: [[0, 50], [16, 92]], veg: VEG, seed: 7 });
  T.plateau({ poly: [[150, 450], [238, 438], [256, 530], [140, 530]] }, { style: 'sandstone', tiers: [[0, 44], [12, 70]], veg: VEG, seed: 8 });
  T.plateau({ poly: [[-10, 0], [40, 0], [30, 30], [-10, 40]] }, { style: 'sandstone', tiers: [[0, 30]], veg: VEG, seed: 9 });
  // the bottom-right mesa, with ledges for the lizard
  T.plateau({ poly: [[560, 360], [622, 318], [700, 316], [768, 300], [768, 640], [540, 640], [532, 460]] }, { style: 'sandstone', tiers: [[0, 50], [16, 88], [40, 124]], veg: VEG, seed: 10 });
  T.build();
  scree(G, T, { density: 0.08, reach: 16 });
  // plants on the flats: sage and creosote, saguaros, barrels, prickly pear, flowers
  const rng = mulberry32(41);
  for (let i = 0; i < 70; i++) {
    const x = rng() * 768, y = rng() * 512; if (T.heightAt(x, y) > 0 || pool(x, y)) continue;
    const k = S.kind(x | 0, y | 0); if (k === 'dirtRoad' || (k === 'gravel' && rng() < 0.7)) continue;
    sc.add(bush(700 + i, 6 + rng() * 6, { ramp: rng() < 0.5 ? DESERTBUSH : SAGE, flowers: rng() < 0.3 ? '#e8c040' : undefined }), x, y);
  }
  for (const [x, y, h] of [[52, 92, 66], [24, 182, 54], [112, 34, 44], [186, 228, 40], [70, 300, 36]]) if (!T.heightAt(x, y)) sc.vox(U.saguaro(x, h), x, y, 0, 0, y, 'sag' + h + x);
  for (const [x, y] of [[44, 214], [84, 128], [196, 196], [96, 250], [312, 470]]) if (!T.heightAt(x, y)) sc.vox(U.barrelCactus(), x, y, 0, 0, y, 'bc');
  for (const [x, y] of [[18, 120], [160, 30], [60, 40]]) sc.vox(KT.pricklyPear(x), x, y, 0, 0, y);
  // plants on the mesa tops
  for (let i = 0; i < 70; i++) {
    const x = rng() * 768, y = rng() * 640, h = T.heightAt(x, y); if (h < 30 || T.dE[Math.min(T.h - 1, y | 0) * 768 + (x | 0)] < 4) continue;
    const r = rng();
    if (r < 0.12) vox(sc, T, U.barrelCactus(), x, y, 0, 'bc');
    else if (r < 0.2) vox(sc, T, U.saguaro(i, 30 + rng() * 16), x, y, 0);
    else add(sc, T, bush(800 + i, 6 + rng() * 7, { ramp: rng() < 0.5 ? DESERTBUSH : SAGE, flowers: rng() < 0.35 ? (rng() < 0.5 ? '#e8c040' : '#e86a9a') : undefined }), x, y);
  }
  // the oasis: palms, reeds, ferns and the spring falling off the ledge
  sc.add(W.cascade(22, 36, 4), 352, 304, 0, 304);
  sc.add(palm(41, 96), 262, 300, 6, 300); sc.add(palm(42, 84), 420, 342, 4, 342); sc.add(fanPalm(43, 46), 300, 300);
  for (const [x, y] of [[290, 380], [318, 392], [374, 386], [392, 352], [280, 352], [356, 316], [312, 318]]) sc.vox(K.reeds(x, 16), x, y, 0, 0, y);
  for (const [x, y] of [[250, 352], [404, 366], [276, 390], [356, 398]]) sc.add(fern(x, 16), x, y);
  for (const [x, y] of [[240, 316], [420, 300], [446, 360], [300, 410]]) sc.add(bush(x, 9, { ramp: MAT.leaf }), x, y);
  // the pickup heading up the road, the roadrunner in the wash, the lizard on a ledge, a dead tree
  sc.vox(vehicleModel('pickup', { paint: '#8e3330', cargo: [2, 1], lights: 1 }), 158, 132, -PI / 2 + 0.42, 0, 132);
  sc.carLight(158, 132, -PI / 2 + 0.42, 104);
  sc.vox(W.roadrunner(), 538, 272, PI); sc.vox(W.lizard(), 612, 382, -0.4, T.heightAt(612, 382));
  add(sc, T, W.deadTree(5, 62), 734, 330);
  for (const [x, y] of [[700, 380], [652, 352]]) vox(sc, T, U.barrelCactus(), x, y, 0, 'bc');
  return finishTerrain(sc, T);
}

// ---- N5 mountains: lake, falls, the cabin meadow, the switchback up to the fire lookout -----------------
function buildMountains(preset = 'golden') {
  const sc = new Scene(768, 512, preset, 51), G = sc.G;
  const road = [[476, 600], [444, 520], [404, 452], [390, 404], [412, 378], [470, 372], [552, 372], [612, 352], [636, 306], [606, 262], [520, 240], [462, 222], [470, 186], [548, 166], [626, 156], [690, 150]];
  const roadH = [36, 36, 37, 38, 42, 48, 58, 72, 90, 104, 112, 118, 124, 132, 138, 140];
  const lake = blobTest(150, 196, 166, 76, 1, 0.16), river = (x, y) => { let m = 1e9; const P = [[44, 360], [62, 420], [88, 470], [112, 520]]; for (let i = 1; i < P.length; i++) { const ax = P[i - 1][0], ay = P[i - 1][1], bx = P[i][0], by = P[i][1], l = (bx - ax) ** 2 + (by - ay) ** 2, t = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l); m = Math.min(m, (x - ax - t * (bx - ax)) ** 2 + (y - ay - t * (by - ay)) ** 2); } return m < 26 * 26; };
  const S = new Streets(768, 512, { lotKind: 'grass', sidewalk: 0 });
  S.zone('dirtRoad', { path: road, width: 40 });
  for (let i = 0; i < 18; i++) S.zone('grassDry', { blob: { cx: hash(i, 1, 58) * 768, cy: hash(i, 2, 58) * 512, rx: 30 + hash(i, 3, 58) * 50, ry: 20 + hash(i, 4, 58) * 30, seed: i } });
  S.zone('dirt', { blob: { cx: 240, cy: 330, rx: 70, ry: 26, seed: 3 } });
  S.build(); S.paint(G, 51);
  ruts(G, road, 16, 51);
  clearWater(G, lake, { deep: 22, seed: 52, blue: true });
  clearWater(G, river, { deep: 12, seed: 53 });
  const T = new Terrain(768, 512, { seed: 51, below: 200 });
  const GV = { kind: 'grass', density: 0.18, band: 3, inner: 0.012 }, FL = { kind: 'flowers', density: 0.16, band: 3, inner: 0.03 };
  // the meadow terrace everything stands on, the gorge cut down to the river at the bottom left
  T.plateau({ rect: [0, 0, 768, 712] }, { style: 'granite', h: 36, top: 'keep', keepKind: 'grass', rim: 2, veg: FL, seed: 1, jag: 0 });
  T.carve({ poly: [[-10, 372], [70, 362], [140, 400], [176, 470], [196, 720], [-10, 720]] }, { h: 0, top: 'keep', keepKind: 'grass', seed: 2, jag: 10 });
  // the lake terrace (left, high) with the goats' cliff top; the upper terraces to the lookout
  T.plateau({ poly: [[-10, -10], [350, -10], [356, 150], [318, 236], [240, 268], [150, 262], [128, 300], [130, 350], [70, 368], [-10, 366]] }, { style: 'granite', tiers: [[0, 108], [14, 150]], top: 'keep', keepKind: 'grass', rim: 3, veg: GV, moss: 0.1, seed: 3 });
  T.plateau({ poly: [[360, -10], [778, -10], [778, 400], [720, 360], [650, 300], [560, 276], [474, 262], [420, 232], [380, 170]] }, { style: 'granite', tiers: [[0, 100], [16, 108]], top: 'keep', keepKind: 'grass', rim: 3, veg: GV, seed: 4 });
  T.plateau({ poly: [[590, -10], [778, -10], [778, 330], [724, 330], [664, 304], [628, 250], [604, 170]] }, { style: 'granite', tiers: [[0, 140], [12, 146]], top: 'keep', keepKind: 'grass', rim: 3, veg: GV, seed: 5 });
  // snowfields: a high shoulder above the lake, and the slope down the right side
  T.plateau({ poly: [[236, -10], [352, -10], [350, 140], [316, 214], [262, 176], [240, 90]] }, { style: 'granite', tiers: [[0, 158], [16, 164]], top: 'snow', rim: 2, snow: 0.5, seed: 6 });
  T.plateau({ poly: [[650, 430], [720, 400], [778, 400], [778, 720], [610, 720], [600, 540]] }, { style: 'granite', tiers: [[0, 70], [14, 92], [34, 112]], top: 'snow', rim: 4, snow: 0.6, veg: GV, seed: 7 });
  T.road(road, 40, roadH, { style: 'granite', seed: 8 });
  // granite knolls and outcrops through the meadow
  for (const [x, y, rx, ry, h, b] of [[188, 304, 18, 12, 18, 36], [510, 430, 26, 16, 28, 36], [548, 470, 18, 12, 20, 36], [326, 470, 30, 18, 30, 36], [700, 470, 26, 16, 26, 112], [404, 290, 22, 14, 22, 36], [86, 290, 26, 18, 26, 150], [130, 330, 22, 14, 22, 150], [356, 520, 24, 14, 24, 36]]) T.dome(x, y, rx, ry, h + b, { style: 'granite', seed: x * 3 + y, flat: 0.92, moss: 0.08 });
  for (const [x, y, rx, ry, h] of [[50, 250, 20, 12, 162], [190, 108, 18, 10, 158], [282, 100, 22, 12, 160], [12, 150, 20, 14, 158], [244, 262, 20, 12, 160]]) T.dome(x, y, rx, ry, h, { style: 'granite', seed: x + y, flat: 0.96 });
  for (let i = 0; i < 70; i++) { const x = hash(i, 1, 57) * 768, y = 200 + hash(i, 2, 57) * 500, b = T.H[Math.min(T.h - 1, y | 0) * 768 + (x | 0)]; if (b < 30 || river(x, y) || lake(x, y) || S.kind(x | 0, Math.min(511, y | 0)) === 'dirtRoad') continue; const r = 12 + hash(i, 3, 57) * 22; T.dome(x, y, r * 1.2, r * 0.8, b + r * (0.8 + hash(i, 4, 57) * 0.6), { style: 'granite', seed: i * 13, flat: 0.9, moss: 0.1, veg: { kind: 'grass', density: 0.1, band: 2 } }); }
  T.build();
  scree(G, T, { density: 0.05, reach: 12 });
  shoreFoam(G, (x, y) => river(x, y));
  // the falls: from the lake terrace's lip down to the river; a second cascade below
  let fy = 300; while (fy < 500 && T.heightAt(44, fy) > 20) fy++;
  sc.add(W.waterfall(40, 150, 5), 44, fy + 1, 0, fy + 1);
  sc.add(W.cascade(30, 26, 6), 78, 444, 0, 444);
  // pines: thick on the slopes and terraces, kept off the road, the lake and the cabin yard
  const rng = mulberry32(51);
  const free = (x, y) => S.kind(x | 0, y | 0) !== 'dirtRoad' && !lake(x, y) && !river(x, y) && !(x > 160 && x < 330 && y > 280 && y < 360) && !(x > 610 && x < 768 && y < 250);
  for (let i = 0; i < 520; i++) {
    const x = rng() * 768, y = rng() * 700; if (!free(x, y) || vnoise(x, y, 70, 9) < 0.42) continue;
    const h = T.heightAt(x, y), e = T.dE[Math.min(T.h - 1, y | 0) * 768 + (x | 0)];
    if (e < 5 || y - h > 520 || y - h < -40) continue;
    if (T.styleAt(x, y) && T.ops[T.O[(y | 0) * 768 + (x | 0)]].top === 'snow' && rng() < 0.6) continue;
    add(sc, T, pine(900 + i, 60 + rng() * 70, 15 + rng() * 10), x, y);
  }
  for (let i = 0; i < 60; i++) { const x = rng() * 768, y = rng() * 700; if (!free(x, y) || T.dE[Math.min(T.h - 1, y | 0) * 768 + (x | 0)] < 4) continue; add(sc, T, bush(600 + i, 7 + rng() * 6, { ramp: MAT.leafDark }), x, y); }
  // lupine meadows round the cabin and along the road
  for (const [x, y, w, d] of [[200, 248, 70, 30], [330, 250, 60, 26], [430, 300, 60, 26], [340, 410, 70, 30], [560, 420, 50, 24], [470, 330, 50, 22]]) vox(sc, T, KT.meadow(w, d, x, ['#9a7ad8', '#7a5ac8', '#e8e0f0', '#e8c040'], 1.2), x, y, 0);
  // the cabin, its yard, fence, the olive jeep, the ranger, woodpile and smoke
  const cy = 296;
  vox(sc, T, W.logCabin(92, 56, sc.night * 0.6 + 0.25), 262, cy, 0, 'cabin');
  sc.add(W.chimneySmoke(7, 56), 306, cy - 4, 60 + 74, cy - 4);
  vox(sc, T, W.jeep('#5e6a3a'), 176, 362, 0.15, 'jeepO');
  sc.person(232, 346, { skin: 1, build: 1, beard: 'short', hair: { style: 'short', color: 1 }, top: { kind: 'jacket', color: 'khaki', color2: 'brown' }, bottom: { kind: 'pants', color: 'brown' }, shoes: 'brown', hat: { kind: 'cowboy', color: 'khaki' } }, 0, 'idle'); sc.items[sc.items.length - 1].dz = T.heightAt(232, 346);
  vox(sc, T, U.woodpile(), 206, 304, 0); vox(sc, T, P.crate(1), 300, 334, 0); vox(sc, T, W.barrel('#6a6a70'), 214, 318, 0);
  for (const [x, y, len, hd] of [[150, 360, 120, 0], [330, 316, 60, 0], [150, 300, 60, PI / 2]]) vox(sc, T, KT.fenceKind('rail', len), x + (hd ? 0 : len / 2), y, hd, 'rail' + len);
  // the road's rail fence on the outside of the bends, the red jeep coming up
  for (const [x, y, len, hd] of [[424, 404, 60, 0.6], [560, 392, 80, -0.1], [646, 330, 50, 1.3], [500, 262, 70, 0.2]]) vox(sc, T, KT.fenceKind('rail', len), x, y, hd);
  vox(sc, T, W.jeep('#b8452c'), 460, 380, -0.1, 'jeepR');
  // the lookout on its crag: a solar panel, a crate, the antenna, a watcher on the gallery
  vox(sc, T, W.lookoutTower(82, sc.night * 0.8 + 0.3), 690, 262, 0, 'look');
  vox(sc, T, TW.solarPanel(30, 20), 740, 300, 0.2); vox(sc, T, P.crate(2), 640, 290, 0); vox(sc, T, W.barrel('#6a6a70'), 652, 300, 0);
  // goats on the cliffs
  for (const [x, y, hd] of [[54, 294, 0.3], [104, 330, PI - 0.4], [706, 470, PI], [690, 520, 0.2]]) vox(sc, T, animalModel('goat'), x, y, hd);
  return finishTerrain(sc, T);
}

// ---- N8 tidepools: the sea stack with gulls, the seal rock, pools among barnacled basalt, the cove,
//      the cliff path and stairs up to the lighthouse and the keeper's cottage ------------------------------
function buildTidepools(preset = 'golden') {
  const sc = new Scene(768, 512, preset, 81), G = sc.G;
  const S = new Streets(768, 512, { lotKind: 'water', sidewalk: 0 });
  const cove = [[480, 196], [560, 222], [630, 250], [690, 282], [704, 336], [684, 420], [624, 404], [560, 352], [500, 292], [462, 236]];
  const cliff = [[420, -10], [778, -10], [778, 700], [690, 700], [654, 600], [676, 470], [668, 380], [708, 332], [690, 280], [626, 246], [564, 222], [520, 200], [470, 168], [436, 120], [410, 50]];
  const poolPoly = [[250, 110], [440, 80], [520, 150], [600, 330], [660, 520], [220, 520], [226, 330], [210, 200]];
  S.zone('waterDeep', { poly: [[-10, -10], [420, -10], [300, 120], [200, 330], [220, 520], [-10, 520]] });
  S.zone('sand', { poly: cove });
  S.zone('grass', { poly: cliff });
  const path = [[436, 40], [480, 110], [540, 160], [610, 210], [680, 260], [720, 330], [740, 420]];
  S.zone('dirtRoad', { path, width: 22 }); S.zone('dirtRoad', { blob: { cx: 690, cy: 200, rx: 60, ry: 34, seed: 2 } });
  S.build(); S.paint(G, 81);
  const isPool = (x, y) => !inPoly(cove, x, y) && !inPoly(cliff, x, y) && inPoly(poolPoly, x + (vnoise(x, y, 26, 5) - 0.5) * 50 + (hash(x, y, 6) - 0.5) * 6, y + (vnoise(x, y, 26, 7) - 0.5) * 40);
  clearWater(G, isPool, { deep: 30, seed: 82 });
  // wet sand along the waterline of the cove
  for (let y = 0; y < 512; y++) for (let x = 400; x < 720; x++) if (inPoly(cove, x, y) && !inPoly(cove, x - 7 - (hash(x, y >> 2, 3) * 4 | 0), y)) { const j = (y * 768 + x) * 4; G.col[j] *= 0.8; G.col[j + 1] *= 0.76; G.col[j + 2] *= 0.74; }
  glitter(G, 60, 20, 300, (x, y) => S.kind(x, y) === 'waterDeep', 83);
  const T = new Terrain(768, 512, { seed: 81, below: 160 });
  const KELP = { kind: 'kelp', amount: 0.6 }, BAS = { style: 'basalt', top: 'rock', barnacles: 0.85, wet: 12, hang: KELP, moss: 0.08, veg: { kind: 'kelp', density: 0.14, band: 3, inner: 0.004 } };
  // the cliff (grass on top), the stack, the seal rock
  T.plateau({ poly: cliff }, { style: 'basalt', tiers: [[0, 70], [12, 100]], top: 'keep', keepKind: 'grass', rim: 4, veg: { kind: 'shrub', density: 0.3, band: 5, inner: 0.02, size: 3, bloom: true }, hang: { kind: 'vine', amount: 0.7 }, blocky: 0.85, moss: 0.1, seed: 1 });
  T.plateau({ blob: { cx: 150, cy: 300, rx: 52, ry: 40, seed: 2, wob: 0.22 } }, { ...BAS, tiers: [[0, 40], [10, 120], [20, 168], [30, 198]], veg: { kind: 'grass', density: 0.1, band: 2 }, seed: 2, jag: 7 });
  for (const [x, y, rx, ry, h] of [[60, 250, 22, 16, 24], [96, 196, 16, 12, 20], [200, 210, 20, 14, 22], [250, 180, 24, 16, 26], [36, 330, 18, 12, 16]]) T.dome(x, y, rx, ry, h, { ...BAS, seed: x + y, flat: 0.8 });
  T.plateau({ blob: { cx: 132, cy: 440, rx: 92, ry: 52, seed: 3, wob: 0.2 } }, { ...BAS, tiers: [[0, 26], [12, 36]], seed: 3 });
  // the tidepool field: flat-topped barnacled rocks with kelp down their sides
  const rocks = [[300, 150, 40, 22, 26], [350, 210, 36, 20, 22], [278, 250, 30, 20, 24], [408, 168, 30, 18, 20], [460, 120, 34, 18, 30], [380, 280, 40, 24, 24], [470, 330, 46, 24, 26], [330, 340, 34, 20, 20], [282, 420, 40, 26, 28], [374, 410, 44, 26, 30], [460, 410, 30, 20, 22], [520, 380, 34, 20, 24], [560, 330, 26, 18, 20], [600, 410, 34, 22, 26], [420, 470, 46, 26, 28], [540, 470, 40, 22, 26], [330, 480, 30, 18, 24], [250, 330, 24, 16, 18], [500, 250, 22, 14, 14], [620, 480, 30, 20, 28], [240, 480, 30, 20, 22]];
  for (const [x, y, rx, ry, h] of rocks) { const v = hash(x, y, 3); if (v < 0.35) T.dome(x, y, rx, ry, h * 1.2, { ...BAS, seed: x + y * 3, flat: 0.85, wob: 0.3 }); else T.plateau({ blob: { cx: x, cy: y, rx, ry, seed: x * 7 + y, wob: 0.3 } }, { ...BAS, tiers: v < 0.7 ? [[0, h * 0.5], [4, h * 0.8], [9, h * 1.1]] : [[0, h * 0.6], [5, h]], seed: x + y * 3, jag: 6 }); }
  T.build();
  rockFoam(G, T, (x, y) => S.kind(x, y) === 'waterDeep' || (S.kind(x, y) === 'water' && !isPool(x, y)), 8, 84);
  rockFoam(G, T, (x, y) => isPool(x, y), 3, 85);
  // surf along the cove's waterline
  for (let y = 150; y < 330; y++) for (let x = 440; x < 720; x++) if (!inPoly(cove, x, y) && inPoly(cove, x + 4, y) && hash(x, y, 7) > 0.2) for (let k = 0; k < 3; k++) if (G.inside(x - k, y)) G.put(x - k, y, MAT.foam[3 - k], [0, 0, 1], 0, null, F_GROUND | F_WATER);
  // the cliff path, its fence, the stairs to the beach
  // the lighthouse, cottage, bench, keeper's bits
  vox(sc, T, W.lighthouse(92, sc.night * 0.7 + 0.5), 640, 206, 0, 'lh');
  sc.light(640, 206, T.heightAt(640, 206) + 100, 160, [1, 0.85, 0.55], sc.isNight ? 2.4 : 1.0);
  vox(sc, T, W.cottage(80, 48, sc.night * 0.8 + 0.3), 718, 222, 0, 'cot');
  vox(sc, T, P.bench(), 724, 268, 0); vox(sc, T, P.bin(false), 752, 270, 0);
  for (const [x, y, len, hd] of [[454, 72, 60, 1.0], [500, 128, 60, 0.75], [560, 172, 60, 0.62], [626, 216, 60, 0.58], [690, 272, 60, 1.0]]) vox(sc, T, K.woodRail(len), x, y, hd, 'wr' + hd);
  sc.vox(K.steps(22, 14, 7, 5, '#8a6440'), 538, 240, 0, 0, 276);
  // pines and shrubs on the cliff top
  const rng = mulberry32(81);
  for (let i = 0; i < 40; i++) { const x = 640 + rng() * 130, y = 300 + rng() * 360; if (T.heightAt(x, y) < 60 || T.dE[(y | 0) * 768 + (x | 0)] < 6) continue; add(sc, T, rng() < 0.4 ? pine(700 + i, 50 + rng() * 30, 14) : bush(700 + i, 9 + rng() * 7, { ramp: MAT.leafDark, flowers: rng() < 0.4 ? '#e8a040' : undefined }), x, y); }
  for (let i = 0; i < 30; i++) { const x = 430 + rng() * 340, y = rng() * 260; if (T.heightAt(x, y) < 60 || T.dE[(y | 0) * 768 + (x | 0)] < 4 || (x > 600 && x < 768 && y > 120 && y < 260)) continue; add(sc, T, bush(760 + i, 7 + rng() * 6, { ramp: MAT.leaf, flowers: rng() < 0.5 ? '#e8c040' : '#e86a7a' }), x, y); }
  // life on the rocks and in the pools
  for (let i = 0; i < 70; i++) {
    const x = 230 + rng() * 420, y = 120 + rng() * 392, h = T.heightAt(x, y), r = rng();
    if (inPoly(cove, x, y) || (h === 0 && !isPool(x, y)) || h > 40) continue;
    const spr = r < 0.4 ? W.starfish(rng() < 0.6 ? '#d8583a' : rng() < 0.5 ? '#e8a040' : '#c84a8a', 4 + (rng() * 3 | 0), i) : r < 0.75 ? W.urchin(3 + (rng() * 3 | 0), i, rng() < 0.5 ? '#3a2448' : '#5a2a5a') : W.anemone(3 + (rng() * 2 | 0), i);
    sc.add(spr, x, y, h, y + 0.2);
  }
  for (const [x, y, hd] of [[300, 150, 0.4], [436, 248, 2.2], [380, 412, 1], [520, 470, -0.5], [600, 410, 2.6]]) vox(sc, T, W.crab(), x, y, hd);
  // the seals, the gulls, the tidepooler
  for (const [x, y, hd, p] of [[100, 430, 0.3, 0], [150, 412, -0.6, 1], [176, 444, 0.1, 0], [90, 464, -0.2, 0]]) vox(sc, T, W.seal(p), x, y, hd, null);
  for (const [x, y, hd] of [[138, 296, 0.2], [158, 300, PI], [148, 310, 1], [46, 410, 0.4], [196, 420, PI]]) vox(sc, T, W.gull(false), x, y, hd);
  for (const [x, y, z] of [[80, 70, 120], [172, 30, 140], [40, 140, 90]]) sc.add(W.gull(true), x, y + z, z, y + z);
  sc.person(446, 270, { skin: 1, build: 1, hair: { style: 'short', color: 1 }, top: { kind: 'jacket', color: 'green', color2: 'khaki' }, bottom: { kind: 'jeans', color: 'navy' }, shoes: 'yellow', hat: { kind: 'cap', color: 'red' }, back: 'backpack', backColor: 'khaki' }, 7, 'idle');
  sc.items[sc.items.length - 1].dz = T.heightAt(446, 270);
  // driftwood on the beach
  vox(sc, T, W.driftwood(58, 1), 650, 268, -0.5); vox(sc, T, W.driftwood(40, 2), 616, 286, 0.3);
  for (const [x, y] of [[560, 240], [596, 214], [640, 230]]) sc.add(boulder(x, 8, 'basalt'), x, y);
  return finishTerrain(sc, T);
}

// ---- N3 cave: the mouth, the old mine adit with its rails and cart, the pool with the walkway, crystals --
function buildCave(preset = 'indoor') {
  const sc = new Scene(768, 512, preset, 31), G = sc.G;
  const FL = 8;                                                       // the cave floor's height
  const pool = [[328, 200], [452, 192], [600, 202], [646, 260], [640, 360], [610, 432], [540, 452], [470, 440], [424, 392], [396, 330], [340, 290]];
  const isPool = (x, y) => inPoly(pool, x, y);
  const S = new Streets(768, 512, { lotKind: 'dirt', sidewalk: 0 });
  S.zone('gravel', { blob: { cx: 220, cy: 260, rx: 120, ry: 140, seed: 3 } });
  S.zone('grass', { poly: [[90, -10], [180, -10], [170, 30], [110, 40]] });
  S.build(); S.paint(G, 31);
  // the floor: packed dirt, grit, a worn path, dark wet patches
  for (let y = 0; y < 512; y++) for (let x = 0; x < 768; x++) {
    const j = (y * 768 + x) * 4, n = vnoise(x, y, 30, 5), wet = vnoise(x, y, 14, 6);
    const k = 0.62 + n * 0.25 - (wet > 0.7 ? 0.12 : 0);
    G.col[j] *= k; G.col[j + 1] *= k * 0.96; G.col[j + 2] *= k * 0.98;
  }
  clearWater(G, isPool, { deep: 70, seed: 32, blue: true, glint: 0.6 });
  for (const [x, y, rx, ry] of [[176, 196, 22, 9], [212, 238, 18, 8], [276, 372, 24, 10], [150, 312, 14, 6], [246, 300, 10, 5]]) puddle(G, x, y, rx, ry, x);
  // the rails from the adit down to the walkway
  W.railPath(G, [[506, 150], [504, 168], [520, 186], [560, 198], [600, 204]], 16);
  // daylight outside the mouth: grass and a sunlit glow
  for (let y = 0; y < 40; y++) for (let x = 90; x < 180; x++) { const j = (y * 768 + x) * 4; if (G.flag[y * 768 + x] & F_GROUND) { const k = 1 - y / 40; G.emi[j] = 255; G.emi[j + 1] = 200; G.emi[j + 2] = 110; G.emi[j + 3] = 60 * k; } }
  const T = new Terrain(768, 512, { seed: 31, below: 140 });
  const CV = { style: 'cave', top: 'rock', hang: null, fade: 70 };
  // solid rock everywhere, then the chambers carved out of it
  T.plateau({ rect: [-10, -10, 790, 670] }, { ...CV, h: 112, jag: 0, seed: 1 });
  const floor = (shape, seed) => T.carve(shape, { style: 'cave', h: FL, top: 'keep', seed, jag: 12, rim: 0 });
  floor({ poly: [[100, -20], [180, -20], [196, 60], [190, 130], [340, 146], [452, 150], [610, 150], [650, 210], [664, 300], [650, 400], [600, 470], [520, 500], [420, 560], [300, 470], [200, 470], [120, 380], [96, 230], [88, 120]] }, 2);
  floor({ poly: [[612, 20], [700, 40], [778, 30], [778, 280], [700, 270], [660, 220], [640, 150], [620, 80]] }, 3);
  floor({ poly: [[640, 400], [778, 380], [778, 560], [660, 560]] }, 4);
  floor({ poly: [[300, 440], [420, 430], [440, 560], [290, 560]] }, 5);
  T.carve({ poly: pool }, { style: 'cave', h: 0, top: 'keep', seed: 6, jag: 6 });
  // the mine adit's alcove in the north wall
  floor({ rect: [452, 60, 110, 100, 6] }, 7);
  // rock pillars, boulders and the islands in the pool
  for (const [x, y, rx, ry, h] of [[296, 290, 30, 22, 52], [372, 340, 22, 16, 40], [454, 396, 16, 12, 34], [668, 300, 22, 18, 90], [700, 360, 30, 24, 112], [720, 110, 20, 16, 70], [36, 330, 30, 24, 60], [150, 250, 16, 12, 30], [580, 440, 22, 14, 40]]) T.dome(x, y, rx, ry, h, { style: 'cave', seed: x + y, flat: 0.9, wob: 0.3, veg: { kind: 'grass', density: 0.05, band: 2 } });
  T.build();
  scree(G, T, { density: 0.06, reach: 14, size: 2 });
  // loose rocks on the floor
  for (let i = 0; i < 40; i++) { const x = 100 + hash(i, 1, 33) * 560, y = 140 + hash(i, 2, 33) * 360; if (T.heightAt(x, y) !== FL || T.dE[(y | 0) * 768 + (x | 0)] < 6) continue; sc.add(boulder(i, 5 + hash(i, 3, 33) * 9, 'basalt', { cluster: false }), x, y, FL, y); }
  // the adit, its lanterns, the cart, barrels, crates, a chest, the pick
  sc.add(sc.render(W.minePortal(110, 100), 0, 'adit'), 506, 162, FL - 2, 160);
  for (const [x, y, z] of [[548, 70, 70]]) { sc.add(sc.render(W.lantern('hang', 1), 0, 'lh'), x, y + z, z, y + z); }
  sc.vox(W.mineCart(true), 486, 168, 0.5, FL, 168);
  sc.vox(W.mineCart(true), 112, 232, 0.2, FL, 232);
  for (const [x, y] of [[420, 148], [90, 270]]) sc.vox(W.barrel(), x, y, 0, FL, y, 'barrel');
  sc.vox(W.chest(), 366, 150, 0.1, FL); sc.vox(P.crate(1), 600, 160, 0.2, FL); sc.vox(P.crate(1), 588, 186, -0.1, FL); sc.vox(W.pickaxe(), 614, 196, 0.3, FL);
  for (const [x, y] of [[440, 150], [560, 202], [252, 160]]) sc.vox(W.lantern('post', 1), x, y, 0, FL, y, 'lp');
  // the walkway on piles over the pool, with the track, and a rope rail along the west bank
  sc.vox(W.walkway(232, 30, 28), 468, 214, 0, 0, 228);
  for (const [x, y, len, hd] of [[404, 360, 90, PI / 2 + 0.3], [436, 444, 50, 0.7]]) sc.vox(K.woodRail(len, true), x, y, hd, FL, y);
  // timbers and the old broken cart on the left
  sc.vox(KT.logs('pile'), 132, 292, 0.8, FL); sc.vox(KT.logs('fallen'), 150, 320, 0.4, FL);
  // cave life: stalagmites, crystals, mushrooms, bats, ferns at the mouth
  for (const [x, y, h, r] of [[270, 300, 46, 9], [300, 316, 30, 7], [380, 350, 34, 7], [460, 404, 28, 6], [176, 440, 44, 9], [196, 452, 26, 6], [610, 300, 36, 8], [648, 330, 54, 10], [560, 470, 30, 7], [360, 470, 34, 7]]) sc.add(stalagmite(x + y, h, r), x, y, T.heightAt(x, y), y);
  for (const [x, y, s] of [[690, 98, 34], [744, 150, 26], [706, 220, 22], [736, 470, 34], [690, 440, 20]]) { sc.add(crystals(x * 3 + y, s, '#58c8ff'), x, y, T.heightAt(x, y), y); sc.light(x, y, T.heightAt(x, y) + 18, 90 + s * 2, [0.35, 0.75, 1.0], 1.6); }
  for (const [x, y, c] of [[104, 176, '#d8603a'], [148, 438, '#d8603a'], [330, 222, '#e8783a'], [84, 360, '#c84a3a']]) sc.vox(W.mushrooms(x, 6, c), x, y, 0, FL);
  for (const [x, y] of [[246, 150], [266, 150], [288, 150]]) sc.add(W.bat(false, x), x, y, 74, y);
  sc.add(W.bat(true, 3), 330, 210, 84, 210);
  for (const [x, y] of [[120, 30], [160, 24], [100, 60], [176, 70]]) sc.add(fern(x, 18), x, y, FL);
  sc.add(bush(31, 16, { ramp: MAT.leaf }), 140, 20, FL); sc.add(bush(32, 12, { ramp: MAT.leaf, flowers: '#e8c040' }), 112, 34, FL); sc.add(leafyTree(31, 70, 26), 150, -6, 0, -6); sc.add(leafyTree(33, 60, 22), 112, -10, 0, -10);
  // the caver with a headlamp, looking east into the beam
  sc.person(252, 200, { skin: 2, build: 1, hair: { style: 'short', color: 0 }, top: { kind: 'jacket', color: 'khaki', color2: 'brown' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', hat: { kind: 'hard', color: 'brown' }, back: 'backpack', backColor: 'brown' }, 2, 'walk');
  sc.items[sc.items.length - 1].dz = FL;
  for (let y = -16; y <= 16; y++) for (let x = 6; x < 90; x++) { const k = Math.abs(y) / (2 + x * 0.22); if (k > 1) continue; const X = 262 + x, Y = 196 + y; if (!G.inside(X, Y)) continue; const j = (Y * 768 + X) * 4; G.emi[j] = 255; G.emi[j + 1] = 222; G.emi[j + 2] = 140; G.emi[j + 3] = Math.max(G.emi[j + 3], (1 - k) * (1 - x / 90) * 120); }
  // lights: the mouth's daylight, the lanterns, the headlamp
  sc.light(136, 20, 60, 200, [1.0, 0.8, 0.5], 2.6); sc.light(150, 90, 30, 130, [1.0, 0.75, 0.45], 1.2);
  for (const [x, y, z, k] of [[548, 140, 70, 2.4], [440, 152, 40, 2.2], [560, 204, 40, 1.8], [252, 162, 40, 2.2], [470, 214, 50, 1.2], [180, 300, 40, 1.4], [330, 420, 40, 1.2]]) sc.light(x, y, z, 190, [1.0, 0.72, 0.4], k);
  for (const [x, y] of [[180, 300], [330, 420]]) sc.vox(W.lantern('post', 1), x, y, 0, FL, y, 'lp');
  sc.light(300, 200, 22, 100, [1.0, 0.9, 0.6], 1.8);
  sc.light(500, 330, 30, 160, [0.3, 0.6, 0.9], 0.6);
  return finishTerrain(sc, T);
}

export const SCENES = { cave: buildCave, canyon: buildCanyon, mountains: buildMountains, tidepools: buildTidepools };
export const TARGETS = { cave: 'N3_cave.png', canyon: 'N4_desert-canyon.png', mountains: 'N5_mountains.png', tidepools: 'N8_tidepools.png' };
export const PRESET = { cave: 'indoor', canyon: 'golden', mountains: 'golden', tidepools: 'golden' };
