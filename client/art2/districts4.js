// Art v2 district scenes, part 4: the rest of the city, built to the D3, D4, D5, D8, D16 and D17
// targets - the commercial strip and mall, the apartment courtyard, the Old Town market square, the
// neon strip, the islands and a block where luxury, mid-income and rough streets meet. Same composer
// and conventions as districts.js (768 x 512 world px).
//
// CITY_DISTRICTS[name](preset) -> { G, lights }; CITY_TARGETS[name] -> the target image file
import { Scene, Streets } from './scene.js';
import { laneLine, zebra, manhole, drain, wear, weeds, leafLitter, treeGrate, puddle, litter, stain, lawnEdge, shoreFoam, parkingLines, pavementCracks, courtLines, poolWall, roadText } from './ground-warped.js';
import { W } from './warp.js';
import * as P from './props.js';
import * as D from './props-district.js';
import * as X from './props-transit.js';
import * as K from './props-park.js';
import * as U from './props-rural.js';
import * as T from './props-town.js';
import { vehicleModel } from './vehicles.js';
import { animalModel } from './animals.js';
import { makeBuilding } from './buildings.js';
import { palm, leafyTree, bush, cypress } from './trees.js';
import { MAT, LIGHT } from './palette.js';
import { hash } from './gbuf.js';
import { DW, DH, car, lamp, tree, fenceRun, hedgeRun, seaPixel } from './districts.js';
import { EVERY_DISTRICT, EVERY_TARGET } from './districts3.js';

const PI = Math.PI;
const pet = (sc, kind, x, y, hd = 0, o = {}) => sc.vox(animalModel(kind, o), x, y, hd);
const roofKit = (sc, b, list) => { for (const [k, x, y] of list) sc.onRoof(b, k === 'ac' ? P.roofAC() : k === 'acs' ? P.roofAC(false) : k === 'vent' ? P.roofVent() : k === 'dish' ? P.dish() : k === 'tank' ? P.waterTank() : k === 'sky' ? P.skylight() : k === 'plant' ? P.roofPlanter(30) : k === 'palm' ? P.pottedPalm() : k === 'solar' ? T.solarPanel() : P.roofVent(), x, y); };
// a free-standing sign face (a billboard, a neon word, a mural panel) as a thin wall sprite, raised dz
function signFace(sc, x, y, w, h, plaques, opt = {}) {
  const spr = makeBuilding({ w, d: 3, style: opt.style || 'stucco', wallColor: opt.color || '#2a2c38', seed: opt.seed || 7, height: h, blank: true, night: sc.night, plaques, mural: opt.mural });
  return sc.add(spr, x, y, opt.dz || 0, opt.base ?? y);
}
// a glowing neon word on a dark board, with matching light thrown onto the street
function neon(sc, x, y, text, col, opt = {}) {
  const sx = opt.sx || 2, w = opt.w || text.length * 4 * sx + 14, h = 5 * sx + 10;
  signFace(sc, x, y, w, h, [{ text, x: 0, v: 2, sx, sy: sx, fg: col, lit: true, w }], { color: opt.bg || '#1c1a28', dz: opt.dz || 0, base: opt.base });
  if (sc.preset !== 'noon') sc.light(x + w / 2, y + 30, (opt.dz || 0) + 20, 140, col.map((c) => c / 255), sc.isNight ? 2.2 : 0.6);
}

