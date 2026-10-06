// Art v2 prop sheets laid out like the P1-P3 concept sheets (docs/art-v2/targets), so the whole kit can be
// checked against them in one view: P1 town props and P2 country and leisure props on a flat grey ground
// (each country prop on its own little patch of dirt and grass), P3 the nature reference on a meadow.
// Each builder returns a lit scene like the districts; the preview page shows them as
// ?d=propsTown|propsCountry|propsNature.
import { Scene, Streets } from './scene.js';
import { groundPixel, weeds, lilyPads, lawnEdge, leafLitter, towel, shoreFoam } from './ground.js';
import * as P from './props.js';
import * as D from './props-district.js';
import * as X from './props-transit.js';
import * as K from './props-park.js';
import * as U from './props-rural.js';
import * as T from './props-town.js';
import * as Q from './props-road.js';
import * as N from './props-kit.js';
import { vehicleModel } from './vehicles.js';
import { leafyTree, palm, pine, bush, blossom, maple, birch, olive, fanPalm, fern } from './trees.js';
import { hash, F_GROUND, F_WET } from './gbuf.js';
import { ramp } from './palette.js';

const PI = Math.PI;
// a flat studio-grey ground, faintly mottled
function greyGround(G, seed) {
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const v = 100 + Math.round((hash(x >> 3, y >> 3, seed) - 0.5) * 6 + (hash(x, y, seed + 1) > 0.97 ? -6 : 0));
    G.put(x, y, [v, v, v + 4], [0, 0, 1], 0, null, F_GROUND | F_WET);
  }
}
// a ragged little patch of ground under a prop (dirt with grass tufts at its rim, or sand)
function patch(G, cx, cy, rx, ry, kind = 'dirt', seed = 1) {
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2, edge = 1 + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.5;
    if (q > edge || !G.inside(x, y)) continue;
    const p = groundPixel(kind, x, y, seed); G.put(x, y, p.c, [0, 0, 1], 0, null, F_GROUND | F_WET);
  }
  if (kind !== 'sand') weeds(G, (x, y) => { const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; return q > 0.55 && q < 1.05; }, 0.12, seed + 7);
}
const car = (sc, type, x, y, hd, o = {}) => sc.vox(vehicleModel(type, o), x, y, hd);

