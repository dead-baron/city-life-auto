// Art v2 cut-away scenes, built to the T1, T2, G1, J2/J3 and J1 targets: the underground metro station,
// the metro tunnel with its service rooms, the boxing and weights gym on a street corner, the prison
// interiors (cells, canteen, control room, the breakout at the yard gate) and the prison island. Rooms
// come from interior.js; everything else from the same kits as the districts (768 x 512 design px,
// no layout warp: interiors are drawn at their true size).
//
// CUTAWAYS[name](preset) -> { G, lights };  CUTAWAY_TARGETS[name] -> target image;  CUTAWAY_PRESET
import { Scene, Streets } from './scene.js';
import { room, underground } from './interior.js';
import { paintRect, railTrack, laneLine, zebra, manhole, drain, towel, courtLines, shoreFoam, puddle, stain, quayEdge, weeds, leafLitter, litter } from './ground.js';
import * as P from './props.js';
import * as D from './props-district.js';
import * as X from './props-transit.js';
import * as K from './props-park.js';
import * as U from './props-rural.js';
import * as T from './props-town.js';
import * as I from './props-interior.js';
import { courtLines as courtLinesW } from './ground-warped.js';
import { vehicleModel } from './vehicles.js';
import { makeBuilding } from './buildings.js';
import { palm, leafyTree, bush } from './trees.js';
import { LIGHT } from './palette.js';
import { hash } from './gbuf.js';
import { DW, DH, car, lamp, tree, fenceRun, seaPixel } from './districts.js';

const PI = Math.PI;
const FLUO = [0.85, 0.95, 1.0], WARM = [1.0, 0.82, 0.58];
// a strip of yellow tactile paving along a platform edge (x0..x1 at y, h rows)
function tactile(G, x0, x1, y, h = 8) { for (let yy = y; yy < y + h; yy++) for (let x = x0; x < x1; x++) G.put(x, yy, (x % 4 < 2) !== (yy % 4 < 2) ? [226, 180, 50] : [240, 200, 70], [0, 0, 1], 0, null, 1 | 8); }
// the face of a raised platform edge, seen from the track side (dark, with a lip of light on top)
function edgeFace(G, x0, x1, y, h = 12) { for (let k = 0; k < h; k++) for (let x = x0; x < x1; x++) G.put(x, y + k, k === 0 ? [150, 146, 136] : [Math.max(20, 70 - k * 4), Math.max(18, 64 - k * 4), Math.max(22, 62 - k * 3)], [0, 1, 0], h - k, null, 1); }
function ballast(G, x, y, w, h) { paintRect(G, x, y, w, h, 'ballast', 5); }

