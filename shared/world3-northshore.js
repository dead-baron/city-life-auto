// World v3, handcrafted: Northshore (district 31), the station town on the inlet, from the owner's concept WC385
// (Northshore-A1: the rail station with its clock gable and green roofs, a grid of two-storey brick shopfronts with
// awnings, a clinic, a brick civic building with its flag, a strip mall with its car park; waterfront cafes and a
// marina, a sand cove with a rock groyne, wooded shores with villas and docks) and WC367 (Shared-4, the seaside
// terrace crescent: pastel clapboard terraces round a loop road and its fenced garden, windswept pines), with the
// research's Northshore (Station Avenue's shops - Joe's Burgers, Riverside Books, Pixel Tech, Thread & Co., Brew
// Haven; the medical centre and the sheriff; the strip mall on its car park):
//   - south of the main line: Depot Square across North Coast Road from Northshore Station (the bus shelters, the taxis,
//     the benches under the trees, the town's banners); Front Street, the high street of brick shopfronts; Bank Street
//     with Northshore Town Hall, the Medical Center and the Sheriff; Station Avenue and Elm Street across them;
//     Northshore Plaza on its car park on Cedar Farms Road; cottages; east of Oak Street, where Front and Bank Streets run
//     on to the inlet, the villas on its wooded shore with their jetties;
//   - on the lobe north of the Shore Road: Bayview Drive round Bayview Green (the fenced oval garden, its pines and
//     benches) and the pastel terraces facing it; the waterfront on the inlet - Northshore Marina and its office, the
//     cafes on the boardwalk; the west beach's cove and its rock groyne.
// Northshore Station itself and its house are the main line's (shared/world3-rail.js); the lobe's two piers are the
// north coast builder's (shared/world3-north.js). Every building faces south (the camera). Names and signs are
// invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';
import { makeSuburb } from './world3-suburb.js';

const D = 31, VALLEY = 49;   // Northshore, Willow Valley (shared/mapcore.js DISTRICTS)
// (the town's two pieces: south of the line between the grid's edge streets - Poplar and Oak Streets, North Coast and
// Cedar Farms Roads - and the lobe north of the Shore Road)
const RECTS = [[3030, 751, 3232, 882], [3140, 560, 3300, 707], [3232, 751, 3300, 882]];
// (the grid's lines: Poplar Street x 3030, Oak Street 3230, Station Avenue 3184 on the avenue lattice, North Coast Road
// y 751, Cedar Farms Road 880, the Shore Road 705 - plan tiles, centred: shared/world3-hand.js C)
export const SX = { poplar: 3030, elm: 3133, station: 3184, oak: 3230, inlet: 3270 };
export const SY = { coast: 751, front: 784, bank: 831, cedar: 880 };
export const LX = { west: 3180, east: 3240 }, LY = { top: 606, shore: 705 };
const BAYVIEW = [[LX.west, LY.shore], [LX.west, 626], [3198, LY.top], [3222, LY.top], [LX.east, 626], [LX.east, LY.shore]];
const BRICK = ['#a85a42', '#8e4a3a', '#b8705a', '#7a4a3a', '#9a5040', '#b06048'];
const PASTEL = ['#a8c8d8', '#f0c8b8', '#e8dcae', '#b8d8c0', '#ece9e0', '#d8c8e0', '#f0e0a8'];
const SLATES = ['#3e4450', '#4a4e58', '#55606a'];
// a circle's sixteen points (cos, sin at 22.5-degree steps: written out - no trigonometry, shared/dmath.js)
const RING = [[1, 0], [0.9239, 0.3827], [0.7071, 0.7071], [0.3827, 0.9239], [0, 1], [-0.3827, 0.9239], [-0.7071, 0.7071], [-0.9239, 0.3827], [-1, 0], [-0.9239, -0.3827], [-0.7071, -0.7071], [-0.3827, -0.9239], [0, -1], [0.3827, -0.9239], [0.7071, -0.7071], [0.9239, -0.3827]];

