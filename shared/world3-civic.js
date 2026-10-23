// World v3, handcrafted: the Civic Center (district 5), from the owner's concepts WC419 (the forum: prompt Civic-A1) and
// WC420 (the hospital block: Civic-B1), with WC071 and WC242 (the civic forum, the church, the round park with its
// monument). Two bands east of Downtown's park:
//   - Civic Avenue to Harborview Avenue, Greenfield Avenue to Fountain Avenue: the forum on the axis of Elm Street -
//     Metro City Hall under its copper dome at the head, the long paved forum with the statue on its plinth, the
//     banners and two fountains, the Hall of Justice at its foot with its steps down to Fountain Avenue; west of the
//     forum the Hall of Records, the Public Library under its glass dome and the Civic Garden with its gazebo; east of
//     it St. Neon General (the city's hospital, where you come round: its ER bay and ambulances, the glass canopy, the
//     drop-off loop round a planted island with the bus shelter, the helipad on the roof), the healing garden and the
//     medical offices.
//   - Park East Avenue to Harborview Avenue, Crosstown Avenue to Greenfield Avenue (6th Street, Alder Street, Civic
//     Avenue and Elm Street through it): the Municipal Building and the State Office Building, St. Pixel Chapel in its
//     churchyard, Liberty Square with its monument and kiosk, the Federal Building, and rows of shops with flats over
//     them (the clerks' cafes, the lawyers' bars, the stationers) and walk-ups behind.
// Deterministic like every plan: tiles and hash draws only (shared/world3-hand.js).
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 5;   // the Civic Center's district id (shared/mapcore.js DISTRICTS)
// the street centre lines (tiles)
export const CX = { parkE: 3184, alder: 3253, civic: 3320, axis: 3400, harborview: 3480 };
export const CY = { cross: 2300, sixth: 2350, green: 2400, fountain: 2576 };
// the bands (frame tiles): north of Greenfield Avenue, and the forum's east of Civic Avenue
const N = [3184, 2300, 3480, 2400], E = [3320, 2400, 3480, 2576];

function streets() {
  const out = [];
  const ew = (name, kind, y, x0, x1) => out.push({ name, kind, pts: [[x0, y], [x1, y]] });
  const ns = (name, kind, x, y0, y1) => out.push({ name, kind, pts: [[x, y0], [x, y1]] });
  ew('6th Street', 'st', CY.sixth, CX.parkE, CX.harborview);
  ns('Alder Street', 'st', CX.alder, CY.cross, CY.green);
  ns('Civic Avenue', 'ave', CX.civic, CY.cross, CY.green);
  ns('Elm Street', 'st', CX.axis, CY.cross, CY.green);
  return out;
}

export const CIVIC = {
  key: 'civic', d: D, rect: [3184, 2300, 3480, 2576], rects: [N, E],
  streets,
  // the special businesses this plan places itself (shared/map.js SPECIALS of the Civic Center)
  specials: ['St. Neon General', 'Hall of Justice', 'St. Pixel Chapel'],
  build,
};

// the inside of the bands, inside their pavements (tiles; [x0, x1) and rows [y0, y1] inclusive)
const EX = [3329, 3473], EY = [2408, 2567];
const NR = [2308, 2343], SR = [2357, 2392];
const NC = { A: [3193, 3247], C: [3260, 3313], E: [3328, 3394], G: [3407, 3473] };

