// World v3, handcrafted: the Stadium District (district 25) across the channel from The Yards, from the owner's concept
// WC405 (Stadium-A1): the open-bowl stadium in its ring road of tailgate lots, the retention ponds with their footbridge,
// the mall with its glass vault and its car parks, the brick row of sports bars along the fan walk hung with banners, the
// dealership, the outfitters, the burger place and the gas station by the bridge. The grid's blocks of walk-ups give
// way to:
//   - Waves Stadium (the Westport Waves' - an invented club, an invented crest): four stands round the pitch (their
//     seats seen from above stepping down to it - client/art2/buildings.js roofMat 'seats' - the crowd in them), the
//     south stand's outside wall with the club's banners and the gates, floodlight masts at the corners, the concourse
//     round it with the food stands; the pitch is a soccer venue (server/systems/minigames.js);
//   - Stadium Way round it, Gameday Drive in from Stadium Avenue, Willow Road down under the Gulf Loop, Turnstile Lane
//     to Fan Street and Dealer Row;
//   - the tailgate lots: Lot A under the Gulf Loop, the RV lot by the water, the lot behind the bars - painted bays,
//     cars, tents and canopies, grills and coolers;
//   - the retention ponds west of the stadium, a footbridge between them, reeds, willows;
//   - north of the Gulf Loop: Westport Galleria (the glass vault in the middle) and the Stadium Megastore, their car park;
//   - the fan walk along Fan Street and 15th Street: The Turnstile Bar and the sports bars facing it, banner lamps, food
//     carts; the dealership (Westport Motors), Trail & Field Outfitters, Touchdown Burger and Gas 'n Go on Dealer Row.
// The Westport Stadium park (the keep south of 15th Street: its pitch and the Stadium Lido) stays the generator's.
// Deterministic like every plan (shared/world3-hand.js): tiles, fixed vertices and hash draws only.
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';
import { arenaOf, arenaTile, bankRamps } from './carsoccer.js';

const D = 25;   // the Stadium District's id (shared/mapcore.js DISTRICTS)
// the stadium (tiles): its outer box, the stands' depth, the pitch inside them
export const BOWL = { x0: 3741, y0: 1588, x1: 3859, y1: 1672, deep: 14 };
const RING = [[3736, 1576], [3864, 1576], [3874, 1586], [3874, 1630], [3874, 1676], [3864, 1686], [3800, 1686], [3736, 1686], [3726, 1676], [3726, 1630], [3726, 1586], [3736, 1576]];

function streets() {
  const out = [];
  const add = (name, kind, pts, o = {}) => out.push({ name, kind, pts, ...o });
  add('Stadium Way', 'ave', RING);
  add('Gameday Drive', 'st', [[3681, 1630], [3726, 1630]]);
  add('Willow Road', 'st', [[3722, 1500], [3722, 1540], [3726, 1586]]);
  add('Galleria Drive', 'st', [[3681, 1480], [3722, 1480], [3800, 1480], [3895, 1480]], { culdesac: true });
  add('Turnstile Lane', 'st', [[3864, 1686], [3864, 1751], [3864, 1806]]);
  add('Fan Street', 'st', [[3801, 1751], [3864, 1751]]);
  add('Dealer Row', 'st', [[3801, 1806], [3864, 1806]]);
  return out;
}

export const STADIUM = {
  key: 'stadium', d: D, rect: [3680, 1440, 3940, 1900],
  few: 25,   // (a district of big set pieces - the stadium, the mall, the lots, the ponds: about thirty buildings, not fifty - test/world3world.test.js)
  // (round the Westport Stadium park, the keep: the generator lays it out - its pitch, the Stadium Lido)
  rects: [[3680, 1440, 3940, 1750], [3800, 1750, 3940, 1900], [3680, 1860, 3800, 1900]],
  streets,
  // the special businesses this plan places itself (shared/map.js SPECIALS of the Stadium District)
  specials: ['Stadium Megastore', 'The Turnstile Bar', 'Westport Motors', 'Trail & Field Outfitters'],
  build,
};