// ---- P1 town props --------------------------------------------------------------------------------------
export function buildPropsTown(preset = 'golden') {
  const W = 620, H = 520, sc = new Scene(W, H, preset, 301), G = sc.G;
  greyGround(G, 301);
  const on = sc.lampsOn ? 1 : 0;
  // row 1: benches, bins, the dumpster, bags, a hydrant
  let y = 70;
  sc.vox(P.bench(), 50, y); sc.vox(P.bench(), 120, y, PI); sc.vox(P.wireBin(), 180, y); sc.vox(P.bin(true), 210, y);
  sc.vox(P.dumpster(), 290, y); sc.vox(D.trashBag(), 370, y); sc.vox(D.trashBag('#34343c'), 388, y + 4); sc.vox(P.hydrant(), 450, y);
  sc.vox(D.mailbox('#2f5aa8'), 510, y); sc.vox(N.parkingMeter(on), 570, y);
  // row 2: three street lamps, newsboxes, the vending machine and the phone booth
  y = 180;
  sc.vox(P.streetLamp(on), 40, y); sc.vox(P.lampPost('cast', on), 100, y); sc.vox(N.twinLamp(on), 170, y);
  for (const [x, c] of [[250, '#c8342a'], [266, '#2f5aa8'], [282, '#3a7a4a']]) sc.vox(P.newsBox(c), x, y);
  sc.vox(N.vendingMachine('#c8242a', 1), 350, y); sc.vox(N.vendingMachine('#2f5aa8', 1), 390, y); sc.vox(N.phoneBooth(1), 450, y);
  sc.vox(N.atmWall(1), 540, y);
  // row 3: the bus shelter, a planter, bollards, the bike rack, cones
  y = 290;
  sc.vox(D.busShelter(64, on), 60, y); sc.vox(D.planterBox(40, 20, true), 150, y);
  for (const [x, k] of [[200, 'concrete'], [216, 'banded'], [232, 'cast']]) sc.vox(N.bollardKind(k), x, y); sc.vox(Q.guardPost(), 248, y);
  sc.vox(X.bikeRack(3), 310, y); car(sc, 'bicycle', 300, y + 4, 0, { parked: true, paint: '#2f5aa8' });
  sc.vox(X.cone(), 390, y); sc.vox(X.cone(), 408, y + 2); sc.vox(N.coneDown(), 432, y + 2, 0.4);
  sc.vox(N.sawhorse(1), 500, y); sc.vox(N.jerseyBarrier(48, true), 570, y);
  // row 4: pallets, drums, tyres, the cable reel, an unpainted barrier
  y = 390;
  for (let k = 0; k < 3; k++) sc.vox(D.pallet(), 50, y, 0, k * 6, y);
  sc.vox(D.oilDrum('#2f5a9a', 1), 110, y); sc.vox(D.oilDrum('#b83a2a', 1), 126, y + 2); sc.vox(N.drumSide('#3a6a4a'), 150, y + 4, 0.3);
  sc.vox(D.tires(4), 210, y); sc.vox(D.tires(1), 232, y + 2); sc.vox(N.cableSpool(), 290, y);
  sc.vox(N.jerseyBarrier(48, false), 370, y); sc.vox(Q.trolley(), 440, y); sc.vox(D.cardboard(), 490, y); sc.vox(P.crate(1), 530, y); sc.vox(P.crate(2), 560, y);
  // row 5: the hot-dog cart, a café set, the chain-link panel with weeds
  y = 480;
  sc.vox(P.hotdogCart(on), 60, y); sc.vox(P.umbrella('#e8c040', '#c8342a'), 60, y - 4, 0, 18, y - 4);
  sc.vox(P.cafeTable(), 160, y); sc.vox(P.umbrella('#2f7a5c', '#f0ece4'), 160, y); sc.vox(D.patioChair('#2f5a3a'), 140, y + 2); sc.vox(D.patioChair('#2f5a3a'), 180, y + 2);
  sc.vox(D.fence('chain', 70), 280, y); sc.add(bush(31, 9), 252, y + 2); sc.add(bush(32, 8), 310, y + 3);
  sc.vox(Q.handTruck(2), 360, y); sc.vox(Q.steamVent(), 410, y); sc.vox(Q.wallLamp(on), 450, y); sc.vox(Q.produceStand(40), 510, y);
  sc.person(580, y, null, 0, 'idle', 3011);
  return sc.finish();
}

