// The Harbor, handcrafted (the World v3 Handcraft Plan; the owner's Midtown concepts of 2026-10-17, WC324-WC352, whose
// south half runs down to the water: WC328/333 Madison Court over a seawall promenade, WC334/340/344-352 the waterfront -
// the marina, the lighthouse, the seafood pier, the fish market's shed, the boat yard; and the catalogue's Harbor set,
// WC003/004/040/057/072/086/087/150/158/159). The mainland's waterfront below Midtown, Harbor Avenue to the water,
// Westside Avenue to the inlet under the Yards Bridge. West to east, room by room along the seawall promenade:
//   - the Marina (Westside Avenue to the Midtown Bridge): the Harbor Light on the corner of the seawall, the marina's
//     finger piers with the boats and the yachts, Harbor Marina's shop (the boats for sale), the Harbor Yacht Club, the
//     marina's car park off Marina Way, the Crescent Steps - terraced beds and a fountain opposite Crescent Gardens' gate;
//   - Harbor Green (between the bridges): the Commons carried on to the water - lawns, the Harbor Fountain on Linden
//     Walk's line, the walk down to Linden Pier (lamps, benches, the telescopes, fishing off its head), Pier House
//     Seafood's green roof on its deck over the water, the kiosk, the chess tables;
//   - the Fish Market quay and Ferry Plaza (the Civic Bridge to Civic Avenue): Dockside Fish Market's shed and its quay
//     (the fishing boats tied up, the fish tables, the ice, the crates), the Harbor Master's office and Ferry Square, the
//     plaza where the water bus calls (shared/world3-ferries.js builds the terminal on its shore), the taxis' turn;
//   - the Boatworks (Civic Avenue to Harborview Avenue): Dock Street's row (Ironside Army Surplus, the chandlery, The
//     Tidewater, Galley Diner, the sailors' flats), Harbor Boatworks' shed and its yard of boats on their cradles, the
//     slip, the Harbor Footbridge's landing;
//   - the Port (Harborview Avenue to the inlet): Portside Logistics and the warehouses on Dock Street, the container yard,
//     the quay along Harbor Drive, the truck depot on the inlet.
// Harbor Drive, the shore road, curves down from Ferry Plaza along the water to Stadium Avenue; Bridge Avenue and Main
// Avenue swing down to the two bridges (the skeleton's Midtown Bridge and Civic Bridge land where they did). Every
// building faces south (the camera); names and brands are invented; draws are fixed by place (hash2). The plan's frame:
// shared/world3-hand.js. The shore band the generator keeps for the waterfront (shared/map.js waterfrontStrip: reserve
// 4) is painted here directly - promenade in the west, quay in the east - the kit's own fills leave it alone.
import { TILE, T } from './constants.js';

const D = 8;   // the Harbor's district id (shared/mapcore.js DISTRICTS)
export const HY = { harbor: 1900, marina: 1952, lane: 1952, bosun: 1932, dock: 1962, quay: 2122 };
export const HX = { westside: 2860, bridge: 2988, main: 3184, civic: 3320, harborview: 3480, stadium: 3680, inlet: 3760, midBridge: 2977, civBridge: 3163, foot: 3350 };
const EXT = { ave: 7, st: 7, minor: 4 };
const PARK = 60, ST_W = 9;
// Harbor Drive: from Ferry Plaza (its turning circle) down along the water past the Boatworks to Harborview Avenue's
// foot, where the container terminal's fence begins; its line passes the Harbor Footbridge's landing (3350, 2020) close
// enough to meet it
const DRIVE = [[3290, 1988], [3320, 1988], [3336, 2003], [3350, 2016], [3376, 2026], [3410, 2033], [3445, 2041], [3480, 2050]];
const driveY = (x) => { for (let i = 1; i < DRIVE.length; i++) { const [ax, ay] = DRIVE[i - 1], [bx, by] = DRIVE[i]; if (x >= ax && x <= bx) return ay + (by - ay) * (x - ax) / (bx - ax); } return x < DRIVE[0][0] ? DRIVE[0][1] : DRIVE[DRIVE.length - 1][1]; };

function streets() {
  const S = [];
  const add = (name, kind, pts, o = {}) => S.push({ name, kind, pts, ...o });
  // the bridge approaches: Bridge Avenue and Main Avenue swing down from Harbor Avenue to where the bridges begin
  add('Bridge Avenue', 'ave', [[HX.bridge, HY.harbor], [HX.bridge, 1922], [2985, 1932], [2980, 1942], [HX.midBridge, 1952], [HX.midBridge, 1973]]);
  add('Main Avenue', 'ave', [[HX.main, HY.harbor], [HX.main, 1918], [3180, 1929], [3173, 1940], [3167, 1951], [3164, 1962], [HX.civBridge, 1975]]);
  add('Civic Avenue', 'ave', [[HX.civic, HY.harbor], [HX.civic, 1988]]);
  add('Harborview Avenue', 'ave', [[HX.harborview, HY.harbor], [HX.harborview, 2050]]);
  add('Stadium Avenue', 'ave', [[HX.stadium, HY.harbor], [HX.stadium, HY.dock]]);   // (down to the terminal's gate on Dock Street)
  add('Harbor Drive', 'ave', DRIVE, { culdesac: true });
  add('Dock Street', 'st', [[HX.civic, HY.dock], [HX.inlet, HY.dock]], { w: ST_W, park: PARK, culdesac: true });
  // Bosun Lane: the sailors' quarter's lane through the block behind Dock Street's row, its own row of houses, the pub
  // and the mission facing it
  add('Bosun Lane', 'minor', [[HX.civic, HY.bosun], [HX.harborview, HY.bosun]], { w: 5 });
  add('Marina Way', 'minor', [[HX.westside, HY.marina], [2914, HY.marina]], { w: 5, culdesac: true });
  add('Fish Market Lane', 'minor', [[HX.civic, HY.lane], [3232, HY.lane]], { w: 5, culdesac: true });
  return S;
}

export const HARBOR = {
  key: 'harbor', d: D, rect: [2860, 1900, 3800, 2120],
  streets,
  // the special businesses this plan places itself (shared/map.js SPECIALS of the Harbor: placeSpecials leaves them)
  specials: ['Portside Logistics', 'Dockside Fish Market', 'Harbor Marina (boats)', 'Ironside Army Surplus'],
  build,
};

// ---------------------------------------------------------------------------------------------------------------
const AWN = [['#2f6a5a', '#f0ece4'], ['#2a3e7a', '#e8e4dc'], ['#a8343a', '#f0ece4'], ['#3a3a44', '#e8e4dc'], ['#8a5a2a', '#efe6d0'], ['#2e6a8a', '#f0ece4']];
const SIGN = [['#1e3a5e', [240, 236, 220]], ['#2f6a4e', [240, 232, 200]], ['#f0ece4', [40, 60, 120]], ['#232838', [236, 214, 150]], ['#8a2a2e', [250, 230, 190]]];
const BRICK = ['#8e4a3c', '#7a3a30', '#6e4a38', '#5a3c30', '#a87e5a', '#7a2e2e', '#4a5a6a', '#3e6a5a'];
const PAINT = ['#d8d0bc', '#c8c4b4', '#b8c4c8', '#d4c8a8', '#9aaab4', '#c8b494'];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const W = m.w;
  const mine = (x, y) => m.inside(x, y) && m.dist[m.idx(x, y)] === D && m.land[m.idx(x, y)];
  const isW = (x, y) => { if (!m.inside(x, y)) return false; const t = m.tiles[m.idx(x, y)]; return t === T.WATER || t === T.DEEP; };
  // the shore at a column: the first water south of y0 (tiles), or null
  const shoreY = (x, y0 = 1960, y1 = 2130) => { for (let y = y0; y < y1; y++) if (isW(x, y)) return y; return null; };
  // the shore band the generator kept (reserve 4, inside this plan, the Harbor's): paint it t - the promenade's paving, the quay's
  const band = (x0, x1, t, deep = 0) => {
    for (let x = x0; x < x1; x++) {
      const sy = shoreY(x);
      if (sy === null) continue;
      for (let y = sy - 1; y > sy - 12; y--) {
        if (!mine(x, y)) break;
        const i = m.idx(x, y), c = m.tiles[i];
        if (c === T.ROAD || c === T.SIDEWALK || c === T.BRIDGE || c === T.BUILDING || m.bld[i] >= 0) break;
        if (!(m.reserve[i] & 4) && y < sy - deep) break;
        if (c === T.GRASS || c === T.LOT || c === T.PLAZA || c === T.SAND || c === T.DIRT) { m.tiles[i] = t; K.take(x, y, 1, 1); }
      }
    }
  };
  // a building placed whole on any open ground the plan made (over the kit's free check: a deck over the water, the band)
  const raw = (o) => { const b = api.handBuilding(m, { d: D, ...o }); if (b && o.home) out.homes++; if (b && o.poi) out.shops++; return b; };
  // a timber deck over the water: [x0, x1) x [y0, y1], only where it's water (or the band's paving), lamps at its corners
  const deck = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (!m.inside(x, y)) continue; const i = m.idx(x, y), c = m.tiles[i]; if (isW(x, y) || ((c === T.PLAZA || c === T.LOT) && m.bld[i] < 0)) { m.tiles[i] = T.DOCK; K.take(x, y, 1, 1); } } };
  // a shop's look: a low brick or painted front, its sign and awning
  const shopArt = (x, y, o) => {
    const brick = o.brick ?? rnd(x, y, 1) < 0.6;
    const f = brick ? { style: 'brick', brickTone: o.tone || pick(BRICK, rnd(x, y, 2)) } : { style: o.style || 'stucco', wallColor: o.wall || pick(PAINT, rnd(x, y, 3)) };
    const [bg, fg] = o.sign || pick(SIGN, rnd(x, y, 4));
    return { spec: { floors: o.floors ?? 2, ...f, win: o.win || pick(['even', 'pair', 'tall', 'loft'], rnd(x, y, 5)), cornice: o.cornice ?? pick(['bracket', 'dentil', 'step', null], rnd(x, y, 6)), parapet: 8, grime: o.grime ?? 0.18 + rnd(x, y, 7) * 0.15, roofMat: pick(['tar', 'gravel', 'membrane', 'rubber'], rnd(x, y, 8)), lip: 10, rimW: 4, ...(o.spec || {}) },
      shop: { kind: o.store || 'mart', door: o.door || (rnd(x, y, 9) < 0.5 ? 'left' : 'right'), open: true, people: o.people ?? 2, sign: { text: (o.signText || o.name).toUpperCase().slice(0, 18), bg, fg, lit: true }, awning: o.awning === undefined ? pick(AWN, rnd(x, y, 10)) : o.awning, ...(o.grille ? { grille: true } : {}) } };
  };
  const flat = (x, y, floors, o = {}) => ({ arch: 'walkup', art: { spec: { floors, style: 'brick', brickTone: pick(BRICK, rnd(x, y, 20)), win: pick(['even', 'pair', 'tall'], rnd(x, y, 21)), cornice: pick(['bracket', 'dentil', null], rnd(x, y, 22)), parapet: 8, grime: o.grime ?? 0.25, fireEscape: floors >= 3 ? [60, 50] : null, roofMat: 'tar', lip: 10, rimW: 4 }, noShop: true }, home: { kind: 'apartment' }, whole: true });

  // ===========================================================================================================
  // The Marina: Westside Avenue to the Midtown Bridge
  marina(K, m, { band, deck, raw, shopArt, out, shoreY, isW, mine });
  // Harbor Green: the Midtown Bridge to the Civic Bridge
  harborGreen(K, m, { band, deck, raw, out, shoreY, isW, mine });
  // the Fish Market quay, the Harbor Master, Ferry Square and Ferry Plaza: the Civic Bridge to Civic Avenue
  fishQuay(K, m, { band, deck, raw, shopArt, out, shoreY, isW, mine });
  // the Boatworks: Civic Avenue to Harborview Avenue
  boatworks(K, m, { band, deck, raw, shopArt, flat, out, shoreY, isW, mine });
  // the Port: Harborview Avenue to the inlet
  port(K, m, { band, deck, raw, shopArt, out, shoreY, isW, mine });
  // what the plan left open in its area: lawn, trees and shrubs (else the kit's seal paves it) - palms near the water,
  // plane trees and maples inland, fewer in the port
  K.landscape({ tree: (x, y, r) => {
    const sy = shoreY(x, y, y + 16);
    if (x > HX.harborview && r < 0.6) return null;
    if (sy !== null) return r < 0.8 ? ['palm_a', K.pick(['royal', 'coconut', 'royal'], K.rnd(x, y, 810)), 1.1 + K.rnd(x, y, 811) * 0.3] : ['shrub_a', null, 1];
    return r < 0.82 ? [K.rnd(x, y, 812) < 0.5 ? 'tree_a' : 'tree_b', K.pick(['streetPl', 'maple', 'oak', 'magnolia', 'streetPl'], K.rnd(x, y, 813)), 1.05 + K.rnd(x, y, 814) * 0.25] : [K.pick(['shrub_a', 'bush_c', 'flowers_big'], K.rnd(x, y, 815)), null, 1];
  } });
  // the streets' trees, lamps and kerbside parking; Harbor Avenue's palms on both pavements
  dressing(K, m, out);
  void W; void pick; void prop;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The seawall promenade along a stretch of the shore (x0..x1): the paving from the water's edge back `deep` tiles, the
