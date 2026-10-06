// Art v2 district scenes, part 3: the country and the civic centre, built to the D12, D13, D14 and
// D15 (A and B) targets - the farm, the desert crossroads, the forest lake and quarry, and the civic
// centre. Same composer and conventions as districts.js (768 x 512 world px).
//
// EVERY_DISTRICT[name](preset) -> { G, lights }; EVERY_TARGET[name] -> the target image file
import { Scene, Streets } from './scene.js';
import { laneLine, zebra, manhole, drain, wear, weeds, leafLitter, treeGrate, puddle, litter, stain, lawnEdge, shoreFoam, parkingLines, ruts, pavementCracks } from './ground-warped.js';
import * as P from './props.js';
import * as D from './props-district.js';
import * as X from './props-transit.js';
import * as K from './props-park.js';
import * as U from './props-rural.js';
import { vehicleModel } from './vehicles.js';
import { animalModel } from './animals.js';
import { makeBuilding } from './buildings.js';
import { palm, leafyTree, bush, cypress, pine } from './trees.js';
import { MAT, LIGHT } from './palette.js';
import { hash } from './gbuf.js';
import { DW, DH, car, lamp, tree, fenceRun, hedgeRun } from './districts.js';
import { ALL_DISTRICTS, ALL_TARGETS } from './districts2.js';

const PI = Math.PI;
const pet = (sc, kind, x, y, hd = 0, o = {}) => sc.vox(animalModel(kind, o), x, y, hd);
function poles(sc, pts, h = 120) {
  for (const [x, y] of pts) sc.vox(D.powerPole(h, 14), x, y, 0, 0, y, 'pole' + h);
  for (let i = 1; i < pts.length; i++) for (const [dx] of D.poleTops(h, 14).slice(0, 2)) sc.wire(pts[i - 1][0] + dx, pts[i - 1][1], h - 1, pts[i][0] + dx, pts[i][1], h - 1, 12);
}