// ---- T1 metro station: the ticket hall up top, the train at the platform, the second track below ------
export function buildMetroStation(preset = 'indoor') {
  const sc = new Scene(DW, DH, preset, 31, { walk: 1 }), G = sc.G;
  underground(sc, 0, 0, DW, DH);
  const r = room(sc, { x: 40, y: 92, w: 688, d: 380, floor: 'tileWhite', wall: 'tile', wallColor: '#e2e0d6', band: '#2a5aa0', wallH: 86, cut: 18, seed: 31,
    doors: [{ side: 'n', at: 80, w: 76, h: 76, open: true, stairs: true }, { side: 'n', at: 330, w: 34, h: 56, kind: 'steel', exit: true }],
    deco: [{ kind: 'poster', at: 10, v: 16, w: 30, h: 40, col: '#2a6ab0' }, { kind: 'poster', at: 46, v: 16, w: 24, h: 40, col: '#a8342e', sun: false },
      { kind: 'sign', at: 170, v: 52, w: 120, text: 'METRO', col: '#2a5aa0', sx: 3, lit: true }, { kind: 'board', at: 300, v: 30, w: 24, h: 18 },
      { kind: 'map', at: 400, v: 16, w: 110, h: 50 }, { kind: 'poster', at: 610, v: 16, w: 60, h: 46, col: '#2a6ab0' },
      ...[20, 200, 420, 560, 650].map((at) => ({ kind: 'lamp', at, v: 70, w: 30 })), { kind: 'pipe', at: 0, v: 80, w: 688, col: '#5a5a60' }],
  });
  // floors: the ticket hall, track 1 in its pit, the island platform, track 2
  const yHall = 92, yT1 = 196, yPlat = 286, yT2 = 396;
  ballast(G, 40, yT1, 688, yPlat - yT1); railTrack(G, 40, yT1 + 26, 688, true, { gauge: 30 });
  paintRect(G, 40, yPlat, 688, yT2 - yPlat, 'platform', 33); tactile(G, 40, 728, yPlat, 8); tactile(G, 40, 728, yT2 - 10, 8);
  ballast(G, 40, yT2 + 12, 688, 472 - yT2 - 12); edgeFace(G, 40, 728, yT2, 12); railTrack(G, 40, yT2 + 30, 688, true, { gauge: 30 });
  edgeFace(G, 40, 728, yT1 - 2, 8);
  // the stairs up to the street, the ticket hall
  for (const x of [118, 196]) sc.vox(D.railing(30), x, 104, PI / 2, 0, 104, 'srail');
  sc.person(150, 116, 'commuter', 4, 'walk', 3101);
  for (const x of [400, 430, 460, 490]) sc.vox(I.turnstile(1, x !== 490), x, 164, PI / 2, 0, 164, 'ts' + (x !== 490));
  sc.vox(X.ticketMachine(1), 540, 128); sc.vox(X.ticketMachine(1), 560, 128); sc.vox(P.wireBin(), 590, 130);
  sc.vox(P.bench(), 90, 170); sc.person(80, 172, 'student', 0, 'idle', 3102); sc.vox(P.wireBin(), 60, 160);
  sc.person(420, 150, 'commuter', 4, 'walk', 3103); sc.person(470, 176, 'office', 0, 'walk', 3104); sc.person(520, 140, null, 0, 'idle', 3105);
  sc.person(660, 140, 'janitor', 0, 'idle', 3106); sc.vox(X.cone(), 680, 150);
  sc.vox(T.ropeLine(60), 300, 192); sc.vox(T.ropeLine(60), 620, 192);
  // the train on track 1, doors open, riders inside
  for (const x of [170, 440, 710]) sc.vox(I.metroCar(264, true, 1), x, yT1 + 42, 0, 0, yT1 + 60, 'metro');
  // the platform: tiled pillars, benches, waiting riders, a busker
  for (const x of [130, 310, 490, 670]) sc.vox(I.tiledPillar(96), x, yPlat + 44, 0, 0, yPlat + 44, 'pillar');
  for (const x of [130, 310, 490, 670]) sc.light(x, yPlat + 48, 50, 120, FLUO, 1.4);
  sc.vox(P.bench(), 220, yPlat + 64); sc.person(210, yPlat + 66, null, 4, 'idle', 3110); sc.person(234, yPlat + 66, 'socialite', 4, 'idle', 3111);
  for (const [x, k] of [[80, 'student'], [380, 'commuter'], [430, 'nurse'], [560, 'banker']]) sc.person(x, yPlat + 46, k, 4, 'idle', x * 7);
  sc.person(600, yPlat + 70, 'busker', 0, 'idle', 3112); sc.vox(I.amp(), 580, yPlat + 70); sc.vox(I.guitarCase(true), 630, yPlat + 82);
  sc.vox(P.wireBin(), 700, yPlat + 80); sc.vox(T.pigeon(), 350, yPlat + 90, 1);
  // tunnel mouths at both ends, with signals
  for (const [x, hd, y, sig] of [[44, 0, yT1 + 42, 'red'], [724, PI, yT1 + 42, 'red'], [44, 0, yT2 + 46, 'red'], [724, PI, yT2 + 46, 'green']]) sc.vox(I.tunnelPortal(96, 70, sig), x, y, hd, 0, y);
  for (const [x, y, c] of [[60, yT1 + 30, [1, 0.2, 0.15]], [708, yT1 + 30, [1, 0.2, 0.15]], [60, yT2 + 34, [1, 0.2, 0.15]], [708, yT2 + 34, [0.3, 1, 0.4]]]) sc.light(x, y, 40, 60, c, 1.4);
  // light: hall strips, a warm spill from the stairs, train interior
  for (const x of [80, 260, 460, 620, 700]) sc.light(x, yHall + 10, 70, 150, FLUO, 1.3);
  sc.light(118, yHall - 10, 60, 120, WARM, 2);
  for (const x of [100, 300, 500, 680]) sc.light(x, yT1 + 46, 30, 80, WARM, 0.6);
  for (const x of [120, 400, 680]) sc.light(x, yT2 + 50, 50, 120, FLUO, 0.8);
  return sc.finish();
}