// ---------------------------------------------------------------------------------------------------------------
const RED = '#b02a2e', NAVY = '#1e2a4a', CREAM = [240, 232, 210];
const BRICK = ['#8a4434', '#7a3a30', '#9a5040', '#6e3a2e'];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const { place: place0 } = towerKit(K, out);
  // a lot placed whole: moved back off a pavement it overlaps (up for one facing south, down for one facing north), or
  // given up a tile or two at its sides or its back (or null)
  const place = (o) => {
    const dir = o.face === 'N' ? 1 : -1;
    for (const [sh, cut] of [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [2, 2], [4, 4], [6, 6]]) for (const [l, r] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 2], [3, 3], [4, 4]]) {
      const x = o.x + l, w = o.w - l - r, h = o.h - cut, y = o.y + dir * sh + (dir < 0 ? cut : 0);   // (shifted, then cut)
      if (w < 4 || h < 3 || !K.allFree(x, y, w, h)) continue;
      return place0({ ...o, x, y, w, h, ...(typeof o.door === 'number' ? { door: Math.min(x + w - 1, Math.max(x, o.door)) } : {}) });
    }
    return null;
  };
  const tile = (x, y) => (m.inside(x, y) ? m.tiles[m.idx(x, y)] : -1);
  const lot = (x, y) => tile(x, y) === T.LOT && m.bld[m.idx(x, y)] < 0;
  const ctx = { place, tile, lot, out };
  stadium(K, m, ctx);
  north(K, m, ctx);
  ponds(K, m, ctx);
  arena(K, m, ctx);   // (before the RV lot's ground: the arena takes the middle of it)
  tailgates(K, m, ctx);
  fanWalk(K, m, ctx);
  dealerRow(K, m, ctx);
  // the south strip along Harbor Avenue: a row of small shops and the fans' cheap rooms
  const SOUTH = [['Waves Fan Shop', 'clothes', { kind: 'clothing', label: 'Waves Fan Shop' }], ['Halftime Donuts', 'cafe', { kind: 'coffee', label: 'Halftime Donuts', food: true }], ['Stadium Inn', null, { kind: 'delivery', label: 'Stadium Inn' }], ['Corner Kick Laundry', 'laundry', null], ['Bleachers Liquor', 'liquor', { kind: 'convenience', label: 'Bleachers Liquor' }]];
  let si = 0;
  K.row(3687, 3778, 1866, 1895, (x, room) => {
    if (room < 8) return room >= 1 ? { gap: room, kind: 'passage' } : null;
    const S = SOUTH[si++], w = Math.min(room, 12 + Math.floor(rnd(x, 1895, 31) * 6));
    if (!S) return { w, depth: 14, arch: 'walkup', key: 'apt2', home: { kind: 'apartment' }, whole: true, art: { spec: { floors: 3, style: 'brick', brickTone: pick(BRICK, rnd(x, 1895, 32)), grime: 0.2 }, noShop: true } };
    return { w, depth: 16, arch: S[1] === 'liquor' ? 'liquor' : 'mixed', key: S[1] === 'liquor' ? 'liquor' : 'apt2', name: S[0], poi: S[2] || { kind: 'delivery', label: S[0], walk: true, store: S[1] }, home: { kind: 'apartment' }, whole: true,
      art: { spec: { floors: 2 + (S[1] ? 0 : 1), style: 'brick', brickTone: pick(BRICK, rnd(x, 1895, 33)), grime: 0.2 }, ...(S[1] && S[1] !== 'liquor' ? { shop: { kind: S[1], door: 'left', open: true, people: 2, awning: [RED, '#f0ece4'], sign: { text: S[0].toUpperCase().slice(0, 18), bg: NAVY, fg: CREAM, lit: true } } } : {}) } };
  }, { rough: false });
  // what's left: paved, a tree here and there; the grass by the water kept, its willows and palms
  K.landscape({ bare: 0.55, tree: (x, y, r) => r < 0.7 ? ['tree_b', pick(['street', 'oak', 'maple'], rnd(x, y, 831)), 1] : r < 0.85 ? ['palm_a', 'royal', 1.1] : ['shrub_a', null, 1] });
  void api; void prop;
  return out;
}

