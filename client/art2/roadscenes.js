// Art v2 road and infrastructure scenes, built to the I1-I5, H1 and AL1 targets: the road kit sheet, a
// diamond highway interchange with working ramps, an elevated highway with a ramp down to the street,
// a level crossing at a street-level rail station, a toll bridge between a marina and a waterfront house,
// the airport apron and runway, and two sets of alleys (north-south and east-west). Drawn at true scale
// (lanes 80 px, see road-spec.js), no layout warp.
//
// ROAD_SCENES[name](preset) -> { G, lights };  ROAD_TARGETS[name] -> target image
import { Scene, Streets } from './scene.js';
import { deck } from './deck.js';
import { paintRect, laneLine, zebra, manhole, drain, wear, weeds, puddle, litter, stain, roadText, shoreFoam, railTrack, quayEdge, parkingLines, busSymbol, arrowMark, hatchPoly, pavementCracks, lawnEdge, leafLitter, treeGrate } from './ground.js';
import * as P from './props.js';
import * as D from './props-district.js';
import * as X from './props-transit.js';
import * as K from './props-park.js';
import * as U from './props-rural.js';
import * as T from './props-town.js';
import * as I from './props-interior.js';
import * as Q from './props-road.js';
import { vehicleModel } from './vehicles.js';
import { animalModel } from './animals.js';
import { makeBuilding } from './buildings.js';
import { palm, leafyTree, bush, cypress } from './trees.js';
import { LIGHT } from './palette.js';
import { hash } from './gbuf.js';
import { seaPixel } from './districts.js';

const PI = Math.PI;
function car(sc, type, x, y, hd, o = {}) {
  const m = vehicleModel(type, { lights: o.lights ?? (o.parked ? 0 : sc.carLights), ...o });
  sc.vox(m, x, y, hd, o.dz || 0, o.base ?? y);
  if (!o.parked && !o.dz) sc.carLight(x, y, hd, m.w);
}
const lamp = (sc, x, y, kind = 'cast', dz = 0, base = y) => { const m = kind === 'cast' ? P.lampPost('cast', sc.lampsOn) : P.streetLamp(sc.lampsOn); sc.vox(m, x, y, 0, dz, base, kind + sc.lampsOn); sc.lampLight(x, y, (kind === 'cast' ? 74 : 84) + dz, kind === 'cast' ? [1, 0.8, 0.5] : LIGHT.sodium, kind === 'cast' ? 0.6 : 1); };
const tree = (sc, x, y, s, h = 130, c = 46) => sc.add(leafyTree(s, h, c), x, y);
const place = (sc, d, dz = 0) => sc.addWorld(d.spr, d.bx, d.by, dz, d.base);
const roofKit = (sc, b, list) => { for (const [k, x, y] of list) sc.onRoof(b, k === 'ac' ? P.roofAC() : k === 'acs' ? P.roofAC(false) : k === 'vent' ? P.roofVent() : k === 'tank' ? P.waterTank() : k === 'dish' ? P.dish() : k === 'sky' ? P.skylight() : k === 'plant' ? P.roofPlanter(30) : P.roofVent(), x, y); };
const flat = (G, x0, y0, w, h, c = [112, 114, 118]) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (G.inside(x, y)) G.put(x, y, c, [0, 0, 1], 0, null, 1); };

// ---- I1 road kit: the pieces laid out on a grey sheet ------------------------------------------------------
export function buildRoadKit(preset = 'golden') {
  const W = 1400, H = 1400, sc = new Scene(W, H, preset, 71), G = sc.G;
  const tiles = [[40, 40, 320, 400], [400, 40, 420, 400], [860, 40, 500, 400], [40, 480, 360, 420], [440, 480, 300, 420], [780, 480, 260, 420], [1080, 480, 280, 420], [40, 940, 300, 420], [380, 940, 300, 420], [720, 940, 640, 420]];
  const S = new Streets(W, H, { corner: 22, sidewalk: 64, lotKind: 'sidewalk' });
  S.road(104, 0, 192, 480).road(438, 0, 344, 480).road(1014, 0, 192, 480).road(830, 144, 560, 192)
    .road(0, 600, 430, 192).road(124, 440, 192, 160).road(494, 640, 192, 300).bulb(590, 620, 120).road(812, 440, 192, 500)
    .road(120, 900, 160, 500, { kind: 'asphaltWorn' });
  S.island(598, 20, 24, 440, 10, 'mulch');
  S.zone('asphaltRed', { x: 908, y: 440, w: 96, h: 500 }, { road: true });
  S.zone('asphalt', { x: 1100, y: 500, w: 240, h: 380 }); S.zone('mulch', { x: 1100, y: 690, w: 240, h: 14 });
  S.zone('grass', { x: 40, y: 940, w: 80, h: 420 }); S.zone('grass', { x: 280, y: 940, w: 60, h: 420 }); S.zone('gravel', { x: 104, y: 940, w: 16, h: 420 }); S.zone('gravel', { x: 280, y: 940, w: 16, h: 420 });
  S.zone('grass', { x: 380, y: 940, w: 300, h: 420 }); S.zone('dirtRoad', { path: [[480, 940], [540, 1100], [520, 1250], [580, 1360]], width: 70 });
  S.zone('asphalt', { x: 720, y: 940, w: 640, h: 200 });
  S.build(); S.paint(G, 71);
  // grey sheet round the tiles
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!tiles.some(([a, b, w, h]) => x >= a && y >= b && x < a + w && y < b + h)) G.put(x, y, [112, 114, 118], [0, 0, 1], 0, null, 1);
  // markings
  laneLine(G, 196, 40, 400, false, { yellow: true }); laneLine(G, 201, 40, 400, false, { yellow: true });
  for (const x of [518, 698]) laneLine(G, x, 40, 400, false, { dash: 20, gap: 14 });
  zebra(G, 1020, 104, 180, 30, true); zebra(G, 1020, 344, 180, 30, true); zebra(G, 970, 150, 30, 180, false); zebra(G, 1214, 150, 30, 180, false);
  laneLine(G, 1014, 96, 90, true, { width: 3 }); laneLine(G, 1112, 380, 94, true, { width: 3 });
  laneLine(G, 40, 694, 360, true, { yellow: true }); laneLine(G, 40, 699, 360, true, { yellow: true }); zebra(G, 130, 562, 180, 30, true);
  laneLine(G, 906, 480, 420, false, { width: 3 }); busSymbol(G, 956, 640, 2); roadText(G, 'BUS', 938, 720, { sx: 3, sy: 6 });
  parkingLines(G, 1110, 510, 3, 74, 120); parkingLines(G, 1110, 740, 3, 74, 120);
  for (const x of [770, 830, 890]) arrowMark(G, x, 1000, 'up', ['left', 'straight', 'right'][(x - 770) / 60]);
  zebra(G, 940, 960, 120, 40, false); hatchPoly(G, [[1080, 960], [1180, 960], [1130, 1060]], { yellow: true });
  laneLine(G, 1220, 960, 120, true, { yellow: true }); laneLine(G, 1220, 966, 120, true, { yellow: true }); laneLine(G, 1220, 990, 120, true, { dash: 14, gap: 10 }); laneLine(G, 1220, 1020, 120, true, { width: 4 });
  manhole(G, 760, 1100, 8); drain(G, 800, 1096, 16, 6); puddle(G, 880, 1100, 14, 6); stain(G, 1000, 1100, 14, 6); wear(G, 1040, 1060, 300, 70, 1.5, 71);
  laneLine(G, 196, 940, 420, false, { yellow: true, dash: 18, gap: 14, wear: 0.3 });
  wear(G, 120, 940, 160, 420, 1, 73);
  // furniture: the street pieces in a row
  const fy = 1250;
  sc.vox(P.trafficSignal(52, 'green', sc.lampsOn), 760, fy); sc.vox(P.pedSignal(sc.lampsOn), 840, fy);
  lamp(sc, 890, fy, 'street'); lamp(sc, 930, fy, 'cast');
  for (let i = 0; i < 4; i++) sc.vox(P.bollard(), 970 + i * 14, fy);
  sc.vox(P.hydrant(), 1040, fy); sc.vox(P.wireBin(), 1070, fy); sc.vox(D.wheelieBin('#3a6a3a'), 1100, fy); sc.vox(P.newsBox('#2f5aa8'), 1130, fy);
  sc.vox(P.signPost('#c8343a'), 1170, fy); sc.vox(Q.crossingSignal(sc.lampsOn), 1220, fy); sc.vox(X.cone(), 1270, fy); sc.vox(U.roadSign('curve'), 1310, fy);
  // dressing on the tiles
  for (const [x, y] of [[60, 120], [60, 320], [340, 200], [340, 400]]) tree(sc, x, y, x + y, 120, 34);
  for (const y of [80, 200, 320, 420]) sc.add(palm(y, 110), 610, y);
  for (const [x, y] of [[880, 64], [1340, 64], [880, 420], [1340, 420]]) sc.vox(P.trafficSignal(52, 'red', sc.lampsOn), x, y, x > 1000 ? PI : 0);
  for (const [x, y] of [[60, 560], [380, 560], [60, 880], [380, 880]]) lamp(sc, x, y);
  for (const [x, y] of [[460, 500], [720, 500], [460, 900], [720, 900]]) sc.add(bush(x + y, 18), x, y);
  for (const [x, y] of [[800, 600], [1020, 800]]) lamp(sc, x, y);
  sc.vox(P.bench(), 1220, 700); for (const x of [1120, 1300]) tree(sc, x, 700, x, 110, 30);
  for (let y = 980; y < 1360; y += 80) { sc.vox(P.bollard(16), 100, y); sc.vox(P.bollard(16), 300, y); }
  for (let y = 960; y < 1360; y += 90) sc.vox(D.fence('wood', 30), 420, y, PI / 2);
  car(sc, 'sedan', 150, 200, PI / 2, { paint: '#a83030' }); car(sc, 'taxi', 480, 300, -PI / 2); car(sc, 'bus', 956, 720, -PI / 2, { paint: '#e8e8e4' });
  car(sc, 'sedan', 1150, 560, -PI / 2, { paint: '#3a5a8a', parked: true }); car(sc, 'pickup', 1250, 800, PI / 2, { paint: '#8a2e2e', parked: true }); car(sc, 'pickup', 200, 1150, -PI / 2, { paint: '#a87a4a' });
  return sc.finish();
}

