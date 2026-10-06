// Art v2 district scenes, part 2: transit and the waterfront, built to the T3, T4, D7, D10 and D11
// targets - a tram-and-bus avenue with a taxi rank, the ferry terminal, the industrial docks, the beach
// boardwalk and the city park. Same composer and conventions as districts.js (768 x 512 world px).
//
// ALL_DISTRICTS[name](preset) -> { G, lights }; ALL_TARGETS[name] -> the target image file
import { Scene, Streets } from './scene.js';
import { laneLine, zebra, manhole, drain, wear, weeds, leafLitter, treeGrate, puddle, litter, stain, roadText, lawnEdge, shoreFoam, railTrack, quayEdge, pitchLines, parkingLines, busSymbol, lilyPads, towel, pavementCracks } from './ground.js';
import * as P from './props.js';
import * as D from './props-district.js';
import * as X from './props-transit.js';
import * as K from './props-park.js';
import { vehicleModel } from './vehicles.js';
import { animalModel } from './animals.js';
import { palm, leafyTree, bush, cypress, pine, willow, blossom } from './trees.js';
import { LIGHT } from './palette.js';
import { DW, DH, car, lamp, tree, fenceRun, hedgeRun, DISTRICTS, DISTRICT_TARGETS } from './districts.js';

const PI = Math.PI;
const pet = (sc, kind, x, y, hd = 0, o = {}) => sc.vox(animalModel(kind, o), x, y, hd);