// ---- D5 Old Town: the market square, the church, a café terrace, cobbled lanes, terracotta roofs ------
export function buildOldTown(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 5, {x: [[190, 246, 120]], y: [[392, 454, 176]], walk: 1, grow: 1.3}), G = sc.G;
  const S = new Streets(DW, DH, { corner: 18, sidewalk: 0, roadKind: 'asphaltWorn', lotKind: 'cobble' });
  S.road(0, 392, DW, 62).road(190, 0, 56, 392);
  S.zone('paver', { x: 270, y: 236, w: 498, h: 156 });
  S.zone('cobble', { cx: 560, cy: 314, r: 52 }); S.zone('mulch', { cx: 560, cy: 314, r: 30 });
  S.build(); S.paint(G, 5);
  wear(G, 0, 392, DW, 62, 0.9, 51); wear(G, 190, 0, 56, 392, 0.8, 53);
  zebra(G, 440, 396, 30, 54, false, 55); zebra(G, 194, 340, 48, 24, true, 57); manhole(G, 370, 420, 7);
  leafLitter(G, [[100, 470], [520, 480], [740, 320]], 60);
  // the church: a stone gable front with a rose window, a carved door and stained-glass lancets
  const ch = sc.building({ w: 240, d: 170, floors: 2, style: 'stone', wallColor: '#a8a49a', pitch: 'gable', ridge: 'ns', slope: 0.7, roof: 'tile', seed: 51, blank: true,
    arches: [{ x: 100, w: 40, h: 62, kind: 'door' }, { x: 30, w: 18, h: 52, v: 36, kind: 'lancet' }, { x: 192, w: 18, h: 52, v: 36, kind: 'lancet' }], rose: { x: 120, v: 92, r: 16 } }, 470, 220);
  sc.vox(K.steps(80, 4, 4, 5, '#cfc6b4'), 590, 232);
  fenceRun(sc, 'iron', 430, 236, 560, 236); fenceRun(sc, 'iron', 620, 236, 768, 236);
  sc.add(cypress(511, 120, 14), 452, 214); sc.add(cypress(512, 116, 13), 742, 214);
  for (const x of [560, 620]) sc.vox(D.topiary('cone'), x, 244, 0, 0, 244, 'tcone');
  // the market: stalls round the square, the statue in its flower ring, pigeons
  const stalls = [[330, 286, '#2f7a5c', '#f0ece4'], [410, 270, '#f0ece4', '#f0ece4'], [320, 360, '#c8343a', '#f0ece4'], [420, 360, '#2f7a5c', '#2f7a5c'], [690, 330, '#2f7a5c', '#f0ece4']];
  stalls.forEach(([x, y, a, b], i) => { sc.vox(T.marketStall(a, b, i + 3), x, y); sc.person(x + (i % 2 ? 12 : -10), y - 6, 'farmer', 0, 'idle', 5100 + i); });
  sc.vox(K.statue(), 560, 314);
  for (let a = 0; a < 10; a++) sc.add(bush(5200 + a, 8, { flowers: ['#e8507a', '#f0c040', '#f4f0ea', '#9a6ad8'][a % 4] }), 560 + Math.cos(a * 0.628) * 40, 314 + Math.sin(a * 0.628) * 36);
  for (const [x, y, h] of [[610, 290, 0.5], [630, 300, 2.4], [500, 360, 1]]) sc.vox(T.pigeon(), x, y, h, 0, y, 'pigeon' + h);
  sc.vox(P.bench(), 640, 262); sc.person(640, 266, 'granny', 0, 'idle', 5199);
  // the café terrace on the north-west corner
  const cafe = sc.building({ w: 180, d: 150, floors: 3, style: 'peach', seed: 52, roof: 'flat', balconies: true, shop: { kind: 'cafe', door: 'right', open: true, awning: ['#a8343a', '#a8343a'], people: 3 } }, 0, 160);
  roofKit(sc, cafe, [['plant', 30, 30], ['ac', 120, 40], ['palm', 70, 90]]);
  for (const [x, y] of [[30, 190], [80, 196], [130, 190]]) { sc.vox(P.cafeTable(), x, y, 0, 0, y, 'ctable'); sc.person(x - 12, y + 2, null, 2, 'idle', x * 11); sc.person(x + 12, y + 4, null, 6, 'idle', x * 13); }
  sc.vox(P.chalkboard(), 172, 184); sc.person(160, 176, 'barista', 0, 'idle', 5205);
  // more of the old town: a yellow house with terracotta roof, a brick house with window boxes north of the square
  sc.building({ w: 180, d: 150, floors: 2, style: 'stucco', wallColor: '#d8b45a', pitch: 'hip', roof: 'tile', seed: 53, doors: [{ x: 70, w: 22, kind: 'door' }], windows: [20, 120, 150], shutters: '#2e5a4a', porchLight: true }, 0, 380);
  sc.vox(P.scooter('#c8342e'), 150, 372); sc.vox(P.laundryLine(60), 90, 300);
  sc.building({ w: 180, d: 150, floors: 3, style: 'brick', seed: 54, roof: 'flat', doors: [{ x: 30, w: 20, kind: 'door' }], windows: [80, 120, 150], porchLight: true }, 270, 220);
  // south of the street: rooftops, tile and flat, a roof terrace
  const s1 = sc.building({ w: 200, d: 150, style: 'stucco', wallColor: '#d8c8a8', pitch: 'hip', roof: 'tile', seed: 55, blank: true }, 0, 660);
  const s2 = sc.building({ w: 180, d: 150, style: 'stucco', wallColor: '#c8b898', seed: 56, roof: 'flat', parapet: 6, blank: true }, 260, 660);
  const s3 = sc.building({ w: 160, d: 150, style: 'brick', seed: 57, roof: 'terrace', blank: true }, 470, 660);
  sc.building({ w: 130, d: 150, style: 'stucco', wallColor: '#d8b48a', pitch: 'hip', roof: 'tile', seed: 58, blank: true }, 640, 660);
  roofKit(sc, s2, [['ac', 30, 20], ['ac', 90, 30], ['tank', 140, 20]]); roofKit(sc, s3, [['plant', 20, 20], ['palm', 100, 30], ['plant', 60, 60]]);
  // lanes: lamps, bollards with chain round the square, trees, people, cars
  for (const x of [290, 400, 640]) sc.vox(T.chainBollards(60), x, 388, 0, 0, 388, 'chain');
  for (const [x, y] of [[180, 100], [260, 200], [180, 330], [470, 384], [750, 300], [300, 466], [620, 466]]) lamp(sc, x, y, 'cast');
  tree(sc, 740, 300, 5301, 130, 44); tree(sc, 200, 476, 5302, 120, 44); tree(sc, 540, 482, 5303, 124, 46);
  car(sc, 'sedan', 340, 422, 0, { paint: '#2f4a4a' }); car(sc, 'compact', 218, 90, PI / 2, { paint: '#2c3040', parked: true }); car(sc, 'sedan', 740, 422, PI, { paint: '#2f5a5a', parked: true });
  for (const [x, y, k, d] of [[300, 252, null, 2], [370, 250, 'student', 6], [480, 300, 'tourist', 2], [640, 360, 'dad', 6], [260, 300, 'granny', 0], [600, 384, null, 2], [380, 330, 'nurse', 0], [230, 230, 'dad', 0]]) sc.person(x, y, k, d, 'walk', x * 5 + y);
  pet(sc, 'spaniel', 250, 236, 0.4);
  return sc.finish();
}

