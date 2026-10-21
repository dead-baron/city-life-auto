// Secluded camps (the nature program, 2026-10-21: the owner's "secluded spots with a campfire and log seats", task
// #396's "more scenic campfire spots to find and chill at"; the research's "a campsite clearing by the pool", N11's
// beach bonfire, NS1-F's fire ring on the beach). The wilds' rest spots (shared/naturesites.js restSpots) are found by
// rules on open ground; these are laid by hand where few go and there's something to sit and look at - each needs a
// way in:
//   - on Silver Thread Lake's biggest pine islet, a canoe pulled up on its pebbles (paddle over from the boathouse:
//     shared/world3-woodslake.js);
//   - on the island below Twin Falls, the falls in front of you (wade or paddle over: shared/world3-ledgefalls.js);
//   - in the Red Rock Desert's canyon below Slickrock Falls, on the sand across the pool from the bench, and in the
//     woods by Mossy Ledge Falls' pool (shared/world3-ledgefalls.js: the falls' `camp`).
//   - on the wild coasts' beaches, the few most out of the way (beachCamps3, below).
// Each one: its ground cleared round the fire (dirt, or the sand left as it is), a fire ring (some still burning), seats
// (logs; driftwood on a beach), a ring of stones, and a few things left as if someone had just moved on - a tent, a
// woodpile, a lantern on its post, a cooler and camp chairs. A campfire like any other (server/systems/campfires.js:
// light it, sit by it to heal) and a rest spot (m.restSpots: the fireflies come at night). The callers lay them inside
// their own steps (their props, their clearing); this file only knows how a camp looks.
// Deterministic: integer hashes and Math's functions (called inside generateCity, under withDeterministicMath).
import { TILE, T } from './constants.js';

const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// r: the cleared ground's radius (tiles); seats, stones: how many; the extras by kind
export const CAMPS3 = {
  r: 2.6, stones: 4,
  kinds: {
    island: { seats: 2, tent: true, woodpile: true, lantern: true, canoe: true },
    bar: { seats: 2, tent: true, lantern: true, cooler: true },
    beach: { seats: 3, driftwood: true, cooler: true, chairs: 2, lantern: true },
    canyon: { seats: 2, driftwood: true, tent: true, cooler: true, chairs: 1, lantern: true },   // (sun-bleached wood for seats)
    woods: { seats: 2, tent: true, woodpile: true, lantern: true },
    riders: { seats: 2, tents: 2, cooler: true, chairs: 3, lantern: true },   // (the dirt-bike riders' camp: shared/world3-dirt.js - their bikes parked by it)
  },
};

// would a camp fit with its middle on tile (tx, ty)? every tile within r + 1 of it plain open ground (grass, dirt or
// sand; nothing built, no designed place's ground but what `allow` lets through)
export function campFits(m, tx, ty, allow = 0) {
  const R = Math.ceil(CAMPS3.r + 1);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dy * dy > (CAMPS3.r + 1) * (CAMPS3.r + 1)) continue;
    const x = tx + dx, y = ty + dy;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
    const i = y * m.w + x, t = m.tiles[i];
    if (!m.land[i] || !(t === T.GRASS || t === T.DIRT || t === T.SAND) || (m.reserve[i] & ~(allow | 4 | 128)) || (m.bld && m.bld[i] >= 0)) return false;
  }
  // and nothing made by hand in the ground it clears (camp3's clear: r + 2): a designed place's own solids - a lookout
  // tower, a wall, a tree's trunk cut through - are added by hand (pi < 0), and the clearing would take them with it
  // (2026-10-21: the riders' camp took Lookout Mesa's tower)
  if (m.solidProps) {
    const C = Math.ceil(CAMPS3.r + 3);   // (a tile more: a thing's solids can stand a tile off the thing itself)
    for (let dy = -C; dy <= C; dy++) for (let dx = -C; dx <= C; dx++) {
      const x = tx + dx, y = ty + dy;
      if (dx * dx + dy * dy > (CAMPS3.r + 3) * (CAMPS3.r + 3) || x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      const arr = m.solidProps.get(y * m.w + x);
      if (arr && arr.some((e) => e.pi < 0)) return false;
    }
  }
  return true;
}

// is tile (tx, ty) out of the way? no road, bridge, sidewalk, lot or building within r tiles (a secluded camp)
export function campQuiet(m, tx, ty, r) {
  for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
    const x = tx + dx, y = ty + dy;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
    const t = m.tiles[y * m.w + x];
    if (t === T.ROAD || t === T.BRIDGE || t === T.SIDEWALK || t === T.LOT || t === T.BUILDING) return false;
  }
  return true;
}