// ---- T4 transit avenue: a tram on embedded rails under catenary, a red bus lane, a taxi rank --------
export function buildTransit(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 4), G = sc.G;
  const S = new Streets(DW, DH, { corner: 20, sidewalk: 34, lotKind: 'sidewalk' });
  S.road(170, 0, 256, DH).road(0, 356, 170, 74).road(426, 356, DW - 426, 74).road(520, 196, 190, 160);
  S.zone('asphaltRed', { x: 364, y: 0, w: 62, h: 356 }, { road: true }); S.zone('asphaltRed', { x: 364, y: 430, w: 62, h: 82 }, { road: true });
  S.zone('paver', { x: 0, y: 0, w: 170, h: 140 }); S.zone('paver', { x: 440, y: 0, w: 328, h: 160 });
  S.build(); S.paint(G, 4);
  wear(G, 170, 0, 190, DH, 0.8, 61); wear(G, 426, 356, 342, 74, 0.6, 63); wear(G, 520, 196, 190, 160, 0.5, 65);
  laneLine(G, 230, 0, 330, false, { dash: 18, gap: 12 }); laneLine(G, 230, 460, 52, false, { dash: 18, gap: 12 });
  for (const x of [292, 297, 352, 357]) { laneLine(G, x, 0, 344, false, { yellow: true }); laneLine(G, x, 444, 68, false, { yellow: true }); }
  railTrack(G, 307, 0, DH, false, { embedded: true, gauge: 30 });
  busSymbol(G, 395, 196, 2); roadText(G, 'BUS', 376, 240, { sx: 3, sy: 6 });
  laneLine(G, 0, 392, 170, true, { yellow: true, dash: 18, gap: 12 }); laneLine(G, 426, 392, 94, true, { yellow: true, dash: 18, gap: 12 }); laneLine(G, 710, 392, 58, true, { yellow: true, dash: 18, gap: 12 });
  parkingLines(G, 530, 206, 3, 0, 0); for (const y of [204, 256, 308]) laneLine(G, 530, y, 140, true, { width: 2 });
  zebra(G, 176, 324, 180, 26, true, 31); zebra(G, 176, 438, 180, 26, true, 33); zebra(G, 140, 362, 24, 62, false, 35); zebra(G, 432, 362, 24, 62, false, 37);
  manhole(G, 260, 120, 7); manhole(G, 200, 480, 7); drain(G, 174, 220, 5, 14); drain(G, 420, 300, 5, 14);
  for (const [x, y] of [[100, 200], [100, 300], [480, 200]]) treeGrate(G, x, y, 12);
  leafLitter(G, [[100, 200], [480, 200], [60, 60]], 50);
  // buildings: a corner café (neon cup), a brick shop row with a red awning, rooftops to the south
  sc.building({ w: 150, d: 140, floors: 2, style: 'brick', seed: 41, roof: 'flat', shop: { kind: 'cafe', door: 'right', open: true, awning: ['#2f6a4e', '#2f6a4e'], people: 3 }, neon: { icon: 'cup', col: [255, 230, 160], x: 40, y: 0 } }, 0, 150);
  const row = sc.building({ w: 330, d: 160, floors: 3, style: 'brick', seed: 42, roof: 'flat', balconies: false, shop: { kind: 'mart', door: 'left', open: true, awning: ['#a83038', '#a83038'], clerkShirt: [60, 110, 80] } }, 452, 156);
  sc.onRoof(row, P.waterTank(), 260, 30);
  const sw = sc.building({ w: 150, d: 150, style: 'brick', seed: 43, roof: 'flat', doors: [], windows: [], ivy: 0.3 }, 0, 690);
  const se = sc.building({ w: 300, d: 150, style: 'concrete', seed: 44, roof: 'flat', parapet: 6, doors: [], windows: [] }, 470, 690);
  sc.onRoof(se, P.roofAC(), 40, 30); sc.onRoof(se, P.roofAC(), 90, 40); sc.onRoof(se, P.waterTank(), 220, 20); sc.onRoof(se, P.roofPlanter(40), 140, 60);
  sc.onRoof(sw, P.roofAC(false), 50, 30); sc.onRoof(sw, P.roofVent(), 100, 50);
  // tram, catenary and wires
  const pz = 70;
  for (const y of [40, 260, 470]) { sc.vox(X.catenaryPole(30), 296, y, -PI / 2, 0, y, 'cat'); }
  sc.wire(322, -20, pz, 322, 40, pz, 2); sc.wire(322, 40, pz, 322, 260, pz, 3); sc.wire(322, 260, pz, 322, 470, pz, 3); sc.wire(322, 470, pz, 322, 540, pz, 2);
  car(sc, 'tram', 322, 210, PI / 2, { paint: '#ecebe4' });
  // bus at the stop, passengers boarding; shelter and a timetable pole
  car(sc, 'bus', 394, 150, PI / 2, { paint: '#e8e8e4' });
  sc.vox(D.busShelter(66, sc.lampsOn), 446, 90, -PI / 2); sc.vox(X.stopPole('#2a5a9a'), 436, 210);
  for (const [x, y, d, k] of [[438, 236, 6, 'student'], [446, 256, 6, null], [430, 274, 7, 'office'], [452, 132, 0, 'granny'], [460, 70, 6, 'nurse']]) sc.person(x, y, k, d, 'idle', x + y);
  // taxi rank
  for (const y of [222, 284, 346]) car(sc, 'taxi', 620, y, PI, { parked: true });
  sc.person(560, 230, 'tourist', 2, 'walk'); sc.vox(X.ticketMachine(sc.lampsOn), 716, 200);
  // traffic
  car(sc, 'sedan', 200, 60, PI / 2, { paint: '#5a5e66' }); car(sc, 'sedan', 260, 200, -PI / 2, { paint: '#2f4a3a' }); car(sc, 'sedan', 200, 470, PI / 2, { paint: '#a83030' });
  car(sc, 'sedan', 260, 470, -PI / 2, { paint: '#2f4a3a' }); car(sc, 'bike', 236, 400, -PI / 2, { paint: '#2a2a30' });
  // pedestrians crossing and walking
  for (const [x, y, k, d] of [[220, 336, 'student', 2], [300, 450, null, 6], [330, 452, 'courier', 2], [80, 330, null, 0], [120, 250, 'banker', 4], [40, 120, null, 2], [600, 130, 'office', 6], [700, 170, null, 2], [500, 470, 'dad', 6]]) sc.person(x, y, k, d, 'walk', x * 3 + y);
  // street furniture
  for (const [x, y] of [[150, 100], [150, 320], [450, 330], [150, 460]]) lamp(sc, x, y, 'cast');
  sc.vox(P.trafficSignal(52, 'red', sc.lampsOn), 160, 340); sc.vox(P.trafficSignal(52, 'green', sc.lampsOn), 434, 440, PI);
  sc.vox(P.hydrant(), 150, 200); sc.vox(P.bench(), 60, 160); sc.vox(X.bikeRack(3), 480, 330); sc.vox(P.wireBin(), 500, 170); sc.vox(D.wheelieBin('#3a6a3a'), 156, 440);
  for (const x of [20, 110]) sc.vox(P.planter(), x, 150, 0, 0, 150, 'planter');
  tree(sc, 100, 202, 51, 130, 46); tree(sc, 100, 302, 52, 124, 44); tree(sc, 480, 202, 53, 130, 46);
  return sc.finish();
}

