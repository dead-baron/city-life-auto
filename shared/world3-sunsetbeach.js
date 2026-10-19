// World v3, handcrafted: Sunset Beach's beachfront (district 10), Juniper Street to Hazel Street from 5th Street down to
// the sea, from the owner's concepts WC209 (the boardwalk beach town: the beachfront row - an arcade, a burger stand, a
// surf shop with its board rack, cafes; the boardwalk with its stairs to the sand; the amusement pier and its Ferris
// wheel; a lifeguard tower, surfers) and WC063 (the palm promenade behind a wide beach: tiki bars on their decks,
// lifeguard towers, umbrellas), with the research's D10 / BE1 / BE2 / BE3 / SK5 / SR7 (the boardwalk, the long pier with
// its lamps and anglers and the bait shop halfway along, the Ferris wheel and the coin telescope at its end, boat hire at
// its root, a skate park on the sand side, volleyball, the lifeguards' station, the outdoor showers):
//   - Sunset Boulevard's north side, every front facing the sea: the Sea Breeze Motel round its pool; Pier Arcade,
//     Wipeout Surf Co. with its boards stood out front, Tiki Taco, Scoops Ice Cream, Seashell Souvenirs; Sunset Grill,
//     Boardwalk Burgers, The Salty Dog, Driftwood Cafe, Beach Bum Rentals; the Surf Rider Motel, Coconut Joe's and Sun &
//     Sand Pharmacy - their car parks behind them on 5th Street;
//   - the Sunset Boardwalk along the boulevard's south side: timber decking, palms, lamps, benches facing the sea, bike
//     racks, the outdoor showers at the gaps in its rail where you step down to the sand, the carts;
//   - the beach below it, from the boardwalk to the water: lifeguard towers, umbrellas, loungers and towels, surfboards,
//     the volleyball court, Sunset Skate Park on the sand side, the lifeguards' station, two tiki bars on their decks;
//   - Sunset Beach Pier at Sunset Avenue's foot, straight out to sea: iron lamps in pairs, benches facing out, rods in
//     holders on the rails, the bait shack halfway along, the T-head with the Ferris wheel (the ride: shared/rides.js)
//     and the coin telescope, a float with dinghies off its east side; the boat rentals at its root (shared/map.js:
//     m.publicPier).
// The motels, the shops and the bars are invented, as their signs. Every building faces south (the camera). Draws are
// fixed by place (hash2).
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 10;   // Sunset Beach (shared/mapcore.js DISTRICTS)
export const BX = { juniper: 2508, sunset: 2560, linden: 2620, poplar: 2680, hazel: 2740 };
export const BY = { fifth: 3110, blvd: 3150 };
const SEA = 3250;   // (the plan's area runs out over the water: the pier)
const ROW = [[BX.juniper, BX.sunset], [BX.sunset, BX.linden], [BX.linden, BX.poplar], [BX.poplar, BX.hazel]];
const RECTS = [...ROW.map(([a, b]) => [a, BY.fifth, b, BY.blvd]), [BX.juniper, BY.blvd, BX.hazel, SEA]];
const PASTEL = ['#f4d8c0', '#cfe8e0', '#f2e2a8', '#e8cfe4', '#c8dcf0', '#f6efe0', '#f0c8b8', '#bfe0d8'];
const DOORS = ['#2f8ac8', '#e8604a', '#2a9a8a', '#e8b030', '#d0507a', '#3a6ab0'];

export const SUNSETBEACH = {
  key: 'sunsetbeach', d: D, rects: RECTS, rect: [BX.juniper, BY.fifth, BX.hazel, SEA],
  streets: () => [],
  specials: [],
  build,
};