// the ground of a yard or a lot: every free tile in the box made `t` and taken
function ground(K, x0, y0, x1, y1, t = T.LOT) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, t);
  K.take(x0, y0, x1 - x0, y1 - y0);
}
// painted bays in rows across a lot (east-west rows of north-south bays, a lane between each pair), some with a car in
function bays(K, m, x0, y0, x1, y1, o = {}) {
  const { rnd, pick } = K;
  const lot = (x, y) => m.inside(x, y) && m.tiles[m.idx(x, y)] === T.LOT && m.bld[m.idx(x, y)] < 0;
  let n = 0;
  for (let y = y0 + 1; y + 5 <= y1; y += 13) for (const row of [y, y + 5]) for (let x = x0 + 1; x + 2 <= x1; x += 2.5) {
    const tx = Math.floor(x);
    if (!lot(tx, row) || !lot(tx + 1, row + 3)) continue;
    m.stalls.push({ x: x * TILE, y: row * TILE, w: 2 * TILE, h: 4 * TILE });
    if (rnd(tx, row, 41) < (o.full ?? 0.45)) { m.parking.push({ x: (x + 1) * TILE, y: (row + 2) * TILE, a: row === y ? Math.PI / 2 : -Math.PI / 2, model: pick(o.models || ['sedan', 'compact', 'pickup', 'sedan', 'van', 'sports'], rnd(row, tx, 42)) }); n++; }
  }
  return n;
}

// ---------------------------------------------------------------------------------------------------------------
// Waves Stadium (WC405): the four stands round the pitch, their seats stepping down to it with the crowd in them; the
// south stand's outside wall (the camera's side) with the club's banners and its gates; the north stand's seating seen
// from the pitch; the corners left open as the ways in (the turnstiles); the floodlight masts; the concourse round it
// with the food stands; the pitch the soccer venue
function stadium(K, m, ctx) {
  const { prop, rnd } = K;
  const { place, out } = ctx;
  const B = BOWL, dp = B.deep, px0 = B.x0 + dp, px1 = B.x1 - dp, py0 = B.y0 + dp, py1 = B.y1 - dp;   // the pitch [px0, px1) x [py0, py1)
  const stand = (x, y, w, h, to, o = {}) => place({ x, y, w, h, arch: o.arch || 'civicblock', key: o.key || 'grandstand', name: 'Waves Stadium', poi: o.poi ?? false, whole: true, ...(o.face ? { face: o.face } : {}),
    art: { spec: { floors: 1, groundH: 112, style: 'concrete', wallColor: '#c8c4bc', roofMat: 'seats', seatTo: to, crowd: 0.55 + rnd(x, y, 51) * 0.2, lip: 3, rimW: 3, parapet: 4, grime: 0.08, windows: [], ...(o.spec || {}) }, noShop: true, kit: [] } });
  // the north stand (its seating faces the camera across the pitch), the side stands, the south stand's outside wall
  const N = stand(px0, B.y0, px1 - px0, dp, 'S', { arch: 'grandstand' });
  stand(B.x0, py0, dp, py1 - py0, 'E');
  stand(px1, py0, dp, py1 - py0, 'W');
  const Wd = (px1 - px0) * TILE;
  const blades = [], plaques = [{ text: 'WAVES STADIUM', x: Math.round(Wd / 2 - 110), v: 74, sx: 3, bg: NAVY, fg: CREAM, lit: true }];
  for (let k = 0; k < 8; k++) if (k !== 3 && k !== 4) blades.push({ text: k % 2 ? 'WAVES' : 'GO', x: Math.round(Wd * (k + 0.5) / 8) - 10, v: 30, paint: true, bg: RED, fg: CREAM });
  const doors = []; for (let k = 0; k < 4; k++) doors.push({ x: Math.round(Wd * (0.2 + k * 0.2)) - 24, w: 48, kind: 'roller', open: true, h: 56 });
  const S = stand(px0, py1, px1 - px0, dp, 'N', { poi: { kind: 'delivery', label: 'Waves Stadium' }, spec: { blades, plaques, doors } });
  // the NE and NW corners closed, the south ones the ways in
  stand(B.x0, B.y0, dp, dp, 'S'); stand(px1, B.y0, dp, dp, 'S');
  for (const gx of [B.x0, px1]) {
    ground(K, gx, py1, gx + dp, B.y1, T.PLAZA);
    for (let k = 0; k < 3; k++) prop('post', gx + 3 + k * 4, py1 + 1, 4, { h: 36 });   // (the turnstiles' posts)
    prop('textsign', gx + dp / 2, B.y1 - 0.6, 0, { text: 'GATE ' + (gx === B.x0 ? 'A' : 'B'), bg: RED, fg: CREAM, z: 40, sx: 1, lit: true });
  }
  // the pitch: grass, the soccer venue's rect (minigames.js plays matches on it; groundbake.js paints its lines)
  ground(K, px0, py0, px1, py1, T.GRASS);
  const r = { x: (px0 + 2) * TILE, y: (py0 + 2) * TILE, w: (px1 - px0 - 4) * TILE, h: (py1 - py0 - 4) * TILE };
  m.venues.push({ id: m.venues.length, kind: 'soccer', name: 'Waves Stadium Pitch', rect: r, goalW: 6 * TILE });
  // the floodlight masts at the corners, the concourse round the bowl (paved), its food stands and bins
  for (const [x, y] of [[B.x0 - 3, B.y0 - 3], [B.x1 + 3, B.y0 - 3], [B.x0 - 3, B.y1 + 3], [B.x1 + 3, B.y1 + 3]]) prop('ymast', x, y, 6, { tall: 180 });
  ground(K, B.x0 - 9, B.y0 - 6, B.x1 + 9, B.y1 + 8, T.PLAZA);
  for (let k = 0; k < 6; k++) { const x = B.x0 + 10 + k * 18; prop(k % 2 ? 'foodcart' : 'stall', x, B.y1 + 4, 10, { v: k % 3 }); prop('trashcan', x + 3, B.y1 + 4.4, 0); }
  for (let k = 0; k < 4; k++) prop('foodcart', B.x0 + 20 + k * 26, B.y0 - 3, 10);
  (m.landmarks ||= []).push({ name: 'Waves Stadium', type: 'stadium', x: B.x0 * TILE, y: B.y0 * TILE, w: (B.x1 - B.x0) * TILE, h: (B.y1 - B.y0) * TILE });
  (out.places ||= []).push({ name: 'Waves Stadium', x0: B.x0, y0: B.y0, x1: B.x1, y1: B.y1, stands: [N, S].filter(Boolean).length });
}

