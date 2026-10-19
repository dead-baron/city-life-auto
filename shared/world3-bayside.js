// World v3, handcrafted: Bayside Heights (district 16), the Gulf Island's ocean side, from the owner's concepts WC005
// and WC006 (the curving palm-median boulevard along the clifftop, gated villas with pools and fountain courts, the grand
// hotel with its café terrace and drop-off, a domed gazebo on the cliff edge, the railed promenade with stairs down to
// a small sandy cove, a tennis court), WC235/WC082/WC076 (switchback estate lanes, terraced walls, the lookout terrace,
// cypresses, palms and bougainvillea) and WC307 (the marina: finger piers, the yacht club, the bait shop on the quay,
// villas with their own docks), with the research's Hilltop Mansion, gated estate crescents, the clifftop overlook,
// the hidden cove, the marina terrace and the spa:
//   - Ocean Drive, the palm boulevard along the clifftop from the Gulf Footbridge's end to Marina Avenue: the villas
//     behind their gates along its inland side, the overlook, the gardens and the clifftop villas on its seaward side;
//   - Hillcrest Drive, the estate lane between Bayside Avenue and Ocean Drive from the Pine Hills Bridge's end;
//   - the avenues carried down from Downtown (Westside to the Strand Footbridge, Park West to the Pine Hills Bridge, Civic,
//     Harborview to the Southside Bridge);
//   - The Bayside Ritz and its drop-off on Ocean Drive, Monarch and Diamond & Co. beside it, the Seaglass Spa;
//   - the Hilltop Mansion on the headland, its walled lot and its grounds down to the cliff;
//   - the east shore north of Bayside Avenue (Marina Heights): Marina Avenue from the Lake District Bridge, the Bayside
//     Marina and the yacht club on the strait, townhouses and villas.
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2).
// The frame: shared/world3-hand.js; the mansion: shared/map.js handApi mansion.
import { TILE, T } from './constants.js';

const D = 16;   // Bayside Heights' id (shared/mapcore.js DISTRICTS)
// its areas: the east shore north of Bayside Avenue, and the ocean side in pieces that keep clear of Pine Hills' and
// Southside's land across the channels (their own grids lay their streets)
const RECTS = [[3480, 2300, 3800, 2730], [2400, 2730, 2870, 2846], [2870, 2730, 3200, 2936], [3200, 2730, 3700, 3005], [3700, 2730, 3800, 2935]];
// the lines (tiles)
export const BX = { gulfFoot: 2475, westside: 2860, parkWest: 2988, pineBridge: 2973, civic: 3320, harborview: 3480, southBridge: 3459, marina: 3680 };
export const BY = { bayside: 2730, lake: 2333, green: 2400, cypress: 2450, falls: 2499, fountain: 2576, footbridge: 2560 };
export const ENDS = { gulfFoot: [2475, 2760], strand: [2860, 2820], pineHills: [2973, 2777], southside: [3459, 2941], lakeDistrict: [3571, 2333], falls: [3623, 2499], lakesFoot: [3735, 2560] };
// Ocean Drive along the clifftop, Hillcrest Drive inland of it
export const OCEAN = [ENDS.gulfFoot, [2560, 2770], [2681, 2779], [2726, 2784], [2800, 2790], [2860, 2795], [2920, 2799], [2973, 2806], [3040, 2826], [3100, 2844], [3170, 2860], [3240, 2872], [3320, 2878], [3400, 2886], [3470, 2896], [3530, 2888], [3575, 2866], [3610, 2852], [3680, 2850]];
export const HILL = [ENDS.pineHills, [3040, 2781], [3120, 2786], [3200, 2791], [3280, 2795], [3360, 2799], [3420, 2804], [BX.harborview, 2810]];
const yOn = (P, x) => { if (x <= P[0][0]) return P[0][1]; for (let j = 1; j < P.length; j++) if (x <= P[j][0]) { const [ax, ay] = P[j - 1], [bx, by] = P[j]; return ay + (by - ay) * (x - ax) / (bx - ax); } return P[P.length - 1][1]; };
export const oceanY = (x) => yOn(OCEAN, x);
export const hillY = (x) => yOn(HILL, x);

function streets() {
  return [
    { name: 'Ocean Drive', kind: 'blvd', pts: OCEAN, w: 13, median: 96 },
    { name: 'Hillcrest Drive', kind: 'st', pts: HILL },
    { name: 'Westside Avenue', kind: 'ave', pts: [[BX.westside, BY.bayside], ENDS.strand] },   // (on to the Strand Footbridge)
    { name: 'Park West Avenue', kind: 'ave', pts: [[BX.parkWest, BY.bayside], [BX.parkWest, 2758], ENDS.pineHills] },   // (on to the Pine Hills Bridge)
    { name: 'Civic Avenue', kind: 'ave', pts: [[BX.civic, BY.bayside], [BX.civic, Math.round(oceanY(BX.civic))]] },
    { name: 'Harborview Avenue', kind: 'ave', pts: [[BX.harborview, BY.bayside], [BX.harborview, 2872], [BX.southBridge, 2905], ENDS.southside] },   // (on to the Southside Bridge)
    // Marina Heights, north of Bayside Avenue: Marina Avenue from the Lake District Bridge's end down to Ocean Drive, the
    // streets across from Harborview Avenue under the Gulf Loop
    { name: 'Marina Avenue', kind: 'ave', pts: [ENDS.lakeDistrict, [3630, 2345], [BX.marina, 2380], [BX.marina, 2850]] },
    { name: 'Lake Street', kind: 'st', pts: [[BX.harborview, BY.lake], ENDS.lakeDistrict] },
    { name: 'Greenfield Avenue', kind: 'ave', pts: [[BX.harborview, BY.green], [BX.marina, BY.green]] },
    { name: 'Falls Street', kind: 'st', pts: [[BX.harborview, BY.falls], ENDS.falls] },   // (on to the Falls Bridge)
    { name: 'Fountain Avenue', kind: 'ave', pts: [[BX.harborview, BY.fountain], [BX.marina, BY.fountain]] },
    { name: 'Marina Walk', kind: 'minor', pts: [[BX.marina, BY.footbridge], ENDS.lakesFoot] },   // (to the Lakes Footbridge)
    { name: 'Point Lane', kind: 'minor', culdesac: true, pts: [[BX.marina, 2800], [3772, 2800]] },
    { name: 'Harbor Lane', kind: 'minor', culdesac: true, pts: [[BX.marina, 2650], [3574, 2650]] },   // (into the deep block under the Gulf Loop's deck)
    { name: 'Cypress Lane', kind: 'minor', pts: [[BX.harborview, BY.cypress], [BX.marina, BY.cypress]] },   // (across the deepest block, under the deck)
  ];
}

export const BAYSIDE = {
  key: 'bayside', d: D, rects: RECTS, rect: [2400, 2300, 3800, 3005],
  streets,
  // the special places this plan lays itself (shared/map.js SPECIALS of Bayside Heights: placeSpecials leaves them)
  specials: ['The Bayside Ritz', 'Monarch', 'Diamond & Co.'],
  build,
};