// ---- D13 farm: wheat and a combine, a pasture with cows, corn, the farmhouse, the barn and silo --------
export function buildFarm(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 13, {x: [[338, 410, 140]], y: [[195, 255, 100]], walk: 1, grow: 1.3}), G = sc.G;
  const S = new Streets(DW, DH, { lotKind: 'grass' });
  const road = [[384, 0], [372, 200], [364, 512]], lane = [[370, 214], [560, 222], [768, 232]];
  S.zone('wheat', { x: 0, y: 0, w: 306, h: 190 });
  S.zone('dirt', { x: 0, y: 206, w: 306, h: 4 });
  S.zone('plowed', { x: 470, y: 446, w: 298, h: 66 });
  S.zone('dirt', { poly: [[440, 240], [768, 246], [768, 440], [470, 440], [440, 330]] });
  S.zone('dirtRoad', { path: road, width: 66 }); S.zone('dirtRoad', { path: lane, width: 46 });
  S.zone('paver', { x: 560, y: 150, w: 20, h: 60 });
  S.build(); S.paint(G, 13);
  ruts(G, road, 24); ruts(G, lane, 20);
  weeds(G, (x, y) => S.kind(x, y) === 'grass' && (S.kind(x, y + 3) !== 'grass' || S.kind(x + 3, y) !== 'grass'), 0.2, 131);
  // fields: the combine in the wheat, a scarecrow; the corn block
  car(sc, 'combine', 150, 96, 0, { parked: true }); sc.vox(U.scarecrow(), 70, 176);
  sc.vox(U.cornField(296, 104, 3), 150, 460);
  fenceRun(sc, 'wood', 0, 196, 306, 196, { color: '#7a5a3a' }); fenceRun(sc, 'wood', 306, 210, 306, 396, { color: '#7a5a3a' }); fenceRun(sc, 'wood', 0, 396, 306, 396, { color: '#7a5a3a' });
  // the pasture: cows, a trough, a field shelter, a shade tree
  for (const [x, y, hd, ph] of [[60, 300, 0.3, 0], [140, 280, -0.4, 0.3], [200, 340, PI + 0.2, 0.6], [110, 360, 0.1, 0.1]]) pet(sc, 'cow', x, y, hd, { phase: ph, pose: hd > 3 ? 'graze' : 'stand' });
  sc.vox(U.trough(), 250, 300); sc.building({ w: 90, d: 50, style: 'siding', wallColor: '#8a6a4a', seed: 131, roof: 'flat', height: 40, blank: true }, 0, 270);
  tree(sc, 60, 250, 132, 140, 56);
  // the farmhouse with its porch, yard, tyre swing tree, windmill and washing line
  sc.building({ w: 210, d: 120, floors: 2, style: 'siding', wallColor: '#e4e0d4', pitch: 'gable', ridge: 'ns', slope: 0.6, roof: 'shingle', roofColor: '#5a5e6a', seed: 133, chimney: true, doors: [{ x: 96, w: 18, kind: 'door', open: true }], windows: [30, 60, 140, 170], shutters: '#3a4a5a', porchLight: true }, 470, 150);
  sc.vox(U.porch(150, 24, 46), 575, 162); sc.person(620, 156, 'farmer', 0, 'idle', 1331);
  for (const [x, s] of [[488, 1], [520, 2], [640, 3], [668, 4]]) sc.vox(P.flowerBed(26), x, 176, 0, 0, 176, 'fb26');
  tree(sc, 430, 150, 134, 150, 60); sc.vox(D.mailbox('#2c3a66'), 420, 236);
  sc.vox(U.windmill(120), 740, 140); sc.vox(P.laundryLine(70), 710, 100); sc.vox(U.woodpile(), 700, 190);
  fenceRun(sc, 'wood', 440, 244, 540, 244, { color: '#7a5a3a' }); fenceRun(sc, 'wood', 600, 244, 768, 244, { color: '#7a5a3a' });
  pet(sc, 'shepherd', 560, 200, 0.6, { phase: 0.4 }); sc.person(500, 230, 'farmer', 2, 'walk', 1332);
  sc.vox(U.sunflowers(7, 1), 452, 236); sc.vox(U.sunflowers(6, 2), 700, 236);
  // the yard: gate arch, the barn and silo, bales, barrels, a wheelbarrow, the tractor ploughing
  sc.vox(U.gateArch(80), 490, 262, PI / 2);
  sc.building({ w: 170, d: 130, style: 'siding', wallColor: '#a8342e', pitch: 'gable', ridge: 'ns', slope: 0.6, roof: 'shingle', roofColor: '#6a6a70', seed: 134, doors: [{ x: 50, w: 70, kind: 'garage', open: true, h: 64 }], windows: [20, 140] }, 560, 420);
  sc.vox(X.storageTank(30, 150, '#a8acb0'), 746, 410);
  for (const [x, y, r] of [[530, 400, 0], [546, 414, 0], [700, 430, 1], [520, 430, 1]]) sc.vox(U.hayBale(!!r), x, y, r ? 0.4 : 0);
  sc.vox(D.oilDrum('#8a5a3a'), 730, 440); sc.vox(D.oilDrum('#8a5a3a'), 742, 446); sc.vox(U.wheelbarrow(), 660, 432, 0.3);
  fenceRun(sc, 'wood', 470, 440, 768, 440, { color: '#7a5a3a' });
  car(sc, 'tractor', 640, 482, 0.05, { parked: true }); sc.vox(U.plough(), 588, 480, 0.05); sc.person(580, 456, 'farmer', 2, 'walk', 1333);
  sc.vox(U.sunflowers(6, 3), 430, 480); sc.vox(U.sunflowers(5, 4), 440, 420);
  // the road: a pickup with crates, a car, power poles and wires
  car(sc, 'pickup', 364, 420, PI / 2, { cargo: [1, 1, 2], paint: '#2c3040' }); car(sc, 'sedan', 382, 90, -PI / 2, { paint: '#8a2e2e' });
  poles(sc, [[330, 20], [326, 250], [322, 480]], 124);
  for (const [x, y, s] of [[320, 140, 1], [330, 330, 2], [420, 350, 3], [420, 120, 4], [20, 220, 5]]) sc.add(bush(700 + s, 14 + (s % 3) * 3, { flowers: s % 2 ? '#e8c040' : null }), x, y);
  if (sc.lampsOn) sc.light(600, 300, 40, 90, LIGHT.warmWindow, sc.isNight ? 1.8 : 0.4);
  return sc.finish();
}