// the boardwalk shops (north of the boulevard, two blocks of them), each { name, store (its shopfront), w, poi, ... }
const SHOPS_B = [
  { name: 'Pier Arcade', store: 'arcade', key: 'arcade', w: 12, floors: 2, wall: '#2c2a46', poi: { kind: 'delivery', label: 'Pier Arcade' }, neon: { name: 'PIER ARCADE', kind: 'arcade', col: 3, blade: 'GAMES' }, signC: ['#1c1a2e', [120, 230, 255]] },
  { name: 'Wipeout Surf Co.', store: 'clothes', w: 10, poi: { kind: 'clothing', label: 'Wipeout Surf Co.', store: 'surf' }, awning: ['#2f8ac8', '#f0ece4'], signC: ['#2f8ac8', [250, 246, 230]], boards: true },
  { name: 'Tiki Taco', store: 'diner', key: 'diner', w: 8, poi: { kind: 'coffee', label: 'Tiki Taco', food: true }, awning: ['#e8604a', '#f2e2a8'], signC: ['#3a6a5a', [255, 214, 120]], tables: true },
  { name: 'Scoops Ice Cream', store: 'cafe', key: 'rest2', w: 8, poi: { kind: 'coffee', label: 'Scoops Ice Cream', food: true }, awning: ['#e88ab0', '#f0ece4'], signC: ['#e88ab0', [255, 250, 240]], tables: true },
  { name: 'Seashell Souvenirs', store: 'mart', w: 8, poi: { kind: 'delivery', label: 'Seashell Souvenirs' }, awning: ['#2a9a8a', '#f2e2a8'], signC: ['#2a9a8a', [250, 246, 230]] },
];
const SHOPS_C = [
  { name: 'Sunset Grill', store: 'diner', key: 'rest1', w: 14, floors: 2, poi: { kind: 'coffee', label: 'Sunset Grill', food: true }, awning: ['#c8602a', '#f0ece4'], signC: ['#c8602a', [255, 236, 200]], tables: true },
  { name: 'Boardwalk Burgers', store: 'diner', key: 'diner', w: 9, poi: { kind: 'coffee', label: 'Boardwalk Burgers', food: true }, awning: ['#d8302a', '#f2e2a8'], signC: ['#d8302a', [255, 240, 200]] },
  { name: 'The Salty Dog', store: 'bar', w: 9, wall: '#2a3a4a', poi: { kind: 'club', label: 'The Salty Dog' }, neon: { name: 'SALTY DOG', kind: 'bar', col: 1, pic: 'palm' }, signC: ['#1a2430', [255, 200, 90]] },
  { name: 'Driftwood Cafe', store: 'cafe', key: 'rest2', w: 8, poi: { kind: 'coffee', label: 'Driftwood Cafe' }, awning: ['#8a6a4a', '#f0ece4'], signC: ['#5a4030', [240, 226, 200]], tables: true },
  { name: 'Beach Bum Rentals', store: 'mart', w: 9, poi: { kind: 'delivery', label: 'Beach Bum Rentals' }, awning: ['#e8b030', '#2a5a8a'], signC: ['#2a5a8a', [255, 220, 90]], bikes: true },
];
const SHOPS_D = [
  { name: 'Coconut Joe\'s', store: 'mart', w: 9, poi: { kind: 'convenience', label: 'Coconut Joe\'s' }, awning: ['#3a9a5a', '#f2e2a8'], signC: ['#3a9a5a', [255, 246, 220]] },
  { name: 'Sun & Sand Pharmacy', store: 'mart', w: 8, poi: { kind: 'pharmacy', label: 'Sun & Sand Pharmacy' }, awning: ['#2a7a9a', '#f0ece4'], signC: ['#2a7a9a', [250, 250, 245]] },
];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, motels: 0, pools: 0 };
  const { tower } = towerKit(K, out);
  const W = m.w;
  const tile = (x, y) => m.tiles[y * W + x];
  const isW = (x, y) => { const t = tile(x, y); return t === T.WATER || t === T.DEEP; };
  const placeName = (name, x0, y0, x1, y1) => (out.places ||= []).push({ name, x0, y0, x1, y1 });
  // the free box of a block between its streets (scanned along its middle row and column), or null
  const area = (xa, ya, xb, yb) => {
    const my = Math.round((ya + yb) / 2), mx = Math.round((xa + xb) / 2);
    let x0 = xa, x1 = xb, y0 = ya, y1 = yb;
    while (x0 < x1 && !K.free(x0, my)) x0++;
    while (x1 > x0 && !K.free(x1 - 1, my)) x1--;
    while (y0 < y1 && !K.free(mx, y0)) y0++;
    while (y1 > y0 && !K.free(mx, y1 - 1)) y1--;
    return x1 - x0 >= 8 && y1 - y0 >= 8 ? [x0, y0, x1, y1] : null;
  };
  // the first water row south of the boulevard under column x (the beach runs down to it)
  const shore = (x) => { let y = BY.blvd + 8; while (y < SEA && !isW(x, y)) y++; return y; };
  const busy = [];   // the set pieces on the sand (the umbrellas keep off them)
  const isBusy = (x, y) => busy.some((r) => x >= r[0] - 1 && y >= r[1] - 1 && x < r[2] + 1 && y < r[3] + 1);

  const blocks = ROW.map(([a, b]) => area(a, BY.fifth, b, BY.blvd));
  if (blocks[0]) motel(blocks[0][0], blocks[0][2] - blocks[0][0], blocks[0], { name: 'Sea Breeze Motel', sign: 'SEA BREEZE', office: 'right', court: 9, poolW: 14, price: 6500, wall: '#bfe0d8', door: '#2f8ac8', col: 4 });
  if (blocks[1]) shopRow(blocks[1], SHOPS_B);
  if (blocks[2]) shopRow(blocks[2], SHOPS_C);
  if (blocks[3]) {
    const [x0, , x1] = blocks[3], mw = Math.min(32, x1 - x0 - 17);
    motel(x0, mw, blocks[3], { name: 'Surf Rider Motel', sign: 'SURF RIDER', office: 'left', court: 9, poolW: 12, kidney: true, price: 6000, wall: '#f2e2a8', door: '#e8604a', col: 2 });
    shopRow([x0 + mw + 1, blocks[3][1], x1, blocks[3][3]], SHOPS_D);
  }
  const bw = boardwalk();
  if (bw) {
    pier(bw);
    tikiBar(2516, bw, 'Coconut Tiki Bar', 'TIKI BAR', '#3a6a5a');
    tikiBar(2712, bw, 'The Sandbar', 'THE SANDBAR', '#8a3a2a');
    lifeguards(bw);
    skatePark(bw);
    volleyball(bw);
    beach(bw);
  }
  void api;
  return out;

  // ===========================================================================================================
  // A motel facing south onto the boulevard (as the Pink Mile's, shared/world3-pinkmile.js): its two-storey bar of
  // rooms at the back (the gallery along the upper floor, a door, a window and an AC box to every room), the office at
  // the front corner (VACANCY lit in its window), the pool in the court between (loungers, umbrellas, a ring float), the
  // cars nosed in under the rooms, palms and the tall sign at the pavement; a room to rent (a home)
  function motel(x, w, A, o) {
    let front = A[3] - 1, top = A[1];
    for (let xx = x; xx < x + w; xx++) { const c = K.column(xx, A[1], A[3] - 1); if (!c) return null; front = Math.min(front, c[0]); top = Math.max(top, c[1]); }
    const deep = front - top + 1;
    if (deep < 22 || w < 20) return null;
    const court = Math.min(o.court || 10, deep - 18), wall = o.wall || pick(PASTEL, rnd(x, front, 80)), door = o.door || pick(DOORS, rnd(x, front, 81));
    const barH = 8, park = 4, frontage = 3;
    const yBar = front - frontage - court - park - barH + 1, yPark = yBar + barH, yCourt = yPark + park, yFront = yCourt + court;
    const officeW = 8, officeLeft = o.office === 'left';
    const rooms = Math.max(2, Math.floor((w * TILE - 48) / 96));
    const kit = [];
    for (let i = 0; i < rooms; i++) { const kx = Math.round(24 + (i + 0.5) * (w * TILE - 48) / rooms); kit.push(['vent', kx, 40]); if (rnd(i, x, 79) < 0.35) kit.push(['ac', kx + 20, 150]); }
    kit.push(['tank', w * TILE - 60, 90]);
    const bar = K.building({ x, y: yBar, w, h: barH, arch: 'hotel', name: `${o.name} Rooms`, whole: true, poi: false,
      art: { spec: { floors: 2, style: 'stucco', wallColor: wall, parapet: 8, roofMat: 'membrane', lip: 6, rimW: 4, grime: 0.06 + rnd(x, front, 83) * 0.08, balconies: false, motel: { room: 96, door, stair: officeLeft ? 'right' : 'left' }, blades: [] }, noShop: true, neon: { name: null, col: o.col ?? 3 }, kit },
      home: { kind: 'apartment', name: `Room ${1 + Math.floor(rnd(x, front, 84) * rooms)}, ${o.name}`, price: o.price || 6500, slots: 1, garage: { x: (x + w * 0.5) * TILE, y: (yPark + 2) * TILE, a: -Math.PI / 2 } } });
    if (!bar) return null;
    out.homes++;
    // the office at the front corner
    const ox = officeLeft ? x + 1 : x + w - officeW - 1, oy = yFront - 7;
    const office = K.building({ x: ox, y: oy, w: officeW, h: 7, arch: 'hotel', key: 'hotel', name: o.name, whole: true, poi: { kind: 'delivery', label: o.name },
      art: { spec: { floors: 1, style: 'stucco', wallColor: wall, parapet: 16, roofMat: 'membrane', lip: 6, rimW: 4, grime: 0.06, blades: [],
        plaques: [{ text: 'VACANCY', x: officeLeft ? 8 : officeW * TILE - 92, v: 64, sx: 2, bg: '#1a1420', fg: [255, 70, 110], lit: true }] },
      shop: { kind: 'lobby', door: officeLeft ? 'right' : 'left', open: true, people: 1, sign: { text: 'OFFICE', bg: '#1a1420', fg: [120, 230, 255], lit: true }, awning: [door, '#f0ece4'] },
      kit: [['ac', 60, 60], ['vent', 150, 80], ['tank', 70, 160]] } });
    if (office) out.shops++;
    // the parking strip, the paved court, the frontage's lawn
    K.fill(x, yPark, w, park, T.LOT);
    K.fill(x, yCourt, w, court, T.PLAZA);
    K.fill(x, yFront, w, front - yFront + 1, T.GRASS);
    K.take(x, yBar, w, front - yBar + 1);
    // the pool in the court (o.kidney: a bean)
    const pw = Math.min(o.poolW || 12, w - officeW - 8), ph = Math.min(4, court - 3);
    const px0 = officeLeft ? x + officeW + 3 + Math.floor((w - officeW - 4 - pw) / 2) : x + 1 + Math.floor((w - officeW - 4 - pw) / 2), py0 = yCourt + Math.floor((court - ph) / 2);
    if (pw >= 6 && ph >= 3) {
      let nW = 0;
      for (let yy = py0; yy < py0 + ph; yy++) for (let xx = px0; xx < px0 + pw; xx++) {
        if (o.kidney) {
          const u = (xx - px0 + 0.5) / pw, v = (yy - py0 + 0.5) / ph, lobe = Math.min(Math.hypot((u - 0.28) / 0.3, (v - 0.55) / 0.48), Math.hypot((u - 0.72) / 0.3, (v - 0.5) / 0.52)), waist = v < 0.32 && Math.abs(u - 0.5) < 0.12;
          if (lobe > 1 || waist) continue;
        }
        m.set(xx, yy, T.WATER); nW++;
      }
      if (nW) {
        m.pools.push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
        out.pools++;
        for (let k = 0; k < Math.floor(pw / 3); k++) prop('lounger', px0 + 1 + k * 3, py0 - 0.9, 0, { v: k + Math.floor(rnd(x, k, 86) * 4), a: Math.PI / 2 });
        prop('umbrella_b', px0 + 2, py0 + ph + 0.8, 0);
        prop(pick(['umbrella_y', 'umbrella_g', 'umbrella_r'], rnd(x, front, 88)), px0 + pw - 2, py0 + ph + 0.8, 0);
        prop('ringfloat', px0 + pw * 0.62, py0 + ph * 0.5, 0, { v: Math.floor(rnd(x, front, 89) * 3) });
        if (!o.kidney) prop('diveboard', px0 + 0.4, py0 + ph / 2, 0, { len: 40, a: 0 });
      }
    }
    for (let qx = x + 1; qx + 3 <= x + w - 1; qx += 3) { m.stalls.push({ x: qx * TILE, y: yPark * TILE, w: 3 * TILE, h: park * TILE }); if (rnd(qx, front, 90) < 0.55) m.parking.push({ x: (qx + 1.5) * TILE, y: (yPark + 2) * TILE, a: -Math.PI / 2 }); }
    // the frontage: palms, the tall sign at the pavement on the drive's side, lamps, the cola machine, the dumpster
    const sx = officeLeft ? x + officeW + 2 : x + w - officeW - 3;
    for (let px = x + 2; px < x + w - 1; px += 7) if (Math.abs(px - sx) > 2) prop('palm_a', px + 0.5, front - 0.8, 10, { sp: rnd(px, front, 91) < 0.6 ? 'royal' : 'coconut', k: 1.1 + rnd(px, front, 92) * 0.25 });
    prop('motelsign', sx + 0.5, front - 0.4, 10, { text: o.sign, col: o.col ?? 3, z: 104, word: 'MOTEL' });
    prop('lamp', x + 0.8, yCourt + 0.6, 0); prop('lamp', x + w - 0.8, yCourt + 0.6, 0);
    prop('vend_cola', officeLeft ? ox + officeW + 0.6 : ox - 0.6, oy + 6.4, 8);
    prop(pick(['dump_g', 'dump_b'], rnd(x, front, 94)), officeLeft ? x + w - 1.5 : x + 1.5, yPark + 0.8, 12);
    out.motels++;
    placeName(o.name, x, yBar, x + w, front + 1);
    return bar;
  }

  // ===========================================================================================================
  // A block of the boardwalk shops facing the boulevard: one and two floors of pastel stucco, awnings and lit signs,
  // the arcade's neon; a strip of paving in front of them (their tables, the surf shop's boards, the rental bikes);
  // their car park behind, off 5th Street (the stalls along its north side)
  function shopRow(A, list) {
    const [x0, y0, x1, y1] = A;
    let k = 0;
    const depth = 13, patio = 3;
    const made = K.row(x0, x1, y0, y1 - 1 - patio, (x, room) => {
      const L = list[k];
      if (!L) return room >= 1 ? { gap: room, kind: 'passage' } : null;
      const w = Math.min(room, L.w);
      if (w < 6) return { gap: room, kind: 'passage' };
      k++;
      const art = tower(x, y0, { name: L.name, store: L.store, style: 'stucco', wall: L.wall || pick(PASTEL, rnd(x, y0, 21)), floors: L.floors ?? 1 + Math.floor(rnd(x, y0, 22) * 2),
        win: pick(['pair', 'even', 'tall'], rnd(x, y0, 23)), cornice: 'step', parapet: 10, grime: 0.05, roofMat: pick(['membrane', 'tar', 'gravel'], rnd(x, y0, 24)), awning: L.awning ?? null, signC: L.signC, people: 2,
        kit: [['ac', Math.round(w * TILE * 0.3), 70], ['vent', Math.round(w * TILE * 0.7), 110]] });
      if (L.neon) art.neon = L.neon;
      return { w, depth, arch: 'mixed', ...(L.key ? { key: L.key } : {}), name: L.name, poi: L.poi, whole: true, art };
    }, { noStep: true });
    const built = made.filter((b) => b && !b.gap && b.tw !== undefined);
    if (!built.length) return;
    // the paving in front, to the boulevard's pavement: what each shop puts out on it
    const fy = Math.max(...built.map((b) => b.ty + b.th));
    K.fill(x0, fy, x1 - x0, y1 - fy, T.PLAZA);
    for (const b of built) {
      const L = list.find((q) => q.name === b.name);
      if (!L) continue;
      const cx = b.tx + b.tw / 2, py = fy + 1.2;
      if (L.tables) for (let t = 0; t < Math.floor(b.tw / 4); t++) { const tx = b.tx + 2 + t * 4; prop('cafetable', tx, py + 0.3, 6); prop(pick(['umbrella_r', 'umbrella_y', 'umbrella_b', 'umbrella_g'], rnd(tx, fy, 25)), tx, py + 0.2, 0); }
      if (L.boards) for (let t = 0; t < 5; t++) prop('surfboard', b.tx + 1.2 + t * 1.1, fy + 0.5, 0, { v: t % 3 });
      if (L.bikes) { prop('bikerack', cx - 2, py, 8); prop('bikerack', cx + 2, py, 8); }
      if (L.store === 'arcade') { prop('vend_cola', b.tx + 1, fy + 0.6, 8); prop('bench_m', cx + 2, py, 0); }
    }
    for (let x = x0 + 1; x < x1; x += 16) prop('lamp', x, y1 - 0.6, 0);
    // the car park behind, off 5th Street
    const by1 = Math.min(...built.map((b) => b.ty)), bh = by1 - y0;
    if (bh >= 7) {
      K.fill(x0, y0, x1 - x0, bh, T.LOT);
      for (let qx = x0 + 1; qx + 3 <= x1 - 1; qx += 3) { m.stalls.push({ x: qx * TILE, y: (y0 + 1) * TILE, w: 3 * TILE, h: 5 * TILE }); if (rnd(qx, y0, 26) < 0.5) m.parking.push({ x: (qx + 1.5) * TILE, y: (y0 + 3.5) * TILE, a: -Math.PI / 2 }); }
      prop(pick(['dump_g', 'dump_b'], rnd(x0, y0, 27)), x0 + 2, by1 - 0.8, 12); prop('dump_b', x1 - 3, by1 - 0.8, 12);
      prop('lamp', Math.floor((x0 + x1) / 2), y0 + 7, 0);
    }
  }

  // ===========================================================================================================
  // The Sunset Boardwalk: six rows of timber decking along the boulevard's south side; royal and coconut palms by the
  // pavement, lamps, benches facing the sea along its rail; gaps in the rail where you step down to the sand (an
  // outdoor shower and a bike rack at each); the snack cart and the ice-cream cart. Returns its rows and its ends.
  function boardwalk() {
    let y0 = BY.blvd;
    while (y0 < BY.blvd + 14 && !K.free(2600, y0)) y0++;
    if (!K.free(2600, y0)) return null;
    let x0 = BX.juniper; while (x0 < 2560 && !K.free(x0, y0)) x0++;
    let x1 = BX.hazel; while (x1 > 2700 && !K.free(x1 - 1, y0)) x1--;
    const H = 6, y1 = y0 + H;
    K.fill(x0, y0, x1 - x0, H, T.DOCK);
    const gaps = [];
    for (let x = x0 + 10; x < x1 - 6; x += 26) gaps.push(x);
    for (let x = x0; x < x1; x++) {
      if (x % 9 === 4) prop('palm_a', x + 0.5, y0 + 0.9, 10, { sp: x % 18 === 4 ? 'royal' : 'coconut', k: 1.25 + rnd(x, y0, 30) * 0.25 });
      if (x % 12 === 8) prop('lamp', x + 0.5, y1 - 0.7, 0, { style: 'iron' });
      const gap = gaps.some((g) => x >= g - 2 && x < g + 3) || (x >= BX.sunset - 3 && x < BX.sunset + 3);
      if (!gap && x % 3 === 0) prop('rail', x, y1 - 0.15, 0, { tx: 3 * TILE, ty: 0 });
      if (!gap && x % 8 === 2) prop('bench_m', x + 0.5, y1 - 1.4, 0);
    }
    for (const g of gaps) { prop('shower', g + 3.4, y1 + 0.9, 6); prop('bikerack', g - 3.2, y0 + 2.6, 8); prop('trashcan', g + 3.5, y0 + 2.4, 6); }
    // the carts: snacks by the pier, ice cream further along
    prop('foodcart', BX.sunset - 6, y0 + 2.6, 10); prop('umbrella_r', BX.sunset - 4.4, y0 + 3.1, 4);
    m.pois.push({ id: m.pois.length, kind: 'snack', label: 'Boardwalk Snack Cart', x: Math.round((BX.sunset - 6) * TILE), y: Math.round((y0 + 3.6) * TILE), r: 36, counter: true });
    prop('foodcart', 2668, y0 + 2.6, 10); prop('umbrella_y', 2669.6, y0 + 3.1, 4);
    m.pois.push({ id: m.pois.length, kind: 'snack', label: 'Boardwalk Ice Cream Cart', x: 2668 * TILE, y: Math.round((y0 + 3.6) * TILE), r: 36, counter: true });
    prop('textsign', 2600, y0 + 0.4, 0, { text: 'SUNSET BOARDWALK', bg: '#2a5a8a', fg: [255, 226, 140], z: 46, sx: 1 });
    placeName('Sunset Boardwalk', x0, y0, x1, y1);
    return { x0, x1, y0, y1 };
  }

  // ===========================================================================================================
  // Sunset Beach Pier, straight out to sea at Sunset Avenue's foot (the NK1-C kit as Westport Pier's was, shared/
  // naturesites.js): the shaft across the beach and out over the water, rails along it, iron lamps in pairs, benches
  // facing out, rods in holders, life rings; the bait shack on a bump-out halfway along; the T-head: the Ferris wheel on
  // its south side, the coin telescope at its south-west corner, the cleaning table, a cooler, crates, gulls on the
  // posts; the float off its east side with dinghies. Ashore: bollards across its root, its lit sign.
  function pier(bw) {
    const PX = BX.sunset, sx0 = PX - 2, sx1 = PX + 1, BX1 = sx1 + 5, yR = bw.y1;
    let sy = 0;
    for (let x = sx0; x <= BX1; x++) sy = Math.max(sy, shore(x));   // (where the shaft's columns are all over the water)
    if (sy >= SEA - 36) return;
    const L = 22, HY0 = sy + L, HY1 = HY0 + 10, HX0 = PX - 11, HX1 = PX + 11, FX0 = HX1 + 1, FX1 = HX1 + 3, FY0 = HY0 + 4, FY1 = HY0 + 6;
    const BY0 = sy + 7, BY1 = BY0 + 5;   // the bait shack's bump-out (east of the shaft)
    for (let y = HY0 - 3; y <= HY1 + 6; y++) for (let x = HX0 - 3; x <= FX1 + 3; x++) if (!isW(x, y)) return;   // (open water round the head)
    for (let y = sy; y < HY0; y++) for (let x = sx0; x <= BX1; x++) if (!isW(x, y) && (x <= sx1 || (y >= BY0 && y <= BY1))) return;
    const deck = (x, y) => { m.set(x, y, T.DOCK); m.reserve[y * W + x] |= 16; K.take(x, y, 1, 1); };
    for (let y = yR; y < HY0; y++) for (let x = sx0; x <= sx1; x++) { const t = tile(x, y); if (isW(x, y) || t === T.GRASS || t === T.SAND) deck(x, y); }
    for (let y = BY0; y <= BY1; y++) for (let x = sx1 + 1; x <= BX1; x++) deck(x, y);
    for (let y = HY0; y <= HY1; y++) for (let x = HX0; x <= HX1; x++) deck(x, y);
    for (let y = FY0; y <= FY1; y++) for (let x = FX0; x <= FX1; x++) deck(x, y);
    busy.push([sx0, yR, sx1 + 1, sy]);
    // the rails (pieces of up to 6 tiles, solid: the ways off are the boardwalk and the float)
    const solidLine = (x0, y0, x1, y1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 16)); for (let k = 0; k <= n; k++) m.addSolidProp(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, 6); };
    const rail = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0), n = Math.max(1, Math.ceil(len / 192)), seg = len / n;
      for (let k = 0; k < n; k++) prop('pierrail', (x0 + Math.cos(a) * seg * (k + 0.5)) / TILE, (y0 + Math.sin(a) * seg * (k + 0.5)) / TILE, 0, { len: Math.round(seg), a });
      solidLine(x0, y0, x1, y1);
    };
    const T0 = TILE, xW = sx0 * T0 + 3, xE = (sx1 + 1) * T0 - 3, yTop = yR * T0, yH = HY0 * T0 + 3;
    rail(xW, yTop, xW, yH);                                                   // the shaft's west side
    rail(xE, yTop, xE, BY0 * T0 + 3);                                         // its east side, to the bump-out
    rail(xE, (BY1 + 1) * T0 - 3, xE, yH);                                     // ...on from it to the head
    rail(xE, BY0 * T0 + 3, (BX1 + 1) * T0 - 3, BY0 * T0 + 3);                 // the bump-out: north,
    rail((BX1 + 1) * T0 - 3, BY0 * T0 + 3, (BX1 + 1) * T0 - 3, (BY1 + 1) * T0 - 3);   // east,
    rail(xE, (BY1 + 1) * T0 - 3, (BX1 + 1) * T0 - 3, (BY1 + 1) * T0 - 3);     // south
    rail(HX0 * T0 + 3, yH, xW, yH); rail(xE, yH, (HX1 + 1) * T0 - 3, yH);    // the head: north side, either side of the shaft
    rail(HX0 * T0 + 3, yH, HX0 * T0 + 3, (HY1 + 1) * T0 - 3);                 // west
    rail(HX0 * T0 + 3, (HY1 + 1) * T0 - 3, (HX1 + 1) * T0 - 3, (HY1 + 1) * T0 - 3);   // south
    rail((HX1 + 1) * T0 - 3, yH, (HX1 + 1) * T0 - 3, FY0 * T0);               // east, north of the float's gap
    rail((HX1 + 1) * T0 - 3, (FY1 + 1) * T0, (HX1 + 1) * T0 - 3, (HY1 + 1) * T0 - 3);   // ...south of it
    // lamps in pairs along the shaft, benches between them facing out, life rings, rods on the rails
    for (let y = sy - 2, k = 0; y < HY0 - 2; y += 6.5, k++) {
      prop('lamp', sx0 + 0.45, y, 5, { style: 'iron', lift: 4 }); prop('lamp', sx1 + 0.55, y, 5, { style: 'iron', lift: 4 });
      const by = y + 3.2;
      if (by < HY0 - 1 && !(by > BY0 - 1 && by < BY1 + 2)) { prop('pbench', sx0 + 0.55, by, 8, { a: Math.PI, lift: 4 }); prop('pbench', sx1 + 0.45, by, 8, { a: 0, lift: 4 }); }
      if (k % 2 === 1) prop('rods', k % 4 === 1 ? sx0 + 0.25 : sx1 + 0.75, y + 1.6, 0, { a: k % 4 === 1 ? Math.PI : 0 });
    }
    for (const [x, y] of [[sx0 + 0.38, sy + 4], [sx1 + 0.62, sy + 15], [HX0 + 0.38, HY0 + 3], [HX1 + 0.62, HY1 - 2]]) prop('lifering', x, y, 0);
    // the bait shack on its bump-out, its sign and counter, the cleaning table
    const shx = sx1 + 3.1, shy = BY0 + 2.6;
    prop('baitshack', shx, shy, 0);
    for (const dx of [-40, -16, 16, 40]) m.addSolidProp(Math.round(shx * TILE + dx), Math.round(shy * TILE - 6), 18);
    prop('textsign', shx, BY0 + 0.4, 0, { text: 'BAIT & TACKLE', z: 26, sx: 1, bg: '#24506e', fg: [250, 240, 210] });
    m.pois.push({ id: m.pois.length, kind: 'tackle', label: 'Sunset Pier Bait & Tackle', x: Math.round((sx1 + 0.6) * TILE), y: Math.round(shy * TILE), r: 40, counter: true });
    prop('fishtable', sx1 + 1.6, BY1 + 0.3, 8, { a: 0 }); prop('cooler', BX1 + 0.3, BY1 + 0.2, 0, { v: 1, lift: 4 });
    // the head: the Ferris wheel on its south side (its legs solid; you walk round under it), the telescope at the
    // south-west corner looking out to sea, benches along the west rail, the table, a cooler and crates, gulls
    const wx = PX + 4.5, wy = HY1 - 1.3;
    prop('ferris', wx, wy, 0);
    for (const sd of [-1, 1]) for (const dy of [-12, 12]) m.addSolidProp(Math.round(wx * TILE + sd * 60), Math.round(wy * TILE + dy), 6);
    const wheel = { x: Math.round(wx * TILE), y: Math.round(wy * TILE) };
    wheel.board = { x: wheel.x, y: wheel.y + 30 };
    m.pois.push({ id: m.pois.length, kind: 'ride', label: 'Sunset Pier Ferris Wheel', x: wheel.board.x, y: wheel.board.y, r: 40, counter: true });
    prop('scope', HX0 + 0.9, HY1 + 0.3, 6, { lift: 4 });
    for (let y = HY0 + 2; y < HY1 - 1; y += 3) prop('pbench', HX0 + 0.55, y, 8, { a: Math.PI, lift: 4 });
    for (const [x, y] of [[HX0 + 0.5, HY0 + 0.5], [HX1 + 0.5, HY0 + 0.5], [HX0 + 0.5, HY1 + 0.5], [HX1 + 0.5, HY1 + 0.5]]) prop('lamp', x, y, 5, { style: 'iron', lift: 4 });
    prop('fishtable', PX - 5, HY0 + 1.4, 8, { a: 0 }); prop('cooler', PX - 3.6, HY0 + 1.6, 0, { v: 2, lift: 4 }); prop('crates', HX0 + 2.4, HY0 + 1.6, 10, { lift: 4 });
    for (const [x, y] of [[HX0 + 0.6, HY1 - 2], [HX0 + 2.6, HY1 + 0.75], [HX1 + 0.75, HY0 + 2.2]]) prop('rods', x, y, 0, { a: y > HY1 ? Math.PI / 2 : x < PX ? Math.PI : 0 });
    for (const [x, y, a] of [[HX0 + 0.1, HY0 + 5.2, 2.4], [sx0 + 0.1, sy + 9, -0.6], [HX1 + 0.92, HY1 - 0.4, 0.9]]) prop('gull', x, y, 0, { a, z: 30 });
    // the float off the head's east side: dinghies tied up, cleats at its corners
    prop('canoe', FX1 + 1.8, FY0 + 0.6, 0, { a: 0, c: 0 }); prop('canoe', FX1 + 1.6, FY1 + 0.6, 0, { a: 0, c: 2 });
    for (const [x, y] of [[FX1 + 0.7, FY0 + 0.3], [FX1 + 0.7, FY1 + 0.7]]) prop('mooring', x, y, 0, { lift: 4 });
    m.marina.push({ x: Math.round((FX1 + 4) * TILE), y: Math.round((FY0 + 1.5) * TILE), a: 0, kind: 'dinghy' });
    // ashore: bollards across the root (no cars on the pier), the lit sign over it
    for (const bx of [sx0 + 0.3, sx0 + 1.4, sx0 + 2.6, sx0 + 3.7]) prop('bollard', bx, yR - 0.3, 5);
    prop('textsign', PX, yR + 0.6, 0, { text: 'SUNSET BEACH PIER', z: 56, bg: '#1d3f6e', fg: [255, 226, 120] });
    // what the rest of the game reads: the ride (shared/rides.js ferrisSite), the boat rentals beside the root
    // (shared/map.js: a launch near m.publicPier), a drop-off at the head, the pier's name on the map
    const root = { x: PX * TILE, y: yR * TILE }, head = { x: PX * TILE, y: Math.round((HY0 + HY1 + 1) / 2 * TILE) };
    (m.natureSites ||= []).push({ kind: 'pier', hand: true, name: 'Sunset Beach Pier', x: root.x, y: Math.round((yR + HY0) / 2 * TILE), head, len: HY0 - yR, root, ferris: wheel });
    m.publicPier = { x: (PX + 16) * TILE, y: (sy - 7) * TILE };
    m.dropSites.push({ x: head.x, y: head.y, name: 'the end of Sunset Beach Pier' });
    (m.landmarks ||= []).push({ name: 'Sunset Beach Pier', type: 'pier', x: HX0 * TILE, y: yR * TILE, w: (HX1 - HX0 + 1) * TILE, h: (HY1 - yR + 1) * TILE });
    placeName('Sunset Beach Pier', HX0, yR, HX1 + 1, HY1 + 1);
    out.pier = { root: [PX, yR], head: [HX0, HY0, HX1, HY1], shore: sy };
  }

  // ===========================================================================================================
  // A tiki bar on the sand below the boardwalk: its thatched hut on a timber deck, tiki torches, tables under umbrellas
  // in front, loungers to the sides (a bar: its counter)
  function tikiBar(x, bw, name, sign, bg) {
    const y = bw.y1 + 2, w = 9, h = 6;
    if (!K.allFree(x, y, w, h)) return;
    const b = K.building({ x, y, w, h, arch: 'beachbar', key: 'beachbar', name, poi: { kind: 'club', label: name }, whole: true });
    if (!b) return;
    out.shops++;
    K.fill(x - 3, bw.y1, w + 6, h + 7, T.DOCK);
    busy.push([x - 3, bw.y1, x + w + 3, y + h + 5]);
    for (const dx of [-2.2, w + 2.2]) for (const dy of [1, 6]) prop('torch', x + dx, y + dy, 6);
    for (let k = 0; k < 3; k++) { prop('cafetable', x + 1.5 + k * 3, y + h + 2.2, 6); prop(['umbrella_g', 'umbrella_y', 'umbrella_r'][k], x + 1.5 + k * 3, y + h + 2.1, 0); }
    for (const dx of [-2.4, w + 2.4]) prop('lounger', x + dx, y + h + 3.4, 0, { v: Math.floor(rnd(x, dx, 31) * 4), a: Math.PI / 2 });
    prop('textsign', x + w / 2, y + h + 4.6, 0, { text: sign, bg, fg: [255, 214, 120], z: 26, sx: 1 });
    placeName(name, x - 3, bw.y1, x + w + 3, y + h + 5);
  }

  // ===========================================================================================================
  // The lifeguards' station east of the pier's root (white stucco, the red rescue board on its wall), its tower on
  // the sand in front; the towers along the beach at the water's edge
  function lifeguards(bw) {
    const x = BX.sunset + 8, y = bw.y1 + 1, w = 9, h = 6;
    if (K.allFree(x, y, w, h)) {
      const art = tower(x, y, { name: 'Sunset Beach Lifeguards', sign: 'LIFEGUARDS', store: 'lobby', style: 'stucco', wall: '#f2f0ea', floors: 1, win: 'even', parapet: 10, grime: 0.04, roofMat: 'membrane', awning: ['#c83a2a', '#f0ece4'], signC: ['#c83a2a', [255, 250, 245]], people: 1,
        kit: [['ac', 60, 60], ['dish', 200, 80]] });
      const b = K.building({ x, y, w, h, arch: 'office', name: 'Sunset Beach Lifeguards', poi: { kind: 'delivery', label: 'Sunset Beach Lifeguards' }, whole: true, art });
      if (b) { out.shops++; K.fill(x - 1, y + h, w + 2, 2, T.PLAZA); busy.push([x - 1, y, x + w + 1, y + h + 4]); prop('surfboard', x + w + 0.6, y + h - 1, 0, { v: 1 }); prop('lifering', x - 0.6, y + h - 1.2, 0); }
    }
    for (const lx of [2532, 2600, 2650, 2700]) { const s = shore(lx); if (s < SEA) { prop('lifeguard', lx, s - 4.5, 16); busy.push([lx - 2, s - 7, lx + 2, s - 3]); } }
  }

  // ===========================================================================================================
  // Sunset Skate Park on the sand side of the boardwalk (SK5, Venice-style): the concrete slab, quarter pipes at either
  // end, the pyramid, ledges, a kicker and a flat bar, the tagged wall along the boardwalk, benches and a boombox (the
  // skaters' laps: map.skateSpots)
  function skatePark(bw) {
    const x = 2624, w = 28, y0 = bw.y1 + 1, h = 14;
    if (!K.allFree(x, y0, w, h)) return;
    K.fill(x, y0, w, h, T.PLAZA); K.take(x, y0, w, h);
    busy.push([x, y0, x + w, y0 + h]);
    prop('skatepad', x + w / 2, y0 + 0.4, 0, { w: Math.round((w - 0.4) * TILE), d: Math.round((h - 0.8) * TILE) });
    prop('qpipe', x + w * 0.22, y0 + 1.6, 0, { w: 192 });
    prop('qpipe', x + w * 0.78, y0 + 1.6, 0, { w: 192 });
    prop('pyramid', x + w / 2, y0 + h * 0.45);
    prop('kicker', x + w * 0.2, y0 + h * 0.6);
    prop('ledge', x + w * 0.8, y0 + h * 0.6, 0, { w: 128, v: 1 });
    prop('flatbar', x + w * 0.35, y0 + h * 0.82, 0, { w: 128 });
    prop('ledge', x + w * 0.68, y0 + h * 0.85, 0, { w: 96, v: 2 });
    prop('gwall', x + w / 2, y0 + 0.2, 0, { len: Math.round((w - 0.6) * TILE), v: 1 });
    prop('boombox', x + 1.2, y0 + h * 0.5); prop('bench_m', x - 1.2, y0 + h * 0.4, 0); prop('bench_m', x + w + 1.2, y0 + h * 0.4, 0);
    prop('lamp', x - 0.8, y0 + 1, 0); prop('lamp', x + w + 0.8, y0 + 1, 0); prop('trashcan', x + w + 1, y0 + h - 1, 6);
    const seats = [[0.8, 0.6], [0.68, 0.85]].map(([fx, fy]) => ({ x: Math.round((x + w * fx) * TILE), y: Math.round((y0 + h * fy) * TILE) + 4 }));
    (m.skateSpots ||= []).push({ name: 'Sunset Skate Park', x, y: y0, w, h, seats });
    prop('textsign', x + w / 2, y0 + h + 0.6, 0, { text: 'SUNSET SKATE PARK', bg: '#1a1a20', fg: [250, 160, 60], z: 30, sx: 1 });
    placeName('Sunset Skate Park', x, y0, x + w, y0 + h);
  }

  // ===========================================================================================================
  // The volleyball court on the sand between the skate park and the east tiki bar (the game: m.venues)
  function volleyball(bw) {
    const x = 2666, y = bw.y1 + 6, w = 16, h = 8;
    for (let yy = y - 1; yy < y + h + 1; yy++) for (let xx = x - 1; xx < x + w + 1; xx++) if (!K.free(xx, yy) && tile(xx, yy) !== T.SAND) return;
    for (let yy = y - 1; yy < y + h + 1; yy++) for (let xx = x - 1; xx < x + w + 1; xx++) { m.set(xx, yy, T.SAND); K.take(xx, yy, 1, 1); }
    busy.push([x - 1, y - 1, x + w + 1, y + h + 1]);
    const rect = { x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE }, netX = rect.x + rect.w / 2;
    m.addSolidProp(netX, rect.y - 6, 5); m.addSolidProp(netX, rect.y + rect.h + 6, 5);
    m.venues.push({ id: m.venues.length, kind: 'volley', name: 'Boardwalk Volleyball', rect, netX });
    prop('bench_m', x - 2.4, y + h / 2, 0); prop('cooler', x + w + 1.6, y + 1, 0, { v: 0 });
  }

  // ===========================================================================================================
  // The beach: sand from the boardwalk down to the water; umbrellas over loungers and towels in loose rows above the
  // waterline, surfboards stood in the sand, a cooler or two (keeping off the set pieces)
  function beach(bw) {
    for (let x = bw.x0; x < bw.x1; x++) {
      const s = shore(x);
      for (let y = bw.y1; y < s; y++) if (K.free(x, y)) { m.set(x, y, T.SAND); K.take(x, y, 1, 1); }
      if (s >= SEA) continue;
      const put = (t, px, py, extra) => { if (!isBusy(Math.floor(px), Math.floor(py)) && tile(Math.floor(px), Math.floor(py)) === T.SAND) prop(t, px, py, 0, extra); };
      if (x % 6 === 1) { put('lounger', x + 0.5, s - 9.5, { v: x % 4, a: Math.PI / 2 }); put(pick(['umbrella_r', 'umbrella_y', 'umbrella_b', 'umbrella_g'], rnd(x, s, 40)), x + 1.4, s - 9.8); }
      if (x % 7 === 4) { put('towel', x + 0.5, s - 6, { v: x % 5 }); if (rnd(x, s, 41) < 0.5) put(pick(['umbrella_y', 'umbrella_r', 'umbrella_g'], rnd(x, s, 42)), x + 1.5, s - 6.4); }
      if (x % 23 === 11) put('surfboard', x + 0.5, s - 3.6, { v: x % 3 });
      if (x % 29 === 17) put('cooler', x + 0.5, s - 7.2, { v: x % 3 });
    }
    placeName('Sunset Beach', bw.x0, bw.y1, bw.x1, shore(2600));
  }
}