// rail along the edge, royal palms in a row with lights strung between them, benches looking out, lamps, the telescopes
// now and then, a life ring by the steps
function promenade(K, m, ctx, x0, x1, deep = 7, o = {}) {
  const { prop, rnd } = K;
  const { shoreY, mine } = ctx;
  ctx.band(x0, x1, T.PLAZA, deep);
  let last = null;
  for (let x = x0; x < x1; x++) {
    const sy = shoreY(x);
    if (sy === null || !mine(x, sy - 1)) { last = null; continue; }
    // (the paving back from the water, as deep as the plan has left it open)
    for (let y = sy - 1; y >= sy - deep; y--) if (K.free(x, y)) K.fill(x, y, 1, 1, T.PLAZA); else if (!mine(x, y) || m.tiles[m.idx(x, y)] !== T.PLAZA) break;
    if (x % 3 === 0) prop('rail', x, sy - 0.25, 0, { tx: 3 * TILE, ty: 0 });   // (along the edge: the seawall's railing)
    if (o.palms !== false && x % 8 === 4 && m.tiles[m.idx(x, sy - 5)] === T.PLAZA) {
      prop('palm_a', x + 0.5, sy - 4.6, 10, { sp: 'royal', k: 1.2 });
      if (last !== null && x - last <= 8) prop('festoon', last + 0.5, sy - 5.2, 0, { tx: Math.round((x - last) * TILE), ty: 0, h: 64 });
      last = x;
    } else if (x % 8 === 4) last = null;
    if (x % 12 === 8) prop('bench_m', x + 0.5, sy - 2.2, 0);
    else if (x % 12 === 2) prop('lamp', x + 0.5, sy - 1.5, 0);
    else if (x % 31 === 17 && rnd(x, sy, 1) < 0.7) prop('scope', x + 0.5, sy - 1.4, 6);
    else if (x % 29 === 11) prop('lifering', x + 0.5, sy - 1.3, 0, { a: Math.PI / 2 });
  }
}