// ---- D4 apartments: walk-ups round a courtyard with a basketball court, the corner mart, parked cars ----
export function buildApartments(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 4, {x: [[0, 100, 280], [100, 130, 64]], y: [[380, 410, 64], [410, 476, 280], [476, 506, 64]], walk: 2.1333333333333333, grow: 1.5}), G = sc.G;
  const S = new Streets(DW, DH, { corner: 20, sidewalk: 30, lotKind: 'paver' });
  S.road(0, 0, 100, DH).road(100, 410, DW - 100, 66);
  S.zone('asphalt', { x: 380, y: 200, w: 150, h: 130 });
  S.zone('mulch', { x: 290, y: 150, w: 70, h: 30 }); S.zone('mulch', { x: 540, y: 330, w: 40, h: 50 });
  S.build(); S.paint(G, 4);
  wear(G, 0, 0, 100, DH, 0.8, 41); wear(G, 100, 410, 668, 66, 0.9, 43);
  for (const x of [46, 51]) laneLine(G, x, 0, 380, false, { yellow: true }); laneLine(G, 100, 443, 668, true, { dash: 18, gap: 14, wear: 0.3 });
  zebra(G, 4, 384, 92, 24, true, 45); zebra(G, 104, 414, 24, 58, false, 47);
  courtLines(G, 380, 200, 150, 130, false);
  for (let x = 110; x < 760; x += 70) laneLine(G, x, 470, 6, false, { width: 2 });
  manhole(G, 40, 470, 7); drain(G, 300, 406, 14, 5); litter(G, (x, y) => S.isWalk(x, y), 0.0015, 49);
  // the corner walk-up with the mart on its ground floor; the north row with stoops; the tall east block
  const mart = sc.building({ w: 170, d: 260, floors: 3, style: 'brick', seed: 41, roof: 'flat', fireEscape: [100, 50], shop: { kind: 'mart', door: 'left', open: true, awning: ['#2f7a5c', '#f0ece4'], sign: { text: 'LUCKY MART', bg: '#f0ece4', fg: [190, 40, 46] }, openSign: { col: [255, 60, 70] }, clerkShirt: [44, 140, 110] } }, 110, 404);
  roofKit(sc, mart, [['ac', 30, 40], ['ac', 90, 60], ['plant', 40, 120], ['vent', 120, 160], ['plant', 100, 200]]);
  const north = sc.building({ w: 300, d: 120, floors: 4, style: 'brick', seed: 42, roof: 'flat', fireEscape: [230, 50], doors: [{ x: 140, w: 22, kind: 'door' }], windows: [30, 70, 200, 250], porchLight: true }, 290, 140);
  sc.vox(K.steps(40, 3, 4, 5, '#cfc6b4'), 451, 148);
  const east = sc.building({ w: 180, d: 340, floors: 5, style: 'brick', seed: 43, roof: 'flat', balconies: true, doors: [], windows: [20, 140], plaques: [{ text: 'A BRIGHTER', x: 30, v: 230, sx: 2 , fg: [240, 230, 210] }, { text: 'NEIGHBORHOOD', x: 16, v: 210, sx: 2, fg: [240, 230, 210] }, { text: 'TOGETHER', x: 44, v: 190, sx: 2, fg: [240, 230, 210] }] }, 590, 404);
  roofKit(sc, east, [['tank', 120, 40], ['ac', 40, 60], ['ac', 60, 140], ['plant', 100, 200]]);
  // the court: hoop, iron fence, players; benches, trees, a laundry line, the gate in a low brick wall
  sc.vox(D.hoop(), 455, 200, PI / 2);
  fenceRun(sc, 'iron', 374, 196, 374, 336); fenceRun(sc, 'iron', 536, 196, 536, 336); fenceRun(sc, 'iron', 374, 196, 536, 196);
  for (const [x, y, d] of [[440, 236, 4], [470, 260, 4], [500, 280, 6]]) sc.person(x, y, { skin: (x + y) % 5, build: 0, hair: { style: 'short', color: x % 6 }, top: { kind: 'tee', color: x % 2 ? 'red' : 'white' }, bottom: { kind: 'shorts', color: 'black' }, shoes: 'white' }, d, 'walk');
  sc.vox(P.bench(), 455, 370); sc.person(440, 372, null, 4, 'idle', 4101); sc.person(470, 372, null, 4, 'idle', 4102);
  sc.vox(P.bench(), 330, 200); sc.vox(P.laundryLine(70), 560, 300, PI / 2);
  for (const [x, y] of [[325, 165], [560, 355]]) tree(sc, x, y, x + 4, 130, 44);
  sc.building({ w: 210, d: 8, style: 'brick', seed: 44, height: 22, blank: true }, 280, 390); sc.building({ w: 110, d: 8, style: 'brick', seed: 45, height: 22, blank: true }, 520, 390);
  sc.vox(D.ironGate(30, 22), 505, 390); sc.vox(X.bikeRack(2), 300, 376);
  // the street: parked cars, trees in planters, mailbox, hydrant, people, a dog walker
  car(sc, 'suv', 260, 448, 0, { paint: '#2f6a5a', parked: true }); car(sc, 'sedan', 400, 448, 0, { paint: '#3a5a8a', parked: true }); car(sc, 'pickup', 560, 448, 0, { paint: '#8a2e2e', cargo: [1], parked: true }); sc.vox(P.scooter('#3a6a4a'), 700, 452);
  car(sc, 'sedan', 30, 80, PI / 2, { paint: '#a83030' }); car(sc, 'sedan', 70, 240, -PI / 2, { paint: '#3a5a7a' }); car(sc, 'sedan', 30, 320, PI / 2, { paint: '#c8c8c4' });
  for (const x of [340, 520, 700]) { sc.vox(D.planterBox(30, 20), x, 404, 0, 0, 404, 'pbx'); sc.add(leafyTree(x, 120, 42), x, 404, 10, 404.5); }
  sc.vox(D.mailbox('#2c3a66'), 300, 400); sc.vox(P.hydrant(), 130, 410); sc.vox(P.signPost('#2e7a4e'), 104, 384);
  for (const [x, y, k, d] of [[150, 396, 'student', 0], [240, 384, null, 2], [400, 398, 'courier', 2], [620, 396, 'dad', 6], [130, 300, 'barista', 4]]) sc.person(x, y, k, d, 'walk', x * 7 + y);
  sc.person(660, 396, null, 2, 'walk', 4120); pet(sc, 'terrier', 684, 400, 0, { phase: 0.4 });
  lamp(sc, 104, 300, 'cast'); lamp(sc, 360, 404, 'cast'); lamp(sc, 104, 120, 'cast');
  // south rooftops
  const r1 = sc.building({ w: 260, d: 150, style: 'brick', seed: 46, roof: 'flat', parapet: 6, blank: true }, 120, 730);
  const r2 = sc.building({ w: 300, d: 150, style: 'brick', seed: 47, roof: 'flat', parapet: 6, blank: true }, 420, 730);
  roofKit(sc, r1, [['ac', 40, 20], ['ac', 100, 30], ['plant', 180, 20]]); roofKit(sc, r2, [['dish', 60, 30], ['ac', 160, 20], ['tank', 240, 30]]);
  return sc.finish();
}