// ---- D14 desert: a diner and fuel stop at the crossroads, pump jacks, an airstrip, mesas and cacti ------
export function buildDesert(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 14, {x: [[168, 242, 192]], y: [[270, 340, 192]], walk: 1}), G = sc.G;
  const S = new Streets(DW, DH, { corner: 10, sidewalk: 0, roadKind: 'asphaltWorn', lotKind: 'desert' });
  S.road(168, 0, 74, DH).road(0, 270, DW, 70);
  S.zone('driveway', { x: 270, y: 130, w: 440, h: 132 });
  S.zone('asphaltWorn', { x: 600, y: 20, w: 168, h: 70 });
  S.zone('dirtRoad', { path: [[0, 160], [80, 200], [168, 220]], width: 30 });
  S.zone('dirtRoad', { path: [[420, 340], [470, 420], [560, 512]], width: 26 });
  S.build(); S.paint(G, 14);
  wear(G, 168, 0, 74, DH, 1.2, 141); wear(G, 0, 270, DW, 70, 1.4, 143);
  for (const x of [201, 206]) { laneLine(G, x, 0, 262, false, { yellow: true, wear: 0.3 }); laneLine(G, x, 348, 164, false, { yellow: true, wear: 0.3 }); }
  for (const y of [303, 308]) { laneLine(G, 0, y, 160, true, { yellow: true, wear: 0.3 }); laneLine(G, 250, y, 518, true, { yellow: true, wear: 0.3 }); }
  laneLine(G, 620, 54, 140, true, { dash: 14, gap: 10 });
  ruts(G, [[420, 340], [470, 420], [560, 512]], 14);
  stain(G, 520, 220, 14, 6); stain(G, 600, 240, 10, 5);
  // the mesas
  sc.vox(U.mesa(170, 120, 92, 1), 60, 110); sc.vox(U.mesa(160, 110, 80, 2), 40, 470); sc.vox(U.mesa(220, 130, 104, 3), 640, 500);
  // the diner, the forecourt canopy and pumps, the garage
  const diner = sc.building({ w: 150, d: 76, style: 'diner', seed: 141, roof: 'flat', shop: { kind: 'diner', awning: null, door: 'right', open: true, people: 5 }, trim: [255, 70, 90], neon: { icon: 'cup', col: [255, 240, 220], x: 60, y: -6 } }, 300, 224);
  sc.onRoof(diner, P.roofAC(), 30, 30); sc.onRoof(diner, P.roofVent(), 100, 40);
  sc.vox(U.fuelCanopy(140, 76, 52, sc.lampsOn), 530, 196);
  for (const x of [490, 570]) sc.vox(U.fuelPump('#c8342e', sc.lampsOn), x, 206, 0, 0, 206, 'pump');
  for (const x of [510, 590]) sc.vox(U.fuelPump('#2e7a4e', sc.lampsOn), x, 206, 0, 0, 206, 'pumpG');
  if (sc.lampsOn) sc.light(530, 200, 46, 120, [1, 0.97, 0.9], sc.isNight ? 2.4 : 0.5);
  sc.building({ w: 96, d: 80, style: 'concrete', seed: 142, roof: 'flat', grime: 0.5, doors: [{ x: 40, w: 48, kind: 'roller' }], windows: [10] }, 610, 210);
  sc.vox(U.propaneTank(), 728, 220); sc.vox(D.tires(3), 704, 236); sc.vox(D.oilDrum('#c8442e', 1), 716, 250);
  car(sc, 'pickup', 680, 250, PI, { paint: '#a8342e', parked: true }); car(sc, 'sedan', 540, 236, PI / 2, { paint: '#3a4a3a', parked: true });
  car(sc, 'bike', 610, 254, -1.2, { paint: '#2a2a30', parked: true }); car(sc, 'bike', 630, 258, -1.3, { paint: '#8a2e2e', parked: true });
  for (const [x, y, k, d] of [[300, 234, 'trucker', 0], [390, 244, 'farmer', 2], [450, 240, null, 0], [560, 220, 'mechanic', 6], [650, 236, 'trucker', 0], [620, 230, 'punk', 0]]) sc.person(x, y, k, d, 'idle', x * 3 + y);
  for (const x of [380, 420]) sc.vox(P.planter(), x, 230, 0, 0, 230, 'planter');
  sc.building({ w: 60, d: 6, style: 'stucco', wallColor: '#2c3a4e', seed: 143, height: 42, blank: true, plaques: [{ text: 'EATS', x: 6, v: 12, sx: 3, fg: [255, 210, 120], lit: true }] }, 248, 262);
  // oil: pump jacks behind a fence, a flare stack; the water tower; the airstrip with a plane and windsock
  sc.vox(U.pumpJack(0.1), 400, 60); sc.vox(U.pumpJack(0.6), 480, 90); sc.vox(U.flareStack(1), 540, 50); if (sc.lampsOn || 1) sc.light(540, 50, 90, 80, LIGHT.fire, sc.isNight ? 2 : 0.6);
  fenceRun(sc, 'wood', 360, 112, 560, 112, { color: '#8a6a48' });
  sc.vox(U.waterTower(90), 620, 130); car(sc, 'plane', 700, 54, PI, { parked: true }); sc.vox(U.windsock(), 748, 104);
  // roadside: signs, cacti, shrubs, a trail board, power poles
  sc.vox(U.roadSign('arrow'), 510, 380); sc.vox(U.roadSign('curve'), 150, 380); sc.vox(K.parkSign('#6a4a30'), 90, 250);
  car(sc, 'pickup', 60, 236, 0.2, { paint: '#a87a4a', parked: true });
  for (const [x, y, s, h] of [[100, 190, 1, 52], [120, 400, 2, 60], [30, 470, 3, 48], [690, 380, 4, 56], [740, 30, 5, 50], [300, 470, 6, 44], [470, 470, 7, 58], [20, 30, 8, 46]]) sc.vox(U.saguaro(s, h), x, y);
  for (const [x, y] of [[260, 420], [380, 470], [560, 380], [120, 230], [720, 390]]) sc.vox(U.barrelCactus(), x, y, 0, 0, y, 'barrel');
  for (let i = 0; i < 30; i++) { const x = hash(i, 1, 141) * DW, y = hash(i, 2, 141) * DH, k = S.kindD(x | 0, y | 0); if (k === 'desert') sc.add(bush(900 + i, 7 + (i % 4) * 2, { ramp: MAT.leafDark }), x, y); }
  poles(sc, [[150, 0], [150, 250], [150, 500]], 118); poles(sc, [[260, 360], [520, 356], [768, 352]], 118);
  // traffic
  car(sc, 'sedan', 200, 304, 0, { paint: '#3a5a8a' }); car(sc, 'suv', 640, 306, PI, { paint: '#a83030' }); car(sc, 'suv', 222, 90, -PI / 2, { paint: '#c8c8c4' });
  return sc.finish();
}