// The Marina (WC340, WC344, WC348, WC352): the seawall, the Harbor Light on its corner, the finger piers and the boats,
// Harbor Marina's shop, the Yacht Club's terrace on the water, the car park, the Crescent Steps
function marina(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { raw, shopArt, shoreY, isW } = ctx;
  const x0 = HX.westside + EXT.ave + 1, x1 = 2970;
  // the Crescent Steps (WC348): opposite Crescent Gardens' gate (Garden Crescent's middle, 2924), the gardens stepping
  // down from Harbor Avenue to Marina Way - the top terrace paved round a fountain; below it terraces of flower beds,
  // each behind its low hedge, a paved walk along each terrace; the steps down the middle; palms at the corners
  {
    const sx0 = 2906, sx1 = 2944, sy0 = 1908, sy1 = HY.marina - EXT.minor - 1;
    const cx = 2924.5, top = sy0 + 13;
    K.fill(sx0, sy0, sx1 - sx0, top - sy0, T.PLAZA);
    prop('fountain', cx, sy0 + 7, 36);
    for (const [dx, dy] of [[-6, -3], [6, -3], [-6, 3.6], [6, 3.6]]) prop('pbench', cx + dx, sy0 + 7 + dy, 0);
    for (const [px, py] of [[sx0 + 4, sy0 + 3], [sx1 - 4, sy0 + 3]]) prop('planter_fl', px, py, 8);
    // (the terraces: four tiles of bed, two of walk; the steps six tiles wide down the middle, all paved)
    for (let y = top; y <= sy1; y++) {
      const t = (y - top) % 6, walk = t >= 4 || y >= sy1 - 1;
      for (let x = sx0; x < sx1; x++) K.fill(x, y, 1, 1, walk || Math.abs(x + 0.5 - cx) < 3.5 || x === sx0 || x === sx1 - 1 ? T.PLAZA : T.GRASS);
    }
    for (let ty = top; ty + 4 <= sy1 - 1; ty += 6) {
      for (const [bx0, bx1] of [[sx0 + 1, cx - 3.5], [cx + 3.5, sx1 - 1]]) {
        prop('hedgerun', bx0 + 0.1, ty + 3.8, 0, { tx: Math.round((bx1 - bx0 - 0.2) * TILE), ty: 0, h: 14 });
        for (let fx = bx0 + 1.5; fx < bx1 - 0.5; fx += 2.4) prop(pick(['flowers_big', 'flowers_a', 'flowers_big', 'shrub_a'], rnd(Math.floor(fx * 3), ty, 1)), fx, ty + 1.4 + ((Math.floor(fx) & 1) ? 1 : 0), 0);
      }
      prop('lamp', cx - 3.2, ty + 4.6, 0); prop('lamp', cx + 3.2, ty + 4.6, 0);
    }
    for (const [px, py] of [[sx0 + 1.5, sy0 + 1.5], [sx1 - 1.5, sy0 + 1.5], [sx0 + 1.5, sy1 - 0.5], [sx1 - 1.5, sy1 - 0.5]]) prop('palm_a', px, py, 10, { sp: 'royal', k: 1.15 });
    prop('textsign', cx, sy1 - 0.6, 0, { text: 'CRESCENT STEPS', bg: '#2f5a4a', fg: [240, 232, 200], z: 28, sx: 1 });
    (ctx.out.places ||= []).push({ name: 'Crescent Steps', x0: sx0, y0: sy0, x1: sx1, y1: sy1 });
  }
  // north of Marina Way, west of the steps: the Marina Lawn (palms, picnic tables); east of them the marina's car park
  {
    // (its trees: landscape(); royal palms along Harbor Avenue and Marina Way, the picnic tables in the middle)
    for (let tx = x0 + 3; tx < 2904; tx += 6) { prop('palm_a', tx + 0.5, 1910, 10, { sp: 'royal', k: 1.15 }); prop('palm_a', tx + 0.5, HY.marina - EXT.minor - 1.6, 10, { sp: 'royal', k: 1.1 }); K.take(tx, 1909, 1, 2); K.take(tx, HY.marina - EXT.minor - 3, 1, 2); }
    for (const [px, py] of [[x0 + 8, 1925], [x0 + 20, 1934], [x0 + 30, 1922]]) { prop('picnic', px, py, 0); K.take(Math.floor(px) - 2, Math.floor(py) - 2, 5, 5); }
    const px0 = 2946, px1 = x1 - 2, py0 = 1910, py1 = HY.marina - EXT.minor - 1;
    K.fill(px0, py0, px1 - px0, py1 - py0 + 1, T.LOT); K.take(px0, py0, px1 - px0, py1 - py0 + 1);
    for (const ry of [py0 + 2, py1 - 5]) for (let sx = px0 + 1; sx + 3 <= px1 - 1; sx += 3) {
      // (a bay only where the lot is: the bridge approach's pavement curves across its east end)
      let ok = true; for (let yy = ry; yy < ry + 4 && ok; yy++) for (let xx = sx; xx < sx + 3; xx++) if (!m.inside(xx, yy) || m.tiles[m.idx(xx, yy)] !== T.LOT) { ok = false; break; }
      if (!ok) continue;
      m.stalls.push({ x: sx * TILE, y: ry * TILE, w: 3 * TILE, h: 4 * TILE }); m.parking.push({ x: (sx + 1.5) * TILE, y: (ry + 2) * TILE, a: ry === py0 + 2 ? -Math.PI / 2 : Math.PI / 2 });
    }
    prop('chainfence', px0 + 0.2, py0 + 0.2, 0, { tx: (px1 - px0 - 0.4) * TILE, ty: 0 });
    prop('textsign', px0 + 4, py1 - 0.8, 0, { text: 'MARINA PARKING', bg: '#1e3a5e', fg: [250, 250, 240], z: 34, sx: 1 });
    prop('lamp', px0 + 0.8, py1 - 1, 0);
  }
  // south of Marina Way, by the water: the Harbor Light on the seawall's corner and its little lawn; Harbor Marina, the
  // boat shop (the boats for sale: shared/map.js SPECIALS 'Harbor Marina (boats)' - its counter; its hire dock is laid
  // by the water in front of it, map.js 'Harbor Boat & Jet Ski Hire'); the Yacht Club; the promenade
  {
    const ly = shoreY(2871) || 2005;
    const lx = 2868, lyy = Math.min(ly, shoreY(2874) || ly) - 6;
    K.fill(x0, HY.marina + EXT.minor + 1, 2896 - x0, lyy + 6 - (HY.marina + EXT.minor + 1), T.GRASS);
    const lh = raw({ x: lx, y: lyy, w: 4, h: 4, key: 'lighthouse', arch: 'lighthouse', name: 'Harbor Light', poi: false, whole: true });
    if (lh) { K.take(lx, lyy, 4, 4); (m.landmarks ||= []).push({ name: 'Harbor Light', type: 'lighthouse', x: (lx - 6) * TILE, y: (lyy - 8) * TILE, w: 16 * TILE, h: 16 * TILE }); }
    for (const [px, py, sp] of [[lx - 0.5, lyy - 4, 'coconut'], [lx + 7, lyy - 6, 'royal'], [lx + 10, lyy + 2, 'coconut'], [lx + 3, lyy - 10, 'royal']]) if (K.free(Math.floor(px), Math.floor(py))) prop('palm_a', px, py, 10, { sp, k: 1.25 });
    for (const [px, py] of [[lx + 6, lyy + 3.5], [lx - 2, lyy + 2]]) prop('bench_m', px, py, 0);
    prop('flowers_big', lx + 5, lyy - 1, 0); prop('flowers_a', lx - 2, lyy - 2, 0);
    const bx = 2898, bw = 24, by = (shoreY(2910) || 1995) - 18;
    K.fill(bx - 2, HY.marina + EXT.minor + 1, bw + 4, by - (HY.marina + EXT.minor + 1), T.GRASS);
    for (let y = HY.marina + EXT.minor + 1; y < by; y++) K.paint(bx + 3, y, 3, 1, T.PLAZA);   // (the path from Marina Way to the shop's side)
    const shop = K.allFree(bx, by, bw, 11) ? raw({ x: bx, y: by, w: bw, h: 11, arch: 'mixed', name: 'Harbor Marina', poi: { kind: 'marina', label: 'Harbor Marina (boats)' }, whole: true,
      art: shopArt(bx, by, { name: 'Harbor Marina', brick: false, wall: '#e8e6de', floors: 2, store: 'lobby', awning: ['#2e6a8a', '#f0ece4'], sign: ['#1e3a5e', [240, 236, 220]], win: 'tall', cornice: null }) }) : null;
    if (shop) K.take(bx, by, bw, 11);
    // the Yacht Club: white, two floors, its restaurant's terrace out on a deck over the water
    const yx = 2928, yw = 22, yy = (shoreY(2940) || 1990) - 16;
    K.fill(yx - 2, HY.marina + EXT.minor + 1, yw + 4, yy - (HY.marina + EXT.minor + 1), T.GRASS);
    for (let y = HY.marina + EXT.minor + 1; y < yy; y++) K.paint(yx + yw - 6, y, 3, 1, T.PLAZA);
    const yc = raw({ x: yx, y: yy, w: yw, h: 10, arch: 'mixed', key: 'rest1', name: 'Harbor Yacht Club', poi: { kind: 'coffee', label: 'Harbor Yacht Club', food: true }, whole: true,
      art: shopArt(yx, yy, { name: 'Harbor Yacht Club', signText: 'YACHT CLUB', brick: false, wall: '#eeeae0', floors: 2, store: 'diner', awning: ['#1e3a5e', '#1e3a5e'], sign: ['#1e3a5e', [236, 214, 150]], win: 'tall', cornice: 'dentil', spec: { balconies: true } }) });
    if (yc) K.take(yx, yy, yw, 10);
    // its terrace: tables under umbrellas between the club and the water, festoon lights over them
    for (let k = 0; k < 5; k++) { const tx = yx + 2 + k * 4.4, ty = yy + 12.5; prop('cafetable', tx, ty, 0); prop(k % 2 ? 'umbrella_b' : 'umbrella_g', tx, ty - 0.1, 0); }
    prop('festoon', yx + 1, yy + 11.4, 0, { tx: Math.round((yw - 2) * TILE), ty: 0, h: 44 });
  }
  promenade(K, m, ctx, x0, x1, 7);
  // the marina: four finger piers south from the seawall, short fingers off them, the boats in the berths (motorboats and
  // jet skis you can take: m.marina; the yachts and the sailboats moored for the look: static props)
  const piers = [2886, 2906, 2926, 2946];
  for (const [n, px] of piers.entries()) {
    const sy = shoreY(px + 1);
    if (sy === null) continue;
    const len = n === 1 || n === 2 ? 30 : 24;
    ctx.deck(px, sy, px + 3, sy + len);
    prop('lamp', px + 1.5, sy + len - 1, 0);
    for (let k = 4; k < len - 2; k += 5) {
      // the fingers: two tiles out either side
      for (const sd of [-1, 1]) {
        const fx = sd < 0 ? px - 2 : px + 3;
        if (isW(fx, sy + k) && isW(fx + 1, sy + k)) { m.set(fx, sy + k, T.DOCK); m.set(fx + 1, sy + k, T.DOCK); }
        const bx = sd < 0 ? px - 2.5 : px + 5.5, by = sy + k + 2.6, r = rnd(px + sd, k, 30);
        if (!isW(Math.floor(bx), Math.floor(by))) continue;
        if (r < 0.32) prop('sailboat', bx, by, 26, { a: Math.PI / 2, len: 112 + Math.floor(rnd(px, k, 31) * 3) * 12, sail: 0, c: Math.floor(rnd(k, px, 32) * 3) });   // (moored: the sails furled)
        else if (r < 0.52) prop('yacht', bx, by, 26, { a: Math.PI / 2 });
        else m.marina.push({ x: bx * TILE, y: by * TILE, a: Math.PI / 2, kind: r < 0.8 ? 'speedboat' : 'dinghy' });
      }
    }
  }
  // the hire dock's jet skis at the westmost pier's head
  { const px = piers[0], sy = shoreY(px + 1); if (sy !== null) for (let k = 0; k < 3; k++) m.marina.push({ x: (px + 4.2) * TILE, y: (sy + 2 + k * 2.4) * TILE, a: 0, kind: 'jetski' }); }
  prop('textsign', 2916, (shoreY(2916) || 1996) - 2.6, 0, { text: 'HARBOR MARINA', bg: '#1e3a5e', fg: [240, 236, 220], z: 40, sx: 2 });
  (ctx.out.places ||= []).push({ name: 'Harbor Marina', x0: 2880, y0: 1960, x1: 2965, y1: 2020 }, { name: 'Harbor Light', x0: 2864, y0: 1980, x1: 2884, y1: 2000 });
}

