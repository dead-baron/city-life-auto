// World v3: where a new character gets their first car (the owner, 11-06 22:49: "The first car is earned, by the path
// you pick" - server/systems/firstcar.js), and the city's arrival moved beside Greenfield Park ("beautiful and
// interesting and hand crafted"). Two passes at the very end of the world build's `done` hook - after every other pass
// that adds a building or a place, so no building's, place's or home's number moves: everything here joins its list last.
//
// parkWest3(m, H3) - before the arrival lines (shared/world3-arrivals.js arrivalLines3, which lays the line itself on the
// ground made ready here: m.handArrivals.city). Greenfield Park's west lawn, south of the soccer pitch and north of the
// west gate, across Park West Avenue from Park West Tower (the owner's Midtown / park concepts: WC355's park edge, the
// Midtown shop rows' brick and awnings). From north to south, all of it low so the camera sees it (nothing taller in
// front of it - test/world3arrivals.test.js):
//   - Park West Motors, the used lot (LOT paving, its little brick office, seven beaters on display - m.dealerLots,
//     `used` - its bunting and USED CARS board), opening onto the lane and the avenue;
//   - the steal alley beside it: a four-tile dead-end alley between the lot's fence and the shops' side wall, its three
//     spaces nose-out (m.stealAlleys), a dumpster, bags, crates and a pallet against the walls;
//   - three small shops facing the lane: Lane Mart (a corner store), Park West Coffee (its tables out front) and
//     Greenfield Flowers (buckets of flowers by the door);
//   - Park West Lane: asphalt off the avenue, a dead end (bollards, a hot dog cart) - never a road, so no traffic comes in;
//     strung lights over it, lamps, benches, the bought cars' spaces along its south kerb;
//   - the walk behind the platform, then the arrival line: Greenfield Park Station (its delivery stop: the station's
//     place, kind 'delivery' - no timetable, no menu), the train out of a hill by the pond, the platform on the lane's
//     side, into a hill under the avenue. The park's trees in front of it give way to flower beds.
// The park's loop path is cut by the west hill: it runs on along the avenue's pavement (paved links either side).
//
// firstCars3(m, H3) - after the arrival lines: at each of the other arrival stations a small used lot and a back alley
// within a short walk of its platform's way out - Northshore's beach lot, Red Rock's junkyard, Willow Valley's farm-truck
// lot - on open ground fronting a road, never on a track, a platform or a station's own ground.
// Out: m.stealAlleys [{ name, x, y, spots: [{ x, y, a }], stn }]; 'usedlot' places { lot: spots for cars bought from its
// menu, stn: the station's place, stock: the beaters it sells (shared/rules.js FTUE.lot) }; m.dealerLots entries
// { poi, slots, used: 1 } (server/systems/dealer.js stocks them with the beaters at their prices).
// Deterministic: integer tile arithmetic, hash2 by place; nothing at load.
import { TILE, T } from './constants.js';
import { hash2 } from './rng.js';

const D_DOWNTOWN = 4;
// the park block, in frame tiles (Greenfield Park's west edge is x 2997; Park West Avenue's pavement 2993-2996)
export const PARK_WEST = {
  x0: 2997, x1: 3036,
  line: { cx: 2997, cy: 2470 },           // the arrival line's first tile and track row (shared/world3-arrivals.js: along +x, the platform north)
  walk: 2465,                              // the walk behind the platform
  lane: [2461, 2464],                      // Park West Lane
  front: 2460,                             // the shops' pavement
  lot: [3002, 2446, 3013, 2459],           // the used lot (inclusive)
  office: [3002, 2446, 6, 5],              // its office (x, y, w, h)
  alley: [3014, 2446, 3017, 2460],         // the alley
  shops: [[3018, 6, 'Lane Mart'], [3024, 7, 'Park West Coffee'], [3031, 6, 'Greenfield Flowers']],
  shopRows: [2447, 2459],
};
const BRICK = ['#8e4a3a', '#7a4a3a', '#9a5040', '#84463a'];