// ---- D15 forest: a lake with a dock and boathouse, a campsite, the lookout, a river bridge, the quarry ---
export function buildForest(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 15, {walk: 1.5}), G = sc.G;
  const S = new Streets(DW, DH, { lotKind: 'grass' });
  const trail = [[280, 240], [420, 300], [520, 300], [600, 380], [640, 512]], road = [[440, 196], [600, 176], [768, 150]];
  const river = [[600, 0], [640, 110], [680, 200], [740, 280], [790, 320]];
  S.zone('water', { blob: { cx: 90, cy: 430, rx: 220, ry: 150, seed: 9, wob: 0.12 } });
  S.zone('dirt', { blob: { cx: 220, cy: 150, rx: 150, ry: 80, seed: 4, wob: 0.15 } });
  S.zone('gravel', { poly: [[560, 330], [768, 300], [768, 512], [600, 512]] });
  S.zone('dirtRoad', { path: trail, width: 30 }); S.zone('dirtRoad', { path: road, width: 44 });
  S.zone('water', { path: river, width: 46 });
  S.zone('dock', { x: 60, y: 300, w: 90, h: 50 }); S.zone('dock', { x: 110, y: 350, w: 30, h: 60 });
  S.build(); S.paint(G, 15);
  const isWater = (x, y) => S.kind(x, y) === 'water';
  shoreFoam(G, isWater, 151);
  ruts(G, road, 18);
  weeds(G, (x, y) => S.kind(x, y) === 'grass' && hash(x >> 2, y >> 2, 3) > 0.6, 0.06, 151);
  // the lake: boathouse, dock, rowboat, rocks, reeds, someone fishing
  sc.building({ w: 110, d: 60, style: 'siding', wallColor: '#7a5a40', pitch: 'gable', slope: 0.5, roof: 'shingle', roofColor: '#3e6a5a', seed: 151, doors: [{ x: 40, w: 40, kind: 'garage', open: true, h: 40 }], windows: [10] }, 40, 300);
  for (const [x, y] of [[62, 348], [148, 348], [112, 408], [138, 408]]) sc.vox(P.piling(26), x, y, 0, 0, y, 'pile26');
  car(sc, 'dinghy', 190, 390, PI / 2 + 0.3, { parked: true }); sc.person(126, 396, 'farmer', 0, 'idle', 1511); sc.vox(K.cooler('#c8342e'), 120, 370);
  for (const [x, y, s, z] of [[250, 330, 1, 26], [290, 400, 2, 22], [300, 470, 3, 30], [230, 500, 4, 20], [320, 360, 5, 16], [200, 280, 6, 18]]) sc.vox(D.boulder(s + 150, z, '#8a8680'), x, y);
  for (const [x, y, s] of [[260, 300, 1], [310, 430, 2], [210, 500, 3]]) sc.vox(K.reeds(s + 20), x, y);
  // the campsite: tents, the fire ring with campers, a table, the pickup with gear, a dog
  sc.vox(U.tent('#e0702e'), 170, 112); sc.vox(U.tent('#4a7a4a'), 100, 160, 0.4);
  sc.vox(U.campfire(1), 240, 180); sc.light(240, 178, 18, 110, LIGHT.fire, sc.isNight ? 3 : 1.2);
  for (const [x, y, hd, c] of [[214, 172, 0, '#2e6a3e'], [266, 170, PI, '#a8342e'], [230, 202, -PI / 2, '#2e4a7a']]) { sc.vox(U.campChair(c), x, y, hd); }
  sc.person(214, 174, null, 2, 'idle', 1512); sc.person(266, 172, null, 6, 'idle', 1513); sc.person(286, 196, 'dad', 6, 'idle', 1514); pet(sc, 'golden', 300, 210, PI, { pose: 'sit' });
  sc.vox(U.picnicTable(), 150, 214); car(sc, 'pickup', 330, 110, -0.25, { cargo: [1, 2], paint: '#8a2e2e', parked: true });
  // the lookout: a rail at the drop, the map board, a hiker; the finger post; a hiker and dog on the trail
  sc.vox(U.mapBoard(), 430, 260); fenceRun(sc, 'wood', 470, 262, 540, 262, { color: '#6a4a30' }); sc.person(520, 270, 'surfer', 4, 'idle', 1515);
  sc.vox(U.fingerPost(), 600, 330); sc.person(560, 330, 'tourist', 2, 'walk', 1516); pet(sc, 'lab', 586, 344, 0.6, { phase: 0.2 });
  // the forest road and its bridge over the river
  sc.vox(K.archBridge(110, 46, 6), 690, 164, -0.15 + PI / 2 * 0); car(sc, 'pickup', 520, 188, -0.12, { paint: '#3a5a3a' });
  // the quarry: terraces, an excavator, a dump truck, the site hut behind a fence, floodlight, turbines on the ridge
  sc.vox(U.terrace(220, 56, 44, 1), 664, 360); sc.vox(U.terrace(200, 50, 28, 2), 680, 440);
  car(sc, 'excavator', 700, 488, PI + 0.4, { parked: true }); car(sc, 'dumptruck', 610, 478, -0.4, { parked: true });
  sc.building({ w: 60, d: 40, style: 'corrugated', wallColor: '#8a9aa8', seed: 152, roof: 'flat', doors: [{ x: 20, w: 16, kind: 'door' }], windows: [] }, 700, 330);
  sc.vox(X.floodMast(110, sc.lampsOn), 640, 330); fenceRun(sc, 'chain', 560, 320, 690, 320);
  sc.vox(U.windTurbine(150, 56, 0.4), 740, 70); sc.vox(U.windTurbine(150, 56, 1.1), 560, 40);
  // the forest: pines everywhere that is still grass, with ferns and flowers under them
  let n = 0;
  for (let i = 0; i < 400 && n < 46; i++) {
    const x = hash(i, 1, 155) * DW, y = hash(i, 2, 155) * DH;
    let ok = !(x > 40 && x < 380 && y > 50 && y < 300) && !(x > 390 && x < 560 && y > 220 && y < 310) && !(x > 520 && y < 120 && Math.abs(x - 560) < 30);
    for (const [dx, dy] of [[0, 0], [26, 0], [-26, 0], [0, 18], [0, -14], [18, 14], [-18, 14]]) if (S.kindD((x + dx) | 0, (y + dy) | 0) !== 'grass') ok = false;
    if (!ok) continue;
    n++; sc.add(pine(160 + i, 110 + hash(i, 3, 155) * 70, 24 + hash(i, 4, 155) * 10), x, y);
  }
  for (let i = 0; i < 40; i++) { const x = hash(i, 5, 155) * DW, y = hash(i, 6, 155) * DH; if (S.kindD(x | 0, y | 0) === 'grass') sc.add(bush(990 + i, 8 + (i % 3) * 3, { flowers: i % 4 === 0 ? '#c85ad8' : null }), x, y); }
  return sc.finish();
}