// Harbor Green (WC345/346/349/350: the park carried on to the seawall below the Commons): lawns either side of Linden
// Walk's line, the Harbor Fountain on it, the walk on down to Linden Pier; Pier House Seafood's green roof on its deck; the
// kiosk, the chess tables, plane trees and palms, beds, benches, lamps
function harborGreen(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { shoreY, raw, deck } = ctx;
  const x0 = 2986, x1 = 3160, y0 = 1908;
  const LX = 3048.5;
  // the ground: lawn where the plan's left it open (the approaches' pavements bound it), the paths after
  let n = 0;
  for (let y = y0; y < 1996; y++) for (let x = x0; x < x1; x++) if (K.free(x, y) && m.dist[m.idx(x, y)] === D) { K.fill(x, y, 1, 1, T.GRASS); n++; }
  if (n < 400) return;
  const pave = (x, y) => { if (m.inside(x, y) && m.tiles[m.idx(x, y)] === T.GRASS && m.dist[m.idx(x, y)] === D) m.tiles[m.idx(x, y)] = T.PLAZA; };
  const path = (pts, wd = 3) => { for (let j = 1; j < pts.length; j++) { const [ax, ay] = pts[j - 1], [bx, by] = pts[j], k = Math.ceil(Math.hypot(bx - ax, by - ay) * 2); for (let i = 0; i <= k; i++) { const px = ax + (bx - ax) * i / k, py = ay + (by - ay) * i / k; for (let dy = -wd / 2; dy < wd / 2; dy += 0.5) for (let dx = -wd / 2; dx < wd / 2; dx += 0.5) pave(Math.floor(px + dx), Math.floor(py + dy)); } } };
  const sy = shoreY(3048) || 1992;
  // the walk on Linden Walk's line from Harbor Avenue to the water; the fountain plaza on it; the paths to the corners
  path([[LX, y0], [LX, sy]], 5);
  const F = [LX, 1934];
  for (let ty = F[1] - 9; ty <= F[1] + 9; ty++) for (let tx = Math.floor(F[0] - 11); tx <= F[0] + 11; tx++) if (((tx + 0.5 - F[0]) / 10.5) ** 2 + ((ty + 0.5 - F[1]) / 8.5) ** 2 <= 1) pave(tx, ty);
  path([[F[0], F[1]], [3005, 1975]], 3); path([[F[0], F[1]], [3125, 1972]], 3); path([[3000, 1915], [F[0] - 9, F[1] - 3]], 3); path([[3150, 1915], [F[0] + 9, F[1] - 3]], 3);
  prop('fountain', F[0], F[1], 36);
  for (const [dx, dy] of [[-6, -3.4], [6, -3.4], [-6.5, 3.8], [6.5, 3.8]]) prop('pbench', F[0] + dx, F[1] + dy, 0);
  for (const [dx, dy] of [[-9.5, 0], [9.5, 0]]) prop('flowers_big', F[0] + dx, F[1] + dy, 0);
  m.squares ||= []; m.squares.push({ x: Math.round(F[0]) - 6, y: F[1] - 5, w: 12, h: 10, name: 'Harbor Fountain' });
  // the chess tables under the trees west of the fountain (server/systems/activities.js 'chess')
  for (const [tx, ty] of [[F[0] - 20, F[1] - 2], [F[0] - 20, F[1] + 5]]) { pave(Math.floor(tx) - 1, Math.floor(ty)); pave(Math.floor(tx), Math.floor(ty)); pave(Math.floor(tx) + 1, Math.floor(ty)); prop('cafetable', tx, ty, 0, { chess: 1, seat: 27 }); prop('chair', tx - 0.9, ty + 0.1, 0, { v: 2, a: 0 }); prop('chair', tx + 0.9, ty + 0.1, 0, { v: 2, a: 3.1416 }); }
  // the kiosk by the walk, its tables; the bike hire
  {
    const kx = 3060, ky = 1956;
    if (K.allFree(kx, ky, 8, 5)) {
      K.building({ x: kx, y: ky, w: 8, h: 5, arch: 'snackbar', key: 'rest2', name: 'Green Kiosk', poi: { kind: 'coffee', label: 'Green Kiosk' }, whole: true });
      for (let k = 0; k < 3; k++) { prop('cafetable', kx + 1.5 + k * 2.6, ky + 7, 0); prop(k % 2 ? 'umbrella_y' : 'umbrella_g', kx + 1.5 + k * 2.6, ky + 6.9, 0); }
      for (let yy = ky + 5; yy < ky + 9; yy++) for (let xx = kx; xx < kx + 9; xx++) pave(xx, yy);
    }
    prop('bikerack', LX - 4.5, 1962, 0); prop('bikerack', LX - 4.5, 1964, 0);
    prop('textsign', LX - 4.5, 1960, 0, { text: 'BIKE HIRE', bg: '#2f6a8a', fg: [240, 236, 220], z: 30, sx: 1 });
  }
  // the trees: plane trees by the walk, maples and oaks in groves, palms toward the water, a magnolia by the fountain
  const clear = (tx, ty, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!m.inside(tx + dx, ty + dy) || m.tiles[m.idx(tx + dx, ty + dy)] !== T.GRASS) return false; return true; };
  for (let ty = y0 + 2; ty < sy - 6; ty += 4) for (let tx = x0 + 2; tx < x1 - 2; tx += 4) {
    const jx = tx + Math.floor(rnd(tx, ty, 50) * 3), jy = ty + Math.floor(rnd(tx, ty, 51) * 3);
    if (rnd(tx, ty, 52) < 0.45 || !clear(jx, jy, 1)) continue;
    const nearWater = sy - jy < 22, nearWalk = Math.abs(jx - LX) < 7;
    const sp = nearWater ? pick(['royal', 'coconut', 'royal'], rnd(jx, jy, 53)) : nearWalk ? 'streetPl' : pick(['maple', 'oak', 'streetPl', 'magnolia', 'cherry'], rnd(jx, jy, 54));
    prop(sp === 'royal' || sp === 'coconut' ? 'palm_a' : rnd(jx, jy, 55) < 0.5 ? 'tree_a' : 'tree_b', jx + 0.5, jy + 0.5, sp === 'royal' || sp === 'coconut' ? 10 : 12, { sp, k: 1.1 + rnd(jx, jy, 56) * 0.3 });
    if (rnd(jx, jy, 57) < 0.1) prop(pick(['flowers_big', 'flowers_a', 'shrub_a'], rnd(jx, jy, 58)), jx + 2, jy + 1.5, 0);
  }
  // lamps and benches along the paths
  for (let ty = y0 + 1; ty < sy; ty += 3) for (let tx = x0 + 1; tx < x1 - 1; tx += 3) {
    if (!m.inside(tx, ty) || m.tiles[m.idx(tx, ty)] !== T.PLAZA || rnd(tx, ty, 60) > 0.12 || Math.hypot(tx - F[0], ty - F[1]) < 12) continue;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (m.inside(tx + dx, ty + dy) && m.tiles[m.idx(tx + dx, ty + dy)] === T.GRASS) { prop(rnd(tx, ty, 61) < 0.4 ? 'lamp' : 'bench_m', tx + dx + 0.5, ty + dy + 0.5, 0); break; }
  }
  // the seawall promenade
  promenade(K, m, ctx, x0, x1, 7);
  // Linden Pier, on the walk's line: out over the water, its head wider - lamps down it, benches, the telescopes, the
  // rods of the people fishing off its end, life rings; steps down to a landing stage at its foot (WC345)
  {
    const px = 3047, len = 30, py = sy;
    deck(px, py, px + 4, py + len);
    deck(px - 6, py + len - 5, px + 10, py + len);
    for (let k = 5; k < len - 5; k += 6) { prop('lamp', px - 0.1, py + k, 0); prop('lamp', px + 4.1, py + k + 3, 0); }
    for (const dx of [-5, 9]) prop('bench_m', px + dx, py + len - 3, 0);
    prop('scope', px - 4, py + len - 1.2, 6); prop('scope', px + 8, py + len - 1.2, 6);
    for (const dx of [-3, 1, 5]) prop('rods', px + dx, py + len - 0.6, 0, { a: Math.PI / 2 });
    prop('lifering', px - 6.2, py + len - 2.5, 0, { a: Math.PI }); prop('lifering', px + 10.2, py + len - 2.5, 0, { a: 0 });
    prop('pierrail', px - 6, py + len - 0.2, 0, { len: 16 * TILE, a: 0 });
    prop('textsign', px + 2, py + 1.8, 0, { text: 'LINDEN PIER', bg: '#2f5a4a', fg: [240, 232, 200], z: 30, sx: 1 });
    (ctx.out.places ||= []).push({ name: 'Linden Pier', x0: px - 6, y0: py, x1: px + 10, y1: py + len });
  }
  // Pier House Seafood (WC344/346/352): its green hip roof on a deck over the water east of the pier, the tables round it
  // under umbrellas and strings of lights; boats tied up along the deck's end
  {
    const dx0 = 3070, dx1 = 3110, dsy = Math.max(shoreY(3070) || sy, shoreY(3110) || sy);
    deck(dx0, dsy - 1, dx1, dsy + 18);
    const bx = 3077, by = dsy + 1;
    const ph = raw({ x: bx, y: by, w: 26, h: 9, arch: 'restaurant', key: 'rest1', name: 'Pier House Seafood', poi: { kind: 'coffee', label: 'Pier House Seafood', food: true }, whole: true,
      art: { spec: { floors: 1, style: 'siding', wallColor: '#e8e2d2', pitch: 'hip', roof: 'shingle', roofColor: '#2f6a5a', slope: 0.5, grime: 0.05 },
        shop: { kind: 'diner', door: 'left', open: true, people: 4, sign: { text: 'PIER HOUSE SEAFOOD', bg: '#2f6a5a', fg: [250, 240, 210], lit: true }, awning: ['#2f6a5a', '#f0ece4'] }, kit: [] } });
    if (ph) K.take(bx, by, 26, 9);
    for (let k = 0; k < 6; k++) { const tx = bx + 1.5 + k * 4.4, ty = by + 11.5; prop('cafetable', tx, ty, 0); prop(k % 2 ? 'umbrella_r' : 'umbrella_g', tx, ty - 0.1, 0); }
    for (let k = 0; k < 3; k++) { prop('cafetable', dx0 + 2, by + 2 + k * 3, 0); prop('cafetable', dx1 - 2, by + 2 + k * 3, 0); }
    prop('festoon', bx, by + 10.4, 0, { tx: Math.round(26 * TILE), ty: 0, h: 50 });
    prop('pierrail', dx0, dsy + 17.8, 0, { len: (dx1 - dx0) * TILE, a: 0 });
    for (const bx2 of [dx0 + 6, dx0 + 18, dx0 + 30]) m.marina.push({ x: bx2 * TILE, y: (dsy + 20.6) * TILE, a: 0, kind: 'speedboat' });
    (ctx.out.places ||= []).push({ name: 'Pier House Seafood', x0: dx0, y0: dsy, x1: dx1, y1: dsy + 18 });
  }
  (ctx.out.places ||= []).push({ name: 'Harbor Green', x0, y0, x1, y1: sy });
  void raw;
}