// ---- T2 metro tunnel: the running tunnel with a train, service rooms either side, the line rising ----
export function buildMetroTunnel(preset = 'indoor') {
  const sc = new Scene(DW, DH, preset, 32, { walk: 1 }), G = sc.G;
  underground(sc, 0, 0, DW, DH);
  // the daylight cutting at the top right where the line comes up
  paintRect(G, 560, 0, 208, 140, 'grass', 9); ballast(G, 640, 0, 70, 220); railTrack(G, 646, 0, 220, false, { gauge: 30 });
  for (let y = 0; y < 140; y++) for (let k = 0; k < 8; k++) { G.put(630 - k, y, [96 - k * 6, 94 - k * 6, 90 - k * 5], [1, 0, 0], 20, null, 0); G.put(720 + k, y, [110 - k * 6, 106 - k * 6, 100 - k * 5], [-1, 0, 0], 20, null, 0); }
  // the running tunnel
  room(sc, { x: 0, y: 210, w: 768, d: 130, floor: 'ballast', wall: 'concrete', wallColor: '#6a6866', wallH: 80, cut: 18, seed: 32, west: false, east: false,
    deco: [{ kind: 'pipe', at: 0, v: 60, w: 768, col: '#7a4a36' }, { kind: 'pipe', at: 0, v: 50, w: 768, col: '#5a5a60' }, ...[100, 340, 560].map((at) => ({ kind: 'lamp', at, v: 40, w: 24 }))] });
  railTrack(G, 0, 236, 768, true, { gauge: 30 }); railTrack(G, 0, 290, 640, true, { gauge: 30 });
  for (const x of [80, 344, 608]) sc.vox(I.metroCar(264, false, 1), x, 268, 0, 0, 290, 'metroC');
  for (const x of [80, 344, 608]) sc.light(x, 270, 30, 90, WARM, 0.6);
  for (const [x, y, hd, s] of [[10, 260, 0, 'red'], [756, 300, PI, 'green']]) sc.vox(I.tunnelPortal(90, 66, s), x, y, hd, 0, y);
  sc.light(30, 250, 40, 60, [1, 0.2, 0.15], 1.4); sc.light(740, 290, 40, 60, [0.3, 1, 0.4], 1.4);
  // the service room above: a workbench, shelves, a worker
  room(sc, { x: 110, y: 96, w: 360, d: 90, floor: 'yard', wall: 'concrete', wallColor: '#7a7874', wallH: 78, cut: 16, seed: 33, doors: [{ side: 's', at: 300, w: 40, open: true }],
    deco: [{ kind: 'pipe', at: 0, v: 56, w: 360, col: '#8a4a36' }, { kind: 'lamp', at: 60, v: 66, w: 26 }, { kind: 'lamp', at: 240, v: 66, w: 26 }, { kind: 'board', at: 150, v: 26, w: 40, h: 22 }] });
  sc.vox(I.desk(70), 160, 130); sc.vox(I.lockers(3, '#7a6a5a'), 260, 110); sc.vox(D.oilDrum('#8a5a3a', 1), 340, 140); sc.vox(D.oilDrum('#3a5a8a'), 356, 150);
  sc.vox(P.crate(1), 420, 150); sc.person(200, 156, 'dockhand', 0, 'idle', 3201); sc.light(200, 120, 60, 140, WARM, 1.6);
  // the store room below and the stair down from the street at the bottom left
  room(sc, { x: 380, y: 384, w: 300, d: 90, floor: 'yard', wall: 'concrete', wallColor: '#6e6c68', wallH: 72, cut: 16, seed: 34, doors: [{ side: 'n', at: 130, w: 36, h: 52, kind: 'steel' }],
    deco: [{ kind: 'pipe', at: 0, v: 50, w: 300, col: '#7a4a36' }, { kind: 'lamp', at: 60, v: 60, w: 24 }] });
  for (const [x, y, t] of [[420, 430, 1], [440, 440, 2], [600, 430, 1], [620, 446, 3]]) sc.vox(P.crate(t), x, y); sc.vox(D.pallet(), 520, 450); sc.light(440, 400, 60, 120, WARM, 1.3);
  room(sc, { x: 40, y: 400, w: 150, d: 90, floor: 'tileWhite', wall: 'tile', band: '#2a5aa0', wallH: 76, cut: 16, seed: 35, doors: [{ side: 'n', at: 100, w: 36, h: 54, kind: 'steel', exit: true }],
    deco: [{ kind: 'lamp', at: 30, v: 64, w: 24 }] });
  sc.vox(K.steps(50, 6, 6, 7, '#8a8a88'), 70, 440, PI, 0, 440); sc.light(70, 410, 60, 110, FLUO, 1.4);
  // the light-rail car coming down the cutting into the tunnel, a lamp and a walker at the top
  car(sc, 'tram', 676, 110, PI / 2, { paint: '#e4e6ea' });
  lamp(sc, 744, 40, 'cast'); sc.person(600, 40, null, 0, 'walk', 3202); fenceRun(sc, 'chain', 600, 140, 630, 140);
  return sc.finish();
}