// ---- P2 country and leisure props ------------------------------------------------------------------------
export function buildPropsCountry(preset = 'golden') {
  const W = 640, H = 600, sc = new Scene(W, H, preset, 302), G = sc.G;
  greyGround(G, 302);
  const put = (m, x, y, rx = 22, ry = 9, kind = 'dirt', hd = 0) => { patch(G, x, y + 2, rx, ry, kind, x * 7 + y); sc.vox(m, x, y, hd); };
  // row 1: three dome tents, the campfire, a picnic table
  let y = 70;
  put(N.domeTent('#3a7a3a', 1), 50, y); put(N.domeTent('#e0702e', 2), 130, y); put(N.domeTent('#2f5a9a', 1), 210, y);
  put(U.campfire(1), 300, y, 18, 8); sc.light(300, y, 14, 70, [1, 0.55, 0.25], sc.isNight ? 2.4 : 0.9);
  put(U.picnicTable(), 390, y, 28, 12); put(N.ruralMailbox(), 470, y, 10, 5); put(U.fingerPost(), 530, y, 14, 6); put(U.trough(), 600, y, 22, 8);
  // row 2: the power pole, the cell tower, a wind turbine, the pump jack, tanks, solar panels
  y = 250;
  put(N.transformerPole(110), 40, y, 12, 6); put(N.cellTower(150), 110, y, 20, 10); put(U.windTurbine(150, 46, 0.4), 190, y, 14, 7);
  put(U.pumpJack(0.3), 290, y, 40, 14); put(X.storageTank(26, 60, '#c8c0b0'), 380, y, 32, 14); put(U.propaneTank(), 470, y, 36, 10);
  for (let k = 0; k < 3; k++) sc.vox(T.solarPanel(30, 20), 540 + k * 32, y); patch(G, 572, y + 4, 52, 12, 'dirt', 77);
  // row 3: the outdoor screen, hay bales, a stack of logs, boulders
  y = 380;
  put(N.outdoorScreen(110, 50), 80, y, 70, 10, 'grass');
  patch(G, 230, y + 2, 34, 12, 'dirt', 91); sc.vox(U.hayBale(), 216, y); sc.vox(U.hayBale(), 242, y); sc.vox(U.hayBale(), 229, y - 2, 0, 14, y);
  put(N.logs('pile'), 320, y, 34, 11); put(N.logs('fallen'), 410, y, 34, 10, 'grass');
  patch(G, 520, y + 2, 44, 14, 'dirt', 93); sc.vox(D.boulder(5, 26, '#8a8478'), 505, y); sc.vox(D.boulder(6, 16, '#8a8478'), 535, y + 4); sc.vox(D.boulder(7, 11, '#8a8478'), 556, y + 8); sc.vox(D.boulder(8, 9, '#8a8478'), 488, y + 10);
  // row 4: fences (picket, split rail, barbed wire), a billboard
  y = 470;
  put(D.fence('picket', 60), 50, y, 36, 6, 'grass'); put(N.fenceKind('rail', 60), 140, y, 36, 6, 'grass'); put(N.fenceKind('barbed', 60), 230, y, 36, 6, 'grassDry');
  put(U.woodpile(), 330, y, 20, 8); put(U.windsock(), 400, y, 12, 6); put(U.scarecrow(), 470, y, 14, 6, 'grassDry'); put(U.wheelbarrow(), 540, y, 18, 7); put(U.hayBale(true), 600, y, 16, 7);
  // row 5: the beach set (umbrella, towel, cooler), the lifeguard chair, the rowboat, a tackle box with a rod
  y = 560;
  patch(G, 70, y, 50, 18, 'sand', 95); towel(G, 50, y - 8, 22, 12, [[70, 140, 200], [240, 236, 228]]); sc.vox(P.umbrella('#e8c040', '#c8342a'), 70, y - 6); sc.vox(K.cooler('#2f6ab0'), 98, y + 2);
  patch(G, 190, y, 30, 16, 'sand', 96); sc.vox(N.lifeguardChair(), 190, y);
  patch(G, 320, y, 50, 16, 'sand', 97); sc.vox(N.rowboat('#2f5a8a'), 320, y, -0.15);
  put(N.tackleBox(), 440, y, 24, 8, 'grass');
  sc.person(520, y, 'farmer', 0, 'idle', 3021); sc.person(560, y, 'surfer', 0, 'idle', 3022);
  return sc.finish();
}

