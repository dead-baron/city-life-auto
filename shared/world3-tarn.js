// Granite Peaks by hand, part 2: Summit Tarn and Eagle Crag (the nature program, 2026-10-20; the handcraft research's
// 4.2-4.3 and the concepts SC3-G, N5, NS1-D and Nature-C4's climbers: "a still lake is a mirror ... a rowboat angler,
// tents on a granite shelf"; "granite slabs on the shore"; "two at the foot of a crag, one with the rope").
// - Summit Tarn: the tarn lay in bare scree to its rim. Now alpine turf greens its north and east shores (round the
//   cabin's meadow), pale granite slabs run out into the water along its north side with boulders in the shallows, a
//   pebble beach lies on its west shore with a rowboat pulled up on it, and above the beach a camp on a level shelf -
//   two tents, a fire ring with log seats to rest by (the campers come to it: server/systems/wildfolk.js), a cooler, a
//   lantern on its post. On the map as "Summit Tarn Camp".
// - Eagle Crag: a granite crag on the open ground north-east of the tarn, the climbers' - its sign and the route board,
//   crash pads and a rope coiled at the foot of the rock; the climbers come to it first (wildfolk.js: a nature site of
//   kind 'crag').
// For the whole-world build only (shared/world3-world.js's done hook, after Granite Peaks' part 1). Deterministic:
// arithmetic and integer hashes.
import { TILE, T } from './constants.js';

const RES = 32, KEEP = 4, LUSH = 128, D_PEAKS = 48;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const TARN3 = {
  turf: 4,          // the green round the north and east shores: tiles from the water
  beach: 3,         // the pebble beach on the west shore: tiles from the water
  slabs: 5,         // a slab every this many tiles of the north shore
  camp: { name: 'Summit Tarn Camp', back: 4 },   // the camp's shelf: this many tiles back from the beach's water
  crag: { name: 'Eagle Crag', reach: 36, foot: 3 },   // looked for within reach tiles of the tarn's middle; the gear's row this many 8-px steps below its foot
};