// ---- G1 gym: the weights floor, the boxing ring, cardio, reception and lockers, the street outside ----
export function buildGym(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 41, { walk: 1 }), G = sc.G;
  const S = new Streets(DW, DH, { corner: 16, sidewalk: 70, lotKind: 'sidewalk' });
  S.road(0, 452, DW, 60); S.zone('yard', { x: 0, y: 0, w: DW, h: 90 });
  S.build(); S.paint(G, 41);
  laneLine(G, 0, 490, DW, true, { yellow: true, dash: 18, gap: 12 });
  // the shell: the main floor, then reception and lockers along the street side
  room(sc, { x: 40, y: 92, w: 688, d: 300, floor: 'rubber', wall: 'brick', wallH: 86, cut: 18, seed: 41, capColor: '#7a6a5a',
    doors: [{ side: 's', at: 300, w: 60, open: true, kind: 'glass' }],
    deco: [{ kind: 'mirror', at: 20, v: 10, w: 150, h: 52 }, { kind: 'fan', at: 200, v: 50, w: 22 }, { kind: 'silhouette', at: 250, v: 18, w: 34, h: 46 }, { kind: 'fan', at: 330, v: 50, w: 22 },
      { kind: 'silhouette', at: 550, v: 20, w: 28, h: 40 }, { kind: 'silhouette', at: 584, v: 20, w: 28, h: 40 }, { kind: 'pipe', at: 0, v: 78, w: 688, col: '#3a3a40' },
      ...[40, 140, 260, 380, 500, 620].map((at) => ({ kind: 'lamp', at, v: 70, w: 22 }))],
    lights: [[80, 30, 70, 160, WARM, 1.4], [260, 30, 70, 170, WARM, 1.4], [440, 30, 70, 170, WARM, 1.4], [620, 30, 70, 170, WARM, 1.4], [200, 200, 70, 200, WARM, 1.2], [520, 200, 70, 200, WARM, 1.2]] });
  paintRect(G, 290, 220, 190, 90, 'platform', 42);                                    // the cardio pad
  towel(G, 66, 300, 70, 26, [[60, 110, 190]]); towel(G, 150, 316, 40, 20, [[60, 110, 190]]);
  // reception and the locker room (inner rooms with cut walls)
  room(sc, { x: 230, y: 312, w: 220, d: 80, floor: 'woodFloor', wall: 'brick', wallH: 20, cut: 16, seed: 43, north: 'cut', south: false, doors: [{ side: 'n', at: 160, w: 50 }] });
  room(sc, { x: 540, y: 290, w: 188, d: 102, floor: 'tileWhite', wall: 'brick', wallH: 20, cut: 16, seed: 44, north: 'cut', south: false, doors: [{ side: 'w', at: 20, w: 36 }] });
  sc.vox(I.receptionDesk(110), 320, 360); sc.person(320, 340, 'clerk', 0, 'idle', 4101); sc.person(300, 382, 'commuter', 4, 'idle', 4102);
  sc.vox(I.drinksFridge(1), 410, 330); sc.vox(P.pottedPalm(), 250, 330);
  sc.vox(I.lockers(5, '#5a6a7a'), 716, 340, PI / 2); sc.vox(P.bench(), 640, 360); sc.person(630, 362, 'athleisure', 0, 'idle', 4103);
  // weights
  sc.vox(I.dumbbellRack(150), 130, 118); sc.vox(I.dumbbellRack(90), 60, 210, PI / 2);
  sc.vox(I.weightBench(true), 130, 190); sc.person(126, 176, 'lifter', 0, 'idle', 4110); sc.person(160, 210, 'lifter', 6, 'idle', 4111);
  sc.vox(I.weightBench(false), 180, 260); sc.person(186, 254, 'athleisure', 2, 'idle', 4112);
  sc.vox(I.squatRack(true), 300, 150); sc.person(300, 152, 'lifter', 0, 'idle', 4113); sc.vox(I.kettlebells(4), 380, 150);
  // the bag line and the ring
  for (const [x, c] of [[420, '#2a2a30'], [460, '#a8282e'], [500, '#2a2a30']]) sc.vox(I.punchBag(c), x, 136, 0, 0, 136, 'bag' + c);
  sc.person(446, 160, 'boxer', 2, 'idle', 4120); sc.person(500, 200, 'athleisure', 6, 'walk', 4121);
  sc.vox(I.boxingRing(150), 640, 210); sc.personUp(612, 186, 14, 'boxer', 2, 'idle', 4122); sc.personUp(664, 196, 14, { ...{ build: 0, hair: { style: 'short', color: 0 }, top: { kind: 'tank', color: 'black' }, bottom: { kind: 'shorts', color: 'blue' }, shoes: 'black', hat: { kind: 'helmet', color: 'navy' } } }, 6, 'idle', 4123);
  // cardio, the rig, tyres, balls
  for (const x of [310, 370, 430]) { sc.vox(I.treadmill(1), x, 270, -PI / 2, 0, 270, 'tread'); sc.personUp(x, 260, 6, x === 370 ? 'athleisure' : 'lifter', 4, 'walk', x * 3); }
  sc.vox(I.squatRack(false), 500, 270); sc.person(500, 262, 'lifter', 0, 'idle', 4130);
  sc.vox(D.tires(1), 560, 280); sc.vox(D.tires(2), 580, 266);
  for (const [x, y, c] of [[80, 330, '#2a5aa8'], [96, 340, '#c8343a']]) sc.vox(I.medBall(c, 9), x, y); sc.person(100, 312, 'yogi', 0, 'idle', 4131);
  for (const [x, y] of [[50, 140], [200, 116], [530, 116], [250, 300]]) sc.vox(P.pottedPalm(), x, y, 0, 0, y, 'ppalm');
  // the street: the glass entrance with a doormat and lit sign, a bench, a bike, a lamp, trees
  paintRect(G, 300, 396, 60, 22, 'rubber', 45);
  sc.building({ w: 100, d: 6, style: 'stucco', wallColor: '#1e2a2a', seed: 46, height: 30, blank: true, plaques: [{ text: 'IRON GYM', x: 4, v: 6, sx: 2, fg: [250, 230, 160], lit: true, w: 92 }] }, 380, 432);
  sc.vox(P.bollard(), 376, 432); sc.vox(P.bollard(), 484, 432);
  sc.vox(P.bench(), 140, 420); sc.vox(P.wireBin(), 200, 418); car(sc, 'bicycle', 600, 422, 0, { parked: true }); sc.vox(P.hydrant(), 60, 440);
  lamp(sc, 100, 440, 'cast'); lamp(sc, 520, 440, 'cast'); tree(sc, 30, 440, 4140, 120, 44); tree(sc, 730, 440, 4141, 120, 44);
  sc.person(420, 430, 'student', 2, 'walk', 4142); sc.person(220, 432, null, 6, 'walk', 4143);
  car(sc, 'sedan', 160, 482, 0, { paint: '#3a5a8a' });
  // neighbouring rooftops behind
  const nb = sc.building({ w: 768, d: 60, style: 'brick', seed: 47, roof: 'flat', parapet: 6, blank: true, height: 20 }, 0, 60);
  sc.onRoof(nb, P.roofAC(), 80, 20); sc.onRoof(nb, P.roofAC(), 400, 20); sc.onRoof(nb, P.roofVent(), 600, 30);
  return sc.finish();
}