// ---- the kit ---------------------------------------------------------------------------------------------------------
function kit(m, H3) {
  const at = (x, y) => m.idx(x, y);
  const set = (x, y, t) => { if (m.inside(x, y)) { m.tiles[at(x, y)] = t; } };
  const fill = (x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t); };
  const prop = (t, tx, ty, solid = 0, extra = null) => (H3 && H3.addProp ? H3.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), solid, extra) : null);
  // a building on free ground: its roof, its tiles; b.art the art's (as the hand plans' and the lot shops' - world3-lots.js)
  const building = (x, y, w, h, name, art, arch = 'rough') => {
    const bid = m.buildings.length, d = m.dist[at(x + (w >> 1), y + (h >> 1))];
    m.roofs.push({ tx: x, ty: y, tw: w, th: h, kind: 'tar', seed: (Math.imul(x, 7919) ^ Math.imul(y, 104729)) >>> 0, d, b: bid });
    const b = { id: bid, prefab: -1, roof: m.roofs.length - 1, tx: x, ty: y, tw: w, th: h, kind: arch, arch, name, business: null, signs: [], whole: true, art };
    m.buildings.push(b);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { m.tiles[at(xx, yy)] = T.BUILDING; m.bld[at(xx, yy)] = bid; }
    return b;
  };
  // a place at the end of the list
  const poi = (o) => { const p = { id: m.pois.length, r: 48, fixed: true, ...o }; m.pois.push(p); return p; };
  const clearProps = (x0, y0, x1, y1) => { if (H3 && H3.removeProps) H3.removeProps(m, (x, y) => x >= x0 * TILE && x < (x1 + 1) * TILE && y >= y0 * TILE && y < (y1 + 1) * TILE); };
  const shopArt = (x, y, o) => {
    const r = (k) => hash2(x, y, 1700 + k);
    return { spec: { floors: o.floors || 2, style: 'brick', brickTone: o.tone || BRICK[Math.floor(r(1) * BRICK.length)], win: 'pair', cornice: o.cornice || 'dentil', parapet: 8, grime: 0.12 + r(2) * 0.1, roofMat: 'tar', lip: 10, rimW: 5 },
      shop: { kind: o.store, door: o.door || 'left', open: true, people: o.people ?? 2, awning: o.awning || null, sign: { text: o.sign.toUpperCase().slice(0, 20), bg: o.signC[0], fg: o.signC[1], lit: true }, ...(o.trade ? { trade: o.trade } : {}) } };
  };
  return { at, set, fill, prop, building, poi, clearProps, shopArt };
}