// ---- H1 diamond interchange: the highway on an embankment, a bridge over the avenue, four ramps ----------
export function buildInterchange(preset = 'golden') {
  const W = 1400, H = 1200, sc = new Scene(W, H, preset, 72), G = sc.G;
  const S = new Streets(W, H, { corner: 24, sidewalk: 64, lotKind: 'grass' });
  S.road(528, 0, 344, H);
  S.road(872, 204, 70, 92).road(458, 204, 70, 92).road(458, 904, 70, 92).road(872, 904, 70, 92);   // ramp terminals
  S.island(690, 0, 20, 180, 8, 'mulch'); S.island(690, 1020, 20, 180, 8, 'mulch');
  for (const [x, y] of [[0, 0], [1060, 0], [0, 1040], [1060, 1040]]) S.zone('sidewalk', { x, y, w: 340, h: 160 });
  S.build(); S.paint(G, 72);
  lawnEdge(G, (x, y) => S.kind(x, y) === 'grass');
  for (const [y0, y1] of [[0, 200], [300, 400], [800, 900], [1000, 1200]]) { laneLine(G, 610, y0, y1 - y0, false, { dash: 18, gap: 14 }); laneLine(G, 790, y0, y1 - y0, false, { dash: 18, gap: 14 }); }
  for (const [x, y, d, t] of [[570, 360, 'down', 'straightLeft'], [650, 360, 'down', 'straight'], [750, 840, 'up', 'straight'], [830, 840, 'up', 'straightRight']]) arrowMark(G, x, y, d, t);
  zebra(G, 534, 150, 150, 36, true); zebra(G, 716, 150, 150, 36, true); zebra(G, 534, 1010, 150, 36, true); zebra(G, 716, 1010, 150, 36, true);
  laneLine(G, 534, 196, 156, true, { width: 3 }); laneLine(G, 710, 1000, 156, true, { width: 3 });
  // the highway (4 lanes, median, on an embankment; a bridge where it crosses the avenue)
  const hz = 44, hwy = deck({ path: [[-60, 600], [W + 60, 600]], width: 404, z: hz, lanes: 4, median: 24, shoulder: 24, face: (x) => (x > 520 && x < 880 ? 'girder' : 'grass'), seed: 72 });
  // ramps: off before the bridge, on after it; each ends at a signal on the avenue
  const ramps = [
    { path: [[W + 60, 376], [1180, 376], [1010, 300], [900, 250]], z: [hz, 0] },   // NE off (westbound)
    { path: [[500, 250], [390, 300], [220, 376], [-60, 376]], z: [0, hz] },        // NW on (westbound)
    { path: [[-60, 824], [220, 824], [390, 900], [500, 950]], z: [hz, 0] },        // SW off (eastbound)
    { path: [[900, 950], [1010, 900], [1180, 824], [W + 60, 824]], z: [0, hz] },   // SE on (eastbound)
  ].map((r, i) => deck({ path: r.path, width: 96, z: r.z, lanes: 1, face: 'grass', seed: 80 + i }));
  // the embankment islands between ramps and highway: trees and shrubs (drawn before the decks)
  for (const [x, y, s] of [[260, 300, 1], [140, 250, 2], [1140, 300, 3], [1260, 250, 4], [260, 900, 5], [140, 950, 6], [1140, 900, 7], [1260, 950, 8]]) tree(sc, x, y, 7200 + s, 110, 36);
  for (const [x, y, s] of [[420, 360, 1], [980, 360, 2], [420, 850, 3], [980, 850, 4], [330, 420, 5], [1070, 430, 6]]) sc.add(bush(7300 + s, 16), x, y);
  for (const r of ramps) sc.addWorld(r.spr, r.bx, r.by, 0, r.by + 96);
  place(sc, hwy);
  for (const x of [560, 840]) sc.vox(Q.pillar(hz, 26, 360), x, 600, PI / 2, 0, 600);
  for (const [x, y] of [[90, 340], [1310, 340], [90, 1080], [1310, 1080]]) sc.vox(Q.soundWall(160, 36), x, y, 0, 0, y, 'swall');
  sc.vox(Q.signGantry(200, 60, 2), 1300, 500, 0, hz, hwy.base + 2, 'gantryN'); sc.vox(Q.signGantry(200, 60, 2), 100, 700, 0, hz, hwy.base + 2, 'gantryS');
  // traffic: highway both ways, on the ramps, through the junctions
  const onDeck = hwy.base + 3;
  for (const [x, y, t, c] of [[200, 460, 'sedan', '#3a5a8a'], [520, 530, 'boxtruck', '#e6e2d8'], [980, 460, 'suv', '#2f5a4a'], [1260, 530, 'sedan', '#a83030']]) car(sc, t, x, y, PI, { paint: c, dz: hz, base: onDeck });
  for (const [x, y, t, c] of [[120, 680, 'mixer', '#e6e2d8'], [420, 740, 'sedan', '#2f4a3a'], [820, 680, 'taxi', null], [1180, 740, 'van', '#ecebe4']]) car(sc, t, x, y, 0, { paint: c || undefined, dz: hz, base: onDeck });
  car(sc, 'sedan', 1090, 335, PI - 0.38, { paint: '#c8c8c4', dz: 22, base: 470 }); car(sc, 'sports', 320, 335, PI + 0.38, { paint: '#e8b830', dz: 24, base: 470 });
  car(sc, 'sedan', 320, 865, 0.38, { paint: '#2c3a5e', dz: 24, base: 960 }); car(sc, 'pickup', 1090, 865, -0.38, { paint: '#a8342e', dz: 22, base: 960 });
  for (const [x, y, hd, c] of [[570, 60, PI / 2, '#a83030'], [650, 250, PI / 2, '#3a5a8a'], [750, 960, -PI / 2, '#2f4a3a'], [830, 1140, -PI / 2, '#e8e0cc'], [570, 1100, PI / 2, '#5a5e66'], [830, 100, -PI / 2, '#2f5a5a']]) car(sc, 'sedan', x, y, hd, { paint: c });
  car(sc, 'taxi', 830, 300, -PI / 2);
  // signals at the ramp terminals, lamps, corner buildings
  for (const [x, y, hd] of [[512, 190, 0], [888, 310, PI], [512, 890, 0], [888, 1010, PI]]) sc.vox(P.trafficSignal(60, 'green', sc.lampsOn), x, y, hd);
  for (const [x, y] of [[512, 120], [888, 120], [512, 1090], [888, 1090]]) lamp(sc, x, y, 'street');
  const b1 = sc.building({ w: 300, d: 120, floors: 2, style: 'brick', seed: 721, roof: 'flat', doors: [{ x: 90, w: 20, kind: 'door' }], windows: [30, 150, 220] }, 20, 120);
  const b2 = sc.building({ w: 300, d: 120, style: 'stucco', wallColor: '#d8c8a8', seed: 722, roof: 'flat', shop: { kind: 'mart', door: 'right', open: true, awning: ['#c8343a', '#f0ece4'] } }, 1080, 120);
  const b3 = sc.building({ w: 300, d: 150, style: 'concrete', seed: 723, roof: 'flat', blank: true, northDoors: [{ x: 80, kind: 'service' }] }, 20, 1300);
  const b4 = sc.building({ w: 300, d: 150, style: 'brick', seed: 724, roof: 'flat', blank: true, northDoors: [{ x: 60, w: 30, col: '#2e6a4e' }] }, 1080, 1300);
  for (const b of [b1, b2, b3, b4]) roofKit(sc, b, [['ac', 40, 30], ['acs', 160, 50]]);
  for (const [x, y, k, d] of [[500, 130, 'student', 2], [900, 1080, null, 6], [340, 140, 'office', 2]]) sc.person(x, y, k, d, 'walk', x * 3 + y);
  return sc.finish();
}

