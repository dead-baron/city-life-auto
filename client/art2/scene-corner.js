// The phase 1 style frame: the Round 1 hero corner (docs/art-v2/targets/R1-A..C) rebuilt entirely from
// the v2 generators - a four-way crossing with rounded kerbs and zebra crossings, a diner with a red
// neon band and coffee-cup sign, a corner mart with a striped awning and its clerk at the till, a brick
// walk-up with fire escapes, flat rooftops with their kit, street trees in grates, traffic signals on
// mast arms, cast-iron lamps, a hot-dog cart, the taxi, the turning sedan and the pickup with a crate,
// people and a dog - so it can be compared side by side with the targets.
//
// buildCorner(presetName) -> { G, lights } (768 x 512 world px: the targets at half scale)
import { GBuf, hash } from './gbuf.js';
import { paintGround, laneLine, zebra, kerbs, manhole, drain, wear, weeds, leafLitter, treeGrate, puddle, skid } from './ground.js';
import { makeBuilding } from './buildings.js';
import * as P from './props.js';
import { person, randomPerson } from './people.js';
import { palm, leafyTree, bush } from './trees.js';
import { MAT, LIGHT } from './palette.js';

export const CW = 768, CH = 512;
// roads: the north arm, the east-west road, the (wider) south arm
const N_ARM = [184, 306], EW = [272, 384], S_ARM = [170, 326];
const R_CORNER = 18;

function isRoad(x, y) {
  if (y >= EW[0] && y < EW[1]) return true;
  if (y < EW[0] && x >= N_ARM[0] && x < N_ARM[1]) return true;
  if (y >= EW[1] && x >= S_ARM[0] && x < S_ARM[1]) return true;
  return false;
}
// pavement = not road, with the block corners rounded off
function isWalk(x, y) {
  if (x < 0 || y < 0 || x >= CW || y >= CH) return true;
  if (isRoad(x, y)) return false;
  for (const [cx, cy, sx, sy] of [[N_ARM[0], EW[0], -1, -1], [N_ARM[1], EW[0], 1, -1], [S_ARM[0], EW[1], -1, 1], [S_ARM[1], EW[1], 1, 1]]) {
    const ox = cx + sx * R_CORNER, oy = cy + sy * R_CORNER;           // the corner's circle centre
    const inX = sx < 0 ? x > ox && x <= cx : x < ox && x >= cx, inY = sy < 0 ? y > oy && y <= cy : y < oy && y >= cy;
    if (inX && inY && Math.hypot(x - ox, y - oy) > R_CORNER) return false;
  }
  return true;
}

