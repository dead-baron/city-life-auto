// Designed nature places (docs/WORLD-V2.md "Nature is designed, not scattered"): each one is a small scene from
// the user's concepts, laid out by hand relative to the road it hangs off, so it lands in the same place every
// time and the rest of the world never shifts because of it (hash2 only, no shared random stream).
//
//   Redwood Creek (Highland Woods; concepts N1-C, N1-D, N1-E): Highland Road crosses a creek on a stone bridge.
//   Upstream the creek drops over a mossy ledge into a pool, with a campsite in the clearing beside it and a
//   footbridge below it; a picnic pull-off by the road with a trail to the falls; giant redwoods round it all.
//
// What the map gets: water tiles for the creek and pool (river water: land 0, river 1), dirt for the trail and the
// clearing, a gravel lot for the pull-off, dock planks for the footbridge, solid props (redwoods, boulders in the
// creek, the bridge parapets, the falls' rocks) and decoration props (camp furniture). m.natureSites lists each
// place with what the renderer draws on top (statics.js addNature): the bridge, the falls, the footbridge.
// Reserve bit 32 keeps the wilds' random trees off it.
import { T, TILE, MAP_W, MAP_H } from './constants.js';
import { hash2 } from './rng.js';

const RES = 32;
const at = (x, y) => Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE);
// distance from (x, y) to a polyline, and the parameter (0..1 along it) of the nearest point
function nearest(pts, x, y) {
  let best = 1e18, bs = 0, acc = 0, tot = 0;
  for (let i = 1; i < pts.length; i++) tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, L = Math.sqrt(l2);
    let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const d = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
    if (d < best) { best = d; bs = (acc + t * L) / tot; }
    acc += L;
  }
  return [Math.sqrt(best), bs];
}
// a smooth path through control points (Catmull-Rom, step px)
function spline(cp, step = 24) {
  const out = [];
  for (let i = 0; i < cp.length - 1; i++) {
    const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(cp[cp.length - 1].slice());
  return out;
}
const KEEP = new Set([T.ROAD, T.BRIDGE, T.BUILDING, T.WALL, T.SIDEWALK, T.PLAZA, T.LOT, T.FIELD, T.DOCK]);
// water along a path, its half-width hw(s) (s 0..1 along it); never over a road or anything built
function carveWater(m, pts, hw) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = 140, out = [];
  for (let ty = Math.floor((y0 - pad) / TILE); ty <= Math.floor((y1 + pad) / TILE); ty++) for (let tx = Math.floor((x0 - pad) / TILE); tx <= Math.floor((x1 + pad) / TILE); tx++) {
    if (tx < 1 || ty < 1 || tx >= MAP_W - 1 || ty >= MAP_H - 1) continue;
    const i = ty * MAP_W + tx, [d, s] = nearest(pts, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
    if (d > hw(s) || KEEP.has(m.tiles[i])) continue;
    m.tiles[i] = T.WATER; m.land[i] = 0; m.river[i] = 1; m.reserve[i] |= RES;
    out.push(i);
  }
  return out;
}
function paint(m, x, y, r, tile, ok = (t) => t === T.GRASS || t === T.DIRT) {
  for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++) for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
    const i = ty * MAP_W + tx;
    if (Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > r || !ok(m.tiles[i])) continue;
    m.tiles[i] = tile; m.reserve[i] |= RES;
  }
}
function reserveRound(m, x, y, r) {
  for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++) for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
    if (Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) <= r) m.reserve[ty * MAP_W + tx] |= RES;
  }
}
// a path of dirt (a hiking trail) from a to b through c... (tiles under it, 1.5 tiles wide)
function trail(m, cp) {
  const pts = spline(cp, 16);
  for (const [x, y] of pts) paint(m, x, y, 26, T.DIRT, (t) => t === T.GRASS || t === T.DIRT || t === T.SAND);
  return pts;
}

// H: { addProp(m, t, x, y, solidR, extra) }
export function buildNatureSites(m, H) {
  m.natureSites = [];
  redwoodCreek(m, H);
  canyonOasis(m, H);
}