// ---- D12 civic centre: hospital, courthouse and city hall, the statue plaza, the police station --------
export function buildCivic(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 12, {x: [[296, 330, 96], [330, 402, 192], [402, 436, 96]], y: [[266, 300, 96], [300, 372, 280], [372, 406, 96]], walk: 2.823529411764706, grow: 1.5}), G = sc.G;
  const S = new Streets(DW, DH, { corner: 20, sidewalk: 34, lotKind: 'stoneTile' });
  S.road(0, 300, DW, 72).road(330, 372, 72, DH - 372);
  S.zone('plaza', { x: 0, y: 406, w: 330, h: 106 });
  S.zone('asphalt', { x: 436, y: 406, w: 332, h: 106 });
  S.zone('mulch', { x: 110, y: 430, w: 120, h: 14 }); S.zone('mulch', { x: 110, y: 490, w: 120, h: 14 });
  S.build(); S.paint(G, 12);
  wear(G, 0, 300, DW, 72, 0.5, 121);
  laneLine(G, 0, 334, 300, true, { yellow: true }); laneLine(G, 0, 339, 300, true, { yellow: true }); laneLine(G, 420, 334, 348, true, { yellow: true }); laneLine(G, 420, 339, 348, true, { yellow: true });
  zebra(G, 300, 306, 26, 60, false, 41); zebra(G, 406, 306, 26, 60, false, 43); zebra(G, 336, 378, 60, 24, true, 45);
  parkingLines(G, 460, 420, 5, 60, 80); manhole(G, 220, 336, 7); drain(G, 140, 296, 14, 5);
  // the north row: hospital (emergency bay, roof helipad), courthouse with portico and lions, city hall
  const hosp = sc.building({ w: 190, d: 150, floors: 2, style: 'concrete', seed: 121, roof: 'flat', parapet: 6, doors: [{ x: 60, w: 50, kind: 'door', open: true, h: 48 }], windows: [10, 130, 160], plaques: [{ text: 'HOSPITAL', x: 40, v: 88, sx: 2 }, { text: 'EMERGENCY', x: 50, v: 54, sx: 1, bg: '#c8343a', fg: [250, 246, 240], lit: true }], cross: { x: 14, v: 100, s: 22 } }, 0, 220);
  sc.onRoof(hosp, U.helipad(44), 100, 70); sc.onRoof(hosp, P.roofAC(), 30, 30);
  sc.vox(D.canopy(70, 30, '#c8343a', sc.lampsOn, 44), 86, 238); car(sc, 'ambulance', 86, 262, PI / 2, { siren: false, parked: true }); sc.person(130, 250, 'medic', 6, 'idle');
  const court = sc.building({ w: 260, d: 140, floors: 2, style: 'stone', wallColor: '#d4c8b0', seed: 122, roof: 'flat', parapet: 8, doors: [{ x: 116, w: 28, kind: 'door', h: 50 }], windows: [20, 50, 200, 230], portico: { x: 70, w: 120, cols: 4, text: 'COURTHOUSE' } }, 220, 200);
  sc.vox(K.steps(120, 4, 4, 6, '#cfc6b4'), 350, 214); for (const x of [278, 422]) sc.vox(U.lionStatue(), x, 236, 0, 0, 236, 'lion');
  const hall = sc.building({ w: 230, d: 140, floors: 2, style: 'stone', wallColor: '#c8bca4', seed: 123, roof: 'flat', parapet: 8, doors: [{ x: 100, w: 30, kind: 'door', h: 50, open: true }], windows: [20, 50, 170, 200], portico: { x: 60, w: 110, cols: 4, text: 'CITY HALL' } }, 538, 200);
  sc.vox(K.steps(110, 4, 4, 6, '#cfc6b4'), 653, 214);
  sc.vox(U.flagpole(120, 'stars'), 500, 220); sc.building({ w: 80, d: 14, style: 'stone', seed: 124, height: 28, blank: true, plaques: [{ text: 'CIVIC CENTER', x: 4, v: 8, sx: 1, w: 72 }] }, 480, 262);
  for (const [x, y] of [[200, 250], [470, 250], [520, 254]]) { sc.vox(D.planterBox(30, 30), x, y, 0, 0, y, 'pb30'); }
  tree(sc, 200, 250, 1221, 120, 40); tree(sc, 760, 250, 1222, 130, 44);
  // the statue plaza
  sc.vox(K.statue(), 170, 466); for (const x of [120, 220]) sc.vox(P.bench(), x, 470, PI / 2, 0, 470, 'benchns');
  for (const [x, y] of [[110, 436], [230, 436], [110, 496], [230, 496]]) sc.add(bush(1230 + x + y, 10, { flowers: (x + y) % 3 ? '#e8507a' : '#f0c040' }), x, y);
  sc.add(palm(1241, 120), 30, 450); sc.add(palm(1242, 110), 300, 480); tree(sc, 60, 500, 1243, 120, 44);
  // the police station: its roof with a lit sign, the secure yard with patrol cars and a barrier
  const pol = sc.building({ w: 340, d: 150, style: 'concrete', seed: 125, roof: 'flat', parapet: 6, doors: [], windows: [] }, 430, 690);
  sc.onRoof(pol, P.roofAC(), 40, 20); sc.onRoof(pol, P.dish(), 300, 30);
  sc.sprOnRoof(pol, makeBuilding({ w: 110, d: 4, style: 'concrete', seed: 126, height: 26, blank: true, night: sc.night, plaques: [{ text: 'POLICE', x: 8, v: 4, sx: 3, bg: '#1e2a4e', fg: [240, 240, 236], lit: true, w: 96 }] }), 120, 8);
  for (const x of [490, 550, 610]) car(sc, 'police', x, 460, -PI / 2, { parked: true, lights: 0 });
  sc.vox(U.barrierArm(70, false), 470, 412); sc.vox(U.flagpole(100, 'stars'), 740, 420);
  sc.person(660, 450, 'cop', 6, 'idle'); sc.person(690, 446, 'cop', 6, 'idle', 1251);
  // traffic and people
  car(sc, 'sedan', 200, 320, 0, { paint: '#1e2026' }); car(sc, 'taxi', 600, 352, PI); car(sc, 'bicycle', 720, 352, PI, { parked: true }); sc.person(720, 350, 'courier', 6, 'idle');
  for (const [x, y, k, d] of [[330, 230, 'banker', 0], [350, 260, 'office', 2], [380, 262, 'socialite', 6], [600, 236, 'office', 4], [250, 290, null, 2], [560, 280, 'banker', 6], [120, 420, null, 0], [260, 440, 'nurse', 2], [150, 380, 'student', 2], [40, 290, null, 0]]) sc.person(x, y, k, d, 'walk', x * 7 + y);
  for (const [x, y] of [[180, 290], [460, 290], [720, 290], [20, 390], [310, 400], [420, 400]]) lamp(sc, x, y, 'cast');
  sc.vox(P.trafficSignal(52, 'green', sc.lampsOn), 300, 296); sc.vox(P.trafficSignal(52, 'red', sc.lampsOn), 420, 380, PI);
  sc.windowGlow(350, 202, 26, 80, LIGHT.warmWindow, 1.2); sc.windowGlow(653, 202, 26, 80, LIGHT.warmWindow, 1.2);
  return sc.finish();
}

export const EVERY_DISTRICT = { ...ALL_DISTRICTS, farm: buildFarm, desert: buildDesert, forest: buildForest, civic: buildCivic };
export const EVERY_TARGET = { ...ALL_TARGETS, farm: 'D13_farms.png', desert: 'D14_desert.png', forest: 'D15-B_forest.png', civic: 'D12_civic.png' };
