// Art v2 nature sheets laid out like the N9 / N10 concept sheets (docs/art-v2/targets), so the ambient
// wildlife (critters.js) and the forage kit (forage.js) can be checked against them in one view:
//   wildlife  N10 - rows of animation frames on dark grey: butterflies and dragonflies, a flock bursting
//             out of a tree and a pigeon taking off, gulls, a heron, fireflies, bees, falling leaves and
//             petals, motes and sparkles, rain ripples, a jumping trout, a frog, a squirrel climbing, a
//             rabbit hopping. Flying frames float at their height over a soft blob shadow. Reads best lit
//             'golden' (the default): low warm sun for form, and the fireflies and motes still bloom.
//   forage    N9 - the inventory icons in the target's rows on studio grey, and below them a strip of
//             in-world ground placements (patches of forest floor, rock, sand and tidepool) at game scale.
// Preview: tools/art2/district-preview.html?m=naturesheets&d=wildlife|forage
import { Scene } from './scene.js';
import { GBuf, F_GROUND, F_WET, F_WATER, F_LEAF, F_NOCAST, hash } from './gbuf.js';
import { ramp } from './palette.js';
import { groundPixel } from './ground.js';
import { leafyTree } from './trees.js';
import { critterFrames, shadowBlob, flockBurst, CRITTERS, Pen } from './critters.js';
import { ITEMS, icon, groundSprite, FORAGE } from './forage.js';

// a flat studio ground, faintly mottled; tint [r, g, b] albedo (cool, so the warm golden light lands grey)
function studio(G, seed, tint) {
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const d = Math.round((hash(x >> 3, y >> 3, seed) - 0.5) * 4 + (hash(x, y, seed + 1) > 0.97 ? -4 : 0));
    G.put(x, y, [tint[0] + d, tint[1] + d, tint[2] + d], [0, 0, 1], 0, null, F_GROUND | F_WET);
  }
}
// a sheet copy that casts no shadow (the long golden shadows would run across the neighbouring frames;
// each frame gets a soft blob underneath instead, as on the concept sheets)
const NC = new Map();
function nocast(S) {
  let G = NC.get(S);
  if (G) return G;
  G = new GBuf(S.w, S.h); G.ax = S.ax; G.ay = S.ay;
  G.col.set(S.col); G.nrm.set(S.nrm); G.emi.set(S.emi); G.z.set(S.z);
  for (let i = 0; i < S.w * S.h; i++) G.flag[i] = S.flag[i] | (S.col[i * 4 + 3] ? F_NOCAST : 0);
  NC.set(S, G);
  return G;
}
// a section of tree trunk for the squirrel to climb (anchor = its foot), ivy sprigs up the sides
function trunk(seed = 1, h = 44, w = 11) {
  const p = new Pen(w + 10, h + 4, (w + 10) / 2, h + 2), B = ramp('#6a5c50', 6, 3, { shift: 0.15 }), IV = ramp('#4e8a2e', 5, 2, { light: 0.5 });
  const x0 = 5;
  for (let y = 2; y <= h + 1; y++) for (let x = x0; x < x0 + w; x++) {
    const u = (x + 0.5 - x0 - w / 2) / (w / 2), groove = hash(x, y >> 2, seed) > 0.72 || (x - x0) % 4 === 0 && hash(x, y, seed + 1) > 0.25;
    const t = 0.62 - u * 0.32 - (groove ? 0.3 : 0) + (hash(x, y, seed + 2) > 0.9 ? 0.15 : 0);
    p.set(x, y, B[Math.max(0, Math.min(5, Math.round(t * 5 + (hash(x, y, 3) - 0.5) * 0.6)))], [u, -0.1, Math.sqrt(1 - u * u)]);
  }
  for (let i = 0; i < 7; i++) {
    const side = i % 2 ? 1 : -1, y = 6 + i * (h - 10) / 7 + hash(i, 1, seed) * 3, x = side > 0 ? x0 + w - 1 : x0;
    for (let k = 0; k < 4; k++) p.ell(x + side * (1 + hash(i, k, seed) * 2.5), y + (hash(k, i, seed) - 0.5) * 4, 1.3, 1, IV, { k: 0.45 + k * 0.05, flag: F_LEAF });
  }
  return p.done({});
}
// frames into a scene: flyers float at height h over a blob shadow, ground ones stand on their spot
function put(sc, kind, x, y, f, h = 0, left = false) {
  const fr = critterFrames(kind, left)[f], d = CRITTERS[kind];
  if (d.shadow) sc.add(shadowBlob(d.shadow), x, y, 0, y - 1);
  sc.add(nocast(fr), x, y, h);
}