// ---- the oasis in Red Rock Canyon (concepts N4-B, N4-C) ------------------------------------------------------
// The canyon's mesas are the scene painting's solid tiles (map.js buildScenePaintings), raised by the renderer
// (statics.js makeMesas). Under the big north mesa's south face: a spring falls down the cliff into a pool ringed
// with palms, reeds and ferns.
function canyonOasis(m, H) {
  const pt = (m.paintings || []).find((p) => p.key === 'canyon');
  if (!pt) return;
  const T0 = (tx, ty) => [pt.x + tx * TILE, pt.y + ty * TILE];
  const [cx, cy] = T0(26.5, 8.1), rx = 104, ry = 50;
  const pool = [];
  for (let ty = Math.floor((cy - ry - 8) / TILE); ty <= Math.floor((cy + ry + 8) / TILE); ty++) for (let tx = Math.floor((cx - rx - 8) / TILE); tx <= Math.floor((cx + rx + 8) / TILE); tx++) {
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, a = Math.atan2(y - cy, x - cx), wob = 1 + Math.sin(a * 3 + 1.3) * 0.12;
    if (((x - cx) / (rx * wob)) ** 2 + ((y - cy) / (ry * wob)) ** 2 > 1) continue;
    const i = ty * MAP_W + tx;
    if (m.tiles[i] !== T.DIRT && m.tiles[i] !== T.GRASS && m.tiles[i] !== T.SAND) continue;
    m.tiles[i] = T.WATER; m.land[i] = 0; m.river[i] = 1; m.reserve[i] |= RES; pool.push(i);
  }
  if (!pool.length) return;
  // the spring: down the cliff behind the pool (its foot at the face, which is solid rock)
  const fx = cx - 6, fy = pt.y + 6 * TILE + 6;
  // palms round it (solid trunks), reeds and cattails at the water, ferns and a few sandstone boulders
  for (const [dx, dy, sp, k] of [[-150, -16, 'date', 1.4], [146, -22, 'desertFan', 1.45], [-168, 40, 'desertFan', 1.15], [150, 44, 'date', 1.2], [-118, 72, 'banana', 0.9]]) {
    H.addProp(m, 'palm_a', Math.round(cx + dx), Math.round(cy + dy), sp === 'banana' ? 0 : 10, { sp, k });
  }
  for (const [dx, dy, sp] of [[-112, 22, 'cattails'], [-96, 48, 'reeds'], [104, 34, 'cattails'], [118, 8, 'reeds'], [64, 58, 'reeds'], [-46, 60, 'cattails'], [-124, -14, 'fern'], [128, -10, 'fern'], [-60, -44, 'fern'], [70, -46, 'elephant']]) {
    H.addProp(m, 'shrub_a', Math.round(cx + dx), Math.round(cy + dy), 0, { sp, k: 1 });
  }
  for (const [dx, dy, r] of [[-190, 4, 16], [186, 16, 14], [10, 74, 12], [-150, 92, 12]]) H.addProp(m, 'boulder', Math.round(cx + dx), Math.round(cy + dy), r, { s: r * 2 + 6 });
  (m.landmarks ||= []).push({ name: 'Canyon Oasis', type: 'oasis', x: Math.round(cx - 220), y: Math.round(cy - 160), w: 440, h: 300 });
  m.natureSites.push({ kind: 'oasis', name: 'Canyon Oasis', x: Math.round(cx), y: Math.round(cy), spring: { x: Math.round(fx), y: Math.round(fy), w: 18, h: 104 } });
}