export const NORTHSHORE = {
  key: 'northshore', d: D, rects: RECTS, rect: [3030, 560, 3300, 882],
  streets: () => [
    { name: 'Station Avenue', kind: 'ave', pts: [[SX.station, SY.coast], [SX.station, SY.cedar]] },
    { name: 'Elm Street', kind: 'st', pts: [[SX.elm, SY.coast], [SX.elm, SY.cedar]] },
    { name: 'Front Street', kind: 'st', pts: [[SX.poplar, SY.front], [SX.inlet, SY.front]], culdesac: true },
    { name: 'Bank Street', kind: 'st', pts: [[SX.poplar, SY.bank], [SX.inlet, SY.bank]], culdesac: true },
    { name: 'Bayview Drive', kind: 'minor', pts: BAYVIEW },
  ],
  specials: [],
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, pools: 0 };
  const S = makeSuburb(m, K, out);
  const { place, frontRow, backRow } = S;
  const W = m.w;
  const tile = (x, y) => m.tiles[y * W + x];
  const wet = (x, y) => { const t = tile(x, y); return t === T.WATER || t === T.DEEP; };
  const brick = (x, o) => ({
    spec: { floors: o.floors || 2, style: 'brick', brickTone: o.tone || pick(BRICK, rnd(x, 7, 61)), win: o.win || pick(['pair', 'even', 'arch'], rnd(x, 7, 62)), cornice: pick(['dentil', 'step', null], rnd(x, 7, 63)), parapet: 8, grime: 0.08, roofMat: 'tar', lip: 8, rimW: 4, blades: [], plaques: [] },
    shop: { kind: o.store, door: o.door || 'left', open: true, people: o.people ?? 2, sign: { text: o.sign, bg: o.signC[0], fg: o.signC[1], lit: true }, awning: o.awning || null },
  });
  const cottage = (x, y) => ({ spec: { floors: 2, style: 'siding', wallColor: pick(PASTEL, rnd(x, y, 4)), win: pick(['pair', 'even'], rnd(x, y, 5)), pitch: 'gable', roof: 'shingle', roofColor: pick(SLATES, rnd(x, y, 6)), slope: 0.6, parapet: 3, grime: 0.05, blades: [], plaques: [] }, noShop: true });
  const row = { art: cottage, key: (x) => (rnd(x, 7, 33) < 0.5 ? 'house1' : 'house2'), trees: ['maple', 'oak', 'birch', 'whitePine'], price: 34000, w: 9 };
  // a row of shops facing the street below (K.row), their pots, a bench, the tables out where they have them
  const shopRow = (x0, x1, y0, y1, LIST, depth = 12) => {
    let k = 0;
    const made = K.row(x0, x1, y0, y1, (x, room) => {
      const L = LIST[k];
      if (!L) return null;
      if (room < L.w) return { gap: room, kind: 'passage' };
      k++;
      return { w: L.w, depth: L.depth || depth, arch: L.arch || 'mixed', key: L.key || 'conv', name: L.name, poi: L.poi, whole: true, ...(L.trade ? { trade: L.trade } : {}), art: L.art || brick(x, L) };
    });
    for (const b of made) if (b && !b.gap && b.tw !== undefined) {
      out.shops++;
      const L = LIST.find((q) => q.name === b.name), fy = b.ty + b.th;
      if (tile(b.tx, fy) === T.ROAD) continue;
      prop('potted', b.tx + 0.8, fy + 0.6, 6);
      if (L && L.tables) for (let j = 0; j < 2; j++) { prop('cafetable', b.tx + 3.5 + j * 4, fy + 1.8, 6); prop(L.umb || 'umbrella_g', b.tx + 3.5 + j * 4, fy + 1.6, 0); }
    }
    return made;
  };

  // (the inlet shore east of Oak Street is Northshore's now: it was painted the farm valley's - Willow Valley's meadow,
  // as Coral Cay's and Gull Harbor's outskirts were - and lay empty; the beach's sand stays the beaches')
  { const [x0, y0, x1, y1] = RECTS[2]; for (let y = y0; y < y1; y++) for (let x = x0 + 2; x < x1; x++) { const i = y * W + x; if (m.land[i] && m.dist[i] === VALLEY) m.dist[i] = D; } }
  // (the beach's strip between the Shore Road and the main line along the lobe's foot: kept open - with the town's
  // blocks sealed the block filler would line it with plain boxes)
  for (let y = LY.shore + 2; y < SY.coast - 1; y++) for (let x = 3080; x < 3292; x++) { const i = y * W + x; if (m.land[i] && m.tiles[i] === T.GRASS && !m.reserve[i]) m.reserve[i] |= 16; }
  depotSquare();
  frontStreet();
  bankStreet();
  plaza();
  houses();
  inletVillas();
  bayview();
  waterfront();
  cove();
  K.landscape({ grid: 6, bare: 0.45, tree: (x, y, r) => (r < 0.85 ? ['tree_a', pick(['maple', 'oak', 'whitePine', 'birch', 'streetPl'], rnd(x, y, 90)), 1.1 + rnd(x, y, 91) * 0.25] : [pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 92)), null, 1]) });
  void api;
  return out;

  // ===========================================================================================================
  // Depot Square across North Coast Road from the station: paved, plane trees in grates, benches round a fountain, the
  // bus shelters and the taxi rank along the road, the town's two banners; its cafe on the east side
  function depotSquare() {
    const x0 = SX.poplar + 5, x1 = 3076, y0 = SY.coast + 4, y1 = SY.front - 1;
    let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y)) { m.set(x, y, T.PLAZA); K.take(x, y, 1, 1); n++; }
    if (n < 200) return;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + 1;
    // the basin in the middle and its fountain; lawns either side under the plane trees, beds and planters round them
    { const pw = 8, ph = 5, px0 = Math.round(cx - pw / 2), py0 = Math.round(cy - ph / 2);
      for (let y = py0; y < py0 + ph; y++) for (let x = px0; x < px0 + pw; x++) m.set(x, y, T.WATER);
      (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
      prop('fountain', px0 + pw / 2, py0 + ph / 2, 0, { s: 0.7 }); }
    for (const [lx0, lx1] of [[x0 + 3, x0 + 12], [x1 - 12, x1 - 3]]) for (let y = y0 + 6; y < y1 - 5; y++) for (let x = lx0; x < lx1; x++) m.set(x, y, T.GRASS);
    for (const lx of [x0 + 7.5, x1 - 7.5]) {
      for (let k = 0; k < 3; k++) prop('tree_b', lx, y0 + 8 + k * 6, 12, { sp: 'street', k: 1.1 });
      for (const dy of [5.5, y1 - y0 - 5.5]) prop('flowers_big', lx, y0 + dy, 0);
      prop('bench_m', lx + (lx < cx ? 6 : -6), cy, 0);
    }
    for (const [dx, dy] of [[-6, -5], [6, -5], [-6, 5.5], [6, 5.5]]) prop('bench_m', cx + dx, cy + dy, 0);
    for (const [dx, dy] of [[-9, -3], [9, -3], [-9, 3], [9, 3]]) prop('planter_fl', cx + dx, cy + dy, 6);
    for (const dx of [-12, 12]) prop('lamp', cx + dx, cy, 5, { style: 'iron' });
    for (let k = 0; k < 3; k++) { prop('cafetable', x1 - 3, y0 + 8 + k * 5, 6); prop('umbrella_g', x1 - 3, y0 + 7.8 + k * 5, 0); }
    for (const dx of [-4, 4]) prop('flagpole', cx + dx, y1 - 1.5, 0, { h: 110, c: dx < 0 ? '#2a5a8a' : '#e8dcae' });
    for (const bx of [x0 + 4, x0 + 26]) prop('busstop', bx, y0 + 0.6, 0, { face: 'N' });
    for (let k = 0; k < 3; k++) m.parking.push({ x: Math.round((x0 + 10 + k * 4) * TILE), y: Math.round((y0 + 2.2) * TILE), a: 0, taxi: true });
    prop('textsign', cx, y1 - 0.2, 0, { text: 'DEPOT SQUARE', bg: '#2a5a3a', fg: [240, 236, 220], z: 26, sx: 1 });
    (m.squares ||= []).push({ x: Math.round(cx) - 8, y: Math.round(cy) - 5, w: 16, h: 10, name: 'Depot Square' });
    (m.landmarks ||= []).push({ name: 'Depot Square', type: 'square', x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0 + 1) * TILE });
    place('Depot Square', x0, y0, x1, y1 + 1);
  }

  // ===========================================================================================================
  // Front Street, the high street: the brick shopfronts with their awnings on its north side from Depot Square to Oak
  // Street (Brew Haven's tables out on the pavement)
  function frontStreet() {
    shopRow(3077, SX.elm, SY.coast + 1, SY.front - 1, [
      { name: 'Brew Haven', store: 'cafe', w: 12, poi: { kind: 'coffee', label: 'Brew Haven', food: true }, sign: 'BREW HAVEN', signC: ['#3a2a1e', [240, 220, 170]], awning: ['#3a6a4a', '#f0ece4'], key: 'rest2', tables: true },
      { name: "Joe's Burgers", store: 'diner', w: 13, poi: { kind: 'delivery', label: "Joe's Burgers", food: true }, sign: "JOE'S BURGERS", signC: ['#b8342e', [255, 240, 200]], awning: ['#b8342e', '#f0ece4'], key: 'diner' },
      { name: 'Riverside Books', store: 'books', w: 12, poi: { kind: 'delivery', label: 'Riverside Books' }, trade: 'books', sign: 'RIVERSIDE BOOKS', signC: ['#2a3a5a', [240, 232, 210]], awning: ['#2a3a5a', '#e8e4dc'] },
      { name: 'Sea Pink Florist', store: 'florist', w: 11, poi: { kind: 'delivery', label: 'Sea Pink Florist' }, sign: 'SEA PINK FLORIST', signC: ['#6a2a4a', [255, 236, 244]], awning: ['#d87a9a', '#f8eef0'] },
    ]);
    shopRow(SX.elm + 1, SX.station, SY.coast + 1, SY.front - 1, [
      { name: 'Pixel Tech', store: 'mart', w: 12, poi: { kind: 'delivery', label: 'Pixel Tech' }, trade: 'electronics', sign: 'PIXEL TECH', signC: ['#1e2a3e', [120, 220, 255]], awning: null },
      { name: 'Thread & Co.', store: 'clothes', w: 13, poi: { kind: 'clothing', label: 'Thread & Co.' }, sign: 'THREAD & CO.', signC: ['#5a2a4a', [250, 236, 240]], awning: ['#5a2a4a', '#f0ece4'] },
      { name: 'Harbor Barber', store: 'barber', w: 9, poi: { kind: 'barber', label: 'Harbor Barber' }, sign: 'BARBER', signC: ['#2a2a3a', [240, 240, 240]], awning: ['#c8343a', '#f0ece4'], floors: 2 },
    ]);
    shopRow(SX.station + 1, SX.oak, SY.coast + 1, SY.front - 1, [
      { name: 'Northshore Savings', store: 'mart', w: 20, arch: 'bank', key: 'bank', poi: { kind: 'bank', label: 'Northshore Savings' }, art: { spec: { floors: 2, style: 'stone', wallColor: '#d8ccb4', cornice: 'dentil', win: 'tall', parapet: 10, grime: 0.04, roofMat: 'gravel', lip: 8, rimW: 4 } } },
      { name: 'Gull & Gallon Deli', store: 'mart', w: 12, poi: { kind: 'convenience', label: 'Gull & Gallon Deli' }, sign: 'DELI', signC: ['#2a4a3a', [240, 232, 200]], awning: ['#2a4a3a', '#f0ece4'] },
    ]);
    place('Front Street', SX.poplar, SY.coast, SX.oak, SY.front + 4);
  }

  // ===========================================================================================================
  // Bank Street's civic row facing it from the north: Northshore Town Hall (brick under its cornice, the clock in its
  // pediment, the steps and the two banners, its lawn), the Medical Center (the reception by its doors), the Sheriff
  function bankStreet() {
    // the Town Hall
    {
      const w = 36, h = 18, x = Math.round((SX.poplar + SX.elm - w) / 2), y = SY.bank - 5 - h - 6;
      const b = K.building({ x, y, w, h, arch: 'cityhall', key: 'bank', name: 'Northshore Town Hall', poi: { kind: 'delivery', label: 'Northshore Town Hall' }, whole: true,
        art: { spec: { floors: 2, style: 'brick', brickTone: '#8e4a3a', cornice: 'dentil', win: 'tall', parapet: 12, grime: 0.05, roofMat: 'gravel', lip: 10, rimW: 5, date: '1902',
          portico: { x: Math.round(w * TILE / 2 - 120), w: 240, cols: 6, text: 'TOWN HALL' } }, noShop: true } });
      if (b) {
        out.shops++;
        const fy = b.ty + b.th;
        for (let yy = fy; yy < SY.bank - 4; yy++) for (let xx = x + 12; xx < x + w - 12; xx++) if (K.free(xx, yy)) { m.set(xx, yy, T.PLAZA); K.take(xx, yy, 1, 1); }
        for (const dx of [10, w - 10]) prop('flagpole', x + dx, fy + 2, 0, { h: 120, c: dx < w / 2 ? '#2a5a8a' : '#e8dcae' });
        for (const dx of [4, w - 4]) prop('tree_a', x + dx, fy + 3, 12, { sp: 'oak', k: 1.2 });
        for (const dx of [14, w - 14]) prop('lamp', x + dx, fy + 4, 5, { style: 'iron' });
        for (let yy = y - 2; yy < SY.bank - 4; yy++) for (let xx = SX.poplar + 5; xx < SX.elm - 5; xx++) if (K.free(xx, yy)) K.take(xx, yy, 1, 1);
        prop('bench_m', x - 4, fy + 3, 0); prop('bench_m', x + w + 4, fy + 3, 0);
      }
    }
    // the Medical Center and the Sheriff, facing the street
    const civic = (x0, x1, L) => {
      const made = K.row(x0, x1, SY.front + 1, SY.bank - 1, (x, room, i) => (i === 0 ? (room < L.w + 2 ? null : { gap: Math.floor((room - L.w) / 2), kind: 'garden' }) : i === 1 ? { w: L.w, depth: L.h, ...L.lot } : null));
      return made.find((b) => b && !b.gap && b.tw !== undefined);
    };
    const med = civic(SX.elm + 1, SX.station, { w: 34, h: 18, lot: { arch: 'hospital', key: 'hospital', name: 'Northshore Medical Center', poi: { kind: 'hospital', label: 'Northshore Medical Center' }, whole: true,
      art: { spec: { floors: 3, style: 'stucco', wallColor: '#ece9e0', win: 'tall', parapet: 10, grime: 0.02, roofMat: 'gravel', lip: 8, rimW: 4 },
        shop: { kind: 'lobby', door: 'left', open: true, people: 2, awning: ['#2a6a5a', '#2a6a5a'], sign: { text: 'NORTHSHORE MEDICAL CENTER', bg: '#f0ece4', fg: [40, 100, 80], lit: true } } } } });
    if (med) {
      out.shops++;
      m.pois.push({ id: m.pois.length, kind: 'reception', label: 'ER Reception', x: (med.door.tx + 0.5) * TILE, y: (med.ty + med.th + 0.7) * TILE, r: 36, b: med.id });
      for (const dx of [3, med.tw - 3]) prop('planter_g', med.tx + dx, med.ty + med.th + 1.5, 10);
    }
    const sh = civic(SX.station + 1, SX.oak, { w: 30, h: 16, lot: { arch: 'police', key: 'police', name: 'Northshore Sheriff', poi: { kind: 'police', label: 'Northshore Sheriff' }, front: 3, whole: true } });
    if (sh) out.shops++;
    place('Bank Street', SX.poplar, SY.front, SX.oak, SY.bank + 4);
  }

  // ===========================================================================================================
  // Northshore Plaza on Cedar Farms Road: the strip of shop units at the back of its car park, the painted bays, lamp
  // posts, the trolley bay, its pylon sign at the road
  function plaza() {
    const x0 = SX.poplar + 8, x1 = SX.elm - 7, w = x1 - x0, h = 12, y = SY.bank + 8;
    const b = K.building({ x: x0, y, w, h, arch: 'strip', key: 'strip', name: 'Northshore Plaza', whole: true,
      units: [['grocery', 'Northshore Market'], ['pharmacy', 'Harbor Pharmacy'], ['hardware', 'Hammer & Nail Hardware'], ['delivery', "Rocco's Pizza"], ['delivery', 'Suds & Bubbles Laundry']] });
    if (!b) return;
    out.shops++;
    const ly0 = y + h + 1, ly1 = SY.cedar - 6;
    for (let yy = y + h; yy <= ly1; yy++) for (let xx = x0 - 2; xx < x1 + 2; xx++) if (K.free(xx, yy)) { m.set(xx, yy, yy === y + h ? T.PLAZA : T.LOT); K.take(xx, yy, 1, 1); }
    // the bays: two rows facing each other across the aisle, cars in some
    for (let xx = x0 + 2; xx < x1 - 2; xx += 3) for (const yy of [ly0 + 3, ly1 - 3]) if (rnd(xx, yy, 71) < 0.55) m.parking.push({ x: Math.round((xx + 0.5) * TILE), y: Math.round(yy * TILE), a: Math.PI / 2 });
    for (let xx = x0 + 10; xx < x1 - 4; xx += 18) prop('lamp', xx, (ly0 + ly1) / 2, 5);
    prop('textsign', x1 - 4, ly1 + 1.2, 0, { text: 'NORTHSHORE PLAZA', bg: '#2a4a6a', fg: [255, 236, 170], z: 40, sx: 2 });
    (out.places ||= []).push({ name: 'Northshore Plaza', x0: x0 - 2, y0: y, x1: x1 + 2, y1: ly1 + 1 });
  }

  // ===========================================================================================================
  // The cottages south of Bank Street east of the plaza: a row with its doors on Bank Street, one facing Cedar Farms Road
  function houses() {
    for (const [x0, x1] of [[SX.elm, SX.station], [SX.station, SX.oak]]) {
      backRow(x0, x1, SY.bank + 1, Math.round((SY.bank + SY.cedar) / 2) - 1, { ...row, yard: 6 });
      frontRow(x0, x1, Math.round((SY.bank + SY.cedar) / 2), SY.cedar - 1, { ...row, setback: 3 });
    }
    place('Northshore', SX.poplar, SY.coast, SX.oak, SY.cedar);
  }

  // ===========================================================================================================
  // The inlet shore east of Oak Street (Northshore-A1's wooded shores with villas and docks): Front and Bank Streets run
  // on to the water and end in their turning circles; the villas face them and Cedar Farms Road - big clapboard houses on
  // wide lots, their gardens back to back between the streets - and the lots at the water's edge have a jetty each, a
  // boat tied up at it
  function inletVillas() {
    const x0 = SX.oak + 5;
    // (the shore along a band: the first water east of Oak Street; the rows stop short of it, under the trees)
    const shoreAt = (y) => { for (let x = x0; x < 3300; x++) if (wet(x, y)) return x; return 3300; };
    const edge = (ya, yb) => { let e = 3300; for (let y = ya; y <= yb; y++) e = Math.min(e, shoreAt(y)); return e - 4; };
    const villa = { ...row, w: 12, price: 52000, trees: ['whitePine', 'birch', 'maple', 'oak'] };
    // (the pavements: the land here was the valley's when the roads were laid - a country road's verges - so Oak
    // Street's east side and Front and Bank Streets' sides out to their turning circles get theirs now, two tiles wide)
    const walk = (x, y) => { const i = y * W + x; if (m.land[i] && m.tiles[i] === T.GRASS && m.bld[i] < 0 && K.free(x, y)) { m.set(x, y, T.SIDEWALK); K.take(x, y, 1, 1); } };
    const roadAt = (x, y) => tile(x, y) === T.ROAD;
    for (let y = SY.coast; y <= SY.cedar; y++) { let x = SX.oak; while (x < SX.oak + 8 && roadAt(x, y)) x++; if (x > SX.oak) for (let k = 0; k < 2; k++) walk(x + k, y); }
    for (const sy of [SY.front, SY.bank]) for (let x = SX.oak; x < SX.inlet + 8; x++) {
      if (!roadAt(x, sy)) continue;
      let yn = sy; while (yn > sy - 8 && roadAt(x, yn)) yn--;
      let ys = sy; while (ys < sy + 8 && roadAt(x, ys)) ys++;
      for (let k = 0; k < 2; k++) { walk(x, yn - k); walk(x, ys + k); }
    }
    const mid1 = Math.round((SY.front + SY.bank) / 2), mid2 = Math.round((SY.bank + SY.cedar) / 2);
    const bands = [
      ['f', SY.coast + 2, SY.front - 1],      // facing Front Street from the north
      ['b', SY.front + 1, mid1 - 1],          // on Front Street's south side, their gardens behind
      ['f', mid1, SY.bank - 1],               // facing Bank Street
      ['b', SY.bank + 1, mid2 - 1],
      ['f', mid2, SY.cedar - 1],              // facing Cedar Farms Road
    ];
    const h0 = out.homes;
    for (const [k, ya, yb] of bands) {
      const x1 = Math.min(edge(ya, yb), SX.inlet + 6);
      if (x1 - x0 < 12) continue;
      if (k === 'f') { let y = ya; while (y < yb && !K.free(x0 + 2, y)) y++; frontRow(x0, x1, y, yb, { ...villa, setback: 4 }); }
      else backRow(x0, x1, ya, yb, { ...villa, yard: 8 });
    }
    // the jetties: from the gardens' ends out into the inlet, timber decking two wide, a boat alongside
    let jetties = 0;
    for (const y of [SY.front - 10, SY.bank - 12, SY.cedar - 14]) {
      const sx = shoreAt(y);
      if (sx >= 3300 || !wet(sx + 8, y) || !wet(sx + 8, y + 3)) continue;
      for (let yy = y; yy < y + 2; yy++) for (let x = sx - 3; x < sx + 8; x++) {
        const i = yy * W + x;
        if (m.bld[i] >= 0) continue;
        if (wet(x, yy) || K.free(x, yy)) { m.set(x, yy, T.DOCK); m.reserve[i] |= 16; if (!wet(x, yy)) K.take(x, yy, 1, 1); }
      }
      prop('bollard', sx + 7.5, y + 0.5, 5); prop('lamp', sx - 2.5, y + 0.5, 5, { style: 'iron' });
      m.marina.push({ x: Math.round((sx + 5) * TILE), y: Math.round((y + 3.4) * TILE), a: 0, kind: jetties % 2 ? 'speedboat' : 'dinghy' });
      jetties++;
    }
    out.villas = out.homes - h0; out.jetties = jetties;
    place('Inlet Shore', SX.oak, SY.coast, 3300, SY.cedar);
  }

  // ===========================================================================================================
  // Bayview Green on the lobe, inside Bayview Drive's loop: the fenced oval garden with its windswept pines, flower beds
  // and benches; the pastel terraces round it facing in; the cottages on the Shore Road
  function bayview() {
    // the terrace facing the green from the north, under the loop's top: pastel clapboard houses side by side, each its
    // door on the green, a strip of garden in front behind a picket fence
    const made = K.row(LX.west + 4, LX.east - 4, LY.top + 4, 636, (x, room) => (room < 8 ? null : { w: Math.min(room, 9), depth: 9, minDepth: 7, arch: 'house', key: 'house2', home: { kind: 'house', price: 38000 }, whole: true, art: cottage(x, 611) }), { noStep: true });
    for (const b of made) if (b && !b.gap && b.tw !== undefined) {
      out.homes++;
      const fy = b.ty + b.th;
      for (let yy = fy; yy < fy + 3; yy++) for (let xx = b.tx; xx < b.tx + b.tw; xx++) if (K.free(xx, yy)) K.take(xx, yy, 1, 1);
      prop('fenceline', b.tx + 0.2, fy + 2.6, 0, { kind: 'picket', tx: Math.round((b.tw - 0.4) * TILE), ty: 0 });
      prop(pick(['flowers_big', 'flowers_a', 'shrub_a'], rnd(b.tx, fy, 81)), b.tx + 2, fy + 1.4, 0);
    }
    // the green: a lawn between the terrace and the cottages, fenced round, its path, the pines, beds and benches
    const gx0 = LX.west + 6, gx1 = LX.east - 6, gy0 = 646, gy1 = 680;
    const cx = (gx0 + gx1) / 2, cy = (gy0 + gy1) / 2;
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x < gx1; x++) {
      const ex = (x + 0.5 - cx) / ((gx1 - gx0) / 2), ey = (y + 0.5 - cy) / ((gy1 - gy0) / 2);
      if (ex * ex + ey * ey > 1 || !K.free(x, y)) continue;
      if (Math.abs(y + 0.5 - cy) < 1.2) m.set(x, y, T.PLAZA);
      K.take(x, y, 1, 1);
    }
    const ax = (gx1 - gx0) / 2, ay = (gy1 - gy0) / 2;
    // (the railing round the oval: sixteen straight pieces, a gap at each end of the path)
    for (let k = 0; k < 16; k++) {
      if (k === 0 || k === 15 || k === 7 || k === 8) continue;
      const [c0, s0] = RING[k], [c1, s1] = RING[(k + 1) % 16];
      const x0 = cx + ax * c0, y0 = cy + ay * s0, x1 = cx + ax * c1, y1 = cy + ay * s1;
      prop('fenceline', x0, y0, 0, { kind: 'picket', tx: Math.round((x1 - x0) * TILE), ty: Math.round((y1 - y0) * TILE) });
    }
    // the bandstand in the middle on its round of paving, where the path crosses; benches round it, beds out on the lawn
    for (let y = Math.floor(cy - 4); y <= Math.ceil(cy + 4); y++) for (let x = Math.floor(cx - 5); x <= Math.ceil(cx + 5); x++) {
      const ex = (x + 0.5 - cx) / 5, ey = (y + 0.5 - cy) / 4;
      if (ex * ex + ey * ey <= 1) { const i = y * W + x; if (m.tiles[i] === T.GRASS && !(m.reserve[i] & ~16) && m.bld[i] < 0) m.tiles[i] = T.PLAZA; }
    }
    prop('gazebo', cx, cy + 0.5, 30);
    for (const [dx, dy] of [[-12, -6], [9, -8], [-4, 9], [14, 5], [-18, 5], [19, -3]]) prop('tree_a', cx + dx, cy + dy, 12, { sp: 'whitePine', k: 1.35 });
    for (const [dx, dy] of [[-10, -9], [10, 9], [-15, -3], [16, 2]]) prop('tree_b', cx + dx, cy + dy, 12, { sp: 'street', k: 1.0 });
    for (const [dx, dy] of [[-7, -3.5], [7, -3.5], [-7, 4], [7, 4], [-14, 1.6], [14, 1.6]]) prop('bench_m', cx + dx, cy + dy, 0);
    for (const [dx, dy] of [[-17, -2], [17, -1], [0, -11], [-6, 11], [6, -10], [-20, 0.5], [20, 0.5], [0, 12]]) prop('flowers_big', cx + dx, cy + dy, 0);
    (m.landmarks ||= []).push({ name: 'Bayview Green', type: 'park', x: gx0 * TILE, y: gy0 * TILE, w: (gx1 - gx0) * TILE, h: (gy1 - gy0) * TILE });
    // the cottages between the green and the Shore Road, their doors on the green's side
    backRow(LX.west + 4, LX.east - 4, gy1 + 2, LY.shore - 5, { ...row, yard: 4, w: 8 });
    // and the beach cottages on the dunes west of the drive, their doors on the Shore Road
    frontRow(RECTS[1][0], LX.west - 2, 678, LY.shore - 6, { ...row, setback: 3, w: 10 });
    place('Bayview Green', LX.west, LY.top, LX.east, LY.shore);
  }

  // ===========================================================================================================
  // The waterfront on the inlet, east of Bayview Drive: the boardwalk along the shore, Northshore Marina's office and
  // the cafes facing south over their terraces, the boats along the piers (the piers: shared/world3-north.js)
  function waterfront() {
    const y0 = 650, y1 = LY.shore - 5;
    // the shore's line along the rows: the first water east of the drive
    const shoreE = (y) => { for (let x = LX.east + 6; x < 3300; x++) if (wet(x, y)) return x; return 3300; };
    // the boardwalk: the 4 tiles in from the water, paved (sand or grass)
    for (let y = 606; y <= y1; y++) {
      const sx = shoreE(y);
      for (let x = sx - 4; x < sx; x++) { const i = y * W + x, t = m.tiles[i]; if (!m.land[i] || m.bld[i] >= 0 || (m.reserve[i] & ~4)) continue; if (t === T.SAND || t === T.GRASS) { m.tiles[i] = T.PLAZA; m.reserve[i] = (m.reserve[i] & ~4) | 16; K.take(x, y, 1, 1); } }
      if (y % 4 === 0 && wet(sx, y)) prop('bollard', sx - 0.5, y + 0.5, 5);
      if (y % 16 === 8) prop('lamp', sx - 3.5, y + 0.5, 5, { style: 'iron' });
    }
    // the buildings along it, facing south, on the sand made ground between the drive and the boardwalk
    const lots = [];
    for (let y = y0; y + 10 < y1; y += 16) {
      const xa = LX.east + 6, xb = shoreE(y + 5) - 6;
      if (xb - xa < 10) continue;
      const w = Math.min(16, xb - xa);
      for (let yy = y; yy < y + 9; yy++) for (let xx = xa; xx < xa + w; xx++) { const i = yy * W + xx; if (m.tiles[i] === T.SAND && !(m.reserve[i] & ~4) && m.bld[i] < 0) { m.tiles[i] = T.GRASS; m.reserve[i] &= ~4; } }
      lots.push([xa, y, w]);
    }
    const LIST = [
      { name: 'Northshore Marina', poi: { kind: 'marina', label: 'Northshore Marina' }, store: 'mart', sign: 'MARINA', signC: ['#2a4a6a', [240, 236, 220]], awning: ['#2a4a6a', '#f0ece4'], wall: '#ece9e0' },
      { name: 'The Tidewater Cafe', poi: { kind: 'coffee', label: 'The Tidewater Cafe', food: true }, store: 'cafe', sign: 'TIDEWATER CAFE', signC: ['#2a5a6a', [250, 240, 220]], awning: ['#2a5a6a', '#f0ece4'], wall: '#a8c8d8', tables: true },
      { name: 'Inlet Oyster Bar', poi: { kind: 'delivery', label: 'Inlet Oyster Bar', food: true }, store: 'cafe', sign: 'OYSTER BAR', signC: ['#1e2a3a', [255, 226, 160]], awning: ['#1e2a3a', '#f0ece4'], wall: '#f0c8b8', tables: true },
    ];
    lots.forEach(([x, y, w], k) => {
      const L = LIST[k];
      if (!L) return;
      const b = K.building({ x, y, w, h: 9, arch: 'mixed', key: L.poi.food ? 'rest2' : 'conv', name: L.name, poi: L.poi, whole: true,
        art: { spec: { floors: 2, style: 'siding', wallColor: L.wall, win: 'pair', pitch: 'gable', roof: 'shingle', roofColor: pick(SLATES, rnd(x, y, 64)), slope: 0.55, parapet: 3, grime: 0.04, blades: [], plaques: [] },
          shop: { kind: L.store, door: 'left', open: true, people: 2, sign: { text: L.sign, bg: L.signC[0], fg: L.signC[1], lit: true }, awning: L.awning } } });
      if (!b) return;
      out.shops++;
      const fy = b.ty + b.th;
      for (let yy = fy; yy < fy + 4; yy++) for (let xx = b.tx; xx < b.tx + b.tw + 3; xx++) if (K.free(xx, yy) || tile(xx, yy) === T.SAND) { m.set(xx, yy, T.PLAZA); m.reserve[yy * W + xx] |= 16; K.take(xx, yy, 1, 1); }
      if (L.tables) for (let j = 0; j < 3; j++) { prop('cafetable', b.tx + 2.5 + j * 4, fy + 2, 6); prop(['umbrella_b', 'umbrella_r', 'umbrella_y'][j], b.tx + 2.5 + j * 4, fy + 1.8, 0); }
      else { prop('lifering', b.tx + b.tw + 1, fy + 1, 0); prop('crates', b.tx + 2, fy + 2, 8); }
      // (a path from the forecourt out to the boardwalk)
      for (let yy = fy + 1; yy < fy + 3; yy++) for (let xx = b.tx + b.tw + 3, xe = shoreE(yy) - 4; xx < xe; xx++) {
        const i = yy * W + xx, t = m.tiles[i];
        if (m.land[i] && m.bld[i] < 0 && !(m.reserve[i] & ~20) && (t === T.SAND || t === T.GRASS)) { m.tiles[i] = T.PLAZA; m.reserve[i] = (m.reserve[i] & ~4) | 16; K.take(xx, yy, 1, 1); }
      }
    });
    // the marina's fleet: sailboats and motor boats in the water off the boardwalk
    for (let y = 612; y < 700; y += 7) {
      const sx = shoreE(y);
      if (!wet(sx + 5, y) || !wet(sx + 9, y)) continue;
      if (rnd(sx, y, 66) < 0.4) continue;
      if (rnd(sx, y, 67) < 0.5) prop('sailboat', sx + 6, y + 0.5, 0, { a: 0, len: 110, sail: 0, c: Math.floor(rnd(sx, y, 68) * 3) });
      else m.marina.push({ x: Math.round((sx + 6) * TILE), y: Math.round((y + 0.5) * TILE), a: 0, kind: rnd(sx, y, 69) < 0.5 ? 'speedboat' : 'dinghy' });
    }
    place('Northshore Marina', LX.east + 4, 606, 3300, LY.shore);
  }

  // ===========================================================================================================
  // The cove on the lobe's west beach and its rock groyne out into the water; umbrellas, towels, a lifeguard's chair
  function cove() {
    const gy = 652;
    let x = LX.west - 4; while (x > 3100 && !wet(x, gy)) x--;
    if (!wet(x, gy)) return;
    let n = 0;
    for (let k = 0; k < 7; k++) {
      const bx = x + 3 - k * 3, by = gy + (k % 2) * 0.6;
      if (k > 0 && !wet(Math.floor(bx), gy)) break;
      const s = 40 + (k % 3) * 10;
      prop('outcrop', bx, by, 0, { w: s + 10, d: s, h: 26 + (k % 2) * 8, style: 'granite', s: bx + k }); m.addSolidProp(bx * TILE, by * TILE, Math.round(s * 0.42)); n++;
    }
    for (let k = 0; k < 4; k++) {
      const ux = x + 6 + (k % 2) * 4, uy = gy - 12 + k * 6;
      if (tile(Math.floor(ux), Math.floor(uy)) !== T.SAND) continue;
      prop(pick(['umbrella_r', 'umbrella_y', 'umbrella_b'], rnd(k, gy, 74)), ux, uy, 0); prop('towel', ux + 1, uy + 0.8, 0, { v: k });
    }
    out.groyne = n;
    (m.landmarks ||= []).push({ name: 'Northshore Cove', type: 'beach', x: (x - 10) * TILE, y: (gy - 20) * TILE, w: 30 * TILE, h: 40 * TILE });
  }
}