// a grid of high, soft, cool-white studio lamps fills in the low golden sun (and lights the sheet at
// night), so the small creatures read while the fireflies, motes and glowing caps still bloom
function studioLamps(sc, W, H, k0 = 0.9) {
  if (sc.preset === 'noon') return;
  const k = sc.isNight ? k0 * 4.5 : k0;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) sc.light((x + 0.5) * W / 5, (y + 0.5) * H / 4 + 20, 80, 220, [0.86, 0.94, 1], k);
}

// ---- N10 wildlife -----------------------------------------------------------------------------------
export function buildWildlife(preset = 'golden') {
  const W = 372, H = 336, sc = new Scene(W, H, preset, 1010), G = sc.G;
  studio(G, 1010, [29, 41, 48]);
  // row 1: monarch, blue, sulphur butterflies, dragonflies - four frames each
  let y = 26;
  ['monarch', 'blueWing', 'sulphur', 'dragonfly'].forEach((k, g) => { for (let f = 0; f < 4; f++) put(sc, k, 14 + g * 90 + f * (k === 'dragonfly' ? 20 : 17), y, f, 8); });
  // row 2: a sparrow flock bursting out of a tree (6 frames), the pigeon standing, taking off, flying
  y = 128;
  const tree = nocast(leafyTree(7, 46, 17));
  for (let f = 0; f < 6; f++) { const x = 20 + f * 42; sc.add(shadowBlob(13), x, y + 1, 0, y - 1); sc.add(tree, x, y); sc.add(flockBurst(3)[f], x, y + 0.5); }
  for (let f = 0; f < 5; f++) put(sc, 'pigeon', 270 + f * 23, y, f, f ? 4 + f * 2 : 0);
  // row 3: seagull flaps, the heron (standing, taking off, flying), fireflies, bees
  y = 184;
  for (let f = 0; f < 4; f++) put(sc, 'seagull', 16 + f * 25, y, f, 12);
  for (let f = 0; f < 4; f++) put(sc, 'heron', 122 + f * 33, y, f, f ? 1 + f * 2 : 0);
  for (let f = 0; f < 4; f++) put(sc, 'firefly', 262 + f * 13, y, f, 10);
  for (let f = 0; f < 4; f++) put(sc, 'bee', 318 + f * 15, y, f, 10);
  // row 4: maple leaves and petals falling, golden motes, white sparkles
  y = 222;
  for (let f = 0; f < 4; f++) put(sc, 'mapleLeaf', 16 + f * 17, y, f, 7);
  for (let f = 0; f < 4; f++) put(sc, 'petal', 98 + f * 15, y, f, 7);
  for (let f = 0; f < 4; f++) put(sc, 'motes', 184 + f * 22, y, f, 4);
  for (let f = 0; f < 4; f++) put(sc, 'sparkles', 282 + f * 22, y, f, 4);
  // row 5: rain ripples, the trout leaping, the frog
  y = 272;
  for (let f = 0; f < 4; f++) put(sc, 'ripple', 18 + f * 27, y, f);
  for (let f = 0; f < 4; f++) put(sc, 'fish', 132 + f * 30, y, f);
  for (let f = 0; f < 4; f++) put(sc, 'frog', 270 + f * 26, y, f);
  // row 6: the squirrel scampering up a trunk, the rabbit hopping
  y = 330;
  const tr = nocast(trunk(5));
  for (let f = 0; f < 4; f++) { const x = 16 + f * 28; sc.add(shadowBlob(7), x, y + 1, 0, y - 1); sc.add(tr, x, y); sc.add(nocast(critterFrames('squirrel')[f]), x - 4, y + 0.5, 10 + f * 4); }
  for (let f = 0; f < 4; f++) put(sc, 'rabbit', 160 + f * 38, y, f);
  studioLamps(sc, W, H, 0.42);
  return sc.finish();
}

