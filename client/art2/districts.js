// Art v2 district scenes, built to the D1-D17 targets (docs/art-v2/targets) from the v2 generators:
// each is one 768 x 512 world-px block (the targets at half scale) laid out with the scene composer
// (scene.js) - streets, lots, buildings, yards, street furniture, cars, people and planting - so the
// district kits can be judged against the concepts before they go into the world.
//
// DISTRICTS[name](preset) -> { G, lights }
import { Scene, Streets } from './scene.js';
import { laneLine, zebra, manhole, drain, wear, weeds, leafLitter, treeGrate, puddle, skid, courtLines, poolWall, litter, pavementCracks, stain, roadText, lawnEdge, shoreFoam } from './ground-warped.js';
import { W } from './warp.js';
import * as P from './props.js';
import * as D from './props-district.js';
import { vehicleModel } from './vehicles.js';
import { palm, leafyTree, bush, cypress, pine } from './trees.js';
import { LIGHT } from './palette.js';

export const DW = 768, DH = 512;
const PI = Math.PI;

// shared bits ---------------------------------------------------------------------------------------
export function car(sc, type, x, y, hd, o = {}) {
  const m = vehicleModel(type, { lights: o.lights ?? (o.parked ? 0 : sc.carLights), ...o });
  sc.vox(m, x, y, hd);
  if (!o.parked) sc.carLight(x, y, hd, m.w);
}
export function lamp(sc, x, y, kind = 'street') {
  if (kind === 'street') { sc.vox(P.streetLamp(sc.lampsOn), x, y, 0, 0, y, 'slamp' + sc.lampsOn); sc.lampLight(x, y, 84); }
  else if (kind === 'cast') { sc.vox(P.lampPost('cast', sc.lampsOn), x, y, 0, 0, y, 'clamp' + sc.lampsOn); sc.lampLight(x, y, 74, [1, 0.8, 0.5], 0.55); }
  else { sc.vox(D.bannerLamp(sc.lampsOn, kind), x, y, 0, 0, y, 'blamp' + kind + sc.lampsOn); sc.lampLight(x, y, 84, [1, 0.82, 0.55]); }
}
export const tree = (sc, x, y, seed, h = 140, crown = 50, opt) => sc.add(leafyTree(seed, h, crown, opt), x, y);
// a run of fence from (x0, y0) to (x1, y1) along one axis, in chunks
export function fenceRun(sc, kind, x0, y0, x1, y1, opt = {}) {
  const ns = x0 === x1, len = Math.abs(ns ? y1 - y0 : x1 - x0);
  for (let s = 0; s < len; s += 80) {
    const l = Math.min(80, len - s);
    const m = D.fence(kind, l, opt);
    if (ns) sc.vox(m, x0, Math.min(y0, y1) + s + l / 2, PI / 2, 0, Math.min(y0, y1) + s + l / 2, kind + l + 'ns' + (opt.barbed ? 'b' : ''));
    else sc.vox(m, Math.min(x0, x1) + s + l / 2, y0, 0, 0, y0, kind + l + 'ew' + (opt.barbed ? 'b' : ''));
  }
}
export function hedgeRun(sc, x0, y0, len, ns = false, h = 12) {
  for (let s = 0; s < len; s += 60) { const l = Math.min(60, len - s); sc.vox(P.hedge(l, h), ns ? x0 : x0 + s + l / 2, ns ? y0 + s + l / 2 : y0, ns ? PI / 2 : 0); }
}