// ---- Redwood Creek ------------------------------------------------------------------------------------------
function redwoodCreek(m, H) {
  // where Highland Road runs straight through the redwoods, north-north-west
  const road = (m.roads || []).find((r) => r.kind === 'rural' && r.name === 'Highland Road' && r.pts.some((p) => Math.abs(p.x - 6714) < 200 && Math.abs(p.y - 6055) < 260));
  if (!road) return;
  let C = null, best = 1e9;
  for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(mx - 6714, my - 6055);
    if (d < best && Math.hypot(b.x - a.x, b.y - a.y) > 300) { best = d; C = { x: mx, y: my, a: Math.atan2(b.y - a.y, b.x - a.x) }; }
  }
  if (!C) return;
  const ux = Math.cos(C.a), uy = Math.sin(C.a), nx = -uy, ny = ux;   // along the road (to the NNW); n: to the ENE
  const RW = (road.hw || 64);                                         // half the road's width
  const P = (s, t) => [C.x + ux * s + nx * t, C.y + uy * s + ny * t]; // a point s along the road, t off it (ENE +)
  // the falls: up the creek to the north-east, facing south (the water falls toward you); the pool below
  const F = [C.x + 210, C.y - 560], pool = [F[0] + 6, F[1] + 96];
  // the creek: from the woods to the north, over the falls, through the pool, south-west under the road and on
  const up = spline([[F[0] + 60, F[1] - 620], [F[0] + 10, F[1] - 380], [F[0] - 20, F[1] - 170], [F[0], F[1] - 20]]);
  const down = spline([[pool[0], pool[1] + 70], [pool[0] - 40, pool[1] + 230], [C.x + nx * 150 + 20, C.y + ny * 150 - 30], [C.x, C.y], [C.x - nx * 170 - 30, C.y - ny * 170 + 40], [C.x - 470, C.y + 420], [C.x - 620, C.y + 760]]);
  const w = (s, base, amp, seed) => base + amp * (Math.sin(s * 19 + seed) * 0.5 + Math.sin(s * 7.3 + seed * 2) * 0.5);
  carveWater(m, up, (s) => w(s, 30, 7, 1) + s * 8);
  carveWater(m, down, (s) => w(s, 44, 9, 4));
  // the pool: an oval, a little deeper (wider) than the creek
  const poolPts = [];
  for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2; poolPts.push([pool[0] + Math.cos(a) * (96 + Math.sin(a * 3) * 10), pool[1] + Math.sin(a) * (62 + Math.cos(a * 2) * 8)]); }
  const poolTiles = carveWater(m, poolPts.concat([pool]), () => 34);
  // fill the oval's inside too (carveWater only follows its rim): every tile inside the ellipse
  for (let ty = Math.floor((pool[1] - 72) / TILE); ty <= Math.floor((pool[1] + 72) / TILE); ty++) for (let tx = Math.floor((pool[0] - 110) / TILE); tx <= Math.floor((pool[0] + 110) / TILE); tx++) {
    const i = ty * MAP_W + tx, dx = ((tx + 0.5) * TILE - pool[0]) / 104, dy = ((ty + 0.5) * TILE - pool[1]) / 68;
    if (dx * dx + dy * dy > 1 || KEEP.has(m.tiles[i])) continue;
    m.tiles[i] = T.WATER; m.land[i] = 0; m.river[i] = 1; m.reserve[i] |= RES; poolTiles.push(i);
  }
  // the bridge: the parapets along both edges of the road where the creek runs under it (solid)
  const span = 120;   // half the length of the bridge along the road
  for (const side of [-1, 1]) for (let s = -span; s <= span; s += 20) { const [x, y] = P(s, side * (RW + 6)); m.addSolidProp(x, y, 8); }
  // the falls (the renderer's basalt ledge, ~170 px across): solid along the ledge, a mossy boulder past each end
  for (let dx = -86; dx <= 86; dx += 16) m.addSolidProp(F[0] + dx, F[1] - 8, 10);
  for (const [dx, r] of [[-116, 24], [118, 21]]) H.addProp(m, 'boulder', F[0] + dx, F[1] - 4, r, { s: r * 2 + 6, moss: 1 });
  // boulders in the creek and on its banks: big mossy ones you steer round
  const rocks = [[0.18, -8, 15], [0.3, 30, 13], [0.45, -30, 17], [0.62, 26, 12], [0.78, -18, 15], [0.9, 30, 13]];
  for (const [s, off, r] of rocks) {
    const i = Math.min(down.length - 2, Math.floor(s * (down.length - 1))), p = down[i], q = down[i + 1], dl = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const x = p[0] - (q[1] - p[1]) / dl * off, y = p[1] + (q[0] - p[0]) / dl * off;
    if (Math.abs((x - C.x) * nx + (y - C.y) * ny) < RW + 60 && Math.abs((x - C.x) * ux + (y - C.y) * uy) < span + 40) continue; // (not by the bridge)
    H.addProp(m, 'boulder', x, y, r, { s: r * 2 + 4, moss: 1 });
  }
  for (const [s, off, r] of [[0.25, -10, 12], [0.55, 14, 11], [0.8, -6, 13]]) { const p = up[Math.floor(s * (up.length - 1))]; H.addProp(m, 'boulder', p[0] + off, p[1], r, { s: r * 2 + 4, moss: 1 }); }
  // a mossy log fallen across the creek above the falls
  { const p = up[Math.floor(up.length * 0.45)]; H.addProp(m, 'log', p[0], p[1], 0, { a: 0.18, len: 130, moss: 1 }); for (const k of [-0.36, 0, 0.36]) m.addSolidProp(p[0] + Math.cos(0.18) * 130 * k, p[1] + Math.sin(0.18) * 130 * k * 0.7, 11); }
  // the footbridge below the pool: dock planks across the creek, a trail at both ends
  const fbI = Math.floor(down.length * 0.08) + 2, fb = down[Math.min(down.length - 1, fbI)], fbN = down[Math.min(down.length - 1, fbI + 1)];
  const ca = Math.atan2(fbN[1] - fb[1], fbN[0] - fb[0]), bx = -Math.sin(ca), by = Math.cos(ca);   // across the creek
  for (let s = -84; s <= 84; s += 12) for (let t = -14; t <= 14; t += 12) {
    const i = at(fb[0] + bx * s + Math.cos(ca) * t, fb[1] + by * s + Math.sin(ca) * t);
    if (m.tiles[i] === T.WATER) { m.tiles[i] = T.DOCK; m.reserve[i] |= RES; }
  }
  // the clearing by the pool (east), the campsite in it
  const camp = [pool[0] + 300, pool[1] + 30];
  paint(m, camp[0], camp[1], 150, T.DIRT);
  reserveRound(m, camp[0], camp[1], 190);
  H.addProp(m, 'campfire', camp[0], camp[1] + 10, 0, { lit: 1 });
  H.addProp(m, 'log', camp[0] - 4, camp[1] - 40, 0, { a: 0, len: 80, seat: 1 });
  H.addProp(m, 'log', camp[0] + 54, camp[1] + 22, 0, { a: 1.57, len: 80, seat: 1 });
  H.addProp(m, 'tent', camp[0] - 90, camp[1] - 64, 0, { v: 1 });
  H.addProp(m, 'tent', camp[0] + 70, camp[1] - 80, 0, { v: 0 });
  H.addProp(m, 'picnic', camp[0] - 96, camp[1] + 54, 0);
  H.addProp(m, 'mapboard', camp[0] + 110, camp[1] + 70, 0);
  H.addProp(m, 'lantern', camp[0] - 40, camp[1] + 80, 0);
  // the picnic pull-off by the road (west side, below the bridge), a trail from it up the creek to the falls
  const [qx, qy] = P(-300, -(RW + 70));
  for (let ty = Math.floor((qy - 60) / TILE); ty <= Math.floor((qy + 60) / TILE); ty++) for (let tx = Math.floor((qx - 90) / TILE); tx <= Math.floor((qx + 90) / TILE); tx++) {
    const i = ty * MAP_W + tx; if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) { m.tiles[i] = T.LOT; m.reserve[i] |= RES; }
  }
  H.addProp(m, 'picnic', qx - 40, qy - 30, 0);
  H.addProp(m, 'trashcan', qx + 46, qy - 40, 6);
  H.addProp(m, 'mapboard', qx + 70, qy + 20, 0);
  const tr = trail(m, [P(-300, -(RW + 150)), P(-120, -(RW + 260)), [fb[0] - bx * 120, fb[1] - by * 120]]);
  const tr2 = trail(m, [[fb[0] + bx * 110, fb[1] + by * 110], [camp[0] - 130, camp[1] + 40]]);
  // giant redwoods round the bridge and the falls (the wilds add their own further out)
  const giants = [P(140, RW + 120), P(-60, RW + 190), P(260, -(RW + 110)), P(-180, -(RW + 220)), [F[0] - 190, F[1] - 40], [F[0] + 190, F[1] - 70], [pool[0] - 220, pool[1] + 150], [camp[0] + 170, camp[1] - 150], [C.x - 330, C.y + 160]];
  for (const [x, y] of giants) {
    const i = at(x, y);
    if (m.tiles[i] !== T.GRASS && m.tiles[i] !== T.DIRT) continue;
    H.addProp(m, 'tree_a', Math.round(x), Math.round(y), 14, { sp: 'redwood', k: 1.45 + hash2(Math.round(x), Math.round(y), 5) * 0.2 });
    reserveRound(m, x, y, 50);
  }
  // keep the wilds' trees off the banks a little (ferns grow there instead)
  for (const p of up.concat(down)) reserveRound(m, p[0], p[1], 64);
  // on the map and in the debug teleport: the falls, the pool and the camp
  (m.landmarks ||= []).push({ name: 'Redwood Creek Falls', type: 'falls', x: Math.round(pool[0] - 260), y: Math.round(F[1] - 160), w: 820, h: 460 });
  m.natureSites.push({
    kind: 'creek', name: 'Redwood Creek', x: Math.round(C.x), y: Math.round(C.y),
    bridge: { x: C.x, y: C.y, a: C.a, half: span, roadHw: RW },
    falls: { x: F[0], y: F[1], w: 100, drop: 34 }, pool: { x: pool[0], y: pool[1] },
    footbridge: { x: fb[0], y: fb[1], a: Math.atan2(by, bx), len: 176 },
    camp: { x: camp[0], y: camp[1] }, pulloff: { x: qx, y: qy }, trails: [tr.length, tr2.length],
  });
}