// ---- D8 neon strip: clubs, a cocktail bar and an arcade under neon, a crossroads slick with rain ------
export function buildNightlife(preset = 'rain') {
  const sc = new Scene(DW, DH, preset, 8, {x: [[260, 300, 96], [300, 420, 192], [420, 460, 96]], y: [[290, 330, 96], [330, 410, 192], [410, 450, 96]], walk: 2.4, grow: 1.5}), G = sc.G;
  const S = new Streets(DW, DH, { corner: 20, sidewalk: 40, lotKind: 'sidewalk' });
  S.road(300, 0, 120, DH).road(0, 330, DW, 80);
  S.zone('asphalt', { x: 0, y: 430, w: 250, h: 82 });
  S.build(); S.paint(G, 8);
  wear(G, 300, 0, 120, DH, 1, 81); wear(G, 0, 330, DW, 80, 1, 83);
  for (const x of [356, 361]) { laneLine(G, x, 0, 290, false, { yellow: true }); laneLine(G, x, 450, 62, false, { yellow: true }); }
  for (const y of [367, 372]) { laneLine(G, 0, y, 260, true, { yellow: true }); laneLine(G, 460, y, 308, true, { yellow: true }); }
  zebra(G, 304, 302, 112, 24, true, 85); zebra(G, 304, 414, 112, 24, true, 87); zebra(G, 268, 336, 24, 68, false, 89); zebra(G, 428, 336, 24, 68, false, 91);
  parkingLines(G, 10, 440, 4, 60, 70);
  for (const [x, y, rx, ry] of [[330, 200, 16, 6], [380, 360, 12, 5], [200, 380, 18, 6], [560, 350, 14, 5], [340, 470, 12, 5], [120, 300, 10, 4], [640, 300, 12, 4]]) puddle(G, x, y, rx, ry);
  litter(G, (x, y) => S.isWalk(x, y), 0.003, 93);
  // the north row: the club, the cocktail bar, the arcade; neon over each
  sc.building({ w: 280, d: 150, floors: 2, style: 'brickDark', seed: 81, roof: 'flat', parapet: 8, grime: 0.4, shop: { kind: 'bar', door: 120, open: true, people: 4 } }, 0, 290);
  neon(sc, 60, 214, 'VELVET CLUB', [255, 70, 220], { sx: 3, dz: 0, base: 291 });
  sc.building({ w: 210, d: 150, floors: 2, style: 'stucco', wallColor: '#3a2a4a', seed: 82, roof: 'flat', parapet: 8, shop: { kind: 'bar', door: 'left', open: true, people: 5, awning: ['#2a1e3a', '#2a1e3a'] } }, 440, 290);
  neon(sc, 470, 214, 'PINK MILE', [255, 90, 190], { sx: 3, base: 291 });
  sc.building({ w: 120, d: 150, floors: 3, style: 'brick', seed: 83, roof: 'flat', fireEscape: [20, 50], shop: { kind: 'arcade', door: 'right', open: true, people: 2 } }, 650, 290);
  neon(sc, 654, 222, 'ARCADE', [90, 230, 255], { sx: 2, base: 291 });
  signFace(sc, 744, 236, 18, 72, ['M', 'O', 'T', 'E', 'L'].map((t, i) => ({ text: t, x: 0, v: 58 - i * 12, sx: 2, fg: [255, 150, 60], lit: true, w: 18 })), { dz: 60, base: 291 });
  if (sc.preset !== 'noon') sc.light(752, 260, 90, 120, [1, 0.6, 0.25], sc.isNight ? 1.6 : 0.4);
  // queues behind velvet ropes, a bouncer at each door
  sc.vox(T.ropeLine(100), 80, 300); sc.vox(T.ropeLine(80), 500, 300);
  for (let i = 0; i < 6; i++) sc.person(70 + i * 18, 312, ['punk', 'athleisure', null, 'socialite', null, 'tracksuit'][i], 6, 'idle', 8100 + i);
  for (let i = 0; i < 5; i++) sc.person(490 + i * 18, 312, [null, 'socialite', 'punk', null, 'athleisure'][i], 6, 'idle', 8200 + i);
  sc.person(130, 296, 'guard', 0, 'idle', 8300); sc.person(462, 296, 'guard', 0, 'idle', 8301);
  sc.person(700, 316, 'student', 4, 'idle'); sc.person(730, 310, 'punk', 4, 'idle', 8302);
  // the street: a red convertible, a taxi, a lowrider, cars in the lot; lamps, signals, bins, palms
  car(sc, 'sports', 210, 352, 0, { paint: '#c8303a' }); car(sc, 'taxi', 334, 80, PI / 2); car(sc, 'sedan', 390, 470, -PI / 2, { paint: '#2a2c38' });
  car(sc, 'limo', 640, 392, PI, { paint: '#2a6a7a' });
  car(sc, 'sedan', 40, 476, -PI / 2, { paint: '#3a5a8a', parked: true }); car(sc, 'sedan', 160, 476, -PI / 2, { paint: '#a83030', parked: true });
  for (const [x, y] of [[286, 300], [434, 300], [286, 420], [434, 420], [600, 300]]) lamp(sc, x, y, 'cast');
  sc.vox(P.trafficSignal(52, 'red', sc.lampsOn), 290, 310); sc.vox(P.trafficSignal(52, 'red', sc.lampsOn), 430, 420, PI);
  sc.vox(P.wireBin(), 280, 270); sc.vox(P.wireBin(), 440, 270); sc.vox(P.dumpster(), 230, 500);
  sc.add(palm(8401, 120), 440, 316); sc.add(palm(8402, 112), 700, 500); sc.add(palm(8403, 116), 270, 470);
  sc.vox(D.busShelter(60, sc.lampsOn), 470, 450, PI); sc.vox(D.adKiosk(sc.lampsOn, '#d84a7a'), 540, 452);
  for (const [x, y, k, d] of [[330, 314, null, 2], [380, 316, 'punk', 2], [520, 420, null, 6], [270, 200, 'socialite', 4], [460, 150, null, 0], [600, 440, 'tracksuit', 2]]) sc.person(x, y, k, d, 'walk', x * 3 + y);
  // south: rooftops with AC
  const r1 = sc.building({ w: 300, d: 150, style: 'concrete', seed: 84, roof: 'flat', parapet: 6, blank: true }, 460, 670);
  roofKit(sc, r1, [['ac', 30, 20], ['ac', 80, 20], ['acs', 140, 30], ['vent', 200, 20], ['dish', 260, 40]]);
  if (sc.preset !== 'noon') { sc.light(560, 240, 40, 140, LIGHT.neonMagenta, sc.isNight ? 1.8 : 0.5); sc.light(140, 240, 40, 140, LIGHT.neonMagenta, sc.isNight ? 1.8 : 0.5); sc.light(700, 250, 40, 110, LIGHT.neonCyan, sc.isNight ? 1.8 : 0.5); }
  return sc.finish();
}

