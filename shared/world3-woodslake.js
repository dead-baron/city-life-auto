// Silver Thread Lake by hand (the nature program, 2026-10-21; the handcraft research's 4.3, "the mid-forest lake
// (islets, boathouse)", and the concepts NA1-A, D15 and SC3-G: "a rocky pine islet ... jetty and boat ramp ... a still
// lake is a mirror"). The lake under Silver Thread Falls, in the middle of Highland Woods, lay as the river's still reach
// had left it: one smooth blob, the forest floor to a clean edge, nothing on it. Now:
// - its shore wanders - small bays dug into the forest floor, points out into the water - in slow waves (never near the
//   falls, the outlet, a trail, a road or a bridge); a pine or a boulder on each point, the bays' shallows reedy;
// - three rocky islets out in the deep water, a rim of pebbles and boulders round each, pines on them;
// - the Silver Thread Boathouse on the south shore: a timber boat shed over the water, a plank jetty out into the lake
//   with canoes along it and a lamp at its end, a bench on the bank, and the canoe hire - rowboats and the dock's
//   motorboat (server/systems/rentals.js: the rental's own models); named on the map.
// For the whole-world build only (shared/world3-world.js's done hook, after the trails and the rapids). Deterministic:
// arithmetic, integer hashes, sqrt.
import { TILE, T } from './constants.js';

const RES = 32, KEEP = 4, LUSH = 128;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const fade = (t) => t * t * (3 - 2 * t);
const vn = (x, y, sc, s) => { const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy), u = fade(fx - ix), v = fade(fy - iy), a = hh(ix, iy, s), b = hh(ix + 1, iy, s), c = hh(ix, iy + 1, s), d = hh(ix + 1, iy + 1, s); return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v; };

// near: a tile in the lake; box: where it lies (tiles); shore: the shore moved up to amp tiles either way in waves of
// about scale tiles, easing to nothing within keep tiles of anything built or walked and within falls / outlet tiles
// of the falls' lip and of the river's water in and out; isles: how many, their radius (tiles), how far from any
// shore their edge, how far apart
export const WOODSLAKE3 = {
  name: 'Silver Thread Lake', near: [1720, 1095], box: [1560, 980, 1910, 1190],
  shore: { amp: 9, scale: 30, keep: 6, falls: 24, outlet: 20 },
  isles: { n: 3, r: [4, 11], off: 7, apart: 44 },
  boat: { name: 'Silver Thread Boathouse', rent: 'Silver Thread Canoe Hire', jetty: 9, models: ['rowboat', 'dinghy'] },
};