// ---- P3 nature reference ----------------------------------------------------------------------------
export function buildPropsNature(preset = 'golden') {
  const W = 680, H = 620, sc = new Scene(W, H, preset, 303), G = sc.G;
  const S = new Streets(W, H, { lotKind: 'grass' });
  S.zone('soil', { blob: { cx: 110, cy: 520, rx: 108, ry: 64, seed: 4, wob: 0.15 } });
  S.zone('water', { blob: { cx: 96, cy: 528, rx: 100, ry: 58, seed: 4, wob: 0.15 } });
  S.zone('desert', { blob: { cx: 300, cy: 520, rx: 80, ry: 56, seed: 6, wob: 0.2 } });
  S.zone('dirt', { path: [[460, 450], [470, 520], [450, 600], [470, 620]], width: 22 });
  S.zone('plowed', { x: 560, y: 450, w: 100, h: 160 });
  S.build(); S.paint(G, 303);
  const isPond = (x, y) => S.kind(x, y) === 'water';
  lilyPads(G, isPond, 28, 303); shoreFoam(G, isPond, 31);
  lawnEdge(G, (x, y) => S.kind(x, y) === 'grass');
  weeds(G, (x, y) => S.kind(x, y) === 'grass', 0.02, 304);
  // wildflowers scattered through the grass
  for (let i = 0; i < 900; i++) { const x = Math.floor(hash(i, 1, 305) * W), y = Math.floor(hash(i, 2, 305) * H); if (S.kind(x, y) !== 'grass') continue; const c = [[240, 236, 220], [236, 196, 70], [190, 140, 220], [232, 120, 150]][i % 4]; G.put(x, y, c, [0, 0, 1], 1, null, F_GROUND); }
  leafLitter(G, [[160, 140]], 46);
  // row 1: oak, autumn maple, spruce, birch, cherry blossom
  let y = 150;
  sc.add(leafyTree(31, 130, 48), 70, y); sc.add(maple(32, 126, 46), 200, y); sc.add(pine(33, 150, 34), 320, y); sc.add(birch(34, 130, 32), 440, y); sc.add(blossom(35, 124, 48), 580, y);
  // row 2: fan palm, coconut palm, olive, bushes, a hedge, a fern
  y = 290;
  sc.add(fanPalm(36, 60), 50, y); sc.add(palm(37, 100), 140, y); sc.add(olive(38, 86, 42), 240, y);
  sc.add(bush(39, 20), 340, y); sc.add(bush(40, 20, { flowers: '#e8508a' }), 410, y); sc.vox(P.hedge(70, 18), 510, y); sc.add(fern(41, 28), 620, y);
  // row 3: meadow, wheat, corn, cabbages, sunflowers
  y = 400;
  sc.vox(N.meadow(80, 40, 42), 60, y); sc.vox(N.wheatPatch(80, 40, 43), 180, y); sc.vox(U.cornField(80, 44, 44), 300, y); sc.vox(N.cabbages(3, 3), 412, y - 4);
  sc.vox(U.sunflowers(7, 45), 520, y); sc.vox(U.sunflowers(6, 46), 548, y + 4); sc.vox(U.sunflowers(6, 47), 580, y); sc.vox(N.meadow(40, 24, 48), 630, y);
  // row 4: the pond with cattails and rocks, a desert patch, the grassy path, ploughed rows
  y = 520;
  for (const [x, yy, s] of [[180, 488, 1], [200, 520, 2], [170, 560, 3], [40, 470, 4]]) sc.vox(K.reeds(s, 22), x, yy);
  for (const [x, yy, s] of [[196, 548, 1], [150, 580, 2], [60, 586, 3]]) sc.vox(D.boulder(s + 70, 10 + s * 2, '#8a8478'), x, yy);
  sc.vox(U.saguaro(3, 60), 290, 510); sc.vox(U.barrelCactus(), 300, 548); sc.vox(N.pricklyPear(2), 340, 540); sc.vox(D.boulder(81, 10, '#a8907a'), 260, 556); sc.vox(D.boulder(82, 7, '#a8907a'), 344, 500);
  for (const [x, yy] of [[250, 490], [330, 570], [270, 584]]) sc.add(bush(90 + x, 8, { ramp: ramp('#a8985a', 7, 3, { dark: 0.6, light: 0.5 }) }), x, yy);
  const FL = ['#f0f0e8', '#e8c040', '#b88ad8', '#e87a9a'];
  sc.vox(N.meadow(36, 120, 49, FL, 0.5), 420, 540); sc.vox(N.meadow(36, 120, 50, FL, 0.5), 506, 540);
  sc.vox(N.meadow(18, 150, 51, FL, 0.5), 552, 530); sc.vox(N.meadow(18, 150, 52, FL, 0.5), 668, 530);
  sc.person(380, 470, 'farmer', 0, 'idle', 3031);
  return sc.finish();
}

export const PROP_SCENES = { propsTown: buildPropsTown, propsCountry: buildPropsCountry, propsNature: buildPropsNature };
export const PROP_TARGETS = { propsTown: 'P1-A_town-props.png', propsCountry: 'P2-B_country-props.png', propsNature: 'P3-B_nature.png' };