// lay a camp with its fire on tile (tx, ty): `kind` one of CAMPS3.kinds; `water` the angle (radians, screen) the water
// lies at from the fire (the seats face it, the tent goes behind); put(t, x, y, r, ex) adds a prop the caller's way;
// the tiles it cleared go in `clear` (a Set of indices: the caller drops what stood there). Returns the rest spot.
export function camp3(m, tx, ty, kind, water, put, clear) {
  const K = CAMPS3.kinds[kind], X = (tx + 0.5) * TILE, Y = (ty + 0.5) * TILE, h = (k) => hh(tx, ty, 4700 + k), R = CAMPS3.r;
  const C = Math.cos, S = Math.sin;
  // the ground: dirt round the fire (a beach's or a bar's sand stays sand); nothing else grows there
  for (let dy = -Math.ceil(R); dy <= Math.ceil(R); dy++) for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) {
    if (dx * dx + dy * dy > R * R) continue;
    const i = (ty + dy) * m.w + tx + dx;
    if (m.tiles[i] === T.GRASS) m.tiles[i] = T.DIRT;
    m.reserve[i] |= 4; m.reserve[i] &= ~128;
    if (clear) clear.add(i);
  }
  for (let dy = -Math.ceil(R + 2); dy <= Math.ceil(R + 2); dy++) for (let dx = -Math.ceil(R + 2); dx <= Math.ceil(R + 2); dx++) if (clear && dx * dx + dy * dy <= (R + 2) * (R + 2)) clear.add((ty + dy) * m.w + tx + dx);
  const lit = h(0) < 0.4;
  put('campfire', X, Y, 0, { lit, rest: 1 });
  // the seats: round the fire on the water's side, facing it across the flames
  for (let k = 0; k < K.seats; k++) {
    const a = water + Math.PI + (k - (K.seats - 1) / 2) * 1.15 + (h(1 + k) - 0.5) * 0.3, r = 52 + h(4 + k) * 8, sx = X + C(a) * r, sy = Y + S(a) * r * 0.85;
    const along = Math.round(((a + Math.PI / 2) % Math.PI + Math.PI) % Math.PI * 100) / 100;
    if (K.driftwood) put('driftwood', sx, sy, 0, { a: along, len: 70 + Math.floor(h(7 + k) * 3) * 10 });
    else put('log', sx, sy, 8, { len: 80 + Math.floor(h(7 + k) * 2) * 20, a: along, seat: 1 });
  }
  // the stones: a loose ring out past the seats, none toward the water (the view)
  for (let k = 0; k < CAMPS3.stones; k++) {
    const a = water + Math.PI * 0.55 + k * (Math.PI * 0.9 / CAMPS3.stones) * (k % 2 ? 1 : -1) * 1.2 + (h(11 + k) - 0.5) * 0.4, r = 96 + h(16 + k) * 20, s = 18 + Math.floor(h(21 + k) * 3) * 5;
    put('boulder', X + C(a) * r, Y + S(a) * r * 0.85, Math.round(s * 0.4), { s, style: 'granite', moss: k % 2 });
  }
  // what's left about: behind the fire (away from the water) the tent, the woodpile and the lantern; by the seats a
  // cooler and chairs; a canoe pulled up toward the water
  const back = water + Math.PI;
  for (let k = 0; k < (K.tents || (K.tent ? 1 : 0)); k++) put('tent', X + C(back + 0.5 - k * 1.1) * (2.3 + k * 0.4) * TILE, Y + S(back + 0.5 - k * 1.1) * (2.0 + k * 0.4) * TILE, 10, { v: Math.floor(h(30 + k * 7) * 3) });
  if (K.woodpile) put('woodpile', X + C(back - 0.7) * 1.9 * TILE, Y + S(back - 0.7) * 1.7 * TILE, 6);
  if (K.lantern) put('lantern', X + C(back - 0.15) * 1.5 * TILE, Y + S(back - 0.15) * 1.3 * TILE, 4);
  if (K.cooler) put('cooler', X + C(water + 1.3) * 1.5 * TILE, Y + S(water + 1.3) * 1.3 * TILE, 4, { v: Math.floor(h(31) * 3) });
  for (let k = 0; k < (K.chairs || 0); k++) { const a = water + [0.75, -0.75, 0][k % 3]; put('chair', X + C(a) * 1.7 * TILE, Y + S(a) * 1.5 * TILE, 4, { a: Math.round((a + Math.PI) * 100) / 100, v: Math.floor(h(32 + k) * 4) }); }   // (facing the fire)
  if (K.canoe) put('canoe', X + C(water) * 2.4 * TILE, Y + S(water) * 2.1 * TILE, 0, { a: Math.round((water + Math.PI / 2) * 100) / 100, c: Math.floor(h(34) * 3) });
  const spot = { x: Math.round(X), y: Math.round(Y), kind: 'camp', where: kind, lit, hand: true };
  (m.restSpots ||= []).push(spot);
  return spot;
}