// ---- N9 forage --------------------------------------------------------------------------------------
// target rows: 8 mushrooms / 2 crystal caps + 3 desert finds / 3 shore finds / 6 orchard finds and gear
const ROWS = [
  ['redcap', 'goldTrumpet', 'bunCap', 'shelfOyster', 'pittedSpire', 'moonPuff', 'bluelamp', 'paleWidow'],
  ['violetPrism', 'ghostglass', 'desertRuby', 'dustSage', 'sunburstBloom'],
  ['rockMussels', 'ribbonKelp', 'spineUrchin'],
  ['wildApples', 'brambleBerries', 'meadowHerbs', 'wildHoneycomb', 'forageBasket', 'forageSack'],
];
// a patch of ground for the in-world strip
function patch(G, cx, cy, rx, ry, kind, seed) {
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2, edge = 1 + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.45;
    if (q > edge || !G.inside(x, y)) continue;
    const p = groundPixel(kind, x, y, seed);
    if (p) G.put(x, y, p.c, p.n || [0, 0, 1], 0, p.e || null, F_GROUND | F_WET | (p.water ? F_WATER : 0));
  }
}
export function buildForage(preset = 'golden') {
  const W = 360, H = 330, sc = new Scene(W, H, preset, 909), G = sc.G;
  studio(G, 909, [83, 104, 124]);
  const S = 34;
  ROWS.forEach((row, r) => {
    const step = r === 0 ? 43 : r === 1 ? 64 : r === 2 ? 100 : 56, x0 = (W - step * (row.length - 1)) / 2, y = 44 + r * 54;
    row.forEach((k, i) => sc.add(icon(k, S), x0 + i * step, y + S / 2 - 4));
  });
  // in-world strip: each find where it grows, at game scale
  const y0 = 284;
  const spots = [
    ['forest', 'redcap', 'bunCap', 'goldTrumpet'], ['forest', 'shelfOyster', 'pittedSpire', 'paleWidow'], ['grass', 'moonPuff', 'meadowHerbs', 'brambleBerries'],
    ['cave', 'violetPrism', 'ghostglass', 'bluelamp'], ['desert', 'sunburstBloom', 'desertRuby', 'dustSage'], ['shore', 'rockMussels', 'spineUrchin', 'ribbonKelp'],
    ['grass', 'wildApples', 'wildHoneycomb', 'forageBasket'],
  ];
  const GK = { forest: 'mulch', grass: 'grass', cave: 'bedrock', desert: 'desert', shore: 'sandWet' };
  spots.forEach(([kind, ...ks], i) => {
    const cx = 28 + i * 50.5, cy = y0 + 14;
    patch(G, cx, cy, 24, 15, GK[kind], 900 + i);
    if (kind === 'shore') patch(G, cx + 10, cy + 9, 12, 5, 'shallow', 77);
    ks.forEach((k, j) => sc.add(groundSprite(k, i * 3 + j), cx - 13 + j * 13 + (j === 1 ? 0 : 0), cy - 4 + (j === 1 ? 8 : 0)));
  });
  studioLamps(sc, W, H, 0.3);
  return sc.finish();
}

export const SCENES = { wildlife: buildWildlife, forage: buildForage };
export const TARGETS = { wildlife: 'N10_wildlife-ambient.png', forage: 'N9_forage.png' };
export { ITEMS, FORAGE };