// ---- D9 suburbs: a wide residential junction, ranch houses and two-storeys, lawns and driveways -------
export function buildSuburbs(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 9, {x: [[362, 380, 56], [380, 434, 176], [434, 452, 56]], y: [[282, 300, 56], [300, 352, 176], [352, 370, 56]], walk: 3.111111111111111, grow: 1.5}), G = sc.G;
  const S = new Streets(DW, DH, { corner: 20, sidewalk: 18, lotKind: 'lawn' });
  S.road(0, 300, DW, 52).road(380, 352, 54, DH - 352).bulb(407, 314, 58);
  // driveways (over the sidewalk), front paths, patios, beds
  S.zone('driveway', { x: 98, y: 196, w: 50, h: 120 }, { over: true });
  S.zone('driveway', { x: 404, y: 186, w: 56, h: 80 }, { over: true });
  S.zone('driveway', { x: 690, y: 190, w: 58, h: 120 }, { over: true });
  S.zone('paver', { x: 360, y: 186, w: 14, h: 52 });
  S.zone('paver', { x: 616, y: 196, w: 12, h: 70 });
  S.zone('mulch', { x: 28, y: 196, w: 66, h: 12 }); S.zone('mulch', { x: 302, y: 186, w: 54, h: 12 }); S.zone('mulch', { x: 572, y: 196, w: 40, h: 12 });
  S.zone('brick', { x: 196, y: 404, w: 130, h: 108 });
  S.zone('driveway', { x: 108, y: 360, w: 52, h: 76 }, { over: true });
  S.zone('mulch', { x: 450, y: 384, w: 200, h: 14 });
  S.build(); S.paint(G, 9);
  lawnEdge(G, (x, y) => S.kind(x, y) === 'lawn');
  wear(G, 0, 300, DW, 52, 0.5, 19); wear(G, 380, 352, 54, 160, 0.4, 23);
  manhole(G, 407, 318, 8); drain(G, 270, 354, 14, 5); drain(G, 560, 296, 14, 5);
  stain(G, 123, 260, 9, 5); stain(G, 432, 236, 8, 5); puddle(G, 112, 282, 16, 6); puddle(G, 140, 300, 10, 4);
  weeds(G, (x, y) => S.isWalk(x, y) !== S.isWalk(x, y + 3), 0.04);
  leafLitter(G, [[262, 236], [600, 214], [40, 418], [300, 300], [460, 330]], 70);
  // ---- north side: three houses facing the street
  const hA = sc.building({ w: 158, d: 96, style: 'siding', wallColor: '#cdc2ac', pitch: 'hip', roof: 'shingle', roofColor: '#5e6270', chimney: true, seed: 31,
    doors: [{ x: 26, w: 18, kind: 'door' }, { x: 82, w: 54, kind: 'garage', open: true }], windows: [6, 52, 140], porchLight: true, shutters: '#3a4a5c' }, 16, 196);
  const hB = sc.building({ w: 190, d: 100, floors: 2, style: 'stucco', wallColor: '#e0d2bc', pitch: 'hip', roof: 'tile', seed: 32,
    doors: [{ x: 52, w: 18, kind: 'door' }, { x: 92, w: 58, kind: 'garage' }], windows: [16, 74, 164], porchLight: true, shutters: '#56606a' }, 310, 186);
  const hC = sc.building({ w: 170, d: 98, style: 'siding', wallColor: '#c6c0b4', pitch: 'gable', ridge: 'ns', slope: 0.55, roof: 'shingle', roofColor: '#585c68', seed: 33,
    doors: [{ x: 46, w: 18, kind: 'door' }], windows: [10, 76, 100, 140], porchLight: true }, 572, 196);
  // ---- south side: houses seen from behind (roofs), a patio yard between them
  sc.building({ w: 176, d: 120, style: 'siding', wallColor: '#c8bca8', pitch: 'hip', roof: 'shingle', roofColor: '#545866', seed: 34, doors: [], windows: [20, 90, 140] }, 0, 556);
  sc.building({ w: 220, d: 140, style: 'stucco', wallColor: '#d8c8b0', pitch: 'hip', roof: 'tile', seed: 35, doors: [], windows: [30, 120] }, 470, 566);
  // yards
  for (const [x, y, n] of [[60, 204, 1], [334, 194, 2], [590, 204, 3], [460, 392, 4], [560, 392, 5]]) sc.vox(P.flowerBed(n % 2 ? 40 : 34), x, y, 0, 0, y, 'fbed' + (n % 2));
  hedgeRun(sc, 170, 268, 110); hedgeRun(sc, 462, 270, 90); hedgeRun(sc, 440, 384, 220, false, 14);
  fenceRun(sc, 'picket', 570, 276, 680, 276); fenceRun(sc, 'picket', 570, 210, 570, 276);
  fenceRun(sc, 'wood', 190, 404, 340, 404, { color: '#8a6440' }); fenceRun(sc, 'wood', 340, 404, 340, 512);
  sc.vox(D.mailbox('#2c3a66'), 160, 288); sc.vox(D.mailbox('#e8e4dc'), 384, 238); sc.vox(D.mailbox('#3a3a40'), 680, 290);
  sc.vox(D.wheelieBin('#3a6a3a'), 470, 380, 0, 0, 380, 'binG'); sc.vox(D.wheelieBin('#2f5aa8'), 486, 382, 0, 0, 382, 'binB');
  sc.vox(D.wheelieBin('#3a6a3a'), 664, 214, 0, 0, 214, 'binG'); sc.vox(D.wheelieBin('#3a6a3a'), 760, 214);
  sc.vox(D.lawnMower(), 60, 252, 0.3); sc.vox(D.hoop(), 748, 202, PI / 2);
  sc.vox(P.umbrella('#e8dcc0', '#c8b68a'), 252, 456); sc.vox(P.cafeTable(), 252, 462);
  for (const [x, y, h] of [[226, 456, 0], [278, 452, PI], [252, 480, -PI / 2]]) sc.vox(D.patioChair('#f0eee8'), x, y, h, 0, y, 'pchair' + h.toFixed(1));
  sc.vox(D.grill(), 306, 430); sc.vox(D.trampoline(24), 214, 498);
  // vehicles: washing the sedan in the drive, an SUV and a pickup parked, traffic in the junction
  car(sc, 'sedan', 123, 262, -PI / 2, { paint: '#9a3232', parked: true });
  car(sc, 'suv', 432, 228, -PI / 2, { paint: '#2c3a5e', parked: true });
  car(sc, 'pickup', 720, 254, -PI / 2, { paint: '#b08a4a', cargo: [1, 1], parked: true });
  car(sc, 'sedan', 112, 166, -PI / 2, { paint: '#5a5e66', parked: true });
  car(sc, 'sedan', 470, 330, -0.25, { paint: '#d8d4cc' });
  car(sc, 'sedan', 407, 472, PI / 2, { paint: '#2f4a3a' });
  car(sc, 'sedan', 650, 336, 0, { paint: '#2c4060', parked: true });
  // people and the dog
  sc.person(150, 262, 'dad', 6, 'idle'); sc.person(372, 232, null, 0, 'idle', 7101);
  sc.person(330, 252, { ...{}, fem: false, skin: 2, build: 0, hair: { style: 'short', color: 0 }, top: { kind: 'tee', color: 'teal' }, bottom: { kind: 'shorts', color: 'denim' }, shoes: 'white' }, 2, 'walk');
  sc.person(596, 290, 'courier', 2, 'walk'); sc.person(150, 376, 'athleisure', 2, 'walk');
  sc.vox(P.dog('#c88a3a'), 640, 246, PI);
  // planting
  tree(sc, 262, 240, 41, 140, 62); tree(sc, 604, 218, 42, 136, 58); tree(sc, 46, 420, 43, 130, 58);
  tree(sc, 222, 420, 44, 120, 50, { flowers: '#e8a0c0' });
  sc.add(palm(11, 120), 470, 470); sc.add(palm(12, 104), 530, 488); sc.add(cypress(5, 80, 10), 748, 404);
  for (const [x, y, s] of [[16, 290, 1], [196, 238, 2], [282, 292, 3], [548, 286, 4], [760, 290, 5], [360, 392, 6], [446, 404, 7], [30, 384, 8]]) sc.add(bush(80 + s, 13 + (s % 3) * 3, { flowers: s % 2 ? '#e86a90' : null }), x, y);
  lamp(sc, 360, 380, 'street'); lamp(sc, 470, 286, 'street');
  // porch and window light
  for (const [x, y] of [[44, 198], [370, 188], [626, 198]]) sc.windowGlow(x, y + 6, 30, 60, LIGHT.warmWindow, 1.2);
  return sc.finish();
}