// ---- T3 ferry terminal: the terminal hall, the marshalling lot, a gangway and the docked ferry ------
export function buildFerry(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 3), G = sc.G;
  const S = new Streets(DW, DH, { corner: 16, sidewalk: 20, lotKind: 'stoneTile' });
  S.zone('waterDeep', { poly: [[420, 0], [DW, 0], [DW, DH], [0, DH], [0, 440], [420, 440]] });
  S.zone('asphalt', { x: 30, y: 200, w: 390, h: 200 });
  S.zone('yard', { x: 0, y: 330, w: 170, h: 110 });
  S.zone('dock', { x: 420, y: 160, w: 60, h: 90 });
  S.build(); S.paint(G, 3);
  shoreFoam(G, (x, y) => S.kind(x, y) === 'waterDeep', 27);
  quayEdge(G, 0, 440, 420, 18); for (let y = 0; y < 440; y++) for (let k = 0; k < 4; k++) G.put(420 + k, y, k < 2 ? [228, 186, 52] : [40, 38, 44], [0, 0, 1], 0, null, 1);
  parkingLines(G, 60, 214, 6, 56, 70); parkingLines(G, 60, 304, 6, 56, 70);
  for (let i = 0; i < 6; i++) { laneLine(G, 380, 220 + i * 6, 30, true, { yellow: true, width: 2 }); }
  stain(G, 120, 260, 10, 5); stain(G, 250, 340, 12, 6); puddle(G, 330, 380, 10, 4);
  // the terminal hall with its departures sign, the forecourt
  const hall = sc.building({ w: 320, d: 120, style: 'glass', seed: 31, roof: 'flat', parapet: 4, shop: { kind: 'lobby', door: 150, open: true, sign: { text: 'FERRY TERMINAL', bg: '#1e3a5e', fg: [240, 236, 220], lit: true }, people: 4 } }, 40, 150);
  sc.onRoof(hall, P.roofAC(), 50, 40); sc.onRoof(hall, P.roofAC(), 110, 50); sc.onRoof(hall, P.skylight(), 200, 50); sc.onRoof(hall, P.skylight(), 240, 50);
  for (const x of [80, 140, 240, 300]) sc.vox(P.bench(), x, 182, 0, 0, 182, 'bench');
  for (const x of [50, 350]) sc.vox(P.pottedPalm(), x, 176, 0, 0, 176, 'ppalm');
  sc.vox(X.ticketMachine(sc.lampsOn), 30, 170);
  for (const [x, y, k] of [[180, 172, 'tourist'], [196, 176, null], [212, 174, 'student'], [228, 178, null], [244, 176, 'granny'], [120, 192, 'dad'], [330, 190, 'nurse']]) sc.person(x, y, k, 4, 'idle', x * 2 + y);
  // the lot: cars queued for the ferry, a marshal waving them on
  car(sc, 'suv', 88, 250, 0, { paint: '#2f5a4a', parked: true }); car(sc, 'taxi', 88, 340, 0, { parked: true });
  car(sc, 'suv', 200, 250, 0, { paint: '#2c3a5e' }); car(sc, 'sedan', 200, 340, 0, { paint: '#a83030' });
  sc.person(330, 316, 'dockhand', 6, 'idle');
  for (const [x, y] of [[40, 200], [40, 400], [370, 230], [370, 300]]) sc.vox(X.cone(), x, y, 0, 0, y, 'cone');
  // the shed and cargo corner
  sc.building({ w: 110, d: 70, style: 'siding', wallColor: '#c8ccd0', seed: 32, roof: 'flat', doors: [{ x: 14, w: 18, kind: 'door' }], windows: [60] }, 0, 420);
  sc.vox(X.forklift('#e0b030', true), 140, 410, 0); sc.vox(P.crate(1), 120, 360); sc.vox(D.pallet(), 150, 350); sc.vox(P.crate(2), 30, 438); sc.vox(D.oilDrum('#3a5a8a'), 170, 430);
  // the link span onto the car deck, the passenger gangway, the ferry
  sc.vox(X.gangway(70, 14, 40), 450, 270, 0, 0, 270);
  sc.vox(X.gangway(110, 30, 26), 430, 200, 0, 0, 200);
  for (const [x, y, k] of [[420, 194, 'tourist'], [440, 196, null], [460, 198, 'student']]) sc.person(x, y + 4, k, 2, 'walk', x + y);
  car(sc, 'ferry', 600, 280, PI / 2, { parked: true });
  for (const [x, y, k] of [[580, 380, 'tourist'], [610, 396, null], [640, 372, 'granny'], [570, 300, null], [630, 250, 'student']]) sc.personUp(x, y, 81, k, 0, 'idle', x + y);
  sc.person(560, 456, 'dockhand', 0, 'idle');
  car(sc, 'sedan', 600, 130, PI / 2, { paint: '#5a5e66', parked: true });
  car(sc, 'tugboat', 700, 470, -0.2, { parked: true });
  // pilings, dolphins, bollards and mooring lines, lifebuoys
  for (const [x, y, h] of [[450, 20, 34], [462, 30, 30], [450, 40, 32], [500, 60, 28], [740, 40, 30], [730, 54, 26]]) sc.vox(P.piling(h), x, y, 0, 0, y, 'pile' + h);
  for (const x of [60, 160, 260, 360]) sc.vox(X.mooringBollard(), x, 436, 0, 0, 436, 'moor');
  for (const y of [120, 330, 420]) sc.vox(X.mooringBollard(), 414, y, 0, 0, y, 'moor');
  sc.wire(414, 120, 12, 530, 110, 34, 8, [190, 160, 110]); sc.wire(414, 420, 12, 530, 440, 34, 8, [190, 160, 110]);
  sc.vox(X.lifebuoy(), 408, 160); sc.vox(X.lifebuoy(), 300, 436);
  for (const [x, y] of [[20, 190], [400, 190], [20, 420]]) lamp(sc, x, y, 'cast');
  sc.vox(X.floodMast(130, sc.lampsOn), 400, 420); if (sc.lampsOn) sc.light(420, 380, 120, 220, [1, 0.95, 0.85], sc.isNight ? 2 : 0.4);
  return sc.finish();
}