// ---- I2 elevated highway over the street grid, with a ramp curving down to the street --------------------
export function buildOverpass(preset = 'golden') {
  const W = 1200, H = 860, sc = new Scene(W, H, preset, 73), G = sc.G;
  const S = new Streets(W, H, { corner: 22, sidewalk: 64, lotKind: 'sidewalk' });
  S.road(420, 0, 192, H).road(0, 560, W, 192);
  S.zone('yard', { x: 0, y: 40, w: 340, h: 420 }); S.zone('yard', { x: 690, y: 40, w: 510, h: 420 });
  S.build(); S.paint(G, 73);
  wear(G, 420, 0, 192, H, 1.4, 73); wear(G, 0, 560, W, 192, 1.4, 75);
  laneLine(G, 513, 0, 540, false, { yellow: true }); laneLine(G, 518, 0, 540, false, { yellow: true }); laneLine(G, 0, 653, 400, true, { yellow: true }); laneLine(G, 0, 658, 400, true, { yellow: true }); laneLine(G, 640, 653, 560, true, { yellow: true }); laneLine(G, 640, 658, 560, true, { yellow: true });
  zebra(G, 424, 520, 184, 30, true); zebra(G, 380, 566, 30, 180, false); arrowMark(G, 560, 470, 'down', 'right');
  pavementCracks(G, (x, y) => S.kind(x, y) === 'yard', 40, 731); weeds(G, (x, y) => S.isWalk(x, y) !== S.isWalk(x, y + 3), 0.08, 733);
  litter(G, (x, y) => S.isWalk(x, y), 0.003, 735);
  const hz = 96, hwy = deck({ path: [[-60, 200], [W + 60, 200]], width: 300, z: hz, lanes: 4, median: 20, shoulder: 10, face: 'girder', seed: 73 });
  const ramp = deck({ path: [[W + 60, 372], [1000, 372], [860, 440], [760, 560], [700, 660]], width: 96, z: [hz, 0], lanes: 1, face: 'wall', seed: 74 });
  // pillars under the deck, graffiti-tagged: the bits below the deck edge show
  for (const x of [120, 380, 660, 920, 1150]) sc.vox(Q.pillar(hz, 34, 180), x, 260, PI / 2, 0, 260, 'pil');
  sc.building({ w: 30, d: 4, style: 'concrete', seed: 731, height: 40, blank: true, graffiti: 1 }, 645, 330);
  // ground: the lot under the highway, fences, a dumpster, a parked car, a walker
  sc.vox(D.fence('chain', 80), 220, 470); sc.vox(D.fence('chain', 80), 300, 470); sc.vox(P.dumpster(), 760, 440); sc.vox(D.oilDrum('#3a5a8a', 1), 820, 450);
  car(sc, 'sedan', 200, 420, 0.1, { paint: '#5a5e66', parked: true }); car(sc, 'pickup', 1050, 440, 0, { paint: '#8a2e2e', parked: true });
  place(sc, ramp); place(sc, hwy);
  const onDeck = hwy.base + 3;
  for (const [x, y, t, c] of [[140, 110, 'pickup', '#a8342e'], [520, 110, 'sedan', '#d8d4cc'], [880, 140, 'sedan', '#3a5a8a'], [1120, 110, 'suv', '#2f5a4a']]) car(sc, t, x, y, PI, { paint: c, dz: hz, base: onDeck, lights: sc.carLights });
  for (const [x, y, t, c] of [[180, 270, 'taxi', null], [460, 300, 'suv', '#c8c8c4'], [780, 270, 'sedan', '#a83030'], [1080, 300, 'boxtruck', '#e6e2d8']]) car(sc, t, x, y, 0, { paint: c || undefined, dz: hz, base: onDeck, lights: sc.carLights });
  for (const x of [80, 480, 880]) lamp(sc, x, 64, 'street', hz, onDeck + 1);
  car(sc, 'suv', 900, 450, PI - 0.6, { paint: '#2f4a3a', dz: 50, base: ramp.base + 2 }); car(sc, 'sedan', 780, 560, PI - 1.0, { paint: '#d8d4cc', dz: 16, base: ramp.base + 2 });
  car(sc, 'sedan', 466, 380, PI / 2, { paint: '#2f8a8a' }); car(sc, 'sedan', 466, 780, PI / 2, { paint: '#2a2c38' }); car(sc, 'sedan', 200, 704, 0, { paint: '#c8c8c4' });
  // street corners: lamps, a walker, buildings and roofs
  for (const [x, y] of [[400, 520], [632, 520], [400, 776], [632, 776]]) lamp(sc, x, y, 'cast');
  sc.person(380, 470, 'student', 2, 'walk', 7301); sc.person(660, 780, null, 6, 'walk', 7302);
  const b1 = sc.building({ w: 340, d: 120, floors: 2, style: 'brick', seed: 732, roof: 'flat', doors: [{ x: 60, w: 20, kind: 'door' }], windows: [140, 200, 280] }, 0, 900);
  const b2 = sc.building({ w: 520, d: 100, style: 'concrete', seed: 733, roof: 'flat', blank: true }, 680, 940);
  roofKit(sc, b1, [['tank', 60, 30], ['ac', 160, 40], ['dish', 260, 50]]); roofKit(sc, b2, [['ac', 60, 30], ['ac', 200, 40], ['vent', 340, 50]]);
  tree(sc, 360, 840, 7303, 120, 40); tree(sc, 660, 850, 7304, 120, 40);
  return sc.finish();
}