// Beach camps (2026-10-21; the owner's "secluded spots ... beaches", N11's beach bonfire): on the wild coasts' sand -
// the woods', the rocks', the desert's, the country's - where no road or building is within `quiet` tiles and no place
// within `poi`: a fire `back` tiles up the beach from the water, driftwood seats and chairs facing the sea, a cooler, a
// lantern. The `n` most out-of-the-way, `apart` tiles from each other; nothing names them on the map - they're found.
// For the whole-world build only (shared/world3-world.js's done hook, after the coasts).
export const BEACH_CAMPS = { n: 3, apart: 600, quiet: 20, far: 32, poi: 40, fire: 40, back: [4, 7], step: 3 };
export function beachCamps3(m, H3) {
  const out = { camps: [] };
  if (!H3 || !H3.addProp) return out;
  const B = BEACH_CAMPS, W = m.w, HH = m.h, styles = m._distStyle || [], OK = new Set(['wild', 'rocky', 'desert', 'rural']);
  const inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH;
  const sea = (x, y) => { if (!inF(x, y)) return false; const i = y * W + x, t = m.tiles[i]; return (t === T.WATER || t === T.DEEP) && !m.land[i] && !(m.river && m.river[i]) && !(m.lake && m.lake[i]); };
  const fires = (m.props || []).filter((p) => p && p.t === 'campfire'), pois = m.pois || [];
  const cands = [];
  for (let y = 4; y < HH - 4; y += B.step) for (let x = 4; x < W - 4; x += B.step) {
    const i = y * W + x;
    if (m.tiles[i] !== T.SAND || !m.land[i] || !OK.has(styles[m.dist[i]])) continue;
    // (a shore tile: the sea beside it; which way the sea lies from here - its tiles round it, averaged)
    let sx = 0, sy = 0, n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (sea(x + dx, y + dy)) { sx += dx; sy += dy; n++; }
    if (n < 3) continue;
    const l = Math.sqrt(sx * sx + sy * sy);
    if (l < 1) continue;
    const ux = sx / l, uy = sy / l;
    for (let b = B.back[0]; b <= B.back[1]; b++) {
      const cx = Math.round(x - ux * b), cy = Math.round(y - uy * b);
      if (!inF(cx, cy) || m.tiles[cy * W + cx] !== T.SAND || !campFits(m, cx, cy, 32) || !campQuiet(m, cx, cy, B.quiet)) continue;
      const X = (cx + 0.5) * TILE, Y = (cy + 0.5) * TILE;
      if (pois.some((q) => Math.abs(q.x - X) < B.poi * TILE && Math.abs(q.y - Y) < B.poi * TILE) || fires.some((f) => Math.abs(f.x - X) < B.fire * TILE && Math.abs(f.y - Y) < B.fire * TILE)) break;
      cands.push({ x: cx, y: cy, a: Math.atan2(uy, ux), sc: (campQuiet(m, cx, cy, B.far) ? 2 : 0) + hh(cx, cy, 4720) });
      break;
    }
  }
  cands.sort((p, q) => q.sc - p.sc || p.y - q.y || p.x - q.x);
  const P = [], clear = new Set(), put = (t, x, y, r = 0, ex = null) => P.push([t, Math.round(x), Math.round(y), r, ex]);
  for (const c of cands) {
    if (out.camps.length >= B.n) break;
    if (out.camps.some((q) => Math.abs(q.tx - c.x) + Math.abs(q.ty - c.y) < B.apart)) continue;
    const spot = camp3(m, c.x, c.y, 'beach', c.a, put, clear);
    out.camps.push({ ...spot, tx: c.x, ty: c.y });
  }
  if (clear.size && H3.removeProps) H3.removeProps(m, (x, y) => clear.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
  for (const [t, x, y, r, ex] of P) H3.addProp(m, t, x, y, r, ex);
  out.cands = cands.length;
  return out;
}