// ---- Greenfield Park Station and the Park West block ------------------------------------------------------------------
export function parkWest3(m, H3) {
  const P = PARK_WEST, K = kit(m, H3), out = { built: false };
  if (!m.inside(P.x0, P.line.cy) || m.dist[K.at(P.x0 + 10, P.line.cy)] !== D_DOWNTOWN && m.dist[K.at(P.x0 + 10, P.line.cy)] !== 12) { out.why = 'not the park'; return out; }
  const { cx, cy } = P.line, X1 = cx + 40;
  // the ground: the corridor's rows (the line's and its margins) open lawn, nothing standing on them; the block north of
  // it cleared and laid
  K.clearProps(P.x0, P.lot[1] - 1, X1 + 4, cy + 4);
  K.clearProps(P.x0 + 6, cy + 5, X1 - 4, cy + 12);   // (the trees in front of the station: flower beds instead - below)
  for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx; x < X1; x++) { const i = K.at(x, y); m.tiles[i] = T.GRASS; m.reserve[i] &= 16; if (m.bld[i] >= 0) return out; }
  // the walk behind the platform (the path off it: world3-arrivals.js finds it here), and on east to the pond's path
  K.fill(P.x0, P.walk, X1 + 3, P.walk, T.PLAZA);
  // Park West Lane: asphalt off the avenue (the lot's way out, the alley's), a dead end
  K.fill(P.x0, P.lane[0], X1, P.lane[1], T.LOT);
  // the shops' pavement and the loop path's stretch down the lot's west side
  K.fill(P.alley[2] + 1, P.front, X1 - 1, P.front, T.PLAZA);
  K.fill(P.x0 + 2, P.lot[1], P.x0 + 4, P.front, T.PLAZA);
  K.fill(P.x0, P.lot[1], P.x0 + 1, P.front, T.GRASS);
  // the loop path cut by the hill under the avenue: paved links to the avenue's pavement either side
  K.fill(P.x0, cy + 5, P.x0 + 4, cy + 6, T.PLAZA);
  // ---- Park West Motors: the used lot, its office, the display spaces, the bunting and the board
  const [lx0, ly0, lx1, ly1] = P.lot;
  K.fill(lx0, ly0, lx1, ly1, T.LOT);
  const [ox, oy, ow, oh] = P.office;
  const office = K.building(ox, oy, ow, oh, 'Park West Motors', K.shopArt(ox, oy, { floors: 1, store: 'mart', sign: 'PARK WEST MOTORS', signC: ['#1e3a5e', [250, 220, 90]], awning: ['#c8503a', '#f0ece4'], door: 'right', people: 1, tone: '#7a4a3a', cornice: 'step' }));
  office.door = { tx: ox + ow - 2, ty: oy + oh };
  office.business = 'usedlot';
  const slots = [];
  for (const x of [3003.5, 3006.5, 3009.5, 3012.5]) slots.push({ x: Math.round(x * TILE), y: Math.round(2453.6 * TILE), a: Math.PI / 2 });
  for (const x of [3003.5, 3006.5, 3009.5]) slots.push({ x: Math.round(x * TILE), y: Math.round(2457.6 * TILE), a: Math.PI / 2 });
  const lotSpots = [];   // (the bought cars' spaces: along the lane's south kerb, nose to tail)
  for (const x of [3003, 3007, 3011, 3021, 3025, 3029, 3033]) lotSpots.push({ x: Math.round(x * TILE), y: Math.round((P.lane[1] - 0.1) * TILE), a: 0 });
  K.prop('festoon', lx0 + 0.3, ly1 + 0.7, 0, { tx: Math.round((lx1 - lx0 + 0.4) * TILE), ty: 0, h: 44 });
  K.prop('festoon', lx1 - 0.5, oy + 0.4, 0, { tx: 0, ty: Math.round((ly1 - oy - 0.2) * TILE), h: 44 });
  K.prop('textsign', lx0 + 1.6, ly1 + 0.4, 0, { text: 'USED CARS', bg: '#c8503a', fg: [255, 246, 220], z: 30, sx: 1, lit: true });
  K.prop('chainfence', lx1 + 0.9, ly0, 0, { tx: 0, ty: Math.round((ly1 - ly0 + 0.6) * TILE) });
  K.prop('planter_g', ox + ow + 1, oy + 1.2, 0);
  K.prop('tires', ox + ow + 3.5, oy + 1.0, 8);
  // ---- the alley: asphalt between the lot's fence and the shops' wall, a dead end at the pitch's fence; three spaces
  // nose-out to the lane; the dumpster at its end, the bags and crates along its walls
  const [ax0, ay0, ax1, ay1] = P.alley;
  K.fill(ax0, ay0, ax1, ay1, T.LOT);
  const acx = (ax0 + ax1 + 1) / 2, aspots = [2449, 2452.8, 2456.6].map((y) => ({ x: Math.round(acx * TILE), y: Math.round(y * TILE), a: Math.PI / 2 }));
  K.prop('dump_g', acx, ay0 + 0.7, 14);
  K.prop('bags', ax1 + 0.55, ay0 + 1.2, 0);
  K.prop('crates', ax0 + 0.35, ay0 + 4.2, 0);
  K.prop('pallet', ax1 + 0.6, ay0 + 7.6, 0);
  K.prop('trashpile', ax0 + 0.4, ay0 + 10.4, 0);
  K.prop('lamp', ax1 + 0.7, ay0 + 2.4, 0);
  // ---- the shops facing the lane
  const SHOPS = [
    { store: 'mart', sign: 'LANE MART', signC: ['#a8343a', [255, 240, 210]], awning: ['#a8343a', '#f0ece4'], poi: { kind: 'convenience', label: 'Lane Mart' }, door: 'right' },
    { store: 'cafe', sign: 'PARK WEST COFFEE', signC: ['#2f5a4a', [240, 232, 200]], awning: ['#2f5a4a', '#efe6d0'], poi: { kind: 'coffee', label: 'Park West Coffee', food: true }, door: 'left', people: 3 },
    { store: 'florist', sign: 'GREENFIELD FLOWERS', signC: ['#f0ece4', [47, 106, 78]], awning: ['#2f6a4e', '#f0ece4'], poi: { kind: 'delivery', label: 'Greenfield Flowers' }, door: 'left', tone: '#9a5040' },
  ];
  const [sy0, sy1] = P.shopRows, shops = [];
  P.shops.forEach(([x, w, name], k) => {
    const S = SHOPS[k], b = K.building(x, sy0, w, sy1 - sy0 + 1, name, K.shopArt(x, sy0, S), 'rough');
    const dtx = S.door === 'right' ? x + w - 2 : x + 1;
    b.door = { tx: dtx, ty: sy1 + 1 };
    b.signs.push({ x: Math.round((x + w / 2) * TILE), y: Math.round((sy1 + 0.4) * TILE), text: name });
    if (S.poi.kind !== 'delivery') b.business = S.poi.kind;
    shops.push({ b, S, door: dtx });
  });
  // ---- the lane's life: strung lights over it, lamps and benches, the cafe's tables, the florist's buckets, the dead
  // end's bollards and hot dog cart
  K.prop('festoon', P.x0 + 5, P.lane[0] + 0.2, 0, { tx: Math.round((X1 - P.x0 - 7) * TILE), ty: 0, h: 64 });
  for (const x of [P.x0 + 4.6, ax1 + 1.4, X1 - 1.6]) K.prop('lamp', x, P.front + 0.7, 0);
  K.prop('bench_m', ax1 + 3.2, P.front + 0.6, 0);
  const cafe = shops[1];
  for (const dx of [1.6, 4.6]) { K.prop('cafetable', cafe.b.tx + dx, P.front + 0.5, 0); K.prop(dx < 3 ? 'umbrella_r' : 'umbrella_g', cafe.b.tx + dx, P.front + 0.4, 0); }
  const flo = shops[2];
  for (const dx of [2.6, 3.8, 5.0]) K.prop('flowers_big', flo.b.tx + dx, P.front + 0.5, 0);
  for (const y of [P.lane[0] + 0.6, P.lane[0] + 2.0, P.lane[0] + 3.4]) K.prop('bollard', X1 + 0.6, y, 4);
  K.prop('foodcart', X1 + 2.4, P.lane[0] + 1.6, 14);
  K.prop('bikerack', X1 + 2.0, P.front - 1.2, 0);
  // the station's front: flower beds where the park's trees stood in front of it (low: the board and the platform in
  // sight from the park), a bench or two
  for (let x = cx + 8; x <= X1 - 8; x += 5) K.prop('flowers_big', x + 0.5, cy + 7.5, 0);
  // ---- the places (at the end of the list): the station's stop, the used lot, the shops
  const st = K.poi({ kind: 'delivery', label: 'Greenfield Park Station', x: Math.round((cx + 20.5) * TILE), y: Math.round((P.lane[0] + 0.6) * TILE), r: 40, arrival: 1 });
  const lot = K.poi({ kind: 'usedlot', label: 'Park West Motors', x: Math.round((office.door.tx + 0.5) * TILE), y: Math.round((oy + oh + 0.7) * TILE), b: office.id, lot: lotSpots, stn: st.id, stock: ['starter', 'rustpickup'], sub: 'Cheap wheels by Greenfield Park, sold as seen. Pick one off the lot or from the list - parked out on the lane for you.' });
  for (const { b, S, door } of shops) {
    const q = K.poi({ ...S.poi, x: Math.round((door + 0.5) * TILE), y: Math.round((P.shopRows[1] + 1.7) * TILE), b: b.id });
    if (S.poi.kind === 'convenience') q.store = 'mart';
  }
  (m.dealerLots ||= []).push({ poi: lot.id, slots, used: 1, stock: lot.stock });
  (m.stealAlleys ||= []).push({ name: 'the alley off Park West Lane', x: Math.round(acx * TILE), y: Math.round(((ay0 + ay1) / 2) * TILE), spots: aspots, stn: st.id });
  // the arrival line (shared/world3-arrivals.js arrivalLines3: laid on this ground, the platform north of the track)
  (m.handArrivals ||= {}).city = { poi: st.id, cx, cy, h: true, sd: -1 };
  Object.assign(out, { built: true, station: st.id, lot: lot.id, shops: shops.map((s) => s.b.id), office: office.id });
  return out;
}