// ---- I3 level crossing: gates down, a train at the street-level station, the metro entrance -------------
export function buildCrossing(preset = 'golden') {
  const W = 1100, H = 800, sc = new Scene(W, H, preset, 74), G = sc.G;
  const S = new Streets(W, H, { corner: 20, sidewalk: 64, lotKind: 'sidewalk' });
  S.road(120, 0, 192, H);
  S.zone('ballast', { x: 376, y: 330, w: 724, h: 150 }); S.zone('ballast', { x: 0, y: 330, w: 56, h: 150 });
  S.zone('platform', { x: 380, y: 196, w: 720, h: 134 });
  S.zone('grass', { x: 0, y: 160, w: 56, h: 170 }); S.zone('grass', { x: 380, y: 480, w: 720, h: 60 });
  S.build(); S.paint(G, 74);
  wear(G, 120, 0, 192, H, 1, 741);
  for (const y of [346, 410]) { railTrack(G, 376, y, 724, true, { gauge: 30 }); railTrack(G, 0, y, 60, true, { gauge: 30 }); railTrack(G, 120, y, 256, true, { gauge: 30, embedded: true }); }
  for (let x = 380; x < 1100; x++) for (let k = 0; k < 8; k++) G.put(x, 322 + k, (x % 4 < 2) !== (k % 4 < 2) ? [226, 180, 50] : [240, 200, 70], [0, 0, 1], 0, null, 1 | 8);
  laneLine(G, 213, 0, 300, false, { yellow: true }); laneLine(G, 218, 0, 300, false, { yellow: true }); laneLine(G, 213, 500, 300, false, { yellow: true }); laneLine(G, 218, 500, 300, false, { yellow: true });
  laneLine(G, 120, 300, 96, true, { width: 3 }); laneLine(G, 216, 506, 96, true, { width: 3 }); roadText(G, 'XING', 140, 240, { sx: 2, sy: 4 });
  // the platform: canopies, benches, a clock, people waiting; fences each side
  for (const x of [460, 820]) sc.vox(Q.platformCanopy(240, 70, sc.lampsOn), x, 250, 0, 0, 250, 'canopy');
  sc.vox(Q.clockPost(), 700, 250); sc.vox(K.parkSign('#2e5a4a'), 760, 222);
  for (const x of [540, 900]) sc.vox(P.bench(), x, 244, 0, 0, 244, 'bench');
  for (const [x, k] of [[450, 'commuter'], [480, null], [600, 'student'], [640, 'office'], [790, 'granny'], [860, null], [960, 'commuter'], [1020, 'banker']]) sc.person(x, 300, k, 4, 'idle', x * 7);
  for (const x of [530, 890]) sc.person(x, 246, null, 4, 'idle', x * 11);
  sc.vox(D.fence('chain', 80), 420, 190); for (let x = 500; x < 1100; x += 80) sc.vox(D.fence('chain', 80), x + 40, 190, 0, 0, 190, 'ch80');
  for (let x = 380; x < 1100; x += 80) sc.vox(D.fence('chain', 80), x + 40, 490, 0, 0, 490, 'ch80');
  // the train on the near track, three cars
  for (const x of [520, 784, 1048]) sc.vox(I.metroCar(264, false, 1), x, 380, PI, 0, 380, 'metroT');
  // gates and signals
  sc.vox(U.barrierArm(100, false), 70, 312, 0); sc.vox(U.barrierArm(100, false), 362, 500, PI);
  for (const [x, y, ph] of [[96, 306, 0], [336, 306, 1], [96, 506, 1], [336, 506, 0]]) { sc.vox(Q.crossingSignal(1, ph), x, y, 0, 0, y, 'xs' + ph); sc.light(x + (ph ? 6 : -6), y + 6, 40, 70, [1, 0.15, 0.1], sc.isNight ? 2 : 0.9); }
  // cars waiting at the gates
  car(sc, 'taxi', 168, 230, PI / 2); car(sc, 'sedan', 168, 110, PI / 2, { paint: '#5a6a8a' }); car(sc, 'pickup', 264, 600, -PI / 2, { paint: '#a83030' });
  // the street side: the metro entrance, lamps, buildings, trees
  sc.vox(Q.stationEntrance(sc.lampsOn), 860, 650, PI); sc.light(860, 640, 30, 90, [1, 0.85, 0.6], sc.isNight ? 1.6 : 0.6);
  sc.person(860, 690, 'commuter', 4, 'walk', 7401); sc.person(980, 700, 'student', 6, 'walk', 7402);
  for (const [x, y] of [[100, 140], [340, 140], [100, 700], [340, 700], [700, 640]]) lamp(sc, x, y);
  const b1 = sc.building({ w: 300, d: 140, floors: 2, style: 'brick', seed: 741, roof: 'flat', doors: [{ x: 40, w: 20, kind: 'door' }], windows: [120, 200, 260] }, 420, 150);
  const b2 = sc.building({ w: 280, d: 140, style: 'concrete', seed: 742, roof: 'flat', blank: true, northDoors: [{ x: 80, w: 30, col: '#c8a030' }] }, 400, 940);
  const b3 = sc.building({ w: 130, d: 160, floors: 2, style: 'brick', seed: 743, roof: 'flat', blank: true }, 0, 160);
  roofKit(sc, b1, [['ac', 60, 40], ['ac', 220, 60]]); roofKit(sc, b2, [['ac', 40, 30], ['vent', 200, 50]]);
  tree(sc, 30, 600, 7403, 120, 40); tree(sc, 700, 580, 7404, 130, 46); tree(sc, 1060, 600, 7405, 120, 40);
  car(sc, 'bicycle', 40, 120, 0.3, { parked: true });
  return sc.finish();
}

