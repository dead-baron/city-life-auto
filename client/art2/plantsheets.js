// Art v2 plant sheets laid out like the E3 biome vegetation concept sheets (docs/art-v2/targets/E3a-E3f), so
// the whole flora kit (flora.js) can be checked against them in one view: each plant at true game scale on a
// flat studio-grey ground, standing on a small ragged patch of its own ground (soil, dirt, sand, desert,
// water for the wetland plants), with a person for scale. The preview page shows them as
// ?m=plantsheets&d=plantsCity|plantsForest|plantsDesert|plantsCoast|plantsFarm|plantsMountain.
import { Scene } from './scene.js';
import { groundPixel } from './ground.js';
import { hash, F_GROUND, F_WET, F_WATER } from './gbuf.js';
import { Vox } from './voxel.js';
import * as F from './flora.js';

// a flat studio-grey ground, faintly mottled
function greyGround(G, seed) {
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const v = 98 + Math.round((hash(x >> 3, y >> 3, seed) - 0.5) * 6 + (hash(x, y, seed + 1) > 0.97 ? -6 : 0));
    G.put(x, y, [v, v, v + 4], [0, 0, 1], 0, null, F_GROUND | F_WET);
  }
}
// a ragged little patch of ground under a plant
function patch(G, cx, cy, rx, ry, kind = 'dirt', seed = 1) {
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    if (!G.inside(x, y)) continue;
    const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2, edge = 1 + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.45 + (hash(x, y, seed + 3) - 0.5) * 0.2;
    if (q > edge) continue;
    const p = groundPixel(kind, x, y, seed), water = !!p.water;
    // crumbs of the patch's ground toward its rim
    if (!water && q > edge * 0.8 && hash(x, y, seed + 5) > 0.55) continue;
    G.put(x, y, p.c, p.n || [0, 0, 1], 0, p.e || null, F_GROUND | F_WET | (water ? F_WATER : 0));
  }
}
// a scene helper: place a flora sprite or Vox model with its ground patch
function placer(sc, G) {
  return (spr, x, y, rx = 0, ry = 0, kind = 'dirt', seed = 1) => {
    if (rx) patch(G, x, y + 1, rx, ry || rx * 0.42, kind, seed + x * 7 + y);
    if (spr instanceof Vox) sc.vox(spr, x, y); else sc.add(spr, x, y);
  };
}

// ---- E3a city plants ---------------------------------------------------------------------------------------
export function buildPlantsCity(preset = 'golden') {
  const sc = new Scene(491, 368, preset, 401), G = sc.G, put = placer(sc, G);
  greyGround(G, 401);
  let y = 120;
  put(F.streetTree(11), 44, y); put(F.flowerTree(12), 119, y); put(F.youngTree(13), 179, y); put(F.ginkgo(14), 234, y);
  put(F.cherryTree(15), 298, y); put(F.magnoliaTree(16), 364, y); put(F.redMaple(17), 429, y);
  sc.person(471, y, 'student', 7, 'idle', 4011);
  y = 186;
  put(F.hedge(21, 62, 22), 43, y); put(F.hedge(22, 62, 22), 116, y); put(F.topiaryBall(23), 175, y); put(F.topiaryCone(24), 214, y);
  put(F.roseBush(25), 256, y); put(F.hydrangea(26), 305, y); put(F.lavender(27), 355, y); put(F.tulipPlanter(28), 407, y); put(F.daffodilPlanter(29), 460, y);
  y = 266;
  put(F.flowerBox(31, 'stone'), 42, y); put(F.flowerBox(32, 'iron'), 114, y); put(F.ivyWall(33), 200, y); put(F.wisteriaWall(34), 312, y); put(F.roseArch(35), 428, y);
  y = 348;
  put(F.pampasGrass(41), 52, y, 30, 6, 'dirt'); put(F.wildflowerLawn(42), 198, y); put(F.crackedPaving(43), 352, y - 22);
  return sc.finish();
}

// ---- E3b forest plants ------------------------------------------------------------------------------------
export function buildPlantsForest(preset = 'golden') {
  const sc = new Scene(491, 368, preset, 402), G = sc.G, put = placer(sc, G);
  greyGround(G, 402);
  let y = 138;
  put(F.redwood(11), 46, y, 30, 9, 'dirt'); put(F.douglasFir(12), 125, y, 26, 8, 'dirt'); put(F.westernRedCedar(13), 200, y, 26, 8, 'dirt');
  put(F.blueSpruce(14), 270, y, 22, 7, 'dirt'); put(F.ponderosaPine(15), 336, y, 20, 7, 'dirt'); put(F.bigOak(16), 430, y, 30, 9, 'dirt');
  y = 238;
  put(F.mapleGreen(21), 50, y, 26, 8, 'dirt'); put(F.mapleAutumn(22), 142, y, 26, 8, 'dirt'); put(F.birchClump(23), 230, y, 24, 8, 'dirt');
  put(F.aspenGrove(24), 318, y, 24, 8, 'dirt'); put(F.nurseStump(25), 424, y, 30, 9, 'dirt');
  y = 294;
  put(F.swordFern(31), 37, y); put(F.deadBracken(32), 105, y); put(F.mossMounds(33), 176, y - 4, 26, 9, 'dirt'); put(F.mossyLog(34), 262, y - 4, 40, 9, 'dirt');
  put(F.salal(35), 342, y); put(F.huckleberry(36), 398, y); put(F.wildBerry(37), 452, y);
  y = 348;
  put(F.foxglove(41), 37, y); put(F.trillium(42), 105, y); put(F.fallenBranches(43), 190, y - 6); put(F.pineCones(44), 268, y - 6);
  put(F.leafLitter(45, 30), 339, y - 6); put(F.leafLitter(46, 28), 398, y - 6);
  sc.person(461, y, 'student', 7, 'idle', 4021);
  return sc.finish();
}