// ---- D7 industrial docks: a warehouse, the container yard and crane, freight wagons, tanks, the quay --
export function buildIndustrial(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 7), G = sc.G;
  const S = new Streets(DW, DH, { corner: 12, sidewalk: 16, roadKind: 'asphaltWorn', lotKind: 'yard' });
  S.road(286, 0, 84, 440).road(0, 270, DW, 70);
  S.zone('ballast', { x: 380, y: 186, w: 388, h: 54 });
  S.zone('waterDeep', { x: 286, y: 440, w: DW - 286, h: 72 }, { road: true, over: true });
  S.zone('dirt', { x: 0, y: 360, w: 270, h: 152 });
  S.build(); S.paint(G, 7);
  shoreFoam(G, (x, y) => S.kind(x, y) === 'waterDeep', 29);
  quayEdge(G, 370, 440, DW - 370, 18); quayEdge(G, 286, 440, 84, 18);
  railTrack(G, 380, 196, 388, true, { gauge: 30 });
  wear(G, 286, 0, 84, 270, 1.6, 71); wear(G, 0, 270, DW, 70, 1.6, 73); wear(G, 286, 340, 84, 100, 1.2, 75);
  for (const [x, y, rx, ry] of [[320, 120, 14, 6], [200, 300, 18, 7], [340, 380, 12, 5], [520, 300, 14, 6], [600, 400, 16, 6], [60, 310, 10, 4], [450, 370, 12, 5]]) puddle(G, x, y, rx, ry);
  for (const [x, y] of [[100, 250], [460, 360], [680, 380]]) stain(G, x, y, 14, 8);
  laneLine(G, 0, 304, 286, true, { wear: 0.4 }); laneLine(G, 370, 304, 398, true, { wear: 0.4 });
  pavementCracks(G, (x, y) => S.kind(x, y) === 'yard', 40, 91);
  weeds(G, (x, y) => S.isWalk(x, y) !== S.isWalk(x, y + 3) || (S.kind(x, y) === 'ballast' && hash2(x, y)), 0.07, 77);
  litter(G, (x, y) => S.isWalk(x, y), 0.002, 79);
  // the warehouse: corrugated walls, an open roller door with the lit bay
  const wh = sc.building({ w: 270, d: 240, style: 'corrugated', wallColor: '#7a8a94', seed: 51, roof: 'flat', height: 96, grime: 0.6,
    doors: [{ x: 96, w: 104, kind: 'roller', open: true, h: 70 }, { x: 40, w: 20, kind: 'door' }], windows: [220] }, 0, 230);
  for (const [x, y] of [[40, 40], [110, 60], [190, 40], [230, 120], [70, 140]]) sc.onRoof(wh, P.roofAC(), x, y);
  for (const [x, y] of [[150, 110], [30, 190]]) sc.onRoof(wh, P.roofVent(), x, y);
  sc.vox(X.forklift('#e0b030', true), 170, 254, PI / 2 + 0.3); sc.person(110, 250, 'dockhand', 0, 'idle'); sc.person(232, 262, 'dockhand', 2, 'walk');
  for (const [x, y, t] of [[20, 246, 1], [36, 250, 1], [250, 248, 2]]) sc.vox(P.crate(t), x, y);
  sc.vox(P.dumpster(), 260, 260, PI / 2); sc.vox(D.oilDrum('#3a5a8a'), 270, 236); sc.vox(X.cone(), 200, 266);
  // container yard with the gantry crane, wagons on the siding, a fenced boundary and a guard hut
  const stacks = [[420, 40, 2], [420, 100, 1], [520, 40, 2], [520, 100, 2], [640, 40, 1], [720, 40, 2], [720, 100, 1], [640, 100, 2]];
  stacks.forEach(([x, y, n], i) => { for (let k = 0; k < n; k++) sc.vox(X.container(X.CONTAINER_COLS[(i * 3 + k) % 7], 130), x, y, 0, k * 58, y + k * 0.1, 'cont' + ((i * 3 + k) % 7)); });
  sc.vox(X.gantryCrane(200, 190), 590, 120, 0);
  sc.vox(X.boxcar('#7a3a2e'), 520, 212); sc.vox(X.tankCar('#3a3c44'), 740, 212);
  fenceRun(sc, 'chain', 380, 252, 600, 252, { barbed: true }); fenceRun(sc, 'chain', 680, 252, 768, 252, { barbed: true });
  sc.building({ w: 50, d: 40, style: 'siding', wallColor: '#c8ccd0', seed: 52, roof: 'flat', doors: [{ x: 16, w: 16, kind: 'door' }], windows: [] }, 620, 262);
  sc.person(400, 140, 'dockhand', 0, 'walk'); sc.person(680, 160, 'dockhand', 6, 'idle');
  // the quay: pallets and a tarp, bollards, a moored tug
  for (const [x, y] of [[420, 410], [440, 404], [700, 380]]) sc.vox(D.pallet(), x, y, 0.2);
  sc.vox(P.crate(2), 470, 400); sc.vox(P.crate(1), 486, 412); sc.vox(X.forklift('#e0b030', false), 560, 370, PI);
  for (const x of [400, 520, 640, 740]) sc.vox(X.mooringBollard(), x, 434, 0, 0, 434, 'moor');
  sc.person(600, 420, 'dockhand', 0, 'idle'); sc.person(500, 360, 'mechanic', 6, 'walk');
  car(sc, 'tugboat', 640, 486, 0, { parked: true });
  sc.wire(640, 434, 14, 600, 470, 30, 6, [190, 160, 110]);
  // the plant: storage tanks and pipework behind a block with a lit door
  sc.vox(X.storageTank(46, 130, '#9aa0a6'), 54, 470); sc.vox(X.storageTank(36, 100, '#8a9096'), 150, 500);
  sc.vox(X.pipeRun(160, 24, 4, '#8a5a3a'), 160, 390); sc.vox(X.pipeRun(120, 40, 3, '#5a6a7a'), 200, 420, PI / 2);
  sc.building({ w: 90, d: 60, style: 'concrete', seed: 53, roof: 'flat', doors: [{ x: 30, w: 18, kind: 'door' }], windows: [], grime: 0.8, porchLight: true }, 180, 470);
  // traffic
  car(sc, 'boxtruck', 120, 300, 0, { parked: true }); car(sc, 'sedan', 328, 70, PI / 2, { paint: '#2f4a4a' }); car(sc, 'pickup', 326, 380, PI / 2, { cargo: [2, 3], paint: '#8a2e2a' });
  car(sc, 'boxtruck', 700, 300, PI, { paint: '#e6e2d8' });
  for (const [x, y] of [[276, 250], [380, 250], [276, 350], [380, 350]]) lamp(sc, x, y, 'street');
  sc.vox(X.floodMast(150, sc.lampsOn), 600, 260); if (sc.lampsOn) sc.light(600, 200, 140, 260, [1, 0.95, 0.85], sc.isNight ? 2.2 : 0.4);
  if (sc.lampsOn) sc.light(150, 236, 50, 90, LIGHT.warmWindow, sc.isNight ? 2.2 : 0.8);
  return sc.finish();
}
const hash2 = (x, y) => ((x * 7 + y * 13) % 17) === 0;