// The Fish Market quay (WC347, WC334): Dockside Fish Market's shed with its quay along the water (the fishing boats tied
// up, the fish tables, the ice and the crates, a forklift, the delivery trucks), Fish Market Lane behind it; the Harbor
// Master's office and Ferry Square on Harbor Avenue; Ferry Plaza where the water bus calls
function fishQuay(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { shoreY, raw, shopArt, deck, out } = ctx;
  const ln = HY.lane;
  // north of the lane: the Harbor Master (stone, two floors), Ferry Square (WC344's fountain plaza by the civic hall), The
  // Tidewater's corner on Civic Avenue
  {
    const hx = 3198, hy = ln - EXT.minor - 16, hw = 30;
    if (K.allFree(hx, hy, hw, 16)) K.building({ x: hx, y: hy, w: hw, h: 16, arch: 'civicblock', name: 'Harbor Master', poi: { kind: 'delivery', label: 'Harbor Master' }, whole: true,
      art: { spec: { floors: 2, style: 'stone', wallColor: '#d4c8b0', win: 'tall', cornice: 'dentil', parapet: 12, grime: 0.08, roofMat: 'gravel', lip: 10, rimW: 5, date: '1904' } } });
    // behind it to Harbor Avenue: its lawn and plane trees (landscape() plants the rest)
    for (let y = 1908; y < hy; y++) for (let x = hx; x < hx + hw; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.GRASS);
    for (let x = hx + 3; x < hx + hw - 2; x += 6) prop('tree_a', x + 0.5, 1911, 10, { sp: 'streetPl', k: 1.1 });
    // Ferry Square (WC344's fountain plaza by the civic hall): a paved square off the lane, the Harbor Maritime Museum
    // facing it from the north - stone, round-headed windows, an anchor and a ship's bell out front
    const sqx0 = hx + hw + 2, sqx1 = 3270, sqy1 = ln - EXT.minor - 1, sqy0 = sqy1 - 15;
    const mw = sqx1 - sqx0 - 4, my = 1910;
    K.building({ x: sqx0 + 2, y: my, w: mw, h: sqy0 - my - 1, arch: 'civicblock', key: 'museum', name: 'Harbor Maritime Museum', poi: { kind: 'delivery', label: 'Harbor Maritime Museum' }, whole: true,
      art: { spec: { floors: 2, style: 'stone', wallColor: '#e2dac6', win: 'arch', cornice: 'dentil', parapet: 14, grime: 0.06, roofMat: 'gravel', lip: 10, rimW: 5, date: '1897' } } });
    for (let y = 1908; y < my; y++) for (let x = sqx0; x < sqx1; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.GRASS);
    K.fill(sqx0, sqy0 - 1, sqx1 - sqx0, sqy1 - sqy0 + 2, T.PLAZA); K.take(sqx0, sqy0 - 1, sqx1 - sqx0, sqy1 - sqy0 + 2);
    const cx = (sqx0 + sqx1) / 2, cy = sqy0 + 8;
    prop('fountain', cx, cy, 36); prop('statue', cx - 13, sqy0 + 2.2, 14);
    for (const [dx, dy] of [[-6, -2.6], [6, -2.6], [-6, 3.6], [6, 3.6]]) prop('pbench', cx + dx, cy + dy, 0);
    for (const [dx, dy] of [[-16, 2], [16, 2]]) prop('tree_b', cx + dx, cy + dy, 12, { sp: 'magnolia', k: 1.2 });
    for (const [dx, dy] of [[-10, -4.5], [10, -4.5], [-16, 6.5], [16, 6.5]]) prop('flowers_big', cx + dx, cy + dy, 0);
    prop('lamp', sqx0 + 1, sqy1 - 0.6, 0); prop('lamp', sqx1 - 1, sqy1 - 0.6, 0);
    prop('textsign', cx + 12, sqy0 + 0.4, 0, { text: 'MARITIME MUSEUM', bg: '#1e3a5e', fg: [240, 236, 220], z: 30, sx: 1 });
    m.squares ||= []; m.squares.push({ x: Math.round(cx) - 6, y: Math.round(cy) - 5, w: 12, h: 10, name: 'Ferry Square' });
    out.places ||= []; out.places.push({ name: 'Ferry Square', x0: sqx0, y0: sqy0, x1: sqx1, y1: sqy1 });
    // the corner on Civic Avenue: The Tidewater (the sailors' bar), the chandlery
    let k = 0;
    K.row(3272, HX.civic - EXT.ave, 1908, sqy1, (x, room) => {
      if (room < 6) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      const L = k++ === 0 ? { name: 'The Tidewater', store: 'bar', awning: null, sign: ['#232838', [236, 214, 150]] } : { name: 'Harbor Chandlery', store: 'mart', awning: ['#2e6a8a', '#f0ece4'] };
      const w = Math.min(room, k === 1 ? 18 : 22);
      return { w, depth: 14, arch: 'mixed', name: L.name, poi: L.store === 'bar' ? { kind: 'delivery', label: L.name } : { kind: 'delivery', label: L.name, walk: true, store: 'mart' }, whole: true, art: shopArt(x, sqy1, { ...L, floors: 2 }), home: { kind: 'apartment' } };
    });
  }
  // south of the lane: the fish market's shed, its truck yard on the lane, its quay
  {
    const fx = 3180, fw = 52, fy = ln + EXT.minor + 3, fh = 18;
    const fm = K.allFree(fx, fy, fw, fh) ? K.building({ x: fx, y: fy, w: fw, h: fh, arch: 'mixed', key: 'market', name: 'Dockside Fish Market', poi: { kind: 'fishmarket', label: 'Dockside Fish Market', walk: true, store: 'mart' }, whole: true,
      // (Harbor-B1, 2026-10-19: the brick market hall under its green roof, striped awnings, the fish on its sign)
      art: { spec: { floors: 2, style: 'brick', brickTone: '#9a4a36', pitch: 'gable', roof: 'metal', roofColor: '#3e7a5a', slope: 0.42, grime: 0.18, win: 'arch', cornice: 'dentil', date: '1911', blades: [{ text: 'FISH', x: fw * TILE - 40, v: 70, paint: true, bg: '#1e3a5e', fg: [240, 236, 220] }] },
        shop: { kind: 'mart', door: 'left', open: true, people: 5, sign: { text: 'DOCKSIDE FISH MARKET', bg: '#2a5a44', fg: [244, 238, 220], lit: true }, awning: ['#2a6a4e', '#f0ece4'] }, kit: [] } }) : null;
    if (fm) out.shops++;
    // the yard between the shed and the lane: asphalt, the trucks backed up to it
    for (let y = ln + EXT.minor + 1; y < fy; y++) for (let x = fx; x < fx + fw; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.LOT);
    // the quay: the band and the apron in front of the shed, the timber quay over the water, the fishing boats along it
    const sx0 = 3170, sx1 = 3236;
    ctx.band(sx0, sx1, T.LOT, 14);
    for (let y = fy + fh; y < 2000; y++) for (let x = sx0; x < sx1; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.LOT);
    let qy = 9999;
    for (let x = sx0; x < sx1; x++) { const s = shoreY(x); if (s !== null) qy = Math.min(qy, s); }
    if (qy < 9999) {
      deck(sx0 + 2, qy - 1, sx1 - 2, qy + 5);
      for (let x = sx0 + 4; x < sx1 - 3; x += 5) prop('bollard', x + 0.5, qy + 4.6, 5);
      for (let k = 0; k < 6; k++) m.marina.push({ x: (sx0 + 6 + k * 9) * TILE, y: (qy + 7.2) * TILE, a: k % 2 ? 0 : Math.PI, kind: k % 3 === 2 ? 'dinghy' : 'speedboat' });
      // the catch landed: fish tables, the ice in coolers, crates stacked, a forklift, nets on a pallet, the gulls
      for (let k = 0; k < 6; k++) prop('fishtable', fx + 4 + k * 8, fy + fh + 2, 0, { a: 0 });
      for (let k = 0; k < 8; k++) prop(pick(['crates', 'cooler', 'crates', 'pallet', 'fruitcrate'], rnd(k, fy, 1)), sx0 + 4 + k * 7.5, qy - 2.5 + (k % 2), 8, { v: k % 3 });
      prop('forklift', fx + fw - 6, fy + fh + 4.5, 16, { a: 0 });
      for (let k = 0; k < 5; k++) prop('gull', sx0 + 6 + k * 11, qy + 1 + (k % 2) * 2, 0, { a: k });
      prop('lamp', sx0 + 2, qy - 1.5, 0); prop('lamp', sx1 - 3, qy - 1.5, 0);
      // (Harbor-B1: the crates and the ice along the market's front under its awnings; palms and lamps at the quay's ends)
      if (fm) for (let k = 0; k < 7; k++) { const cx = fx + 6 + k * 6.5; if (Math.abs(cx - (fx + 4 + Math.round((cx - fx - 4) / 8) * 8)) > 1.6) prop(pick(['fruitcrate', 'crates', 'cooler'], rnd(k, fx, 2)), cx, fy + fh + 0.9, 6, { v: k % 3 }); }
      for (const [px, py] of [[sx0 + 1, qy - 4], [sx1 - 1.5, qy - 4]]) if (m.tiles[m.idx(Math.floor(px), Math.floor(py))] !== T.ROAD) prop('palm_a', px, py, 10, { sp: 'royal', k: 1.15 });
      for (const lx of [fx + 14, fx + 38]) prop('lamp', lx, qy - 1.5, 0);
    }
    // the trucks in the yard (traffic.js parks them: their model)
    for (const dx of [8, 22, 36]) m.parking.push({ x: (fx + dx) * TILE, y: (ln + EXT.minor + 2) * TILE, a: 0, model: dx === 22 ? 'van' : 'boxtruck' });
    out.places ||= []; out.places.push({ name: 'Dockside Fish Market', x0: fx, y0: fy, x1: fx + fw, y1: qy < 9999 ? qy + 5 : fy + fh });
  }
  // Ferry Plaza (the Gulf Water Bus's mainland stop: shared/world3-ferries.js builds its terminal on this shore): a
  // paved forecourt down to the water by Harbor Drive's turning circle - the sign, benches, planters, the news stand
  // and a food cart, palms - between lawns
  {
    const px0 = 3238, px1 = 3300, py0 = ln + EXT.minor + 1, fx0 = 3262;
    K.building({ x: fx0 + 30, y: py0 + 1, w: 8, h: 6, arch: 'snackbar', name: 'Ferry Ticket Office', poi: { kind: 'delivery', label: 'Harbor Ferry Tickets' }, whole: true });
    for (let y = py0; y < 2004; y++) for (let x = px0; x < px1; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, x >= fx0 ? T.PLAZA : T.GRASS);
    ctx.band(px0, px1, T.PLAZA, 6);
    for (const [x, y] of [[fx0 + 3, py0 + 4], [fx0 + 14, py0 + 4], [fx0 + 25, py0 + 4]]) { prop('planter_g', x, y, 10); prop('bench_m', x + 3, y + 2, 0); }
    for (const [x, y] of [[fx0 + 2, py0 + 12], [fx0 + 20, py0 + 12], [px0 + 6, py0 + 6], [px0 + 14, py0 + 14]]) prop('palm_a', x, y, 10, { sp: 'royal', k: 1.2 });
    for (const [x, y] of [[px0 + 5, py0 + 16], [px0 + 18, py0 + 5]]) prop('tree_b', x, y, 12, { sp: 'magnolia', k: 1.1 });
    prop('textsign', fx0 + 10, py0 + 8, 0, { text: 'HARBOR FERRY', bg: '#1e3a5e', fg: [240, 236, 220], z: 44, sx: 2, lit: true });
    prop('news_b', fx0 + 6, py0 + 8, 0); prop('foodcart', fx0 + 22, py0 + 9, 14);
    out.places ||= []; out.places.push({ name: 'Ferry Plaza', x0: fx0, y0: py0, x1: px1, y1: 2004 });
  }
}