// North of the Gulf Loop (WC405's mall): Westport Galleria along Galleria Drive - two long wings and the glass vault
// between them over its doors - the Stadium Megastore by Willow Road, their car park across the drive; under the Gulf
// Loop's deck, more of it
function north(K, m, ctx) {
  const { prop } = K;
  const { place, out } = ctx;
  const y0 = 1446, h = 28;
  place({ x: 3688, y: y0, w: 28, h, arch: 'strip', key: 'strip', name: 'Stadium Megastore', poi: { kind: 'delivery', label: 'Stadium Megastore' }, whole: true,
    art: { spec: { floors: 2, style: 'concrete', wallColor: '#d8d4cc', parapet: 8 }, shop: { kind: 'mart', door: 'left', open: true, people: 4, awning: null, sign: { text: 'STADIUM MEGASTORE', bg: RED, fg: CREAM, lit: true } } } });
  const wing = (x, w, nm) => place({ x, y: y0, w, h, arch: 'strip', key: 'strip', name: nm, poi: { kind: 'delivery', label: nm }, whole: true,
    art: { spec: { floors: 2, style: 'stucco', wallColor: '#e2dccf', parapet: 10, roofMat: 'membrane' }, shop: { kind: 'clothes', door: 'right', open: true, people: 3, awning: null, sign: { text: nm.toUpperCase().slice(0, 18), bg: '#2a4a6a', fg: CREAM, lit: true } } } });
  wing(3730, 68, 'Westport Galleria West');
  place({ x: 3799, y: y0 - 2, w: 24, h: h + 2, arch: 'glass', key: 'tower2', name: 'Westport Galleria', poi: { kind: 'delivery', label: 'Westport Galleria' }, whole: true,
    art: { spec: { floors: 3, style: 'glass', wallColor: '#8ab0c4', win: 'tall', parapet: 6, roofMat: 'membrane' }, kit: [['sky', 80, 120], ['sky', 160, 120], ['sky', 80, 300], ['sky', 160, 300], ['sky', 80, 480], ['sky', 160, 480], ['sky', 80, 660], ['sky', 160, 660]] } });
  wing(3824, 34, 'Westport Galleria East');
  prop('textsign', 3811, 1476.2, 0, { text: 'WESTPORT GALLERIA', bg: '#2a4a6a', fg: CREAM, z: 60, sx: 2, lit: true });
  // the car park south of the drive and under the deck
  ground(K, 3686, 1485, 3916, 1534);
  bays(K, m, 3688, 1486, 3914, 1516, { full: 0.55 });
  for (let x = 3700; x < 3910; x += 16) prop('lamp', x, 1499, 0);
  (out.places ||= []).push({ name: 'Westport Galleria', x0: 3730, y0: y0, x1: 3888, y1: y0 + h });
}