export function tarnByHand3(m, H3) {
  const out = { tarn: 0, turf: 0, beach: 0, slabs: 0, camp: null, crag: null };
  const site = (m.natureSites || []).find((s) => s.kind === 'tarn' && s.name === 'Summit Tarn');
  if (!H3 || !H3.addProp || !site || !m.lake) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const props = [], P = (t, x, y, r = 0, ex = null) => props.push([t, Math.round(x), Math.round(y), r, ex]);
  // the tarn's water: from its middle
  const cx = Math.floor(site.x / TILE), cy = Math.floor(site.y / TILE), lakeAt = (x, y) => inF(x, y) && m.lake[idx(x, y)] && (m.tiles[idx(x, y)] === T.WATER || m.tiles[idx(x, y)] === T.DEEP);
  let s0 = null;
  for (let r = 0; r < 12 && !s0; r++) for (let dy = -r; dy <= r && !s0; dy++) for (let dx = -r; dx <= r; dx++) if (lakeAt(cx + dx, cy + dy)) { s0 = [cx + dx, cy + dy]; break; }
  if (!s0) return out;
  const water = new Set([idx(...s0)]), q = [s0];
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy, j = idx(X, Y); if (!water.has(j) && lakeAt(X, Y) && Math.abs(X - cx) < 60 && Math.abs(Y - cy) < 60) { water.add(j); q.push([X, Y]); } } }
  out.tarn = water.size;
  let wx0 = 1e9, wx1 = -1e9, wy0 = 1e9, wy1 = -1e9;
  for (const i of water) { const x = i % W, y = (i - x) / W; wx0 = Math.min(wx0, x); wx1 = Math.max(wx1, x); wy0 = Math.min(wy0, y); wy1 = Math.max(wy1, y); }
  const mx = (wx0 + wx1) / 2, my = (wy0 + wy1) / 2;
  // the land round it: each tile's distance to the tarn (to 8), over open ground
  const open = (i) => (m.tiles[i] === T.DIRT || m.tiles[i] === T.GRASS || m.tiles[i] === T.SAND) && m.land[i] && !(m.bld && m.bld[i] >= 0);
  const dist = new Map(), bq = [];
  for (const i of water) { const x = i % W, y = (i - x) / W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = idx(x + dx, y + dy); if (!water.has(j) && !dist.has(j) && open(j)) { dist.set(j, 1); bq.push(j); } } }
  for (let h = 0; h < bq.length; h++) { const i = bq[h], d = dist.get(i); if (d >= 8) continue; for (const j of [i - 1, i + 1, i - W, i + W]) if (!dist.has(j) && !water.has(j) && open(j)) { dist.set(j, d + 1); bq.push(j); } }
  const dirAt = (i) => { const x = i % W, y = (i - x) / W; return Math.atan2(y - my, x - mx); };   // (-pi..pi: 0 east, pi/2 south)
  const outlet = site.falls ? [site.falls.x / TILE, site.falls.y / TILE] : null;
  const nearOutlet = (x, y) => outlet && Math.hypot(x - outlet[0], y - outlet[1]) < 6;
  const taken = new Set(), drop = [];
  // the west shore: the pebble beach, the camp's shelf behind it
  const west = (i) => { const a = dirAt(i); return a > 2.3 || a < -2.6; };
  for (const [i, d] of dist) {
    const x = i % W, y = (i - x) / W;
    if (!west(i) || d > TARN3.beach + (hh(x, y, 71) < 0.4 ? 1 : 0) || nearOutlet(x, y)) continue;
    m.tiles[i] = T.SAND; m.reserve[i] = (m.reserve[i] & ~64) | LUSH | RES | KEEP; taken.add(i); out.beach++;
  }
  // the turf: the north and east shores (the cabin's side), green to a ragged edge
  for (const [i, d] of dist) {
    if (taken.has(i)) continue;
    const a = dirAt(i), x = i % W, y = (i - x) / W;
    if (!(a < -0.35 && a > -2.6) && !(a >= -0.35 && a < 0.9)) continue;   // (north-west round to south-east)
    if (d > TARN3.turf + Math.floor(hh(x >> 1, y >> 1, 72) * 3) || nearOutlet(x, y)) continue;
    m.tiles[i] = T.GRASS; m.reserve[i] |= LUSH; taken.add(i); out.turf++;
  }
  // the slabs: along the north shore, half out over the water; boulders in the shallows
  const north = [...dist].filter(([i, d]) => d === 1 && dirAt(i) < -0.6 && dirAt(i) > -2.5).map(([i]) => i).sort((a, b) => (a % W) - (b % W));
  let lastX = -1e9;
  for (const i of north) {
    const x = i % W, y = (i - x) / W;
    if (x - lastX < TARN3.slabs) continue;
    if (m.props.some((p) => p && p.t === 'outcrop' && Math.abs(p.x / TILE - x) < 3 && Math.abs(p.y / TILE - y) < 3)) continue;
    lastX = x;
    const w = 64 + Math.floor(hh(x, y, 73) * 3) * 16, d = 40 + Math.floor(hh(x, y, 74) * 2) * 16;
    P('outcrop', (x + 0.5) * TILE, (y + 0.9) * TILE, 0, { w, d, h: 10 + Math.floor(hh(x, y, 75) * 2) * 6, style: 'granite', s: (x + y) % 4 });
    if (m.addSolidProp) m.addSolidProp((x + 0.5) * TILE, (y + 0.7) * TILE, 14);
    out.slabs++;
  }
  const shallows = [...water].filter((i) => { const x = i % W, y = (i - x) / W; return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => dist.get(idx(x + dx, y + dy)) === 1) && dirAt(i) < 0 && !nearOutlet(x, y); });
  for (let k = 0; k < 4 && shallows.length; k++) { const i = shallows[Math.floor(hh(k, 9, 76) * shallows.length)], x = i % W, y = (i - x) / W, s = 18 + k * 4; P('boulder', (x + 0.5) * TILE, (y + 0.5) * TILE, Math.round(s * 0.35), { s, style: 'granite', moss: k % 2 }); }
  // the camp: the shelf behind the beach's middle, level open ground
  const beach = [...dist].filter(([i, d]) => taken.has(i) && m.tiles[i] === T.SAND && d === 1).map(([i]) => i);
  if (beach.length) {
    beach.sort((a, b) => Math.abs(((a - (a % W)) / W) - my) - Math.abs(((b - (b % W)) / W) - my));
    const b0 = beach[0], bx = b0 % W, by = (b0 - bx) / W;
    // (back from the water, away from the tarn's middle)
    const ax = bx - mx, ay = by - my, al = Math.hypot(ax, ay) || 1;
    let best = null;
    for (let back = TARN3.camp.back; back <= TARN3.camp.back + 8 && !best; back++) for (const sw of [0, 3, -3, 6, -6]) {
      if (best) break;
      const sx = Math.round(bx + ax / al * back - ay / al * sw), sy = Math.round(by + ay / al * back + ax / al * sw);
      let ok = true;
      for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -4; dx <= 4; dx++) { const i = idx(sx + dx, sy + dy); if (!inF(sx + dx, sy + dy) || !(m.tiles[i] === T.DIRT || m.tiles[i] === T.GRASS || m.tiles[i] === T.SAND) || water.has(i) || (m.reserve[i] & (16 | 2 | 1 | 8))) { ok = false; break; } }
      if (ok && m.props.some((p) => p && (p.t === 'outcrop' || p.t === 'logcabin' || p.t === 'rail') && Math.abs(p.x / TILE - sx) < 6 && Math.abs(p.y / TILE - sy) < 5)) ok = false;
      if (ok) best = [sx, sy];
    }
    if (best) {
      const [sx, sy] = best, X = (sx + 0.5) * TILE, Y = (sy + 0.5) * TILE;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) { const i = idx(sx + dx, sy + dy); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.SAND) m.tiles[i] = T.DIRT; m.reserve[i] |= RES | KEEP; }
      drop.push([X, Y, 5 * TILE]);
      P('tent', X - 58, Y - 44, 10, { v: 1 });
      P('tent', X + 54, Y - 52, 10, { v: 2 });
      P('campfire', X, Y + 16, 0, { lit: false, rest: 1 });
      for (let j = 0; j < 3; j++) { const a = Math.PI * (0.2 + j * 0.55), r = 46; P('log', X + Math.cos(a) * r, Y + 16 + Math.sin(a) * r * 0.8, 8, { len: 56, a: Math.round(((a + Math.PI / 2) % Math.PI) * 100) / 100, seat: 1 }); }
      P('cooler', X - 92, Y + 6, 0, { v: 0 });
      P('lantern', X + 96, Y - 6, 0);
      P('chair', X + 70, Y + 34, 0, { a: -2.4, v: 2 });
      (m.restSpots ||= []).push({ x: Math.round(X), y: Math.round(Y + 16), kind: 'camp', lit: false });
      (m.landmarks ||= []).push({ name: TARN3.camp.name, type: 'camp', x: Math.round(X - 5 * TILE), y: Math.round(Y - 4 * TILE), w: 10 * TILE, h: 8 * TILE });
      m.natureSites.push({ kind: 'camp', name: TARN3.camp.name, x: Math.round(X), y: Math.round(Y) });
      out.camp = [sx, sy];
    }
    // the rowboat pulled up on the beach, its bow to the water
    const bi = beach[Math.min(beach.length - 1, 3)], rx = bi % W, ry = (bi - rx) / W;
    P('rowboat', (rx + 0.5) * TILE, (ry + 0.5) * TILE, 0, { a: Math.atan2(my - ry, mx - rx) });
  }
  // Eagle Crag: a granite crag on open ground off the tarn's north-east shore - its face, a lower buttress beside it,
  // the gear at its foot (the face looks south, toward the tarn's side)
  const C = TARN3.crag;
  const clearRect = (sx, sy) => {
    for (let dy = -5; dy <= 4; dy++) for (let dx = -6; dx <= 6; dx++) { const x = sx + dx, y = sy + dy, i = idx(x, y); if (!inF(x, y) || !(m.tiles[i] === T.DIRT || m.tiles[i] === T.GRASS) || water.has(i) || taken.has(i) || (m.reserve[i] & (32 | 16 | 2 | 1 | 8)) || m.dist[i] !== D_PEAKS) return false; }
    return !m.props.some((p) => p && /^(outcrop|logcabin|rail|tent|campfire|lookout|cliff)/.test(p.t) && Math.abs(p.x / TILE - sx) < 9 && Math.abs(p.y / TILE - sy) < 8);
  };
  let spot = null, sd = 1e9;
  for (let y = Math.floor(my) - C.reach; y <= my + C.reach; y += 2) for (let x = Math.floor(mx) - 4; x <= mx + C.reach; x += 2) {
    const d = Math.hypot(x - mx, y - my), a = Math.atan2(y - my, x - mx);
    if (d < 14 || d > C.reach || a > 0.6 || a < -2.2) continue;   // (north-west round to east)
    const score = Math.abs(d - 18) + hh(x, y, 77) * 2;
    if (score < sd && clearRect(x, y)) { sd = score; spot = [x, y]; }
  }
  if (spot) {
    const [sx, sy] = spot, X = (sx + 0.5) * TILE, Y = (sy + 0.5) * TILE;
    drop.push([X, Y - TILE, 5 * TILE]);
    P('outcrop', X, Y - 2.2 * TILE, 0, { w: 192, d: 96, h: 120, style: 'granite', s: 2 });
    P('outcrop', X + 3.4 * TILE, Y - 1.6 * TILE, 0, { w: 96, d: 64, h: 66, style: 'granite', s: 3 });
    if (m.addSolidProp) { for (let dx = -84; dx <= 84; dx += 28) m.addSolidProp(X + dx, Y - 2.2 * TILE - 24, 22); for (let dx = -30; dx <= 30; dx += 30) m.addSolidProp(X + 3.4 * TILE + dx, Y - 1.6 * TILE - 16, 18); }
    for (let dy = -4; dy <= 2; dy++) for (let dx = -5; dx <= 6; dx++) m.reserve[idx(sx + dx, sy + dy)] |= RES | KEEP;
    const FY = Y + C.foot * 8;
    P('textsign', X - 104, FY - 12, 0, { text: 'EAGLE CRAG', z: 34 });
    P('mapboard', X - 70, FY + 30, 0);
    P('crashpad', X - 10, FY - 4, 0, { v: 0, a: 0 });
    P('crashpad', X + 44, FY + 2, 0, { v: 1, a: 0.25 });
    P('ropecoil', X + 22, FY + 34, 0);
    m.natureSites.push({ kind: 'crag', name: C.name, x: Math.round(X + 10), y: Math.round(FY + 22) });
    (m.landmarks ||= []).push({ name: C.name, type: 'crag', x: Math.round(X - 4 * TILE), y: Math.round(Y - 5 * TILE), w: 9 * TILE, h: 8 * TILE });
    out.crag = spot;
  }
  if (drop.length && H3.removeProps) H3.removeProps(m, (x, y) => drop.some(([a, b, r]) => Math.hypot(x - a, y - b) < r));
  // (nothing left standing on the beach or the turf's water edge: the shore's own furniture goes on after)
  if (H3.removeProps) { const shore = new Set([...taken].filter((i) => m.tiles[i] === T.SAND)); H3.removeProps(m, (x, y) => shore.has(Math.floor(y / TILE) * W + Math.floor(x / TILE))); }
  for (const [t, x, y, r, ex] of props) H3.addProp(m, t, x, y, r, ex);
  return out;
}