export function buildCorner(preset = 'golden') {
  const night = preset === 'night' ? 1 : preset === 'golden' ? 0.4 : 0;
  const lampsOn = preset === 'noon' ? 0 : 1;
  const G = new GBuf(CW, CH);
  // ---- ground
  paintGround(G, (x, y) => (isWalk(x, y) ? (x > 612 && y > 252 && y < 276 ? 'grass' : 'sidewalk') : 'asphalt'), 4);
  wear(G, N_ARM[0], 0, N_ARM[1] - N_ARM[0], EW[0], 0.7, 7);
  wear(G, 0, EW[0], CW, EW[1] - EW[0], 1.1, 9);
  wear(G, S_ARM[0], EW[1], S_ARM[1] - S_ARM[0], CH - EW[1], 0.7, 13);
  // markings
  laneLine(G, 226, 0, EW[0] - 40, false, { yellow: true }); laneLine(G, 231, 0, EW[0] - 40, false, { yellow: true });
  laneLine(G, 246, EW[1] + 44, CH, false, { yellow: true, dash: 16, gap: 12 });
  laneLine(G, 412, 332, CW - 412, true, { yellow: true, dash: 18, gap: 12 });
  laneLine(G, 0, 330, 104, true, { yellow: true, dash: 18, gap: 12 });
  laneLine(G, N_ARM[0] + 3, 0, EW[0] - 40, false, { wear: 0.2 }); laneLine(G, 170, EW[1] + 40, CH, false, { wear: 0.2 });
  laneLine(G, N_ARM[0], EW[0] - 38, N_ARM[1] - N_ARM[0] - 60, true, { width: 3 });   // stop line
  laneLine(G, 405, EW[0] + 6, 70, true, { wear: 0.25 }); laneLine(G, 440, EW[1] - 8, 160, true, { wear: 0.25 });
  zebra(G, N_ARM[0] + 6, EW[0] - 30, N_ARM[1] - N_ARM[0] - 12, 24, true);
  zebra(G, S_ARM[0] + 6, EW[1] + 8, S_ARM[1] - S_ARM[0] - 12, 26, true);
  zebra(G, 110, EW[0] + 6, 26, EW[1] - EW[0] - 12, false);
  zebra(G, 368, EW[0] + 6, 26, EW[1] - EW[0] - 12, false);
  manhole(G, 270, 26); manhole(G, 268, 330); manhole(G, 252, 470, 6);
  for (const [x, y] of [[70, EW[0] - 6], [150, EW[0] - 6], [450, EW[1] + 2], [640, EW[0] - 6], [212, EW[1] + 4], [340, 170]]) drain(G, x, y, 14, 5);
  puddle(G, 150, 392, 12, 5); puddle(G, 178, 398, 7, 4); puddle(G, 300, 360, 9, 4);
  skid(G, 240, 312, 34, 1.9, 3.4);
  kerbs(G, isWalk, (x, y) => (Math.abs(x - N_ARM[0]) < 40 && Math.abs(y - EW[0]) < 40) || (Math.abs(x - S_ARM[0]) < 30 && Math.abs(y - EW[1]) < 30) || (Math.abs(x - S_ARM[1]) < 30 && Math.abs(y - EW[1]) < 30));
  // grass strip with a low railing (east side)
  for (const [x, y] of [[180, 60], [730, 226], [16, 330], [120, 440]]) treeGrate(G, x, y + 4, 11);
  weeds(G, (x, y) => isWalk(x, y) !== isWalk(x, y + 4) || isWalk(x, y) !== isWalk(x + 4, y) || (isWalk(x, y) && (x % 22 === 0 || y % 22 === 0)), 0.035);
  leafLitter(G, [[180, 64], [730, 230], [16, 334], [120, 444]], 70);

  // ---- everything that stands up, back to front
  const items = [];
  const add = (spr, x, y, dz = 0, base = y) => items.push({ spr, x, y, dz, base });
  const vox = (m, x, y, hd = 0, dz = 0, base = y) => add(m.render(hd), x, y, dz, base);
  // buildings
  const diner = makeBuilding({ w: 138, d: 100, floors: 1, style: 'diner', seed: 3, night, roof: 'flat', shop: { kind: 'diner', awning: null, door: 'right', open: true, people: 4 }, trim: [255, 70, 90], neon: { icon: 'cup', col: [70, 210, 255], x: 74, y: -4 } });
  add(diner, 0, 178);
  const mart = makeBuilding({ w: 170, d: 96, floors: 1, style: 'concrete', seed: 8, night, roof: 'flat', parapet: 26, shop: { kind: 'mart', awning: ['#2f8a72', '#f0ece4'], band: ['#d24a4a', '#f0ece4'], door: 'left', open: true, clerkShirt: [44, 140, 120] } });
  add(mart, 342, 207);
  const walkup = makeBuilding({ w: 196, d: 52, floors: 3, style: 'brick', seed: 12, night, roof: 'flat', fireEscape: [92, 66] });
  add(walkup, 520, 207);
  const walkup2 = makeBuilding({ w: 70, d: 52, floors: 3, style: 'brick', seed: 19, night, roof: 'flat' });
  add(walkup2, 716, 207);
  const se1 = makeBuilding({ w: 156, d: 150, floors: 1, style: 'concrete', seed: 21, night, roof: 'flat' }); add(se1, 400, 600);
  const se2 = makeBuilding({ w: 110, d: 110, floors: 1, style: 'stucco', seed: 22, night, roof: 'flat' }); add(se2, 566, 580);
  const sw1 = makeBuilding({ w: 74, d: 110, floors: 1, style: 'concrete', seed: 23, night, roof: 'flat' }); add(sw1, 0, 600);
  // rooftop kit (sorted with the building they stand on)
  const roof = (m, x, sy, b, H) => vox(m, x, sy + H, 0, H, b.base + 0.5);   // sy: where it stands on the roof, on screen
  const dB = { base: 178 }, mB = { base: 207 }, wB = { base: 207 }, s1 = { base: 600 }, s2 = { base: 580 }, w1 = { base: 600 };
  roof(P.roofAC(), 30, 40, dB, 70); roof(P.roofAC(), 74, 62, dB, 70); roof(P.roofAC(false), 110, 36, dB, 70); roof(P.roofVent(), 20, 70, dB, 70); roof(P.roofVent(), 120, 70, dB, 70);
  roof(P.roofPlanter(30), 380, 52, mB, 96); roof(P.roofPlanter(26), 450, 40, mB, 96); roof(P.roofAC(), 470, 78, mB, 96); roof(P.roofVent(), 400, 90, mB, 96);
  roof(P.waterTank(), 680, 14, wB, 184); roof(P.roofAC(), 590, 8, wB, 184); roof(P.roofVent(), 556, 16, wB, 184); roof(P.roofPlanter(24), 630, 18, wB, 184);
  roof(P.roofAC(), 440, 440, s1, 70); roof(P.roofAC(false), 500, 410, s1, 70); roof(P.dish(), 520, 470, s1, 70); roof(P.skylight(), 430, 490, s1, 70); roof(P.roofVent(), 535, 430, s1, 70); roof(P.roofPlanter(30), 420, 404, s1, 70);
  roof(P.roofAC(), 600, 440, s2, 70); roof(P.dish(), 650, 470, s2, 70); roof(P.roofVent(), 590, 490, s2, 70);
  roof(P.roofAC(false), 20, 450, w1, 70); roof(P.roofVent(), 50, 490, w1, 70);
  // greenery on the roofs and ivy, the way the targets have it
  for (const [x, sy, b, H, l] of [[20, 20, dB, 70, 22], [400, 20, mB, 96, 30], [460, 82, mB, 96, 26], [710, 10, wB, 184, 26], [610, 392, s2, 70, 30], [455, 470, s1, 70, 26], [12, 430, w1, 70, 22], [690, 520, s2, 70, 26]]) roof(P.roofPlanter(l), x, sy, b, H);
  for (const [x, sy, b, H] of [[150, 30, dB, 70], [500, 30, mB, 96], [660, 420, s2, 70], [410, 520, s1, 70]]) roof(P.pottedPalm(), x, sy, b, H);
  // street furniture
  vox(P.trafficSignal(60, 'red', lampsOn), 150, 212, 0); vox(P.trafficSignal(52, 'red', lampsOn), 100, 330, 0);
  vox(P.pedSignal(lampsOn), 330, 262); vox(P.pedSignal(lampsOn), 160, 396);
  for (const [x, y] of [[138, 160], [322, 178], [368, 430], [322, 470]]) vox(P.streetLamp(lampsOn), x, y);
  vox(P.wireBin(), 120, 240); vox(P.wireBin(), 356, 252); vox(P.wireBin(), 640, 202);
  vox(P.hydrant(), 166, 170); vox(P.hydrant(), 332, 248); vox(P.hydrant(), 422, 262);
  vox(P.newsBox('#2f5aa8'), 436, 206); vox(P.newsBox('#2f5aa8'), 22, 206);
  vox(P.bench(), 470, 206); vox(P.signPost(), 618, 236); vox(P.bollard(), 108, 256); vox(P.bollard(), 122, 256);
  vox(P.pottedPalm(), 348, 172); vox(P.planter(), 34, 204); vox(P.planter(), 96, 204); vox(P.chalkboard(), 66, 206);
  vox(P.hotdogCart(lampsOn), 490, 296, Math.PI);
  vox(P.hedge(150, 12), 690, 272);
  vox(P.crate(1), 600, 206); vox(P.bin(false), 586, 208);
  // vehicles
  const lt = preset === 'night' ? 1 : preset === 'golden' ? 1 : 0;
  vox(P.car('taxi', MAT.paintYellowCar, { lights: lt }), 262, 96, Math.PI / 2);
  vox(P.car('sedan', MAT.paintTeal, { lights: lt }), 226, 300, -Math.PI / 4);
  vox(P.car('sedan', MAT.paintBlack, { lights: lt }), 276, 466, -Math.PI / 2);
  vox(P.car('pickup', MAT.paintRed, { crate: true, lights: 0 }), 612, 306, Math.PI);
  vox(P.scooter('#d8d0c0'), 724, 318);
  vox(P.dog(), 548, 238, 0);
  // people
  const ppl = [
    [randomPerson(42, 'cop'), 348, 224, 0, 'idle'], [Object.assign(randomPerson(44), { carry: 'board', hat: { kind: 'cap', color: 'red' } }), 386, 242, 7, 'walk'],
    [randomPerson(45), 424, 206, 3, 'idle'], [randomPerson(46), 466, 236, 0, 'walk'], [randomPerson(47), 532, 236, 2, 'walk'],
    [randomPerson(31, 'thug'), 576, 192, 0, 'idle'], [Object.assign(randomPerson(48), { top: { kind: 'tank', color: 'pink' }, bottom: { kind: 'shorts', color: 'navy' }, fem: true, hair: { style: 'pony', color: 1 } }), 652, 236, 2, 'walk'],
    [randomPerson(49), 522, 290, 6, 'idle'], [randomPerson(50), 458, 312, 2, 'idle'],
    [randomPerson(51), 60, 250, 2, 'walk'], [randomPerson(52, 'business'), 130, 296, 0, 'walk'],
  ];
  for (const [app, x, y, dir, pose] of ppl) add(person(app, dir, pose, (x + y) & 3), x, y);
  // trees
  add(leafyTree(31, 132, 50), 180, 62); add(leafyTree(32, 130, 50), 730, 228); add(leafyTree(33, 120, 44), 16, 332); add(leafyTree(34, 116, 46), 120, 442);
  add(palm(5, 104), 724, 440);
  for (const [x, y, s] of [[340, 214, 1], [650, 262, 2], [760, 262, 3], [338, 494, 4], [700, 500, 5], [6, 470, 6]]) add(bush(60 + s, 12 + (s % 3) * 3), x, y);
  items.sort((a, b) => a.base - b.base);
  for (const it of items) G.blit(it.spr, it.x - it.spr.ax, it.y - it.spr.ay - it.dz, it.dz);

  // ---- lights
  const lights = [];
  if (lampsOn) for (const [x, y] of [[138, 160], [322, 178], [368, 430], [322, 470]]) lights.push({ x, y: y + 2, z: 84, r: preset === 'night' ? 200 : 110, col: LIGHT.sodium, k: preset === 'night' ? 3.4 : 0.8 });
  const win = preset === 'night' ? 1.8 : preset === 'golden' ? 0.6 : 0.12;
  for (const x of [380, 430, 480]) lights.push({ x, y: 210, z: 26, r: 76, col: LIGHT.warmWindow, k: win });
  for (const x of [20, 60, 100]) lights.push({ x, y: 182, z: 24, r: 70, col: LIGHT.warmWindow, k: win * 0.9 });
  if (preset !== 'noon') { lights.push({ x: 70, y: 180, z: 60, r: 120, col: LIGHT.neonMagenta, k: night * 1.4 + 0.2 }); lights.push({ x: 100, y: 120, z: 74, r: 90, col: LIGHT.neonCyan, k: night * 1.2 + 0.2 }); }
  if (lampsOn) { lights.push({ x: 150, y: 214, z: 60, r: 50, col: [1, 0.2, 0.15], k: 0.8 }); lights.push({ x: 150, y: 334, z: 64, r: 50, col: [1, 0.2, 0.15], k: 0.8 }); }
  if (lt) {
    for (const [x, y, a] of [[262, 96, Math.PI / 2], [226, 300, -Math.PI / 4], [276, 466, -Math.PI / 2]]) {
      for (const dd of [60, 100]) lights.push({ x: x + Math.cos(a) * dd, y: y + Math.sin(a) * dd, z: 10, r: 56 + dd * 0.3, col: LIGHT.headlight, k: (preset === 'night' ? 1.6 : 0.7) - dd * 0.005 });
      lights.push({ x: x - Math.cos(a) * 56, y: y - Math.sin(a) * 56, z: 12, r: 40, col: LIGHT.tail, k: preset === 'night' ? 1.3 : 0.5 });
    }
  }
  return { G, lights };
}
