// The Egret Marsh Boardwalk (Nature-C3, 2026-10-20: the concept's timber boardwalk out over the marsh) - World v3's
// Egret Coast marsh (world3-waterbodies.js MARSH_BOX) gets its walk: from a trailhead by a county road (a map board,
// a split-rail fence along the path in), a plank boardwalk with rails zig-zags out over the channels and the reed
// islands; a roofed bird hide on piles at a bend; a viewing platform at the far end with a bench and a coin
// telescope; a canoe dock near the start with two canoes; a beaver lodge out in the water and, where a channel runs
// narrow, the beavers' dam with its little fall; lily pads in the quiet water and cattails and reeds on the islands'
// edges. The herons, the ducks and the fish are the marsh's own (wildlife.js, client/art2/game/waterlife.js). Laid in
// the World v3 build's last step (world3-world.js done), on tiles that are still open marsh water or open ground: the
// boardwalk's and the platform's planks are walkable decks (bridge tiles over the water, dock tiles on the reed
// islands), the path in is dirt.
// Integer hashes, and the trigonometry only inside generateCity (withDeterministicMath, CLAUDE.md: the same world in
// every engine).
import { T, TILE } from './constants.js';
import { MARSH_BOX } from './world3-waterbodies.js';

export const MARSH = { name: 'Egret Marsh Boardwalk', district: 53, seg: [6, 14], segs: 6, turn: [0.75, -0.95, 0.85, -0.7, 0.9], plat: [7, 5] };
const RES = 32;
const ih = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const COS = (a) => Math.cos(a), SIN = (a) => Math.sin(a);   // (called inside generateCity, under withDeterministicMath: shared/dmath.js)