// The Boatworks quarter (WC344's boat yard; the sailors' streets behind the quays): Dock Street's row (Ironside Army
// Surplus, Galley Diner, Bosun Tattoo, Net & Tackle, the laundry, the sailors' flats); Bosun Lane behind it with its own
// row facing the lane (The Lantern, the Mariners' Mission, the sail loft, the bookshop, the pawn, the coffee house, more
// flats) and their back gardens to Harbor Avenue; Harbor Boatworks' shed and its fenced yard of boats on their cradles
// between Dock Street and Harbor Drive, the travel lift; below the drive the Footbridge Landing's lawn and seawall, the
// slipway and the work boats' quay
function boatworks(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { shopArt, flat, deck, shoreY, out } = ctx;
  const x0 = HX.civic + EXT.ave + 1, x1 = HX.harborview - EXT.ave;
  // Dock Street's north row: fronts on Dock Street, backs to Bosun Lane
  const r0 = HY.bosun + EXT.minor + 1, r1 = HY.dock - EXT.st - 1;
  let k = 0;
  const list = [
    { name: 'Ironside Army Surplus', store: 'clothes', poi: { kind: 'clothing', label: 'Ironside Army Surplus' }, w: 16, tone: '#5a5a3a', awning: ['#4a5a3a', '#e8e4dc'], sign: ['#3a4a2a', [236, 226, 180]], floors: 2 },
    { flat: 10 },
    { name: 'Galley Diner', store: 'diner', key: 'diner', poi: { kind: 'coffee', label: 'Galley Diner', food: true }, w: 12, awning: ['#a8343a', '#f0ece4'], floors: 2 },
    { name: 'Bosun Tattoo', store: 'salon', w: 8, awning: null },
    { flat: 11 },
    { name: 'Net & Tackle', store: 'mart', poi: { kind: 'tackle', label: 'Net & Tackle' }, w: 10, awning: ['#2e6a8a', '#f0ece4'] },
    { flat: 9 },
    { name: 'Anchor Laundry', store: 'laundry', w: 8, awning: null },
    { flat: 10 },
    { name: 'Quayside Liquor', store: 'liquor', w: 9, awning: null, grille: true },
    { flat: 11 },
  ];
  K.row(x0, x1, r0, r1, (x, room) => {
    if (room < 6) return room >= 1 ? { gap: room, kind: 'yard' } : null;
    const L = list[k++] || { flat: Math.min(room, 10) };
    const w = Math.min(room, L.w || L.flat);
    if (L.flat) return { w, depth: 18, ...flat(x, r1, 2 + (rnd(x, r1, 1) < 0.5 ? 1 : 0)) };
    return { w, depth: 18, arch: 'mixed', ...(L.key ? { key: L.key } : {}), name: L.name, poi: L.poi || { kind: 'delivery', label: L.name, walk: true, store: L.store }, whole: true, art: shopArt(x, r1, { ...L, floors: L.floors || (rnd(x, r1, 3) < 0.5 ? 3 : 2) }), home: rnd(x, r1, 2) < 0.6 ? { kind: 'apartment' } : null };
  }, { rough: true });
  // Bosun Lane's row: the sailors' quarter facing the lane, their back gardens behind them up to Harbor Avenue
  const n0 = HY.harbor + EXT.ave + 1, n1 = HY.bosun - EXT.minor - 1;
  const lane = [
    { name: 'The Lantern', store: 'bar', w: 12, sign: ['#232838', [236, 214, 150]], awning: null, tone: '#5a3c30', poi: { kind: 'delivery', label: 'The Lantern' } },
    { flat: 10 },
    { name: "Mariners' Mission", civic: true, w: 16 },
    { flat: 9 },
    { name: 'Harbor Sail Loft', store: 'mart', w: 14, brick: false, wall: '#d8d0bc', awning: ['#2e6a8a', '#f0ece4'], poi: { kind: 'delivery', label: 'Harbor Sail Loft' } },
    { flat: 11 },
    { name: 'Seaglass Books', store: 'books', w: 9, awning: ['#2f6a5a', '#f0ece4'] },
    { flat: 10 },
    { name: 'Harbor Pawn', store: 'pawn', w: 9, grille: true, awning: null, sign: ['#232838', [236, 214, 150]], poi: { kind: 'pawn', label: 'Harbor Pawn' } },
    { flat: 10 },
    { name: 'Ropewalk Coffee', store: 'cafe', w: 9, awning: ['#8a5a2a', '#efe6d0'], poi: { kind: 'coffee', label: 'Ropewalk Coffee', food: true } },
    { flat: 10 },
  ];
  let j = 0;
  const made = K.row(x0, x1, n0, n1, (x, room) => {
    if (room < 6) return room >= 1 ? { gap: room, kind: 'garden' } : null;
    const L = lane[j++] || { flat: Math.min(room, 10) };
    const w = Math.min(room, L.w || L.flat);
    if (L.flat) return { w, depth: 13, ...flat(x, n1, 2 + (rnd(x, n1, 4) < 0.35 ? 1 : 0), { grime: 0.2 }) };
    if (L.civic) return { w, depth: 14, arch: 'civicblock', name: L.name, poi: { kind: 'delivery', label: L.name }, whole: true, art: { spec: { floors: 2, style: 'stone', wallColor: '#cfc4ae', win: 'tall', cornice: 'dentil', parapet: 12, grime: 0.12, roofMat: 'gravel', lip: 10, rimW: 5, date: '1888' } } };
    return { w, depth: 13, arch: 'mixed', name: L.name, poi: L.poi || { kind: 'delivery', label: L.name, walk: true, store: L.store }, whole: true, art: shopArt(x, n1, { ...L, floors: 2 }), home: { kind: 'apartment' } };
  });
  // (the back gardens: a lawn behind each, a fence between neighbours, a tree, a shed or a raised bed, a shrub; the
  // picket along Harbor Avenue's pavement)
  for (const b of made) {
    if (b.gap || b.tx === undefined) continue;
    const gx = b.tx, gw = b.tw, gh = b.ty - n0;
    if (gh < 3) continue;
    K.fill(gx, n0, gw, gh, T.GRASS);
    prop('fenceline', gx + gw - 0.15, n0 + 0.3, 0, { kind: 'wood', tx: 0, ty: Math.round((gh - 0.5) * TILE) });
    const r = rnd(gx, n0, 70);
    if (r < 0.5) prop(rnd(gx, n0, 71) < 0.5 ? 'tree_a' : 'tree_b', gx + gw / 2, n0 + gh / 2 + 0.5, 12, { sp: pick(['maple', 'oak', 'cherry', 'magnolia', 'streetPl'], rnd(gx, n0, 72)), k: 0.95 + rnd(gx, n0, 73) * 0.2 });
    else if (r < 0.75) prop('shed', gx + 2, n0 + 2.2, 10);
    else prop('raisedbed', gx + gw / 2, n0 + gh / 2, 0, { v: Math.floor(rnd(gx, n0, 74) * 3) });
    prop(pick(['flowers_a', 'shrub_a', 'bush_c', 'flowers_big'], rnd(gx, n0, 75)), gx + 1.5, n0 + gh - 1.4, 0);
  }
  prop('fenceline', x0 + 0.2, n0 + 0.3, 0, { kind: 'picket', tx: Math.round((x1 - x0 - 0.4) * TILE), ty: 0 });
  // Harbor Boatworks: the shed (its big doors to the yard), the fenced yard of boats on cradles, the travel lift
  const s0 = HY.dock + EXT.st + 1;
  const bw = 34, bx = x0 + 4, by = s0 + 1;
  const edge = (x) => Math.floor(driveY(x) - EXT.ave - 1);   // (the yard's south edge: the drive's pavement)
  K.building({ x: bx, y: by, w: bw, h: 16, arch: 'hangar', name: 'Harbor Boatworks', poi: { kind: 'delivery', label: 'Harbor Boatworks' }, whole: true,
    art: { spec: { style: 'corrugated', wallColor: '#7a2e2e', pitch: 'gable', roof: 'metal', roofColor: '#5a5e66', slope: 0.36 } } });
  K.building({ x: bx + bw + 3, y: by, w: 16, h: 10, arch: 'shed', name: 'Boatworks Paint Shop', whole: true });
  for (let x = x0; x < x1; x++) for (let y = s0; y <= edge(x); y++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.LOT);
  const lot = (x, y) => m.inside(x, y) && m.tiles[m.idx(x, y)] === T.LOT;
  const clear = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) if (!lot(x + dx, y + dy)) return false; return true; };
  // the boats laid up on their cradles in rows (static: yachts, sailboats with their masts unstepped), the lane down
  // the middle to the slip kept clear
  let nb = 0;
  for (let cy = by + 20; cy < 2046; cy += 5) for (let cx = x0 + 6; cx < x1 - 4; cx += 8) {
    const tx = cx + (Math.floor((cy - by) / 5) % 2) * 4;
    if (Math.abs(tx - 3404) < 5 || !clear(tx, cy)) continue;
    const r = rnd(tx, cy, 80);
    if (r < 0.12) continue;
    if (r < 0.42) prop('yacht', tx, cy, 26, { a: 0, lift: 6 });
    else prop('sailboat', tx, cy, 26, { a: 0, len: 100 + Math.floor(rnd(tx, cy, 81) * 3) * 12, sail: 0, c: Math.floor(rnd(cy, tx, 82) * 3), lift: 6 });
    if (rnd(tx, cy, 83) < 0.4) prop(pick(['pallet_s', 'drum', 'tires', 'crates'], rnd(tx, cy, 84)), tx + 3.2, cy + 1.2, 8);
    nb++;
  }
  for (const [cx, cy] of [[bx + bw + 8, by + 13], [bx + bw + 15, by + 13]]) if (clear(cx, cy)) { prop('yacht', cx, cy, 26, { a: 0, lift: 6 }); nb++; }
  prop('straddle', 3404, by + 26, 0, { a: Math.PI / 2, tall: 120 });
  for (let k2 = 0; k2 < 6; k2++) prop(pick(['pallet', 'drum', 'spool', 'crates', 'tires'], rnd(k2, by, 3)), bx + 2 + k2 * 5, by + 17.5, 8);
  prop('textsign', bx + bw / 2, by + 17, 0, { text: 'HARBOR BOATWORKS', bg: '#7a2e2e', fg: [250, 230, 190], z: 48, sx: 2 });
  prop('chainfence', x0 + 0.2, s0 + 0.2, 0, { tx: (bx - x0 - 0.4) * TILE, ty: 0 });
  prop('chainfence', bx + bw + 20, s0 + 0.2, 0, { tx: (x1 - bx - bw - 20.4) * TILE, ty: 0 });
  // below Harbor Drive: the Footbridge Landing (its lawn - landscape() plants it - the walk down to the footbridge, the
  // seawall), the slipway and its apron, the work boats' quay
  const fl0 = x0, fl1 = 3392, sl1 = 3442;
  promenade(K, m, ctx, fl0, fl1, 4, { palms: false });
  for (const [px, py] of [[HX.foot - 4, 2030], [HX.foot + 5, 2034]]) prop('bench_m', px, py, 0);
  prop('lamp', HX.foot - 3.5, 2027, 0); prop('lamp', HX.foot + 3.5, 2036, 0);
  prop('textsign', HX.foot + 7, Math.ceil(driveY(HX.foot) + EXT.ave + 3), 0, { text: 'HARBOR FOOTBRIDGE', bg: '#2f5a4a', fg: [240, 232, 200], z: 30, sx: 1 });
  ctx.band(fl1, x1, T.LOT, 8);
  for (let x = fl1; x < sl1; x++) { const s = shoreY(x, 2000); if (s === null) continue; for (let y = Math.ceil(driveY(x) + EXT.ave + 1); y < s; y++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.LOT); }
  {
    const slx = 3410, sly = shoreY(3412, 2000);
    if (sly !== null) {
      deck(slx, sly - 1, slx + 5, sly + 10);
      for (let k2 = 0; k2 < 3; k2++) m.marina.push({ x: (slx + 7.5) * TILE, y: (sly + 2 + k2 * 3.2) * TILE, a: Math.PI / 2, kind: k2 === 1 ? 'dinghy' : 'speedboat' });
      prop('textsign', slx + 2.5, sly - 2, 0, { text: 'SLIPWAY', bg: '#3a3e46', fg: [240, 236, 220], z: 26, sx: 1 });
      if ([...Array(5)].every((_, dy) => [...Array(6)].every((_, dx) => m.tiles[m.idx(slx + 8 + dx, sly - 9 + dy)] === T.LOT))) ctx.raw({ x: slx + 8, y: sly - 9, w: 6, h: 5, arch: 'hut', name: 'Slipway Hut', whole: true, roof: 'tar' });
      for (let k2 = 0; k2 < 3; k2++) prop('canoe', slx - 6 + k2 * 0.9, sly - 4, 0, { a: Math.PI / 2, c: k2 });
    }
    for (let x = fl1 + 2; x < x1 - 2; x += 7) { const s = shoreY(x, 2000); if (s !== null && Math.abs(x - slx - 2) > 5) prop('bollard', x + 0.5, s - 0.8, 5); }
    for (const bx2 of [3452, 3464]) { const s = shoreY(bx2, 2000); if (s !== null) m.marina.push({ x: bx2 * TILE, y: (s + 2.4) * TILE, a: 0, kind: 'speedboat' }); }
  }
  out.places ||= []; out.places.push({ name: 'Harbor Boatworks', x0: bx, y0: by, x1, y1: by + 30 }, { name: 'Dock Street', x0, y0: r0, x1, y1: r1 }, { name: 'Bosun Lane', x0, y0: n0, x1, y1: HY.bosun + EXT.minor }, { name: 'Footbridge Landing', x0: fl0, y0: 2020, x1: fl1, y1: 2050 });
  void nb;
}