// ---- D6 Southside: a rough crossroads - pawn and liquor stores, a vacant lot, chain-link and graffiti -
export function buildSouthside(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 6, {x: [[266, 298, 64], [298, 404, 192], [404, 436, 64]], y: [[268, 300, 64], [300, 396, 192], [396, 428, 64]], walk: 2}), G = sc.G;
  const S = new Streets(DW, DH, { corner: 14, sidewalk: 32, roadKind: 'asphaltWorn' });
  S.road(298, 0, 106, DH).road(0, 300, DW, 96);
  S.zone('rubble', { x: 0, y: 118, w: 262, h: 148 });
  S.zone('grassDry', { x: 652, y: 428, w: 116, h: 84 });
  S.zone('rubble', { x: 680, y: 450, w: 88, h: 62 });
  S.build(); S.paint(G, 6);
  // the road: wear, potholes, cracks, worn markings
  wear(G, 298, 0, 106, 300, 1.8, 31); wear(G, 0, 300, 298, 96, 1.6, 33); wear(G, 404, 300, 364, 96, 1.8, 35); wear(G, 298, 396, 106, 116, 1.6, 37); wear(G, 300, 300, 104, 96, 2.4, 39);
  for (const x of [348, 353]) { laneLine(G, x, 0, 258, false, { yellow: true, wear: 0.35 }); laneLine(G, x, 440, 72, false, { yellow: true, wear: 0.35 }); }
  for (const y of [346, 351]) { laneLine(G, 0, y, 256, true, { yellow: true, wear: 0.35 }); laneLine(G, 446, y, 322, true, { yellow: true, wear: 0.35 }); }
  laneLine(G, 300, 262, 50, true, { width: 3, wear: 0.3 }); laneLine(G, 352, 432, 50, true, { width: 3, wear: 0.3 });
  zebra(G, 304, 270, 96, 22, true, 9); zebra(G, 304, 404, 96, 22, true, 11); zebra(G, 266, 306, 22, 84, false, 13); zebra(G, 410, 306, 22, 84, false, 15);
  manhole(G, 352, 120, 8); manhole(G, 560, 350, 7); manhole(G, 120, 330, 7);
  for (const [x, y] of [[230, 296], [480, 296], [560, 398], [130, 398], [296, 180], [404, 470]]) drain(G, x, y, 14, 5);
  for (const [x, y, rx, ry] of [[330, 214, 14, 6], [372, 338, 10, 5], [260, 372, 16, 6], [326, 470, 12, 5], [470, 372, 9, 4]]) puddle(G, x, y, rx, ry);
  skid(G, 330, 340, 40, 2.2, 3.6);
  const walk = (x, y) => S.isWalk(x, y) && S.kind(x, y) === 'sidewalk';
  pavementCracks(G, walk, 70, 83);
  weeds(G, (x, y) => (S.isWalk(x, y) !== S.isWalk(x, y + 3)) || (walk(x, y) && (x % 22 === 0 || y % 22 === 0)), 0.09, 43);
  weeds(G, (x, y) => S.kind(x, y) === 'rubble' || S.kind(x, y) === 'grassDry', 0.05, 47);
  litter(G, (x, y) => S.isWalk(x, y), 0.004, 71); litter(G, (x, y) => !S.isWalk(x, y) && (S.isWalk(x, y - 5) || S.isWalk(x, y + 5)), 0.01, 73);
  // ---- NW: the vacant lot behind chain-link, a tagged wall, a burnt-out car, a corner building
  sc.building({ w: 262, d: 120, floors: 1, style: 'brick', seed: 61, roof: 'flat', doors: [], windows: [30, 200], grime: 0.8, ivy: 0.6, boarded: 0.6 }, 0, 70);
  sc.building({ w: 200, d: 8, style: 'brick', seed: 62, height: 44, blank: true, graffiti: 3, tagText: 'SOUTH', grime: 0.6 }, 0, 118);
  fenceRun(sc, 'chain', 0, 266, 262, 266, { barbed: true }); fenceRun(sc, 'chain', 262, 118, 262, 266, { barbed: true });
  car(sc, 'sedan', 90, 200, 0.2, { state: 'burnt', parked: true });
  sc.vox(P.dumpster(), 214, 150); sc.vox(D.tires(3), 168, 236); sc.vox(D.mattress(), 40, 240, 0.4); sc.vox(D.oilDrum('#3a5a8a', 1), 236, 196); sc.vox(D.oilDrum('#4a6a3a', 1), 246, 206);
  sc.vox(D.trashBag(), 30, 288); sc.vox(D.trashBag('#3a3a44'), 44, 292); sc.vox(D.warningSign(), 200, 268);
  sc.vox(P.burnBarrel(sc.lampsOn), 140, 160); if (sc.lampsOn) sc.light(140, 160, 22, 70, LIGHT.fire, sc.isNight ? 2 : 0.8);
  // ---- NE: the shop row
  const pawn = sc.building({ w: 164, d: 280, style: 'brick', seed: 63, roof: 'flat', parapet: 6, grime: 0.5, ivy: 0.3,
    shop: { kind: 'pawn', door: 'left', open: true, grille: true, sign: { text: 'CROWN PAWN', bg: '#2a2c38', fg: [236, 206, 120], icon: 'crown', lit: true }, clerkShirt: [80, 70, 60] } }, 420, 268);
  const liq = sc.building({ w: 150, d: 280, style: 'brickDark', seed: 64, roof: 'flat', parapet: 8, grime: 0.6,
    shop: { kind: 'liquor', door: 'right', open: true, grille: true, sign: { text: 'LIQUOR', bg: '#e8e0cc', fg: [180, 40, 46], lit: true }, openSign: { col: [255, 70, 80] }, clerkShirt: [140, 40, 40] } }, 584, 268);
  sc.building({ w: 120, d: 280, floors: 3, style: 'brick', seed: 65, roof: 'flat', fireEscape: [20, 60], boarded: 0.35, grime: 0.9, graffiti: 2, tagText: 'RATS', ivy: 0.4 }, 734, 268);
  sc.onRoof(pawn, P.roofAC(), 40, 200); sc.onRoof(pawn, P.roofAC(false), 110, 230); sc.onRoof(pawn, P.roofVent(), 70, 256); sc.onRoof(pawn, P.skylight(), 90, 190);
  sc.onRoof(liq, P.roofAC(), 50, 210); sc.onRoof(liq, P.waterTank(), 110, 190); sc.onRoof(liq, P.roofVent(), 30, 250);
  sc.vox(D.busShelter(64, sc.lampsOn), 640, 300, 0); sc.vox(P.signPost('#e8e4dc'), 690, 296);
  sc.vox(P.bin(true), 520, 290); sc.vox(P.bin(true), 456, 292); sc.vox(P.hydrant(), 440, 290);
  sc.vox(D.cardboard(), 586, 276); sc.vox(D.trashBag(), 602, 280); sc.vox(D.cardboard(), 470, 274, 0.4);
  // ---- SW and SE: flat roofs seen from above, a second vacant lot
  const sw = sc.building({ w: 250, d: 150, style: 'brick', seed: 66, roof: 'flat', parapet: 6, doors: [], windows: [], ivy: 0.4, northDoors: [{ x: 60, w: 30, col: '#c8a030' }, { x: 180, kind: 'home' }] }, 0, 650);
  const se = sc.building({ w: 214, d: 150, style: 'brick', seed: 67, roof: 'flat', parapet: 6, doors: [], windows: [], ivy: 0.5, grime: 0.6, northDoors: [{ x: 40, w: 30, col: '#2a8a5a' }] }, 432, 650);
  for (const [b, list] of [[sw, [[40, 20, 'ac'], [120, 14, 'acs'], [190, 40, 'vent'], [70, 60, 'dish'], [160, 70, 'ac']]], [se, [[40, 20, 'tank'], [120, 24, 'ac'], [170, 60, 'acs'], [80, 70, 'vent']]]])
    for (const [x, y, k] of list) sc.onRoof(b, k === 'ac' ? P.roofAC() : k === 'acs' ? P.roofAC(false) : k === 'vent' ? P.roofVent() : k === 'dish' ? P.dish() : P.waterTank(), x, y);
  fenceRun(sc, 'chain', 652, 430, 768, 430, { barbed: true }); fenceRun(sc, 'chain', 652, 430, 652, 512);
  sc.vox(D.pallet(), 700, 470, 0.3); sc.vox(D.pallet(), 716, 478, 0.1); sc.vox(P.crate(1), 740, 470); sc.vox(D.tires(2), 690, 500);
  // power poles and sagging wires along the west side of the avenue
  const ph = 124;
  for (const y of [40, 250, 470]) sc.vox(D.powerPole(ph), 278, y, 0, 0, y, 'pole');
  for (const [a, b] of [[40, 250], [250, 470]]) for (const [dx] of D.poleTops(ph)) sc.wire(278 + dx, a, ph - 1, 278 + dx, b, ph - 1, 10);
  for (const [dx] of D.poleTops(ph).slice(1, 3)) sc.wire(278 + dx, 250, ph - 1, 470, 290 + dx * 0.3, 70, 16);
  // traffic
  car(sc, 'sedan', 326, 80, PI / 2, { paint: '#5a5e66' });
  car(sc, 'sedan', 340, 342, -2.6, { paint: '#9a3232' });
  car(sc, 'pickup', 610, 360, PI, { paint: '#3a6a6a', cargo: [2], parked: true });
  car(sc, 'sedan', 378, 470, -PI / 2, { paint: '#3a3e4a' });
  // people: a crew outside the walk-up, shoppers, someone at the bus stop
  sc.person(724, 286, 'enforcer', 0, 'idle'); sc.person(748, 290, 'syndicate', 7, 'idle'); sc.person(706, 278, 'syndicate', 1, 'idle', 3301);
  sc.person(664, 292, null, 0, 'idle', 3302); sc.person(540, 280, null, 6, 'walk', 3303); sc.person(480, 284, 'robber', 2, 'walk');
  sc.person(260, 456, 'student', 4, 'walk'); sc.person(300, 300, null, 0, 'idle', 3304);
  // street furniture, lamps, the signal, the odd tree
  lamp(sc, 284, 288); lamp(sc, 416, 290); lamp(sc, 284, 408); lamp(sc, 416, 410);
  sc.vox(P.trafficSignal(52, 'red', sc.lampsOn), 284, 404); sc.vox(P.pedSignal(sc.lampsOn), 420, 300);
  treeGrate(G, 744, 220, 11); treeGrate(G, 250, 470, 11);
  tree(sc, 744, 222, 61, 130, 42); tree(sc, 250, 472, 62, 120, 40); tree(sc, 170, 60, 63, 120, 40);
  for (const [x, y, s] of [[120, 262, 1], [20, 266, 2], [700, 440, 3], [760, 500, 4]]) sc.add(bush(90 + s, 12 + s * 2), x, y);
  // shop light spilling onto the pavement
  for (const x of [470, 540]) sc.windowGlow(x, 272, 26, 70, LIGHT.warmWindow, 1.2);
  for (const x of [610, 690]) sc.windowGlow(x, 272, 26, 70, [1, 0.85, 0.6], 1.2);
  if (sc.preset !== 'noon') { sc.light(676, 262, 40, 50, LIGHT.neonMagenta, 0.6 + sc.night); sc.light(500, 236, 50, 70, [1, 0.8, 0.4], 0.4 + sc.night * 0.6); }
  return sc.finish();
}