// ---- E3c desert plants ------------------------------------------------------------------------------------
export function buildPlantsDesert(preset = 'golden') {
  const sc = new Scene(491, 368, preset, 403), G = sc.G, put = placer(sc, G);
  greyGround(G, 403);
  let y = 118;
  put(F.saguaroBig(11), 39, y, 18, 6, 'desert'); put(F.saguaroMid(12), 90, y, 15, 5, 'desert'); put(F.saguaroSmall(13), 129, y, 12, 5, 'desert');
  put(F.joshuaTree(14), 188, y, 26, 8, 'desert'); put(F.ocotillo(15), 261, y, 20, 7, 'desert'); put(F.paloVerde(16), 351, y + 2, 28, 8, 'desert'); put(F.mesquite(17), 437, y + 2, 28, 8, 'desert');
  y = 200;
  put(F.pricklyPear(21), 51, y, 34, 9, 'desert'); put(F.barrelCacti(22), 142, y, 24, 8, 'desert'); put(F.cholla(23), 224, y, 24, 8, 'desert');
  put(F.agave(24), 312, y, 28, 8, 'desert'); put(F.yucca(25), 412, y, 28, 8, 'desert');
  y = 258;
  put(F.creosote(31), 42, y, 26, 8, 'desert'); put(F.sagebrush(32), 127, y, 26, 8, 'desert'); put(F.brittlebush(33), 207, y, 24, 8, 'desert');
  put(F.whiteBursage(34), 286, y, 24, 8, 'desert'); put(F.desertPoppies(35), 361, y, 24, 8, 'desert'); put(F.desertFlowers(36), 444, y, 26, 8, 'desert');
  y = 340;
  put(F.dryGrass(41, 1.4), 34, y, 20, 6, 'desert'); put(F.dryGrass(42, 1), 86, y, 15, 5, 'desert'); put(F.dryGrass(43, 0.6), 130, y, 11, 4, 'desert');
  put(F.tumbleweed(44), 178, y, 14, 5, 'desert'); put(F.deadSnag(45), 244, y, 26, 8, 'desert'); put(F.datePalm(46), 330, y, 24, 7, 'desert'); put(F.desertFanPalm(47), 402, y, 24, 7, 'desert');
  sc.person(459, y, 'student', 7, 'idle', 4031);
  return sc.finish();
}

// ---- E3d tropical and coast plants --------------------------------------------------------------------------
export function buildPlantsCoast(preset = 'golden') {
  const sc = new Scene(425, 440, preset, 404), G = sc.G, put = placer(sc, G);
  greyGround(G, 404);
  let y = 162;
  sc.person(22, y, 'student', 0, 'idle', 4041);
  put(F.coconutPalm(11), 72, y, 26, 7, 'sand'); put(F.royalPalm(12), 166, y, 22, 6, 'sand'); put(F.fanPalmSkirt(13), 262, y, 24, 7, 'sand'); put(F.leaningPalm(14), 330, y, 26, 7, 'sand');
  y = 256;
  put(F.banana(21), 50, y, 30, 7, 'dirt'); put(F.monstera(22), 113, y, 26, 6, 'dirt'); put(F.elephantEar(23), 180, y, 26, 6, 'dirt');
  put(F.birdOfParadise(24), 248, y, 26, 6, 'dirt'); put(F.hibiscus(25), 313, y, 26, 6, 'dirt'); put(F.bougainvillea(26), 383, y, 26, 6, 'dirt');
  y = 333;
  put(F.duneGrass(31), 46, y, 36, 9, 'sand'); put(F.beachGrass(32), 126, y, 34, 9, 'sand'); put(F.icePlant(33), 216, y, 48, 10, 'sand'); put(F.coastalCypress(34), 342, y, 60, 10, 'dirt');
  y = 414;
  put(F.kelpPile(41), 66, y - 6, 60, 14, 'sand'); put(F.seaweed(42), 176, y - 6, 46, 12, 'sand');
  patch(G, 322, y - 2, 86, 16, 'water', 4049); put(F.mangroves(43), 322, y - 4);
  return sc.finish();
}