// the shops along the bands' streets: the clerks' and the lawyers' town
const SHOPS = [
  { name: 'Archive Antiques & Pawn', store: 'pawn', poi: 'pawn', awning: ['#4a3a2a', '#d8c8a8'] },
  { name: 'Gavel & Grind', store: 'cafe', poi: 'coffee', awning: ['#3a2a20', '#efe6d0'] },
  { name: 'The Docket Diner', store: 'diner', poi: 'coffee', awning: ['#7a1e2a', '#f0ece4'] },
  { name: "Clerk's Books", store: 'books', awning: ['#2a3a5a', '#efe6d0'] },
  { name: 'Capitol Florist', store: 'florist', awning: ['#2f6a4e', '#f0ece4'] },
  { name: 'Bench & Bar', store: 'bar', awning: ['#2a2420', '#c8a050'] },
  { name: 'Ledger Stationers', store: 'mart', awning: ['#1e3a5e', '#f0ece4'] },
  { name: 'Rotunda Cafe', store: 'cafe', poi: 'coffee', awning: ['#5a6a3a', '#efe6d0'] },
  { name: 'Magistrate Tailors', store: 'clothes', awning: ['#3a2a3a', '#d8c8a8'] },
  { name: 'Notary & Copy', store: 'mart', awning: ['#2a4a6a', '#f0ece4'] },
  { name: 'Civic Deli', store: 'diner', poi: 'coffee', awning: ['#8a6a2a', '#f0ece4'] },
  { name: 'Verdict Wine Bar', store: 'bar', awning: ['#5a1e2a', '#efe6d0'] },
  { name: 'Statute Salon', store: 'salon', awning: ['#2a2420', '#2a2420'] },
  { name: 'Quill & Ink', store: 'books', awning: ['#3a2a20', '#d8c8a8'] },
  { name: 'Plaza Shoe Repair', store: 'mart', awning: ['#4a3a2a', '#efe6d0'] },
  { name: 'Chambers Coffee', store: 'cafe', poi: 'coffee', awning: ['#2a3a2a', '#efe6d0'] },
  { name: 'Recess Records', store: 'records', awning: ['#2a2a3a', '#c84a5a'] },
  { name: 'Affidavit Bakery', store: 'cafe', poi: 'coffee', awning: ['#8a5a3a', '#f0ece4'] },
  { name: 'Capitol Hardware', store: 'mart', poi: 'hardware', awning: ['#3a4a5a', '#efe6d0'] },   // (2026-10-23: the shops where you need them - world3-shops.js)
  { name: 'The Bailiff Pub', store: 'bar', awning: ['#2a3a2a', '#c8a050'] },
  { name: 'Union Barbers', store: 'salon', awning: ['#7a1e2a', '#f0ece4'] },
  { name: 'Precedent Pens', store: 'mart', awning: ['#2a2a3a', '#d8c8a8'] },
  { name: 'Mayor Street Bagels', store: 'diner', poi: 'coffee', awning: ['#a86a2a', '#f0ece4'] },
  { name: 'Jury Room Tavern', store: 'bar', awning: ['#3a2a20', '#efe6d0'] },
];
const TONES = ['#a85a42', '#8e4a3a', '#b8705a', '#7a4a3a'];
const STONES = ['#ddd2bc', '#d4c8b0', '#c8bca4', '#e2dac6', '#cfc4ae'];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const { place, tower, towerLot } = towerKit(K, out);
  let si = 0;
  // A row of shops with flats over them, fronts on the street south of it: three to six floors of stone or brick
  const shopRow = (x0, x1, y0, y1, depth = 14) => K.row(x0, x1, y0, y1, (x, room) => {
    if (room < 6) return room >= 1 ? { gap: room, kind: 'garden' } : null;
    const w = room <= 15 ? room : 9 + Math.floor(rnd(x, y1, 41) * 5);
    const S = SHOPS[si++ % SHOPS.length], brick = rnd(x, y1, 42) < 0.45, floors = 3 + Math.floor(rnd(x, y1, 43) * 4);
    const art = tower(x, y1, { name: S.name, style: brick ? 'brick' : 'stone', ...(brick ? { tone: pick(TONES, rnd(x, y1, 44)) } : { wall: pick(STONES, rnd(x, y1, 45)) }), floors, store: S.store, awning: S.awning, win: pick(['pair', 'even', 'tall'], rnd(x, y1, 46)), cornice: pick(['bracket', 'dentil'], rnd(x, y1, 47)), parapet: 6, roofMat: 'gravel' });
    const poi = S.poi === 'coffee' ? { kind: 'coffee', label: S.name, food: S.store === 'diner' } : S.poi ? { kind: S.poi, label: S.name } : { kind: 'delivery', label: S.name, walk: true, store: S.store === 'cafe' || S.store === 'diner' ? 'mart' : S.store };
    return { w, depth, arch: 'mixed', name: S.name, poi, ...(floors >= 3 && w >= 6 && rnd(x, y1, 48) < 0.6 ? { home: { kind: 'apartment' } } : {}), whole: true, art };
  });
  // A row of walk-ups along a band's north edge, their doors on the street north of it (drawn from behind: their back
  // walls, fire escapes and yards face the camera); a flat behind each door
  const backRow = (x0, x1, y0, y1, depth = 13) => K.row(x0, x1, y0, y1, (x, room) => {
    if (room < 6) return room >= 1 ? { gap: room, kind: 'garden' } : null;
    const w = room <= 15 ? room : 9 + Math.floor(rnd(x, y0, 51) * 5), brick = rnd(x, y0, 52) < 0.6, floors = 3 + Math.floor(rnd(x, y0, 53) * 3);
    const art = tower(x, y0, { name: '', style: brick ? 'brick' : 'stone', ...(brick ? { tone: pick(TONES, rnd(x, y0, 54)) } : { wall: pick(STONES, rnd(x, y0, 55)) }), floors, shop: false, win: 'pair', cornice: 'bracket', parapet: 6, roofMat: 'gravel', spec: floors >= 4 && rnd(x, y0, 56) < 0.5 ? { fireEscape: [Math.max(8, Math.round(w * TILE * 0.55) - 25), 50] } : null });
    return { w, depth, arch: 'walkup', face: 'N', home: { kind: 'apartment' }, whole: true, art };
  }, { north: true });

  forum(K, m, { place, tower, out });
  westSide(K, m, { place, tower, out });
  hospital(K, m, { place, tower, towerLot, out });
  northBand(K, m, { place, tower, towerLot, shopRow, backRow, out });
  // what the plan left open: lawn with plane trees, maples, magnolias (else the kit's seal paves it)
  K.landscape({ bare: 0.35, tree: (x, y, r) => r < 0.8 ? [rnd(x, y, 830) < 0.5 ? 'tree_a' : 'tree_b', pick(['streetPl', 'maple', 'magnolia', 'streetPl', 'oak', 'cypress'], rnd(x, y, 831)), 1.05 + rnd(x, y, 832) * 0.2] : [pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 833)), null, 1] });
  void api; void prop;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The forum (WC419): Metro City Hall at its head under the copper dome, its terrace and steps; the long paved forum on
