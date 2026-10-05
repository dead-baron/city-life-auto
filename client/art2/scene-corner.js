// The phase 1 style frame: a slice of the Round 1 hero corner (docs/art-v2/targets/R1-A..C) built
// entirely from the v2 generators - beach and surf, a promenade, a stucco cafe with an open
// shopfront, a brick walk-up with a fire escape and water tank, a purple corner shop with a neon
// palm and a mural, the crossing, a marina, a terracotta house, palms and street trees, cars, people
// and street furniture - so it can be compared side by side with the targets.
//
// buildCorner(presetName) -> { G, lights } (768 x 512 world px)
import { GBuf, hash } from './gbuf.js';
import { paintGround, laneLine, zebra, kerb, manhole, drain, wear, surf } from './ground.js';
import { makeBuilding } from './buildings.js';
import * as P from './props.js';
import { person, randomPerson } from './people.js';
import { palm, leafyTree, bush } from './trees.js';
import { MAT, LIGHT } from './palette.js';

export const CW = 768, CH = 512;
const ROAD_NS = [364, 470], ROAD_EW = [322, 428];

export function buildCorner(preset = 'golden') {
  const night = preset === 'night' ? 1 : preset === 'golden' ? 0.35 : 0;
  const lampsOn = preset === 'night' ? 1 : preset === 'golden' ? 1 : 0;
  const G = new GBuf(CW, CH);
  const seaEdge = (y) => 92 - y * 0.32 + Math.sin(y * 0.05) * 6;
  // ---- ground
  paintGround(G, (x, y) => {
    if (y < 300 && x < seaEdge(y) - 8) return x < seaEdge(y) - 40 ? 'waterDeep' : 'water';
    if (y < 300 && x < seaEdge(y) + 6) return 'sandWet';
    if (x < 150 && y < 300) return 'sand';
    if (y >= 474 && x >= 96 && x < 150) return 'dock';
    if (y >= 470 && x < 300) return 'waterDeep';
    if (x >= ROAD_NS[0] && x < ROAD_NS[1]) return 'asphalt';
    if (y >= ROAD_EW[0] && y < ROAD_EW[1]) return 'asphalt';
    if (x >= 476 && y < 316 && x > 690 && y < 160) return 'asphaltWorn';     // the rough back yard
    if (x >= 640 && y >= 470) return 'grass';
    return x < 364 ? 'paver' : 'sidewalk';
  }, 4);
  surf(G, (y) => seaEdge(y) - 6, 0, 300);
  wear(G, ROAD_NS[0], 0, ROAD_NS[1] - ROAD_NS[0], ROAD_EW[0], 0.8, 7);
  wear(G, ROAD_NS[1], ROAD_EW[0], CW - ROAD_NS[1], ROAD_EW[1] - ROAD_EW[0], 0.9, 9);
  wear(G, 150, ROAD_EW[0], ROAD_NS[0] - 150, ROAD_EW[1] - ROAD_EW[0], 0.6, 13);
  // lane markings
  const cxNS = (ROAD_NS[0] + ROAD_NS[1]) / 2, cyEW = (ROAD_EW[0] + ROAD_EW[1]) / 2;
  laneLine(G, cxNS - 1, 0, ROAD_EW[0] - 34, false, { yellow: true, dash: 14, gap: 10 });
  laneLine(G, cxNS - 1, ROAD_EW[1] + 34, CH - ROAD_EW[1] - 34, false, { yellow: true, dash: 14, gap: 10 });
  laneLine(G, 150, cyEW - 1, ROAD_NS[0] - 150 - 34, true, { yellow: true, dash: 14, gap: 10 });
  laneLine(G, ROAD_NS[1] + 34, cyEW - 1, CW - ROAD_NS[1] - 34, true, { yellow: true, dash: 14, gap: 10 });
  for (const x of [ROAD_NS[0] + 4, ROAD_NS[1] - 6]) { laneLine(G, x, 0, ROAD_EW[0] - 30, false, { wear: 0.25 }); laneLine(G, x, ROAD_EW[1] + 30, CH, false, { wear: 0.25 }); }
  // crossings on all four arms
  zebra(G, ROAD_NS[0] + 4, ROAD_EW[0] - 30, ROAD_NS[1] - ROAD_NS[0] - 8, 24, true);
  zebra(G, ROAD_NS[0] + 4, ROAD_EW[1] + 6, ROAD_NS[1] - ROAD_NS[0] - 8, 24, true);
  zebra(G, ROAD_NS[0] - 30, ROAD_EW[0] + 4, 24, ROAD_EW[1] - ROAD_EW[0] - 8, false);
  zebra(G, ROAD_NS[1] + 6, ROAD_EW[0] + 4, 24, ROAD_EW[1] - ROAD_EW[0] - 8, false);
  manhole(G, cxNS + 14, 150); manhole(G, 560, cyEW + 10);
  // kerbs (red near the corners)
  kerb(G, 150, ROAD_EW[0], ROAD_NS[0] - 150, 's', {}); kerb(G, ROAD_NS[1], ROAD_EW[0], CW - ROAD_NS[1], 's', {});
  kerb(G, 300, ROAD_EW[1], ROAD_NS[0] - 300, 'n', {}); kerb(G, ROAD_NS[1], ROAD_EW[1], CW - ROAD_NS[1], 'n', {});
  kerb(G, ROAD_NS[0], 0, ROAD_EW[0], 'e', {}); kerb(G, ROAD_NS[1], 0, ROAD_EW[0], 'w', {});
  kerb(G, ROAD_NS[0], ROAD_EW[1], CH - ROAD_EW[1], 'e', {}); kerb(G, ROAD_NS[1], ROAD_EW[1], CH - ROAD_EW[1], 'w', {});
  kerb(G, ROAD_NS[0] - 34, ROAD_EW[0], 34, 's', { red: true }); kerb(G, ROAD_NS[1], ROAD_EW[0], 34, 's', { red: true });
  drain(G, ROAD_NS[0] - 60, ROAD_EW[0] + 4); drain(G, ROAD_NS[1] + 60, ROAD_EW[0] + 4); drain(G, ROAD_NS[1] + 120, ROAD_EW[1] - 9);
  // marina edge: a stone quay along the water
  for (let x = 0; x < 300; x++) for (let k = 0; k < 4; k++) G.put(x, 470 + k, MAT.concrete[k === 0 ? 5 : 2 - Math.min(2, k)], [0, k ? 1 : 0, k ? 0 : 1], 4 - k, null, 1);

  // beach towels painted on the sand
  for (const [x0, y0, c1, c2] of [[44, 96, [214, 80, 100], [240, 220, 200]], [96, 252, [60, 120, 190], [240, 200, 80]]]) for (let y = 0; y < 14; y++) for (let x = 0; x < 26; x++) { const j = ((y0 + y) * CW + x0 + x) * 4; const c = (Math.floor(x / 4) % 2 ? c1 : c2); G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; }
  // ---- everything that stands up, back to front
  const items = [];
  const add = (spr, x, y, dz = 0, base = y) => items.push({ spr, x, y, dz, base });
  const vox = (m, x, y, hd = 0, dz = 0, base = y) => add(m.render(hd), x, y, dz, base);

  // buildings (x, y = south-west corner of the footprint on the ground)
  const cafe = makeBuilding({ w: 150, d: 92, floors: 2, style: 'stucco', seed: 3, night, roof: 'terrace', balcony: true, shop: { kind: 'cafe', awning: 'green', door: 'right', open: true }, mural: { x: 100, y: 84, w: 40, h: 46, kind: 'sunset' } });
  add(cafe, 196, 172);
  const brick = makeBuilding({ w: 150, d: 80, floors: 3, style: 'brick', seed: 8, night, roof: 'tar', fireEscape: [94, 44] });
  add(brick, 520, 108);
  const shop = makeBuilding({ w: 110, d: 60, floors: 1, style: 'purple', seed: 12, night, roof: 'gravel', shop: { kind: 'mart', awning: null, door: 'left', open: true, clerkShirt: [70, 60, 120] }, sign: { neon: [255, 70, 220], icon: 'palm' } });
  add(shop, 520, 278);
  const wall = makeBuilding({ w: 90, d: 50, floors: 1, style: 'teal', seed: 14, night, roof: 'tar', mural: { x: 8, y: 6, w: 74, h: 54, kind: 'bird' } });
  add(wall, 632, 268);
  const house = makeBuilding({ w: 128, d: 54, floors: 1, style: 'peach', seed: 21, night, roof: 'tile' });
  add(house, 650, 536);
  // rooftop kit
  vox(P.waterTank(), 640, 60, 0, 204, 108.5); vox(P.acUnit(), 560, 78, 0, 204, 108.5); vox(P.acUnit(), 590, 50, 0, 204, 108.5);
  vox(P.acUnit(), 548, 250, 0, 82, 278.5); vox(P.acUnit(), 600, 240, 0, 82, 278.5);
  vox(P.umbrella('#e8dcc0', '#2f7a5c'), 230, 118, 0, 148, 172.5); vox(P.umbrella('#e8dcc0', '#b8443e'), 290, 132, 0, 148, 172.5);
  vox(P.planter(), 216, 160, 0, 148, 172.5); vox(P.planter(), 300, 160, 0, 148, 172.5);

  // street furniture
  for (const [x, y] of [[188, 60], [188, 230], [356, 110], [356, 300], [480, 300], [480, 120], [356, 450], [480, 450], [170, 450]]) vox(P.lampPost('cast', lampsOn), x, y);
  vox(P.hydrant(), 346, 312); vox(P.hydrant(), 492, 440);
  vox(P.bin(), 200, 300); vox(P.bin(), 650, 312); vox(P.newsBox(), 486, 312); vox(P.newsBox('#c23a30'), 220, 450);
  vox(P.bench(), 160, 150, Math.PI / 2); vox(P.bench(), 270, 452);
  vox(P.dumpster(), 700, 312); vox(P.dumpster(), 730, 150);
  for (const x of [200, 214, 228]) vox(P.bollard(), x, 318);
  vox(P.planter(), 160, 200, Math.PI / 2); vox(P.planter(), 160, 90, Math.PI / 2);
  vox(P.pottedPalm(), 344, 186);
  // cafe terrace: umbrellas and tables in front of the shop
  vox(P.umbrella('#f0ece0', '#2f7a5c'), 236, 212); vox(P.umbrella('#f0ece0', '#2f7a5c'), 290, 214);
  // dressing: greenery, cafe terrace, signs, a scooter
  for (let x = 196; x < 346; x += 34) vox(P.flowerBed(30), x + 15, 186);
  for (const [x, y, l] of [[540, 128, 44], [600, 128, 50], [700, 290, 40]]) vox(P.hedge(l, 11), x, y);
  for (const [x, y] of [[214, 240], [250, 236], [306, 238], [340, 236]]) vox(P.cafeTable(), x, y);
  vox(P.chalkboard(), 330, 192); vox(P.chalkboard(), 512, 284);
  vox(P.scooter('#3a6ab0'), 500, 70, Math.PI / 2); vox(P.scooter('#c23a30'), 690, 316);
  for (const [x, y] of [[512, 210], [512, 30], [350, 40], [350, 268], [670, 290], [200, 456], [320, 456]]) vox(P.planter(), x, y, Math.PI / 2);
  for (const [x, y] of [[200, 250], [246, 252], [300, 250], [330, 254]]) add(person(randomPerson(x * 7 + y), (x >> 3) % 8, 'idle', 0), x, y);
  for (const [x, y, k] of [[430, 300, null], [560, 140, null], [610, 150, 'business'], [700, 240, 'thug'], [720, 250, null], [400, 470, null], [520, 500, null], [160, 380, null], [280, 470, 'business']]) add(person(randomPerson(x * 13 + y, k), (x + y) % 8, 'walk', (x >> 2) & 3), x, y);
  // beach and marina kit
  vox(P.lifeguardTower(), 70, 160); vox(P.surfboard('#e8a040'), 96, 168); vox(P.surfboard('#d8504a'), 104, 170); vox(P.volleyNet(64), 70, 236);
  vox(P.umbrella('#f0ece0', '#c23a30'), 40, 290); vox(P.yacht(), 214, 526, 0, 0, 526);
  for (const [x, y] of [[96, 478], [148, 478], [96, 508], [148, 508]]) vox(P.piling(18), x, y);
  // the rough back yard
  vox(P.couch(), 720, 200, Math.PI); vox(P.burnBarrel(lampsOn ? 1 : 0.4), 756, 214); vox(P.laundryLine(66), 690, 128);
  // vehicles
  const lt = night ? 1 : 0;
  vox(P.car('sedan', MAT.paintBlue, { lights: lt }), 250, 350, 0);
  vox(P.car('pickup', MAT.paintGreen, { crate: true, lights: lt }), 600, 404, Math.PI);
  vox(P.car('convertible', MAT.paintRed, { lights: lt }), 444, 230, Math.PI / 2);
  vox(P.car('taxi', MAT.paintYellowCar, { lights: lt }), 444, 40, Math.PI / 2);
  vox(P.car('sedan', MAT.paintBlack, { lights: 0 }), 742, 230, -Math.PI / 2);
  // people
  const ppl = [
    [randomPerson(11, 'beach'), 60, 210, 1, 'idle'], [randomPerson(12, 'beach'), 110, 120, 0, 'walk'], [randomPerson(13, 'beach'), 92, 260, 6, 'idle'],
    [randomPerson(21), 166, 120, 0, 'walk'], [randomPerson(22), 176, 280, 4, 'walk'], [randomPerson(23, 'business'), 330, 250, 2, 'walk'],
    [randomPerson(31, 'thug'), 560, 312, 0, 'idle'], [randomPerson(32), 590, 316, 7, 'idle'], [randomPerson(33), 616, 314, 0, 'idle'], [randomPerson(34), 646, 318, 1, 'idle'],
    [randomPerson(35), 492, 330, 0, 'idle'], [randomPerson(41), 440, 410, 2, 'walk'], [randomPerson(42, 'cop'), 520, 450, 0, 'idle'],
    [randomPerson(51), 120, 486, 0, 'idle'], [randomPerson(52), 300, 300, 2, 'walk'],
  ];
  for (const [app, x, y, dir, pose] of ppl) add(person(app, dir, pose, (x + y) & 3), x, y);
  // trees and palms
  for (const [x, y, s, h] of [[150, 40, 1, 104], [150, 300, 2, 120], [356, 200, 3, 96], [486, 200, 4, 116], [486, 40, 5, 108], [350, 500, 6, 112], [500, 500, 7, 100], [40, 330, 8, 90]]) add(palm(s, h), x, y);
  add(leafyTree(31, 96, 30), 720, 470); add(leafyTree(32, 84, 26, { flowers: '#e888b0' }), 600, 500);
  for (const [x, y, s] of [[176, 172, 1], [190, 330, 2], [300, 318, 3], [500, 268, 4], [740, 330, 5], [620, 470, 6], [16, 500, 7]]) add(bush(40 + s, 12 + (s % 3) * 3), x, y);
  // sort back to front by base, then draw
  items.sort((a, b) => a.base - b.base);
  for (const it of items) G.blit(it.spr, it.x - it.spr.ax, it.y - it.spr.ay - it.dz, it.dz);

  // ---- lights
  const lights = [];
  if (lampsOn) for (const [x, y] of [[188, 60], [188, 230], [356, 110], [356, 300], [480, 300], [480, 120], [356, 450], [480, 450], [170, 450]]) lights.push({ x, y: y + 2, z: 66, r: preset === 'night' ? 135 : 110, col: LIGHT.sodium, k: preset === 'night' ? 2.4 : 0.7 });
  const win = preset === 'night' ? 1.3 : preset === 'golden' ? 0.6 : 0.15;
  // shopfront light spilling onto the pavement
  for (const x of [220, 270, 320]) lights.push({ x, y: 176, z: 24, r: 70, col: LIGHT.warmWindow, k: win });
  lights.push({ x: 545, y: 282, z: 20, r: 80, col: LIGHT.neonMagenta, k: win * 1.2 });
  lights.push({ x: 600, y: 282, z: 24, r: 60, col: LIGHT.warmWindow, k: win });
  if (preset === 'night') {
    // headlights: a short fan of lights ahead of each moving car, tail lights behind
    const heads = [[250, 350, 0], [600, 404, Math.PI], [444, 230, Math.PI / 2], [444, 40, Math.PI / 2]];
    for (const [x, y, a] of heads) {
      for (const d of [60, 100]) lights.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, z: 10, r: 60 + d * 0.3, col: LIGHT.headlight, k: 1.6 - d * 0.006 });
      lights.push({ x: x - Math.cos(a) * 56, y: y - Math.sin(a) * 56, z: 10, r: 40, col: LIGHT.tail, k: 1.2 });
    }
  }
  if (lampsOn) lights.push({ x: 756, y: 214, z: 18, r: 90, col: LIGHT.fire, k: preset === 'night' ? 2.2 : 0.8 });
  return { G, lights };
}
