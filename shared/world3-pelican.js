// World v3, handcrafted: Pelican Point (district 14, Pelican Key's beach), the lobe south of 19th Street at the key's
// west end, from the owner's concept WC060 (a sandy point at one crossroads: a thatched tiki bar, a crab-sign seafood
// shack, a surf and jet-ski rental, parasols and loungers, a volleyball court, a lifeguard chair, a marina with jet skis
// and a cabin cruiser) and the research's D10 / BE3 (the beach town's beach, its props):
//   - the beach round the point, from the sand to a strip of lawn under palms;
//   - The Crab Shack (seafood, its crab on the roof) and Pelican Point Tiki on the sand facing the water, their decks;
//   - Pelican Jet Ski Rentals: the hut, its board rack, the rental dock beside it (shared/map.js m.handRentals);
//   - the marina's finger pier off the point: a cabin cruiser and the jet skis tied up;
//   - Pelican Point Volleyball, the lifeguard chair, parasols and loungers, a car park off 19th Street.
// The beach bar and the charter dock on the north side of 19th Street stay the generator's. Every building faces
// south (the camera, and the water). Names and signs are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';

const D = 14;   // Pelican Key (shared/mapcore.js DISTRICTS)
export const PX = { west: 3440, east: 3600, breaker: 3480 };
export const PY = { nineteenth: 3360, sea: 3420 };