// The retention ponds west of the stadium (WC405), between Stadium Avenue and Stadium Way: two ponds, a footbridge
// across the neck between them, reeds and cattails, willows, a path round, benches
function ponds(K, m, ctx) {
  const { prop, rnd } = K;
  const { out } = ctx;
  const LOBES = [[3703, 1608, 12, 14], [3704, 1652, 13, 15]];
  const inPond = (x, y) => LOBES.some(([cx, cy, rx, ry]) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy < 1 + 0.08 * Math.sin(Math.atan2(dy, dx) * 3 + cx); });
  let n = 0;
  for (let y = 1590; y < 1672; y++) for (let x = 3688; x < 3720; x++) {
    if (!K.free(x, y)) continue;
    if (inPond(x, y)) { const deep = LOBES.some(([cx, cy, rx, ry]) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 < 0.4); m.set(x, y, deep ? T.DEEP : T.WATER); K.take(x, y, 1, 1); n++; }
  }
  // the grass round them, the footbridge over the neck, the plants at the edges
  ground(K, 3687, 1588, 3721, 1690, T.GRASS);
  prop('fbridge', 3703.5, 1652.5, 0, { len: 26 * TILE, a: 0 });   // (across the south pond's middle)
  for (const [x, y] of [[3692, 1600], [3716, 1616], [3690, 1648], [3717, 1660], [3694, 1676], [3712, 1594]]) prop('tree_b', x, y, 12, { sp: 'willow', k: 1.15 });
  for (let k = 0; k < 18; k++) {
    const L = LOBES[k % 2], a = rnd(k, 1, 61) * 6.283, x = L[0] + Math.cos(a) * (L[2] + 0.6), y = L[1] + Math.sin(a) * (L[3] + 0.6);
    prop('flowers_a', x, y, 0, { sp: k % 3 ? 'reeds' : 'cattails', k: 1 });
  }
  for (const [x, y] of [[3690, 1631], [3718, 1631]]) prop('bench_m', x, y, 0);
  (out.places ||= []).push({ name: 'Stadium Ponds', x0: 3687, y0: 1588, x1: 3721, y1: 1690, water: n });
}