// ---- E3e farm, garden and wetland plants ------------------------------------------------------------------
export function buildPlantsFarm(preset = 'golden') {
  const sc = new Scene(425, 425, preset, 405), G = sc.G, put = placer(sc, G);
  greyGround(G, 405);
  let y = 76;
  [29, 68, 108].forEach((x, i) => put(F.wheat(11 + i, i), x, y, 15, 6, 'soil'));
  [166, 207, 247].forEach((x, i) => put(F.corn(14 + i, i), x, y, 15, 6, 'soil'));
  [302, 342, 386].forEach((x, i) => put(F.cabbage(17 + i, i), x, y, 16, 6, 'soil'));
  y = 146;
  [24, 59, 98].forEach((x, i) => put(F.tomato(21 + i, i), x, y, 14, 6, 'soil'));
  [149, 190, 241].forEach((x, i) => put(F.pumpkin(24 + i, i), x, y, 18, 7, 'soil'));
  put(F.sunflowers(27), 310, y, 28, 7, 'soil'); put(F.strawberries(28), 383, y, 30, 8, 'soil');
  y = 224;
  put(F.grapevineTrellis(31), 103, y, 92, 8, 'soil'); put(F.appleTree(32), 237, y, 24, 8, 'soil'); put(F.orangeTree(33), 312, y, 24, 8, 'soil'); put(F.lemonTree(34), 383, y, 24, 8, 'soil');
  y = 298;
  put(F.floweringHedge(41), 66, y, 60, 7, 'soil'); put(F.poppies(42), 158, y, 24, 7, 'soil'); put(F.lupines(43), 210, y, 22, 7, 'soil');
  put(F.daisies(44), 264, y, 24, 7, 'soil'); put(F.tallGrass(45), 320, y, 26, 7, 'soil'); put(F.clover(46), 388, y, 28, 7, 'soil');
  y = 393;
  sc.person(22, y, 'student', 7, 'idle', 4051);
  for (const [x, f, s] of [[64, F.cattails, 51], [119, F.reeds, 52], [169, F.rushes, 53]]) { patch(G, x, y + 1, 24, 7, 'water', s); put(f(s), x, y); }
  patch(G, 230, y - 2, 34, 13, 'water', 54); put(F.lilyPads(55), 230, y - 4);
  put(F.weepingWillow(56), 303, y, 30, 8, 'soil');
  patch(G, 383, y, 32, 10, 'water', 57); put(F.cypressKnees(58), 383, y - 1);
  return sc.finish();
}

// ---- E3f mountain plants ------------------------------------------------------------------------------------
export function buildPlantsMountain(preset = 'golden') {
  const sc = new Scene(425, 425, preset, 406), G = sc.G, put = placer(sc, G);
  greyGround(G, 406);
  let y = 163;
  put(F.mountainFir(11), 47, y, 30, 8, 'dirt'); put(F.mountainPine(12), 129, y, 26, 7, 'dirt'); put(F.whitebarkPine(13), 214, y, 30, 8, 'dirt');
  put(F.goldenLarch(14), 315, y, 28, 8, 'dirt'); put(F.snowySpruce(15), 386, y + 4, 22, 7, 'dirt');
  y = 241;
  put(F.juniperMat(21), 63, y, 54, 9, 'dirt'); put(F.twistedShrub(22), 173, y, 40, 9, 'dirt'); put(F.snowyShrub(23), 281, y, 30, 8, 'dirt'); put(F.berryShrub(24), 376, y, 32, 8, 'dirt');
  y = 315;
  put(F.alpineLupine(31), 37, y, 24, 7, 'dirt'); put(F.paintbrush(32), 98, y, 24, 7, 'dirt'); put(F.columbine(33), 159, y, 24, 7, 'dirt');
  put(F.heather(34), 230, y, 26, 7, 'dirt'); put(F.alpineDaisies(35), 308, y, 28, 7, 'dirt'); put(F.buttercups(36), 385, y, 26, 7, 'dirt');
  y = 400;
  put(F.lichenBoulder(41), 44, y, 32, 8, 'dirt');
  patch(G, 139, y - 4, 44, 14, 'water', 4061); put(F.mossyCreekRocks(42), 139, y - 6);
  put(F.snowyRocks(43), 237, y, 34, 9, 'dirt'); put(F.driftwoodLog(44), 332, y - 2, 46, 9, 'dirt');
  sc.person(402, y, 'student', 7, 'idle', 4062);
  return sc.finish();
}

export const SCENES = { plantsCity: buildPlantsCity, plantsForest: buildPlantsForest, plantsDesert: buildPlantsDesert, plantsCoast: buildPlantsCoast, plantsFarm: buildPlantsFarm, plantsMountain: buildPlantsMountain };
export const TARGETS = { plantsCity: 'E3a_city-plants.png', plantsForest: 'E3b_forest-plants.png', plantsDesert: 'E3c_desert-plants.png', plantsCoast: 'E3d_tropical-coast-plants.png', plantsFarm: 'E3e_farm-garden-wetland-plants.png', plantsMountain: 'E3f_mountain-plants.png' };