// The Port (Harborview Avenue to the inlet): Dock Street's warehouses (Portside Logistics and its cargo pad, the cold
// store, the brewery in an old warehouse), their verge along Harbor Avenue; south of Dock Street the Harbor Container
// Terminal behind its fence - the gate at Stadium Avenue's foot, the truck depot and the empties by Harborview Avenue,
// the stacks in pairs with lanes between, the straddle carriers and the floodlight masts, the apron and the timber quay
// with its gantry cranes and a container ship alongside
const WH = [
  { name: 'Portside Logistics', biz: 'warehouse', spec: { style: 'corrugated', wallColor: '#3e5a7a', pitch: 'gable', roof: 'metal', roofColor: '#56626e', slope: 0.22 } },
  { name: 'Bayline Freight', spec: { style: 'brick', brickTone: '#7a3a30', roofMat: 'membrane' } },
  { name: 'Harbor Brewing Co', brew: true },
  { name: 'Pier 7 Cold Storage', spec: { style: 'concrete', wallColor: '#e4e2dc', roofMat: 'membrane' } },
  { name: 'Harbor Supply Co', spec: { style: 'corrugated', wallColor: '#8a5a3a', pitch: 'gable', roof: 'metal', roofColor: '#6a5040', slope: 0.22 } },
  { name: 'Gulf Shipping', spec: { style: 'corrugated', wallColor: '#3a6a5a' } },
  { name: 'Seaboard Imports', spec: { style: 'brick', brickTone: '#8e4a3c', pitch: 'gable', roof: 'metal', roofColor: '#4a4e56', slope: 0.2 } },
  { name: 'Dockhand Storage', spec: { style: 'concrete', wallColor: '#a8a49a' } },
];
export const SHIP = [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 10];   // (the ship alongside, stern to bow: tiles - shared/world3-passes.js's)
function port(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { isW, out, raw } = ctx;
  // (the terminal's buildings stand on its yard once it's laid: placed whole over the asphalt)
  const onYard = (o) => { for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) { if (!m.inside(x, y)) return null; const t = m.tiles[m.idx(x, y)]; if (t !== T.LOT || m.bld[m.idx(x, y)] >= 0) return null; } return raw(o); };
  const n0 = HY.harbor + EXT.ave + 1, n1 = HY.dock - EXT.st - 1, s0 = HY.dock + EXT.st + 1;
  // north of Dock Street: the warehouses fronting it (their roller doors, the name over them), the brewery among them
  let wi = 0;
  for (const [a, b] of [[HX.harborview, HX.stadium], [HX.stadium, 3790]]) {
    const x0 = a + EXT.ave + 1, x1 = b === 3790 ? 3790 : b - EXT.ave;
    K.row(x0, x1, n0, n1, (x, room) => {
      if (room < 10) return room >= 1 ? { gap: room, kind: 'yard' } : null;
      const L = WH[wi++ % WH.length];
      if (L.brew) {
        const w = Math.min(room, 26);
        return { w, depth: 30, arch: 'mixed', key: 'rest1', name: L.name, poi: { kind: 'coffee', label: L.name, food: true }, whole: true,
          art: { spec: { floors: 3, style: 'brick', brickTone: '#6e3a2e', win: 'loft', cornice: 'step', parapet: 10, grime: 0.22, roofMat: 'gravel', lip: 10, rimW: 4 },
            shop: { kind: 'bar', door: 'left', open: true, people: 4, sign: { text: 'HARBOR BREWING CO', bg: '#232838', fg: [236, 200, 120], lit: true }, awning: ['#232838', '#232838'] } } };
      }
      const w = Math.min(room, 30 + Math.floor(rnd(x, n1, 1) * 14));
      return { w, depth: 34, arch: 'warehouse', name: L.name, poi: L.biz ? { kind: L.biz, label: L.name } : { kind: 'delivery', label: L.name }, whole: true, art: { spec: { grime: 0.3, ...L.spec } } };
    }, { rough: true });
    // (the warehouse business's cargo pad: where the truck loads - shared/map.js gives the generator's warehouses one)
    for (const p of m.pois) if (p.kind === 'warehouse' && p.label === 'Portside Logistics' && !p.cargoPad && p.x / TILE >= x0 && p.x / TILE < x1) p.cargoPad = { x: p.x - 2 * TILE, y: p.y + 2.6 * TILE };
  }
  // the brewery's front: strings of lights, a chalkboard, barrels by the door
  for (const b of m.buildings) if (b.hand && b.name === 'Harbor Brewing Co') { const fy = b.ty + b.th; prop('festoon', b.tx + 0.5, fy + 0.4, 0, { tx: Math.round((b.tw - 1) * TILE), ty: 0, h: 56 }); prop('barrels', b.tx + b.tw - 2, fy + 0.9, 8); prop('planter_fl', b.tx + 4, fy + 0.9, 0); }

  // ===== the Harbor Container Terminal =====
  const TX0 = HX.harborview + EXT.ave + 1, TX1 = 3790, QY = HY.quay, QX0 = 3584, QX1 = 3718;
  const land = (x, y) => m.inside(x, y) && m.dist[m.idx(x, y)] === D && m.land[m.idx(x, y)];
  ctx.band(TX0, TX1, T.LOT, 16);
  for (let y = s0; y < 2125; y++) for (let x = TX0; x < TX1; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.LOT);
  const lot = (x, y) => m.inside(x, y) && m.tiles[m.idx(x, y)] === T.LOT;
  const solid = (x, y, r) => m.addSolidProp(x, y, r);
  // the timber quay: built out over the water to a straight edge, its last four rows the crane rails' deck
  for (let x = QX0; x < QX1; x++) for (let y = 2096; y <= QY; y++) {
    if (!m.inside(x, y)) continue;
    const i = m.idx(x, y), c = m.tiles[i];
    if (isW(x, y) || (y >= QY - 3 && (c === T.LOT || c === T.GRASS || c === T.PLAZA) && m.bld[i] < 0)) { m.tiles[i] = T.DOCK; K.take(x, y, 1, 1); }
  }
  // the gate at Stadium Avenue's foot: the barrier, the gatehouse, the lane in; the fence along Dock Street
  const GX = HX.stadium;
  onYard({ x: GX + 4, y: s0 + 1, w: 4, h: 4, arch: 'hut', name: 'Terminal Gatehouse', whole: true, roof: 'tar' });
  prop('ygate', GX - 1.5, s0 + 0.6, 0, { a: 0 }); prop('ygate', GX + 2, s0 + 0.6, 0, { a: Math.PI });
  for (let x = TX0 + 1; x + 4 <= TX1 - 12; x += 4) {
    if (x + 4 > GX - 4 && x < GX + 9) continue;
    if (x + 4 > TX0 + 30 && x < TX0 + 36) continue;   // (the truck depot's own gate)
    if (!lot(x, s0) || !lot(x + 4, s0)) continue;
    prop('yfence', x, s0 + 0.4, 0, { x1: (x + 4) * TILE, y1: (s0 + 0.4) * TILE });
  }
  prop('textsign', GX + 9, s0 + 1.6, 0, { text: 'HARBOR CONTAINER TERMINAL', bg: '#3a3e46', fg: [240, 236, 220], z: 44, sx: 1, lit: true });
  // the customs house beside the gate (stone, two floors: the papers for every box)
  onYard({ x: GX - 21, y: s0 + 2, w: 16, h: 9, arch: 'civicblock', name: 'Harbor Customs House', poi: { kind: 'delivery', label: 'Harbor Customs House' }, whole: true,
    art: { spec: { floors: 2, style: 'stone', wallColor: '#cfc6b2', win: 'tall', cornice: 'dentil', parapet: 10, grime: 0.15, roofMat: 'gravel', lip: 10, rimW: 5, date: '1926' } } });
  // the truck depot (by Harborview Avenue): the office, the box trucks backed into their bays, the empties stacked
  {
    const ox = TX0 + 2, oy = s0 + 2;
    onYard({ x: ox, y: oy, w: 14, h: 8, arch: 'yardoffice', name: 'Harbor Truck Depot', poi: { kind: 'delivery', label: 'Harbor Truck Depot' }, whole: true });
    prop('textsign', ox + 7, oy + 9.6, 0, { text: 'HARBOR TRUCK DEPOT', bg: '#7a2e2e', fg: [250, 230, 190], z: 30, sx: 1 });
    // the reefer shed (the cold boxes plugged in along it) and the drivers' canteen
    onYard({ x: ox, y: s0 + 13, w: 20, h: 9, arch: 'shed', name: 'Reefer Shed', whole: true, art: { spec: { style: 'corrugated', wallColor: '#d8dcde' } } });
    onYard({ x: ox + 24, y: s0 + 14, w: 9, h: 6, arch: 'snackbar', key: 'rest2', name: 'Dockers Canteen', poi: { kind: 'coffee', label: 'Dockers Canteen', food: true }, whole: true });
    for (let k = 0; k < 9; k++) { const px = ox + 18 + k * 4; if (!lot(px, s0 + 10)) continue; m.parking.push({ x: px * TILE, y: (s0 + 9) * TILE, a: -Math.PI / 2, model: k % 3 === 1 ? 'van' : 'boxtruck' }); m.stalls.push({ x: (px - 1.5) * TILE, y: (s0 + 6) * TILE, w: 3 * TILE, h: 6 * TILE }); }
    // the empties: single boxes end to end in rows, two high here and there (drawn one above the other)
    for (let ry = s0 + 18; ry < 2090; ry += 3) for (let rx = TX0 + 3; rx + 4 < 3560; rx += 4.4) {
      const tx = Math.floor(rx), ty = ry;
      if (!lot(tx, ty) || !lot(tx + 4, ty + 1) || !lot(tx, ty + 2) || rnd(tx, ty, 90) < 0.18) continue;
      if (((ry - s0 - 18) / 3) % 4 === 3) continue;   // (a lane every fourth row)
      prop('container', rx + 2, ty + 0.9, 18, { c: Math.floor(rnd(tx, ty, 91) * 5), a: 0 });
    }
  }
  // the stacks: in pairs, five tiles by eight, a lane between the pairs, a cross lane after every second row; the lane
  // in from the gate kept clear; the crane apron left open along the quay
  const PW = 5, PL = 8, PAIR = 2 * PW + 1, LANE = 4;
  const fits = (bx, by) => { for (let y = by - 1; y <= by + PL; y++) for (let x = bx - 1; x <= bx + PW; x++) if (!lot(x, y)) return false; return true; };
  const rows = [];
  for (let g = 0; g < 6; g++) for (let r = 0; r < 2; r++) rows.push(s0 + 6 + g * (2 * (PL + 1) + 5) + r * (PL + 1));
  let ns = 0;
  const lanesX = [];
  for (let px = 3566; px + PAIR <= TX1 - 6; px += PAIR + LANE) {
    if (px + PAIR > GX - 4 && px < GX + 10) { px = GX + 10 - PAIR - LANE; continue; }
    lanesX.push(px + PAIR + LANE / 2);
    for (const by of rows) {
      if (by + PL > QY - 16) continue;
      for (const bx of [px, px + PW + 1]) {
        if (!fits(bx, by) || rnd(bx, by, 92) < 0.08) continue;
        prop('cstack', bx + PW / 2, by + PL / 2, 0, { v: Math.floor(rnd(bx, by, 93) * 6), tall: 240 });
        for (const ox of [1.25, 3.75]) for (let oy = 1; oy < PL; oy += 2) solid((bx + ox) * TILE, (by + oy) * TILE, 40);
        ns++;
      }
    }
  }
  // the straddle carriers parked in the lanes, the floodlight masts at the cross lanes
  for (const [k, lx] of lanesX.entries()) {
    if (k % 3 === 1) { const ly = rows[2] - 3; if (lot(Math.floor(lx), ly)) { prop('straddle', lx, ly, 0, { a: Math.PI / 2, tall: 120 }); solid(lx * TILE, (ly - 0.7) * TILE, 18); solid(lx * TILE, (ly + 0.7) * TILE, 18); } }
    if (k % 2 === 0) for (const ry of [rows[1] + PL + 2.5, rows[5] + PL + 2.5]) if (lot(Math.floor(lx), Math.floor(ry))) { prop('ymast', lx, ry, 0, { tall: 160 }); solid(lx * TILE, ry * TILE, 6); }
  }
  // the quay: the cranes on their rails over the ship's holds, the ship alongside (stern west, bow east), the boxes
  // waiting on the apron, the trucks under the cranes, bollards along the edge
  const legS = (QY + 0.5) * TILE, legN = legS - 102, cyC = (legS + legN) / 2;
  for (const ry of [legS, legN]) for (let x = QX0; x + 8 <= QX1; x += 8) prop('crail', x + 4, ry / TILE, 0, { len: 256, ew: 1 });
  const hull0 = 3606, cy = (QY + 1) * TILE + 10 + 110;
  let sx = hull0 * TILE;
  for (const [n, len] of SHIP.entries()) {
    prop('cship', (sx + len * TILE / 2) / TILE, cy / TILE, 0, { v: n === 0 ? 2 : n === SHIP.length - 1 ? 0 : 1, c: 1, a: 0, tall: 250 });
    sx += len * TILE;
  }
  for (let x = hull0 * TILE + 16; x < sx; x += 28) for (const oy of [-94, 94]) solid(x, cy + oy, 16);
  const LS = SHIP.reduce((a, b) => a + b, 0);
  (m.portShips ||= []).push({ name: 'Harbor Container Terminal', x: hull0 * TILE, y: cy - 110, w: LS * TILE, h: 220 });
  for (const [k, cx] of [3624, 3654, 3684].entries()) {
    prop('gcrane', cx, cyC / TILE, 0, { a: -Math.PI / 2, k: k % 2, tall: 720 });
    for (const lx of [cx * TILE - 62, cx * TILE + 62]) for (const ly of [legS, legN]) solid(lx, ly, 9);
    m.parking.push({ x: cx * TILE, y: cyC - 140, a: 0, model: 'boxtruck' });
  }
  for (let k = 0; k < 10; k++) { const cx = QX0 + 6 + k * 13; if (lot(cx, QY - 9) && lot(cx + 4, QY - 8)) prop('container', cx + 2, QY - 8.2, 18, { c: Math.floor(rnd(cx, QY, 94) * 5), a: 0 }); }
  for (let x = TX0 + 2; x < TX1 - 2; x += 6) { let s = null; for (let y = 2060; y < 2130; y++) if (isW(x, y)) { s = y; break; } if (s !== null && land(x, s - 1) && (x < QX0 || x >= QX1)) prop('bollard', x + 0.5, s - 0.8, 5); }
  for (let x = QX0 + 3; x < QX1 - 2; x += 6) prop('bollard', x + 0.5, QY + 0.6, 5);
  prop('forklift', 3570, 2104, 16, { a: Math.PI / 2 }); prop('forklift', 3735, 2098, 16, { a: 0 });
  out.places ||= []; out.places.push({ name: 'Harbor Container Terminal', x0: TX0, y0: s0, x1: TX1, y1: QY }, { name: 'Harbor Truck Depot', x0: TX0, y0: s0, x1: 3560, y1: s0 + 16 }, { name: 'Harbor Quay', x0: QX0, y0: QY - 12, x1: QX1, y1: QY + 8 });
  void pick; void ns;
}