// The tailgate lots (WC405's ring of them): Lot A between the Gulf Loop and Stadium Way, the RV lot by the water east of
// it, the lot behind the bars - painted bays and cars, the tents and canopies, grills, coolers and chairs among them
function tailgates(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { lot, out } = ctx;
  ground(K, 3686, 1535, 3916, 1570);
  bays(K, m, 3688, 1536, 3914, 1569, { full: 0.6 });
  ground(K, 3880, 1570, 3922, 1748);
  // the RVs (the coaches stand in for them) end to end along the water
  for (let y = 1590; y < 1740; y += 12) if (lot(3900, y) && lot(3900, y + 8)) m.parking.push({ x: 3900 * TILE, y: (y + 4) * TILE, a: Math.PI / 2, model: 'bus' });
  bays(K, m, 3881, 1572, 3896, 1746, { full: 0.5 });
  ground(K, 3722, 1693, 3862, 1711);
  bays(K, m, 3724, 1694, 3860, 1710, { full: 0.65 });
  // the tailgates: a tent or a canopy by a car, a grill, coolers and chairs
  let n = 0;
  for (const [x0, y0, x1, y1] of [[3690, 1536, 3912, 1569], [3881, 1572, 3920, 1746], [3724, 1694, 3860, 1710]]) for (let y = y0 + 3; y < y1 - 1; y += 6.5) for (let x = x0 + 4; x < x1 - 3; x += 11) {
    const tx = Math.floor(x + rnd(x, y, 71) * 4), ty = Math.floor(y);
    if (rnd(tx, ty, 72) > 0.45 || !lot(tx, ty)) continue;
    if (m.parking.some((p) => Math.abs(p.x / TILE - tx) < 2.5 && Math.abs(p.y / TILE - ty) < 3)) continue;
    prop('tent', tx + 0.5, ty + 0.5, 10, { v: Math.floor(rnd(ty, tx, 73) * 3) });
    prop(pick(['cooler', 'chair', 'chair', 'cooler'], rnd(tx, ty, 74)), tx + 2, ty + 1.4, 0, { v: Math.floor(rnd(tx, ty, 75) * 3) });
    n++;
  }
  for (let x = 3700; x < 3910; x += 18) { prop('lamp', x, 1552, 0); }
  (out.places ||= []).push({ name: 'Lot A', x0: 3686, y0: 1535, x1: 3916, y1: 1570, tailgates: n }, { name: 'The RV Lot', x0: 3880, y0: 1570, x1: 3922, y1: 1748 });
}

// The Waves Arena (the owner, 10-16: "Rocket League-style car soccer arena (boosts, banked walls, a giant ball)"): car
// soccer by the water, east of Stadium Way in the middle of the RV lot - the pitch walled in, its banks, the goals'
// boxes in the end walls (shared/carsoccer.js arenaOf, arenaTile: the server plays the matches, server/systems/
// carsoccer.js; the bake lays the turf, the lines and the banks, client/art2/game/groundbake.js), the stand along its
// north side with the crowd, the floodlight masts, the gate on Stadium Way where you join
function arena(K, m, ctx) {
  const { prop } = K;
  const { place, out } = ctx;
  let box = null;
  for (const [tw, th] of [[54, 36], [54, 34], [52, 34], [50, 32], [48, 32]]) {   // (against Stadium Way's pavement, as far north as it fits)
    for (let y = 1588; y <= 1644 && !box; y++) for (let x = 3880; x <= 3884 && !box; x++) if (K.allFree(x, y, tw, th)) box = [x, y, tw, th];
    if (box) break;
  }
  if (!box) return;
  const [tx, ty, tw, th] = box, a = arenaOf(tx, ty, tw, th, 'Waves Arena');
  for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) m.set(x, y, arenaTile(a, x, y));
  K.take(tx, ty, tw, th);
  (m.arenas ||= []).push(a);
  (m.jumps ||= []).push(...bankRamps(a));
  // the wall's face round the pitch (the end walls either side of the goals' mouths), the masts at its corners
  const X0 = a.ix0 / TILE, X1 = a.ix1 / TILE, Y0 = a.iy0 / TILE, Y1 = a.iy1 / TILE, M0 = a.my0 / TILE, M1 = a.my1 / TILE;
  prop('fenceline', X0, Y0 - 0.1, 0, { kind: 'wall', tx: (X1 - X0) * TILE, ty: 0 });
  prop('fenceline', X0, Y1 + 0.1, 0, { kind: 'wall', tx: (X1 - X0) * TILE, ty: 0 });
  for (const x of [X0 - 0.1, X1 + 0.1]) { prop('fenceline', x, Y0, 0, { kind: 'wall', tx: 0, ty: (M0 - Y0) * TILE }); prop('fenceline', x, M1, 0, { kind: 'wall', tx: 0, ty: (Y1 - M1) * TILE }); }
  for (const [x, y] of [[tx + 1, ty + 0.6], [tx + tw - 1, ty + 0.6], [tx + 1, ty + th - 0.6], [tx + tw - 1, ty + th - 0.6]]) prop('ymast', x, y, 6, { tall: 160 });
  // the stand along the north side: its seats stepping down to the pitch, the crowd
  if (K.allFree(tx + 6, ty - 8, tw - 12, 8)) place({ x: tx + 6, y: ty - 8, w: tw - 12, h: 8, arch: 'grandstand', key: 'grandstand', name: 'Waves Arena', poi: false, whole: true,
    art: { spec: { floors: 1, groundH: 72, style: 'concrete', wallColor: '#c8c4bc', roofMat: 'seats', seatTo: 'S', crowd: 0.7, lip: 3, rimW: 3, parapet: 4, grime: 0.06, windows: [] }, noShop: true, kit: [] } });
  // the gate on Stadium Way: its signs
  prop('textsign', tx - 0.4, a.cy / TILE - 3, 0, { text: 'WAVES ARENA', bg: NAVY, fg: CREAM, z: 52, sx: 2, lit: true });
  prop('textsign', tx - 0.4, a.cy / TILE + 3, 0, { text: 'CAR SOCCER', bg: '#d8701e', fg: CREAM, z: 40, sx: 1, lit: true });
  (out.places ||= []).push({ name: 'Waves Arena', x0: tx, y0: ty, x1: tx + tw, y1: ty + th, arena: 1 });
}

