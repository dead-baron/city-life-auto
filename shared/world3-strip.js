// World v3, handcrafted: The Strip (Lucky Mesa's district 60), from the owner's LuckyMesa-B2 (the Strip at street level
// at dusk, two views: the six-lane boulevard with its planted median of palms, agaves and cactus and banners on its lamp
// posts; the glass skybridge full of people across it; a gold glass resort tower in terraces with planted ledges and a
// two-stage waterfall down a stone wall into a lagoon with cabanas and loungers, its porte-cochere over a drive loop
// round a fountain, valets and taxis; a Pueblo-style adobe resort stepping back in terraces round a palm-island lagoon,
// its timber pergola over the drive, a fountain loop with cactus beds; a neon casino with a tall green-and-red neon
// cactus over its marquee, pink neon bands, a bar on its roof and a fountain loop in front; the multi-level car parks
// beside them) and the casino city's first concepts (VG1, VG3: a lotus-crowned tower, glass towers, a white spire, a
// lagoon resort behind its fountain lake):
//   - the Strip: Mesa Road (shared/world3-mesa.js lays it, pulled straight on its row) widened to a palm-median
//     boulevard (STRIP_ROAD: Neon Boulevard's section), its median planted - royal palms, agave and cactus beds, rocks,
//     banner poles - its pavements with bus stops; the skybridge across it between Mesa Grande and Casa del Sol;
//   - north of it, fronting south (the camera): The Golden Lotus, The Neon Saguaro (the neon cactus casino and its car
//     park), Mesa Grande (the gold tower in terraces, the waterfall lagoon), The Silver Lagoon (behind its lake of
//     fountains);
//   - south of it, fronting north: Starfall Tower, The Prism, Casa del Sol (the adobe resort round its lagoon) and its
//     car park;
//   - every resort a casino (a named place, GM3/GM4's gambling to come), its door on its podium's front, a drive loop
//     round a fountain under its porte-cochere, valets' taxis waiting, a pool and loungers.
// Old Downtown (61) and Mesa Flats (62) are world3-mesa.js's (the generator builds them). The resorts' looks are their
// buildings' art (art v2 statics.js) and their `resort` (the classic renderer's roofs). Names are invented; draws are
// fixed by place (hash2); no trigonometry (shared code: the world comes out the same in every engine).
import { TILE, T } from './constants.js';

const D = 60;   // The Strip (shared/mapcore.js DISTRICTS)
// (frame tiles: Lucky Mesa's streets round the district - world3-mesa.js MESA.streets: Silver Street on the west, Palm
// Row behind the north resorts, Lucky Street and Cactus Street, Mesa Flats Drive behind the south ones; the Strip on
// row 612 from Old Downtown to the hub)
export const SY = { palm: 548, strip: 612, flats: 690 };
export const SX = { silver: 5330, cactus: 5454, lucky: 5542, west: 5250, east: 5558 };
// the Strip's section: 13 tiles, two lanes each way either side of a 3-tile planted median (Neon Boulevard's)
export const STRIP_ROAD = { w: 13, median: 96 };
// the resorts' lots [x0, y0, x1, y1) (tiles), between the pavements (the Strip's 96 px: shared/roads.js SIDEWALK) and the
// side streets'; north of the Strip they front south, south of it north. (The camera looks north: a resort's towers
// stand at the back of its lot - behind its podium on the north side, at the far end of its grounds on the south, so
// they hide only their own gardens - and the lake resort is on the north side, its lake between the Strip and its hotel)
export const RESORTS = [
  { name: 'The Golden Lotus', look: 'lotus', lot: [5337, 554, 5389, 603], face: 'S' },
  { name: 'The Neon Saguaro', look: 'saguaro', lot: [5390, 554, 5438, 603], face: 'S' },
  { name: 'Mesa Grande', look: 'grande', lot: [5439, 554, 5491, 603], face: 'S' },
  { name: 'The Silver Lagoon', look: 'lake', lot: [5492, 554, 5537, 603], face: 'S' },
  { name: 'Starfall Tower', look: 'star', lot: [5337, 622, 5390, 686], face: 'N' },
  { name: 'The Prism', look: 'glass', lot: [5391, 622, 5448, 686], face: 'N' },
  { name: 'Casa del Sol', look: 'adobe', lot: [5461, 622, 5552, 686], face: 'N' },
];
// the skybridge across the Strip (tiles): its column, its towers' rows (Mesa Grande's forecourt, Casa del Sol's)
export const SKYBRIDGE = { x: 5480, north: 600, south: 622, z: 96 };

export const STRIP = { key: 'strip', d: D, rect: [5330, 552, 5552, 690], few: 20, specials: [], streets: () => [], build };