// ---- D2 luxury: a palm boulevard, villas with pools, a gated estate, tennis, the cliff lookout -------
export function buildLuxury(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 2, {x: [[120, 150, 96], [150, 326, 384], [326, 356, 96]], y: [[306, 336, 96], [336, 396, 192], [396, 426, 96]], walk: 3.2, grow: 1.5}), G = sc.G;
  const S = new Streets(DW, DH, { corner: 18, sidewalk: 30, lotKind: 'lawn' });
  S.road(150, 0, 176, DH).road(326, 336, DW - 326, 60);
  S.island(226, -10, 28, 326, 12, 'mulch'); S.island(226, 412, 28, 120, 12, 'mulch');
  // the estate: cobbled forecourt, a planted ring round the fountain, tennis
  S.zone('cobble', { x: 352, y: 100, w: 300, h: 206 });
  S.zone('mulch', { cx: 500, cy: 214, r: 50 });
  S.zone('cobble', { cx: 500, cy: 214, r: 35 });
  S.zone('courtGreen', { x: 668, y: 40, w: 100, h: 200 });
  S.zone('courtBlue', { x: 684, y: 56, w: 84, h: 168 });
  S.zone('cobble', { x: 470, y: 296, w: 80, h: 40 }, { over: true });
  // villas: pool decks
  S.zone('stoneTile', { x: 0, y: 70, w: 126, h: 120 }); S.zone('pool', { x: 16, y: 88, w: 78, h: 66 });
  S.zone('stoneTile', { x: 0, y: 330, w: 126, h: 130 }); S.zone('pool', { x: 10, y: 360, w: 66, h: 70 });
  // the lookout: a promenade, rocks and the sea
  S.zone('stoneTile', { x: 326, y: 396, w: 442, h: 70 }, { over: true });
  const sea = (x, y) => y > 500 - (x - 470) * 0.45 && x > 470;
  S.zone('rock', { x: 326, y: 466, w: 442, h: 46 }, { over: true });
  S.build(); S.paint(G, 2);
  const seaW = (X, Y) => { const x = W.ix(X), y = W.iy(Y); return sea(x, y) && y > 452; };
  for (let Y = 0; Y < G.h; Y++) for (let X = 0; X < G.w; X++) if (seaW(X, Y)) G.put(X, Y, ...seaPixel(X, Y));
  shoreFoam(G, seaW, 25);
  poolWall(G, 16, 88, 78, 6); poolWall(G, 10, 360, 66, 6);
  courtLines(G, 684, 56, 84, 168, true);
  lawnEdge(G, (x, y) => S.kind(x, y) === 'lawn' || S.kind(x, y) === 'mulch');
  laneLine(G, 196, 0, DH, false, { dash: 20, gap: 14, wear: 0.15 }); laneLine(G, 284, 0, DH, false, { dash: 20, gap: 14, wear: 0.15 });
  laneLine(G, 326, 365, 442, true, { yellow: true, dash: 20, gap: 14 });
  zebra(G, 154, 400, 70, 20, true, 17); zebra(G, 256, 400, 66, 20, true, 19); zebra(G, 332, 340, 22, 52, false, 21);
  manhole(G, 184, 140, 7); manhole(G, 300, 470, 7); drain(G, 310, 120, 14, 5); drain(G, 166, 300, 14, 5); drain(G, 600, 334, 14, 5);
  leafLitter(G, [[240, 80], [240, 250], [360, 380]], 50);
  // ---- the estate
  const man = sc.building({ w: 300, d: 110, floors: 2, style: 'stone', wallColor: '#dccfb6', seed: 21, roof: 'flat', parapet: 10, balconies: true,
    doors: [{ x: 132, w: 36, kind: 'door', open: true }], windows: [20, 60, 100, 184, 224, 264], porchLight: true }, 352, 112);
  sc.vox(D.canopy(60, 26, '#2a3050', sc.lampsOn, 46), 502, 124);
  for (const x of [396, 612]) sc.add(cypress(20 + x, 96, 11), x, 118);
  for (const x of [452, 552]) sc.vox(D.topiary('cone'), x, 122, 0, 0, 122, 'topcone');
  for (let a = 0; a < 12; a++) { const x = 500 + Math.cos(a * PI / 6) * 43, y = 214 + Math.sin(a * PI / 6) * 43; sc.add(bush(200 + a, 9, { flowers: ['#e8506a', '#f0c040', '#f4f0ea'][a % 3] }), x, y); }
  sc.vox(D.fountain(30, 2), 500, 214);
  car(sc, 'sedan', 612, 166, 0.1, { paint: '#1c1e24', parked: true }); car(sc, 'sports', 610, 262, -0.3, { paint: '#e8b830', parked: true });
  sc.person(484, 142, 'valet', 0, 'idle'); sc.person(522, 140, 'banker', 0, 'idle'); sc.person(574, 190, 'valet', 6, 'idle', 811);
  // iron fence, the gate between lit pillars, hedge behind
  fenceRun(sc, 'iron', 352, 300, 466, 300); fenceRun(sc, 'iron', 554, 300, 660, 300);
  sc.vox(D.ironGate(76), 510, 300); for (const x of [464, 556]) { sc.vox(D.gatePillar(sc.lampsOn), x, 302, 0, 0, 302, 'gp' + sc.lampsOn); if (sc.lampsOn) sc.light(x, 302, 46, 70, [1, 0.82, 0.55], sc.isNight ? 2 : 0.5); }
  hedgeRun(sc, 356, 290, 100, false, 16); hedgeRun(sc, 560, 290, 100, false, 16);
  // tennis
  sc.vox(D.tennisNet(140), 726, 140); fenceRun(sc, 'chain', 668, 40, 668, 240);
  sc.person(714, 98, 'athleisure', 0, 'idle'); sc.person(740, 200, 'yachtie', 4, 'idle');
  hedgeRun(sc, 664, 252, 104, false, 14); sc.person(690, 280, 'farmer', 2, 'idle', 4401);
  // ---- villas along the west side
  sc.building({ w: 150, d: 110, floors: 2, style: 'stucco', wallColor: '#e8dcc6', pitch: 'hip', roof: 'tile', seed: 23, doors: [{ x: 84, w: 30, kind: 'door', open: true }], windows: [50, 130], shutters: '#3a5a6a' }, -30, 60);
  sc.building({ w: 150, d: 110, floors: 1, style: 'stucco', wallColor: '#e2d0b8', pitch: 'hip', roof: 'tile', seed: 24, doors: [{ x: 70, w: 30, kind: 'door', open: true }], windows: [44, 110], shutters: '#3a5a6a' }, -40, 320);
  for (const [x, y] of [[106, 110], [106, 136]]) sc.vox(D.lounger(), x, y, PI / 2, 0, y, 'loung');
  sc.vox(P.umbrella('#f0ece4', '#f0ece4'), 108, 172); sc.vox(P.umbrella('#f0ece4', '#e8dcc0'), 96, 446);
  for (const [x, y] of [[100, 380], [100, 404]]) sc.vox(D.lounger(), x, y, PI / 2, 0, y, 'loung');
  for (const y of [0, 210, 450]) sc.vox(D.fence('stone', 80), 138, y + 40, PI / 2, 0, y + 40, 'stone80');
  for (const y of [190, 470]) { sc.vox(D.gatePillar(sc.lampsOn, 28), 138, y, 0, 0, y, 'gp28' + sc.lampsOn); }
  hedgeRun(sc, 128, 0, 512, true, 16);
  sc.add(palm(31, 120), 30, 210); sc.add(palm(32, 110), 20, 478); sc.add(cypress(33, 84, 10), 120, 230); sc.vox(D.topiary('ball'), 116, 76);
  // ---- the boulevard: palms and flowers down the median
  for (const y of [40, 170, 290, 440]) { sc.add(palm(40 + y, 132 + (y % 3) * 8), 240, y); }
  for (const y of [100, 230, 470]) sc.vox(P.flowerBed(24), 240, y, PI / 2, 0, y, 'fbmed');
  car(sc, 'suv', 196, 60, PI / 2, { paint: '#d0d0cc' }); car(sc, 'sports', 196, 230, PI / 2, { paint: '#b82a2a' }); car(sc, 'suv', 196, 470, PI / 2, { paint: '#1e2026' });
  car(sc, 'sedan', 290, 300, -PI / 2, { paint: '#2c3a5e' });
  // ---- the lookout
  for (let x = 330; x < DW; x += 80) sc.vox(D.railing(Math.min(80, DW - x)), x + 40, 462, 0, 0, 462, 'rail');
  sc.vox(P.bench(), 620, 444); sc.vox(D.viewer(), 720, 448); sc.vox(P.wireBin(), 590, 446);
  sc.person(690, 450, 'tourist', 4, 'idle'); sc.person(704, 452, 'socialite', 4, 'idle');
  sc.person(420, 420, 'athleisure', 2, 'walk'); sc.person(166, 330, 'banker', 0, 'walk'); sc.person(122, 300, 'socialite', 0, 'walk', 4402);
  for (const [x, s] of [[360, 1], [440, 2], [520, 3], [590, 4]]) sc.add(bush(300 + s, 14, { flowers: s % 2 ? '#e8507a' : '#f0a040' }), x, 412);
  sc.add(palm(51, 116), 470, 420); sc.add(palm(52, 104), 560, 430);
  for (const [x, y, s, z] of [[500, 498, 1, 20], [560, 480, 2, 26], [640, 470, 3, 22], [720, 476, 4, 30], [610, 506, 5, 18], [700, 506, 6, 16]]) sc.vox(D.boulder(s, z), x, y);
  lamp(sc, 340, 300, 'cast'); lamp(sc, 140, 300, 'cast'); lamp(sc, 340, 120, 'cast'); lamp(sc, 140, 60, 'cast'); lamp(sc, 340, 410, 'cast');
  sc.windowGlow(502, 60, 30, 90, LIGHT.warmWindow, 1.4);
  return sc.finish();
}
export function seaPixel(x, y) {
  const sw = Math.sin(y * 0.2 + Math.sin(x * 0.05) * 3), t = 0.4 + sw * 0.12 + ((x * 7 + y * 3) % 11 === 0 ? 0.15 : 0);
  const c = t > 0.5 ? [48, 128, 160] : t > 0.38 ? [30, 104, 140] : [22, 80, 116];
  return [c, [0, Math.cos(y * 0.2) * 0.15, 1], 0, null, 1 | 2];
}