// ---- D3 commercial strip: shopfronts under a billboard, the mall entrance, the stadium, deliveries -----
export function buildCommercial(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 3, {x: [[360, 400, 96], [400, 472, 192], [472, 512, 96]], y: [[210, 250, 96], [250, 340, 344], [340, 380, 96]], walk: 2.4, grow: 1.5}), G = sc.G;
  const S = new Streets(DW, DH, { corner: 20, sidewalk: 40, lotKind: 'paver' });
  S.road(0, 250, DW, 90).road(400, 340, 72, DH - 340);
  S.island(0, 290, 380, 10, 4, 'mulch');
  S.zone('asphalt', { x: 470, y: 0, w: 298, h: 60 });
  S.build(); S.paint(G, 3);
  wear(G, 0, 250, DW, 90, 0.7, 31);
  laneLine(G, 380, 294, 388, true, { yellow: true }); laneLine(G, 380, 299, 388, true, { yellow: true });
  laneLine(G, 0, 272, 380, true, { dash: 18, gap: 12 }); laneLine(G, 0, 318, 380, true, { dash: 18, gap: 12 });
  zebra(G, 404, 344, 64, 24, true, 33); zebra(G, 376, 256, 22, 80, false, 35); zebra(G, 474, 256, 22, 80, false, 37);
  parkingLines(G, 480, 0, 4, 64, 56);
  // the shop row with a billboard on its roof
  const shops = [['PALM & CO', '#2e5a4a', [236, 214, 160], 'mart', ['#2e5a4a', '#2e5a4a']], ['GOOD DAYS', '#5a2a2a', [240, 220, 190], 'cafe', ['#c8343a', '#f0ece4']], ['RIVERTON', '#e8e0cc', [40, 70, 90], 'mart', ['#2e7a6a', '#2e7a6a']]];
  shops.forEach(([text, bg, fg, kind, aw], i) => { const b = sc.building({ w: 126, d: 140, floors: 1, style: i === 1 ? 'brick' : 'stucco', wallColor: i === 2 ? '#c8b494' : '#b8a888', seed: 31 + i, roof: 'flat', parapet: 10, shop: { kind, door: 'right', open: true, awning: aw, sign: { text, bg, fg, lit: true }, people: 2 } }, i * 128, 210); roofKit(sc, b, [['ac', 30, 40], ['ac', 90, 60]]); });
  sc.vox(T.billboardFrame(170, 64, 30), 190, 160, 0, 80, 210.5);
  signFace(sc, 105, 160, 170, 64, [{ text: 'A BRIGHTER', x: 10, v: 34, sx: 2, fg: [250, 240, 220] }, { text: 'METRO CITY', x: 10, v: 16, sx: 2, fg: [250, 240, 220] }], { color: '#2a3a7a', dz: 110, base: 210.6, mural: { x: 96, w: 70, h: 60 } });
  for (const [x, y] of [[40, 222], [168, 222], [296, 222]]) { sc.vox(P.cafeTable(), x, y, 0, 0, y, 'ctab'); sc.person(x + 14, y + 2, null, 6, 'idle', x * 9); }
  for (const x of [120, 250, 370]) sc.vox(P.planter(), x, 216, 0, 0, 216, 'pl');
  // the mall: stone block, glass vault entrance, banners, planters with clipped trees
  const mall = sc.building({ w: 280, d: 160, style: 'stone', wallColor: '#c8b898', seed: 34, roof: 'flat', height: 90, doors: [{ x: 110, w: 60, kind: 'door', open: true, h: 56 }], windows: [], plaques: [{ text: 'NORTHSHORE MALL', x: 70, v: 60, sx: 2, bg: '#e8e0cc', fg: [40, 50, 90], w: 140 }] }, 480, 214);
  sc.vox(T.glassVault(120, 40, 104), 620, 184, 0, 0, 214.4);
  for (const x of [500, 720]) signFace(sc, x, 210, 36, 70, [{ text: 'SHOP', x: 0, v: 48, sx: 1, fg: [240, 240, 236], w: 36 }, { text: 'DINE', x: 0, v: 34, sx: 1, fg: [240, 240, 236], w: 36 }, { text: 'PLAY', x: 0, v: 20, sx: 1, fg: [240, 240, 236], w: 36 }], { color: '#2a3e8a', dz: 6, base: 214.5 });
  for (const x of [560, 680]) sc.vox(D.topiary('cone', '#5a5e66'), x, 226, 0, 0, 226, 'tc');
  roofKit(sc, mall, [['ac', 40, 40], ['ac', 220, 50], ['sky', 140, 60], ['solar', 60, 110], ['solar', 200, 110]]);
  for (const [x, c] of [[500, '#2a3a5a'], [560, '#a83030'], [690, '#c8c8c4'], [740, '#2a2c38']]) car(sc, 'sedan', x, 30, PI / 2, { paint: c, parked: true });
  // the stadium wall at the south-east, fans at the merch tent
  sc.building({ w: 290, d: 60, style: 'concrete', seed: 35, roof: 'flat', height: 160, doors: [{ x: 40, w: 40, kind: 'roller', open: true, h: 50 }], windows: [], plaques: [{ text: 'METRO CITY', x: 120, v: 110, sx: 3, bg: '#2a3e8a', fg: [240, 240, 236], w: 150 }, { text: 'STADIUM', x: 120, v: 80, sx: 3, bg: '#2a3e8a', fg: [240, 240, 236], w: 150 }] }, 480, 512);
  sc.vox(T.canvasTent('#2a3a8a'), 420, 470); for (const [x, y] of [[400, 500], [420, 504], [450, 500], [380, 496]]) sc.person(x, y, { skin: (x / 10) % 5 | 0, build: 1, hair: { style: 'short', color: 1 }, top: { kind: 'jersey', color: 'navy' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'white' }, 4, 'idle');
  // traffic and deliveries
  car(sc, 'van', 210, 274, 0, { paint: '#ecebe4' }); car(sc, 'sedan', 70, 322, 0, { paint: '#a83030' }); car(sc, 'suv', 300, 322, PI, { paint: '#3a4050' });
  car(sc, 'boxtruck', 600, 380, 0.05, { parked: true }); sc.person(530, 390, 'courier', 6, 'walk'); sc.vox(X.cone(), 520, 400);
  // the median: palms and flowers, banner lamps, people crossing to the mall
  for (const x of [60, 200, 330]) sc.add(palm(3100 + x, 120), x, 298);
  for (const x of [130, 270]) sc.vox(P.flowerBed(40), x, 296, 0, 0, 296, 'fbm');
  for (const [x, y] of [[20, 236], [150, 236], [270, 236], [390, 236], [480, 236], [396, 352], [478, 352]]) lamp(sc, x, y, '#2a3e8a');
  sc.vox(P.trafficSignal(52, 'red', sc.lampsOn), 396, 344); sc.vox(P.trafficSignal(52, 'green', sc.lampsOn), 476, 244, PI);
  for (const [x, y, k, d] of [[420, 270, null, 0], [440, 300, 'student', 0], [430, 330, 'dad', 4], [520, 236, 'socialite', 2], [600, 238, null, 0], [660, 240, 'banker', 6], [300, 232, 'tourist', 2]]) sc.person(x, y, k, d, 'walk', x * 9 + y);
  pet(sc, 'golden', 540, 244, 0, { phase: 0.4 });
  // the south-west rooftops with a painted wall
  const r1 = sc.building({ w: 360, d: 150, style: 'concrete', seed: 36, roof: 'flat', parapet: 6, blank: true }, 0, 670);
  roofKit(sc, r1, [['ac', 30, 20], ['ac', 80, 30], ['solar', 140, 20], ['solar', 180, 20], ['vent', 260, 30], ['plant', 300, 60]]);
  signFace(sc, 180, 520, 160, 70, [{ text: 'GOOD PEOPLE', x: 8, v: 40, sx: 2, fg: [40, 60, 90] }, { text: 'BETTER DAYS', x: 8, v: 20, sx: 2, fg: [40, 60, 90] }], { color: '#e8e0cc', base: 520 });
  return sc.finish();
}