// Elm Street's line - the statue on its plinth, the banners in two rows, a fountain at each end, lamps and benches,
// the cypresses and plane trees in the lawns either side; the Hall of Justice at the foot, its steps down to Fountain
// Avenue, and the walks either side of it
function forum(K, m, ctx) {
  const { prop, rnd } = K;
  const { place, out } = ctx;
  const AX = CX.axis, fx0 = AX - 24, fx1 = AX + 24;
  // ---- Metro City Hall
  const cw = 40, cx0 = AX - cw / 2, cy0 = EY[0] + 2, ch = 26, W = cw * TILE, Dp = ch * TILE;
  place({ x: cx0, y: cy0, w: cw, h: ch, arch: 'cityhall', key: 'bank', name: 'Metro City Hall', poi: { kind: 'delivery', label: 'Metro City Hall' }, whole: true,
    art: { spec: { floors: 3, style: 'stone', wallColor: '#e6dfcc', cornice: 'dentil', win: 'tall', parapet: 12, grime: 0.03, roofMat: 'gravel', lip: 10, rimW: 5, date: '1904',
      portico: { x: Math.round(W / 2 - 220), w: 440, cols: 10, text: 'METRO CITY HALL' } }, noShop: true,
      kit: [['dome', Math.round(W / 2), Math.round(Dp / 2 + 70)], ['ac', 70, 60], ['ac', W - 100, 60], ['vent', 60, Dp - 40], ['vent', W - 70, Dp - 40]] } });
  K.fill(EX[0], EY[0], EX[1] - EX[0], 2, T.PLAZA);   // (the pavement's edge behind it)
  // its terrace and steps onto the forum: banners either side of the steps, lamps
  const ty0 = cy0 + ch, ty1 = ty0 + 6;
  K.fill(fx0, ty0, fx1 - fx0, ty1 - ty0, T.PLAZA); K.take(fx0, ty0, fx1 - fx0, ty1 - ty0);
  for (const dx of [-9, -6, 6, 9]) prop('flagpole', AX + dx, ty0 + 2.2, 0, { h: 120, c: dx < 0 ? '#2a3a7a' : '#7a1e2a' });
  for (const dx of [-15, 15]) prop('plamp', AX + dx, ty0 + 3, 6);
  // ---- the forum
  const fy0 = ty1, cwj = 36, jy0 = EY[1] - 30, fy1 = jy0 - 3;
  K.fill(fx0, fy0, fx1 - fx0, fy1 - fy0, T.PLAZA); K.take(fx0, fy0, fx1 - fx0, fy1 - fy0);
  const my = Math.round((fy0 + fy1) / 2);
  // the statue on its plinth in a round bed, four lamps round it
  prop('statue', AX, my, 0);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; prop('flowers_big', AX + Math.cos(a) * 4.2, my + 0.6 + Math.sin(a) * 3.2, 0); }
  for (const [dx, dy] of [[-6, -5], [6, -5], [-6, 6], [6, 6]]) prop('plamp', AX + dx, my + dy, 6);
  // four long lawns down the forum, either side of its promenade, a row of plane trees down each and box at their ends
  for (const [bx0, bx1] of [[fx0 + 4, AX - 10], [AX + 10, fx1 - 4]]) for (const [by0, by1] of [[fy0 + 15, my - 9], [my + 9, fy1 - 13]]) {
    if (by1 - by0 < 8) continue;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) m.set(x, y, T.GRASS);
    for (let y = by0 + 3; y < by1 - 2; y += 6) prop('tree_a', (bx0 + bx1) / 2, y, 12, { sp: 'streetPl', k: 1.15 });
    for (const y of [by0 + 0.8, by1 - 0.8]) prop('hedgerun', bx0 + 0.6, y, 0, { tx: Math.round((bx1 - bx0 - 1.2) * TILE), ty: 0, h: 12 });
  }
  // a fountain at each end
  for (const fy of [fy0 + 9, fy1 - 8]) { prop('fountain', AX, fy, 36); for (const dx of [-5, 5]) prop('flowers_big', AX + dx, fy, 0); }
  // the banners in two rows down the forum, blue and red
  for (let y = fy0 + 16, k = 0; y < fy1 - 14; y += 7, k++) {
    if (Math.abs(y - my) < 7) continue;
    for (const dx of [-8, 8]) prop('flagpole', AX + dx, y, 0, { h: 110, c: k % 2 ? '#7a1e2a' : '#2a3a7a' });
  }
  // lamps and benches along its edges
  for (let y = fy0 + 4; y < fy1 - 2; y += 8) for (const x of [fx0 + 1.5, fx1 - 1.5]) prop('lamp', x, y, 0);
  for (let y = fy0 + 8; y < fy1 - 4; y += 8) for (const x of [fx0 + 3, fx1 - 3]) prop('bench_m', x, y, 0);
  m.squares ||= []; m.squares.push({ x: fx0 + 6, y: my - 8, w: fx1 - fx0 - 12, h: 16, name: 'Civic Forum' });
  // the lawns either side: a double row of trees, cypresses and plane trees, a clipped hedge along the forum
  for (const [lx0, lx1] of [[fx0 - 8, fx0], [fx1, fx1 + 8]]) {
    K.fill(lx0, ty0, lx1 - lx0, EY[1] - 2 - ty0, T.GRASS); K.take(lx0, ty0, lx1 - lx0, EY[1] - 2 - ty0);
    for (let y = ty0 + 3, k = 0; y < EY[1] - 5; y += 5, k++) {
      prop('tree_a', lx0 + 2, y, 12, { sp: k % 2 ? 'cypress' : 'streetPl', k: 1.1 });
      prop('tree_b', lx1 - 2, y + 2.5, 12, { sp: k % 2 ? 'streetPl' : 'cypress', k: 1.1 });
    }
    prop('hedgerun', lx0 === fx1 ? lx0 + 0.4 : lx1 - 0.4, ty1, 0, { tx: 0, ty: Math.round((fy1 - ty1) * TILE), h: 14 });
  }
  (out.places ||= []).push({ name: 'Civic Forum', x0: fx0, y0: fy0, x1: fx1, y1: fy1 });
  // ---- the Hall of Justice at the forum's foot: its back to the forum, its steps down to Fountain Avenue
  const jx0 = AX - cwj / 2, jh = 22, JW = cwj * TILE;
  const jb = place({ x: jx0, y: jy0, w: cwj, h: jh, arch: 'court', key: 'bank', name: 'Hall of Justice', poi: { kind: 'courthouse', label: 'Hall of Justice' }, whole: true,
    art: { spec: { floors: 3, style: 'stone', wallColor: '#ddd2bc', cornice: 'dentil', win: 'tall', parapet: 12, grime: 0.04, roofMat: 'gravel', lip: 10, rimW: 5, date: '1912',
      portico: { x: Math.round(JW / 2 - 130), w: 260, cols: 6, text: 'HALL OF JUSTICE' } }, noShop: true, kit: [['ac', 60, 50], ['ac', JW - 90, 50], ['hvac', Math.round(JW / 2), 70]] } });
  const sy0 = jy0 + jh;
  K.fill(fx0, fy1, fx1 - fx0, jy0 - fy1, T.PLAZA); K.take(fx0, fy1, fx1 - fx0, jy0 - fy1);
  K.fill(fx0, jy0, jx0 - fx0, EY[1] + 1 - jy0, T.PLAZA); K.fill(jx0 + cwj, jy0, fx1 - jx0 - cwj, EY[1] + 1 - jy0, T.PLAZA);
  K.fill(fx0, sy0, fx1 - fx0, EY[1] + 1 - sy0, T.PLAZA); K.take(fx0, jy0, fx1 - fx0, EY[1] + 1 - jy0);
  for (const dx of [-12, 12]) prop('flagpole', AX + dx, sy0 + 2, 0, { h: 120, c: 'stars' });
  for (const dx of [-16, 16]) { prop('plamp', AX + dx, sy0 + 2.5, 6); prop('planter_g', AX + dx * 0.6, sy0 + 3.5, 10); }
  for (const x of [fx0 + 2.5, fx1 - 2.5]) for (let y = jy0 + 3; y < EY[1] - 1; y += 8) prop('lamp', x, y, 0);
  if (jb) (out.places ||= []).push({ name: 'Hall of Justice', x0: jx0, y0: jy0, x1: jx0 + cwj, y1: EY[1] + 1 });
  void rnd;
}