// The fan walk (WC405): the brick row of sports bars along 15th Street and Fan Street facing it - The Turnstile Bar
// among them - the walk in front of them paved wide, banner lamps in the club's colours, flags, food carts
function fanWalk(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { out } = ctx;
  const BARS = [
    { name: 'The Turnstile Bar', w: 16, poi: { kind: 'delivery', label: 'The Turnstile Bar' }, store: 'bar' },
    { name: 'Overtime Sports Grill', w: 18, poi: { kind: 'coffee', label: 'Overtime Sports Grill', food: true }, store: 'diner' },
    { name: 'The Penalty Box', w: 14, poi: { kind: 'delivery', label: 'The Penalty Box' }, store: 'bar' },
    { name: 'End Zone Pizza', w: 12, poi: { kind: 'coffee', label: 'End Zone Pizza', food: true }, store: 'diner' },
    { name: 'Hat Trick Tavern', w: 14, poi: { kind: 'delivery', label: 'Hat Trick Tavern' }, store: 'bar' },
    { name: 'Waves Pro Shop', w: 14, poi: { kind: 'clothing', label: 'Waves Pro Shop' }, store: 'clothes' },
    { name: 'Sideline Sports Bar', w: 16, poi: { kind: 'delivery', label: 'Sideline Sports Bar' }, store: 'bar' },
    { name: 'The Fourth Quarter', w: 14, poi: { kind: 'delivery', label: 'The Fourth Quarter' }, store: 'bar' },
  ];
  let i = 0;
  const y0 = 1712, y1 = 1729;
  K.row(3722, 3860, y0, y1, (x, room) => {
    if (room < 8) return room >= 1 ? { gap: room, kind: 'passage' } : null;
    if (x > 3790 && x < 3800) return { gap: Math.min(room, 3800 - x + 2), kind: 'passage' };   // (the way through from the stadium)
    const L = BARS[i++];
    if (!L) return { gap: Math.min(room, 8), kind: 'passage' };
    return { w: Math.min(room, L.w), depth: y1 - y0 + 1, arch: 'mixed', key: 'apt2', name: L.name, poi: L.poi, home: { kind: 'apartment' }, whole: true,
      art: { spec: { floors: 2 + Math.floor(rnd(x, y1, 81) * 2), style: 'brick', brickTone: pick(BRICK, rnd(x, y1, 82)), win: 'arch', cornice: 'bracket', grime: 0.1 },
        shop: { kind: L.store, door: 'left', open: true, people: 4, awning: [L.store === 'bar' ? '#1e2a4a' : RED, '#f0ece4'], sign: { text: L.name.toUpperCase().slice(0, 18), bg: NAVY, fg: CREAM, lit: true } } } };
  });
  // the walk: paved wide in front of the bars, banner lamps and flags in the club's colours, carts, benches
  ground(K, 3722, y1 + 1, 3862, 1746, T.PLAZA);
  for (let x = 3726; x < 3858; x += 9) prop('lamp', x, 1743, 0);
  for (let x = 3730; x < 3858; x += 18) prop('flagpole', x, 1737, 0, { h: 110, c: (x / 18) % 2 < 1 ? '#b02a2e' : '#1e2a4a' });
  for (const x of [3746, 3780, 3824]) prop('foodcart', x, 1739, 10);
  for (const x of [3760, 3812, 3840]) prop('bench_m', x, 1741, 0);
  (out.places ||= []).push({ name: 'The Fan Walk', x0: 3722, y0, x1: 3862, y1: 1746 });
}