// ---- D16 islands: a gang compound on a rock island with a guard tower and boats; a beach cabin ---------
export function buildIslands(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 16, {walk: 1}), G = sc.G;
  const S = new Streets(DW, DH, { lotKind: 'waterDeep' });
  S.zone('rock', { blob: { cx: 150, cy: 230, rx: 290, ry: 280, seed: 3, wob: 0.12 } });
  S.zone('yard', { poly: [[0, 80], [330, 70], [350, 330], [300, 400], [0, 420]] });
  S.zone('dock', { x: 180, y: 400, w: 40, h: 90 }); S.zone('dock', { x: 120, y: 420, w: 180, h: 24 });
  S.zone('shallow', { blob: { cx: 640, cy: 330, rx: 210, ry: 190, seed: 7, wob: 0.15 } });
  S.zone('sand', { blob: { cx: 660, cy: 330, rx: 160, ry: 140, seed: 7, wob: 0.15 } });
  S.zone('grass', { blob: { cx: 690, cy: 260, rx: 120, ry: 100, seed: 8, wob: 0.2 } });
  S.zone('dock', { path: [[560, 410], [470, 470]], width: 22 });
  for (const [cx, cy, r, s] of [[470, 120, 30, 1], [740, 60, 50, 2], [430, 320, 24, 3], [520, 500, 30, 4], [330, 480, 18, 5]]) S.zone('rock', { blob: { cx, cy, rx: r, ry: r * 0.8, seed: s, wob: 0.3 } });
  S.build(); S.paint(G, 16);
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (S.kind(x, y) === 'waterDeep') G.put(x, y, ...seaPixel(x, y));
  shoreFoam(G, (x, y) => { const k = S.kind(x, y); return k === 'waterDeep' || k === 'shallow'; }, 161);
  // the compound: walls with wire, a gate, the guard tower, a flag, crates, a container, a pickup, guards
  fenceRun(sc, 'chain', 0, 420, 120, 420, { barbed: true });
  for (let x = 0; x < 320; x += 80) sc.vox(T.compoundWall(80, 40, true), x + 40, 90, 0, 0, 90, 'cwall');
  sc.vox(T.compoundWall(80, 40, true), 330, 160, PI / 2); sc.vox(T.compoundWall(80, 40, true), 336, 260, PI / 2);
  sc.vox(T.guardTower(70, sc.lampsOn), 110, 130); sc.person(110, 120, 'swat', 0, 'idle', 1601);
  sc.vox(U.flagpole(120, '#2a2228'), 30, 110);
  sc.building({ w: 120, d: 70, style: 'concrete', seed: 161, roof: 'flat', grime: 0.7, graffiti: 1, tagText: 'KEEP OUT', doors: [{ x: 20, w: 20, kind: 'door' }], windows: [80] }, 190, 160);
  car(sc, 'pickup', 260, 230, PI + 0.3, { paint: '#2a2c30', cargo: [3, 3], parked: true }); car(sc, 'bike', 160, 230, 0.5, { paint: '#1e2026', parked: true });
  sc.vox(X.container('#a8402e', 130), 90, 340, PI / 2);
  for (const [x, y, t] of [[180, 330, 2], [200, 344, 3], [220, 330, 1], [250, 360, 4], [40, 230, 2], [60, 240, 3], [280, 330, 1]]) sc.vox(P.crate(t), x, y);
  for (const [x, y] of [[150, 300], [166, 306], [300, 200]]) sc.vox(D.oilDrum('#3a6a3a'), x, y);
  for (const [x, y, d, k] of [[80, 270, 2, 'enforcer'], [230, 290, 0, 'swat'], [300, 300, 6, 'syndicate'], [200, 420, 4, 'thug']]) sc.person(x, y, k, d, 'idle', x * 17 + y);
  for (const [x, y] of [[20, 190], [310, 120]]) lamp(sc, x, y, 'street');
  // the dock: boats tied up, a hoist
  car(sc, 'speedboat', 150, 480, -PI / 2, { paint: '#c8342e', cargo: [3], parked: true }); car(sc, 'speedboat', 260, 480, -PI / 2, { paint: '#f0eee8', parked: true });
  for (const [x, y] of [[180, 494], [220, 494], [120, 446], [300, 446]]) sc.vox(P.piling(30), x, y, 0, 0, y, 'pile30');
  // the cove: the cabin with a solar panel, palms, the campfire, a dog, a rowboat at a little dock
  const cab = sc.building({ w: 120, d: 80, style: 'siding', wallColor: '#7a5a3a', pitch: 'hip', roof: 'shingle', roofColor: '#6a6e78', slope: 0.45, seed: 162, doors: [{ x: 40, w: 18, kind: 'door', open: true }], windows: [10, 90], porchLight: true }, 640, 330);
  sc.vox(T.solarPanel(30, 20), 720, 270, 0, 40, 330.5);
  sc.vox(T.hammock(44), 610, 350); sc.vox(P.surfboard('#e8a040'), 772 - 12, 330, PI / 2);
  sc.vox(U.campfire(1), 690, 400); sc.light(690, 398, 18, 110, LIGHT.fire, sc.isNight ? 3 : 1.2);
  sc.vox(U.campChair('#2e7a7a'), 670, 392); sc.vox(U.campChair('#2e7a7a'), 716, 396, PI); sc.person(716, 398, 'surfer', 6, 'idle', 1621); pet(sc, 'golden', 660, 420, 0.3, { pose: 'sit' });
  sc.person(600, 400, 'lifeguard', 4, 'walk', 1622);
  car(sc, 'dinghy', 450, 478, 0.6, { parked: true });
  for (const [x, y, s] of [[600, 230, 1], [660, 200, 2], [740, 210, 3], [580, 300, 4], [760, 300, 5], [700, 160, 6]]) sc.add(palm(1630 + s, 110 + s * 6), x, y);
  for (const [x, y, s] of [[40, 90, 1], [330, 60, 2], [10, 380, 3]]) sc.add(palm(1640 + s, 100), x, y);
  // rocks in the water, a speedboat running
  for (const [x, y, s, z] of [[470, 130, 1, 30], [740, 70, 2, 40], [430, 330, 3, 24], [520, 506, 4, 28], [330, 486, 5, 20], [370, 200, 6, 26]]) sc.vox(D.boulder(s + 160, z, '#6e6860'), x, y);
  car(sc, 'speedboat', 520, 60, -0.2, { paint: '#2a2c38' });
  return sc.finish();
}