// ---- J2/J3 prison interiors: cell block, canteen, control room, and the breakout at the yard gate -----
export function buildPrisonInside(preset = 'indoor') {
  const sc = new Scene(DW, DH, preset, 51, { walk: 1 }), G = sc.G;
  underground(sc, 0, 0, DW, DH);
  // the cell block: cells along the back wall, a catwalk rail, a guard on the floor
  room(sc, { x: 20, y: 96, w: 356, d: 150, floor: 'yard', wall: 'cinder', wallColor: '#8a8a86', band: true, wallH: 86, cut: 16, seed: 51,
    deco: [...[20, 110, 200, 290].map((at) => ({ kind: 'lamp', at, v: 74, w: 24 })), { kind: 'pipe', at: 0, v: 82, w: 356, col: '#5a5a60' }] });
  for (const [x, open] of [[60, false], [148, false], [236, true], [324, false]]) sc.vox(I.cell(84, 64, open), x, 160, 0, 0, 160, 'cell' + open);
  for (const [x, d] of [[44, 0], [132, 2], [300, 0]]) sc.person(x, 132, 'inmate', d, 'idle', x * 13);
  sc.person(236, 186, 'inmate', 4, 'walk', 5101); sc.person(330, 214, 'warden', 6, 'walk', 5102); sc.person(60, 220, 'warden', 0, 'idle', 5103);
  sc.vox(D.railing(150), 110, 196); sc.vox(K.steps(40, 5, 5, 6, '#5a5a60'), 350, 240, PI / 2);
  for (const x of [60, 148, 236, 324]) sc.light(x, 140, 50, 70, WARM, 1.6);
  // the canteen: counter with cooks behind, tables of inmates
  room(sc, { x: 400, y: 96, w: 348, d: 150, floor: 'checker', wall: 'tile', wallColor: '#d8d6cc', band: '#2e6a5a', wallH: 86, cut: 16, seed: 52,
    doors: [{ side: 'n', at: 300, w: 34, h: 56, kind: 'steel' }], deco: [...[40, 160, 260].map((at) => ({ kind: 'lamp', at, v: 74, w: 30 }))] });
  sc.person(470, 112, 'cook', 4, 'idle', 5201); sc.person(560, 112, 'cook', 4, 'idle', 5202);
  sc.vox(I.servingCounter(200, 1), 530, 132);
  for (const x of [470, 510, 550]) sc.person(x, 150, 'inmate', 4, 'idle', x * 7);
  sc.vox(I.canteenTable(110), 500, 196); sc.vox(I.canteenTable(110), 660, 196);
  for (const [x, y, d] of [[480, 176, 0], [520, 176, 0], [640, 176, 0], [680, 218, 4], [500, 218, 4]]) sc.person(x, y, 'inmate', d, 'idle', x + y);
  sc.person(730, 160, 'warden', 6, 'idle', 5203); sc.person(420, 230, 'warden', 2, 'idle', 5204);
  sc.light(480, 110, 60, 140, FLUO, 1.6); sc.light(660, 110, 60, 140, FLUO, 1.6); sc.light(580, 200, 60, 160, FLUO, 1.2);
  // the control room: the monitor wall, the desk, cabinets and the gun locker
  room(sc, { x: 20, y: 342, w: 356, d: 150, floor: 'yard', wall: 'concrete', wallColor: '#6e7470', wallH: 86, cut: 16, seed: 53,
    doors: [{ side: 'n', at: 300, w: 34, h: 56, kind: 'steel' }],
    deco: [{ kind: 'screens', at: 70, v: 30, w: 170, h: 48, cols: 5, rows: 2 }, { kind: 'clock', at: 260, v: 60 }, { kind: 'board', at: 270, v: 24, w: 22, h: 26 }, { kind: 'lamp', at: 20, v: 74, w: 24 }] });
  sc.vox(I.controlDesk(170, 1), 155, 392); sc.vox(I.officeChair(), 130, 410); sc.person(130, 414, 'warden', 4, 'idle', 5301); sc.person(200, 400, 'warden', 4, 'idle', 5302);
  sc.vox(I.filingCabinet(), 40, 370); sc.vox(I.filingCabinet(), 40, 400); sc.vox(I.gunLocker(), 340, 370);
  sc.vox(I.desk(70), 80, 460); sc.vox(I.officeChair(), 80, 486);
  sc.light(155, 360, 50, 160, [0.6, 0.8, 1.0], 1.8); sc.light(80, 450, 50, 100, WARM, 1.5); sc.light(30, 360, 40, 50, [1, 0.2, 0.15], 1.4);
  // the breakout: the yard gate thrown open, alarms flashing, inmates running, guards chasing
  paintRect(G, 400, 300, 368, 212, 'asphaltWorn', 54);
  laneLine(G, 560, 300, 212, false, { yellow: true }); laneLine(G, 600, 300, 212, false, { yellow: true });
  sc.vox(T.compoundWall(120, 50, true), 460, 320); sc.vox(T.compoundWall(110, 50, true), 713, 320);
  sc.vox(D.gatePillar(1, 54), 526, 324); sc.vox(D.gatePillar(1, 54), 652, 324);
  sc.vox(D.fence('chain', 100, { barbed: true }), 470, 470); sc.vox(D.fence('chain', 90, { barbed: true }), 720, 470);
  sc.building({ w: 80, d: 60, style: 'concrete', seed: 55, roof: 'flat', doors: [{ x: 10, w: 18, kind: 'door', open: true }], windows: [44] }, 680, 450);
  for (const [x, y, d] of [[580, 320, 4], [600, 350, 4], [560, 380, 3], [620, 400, 5], [590, 440, 4], [640, 360, 3]]) sc.person(x, y, 'inmate', d, 'walk', x * 3 + y);
  sc.person(670, 420, 'warden', 7, 'walk', 5401); sc.person(500, 440, 'warden', 1, 'walk', 5402); sc.person(720, 500, 'warden', 0, 'idle', 5403);
  for (const [x, y] of [[520, 304], [660, 304], [740, 420]]) sc.light(x, y, 60, 140, [1, 0.12, 0.1], 2.4);
  sc.vox(X.floodMast(110, 1), 440, 420); sc.light(440, 400, 100, 180, [1, 0.97, 0.9], 1.6);
  return sc.finish();
}