// ---- I4 toll bridge between a marina and a waterfront house, the promenade below --------------------------
export function buildTollBridge(preset = 'golden') {
  const W = 1100, H = 820, sc = new Scene(W, H, preset, 75), G = sc.G;
  const S = new Streets(W, H, { corner: 20, sidewalk: 60, lotKind: 'waterDeep' });
  S.road(420, 600, 260, H - 600);
  S.zone('paver', { x: 0, y: 600, w: 420, h: 220 }); S.zone('paver', { x: 680, y: 600, w: 420, h: 220 });
  S.zone('rock', { x: 0, y: 700, w: 300, h: 120 }); S.zone('stoneTile', { x: 0, y: 600, w: 420, h: 100 });
  for (const r of [[60, 120, 260, 24], [110, 144, 24, 140], [210, 144, 24, 140], [300, 300, 120, 24], [0, 420, 380, 30], [180, 450, 24, 80]]) S.zone('dock', { x: r[0], y: r[1], w: r[2], h: r[3] });
  S.zone('dock', { x: 760, y: 360, w: 300, h: 70 }); S.zone('dock', { x: 960, y: 200, w: 60, h: 160 });
  S.build(); S.paint(G, 75);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (S.kind(x, y) === 'waterDeep') G.put(x, y, ...seaPixel(x, y));
  shoreFoam(G, (x, y) => S.kind(x, y) === 'waterDeep', 75);
  quayEdge(G, 300, 600, 120, 14); quayEdge(G, 680, 600, 420, 14);
  laneLine(G, 547, 600, 220, false, { yellow: true }); laneLine(G, 552, 600, 220, false, { yellow: true });
  // the bridge: a low deck over the water to the toll plaza
  const bz = 20, br = deck({ path: [[550, -40], [550, 640]], width: 280, z: [bz, bz], lanes: 3, centre: null, face: (x, y) => 'wall', shoulder: 30, seed: 75 });
  for (const y of [100, 300, 500]) sc.vox(Q.pillar(bz, 30, 240), 550, y, 0, 0, y, 'bpil');
  place(sc, br);
  const onB = br.base + 2;
  sc.vox(Q.tollGantry(3, 80, [0, 1, 1], sc.lampsOn), 550, 300, PI / 2, bz, onB);
  for (const x of [470, 630]) sc.vox(Q.tollBooth(sc.lampsOn), x, 330, 0, bz, onB, 'booth');
  sc.person(630, 324, 'clerk', 6, 'idle', 7501);
  for (const x of [430, 670]) for (const y of [40, 200, 420, 560]) lamp(sc, x, y, 'cast', bz, onB);
  car(sc, 'taxi', 590, 120, PI / 2, { dz: bz, base: onB }); car(sc, 'sedan', 510, 420, -PI / 2, { paint: '#2f5a4a', dz: bz, base: onB }); car(sc, 'sedan', 590, 500, PI / 2, { paint: '#a83030', dz: bz, base: onB });
  car(sc, 'pickup', 510, 700, -PI / 2, { paint: '#c8c8c4' }); car(sc, 'sedan', 590, 760, PI / 2, { paint: '#5a5e66' });
  for (const [x, y, k, d] of [[440, 160, 'athleisure', 4], [660, 240, null, 0]]) sc.personUp(x, y, bz, k, d, 'walk', x + y);
  // the marina: rental hut, pilings, boats, kayaks
  const hut = sc.building({ w: 110, d: 60, style: 'siding', wallColor: '#8aa0b8', pitch: 'gable', slope: 0.5, roof: 'shingle', roofColor: '#5a6070', seed: 751, shop: { kind: 'cafe', door: 'right', open: true, awning: ['#2f7a6a', '#f0ece4'] } }, 140, 600);
  sc.vox(Q.kayakRack(3), 290, 560); for (const c of ['#e8a040', '#3a8ad8']) sc.vox(P.surfboard(c), c === '#e8a040' ? 270 : 280, 590, PI / 2);
  sc.person(120, 620, 'tourist', 0, 'idle', 7502); sc.person(200, 630, null, 0, 'idle', 7503); pet(sc, 'golden', 160, 640, 0.3, { pose: 'sit' });
  for (const [x, y] of [[60, 110], [140, 110], [240, 110], [320, 110], [100, 290], [240, 290], [320, 330], [40, 410], [380, 410], [190, 540], [420, 300]]) sc.vox(P.piling(34), x, y, 0, 0, y, 'pil34');
  sc.vox(P.yacht(), 170, 220, PI / 2); sc.vox(Q.sailboat(120, true), 40, 260, -PI / 2); sc.vox(Q.sailboat(110, false, '#ecebe4'), 280, 220, PI / 2);
  car(sc, 'speedboat', 90, 500, -PI / 2, { paint: '#f0eee8', parked: true }); car(sc, 'dinghy', 320, 480, 0.4, { parked: true });
  // the waterfront house and boathouse, its dock and terrace
  sc.building({ w: 240, d: 150, floors: 2, style: 'stucco', wallColor: '#e8dcc8', pitch: 'hip', roof: 'tile', seed: 752, doors: [{ x: 30, w: 70, kind: 'garage', open: true }], windows: [130, 190], shutters: '#3a5a6a', balconies: true }, 820, 360);
  car(sc, 'speedboat', 885, 390, -PI / 2, { paint: '#f0eee8', parked: true });
  sc.vox(P.umbrella('#f0ece4', '#f0ece4'), 1010, 400); sc.vox(P.cafeTable(), 1010, 404); for (const x of [990, 1030]) sc.vox(D.patioChair(), x, 404);
  for (const [x, y] of [[760, 440], [1060, 440], [960, 190], [1020, 190]]) sc.vox(P.piling(34), x, y, 0, 0, y, 'pil34');
  sc.vox(Q.sailboat(120, true), 1000, 80, PI / 2);
  for (const [x, y, s] of [[790, 330, 1], [1080, 330, 2]]) sc.add(palm(7510 + s, 120), x, y);
  // the promenade: railings, benches, lamps, palms, people, a hydrant
  for (let x = 0; x < 300; x += 80) sc.vox(D.railing(80), x + 40, 700, 0, 0, 700, 'rail');
  for (let x = 700; x < W; x += 80) sc.vox(D.railing(80), x + 40, 614, 0, 0, 614, 'rail');
  for (const [x, y] of [[360, 640], [720, 680], [880, 680], [1040, 680]]) lamp(sc, x, y);
  sc.vox(P.bench(), 900, 700); sc.person(900, 702, null, 0, 'idle', 7504); sc.vox(P.hydrant(), 700, 640); sc.vox(D.viewer(), 1000, 640);
  sc.person(820, 720, 'athleisure', 2, 'walk', 7505); sc.person(1060, 760, null, 6, 'walk', 7506); pet(sc, 'terrier', 1080, 770, PI);
  for (const [x, y, s] of [[20, 640, 1], [740, 780, 2]]) sc.add(palm(7520 + s, 110), x, y);
  for (const [x, y, s, z] of [[60, 760, 1, 30], [160, 790, 2, 26], [250, 740, 3, 22]]) sc.vox(D.boulder(s + 750, z, '#6e6860'), x, y);
  return sc.finish();
}
const pet = (sc, kind, x, y, hd = 0, o = {}) => sc.vox(animalModel(kind, o), x, y, hd);

// ---- I5 airport: the terminal and jet bridge, an airliner being serviced, the tower, a hangar, the runway --
export function buildAirport(preset = 'golden') {
  const W = 1500, H = 1050, sc = new Scene(W, H, preset, 76), G = sc.G;
  const S = new Streets(W, H, { lotKind: 'yard' });
  S.zone('grass', { x: 940, y: 700, w: 560, h: 90 }); S.zone('grass', { x: 940, y: 990, w: 560, h: 60 });
  S.zone('asphalt', { x: 940, y: 790, w: 560, h: 200 }); S.zone('asphalt', { x: 940, y: 560, w: 560, h: 140 });
  S.zone('asphalt', { path: [[960, 980], [960, 760], [880, 640], [760, 620]], width: 90 });
  S.build(); S.paint(G, 76);
  // apron markings: lead-in line, stop bar, safety boxes, stand number; taxiway centre lines
  laneLine(G, 760, 120, 520, false, { yellow: true, width: 3, wear: 0.05 }); laneLine(G, 730, 640, 60, true, { yellow: true, width: 3 });
  for (const [x0, y0, w, h] of [[640, 500, 100, 120], [790, 500, 100, 120]]) hatchPoly(G, [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], { yellow: false, spacing: 16 });
  roadText(G, 'A3', 800, 660, { sx: 3, sy: 5, yellow: true });
  for (let x = 0; x < W; x++) if (x % 3) { G.put(x, 700, [200, 160, 50], [0, 0, 1], 0, null, 1); }
  laneLine(G, 940, 628, 560, true, { yellow: true, width: 3 });
  // the runway: threshold piano keys, the number, edge stripes
  for (let i = 0; i < 8; i++) laneLineBar(G, 1000, 806 + i * 22, 90, 12);
  roadText(G, '27', 1120, 860, { sx: 8, sy: 12 }); laneLine(G, 940, 794, 560, true, { width: 4 }); laneLine(G, 940, 984, 560, true, { width: 4 }); laneLine(G, 1240, 888, 260, true, { dash: 40, gap: 30, width: 4 });
  stain(G, 600, 560, 30, 10); stain(G, 860, 420, 20, 8); pavementCracks(G, (x, y) => S.kind(x, y) === 'yard', 60, 761);
  // the terminal with its jet bridge
  const term = sc.building({ w: 560, d: 220, floors: 2, style: 'glass', seed: 761, roof: 'flat', parapet: 6, shop: { kind: 'lobby', door: 220, open: true, people: 6, sign: { text: 'WESTPORT INTERNATIONAL', bg: '#1e2a4e', fg: [236, 236, 230], lit: true, w: 300 } } }, 0, 360);
  roofKit(sc, term, [['ac', 60, 40], ['ac', 160, 50], ['sky', 260, 80], ['sky', 320, 80], ['ac', 440, 40], ['plant', 500, 140]]);
  sc.vox(Q.jetBridge(200, sc.lampsOn), 640, 420, 0, 0, 420);
  // the airliner at the stand, nose to the terminal side, ground crew round it
  sc.vox(Q.airliner(460, 420, '#c83a30'), 760, 340, PI / 2, 0, 520);
  car(sc, 'tanker', 980, 300, -PI / 2, { paint: '#ecebe4', parked: true });
  sc.vox(Q.beltLoader(), 860, 210, -PI / 2 + 0.3);
  sc.vox(Q.aircraftTug(), 760, 640, -PI / 2);
  for (let i = 0; i < 3; i++) sc.vox(Q.baggageCart(['#5a6a7a', '#3a5a8a', '#5a6a5a'][i]), 440 + i * 44, 520, 0, 0, 520, 'bcart' + i); sc.vox(Q.aircraftTug(), 400, 520, 0);
  for (let i = 0; i < 3; i++) sc.vox(Q.baggageCart('#5a6a7a'), 960 + i * 44, 460, 0, 0, 460, 'bcart0');
  for (const [x, y] of [[700, 610], [820, 610], [600, 300], [920, 380], [960, 150]]) sc.vox(X.cone(), x, y);
  const crew = { top: { kind: 'hivis', color: 'yellow', color2: 'navy' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'black', hat: { kind: 'hard', color: 'white' } };
  for (const [x, y, d] of [[760, 680, 4], [700, 470, 2], [900, 460, 6], [850, 250, 0], [460, 500, 2], [1010, 330, 6]]) sc.person(x, y, { ...crew, skin: (x + y) % 5, build: 1, hair: { style: 'short', color: 1 } }, d, 'idle', x);
  // the hangar with a light aircraft, the tower, the windsock and fence
  const hg = sc.building({ w: 380, d: 200, style: 'corrugated', wallColor: '#6a7a8a', seed: 762, roof: 'flat', height: 110, doors: [{ x: 70, w: 240, kind: 'roller', open: true, h: 90 }], windows: [] }, 1100, 280);
  roofKit(sc, hg, [['ac', 60, 40], ['vent', 300, 60]]);
  car(sc, 'plane', 1290, 330, PI / 2, { paint: '#ecebe4', parked: true });
  sc.vox(Q.controlTower(200, sc.lampsOn), 1420, 640, 0, 0, 640);
  sc.vox(U.windsock(), 1380, 720); car(sc, 'plane', 960, 880, -PI / 2, { paint: '#f0eee8', lights: 1 });
  for (let x = 0; x < W; x += 80) sc.vox(D.fence('chain', 80), x + 40, 1040, 0, 0, 1040, 'apfence');
  // runway and taxiway lights, approach light bars
  for (let x = 950; x < W; x += 70) for (const y of [790, 990]) { sc.vox(Q.runwayLight('#f8e8c0'), x, y, 0, 0, y, 'rlw'); sc.light(x, y, 6, 30, [1, 0.9, 0.7], sc.isNight ? 1.2 : 0.4); }
  for (const [x, y] of [[905, 620], [1015, 640], [1015, 760], [905, 760], [960, 700]]) { sc.vox(Q.runwayLight('#3a6ae8'), x, y, 0, 0, y, 'rlb'); sc.light(x, y, 6, 30, [0.3, 0.45, 1], sc.isNight ? 1.4 : 0.5); }
  for (const y of [830, 900, 960]) sc.vox(Q.approachLightBar(4), 900, y, 0, 0, y, 'alb');
  for (const [x, y] of [[560, 640], [1060, 520], [300, 640]]) lamp(sc, x, y, 'street');
  sc.light(760, 400, 60, 260, [1, 0.94, 0.85], sc.isNight ? 1.6 : 0.4);
  return sc.finish();
}
function laneLineBar(G, x0, y0, w, h) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (hash(x, y, 5) > 0.08) G.put(x, y, [232, 230, 222], [0, 0, 1], 0, null, 1 | 8); }