// ---- D10 beach: the boardwalk shops, dunes, sand, surf, a lifeguard tower and the pier -----------------
export function buildBeach(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 10), G = sc.G;
  const S = new Streets(DW, DH, { corner: 16, sidewalk: 24, lotKind: 'sand' });
  S.road(0, 0, DW, 40);
  const shore = (x) => 392 + Math.sin(x / 95) * 20 + Math.sin(x / 37 + 1) * 6;
  S.zone('sidewalk', { x: 0, y: 40, w: DW, h: 150 });
  S.zone('dock', { x: 0, y: 190, w: DW, h: 58 });
  S.zone('sandWet', { poly: [[0, shore(0) - 20], ...range(0, DW, 16).map((x) => [x, shore(x) - 20]), [DW, shore(DW) - 20], [DW, DH], [0, DH]] });
  S.zone('shallow', { poly: [[0, shore(0)], ...range(0, DW, 8).map((x) => [x, shore(x)]), [DW, shore(DW)], [DW, DH], [0, DH]] });
  S.zone('water', { poly: [[0, shore(0) + 60], ...range(0, DW, 16).map((x) => [x, shore(x) + 60 + Math.sin(x / 50) * 8]), [DW, DH], [0, DH]] });
  S.zone('dock', { x: 656, y: 248, w: 70, h: 264 });
  S.build(); S.paint(G, 10);
  shoreFoam(G, (x, y) => (S.kind(x, y) === 'shallow' || S.kind(x, y) === 'water'), 31);
  for (let x = 0; x < DW; x++) for (let k = 0; k < 6; k++) { const y = Math.round(shore(x)) + 18 + k + Math.round(Math.sin(x / 13) * 3); if (S.kind(x, y) === 'shallow' && ((x + k * 3) % 5)) G.put(x, y, [234, 248, 246], [0, 0, 1], 0, null, 2); }
  weeds(G, (x, y) => y > 250 && y < 290 && S.kind(x, y) === 'sand', 0.12, 81);
  // the boardwalk front: beach bar, surf shop, snack bar, motel
  const bar = sc.building({ w: 200, d: 90, style: 'siding', wallColor: '#8a6a4a', seed: 61, pitch: 'hip', roof: 'shingle', roofColor: '#6a5040', slope: 0.5, shop: { kind: 'diner', door: 'right', open: true, people: 5, sign: { text: 'SANDYS', bg: '#2a5a7a', fg: [250, 220, 120], lit: true } } }, 40, 176);
  sc.building({ w: 110, d: 100, style: 'stucco', wallColor: '#d8c8a8', seed: 62, roof: 'flat', parapet: 6, shop: { kind: 'mart', door: 'left', open: true, sign: { text: 'SURF', bg: '#2a3a6a', fg: [240, 236, 220] } } }, 380, 176);
  sc.building({ w: 130, d: 100, style: 'stucco', wallColor: '#e2d6bc', seed: 63, roof: 'flat', parapet: 6, shop: { kind: 'cafe', door: 'left', open: true, awning: ['#2f8a6a', '#f0ece4'], sign: { text: 'COCO BITES', bg: '#f0ece4', fg: [40, 110, 80] } } }, 496, 176);
  sc.building({ w: 150, d: 110, floors: 3, style: 'stucco', wallColor: '#e8a0b4', seed: 64, roof: 'flat', balconies: true, shop: { kind: 'lobby', door: 'left', open: true, people: 1 } }, 640, 176);
  // boardwalk rail, steps to the sand, dune fence and grass
  for (let x = 0; x < DW; x += 80) if (!(x >= 240 && x < 320) && !(x >= 560 && x < 640)) sc.vox(K.woodRail(80), x + 40, 252, 0, 0, 252, 'wrail');
  for (const x of [280, 600]) sc.vox(K.steps(40, 5, 4, 6), x, 266, 0, 0, 266, 'steps');
  for (let x = 20; x < 640; x += 80) sc.vox(K.woodRail(80, true), x + 40, 288, 0, 0, 288, 'rope');
  for (const [x, s] of [[30, 1], [150, 2], [360, 3], [460, 4], [520, 5], [190, 6]]) sc.add(bush(400 + s, 10 + (s % 3) * 2), x, 280);
  // the beach: umbrellas, towels, a volleyball court, the lifeguard tower, surfers and swimmers
  towel(G, 56, 322, 20, 40, [[220, 70, 80], [240, 236, 228], [60, 120, 190]]); towel(G, 126, 340, 20, 40, [[240, 200, 70], [240, 236, 228]]); towel(G, 84, 372, 20, 40, [[60, 160, 140], [240, 236, 228]]); towel(G, 190, 330, 20, 40, [[230, 120, 170], [240, 236, 228]]);
  sc.vox(P.umbrella('#e84a5a', '#f0ece4'), 90, 324); sc.vox(P.umbrella('#3a6ab0', '#f0ece4'), 150, 346); sc.vox(P.umbrella('#f0b040', '#f0ece4'), 60, 380);
  sc.vox(K.beachChair('#e8504a'), 120, 330); sc.vox(K.cooler(), 104, 360); sc.vox(K.cooler('#e8504a'), 176, 370);
  for (let x = 240; x <= 380; x++) for (const y of [310, 382]) if (x % 3) G.put(x, y, [236, 232, 216], [0, 0, 1], 0, null, 1);
  for (let y = 310; y <= 382; y++) for (const x of [240, 380]) if (y % 3) G.put(x, y, [236, 232, 216], [0, 0, 1], 0, null, 1);
  sc.vox(P.volleyNet(90), 310, 346, 0);
  for (const [x, y, d] of [[280, 326, 0], [334, 330, 0], [290, 372, 4], [346, 368, 4]]) sc.person(x, y, 'surfer', d, 'idle', x * 5);
  sc.vox(P.lifeguardTower(), 480, 340); sc.person(470, 346, 'lifeguard', 0, 'idle', 991);
  sc.vox(P.surfboard('#e85a40'), 456, 360, 0.4); sc.vox(P.surfboard('#f0ece4'), 210, 400, 0.2);
  sc.vox(K.sandcastle(), 560, 350); sc.person(580, 344, null, 6, 'idle', 7771);
  sc.person(530, 320, 'surfer', 2, 'walk'); sc.person(200, 300, 'tourist', 2, 'walk'); sc.person(420, 300, null, 0, 'walk', 7772);
  for (const [x, y, k] of [[180, 450, null], [330, 470, 'surfer'], [380, 440, null], [500, 480, null], [260, 492, null]]) sc.swimmer(x, y, k, 0, x + y);
  sc.vox(K.ringFloat(), 560, 470);
  // the pier: pilings, a lamp, someone fishing, a moored jet ski
  for (let y = 270; y < DH; y += 48) for (const x of [656, 724]) sc.vox(P.piling(30), x, y, 0, 0, y, 'pile30');
  for (let y = 260; y < DH; y += 80) for (const x of [658, 724]) sc.vox(K.woodRail(80), x, y + 40, PI / 2, 0, y + 40, 'wrailns');
  sc.person(704, 440, 'farmer', 2, 'idle'); car(sc, 'jetski', 750, 470, PI / 2, { parked: true });
  lamp(sc, 690, 300, 'cast');
  // boardwalk life
  for (const [x, y, k, d] of [[160, 214, 'surfer', 2], [300, 222, null, 6], [420, 210, 'tourist', 2], [560, 230, 'athleisure', 6], [700, 216, null, 2]]) sc.person(x, y, k, d, 'walk', x + y);
  sc.vox(P.bench(), 340, 206); sc.vox(P.wireBin(), 380, 202); sc.vox(P.chalkboard(), 230, 194);
  for (const x of [100, 360, 620]) lamp(sc, x, 192, 'cast');
  // the street at the top
  car(sc, 'sedan', 120, 20, 0, { paint: '#d8d4cc', parked: true }); car(sc, 'suv', 300, 20, 0, { paint: '#a83030', parked: true }); car(sc, 'sedan', 470, 20, PI, { paint: '#2c4060' });
  // palms
  for (const [x, y, s] of [[20, 300, 1], [30, 470, 2], [250, 178, 3], [600, 176, 4], [360, 176, 5]]) sc.add(palm(70 + s, 110 + s * 6), x, y);
  for (const [x, y, s] of [[20, 500, 1], [80, 500, 2]]) sc.vox(D.boulder(s + 30, 24), x, y);
  K.stringLights(sc, 40, 180, 240, 180, 60, 12, sc.lampsOn);
  return sc.finish();
}
const range = (a, b, s) => { const r = []; for (let x = a; x <= b; x += s) r.push(x); return r; };