// ---- J1 prison island: walls and towers on a rock, the cell block, the yard, the gatehouse and dock ---
export function buildPrisonIsland(preset = 'golden') {
  const sc = new Scene(DW, DH, preset, 61, { y: [[0, 1, 101]], walk: 1, grow: 1 }), G = sc.G;
  const S = new Streets(DW, DH, { lotKind: 'waterDeep' });
  S.zone('rock', { blob: { cx: 384, cy: 240, rx: 360, ry: 230, seed: 4, wob: 0.08 } });
  S.zone('yard', { x: 120, y: 40, w: 528, h: 340 });
  S.zone('asphaltWorn', { x: 250, y: 160, w: 270, h: 150 });
  S.zone('dock', { x: 330, y: 400, w: 110, h: 60 }); S.zone('yard', { x: 300, y: 370, w: 170, h: 40 });
  S.build(); S.paint(G, 61);
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (S.kind(x, y) === 'waterDeep') G.put(x, y, ...seaPixel(x, y));
  shoreFoam(G, (x, y) => S.kind(x, y) === 'waterDeep', 61);
  courtLinesW(G, 300, 180, 170, 110, false);
  // the walls (high, wired) and the four towers
  for (let x = 120; x < 640; x += 88) { if (x >= 296 && x < 472) continue; sc.vox(T.compoundWall(88, 60, true), x + 44, 384, 0, 0, 384, 'pwall'); }
  for (let x = 120; x < 640; x += 88) sc.vox(T.compoundWall(88, 60, true), x + 44, 46, 0, 0, 46, 'pwall');
  for (let y = 46; y < 380; y += 84) { sc.vox(T.compoundWall(84, 60, true), 120, y + 42, PI / 2, 0, y + 42, 'pwallv'); sc.vox(T.compoundWall(84, 60, true), 648, y + 42, PI / 2, 0, y + 42, 'pwallv'); }
  for (const [x, y] of [[120, 50], [648, 50], [120, 384], [648, 384]]) sc.vox(I.watchTower(110, sc.lampsOn), x, y, 0, 0, y + 1, 'tower');
  if (sc.lampsOn) for (const [x, y] of [[120, 50], [648, 50], [120, 384], [648, 384]]) sc.light(x + (x < 384 ? 60 : -60), y + 30, 60, 180, [1, 0.97, 0.88], sc.isNight ? 2.4 : 0.6);
  // the cell block, the side blocks, the gatehouse and its gate
  const cb = sc.building({ w: 280, d: 80, floors: 3, style: 'concrete', wallColor: '#8a8680', seed: 62, roof: 'flat', parapet: 6, doors: [{ x: 124, w: 32, kind: 'door', h: 50 }], windows: [20, 60, 200, 240], porchLight: true }, 244, 150);
  for (const [x, y] of [[40, 20], [120, 30], [200, 20]]) sc.onRoof(cb, P.roofAC(), x, y);
  const wb = sc.building({ w: 90, d: 140, style: 'concrete', wallColor: '#8a8680', seed: 63, roof: 'flat', doors: [{ x: 30, w: 20, kind: 'door' }], windows: [] }, 140, 300);
  const eb = sc.building({ w: 110, d: 180, floors: 2, style: 'concrete', wallColor: '#8a8680', seed: 64, roof: 'flat', doors: [{ x: 40, w: 20, kind: 'door' }], windows: [10, 80] }, 528, 330);
  sc.onRoof(wb, P.roofAC(), 30, 40); sc.onRoof(eb, P.roofAC(), 30, 50); sc.onRoof(eb, P.roofVent(), 70, 110);
  sc.building({ w: 100, d: 50, style: 'concrete', wallColor: '#8a8680', seed: 65, roof: 'flat', doors: [{ x: 8, w: 18, kind: 'door' }], windows: [60] }, 300, 410);
  sc.vox(D.ironGate(70, 50), 436, 388); sc.vox(U.barrierArm(60, false), 470, 420);
  // the yard: the court, pull-up bars, benches, inmates, guards on patrol
  sc.vox(D.hoop(), 300, 236, 0); sc.vox(D.hoop(), 470, 236, PI);
  sc.vox(I.squatRack(false), 500, 190); sc.vox(P.bench(), 350, 170); sc.vox(P.bench(), 420, 300);
  for (const [x, y, d] of [[360, 220, 2], [380, 250, 6], [420, 230, 2], [440, 270, 4], [400, 196, 0], [500, 200, 0], [350, 172, 0]]) sc.person(x, y, 'inmate', d, 'walk', x * 5 + y);
  for (const [x, y, d] of [[230, 200, 2], [550, 180, 6], [270, 320, 0], [500, 330, 6], [380, 420, 4], [420, 430, 4], [300, 120, 2], [480, 110, 6]]) sc.person(x, y, 'warden', d, 'idle', x * 7 + y);
  for (const [x, y] of [[250, 170], [520, 170], [300, 330], [470, 330]]) lamp(sc, x, y, 'street');
  car(sc, 'suv', 190, 250, PI / 2, { paint: '#4a5a3a', parked: true });
  for (const [x, y, t] of [[200, 330, 1], [216, 340, 2]]) sc.vox(P.crate(t), x, y);
  // the dock and the patrol boat
  car(sc, 'policeboat', 384, 478, 0, { parked: true });
  for (const [x, y] of [[330, 460], [440, 460], [330, 404], [440, 404]]) sc.vox(P.piling(30), x, y, 0, 0, y, 'pile');
  sc.vox(X.lifebuoy(), 450, 410); sc.vox(X.mooringBollard(), 360, 456);
  for (const [x, y, s, z] of [[60, 120, 1, 34], [700, 140, 2, 40], [40, 380, 3, 30], [720, 400, 4, 36], [200, 470, 5, 26], [560, 470, 6, 30]]) sc.vox(D.boulder(s + 60, z, '#7a6a5a'), x, y);
  return sc.finish();
}

export const CUTAWAYS = { metro: buildMetroStation, tunnel: buildMetroTunnel, gym: buildGym, prison: buildPrisonInside, prisonisland: buildPrisonIsland };
export const CUTAWAY_TARGETS = { metro: 'T1_metro-station.png', tunnel: 'T2_tunnel.png', gym: 'G1_gym.png', prison: 'J3_prison-interiors-wide.png', prisonisland: 'J1_prison-island.png' };
export const CUTAWAY_PRESET = { metro: 'indoor', tunnel: 'indoor', gym: 'golden', prison: 'indoor', prisonisland: 'golden' };