// ---- AL1 alleys ------------------------------------------------------------------------------------------
// Both alley sheets are laid out like their concept sheets: a strip per alley with a neutral gutter between,
// so each reads as a kit piece. Buildings either side are seen from above (roofs with their kit, and the
// south face of each where it steps down), and everything that makes an alley sits along the walls.
const GUTTER = [64, 66, 72];
const gutter = (G, x0, y0, w, h) => flat(G, x0, y0, w, h, GUTTER);
const strip = (sc, x, w, stack, seed) => stack.map(([base, d, floors, style, ex = {}], k) => sc.building({ w, d, floors, style, seed: seed + k, roof: 'flat', parapet: 4, ...ex }, x, base));
const kit = (sc, b, seed) => { const n = 2 + (seed % 2); for (let i = 0; i < n; i++) { const t = hash(i, seed, 3), k = (b.d < 80 ? ['ac', 'acs', 'vent', 'vent'] : ['ac', 'acs', 'vent', 'sky', 'ac', 'tank'])[Math.floor(hash(seed, i, 5) * (b.d < 80 ? 4 : 6))]; roofKit(sc, b, [[k, 20 + t * (b.w - 40), 30 + ((i + 0.5) / n) * (b.d - 60)]]); } };
const edgeWeeds = (G, x0, x1, y1, seed, dens = 0.06) => weeds(G, (x, y) => y < y1 && ((x >= x0 && x < x0 + 5) || (x > x1 - 5 && x <= x1)), dens, seed);
function wallLight(sc, x, y, hd = 0) { sc.vox(Q.wallLamp(sc.lampsOn), x, y, hd, 0, y, 'wl' + sc.lampsOn + hd); sc.light(x, y + 8, 44, 70, [1, 0.8, 0.52], sc.isNight ? 2.2 : 0.5); }
function lanternRow(sc, x0, x1, y, z = 64, n = 3, col = '#d8302c') {
  sc.wire(x0, y, z, x1, y, z, 6, [40, 30, 28]);
  for (let i = 1; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / (n + 1); sc.vox(Q.lantern(col, 1), x, y, 0, z - 16, y, 'lan' + col); sc.light(x, y + 3, z - 10, 46, [1, 0.42, 0.28], sc.isNight ? 1.8 : 0.6); }
}