// ---- D1 downtown: a hotel plaza, a bus-only lane, food trucks, banner lamps -----------------------------
export function buildDowntown(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 1, {x: [[60, 100, 112], [100, 218, 256], [218, 258, 112]], y: [[312, 352, 112], [352, 426, 192], [426, 466, 112]], walk: 2.8, grow: 1.5}), G = sc.G;
  const S = new Streets(DW, DH, { corner: 22, sidewalk: 40, lotKind: 'plaza' });
  S.road(100, 0, 118, DH).road(0, 352, DW, 74);
  S.zone('asphaltRed', { x: 100, y: 0, w: 46, h: 352 }, { road: true });
  S.zone('cobble', { x: 380, y: 112, w: 220, h: 60 });
  S.zone('paver', { x: 0, y: 0, w: 100, h: 352 });
  S.zone('paver', { x: 218, y: 426, w: 550, h: 86 });
  S.build(); S.paint(G, 1);
  wear(G, 100, 0, 118, 352, 0.6, 51); wear(G, 0, 352, DW, 74, 0.7, 53);
  laneLine(G, 146, 0, 300, false, { width: 3 }); laneLine(G, 182, 0, 300, false, { dash: 18, gap: 12 });
  roadText(G, 'BUS', 110, 236, { sx: 3, sy: 6 }); roadText(G, 'ONLY', 108, 274, { sx: 2, sy: 6 });
  laneLine(G, 0, 388, 70, true, { yellow: true, dash: 18, gap: 12 }); laneLine(G, 260, 388, 508, true, { yellow: true, dash: 18, gap: 12 });
  laneLine(G, 100, 316, 118, true, { width: 3 }); laneLine(G, 100, 440, 118, true, { width: 3 });
  zebra(G, 104, 322, 110, 24, true, 23); zebra(G, 104, 432, 110, 24, true, 25); zebra(G, 70, 358, 24, 64, false, 27); zebra(G, 224, 358, 24, 64, false, 29);
  manhole(G, 160, 90, 7); manhole(G, 520, 400, 7); drain(G, 222, 200, 5, 14); drain(G, 400, 350, 14, 5); drain(G, 96, 120, 5, 14);
  for (const [x, y] of [[40, 80], [40, 200], [40, 300], [262, 470], [690, 470]]) treeGrate(G, x, y, 13);
  leafLitter(G, [[40, 80], [40, 200], [262, 470]], 40);
  // ---- the hotel and its neighbours
  const hotel = sc.building({ w: 300, d: 120, floors: 5, style: 'glass', seed: 11, roof: 'flat',
    shop: { kind: 'lobby', door: 128, open: true, sign: { text: 'HARBORVIEW HOTEL', bg: '#232838', fg: [236, 214, 150], lit: true }, people: 3 } }, 340, 112);
  sc.building({ w: 120, d: 120, floors: 4, style: 'glass', seed: 12, roof: 'flat', shop: { kind: 'cafe', door: 'left', open: true, awning: ['#2a3e7a', '#e8e4dc'], people: 3 } }, 660, 150);
  sc.building({ w: 120, d: 100, floors: 6, style: 'concrete', seed: 13, roof: 'flat', balconies: true, shop: { kind: 'mart', door: 'right', open: true, band: ['#2a3e7a', '#e8e4dc'] } }, 222, 60);
  sc.vox(D.canopy(96, 26, '#232838', sc.lampsOn, 42), 486, 126);
  sc.vox(D.luggageCart(), 440, 132); sc.person(462, 136, 'valet', 0, 'idle'); sc.person(520, 140, 'banker', 4, 'walk'); sc.person(540, 132, 'socialite', 6, 'idle');
  car(sc, 'limo', 500, 160, PI, { parked: true });
  for (const x of [410, 580]) sc.vox(D.topiary('cone', '#5a5e66'), x, 116, 0, 0, 116, 'tcone');
  // the plaza: fountain, benches, planters with trees, a monument sign
  sc.vox(D.fountainRect(120, 62), 500, 246);
  for (const x of [460, 540]) sc.vox(P.bench(), x, 290, 0, 0, 290, 'bench');
  for (const [x, y] of [[300, 210], [300, 300], [700, 250], [640, 320]]) { sc.vox(D.planterBox(34, 34), x, y, 0, 0, y, 'pbox'); sc.add(leafyTree(70 + x, 120, 40), x, y, 10, y + 0.5); }
  for (const [x, y] of [[430, 210], [570, 210]]) sc.vox(D.planterBox(30, 20, true), x, y, 0, 0, y, 'pbox2');
  sc.building({ w: 70, d: 12, style: 'stone', seed: 14, height: 34, blank: true }, 690, 190);
  // food trucks along the plaza side of the street, with a queue at each hatch
  car(sc, 'foodtruck', 300, 400, 0, { paint: '#2f6ab0', parked: true }); car(sc, 'foodtruck', 450, 400, 0, { paint: '#b8343a', parked: true }); car(sc, 'foodtruck', 600, 400, 0, { paint: '#e0c050', parked: true });
  for (const [x, k] of [[290, 'student'], [312, null], [440, 'office'], [462, 'nurse'], [590, 'courier'], [612, 'banker']]) sc.person(x, 452, k, 4, 'idle', x * 3);
  for (const x of [342, 492, 642]) sc.vox(P.chalkboard(), x, 444, 0, 0, 444, 'chalk');
  for (const x of [300, 450, 600]) sc.light(x, 432, 30, 60, LIGHT.warmWindow, sc.win * 1.2);
  // the west sidewalk: bus stop, banner lamps, trees
  sc.vox(D.busShelter(70, sc.lampsOn), 70, 150, -PI / 2); car(sc, 'bus', 124, 160, PI / 2, { paint: '#e8e0cc' });
  sc.person(66, 196, 'student', 2, 'idle'); sc.person(70, 220, 'granny', 0, 'idle');
  for (const [x, y] of [[40, 80], [40, 200], [40, 300]]) tree(sc, x, y, 80 + y, 128, 42);
  // traffic
  car(sc, 'taxi', 196, 240, PI / 2); car(sc, 'suv', 196, 40, PI / 2, { paint: '#1e2026' }); car(sc, 'sedan', 40, 404, 0, { paint: '#a83030' });
  car(sc, 'sedan', 720, 372, PI, { paint: '#3a5e7a' });
  // the south side: planters, a metro advert kiosk, benches, a low roof garden building
  sc.vox(D.adKiosk(sc.lampsOn, '#3a6ac0'), 520, 500); sc.vox(P.bench(), 400, 500); sc.vox(P.wireBin(), 560, 498);
  for (const x of [330, 680]) sc.vox(D.planterBox(60, 20), x, 504, 0, 0, 504, 'pbox3');
  tree(sc, 262, 472, 91, 124, 42); sc.add(palm(92, 110), 690, 476);
  const low = sc.building({ w: 140, d: 120, floors: 1, style: 'brick', seed: 15, roof: 'terrace', doors: [], windows: [] }, 640, 620);
  sc.onRoof(low, P.roofPlanter(40), 20, 20); sc.onRoof(low, P.pottedPalm(), 100, 30);
  // people crossing and walking
  const walkers = [[160, 328, 'office', 2], [190, 446, 'banker', 6], [250, 160, 'barista', 0], [620, 180, 'tourist', 0], [720, 300, 'office', 4], [360, 300, 'courier', 2],
    [600, 300, null, 6], [252, 470, 'student', 2], [380, 470, 'dad', 6], [700, 456, null, 2], [20, 340, 'nurse', 0], [80, 460, null, 2]];
  for (const [x, y, k, d] of walkers) sc.person(x, y, k, d, 'walk', x + y);
  // lamps and signals
  for (const [x, y] of [[90, 60], [90, 260], [230, 320], [230, 140], [380, 300], [620, 300], [230, 440], [560, 440]]) lamp(sc, x, y, '#2a3e7a');
  sc.vox(P.trafficSignal(56, 'green', sc.lampsOn), 92, 332); sc.vox(P.trafficSignal(56, 'red', sc.lampsOn), 226, 432, PI);
  for (const x of [380, 500, 620]) sc.windowGlow(x, 112, 30, 90, LIGHT.warmWindow, 1.3);
  return sc.finish();
}

export const DISTRICTS = { suburbs: buildSuburbs, southside: buildSouthside, luxury: buildLuxury, downtown: buildDowntown };
export const DISTRICT_TARGETS = { suburbs: 'D9_suburbs.png', southside: 'D6_southside.png', luxury: 'D2_luxury.png', downtown: 'D1_downtown.png' };