// ---- the other arrival stations: a small used lot and a back alley each --------------------------------------------------
// what each region's is: its name, its stock, its ground and dressing
const YARDS = {
  coast: { lot: 'Northshore Beach Motors', alley: 'the alley behind Beach Motors', stock: ['starter', 'rustpickup'], short: 'BEACH MOTORS', sign: ['#2a6a8a', [255, 246, 220]], tone: '#a49484', dress: ['planter_g', 'bikerack'] },
  desert: { lot: 'Red Rock Salvage & Sales', alley: 'the scrap lane behind Red Rock Salvage', stock: ['rustpickup', 'starter'], short: 'RED ROCK SALVAGE', sign: ['#8a3a22', [255, 226, 160]], tone: '#9a5040', dress: ['tires', 'trashpile'] },
  country: { lot: 'Willow Valley Farm Trucks', alley: 'the barn lane behind Farm Trucks', stock: ['rustpickup'], short: 'FARM TRUCKS', sign: ['#2f6a4e', [250, 240, 200]], tone: '#84463a', dress: ['pallet', 'crates'] },
};
const YW = 21, YH = 16;   // (the yard: the lot 15 wide, a fence, the alley 5; 16 deep)
const GO = new Set([T.ROAD, T.SIDEWALK, T.PLAZA, T.LOT]);
// open ground for the yard at (x, y)..(x + YW, y + YH): grass, dirt or sand (a beach's kept-open sand too), nothing built,
// no track, platform, tunnel or a station's ground; along its south side (or its north - `north`) a road, a pavement or
// paving to drive and walk out onto, `share` of its width at least
function yardFits(m, x, y, keepOut, share, north, paved = false) {
  for (let ty = y - 1; ty <= y + YH; ty++) for (let tx = x - 1; tx <= x + YW; tx++) {
    if (!m.inside(tx, ty)) return false;
    const i = m.idx(tx, ty), t = m.tiles[i];
    if (!(t === T.GRASS || t === T.DIRT || t === T.SAND || (paved && (t === T.PLAZA || t === T.LOT))) || m.bld[i] >= 0 || (m.reserve[i] & ~16) || (m.cover && m.cover[i]) || (m.deck && m.deck[i])) return false;
    if (keepOut(tx, ty)) return false;
  }
  let front = 0;
  const fy = north ? y - 2 : y + YH + 1;
  for (let tx = x; tx < x + YW; tx++) if (m.inside(tx, fy) && GO.has(m.tiles[m.idx(tx, fy)])) front++;
  return front >= YW * share;
}
export function firstCars3(m, H3) {
  const out = { yards: [], missed: [] };
  const K = kit(m, H3);
  const boxes = (m.arrivals || []).map((A) => { const xs = A.pts.map((p) => p.x), ys = A.pts.map((p) => p.y); return [Math.min(...xs) - 8 * TILE, Math.min(...ys) - 8 * TILE, Math.max(...xs) + 8 * TILE, Math.max(...ys) + 8 * TILE]; });
  const near = (tx, ty, x, y, r) => Math.abs((tx + 0.5) * TILE - x) < r && Math.abs((ty + 0.5) * TILE - y) < r;
  const keepOut = (tx, ty) => boxes.some(([x0, y0, x1, y1]) => (tx + 0.5) * TILE >= x0 && (tx + 0.5) * TILE <= x1 && (ty + 0.5) * TILE >= y0 && (ty + 0.5) * TILE <= y1)
    || m.pois.some((q) => near(tx, ty, q.x, q.y, 3 * TILE)) || (m.parking || []).some((s) => near(tx, ty, s.x, s.y, 2 * TILE));
  for (const A of m.arrivals || []) {
    const Y = YARDS[A.key];
    if (!Y) continue;
    // the nearest fit to the platform's way out, a short walk: a road along its south side first, then its north, then
    // less of its width on a road, out to 80 tiles
    const ex = Math.floor((A.exit[2]) / TILE), ey = Math.floor((A.exit[3]) / TILE);
    let best = null;
    // (and last, open paving too - a seafront's promenade or a paved yard, nothing standing on it)
    for (const [share, R, paved] of [[0.6, 60, false], [0.35, 80, false], [0.2, 90, true]]) {
      let bd = Infinity;
      for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
        const d = Math.hypot(dx, dy);
        if (d >= bd || d > R) continue;
        const x = ex + dx - (YW >> 1), y = ey + dy - (YH >> 1);
        for (const north of [false, true]) if (yardFits(m, x, y, keepOut, share, north, paved)) { best = { x, y, north }; bd = d; break; }
      }
      if (best) break;
    }
    if (!best) { out.missed.push(A.key); continue; }
    out.yards.push(yard(m, H3, K, A, Y, best.x, best.y, best.north));
  }
  return out;
}
// (the road on its north side, `north`: the way out that side; the office still at its back, the lot open to the road)
function yard(m, H3, K, A, Y, x, y, north = false) {
  K.clearProps(x - 1, y - 1, x + YW, y + YH);
  const lx0 = x, lx1 = x + 14, ax0 = x + 16, ax1 = x + YW - 1, y1 = y + YH - 1;
  K.fill(lx0, y, lx1, y1, T.LOT);   // (paved: nothing grows over it - the bake dresses open dirt with the wild's plants)
  K.fill(ax0, y, ax1, y1, T.LOT);
  const wy = north ? y - 1 : y1 + 1;
  K.fill(x, wy, x + YW - 1, wy, T.LOT);   // (the way out onto the road)
  const office = K.building(lx0 + 1, y + 1, 6, 4, Y.lot, K.shopArt(lx0 + 1, y + 1, { floors: 1, store: 'mart', sign: Y.short, signC: Y.sign, awning: [Y.sign[0], '#f0ece4'], door: 'right', people: 1, tone: Y.tone, cornice: 'step' }));
  office.door = { tx: lx0 + 5, ty: y + 5 };
  office.business = 'usedlot';
  const slots = [];
  for (const sx of [lx0 + 9.5, lx0 + 12.5]) slots.push({ x: Math.round(sx * TILE), y: Math.round((y + 3.6) * TILE), a: Math.PI / 2 });
  for (const sx of [lx0 + 2.5, lx0 + 5.5, lx0 + 8.5, lx0 + 11.5]) slots.push({ x: Math.round(sx * TILE), y: Math.round((y + 8.6) * TILE), a: Math.PI / 2 });
  const lot = [];
  for (const sx of [lx0 + 2.5, lx0 + 5.5, lx0 + 8.5, lx0 + 11.5]) lot.push({ x: Math.round(sx * TILE), y: Math.round((y + 13) * TILE), a: Math.PI / 2 });
  K.prop('chainfence', lx1 + 1, y, 0, { tx: 0, ty: Math.round((YH - 1) * TILE) });
  K.prop('chainfence', lx0, north ? y1 + 0.9 : y, 0, { tx: Math.round((YW - 0.4) * TILE), ty: 0 });
  K.prop('festoon', lx0 + 0.3, y1 + 0.6, 0, { tx: Math.round(14 * TILE), ty: 0, h: 40 });
  K.prop('textsign', lx0 + 2, y1 + 0.3, 0, { text: A.key === 'country' ? 'FARM TRUCKS' : A.key === 'desert' ? 'USED & SALVAGE' : 'USED CARS', bg: Y.sign[0], fg: Y.sign[1], z: 30, sx: 1, lit: true });
  const acx = (ax0 + ax1 + 1) / 2, aspots = [y + 3, y + 7, y + 11].map((sy) => ({ x: Math.round(acx * TILE), y: Math.round(sy * TILE), a: Math.PI / 2 }));
  K.prop('dump_g', acx, y + 0.8, 14);
  K.prop(Y.dress[0], ax0 + 0.4, y + 5, 0);
  K.prop(Y.dress[1], ax1 + 0.6, y + 9, 0);
  K.prop('lamp', ax1 + 0.7, y + 1.5, 0);
  const lp = K.poi({ kind: 'usedlot', label: Y.lot, x: Math.round((office.door.tx + 0.5) * TILE), y: Math.round((y + 5.7) * TILE), b: office.id, lot, stn: A.poi, stock: Y.stock });
  (m.dealerLots ||= []).push({ poi: lp.id, slots, used: 1, stock: Y.stock });
  (m.stealAlleys ||= []).push({ name: Y.alley, x: Math.round(acx * TILE), y: Math.round((y + YH / 2) * TILE), spots: aspots, stn: A.poi });
  return { key: A.key, lot: lp.id, at: [x, y], north, office: office.id };
}