// removeProps(m, (x, y) => drop?) from the build (world3-world.js done's H3); addProp pushes a prop
export function buildMarshBoardwalk3(m, removeProps) {
  const W = m.w, H = m.h, out = { built: false };
  const inF = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const idx = (x, y) => (inF(x, y) ? y * W + x : -1);
  const inBox = (x, y) => x >= MARSH_BOX[0] && x <= MARSH_BOX[2] && y >= MARSH_BOX[1] && y <= MARSH_BOX[3];
  const marshWater = (i, x, y) => i >= 0 && m.tiles[i] === T.WATER && m.river[i] && inBox(x, y);
  const openGround = (i) => i >= 0 && m.land[i] && !m.reserve[i] && (m.bld ? m.bld[i] < 0 : true) && (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND);
  const builtish = (t) => t === T.ROAD || t === T.BRIDGE || t === T.BUILDING || t === T.SIDEWALK || t === T.LOT || t === T.PLAZA || t === T.DOCK || t === T.FLOOR;
  // 1. the site: a point a few tiles off a county road through the Egret Coast, with the most open marsh water out
  // beyond it in a 36-tile box, the water's edge within a dozen tiles
  let best = null;
  for (const e of m.edges || []) {
    if (e.lvl !== 0 || !['art', 'rural', 'dirt', 'minor', 'st'].includes(e.kind) || !e.pts || e.pts.length < 2) continue;
    const hw = (e.hw || 48) / TILE;
    for (let k = 1; k < e.pts.length; k++) {
      const a = e.pts[k - 1], b = e.pts[k], dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy) / TILE;
      if (L < 1) continue;
      const tx = dx / TILE / L, ty = dy / TILE / L;
      for (let s = 0; s < L; s += 4) {
        const qx = a.x / TILE + tx * s, qy = a.y / TILE + ty * s;
        if (!inBox(qx, qy)) continue;
        for (const side of [1, -1]) {
          const nx = -ty * side, ny = tx * side, sx = Math.round(qx + nx * (hw + 4)), sy = Math.round(qy + ny * (hw + 4)), si = idx(sx, sy);
          if (!openGround(si) || m.dist[si] !== MARSH.district) continue;
          let shore = -1;
          for (let d = 1; d <= 12 && shore < 0; d++) { const x = Math.round(sx + nx * d), y = Math.round(sy + ny * d); if (marshWater(idx(x, y), x, y)) shore = d; }
          if (shore < 0) continue;
          const cx = sx + nx * 22, cy = sy + ny * 22;
          let wat = 0, bad = 0;
          for (let y = Math.round(cy - 18); y <= cy + 18; y += 2) for (let x = Math.round(cx - 18); x <= cx + 18; x += 2) { const i = idx(x, y); if (i < 0) { bad++; continue; } if (marshWater(i, x, y)) wat++; else if (builtish(m.tiles[i])) bad++; }
          const score = wat - bad * 6 - shore * 2 + ih(sx, sy, 3) * 0.5;
          if (!best || score > best.score) best = { score, sx, sy, nx, ny, shore };
        }
      }
    }
  }
  if (!best || best.score < 60) return out;
  const { sx, sy } = best;
  let hd = Math.atan2(best.ny, best.nx);
  // 2. the boardwalk's line: out from the trailhead to the water and on, zig-zagging - each leg 6-14 tiles over open
  // marsh water or open ground (the reed islands), turning one way and then the other
  const legOk = (x0, y0, x1, y1) => {
    const n = Math.ceil(Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) * 2);
    for (let j = 1; j <= n; j++) {
      const x = x0 + (x1 - x0) * j / n, y = y0 + (y1 - y0) * j / n;
      for (const o of [-1, 0, 1]) { const px = Math.round(x + o * -SIN(hd) * 1.2), py = Math.round(y + o * COS(hd) * 1.2), i = idx(px, py); if (i < 0 || !(marshWater(i, px, py) || openGround(i)) || !inBox(px, py)) return false; }
    }
    return true;
  };
  const pts = [[sx + 0.5, sy + 0.5]];
  // the first leg: on to a few tiles past the water's edge
  { const L = Math.min(MARSH.seg[1], Math.max(MARSH.seg[0], best.shore + 4)), x1 = pts[0][0] + COS(hd) * L, y1 = pts[0][1] + SIN(hd) * L; if (!legOk(pts[0][0], pts[0][1], x1, y1)) return out; pts.push([x1, y1]); }
  for (let k = 0; k < MARSH.segs - 1; k++) {
    const p = pts[pts.length - 1], L = MARSH.seg[0] + Math.round(ih(k, Math.round(p[0]), 7) * (MARSH.seg[1] - MARSH.seg[0]));
    let ok = false;
    for (const sgn of [1, -1]) {
      const h2 = hd + MARSH.turn[k % MARSH.turn.length] * sgn, x1 = p[0] + COS(h2) * L, y1 = p[1] + SIN(h2) * L;
      if (legOk(p[0], p[1], x1, y1)) { hd = h2; pts.push([x1, y1]); ok = true; break; }
    }
    if (!ok) break;
  }
  // the walk ends out over the water (the platform stands there): a last leg that came ashore on the far bank goes
  const wetAt = (q) => { const x = Math.floor(q[0]), y = Math.floor(q[1]); return marshWater(idx(x, y), x, y); };
  while (pts.length > 4 && !wetAt(pts[pts.length - 1])) pts.pop();
  if (pts.length < 4 || !wetAt(pts[pts.length - 1])) return out;
  // 3. the planks: two wide along each leg (walkable over the water), the boardwalk's rails drawn over them
  const deck = new Set();
  const walk = new Set();   // (the legs' planks: the boardwalk's model stands over them, the bake draws the marsh under - m.walkways)
  // (over the water a plank is a bridge tile - a deck walked onto from the boardwalk, the marsh still under it, so its
  // channels stay one water and the bake draws the marsh there; over a reed island it's a dock tile, and a leg's are
  // listed for the bake to draw the island under the boardwalk: m.walkways)
  const plank = (x, y, leg = false) => {
    const i = idx(x, y); if (i < 0) return;
    const wet = m.tiles[i] === T.WATER || (m.tiles[i] === T.BRIDGE && !m.land[i]);
    if (!(wet || openGround(i) || m.tiles[i] === T.DOCK)) return;
    if (wet) { m.tiles[i] = T.BRIDGE; walk.delete(i); }
    else { if (leg && m.tiles[i] !== T.DOCK) walk.add(i); else if (!leg) walk.delete(i); m.tiles[i] = T.DOCK; }
    m.reserve[i] |= RES; deck.add(i);
  };
  const props = [];
  const P = (t, x, y, ex) => { const p = { t, x: Math.round(x), y: Math.round(y), ...ex }; props.push(p); return p; };   // (laid at the end, once the planks are cleared)
  const solids = [], solid = (x, y, r) => solids.push([x, y, r]);
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy), ux = dx / L, uy = dy / L;
    for (let s = -0.6; s <= L + 0.6; s += 0.4) for (const o of [-0.4, 0.4]) plank(Math.floor(x0 + ux * s - uy * o), Math.floor(y0 + uy * s + ux * o), true);
    P('boardwalk', (x0 + x1) / 2 * TILE, (y0 + y1) / 2 * TILE, { len: Math.round(L * TILE + 40), w: 48, a: Math.atan2(uy, ux) });
  }
  const last = pts[pts.length - 1], prev = pts[pts.length - 2], la = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
  // 4. the bird hide: on piles beside the boardwalk at its third bend, its viewing slot to the open water
  const hb = pts[Math.min(3, pts.length - 2)], hp = pts[Math.min(2, pts.length - 3)], ha = Math.atan2(hb[1] - hp[1], hb[0] - hp[0]);
  const hx = hb[0] - SIN(ha) * 2.2, hy = hb[1] + COS(ha) * 2.2;
  for (let y = Math.floor(hy - 1.5); y <= hy + 1.5; y++) for (let x = Math.floor(hx - 1.5); x <= hx + 1.5; x++) plank(x, y);
  P('birdhide', hx * TILE, hy * TILE, { a: ha });
  solid(hx * TILE, hy * TILE - 4, 26);
  // 5. the viewing platform at the far end: a square deck square to the compass, out from the walk's end over the water
  // (5 x 5 tiles, or 4 x 4 where that's all the water there is), a bench and the coin telescope on it looking out
  const qd = Math.round(la / (Math.PI / 2)), qa = qd * Math.PI / 2, ux = Math.round(COS(qa)), uy = Math.round(SIN(qa));
  let plat = null;
  for (const n of [5, 4]) {
    const cells = [];
    for (let a2 = 0; a2 < n; a2++) for (let b2 = 0; b2 < n; b2++) { const u = a2 + 0.5, v = b2 - (n - 1) / 2; cells.push([Math.floor(last[0] + ux * u - uy * v), Math.floor(last[1] + uy * u + ux * v)]); }
    if (cells.every(([x, y]) => { const i = idx(x, y); return marshWater(i, x, y) || deck.has(i); })) { plat = { n, cells }; break; }
  }
  let pcx = last[0], pcy = last[1];
  if (plat) {
    for (const [x, y] of plat.cells) plank(x, y, true);
    pcx = last[0] + ux * (plat.n / 2 + 0.5); pcy = last[1] + uy * (plat.n / 2 + 0.5);
    P('viewdeck', pcx * TILE, pcy * TILE, { len: plat.n * TILE, w: plat.n * TILE, a: qa });
    P('scope', (pcx + ux * (plat.n / 2 - 1) - uy * 0.9) * TILE, (pcy + uy * (plat.n / 2 - 1) + ux * 0.9) * TILE, { a: qa, lift: 8 });
    P('pbench', (pcx - uy * (plat.n / 2 - 1)) * TILE, (pcy + ux * (plat.n / 2 - 1)) * TILE, { a: qa + Math.PI / 2, lift: 8 });
  }
  // 6. the canoe dock: off the first leg where it reaches the water, a short pier out to the side, two canoes by it
  const c0 = pts[1], c1 = pts[0], ca = Math.atan2(c0[1] - c1[1], c0[0] - c1[0]);
  let canoes = 0;
  for (const side of [1, -1]) {
    const bx = c0[0] - SIN(ca) * side * 1.2, by = c0[1] + COS(ca) * side * 1.2, ux = -SIN(ca) * side, uy = COS(ca) * side;
    let ok = true;
    for (let s = 0; s <= 4 && ok; s++) { const x = Math.floor(bx + ux * s), y = Math.floor(by + uy * s), i = idx(x, y); if (!(marshWater(i, x, y) || deck.has(i))) ok = false; }
    if (!ok) continue;
    for (let s = 0; s <= 4; s++) plank(Math.floor(bx + ux * s), Math.floor(by + uy * s));
    P('pier', (bx + ux * 2.2) * TILE, (by + uy * 2.2) * TILE, { len: 5 * TILE, w: 30, a: Math.atan2(uy, ux) });
    for (const o of [-1.4, 1.4]) { const x = bx + ux * 2.6 + COS(ca) * o, y = by + uy * 2.6 + SIN(ca) * o, i = idx(Math.floor(x), Math.floor(y)); if (marshWater(i, Math.floor(x), Math.floor(y))) { P('canoe', x * TILE, y * TILE, { a: Math.atan2(uy, ux), c: canoes % 3 }); canoes++; } }
    break;
  }
  // 7. the beavers: their lodge in the water off the platform; their dam across a narrow channel near it (a run of
  // 3-6 tiles of water across, east to west, land at both ends), with a step down in the water below it
  let lodge = null, dam = null;
  for (let r = 6; r <= 18 && !lodge; r += 2) for (let k = 0; k < 16 && !lodge; k++) {
    const a = k * Math.PI / 8, x = Math.round(pcx + COS(a) * r), y = Math.round(pcy + SIN(a) * r), i = idx(x, y);
    if (!marshWater(i, x, y) || deck.has(i)) continue;
    let landN = 0;
    for (const j of [i - 2, i + 2, i - 2 * W, i + 2 * W]) if (j >= 0 && m.land[j] && m.tiles[j] !== T.DOCK) landN++;
    if (landN >= 1) lodge = [x, y];
  }
  if (lodge) P('lodge', (lodge[0] + 0.5) * TILE, (lodge[1] + 0.5) * TILE, {});
  for (let r = 8; r <= 36 && !dam; r += 2) for (let k = 0; k < 24 && !dam; k++) {
    const a = k * Math.PI / 12, x = Math.round(pcx + COS(a) * r), y = Math.round(pcy + SIN(a) * r);
    if (!marshWater(idx(x, y), x, y)) continue;
    let w0 = x, w1 = x;
    while (w0 - 1 >= 0 && marshWater(idx(w0 - 1, y), w0 - 1, y)) w0--;
    while (w1 + 1 < W && marshWater(idx(w1 + 1, y), w1 + 1, y)) w1++;
    const wd = w1 - w0 + 1;
    if (wd < 3 || wd > 6 || !openGround(idx(w0 - 1, y)) || !openGround(idx(w1 + 1, y))) continue;
    if (![...deck].every((i) => Math.abs((i % W) - x) > 8 || Math.abs(Math.floor(i / W) - y) > 8)) continue;
    dam = [w0, w1, y];
  }
  if (dam) {
    const [w0, w1, y] = dam, cx = (w0 + w1 + 1) / 2 * TILE;
    P('beaverdam', cx, (y + 0.5) * TILE, { len: (w1 - w0 + 3) * TILE });
    for (let x = w0 - 1; x <= w1 + 1; x++) solid((x + 0.5) * TILE, (y + 0.5) * TILE, 12);
  }
  // 8. lily pads in the quiet water near the walk, cattails and reeds on the islands' edges
  let lilies = 0, reeds = 0;
  const X0 = Math.round(Math.min(...pts.map((p) => p[0])) - 14), X1 = Math.round(Math.max(...pts.map((p) => p[0])) + 14), Y0 = Math.round(Math.min(...pts.map((p) => p[1])) - 14), Y1 = Math.round(Math.max(...pts.map((p) => p[1])) + 14);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const i = idx(x, y);
    if (i < 0 || deck.has(i)) continue;
    const near = [...[-2, 2].map((d) => idx(x + d, y)), ...[-2, 2].map((d) => idx(x, y + d))].some((j) => deck.has(j));
    if (near) continue;
    if (marshWater(i, x, y) && lilies < 18 && ih(x, y, 21) < 0.035) { P('lily', (x + 0.5) * TILE, (y + 0.5) * TILE, { v: lilies % 4 }); lilies++; }
    else if (openGround(i) && reeds < 90 && [i - 1, i + 1, i - W, i + W].some((j) => j >= 0 && m.tiles[j] === T.WATER) && ih(x, y, 22) < 0.5) {
      const r = ih(x, y, 23), sp = r < 0.5 ? 'cattails' : r < 0.9 ? 'reeds' : 'tallGrass';
      P('shrub_a', (x + 0.2 + ih(x, y, 24) * 0.6) * TILE, (y + 0.2 + ih(x, y, 25) * 0.6) * TILE, { sp, k: 1 }); reeds++;
    }
  }
  // 9. the way in: a dirt path from the road to the boardwalk's foot, a split-rail fence along one side, the map board
  // at the trailhead
  const rx = sx - best.nx * 3, ry = sy - best.ny * 3;
  for (let s = 0; s <= 4; s += 0.5) for (const o of [-0.6, 0.6]) { const x = Math.floor(rx + best.nx * s - best.ny * o), y = Math.floor(ry + best.ny * s + best.nx * o), i = idx(x, y); if (openGround(i)) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; deck.add(i); } }
  const fx = (sx + 0.5 + best.ny * 1.6) * TILE, fy = (sy + 0.5 - best.nx * 1.6) * TILE;
  P('fenceline', fx - best.nx * 3 * TILE, fy - best.ny * 3 * TILE, { kind: 'wood', tx: Math.round(best.nx * 6 * TILE), ty: Math.round(best.ny * 6 * TILE) });
  P('mapboard', (sx + 0.5 - best.ny * 2.2 - best.nx * 1.5) * TILE, (sy + 0.5 + best.nx * 2.2 - best.ny * 1.5) * TILE, {});
  // nothing the woods or the dressing put on the planks, the path or the platform; then the walk's own things
  if (removeProps) removeProps(m, (x, y) => deck.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
  for (const p of props) m.props.push(p);
  (m.walkways ||= []).push(...walk);   // (the ground bake draws what's under a boardwalk's legs, not the dock's planks: groundbake.js)
  if (m.addSolidProp) for (const [x, y, r] of solids) m.addSolidProp(x, y, r);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const box = [Math.min(...xs) - 12, Math.min(...ys) - 12, Math.max(...xs) + 12, Math.max(...ys) + 12];
  (m.landmarks ||= []).push({ name: MARSH.name, type: 'marsh', x: box[0] * TILE, y: box[1] * TILE, w: (box[2] - box[0]) * TILE, h: (box[3] - box[1]) * TILE });
  (m.natureSites ||= []).push({ kind: 'marsh', name: MARSH.name, x: Math.round(last[0] * TILE), y: Math.round(last[1] * TILE), boardwalk: pts.map((p) => [Math.round(p[0] * TILE), Math.round(p[1] * TILE)]), hide: { x: Math.round(hx * TILE), y: Math.round(hy * TILE) }, ...(lodge ? { lodge: { x: (lodge[0] + 0.5) * TILE, y: (lodge[1] + 0.5) * TILE } } : {}), ...(dam ? { dam: { x: (dam[0] + dam[1] + 1) / 2 * TILE, y: (dam[2] + 0.5) * TILE } } : {}) });
  Object.assign(out, { built: true, legs: pts.length - 1, at: [sx, sy], planks: deck.size, canoes, lodge: !!lodge, dam: !!dam, lilies, reeds });
  return out;
}