// ---------------------------------------------------------------------------------------------------------------
// West of the forum: the Hall of Records on Greenfield Avenue, the Public Library under its glass dome (its portico
// on the garden), the Civic Garden - the gazebo in the middle of its lawns, flower beds, a fountain, paths, benches
function westSide(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { place, tower, out } = ctx;
  const x0 = EX[0] + 1, x1 = CX.axis - 32, w = x1 - x0;   // [3330, 3368)
  // the Hall of Records
  const ry0 = EY[0] + 2, rh = 22;
  place({ x: x0 + 1, y: ry0, w: w - 2, h: rh, arch: 'civicblock', name: 'Hall of Records', poi: { kind: 'delivery', label: 'Hall of Records' }, whole: true,
    art: tower(x0 + 1, ry0, { name: 'Hall of Records', sign: 'HALL OF RECORDS', style: 'stone', wall: '#d4c8b0', floors: 4, win: 'tall', cornice: 'dentil', store: 'lobby', signC: ['#1e2a3a', [236, 214, 150]], roofMat: 'gravel' }) });
  K.fill(x0, ry0 + rh, w, 6, T.PLAZA);
  for (const dx of [4, w - 4]) prop('planter_g', x0 + dx, ry0 + rh + 2, 10);
  // the Public Library
  const ly0 = ry0 + rh + 6, lh = 32, LW = (w - 2) * TILE, LD = lh * TILE;
  const lib = place({ x: x0 + 1, y: ly0, w: w - 2, h: lh, arch: 'bank', key: 'bank', name: 'Metro City Public Library', poi: { kind: 'delivery', label: 'Metro City Public Library' }, whole: true,
    art: { spec: { floors: 2, style: 'stone', wallColor: '#d8ccb4', cornice: 'dentil', win: 'arch', parapet: 10, grime: 0.04, roofMat: 'membrane', lip: 10, rimW: 5, date: '1909',
      portico: { x: Math.round(LW / 2 - 120), w: 240, cols: 6, text: 'PUBLIC LIBRARY' } }, noShop: true,
      kit: [['gdome', Math.round(LW / 2), Math.round(LD / 2 + 50)], ['sky', 60, 70], ['sky', LW - 80, 70], ['sky', 60, LD - 70], ['sky', LW - 80, LD - 70]] } });
  const gy0 = ly0 + lh;
  K.fill(x0, gy0, w, 5, T.PLAZA);
  for (const dx of [3, w - 3]) prop('plamp', x0 + dx, gy0 + 2, 6);
  for (const dx of [8, w - 8]) prop('bench_m', x0 + dx, gy0 + 3.4, 0);
  if (lib) (out.places ||= []).push({ name: 'Metro City Public Library', x0, y0: ly0, x1, y1: gy0 + 5 });
  // the Civic Garden: lawns, a cross of paths with a ring round the gazebo, flower beds, a fountain, benches and lamps
  const g0 = gy0 + 5, g1 = EY[1] + 1, gx = x0 + w / 2, gy = Math.round((g0 + g1) / 2) + 4;
  K.fill(EX[0], g0, x1 - EX[0], g1 - g0, T.GRASS); K.take(EX[0], g0, x1 - EX[0], g1 - g0);
  const pave = (x, y) => { if (m.tiles[m.idx(x, y)] === T.GRASS) K.paint(x, y, 1, 1, T.PLAZA); };
  for (let y = g0; y < g1; y++) for (let x = EX[0]; x < x1; x++) {
    const d = Math.hypot((x + 0.5 - gx) / 9, (y + 0.5 - gy) / 7.5);
    if ((d > 0.82 && d < 1.12) || (Math.abs(x + 0.5 - gx) < 1.5 && d > 1) || (Math.abs(y + 0.5 - gy) < 1.5 && d > 1) || (y >= g1 - 3)) pave(x, y);
  }
  prop('gazebo', gx, gy + 1, 30);
  for (const [dx, dy] of [[-12, -10], [12, -10], [-12, 12], [12, 12]]) { prop('flowers_big', gx + dx, gy + dy, 0); prop('flowers_big', gx + dx * 0.7, gy + dy * 1.1, 0); }
  prop('fountain', gx, g0 + 6, 36);
  for (const [dx, dy] of [[-4, -3], [4, -3], [-4, 4.5], [4, 4.5]]) prop('bench_m', gx + dx * 2.2, gy + dy * 2, 0);
  for (const [dx, dy] of [[-17, -14], [17, -14], [-17, 14], [17, 14], [-8, 22], [8, 22]]) prop(pick(['tree_a', 'tree_b'], rnd(dx, dy, 61)), gx + dx, gy + dy, 12, { sp: pick(['cherry', 'magnolia', 'maple', 'cherry'], rnd(dx, dy, 62)), k: 1.15 });
  for (const [dx, dy] of [[-2.5, -10], [2.5, -10], [-2.5, 12], [2.5, 12], [-12, 1.8], [12, 1.8]]) prop('lamp', gx + dx, gy + dy, 0);
  // (trees along its edges, clear of the paths)
  for (let y = g0 + 4, k = 0; y < g1 - 5; y += 6, k++) for (const tx of [EX[0] + 2, x1 - 2]) {
    if (Math.abs(y - gy) < 3 || Math.hypot((tx - gx) / 13, (y - gy) / 11) < 1.1) continue;
    prop(k % 2 ? 'tree_a' : 'tree_b', tx, y, 12, { sp: pick(['streetPl', 'magnolia', 'cherry', 'maple'], rnd(tx, y, 63)), k: 1.1 });
  }
  prop('textsign', gx, g1 - 3.6, 0, { text: 'CIVIC GARDEN', bg: '#2f5a4a', fg: [240, 232, 200], z: 30, sx: 1 });
  (out.places ||= []).push({ name: 'Civic Garden', x0: EX[0], y0: g0, x1, y1: g1 });
}