// ---------------------------------------------------------------------------------------------------------------
// The looks: Mediterranean villas (cream, peach and white stucco under terracotta tiles), modern villas (white and grey
// under flat roofs with their terraces), the townhouses' pastels
const WARM = ['#f2e8d8', '#f4dcc0', '#efe4cc', '#f6efe2', '#ead8c0', '#f2d6c4', '#e8dcc8'];
const COOL = ['#f4f4f0', '#e6e8e6', '#d8dcdc', '#eeeae4'];
const TOWN = ['#f2c4a2', '#a6dcc6', '#f2e2c2', '#a8cce8', '#f3a08c', '#e8d0e0', '#d8e8c8'];
const MORE = [...['Allegra', 'Bianca', 'Carina', 'Delia', 'Flavia', 'Giada', 'Ione', 'Liana', 'Ornella', 'Paola', 'Rosa', 'Silvia', 'Tessa', 'Viola', 'Adriana', 'Bruna', 'Costanza', 'Dalia', 'Emilia', 'Fiamma']
  .flatMap((n) => [`Villa ${n}`, `Casa ${n}`]), ...['Heron', 'Kestrel', 'Mariner', 'Lantern', 'Compass', 'Anchor', 'Cove', 'Jetty', 'Sextant', 'Spindrift', 'Starling', 'Wren', 'Seashell', 'Dune', 'Pearl', 'Reef', 'Tide', 'Marlin', 'Cormorant', 'Plover'].map((n) => `${n} House`)];