// The streets' furniture: Harbor Avenue's royal palms down both pavements west of Civic Avenue (plane trees east of it),
// the lamps; plane trees along Dock Street, its kerbside bays; a bus stop on Harbor Avenue at Harbor Green and at Ferry
// Plaza
function dressing(K, m, out) {
  const { prop, rnd } = K;
  const onWalk = (x, y) => m.inside(Math.floor(x), Math.floor(y)) && m.tiles[m.idx(Math.floor(x), Math.floor(y))] === T.SIDEWALK;
  const cross = [HX.westside, HX.bridge, HX.main, HX.civic, 3400, HX.harborview, HX.stadium, 3641];
  for (const sy of [-1, 1]) for (let x = HX.westside + 10; x < 3740; x += 8) {
    if (cross.some((c) => Math.abs(x - c) < 10)) continue;
    const y = HY.harbor + sy * (EXT.ave - 1) + 0.5;
    if (!onWalk(x + 0.5, y)) continue;
    if (x < HX.civic) prop('palm_a', x + 0.5, y, 10, { sp: 'royal', k: 1.15 }); else prop('tree_a', x + 0.5, y, 10, { sp: 'street', k: 1.1, grate: true });
  }
  for (const sy of [-1, 1]) for (let x = HX.civic + 12; x < HX.inlet - 8; x += 9) {
    if ([HX.harborview, HX.stadium].some((c) => Math.abs(x - c) < 10)) continue;
    const y = HY.dock + sy * (EXT.st - 1) + 0.5;
    if (onWalk(x + 0.5, y) && rnd(x, y, 1) < 0.7) prop('tree_a', x + 0.5, y, 10, { sp: 'street', k: 1.05, grate: true });
  }
  // Dock Street's kerbside bays (traffic.js parks them; the trucks among them)
  const off = (ST_W * TILE) / 2 - PARK / 2;
  for (let t = (HX.civic + 10) * TILE; t < (HX.inlet - 10) * TILE; t += 150) {
    const tt = t / TILE;
    if ([HX.harborview, HX.stadium].some((c) => Math.abs(tt - c) < 12)) continue;
    for (const sd of [-1, 1]) m.parking.push({ x: Math.round(t), y: Math.round((HY.dock + 0.5) * TILE + sd * off), a: sd > 0 ? 0 : Math.PI, kerb: true, ...(rnd(tt, sd, 2) < 0.25 ? { model: 'boxtruck' } : {}) });
  }
  for (const [x, y] of [[3060, HY.harbor + EXT.ave - 1], [3250, HY.harbor + EXT.ave - 1], [3560, HY.harbor + EXT.ave - 1]]) if (onWalk(x, y)) prop('busstop', x, y, 0);
  out.dressed = true;
}