// ---------------------------------------------------------------------------------------------------------------
// East of the forum (WC420): St. Neon General - its doors under the glass canopy, the ER bay with its ambulances, the
// drop-off loop off Harborview Avenue round a planted island (the bus shelter, a big oak, flower beds), the helipad
// on the roof; the healing garden (a sculpture fountain, benches, flower beds, hedges); the medical offices on
// Fountain Avenue
function hospital(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { place, towerLot, out } = ctx;
  const x0 = CX.axis + 32, x1 = EX[1], w = x1 - x0;   // [3432, 3473)
  const hy0 = EY[0] + 2, hh = 48, HW = (w - 2) * TILE, HD = hh * TILE, door = x0 + 11;
  const b = place({ x: x0 + 1, y: hy0, w: w - 2, h: hh, arch: 'hospital', key: 'hospital', name: 'St. Neon General', poi: { kind: 'hospital', label: 'St. Neon General' }, door, whole: true,
    art: { spec: { floors: 7, style: 'concrete', wallColor: '#e4e2da', win: 'tall', parapet: 10, grime: 0.03, roofMat: 'membrane', lip: 8, rimW: 5 },
      shop: { kind: 'lobby', door: 'left', open: true, people: 4, awning: null, sign: { text: 'ST. NEON GENERAL', bg: '#f0eee8', fg: [40, 70, 120], lit: true } },
      kit: [['heli', Math.round(HW * 0.62), Math.round(HD * 0.5)], ['hvac', 70, 70], ['ac', 70, HD - 70], ['ac', HW - 70, 70], ['vent', 50, Math.round(HD / 2)], ['vent', HW - 50, HD - 60], ['tank', 120, HD - 80]] } });
  if (b) {
    // (the ER desk's mat beside the front desk: shared/map.js buildInteriors moves it inside)
    const px = (door + 0.5) * TILE, py = (hy0 + hh + 0.7) * TILE;
    m.pois.push({ id: m.pois.length, kind: 'reception', label: 'ER Reception', x: px, y: py, r: 36, b: b.id });
  }
  // the forecourt under the glass canopy, the ER bay beside it: three ambulances backed in, the sign
  const fy0 = hy0 + hh, fy1 = fy0 + 6;
  K.fill(x0, fy0, 24, fy1 - fy0, T.PLAZA); K.take(x0, fy0, 24, fy1 - fy0);
  prop('canopy', door + 2, fy0 + 3.2, 0, { w: 15 * TILE, d: 4 * TILE, h: 46 });
  for (const dx of [-2, 8]) prop('planter_g', door + dx, fy1 - 1, 10);
  prop('bench_m', door + 12, fy1 - 1.2, 0);
  const bx0 = x0 + 24;
  K.fill(bx0, fy0, x1 - bx0, fy1 - fy0, T.LOT); K.take(bx0, fy0, x1 - bx0, fy1 - fy0);
  for (let k = 0; k < 3; k++) m.parking.push({ x: (bx0 + 3 + k * 5) * TILE, y: (fy0 + 3) * TILE, a: Math.PI / 2, model: 'ambulance' });
  prop('textsign', bx0 + 8, fy0 + 0.4, 0, { text: 'AMBULANCES ONLY', bg: '#a8282c', fg: [250, 240, 230], z: 26, sx: 1 });
  // the drop-off loop off Harborview Avenue round its island: the bus shelter, a big oak, beds and lamps
  const ly0 = fy1, ly1 = ly0 + 24, lx = x0 + 3;
  K.fill(x0, ly0, w, ly1 - ly0, T.GRASS); K.take(x0, ly0, w, ly1 - ly0);
  for (let y = ly0; y < ly1; y++) for (let x = x0; x < x1; x++) {
    const ring = (y < ly0 + 4 || y >= ly1 - 4 || (x >= lx && x < lx + 4)) && x >= lx;
    if (ring) m.set(x, y, T.LOT);
    else if (x < lx) m.set(x, y, T.PLAZA);
  }
  const ix = (lx + 4 + x1) / 2, iy = (ly0 + ly1) / 2;
  prop('tree_b', ix - 6, iy, 12, { sp: 'oak', k: 1.5 });
  prop('busstop', ix + 6, ly0 + 5.2, 0, { face: 'N' });
  for (const dx of [-12, -2, 10]) prop('flowers_big', ix + dx, iy + 4, 0);
  for (const dx of [-14, 2, 13]) prop(pick(['shrub_a', 'bush_c'], rnd(dx, iy, 71)), ix + dx, iy - 3, 0);
  for (const dx of [-15, 15]) prop('lamp', ix + dx, iy, 0);
  prop('textsign', ix, ly1 - 4.6, 0, { text: 'ST. NEON GENERAL', bg: '#1e3a5e', fg: [240, 244, 250], z: 28, sx: 1 });
  m.parking.push({ x: (lx + 8) * TILE, y: (ly0 + 2) * TILE, a: 0, model: 'taxi' });
  (out.places ||= []).push({ name: 'St. Neon General', x0, y0: hy0, x1, y1: ly1 });
  // the healing garden: lawns, paths in a cross, the sculpture fountain, benches round it, beds, hedges, cherries
  const g0 = ly1, g1 = EY[1] - 32, gx = (x0 + x1) / 2, gy = (g0 + g1) / 2;
  K.fill(x0, g0, w, g1 - g0, T.GRASS); K.take(x0, g0, w, g1 - g0);
  K.paint(Math.floor(gx) - 1, g0, 3, g1 - g0, T.PLAZA); K.paint(x0, Math.floor(gy) - 1, w, 3, T.PLAZA);
  for (let y = Math.floor(gy) - 5; y <= gy + 5; y++) for (let x = Math.floor(gx) - 6; x <= gx + 6; x++) if (((x + 0.5 - gx) / 6) ** 2 + ((y + 0.5 - gy) / 5) ** 2 <= 1) K.paint(x, y, 1, 1, T.PLAZA);
  prop('fountain', gx, gy, 36); prop('statue', gx, gy - 0.2, 0);
  for (const [dx, dy] of [[-4.5, -3], [4.5, -3], [-4.5, 3.6], [4.5, 3.6]]) prop('bench_m', gx + dx, gy + dy, 0);
  for (const [dx, dy] of [[-12, -7], [12, -7], [-12, 7], [12, 7]]) { prop('tree_a', gx + dx, gy + dy, 12, { sp: pick(['cherry', 'magnolia'], rnd(dx, dy, 72)), k: 1.1 }); prop('flowers_big', gx + dx * 0.55, gy + dy * 0.75, 0); }
  prop('hedgerun', x0 + 0.5, g0 + 0.5, 0, { tx: Math.round((w - 1) * TILE), ty: 0, h: 14 });
  for (const dx of [-8, 8]) prop('lamp', gx + dx, gy - 1.6, 0);
  (out.places ||= []).push({ name: 'Healing Garden', x0, y0: g0, x1, y1: g1 });
  // the medical offices on Fountain Avenue, their forecourt
  towerLot({ x: x0 + 1, y: g1 + 1, w: w - 2, h: EY[1] - g1 - 6, name: 'St. Neon Medical Center', floors: 9, tint: '#36606e', store: 'lobby' });
  K.fill(x0, EY[1] - 4, w, 5, T.PLAZA);
}

