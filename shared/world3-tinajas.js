// The desert's waters (the nature program, 2026-10-21; the handcraft research's 4.6, NR1-B and SC3-F: "tinajas (rock
// water pockets) and seep pools as hidden fishing/water spots", "a murky olive seep pool under a palo verde").
//   - Tinajas: out in the Red Rock and Dry Creek deserts, at the foot of a mesa's or a butte's cliff, a pocket of rain
//     water held in a bowl of bare slickrock - clear and green-blue in the red rock, a few sandstone boulders on its
//     rim (open on the side away from the cliff, where the animals come down to drink), a palo verde over it.
//   - Seep pools: in the dry wash below Red Rock Dam, where the dam's water seeps back up through the gravel, small
//     murky olive pools in a ring of cracked mud, reeds and cattails at their edges, a palo verde for shade.
// Each is fresh still water (a pond: the lake flag 2, fishing's pond fish) listed for the page's water bake with its look
// (m.waters.lk: 'forest' - clear green, 'marsh' - murky olive) and for the ground bake's ring (m.tinajas: the slickrock, the cracked mud -
// client/art2/game/groundbake.js); each is on the map (m.natureSites 'tinaja', 'seep'), a place to find.
// For the whole-world build only (shared/world3-world.js's done hook). Deterministic: arithmetic, integer hashes, and
// Math's functions only inside generateCity.
import { TILE, T } from './constants.js';

const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// districts: the deserts (Red Rock, Dry Creek); n: how many tinajas; apart: tiles between them at the least; face: the
// cliff's face at least this wide (tiles); r: the pool's radius (tiles); off: tiles of rock between the cliff's foot
// and the water; ring: the slickrock round it (tiles past the water); flat: the land's rise allowed under it (m);
// clear: no road, no other water, nothing built this near (tiles); away: tiles from any other nature site.
// seeps: n in the dry wash below the dam (its box, tiles), each r tiles across, ring tiles of cracked mud round it.
export const TINAJA3 = {
  districts: [50, 41], n: 5, apart: 70, face: 6, r: [1.7, 2.5], off: 1.4, ring: 2.4, flat: 2, clear: 9, away: 24,
  seeps: { n: 2, box: [5150, 2040, 5340, 2260], r: [1.8, 2.2], ring: 1.6, apart: 22, step: 2 },
};

const OPEN = new Set([T.SAND, T.DIRT, T.GRASS]);
const KEEP = 4, RES = 32, LUSH = 128;