// Dealer Row (WC405's corner of the interchange): Westport Motors' glass showroom and its lot of cars for sale, Trail &
// Field Outfitters, Touchdown Burger with its drive-thru lane, Gas 'n Go - Stadium District under its canopy
function dealerRow(K, m, ctx) {
  const { prop } = K;
  const { place, out } = ctx;
  // north of Dealer Row: the outfitters and the burger place facing it; the dealership by the water
  place({ x: 3807, y: 1770, w: 22, h: 30, arch: 'outfitter', key: 'trail', name: 'Trail & Field Outfitters', poi: { kind: 'delivery', label: 'Trail & Field Outfitters' }, whole: true });
  place({ x: 3832, y: 1784, w: 18, h: 16, arch: 'diner', key: 'diner', name: 'Touchdown Burger', poi: { kind: 'coffee', label: 'Touchdown Burger', food: true }, whole: true,
    art: { spec: { floors: 1, style: 'stucco', wallColor: '#f0e6d0' }, shop: { kind: 'diner', door: 'left', open: true, people: 3, awning: [RED, '#f8f0e0'], sign: { text: 'TOUCHDOWN BURGER', bg: RED, fg: [255, 236, 160], lit: true } } } });
  const dx = 3870, dy = 1757;
  const sh = place({ x: dx, y: dy, w: 30, h: 14, arch: 'showroom', key: 'motors', name: 'Westport Motors', poi: { kind: 'delivery', label: 'Westport Motors' }, whole: true, art: { spec: { floors: 2, style: 'glass', wallColor: '#9aa8b4', parapet: 8 } } });
  if (sh) {
    ground(K, dx, sh.ty + sh.th, dx + 32, 1800);
    for (let k = 0; k < 5; k++) m.parking.push({ x: (dx + 3 + k * 5.5) * TILE, y: (sh.ty + sh.th + 8) * TILE, a: -Math.PI / 2, model: ['sports', 'sedan', 'pickup', 'sports', 'compact'][k] });
    for (let k = 0; k < 6; k++) prop('flagpole', dx + 1 + k * 6, 1799, 0, { h: 90, c: k % 2 ? '#2a5aa8' : '#c8a020' });
    prop('textsign', dx + 15, 1800.4, 0, { text: 'WESTPORT MOTORS', bg: '#1e3a5e', fg: [250, 236, 160], z: 54, sx: 1, lit: true });
  }
  // south of Dealer Row: the gas station, its pumps under the canopy (map.js buildCornerStores keeps them: m.sitePumps)
  const gs = place({ x: 3808, y: 1830, w: 14, h: 10, arch: 'gas', key: 'gas', name: "Gas 'n Go - Stadium District", poi: { kind: 'gasstation', label: "Gas 'n Go - Stadium District" }, whole: true, face: 'N' });
  if (gs) {
    ground(K, 3806, 1812, 3846, 1830, T.LOT);
    const cx = 3826;
    prop('canopy', cx, 1820, 0, { w: 260, d: 110, h: 54 });
    for (const [ox, oy] of [[-4, -1.6], [0, -1.6], [4, -1.6], [-4, 1.6], [0, 1.6], [4, 1.6]]) { const x = (cx + ox) * TILE, y = (1820 + oy) * TILE; (m.sitePumps ||= []).push({ x, y }); m.addSolidProp(x, y, 9); }
  }
  (out.places ||= []).push({ name: 'Dealer Row', x0: 3806, y0: 1757, x1: 3920, y1: 1860 });
}