// ---------------------------------------------------------------------------------------------------------------
// North of Greenfield Avenue: the Municipal Building and the State Office Building on Crosstown Avenue, St. Pixel
// Chapel in its churchyard, Liberty Square with its monument, the Federal Building; and the shop rows with flats over
// them on the streets, walk-ups behind
function northBand(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { place, towerLot, shopRow, backRow, out } = ctx;
  const { A, C, E, G } = NC;
  // block A (Park East Avenue to Alder Street): the Municipal Building on Crosstown Avenue, shops on 6th Street;
  // walk-ups on 6th Street's south side, shops facing Greenfield Avenue
  towerLot({ x: A[0], y: NR[0] + 2, w: 30, h: NR[1] - NR[0] - 1, name: 'Municipal Building', style: 'stone', floors: 14, wall: '#d8ccb4', cornice: 'dentil', win: 'tall', parapet: 16, arch: 'office' });
  shopRow(A[0] + 31, A[1], NR[0], NR[1]);
  backRow(A[0], A[1], SR[0], SR[1]);
  shopRow(A[0], A[1], SR[0], SR[1]);
  // block C: the State Office Building over its plaza; St. Pixel Chapel in its churchyard on Greenfield Avenue
  towerLot({ x: C[0] + 6, y: NR[0], w: C[1] - C[0] - 12, h: NR[1] - NR[0] - 5, name: 'State Office Building', floors: 16, tint: '#2e5670' });
  for (let x = C[0]; x < C[1]; x++) { const c = K.column(x, NR[0], NR[1]); if (c) K.fill(x, c[1], 1, c[0] - c[1] + 1, T.PLAZA); }
  for (const dx of [3, C[1] - C[0] - 3]) prop('tree_a', C[0] + dx, NR[1] - 2, 10, { sp: 'streetPl', k: 1.1, grate: true });
  prop('fountain', (C[0] + C[1]) / 2, NR[1] - 2.2, 36);
  const chw = 16, chx = Math.floor((C[0] + C[1] - chw) / 2), chy = SR[0] + 6;
  const ch = place({ x: chx, y: chy, w: chw, h: SR[1] - chy - 4, arch: 'church', key: 'church', name: 'St. Pixel Chapel', poi: { kind: 'delivery', label: 'St. Pixel Chapel' }, whole: true,
    art: { spec: { wallColor: '#b8b2a4', roofColor: '#4e5560' } } });
  K.fill(C[0], SR[0], C[1] - C[0], SR[1] - SR[0] + 1, T.GRASS);
  for (let y = SR[1] - 3; y <= SR[1]; y++) for (let x = chx + 5; x < chx + chw - 5; x++) K.paint(x, y, 1, 1, T.PLAZA);
  // the churchyard: yews and oaks in rows either side, a cypress at each corner of the church
  for (const [ax, bx] of [[C[0] + 2, chx - 2], [chx + chw + 2, C[1] - 2]]) for (let y = SR[0] + 3, k = 0; y < SR[1] - 4; y += 6, k++) for (let tx = ax; tx <= bx; tx += 6) {
    prop(pick(['tree_a', 'tree_b'], rnd(tx, y, 81)), tx + (k % 2) * 2, y, 12, { sp: pick(['oak', 'cypress', 'maple', 'cypress'], rnd(tx, y, 82)), k: 1.1 });
  }
  for (const tx of [C[0] + 2.5, C[1] - 2.5]) prop('bench_m', tx, SR[1] - 2, 0);
  prop('fenceline', C[0] + 0.3, SR[1] + 0.6, 0, { kind: 'iron', tx: Math.round((chx + 4.5 - C[0]) * TILE), ty: 0 });
  prop('fenceline', chx + chw - 4.5, SR[1] + 0.6, 0, { kind: 'iron', tx: Math.round((C[1] - 0.3 - chx - chw + 4.5) * TILE), ty: 0 });
  if (ch) (out.places ||= []).push({ name: 'St. Pixel Chapel', x0: C[0], y0: SR[0], x1: C[1], y1: SR[1] + 1 });
  // block E (Civic Avenue to Elm Street): shops on 6th Street, walk-ups on Crosstown Avenue; Liberty Square on
  // Greenfield Avenue, across from City Hall
  backRow(E[0], E[1], NR[0], NR[1]);
  shopRow(E[0], E[1], NR[0], NR[1]);
  {
    const sx0 = E[0], sx1 = E[1], qx = (sx0 + sx1) / 2, qy = (SR[0] + SR[1]) / 2 + 1;
    // the kiosk on its corner: coffee and papers
    place({ x: sx1 - 9, y: SR[0] + 2, w: 7, h: 5, arch: 'snackbar', name: 'Liberty Kiosk', poi: { kind: 'coffee', label: 'Liberty Kiosk' }, whole: true,
      art: { spec: { floors: 1, style: 'stucco', wallColor: '#2f5a4a', parapet: 4 }, shop: { kind: 'cafe', door: 'left', open: true, people: 1, awning: ['#2f5a4a', '#f0ece4'], sign: { text: 'KIOSK', bg: '#2f5a4a', fg: [240, 232, 200], lit: true } } } });
    K.fill(sx0, SR[0], sx1 - sx0, SR[1] - SR[0] + 1, T.PLAZA); K.take(sx0, SR[0], sx1 - sx0, SR[1] - SR[0] + 1);
    for (let y = SR[0]; y <= SR[1]; y++) for (let x = sx0; x < sx1; x++) {
      const d = Math.hypot((x + 0.5 - qx) / 14, (y + 0.5 - qy) / 11);
      if ((d < 0.78 && d > 0.3) || (d >= 1.25 && (x < sx0 + 7 || x >= sx1 - 7))) m.set(x, y, T.GRASS);
    }
    prop('statue', qx, qy - 0.2, 0);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; prop('flowers_big', qx + Math.cos(a) * 6, qy + Math.sin(a) * 4.5, 0); }
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.39; prop('bench_m', qx + Math.cos(a) * 12.6, qy + Math.sin(a) * 9.6, 0); }
    for (const [dx, dy] of [[-27, -12], [27, -12], [-27, 10], [27, 10], [-21, 0], [21, 0]]) prop('tree_a', qx + dx, qy + dy, 12, { sp: pick(['streetPl', 'magnolia', 'cherry'], rnd(dx, dy, 83)), k: 1.15 });
    for (const [dx, dy] of [[-14, -11], [14, -11], [-14, 12], [14, 12]]) prop('lamp', qx + dx, qy + dy, 0);
    prop('textsign', qx, SR[1] - 0.8, 0, { text: 'LIBERTY SQUARE', bg: '#1e2a3a', fg: [240, 236, 220], z: 28, sx: 1 });
    m.squares ||= []; m.squares.push({ x: Math.round(qx) - 8, y: Math.round(qy) - 5, w: 16, h: 10, name: 'Liberty Square' });
    (out.places ||= []).push({ name: 'Liberty Square', x0: sx0, y0: SR[0], x1: sx1, y1: SR[1] + 1 });
  }
  // block G (Elm Street to Harborview Avenue): shops and walk-ups; the Federal Building on Greenfield Avenue
  backRow(G[0], G[1], NR[0], NR[1]);
  shopRow(G[0], G[1], NR[0], NR[1]);
  backRow(G[0], G[1], SR[0], SR[1]);
  towerLot({ x: G[0], y: SR[0] + 15, w: 32, h: SR[1] - SR[0] - 14, name: 'Federal Building', style: 'stone', floors: 10, wall: '#c8bca4', cornice: 'step', win: 'tall', arch: 'office' });
  shopRow(G[0] + 33, G[1], SR[0], SR[1]);
  void place;
}