export function desertWaters3(m, H3) {
  const out = { tinajas: [], seeps: [] };
  if (!H3 || !H3.addProp || !m.lake) return out;
  const S = TINAJA3, W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const DS = new Set(S.districts);
  const designed = (i) => { const a = m.solidProps && m.solidProps.get(i); return !!a && a.some((e) => e.pi < 0); };
  const plain = (i) => m.land[i] && OPEN.has(m.tiles[i]) && !(m.reserve[i] & ~(KEEP | LUSH)) && !(m.bld && m.bld[i] >= 0) && !m.lake[i] && !(m.river && m.river[i]) && !designed(i);
  const others = (m.natureSites || []).map((s) => [s.x / TILE, s.y / TILE]);
  const far = (x, y, d) => !others.some(([ox, oy]) => (ox - x) * (ox - x) + (oy - y) * (oy - y) < d * d);
  // the pool's rim: its radius at angle a, lobed (a rock bowl is never round)
  const rimR = (R, a, s) => R * (1 + 0.16 * Math.sin(3 * a + s * 6.283) + 0.08 * Math.sin(5 * a + s * 11.7));
  // nothing in the way round (x, y) out to d tiles: no road, no water, nothing built, no designed ground
  const clearOf = (x, y, d) => {
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (dx * dx + dy * dy > d * d) continue;
      const X = x + dx, Y = y + dy;
      if (!inF(X, Y)) return false;
      const i = idx(X, Y), t = m.tiles[i];
      if (t === T.ROAD || t === T.WATER || t === T.DEEP || t === T.BRIDGE || t === T.BUILDING || t === T.LOT || t === T.SIDEWALK || t === T.PLAZA || t === T.DOCK) return false;
      if ((m.bld && m.bld[i] >= 0) || m.lake[i] || (m.river && m.river[i])) return false;
    }
    return true;
  };
  const P = [], solids = [], changed = new Set(), keep = new Set();   // (keep: the cliffs' faces, anchored at their feet - not cleared with the ground round a pool)
  const put = (t, x, y, r = 0, ex = null) => P.push([t, Math.round(x), Math.round(y), r, ex]);
  // lay one pool: the water, the ring round it (slickrock or cracked mud), its listing; returns its tiles' box
  const lay = (cx, cy, R, ring, s, look) => {
    const X = cx * TILE, Y = cy * TILE, reach = Math.ceil(R * 1.3 + ring) + 1;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, water = 0;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const tx = Math.floor(cx) + dx, ty = Math.floor(cy) + dy;
      if (!inF(tx, ty)) continue;
      const px = tx + 0.5 - cx, py = ty + 0.5 - cy, q = Math.sqrt(px * px + py * py), rr = rimR(R, Math.atan2(py, px), s), i = idx(tx, ty);
      if (q < rr) {
        m.tiles[i] = T.WATER; m.land[i] = 0; m.lake[i] = 2; if (m.river) m.river[i] = 0;
        m.reserve[i] = (m.reserve[i] | KEEP | RES) & ~LUSH; water++;
        x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty);
        changed.add(i);
      } else if (q < rr + ring && m.land[i] && OPEN.has(m.tiles[i])) {
        m.tiles[i] = T.DIRT; m.reserve[i] = (m.reserve[i] | KEEP | RES) & ~LUSH;
        changed.add(i);
      } else if (q < rr + ring + 1.5) changed.add(i);   // (the props just past the ring go too: the rim's own go on)
    }
    if (m.waters && Array.isArray(m.waters.lk)) m.waters.lk.push({ k: 'pond', t: look, box: [x0, y0, x1 + 1, y1 + 1] });
    (m.tinajas ||= []).push({ x: Math.round(X), y: Math.round(Y), r: Math.round(R * TILE), ring: Math.round(ring * TILE), k: look === 'marsh' ? 1 : 0 });
    return { water, box: [x0, y0, x1, y1] };
  };

  // ---- the tinajas, at the cliffs' feet --------------------------------------------------------------------------
  const faces = [];
  for (const p of m.props || []) {
    if (!p || p.t !== 'cliff' || !p.relief || !(p.w >= S.face * TILE)) continue;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (!inF(tx, ty) || !DS.has(m.dist[idx(tx, ty)])) continue;
    faces.push([p.x, p.y, p.w, hh(tx, ty, 7701)]);
    keep.add(p.x + ',' + p.y);
  }
  faces.sort((a, b) => a[3] - b[3]);
  const chosen = [];
  for (const [fx, fy, fw] of faces) {
    if (chosen.length >= S.n) break;
    const u = hh(fx, fy, 7702), R = S.r[0] + (S.r[1] - S.r[0]) * hh(fx, fy, 7703);
    const cx = fx / TILE + (u - 0.5) * (fw / TILE) * 0.4, cy = fy / TILE + S.off + R * 1.16;   // (its north rim just off the cliff's foot)
    const tx = Math.floor(cx), ty = Math.floor(cy);
    if (chosen.some((c) => (c[0] - cx) * (c[0] - cx) + (c[1] - cy) * (c[1] - cy) < S.apart * S.apart)) continue;
    if (!far(cx, cy, S.away)) continue;
    // open ground all round the bowl, level (within flat m), nothing built near
    const reach = Math.ceil(R * 1.3 + S.ring) + 1;
    let ok = true, lo = 255, hi = 0;
    for (let dy = -reach; dy <= reach && ok; dy++) for (let dx = -reach; dx <= reach; dx++) {
      if (dx * dx + dy * dy > reach * reach) continue;
      const X = tx + dx, Y = ty + dy;
      if (!inF(X, Y) || !DS.has(m.dist[idx(X, Y)])) { ok = false; break; }
      const i = idx(X, Y);
      if (!plain(i)) { ok = false; break; }
      if (m.relief) { lo = Math.min(lo, m.relief[i]); hi = Math.max(hi, m.relief[i]); }
    }
    if (!ok || hi - lo > S.flat || !clearOf(tx, ty, S.clear)) continue;
    chosen.push([cx, cy, R]);
  }
  for (const [cx, cy, R] of chosen) {
    const s = hh(Math.round(cx * 7), Math.round(cy * 7), 7704), X = cx * TILE, Y = cy * TILE, h = (j) => hh(Math.round(cx * 13), Math.round(cy * 13), 7710 + j);
    const { water } = lay(cx, cy, R, S.ring, s, 'forest');
    // sandstone boulders on the rim: the cliff's side and the flanks, the side down from the rock (south, give or take)
    // left open - the way down to the water
    const nb = 3 + Math.floor(h(0) * 4), open = Math.PI / 2 + (h(1) - 0.5) * 1.2;
    for (let j = 0; j < nb; j++) {
      const a = open + 0.9 + (j / Math.max(1, nb - 1)) * (2 * Math.PI - 1.8) + (h(2 + j) - 0.5) * 0.5, rr = rimR(R, a, s) + 0.8 + h(9 + j) * 0.7, sz = 16 + Math.round(h(16 + j) * 18);
      const bx = X + Math.cos(a) * rr * TILE, by = Y + Math.sin(a) * rr * TILE;
      put('boulder', bx, by, Math.round(sz * 0.45), { s: sz, style: 'sandstone' }); solids.push([bx, by, Math.round(sz * 0.45)]);
    }
    // a palo verde leaning over the water from one flank (its canopy north of its trunk, clear of the water), a cactus
    // or two in the rock
    const ta = (h(24) < 0.5 ? -0.35 : Math.PI + 0.35) + (h(25) - 0.5) * 0.5, tr = (rimR(R, ta, s) + 1.5 + h(26) * 0.6) * TILE;
    put('tree_a', X + Math.cos(ta) * tr, Y + Math.sin(ta) * tr, 12, { sp: 'paloVerde', k: 1.0 + h(27) * 0.25 });
    for (let j = 0; j < 1 + (h(28) < 0.5 ? 1 : 0); j++) {
      const ca = open + (j ? -1 : 1) * (0.9 + h(29 + j) * 0.5), cr = (rimR(R, ca, s) + 1.7 + h(31 + j)) * TILE;
      put('cactus', X + Math.cos(ca) * cr, Y + Math.sin(ca) * cr, 8, null);
    }
    m.natureSites.push({ kind: 'tinaja', x: Math.round(X), y: Math.round(Y), r: Math.round(R * TILE) });
    out.tinajas.push({ x: Math.round(cx), y: Math.round(cy), r: Math.round(R * 10) / 10, water });
  }

  // ---- the seep pools, in the dry wash below the dam -------------------------------------------------------------
  const Q = S.seeps, [bx0, by0, bx1, by1] = Q.box;
  const washAt = (i) => m.land[i] && (m.tiles[i] === T.SAND || m.tiles[i] === T.DIRT) && !(m.bld && m.bld[i] >= 0) && !m.lake[i] && !(m.river && m.river[i]) && !designed(i);
  const gravel = (i) => m.tiles[i] === T.SAND && (m.reserve[i] & (KEEP | LUSH)) === (KEEP | LUSH);
  const cands = [];
  for (let y = by0; y < by1; y += Q.step) for (let x = bx0; x < bx1; x += Q.step) {
    if (!inF(x, y) || !gravel(idx(x, y))) continue;
    // the wash's middle: gravel or the wash's dirt all round, out past the ring
    const reach = Math.ceil(Q.r[1] * 1.3 + Q.ring) + 1;
    let ok = true, g = 0;
    for (let dy = -reach; dy <= reach && ok; dy++) for (let dx = -reach; dx <= reach; dx++) {
      if (dx * dx + dy * dy > reach * reach) continue;
      const X = x + dx, Y = y + dy;
      if (!inF(X, Y)) { ok = false; break; }
      const i = idx(X, Y);
      if (!washAt(i)) { ok = false; break; }
      if (gravel(i)) g++;
    }
    if (ok && clearOf(x, y, reach + 2)) cands.push([x, y, g + hh(x, y, 7720)]);
  }
  cands.sort((a, b) => b[2] - a[2]);
  const seeps = [];
  for (const [x, y] of cands) {
    if (seeps.length >= Q.n) break;
    if (seeps.some((c) => (c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y) < Q.apart * Q.apart)) continue;
    seeps.push([x + 0.5, y + 0.5, Q.r[0] + (Q.r[1] - Q.r[0]) * hh(x, y, 7721)]);
  }
  for (const [cx, cy, R] of seeps) {
    const s = hh(Math.round(cx * 7), Math.round(cy * 7), 7722), X = cx * TILE, Y = cy * TILE, h = (j) => hh(Math.round(cx * 13), Math.round(cy * 13), 7730 + j);
    const { water } = lay(cx, cy, R, Q.ring, s, 'marsh');
    // reeds and cattails at the water's edge, a palo verde over it for shade
    const nr = 4 + Math.floor(h(0) * 3);
    for (let j = 0; j < nr; j++) {
      const a = h(1 + j) * Math.PI * 2, rr = rimR(R, a, s) + 0.35;
      put('shrub_a', X + Math.cos(a) * rr * TILE, Y + Math.sin(a) * rr * TILE, 0, { sp: h(10 + j) < 0.55 ? 'reeds' : 'cattails', k: 0.9 + h(20 + j) * 0.2 });
    }
    // (north of the water, so its canopy - drawn up from its trunk - leaves the pool in sight)
    const ta = -Math.PI / 2 + (h(30) - 0.5) * 1.4, tr = (rimR(R, ta, s) + 1.4) * TILE;
    put('tree_a', X + Math.cos(ta) * tr, Y + Math.sin(ta) * tr, 12, { sp: 'paloVerde', k: 1.1 + h(31) * 0.15 });
    m.natureSites.push({ kind: 'seep', x: Math.round(X), y: Math.round(Y), r: Math.round(R * TILE) });
    out.seeps.push({ x: Math.round(cx), y: Math.round(cy), r: Math.round(R * 10) / 10, water });
  }

  if (changed.size && H3.removeProps) H3.removeProps(m, (x, y) => changed.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)) && !keep.has(x + ',' + y));
  for (const [t, x, y, r, e] of P) H3.addProp(m, t, x, y, r, e);
  // (the boulders' solids: after the props are cleared - clearing them builds the solids again from the props)
  if (m.addSolidProp) for (const [x, y, r] of solids) m.addSolidProp(Math.round(x), Math.round(y), r);
  return out;
}