// north-south: the service alley, the night-market alley, the rough alley (AL1 C/D/F/G/H)
export function buildAlleysNS(preset = 'golden') {
  const W = 1160, H = 780, sc = new Scene(W, H, preset, 77), G = sc.G;
  const PX = [20, 400, 780], AW = 136, SW = 112, BOT = 740;
  const S = new Streets(W, H, { lotKind: 'asphaltWorn' });
  S.zone('stoneTile', { x: PX[1] + SW, y: 0, w: AW, h: BOT });
  S.build(); S.paint(G, 77);
  PX.forEach((x0, i) => {
    const a = x0 + SW;
    wear(G, a, 0, AW, BOT, 1.4, 770 + i); edgeWeeds(G, a, a + AW, BOT, 771 + i, i === 2 ? 0.1 : 0.05);
    drain(G, a + AW / 2 - 8, 640, 16, 6); manhole(G, a + AW / 2 + 20, 250 + i * 60, 8);
    litter(G, (x, y) => x > a && x < a + AW && y < BOT, i === 2 ? 0.014 : 0.003, 772 + i);
  });
  for (const [x, y, rx, ry] of [[PX[0] + 200, 560, 14, 5], [PX[2] + 190, 480, 22, 8], [PX[2] + 150, 620, 12, 5]]) puddle(G, x, y, rx, ry);
  // the buildings either side of each alley: three stepped blocks a side, different heights and walls
  const left = [[250, 420, 2], [500, 260, 1], [BOT, 250, 2]], right = [[180, 400, 1], [460, 300, 2], [BOT, 300, 1]];
  const styleL = [['brick', 'concrete', 'brickDark'], ['brick', 'teal', 'brickDark'], ['brickDark', 'concrete', 'brick']];
  const styleR = [['concrete', 'brick', 'corrugated'], ['purple', 'brickDark', 'brick'], ['brick', 'brickDark', 'concrete']];
  const extra = [
    [{ doors: [{ x: 26, w: 60, kind: 'roller' }], windows: [] }, { fireEscape: [30, 50] }, { grime: 0.5 }],
    [{ neon: { icon: 'cup', col: [255, 80, 70], x: 40, y: 0 } }, { shop: { kind: 'diner', door: 'right', open: true, awning: ['#2f6a4e', '#2f6a4e'], people: 2 } }, { ivy: 0.3 }],
    [{ graffiti: 2, tagText: 'RATS', grime: 0.8 }, { boarded: 0.5, graffiti: 1 }, { mural: { x: 10, w: 80, h: 50 }, grime: 0.7 }],
  ];
  const extraR = [[{ grime: 0.4 }, { fireEscape: [20, 50] }, { doors: [{ x: 20, w: 70, kind: 'roller' }], windows: [] }], [{}, { neon: { icon: 'cup', col: [255, 220, 120], x: 30, y: 0 } }, {}], [{ graffiti: 2, grime: 0.8 }, { boarded: 0.6 }, { graffiti: 1, fireEscape: [30, 50] }]];
  PX.forEach((x0, i) => {
    strip(sc, x0, SW, left.map(([b, d, f], k) => [b, d, f, styleL[i][k], extra[i][k]]), 790 + i * 10).forEach((b, k) => kit(sc, b, 800 + i * 10 + k));
    strip(sc, x0 + SW + AW, SW, right.map(([b, d, f], k) => [b, d, f, styleR[i][k], extraR[i][k]]), 830 + i * 10).forEach((b, k) => kit(sc, b, 840 + i * 10 + k));
  });
  // 1 service: the van nosed in with its lights on, dumpsters and bins along the wall, a courier with a
  // hand truck of boxes, yellow guard posts, steam from a kitchen vent
  { const a = PX[0] + SW, L = a + 12, Rr = a + AW - 12, cx = a + AW / 2;
    car(sc, 'van', cx + 22, 330, PI / 2, { paint: '#ecebe4', lights: 1 });
    sc.vox(Q.steamVent(), L, 110, PI / 2); sc.vox(P.dumpster(), L + 6, 180, PI / 2); sc.vox(D.wheelieBin('#2f5aa8'), L, 236); sc.vox(D.wheelieBin('#3a6a3a'), L, 256);
    sc.vox(D.cardboard(), L + 4, 400); sc.vox(P.crate(1), L + 2, 424); sc.vox(P.crate(1), L + 14, 432); sc.vox(D.pallet(), L + 4, 470, PI / 2);
    sc.vox(Q.handTruck(2), L + 24, 520); sc.person(L + 34, 512, 'courier', 2, 'walk', 7701);
    for (const y of [150, 290, 520]) sc.vox(Q.guardPost(), Rr, y); sc.vox(P.dumpster(), Rr - 8, 610, PI / 2); sc.vox(D.trashBag(), Rr, 650); sc.vox(X.cone(), cx - 30, 92);
    wallLight(sc, Rr + 4, 120); wallLight(sc, L - 4, 330); sc.light(cx + 22, 380, 12, 90, [1, 0.95, 0.8], sc.isNight ? 1.8 : 0.4); }
  // 2 night market: stalls and a produce stand down one wall, a noodle counter and blade signs on the other,
  // red lanterns strung across, diners at a table on stools, a scooter and a blossom bush by the bins
  { const a = PX[1] + SW, L = a + 14, Rr = a + AW - 14, cx = a + AW / 2;
    for (const y of [130, 300]) sc.vox(T.marketStall(y > 200 ? '#c8343a' : '#2f7a5c', '#f0ece4', y, 56, 40), L + 10, y, PI / 2);
    sc.vox(Q.produceStand(40), L + 4, 420, PI / 2); sc.vox(D.canopy(60, 34, '#2f6a4e', sc.lampsOn, 54), Rr - 8, 200, -PI / 2);
    sc.vox(I.servingCounter(56, 1), Rr - 10, 200, -PI / 2);
    for (const y of [110, 280, 470]) sc.vox(Q.bladeSign(y === 280 ? '#c8242a' : '#2a6a4a', 1), Rr + 2, y);
    for (const y of [90, 190, 290, 390, 490]) lanternRow(sc, a + 2, a + AW - 2, y, 70, 3);
    sc.vox(P.cafeTable(), cx, 560); for (const [dx, dy, d] of [[-14, -2, 6], [14, -2, 2], [0, 12, 0]]) { sc.vox(D.patioChair('#c8342a'), cx + dx, 560 + dy); sc.person(cx + dx, 560 + dy + 1, null, d, 'idle', 7710 + dx); }
    for (const [x, y, k, d] of [[cx - 20, 220, 'student', 4], [cx + 10, 250, 'commuter', 0], [cx + 20, 360, 'barista', 4], [cx - 16, 430, null, 0]]) sc.person(x, y, k, d, 'walk', x + y);
    sc.vox(P.scooter('#c8343a'), Rr - 6, 640, PI / 2); sc.add(bush(7720, 18, { flowers: '#e86a90' }), L + 4, 600); sc.vox(D.wheelieBin('#2f5aa8'), Rr, 690); sc.vox(D.wheelieBin('#3a6a3a'), Rr - 18, 700);
    for (const y of [140, 320, 480]) sc.light(cx, y, 40, 90, [1, 0.6, 0.35], sc.isNight ? 1.4 : 0.5); }
  // 3 rough: a padlocked chain gate at the end, a burn barrel by a mattress and bags, a shopping trolley,
  // tyres, someone waiting in a doorway under the one lamp, puddles and litter
  { const a = PX[2] + SW, L = a + 12, Rr = a + AW - 12, cx = a + AW / 2;
    sc.vox(D.fence('chain', AW, { barbed: true }), cx, 60);
    sc.vox(D.mattress(), L + 8, 250, PI / 2); sc.vox(P.burnBarrel(1), L + 24, 300); sc.light(L + 24, 300, 20, 90, LIGHT.fire, sc.isNight ? 2.6 : 1.1);
    for (const [dx, dy, c] of [[0, 330, '#2a2a30'], [12, 340, '#3a3a44'], [2, 350, '#2a2a30']]) sc.vox(D.trashBag(c), L + dx, dy); sc.vox(D.pallet(), L + 4, 200, PI / 2 + 0.3);
    sc.vox(Q.trolley(), Rr - 10, 410, 0.4); sc.vox(D.tires(2), L + 8, 520); sc.vox(D.cardboard(), Rr - 4, 470);
    sc.person(Rr - 6, 230, 'robber', 2, 'idle', 7702); wallLight(sc, Rr + 4, 190); sc.person(cx, 600, 'punk', 4, 'walk', 7703); }
  // the gutters between the strips
  gutter(G, 0, 0, PX[0], H); gutter(G, PX[0] + 360, 0, 40, H); gutter(G, PX[1] + 360, 0, 40, H); gutter(G, PX[2] + 360, 0, W - PX[2] - 360, H); gutter(G, 0, BOT, W, H - BOT);
  return sc.finish();
}

