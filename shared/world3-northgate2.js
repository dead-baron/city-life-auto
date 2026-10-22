// World v3, handcrafted: the rest of Northgate (district 2) - west of Spruce Street to Linden Street, and east of
// Harborview Avenue to Stadium Avenue - round the plan of its heart (shared/world3-northgate.js), from the owner's
// concepts WC315 (the community gardens quarter: brick row houses whose back yards are allotments, the central garden
// with its greenhouse, arbour gate and market stalls, the bakery and the café on the corner), WC069 (one block made a
// park: the fenced five-a-side pitch and its bleachers, the lily pond behind its railing, curving paths, flower beds),
// WC089 (the park kit: courts, a dog park), WC002 (the high street: brownstone stoops, the laundromat, the grocer's
// crates out front, the neon coffee shop, the bus shelter) and the research's row-house grid with its garage lanes,
// courtyard walk-ups (D4) and the diner by the fire station's crowd:
//   - Allotment Row, Linden Street to Bridge Avenue north of 3rd Street: terraces of brick row houses back to back,
//     their stoops on the streets, their back yards (beds, sheds, washing lines) on Allotment Lane and Orchard Lane;
//   - Northgate Community Garden and the Morning Crumb Bakery on 3rd Street; Linden Park (the pitch, the lily pond)
//     and the dog run under the Gulf Loop's curve;
//   - 9th Street, the high street, from Linden Street to Spruce Street: shops under the walk-ups along its north side;
//   - Rowan Court and the courtyard walk-ups between the avenues; Northgate Sports Ground (tennis, basketball) on
//     Trestle Street;
//   - east of Harborview Avenue: the Harborview Diner, courtyard walk-ups, the Northgate Clinic and its court, the
//     sports bars by the stadium, the car park under the deck.
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2).
import { TILE, T, PITCH_LONG } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 2;   // Northgate (shared/mapcore.js DISTRICTS)
// the street centre lines (tiles): the grid's lines this plan keeps (the avenues, the district's edges) and its own
export const NX = { linden: 2700, sycamore: 2753, westside: 2860, rowan: 2924, bridge: 2988, maple: 3053, spruce: 3119, harborview: 3480, mapleE: 3547, spruceE: 3613, stadium: 3680 };
export const NY = { t24: 1440, first: 1477, second: 1513, third: 1550, sixth: 1587, ninth: 1623, eleventh: 1660, trestle: 1664, allot: 1495, orchard: 1532 };
// its areas: Linden Street to Westside Avenue, the avenues' two cells to Spruce Street, Harborview Avenue to Stadium
// Avenue (to 9th Street: the stadium's Gameday Drive meets the grid's 9th Street there)
const RECTS = [[NX.linden, NY.t24, NX.westside, 1662], [NX.westside, NY.t24, NX.bridge, 1666], [NX.bridge, NY.t24, NX.spruce, 1666], [NX.harborview, NY.t24, NX.stadium, NY.ninth]];

function streets() {
  const ew = (name, kind, y, x0, x1) => ({ name, kind, pts: [[x0, y], [x1, y]] });
  const ns = (name, kind, x, y0, y1) => ({ name, kind, pts: [[x, y0], [x, y1]] });
  return [
    ew('1st Street', 'st', NY.first, NX.linden, NX.spruce),
    ew('2nd Street', 'st', NY.second, NX.linden, NX.rowan),
    ew('3rd Street', 'st', NY.third, NX.linden, NX.westside),
    ew('4th Street', 'st', NY.third, NX.maple, NX.spruce),
    ew('6th Street', 'st', NY.sixth, NX.linden, NX.westside),
    ew('7th Street', 'st', NY.sixth, NX.westside, NX.spruce),
    ew('9th Street', 'st', NY.ninth, NX.linden, NX.spruce),
    // (the garage lanes behind Allotment Row's terraces)
    ew('Allotment Lane', 'alley', NY.allot, NX.linden, NX.westside),
    ew('Orchard Lane', 'alley', NY.orchard, NX.linden, NX.westside),
    ns('Sycamore Street', 'st', NX.sycamore, NY.ninth, NY.eleventh),
    ns('Rowan Street', 'st', NX.rowan, NY.t24, NY.trestle),
    ns('Maple Street', 'st', NX.maple, NY.t24, NY.ninth),
    // east of Harborview Avenue
    ew('1st Street', 'st', NY.first, NX.harborview, NX.stadium),
    ew('5th Street', 'st', NY.third, NX.harborview, NX.spruceE),
    ew('8th Street', 'st', NY.sixth, NX.harborview, NX.spruceE),
    ns('Maple Street', 'st', NX.mapleE, NY.t24, NY.ninth),
    ns('Spruce Street', 'st', NX.spruceE, NY.t24, NY.ninth),
  ];
}

export const NORTHGATE2 = {
  key: 'northgate2', d: D, rects: RECTS, rect: [NX.linden, NY.t24, NX.stadium, 1666],
  streets,
  specials: [],
  build,
};