export const PELICAN = {
  key: 'pelican', d: D, rect: [PX.west, PY.nineteenth, PX.east, PY.sea],
  streets: () => [],
  specials: [],
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const W = m.w;
  const tile = (x, y) => m.tiles[y * W + x];
  const isW = (x, y) => { const t = tile(x, y); return t === T.WATER || t === T.DEEP; };
  const place = (name, x0, y0, x1, y1) => (out.places ||= []).push({ name, x0, y0, x1, y1 });
  const busy = [];
  const isBusy = (x, y) => busy.some((r) => x >= r[0] - 1 && y >= r[1] - 1 && x < r[2] + 1 && y < r[3] + 1);
  // the first free row south of 19th Street, and the shore under each column (the first water south of it)
  let y0 = PY.nineteenth; while (y0 < PY.nineteenth + 12 && !K.free(3540, y0)) y0++;
  if (!K.free(3540, y0)) return out;
  const shore = (x) => { let y = y0; while (y < PY.sea && !isW(x, y)) y++; return y; };
  // ---- the car park off 19th Street (the point's east side), a strip of lawn and palms behind the beach
  const cx0 = 3556, cx1 = 3592, cy1 = y0 + 9;
  K.fill(cx0, y0, cx1 - cx0, cy1 - y0, T.LOT);
  for (let qx = cx0 + 1; qx + 3 <= cx1 - 1; qx += 3) { m.stalls.push({ x: qx * TILE, y: (y0 + 1) * TILE, w: 3 * TILE, h: 5 * TILE }); if (rnd(qx, y0, 1) < 0.5) m.parking.push({ x: (qx + 1.5) * TILE, y: (y0 + 3.5) * TILE, a: -Math.PI / 2 }); }
  prop('textsign', cx0 + 3, cy1 - 0.4, 0, { text: 'BEACH PARKING', bg: '#2a5a8a', fg: [250, 240, 200], z: 30, sx: 1 });
  busy.push([cx0, y0, cx1, cy1]);
  // ---- The Crab Shack and Pelican Point Tiki, on the sand facing the water (decks round them)
  const shack = (x, name, o) => {
    const y = y0 + 3, w = o.w, h = 6;
    if (!K.allFree(x, y, w, h)) return null;
    const b = K.building({ x, y, w, h, ...o.lot, name, poi: o.poi, whole: true });
    if (!b) return null;
    out.shops++;
    K.fill(x - 2, y0, w + 4, h + 7, T.DOCK);
    busy.push([x - 2, y0, x + w + 2, y + h + 4]);
    for (let k = 0; k < Math.floor(w / 3); k++) { prop('cafetable', x + 1.5 + k * 3, y + h + 1.8, 6); prop(pick(['umbrella_r', 'umbrella_y', 'umbrella_g', 'umbrella_b'], rnd(x, k, 2)), x + 1.5 + k * 3, y + h + 1.7, 0); }
    for (const dx of [-1.4, w + 1.4]) prop('torch', x + dx, y + h - 0.6, 6);
    return b;
  };
  shack(3484, 'The Crab Shack', { w: 11, poi: { kind: 'coffee', label: 'The Crab Shack', food: true },
    lot: { arch: 'mixed', key: 'diner', art: { spec: { floors: 1, style: 'siding', wallColor: '#e8dcc0', win: 'even', pitch: 'gable', roof: 'metal', roofColor: '#4a7a8a', slope: 0.45, parapet: 2, grime: 0.12, blades: [], plaques: [] },
      shop: { kind: 'diner', door: 'left', open: true, people: 3, sign: { text: 'THE CRAB SHACK', bg: '#c8302a', fg: [255, 240, 210], lit: true }, awning: ['#c8302a', '#f0ece4'] }, neon: { name: 'CRAB SHACK', kind: 'bar', col: 0 } } } });
  shack(3501, 'Pelican Point Tiki', { w: 9, poi: { kind: 'club', label: 'Pelican Point Tiki' }, lot: { arch: 'beachbar', key: 'beachbar' } });
  // ---- Pelican Jet Ski Rentals: the hut by the car park, its boards, the rental dock beside it
  const jx = 3540, jy = y0 + 11;
  if (K.allFree(jx, jy, 8, 5)) {
    const b = K.building({ x: jx, y: jy, w: 8, h: 5, arch: 'mixed', name: 'Pelican Jet Ski Rentals', poi: { kind: 'delivery', label: 'Pelican Jet Ski Rentals' }, whole: true,
      art: { spec: { floors: 1, style: 'siding', wallColor: '#f2e2a8', win: 'even', pitch: 'gable', roof: 'metal', roofColor: '#2a7a9a', slope: 0.4, parapet: 2, grime: 0.08, blades: [], plaques: [] },
        shop: { kind: 'mart', door: 'right', open: true, people: 1, sign: { text: 'JET SKI RENTALS', bg: '#2a7a9a', fg: [255, 250, 230], lit: true }, awning: ['#e8b030', '#2a7a9a'] } } });
    if (b) { out.shops++; for (let k = 0; k < 4; k++) prop('surfboard', jx + 8.8 + k * 1.1, jy + 2.5, 0, { v: k % 3 }); busy.push([jx, jy, jx + 13, jy + 5]); }
    (m.handRentals ||= []).push({ x: (jx + 4) * TILE, y: (shore(jx + 4) - 1) * TILE, name: 'Pelican Jet Ski Rentals' });
  }
  // ---- the beach: sand from the decks and the lawn down to the water; a strip of lawn under palms along 19th Street
  for (let x = PX.west; x < PX.east; x++) {
    const s = shore(x);
    for (let y = y0; y < s; y++) if (K.free(x, y)) { if (y < y0 + 3 && x >= 3482 && x < cx0) { m.set(x, y, T.GRASS); K.take(x, y, 1, 1); } else { m.set(x, y, T.SAND); K.take(x, y, 1, 1); } }
  }
  for (let x = 3484; x < cx0 - 1; x += 5) if (!isBusy(x, y0 + 1)) prop('palm_a', x + 0.5, y0 + 1.2, 10, { sp: pick(['coconut', 'royal', 'leaning'], rnd(x, y0, 3)), k: 1.25 });
  // ---- the marina's finger pier off the point's west shore: the cabin cruiser, jet skis tied up
  const px = 3472, ps = shore(px);
  if (ps < PY.sea - 14) {
    for (let y = ps; y < ps + 14; y++) for (const x of [px, px + 1]) if (isW(x, y)) m.set(x, y, T.DOCK);
    for (let y = ps - 2; y < ps; y++) for (const x of [px, px + 1]) if (tile(x, y) === T.SAND) m.set(x, y, T.DOCK);
    prop('yacht', px - 3.2, ps + 8, 26, { a: Math.PI / 2 });
    for (const dy of [4, 10]) m.marina.push({ x: Math.round((px + 3.6) * TILE), y: Math.round((ps + dy) * TILE), a: Math.PI / 2, kind: 'jetski' });
    for (let y = ps + 2; y < ps + 14; y += 5) prop('bollard', px + 2.2, y, 5);
    prop('lamp', px + 0.5, ps + 13.5, 5, { style: 'iron', lift: 4 });
    place('Pelican Point Marina', px - 6, ps - 2, px + 6, ps + 14);
  }
  // ---- the volleyball court on the sand, the lifeguard chair, parasols and loungers
  const vx = 3514, vy = y0 + 14;
  let vok = true;
  for (let y = vy - 1; y < vy + 9 && vok; y++) for (let x = vx - 1; x < vx + 17; x++) if (tile(x, y) !== T.SAND || isBusy(x, y)) { vok = false; break; }
  if (vok) {
    const rect = { x: vx * TILE, y: vy * TILE, w: 16 * TILE, h: 8 * TILE }, netX = rect.x + rect.w / 2;
    m.addSolidProp(netX, rect.y - 6, 5); m.addSolidProp(netX, rect.y + rect.h + 6, 5);
    m.venues.push({ id: m.venues.length, kind: 'volley', name: 'Pelican Point Volleyball', rect, netX });
    busy.push([vx - 1, vy - 1, vx + 17, vy + 9]);
  }
  const lx = 3536, ls = shore(lx);
  if (ls < PY.sea) { prop('lguard', lx, ls - 4, 16, { a: 0 }); busy.push([lx - 2, ls - 6, lx + 2, ls - 2]); }
  for (let x = PX.west; x < PX.east; x++) {
    const s = shore(x);
    if (s >= PY.sea) continue;
    const put = (t, px2, py2, extra) => { const tx = Math.floor(px2), ty = Math.floor(py2); if (!isBusy(tx, ty) && tile(tx, ty) === T.SAND) prop(t, px2, py2, 0, extra); };
    if (x % 6 === 2) { put('lounger', x + 0.5, s - 4.5, { v: x % 4, a: Math.PI / 2 }); put(pick(['umbrella_r', 'umbrella_y', 'umbrella_b', 'umbrella_g'], rnd(x, s, 4)), x + 1.4, s - 4.8); }
    if (x % 9 === 5) { put('towel', x + 0.5, s - 8, { v: x % 5 }); put(pick(['umbrella_y', 'umbrella_r'], rnd(x, s, 5)), x + 1.5, s - 8.4); }
    if (x % 17 === 8) put('surfboard', x + 0.5, s - 2.4, { v: x % 3 });
  }
  // (the beach and the decks kept: the old key's shore pass would put its grass back - shared/map.js shoreSand)
  for (let y = PY.nineteenth; y < PY.sea; y++) for (let x = PX.west; x < PX.east; x++) { const i = y * W + x, t = m.tiles[i]; if (m.land[i] && (t === T.SAND || t === T.DOCK || t === T.GRASS)) m.reserve[i] |= 16; }
  (m.landmarks ||= []).push({ name: 'Pelican Point', type: 'beach', x: PX.west * TILE, y: y0 * TILE, w: (PX.east - PX.west) * TILE, h: (PY.sea - y0) * TILE });
  place('Pelican Point', PX.west, y0, PX.east, PY.sea);
  void api;
  return out;
}