// east-west: the Old Town lane, the industrial alley, the residential back lane (AL1 A/B/E). Here the
// camera sees the north side's back walls full on, so that's where the doors, pipes and life go; the south
// side is kept low (sheds, walls and hedges) so it doesn't cover the lane.
export function buildAlleysEW(preset = 'golden') {
  const W = 1100, H = 1100, sc = new Scene(W, H, preset, 78), G = sc.G;
  const PY = [20, 380, 740], X0 = 20, X1 = 1080;
  const S = new Streets(W, H, { lotKind: 'asphaltWorn' });
  S.zone('cobble', { x: 0, y: PY[0] + 150, w: W, h: 150 });
  S.build(); S.paint(G, 78);
  PY.forEach((y0, i) => {
    const fb = y0 + 150;
    wear(G, X0, fb, X1 - X0, 150, i === 0 ? 0.6 : 1.4, 780 + i);
    weeds(G, (x, y) => (y > fb && y < fb + 5) || (y > fb + 112 && y < fb + 120), 0.05, 781 + i);
    drain(G, 300 + i * 200, fb + 80, 16, 6); manhole(G, 700 - i * 120, fb + 60, 8);
    litter(G, (x, y) => y > fb && y < fb + 150, 0.002, 782 + i);
  });
  puddle(G, 300, PY[1] + 250, 20, 6); puddle(G, 820, PY[2] + 240, 14, 5);
  // the south side of each lane: low sheds with roof kit, walls and hedges between
  const southSide = (y0, i, wallKind) => {
    const base = y0 + 340;
    for (const [x, w, k] of [[40, 200, 0], [420, 160, 1], [800, 240, 2]]) { const b = sc.building({ w, d: 44, height: 30, style: ['concrete', 'brick', 'siding'][(i + k) % 3], wallColor: k === 2 ? '#a8a49a' : undefined, seed: 860 + i * 3 + k, roof: 'flat', parapet: 4, blank: true }, x, base); kit(sc, b, 870 + i * 3 + k); }
    for (const [x, len] of [[240, 180], [580, 220]]) for (let s = x; s < x + len; s += 60) sc.vox(wallKind === 'hedge' ? P.hedge(60, 14) : D.fence(wallKind, 60), s + 30, base - 24, 0, 0, base - 24, 'sw' + wallKind);
    for (const [x, s] of [[300, 1], [640, 2], [1060, 3]]) sc.add(bush(880 + i * 4 + s, 16), x, base - 10);
  };
  // 1 Old Town lane: a row of old fronts with ivy, shutters and window boxes, a café table under an umbrella,
  // laundry across the lane, a cat on a doorstep, a bicycle by the door, a lamp over each door
  { const y0 = PY[0], fb = y0 + 150;
    sc.building({ w: 360, d: 34, floors: 2, style: 'peach', seed: 781, roof: 'flat', parapet: 4, ivy: 0.4, shutters: '#2e5a4a', doors: [{ x: 160, w: 22, kind: 'door' }], windows: [40, 100, 230, 290], porchLight: true }, X0, fb);
    sc.building({ w: 380, d: 34, floors: 2, style: 'brick', seed: 782, roof: 'flat', parapet: 4, ivy: 0.7, shutters: '#2e5a4a', doors: [{ x: 210, w: 22, kind: 'door', open: true }], windows: [40, 100, 160, 290, 340], porchLight: true }, 380, fb);
    sc.building({ w: 320, d: 34, floors: 2, style: 'stone', seed: 783, roof: 'flat', parapet: 4, ivy: 0.3, shutters: '#6a2e2a', doors: [{ x: 120, w: 22, kind: 'door' }], windows: [40, 200, 260], porchLight: true }, 760, fb);
    sc.vox(P.umbrella('#e8603a', '#f0ece4'), 120, fb + 40); sc.vox(P.cafeTable(), 120, fb + 46); for (const x of [96, 144]) sc.vox(D.patioChair('#6a4a30'), x, fb + 46);
    sc.person(98, fb + 48, null, 2, 'idle', 7801); sc.vox(P.chalkboard(), 230, fb + 14);
    for (const x of [60, 300, 440, 700, 840, 1000]) sc.vox(P.flowerBed(30), x, fb + 6, 0, 0, fb + 6, 'fb30');
    for (const x of [216, 560, 880]) sc.vox(D.planterBox(16, 16, true), x, fb + 12);
    sc.vox(P.laundryLine(140), 520, fb + 20, 0, 70, fb + 20); pet(sc, 'catGinger', 600, fb + 10, 0.4, { pose: 'sit' });
    car(sc, 'bicycle', 660, fb + 16, 0, { parked: true }); sc.person(400, fb + 80, 'granny', 6, 'walk', 7802);
    southSide(y0, 0, 'hedge'); }
  // 2 industrial: corrugated sheds, a roller door open on a lit bay of stacked boxes, a forklift, pallets,
  // drums, pipes along the wall, guard posts either side of each door
  { const y0 = PY[1], fb = y0 + 150;
    sc.building({ w: 540, d: 34, floors: 2, style: 'corrugated', wallColor: '#6a7a84', seed: 784, roof: 'flat', parapet: 4, grime: 0.6, doors: [{ x: 160, w: 140, kind: 'roller', open: true, h: 64 }, { x: 40, w: 22, kind: 'door' }], windows: [] }, X0, fb);
    sc.building({ w: 520, d: 34, floors: 2, style: 'corrugated', wallColor: '#8a8a84', seed: 785, roof: 'flat', parapet: 4, grime: 0.5, doors: [{ x: 160, w: 140, kind: 'roller', h: 64 }, { x: 420, w: 22, kind: 'door' }], windows: [] }, 560, fb);
    sc.vox(X.pipeRun(520, 40, 3, '#7a6a5a'), 300, fb + 2, 0, 0, fb + 1); sc.vox(X.pipeRun(400, 50, 4, '#5a6a7a'), 840, fb + 2, 0, 0, fb + 1);
    for (let k = 0; k < 4; k++) sc.vox(P.crate(1 + (k % 2)), 220 + k * 22, fb + 14);
    sc.vox(X.forklift('#e0b030', true), 560, fb + 60, PI / 2 + 0.2); sc.person(470, fb + 70, 'dockhand', 6, 'walk', 7803);
    for (const [x, d] of [[80, 0], [96, 0], [88, 8]]) sc.vox(D.pallet(), x, fb + 20 + d, 0.1);
    for (const x of [640, 656, 672]) sc.vox(D.oilDrum(x === 656 ? '#c8343a' : '#3a5a8a', x === 672 ? 1 : 0), x, fb + 14);
    for (const x of [176, 324, 716, 864]) sc.vox(Q.guardPost(), x, fb + 8);
    sc.vox(P.dumpster(), 1010, fb + 20); sc.vox(X.cone(), 600, fb + 100); sc.light(250, fb + 10, 30, 110, LIGHT.warmWindow, sc.isNight ? 2.2 : 0.8);
    wallLight(sc, 70, fb + 6); wallLight(sc, 1000, fb + 6);
    southSide(y0, 1, 'chain'); }
  // 3 residential back lane: garages with a hoop over one door, wood fences with gardens and trees behind,
  // bins by the gates, the pickup with a load in the bed, a dog walker
  { const y0 = PY[2], fb = y0 + 150;
    for (const [x, y, s] of [[60, fb - 30, 1], [340, fb - 40, 2], [620, fb - 34, 3], [980, fb - 30, 4]]) tree(sc, x, y, 7810 + s, 120, 44);
    sc.building({ w: 240, d: 50, floors: 1, style: 'siding', wallColor: '#c8c0b0', seed: 786, roof: 'flat', parapet: 4, doors: [{ x: 30, w: 80, kind: 'garage' }, { x: 130, w: 80, kind: 'garage', open: true }], windows: [] }, 100, fb);
    sc.building({ w: 200, d: 50, floors: 1, style: 'brick', seed: 787, roof: 'flat', parapet: 4, doors: [{ x: 60, w: 80, kind: 'garage' }], windows: [] }, 700, fb);
    for (let x = X0; x < 100; x += 80) sc.vox(D.fence('wood', 80), x + 40, fb - 4, 0, 0, fb - 4, 'wd80');
    for (let x = 340; x < 700; x += 80) sc.vox(D.fence('wood', 80), x + 40, fb - 4, 0, 0, fb - 4, 'wd80');
    for (let x = 900; x < X1; x += 80) sc.vox(D.fence('wood', 80), x + 40, fb - 4, 0, 0, fb - 4, 'wd80');
    sc.vox(D.hoop(), 800, fb + 4, PI / 2);
    for (const [x, c] of [[360, '#3a6a3a'], [380, '#2f5aa8'], [920, '#3a6a3a'], [940, '#5a5a5a']]) sc.vox(D.wheelieBin(c), x, fb + 10);
    car(sc, 'pickup', 520, fb + 70, 0, { paint: '#8a2e2e', cargo: [1], parked: true }); sc.person(260, fb + 80, null, 0, 'walk', 7804); pet(sc, 'golden', 290, fb + 86, 0, { phase: 0.4 });
    wallLight(sc, 440, fb - 2); southSide(y0, 2, 'wood'); }
  for (const y0 of PY) gutter(G, 0, y0 + 340, W, 40);
  gutter(G, 0, 0, W, PY[0]); gutter(G, 0, 0, X0, H); gutter(G, X1, 0, W - X1, H);
  return sc.finish();
}

export const ROAD_SCENES = { roadkit: buildRoadKit, interchange: buildInterchange, overpass: buildOverpass, crossing: buildCrossing, tollbridge: buildTollBridge, airport: buildAirport, alleysNS: buildAlleysNS, alleysEW: buildAlleysEW };
export const ROAD_TARGETS = { roadkit: 'I1-A_road-kit.png', interchange: 'H1-A_interchange.png', overpass: 'I2-A_overpass.png', crossing: 'I3-A_level-crossing.png', tollbridge: 'I4-A_toll-bridge-marina.png', airport: 'I5-A_airport.png', alleysNS: 'AL1-H_alleys-ns-4.png', alleysEW: 'AL1-E_alleys-ew-3.png' };