// ---- D11 park: winding paths, a pond with a footbridge, a gazebo, a football pitch, a statue garden ----
export function buildPark(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 11), G = sc.G;
  const S = new Streets(DW, DH, { lotKind: 'grass' });
  const paths = [
    [[0, 330], [120, 300], [260, 250], [420, 236], [520, 290], [560, 330], [700, 330], [768, 310]],
    [[440, 0], [456, 120], [430, 236]],
    [[0, 470], [140, 470], [300, 486], [470, 470], [560, 430], [560, 330]],
    [[470, 470], [520, 512]],
    [[120, 0], [150, 90], [190, 160], [260, 250]],
  ];
  S.zone('lawn', { x: 560, y: 0, w: 208, h: 200 });
  S.zone('mulch', { blob: { cx: 690, cy: 470, rx: 70, ry: 40, seed: 3, wob: 0.05 } });
  S.zone('paver', { blob: { cx: 690, cy: 470, rx: 50, ry: 28, seed: 3, wob: 0.0 } });
  for (const p of paths) S.zone('gravel', { path: p, width: 30 });
  S.zone('paver', { cx: 110, cy: 120, r: 48 });
  S.zone('soil', { blob: { cx: 250, cy: 380, rx: 136, ry: 72, seed: 5, wob: 0.18 } });
  S.zone('water', { blob: { cx: 250, cy: 380, rx: 128, ry: 64, seed: 5, wob: 0.18 } });
  S.zone('water', { path: [[360, 400], [420, 420], [470, 440], [500, 470]], width: 22 });
  S.build(); S.paint(G, 11);
  const isPond = (x, y) => S.kind(x, y) === 'water';
  lilyPads(G, isPond, 120, 103);
  lawnEdge(G, (x, y) => { const k = S.kind(x, y); return k === 'grass' || k === 'lawn'; });
  pitchLines(G, 580, 10, 188, 180);
  leafLitter(G, [[360, 150], [620, 420], [40, 400]], 70);
  // the pitch: goal, fence, players
  sc.vox(K.soccerGoal(60, 30, 18), 590, 100, 0);
  fenceRun(sc, 'chain', 560, 206, 768, 206); fenceRun(sc, 'chain', 556, 0, 556, 206);
  for (const [x, y, d] of [[640, 60, 2], [680, 120, 6], [720, 80, 6], [660, 160, 2], [700, 40, 4], [610, 140, 2]]) sc.person(x, y, { skin: (x + y) % 5, build: 0, hair: { style: 'short', color: (x % 6) }, top: { kind: 'tee', color: x % 2 ? 'red' : 'navy' }, bottom: { kind: 'shorts', color: 'black' }, shoes: 'white' }, d, 'walk');
  sc.vox(P.bench(), 620, 222); sc.person(660, 226, null, 0, 'idle', 8801); sc.person(700, 226, null, 0, 'idle', 8802);
  // the gazebo with a band
  sc.vox(K.gazebo(34), 110, 130); sc.person(100, 120, 'punk', 0, 'idle'); sc.person(124, 124, null, 0, 'idle', 8803);
  // the pond: reeds, ducks, rocks, the footbridge over the stream
  for (const [x, y, s] of [[170, 330, 1], [300, 322, 2], [350, 360, 3], [140, 430, 4]]) sc.vox(K.reeds(s), x, y);
  for (const [x, y, hd] of [[230, 370, 0.3], [250, 384, 0.4], [270, 376, 0.2], [210, 400, 2.6]]) sc.vox(K.duck(hd < 1), x, y, hd);
  for (const [x, y, s] of [[130, 360, 1], [380, 380, 2], [160, 446, 3], [330, 440, 4], [370, 420, 5]]) sc.vox(D.boulder(s + 50, 12 + s % 3 * 4, '#8a8478'), x, y);
  sc.vox(K.archBridge(80, 28, 14), 452, 440, PI / 2 - 0.5); sc.person(450, 428, 'farmer', 0, 'idle');
  // trees: willows by the water, big shade trees, a blossom tree
  sc.add(willow(1, 130, 54), 70, 420); sc.add(willow(2, 120, 50), 330, 480);
  tree(sc, 380, 150, 61, 160, 64); tree(sc, 520, 200, 62, 150, 58); tree(sc, 700, 300, 63, 140, 56); tree(sc, 20, 220, 64, 150, 60); tree(sc, 250, 60, 65, 150, 60);
  sc.add(blossom(66, 120, 50), 690, 430);
  for (const [x, y, s] of [[200, 200, 1], [330, 270, 2], [600, 260, 3], [740, 400, 4], [60, 260, 5], [400, 300, 6], [600, 500, 7], [30, 60, 8]]) sc.add(bush(500 + s, 14 + (s % 3) * 3, { flowers: ['#d84a78', '#e8c040', '#9a6ad8', null][s % 4] }), x, y);
  // the statue garden, the snack cart, a picnic, benches, lamps
  sc.vox(K.statue(), 690, 470);
  towel(G, 620, 360, 40, 26, [[200, 50, 50], [244, 240, 232]], true); sc.vox(K.cooler(), 650, 372); sc.person(632, 366, null, 0, 'idle', 8804);
  sc.vox(P.hotdogCart(sc.lampsOn), 600, 412, 0); sc.vox(P.umbrella('#e04a4a', '#f0ece4'), 600, 400); sc.person(610, 440, 'student', 4, 'idle'); sc.person(586, 444, null, 4, 'idle', 8805);
  for (const [x, y] of [[180, 300], [60, 490], [540, 360], [620, 300]]) sc.vox(P.bench(), x, y, 0, 0, y, 'bench');
  for (const [x, y] of [[90, 330], [300, 236], [480, 310], [530, 450], [240, 500], [140, 180]]) lamp(sc, x, y, 'cast');
  for (const [x, y] of [[200, 488], [470, 260]]) sc.vox(P.wireBin(), x, y);
  sc.vox(K.parkSign(), 260, 512 - 20);
  // people: joggers, a cyclist, dog walkers
  sc.person(500, 330, 'athleisure', 6, 'walk'); sc.person(300, 254, null, 2, 'walk', 8806); sc.person(330, 252, null, 2, 'walk', 8807);
  sc.person(440, 120, 'dad', 4, 'walk'); pet(sc, 'golden', 470, 136, 0.4, { phase: 0.3 });
  sc.person(150, 486, 'granny', 2, 'walk'); pet(sc, 'terrier', 176, 490, 0, { phase: 0.6 });
  car(sc, 'bicycle', 420, 232, 0.2, { parked: true }); sc.person(420, 232, 'courier', 2, 'idle');
  return sc.finish();
}

export const ALL_DISTRICTS = { ...DISTRICTS, transit: buildTransit, ferry: buildFerry, industrial: buildIndustrial, beach: buildBeach, park: buildPark };
export const ALL_TARGETS = { ...DISTRICT_TARGETS, transit: 'T4_bus-taxi-tram.png', ferry: 'T3_ferry-terminal.png', industrial: 'D7_industrial.png', beach: 'D10_beach.png', park: 'D11_park.png' };