export function woodsLake3(m, H3) {
  const out = { lake: 0, dug: 0, built: 0, isles: 0, isleTiles: 0, pines: 0, boathouse: null };
  if (!H3 || !H3.addProp || !m.lake) return out;
  const L = WOODSLAKE3, W = m.w, HH = m.h, idx = (x, y) => y * W + x;
  const [bx0, by0, bx1, by1] = L.box, inB = (x, y) => x >= bx0 && y >= by0 && x < bx1 && y < by1 && x >= 1 && y >= 1 && x < W - 1 && y < HH - 1;
  const wetT = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP;
  // the lake: its water from the spot, the river's still reach (lake-flagged river water)
  let s0 = -1;
  for (let r = 0; r < 30 && s0 < 0; r++) for (let dy = -r; dy <= r && s0 < 0; dy++) for (let dx = -r; dx <= r; dx++) { const x = L.near[0] + dx, y = L.near[1] + dy; if (inB(x, y) && wetT(idx(x, y)) && m.lake[idx(x, y)]) { s0 = idx(x, y); break; } }
  if (s0 < 0) return out;
  const lakeV = m.lake[s0], water = new Set([s0]), q = [s0];
  while (q.length) { const i = q.pop(); for (const j of [i - 1, i + 1, i - W, i + W]) { const X = j % W, Y = (j - X) / W; if (!water.has(j) && inB(X, Y) && wetT(j) && m.lake[j]) { water.add(j); q.push(j); } } }
  out.lake = water.size;
  if (water.size < 2000) return out;
  const dist0 = m.dist[s0], zone0 = m.zone ? m.zone[s0] : 0;
  // (the woods' district and zone, from the shore: for the ground made out in the water - the islets, the points)
  let landD = 0, landZ = 0;
  for (const i of water) { for (const j of [i - 1, i + 1, i - W, i + W]) if (m.land[j] && !water.has(j)) { landD = m.dist[j]; landZ = m.zone ? m.zone[j] : 0; break; } if (landD) break; }
  // what the shore keeps clear of: built or walked ground, the falls, the river's water in and out
  const S = L.shore, hard = [];
  const built = (i) => { const t = m.tiles[i]; return t === T.DOCK || t === T.BRIDGE || t === T.ROAD || t === T.BUILDING || t === T.WALL || t === T.SIDEWALK || t === T.LOT || t === T.PLAZA || (m.bld && m.bld[i] >= 0) || (m.land[i] && (m.reserve[i] & (1 | 2 | 8 | 16 | 32))); };
  for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { if (!inB(x, y)) continue; const i = idx(x, y); if (built(i)) hard.push([x, y, S.keep]); else if (wetT(i) && !m.lake[i]) hard.push([x, y, S.outlet]); }
  const lip = m.world3 && m.world3.west && m.world3.west.built && m.world3.west.built.falls && m.world3.west.built.falls.lip;
  if (lip) for (let x = lip.x0; x <= lip.x1; x += 2) hard.push([x, lip.y, S.falls]);
  // (how near each tile is to any of them, as a fraction of its keep: a coarse grid of the nearest)
  const ease = new Float32Array((bx1 - bx0) * (by1 - by0)).fill(1), ei = (x, y) => (y - by0) * (bx1 - bx0) + (x - bx0);
  for (const [hx, hy, k] of hard) for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
    const x = hx + dx, y = hy + dy;
    if (!inB(x, y)) continue;
    const f = Math.sqrt(dx * dx + dy * dy) / k;
    if (f < ease[ei(x, y)]) ease[ei(x, y)] = f;
  }
  // the signed distance to the shore (tiles: + in the water, - on the land), out to amp + 2
  const R = S.amp + 2, sd = new Map(), bq = [];
  for (const i of water) for (const j of [i - 1, i + 1, i - W, i + W]) if (!water.has(j)) { if (!sd.has(i)) { sd.set(i, 1); bq.push(i); } if (!sd.has(j) && m.land[j]) { sd.set(j, -1); bq.push(j); } }
  for (let h = 0; h < bq.length; h++) {
    const i = bq[h], d = sd.get(i);
    if (Math.abs(d) >= R) continue;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (sd.has(j)) continue;
      const X = j % W, Y = (j - X) / W;
      if (!inB(X, Y)) continue;
      if (d > 0 && water.has(j)) { sd.set(j, d + 1); bq.push(j); } else if (d < 0 && m.land[j] && !water.has(j)) { sd.set(j, d - 1); bq.push(j); }
    }
  }
  const openLand = (i) => m.land[i] && (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) && !(m.reserve[i] & ~(KEEP | LUSH)) && !(m.bld && m.bld[i] >= 0);
  const changed = new Set(), points = [];
  for (const [i, d] of sd) {
    const x = i % W, y = (i - x) / W, e = Math.min(1, ease[ei(x, y)] * 1.25);
    if (e <= 0.05) continue;
    const o = S.amp * (2 * vn(x, y, S.scale, 4401) - 1) * e, wantWet = (d > 0 ? d - 0.5 : d + 0.5) + o > 0;
    if (wantWet && d < 0 && openLand(i)) {
      m.tiles[i] = T.WATER; m.land[i] = 0; m.lake[i] = lakeV; m.river[i] = 1; m.dist[i] = dist0; if (m.zone) m.zone[i] = zone0; m.reserve[i] = (m.reserve[i] | RES) & ~LUSH;
      water.add(i); changed.add(i); out.dug++;
    } else if (!wantWet && d > 0 && m.tiles[i] === T.WATER) {
      let bank = -1; for (const j of [i - 1, i + 1, i - W, i + W]) if (m.land[j] && !water.has(j)) bank = j;
      const bd = bank >= 0 ? m.dist[bank] : 0;
      m.tiles[i] = T.GRASS; m.land[i] = 1; m.lake[i] = 0; m.river[i] = 0; m.dist[i] = bd || landD; if (m.zone) m.zone[i] = landZ; m.reserve[i] |= RES;
      water.delete(i); changed.add(i); out.built++;
      if (o < -S.amp * 0.7) points.push(i);
    }
  }
  const P = [], put = (t, x, y, r = 0, ex = null) => P.push([t, Math.round(x), Math.round(y), r, ex]);
  // a pine or a boulder out on the points (the furthest out of each, spaced)
  const onPts = [];
  for (const i of points) {
    const x = i % W, y = (i - x) / W;
    if (onPts.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 14)) continue;
    onPts.push([x, y]);
    if (hh(x, y, 4402) < 0.6) put('tree_a', (x + 0.5) * TILE, (y + 0.5) * TILE, 12, { sp: 'pondPine', k: 1.3 + hh(x, y, 4403) * 0.3 });
    else put('boulder', (x + 0.5) * TILE, (y + 0.5) * TILE, 8, { s: 22 + Math.round(hh(x, y, 4404) * 14), style: 'granite', moss: 1 });
  }
  // ---- the islets: out in the deep water, apart ----
  const I = L.isles, wd = new Map(), wq = [];
  for (const i of water) for (const j of [i - 1, i + 1, i - W, i + W]) if (!water.has(j)) { wd.set(i, 1); wq.push(i); break; }
  for (let h = 0; h < wq.length; h++) { const i = wq[h], d = wd.get(i); for (const j of [i - 1, i + 1, i - W, i + W]) if (water.has(j) && !wd.has(j)) { wd.set(j, d + 1); wq.push(j); } }
  const cand = [...wd].filter(([, d]) => d >= I.r[0] + I.off).map(([i, d]) => [i, d, d + hh(i % W, (i / W) | 0, 4413) * 14]).sort((a, b) => b[2] - a[2] || a[0] - b[0]);   // (the deep middle, by chance: not in a row down it)
  const isles = [];
  for (const [i, d] of cand) {
    if (isles.length >= I.n) break;
    const x = i % W, y = (i - x) / W;
    if (isles.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < I.apart)) continue;
    if (lip && Math.abs(x - (lip.x0 + lip.x1) / 2) < 30 && y < lip.y + 30) continue;   // (not under the falls' veil)
    const r = Math.min(I.r[1] - isles.length * 3, Math.max(I.r[0], d - I.off - Math.floor(hh(x, y, 4405) * 3)));   // (one big, the others smaller)
    isles.push({ x, y, r, ax: 0.7 + hh(x, y, 4414) * 0.6 });
  }
  for (const s of isles) {
    const tiles = [];
    for (let dy = -s.r * 2; dy <= s.r * 2; dy++) for (let dx = -s.r * 2; dx <= s.r * 2; dx++) {
      const x = s.x + dx, y = s.y + dy, i = idx(x, y), f = Math.sqrt((dx / (s.r * s.ax)) * (dx / (s.r * s.ax)) + (dy / (s.r * 0.85)) * (dy / (s.r * 0.85))) * (0.72 + 0.56 * vn(x, y, 4, 4406 + s.x));
      if (f >= 1 || !water.has(i)) continue;
      tiles.push([x, y, f]);
    }
    for (const [x, y, f] of tiles) {
      const i = idx(x, y);
      m.tiles[i] = f > 0.72 ? T.SAND : T.GRASS; m.land[i] = 1; m.lake[i] = 0; m.river[i] = 0; m.dist[i] = landD; if (m.zone) m.zone[i] = landZ; m.reserve[i] |= RES | (f > 0.72 ? LUSH : 0);   // (the rim: pebbles - shingle, sand flagged 128)
      water.delete(i); changed.add(i); out.isleTiles++;
    }
    // boulders round the rim, pines on the middle (fewer on a small one)
    const rim = tiles.filter((t) => t[2] > 0.72), mid = tiles.filter((t) => t[2] < 0.55);
    for (let k = 0; k < Math.min(rim.length, 3 + s.r); k++) { const [x, y] = rim[Math.floor(hh(k, s.x, 4407) * rim.length)]; put('boulder', (x + 0.5) * TILE, (y + 0.5) * TILE, 8, { s: 18 + Math.round(hh(k, s.y, 4408) * 18), style: 'granite', moss: hh(k, x, 4409) < 0.5 ? 1 : 0 }); }
    const nP = Math.max(1, Math.round(s.r * 0.8)), pts = [];
    for (let k = 0; k < mid.length && pts.length < nP; k++) { const [x, y] = mid[Math.floor(hh(k, s.x + s.y, 4410) * mid.length)]; if (pts.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 3)) continue; pts.push([x, y]); put('tree_a', (x + 0.5) * TILE, (y + 0.5) * TILE, 12, { sp: hh(x, y, 4411) < 0.5 ? 'pondPine' : hh(x, y, 4411) < 0.8 ? 'fir' : 'spruce', k: 1.25 + hh(x, y, 4412) * 0.35 }); out.pines++; }
    out.isles++;
  }
  // ---- the boathouse on the south shore: the shore tile with the most open ground behind it, nearest the lake's middle
  const B = L.boat;
  let cx = 0, cy = 0; for (const i of water) { cx += i % W; cy += (i - (i % W)) / W; } cx /= water.size; cy /= water.size;
  let best = null;
  const wout = new Set();   // (the lake's water near the river in and out: no jetty there)
  for (const [hx, hy, k] of hard) if (k === S.outlet) for (let dy = -k; dy <= k; dy += 2) for (let dx = -k; dx <= k; dx += 2) wout.add(idx(hx + dx, hy + dy));
  for (const i of water) {
    const x = i % W, y = (i - x) / W;
    if (water.has(i + W) || !openLand(i + W)) continue;   // (water with land south of it: the south shore)
    if (lip && y < lip.y + 40) continue;
    let ok = true;
    for (let dy = 1; dy <= 8 && ok; dy++) for (let dx = -6; dx <= 6; dx++) { const j = idx(x + dx, y + dy); if (!openLand(j) || water.has(j)) { ok = false; break; } }
    for (let dy = -B.jetty - 1; dy <= 0 && ok; dy++) for (let dx = dy === 0 ? 0 : -2; dx <= (dy === 0 ? 1 : 3); dx++) { const j = idx(x + dx, y + dy); if (!water.has(j) || !inB(x + dx, y + dy) || (wout.has(j))) { ok = false; break; } }
    if (!ok) continue;
    const sc = Math.abs(x - cx) + Math.abs(y - cy) * 0.5;
    if (!best || sc < best.sc) best = { x, y, sc };
  }
  if (best) {
    const { x: sx, y: sy } = best;   // (sx, sy: the last water tile before the bank)
    for (let k = 0; k < B.jetty; k++) for (const dx of [0, 1]) { const i = idx(sx + dx, sy - k); m.tiles[i] = T.DOCK; m.reserve[i] |= RES; changed.add(i); }
    for (const dx of [0, 1]) { const i = idx(sx + dx, sy + 1); m.tiles[i] = T.DIRT; m.reserve[i] |= RES; }   // (the landing: trodden earth)
    put('boathouse', (sx + 4.6) * TILE, (sy - 2.2) * TILE, 0);
    put('lamp', (sx + 0.5) * TILE, (sy - B.jetty + 1) * TILE, 0);
    for (let k = 0; k < 3; k++) put('canoe', (sx - 1.3) * TILE, (sy - 2.5 - k * 2.3) * TILE, 0, { a: -Math.PI / 2, c: k });
    put('pbench', (sx - 3.5) * TILE, (sy + 2.5) * TILE, 0, { a: -Math.PI / 2 });
    put('textsign', (sx + 4) * TILE, (sy + 2.6) * TILE, 0, { text: 'CANOE HIRE', bg: '#5a3a22', fg: [250, 230, 180], z: 30 });
    for (let dy = -2; dy <= 4; dy++) for (let dx = -6; dx <= 8; dx++) changed.add(idx(sx + dx, sy + dy));   // (what stood there goes)
    // (a clearing round the landing, and no tall tree south of it standing up the screen over the jetty: the giants'
    // sprites reach some 20 tiles up)
    const tall = /^(tree_|redwood|shrub_|bush_)/;
    for (const p of m.props) {
      if (!p || !tall.test(p.t)) continue;
      const dx = p.x / TILE - (sx + 1), dy = p.y / TILE - sy;
      if ((Math.abs(dx) < 10 && dy > -3 && dy < 9) || (Math.abs(dx) < 8 && dy >= 9 && dy < (p.t === 'redwood' || /^redwood|^giant/.test(p.sp || '') ? 24 : 12))) changed.add(idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE)));
    }
    // the canoe hire (server/systems/rentals.js): its desk at the landing, the boats waiting along the jetty
    if (m.rentals && m.pois) {
      const door = { x: (sx + 1) * TILE, y: (sy + 1.6) * TILE };
      const poi = { id: m.pois.length, kind: 'rental', label: B.rent, x: door.x, y: door.y, r: 48 };
      m.pois.push(poi);
      const spots = [];
      for (let k = 2; k < B.jetty - 1; k += 3) spots.push({ x: (sx + 3.2) * TILE, y: (sy - k) * TILE, a: -Math.PI / 2 });
      m.rentals.push({ poi: poi.id, name: B.rent, spots, lake: true, models: B.models, dock: door });
      out.boathouse = { shore: [sx, sy], poi: poi.id, spots: spots.length };
    } else out.boathouse = { shore: [sx, sy], poi: -1, spots: 0 };
    if (!(m.landmarks || []).some((l) => l.name === B.name)) m.landmarks.push({ name: B.name, type: 'marina', x: (sx - 8) * TILE, y: (sy - B.jetty - 2) * TILE, w: 18 * TILE, h: (B.jetty + 8) * TILE });
  }
  if (changed.size && H3.removeProps) H3.removeProps(m, (x, y) => changed.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
  for (const [t, x, y, r, ex] of P) H3.addProp(m, t, x, y, r, ex);
  if (!(m.landmarks || []).some((l) => l.name === L.name)) {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const i of water) { const x = i % W, y = (i - x) / W; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    m.landmarks.push({ name: L.name, type: 'lake', x: x0 * TILE, y: y0 * TILE, w: (x1 - x0 + 1) * TILE, h: (y1 - y0 + 1) * TILE });
  }
  m.natureSites.push({ kind: 'lake', name: L.name, x: Math.round((cx + 0.5) * TILE), y: Math.round((cy + 0.5) * TILE), isles: out.isles });
  out.lake = water.size;
  return out;
}