const NAMES = ['Villa Serena', 'Casa del Mar', 'Villa Azzurra', 'The Cypresses', 'Villa Lucia', 'Seacliff House', 'Villa Aurelia', 'Tidewater House', 'Villa Solana', 'Bellavista',
  'Las Brisas', 'Villa Esmeralda', 'Windward House', 'Villa Corallo', 'Monte Verde', 'Villa Ondine', 'Halcyon House', 'Villa Marisol', 'The Pines', 'Villa Celeste', 'Casa Alta',
  'Villa Toscana', 'Belmonte', 'Villa Iris', 'Seabreeze House', 'Villa Dorata', 'Villa Gardenia', 'Cliff House', 'Villa Perla', 'Casa Luna', 'Villa Oliva', 'Saltwind',
  'Villa Fiora', 'Casa Sol', 'Villa Mirella', 'Highcliff', 'Villa Verbena', 'Casa Bonita', 'Villa Lantana', 'Westwind', 'Villa Clara', 'Casa Rosada', 'Villa Alba', 'Sandpiper House',
  'Villa Ginestra', 'Casa Palma', 'Villa Tamara', 'Driftwood House', 'Villa Nerina', 'Casa Serena', 'Villa Sorrel', 'Beacon House', 'Villa Ambra', 'Casa Marea', 'Villa Ilaria', 'Gull Rock',
  'Villa Belinda', 'Casa Encantada', 'Villa Oleandro', 'Larkspur House', 'Villa Margherita', 'Casa Vista', 'Villa Sabina', 'Seawatch', 'Villa Gioia', 'Casa Coral', 'Villa Lavanda', 'Moonraker House',
  'Villa Fortuna', 'Casa Azul', 'Villa Brezza', 'Tern House', 'Villa Cielo', 'Casa Miramar', 'Villa Elara', 'Harbourlight', 'Villa Rocca', 'Casa Delfina', 'Villa Selene', 'Osprey House',
  'Villa Primavera', 'Casa Tranquila', 'Villa Livia', 'Bluewater House', 'Villa Noemi', 'Casa Orilla', 'Villa Regina', 'Petrel House', 'Villa Vittoria', 'Casa Alegre', 'Villa Zinnia', 'Albatross House'];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, villas: 0, pools: 0, shops: 0 };
  const used = new Set();
  let vi = 0;
  const inRects = (x, y) => RECTS.some((r) => x >= r[0] && y >= r[1] && x < r[2] && y < r[3]);
  const mine = (x, y) => m.dist[y * m.w + x] === D && inRects(x, y);
  const tile = (x, y) => m.tiles[y * m.w + x];
  // the coast: the first water south of a row's land, scanning down a column
  const shoreS = (x, y0 = 2738) => { let y = y0; while (y < 3010 && m.land[y * m.w + x]) y++; return y; };
  const oceanN = (x) => Math.floor(oceanY(x)) - 10, oceanS = (x) => Math.ceil(oceanY(x)) + 10;
  const hillN = (x) => Math.floor(hillY(x)) - 6, hillS = (x) => Math.ceil(hillY(x)) + 6;
  // (the names: the list's, then composed - Villa Bianca, Casa Delia, Heron House)
  const vname = (x, y) => {
    for (const L of [NAMES, MORE]) for (let t = 0; t < L.length; t++) { const n = L[(Math.floor(rnd(x, y, 500) * L.length) + t) % L.length]; if (!used.has(n)) { used.add(n); return n; } }
    return `Bayside Villa ${++vi}`;
  };

  // ---- a villa: its art (Mediterranean under terracotta, or modern under a flat roof with its terrace) ----------
  const villaArt = (x, y, w, o = {}) => {
    const r = (k) => rnd(x, y, 520 + k);
    const modern = o.modern ?? r(0) < 0.35;
    const floors = o.floors ?? (r(1) < 0.75 ? 2 : 3);
    if (modern) return { spec: { floors, style: 'stucco', wallColor: pick(COOL, r(2)), win: 'tall', parapet: 6, grime: 0.02, roofMat: r(3) < 0.5 ? 'deck' : 'green', lip: 6, rimW: 4, balconies: true, cornice: null, blades: [], plaques: [] },
      noShop: true, kit: [['lounge', Math.round(w * TILE * 0.3), 60], ['umb', Math.round(w * TILE * 0.55), 70], ['plant', 40, 40], ['plant', w * TILE - 40, 40]] };
    return { spec: { floors, style: 'stucco', wallColor: pick(WARM, r(2)), win: pick(['arch', 'tall', 'pair'], r(3)), pitch: r(4) < 0.7 ? 'hip' : 'gable', roof: 'tile', slope: 0.5, parapet: 4, grime: 0.03, balconies: r(5) < 0.6, cornice: null, blades: [], plaques: [] }, noShop: true, kit: [] };
  };
  // ---- a villa's lot facing south onto the street below it: the house against the back, its terrace and the pool in
  // front of it, the lawn, the drive in from the gate on the street to the garage beside the house, hedges down the
  // sides, the iron railing along the pavement, palms and cypresses; a home behind its door ----------------------
  const estates = (x0, x1, y0, y1, mask0, o = {}) => {
    // (a lot no deeper than maxDeep from the street: what's behind is the back garden - the landscape's trees)
    const maxDeep = o.maxDeep || 30, edge = new Map();
    const southEdge = (x) => { if (!edge.has(x)) { const c = K.column(x, y0, y1, mask0); edge.set(x, c ? c[0] : -1); } return edge.get(x); };
    const mask = (x, y) => mask0(x, y) && y > southEdge(x) - maxDeep;
    const made = K.row(x0, x1, y0, y1, (x, room, i) => {
      if (room < 14) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      if (i % 2 === 1) return { gap: 3 + Math.floor(rnd(x, y0, 501) * 3), kind: 'garden' };
      const w = Math.min(room, o.w || 16 + Math.floor(rnd(x, y0, 502) * 7)), depth = o.depth || 11 + Math.floor(rnd(x, y0, 503) * 3);
      const name = vname(x, y0), price = o.price || 70000 + Math.floor(rnd(x, y0, 504) * 5) * 10000;
      return { w, depth, minDepth: 8, arch: 'villa', name, poi: false, whole: true, art: villaArt(x, y0, w, o), home: { kind: 'house', price, slots: 3, name } };
    }, { north: true, mask });
    for (const b of made) if (b && !b.gap) yard(b, y1, mask, o);
    return made;
  };
  // ---- a villa facing north onto the street above it (its door and its drive there): its garden behind it, to the
  // south where the camera sees it - the terrace, the pool, the loungers, the lawn hedged round, palms ---------------
  const backEstates = (x0, x1, y0, y1, mask, o = {}) => {
    const made = K.row(x0, x1, y0, y1, (x, room, i) => {
      if (room < 14) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      if (i % 2 === 1) return { gap: 3 + Math.floor(rnd(x, y0, 505) * 3), kind: 'garden' };
      const w = Math.min(room, o.w || 15 + Math.floor(rnd(x, y0, 506) * 6)), depth = 11 + Math.floor(rnd(x, y0, 507) * 2);
      const name = vname(x, y0 + 1), price = o.price || 70000 + Math.floor(rnd(x, y0, 508) * 4) * 10000;
      return { w, depth, minDepth: 8, arch: 'villa', name, poi: false, whole: true, face: 'N', art: villaArt(x, y0 + 1, w, o), home: { kind: 'house', price, slots: 3, name, garage: { x: (x + w / 2) * TILE, y: (y0 - 2) * TILE, a: -Math.PI / 2 } } };
    }, { north: true, mask });
    for (const b of made) if (b && !b.gap) {
      out.villas++; out.homes++;
      const yb = b.ty + b.th, x = b.tx - 2, w = b.tw + 4, deep = o.garden || 14;
      for (let yy = yb; yy < yb + deep; yy++) for (let xx = x; xx < x + w; xx++) if (K.free(xx, yy) && mask(xx, yy)) K.take(xx, yy, 1, 1);
      K.paint(b.tx, yb, b.tw, 2, T.PLAZA);
      const pw = Math.min(b.tw - 4, 10), ph = 4, px0 = b.tx + 2, py0 = yb + 4;
      if (pw >= 5) {
        K.paint(px0 - 1, py0 - 1, pw + 2, ph + 2, T.PLAZA);
        for (let yy = py0; yy < py0 + ph; yy++) for (let xx = px0; xx < px0 + pw; xx++) m.set(xx, yy, T.WATER);
        (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
        out.pools++;
        for (let k = 0; k < Math.floor(pw / 3); k++) prop('lounger', px0 + 1 + k * 3, py0 + ph + 1.2, 0, { v: k + Math.floor(rnd(b.tx, k, 509) * 4), a: -Math.PI / 2 });
        prop(pick(['umbrella_b', 'umbrella_g', 'umbrella_y'], rnd(b.tx, yb, 517)), px0 + pw + 0.4, py0 + 1, 0);
      }
      prop('hedgerun', x + 0.3, yb + deep - 0.6, 0, { tx: Math.round((w - 0.6) * TILE), ty: 0, h: 16 });
      for (const hx of [x + 0.3, x + w - 0.3]) prop('hedgerun', hx, yb, 0, { tx: 0, ty: Math.round((deep - 0.6) * TILE), h: 16 });
      prop('palm_a', b.tx + b.tw - 1, yb + deep - 3, 10, { sp: rnd(b.tx, yb, 518) < 0.5 ? 'royal' : 'date', k: 1.15 });
      prop('tree_a', b.tx + 1, yb + deep - 3, 10, { sp: 'cypress', k: 1.1 });
    }
    return made;
  };
  const yard = (b, y1, mask, o) => {
    const x = b.tx - 3, w = b.tw + 6, yb = b.ty + b.th;
    // the yard's south edge: the street's pavement (the band's last free row under the house)
    let yf = y1;
    for (let xx = b.tx; xx < b.tx + b.tw; xx++) { const c = K.column(xx, yb, y1, mask); if (c) yf = Math.min(yf, c[0]); }
    const deep = yf - yb + 1;
    out.villas++; out.homes++;
    if (deep < 6) return;
    // the terrace across the front, the lawn
    K.fill(b.tx, yb, b.tw, 2, T.PLAZA);
    for (let yy = yb + 2; yy <= yf; yy++) for (let xx = x; xx < x + w; xx++) if (K.free(xx, yy) && (!mask || mask(xx, yy))) K.take(xx, yy, 1, 1);
    // the drive: from the gate on the street up the east or west side to the garage by the house
    const east = rnd(b.tx, yb, 510) < 0.5, dx = east ? b.tx + b.tw - 3 : b.tx;
    K.paint(dx, yb + 2, 3, deep - 2, T.LOT);
    const home = m.homes.find((h) => h.b === b.id);
    if (home) home.garage = { x: (dx + 1.5) * TILE, y: (yb + 3.5) * TILE, a: Math.PI / 2 };
    // the pool and its deck in the lawn beside the drive (deep yards), loungers, umbrellas
    const pw = Math.min(b.tw - 6, 10), ph = deep >= 16 ? 5 : 4, px0 = east ? b.tx + 1 : b.tx + 4, py0 = yb + 4;
    if (deep >= 12 && pw >= 5) {
      K.paint(px0 - 1, py0 - 1, pw + 2, ph + 2, T.PLAZA);
      for (let yy = py0; yy < py0 + ph; yy++) for (let xx = px0; xx < px0 + pw; xx++) m.set(xx, yy, T.WATER);
      (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
      out.pools++;
      for (let k = 0; k < Math.floor(pw / 3); k++) prop('lounger', px0 + 1 + k * 3, py0 + ph + 1.2, 0, { v: k + Math.floor(rnd(b.tx, k, 511) * 4), a: -Math.PI / 2 });
      prop(pick(['umbrella_b', 'umbrella_g', 'umbrella_y'], rnd(b.tx, yb, 512)), px0 + pw + 0.2, py0 + ph + 1, 0);
      if (rnd(b.tx, yb, 513) < 0.4) prop('ringfloat', px0 + pw * 0.6, py0 + ph * 0.5, 0, { v: Math.floor(rnd(b.tx, yb, 514) * 3) });
    }
    // a fountain court inside the gate on the deep lots
    if (deep >= 22) { const fx = east ? dx - 4 : dx + 7, fy = yf - 5; K.paint(Math.round(fx) - 3, fy - 3, 6, 6, T.PLAZA); prop('fountain', fx, fy + 0.5, 30); }
    // the gate on the street, the railing along it, the hedges down the sides
    for (const gx of [dx - 0.3, dx + 3.3]) prop('gatepier', gx, yf + 0.4, 10);
    prop('fenceline', x + 0.2, yf + 0.6, 0, { kind: 'iron', tx: Math.round((dx - 0.6 - x - 0.2) * TILE), ty: 0 });
    prop('fenceline', dx + 3.6, yf + 0.6, 0, { kind: 'iron', tx: Math.round((x + w - 0.2 - dx - 3.6) * TILE), ty: 0 });
    for (const hx of [x + 0.4, x + w - 0.4]) prop('hedgerun', hx, yb - b.th + 1, 0, { tx: 0, ty: Math.round((deep + b.th - 2) * TILE), h: 16 });
    // palms and cypresses: a pair at the gate, cypresses up the drive, palms by the pool, the bougainvillea on the house
    for (let yy = yb + 4; yy < yf - 2; yy += 4) prop('tree_a', east ? dx - 0.6 : dx + 3.6, yy, 10, { sp: 'cypress', k: 1.1 });
    prop('palm_a', east ? x + 1.5 : x + w - 1.5, yb + 3, 10, { sp: rnd(b.tx, yb, 515) < 0.5 ? 'royal' : 'date', k: 1.15 });
    prop('palm_a', east ? x + 1.5 : x + w - 1.5, yf - 2, 10, { sp: 'royal', k: 1.1 });
    for (const fx of [b.tx + 1.5, b.tx + b.tw - 1.5]) prop(pick(['flowers_big', 'shrub_a'], rnd(fx, yb, 516)), fx, yb + 2.6, 0);
  };

  // the bands (tiles): first free rows under Bayside Avenue, round the drives
  const bayS = 2738;

  // ===========================================================================================================
  hilltopMansion();
  ritz();
  overlook();
  oceanSide();
  marinaHeights();
  strand();
  dressing();
  K.landscape({ bare: 0.35, tree: (x, y, r) => r < 0.45 ? ['palm_a', pick(['royal', 'date', 'coconut'], rnd(x, y, 830)), 1.1 + rnd(x, y, 831) * 0.2] : r < 0.8 ? [rnd(x, y, 832) < 0.5 ? 'tree_a' : 'tree_b', pick(['cypress', 'olive', 'magnolia', 'oak', 'cypress'], rnd(x, y, 833)), 1.05 + rnd(x, y, 834) * 0.2] : [pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 835)), null, 1] });
  out.named = used.size;
  return out;

  // ===========================================================================================================
  // The Hilltop Mansion on the headland south of Ocean Drive: its walled lot (shared/map.js mansion: the house, its
  // fountain, the pool, the three-car garage; its gate north onto the drive), its grounds down to the cliff - the lawn,
  // the tennis court, the cliff gazebo, a stair down to the rocks
  function hilltopMansion() {
    const [MW, MH] = api.MANSION_SIZE || [26, 24];
    for (const mx of [3506, 3512, 3500, 3518, 3494]) {
      const my = oceanS(mx + MW) + 1, my2 = Math.max(my, oceanS(mx) + 1);
      if (!K.allFree(mx, my2, MW, MH)) continue;
      K.take(mx, my2, MW, MH);
      const M = api.mansion && api.mansion(m, mx, my2);
      if (!M) return;
      out.homes++;
      // the grounds to the cliff: lawn, the tennis court, the gazebo on the edge, cypress walks
      const gy0 = my2 + MH, gx0 = mx - 8, gx1 = mx + MW + 8;
      for (let y = gy0; y < 3005; y++) for (let x = gx0; x < gx1; x++) if (K.free(x, y) && mine(x, y)) K.take(x, y, 1, 1);
      const sy = shoreS(mx + MW / 2, gy0);
      if (sy - gy0 > 26) {
        prop('court', mx + MW / 2, gy0 + 3, 0, { w: 20 * TILE, d: 11 * TILE, k: 'tennis', c1: '#3a7e86', c2: '#3a6a4e' }); prop('tnet', mx + MW / 2, gy0 + 8.5, 0, { len: 11 * TILE - 24, a: 0 });
        prop('chainfence', mx + MW / 2 - 10.5, gy0 + 2.4, 0, { tx: 21 * TILE, ty: 0 }); prop('chainfence', mx + MW / 2 - 10.5, gy0 + 14.6, 0, { tx: 21 * TILE, ty: 0 });
      }
      prop('gazebo', mx + MW / 2, sy - 5, 30);
      for (let x = gx0 + 2; x < gx1 - 2; x += 5) prop('tree_a', x, gy0 + 0.6, 10, { sp: 'cypress', k: 1.15 });
      (out.places ||= []).push({ name: 'Hilltop Mansion', x0: mx, y0: my2, x1: mx + MW, y1: sy });
      return;
    }
  }

  // ===========================================================================================================
  // The Bayside Ritz on Ocean Drive (WC005, WC006): the grand hotel set back behind its drop-off - the loop round the
  // fountain island, the canopy and the doorman's door, the limousines - its café terrace; Monarch and Diamond & Co.
  // beside it, the Seaglass Spa; the Ritz's tennis court behind
  function ritz() {
    const x0 = 3205, hw = 40, x1 = BX.civic - 7;
    const front = Math.min(oceanN(x0), oceanN(x0 + hw)) - 1, hy = hillS(x0 + hw / 2) + 1;
    const hh = front - 16 - hy;   // (the drop-off: 16 rows in front)
    if (hh >= 16 && K.allFree(x0, hy, hw, hh)) {
      const b = K.building({ x: x0, y: hy, w: hw, h: hh, arch: 'hotel', key: 'hotel', name: 'The Bayside Ritz', poi: { kind: 'delivery', label: 'The Bayside Ritz' }, whole: true, door: x0 + hw / 2,
        art: { spec: { floors: 7, style: 'stone', wallColor: '#efe6d4', win: 'arch', cornice: 'dentil', parapet: 14, grime: 0.02, roofMat: 'paver', lip: 10, rimW: 5, balconies: true, blades: [], plaques: [] },
          shop: { kind: 'lobby', door: 'right', open: true, people: 3, sign: { text: 'THE BAYSIDE RITZ', bg: '#1e2a3a', fg: [236, 214, 150], lit: true }, awning: ['#1e3a5e', '#1e3a5e'] },
          kit: [['lounge', 100, 120], ['lounge', 150, 120], ['umb', 220, 120], ['umb', hw * TILE - 220, 120], ['palm', 60, 60], ['palm', hw * TILE - 60, 60], ['hvac', hw * TILE / 2, hh * TILE - 80], ['string', hw * TILE / 2, 100]] } });
      if (b) {
        used.add('The Bayside Ritz'); out.shops++;
        // the drop-off: the loop round the fountain island, the canopy, the cars waiting
        const dy0 = hy + hh, dy1 = front;
        K.fill(x0, dy0, hw, dy1 - dy0 + 1, T.PLAZA);
        const cx = x0 + hw / 2, cy = (dy0 + dy1) / 2 + 1;
        for (let y = dy0 + 2; y <= dy1; y++) for (let x = x0 + 4; x < x0 + hw - 4; x++) { const e = ((x + 0.5 - cx) / 15) ** 2 + ((y + 0.5 - cy) / 6.5) ** 2; if (e < 1) m.tiles[y * m.w + x] = e < 0.32 ? T.GRASS : T.LOT; }
        prop('fountain', cx, cy + 0.5, 30);
        for (const dx of [-5, 5]) prop('palm_a', cx + dx, cy, 10, { sp: 'royal', k: 1.2 });
        prop('canopy', cx, dy0 + 1.6, 0, { w: 200, d: 60, h: 52 });
        m.parking.push({ x: (cx - 9) * TILE, y: (dy0 + 3) * TILE, a: 0, model: 'limo' }, { x: (cx + 8) * TILE, y: (dy0 + 3) * TILE, a: 0 });
        for (const dx of [-17, 17]) prop('plamp', cx + dx, dy1 - 1, 6);
        // the café terrace on the west side of the drop-off
        for (let k = 0; k < 3; k++) { prop('cafetable', x0 + 2, dy0 + 3 + k * 3, 0); prop('umbrella_b', x0 + 2, dy0 + 2.9 + k * 3, 0); }
        (out.places ||= []).push({ name: 'The Bayside Ritz', x0, y0: hy, x1: x0 + hw, y1: front + 1 });
      }
    }
    // Monarch, Diamond & Co. and the spa on Ocean Drive east of the hotel, a gallery of boutiques
    const bx0 = x0 + hw + 2;
    K.row(bx0, x1, hillS(bx0) + 1, oceanN(bx0 + 20), (x, room, i) => {
      if (room < 6) return null;
      const L = [
        { w: 12, key: 'monarch', name: 'Monarch', look: '#e8e0d0', sign: ['#1a1a1a', [236, 214, 150]], store: 'clothes', poi: { kind: 'clothing', label: 'Monarch' } },
        { w: 11, key: 'diamond', name: 'Diamond & Co.', look: '#f0ece4', sign: ['#1e2a3a', [200, 220, 240]], store: 'pawn', poi: { kind: 'delivery', label: 'Diamond & Co.' } },
        { w: 16, key: 'rest2', name: 'Seaglass Spa', look: '#e4f0ec', sign: ['#2a6a6a', [240, 248, 244]], store: 'salon', poi: { kind: 'delivery', label: 'Seaglass Spa' }, garden: true },
      ][i];
      if (!L) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      const w = Math.min(room, L.w);
      used.add(L.name); out.shops++;
      return { w, depth: 14, arch: 'mixed', key: L.key, name: L.name, poi: L.poi, whole: true,
        art: { spec: { floors: 2, style: 'stone', wallColor: L.look, win: 'tall', cornice: 'dentil', parapet: 8, grime: 0.02, roofMat: L.garden ? 'green' : 'gravel', lip: 8, rimW: 4, blades: [], plaques: [] },
          shop: { kind: L.store, door: 'left', open: true, people: 2, sign: { text: L.name.toUpperCase(), bg: L.sign[0], fg: L.sign[1], lit: true }, awning: [L.sign[0], L.sign[0]] } } };
    });
  }

  // ===========================================================================================================
  // The Bayside Overlook on the clifftop across Ocean Drive from the hotel (WC005): the railed terrace at the cliff edge,
  // the domed gazebo, benches and lamps, the coin telescope; the stair down the cliff to the hidden cove, its sand, the
  // umbrellas and the snack hut's stand
  function overlook() {
    const x0 = 3200, x1 = 3300;
    // Café Belvedere at the cliff's edge west of the gardens, facing the sea over its terrace (placed before the
    // clifftop is taken)
    const cfx = 3204, cfw = 14;
    let cfS = 9999;
    for (let x = cfx; x < cfx + cfw; x++) cfS = Math.min(cfS, shoreS(x, oceanS(x)));
    const cafe = K.building({ x: cfx, y: cfS - 18, w: cfw, h: 8, arch: 'mixed', name: 'Café Belvedere', poi: { kind: 'coffee', label: 'Café Belvedere', food: true }, whole: true,
      art: { spec: { floors: 1, style: 'stone', wallColor: '#f2ead8', win: 'arch', cornice: 'dentil', parapet: 8, grime: 0.02, roofMat: 'deck', lip: 6, rimW: 4, blades: [], plaques: [] },
        shop: { kind: 'cafe', door: 'left', open: true, people: 2, sign: { text: 'CAFE BELVEDERE', bg: '#2a5a6a', fg: [244, 236, 214], lit: true }, awning: ['#2a5a6a', '#f0ece4'] } } });
    if (cafe) { used.add('Café Belvedere'); out.shops++; }
    for (let x = x0; x < x1; x++) {
      const yS = oceanS(x), sy = shoreS(x, yS);
      if (sy - yS < 6) continue;
      for (let y = yS; y < sy; y++) if (K.free(x, y) && mine(x, y)) K.take(x, y, 1, 1);
      // the terrace along the edge: paving, the rail at the cliff
      K.paint(x, sy - 5, 1, 4, T.PLAZA);
      if (x % 3 === 0) prop('rail', x, sy - 1.2, 0, { tx: 3 * TILE, ty: 0 });
      if (x % 10 === 4) prop('lamp', x + 0.5, sy - 4.4, 0);
      if (x % 12 === 8) prop('bench_m', x + 0.5, sy - 3.6, 0);
    }
    const gx = 3250, gs = shoreS(gx, oceanS(gx));
    prop('gazebo', gx, gs - 9, 30);
    prop('scope', gx + 8, gs - 2.2, 6); prop('scope', gx - 8, gs - 2.2, 6);
    for (let k = 0; k < 6; k++) prop('flowers_big', gx - 12 + k * 4.8, gs - 12, 0);
    prop('textsign', gx, oceanS(gx) + 1.4, 0, { text: 'BAYSIDE OVERLOOK', bg: '#1e3a5e', fg: [240, 236, 220], z: 30, sx: 1 });
    if (cafe) {
      // the café's terrace between it and the edge: tables under umbrellas, planters
      K.paint(cfx - 1, cfS - 10, cfw + 2, 5, T.PLAZA);
      for (let k = 0; k < 3; k++) { prop('cafetable', cfx + 2 + k * 4.5, cfS - 7.5, 0); prop(pick(['umbrella_b', 'umbrella_g'], rnd(k, cfS, 545)), cfx + 2 + k * 4.5, cfS - 7.6, 0); }
      for (const x of [cfx - 0.4, cfx + cfw + 0.4]) prop('planter_g', x, cfS - 8, 8);
    }
    // the gardens on the clifftop between the drive and the terrace: the walk down the middle from the drive to the
    // gazebo, royal palms along it, the fountain where the cross walk meets it, four parterres hedged round with their
    // flower beds, benches along the walks
    const ax = gx, yTop = Math.ceil(oceanS(ax)) + 1, yBot = gs - 13, my = Math.round((yTop + yBot) / 2);
    if (yBot - yTop >= 24) {
      K.paint(ax - 2, yTop, 4, yBot - yTop, T.PLAZA);
      K.paint(ax - 26, my - 1, 52, 2, T.PLAZA);
      K.paint(ax - 6, my - 4, 12, 8, T.PLAZA);
      prop('fountain', ax, my + 0.5, 30);
      for (let y = yTop + 3; y < yBot - 1; y += 6) if (Math.abs(y - my) > 6) for (const dx of [-3.4, 3.4]) prop('palm_a', ax + dx, y, 10, { sp: 'royal', k: 1.2 });
      for (let y = yTop + 6; y < yBot - 2; y += 12) if (Math.abs(y - my) > 6) for (const dx of [-2.6, 2.6]) prop('bench_m', ax + dx, y, 0);
      for (const [qx0, qx1] of [[ax - 24, ax - 6], [ax + 6, ax + 24]]) for (const [qy0, qy1] of [[yTop + 3, my - 3], [my + 3, yBot - 2]]) {
        if (qy1 - qy0 < 6) continue;
        prop('hedgerun', qx0, qy0, 0, { tx: (qx1 - qx0) * TILE, ty: 0, h: 14 }); prop('hedgerun', qx0, qy1, 0, { tx: (qx1 - qx0) * TILE, ty: 0, h: 14 });
        prop('hedgerun', qx0, qy0, 0, { tx: 0, ty: (qy1 - qy0) * TILE, h: 14 }); prop('hedgerun', qx1, qy0, 0, { tx: 0, ty: (qy1 - qy0) * TILE, h: 14 });
        for (let y = qy0 + 2; y < qy1 - 1; y += 3) for (let x = qx0 + 2; x < qx1 - 1; x += 3) prop(pick(['flowers_big', 'flowers_a', 'shrub_a'], rnd(x, y, 546)), x + 0.5, y + 0.5, 0);
        prop('tree_a', (qx0 + qx1) / 2, (qy0 + qy1) / 2, 10, { sp: 'cypress', k: 1.1 });
      }
      (out.places ||= []).push({ name: 'Overlook Gardens', x0: ax - 26, y0: yTop, x1: ax + 26, y1: yBot });
      // the lawns either side of the gardens: olives, palms and stone pines on a loose grid
      for (const [lx0, lx1] of [[x0 + 1, ax - 27], [ax + 27, x1 - 1]]) for (let gy = yTop + 2; gy < yBot - 4; gy += 7) for (let gx = lx0; gx < lx1 - 2; gx += 7) {
        const x = gx + Math.floor(rnd(gx, gy, 547) * 4), y = gy + Math.floor(rnd(gx, gy, 548) * 4), r = rnd(gx, gy, 549);
        if (x >= lx1 || tile(x, y) !== T.GRASS || m.bld[y * m.w + x] >= 0 || (cafe && x >= cfx - 2 && x < cfx + cfw + 2 && y >= cfS - 20)) continue;
        if (r < 0.4) prop('palm_a', x + 0.5, y + 0.5, 10, { sp: pick(['royal', 'date'], rnd(x, y, 550)), k: 1.15 });
        else if (r < 0.85) prop('tree_a', x + 0.5, y + 0.5, 10, { sp: pick(['olive', 'olive', 'cypress', 'magnolia'], rnd(x, y, 551)), k: 1.1 });
      }
    }
    // the cove below: the path down, sand along the water's edge, umbrellas, the stand
    const cx = 3176, cs = shoreS(cx, oceanS(cx));
    K.paint(cx - 1, oceanS(cx), 2, cs - oceanS(cx) - 3, T.PLAZA);
    for (let x = cx - 14; x < cx + 14; x++) { const s = shoreS(x, oceanS(x)); for (let y = s - 3; y < s; y++) if (tile(x, y) === T.GRASS || tile(x, y) === T.PLAZA) { m.tiles[y * m.w + x] = T.SAND; K.take(x, y, 1, 1); } }
    for (let k = 0; k < 4; k++) { prop(pick(['umbrella_r', 'umbrella_y', 'umbrella_b'], rnd(k, cx, 540)), cx - 10 + k * 6, shoreS(cx - 10 + k * 6, oceanS(cx)) - 1.8, 0); prop('towel', cx - 9 + k * 6, shoreS(cx - 9 + k * 6, oceanS(cx)) - 1.2, 0, { v: k }); }
    prop('stand', cx + 12, cs - 2.5, 10);
    (out.places ||= []).push({ name: 'Bayside Overlook', x0, y0: gs - 14, x1, y1: gs }, { name: 'Hidden Cove', x0: cx - 14, y0: cs - 4, x1: cx + 14, y1: cs + 1 });
  }

  // ===========================================================================================================
  // The ocean side: the villas behind their gates between Bayside Avenue and Hillcrest Drive (facing the drive), between
  // the drive and Ocean Drive (facing the boulevard), the clifftop villas on Ocean Drive's seaward side (their gardens to
  // the cliff), the walk along the edge
  function oceanSide() {
    const westOfHill = (x, y) => mine(x, y) && y <= oceanN(x);
    // west of Westside Avenue (the strip between Bayside Avenue and Ocean Drive)
    estates(2482, BX.westside - 6, bayS, 2790, westOfHill, { depth: 9, w: 14 });
    // Westside Avenue to Park West Avenue
    estates(BX.westside + 6, BX.parkWest - 7, bayS, 2800, westOfHill);
    // Park West Avenue to Harborview Avenue: north of Hillcrest Drive, then between it and Ocean Drive
    const northOfHill = (x, y) => mine(x, y) && y <= hillN(x);
    const between = (x, y) => mine(x, y) && y >= hillS(x) && y <= oceanN(x);
    for (const [a, b] of [[BX.parkWest + 7, BX.civic - 6], [BX.civic + 6, BX.harborview - 6]]) {
      estates(a, b, bayS, 2810, northOfHill);
      if (!(a < 3300 && b > 3205)) estates(a, b, 2780, 2900, between);
      else { estates(a, 3203, 2780, 2900, between); }
    }
    // Harborview Avenue to Marina Avenue: the villas north of Ocean Drive (under the Gulf Loop's deck the car park)
    estates(BX.harborview + 6, 3545, bayS, 2880, (x, y) => mine(x, y) && y <= oceanN(x));
    estates(3566, BX.marina - 6, bayS, 2840, (x, y) => mine(x, y) && y <= oceanN(x) && !underLoop(x, y));
    // the clifftop: villas facing the sea on Ocean Drive's seaward side, from Westside Avenue to the overlook and on
    const seaward = (x, y) => mine(x, y) && y >= oceanS(x) && y < shoreS(x, oceanS(x)) - 6;
    for (const [a, b] of [[2880, 2966], [2986, 3150], [3310, 3452], [3540, 3590]]) estates(a, b, 2800, 3000, seaward, { price: 110000 });
    // the walk along the cliff edge: the rail, lamps, benches
    for (let x = 2482; x < 3590; x++) {
      if (x >= 3200 && x < 3300) continue;
      const yS = oceanS(x), sy = shoreS(x, yS);
      if (sy - yS < 4 || !mine(x, sy - 1)) continue;
      for (let y = sy - 2; y < sy; y++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.PLAZA);
      if (x % 3 === 0 && tile(x, sy - 1) === T.PLAZA) prop('rail', x, sy - 0.4, 0, { tx: 3 * TILE, ty: 0 });
      if (x % 14 === 7) prop('lamp', x + 0.5, sy - 1.6, 0);
    }
  }
  // the Gulf Loop's deck over the east side: its ground (LOT)
  function underLoop(x, y) { for (let dx = -2; dx <= 2; dx++) if (tile(x + dx, y) === T.LOT) return true; return false; }

  // ===========================================================================================================
  // Marina Heights, the east shore north of Bayside Avenue (WC307): the Bayside Marina on the strait (finger piers with
  // the boats, the yacht club on the quay, the bait shop, the boat yard), villas along Marina Avenue, townhouses west of
  // the Gulf Loop facing the streets across
  function marinaHeights() {
    const mx0 = BX.marina + 7;   // (the avenue's pavement reaches + 6)
    // the marina: the quay along the shore from Fountain Avenue to Bayside Avenue, the yacht club and the bait shop on it
    const shoreE = (y) => { let x = mx0; while (x < 3800 && m.land[y * m.w + x]) x++; return x; };
    shopsOnQuay();
    for (let y = BY.fountain + 8; y < BY.bayside - 8; y++) {
      const sx = shoreE(y);
      for (let x = sx - 4; x < sx; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.PLAZA);
      if (y % 3 === 0) prop('rail', sx - 0.3, y, 0, { tx: 0, ty: 3 * TILE });
      if (y % 9 === 4) prop('lamp', sx - 1.4, y + 0.5, 0);
      if (y % 7 === 2) prop('bollard', sx - 0.6, y + 0.5, 5);
    }
    // the finger piers east into the strait, their fingers, the boats
    const isW = (x, y) => { const t = tile(x, y); return t === T.WATER || t === T.DEEP; };
    for (const py of [2608, 2632, 2656, 2680]) {
      const sx = shoreE(py + 1), len = 22;
      for (let x = sx; x < sx + len; x++) for (let y = py; y < py + 3; y++) if (isW(x, y)) m.set(x, y, T.DOCK);
      prop('lamp', sx + len - 1, py + 1.5, 0);
      for (let k = 4; k < len - 2; k += 5) for (const sd of [-1, 1]) {
        const fy = sd < 0 ? py - 2 : py + 3, fx = sx + k;
        if (isW(fx, fy) && isW(fx, fy + 1)) { m.set(fx, fy, T.DOCK); m.set(fx, fy + 1, T.DOCK); }
        const bx = fx + 2.2, by = sd < 0 ? py - 2.5 : py + 5.5, r = rnd(py + sd, k, 560);
        if (!isW(Math.floor(bx), Math.floor(by))) continue;
        if (r < 0.35) prop('sailboat', bx, by, 26, { a: 0, len: 112 + Math.floor(rnd(py, k, 561) * 3) * 12, sail: 0, c: Math.floor(rnd(k, py, 562) * 3) });
        else if (r < 0.6) prop('yacht', bx, by, 26, { a: 0 });
        else m.marina.push({ x: bx * TILE, y: by * TILE, a: 0, kind: r < 0.85 ? 'speedboat' : 'dinghy' });
      }
    }
    prop('textsign', shoreE(2620) - 2, 2620, 0, { text: 'BAYSIDE MARINA', bg: '#1e3a5e', fg: [240, 236, 220], z: 40, sx: 2 });
    // the marina's car park off Marina Avenue, the boat yard (the boatworks' shed and its roller doors, boats up on the
    // hard, timber, drums), palms along the quay
    const cpY = BY.fountain + 10, cpX1 = shoreE(cpY + 6) - 6;
    if (cpX1 - mx0 >= 12 && K.allFree(mx0, cpY, cpX1 - mx0, 12)) {
      K.fill(mx0, cpY, cpX1 - mx0, 12, T.LOT); K.take(mx0, cpY, cpX1 - mx0, 12);
      for (const ry of [cpY + 1, cpY + 7]) for (let sx = mx0 + 1; sx + 3 <= cpX1 - 1; sx += 3) { m.stalls.push({ x: sx * TILE, y: ry * TILE, w: 3 * TILE, h: 4 * TILE }); if (rnd(sx, ry, 580) < 0.55) m.parking.push({ x: (sx + 1.5) * TILE, y: (ry + 2) * TILE, a: ry === cpY + 1 ? -Math.PI / 2 : Math.PI / 2 }); }
      prop('lamp', mx0 + 0.8, cpY + 6, 0); prop('lamp', cpX1 - 0.8, cpY + 6, 0);
    }
    const byY = BY.fountain + 30, byX1 = shoreE(byY + 10) - 5;
    if (byX1 - mx0 >= 24 && K.allFree(mx0, byY, 16, 12)) {
      const bw = K.building({ x: mx0, y: byY, w: 16, h: 12, arch: 'warehouse', name: 'Bayside Boatworks', poi: { kind: 'delivery', label: 'Bayside Boatworks' }, whole: true,
        art: { spec: { floors: 2, style: 'corrugated', wallColor: '#e4e6e2', win: 'even', parapet: 6, grime: 0.12, roofMat: 'metal', lip: 6, rimW: 4, blades: [], plaques: [{ text: 'BOATWORKS', x: 20, v: 70, sx: 2, bg: '#1e3a5e', fg: [240, 236, 220], lit: true }], doors: [{ x: 30, w: 200, kind: 'roller', open: true, h: 70 }] }, noShop: true } });
      if (bw) {
        out.shops++;
        const yx0 = mx0 + 17, yx1 = Math.min(byX1, yx0 + 26);
        K.fill(yx0, byY, yx1 - yx0, 14, T.LOT); K.take(yx0, byY, yx1 - yx0, 14);
        // (the boats up on the hard in two rows, their keels on stands; the timber, the drums, the crates)
        prop('yacht', yx0 + 5, byY + 4.5, 26, { a: 0 }); prop('sailboat', yx0 + 6, byY + 10.5, 26, { a: 0, len: 124, sail: 0, c: 1 });
        prop('sailboat', yx0 + 15, byY + 4.5, 26, { a: 0, len: 112, sail: 0, c: 2 }); prop('yacht', yx0 + 16, byY + 10.5, 26, { a: 0 });
        for (const [t, dx, dy] of [['lumber', 2, 2], ['drum', 1.5, 9], ['drum', 2.5, 9.6], ['crates', yx1 - yx0 - 2, 3], ['pallet', yx1 - yx0 - 2, 11], ['lumber', yx1 - yx0 - 3, 7]]) prop(t, yx0 + dx, byY + dy, 10);
        prop('chainfence', yx0 + 0.2, byY + 13.8, 0, { tx: Math.round((yx1 - yx0 - 0.4) * TILE), ty: 0 });
      }
    }
    // the Marina Terrace: the seafood restaurant, the chandlery and the gelato bar facing south onto their terrace over
    // the piers - tables under umbrellas, lights strung across
    const tY1 = 2641, tX1 = shoreE(tY1) - 6;
    const terr = K.row(mx0, tX1, tY1 - 13, tY1, (x, room, i) => {
      const L = [
        { w: 14, name: 'Spinnaker', store: 'diner', look: '#f4f4f0', sign: ['#1e3a5e', [240, 236, 220]], poi: { kind: 'coffee', label: 'Spinnaker', food: true }, roof: 'deck' },
        { w: 11, name: 'Bayside Chandlery', store: 'mart', look: '#5a8aa0', sign: ['#f0ece4', [30, 58, 94]], poi: { kind: 'delivery', label: 'Bayside Chandlery' }, roof: 'tar' },
        { w: 8, name: 'Gelato al Porto', store: 'cafe', look: '#f3c8b8', sign: ['#e86a8a', [250, 246, 240]], poi: { kind: 'coffee', label: 'Gelato al Porto', food: true }, roof: 'tar' },
        { w: 10, name: 'Harbourmaster', store: 'mart', look: '#e8e4da', sign: ['#1e3a5e', [240, 236, 220]], poi: { kind: 'delivery', label: 'Harbourmaster' }, roof: 'tar' },
        { w: 11, name: 'Bayside Dive & Sail', store: 'mart', look: '#a8cce8', sign: ['#f2a03a', [30, 40, 60]], poi: { kind: 'delivery', label: 'Bayside Dive & Sail' }, roof: 'tar' },
      ][i];
      if (!L) return null;
      if (room < L.w) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      used.add(L.name); out.shops++;
      return { w: L.w, depth: 12, arch: 'mixed', name: L.name, poi: L.poi, whole: true,
        art: { spec: { floors: L.w >= 14 ? 2 : 1, style: L.store === 'mart' ? 'siding' : 'stucco', wallColor: L.look, win: 'tall', parapet: 6, grime: 0.03, roofMat: L.roof, lip: 6, rimW: 4, balconies: L.w >= 14, blades: [], plaques: [] },
          shop: { kind: L.store, door: 'left', open: true, people: 2, sign: { text: L.name.toUpperCase(), bg: L.sign[0], fg: L.sign[1], lit: true }, awning: [L.sign[0], '#f0ece4'] } } };
    });
    if (terr.some((b) => b && !b.gap)) {
      const ty0 = tY1 + 1, tx1 = Math.max(...terr.filter((b) => b && !b.gap).map((b) => b.tx + b.tw));
      K.fill(mx0, ty0, tx1 - mx0, 6, T.PLAZA);
      for (let x = mx0 + 2; x < tx1 - 2; x += 4) { prop('cafetable', x + 0.5, ty0 + 3, 0); prop(pick(['umbrella_b', 'umbrella_g', 'umbrella_y'], rnd(x, ty0, 590)), x + 0.5, ty0 + 2.9, 0); }
      prop('festoon', mx0 + 1, ty0 + 0.6, 0, { tx: Math.round((tx1 - mx0 - 2) * TILE), ty: 0, h: 70 });
      for (const x of [mx0 + 0.6, tx1 - 0.6]) prop('lamp', x, ty0 + 5.4, 0);
      (out.places ||= []).push({ name: 'Marina Terrace', x0: mx0, y0: tY1 - 13, x1: tx1, y1: ty0 + 6 });
    }
    for (let y = BY.fountain + 8; y < BY.bayside - 44; y += 8) prop('palm_a', shoreE(y) - 5.5, y + 0.5, 10, { sp: 'royal', k: 1.15 });
    (out.places ||= []).push({ name: 'Bayside Marina', x0: mx0, y0: BY.fountain, x1: 3800, y1: BY.bayside });
    // villas along Marina Avenue's east side north of the marina, and between the Loop and the avenue
    const east = (x, y) => mine(x, y) && x < shoreE(y) - 4;
    const between = (x, y) => mine(x, y) && !underLoop(x, y);
    // (east of Marina Avenue, over the strait: a deep block gets villas facing the street north of it too)
    for (const [y0, y1] of [[BY.lake + 6, BY.green - 6], [BY.green + 6, BY.falls - 6], [BY.falls + 6, BY.fountain - 6]]) {
      if (y1 - y0 >= 52) backEstates(mx0, 3790, y0, y1 - 30, east, { w: 16 });
      estates(mx0, 3790, y0, y1, east, { w: 16, depth: 10, price: 90000, maxDeep: y1 - y0 >= 52 ? Math.max(28, y1 - y0 - 32) : 40 });
    }
    for (const [y0, y1] of [[BY.lake + 6, BY.green - 6], [BY.green + 6, BY.cypress - 6], [BY.cypress + 6, BY.falls - 6], [BY.falls + 6, BY.fountain - 6], [BY.fountain + 6, 2644], [2656, BY.bayside - 7]]) {
      const d = y1 - y0;
      // (a deep block: villas facing the street north of it too, their gardens behind them; a shallower one: one row of
      // deep lots, the villa at the back of its grounds)
      if (y0 === BY.cypress + 6) backEstates(3566, BX.marina - 6, y0, y1, between, { w: 16, garden: d - 12 });   // (facing the lane, their gardens down to Falls Street)
      else {
        if (d >= 52) backEstates(3566, BX.marina - 6, y0, y1 - 30, between, { w: 16 });
        estates(3566, BX.marina - 6, y0, y1, between, { w: 15, depth: 10, maxDeep: d >= 52 ? Math.max(28, d - 32) : d + 1 });
      }
      if (d >= 30) townhouses(BX.harborview + 6, 3546, y0, y1 - (d >= 40 ? 26 : 19), true);
      townhouses(BX.harborview + 6, 3546, y0, y1);
    }
    function shopsOnQuay() {
      // the yacht club and the bait shop facing south onto Bayside Avenue's end of the quay, the boat yard beside them
      K.row(mx0, 3790, BY.bayside - 40, BY.bayside - 7, (x, room, i) => {
        if (room < 8) return null;
        if (i === 0) { used.add('Bayside Yacht Club'); out.shops++; return { w: Math.min(room, 20), depth: 14, arch: 'mixed', key: 'rest1', name: 'Bayside Yacht Club', poi: { kind: 'coffee', label: 'Bayside Yacht Club', food: true }, whole: true,
          art: { spec: { floors: 2, style: 'stucco', wallColor: '#f4f4f0', win: 'tall', parapet: 8, grime: 0.02, roofMat: 'deck', lip: 6, rimW: 4, balconies: true, blades: [], plaques: [] },
            shop: { kind: 'diner', door: 'left', open: true, people: 3, sign: { text: 'YACHT CLUB', bg: '#1e3a5e', fg: [236, 214, 150], lit: true }, awning: ['#1e3a5e', '#1e3a5e'] }, kit: [['umb', 80, 60], ['umb', 200, 60], ['table', 140, 80], ['lounge', 300, 70]] } }; }
        if (i === 1) { used.add('Marina Bait & Tackle'); out.shops++; return { w: Math.min(room, 9), depth: 10, arch: 'mixed', name: 'Marina Bait & Tackle', poi: { kind: 'tackle', label: 'Marina Bait & Tackle' }, whole: true,
          art: { spec: { floors: 1, style: 'siding', wallColor: '#5a8aa0', win: 'pair', parapet: 6, grime: 0.1, roofMat: 'tar', lip: 6, rimW: 4, blades: [], plaques: [] },
            shop: { kind: 'mart', door: 'right', open: true, people: 1, sign: { text: 'BAIT & TACKLE', bg: '#2e6a8a', fg: [250, 240, 200], lit: true }, awning: ['#2e6a8a', '#f0ece4'] } } }; }
        return null;
      });
    }
  }
  // townhouses facing south onto the street below (or north onto the street above: north): pastel fronts under tile
  // roofs, their stoops, a home each
  function townhouses(x0, x1, y0, y1, north = false) {
    K.row(x0, x1, y0, y1, (x, room) => {
      if (room < 6) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      const w = Math.min(room, 7 + Math.floor(rnd(x, y1, 570) * 3));
      out.homes++;
      return { w, depth: 11, arch: 'townhouse', name: 'Townhouse', poi: false, whole: true, home: { kind: 'house', price: 45000, slots: 2 }, ...(north ? { face: 'N' } : {}),
        art: { spec: { floors: 3, style: 'stucco', wallColor: pick(TOWN, rnd(x, y1, 571)), win: 'tall', pitch: 'gable', roof: 'tile', slope: 0.45, parapet: 4, grime: 0.05, balconies: rnd(x, y1, 572) < 0.5, blades: [], plaques: [] }, noShop: true, kit: [] } };
    }, north ? { north: true } : {});
  }

  // ===========================================================================================================
  // The Strand: the clifftop walk west of Westside Avenue, between Ocean Drive and the water - the lawn, the promenade
  // along the edge (palms, lamps, benches), the little plaza at the Gulf Footbridge's end
  function strand() {
    for (let x = 2470; x < BX.westside - 5; x++) {
      const yS = oceanS(x), sy = shoreS(x, yS);
      if (sy - yS < 3) continue;
      for (let y = yS; y < sy; y++) if (K.free(x, y) && mine(x, y)) K.take(x, y, 1, 1);
      for (let y = sy - 3; y < sy; y++) if (mine(x, y) && (tile(x, y) === T.GRASS)) m.tiles[y * m.w + x] = T.PLAZA;
      if (x % 3 === 0) prop('rail', x, sy - 0.4, 0, { tx: 3 * TILE, ty: 0 });
      if (x % 9 === 4) prop('palm_a', x + 0.5, sy - 4.2, 10, { sp: 'royal', k: 1.15 });
      if (x % 12 === 7) prop('lamp', x + 0.5, sy - 2.4, 0);
      if (x % 16 === 11) prop('bench_m', x + 0.5, sy - 1.8, 0);
    }
    (out.places ||= []).push({ name: 'The Strand', x0: 2470, y0: 2760, x1: BX.westside, y1: 2840 });
  }

  // ===========================================================================================================
  // The dressing: royal palms down Ocean Drive's median with lights strung between them, clear of the junctions
  function dressing() {
    const junctions = [BX.westside, BX.parkWest - 12, BX.civic, BX.harborview - 10, 2681, 2726, BX.marina];
    let last = null;
    for (let x = 2490; x < BX.marina - 8; x += 9) {
      if (junctions.some((c) => Math.abs(x - c) < 12)) { last = null; continue; }
      const y = oceanY(x + 0.5);
      prop('palm_a', x + 0.5, y + 0.5, 10, { sp: 'royal', k: 1.2 });
      if (last) prop('festoon', last[0] + 0.5, last[1] - 0.1, 0, { tx: Math.round((x - last[0]) * TILE), ty: Math.round((y - last[1]) * TILE), h: 70 });
      last = [x, y];
    }
  }
}