// ---- D17 blend: villas and a marina, a mid-income shop street, a rough lot - meeting at a crossroads ---
export function buildBlend(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 17, {x: [[250, 280, 72], [280, 360, 192], [360, 390, 72]], y: [[270, 300, 72], [300, 370, 192], [370, 400, 72]], walk: 2.4, grow: 1.5}), G = sc.G;
  const S = new Streets(DW, DH, { corner: 18, sidewalk: 30, lotKind: 'paver' });
  S.road(280, 0, 80, DH).road(0, 300, DW, 70);
  S.zone('lawn', { x: 0, y: 0, w: 250, h: 270 }); S.zone('stoneTile', { x: 0, y: 150, w: 220, h: 110 }); S.zone('pool', { x: 20, y: 170, w: 120, h: 60 });
  S.zone('lawn', { x: 0, y: 400, w: 250, h: 112 }); S.zone('waterDeep', { x: 0, y: 420, w: 140, h: 92 }); S.zone('dock', { x: 140, y: 420, w: 30, h: 92 });
  S.zone('asphaltWorn', { x: 560, y: 300, w: 208, h: 70 }, { road: true });
  S.zone('dirt', { x: 580, y: 0, w: 188, h: 270 }); S.zone('rubble', { x: 620, y: 140, w: 148, h: 120 });
  S.zone('yard', { x: 580, y: 400, w: 188, h: 112 });
  S.build(); S.paint(G, 17);
  poolWall(G, 20, 170, 120, 6);
  wear(G, 280, 0, 80, DH, 0.6, 171); wear(G, 560, 300, 208, 70, 2.2, 173);
  laneLine(G, 318, 0, 260, false, { yellow: true }); laneLine(G, 323, 0, 260, false, { yellow: true }); laneLine(G, 318, 410, 102, false, { yellow: true }); laneLine(G, 323, 410, 102, false, { yellow: true });
  laneLine(G, 0, 333, 250, true, { yellow: true, dash: 18, gap: 12 }); laneLine(G, 390, 333, 170, true, { yellow: true, dash: 18, gap: 12 }); laneLine(G, 560, 333, 208, true, { yellow: true, dash: 18, gap: 12, wear: 0.5 });
  zebra(G, 284, 272, 72, 24, true, 175); zebra(G, 284, 374, 72, 24, true, 177); zebra(G, 250, 304, 24, 62, false, 179);
  pavementCracks(G, (x, y) => S.isWalk(x, y) && W.ix(x) > 560, 60, 181); litter(G, (x, y) => S.isWalk(x, y) && W.ix(x) > 560, 0.006, 183);
  weeds(G, (x, y) => W.ix(x) > 560 && (S.isWalk(x, y) !== S.isWalk(x, y + 3) || S.kind(x, y) === 'dirt'), 0.06, 185);
  // luxury: the villa, the pool deck, the gate; the marina with a yacht
  sc.building({ w: 200, d: 120, floors: 2, style: 'stucco', wallColor: '#ecdcc4', pitch: 'hip', roof: 'tile', seed: 171, doors: [{ x: 90, w: 24, kind: 'door' }], windows: [30, 150], shutters: '#3a5a6a', porchLight: true }, 10, 130);
  for (const [x, y] of [[160, 190], [160, 214]]) sc.vox(D.lounger(), x, y, PI / 2, 0, y, 'loung'); sc.vox(P.umbrella('#f0ece4', '#f0ece4'), 190, 236);
  hedgeRun(sc, 0, 262, 120, false, 14); sc.vox(D.ironGate(50), 160, 268); for (const x of [130, 196]) sc.vox(D.gatePillar(sc.lampsOn, 28), x, 270, 0, 0, 270, 'gp');
  for (const [x, y, s] of [[230, 40, 1], [240, 150, 2], [240, 250, 3], [230, 420, 4], [220, 500, 5]]) sc.add(palm(1700 + s, 120), x, y);
  sc.vox(P.yacht(), 70, 470, -PI / 2); for (const y of [430, 470, 500]) sc.vox(P.piling(26), 172, y, 0, 0, y, 'p26');
  hedgeRun(sc, 180, 400, 110, true, 14);
  sc.person(260, 120, 'socialite', 4, 'walk'); sc.person(260, 200, 'yachtie', 0, 'walk'); pet(sc, 'chihuahua', 270, 210, 0.3);
  // mid-income: three-storey shops with balconies, a café terrace, a corner bar
  const m1 = sc.building({ w: 110, d: 150, floors: 3, style: 'stucco', wallColor: '#d8c4a8', seed: 172, roof: 'flat', balconies: true, shop: { kind: 'cafe', door: 'left', open: true, awning: ['#c8503a', '#f0ece4'], people: 2 } }, 380, 270);
  const m2 = sc.building({ w: 110, d: 150, floors: 3, style: 'stucco', wallColor: '#8aa890', seed: 173, roof: 'flat', balconies: true, shop: { kind: 'mart', door: 'right', open: true, sign: { text: 'COCO', bg: '#f0ece4', fg: [40, 110, 80] } } }, 492, 270);
  roofKit(sc, m1, [['plant', 30, 30], ['ac', 80, 70]]); roofKit(sc, m2, [['ac', 30, 40], ['plant', 70, 90]]);
  sc.vox(P.umbrella('#e8603a', '#f0ece4'), 420, 290); sc.vox(P.cafeTable(), 420, 296); sc.person(404, 296, null, 2, 'idle', 1711); sc.person(436, 298, null, 6, 'idle', 1712);
  const bar = sc.building({ w: 200, d: 110, floors: 1, style: 'brick', seed: 174, roof: 'flat', parapet: 10, shop: { kind: 'bar', door: 'left', open: true, awning: ['#2e6a5a', '#f0ece4'], people: 3 } }, 380, 512);
  roofKit(sc, bar, [['ac', 30, 20], ['plant', 110, 30]]);
  signFace(sc, 372, 440, 14, 44, [{ text: 'B', x: 0, v: 30, sx: 2, fg: [255, 210, 120], lit: true, w: 14 }, { text: 'A', x: 0, v: 18, sx: 2, fg: [255, 210, 120], lit: true, w: 14 }, { text: 'R', x: 0, v: 6, sx: 2, fg: [255, 210, 120], lit: true, w: 14 }], { color: '#a8343a', dz: 20, base: 512.5 });
  // rough: a tagged wall, chain-link, a burnt-out car, a tarp shelter, tyres and bags, a sketchy garage
  sc.building({ w: 180, d: 8, style: 'brick', seed: 175, height: 52, blank: true, graffiti: 2, tagText: 'VIBE', grime: 0.8 }, 590, 120);
  fenceRun(sc, 'chain', 580, 270, 768, 270, { barbed: true }); fenceRun(sc, 'chain', 580, 130, 580, 270);
  car(sc, 'sedan', 700, 220, 0.3, { state: 'burnt', parked: true });
  sc.vox(T.canvasTent('#2a5a9a'), 640, 60); sc.vox(P.couch('#6a4a3a'), 690, 90, 0.2); sc.vox(D.tires(3), 610, 160); sc.vox(D.trashBag(), 750, 254); sc.vox(D.trashBag('#3a3a44'), 736, 258);
  sc.vox(P.burnBarrel(sc.lampsOn), 620, 110); if (sc.lampsOn) sc.light(620, 110, 22, 70, LIGHT.fire, sc.isNight ? 2 : 0.7);
  sc.vox(D.powerPole(124), 570, 30); sc.wire(570 - 14, 30, 123, 570 - 14, -60, 123, 10);
  sc.building({ w: 170, d: 110, style: 'corrugated', wallColor: '#7a7e84', seed: 176, roof: 'flat', grime: 0.8, doors: [{ x: 50, w: 70, kind: 'roller', open: true }], windows: [] }, 590, 512);
  car(sc, 'bike', 680, 410, 0.3, { paint: '#8a2e2e', parked: true }); sc.person(640, 410, 'tracksuit', 4, 'idle', 1731); sc.person(720, 404, 'punk', 6, 'idle', 1732);
  for (const [x, y] of [[600, 420], [760, 430]]) sc.vox(X.cone(), x, y);
  // traffic, lamps, signals, people
  car(sc, 'sedan', 300, 90, PI / 2, { paint: '#a83030' }); car(sc, 'van', 340, 220, -PI / 2, { paint: '#ecebe4' }); car(sc, 'pickup', 480, 340, 0, { paint: '#a83e3a', cargo: [1, 1] }); car(sc, 'sedan', 680, 350, PI, { paint: '#3a7a6a' });
  car(sc, 'taxi', 420, 316, 0, { parked: true });
  for (const [x, y] of [[268, 60], [268, 280], [370, 280], [370, 400], [268, 420]]) lamp(sc, x, y, 'cast');
  sc.vox(P.trafficSignal(52, 'red', sc.lampsOn), 270, 290); sc.vox(P.trafficSignal(52, 'green', sc.lampsOn), 370, 380, PI);
  for (const [x, y, k, d] of [[370, 120, 'office', 4], [376, 200, null, 0], [470, 290, 'student', 2], [520, 390, 'dad', 6], [600, 300, null, 2], [370, 396, 'nurse', 0]]) sc.person(x, y, k, d, 'walk', x * 3 + y);
  car(sc, 'bicycle', 640, 292, 0, { parked: true }); sc.person(640, 290, 'courier', 2, 'idle', 1741);
  return sc.finish();
}

export const CITY_DISTRICTS = { ...EVERY_DISTRICT, oldtown: buildOldTown, apartments: buildApartments, nightlife: buildNightlife, commercial: buildCommercial, islands: buildIslands, blend: buildBlend };
export const CITY_TARGETS = { ...EVERY_TARGET, oldtown: 'D5_old-town.png', apartments: 'D4_apartments.png', nightlife: 'D8_nightlife.png', commercial: 'D3_commercial.png', islands: 'D16_islands.png', blend: 'D17_blend.png' };