// night lights (art v2: [dx, dy, z, r, colour, strength, kind] from a building's south-west corner)
const C = { gold: [1, 0.8, 0.35], pink: [1, 0.3, 0.75], cyan: [0.3, 0.9, 1], white: [0.95, 0.95, 1], violet: [0.65, 0.4, 1], red: [1, 0.3, 0.3], green: [0.4, 1, 0.55], warm: [1, 0.78, 0.5] };
const neon = (w, d, z, col, n = 3) => { const L = []; for (let k = 0; k <= n; k++) L.push([w * TILE * k / n, -2, z, 150, col, 1.3, 'neon'], [w * TILE * k / n, -d * TILE + 2, z, 150, col, 1.3, 'neon']); return L; };
const crown = (w, d, z, col) => [w * TILE / 2, -d * TILE / 2, z, 320, col, 2.2, 'neon'];
// (a building's ground-floor windows, px from its west end, every `gap` px clear of [a, b] - its doors)
const winRow = (w, gap = 40, avoid = []) => { const out = []; for (let x = 14; x + 16 <= w * TILE - 14; x += gap) if (!avoid.some(([a, b]) => x + 16 > a - 6 && x < b + 6)) out.push(x); return out; };

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const W = m.w;
  const out = { resorts: [], casinos: 0, pools: 0, palms: 0, loops: 0, cabanas: 0, garages: 0, median: 0, buildings: 0 };
  const tile = (x, y) => (m.inside(x, y) ? m.tiles[y * W + x] : -1);
  const palm = (x, y, sp = 'royal', k = 1.2) => { prop('palm_a', x, y, 10, { sp, k }); out.palms++; };
  const bed = (x, y, r) => { const sp = pick(['agave', 'barrel', 'pear', 'agave', 'yucca', 'cholla'], r); prop('shrub_a', x, y, 0, { sp, k: 1 }); };
  // a pool: water tiles on its deck, its record (art v2 paints it tiled; shared/map.js pools), loungers along a side
  const pool = (x, y, w, h, o = {}) => {
    K.paint(x - 1, y - 1, w + 2, h + 2, T.PLAZA);
    let n = 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (o.round && ((xx === x || xx === x + w - 1) && (yy === y || yy === y + h - 1))) continue;   // (its corners rounded)
      if ((o.skip && o.skip(xx, yy)) || tile(xx, yy) !== T.PLAZA) continue;
      m.set(xx, yy, T.WATER); n++;
    }
    (m.pools ||= []).push({ x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE, lanes: 0, ...(o.basin ? { basin: true } : {}), deck: { x: (x - 1) * TILE, y: (y - 1) * TILE, w: (w + 2) * TILE, h: (h + 2) * TILE } });
    if (o.loungers !== false) for (let k = 1; k + 1 < w; k += 3) { const ly = o.north ? y - 1.2 : y + h + 1.1; prop(k % 6 === 4 ? 'umbrella_r' : 'lounger', x + k + 0.5, ly, 0, k % 6 === 4 ? null : { a: Math.PI / 2, v: (x + k) % 4 }); }
    out.pools++;
    return n;
  };
  // a cabana (a white canvas daybed tent by a pool)
  const cabana = (x, y, v = 0) => { prop('cabana', x, y, 14, { v }); out.cabanas++; };

  // ===========================================================================================================
  // The resorts: each lot in its own terms - fx across from its west edge, fd back from its front (the Strip's side)
  for (const R0 of RESORTS) {
    const [x0, y0, x1, y1] = R0.lot, S = R0.face === 'S', LW = x1 - x0;
    const R = { ...R0, x0, y0, x1, y1, S, LW, blds: [], main: null };
    const rect = (fx, fd, w, d) => [x0 + fx, S ? y1 - fd - d : y0 + fd, w, d];
    // a point (tile coordinates, fractional) fx across, fd back
    const at = (fx, fd) => [x0 + fx, S ? y1 - fd : y0 + fd];
    // (the tile fx across, fd rows back from the front: fd 0 the lot's front row)
    const cell = (fx, fd) => [x0 + fx, S ? y1 - 1 - fd : y0 + fd];
    R.rect = rect; R.at = at; R.cell = cell;
    // a resort building (fx, fd, w wide, d deep), drawn whole; the first with `main` is the casino: its door on the
    // front, its place (fixed, a casino); the others have no door of their own
    const put = (fx, fd, w, d, name, spec, lights = [], o = {}) => {
      const [x, y] = rect(fx, fd, w, d);
      const art = { spec: { blades: [], balconies: false, ...spec }, lights, kit: o.kit || roofKit(w, d, spec), resort: R.look, ...(o.shop ? { shop: o.shop } : { noShop: true }), ...(o.neon ? { neon: o.neon } : {}) };
      const b = K.building({ x, y, w, h: d, key: o.key || 'hotel', arch: o.arch || 'hotel', name, whole: true, ...(S ? {} : { face: 'N' }), art,
        ...(o.main ? { door: x + (o.door ?? (w >> 1)), poi: { kind: 'delivery', label: R.name } } : { door: null, poi: false }) });
      if (!b) return null;
      R.blds.push(b);
      if (o.main) {
        R.main = b;
        const p = m.pois[m.pois.length - 1];
        if (p && p.b === b.id && p.label === R.name) { p.casino = true; out.casinos++; }
      }
      return b;
    };
    R.put = put;
    if (R.look === 'lotus') lotus(R);
    else if (R.look === 'saguaro') saguaro(R);
    else if (R.look === 'grande') grande(R);
    else if (R.look === 'glass') prism(R);
    else if (R.look === 'star') starfall(R);
    else if (R.look === 'lake') lagoon(R);
    else if (R.look === 'adobe') casa(R);
    out.resorts.push({ name: R.name, look: R.look, buildings: R.blds.length, tiles: R.blds.reduce((a, b) => a + b.tw * b.th, 0), main: !!R.main });
  }
  skybridge();
  strip();
  // what's left: the desert's gardens - beds of sand and gravel planted with palms, saguaros, agave and rocks, paved
  // where they meet the paving (else the kit's seal paves it)
  garden();
  out.buildings = out.resorts.reduce((a, r) => a + r.buildings, 0);
  return out;

  // ---------------------------------------------------------------------------------------------------------------
  // The resorts' grounds left open: a tile beside paving, a pavement or a car park paved; the rest a bed of the desert's
  // sand and gravel (T.DIRT: art v2 draws a desert town's as desert), planted on a jittered grid - palms, saguaros,
  // agave, barrel cactus, prickly pear, yucca, sandstone rocks - where the bed is open all round
  function garden() {
    const [X0, Y0, X1, Y1] = STRIP.rect, open = [];
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (K.free(x, y) && m.dist[y * W + x] === D) open.push([x, y]);
    const paved = open.filter(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const t = tile(x + dx, y + dy); return t === T.SIDEWALK || t === T.PLAZA || t === T.LOT; }));
    for (const [x, y] of paved) K.fill(x, y, 1, 1, T.PLAZA);
    for (const [x, y] of open) K.fill(x, y, 1, 1, T.DIRT);
    const bed = (x, y) => tile(x, y) === T.DIRT;
    let n = 0;
    for (let gy = Y0; gy < Y1; gy += 4) for (let gx = X0; gx < X1; gx += 4) {
      const x = gx + Math.floor(rnd(gx, gy, 890) * 4), y = gy + Math.floor(rnd(gx, gy, 891) * 4);
      if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => bed(x + dx, y + dy))) continue;
      const r = rnd(x, y, 892), px = x + 0.5, py = y + 0.5;
      if (r < 0.22) palm(px, py, pick(['date', 'desertFan', 'royal'], rnd(x, y, 893)), 1.15);
      else if (r < 0.38) prop('tree_a', px, py, 8, { sp: rnd(x, y, 894) < 0.4 ? 'saguaroBig' : 'saguaroMid', k: 1.1 });
      else if (r < 0.78) { bed2(px - 0.5, py, rnd(x, y, 895)); bed2(px + 0.6, py + 0.5, rnd(x, y, 896)); }
      else if (r < 0.9) prop('boulder', px, py, 8, { s: 22 + Math.floor(rnd(x, y, 897) * 16), style: 'sandstone', rock: 1 });
      else continue;
      n++;
    }
    out.garden = { beds: open.length - paved.length, paved: paved.length, planted: n };
    function bed2(x, y, r) { prop('shrub_a', x, y, 0, { sp: pick(['agave', 'barrel', 'pear', 'agave', 'yucca', 'cholla', 'ocotillo'], r), k: 1 }); }
  }
  // the roof kit of a resort building (px from its north-west corner): a tower's helipad and tank, a podium's plant
  function roofKit(w, d, spec) {
    if (spec.pitch) return [];
    if (spec.floors >= 8) return [['heli', w * TILE / 2, d * TILE / 2 + 40], ['tank', w * TILE - 50, 60], ['ac', 50, 60]];
    return [['hvac', w * TILE / 2, d * TILE / 2], ['ac', 60, 70], ['ac', w * TILE - 70, 70], ['vent', w * TILE - 60, d * TILE - 50]];
  }
  // A drive loop in the forecourt (fd 0-7) round a fountain island at fx cx: the drive in and out across the kerb at
  // its ends, the island paved and planted round its fountain, the porte-cochere over the drive at the door (o.cover:
  // 'canopy' | 'pergola' | 'marquee'), palms along the kerb strip, two taxis waiting in the loop, lamps by the door
  function loop(R, cx, o = {}) {
    const { rect, at } = R, hw = o.hw || 9, fx0 = cx - hw, fx1 = cx + hw;
    // the forecourt paved first, the loop's asphalt over it; the kerb strip between its two mouths paved and planted
    const [px, py, pw, ph] = rect(o.fx0 ?? fx0 - 2, 0, (o.fx1 ?? fx1 + 2) - (o.fx0 ?? fx0 - 2), 8);
    K.fill(px, py, pw, ph, T.PLAZA);
    for (let fd = 0; fd < 8; fd++) for (let fx = fx0; fx < fx1; fx++) {
      const island = fd >= 2 && fd <= 5 && fx >= cx - hw + 4 && fx < cx + hw - 4;
      const kerb = fd === 0 && fx >= fx0 + 3 && fx < fx1 - 3;
      if (island || kerb) continue;
      const [tx, ty] = at(fx, fd + (R.S ? 1 : 0));
      if (tile(tx, ty) === T.PLAZA) m.set(tx, ty, T.LOT);
    }
    // the island: its fountain, flower beds and agaves at its ends
    const [ix, iy] = at(cx, 4);
    prop('fountain', ix, iy, 30);
    for (const dx of [-3.5, 3.5]) { prop('flowers_big', ix + dx, iy, 0); bed(ix + dx * 0.6, iy + (R.S ? 1.2 : -1.2), rnd(ix + dx, iy, 850)); }
    // the kerb strip: palms and beds between the mouths
    for (let fx = fx0 + 4; fx < fx1 - 3; fx += 4) { const [kx, ky] = at(fx + 0.5, 0.5); if (tile(Math.floor(kx), Math.floor(ky)) === T.PLAZA) { if ((fx - fx0) % 8 === 4) palm(kx, ky, 'royal', 1.25); else bed(kx, ky, rnd(fx, ky, 851)); } }
    // palms at the forecourt's ends
    for (const sx of [fx0 - 1.6, fx1 + 1.6]) for (const fd of [1.4, 4.4]) { const [kx, ky] = at(sx, fd); if (tile(Math.floor(kx), Math.floor(ky)) === T.PLAZA) palm(kx, ky, fd < 3 ? 'royal' : 'date', 1.2); }
    // the porte-cochere over the drive at the door, its lamps; the taxis waiting
    const [dx, dy] = at(cx, 6.6);
    if (o.cover === 'pergola') prop('pergola', dx, dy, 0, { w: 12 * TILE, d: 3 * TILE, h: 60 });
    else if (o.cover !== false) prop('porte', dx, dy, 0, { w: (o.cw || 10) * TILE, d: 3 * TILE, h: 58, k: o.cover === 'marquee' ? 1 : 0 });
    for (const sx of [-hw - 1, hw + 1]) { const [lx, ly] = at(cx + sx + 0.5, 6.5); prop('lamp', lx, ly, 0); }
    for (const k of [0, 1]) { const [tx, ty] = at(cx - 4 + k * 8, 7.2 - k * 0.2); m.parking.push({ x: tx * TILE, y: ty * TILE, a: 0, model: k ? 'taxi' : pick(['sedan', 'taxi', 'sports'], rnd(cx, R.y0, 852)), kerb: true }); }
    out.loops++;
  }
  // (palms round a pool's corners; beds along a side)
  function poolPalms(x, y, w, h) { palm(x - 0.8, y - 0.8, 'royal', 1.2); palm(x + w + 0.8, y + h + 0.8, 'date', 1.2); palm(x + w + 0.8, y - 0.8, 'royal', 1.15); }

  // ---------------------------------------------------------------------------------------------------------------
  // The Golden Lotus: a gold podium and its wing, the gold glass tower behind with its pink crown, the pool beside it
  function lotus(R) {
    const st = (o) => ({ style: 'stucco', parapet: 12, roofMat: 'membrane', lip: 8, rimW: 4, ...o });
    R.put(4, 8, 24, 14, R.name, st({ floors: 2, wallColor: '#e8d6a8', cornice: 'dentil' }), neon(24, 14, 120, C.gold), { main: true, shop: lobby('GOLDEN LOTUS', ['#3a2a10', [255, 214, 120]]) });
    R.put(28, 8, 20, 12, `${R.name} Wing`, st({ floors: 2, wallColor: '#e2cc98', cornice: 'dentil', doors: [], windows: winRow(20) }), neon(20, 12, 120, C.gold));
    R.put(8, 24, 18, 18, `${R.name} Tower`, { floors: 12, style: 'glass', glassTint: '#b88a3c', parapet: 18, roofMat: 'membrane', lip: 10 }, [...neon(18, 18, 700, C.pink, 2), crown(18, 18, 760, C.pink)]);
    const [px, py] = R.rect(30, 26, 16, 8);
    pool(px, py, 16, 8, { round: true }); poolPalms(px, py, 16, 8);
    cabana(px + 17.5, py + 2); cabana(px + 17.5, py + 5.5, 1);
    loop(R, 16);
  }
  // The Neon Saguaro: a low pink-banded casino either side of its pylon, the green neon saguaro up the pylon over the
  // marquee, a bar on the wings' roofs, the fountain loop in front, its car park beside it, its pool behind
  function saguaro(R) {
    const pinkC = [255, 90, 190], wing = (o) => ({ floors: 2, style: 'stucco', wallColor: '#f1e6ea', parapet: 14, roofMat: 'deck', lip: 8, rimW: 4, cornice: 'step', trim: pinkC, doors: [], ...o });
    const bar = (w) => [['umb', 50, 50], ['table', 90, 60], ['umb', 130, 50], ['string', 40, 30], ['palm', w * TILE - 40, 40], ['table', w * TILE - 90, 70]];
    R.put(2, 8, 11, 16, `${R.name} West`, wing({ windows: winRow(11, 44) }), [...neon(11, 16, 130, C.pink, 2), [5 * TILE, -8 * TILE, 150, 180, C.warm, 1.2, 'lamp']], { kit: bar(11) });
    R.put(13, 8, 9, 16, R.name, { floors: 5, style: 'stucco', wallColor: '#e8d8d0', parapet: 20, roofMat: 'membrane', lip: 10, rimW: 5, cornice: 'step', trim: [255, 70, 90] },
      [...neon(9, 16, 300, C.red, 2), [4.5 * TILE, -2, 190, 300, C.green, 2.8, 'neon']], { main: true, shop: lobby(null, ['#2a1424', [255, 120, 200]], 4), neon: { name: null, pic: 'saguaro', picS: 3, picV: 76, trim: false } });
    R.put(22, 8, 11, 16, `${R.name} East`, wing({ windows: winRow(11, 44) }), [...neon(11, 16, 130, C.pink, 2), [6 * TILE, -8 * TILE, 150, 180, C.warm, 1.2, 'lamp']], { kit: bar(11) });
    // the car park beside it: five decks, its top deck's bays and cars, its sign
    garage(R, 35, 2, 13, 34, 'Neon Saguaro Parking', 5);
    const [px, py] = R.rect(4, 28, 14, 7);
    pool(px, py, 14, 7, { round: true }); poolPalms(px, py, 14, 7);
    cabana(px + 15.5, py + 1.5, 2);
    loop(R, 17, { cover: 'marquee', cw: 9, fx0: 2, fx1: 34 });
  }
  // Mesa Grande: the gold glass tower in three terraces - the podium, the middle block and the tower, their ledges
  // planted with palms - its east wing; west of it the lagoon under the two-stage waterfall down its stone wall,
  // cabanas and loungers round it; the fountain loop and the porte-cochere in front
  function grande(R) {
    const gold = '#c08a3a', green = (w, d) => [['palm', 50, 50], ['bed|60|20|40|box|agave|0', w * TILE / 2 - 30, 40], ['palm', w * TILE - 50, 50], ['umb', w * TILE / 2 + 60, d * TILE - 60], ['lounge', w * TILE / 2 - 80, d * TILE - 50]];
    R.put(18, 8, 24, 12, R.name, { floors: 3, style: 'glass', glassTint: gold, parapet: 12, roofMat: 'green', lip: 8, rimW: 5 }, [...neon(24, 12, 200, C.gold, 3), [12 * TILE, -2, 60, 240, C.warm, 1.6, 'lamp']], { main: true, shop: lobby('MESA GRANDE', ['#2a1e0e', [255, 220, 140]], 3), kit: green(24, 12) });
    R.put(20, 20, 20, 10, `${R.name} Terrace`, { floors: 8, style: 'glass', glassTint: gold, parapet: 12, roofMat: 'green', lip: 8, rimW: 5 }, neon(20, 10, 480, C.gold, 2), { kit: green(20, 10) });
    R.put(22, 30, 16, 16, `${R.name} Tower`, { floors: 14, style: 'glass', glassTint: '#d09a44', parapet: 20, roofMat: 'membrane', lip: 10, rimW: 5 }, [...neon(16, 16, 820, C.gold, 2), crown(16, 16, 880, C.gold)]);
    R.put(42, 8, 10, 22, `${R.name} East Wing`, { floors: 4, style: 'glass', glassTint: gold, parapet: 12, roofMat: 'green', lip: 8, rimW: 5, doors: [], windows: [] }, neon(10, 22, 260, C.gold, 2), { kit: green(10, 22) });
    // the lagoon (fx 3-15, fd 3-22), the waterfall down its north wall, the rocks either side, palms on them
    const [lx, ly, lw, lh] = R.rect(3, 3, 12, 20);
    pool(lx, ly, lw, lh, { round: true, loungers: false, skip: (x, y) => (x === lx + lw - 1 && y < ly + 4) || (x === lx && y > ly + lh - 4) });
    prop('coastfall', lx + lw / 2, ly + 0.4, 0, { kind: 'twoTier', w: 48, drop: 120, s: 21, stone: 'sand', mist: 0.6 });
    for (const [dx, dy, s] of [[lw / 2 - 4.4, -0.4, 52], [lw / 2 + 4.4, -0.3, 56]]) prop('boulder', lx + dx, ly + dy, 14, { s, style: 'sandstone', rock: 1 });
    for (const dx of [-0.6, lw + 0.6]) { bed(lx + dx, ly + 2.6, rnd(dx, ly, 853)); bed(lx + dx, ly + 7.2, rnd(dx, ly, 854)); }
    palm(lx - 0.8, ly - 1.2, 'royal', 1.3); palm(lx + lw + 0.8, ly - 1, 'date', 1.25); palm(lx + lw + 0.8, ly + lh * 0.55, 'royal', 1.2); palm(lx - 0.8, ly + lh * 0.6, 'desertFan', 1.2);
    for (let k = 0; k < 4; k++) cabana(lx - 1.6, ly + 5 + k * 3.6, k);
    for (let k = 0; k < 5; k++) prop(k % 3 === 2 ? 'umbrella_r' : 'lounger', lx + lw + 1.3, ly + 6 + k * 2.6, 0, k % 3 === 2 ? null : { a: 0, v: k % 4 });
    loop(R, 30, { fx0: 16, fx1: 42 });
  }
  // The Prism (south of the Strip, fronting it): the dark glass podium and its hall on the Strip, the pool and its
  // cabanas behind them, the two glass towers at the far end of the grounds (one cyan-lit, one violet)
  function prism(R) {
    const st = (o) => ({ style: 'glass', parapet: 12, roofMat: 'membrane', lip: 8, rimW: 4, ...o });
    R.put(3, 8, 24, 10, R.name, st({ floors: 2, glassTint: '#34446a' }), neon(24, 10, 120, C.violet), { main: true });
    R.put(27, 8, 18, 10, `${R.name} Hall`, st({ floors: 2, glassTint: '#34446a', doors: [], windows: [] }), neon(18, 10, 120, C.violet));
    const [px, py] = R.rect(20, 22, 16, 7);
    pool(px, py, 16, 7, { round: true }); poolPalms(px, py, 16, 7);
    for (let k = 0; k < 3; k++) cabana(px + 3 + k * 5, py + 9.4, k + 1);
    R.put(6, 40, 14, 16, `${R.name} East`, st({ floors: 12, glassTint: '#4a7ab0' }), [...neon(14, 16, 690, C.cyan, 2), crown(14, 16, 740, C.cyan)]);
    R.put(32, 42, 14, 14, `${R.name} West`, st({ floors: 10, glassTint: '#8a4a9a' }), [...neon(14, 14, 580, C.pink, 2), crown(14, 14, 620, C.violet)]);
    loop(R, 15);
  }
  // Starfall Tower (south of the Strip, fronting it): the white podium and its wing on the Strip, the pool behind them,
  // the white glass spire with its cyan crown at the far end of the grounds between the resort's two car parks
  function starfall(R) {
    const st = (o) => ({ style: 'stucco', parapet: 12, roofMat: 'membrane', lip: 8, rimW: 4, ...o });
    R.put(4, 8, 24, 12, R.name, st({ floors: 2, wallColor: '#e4e8ee', windows: winRow(24), doors: [] }), neon(24, 12, 120, C.cyan), { main: true });
    R.put(28, 8, 21, 12, `${R.name} Wing`, st({ floors: 2, wallColor: '#dde2ea', windows: winRow(21), doors: [] }), neon(21, 12, 120, C.cyan));
    const [px, py] = R.rect(8, 24, 14, 8);
    pool(px, py, 14, 8, { round: true }); poolPalms(px, py, 14, 8);
    cabana(px - 1.8, py + 2.5); cabana(px + 15.8, py + 2.5, 2);
    R.put(18, 44, 16, 16, `${R.name} Spire`, { floors: 12, style: 'glass', glassTint: '#a8bcd0', parapet: 22, roofMat: 'membrane', lip: 10 }, [...neon(16, 16, 700, C.white, 2), crown(16, 16, 760, C.cyan)]);
    carPark(R, 2, 40, 14, 22); carPark(R, 36, 40, 15, 22);
    loop(R, 16);
  }
  // The Silver Lagoon (north of the Strip, fronting it): the lake of fountains along the Strip behind its balustrade,
  // the promenade under the palms, the three cream blocks behind it (the casino in the middle), the drive past the
  // lake's east end to the porte-cochere at the east block, the pool behind
  function lagoon(R) {
    const st = (o) => ({ style: 'stucco', parapet: 12, roofMat: 'membrane', lip: 8, rimW: 4, cornice: 'bracket', ...o });
    K.fill(...R.rect(0, 0, R.LW, 19), T.PLAZA);
    const [lx, ly, lw, lh] = R.rect(2, 2, 32, 13), front = R.S ? ly + lh : ly, back = R.S ? ly : ly + lh;
    pool(lx, ly, lw, lh, { basin: true, loungers: false });
    for (let k = 0; k < 5; k++) prop('fountain', lx + lw * (k + 0.5) / 5, ly + lh / 2, 0);
    prop('fenceline', lx - 0.4, front + (R.S ? 0.4 : -0.5), 0, { kind: 'iron', tx: Math.round((lw + 0.8) * TILE), ty: 0 });
    for (let k = 0; k <= 4; k++) palm(lx + lw * k / 4, back + (R.S ? -1.2 : 1.2), 'royal', 1.3);
    R.put(2, 19, 13, 16, `${R.name} West`, st({ floors: 7, wallColor: '#ecdcc0', windows: winRow(13), doors: [] }), neon(13, 16, 420, C.gold));
    R.put(15, 19, 16, 16, R.name, st({ floors: 8, wallColor: '#efe2c8' }), [...neon(16, 16, 470, C.gold), crown(16, 16, 500, C.gold)], { main: true, shop: lobby('SILVER LAGOON', ['#2a2418', [255, 226, 160]], 3) });
    R.put(31, 19, 13, 16, `${R.name} East`, st({ floors: 6, wallColor: '#e8d8bc', windows: winRow(13), doors: [] }), neon(13, 16, 360, C.gold));
    // the drive in past the lake's east end to the porte-cochere at the east block, a taxi waiting
    for (let fd = 0; fd < 19; fd++) for (let fx = 35; fx < R.LW - 1; fx++) { const [tx, ty] = R.cell(fx, fd); if (tile(tx, ty) === T.PLAZA) m.set(tx, ty, T.LOT); }
    { const [cx, cy] = R.at(R.LW - 5, 17.5); prop('porte', cx, cy, 0, { w: 6 * TILE, d: 4 * TILE, h: 58, k: 0 }); m.parking.push({ x: cx * TILE, y: cy * TILE, a: Math.PI / 2, model: 'taxi', kerb: true }); }
    const [px, py] = R.rect(14, 37, 16, 7);
    pool(px, py, 16, 7, { round: true }); poolPalms(px, py, 16, 7);
    out.lake = 5;
  }
  // Casa del Sol: the adobe lodge fronting the Strip and its wings stepping down in terraces toward the gardens round
  // the lagoon with its island of palms, cabanas along the far side; the timber pergola over the drive at the lodge's
  // door, the fountain loop with its cactus beds; its car park at the east end
  function casa(R) {
    const ad = (fl, o = {}) => ({ floors: fl, style: 'adobe', wallColor: pick(['#eadcc2', '#e6d4b6', '#eee0c8'], rnd(fl, o.k || 0, 860)), parapet: 14, roofMat: 'adobe', lip: 8, rimW: 6, vigas: true, win: 'tall', doors: [], ...o });
    const terr = (w, d) => [['umb', 50, 50], ['plant', w * TILE / 2, 40], ['lounge', w * TILE - 80, 60], ['perg', w * TILE / 2, d * TILE - 50], ['palm', 40, d * TILE - 40]];
    R.put(16, 9, 26, 12, R.name, ad(3, { windows: winRow(26, 48) }), [...neon(26, 12, 180, C.warm, 3), [13 * TILE, -2, 60, 220, C.warm, 1.4, 'lamp']], { main: true, door: 15, kit: terr(26, 12) });
    R.put(42, 9, 14, 12, `${R.name} East Lodge`, ad(2, { k: 1, windows: winRow(14, 48) }), neon(14, 12, 170, C.warm, 2), { kit: terr(14, 12) });
    R.put(2, 9, 14, 14, `${R.name} West Wing`, ad(3, { k: 2, windows: winRow(14, 48) }), [], { kit: terr(14, 14) });
    R.put(2, 23, 12, 12, `${R.name} Casitas`, ad(2, { k: 3, windows: winRow(12, 48) }), [], { kit: terr(12, 12) });
    R.put(2, 35, 10, 10, `${R.name} Spa`, ad(1, { k: 4, windows: winRow(10, 48) }), [], { kit: terr(10, 10) });
    R.put(56, 9, 14, 14, `${R.name} East Wing`, ad(3, { k: 5, windows: winRow(14, 48) }), [], { kit: terr(14, 14) });
    R.put(58, 23, 12, 12, `${R.name} Garden Rooms`, ad(2, { k: 6, windows: winRow(12, 48) }), [], { kit: terr(12, 12) });
    R.put(60, 35, 10, 10, `${R.name} Cantina`, ad(1, { k: 7, windows: winRow(10, 48) }), [], { kit: terr(10, 10) });
    // the courtyard: paved, the lagoon round its island (a ring: art v2's clear water over a tiled bed)
    const [cx0, cy0, cw, ch] = R.rect(15, 22, 42, 28);
    K.fill(cx0, cy0, cw, ch, T.PLAZA);
    const lcx = cx0 + cw / 2, lcy = cy0 + ch / 2 - 1, rx = 14, ry = 9, hw = 3.6, ox = rx * (1 + hw / ry), oy = ry + hw;   // (art v2's ring: a band hw wide across its short axis)
    let n = 0;
    for (let y = Math.floor(lcy - oy); y <= Math.ceil(lcy + oy); y++) for (let x = Math.floor(lcx - ox); x <= Math.ceil(lcx + ox); x++) {
      const u = (x + 0.5 - lcx) / rx, v = (y + 0.5 - lcy) / ry, r = Math.sqrt(u * u + v * v);
      if (Math.abs(r - 1) * Math.min(rx, ry) < hw && tile(x, y) === T.PLAZA) { m.set(x, y, T.WATER); n++; }
    }
    (m.pools ||= []).push({ x: (lcx - ox) * TILE, y: (lcy - oy) * TILE, w: ox * 2 * TILE, h: oy * 2 * TILE, lanes: 0, ring: { cx: lcx * TILE, cy: lcy * TILE, rx: rx * TILE, ry: ry * TILE, hw: hw * TILE } });
    out.pools++;
    // the island: palms and a bar under its thatch
    for (const [dx, dy, sp] of [[-6, -1.5, 'royal'], [-2, 1.6, 'coconut'], [2.6, -1.8, 'royal'], [6.4, 1.2, 'date'], [0, -0.2, 'royal']]) palm(lcx + dx, lcy + dy, sp, 1.25);
    prop('beachbar', lcx + 3.2, lcy + 2.2, 14);
    // round the lagoon: loungers and umbrellas on the near side, cabanas along the far (south) side, the agave beds
    for (let k = 0; k < 8; k++) prop(k % 3 === 1 ? 'umbrella_g' : 'lounger', lcx - 13 + k * 3.6, lcy - ry - hw - 1.1, 0, k % 3 === 1 ? null : { a: Math.PI / 2, v: k % 4 });
    for (let k = 0; k < 6; k++) cabana(lcx - 14 + k * 5.6, lcy + ry + hw + 2.2, k);
    for (const sx of [-1, 1]) { prop('tree_a', lcx + sx * (ox + 1.2), lcy, 8, { sp: 'saguaroBig', k: 1.1 }); bed(lcx + sx * (ox + 0.6), lcy + 3.4, rnd(sx, lcy, 861)); bed(lcx + sx * (ox - 0.4), lcy - 5, rnd(sx, lcy, 862)); }
    // the gardens behind (toward the camera): a cactus garden, palms, the paths
    const [gx, gy, gw, gh] = R.rect(15, 50, 42, 14);
    K.fill(gx, gy, gw, gh, T.PLAZA);
    for (let k = 0; k < 7; k++) { const x = gx + 3 + k * 6, y = gy + 3 + (k % 2) * 4; prop('tree_a', x, y, 8, { sp: k % 3 ? 'saguaroMid' : 'saguaroBig', k: 1.1 }); bed(x + 2, y + 1.5, rnd(x, y, 863)); bed(x - 1.6, y + 2.6, rnd(x, y, 864)); }
    for (let k = 0; k < 4; k++) palm(gx + 5 + k * 11, gy + gh - 2, k % 2 ? 'date' : 'desertFan', 1.2);
    garage(R, 72, 4, 18, 34, 'Casa del Sol Parking', 4);
    loop(R, 31, { cover: 'pergola', fx0: 14, fx1: 56 });
  }
  // a multi-level car park (fx, fd, w x d, floors): concrete decks open at the sides, its top deck's bays and cars
  // (art v2 roofMat 'parking'), its PARKING sign over the entrance facing the Strip
  function garage(R, fx, fd, w, d, name, floors) {
    const b = R.put(fx, fd, w, d, name, { floors, style: 'concrete', wallColor: '#c4beb2', parapet: 10, roofMat: 'parking', lip: 6, rimW: 5, win: 'loft', doors: [], windows: [], plaques: [] }, [[w * TILE / 2, -2, 40, 160, C.warm, 1.2, 'lamp']],
      { arch: 'office', key: 'apt1', kit: [['ac', 40, 40]], shop: R.S ? { kind: 'lobby', door: 'left', open: true, people: 0, awning: null, sign: { text: 'PARKING', bg: '#1e3a5e', fg: [250, 250, 240], lit: true } } : undefined });
    if (b) out.garages++;
    return b;
  }
  // a surface car park (fx, fd, w x d): asphalt, double rows of bays, light masts, palms at the row ends
  function carPark(R, fx, fd, w, d) {
    const [x, y] = R.rect(fx, fd, w, d);
    K.fill(x, y, w, d, T.LOT);
    for (let ry = y + 1; ry + 7 <= y + d; ry += 10) for (const half of [0, 1]) {
      const cy = ry + 1.7 + half * 3.5;
      for (let sx = x + 2; sx + 2 <= x + w - 2; sx += 2) if (rnd(sx, ry + half, 870) < 0.7) m.parking.push({ x: (sx + 1) * TILE, y: cy * TILE, a: half ? Math.PI / 2 : -Math.PI / 2 });
      if (!half) { palm(x + 0.8, ry + 3.5, 'date', 1.15); palm(x + w - 0.8, ry + 3.5, 'date', 1.15); }
    }
    for (let k = 1; k * 14 < w; k++) prop('lamp', x + k * 14, y + d - 0.6, 0);
  }
  // a lobby's front: glass doors, people inside, the name over it
  function lobby(text, sc, people = 3) { return { kind: 'lobby', door: 'right', open: true, people, awning: null, sign: text ? { text, bg: sc[0], fg: sc[1], lit: true } : null }; }

  // ---------------------------------------------------------------------------------------------------------------
  // The skybridge across the Strip between Mesa Grande's forecourt and Casa del Sol's: a glass tower at each end (its
  // escalators and lift), the glass span on its steel trusses between them, high over the traffic
  function skybridge() {
    const B = SKYBRIDGE, x = B.x + 0.5;
    prop('sbtower', x, B.north + 2.4, 26, { h: B.z + 48 });
    prop('sbtower', x, B.south + 0.6, 26, { h: B.z + 48 });
    const y0 = B.north + 3, y1 = B.south, n = 4, seg = (y1 - y0) / n;
    for (let k = 0; k < n; k++) prop('skybridge', x, y0 + seg * (k + 0.5), 0, { len: Math.round(seg * TILE), z: B.z });
    out.skybridge = { x: B.x, y0, y1, segs: n };
  }
  // The Strip's median: royal palms down it every nine tiles with banner poles between, agave and cactus beds and rocks
  // round their feet, clear of the side streets' junctions (where it stops for the turn); bus stops on its pavements
  function strip() {
    const y = SY.strip + 0.5, gaps = [SX.silver, SX.cactus, SX.lucky], E = SX.east - 8;
    for (let x = SX.silver + 12; x < E; x += 3) {
      if (gaps.some((g) => Math.abs(x - g) < 12)) continue;
      const k = Math.round((x - SX.silver) / 3) % 3;
      if (k === 0) palm(x + 0.5, y, 'royal', 1.3);
      else if (k === 1) prop('bannerpole', x + 0.5, y, 6, { v: Math.round(x / 9) % 2 });
      else { bed(x, y - 0.6, rnd(x, y, 880)); bed(x + 1, y + 0.6, rnd(x, y, 881)); if (rnd(x, y, 882) < 0.5) prop('boulder', x + 0.5, y + 0.1, 6, { s: 18 + Math.floor(rnd(x, y, 883) * 10), style: 'sandstone', rock: 1 }); }
      out.median++;
    }
    // the bus stops: on the north pavement by The Prism, on the south by Starfall Tower
    prop('busstop', 5512.5, SY.strip - 7.6, 0);
    prop('busstop', 5372.5, SY.strip + 8.4, 0, { face: 'N' });
  }
}