const BRICK = ['#a85a42', '#8e4a3a', '#b8705a', '#7a4a3a', '#9a5040', '#b0644c', '#6e3e30'];
const BROWN = ['#7a5240', '#6a4636', '#8a5e48', '#5e4032'];
const STONE = ['#d4c8b0', '#c8bca4', '#cfc4ae', '#bfb4a0'];
const PAINT = ['#d9c9a3', '#b9c7b4', '#d8a98c', '#c3cdd6', '#e4dcc8'];
// the high street's shops (WC002) and the corners' stores: [name, window, poi kind or null, awning]
const HIGH = [
  ['Suds & Spin Laundromat', 'laundry', null, ['#2a6a9a', '#f0ece4']], ['Greenleaf Grocer', 'mart', 'grocery', ['#2f6a4e', '#f0ece4']],
  ['Ninth Street Coffee', 'cafe', 'coffee', ['#3a2a20', '#d8c8a8']], ['Clip Joint Barbers', 'salon', 'barber', ['#7a1e2a', '#efe6d0']],
  ['Northgate Pharmacy', 'mart', 'pharmacy', ['#2a7a6a', '#f0ece4']], ['Lucky Noodle', 'diner', 'coffee', ['#a8343a', '#a8343a']],
  ['Second Hand Rose', 'clothes', 'clothing', ['#8a3a5a', '#efe6d0']], ['Hot Bagel Co.', 'cafe', 'coffee', ['#c8702a', '#f0ece4']],
  ['Ninth Street Hardware', 'mart', null, ['#a83a2a', '#e8e4dc']], ['Page Turner Books', 'books', null, ['#3a2a20', '#d8c8a8']],
  ['Spin City Records', 'records', null, ['#2a2a3a', '#e8c040']], ['Wash World', 'laundry', null, ['#3a6a9a', '#3a6a9a']],
  ['Tony\'s Pizza', 'diner', 'coffee', ['#2f6a4e', '#c8302a']], ['Bloom & Stem', 'florist', null, ['#4a7a3a', '#f0ece4']],
];
const CORNER = ['Sycamore Grocer', 'Laurel Deli', 'Allotment Mart', 'Rowan Bodega', 'Spur Stop', 'Orchard Market', 'Linden Pantry', 'Westside Deli'];
const CORNER_E = ['Gameday Bodega', 'Corner Pantry', 'Harborview Market', 'Stadium Stop', 'Quick Pick', 'Daily Needs'];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const { place, tower } = towerKit(K, out);
  const tile = (x, y) => m.tiles[y * m.w + x];
  let hi = 0, ci = 0;
  const shopsPlaced = [];
  // the free ground of a block between streets: from (xa, ya) to (xb, yb) shrunk past the pavements, read along its
  // middle row and column -> [x0, y0, x1, y1] (x1, y1 exclusive) or null
  const area = (xa, ya, xb, yb) => {
    const my = Math.round((ya + yb) / 2), mx = Math.round((xa + xb) / 2);
    let x0 = xa, x1 = xb, y0 = ya, y1 = yb;
    while (x0 < x1 && !K.free(x0, my)) x0++;
    while (x1 > x0 && !K.free(x1 - 1, my)) x1--;
    while (y0 < y1 && !K.free(mx, y0)) y0++;
    while (y1 > y0 && !K.free(mx, y1 - 1)) y1--;
    return x1 - x0 >= 4 && y1 - y0 >= 4 ? [x0, y0, x1, y1] : null;
  };

  // ---- the walk-ups' art: three to five floors of brick (now and then stone), a fire escape on the taller ones; a shop
  // under it on a high street or a corner
  const walkArt = (x, y, w, floors, shop = null) => tower(x, y, { name: shop ? shop.name : '', style: rnd(x, y, 41) < 0.8 ? 'brick' : 'stone', tone: pick(BRICK, rnd(x, y, 42)), wall: pick(STONE, rnd(x, y, 43)), floors,
    ...(shop ? { store: shop.store, awning: shop.awning, grille: shop.grille ?? false } : { shop: false }), win: pick(['pair', 'even', 'tall'], rnd(x, y, 44)), cornice: pick(['bracket', 'dentil'], rnd(x, y, 47)), parapet: 6, roofMat: pick(['gravel', 'membrane', 'gravel'], rnd(x, y, 45)),
    spec: floors >= 4 && w >= 8 && rnd(x, y, 46) < 0.55 ? { fireEscape: [Math.max(8, Math.round(w * TILE * 0.55) - 25), 50] } : null });
  let ce = 0;
  const cornerStore = (x, y1, w, floors) => {
    const name = x >= NX.harborview ? CORNER_E[ce++ % CORNER_E.length] : CORNER[ci++ % CORNER.length];
    return { w, arch: 'mixed', name, poi: { kind: 'convenience', label: name }, home: { kind: 'apartment' }, whole: true, art: walkArt(x, y1, w, floors, { name, store: 'mart', awning: pick([['#2f6a4e', '#f0ece4'], ['#7a1e2a', '#efe6d0'], ['#2a3a5a', '#efe6d0']], rnd(x, y1, 54)), grille: true }) };
  };
  // A row of walk-ups facing the street south of it (opt north: against the band's north edge, their doors on the
  // street north of it); a corner store at the row's end now and then
  const walkRow = (x0, x1, y0, y1, depth, north = false, mask = null) => K.row(x0, x1, y0, y1, (x, room, i) => {
    if (room < 6) return room >= 1 ? { gap: room, kind: 'garden' } : null;
    const w = room <= 14 ? room : 8 + Math.floor(rnd(x, y0 + y1, 51) * 5), floors = 3 + Math.floor(rnd(x, y0, 52) * 3);
    if (!north && (i === 0 || room <= 14) && rnd(x, y1, 53) < 0.3) return { ...cornerStore(x, y1, w, floors), depth };
    return { w, depth, arch: 'walkup', ...(north ? { face: 'N' } : { door: x + Math.floor(w * 0.22 + 0.3) }), home: { kind: 'apartment' }, whole: true, art: walkArt(x, north ? y0 : y1, w, floors) };
  }, { ...(north ? { north: true } : {}), ...(mask ? { mask } : {}) });
  // A courtyard block (D4): walk-ups on both streets, the court between - its trees, benches and picnic tables, now and
  // then a half court
  const courtBlock = (x0, x1, y0, y1, o = {}) => {
    const h = y1 - y0 + 1, depth = Math.max(8, Math.min(11, Math.floor((h - 7) / 2)));
    walkRow(x0, x1, y0, y1, depth, true, o.mask);
    walkRow(x0, x1, y0, y1, depth, false, o.mask);
    const cy0 = y0 + depth, cy1 = y1 - depth, cy = (cy0 + cy1 + 1) / 2;
    if (cy1 - cy0 < 2) return;
    let court = !!o.court && cy1 - cy0 >= 10;
    for (let x = x0 + 4; x < x1 - 3; x += 9) {
      if (!K.free(Math.floor(x), Math.floor(cy))) continue;
      if (court && x > (x0 + x1) / 2 - 9 && K.allFree(Math.floor(x), cy0 + 1, 15, cy1 - cy0 - 1)) {
        court = false;
        K.fill(Math.floor(x), cy0 + 1, 15, cy1 - cy0 - 1, T.LOT);
        prop('court', x + 7.5, cy0 + 1.6, 0, { w: 14 * TILE, d: (cy1 - cy0 - 2.5) * TILE, c1: '#3a5a9a', c2: '#c86a3a' }); prop('hoop', x + 7.5, cy0 + 2.2, 6);
        (m.courtSpots ||= []).push({ x: Math.round((x + 7.5) * TILE), y: Math.round(cy * TILE), w: 14, h: cy1 - cy0 - 2, name: o.court });
        x += 9;
        continue;
      }
      prop(pick(['tree_a', 'tree_b'], rnd(x, cy, 55)), x, cy, 12, { sp: pick(['street', 'maple', 'oak', 'cherry', 'streetPl'], rnd(x, cy, 56)), k: 1.1 });
      if (rnd(x, cy, 57) < 0.45 && K.free(Math.floor(x + 3), Math.floor(cy))) prop(rnd(x, cy, 58) < 0.5 ? 'bench_m' : 'picnic', x + 3, cy + 0.4, 0);
      else if (rnd(x, cy, 59) < 0.5 && K.free(Math.floor(x + 4), Math.floor(cy - 1))) prop(pick(['flowers_big', 'bikerack', 'planter_g'], rnd(x, cy, 60)), x + 4.5, cy - 0.5, 0);
    }
  };
  // A terrace of brick row houses (WC315, WC002's brownstones): narrow houses side by side, three floors, a stoop each and
  // the iron railings either side of it; north: their doors on the street north of them and their back yards behind
  // them to the south - an allotment each (a bed, a shed or a wheelbarrow), a fence between
  const terrace = (x0, x1, y0, y1, o = {}) => {
    const north = !!o.north;
    const made = K.row(x0, x1, y0, y1, (x, room, i) => {
      if (room < 5) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      if (o.corner && i === 0 && !north && room >= 9) { out.shops++; return { ...cornerStore(x, y1, 9, 3), depth: o.depth || 10 }; }
      const w = room <= 9 ? room : 6 + Math.floor(rnd(x, y0 + y1, 140) * 2);
      const r = rnd(x, y0 + y1, 141), brick = r < 0.55, brown = r >= 0.55 && r < 0.85;
      const face = brick ? { style: 'brick', brickTone: pick(BRICK, rnd(x, y1, 142)) } : brown ? { style: 'stone', wallColor: pick(BROWN, rnd(x, y1, 143)) } : { style: 'stucco', wallColor: pick(PAINT, rnd(x, y1, 144)) };
      out.homes++;
      const spec = { floors: rnd(x, y1, 145) < 0.75 ? 3 : 2, ...face, win: rnd(x, y1, 146) < 0.55 ? 'bay' : 'tall', cornice: brick ? 'dentil' : 'bracket', parapet: 6, grime: 0.08 + rnd(x, y1, 147) * 0.12, roofMat: pick(['tar', 'gravel', 'membrane'], rnd(x, y1, 148)), lip: 6, rimW: 4, blades: [], plaques: [] };
      return { w, depth: o.depth || 10, arch: 'walkup', ...(north ? { face: 'N' } : { door: x + Math.floor(w * 0.22 + 0.3) }), home: { kind: 'house' }, whole: true, art: { spec, noShop: true } };
    }, north ? { north: true } : {});
    for (const b of made) {
      if (!b || b.gap || b.tw === undefined) continue;
      if (!north && b.door) {
        // the front area: railings either side of the steps, a pot by the door, the bins
        const fy = b.ty + b.th, dx = b.door.tx;
        if (dx - b.tx >= 2) prop('fenceline', b.tx + 0.2, fy + 0.8, 0, { kind: 'iron', tx: Math.round((dx - b.tx - 0.4) * TILE), ty: 0 });
        if (b.tx + b.tw - dx - 1 >= 2) prop('fenceline', dx + 1.2, fy + 0.8, 0, { kind: 'iron', tx: Math.round((b.tx + b.tw - dx - 1.4) * TILE), ty: 0 });
        prop(pick(['potted', 'planter_fl', 'flowers_a', 'trashcan'], rnd(dx, fy, 149)), dx + (dx - b.tx > 2 ? -1 : 1.6), fy + 0.5, 0);
      }
      if (north) {
        // the back yard to the south: an allotment
        const yb = b.ty + b.th, deep = o.yard || 0;
        if (deep < 3) continue;
        for (let yy = yb; yy < yb + deep; yy++) for (let xx = b.tx; xx < b.tx + b.tw; xx++) if (K.free(xx, yy)) K.take(xx, yy, 1, 1);
        const r = rnd(b.tx, yb, 150);
        if (deep >= 4) prop('raisedbed', b.tx + b.tw / 2, yb + 1.6, 0, { v: Math.floor(r * 5) });
        if (deep >= 6) prop(r < 0.45 ? 'shed' : r < 0.75 ? 'wheelbarrow' : 'flowers_big', b.tx + b.tw / 2 + (r < 0.45 ? 0.6 : 0), yb + deep - 2, r < 0.45 ? 18 : 0);
        prop('fenceline', b.tx + 0.1, yb, 0, { kind: 'picket', tx: 0, ty: Math.round((deep - 0.4) * TILE) });
      }
    }
    return made;
  };

  allotmentRow();
  communityGarden();
  lindenPark();
  highStreet();
  betweenTheAvenues();
  sportsGround();
  eastSide();
  K.landscape({ bare: 0.4, tree: (x, y, r) => r < 0.85 ? [rnd(x, y, 830) < 0.5 ? 'tree_a' : 'tree_b', pick(['street', 'maple', 'oak', 'streetPl', 'cherry'], rnd(x, y, 831)), 1.05 + rnd(x, y, 832) * 0.2] : [pick(['shrub_a', 'bush_c', 'flowers_a'], rnd(x, y, 833)), null, 1] });
  void api; void tile; void shopsPlaced;
  return out;

  // ===========================================================================================================
  // Allotment Row (WC315), Linden Street to Westside Avenue and on to Bridge Avenue north of 2nd Street: terraces back to
  // back on the streets, the lanes between their back yards
  function allotmentRow() {
    for (const [x0, x1] of [[NX.linden + 5, NX.westside - 7], [NX.westside + 7, NX.rowan - 5], [NX.rowan + 5, NX.bridge - 7]]) {
      // 24th Street to 1st Street: two terraces back to back, their yards between
      terrace(x0, x1, NY.t24 + 5, NY.t24 + 17, { north: true, yard: 5 });
      terrace(x0, x1, NY.first - 17, NY.first - 5, { corner: x0 === NX.linden + 5 });
    }
    // 1st Street to 3rd Street (Linden to Westside): north-facing terraces on the streets, south-facing on the lanes'
    // far side - the yards on the lanes
    const xa = NX.linden + 5, xb = NX.westside - 7;
    for (const [ys, yl, yn] of [[NY.first, NY.allot, NY.second], [NY.second, NY.orchard, NY.third]]) {
      terrace(xa, xb, ys + 5, yl - 3, { north: true, yard: Math.max(0, yl - 3 - (ys + 5) - 10) });
      terrace(xa, xb, yl + 3, yn - 5, { corner: ys === NY.second });
    }
    // Westside to Rowan, 1st to 2nd Street: a courtyard block (Rowan Court) with its half court
    courtBlock(NX.westside + 7, NX.rowan - 5, NY.first + 5, NY.second - 5, { court: 'Rowan Court' });
    (out.places ||= []).push({ name: 'Allotment Row', x0: NX.linden, y0: NY.t24, x1: NX.westside, y1: NY.third });
  }

  // ===========================================================================================================
  // Northgate Community Garden (WC315's heart), 3rd Street to 6th Street from Linden Street to the Gulf Loop: the beds in
  // rows, the greenhouse, the tool shed, the arbour gate on 3rd Street with the market stalls by it, the sign; on the
  // corner of Linden Street the Morning Crumb Bakery and the Daily Grind with their tables out
  function communityGarden() {
    const G = area(NX.linden, NY.third, NX.linden + 60, NY.sixth);
    if (!G) return;
    const y0 = G[1], y1 = G[3] - 1;
    // the bakery and the café on 6th Street's corner of Linden Street (facing south onto 6th Street)
    const shops = K.row(NX.linden + 5, NX.linden + 30, y0, y1, (x, room, i) => {
      const L = [{ w: 11, name: 'Morning Crumb Bakery', store: 'cafe', awning: ['#c8702a', '#f0ece4'], poi: { kind: 'coffee', label: 'Morning Crumb Bakery', food: true } },
        { w: 10, name: 'The Daily Grind', store: 'cafe', awning: ['#2f6a4e', '#f0ece4'], poi: { kind: 'coffee', label: 'The Daily Grind' } }][i];
      if (!L || room < L.w) return null;
      return { w: L.w, depth: 12, arch: 'mixed', name: L.name, poi: L.poi, home: { kind: 'apartment' }, whole: true, art: walkArt(x, y1, L.w, 3, { name: L.name, store: L.store, awning: L.awning }) };
    });
    for (const b of shops) if (b && !b.gap) { out.shops++; for (let k = 0; k < 2; k++) prop('cafetable', b.tx + 2.5 + k * 4, b.ty + b.th + 1.5, 0); }
    // the garden from the café to the loop's deck
    let gx0 = G[0] + 27, gx1 = gx0;
    while (gx1 < NX.westside && K.free(gx1, y0 + 2) && K.free(gx1, y1 - 2)) gx1++;
    gx1 -= 2;
    const w = gx1 - gx0, h = y1 - y0 + 1;
    if (w < 24) return;
    for (let yy = y0; yy <= y1; yy++) for (let xx = gx0; xx < gx1; xx++) if (K.free(xx, yy)) K.take(xx, yy, 1, 1);
    const mx = gx0 + Math.floor(w / 2);
    K.paint(mx - 1, y0, 2, h, T.DIRT); K.paint(gx0 + 2, y0 + Math.floor(h / 2), w - 4, 1, T.DIRT);
    for (let yy = y0 + 3; yy < y1 - 3; yy += 4) for (let bx = gx0 + 3; bx + 4 < gx1 - 1; bx += 6) if (Math.abs(bx + 2 - mx) > 3 && Math.abs(yy + 1 - (y0 + h / 2)) > 1.5) prop('raisedbed', bx + 2, yy + 1, 0, { v: (bx * 7 + yy) % 5 });
    prop('greenhouse', gx1 - 7, y0 + 5, 26);
    prop('shed', gx0 + 4, y1 - 4, 18);
    for (const [tx, ty] of [[gx0 + 2, y0 + 2], [gx1 - 3, y1 - 3]]) prop('tree_b', tx, ty, 12, { sp: 'cherry', k: 1.2 });
    prop('bench_m', mx + 3, y0 + h / 2 + 0.6, 0); prop('wheelbarrow', gx0 + 8, y1 - 3, 0); prop('scarecrow', mx + 10, y0 + 6, 0);
    // the arbour gate on 3rd Street, the stalls by it, the sign; the picket fence round
    prop('gatearch', mx, y0 + 0.4, 0, { w: 3 * TILE });
    prop('mstall', mx - 6, y0 + 1.6, 10, { v: 1, c: 1, a: 0 }); prop('mstall', mx + 7, y0 + 1.6, 10, { v: 3, c: 3, a: 0 });
    prop('fenceline', gx0 + 0.2, y0 + 0.3, 0, { kind: 'picket', tx: (mx - 1.8 - gx0) * TILE, ty: 0 });
    prop('fenceline', mx + 1.8, y0 + 0.3, 0, { kind: 'picket', tx: (gx1 - 0.2 - mx - 1.8) * TILE, ty: 0 });
    prop('fenceline', gx0 + 0.2, y1 + 0.6, 0, { kind: 'picket', tx: (w - 0.4) * TILE, ty: 0 });
    prop('fenceline', gx0 + 0.2, y0 + 0.3, 0, { kind: 'picket', tx: 0, ty: (h - 0.2) * TILE });
    prop('fenceline', gx1 - 0.2, y0 + 0.3, 0, { kind: 'picket', tx: 0, ty: (h - 0.2) * TILE });
    prop('textsign', mx, y0 + 1, 0, { text: 'NORTHGATE GARDEN', bg: '#2f6a4e', fg: [250, 240, 200], z: 30, sx: 1 });
    (out.places ||= []).push({ name: 'Northgate Community Garden', x0: gx0, y0, x1: gx1, y1: y1 + 1 });
  }

  // ===========================================================================================================
  // Linden Park (WC069), 6th Street to 9th Street from Linden Street to the Gulf Loop: the five-a-side pitch fenced
  // round with its bleachers and floodlights (a soccer venue), the lily pond behind its railing, paths, flower beds,
  // benches; south of 9th Street to 11th Street, the dog run and the car park under the deck
  function lindenPark() {
    const A = area(NX.linden, NY.sixth, NX.linden + 60, NY.ninth);
    if (!A) return;
    const [x0, y0, ax1, ay1] = A, y1 = ay1 - 1;
    let x1 = x0;
    while (x1 < NX.westside && K.free(x1, y0 + 2) && K.free(x1, Math.floor((y0 + y1) / 2)) && K.free(x1, y1 - 2)) x1++;
    const w = x1 - x0 - 1, h = y1 - y0 + 1;
    void ax1;
    if (w < 40) return;
    K.fill(x0, y0, w, h, T.GRASS); K.take(x0, y0, w, h);
    // the pitch in the west half: turf in chain-link half as long again as it's wide (it was 30 long, twice its width:
    // the owner, 10-16, "Soccer fields are far too long"), the bleachers along its north side
    const py0 = y0 + 5, py1 = y1 - 2, px0 = x0 + 3, px1 = px0 + Math.round((py1 - py0) * PITCH_LONG);
    m.venues.push({ id: m.venues.length, kind: 'soccer', name: 'Linden Park Pitch', rect: { x: px0 * TILE, y: py0 * TILE, w: (px1 - px0) * TILE, h: (py1 - py0) * TILE }, goalW: 4 * TILE });
    prop('bleachers', (px0 + px1) / 2, py0 - 3.2, 10, { len: Math.round((px1 - px0 - 10) * TILE / 2), rows: 3 });
    const fx0 = px0 - 1.4, fx1 = px1 + 1.4, fy0 = py0 - 1.4, fy1 = py1 + 1.4;
    prop('chainfence', fx0, fy0, 0, { tx: (fx1 - fx0) * TILE, ty: 0 }); prop('chainfence', fx0, fy1, 0, { tx: (fx1 - fx0 - 4) * TILE, ty: 0 });
    prop('chainfence', fx0, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE }); prop('chainfence', fx1, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE });
    for (const [lx, ly] of [[fx0, fy0], [fx1, fy0], [fx0, fy1], [fx1, fy1]]) prop('ymast', lx, ly, 0, { tall: 130 });
    (out.places ||= []).push({ name: 'Linden Park Pitch', x0: px0, y0: py0, x1: px1, y1: py1 });
    // the lily pond in the east half behind its railing: water, lilies, rocks, the path round it
    const qx0 = px1 + 6, qx1 = Math.min(x1 - 5, qx0 + 22), qy0 = y0 + 5, qy1 = y1 - 5;
    if (qx1 - qx0 >= 12) {
      const cx = (qx0 + qx1) / 2, cy = (qy0 + qy1) / 2, rx = (qx1 - qx0) / 2, ry = (qy1 - qy0) / 2;
      for (let yy = qy0 - 2; yy <= qy1 + 2; yy++) for (let xx = qx0 - 2; xx <= qx1 + 2; xx++) {
        const e = ((xx + 0.5 - cx) / (rx + 1.5)) ** 2 + ((yy + 0.5 - cy) / (ry + 1.5)) ** 2;
        if (e < 1 && e >= ((rx - 0.5) / (rx + 1.5)) ** 2) m.tiles[yy * m.w + xx] = T.PLAZA;
      }
      for (let yy = qy0; yy <= qy1; yy++) for (let xx = qx0; xx <= qx1; xx++) {
        const e = ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2;
        if (e < 0.82) m.set(xx, yy, T.WATER);
      }
      for (let k = 0; k < 7; k++) { const a = k * 0.9 + rnd(k, cy, 160); prop('lily', cx + Math.cos(a) * rx * 0.5, cy + Math.sin(a) * ry * 0.45, 0, { v: k % 3 }); }
      for (let k = 0; k < 5; k++) { const a = k * 1.3 + 0.4; prop('boulder', cx + Math.cos(a) * rx * 0.92, cy + Math.sin(a) * ry * 0.92, 8, { s: 14 + (k % 3) * 4 }); }
      for (let a = 0.2; a < Math.PI * 2; a += 0.55) prop('rail', cx + Math.cos(a) * (rx + 0.6), cy + Math.sin(a) * (ry + 0.6), 0, { tx: Math.round(-Math.sin(a) * 2 * TILE), ty: Math.round(Math.cos(a) * 2 * TILE) });
      for (const dx of [-rx - 2.5, rx + 2.5]) prop('bench_m', cx + dx, cy + 0.5, 0);
      (out.places ||= []).push({ name: 'Linden Park Pond', x0: qx0, y0: qy0, x1: qx1, y1: qy1 });
    }
    // the paths: in from 6th Street, round the pitch to the pond, out to 9th Street; flower beds, lamps
    K.paint(x0, y0 + 2, w, 2, T.PLAZA); K.paint(x0, y1 - 2, w, 2, T.PLAZA);
    K.paint(px1 + 2, y0 + 2, 2, h - 4, T.PLAZA);
    for (let xx = x0 + 3; xx < x0 + w - 2; xx += 6) prop(pick(['flowers_big', 'flowers_a', 'shrub_a'], rnd(xx, y0, 161)), xx + 0.5, y0 + 1, 0);
    for (let xx = x0 + 6; xx < x0 + w - 2; xx += 12) prop('lamp', xx, y1 - 0.6, 0);
    prop('parksign', x0 + 2, y1 - 3.5, 0, { text: 'LINDEN PARK' });
    (out.places ||= []).push({ name: 'Linden Park', x0, y0, x1: x0 + w, y1: y1 + 1 });
    // the dog run: 9th Street to 11th Street, Sycamore Street to the deck - a fenced lawn, its gate, a bench, the bins
    {
      const B = area(NX.sycamore, NY.ninth, NX.sycamore + 30, NY.eleventh);
      const [dx0, dy0] = B || [0, 0], dy1 = B ? B[3] - 1 : 0;
      let dx1 = dx0;
      while (B && dx1 < NX.westside && K.free(dx1, dy0 + 2) && K.free(dx1, dy1 - 2)) dx1++;
      dx1 -= 1;
      if (B && dx1 - dx0 >= 10 && dy1 - dy0 >= 8) {
        K.fill(dx0, dy0, dx1 - dx0, dy1 - dy0 + 1, T.GRASS); K.take(dx0, dy0, dx1 - dx0, dy1 - dy0 + 1);
        prop('chainfence', dx0 + 0.3, dy0 + 0.3, 0, { tx: (dx1 - dx0 - 0.6) * TILE, ty: 0 }); prop('chainfence', dx0 + 0.3, dy1 + 0.6, 0, { tx: (dx1 - dx0 - 3.6) * TILE, ty: 0 });
        prop('chainfence', dx0 + 0.3, dy0 + 0.3, 0, { tx: 0, ty: (dy1 - dy0 + 0.3) * TILE }); prop('chainfence', dx1 - 0.3, dy0 + 0.3, 0, { tx: 0, ty: (dy1 - dy0 + 0.3) * TILE });
        prop('tires', dx0 + 4, dy0 + 4, 8); prop('log', dx0 + 9, dy0 + 6, 6); prop('bench_m', dx1 - 3, dy1 - 1.4, 0); prop('trashcan', dx1 - 1.5, dy1 - 1, 8);
        prop('tree_a', dx0 + 3, dy1 - 2, 12, { sp: 'oak', k: 1.15 });
        prop('textsign', (dx0 + dx1) / 2, dy1 + 0.4, 0, { text: 'DOG RUN', bg: '#3a5a3a', fg: [240, 236, 220], z: 20, sx: 1 });
        (out.places ||= []).push({ name: 'Linden Dog Run', x0: dx0, y0: dy0, x1: dx1, y1: dy1 + 1 });
      }
    }
    // Linden Street to Sycamore Street, 9th to 11th: a terrace on 11th Street, its yards behind
    terrace(NX.linden + 5, NX.sycamore - 5, NY.ninth + 5, NY.eleventh - 5, {});
  }

  // ===========================================================================================================
  // 9th Street, the high street (WC002), from the Gulf Loop to Spruce Street: shops under three- and four-storey
  // walk-ups along its north side, their awnings and signs, the crates out at the grocer's, a bus shelter mid-way,
  // bike racks, the news boxes; the walk-ups behind them face 6th and 7th Streets
  function highStreet() {
    for (const [x0, x1] of [[NX.linden + 5, NX.westside - 7], [NX.westside + 7, NX.rowan - 5], [NX.rowan + 5, NX.bridge - 7], [NX.bridge + 7, NX.maple - 5], [NX.maple + 5, NX.spruce - 5]]) {
      const y0 = NY.sixth + 5, y1 = NY.ninth - 5;
      if (x0 === NX.linden + 5) continue;   // (Linden Park)
      // the walk-ups facing 6th/7th Street at the band's north edge (their backs on the shops' yards)
      walkRow(x0, x1, y0, y1 - 13, 10, true);
      const made = K.row(x0, x1, y0, y1, (x, room) => {
        if (room < 7) return room >= 1 ? { gap: room, kind: 'passage' } : null;
        const S = HIGH[hi++ % HIGH.length], w = Math.min(room, 9 + Math.floor(rnd(x, y1, 170) * 4)), floors = 3 + Math.floor(rnd(x, y1, 171) * 2);
        out.shops++;
        return { w, depth: 12, arch: 'mixed', name: S[0], ...(S[2] ? { poi: { kind: S[2], label: S[0], ...(S[1] === 'diner' || S[0].includes('Bagel') ? { food: true } : {}) } } : { poi: { kind: 'delivery', label: S[0] } }), home: { kind: 'apartment' }, whole: true,
          art: walkArt(x, y1, w, floors, { name: S[0], store: S[1], awning: S[3] }) };
      });
      for (const b of made) {
        if (!b || b.gap || b.tw === undefined) continue;
        const fy = b.ty + b.th;
        if (/Grocer/.test(b.name || '')) for (let k = 0; k < 3; k++) prop(k % 2 ? 'produce_b' : 'produce_a', b.tx + 2 + k * 2.2, fy + 1.2, 0);
        if (/Coffee|Bagel|Pizza|Noodle/.test(b.name || '')) prop('cafetable', b.tx + b.tw - 2.5, fy + 1.6, 0);
      }
      // the street's furniture on its north pavement: a bus shelter mid-way, bike racks, news boxes, a hydrant
      const mid = Math.round((x0 + x1) / 2);
      prop('busstop', mid, y1 + 2.6, 0);
      prop('bikerack', x0 + 3, y1 + 2.4, 0); prop(pick(['news_a', 'news_b', 'news_c'], rnd(x0, y1, 172)), x1 - 4, y1 + 2.2, 0); prop('hydrant', x1 - 1.5, y1 + 2.6, 6);
    }
    (out.places ||= []).push({ name: '9th Street', x0: NX.westside, y0: NY.sixth, x1: NX.spruce, y1: NY.ninth });
  }

  // ===========================================================================================================
  // Between the avenues: Westside Avenue to Spruce Street from 2nd Street to 7th Street round the Gulf Loop's curve and
  // the North Spur's junction (courtyard walk-ups where the blocks are whole, rows along the streets where the deck has
  // cut them), and the blocks south of 9th Street to Trestle Street west of Bridge Avenue
  function betweenTheAvenues() {
    // 1st Street to 2nd Street east of Rowan; 24th to 1st along the North Spur (a row each side of its deck)
    courtBlock(NX.rowan + 5, NX.bridge - 7, NY.first + 5, NY.second - 5);
    walkRow(NX.bridge + 7, NX.maple - 5, NY.t24 + 5, NY.first - 5, 11);
    walkRow(NX.maple + 5, NX.spruce - 5, NY.t24 + 5, NY.first - 5, 11, true);
    walkRow(NX.maple + 5, NX.spruce - 5, NY.t24 + 5, NY.first - 5, 11);
    walkRow(NX.bridge + 7, NX.maple - 5, NY.first + 5, NY.first + 20, 10, true);
    walkRow(NX.maple + 5, NX.spruce - 5, NY.first + 5, NY.first + 20, 10, true);
    // the curve's blocks: 2nd/3rd Street to 6th/7th Street, Westside Avenue to Bridge Avenue - rows facing the streets on
    // whatever ground the deck leaves
    walkRow(NX.westside + 7, NX.rowan - 5, NY.second + 5, NY.second + 18, 10, true);
    walkRow(NX.westside + 7, NX.rowan - 5, NY.sixth - 18, NY.sixth - 5 - 13, 10);
    walkRow(NX.rowan + 5, NX.bridge - 7, NY.sixth - 20, NY.sixth - 5 - 13, 10);
    walkRow(NX.bridge + 7, NX.maple - 5, NY.third - 4, NY.sixth - 5 - 13, 10);
    courtBlock(NX.maple + 5, NX.spruce - 5, NY.third + 5, NY.sixth - 5 - 13 + 12);
    // the car parks under the decks: the Gulf Loop's curve and the North Spur's junction (LOT under them already: bays,
    // lamps, a pay station)
    for (const [x0, x1, y0, y1, name] of [[NX.westside + 6, NX.bridge - 6, NY.second + 4, NY.sixth - 4, 'Loop Lot'], [NX.bridge + 6, NX.spruce - 6, NY.first + 20, NY.third + 2, 'Spur Lot']]) {
      let n = 0;
      for (let y = y0 + 1; y < y1 - 4; y += 6) for (let x = x0 + 1; x < x1 - 3; x += 3) {
        let ok = true;
        for (let yy = y; yy < y + 4 && ok; yy++) for (let xx = x; xx < x + 3 && ok; xx++) if (tile(xx, yy) !== T.LOT || m.bld[yy * m.w + xx] >= 0) ok = false;
        if (!ok) continue;
        m.stalls.push({ x: x * TILE, y: y * TILE, w: 3 * TILE, h: 4 * TILE }); n++;
        if (rnd(x, y, 175) < 0.45) m.parking.push({ x: (x + 1.5) * TILE, y: (y + 2) * TILE, a: (y / 6) % 2 < 1 ? Math.PI / 2 : -Math.PI / 2 });
      }
      if (n) (out.places ||= []).push({ name, x0, y0, x1, y1 });
    }
    // 9th Street to Trestle Street, Westside Avenue to Bridge Avenue: courtyard walk-ups
    courtBlock(NX.westside + 7, NX.rowan - 5, NY.ninth + 5, NY.trestle - 6);
    courtBlock(NX.rowan + 5, NX.bridge - 7, NY.ninth + 5, NY.trestle - 6, { court: 'Garden Street Court' });
    // west of Westside Avenue between the deck and the avenue: rows along 9th and 11th
    walkRow(NX.sycamore + 5, NX.westside - 7, NY.ninth + 5, NY.eleventh - 5, 10);
  }

  // ===========================================================================================================
  // Northgate Sports Ground (WC089), 9th Street to Trestle Street from Bridge Avenue to Spruce Street: two tennis courts,
  // two basketball courts, chain-link round them, the clubhouse pavilion, bleachers, lamps
  function sportsGround() {
    const A = area(NX.bridge, NY.ninth, NX.spruce, NY.trestle);
    if (!A || !K.allFree(A[0], A[1], A[2] - A[0], A[3] - A[1])) { courtBlock(NX.bridge + 7, NX.maple - 5, NY.ninth + 5, NY.trestle - 6); courtBlock(NX.maple + 5, NX.spruce - 5, NY.ninth + 5, NY.trestle - 6); return; }
    const [x0, y0, x1, ay1] = A, y1 = ay1 - 1;
    K.fill(x0, y0, x1 - x0, y1 - y0 + 1, T.LOT); K.take(x0, y0, x1 - x0, y1 - y0 + 1);
    const ch = Math.min(26, y1 - y0 - 3), cw = 14, cy0 = y0 + 2, n = Math.min(6, Math.floor((x1 - x0 - 16) / (cw + 1)));
    for (let k = 0; k < n; k++) {
      const cx = x0 + 2 + k * (cw + 1), mx = cx + cw / 2, tennis = k < 2 || k >= n - 1;
      if (tennis) { prop('court', mx, cy0, 0, { w: cw * TILE, d: ch * TILE, k: 'tennis', c1: '#3a7e86', c2: '#3a6a4e' }); prop('tnet', mx, cy0 + ch / 2, 0, { len: (cw - 2) * TILE, a: Math.PI / 2 }); }
      else {
        prop('court', mx, cy0, 0, { w: cw * TILE, d: ch * TILE, c1: k % 2 ? '#3a5a9a' : '#9a3a3a', c2: '#c86a3a' }); prop('hoop', mx, cy0 + 0.6, 6);
        (m.courtSpots ||= []).push({ x: Math.round(mx * TILE), y: Math.round((cy0 + ch / 2) * TILE), w: cw, h: ch, name: 'Northgate Sports Ground' });
      }
    }
    const fx0 = x0 + 1.2, fx1 = x0 + 2 + n * (cw + 1) - 0.2, fy0 = cy0 - 0.8, fy1 = cy0 + ch + 0.8;
    prop('chainfence', fx0, fy0, 0, { tx: (fx1 - fx0) * TILE, ty: 0 }); prop('chainfence', fx0, fy1, 0, { tx: (fx1 - fx0 - 4) * TILE, ty: 0 });
    prop('chainfence', fx0, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE }); prop('chainfence', fx1, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE });
    for (let k = 1; k < n; k++) prop('chainfence', x0 + 2 + k * (cw + 1) - 0.5, fy0, 0, { tx: 0, ty: (ch * 0.6) * TILE });
    for (const lx of [fx0, (fx0 + fx1) / 2, fx1]) prop('ymast', lx, fy0, 0, { tall: 120 });
    // the clubhouse at the east end, its bench and the vending machine
    const px0 = Math.ceil(fx1) + 2;
    if (x1 - px0 >= 8) {
      place({ x: px0, y: y0 + 2, w: Math.min(12, x1 - px0), h: 9, arch: 'mixed', name: 'Northgate Sports Ground', poi: { kind: 'delivery', label: 'Northgate Sports Ground' }, whole: true,
        art: { spec: { floors: 1, style: 'brick', brickTone: '#8e4a3a', win: 'pair', parapet: 6, grime: 0.08, roofMat: 'tar', lip: 6, rimW: 4, blades: [], plaques: [{ text: 'SPORTS GROUND', x: 20, v: 40, sx: 1, bg: '#2a3a5a', fg: [240, 236, 220], lit: true }] }, noShop: true } });
      prop('vending', px0 + 1, y0 + 12, 8); prop('bench_m', px0 + 5, y0 + 12.5, 0);
    }
    (out.places ||= []).push({ name: 'Northgate Sports Ground', x0, y0, x1, y1: y1 + 1 });
  }

  // ===========================================================================================================
  // East of Harborview Avenue to Stadium Avenue: the Harborview Diner on 1st Street's corner, walk-ups on 24th Street,
  // the sports bars facing the stadium; courtyard walk-ups north of the Gulf Loop's deck and the car park under it; the
  // Northgate Clinic and the fenced court mid-block south of it; courtyard walk-ups on 8th Street
  function eastSide() {
    const { harborview: hx, mapleE: mx, spruceE: sx, stadium: tx } = NX;
    // 24th Street to 1st Street: the diner on Harborview's corner, walk-ups, the sports bars by the stadium
    K.row(hx + 7, mx - 5, NY.t24 + 5, NY.first - 5, (x, room, i) => {
      if (i === 0 && room >= 14) {
        out.shops++;
        return { w: 14, depth: 12, arch: 'mixed', key: 'rest1', name: 'Harborview Diner', poi: { kind: 'coffee', label: 'Harborview Diner', food: true }, whole: true,
          art: { spec: { floors: 1, style: 'diner', win: 'even', parapet: 8, grime: 0.04, roofMat: 'metal', lip: 6, rimW: 4, blades: [], plaques: [] },
            shop: { kind: 'diner', door: 'right', open: true, people: 4, sign: { text: 'HARBORVIEW DINER', bg: '#c8302a', fg: [250, 246, 230], lit: true }, awning: ['#c8302a', '#f0ece4'] } } };
      }
      if (room < 6) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      const w = room <= 14 ? room : 8 + Math.floor(rnd(x, NY.t24, 180) * 5);
      return { w, depth: 11, arch: 'walkup', door: x + Math.floor(w * 0.22 + 0.3), home: { kind: 'apartment' }, whole: true, art: walkArt(x, NY.first, w, 3 + Math.floor(rnd(x, NY.first, 181) * 3)) };
    });
    walkRow(mx + 5, sx - 5, NY.t24 + 5, NY.first - 5, 11);
    K.row(sx + 5, tx - 7, NY.t24 + 5, NY.first - 5, (x, room, i) => {
      const L = [{ w: 13, name: 'The Bullpen', store: 'bar', sign: ['#1e3a5e', [240, 200, 80]] }, { w: 12, name: 'Fourth Quarter', store: 'bar', sign: ['#7a1e2a', [250, 240, 220]] }, { w: 10, name: 'Gameday Grill', store: 'diner', sign: ['#2a2a2a', [240, 120, 40]] }][i];
      if (!L) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
      if (room < L.w) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
      out.shops++;
      return { w: L.w, depth: 12, arch: 'nightrow', name: L.name, poi: { kind: 'coffee', label: L.name, food: L.store === 'diner' }, whole: true,
        art: { spec: { floors: 2, style: 'brick', brickTone: pick(BRICK, rnd(x, NY.t24, 182)), win: 'even', parapet: 6, grime: 0.1, roofMat: 'tar', lip: 6, rimW: 4, blades: [], plaques: [] },
          shop: { kind: L.store, door: 'left', open: true, people: 3, sign: { text: L.name.toUpperCase(), bg: L.sign[0], fg: L.sign[1], lit: true }, awning: [L.sign[0], L.sign[0]] } } };
    });
    // 1st Street to 5th Street: walk-ups facing 1st Street north of the deck (backs to it); rows on 5th Street south of
    // it; the car park under it
    for (const [a, b] of [[hx + 7, mx - 5], [mx + 5, sx - 5], [sx + 5, tx - 6]]) {
      walkRow(a, b, NY.first + 5, NY.first + 19, 10, true);
      walkRow(a, b, NY.first + 5, NY.first + 19, 10);
      walkRow(a, b, NY.third - 14, NY.third - 5, 9);
    }
    {
      let n = 0;
      for (let y = NY.first + 20; y < NY.third - 9; y += 6) for (let x = hx + 6; x < tx - 6; x += 3) {
        let ok = true;
        for (let yy = y; yy < y + 4 && ok; yy++) for (let xx = x; xx < x + 3 && ok; xx++) if (tile(xx, yy) !== T.LOT || m.bld[yy * m.w + xx] >= 0) ok = false;
        if (!ok) continue;
        m.stalls.push({ x: x * TILE, y: y * TILE, w: 3 * TILE, h: 4 * TILE }); n++;
        if (rnd(x, y, 185) < 0.5) m.parking.push({ x: (x + 1.5) * TILE, y: (y + 2) * TILE, a: Math.PI / 2 });
      }
      if (n) (out.places ||= []).push({ name: 'Stadium Overflow Lot', x0: hx, y0: NY.first + 18, x1: tx, y1: NY.third - 8 });
    }
    // 5th Street to 8th Street: the Northgate Clinic on Harborview's corner (WC072), the fenced court mid-block between
    // walk-ups, a courtyard block
    {
      const y0 = NY.third + 5, y1 = NY.sixth - 5;
      const cl = K.row(hx + 7, mx - 5, y0, y1, (x, room, i) => {
        if (i === 0 && room >= 22) {
          out.shops++;
          return { w: 22, depth: Math.min(16, y1 - y0 - 3), arch: 'mixed', name: 'Northgate Clinic', poi: { kind: 'delivery', label: 'Northgate Clinic' }, whole: true,
            art: { spec: { floors: 2, style: 'stucco', wallColor: '#e8e4dc', win: 'even', parapet: 8, grime: 0.03, roofMat: 'membrane', lip: 6, rimW: 4, blades: [], plaques: [{ text: 'NORTHGATE CLINIC', x: 24, v: 70, sx: 1, bg: '#2a7a6a', fg: [250, 250, 245], lit: true }] }, noShop: true } };
        }
        if (room < 6) return room >= 1 ? { gap: room, kind: 'garden' } : null;
        const w = room <= 14 ? room : 8 + Math.floor(rnd(x, y1, 186) * 5);
        return { w, depth: 11, arch: 'walkup', door: x + Math.floor(w * 0.22 + 0.3), home: { kind: 'apartment' }, whole: true, art: walkArt(x, y1, w, 3 + Math.floor(rnd(x, y1, 187) * 3)) };
      });
      for (const b of cl) if (b && b.name === 'Northgate Clinic') { const fy = b.ty + b.th; K.fill(b.tx, fy, b.tw, y1 - fy + 1, T.PLAZA); prop('bench_m', b.tx + 3, fy + 1.4, 0); prop('planter_g', b.tx + b.tw - 3, fy + 1.4, 10); }
      // the court mid-block: walk-ups on each side, the court between them in chain-link
      const cw = 16, cx0 = Math.round((mx + sx) / 2 - cw / 2);
      if (K.allFree(cx0, y0 + 2, cw, y1 - y0 - 3)) {
        K.fill(cx0, y0 + 2, cw, y1 - y0 - 3, T.LOT); K.take(cx0, y0 + 2, cw, y1 - y0 - 3);
        prop('court', cx0 + cw / 2, y0 + 3, 0, { w: (cw - 2) * TILE, d: (y1 - y0 - 6) * TILE, c1: '#5a5a62', c2: '#7a4a9a' }); prop('hoop', cx0 + cw / 2, y0 + 3.6, 6);
        prop('chainfence', cx0 + 0.3, y0 + 2.3, 0, { tx: (cw - 0.6) * TILE, ty: 0 }); prop('chainfence', cx0 + 0.3, y1 - 0.6, 0, { tx: (cw - 4) * TILE, ty: 0 });
        prop('chainfence', cx0 + 0.3, y0 + 2.3, 0, { tx: 0, ty: (y1 - y0 - 3) * TILE }); prop('chainfence', cx0 + cw - 0.3, y0 + 2.3, 0, { tx: 0, ty: (y1 - y0 - 3) * TILE });
        (m.courtSpots ||= []).push({ x: Math.round((cx0 + cw / 2) * TILE), y: Math.round(((y0 + y1) / 2) * TILE), w: cw - 2, h: y1 - y0 - 6, name: 'Spruce Street Court' });
        (out.places ||= []).push({ name: 'Spruce Street Court', x0: cx0, y0: y0 + 2, x1: cx0 + cw, y1 });
      }
      walkRow(mx + 5, sx - 5, y0, y1, 11);
      courtBlock(sx + 5, tx - 6, y0, y1);
    }
    // 8th Street to 9th Street: courtyard blocks
    for (const [a, b] of [[hx + 7, mx - 5], [mx + 5, sx - 5], [sx + 5, tx - 6]]) courtBlock(a, b, NY.sixth + 5, NY.ninth - 5);
  }
}
